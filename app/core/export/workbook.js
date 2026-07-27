/**
 * A TABLE AS A REAL WORKBOOK — five OOXML parts in a store-only ZIP, no libraries anywhere.
 *
 * ## What this decides
 *
 * The coach shares a spreadsheet with a client, and it has to be a spreadsheet: a comma-separated
 * file wearing a workbook's name opens as a wall of text on a phone, and the phone's own preview is
 * the first thing the client sees. So these bytes really are a workbook — the same five parts, in
 * the same shape, as the code proven from the installed iOS app in the s1 spike.
 *
 * The layout, decided here and true of every export this application produces:
 *
 *   - **Row one is the TITLE**, alone, so a printed or forwarded sheet still says what it is. The
 *     title also names the sheet tab, as far as the format allows one.
 *   - **Row two is the headings**, when the caller gave any.
 *   - **Then the rows**, in the order the caller wrote them.
 *
 * A blank spacer row between the title and the table was considered and rejected: it looks tidy in
 * a spreadsheet application and it makes the file harder for anything else to read, including the
 * next thing that wants to load one of these back.
 *
 * ## Escaping is the part that bites, so it is done in one place
 *
 * These parts are XML. A meal called `Yoghurt & fruit` or a note reading `<200 kcal` produces, if
 * written through unescaped, a workbook that a spreadsheet application simply refuses to open —
 * not a wrong number, a file the coach cannot open in front of a client with no way to tell why.
 * Every value goes through {@link escapeXml}, and every cell carries `xml:space="preserve"` so a
 * cell that is deliberately indented, or holds a line break between two items, survives the trip.
 *
 * ## No styles part
 *
 * A workbook is valid without one, and adding it would mean deciding fonts and column widths for
 * every caller of a seam whose entire promise is that it takes a table and a title. The picture is
 * where a shared artefact is made to look right; that is the other half of this seam.
 */

import { readTable } from './table.js';
import { storeOnlyZip } from './zip.js';

/** What the file is, for a share sheet or a download that must declare a type. */
export const WORKBOOK_MEDIA_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** The extension that goes with it, with its dot. */
export const WORKBOOK_FILE_EXTENSION = '.xlsx';

/** The parts a reader must find, in the order they are written. Named here so a test can hold it. */
export const WORKBOOK_PARTS = Object.freeze([
  '[Content_Types].xml',
  '_rels/.rels',
  'xl/workbook.xml',
  'xl/_rels/workbook.xml.rels',
  'xl/worksheets/sheet1.xml',
]);

/**
 * The characters a sheet name may not contain, and the length one may not exceed. Both are the
 * spreadsheet format's own limits rather than ours; a name that breaks either produces a file that
 * opens to a repair prompt, which reads to a coach as corruption.
 */
const FORBIDDEN_IN_SHEET_NAME = ['[', ']', ':', '*', '?', '/', '\\'];
const SHEET_NAME_LIMIT = 31;

/**
 * Turn a table and its title into the bytes of a genuine `.xlsx` workbook.
 *
 * @param {import('./table.js').Table} table
 * @returns {Uint8Array} The whole file. Bytes, not a Blob — the browser half wraps them.
 * @throws {TypeError} Through {@link readTable}, on a table a writer could not honestly write.
 */
export function tableToWorkbook(table) {
  const read = readTable(table);

  const rows = [[read.title]];
  if (read.headings.length > 0) rows.push(read.headings);
  for (const row of read.rows) rows.push(row);

  return storeOnlyZip([
    { name: '[Content_Types].xml', text: contentTypesPart() },
    { name: '_rels/.rels', text: rootRelationshipsPart() },
    { name: 'xl/workbook.xml', text: workbookPart(sheetNameFor(read.title)) },
    { name: 'xl/_rels/workbook.xml.rels', text: workbookRelationshipsPart() },
    { name: 'xl/worksheets/sheet1.xml', text: sheetPart(rows) },
  ]);
}

/**
 * The sheet tab's name: the title, made legal, and never empty.
 *
 * Truncation is silent on purpose — a title long enough to overflow a tab is still the file's name
 * and still row one, so nothing is lost, and refusing the export over a tab label would be absurd.
 *
 * @param {string} title @returns {string}
 */
export function sheetNameFor(title) {
  let name = title;
  for (const character of FORBIDDEN_IN_SHEET_NAME) name = name.split(character).join(' ');

  name = name.split('\n').join(' ').split('\r').join(' ').trim();

  // TRUNCATE FIRST, then legalise the ends. The other way round — which this did — lets the cut
  // itself put an apostrophe back on the end: a title whose 31st character is one arrives as a name
  // the format forbids, and the file opens to the repair prompt this function exists to avoid.
  // `file-name.js` orders its own trailing-character rule the same way, for the same reason.
  if (name.length > SHEET_NAME_LIMIT) name = name.slice(0, SHEET_NAME_LIMIT).trim();

  // A sheet name may not begin or end with an apostrophe: the format quotes sheet names with one.
  while (name.startsWith("'")) name = name.slice(1).trim();
  while (name.endsWith("'")) name = name.slice(0, -1).trim();

  return name === '' ? 'Sheet1' : name;
}

/**
 * XML-safe text.
 *
 * Written with `split`/`join` rather than a pattern, as this application's shipped source is. The
 * ampersand goes FIRST — replacing it after the others would escape the ampersands they just
 * introduced, and the result is a file that opens showing `&amp;lt;` where the coach typed `<`.
 *
 * @param {string|number} value @returns {string}
 */
export function escapeXml(value) {
  return String(value)
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&apos;');
}

/**
 * A column's letters: 0 is A, 25 is Z, 26 is AA. The subtraction is what makes the carry work in a
 * numbering system that has no zero digit.
 * @param {number} index @returns {string}
 */
export function columnLetter(index) {
  let letters = '';
  let n = index;
  while (true) {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
    if (n < 0) break;
  }
  return letters;
}

/**
 * The worksheet part: every row, every cell, escaped.
 *
 * Text cells are written INLINE rather than through a shared-strings part. A shared string table is
 * how a large workbook stays small, and it is a sixth part, a second index to keep consistent, and
 * a whole class of ways for a file to become unopenable. A diet week is tens of cells.
 *
 * @param {Array<Array<string|number>>} rows @returns {string}
 */
function sheetPart(rows) {
  const written = rows.map((row, index) => {
    const cells = row.map((value, column) => {
      const reference = `${columnLetter(column)}${index + 1}`;
      if (typeof value === 'number') {
        return `<c r="${reference}"><v>${value}</v></c>`;
      }
      if (value === '') {
        return `<c r="${reference}"/>`;
      }
      return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
    });
    return `<row r="${index + 1}">${cells.join('')}</row>`;
  });

  return `${declaration()}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${written.join('')}</sheetData></worksheet>`;
}

/** @returns {string} */
function contentTypesPart() {
  return `${declaration()}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '</Types>';
}

/** @returns {string} */
function rootRelationshipsPart() {
  return `${declaration()}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';
}

/** @param {string} sheetName @returns {string} */
function workbookPart(sheetName) {
  return `${declaration()}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

/** @returns {string} */
function workbookRelationshipsPart() {
  return `${declaration()}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '</Relationships>';
}

/** @returns {string} */
function declaration() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
}
