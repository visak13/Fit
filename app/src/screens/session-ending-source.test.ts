/**
 * FINISHING A SESSION, DRIVEN AGAINST A REAL STORE AND READ BACK OFF THE RECORD.
 *
 * Nothing here is a stub. Every test opens the core's own in-process database — the same one the
 * store's own gate runs on — writes real records through the real schema, opens a real session and
 * hands its handle over exactly as the calendar does.
 *
 * ## EVERY ACCEPTANCE CLAIM IS READ FROM THE STORE, NEVER FROM THE CALL
 *
 * `finishTheSession` returns a view, and a screen showing that view is not evidence that anything was
 * written. So the status, `ended_at`, and every fact recorded during the session are read back with
 * `store.get` and the store's own queries. The call's own answer is checked too — but as a SECOND
 * reading that has to agree with the record, not as the reading.
 *
 * ## THE THREE THINGS THIS FILE IS ACTUALLY GUARDING
 *
 * 1. **The counts must not move.** `core/report/participation.js` sets `ATTENDED_STATUSES =
 *    STARTED_SESSION_STATUSES` deliberately: a session that STARTED is already attended, and the
 *    progress report is assembled from the per-exercise records written DURING the session. So a
 *    report over five unfinished sessions reads "You trained 5 sessions", and it must still read 5
 *    once they are finished. A finish control that quietly made attendance depend on completion would
 *    look like an improvement and would silently understate his client's own history.
 * 2. **BOTH DIRECTIONS, in the same run.** A finished session leaving "Sessions you have not
 *    finished" is half the property. A control that emptied that list, or a change that moved every
 *    session out of it, satisfies that half and looks exactly as green — so a session that was NOT
 *    finished is asserted to be STILL THERE in the same store, in the same test.
 * 3. **The aftermath sentence is an assertion.** `FINISHED_WORDS` tells the coach everything recorded
 *    in the session is still here, exactly as it was. Every per-exercise record, reading and note is
 *    read back and compared by identity AND by content, because this build has already shipped a
 *    sentence claiming a save had erased something when nothing had moved.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { aClient, anExercise, aRoutine } from '../../core/model/fixtures.js';
import { projectProgressReport } from '../../core/report/progress.js';
import { openSession, startSession } from '../../core/session/live-session.js';
import { openLocalStore } from '../../core/store/store.js';
import {
  performedForClient, readingsForClient, notesForSession, unfinishedSessions,
} from '../../core/store/queries.js';
import { createTwoWindowLaptop } from '../../core/store/testing/platform-double.js';
import { readWholeHistory } from './client-report-source';
import { readHistory } from './launcher-source';
import { finishTheSession } from './session-ending-source';
import { handOver, heldSession, releaseHeldSession } from './session-handover';

/* eslint-disable @typescript-eslint/no-explicit-any */

const opened: any[] = [];

after(async () => {
  for (const store of opened) {
    // eslint-disable-next-line no-await-in-loop
    await store.close();
  }
});

const PRESS = 'test-session-ending-press';
const SQUAT = 'test-session-ending-squat';

/** A store with a library, a routine and one client — the least a session needs to exist. */
async function aPractice(name = 'Test Ending Person') {
  const { a } = createTwoWindowLaptop();
  const store = await openLocalStore({ platform: a, device: 'coach-laptop' });
  opened.push(store);

  await store.create('exercise', anExercise({ id: PRESS, name: 'Bench press' }));
  await store.create('exercise', anExercise({ id: SQUAT, name: 'Back squat' }));
  const routine = await store.create('routine', aRoutine({
    id: 'test-session-ending-routine',
    name: 'Test Session Ending Routine',
    entries: [
      { exercise_id: PRESS, sets: 3, repetitions: 12 },
      { exercise_id: SQUAT, sets: 4, repetitions: 8 },
    ],
  }));
  const client = await store.create('client', aClient({ name }));

  return { store, routine, clientId: client.record_id as string, client };
}

