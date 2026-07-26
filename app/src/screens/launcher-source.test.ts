/**
 * THE LAUNCHER'S READS AND ITS ONE WRITE, DRIVEN AGAINST A REAL STORE.
 *
 * Nothing here is a stub. Every test opens the core's own in-process database — the same one the
 * store's own gate runs on — writes real records through the real schema, and starts real sessions
 * through the real runner. A suite satisfied by a shape would pass just as happily against a mock
 * that had quietly stopped agreeing with the record model, and the whole point of this action is a
 * field the record enforces.
 *
 * ## THE PROPERTY THIS FILE EXISTS FOR
 *
 * **The coach's answer about where the session happened is what gets written, and nothing invents
 * one.** `core/session/live-session.js` used to default a missing mode to `online`; that fallback is
 * gone and this screen is the caller that replaced it. So both directions are proven by READING THE
 * RECORD BACK from the store: his answer arrives intact, and an in-person session carries no link
 * and no link origin — which is the whole of "in person creates nothing remote", since a link is the
 * only trace a remote call could have left.
 *
 * ## AND THE LEASE, WHICH IS NOW HANDED OVER RATHER THAN LET GO
 *
 * This file used to assert the opposite property and it was right at the time: a started session was
 * LET GO, because no screen could run one and a held lease would have locked the coach out of his own
 * session from every window. The runner exists now, so the handle PASSES to it.
 *
 * PROVEN BY CONSEQUENCE, NOT BY STATEMENT, which is the standard the release was held to and the
 * reason that test read the way it did. Reading a hand-over statement, or a comment saying the handle
 * was passed, proves only that the statement exists. What proves it is what the lease then does:
 * while this window holds the session, a SECOND WINDOW — a genuinely separate document, sharing one
 * database and one lock manager — is refused with `held_elsewhere` and the sentence the core wrote
 * for the coach; and once the runner leaves, the same session opens there. Both directions, on BOTH
 * doors, because picking a session up is the same operation as starting one and a handover written
 * for one door strands the other.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { aClient, anExercise, aRoutine } from '../../core/model/fixtures.js';
import { openSession } from '../../core/session/live-session.js';
import { openLocalStore } from '../../core/store/store.js';
import { createLaptop, createTwoWindowLaptop } from '../../core/store/testing/platform-double.js';
import {
  HISTORY_LIMIT, UNFINISHED_LIMIT, pickUpTheSession, readExerciseNames, readGlances, readHistory,
  readLaunchpad, startTheSession,
} from './launcher-source';
import { heldSession, releaseHeldSession } from './session-handover';

/** Stores opened by this file, closed once at the end whatever happened. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const opened: any[] = [];

after(async () => {
  for (const store of opened) {
    // eslint-disable-next-line no-await-in-loop
    await store.close();
  }
});

const EXERCISE = 'test-launcher-push';

/**
 * A store with a routine and a roster in it.
 *
 * Names invented and deliberately unmistakable: this repository is public by an explicit decision,
 * and no real person appears anywhere in this tree.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aFurnishedStore(names: string[] = ['Test Client A']): Promise<any> {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });
  opened.push(store);

  await store.create('exercise', anExercise({ id: EXERCISE }));
  const routine = await store.create('routine', aRoutine({
    id: 'test-launcher-routine',
    name: 'Test Launcher Routine',
    entries: [{ exercise_id: EXERCISE, sets: 3, repetitions: 12 }],
  }));

  const clientIds: string[] = [];
  for (const name of names) {
    // eslint-disable-next-line no-await-in-loop
    const record = await store.create('client', aClient({ name }));
    clientIds.push(record.record_id);
  }

  return { store, routine, clientIds };
}

describe('reading the launchpad', () => {
  it('offers the roster, the library and anything left unfinished in one read', async () => {
    const { store, clientIds } = await aFurnishedStore(['Test Client A', 'Test Client B']);
    const pad = await readLaunchpad(store);

    assert.equal(pad.clients.items.length, 2);
    assert.equal(pad.routines.items.length, 1);
    assert.deepEqual(pad.unfinished, []);
    // The cursor and the end marker are carried, never dropped: dropping `done` silently turns
    // "there are more than these" into a claim that this is all of them.
    assert.equal(typeof pad.clients.done, 'boolean');
    assert.ok(clientIds.length === 2);
  });

  it('does not offer somebody he has archived as a person to train today', async () => {
    const { store, clientIds } = await aFurnishedStore(['Test Client A', 'Test Client B']);
    await store.update('client', clientIds[0], (content: Record<string, unknown>) => ({
      ...content, active: false,
    }));

    const pad = await readLaunchpad(store);
    assert.deepEqual(
      pad.clients.items.map((client) => client.record_id),
      [clientIds[1]],
      'an archived client was offered on the launcher, which would undo the archiving',
    );
  });
});

describe('starting a session', () => {
  it('writes the coach\'s own answer about where it happened, on the online path', async () => {
    const { store, routine, clientIds } = await aFurnishedStore();

    const outcome = await startTheSession(store, {
      routineId: routine.content.id, clientIds, mode: 'online', meetUrl: null,
    });
    assert.equal(outcome.ok, true);

    const stored = await store.get('session', outcome.session_id);
    assert.equal(stored.content.mode, 'online');
  });

  /**
   * IN PERSON CREATES NOTHING REMOTE, proven from the record rather than from the code.
   *
   * A link is the only trace a remote call could have left behind, and the record refuses one on an
   * in-person session outright — so its absence here is the whole promise, checked at the one place
   * it could have been broken.
   */
  it('writes in person, and stores no link and no link origin with it', async () => {
    const { store, routine, clientIds } = await aFurnishedStore();

    const outcome = await startTheSession(store, {
      routineId: routine.content.id, clientIds, mode: 'in_person', meetUrl: null,
    });
    assert.equal(outcome.ok, true);

    const stored = await store.get('session', outcome.session_id);
    assert.equal(stored.content.mode, 'in_person');
    assert.equal(stored.content.meet_url, undefined);
    assert.equal(stored.content.meet_source, undefined);
  });

  it('keeps a link he pasted, and records that it was pasted rather than minted', async () => {
    const { store, routine, clientIds } = await aFurnishedStore();

    const outcome = await startTheSession(store, {
      routineId: routine.content.id,
      clientIds,
      mode: 'online',
      meetUrl: 'https://meet.google.com/abc-defg-hij',
    });
    assert.equal(outcome.ok, true);

    const stored = await store.get('session', outcome.session_id);
    assert.equal(stored.content.meet_url, 'https://meet.google.com/abc-defg-hij');
    assert.equal(
      stored.content.meet_source,
      'pasted',
      'a link the coach pasted was recorded as minted, which claims this app created a call it did not',
    );
  });

  it('takes one to many people against a single routine', async () => {
    const { store, routine, clientIds } = await aFurnishedStore(['Test Client A', 'Test Client B']);

    const outcome = await startTheSession(store, {
      routineId: routine.content.id, clientIds, mode: 'in_person', meetUrl: null,
    });
    assert.equal(outcome.ok, true);

    const stored = await store.get('session', outcome.session_id);
    assert.deepEqual(stored.content.client_ids, clientIds);
    assert.equal(stored.content.routine_id, routine.content.id);
  });

  /**
   * THE HANDLE IS KEPT FOR THE RUNNER. Asserted on the handover itself, so that the two-window
   * proofs below are about what the lease DOES rather than about whether anything was stored.
   */
  it('keeps the live handle for the runner instead of letting it go', async () => {
    const { store, routine, clientIds } = await aFurnishedStore();

    const started = await startTheSession(store, {
      routineId: routine.content.id, clientIds, mode: 'in_person', meetUrl: null,
    });
    assert.equal(started.ok, true);
    assert.ok(
      heldSession(store, started.session_id as string) !== null,
      'the session started and its handle was dropped, so the runner is handed a session it does '
        + 'not hold and is refused by the store at its first write, in front of a waiting client',
    );

    await releaseHeldSession(store, started.session_id as string);
  });
});

