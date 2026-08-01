/**
 * THE INTENSITY SURFACE'S READS AND THE ADAPTER'S CALL — driven against a REAL store.
 *
 * Nothing here is a stub. Every test opens the core's own in-process database, writes real records
 * through the real schema, starts a real session through the real handover, calls the REAL
 * `proposeSession`, and reads the session back through the REAL `projectSession`. What a curve produced
 * is asserted from what came out; what a curve did NOT do to the record is asserted by reading the
 * record.
 *
 * That is the whole point of this file. `core/intensity` already proves the adapter's arithmetic and
 * `core/session` already proves the session's verbs; what nobody has proven until here is that the two
 * meet correctly — and the defect this action found lives exactly in that gap, invisible to both of
 * their own suites.
 *
 * ## THE TWO THINGS THIS FILE EXISTS TO PROVE
 *
 *  1. **NOTHING REACHES THE SESSION WITHOUT ACCEPTANCE, AND REJECTION LEAVES IT UNTOUCHED.** Asserted
 *     by counting what is on the record, with a non-vacuity probe that then records one fact and
 *     watches the same count move — a count that could never move proves nothing by staying at nought.
 *  2. **THE NO-RATCHET GUARANTEE, END TO END.** `INTENSITY.md` §3 promises pressing the same curve
 *     never moves the number. It holds inside the package and is LOST at this seam unless the level
 *     reaches the record. The pair of tests below run the identical scenario with the level and without
 *     it: with it the library's own low point comes back, without it work managed at a HIGH point comes
 *     back proposed at the LOW one. The second is the guard's own non-vacuity probe.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { aClient, anExercise, aRoutine } from '../../core/model/fixtures.js';
import { readSession, startSession } from '../../core/session/live-session.js';
import { openLocalStore, performedForClient } from '../../core/store/store.js';
import { createTwoWindowLaptop } from '../../core/store/testing/platform-double.js';
import { accepted, acceptedLine, noIntensity, withLevel as withLevel_ } from './intensity';
import {
  HISTORY_SESSIONS, agreedRows, readTheCatalogue, readTheCurves, readTheGround, readTheHistory,
  shapeTheCurve,
} from './intensity-source';
import { noControls } from './modular-control';
import { readTheSessionBack, recordTheLine } from './modular-control-source';
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

const PRESS = 'test-intensity-press';
const SQUAT = 'test-intensity-squat';
const PLANK = 'test-intensity-plank';
/** In the library and named by NO routine. The surplus IS the substitution pool. */
const ROWER = 'test-intensity-rower';

/** The curve the shipped default is shaped like, authored here rather than read from the seed. */
const RISE = 'test-curve-rise';
/** Two hard points, so a routine of easier work has to fall back and say so. */
const HARD = 'test-curve-hard';
/** Two easy points. Its name spells no curve, so `R11` does not check it against the sequence. */
const EASY = 'test-curve-easy';

/**
 * A furnished laptop, a routine of three lines, and a session under way with its lease handed over.
 *
 * The routine's DECLARED order is press, squat, plank — a default and not a script, which is what the
 * reordering below is asserted against.
 */
