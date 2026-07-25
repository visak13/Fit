/**
 * THE ENVELOPE DOCUMENT — its shape, its strictness, and its independence between slots.
 *
 * The property worth proving here beyond a round trip is INDEPENDENCE: every slot opens the
 * same data key, adding one changes nothing about the others, and removing one leaves the rest
 * working. That is what makes the multi-recipient pattern worth following rather than
 * improving — a design where the passphrase IS the key cannot add a second way in without
 * re-encrypting everything, so in practice it never gets one.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  ENVELOPE_DOCUMENT, ENVELOPE_VERSION, SLOT_KINDS,
  deviceSlotFor, makeDeviceSlot, makePassphraseSlot, makeRecoverySlot, newEnvelope,
  newRecoveryObject, openWithDeviceSlot, openWithPassphrase, openWithRecoveryMaterial,
  parseEnvelope, parseRecoveryObject, serializeEnvelope, serializeRecoveryObject,
  slotsOfKind, withSlot, withoutDeviceSlot,
} from './envelope.js';
import { generateDeviceWrappingKey, toBase64 } from './primitives.js';
import { CryptoInvalidRequest, EnvelopeUnreadable, NoUsableSlot } from './errors.js';

const AT = '2026-07-25T09:00:00.000Z';

/** An envelope carrying all three slot kinds, which is the fullest shape that ever exists. */
async function fullyEquipped() {
  const { dataKey, envelope } = await newEnvelope({ deviceId: 'laptop', at: AT });
  const wrappingKey = await generateDeviceWrappingKey();
  const { recovery, keyBytes } = newRecoveryObject({ deviceId: 'laptop', at: AT });
  const passphrase = 'six ordinary words written down';

  let e = withSlot(envelope, await makeDeviceSlot(dataKey, wrappingKey, {
    deviceId: 'laptop', label: 'Laptop', at: AT,
  }));
  e = withSlot(e, await makeRecoverySlot(dataKey, keyBytes, {
    recoveryObjectId: recovery.recovery_object_id, at: AT,
  }));
  e = withSlot(e, await makePassphraseSlot(dataKey, passphrase, { at: AT, iterations: 1_000 }));

  return { dataKey, envelope: e, wrappingKey, keyBytes, passphrase, recovery };
}

test('every slot opens the SAME data key, independently of the others', async () => {
  const { envelope, wrappingKey, keyBytes, passphrase } = await fullyEquipped();

  const viaDevice = await openWithDeviceSlot(envelope, 'laptop', wrappingKey);
  const viaRecovery = await openWithRecoveryMaterial(envelope, keyBytes);
  const viaPassphrase = await openWithPassphrase(envelope, passphrase);

  const raw = await Promise.all([viaDevice, viaRecovery, viaPassphrase].map(
    (k) => globalThis.crypto.subtle.exportKey('raw', k).then((b) => toBase64(new Uint8Array(b)))));
  assert.equal(raw[0], raw[1]);
  assert.equal(raw[1], raw[2],
    'three ways in, one key — security is the weakest slot and recoverability is the strongest');
});

test('a passphrase slot opens with the iteration count RECORDED IN IT, not the current constant', async () => {
  const { envelope, passphrase } = await fullyEquipped();
  const [slot] = slotsOfKind(envelope, SLOT_KINDS.PASSPHRASE);

  assert.equal(slot.kdf.iterations, 1_000,
    'the count is written into the slot at creation');
  await openWithPassphrase(envelope, passphrase);
  // If the count were read from this file's constant instead, the derivation would differ and
  // this would present as a WRONG PASSPHRASE — telling the coach he has lost the phrase he is
  // holding in his hand, which is the most misleading failure this design could produce.
});

test('withSlot is pure, so the envelope we hold stays the evidence of what was read', async () => {
  const { dataKey, envelope } = await fullyEquipped();
  const before = JSON.parse(JSON.stringify(envelope));

  withSlot(envelope, await makePassphraseSlot(dataKey, 'another', { at: AT, iterations: 1_000 }));

  assert.deepEqual(envelope, before);
});

test('withSlot refuses to add the same slot twice', async () => {
  const { envelope } = await fullyEquipped();

  assert.throws(() => withSlot(envelope, envelope.slots[0]),
    (err) => err instanceof CryptoInvalidRequest);
});

