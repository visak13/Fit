/**
 * THE RUNNER'S JUDGEMENT, ASSERTED WITH NO RENDERING AT ALL.
 *
 * Every view driven through here is built by the REAL projection — `projectSession` from
 * `core/session/projection.js` — over a journal in the shape `readJournal` returns. Nothing here
 * describes a view in its own words: a suite satisfied by a shape it wrote itself would go on passing
 * while the projection moved underneath it, and the thing being checked is what the coach is told
 * about a real record.
 *
 * ## THE TWO ABSENCES, AND WHY AN ABSENCE NEEDS A TEST AT ALL
 *
 * `SESSION.md` §2: anything describing where a session has got to is DERIVED, never persisted — no
 * cursor, no current exercise, no next exercise, no step index. §8: nothing suggests, proposes a
 * heavier load or carries one forward. `glance.js` already carries both guards, and this is the other
 * screen where breaking either would feel most helpful. An absent feature and a forgotten one look
 * identical to the next editor, so both are asserted on the OUTPUT and on this module's own SOURCE.
 *
 * A scan whose entire result is an absence is worth nothing until it has been pointed at a known
 * positive in the same run, so each of them is: the same scan finds the word where it is genuinely
 * present, in this file, before its silence about `runner.ts` is believed.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { aPerformedRecord, aRoutine, aSession } from '../../core/model/fixtures.js';
import { projectSession } from '../../core/session/projection.js';
import {
  JOINING_LINK_LABEL, JOINING_LINK_NOT_COPIED, NO_SESSION_OPEN_WHAT_TO_DO, OPEN_SESSION_KEY,
  RUNNER_ADDRESS, describeOpening, describeRoom, describeSession, joiningLinkOf, roomStateWords,
  sessionAddress,
} from './runner';
import type { RunnerContext } from './runner';

const here = path.dirname(fileURLToPath(import.meta.url));

const CLIENT = 'client-in-the-room';
const SESSION = 'the-session-being-run';

/** The routine, in the order the coach declared it. */
const ROUTINE = aRoutine({
  id: 'test-runner-routine',
  name: 'Test Runner Routine',
  entries: [
    { exercise_id: 'press', sets: 3, repetitions: 12 },
    { exercise_id: 'squat', sets: 4, repetitions: 8 },
    { exercise_id: 'plank', duration_seconds: 60, rest_seconds: 30 },
  ],
});

/**
 * A ROUTINE THAT OVERRIDES NOTHING AT ALL, which is what seven of the shipped Pull day's nine lines
 * are and what no fixture in this build had until the coach was shown seven blank lines.
 */
const INHERITING_ROUTINE = aRoutine({
  id: 'test-inheriting-routine',
  name: 'Test Inheriting Routine',
  entries: [
    { exercise_id: 'press' },
    { exercise_id: 'squat', sets: 5 },
    { exercise_id: 'plank' },
  ],
});

/**
 * The exercise records the store would have read back, and the other half of every line's numbers.
 *
 * `core/model/entities/routine.js`: the routine's four optional entry fields are OVERRIDES and
 * omitting one inherits the exercise's own default. A fixture that gave every entry a full
 * prescription is exactly how this build shipped a runner in which inheritance did not exist.
 */
const EXERCISE_DEFAULTS = new Map([
  ['press', { default_prescription: { sets: 3, repetitions: 12 }, default_rest_seconds: 45 }],
  ['squat', { default_prescription: { sets: 4, repetitions: 8 }, default_rest_seconds: 90 }],
  ['plank', { default_prescription: { sets: 3, duration_seconds: 60 }, default_rest_seconds: 30 }],
  ['rower', { default_prescription: { sets: 1, duration_seconds: 600 }, default_rest_seconds: 60 }],
]);

/** The names the store would have read back. */
const CONTEXT: RunnerContext = {
  clientNames: new Map([[CLIENT, 'Test Client A']]),
  exerciseNames: new Map([
    ['press', 'Bench press'], ['squat', 'Back squat'], ['plank', 'Front plank'],
    ['rower', 'Rowing machine'],
  ]),
  exerciseDefaults: EXERCISE_DEFAULTS,
  routineName: 'Test Runner Routine',
};

