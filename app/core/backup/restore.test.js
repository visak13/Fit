/**
 * THE ACCEPTANCE: A BACKUP IS RESTORABLE, PROVED BY RESTORING IT.
 *
 * The claim this suite exists to make is not "a file was written" and not "the writer returned
 * something plausible". It is that a practice goes into a file and COMES BACK OUT OF IT, into a
 * store that never held it, equal to what went in. The only way to know which kind of file has been
 * built is to read it back, so that is what happens here.
 *
 * ## THE FRESH STORE IS THE POINT, NOT A DETAIL
 *
 * Every restore below lands in a store opened on its OWN world — a different simulated device, with
 * its own database. Restoring into the store that produced the backup would prove nothing: the
 * records are already there, and every assertion would pass against data the restore never wrote.
 *
 * ## THE FIXTURES ARE NOT DERIVED FROM SEED CONTENT, DELIBERATELY
 *
 * `markEdited` over shipped content returns `shipped-edited`, so a record built as
 * `{...SHIPPED[0], id, name}` to stand in as the coach's own carries `shipped-untouched` through and
 * is a record THE NEXT RESET REVERTS. A suite composed that way proves its restore against records
 * that are not what it thinks they are. Everything here is built from `core/model/fixtures.js`,
 * which is not seed content, and anything standing in as the coach's own says `coach-created`.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aClient, aDietPlan, anExercise, anIntensityPattern, aPerformedRecord, aReading, aRoutine,
  aSession, aSessionNote,
} from '../model/fixtures.js';
import { openLocalStore } from '../store/local-store.js';
import { createLaptop } from '../store/testing/platform-double.js';
import { storeOnlyZip } from '../export/zip.js';
import { backupParts } from '../artefacts/restorable-backup.js';
import { collectBackup, walkToTheEnd } from './collect.js';
import { readBackupFile, RestoreRefused, restoreBackup } from './restore.js';

const NOW = '2026-08-01T09:00:00.000Z';
const LATER = '2026-08-02T09:00:00.000Z';

/** A store on its OWN device. Two calls give two genuinely separate databases. */
async function aStore(device = 'coach-laptop') {
  const { platform } = createLaptop();
  return openLocalStore({ platform, device });
}

/** The coach's own content, not the shipped library's. */
const COACH = { provenance: 'coach-created' };

/**
 * A practice: three library kinds, two clients, a session they both attended, and the records that
 * hang off it. Returns what was written so the restore can be compared against it.
 * @param {import('../store/local-store.js').LocalStore} store
 */
async function aPractice(store) {
  const exercise = await store.create('exercise', anExercise({ id: 'coach-floor-press', name: 'Floor Press', ...COACH }));
  const otherExercise = await store.create('exercise', anExercise({
    id: 'coach-band-curl', name: 'Band Curl', ...COACH,
  }));
  const routine = await store.create('routine', aRoutine({
    id: 'coach-tuesday', name: 'Tuesday', entries: [{ exercise_id: 'coach-floor-press', sets: 3, repetitions: 10 }], ...COACH,
  }));
  const pattern = await store.create('intensity-pattern', anIntensityPattern({
    id: 'coach-ramp', name: 'Coach Ramp', ...COACH,
  }));

  const clientA = await store.create('client', aClient({ name: 'Alex Fixture', notes: 'Prefers mornings.' }));
  const clientB = await store.create('client', aClient({ name: 'Bo Fixture' }));

  // ONE session with TWO attendees. This is the record that a per-client walk returns twice, and the
  // reason the collector walks an index over which that cannot happen.
  const session = await store.create('session', aSession({
    routine_id: 'coach-tuesday',
    client_ids: [clientA.record_id, clientB.record_id],
    status: 'completed',
    mode: 'in_person',
    started_at: NOW,
    ended_at: NOW,
  }));

  const performed = await store.create('performed-record', aPerformedRecord({
    session_id: session.record_id, client_id: clientA.record_id, exercise_id: 'coach-floor-press',
  }));
  const reading = await store.create('reading', aReading({
    session_id: session.record_id, client_id: clientB.record_id,
  }));
  const note = await store.create('session-note', aSessionNote({
    session_id: session.record_id, client_id: clientA.record_id,
  }));
  const diet = await store.create('diet-plan', aDietPlan({ client_id: clientA.record_id }));

  return {
    exercise, otherExercise, routine, pattern, clientA, clientB, session, performed, reading, note, diet,
  };
}

