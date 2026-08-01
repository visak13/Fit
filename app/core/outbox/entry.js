/**
 * WHAT ONE QUEUE ENTRY IS.
 *
 * ## An entry is replayable without the session that created it
 *
 * The queue exists because the application will be closed, killed, or backgrounded by the operating
 * system between the moment a write is made and the moment it can be delivered. So an entry may
 * NEVER be a closure, a callback, a reference into a screen's state, or an identifier only the
 * running session can resolve. Everything a delivery needs is a plain value stored on the entry: the
 * operation, where it goes, the bytes to send, and the key that recognises it if it has already
 * landed.
 *
 * That is the whole reason `payload` is text held verbatim rather than a promise of text or a
 * pointer to a record. A pointer would be resolved against a store that has since changed, and the
 * delivery would silently send something other than what was acknowledged to the coach.
 *
 * ## Ciphertext passes through untouched
 *
 * `payload` is carried exactly as given. This module never encrypts, decrypts, inspects, parses or
 * logs it. Whether it is JSON or a sealed value is not this layer's business.
 *
 * ## Statuses are keyable TEXT, never flags
 *
 * A boolean is not a valid key in the browser's indexed database: an index on one silently holds
 * ZERO entries, and every query against it comes back empty while the code, the schema and the query
 * all look correct. That was measured on this build. So the queue's state is a small vocabulary of
 * strings, indexed as `['status', 'seq']`, and there is no `pending` flag anywhere.
 */

import { newRecordId, timestamp } from '../model/model.js';

/** The entry format. Stamped on every entry so a later format change can be recognised. */
export const ENTRY_VERSION = 1;

/**
 * The four states an entry can be in. Text, because a key must be.
 *
 * - `pending`   — not delivered, and the queue will attempt it again. The only non-terminal state.
 * - `delivered` — it landed. Kept as evidence rather than removed, and the ONLY status that is
 *                 bounded: `recordDelivered` holds the newest cap-many and discards the oldest beyond
 *                 it, in the same transaction. See `retention.js`.
 * - `rejected`  — the remote refused it in a way retrying cannot fix. STOPPED, and visible.
 * - `ambiguous` — it may have landed, possibly more than once, and the queue refuses to guess.
 *                 STOPPED, and visible.
 *
 * `rejected` and `ambiguous` are separate because they need different words in front of the coach: a
 * rejection means the remote said no, an ambiguity means we cannot tell and a person must look.
 * Both are counted into the attention figure, and neither is ever retried in silence.
 */
export const STATUS = Object.freeze({
  PENDING: 'pending',
  DELIVERED: 'delivered',
  REJECTED: 'rejected',
  AMBIGUOUS: 'ambiguous',
});

/** @type {readonly string[]} */
export const STATUS_VALUES = Object.freeze(Object.values(STATUS));

/** The statuses that will never be attempted again. */
export const TERMINAL_STATUSES = Object.freeze([STATUS.DELIVERED, STATUS.REJECTED, STATUS.AMBIGUOUS]);

/**
 * The statuses that mean the coach's data is NOT yet where it belongs.
 *
 * `pending` is still on its way. `rejected` and `ambiguous` have stopped, which is worse — an entry
 * that stopped silently is indistinguishable from one that succeeded, and this queue exists so that
 * is never the case.
 */
export const UNDELIVERED_STATUSES = Object.freeze([STATUS.PENDING, STATUS.REJECTED, STATUS.AMBIGUOUS]);

/**
 * Why a pending entry is not being attempted right now. Text, for the same reason as the status.
 *
 * - `none`       — due; the next flush will attempt it.
 * - `backoff`    — a transient failure; waiting out a growing delay before trying again.
 * - `credential` — the credential is expired. Waiting for the next opportunity, which needs a user
 *                  gesture. Attempts are NOT burned against this, because retrying alone can never
 *                  help and each pointless attempt would push out the backoff of everything behind.
 */
export const HOLD = Object.freeze({ NONE: 'none', BACKOFF: 'backoff', CREDENTIAL: 'credential' });

/** @type {readonly string[]} */
export const HOLD_VALUES = Object.freeze(Object.values(HOLD));

/**
 * The three operations the queue can carry.
 *
 * Deliberately a subset of the port's six: the queue carries WRITES, because a write is the thing
 * that can be lost. A read is re-issued freely and needs no durability.
 */
export const OPERATION = Object.freeze({ CREATE: 'create', OVERWRITE: 'overwrite', REMOVE: 'remove' });

/** @type {readonly string[]} */
export const OPERATION_VALUES = Object.freeze(Object.values(OPERATION));

