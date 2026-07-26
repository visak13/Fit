/**
 * PLACEMENT — the REORDERING half of the adapter.
 *
 * The curve says what each position should feel like. This module decides which movement goes there.
 * It is half the feature and it is the half that makes the other half worth having: an adapter that
 * only multiplied numbers would leave a routine's hardest exercise sitting in the closing position
 * of a curve that asked for an easy finish.
 *
 * ## Three attempts per position, in this order, and the third one SAYS SO
 *
 * 1. **A routine exercise at that level.** The coach's own list first, in his own declared order.
 * 2. **A catalogue substitute at that level**, swapped in for one of the routine's leftover
 *    exercises. The shipped catalogue deliberately exceeds the shipped week and the surplus IS the
 *    substitution pool — see `core/seed/SEED.md` section 1. Drawing on it here is one of the two
 *    features that pool exists for.
 * 3. **A leftover routine exercise at the nearest level available**, recorded as a SHORTFALL that
 *    names the level that ran short. The session keeps its full length and the coach is told, in his
 *    own terms, which position holds an easier or harder movement than the curve asked for. Never a
 *    silent substitution of a different intensity, and never a session shorter than the routine.
 *
 * ## Nothing is pruned, ever
 *
 * Referential checking in this application runs in ONE DIRECTION ONLY: every exercise a routine
 * names must exist, never the reverse. An exercise no routine references is a NORMAL state, and this
 * module is the reason — it is exactly where those exercises get used. Nothing here filters,
 * shortens or returns a reduced catalogue, and the catalogue it is handed is read and never rebuilt.
 *
 * ## Variation is an ARGUMENT
 *
 * Where several catalogue exercises are equally good substitutes, which one is chosen would be the
 * obvious place to reach for a random number or a clock. Both would make the module impure and both
 * would make a suite that passed on a fixed afternoon meaningless. The caller passes
 * `variation.rotate`, an integer, and it selects among the joint best candidates. Same inputs, same
 * output, always.
 */

import { IntensityInputError } from './errors.js';

/** Low to high. The distance between two entries is how far a shortfall fell. */
export const INTENSITY_LADDER = Object.freeze(['low', 'medium', 'high']);

/** Equipment a substitute may always assume, whatever the routine used. */
const ALWAYS_AVAILABLE_EQUIPMENT = Object.freeze(['none']);

/**
 * How well a catalogue exercise stands in for a routine exercise. Higher is better; a candidate
 * scoring `REJECTED` is not offered at all, because a substitute that trains nothing the routine
 * was training is not a substitute, it is a different session.
 */
const MATCH = Object.freeze({
  SAME_MOVEMENT: 3,
  SHARES_MUSCLE_WITH_ENTRY: 2,
  SHARES_MUSCLE_WITH_ROUTINE: 1,
  REJECTED: 0,
});

/**
 * @typedef {Object} Placement
 * @property {number} position Zero-based, in the order the proposal presents them.
 * @property {string} asked_for_level The level the curve wanted here.
 * @property {string} exercise_id The movement that goes here.
 * @property {'routine'|'catalogue-substitute'} source
 * @property {string|null} substituted_for_exercise_id The routine exercise this replaced, if any.
 * @property {string|null} substituted_for_exercise_name Its name, so a screen naming the swap does not
 *   have to look the exercise up again — and so the word sweep can mask it.
 * @property {Record<string, any>|null} entry_override The routine entry's own overrides, if the
 *   movement came from the routine. A substitute inherits none — they were written for another
 *   exercise.
 * @property {null|{asked_for: string, filled_with: string, note: string}} shortfall
 * @property {string|null} substitution_note
 */

/**
 * Place one exercise at every position of the curve.
 *
 * @param {readonly string[]} levels One level per position, from `spreadCurve`.
 * @param {{entries: readonly Record<string, any>[]}} routine
 * @param {Readonly<Record<string, Record<string, any>>>} catalogue Every exercise, keyed by id.
 * @param {{rotate?: number}} [variation]
 * @returns {{placements: readonly Placement[], shortfalls: readonly {level: string, positions: readonly number[], note: string}[]}}
 */
