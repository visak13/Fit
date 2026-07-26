/**
 * THE SYNC ENVELOPE — the wrapper every stored record lives inside.
 *
 * ## The division of ownership, stated once
 *
 * The seed content contract owns CONTENT: what an exercise is, what a routine is, what an
 * intensity pattern is. It stops there, deliberately and by written agreement, and it
 * reserves no space at all for identity, revision, device tag, tombstones, timestamps or
 * encryption markers.
 *
 * This module owns all of those. The test that decides which side a field falls on is taken
 * verbatim from that contract: **if a field would still exist in a single-device application
 * with no synchronisation and no encryption, it is content. If it exists only because there
 * are two devices, a history, or a secret, it is envelope.**
 *
 * The envelope therefore NESTS the content rather than merging with it:
 *
 * ```js
 * {
 *   record_id:  '3f6d…',            // this record's stable identity
 *   type:       'exercise',
 *   rev:        4,
 *   device:     'coach-laptop',
 *   deleted:    false,
 *   deleted_at: null,
 *   created_at: '2026-07-25T09:30:00.000Z',
 *   updated_at: '2026-07-25T11:02:13.412Z',
 *   content:    { id: 'back-squat', name: 'Back Squat', ... }   // the contract's business
 * }
 * ```
 *
 * Nesting is not a stylistic choice. It makes the boundary structural: a content field and
 * an envelope field can never collide, importing a seed record is `{ ...envelope, content:
 * theRecordVerbatim }` with nothing to unpick, and the leak this design exists to prevent —
 * a sync concern quietly appearing in the content contract — becomes something a validator
 * can catch rather than something a reviewer has to notice.
 *
 * ## `record_id` is NOT the content key
 *
 * A seed record carries `content.id`, a human-meaningful CONTENT KEY such as `back-squat`.
 * That key stays exactly where it is, as an ordinary content field, and routines keep
 * referencing exercises by it. The envelope's `record_id` is a separate machine identity
 * that the store files the record under.
 *
 * They are different things and both are needed:
 *
 *  - The content key is stable forever, human-meaningful, and is how one piece of CONTENT
 *    points at another. It is not unique across kinds and it means nothing to the store.
 *  - The record identity is opaque, globally unique, and is how the store, the outbox and
 *    the remote copy address a record. It is what a tombstone survives on, and it is what a
 *    sealed value is cryptographically bound to.
 *
 * ## Concurrency posture
 *
 * Ordinary use is sequential: laptop for online sessions, phone for in-person ones, never
 * both at once. Per-record last-write-wins is therefore sufficient and no merge logic is in
 * scope. {@link laterOf} is the whole of that rule, written down once so nothing invents a
 * second version of it.
 *
 * The one genuine concurrent case — two windows on the LAPTOP running two live sessions
 * against one shared local database — is a store concern, not an envelope one: it needs
 * cross-context coordination and per-session isolation, and the mobile build must not offer
 * it at all. The envelope's contribution is that every write carries a device tag and a
 * revision, so a lost update is at least detectable.
 */

import { CODES, Collector } from './issues.js';
import {
  checkBoolean, checkChronological, checkEnum, checkInteger, checkIsRecord,
  checkNoUnknownKeys, checkRecordId, checkString, checkTimestamp,
  CONTENT_KEY_PATTERN, isAbsent, isPlainObject,
} from './primitives.js';
import { ENVELOPE_FIELD_TOKENS, matchToken, RECORD_TYPES } from './vocabularies.js';

/**
 * The envelope's fields, and no others.
 * @type {readonly string[]}
 */
export const ENVELOPE_FIELDS = Object.freeze([
  'record_id', 'type', 'rev', 'device', 'deleted', 'deleted_at',
  'created_at', 'updated_at', 'resolved_from', 'content',
]);

