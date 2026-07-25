/**
 * THE EXERCISE record — content, owned by the seed content contract §4.
 *
 * This validator is the runtime half of that contract. The seed files are validated before
 * they ship by a separate standard-library validator; this one validates the same records
 * again on import, and then validates every exercise the coach creates or edits in the app
 * for the rest of the installation's life. The rules must agree, so where a rule below has a
 * counterpart there it is named (`R5`, `R6`, `R12`).
 *
 * ## No load, weight or resistance field. Anywhere in the library.
 *
 * The contract omits it and this validator refuses it. The reason is worth carrying rather
 * than treating as a quirk: prescribing a weight would put the application in the position
 * of making a training-load judgement. That judgement belongs to the certified coach, who is
 * also adapting to a client's history — and load is inherently per-client, so a shipped
 * library carrying weights would be prescribing numbers for people it has never seen.
 *
 * A harder intensity point therefore means MORE WORK and LESS REST, never more load, and
 * `R6` below enforces exactly that relationship.
 *
 * Load is not banned everywhere: any load the coach records is a per-client, in-session
 * OBSERVATION, and it lives on `entities/performed-record.js`.
 */

import { CODES, Collector } from '../issues.js';
import {
  checkBoolean, checkContentKey, checkEnum, checkInteger, checkIsRecord, checkNoUnknownKeys,
  checkString, checkStringArray, isPlainObject,
} from '../primitives.js';
import {
  EQUIPMENT, FORBIDDEN_LOAD_TOKENS, INTENSITY_LEVELS, matchToken, MEASUREMENTS,
  MOVEMENT_PATTERNS, MUSCLE_GROUPS, PROVENANCE,
} from '../vocabularies.js';

/** @type {readonly string[]} */
export const EXERCISE_FIELDS = Object.freeze([
  'id', 'name', 'long_name', 'movement_pattern', 'primary_muscles', 'secondary_muscles',
  'equipment', 'measurement', 'default_prescription', 'default_rest_seconds', 'intensity',
  'scaling', 'hiit_suitable', 'coaching_cue', 'provenance',
]);

/** Fields of a prescription at the default point (no rest). @type {readonly string[]} */
export const PRESCRIPTION_FIELDS = Object.freeze(['sets', 'repetitions', 'duration_seconds']);

/** Fields of a scaling point (a prescription plus its rest). @type {readonly string[]} */
export const SCALING_POINT_FIELDS = Object.freeze([...PRESCRIPTION_FIELDS, 'rest_seconds']);

/**
 * Exercise names are SPOKEN ALOUD by the browser speech synthesiser during a session, so the
 * format forbids what reads badly or not at all: letters and single spaces only, starting and
 * ending with a letter. Write it the way a coach says it out loud.
 */
const SPEAKABLE_NAME_PATTERN = /^[A-Za-z]+( [A-Za-z]+)*$/;

/**
 * Two things the pattern alone cannot catch, both of which a synthesiser mangles.
 *
 * An ABBREVIATION — `DB Press`, `RDL` — is read as a word or spelled out unpredictably, and
 * either way the coach hears something that is not the movement. A BARE SINGLE LETTER is the
 * same problem in miniature; `a` and `i` are excepted because they are real English words.
 *
 * @param {Collector} c @param {string} name @returns {boolean}
 */
function checkSpeakableWords(c, name) {
  let good = true;
  for (const word of name.split(' ')) {
    if (word.length >= 2 && word === word.toUpperCase()) {
      c.add('name', CODES.FORMAT,
        `"${word}" is an abbreviation. The app reads this name aloud, so write the movement out in full.`);
      good = false;
    } else if (word.length === 1 && !'aAiI'.includes(word)) {
      c.add('name', CODES.FORMAT,
        `"${word}" is a bare letter and does not read aloud. Write the movement out in full.`);
      good = false;
    }
  }
  return good;
}

