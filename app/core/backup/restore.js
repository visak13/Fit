/**
 * READING A BACKUP BACK IN — the write that closes the gap, and the two rules that make it safe.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  A RESTORE IS THE MOST DANGEROUS WRITER IN THIS APPLICATION.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Every other writer puts one record in front of the coach as he writes it. A restore replays a
 * whole practice, taken at some other time from some other state, in one act he cannot inspect. Two
 * things follow, and both of them are silent failures if they are missed.
 *
 * ## ONE — THE REFERENTIAL HOLE, WHICH NAMES A RESTORE DIRECTLY
 *
 * The store's `create` and `update` run a routine's own validator, and that validator validates a
 * routine ALONE. So a routine naming a NON-EXISTENT EXERCISE commits cleanly today, and so does a
 * repetition override on a time-counted exercise. Those checks need the exercise library and
 * therefore cannot live in the store.
 *
 * A backup taken from a healthy library and replayed into a store whose exercises differ is exactly
 * that hole, at its widest. So this module CALLS `checkRoutineReferences` — the model's own
 * function, through `backupReferenceIssues` — and does not write a second referential check that
 * could disagree with it.
 *
 * **IT REFUSES. IT DOES NOT REPAIR.** That choice is deliberate and it is the one worth arguing:
 *
 *  - Repairing means either dropping the routine entry that dangles or dropping the routine. Both
 *    silently EDIT the coach's own content, on the one path where he has least ability to notice —
 *    he asked to get his practice back, and would be handed a quietly smaller one.
 *  - This build's standing posture is that no import, migration, reset or backup path may drop
 *    content. Repairing here would be that rule broken by the very operation it names.
 *  - A refusal is recoverable and a silent repair is not. He restores the library first, or he picks
 *    the whole backup rather than the library-only one, and nothing was lost in the meantime.
 *
 * So the refusal NAMES the exercise that is missing, because "this file cannot be restored" with no
 * reason is a dead end wearing a safety check's clothes.
 *
 * ## TWO — RESTORING IS A WRITE, AND IT MUST WIN THE SYNC RACE
 *
 * Restoring a record is a WRITE, not an erasure of writes. If the restored record carried its
 * ORIGINAL revision, the next synchronisation would see the remote copy as newer and faithfully push
 * the coach's later edits straight back over the restore. The restore would appear to work, the
 * screen would show the restored data, and minutes later it would be undone with no error anywhere.
 *
 * So every record written here is a REVISION OF WHAT IS THERE — `reviseEnvelope` over the record
 * already in the store, which is `rev + 1` by construction and therefore STRICTLY HIGHER than the
 * copy it replaces. A record the target has never seen is created fresh at revision 1, which has
 * nothing to beat.
 *
 * ## AND ONE TRANSACTION
 *
 * Through `importRecords`, so a half-applied restore cannot exist. Either the whole practice lands
 * or none of it does, and the coach is never left with routines naming exercises that were not
 * written — which would be this module creating, at the last moment, the exact state its own
 * referential gate exists to refuse.
 */

import { createEnvelope, reviseEnvelope, tombstoneEnvelope } from '../model/envelope.js';
import { LIBRARY_TYPES } from '../model/vocabularies.js';
import { backupReferenceIssues, readBackupParts } from '../artefacts/restorable-backup.js';
import { readStoreOnlyZipParts } from '../export/unzip.js';
import { openPortableArchive } from '../crypto/portable.js';
import { walkToTheEnd } from './collect.js';

/**
 * A restore that was refused BEFORE anything was written. The issues are carried so the caller can
 * tell the coach which exercise is missing rather than that something is wrong.
 */
export class RestoreRefused extends Error {
  /** @param {string} message @param {{issues?: any[]}} [detail] */
  constructor(message, detail = {}) {
    super(message);
    this.name = 'RestoreRefused';
    this.issues = detail.issues ?? [];
  }
}

/** Said when the file read cleanly and held nothing to write. */
export const NOTHING_TO_RESTORE =
  'This file opened, and there is nothing in it to put back. Nothing on this device was changed.';

