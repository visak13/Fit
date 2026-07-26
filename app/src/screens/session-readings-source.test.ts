/**
 * READINGS, NOTES AND THE PREVIOUS SESSION, DRIVEN THROUGH THE INTERFACE AND READ BACK OFF THE RECORD.
 *
 * Nothing here is a stub. Every test opens the core's own in-process database — the same one the
 * store's own gate runs on — writes real records through the real schema, opens a real session through
 * the real handover, and reads the session back through the REAL `projectSession`. A capture is
 * asserted by what the record says afterwards and never by the call having returned.
 *
 * That is the whole point of this file. `core/session/multi-client.test.js` already proves per-client
 * isolation against the core's verbs and `glance.test.js` already proves the panel; what nobody has
 * proven until here is that THIS SURFACE reaches those verbs, with the right arguments, and that the
 * glance it shows is the session BEFORE the one being run. A defect between two individually correct
 * components is invisible to both of their own suites.
 *
 * TWO WINDOWS wherever the assertion is about the lease: within ONE window `acquireSessionLease` hands
 * back the lease it already holds, so a test that asked the same store twice would prove nothing and
 * would report a pass for it.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { aClient, anExercise, aRoutine } from '../../core/model/fixtures.js';
import { appendReading } from '../../core/session/journal.js';
import { startSession } from '../../core/session/live-session.js';
import { clientViewOf } from '../../core/session/projection.js';
import { openLocalStore } from '../../core/store/store.js';
import { createTwoWindowLaptop } from '../../core/store/testing/platform-double.js';
import { NOT_HELD_HERE } from './modular-control';
import { readTheSessionBack } from './modular-control-source';
import type { MoveResult } from './modular-control-source';
import { readTheGlances, recordTheNote, recordTheReading } from './session-readings-source';
import { handOver, heldSession } from './session-handover';
import { leaveTheSession } from './runner-source';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const opened: any[] = [];

after(async () => {
  for (const store of opened) {
    // eslint-disable-next-line no-await-in-loop
    await store.close();
  }
});

const PRESS = 'test-readings-press';
const SQUAT = 'test-readings-squat';
const PLANK = 'test-readings-plank';

const HEART = 'heart-rate';
const HOLD = 'plank-hold';

/** The day the previous session happened on, and the day this one does. Pinned, not the clock. */
const LAST_WEEK = '2026-07-19T09:00:00.000Z';
const TODAY = '2026-07-26T09:00:00.000Z';

/** A reading as this surface would send it. */
function aReading(over: Record<string, unknown> = {}) {
  return { kind: HEART, value: 128, unit: 'bpm', context: 'in_session', ...over };
}

/**
 * A furnished laptop with two windows, a routine of three lines, and however many people are asked
 * for — with a session started TODAY and handed over, the way the calendar hands it to the runner.
 */
async function aLaptop(people: string[] = ['Test Reading Client A']) {
  const { a, b } = createTwoWindowLaptop();
  const windowA = await openLocalStore({ platform: a, device: 'coach-laptop' });
  const windowB = await openLocalStore({ platform: b, device: 'coach-laptop' });
  opened.push(windowA, windowB);

  await windowA.create('exercise', anExercise({ id: PRESS, name: 'Bench press' }));
  await windowA.create('exercise', anExercise({ id: SQUAT, name: 'Back squat' }));
  await windowA.create('exercise', anExercise({ id: PLANK, name: 'Front plank' }));

  const routine = await windowA.create('routine', aRoutine({
    id: 'test-readings-routine',
    name: 'Test Readings Routine',
    entries: [
      { exercise_id: PRESS, sets: 3, repetitions: 12 },
      { exercise_id: SQUAT, sets: 4, repetitions: 8 },
      { exercise_id: PLANK, duration_seconds: 60, rest_seconds: 30 },
    ],
  }));

  const clientIds: string[] = [];
  for (const name of people) {
    // eslint-disable-next-line no-await-in-loop
    const record = await windowA.create('client', aClient({ name }));
    clientIds.push(record.record_id);
  }

  const outcome = await startSession(windowA, {
    routineId: routine.content.id, clientIds, mode: 'in_person', routine, now: TODAY,
  });
  assert.equal(outcome.ok, true);
  const sessionId = handOver(windowA, outcome).session_id as string;

  return { windowA, windowB, sessionId, clientIds, routine };
}

