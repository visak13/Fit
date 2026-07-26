/**
 * THE SESSION IS MODULAR, AND THE APPLICATION HAS NO OPINION ABOUT WHERE HE SHOULD BE.
 *
 * The coach jumps to any exercise, reorders, skips, repeats, substitutes and edits mid-session, and
 * captures a reading or a note at any moment. A press-play-then-pause timeline would make the
 * application the driver of the session; the standing principle is that it is a supporting role. It
 * tracks what happened. It never dictates what happens next.
 *
 * Each of those five is asserted to be RECORDED, which is the whole claim: not permitted, not
 * tolerated — recorded, so that the session's history says what actually took place.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { startSession } from './live-session.js';
import { clientViewOf } from './projection.js';
import { aFurnishedStore, EXERCISES, T } from './testing.js';

/** A live session on a furnished device, with one client. */
async function aLiveSession() {
  const { store, routine, clientIds } = await aFurnishedStore();
  const opened = await startSession(store, {
    routineId: routine.content.id, clientIds, mode: 'online', routine, now: T.start,
  });
  return { store, routine, client: clientIds[0], live: opened.session };
}

test('JUMPING: he starts with the third exercise, and that is what the record says', async () => {
  const { store, live, client } = await aLiveSession();

  await live.recordPerformed(client, {
    exerciseId: EXERCISES.row, sets: 4, repetitions: 10, recordedAt: T.one, now: T.one,
  });
  const view = clientViewOf(await live.refresh(), client);

  assert.deepEqual(view.order_as_run, [EXERCISES.row], 'the record follows him, not the routine');
  assert.deepEqual(view.not_yet_recorded, [EXERCISES.push, EXERCISES.plank],
    'the two he has not touched are simply not recorded yet — a fact, not an instruction');
  assert.equal(view.plan[2].outcome, 'performed');
  assert.equal(view.plan[0].outcome, 'not-recorded');

  await store.close();
});

test('REORDERING: the order he ran is kept, and it is not the routine order', async () => {
  const { store, live, client } = await aLiveSession();

  await live.recordPerformed(client, { exerciseId: EXERCISES.plank, sets: 3, durationSeconds: 40, recordedAt: T.one, now: T.one });
  await live.recordPerformed(client, { exerciseId: EXERCISES.row, sets: 4, repetitions: 10, recordedAt: T.two, now: T.two });
  await live.recordPerformed(client, { exerciseId: EXERCISES.push, sets: 3, repetitions: 12, recordedAt: T.three, now: T.three });

  const view = clientViewOf(await live.refresh(), client);
  assert.deepEqual(view.order_as_run, [EXERCISES.plank, EXERCISES.row, EXERCISES.push],
    'what happened, in the order it happened');
  assert.deepEqual(view.plan.map((line) => line.exercise_id),
    [EXERCISES.push, EXERCISES.plank, EXERCISES.row],
    'the routine keeps its own declared order — a default, not a script');
  assert.deepEqual(view.plan.map((line) => line.outcome), ['performed', 'performed', 'performed']);
  assert.deepEqual(view.timeline.map((a) => a.position), [0, 1, 2]);

  await store.close();
});

test('SKIPPING: a skip is a recorded fact, not a gap', async () => {
  const { store, live, client } = await aLiveSession();

  await live.recordSkipped(client, EXERCISES.plank, {
    note: 'Wrist was sore.', recordedAt: T.one, now: T.one,
  });
  const view = clientViewOf(await live.refresh(), client);

  assert.equal(view.plan[1].outcome, 'skipped');
  assert.equal(view.plan[1].attempts[0].record.content.note, 'Wrist was sore.');
  assert.ok(!view.not_yet_recorded.includes(EXERCISES.plank),
    'a skipped exercise HAS been recorded — it is not still waiting to happen');
  assert.equal(view.loads.length, 0, 'a skipped exercise records no work');

  await store.close();
});

test('REPEATING: a second round is a second fact, and the first is not overwritten', async () => {
  const { store, live, client } = await aLiveSession();

  await live.recordPerformed(client, {
    exerciseId: EXERCISES.push, sets: 3, repetitions: 12, observedLoad: 'bodyweight',
    recordedAt: T.one, now: T.one,
  });
  await live.recordPerformed(client, {
    exerciseId: EXERCISES.push, sets: 2, repetitions: 8, observedLoad: 'red band',
    recordedAt: T.two, now: T.two,
  });

  const view = clientViewOf(await live.refresh(), client);
  const line = view.plan[0];

  assert.equal(line.repeated, true);
  assert.equal(line.attempts.length, 2, 'both rounds are in the record');
  assert.deepEqual(line.attempts.map((a) => a.position), [0, 1],
    'the second is appended after the first rather than replacing it');
  assert.deepEqual(view.loads, [
    { exercise_id: EXERCISES.push, observed_load: 'bodyweight', recorded_at: T.one },
    { exercise_id: EXERCISES.push, observed_load: 'red band', recorded_at: T.two },
  ], 'each round keeps the load he observed for it, verbatim');

  await store.close();
});