/**
 * THE LEASE HANDOVER, PROVEN BY CONSEQUENCE ON BOTH DOORS.
 *
 * Two windows on one laptop, sharing one database and one lock manager — the shape of the real
 * requirement, and the only shape in which `held_elsewhere` can happen at all: within ONE window
 * `acquireSessionLease` hands back the lease it already holds, deliberately, so a test that asked the
 * same store twice would prove nothing and would report a pass for it.
 */
describe('the lease handover', () => {
  /** Two windows on one laptop, furnished through the first. */
  async function twoWindows(names: string[] = ['Test Client A']) {
    const { a, b } = createTwoWindowLaptop();
    const windowA = await openLocalStore({ platform: a, device: 'coach-laptop' });
    const windowB = await openLocalStore({ platform: b, device: 'coach-laptop' });
    opened.push(windowA, windowB);

    await windowA.create('exercise', anExercise({ id: EXERCISE }));
    const routine = await windowA.create('routine', aRoutine({
      id: 'test-handover-routine',
      name: 'Test Handover Routine',
      entries: [{ exercise_id: EXERCISE, sets: 3, repetitions: 12 }],
    }));

    const clientIds: string[] = [];
    for (const name of names) {
      // eslint-disable-next-line no-await-in-loop
      const record = await windowA.create('client', aClient({ name }));
      clientIds.push(record.record_id);
    }

    return { windowA, windowB, routine, clientIds };
  }

  it('holds a STARTED session, so the other window is refused in the core\'s own words', async () => {
    const { windowA, windowB, routine, clientIds } = await twoWindows();

    const started = await startTheSession(windowA, {
      routineId: routine.content.id, clientIds, mode: 'in_person', meetUrl: null,
    });
    assert.equal(started.ok, true);
    const sessionId = started.session_id as string;

    const other = await openSession(windowB, sessionId);
    assert.equal(
      other.ok,
      false,
      'a second window opened a session this one is running, which is the two-windows-one-session '
        + 'failure the lease exists to prevent — reintroduced by a handover that dropped the lease',
    );
    assert.equal(other.reason, 'held_elsewhere');
    assert.ok(
      (other.message ?? '').length > 0,
      'the refusal arrived with no sentence, so the other window has nothing to show the coach',
    );

    await releaseHeldSession(windowA, sessionId);
  });

  it('frees a STARTED session once the runner leaves, so the same session opens again', async () => {
    const { windowA, windowB, routine, clientIds } = await twoWindows();

    const started = await startTheSession(windowA, {
      routineId: routine.content.id, clientIds, mode: 'in_person', meetUrl: null,
    });
    const sessionId = started.session_id as string;
    assert.equal((await openSession(windowB, sessionId)).reason, 'held_elsewhere');

    // LEAVING, which is `detach` and none of the three endings.
    await releaseHeldSession(windowA, sessionId);

    const after = await openSession(windowB, sessionId);
    assert.equal(
      after.ok,
      true,
      `the session could not be opened after the runner left (${after.reason}), so leaving does not `
        + 'release the lease and the coach is locked out of his own session from every window',
    );
    await after.session?.detach();
  });

  /**
   * THE DOOR NOBODY TESTS. Picking up an unfinished session is the SAME operation as starting one,
   * and a handover written for the start path alone strands every RESUMED session with a runner
   * holding no lease — the case a real coach meets after a power cut.
   */
  it('holds a RESUMED session too, and frees it the same way', async () => {
    const { windowA, windowB, routine, clientIds } = await twoWindows();

    const started = await startTheSession(windowA, {
      routineId: routine.content.id, clientIds, mode: 'in_person', meetUrl: null,
    });
    const sessionId = started.session_id as string;
    // He left it. The session stands at `in_progress`, exactly where a power cut leaves one.
    await releaseHeldSession(windowA, sessionId);

    const resumed = await pickUpTheSession(windowA, sessionId, routine);
    assert.equal(resumed.ok, true, `the unfinished session could not be picked up (${resumed.reason})`);
    assert.ok(
      heldSession(windowA, sessionId) !== null,
      'a resumed session was picked up and its handle dropped, which is the half of the handover '
        + 'that gets forgotten and the case nobody tries',
    );

    const other = await openSession(windowB, sessionId);
    assert.equal(other.reason, 'held_elsewhere', 'a resumed session was not held at all');

    await releaseHeldSession(windowA, sessionId);
    const after = await openSession(windowB, sessionId);
    assert.equal(after.ok, true, `a resumed session stayed locked after leaving (${after.reason})`);
    await after.session?.detach();
  });

  /**
   * The refusal's sentence says the session is open in his OTHER window. Asking the store for a
   * lease THIS window already holds would produce that sentence about a window he is looking at.
   */
  it('hands back what this window already holds rather than reopening it', async () => {
    const { windowA, routine, clientIds } = await twoWindows();

    const started = await startTheSession(windowA, {
      routineId: routine.content.id, clientIds, mode: 'in_person', meetUrl: null,
    });
    const sessionId = started.session_id as string;
    const held = heldSession(windowA, sessionId);

    const again = await pickUpTheSession(windowA, sessionId, routine);
    assert.equal(again.ok, true, `picking up a session this window is running was refused (${again.reason})`);
    assert.equal(
      heldSession(windowA, sessionId),
      held,
      'the session this window is running was reopened, so it is now held by a second handle',
    );

    await releaseHeldSession(windowA, sessionId);
  });
});

