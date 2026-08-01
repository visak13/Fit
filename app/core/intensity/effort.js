/**
 * EFFORT — the SCALING half of the adapter: repetitions, timers and rest.
 *
 * Reordering alone would leave every exercise asking for exactly what it always asks for, which is
 * not a shaped session — it is the same session in a different order. This module is where the curve
 * becomes effort.
 *
 * ## Three sources, one reference, and the coach is told which one was used
 *
 * Every number here is built from ONE reference, chosen in this order:
 *
 * 1. **What the client actually did** at this exercise, most recently, if anything was supplied AND it
 *    says which point of a curve it was worked at. This is the calibration the requirement asks for:
 *    the shape fits that person. Work with no point recorded against it is not a reference at all —
 *    `baseline.js` excludes it and says so to the coach, and `NEVER_GUESSES_A_LEVEL` below says why.
 * 2. **The number written into this routine** for this exercise, if the coach overrode the
 *    exercise's own default there.
 * 3. **The exercise's own scaling point** in the library, at the level the curve asked for.
 *
 * The reference is reported back on every position — its source, its level, its numbers and the day
 * it was recorded — because the whole point of calibrating is that he can see WHY a number is what
 * it is. A number he cannot account for is a number he will not trust in front of a client.
 *
 * ## THE ONE INVARIANT: never more than a number a human actually wrote
 *
 * **No proposed number is ever greater than the largest work its three sources genuinely contain,
 * and no proposed rest is ever shorter than the shortest they contain.** The three are the library's
 * scaling point for this level, the number the coach wrote into this routine, and the most the client
 * has actually managed here — every one of them authored by a person, none of them by this module.
 *
 * The arithmetic of a rising curve can overshoot all three: a client who managed thirty repetitions
 * at an exercise's low point, spread up a ladder whose high point is two and a half times its low,
 * arrives at seventy-five, and nobody asked for seventy-five. The ceiling catches exactly that, and
 * the position says which source held it and what the shape alone would have asked for.
 *
 * With nothing recorded and nothing overridden, the ceiling is the library's own point and the
 * proposal IS that point, unchanged.
 *
 * ## WHY THERE IS NO RATCHET, which is the guarantee the coach actually cares about
 *
 * At the level he was measured at, the ladder's ratio is exactly one and the ceiling can only reduce,
 * so the proposal is exactly what he last did there and never more. Press the same curve every week
 * for a year and the number does not move. Shape him up to a harder point, record that, and shape him
 * back down, and he cannot arrive HIGHER than he started, because the way up is bounded by a number a
 * human wrote and the way down is the ladder's own ratio. `effort.test.js` proves both.
 *
 * Note what is deliberately NOT claimed: the round trip is not exactly reversible. Where the ceiling
 * held the upward step, the return lands lower than the starting number rather than back on it. That
 * is the safe direction and it is stated rather than papered over — a claim of exact reversibility
 * would be false, and a false claim in a comment is read as ground truth by everyone after you.
 *
 * This is how "it never raises load on its own" is honoured in the only currency this module deals
 * in. It deals in no other: `PROPOSES_NO_LOAD` below is asserted, and no field it emits names a
 * load, a weight or a resistance. A load is a per-client observation the coach makes in a session
 * and writes on a performed record; the library never prescribes one and neither does this.
 *
 * ## Why work multiplies and rest adds
 *
 * Work scales by the RATIO between the library's points, because the ladder's spacing is what makes
 * a client's own number mean something at a level he has not been measured at. Rest and sets scale by
 * the DIFFERENCE. A ratio on rest is undefined at the zero-rest point the model explicitly permits,
 * and a ratio on two sets jumps in steps too coarse to mean anything. Both directions are still
 * bounded by `R6` in the exercise validator: across low, medium and high, work never falls, sets
 * never fall and rest never rises.
 */

import { IntensityInputError } from './errors.js';

/**
 * This module proposes no load, weight or resistance in any field, at any level, from any source.
 * Declared as a value and asserted, mirroring `SEED_PRUNES_UNREFERENCED_CONTENT` in the seed
 * package, because an absence is indistinguishable from an oversight to whoever edits this next.
 */
export const PROPOSES_NO_LOAD = true;

