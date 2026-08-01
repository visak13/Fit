/**
 * HONEST DEGRADATION, PROVEN AGAINST THE REAL SEEDED LIBRARY — and proven by DISCOVERY.
 *
 * The adapter promises two things when a curve asks for more of one level than the coach's content can
 * supply: it never silently puts a different intensity in the position, and it never hands back a
 * shorter session than the routine holds. The suite beside this one proves the path is reached across
 * the forty-nine shipped combinations. This one presses harder, on purpose, and reaches it the way a
 * coach would: by asking for ONE level at every position.
 *
 * ## Why no routine is named here
 *
 * The obvious test picks the routine that runs short today and asserts on it. That test goes on passing
 * the day the library changes underneath it — a routine that gains one more high exercise stops running
 * short and starts exercising the SUBSTITUTION path instead, with the assertion still green and the
 * degradation path no longer entered. So the assertion below is over the DISCOVERED set: every seeded
 * routine is run, and at least one of them must come back short. The table it reports on failure names
 * every routine, so the next reader can see which way the library drifted.
 *
 * ## The general rule this is an instance of
 *
 * THE CONDITION TRIGGERING A DEGRADE-HONESTLY PATH IS USUALLY A MATCH QUALITY, NOT A COUNT. Counting
 * says this can never happen: the catalogue holds 34 high exercises against routines of eight or nine
 * entries, so an all-high curve can always be filled by count. It is reached only because a substitute
 * must ALSO share a movement pattern or a muscle with the exercise it displaces — `matchScore` rejects
 * everything else. A test reasoning about counts alone would report this path proven having never
 * entered it.
 *
 * ## And the message is checked against the session, not against itself
 *
 * A shortfall report that lies is worse than none. Every sentence here makes a separately checkable
 * claim about the session it produced — how long it is, how many positions at that level were filled,
 * which movement ended up in the position. Each is verified by reading the produced session back.
 * Behaviour first, wording second.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import EXERCISES from '../seed/content/exercises.js';
import ROUTINES from '../seed/content/routines.js';
import { INTENSITY_LADDER, proposeSession } from './intensity.js';
import { anExercise, aPattern, aRoutine } from './testing.js';

/**
 * A curve that asks for one level at every position. One point spread by `stretch` lands on every
 * position, which is the most demanding thing a coach can press: it asks the routine for as many
 * movements of one level as it holds exercises.
 *
 * @param {string} level @returns {Record<string, any>}
 */
function everyPositionAt(level) {
  return aPattern([level], 'stretch', `every-position-${level}`);
}

/**
 * Run each routine through the adapter under one curve and measure what came back, per routine:
 * positions asked for, positions filled at the level asked, and which levels ran short.
 *
 * @param {readonly Record<string, any>[]} routines
 * @param {readonly Record<string, any>[]} catalogue
 * @param {Record<string, any>} pattern
 */
function measureFill(routines, catalogue, pattern) {
  return routines.map((routine) => {
    const proposal = proposeSession({ pattern, routine, catalogue });
    const short = proposal.positions.filter((position) => position.shortfall !== null);
    return {
      routine,
      proposal,
      asked: proposal.positions.length,
      filled: proposal.positions.length - short.length,
      levelsShort: proposal.shortfalls.map((shortfall) => `${shortfall.level} short by ${shortfall.positions.length}`),
    };
  });
}

/** The measured table, as one block of text, so a failure carries the whole measurement with it. */
function tableOf(rows) {
  return rows.map((row) => `  ${row.routine.id}: asked ${row.asked}, filled ${row.filled}`
    + `, ${row.levelsShort.join(' and ') || 'nothing short'}`).join('\n');
}

/**
 * The sentence the discovery assertion fails with. Held as a constant because the non-vacuity probe
 * below proves this exact assertion can go red, and it quotes this message to show the red landed on
 * the assertion probed rather than somewhere else in the same test.
 */
const NOTHING_RAN_SHORT = 'NO seeded routine ran short under a curve asking for one level at every '
  + 'position, so the honest-degradation path was never entered by this run';

/**
 * At least one of the routines given ran short. Which one is not asserted and must not be: a named
 * routine goes on passing while silently exercising the substitution path instead.
 *
 * @param {readonly {asked: number, filled: number}[]} rows
 */
function assertSomeRoutineRanShort(rows) {
  assert.ok(rows.some((row) => row.filled < row.asked), `${NOTHING_RAN_SHORT}.\n${tableOf(rows)}`);
}

