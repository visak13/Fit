/**
 * THE BASELINE — what the client actually did, read back as the reference a proposal was built from.
 *
 * The requirement, in the user's own words: the curve is calibrated against the client's recent
 * performance, so the shape fits that person rather than being generic. This module turns a list of
 * performed records into that reference, and it does exactly two things with it: it names the most
 * recent thing he did at each exercise, and it names the hardest thing he did at each exercise
 * across the window supplied. The first is what the numbers are BUILT FROM. The second is the
 * CEILING they may not pass — see `effort.js`.
 *
 * ## The history is an ARGUMENT. This module never reaches for it
 *
 * Nothing here opens a store, and nothing here decides what "recent" means. The caller chooses the
 * window and hands over the records inside it, and the window is copied onto the proposal so the
 * coach can see which sessions a number came from. A module that fetched its own history would need
 * a clock to bound it, and a clock is the one thing that makes a test written on a fixed afternoon
 * pass forever.
 *
 * ## No history is an ORDINARY case
 *
 * A new client has no records. That is not an error, not an empty result and not a silent default
 * dressed up as a measurement: the baseline reports `kind: 'none'`, every number in the proposal
 * then comes from the coach's own library, and the proposal says so in plain words. The failure this
 * avoids is the worst one available here — a screen full of confident numbers that look measured and
 * are not.
 *
 * ## What counts as work, and what does not
 *
 * A `skipped` record carries no work by the model's own rule, so it contributes nothing. A
 * `substituted` record is filed against the exercise that was ACTUALLY done, so it counts towards
 * that exercise rather than the one it replaced. Records are ordered by their own `recorded_at`
 * timestamp, compared as text: an ISO-8601 instant sorts correctly as a string, so no clock and no
 * date parsing is involved.
 *
 * ## A FACT THAT DOES NOT SAY WHICH POINT IT WAS WORKED AT IS NOT A BASELINE
 *
 * A performed record carries `intensity_level` — the point of a curve the line was actually worked at
 * — and it is OPTIONAL, because it is genuinely absent in three ordinary cases: every fact written
 * before the runner recorded one, a line run under no accepted curve at all, and a substitution the
 * coach made himself. Such a record is a perfectly good record. It is not a calibration point.
 *
 * A number means nothing without the point it was reached at: twenty repetitions is a hard set at one
 * end of a ladder and an easy one at the other, and `effort.js` scales BY THE RATIO between the two.
 * So a level-less record is EXCLUDED here rather than counted at a guessed level, it is COUNTED as
 * excluded, and the sentence the coach reads says so. `effort.js` used to guess — it read a level-less
 * fact as though it had been performed at the exercise's own filed level, which is a fabricated
 * measurement wearing a real one's clothes and is exactly how work managed at a high point could be
 * proposed back at a low one. Excluding is the SAFE direction in every case: a candidate removed from
 * a maximum can only lower a ceiling, and one removed from a minimum can only lengthen a rest.
 *
 * Refusing outright was considered and rejected. A level-less fact is correct and common, so an error
 * would make an ordinary unshaped session unusable — that would be a defect, not a hardening. An
 * unshaped session still produces a usable proposal; it simply calibrates from a stated absence
 * instead of from a fabricated measurement.
 *
 * ## WHY THE LEVEL LIVES ON THE PERFORMED RECORD AND NOT ON THE SESSION
 *
 * Two people have already conflated these entities, so it is written down here where the next reader
 * will find it. A curve is CHOSEN once for a session, but PERFORMANCE is per client and per exercise:
 * a session walks a curve, so its lines are deliberately at DIFFERENT points. A field on the session
 * record could only say which curve was chosen, never the point a particular line was actually worked
 * at — and every guarantee in this package reads the latter. Putting it on both would make two sources
 * of truth about one fact, which this build has already refused over stored cursors and over seeding
 * flags. `entities/performed-record.js` already validates `intensity_level` as one of low, medium,
 * high; nothing needed adding anywhere for this module to read it.
 *
 * ## THE BACKFILL THAT CANNOT BE DONE, stated so nobody later attempts it
 *
 * Facts already on disk have no level and never will. Nobody recorded what those sessions were worked
 * at, and inventing it now would be the same fabrication one layer up. It is not a gap to close; it is
 * a fact about the past, and the honest handling of it is the exclusion above plus the sentence that
 * tells the coach it happened.
 */

import { IntensityInputError } from './errors.js';

/** Performed-record statuses that carry work worth calibrating against. */
const STATUSES_WITH_WORK = Object.freeze(['performed', 'partial', 'substituted']);

/**
 * The points of a curve a record may say it was worked at. Mirrored from the enum
 * `entities/performed-record.js` validates, rather than imported, because this package is a leaf with
 * no dependency on the validators — `baseline.test.js` asserts the two agree, so a divergence fails
 * rather than ships.
 */
export const CALIBRATABLE_LEVELS = Object.freeze(['low', 'medium', 'high']);

