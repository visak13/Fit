/**
 * THE EFFECTIVE PRESCRIPTION, ASSERTED ON THE SHIPPED CONTENT AND NOT ONLY ON FIXTURES.
 *
 * The defect this module exists to end was invisible to every gate in this build for one reason: the
 * suites all supplied their own prescriptions. A fixture that fills in `sets` and `repetitions` is a
 * fixture in which inheritance is never needed, so nothing ever noticed that inheritance did not
 * exist. This file therefore drives the REAL shipped exercise library and the REAL shipped routines
 * through the resolution as well as its own fixtures — the shipped Pull day is the case the coach
 * actually saw, and seven of its nine lines override nothing.
 *
 * ## ASSERT WHICH ROAD, NOT ONLY WHERE IT ENDED
 *
 * Once inheritance works, a number the routine set and a number inherited from the exercise are the
 * same number, and a test comparing only the number stops being able to tell them apart — a routine
 * that restates the exercise's own default produces an identical result by a different route. So
 * every assertion about precedence here reads {@link EffectivePrescription.sources} as well as the
 * value, and one test drives exactly that collision on purpose.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import SHIPPED_EXERCISES from '../../core/seed/content/exercises.js';
import SHIPPED_ROUTINES from '../../core/seed/content/routines.js';
import {
  PRESCRIPTION_FIELDS, hasAnyNumber, hasInheritedNumbers, hasRoutineNumbers, resolvePrescription,
} from './effective-prescription';
import type { ExerciseDefaults, Prescription } from './effective-prescription';

/** No overrides at all — what `prescriptionOf` hands over for an entry that is a bare exercise id. */
const NO_OVERRIDES: Prescription = {
  sets: null, repetitions: null, duration_seconds: null, rest_seconds: null,
};

/** An exercise counted in repetitions, as the model requires one to be shaped. */
const COUNTED: ExerciseDefaults = {
  default_prescription: { sets: 3, repetitions: 12 },
  default_rest_seconds: 45,
};

/** An exercise measured in time. */
const HELD: ExerciseDefaults = {
  default_prescription: { sets: 2, duration_seconds: 45 },
  default_rest_seconds: 60,
};

