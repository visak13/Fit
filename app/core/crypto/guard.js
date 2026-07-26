/**
 * THE ADOPT-NEVER-CREATE GUARD — the most dangerous part of the whole design.
 *
 * ## The failure this exists to prevent
 *
 * If two devices independently generate their own data key, the result is two incompatible
 * families of ciphertext and a SILENT, UNRECOVERABLE split. Neither device errors. Nothing
 * looks wrong. The coach discovers it when a note he wrote on the phone will not open on the
 * laptop — by which time both families have real notes in them and there is no key that reads
 * both.
 *
 * This was not theorised. It was REPRODUCED BY ACCIDENT in about fifteen minutes of ordinary
 * two-device use during the platform spike: both devices wrote an envelope under the same
 * name, the hidden space accepted both because it does not enforce name uniqueness, and the
 * listing afterwards returned two files with different identifiers. Nobody did anything
 * wrong.
 *
 * ## Therefore: on every device, before writing any encrypted record, LIST and act on what is
 * there. THREE cases, and the third is the one no earlier design had.
 *
 *   1. **Empty listing** — create, and only then.
 *   2. **Exactly one** — ADOPT IT, always. Creating a second is forbidden.
 *   3. **More than one** — this state is PROVEN REACHABLE. A naive adopt-the-first would
 *      still split the ciphertext silently, because the other device is meanwhile using the
 *      one we did not pick. SURFACE IT TO THE USER AND NEVER RESOLVE IT BY GUESSING.
 *
 * ## And the same three cases apply to the RECOVERY OBJECT
 *
 * The non-uniqueness quirk is a property of the SPACE, not of the envelope. The recovery key
 * lives there as its own object and is subject to it identically: two devices that each
 * believe they must establish recovery produce two recovery objects, silently, exactly as two
 * devices produced two envelopes.
 *
 * That case is WORSE than the envelope one and is worth the extra code. A split envelope
 * announces itself the first time a device cannot read the other's ciphertext — annoying,
 * visible, early. A wrong or ambiguous recovery key announces itself only when somebody
 * actually tries to recover, on a new or wiped device, which is precisely the moment there is
 * no other copy and no way back. It is silent for exactly as long as everything is working
 * and surfaces exactly when it cannot be fixed.
 *
 * ## A device that has never synchronised REFUSES
 *
 * It cannot list, so it cannot know whether a key already exists, so it must not create one.
 * The tempting behaviour — generate a key so the coach is not blocked — is precisely how the
 * split happens. Only the clinical note is refused; every other part of the application
 * carries on working offline exactly as it did.
 *
 * ## What this module never does
 *
 * It never picks between duplicates, never merges two envelopes, never deletes anything, and
 * never writes an envelope without having listed first. Every one of those would be a
 * plausible-looking recovery that silently loses a key.
 *
 * ## Everything here is recorded, and the sink is REQUIRED rather than optional
 *
 * This is the highest-value domain in the whole event log. Every outcome below — the key coming
 * into existence, a device adopting it, the recovery material being used, the refusal on a device
 * that has never synchronised, and both duplicate detections — is written through
 * `ctx.journal`, an async `(fields) => void` the caller supplies.
 *
 * **It is a required argument, and that is deliberate. Do not make it optional.** This build has
 * twice shipped a correct routine that nothing reached — outbox entries pruned only by a caller who
 * decided to, and a purge manifest carrying a reason nothing consumed — and the durable layer
 * answered that by making retention's caller structural rather than scheduled. The same answer
 * applies here: an optional sink is one a later call site omits and still compiles, and the omission
 * is invisible afterwards, because a log with nothing in it looks exactly like a device where
 * nothing happened. Required means a new caller cannot quietly skip it.
 *
 * **This module does not import the log.** It takes a function and calls it, so `core/crypto` gains
 * no dependency on `core/store` or `core/journal`'s durable half; the kind constants are the one
 * exception, and they are frozen strings whose whole purpose is that a typo fails at the call site
 * rather than at runtime.
 *
 * **A refusal is recorded before it is thrown.** The entry for a refusal that never got written
 * would be missing at exactly the moment somebody is trying to work out what went wrong, which is
 * the moment the log exists for.
 */