/** What a capture landed on the record, or the sentence saying why it did not. */
function landed(result: MoveResult): NonNullable<MoveResult['reading']> {
  assert.equal(result.ok, true, `the capture was refused: ${result.refusal?.headline ?? '(no reason)'}`);
  assert.notEqual(result.reading, null, 'the capture landed but handed back no session, so the screen '
    + 'would go on showing the record as it was before the fact');
  return result.reading as NonNullable<MoveResult['reading']>;
}

/** One person's slice of what a capture handed back. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mine(result: MoveResult, clientId: string): any {
  const client = clientViewOf(landed(result).view as never, clientId);
  assert.notEqual(client, null, 'that person is not in the session the capture handed back');
  return client;
}

describe('a reading, against one person, at any moment', () => {
  /**
   * THE RECORD IS ASKED, not the call. A reading is a fact against ONE client with the kind, the value,
   * the unit and the context the surface sent — and nothing else on this person's record moves.
   */
  it('records the kind, the number, the unit and when it was taken', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop();

    const client = mine(
      await recordTheReading(windowA, sessionId, clientIds[0], aReading()),
      clientIds[0],
    );

    assert.equal(client.readings.length, 1);
    assert.equal(client.readings[0].content.kind, HEART);
    assert.equal(client.readings[0].content.value, 128);
    assert.equal(client.readings[0].content.unit, 'bpm');
    assert.equal(client.readings[0].content.context, 'in_session');
    assert.equal(client.counts.readings, 1);
    // NOTHING ELSE MOVED. A reading is not an exercise and it is not a note.
    assert.equal(client.counts.performed, 0);
    assert.equal(client.counts.notes, 0);
  });

  /**
   * DURING THE SESSION OR JUST AFTER IT, and both from inside the routine rather than from a separate
   * place he has to go to. The context reaches the record as the one he chose.
   */
  it('records one taken just after the session as that, and not as one taken during it', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop();

    const client = mine(
      await recordTheReading(windowA, sessionId, clientIds[0], aReading({
        kind: HOLD, value: 62, unit: 'seconds', context: 'post_session', note: 'Held it well',
      })),
      clientIds[0],
    );

    assert.equal(client.readings[0].content.context, 'post_session');
    assert.equal(client.readings[0].content.note, 'Held it well');
  });

  /** A kind he invented, with the unit he named. The vocabulary is open and the record accepts one. */
  it('records a kind of his own', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop();

    const client = mine(
      await recordTheReading(windowA, sessionId, clientIds[0], aReading({
        kind: 'grip-strength', value: 34, unit: 'count',
      })),
      clientIds[0],
    );

    assert.equal(client.readings[0].content.kind, 'grip-strength');
    assert.equal(client.readings[0].content.unit, 'count');
  });

  /**
   * A READING FOR ONE OF THREE, AND IT REACHES THAT ONE ONLY.
   *
   * The requirement is specifically about the SECOND of three attendees. Each person's readings and
   * notes are their own even though the session was shared, and this is the assertion that the screen
   * does not undo what the projection keeps apart.
   */
  it('reaches the second of three attendees and neither of the others', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop([
      'Test Reading Client A', 'Test Reading Client B', 'Test Reading Client C',
    ]);
    const [first, second, third] = clientIds;

    const result = await recordTheReading(windowA, sessionId, second, aReading({ value: 131 }));

    assert.equal(mine(result, second).readings.length, 1);
    assert.equal(mine(result, second).readings[0].content.value, 131);
    assert.equal(mine(result, first).readings.length, 0, 'a reading crossed to another attendee');
    assert.equal(mine(result, third).readings.length, 0, 'a reading crossed to another attendee');
  });

  it('keeps three people\'s readings and notes strictly apart', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop([
      'Test Reading Client A', 'Test Reading Client B', 'Test Reading Client C',
    ]);

    for (let at = 0; at < clientIds.length; at += 1) {
      // eslint-disable-next-line no-await-in-loop
      landed(await recordTheReading(windowA, sessionId, clientIds[at], aReading({
        value: 100 + at,
      })));
      // eslint-disable-next-line no-await-in-loop
      landed(await recordTheNote(windowA, sessionId, clientIds[at], `Note for person ${at}.`));
    }

    const readBack = await readTheSessionBack(windowA, sessionId);
    for (let at = 0; at < clientIds.length; at += 1) {
      const client = mine(readBack, clientIds[at]);
      assert.deepEqual(
        client.readings.map((record: { content: { value: number } }) => record.content.value),
        [100 + at],
        'one person\'s readings are not only their own',
      );
      assert.deepEqual(
        client.notes.map((record: { content: { text: string } }) => record.content.text),
        [`Note for person ${at}.`],
        'one person\'s notes are not only their own',
      );
    }
  });

  /**
   * SOMEBODY NOT IN THE SESSION IS REFUSED WITH THE CORE'S OWN SENTENCE, not with this screen's.
   *
   * An ordinary situation is reported as a value; the sentence tells him what to do about it. Rewording
   * it here would be two sentences about one refusal, free to drift apart.
   */
  it('refuses a reading for somebody who is not attending, in the core\'s words', async () => {
    const { windowA, sessionId } = await aLaptop();
    const stranger = await windowA.create('client', aClient({ name: 'Test Reading Stranger' }));

    const result = await recordTheReading(windowA, sessionId, stranger.record_id, aReading());

    assert.equal(result.ok, false);
    assert.match(String(result.refusal?.headline), /not in this session/);
    assert.equal(result.refusal?.journalFull, false);
  });

  /**
   * A WINDOW HOLDING NO LEASE IS TOLD, and nothing is attempted.
   *
   * A session-scoped write with no lease is refused by the store inside the transaction that would
   * have written it, so attempting it anyway would fail in front of a client for no benefit. TWO real
   * windows, because within one the lease is handed straight back.
   */
  it('tells him when this window is not holding the session, rather than writing anyway', async () => {
    const { windowB, sessionId, clientIds } = await aLaptop();

    const result = await recordTheReading(windowB, sessionId, clientIds[0], aReading());

    assert.equal(result.ok, false);
    assert.equal(result.refusal?.headline, NOT_HELD_HERE);
    assert.equal(result.reading, null);
  });
});

