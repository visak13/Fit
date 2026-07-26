/**
 * THE CLOSED VOCABULARY — and the refusal that keeps it closed.
 *
 * ## Why this file is the point of the whole package
 *
 * The decision behind this step names the failure it is preventing in its own closing words:
 * *assign ownership of the log to a step, do not let each step invent its own.* An audit log whose
 * vocabulary grows one string at a time, at whichever call site needed one that afternoon, cannot
 * answer a question. "Every authentication event" becomes a `grep` over strings that four different
 * steps spelled four different ways, and the answer is silently incomplete — which is worse than no
 * answer, because it looks like one.
 *
 * So the set below is CLOSED, and {@link assertKind} THROWS on anything outside it. That refusal is
 * the mechanism. A later step that genuinely needs a new kind must add it here, where it is one
 * line in a reviewed diff beside every other kind, instead of passing a string that works.
 *
 * ## The five domains, and the sixth thing
 *
 * The security standard this application is built to names five domains of activity that must be
 * recorded: **authentication, record changes, exports, synchronisation, and key and recovery
 * activity.** All five are defined here.
 *
 * **Authentication and export kinds have no call sites yet, and that is deliberate.** The steps
 * that own them do not exist. Defining them now — before those steps are written — is the entire
 * reason this step comes first: the step that eventually writes an unlock event will find the kind
 * already named and typed, and will not get to choose. Nothing here stubs a fake call site to make
 * a kind look used.
 *
 * **A THIRD kind is unwritten, for a different reason, and the difference matters.**
 * {@link JOURNAL_KINDS.SYNC_CONFLICT_RESOLVED} means *one revision was chosen over the other*, and
 * `core/sync` never chooses. `divergence.js` sends a same-revision clash between two devices to
 * `VERDICT.DIVERGED`, which the engine SURFACES and applies neither side of — `NEVER_RESOLVED_BY_
 * GUESSING` is a declared value with a test on it. Everything else is an ordinary last-write-wins
 * supersede, which that module's own header calls the ordinary case rather than a conflict. So the
 * only place this kind can honestly be written is the surface where the coach picks a side, and
 * that surface is not built. Writing it at the supersede path would relabel every routine pull as a
 * collision and make the log overstate how often his devices actually clashed. When that surface
 * arrives it will be making a paired store write, so its entry rides `recordChange` rather than
 * standing alone. `unwritten-kinds.test.js` asserts all three sets stay unwritten.
 *
 * ## The vocabulary is closed, not frozen
 *
 * The wiring step added three kinds to the key-and-recovery domain — `key.establish_refused` and
 * the two duplicate detections — because the activity they name is real, happens in `guard.js`
 * today, and no defined kind covered it. `key.recovery_refused` is a recovery attempt that failed
 * to open the key, which is not what a device refusing to CREATE key material is, and neither is a
 * duplicate listing. That is this file's own extension procedure working as intended: a kind
 * arrives here, beside every other kind, with its domain and its subject rule, in a reviewed diff —
 * rather than a call site passing a string that happens to work.
 *
 * The two detections are two kinds rather than one carrying which-object-it-was, because the result
 * belongs in the kind for the same reason `auth.unlocked` and `auth.unlock_refused` are separate:
 * *"every duplicate recovery object ever detected"* is a question the log has to be able to answer,
 * and there is no field for it to answer from — the field set is closed, and a boolean is not a
 * valid key on this platform.
 *
 * There is one kind outside the five: {@link JOURNAL_KINDS.RETENTION_PRUNED}. The log is bounded,
 * so entries are eventually discarded, and a discarded entry leaves a chain whose head no longer
 * links to anything. Verification cannot tell that gap apart from a deletion by an attacker unless
 * the log itself says a retention pass happened and what it left behind. A log that cannot explain
 * its own gaps is a log that cries wolf on every honest prune. See `JOURNAL.md`.
 *
 * ## Each kind declares whether it is ABOUT a record
 *
 * A kind is not just a name — it carries whether an entry of that kind must, may, or must not name
 * a record. `auth.unlocked` is about a device and a person, not about a client, and an entry that
 * attached a client to it would be asserting something untrue. `record.updated` without a record is
 * meaningless. The vocabulary enforces both directions; see `entry.js`.
 */