export function placeExercises(levels, routine, catalogue, variation = {}) {
  const rotate = readRotate(variation);
  const entries = routine.entries.map((entry, index) => ({ entry, index, taken: false }));
  const shape = routineShape(entries, catalogue);
  const placed = new Set();

  /** @type {Placement[]} */
  const placements = [];

  // Pass one: the coach's own list, in his own order.
  for (let position = 0; position < levels.length; position += 1) {
    const level = levels[position];
    const found = entries.find((held) => !held.taken && exerciseOf(catalogue, held.entry).intensity === level);
    if (!found) {
      placements.push(/** @type {any} */ (null));
      continue;
    }
    found.taken = true;
    placed.add(found.entry.exercise_id);
    placements.push(fromRoutine(position, level, found.entry));
  }

  // Pass two and three: what the routine could not supply. Each unfilled position spends one
  // LEFTOVER routine entry — the one the curve had no room for — and either swaps it for a
  // catalogue exercise at the level asked for, or keeps it and says the level ran short.
  for (let position = 0; position < placements.length; position += 1) {
    if (placements[position] !== null) continue;
    const level = levels[position];
    const leftover = entries.find((held) => !held.taken);
    if (!leftover) {
      // Unreachable while positions and entries are equal in number, which `proposeSession`
      // guarantees. Stated rather than assumed: a caller reaching here has a defect worth a name.
      throw new IntensityInputError(
        'Ran out of routine exercises before the curve ran out of positions.',
        { position, positions: placements.length, entries: routine.entries.length },
      );
    }
    leftover.taken = true;
    const displaced = exerciseOf(catalogue, leftover.entry);

    const substitute = bestSubstitute(level, displaced, shape, catalogue, placed, rotate);
    if (substitute) {
      placed.add(substitute.id);
      placements[position] = asSubstitute(position, level, substitute, displaced);
      continue;
    }
    placed.add(displaced.id);
    placements[position] = asShortfall(position, level, leftover.entry, displaced);
  }

  return Object.freeze({
    placements: Object.freeze(placements),
    shortfalls: summariseShortfalls(placements),
  });
}

/** @param {{rotate?: number}} variation @returns {number} */
function readRotate(variation) {
  const rotate = variation.rotate ?? 0;
  if (!Number.isInteger(rotate) || rotate < 0) {
    throw new IntensityInputError('variation.rotate must be a whole number of zero or more. Variation is an argument here, never a random draw.',
      { rotate });
  }
  return rotate;
}

/**
 * The routine's own footprint: which movements it trains, which muscles, and what equipment it
 * already assumes. A substitute is measured against this, so a barbell exercise is never proposed
 * into a session the coach built out of bodyweight work.
 *
 * @param {{entry: Record<string, any>}[]} entries
 * @param {Readonly<Record<string, Record<string, any>>>} catalogue
 */
function routineShape(entries, catalogue) {
  const muscles = new Set();
  const equipment = new Set(ALWAYS_AVAILABLE_EQUIPMENT);
  for (const { entry } of entries) {
    const exercise = exerciseOf(catalogue, entry);
    for (const muscle of exercise.primary_muscles) muscles.add(muscle);
    for (const item of exercise.equipment) equipment.add(item);
  }
  return { muscles, equipment };
}

/**
 * The best catalogue exercise to put at `level` in place of `displaced`, or null if the catalogue
 * has nothing to offer there.
 *
 * Candidates are ranked, then the joint best are rotated through by the caller's `rotate`. Ranking
 * before rotating is deliberate: rotation buys variety among equals, it never buys a worse match.
 *
 * @param {string} level @param {Record<string, any>} displaced
 * @param {{muscles: Set<string>, equipment: Set<string>}} shape
 * @param {Readonly<Record<string, Record<string, any>>>} catalogue
 * @param {Set<string>} placed @param {number} rotate
 * @returns {Record<string, any>|null}
 */
function bestSubstitute(level, displaced, shape, catalogue, placed, rotate) {
  const candidates = [];
  // Sorted ids, so the walk order is the same on every device and in every run rather than
  // whatever order the caller happened to build its object in.
  for (const id of Object.keys(catalogue).sort()) {
    const exercise = catalogue[id];
    if (exercise.intensity !== level) continue;
    if (placed.has(id)) continue;
    if (!exercise.equipment.every((item) => shape.equipment.has(item))) continue;
    const score = matchScore(exercise, displaced, shape);
    if (score === MATCH.REJECTED) continue;
    candidates.push({ exercise, score, sameMeasurement: exercise.measurement === displaced.measurement });
  }
  if (candidates.length === 0) return null;

  candidates.sort(byQualityThenId);
  const best = candidates[0];
  const jointBest = candidates.filter(
    (candidate) => candidate.score === best.score && candidate.sameMeasurement === best.sameMeasurement,
  );
  return jointBest[rotate % jointBest.length].exercise;
}

/** Better match first; among equals, the same counting unit first; then by id, so ties are stable. */
function byQualityThenId(a, b) {
  if (a.score !== b.score) return b.score - a.score;
  if (a.sameMeasurement !== b.sameMeasurement) return a.sameMeasurement ? -1 : 1;
  return a.exercise.id < b.exercise.id ? -1 : 1;
}

/**
 * @param {Record<string, any>} candidate @param {Record<string, any>} displaced
 * @param {{muscles: Set<string>}} shape @returns {number}
 */