import { JOURNAL_KINDS } from '../journal/kinds.js';
import { SPACES, hasMoved } from '../remote/remote.js';
import {
  ENVELOPE_DOCUMENT, RECOVERY_DOCUMENT, SLOT_KINDS,
  deviceSlotFor, makeDeviceSlot, makeRecoverySlot, newEnvelope, newRecoveryObject,
  openWithDeviceSlot, openWithRecoveryMaterial, parseEnvelope, parseRecoveryObject,
  serializeEnvelope, serializeRecoveryObject, withSlot, withoutDeviceSlot,
} from './envelope.js';
import { generateDeviceWrappingKey } from './primitives.js';
import {
  CryptoInvalidRequest, MultipleKeyObjectsFound, NoUsableSlot, NotConnectedYet, SlotAdditionRaced,
} from './errors.js';

/**
 * The names the two objects are written under.
 *
 * A name is a HINT here and never an identity. The space does not enforce uniqueness, so the
 * name narrows a listing and the file identifier is the only thing that actually addresses a
 * file. Nothing in this module keys anything by name.
 */
export const ENVELOPE_OBJECT_NAME = 'key-envelope.v1.json';

/** @see ENVELOPE_OBJECT_NAME */
export const RECOVERY_OBJECT_NAME = 'recovery-key.v1.json';

/** The three cases, named once so a caller can branch on them without repeating the counting. */
export const LISTING_STATES = Object.freeze({
  ABSENT: 'absent',
  EXACTLY_ONE: 'exactly_one',
  MORE_THAN_ONE: 'more_than_one',
});

/** What `establishKeyMaterial` did, for the caller and for the worklog. */
export const OUTCOMES = Object.freeze({
  /** An existing envelope was adopted. The overwhelmingly common case after first setup. */
  ADOPTED: 'adopted',
  /** A genuinely empty listing, so this installation's one and only data key was created. */
  CREATED: 'created',
});

/**
 * Classify a listing into exactly one of the three cases.
 *
 * Written as a pure function over metadata rather than inline at each call site, because the
 * envelope and the recovery object need identical treatment and two hand-written copies of a
 * three-way branch is how the third case quietly ends up handled in only one of them.
 *
 * @param {import('../remote/port.js').RemoteFileMeta[]} metas
 * @returns {{state: string, found: import('../remote/port.js').RemoteFileMeta[]}}
 */
export function classifyListing(metas) {
  const found = [...metas];
  if (found.length === 0) return { state: LISTING_STATES.ABSENT, found };
  if (found.length === 1) return { state: LISTING_STATES.EXACTLY_ONE, found };
  return { state: LISTING_STATES.MORE_THAN_ONE, found };
}

/**
 * What is actually in the hidden space right now.
 *
 * Both object kinds are surveyed in ONE listing rather than two, so the answer is a single
 * consistent snapshot. Two listings would leave a window in which the envelope and the
 * recovery object were read at different moments, and a decision made across that seam could
 * be self-contradictory.
 *
 * @param {import('../remote/port.js').RemoteStoragePort} remote
 * @param {{timeoutMs?: number}} [opts]
 * @returns {Promise<{envelopes: {state: string, found: any[]}, recoveries: {state: string, found: any[]}}>}
 */
export async function surveyKeyObjects(remote, opts = {}) {
  const all = await remote.list(SPACES.HIDDEN, { timeoutMs: opts.timeoutMs });
  return {
    envelopes: classifyListing(all.filter((m) => m.name === ENVELOPE_OBJECT_NAME)),
    recoveries: classifyListing(all.filter((m) => m.name === RECOVERY_OBJECT_NAME)),
  };
}

/**
 * Get this installation's data key: adopt what exists, or create the one and only key if
 * nothing does.
 *
 * This is the single entry point through which a data key may come into existence. Nothing
 * else in the application calls `newEnvelope`, and the reason is structural rather than
 * stylistic: as long as key creation is reachable only from behind this listing, "create a
 * second key" is not a mistake a later step is able to make.
 *
 * @param {Object} ctx
 * @param {import('../remote/port.js').RemoteStoragePort} ctx.remote
 * @param {import('./device-key-store.js').DeviceKeyStore} ctx.deviceKeys
 * @param {string} ctx.deviceId       Stable per installation. Names this device's slot.
 * @param {boolean} ctx.hasEverSynchronised  False on a device that has never reached the space.
 * @param {() => string} ctx.now      Injected, so a test controls the timestamps it asserts on.
 * @param {(fields: {kind: string, affected_count?: number|null}) => Promise<any>} ctx.journal
 *   REQUIRED. Where this domain's events are recorded. See the note at the top of this file for why
 *   it is not optional — an optional one is one a later caller omits, silently.
 * @param {number} [ctx.timeoutMs]
 * @returns {Promise<{dataKey: CryptoKey, envelope: any, meta: any, outcome: string, addedDeviceSlot: boolean}>}
 */