import { JournalKindError } from './errors.js';

/**
 * Whether an entry of a kind names the record it concerns.
 *
 * Three values and not a boolean, because "must not" and "may" are genuinely different and
 * collapsing them would let an authentication entry acquire a client identity by accident.
 * @readonly
 */
export const SUBJECT = Object.freeze({
  /** The entry is meaningless without a record identity. */
  REQUIRED: 'required',
  /** The entry may concern one record or none — a sync pass covers many, or zero. */
  OPTIONAL: 'optional',
  /** The entry is not about a record at all, and attaching one would assert something untrue. */
  FORBIDDEN: 'forbidden',
});

/** The five recorded domains, plus the log's own housekeeping. @readonly */
export const DOMAIN = Object.freeze({
  AUTHENTICATION: 'authentication',
  RECORD_CHANGE: 'record_change',
  EXPORT: 'export',
  SYNCHRONISATION: 'synchronisation',
  KEY_AND_RECOVERY: 'key_and_recovery',
  /** Not one of the five. The log's account of its own retention — see the note above. */
  JOURNAL: 'journal',
});

/**
 * Every kind the log accepts, as data.
 *
 * Written as a value rather than a list of strings so that the per-kind rules travel with the name
 * and a test can assert over the whole set rather than over the ones a fixture remembered.
 *
 * @type {Readonly<Record<string, {kind: string, domain: string, subject: string, means: string}>>}
 */