/** A session started and handed over exactly as `CalendarScreen.tsx` hands it to the runner. */
async function started(store: any, routine: any, clientIds: string[]) {
  const outcome = await startSession(store, {
    routineId: routine.content.id, clientIds, mode: 'in_person', routine,
  });
  assert.equal(outcome.ok, true);
  handOver(store, outcome);
  return outcome.session_id as string;
}

/** Something recorded in the session, so "everything in it is still here" has something to be about. */
async function worked(store: any, sessionId: string, clientId: string) {
  const live = heldSession(store, sessionId) as any;
  await live.recordPerformed(clientId, { exerciseId: PRESS, sets: 3, repetitions: 12, observedLoad: '60kg' });
  await live.recordPerformed(clientId, { exerciseId: SQUAT, sets: 4, repetitions: 8, observedLoad: '80kg' });
  await live.recordReading(clientId, { kind: 'heart-rate', value: 132 });
  await live.recordNote({ text: 'Shoulder felt better today.', clientId });
  await live.recordNote({ text: 'Ran ten minutes over.' });
}

/** Everything the session put on the record, by identity and by content. */
async function whatIsOnTheRecord(store: any, sessionId: string, clientId: string) {
  const performed = (await performedForClient(store, clientId) as any).items
    .filter((record: any) => record.content.session_id === sessionId);
  const readings = (await readingsForClient(store, clientId) as any).items
    .filter((record: any) => record.content.session_id === sessionId);
  const notes = await notesForSession(store, sessionId) as any[];
  const shape = (records: any[]) => records
    .map((record) => [record.record_id, JSON.stringify(record.content)])
    .sort();
  return { performed: shape(performed), readings: shape(readings), notes: shape(notes) };
}

/** One client's whole progress report, assembled the way the report card assembles it. */
async function progressReport(store: any, clientId: string, client: any) {
  const history = await readWholeHistory(store, { recordId: clientId, record: client });
  assert.equal(history.complete, true, 'the history walk did not finish, so the report is short');
  return projectProgressReport({
    client: history.client,
    client_id: history.client_id,
    sessions: history.sessions,
    performed: history.performed,
    readings: history.readings,
    exercises: history.exercises,
  } as any);
}

describe('finishing a session writes the ending the user ruled', () => {
  it('leaves in_progress for completed and writes ended_at, read back off the STORED record', async () => {
    const { store, routine, clientId } = await aPractice();
    const sessionId = await started(store, routine, [clientId]);
    await worked(store, sessionId, clientId);

    const before = await store.get('session', sessionId);
    assert.equal(before.content.status, 'in_progress');
    assert.equal(before.content.ended_at, undefined);

    const result = await finishTheSession(store, sessionId);
    assert.equal(result.ok, true);
    assert.equal(result.refusal, null);

    // THE STORE, NOT THE SCREEN'S SUCCESS MESSAGE. The call above could report anything.
    const stored = await store.get('session', sessionId);
    assert.notEqual(stored.content.status, 'in_progress');
    assert.equal(stored.content.status, 'completed');
    assert.equal(typeof stored.content.ended_at, 'string');
    assert.ok((stored.content.ended_at as string).length > 0);
    // NOT abandoned and NOT interrupted. This is the assertion that catches a control wired to the
    // wrong ending — the one failure that would corrupt his record in a direction he never checks.
    assert.equal(stored.content.status === 'abandoned', false);
    assert.equal(stored.content.status === 'interrupted', false);
    // The session started when it started. An ending that rewrote that would falsify how long it ran.
    assert.equal(stored.content.started_at, before.content.started_at);
  });

  it('keeps every fact recorded during it, by identity and by content', async () => {
    const { store, routine, clientId } = await aPractice();
    const sessionId = await started(store, routine, [clientId]);
    await worked(store, sessionId, clientId);

    const before = await whatIsOnTheRecord(store, sessionId, clientId);
    assert.equal(before.performed.length, 2);
    assert.equal(before.readings.length, 1);
    assert.equal(before.notes.length, 2);

    await finishTheSession(store, sessionId);

    // THE AFTERMATH SENTENCE, PROVEN. `FINISHED_WORDS` says the exercises, the readings and the notes
    // are still here EXACTLY AS THEY WERE, which is a claim about content and not only about count.
    assert.deepEqual(await whatIsOnTheRecord(store, sessionId, clientId), before);
  });

  it('refuses when this window is not holding the session, rather than opening a second lease', async () => {
    const { store, routine, clientId } = await aPractice();
    const sessionId = await started(store, routine, [clientId]);
    await releaseHeldSession(store, sessionId);

    const result = await finishTheSession(store, sessionId);
    assert.equal(result.ok, false);
    assert.ok((result.refusal?.headline ?? '').length > 0, 'a refusal with no sentence is swallowed');
    // And nothing was written on the way past.
    assert.equal((await store.get('session', sessionId)).content.status, 'in_progress');
  });
});

