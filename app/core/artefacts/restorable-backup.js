/**
 * THE RESTORABLE BACKUP — the document, and the reader that turns one back into records.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  A FILE THAT HOLDS THE DATA AND THAT NOTHING CAN READ BACK IS NOT A BACKUP. IT IS A LISTING.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * That distinction is the whole reason this module exists, and until it did, the application was on
 * the wrong side of it: the reset-to-defaults confirmation offered to save a copy first, the offer
 * produced a real file, and NOTHING IN THE APPLICATION READ ONE BACK IN. The coach's safety net
 * before a destructive act was a file he would have had to reconstruct by hand.
 *
 * ## TWO FILE SHAPES, ONE READER, AND THE SECOND SHAPE IS WHY
 *
 * There are two archives this application has ever written, and a reader that could only read the
 * new one would have left the old gap exactly where it was.
 *
 *  - **`full`** — what {@link backupParts} writes. Every record kind, as ENVELOPES, so identity,
 *    revision and provenance all survive the round trip.
 *  - **`library`** — the file the reset offer already produces, through `library-backup.js`. Three
 *    library kinds, as bare CONTENT, and no manifest. It predates this module and it is the file
 *    that actually stands between the coach and a mis-tapped reset.
 *
 * {@link readBackupParts} reads both and normalises them, so there is ONE restore path rather than
 * two that drift. What it will not do is GUESS: a file it does not recognise is refused by name.
 *
 * ## IDENTITY IS DIFFERENT FOR THE TWO HALVES OF THE MODEL, AND A RESTORE MUST RESPECT THAT
 *
 * Library content is addressed by its CONTENT KEY (`back-squat`, `push-day`) and app-authored
 * records by their record identity. That is the model's own rule, and it is why the `library` shape
 * can be restored at all despite carrying no envelopes: a content key is enough to find the record
 * it belongs to. An app-authored record without its identity, by contrast, cannot be restored
 * without inventing one — and an invented identity is a session that no longer belongs to anybody.
 * So this module REFUSES an app-authored record with no identity rather than minting one.
 *
 * ## WHAT IS NOT HERE
 *
 * No referential check of its own. {@link backupReferenceIssues} calls `checkRoutineReferences` and
 * `checkSessionReferences` from the model, which is where those rules live and where they are
 * already tested. A restore is the most dangerous writer in the application — a backup taken from a
 * healthy library, replayed into a store whose exercises differ, produces routines pointing at
 * nothing, committed silently — and the answer to that is to CALL the existing check, not to write a
 * second one that can disagree with it.
 *
 * No store, no clock, no cryptography, no browser. The instant is an argument; the records are an
 * argument; the sealing belongs to the caller.
 */

import { checkRoutineReferences, checkSessionReferences } from '../model/referential.js';
import { LIBRARY_TYPES, RECORD_TYPES } from '../model/vocabularies.js';
import { contentOf, recordsParts, recordsTable } from './records-table.js';
import { KIND_WORDS, LIBRARY_BACKUP_KINDS } from './library-backup.js';

/**
 * The marker a file carries so that a reader years from now IDENTIFIES it rather than guessing.
 *
 * Deliberately not called `document`: this package's own purity suite forbids that name outright,
 * because it is also the browser's, and a guard that had to tell the two apart would be a guard that
 * could be talked out of.
 */
export const BACKUP_DOCUMENT = 'fit-backup';

/** Format version. A version this code does not know is refused rather than guessed at. */
export const BACKUP_VERSION = 1;

/** What the manifest part is called inside the archive. Its presence is what makes a file `full`. */
export const MANIFEST_PART = 'backup.json';

/** The backup's own name, before the extension the caller adds. */
export const BACKUP_TITLE = 'Fit backup';

/**
 * EVERY KIND A FULL BACKUP COVERS — the model's own list, re-exported rather than restated.
 *
 * The same reasoning `library-backup.js` records for its three: a tenth record kind added to the
 * model next year arrives here without anybody remembering, and a backup handed a set with no entry
 * for one of them is REFUSED rather than written short. A list typed into this file would be a list
 * that falls behind the model silently, and the symptom would be a backup that opens cleanly and
 * restores a practice missing a kind.
 * @type {readonly string[]}
 */