describe('picking a session back up', () => {
  it('finds a started session among the unfinished ones, as an ordinary start', async () => {
    const { store, routine, clientIds } = await aFurnishedStore();
    const started = await startTheSession(store, {
      routineId: routine.content.id, clientIds, mode: 'online', meetUrl: null,
    });

    const pad = await readLaunchpad(store);
    assert.deepEqual(
      pad.unfinished.map((session) => session.record_id),
      [started.session_id],
    );
    assert.ok(pad.unfinished.length <= UNFINISHED_LIMIT);
  });

  it('returns the core\'s own sentence when there is no such session, rather than throwing', async () => {
    const { store } = await aFurnishedStore();
    const outcome = await pickUpTheSession(store, 'no-such-session');

    assert.equal(outcome.ok, false);
    assert.equal(outcome.reason, 'not_found');
    assert.ok(
      (outcome.message ?? '').length > 0,
      'a refusal arrived with no sentence, so the screen has nothing to show the coach',
    );
  });
});

describe('the previous session at a glance', () => {
  it('returns nothing at all for a client\'s first session', async () => {
    const { store, clientIds } = await aFurnishedStore();
    const found = await readGlances(store, clientIds);

    assert.equal(found.length, 1);
    assert.equal(
      found[0].glance,
      null,
      'a client with no history got something back, so the first-session wording would never be shown',
    );
  });

  it('returns the previous session once there is one, per person', async () => {
    const { store, routine, clientIds } = await aFurnishedStore(['Test Client A', 'Test Client B']);

    const started = await startTheSession(store, {
      routineId: routine.content.id, clientIds: [clientIds[0]], mode: 'in_person', meetUrl: null,
    });
    assert.equal(started.ok, true);

    const found = await readGlances(store, clientIds);
    const [first, second] = found;

    assert.equal(first.clientId, clientIds[0]);
    assert.ok(first.glance !== null, 'the person who trained has no previous session');
    assert.equal(first.glance.session_id, started.session_id);
    // One client's history must never appear in another's view, even when the session was shared —
    // and this one was not shared at all.
    assert.equal(second.glance, null);
  });
});

