/**
 * REFERENTIAL INTEGRITY — and it runs in ONE DIRECTION ONLY.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *  ENFORCED      every exercise a routine NAMES must exist.
 *  NOT ENFORCED  an exercise that nothing names. That is a NORMAL and PROTECTED state.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * The second line is not an omission, a simplification, or a check somebody forgot to write.
 * It is a requirement, and it is the one on this module most likely to be "fixed" into a
 * defect by a well-meaning later change.
 *
 * ## Why the reverse direction must never be enforced
 *
 * The shipped exercise catalogue DELIBERATELY EXCEEDS the shipped week. The seven routines
 * reference a little under two thirds of the library. The remainder is not dead weight, not
 * a mistake, and not orphaned data awaiting cleanup — **the surplus IS the substitution
 * pool**, and two features depend on it existing:
 *
 *  - The coach swaps an exercise mid-session when a client is tired. What he swaps TO is a
 *    regression such as a knee push-up, an equipment variant such as a band curl in place of
 *    a barbell one, or an alternative for a client training at home with nothing. Those are
 *    exactly the exercises no routine currently references.
 *  - The intensity adapter draws from the whole catalogue rather than only from a routine's
 *    own list.
 *
 * An importer, migration, reset or backup path that tidied away entries nothing points at
 * would therefore silently delete precisely the pool the coach needs, and would do it under
 * the appearance of housekeeping. The failure would surface in front of a client, in the
 * middle of a session, as a substitution that has nothing to offer.
 *
 * **So: no import, migration, reset or backup path may drop a catalogue entry merely because
 * no routine currently references it. A reviewer should treat any pruning of unreferenced
 * content as a defect, not as tidying.**
 *
 * {@link unreferencedExercises} exists to make that surplus VISIBLE — as a pool to draw
 * from, and as a number a diagnostics screen can show. It is deliberately named for what the
 * result IS rather than for what a caller might be tempted to do with it, and it reports no
 * issue, because there is nothing wrong.
 *
 * ## The same discipline applies to the app's own records
 *
 * A session names one routine and one to many clients, and all of those must resolve. But a
 * client who has never attended a session, and a routine that has never been run, are both
 * entirely normal — a newly registered client has no history yet, by definition.
 */

import { CODES, Collector } from './issues.js';

/**
 * The direction of every reference check in this module, in one place a reader can quote.
 * @type {Readonly<{enforced: readonly string[], never_enforced: readonly string[], rule: string}>}
 */
export const REFERENTIAL_DIRECTION = Object.freeze({
  enforced: Object.freeze([
    'routine.entries[].exercise_id  ->  exercise.id',
    'session.routine_id             ->  routine.id',
    'session.client_ids[]           ->  client record identity',
  ]),
  never_enforced: Object.freeze([
    'exercise.id  <-  some routine   (an unreferenced exercise is the substitution pool)',
    'routine.id   <-  some session   (a routine that has never been run is normal)',
    'client       <-  some session   (a newly registered client has no history yet)',
  ]),
  rule: 'A reference must resolve. Being referenced by nothing is never an error, and content is never pruned for it.',
});

/**
 * Human-readable statement of the protection, for a diagnostics screen or a reviewer.
 */
export const SUBSTITUTION_POOL_NOTE =
  'Exercises no routine references are the substitution pool the coach swaps to mid-session '
  + 'and the intensity adapter draws from. They are kept deliberately and must never be pruned.';

/**
 * Every exercise a routine names must exist.
 *
 * Also checks, where the exercise resolves, that a routine-level override AGREES with that
 * exercise's `measurement`: a repetition override on a time-based exercise, or a duration
 * override on a repetition-based one, is a contradiction. That check lives here rather than
 * in the routine validator because a routine on its own cannot know.
 *
 * @param {Array<Record<string, any>>} routines Routine CONTENT records.
 * @param {Array<Record<string, any>>} exercises Exercise CONTENT records.
 * @returns {import('./issues.js').ValidationResult}
 */
export function checkRoutineReferences(routines, exercises) {
  const c = new Collector();
  const byId = indexByContentKey(exercises);

  routines.forEach((routine, ri) => {
    const entries = Array.isArray(routine?.entries) ? routine.entries : [];
    entries.forEach((entry, ei) => {
      const path = `routines[${ri}](${routine?.id ?? '?'}).entries[${ei}]`;
      const id = entry?.exercise_id;
      if (typeof id !== 'string') return; // shape problems belong to the routine validator
      const exercise = byId.get(id);
      if (!exercise) {
        c.add(`${path}.exercise_id`, CODES.DANGLING_REFERENCE,
          `No exercise with the key "${id}" exists. A routine may only name exercises that exist, or the coach gets a dangling row mid-session.`);
        return;
      }
      checkOverrideAgreesWithMeasurement(c, path, entry, exercise);
    });
  });

  return c.result();
}

/**
 * @param {Collector} c
 * @param {string} path
 * @param {Record<string, any>} entry
 * @param {Record<string, any>} exercise
 */