describe('inheriting what the routine did not override', () => {
  it('fills every field the routine left alone from the exercise\'s own defaults', () => {
    const effective = resolvePrescription(NO_OVERRIDES, COUNTED);

    assert.deepEqual(
      { sets: effective.sets, repetitions: effective.repetitions, rest: effective.rest_seconds },
      { sets: 3, repetitions: 12, rest: 45 },
    );
    // WHICH ROAD, not only where it ended. Without this the test passes just as well against a
    // module that had somehow read these numbers off the routine.
    assert.deepEqual(effective.sources, {
      sets: 'exercise',
      repetitions: 'exercise',
      duration_seconds: 'neither',
      rest_seconds: 'exercise',
    });
    assert.equal(hasInheritedNumbers(effective), true);
    assert.equal(hasRoutineNumbers(effective), false);
  });

  it('carries a held exercise\'s duration through, so a plank is still something to hold', () => {
    const effective = resolvePrescription(NO_OVERRIDES, HELD);

    assert.equal(effective.duration_seconds, 45);
    assert.equal(effective.repetitions, null);
    assert.equal(effective.sources.duration_seconds, 'exercise');
  });

  /**
   * AN INHERITANCE THAT OVERWRITES AN EXPLICIT CHOICE IS WORSE THAN NO INHERITANCE AT ALL. This is
   * the direction that would silently discard what the coach programmed into his routine.
   */
  it('never lets a default displace a number the routine set', () => {
    const effective = resolvePrescription(
      { sets: 5, repetitions: 6, duration_seconds: null, rest_seconds: 90 },
      COUNTED,
    );

    assert.deepEqual(
      [effective.sets, effective.repetitions, effective.rest_seconds],
      [5, 6, 90],
    );
    assert.deepEqual(effective.sources, {
      sets: 'routine',
      repetitions: 'routine',
      duration_seconds: 'neither',
      rest_seconds: 'routine',
    });
    assert.equal(hasInheritedNumbers(effective), false);
  });

  /**
   * THE MIXED LINE, which is the shipped Pull day's opening entry: sets and reps of its own, and no
   * rest, so the rest comes from the exercise. It is also the line on which a four-way merge would
   * disagree with itself.
   */
  it('takes each field from whichever place has it, and says which for every one', () => {
    const effective = resolvePrescription(
      { sets: 2, repetitions: 20, duration_seconds: null, rest_seconds: null },
      COUNTED,
    );

    assert.deepEqual(
      [effective.sets, effective.repetitions, effective.rest_seconds],
      [2, 20, 45],
    );
    assert.deepEqual(effective.sources, {
      sets: 'routine',
      repetitions: 'routine',
      duration_seconds: 'neither',
      rest_seconds: 'exercise',
    });
    assert.equal(hasRoutineNumbers(effective), true);
    assert.equal(hasInheritedNumbers(effective), true);
  });

  /**
   * TWO ROADS, ONE NUMBER. `routine.js` discourages a restated default rather than rejecting it, so
   * this is content that really can exist — and the resolved NUMBERS are then identical whichever
   * road was taken. Only the sources tell them apart, which is the whole reason they are carried.
   */
  it('tells a restated default from an inherited one, which the numbers alone cannot', () => {
    const restated = resolvePrescription(
      { sets: 3, repetitions: 12, duration_seconds: null, rest_seconds: 45 },
      COUNTED,
    );
    const inherited = resolvePrescription(NO_OVERRIDES, COUNTED);

    assert.deepEqual(
      PRESCRIPTION_FIELDS.map((field) => restated[field]),
      PRESCRIPTION_FIELDS.map((field) => inherited[field]),
      'the fixture no longer produces the same numbers by both roads, so this test proves nothing',
    );
    assert.notDeepEqual(
      restated.sources, inherited.sources,
      'a number the coach programmed and a number inherited from the library are indistinguishable',
    );
    assert.equal(restated.sources.sets, 'routine');
    assert.equal(inherited.sources.sets, 'exercise');
  });
});

describe('the work unit, which is one answer in two fields', () => {
  /**
   * The model keeps these in step — `referential.js` requires an override to agree with the
   * exercise's `measurement` — so this is content edited outside the validator, or an exercise whose
   * measurement changed under a routine still referring to it. A field-by-field merge would hand
   * every consumer a line carrying BOTH, and `workKindOf` reads `duration_seconds` first: the coach
   * would be shown a countdown on a line his routine asked for in repetitions.
   */
  it('replaces both halves when the routine names either, so no line carries reps AND a duration', () => {
    const effective = resolvePrescription(
      { sets: null, repetitions: 15, duration_seconds: null, rest_seconds: null },
      HELD,
    );

    assert.equal(effective.repetitions, 15);
    assert.equal(effective.duration_seconds, null, 'the line carries a rep count and a duration');
    assert.equal(effective.sources.repetitions, 'routine');
    assert.equal(effective.sources.duration_seconds, 'neither');
    // The fields that are NOT the work unit are unaffected by it.
    assert.deepEqual([effective.sets, effective.rest_seconds], [2, 60]);
    assert.deepEqual(
      [effective.sources.sets, effective.sources.rest_seconds], ['exercise', 'exercise'],
    );
  });

  it('does the same in the other direction', () => {
    const effective = resolvePrescription(
      { sets: null, repetitions: null, duration_seconds: 30, rest_seconds: null },
      COUNTED,
    );

    assert.equal(effective.duration_seconds, 30);
    assert.equal(effective.repetitions, null, 'the line carries a duration and a rep count');
  });
});

