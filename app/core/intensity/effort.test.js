/**
 * EFFORT — the scaling half, the reference every number is built from, and the one invariant that
 * makes the whole feature safe to put in front of a client.
 *
 * THE INVARIANT: the adapter never asks for anything harder than BOTH the coach's own library and the
 * client's own record. It is checked here in both directions — the clamp is shown to bite on a case
 * where the arithmetic overshoots, and shown NOT to bite on a case where it does not, so a flag stuck
 * permanently on could not pass.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { validateRoutine } from '../model/entities/routine.js';
import { FORBIDDEN_LOAD_TOKENS, matchToken } from '../model/vocabularies.js';
import { readBaseline } from './baseline.js';
import {
  BOUNDS, NEVER_GUESSES_A_LEVEL, PROPOSES_NO_LOAD, scaleToLevel, workUnitOf,
} from './effort.js';
import { aHistory, anExercise, aPerformedRecord, aRoutine, T } from './testing.js';

const PUSH_UP = anExercise({ id: 'push-up', intensity: 'low', movementPattern: 'horizontal-push' });
const PLANK = anExercise({ id: 'plank', intensity: 'medium', measurement: 'time' });

/** @param {readonly Record<string, any>[]} performed @param {string} exerciseId */
function baselineFor(performed, exerciseId) {
  return readBaseline(aHistory(performed)).exercises[exerciseId] ?? null;
}

test('NO HISTORY and no override: the proposal IS the library\'s own point for that level, unchanged', () => {
  for (const level of ['low', 'medium', 'high']) {
    const effort = scaleToLevel(PUSH_UP, level, null, null);
    const point = PUSH_UP.scaling[level];

    assert.equal(effort.sets, point.sets, level);
    assert.equal(effort.repetitions, point.repetitions, level);
    assert.equal(effort.rest_seconds, point.rest_seconds, level);
    assert.equal(effort.clamped, false);
    assert.equal(effort.reference.source, 'library-scaling-point');
    assert.ok(effort.reference.note.includes(`your library's own ${level} point`), effort.reference.note);
  }
});

test('SCALING is real: the same exercise asks for more work and less rest as the curve rises', () => {
  const low = scaleToLevel(PUSH_UP, 'low', null, null);
  const high = scaleToLevel(PUSH_UP, 'high', null, null);

  assert.ok(high.repetitions > low.repetitions, 'more work at the harder point');
  assert.ok(high.rest_seconds < low.rest_seconds, 'and less rest — harder never means more load here');
});

test('a MEASURED baseline becomes the reference, and the sentence names the day it came from', () => {
  const baseline = baselineFor([
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.latest, repetitions: 10, sets: 3, restSeconds: 50, level: 'low' }),
  ], 'push-up');

  const effort = scaleToLevel(PUSH_UP, 'medium', null, baseline);

  assert.equal(effort.reference.source, 'measured-performance');
  assert.equal(effort.reference.level, 'low');
  assert.equal(effort.reference.work, 10);
  assert.equal(effort.reference.recorded_at, T.latest);
  assert.ok(effort.reference.note.includes('what he did on 2026-07-01'), effort.reference.note);
  // Ten repetitions at the low point, spread up the exercise's own ladder to the medium point, is
  // fifteen — and fifteen is a number nobody wrote. The library's medium point is twelve and he has
  // managed ten, so twelve is where it lands, and it is still more than he last did because the curve
  // moved up a point. He is told which of the two held it.
  assert.equal(effort.repetitions, 12);
  assert.equal(effort.clamped, true);
  assert.ok(effort.clamp_note.includes('what your library asks for at this point'), effort.clamp_note);
});

