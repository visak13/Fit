/**
 * THE DOCUMENT — what a backup carries, what it refuses to carry, and what it will not guess at.
 *
 * The end-to-end proof that a practice survives a round trip lives in `core/backup/restore.test.js`,
 * against a real store. This suite is the pure half: the shapes, the refusals, and the two file
 * layouts one reader has to recognise.
 *
 * ## THE REFUSALS ARE THE POINT
 *
 * Everything here that throws, throws because the alternative is a file that OPENS CLEANLY and is
 * wrong — a backup missing a kind nobody fetched, an empty file that says the practice is safe, an
 * app-authored record with no identity that would be restored as a session belonging to nobody. Each
 * of those is an absence that looks exactly like a pass, and none of them errors on its own.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aClient, aDietPlan, anExercise, anIntensityPattern, aRoutine, aSession, CLIENT_A, CLIENT_B,
  SESSION_1,
} from '../model/fixtures.js';
import {
  BACKUP_DOCUMENT, BACKUP_KINDS, BACKUP_VERSION, backupCounts, backupParts, backupReferenceIssues,
  MANIFEST_PART, readBackupParts, readBackupSet,
} from './restorable-backup.js';

const TAKEN = '2026-08-01T09:00:00.000Z';

/** An envelope as the store hands one over. */
const enveloped = (type, content, over = {}) => ({
  record_id: `${type}-1`,
  type,
  rev: 1,
  device: 'coach-laptop',
  deleted: false,
  deleted_at: null,
  created_at: TAKEN,
  updated_at: TAKEN,
  resolved_from: null,
  content,
  ...over,
});

/**
 * Every kind present, which is the only shape `readBackupSet` accepts. Overrides MERGE into the
 * kinds rather than replacing them, so a test states the one kind it cares about and stays complete.
 */
