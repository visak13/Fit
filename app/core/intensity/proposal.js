/**
 * THE PROPOSAL — assembled, frozen, and returned.
 *
 * ## It proposes. The coach disposes
 *
 * This is the rule most likely to be broken by accident, so it is built into the SHAPE of what this
 * module returns rather than left as an instruction. The return value is a described, inspectable set
 * of changes: a curve, the reference every number was built from, one line per position, and the
 * places the routine ran short. It is not a routine, not a session, not a record and not anything the
 * store recognises. There is nothing here to save, and this package exports no verb that would save
 * it: `intensity.js` has no `apply`, no `commit` and no `write`, and a test asserts the export list
 * still does not.
 *
 * The object is deep-frozen on the way out. That is not defensiveness about the caller — it is the
 * cheapest possible statement that a proposal is a thing to read, offer and reject, and that a screen
 * wanting to change a value builds its own edit rather than reaching into ours.
 *
 * ## Nothing here reads or writes anything
 *
 * No store, no clock, no randomness, no network, no module outside this directory. The routine, the
 * catalogue and the client's history all arrive as arguments. `purity.test.js` asserts it by taking
 * the clock and the random number generator away and calling the adapter anyway.
 */

import { spreadCurve } from './curve.js';
import { scaleToLevel } from './effort.js';
import { IntensityInputError } from './errors.js';
import { exerciseOf, placeExercises } from './placement.js';

/** What this object is, so a screen holding several kinds of thing can tell them apart. */
export const PROPOSAL_KIND = 'intensity-proposal';

/**
 * @typedef {Object} ProposedPosition
 * @property {number} position
 * @property {string} asked_for_level
 * @property {string} exercise_id
 * @property {string} exercise_name
 * @property {'routine'|'catalogue-substitute'} source
 * @property {string|null} substituted_for_exercise_id
 * @property {string|null} substituted_for_exercise_name
 * @property {string} measurement
 * @property {number} sets
 * @property {number|null} repetitions
 * @property {number|null} duration_seconds
 * @property {number} rest_seconds
 * @property {import('./effort.js').Reference} reference
 * @property {boolean} clamped
 * @property {string|null} clamp_note
 * @property {null|{asked_for: string, filled_with: string, note: string}} shortfall
 * @property {string|null} substitution_note
 */

/**
 * @typedef {Object} Proposal
 * @property {string} kind
 * @property {string} pattern_id
 * @property {string} pattern_name
 * @property {string} routine_id
 * @property {string} routine_name
 * @property {string|null} client_id
 * @property {import('./curve.js').Curve} curve
 * @property {import('./baseline.js').Baseline} baseline
 * @property {readonly ProposedPosition[]} positions
 * @property {readonly {level: string, positions: readonly number[], note: string}[]} shortfalls
 * @property {readonly string[]} notes
 */

/**
 * Shape one session from a pattern, a routine, a catalogue and an optional history.
 *
 * @param {Record<string, any>} pattern
 * @param {Record<string, any>} routine
 * @param {Readonly<Record<string, Record<string, any>>>} catalogue
 * @param {import('./baseline.js').Baseline} baseline
 * @param {{rotate?: number}} variation
 * @returns {Proposal} Deep-frozen.
 */
export function assembleProposal(pattern, routine, catalogue, baseline, variation) {
  const curve = spreadCurve(pattern.sequence, routine.entries.length, pattern.mapping_rule);
  const { placements, shortfalls } = placeExercises(curve.levels, routine, catalogue, variation);

  const positions = placements.map((placement) => {
    const exercise = catalogue[placement.exercise_id];
    const effort = scaleToLevel(
      exercise,
      placement.asked_for_level,
      placement.entry_override,
      baseline.exercises[placement.exercise_id] ?? null,
    );
    return Object.freeze({
      position: placement.position,
      asked_for_level: placement.asked_for_level,
      exercise_id: placement.exercise_id,
      exercise_name: exercise.name,
      source: placement.source,
      substituted_for_exercise_id: placement.substituted_for_exercise_id,
      substituted_for_exercise_name: placement.substituted_for_exercise_name,
      measurement: effort.measurement,
      sets: effort.sets,
      repetitions: effort.repetitions,
      duration_seconds: effort.duration_seconds,
      rest_seconds: effort.rest_seconds,
      reference: effort.reference,
      clamped: effort.clamped,
      clamp_note: effort.clamp_note,
      shortfall: placement.shortfall,
      substitution_note: placement.substitution_note,
    });
  });

  return Object.freeze({
    kind: PROPOSAL_KIND,
    pattern_id: pattern.id,
    pattern_name: pattern.name,
    routine_id: routine.id,
    routine_name: routine.name,
    client_id: baseline.client_id,
    curve,
    baseline,
    positions: Object.freeze(positions),
    shortfalls,
    notes: Object.freeze(standingNotes(pattern, routine, positions)),
  });
}