describe('a note, about one person or about the session', () => {
  /**
   * THE TWO ARE DIFFERENT FACTS AND THE DIFFERENCE IS A CLIENT IDENTITY BEING THERE.
   *
   * A note WITH a client follows them into their progress view and their export; a note WITHOUT one is
   * about the session and belongs to nobody. Inferring one from the other would put one client's note
   * into another's export, so both directions are asserted: the person's note is not in the session's
   * list, and the session's note is in nobody's.
   */
  it('puts a person\'s note on them and the session\'s note on nobody', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop([
      'Test Reading Client A', 'Test Reading Client B',
    ]);
    const [first, second] = clientIds;

    landed(await recordTheNote(windowA, sessionId, first, 'Tired today.'));
    const result = await recordTheNote(windowA, sessionId, null, 'The connection dropped twice.');
    const view = landed(result).view as unknown as {
      session_notes: { content: { text: string } }[];
    };

    assert.deepEqual(
      view.session_notes.map((record) => record.content.text),
      ['The connection dropped twice.'],
      'the session\'s own notes are not exactly the notes belonging to nobody',
    );
    assert.deepEqual(
      mine(result, first).notes.map((record: { content: { text: string } }) => record.content.text),
      ['Tired today.'],
      'the session\'s note reached a person, or the person\'s note did not reach them',
    );
    assert.equal(mine(result, second).notes.length, 0, 'a note crossed to another attendee');
  });

  it('refuses a note when this window is not holding the session', async () => {
    const { windowB, sessionId, clientIds } = await aLaptop();

    const result = await recordTheNote(windowB, sessionId, clientIds[0], 'Anything.');

    assert.equal(result.ok, false);
    assert.equal(result.refusal?.headline, NOT_HELD_HERE);
  });
});