/**
 * RESTORE A BACKUP INTO A STORE.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {import('../artefacts/restorable-backup.js').ReadBackup} read What
 *   {@link readBackupFile} or {@link readBackupArchive} handed back.
 * @param {{now: string|number|Date}} ctx The instant, supplied: this package holds no clock.
 * @returns {Promise<{written: number, kinds: Record<string, number>, live: Record<string, number>,
 *   shape: string, covers: readonly string[]}>} `kinds` counts ROWS written per kind, tombstones
 *   included; `live` counts only the records that will then appear in a list. Anything shown to the
 *   coach reads `live` — see the comment at the loop that fills them.
 * @throws {RestoreRefused} On a dangling reference, or on a file with nothing in it. NOTHING is
 *   written on either path.
 */
export async function restoreBackup(store, read, { now } = /** @type {any} */ ({})) {
  const target = await readTargetLibrary(store);

  const issues = backupReferenceIssues(read, target);
  if (!issues.ok) {
    throw new RestoreRefused(
      'This backup cannot be put back as it stands, because part of it points at something this '
      + `device does not have.\n\n${saidPlainly(issues.issues)}\n\n`
      + 'Nothing on this device was changed. Restoring your library first, or choosing a backup '
      + 'that holds your whole practice, gives this file everything it refers to.',
      { issues: issues.issues },
    );
  }

  /** @type {any[]} */
  const records = [];
  /** @type {Record<string, number>} */
  const kinds = {};
  /** @type {Record<string, number>} */
  const live = {};

  for (const kind of read.covers) {
    kinds[kind] = 0;
    live[kind] = 0;
    for (const record of read.records[kind] ?? []) {
      const written = await envelopeFor(store, kind, record, now);
      if (written === null) continue;
      records.push(written);
      kinds[kind] += 1;
      // TWO COUNTS, BECAUSE THEY ANSWER TWO DIFFERENT QUESTIONS AND THE COACH ONLY ASKS ONE.
      // `kinds` is how many ROWS of this kind the file put back, tombstones included — a deletion
      // is a write of a tombstone here, never an absence. `live` is how many records he will then
      // SEE, because every list in this application reads `!record.deleted`. On a device that has
      // never deleted anything the two are equal, which is precisely why counting rows survived
      // this long. Measured by s11/a11: a source library at 102 exercise rows, 12 routine rows and
      // 16 curve rows restored and reported those numbers while the library showed 100, 7 and 8.
      // Telling him "12 routines" and showing him 7 leaves him unable to tell a correct restore
      // from one that lost five, at the one moment he has nothing else to check it against.
      if (written.deleted !== true) live[kind] += 1;
    }
  }

  if (records.length === 0) throw new RestoreRefused(NOTHING_TO_RESTORE);

  // `overwrite` because the decision has already been taken above: every envelope built here is a
  // revision of what the store holds and therefore already wins under last-write-wins. Passing it
  // states the intent at the call site rather than leaving the outcome to a comparison that is
  // guaranteed to go one way.
  const applied = await store.importRecords(records, { overwrite: true });

  return {
    written: applied.written, kinds, live, shape: read.shape, covers: read.covers,
  };
}

/**
 * The issues as sentences a coach can read, and DELIBERATELY NOT through `formatIssues`.
 *
 * That helper renders a path and a code beside each line, and its own header says it is never shown
 * to the coach as-is — it is for a test failure or a log. The `message` on each issue, by contrast,
 * is already written for a person and already names the missing key. A refusal he cannot act on is
 * a dead end, and a refusal wearing a field path and an error code is one he will not read at all.
 *
 * Repeated sentences are shown once: twelve routines naming one missing exercise is one fact.
 *
 * @param {Array<{message?: string}>} issues @returns {string}
 */
function saidPlainly(issues) {
  const said = new Set();
  for (const issue of issues) {
    if (typeof issue?.message === 'string' && issue.message !== '') said.add(issue.message);
  }
  return [...said].join('\n');
}

/**
 * The envelope to write for one backed-up record, at a revision strictly higher than whatever it
 * replaces.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {string} kind
 * @param {import('../artefacts/restorable-backup.js').BackupRecord} record
 * @param {string|number|Date} now
 * @returns {Promise<any|null>} `null` where there is nothing to write.
 */
