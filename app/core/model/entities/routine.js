/**
 * THE ROUTINE record — content, owned by the seed content contract §5.
 *
 * A routine is an ordered list of exercise REFERENCES plus enough description for the coach
 * to tell two similar sessions apart at a glance. It never copies an exercise definition
 * into itself: he edits an exercise once and every routine using it changes, which is the
 * whole point of an in-app library, and a copied definition would silently keep old values.
 *
 * ## Order is a default, not a script
 *
 * `entries` carries the routine's default order. The coach jumps to any exercise, reorders,
 * skips, repeats, substitutes or edits mid-session, and the intensity adapter reorders it
 * too. Nothing in this record asserts that the session will run in this order, and nothing
 * downstream may treat it as though it does. The app tracks what happened; it never dictates
 * what happens next.
 *
 * ## Entry overrides
 *
 * The four optional entry fields are routine-level OVERRIDES of the exercise's own defaults,
 * for a movement programmed differently on the pull day than on the functional day. Omitting
 * a field inherits the exercise default, and a value that merely restates the default is
 * discouraged rather than rejected: a restated value stops tracking edits to the exercise.
 *
 * An override must agree with the referenced exercise's `measurement`. That check needs the
 * exercise library and therefore lives in `../referential.js`, alongside the reference check
 * itself — not here, where a routine is validated on its own.
 */

import { CODES, Collector } from '../issues.js';
import {
  checkContentKey, checkEnum, checkInteger, checkIsRecord, checkNoUnknownKeys,
  checkString, checkStringArray, isPlainObject,
} from '../primitives.js';
import { BODY_REGIONS, PROVENANCE, ROUTINE_FOCUS } from '../vocabularies.js';
import { classifyLibraryKey } from './exercise.js';

/** @type {readonly string[]} */
export const ROUTINE_FIELDS = Object.freeze([
  'id', 'name', 'split_day', 'focus', 'body_regions', 'description', 'entries', 'provenance',
]);

/** @type {readonly string[]} */
export const ROUTINE_ENTRY_FIELDS = Object.freeze([
  'exercise_id', 'sets', 'repetitions', 'duration_seconds', 'rest_seconds',
]);

/** Routine names are displayed, never spoken, so the format is looser than an exercise name. */
const ROUTINE_NAME_PATTERN = /^[A-Za-z0-9]+([ -][A-Za-z0-9]+)*$/;

/**
 * Validate one routine content record.
 * @param {unknown} routine
 * @returns {import('../issues.js').ValidationResult}
 */
export function validateRoutine(routine) {
  const c = new Collector();
  if (!checkIsRecord(c, routine)) return c.result();
  const r = /** @type {Record<string, any>} */ (routine);

  checkNoUnknownKeys(c, r, ROUTINE_FIELDS, classifyLibraryKey);

  checkContentKey(c, 'id', r.id, { required: true });
  checkString(c, 'name', r.name, {
    required: true, min: 3, max: 60,
    pattern: ROUTINE_NAME_PATTERN,
    patternHint: 'Use letters, digits, single spaces and hyphens.',
  });
  // A POSITION in the weekly split, not a calendar weekday. The coach's week does not
  // necessarily start on a Monday and clients train on different days; a position lets the
  // split be ordered so body parts rest between consecutive sessions, without the app
  // claiming to own his calendar.
  checkInteger(c, 'split_day', r.split_day, { required: true, min: 1, max: 7 });
  checkEnum(c, 'focus', r.focus, ROUTINE_FOCUS, { required: true });
  checkStringArray(c, 'body_regions', r.body_regions, { required: true, min: 1, allowed: BODY_REGIONS });
  checkString(c, 'description', r.description, { required: true, min: 10, max: 400 });
  checkEnum(c, 'provenance', r.provenance, PROVENANCE, { required: true });

  checkEntries(c, r.entries);

  return c.result();
}

/**
 * @param {Collector} c
 * @param {unknown} entries
 * @returns {boolean}
 */
function checkEntries(c, entries) {
  const e = c.at('entries');
  if (entries === undefined || entries === null) {
    e.add('', CODES.REQUIRED, 'A routine needs at least one exercise.');
    return false;
  }
  if (!Array.isArray(entries)) {
    e.add('', CODES.TYPE, 'Expected a list of entries.');
    return false;
  }
  if (entries.length < 1) {
    e.add('', CODES.LENGTH, 'A routine needs at least one exercise.');
    return false;
  }
  let good = true;
  entries.forEach((entry, i) => {
    const at = c.at(`entries[${i}]`);
    if (!isPlainObject(entry)) {
      at.add('', CODES.TYPE, 'Expected an entry object.');
      good = false;
      return;
    }
    const rec = /** @type {Record<string, any>} */ (entry);
    if (!checkNoUnknownKeys(at, rec, ROUTINE_ENTRY_FIELDS, classifyLibraryKey)) good = false;
    // Reference by content key only. The exercise must EXIST — that is checked against the
    // library in ../referential.js, because a routine on its own cannot know.
    if (!checkContentKey(at, 'exercise_id', rec.exercise_id, { required: true })) good = false;
    if (!checkInteger(at, 'sets', rec.sets, { min: 1, max: 10 })) good = false;
    if (!checkInteger(at, 'repetitions', rec.repetitions, { min: 1, max: 100 })) good = false;
    if (!checkInteger(at, 'duration_seconds', rec.duration_seconds, { min: 5, max: 1800 })) good = false;
    if (!checkInteger(at, 'rest_seconds', rec.rest_seconds, { min: 0, max: 600 })) good = false;
    if (rec.repetitions !== undefined && rec.repetitions !== null
      && rec.duration_seconds !== undefined && rec.duration_seconds !== null) {
      at.add('', CODES.EXCLUSIVE,
        'An entry may override repetitions or duration, never both — the exercise is counted one way or the other.');
      good = false;
    }
  });
  return good;
}