/**
 * The revision of the divergence this line of history ANSWERED, or null for a record that has never
 * answered one. Written by `core/sync/resolution.js` alone and by nothing else.
 *
 * ## Why a field and not an inference
 *
 * When the coach picks a side, the answer is written at a revision strictly above both — so from the
 * outside it is indistinguishable from an ordinary edit that happens to outrank them. The union read
 * needs to tell those two apart, and it cannot: the difference is not in the numbers.
 *
 * That mattered, and it cost a real edit. `core/sync/areas.js` used to drop a same-revision clash
 * whenever ANY higher revision existed, reading "something outranks both" as "he answered it". Two
 * devices write revision N unaware of each other; one of them, still never having seen the other,
 * edits again to N+1 in the ordinary way. Nothing was resolved and nobody was asked — but a higher
 * revision now exists, so the clash was suppressed and the other device's edit was discarded with
 * nothing said anywhere. This field is what makes that question answerable: N+1 written by an
 * ordinary edit carries the same `resolved_from` its parent did, and only the resolution seam
 * raises it.
 *
 * It is INHERITED rather than cleared, because that inheritance is the whole meaning of the field —
 * it says this line of history descends from an answer, not that this particular write was one.
 * `reviseEnvelope` and `tombstoneEnvelope` carry it forward by spreading the envelope, which is
 * correct and is asserted.
 *
 * It is envelope rather than content by the module's own test: it exists only because there are two
 * devices and a history. It is nullable rather than required so that a record written before this
 * field existed still validates — an absent value means the same thing as null, which is "no answer
 * anywhere in this record's past".
 */
export const RESOLVED_FROM_IS_WRITTEN_ONLY_BY_THE_RESOLUTION_SEAM = true;

/**
 * A device tag: which installation last wrote this revision.
 *
 * It is a stable, human-readable handle chosen once per installation (`coach-laptop`,
 * `coach-phone`). It is deliberately NOT a fingerprint and carries nothing identifying — its
 * only jobs are to make a lost update visible and to break a last-write-wins tie the same
 * way on every device.
 */
export const DEVICE_TAG_PATTERN = CONTENT_KEY_PATTERN;
export const DEVICE_TAG_MIN = 3;
export const DEVICE_TAG_MAX = 60;

/**
 * @typedef {Object} Envelope
 * @property {string} record_id    Stable record identity (UUID). Never the content key.
 * @property {string} type         One of `vocabularies.RECORD_TYPES`.
 * @property {number} rev          Revision, starting at 1, incremented on every write.
 * @property {string} device       Device tag of the installation that wrote this revision.
 * @property {boolean} deleted     Tombstone marker.
 * @property {string|null} deleted_at When the tombstone was raised; null while alive.
 * @property {string} created_at   When this record first existed, anywhere.
 * @property {string} updated_at   When this revision was written.
 * @property {number|null} resolved_from The revision of the divergence this line of history answered.
 * @property {Record<string, unknown>|null} content The content record; null once tombstoned.
 */

/**
 * A fresh record identity.
 *
 * `crypto.randomUUID` is native in browsers and in Node, so this needs no dependency. It is
 * exposed as a function rather than inlined so a test can supply its own identity and get a
 * deterministic record.
 * @returns {string}
 */
export function newRecordId() {
  return globalThis.crypto.randomUUID();
}

/**
 * The current instant in the ONE canonical timestamp form this app writes.
 * @param {number|string|Date} [at] Optional fixed instant, for tests and for replaying a write.
 * @returns {string}
 */
export function timestamp(at) {
  return (at === undefined ? new Date() : new Date(at)).toISOString();
}

/**
 * Wrap a content record in a new envelope at revision 1.
 *
 * @param {{type: string, content: Record<string, unknown>, device: string, now?: number|string|Date, record_id?: string}} args
 * @returns {Envelope}
 */
export function createEnvelope({ type, content, device, now, record_id }) {
  const at = timestamp(now);
  return {
    record_id: record_id || newRecordId(),
    type,
    rev: 1,
    device,
    deleted: false,
    deleted_at: null,
    created_at: at,
    updated_at: at,
    // A record that has just come into existence has answered nothing.
    resolved_from: null,
    content,
  };
}