/**
 * THIS MODULE NEVER GUESSES THE POINT A RECORD WAS WORKED AT, and this is the second absence in this
 * file declared as a value rather than left to be noticed.
 *
 * It used to guess. `chooseReference` read a record with no `intensity_level` as though it had been
 * performed at the exercise's own filed level — `measured.level ?? exercise.intensity` — which is a
 * fabricated measurement wearing a real one's clothes, and it is precisely how work managed at a
 * curve's HIGH point could come back proposed at its LOW one: at the guessed level the ladder's ratio
 * is one, the ceiling is that same number, and the low point returns asking for the hard one.
 *
 * A record that does not say is excluded by `baseline.js` before it ever reaches here, so in the whole
 * application this guard is unreachable. It stands anyway because `scaleToLevel` is EXPORTED: anyone
 * may hand it a baseline they built themselves, and the answer to a reference with no level must be
 * the same everywhere — it is not a reference. The position then falls through to the routine's own
 * number, or to the library's point, and says which in the sentence the coach reads.
 */
export const NEVER_GUESSES_A_LEVEL = true;

/** The fields a proposed prescription may carry. Anything else is a defect, and a test says so. */
export const PRESCRIPTION_FIELDS = Object.freeze([
  'measurement', 'sets', 'repetitions', 'duration_seconds', 'rest_seconds',
]);

/**
 * The ranges the record model itself enforces — `entities/exercise.js` and `entities/routine.js`.
 * Mirrored rather than imported so this package stays a leaf with no dependency on the validators;
 * `effort.test.js` asserts the two agree, so a divergence fails rather than ships.
 */
export const BOUNDS = Object.freeze({
  sets: Object.freeze({ min: 1, max: 10 }),
  repetitions: Object.freeze({ min: 1, max: 100 }),
  duration_seconds: Object.freeze({ min: 5, max: 1800 }),
  rest_seconds: Object.freeze({ min: 0, max: 600 }),
});

/**
 * @typedef {Object} Reference
 * @property {'measured-performance'|'routine-override'|'library-scaling-point'} source
 * @property {string} level The level the reference was observed or written at.
 * @property {number} sets
 * @property {number} work
 * @property {string} work_unit
 * @property {number} rest_seconds
 * @property {string|null} recorded_at
 * @property {string} note One plain sentence saying where the numbers came from.
 */

/**
 * @typedef {Object} Effort
 * @property {string} measurement
 * @property {number} sets
 * @property {number|null} repetitions
 * @property {number|null} duration_seconds
 * @property {number} rest_seconds
 * @property {Reference} reference
 * @property {boolean} clamped
 * @property {string|null} clamp_note
 */

/**
 * Scale one exercise to one level of the curve.
 *
 * @param {Record<string, any>} exercise The exercise as the library holds it.
 * @param {string} level The level the curve asked for at this position.
 * @param {Record<string, any>|null} entryOverride The routine entry's overrides, if any.
 * @param {import('./baseline.js').ExerciseBaseline|null} exerciseBaseline What he has done here.
 * @returns {Effort} Frozen.
 */
export function scaleToLevel(exercise, level, entryOverride, exerciseBaseline) {
  const ladder = exercise.scaling;
  const target = pointAt(ladder, level, exercise.id);
  const reference = chooseReference(exercise, level, entryOverride, exerciseBaseline);
  const from = pointAt(ladder, reference.level, exercise.id);

  const unit = workUnitOf(exercise);
  const ratio = workValueOf(target, unit) / workValueOf(from, unit);

  const shaped = {
    work: Math.round(reference.work * ratio),
    sets: reference.sets + (target.sets - from.sets),
    rest_seconds: reference.rest_seconds + (target.rest_seconds - from.rest_seconds),
  };

  const ceilings = ceilingsFor(target, unit, entryOverride, exerciseBaseline);
  const held = applyCeilings(shaped, ceilings);
  const bounded = {
    work: clamp(held.work, BOUNDS[unit]),
    sets: clamp(held.sets, BOUNDS.sets),
    rest_seconds: clamp(held.rest_seconds, BOUNDS.rest_seconds),
  };

  const notes = describeHolds(shaped, bounded, ceilings, unit, exercise);

  return Object.freeze({
    measurement: exercise.measurement,
    sets: bounded.sets,
    repetitions: unit === 'repetitions' ? bounded.work : null,
    duration_seconds: unit === 'duration_seconds' ? bounded.work : null,
    rest_seconds: bounded.rest_seconds,
    reference,
    clamped: held.clamped,
    clamp_note: notes.length === 0 ? null : notes.join(' '),
  });
}

/**
 * One sentence per quantity that was actually held back, naming the source that held it.
 *
 * Per quantity rather than one sentence for the whole position, and this was found by breaking the
 * rest floor and watching nothing go red: a single note written about WORK is wrong the moment it is
 * rest that moved, and it would have read as an unexplained number beside an unchanged one.
 *
 * @param {{work: number, sets: number, rest_seconds: number}} shaped
 * @param {{work: number, sets: number, rest_seconds: number}} bounded
 * @param {Record<string, any>} ceilings @param {string} unit @param {Record<string, any>} exercise
 * @returns {string[]}
 */
