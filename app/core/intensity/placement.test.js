/**
 * PLACEMENT — the reordering half, the substitution pool it draws on, and the honest degradation when
 * neither the routine nor the library can fill a level.
 *
 * Three claims here are ABSENCES, and each is paired in the same run with a case proving the check
 * can go the other way: nothing is pruned, an unreferenced exercise is genuinely reachable, and a
 * shortfall is genuinely reported rather than filled in silently.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { IntensityInputError } from './errors.js';
import { placeExercises } from './placement.js';
import { anExercise, aRoutine } from './testing.js';

/** Three exercises whose declared order deliberately disagrees with any rising curve. */
function aMixedRoutine() {
  const hard = anExercise({ id: 'burpee', intensity: 'high', movementPattern: 'conditioning' });
  const easy = anExercise({ id: 'glute-bridge', intensity: 'low', movementPattern: 'hip-extension' });
  const middling = anExercise({ id: 'goblet-squat', intensity: 'medium' });
  const catalogue = keyed([hard, easy, middling]);
  return { catalogue, routine: aRoutine({ exercises: [hard, easy, middling] }) };
}

/** @param {readonly Record<string, any>[]} exercises */
function keyed(exercises) {
  const map = {};
  for (const exercise of exercises) map[exercise.id] = exercise;
  return map;
}

test('REORDERING: the routine\'s own exercises are placed to fit the curve, not its declared order', () => {
  const { catalogue, routine } = aMixedRoutine();

  const { placements, shortfalls } = placeExercises(['low', 'medium', 'high'], routine, catalogue);

  assert.deepEqual(placements.map((placement) => placement.exercise_id),
    ['glute-bridge', 'goblet-squat', 'burpee']);
  assert.deepEqual(routine.entries.map((entry) => entry.exercise_id),
    ['burpee', 'glute-bridge', 'goblet-squat'],
    'the routine keeps its own declared order — the adapter reorders a proposal, not the library');
  assert.deepEqual(placements.map((placement) => placement.source), ['routine', 'routine', 'routine']);
  assert.deepEqual([...shortfalls], [], 'a routine that can serve the curve reports nothing short');
});

test('a descending curve is served by the same three exercises in the opposite order', () => {
  const { catalogue, routine } = aMixedRoutine();

  const { placements } = placeExercises(['high', 'medium', 'low'], routine, catalogue);

  assert.deepEqual(placements.map((placement) => placement.exercise_id),
    ['burpee', 'goblet-squat', 'glute-bridge']);
});

test('SUBSTITUTION: a level the routine cannot serve is filled FROM THE WHOLE CATALOGUE, and named', () => {
  const easyOne = anExercise({ id: 'glute-bridge', intensity: 'low', movementPattern: 'hip-extension' });
  const easyTwo = anExercise({ id: 'bodyweight-squat', intensity: 'low' });
  const easyThree = anExercise({ id: 'calf-raise', intensity: 'low', movementPattern: 'calf-raise' });
  // Referenced by no routine anywhere. This is the substitution pool, and it is the whole reason an
  // unreferenced exercise is a normal state rather than something to tidy away.
  const poolHigh = anExercise({ id: 'jump-squat', intensity: 'high', movementPattern: 'squat' });
  const catalogue = keyed([easyOne, easyTwo, easyThree, poolHigh]);
  const routine = aRoutine({ exercises: [easyOne, easyTwo, easyThree] });

  assert.ok(!routine.entries.some((entry) => entry.exercise_id === poolHigh.id),
    'the fixture is only meaningful if this exercise really is unreferenced');

  const { placements, shortfalls } = placeExercises(['low', 'low', 'high'], routine, catalogue);

  const substituted = placements[2];
  assert.equal(substituted.exercise_id, 'jump-squat');
  assert.equal(substituted.source, 'catalogue-substitute');
  assert.ok(substituted.substituted_for_exercise_id !== null, 'it stands in for a named routine exercise');
  assert.equal(substituted.entry_override, null,
    'a number written for one exercise is never carried onto a different one');
  assert.ok(substituted.substitution_note.includes('comes from your library in place of'),
    substituted.substitution_note);
  assert.deepEqual([...shortfalls], [], 'the library filled it, so nothing ran short');
  assert.equal(placements.length, 3, 'as long as the routine, always');
});

