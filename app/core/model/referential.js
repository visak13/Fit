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
import {
  CLIENT_FIELDS, DIET_DAY_FIELDS, DIET_ENTRY_FIELDS, DIET_PLAN_FIELDS, EXERCISE_FIELDS,
  INTENSITY_PATTERN_FIELDS, PERFORMED_RECORD_FIELDS, READING_FIELDS, ROUTINE_ENTRY_FIELDS,
  ROUTINE_FIELDS, SCALING_POINT_FIELDS, SESSION_FIELDS, SESSION_NOTE_FIELDS, VALIDATORS,
} from './entities/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * THE REFERENCE SET IS DERIVED FROM THE VALIDATORS. IT IS NOT A LIST ANYBODY MAINTAINS.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * It used to be three lines of prose sitting in {@link REFERENTIAL_DIRECTION}, and s11/a32
 * measured what that was worth: it named ONE of the EIGHT references by record identity the
 * validators actually declare, and a probe that added exactly the reference the guard above it
 * promises to catch left that guard GREEN. A guard asserting over a hand-maintained list guards
 * the list, not the code, and it drifts from the thing it guards the moment anybody adds a field.
 *
 * ## Why this derives BY EXECUTION rather than by reading the validators' source
 *
 * A reference is declared by a `checkRecordId` or `checkContentKey` call inside a validator, and
 * a text scan for those calls MISSES `session.client_ids[]` — the one reference the old prose
 * list did name — because `session.js` declares it through an `each:` callback that passes the
 * path through as a variable rather than as a literal. A scan would therefore have been blind to
 * the single reference everybody remembers, while looking straight at it.
 *
 * So each validator is RUN instead, one field at a time, against a value that is neither a record
 * identity nor a content key. Whichever of the two formats a field demands, it says so in its own
 * issue message, and that message is the declaration read back out of the code that makes it.
 *
 * The cost is paid once and only if somebody reads it: {@link REFERENTIAL_DIRECTION.enforced} is
 * a getter, so an app that never asks never probes.
 */

/** Every record type's field list, from the validator package that owns it. */
const RECORD_FIELDS = Object.freeze({
  exercise: EXERCISE_FIELDS,
  routine: ROUTINE_FIELDS,
  'intensity-pattern': INTENSITY_PATTERN_FIELDS,
  client: CLIENT_FIELDS,
  session: SESSION_FIELDS,
  'performed-record': PERFORMED_RECORD_FIELDS,
  reading: READING_FIELDS,
  'session-note': SESSION_NOTE_FIELDS,
  'diet-plan': DIET_PLAN_FIELDS,
});

/**
 * The field lists of the records that live INSIDE another record, so a nested reference is
 * reached too — `routine.entries[].exercise_id` is one, and it is the reference the coach's
 * whole week rests on.
 */
const NESTED_FIELDS = Object.freeze([
  ROUTINE_ENTRY_FIELDS, DIET_DAY_FIELDS, DIET_ENTRY_FIELDS, SCALING_POINT_FIELDS,
]);

/** Neither a UUID nor a content key, so a field of either kind objects and names its format. */
const PROBE = 'NOT a key';

const IDENTITY_HINT = /Must be a record identity/u;
const CONTENT_KEY_HINT = /lowercase letters, digits and single hyphens/u;

/**
 * The shapes one field is offered. A reference is a string, an array of strings, or a field
 * inside a nested record; anything else the validator rejects on type and reports nothing here.
 * @param {readonly string[][]} nested
 * @returns {unknown[]}
 */
function probeShapes(nested) {
  return [PROBE, [PROBE], ...nested.map((fields) => [Object.fromEntries(fields.map((f) => [f, PROBE]))])];
}

/** Whether an issue path is about `field` rather than about some other field of the same record. */
function isAbout(path, field) {
  return path === field || path.startsWith(`${field}[`) || path.startsWith(`${field}.`);
}

