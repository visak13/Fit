/**
 * THE ADAPTER AGAINST THE REAL SHIPPED LIBRARY — every shipped curve on every shipped routine.
 *
 * The suites beside this one use small fixtures, which is right: a fixture can be built to reach a
 * branch and a real routine cannot. But a fixture can also be built, without anyone meaning to, to
 * suit the code rather than the content — and the content here is what the coach actually opens the
 * app to. So this suite presses all seven shipped patterns against all seven shipped routines with the
 * whole ninety-nine exercise catalogue behind them, and checks the properties that must hold for every
 * one of the forty-nine combinations.
 *
 * The two claims the seed's own descriptions make, checked here rather than taken on trust: a curve
 * whose level the routine cannot serve is FILLED FROM THE WIDER CATALOGUE, and where the catalogue
 * cannot serve it either the session SAYS which level ran short. Both are asserted to actually occur
 * across the real content, so neither is a branch that ships untried.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import EXERCISES from '../seed/content/exercises.js';
import PATTERNS from '../seed/content/intensity-patterns.js';
import ROUTINES from '../seed/content/routines.js';
import {
  findEmoji, findWords, humanSentencesOf, LOAD_WORDS, namesIn, PROGRESSION_WORDS, proposeSession,
} from './intensity.js';

/** Every shipped pattern against every shipped routine. */
function everyCombination() {
  const proposals = [];
  for (const pattern of PATTERNS) {
    for (const routine of ROUTINES) {
      proposals.push({ pattern, routine, proposal: proposeSession({ pattern, routine, catalogue: EXERCISES }) });
    }
  }
  return proposals;
}

test('the shipped content is what this suite thinks it is', () => {
  assert.ok(PATTERNS.length >= 7, `patterns: ${PATTERNS.length}`);
  assert.ok(ROUTINES.length >= 7, `routines: ${ROUTINES.length}`);
  assert.ok(EXERCISES.length >= 60, `exercises: ${EXERCISES.length}`);
  const referenced = new Set(ROUTINES.flatMap((routine) => routine.entries.map((entry) => entry.exercise_id)));
  assert.ok(EXERCISES.length > referenced.size,
    'the catalogue exceeds the week, which is the substitution pool this adapter draws on');
});

test('EVERY shipped curve shapes EVERY shipped routine, at full length', () => {
  const combinations = everyCombination();
  assert.equal(combinations.length, PATTERNS.length * ROUTINES.length);

  for (const { pattern, routine, proposal } of combinations) {
    const where = `${pattern.id} on ${routine.id}`;
    assert.equal(proposal.positions.length, routine.entries.length, `${where}: never a shorter session`);
    assert.equal(new Set(proposal.positions.map((position) => position.exercise_id)).size,
      routine.entries.length, `${where}: no exercise appears twice`);
    for (const position of proposal.positions) {
      assert.ok(pattern.sequence.includes(position.asked_for_level), `${where}: every level comes from the curve`);
      assert.ok(position.sets >= 1, where);
      assert.ok(position.rest_seconds >= 0, where);
      const work = position.repetitions ?? position.duration_seconds;
      assert.ok(typeof work === 'number' && work > 0, `${where}: ${position.exercise_id} carries no work`);
      assert.equal(position.repetitions === null || position.duration_seconds === null, true,
        `${where}: an exercise is counted one way or the other, never both`);
    }
  }
});

