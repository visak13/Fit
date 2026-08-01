/**
 * THE BACKUP PACKAGE API — write a copy, read it back, and say when one is due. Import from HERE.
 *
 * `import { collectBackup } from './core/backup/backup.js'` — BY EXPLICIT FILE PATH. Directory-index
 * resolution is a Node convenience the BROWSER DOES NOT HAVE, so a caller that imports the directory
 * passes every test in this package and breaks the application. `index.js` beside this file is the
 * TEST ENTRY POINT, not the API.
 *
 * ## WHY THIS PACKAGE EXISTS RATHER THAN LIVING IN ITS NEIGHBOURS
 *
 * The purity suites decided it, which is the intended way to settle this rather than by argument:
 *
 *  - `core/artefacts/` is PURE — no store, no clock, no cryptography, and its own suite fails any
 *    shipped file there that imports one. The DOCUMENT lives there (`restorable-backup.js`); the
 *    walk that fills it and the write that applies it cannot.
 *  - `core/export/` is a LEAF — a table and a title are the only way in. It holds the ZIP writer and
 *    now its reader, and nothing that knows what a client is.
 *  - `core/seed/` owns the shipped library and the reset, not the coach's own practice.
 *
 * What is left is a package that holds a store handle, composes the pure document, and calls the
 * existing cryptography. That is this one, and it is small on purpose.
 *
 * ## THE FOUR THINGS IT DOES
 *
 * ```js
 * // 1. TAKE A BACKUP — walked to the end, or refused. Never short.
 * const set = await collectBackup(store, { taken_at: nowIso });
 * const bytes = storeOnlyZip(backupParts(set));            // the plain file
 * const armoured = await sealBackupArchive(phrase, set, { at: nowIso });   // the off-Google one
 *
 * // 2. READ ONE BACK — either shape, either door.
 * const read = readBackupFile(bytes);
 * const alsoRead = await readBackupArchive(phrase, armoured);
 *
 * // 3. PUT IT BACK — referential gate first, one transaction, revisions strictly higher.
 * await restoreBackup(store, read, { now: nowIso });
 *
 * // 4. SAY WHEN ONE IS DUE — and never, ever block.
 * backupNudge({ last_backup_at: lastIso, holds_records: true, now: nowIso });
 * ```
 *
 * ## THE FIVE THINGS WORTH KNOWING BEFORE USING IT
 *
 *  1. **A backup is walked to the END or it is refused.** Every store query is paged, and a reader
 *     built from first pages is complete in shape and short in substance with nothing erroring.
 *  2. **The restore REFUSES a dangling reference; it does not repair one.** It calls the model's own
 *     `checkRoutineReferences` rather than carrying a second copy of that rule.
 *  3. **Restoring writes at a revision STRICTLY HIGHER than what it replaces**, or the next
 *     synchronisation pushes the coach's later edits back over the restore with no error anywhere.
 *  4. **Both file shapes read back**, including the library-only file the reset offer already saves.
 *     That file existing without a reader was the gap this package was built to close.
 *  5. **No cryptography is written here.** `core/crypto/portable.js` seals and opens; this composes.
 */

export {
  BACKUP_PAGE,
  BackupIncomplete,
  collectBackup,
  FROM_THE_BEGINNING,
  MAX_PAGES,
  walkToTheEnd,
} from './collect.js';

export {
  NOTHING_TO_RESTORE,
  readBackupArchive,
  readBackupFile,
  RestoreRefused,
  restoreBackup,
} from './restore.js';

export {
  BACKUP_ARCHIVE_FILE_EXTENSION,
  BACKUP_ARCHIVE_MEDIA_TYPE,
  BACKUP_ARCHIVE_TITLE,
  backupPartsObject,
  sealBackupArchive,
} from './archive.js';

export {
  BACKUP_NUDGE_BLOCKS,
  backupNudge,
  DUE_AGAIN,
  NEVER_BACKED_UP,
  nudgeClearedByBackupAt,
  NUDGE_AFTER_DAYS,
  NUDGE_AFTER_MS,
  TAKE_ONE_LABEL,
} from './nudge.js';

// Re-exported so a caller needs ONE import to take a backup and one to read it. The document itself
// stays where it is, in the pure package; this is a pass-through and nothing more.
export {
  BACKUP_DOCUMENT,
  BACKUP_KINDS,
  BACKUP_TITLE,
  BACKUP_VERSION,
  backupCounts,
  backupParts,
  MANIFEST_PART,
  NOTHING_TO_BACK_UP,
  readBackupParts,
} from '../artefacts/restorable-backup.js';
