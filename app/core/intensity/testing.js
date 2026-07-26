/**
 * FIXTURES for this package's own suites. Not part of the module API and not imported by the
 * application — `intensity.js` is the API and it does not reach for this file.
 *
 * The builders below produce records that the real record model would accept: the scaling ladders
 * honour `R6` (work never falls, sets never fall, rest never rises as intensity climbs), names are
 * speakable, and no library record carries a load. `effort.test.js` puts a routine built here through
 * the real validator to keep that honest rather than assumed.
 *
 * Timestamps are FIXED CONSTANTS. There is no clock anywhere in this package and there is none in its
 * fixtures either: a suite that reads the time passes on the afternoon it was written and proves
 * nothing about the afternoon it runs on.
 */

/** Fixed instants, in the order they happened. */
export const T = Object.freeze({
  oldest: '2026-06-01T09:00:00.000Z',
  older: '2026-06-15T09:00:00.000Z',
  latest: '2026-07-01T09:00:00.000Z',
});

/** The default repetition ladder. Work rises, sets do not fall, rest does not rise. */
const REPETITION_LADDER = Object.freeze({
  low: Object.freeze({ sets: 2, repetitions: 8, rest_seconds: 60 }),
  medium: Object.freeze({ sets: 3, repetitions: 12, rest_seconds: 45 }),
  high: Object.freeze({ sets: 3, repetitions: 20, rest_seconds: 30 }),
});

/** The default timed ladder, for holds and intervals. */
const TIMED_LADDER = Object.freeze({
  low: Object.freeze({ sets: 2, duration_seconds: 20, rest_seconds: 60 }),
  medium: Object.freeze({ sets: 3, duration_seconds: 30, rest_seconds: 45 }),
  high: Object.freeze({ sets: 3, duration_seconds: 45, rest_seconds: 30 }),
});

/**
 * One exercise, as the library holds it.
 * @param {Object} options
 * @param {string} options.id
 * @param {string} options.intensity
 * @param {string} [options.name]
 * @param {string} [options.measurement] `repetitions` or `time`.
 * @param {string} [options.movementPattern]
 * @param {readonly string[]} [options.primaryMuscles]
 * @param {readonly string[]} [options.equipment]
 * @param {Record<string, any>} [options.scaling] Override the whole ladder.
 * @returns {Record<string, any>}
 */
export function anExercise({
  id, intensity, name = titleOf(id), measurement = 'repetitions',
  movementPattern = 'squat', primaryMuscles = ['quadriceps'], equipment = ['none'], scaling,
}) {
  const ladder = scaling ?? (measurement === 'time' ? TIMED_LADDER : REPETITION_LADDER);
  const defaultPoint = ladder[intensity];
  return Object.freeze({
    id,
    name,
    movement_pattern: movementPattern,
    primary_muscles: Object.freeze([...primaryMuscles]),
    secondary_muscles: Object.freeze([]),
    equipment: Object.freeze([...equipment]),
    measurement,
    default_prescription: Object.freeze(measurement === 'time'
      ? { sets: defaultPoint.sets, duration_seconds: defaultPoint.duration_seconds }
      : { sets: defaultPoint.sets, repetitions: defaultPoint.repetitions }),
    default_rest_seconds: defaultPoint.rest_seconds,
    intensity,
    scaling: ladder,
    hiit_suitable: measurement === 'time',
    coaching_cue: 'Move with control and breathe out on the effort.',
    provenance: 'coach-created',
  });
}

/**
 * A routine over the exercises given, in the order given.
 * @param {Object} options
 * @param {readonly Record<string, any>[]} options.exercises
 * @param {string} [options.id]
 * @param {string} [options.name]
 * @param {Readonly<Record<string, Record<string, any>>>} [options.overrides] Keyed by exercise id.
 * @returns {Record<string, any>}
 */
export function aRoutine({ exercises, id = 'test-routine', name = 'Test Routine', overrides = {} }) {
  return Object.freeze({
    id,
    name,
    split_day: 1,
    focus: 'full-body',
    body_regions: Object.freeze(['full-body']),
    description: 'A routine built for this package\'s own suites and for nothing else.',
    entries: Object.freeze(exercises.map((exercise) => Object.freeze({
      exercise_id: exercise.id,
      ...(overrides[exercise.id] ?? {}),
    }))),
    provenance: 'coach-created',
  });
}

/**
 * An intensity pattern.
 * @param {readonly string[]} sequence
 * @param {string} [mappingRule]
 * @param {string} [id]
 * @returns {Record<string, any>}
 */
export function aPattern(sequence, mappingRule = 'stretch', id = 'test-pattern') {
  return Object.freeze({
    id,
    name: sequence.map(titleCase).join(' '),
    sequence: Object.freeze([...sequence]),
    mapping_rule: mappingRule,
    description: 'A curve built for this package\'s own suites and for nothing else.',
    provenance: 'coach-created',
  });
}

/**
 * One performed record — what a client actually did.
 * @param {Object} options
 * @param {string} options.exerciseId
 * @param {string} options.recordedAt
 * @param {number} [options.repetitions]
 * @param {number} [options.durationSeconds]
 * @param {number} [options.sets]
 * @param {number} [options.restSeconds]
 * @param {string} [options.level]
 * @param {string} [options.status]
 * @returns {Record<string, any>}
 */
export function aPerformedRecord({
  exerciseId, recordedAt, repetitions, durationSeconds, sets = 3, restSeconds = 45,
  level, status = 'performed',
}) {
  const record = {
    session_id: 'session-for-tests',
    client_id: 'client-for-tests',
    exercise_id: exerciseId,
    position: 0,
    status,
    sets_completed: sets,
    rest_seconds: restSeconds,
    recorded_at: recordedAt,
  };
  if (repetitions !== undefined) record.repetitions = repetitions;
  if (durationSeconds !== undefined) record.duration_seconds = durationSeconds;
  if (level !== undefined) record.intensity_level = level;
  return Object.freeze(record);
}

/**
 * A history argument around a list of performed records.
 * @param {readonly Record<string, any>[]} performed
 * @param {string} [clientId]
 * @returns {Record<string, any>}
 */
export function aHistory(performed, clientId = 'client-for-tests') {
  return Object.freeze({
    client_id: clientId,
    window: Object.freeze({ from: T.oldest, to: T.latest, session_count: performed.length }),
    performed: Object.freeze([...performed]),
  });
}

/** `bodyweight-squat` reads as `Bodyweight Squat`, which is how an exercise name is written. */
function titleOf(id) {
  return id.split('-').map(titleCase).join(' ');
}

/** @param {string} word @returns {string} */
function titleCase(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
