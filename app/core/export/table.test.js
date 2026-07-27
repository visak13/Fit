/**
 * THE CONTRACT, HELD TO ITS WORD.
 *
 * Two steps are written against this shape, so the tests that matter here are the ones that would
 * catch it drifting: what it accepts, what it refuses, and that a refusal says which cell.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { readTable } from './table.js';
import { aTable, NASTY } from './testing.js';

test('a title, headings and rows come back as given', () => {
  const read = readTable(aTable());

  assert.equal(read.title, 'Diet — week of 3 August');
  assert.deepEqual([...read.headings], ['Day', 'Morning', 'Midday']);
  assert.equal(read.rows.length, 3);
  assert.equal(read.rows[0][1], NASTY.AMPERSAND, 'cells are carried through untouched, not sanitised here');
});

test('headings are OPTIONAL: a table of rows alone is an export', () => {
  const read = readTable({ title: 'Progress', rows: [['Monday', 1]] });
  assert.deepEqual([...read.headings], []);
  assert.deepEqual([...read.rows[0]], ['Monday', 1]);
});

test('a finite number stays a NUMBER, so a spreadsheet column can be totalled', () => {
  const read = readTable({ title: 'Loads', rows: [[80, 5, 132.5]] });
  assert.deepEqual([...read.rows[0]], [80, 5, 132.5]);
  assert.equal(typeof read.rows[0][0], 'number');
});

test('an absent cell is an EMPTY cell, not an error: a day with no evening meal is ordinary', () => {
  const read = readTable({ title: 'Diet', rows: [['Monday', null, undefined]] });
  assert.deepEqual([...read.rows[0]], ['Monday', '', '']);
});

test('NaN and Infinity become their own text, because a numeric cell holding one is an unopenable workbook', () => {
  const read = readTable({ title: 'Loads', rows: [[Number.NaN, Number.POSITIVE_INFINITY]] });
  assert.deepEqual([...read.rows[0]], ['NaN', 'Infinity']);
});

test('the title is trimmed, because it names the sheet and the file', () => {
  assert.equal(readTable({ title: '  Diet  ', rows: [['x']] }).title, 'Diet');
});

test('a cell holding a record or a list is REFUSED, and the refusal says which cell', () => {
  assert.throws(
    () => readTable({ title: 'Diet', rows: [['Monday', { grams: 60 }]] }),
    (error) => error instanceof TypeError
      && error.message.includes('row 1, column 2')
      && error.message.includes('record'),
  );

  assert.throws(
    () => readTable({ title: 'Diet', headings: ['Day', ['Morning']], rows: [['Monday', 'Oats']] }),
    (error) => error instanceof TypeError && error.message.includes('heading 2') && error.message.includes('list'),
  );
});

test('a missing or empty title is refused: an untitled export is a file nobody can identify', () => {
  assert.throws(() => readTable({ rows: [['x']] }), /needs a title/);
  assert.throws(() => readTable({ title: '   ', rows: [['x']] }), /needs a title/);
  assert.throws(() => readTable({ title: 7, rows: [['x']] }), /needs a title/);
});

test('a table with NOTHING in it is refused rather than exported as an empty sheet', () => {
  assert.throws(() => readTable({ title: 'Diet', rows: [] }), /nothing to export/);
  assert.throws(() => readTable({ title: 'Diet', headings: [], rows: [] }), /nothing to export/);
});

test('headings without rows are an export: the shape is not yet filled in, and that is the coach\'s business', () => {
  const read = readTable({ title: 'Diet', headings: ['Day', 'Morning'], rows: [] });
  assert.equal(read.headings.length, 2);
  assert.equal(read.rows.length, 0);
});

test('what is not a table at all is refused before anything else is read', () => {
  assert.throws(() => readTable(null), /needs a table/);
  assert.throws(() => readTable('Diet'), /needs a table/);
  assert.throws(() => readTable([['Monday']]), /needs a table/);
  assert.throws(() => readTable({ title: 'Diet' }), /needs rows/);
  assert.throws(() => readTable({ title: 'Diet', rows: 'Monday' }), /needs rows/);
  assert.throws(() => readTable({ title: 'Diet', rows: ['Monday'] }), /Row 1 is not a list/);
  assert.throws(() => readTable({ title: 'Diet', headings: 'Day', rows: [['x']] }), /Headings must be a row/);
});

test('the result is FROZEN, so a writer cannot edit the table out from under the other writer', () => {
  const read = readTable(aTable());
  assert.throws(() => { read.title = 'something else'; }, TypeError);
  assert.throws(() => { read.rows[0][0] = 'Sunday'; }, TypeError);
});

test('reading does not mutate what the caller passed', () => {
  const original = aTable();
  const copy = JSON.parse(JSON.stringify(original));
  readTable(original);
  assert.deepEqual(JSON.parse(JSON.stringify(original)), copy);
});