/**
 * A view of a session with the given facts recorded against the one client.
 *
 * The journal is the shape `readJournal` hands back, and the view is derived by the real projection.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function aViewWith(
  performed: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extra: { sessionNotes?: any[]; status?: string; routine?: any } = {},
) {
  const routine = extra.routine ?? ROUTINE;
  const session = {
    record_id: SESSION,
    content: {
      ...aSession({ client_ids: [CLIENT], routine_id: routine.id }),
      status: extra.status ?? 'in_progress',
      started_at: '2026-07-26T10:00:00.000Z',
    },
  };

  return projectSession({
    session,
    performed: { [CLIENT]: performed },
    readings: { [CLIENT]: [] },
    notes: { [CLIENT]: [] },
    sessionNotes: extra.sessionNotes ?? [],
    recordCount: performed.length + (extra.sessionNotes?.length ?? 0),
  }, { routine: { record_id: 'routine-record', content: routine } });
}

/** One performed record, as the store holds it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function performed(over: Record<string, unknown>): any {
  return {
    record_id: `performed-${String(over.exercise_id)}-${String(over.position ?? 0)}`,
    content: aPerformedRecord({
      session_id: SESSION, client_id: CLIENT, recorded_at: '2026-07-26T10:05:00.000Z', ...over,
    }),
  };
}

describe('the address', () => {
  it('names a session by identity and never by anybody\'s name', () => {
    const address = sessionAddress('a session identity');
    assert.equal(address, `${RUNNER_ADDRESS}?${OPEN_SESSION_KEY}=a%20session%20identity`);
    assert.ok(address.startsWith(`${RUNNER_ADDRESS}?`));
  });

  it('is one address with an answer on it, not a second address for one screen', () => {
    assert.ok(
      !sessionAddress('x').replace(`${RUNNER_ADDRESS}?`, '').includes('/'),
      'the identity became a path segment, so the route table now answers to two addresses for one '
        + 'screen and no-dead-ends.test.ts is holding one of them',
    );
  });
});

describe('a refusal', () => {
  /**
   * THE CORE'S OWN SENTENCE, CARRIED THROUGH UNCHANGED. A second version written in the screen would
   * be two sentences about one refusal, free to drift apart, and which one he read would depend on
   * where he happened to be standing.
   */
  for (const refusal of [
    { reason: 'held_elsewhere', message: 'That session is open in your other window.' },
    { reason: 'not_found', message: 'That session is not on this device.' },
    { reason: 'already_finished', message: 'That session has already finished.' },
  ]) {
    it(`shows the core's own words for ${refusal.reason}`, () => {
      const report = describeOpening({ ok: false, ...refusal });
      assert.equal(report.open, false);
      assert.equal(report.headline, refusal.message);
      assert.equal(report.reason, refusal.reason);
    });
  }

  it('says what to do about a session that is not here, and adds nothing to one that is held', () => {
    assert.equal(
      describeOpening({ ok: false, reason: 'not_found', message: 'That session is not on this device.' })
        .whatToDo,
      NO_SESSION_OPEN_WHAT_TO_DO,
    );
    assert.equal(
      describeOpening({ ok: false, reason: 'held_elsewhere', message: 'Open in your other window.' })
        .whatToDo,
      null,
      'a second instruction was added to a refusal whose own sentence already carries one',
    );
  });

  it('still says something when a refusal arrived with no sentence at all', () => {
    const report = describeOpening({ ok: false, reason: 'unworded' });
    assert.ok(report.headline.length > 0, 'an unworded refusal produced a blank card, which hides it');
  });
});

