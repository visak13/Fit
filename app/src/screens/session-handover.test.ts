/**
 * THE HANDOVER'S OWN RULES, DRIVEN AGAINST REAL STORES.
 *
 * `launcher-source.test.ts` proves the property this exists for — the lease passes from the calendar
 * to the runner, on both doors, and a second window is refused while it is held. This file holds the
 * three rules that make a singleton safe to hold a lease in, each of which fails in a way that looks
 * exactly like working software:
 *
 *   1. CLAIMING DOES NOT CONSUME. React's development double-mount runs an effect, cleans up and runs
 *      it again; a consuming read would leave the second run with nothing, so it would call
 *      `openSession` and be refused `held_elsewhere` — by its own handle, in its own window.
 *   2. AT MOST ONE. Handing over a different session releases the one held before it. An unclaimed
 *      handle from a previous attempt is a lease nobody can release, and nothing would report it: the
 *      session simply stops being openable, in the window the coach is looking at.
 *   3. A HANDLE BELONGS TO THE STORE IT WAS OPENED ON. A store that has been replaced makes its
 *      handles answers to a question nobody is asking any more.
 *
 * Two windows on one laptop wherever the assertion is about the lease, because that is the only shape
 * in which a lease can be refused at all: within one window `acquireSessionLease` deliberately hands
 * back the lease it already holds.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { aClient, anExercise, aRoutine } from '../../core/model/fixtures.js';
import { openSession, startSession } from '../../core/session/live-session.js';
import { openLocalStore } from '../../core/store/store.js';
import { createTwoWindowLaptop } from '../../core/store/testing/platform-double.js';
import { handOver, heldSession, heldSessionId, releaseHeldSession } from './session-handover';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const opened: any[] = [];

after(async () => {
  for (const store of opened) {
    // eslint-disable-next-line no-await-in-loop
    await store.close();
  }
});

const EXERCISE = 'test-handover-press';

/** Two windows on one laptop, and a routine and a person to run a session with. */
async function twoWindows() {
  const { a, b } = createTwoWindowLaptop();
  const windowA = await openLocalStore({ platform: a, device: 'coach-laptop' });
  const windowB = await openLocalStore({ platform: b, device: 'coach-laptop' });
  opened.push(windowA, windowB);

  await windowA.create('exercise', anExercise({ id: EXERCISE }));
  const routine = await windowA.create('routine', aRoutine({
    id: 'test-handover-holder-routine',
    name: 'Test Handover Holder Routine',
    entries: [{ exercise_id: EXERCISE, sets: 3, repetitions: 12 }],
  }));
  const client = await windowA.create('client', aClient({ name: 'Test Client A' }));

  return { windowA, windowB, routine, clientIds: [client.record_id] };
}