export const BACKUP_KINDS = RECORD_TYPES;

/** What each kind is called in the readable half and in anything shown to the coach. */
export const BACKUP_KIND_WORDS = Object.freeze({
  ...KIND_WORDS,
  client: 'Clients',
  session: 'Sessions',
  'performed-record': 'What was performed',
  reading: 'Readings',
  'session-note': 'Session notes',
  'diet-plan': 'Diet plans',
});

/** Refused when the WHOLE selection is empty. A practice with no diet plans yet is still a practice. */
export const NOTHING_TO_BACK_UP =
  'There is nothing in this practice to back up yet. A backup of nothing is a file that would tell '
  + 'you everything was safe.';

/**
 * @typedef {Object} BackupSet
 * @property {Record<string, unknown[]>} kinds Keyed by record kind. EVERY kind in
 *   {@link BACKUP_KINDS} must be present; an empty list is fine, a missing key is not.
 * @property {string} taken_at The instant, supplied rather than read.
 * @property {string} [device] The device tag that took it, for a person reading the file later.
 */

/**
 * ONE RECORD AS A RESTORE NEEDS IT, whichever shape of file it came out of.
 *
 * `deleted` is carried rather than dropped, and that is load-bearing. A tombstone is a REVISION,
 * not an absence — the deletion is the record. A backup that quietly kept only living records would
 * restore a practice in which every client the coach had removed came back, which is precisely the
 * resurrection this build has already had to fix once in the sync engine.
 *
 * `content` is `null` on a tombstone, because a tombstone carries no payload at all: a departed
 * client's clinical note must not go on living inside the record of their departure.
 *
 * @typedef {{record_id: string|null, content: Record<string, any>|null, deleted: boolean}} BackupRecord
 */

/**
 * @typedef {Object} ReadBackup
 * @property {'full'|'library'} shape Which of the two archives this was.
 * @property {readonly string[]} covers The kinds the file actually carried. A `library` file covers
 *   three; the kinds it does not cover are NOT restored and are NOT emptied.
 * @property {Record<string, BackupRecord[]>} records Every record, tombstones included.
 * @property {Record<string, Record<string, any>[]>} content LIVING content only, per covered kind —
 *   what the referential check reads, since a tombstone references nothing.
 * @property {Record<string, (string|null)[]>} identities Every record identity, tombstones INCLUDED:
 *   a deleted client is still a record a session may legitimately name. `null` where the file
 *   carried no envelope, which is legitimate for library kinds and refused for the rest.
 * @property {string|null} taken_at
 */

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Writing
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * A set of records, checked for completeness before anything is written from it.
 *
 * @param {BackupSet} set
 * @returns {Record<string, any[]>} The same records, per kind, verbatim.
 * @throws {TypeError} Naming the kinds that were missing, so the caller fixes the FETCH rather than
 *   the file. This is the difference between "the coach has no diet plans" and "nobody asked for
 *   the diet plans", and only the first of those is a backup.
 */
export function readBackupSet(set) {
  const kinds = set === null || typeof set !== 'object' ? undefined : set.kinds;
  if (kinds === null || typeof kinds !== 'object' || Array.isArray(kinds)) {
    throw new TypeError('A backup needs a set of records: a record of every kind and its records.');
  }

  const missing = BACKUP_KINDS.filter((kind) => !Array.isArray(
    /** @type {Record<string, unknown>} */ (kinds)[kind],
  ));
  if (missing.length > 0) {
    throw new TypeError(
      `A backup must carry every record kind, and this one has no ${missing.join(' and no ')}. `
      + 'An empty kind is fine; a kind that is not there means it was never fetched, and a backup '
      + 'written that way restores a practice missing part of itself.',
    );
  }

  if (typeof set.taken_at !== 'string' || set.taken_at === '') {
    throw new TypeError('A backup records when it was taken; this package holds no clock, so the caller supplies it.');
  }

  /** @type {Record<string, any[]>} */
  const read = {};
  for (const kind of BACKUP_KINDS) {
    read[kind] = [.../** @type {any[]} */ (/** @type {Record<string, unknown>} */ (kinds)[kind])];
  }
  return read;
}

