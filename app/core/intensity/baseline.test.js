/**
 * THE BASELINE reads back what the client actually did, and says plainly when there is nothing to
 * read.
 *
 * The case worth the most care is the empty one. A new client with no records must produce a usable
 * reference that ANNOUNCES it is not a measurement — not an error, and not a silent default dressed
 * up as one. Every check on that path is paired with the same check on a populated history, so that
 * "reports no baseline" cannot pass by never reporting anything at all.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePerformedRecord } from '../model/entities/performed-record.js';
import { CALIBRATABLE_LEVELS, readBaseline, workOfRecord } from './baseline.js';
import { IntensityInputError } from './errors.js';
import { aHistory, aPerformedRecord, T } from './testing.js';

test('NO HISTORY is an ordinary case, and it says so in words the coach can read', () => {
  for (const nothing of [null, undefined, aHistory([])]) {
    const baseline = readBaseline(nothing);

    assert.equal(baseline.kind, 'none');
    assert.deepEqual(baseline.exercises, {});
    assert.ok(baseline.note.includes('nothing recorded for this client yet'), baseline.note);
    assert.ok(baseline.note.includes('starting point, not as a measurement'),
      'the sentence must refuse to look measured: ' + baseline.note);
  }

  // NON-VACUITY: with one real record the very same reader reports a measurement instead, so the
  // three assertions above are about the empty case rather than about a reader that always says no.
  const measured = readBaseline(aHistory([
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.latest, repetitions: 14, level: 'low' }),
  ]));
  assert.equal(measured.kind, 'measured');
  assert.ok(!measured.note.includes('nothing recorded'), measured.note);
});

test('a SKIPPED record carries no work, so it is not a baseline', () => {
  const skipped = readBaseline(aHistory([
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.latest, status: 'skipped' }),
  ]));
  assert.equal(skipped.kind, 'none', 'a skipped exercise records no work by the model\'s own rule');

  // NON-VACUITY: the identical record with work on it does become a baseline, so the exclusion above
  // is about the status rather than about the fixture being unreadable.
  const performed = readBaseline(aHistory([
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.latest, repetitions: 14, level: 'low' }),
  ]));
  assert.equal(performed.kind, 'measured');
  assert.equal(performed.exercises['push-up'].latest.work, 14);
});

test('the LATEST record is the most recent one, not the last one in the list', () => {
  const baseline = readBaseline(aHistory([
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.latest, repetitions: 20, level: 'high' }),
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.oldest, repetitions: 8, level: 'low' }),
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.older, repetitions: 12, level: 'medium' }),
  ]));

  const found = baseline.exercises['push-up'];
  assert.equal(found.latest.recorded_at, T.latest);
  assert.equal(found.latest.work, 20);
  assert.equal(found.latest.level, 'high');
  assert.equal(found.observed.record_count, 3);
});

test('the OBSERVED extremes across the window are the ceiling and the floor', () => {
  const baseline = readBaseline(aHistory([
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.oldest, repetitions: 25, sets: 5, restSeconds: 20, level: 'high' }),
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.latest, repetitions: 12, sets: 3, restSeconds: 60, level: 'medium' }),
  ]));

  const observed = baseline.exercises['push-up'].observed;
  assert.equal(observed.max_work, 25, 'the most he has managed here, whenever it happened');
  assert.equal(observed.max_sets, 5);
  assert.equal(observed.min_rest_seconds, 20, 'the least he has rested here');
  assert.equal(baseline.exercises['push-up'].latest.work, 12, 'the reference is still the most recent');
});

test('a SUBSTITUTED record counts towards the exercise that was actually done', () => {
  const baseline = readBaseline(aHistory([
    Object.freeze({
      ...aPerformedRecord({ exerciseId: 'knee-push-up', recordedAt: T.latest, repetitions: 10, level: 'low' }),
      status: 'substituted',
      substituted_for_exercise_id: 'push-up',
    }),
  ]));

  assert.ok(baseline.exercises['knee-push-up'], 'filed against what he did');
  assert.equal(baseline.exercises['push-up'], undefined, 'not against what it replaced');
});

test('a TIMED record is read in its own unit and never mistaken for repetitions', () => {
  const baseline = readBaseline(aHistory([
    aPerformedRecord({ exerciseId: 'plank', recordedAt: T.latest, durationSeconds: 50, level: 'medium' }),
  ]));

  assert.equal(baseline.exercises['plank'].latest.work, 50);
  assert.equal(baseline.exercises['plank'].latest.work_unit, 'duration_seconds');
});

test('the window is carried through exactly as the caller described it', () => {
  const baseline = readBaseline(aHistory([
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.latest, repetitions: 14 }),
  ]));

  assert.deepEqual(baseline.window, { from: T.oldest, to: T.latest, session_count: 1 });
  assert.equal(baseline.client_id, 'client-for-tests');
});

test('workOfRecord reads whichever unit is present, and nothing when neither is', () => {
  assert.deepEqual(workOfRecord({ repetitions: 12 }), { unit: 'repetitions', value: 12 });
  assert.deepEqual(workOfRecord({ duration_seconds: 40 }), { unit: 'duration_seconds', value: 40 });
  assert.equal(workOfRecord({ repetitions: 0, duration_seconds: 0 }), null);
  assert.equal(workOfRecord({}), null);
});

// ═══════════════════════════════════════════════════════════════════════════════
// A FACT THAT DOES NOT SAY WHICH POINT IT WAS WORKED AT
// ═══════════════════════════════════════════════════════════════════════════════

test('a fact with NO LEVEL is no calibration: it is left out, counted, and not counted at a guess', () => {
  const baseline = readBaseline(aHistory([
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.latest, repetitions: 25 }),
  ]));

  assert.equal(baseline.kind, 'none', 'work at an unrecorded point is not a measurement of anything');
  assert.deepEqual(baseline.exercises, {}, 'and it contributes no reference and no ceiling');
  assert.deepEqual(baseline.excluded, { record_count: 1, exercise_count: 1 },
    'left out is not the same as dropped: it is counted, because the coach is told about it');

  // NON-VACUITY: the SAME record with a level on it is a measurement, so the exclusion above is about
  // the missing level rather than about a reader that has stopped reading.
  const said = readBaseline(aHistory([
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.latest, repetitions: 25, level: 'high' }),
  ]));
  assert.equal(said.kind, 'measured');
  assert.equal(said.exercises['push-up'].latest.level, 'high');
  assert.deepEqual(said.excluded, { record_count: 0, exercise_count: 0 });
});

test('a level OUTSIDE the enum is treated as not saying, never trusted onto a ladder', () => {
  const baseline = readBaseline(aHistory([
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.latest, repetitions: 25, level: 'brutal' }),
  ]));

  assert.equal(baseline.kind, 'none', 'a level no ladder holds would fail obscurely inside the arithmetic');
  assert.equal(baseline.excluded.record_count, 1);
});

test('CALIBRATABLE_LEVELS is what the record model itself accepts, checked against the real validator', () => {
  const record = (level) => ({
    session_id: 'session-for-tests', client_id: 'client-for-tests', exercise_id: 'push-up',
    position: 0, status: 'performed', repetitions: 10, recorded_at: T.latest, intensity_level: level,
  });

  // Asked of the FIELD rather than of the whole record: this test is about the enum, and a fixture
  // that fails some unrelated requirement must not be able to make it pass.
  const refusesLevel = (level) => validatePerformedRecord(record(level))
    .issues.some((issue) => issue.path === 'intensity_level');

  for (const level of CALIBRATABLE_LEVELS) {
    assert.equal(refusesLevel(level), false, `the model refuses ${level}, so this list is too wide`);
  }
  // NON-VACUITY in the other direction: the validator does refuse a level, so the loop above is not
  // passing because nothing is ever refused.
  assert.equal(refusesLevel('brutal'), true,
    'this list must be the model\'s own enum, not a superset of it');
});

test('a MIX: the level-less records neither become the reference nor lift the ceiling', () => {
  const baseline = readBaseline(aHistory([
    // The most recent record of the three, and the largest — and it says nothing about its point.
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.latest, repetitions: 40, sets: 6, restSeconds: 10 }),
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.older, repetitions: 12, sets: 3, restSeconds: 45, level: 'medium' }),
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.oldest, repetitions: 8, sets: 2, restSeconds: 60, level: 'low' }),
  ]));

  const found = baseline.exercises['push-up'];
  assert.equal(found.latest.recorded_at, T.older, 'the reference is the most recent CALIBRATABLE record');
  assert.equal(found.latest.work, 12);
  assert.equal(found.observed.max_work, 12, 'the 40 nobody placed on a curve is no ceiling either');
  assert.equal(found.observed.max_sets, 3);
  assert.equal(found.observed.min_rest_seconds, 45, 'and no floor');
  assert.equal(found.observed.record_count, 2);
  assert.deepEqual(baseline.excluded, { record_count: 1, exercise_count: 1 });
});

test('THE WORDS: an unshaped session is still usable, and the sentence says what that means for him', () => {
  const unshaped = readBaseline(aHistory([
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.latest, repetitions: 25 }),
    aPerformedRecord({ exerciseId: 'plank', recordedAt: T.latest, durationSeconds: 40 }),
  ]));

  assert.equal(unshaped.kind, 'none', 'usable: the library supplies every number, as it does for a new client');
  assert.deepEqual(unshaped.excluded, { record_count: 2, exercise_count: 2 });
  assert.ok(unshaped.note.includes('2 records were left out'), unshaped.note);
  assert.ok(unshaped.note.includes('which point of a curve it was worked at'), unshaped.note);
  assert.ok(unshaped.note.includes('starting point, not as a measurement'), unshaped.note);
  assert.ok(!unshaped.note.includes('nothing recorded for this client yet'),
    'there IS something recorded, and saying otherwise is its own small lie: ' + unshaped.note);

  const mixed = readBaseline(aHistory([
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.latest, repetitions: 25 }),
    aPerformedRecord({ exerciseId: 'plank', recordedAt: T.older, durationSeconds: 40, level: 'medium' }),
  ]));
  assert.equal(mixed.kind, 'measured');
  assert.ok(mixed.note.includes('Built from what this client has done'), mixed.note);
  assert.ok(mixed.note.includes('1 earlier record does not say which point it was worked at'), mixed.note);
  assert.ok(mixed.note.includes('calibrated on less of his record than it might have been'),
    'what it means FOR HIM, not an account of which field was missing: ' + mixed.note);

  // NON-VACUITY: with nothing left out the sentence does NOT carry that clause, so the assertions
  // above are about the exclusion rather than about a sentence that always apologises.
  const clean = readBaseline(aHistory([
    aPerformedRecord({ exerciseId: 'plank', recordedAt: T.older, durationSeconds: 40, level: 'medium' }),
  ]));
  assert.ok(!clean.note.includes('left out'), clean.note);
  assert.ok(!clean.note.includes('might have been'), clean.note);
});

test('the singular reads as English, because he will see it more often than the plural', () => {
  const one = readBaseline(aHistory([
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.latest, repetitions: 25 }),
  ]));
  assert.ok(one.note.includes('1 record was left out'), one.note);
  assert.ok(!one.note.includes('records were'), one.note);
});

test('a malformed history is refused by name', () => {
  assert.throws(() => readBaseline(/** @type {any} */ ([])), IntensityInputError);
  assert.throws(() => readBaseline(/** @type {any} */ ({ performed: 'lots' })), IntensityInputError);
  assert.throws(() => readBaseline(/** @type {any} */ ({ performed: [null] })), IntensityInputError);
  assert.throws(() => readBaseline(/** @type {any} */ ({ window: [] })), IntensityInputError);
});
