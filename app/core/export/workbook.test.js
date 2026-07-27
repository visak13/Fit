/**
 * THE WORKBOOK — a real one, proved by reading it back part by part.
 *
 * The failure these tests exist to catch is not a wrong number in a cell. It is a file the coach
 * cannot open at all: an unescaped ampersand in a meal name, a sheet name holding a colon, a part
 * missing from the archive. Each of those produces a spreadsheet application's repair prompt, in
 * front of a client, with nothing in the app having erred.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  columnLetter,
  escapeXml,
  sheetNameFor,
  tableToWorkbook,
  WORKBOOK_FILE_EXTENSION,
  WORKBOOK_MEDIA_TYPE,
  WORKBOOK_PARTS,
} from './workbook.js';
import { aTable, NASTY, readZip } from './testing.js';

/** The parts of a produced workbook, by name. */
function partsOf(table) {
  const entries = readZip(tableToWorkbook(table));
  return Object.fromEntries(entries.map((entry) => [entry.name, entry.text]));
}

test('the archive holds EXACTLY the five expected parts, in order', () => {
  const entries = readZip(tableToWorkbook(aTable()));
  assert.deepEqual(entries.map((entry) => entry.name), [...WORKBOOK_PARTS]);
  assert.equal(entries.length, 5);
});

test('it is bytes, not a Blob and not a string — the browser half wraps them', () => {
  const produced = tableToWorkbook(aTable());
  assert.ok(produced instanceof Uint8Array);
  assert.ok(produced.length > 0);
  assert.equal(produced[0], 0x50, 'a ZIP begins PK');
  assert.equal(produced[1], 0x4b);
});

test('row one is the TITLE, row two the headings, then the rows in the order given', () => {
  const sheet = partsOf(aTable())['xl/worksheets/sheet1.xml'];

  assert.ok(sheet.includes('<row r="1">'));
  assert.ok(sheet.includes('Diet — week of 3 August'), 'the title is written into the sheet');
  assert.ok(sheet.indexOf('Day') < sheet.indexOf('Monday'), 'headings come before the first row');
  assert.ok(sheet.indexOf('Monday') < sheet.indexOf('Tuesday'), 'row order is the caller\'s order');
  assert.ok(sheet.includes('<row r="5">'), 'title + headings + three rows');
});

test('a table without headings puts its first row directly under the title', () => {
  const sheet = partsOf({ title: 'Loads', rows: [['Monday', 80]] })['xl/worksheets/sheet1.xml'];
  assert.ok(sheet.includes('<row r="2">'));
  assert.ok(!sheet.includes('<row r="3">'), 'no spacer row is inserted');
});

test('XML-SIGNIFICANT CHARACTERS ARE ESCAPED — the whole file is unopenable otherwise', () => {
  const sheet = partsOf(aTable())['xl/worksheets/sheet1.xml'];

  assert.ok(sheet.includes('Yoghurt &amp; fruit'), 'the ampersand is escaped');
  assert.ok(sheet.includes('&lt;200 kcal'), 'the less-than is escaped');
  assert.ok(!sheet.includes('Yoghurt & fruit'), 'and no raw ampersand is left behind');

  // The order matters and gets this wrong quietly: escaping `&` last turns `&lt;` into `&amp;lt;`,
  // which opens fine and shows the coach's `<` as literal text.
  assert.ok(!sheet.includes('&amp;lt;'), 'nothing is double-escaped');
  assert.ok(!sheet.includes('&amp;quot;'));
});

test('a quote, a comma, a newline and an apostrophe all survive INTACT', () => {
  const sheet = partsOf(aTable())['xl/worksheets/sheet1.xml'];

  assert.ok(sheet.includes('Chicken &quot;thigh&quot; 200g'));
  assert.ok(sheet.includes('Oats, milk, honey'), 'a comma means nothing in XML and is left alone');
  assert.ok(sheet.includes('Oats 60g\nMilk 200ml'), 'a line break inside a cell is kept');
  assert.ok(sheet.includes('xml:space="preserve"'), 'which is only true because the space is preserved');
});

test('every text cell declares its type, and every empty cell is empty rather than an empty string', () => {
  const sheet = partsOf({ title: 'Diet', headings: ['Day', 'Evening'], rows: [['Monday', null]] })['xl/worksheets/sheet1.xml'];

  assert.ok(sheet.includes('t="inlineStr"'));
  assert.ok(sheet.includes('<c r="B3"/>'), 'an absent cell is written as an empty cell');
});

test('a number is written as a NUMBER, so the client can total the column', () => {
  const sheet = partsOf({ title: 'Loads', rows: [[80, 'kg']] })['xl/worksheets/sheet1.xml'];

  assert.ok(sheet.includes('<c r="A2"><v>80</v></c>'), 'no inline-string wrapper around a number');
  assert.ok(sheet.includes('t="inlineStr"'), 'and the text beside it still has one');
});

