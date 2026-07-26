/**
 * THE RUNNER'S OPENING, ITS LEASE AND ITS LEAVING, DRIVEN AGAINST REAL STORES.
 *
 * Nothing here is a stub. Every test opens the core's own in-process database — the same one the
 * store's own gate runs on — writes real records through the real schema and opens real sessions
 * through the real runner. The property this file exists for is a LEASE, and a lease is not
 * something a mock can be quietly wrong about: a stub would report a pass for a runner that holds
 * nothing, which is exactly the failure this step exists to prevent.
 *
 * TWO WINDOWS wherever the assertion is about the lease. Within ONE window `acquireSessionLease`
 * hands back the lease it already holds, deliberately — so a test that asked the same store twice
 * would prove nothing and would report a pass for it. A second WINDOW is a genuinely separate
 * document, which is the shape of the real requirement and the only shape in which `held_elsewhere`
 * can happen.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { aClient, anExercise, aRoutine } from '../../core/model/fixtures.js';
import { openSession, startSession } from '../../core/session/live-session.js';
import { openLocalStore } from '../../core/store/store.js';
import { createTwoWindowLaptop, settle } from '../../core/store/testing/platform-double.js';
import { leaveTheSession, openSessionInto, openTheSession } from './runner-source';
import type { SessionReading } from './runner-source';
import { handOver, heldSession, heldSessionId } from './session-handover';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const opened: any[] = [];

after(async () => {
  for (const store of opened) {
    // eslint-disable-next-line no-await-in-loop
    await store.close();
  }
});

const PRESS = 'test-runner-source-press';
const SQUAT = 'test-runner-source-squat';

async function twoWindows(names: string[] = ['Test Client A']) {
  const { a, b } = createTwoWindowLaptop();
  const windowA = await openLocalStore({ platform: a, device: 'coach-laptop' });
  const windowB = await openLocalStore({ platform: b, device: 'coach-laptop' });
  opened.push(windowA, windowB);

  await windowA.create('exercise', anExercise({ id: PRESS, name: 'Bench press' }));
  await windowA.create('exercise', anExercise({ id: SQUAT, name: 'Back squat' }));
  const routine = await windowA.create('routine', aRoutine({
    id: 'test-runner-source-routine',
    name: 'Test Runner Source Routine',
    entries: [
      { exercise_id: PRESS, sets: 3, repetitions: 12 },
      { exercise_id: SQUAT, sets: 4, repetitions: 8 },
    ],
  }));

  const clientIds: string[] = [];
  for (const name of names) {
    // eslint-disable-next-line no-await-in-loop
    const record = await windowA.create('client', aClient({ name }));
    clientIds.push(record.record_id);
  }

  return { windowA, windowB, routine, clientIds };
}

/**
 * A session started in a window, with the handle handed over exactly as the launcher hands it.
 *
 * `withRoutine: false` is the launcher that did not have the routine record to hand — the case that
 * would otherwise have the runner tell him the routine is gone.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function started(store: any, routine: any, clientIds: string[], withRoutine = true) {
  const outcome = await startSession(store, {
    routineId: routine.content.id,
    clientIds,
    mode: 'in_person',
    routine: withRoutine ? routine : null,
  });
  assert.equal(outcome.ok, true);
  return handOver(store, outcome).session_id as string;
}

describe('opening the session the calendar handed over', () => {
  it('uses the handle it was given rather than opening the session a second time', async () => {
    const { windowA, routine, clientIds } = await twoWindows();
    const sessionId = await started(windowA, routine, clientIds);
    const handed = heldSession(windowA, sessionId);

    const reading = await openTheSession(windowA, sessionId);

    assert.equal(reading.outcome.ok, true);
    assert.equal(
      heldSession(windowA, sessionId),
      handed,
      'the runner opened a session the calendar was still holding, so this window now has TWO '
        + 'handles on one lease and whichever detaches first releases it under the other',
    );
    assert.equal(reading.view?.session_id, sessionId);

    await leaveTheSession(windowA, sessionId);
  });

  it('shows the routine\'s lines, so nothing has to be read that the launcher already had', async () => {
    const { windowA, routine, clientIds } = await twoWindows();
    const sessionId = await started(windowA, routine, clientIds);

    const reading = await openTheSession(windowA, sessionId);
    assert.deepEqual(
      reading.view?.clients[0].plan.map((line) => line.exercise_id),
      [PRESS, SQUAT],
    );
    assert.equal(reading.routineName, 'Test Runner Source Routine');

    await leaveTheSession(windowA, sessionId);
  });

  /**
   * A HANDLE HANDED OVER WITHOUT ITS ROUTINE WOULD PROJECT A VIEW WITH NO LINES IN IT, and the screen
   * would then say the routine is no longer in the library — a false claim about a routine sitting
   * right there, and one nothing else would report.
   */
  it('fills in a routine the handover did not carry, rather than reporting it as gone', async () => {
    const { windowA, routine, clientIds } = await twoWindows();
    const sessionId = await started(windowA, routine, clientIds, false);

    const reading = await openTheSession(windowA, sessionId);
    assert.deepEqual(
      reading.view?.clients[0].plan.map((line) => line.exercise_id),
      [PRESS, SQUAT],
      'the session came back with no lines at all, so the screen would report a routine that is '
        + 'sitting in the library as deleted',
    );

    await leaveTheSession(windowA, sessionId);
  });

  it('reads back the names of the exercises the session mentions, by keyed lookup', async () => {
    const { windowA, routine, clientIds } = await twoWindows();
    const sessionId = await started(windowA, routine, clientIds);

    const reading = await openTheSession(windowA, sessionId);
    assert.equal(reading.exerciseNames.get(PRESS), 'Bench press');
    assert.equal(reading.exerciseNames.get(SQUAT), 'Back squat');
    assert.equal(reading.clientNames.get(clientIds[0]), 'Test Client A');

    await leaveTheSession(windowA, sessionId);
  });
});

