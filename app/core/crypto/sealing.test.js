/**
 * SEALING — the narrowness, and the binding that makes a ciphertext non-portable.
 *
 * Two things are proven here that are easy to state and easy to lose. First, that exactly the
 * three declared clinical fields become ciphertext and nothing else does — the narrowness is
 * what caps the blast radius of key loss, so a test that let it widen would let the design's
 * central reassurance quietly stop being true. Second, that a sealed value opens ONLY in the
 * record and field it was written for, because portable ciphertext is how a clinical note ends
 * up attached to the wrong person.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { ALL_ENCRYPTED_FIELD_NAMES, ENCRYPTED_FIELDS, checkSealed, isSealed } from '../model/sealed.js';
import { Collector } from '../model/issues.js';
import { generateDataKey } from './primitives.js';
import { additionalDataFor, openContent, openField, sealContent, sealField } from './sealing.js';
import { CryptoInvalidRequest } from './errors.js';

const CTX = { type: 'client', recordId: 'client-3', field: 'clinical_note' };

/** A client's content as the coach actually enters it: mostly plaintext, three clinical fields. */
function clientContent() {
  return {
    name: 'A. Client',
    general_notes: 'prefers morning sessions',
    adaptation_flag: 'needs modification',
    clinical_note: 'knee injury — avoid deep squats',
    clinical_reference: 'file:///C:/records/knee.pdf',
    clinical_reference_label: 'cardiac-history.pdf',
  };
}

test('exactly the three declared fields are sealed, and everything else is untouched', async () => {
  const dataKey = await generateDataKey();
  const before = clientContent();

  const after = await sealContent(dataKey, { type: 'client', recordId: 'client-3' }, before);

  for (const field of ENCRYPTED_FIELDS.client) {
    assert.ok(isSealed(after[field]), `${field} must be ciphertext`);
  }
  assert.equal(after.name, before.name);
  assert.equal(after.general_notes, before.general_notes);
  assert.equal(after.adaptation_flag, before.adaptation_flag,
    'the non-clinical adaptation flag stays plaintext — that was ruled on directly');
  assert.deepEqual(before, clientContent(), 'the input is not mutated');
});

test('the field list comes from the model, not from a second copy that would drift', () => {
  assert.deepEqual(
    [...ALL_ENCRYPTED_FIELD_NAMES].sort(),
    ['clinical_note', 'clinical_reference', 'clinical_reference_label'],
    'if this ever changes, sealing follows it automatically; that is the point of one list');
});

test('a record type with no clinical fields is passed through untouched', async () => {
  const dataKey = await generateDataKey();
  const routine = { name: 'Push day', exercises: ['a', 'b'] };

  const after = await sealContent(dataKey, { type: 'routine', recordId: 'r-1' }, routine);

  assert.deepEqual(after, routine,
    'routines, sessions, readings and diets are plaintext, deliberately and permanently');
});

test('sealed values satisfy the record model\'s own validation', async () => {
  const dataKey = await generateDataKey();
  const sealed = await sealField(dataKey, CTX, 'a note');
  const c = new Collector();

  assert.ok(checkSealed(c, 'client.clinical_note', sealed));
  assert.equal(c.issues.length, 0, JSON.stringify(c.issues));
});

test('absent stays absent — an empty note is never an encryption of nothing', async () => {
  const dataKey = await generateDataKey();

  assert.equal(await sealField(dataKey, CTX, null), null);
  assert.equal(await sealField(dataKey, CTX, undefined), null);
  assert.equal(await openField(dataKey, CTX, null), null);

  const after = await sealContent(dataKey, { type: 'client', recordId: 'c-1' },
    { name: 'B. Client', clinical_note: null, clinical_reference: null, clinical_reference_label: null });
  assert.equal(after.clinical_note, null,
    'a ciphertext on every client would announce which clients have a note, which is itself a disclosure');
});

test('a fresh initialisation vector on every sealing, so identical notes never look identical', async () => {
  const dataKey = await generateDataKey();

  const first = await sealField(dataKey, CTX, 'the same note');
  const second = await sealField(dataKey, CTX, 'the same note');

  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ct, second.ct);
});

test('a sealed value CANNOT be lifted onto another client\'s record', async () => {
  const dataKey = await generateDataKey();
  const sealed = await sealField(dataKey, CTX, 'knee injury — avoid deep squats');

  await assert.rejects(
    () => openField(dataKey, { ...CTX, recordId: 'client-9' }, sealed),
    'moving one client\'s ciphertext onto another must fail to open, not open somewhere it should not');
});

test('a sealed value CANNOT be moved between fields of the same record', async () => {
  const dataKey = await generateDataKey();
  const sealed = await sealField(dataKey, CTX, 'knee injury — avoid deep squats');

  await assert.rejects(
    () => openField(dataKey, { ...CTX, field: 'clinical_reference_label' }, sealed),
    'a note promoted into the label field would put clinical text where the label is displayed');
});

test('a tampered ciphertext fails to open rather than yielding altered text', async () => {
  const dataKey = await generateDataKey();
  const sealed = await sealField(dataKey, CTX, 'knee injury');
  const flipped = { ...sealed, ct: flipOneCharacter(sealed.ct) };

  await assert.rejects(() => openField(dataKey, CTX, flipped));
});

test('a different data key cannot open the value — which is what a silent split would look like', async () => {
  const sealed = await sealField(await generateDataKey(), CTX, 'knee injury');
  const anotherKey = await generateDataKey();

  await assert.rejects(() => openField(anotherKey, CTX, sealed));
});

test('a full round trip returns exactly what went in', async () => {
  const dataKey = await generateDataKey();
  const ctx = { type: 'client', recordId: 'client-3' };
  const before = clientContent();

  const opened = await openContent(dataKey, ctx, await sealContent(dataKey, ctx, before));

  assert.deepEqual(opened, before);
});

test('already-sealed fields are left alone rather than re-sealed on every save', async () => {
  const dataKey = await generateDataKey();
  const ctx = { type: 'client', recordId: 'client-3' };
  const once = await sealContent(dataKey, ctx, clientContent());

  const twice = await sealContent(dataKey, ctx, once);

  assert.deepEqual(twice, once,
    're-sealing would change the ciphertext of an unchanged note on every save, which makes '
    + 'every sync a write and every difference a lie');
});

test('the bound context refuses a part that could run into the next', () => {
  assert.throws(
    () => additionalDataFor({ type: 'client', recordId: 'a\u0000b', field: 'clinical_note' }),
    (err) => err instanceof CryptoInvalidRequest);
  assert.throws(() => additionalDataFor({ type: '', recordId: 'a', field: 'b' }));
});

test('plaintext in a sealed field is refused by the model with its own code', () => {
  const c = new Collector();

  assert.equal(checkSealed(c, 'client.clinical_note', 'raw clinical text'), false);
  assert.equal(c.issues[0].code, 'PLAINTEXT_IN_SEALED_FIELD',
    'this is the exact failure the field set exists to prevent, and it earns its own code');
});

/** Flip one character of base64 to something else in the alphabet. */
function flipOneCharacter(text) {
  const i = Math.floor(text.length / 2);
  const ch = text[i] === 'A' ? 'B' : 'A';
  return text.slice(0, i) + ch + text.slice(i + 1);
}
