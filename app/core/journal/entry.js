/**
 * THE ENTRY SHAPE — and the structural reason a record's content cannot get into it.
 *
 * ## What an entry says
 *
 * An entry records **THAT** something happened, of a kind from the closed vocabulary, **TO WHICH**
 * record identity, **WHEN**, and on **WHICH DEVICE**. That is the whole of it. It never says what
 * the record contains, what the client is called, what was written in a note, or what a reading
 * measured.
 *
 * ## Why that is enforced rather than advised
 *
 * Three fields on the client record are ciphertext. Deletion propagates to the record stores, the
 * remote copy and the deletion manifest. A per-client purge removes rows outright so a departed
 * client's clinical note does not live on in a backup. **Every one of those guarantees is about a
 * set of places the data is known to be**, and an audit entry carrying a copy of a note would be a
 * place nobody swept. This build has already measured that exact failure: after a client purge and
 * three syncs, delivered outbox entries still held the client's name and notes text while the
 * record stores and the remote copy were clean.
 *
 * So the refusal here is structural, in three layers, and none of them is a naming convention:
 *
 *  1. **A CLOSED SET OF FIELDS.** {@link createEntry} accepts the fields named in
 *     {@link ENTRY_FIELDS} and refuses any other key outright. There is no `detail`, no `meta`, no
 *     `payload`, no `note`. A caller with something to say has nowhere to put it. Adding a field is
 *     a reviewed change to this file, which is the point — the alternative is one free-form bag
 *     that fills with whatever each call site had to hand.
 *  2. **NO NESTED STRUCTURE.** Every accepted value must be a string, a whole number or null. The
 *     single exception is `subject`, which must be an object with exactly `type` and `record_id`
 *     and nothing else. An array or a nested object anywhere is refused, because a bag of content
 *     smuggled in under an accepted name is the obvious way past layer 1.
 *  3. **IDENTIFIERS MUST LOOK LIKE IDENTIFIERS.** `type` and `record_id` are matched against
 *     conservative patterns that admit no whitespace and bound the length. Prose cannot be parked
 *     in an identifier field, which is the obvious way past layer 2.
 *
 * A test breaks each of those three layers and watches this refuse.
 *
 * ## The result is in the KIND, not in a separate field
 *
 * The security standard this is built to asks for the RESULT of the recorded activity. It is
 * carried by the vocabulary rather than by an `outcome` field beside it: `auth.unlocked` and
 * `auth.unlock_refused` are two kinds, not one kind with a flag. That is deliberate. A flag is a
 * boolean, a boolean is not a valid database key on this platform, and "every refused unlock" is
 * exactly the query an index would have to answer — so a result expressed as a flag would be
 * unindexable, and the index on it would silently hold nothing. Expressed as a kind, it is keyable
 * text. See the note on `by_status_seq` in `core/store/schema.js` for where this build learned it.
 *
 * ## Who did it
 *
 * The standard also asks for the ACTOR. This application has one operator and no server accounts,
 * and the honest actor identity available today is the DEVICE TAG the local store already carries —
 * which is why this file uses that tag and does not invent a second identity beside it. **That is a
 * real gap, and it is stated here rather than papered over**: on a shared device the log cannot say
 * which person acted. Closing it belongs to the step that builds authentication, which will have an
 * identity to record; until then the log must not imply it has one.
 *
 * ## The time is the DEVICE CLOCK
 *
 * `at` comes from the device, and a device clock can be wrong, can drift, and can be set by the
 * person the log is recording. There is no trusted time source in an offline-first application and
 * this file will not pretend otherwise. What the log DOES have is order — the chain in `chain.js`
 * fixes the sequence entries were written in regardless of what their timestamps claim, so a
 * back-dated entry is still detectably out of position.
 */

import { JournalContentError, JournalShapeError } from './errors.js';
import { SUBJECT, assertKind } from './kinds.js';