/** Start a session in a window and take it over, exactly as the launcher does. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function startAndHold(store: any, routine: any, clientIds: string[]) {
  const outcome = await startSession(store, {
    routineId: routine.content.id, clientIds, mode: 'in_person', routine,
  });
  assert.equal(outcome.ok, true);
  return handOver(store, outcome).session_id as string;
}

describe('taking over a session', () => {
  it('keeps the handle and gives the caller back everything the core said', async () => {
    const { windowA, routine, clientIds } = await twoWindows();
    const outcome = await startSession(windowA, {
      routineId: routine.content.id, clientIds, mode: 'in_person', routine,
    });

    const handed = handOver(windowA, outcome);
    assert.equal(handed.ok, true);
    assert.equal(handed.session_id, outcome.session_id);
    assert.equal(
      (handed as { session?: unknown }).session,
      undefined,
      'the handle travelled out with the outcome, so a caller can hold a lease by accident',
    );
    assert.ok(heldSession(windowA, outcome.session_id as string) !== null);

    await releaseHeldSession(windowA, outcome.session_id as string);
  });

  it('answers the same handle however often it is asked, so a re-mounted screen is not locked out',
    async () => {
      const { windowA, routine, clientIds } = await twoWindows();
      const sessionId = await startAndHold(windowA, routine, clientIds);

      const first = heldSession(windowA, sessionId);
      const second = heldSession(windowA, sessionId);
      assert.ok(first !== null);
      assert.equal(
        second,
        first,
        'asking twice consumed the handle. The second run of a re-run effect would then open the '
          + 'session for itself and be refused held_elsewhere — by its own handle, in its own window',
      );

      await releaseHeldSession(windowA, sessionId);
    });

  it('says which session this window is running, and nothing once it has left', async () => {
    const { windowA, routine, clientIds } = await twoWindows();
    const sessionId = await startAndHold(windowA, routine, clientIds);

    assert.equal(heldSessionId(windowA), sessionId);
    await releaseHeldSession(windowA, sessionId);
    assert.equal(heldSessionId(windowA), null);
  });

  it('holds nothing when the core refused, because a refusal carries no handle', async () => {
    const { windowA } = await twoWindows();
    const refused = await openSession(windowA, 'no-such-session');

    const handed = handOver(windowA, refused);
    assert.equal(handed.ok, false);
    assert.equal(handed.reason, 'not_found');
    assert.ok((handed.message ?? '').length > 0);
    assert.equal(heldSessionId(windowA), null);
  });

  /**
   * PROVEN BY CONSEQUENCE: the first session opens again in the other window, which it could not do
   * if its lease were still held by a handle nobody can reach.
   */
  it('releases the session it was holding when a different one is handed over', async () => {
    const { windowA, windowB, routine, clientIds } = await twoWindows();
    const first = await startAndHold(windowA, routine, clientIds);
    assert.equal((await openSession(windowB, first)).reason, 'held_elsewhere');

    const second = await startAndHold(windowA, routine, clientIds);
    assert.notEqual(second, first);
    // The release is scheduled as the second handover lands; it is a promise, not a synchronous act.
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const reopened = await openSession(windowB, first);
    assert.equal(
      reopened.ok,
      true,
      `the first session stayed locked (${reopened.reason}) after a second was handed over. Its `
        + 'handle is unreachable, so that lease can now only be released by closing the window',
    );
    await reopened.session?.detach();

    assert.equal(heldSessionId(windowA), second);
    await releaseHeldSession(windowA, second);
  });

  it('does not answer for a store the handle does not belong to', async () => {
    const { windowA, windowB, routine, clientIds } = await twoWindows();
    const sessionId = await startAndHold(windowA, routine, clientIds);

    assert.equal(
      heldSession(windowB, sessionId),
      null,
      'a handle opened on one store was offered as the answer for another',
    );
    assert.equal(heldSessionId(windowB), null);

    await releaseHeldSession(windowA, sessionId);
  });
});

describe('leaving', () => {
  /**
   * LEAVING IS NOT ENDING. `detach` releases the lease and says nothing about the session's state:
   * it stays exactly where a power cut would have left it, which is `in_progress` and resumable. A
   * runner that ended a session because the coach tapped back would have destroyed the thing the
   * lease was protecting.
   */
  it('frees the lease and leaves the session in progress rather than ending it', async () => {
    const { windowA, windowB, routine, clientIds } = await twoWindows();
    const sessionId = await startAndHold(windowA, routine, clientIds);

    await releaseHeldSession(windowA, sessionId);

    const stored = await windowA.get('session', sessionId);
    assert.equal(
      stored.content.status,
      'in_progress',
      'leaving ended the session. interrupt, complete and abandon are the three endings and none of '
        + 'them is what the back button means',
    );
    assert.equal(stored.content.ended_at, undefined);

    const reopened = await openSession(windowB, sessionId);
    assert.equal(reopened.ok, true, `the lease was not released by leaving (${reopened.reason})`);
    await reopened.session?.detach();
  });

  it('is harmless when there is nothing held', async () => {
    const { windowA } = await twoWindows();
    await releaseHeldSession(windowA, 'no-such-session');
    assert.equal(heldSessionId(windowA), null);
  });
});
