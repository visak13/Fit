/**
 * THE PROPOSAL: what it is, what it deliberately is not, and the words it puts in front of the coach.
 *
 * Four of the claims here are ABSENCES — nothing is applied, nothing is mutated, no sentence names a
 * load, no sentence offers a progression — and an absence is the one shape of evidence this build has
 * repeatedly caught lying. So every sweep below is run TWICE in the same test: once over the real
 * proposal, and once over a deliberately poisoned copy that it must catch. The poison is asserted to
 * be present before the sweep is asked about it, because a break that silently fails to land reports
 * all-green and is indistinguishable from a working guard.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findEmoji, findWords, humanSentencesOf, IntensityInputError, LOAD_WORDS, namesIn, PROGRESSION_WORDS,
  PROPOSAL_KIND, proposeSession,
} from './intensity.js';
import * as api from './intensity.js';
import { aHistory, anExercise, aPattern, aPerformedRecord, aRoutine, T } from './testing.js';

const EASY = anExercise({ id: 'glute-bridge', intensity: 'low', movementPattern: 'hip-extension', primaryMuscles: ['glutes'] });
const MIDDLING = anExercise({ id: 'goblet-squat', intensity: 'medium' });
const HARD = anExercise({ id: 'burpee', intensity: 'high', movementPattern: 'conditioning', primaryMuscles: ['full-body'] });
// Referenced by no routine here. It shares a muscle with the easy work, which is what makes it a
// credible stand-in rather than a different session.
const POOL_HARD = anExercise({
  id: 'jump-squat', intensity: 'high', movementPattern: 'squat', primaryMuscles: ['glutes', 'quadriceps'],
});

const CATALOGUE = [EASY, MIDDLING, HARD, POOL_HARD];
const ROUTINE = aRoutine({ exercises: [HARD, EASY, MIDDLING] });
const CURVE = aPattern(['low', 'medium', 'high']);

/** A proposal over the fixtures above, with whatever history is passed. */
function aProposal(history = null) {
  return proposeSession({ pattern: CURVE, routine: ROUTINE, catalogue: CATALOGUE, history });
}

test('a proposal REORDERS and SCALES — both halves, in one call', () => {
  const proposal = aProposal();

  assert.equal(proposal.kind, PROPOSAL_KIND);
  assert.equal(proposal.pattern_id, CURVE.id);
  assert.equal(proposal.routine_id, ROUTINE.id);
  assert.equal(proposal.positions.length, ROUTINE.entries.length);

  // REORDERED: the routine declares hard, easy, middling; the curve asks for the opposite.
  assert.deepEqual(proposal.positions.map((position) => position.exercise_id),
    ['glute-bridge', 'goblet-squat', 'burpee']);
  // SCALED: each position carries the numbers for the level it was placed at, and they differ.
  assert.deepEqual(proposal.positions.map((position) => position.asked_for_level),
    ['low', 'medium', 'high']);
  const works = proposal.positions.map((position) => position.repetitions ?? position.duration_seconds);
  assert.equal(new Set(works).size > 1, true, `an adapter that only re-sorted would give ${works}`);
  for (const position of proposal.positions) {
    assert.ok(position.sets >= 1 && position.rest_seconds >= 0);
    assert.ok(position.reference.note.length > 0, 'every number accounts for itself');
  }
});

test('it PROPOSES: the module exports nothing that would apply, save or write one', () => {
  const exported = Object.keys(api).sort();

  assert.ok(exported.includes('proposeSession'), 'the export list is real, so the sweep below has a subject');
  const forbidden = exported.filter((name) => {
    const lowered = name.toLowerCase();
    return ['apply', 'commit', 'write', 'save', 'persist', 'store', 'mutate'].some((verb) => lowered.includes(verb));
  });
  assert.deepEqual(forbidden, [],
    'the coach disposes: this package describes a session, it never enacts one');
});

