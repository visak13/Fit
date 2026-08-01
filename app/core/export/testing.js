/**
 * TEST SUPPORT — the cells that break writers, and the ZIP reader under its old name.
 *
 * Nothing in the application imports this file.
 *
 * ## THE READER MOVED, AND THIS LINE IS WHY THE MOVE COST NOTHING
 *
 * `readZip` used to be defined here, because the only thing that needed to read a store-only ZIP was
 * the workbook suite asserting that the writer produced a well-formed archive rather than that its
 * bytes matched a pinned literal. A restore then needed the same parser in SHIPPED code, and the
 * choice was to write a second one or to promote this one. It was promoted, to `unzip.js`, and is
 * re-exported here so every existing caller reads exactly the same bytes the same way.
 *
 * The promoted version additionally REFUSES a compressed entry rather than reporting its `method`
 * and trusting the caller to look, because a restore that decoded DEFLATE bytes as text would hand
 * the coach confident rubbish. Nothing this application writes is ever compressed, so no suite here
 * sees a difference.
 */

export { readStoreOnlyZip as readZip, readStoreOnlyZipParts, STORED } from './unzip.js';

/**
 * The cells that break writers, each one for a stated reason. Used by both writers' suites, so a
 * value that survives one and not the other is caught rather than assumed.
 */
export const NASTY = Object.freeze({
  /** Ends a quoted field in comma-separated text; ends an attribute in XML. */
  QUOTE: 'Chicken "thigh" 200g',
  /** Ends a field. */
  COMMA: 'Oats, milk, honey',
  /** Ends a record; a coach types two items on two lines. */
  NEWLINE: 'Oats 60g\nMilk 200ml',
  /** Escapes to `&amp;`, and escaping it last would double-escape everything else. */
  AMPERSAND: 'Yoghurt & fruit',
  /** Opens a tag. Written through unescaped, a spreadsheet application refuses the whole workbook. */
  LESS_THAN: '<200 kcal',
  /** Closes a tag. */
  GREATER_THAN: '>1L water',
  /** The other quote, which the workbook writer escapes and the text writer must not touch. */
  APOSTROPHE: "coach's note",
  /** All of them at once, because writers fail on combinations they pass one at a time. */
  EVERYTHING: 'a "quoted", <tagged> & \'noted\' cell\nwith a break',
});

/**
 * A table with everything a writer must survive in it, overridable.
 *
 * @param {Partial<import('./table.js').Table>} [overrides]
 * @returns {import('./table.js').Table}
 */
export function aTable(overrides = {}) {
  return {
    title: 'Diet — week of 3 August',
    headings: ['Day', 'Morning', 'Midday'],
    rows: [
      ['Monday', NASTY.AMPERSAND, NASTY.COMMA],
      ['Tuesday', NASTY.QUOTE, NASTY.LESS_THAN],
      ['Wednesday', NASTY.NEWLINE, NASTY.EVERYTHING],
    ],
    ...overrides,
  };
}