export const KIND_SPECS = Object.freeze({
  // ── Authentication ─────────────────────────────────────────────────────────────────────────
  // DEFINED AND UNWRITTEN. The step that owns the unlock screen does not exist yet.
  'auth.unlocked': {
    kind: 'auth.unlocked', domain: DOMAIN.AUTHENTICATION, subject: SUBJECT.FORBIDDEN,
    means: 'the local data was unlocked on this device',
  },
  'auth.unlock_refused': {
    kind: 'auth.unlock_refused', domain: DOMAIN.AUTHENTICATION, subject: SUBJECT.FORBIDDEN,
    means: 'an unlock attempt did not succeed — a wrong passphrase, a missing slot, a locked-out device',
  },
  'auth.locked': {
    kind: 'auth.locked', domain: DOMAIN.AUTHENTICATION, subject: SUBJECT.FORBIDDEN,
    means: 'the local data was locked again, by the coach or by inactivity',
  },
  'auth.account_connected': {
    kind: 'auth.account_connected', domain: DOMAIN.AUTHENTICATION, subject: SUBJECT.FORBIDDEN,
    means: 'a remote account was authorised for this installation',
  },
  'auth.account_disconnected': {
    kind: 'auth.account_disconnected', domain: DOMAIN.AUTHENTICATION, subject: SUBJECT.FORBIDDEN,
    means: 'a remote account was revoked or signed out',
  },

  // ── Record changes ─────────────────────────────────────────────────────────────────────────
  'record.created': {
    kind: 'record.created', domain: DOMAIN.RECORD_CHANGE, subject: SUBJECT.REQUIRED,
    means: 'a record came into existence on this device',
  },
  'record.updated': {
    kind: 'record.updated', domain: DOMAIN.RECORD_CHANGE, subject: SUBJECT.REQUIRED,
    means: 'a record was revised on this device',
  },
  'record.deleted': {
    kind: 'record.deleted', domain: DOMAIN.RECORD_CHANGE, subject: SUBJECT.REQUIRED,
    means: 'a record was tombstoned — its content is gone, its identity remains',
  },
  'record.purged': {
    kind: 'record.purged', domain: DOMAIN.RECORD_CHANGE, subject: SUBJECT.OPTIONAL,
    means: 'rows were removed outright rather than tombstoned — the per-client purge',
  },
  'record.imported': {
    kind: 'record.imported', domain: DOMAIN.RECORD_CHANGE, subject: SUBJECT.OPTIONAL,
    means: 'records arrived from a backup or another device and were merged in',
  },

  // ── Exports ────────────────────────────────────────────────────────────────────────────────
  // DEFINED AND UNWRITTEN. The step that owns the export screen does not exist yet. An export is
  // a disclosure — data leaving the application in readable form — which is why it is recorded at
  // all, and why it is recorded even when it fails.
  'export.started': {
    kind: 'export.started', domain: DOMAIN.EXPORT, subject: SUBJECT.OPTIONAL,
    means: 'an export of data out of the application began',
  },
  'export.completed': {
    kind: 'export.completed', domain: DOMAIN.EXPORT, subject: SUBJECT.OPTIONAL,
    means: 'an export finished and the data left the application',
  },
  'export.refused': {
    kind: 'export.refused', domain: DOMAIN.EXPORT, subject: SUBJECT.OPTIONAL,
    means: 'an export did not complete — it failed, or it was declined',
  },

  // ── Synchronisation ────────────────────────────────────────────────────────────────────────
  'sync.started': {
    kind: 'sync.started', domain: DOMAIN.SYNCHRONISATION, subject: SUBJECT.FORBIDDEN,
    means: 'a synchronisation pass began',
  },
  'sync.completed': {
    kind: 'sync.completed', domain: DOMAIN.SYNCHRONISATION, subject: SUBJECT.FORBIDDEN,
    means: 'a synchronisation pass genuinely drained what it set out to send',
  },
  'sync.refused': {
    kind: 'sync.refused', domain: DOMAIN.SYNCHRONISATION, subject: SUBJECT.FORBIDDEN,
    means: 'a synchronisation pass stopped — a dead credential, an account mismatch, no network',
  },
  'sync.conflict_resolved': {
    kind: 'sync.conflict_resolved', domain: DOMAIN.SYNCHRONISATION, subject: SUBJECT.REQUIRED,
    means: 'two devices had written the same record and one revision was chosen over the other',
  },

  // ── Keys and recovery ──────────────────────────────────────────────────────────────────────
  'key.established': {
    kind: 'key.established', domain: DOMAIN.KEY_AND_RECOVERY, subject: SUBJECT.FORBIDDEN,
    means: 'the data key came into existence for this installation',
  },
  'key.slot_added': {
    kind: 'key.slot_added', domain: DOMAIN.KEY_AND_RECOVERY, subject: SUBJECT.FORBIDDEN,
    means: 'a new way into the data key was added — a device, a passphrase, a recovery object',
  },
  'key.slot_removed': {
    kind: 'key.slot_removed', domain: DOMAIN.KEY_AND_RECOVERY, subject: SUBJECT.FORBIDDEN,
    means: 'a way into the data key was withdrawn',
  },
  'key.recovery_used': {
    kind: 'key.recovery_used', domain: DOMAIN.KEY_AND_RECOVERY, subject: SUBJECT.FORBIDDEN,
    means: 'the recovery object was used to reach the data key',
  },
  'key.recovery_refused': {
    kind: 'key.recovery_refused', domain: DOMAIN.KEY_AND_RECOVERY, subject: SUBJECT.FORBIDDEN,
    means: 'a recovery attempt did not open the data key',
  },
  'key.establish_refused': {
    kind: 'key.establish_refused', domain: DOMAIN.KEY_AND_RECOVERY, subject: SUBJECT.FORBIDDEN,
    means: 'this device declined to bring key material into existence, because it has never reached '
      + 'the hidden space and therefore cannot know whether a data key already exists — the refusal '
      + 'that stops a second key being generated and the ciphertext splitting silently',
  },
  'key.duplicate_envelope_detected': {
    kind: 'key.duplicate_envelope_detected', domain: DOMAIN.KEY_AND_RECOVERY,
    subject: SUBJECT.FORBIDDEN,
    means: 'more than one key envelope was found in the hidden space, so nothing was chosen and '
      + 'nothing was written — the split-key state, surfaced rather than guessed at',
  },
  'key.duplicate_recovery_detected': {
    kind: 'key.duplicate_recovery_detected', domain: DOMAIN.KEY_AND_RECOVERY,
    subject: SUBJECT.FORBIDDEN,
    means: 'more than one recovery object was found in the hidden space, so nothing was chosen and '
      + 'nothing was written — worse than the envelope case, because it stays silent until somebody '
      + 'actually needs to recover',
  },

  // ── The log's own account of itself ────────────────────────────────────────────────────────
  'journal.retention_pruned': {
    kind: 'journal.retention_pruned', domain: DOMAIN.JOURNAL, subject: SUBJECT.FORBIDDEN,
    means: 'the log discarded its oldest entries under the retention policy, and this entry is the '
      + 'record of what was discarded so that verification can tell a prune from a deletion',
  },
});