describe('the journal is CAPPED, and the four hundred and first is refused loudly', () => {
  /**
   * A REAL, REACHABLE STATE WITH WORDS RATHER THAN A SWALLOWED ERROR.
   *
   * Four hundred readings for one person in one hour is a runaway caller and not a session that
   * happened — the cap is what turns that into something the coach is TOLD about, below the store's
   * detail-read limit, so a journal is never silently truncated on read.
   *
   * Filled through the CORE's own verb and refused through THIS SURFACE, which is the seam under test:
   * the sentence he reads is the core's, it says the record is intact, and the surface marks the state
   * so the screen can draw it as a bound reached rather than as a fault.
   */
  it('carries the core\'s own sentence, saying the record is intact and the session is full', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const live = heldSession(windowA, sessionId) as any;

    /*
     * FILLED THROUGH THE CORE'S OWN APPEND, ONE AT A TIME, AND THEN RE-READ.
     *
     * ONE AT A TIME IS NOT A CHOICE. Filling in batches of fifty through `Promise.all` was tried, to
     * cut the ten seconds four hundred awaited handle calls cost: every batch failed with
     * `JournalRaceError` after four attempts. The store's durable log is a HASH CHAIN — each entry
     * links to the head it was prepared against — so two concurrent appends on one device race for the
     * head and the loser repeats its unit of work rather than writing a wrong link. Concurrent appends
     * to one device's log are not available to any caller, and four hundred records is four hundred
     * round trips.
     *
     * `appendReading` rather than the handle's `recordReading` only so the cap is not consulted on the
     * way to filling up to it. `SESSION.md` §5.2 is what makes that exact rather than approximate: an
     * append's counts are re-seeded from what is STORED on every `refresh()`, so filling the journal
     * underneath the handle and refreshing leaves it in the state four hundred calls through it would.
     */
    for (let at = 0; at < 400; at += 1) {
      // eslint-disable-next-line no-await-in-loop
      await appendReading(windowA, {
        sessionId,
        clientId: clientIds[0],
        ...aReading({ value: 60 + (at % 60) }),
        lease: live.lease,
      });
    }
    await live.refresh();

    const result = await recordTheReading(windowA, sessionId, clientIds[0], aReading());

    assert.equal(result.ok, false, 'the four hundred and first reading was accepted');
    assert.equal(result.refusal?.journalFull, true, 'the full journal is not marked as its own state, '
      + 'so the screen would draw a bound reached as a fault');
    assert.match(String(result.refusal?.headline), /Nothing has been lost/);
    assert.match(String(result.refusal?.headline), /as many as one session holds/);

    // AND THE FOUR HUNDRED ARE ALL STILL THERE. A refusal that had cost him a record would be worse
    // than the bound it was protecting.
    const client = mine(await readTheSessionBack(windowA, sessionId), clientIds[0]);
    assert.equal(client.counts.readings, 400);
  });
});