test('a curve is SCALED, not merely re-sorted: the numbers differ from the routine\'s own defaults', () => {
  // An adapter that only reordered would pass everything above this line. So: press a curve on a real
  // routine and compare what it asks for against what that routine asks for unadapted.
  const routine = ROUTINES.find((candidate) => candidate.entries.length >= 6) ?? ROUTINES[0];
  const proposal = proposeSession({ pattern: patternById('steady-build'), routine, catalogue: EXERCISES });

  const changed = [];
  for (const position of proposal.positions) {
    const entry = routine.entries.find((candidate) => candidate.exercise_id === position.exercise_id);
    if (!entry) continue;
    const exercise = exerciseById(position.exercise_id);
    const unadapted = {
      sets: entry.sets ?? exercise.default_prescription.sets,
      work: entry.repetitions ?? entry.duration_seconds
        ?? exercise.default_prescription.repetitions ?? exercise.default_prescription.duration_seconds,
      rest: entry.rest_seconds ?? exercise.default_rest_seconds,
    };
    const proposed = {
      sets: position.sets,
      work: position.repetitions ?? position.duration_seconds,
      rest: position.rest_seconds,
    };
    if (unadapted.sets !== proposed.sets || unadapted.work !== proposed.work || unadapted.rest !== proposed.rest) {
      changed.push(`${position.exercise_id}: ${unadapted.sets}x${unadapted.work}r${unadapted.rest} becomes ${proposed.sets}x${proposed.work}r${proposed.rest}`);
    }
  }
  assert.ok(changed.length >= 3,
    `the effort must genuinely move, not only the order. Changed: ${changed.join('; ') || 'nothing'}`);
});

test('the LEVEL drives the effort: an exercise placed off its own level takes that level\'s numbers', () => {
  // A shortfall is the case where a movement sits at a level the library does not file it under. Its
  // numbers must come from the level the CURVE asked for — that is what makes the curve shape effort
  // rather than merely order.
  const short = everyCombination().find(({ proposal }) => proposal.shortfalls.length > 0);
  assert.ok(short, 'the shipped content reaches this case');

  const position = short.proposal.positions.find((candidate) => candidate.shortfall);
  const exercise = exerciseById(position.exercise_id);
  assert.notEqual(exercise.intensity, position.asked_for_level, 'this movement is off its own level');
  assert.equal(position.reference.source, 'library-scaling-point', 'no history was supplied');

  const asked = exercise.scaling[position.asked_for_level];
  const itsOwn = exercise.scaling[exercise.intensity];
  assert.equal(position.sets, asked.sets);
  assert.equal(position.repetitions ?? position.duration_seconds, asked.repetitions ?? asked.duration_seconds);
  assert.equal(position.rest_seconds, asked.rest_seconds);
  assert.notDeepEqual(
    [asked.sets, asked.repetitions ?? asked.duration_seconds, asked.rest_seconds],
    [itsOwn.sets, itsOwn.repetitions ?? itsOwn.duration_seconds, itsOwn.rest_seconds],
    'and those numbers are not the ones it would have carried at its own level',
  );
});

test('the WIDER CATALOGUE is genuinely drawn on by the real shipped content', () => {
  const substitutions = everyCombination()
    .flatMap(({ pattern, routine, proposal }) => proposal.positions
      .filter((position) => position.source === 'catalogue-substitute')
      .map((position) => `${pattern.id} on ${routine.id}: ${position.exercise_id}`));

  assert.ok(substitutions.length > 0,
    'the surplus catalogue is the substitution pool, and this is the feature that proves it is reachable');

  const referenced = new Set(ROUTINES.flatMap((routine) => routine.entries.map((entry) => entry.exercise_id)));
  const fromThePool = everyCombination()
    .flatMap(({ proposal }) => proposal.positions.map((position) => position.exercise_id))
    .filter((id) => !referenced.has(id));
  assert.ok(fromThePool.length > 0,
    'and at least one exercise no routine references is put to work, which is why nothing prunes them');
});

test('where the library runs short, the real content SAYS SO rather than quietly shortening', () => {
  const short = everyCombination().filter(({ proposal }) => proposal.shortfalls.length > 0);

  assert.ok(short.length > 0,
    'a curve the shipped library cannot fill exactly exists, so the honest-degradation path is exercised');
  for (const { pattern, routine, proposal } of short) {
    const where = `${pattern.id} on ${routine.id}`;
    assert.equal(proposal.positions.length, routine.entries.length, `${where}: still full length`);
    for (const shortfall of proposal.shortfalls) {
      assert.ok(shortfall.note.includes(`The ${shortfall.level} level ran short`), shortfall.note);
      assert.ok(shortfall.positions.length > 0, where);
      for (const position of shortfall.positions) {
        assert.equal(proposal.positions[position].shortfall.asked_for, shortfall.level,
          `${where}: the summary and the position agree`);
      }
    }
  }
});