test('the catalogue handed in is NEVER pruned, filtered or rebuilt', () => {
  const easy = anExercise({ id: 'glute-bridge', intensity: 'low', movementPattern: 'hip-extension' });
  const unreferenced = anExercise({ id: 'jump-squat', intensity: 'high', movementPattern: 'squat' });
  const catalogue = keyed([easy, unreferenced]);
  const before = Object.keys(catalogue).sort();

  const { placements } = placeExercises(['low'], aRoutine({ exercises: [easy] }), catalogue);

  assert.deepEqual(Object.keys(catalogue).sort(), before,
    'an exercise nothing references survives: referential checking runs in one direction only');
  assert.equal(placements.length, 1);

  // NON-VACUITY for the check above: an unreferenced exercise is not merely tolerated, it is REACHED.
  // A catalogue nothing could ever draw from would make the survival assertion meaningless.
  const reached = placeExercises(['low', 'high'], aRoutine({ exercises: [easy, easy] }), catalogue);
  assert.ok(reached.placements.some((placement) => placement.exercise_id === 'jump-squat'),
    'the unreferenced exercise is the one the curve is served by');
});

test('SHORTFALL: when nothing anywhere can serve a level, the session says so and keeps its length', () => {
  const easyOne = anExercise({ id: 'glute-bridge', intensity: 'low', movementPattern: 'hip-extension' });
  const easyTwo = anExercise({ id: 'bodyweight-squat', intensity: 'low' });
  const catalogue = keyed([easyOne, easyTwo]);
  const routine = aRoutine({ exercises: [easyOne, easyTwo] });

  const { placements, shortfalls } = placeExercises(['low', 'high'], routine, catalogue);

  assert.equal(placements.length, 2, 'never a shorter session than the routine');
  const short = placements[1];
  assert.equal(short.shortfall.asked_for, 'high');
  assert.equal(short.shortfall.filled_with, 'low');
  assert.ok(short.shortfall.note.includes('asks for a high movement here'), short.shortfall.note);
  assert.ok(short.shortfall.note.includes('an easier movement'), short.shortfall.note);

  assert.equal(shortfalls.length, 1);
  assert.equal(shortfalls[0].level, 'high');
  assert.deepEqual([...shortfalls[0].positions], [1]);
  assert.ok(shortfalls[0].note.includes('The high level ran short'), shortfalls[0].note);
  assert.ok(shortfalls[0].note.includes('still as long as the routine'), shortfalls[0].note);

  // NON-VACUITY: add one high exercise to the catalogue and the same call reports NO shortfall. So
  // the assertions above are about the empty library rather than about a reporter stuck on.
  const withPool = keyed([easyOne, easyTwo, anExercise({ id: 'jump-squat', intensity: 'high' })]);
  const filled = placeExercises(['low', 'high'], routine, withPool);
  assert.deepEqual([...filled.shortfalls], []);
  assert.equal(filled.placements[1].shortfall, null);
});

test('a shortfall the other way round is named as a HARDER movement, not silently accepted', () => {
  const hardOne = anExercise({ id: 'burpee', intensity: 'high', movementPattern: 'conditioning' });
  const hardTwo = anExercise({ id: 'jump-squat', intensity: 'high' });
  const catalogue = keyed([hardOne, hardTwo]);

  const { placements } = placeExercises(['high', 'low'], aRoutine({ exercises: [hardOne, hardTwo] }), catalogue);

  assert.equal(placements[1].shortfall.filled_with, 'high');
  assert.ok(placements[1].shortfall.note.includes('a harder movement'), placements[1].shortfall.note);
});

