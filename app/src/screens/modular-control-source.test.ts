/**
 * THE SIX MOVES, DRIVEN THROUGH THE INTERFACE AND READ BACK OFF THE RECORD.
 *
 * Nothing here is a stub. Every test opens the core's own in-process database — the same one the
 * store's own gate runs on — writes real records through the real schema, opens a real session through
 * the real handover, and then reads the session back through the REAL `projectSession`. A move is
 * asserted by what the record says afterwards and never by the call having returned.
 *
 * That is the whole point of this file. `core/session/modularity.test.js` already proves the six moves
 * against the core's verbs; what nobody has proven until here is that the CONTROLS reach those verbs,
 * with the right arguments, and that what comes back reads the way `SESSION.md` §4 says it must. A
 * defect between two individually correct components is invisible to both of their own suites.
 *
 * TWO WINDOWS wherever the assertion is about the lease: within ONE window `acquireSessionLease` hands
 * back the lease it already holds, so a test that asked the same store twice would prove nothing and
 * would report a pass for it.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';

import { aClient, anExercise, aRoutine } from '../../core/model/fixtures.js';
import { assertAttending } from '../../core/session/journal.js';
import { openSession, startSession } from '../../core/session/live-session.js';
import { clientViewOf } from '../../core/session/projection.js';
import { openLocalStore } from '../../core/store/store.js';
import { createTwoWindowLaptop } from '../../core/store/testing/platform-double.js';
import { ARRIVAL_TITLE } from './modular-control';
import {
  addTheLateArrival, amendTheAttempt, readTheArrivalRegister, readTheSessionBack,
  readTheSubstitutionPool, recordTheLine, skipTheLine, substituteTheLine,
} from './modular-control-source';
import type { MoveResult } from './modular-control-source';
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

const PRESS = 'test-modular-press';
const SQUAT = 'test-modular-squat';
const PLANK = 'test-modular-plank';
/** In the catalogue and named by NO routine. The surplus IS the substitution pool. */
const ROWER = 'test-modular-rower';

/**
 * A furnished laptop with two windows, a routine of three lines, and however many people are asked
 * for. The routine's declared order is press, squat, plank — a DEFAULT and not a script, which is
 * exactly what the jump and the reorder are asserted against.
 */
async function aLaptop(people: string[] = ['Test Client A']) {
  const { a, b } = createTwoWindowLaptop();
  const windowA = await openLocalStore({ platform: a, device: 'coach-laptop' });
  const windowB = await openLocalStore({ platform: b, device: 'coach-laptop' });
  opened.push(windowA, windowB);

  await windowA.create('exercise', anExercise({ id: PRESS, name: 'Bench press' }));
  await windowA.create('exercise', anExercise({ id: SQUAT, name: 'Back squat' }));
  await windowA.create('exercise', anExercise({ id: PLANK, name: 'Front plank' }));
  await windowA.create('exercise', anExercise({ id: ROWER, name: 'Rowing machine' }));

  const routine = await windowA.create('routine', aRoutine({
    id: 'test-modular-routine',
    name: 'Test Modular Routine',
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
    routineId: routine.content.id, clientIds, mode: 'in_person', routine,
  });
  assert.equal(outcome.ok, true);
  const sessionId = handOver(windowA, outcome).session_id as string;

  return { windowA, windowB, sessionId, clientIds, routine };
}

/** What a move landed on the record, or the sentence saying why it did not. */
function landed(result: MoveResult): NonNullable<MoveResult['reading']> {
  assert.equal(result.ok, true, `the move was refused: ${result.refusal?.headline ?? '(no reason)'}`);
  assert.notEqual(result.reading, null, 'the move landed but handed back no session, so the screen '
    + 'would go on showing the record as it was before the fact');
  return result.reading as NonNullable<MoveResult['reading']>;
}

/** One person's slice of what a move handed back. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mine(result: MoveResult, clientId: string): any {
  const client = clientViewOf(landed(result).view as never, clientId);
  assert.notEqual(client, null, 'that person is not in the session the move handed back');
  return client;
}

describe('a jump — recording any line at any moment', () => {
  /**
   * `SESSION.md` §4: a jump is ONE FACT AT POSITION 0, and the two lines he did not touch are still
   * `not_yet_recorded`. Nothing had to be recorded first and nothing was invented for the lines he
   * passed over.
   */
  it('records the third line first, at position 0, leaving the other two untouched', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop();

    const client = mine(
      await recordTheLine(windowA, sessionId, clientIds[0], PLANK, { durationSeconds: 60 }),
      clientIds[0],
    );

    assert.equal(client.timeline.length, 1);
    assert.equal(client.timeline[0].position, 0, 'the fact did not land at position 0, so the '
      + 'application had an opinion about where in the routine he was');
    assert.deepEqual(client.order_as_run, [PLANK]);
    assert.deepEqual(client.not_yet_recorded, [PRESS, SQUAT]);
    assert.deepEqual(
      client.plan.map((line: { exercise_id: string }) => line.exercise_id),
      [PRESS, SQUAT, PLANK],
      'the routine\'s own declared order moved, and it is a library record rather than this '
        + 'session\'s business',
    );

    await leaveTheSession(windowA, sessionId);
  });

  it('records the value the routine asked for, and the value he typed over it', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop();

    // The routine asked for 12. This person managed 8, which is the ordinary case the whole adjust
    // panel exists for.
    const client = mine(
      await recordTheLine(windowA, sessionId, clientIds[0], PRESS, {
        sets: 3, repetitions: 8, observedLoad: '40kg',
      }),
      clientIds[0],
    );

    assert.equal(client.plan[0].attempts[0].record.content.repetitions, 8);
    assert.equal(client.plan[0].attempts[0].record.content.sets_completed, 3);
    assert.equal(client.plan[0].attempts[0].observed_load, '40kg');
    assert.deepEqual(client.loads, [{
      exercise_id: PRESS, observed_load: '40kg', recorded_at: client.timeline[0].recorded_at,
    }]);

    await leaveTheSession(windowA, sessionId);
  });
});