async function aLaptop(options: {
  readonly people?: readonly string[];
  /** Left out for the tests that must have no substitute available at all. */
  readonly withSurplus?: boolean;
} = {}) {
  const { people = ['Test Client A'], withSurplus = true } = options;
  const { a } = createTwoWindowLaptop();
  const store = await openLocalStore({ platform: a, device: 'coach-laptop' });
  opened.push(store);

  await store.create('exercise', anExercise({
    id: PRESS, name: 'Bench press', intensity: 'medium', equipment: ['barbell'],
    scaling: {
      low: { sets: 2, repetitions: 8, rest_seconds: 90 },
      medium: { sets: 3, repetitions: 10, rest_seconds: 60 },
      high: { sets: 4, repetitions: 14, rest_seconds: 45 },
    },
  }));
  await store.create('exercise', anExercise({
    id: SQUAT, name: 'Back squat', intensity: 'low', equipment: ['barbell'],
    movement_pattern: 'squat', primary_muscles: ['quadriceps'],
    scaling: {
      low: { sets: 2, repetitions: 10, rest_seconds: 60 },
      medium: { sets: 3, repetitions: 15, rest_seconds: 45 },
      high: { sets: 4, repetitions: 20, rest_seconds: 30 },
    },
  }));
  await store.create('exercise', anExercise({
    id: PLANK, name: 'Front plank', intensity: 'high', measurement: 'time',
    movement_pattern: 'isometric-hold', primary_muscles: ['abdominals'], equipment: ['mat'],
    default_prescription: { sets: 3, duration_seconds: 30 },
    scaling: {
      low: { sets: 2, duration_seconds: 20, rest_seconds: 60 },
      medium: { sets: 3, duration_seconds: 30, rest_seconds: 45 },
      high: { sets: 3, duration_seconds: 45, rest_seconds: 30 },
    },
  }));
  if (withSurplus) {
    await store.create('exercise', anExercise({
      id: ROWER, name: 'Rowing machine', intensity: 'high', measurement: 'time',
      // ITS EQUIPMENT AND ITS MUSCLES ARE BOTH THE ROUTINE'S, and both were measured rather than
      // guessed. `placement.js` offers a substitute only if its equipment is equipment the routine
      // already assumes — a barbell is never proposed into a session built out of bodyweight work — AND
      // only if it shares the displaced exercise's movement pattern, or a muscle with it, or a muscle
      // with the routine as a whole. A rower on `lats` alone was REJECTED by that last rule and the
      // substitution test passed by proving nothing until this fixture shared a muscle with the squat.
      movement_pattern: 'horizontal-pull', primary_muscles: ['quadriceps'], equipment: ['barbell'],
      default_prescription: { sets: 3, duration_seconds: 60 },
      scaling: {
        low: { sets: 2, duration_seconds: 60, rest_seconds: 60 },
        medium: { sets: 3, duration_seconds: 90, rest_seconds: 45 },
        high: { sets: 4, duration_seconds: 120, rest_seconds: 30 },
      },
    }));
  }

  await store.create('intensity-pattern', {
    id: RISE, name: 'A rising shape', sequence: ['low', 'medium', 'high'], mapping_rule: 'stretch',
    description: 'One climb from the easiest work to the hardest across the whole session.',
    provenance: 'coach-created',
  });
  await store.create('intensity-pattern', {
    id: HARD, name: 'Two hard points', sequence: ['high', 'high', 'high'], mapping_rule: 'stretch',
    description: 'Every point of this curve asks for the hardest work the library holds.',
    provenance: 'coach-created',
  });
  await store.create('intensity-pattern', {
    id: EASY, name: 'An easy shape', sequence: ['low', 'low', 'low'], mapping_rule: 'stretch',
    description: 'Every point of this curve asks for the easiest work the library holds.',
    provenance: 'coach-created',
  });

  const routine = await store.create('routine', aRoutine({
    id: 'test-intensity-routine',
    name: 'Test Intensity Routine',
    entries: [{ exercise_id: PRESS }, { exercise_id: SQUAT }, { exercise_id: PLANK }],
  }));

  const clientIds: string[] = [];
  const clientNames = new Map<string, string>();
  for (const name of people) {
    // eslint-disable-next-line no-await-in-loop
    const record = await store.create('client', aClient({ name }));
    clientIds.push(record.record_id);
    clientNames.set(record.record_id, name);
  }

  const sessionId = await aSession(store, routine, clientIds);
  return { store, routine, clientIds, clientNames, sessionId };
}

/** Start one session on this routine for these people, and hand its lease over. */
async function aSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  routine: any,
  clientIds: readonly string[],
): Promise<string> {
  const outcome = await startSession(store, {
    routineId: routine.content.id, clientIds: [...clientIds], mode: 'in_person', routine,
  });
  assert.equal(outcome.ok, true, String(outcome.message ?? outcome.reason ?? ''));
  return handOver(store, outcome).session_id as string;
}

/**
 * Finish one session and let its lease go, so it becomes HISTORY rather than the one in this window.
 *
 * `complete()` is one of the session's three endings and `session-handover.ts` names only the handful of
 * the handle's methods it reaches, so the cast is the same narrowing every source module in this family
 * uses — `core/session/live-session.js` owns the whole of it.
 */
async function finish(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store: any,
  sessionId: string,
): Promise<void> {
  const live = heldSession(store, sessionId) as unknown as { complete: () => Promise<unknown> } | null;
  assert.notEqual(live, null, 'that session is not held in this window, so it cannot be finished');
  await live!.complete();
  await leaveTheSession(store, sessionId);
}

