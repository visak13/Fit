/**
 * ONE ROUTINE, ONE TO MANY CLIENTS.
 *
 * A session is not "a client plus a routine". It is a ROUTINE plus a SET of attending clients — a
 * single application instance always drives a SINGLE routine, however many people are in the call.
 * The rare case of two people needing different programmes is handled by running two instances, not
 * by building a second routine into one session, so nothing here models that.
 *
 * What each attendee keeps is their OWN: their performed records, their readings, their notes. The
 * coach may modify an exercise for one tired client while the rest continue, and progress views and
 * exports remain strictly per client even though the session was shared. One client's facts
 * appearing in another's view is the failure this whole shape exists to prevent, so it is asserted
 * directly rather than assumed from the design.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { SessionParticipantError, SessionStateError } from './errors.js';
import { startSession } from './live-session.js';
import { clientViewOf } from './projection.js';
import { previousSessionAtAGlance } from './glance.js';
import { aFurnishedStore, EXERCISES, T } from './testing.js';

test('three clients, one routine, and each keeps their own record of what they did', async () => {
  const { store, routine, clientIds } = await aFurnishedStore({ clients: 3 });
  const [ana, ben, cal] = clientIds;

  const opened = await startSession(store, {
    routineId: routine.content.id, clientIds, routine, now: T.start,
  });
  const live = opened.session;

  // The whole group starts together.
  for (const client of clientIds) {
    // eslint-disable-next-line no-await-in-loop
    await live.recordPerformed(client, {
      exerciseId: EXERCISES.push, sets: 3, repetitions: 12, recordedAt: T.one, now: T.one,
    });
  }

  // Ben is tired: his second exercise is swapped, and his load is his own.
  await live.recordSubstitution(ben, {
    exerciseId: EXERCISES.spare, insteadOf: EXERCISES.plank, sets: 2, durationSeconds: 20,
    recordedAt: T.two, now: T.two,
  });
  await live.recordPerformed(ana, {
    exerciseId: EXERCISES.plank, sets: 3, durationSeconds: 45, observedLoad: '5kg plate',
    recordedAt: T.two, now: T.two,
  });
  await live.recordPerformed(cal, {
    exerciseId: EXERCISES.plank, sets: 3, durationSeconds: 40, recordedAt: T.two, now: T.two,
  });

  // A reading against one specific person, captured without leaving the routine.
  await live.recordReading(ben, { kind: 'heart-rate', value: 158, takenAt: T.three, now: T.three });
  await live.recordNote({ text: 'Tired today.', clientId: ben, takenAt: T.three, now: T.three });

  const view = await live.refresh();
  assert.equal(view.counts.clients, 3);
  assert.equal(view.routine_id, routine.content.id, 'one routine drives the whole session');

  const anaView = clientViewOf(view, ana);
  const benView = clientViewOf(view, ben);
  const calView = clientViewOf(view, cal);

  assert.equal(anaView.plan[1].outcome, 'performed');
  assert.equal(benView.plan[1].outcome, 'substituted',
    'one client is adapted without forking the session');
  assert.equal(calView.plan[1].outcome, 'performed');

  assert.deepEqual(anaView.loads, [
    { exercise_id: EXERCISES.plank, observed_load: '5kg plate', recorded_at: T.two },
  ]);
  assert.deepEqual(benView.loads, [], "one client's load is not another's");
  assert.deepEqual(calView.loads, []);

  assert.equal(benView.readings.length, 1);
  assert.equal(anaView.readings.length, 0, "and neither is one client's reading");
  assert.equal(calView.readings.length, 0);

  assert.equal(benView.notes.length, 1);
  assert.equal(anaView.notes.length, 0, "nor one client's note");
  assert.equal(view.session_notes.length, 0, 'a note with a client is theirs, not the session\'s');

  await store.close();
});

test('a shared session appears in EVERY attendee\'s history, with only their own detail in it', async () => {
  const { store, routine, clientIds } = await aFurnishedStore({ clients: 2 });
  const [ana, ben] = clientIds;

  const opened = await startSession(store, {
    routineId: routine.content.id, clientIds, routine, now: T.start,
  });
  await opened.session.recordPerformed(ana, {
    exerciseId: EXERCISES.push, sets: 3, repetitions: 12, observedLoad: '8kg',
    recordedAt: T.one, now: T.one,
  });
  await opened.session.recordPerformed(ben, {
    exerciseId: EXERCISES.push, sets: 2, repetitions: 8, observedLoad: '4kg',
    recordedAt: T.one, now: T.one,
  });
  await opened.session.recordReading(ana, { kind: 'plank-hold', value: 62, takenAt: T.two, now: T.two });
  await opened.session.complete({ now: T.end });

  const forAna = await previousSessionAtAGlance(store, ana);
  const forBen = await previousSessionAtAGlance(store, ben);

  assert.equal(forAna.session_id, forBen.session_id, 'the same shared session');
  assert.deepEqual(forAna.loads, [{ exercise_id: EXERCISES.push, observed_load: '8kg', recorded_at: T.one }]);
  assert.deepEqual(forBen.loads, [{ exercise_id: EXERCISES.push, observed_load: '4kg', recorded_at: T.one }]);
  assert.equal(forAna.readings.length, 1);
  assert.equal(forBen.readings.length, 0, "one client's reading never reaches another's view");

  await store.close();
});

test('somebody arriving late joins the session that is already running', async () => {
  const { store, routine, clientIds } = await aFurnishedStore({ clients: 2 });
  const [ana, ben] = clientIds;

  const opened = await startSession(store, {
    routineId: routine.content.id, clientIds: [ana], routine, now: T.start,
  });
  const live = opened.session;
  await live.recordPerformed(ana, {
    exerciseId: EXERCISES.push, sets: 3, repetitions: 12, recordedAt: T.one, now: T.one,
  });

  await assert.rejects(
    () => live.recordPerformed(ben, { exerciseId: EXERCISES.push, recordedAt: T.one, now: T.one }),
    SessionParticipantError,
    'nothing is recorded against somebody who is not in the session',
  );

  await live.addClient(ben, { now: T.two });
  await live.recordPerformed(ben, {
    exerciseId: EXERCISES.push, sets: 2, repetitions: 10, recordedAt: T.two, now: T.two,
  });

  const view = await live.refresh();
  assert.deepEqual(view.client_ids, [ana, ben]);
  assert.equal(clientViewOf(view, ana).counts.performed, 1);
  assert.equal(clientViewOf(view, ben).counts.performed, 1,
    'the latecomer records against the same single routine');

  await store.close();
});

test('somebody added by mistake can be taken out — until they have done something', async () => {
  const { store, routine, clientIds } = await aFurnishedStore({ clients: 2 });
  const [ana, ben] = clientIds;

  const opened = await startSession(store, {
    routineId: routine.content.id, clientIds, routine, now: T.start,
  });
  const live = opened.session;

  await live.removeClient(ben, { now: T.one });
  assert.deepEqual((await live.refresh()).client_ids, [ana]);

  await live.addClient(ben, { now: T.two });
  await live.recordPerformed(ben, {
    exerciseId: EXERCISES.push, sets: 1, repetitions: 5, recordedAt: T.one, now: T.one,
  });

  await assert.rejects(() => live.removeClient(ben), (error) => {
    assert.ok(error instanceof SessionStateError);
    assert.match(error.message, /What happened, happened/);
    return true;
  }, 'removing an attendee who has results would strand their record outside any session');

  await store.close();
});

test('the roster is the session\'s own, and a fact needs a person who is on it', async () => {
  const { store, routine, clientIds } = await aFurnishedStore({ clients: 2 });
  const [ana] = clientIds;

  const opened = await startSession(store, {
    routineId: routine.content.id, clientIds: [ana], routine, now: T.start,
  });

  await assert.rejects(
    () => opened.session.recordReading('44444444-4444-4444-8444-444444444444', {
      kind: 'heart-rate', value: 120, takenAt: T.one, now: T.one,
    }),
    SessionParticipantError,
  );
  await assert.rejects(
    () => opened.session.recordNote({
      text: 'A note about a stranger.', clientId: '44444444-4444-4444-8444-444444444444',
      takenAt: T.one, now: T.one,
    }),
    SessionParticipantError,
  );

  await store.close();
});