describe('the names of the exercises a glance mentions', () => {
  it('resolves a content key to the name the coach gave it, by keyed lookup', async () => {
    const { store, routine, clientIds } = await aFurnishedStore();
    const started = await startTheSession(store, {
      routineId: routine.content.id, clientIds, mode: 'in_person', meetUrl: null,
    });
    const held = await openSession(store, started.session_id as string);
    assert.ok(held.session !== undefined);
    await held.session.recordPerformed(clientIds[0], {
      exerciseId: EXERCISE, sets: 3, repetitions: 12, observedLoad: '40kg',
    });
    await held.session.complete();

    const named = await readExerciseNames(store, await readGlances(store, clientIds));
    const stored = await store.getByContentKey('exercise', EXERCISE);
    assert.equal(named.get(EXERCISE), stored.content.name);
  });

  it('asks for nothing at all when there is no history to name', async () => {
    const { store, clientIds } = await aFurnishedStore();
    const named = await readExerciseNames(store, await readGlances(store, clientIds));
    assert.equal(named.size, 0);
  });
});

describe('the sessions already done', () => {
  it('lists a shared session ONCE, not once per person in it', async () => {
    const { store, routine, clientIds } = await aFurnishedStore(['Test Client A', 'Test Client B']);

    const started = await startTheSession(store, {
      routineId: routine.content.id, clientIds, mode: 'in_person', meetUrl: null,
    });
    assert.equal(started.ok, true);

    // Finished, so it is history rather than something still offered for pick-up.
    const held = await openSession(store, started.session_id as string);
    assert.ok(held.session !== undefined, 'the finished session could not be reopened to finish it');
    await held.session.complete();

    const found = await readHistory(store, clientIds);
    assert.deepEqual(
      found.map((session) => session.record_id),
      [started.session_id],
      'a session two people attended was listed twice, which tells the coach he ran two',
    );
  });

  /**
   * A session cannot be both offered for pick-up and reported as done. Found by looking at the
   * rendered screen: a still-open session was listed under "Sessions already done" carrying the
   * words "Still open", while the same session sat in the pick-up panel above it.
   */
  it('leaves out a session that is still open, because it is offered for pick-up instead', async () => {
    const { store, routine, clientIds } = await aFurnishedStore();
    const started = await startTheSession(store, {
      routineId: routine.content.id, clientIds, mode: 'online', meetUrl: null,
    });

    const pad = await readLaunchpad(store);
    assert.deepEqual(pad.unfinished.map((session) => session.record_id), [started.session_id]);
    assert.deepEqual(
      await readHistory(store, clientIds),
      [],
      'a session was reported as already done and offered for pick-up at the same time',
    );
  });

  it('is empty for people with no history, and never more than it offers to show', async () => {
    const { store, clientIds } = await aFurnishedStore();
    const found = await readHistory(store, clientIds);
    assert.deepEqual(found, []);
    assert.ok(found.length <= HISTORY_LIMIT);
  });

  it('is empty rather than everything when nobody has been chosen', async () => {
    const { store, routine, clientIds } = await aFurnishedStore();
    await startTheSession(store, {
      routineId: routine.content.id, clientIds, mode: 'online', meetUrl: null,
    });

    assert.deepEqual(await readHistory(store, []), []);
    assert.deepEqual(await readGlances(store, []), []);
  });
});