/**
 * How many records the backup holds, per kind and in total.
 *
 * A test asserts a NON-ZERO count per kind rather than that the function returned something: a
 * backup reporting nothing is indistinguishable from a backup OF nothing.
 *
 * @param {BackupSet} set
 * @returns {{per_kind: Record<string, number>, total: number}}
 */
export function backupCounts(set) {
  const read = readBackupSet(set);
  /** @type {Record<string, number>} */
  const perKind = {};
  let total = 0;
  for (const kind of BACKUP_KINDS) {
    perKind[kind] = read[kind].length;
    total += read[kind].length;
  }
  return { per_kind: perKind, total };
}

/**
 * THE WHOLE BACKUP, as the parts of one archive.
 *
 * The manifest first, because that is what a restore reads and what the file is FOR; then one
 * readable table per kind, which is what the coach opens when he wants to know what is in the file
 * without opening the application.
 *
 * THE MANIFEST HOLDS ENVELOPES, NOT CONTENT, and that is the whole difference between this and the
 * library file. A session's identity is what its readings, its performed records and its notes all
 * point at; drop it and the restore has a set of orphans it would have to re-parent by guessing.
 *
 * @param {BackupSet} set
 * @returns {{name: string, text: string}[]} Ready for `storeOnlyZip`.
 * @throws {TypeError} On a missing kind, or on a set that is empty in every kind at once.
 */
export function backupParts(set) {
  const read = readBackupSet(set);

  const total = BACKUP_KINDS.reduce((held, kind) => held + read[kind].length, 0);
  if (total === 0) throw new TypeError(NOTHING_TO_BACK_UP);

  /** @type {Record<string, any[]>} */
  const kinds = {};
  for (const kind of BACKUP_KINDS) kinds[kind] = read[kind];

  const manifest = {
    backup_document: BACKUP_DOCUMENT,
    backup_version: BACKUP_VERSION,
    taken_at: set.taken_at,
    device: set.device ?? null,
    kinds,
  };

  return [
    { name: MANIFEST_PART, text: JSON.stringify(manifest, null, 2) },
    ...BACKUP_KINDS.flatMap((kind) => [{
      name: `${kind}.csv`,
      text: readableTableText(kind, read[kind]),
    }]),
  ];
}

/**
 * The readable half of one kind. Derived from the records rather than from a column list typed here,
 * so a field added to a client next year is in the next backup without anyone editing this module.
 * @param {string} kind @param {any[]} records @returns {string}
 */
function readableTableText(kind, records) {
  const [, csv] = recordsParts(
    kind,
    BACKUP_KIND_WORDS[/** @type {keyof typeof BACKUP_KIND_WORDS} */ (kind)] ?? kind,
    records,
  );
  return csv.text;
}

/**
 * The backup laid out as a table a caller can show, per kind.
 * @param {string} kind @param {any[]} records
 * @returns {{title: string, headings: string[], rows: (string|number)[][]}}
 */