export async function establishKeyMaterial(ctx) {
  const { remote, deviceKeys, deviceId, hasEverSynchronised, now, journal, timeoutMs } = ctx;
  requireText(deviceId, 'deviceId');
  if (typeof now !== 'function') throw new CryptoInvalidRequest('A clock function is required.');
  if (typeof journal !== 'function') {
    throw new CryptoInvalidRequest(
      'A journal function is required. Key and recovery activity is the highest-value thing the '
      + 'event log holds, and this argument is required rather than optional so that a call site '
      + 'cannot omit it and still work — an unrecorded key event is invisible afterwards, because a '
      + 'log with nothing in it looks exactly like a device where nothing happened.',
    );
  }

  // The refusal comes FIRST, before any listing is attempted, because the whole point is that
  // this device cannot know what exists. Reaching the store to find out is the thing it cannot do.
  // Recorded BEFORE it is thrown: an entry that is missing at the moment somebody is working out
  // why the coach cannot write a note is missing at exactly the moment the log exists for.
  if (hasEverSynchronised !== true) {
    await journal({ kind: JOURNAL_KINDS.ESTABLISH_REFUSED });
    throw new NotConnectedYet();
  }

  const survey = await surveyKeyObjects(remote, { timeoutMs });

  // Case three, for BOTH objects, and it is checked before anything else can act on the
  // listing. Neither is resolved, neither is picked, nothing is written.
  if (survey.envelopes.state === LISTING_STATES.MORE_THAN_ONE) {
    // The count and nothing else. Which files they were is a question for the listing in front of
    // the coach, not for the log — and the entry has no field that could carry them anyway.
    await journal({
      kind: JOURNAL_KINDS.DUPLICATE_ENVELOPE_DETECTED,
      affected_count: survey.envelopes.found.length,
    });
    throw new MultipleKeyObjectsFound('key envelope', survey.envelopes.found);
  }
  if (survey.recoveries.state === LISTING_STATES.MORE_THAN_ONE) {
    await journal({
      kind: JOURNAL_KINDS.DUPLICATE_RECOVERY_DETECTED,
      affected_count: survey.recoveries.found.length,
    });
    throw new MultipleKeyObjectsFound('recovery key', survey.recoveries.found);
  }

  if (survey.envelopes.state === LISTING_STATES.EXACTLY_ONE) {
    return adoptEnvelope({ ...ctx, survey });
  }
  return createKeyMaterial({ ...ctx, survey });
}

/**
 * Case two: exactly one envelope exists, so adopt it. Always.
 *
 * Adoption is not merely reading the file. A device adopting for the first time has no slot of
 * its own, so it opens the data key through the recovery material and then ADDS a device slot
 * — which is itself a remote write and therefore runs the same detection discipline as every
 * other one. That is the whole cross-device story: the phone lists the laptop's envelope,
 * opens it by signing in, and gives itself a slot so it never has to sign in for this again.
 *
 * @param {any} ctx
 */