/**
 * @typedef {Object} ExerciseBaseline
 * @property {string} exercise_id
 * @property {{level: string, sets: number|null, work: number|null, work_unit: string|null,
 *   rest_seconds: number|null, recorded_at: string}} latest The most recent record carrying work AND
 *   saying which point it was worked at. Every record behind an `ExerciseBaseline` says so — one that
 *   did not is excluded before it reaches here, so `level` is never null and never guessed.
 * @property {{max_work: number|null, max_sets: number|null, min_rest_seconds: number|null,
 *   record_count: number}} observed Across the whole window — the ceiling the proposal respects.
 */

/**
 * @typedef {Object} Baseline
 * @property {'measured'|'none'} kind
 * @property {string|null} client_id
 * @property {{from: string|null, to: string|null, session_count: number|null}} window As supplied.
 * @property {Readonly<Record<string, ExerciseBaseline>>} exercises Keyed by exercise id.
 * @property {{record_count: number, exercise_count: number}} excluded Records that carried work but
 *   did not say which point they were worked at, so they are no calibration. Counted rather than
 *   silently dropped: the sentence the coach reads is built from this, and a screen that wants to say
 *   more than the sentence has the numbers.
 * @property {string} note One plain sentence for the coach.
 */

/**
 * Read a history argument into a baseline.
 *
 * @param {null|undefined|{client_id?: string|null,
 *   window?: {from?: string|null, to?: string|null, session_count?: number|null},
 *   performed?: readonly Record<string, any>[]}} history
 *   Null, absent, or an empty `performed` list all mean the same ordinary thing: no baseline.
 * @returns {Baseline} Frozen.
 */
export function readBaseline(history) {
  if (history === null || history === undefined) return emptyBaseline(null, emptyWindow(), noExclusions());
  if (typeof history !== 'object' || Array.isArray(history)) {
    throw new IntensityInputError('History must be an object holding a client, a window and a list of performed records.',
      { history });
  }
  const window = readWindow(history.window);
  const clientId = history.client_id ?? null;

  const performed = history.performed ?? [];
  if (!Array.isArray(performed)) {
    throw new IntensityInputError('History.performed must be a list of performed records.', { performed });
  }

  /** @type {Record<string, {records: Record<string, any>[]}>} */
  const byExercise = {};
  /** Work that happened, at a point nobody wrote down. See the header: it is no calibration. */
  let excludedRecords = 0;
  const excludedExercises = new Set();
  for (const record of performed) {
    if (!record || typeof record !== 'object') {
      throw new IntensityInputError('Every entry in history.performed must be a performed record.', { record });
    }
    if (!STATUSES_WITH_WORK.includes(record.status)) continue;
    if (workOfRecord(record) === null) continue;
    const key = record.exercise_id;
    if (typeof key !== 'string' || key.length === 0) {
      throw new IntensityInputError('A performed record must name the exercise it is about.', { record });
    }
    if (levelOf(record) === null) {
      excludedRecords += 1;
      excludedExercises.add(key);
      continue;
    }
    if (!byExercise[key]) byExercise[key] = { records: [] };
    byExercise[key].records.push(record);
  }

  const excluded = Object.freeze({
    record_count: excludedRecords,
    exercise_count: excludedExercises.size,
  });

  const exerciseIds = Object.keys(byExercise).sort();
  if (exerciseIds.length === 0) return emptyBaseline(clientId, window, excluded);

  /** @type {Record<string, ExerciseBaseline>} */
  const exercises = {};
  let latestOverall = '';
  for (const exerciseId of exerciseIds) {
    const summary = summarise(exerciseId, byExercise[exerciseId].records);
    exercises[exerciseId] = summary;
    if (summary.latest.recorded_at > latestOverall) latestOverall = summary.latest.recorded_at;
  }

  const movements = exerciseIds.length;
  const built = `Built from what this client has done at ${movements} `
    + `${movements === 1 ? 'movement' : 'movements'}, most recently on ${dayOf(latestOverall)}.`;
  return Object.freeze({
    kind: 'measured',
    client_id: clientId,
    window,
    exercises: Object.freeze(exercises),
    excluded,
    note: excluded.record_count === 0 ? built : `${built} ${leftOutSentence(excluded.record_count)}`,
  });
}

/**
 * @param {string|null} clientId @param {Baseline['window']} window
 * @param {Baseline['excluded']} excluded
 * @returns {Baseline}
 */
function emptyBaseline(clientId, window, excluded) {
  // Said plainly, because a number that looks measured and is not is worse than no number.
  const nothingAtAll = 'There is nothing recorded for this client yet, so every number here comes '
    + 'from your own exercise library and this routine rather than from anything he has done. Read it '
    + 'as a starting point, not as a measurement.';

  /**
   * THE NEAR-NEIGHBOUR CASE, and it must not borrow the sentence above: there IS something recorded,
   * and telling him there is not would be its own small lie. Same voice, same ending — what he needs
   * is what it means for him, not an account of which field was missing.
   */
  const count = excluded.record_count;
  const nothingCalibratable = `Nothing recorded for this client says which point of a curve it was `
    + `worked at, so every number here comes from your own exercise library and this routine rather `
    + `than from anything he has done. ${count} ${count === 1 ? 'record was' : 'records were'} left `
    + `out for that reason. Read it as a starting point, not as a measurement.`;

  return Object.freeze({
    kind: 'none',
    client_id: clientId,
    window,
    exercises: Object.freeze({}),
    excluded,
    note: count === 0 ? nothingAtAll : nothingCalibratable,
  });
}