/**
 * What a reference POINTS AT, read off the field that holds it: `client_ids[]` names a client,
 * `exercise_id` names an exercise. A referent that is not a record type is a reference into a
 * vocabulary rather than into the coach's data.
 * @param {string} path
 * @returns {string}
 */
function referentOf(path) {
  const leaf = /** @type {string} */ (path.split('.').pop()).replace(/\[\]$/u, '');
  return leaf.replace(/_ids?$/u, '');
}

/**
 * @typedef {Object} Reference
 * @property {string} from The record type that holds the reference.
 * @property {string} path The path to the field inside it, arrays written `[]`.
 * @property {string} to   What it names.
 */

/**
 * Run every validator against every one of its fields and collect what each one demands.
 * @returns {{identity: Reference[], contentKey: Reference[]}}
 */
function deriveReferences() {
  /** @type {Map<string, Reference>} */ const identity = new Map();
  /** @type {Map<string, Reference>} */ const contentKey = new Map();
  for (const [type, fields] of Object.entries(RECORD_FIELDS)) {
    const validate = VALIDATORS[type];
    if (!validate) continue;
    for (const field of fields) {
      for (const shape of probeShapes(NESTED_FIELDS)) {
        let issues;
        try {
          issues = validate({ [field]: shape }).issues;
        } catch {
          continue; // a shape this validator cannot even walk tells us nothing about the field
        }
        for (const issue of issues) {
          if (!isAbout(issue.path, field)) continue;
          const path = issue.path.replace(/\[\d+\]/gu, '[]');
          const at = `${type}.${path}`;
          if (IDENTITY_HINT.test(issue.message)) {
            identity.set(at, { from: type, path, to: referentOf(path) });
          } else if (CONTENT_KEY_HINT.test(issue.message) && path !== 'id') {
            // `id` is the record's OWN content key, not a reference to anything.
            contentKey.set(at, { from: type, path, to: referentOf(path) });
          }
        }
      }
    }
  }
  const byKey = (a, b) => `${a.from}.${a.path}`.localeCompare(`${b.from}.${b.path}`);
  return { identity: [...identity.values()].sort(byKey), contentKey: [...contentKey.values()].sort(byKey) };
}

/** @type {{identity: Reference[], contentKey: Reference[]}|null} */
let derived = null;

function references() {
  if (derived === null) derived = deriveReferences();
  return derived;
}

/**
 * Every reference the validators declare BY RECORD IDENTITY — the envelope's stable handle.
 *
 * This is the set anything that RETIRES a `record_id` has to reason about: identity
 * reconciliation removes one side's row, and a reference by identity into a type it reconciles
 * would be left pointing at nothing. `core/sync/independent-seeding.test.js` asserts on it.
 *
 * @returns {readonly Reference[]}
 */
export function referencesByRecordIdentity() {
  return references().identity;
}

/**
 * Every reference the validators declare BY CONTENT KEY — the coach-facing key, preserved
 * across reconciliation because it is the thing both sides are matched on.
 * @returns {readonly Reference[]}
 */
export function referencesByContentKey() {
  return references().contentKey;
}

/** @type {readonly string[]|null} */
let enforcedLines = null;

/**
 * The direction of every reference check in this module, in one place a reader can quote.
 *
 * `enforced` is DERIVED (see the block above) and is prose rendered from the derivation, for a
 * reader. Anything asserting on it should prefer {@link referencesByRecordIdentity} or
 * {@link referencesByContentKey}, which carry the same facts without a matcher in the way.
 *
 * @type {Readonly<{enforced: readonly string[], never_enforced: readonly string[], rule: string}>}
 */
export const REFERENTIAL_DIRECTION = Object.freeze({
  get enforced() {
    if (enforcedLines === null) {
      const { identity, contentKey } = references();
      enforcedLines = Object.freeze([
        ...contentKey.map((r) => `${r.from}.${r.path}  ->  ${r.to} content key`),
        ...identity.map((r) => `${r.from}.${r.path}  ->  ${r.to} record identity`),
      ]);
    }
    return enforcedLines;
  },
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