test('EQUIPMENT: a substitute never assumes equipment the routine does not already use', () => {
  const easy = anExercise({ id: 'glute-bridge', intensity: 'low', movementPattern: 'hip-extension' });
  const barbell = anExercise({
    id: 'barbell-jump-squat', intensity: 'high', movementPattern: 'squat', equipment: ['barbell'],
  });
  const catalogue = keyed([easy, barbell]);

  const bodyweightOnly = placeExercises(['low', 'high'],
    aRoutine({ exercises: [easy, easy] }), catalogue);
  assert.equal(bodyweightOnly.placements[1].exercise_id, 'glute-bridge');
  assert.ok(bodyweightOnly.placements[1].shortfall,
    'a barbell is not proposed into a session he built out of bodyweight work');

  // NON-VACUITY: the same candidate IS chosen once the routine itself uses a barbell, so the
  // refusal above is the equipment rule rather than a candidate that could never be selected.
  const loaded = anExercise({
    id: 'back-squat', intensity: 'medium', movementPattern: 'squat', equipment: ['barbell'],
  });
  const withBarbell = keyed([easy, barbell, loaded]);
  const allowed = placeExercises(['low', 'high'],
    aRoutine({ exercises: [easy, loaded] }), withBarbell);
  assert.equal(allowed.placements[1].exercise_id, 'barbell-jump-squat');
});

test('a substitute that trains nothing the routine trains is not offered at all', () => {
  const easy = anExercise({
    id: 'glute-bridge', intensity: 'low', movementPattern: 'hip-extension', primaryMuscles: ['glutes'],
  });
  const unrelated = anExercise({
    id: 'neck-curl', intensity: 'high', movementPattern: 'rotation', primaryMuscles: ['neck'],
  });
  const catalogue = keyed([easy, unrelated]);

  const { placements } = placeExercises(['low', 'high'], aRoutine({ exercises: [easy, easy] }), catalogue);

  assert.ok(placements[1].shortfall, 'a different session is not a substitute');
  assert.equal(placements[1].exercise_id, 'glute-bridge');
});

test('VARIATION is an argument: rotate picks among equally good substitutes, deterministically', () => {
  const easy = anExercise({ id: 'glute-bridge', intensity: 'low', movementPattern: 'squat' });
  const first = anExercise({ id: 'aaa-jump', intensity: 'high', movementPattern: 'squat' });
  const second = anExercise({ id: 'bbb-jump', intensity: 'high', movementPattern: 'squat' });
  const catalogue = keyed([easy, first, second]);
  const routine = aRoutine({ exercises: [easy, easy] });

  const atZero = placeExercises(['low', 'high'], routine, catalogue, { rotate: 0 });
  const atOne = placeExercises(['low', 'high'], routine, catalogue, { rotate: 1 });
  const atTwo = placeExercises(['low', 'high'], routine, catalogue, { rotate: 2 });

  assert.equal(atZero.placements[1].exercise_id, 'aaa-jump');
  assert.equal(atOne.placements[1].exercise_id, 'bbb-jump');
  assert.equal(atTwo.placements[1].exercise_id, 'aaa-jump', 'rotation wraps rather than running out');
  assert.deepEqual(atZero, placeExercises(['low', 'high'], routine, catalogue, { rotate: 0 }),
    'same arguments, same placement, every time');
});

test('a routine naming an exercise the catalogue does not hold is refused by name', () => {
  const easy = anExercise({ id: 'glute-bridge', intensity: 'low' });
  assert.throws(
    () => placeExercises(['low'], aRoutine({ exercises: [easy] }), keyed([])),
    (error) => {
      assert.ok(error instanceof IntensityInputError);
      assert.ok(error.message.includes('glute-bridge'), error.message);
      return true;
    },
  );
});

test('variation.rotate must be a whole number, because it is not a random draw', () => {
  const easy = anExercise({ id: 'glute-bridge', intensity: 'low' });
  const routine = aRoutine({ exercises: [easy] });
  for (const bad of [-1, 1.5, 'two']) {
    assert.throws(
      () => placeExercises(['low'], routine, keyed([easy]), /** @type {any} */ ({ rotate: bad })),
      IntensityInputError,
    );
  }
});