test('a proposal is DEEP-FROZEN, and the inputs come back untouched', () => {
  const proposal = aProposal(aHistory([
    aPerformedRecord({ exerciseId: 'glute-bridge', recordedAt: T.latest, repetitions: 14 }),
  ]));

  assert.throws(() => { /** @type {any} */ (proposal).positions = []; }, TypeError);
  assert.throws(() => { /** @type {any} */ (proposal.positions)[0] = null; }, TypeError);
  assert.throws(() => { /** @type {any} */ (proposal.positions[0]).sets = 99; }, TypeError);

  // NON-VACUITY for the three above: a frozen object only throws in strict mode, and a module that
  // was somehow not strict would make them pass silently. This proves the throw is real.
  const probe = Object.freeze({ value: 1 });
  assert.throws(() => { /** @type {any} */ (probe).value = 2; }, TypeError,
    'the harness itself is strict, so the assertions above are meaningful');
});

test('the arguments are not mutated, and the catalogue is not pruned', () => {
  const catalogueBefore = CATALOGUE.map((exercise) => exercise.id).sort();
  const entriesBefore = ROUTINE.entries.map((entry) => entry.exercise_id);

  aProposal(aHistory([aPerformedRecord({ exerciseId: 'burpee', recordedAt: T.latest, repetitions: 12 })]));

  assert.deepEqual(CATALOGUE.map((exercise) => exercise.id).sort(), catalogueBefore,
    'an exercise nothing references is a normal state, and nothing here removes one');
  assert.deepEqual(ROUTINE.entries.map((entry) => entry.exercise_id), entriesBefore,
    'the routine is read, never rewritten');
});

test('humanSentencesOf reaches EVERY sentence in the proposal, and the walk proves it', () => {
  // Built to carry a sentence of every kind at once: a substitution, a shortfall, a clamp and a
  // measured baseline. A sweep is only as good as the strings it is handed.
  const proposal = proposeSession({
    pattern: aPattern(['low', 'high', 'high']),
    routine: aRoutine({ exercises: [EASY, EASY, EASY] }),
    catalogue: [EASY, POOL_HARD],
    history: aHistory([
      aPerformedRecord({ exerciseId: 'glute-bridge', recordedAt: T.latest, repetitions: 40, level: 'low' }),
    ]),
  });

  const collected = new Set(humanSentencesOf(proposal));
  const walked = new Set(sentencesIn(proposal));

  assert.ok(walked.size > 5, `the fixture must actually carry sentences: found ${walked.size}`);
  assert.deepEqual([...walked].filter((sentence) => !collected.has(sentence)), [],
    'a sentence the collector cannot see is a sentence no sweep can check');
  assert.ok(proposal.positions.some((position) => position.substitution_note), 'a substitution happened');
  assert.ok(proposal.positions.some((position) => position.shortfall), 'a shortfall happened');
  assert.ok(proposal.positions.some((position) => position.clamped), 'a clamp happened');
});

test('NO SENTENCE the coach reads names a load, a weight or a kilogram', () => {
  const proposal = aProposal(aHistory([
    aPerformedRecord({ exerciseId: 'glute-bridge', recordedAt: T.latest, repetitions: 40, level: 'low' }),
  ]));
  const sentences = humanSentencesOf(proposal);
  const names = namesIn(proposal);

  assert.deepEqual(findWords(sentences, LOAD_WORDS, names), [],
    'a load is a per-client observation the coach makes, never a number this proposes');

  // NON-VACUITY: the identical sweep over one poisoned sentence must catch it. The poison is not one of
  // the masked names, so masking cannot be what keeps the sweep quiet above.
  const poison = 'Try 20kg this time, which is a heavier load than last week.';
  assert.ok(poison.toLowerCase().includes('kg') && poison.includes('load'), 'the poison really is present');
  assert.ok(!names.includes(poison), 'and it is not being masked');
  const caught = findWords([...sentences, poison], LOAD_WORDS, names);
  assert.ok(caught.length > 0 && caught.every((hit) => hit.sentence === poison),
    'the sweep goes red on the poison and on nothing else');

  // MASKING IS NARROW: it removes only the names the proposal interpolated. A sentence that says
  // `load` in our own words is still caught even when a name is masked out of the same sentence.
  const mixed = `${names[0]} carries a heavier load today.`;
  assert.equal(findWords([mixed], LOAD_WORDS, names).length, 2, 'heavier and load, both found');
});