describe('a reorder — the order the facts were appended', () => {
  /**
   * §4: `order_as_run` differs from the routine's own order, and THE ROUTINE KEEPS ITS ORDER. Nothing
   * rearranges the library record, which is why there is no reorder control: the order he worked in is
   * the order he recorded in.
   */
  it('reads back in the order he worked, with the routine\'s order untouched', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop();
    const who = clientIds[0];

    await recordTheLine(windowA, sessionId, who, PLANK, { durationSeconds: 45 });
    await recordTheLine(windowA, sessionId, who, PRESS, { repetitions: 12 });
    const client = mine(
      await recordTheLine(windowA, sessionId, who, SQUAT, { repetitions: 8 }),
      who,
    );

    assert.deepEqual(client.order_as_run, [PLANK, PRESS, SQUAT]);
    assert.deepEqual(
      client.plan.map((line: { exercise_id: string }) => line.exercise_id),
      [PRESS, SQUAT, PLANK],
    );
    assert.deepEqual(
      client.timeline.map((attempt: { position: number }) => attempt.position),
      [0, 1, 2],
    );

    await leaveTheSession(windowA, sessionId);
  });
});

describe('a skip — an outcome, not a gap', () => {
  it('gives the line a status of skipped and takes it out of what has nothing against it', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop();

    const client = mine(
      await skipTheLine(windowA, sessionId, clientIds[0], SQUAT, 'Knee sore today'),
      clientIds[0],
    );

    assert.equal(client.plan[1].outcome, 'skipped');
    assert.equal(client.plan[1].attempts[0].status, 'skipped');
    assert.equal(client.plan[1].attempts[0].record.content.note, 'Knee sore today');
    assert.ok(
      !client.not_yet_recorded.includes(SQUAT),
      'a skipped line is still reported as having nothing against it, so the record cannot tell a '
        + 'deliberate skip from an exercise nobody got to',
    );

    await leaveTheSession(windowA, sessionId);
  });

  /**
   * A SKIPPED EXERCISE RECORDS NO WORK — the record refuses sets, repetitions, a duration or a load on
   * one, and this is the wire that must not send them. A skip that carried the routine's numbers would
   * be refused in front of a waiting client, or worse, record work nobody did.
   */
  it('carries no work with it, only the note', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop();

    const client = mine(await skipTheLine(windowA, sessionId, clientIds[0], PRESS, null), clientIds[0]);
    const content = client.plan[0].attempts[0].record.content;

    for (const field of ['sets_completed', 'repetitions', 'duration_seconds', 'observed_load']) {
      assert.equal(content[field], undefined, `a skip recorded ${field}`);
    }

    await leaveTheSession(windowA, sessionId);
  });
});

