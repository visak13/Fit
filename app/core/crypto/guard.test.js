/**
 * THE GUARD, exercised against the in-memory double.
 *
 * ## Why the double's fidelity is what makes this test real
 *
 * The double permits two objects of the same name in the hidden space, because the real
 * service does — that was measured, not assumed, and it is exactly how a silent key split
 * happened in about fifteen minutes of ordinary two-device use. A kinder double would make
 * every test here pass while proving nothing, because the state the guard exists to prevent
 * would be unreachable in the test and reachable in the field.
 *
 * ## What these tests prove, and what they do not
 *
 * They prove OUR LOGIC given the behaviour modelled by the double. They prove nothing about
 * the platform: no live provider call is made anywhere in this directory. That distinction is
 * the port's own honesty clause and it applies here unchanged.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { InMemoryRemoteStorage, SPACES, manualClock, systemClock } from '../remote/remote.js';
import {
  ENVELOPE_OBJECT_NAME, LISTING_STATES, OUTCOMES, RECOVERY_OBJECT_NAME,
  addSlotToEnvelope, classifyListing, establishKeyMaterial, surveyKeyObjects,
} from './guard.js';
import { makePassphraseSlot, parseEnvelope, serializeEnvelope, withSlot } from './envelope.js';
import { MultipleKeyObjectsFound, NotConnectedYet, SlotAdditionRaced } from './errors.js';
import { InMemoryDeviceKeyStore } from './device-key-store.js';
import { openField, sealField } from './sealing.js';

const AT = '2026-07-25T09:00:00.000Z';
const now = () => AT;

/** A fresh store with virtual time, so nothing in this file waits on a real clock. */
function newRemote(opts = {}) {
  return new InMemoryRemoteStorage({ clock: opts.clock ?? manualClock() });
}

/** One device: its own identifier and its own key store, exactly as a real installation has. */
function device(deviceId) {
  return { deviceId, deviceKeys: new InMemoryDeviceKeyStore() };
}

/** @param {any} remote @param {any} dev @param {object} [over] */
function establish(remote, dev, over = {}) {
  return establishKeyMaterial({
    remote, deviceId: dev.deviceId, deviceKeys: dev.deviceKeys,
    hasEverSynchronised: true, now, ...over,
  });
}

