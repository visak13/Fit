/**
 * THE FALLBACK, HELD TO THE SAME STANDARD AS THE WORKBOOK.
 *
 * A fallback that mangles the coach's text is worse than no fallback: it lands, it opens, and the
 * client reads something he did not write. So the escaping cases here are the same cases the
 * workbook suite runs, and the layout assertions are the same layout — a coach who received one and
 * then the other must not be looking at two different documents.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SEPARATED_VALUES_FILE_EXTENSION,
  SEPARATED_VALUES_MEDIA_TYPE,
  tableToSeparatedValues,
} from './separated-values.js';
import { aTable, NASTY } from './testing.js';

/** The records, split on the separator that is NOT inside quotes — done by parsing, not by splitting. */
function parse(text) {
  const records = [];
  let field = '';
  let record = [];
  let quoted = false;

  for (let at = 0; at < text.length; at += 1) {
    const character = text[at];

    if (quoted) {
      if (character !== '"') { field += character; continue; }
      if (text[at + 1] === '"') { field += '"'; at += 1; continue; }
      quoted = false;
      continue;
    }

    if (character === '"') { quoted = true; continue; }
    if (character === ',') { record.push(field); field = ''; continue; }
    if (character === '\r' && text[at + 1] === '\n') {
      record.push(field); records.push(record); record = []; field = ''; at += 1; continue;
    }
    field += character;
  }

  record.push(field);
  records.push(record);
  return records;
}

test('title, then headings, then the rows — the same layout the workbook writes', () => {
  const records = parse(tableToSeparatedValues(aTable()));

  assert.deepEqual(records[0], ['Diet — week of 3 August']);
  assert.deepEqual(records[1], ['Day', 'Morning', 'Midday']);
  assert.equal(records.length, 5);
  assert.equal(records[2][0], 'Monday');
});

test('EVERY DIFFICULT CELL PARSES BACK TO EXACTLY WHAT WENT IN', () => {
  const rows = [
    [NASTY.QUOTE, NASTY.COMMA, NASTY.NEWLINE],
    [NASTY.AMPERSAND, NASTY.LESS_THAN, NASTY.APOSTROPHE],
    [NASTY.EVERYTHING, '', 'plain'],
  ];
  const records = parse(tableToSeparatedValues({ title: 'Diet', headings: ['a', 'b', 'c'], rows }));

  assert.deepEqual(records.slice(2), rows);
});

test('a field is quoted when it must be, and NOT when it need not be', () => {
  const text = tableToSeparatedValues({ title: 'Diet', rows: [[NASTY.COMMA, NASTY.AMPERSAND]] });

  assert.ok(text.includes('"Oats, milk, honey"'), 'a comma forces quoting');
  assert.ok(text.includes('Yoghurt & fruit'), 'an ampersand means nothing here and is left alone');
  assert.ok(!text.includes('"Yoghurt & fruit"'), 'and is not quoted for nothing');
});

test('a quote inside a field is DOUBLED, which is how it survives', () => {
  const text = tableToSeparatedValues({ title: 'Diet', rows: [['Chicken "thigh"']] });
  assert.ok(text.includes('"Chicken ""thigh"""'));
  assert.deepEqual(parse(text)[1], ['Chicken "thigh"']);
});

test('records are separated by CRLF; a line break INSIDE a cell is kept as the coach typed it', () => {
  const text = tableToSeparatedValues({ title: 'Diet', rows: [[NASTY.NEWLINE], ['Tuesday']] });

  assert.ok(text.includes('\r\n'), 'records use the format\'s own separator');
  assert.ok(text.includes('Oats 60g\nMilk 200ml'), 'his own break is not rewritten to match it');
  assert.deepEqual(parse(text).length, 3, 'and the break inside quotes does not end a record');
});

test('an XML-significant character is NOT escaped here — this is not XML', () => {
  const text = tableToSeparatedValues({ title: 'Diet', rows: [[NASTY.LESS_THAN, NASTY.AMPERSAND]] });
  assert.ok(text.includes('<200 kcal'));
  assert.ok(!text.includes('&lt;'), 'escaping shared with the workbook writer would corrupt this one');
});

test('a leading equals sign is left EXACTLY as typed', () => {
  // Stated as a decision in the module header: the mitigation for spreadsheet formula
  // interpretation rewrites the coach's own words on their way to a client, and this file goes to
  // one person he chose. If that is ever reversed it must be reversed deliberately, against this.
  const text = tableToSeparatedValues({ title: 'Notes', rows: [['=2 sets', '-2kg', '+1 rep', '@home']] });
  assert.deepEqual(parse(text)[1], ['=2 sets', '-2kg', '+1 rep', '@home']);
});

test('numbers are written bare, so a spreadsheet reads them as numbers', () => {
  assert.deepEqual(parse(tableToSeparatedValues({ title: 'Loads', rows: [[80, 5, 132.5]] }))[1], ['80', '5', '132.5']);
});

test('an absent cell is an empty field, and the row keeps its width', () => {
  assert.deepEqual(parse(tableToSeparatedValues({ title: 'Diet', rows: [['Monday', null, undefined]] }))[1], ['Monday', '', '']);
});

test('it refuses what the table refuses, identically to the workbook writer', () => {
  assert.throws(() => tableToSeparatedValues({ title: 'Diet', rows: [[{}]] }), TypeError);
  assert.throws(() => tableToSeparatedValues({ title: '', rows: [['x']] }), /needs a title/);
  assert.throws(() => tableToSeparatedValues({ title: 'Diet', rows: [] }), /nothing to export/);
});

test('the parser used above is not credulous — it can tell a quoted comma from a separator', () => {
  // NON-VACUITY: every assertion in this file rests on this parser distinguishing the two.
  assert.deepEqual(parse('a,"b,c"'), [['a', 'b,c']]);
  assert.deepEqual(parse('a,b\r\nc'), [['a', 'b'], ['c']]);
});

test('the declared type and extension are the ones a share sheet needs', () => {
  assert.equal(SEPARATED_VALUES_MEDIA_TYPE, 'text/csv');
  assert.equal(SEPARATED_VALUES_FILE_EXTENSION, '.csv');
});