/**
 * Classify an unknown key on a library record, so a forbidden load field reads as the
 * recorded decision it is rather than as a typo.
 * @param {string} key
 * @returns {{code: string, message: string}|null}
 */
export function classifyLibraryKey(key) {
  const token = matchToken(key, FORBIDDEN_LOAD_TOKENS);
  if (!token) return null;
  return {
    code: CODES.FORBIDDEN_LOAD,
    message: `"${key}" looks like a load, weight or resistance value. The library never prescribes load — that is the coach's per-client judgement, recorded in session as an observation.`,
  };
}

/**
 * Validate one exercise content record.
 * @param {unknown} exercise
 * @returns {import('../issues.js').ValidationResult}
 */
export function validateExercise(exercise) {
  const c = new Collector();
  if (!checkIsRecord(c, exercise)) return c.result();
  const x = /** @type {Record<string, any>} */ (exercise);

  checkNoUnknownKeys(c, x, EXERCISE_FIELDS, classifyLibraryKey);

  checkContentKey(c, 'id', x.id, { required: true });
  if (checkString(c, 'name', x.name, {
    required: true, min: 3, max: 48,
    pattern: SPEAKABLE_NAME_PATTERN,
    patternHint: 'The app reads this aloud. Use letters and single spaces only, with no digits, punctuation or abbreviations.',
  })) checkSpeakableWords(c, x.name);
  checkString(c, 'long_name', x.long_name, { min: 3, max: 120 });
  checkEnum(c, 'movement_pattern', x.movement_pattern, MOVEMENT_PATTERNS, { required: true });
  checkStringArray(c, 'primary_muscles', x.primary_muscles, { required: true, min: 1, allowed: MUSCLE_GROUPS });
  checkStringArray(c, 'secondary_muscles', x.secondary_muscles, { required: true, min: 0, allowed: MUSCLE_GROUPS });
  checkStringArray(c, 'equipment', x.equipment, { required: true, min: 1, allowed: EQUIPMENT });
  const measurementOk = checkEnum(c, 'measurement', x.measurement, MEASUREMENTS, { required: true });
  checkInteger(c, 'default_rest_seconds', x.default_rest_seconds, { required: true, min: 0, max: 600 });
  checkEnum(c, 'intensity', x.intensity, INTENSITY_LEVELS, { required: true });
  // Whether the exercise belongs in a high-intensity interval block: loaded barbell work
  // generally does not; a jump or a carry generally does.
  checkBoolean(c, 'hiit_suitable', x.hiit_suitable, { required: true });
  checkString(c, 'coaching_cue', x.coaching_cue, { required: true, min: 8, max: 160 });
  checkEnum(c, 'provenance', x.provenance, PROVENANCE, { required: true });

  const measurement = measurementOk ? x.measurement : null;
  checkPrescription(c.at('default_prescription'), x.default_prescription, measurement, false);
  checkScaling(c, x.scaling, measurement);

  return c.result();
}

/**
 * A prescription: how much work, and (at a scaling point) how much rest.
 *
 * `R5` — the work unit must AGREE with the exercise's `measurement`. A plank counted in
 * repetitions is nonsense, and so is a sprint interval; exactly one of `repetitions` and
 * `duration_seconds` is present, and which one is decided by the measurement.
 *
 * @param {Collector} c Collector already scoped to the prescription's own path.
 * @param {unknown} p
 * @param {string|null} measurement
 * @param {boolean} withRest True for a scaling point, which additionally requires rest.
 * @returns {boolean}
 */
