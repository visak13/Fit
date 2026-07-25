/**
 * THE ONE-DIRECTIONAL REFERENTIAL RULE, proved in BOTH directions.
 *
 * The forward direction is ordinary: a routine may only name exercises that exist.
 *
 * The reverse direction is the reason this file matters. An exercise that nothing references
 * is a NORMAL and PROTECTED state, and the tests below are written as assertions about
 * INTENT rather than as an incidental absence of a check. They exist to stop a future
 * importer, migration, reset or backup path from "tidying up" the unreferenced remainder of
 * the catalogue — which is not orphaned data, but the substitution pool the coach swaps to
 * mid-session and the intensity adapter draws from.
 *
 * If a change ever makes an unreferenced exercise into a finding, these tests fail. That is
 * their whole job. Do not relax them; the correct fix is to stop pruning.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkRoutineReferences, unreferencedExercises, referencedExerciseKeys,
  checkSessionReferences, checkLibraryIntegrity, duplicateContentKeys,
  indexByContentKey, REFERENTIAL_DIRECTION, SUBSTITUTION_POOL_NOTE,
} from './referential.js';
import { CODES, hasCode, formatIssues } from './issues.js';
import { anExercise, aTimedExercise, aRoutine, aSession, CLIENT_A, CLIENT_B } from './fixtures.js';

/** A catalogue deliberately larger than the week that uses it — exactly like the shipped one. */
const catalogue = () => [
  anExercise({ id: 'test-push-up' }),
  aTimedExercise({ id: 'test-plank' }),
  // The substitution bench: a regression, an equipment variant, a no-equipment alternative.
  anExercise({ id: 'test-knee-push-up', name: 'Test Knee Push Up', intensity: 'low' }),
  anExercise({ id: 'test-band-curl', name: 'Test Band Curl', equipment: ['resistance-band'] }),
  anExercise({ id: 'test-wall-push-up', name: 'Test Wall Push Up', equipment: ['wall'] }),
];

const week = () => [aRoutine({ entries: [{ exercise_id: 'test-push-up' }, { exercise_id: 'test-plank' }] })];

// ═══════════════════════════════════════════════════════════════════════════════
// DIRECTION ONE — ENFORCED: every exercise a routine names must exist
// ═══════════════════════════════════════════════════════════════════════════════

test('a routine naming only exercises that exist passes', () => {
  const r = checkRoutineReferences(week(), catalogue());
  assert.ok(r.ok, formatIssues(r));
});

test('a routine naming an exercise that does not exist is REFUSED', () => {
  const r = checkRoutineReferences(
    [aRoutine({ entries: [{ exercise_id: 'test-push-up' }, { exercise_id: 'no-such-exercise' }] })],
    catalogue(),
  );
  assert.equal(r.ok, false);
  assert.ok(hasCode(r, CODES.DANGLING_REFERENCE), formatIssues(r));
  assert.equal(r.issues.length, 1, 'exactly the dangling entry, nothing else');
  assert.match(r.issues[0].path, /entries\[1\]\.exercise_id$/);
});

test('the refusal names the routine and the position, so it can be found and fixed', () => {
  const r = checkRoutineReferences([aRoutine({
    id: 'test-pull-day', entries: [{ exercise_id: 'vanished-row' }],
  })], catalogue());
  assert.match(r.issues[0].path, /test-pull-day/);
  assert.match(r.issues[0].message, /vanished-row/);
});

test('every dangling reference is reported, not only the first', () => {
  const r = checkRoutineReferences([aRoutine({
    entries: [{ exercise_id: 'gone-one' }, { exercise_id: 'test-push-up' }, { exercise_id: 'gone-two' }],
  })], catalogue());
  assert.equal(r.issues.length, 2);
});

test('an override that contradicts the exercise measurement is caught here', () => {
  // A routine on its own cannot know this, which is why the check lives with the reference.
  const withDuration = checkRoutineReferences(
    [aRoutine({ entries: [{ exercise_id: 'test-push-up', duration_seconds: 30 }] })], catalogue(),
  );
  assert.ok(hasCode(withDuration, CODES.MISMATCH), formatIssues(withDuration));

  const withReps = checkRoutineReferences(
    [aRoutine({ entries: [{ exercise_id: 'test-plank', repetitions: 10 }] })], catalogue(),
  );
  assert.ok(hasCode(withReps, CODES.MISMATCH), formatIssues(withReps));

  const agreeing = checkRoutineReferences(
    [aRoutine({ entries: [{ exercise_id: 'test-push-up', sets: 5, rest_seconds: 90 }] })], catalogue(),
  );
  assert.ok(agreeing.ok, formatIssues(agreeing));
});

// ═══════════════════════════════════════════════════════════════════════════════
// DIRECTION TWO — NEVER ENFORCED: an exercise nothing references is normal
// ═══════════════════════════════════════════════════════════════════════════════

test('an exercise no routine references produces NO issue — this is the protected case', () => {
  const exercises = catalogue();
  const routines = week();

  // Three of five exercises are referenced by nothing at all.
  const unreferenced = unreferencedExercises(routines, exercises);
  assert.deepEqual(unreferenced, ['test-knee-push-up', 'test-band-curl', 'test-wall-push-up']);

  // And the integrity check says the library is fine, because it is.
  const r = checkRoutineReferences(routines, exercises);
  assert.ok(r.ok, `an unreferenced exercise must never be a finding\n${formatIssues(r)}`);
  assert.equal(r.issues.length, 0);
});

