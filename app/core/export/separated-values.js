/**
 * THE SAME TABLE AS COMMA-SEPARATED TEXT — the fallback that always lands.
 *
 * ## Why a second writer at all
 *
 * A workbook is what the coach wants to send. It is also the artefact most likely to be refused:
 * a share target that takes files may still decline this type, and some places a file can end up
 * will show a workbook as an unopenable attachment while showing plain text inline. Comma-separated
 * text opens everywhere something can be opened at all, so it is the fallback — and it costs a few
 * lines once the table is settled, which is the argument for having settled the table.
 *
 * It writes the SAME layout as the workbook — title, then headings, then rows — so a coach who
 * received one and then the other is not looking at two different documents.
 *
 * ## Escaping, and the two decisions inside it
 *
 * A field is quoted when it holds a comma, a quote, or a line break, and a quote inside a quoted
 * field is written twice. That is RFC 4180 and it is not the interesting part.
 *
 * **Line endings are CRLF.** This is the format's own rule, and it is the ending that survives being
 * opened by a spreadsheet application on any of the platforms the coach might use. A cell holding
 * its own line break — two items typed on separate lines in a meal — keeps the break it was given
 * inside its quotes, and does not get rewritten to match the record separator: that would silently
 * edit what he typed.
 *
 * **A leading equals, plus, minus or at sign is left exactly as typed.** Some spreadsheet
 * applications treat such a field as a formula; the widespread mitigation is to prefix it with an
 * apostrophe or a tab. That mitigation is not applied here, deliberately. It alters the coach's own
 * text on its way to a client — a note reading `-2kg` would arrive reading `'-2kg` — and this
 * application's exports go to one place: a person the coach chose, from a file he generated on his
 * own device, containing his own words. Corrupting the words to defend against a spreadsheet
 * feature would be the visible failure, and the invisible one is not ours to cause.
 */

import { readTable } from './table.js';

/** What the file is, for a share sheet or a download that must declare a type. */
export const SEPARATED_VALUES_MEDIA_TYPE = 'text/csv';

/** The extension that goes with it, with its dot. */
export const SEPARATED_VALUES_FILE_EXTENSION = '.csv';

/** The record separator the format specifies. */
const RECORD_SEPARATOR = '\r\n';

/** The three things that force a field to be quoted. A quote is one of them because it must escape. */
const FORCES_QUOTING = [',', '"', '\n', '\r'];

/**
 * Turn a table and its title into comma-separated text.
 *
 * @param {import('./table.js').Table} table
 * @returns {string} Text, not bytes — the browser half declares the encoding when it wraps it.
 * @throws {TypeError} Through {@link readTable}, identically to the workbook writer.
 */
export function tableToSeparatedValues(table) {
  const read = readTable(table);

  const records = [[read.title]];
  if (read.headings.length > 0) records.push(read.headings);
  for (const row of read.rows) records.push(row);

  return records
    .map((record) => record.map(quoteField).join(','))
    .join(RECORD_SEPARATOR);
}

/**
 * One field, quoted only when it has to be.
 *
 * Quoting everything unconditionally would also be correct and would read worse in the many places
 * this text is shown as text rather than parsed.
 *
 * @param {string|number} value @returns {string}
 */
function quoteField(value) {
  const text = String(value);
  const needsQuoting = FORCES_QUOTING.some((character) => text.includes(character));
  return needsQuoting ? `"${text.split('"').join('""')}"` : text;
}
