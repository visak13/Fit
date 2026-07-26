/**
 * THE RECOVERY PATHS, exercised rather than promised.
 *
 * An unexercised recovery path is a promise, not a mechanism. The recovery slot is the whole
 * answer to a lost or wiped device, and the moment it is needed is precisely the moment there
 * is no other copy of anything — so it is the one path that must never be assumed to work.
 *
 * Each test here throws away something real (the device's key, the device itself, both) and
 * then reads back a note that was sealed BEFORE the loss. Reading the note is the assertion:
 * anything less proves that the envelope opened, not that the notes survived.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { InMemoryRemoteStorage, manualClock } from '../remote/remote.js';
import { establishKeyMaterial } from './guard.js';
import {
  addSlotToEnvelope,
} from './guard.js';
import {
  SLOT_KINDS, deviceSlotFor, makePassphraseSlot, openWithPassphrase, openWithRecoveryMaterial,
  parseEnvelope, slotsOfKind,
} from './envelope.js';
import { InMemoryDeviceKeyStore } from './device-key-store.js';
import { openField, sealField } from './sealing.js';
import { generatePassphrase, normalizePassphrase } from './passphrase.js';
import { NoUsableSlot } from './errors.js';

const AT = '2026-07-25T09:00:00.000Z';
const now = () => AT;
const NOTE_CTX = { type: 'client', recordId: 'client-7', field: 'clinical_note' };
const NOTE = 'knee injury — avoid deep squats and box jumps';

function device(deviceId) {
  return { deviceId, deviceKeys: new InMemoryDeviceKeyStore(), recorded: /** @type {string[]} */ ([]) };
}

function establish(remote, dev, over = {}) {
  return establishKeyMaterial({
    remote, deviceId: dev.deviceId, deviceKeys: dev.deviceKeys,
    hasEverSynchronised: true, now,
    journal: async (/** @type {any} */ fields) => { dev.recorded.push(fields.kind); },
    ...over,
  });
}

/** One installation, one sealed note, ready to be lost in various ways. */
async function withASealedNote() {
  const remote = new InMemoryRemoteStorage({ clock: manualClock() });
  const laptop = device('laptop');
  const established = await establish(remote, laptop);
  const sealed = await sealField(established.dataKey, NOTE_CTX, NOTE);
  return { remote, laptop, established, sealed };
}

test('a WIPED device recovers by signing in, and reads a note sealed before the wipe', async () => {
  const { remote, sealed } = await withASealedNote();

  // A new or wiped device: a different installation identifier, and nothing held locally.
  // Every device slot on the envelope is useless to it. Signing in is all it has.
  const replacement = device('replacement-phone');
  const recovered = await establish(remote, replacement);

  assert.equal(await openField(recovered.dataKey, NOTE_CTX, sealed), NOTE,
    'this is the assertion that matters: the NOTE came back, not merely the envelope');
  assert.ok(deviceSlotFor(recovered.envelope, 'replacement-phone'),
    'and the replacement gave itself a slot, so it never has to do this again');
});

test('a device whose stored key VANISHED recovers, and does not leave a dead slot behind', async () => {
  const { remote, laptop, sealed } = await withASealedNote();

  // The ordinary storage-eviction case, not an exotic one: a browser cleared its storage, or
  // the application was never installed to the home screen and was reclaimed after a week.
  await laptop.deviceKeys.forget('laptop');

  const recovered = await establish(remote, laptop);

  assert.equal(await openField(recovered.dataKey, NOTE_CTX, sealed), NOTE);
  const mine = recovered.envelope.slots.filter(
    (s) => s.kind === SLOT_KINDS.DEVICE && s.device_id === 'laptop');
  assert.equal(mine.length, 1,
    'the dead slot is replaced rather than joined — a later lookup finding the stale one first '
    + 'would fail to open the key on a device that is in fact perfectly fine');

  // And the replacement genuinely works on the NEXT launch, which is the only proof that matters.
  const nextLaunch = await establish(remote, laptop);
  assert.equal(nextLaunch.addedDeviceSlot, false);
  assert.equal(await openField(nextLaunch.dataKey, NOTE_CTX, sealed), NOTE);
});

test('the recovery slot alone opens the data key with every device slot discarded', async () => {
  const { remote, established, sealed } = await withASealedNote();
  const envelope = parseEnvelope((await remote.read(established.meta.file_id)).content);

  // Read the recovery material the way a fresh device would, then open with nothing else.
  const recoveryObject = (await remote.list('hidden'))
    .find((m) => m.name === 'recovery-key.v1.json');
  const { parseRecoveryObject } = await import('./envelope.js');
  const { keyBytes } = parseRecoveryObject((await remote.read(recoveryObject.file_id)).content);

  const dataKey = await openWithRecoveryMaterial(envelope, keyBytes);

  assert.equal(await openField(dataKey, NOTE_CTX, sealed), NOTE);
  assert.equal(slotsOfKind(envelope, SLOT_KINDS.RECOVERY).length, 1);
});

test('the OPTIONAL passphrase slot opens the notes with the account provider outside the picture', async () => {
  const { remote, established, sealed } = await withASealedNote();
  const generated = generatePassphrase();

  const slot = await makePassphraseSlot(established.dataKey, generated.phrase, { at: AT });
  const written = await addSlotToEnvelope({
    remote, meta: established.meta, envelope: established.envelope, slot,
  });

  // Typed back off a piece of paper months later, with the capitals and spacing a person
  // actually produces. It must still open.
  const asTypedBack = `  ${generated.phrase.toUpperCase().split(' ').join('   ')}\n`;
  const dataKey = await openWithPassphrase(written.envelope, normalizePassphrase(asTypedBack));

  assert.equal(await openField(dataKey, NOTE_CTX, sealed), NOTE);
  assert.ok(generated.entropyBits > 60,
    `a generated phrase must carry a stated, honest amount of entropy; got ${generated.entropyBits}`);
});

test('a wrong passphrase fails to open rather than opening to something plausible', async () => {
  const { remote, established } = await withASealedNote();
  const slot = await makePassphraseSlot(established.dataKey, 'the real phrase', { at: AT });
  const written = await addSlotToEnvelope({
    remote, meta: established.meta, envelope: established.envelope, slot,
  });

  await assert.rejects(
    () => openWithPassphrase(written.envelope, 'not the real phrase'),
    (err) => err instanceof NoUsableSlot);
});

test('an envelope with no way in for this device says so, loudly and with the route out named', async () => {
  const { remote, established } = await withASealedNote();
  const envelope = parseEnvelope((await remote.read(established.meta.file_id)).content);

  const err = await openWithPassphrase(envelope, 'anything').catch((e) => e);

  assert.ok(err instanceof NoUsableSlot);
  assert.match(err.userMessage, /sign in|restore access/i,
    'a vanished device slot must never present as "decryption failed" — the coach needs the '
    + 'way back, not a diagnosis');
  assert.match(err.userMessage, /safe/i, 'and must be told the notes themselves are intact');
});