/**
 * @typedef {Object} OutboxEntry
 * @property {string} entry_id           Identity. The primary key.
 * @property {number} entry_version      {@link ENTRY_VERSION} at the time it was written.
 * @property {number} seq                Monotonic. Replay order, and it never changes.
 * @property {string} idempotency_key    Client-generated, stable, unique across the queue. The whole
 *                                       of how a replay is told from a fresh write.
 * @property {string} operation          One of {@link OPERATION_VALUES}.
 * @property {string} space              Which remote space, by role.
 * @property {string|null} name          The remote name. Required for `create`, and it must carry
 *                                       the idempotency key — see `recognition.js`.
 * @property {string|null} target_file_id The opaque identifier. Required for `overwrite`/`remove`.
 * @property {string|null} payload       The bytes to send, as text, VERBATIM. Null for `remove`.
 * @property {number|null} expected_revision The revision this write was composed against, when the
 *                                       caller knows it. Enables lost-update DETECTION — never a
 *                                       lock, because the service has no conditional match.
 * @property {string} label              Plain words for the coach: "backup of the client library".
 * @property {readonly string[]} refs    Record identities this delivery is about, for the surface
 *                                       that tells him WHAT is unsynced. May be empty.
 * @property {string} status             One of {@link STATUS_VALUES}.
 * @property {string} hold               One of {@link HOLD_VALUES}. Meaningful while pending.
 * @property {string} device             Which device queued it.
 * @property {string} enqueued_at        When it was queued. The age figure is measured from here.
 * @property {number} attempts           Delivery attempts that actually reached a verdict.
 * @property {string|null} last_attempt_at
 * @property {string} next_attempt_at    Not before this instant. Always present, so a due check is
 *                                       one comparison and never a special case.
 * @property {{code: string, message: string, classification: string, at: string}|null} last_error
 * @property {string|null} settled_at    When it reached a terminal status.
 * @property {import('../remote/port.js').RemoteFileMeta|null} result_meta What landed, if it did.
 * @property {string|null} delivery_note How the delivery was concluded, in plain words — including
 *                                       "an earlier attempt had already landed", which is the line
 *                                       that explains an entry whose attempts do not match its story.
 * @property {readonly string[]} ambiguity Identifiers found when more than one file answered to this
 *                                       delivery's name. Surfaced, never resolved by guessing.
 */

/**
 * Compose a fresh pending entry.
 *
 * `seq` is supplied by the queue, inside the transaction that stores the entry, because it must be
 * allocated exactly once and two windows share one database.
 *
 * @param {{operation: string, space: string, name?: string|null, target_file_id?: string|null,
 *          payload?: string|null, expected_revision?: number|null, label: string,
 *          refs?: readonly string[], idempotency_key?: string, device: string, seq: number,
 *          entry_id?: string, now?: number|string|Date}} args
 * @returns {OutboxEntry}
 */
export function newEntry(args) {
  const at = timestamp(args.now);
  return {
    entry_id: args.entry_id || newRecordId(),
    entry_version: ENTRY_VERSION,
    seq: args.seq,
    idempotency_key: args.idempotency_key || newRecordId(),
    operation: args.operation,
    space: args.space,
    name: args.name ?? null,
    target_file_id: args.target_file_id ?? null,
    payload: args.payload ?? null,
    expected_revision: args.expected_revision ?? null,
    label: args.label,
    refs: Object.freeze([...(args.refs || [])]),
    status: STATUS.PENDING,
    hold: HOLD.NONE,
    device: args.device,
    enqueued_at: at,
    attempts: 0,
    last_attempt_at: null,
    next_attempt_at: at,
    last_error: null,
    settled_at: null,
    result_meta: null,
    delivery_note: null,
    ambiguity: Object.freeze([]),
  };
}

/**
 * Everything wrong with an entry, as field-level issues.
 *
 * Written as a list rather than a throw-on-first-problem so a caller sees every fault at once, which
 * is the same discipline the record model uses.
 *
 * @param {any} entry
 * @returns {{ok: boolean, issues: {path: string, message: string}[]}}
 */