describe('the calendar\'s two lists, BOTH DIRECTIONS in one store', () => {
  it('the finished one leaves the unfinished list and the unfinished one stays in it', async () => {
    const { store, routine, clientId, client } = await aPractice();

    const finishedId = await started(store, routine, [clientId]);
    await worked(store, finishedId, clientId);
    await finishTheSession(store, finishedId);

    // A SECOND SESSION THAT WAS NOT FINISHED, in the same store and the same run. Without it, a
    // change that emptied the list entirely would pass the first half of this looking exactly as
    // green.
    const stillOpenId = await started(store, routine, [clientId]);

    const waiting = (await unfinishedSessions(store) as any).items.map((s: any) => s.record_id);
    assert.equal(waiting.includes(finishedId), false,
      'a finished session is still offered for pick-up under "Sessions you have not finished"');
    assert.ok(waiting.includes(stillOpenId),
      'the unfinished session left the pick-up list too — this control emptied it rather than moving '
        + 'one session out of it');

    const done = (await readHistory(store, [clientId])).map((s: any) => s.record_id);
    assert.ok(done.includes(finishedId), 'the finished session landed nowhere');
    assert.equal(done.includes(stillOpenId), false,
      'a session that is still open is being listed under "Sessions already done"');

    await releaseHeldSession(store, stillOpenId);
    assert.ok(client);
  });
});