test('NO SENTENCE anywhere in the real content names a load or offers a progression', () => {
  const combinations = everyCombination();
  const sentences = combinations.flatMap(({ proposal }) => humanSentencesOf(proposal));
  const names = combinations.flatMap(({ proposal }) => namesIn(proposal));
  assert.ok(sentences.length > 200, `the sweep must have something to read: ${sentences.length} sentences`);

  assert.deepEqual(findWords(sentences, LOAD_WORDS, names), []);
  assert.deepEqual(findWords(sentences, PROGRESSION_WORDS, names), []);
  assert.deepEqual(findEmoji(sentences), []);

  // MASKING IS DOING REAL WORK, and this records why rather than leaving it as an unexplained
  // parameter: the shipped library holds an exercise called Bodyweight Squat, so the unmasked sweep
  // fires on the coach's own content. That is the library's vocabulary, not this application's wording.
  const unmasked = findWords(sentences, LOAD_WORDS);
  assert.ok(unmasked.length > 0 && unmasked.every((hit) => hit.word === 'weight'),
    'the only unmasked hits are exercise names carrying the word weight');
  assert.ok(names.some((name) => name.toLowerCase().includes('weight')),
    'and the name responsible is genuinely among the ones being masked');

  // NON-VACUITY: the sweeps are pointed at a known positive in the same run. Forty-nine clean
  // proposals and three broken sweeps produce identical output. The poison is not a name, so masking
  // cannot be what makes them quiet.
  const poison = 'Add 5kg, because we recommend a progression.';
  assert.ok(findWords([poison], LOAD_WORDS, names).length > 0, 'the load sweep can fire through the mask');
  assert.ok(findWords([poison], PROGRESSION_WORDS, names).length > 0, 'the progression sweep can fire');
  assert.ok(findEmoji(['\u{1F44D}']).length > 0, 'the emoji sweep can fire');
});

test('the proposal for a real routine accounts for every number it puts on the screen', () => {
  const routine = ROUTINES[0];
  const proposal = proposeSession({ pattern: patternById('low-medium-high-low'), routine, catalogue: EXERCISES });

  assert.equal(proposal.baseline.kind, 'none', 'no history was supplied, which is the first-session case');

  let fromTheLibrary = 0;
  let fromTheRoutine = 0;
  for (const position of proposal.positions) {
    const exercise = exerciseById(position.exercise_id);
    const point = exercise.scaling[position.asked_for_level];
    if (position.reference.source === 'library-scaling-point') {
      fromTheLibrary += 1;
      assert.equal(position.sets, point.sets, position.exercise_id);
      assert.equal(position.rest_seconds, point.rest_seconds, position.exercise_id);
      assert.equal(position.repetitions ?? position.duration_seconds,
        point.repetitions ?? point.duration_seconds, position.exercise_id);
      continue;
    }
    // The shipped routines DO override numbers on some entries, so this branch is reached rather than
    // theoretical. Where it is, the routine's own number is the reference and the ceiling both.
    assert.equal(position.reference.source, 'routine-override', position.exercise_id);
    fromTheRoutine += 1;
    const entry = routine.entries.find((candidate) => candidate.exercise_id === position.exercise_id);
    const written = entry.repetitions ?? entry.duration_seconds ?? null;
    if (written !== null) {
      assert.ok((position.repetitions ?? position.duration_seconds) <= Math.max(
        written, point.repetitions ?? point.duration_seconds,
      ), `${position.exercise_id} asks for more than either source contains`);
    }
    assert.ok(position.reference.note.includes('what this routine asks for'), position.reference.note);
  }
  assert.ok(fromTheLibrary > 0 && fromTheRoutine > 0,
    `both reference paths are exercised by the real content: ${fromTheLibrary} library, ${fromTheRoutine} routine`);
});

/** @param {string} id @returns {Record<string, any>} */
function patternById(id) {
  const found = PATTERNS.find((pattern) => pattern.id === id);
  assert.ok(found, `the shipped patterns no longer include ${id}`);
  return found;
}

/** @param {string} id @returns {Record<string, any>} */
function exerciseById(id) {
  const found = EXERCISES.find((exercise) => exercise.id === id);
  assert.ok(found, `the shipped catalogue no longer holds ${id}`);
  return found;
}
