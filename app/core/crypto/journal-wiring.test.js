/**
 * THE KEY AND RECOVERY DOMAIN IS ACTUALLY WIRED — and it reaches a REAL log, not a spy.
 *
 * ## Why this suite exists when `guard.test.js` beside it already collects the kinds
 *
 * That suite hands the guard a function that pushes onto an array, which is right for it: it is
 * testing the guard's decisions, and `core/crypto` owns no database. But a collector proves only
 * that the guard called something. It cannot tell you whether a key event SURVIVES — whether it is
 * a valid entry, whether the vocabulary accepts the kind, whether it links into the device's chain,
 * whether it is still there afterwards.
 *
 * So everything below wires `ctx.journal` to the real `recordEvent` against a real local store, and
 * then reads the entries back out of the database. That is the whole difference between "the guard
 * calls a function" and "this installation can tell you when its data key came into existence".
 *
 * ## Nothing here appends
 *
 * Every entry asserted below was caused by calling `establishKeyMaterial` — creating, adopting,
 * refusing, or meeting a duplicate. This is the highest-value domain in the log, and it is also the
 * one whose events are rarest: an unwired call site here would look identical to a well-behaved
 * installation for the entire life of the product, right up to the moment somebody needed to know.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { JOURNAL_KINDS, JOURNAL_STORES, readChainPage, recordEvent } from '../journal/journal.js';
import { InMemoryRemoteStorage, SPACES, manualClock, systemClock } from '../remote/remote.js';
import { openLocalStore } from '../store/local-store.js';
import { createLaptop } from '../store/testing/platform-double.js';
import { InMemoryDeviceKeyStore } from './device-key-store.js';
import { MultipleKeyObjectsFound, NotConnectedYet } from './errors.js';
import { OUTCOMES, RECOVERY_OBJECT_NAME, establishKeyMaterial } from './guard.js';

const AT = '2026-07-25T09:00:00.000Z';
const now = () => AT;

/** A device with a real local database of its own, exactly as an installation has. */
async function aDevice(deviceId) {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: deviceId });
  return {
    deviceId,
    store,
    deviceKeys: new InMemoryDeviceKeyStore(),
    /** THE REAL SINK. Not a spy — the same append every other entry in this build goes through. */
    journal: (/** @type {any} */ fields) => recordEvent(store, fields),
  };
}

/** @param {any} remote @param {any} dev @param {object} [over] */
function establish(remote, dev, over = {}) {
  return establishKeyMaterial({
    remote,
    deviceId: dev.deviceId,
    deviceKeys: dev.deviceKeys,
    hasEverSynchronised: true,
    now,
    journal: dev.journal,
    ...over,
  });
}

/** What is genuinely on this device's disk, read back out of the database. */
async function entriesOn(dev) {
  const page = await dev.store.read(
    JOURNAL_STORES, (scope) => readChainPage(scope, dev.deviceId, { limit: 200 }),
  );
  return page.items;
}

const kindsOn = async (dev) => (await entriesOn(dev)).map((e) => e.kind);

const newRemote = (opts = {}) => new InMemoryRemoteStorage({ clock: manualClock(), ...opts });