describe('arriving cold', () => {
  /**
   * A REFRESH, A BOOKMARK, A LAPTOP WOKEN UP. There is no lease to receive because the document that
   * held one is gone, so this is an open and not a retake — and it is the case the whole session
   * layer is shaped around.
   */
  it('opens the session for itself and takes the lease', async () => {
    const { windowA, windowB, routine, clientIds } = await twoWindows();
    const sessionId = await started(windowA, routine, clientIds);
    // The window that started it has gone: its handle is released, exactly as closing a tab does.
    await leaveTheSession(windowA, sessionId);

    const reading = await openTheSession(windowA, sessionId);
    assert.equal(reading.outcome.ok, true);
    assert.equal(heldSessionId(windowA), sessionId, 'the runner opened a session and held nothing');

    const other = await openSession(windowB, sessionId);
    assert.equal(
      other.reason,
      'held_elsewhere',
      'the runner opened a session without taking its lease, so a second window can append to the '
        + 'session this one is running',
    );

    await leaveTheSession(windowA, sessionId);
  });

  it('frees the lease when the coach leaves, so the same session opens again', async () => {
    const { windowA, windowB, routine, clientIds } = await twoWindows();
    const sessionId = await started(windowA, routine, clientIds);
    await openTheSession(windowA, sessionId);

    await leaveTheSession(windowA, sessionId);

    const after2 = await openSession(windowB, sessionId);
    assert.equal(after2.ok, true, `leaving did not release the lease (${after2.reason})`);
    await after2.session?.detach();
  });

  /**
   * TWO OPENS IN FLIGHT AT ONCE would build two handles over one lease — and the first `detach`
   * would then release the lease out from under the other, leaving a runner writing without one.
   * React's development double-mount does exactly this.
   */
  it('serialises two opens of one session into one', async () => {
    const { windowA, routine, clientIds } = await twoWindows();
    const sessionId = await started(windowA, routine, clientIds);
    await leaveTheSession(windowA, sessionId);

    const [first, second] = await Promise.all([
      openTheSession(windowA, sessionId),
      openTheSession(windowA, sessionId),
    ]);

    assert.equal(first.outcome.ok, true);
    assert.equal(second.outcome.ok, true);
    assert.equal(first, second, 'the session was opened twice at once, over one lease');

    await leaveTheSession(windowA, sessionId);
  });
});