function matchScore(candidate, displaced, shape) {
  if (candidate.movement_pattern === displaced.movement_pattern) return MATCH.SAME_MOVEMENT;
  if (candidate.primary_muscles.some((muscle) => displaced.primary_muscles.includes(muscle))) {
    return MATCH.SHARES_MUSCLE_WITH_ENTRY;
  }
  if (candidate.primary_muscles.some((muscle) => shape.muscles.has(muscle))) {
    return MATCH.SHARES_MUSCLE_WITH_ROUTINE;
  }
  return MATCH.REJECTED;
}

/** @param {number} position @param {string} level @param {Record<string, any>} entry @returns {Placement} */
function fromRoutine(position, level, entry) {
  return Object.freeze({
    position,
    asked_for_level: level,
    exercise_id: entry.exercise_id,
    source: 'routine',
    substituted_for_exercise_id: null,
    substituted_for_exercise_name: null,
    entry_override: overridesOf(entry),
    shortfall: null,
    substitution_note: null,
  });
}

/**
 * @param {number} position @param {string} level
 * @param {Record<string, any>} substitute @param {Record<string, any>} displaced @returns {Placement}
 */
function asSubstitute(position, level, substitute, displaced) {
  return Object.freeze({
    position,
    asked_for_level: level,
    exercise_id: substitute.id,
    source: 'catalogue-substitute',
    substituted_for_exercise_id: displaced.id,
    substituted_for_exercise_name: displaced.name,
    // A routine override was written for the exercise it names. Carrying it onto a different
    // movement would be putting a number the coach wrote about one thing onto another.
    entry_override: null,
    shortfall: null,
    substitution_note: `${substitute.name} comes from your library in place of ${displaced.name}, `
      + `because the curve asks for a ${level} movement here and this routine had none left.`,
  });
}

/**
 * @param {number} position @param {string} level
 * @param {Record<string, any>} entry @param {Record<string, any>} exercise @returns {Placement}
 */
function asShortfall(position, level, entry, exercise) {
  const direction = INTENSITY_LADDER.indexOf(exercise.intensity) < INTENSITY_LADDER.indexOf(level)
    ? 'an easier' : 'a harder';
  return Object.freeze({
    position,
    asked_for_level: level,
    exercise_id: exercise.id,
    source: 'routine',
    substituted_for_exercise_id: null,
    substituted_for_exercise_name: null,
    entry_override: overridesOf(entry),
    shortfall: Object.freeze({
      asked_for: level,
      filled_with: exercise.intensity,
      note: `The curve asks for a ${level} movement here. Neither this routine nor your library had `
        + `one left, so the position holds ${exercise.name}, which is ${direction} movement.`,
    }),
    substitution_note: null,
  });
}

/**
 * The overrides a routine entry carries, or null when it inherits the exercise's own defaults.
 * `exercise_id` is the reference rather than an override, so it is not copied here.
 * @param {Record<string, any>} entry @returns {Record<string, any>|null}
 */
function overridesOf(entry) {
  /** @type {Record<string, any>} */
  const overrides = {};
  for (const field of ['sets', 'repetitions', 'duration_seconds', 'rest_seconds']) {
    if (entry[field] !== undefined && entry[field] !== null) overrides[field] = entry[field];
  }
  return Object.keys(overrides).length === 0 ? null : Object.freeze(overrides);
}

/**
 * One entry per level that ran short, naming every position it affected.
 *
 * The per-position sentence tells him about the exercise in front of him; this one tells him about
 * the curve he pressed, which is the thing he would otherwise have to work out by counting.
 *
 * @param {readonly Placement[]} placements
 */
function summariseShortfalls(placements) {
  /** @type {Record<string, number[]>} */
  const byLevel = {};
  for (const placement of placements) {
    if (!placement.shortfall) continue;
    const level = placement.shortfall.asked_for;
    if (!byLevel[level]) byLevel[level] = [];
    byLevel[level].push(placement.position);
  }
  return Object.freeze(Object.keys(byLevel).sort().map((level) => {
    const positions = byLevel[level];
    const asked = placements.filter((placement) => placement.asked_for_level === level).length;
    return Object.freeze({
      level,
      positions: Object.freeze([...positions]),
      note: `The ${level} level ran short: this routine and your library between them filled `
        + `${asked - positions.length} of the ${asked} ${asked === 1 ? 'position' : 'positions'} `
        + `the curve asks for at that level. The session is still as long as the routine.`,
    });
  }));
}

/**
 * The exercise a routine entry names.
 * @param {Readonly<Record<string, Record<string, any>>>} catalogue @param {Record<string, any>} entry
 * @returns {Record<string, any>}
 */
export function exerciseOf(catalogue, entry) {
  const exercise = catalogue[entry.exercise_id];
  if (!exercise) {
    throw new IntensityInputError(
      `This routine names the exercise "${entry.exercise_id}", which is not in the catalogue supplied.`,
      { exercise_id: entry.exercise_id },
    );
  }
  return exercise;
}