/** @param {() => Promise<any>} fn */
async function rejects(fn) {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  return assert.fail('expected a refusal, and nothing was thrown');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The one entry an installation writes once, ever
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('creating this installation\'s data key lands a key.established entry on disk', async () => {
  const remote = newRemote();
  const laptop = await aDevice('coach-laptop');

  const result = await establish(remote, laptop);
  assert.equal(result.outcome, OUTCOMES.CREATED);

  const entries = await entriesOn(laptop);
  assert.equal(entries.length, 1, 'one establishment, one entry');
  assert.equal(entries[0].kind, JOURNAL_KINDS.KEY_ESTABLISHED);
  assert.equal(entries[0].subject, null,
    'a key event is not about a record, and the vocabulary FORBIDS attaching one — an entry that '
    + 'named a client here would be asserting something untrue');
  assert.equal(entries[0].device, 'coach-laptop');
  assert.equal(entries[0].seq, 1, 'and it links into this device\'s chain like anything else');
});

test('opening the application again on an established device records NOTHING', async () => {
  const remote = newRemote();
  const laptop = await aDevice('coach-laptop');
  await establish(remote, laptop);
  const after = await kindsOn(laptop);

  const again = await establish(remote, laptop);
  assert.equal(again.outcome, OUTCOMES.ADOPTED);
  assert.equal(again.addedDeviceSlot, false, 'the happy path: nothing was added, nothing written');

  assert.deepEqual(await kindsOn(laptop), after,
    'and so nothing was recorded. This branch runs every time the coach opens the app; an entry '
    + 'here would be an entry per launch, and retention on this log is COUNTED rather than dated — '
    + 'so the noise would push the real key events off the end of the chain. Silence is the '
    + 'decision, not an omission.');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The refusal that stops the ciphertext splitting
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('a device that has never synchronised records the refusal, then throws it', async () => {
  const remote = newRemote();
  const phone = await aDevice('coach-phone');

  const error = await rejects(() => establish(remote, phone, { hasEverSynchronised: false }));
  assert.ok(error instanceof NotConnectedYet, `expected the refusal, got ${error}`);

  assert.deepEqual(await kindsOn(phone), [JOURNAL_KINDS.ESTABLISH_REFUSED],
    'the entry is written BEFORE the throw. A refusal nobody can see afterwards turns "why can he '
    + 'not write a note on his phone" into a mystery, at exactly the moment the log exists for.');
  assert.equal((await remote.list(SPACES.HIDDEN)).length, 0,
    'and it genuinely refused: nothing was created. Helpfully generating a key here is the act '
    + 'that splits the ciphertext for ever.');
});

test('the required sink is required — a caller cannot omit the log and still work', async () => {
  const remote = newRemote();
  const laptop = await aDevice('coach-laptop');

  await assert.rejects(
    () => establishKeyMaterial({
      remote,
      deviceId: laptop.deviceId,
      deviceKeys: laptop.deviceKeys,
      hasEverSynchronised: true,
      now,
    }),
    /journal function is required/i,
    'an OPTIONAL sink is how this build twice shipped a correct routine nothing reached. Required '
    + 'means the omission fails here, in a diff, rather than becoming an installation whose key '
    + 'history is silently empty — which looks exactly like one where nothing ever happened.',
  );
  assert.deepEqual(await kindsOn(laptop), [], 'and it refused before doing anything at all');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The two detections — the state that was reproduced by accident, not theorised
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('two key envelopes are recorded as a duplicate detection, with the count', async () => {
  const remote = new InMemoryRemoteStorage({ clock: systemClock() });
  remote.adversity.setLatency(5);
  const laptop = await aDevice('coach-laptop');
  const phone = await aDevice('coach-phone');
  await Promise.all([establish(remote, laptop), establish(remote, phone)]);

  const tablet = await aDevice('coach-tablet');
  const error = await rejects(() => establish(remote, tablet));
  assert.ok(error instanceof MultipleKeyObjectsFound, `expected a surfaced conflict, got ${error}`);

  const entries = await entriesOn(tablet);
  assert.deepEqual(entries.map((e) => e.kind), [JOURNAL_KINDS.DUPLICATE_ENVELOPE_DETECTED]);
  assert.equal(entries[0].affected_count, 2,
    'HOW MANY were found, and nothing else. Which files they were belongs in the listing in front '
    + 'of the coach; the entry has no field that could carry them, deliberately.');
});

test('two recovery objects are recorded as their own kind, because the question is different', async () => {
  const remote = newRemote();
  const laptop = await aDevice('coach-laptop');
  await establish(remote, laptop);

  // The space does not enforce name uniqueness, so it accepts a second one silently — which is
  // exactly how the envelope case arose in fifteen minutes of ordinary two-device use.
  const [existing] = (await remote.list(SPACES.HIDDEN))
    .filter((m) => m.name === RECOVERY_OBJECT_NAME);
  const copy = await remote.read(existing.file_id);
  await remote.create(SPACES.HIDDEN, { name: RECOVERY_OBJECT_NAME, content: copy.content });

  const phone = await aDevice('coach-phone');
  const error = await rejects(() => establish(remote, phone));
  assert.ok(error instanceof MultipleKeyObjectsFound, `expected a surfaced conflict, got ${error}`);

  assert.deepEqual(await kindsOn(phone), [JOURNAL_KINDS.DUPLICATE_RECOVERY_DETECTED],
    'a distinct kind rather than one detection carrying which-object-it-was: "every ambiguous '
    + 'recovery key ever seen" is a question the log has to answer, the field set is closed, and a '
    + 'boolean is not a valid key on this platform. The recovery case is also the worse of the two '
    + '— it stays silent until somebody actually needs to recover, which is when there is no way back.');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Adoption: the cross-device story, which is the one the log is really for
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('a second device adopting the key records the recovery it used and the slot it gained', async () => {
  const remote = newRemote();
  const laptop = await aDevice('coach-laptop');
  await establish(remote, laptop);

  const phone = await aDevice('coach-phone');
  const adopted = await establish(remote, phone);

  assert.equal(adopted.outcome, OUTCOMES.ADOPTED);
  assert.equal(adopted.addedDeviceSlot, true, 'the phone gave itself a slot');
  assert.deepEqual(await kindsOn(phone), [
    JOURNAL_KINDS.RECOVERY_USED, JOURNAL_KINDS.KEY_SLOT_ADDED,
  ], 'in that order: the recovery material opened the key, and only then was a way in added. Both '
    + 'are recorded because both are exactly the activity a log exists to hold — this is how "when '
    + 'did another device get into the notes, and how" becomes answerable at all.');

  assert.deepEqual(await kindsOn(laptop), [JOURNAL_KINDS.KEY_ESTABLISHED],
    'and the laptop\'s chain is untouched by it. Chains are per device: the laptop never committed '
    + 'to the phone\'s existence and cannot attest to what it did.');
});

test('the phone\'s second launch is silent, now that it holds its own slot', async () => {
  const remote = newRemote();
  const laptop = await aDevice('coach-laptop');
  await establish(remote, laptop);
  const phone = await aDevice('coach-phone');
  await establish(remote, phone);
  const afterAdoption = await kindsOn(phone);

  await establish(remote, phone);

  assert.deepEqual(await kindsOn(phone), afterAdoption,
    'adoption is recorded when it DOES something. Re-opening is not an event.');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Nothing secret reached the log
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('no key material, slot identifier or ciphertext is anywhere in the entries', async () => {
  const remote = newRemote();
  const laptop = await aDevice('coach-laptop');
  const established = await establish(remote, laptop);
  const phone = await aDevice('coach-phone');
  await establish(remote, phone);

  const serialised = JSON.stringify([...await entriesOn(laptop), ...await entriesOn(phone)]);

  for (const slot of established.envelope.slots) {
    assert.equal(serialised.includes(slot.slot_id), false,
      'a slot identifier reached the log. The entry says THAT key material changed, never what it is.');
    if (typeof slot.wrapped_key === 'string') {
      assert.equal(serialised.includes(slot.wrapped_key), false, 'wrapped key material reached the log');
    }
  }

  const hidden = await remote.list(SPACES.HIDDEN);
  for (const meta of hidden) {
    // eslint-disable-next-line no-await-in-loop
    const file = await remote.read(meta.file_id);
    const content = typeof file.content === 'string' ? file.content : JSON.stringify(file.content);
    assert.equal(serialised.includes(content), false,
      'the contents of a key object reached the log. Keys separated from ciphertext is the control '
      + 'this whole design rests on, and an audit entry is a place nobody thinks to look.');
  }
});