test('NO SENTENCE offers a progression, a recommendation or a target', () => {
  const proposal = aProposal(aHistory([
    aPerformedRecord({ exerciseId: 'burpee', recordedAt: T.latest, repetitions: 18, level: 'high' }),
  ]));
  const sentences = humanSentencesOf(proposal);
  const names = namesIn(proposal);

  assert.deepEqual(findWords(sentences, PROGRESSION_WORDS, names), [],
    'the app proposes a shape; it never decides that today should be harder than last week');

  const poison = 'We recommend a progression here, so you should target more next week.';
  assert.ok(poison.includes('recommend') && poison.includes('progression'), 'the poison really is present');
  const caught = findWords([...sentences, poison], PROGRESSION_WORDS, names);
  assert.ok(caught.length >= 3 && caught.every((hit) => hit.sentence === poison), 'the sweep goes red');
});

test('NO EMOJI in any user-facing string, and ordinary punctuation is not mistaken for one', () => {
  const sentences = humanSentencesOf(aProposal());

  assert.deepEqual(findEmoji(sentences), []);
  assert.deepEqual(findEmoji(['An em dash — a curly quote ’ and an ellipsis … are not emoji.']), [],
    'the sweep must not fire on punctuation this codebase actually uses');

  // Written as escapes rather than as characters on purpose: a later whole-source emoji sweep would
  // otherwise find the probe that exists to prove emoji sweeps work, and report the guard as the defect.
  const poison = 'Great work \u{1F4AA} keep going \u{2705}';
  const caught = findEmoji([...sentences, poison]);
  assert.equal(caught.length, 2, 'both emoji found');
  assert.ok(caught.every((hit) => hit.sentence === poison));
});

test('a client with NO HISTORY gets a usable proposal that says plainly it had no baseline', () => {
  const proposal = aProposal(null);

  assert.equal(proposal.positions.length, ROUTINE.entries.length, 'usable: a full session, not an error');
  assert.equal(proposal.baseline.kind, 'none');
  assert.ok(proposal.baseline.note.includes('nothing recorded for this client yet'), proposal.baseline.note);
  assert.ok(proposal.baseline.note.includes('not as a measurement'), proposal.baseline.note);
  for (const position of proposal.positions) {
    assert.equal(position.reference.source, 'library-scaling-point',
      'and no number pretends to be measured');
  }

  // NON-VACUITY: with history the same fields say something different, so the assertions above are
  // about the empty case rather than about a proposal that always claims to have no baseline.
  const measured = aProposal(aHistory([
    aPerformedRecord({ exerciseId: 'glute-bridge', recordedAt: T.latest, repetitions: 14, level: 'medium' }),
  ]));
  assert.equal(measured.baseline.kind, 'measured');
  assert.ok(measured.positions.some((position) => position.reference.source === 'measured-performance'));
});

