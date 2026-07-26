/**
 * SURVIVING THE DISTURBANCE — the requirement this whole layer exists for.
 *
 * Real sessions are disturbed by power cuts, illness, phone calls and the browser simply closing. An
 * interrupted session resumes EXACTLY where it left off, and a half-finished session is still saved
 * as a partial record rather than lost or discarded. There is no state in which closing the
 * application throws away what already happened.
 *
 * ## How a power cut is simulated, and where the simulation is unfaithful
 *
 * A cut is simulated by dropping the store and opening a new one on the same database WITHOUT
 * calling anything on the live session: no status is written, no end time, no summary. That is
 * exactly the state a real cut leaves in the database, and the database is the only thing that
 * survives a cut.
 *
 * The one thing the simulation cannot reproduce is the lease, which is held by an unresolved promise
 * and released by the platform when the page dies. Closing the store releases it too, so a simulated
 * cut is KINDER than a real one in that single respect — and a double kinder than reality is exactly
 * what the store's notes warn about, so it is named here rather than left implicit. Nothing in these
 * tests depends on the lease surviving a cut.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { openLocalStore } from '../store/store.js';
import { openSession, readSession, resumableSessions, startSession } from './live-session.js';
import { clientViewOf, resumeStateOf } from './projection.js';
import { aFurnishedStore, EXERCISES, T } from './testing.js';

/**
 * Everything a resumed session must reproduce. Compared before and after the cut.
 * @param {import('./projection.js').SessionView} view @param {string} clientId
 */
function whatHappened(view, clientId) {
  const client = clientViewOf(view, clientId);
  return {
    status: view.status,
    started_at: view.started_at,
    replayed: view.replayed_records,
    order_as_run: client.order_as_run,
    outcomes: client.plan.map((line) => `${line.exercise_id}:${line.outcome}`),
    loads: client.loads,
    readings: client.readings.map((r) => `${r.content.kind}=${r.content.value}`),
    notes: client.notes.map((n) => n.content.text),
    not_yet_recorded: client.not_yet_recorded,
    append_position: client.append_position,
  };
}

test('an interruption at ANY point resumes EXACTLY and loses nothing', async () => {
  // Four cut points: before anything happened, after one fact, after a reading, and after most of
  // the work. The cut is taken at each of them in turn against a fresh device.
  for (const cutAfter of [0, 1, 2, 4]) {
    // eslint-disable-next-line no-await-in-loop
    const { store, platform, routine, clientIds } = await aFurnishedStore();
    const [client] = clientIds;

    const opened = await startSession(store, {
      routineId: routine.content.id, clientIds, mode: 'online', routine, now: T.start,
    });
    const live = opened.session;
    const sessionId = live.sessionId;

    const facts = [
      () => live.recordPerformed(client, {
        exerciseId: EXERCISES.push, sets: 3, repetitions: 12, observedLoad: 'bodyweight',
        recordedAt: T.one, now: T.one,
      }),
      () => live.recordReading(client, { kind: 'heart-rate', value: 132, takenAt: T.two, now: T.two }),
      () => live.recordPerformed(client, {
        exerciseId: EXERCISES.plank, status: 'partial', sets: 2, durationSeconds: 30,
        recordedAt: T.three, now: T.three,
      }),
      () => live.recordNote({
        text: 'Shortened the last hold.', clientId: client, takenAt: T.four, now: T.four,
      }),
    ];
    for (const fact of facts.slice(0, cutAfter)) await fact();

    const before = whatHappened(await live.refresh(), client);
    await store.close();

    // A new window on the same device, on the same database. Nothing was saved on the way out.
    const resumed = await openLocalStore({ platform, device: 'coach-laptop' });
    const stored = await resumed.get('session', sessionId);
    assert.equal(stored.content.status, 'in_progress',
      'a cut leaves the session exactly where it was — nothing got the chance to write anything else');
    assert.equal(stored.content.ended_at, undefined, 'and it certainly did not finish');

    const again = await openSession(resumed, sessionId, { routine, now: T.back });
    assert.equal(again.ok, true, `cut after ${cutAfter} facts: the session opens again`);
    const after = whatHappened(await again.session.refresh(), client);

    assert.deepEqual(after, before, `cut after ${cutAfter} facts: resumed EXACTLY`);
    assert.equal(after.replayed, cutAfter, 'every fact recorded before the cut is still there');

    // And it carries straight on from where the record leaves off.
    await again.session.recordPerformed(client, {
      exerciseId: EXERCISES.row, sets: 4, repetitions: 10, recordedAt: T.back, now: T.back,
    });
    const carried = clientViewOf(await again.session.refresh(), client);
    assert.equal(carried.counts.performed, before.order_as_run.length + 1,
      'the continuation is APPENDED to what was already there, not written over it');
    assert.deepEqual(carried.order_as_run, [...before.order_as_run, EXERCISES.row],
      'and the order the session actually ran in survives the cut intact');

    await resumed.close();
  }
});