describe('a repeat — a second fact, with the first left where it is', () => {
  it('keeps both attempts, marks the line repeated, and does not overwrite the first', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop();
    const who = clientIds[0];

    const first = mine(
      await recordTheLine(windowA, sessionId, who, PRESS, { repetitions: 12, observedLoad: '40kg' }),
      who,
    );
    const firstId = first.plan[0].attempts[0].record_id;

    const client = mine(
      await recordTheLine(windowA, sessionId, who, PRESS, { repetitions: 10, observedLoad: '45kg' }),
      who,
    );

    assert.equal(client.plan[0].attempts.length, 2);
    assert.equal(client.plan[0].repeated, true);
    assert.equal(
      client.plan[0].attempts[0].record_id,
      firstId,
      'the first attempt was replaced rather than kept, so a set the client actually did is gone',
    );
    assert.equal(client.plan[0].attempts[0].record.content.repetitions, 12);
    assert.equal(client.plan[0].attempts[1].record.content.repetitions, 10);
    assert.ok(
      client.plan[0].attempts[1].position > client.plan[0].attempts[0].position,
      'the repeat did not land at a later position, so the order the session ran in is lost',
    );

    await leaveTheSession(windowA, sessionId);
  });
});

describe('a substitution — against the line it replaced', () => {
  /**
   * §4: the attempt attaches to the LINE IT REPLACED, not to a line of its own. Otherwise swapping an
   * exercise for one tired client reads as one line never done and a second appearing out of nowhere.
   */
  it('attaches to the replaced line and records both halves', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop();

    const client = mine(
      await substituteTheLine(windowA, sessionId, clientIds[0], {
        insteadOf: SQUAT, exerciseId: ROWER, values: { durationSeconds: 300 },
      }),
      clientIds[0],
    );

    assert.equal(client.plan[1].outcome, 'substituted');
    assert.equal(client.plan[1].attempts.length, 1);
    assert.equal(client.plan[1].attempts[0].exercise_id, ROWER, 'the substitute is not what was '
      + 'recorded as done');
    assert.equal(
      client.plan[1].attempts[0].substituted_for_exercise_id,
      SQUAT,
      'the substitution did not record what it replaced, so the session history loses what was '
        + 'originally programmed',
    );
    assert.deepEqual(
      client.beyond_the_routine,
      [],
      'the substitute appeared as work outside the routine, which is a line appearing out of nowhere '
        + 'beside a line that reads as never done',
    );
    assert.deepEqual(client.not_yet_recorded, [PRESS, PLANK]);

    await leaveTheSession(windowA, sessionId);
  });

  /**
   * FOUND BY WALKING A REAL SESSION IN A BROWSER, not by a failing test. The substitution rendered as
   * "Recorded with something else in its place: kettlebell-swing" — a machine's word for something the
   * coach named, on the screen he reads with a client in front of him.
   *
   * WHY NOTHING CAUGHT IT: a substitute's key appears in `plan[].attempts[].exercise_id` and in
   * NEITHER `plan[].exercise_id` nor `beyond_the_routine`, because the projection deliberately attaches
   * it to the line it replaced. `readExerciseNames` read the other two and not the attempts, so the
   * name was never asked for. Nothing failed anywhere.
   */
  it('reads back the SUBSTITUTE\'s own name, not its key', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop();

    const reading = landed(await substituteTheLine(windowA, sessionId, clientIds[0], {
      insteadOf: SQUAT, exerciseId: ROWER, values: { durationSeconds: 300 },
    }));

    assert.equal(
      reading.exerciseNames.get(ROWER),
      'Rowing machine',
      'the substitute has no name in what the screen was handed, so the coach is shown its content '
        + 'key mid-session',
    );

    await leaveTheSession(windowA, sessionId);
  });

  it('offers the catalogue and not the routine\'s own list', async () => {
    const { windowA, sessionId } = await aLaptop();

    const pool = await readTheSubstitutionPool(windowA);
    const offered = pool.choices.map((choice) => choice.exerciseId);

    assert.ok(
      offered.includes(ROWER),
      'an exercise no routine references was left out of the pool, and that surplus IS the pool',
    );
    for (const key of [PRESS, SQUAT, PLANK]) assert.ok(offered.includes(key));
    assert.equal(pool.whole, true, 'the library holds four exercises and the page said there was more');

    await leaveTheSession(windowA, sessionId);
  });
});

