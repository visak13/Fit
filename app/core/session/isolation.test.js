/**
 * TWO LIVE SESSIONS ON ONE LAPTOP MUST NOT CORRUPT EACH OTHER.
 *
 * Supported deliberately, and laptop only: the coach may have two windows open, each running a live
 * session with a different routine, against one local database. Two properties have to hold and they
 * are different properties — the store's own notes are emphatic about this and they are right:
 *
 *  1. **Isolation.** One window per session. The second window is TOLD that a session is open in the
 *     other one rather than quietly appending to it.
 *  2. **No corruption.** Neither window's writes are lost. That is the transaction's doing, not the
 *     lock's — every mutation reads and writes inside one transaction, and the platform serialises
 *     overlapping read-write transactions.
 *
 * These are driven against two real stores over one database rather than described, because the only
 * way to know two windows do not corrupt each other is to run two windows.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { openSession, readSession, startSession } from './live-session.js';
import { clientViewOf } from './projection.js';
import { aTwoWindowStore, EXERCISES, T } from './testing.js';

test('two windows run two different sessions at once, and neither loses anything', async () => {
  const { storeA, storeB, routine, clientIds } = await aTwoWindowStore({ clients: 2 });
  const [ana, ben] = clientIds;

  const first = await startSession(storeA, {
    routineId: routine.content.id, clientIds: [ana], mode: 'online', routine, now: T.start,
  });
  const second = await startSession(storeB, {
    routineId: routine.content.id, clientIds: [ben], mode: 'online', routine, now: T.start,
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(first.session.sessionId, second.session.sessionId);

  // Interleaved, as two windows genuinely are.
  await first.session.recordPerformed(ana, {
    exerciseId: EXERCISES.push, sets: 3, repetitions: 12, observedLoad: '8kg',
    recordedAt: T.one, now: T.one,
  });
  await second.session.recordPerformed(ben, {
    exerciseId: EXERCISES.row, sets: 4, repetitions: 10, observedLoad: '12kg',
    recordedAt: T.one, now: T.one,
  });
  await first.session.recordReading(ana, { kind: 'heart-rate', value: 140, takenAt: T.two, now: T.two });
  await second.session.recordReading(ben, { kind: 'heart-rate', value: 121, takenAt: T.two, now: T.two });
  await first.session.recordPerformed(ana, {
    exerciseId: EXERCISES.plank, sets: 3, durationSeconds: 40, recordedAt: T.three, now: T.three,
  });

  const viewA = await first.session.refresh();
  const viewB = await second.session.refresh();

  assert.equal(viewA.counts.performed, 2);
  assert.equal(viewB.counts.performed, 1);
  assert.deepEqual(viewA.client_ids, [ana]);
  assert.deepEqual(viewB.client_ids, [ben]);
  assert.deepEqual(clientViewOf(viewA, ana).loads,
    [{ exercise_id: EXERCISES.push, observed_load: '8kg', recorded_at: T.one }],
    'one session\'s record contains its own facts and nothing from the other');
  assert.deepEqual(clientViewOf(viewB, ben).loads,
    [{ exercise_id: EXERCISES.row, observed_load: '12kg', recorded_at: T.one }]);
  assert.equal(clientViewOf(viewA, ana).readings.length, 1);
  assert.equal(clientViewOf(viewB, ben).readings.length, 1);

  // And each one, read back from the OTHER window's store, is the same record.
  const asSeenFromB = await readSession(storeB, first.session.sessionId, { routine });
  assert.equal(asSeenFromB.counts.performed, 2, 'one database, one truth');

  await storeA.close();
  await storeB.close();
});

test('the second window is TOLD the session is open in the first, not left appending to it', async () => {
  const { storeA, storeB, routine, clientIds } = await aTwoWindowStore({ clients: 1 });

  const first = await startSession(storeA, {
    routineId: routine.content.id, clientIds, mode: 'online', routine, now: T.start,
  });
  const alsoHere = await openSession(storeB, first.session.sessionId, { routine, now: T.two });

  assert.equal(alsoHere.ok, false);
  assert.equal(alsoHere.reason, 'held_elsewhere');
  assert.match(alsoHere.message, /other window/,
    'a sentence he can act on, not a spinner and not a failure');
  assert.equal(alsoHere.session, undefined);

  // The refusal changed nothing: the first window carries on as though nothing happened.
  await first.session.recordPerformed(clientIds[0], {
    exerciseId: EXERCISES.push, sets: 3, repetitions: 12, recordedAt: T.one, now: T.one,
  });
  assert.equal((await first.session.refresh()).counts.performed, 1);

  // Once the first window lets it go, the second can take it — and it resumes exactly.
  await first.session.detach();
  const nowHere = await openSession(storeB, first.session.sessionId, { routine, now: T.back });
  assert.equal(nowHere.ok, true);
  assert.equal((await nowHere.session.refresh()).counts.performed, 1,
    'the session moved windows without losing a fact');

  await storeA.close();
  await storeB.close();
});

test('a window that does not hold a session cannot record into it, even going around this layer', async () => {
  const { storeA, storeB, routine, clientIds } = await aTwoWindowStore({ clients: 1 });
  const [ana] = clientIds;

  const first = await startSession(storeA, {
    routineId: routine.content.id, clientIds, mode: 'online', routine, now: T.start,
  });

  // The store is the enforcement, not this layer: a session-scoped write with no lease on a LIVE
  // session is refused inside the same transaction that would have written it.
  await assert.rejects(() => storeB.create('performed-record', {
    session_id: first.session.sessionId,
    client_id: ana,
    exercise_id: EXERCISES.push,
    position: 0,
    status: 'performed',
    recorded_at: T.one,
  }, { now: T.one }), /not open in this window/);

  assert.equal((await first.session.refresh()).counts.performed, 0, 'nothing was written');

  await storeA.close();
  await storeB.close();
});

test('resuming picks up the RIGHT session when two are waiting', async () => {
  const { storeA, storeB, routine, clientIds } = await aTwoWindowStore({ clients: 2 });
  const [ana, ben] = clientIds;

  const first = await startSession(storeA, {
    routineId: routine.content.id, clientIds: [ana], mode: 'online', routine, now: T.start,
  });
  await first.session.recordPerformed(ana, {
    exerciseId: EXERCISES.push, sets: 3, repetitions: 12, recordedAt: T.one, now: T.one,
  });

  const second = await startSession(storeB, {
    routineId: routine.content.id, clientIds: [ben], mode: 'online', routine, now: T.start,
  });
  await second.session.recordPerformed(ben, {
    exerciseId: EXERCISES.row, sets: 4, repetitions: 10, recordedAt: T.one, now: T.one,
  });
  await second.session.recordPerformed(ben, {
    exerciseId: EXERCISES.plank, sets: 3, durationSeconds: 40, recordedAt: T.two, now: T.two,
  });

  await first.session.interrupt({ now: T.cut });
  await second.session.interrupt({ now: T.cut });

  const backToFirst = await openSession(storeA, first.session.sessionId, { routine, now: T.back });
  const backToSecond = await openSession(storeB, second.session.sessionId, { routine, now: T.back });

  const viewOne = await backToFirst.session.refresh();
  const viewTwo = await backToSecond.session.refresh();

  assert.deepEqual(viewOne.client_ids, [ana]);
  assert.equal(viewOne.counts.performed, 1);
  assert.deepEqual(viewTwo.client_ids, [ben]);
  assert.equal(viewTwo.counts.performed, 2,
    'each resume brings back its own session, not the other one that was also waiting');

  await storeA.close();
  await storeB.close();
});

test('two windows editing ONE finished session compose rather than overwrite', async () => {
  // A finished session is freely editable — writing up a note afterwards is ordinary work — so this
  // is the case where two windows genuinely touch one record, and neither may lose the other's edit.
  const { storeA, storeB, routine, clientIds } = await aTwoWindowStore({ clients: 1 });
  const [ana] = clientIds;

  const opened = await startSession(storeA, {
    routineId: routine.content.id, clientIds, mode: 'online', routine, now: T.start,
  });
  const stored = await opened.session.recordPerformed(ana, {
    exerciseId: EXERCISES.push, sets: 3, repetitions: 12, recordedAt: T.one, now: T.one,
  });
  await opened.session.complete({ now: T.end });

  // Both windows read revision 1 and apply DIFFERENT corrections as functions of what is stored.
  await Promise.all([
    storeA.update('performed-record', stored.record_id,
      (content) => ({ ...content, observed_load: '20kg' }), { now: T.end }),
    storeB.update('performed-record', stored.record_id,
      (content) => ({ ...content, note: 'Form held throughout.' }), { now: T.end }),
  ]);

  const after = await storeA.get('performed-record', stored.record_id);
  assert.equal(after.content.observed_load, '20kg');
  assert.equal(after.content.note, 'Form held throughout.',
    'an edit expressed as a function of what is stored composes with the other window\'s edit');
  assert.equal(after.rev, 3, 'both revisions landed');

  await storeA.close();
  await storeB.close();
});