/**
 * The fields of an entry, in CANONICAL ORDER, which is also the order they are hashed in.
 *
 * The order is fixed here and nowhere else. It matters because the chain hashes a positional
 * serialisation of these values: object key order is an implementation detail of whatever wrote
 * the object, so hashing `JSON.stringify(entry)` would make a chain that verifies on the machine
 * that wrote it and fails on one that reordered the keys. A list makes the order a decision.
 *
 * **Appending a field here changes every hash.** Entries written under the old field list will no
 * longer verify. That is a migration, not an edit — see `JOURNAL.md`.
 *
 * @type {readonly string[]}
 */
export const ENTRY_FIELDS = Object.freeze([
  'entry_id', 'seq', 'device', 'kind', 'at', 'subject', 'affected_count', 'previous_hash',
]);

/** The hash of the entry itself, which is not part of what it hashes. */
export const HASH_FIELD = 'hash';

/** The keys a `subject` may hold, and no others. @type {readonly string[]} */
export const SUBJECT_FIELDS = Object.freeze(['type', 'record_id']);

/** Longest device tag accepted. Generous for a human-chosen tag, far short of prose. */
export const MAX_DEVICE_LENGTH = 64;

/** Longest record type accepted. The longest in the model today is well under this. */
export const MAX_TYPE_LENGTH = 40;

/** Longest record identifier accepted. A UUID is 36. */
export const MAX_RECORD_ID_LENGTH = 100;

/**
 * A record kind: lower-case words joined by hyphens, as the model spells them.
 *
 * Matched by PATTERN rather than against the model's list of kinds, deliberately. An entry written
 * three years ago about a record kind since removed from the model must still verify — its hash
 * covers the type string, so a validity rule that consulted today's model would make old entries
 * unverifiable whenever the model changed. The pattern admits no whitespace, which is what this
 * layer is actually for.
 */
const TYPE_PATTERN = /^[a-z][a-z0-9-]*$/;

/** A record identifier: a UUID in this application, but any opaque token with no whitespace. */
const RECORD_ID_PATTERN = /^[A-Za-z0-9_.:-]+$/;

/** An ISO-8601 instant in UTC, as `Date.prototype.toISOString` produces. */
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** Base64 of a 32-byte digest: 43 characters and one padding character. */
const HASH_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

/**
 * The name of every field this entry shape accepts, as a set, for the unknown-key refusal.
 * @type {ReadonlySet<string>}
 */
const ACCEPTED = new Set([...ENTRY_FIELDS]);

/**
 * Refuse a value that is not a string, a whole number or null.
 *
 * This is layer 2. An object or an array reaching an entry field means something structured is
 * being carried, and the only structured thing in this application is a record's content.
 *
 * @param {string} field
 * @param {unknown} value
 */
function assertFlat(field, value) {
  if (value === null || typeof value === 'string' || Number.isInteger(value)) return;
  if (typeof value === 'object' || Array.isArray(value)) {
    throw new JournalContentError(
      `The log field "${field}" was given structured data. An entry holds flat identifiers, times `
      + 'and counts — never an object or an array, because a structure is how a record\'s content '
      + 'would get in. Record what happened and to which record; the record itself stays in the '
      + 'store, where deletion and the purge can reach it.',
      { field },
    );
  }
  throw new JournalShapeError(
    `The log field "${field}" must be text, a whole number or null; it was ${typeof value}.`,
    { field },
  );
}

/**
 * Validate a subject, or refuse it.
 * @param {unknown} subject
 * @param {{kind: string, subject: string}} spec
 * @returns {{type: string, record_id: string}|null}
 */