test('NO RATCHET: at the level he was measured at, the proposal is exactly what he last did', () => {
  const baseline = baselineFor([
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.latest, repetitions: 17, sets: 3, restSeconds: 40, level: 'medium' }),
  ], 'push-up');

  const atThatLevel = scaleToLevel(PUSH_UP, 'medium', null, baseline);
  assert.equal(atThatLevel.repetitions, 17, 'the same curve pressed again next week asks for the same work');

  // Shape him up to a harder point, record what he then did, and shape him back down: he cannot
  // arrive higher than he started. Pressing curves in any order cannot walk the number upwards.
  const up = scaleToLevel(PUSH_UP, 'high', null, baseline);
  assert.ok(up.repetitions > 17, `the harder point does ask for more work: ${up.repetitions}`);
  const backDown = scaleToLevel(PUSH_UP, 'medium', null, baselineFor([
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.latest, repetitions: up.repetitions, sets: 3, restSeconds: 40, level: 'high' }),
  ], 'push-up'));
  assert.ok(backDown.repetitions <= 17,
    `up to ${up.repetitions} at high and back to ${backDown.repetitions} at medium, which is not above 17`);
});

test('THE INVARIANT: a rising curve is HELD at what he has actually managed, and says so', () => {
  const baseline = baselineFor([
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.latest, repetitions: 30, sets: 3, restSeconds: 45, level: 'low' }),
  ], 'push-up');

  const effort = scaleToLevel(PUSH_UP, 'high', null, baseline);

  // The arithmetic alone: 30 repetitions at the low point, times the ladder's low-to-high ratio of
  // 20 over 8, is 75. Nobody authorised 75 — not the library, not the client.
  const shapeAloneWouldHaveAsked = Math.round(30 * (PUSH_UP.scaling.high.repetitions / PUSH_UP.scaling.low.repetitions));
  assert.equal(shapeAloneWouldHaveAsked, 75);
  const ceiling = Math.max(PUSH_UP.scaling.high.repetitions, 30);
  assert.ok(shapeAloneWouldHaveAsked > ceiling, 'the clamp genuinely has something to catch here');

  assert.equal(effort.repetitions, ceiling, 'held at the most he has actually done');
  assert.equal(effort.clamped, true);
  assert.ok(effort.clamp_note.includes('Held at 30'), effort.clamp_note);
  assert.ok(effort.clamp_note.includes('75'), 'he is told what the shape alone would have asked for');
  assert.ok(effort.clamp_note.includes('the most he has actually managed here'), effort.clamp_note);
});

test('THE INVARIANT holds against the ROUTINE\'S OWN number when nothing is recorded', () => {
  // Forty repetitions written into the routine, at an exercise the library files as low, asked for at
  // the high point. The ladder's arithmetic reaches a hundred, which nobody wrote. Forty is his own
  // number and it is where this lands.
  const effort = scaleToLevel(PUSH_UP, 'high', { repetitions: 40 }, null);

  assert.equal(effort.reference.source, 'routine-override');
  assert.equal(effort.reference.work, 40, 'his own number is reported back to him');
  assert.equal(effort.repetitions, 40, 'and never more than it');
  assert.equal(effort.clamped, true);
  assert.ok(effort.clamp_note.includes('what this routine asks for at Push Up'), effort.clamp_note);
});

test('a routine override is honoured at its OWN level, not overruled by the generic library point', () => {
  // Measured on the real shipped content: the pull day asks for fifteen bodyweight squats where the
  // library's low point is eight. At a low position his fifteen must stand — a proposal that quietly
  // replaced his number with the generic one would be the app overruling the coach.
  const effort = scaleToLevel(PUSH_UP, 'low', { sets: 2, repetitions: 15 }, null);

  assert.equal(effort.repetitions, 15);
  assert.equal(effort.sets, 2);
  assert.equal(effort.clamped, false);
});

test('a routine override BELOW the library scales through it, and is not clamped', () => {
  const effort = scaleToLevel(PUSH_UP, 'high', { repetitions: 6 }, null);

  // 6 at the low point, times the low-to-high ratio of 20 over 8, is 15 — under the library's 20.
  assert.equal(effort.repetitions, 15);
  assert.equal(effort.clamped, false);
  assert.ok(effort.reference.note.includes('what this routine asks for'), effort.reference.note);
});

test('REST: his own shortest rest stands when it is shorter than the library\'s', () => {
  const baseline = baselineFor([
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.latest, repetitions: 10, restSeconds: 20, level: 'high' }),
  ], 'push-up');

  const effort = scaleToLevel(PUSH_UP, 'high', null, baseline);

  const floor = Math.min(PUSH_UP.scaling.high.rest_seconds, 20);
  assert.ok(effort.rest_seconds >= floor, `${effort.rest_seconds} is not below ${floor}`);
  assert.equal(effort.rest_seconds, 20, 'his own shortest rest here, not a number of ours');
});