async function adoptEnvelope(ctx) {
  const { remote, deviceKeys, deviceId, now, journal, timeoutMs, survey } = ctx;
  const [meta] = survey.envelopes.found;
  const file = await remote.read(meta.file_id, { timeoutMs });
  let envelope = parseEnvelope(file.content);
  let currentMeta = file.meta;

  const held = await deviceKeys.load(deviceId);
  const ourSlot = deviceSlotFor(envelope, deviceId);

  // The happy path, and the one that runs almost every time: this device has its slot and the
  // key it wraps under, so nothing is prompted and nothing is written.
  //
  // NOTHING IS LOGGED HERE EITHER, and that is a decision rather than an omission. This branch
  // changes nothing: no slot is added, no material is read, no envelope is written. Recording it
  // would put an entry in the log every time the application opens, and retention on this log is
  // COUNTED rather than dated — so the noise would not merely be noise, it would push the real key
  // events off the end of the chain. What is worth recording is an adoption that DID something,
  // which is the branch below.
  if (held && ourSlot) {
    return {
      dataKey: await openWithDeviceSlot(envelope, deviceId, held),
      envelope, meta: currentMeta, outcome: OUTCOMES.ADOPTED, addedDeviceSlot: false,
    };
  }

  // Otherwise this device is new to the envelope, or its stored key vanished — which is an
  // ordinary state, not an exceptional one. Either way the way back in is the recovery slot.
  const recoveryKeyBytes = await readRecoveryMaterial(remote, survey, timeoutMs, journal);
  if (!recoveryKeyBytes) {
    // No device slot and no recovery object: this device cannot reach the key at all. Recorded as a
    // refused recovery because that is what it is — the attempt to get back in did not open the key
    // — and recorded before the throw, for the reason every other refusal here is.
    await journal({ kind: JOURNAL_KINDS.RECOVERY_REFUSED });
    throw new NoUsableSlot([SLOT_KINDS.DEVICE, SLOT_KINDS.RECOVERY]);
  }
  const dataKey = await openWithRecoveryMaterial(envelope, recoveryKeyBytes);

  // The recovery material was genuinely used to open the data key. This is the entry that makes
  // "when did another device get in, and how" answerable at all.
  await journal({ kind: JOURNAL_KINDS.RECOVERY_USED });

  const wrappingKey = await generateDeviceWrappingKey();
  const slot = await makeDeviceSlot(dataKey, wrappingKey, {
    deviceId, label: `This device (${deviceId})`, at: now(),
  });
  // Any stale slot of OUR OWN is dropped as the new one goes on. A device whose key vanished
  // is an ordinary case, and leaving both would let a later lookup find the dead one first.
  const written = await addSlotToEnvelope({
    remote, meta: currentMeta, envelope: withoutDeviceSlot(envelope, deviceId), slot, timeoutMs,
  });
  // Held only after the envelope carrying its slot is durably written. The other order would
  // leave a device holding a key that opens nothing, which presents as a corrupted envelope.
  await deviceKeys.store(deviceId, wrappingKey);

  // After the write, not before: a slot recorded as added and then not written is the log asserting
  // a way into the key that does not exist, which is the more dangerous of the two directions.
  await journal({ kind: JOURNAL_KINDS.KEY_SLOT_ADDED });

  return {
    dataKey,
    envelope: written.envelope,
    meta: written.meta,
    outcome: OUTCOMES.ADOPTED,
    addedDeviceSlot: true,
  };
}

/**
 * Case one: a genuinely empty listing, so create — and only then.
 *
 * ## Why the recovery object is written FIRST
 *
 * The two writes cannot be made atomic; there are no transactions on this port. So the order
 * is chosen for what a crash between them leaves behind. Recovery-object-first leaves a
 * recovery object with no envelope, which the next run reads as "envelope absent, recovery
 * exactly one" and completes by adopting that material. Envelope-first would leave an
 * envelope whose only slot is a device slot, on a device that might never come back — an
 * envelope nobody can ever recover.
 *
 * @param {any} ctx
 */
async function createKeyMaterial(ctx) {
  const { remote, deviceKeys, deviceId, now, journal, timeoutMs, survey } = ctx;
  const at = now();

  // A recovery object may already exist with no envelope beside it — see above. Adopt it
  // rather than making a second, which is the same rule as the envelope's and for the same reason.
  let recoveryKeyBytes = await readRecoveryMaterial(remote, survey, timeoutMs, journal);
  let recoveryObjectId;
  if (recoveryKeyBytes) {
    const existing = await remote.read(survey.recoveries.found[0].file_id, { timeoutMs });
    recoveryObjectId = parseRecoveryObject(existing.content).recovery.recovery_object_id;
  } else {
    const made = newRecoveryObject({ deviceId, at });
    await remote.create(SPACES.HIDDEN, {
      name: RECOVERY_OBJECT_NAME, content: serializeRecoveryObject(made.recovery),
    }, { timeoutMs });
    recoveryKeyBytes = made.keyBytes;
    recoveryObjectId = made.recovery.recovery_object_id;
  }

  const { dataKey, envelope: blank } = await newEnvelope({ deviceId, at });
  const wrappingKey = await generateDeviceWrappingKey();
  const withDevice = withSlot(blank, await makeDeviceSlot(dataKey, wrappingKey, {
    deviceId, label: `This device (${deviceId})`, at,
  }));
  const envelope = withSlot(withDevice, await makeRecoverySlot(dataKey, recoveryKeyBytes, {
    recoveryObjectId, at,
  }));

  const meta = await remote.create(SPACES.HIDDEN, {
    name: ENVELOPE_OBJECT_NAME, content: serializeEnvelope(envelope),
  }, { timeoutMs });
  await deviceKeys.store(deviceId, wrappingKey);

  // ONE entry, written once in the lifetime of an installation, and the single most consequential
  // line the log will ever hold: this is the moment the data key came into existence. Its device
  // slot and its recovery slot went on as part of establishing it, so they are not recorded
  // separately — a `key.slot_added` beside this would suggest a slot added to a key that already
  // existed, which is a different and much later event.
  await journal({ kind: JOURNAL_KINDS.KEY_ESTABLISHED });

  return { dataKey, envelope, meta, outcome: OUTCOMES.CREATED, addedDeviceSlot: true };
}

