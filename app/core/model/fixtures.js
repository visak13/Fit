/**
 * Test fixtures — valid records of every kind, each built by a function that takes an
 * override object.
 *
 * Written as builders rather than constants so a test can express exactly one deviation from
 * a valid record and nothing else. A test that has to restate fifteen fields to change one
 * stops saying what it is testing.
 *
 * NO REAL PERSON APPEARS HERE. The repository is public by an explicit decision, so nothing
 * committed to it may carry a credential, real client data or a real name. These names are
 * obviously synthetic for exactly that reason.
 *
 * This file is not a test and holds no assertions; it lives beside the tests because it is
 * test material and nothing in the application imports it.
 */

/** A fixed instant, so a fixture is byte-identical on every run. */
export const T0 = '2026-07-25T09:00:00.000Z';
export const T1 = '2026-07-25T10:00:00.000Z';
export const T2 = '2026-07-25T11:00:00.000Z';

/** Fixed record identities, so a test can wire references without generating anything. */
export const CLIENT_A = '11111111-1111-4111-8111-111111111111';
export const CLIENT_B = '22222222-2222-4222-8222-222222222222';
export const SESSION_1 = '33333333-3333-4333-8333-333333333333';

/** @param {Record<string, any>} [over] */
export const anExercise = (over = {}) => ({
  id: 'test-push-up',
  name: 'Test Push Up',
  movement_pattern: 'horizontal-push',
  primary_muscles: ['chest'],
  secondary_muscles: ['triceps'],
  equipment: ['none'],
  measurement: 'repetitions',
  default_prescription: { sets: 3, repetitions: 10 },
  default_rest_seconds: 45,
  intensity: 'medium',
  scaling: {
    low: { sets: 2, repetitions: 8, rest_seconds: 60 },
    medium: { sets: 3, repetitions: 10, rest_seconds: 45 },
    high: { sets: 4, repetitions: 14, rest_seconds: 30 },
  },
  hiit_suitable: true,
  coaching_cue: 'Body in one straight line, lower under control.',
  provenance: 'shipped-untouched',
  ...over,
});

/** A time-measured exercise, for the measurement-agreement cases. @param {Record<string, any>} [over] */
export const aTimedExercise = (over = {}) => anExercise({
  id: 'test-plank',
  name: 'Test Plank',
  movement_pattern: 'isometric-hold',
  primary_muscles: ['abdominals'],
  secondary_muscles: [],
  equipment: ['mat'],
  measurement: 'time',
  default_prescription: { sets: 3, duration_seconds: 30 },
  scaling: {
    low: { sets: 2, duration_seconds: 20, rest_seconds: 60 },
    medium: { sets: 3, duration_seconds: 30, rest_seconds: 45 },
    high: { sets: 3, duration_seconds: 45, rest_seconds: 30 },
  },
  intensity: 'low',
  hiit_suitable: false,
  coaching_cue: 'Squeeze the glutes and keep the hips level.',
  ...over,
});

/** @param {Record<string, any>} [over] */
export const aRoutine = (over = {}) => ({
  id: 'test-push-day',
  name: 'Test Push Day',
  split_day: 2,
  focus: 'push',
  body_regions: ['upper-body'],
  description: 'A short push session used only by the model tests.',
  entries: [{ exercise_id: 'test-push-up', sets: 4, repetitions: 12 }],
  provenance: 'shipped-untouched',
  ...over,
});

/** @param {Record<string, any>} [over] */
export const anIntensityPattern = (over = {}) => ({
  id: 'test-low-medium-high',
  name: 'Low Medium High',
  sequence: ['low', 'medium', 'high'],
  mapping_rule: 'stretch',
  description: 'A three point ramp used only by the model tests.',
  provenance: 'shipped-untouched',
  ...over,
});

/** @param {Record<string, any>} [over] */
export const aClient = (over = {}) => ({
  name: 'Test Client One',
  notes: '',
  active: true,
  ...over,
});

/** A well-formed sealed value. Opaque by design; nothing can read it and nothing needs to. */
export const aSealedValue = (ct = 'Y2lwaGVydGV4dA==') => ({
  scheme: 1,
  iv: 'MTIzNDU2Nzg5MDEy',
  ct,
});

/** @param {Record<string, any>} [over] */
export const aSession = (over = {}) => ({
  routine_id: 'test-push-day',
  client_ids: [CLIENT_A],
  status: 'planned',
  ...over,
});

/** @param {Record<string, any>} [over] */
export const aPerformedRecord = (over = {}) => ({
  session_id: SESSION_1,
  client_id: CLIENT_A,
  exercise_id: 'test-push-up',
  position: 0,
  status: 'performed',
  sets_completed: 3,
  repetitions: 12,
  recorded_at: T1,
  ...over,
});

/** @param {Record<string, any>} [over] */
export const aReading = (over = {}) => ({
  client_id: CLIENT_A,
  session_id: SESSION_1,
  kind: 'plank-hold',
  value: 62,
  unit: 'seconds',
  context: 'in_session',
  taken_at: T1,
  ...over,
});

/** @param {Record<string, any>} [over] */
export const aSessionNote = (over = {}) => ({
  session_id: SESSION_1,
  client_id: CLIENT_A,
  text: 'Held the second set well; shortened the last round.',
  taken_at: T1,
  ...over,
});

/** @param {Record<string, any>} [over] */
export const aDietPlan = (over = {}) => ({
  client_id: CLIENT_A,
  name: 'Test week one',
  status: 'current',
  effective_from: '2026-07-20',
  days: [
    {
      day: 1,
      entries: [
        { time: '08:00', label: 'Breakfast', items: ['Oats', 'Two eggs'] },
        { time: '13:00', label: 'Lunch', items: ['Rice', 'Dal', 'Salad'] },
      ],
    },
  ],
  ...over,
});