/**
 * A new envelope holding revised content: revision incremented, `updated_at` and `device`
 * set to this write, identity and `created_at` preserved.
 *
 * Returns a new object. Records are treated as immutable values so that a half-applied edit
 * cannot exist, and so that the outbox can hold a revision independently of whatever the
 * store does next.
 *
 * @param {Envelope} envelope
 * @param {Record<string, unknown>} content
 * @param {{device: string, now?: number|string|Date}} args
 * @returns {Envelope}
 */
export function reviseEnvelope(envelope, content, { device, now }) {
  return {
    ...envelope,
    rev: envelope.rev + 1,
    device,
    updated_at: timestamp(now),
    deleted: false,
    deleted_at: null,
    content,
  };
}

/**
 * Raise a tombstone.
 *
 * The tombstone is a REVISION, not a removal: identity, revision history and timestamps
 * survive, so the deletion propagates to the other device and to the remote copy instead of
 * the record quietly reappearing from a backup on the next sync.
 *
 * The content is DROPPED. A tombstone carries no payload at all. That matters most for a
 * deleted client: a departed client's clinical note must not go on living inside the
 * tombstone that records their departure, and dropping the payload here means no later step
 * has to remember to strip it.
 *
 * @param {Envelope} envelope
 * @param {{device: string, now?: number|string|Date}} args
 * @returns {Envelope}
 */
export function tombstoneEnvelope(envelope, { device, now }) {
  const at = timestamp(now);
  return {
    ...envelope,
    rev: envelope.rev + 1,
    device,
    deleted: true,
    deleted_at: at,
    updated_at: at,
    content: null,
  };
}

/**
 * Last-write-wins between two revisions of the SAME record, written down once.
 *
 * Order of comparison, and the reason for each step:
 *
 *  1. **Higher `rev` wins.** A device that has seen more of a record's history is ahead of
 *     one that has seen less, whatever the clocks say.
 *  2. **Then later `updated_at`.** Two devices that never saw each other's writes can reach
 *     the same revision number; wall-clock is the honest tiebreak.
 *  3. **Then the device tag, lexicographically.** Not meaningful — it exists so that every
 *     device resolves an exact tie the SAME way. A tie broken differently on two devices
 *     converges to two different records, which is the one outcome worse than losing the
 *     write.
 *
 * A tombstone does not win automatically. It is an ordinary revision and is compared like
 * one, so an edit made after a delete correctly resurrects the record.
 *
 * @param {Envelope} a
 * @param {Envelope} b
 * @returns {Envelope} whichever of the two is the winner. Returns `a` on total equality.
 */
export function laterOf(a, b) {
  if (a.rev !== b.rev) return a.rev > b.rev ? a : b;
  if (a.updated_at !== b.updated_at) return a.updated_at > b.updated_at ? a : b;
  if (a.device !== b.device) return a.device > b.device ? a : b;
  return a;
}

/**
 * True when `candidate` should replace `current` under {@link laterOf}.
 * @param {Envelope} current
 * @param {Envelope} candidate
 * @returns {boolean}
 */
export function supersedes(current, candidate) {
  return laterOf(current, candidate) === candidate && !isSameRevision(current, candidate);
}

/**
 * True when two envelopes are the same revision of the same record by the same device.
 * @param {Envelope} a
 * @param {Envelope} b
 * @returns {boolean}
 */
export function isSameRevision(a, b) {
  return a.record_id === b.record_id && a.rev === b.rev && a.device === b.device
    && a.updated_at === b.updated_at;
}

/**
 * Validate the envelope itself.
 *
 * Content is NOT validated here — pass the envelope to `validateRecord` in `index.js` for
 * that. The split is deliberate: the sync engine needs to move a record whose content
 * belongs to a kind it knows nothing about, and it must still be able to check the wrapper.
 *
 * @param {unknown} envelope
 * @returns {import('./issues.js').ValidationResult}
 */