test('the reverse check is absent by INTENT, and the intent is recorded in the code', () => {
  // Asserting the absence of a check is worthless on its own — an absence looks identical
  // to an oversight. So the direction is a declared, testable value, and the reason the
  // reverse must never be enforced is stated where a future editor will read it.
  assert.equal(REFERENTIAL_DIRECTION.never_enforced.length, 3);
  assert.match(REFERENTIAL_DIRECTION.never_enforced[0], /substitution pool/);
  assert.match(SUBSTITUTION_POOL_NOTE, /never be pruned/);
  assert.match(REFERENTIAL_DIRECTION.rule, /Being referenced by nothing is never an error/);
});

test('a library where NOTHING is referenced is still a valid library', () => {
  // A coach who deletes every routine and keeps his exercises has not broken anything.
  const r = checkLibraryIntegrity({ exercises: catalogue(), routines: [] });
  assert.ok(r.ok, formatIssues(r));
  assert.equal(unreferencedExercises([], catalogue()).length, 5);
});

test('the whole catalogue survives a round trip that keeps only what is referenced — and that is the bug', () => {
  // This is the mistake the rule exists to prevent, written out so it is unmistakable.
  const exercises = catalogue();
  const routines = week();
  const referenced = referencedExerciseKeys(routines);

  const wrongImporter = exercises.filter((e) => referenced.has(e.id));
  const rightImporter = exercises;

  assert.equal(wrongImporter.length, 2);
  assert.equal(rightImporter.length, 5);
  assert.ok(rightImporter.length > wrongImporter.length,
    'an importer that keeps only referenced exercises silently deletes the substitution pool');

  // And the surplus is exactly what a mid-session substitution would reach for.
  const pool = unreferencedExercises(routines, exercises);
  assert.ok(pool.includes('test-knee-push-up'), 'the regression a tired client needs');
  assert.ok(pool.includes('test-wall-push-up'), 'the alternative for a client with nothing at home');
});

test('checkLibraryIntegrity reports duplicates and dangling references, and nothing else', () => {
  const r = checkLibraryIntegrity({
    exercises: [...catalogue(), anExercise({ id: 'test-push-up' })],
    routines: [aRoutine({ entries: [{ exercise_id: 'not-here' }] })],
  });
  assert.ok(hasCode(r, CODES.DUPLICATE), formatIssues(r));
  assert.ok(hasCode(r, CODES.DANGLING_REFERENCE), formatIssues(r));
  assert.equal(r.issues.length, 2);
});

test('duplicate content keys within one kind are found; across kinds they are separate namespaces', () => {
  assert.deepEqual(duplicateContentKeys([anExercise(), anExercise()]), ['test-push-up']);
  assert.deepEqual(duplicateContentKeys(catalogue()), []);
  // An exercise and a routine may legitimately share a key string.
  const r = checkLibraryIntegrity({
    exercises: [anExercise({ id: 'shared-key' })],
    routines: [aRoutine({ id: 'shared-key', entries: [{ exercise_id: 'shared-key' }] })],
  });
  assert.ok(r.ok, formatIssues(r));
});

test('indexByContentKey returns the record, not merely the key', () => {
  const index = indexByContentKey(catalogue());
  assert.equal(index.get('test-plank').measurement, 'time');
  assert.equal(index.get('nope'), undefined);
});

// ═══════════════════════════════════════════════════════════════════════════════
// The same discipline, applied to the app's own records
// ═══════════════════════════════════════════════════════════════════════════════

test("a session's routine and clients must all resolve", () => {
  const known = { routineIds: ['test-push-day'], clientIds: [CLIENT_A, CLIENT_B] };
  const good = checkSessionReferences([aSession({ client_ids: [CLIENT_A, CLIENT_B] })], known);
  assert.ok(good.ok, formatIssues(good));

  const badRoutine = checkSessionReferences([aSession({ routine_id: 'deleted-routine' })], known);
  assert.ok(hasCode(badRoutine, CODES.DANGLING_REFERENCE), formatIssues(badRoutine));

  const badClient = checkSessionReferences(
    [aSession({ client_ids: ['99999999-9999-4999-8999-999999999999'] })], known,
  );
  assert.ok(hasCode(badClient, CODES.DANGLING_REFERENCE), formatIssues(badClient));
});

test('a client who has never attended a session, and a routine never run, are both normal', () => {
  // The reverse direction again, on the app's own records: no session, no problem.
  const r = checkSessionReferences([], {
    routineIds: ['test-push-day', 'never-run-routine'],
    clientIds: [CLIENT_A, CLIENT_B],
  });
  assert.ok(r.ok, formatIssues(r));
  assert.equal(r.issues.length, 0);
});

test('session references can be checked with the records still in their envelopes', () => {
  const enveloped = [{ record_id: 'x', content: aSession() }];
  const r = checkSessionReferences(enveloped, { routineIds: ['test-push-day'], clientIds: [CLIENT_A] });
  assert.ok(r.ok, formatIssues(r));
});