describe('an edit — a revision, with nothing else moving', () => {
  it('corrects the fact and moves nothing else', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop();
    const who = clientIds[0];

    await recordTheLine(windowA, sessionId, who, PRESS, { repetitions: 12, observedLoad: '40kg' });
    const before = mine(
      await recordTheLine(windowA, sessionId, who, SQUAT, { repetitions: 8 }),
      who,
    );
    const wrong = before.plan[0].attempts[0];

    const client = mine(
      await amendTheAttempt(windowA, sessionId, wrong.record_id, {
        sets_completed: null,
        repetitions: 10,
        duration_seconds: null,
        rest_seconds: null,
        observed_load: '42.5kg',
        note: null,
      }),
      who,
    );

    const corrected = client.plan[0].attempts[0];
    assert.equal(corrected.record_id, wrong.record_id, 'the correction wrote a NEW fact, so the '
      + 'session now says the exercise was done twice');
    assert.equal(corrected.record.content.repetitions, 10);
    assert.equal(corrected.observed_load, '42.5kg');
    assert.equal(corrected.position, wrong.position, 'the correction moved the fact in the order the '
      + 'session ran in');
    assert.equal(corrected.status, wrong.status);

    // NOTHING ELSE MOVED: the other line's fact is untouched, and no fact was added or removed.
    assert.equal(client.plan[1].attempts[0].record.content.repetitions, 8);
    assert.equal(client.counts.performed, 2);
    assert.deepEqual(client.order_as_run, [PRESS, SQUAT]);

    await leaveTheSession(windowA, sessionId);
  });

  /**
   * A CLEARED FIELD IS A FIELD WITH NOTHING RECORDED IN IT, and the record expresses that as an absent
   * key. Written as a null it would be refused, and the correction he made — deleting a load he
   * mistyped — would be one the application cannot express at all.
   */
  it('clears a value he emptied rather than refusing the correction', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop();
    const who = clientIds[0];

    const before = mine(
      await recordTheLine(windowA, sessionId, who, PRESS, { repetitions: 12, observedLoad: '400kg' }),
      who,
    );

    const client = mine(
      await amendTheAttempt(windowA, sessionId, before.plan[0].attempts[0].record_id, {
        sets_completed: null,
        repetitions: 12,
        duration_seconds: null,
        rest_seconds: null,
        observed_load: null,
        note: null,
      }),
      who,
    );

    assert.equal(client.plan[0].attempts[0].record.content.observed_load, undefined);
    assert.equal(client.plan[0].attempts[0].observed_load, null);
    assert.deepEqual(client.loads, []);

    await leaveTheSession(windowA, sessionId);
  });
});

describe('per client, always', () => {
  /**
   * A test already drives three clients through one session in the core. This is the same property at
   * the CONTROLS: the coach adapts an exercise for one tired person, edits that person's numbers, and
   * nobody else in the room changes. It is the surface's job not to be the place that breaks it.
   */
  it('adapting and editing one person changes nothing for the others', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop([
      'Test Client A', 'Test Client B', 'Test Client C',
    ]);
    const [tired, second, third] = clientIds;

    // Everybody does the first line, so there is something to be wrongly overwritten.
    for (const who of clientIds) {
      // eslint-disable-next-line no-await-in-loop
      await recordTheLine(windowA, sessionId, who, PRESS, { repetitions: 12, observedLoad: '40kg' });
    }
    const beforeSecond = mine(await readTheSessionBack(windowA, sessionId), second);
    const beforeThird = mine(await readTheSessionBack(windowA, sessionId), third);

    // The tired one gets a substitution on the second line and a correction on the first.
    await substituteTheLine(windowA, sessionId, tired, {
      insteadOf: SQUAT, exerciseId: ROWER, values: { durationSeconds: 300 },
    });
    const withTired = mine(await readTheSessionBack(windowA, sessionId), tired);
    await amendTheAttempt(windowA, sessionId, withTired.plan[0].attempts[0].record_id, {
      sets_completed: null, repetitions: 6, duration_seconds: null, rest_seconds: null,
      observed_load: '20kg', note: 'Tired today',
    });

    const afterSecond = mine(await readTheSessionBack(windowA, sessionId), second);
    const afterThird = mine(await readTheSessionBack(windowA, sessionId), third);

    for (const [before, then, whose] of [
      [beforeSecond, afterSecond, 'the second'], [beforeThird, afterThird, 'the third'],
    ] as const) {
      assert.deepEqual(then.loads, before.loads, `${whose} client's loads changed`);
      assert.deepEqual(then.order_as_run, before.order_as_run, `${whose} client's order changed`);
      assert.deepEqual(then.counts, before.counts, `${whose} client's counts changed`);
      assert.deepEqual(
        then.plan.map((line: { exercise_id: string; outcome: string }) =>
          `${line.exercise_id}:${line.outcome}`),
        before.plan.map((line: { exercise_id: string; outcome: string }) =>
          `${line.exercise_id}:${line.outcome}`),
        `${whose} client's lines changed when somebody else's were adapted`,
      );
      assert.equal(
        then.plan[0].attempts[0].record.content.repetitions,
        12,
        `${whose} client's repetitions were changed by an edit to another person's fact`,
      );
      assert.ok(
        !then.beyond_the_routine.includes(ROWER),
        `${whose} client received the substitute chosen for somebody else`,
      );
    }

    // And the tired one really did get what was recorded for them.
    const tiredAfter = mine(await readTheSessionBack(windowA, sessionId), tired);
    assert.equal(tiredAfter.plan[0].attempts[0].record.content.repetitions, 6);
    assert.equal(tiredAfter.plan[1].attempts[0].exercise_id, ROWER);

    await leaveTheSession(windowA, sessionId);
  });
});