/**
 * The kinds, as constants, so a call site names one rather than spelling one.
 *
 * A typo in `JOURNAL_KINDS.RECORD_UPDATED` is a `TypeError` at the call site; a typo in
 * `'record.updatd'` is a runtime refusal at best and a silently different kind at worst. Both
 * doors are guarded — {@link assertKind} catches the string — but only one of them is caught by
 * the type checker before anything runs.
 * @readonly
 */
export const JOURNAL_KINDS = Object.freeze({
  UNLOCKED: 'auth.unlocked',
  UNLOCK_REFUSED: 'auth.unlock_refused',
  LOCKED: 'auth.locked',
  ACCOUNT_CONNECTED: 'auth.account_connected',
  ACCOUNT_DISCONNECTED: 'auth.account_disconnected',

  RECORD_CREATED: 'record.created',
  RECORD_UPDATED: 'record.updated',
  RECORD_DELETED: 'record.deleted',
  RECORD_PURGED: 'record.purged',
  RECORD_IMPORTED: 'record.imported',

  EXPORT_STARTED: 'export.started',
  EXPORT_COMPLETED: 'export.completed',
  EXPORT_REFUSED: 'export.refused',

  SYNC_STARTED: 'sync.started',
  SYNC_COMPLETED: 'sync.completed',
  SYNC_REFUSED: 'sync.refused',
  SYNC_CONFLICT_RESOLVED: 'sync.conflict_resolved',

  KEY_ESTABLISHED: 'key.established',
  KEY_SLOT_ADDED: 'key.slot_added',
  KEY_SLOT_REMOVED: 'key.slot_removed',
  RECOVERY_USED: 'key.recovery_used',
  RECOVERY_REFUSED: 'key.recovery_refused',
  ESTABLISH_REFUSED: 'key.establish_refused',
  DUPLICATE_ENVELOPE_DETECTED: 'key.duplicate_envelope_detected',
  DUPLICATE_RECOVERY_DETECTED: 'key.duplicate_recovery_detected',

  RETENTION_PRUNED: 'journal.retention_pruned',
});

/** Every kind, in declaration order. @type {readonly string[]} */
export const KINDS = Object.freeze(Object.keys(KIND_SPECS));

/** The kinds belonging to one domain. @param {string} domain @returns {readonly string[]} */
export function kindsInDomain(domain) {
  return Object.freeze(KINDS.filter((kind) => KIND_SPECS[kind].domain === domain));
}

/** @param {unknown} kind @returns {boolean} Whether the vocabulary contains this kind. */
export function isKnownKind(kind) {
  return typeof kind === 'string' && Object.hasOwn(KIND_SPECS, kind);
}

/**
 * THE REFUSAL. Return the specification for a kind, or throw.
 *
 * There is no permissive mode, no option to warn instead, and no fallback kind such as `other`. A
 * fallback would be the escape hatch that makes the whole vocabulary advisory: the first call site
 * under time pressure would reach for it, and the log would fill with entries that mean nothing in
 * particular. If the kind you need is not here, add it here.
 *
 * @param {unknown} kind
 * @returns {{kind: string, domain: string, subject: string, means: string}}
 * @throws {JournalKindError} on anything the vocabulary does not contain.
 */
export function assertKind(kind) {
  const spec = isKnownKind(kind) ? KIND_SPECS[/** @type {string} */ (kind)] : undefined;
  if (!spec) {
    throw new JournalKindError(
      `${JSON.stringify(kind)} is not an event kind this log defines. The vocabulary is closed: `
      + 'add the kind to core/journal/kinds.js, with the domain it belongs to and whether it names '
      + 'a record, rather than writing a string this log has never heard of. '
      + `The ${KINDS.length} kinds it does define are: ${KINDS.join(', ')}.`,
      { kind },
    );
  }
  return spec;
}