/**
 * What was left out, and what it means for him — never a list of what the data lacked.
 *
 * He can act on this or knowingly ignore it, which is the whole point: the shape in front of him rests
 * on less of this person's record than it might have, and the thing that keeps a line in next time is
 * running it under a curve so the point it was worked at is recorded with it.
 *
 * @param {number} count @returns {string}
 */
function leftOutSentence(count) {
  return `${count} earlier ${count === 1 ? 'record does' : 'records do'} not say which point `
    + `${count === 1 ? 'it was' : 'they were'} worked at, so ${count === 1 ? 'it was' : 'they were'} `
    + `left out and this is calibrated on less of his record than it might have been. A line worked `
    + `under a curve keeps that point with it.`;
}

/** @returns {Baseline['excluded']} */
function noExclusions() {
  return Object.freeze({ record_count: 0, exercise_count: 0 });
}

/**
 * The point of a curve a record says it was worked at, or null when it does not say.
 *
 * A value outside the enum the record model validates is treated as NOT SAYING, rather than trusted:
 * a level this package cannot find on a ladder would throw somewhere obscure inside the arithmetic,
 * and a record that arrived here malformed is exactly as uncalibratable as one that arrived empty.
 *
 * @param {Record<string, any>} record @returns {string|null}
 */
function levelOf(record) {
  const level = record.intensity_level;
  return CALIBRATABLE_LEVELS.includes(level) ? level : null;
}

/** @returns {Baseline['window']} */
function emptyWindow() {
  return Object.freeze({ from: null, to: null, session_count: null });
}

/** @param {unknown} window @returns {Baseline['window']} */
function readWindow(window) {
  if (window === null || window === undefined) return emptyWindow();
  if (typeof window !== 'object' || Array.isArray(window)) {
    throw new IntensityInputError('History.window must be an object describing the period the records cover.',
      { window });
  }
  const w = /** @type {Record<string, any>} */ (window);
  return Object.freeze({
    from: w.from ?? null,
    to: w.to ?? null,
    session_count: w.session_count ?? null,
  });
}

/**
 * Summarise one exercise's records: the most recent, and the extremes across the window.
 *
 * The extremes are what stop the curve's arithmetic asking for something nobody has done — max work
 * and max sets are a ceiling, min rest is a floor, and `effort.js` applies all three.
 *
 * @param {string} exerciseId @param {Record<string, any>[]} records @returns {ExerciseBaseline}
 */
function summarise(exerciseId, records) {
  let latest = records[0];
  let maxWork = null;
  let maxSets = null;
  let minRest = null;

  for (const record of records) {
    if (String(record.recorded_at) > String(latest.recorded_at)) latest = record;
    const work = workOfRecord(record);
    if (work !== null && (maxWork === null || work.value > maxWork)) maxWork = work.value;
    const sets = numberOrNull(record.sets_completed);
    if (sets !== null && (maxSets === null || sets > maxSets)) maxSets = sets;
    const rest = numberOrNull(record.rest_seconds);
    if (rest !== null && (minRest === null || rest < minRest)) minRest = rest;
  }

  const latestWork = workOfRecord(latest);
  return Object.freeze({
    exercise_id: exerciseId,
    latest: Object.freeze({
      level: levelOf(latest),
      sets: numberOrNull(latest.sets_completed),
      work: latestWork === null ? null : latestWork.value,
      work_unit: latestWork === null ? null : latestWork.unit,
      rest_seconds: numberOrNull(latest.rest_seconds),
      recorded_at: String(latest.recorded_at),
    }),
    observed: Object.freeze({
      max_work: maxWork,
      max_sets: maxSets,
      min_rest_seconds: minRest,
      record_count: records.length,
    }),
  });
}

/**
 * The work on one performed record, whichever unit it was counted in.
 * @param {Record<string, any>} record
 * @returns {{unit: 'repetitions'|'duration_seconds', value: number}|null}
 */
export function workOfRecord(record) {
  const repetitions = numberOrNull(record.repetitions);
  if (repetitions !== null && repetitions > 0) return { unit: 'repetitions', value: repetitions };
  const duration = numberOrNull(record.duration_seconds);
  if (duration !== null && duration > 0) return { unit: 'duration_seconds', value: duration };
  return null;
}

/** @param {unknown} value @returns {number|null} */
function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The calendar day out of an ISO-8601 instant, by text position rather than by parsing, so no clock
 * and no timezone is involved in a sentence the coach reads.
 * @param {string} timestamp @returns {string}
 */
function dayOf(timestamp) {
  const separator = timestamp.indexOf('T');
  return separator === -1 ? timestamp : timestamp.slice(0, separator);
}