function describeHolds(shaped, bounded, ceilings, unit, exercise) {
  const notes = [];
  if (bounded.work !== shaped.work) {
    notes.push(`Held at ${bounded.work} rather than the ${shaped.work} this curve's shape alone would `
      + `have asked for, because ${describeSource(ceilings.work_source, describeWork(ceilings.work, unit), exercise)}.`);
  }
  if (bounded.sets !== shaped.sets) {
    const sets = `${ceilings.sets} ${ceilings.sets === 1 ? 'set' : 'sets'}`;
    notes.push(`Held at ${bounded.sets} ${bounded.sets === 1 ? 'set' : 'sets'} rather than ${shaped.sets}, `
      + `because ${describeSource(ceilings.sets_source, sets, exercise)}.`);
  }
  if (bounded.rest_seconds !== shaped.rest_seconds) {
    notes.push(`Rest held at ${bounded.rest_seconds} seconds rather than ${shaped.rest_seconds}, because `
      + `${describeRestSource(ceilings.rest_source, ceilings.rest_seconds, exercise)}.`);
  }
  return notes;
}

/**
 * The reference this position's numbers are built from, and the sentence that names it.
 * @param {Record<string, any>} exercise @param {string} level
 * @param {Record<string, any>|null} entryOverride
 * @param {import('./baseline.js').ExerciseBaseline|null} exerciseBaseline
 * @returns {Reference}
 */
function chooseReference(exercise, level, entryOverride, exerciseBaseline) {
  const unit = workUnitOf(exercise);
  const measured = exerciseBaseline ? exerciseBaseline.latest : null;

  // A reference must carry the point it was reached at, because every number below is scaled BY THE
  // RATIO between that point and the one being asked for. No level, no reference — see
  // `NEVER_GUESSES_A_LEVEL` above for what used to happen instead and why it was a ratchet.
  if (measured && measured.work !== null && measured.work_unit === unit && hasLevel(measured)) {
    const at = measured.level;
    const point = pointAt(exercise.scaling, at, exercise.id);
    const sets = measured.sets ?? point.sets;
    const rest = measured.rest_seconds ?? point.rest_seconds;
    return Object.freeze({
      source: 'measured-performance',
      level: at,
      sets,
      work: measured.work,
      work_unit: unit,
      rest_seconds: rest,
      recorded_at: measured.recorded_at,
      note: `Built from what this client did on ${dayOf(measured.recorded_at)}: ${sets} `
        + `${sets === 1 ? 'set' : 'sets'} of ${describeWork(measured.work, unit)}, `
        + `resting ${rest} seconds, at the ${at} point.`,
    });
  }

  if (entryOverride) {
    const at = exercise.intensity;
    const point = pointAt(exercise.scaling, at, exercise.id);
    const overriddenWork = unit === 'repetitions' ? entryOverride.repetitions : entryOverride.duration_seconds;
    return Object.freeze({
      source: 'routine-override',
      level: at,
      sets: entryOverride.sets ?? point.sets,
      work: overriddenWork ?? workValueOf(point, unit),
      work_unit: unit,
      rest_seconds: entryOverride.rest_seconds ?? point.rest_seconds,
      recorded_at: null,
      note: `Built from what this routine asks for at ${exercise.name}: `
        + `${entryOverride.sets ?? point.sets} ${(entryOverride.sets ?? point.sets) === 1 ? 'set' : 'sets'} `
        + `of ${describeWork(overriddenWork ?? workValueOf(point, unit), unit)}.`,
    });
  }

  const point = pointAt(exercise.scaling, level, exercise.id);
  return Object.freeze({
    source: 'library-scaling-point',
    level,
    sets: point.sets,
    work: workValueOf(point, unit),
    work_unit: unit,
    rest_seconds: point.rest_seconds,
    recorded_at: null,
    note: `Built from your library's own ${level} point for ${exercise.name}, because nothing `
      + 'recorded and nothing in this routine says otherwise.',
  });
}

/**
 * The ceilings and the floor this position may not pass — the largest work, and the shortest rest,
 * that the three sources genuinely contain. A source that is absent contributes nothing, so with no
 * history and no override the library's own point stands alone.
 *
 * `work_source` names which of the three is binding, so the sentence the coach reads can attribute
 * the number to the person who wrote it rather than to the arithmetic.
 *
 * @param {Record<string, any>} target @param {string} unit
 * @param {Record<string, any>|null} entryOverride
 * @param {import('./baseline.js').ExerciseBaseline|null} exerciseBaseline
 */
