/**
 * THE ENTITIES — one section per record kind.
 *
 * Each section proves the happy path, then the refusals that carry a product decision. The
 * refusals matter more than the happy paths: a validator that merely accepts good records is
 * a formality, whereas these are the places where a later change would otherwise quietly
 * undo something that was decided deliberately.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateExercise, validateRoutine, validateIntensityPattern, validateClient,
  validateSession, validatePerformedRecord, validateReading, validateSessionNote,
  validateDietPlan, validatorFor, VALIDATORS,
} from './entities/index.js';
import { CODES, hasCode, formatIssues } from './issues.js';
import { RECORD_TYPES } from './vocabularies.js';
import {
  ENCRYPTED_FIELDS, ALL_ENCRYPTED_FIELD_NAMES, isSealed, withoutEncryptedFields,
  carriesSealedValues,
} from './sealed.js';
import {
  anExercise, aTimedExercise, aRoutine, anIntensityPattern, aClient, aSealedValue,
  aSession, aPerformedRecord, aReading, aSessionNote, aDietPlan,
  CLIENT_A, CLIENT_B, SESSION_1, T0, T1, T2,
} from './fixtures.js';

/** Assert a record validates, printing every issue if it does not. */
const assertValid = (result) => assert.ok(result.ok, formatIssues(result));
/** Assert a record is refused with a particular code. */
const assertCode = (result, code) => {
  assert.equal(result.ok, false, 'expected this record to be refused');
  assert.ok(hasCode(result, code), `expected ${code}\n${formatIssues(result)}`);
};

// ═══════════════════════════════════════════════════════════════════════════════
// The registry
// ═══════════════════════════════════════════════════════════════════════════════