test('a demanding curve runs the real seeded library short, and WHICH routine is discovered rather than named', () => {
  const rows = measureFill(ROUTINES, EXERCISES, everyPositionAt('high'));
  assert.equal(rows.length, ROUTINES.length, 'every seeded routine is run');

  assertSomeRoutineRanShort(rows);

  // The other side of the same table: this curve is not impossible for everything, so the assertion
  // above is discriminating between routines rather than failing the library wholesale.
  assert.ok(rows.some((row) => row.filled === row.asked),
    `every routine ran short, which would mean the curve rather than the match quality is the cause.\n${tableOf(rows)}`);

  // A shortfall is REPORTED, by level and by count, not merely suffered.
  for (const row of rows.filter((candidate) => candidate.filled < candidate.asked)) {
    assert.ok(row.proposal.shortfalls.length > 0,
      `${row.routine.id} filled ${row.filled} of ${row.asked} and reported no shortfall at all`);
    for (const shortfall of row.proposal.shortfalls) {
      assert.ok(INTENSITY_LADDER.includes(shortfall.level), shortfall.level);
      assert.ok(shortfall.positions.length > 0, `${row.routine.id}: a level short at no position`);
      assert.ok(shortfall.note.includes(`The ${shortfall.level} level ran short`), shortfall.note);
    }
  }
});

test('NO intensity is silently substituted: a movement off the level asked for always says so, in the coach\'s words', () => {
  const catalogue = keyById(EXERCISES);
  let offLevel = 0;
  let onLevel = 0;

  for (const level of INTENSITY_LADDER) {
    for (const routine of ROUTINES) {
      const proposal = proposeSession({ pattern: everyPositionAt(level), routine, catalogue: EXERCISES });
      for (const position of proposal.positions) {
        const where = `${routine.id} position ${position.position} under an all-${level} curve`;
        const actual = catalogue[position.exercise_id].intensity;

        if (actual === position.asked_for_level) {
          onLevel += 1;
          assert.equal(position.shortfall, null, `${where}: on-level and yet reported short`);
          continue;
        }
        offLevel += 1;
        assert.notEqual(position.shortfall, null,
          `${where}: holds a ${actual} movement where the curve asked for ${position.asked_for_level}, silently`);
        assert.equal(position.shortfall.asked_for, position.asked_for_level, where);
        assert.equal(position.shortfall.filled_with, actual, where);
        assert.ok(position.shortfall.note.includes(position.exercise_name),
          `${where}: the sentence does not name the movement it is about: ${position.shortfall.note}`);
        assert.ok(position.shortfall.note.includes(`asks for a ${position.asked_for_level} movement here`),
          `${where}: ${position.shortfall.note}`);
      }

      // A substitute is a DIFFERENT MOVEMENT at the SAME level, and it names what it stood in for.
      for (const position of proposal.positions.filter((candidate) => candidate.source === 'catalogue-substitute')) {
        const where = `${routine.id} position ${position.position} under an all-${level} curve`;
        assert.equal(catalogue[position.exercise_id].intensity, position.asked_for_level,
          `${where}: a substitute at a level other than the one asked for is exactly the silent swap`);
        assert.equal(position.shortfall, null, where);
        assert.ok(position.substitution_note.includes(position.substituted_for_exercise_name), where);
        assert.ok(position.substitution_note.includes(position.exercise_name), where);
      }
    }
  }

  // Non-vacuity, both ways: the two branches above are each entered by the real content, so neither
  // assertion is quiet because nothing reached it.
  assert.ok(offLevel > 0, 'no position anywhere sat off its level, so the first branch proved nothing');
  assert.ok(onLevel > 0, `no position anywhere sat on its level: ${onLevel}`);
});

test('NO produced session is shorter than the routine asked for — read off the session, not off the placement', () => {
  for (const level of INTENSITY_LADDER) {
    const pattern = everyPositionAt(level);
    for (const routine of ROUTINES) {
      const proposal = proposeSession({ pattern, routine, catalogue: EXERCISES });
      const where = `${routine.id} under an all-${level} curve`;

      assert.equal(proposal.positions.length, routine.entries.length, `${where}: shorter than the routine`);
      assert.equal(proposal.curve.levels.length, routine.entries.length, `${where}: the curve itself ran short`);
      assert.equal(new Set(proposal.positions.map((position) => position.exercise_id)).size,
        routine.entries.length, `${where}: a repeated movement is a position lost`);

      // A position that carries no work is a missing position however it is counted, so length is
      // read as playable positions rather than as an array length.
      proposal.positions.forEach((position, index) => {
        assert.equal(position.position, index, `${where}: positions out of order`);
        assert.ok(position.sets >= 1, `${where}: ${position.exercise_id} carries no sets`);
        const work = position.repetitions ?? position.duration_seconds;
        assert.ok(typeof work === 'number' && work > 0, `${where}: ${position.exercise_id} carries no work`);
      });
    }
  }
});