function ceilingsFor(target, unit, entryOverride, exerciseBaseline) {
  const observed = exerciseBaseline ? exerciseBaseline.observed : null;
  const override = entryOverride ?? {};
  const numberOr = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

  const work = extreme('most', [
    { source: 'library', value: workValueOf(target, unit) },
    { source: 'routine', value: numberOr(override[unit]) },
    { source: 'measured', value: observed ? observed.max_work : null },
  ]);
  const sets = extreme('most', [
    { source: 'library', value: target.sets },
    { source: 'routine', value: numberOr(override.sets) },
    { source: 'measured', value: observed ? observed.max_sets : null },
  ]);
  const rest = extreme('least', [
    { source: 'library', value: target.rest_seconds },
    { source: 'routine', value: numberOr(override.rest_seconds) },
    { source: 'measured', value: observed ? observed.min_rest_seconds : null },
  ]);

  return Object.freeze({
    work: work.value,
    work_source: work.source,
    sets: sets.value,
    sets_source: sets.source,
    rest_seconds: rest.value,
    rest_source: rest.source,
  });
}

/**
 * The most, or the least, of whichever candidates are actually present — with the source that
 * supplied it, so the sentence the coach reads can attribute the number to the person who wrote it.
 *
 * @param {'most'|'least'} which
 * @param {{source: string, value: number|null}[]} candidates The first is always present.
 * @returns {{source: string, value: number}}
 */
function extreme(which, candidates) {
  const present = candidates.filter((candidate) => candidate.value !== null);
  return present.reduce((chosen, candidate) => {
    const wins = which === 'most' ? candidate.value > chosen.value : candidate.value < chosen.value;
    return wins ? candidate : chosen;
  });
}

/**
 * Hold the shaped numbers inside the ceilings. This is the invariant in the header, and it is the
 * only place a proposed number is ever reduced.
 */
function applyCeilings(shaped, ceilings) {
  const work = Math.min(shaped.work, ceilings.work);
  const sets = Math.min(shaped.sets, ceilings.sets);
  const rest = Math.max(shaped.rest_seconds, ceilings.rest_seconds);
  return {
    work,
    sets,
    rest_seconds: rest,
    clamped: work !== shaped.work || sets !== shaped.sets || rest !== shaped.rest_seconds,
  };
}

/**
 * Why an upper bound held, attributed to the person who wrote the number that held it.
 * Deliberately never names a load: a ceiling here is about work done and work written down.
 */
function describeSource(source, amount, exercise) {
  if (source === 'measured') return `${amount} is the most this client has actually managed here`;
  if (source === 'routine') return `${amount} is what this routine asks for at ${exercise.name}`;
  return `${amount} is what your library asks for at this point`;
}

/** The same, for the rest floor, where the binding number is the SHORTEST rather than the largest. */
function describeRestSource(source, seconds, exercise) {
  if (source === 'measured') return `${seconds} seconds is the least this client has actually rested here`;
  if (source === 'routine') return `${seconds} seconds is the rest this routine gives at ${exercise.name}`;
  return `${seconds} seconds is the rest your library gives at this point`;
}

/**
 * Whether a measured reference says which point of a curve it was reached at.
 * @param {Record<string, any>} measured @returns {boolean}
 */
function hasLevel(measured) {
  return typeof measured.level === 'string' && measured.level.length > 0;
}

/** @param {Record<string, any>} ladder @param {string} level @param {string} exerciseId */
function pointAt(ladder, level, exerciseId) {
  const point = ladder ? ladder[level] : undefined;
  if (!point) {
    throw new IntensityInputError(
      `The exercise "${exerciseId}" has no ${level} scaling point, so a curve cannot ask it for one.`,
      { exercise_id: exerciseId, level },
    );
  }
  return point;
}

/** Which unit an exercise is counted in, as the field name the model uses. */
export function workUnitOf(exercise) {
  return exercise.measurement === 'time' ? 'duration_seconds' : 'repetitions';
}

/** @param {Record<string, any>} point @param {string} unit @returns {number} */
function workValueOf(point, unit) {
  const value = point[unit];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new IntensityInputError(
      `A scaling point must carry a positive ${unit} for the unit this exercise is counted in.`,
      { point, unit },
    );
  }
  return value;
}

/** @param {number} value @param {{min: number, max: number}} bound @returns {number} */
function clamp(value, bound) {
  return Math.min(Math.max(value, bound.min), bound.max);
}

/** `14 repetitions` or `a 45 second hold`, so the sentence reads as English either way. */
function describeWork(value, unit) {
  return unit === 'repetitions' ? `${value} repetitions` : `${value} seconds`;
}

/** The calendar day out of an ISO-8601 instant, by text position rather than by parsing. */
function dayOf(timestamp) {
  const separator = timestamp.indexOf('T');
  return separator === -1 ? timestamp : timestamp.slice(0, separator);
}