export function validateEnvelope(envelope) {
  const c = new Collector();
  if (!checkIsRecord(c, envelope)) return c.result();
  const e = /** @type {Record<string, unknown>} */ (envelope);

  checkNoUnknownKeys(c, e, ENVELOPE_FIELDS);

  checkRecordId(c, 'record_id', e.record_id, { required: true });
  checkEnum(c, 'type', e.type, RECORD_TYPES, { required: true });
  checkInteger(c, 'rev', e.rev, { required: true, min: 1 });
  checkString(c, 'device', e.device, {
    required: true,
    min: DEVICE_TAG_MIN,
    max: DEVICE_TAG_MAX,
    pattern: DEVICE_TAG_PATTERN,
    patternHint: 'A device tag is lowercase letters, digits and single hyphens, for example coach-laptop.',
  });
  checkBoolean(c, 'deleted', e.deleted, { required: true });
  checkTimestamp(c, 'created_at', e.created_at, { required: true });
  checkTimestamp(c, 'updated_at', e.updated_at, { required: true });
  checkChronological(c, 'updated_at', e.created_at, e.updated_at,
    'A record cannot have been updated before it was created.');

  // Absent means the same as null. A record written before this field existed is not malformed, and
  // refusing it would make an already-stored record unreadable to answer a question about divergence.
  if (!isAbsent(e.resolved_from)) {
    checkInteger(c, 'resolved_from', e.resolved_from, { required: true, min: 1 });
    if (typeof e.resolved_from === 'number' && typeof e.rev === 'number' && e.resolved_from > e.rev) {
      c.add('resolved_from', CODES.MISMATCH,
        'A record cannot descend from an answer given at a revision it has not reached. The answer '
        + 'to a divergence is written ABOVE both sides, so the revision it settled is always below '
        + "this one — a value above it means something other than the resolution seam wrote it.");
    }
  }

  // --- the tombstone is a state, and the three fields that express it must agree ---
  if (e.deleted === true) {
    checkTimestamp(c, 'deleted_at', e.deleted_at, { required: true });
    if (!isAbsent(e.content)) {
      c.add('content', CODES.MISMATCH,
        'A tombstone carries no content. Deleted records must not keep their payload.');
    }
  } else if (e.deleted === false) {
    if (!isAbsent(e.deleted_at)) {
      c.add('deleted_at', CODES.MISMATCH, 'Only a deleted record may carry a deletion time.');
    }
    if (isAbsent(e.content)) {
      c.add('content', CODES.REQUIRED, 'A live record must carry its content.');
    } else if (!isPlainObject(e.content)) {
      c.add('content', CODES.TYPE, 'Content must be a record object.');
    } else {
      checkNoEnvelopeLeak(c.at('content'), /** @type {Record<string, unknown>} */(e.content));
    }
  }

  return c.result();
}

/**
 * Refuse envelope concerns that have leaked into a content record.
 *
 * This is the guard on the one boundary this step is responsible for holding. A revision
 * number, a device tag, a tombstone flag or a sync timestamp inside `content` means the two
 * layers have started to blur, and the cost surfaces late: the content contract acquires
 * fields it explicitly refused, and an importer either fights the file format or silently
 * drops values.
 *
 * `provenance` is deliberately allowed through. It records whether a library record is
 * shipped, shipped-and-edited, or the coach's own, which is a single-device concern that
 * would exist with no sync and no encryption at all — content, by the contract's own test.
 *
 * @param {import('./issues.js').Collector} c
 * @param {Record<string, unknown>} content
 * @returns {boolean}
 */
export function checkNoEnvelopeLeak(c, content) {
  let good = true;
  for (const key of Object.keys(content)) {
    const token = matchToken(key, ENVELOPE_FIELD_TOKENS);
    if (!token) continue;
    good = false;
    c.add(key, CODES.ENVELOPE_LEAK,
      `"${key}" is a record-envelope concern (identity, revision, device, tombstone, timestamps or encryption) and must not appear inside content.`);
  }
  return good;
}
