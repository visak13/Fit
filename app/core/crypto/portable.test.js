/**
 * THE PORTABLE ARCHIVE — proved to open on the passphrase ALONE, and proved unable to reach the
 * store's key material.
 *
 * Two claims are made in `portable.js` and neither may rest on its header.
 *
 * **THE FEATURE:** a file made today opens years later with nothing but the phrase — no device key,
 * no account, no envelope from anywhere. The test below does not merely decline to pass those
 * things: it proves the FUNCTION CANNOT TAKE THEM, and it opens from a string that has been round
 * -tripped through text so nothing from the sealing call can be reachable. AND IT PROVES A WRONG
 * PASSPHRASE FAILS — an open that only shows the file opens has proven half of nothing.
 *
 * **THE SAFETY:** this module mints a key, which `crypto.js` says a later step must be structurally
 * unable to do for the STORE. The structural argument is that this module takes no remote, no device
 * key store and no store handle, so it cannot encrypt a record or write to the hidden space. That
 * argument is MECHANISED here rather than asserted, with a non-vacuity probe over `guard.js`, which
 * genuinely does reach a remote.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  openPortableArchive, PORTABLE_DOCUMENT, PORTABLE_VERSION, sealPortableArchive,
} from './portable.js';

const HERE = dirname(fileURLToPath(import.meta.url));

const WHEN = '2026-07-27T09:00:00.000Z';
const PHRASE = 'correct horse battery staple sunset';
const PAYLOAD = 'Knee — avoid deep squats. See folder 12.';

test('THE WHOLE POINT: a file made here opens with the passphrase ALONE', async () => {
  const archive = await sealPortableArchive(PHRASE, PAYLOAD, { at: WHEN });

  // STRIPPED, not merely unused. Everything from the sealing call is out of scope; the only things
  // that survive into the open are a string of text and a phrase a person could have written down.
  const asAFileWouldHoldIt = String(JSON.parse(JSON.stringify(archive)));

  assert.equal(await openPortableArchive(PHRASE, asAFileWouldHoldIt), PAYLOAD);
});

test('...AND A WRONG PASSPHRASE FAILS, or the test above proved only that a file opens', async () => {
  const archive = await sealPortableArchive(PHRASE, PAYLOAD, { at: WHEN });

  await assert.rejects(
    () => openPortableArchive('correct horse battery staple sunrise', archive),
    'one word different must not open it',
  );
  await assert.rejects(() => openPortableArchive('', archive));
});

test('OPENING TAKES EXACTLY TWO THINGS — the phrase and the file, and there is nowhere to put a key', () => {
  assert.equal(
    openPortableArchive.length, 2,
    'a third input would mean the file is no longer openable by somebody holding only the file and '
    + 'the phrase, which is the entire feature',
  );
});

test('THE ARCHIVE IS SELF-CONTAINED: salt, iterations, wrapped key and nonce all travel in the file', async () => {
  const doc = JSON.parse(await sealPortableArchive(PHRASE, PAYLOAD, { at: WHEN }));

  assert.equal(doc.document, PORTABLE_DOCUMENT);
  assert.equal(doc.portable_version, PORTABLE_VERSION);

  const slot = doc.envelope.slots.find((one) => one.kind === 'passphrase');
  assert.ok(slot, 'the passphrase slot is what the phrase opens');
  assert.ok(slot.kdf.salt, 'the salt');
  assert.ok(slot.kdf.iterations > 0, 'the iteration count, so a file sealed today opens years later');
  assert.ok(slot.wrapped_key, 'the wrapped key');
  assert.ok(doc.payload.iv, 'the nonce');
  assert.ok(doc.payload.ct, 'and the ciphertext');
});

test('THE ITERATION COUNT IS THE PACKAGE\'S OWN, not a number this module chose', async () => {
  const { PBKDF2_ITERATIONS } = await import('./primitives.js');
  const doc = JSON.parse(await sealPortableArchive(PHRASE, PAYLOAD, { at: WHEN }));
  const slot = doc.envelope.slots.find((one) => one.kind === 'passphrase');

  assert.equal(
    slot.kdf.iterations, PBKDF2_ITERATIONS,
    'a tunable that gets tuned down is a silent weakening; this inherits rather than re-opening it',
  );
});

test('A KEY PER FILE: two archives of the same payload under the same phrase share nothing', async () => {
  const one = JSON.parse(await sealPortableArchive(PHRASE, PAYLOAD, { at: WHEN }));
  const two = JSON.parse(await sealPortableArchive(PHRASE, PAYLOAD, { at: WHEN }));

  const keyOf = (doc) => doc.envelope.slots.find((s) => s.kind === 'passphrase').wrapped_key;

  assert.notEqual(one.archive_id, two.archive_id);
  assert.notEqual(keyOf(one), keyOf(two), 'a fresh data key per export, never a reused one');
  assert.notEqual(one.payload.ct, two.payload.ct);
  assert.notEqual(one.payload.iv, two.payload.iv, 'and a fresh nonce');

  // BOTH still open, which is what makes the freshness free rather than a cost.
  assert.equal(await openPortableArchive(PHRASE, JSON.stringify(one)), PAYLOAD);
  assert.equal(await openPortableArchive(PHRASE, JSON.stringify(two)), PAYLOAD);
});

test('THE PAYLOAD IS BOUND TO ITS OWN ARCHIVE: ciphertext lifted into another file does not open', async () => {
  const mine = JSON.parse(await sealPortableArchive(PHRASE, PAYLOAD, { at: WHEN }));
  const theirs = JSON.parse(await sealPortableArchive(PHRASE, 'something else', { at: WHEN }));

  // The transplant: their payload, my envelope and my identity. The phrase is right for both.
  const forged = JSON.stringify({ ...mine, payload: theirs.payload });

  await assert.rejects(
    () => openPortableArchive(PHRASE, forged),
    'the archive id is bound in as additional data, so a payload cannot be moved between files',
  );
});

test('a file that is not an archive is refused in words, not with a decryption error', async () => {
  await assert.rejects(() => openPortableArchive(PHRASE, 'not json at all'), /not a readable archive/);
  await assert.rejects(() => openPortableArchive(PHRASE, '{"document":"something-else"}'), /not a fit-portable-archive/);
  await assert.rejects(
    () => openPortableArchive(PHRASE, JSON.stringify({ document: PORTABLE_DOCUMENT, portable_version: 99 })),
    /version 99/,
  );
});

test('sealing refuses an empty passphrase rather than making a file with no way in', async () => {
  await assert.rejects(() => sealPortableArchive('', PAYLOAD, { at: WHEN }), /only way in/);
  await assert.rejects(() => sealPortableArchive('   ', PAYLOAD, { at: WHEN }), /only way in/);
});

// ── The structural claim, mechanised ──────────────────────────────────────────────────────────────

test('IT CANNOT REACH THE STORE\'S KEY MATERIAL — the structural argument, asserted not promised', () => {
  const source = readFileSync(join(HERE, 'portable.js'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  // It imports only from inside this package, and from none of the modules that reach outward.
  const specifiers = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
  assert.ok(specifiers.length > 0, 'the scan found no imports at all, so it is reading nothing');
  for (const specifier of specifiers) {
    assert.ok(specifier.startsWith('./'), `portable.js imports ${specifier} from outside this package`);
  }
  for (const forbidden of ['guard.js', 'device-key-store.js']) {
    assert.ok(!specifiers.includes(`./${forbidden}`), `portable.js reaches ${forbidden}`);
  }

  // And it names none of the things that would let it write where the split-brain guard looks.
  for (const name of ['remote', 'deviceKeys', 'surveyKeyObjects', 'establishKeyMaterial', 'listing']) {
    assert.ok(!code.includes(name), `portable.js names ${name}, so its isolation is no longer structural`);
  }

  // NON-VACUITY: the same scan over the module that DOES reach a remote must say so.
  const guard = readFileSync(join(HERE, 'guard.js'), 'utf8');
  assert.ok(
    guard.includes('remote') && guard.includes('surveyKeyObjects'),
    'the scan can find outward reach when there is some',
  );
});

test('...AND NEITHER OF ITS FUNCTIONS HAS ANYWHERE TO PUT A STORE HANDLE', () => {
  // Counted before the first defaulted parameter, which is why sealing reads as two: the passphrase
  // and the payload are required, and the instant arrives in a defaulted context object. What
  // matters is that neither function has a slot for a store, a remote or a key store, and the
  // source scan above is what holds that; this pins the shape a reader sees at the call site.
  assert.equal(sealPortableArchive.length, 2, 'a passphrase and a payload — nothing else is required');
  assert.equal(
    openPortableArchive.length, 2,
    'the phrase and the file, and nowhere at all to pass a key',
  );
});