function aSet({ kinds: overrides = {}, ...rest } = {}) {
  /** @type {Record<string, any[]>} */
  const kinds = {};
  for (const kind of BACKUP_KINDS) kinds[kind] = [];
  kinds.exercise = [enveloped('exercise', anExercise({ id: 'coach-floor-press' }))];
  kinds.client = [enveloped('client', aClient({ name: 'Alex Fixture' }))];
  return {
    kinds: { ...kinds, ...overrides }, taken_at: TAKEN, device: 'coach-laptop', ...rest,
  };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// What it refuses to write
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('A MISSING KIND IS A REFUSAL, NOT AN EMPTY SECTION — and the refusal NAMES it', () => {
  const set = aSet();
  delete set.kinds['diet-plan'];
  delete set.kinds.reading;

  assert.throws(() => readBackupSet(set), (error) => {
    assert.ok(error instanceof TypeError);
    assert.match(error.message, /diet-plan/);
    assert.match(error.message, /reading/);
    return true;
  });

  // The distinction being drawn: an EMPTY kind is legitimate and must not be refused. The coach may
  // genuinely have no diet plans yet, and that is an ordinary practice.
  const withEmpties = aSet();
  assert.doesNotThrow(() => readBackupSet(withEmpties));
  assert.equal(backupCounts(withEmpties).per_kind['diet-plan'], 0);
});

test('THE KIND LIST IS THE MODEL\'S OWN, so a tenth record kind arrives here without anybody remembering', async () => {
  const { RECORD_TYPES } = await import('../model/vocabularies.js');
  assert.deepEqual([...BACKUP_KINDS], [...RECORD_TYPES]);
  assert.ok(BACKUP_KINDS.length >= 9, 'the list is not empty, so the equality above means something');
});

test('A PRACTICE THAT IS EMPTY IN EVERY KIND AT ONCE IS REFUSED', () => {
  /** @type {Record<string, any[]>} */
  const kinds = {};
  for (const kind of BACKUP_KINDS) kinds[kind] = [];

  assert.throws(() => backupParts({ kinds, taken_at: TAKEN }), /nothing in this practice/i);

  // AND THE RULE IS "THE WHOLE SELECTION", NOT "ANY KIND". A practice with clients but no diet plans
  // yet is an ordinary practice and its backup is a real backup — refusing it would make the feature
  // unusable for exactly the coach who most needs it.
  assert.doesNotThrow(() => backupParts({
    kinds: { ...kinds, client: [enveloped('client', aClient())] }, taken_at: TAKEN,
  }));
});

test('THE INSTANT IS THE CALLER\'S; this package holds no clock', () => {
  const set = aSet();
  delete set.taken_at;
  assert.throws(() => readBackupSet(set), /when it was taken/);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// What it writes
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('THE MANIFEST HOLDS ENVELOPES, not content — identity is what everything else points at', () => {
  const parts = backupParts(aSet());
  const manifest = JSON.parse(parts.find((part) => part.name === MANIFEST_PART).text);

  assert.equal(manifest.backup_document, BACKUP_DOCUMENT);
  assert.equal(manifest.backup_version, BACKUP_VERSION);
  assert.equal(manifest.taken_at, TAKEN);

  const client = manifest.kinds.client[0];
  assert.equal(client.record_id, 'client-1', 'without this a restored session belongs to nobody');
  assert.equal(client.rev, 1);
  assert.equal(client.content.name, 'Alex Fixture');
});

test('THE READABLE HALF IS DERIVED FROM THE RECORDS, so a field added next year is in the next backup', () => {
  const set = aSet({
    kinds: { client: [enveloped('client', aClient({ name: 'Alex Fixture', a_field_invented_today: 'yes' }))] },
  });
  const csv = backupParts(set).find((part) => part.name === 'client.csv').text;

  assert.match(csv, /a_field_invented_today/, 'the columns are discovered, not typed');
  assert.match(csv, /Alex Fixture/);
});

test('every kind has a readable part, including the empty ones', () => {
  const names = backupParts(aSet()).map((part) => part.name);
  assert.equal(names[0], MANIFEST_PART, 'the faithful copy first, because that is what the file is FOR');
  for (const kind of BACKUP_KINDS) assert.ok(names.includes(`${kind}.csv`), `${kind} has no readable part`);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Reading both shapes, and refusing anything else
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('THE FULL SHAPE READS BACK, tombstones and all', () => {
  const set = aSet({
    kinds: {
      client: [
        enveloped('client', aClient({ name: 'Staying Fixture' }), { record_id: 'staying' }),
        enveloped('client', null, { record_id: 'leaving', deleted: true, deleted_at: TAKEN, rev: 2 }),
      ],
    },
  });
  const parts = Object.fromEntries(backupParts(set).map((part) => [part.name, part.text]));
  const read = readBackupParts(parts);

  assert.equal(read.shape, 'full');
  assert.equal(read.taken_at, TAKEN);
  assert.equal(read.records.client.length, 2, 'the deletion is a record and it is still here');

  const leaving = read.records.client.find((record) => record.record_id === 'leaving');
  assert.equal(leaving.deleted, true);
  assert.equal(leaving.content, null, 'a tombstone carries no payload, and reading one as content would invent it');

  // The living half only, for the referential check: a tombstone references nothing.
  assert.equal(read.content.client.length, 1);
  assert.equal(read.content.client[0].name, 'Staying Fixture');

  // ...but its IDENTITY is still known, because a session may legitimately name a departed client.
  assert.deepEqual(read.identities.client, ['staying', 'leaving']);
});

test('THE LIBRARY SHAPE — the file the reset offer already saves — READS BACK TOO', () => {
  // Bare content, no manifest, no envelopes. This shape predates the manifest and is the one that
  // actually stands between the coach and a mis-tapped reset.
  const read = readBackupParts({
    'exercise.json': JSON.stringify([anExercise({ id: 'coach-floor-press' })]),
    'routine.json': JSON.stringify([aRoutine({ id: 'coach-tuesday' })]),
    'intensity-pattern.json': JSON.stringify([anIntensityPattern({ id: 'coach-ramp' })]),
    'exercise.csv': 'id\r\ncoach-floor-press\r\n',
  });

  assert.equal(read.shape, 'library');
  assert.deepEqual([...read.covers], ['exercise', 'routine', 'intensity-pattern']);
  assert.equal(read.content.exercise[0].id, 'coach-floor-press');
  assert.deepEqual(read.identities.exercise, [null], 'library content is found by its CONTENT KEY, not an envelope');
});

test('A LIBRARY FILE MISSING A KIND IS REFUSED, or it restores a library missing part of itself', () => {
  assert.throws(() => readBackupParts({
    'exercise.json': '[]',
    'routine.json': '[]',
  }), /intensity-pattern/);
});

test('AN APP-AUTHORED RECORD WITH NO IDENTITY IS REFUSED rather than given an invented one', () => {
  const set = aSet();
  const parts = Object.fromEntries(backupParts(set).map((part) => [part.name, part.text]));
  const manifest = JSON.parse(parts[MANIFEST_PART]);
  delete manifest.kinds.client[0].record_id;
  parts[MANIFEST_PART] = JSON.stringify(manifest);

  assert.throws(() => readBackupParts(parts), /carries no identity/);
});

test('A VERSION THIS CODE DOES NOT KNOW IS REFUSED rather than guessed at', () => {
  assert.throws(
    () => readBackupParts({ [MANIFEST_PART]: JSON.stringify({ backup_document: BACKUP_DOCUMENT, backup_version: 99, kinds: {} }) }),
    /version 99/,
  );
});

test('A FILE THAT IS NOT ONE OF OURS IS REFUSED BY NAME, saying what a backup holds', () => {
  assert.throws(() => readBackupParts({ 'something-else.json': '[]' }), /not a backup this application wrote/);
  assert.throws(() => readBackupParts({}), /not a backup this application wrote/);
  assert.throws(() => readBackupParts({ [MANIFEST_PART]: 'not json' }), /not readable/);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// The referential gate — the MODEL'S check, called
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('A DANGLING EXERCISE IS FOUND, and the union with the target is what decides it', () => {
  const read = readBackupParts({
    'exercise.json': '[]',
    'routine.json': JSON.stringify([aRoutine({ id: 'coach-tuesday', entries: [{ exercise_id: 'coach-floor-press', sets: 3, repetitions: 10 }] })]),
    'intensity-pattern.json': '[]',
  });

  const alone = backupReferenceIssues(read);
  assert.equal(alone.ok, false);
  assert.match(alone.issues[0].message, /coach-floor-press/);

  // THE LOOSENING DIRECTION: a gate that refuses everything is not a gate. The same file is fine
  // where the target already holds what it names, because the union is what the store WILL hold.
  const withTarget = backupReferenceIssues(read, { exercises: [anExercise({ id: 'coach-floor-press' })] });
  assert.equal(withTarget.ok, true);
});

test('A SESSION NAMING A CLIENT NOBODY HAS IS FOUND TOO', () => {
  const set = aSet({
    kinds: {
      exercise: [enveloped('exercise', anExercise({ id: 'coach-floor-press' }))],
      routine: [enveloped('routine', aRoutine({
        id: 'coach-tuesday', entries: [{ exercise_id: 'coach-floor-press', sets: 3, repetitions: 10 }],
      }))],
      client: [enveloped('client', aClient(), { record_id: CLIENT_A })],
      session: [enveloped('session', aSession({
        routine_id: 'coach-tuesday', client_ids: [CLIENT_A, CLIENT_B],
      }), { record_id: SESSION_1 })],
    },
  });
  const read = readBackupParts(Object.fromEntries(backupParts(set).map((p) => [p.name, p.text])));

  const missing = backupReferenceIssues(read);
  assert.equal(missing.ok, false, 'CLIENT_B is in no half of this');

  const present = backupReferenceIssues(read, { clientIds: [CLIENT_B] });
  assert.equal(present.ok, true);
});

test('NOTHING IS PRUNED: an exercise in the target that the backup does not carry survives the union', () => {
  // The substitution pool. An unreferenced exercise is a NORMAL state and pruning it is a defect,
  // so the union must not quietly drop what only one side has.
  const read = readBackupParts({
    'exercise.json': JSON.stringify([anExercise({ id: 'coach-floor-press' })]),
    'routine.json': JSON.stringify([aRoutine({ id: 'coach-tuesday', entries: [{ exercise_id: 'coach-band-curl', sets: 3, repetitions: 10 }] })]),
    'intensity-pattern.json': '[]',
  });

  const result = backupReferenceIssues(read, { exercises: [anExercise({ id: 'coach-band-curl' })] });
  assert.equal(result.ok, true, 'the target-only exercise was dropped from the union it should be in');
});

test('a diet plan and a session note ride along without needing a reference of their own', () => {
  const set = aSet({
    kinds: {
      client: [enveloped('client', aClient(), { record_id: CLIENT_A })],
      'diet-plan': [enveloped('diet-plan', aDietPlan({ client_id: CLIENT_A }), { record_id: 'diet-1' })],
    },
  });
  const read = readBackupParts(Object.fromEntries(backupParts(set).map((p) => [p.name, p.text])));

  assert.equal(backupReferenceIssues(read).ok, true);
  assert.equal(read.content['diet-plan'][0].client_id, CLIENT_A);
});