test('every record type has a validator, and every validator has a record type', () => {
  assert.deepEqual(Object.keys(VALIDATORS).sort(), [...RECORD_TYPES].sort());
  for (const type of RECORD_TYPES) assert.equal(typeof validatorFor(type), 'function');
  assert.equal(validatorFor('nonsense'), null);
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXERCISE
// ═══════════════════════════════════════════════════════════════════════════════

test('a well-formed exercise validates, in both measurements', () => {
  assertValid(validateExercise(anExercise()));
  assertValid(validateExercise(aTimedExercise()));
});

test('an exercise name that cannot be spoken aloud is refused', () => {
  // The app reads this through the speech synthesiser mid-session. Punctuation,
  // abbreviations and digits read badly or not at all.
  for (const name of ['Push-Up (Incline)', 'DB Press', 'Squat 3x10']) {
    assertCode(validateExercise(anExercise({ name })), CODES.FORMAT);
  }
});

test('a prescription must agree with the measurement', () => {
  assertCode(validateExercise(anExercise({
    default_prescription: { sets: 3, duration_seconds: 30 },
  })), CODES.MISMATCH);
  assertCode(validateExercise(aTimedExercise({
    default_prescription: { sets: 3, repetitions: 10 },
  })), CODES.MISMATCH);
});

test('a prescription carrying both work units, or neither, is refused', () => {
  assertCode(validateExercise(anExercise({
    default_prescription: { sets: 3, repetitions: 10, duration_seconds: 30 },
  })), CODES.EXCLUSIVE);
  assertCode(validateExercise(anExercise({
    default_prescription: { sets: 3 },
  })), CODES.EXCLUSIVE);
});

test('scaling that gets EASIER as intensity rises is refused', () => {
  // The failure this exists to catch: the adapter proposes a session that gets easier as
  // the curve rises, in front of a client, and the coach stops trusting the button.
  assertCode(validateExercise(anExercise({
    scaling: {
      low: { sets: 2, repetitions: 12, rest_seconds: 30 },
      medium: { sets: 3, repetitions: 10, rest_seconds: 45 },
      high: { sets: 4, repetitions: 8, rest_seconds: 60 },
    },
  })), CODES.ORDERING);
});

test('rest that RISES as intensity rises is refused — a harder point means less rest', () => {
  assertCode(validateExercise(anExercise({
    scaling: {
      low: { sets: 2, repetitions: 8, rest_seconds: 30 },
      medium: { sets: 3, repetitions: 10, rest_seconds: 45 },
      high: { sets: 4, repetitions: 14, rest_seconds: 60 },
    },
  })), CODES.ORDERING);
});

test('three scaling points that ask for identical work are refused as filler', () => {
  assertCode(validateExercise(anExercise({
    scaling: {
      low: { sets: 3, repetitions: 10, rest_seconds: 45 },
      medium: { sets: 3, repetitions: 10, rest_seconds: 45 },
      high: { sets: 3, repetitions: 10, rest_seconds: 45 },
    },
  })), CODES.ORDERING);
});

test('a missing scaling point is refused', () => {
  const { high, ...withoutHigh } = anExercise().scaling;
  assertCode(validateExercise(anExercise({ scaling: withoutHigh })), CODES.REQUIRED);
});

// ── the load ban ───────────────────────────────────────────────────────────────

test('a LOAD field on an exercise is refused by its own code, not as a typo', () => {
  // Prescribing weight would put the app in the position of making a training-load
  // judgement about people it has never seen. That belongs to the certified coach.
  for (const field of ['load', 'weight_kg', 'load_kg', 'resistance', 'default_weight']) {
    assertCode(validateExercise(anExercise({ [field]: 20 })), CODES.FORBIDDEN_LOAD);
  }
});

test('a load field smuggled into a prescription or a scaling point is refused too', () => {
  assertCode(validateExercise(anExercise({
    default_prescription: { sets: 3, repetitions: 10, load_kg: 20 },
  })), CODES.FORBIDDEN_LOAD);
  assertCode(validateExercise(anExercise({
    scaling: { ...anExercise().scaling, high: { sets: 4, repetitions: 14, rest_seconds: 30, weight: 40 } },
  })), CODES.FORBIDDEN_LOAD);
});

test('a load field on a routine, a routine entry or an intensity pattern is refused', () => {
  assertCode(validateRoutine(aRoutine({ load: 'heavy' })), CODES.FORBIDDEN_LOAD);
  assertCode(validateRoutine(aRoutine({
    entries: [{ exercise_id: 'test-push-up', weight_kg: 20 }],
  })), CODES.FORBIDDEN_LOAD);
  assertCode(validateIntensityPattern(anIntensityPattern({ load_multiplier: 1.1 })),
    CODES.FORBIDDEN_LOAD);
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTINE
// ═══════════════════════════════════════════════════════════════════════════════

test('a well-formed routine validates', () => {
  assertValid(validateRoutine(aRoutine()));
});

test('a routine with no entries is refused', () => {
  assertCode(validateRoutine(aRoutine({ entries: [] })), CODES.LENGTH);
});

test('a routine entry must reference by key and never copy the exercise in', () => {
  assertCode(validateRoutine(aRoutine({
    entries: [{ exercise_id: 'test-push-up', name: 'Test Push Up', measurement: 'repetitions' }],
  })), CODES.UNKNOWN_FIELD);
});

test('an entry overriding both work units is refused', () => {
  assertCode(validateRoutine(aRoutine({
    entries: [{ exercise_id: 'test-push-up', repetitions: 10, duration_seconds: 30 }],
  })), CODES.EXCLUSIVE);
});

test('split_day is a position in the split, one to seven', () => {
  assertCode(validateRoutine(aRoutine({ split_day: 0 })), CODES.RANGE);
  assertCode(validateRoutine(aRoutine({ split_day: 8 })), CODES.RANGE);
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTENSITY PATTERN
// ═══════════════════════════════════════════════════════════════════════════════

test('a well-formed intensity pattern validates, and a repeated level is allowed', () => {
  assertValid(validateIntensityPattern(anIntensityPattern()));
  assertValid(validateIntensityPattern(anIntensityPattern({
    id: 'test-low-medium-high-low',
    name: 'Low Medium High Low',
    sequence: ['low', 'medium', 'high', 'low'],
  })));
});

test('a name that spells out a curve must match the sequence exactly', () => {
  // A button labelled one thing and doing another is a lie told in front of a client.
  assertCode(validateIntensityPattern(anIntensityPattern({
    name: 'Low Medium High Low', sequence: ['low', 'medium', 'high'],
  })), CODES.MISMATCH);
  assertCode(validateIntensityPattern(anIntensityPattern({
    name: 'High Medium Low', sequence: ['low', 'medium', 'high'],
  })), CODES.MISMATCH);
});

test('a descriptive name with fewer than two intensity words is not checked against the sequence', () => {
  assertValid(validateIntensityPattern(anIntensityPattern({
    name: 'Steady Build', sequence: ['low', 'medium', 'high'],
  })));
  assertValid(validateIntensityPattern(anIntensityPattern({
    name: 'High Effort Finish', sequence: ['low', 'medium', 'high'],
  })));
});

test('a sequence outside two to eight points is refused', () => {
  assertCode(validateIntensityPattern(anIntensityPattern({ name: 'One', sequence: ['low'] })), CODES.LENGTH);
});

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT — the most tightly bounded record in the application
// ═══════════════════════════════════════════════════════════════════════════════

test('a well-formed client validates, with and without clinical fields', () => {
  assertValid(validateClient(aClient()));
  assertValid(validateClient(aClient({
    adaptation_flag: 'Knee injury, avoid deep squats',
    clinical_note: aSealedValue(),
    clinical_reference: aSealedValue('cG9pbnRlcg=='),
    clinical_reference_label: aSealedValue('bGFiZWw='),
  })));
});

test('contact and identifying information is refused by its own code', () => {
  // Data that is never collected cannot leak. This is the strongest protection available
  // to an app with no backend, served from a public site, storing to a personal Drive.
  for (const field of [
    'email', 'phone', 'mobile_number', 'address', 'date_of_birth', 'dob', 'photo',
    'avatar_url', 'emergency_contact',
  ]) {
    assertCode(validateClient(aClient({ [field]: 'anything' })), CODES.MINIMISATION);
  }
});

test('a clinical note written in the clear is refused, loudly and by name', () => {
  const r = validateClient(aClient({ clinical_note: 'Type 2 diabetic, on metformin' }));
  assertCode(r, CODES.PLAINTEXT_IN_SEALED_FIELD);
});

test('a pointer label written in the clear is refused — a filename is itself health data', () => {
  assertCode(validateClient(aClient({
    clinical_reference: aSealedValue(),
    clinical_reference_label: 'cardiac-history.pdf',
  })), CODES.PLAINTEXT_IN_SEALED_FIELD);
});

test('a clinical field that is not in the sealed shape is refused', () => {
  assertCode(validateClient(aClient({ clinical_note: { iv: 'x', ct: 'y' } })), CODES.NOT_SEALED);
  assertCode(validateClient(aClient({ clinical_note: { scheme: 99, iv: 'MTIz', ct: 'MTIz' } })),
    CODES.NOT_SEALED);
});

test('a pointer without its label, or a label without its pointer, is refused', () => {
  assertCode(validateClient(aClient({ clinical_reference: aSealedValue() })), CODES.MISMATCH);
  assertCode(validateClient(aClient({ clinical_reference_label: aSealedValue() })), CODES.MISMATCH);
});

test('having no clinical note at all is the ordinary case and needs no ciphertext', () => {
  const plain = aClient({ adaptation_flag: '' });
  assertValid(validateClient(plain));
  assert.equal(carriesSealedValues('client', plain), false);
});

test('the adaptation flag is plaintext and short enough to refuse a case history', () => {
  assertValid(validateClient(aClient({ adaptation_flag: 'Shoulder — no overhead pressing' })));
  assertCode(validateClient(aClient({ adaptation_flag: 'x'.repeat(121) })), CODES.LENGTH);
});

// ── the encrypted-field set itself ─────────────────────────────────────────────

test('exactly three fields in the whole application are ciphertext, all on the client', () => {
  assert.deepEqual([...ALL_ENCRYPTED_FIELD_NAMES].sort(),
    ['clinical_note', 'clinical_reference', 'clinical_reference_label']);
  assert.deepEqual(Object.keys(ENCRYPTED_FIELDS), ['client']);
});

test('the diet plan is plaintext — no encryption, no sensitivity flag, no export gate', () => {
  assert.equal(ENCRYPTED_FIELDS['diet-plan'], undefined);
  const plan = aDietPlan();
  assert.deepEqual(withoutEncryptedFields('diet-plan', plan), plan);
});

test('stripping encrypted fields removes them rather than blanking them', () => {
  const client = aClient({
    clinical_note: aSealedValue(),
    clinical_reference: aSealedValue(),
    clinical_reference_label: aSealedValue(),
  });
  const stripped = withoutEncryptedFields('client', client);
  for (const f of ALL_ENCRYPTED_FIELD_NAMES) assert.equal(f in stripped, false);
  assert.equal(stripped.name, client.name);
  assert.equal(carriesSealedValues('client', client), true);
  assert.equal(carriesSealedValues('client', stripped), false);
  // The original is untouched.
  assert.ok(isSealed(client.clinical_note));
});

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION — one routine, one to many clients
// ═══════════════════════════════════════════════════════════════════════════════

test('a session drives one routine for one client', () => {
  assertValid(validateSession(aSession()));
});

test('a session drives ONE routine for MANY clients in the same call', () => {
  assertValid(validateSession(aSession({ client_ids: [CLIENT_A, CLIENT_B] })));
});

test('a session with no attending client is refused', () => {
  assertCode(validateSession(aSession({ client_ids: [] })), CODES.LENGTH);
});

test('the same client cannot attend a session twice', () => {
  assertCode(validateSession(aSession({ client_ids: [CLIENT_A, CLIENT_A] })), CODES.DUPLICATE);
});

test('a session may name only one routine — a second routine is not a field that exists', () => {
  // Two people in one call needing different programmes is handled by running two app
  // instances, never by multi-routine orchestration inside one session.
  assertCode(validateSession(aSession({ routine_ids: ['a-routine', 'another-routine'] })),
    CODES.UNKNOWN_FIELD);
});

test('clients are named by record identity and the routine by content key', () => {
  // A client is authored in the app and has no content key, so a key-shaped value is wrong.
  assertCode(validateSession(aSession({ client_ids: ['test-client-one'] })), CODES.FORMAT);
  // A routine is library content and keeps its content key, so a display name is wrong.
  assertCode(validateSession(aSession({ routine_id: 'Test Push Day' })), CODES.FORMAT);
});

test('interruption is a first-class state, and a partial session is still a record', () => {
  assertValid(validateSession(aSession({ status: 'interrupted', started_at: T0 })));
});

test('a session that has started must say when', () => {
  for (const status of ['in_progress', 'interrupted', 'completed', 'abandoned']) {
    assertCode(validateSession(aSession({ status, ended_at: T1 })), CODES.REQUIRED);
  }
});

test('a completed session must say when it ended, and cannot end before it started', () => {
  assertCode(validateSession(aSession({ status: 'completed', started_at: T1 })), CODES.REQUIRED);
  assertCode(validateSession(aSession({ status: 'completed', started_at: T2, ended_at: T0 })),
    CODES.ORDERING);
});

test('a session says whether it was run online or in person, and will not be left unsaid', () => {
  assertValid(validateSession(aSession({ mode: 'online' })));
  assertValid(validateSession(aSession({ mode: 'in_person' })));
  // Deriving the answer from a missing link is what this field exists to replace, so a session
  // that does not say is refused rather than assumed.
  const { mode, ...unsaid } = aSession();
  assertCode(validateSession(unsaid), CODES.REQUIRED);
});

test('there is no third way to run a session', () => {
  // He runs it on a call or in a room. A value nobody sets is a branch nobody tests.
  assertCode(validateSession(aSession({ mode: 'hybrid' })), CODES.ENUM);
});

test('a session run in person has no meeting to join', () => {
  // In person creates no calendar event and no link AT ALL, so a link here is a contradiction
  // in the record rather than a spare field.
  assertCode(validateSession(aSession({
    mode: 'in_person', meet_url: 'https://meet.google.com/abc-defg-hij', meet_source: 'minted',
  })), CODES.MISMATCH);
  assertCode(validateSession(aSession({ mode: 'in_person', meet_source: 'pasted' })),
    CODES.MISMATCH);
  // An online session that has not been given its link yet is perfectly ordinary — which is
  // precisely why the absence of a link cannot be read as "in person".
  assertValid(validateSession(aSession({ mode: 'online' })));
});

test('a link and its origin travel together, and only the joining URL is stored', () => {
  assertValid(validateSession(aSession({
    meet_url: 'https://meet.google.com/abc-defg-hij', meet_source: 'minted',
  })));
  assertValid(validateSession(aSession({
    meet_url: 'https://meet.google.com/abc-defg-hij', meet_source: 'pasted',
  })));
  assertCode(validateSession(aSession({ meet_url: 'https://meet.google.com/abc-defg-hij' })),
    CODES.MISMATCH);
  assertCode(validateSession(aSession({ meet_source: 'minted' })), CODES.MISMATCH);
});

// ═══════════════════════════════════════════════════════════════════════════════
// PERFORMED RECORD — the one place a load may be recorded
// ═══════════════════════════════════════════════════════════════════════════════

test('a performed record validates and is scoped to one client in one session', () => {
  assertValid(validatePerformedRecord(aPerformedRecord()));
  assertValid(validatePerformedRecord(aPerformedRecord({ client_id: CLIENT_B })));
});

test('an OBSERVED load is allowed here, and only here', () => {
  // The rule has two halves and they are one idea: a library load would be a prescription
  // about people the app has never seen; this is an observation of what actually happened.
  assertValid(validatePerformedRecord(aPerformedRecord({ observed_load: '20kg' })));
  assertValid(validatePerformedRecord(aPerformedRecord({ observed_load: 'red band' })));
  assertValid(validatePerformedRecord(aPerformedRecord({ observed_load: 'bodyweight' })));
  // ... while the same value on a library record is refused.
  assertCode(validateExercise(anExercise({ observed_load: '20kg' })), CODES.FORBIDDEN_LOAD);
});

test('a substitution records what it replaced, and only a substitution does', () => {
  assertValid(validatePerformedRecord(aPerformedRecord({
    status: 'substituted', substituted_for_exercise_id: 'test-plank',
  })));
  assertCode(validatePerformedRecord(aPerformedRecord({ status: 'substituted' })), CODES.REQUIRED);
  assertCode(validatePerformedRecord(aPerformedRecord({
    status: 'performed', substituted_for_exercise_id: 'test-plank',
  })), CODES.MISMATCH);
});

test('a skipped exercise records no work', () => {
  assertValid(validatePerformedRecord({
    session_id: SESSION_1, client_id: CLIENT_A, exercise_id: 'test-push-up',
    position: 2, status: 'skipped', recorded_at: T1,
  }));
  assertCode(validatePerformedRecord(aPerformedRecord({ status: 'skipped' })), CODES.MISMATCH);
});

// ═══════════════════════════════════════════════════════════════════════════════
// READING
// ═══════════════════════════════════════════════════════════════════════════════

test('the readings the coach actually takes validate', () => {
  assertValid(validateReading(aReading({ kind: 'heart-rate', value: 148, unit: 'bpm' })));
  assertValid(validateReading(aReading({ kind: 'plank-hold', value: 75, unit: 'seconds' })));
  assertValid(validateReading(aReading({ kind: 'hollow-hold', value: 40, unit: 'seconds' })));
});

test('a known reading kind is pinned to its unit', () => {
  assertCode(validateReading(aReading({ kind: 'plank-hold', unit: 'bpm' })), CODES.MISMATCH);
  assertCode(validateReading(aReading({ kind: 'heart-rate', unit: 'seconds' })), CODES.MISMATCH);
});

test('a kind the coach invents is accepted, because everything here is configurable', () => {
  assertValid(validateReading(aReading({ kind: 'farmers-carry-distance', unit: 'count' })));
  assertCode(validateReading(aReading({ kind: 'Farmers Carry' })), CODES.FORMAT);
});

test('a reading may be taken outside a session entirely', () => {
  const { session_id, ...standalone } = aReading();
  assertValid(validateReading({ ...standalone, context: 'standalone' }));
});

// ═══════════════════════════════════════════════════════════════════════════════
// IN-SESSION NOTE
// ═══════════════════════════════════════════════════════════════════════════════

test("a note may belong to one client, or to the session as a whole", () => {
  assertValid(validateSessionNote(aSessionNote()));
  const { client_id, ...sessionWide } = aSessionNote();
  assertValid(validateSessionNote(sessionWide));
});

test('an empty note is refused', () => {
  assertCode(validateSessionNote(aSessionNote({ text: '' })), CODES.REQUIRED);
});

// ═══════════════════════════════════════════════════════════════════════════════
// DIET PLAN
// ═══════════════════════════════════════════════════════════════════════════════

test('a diet plan validates as a week chart by day and hour', () => {
  assertValid(validateDietPlan(aDietPlan()));
});

test('a client accumulates a history of plans, so current and past are recorded facts', () => {
  assertValid(validateDietPlan(aDietPlan({
    status: 'past', effective_from: '2026-06-01', effective_to: '2026-07-19',
  })));
  assertValid(validateDietPlan(aDietPlan({ status: 'draft' })));
});

test('a day cannot appear twice, and there are at most seven of them', () => {
  assertCode(validateDietPlan(aDietPlan({
    days: [aDietPlan().days[0], aDietPlan().days[0]],
  })), CODES.DUPLICATE);
  assertCode(validateDietPlan(aDietPlan({
    days: Array.from({ length: 8 }, (_, i) => ({
      day: (i % 7) + 1, entries: [{ time: '08:00', items: ['Oats'] }],
    })),
  })), CODES.LENGTH);
});

test('an entry needs a valid time of day and at least one item', () => {
  assertCode(validateDietPlan(aDietPlan({
    days: [{ day: 1, entries: [{ time: '8am', items: ['Oats'] }] }],
  })), CODES.FORMAT);
  assertCode(validateDietPlan(aDietPlan({
    days: [{ day: 1, entries: [{ time: '08:00', items: [] }] }],
  })), CODES.LENGTH);
});

test('a plan cannot stop applying before it starts', () => {
  assertCode(validateDietPlan(aDietPlan({
    effective_from: '2026-07-20', effective_to: '2026-07-01',
  })), CODES.ORDERING);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Every validator is closed against unknown fields
// ═══════════════════════════════════════════════════════════════════════════════

test('every entity refuses an unknown field rather than silently dropping it', () => {
  const samples = {
    exercise: anExercise(), routine: aRoutine(), 'intensity-pattern': anIntensityPattern(),
    client: aClient(), session: aSession(), 'performed-record': aPerformedRecord(),
    reading: aReading(), 'session-note': aSessionNote(), 'diet-plan': aDietPlan(),
  };
  for (const [type, sample] of Object.entries(samples)) {
    const r = VALIDATORS[type]({ ...sample, definitely_not_a_field: 1 });
    assert.equal(r.ok, false, `${type} accepted an unknown field`);
    assert.ok(hasCode(r, CODES.UNKNOWN_FIELD), `${type}\n${formatIssues(r)}`);
  }
});

test('every validator refuses a non-object without throwing', () => {
  for (const [type, validate] of Object.entries(VALIDATORS)) {
    for (const bad of [null, undefined, 42, 'text', [], new Date()]) {
      const r = validate(bad);
      assert.equal(r.ok, false, `${type} accepted ${String(bad)}`);
    }
  }
});