describe('what the record says', () => {
  it('lists the routine\'s lines in its DECLARED order, whatever order the session ran in', () => {
    // He jumped to the plank first, then came back to the press. The record knows; the routine's
    // order is unchanged, because it is a default and not a script.
    const view = aViewWith([
      performed({ exercise_id: 'plank', position: 0, status: 'performed' }),
      performed({ exercise_id: 'press', position: 1, status: 'performed' }),
    ]);
    const report = describeSession(view as never, CONTEXT);

    assert.deepEqual(
      report.attendees[0].lines.map((line) => line.name),
      ['Bench press', 'Back squat', 'Front plank'],
      'the lines were re-ordered by what has been recorded, which tells the coach where to go next',
    );
  });

  it('says what has nothing against it yet as a fact about the RECORD', () => {
    const view = aViewWith([performed({ exercise_id: 'press', position: 0, status: 'performed' })]);
    const report = describeSession(view as never, CONTEXT);
    const [attendee] = report.attendees;

    assert.deepEqual(
      attendee.lines.map((line) => line.notYetRecorded),
      [false, true, true],
    );
    assert.match(attendee.notYetRecordedWords ?? '', /nothing recorded against them yet/);
    assert.equal(attendee.lines[0].words, 'Recorded');
  });

  it('says nothing about what is outstanding once everything has something against it', () => {
    const view = aViewWith([
      performed({ exercise_id: 'press', position: 0, status: 'performed' }),
      performed({ exercise_id: 'squat', position: 1, status: 'skipped' }),
      performed({ exercise_id: 'plank', position: 2, status: 'performed' }),
    ]);
    const [attendee] = describeSession(view as never, CONTEXT).attendees;

    assert.equal(attendee.notYetRecordedWords, null);
    assert.equal(attendee.lines[1].words, 'Recorded as skipped');
  });

  it('shows a repeat as a repeat rather than as one attempt overwriting another', () => {
    const view = aViewWith([
      performed({ exercise_id: 'press', position: 0, status: 'performed' }),
      performed({ exercise_id: 'press', position: 1, status: 'performed' }),
    ]);
    const [attendee] = describeSession(view as never, CONTEXT).attendees;
    assert.match(attendee.lines[0].words, /more than once/);
  });

  it('attaches a substitution to the line it replaced, not to a line of its own', () => {
    const view = aViewWith([
      performed({
        exercise_id: 'rower', substituted_for_exercise_id: 'squat', position: 0,
        status: 'substituted',
      }),
    ]);
    const [attendee] = describeSession(view as never, CONTEXT).attendees;

    assert.equal(attendee.lines[1].name, 'Back squat');
    assert.match(attendee.lines[1].words, /in its place/);
    assert.deepEqual(attendee.beyondTheRoutine, []);
  });

  it('reports work outside the routine rather than dropping it or standing it in for a line', () => {
    const view = aViewWith([performed({ exercise_id: 'rower', position: 0, status: 'performed' })]);
    const [attendee] = describeSession(view as never, CONTEXT).attendees;

    assert.deepEqual(attendee.beyondTheRoutine, ['Rowing machine']);
    assert.deepEqual(attendee.lines.map((line) => line.notYetRecorded), [true, true, true]);
  });

  it('shows a load he noted exactly as he wrote it, against the line he noted it on', () => {
    const view = aViewWith([
      performed({ exercise_id: 'press', position: 0, status: 'performed', observed_load: '42.5kg' }),
    ]);
    const [attendee] = describeSession(view as never, CONTEXT).attendees;

    assert.deepEqual(attendee.lines[0].loads, ['42.5kg']);
    assert.deepEqual(attendee.lines[1].loads, []);
  });

  /**
   * A PRESCRIPTION IS WORK AND REST, NEVER A LOAD. The shipped library carries no weights at all and
   * the record forbids one on library content; a load is a per-client observation the coach made.
   */
  it('words what the line is prescribed at without ever naming a weight', () => {
    const [attendee] = describeSession(aViewWith([]) as never, CONTEXT).attendees;

    // The rest on both lines is INHERITED — neither entry overrides it — which is the half that was
    // missing. Before, the press line read "3 sets · 12 reps" and the plank line had no sets at all.
    assert.equal(attendee.lines[0].prescription, '3 × 12 · 45s rest');
    assert.equal(attendee.lines[2].prescription, '3 × 60s · 30s rest');
    for (const line of attendee.lines) {
      assert.doesNotMatch(String(line.prescription), /kg|load|weight/i);
    }
  });

  /**
   * THE DEFECT THE COACH SAW: seven of the shipped Pull day's nine lines carry no override, and every
   * consumer here treated the routine's override as though it were the whole prescription. So the
   * lines that were programmed showed numbers and the rest showed nothing at all.
   */
  it('shows numbers on EVERY line, including the ones the routine overrides nothing on', () => {
    const view = aViewWith([], { routine: INHERITING_ROUTINE });
    const [attendee] = describeSession(view as never, CONTEXT).attendees;

    for (const line of attendee.lines) {
      assert.notEqual(
        line.prescription, null,
        `${line.name} shows the coach no sets, no reps and no rest, which is the defect this fixed`,
      );
    }
    assert.equal(attendee.lines[0].prescription, '3 × 12 · 45s rest');
    assert.equal(attendee.lines[2].prescription, '3 × 60s · 30s rest');
  });

  /**
   * ASSERT WHICH ROAD, NOT ONLY WHERE IT ENDED. Once inheritance works, a number the routine set and
   * one inherited from the exercise are the same number — and the squat line below is deliberately
   * the collision: 5 sets it programmed itself, 8 reps and 90 seconds rest it did not.
   */
  it('carries where each number came from, so a resolved default is never mistaken for a choice', () => {
    const view = aViewWith([], { routine: INHERITING_ROUTINE });
    const [attendee] = describeSession(view as never, CONTEXT).attendees;

    assert.deepEqual(attendee.lines[1].effective.sources, {
      sets: 'routine',
      repetitions: 'exercise',
      duration_seconds: 'neither',
      rest_seconds: 'exercise',
    });
    assert.equal(attendee.lines[1].effective.sets, 5, 'the routine\'s own 5 sets was displaced');
    assert.deepEqual(attendee.lines[0].effective.sources, {
      sets: 'exercise',
      repetitions: 'exercise',
      duration_seconds: 'neither',
      rest_seconds: 'exercise',
    });
  });

  /** An exercise he has since deleted has no defaults to inherit. That is honest, and not a gap to
   * fill with an invented number. */
  it('shows the routine\'s own numbers alone for an exercise no longer in the library', () => {
    const view = aViewWith([], { routine: INHERITING_ROUTINE });
    const [attendee] = describeSession(view as never, { ...CONTEXT, exerciseDefaults: new Map() })
      .attendees;

    assert.equal(attendee.lines[0].prescription, null);
    assert.equal(attendee.lines[1].prescription, '5 sets');
    assert.equal(attendee.lines[1].effective.sources.repetitions, 'neither');
  });

  it('reports how many stored facts it was read back from, as a number he can check', () => {
    const report = describeSession(
      aViewWith([performed({ exercise_id: 'press', position: 0, status: 'performed' })]) as never,
      CONTEXT,
    );
    assert.match(report.replayedWords, /1 stored fact\./);
  });

  it('names the person, and says so honestly when their name cannot be read back', () => {
    const view = aViewWith([]);
    const named = describeSession(view as never, CONTEXT);
    assert.equal(named.attendees[0].name, 'Test Client A');

    const unnamed = describeSession(view as never, { ...CONTEXT, clientNames: new Map() });
    assert.doesNotMatch(
      unnamed.attendees[0].name,
      new RegExp(CLIENT),
      'a bare record identity was shown where a name goes, which is a machine talking',
    );
  });

  it('shows an exercise the coach has since deleted by the key the session really used', () => {
    const view = aViewWith([]);
    const report = describeSession(view as never, { ...CONTEXT, exerciseNames: new Map() });
    assert.deepEqual(report.attendees[0].lines.map((line) => line.name), ['press', 'squat', 'plank']);
  });

  it('says the routine is gone rather than showing a session with nothing in it', () => {
    const empty = projectSession({
      session: {
        record_id: SESSION,
        content: { ...aSession({ client_ids: [CLIENT] }), status: 'in_progress' },
      },
      performed: { [CLIENT]: [] },
      readings: { [CLIENT]: [] },
      notes: { [CLIENT]: [] },
      sessionNotes: [],
      recordCount: 0,
    }, {});

    const report = describeSession(empty as never, { ...CONTEXT, routineName: null });
    assert.ok((report.routineUnknownWords ?? '').length > 0);
    assert.match(report.heading, /no longer in your library/);
  });

  it('names everybody in the room, because a shared session is one session', () => {
    const attendees = [
      { name: 'Test Client A' }, { name: 'Test Client B' }, { name: 'Test Client C' },
    ] as never;
    assert.equal(describeRoom(attendees), 'With Test Client A, Test Client B and Test Client C.');
    assert.equal(describeRoom([{ name: 'Test Client A' }] as never), 'With Test Client A.');
  });

  /**
   * THE ROOM AND THE STATE, FOLDED INTO ONE LINE, and both facts survive the fold: who is here and
   * what the record says about the session, never merely one of the two.
   */
  it('folds who is in the room and the session state into one meta line', () => {
    const attendees = [{ name: 'Test Client A' }] as never;
    assert.equal(
      roomStateWords(attendees, 'Running in this window.'),
      'With Test Client A · running in this window.',
    );
    assert.equal(
      roomStateWords([], 'Written down, not started.'),
      'Nobody is recorded as attending this session · written down, not started.',
    );
  });
});