function normalizeSubject(subject, spec) {
  if (subject === undefined || subject === null) {
    if (spec.subject === SUBJECT.REQUIRED) {
      throw new JournalShapeError(
        `A "${spec.kind}" entry is meaningless without the record it concerns. Give it a subject `
        + 'of { type, record_id }.',
        { field: 'subject' },
      );
    }
    return null;
  }

  if (spec.subject === SUBJECT.FORBIDDEN) {
    throw new JournalShapeError(
      `A "${spec.kind}" entry is not about a record, so attaching one would assert something that `
      + 'is not true. Leave the subject out.',
      { field: 'subject' },
    );
  }

  if (typeof subject !== 'object' || Array.isArray(subject)) {
    throw new JournalShapeError('A subject is an object of { type, record_id }.', { field: 'subject' });
  }

  for (const key of Object.keys(subject)) {
    if (!SUBJECT_FIELDS.includes(key)) {
      throw new JournalContentError(
        `The subject of a log entry names a record and nothing else, so "${key}" is refused. It `
        + `holds exactly ${SUBJECT_FIELDS.join(' and ')}: WHICH record, not what is in it.`,
        { field: `subject.${key}` },
      );
    }
  }

  const type = /** @type {Record<string, unknown>} */ (subject).type;
  const recordId = /** @type {Record<string, unknown>} */ (subject).record_id;

  if (typeof type !== 'string' || type.length === 0 || type.length > MAX_TYPE_LENGTH
      || !TYPE_PATTERN.test(type)) {
    throw new JournalContentError(
      `"${String(type)}" is not a record type. A type is short lower-case text such as "session" `
      + 'or "diet-plan" — no spaces and no prose, because an identifier field is not somewhere to '
      + 'put a description.',
      { field: 'subject.type' },
    );
  }
  if (typeof recordId !== 'string' || recordId.length === 0
      || recordId.length > MAX_RECORD_ID_LENGTH || !RECORD_ID_PATTERN.test(recordId)) {
    throw new JournalContentError(
      'A record identifier is an opaque token with no whitespace, such as the identifier the store '
      + 'already holds. Prose in this field would be content the purge cannot reach.',
      { field: 'subject.record_id' },
    );
  }

  return Object.freeze({ type, record_id: recordId });
}

/**
 * Build an entry, or refuse.
 *
 * The result carries no hash — hashing and linking belong to `chain.js`, which is the only place
 * that knows what an entry's predecessor was. This function is pure and synchronous so that the
 * shape rules can be tested without any cryptography at all.
 *
 * @param {{
 *   kind: string,
 *   device: string,
 *   seq: number,
 *   entry_id: string,
 *   at?: string,
 *   subject?: {type: string, record_id: string}|null,
 *   affected_count?: number|null,
 *   previous_hash?: string|null,
 * }} fields
 * @returns {Readonly<{entry_id: string, seq: number, device: string, kind: string, at: string, subject: {type: string, record_id: string}|null, affected_count: number|null, previous_hash: string|null}>}
 */