export function backupTable(kind, records) {
  return recordsTable(
    BACKUP_KIND_WORDS[/** @type {keyof typeof BACKUP_KIND_WORDS} */ (kind)] ?? kind,
    (Array.isArray(records) ? records : []).map(contentOf),
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Reading
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * READ AN ARCHIVE BACK — either shape, refusing anything else BY NAME.
 *
 * @param {Map<string, string>|Record<string, string>} parts The archive's parts, name to text.
 * @returns {ReadBackup}
 * @throws {Error} Saying what the file is, rather than what it is not. A coach who chose the wrong
 *   file needs to be told which file he chose.
 */
export function readBackupParts(parts) {
  const named = parts instanceof Map ? parts : new Map(Object.entries(parts ?? {}));

  if (named.has(MANIFEST_PART)) return readFullBackup(/** @type {string} */ (named.get(MANIFEST_PART)));

  const libraryParts = LIBRARY_BACKUP_KINDS.filter((kind) => named.has(`${kind}.json`));
  if (libraryParts.length > 0) return readLibraryBackup(named, libraryParts);

  throw new Error(
    'This file is not a backup this application wrote. A backup holds either a '
    + `"${MANIFEST_PART}" manifest or the library parts the reset offer saves.`,
  );
}

/**
 * A `full` backup, read from its manifest.
 * @param {string} text @returns {ReadBackup}
 */
function readFullBackup(text) {
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (cause) {
    throw new Error(`The "${MANIFEST_PART}" part of this file is not readable.`, { cause });
  }
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`The "${MANIFEST_PART}" part of this file is not readable.`);
  }
  if (manifest.backup_document !== BACKUP_DOCUMENT) {
    throw new Error(`This file is not a ${BACKUP_DOCUMENT}.`);
  }
  if (manifest.backup_version !== BACKUP_VERSION) {
    throw new Error(
      `This backup is version ${manifest.backup_version}, and this application understands version `
      + `${BACKUP_VERSION}.`,
    );
  }
  const kinds = manifest.kinds;
  if (kinds === null || typeof kinds !== 'object' || Array.isArray(kinds)) {
    throw new Error('This backup carries no records.');
  }

  const covers = BACKUP_KINDS.filter((kind) => Array.isArray(kinds[kind]));
  if (covers.length !== BACKUP_KINDS.length) {
    const missing = BACKUP_KINDS.filter((kind) => !covers.includes(kind));
    throw new Error(
      `This backup is missing ${missing.join(' and ')}, so it is not a whole one. Restoring it `
      + 'would leave the practice looking complete while part of it was never in the file.',
    );
  }

  /** @type {Record<string, BackupRecord[]>} */
  const records = {};
  /** @type {Record<string, Record<string, any>[]>} */
  const content = {};
  /** @type {Record<string, (string|null)[]>} */
  const identities = {};

  for (const kind of covers) {
    records[kind] = /** @type {any[]} */ (kinds[kind]).map(asBackupRecord);
    // A tombstone's `content` is null, and `contentOf` would hand back the ENVELOPE for one, which
    // is how a deletion becomes a record full of envelope fields. Living records only.
    content[kind] = records[kind]
      .filter((record) => !record.deleted && record.content !== null)
      .map((record) => /** @type {Record<string, any>} */ (record.content));
    identities[kind] = records[kind].map((record) => record.record_id);
    refuseUnidentifiedAppRecords(kind, identities[kind]);
  }

  return {
    shape: 'full',
    covers,
    records,
    content,
    identities,
    taken_at: typeof manifest.taken_at === 'string' ? manifest.taken_at : null,
  };
}

/**
 * One stored envelope, read into the shape a restore uses.
 * @param {unknown} record @returns {BackupRecord}
 */
function asBackupRecord(record) {
  const envelope = record !== null && typeof record === 'object' && !Array.isArray(record)
    ? /** @type {Record<string, any>} */ (record)
    : {};
  const deleted = envelope.deleted === true;
  return {
    record_id: typeof envelope.record_id === 'string' ? envelope.record_id : null,
    content: deleted ? null : contentOf(envelope),
    deleted,
  };
}

/**
 * The `library` shape — the file the reset offer already writes. Bare content, no manifest, and
 * identity carried by the content key rather than by an envelope.
 *
 * @param {Map<string, string>} named @param {readonly string[]} present @returns {ReadBackup}
 */
function readLibraryBackup(named, present) {
  const missing = LIBRARY_BACKUP_KINDS.filter((kind) => !present.includes(kind));
  if (missing.length > 0) {
    throw new Error(
      `This library backup is missing ${missing.join(' and ')}, so it would restore a library `
      + 'missing part of itself.',
    );
  }

  /** @type {Record<string, BackupRecord[]>} */
  const records = {};
  /** @type {Record<string, Record<string, any>[]>} */
  const content = {};
  /** @type {Record<string, (string|null)[]>} */
  const identities = {};

  for (const kind of LIBRARY_BACKUP_KINDS) {
    let parsed;
    try {
      parsed = JSON.parse(/** @type {string} */ (named.get(`${kind}.json`)));
    } catch (cause) {
      throw new Error(`The "${kind}.json" part of this file is not readable.`, { cause });
    }
    if (!Array.isArray(parsed)) throw new Error(`The "${kind}.json" part of this file is not a list of records.`);

    // A library file carries no envelopes at all, so every identity is absent and every record is
    // found by its CONTENT KEY instead. That is legitimate HERE and nowhere else, and it is only
    // legitimate because the model addresses library content that way in the first place.
    records[kind] = parsed.map((record) => ({
      record_id: null, content: contentOf(record), deleted: false,
    }));
    content[kind] = records[kind].map((record) => /** @type {Record<string, any>} */ (record.content));
    identities[kind] = records[kind].map(() => null);
  }

  return {
    shape: 'library',
    covers: [...LIBRARY_BACKUP_KINDS],
    records,
    content,
    identities,
    taken_at: null,
  };
}