describe('when a move cannot be made', () => {
  /**
   * NO HANDLE MEANS NO MOVE, AND NO SECOND LEASE. A move that answered a missing handle by opening the
   * session itself would take a second lease on a session another window may be running — the
   * two-windows-one-session failure the lease exists to prevent, reintroduced at the one seam that
   * writes.
   */
  it('says so, and does not open the session to get around it', async () => {
    const { windowA, windowB, sessionId, clientIds } = await aLaptop();

    // Window B is the coach's other window. It holds nothing.
    const result = await recordTheLine(windowB, sessionId, clientIds[0], PRESS, { repetitions: 12 });

    assert.equal(result.ok, false);
    assert.equal(result.reading, null);
    assert.ok((result.refusal?.headline ?? '').length > 0, 'a control that refuses in silence');
    assert.equal(
      heldSession(windowB, sessionId),
      null,
      'the window that was holding nothing is now holding a session, so a move took a lease',
    );

    // The window that IS running it is unaffected and can still record.
    const client = mine(
      await recordTheLine(windowA, sessionId, clientIds[0], PRESS, { repetitions: 12 }),
      clientIds[0],
    );
    assert.equal(client.counts.performed, 1);

    await leaveTheSession(windowA, sessionId);
  });

  it('refuses a move into a session this window has let go of', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop();
    await leaveTheSession(windowA, sessionId);

    const result = await recordTheLine(windowA, sessionId, clientIds[0], PRESS, { repetitions: 12 });

    assert.equal(result.ok, false);
    assert.ok((result.refusal?.headline ?? '').length > 0);
    // And the session is genuinely free, which is what proves the refusal was not a lease still held.
    const other = await openSession(windowA, sessionId);
    assert.equal(other.ok, true, `the session stayed locked (${other.reason})`);
    await other.session?.detach();
  });

  /**
   * THE JOURNAL CAP IS A REAL, REACHABLE STATE and the four hundred and first append is refused
   * LOUDLY. Reached here by actually filling the journal rather than by simulating the refusal, so
   * what is asserted is the sentence the coach would really see.
   */
  it('reports the journal-full refusal in the core\'s own words, with the record intact', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop();
    const who = clientIds[0];

    // Straight onto the handle for the filling, because the point of the test is the four hundred and
    // first move through the CONTROL, and four hundred presses through it would prove that four
    // hundred times over for no more information.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const live = heldSession(windowA, sessionId) as any;
    for (let recorded = 0; recorded < 400; recorded += 1) {
      // eslint-disable-next-line no-await-in-loop
      await live.recordPerformed(who, { exerciseId: PRESS, repetitions: 1 });
    }

    const result = await recordTheLine(windowA, sessionId, who, PRESS, { repetitions: 1 });

    assert.equal(result.ok, false);
    assert.equal(result.refusal?.journalFull, true, 'the journal-full state was reported as an '
      + 'ordinary failure, so the screen cannot word it as the reachable state it is');
    assert.match(result.refusal?.headline ?? '', /as many as one session holds/);
    assert.match(result.refusal?.headline ?? '', /Nothing has been lost/);

    // THE RECORD IS INTACT, which is what its own sentence promises him.
    const client = mine(await readTheSessionBack(windowA, sessionId), who);
    assert.equal(client.counts.performed, 400);

    await leaveTheSession(windowA, sessionId);
  });
});

