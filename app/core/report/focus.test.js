/**
 * WHAT SHE WORKED ON — named, grouped, and never counted out loud.
 *
 * The family map covers a closed vocabulary, so the test that matters most here is the one that holds
 * it against the model: a movement pattern added to `MOVEMENT_PATTERNS` with no family here would
 * simply stop appearing in every summary, silently, and nothing else in the build would notice.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { MOVEMENT_PATTERNS } from '../model/vocabularies.js';
import {
  MODEL_MOVEMENT_PATTERNS, PATTERN_FAMILIES, WORKED_STATUSES, exerciseIndex, familyOf,
  projectFocus, readExerciseKey,
} from './focus.js';
import { narrowToClient } from './participation.js';
import { HER, MOVEMENTS, aLibrary, thePerformed } from './testing.js';

const hers = () => narrowToClient(HER.id, { performed: thePerformed() }).performed;

test('EVERY MOVEMENT PATTERN THE MODEL DECLARES HAS A FAMILY — the map cannot fall behind', () => {
  const declared = [...MOVEMENT_PATTERNS].sort();

  assert.deepEqual(Object.keys(PATTERN_FAMILIES).sort(), declared);
  assert.deepEqual([...MODEL_MOVEMENT_PATTERNS], [...MOVEMENT_PATTERNS]);
  assert.ok(declared.length > 20, `the vocabulary is real: ${declared.length} patterns`);

  for (const pattern of declared) {
    assert.equal(typeof familyOf(pattern), 'string', `${pattern} reads as something`);
    assert.ok(familyOf(pattern).length > 0);
  }
  assert.equal(familyOf('a-pattern-the-model-does-not-declare'), null);
});

test('the movements are named, most-attended first, and the counts stay behind', () => {
  const focus = projectFocus(hers(), aLibrary());

  assert.deepEqual(focus.movements.map((movement) => movement.name),
    ['Dumbbell Row', 'Plank', 'Push Up']);
  assert.equal(focus.movement_count, 3);
  // The count exists as ordering material and is documented as never being printed. The narrative
  // suite is where that promise is held; here it is enough that it is present to sort by.
  assert.deepEqual(focus.movements.map((movement) => movement.sessions), [2, 2, 2]);
});

test('a movement repeated inside one session is ONE appearance, not three', () => {
  const twiceInOneSession = [
    { exercise_id: MOVEMENTS.push, status: 'performed', session_id: 's-1' },
    { exercise_id: MOVEMENTS.push, status: 'performed', session_id: 's-1' },
    { exercise_id: MOVEMENTS.push, status: 'performed', session_id: 's-1' },
    { exercise_id: MOVEMENTS.plank, status: 'performed', session_id: 's-1' },
    { exercise_id: MOVEMENTS.plank, status: 'performed', session_id: 's-2' },
  ];

  const focus = projectFocus(twiceInOneSession, aLibrary());

  assert.deepEqual(focus.movements.map((movement) => [movement.name, movement.sessions]),
    [['Plank', 2], ['Push Up', 1]]);
});

test('A SKIPPED EXERCISE IS NOT WORK', () => {
  const focus = projectFocus(hers(), aLibrary());

  assert.equal(focus.movements.some((movement) => movement.exercise_id === MOVEMENTS.gone), false);
  assert.equal(focus.skipped, 1, 'and the report knows one was skipped, without telling her');
  assert.equal(WORKED_STATUSES.includes('skipped'), false);
});

test('a substituted exercise counts as the movement that was ACTUALLY done', () => {
  const focus = projectFocus([
    { exercise_id: MOVEMENTS.row, status: 'substituted', session_id: 's-1' },
  ], aLibrary());

  assert.deepEqual(focus.movements.map((movement) => movement.name), ['Dumbbell Row']);
});

test('the families group the work into words a client recognises', () => {
  const focus = projectFocus(hers(), aLibrary());

  assert.deepEqual(focus.families.map((entry) => entry.family), ['core', 'pulling', 'pushing']);
});

test('AN EXERCISE THE COACH HAS SINCE DELETED still reads as itself', () => {
  const focus = projectFocus([
    { exercise_id: MOVEMENTS.gone, status: 'performed', session_id: 's-1' },
  ], aLibrary());

  assert.deepEqual(focus.movements.map((movement) => movement.name), ['wall sit']);
  assert.equal(focus.movements[0].family, null, 'and it claims no family it cannot know');
  assert.equal(readExerciseKey('single-leg-romanian-deadlift'), 'single leg romanian deadlift');
});

test('no library at all still produces a summary, from the keys', () => {
  const focus = projectFocus(hers(), undefined);

  assert.deepEqual(focus.movements.map((movement) => movement.name),
    ['dumbbell row', 'plank', 'push up']);
  assert.deepEqual(focus.families, [], 'and it invents no families it cannot look up');
});

test('the library is read from envelopes or bare records, either way', () => {
  const fromEnvelopes = exerciseIndex(aLibrary());
  const fromBare = exerciseIndex(aLibrary().map((record) => record.content));

  assert.deepEqual([...fromEnvelopes.keys()].sort(), [...fromBare.keys()].sort());
  assert.equal(fromEnvelopes.get(MOVEMENTS.push).name, 'Push Up');
});

test('nothing performed is no movements, not an empty sentence', () => {
  const focus = projectFocus([], aLibrary());

  assert.equal(focus.movement_count, 0);
  assert.deepEqual(focus.movements, []);
  assert.deepEqual(focus.families, []);
});
