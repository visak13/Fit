/**
 * THE LIBRARY BACKUP — the third frictionless default export, and the one that is easy to half-do.
 *
 * ## THE THREE KINDS ARE DERIVED, NEVER TYPED
 *
 * The library is exercises, routines AND intensity patterns. The third became editable only in this
 * plan, which is exactly why a backup written from an older mental model would carry two kinds,
 * report success, and lose the coach's intensity patterns with nothing erroring anywhere.
 *
 * So no list of kinds is written in this file. {@link LIBRARY_BACKUP_KINDS} is `LIBRARY_TYPES` from
 * the model's own vocabulary — the same frozen list the seed contract, the admin reset and the
 * validator registry are keyed by. A fourth library kind added there tomorrow arrives here without
 * anyone remembering, and — this is the load-bearing half — a backup handed a library that has no
 * entry for one of them is REFUSED rather than written short.
 *
 * ## A MISSING KIND IS A REFUSAL, NOT AN EMPTY SECTION
 *
 * `{}` and `{exercise: [...], routine: [...]}` and a library with all three are three different
 * things, and only the last one is a backup. An empty kind is legitimate — the coach may have
 * deleted every intensity pattern he had — but a kind that is ABSENT means the caller did not know
 * to fetch it, and writing that out as an empty section produces a file that looks complete, opens
 * cleanly, and restores a library missing a third of itself. The distinction is made structurally:
 * the key must be there.
 *
 * This is the same shape as the standing rule this build keeps meeting from the other side — an
 * absence that looks like a pass. Here the absence is in the INPUT, and the answer is the same: make
 * it impossible to be silent about.
 *
 * ## RESTORABLE FIRST, READABLE SECOND — and the backup carries BOTH
 *
 * A backup that cannot be restored is a listing. So each kind goes out twice, into one archive:
 *
 *  - a `.json` part holding every record VERBATIM, which is what a restore reads;
 *  - a `.csv` part holding the same records laid out as a table, which is what the coach reads when
 *    he wants to know what is in the file without opening the application.
 *
 * The readable half is derived from the records rather than from a list of columns typed here, so a
 * field added to an exercise next year appears in the backup by itself.
 *
 * ## NOTHING HERE IS CLINICAL AND NOTHING HERE IS PER CLIENT
 *
 * The library is content the coach authors: movements, routines and intensity curves. No client
 * record, no session, no reading and no note is reachable from this module, and it takes no client
 * identity as an argument — so the "always openable, no passphrase, no friction" property of this
 * export is a fact about what it can reach rather than a promise about what it chose to include.
 *
 * Pure. No clock, no store, no browser.
 */

import { LIBRARY_TYPES } from '../model/vocabularies.js';
import { contentOf, ID_COLUMN, NOTHING_OF_THIS_KIND, recordsParts, recordsTable } from './records-table.js';

export { ID_COLUMN };

/**
 * The kinds a library backup covers — the model's own list, re-exported rather than restated.
 *
 * Re-exported at all so a caller and a test can name them without importing the whole model
 * vocabulary, and so the one place they could ever be typed by hand is this line, where it is
 * obviously a pass-through.
 * @type {readonly string[]}
 */
export const LIBRARY_BACKUP_KINDS = LIBRARY_TYPES;

/** What each kind is called in the file names and the table titles the coach reads. */
export const KIND_WORDS = Object.freeze({
  exercise: 'Exercises',
  routine: 'Routines',
  'intensity-pattern': 'Intensity patterns',
});

/** The backup's own name, before the extension the caller adds. */
export const LIBRARY_BACKUP_TITLE = 'Fit library backup';

/** Said in a table when a kind holds nothing. Never an empty table: the seam refuses one. */
export const NOTHING_IN_THIS_KIND = NOTHING_OF_THIS_KIND;

/**
 * A library, checked for completeness.
 *
 * @param {Record<string, unknown[]>} library Keyed by record kind. Every kind in
 *   {@link LIBRARY_BACKUP_KINDS} must be present; an empty list is fine, a missing key is not.
 * @returns {Record<string, Record<string, any>[]>} The same records, per kind, as plain content.
 * @throws {TypeError} Naming the kinds that were missing, so the caller fixes the fetch rather than
 *   the file.
 */
export function readLibrary(library) {
  if (library === null || typeof library !== 'object' || Array.isArray(library)) {
    throw new TypeError('A library backup needs a library: a record of the library kinds and their records.');
  }

  const missing = LIBRARY_BACKUP_KINDS.filter((kind) => !Array.isArray(
    /** @type {Record<string, unknown>} */ (library)[kind],
  ));
  if (missing.length > 0) {
    throw new TypeError(
      `A library backup must carry every library kind, and this one has no ${missing.join(' and no ')}. `
      + 'An empty kind is fine; a kind that is not there means it was never fetched, and a backup '
      + 'written that way restores a library missing part of itself.',
    );
  }

  /** @type {Record<string, Record<string, any>[]>} */
  const read = {};
  for (const kind of LIBRARY_BACKUP_KINDS) {
    read[kind] = /** @type {unknown[]} */ (
      /** @type {Record<string, unknown>} */ (library)[kind]
    ).map(contentOf);
  }
  return read;
}

/**
 * One kind of library content, laid out as the seam's table.
 *
 * THE COLUMNS ARE DISCOVERED from the records rather than listed here. A typed column list is a list
 * that falls behind the record it describes, and it falls behind silently: the field is simply not
 * in the file, and the file still opens. Discovery means a field added to an exercise next year is
 * in the next backup without anyone editing this module.
 *
 * @param {string} kind
 * @param {Record<string, any>[]} records
 * @returns {{title: string, headings: string[], rows: (string|number)[][]}}
 */
export function libraryBackupTable(kind, records) {
  return recordsTable(KIND_WORDS[/** @type {keyof typeof KIND_WORDS} */ (kind)] ?? kind, records);
}

/**
 * THE WHOLE BACKUP, as the parts of one archive.
 *
 * Two parts per kind, in a deliberate order: the faithful copy first, because that is what a restore
 * reads and what the file is FOR, and the readable copy second.
 *
 * @param {Record<string, unknown[]>} library
 * @returns {{name: string, text: string}[]} Ready for `storeOnlyZip`.
 * @throws {TypeError} Through {@link readLibrary}, on a library missing a kind.
 */
export function libraryBackupParts(library) {
  const read = readLibrary(library);
  return LIBRARY_BACKUP_KINDS.flatMap((kind) => recordsParts(
    kind,
    KIND_WORDS[/** @type {keyof typeof KIND_WORDS} */ (kind)] ?? kind,
    read[kind],
  ));
}

/**
 * How many records the backup holds, per kind and in total.
 *
 * Exists so a caller can tell the coach what he just made — and so a test can assert a NON-ZERO
 * count per kind rather than that the function returned something. A backup reporting nothing is
 * indistinguishable from a backup of nothing.
 *
 * @param {Record<string, unknown[]>} library
 * @returns {{per_kind: Record<string, number>, total: number}}
 */
export function libraryBackupCounts(library) {
  const read = readLibrary(library);
  /** @type {Record<string, number>} */
  const perKind = {};
  let total = 0;
  for (const kind of LIBRARY_BACKUP_KINDS) {
    perKind[kind] = read[kind].length;
    total += read[kind].length;
  }
  return { per_kind: perKind, total };
}