/**
 * Add a slot to an existing envelope, detecting a concurrent change rather than losing it.
 *
 * ## Detection, and it is honest about not being a lock
 *
 * Adding a slot is a remote write like any other, so it uses the same discipline: read the
 * metadata now, compare it with what we held, and refuse if it moved. That is DETECTION AFTER
 * THE FACT. The store offers no conditional write, so the window between the compare and the
 * write cannot be closed by any code here, and a lost update remains reachable in principle.
 *
 * What IS guaranteed is that a detected clash is never resolved silently. The other device's
 * slot is not destroyed and ours is not quietly dropped; both sides are named in the failure
 * so the interface can show them. A slot lost without a word is a way back into the notes that
 * the coach believes he has and does not — which is the same class of harm as the split key,
 * arriving by a different road.
 *
 * @param {Object} args
 * @param {import('../remote/port.js').RemoteStoragePort} args.remote
 * @param {import('../remote/port.js').RemoteFileMeta} args.meta The metadata held when we read.
 * @param {any} args.envelope
 * @param {any} args.slot
 * @param {number} [args.timeoutMs]
 * @returns {Promise<{envelope: any, meta: any}>}
 */
export async function addSlotToEnvelope({ remote, meta, envelope, slot, timeoutMs }) {
  const current = await remote.stat(meta.file_id, { timeoutMs });
  if (hasMoved(meta, current)) {
    // Re-read so the failure can carry BOTH sides. Showing the coach "something clashed" with
    // nothing to look at is barely better than saying nothing.
    let theirSlotIds = [];
    try {
      theirSlotIds = parseEnvelope((await remote.read(meta.file_id, { timeoutMs })).content)
        .slots.map((s) => s.slot_id);
    } catch (cause) {
      // The other side is unreadable as well. That is worth knowing and is not a reason to
      // suppress the clash, so it is reported with an empty other-side rather than swallowed.
      theirSlotIds = [];
      if (cause) Object.defineProperty(theirSlotIds, 'unreadable', { value: true });
    }
    throw new SlotAdditionRaced({
      fileId: meta.file_id,
      heldRevision: meta.revision,
      currentRevision: current.revision,
      ourSlotIds: [...envelope.slots.map((s) => s.slot_id), slot.slot_id],
      theirSlotIds,
    });
  }
  const next = withSlot(envelope, slot);
  const written = await remote.overwrite(meta.file_id, serializeEnvelope(next), { timeoutMs });
  return { envelope: next, meta: written };
}

/**
 * The recovery material, if a single recovery object exists.
 *
 * Returns `null` for an absent one. The more-than-one case never reaches here — it is refused
 * up in `establishKeyMaterial` before any decision is taken — and this function asserts that
 * rather than trusting it, because a caller added later could reach it by another road.
 *
 * @param {import('../remote/port.js').RemoteStoragePort} remote
 * @param {{recoveries: {state: string, found: any[]}}} survey
 * @param {number|undefined} timeoutMs
 * @param {(fields: {kind: string, affected_count?: number|null}) => Promise<any>} journal
 * @returns {Promise<Uint8Array|null>}
 */
async function readRecoveryMaterial(remote, survey, timeoutMs, journal) {
  if (survey.recoveries.state === LISTING_STATES.ABSENT) return null;
  if (survey.recoveries.state === LISTING_STATES.MORE_THAN_ONE) {
    // Unreachable through `establishKeyMaterial`, which refuses this case before any decision is
    // taken. Recorded here anyway rather than trusted, for the same reason the refusal itself is
    // duplicated: a caller added later could reach this by another road, and the detection matters
    // more than the tidiness of asserting it cannot happen.
    await journal({
      kind: JOURNAL_KINDS.DUPLICATE_RECOVERY_DETECTED,
      affected_count: survey.recoveries.found.length,
    });
    throw new MultipleKeyObjectsFound('recovery key', survey.recoveries.found);
  }
  const file = await remote.read(survey.recoveries.found[0].file_id, { timeoutMs });
  return parseRecoveryObject(file.content).keyBytes;
}

/** @param {unknown} value @param {string} what */
function requireText(value, what) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CryptoInvalidRequest(`${what} is required and must not be blank.`);
  }
}

/** Re-exported so a caller need not reach past the guard for the document markers. */
export { ENVELOPE_DOCUMENT, RECOVERY_DOCUMENT };