/**
 * THE LATE ARRIVAL — the wire, and the refusal that sends him to it.
 *
 * ## BOTH HALVES, PROVEN SEPARATELY, BECAUSE ONLY ONE OF THEM IS EASY TO DEMONSTRATE
 *
 * Wiring `addClient` is a call that either lands on the record or does not. The half worth more is
 * the sentence: `core/session/journal.js` refused a fact against a non-attendee and told the coach to
 * add them first, while NO FILE UNDER `src/` CALLED `addClient` AT ALL. The instruction had nothing
 * to perform it, which reads to him as his own mistake rather than as the application's gap.
 *
 * So the two are asserted apart, in opposite directions:
 *
 *   1. THE REFUSAL STILL APPEARS for somebody who is not attending. The guard was SATISFIED, not
 *      deleted — a wire that worked by removing the check would pass every "he can record against
 *      them now" test ever written, and would let a fact be recorded against a person not in the room.
 *   2. THE COACH CAN THEN ACTUALLY DO WHAT IT SAYS: the same person, added through the same control
 *      the sentence names, then recorded against and read back off the record.
 *
 * Neither implies the other, and a change breaking either one leaves the other green.
 */
describe('somebody arrived after the session started', () => {
  /**
   * HALF ONE: THE REFUSAL IS STILL THERE.
   *
   * Reds if the guard is ever satisfied by deletion rather than by adding the person.
   */
  it('REFUSES a fact against somebody who is not in the session, and writes nothing', async () => {
    const { windowA, sessionId } = await aLaptop();
    const outsider = await windowA.create('client', aClient({ name: 'Late Arrival A' }));

    const result = await recordTheLine(
      windowA, sessionId, outsider.record_id, PRESS, { repetitions: 12 },
    );

    assert.equal(result.ok, false, 'a fact was recorded against somebody who is not in the session');
    assert.match(result.refusal?.headline ?? '', /not in this session/);
    // A REFUSAL CHANGES NOTHING, and a sentence about a failure claims something checkable about the
    // state it left behind.
    const view = landed(await readTheSessionBack(windowA, sessionId)).view as never;
    assert.equal(clientViewOf(view, outsider.record_id), null,
      'the refused person is in the session anyway, so the refusal did not describe what happened');

    await leaveTheSession(windowA, sessionId);
  });

  /**
   * HALF TWO: HE CAN NOW DO WHAT THE SENTENCE TELLS HIM TO DO.
   *
   * Refused FIRST, so what follows is proven to be the same move that could not be made a moment ago
   * rather than one that was always going to work.
   */
  it('ADDS them through the control, and the fact that was refused then lands', async () => {
    const { windowA, sessionId } = await aLaptop();
    const outsider = await windowA.create('client', aClient({ name: 'Late Arrival B' }));

    const before = await recordTheLine(
      windowA, sessionId, outsider.record_id, PRESS, { repetitions: 12 },
    );
    assert.equal(before.ok, false, 'the fixture never reached the state this test is about');

    const arrival = await addTheLateArrival(windowA, sessionId, outsider.record_id);
    const room = landed(arrival).view as never;
    assert.notEqual(clientViewOf(room, outsider.record_id), null,
      'the arrival was reported as landed but the session it handed back does not hold them');

    const after = mine(
      await recordTheLine(windowA, sessionId, outsider.record_id, PRESS, { repetitions: 12 }),
      outsider.record_id,
    );
    assert.equal(after.counts.performed, 1);

    await leaveTheSession(windowA, sessionId);
  });

  /**
   * NOBODY ALREADY IN THE ROOM IS DISTURBED, and what they had recorded is untouched.
   *
   * The one thing a coach cannot afford from a control pressed mid-session, with a group in front of
   * him, is for it to cost him what is already written down.
   */
  it('leaves everybody already in the session, and their records, exactly as they were', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop(['Test Client A', 'Test Client B']);
    const outsider = await windowA.create('client', aClient({ name: 'Late Arrival C' }));

    await recordTheLine(windowA, sessionId, clientIds[0], PRESS, { repetitions: 12 });
    await addTheLateArrival(windowA, sessionId, outsider.record_id);

    const view = landed(await readTheSessionBack(windowA, sessionId)).view as never;
    assert.equal(clientViewOf(view, clientIds[0])?.counts.performed, 1,
      'the arrival cost somebody already in the room what they had recorded');
    assert.notEqual(clientViewOf(view, clientIds[1]), null);
    assert.notEqual(clientViewOf(view, outsider.record_id), null);

    await leaveTheSession(windowA, sessionId);
  });

  /** Adding somebody already in the room is the core's own idempotence, not a duplicate. */
  it('adds somebody already in the session once, not twice', async () => {
    const { windowA, sessionId, clientIds } = await aLaptop();

    const view = landed(await addTheLateArrival(windowA, sessionId, clientIds[0])).view as never;

    assert.deepEqual([...(view as { client_ids: readonly string[] }).client_ids], clientIds);

    await leaveTheSession(windowA, sessionId);
  });

  /**
   * A REFUSAL IS A VALUE HERE TOO, through the same taxonomy and with NO NEW MACHINERY.
   *
   * `COACH_FACING_FAILURES` already carried every error this path can throw before the wire existed,
   * which is why the second half of this action needed no new failure shape either.
   */
  it('reports an arrival into a session this window has let go of as a sentence, not a throw', async () => {
    const { windowA, sessionId } = await aLaptop();
    const outsider = await windowA.create('client', aClient({ name: 'Late Arrival D' }));
    await leaveTheSession(windowA, sessionId);

    const result = await addTheLateArrival(windowA, sessionId, outsider.record_id);

    assert.equal(result.ok, false);
    assert.ok((result.refusal?.headline ?? '').length > 0,
      'the arrival was refused with no sentence, so the control would silently do nothing');
  });

  /**
   * THE ONE READ THE RUNNER DID NOT ALREADY DO: the people who could be added.
   *
   * Read off the REGISTER and not off the session, because a late arrival is by definition somebody
   * the session has never mentioned — the same reason the substitution pool is read off the catalogue.
   */
  it('reads the register, including people the session has never mentioned', async () => {
    const { windowA, clientIds } = await aLaptop();
    const outsider = await windowA.create('client', aClient({ name: 'Late Arrival E' }));

    const register = await readTheArrivalRegister(windowA);
    const ids = register.choices.map((choice) => choice.clientId);

    assert.ok(ids.includes(outsider.record_id), 'somebody in the register was not offered');
    assert.ok(ids.includes(clientIds[0]), 'this read filtered by the session, which is the screen\'s '
      + 'job and not this read\'s — see readTheArrivalRegister');
    // BY NAME, because a record id on the screen is a machine talking to a coach mid-session.
    const offered = register.choices.find((choice) => choice.clientId === outsider.record_id);
    assert.equal(offered?.name, 'Late Arrival E');
  });

  /**
   * SOMEBODY HE HAS STOPPED TRAINING IS NOT OFFERED, and that is the REGISTER's own convention
   * rather than a rule invented at this seam.
   *
   * `listClients` leaves archived people out unless they are asked for, which is what the register
   * screen shows him. The picker offering somebody his register does not would be two answers to
   * "who do you train", and he would have no way to tell which one was right.
   *
   * WORTH ASSERTING RATHER THAN ASSUMING: the first version of this read used `libraryPage`, the
   * substitution pool's query, which cannot read clients at all — there is no `by_content_key` index
   * on them. The query had to be chosen, so what it excludes is a decision and gets a test.
   */
  it('does not offer somebody the coach has archived', async () => {
    const { windowA } = await aLaptop();
    const archived = await windowA.create('client', aClient({ name: 'Archived Person', active: false }));
    const active = await windowA.create('client', aClient({ name: 'Active Person' }));

    const ids = (await readTheArrivalRegister(windowA)).choices.map((choice) => choice.clientId);

    assert.ok(!ids.includes(archived.record_id), 'an archived person was offered as a late arrival');
    // THE COMPANION ASSERTION, so the one above cannot pass by the read returning nothing at all.
    assert.ok(ids.includes(active.record_id), 'the read excluded everybody, so the exclusion above '
      + 'proves nothing about archiving');
  });
});

