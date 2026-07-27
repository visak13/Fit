/**
 * THE TABLE, SETTLED ONCE, HERE — the shape every export in this application is written against.
 *
 * ## What this decides, and why it is this small
 *
 * The coach's exports are all the same act: he has something laid out in rows, and it has to leave
 * the app as a picture a client can read in a messaging app or as a spreadsheet he can open. The
 * diet week chart is the first of them; the progress report and the full data export are the next.
 * A seam is worth building because there are two named callers, and it is worth building ONCE
 * because the failure it prevents is specific and has already happened elsewhere in this build: two
 * exporters, both passing their own tests, handing the coach two subtly different spreadsheets with
 * nothing erroring anywhere.
 *
 * So the seam takes a TABLE and a TITLE and nothing else. A title, an optional row of headings, and
 * rows of plain cells. That is the whole contract, and it is deliberately flat and boring:
 *
 *     { title: 'Diet — week of 3 August', headings: ['Day', 'Morning', 'Midday'], rows: [[...]] }
 *
 * **This is not a reporting framework and must not grow into one.** There are no options, no
 * formatting hooks, no styling parameters, no callbacks, no column types. Not because they would be
 * hard, but because every one of them would be written for a caller that does not exist yet and
 * would then have to be honoured forever by the two that do. A later step that genuinely needs more
 * widens this contract deliberately, in the open, with its own reason recorded — it does not find a
 * hook already waiting for it.
 *
 * ## Why reading the table is a refusal and not a coercion
 *
 * Both writers read their input through {@link readTable}, so they refuse identically. Without
 * that, malformed input degrades differently in each: a cell holding an object becomes the text
 * `[object Object]` in one and an unopenable workbook in the other, and the coach discovers it in
 * front of a client. A refusal here is a thrown sentence a screen can show him before he shares
 * anything.
 *
 * What is coerced is only what has an obvious, single reading: an absent cell is an empty one, and
 * a number stays a number so a spreadsheet can total a column. What is refused is anything whose
 * text form would be a plausible-looking lie — objects, arrays, functions.
 *
 * ## Purity
 *
 * Nothing here or beside it touches the browser. No canvas, no share sheet, no document: those are
 * the other half of the seam and they live under `src/`. This half turns a table into bytes and
 * text, which is testable in the core gate with nothing rendered and nothing mocked.
 */

/**
 * A single cell's value as a caller writes it.
 *
 * `null` and `undefined` both mean "nothing in this cell" — a diet day with no evening meal is not
 * an error, it is an empty square.
 *
 * @typedef {string|number|null|undefined} Cell
 */

/**
 * The contract. A title, optionally a row of headings, and the rows themselves.
 *
 * @typedef {{title: string, headings?: Cell[]|null, rows: Cell[][]}} Table
 */

/**
 * The table after reading: same shape, every cell resolved to a string or a finite number, frozen.
 *
 * @typedef {{title: string, headings: (string|number)[], rows: (string|number)[][]}} ReadTable
 */

/**
 * Read a caller's table, or refuse it in a sentence a screen can show.
 *
 * The refusals are the point of this function, so each one says what is wrong rather than that
 * something is.
 *
 * @param {Table} table
 * @returns {ReadTable} Frozen. Headings are `[]` when the caller gave none.
 * @throws {TypeError} On anything a writer would otherwise turn into silent nonsense.
 */
export function readTable(table) {
  if (table === null || typeof table !== 'object' || Array.isArray(table)) {
    throw new TypeError('An export needs a table: an object holding a title and rows.');
  }

  const { title, headings, rows } = table;

  if (typeof title !== 'string' || title.trim() === '') {
    throw new TypeError('An export needs a title. It names the sheet and it names the file the coach shares.');
  }

  if (headings !== null && headings !== undefined && !Array.isArray(headings)) {
    throw new TypeError('Headings must be a row of cells, or left out entirely.');
  }

  if (!Array.isArray(rows)) {
    throw new TypeError('An export needs rows: a list of rows, each one a list of cells.');
  }

  const readHeadings = (headings === null || headings === undefined)
    ? []
    : headings.map((cell, column) => readCell(cell, `heading ${column + 1}`));

  const readRows = rows.map((row, index) => {
    if (!Array.isArray(row)) {
      throw new TypeError(`Row ${index + 1} is not a list of cells.`);
    }
    return Object.freeze(row.map((cell, column) => readCell(cell, `row ${index + 1}, column ${column + 1}`)));
  });

  // A table with neither headings nor rows carries NOTHING. It would produce a workbook that opens
  // to an empty sheet and a picture of a title with white space under it, and the coach would read
  // that as the app losing his week rather than as him exporting nothing. Refused where it is
  // cheap, rather than discovered in front of a client.
  if (readHeadings.length === 0 && readRows.length === 0) {
    throw new TypeError('There is nothing to export: the table has no headings and no rows.');
  }

  return Object.freeze({
    title: title.trim(),
    headings: Object.freeze(readHeadings),
    rows: Object.freeze(readRows),
  });
}

/**
 * One cell, resolved.
 *
 * A finite number stays a number — that is what lets a spreadsheet column be summed, and it is the
 * only reason cells are not simply text. Everything else that has one honest reading becomes text.
 * Anything else is refused: `String({})` is `[object Object]`, which is not an error anywhere, is
 * not what the coach typed, and would sit in his client's spreadsheet looking deliberate.
 *
 * @param {Cell} value
 * @param {string} where Named in the refusal, because a bad cell in a week of meals is otherwise a hunt.
 * @returns {string|number}
 */
function readCell(value, where) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    // NaN and Infinity are numbers that no spreadsheet can hold as numbers — written as a numeric
    // cell they produce a workbook a spreadsheet application refuses to open. They become their own
    // text, which is visible and harmless.
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === 'boolean') return String(value);
  throw new TypeError(`${where} holds a ${describe(value)}. A cell is text, a number, or empty.`);
}

/**
 * What a rejected cell is, in a word the coach's screen can repeat.
 * @param {unknown} value @returns {string}
 */
function describe(value) {
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'object') return 'record';
  return typeof value;
}