/**
 * An app-authored record with no identity cannot be restored, only re-invented, and a re-invented
 * identity is a session that belongs to nobody.
 * @param {string} kind @param {(string|null)[]} identities
 */
function refuseUnidentifiedAppRecords(kind, identities) {
  if (LIBRARY_TYPES.includes(kind)) return;
  const at = identities.findIndex((id) => id === null);
  if (at !== -1) {
    throw new Error(
      `A ${kind} in this backup carries no identity (the first is number ${at + 1}). Restoring it `
      + 'would mean inventing one, and an invented identity is a record that no longer belongs to '
      + 'anything that pointed at it.',
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The referential gate — the model's checks, CALLED, never re-written
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * WHAT WOULD DANGLE IF THIS BACKUP WERE APPLIED TO THIS STORE.
 *
 * The store's own `create` and `update` run a routine's validator, and that validator validates a
 * routine ALONE — so a routine naming an exercise that does not exist commits cleanly, and so does a
 * repetition override on a time-counted exercise. Those checks need the exercise library and
 * therefore cannot live in the store; they must be called by whoever holds one.
 *
 * A RESTORE IS THE MOST DANGEROUS SUCH WRITER. A backup taken from a healthy library and replayed
 * into a store whose exercises differ produces routines that point at nothing, committed silently,
 * and discovered in front of a client as a row with nothing behind it.
 *
 * The exercises checked against are the union of what the backup carries and what the target already
 * holds, because that is what the store WILL hold after the restore lands. Checking against the
 * backup alone would refuse a legitimate library-only restore into a store that has the exercise
 * already; checking against the target alone would refuse a whole restore that brings both.
 *
 * @param {ReadBackup} read
 * @param {{exercises?: Record<string, any>[], routines?: Record<string, any>[],
 *   clientIds?: Iterable<string>}} [target] What the store holds now, as content.
 * @returns {import('../model/issues.js').ValidationResult}
 */
export function backupReferenceIssues(read, target = {}) {
  const exercises = unionByContentKey(read.content.exercise ?? [], target.exercises ?? []);
  const routines = unionByContentKey(read.content.routine ?? [], target.routines ?? []);

  const routineIssues = checkRoutineReferences(read.content.routine ?? [], exercises);

  const clientIds = new Set([
    ...(read.identities.client ?? []).filter((id) => typeof id === 'string'),
    ...(target.clientIds ?? []),
  ]);
  const sessionIssues = checkSessionReferences(read.content.session ?? [], {
    routineIds: routines.map((routine) => routine?.id).filter((id) => typeof id === 'string'),
    clientIds,
  });

  return {
    ok: routineIssues.ok && sessionIssues.ok,
    issues: [...routineIssues.issues, ...sessionIssues.issues],
  };
}

/**
 * Both sets, the backup's copy winning where a content key is in both — which is what the store will
 * hold once the restore has landed.
 *
 * NOTHING IS DROPPED. An entry in the target that the backup does not carry stays, because an
 * exercise no routine references is the substitution pool and never a thing to tidy away.
 *
 * @param {Record<string, any>[]} fromBackup @param {Record<string, any>[]} inTarget
 * @returns {Record<string, any>[]}
 */
function unionByContentKey(fromBackup, inTarget) {
  const byKey = new Map();
  for (const record of inTarget) if (typeof record?.id === 'string') byKey.set(record.id, record);
  for (const record of fromBackup) if (typeof record?.id === 'string') byKey.set(record.id, record);
  return [...byKey.values()];
}