describe('THE COUNTS DO NOT MOVE — the assertion most likely to catch what this could break', () => {
  it('the progress report reads identically before and after the sessions are finished', async () => {
    const { store, routine, clientId, client } = await aPractice('Marlow Test-Ending');

    // FIVE SESSIONS, which is the shape s11/a12 measured the report over: "You trained 5 sessions"
    // with all five unfinished. That number must still read 5 with all five finished.
    const sessionIds: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const sessionId = await started(store, routine, [clientId]);
      // eslint-disable-next-line no-await-in-loop
      await worked(store, sessionId, clientId);
      sessionIds.push(sessionId);
    }

    const before = await progressReport(store, clientId, client);
    assert.equal(before.attendance.attended, 5,
      'the fixture does not reproduce the case this guards: a report over five STARTED sessions');
    assert.match(before.summary.paragraphs.join(' '), /You trained 5 sessions/u);

    // PICKED UP AND THEN FINISHED, ONE AT A TIME, WHICH IS THE COACH'S ACTUAL PATH. A window runs one
    // session at a time — `session-handover.ts` releases whatever it held when a second is handed over
    // — so the four he started earlier are not in this window's hand any more. He reaches them the
    // only way the calendar offers: "Pick up where you left off", which is `openSession` and a
    // handover, exactly as `launcher-source.ts` does it. Finishing them from a stale handle is not a
    // thing the application can do, and a fixture that pretended otherwise would prove nothing.
    for (const sessionId of sessionIds) {
      // eslint-disable-next-line no-await-in-loop
      const reopened = await openSession(store, sessionId, { routine });
      assert.equal(reopened.ok, true);
      handOver(store, reopened);
      // eslint-disable-next-line no-await-in-loop
      const result = await finishTheSession(store, sessionId);
      assert.equal(result.ok, true);
    }
    // All five really are finished on the record, so what follows is not a comparison of two
    // identical situations.
    for (const sessionId of sessionIds) {
      // eslint-disable-next-line no-await-in-loop
      assert.equal((await store.get('session', sessionId)).content.status, 'completed');
    }

    const then = await progressReport(store, clientId, client);

    assert.equal(then.attendance.attended, before.attendance.attended);
    assert.equal(then.attendance.upcoming, before.attendance.upcoming);
    assert.equal(then.attendance.months_with_a_session, before.attendance.months_with_a_session);
    assert.deepEqual(then.attendance.by_month, before.attendance.by_month);
    assert.equal(then.attendance.typical_days_between, before.attendance.typical_days_between);
    assert.equal(then.attendance.cadence, before.attendance.cadence);
    assert.deepEqual(then.focus, before.focus, 'what he worked on changed because a session ended');
    assert.deepEqual(then.trends, before.trends, 'a reading changed because a session ended');
    // THE WORDS THE CLIENT READS, which is where a moved count would actually surface.
    assert.deepEqual(then.summary.paragraphs, before.summary.paragraphs);
    assert.equal(then.headline, before.headline);

    // AND THE ONE THING THAT IS SUPPOSED TO HAVE CHANGED, so this test cannot pass by finishing
    // nothing at all: `completed` counts what it says, and it was nought before.
    assert.equal(before.attendance.completed, 0);
    assert.equal(then.attendance.completed, 5);
    assert.equal(then.attendance.cut_short, 0, 'a session was recorded as interrupted or abandoned');
  });
});

describe('the read-back after an ending is a FRESH read, measured rather than assumed', () => {
  it('sees a fact written through a different path after the handle was closed', async () => {
    const { store, routine, clientId } = await aPractice();
    const sessionId = await started(store, routine, [clientId]);
    await worked(store, sessionId, clientId);

    // Held before the ending, because the ending closes it and `heldSession` stops answering.
    const live = heldSession(store, sessionId) as any;

    const result = await finishTheSession(store, sessionId);
    assert.equal(result.ok, true);
    const replayed = result.reading?.view.replayed_records as number;
    assert.equal(result.reading?.view.status, 'completed',
      'the read-back the screen draws still says the session is running');
    assert.ok(replayed > 0);

    assert.equal(live.closed, true);
    assert.equal(heldSession(store, sessionId), null,
      'a closed handle is still being answered as the session this window is running');

    // A FACT THROUGH A GENUINELY DIFFERENT PATH. The store permits a session-scoped write with NO
    // lease precisely because the status has left `in_progress`, so nothing this module or the handle
    // did put this record there.
    await store.create('session-note', {
      session_id: sessionId,
      text: 'Written up afterwards, through no handle at all.',
      taken_at: '2026-07-31T12:00:00.000Z',
    });
    assert.equal((await notesForSession(store, sessionId) as any[]).length, 3,
      'the leaseless write did not reach the record, so the probe below would measure nothing');

    // THE MEASUREMENT. If `refresh()` on a closed handle answered from its cached view, this count
    // would not move — and every assertion made through a post-ending read-back would be about a
    // reading that was never taken, which looks exactly like a pass.
    const after = await live.refresh();
    assert.equal(after.replayed_records, replayed + 1,
      'refresh() on a closed handle did not re-read the store');
    assert.equal(after.status, 'completed');

    // And the closed handle still refuses to RECORD anything, which is the half that must not change.
    await assert.rejects(() => live.recordPerformed(clientId, { exerciseId: PRESS, sets: 1, repetitions: 1 }));
  });
});