test('a half-finished session is a PARTIAL RECORD, not a loss', async () => {
  const { store, routine, clientIds } = await aFurnishedStore();
  const [client] = clientIds;

  const opened = await startSession(store, {
    routineId: routine.content.id, clientIds, mode: 'online', routine, now: T.start,
  });
  const live = opened.session;
  await live.recordPerformed(client, {
    exerciseId: EXERCISES.push, sets: 3, repetitions: 12, recordedAt: T.one, now: T.one,
  });
  await live.interrupt({ now: T.cut });

  const stored = await store.get('session', live.sessionId);
  assert.equal(stored.content.status, 'interrupted', 'interruption is a first-class state');
  assert.equal(stored.content.ended_at, undefined, 'an interrupted session has not ended');

  const view = await readSession(store, live.sessionId, { routine });
  assert.equal(view.is_partial_record, true);
  assert.equal(view.is_resumable, true);
  assert.equal(view.replayed_records, 1, 'what happened is still there, in full');

  const state = resumeStateOf(view);
  assert.deepEqual(state, {
    session_id: live.sessionId,
    status: 'interrupted',
    resumable: true,
    partial_record: true,
    recorded: 1,
    started_at: T.start,
  });

  await store.close();
});

test('an abandoned session keeps what happened — it is finished, not discarded', async () => {
  const { store, routine, clientIds } = await aFurnishedStore();
  const [client] = clientIds;

  const opened = await startSession(store, {
    routineId: routine.content.id, clientIds, mode: 'online', routine, now: T.start,
  });
  await opened.session.recordPerformed(client, {
    exerciseId: EXERCISES.push, sets: 1, repetitions: 4, recordedAt: T.one, now: T.one,
  });
  await opened.session.abandon({ now: T.cut, summary: 'Client felt unwell.' });

  const view = await readSession(store, opened.session.sessionId, { routine });
  assert.equal(view.status, 'abandoned');
  assert.equal(view.is_partial_record, true, 'it holds what happened without claiming it finished');
  assert.equal(view.is_resumable, false);
  assert.equal(view.replayed_records, 1, 'the work done before it stopped is kept');
  assert.equal(view.summary, 'Client felt unwell.');

  await store.close();
});

test('a session left running and one left interrupted are both offered back, and treated alike', async () => {
  const { store, routine, clientIds } = await aFurnishedStore();

  const cut = await startSession(store, {
    routineId: routine.content.id, clientIds, mode: 'online', routine, now: T.start,
  });
  await cut.session.detach();                               // the power-cut shape: still in_progress

  const left = await startSession(store, {
    routineId: routine.content.id, clientIds, mode: 'online', routine, now: T.start,
  });
  await left.session.interrupt({ now: T.cut });             // the courteous shape

  const waiting = await resumableSessions(store);
  const ids = waiting.map((s) => s.record_id).sort();
  assert.deepEqual(ids, [cut.session.sessionId, left.session.sessionId].sort(),
    'a clean exit is a courtesy, never a precondition for being found again');

  for (const session of waiting) {
    // eslint-disable-next-line no-await-in-loop
    const reopened = await openSession(store, session.record_id, { routine, now: T.back });
    assert.equal(reopened.ok, true, 'both open by the same door');
    // eslint-disable-next-line no-await-in-loop
    await reopened.session.detach();
  }

  await store.close();
});

test('a finished session is not reopened as live, and says so plainly', async () => {
  const { store, routine, clientIds } = await aFurnishedStore();
  const opened = await startSession(store, {
    routineId: routine.content.id, clientIds, mode: 'online', routine, now: T.start,
  });
  await opened.session.complete({ now: T.end });

  const again = await openSession(store, opened.session.sessionId, { routine });
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'already_finished');
  assert.match(again.message, /record is kept/, 'the coach is told the record survives');

  // And its record is still fully readable.
  const view = await readSession(store, opened.session.sessionId, { routine });
  assert.equal(view.status, 'completed');
  assert.equal(view.is_partial_record, false);

  await store.close();
});

test('a session that is not on this device is reported, not thrown', async () => {
  const { store } = await aFurnishedStore();
  const result = await openSession(store, '99999999-9999-4999-8999-999999999999');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not_found');
  await store.close();
});