async function envelopeFor(store, kind, record, now) {
  const current = await currentRecordFor(store, kind, record);
  const device = store.device;

  if (record.deleted) {
    // A deletion is a WRITE OF A TOMBSTONE, never an absence. Restoring it into a store that never
    // held the record still writes one: the backup's evidence that the coach removed somebody is
    // the record, and dropping it would let the next synchronisation pull them back from the remote
    // copy — the resurrection the tombstone rule exists to stop.
    const base = current ?? createEnvelope({
      type: kind, content: {}, device, now, record_id: record.record_id ?? undefined,
    });
    return tombstoneEnvelope(base, { device, now });
  }

  if (record.content === null) return null;

  if (current) return reviseEnvelope(current, record.content, { device, now });

  return createEnvelope({
    type: kind, content: record.content, device, now, record_id: record.record_id ?? undefined,
  });
}

/**
 * The record this backed-up one belongs to, if the store already has it.
 *
 * THE TWO HALVES OF THE MODEL ARE ADDRESSED DIFFERENTLY and this is the one place that matters.
 * Library content is found by its CONTENT KEY, which is why the reset's library-only file — which
 * carries no envelopes at all — is restorable in the first place. Everything else is found by record
 * identity, which is why a backup carrying an app-authored record without one is refused when it is
 * read rather than repaired here.
 *
 * @param {import('../store/local-store.js').LocalStore} store @param {string} kind
 * @param {import('../artefacts/restorable-backup.js').BackupRecord} record
 * @returns {Promise<any|undefined>}
 */
async function currentRecordFor(store, kind, record) {
  if (LIBRARY_TYPES.includes(kind)) {
    const key = record.content?.id;
    if (typeof key !== 'string') return undefined;
    return store.getByContentKey(kind, key);
  }
  if (typeof record.record_id !== 'string') return undefined;
  return store.get(kind, record.record_id);
}

/**
 * What the target store holds, read TO THE END, for the referential check to run against.
 *
 * The walk matters as much here as it does in the backup: a check confirming that every exercise a
 * routine names exists, having looked at the first page of exercises, is a check that passes because
 * it did not look.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @returns {Promise<{exercises: Record<string, any>[], routines: Record<string, any>[],
 *   clientIds: string[]}>}
 */
async function readTargetLibrary(store) {
  const living = (records) => records.filter((record) => record?.deleted !== true);

  const exercises = living(await walkToTheEnd(store, 'exercise'));
  const routines = living(await walkToTheEnd(store, 'routine'));
  // Tombstoned clients included deliberately: a deleted client is still a record a session may name,
  // and treating them as absent would refuse a legitimate backup of a practice somebody left.
  const clients = await walkToTheEnd(store, 'client');

  return {
    exercises: exercises.map((record) => record.content ?? {}),
    routines: routines.map((record) => record.content ?? {}),
    clientIds: clients.map((record) => record.record_id).filter((id) => typeof id === 'string'),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The two doors a file comes through
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * A backup archive's bytes, read into the shape {@link restoreBackup} takes.
 *
 * Reads BOTH shapes this application has ever written: the whole-practice backup, and the
 * library-only file the reset-to-defaults offer saves. That second one is the point of the whole
 * exercise — until this existed, the copy offered immediately before a destructive act was a file
 * nothing could read back.
 *
 * @param {Uint8Array} bytes
 * @returns {import('../artefacts/restorable-backup.js').ReadBackup}
 */
export function readBackupFile(bytes) {
  return readBackupParts(readStoreOnlyZipParts(bytes));
}

/**
 * AN ENCRYPTED ARCHIVE, OPENED WITH ITS PASSPHRASE ALONE.
 *
 * Two arguments, and that is load-bearing: no device key, no account, no store, no envelope from
 * anywhere else. This is the file the coach keeps outside Google entirely, and the context it gets
 * opened in is one where none of those exist.
 *
 * The cryptography is `core/crypto/portable.js` and nothing is added to it here. A second key path
 * is how two incompatible families of ciphertext get created.
 *
 * @param {string} passphrase
 * @param {string} archive
 * @returns {Promise<import('../artefacts/restorable-backup.js').ReadBackup>}
 */
export async function readBackupArchive(passphrase, archive) {
  const payload = await openPortableArchive(passphrase, archive);

  let parts;
  try {
    parts = JSON.parse(payload);
  } catch (cause) {
    throw new Error('This archive opened, and what is inside it is not a backup.', { cause });
  }
  return readBackupParts(parts);
}