test('SUBSTITUTING: what was done AND what it replaced are both kept', async () => {
  const { store, live, client } = await aLiveSession();

  await live.recordSubstitution(client, {
    exerciseId: EXERCISES.spare, insteadOf: EXERCISES.plank,
    sets: 3, durationSeconds: 25, note: 'Swapped: shoulder.', recordedAt: T.one, now: T.one,
  });

  const view = clientViewOf(await live.refresh(), client);
  const line = view.plan[1];

  assert.equal(line.exercise_id, EXERCISES.plank, 'the line the routine programmed');
  assert.equal(line.outcome, 'substituted');
  assert.equal(line.attempts[0].exercise_id, EXERCISES.spare, 'and what was actually done instead');
  assert.equal(line.attempts[0].substituted_for_exercise_id, EXERCISES.plank);
  assert.deepEqual(view.beyond_the_routine, [],
    'a substitute is not loose work — it belongs to the line it replaced');
  assert.ok(!view.not_yet_recorded.includes(EXERCISES.plank));

  await store.close();
});

test('work outside the routine altogether is kept as what it is', async () => {
  const { store, live, client } = await aLiveSession();

  await live.recordPerformed(client, {
    exerciseId: EXERCISES.spare, sets: 2, repetitions: 20, recordedAt: T.one, now: T.one,
  });
  const view = clientViewOf(await live.refresh(), client);

  assert.deepEqual(view.beyond_the_routine, [EXERCISES.spare],
    'he added something the routine never named, and the record says so rather than dropping it');
  assert.deepEqual(view.not_yet_recorded,
    [EXERCISES.push, EXERCISES.plank, EXERCISES.row],
    'and it does not stand in for anything the routine did name');

  await store.close();
});

test('EDITING: a mistyped load is corrected in place, and nothing else moves', async () => {
  const { store, live, client } = await aLiveSession();

  const stored = await live.recordPerformed(client, {
    exerciseId: EXERCISES.push, sets: 3, repetitions: 12, observedLoad: '2kg',
    recordedAt: T.one, now: T.one,
  });
  await live.recordPerformed(client, {
    exerciseId: EXERCISES.row, sets: 4, repetitions: 10, recordedAt: T.two, now: T.two,
  });

  const amended = await live.amend('performed-record', stored.record_id, (content) => ({
    ...content, observed_load: '20kg',
  }), { now: T.three });
  assert.equal(amended.rev, 2, 'a correction is a revision of the fact, so it propagates');

  const view = clientViewOf(await live.refresh(), client);
  assert.deepEqual(view.order_as_run, [EXERCISES.push, EXERCISES.row],
    'correcting a fact does not reorder the session');
  assert.deepEqual(view.loads, [
    { exercise_id: EXERCISES.push, observed_load: '20kg', recorded_at: T.one },
  ]);

  await store.close();
});

test('a reading and a note can be captured at any moment, without leaving the routine', async () => {
  const { store, live, client } = await aLiveSession();

  await live.recordReading(client, { kind: 'heart-rate', value: 148, takenAt: T.one, now: T.one });
  await live.recordPerformed(client, {
    exerciseId: EXERCISES.push, sets: 3, repetitions: 12, recordedAt: T.two, now: T.two,
  });
  await live.recordNote({ text: 'Breathing settled quickly.', clientId: client, takenAt: T.three, now: T.three });
  await live.recordNote({ text: 'Room was very warm today.', takenAt: T.four, now: T.four });

  const view = await live.refresh();
  const client0 = clientViewOf(view, client);

  assert.equal(client0.readings.length, 1);
  assert.equal(client0.readings[0].content.unit, 'bpm', 'the unit is pinned from the kind');
  assert.equal(client0.notes.length, 1, "the note about him is his");
  assert.equal(view.session_notes.length, 1, 'the note about the room belongs to nobody in particular');
  assert.equal(view.session_notes[0].content.client_id, undefined);

  await store.close();
});

test('a session carries no cursor, no current exercise and no next exercise — anywhere', async () => {
  const { store, live, client } = await aLiveSession();
  await live.recordPerformed(client, {
    exerciseId: EXERCISES.push, sets: 3, repetitions: 12, recordedAt: T.one, now: T.one,
  });

  // An absence is indistinguishable from an oversight to the next editor, so it is asserted rather
  // than left to be noticed. A stored position would be a second source of truth about where the
  // session is, and two sources eventually disagree — in the middle of a real session.
  const stored = await store.get('session', live.sessionId);
  const storedKeys = Object.keys(stored.content);
  const forbidden = /current|next|cursor|step|index|pointer|progress_/i;
  assert.deepEqual(storedKeys.filter((key) => forbidden.test(key)), [],
    'the SESSION record stores nothing about where he has got to');

  const view = clientViewOf(await live.refresh(), client);
  assert.deepEqual(Object.keys(view).filter((key) => /^(current|next)_|cursor/i.test(key)), [],
    'and neither does the view, which is derived on every read');

  await store.close();
});