describe('THE PREVIOUS SESSION IS THE ONE BEFORE THIS ONE', () => {
  /**
   * A LAPTOP WITH A HISTORY: one session LAST WEEK that was interrupted, and one being run TODAY.
   *
   * The previous one is interrupted deliberately — an interrupted session is still the client's
   * previous session and hiding it would lose the last thing that actually happened.
   */
  async function aLaptopWithLastWeek() {
    const { a } = createTwoWindowLaptop();
    const store = await openLocalStore({ platform: a, device: 'coach-laptop' });
    opened.push(store);

    await store.create('exercise', anExercise({ id: PRESS, name: 'Bench press' }));
    await store.create('exercise', anExercise({ id: SQUAT, name: 'Back squat' }));

    const lastWeekRoutine = await store.create('routine', aRoutine({
      id: 'test-readings-last-week',
      name: 'Last Week Routine',
      entries: [{ exercise_id: PRESS, sets: 3, repetitions: 12 }],
    }));
    const todayRoutine = await store.create('routine', aRoutine({
      id: 'test-readings-today',
      name: 'Today Routine',
      entries: [{ exercise_id: SQUAT, sets: 4, repetitions: 8 }],
    }));

    const client = await store.create('client', aClient({ name: 'Test Reading Client History' }));
    const clientId = client.record_id;

    // LAST WEEK: one exercise with a load he observed, one reading, and then interrupted.
    const before = await startSession(store, {
      routineId: lastWeekRoutine.content.id,
      clientIds: [clientId],
      mode: 'in_person',
      routine: lastWeekRoutine,
      now: LAST_WEEK,
    });
    assert.equal(before.ok, true);
    // The core is plain ECMAScript typed in comments, so the handle arrives as an optional. It is
    // present because the open succeeded, which the assertion above is.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastWeek = before.session as any;
    await lastWeek.recordPerformed(clientId, {
      exerciseId: PRESS, sets: 3, repetitions: 12, observedLoad: '40kg', now: LAST_WEEK,
    });
    await lastWeek.recordReading(clientId, aReading({ value: 121, takenAt: LAST_WEEK }));
    await lastWeek.interrupt({ now: LAST_WEEK });
    await lastWeek.detach();

    // TODAY: a different routine, and the handle handed over the way the calendar hands it on.
    const outcome = await startSession(store, {
      routineId: todayRoutine.content.id,
      clientIds: [clientId],
      mode: 'in_person',
      routine: todayRoutine,
      now: TODAY,
    });
    assert.equal(outcome.ok, true);
    const sessionId = handOver(store, outcome).session_id as string;

    return { store, clientId, sessionId, before: before.session_id as string };
  }

  /**
   * THE ONE THAT MATTERS, AND ITS OWN KNOWN POSITIVE IN THE SAME TEST.
   *
   * `previousSessionForClient` returns a session that is still `in_progress` — deliberately, because
   * an interrupted session is history too. So asked plainly from inside a running session it hands
   * back THE SESSION HE IS LOOKING AT, and the panel would tell him he last did the routine he is
   * doing now. The exclusion is what makes it the session BEFORE this one, and the test asks BOTH ways
   * so its silence means something.
   */
  it('excludes the session being run — and asked without that, returns the wrong one', async () => {
    const { store, clientId, sessionId, before } = await aLaptopWithLastWeek();

    const excluded = await readTheGlances(store, [clientId], { excludeSessionId: sessionId });
    assert.equal(excluded[0].glance?.session_id, before, 'the panel is showing a session other than '
      + 'the one before this one');

    const asked = await readTheGlances(store, [clientId], { excludeSessionId: null });
    assert.equal(
      asked[0].glance?.session_id,
      sessionId,
      'asked without the exclusion the read did NOT come back with the running session, so excluding '
        + 'it proves nothing and this guard is vacuous',
    );
  });

  /** An interrupted session is shown as the previous one, and said to be a partial record. */
  it('shows an interrupted previous session, marked as a partial record', async () => {
    const { store, clientId, sessionId } = await aLaptopWithLastWeek();

    const [found] = await readTheGlances(store, [clientId], { excludeSessionId: sessionId });

    assert.equal(found.glance?.status, 'interrupted');
    assert.equal(found.glance?.partial_record, true, 'an interrupted session is shown as a complete '
      + 'record of a session that did not finish');
  });

  /** What he actually did last time: the exercises, the loads he wrote down, the readings he took. */
  it('shows the exercises performed, the loads recorded and the readings taken', async () => {
    const { store, clientId, sessionId } = await aLaptopWithLastWeek();

    const [found] = await readTheGlances(store, [clientId], { excludeSessionId: sessionId });

    assert.equal(found.glance?.performed.length, 1);
    assert.equal(found.glance?.performed[0].exercise_id, PRESS);
    assert.deepEqual(
      found.glance?.loads.map((load) => load.observed_load),
      ['40kg'],
      'the load he observed last time is not shown back to him',
    );
    assert.deepEqual(found.glance?.readings.map((reading) => reading.value), [121]);
  });

  /**
   * THE ROUTINE NAMED IS THE PREVIOUS SESSION'S OWN, and today's routine is deliberately a different
   * one so the difference is visible. Passing the routine he is running now would tell him he last did
   * today's routine whatever he actually did — a false claim about his own history.
   */
  it('names the routine that session was run from, not the one he is running now', async () => {
    const { store, clientId, sessionId } = await aLaptopWithLastWeek();

    const [found] = await readTheGlances(store, [clientId], { excludeSessionId: sessionId });

    assert.equal(found.routineName, 'Last Week Routine');
  });

  /** A client with no history is a FIRST session, which the panel says plainly. */
  it('hands back nothing for a client who has never trained before', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop();

    const [found] = await readTheGlances(windowA, clientIds, { excludeSessionId: sessionId });

    assert.equal(found.glance, null, 'a first session came back as a previous one');
    assert.equal(found.routineName, null);
  });

  /** Asked per person, and one client's history never appears in another's panel. */
  it('reads each attendee\'s own history and nobody else\'s', async () => {
    const { store, clientId, sessionId } = await aLaptopWithLastWeek();
    const other = await store.create('client', aClient({ name: 'Test Reading Client Fresh' }));

    const found = await readTheGlances(store, [clientId, other.record_id], {
      excludeSessionId: sessionId,
    });

    assert.equal(found[0].glance?.status, 'interrupted');
    assert.equal(found[1].glance, null, 'one client\'s history appeared in another\'s panel');
  });

  after(async () => {
    // The scheduled release the runner arms on leaving is not this suite's business, but leaving a
    // handle held would leave a lease held on a store the next test opens.
    await Promise.resolve();
  });
});

describe('leaving the session', () => {
  /** Once the lease is released, a capture is TOLD rather than attempted. Leaving is not ending. */
  it('refuses a reading after this window has left the session', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop();

    landed(await recordTheReading(windowA, sessionId, clientIds[0], aReading()));
    await leaveTheSession(windowA, sessionId);

    const result = await recordTheReading(windowA, sessionId, clientIds[0], aReading());
    assert.equal(result.ok, false);
    assert.equal(result.refusal?.headline, NOT_HELD_HERE);
  });
});