function checkOverrideAgreesWithMeasurement(c, path, entry, exercise) {
  const has = (v) => v !== undefined && v !== null;
  if (exercise.measurement === 'repetitions' && has(entry.duration_seconds)) {
    c.add(`${path}.duration_seconds`, CODES.MISMATCH,
      `"${exercise.id}" is counted in repetitions, so a duration override contradicts it.`);
  }
  if (exercise.measurement === 'time' && has(entry.repetitions)) {
    c.add(`${path}.repetitions`, CODES.MISMATCH,
      `"${exercise.id}" is counted in time, so a repetition override contradicts it.`);
  }
}

/**
 * The exercises no routine currently references — **the substitution pool**.
 *
 * READ {@link SUBSTITUTION_POOL_NOTE} BEFORE USING THIS. The result is a resource, not a
 * cleanup list. Nothing in this application may delete, exclude from an import, omit from a
 * backup, or skip on a reset an exercise because it appears here.
 *
 * Returns a {@link ValidationResult}-free plain list precisely so that it CANNOT be mistaken
 * for a set of findings: there is nothing wrong with any exercise in it.
 *
 * @param {Array<Record<string, any>>} routines
 * @param {Array<Record<string, any>>} exercises
 * @returns {string[]} Content keys, in catalogue order.
 */
export function unreferencedExercises(routines, exercises) {
  const referenced = referencedExerciseKeys(routines);
  return exercises
    .map((e) => e?.id)
    .filter((id) => typeof id === 'string' && !referenced.has(id));
}

/**
 * Every exercise key any routine names.
 * @param {Array<Record<string, any>>} routines
 * @returns {Set<string>}
 */
export function referencedExerciseKeys(routines) {
  const out = new Set();
  for (const routine of routines) {
    const entries = Array.isArray(routine?.entries) ? routine.entries : [];
    for (const entry of entries) {
      if (typeof entry?.exercise_id === 'string') out.add(entry.exercise_id);
    }
  }
  return out;
}

/**
 * A session's routine and its attending clients must all resolve.
 *
 * The reverse is not checked and never will be: a routine that has never been run and a
 * client who has not yet attended a session are both ordinary.
 *
 * @param {Array<{record_id?: string, content?: Record<string, any>}|Record<string, any>>} sessions
 *   Session content records, optionally still in their envelopes.
 * @param {{routineIds: Iterable<string>, clientIds: Iterable<string>}} known
 * @returns {import('./issues.js').ValidationResult}
 */
export function checkSessionReferences(sessions, known) {
  const c = new Collector();
  const routineIds = new Set(known.routineIds);
  const clientIds = new Set(known.clientIds);

  sessions.forEach((maybeEnvelope, si) => {
    const session = maybeEnvelope && typeof maybeEnvelope === 'object' && 'content' in maybeEnvelope
      ? /** @type {any} */ (maybeEnvelope).content
      : maybeEnvelope;
    if (!session) return;
    const path = `sessions[${si}]`;
    if (typeof session.routine_id === 'string' && !routineIds.has(session.routine_id)) {
      c.add(`${path}.routine_id`, CODES.DANGLING_REFERENCE,
        `No routine with the key "${session.routine_id}" exists.`);
    }
    const ids = Array.isArray(session.client_ids) ? session.client_ids : [];
    ids.forEach((id, ci) => {
      if (typeof id === 'string' && !clientIds.has(id)) {
        c.add(`${path}.client_ids[${ci}]`, CODES.DANGLING_REFERENCE,
          'This session names a client that does not exist.');
      }
    });
  });

  return c.result();
}

/**
 * Index content records by their content key, reporting duplicates.
 * Keys are unique within a kind; nothing stops an exercise and a routine sharing a key
 * string, because they are separate namespaces.
 * @param {Array<Record<string, any>>} records
 * @returns {Map<string, Record<string, any>>}
 */
export function indexByContentKey(records) {
  const map = new Map();
  for (const record of records) {
    if (typeof record?.id === 'string') map.set(record.id, record);
  }
  return map;
}

/**
 * Content keys that appear more than once within one kind.
 * @param {Array<Record<string, any>>} records
 * @returns {string[]}
 */
export function duplicateContentKeys(records) {
  const seen = new Set();
  const dupes = new Set();
  for (const record of records) {
    const id = record?.id;
    if (typeof id !== 'string') continue;
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

/**
 * The whole library checked at once: duplicate keys, then the one enforced direction.
 *
 * Note what this function does NOT return: a list of unreferenced exercises to act on. Call
 * {@link unreferencedExercises} for that, and read its warning first.
 *
 * @param {{exercises: Array<Record<string, any>>, routines: Array<Record<string, any>>}} library
 * @returns {import('./issues.js').ValidationResult}
 */
export function checkLibraryIntegrity({ exercises, routines }) {
  const c = new Collector();
  for (const [kind, records] of [['exercises', exercises], ['routines', routines]]) {
    for (const id of duplicateContentKeys(/** @type {any} */(records))) {
      c.add(`${kind}(${id})`, CODES.DUPLICATE, `The key "${id}" is used more than once.`);
    }
  }
  const refs = checkRoutineReferences(routines, exercises);
  c.issues.push(...refs.issues);
  return c.result();
}