test('AN UNSHAPED SESSION still proposes, and its words say what was left out and what that costs', () => {
  // Everything he has done here, recorded at a point nobody wrote down — the state of every fact
  // already on disk, and of any line run under no accepted curve.
  const unshaped = aProposal(aHistory([
    aPerformedRecord({ exerciseId: 'glute-bridge', recordedAt: T.latest, repetitions: 40 }),
    aPerformedRecord({ exerciseId: 'burpee', recordedAt: T.older, repetitions: 30 }),
  ]));

  assert.equal(unshaped.positions.length, ROUTINE.entries.length, 'usable: a full session, not a refusal');
  assert.equal(unshaped.baseline.excluded.record_count, 2);
  assert.ok(unshaped.baseline.note.includes('left out'), unshaped.baseline.note);
  for (const position of unshaped.positions) {
    assert.equal(position.reference.source, 'library-scaling-point',
      'no number may be built from work whose point was never recorded');
  }

  // THE SENTENCES THE EXCLUSION ADDS GO THROUGH THE SAME SWEEPS AS EVERY OTHER SENTENCE, on both
  // shapes: nothing recorded at a point at all, and some records calibratable and some not.
  const mixed = aProposal(aHistory([
    aPerformedRecord({ exerciseId: 'glute-bridge', recordedAt: T.latest, repetitions: 40 }),
    aPerformedRecord({ exerciseId: 'burpee', recordedAt: T.older, repetitions: 30, level: 'high' }),
  ]));
  assert.ok(mixed.baseline.note.includes('might have been'), mixed.baseline.note);

  for (const proposal of [unshaped, mixed]) {
    const sentences = humanSentencesOf(proposal);
    const names = namesIn(proposal);
    assert.ok(sentences.includes(proposal.baseline.note), 'the new sentence is genuinely under the sweep');
    assert.deepEqual(findWords(sentences, LOAD_WORDS, names), []);
    assert.deepEqual(findWords(sentences, PROGRESSION_WORDS, names), []);
    assert.deepEqual(findEmoji(sentences), []);
  }

  // NON-VACUITY: the same sweep over the same sentences plus one poisoned copy of the new sentence
  // does go red, so the three silences above mean something.
  /**
   * AND IT MUST NOT REUSE A PHRASE THIS SCREEN ALREADY SPENDS ON SOMETHING ELSE. Found by walking the
   * real application: the exclusion sentence originally said records were "set aside", and the
   * standing note two paragraphs above it says "the whole shape can be set aside" — meaning REJECT
   * THIS PROPOSAL. One phrase, two meanings, both on screen at once, in front of a client.
   *
   * The general rule is worth more than the instance: generated prose is written one function at a
   * time and READ all at once, so a phrase is only free if nothing else on the same surface has
   * already claimed it.
   */
  const standing = unshaped.notes.join(' ');
  assert.ok(standing.includes('set aside'), 'the standing note still spends that phrase on rejection');
  assert.ok(!unshaped.baseline.note.includes('set aside'),
    'the exclusion sentence must not borrow it: ' + unshaped.baseline.note);
  assert.ok(!mixed.baseline.note.includes('set aside'), mixed.baseline.note);

  const poison = `${unshaped.baseline.note} We recommend a heavier load.`;
  const poisoned = [...humanSentencesOf(unshaped), poison];
  assert.deepEqual(
    findWords(poisoned, LOAD_WORDS, namesIn(unshaped)).map((found) => found.word).sort(),
    ['heavier', 'load'],
    'the load sweep can go red on this very sentence, so its silence above means something',
  );
  assert.deepEqual(
    findWords(poisoned, PROGRESSION_WORDS, namesIn(unshaped)).map((found) => found.sentence),
    [poison],
    'and so can the progression sweep',
  );
});

test('the standing note tells him nothing has been changed or saved', () => {
  const notes = aProposal().notes;

  assert.ok(notes[0].includes('Nothing here has been changed and nothing has been saved'), notes[0]);
  assert.ok(notes.some((note) => note.includes(CURVE.name) && note.includes(ROUTINE.name)),
    'and which curve was pressed on which routine');
});

test('a catalogue arriving keyed by id behaves exactly as a list does', () => {
  const keyed = {};
  for (const exercise of CATALOGUE) keyed[exercise.id] = exercise;

  assert.deepEqual(
    proposeSession({ pattern: CURVE, routine: ROUTINE, catalogue: keyed }),
    proposeSession({ pattern: CURVE, routine: ROUTINE, catalogue: CATALOGUE }),
  );
});

test('malformed arguments are refused at the edge, by name', () => {
  const good = { pattern: CURVE, routine: ROUTINE, catalogue: CATALOGUE };
  assert.throws(() => proposeSession({ ...good, pattern: null }), IntensityInputError);
  assert.throws(() => proposeSession({ ...good, pattern: { id: 'x', sequence: [] } }), IntensityInputError);
  assert.throws(() => proposeSession({ ...good, routine: { id: 'x', entries: [] } }), IntensityInputError);
  assert.throws(() => proposeSession({ ...good, catalogue: null }), IntensityInputError);
  assert.throws(() => proposeSession({ ...good, catalogue: [{ name: 'no id' }] }), IntensityInputError);
});

/**
 * Every sentence-shaped string anywhere in the proposal, found by walking it rather than by knowing
 * where they live. A sentence holds a space and ends in a full stop; an identifier and a name hold
 * neither, so nothing is swept in that a human does not read as prose.
 *
 * @param {unknown} value @param {string[]} [found] @returns {string[]}
 */
function sentencesIn(value, found = []) {
  if (typeof value === 'string') {
    if (value.includes(' ') && value.endsWith('.')) found.push(value);
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) sentencesIn(item, found);
    return found;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) sentencesIn(/** @type {any} */ (value)[key], found);
  }
  return found;
}