test('withoutDeviceSlot removes only the asking device\'s own slot', async () => {
  const { dataKey, envelope } = await fullyEquipped();
  const other = await makeDeviceSlot(dataKey, await generateDeviceWrappingKey(), {
    deviceId: 'phone', label: 'Phone', at: AT,
  });
  const both = withSlot(envelope, other);

  const pruned = withoutDeviceSlot(both, 'laptop');

  assert.equal(deviceSlotFor(pruned, 'laptop'), undefined);
  assert.ok(deviceSlotFor(pruned, 'phone'),
    'another device\'s slot is never touched: this device cannot know whether it still works, '
    + 'and removing a way in someone relies on is the same harm as losing one');
  assert.equal(slotsOfKind(pruned, SLOT_KINDS.RECOVERY).length, 1);
});

test('a device with no slot of its own is told so rather than shown an error about cryptography', async () => {
  const { envelope, wrappingKey } = await fullyEquipped();

  await assert.rejects(
    () => openWithDeviceSlot(envelope, 'a-device-that-never-registered', wrappingKey),
    (err) => err instanceof NoUsableSlot);
});

test('serialise and parse round-trip exactly', async () => {
  const { envelope } = await fullyEquipped();

  assert.deepEqual(parseEnvelope(serializeEnvelope(envelope)), envelope);
});

test('parsing refuses anything it cannot fully account for', async () => {
  const { envelope } = await fullyEquipped();
  const bad = (mutate) => {
    const copy = JSON.parse(JSON.stringify(envelope));
    mutate(copy);
    return () => parseEnvelope(serializeEnvelope(copy));
  };

  assert.throws(() => parseEnvelope('not json at all'), (e) => e instanceof EnvelopeUnreadable);
  assert.throws(bad((e) => { e.document = 'something-else'; }), (e) => e instanceof EnvelopeUnreadable);
  assert.throws(bad((e) => { e.envelope_version = ENVELOPE_VERSION + 1; }),
    (e) => e instanceof EnvelopeUnreadable && /newer device/.test(e.message),
    'a future version is refused rather than downgraded — writing back a copy this device '
    + 'could represent would destroy whatever the newer one added');
  assert.throws(bad((e) => { e.envelope_id = ''; }), (e) => e instanceof EnvelopeUnreadable);
  assert.throws(bad((e) => { e.slots[0].kind = 'invented'; }), (e) => e instanceof EnvelopeUnreadable);
  assert.throws(bad((e) => { e.slots[0].wrap_alg = 'ROT13'; }), (e) => e instanceof EnvelopeUnreadable);
  assert.throws(bad((e) => { e.slots[0].kdf = { alg: 'PBKDF2' }; }),
    (e) => e instanceof EnvelopeUnreadable,
    'a device slot carrying a derivation is not a harmless extra field; it means this document '
    + 'was written by something that did not mean what we mean');
});

test('the envelope declares itself, so a file in the hidden space is identifiable', async () => {
  const { envelope } = await fullyEquipped();

  assert.equal(envelope.document, ENVELOPE_DOCUMENT);
  assert.equal(envelope.envelope_version, ENVELOPE_VERSION);
  assert.ok(envelope.envelope_id,
    'identity independent of the file NAME, because names in this space are not unique');
});

test('the recovery object round-trips and refuses material of the wrong size', () => {
  const { recovery, keyBytes } = newRecoveryObject({ deviceId: 'laptop', at: AT });

  const parsed = parseRecoveryObject(serializeRecoveryObject(recovery));

  assert.deepEqual(parsed.keyBytes, keyBytes);
  assert.equal(parsed.recovery.recovery_object_id, recovery.recovery_object_id);
  assert.throws(
    () => parseRecoveryObject(serializeRecoveryObject({ ...recovery, key: toBase64(new Uint8Array(8)) })),
    (err) => err instanceof EnvelopeUnreadable);
});

test('a recovery slot names the object it pairs with', async () => {
  const { envelope, recovery } = await fullyEquipped();
  const [slot] = slotsOfKind(envelope, SLOT_KINDS.RECOVERY);

  assert.equal(slot.recovery_object_id, recovery.recovery_object_id);
});