/** How many facts are on the record for one person in one session — read from the store. */
async function factsOnRecord(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store: any,
  sessionId: string,
  clientId: string,
): Promise<number> {
  const result = await readTheSessionBack(store, sessionId);
  assert.equal(result.ok, true, result.refusal?.headline ?? '');
  const view = result.reading?.view as unknown as {
    clients: readonly { client_id: string; timeline: readonly unknown[] }[];
  };
  return view.clients.find((client) => client.client_id === clientId)?.timeline.length ?? 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// The curves and the library are READ, never written down
// ═══════════════════════════════════════════════════════════════════════════════

describe('reading the curves', () => {
  it('offers exactly the patterns the library holds, with their own words', async () => {
    const { store } = await aLaptop();

    const curves = await readTheCurves(store);

    assert.deepEqual([...curves.toggles].map((one) => one.patternId).sort(), [EASY, HARD, RISE].sort());
    const rise = curves.toggles.find((one) => one.patternId === RISE);
    assert.equal(rise?.name, 'A rising shape');
    assert.equal(rise?.curveWords, 'low · medium · high');
    assert.match(String(rise?.words), /One climb/);
    assert.equal(curves.whole, true);
  });

  /**
   * THE PROOF THAT THE BUTTONS ARE NOT A LIST IN THE SOURCE. A curve he deletes is a button that goes,
   * and a curve he writes is a button that appears — which is the whole reason patterns are a record
   * kind rather than code.
   */
  it('loses a curve he deletes and gains one he writes', async () => {
    const { store } = await aLaptop();
    const stored = await store.getByContentKey('intensity-pattern', HARD);
    await store.tombstone('intensity-pattern', stored.record_id);
    await store.create('intensity-pattern', {
      id: 'test-curve-his-own', name: 'One he wrote himself', sequence: ['medium', 'low'],
      mapping_rule: 'repeat-cycle', description: 'A curve the coach authored on his own device.',
      provenance: 'coach-created',
    });

    const curves = await readTheCurves(store);
    const ids = curves.toggles.map((one) => one.patternId);

    assert.equal(ids.includes(HARD), false, 'a deleted curve is still offered as a button');
    assert.ok(ids.includes('test-curve-his-own'), 'a curve he wrote is not offered');
  });
});

describe('reading the library', () => {
  /**
   * IT PRUNES NOTHING. `INTENSITY.md` §4: the surplus over the shipped week IS the substitution pool,
   * so an exercise no routine references is a NORMAL state and filtering it would delete the feature.
   */
  it('reads the whole library including the exercise no routine names', async () => {
    const { store } = await aLaptop();

    const catalogue = await readTheCatalogue(store);
    const ids = catalogue.exercises.map((one) => one.id);

    assert.equal(catalogue.whole, true);
    assert.ok(ids.includes(ROWER), 'the exercise no routine references was pruned — that is the pool');
    for (const named of [PRESS, SQUAT, PLANK]) assert.ok(ids.includes(named));
    // The whole record, not a name and a key: the adapter needs the ladder.
    const rower = catalogue.exercises.find((one) => one.id === ROWER);
    assert.ok(rower?.scaling, 'an exercise arrived with no scaling ladder, so no curve could scale it');
  });
});

describe('reading one client s recent record', () => {
  /**
   * EXCLUDING THE SESSION HE IS RUNNING IS THIS FILE'S CHOICE AND IT IS STATED. Including it would mean
   * the same curve proposed different numbers depending on how much of the session was already
   * recorded — two answers to one question, during one session.
   */
  it('leaves out the session in this window and keeps the ones before it', async () => {
    const { store, routine, clientIds, sessionId } = await aLaptop();
    const client = clientIds[0];

    // A past session, finished, with one fact on it.
    const past = await aSession(store, routine, clientIds);
    await recordTheLine(store, past, client, SQUAT, { repetitions: 11, sets: 3 });
    await finish(store, past);

    // And one fact in the session he is running now.
    const now = await aSession(store, routine, clientIds);
    await recordTheLine(store, now, client, PRESS, { repetitions: 99, sets: 9 });

    const history = await readTheHistory(store, client, { excludeSessionId: now });

    const exercises = history.performed.map((one) => one.exercise_id);
    assert.ok(exercises.includes(SQUAT), 'the past session was not read at all');
    assert.equal(
      exercises.includes(PRESS),
      false,
      'the session he is running was calibrated against, so the same curve gives two answers during '
        + 'one session',
    );
    assert.equal(history.client_id, client);
    assert.equal(history.window.session_count, 1);
    assert.notEqual(sessionId, now);
  });

  it('reads no history for a client with none, and that is an ordinary result', async () => {
    const { store, clientIds, sessionId } = await aLaptop();

    const history = await readTheHistory(store, clientIds[0], { excludeSessionId: sessionId });

    assert.deepEqual(history.performed, []);
    assert.equal(history.window.session_count, 0);
    assert.equal(history.window.from, null);
  });

  it('bounds the window at the number of sessions it declares', async () => {
    const { store, routine, clientIds } = await aLaptop();
    const client = clientIds[0];

    for (let n = 0; n < HISTORY_SESSIONS + 3; n += 1) {
      // eslint-disable-next-line no-await-in-loop
      const past = await aSession(store, routine, clientIds);
      // eslint-disable-next-line no-await-in-loop
      await recordTheLine(store, past, client, SQUAT, { repetitions: 10 + n });
      // eslint-disable-next-line no-await-in-loop
      await finish(store, past);
    }

    const history = await readTheHistory(store, client, {});

    assert.equal(history.window.session_count, HISTORY_SESSIONS);
    assert.equal(history.performed.length, HISTORY_SESSIONS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// It reorders AND it scales
// ═══════════════════════════════════════════════════════════════════════════════

describe('shaping a curve across the session', () => {
  it('changes the sequence and the effort, both in one proposal', async () => {
    const { store, clientIds, clientNames, sessionId } = await aLaptop();
    const ground = await readTheGround(store, sessionId, clientNames);

    const result = await shapeTheCurve(store, sessionId, RISE, ground, clientIds);
    const proposal = result.proposal;
    assert.notEqual(proposal, null, result.refusal?.headline ?? '');
    assert.equal(result.refusal, null);

    // THE SEQUENCE MOVED. The routine's declared order is press, squat, plank; the rising curve wants
    // low, medium, high and the library files squat low, press medium, plank high.
    assert.deepEqual(
      proposal!.rows.map((row) => row.lineExerciseId),
      [SQUAT, PRESS, PLANK],
      'the proposal did not reorder anything, so half of what the adapter does is missing',
    );
    assert.deepEqual(proposal!.rows.map((row) => row.askedForLevel), ['low', 'medium', 'high']);

    // AND THE EFFORT MOVED. Each position carries its own level's numbers, not the exercise default.
    const efforts = proposal!.people[0].efforts;
    assert.equal(efforts[0].repetitions, 10, 'the squat did not take its LOW point');
    assert.equal(efforts[1].repetitions, 10, 'the press did not take its MEDIUM point');
    assert.equal(efforts[2].durationSeconds, 45, 'the plank did not take its HIGH point');
    assert.equal(efforts[2].measurement, 'time');
  });

  it('says plainly that there was nothing to calibrate from, for a client with no record', async () => {
    const { store, clientIds, clientNames, sessionId } = await aLaptop();
    const ground = await readTheGround(store, sessionId, clientNames);

    const { proposal } = await shapeTheCurve(store, sessionId, RISE, ground, clientIds);

    const person = proposal!.people[0];
    assert.equal(person.calibrated, false);
    assert.match(person.baselineWords, /nothing recorded for this client yet/);
    assert.match(person.baselineWords, /not as a measurement/);
    // TWO OPPOSED FAILURES on the wording that reaches the screen, changed to match an INTENTIONAL
    // COPY CORRECTION in `core/intensity/baseline.js`: it called the client "he" beneath the client's
    // own name. REQUIRING is worded to stay green if the pronoun is put back, so what it guards is
    // that the CLAIM survives; FORBIDDING is the pronoun.
    assert.match(person.baselineWords,
      /every number here comes from your own exercise library and this routine/);
    assert.ok(!/\b(he|him|his)\b/i.test(person.baselineWords),
      'the client record cannot carry gender, so a sentence about the client may not assume one: '
        + person.baselineWords);
    for (const effort of person.efforts) {
      assert.equal(effort.referenceSource, 'library-scaling-point');
      assert.match(effort.referenceWords, /your library's own/);
    }
  });

  it('carries the baseline back, visibly, once there is something to calibrate from', async () => {
    const { store, routine, clientIds, clientNames } = await aLaptop();
    const client = clientIds[0];

    const past = await aSession(store, routine, clientIds);
    // The level is on the fact because this test is about a CALIBRATED baseline, and work recorded at
    // a point nobody wrote down is no calibration — see the level-less case below.
    await recordTheLine(store, past, client, SQUAT, {
      repetitions: 7, sets: 2, restSeconds: 60, intensity: 'low',
    });
    await finish(store, past);

    const now = await aSession(store, routine, clientIds);
    const ground = await readTheGround(store, now, clientNames);
    const { proposal } = await shapeTheCurve(store, now, EASY, ground, clientIds);

    const person = proposal!.people[0];
    assert.equal(person.calibrated, true);
    assert.match(person.baselineWords, /most recently on/);

    const squat = proposal!.rows.findIndex((row) => row.lineExerciseId === SQUAT);
    assert.equal(person.efforts[squat].referenceSource, 'measured-performance');
    // TWO OPPOSED FAILURES, for the same intentional copy correction: the claim (built from a
    // recorded day) must survive, and it must not be made by gendering the client.
    assert.match(person.efforts[squat].referenceWords, /Built from what .*did on/);
    assert.ok(!/\b(he|him|his)\b/i.test(person.efforts[squat].referenceWords),
      'the client record cannot carry gender, so a sentence about the client may not assume one: '
        + person.efforts[squat].referenceWords);
    assert.equal(
      person.efforts[squat].repetitions,
      7,
      'the low point of a curve proposed something other than exactly what he last did at that level',
    );
  });

  it('names a stand-in from the wider library on the line it stands on', async () => {
    const { store, clientIds, clientNames, sessionId } = await aLaptop();
    const ground = await readTheGround(store, sessionId, clientNames);

    const { proposal } = await shapeTheCurve(store, sessionId, HARD, ground, clientIds);
    const substituted = proposal!.rows.filter((row) => row.fromLibrary);

    assert.ok(substituted.length > 0, 'a curve of three hard points across a routine holding one hard '
      + 'exercise drew nothing from the wider library, so the substitution pool was never used');
    for (const row of substituted) {
      assert.equal(row.exerciseId, ROWER);
      assert.equal(row.exerciseName, 'Rowing machine');
      assert.notEqual(row.standsInForName, null);
      assert.notEqual(row.lineExerciseId, row.exerciseId);
      assert.match(String(row.substitutionWords), /Rowing machine/);
    }
  });

  it('reports which level ran short rather than silently substituting a different intensity', async () => {
    const { store, clientIds, clientNames, sessionId } = await aLaptop({ withSurplus: false });
    const ground = await readTheGround(store, sessionId, clientNames);

    const { proposal } = await shapeTheCurve(store, sessionId, HARD, ground, clientIds);

    assert.equal(proposal!.rows.length, 3, 'the session came back shorter than the routine');
    assert.ok(proposal!.shortfallWords.length > 0, 'three hard points across a routine holding one hard '
      + 'exercise reported no shortfall at all');
    assert.ok(proposal!.rows.some((row) => row.shortfallWords !== null));
  });

  /** One order for the room, CHECKED rather than assumed — see `agreedRows`. */
  it('places the same movement at the same position for people with different records', async () => {
    const { store, routine, clientIds, clientNames } = await aLaptop({
      people: ['The measured one', 'The new one'],
    });

    const past = await aSession(store, routine, clientIds);
    await recordTheLine(store, past, clientIds[0], SQUAT, { repetitions: 9, sets: 3, intensity: 'low' });
    await finish(store, past);

    const now = await aSession(store, routine, clientIds);
    const ground = await readTheGround(store, now, clientNames);
    const { proposal } = await shapeTheCurve(store, now, RISE, ground, clientIds);

    assert.equal(proposal!.people.length, 2);
    assert.equal(proposal!.people[0].calibrated, true);
    assert.equal(proposal!.people[1].calibrated, false);
    // One order, and DIFFERENT numbers under it — which is what per-client calibration means.
    assert.notDeepEqual(
      proposal!.people[0].efforts.map((one) => one.repetitions),
      proposal!.people[1].efforts.map((one) => one.repetitions),
      'two people with different records got identical numbers, so the calibration is not per client',
    );
  });

  it('refuses a curve the library no longer holds, with a sentence and no throw', async () => {
    const { store, clientIds, clientNames, sessionId } = await aLaptop();
    const ground = await readTheGround(store, sessionId, clientNames);

    const result = await shapeTheCurve(store, sessionId, 'a-curve-he-deleted', ground, clientIds);

    assert.equal(result.proposal, null);
    assert.match(String(result.refusal?.headline), /not in your library/);
  });

  /**
   * A CROSS-PERSON DISAGREEMENT IS REFUSED RATHER THAN PAPERED OVER. Driven directly, because the real
   * adapter does not produce one — which is the point: the check exists so that a change in
   * `placeExercises` fails here instead of showing one person's order as everybody's.
   */
  it('refuses to show one person s order as the room s if they ever disagree', async () => {
    const { store, clientNames, sessionId } = await aLaptop();
    const ground = await readTheGround(store, sessionId, clientNames);
    const one = {
      positions: [{
        position: 0, asked_for_level: 'low', exercise_id: SQUAT, substituted_for_exercise_id: null,
      }],
    };
    const other = {
      positions: [{
        position: 0, asked_for_level: 'low', exercise_id: PRESS, substituted_for_exercise_id: null,
      }],
    };

    assert.equal(agreedRows([one, other], ground), null);
    // Pointed at the agreeing case, so a null above means disagreement rather than a broken check.
    assert.notEqual(agreedRows([one, one], ground), null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NOTHING REACHES THE SESSION WITHOUT ACCEPTANCE
// ═══════════════════════════════════════════════════════════════════════════════

describe('the session is untouched until he says so', () => {
  /**
   * SHAPING AND ACCEPTING BOTH WRITE NOTHING, asserted by reading the record — and then the SAME
   * reading is watched moving when one fact is genuinely recorded. A count that could never move proves
   * nothing by staying at nought, which is the exact shape of evidence this build has been bitten by.
   */
  it('writes nothing when a curve is shaped, and nothing when it is accepted', async () => {
    const { store, clientIds, clientNames, sessionId } = await aLaptop();
    const client = clientIds[0];
    const ground = await readTheGround(store, sessionId, clientNames);

    assert.equal(await factsOnRecord(store, sessionId, client), 0);

    const { proposal } = await shapeTheCurve(store, sessionId, RISE, ground, clientIds);
    assert.equal(
      await factsOnRecord(store, sessionId, client),
      0,
      'shaping a curve wrote something into the session',
    );

    const acceptance = accepted(noIntensity(), proposal!, noControls());
    assert.equal(
      await factsOnRecord(store, sessionId, client),
      0,
      'ACCEPTING a curve wrote something into the session — nothing may reach the record until he '
        + 'presses Record on a line',
    );
    // What acceptance DID produce: transient screen state with the lines filled in.
    assert.equal(acceptance.controls.drafts.size, 3);

    // THE NON-VACUITY PROBE. The same reading, watched moving.
    await recordTheLine(store, sessionId, client, SQUAT, { repetitions: 10 });
    assert.equal(
      await factsOnRecord(store, sessionId, client),
      1,
      'the reading that reported nought cannot report anything else, so its nought proved nothing',
    );
  });

  it('leaves the record exactly as it was when a shaped curve is rejected', async () => {
    const { store, clientIds, clientNames, sessionId } = await aLaptop();
    const client = clientIds[0];
    const ground = await readTheGround(store, sessionId, clientNames);

    // One fact of his own, first, so "untouched" means "unchanged" rather than "empty".
    await recordTheLine(store, sessionId, client, PRESS, { repetitions: 12, sets: 3 });
    const before = await performedForClient(store, client, { limit: 50, direction: 'prev' });

    await shapeTheCurve(store, sessionId, RISE, ground, clientIds);
    await shapeTheCurve(store, sessionId, HARD, ground, clientIds);

    const afterwards = await performedForClient(store, client, { limit: 50, direction: 'prev' });
    assert.deepEqual(
      afterwards.items.map((one: { content: Record<string, unknown> }) => one.content),
      before.items.map((one: { content: Record<string, unknown> }) => one.content),
      'the record changed while curves were shaped and set aside',
    );
    assert.equal(before.items.length, 1, 'the comparison was between two empty lists');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// THE NO-RATCHET GUARANTEE, END TO END
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The scenario both tests below run, differing in ONE argument.
 *
 * The squat's library ladder is low 10, medium 15, high 20 repetitions and its own filed intensity is
 * `low`. A curve of three hard points puts it at its HIGH point, where it asks for 20. He records that.
 * Then a curve of three easy points asks the same movement for its LOW point, where the library says 10.
 *
 * With the level recorded, `effort.js` knows the 20 was done at `high` and scales it down the ladder to
 * the low point. WITHOUT it, the fact is no calibration at all: `baseline.js` sets it aside, the low
 * point comes from the coach's own library, and the sentence he reads says what was left out.
 *
 * Both roads must end at 10 and they must end there for DIFFERENT REASONS, so this returns the
 * reference source and the coach's own sentence as well as the number. A test that compared only the
 * number could not tell a scaled measurement from a library default, which is the exact confusion the
 * whole action is about.
 *
 * @param withLevel whether the fact carries the level the curve asked for
 */
async function theSameSquatTwice(withLevel: boolean): Promise<{
  repetitions: number; referenceSource: string; baselineWords: string; calibrated: boolean;
}> {
  const { store, routine, clientIds, clientNames } = await aLaptop({ withSurplus: false });
  const client = clientIds[0];

  // A PAST session, at the hard curve's high point.
  const past = await aSession(store, routine, clientIds);
  const groundThen = await readTheGround(store, past, clientNames);
  const hard = await shapeTheCurve(store, past, HARD, groundThen, clientIds);
  const squatRow = hard.proposal!.rows.find((row) => row.lineExerciseId === SQUAT);
  assert.equal(squatRow?.askedForLevel, 'high', 'the hard curve did not put the squat at its high point');
  assert.equal(
    hard.proposal!.people[0].efforts[squatRow!.position].repetitions,
    20,
    'the high point of the squat is not the 20 repetitions the library ladder holds',
  );

  /**
   * RECORDED THROUGH THE PRODUCTION PATH, not with a hand-written level.
   *
   * A probe caught this: with the level written as a literal here, breaking `withLevel` in
   * `intensity.ts` left this test GREEN — it was proving that the CORE behaves correctly when handed a
   * level, and nothing at all about the surface putting one there. So the curve is ACCEPTED through the
   * real `accepted()`, the line is read through the real `acceptedLine()`, and the values go through the
   * real `withLevel()` — exactly the three calls `SessionControls.pressRecord` makes.
   */
  const acceptance = accepted(noIntensity(), hard.proposal!, noControls());
  const line = acceptedLine(acceptance.accepted, client, SQUAT);
  assert.equal(line?.level, 'high', 'accepting the hard curve did not put the squat at its high point');
  await recordTheLine(store, past, client, SQUAT, withLevel
    ? withLevel_(
      { repetitions: 20, sets: 4, restSeconds: 30 },
      line,
    )
    : { repetitions: 20, sets: 4, restSeconds: 30 });
  await finish(store, past);

  // The level really is or is not on the record, read out of the STORE.
  const stored = await performedForClient(store, client, { limit: 5, direction: 'prev' });
  assert.equal(
    (stored.items[0].content as { intensity_level?: string }).intensity_level,
    withLevel ? 'high' : undefined,
    'the fixture did not store what this test is about',
  );

  // A LATER session, at the easy curve's low point.
  const now = await aSession(store, routine, clientIds);
  const groundNow = await readTheGround(store, now, clientNames);
  const easy = await shapeTheCurve(store, now, EASY, groundNow, clientIds);
  const lowRow = easy.proposal!.rows.find((row) => row.lineExerciseId === SQUAT);
  assert.equal(lowRow?.askedForLevel, 'low');
  const person = easy.proposal!.people[0];
  const effort = person.efforts[lowRow!.position];
  return {
    repetitions: Number(effort.repetitions),
    referenceSource: effort.referenceSource,
    baselineWords: person.baselineWords,
    calibrated: person.calibrated,
  };
}

describe('the no-ratchet guarantee, across two real sessions', () => {
  /**
   * `INTENSITY.md` §3, held END TO END rather than inside one package: work managed at a curve's HIGH
   * point is not proposed back at its LOW one.
   *
   * Broken on purpose by dropping `intensity` from the recorded fact in the production path
   * (`withLevel` in `intensity.ts` returning its argument unchanged); this went red at 20. Restored.
   */
  it('proposes the library s own low point, not what he managed at the high one', async () => {
    const shaped = await theSameSquatTwice(true);

    assert.equal(
      shaped.repetitions,
      10,
      'work managed at the HIGH point came back proposed at the LOW one — the ratchet INTENSITY.md §3 '
        + 'promises is structurally impossible',
    );
    // And it got there BY the measurement, scaled down the ladder — not by falling back on the library.
    assert.equal(shaped.referenceSource, 'measured-performance');
    assert.equal(shaped.calibrated, true);
    assert.match(shaped.baselineWords, /Built from what this client has done/);
    assert.doesNotMatch(shaped.baselineWords, /left out/);
  });

  /**
   * THE SAME SCENARIO WITH THE LEVEL LEFT OFF — every fact already on disk, a line run under no
   * accepted curve, and a substitution he made himself.
   *
   * BEFORE THIS ACTION THIS RETURNED 20 and the suite asserted that it did, as the honest record of a
   * defect: `effort.js` read a level-less fact as though it had been performed at the exercise's own
   * filed level, the ladder's ratio from low to low is one, and the hard number came back at the easy
   * point. That is the fabrication this action removes, so the assertion is INVERTED rather than
   * deleted — the case is still exercised, and it now proves the fix instead of recording the hole.
   *
   * The two roads end at the same 10 and the assertions below are what separate them: this one is not
   * calibrated at all, its number comes from the coach's own library, and his sentence SAYS the fact
   * was left out and what that costs him. A number he is told is a measurement and is not is the one
   * failure worse than having no number.
   */
  it('proposes the library s own low point WITHOUT the level, and says the fact was left out', async () => {
    const shaped = await theSameSquatTwice(false);

    assert.equal(
      shaped.repetitions,
      10,
      'a fact that never said which point it was worked at was still counted at a guessed one',
    );
    assert.equal(shaped.referenceSource, 'library-scaling-point',
      'the number must come from the library, not from a measurement read at an invented level');
    assert.equal(shaped.calibrated, false, 'and it must not be presented as calibrated');
    assert.match(shaped.baselineWords, /left out/);
    assert.match(shaped.baselineWords, /which point of a curve it was worked at/);
    assert.match(shaped.baselineWords, /starting point, not as a measurement/);
    assert.doesNotMatch(shaped.baselineWords, /nothing recorded for this client yet/);
    // And the opposed pair on the near-neighbour sentence, same intentional copy correction.
    assert.match(shaped.baselineWords,
      /every number here comes from your own exercise library and this routine/);
    assert.ok(!/\b(he|him|his)\b/i.test(shaped.baselineWords),
      'the client record cannot carry gender, so a sentence about the client may not assume one: '
        + shaped.baselineWords);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The adapter is a leaf and this file keeps it one
// ═══════════════════════════════════════════════════════════════════════════════

describe('the ground it is shaped on', () => {
  it('takes the routine off the handle this window holds, not from a second read', async () => {
    const { store, clientNames, sessionId } = await aLaptop();

    const ground = await readTheGround(store, sessionId, clientNames);
    assert.notEqual(ground.routine, null);
    assert.equal((ground.routine as { id: string }).id, 'test-intensity-routine');

    // With the lease let go there is no handle, so there is no routine — reported, not invented.
    await leaveTheSession(store, sessionId);
    const afterwards = await readTheGround(store, sessionId, clientNames);
    assert.equal(afterwards.routine, null);
  });

  it('refuses to shape anything when the routine is gone, with a sentence', async () => {
    const { store, clientIds, clientNames, sessionId } = await aLaptop();
    const ground = await readTheGround(store, sessionId, clientNames);

    const result = await shapeTheCurve(
      store, sessionId, RISE, { ...ground, routine: null }, clientIds,
    );

    assert.equal(result.proposal, null);
    assert.match(String(result.refusal?.headline), /not in your library any more/);
    assert.match(String(result.refusal?.headline), /still here/);
  });

  it('refuses to shape anything for nobody', async () => {
    const { store, clientNames, sessionId } = await aLaptop();
    const ground = await readTheGround(store, sessionId, clientNames);

    const result = await shapeTheCurve(store, sessionId, RISE, ground, []);

    assert.equal(result.proposal, null);
    assert.match(String(result.refusal?.headline), /Nobody is recorded as attending/);
  });

  it('gives every position a name a person would read, never a content key', async () => {
    const { store, clientIds, clientNames, sessionId } = await aLaptop();
    const ground = await readTheGround(store, sessionId, clientNames);

    const { proposal } = await shapeTheCurve(store, sessionId, RISE, ground, clientIds);

    for (const row of proposal!.rows) {
      assert.notEqual(row.exerciseName, row.exerciseId, `position ${row.position} is named by its key`);
      assert.ok(/^[A-Z]/.test(row.exerciseName), `"${row.exerciseName}" is not a name he wrote`);
    }
    assert.equal(proposal!.people[0].name, 'Test Client A');
  });

  /**
   * READ FROM THE STORE'S OWN JOURNAL, not off any handle. `readSession` replays the durable log
   * through the real `projectSession` with no lease and no cached view, so this cannot be fooled by a
   * handle that simply never refreshed.
   */
  it('projects the session it shaped without having touched it', async () => {
    const { store, routine, clientIds, clientNames, sessionId } = await aLaptop();
    const ground = await readTheGround(store, sessionId, clientNames);
    await shapeTheCurve(store, sessionId, RISE, ground, clientIds);

    const view = await readSession(store, sessionId, { routine }) as unknown as {
      clients: readonly { timeline: readonly unknown[]; not_yet_recorded: readonly string[] }[];
    };

    assert.deepEqual(view.clients.map((client) => client.timeline.length), [0]);
    // And every line is still untouched — the shaped order reached the screen and not the record.
    assert.deepEqual(view.clients[0].not_yet_recorded, [PRESS, SQUAT, PLANK]);

    // THE NON-VACUITY PROBE: the same reading, watched moving.
    await recordTheLine(store, sessionId, clientIds[0], SQUAT, { repetitions: 10 });
    const afterwards = await readSession(store, sessionId, { routine }) as unknown as {
      clients: readonly { timeline: readonly unknown[] }[];
    };
    assert.deepEqual(afterwards.clients.map((client) => client.timeline.length), [1]);
  });
});