/**
 * The sentences that are true of every proposal.
 *
 * The first one is the whole feature's contract said out loud, in the place the coach is actually
 * looking, because a rule that lives only in a document is a rule the next screen can contradict.
 *
 * @param {Record<string, any>} pattern @param {Record<string, any>} routine
 * @param {readonly ProposedPosition[]} positions
 * @returns {string[]}
 */
function standingNotes(pattern, routine, positions) {
  const substitutions = positions.filter((position) => position.source === 'catalogue-substitute').length;
  const notes = [
    'Nothing here has been changed and nothing has been saved. Every value is yours to alter, and '
    + 'the whole shape can be set aside.',
    `${pattern.name} shaped across the ${positions.length} `
    + `${positions.length === 1 ? 'exercise' : 'exercises'} of ${routine.name}, in the order below.`,
  ];
  if (substitutions > 0) {
    notes.push(`${substitutions} ${substitutions === 1 ? 'exercise comes' : 'exercises come'} from `
      + 'your wider library rather than from this routine, so the curve could be filled. Each one is '
      + 'named where it sits.');
  }
  return notes;
}

/**
 * Read the arguments, or refuse them with a message naming what was wrong.
 *
 * Validation is at the public edge on purpose: a routine with no entries, a pattern with no sequence
 * or a catalogue missing an exercise the routine names would otherwise fail somewhere obscure inside
 * the arithmetic, with a message about a number rather than about the argument that was wrong.
 *
 * @param {Record<string, any>} pattern @param {Record<string, any>} routine
 * @param {unknown} catalogue
 * @returns {Readonly<Record<string, Record<string, any>>>} The catalogue, keyed by id.
 */
export function readArguments(pattern, routine, catalogue) {
  if (!pattern || typeof pattern !== 'object') {
    throw new IntensityInputError('An intensity pattern is required.', { pattern });
  }
  if (!Array.isArray(pattern.sequence) || pattern.sequence.length < 1) {
    throw new IntensityInputError('An intensity pattern needs a sequence of at least one point.',
      { pattern_id: pattern.id });
  }
  if (!routine || typeof routine !== 'object') {
    throw new IntensityInputError('A routine is required.', { routine });
  }
  if (!Array.isArray(routine.entries) || routine.entries.length < 1) {
    throw new IntensityInputError('A routine needs at least one exercise for a curve to shape.',
      { routine_id: routine.id });
  }

  const keyed = keyCatalogue(catalogue);
  // Every exercise the routine names must exist. Never the reverse: an exercise nothing references
  // is the substitution pool this adapter draws on, and checking that direction would delete it.
  for (const entry of routine.entries) exerciseOf(keyed, entry);
  return keyed;
}

/**
 * Accept the catalogue either as the list the seed ships or as an object already keyed by id, and
 * return a keyed view of it. Nothing is filtered and nothing is dropped, whichever form arrives.
 *
 * @param {unknown} catalogue
 * @returns {Readonly<Record<string, Record<string, any>>>}
 */
function keyCatalogue(catalogue) {
  if (Array.isArray(catalogue)) {
    /** @type {Record<string, Record<string, any>>} */
    const keyed = {};
    for (const exercise of catalogue) {
      if (!exercise || typeof exercise !== 'object' || typeof exercise.id !== 'string') {
        throw new IntensityInputError('Every entry in the catalogue must be an exercise with an id.',
          { exercise });
      }
      keyed[exercise.id] = exercise;
    }
    return Object.freeze(keyed);
  }
  if (catalogue && typeof catalogue === 'object') {
    return /** @type {Readonly<Record<string, Record<string, any>>>} */ (catalogue);
  }
  throw new IntensityInputError('A catalogue of exercises is required, as a list or keyed by id.',
    { catalogue });
}