describe('the rules this screen could break with no test noticing', () => {
  /** Every word this module's own source uses, for the two scans below. */
  async function source(): Promise<string> {
    return readFile(path.join(here, 'runner.ts'), 'utf8');
  }

  /**
   * NO CURSOR, ANYWHERE. Not on the record, not in the view, and not in what this module derives from
   * it. Two sources of truth about where a session is would eventually disagree, in the middle of a
   * real session with a client waiting.
   */
  it('derives nothing that says where the session has got to', async () => {
    const view = aViewWith([performed({ exercise_id: 'press', position: 0, status: 'performed' })]);
    const report = describeSession(view as never, CONTEXT);

    const words = JSON.stringify(report).toLowerCase();
    for (const forbidden of ['current_exercise', 'currentexercise', 'next_exercise', 'nextexercise',
      'step_index', 'stepindex', 'cursor', 'up next']) {
      assert.ok(
        !words.includes(forbidden),
        `the report contains "${forbidden}", which is a position in a script. SESSION.md §2: a `
          + 'session is a record of what OCCURRED, and anything describing where it has got to is '
          + 'derived and never persisted — including into what a screen sends onward.',
      );
    }

    // The scan pointed at a known positive, so its silence above means something.
    assert.ok(JSON.stringify({ cursor: 1 }).toLowerCase().includes('cursor'));
  });

  it('does not name a cursor in its own source either', async () => {
    const text = (await source()).toLowerCase();
    // The words appear in this file's prose as things that are NOT here, which is exactly why the
    // scan is pointed at the SOURCE's own code lines rather than at its comments.
    const code = text
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
      .join('\n');

    for (const forbidden of ['currentexercise', 'nextexercise', 'stepindex', 'cursor']) {
      assert.ok(!code.includes(forbidden), `runner.ts names ${forbidden} in its code`);
    }
    assert.ok(text.includes('cursor'), 'the scan found nothing at all, so it proves nothing');
  });

  /**
   * NOTHING SUGGESTS ANYTHING. No proposed load, no progression, nothing carried forward. This is the
   * screen where adding one would feel most helpful, and `glance.js` carries the identical guard.
   */
  it('says nothing that suggests, recommends or proposes', () => {
    const view = aViewWith([
      performed({ exercise_id: 'press', position: 0, status: 'performed', observed_load: '42.5kg' }),
    ]);
    const words = JSON.stringify(describeSession(view as never, CONTEXT)).toLowerCase();

    for (const forbidden of ['suggest', 'recommend', 'progression', 'try ', 'should']) {
      assert.ok(
        !words.includes(forbidden),
        `the report contains "${forbidden}". The app supports and the coach decides; a training-load `
          + 'judgement belongs to a certified professional adapting to a client\'s history.',
      );
    }
    assert.ok(JSON.stringify({ a: 'we suggest' }).toLowerCase().includes('suggest'));
  });

  it('carries no emoji in anything it says', () => {
    const view = aViewWith([performed({ exercise_id: 'press', position: 0, status: 'performed' })]);
    const words = JSON.stringify(describeSession(view as never, CONTEXT))
      + JSON.stringify(describeOpening({ ok: false, reason: 'not_found', message: 'Not here.' }));

    assert.doesNotMatch(words, /\p{Extended_Pictographic}/u, 'an emoji reached a user-facing string');
  });
});

describe('the joining link, printed where the session is run', () => {
  it('reads the record`s own link off the projection, and nothing else as one', () => {
    assert.equal(
      joiningLinkOf({ meet_url: 'https://meet.google.com/abc-defg-hij' }),
      'https://meet.google.com/abc-defg-hij',
    );
    assert.equal(joiningLinkOf({}), null, 'an absent field read as a link');
    assert.equal(joiningLinkOf({ meet_url: null }), null);
    assert.equal(joiningLinkOf({ meet_url: '  ' }), null, 'whitespace read as a link');
    assert.equal(joiningLinkOf({ meet_url: 42 }), null, 'a non-string read as a link');
  });

  it('labels the link as a fact and words both clipboard outcomes', () => {
    assert.ok(JOINING_LINK_LABEL.length > 0);
    assert.ok(JOINING_LINK_NOT_COPIED.includes('select'),
      'the refusal must leave him a route that does not need the clipboard');
  });
});