export function createEntry(fields) {
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new JournalShapeError('createEntry needs an object of entry fields.');
  }

  // LAYER 1 — the closed set of fields. Anything else is refused before it is looked at, because
  // the only reason to add a field to an audit entry is to carry something about the record, and
  // that something is content.
  for (const key of Object.keys(fields)) {
    if (!ACCEPTED.has(key)) {
      throw new JournalContentError(
        `The log refuses the field "${key}". An entry holds exactly ${ENTRY_FIELDS.join(', ')} — `
        + 'it records THAT something happened, to WHICH record, WHEN and on WHICH device, and '
        + 'never what the record says. If a later step genuinely needs another fact recorded, add '
        + 'a named, typed field to core/journal/entry.js where a reviewer will see it, rather than '
        + 'passing one through.',
        { field: key },
      );
    }
  }

  // LAYER 2 — flat values only, on every accepted field except the subject.
  for (const field of ENTRY_FIELDS) {
    if (field === 'subject') continue;
    if (fields[field] === undefined) continue;
    assertFlat(field, fields[field]);
  }

  const spec = assertKind(fields.kind);

  const { entry_id: entryId, device, seq } = fields;
  if (typeof entryId !== 'string' || !RECORD_ID_PATTERN.test(entryId)
      || entryId.length > MAX_RECORD_ID_LENGTH) {
    throw new JournalShapeError(
      'An entry needs its own identifier — an opaque token, such as the platform\'s random '
      + 'identifier.', { field: 'entry_id' },
    );
  }
  if (typeof device !== 'string' || device.length < 3 || device.length > MAX_DEVICE_LENGTH) {
    throw new JournalShapeError(
      'An entry records WHICH DEVICE it was written on, and that is the device tag the local store '
      + 'already carries — for example "coach-laptop". There is no second device identity.',
      { field: 'device' },
    );
  }
  if (!Number.isInteger(seq) || seq < 1) {
    throw new JournalShapeError(
      'An entry carries its position in this device\'s chain, counting from 1.', { field: 'seq' },
    );
  }

  const at = fields.at ?? new Date().toISOString();
  if (typeof at !== 'string' || !INSTANT_PATTERN.test(at)) {
    throw new JournalShapeError(
      'An entry is stamped with an ISO-8601 instant in UTC. It comes from the device clock, which '
      + 'is not a trusted time source — see the note at the top of this file.', { field: 'at' },
    );
  }

  const affectedCount = fields.affected_count ?? null;
  if (affectedCount !== null && (!Number.isInteger(affectedCount) || affectedCount < 0)) {
    throw new JournalShapeError(
      'affected_count is HOW MANY records an entry concerns — a whole number, never text. It is '
      + 'the only field that can grow with the work, and it is a count precisely because a count '
      + 'cannot carry a name, a note or a measurement.', { field: 'affected_count' },
    );
  }

  const previousHash = fields.previous_hash ?? null;
  if (previousHash !== null && (typeof previousHash !== 'string' || !HASH_PATTERN.test(previousHash))) {
    throw new JournalShapeError(
      'previous_hash is the base64 digest of the entry before this one, or null for the first '
      + 'entry a device ever wrote.', { field: 'previous_hash' },
    );
  }

  return Object.freeze({
    entry_id: entryId,
    seq,
    device,
    kind: spec.kind,
    at,
    subject: normalizeSubject(fields.subject, spec),
    affected_count: affectedCount,
    previous_hash: previousHash,
  });
}

/**
 * The exact bytes an entry's hash is taken over.
 *
 * A POSITIONAL serialisation — an array of the values in {@link ENTRY_FIELDS} order, with the
 * subject flattened to a two-element array — so that nothing about it depends on the key order of
 * the object that happened to be passed in. Two devices, two runtimes and two schema versions of
 * the same entry serialise identically or the chain is worthless.
 *
 * `hash` is not in it, for the obvious reason: an entry cannot commit to its own digest.
 *
 * @param {{entry_id: string, seq: number, device: string, kind: string, at: string, subject: {type: string, record_id: string}|null, affected_count: number|null, previous_hash: string|null}} entry
 * @returns {string}
 */
export function canonicalText(entry) {
  return JSON.stringify(ENTRY_FIELDS.map((field) => {
    if (field !== 'subject') return entry[field] ?? null;
    return entry.subject === null ? null : [entry.subject.type, entry.subject.record_id];
  }));
}

/**
 * Whether a value has the shape of a stored, hashed entry.
 *
 * Used by the verification pass, which is handed whatever came out of the database and must not
 * assume it is well formed — a chain check that throws on a malformed row cannot report WHERE the
 * chain diverged, which is the one thing it is for.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function looksLikeEntry(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = /** @type {Record<string, unknown>} */ (value);
  return typeof entry.entry_id === 'string'
    && Number.isInteger(entry.seq)
    && typeof entry.device === 'string'
    && typeof entry.kind === 'string'
    && typeof entry.at === 'string'
    && typeof entry[HASH_FIELD] === 'string';
}