test('what the shortfall message SAYS about the session is true of the session read back', () => {
  const catalogue = keyById(EXERCISES);
  const rows = measureFill(ROUTINES, EXERCISES, everyPositionAt('high'))
    .filter((row) => row.proposal.shortfalls.length > 0);
  assert.ok(rows.length > 0, 'nothing ran short, so no message was checked');

  for (const { routine, proposal } of rows) {
    for (const shortfall of proposal.shortfalls) {
      const where = `${routine.id}: ${shortfall.note}`;

      // CLAIM: "The session is still as long as the routine." Verified against the session.
      assert.ok(shortfall.note.includes('The session is still as long as the routine'), where);
      assert.equal(proposal.positions.length, routine.entries.length, where);

      // CLAIM: it filled N of the M positions the curve asks for at that level. Both numbers are
      // recounted from the produced session and the sentence is rebuilt from them, so a sentence
      // carrying any other pair of numbers fails to match.
      const askedAt = proposal.positions.filter((position) => position.asked_for_level === shortfall.level);
      const filledAt = askedAt.filter((position) => position.shortfall === null).length;
      assert.ok(shortfall.note.includes(`filled ${filledAt} of the ${askedAt.length} `
        + `${askedAt.length === 1 ? 'position' : 'positions'}`), where);
      assert.equal(shortfall.positions.length, askedAt.length - filledAt, where);

      // CLAIM: these positions ran short. Verified by reading those positions of the session.
      for (const index of shortfall.positions) {
        const position = proposal.positions[index];
        assert.equal(position.asked_for_level, shortfall.level, where);
        assert.notEqual(position.shortfall, null, where);
      }
    }

    // CLAIM, per position: the position HOLDS this movement, and it is an easier or a harder one.
    // Both are read back off the session: the movement it actually holds and where that movement
    // sits on the ladder against the level asked for.
    for (const position of proposal.positions.filter((candidate) => candidate.shortfall !== null)) {
      const held = catalogue[position.exercise_id];
      const where = `${routine.id} position ${position.position}: ${position.shortfall.note}`;
      assert.ok(position.shortfall.note.includes(`the position holds ${position.exercise_name}`), where);
      assert.equal(position.exercise_name, held.name, where);
      const direction = INTENSITY_LADDER.indexOf(held.intensity) < INTENSITY_LADDER.indexOf(position.asked_for_level)
        ? 'an easier movement' : 'a harder movement';
      assert.ok(position.shortfall.note.includes(direction),
        `${where}\n  ${held.name} is ${held.intensity} against an asked-for ${position.asked_for_level}, `
        + `so the sentence must say ${direction}`);
    }
  }
});

test('the discovery assertion CAN go red: against a library where nothing runs short, it fails quoting its own message', () => {
  // SYNTHETIC, built here rather than copied out of the tree: every exercise shares one movement
  // pattern and one muscle, so every candidate is a top-scoring substitute, and each level holds far
  // more movements than any routine has positions. Nothing can run short.
  const catalogue = INTENSITY_LADDER.flatMap((level) => [0, 1, 2, 3, 4, 5]
    .map((index) => anExercise({ id: `probe-${level}-${index}`, intensity: level })));
  const at = (level) => catalogue.filter((exercise) => exercise.intensity === level);
  const routines = [
    aRoutine({ exercises: [at('low')[0], at('medium')[0], at('high')[0], at('low')[1]], id: 'probe-routine-one' }),
    aRoutine({ exercises: [at('medium')[1], at('medium')[2], at('high')[1], at('low')[2]], id: 'probe-routine-two' }),
  ];

  const rows = measureFill(routines, catalogue, everyPositionAt('high'));

  // THE BREAK IS CONFIRMED APPLIED before the red is claimed: this library genuinely fills every
  // position of every routine, which is the condition the assertion exists to catch the absence of.
  for (const row of rows) {
    assert.equal(row.filled, row.asked, `the probe library was meant to fill everything: ${tableOf(rows)}`);
    assert.deepEqual(row.proposal.shortfalls, [], row.routine.id);
  }

  // And the red lands on the assertion under test — the same function the real measurement calls —
  // carrying that assertion's own sentence.
  let failure = null;
  try {
    assertSomeRoutineRanShort(rows);
  } catch (thrown) {
    failure = thrown;
  }
  assert.ok(failure instanceof assert.AssertionError,
    'the assertion did not fail at all against a library where nothing runs short');
  assert.ok(failure.message.startsWith(NOTHING_RAN_SHORT),
    `the red landed somewhere else: ${failure.message}`);
  assert.ok(failure.message.includes('probe-routine-one'), 'and it carries the table that was measured');
});

/** The catalogue keyed by id, for reading back what a position actually holds. */
function keyById(exercises) {
  const keyed = {};
  for (const exercise of exercises) keyed[exercise.id] = exercise;
  return keyed;
}