test('THE REST FLOOR bites: a rising curve cannot cut rest below what either source shows', () => {
  // Found by breaking the floor and watching nothing go red. The earlier rest test could not fail,
  // because its arithmetic never reached below the floor — the assertion was right and the fixture
  // could not exercise it. This one can: shaping from a long rest at the low point down to the high
  // point subtracts thirty seconds, which lands under both sources.
  const baseline = baselineFor([
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.latest, repetitions: 5, sets: 2, restSeconds: 55, level: 'low' }),
  ], 'push-up');

  const shapeAloneWouldHaveGiven = 55 + (PUSH_UP.scaling.high.rest_seconds - PUSH_UP.scaling.low.rest_seconds);
  assert.equal(shapeAloneWouldHaveGiven, 25);
  const floor = Math.min(PUSH_UP.scaling.high.rest_seconds, 55);
  assert.ok(shapeAloneWouldHaveGiven < floor, 'the floor genuinely has something to catch here');

  const effort = scaleToLevel(PUSH_UP, 'high', null, baseline);

  assert.equal(effort.rest_seconds, floor, 'held at the shortest rest either source shows');
  assert.equal(effort.clamped, true);
  assert.ok(effort.clamp_note.includes('Rest held at 30 seconds rather than 25'), effort.clamp_note);
  assert.ok(effort.clamp_note.includes('rest your library gives at this point'), effort.clamp_note);
  assert.ok(!effort.clamp_note.includes('Held at 13'),
    'and the note is about the rest, not about a work number that never moved');
});

test('a TIMED exercise is scaled in seconds and carries no repetition count at all', () => {
  const effort = scaleToLevel(PLANK, 'high', null, null);

  assert.equal(effort.measurement, 'time');
  assert.equal(effort.duration_seconds, PLANK.scaling.high.duration_seconds);
  assert.equal(effort.repetitions, null);
  assert.equal(workUnitOf(PLANK), 'duration_seconds');
  assert.equal(workUnitOf(PUSH_UP), 'repetitions');
});

test('a baseline recorded in the WRONG unit is not used as a reference', () => {
  // The level is ON this record on purpose: without it the record would be excluded for a DIFFERENT
  // reason and this test would pass while proving nothing about the unit.
  const baseline = baselineFor([
    aPerformedRecord({ exerciseId: 'plank', recordedAt: T.latest, repetitions: 12, level: 'high' }),
  ], 'plank');
  assert.notEqual(baseline, null, 'the fixture must reach the reference for the unit check to be tested');

  const effort = scaleToLevel(PLANK, 'high', null, baseline);

  assert.equal(effort.reference.source, 'library-scaling-point',
    'twelve repetitions says nothing about how long he can hold a plank');
  assert.equal(effort.duration_seconds, PLANK.scaling.high.duration_seconds);
});

test('A REFERENCE WITH NO LEVEL IS NOT A REFERENCE, and is never read at the exercise\'s own level', () => {
  assert.equal(NEVER_GUESSES_A_LEVEL, true);

  /**
   * Built by hand rather than through `readBaseline`, and that is the point: the real reader excludes
   * a level-less record before it can arrive here, so this is the only way to put the question to
   * `scaleToLevel` — which is EXPORTED, and must answer it the same way.
   *
   * The shape is the one that used to ratchet. `PUSH_UP` is filed at `low`, so the old
   * `measured.level ?? exercise.intensity` read this 20 as a LOW-point performance: the ladder's ratio
   * from low to low is one, the ceiling is that same 20, and the low point came back asking for 20 —
   * the hard number, at the easy point, off a fact that never said where it was done.
   */
  const noLevel = Object.freeze({
    exercise_id: 'push-up',
    latest: Object.freeze({
      level: null, sets: 4, work: 20, work_unit: 'repetitions', rest_seconds: 30, recorded_at: T.latest,
    }),
    observed: Object.freeze({ max_work: 20, max_sets: 4, min_rest_seconds: 30, record_count: 1 }),
  });

  const effort = scaleToLevel(PUSH_UP, 'low', null, noLevel);
  assert.equal(effort.reference.source, 'library-scaling-point',
    'a number with no point behind it was used as though it were a measurement');
  assert.equal(effort.reference.level, 'low');
  assert.equal(effort.repetitions, PUSH_UP.scaling.low.repetitions,
    'the library\'s own low point, not the 20 he managed at a point nobody wrote down');

  // NON-VACUITY: the SAME reference with the level filled in IS used, and lands somewhere different.
  // Without this the assertions above would also pass if `scaleToLevel` had stopped reading baselines
  // altogether.
  const withLevel = Object.freeze({
    ...noLevel,
    latest: Object.freeze({ ...noLevel.latest, level: 'high' }),
  });
  const scaled = scaleToLevel(PUSH_UP, 'low', null, withLevel);
  assert.equal(scaled.reference.source, 'measured-performance');
  assert.equal(scaled.reference.level, 'high');
  assert.notEqual(scaled.repetitions, 20, 'and 20 done at the HIGH point is not 20 asked for at the low one');
});