describe('a session that cannot be opened', () => {
  it('reports the core\'s own sentence for a session that is not on this device', async () => {
    const { windowA } = await twoWindows();
    const reading = await openTheSession(windowA, 'no-such-session');

    assert.equal(reading.outcome.ok, false);
    assert.equal(reading.outcome.reason, 'not_found');
    assert.ok((reading.outcome.message ?? '').length > 0);
    assert.equal(reading.view, null);
  });

  it('reports the core\'s own sentence for one that has already finished', async () => {
    const { windowA, routine, clientIds } = await twoWindows();
    const sessionId = await started(windowA, routine, clientIds);
    const live = heldSession(windowA, sessionId) as unknown as { complete: () => Promise<unknown> };
    await live.complete();

    const reading = await openTheSession(windowA, sessionId);
    assert.equal(reading.outcome.reason, 'already_finished');
    assert.ok((reading.outcome.message ?? '').length > 0);
  });

  it('reports the core\'s own sentence for one open in the other window', async () => {
    const { windowA, windowB, routine, clientIds } = await twoWindows();
    const sessionId = await started(windowA, routine, clientIds);
    // Window B is the one the coach is looking at; window A is running the session.
    const reading = await openTheSession(windowB, sessionId);

    assert.equal(reading.outcome.reason, 'held_elsewhere');
    assert.match(reading.outcome.message ?? '', /other window/);
    assert.equal(reading.view, null);

    await leaveTheSession(windowA, sessionId);
  });
});

describe('holding the session while the screen is on it', () => {
  it('publishes what it read, and leaving releases the lease', async () => {
    const { windowA, windowB, routine, clientIds } = await twoWindows();
    const sessionId = await started(windowA, routine, clientIds);

    let leave = () => {};
    const published = await new Promise<SessionReading>((resolve) => {
      leave = openSessionInto(windowA, sessionId, resolve);
    });

    assert.equal(
      published.outcome.ok,
      true,
      'nothing usable was published, so the screen would sit on "opening" for ever',
    );
    assert.equal(published.view?.session_id, sessionId);

    leave();
    await settle();

    const other = await openSession(windowB, sessionId);
    assert.equal(other.ok, true, `the session stayed locked after the screen left (${other.reason})`);
    await other.session?.detach();
  });

  /**
   * A REACT CLEANUP RUNS ON UNMOUNT **AND** BETWEEN TWO RUNS OF THE SAME EFFECT, and the second is
   * not the coach going anywhere. A release that happened immediately would detach the session the
   * screen is about to show, on every development double-mount and on every dependency change.
   */
  it('keeps the session when the screen re-reads rather than leaves', async () => {
    const { windowA, windowB, routine, clientIds } = await twoWindows();
    const sessionId = await started(windowA, routine, clientIds);

    let leave = () => {};
    await new Promise<SessionReading>((resolve) => {
      leave = openSessionInto(windowA, sessionId, resolve);
    });

    // The cleanup and the second run, back to back, exactly as React does it.
    leave();
    let leaveAgain = () => {};
    await new Promise<SessionReading>((resolve) => {
      leaveAgain = openSessionInto(windowA, sessionId, resolve);
    });
    await settle();

    assert.equal(
      heldSessionId(windowA),
      sessionId,
      'the session was released by an effect re-running, so the screen is now showing a session '
        + 'this window no longer holds and its first write will be refused',
    );
    const other = await openSession(windowB, sessionId);
    assert.equal(other.reason, 'held_elsewhere');

    leaveAgain();
    await settle();
  });
});