/** Every living record of a kind, content only, keyed so two stores can be compared. */
async function contentByKey(store, kind, keyOf) {
  const records = (await walkToTheEnd(store, kind)).filter((record) => record.deleted !== true);
  return new Map(records.map((record) => [keyOf(record), record.content]));
}

const byContentKey = (record) => record.content.id;
const byIdentity = (record) => record.record_id;

/** How a kind is identified, which is the model's own split and not this suite's choice. */
const KEYED_BY = {
  exercise: byContentKey,
  routine: byContentKey,
  'intensity-pattern': byContentKey,
  client: byIdentity,
  session: byIdentity,
  'performed-record': byIdentity,
  reading: byIdentity,
  'session-note': byIdentity,
  'diet-plan': byIdentity,
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
// The acceptance
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('A PRACTICE GOES INTO A FILE AND COMES BACK OUT OF IT, into a store that never held it', async () => {
  const source = await aStore('coach-laptop');
  await aPractice(source);

  const set = await collectBackup(source, { taken_at: NOW });
  const bytes = storeOnlyZip(backupParts(set));

  // A DIFFERENT DEVICE, a different database, holding nothing.
  const fresh = await aStore('coach-phone');
  for (const kind of Object.keys(KEYED_BY)) {
    assert.equal(await fresh.count(kind), 0, `${kind} must be empty before the restore, or this proves nothing`);
  }

  const read = readBackupFile(bytes);
  const result = await restoreBackup(fresh, read, { now: LATER });

  assert.equal(result.shape, 'full');
  assert.ok(result.written > 0, 'a restore that wrote nothing is not a restore');

  // THE LOAD-BEARING ASSERTION, FIRST, so no earlier tally can shadow it: every kind, equal.
  for (const [kind, keyOf] of Object.entries(KEYED_BY)) {
    const went = await contentByKey(source, kind, keyOf);
    const came = await contentByKey(fresh, kind, keyOf);

    assert.deepEqual(
      [...came.keys()].sort(), [...went.keys()].sort(),
      `the ${kind} records that came back are not the ones that went in`,
    );
    for (const [key, content] of went) {
      assert.deepEqual(came.get(key), content, `${kind} ${key} came back different from how it went in`);
    }
  }

  // NON-VACUITY: the comparison above passes trivially if every kind is empty. It is not.
  const counts = await Promise.all(Object.keys(KEYED_BY).map((kind) => fresh.count(kind)));
  for (const [index, kind] of Object.keys(KEYED_BY).entries()) {
    assert.ok(counts[index] > 0, `${kind} restored nothing, so its equality assertion proved nothing`);
  }
});

test('THE SHARED SESSION IS RESTORED ONCE, not once per attendee', async () => {
  const source = await aStore('coach-laptop');
  const made = await aPractice(source);
  assert.equal(made.session.content.client_ids.length, 2, 'the fixture must actually be shared');

  const set = await collectBackup(source, { taken_at: NOW });
  const fresh = await aStore('coach-phone');
  await restoreBackup(fresh, readBackupFile(storeOnlyZip(backupParts(set))), { now: LATER });

  assert.equal(await fresh.count('session'), 1);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE TWO COUNTS. `kinds` is the rows this restore wrote; `live` is what the coach will then see.
//
// A backup carries tombstones — a deletion is a write, never an absence — so on any library that
// has had something removed the two DIVERGE, and anything shown to the coach must read `live`.
// This is the contract; `src/screens/restore-backup.test.ts` proves the sentence that consumes it.
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('A RESTORE REPORTS ROWS AND LIVE RECORDS SEPARATELY, because tombstones make them different numbers', async () => {
  const source = await aStore('coach-laptop');
  await aPractice(source);
  const departing = await source.create('exercise', anExercise({ id: 'coach-gone', ...COACH }));
  await source.tombstone('exercise', departing.record_id);

  const set = await collectBackup(source, { taken_at: NOW });
  const fresh = await aStore('coach-phone');
  const result = await restoreBackup(fresh, readBackupFile(storeOnlyZip(backupParts(set))), { now: LATER });

  // THE FIXTURE IS THE MECHANISM, so it is asserted rather than assumed.
  assert.equal(result.kinds.exercise, 3, 'three exercise ROWS went back, one of them a tombstone');
  assert.equal(result.live.exercise, 2, 'and two of them are records he can see');

  // AND `live` IS WHAT THE LISTS HOLD, read back out of the store rather than recomputed here.
  const showing = (await walkToTheEnd(fresh, 'exercise')).filter((record) => record.deleted !== true);
  assert.equal(showing.length, result.live.exercise, 'live must equal what a list of exercises returns');

  // The tombstone still LANDED: counting it out of the report is not dropping it from the restore.
  assert.equal(await fresh.count('exercise'), 3, 'the removal must reach this device too');
});

test('and on a library that has deleted nothing the two counts agree, which is why rows survived this long', async () => {
  const source = await aStore('coach-laptop');
  await aPractice(source);

  const set = await collectBackup(source, { taken_at: NOW });
  const fresh = await aStore('coach-phone');
  const result = await restoreBackup(fresh, readBackupFile(storeOnlyZip(backupParts(set))), { now: LATER });

  for (const kind of Object.keys(KEYED_BY)) {
    assert.equal(result.live[kind], result.kinds[kind], `${kind}: no tombstones, so nothing to differ over`);
    assert.ok(result.kinds[kind] > 0, `${kind} restored nothing, so its equality proved nothing`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// The referential gate
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('A BACKUP WHOSE ROUTINE NAMES AN EXERCISE THE TARGET DOES NOT HAVE IS REFUSED, and nothing is written', async () => {
  const source = await aStore('coach-laptop');
  await source.create('exercise', anExercise({ id: 'coach-floor-press', name: 'Floor Press', ...COACH }));
  await source.create('routine', aRoutine({
    id: 'coach-tuesday', entries: [{ exercise_id: 'coach-floor-press', sets: 3, repetitions: 10 }], ...COACH,
  }));
  await source.create('intensity-pattern', anIntensityPattern({ id: 'coach-ramp', ...COACH }));

  const set = await collectBackup(source, { taken_at: NOW });

  // The exercise is REMOVED FROM THE FILE. This is the measured case: a backup taken from a healthy
  // library, replayed where the exercises differ.
  set.kinds.exercise = [];

  const fresh = await aStore('coach-phone');
  const read = readBackupFile(storeOnlyZip(backupParts(set)));

  const refusal = await restoreBackup(fresh, read, { now: LATER }).then(
    () => { throw new Error('the restore was accepted, and it should have been refused'); },
    (error) => error,
  );

  assert.ok(refusal instanceof RestoreRefused, `refused with ${refusal.name}: ${refusal.message}`);
  assert.match(refusal.message, /coach-floor-press/, 'the refusal must NAME what is missing, or it is a dead end');
  assert.ok(refusal.issues.length > 0);

  // NOTHING WAS WRITTEN. A refusal that had already committed half the file would be worse than no
  // check at all, because the coach would be told it failed while holding part of it.
  for (const kind of Object.keys(KEYED_BY)) {
    assert.equal(await fresh.count(kind), 0, `${kind} was written despite the refusal`);
  }
});

test('THE SAME BACKUP IS ACCEPTED where the target already holds the exercise', async () => {
  const source = await aStore('coach-laptop');
  await source.create('exercise', anExercise({ id: 'coach-floor-press', name: 'Floor Press', ...COACH }));
  await source.create('routine', aRoutine({
    id: 'coach-tuesday', entries: [{ exercise_id: 'coach-floor-press', sets: 3, repetitions: 10 }], ...COACH,
  }));
  await source.create('intensity-pattern', anIntensityPattern({ id: 'coach-ramp', ...COACH }));

  const set = await collectBackup(source, { taken_at: NOW });
  set.kinds.exercise = [];

  // The discriminator, in the LOOSENING direction: a gate that refuses everything is not a gate.
  const fresh = await aStore('coach-phone');
  await fresh.create('exercise', anExercise({ id: 'coach-floor-press', name: 'Floor Press', ...COACH }));

  const result = await restoreBackup(fresh, readBackupFile(storeOnlyZip(backupParts(set))), { now: LATER });
  assert.ok(result.written > 0, 'the routine must land when what it names is already there');
  assert.equal(await fresh.count('routine'), 1);
});

test('A ROUTINE OVERRIDE THAT CONTRADICTS ITS EXERCISE IS REFUSED BY THE SAME CALL', async () => {
  // The measurement-agreement half of `checkRoutineReferences`, reached through the restore rather
  // than called directly — which is what proves the restore is calling the model's check and not a
  // narrower one of its own.
  const source = await aStore('coach-laptop');
  await source.create('exercise', anExercise({
    id: 'coach-plank', name: 'Plank', measurement: 'time', ...COACH,
    default_prescription: { sets: 3, duration_seconds: 45 },
    scaling: {
      low: { sets: 2, duration_seconds: 30, rest_seconds: 60 },
      medium: { sets: 3, duration_seconds: 45, rest_seconds: 45 },
      high: { sets: 4, duration_seconds: 60, rest_seconds: 30 },
    },
  }));
  await source.create('routine', aRoutine({
    id: 'coach-core', entries: [{ exercise_id: 'coach-plank', sets: 3, repetitions: 12 }], ...COACH,
  }));
  await source.create('intensity-pattern', anIntensityPattern({ id: 'coach-ramp', ...COACH }));

  const set = await collectBackup(source, { taken_at: NOW });
  const fresh = await aStore('coach-phone');

  await assert.rejects(
    () => restoreBackup(fresh, readBackupFile(storeOnlyZip(backupParts(set))), { now: LATER }),
    (error) => error instanceof RestoreRefused && /repetition override/.test(error.message),
  );
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Restoring is a WRITE, and it must win the next synchronisation
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('EVERY RESTORED RECORD IS WRITTEN AT A REVISION STRICTLY HIGHER than the one it replaces', async () => {
  const source = await aStore('coach-laptop');
  await source.create('exercise', anExercise({ id: 'coach-floor-press', name: 'Floor Press', ...COACH }));
  await source.create('routine', aRoutine({
    id: 'coach-tuesday', entries: [{ exercise_id: 'coach-floor-press', sets: 3, repetitions: 10 }], ...COACH,
  }));
  await source.create('intensity-pattern', anIntensityPattern({ id: 'coach-ramp', ...COACH }));
  const set = await collectBackup(source, { taken_at: NOW });

  // A target that has since been EDITED, several times, so its revisions are ahead of the file's.
  const target = await aStore('coach-phone');
  const existing = await target.create('exercise', anExercise({ id: 'coach-floor-press', name: 'Floor Press', ...COACH }));
  await target.update('exercise', existing.record_id, (content) => ({ ...content, name: 'Renamed once' }));
  const before = await target.update('exercise', existing.record_id, (content) => ({ ...content, name: 'Renamed twice' }));
  assert.equal(before.rev, 3, 'the fixture must actually be ahead, or the assertion below is free');

  await restoreBackup(target, readBackupFile(storeOnlyZip(backupParts(set))), { now: LATER });

  const after = await target.getByContentKey('exercise', 'coach-floor-press');
  assert.ok(
    after.rev > before.rev,
    `the restore wrote revision ${after.rev} over ${before.rev}; the next sync would push the edits back`,
  );
  assert.equal(after.content.name, 'Floor Press', 'and it is the backup that won, not the edit');
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// A deletion is a record, and it survives the round trip as one
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('A CLIENT THE COACH REMOVED DOES NOT COME BACK FROM THE DEAD through a restore', async () => {
  const source = await aStore('coach-laptop');
  await source.create('exercise', anExercise({ id: 'coach-floor-press', ...COACH }));
  await source.create('routine', aRoutine({
    id: 'coach-tuesday', entries: [{ exercise_id: 'coach-floor-press', sets: 3, repetitions: 10 }], ...COACH,
  }));
  await source.create('intensity-pattern', anIntensityPattern({ id: 'coach-ramp', ...COACH }));
  const staying = await source.create('client', aClient({ name: 'Staying Fixture' }));
  const leaving = await source.create('client', aClient({ name: 'Leaving Fixture' }));
  await source.tombstone('client', leaving.record_id);

  const set = await collectBackup(source, { taken_at: NOW });
  const fresh = await aStore('coach-phone');
  await restoreBackup(fresh, readBackupFile(storeOnlyZip(backupParts(set))), { now: LATER });

  const restoredStaying = await fresh.get('client', staying.record_id);
  const restoredLeaving = await fresh.get('client', leaving.record_id);

  assert.equal(restoredStaying.deleted, false);
  assert.ok(restoredLeaving, 'the tombstone itself must be restored, or the next pull resurrects them');
  assert.equal(restoredLeaving.deleted, true);
  assert.equal(restoredLeaving.content, null, 'and it carries no payload');
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE FILE THE RESET ALREADY OFFERS — the gap this whole action exists to close
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('THE LIBRARY FILE THE RESET OFFER SAVES IS RESTORABLE, which is what makes the offer an undo', async () => {
  // Built exactly as `src/screens/reset-to-defaults-source.ts` builds it: `libraryBackupParts` into
  // `storeOnlyZip`, with no manifest and no envelopes. If this shape ever stops being restorable,
  // the sentence the confirmation shows the coach becomes false, and this test is what says so.
  const { libraryBackupParts } = await import('../artefacts/library-backup.js');

  const source = await aStore('coach-laptop');
  await source.create('exercise', anExercise({ id: 'coach-floor-press', name: 'Floor Press', ...COACH }));
  await source.create('routine', aRoutine({
    id: 'coach-tuesday', name: 'Tuesday', entries: [{ exercise_id: 'coach-floor-press', sets: 3, repetitions: 10 }], ...COACH,
  }));
  await source.create('intensity-pattern', anIntensityPattern({ id: 'coach-ramp', name: 'Coach Ramp', ...COACH }));

  const library = {
    exercise: await walkToTheEnd(source, 'exercise'),
    routine: await walkToTheEnd(source, 'routine'),
    'intensity-pattern': await walkToTheEnd(source, 'intensity-pattern'),
  };
  const bytes = storeOnlyZip(libraryBackupParts(library));

  const fresh = await aStore('coach-phone');
  const read = readBackupFile(bytes);
  assert.equal(read.shape, 'library', 'the reset file is the library shape, and it must be recognised as one');

  const result = await restoreBackup(fresh, read, { now: LATER });
  assert.equal(result.written, 3);

  for (const [kind, key, name] of [
    ['exercise', 'coach-floor-press', 'Floor Press'],
    ['routine', 'coach-tuesday', 'Tuesday'],
    ['intensity-pattern', 'coach-ramp', 'Coach Ramp'],
  ]) {
    const restored = await fresh.getByContentKey(kind, key);
    assert.ok(restored, `${kind} ${key} did not come back`);
    assert.equal(restored.content.name, name);
    assert.equal(restored.content.provenance, 'coach-created', 'his own work came back as his own');
  }
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE HONEST LIMIT, ASSERTED RATHER THAN ONLY WRITTEN DOWN
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('A SEALED MEDICAL REMINDER SURVIVES THE ROUND TRIP AS CIPHERTEXT — carried, never opened, never lost', async () => {
  // WHY THIS IS A TEST AND NOT A PARAGRAPH. `src/screens/backup-archive.ts` tells the coach, in the
  // words he reads before he decides, that his medical reminders travel inside the copy still locked
  // under the key his devices share — so on a device that has never adopted that key everything else
  // comes back and those do not. Prose rots silently; a coach restoring onto a borrowed laptop after
  // losing his phone is exactly the person who must not discover this by meeting a row he cannot
  // read. If the behaviour ever changes in EITHER direction — the field stops travelling, or starts
  // arriving readable — this goes red and that sentence gets rewritten rather than going quietly
  // wrong.
  const { aSealedValue } = await import('../model/fixtures.js');
  const sealed = aSealedValue();

  const source = await aStore('coach-laptop');
  await source.create('exercise', anExercise({ id: 'coach-floor-press', ...COACH }));
  await source.create('routine', aRoutine({
    id: 'coach-tuesday', entries: [{ exercise_id: 'coach-floor-press', sets: 3, repetitions: 10 }], ...COACH,
  }));
  await source.create('intensity-pattern', anIntensityPattern({ id: 'coach-ramp', ...COACH }));
  const client = await source.create('client', aClient({
    name: 'Alex Fixture',
    clinical_reference: sealed,
    clinical_reference_label: aSealedValue('bGFiZWw='),
  }));

  const set = await collectBackup(source, { taken_at: NOW });
  const fresh = await aStore('coach-phone');
  await restoreBackup(fresh, readBackupFile(storeOnlyZip(backupParts(set))), { now: LATER });

  const restored = await fresh.get('client', client.record_id);

  // CARRIED, NOT DROPPED. A backup that quietly left the field behind would silently lose the one
  // thing the coach cannot reconstruct from memory.
  assert.deepEqual(restored.content.clinical_reference, sealed);
  assert.deepEqual(restored.content.clinical_reference_label, aSealedValue('bGFiZWw='));

  // AND STILL SEALED. The restore never held a key and never could: the shape that came back is the
  // shape that went in, ciphertext and all, and nothing in this path turned it into words.
  assert.equal(typeof restored.content.clinical_reference.ct, 'string');
  assert.equal(restored.content.clinical_reference.scheme, sealed.scheme);
  assert.ok(!('plaintext' in restored.content.clinical_reference));

  // The plaintext half of the same record came back readable, which is what makes the sentence he
  // reads a LIMIT rather than a failure: everything else really does come back.
  assert.equal(restored.content.name, 'Alex Fixture');
});

test('A FILE THIS APPLICATION DID NOT WRITE IS REFUSED BY NAME rather than half-read', async () => {
  const notABackup = storeOnlyZip([{ name: 'something-else.json', text: '[]' }]);
  assert.throws(() => readBackupFile(notABackup), /not a backup this application wrote/);
});