test('cell references are the real grid: A, B … Z, AA', () => {
  assert.equal(columnLetter(0), 'A');
  assert.equal(columnLetter(25), 'Z');
  assert.equal(columnLetter(26), 'AA');
  assert.equal(columnLetter(27), 'AB');
  assert.equal(columnLetter(51), 'AZ');
  assert.equal(columnLetter(52), 'BA');

  const wide = Array.from({ length: 27 }, (_unused, index) => `c${index}`);
  const sheet = partsOf({ title: 'Wide', rows: [wide] })['xl/worksheets/sheet1.xml'];
  assert.ok(sheet.includes('r="AA2"'), 'a table wider than the alphabet is still referenced correctly');
});

test('the sheet name is the title, made legal, and never empty', () => {
  assert.equal(sheetNameFor('Diet week'), 'Diet week');
  assert.equal(sheetNameFor('Diet: week 3/4 [draft]?'), 'Diet  week 3 4  draft');
  assert.equal(sheetNameFor("'quoted'"), 'quoted');
  assert.equal(sheetNameFor('*'), 'Sheet1', 'a title that legalises to nothing still names a sheet');
  assert.equal(sheetNameFor('x'.repeat(60)).length, 31, 'the format\'s own limit');
});

test('TRUNCATING MAY NOT PUT AN APOSTROPHE BACK ON THE END', () => {
  // The cut is what makes this bite: the title is legal, and the 31st character is the apostrophe.
  // A name ending in one is forbidden by the format, and the coach meets it as a repair prompt.
  const title = "Diet week for Roberto and Bobs' x";
  assert.equal(title.slice(0, 31).endsWith("'"), true, 'the 31st character really is the apostrophe');

  const cut = sheetNameFor(title);
  assert.equal(cut.length <= 31, true);
  assert.equal(cut.endsWith("'"), false, 'the end is legalised AFTER the cut, not before it');
  assert.equal(cut, 'Diet week for Roberto and Bobs');

  // And the ordinary cases still hold: a mid-name apostrophe is untouched, and one that only the
  // original text put on the end is still removed.
  assert.equal(sheetNameFor("Bob's week"), "Bob's week");
  assert.equal(sheetNameFor("Bob's week'"), "Bob's week");
});

test('the sheet name is ESCAPED in the workbook part too — it is an XML attribute', () => {
  const workbook = partsOf({ title: 'Fish & chips "week"', rows: [['x']] })['xl/workbook.xml'];

  assert.ok(workbook.includes('name="Fish &amp; chips &quot;week&quot;"'));
  assert.ok(!workbook.includes('name="Fish & chips'), 'an unescaped attribute breaks the whole part');
});

test('the relationship parts point at the parts that are actually there', () => {
  const parts = partsOf(aTable());

  assert.ok(parts['_rels/.rels'].includes('Target="xl/workbook.xml"'));
  assert.ok(parts['xl/_rels/workbook.xml.rels'].includes('Target="worksheets/sheet1.xml"'));
  assert.ok(parts['[Content_Types].xml'].includes('PartName="/xl/worksheets/sheet1.xml"'));
  assert.ok(parts['[Content_Types].xml'].includes('PartName="/xl/workbook.xml"'));
});

test('every part is a well-formed XML document with a declaration first', () => {
  for (const [name, text] of Object.entries(partsOf(aTable()))) {
    assert.ok(text.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'), `${name} has no declaration`);
    assert.equal(balanced(text), true, `${name} has unbalanced angle brackets`);
    assert.equal(text.includes(']]>'), false, `${name} holds a sequence no XML document may contain`);
  }
});

test('the same table produces the SAME BYTES every time — there is no clock in here', () => {
  assert.deepEqual(tableToWorkbook(aTable()), tableToWorkbook(aTable()));
});

test('the writer refuses what the table refuses, identically', () => {
  assert.throws(() => tableToWorkbook({ title: 'Diet', rows: [[{}]] }), TypeError);
  assert.throws(() => tableToWorkbook({ title: '', rows: [['x']] }), /needs a title/);
  assert.throws(() => tableToWorkbook({ title: 'Diet', rows: [] }), /nothing to export/);
});

test('escapeXml handles every character it claims, and leaves the rest alone', () => {
  assert.equal(escapeXml('a & b'), 'a &amp; b');
  assert.equal(escapeXml('<t>'), '&lt;t&gt;');
  assert.equal(escapeXml('"q"'), '&quot;q&quot;');
  assert.equal(escapeXml("it's"), 'it&apos;s');
  assert.equal(escapeXml(NASTY.EVERYTHING).includes('&'), true);
  assert.equal(escapeXml('60 °C — ×3'), '60 °C — ×3', 'accented and typographic characters are UTF-8, not entities');
  assert.equal(escapeXml(80), '80');
});

test('the declared type and extension are the ones a share sheet needs', () => {
  assert.equal(WORKBOOK_MEDIA_TYPE, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(WORKBOOK_FILE_EXTENSION, '.xlsx');
});

/**
 * Angle brackets that open and close in order, with nothing left dangling. Not a parser — it is the
 * cheap check that catches the failure that actually happens here, which is content written through
 * unescaped.
 *
 * @param {string} text @returns {boolean}
 */
function balanced(text) {
  let depth = 0;
  for (const character of text) {
    if (character === '<') depth += 1;
    if (character === '>') depth -= 1;
    if (depth < 0 || depth > 1) return false;
  }
  return depth === 0;
}