/**
 * THE SENTENCE AND THE CONTROL, HELD AGAINST EACH OTHER — the guard with two opposed failures.
 *
 * ## WHY THIS SHAPE, STATED SO THE DIFF CANNOT BE MISREAD
 *
 * This action REWORDED a refusal and then wrote a guard over the new wording. RE-AIMING AN ASSERTION
 * AT WORDING ITS OWN AUTHOR WROTE IS INDISTINGUISHABLE IN A DIFF FROM SOFTENING IT, so the guard is
 * built to red in TWO OPPOSITE DIRECTIONS, and no single edit satisfies both:
 *
 *   - IF THE REFUSAL IS DELETED ALTOGETHER — removed, or softened into a pass — the first test reds,
 *     because there is no throw and no sentence.
 *   - IF THE OLD DEAD INSTRUCTION RETURNS — "Add them to the session first", an act with no control
 *     to perform it — the second test reds, because the sentence no longer names a real label.
 *
 * The name is DERIVED from `ARRIVAL_TITLE` rather than typed here, so renaming the control reds this
 * until the sentence is renamed with it. A hand-typed copy of the label would guard the copy.
 *
 * `src/shell/refusal-names-a-real-control.test.ts` sweeps the same sentence from the OTHER side, over
 * a universe walked from the filesystem that reaches `core/`: it asks whether the quoted name exists
 * anywhere in the application's inventory of labels. This asks whether it is THIS control. Both are
 * source-and-behaviour instruments; whether the words are PAINTED is a third question, and it is
 * answered by driving the real application rather than by either of them.
 */
