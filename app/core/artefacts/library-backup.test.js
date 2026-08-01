/**
 * THE LIBRARY BACKUP, AND THE THIRD KIND.
 *
 * The failure this suite exists to catch is specific and was named before the code was written: a
 * backup that carries exercises and routines, omits intensity patterns, opens cleanly and reports
 * success. So the coverage test is written against `LIBRARY_TYPES` rather than against three names
 * typed into an assertion — an assertion that listed the kinds by hand would go stale in exactly the
 * same way the code would, and would then agree with the bug.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { LIBRARY_TYPES } from '../model/vocabularies.js';
import {
  ID_COLUMN, LIBRARY_BACKUP_KINDS, libraryBackupCounts, libraryBackupParts, libraryBackupTable,
  NOTHING_IN_THIS_KIND, readLibrary,
} from './library-backup.js';
import { readTable } from '../export/export.js';

/** A library with something real in every kind, as the store hands records over. */
const aLibrary = (over = {}) => ({
  exercise: [
    { record_id: 'e1', deleted: false, content: { id: 'push-up', name: 'Push Up', primary_muscles: ['chest', 'triceps'] } },
    { record_id: 'e2', deleted: false, content: { id: 'plank', name: 'Plank', primary_muscles: ['core'] } },
  ],
  routine: [
    { record_id: 'r1', deleted: false, content: { id: 'push-day', name: 'Push day', split_day: 1 } },
  ],
  'intensity-pattern': [
    { record_id: 'p1', deleted: false, content: { id: 'wave', name: 'Wave', sequence: ['low', 'high', 'low'] } },
  ],
  ...over,
});

const nameOf = (part) => part.name;

test('THE KINDS ARE THE MODEL\'S OWN LIST, not a copy of it', () => {
  assert.equal(LIBRARY_BACKUP_KINDS, LIBRARY_TYPES, 'the same frozen array, not an equal one');
  assert.ok(LIBRARY_BACKUP_KINDS.length > 0, 'and it is not empty, or every test below passes for free');
});

test('EVERY LIBRARY KIND REACHES THE FILE — derived, so a fourth kind arrives without anyone remembering', () => {
  const parts = libraryBackupParts(aLibrary());

  for (const kind of LIBRARY_TYPES) {
    assert.ok(parts.map(nameOf).includes(`${kind}.json`), `${kind} has no faithful part in the backup`);
    assert.ok(parts.map(nameOf).includes(`${kind}.csv`), `${kind} has no readable part in the backup`);
  }
  assert.equal(parts.length, LIBRARY_TYPES.length * 2, 'and nothing else is in there');
});

test('THE THIRD KIND IS IN THERE WITH ITS CONTENT — named explicitly, because it is the one that goes missing', () => {
  const parts = libraryBackupParts(aLibrary());
  const patterns = parts.find((part) => part.name === 'intensity-pattern.json');

  const written = JSON.parse(patterns.text);
  assert.equal(written.length, 1);
  assert.equal(written[0].name, 'Wave');
  assert.deepEqual(written[0].sequence, ['low', 'high', 'low'], 'the curve itself, not just its name');
});

test('A MISSING KIND IS REFUSED AND NAMED — an absent key means it was never fetched', () => {
  const { 'intensity-pattern': _omitted, ...twoKinds } = aLibrary();

  assert.throws(() => libraryBackupParts(twoKinds), (error) => {
    assert.ok(error instanceof TypeError);
    assert.ok(
      error.message.includes('intensity-pattern'),
      'the refusal must name the kind, so the caller fixes the fetch rather than the file',
    );
    return true;
  });
});

test('AN EMPTY KIND IS FINE — the coach may have deleted every pattern he had', () => {
  const parts = libraryBackupParts(aLibrary({ 'intensity-pattern': [] }));
  const readable = parts.find((part) => part.name === 'intensity-pattern.csv');

  assert.ok(readable.text.includes(NOTHING_IN_THIS_KIND), 'and it says so rather than being blank');
  assert.deepEqual(JSON.parse(parts.find((p) => p.name === 'intensity-pattern.json').text), []);
});

test('the faithful part is FAITHFUL: what goes in comes back out unchanged', () => {
  const library = aLibrary();
  const parts = libraryBackupParts(library);

  assert.deepEqual(
    JSON.parse(parts.find((part) => part.name === 'exercise.json').text),
    library.exercise.map((record) => record.content),
    'a backup that cannot be restored record-for-record is a listing, not a backup',
  );
});

test('bare content and stored envelopes produce the SAME backup', () => {
  const stored = libraryBackupParts(aLibrary());
  const bare = libraryBackupParts({
    exercise: aLibrary().exercise.map((record) => record.content),
    routine: aLibrary().routine.map((record) => record.content),
    'intensity-pattern': aLibrary()['intensity-pattern'].map((record) => record.content),
  });

  assert.deepEqual(bare, stored);
});

test('THE COLUMNS ARE DISCOVERED, so a field added to an exercise next year is in the next backup', () => {
  const library = aLibrary();
  library.exercise[0].content.tempo_note = 'Three seconds down';

  const table = libraryBackupTable('exercise', readLibrary(library).exercise);
  assert.ok(table.headings.includes('tempo_note'), 'a column nobody typed into this module');
  assert.ok(table.rows.some((row) => row.includes('Three seconds down')), 'carrying its value');
});

test('the identity column comes first, because that is how a record is found by eye', () => {
  const table = libraryBackupTable('exercise', readLibrary(aLibrary()).exercise);
  assert.equal(table.headings[0], ID_COLUMN);
});

test('a list becomes readable text rather than a refusal — the seam would refuse it, correctly', () => {
  const table = libraryBackupTable('exercise', readLibrary(aLibrary()).exercise);
  assert.doesNotThrow(() => readTable(table), 'muscle groups are genuinely lists and every library has them');
  assert.ok(table.rows[0].includes('chest, triceps'));
});

test('THE COUNTS ARE NON-ZERO PER KIND — a backup reporting nothing looks like a backup of nothing', () => {
  const counts = libraryBackupCounts(aLibrary());

  assert.equal(counts.total, 4);
  for (const kind of LIBRARY_TYPES) {
    assert.ok(counts.per_kind[kind] > 0, `${kind} counted zero on a fixture that has one`);
  }
});

test('NOTHING CLIENT-SHAPED CAN REACH IT: the backup takes no client identity and reads no history', () => {
  const parts = libraryBackupParts(aLibrary());
  const everything = parts.map((part) => part.text).join('\n');

  for (const word of ['client', 'session', 'reading', 'clinical', 'note']) {
    assert.ok(
      !everything.toLowerCase().includes(word),
      `"${word}" appears in a library backup, which carries library content and nothing else`,
    );
  }
});