export function checkPrescription(c, p, measurement, withRest) {
  const allowed = withRest ? SCALING_POINT_FIELDS : PRESCRIPTION_FIELDS;
  if (p === undefined || p === null) {
    c.add('', CODES.REQUIRED, 'A prescription is required.');
    return false;
  }
  if (!isPlainObject(p)) {
    c.add('', CODES.TYPE, 'Expected a prescription object.');
    return false;
  }
  const rec = /** @type {Record<string, any>} */ (p);
  checkNoUnknownKeys(c, rec, allowed, classifyLibraryKey);
  checkInteger(c, 'sets', rec.sets, { required: true, min: 1, max: 10 });
  if (withRest) checkInteger(c, 'rest_seconds', rec.rest_seconds, { required: true, min: 0, max: 600 });

  const hasReps = rec.repetitions !== undefined && rec.repetitions !== null;
  const hasTime = rec.duration_seconds !== undefined && rec.duration_seconds !== null;

  if (hasReps === hasTime) {
    c.add('', CODES.EXCLUSIVE,
      'Exactly one of repetitions or duration_seconds must be present.');
    return false;
  }
  if (hasReps) checkInteger(c, 'repetitions', rec.repetitions, { min: 1, max: 100 });
  if (hasTime) checkInteger(c, 'duration_seconds', rec.duration_seconds, { min: 5, max: 1800 });

  if (measurement === 'repetitions' && hasTime) {
    c.add('duration_seconds', CODES.MISMATCH,
      'This exercise is counted in repetitions, so it cannot be prescribed as a duration.');
    return false;
  }
  if (measurement === 'time' && hasReps) {
    c.add('repetitions', CODES.MISMATCH,
      'This exercise is counted in time, so it cannot be prescribed as a repetition count.');
    return false;
  }
  return true;
}

/**
 * `scaling` — the three points the intensity adapter scales with, and `R6`, the ordering
 * rule that makes them trustworthy.
 *
 * Across low → medium → high:
 *
 *  - work (`repetitions` or `duration_seconds`) is NON-DECREASING, and strictly greater at
 *    high than at low, so the three points are genuinely different rather than filler;
 *  - `sets` is NON-DECREASING;
 *  - `rest_seconds` is NON-INCREASING, because less rest is more demanding.
 *
 * The failure this catches is a harder point that is easier than a softer one. It would make
 * the adapter propose a session that gets easier as the curve rises, in front of a client,
 * and the coach would rightly stop trusting the button he just pressed.
 *
 * @param {Collector} c
 * @param {unknown} scaling
 * @param {string|null} measurement
 * @returns {boolean}
 */
export function checkScaling(c, scaling, measurement) {
  const s = c.at('scaling');
  if (scaling === undefined || scaling === null) {
    s.add('', CODES.REQUIRED, 'All three scaling points are required.');
    return false;
  }
  if (!isPlainObject(scaling)) {
    s.add('', CODES.TYPE, 'Expected an object holding low, medium and high.');
    return false;
  }
  const rec = /** @type {Record<string, any>} */ (scaling);
  checkNoUnknownKeys(s, rec, INTENSITY_LEVELS, classifyLibraryKey);

  let allPointsGood = true;
  for (const level of INTENSITY_LEVELS) {
    if (!checkPrescription(s.at(level), rec[level], measurement, true)) allPointsGood = false;
  }
  if (!allPointsGood) return false;

  const work = (pt) => (pt.repetitions !== undefined && pt.repetitions !== null
    ? pt.repetitions : pt.duration_seconds);
  const [low, medium, high] = INTENSITY_LEVELS.map((l) => rec[l]);

  let good = true;
  if (!(work(low) <= work(medium) && work(medium) <= work(high))) {
    s.add('', CODES.ORDERING,
      'Work must not fall as intensity rises: low, then medium, then high.');
    good = false;
  }
  if (!(work(high) > work(low))) {
    s.add('high', CODES.ORDERING,
      'The high point must ask for strictly more work than the low point, or the three points are not genuinely different.');
    good = false;
  }
  if (!(low.sets <= medium.sets && medium.sets <= high.sets)) {
    s.add('', CODES.ORDERING, 'Sets must not fall as intensity rises.');
    good = false;
  }
  if (!(low.rest_seconds >= medium.rest_seconds && medium.rest_seconds >= high.rest_seconds)) {
    s.add('', CODES.ORDERING,
      'Rest must not rise as intensity rises — a harder point means less rest, never more.');
    good = false;
  }
  return good;
}