describe('when there is nothing to inherit', () => {
  /** He deleted the exercise. The session's own history is not erased by that, and neither is his
   * routine's own programming — but there are no defaults left to inherit. */
  it('shows the routine\'s own numbers alone, and invents none', () => {
    const effective = resolvePrescription(
      { sets: 4, repetitions: null, duration_seconds: null, rest_seconds: null },
      null,
    );

    assert.equal(effective.sets, 4);
    assert.deepEqual(effective.sources, {
      sets: 'routine',
      repetitions: 'neither',
      duration_seconds: 'neither',
      rest_seconds: 'neither',
    });
    assert.equal(hasAnyNumber(effective), true);
  });

  it('says so plainly when neither place carries a number', () => {
    const effective = resolvePrescription(NO_OVERRIDES, null);

    for (const field of PRESCRIPTION_FIELDS) {
      assert.equal(effective[field], null);
      assert.equal(effective.sources[field], 'neither');
    }
    assert.equal(hasAnyNumber(effective), false);
    assert.equal(hasRoutineNumbers(effective), false);
    assert.equal(hasInheritedNumbers(effective), false);
  });

  it('treats an exercise record with no defaults on it as nothing to inherit, not as a crash', () => {
    assert.equal(hasAnyNumber(resolvePrescription(NO_OVERRIDES, {})), false);
    assert.equal(
      hasAnyNumber(resolvePrescription(NO_OVERRIDES, { default_prescription: null })), false,
    );
    assert.equal(resolvePrescription(null, COUNTED).sets, 3, 'a line with no entry at all threw');
  });
});

/**
 * THIS IS A READ-SIDE RESOLUTION. The routine goes on storing only its overrides, which is what lets
 * the library editor and the reset-to-defaults path tell him truthfully what he has customised. A
 * resolved default is not an override, and this module is where collapsing that distinction would
 * start.
 */
describe('nothing is written back', () => {
  it('leaves the routine\'s stored overrides exactly as they were', () => {
    const stored: Prescription = {
      sets: 2, repetitions: null, duration_seconds: null, rest_seconds: null,
    };
    const before = JSON.stringify(stored);

    resolvePrescription(stored, COUNTED);

    assert.equal(JSON.stringify(stored), before, 'the resolution wrote into the routine\'s entry');
  });

  it('leaves the exercise\'s library record exactly as it was', () => {
    const library: ExerciseDefaults = {
      default_prescription: { sets: 3, repetitions: 12 }, default_rest_seconds: 45,
    };
    const before = JSON.stringify(library);

    resolvePrescription({ sets: 9, repetitions: 9, duration_seconds: null, rest_seconds: 9 }, library);

    assert.equal(JSON.stringify(library), before, 'the resolution wrote into the exercise record');
  });

  it('works over a frozen entry, which is what a stored record is handed out as', () => {
    const frozen = Object.freeze({
      sets: null, repetitions: null, duration_seconds: null, rest_seconds: null,
    }) as Prescription;
    assert.equal(resolvePrescription(frozen, COUNTED).sets, 3);
  });
});

/**
 * THE SHIPPED CONTENT, WHICH IS WHERE THE DEFECT LIVED AND WHERE NO FIXTURE COULD SEE IT.
 *
 * Driven through the application's own copies of the seed content, not through anything this file
 * wrote. If a future edit to the library or to a routine reintroduces a line the coach would be
 * shown nothing for, it fails here rather than in a browser with a client in front of him.
 */