test('NO FIELD names a load, a weight or a resistance — declared, and swept', () => {
  assert.equal(PROPOSES_NO_LOAD, true);

  const effort = scaleToLevel(PUSH_UP, 'high', null, baselineFor([
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.latest, repetitions: 22, level: 'high' }),
  ], 'push-up'));

  const keys = [...Object.keys(effort), ...Object.keys(effort.reference)];
  const offenders = keys.filter((key) => matchToken(key, FORBIDDEN_LOAD_TOKENS) !== null);
  assert.deepEqual(offenders, []);

  // NON-VACUITY: the same sweep over a deliberately poisoned key list must find it. Without this the
  // assertion above would also pass with a token list that matched nothing at all.
  const poisoned = [...keys, 'proposed_weight_kg'];
  assert.ok(poisoned.includes('proposed_weight_kg'), 'the poison is genuinely in the input');
  assert.deepEqual(
    poisoned.filter((key) => matchToken(key, FORBIDDEN_LOAD_TOKENS) !== null),
    ['proposed_weight_kg'],
    'the sweep can go red, so its silence above means something',
  );
});

test('BOUNDS mirror the record model\'s own ranges, checked against the real validator', () => {
  const exercise = anExercise({ id: 'push-up', intensity: 'low' });
  const at = (field, value) => validateRoutine(
    aRoutine({ exercises: [exercise], overrides: { 'push-up': { [field]: value } } }),
  );

  for (const field of ['sets', 'repetitions', 'rest_seconds']) {
    assert.equal(at(field, BOUNDS[field].max).ok, true, `${field} at its maximum is valid`);
    assert.equal(at(field, BOUNDS[field].max + 1).ok, false, `${field} above our maximum is refused`);
    assert.equal(at(field, BOUNDS[field].min).ok, true, `${field} at its minimum is valid`);
  }
  // Duration cannot share a routine entry with repetitions, so it is checked on its own entry.
  const timed = anExercise({ id: 'plank', intensity: 'low', measurement: 'time' });
  const duration = (value) => validateRoutine(
    aRoutine({ exercises: [timed], overrides: { plank: { duration_seconds: value } } }),
  );
  assert.equal(duration(BOUNDS.duration_seconds.max).ok, true);
  assert.equal(duration(BOUNDS.duration_seconds.max + 1).ok, false);
  assert.equal(duration(BOUNDS.duration_seconds.min).ok, true);
});

test('a proposed number never leaves the model\'s ranges, however extreme the record', () => {
  const baseline = baselineFor([
    aPerformedRecord({ exerciseId: 'push-up', recordedAt: T.latest, repetitions: 1000, sets: 50, restSeconds: 0, level: 'low' }),
  ], 'push-up');

  const effort = scaleToLevel(PUSH_UP, 'high', null, baseline);

  assert.ok(effort.repetitions <= BOUNDS.repetitions.max, effort.repetitions);
  assert.ok(effort.sets <= BOUNDS.sets.max, effort.sets);
  assert.ok(effort.rest_seconds >= BOUNDS.rest_seconds.min, effort.rest_seconds);
});