export function validateEntry(entry) {
  /** @type {{path: string, message: string}[]} */
  const issues = [];
  const bad = (path, message) => issues.push({ path, message });

  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return { ok: false, issues: [{ path: '', message: 'An outbox entry must be an object.' }] };
  }

  for (const field of ['entry_id', 'idempotency_key', 'label', 'device', 'enqueued_at', 'next_attempt_at']) {
    if (typeof entry[field] !== 'string' || entry[field].length === 0) {
      bad(field, `${field} is required and must be text.`);
    }
  }
  if (!Number.isInteger(entry.seq) || entry.seq < 1) bad('seq', 'seq must be a whole number from 1 upward.');
  if (!Number.isInteger(entry.attempts) || entry.attempts < 0) bad('attempts', 'attempts must be a whole number.');
  if (!STATUS_VALUES.includes(entry.status)) bad('status', `status must be one of ${STATUS_VALUES.join(', ')}.`);
  if (!HOLD_VALUES.includes(entry.hold)) bad('hold', `hold must be one of ${HOLD_VALUES.join(', ')}.`);
  if (!OPERATION_VALUES.includes(entry.operation)) {
    bad('operation', `operation must be one of ${OPERATION_VALUES.join(', ')}.`);
  }
  if (typeof entry.space !== 'string' || entry.space.length === 0) bad('space', 'space is required.');
  if (!Array.isArray(entry.refs)) bad('refs', 'refs must be a list, even when empty.');

  // A boolean would be accepted by the object store and then vanish from every index built on it.
  // Refusing one here is cheaper than discovering an empty query later.
  for (const field of ['status', 'hold']) {
    if (typeof entry[field] === 'boolean') bad(field, `${field} must be text; a boolean is not a valid key.`);
  }

  if (entry.operation === OPERATION.CREATE) {
    if (typeof entry.name !== 'string' || entry.name.length === 0) {
      bad('name', 'A create needs the remote name it will be written under.');
    } else if (typeof entry.idempotency_key === 'string' && !entry.name.includes(entry.idempotency_key)) {
      // This is the load-bearing one. Recognition of an already-landed create is a listing by name,
      // because a name is the only thing a listing can be filtered on. If the key is not in the
      // name, a replay after a lost acknowledgement cannot tell its own earlier write from a
      // different file, and the choices are to duplicate or to skip. Both are wrong.
      bad('name', 'The remote name must contain the idempotency key, or a replay cannot recognise its own earlier write. Use keyedName().');
    }
    if (typeof entry.payload !== 'string') bad('payload', 'A create needs its content as text.');
  }

  if (entry.operation === OPERATION.OVERWRITE) {
    if (typeof entry.target_file_id !== 'string' || entry.target_file_id.length === 0) {
      bad('target_file_id', 'An overwrite needs the identifier of the file it replaces.');
    }
    if (typeof entry.payload !== 'string') bad('payload', 'An overwrite needs its content as text.');
  }

  if (entry.operation === OPERATION.REMOVE) {
    if (typeof entry.target_file_id !== 'string' || entry.target_file_id.length === 0) {
      bad('target_file_id', 'A removal needs the identifier of the file to remove.');
    }
  }

  if (entry.expected_revision !== null && entry.expected_revision !== undefined
      && !Number.isInteger(entry.expected_revision)) {
    bad('expected_revision', 'expected_revision, when given, must be a whole number.');
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Put the idempotency key into a remote name, before the final extension.
 *
 * `library-backup.json` becomes `library-backup.<key>.json`, which stays readable to the account
 * holder browsing the folder while giving a replay something exact to look for.
 *
 * @param {string} base
 * @param {string} key
 * @returns {string}
 */
export function keyedName(base, key) {
  if (typeof base !== 'string' || base.length === 0) throw new Error('A base name is required.');
  if (typeof key !== 'string' || key.length === 0) throw new Error('An idempotency key is required.');
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return `${base}.${key}`;
  return `${base.slice(0, dot)}.${key}${base.slice(dot)}`;
}

/** @param {OutboxEntry} entry @returns {boolean} */
export function isTerminal(entry) {
  return TERMINAL_STATUSES.includes(entry.status);
}

/**
 * Is this pending entry due to be attempted at this instant?
 *
 * A credential hold is never due on a timer. It becomes due when the credential is renewed, which
 * needs a user gesture — so the queue clears the hold on renewal rather than waiting for a clock.
 *
 * @param {OutboxEntry} entry
 * @param {string} now A canonical timestamp.
 * @returns {boolean}
 */
export function isDue(entry, now) {
  if (entry.status !== STATUS.PENDING) return false;
  if (entry.hold === HOLD.CREDENTIAL) return false;
  return entry.next_attempt_at <= now;
}

/**
 * How long this entry has been waiting, in milliseconds.
 * @param {OutboxEntry} entry
 * @param {string|number|Date} now
 * @returns {number}
 */
export function ageMs(entry, now) {
  const at = Date.parse(entry.enqueued_at);
  const then = typeof now === 'number' ? now : new Date(now).getTime();
  return Math.max(0, then - at);
}