describe('the shipped library and the shipped routines', () => {
  const byId = new Map(
    (SHIPPED_EXERCISES as (ExerciseDefaults & { id: string })[]).map((each) => [each.id, each]),
  );

  it('has an exercise record for every entry of every shipped routine', () => {
    for (const routine of SHIPPED_ROUTINES as { id: string; entries: { exercise_id: string }[] }[]) {
      for (const entry of routine.entries) {
        assert.ok(
          byId.has(entry.exercise_id),
          `${routine.id} names ${entry.exercise_id}, which is not in the shipped library`,
        );
      }
    }
  });

  it('resolves a number onto EVERY line of EVERY shipped routine', () => {
    for (const routine of SHIPPED_ROUTINES as {
      id: string; entries: Record<string, number | string>[];
    }[]) {
      for (const entry of routine.entries) {
        const effective = resolvePrescription(
          {
            sets: (entry.sets as number) ?? null,
            repetitions: (entry.repetitions as number) ?? null,
            duration_seconds: (entry.duration_seconds as number) ?? null,
            rest_seconds: (entry.rest_seconds as number) ?? null,
          },
          byId.get(entry.exercise_id as string) ?? null,
        );
        const where = `${routine.id} / ${String(entry.exercise_id)}`;

        assert.notEqual(effective.sets, null, `${where} resolves to no sets`);
        assert.notEqual(effective.rest_seconds, null, `${where} resolves to no rest`);
        assert.ok(
          effective.repetitions !== null || effective.duration_seconds !== null,
          `${where} resolves to neither a rep count nor a duration`,
        );
        assert.ok(
          effective.repetitions === null || effective.duration_seconds === null,
          `${where} resolves to a rep count AND a duration, so the timer cannot say which it is`,
        );
      }
    }
  });

  /**
   * THE SHIPPED PULL DAY, which is the screen the coach was actually looking at: nine lines, of which
   * exactly two carry an override and seven carried nothing at all before this module existed. Named
   * explicitly rather than swept, because the count is the measurement.
   */
  it('fills in the seven Pull day lines that carry no override, and leaves the two that do', () => {
    const pull = (SHIPPED_ROUTINES as {
      id: string; entries: Record<string, number | string>[];
    }[]).find((each) => each.id === 'pull-deadlift-back-and-biceps');
    assert.ok(pull !== undefined, 'the shipped Pull day is no longer in the seed content');

    const resolved = pull.entries.map((entry) => resolvePrescription(
      {
        sets: (entry.sets as number) ?? null,
        repetitions: (entry.repetitions as number) ?? null,
        duration_seconds: (entry.duration_seconds as number) ?? null,
        rest_seconds: (entry.rest_seconds as number) ?? null,
      },
      byId.get(entry.exercise_id as string) ?? null,
    ));

    assert.equal(resolved.length, 9, 'the shipped Pull day no longer has nine lines');
    assert.equal(
      resolved.filter((each) => hasRoutineNumbers(each)).length, 2,
      'the Pull day no longer has exactly two lines with programming of their own',
    );
    assert.equal(
      resolved.filter((each) => hasInheritedNumbers(each)).length, 9,
      'a Pull day line inherits nothing at all, so the coach is shown a gap on it',
    );
    for (const each of resolved) assert.equal(hasAnyNumber(each), true);

    // The two that DO carry an override keep it. Deadlift is the line the walk opens Adjust on, and
    // band-pull-apart is the mixed one: its own sets and reps, the exercise's rest.
    const bandPullApart = resolved[0];
    assert.deepEqual(
      [bandPullApart.sets, bandPullApart.repetitions], [2, 20],
      'the routine\'s own sets and reps were displaced by the exercise\'s defaults',
    );
    assert.deepEqual(
      [bandPullApart.sources.sets, bandPullApart.sources.rest_seconds], ['routine', 'exercise'],
    );

    const deadHang = resolved[8];
    assert.deepEqual([deadHang.sets, deadHang.duration_seconds], [2, 45]);
    assert.equal(deadHang.sources.duration_seconds, 'routine');
    assert.equal(deadHang.sources.rest_seconds, 'exercise');
  });
});

/**
 * NOTHING HERE SUGGESTS ANYTHING. An inherited number is what the library says this exercise is
 * normally done at, and the same guard `runner.ts` and `glance.js` carry applies to the module that
 * puts numbers on seven lines that had none: the moment inheritance exists, it is the obvious place
 * to grow a recommendation.
 */
describe('the rule this module could break with no test noticing', () => {
  it('says nothing that suggests, recommends or proposes', () => {
    const resolved = JSON.stringify([
      resolvePrescription(NO_OVERRIDES, COUNTED),
      resolvePrescription({ sets: 5, repetitions: 5, duration_seconds: null, rest_seconds: 5 }, HELD),
      resolvePrescription(NO_OVERRIDES, null),
    ]).toLowerCase();

    for (const forbidden of ['suggest', 'recommend', 'progression', 'target', 'should']) {
      assert.ok(!resolved.includes(forbidden), `the resolution carries "${forbidden}"`);
    }
    // The scan pointed at a known positive, so its silence above means something.
    assert.ok(JSON.stringify({ a: 'we suggest' }).toLowerCase().includes('suggest'));
  });
});
