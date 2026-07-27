/**
 * THE NAME THAT REACHES THE CLIENT.
 *
 * These are small assertions about a small function, and they are here because the failures are all
 * silent: a name with a slash in it is refused by a download, a name beginning with a dot is
 * invisible on the coach's own laptop, and an empty one is a file he cannot find by any name at all.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { exportFileName } from './file-name.js';
import { SEPARATED_VALUES_FILE_EXTENSION } from './separated-values.js';
import { WORKBOOK_FILE_EXTENSION } from './workbook.js';

test('the title is the name — the artefact arrives explaining itself', () => {
  assert.equal(exportFileName('Diet — week of 3 August', WORKBOOK_FILE_EXTENSION), 'Diet — week of 3 August.xlsx');
  assert.equal(exportFileName('Progress — Anna', SEPARATED_VALUES_FILE_EXTENSION), 'Progress — Anna.csv');
});

test('characters a file system fights over are replaced, not dropped into the middle of a word', () => {
  assert.equal(exportFileName('Diet: 3/4', '.csv'), 'Diet 3 4.csv');
  assert.equal(exportFileName('a\\b*c?d"e<f>g|h', '.csv'), 'a b c d e f g h.csv');
});

test('a line break in a title does not become a line break in a file name', () => {
  assert.equal(exportFileName('Diet\nweek 3', '.csv'), 'Diet week 3.csv');
});

test('runs of space left by the replacements are collapsed', () => {
  assert.equal(exportFileName('Diet // week', '.csv'), 'Diet week.csv');
});

test('a leading dot is removed: it hides the file on the laptop he goes looking on', () => {
  assert.equal(exportFileName('.hidden', '.csv'), 'hidden.csv');
});

test('a trailing dot or space is removed: some file systems drop them on write', () => {
  assert.equal(exportFileName('Diet .', '.csv'), 'Diet.csv');
  assert.equal(exportFileName('Diet   ', '.csv'), 'Diet.csv');
});

test('a name is NEVER empty, whatever the title was', () => {
  assert.equal(exportFileName('', '.csv'), 'export.csv');
  assert.equal(exportFileName('///', '.csv'), 'export.csv');
  assert.equal(exportFileName('...', '.csv'), 'export.csv');
  assert.equal(exportFileName(null, '.csv'), 'export.csv');
  assert.equal(exportFileName(undefined, '.xlsx'), 'export.xlsx');
});

test('a very long title is truncated, and the extension still arrives', () => {
  const produced = exportFileName('x'.repeat(200), '.xlsx');
  assert.equal(produced.length, 85, '80 characters of title and the extension');
  assert.ok(produced.endsWith('.xlsx'));
});
