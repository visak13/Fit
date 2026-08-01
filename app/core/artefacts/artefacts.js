/**
 * THE ARTEFACT PACKAGE API — what the coach hands out, and what must never be in it.
 *
 * Import this file BY PATH: `import { progressReportTable } from './core/artefacts/artefacts.js'`.
 * Directory-index resolution is a Node convenience the browser does not have, so a caller that
 * imports the directory passes every test in here and breaks the application. `index.js` beside this
 * file is the TEST entry point, not the API.
 *
 * ## WHY THIS PACKAGE EXISTS RATHER THAN LIVING IN ONE OF ITS NEIGHBOURS
 *
 * It was first written inside `core/export/`, and that package's own test threw it out. The rule it
 * broke is deliberate and worth restating: **`core/export/` IS A LEAF — a table and a title are the
 * only way in.** The seam knows nothing about reports, libraries or clients, which is what stops it
 * growing into a reporting framework with a hook for every caller.
 *
 * `core/report/` refuses the other direction just as firmly: its own purity suite fails any shipped
 * file there that so much as names a workbook or an archive, because "core/export/ is deliberately
 * the only export machinery; this package makes content for it".
 *
 * Both refusals are right, and between them they describe a layer that neither package may hold. It
 * is this one. This package is the only place in the application that is allowed to know BOTH what a
 * progress report says AND what a table is:
 *
 *   - {@link progressReportTable} — the client progress report, laid out into the seam's contract.
 *     Content from `core/report/`, carried and never re-derived.
 *   - {@link libraryBackupParts} — the library backup, covering every kind in the model's own
 *     `LIBRARY_TYPES` and REFUSING a library that is missing one.
 *   - {@link fullExportArchive} — the full export: a checklist of what to include, with exactly one
 *     item gated behind a passphrase.
 *
 * ## THE THREE DEFAULT EXPORTS CARRY NO CLINICAL CONTENT AND NO GATE
 *
 * The client progress report, the diet chart and the library backup need no passphrase, have no
 * friction, and are always openable. That is not a policy this package applies; it is a fact about
 * what these functions can reach. None of them takes a key, a passphrase or a sealing function, and
 * the progress report is built from a projection that never carried a clinical field into the
 * building in the first place.
 *
 * The one gated thing is an ITEM ON THE FULL EXPORT'S CHECKLIST, and even there the cryptography is
 * INJECTED by the caller rather than imported here — so this package holds no key material and names
 * no algorithm.
 *
 * Pure. No clock, no store, no browser, no cryptography.
 */

export {
  AN_UNNAMED_CLIENT,
  progressReportTable,
  progressReportTitle,
  REPORT_HEADINGS,
  REPORT_TITLE_SUFFIX,
  SESSIONS_SECTION,
  SUMMARY_SECTION,
  UNDATED,
} from './report-table.js';

export {
  ID_COLUMN,
  KIND_WORDS,
  LIBRARY_BACKUP_KINDS,
  LIBRARY_BACKUP_TITLE,
  libraryBackupCounts,
  libraryBackupParts,
  libraryBackupTable,
  NOTHING_IN_THIS_KIND,
  readLibrary,
} from './library-backup.js';

export {
  BACKUP_DOCUMENT,
  BACKUP_KIND_WORDS,
  BACKUP_KINDS,
  BACKUP_TITLE,
  BACKUP_VERSION,
  backupCounts,
  backupParts,
  backupReferenceIssues,
  backupTable,
  MANIFEST_PART,
  NOTHING_TO_BACK_UP,
  readBackupParts,
  readBackupSet,
} from './restorable-backup.js';

export {
  CHECKLIST_TITLE,
  CHECKLIST_WORDS,
  CLINICAL_ITEM_ID,
  FULL_EXPORT_ITEMS,
  FULL_EXPORT_FILE_EXTENSION,
  FULL_EXPORT_MEDIA_TYPE,
  FULL_EXPORT_TITLE,
  fullExportArchive,
  fullExportParts,
  itemFor,
  NOTHING_TICKED,
  PASSPHRASE_MISSING,
  PASSPHRASE_PROMPT,
  passphraseNeeded,
  readSelection,
} from './checklist.js';

export {
  CLIENT_FIELDS_CARRIED,
  CLINICAL_FIELDS,
  fullExportContents,
  fullExportCounts,
  tickedRecordCount,
  rebuilt,
  SESSION_FIELDS_CARRIED,
} from './full-export-contents.js';

export {
  contentOf,
  NOTHING_OF_THIS_KIND,
  recordsParts,
  recordsTable,
} from './records-table.js';