describe('the refusal for a non-attendee names the control that now exists', () => {
  /** DIRECTION ONE: it still refuses, and still says what is wrong. */
  it('STILL REFUSES somebody who is not attending, with a sentence saying so', () => {
    assert.throws(
      () => assertAttending(aSessionWithNobodyIn(), 'nobody'),
      (error: Error) => {
        assert.match(error.message, /not in this session/);
        assert.match(error.message, /nothing can be recorded against them here/);
        return true;
      },
    );
  });

  /** DIRECTION TWO: it names the real control, quoted, not an act with nothing to perform it. */
  it('NAMES the control by the label the application really draws, rather than instructing an act', () => {
    const refusal = refusalForANonAttendee();

    assert.ok(refusal.includes(`"${ARRIVAL_TITLE}"`),
      `the refusal does not name the arrival control by its own label: ${refusal}`);
    assert.ok(!/Add them to the session first/u.test(refusal),
      'the refusal is back to instructing an act with no control to perform it');
  });

  /**
   * AND THE LABEL IT NAMES IS ONE THE DRAWING REALLY PUTS ON A CONTROL.
   *
   * Without this, both assertions above stay green over a constant that no component draws — the
   * sentence would name a real string and still point at nothing on the screen.
   *
   * ON A WORD BOUNDARY, AND THAT IS PAID FOR IN A PROBE THAT MISSED. Written first as a plain
   * `includes('ARRIVAL_TITLE')`, this test stayed GREEN while the component's every reference was
   * renamed to `ARRIVAL_TITLE_PROBE` — the identifier CONTAINS the one being searched for, so a
   * substring check cannot see a rename that keeps the prefix. The break was real and the guard was
   * blind to it. `\b` is what makes the probe land.
   *
   * IT IS STILL A SOURCE SWEEP: it says the component references the constant, never that the words
   * reach the screen. Painted output is a third instrument, and this action answers it by driving the
   * real application rather than by widening this.
   */
  it('is naming a label the arrival control actually draws', () => {
    const drawn = readFileSync(new URL('./SessionArrival.tsx', import.meta.url), 'utf8');

    assert.match(drawn, /\bARRIVAL_TITLE\b/u,
      'the arrival control does not draw the label the refusal names');
    assert.ok(refusalForANonAttendee().includes(`"${ARRIVAL_TITLE}"`));
  });
});

/** A session envelope with nobody in it, in the shape `participantsOf` reads. */
function aSessionWithNobodyIn() {
  return { record_id: 'test-arrival-session', content: { client_ids: [] } };
}

/** The sentence the coach would really be shown, taken from the THROW rather than from the source. */
function refusalForANonAttendee(): string {
  try {
    assertAttending(aSessionWithNobodyIn(), 'nobody');
  } catch (error) {
    return (error as Error).message;
  }
  return assert.fail('assertAttending did not refuse a non-attendee at all');
}
