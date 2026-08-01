/**
 * RECORDS AS A TABLE, AND AS THE TWO PARTS OF AN ARCHIVE — the one implementation, shared.
 *
 * The library backup and the full export both have the same job to do: take a list of stored records
 * and put them in a file both restorable and readable. This was written once inside the library
 * backup and pulled out the moment the second caller appeared, rather than copied — two functions
 * that turn records into columns are two answers to "which fields are in the backup", and they agree
 * until somebody adds a field.
 *
 * ## THE COLUMNS ARE DISCOVERED, NEVER TYPED
 *
 * A hand-written column list is a list that falls behind the record it describes, and it falls
 * behind SILENTLY: the field is simply not in the file, and the file still opens. Discovery means a
 * field added to an exercise or a session next year is in the next backup with nobody editing this
 * module.
 *
 * ## EVERY KIND GOES OUT TWICE
 *
 * A `.json` part holding the records VERBATIM, which is what a restore reads, and a `.csv` part
 * holding the same records as a table, which is what the coach reads when he wants to know what is
 * in the file without opening the application. A backup that cannot be restored is a listing; a
 * backup nobody can read is a file he will not trust.
 *
 * Pure. No clock, no store, no browser.
 */

import { tableToSeparatedValues } from '../export/export.js';

/**
 * The column a record's identity is shown in, first so a reader can find a record by eye. The one
 * column whose POSITION is decided rather than discovered.
 */
export const ID_COLUMN = 'id';

/** Said in a table when there is nothing of this kind. Never an empty table: the seam refuses one. */
export const NOTHING_OF_THIS_KIND = 'Nothing of this kind.';

/**
 * A record's content, given either a store envelope or bare content.
 *
 * The store nests content under its own key by design, so both shapes reach a caller depending on
 * where they got the records from. Reading both here means a backup taken from a query and one taken
 * from something already unwrapped are the same file.
 *
 * @param {unknown} record @returns {Record<string, any>}
 */
export function contentOf(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return {};
  const envelope = /** @type {Record<string, any>} */ (record);
  if (envelope.content !== null && typeof envelope.content === 'object' && !Array.isArray(envelope.content)) {
    return envelope.content;
  }
  return envelope;
}

/**
 * A list of records, laid out as the export seam's table.
 *
 * @param {string} title
 * @param {Record<string, any>[]} records Content, as {@link contentOf} reads it.
 * @returns {{title: string, headings: string[], rows: (string|number)[][]}}
 */
export function recordsTable(title, records) {
  const rows = Array.isArray(records) ? records : [];
  if (rows.length === 0) return { title, headings: [NOTHING_OF_THIS_KIND], rows: [] };

  const columns = columnsOf(rows);
  return {
    title,
    headings: [...columns],
    rows: rows.map((record) => columns.map((column) => cellText(record[column]))),
  };
}

/**
 * One kind of thing, as the two parts of an archive: the faithful copy first, because that is what
 * the file is FOR, then the readable one.
 *
 * @param {string} baseName What the two files are called, before their extensions.
 * @param {string} title The title the readable table carries.
 * @param {unknown[]} records Envelopes or bare content, either is read.
 * @returns {{name: string, text: string}[]}
 */
export function recordsParts(baseName, title, records) {
  const content = (Array.isArray(records) ? records : []).map(contentOf);
  return [
    // Two-space indentation, because this is also the file somebody reads when they are trying to
    // work out what went wrong, and one line of minified records is not readable at that moment.
    { name: `${baseName}.json`, text: JSON.stringify(content, null, 2) },
    { name: `${baseName}.csv`, text: tableToSeparatedValues(recordsTable(title, content)) },
  ];
}

// ── internals ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Every column present across the records, identity first, the rest in the order they were first
 * met.
 *
 * First-met order rather than alphabetical: the records come from the seed and from the coach's own
 * edits in a stable field order, and a backup whose columns are in the order the application writes
 * them is easier to read than one sorted by a machine.
 *
 * @param {Record<string, any>[]} records @returns {string[]}
 */
function columnsOf(records) {
  const columns = [];
  const seen = new Set();
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (seen.has(key)) continue;
      seen.add(key);
      columns.push(key);
    }
  }
  return seen.has(ID_COLUMN)
    ? [ID_COLUMN, ...columns.filter((column) => column !== ID_COLUMN)]
    : columns;
}

/**
 * One value as a cell.
 *
 * The seam REFUSES a cell holding a list or a record, and it is right to: `[object Object]` in a
 * spreadsheet is not an error anywhere and looks deliberate. But a routine's exercises and an
 * exercise's muscle groups are genuinely lists, and a backup that refused them would refuse every
 * library there is. So they are rendered HERE, where the meaning is known, and what reaches the seam
 * is text.
 *
 * @param {unknown} value @returns {string|number}
 */
function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => cellText(item)).join(', ');
  return JSON.stringify(value);
}