/** How many objects of each name are in the hidden space. */
async function census(remote) {
  const all = await remote.list(SPACES.HIDDEN);
  return {
    envelopes: all.filter((m) => m.name === ENVELOPE_OBJECT_NAME).length,
    recoveries: all.filter((m) => m.name === RECOVERY_OBJECT_NAME).length,
    total: all.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// The classifier
// ═══════════════════════════════════════════════════════════════════════════════

test('classifyListing names all three cases, including the one that used not to exist', () => {
  assert.equal(classifyListing([]).state, LISTING_STATES.ABSENT);
  assert.equal(classifyListing([{ file_id: 'a' }]).state, LISTING_STATES.EXACTLY_ONE);
  const many = classifyListing([{ file_id: 'a' }, { file_id: 'b' }]);
  assert.equal(many.state, LISTING_STATES.MORE_THAN_ONE);
  assert.equal(many.found.length, 2,
    'every candidate is carried, because the screen must show both sides rather than a count');
});

// ═══════════════════════════════════════════════════════════════════════════════
// Case one — create, and ONLY on a genuinely empty listing
// ═══════════════════════════════════════════════════════════════════════════════

test('creates the one and only data key when the listing is genuinely empty', async () => {
  const remote = newRemote();
  const laptop = device('laptop');

  const result = await establish(remote, laptop);

  assert.equal(result.outcome, OUTCOMES.CREATED);
  assert.deepEqual(await census(remote), { envelopes: 1, recoveries: 1, total: 2 });
  assert.deepEqual(
    result.envelope.slots.map((s) => s.kind).sort(),
    ['device', 'recovery'],
    'a new envelope carries a device slot AND the recovery authority — the device slot must '
    + 'never be the only slot, because a browser can clear its storage underneath it');
});

test('a second run on the same device adopts and writes nothing', async () => {
  const remote = newRemote();
  const laptop = device('laptop');
  const first = await establish(remote, laptop);

  const second = await establish(remote, laptop);

  assert.equal(second.outcome, OUTCOMES.ADOPTED);
  assert.equal(second.addedDeviceSlot, false);
  assert.equal(second.meta.revision, first.meta.revision,
    'the ordinary daily path must not rewrite the envelope; a write it did not need is a '
    + 'chance to lose a slot the other device added');
  assert.deepEqual(await census(remote), { envelopes: 1, recoveries: 1, total: 2 });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Case two — adopt when one exists, always
// ═══════════════════════════════════════════════════════════════════════════════

test('a second device ADOPTS the existing envelope and never creates a second', async () => {
  const remote = newRemote();
  const laptop = device('laptop');
  const phone = device('phone');
  const created = await establish(remote, laptop);

  const adopted = await establish(remote, phone);

  assert.equal(adopted.outcome, OUTCOMES.ADOPTED);
  assert.equal(adopted.addedDeviceSlot, true,
    'a device adopting for the first time gives itself a slot, so it never signs in for this again');
  assert.deepEqual(await census(remote), { envelopes: 1, recoveries: 1, total: 2 },
    'adoption adds a slot to the one envelope; it never adds an envelope or a recovery object');
  assert.equal(adopted.envelope.envelope_id, created.envelope.envelope_id);
});

test('both devices end up with the SAME data key, which is the whole point', async () => {
  const remote = newRemote();
  const laptop = await establish(remote, device('laptop'));
  const phone = await establish(remote, device('phone'));

  const ctx = { type: 'client', recordId: 'client-1', field: 'clinical_note' };
  const sealed = await sealField(laptop.dataKey, ctx, 'avoid deep squats');

  assert.equal(await openField(phone.dataKey, ctx, sealed), 'avoid deep squats',
    'if this fails, the ciphertext families have split and the split is silent');
});

// ═══════════════════════════════════════════════════════════════════════════════
// Case three — MORE THAN ONE. Reproduced, then refused.
// ═══════════════════════════════════════════════════════════════════════════════

test('two devices setting up at the same moment DO produce a split, and it is reachable from the guard itself', async () => {
  // Real latency on every call, so both devices complete their listing before either write
  // lands — which is precisely the ordinary two-device timing that produced the measured split.
  const remote = newRemote({ clock: systemClock() });
  remote.adversity.setLatency(5);

  await Promise.all([establish(remote, device('laptop')), establish(remote, device('phone'))]);

  const counted = await census(remote);
  assert.equal(counted.envelopes, 2,
    'the double must permit this: it is what the real space did, and a double that refused it '
    + 'would let the most dangerous defect in this design pass its own test');
  assert.equal(counted.recoveries, 2,
    'and the recovery object splits the same way, because the quirk belongs to the SPACE');
});

test('a multi-envelope listing is SURFACED, never resolved by guessing', async () => {
  const remote = newRemote({ clock: systemClock() });
  remote.adversity.setLatency(5);
  await Promise.all([establish(remote, device('laptop')), establish(remote, device('phone'))]);
  const before = await census(remote);

  const err = await rejects(() => establish(remote, device('tablet')));

  assert.ok(err instanceof MultipleKeyObjectsFound, `expected a surfaced conflict, got ${err}`);
  assert.equal(err.found.length, 2, 'both candidates are carried so a human can compare them');
  assert.match(err.userMessage, /more than one/i);
  assert.deepEqual(await census(remote), before,
    'nothing is written, nothing is deleted, and nothing is adopted — adopting the wrong one '
    + 'would split the ciphertext exactly as badly as creating a third');
});

test('more than one RECOVERY object is surfaced too, and that case is worse than the envelope one', async () => {
  const remote = newRemote();
  const laptop = device('laptop');
  await establish(remote, laptop);
  // A second device that had already surveyed an empty space writes its own recovery object.
  // The space accepts it, silently, exactly as it accepted the second envelope.
  const [existing] = (await remote.list(SPACES.HIDDEN))
    .filter((m) => m.name === RECOVERY_OBJECT_NAME);
  const copy = await remote.read(existing.file_id);
  await remote.create(SPACES.HIDDEN, { name: RECOVERY_OBJECT_NAME, content: copy.content });

  const err = await rejects(() => establish(remote, device('phone')));

  assert.ok(err instanceof MultipleKeyObjectsFound, `expected a surfaced conflict, got ${err}`);
  assert.equal(err.role, 'recovery key');
  assert.equal(err.found.length, 2);
});

test('the survey reports the three cases for BOTH objects independently', async () => {
  const remote = newRemote();
  assert.deepEqual(
    Object.values(await surveyKeyObjects(remote)).map((c) => c.state),
    [LISTING_STATES.ABSENT, LISTING_STATES.ABSENT]);

  await establish(remote, device('laptop'));
  const after = await surveyKeyObjects(remote);
  assert.equal(after.envelopes.state, LISTING_STATES.EXACTLY_ONE);
  assert.equal(after.recoveries.state, LISTING_STATES.EXACTLY_ONE);
});

// ═══════════════════════════════════════════════════════════════════════════════
// The unsynchronised device REFUSES
// ═══════════════════════════════════════════════════════════════════════════════

test('a device that has never synchronised REFUSES to create, rather than helpfully generating a key', async () => {
  const remote = newRemote();

  const err = await rejects(() => establish(remote, device('phone'), { hasEverSynchronised: false }));

  assert.ok(err instanceof NotConnectedYet, `expected a refusal, got ${err}`);
  assert.deepEqual(await census(remote), { envelopes: 0, recoveries: 0, total: 0 },
    'the refusal must leave the space untouched — a half-created key is worse than none');
  assert.match(err.userMessage, /connect once|not connected/i);
  assert.match(err.userMessage, /works normally|everything else/i,
    'the refusal covers the clinical note alone; the coach must be told the rest of the app is fine');
});

test('the refusal happens BEFORE any listing is attempted', async () => {
  const remote = newRemote();
  let listed = 0;
  const watched = new Proxy(remote, {
    get(target, prop, receiver) {
      if (prop === 'list') { listed += 1; }
      return Reflect.get(target, prop, receiver);
    },
  });

  await rejects(() => establish(watched, device('phone'), { hasEverSynchronised: false }));

  assert.equal(listed, 0,
    'the whole point is that this device CANNOT know what exists; reaching for the store to '
    + 'find out is the thing it is unable to do');
});

// ═══════════════════════════════════════════════════════════════════════════════
// Adding a slot is a remote write, and races are DETECTED
// ═══════════════════════════════════════════════════════════════════════════════

test('a concurrent slot addition is DETECTED rather than lost', async () => {
  const remote = newRemote();
  const laptop = await establish(remote, device('laptop'));

  // The phone adds a passphrase slot while the laptop still holds the metadata it read.
  const theirSlot = await makePassphraseSlot(laptop.dataKey, 'their phrase', { at: AT });
  const theirEnvelope = withSlot(laptop.envelope, theirSlot);
  await remote.overwrite(laptop.meta.file_id, serializeEnvelope(theirEnvelope));

  const ourSlot = await makePassphraseSlot(laptop.dataKey, 'our phrase', { at: AT });
  const err = await rejects(() => addSlotToEnvelope({
    remote, meta: laptop.meta, envelope: laptop.envelope, slot: ourSlot,
  }));

  assert.ok(err instanceof SlotAdditionRaced, `expected detection, got ${err}`);
  assert.ok(err.theirSlotIds.includes(theirSlot.slot_id),
    'both sides are named, because showing "something clashed" with nothing to look at is '
    + 'barely better than saying nothing');
  assert.ok(err.ourSlotIds.includes(ourSlot.slot_id));

  const onDisk = parseEnvelope((await remote.read(laptop.meta.file_id)).content);
  assert.ok(onDisk.slots.some((s) => s.slot_id === theirSlot.slot_id),
    'the other device\'s slot survives — a slot lost without a word is a way back into the '
    + 'notes the coach believes he has and does not');
});

test('an uncontested slot addition lands and moves the revision', async () => {
  const remote = newRemote();
  const laptop = await establish(remote, device('laptop'));
  const slot = await makePassphraseSlot(laptop.dataKey, 'a written phrase', { at: AT });

  const written = await addSlotToEnvelope({
    remote, meta: laptop.meta, envelope: laptop.envelope, slot,
  });

  assert.equal(written.envelope.slots.length, 3);
  assert.ok(written.meta.revision > laptop.meta.revision);
  const onDisk = parseEnvelope((await remote.read(laptop.meta.file_id)).content);
  assert.equal(onDisk.slots.length, 3);
});

// ═══════════════════════════════════════════════════════════════════════════════
// The half-finished setup, which the write order was chosen for
// ═══════════════════════════════════════════════════════════════════════════════

test('a recovery object with no envelope beside it is ADOPTED, not duplicated', async () => {
  const remote = newRemote();
  const laptop = device('laptop');
  await establish(remote, laptop);
  // Simulate the crash the write order was chosen for: the envelope never landed, or was lost,
  // and only the recovery object remains.
  const [envelope] = (await remote.list(SPACES.HIDDEN))
    .filter((m) => m.name === ENVELOPE_OBJECT_NAME);
  await remote.remove(envelope.file_id);

  const result = await establish(remote, device('phone'));

  assert.equal(result.outcome, OUTCOMES.CREATED);
  assert.deepEqual(await census(remote), { envelopes: 1, recoveries: 1, total: 2 },
    'the existing recovery material is adopted; a second recovery object is never made');
});

/**
 * Run something expected to reject and hand back the error.
 *
 * Written out rather than using the runner's rejection helper because every test here then
 * asserts on the ERROR ITSELF — its class, its user-facing wording, and what it carries for
 * the screen that will show it. A helper that only checks "it threw" would let a refusal
 * regress into an unusable one without failing.
 *
 * @param {() => Promise<unknown>} fn
 * @returns {Promise<any>}
 */
async function rejects(fn) {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  assert.fail('expected this to be refused, and it was not');
}
