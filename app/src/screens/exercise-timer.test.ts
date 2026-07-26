/**
 * THE EXERCISE TIMER AND ITS COUNT — asserted with no rendering, no browser and no clock.
 *
 * Every value here is driven through the real module, and where a bound belongs to the RECORD it is
 * driven through the record's own validator rather than described in this file's words. A suite
 * satisfied by a shape it wrote itself goes on passing while the thing it is about moves underneath it.
 *
 * ## THE THREE PROPERTIES THIS FILE EXISTS FOR
 *
 * 1. **A plank is held and a squat is counted, with every number overridable in the moment.** Driven
 *    through the routine's own prescription, and the running bounds are pinned against
 *    `validatePerformedRecord` — the record that will carry what he runs.
 * 2. **Audio is never the only signal.** Not asserted by inspection: a whole exercise is run through an
 *    audio port that REFUSES EVERYTHING, the port is then shown to have been genuinely asked and to
 *    have genuinely produced nothing — the disabling confirmed to have applied, because a guard never
 *    exercised and a guard that held are the same green — and the visible transcript is required to be
 *    IDENTICAL, cue for cue, to the one a working device produces.
 * 3. **No timer state is persisted, and the timer is not a position in a script.** `SESSION.md` §2. The
 *    absence is scanned on the words that reach the coach AND on the code, and every scan is pointed at
 *    a known positive in the same run — including at a sibling file that genuinely writes to the store,
 *    so "this module reaches no writer" is a comparison rather than a hope.
 *
 * A scan whose entire output is an absence produces exactly the same output when it is broken,
 * misdirected or looking for the wrong shape. And the source scans read CODE LINES rather than prose:
 * this build documents a prohibition in a comment beside the code it constrains, so a sweep over whole
 * source text matches the very sentences explaining why the forbidden thing is forbidden.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { validatePerformedRecord } from '../../core/model/model.js';
import { MEASUREMENTS } from '../../core/model/vocabularies.js';
import {
  CLEAR_LABEL, CLEAR_TALLY_LABEL, CLOCK_TITLE, COUNTDOWN_FROM, COUNT_DOWN_LABEL, COUNT_UP_LABEL,
  OVERRIDE_FIELDS, OVERRIDE_LABELS, PAUSE_LABEL, REST_ENDED_WORDS, RESUME_LABEL, RUNNING_BOUNDS,
  START_REST_LABEL, START_WORK_LABEL, TALLY_TITLE, TIMER_INTRO, TIMER_PANEL_LABEL, WORK_ENDED_WORDS,
  advance, changeOverride, clearRun, clearTally, clockLine, clockWords, countBy, countdownWords,
  cueTranscript, editOverride, lineKey, namedWords, noTimers, openPanel, openingCue, overrideFrom,
  overrideOf, overrideProblem, panelIsOpen, pauseRun, remainingSeconds, restStartedWords, resumeRun,
  runIsOut, runLine, runnableValue, spentMs, startPhase, startProblem, startedWords, tallyAfter,
  tallyOf, tallyReached, tallyWords, targetCue, targetReachedWords, workKindOf,
} from './exercise-timer';
import type { Cue, Override, TimerState } from './exercise-timer';
import type { Prescription } from './modular-control';
import { recordingAudio, silentAudio, soundCue } from './session-audio';
import type { AudioPort } from './session-audio';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Three people in one session, because everything in this layer is per client. */
const TIRED = 'the-tired-client';
const OTHER = 'the-other-client';

const PLANK = 'plank-hold';
const SQUAT = 'back-squat';

const PLANK_NAME = 'Plank hold';

/** A HELD exercise, as the library prescribes one: a duration and no repetitions. */
const HELD: Prescription = {
  sets: 3, repetitions: null, duration_seconds: 45, rest_seconds: 30,
};

/** A COUNTED exercise: repetitions and no duration. */
const COUNTED: Prescription = {
  sets: 3, repetitions: 12, duration_seconds: null, rest_seconds: 60,
};

/** The moment the suite's clock starts at. Any number; nothing here reads a real one. */
const T0 = 1_000_000;

/** An override with everything filled in, for driving a run without a prescription in the way. */
function typed(over: Partial<Override> = {}): Override {
  return { seconds: '5', repetitions: '12', restSeconds: '10', ...over };
}

/** Everything this module ever says to the coach, as one blob for the absence sweeps. */
function everyWordHeReads(): string {
  const going = startPhase(noTimers(), TIRED, PLANK, 'timed', 'work', typed(), T0);
  const held = pauseRun(going, T0 + 2000);
  const done = advance(going.run as never, PLANK_NAME, T0 + 5000);

  return [
    TIMER_PANEL_LABEL, TIMER_INTRO, START_WORK_LABEL, START_REST_LABEL, PAUSE_LABEL, RESUME_LABEL,
    CLEAR_LABEL, COUNT_UP_LABEL, COUNT_DOWN_LABEL, CLEAR_TALLY_LABEL, TALLY_TITLE, CLOCK_TITLE,
    WORK_ENDED_WORDS, REST_ENDED_WORDS,
    ...Object.values(OVERRIDE_LABELS),
    countdownWords(3), countdownWords(2), countdownWords(1),
    targetReachedWords(12), namedWords(PLANK_NAME), startedWords(PLANK_NAME, 45),
    restStartedWords(30),
    tallyWords(0, null), tallyWords(0, 12), tallyWords(7, 12), tallyWords(12, 12),
    clockLine(null, T0), clockLine(going.run, T0 + 1000), clockLine(held.run, T0 + 2000),
    clockLine(done.run, T0 + 5000),
    clockWords(0), clockWords(9), clockWords(59), clockWords(60), clockWords(105),
    ...OVERRIDE_FIELDS.map((field) => overrideProblem(field, 'nine') ?? ''),
    ...OVERRIDE_FIELDS.map((field) => overrideProblem(field, '99999') ?? ''),
    overrideProblem('seconds', '0') ?? '',
    overrideProblem('repetitions', '0') ?? '',
    startProblem('work', typed({ seconds: '' })) ?? '',
    startProblem('rest', typed({ restSeconds: '' })) ?? '',
    ...cueTranscript(done.cues),
    ...cueTranscript([openingCue('work', PLANK_NAME, 45), openingCue('rest', PLANK_NAME, 30),
      targetCue(12)]),
  ].join(' \n ');
}

/**
 * ONE WHOLE TIMED EXERCISE, START TO FINISH, THROUGH WHATEVER PORT IS HANDED IN.
 *
 * The driver both halves of the audio proof run through. It returns the VISIBLE transcript and nothing
 * about the sound, so a test comparing two runs is comparing what the coach reads.
 */
function runAnExercise(port: AudioPort, seconds = 5): {
  readonly seen: readonly string[]; readonly cues: readonly Cue[];
} {
  const cues: Cue[] = [];
  const opening = openingCue('work', PLANK_NAME, seconds);
  soundCue(port, opening);
  cues.push(opening);

  let state = startPhase(noTimers(), TIRED, PLANK, 'timed', 'work', typed({
    seconds: String(seconds),
  }), T0);

  // A quarter of a second at a time, which is what the drawing's interval does.
  for (let at = T0 + 250; at <= T0 + seconds * 1000 + 1000; at += 250) {
    const run = state.run;
    if (run === null) break;
    const stepped = advance(run, PLANK_NAME, at);
    for (const cue of stepped.cues) {
      soundCue(port, cue);
      cues.push(cue);
    }
    state = { ...state, run: stepped.run };
  }

  return { seen: cueTranscript(cues), cues };
}

// ═══════════════════════════════════════════════════════════════════════════════

describe('a plank is held and a squat is counted, and the routine already says which', () => {
  it('reads the way a line is measured off what the routine asked for', () => {
    assert.equal(workKindOf(HELD), 'timed');
    assert.equal(workKindOf(COUNTED), 'counted');
  });

  it('is the same two ways the core measures an exercise, and not a third', () => {
    // THE VOCABULARY IS THE CORE'S. If it ever grows a third measurement, this disagreement is the
    // alarm rather than a line that silently opens on the wrong half of the panel.
    assert.deepEqual([...MEASUREMENTS].sort(), ['repetitions', 'time']);
  });

  it('does not guess when the routine asked for nothing in particular', () => {
    // A count starts from nought and needs no number from anybody. A countdown with nothing to count
    // down from is not a state a coach can be shown.
    assert.equal(workKindOf(null), 'counted');
    assert.deepEqual(overrideFrom(null), { seconds: '', repetitions: '', restSeconds: '' });
  });

  it('fills the boxes from the routine, as a default he can see and decline', () => {
    assert.deepEqual(overrideFrom(HELD), { seconds: '45', repetitions: '', restSeconds: '30' });
    assert.deepEqual(overrideFrom(COUNTED), { seconds: '', repetitions: '12', restSeconds: '60' });
  });

  it('offers BOTH halves whatever the routine said, because the routine is a default', () => {
    // A coach may count a hold or time a set of squats on the day. Both controls are startable on a
    // line the routine measured the other way, provided he says the number.
    assert.equal(startProblem('work', overrideFrom(COUNTED)) === null, false,
      'a counted line has no duration, so the timer must ask for one rather than run zero seconds');
    const said = editOverride(overrideFrom(COUNTED), 'seconds', '20');
    assert.equal(startProblem('work', said), null);
  });
});

describe('every number is overridable in the moment, and the bounds are the RECORD\'s', () => {
  /** One performed record, as `modular-control.test.ts` builds one, with one field swapped. */
  function aFactWith(field: string, value: number): Record<string, unknown> {
    return {
      session_id: '33333333-3333-4333-8333-333333333333',
      client_id: '11111111-1111-4111-8111-111111111111',
      exercise_id: PLANK,
      position: 0,
      status: 'performed',
      recorded_at: '2026-07-26T09:00:00.000Z',
      [field]: value,
    };
  }

  it('agrees with the record at every ceiling, and one past it', () => {
    for (const [field, ceiling] of Object.entries(RUNNING_BOUNDS)) {
      assert.equal(
        validatePerformedRecord(aFactWith(field, ceiling)).ok,
        true,
        `the record refuses ${field} at ${ceiling}, which this module accepts — the mirror has drifted`,
      );
      assert.equal(
        validatePerformedRecord(aFactWith(field, ceiling + 1)).ok,
        false,
        `the record accepts ${field} past ${ceiling}, so this module is refusing a value he could `
          + 'legitimately run and then record',
      );
    }
  });

  it('mirrors the RECORD and not the library, because those two bounds differ on purpose', () => {
    // The library refuses a four-second hold as a published prescription (`duration_seconds` is
    // 5-1800 there); the record permits it (0-7200). A coach shortening a hold for a tired client in
    // the moment is doing something the record allows and the library does not, and this surface RUNS
    // rather than publishes. Driven through the real validator, not described.
    assert.equal(validatePerformedRecord(aFactWith('duration_seconds', 4)).ok, true);
    assert.equal(overrideProblem('seconds', '4'), null,
      'a four-second hold is refused here, so the mirror has been taken from the library instead of '
      + 'from the record that will carry it');
  });

  it('states its ONE difference from the record rather than letting it look like drift', () => {
    // The record accepts a performed duration of nought — a set he began and did not hold is a fact.
    assert.equal(validatePerformedRecord(aFactWith('duration_seconds', 0)).ok, true);
    // A countdown from nought is finished before it starts. That is this file's own floor and it is
    // deliberate; the sentence says so to the coach.
    assert.match(String(overrideProblem('seconds', '0')), /at least one second/u);
    assert.match(String(overrideProblem('repetitions', '0')), /at least one repetition/u);
    // Rest of NOUGHT is a real answer — straight on to the next thing.
    assert.equal(overrideProblem('restSeconds', '0'), null);
  });

  it('refuses what is not a whole number, with a sentence he can act on', () => {
    for (const field of OVERRIDE_FIELDS) {
      assert.notEqual(overrideProblem(field, 'thirty'), null);
      assert.notEqual(overrideProblem(field, '30.5'), null);
      assert.notEqual(overrideProblem(field, '-4'), null);
    }
  });

  it('does not treat a box he has not typed into as a mistake he has made', () => {
    for (const field of OVERRIDE_FIELDS) {
      assert.equal(overrideProblem(field, ''), null, `an empty ${field} box reads as an error`);
      assert.equal(overrideProblem(field, '   '), null);
      assert.equal(runnableValue(field, ''), null, 'an empty box must not run as a number');
    }
  });

  it('keeps an override per client, so shortening one person\'s hold leaves the other\'s alone', () => {
    let state = noTimers();
    state = changeOverride(state, TIRED, PLANK, HELD, 'seconds', '20');

    assert.equal(overrideOf(state, TIRED, PLANK, HELD).seconds, '20');
    assert.equal(overrideOf(state, OTHER, PLANK, HELD).seconds, '45',
      'one client\'s shortened hold reached another client\'s line');
    assert.notEqual(lineKey(TIRED, PLANK), lineKey(OTHER, PLANK));
  });

  it('does not carry an override from one exercise onto another', () => {
    const state = changeOverride(noTimers(), TIRED, PLANK, HELD, 'seconds', '20');
    assert.equal(overrideOf(state, TIRED, SQUAT, COUNTED).seconds, '');
  });
});

describe('the clock, driven with no clock', () => {
  it('counts down in whole seconds, rounded UP so the last second is on screen', () => {
    const state = startPhase(noTimers(), TIRED, PLANK, 'timed', 'work', typed({ seconds: '30' }), T0);
    const run = state.run as never;

    assert.equal(remainingSeconds(run, T0), 30, 'the whole is not on screen the moment he presses');
    assert.equal(remainingSeconds(run, T0 + 1), 30, 'a millisecond in and it already says 29');
    assert.equal(remainingSeconds(run, T0 + 999), 30);
    assert.equal(remainingSeconds(run, T0 + 1000), 29);
    assert.equal(remainingSeconds(run, T0 + 29_001), 1, 'the final second shows 0 while he holds it');
    assert.equal(remainingSeconds(run, T0 + 30_000), 0);
    assert.equal(remainingSeconds(run, T0 + 999_999), 0, 'it counted past nought');
  });

  it('reads as a shape past a minute and as a bare number under one', () => {
    assert.equal(clockWords(0), '0');
    assert.equal(clockWords(9), '9');
    assert.equal(clockWords(59), '59');
    assert.equal(clockWords(60), '1:00');
    assert.equal(clockWords(105), '1:45');
    assert.equal(clockWords(600), '10:00');
  });

  it('holds where it was and carries on from there, rather than starting again', () => {
    let state = startPhase(noTimers(), TIRED, PLANK, 'timed', 'work', typed({ seconds: '30' }), T0);
    state = pauseRun(state, T0 + 10_000);

    assert.equal((state.run as never as { startedAt: number | null }).startedAt, null);
    assert.equal(remainingSeconds(state.run as never, T0 + 10_000), 20);
    // A WHOLE MINUTE OF PHONE CALL, and the clock has not moved.
    assert.equal(remainingSeconds(state.run as never, T0 + 70_000), 20,
      'a held timer went on counting while he was on the phone');

    state = resumeRun(state, T0 + 70_000);
    assert.equal(remainingSeconds(state.run as never, T0 + 70_000), 20);
    assert.equal(remainingSeconds(state.run as never, T0 + 75_000), 15,
      'resuming did not carry the ten seconds already held');
    assert.equal(spentMs(state.run as never, T0 + 75_000), 15_000);
  });

  it('runs out, and a run that is out does not restart on the next tick', () => {
    let state = startPhase(noTimers(), TIRED, PLANK, 'timed', 'work', typed({ seconds: '2' }), T0);
    const first = advance(state.run as never, PLANK_NAME, T0 + 2000);
    assert.equal(first.run.finished, true);
    assert.equal(runIsOut(first.run, T0 + 2000), true);

    const again = advance(first.run, PLANK_NAME, T0 + 2500);
    assert.deepEqual(again.cues, [], 'a finished run cued something on a later tick');
    assert.equal(again.run, first.run, 'a finished run was replaced on a later tick');
    state = { ...state, run: first.run };
    assert.equal(remainingSeconds(state.run as never, T0 + 9999), 0);
  });

  it('refuses to start a phase it cannot run, and says what to do about it', () => {
    const nothing = typed({ seconds: '' });
    assert.match(String(startProblem('work', nothing)), /how many seconds/u);
    const state = startPhase(noTimers(), TIRED, PLANK, 'timed', 'work', nothing, T0);
    assert.equal(state.run, null, 'a timer with nothing to count down from was started anyway');
  });

  it('is ONE clock: starting another line replaces the run rather than leaving two counting', () => {
    let state = startPhase(noTimers(), TIRED, PLANK, 'timed', 'work', typed(), T0);
    state = startPhase(state, OTHER, SQUAT, 'timed', 'work', typed(), T0 + 500);

    assert.equal(runLine(state.run, OTHER, SQUAT), true);
    assert.equal(runLine(state.run, TIRED, PLANK), false,
      'two timers are counting and he can only see one of them');
  });

  it('has words for the clock from the moment the panel opens, including for no timer at all', () => {
    // A line that APPEARS when a timer starts makes the panel taller under his thumb. Measured at
    // 390px by the sibling readings action on this build; the reserve is `status-held`.
    assert.equal(clockLine(null, T0).length > 0, true);
    const going = startPhase(noTimers(), TIRED, PLANK, 'timed', 'work', typed({ seconds: '30' }), T0);
    assert.match(clockLine(going.run, T0 + 5000), /25/u);
    assert.match(clockLine(pauseRun(going, T0 + 5000).run, T0 + 5000), /Held at 25/u);
    assert.equal(clockLine(advance(going.run as never, PLANK_NAME, T0 + 30_000).run, T0 + 30_000),
      WORK_ENDED_WORDS);
  });

  it('puts the timer away without claiming anything about what he did', () => {
    // This surface records nothing at all, so abandoning a run is only the loss of a display. What he
    // actually performed is written down by the controls on the line, by him, deliberately.
    let state = startPhase(noTimers(), TIRED, PLANK, 'timed', 'work', typed({ seconds: '30' }), T0);
    state = countBy(state, TIRED, PLANK, 3);
    state = clearRun(state);

    assert.equal(state.run, null);
    assert.equal(tallyOf(state, TIRED, PLANK), 3,
      'putting the clock away threw away the count he had tapped');
  });

  it('does not stop the clock when he puts the panel away', () => {
    // He wants the whole routine on screen while a plank runs. A timer that died because he collapsed
    // a panel is a timer he will not trust twice.
    let state = startPhase(noTimers(), TIRED, PLANK, 'timed', 'work', typed({ seconds: '30' }), T0);
    state = openPanel(state, TIRED, PLANK);
    assert.equal(panelIsOpen(state, TIRED, PLANK), true);
    state = openPanel(state, TIRED, PLANK);
    assert.equal(panelIsOpen(state, TIRED, PLANK), false);
    assert.notEqual(state.run, null, 'putting the panel away stopped the clock');
    assert.equal(remainingSeconds(state.run as never, T0 + 5000), 25);
  });
});

describe('the cues fall due once each, and nothing advances by itself', () => {
  it('beeps the last three seconds and chimes at the end, in that order', () => {
    const { cues } = runAnExercise(silentAudio(), 5);
    const kinds = cues.map((cue) => cue.kind);

    assert.deepEqual(kinds, ['named', 'countdown', 'countdown', 'countdown', 'work-ended']);
    assert.equal(COUNTDOWN_FROM, 3);
    assert.deepEqual(cueTranscript(cues).slice(1, 4),
      [countdownWords(3), countdownWords(2), countdownWords(1)]);
  });

  it('sounds nothing twice when the same moment is read again, which a repaint does', () => {
    let run = (startPhase(noTimers(), TIRED, PLANK, 'timed', 'work', typed({ seconds: '5' }), T0)
      .run) as never as Parameters<typeof advance>[0];

    const first = advance(run, PLANK_NAME, T0 + 2000);
    assert.equal(first.cues.length, 1, 'the third-second beep did not fall due');
    run = first.run;
    // THE SAME MOMENT, AGAIN — three times, as a React screen would.
    for (let repaint = 0; repaint < 3; repaint += 1) {
      const again = advance(run, PLANK_NAME, T0 + 2000);
      assert.deepEqual(again.cues, [], 'a repaint at the same moment sounded the beep again');
      run = again.run;
    }
  });

  it('says the hold is over rather than beeping its way down after a phone slept through it', () => {
    const run = (startPhase(noTimers(), TIRED, PLANK, 'timed', 'work', typed({ seconds: '30' }), T0)
      .run) as never as Parameters<typeof advance>[0];
    // One tick, thirty seconds later: the screen was off for the whole hold.
    const woke = advance(run, PLANK_NAME, T0 + 30_000);
    assert.deepEqual(woke.cues.map((cue) => cue.kind), ['work-ended'],
      'three beeps arrived at once about a moment that had already passed');
  });

  it('names WHICH hold ended, because one routine may be running for three people', () => {
    const { cues } = runAnExercise(silentAudio(), 5);
    const ended = cues[cues.length - 1];
    assert.equal(ended.kind, 'work-ended');
    assert.match(ended.seen, new RegExp(PLANK_NAME, 'u'));
  });

  it('ends a rest as a rest and not as a hold', () => {
    const state = startPhase(noTimers(), TIRED, PLANK, 'timed', 'rest', typed({ restSeconds: '3' }), T0);
    const done = advance(state.run as never, PLANK_NAME, T0 + 3000);
    assert.deepEqual(done.cues.map((cue) => cue.kind), ['rest-ended']);
    assert.equal(done.cues[0].seen, REST_ENDED_WORDS);
  });

  it('does not start the rest when the hold ends, or anything when the rest ends', () => {
    // The application supports and the coach decides. A surface that walked itself from one exercise
    // to the next would be the linear guided player SESSION.md §2 exists to refuse.
    let state = startPhase(noTimers(), TIRED, PLANK, 'timed', 'work', typed({ seconds: '2' }), T0);
    const done = advance(state.run as never, PLANK_NAME, T0 + 2000);
    state = { ...state, run: done.run };

    assert.equal(state.run?.phase, 'work', 'the timer started the rest by itself');
    assert.equal(state.run?.finished, true);
    for (const cue of done.cues) {
      assert.equal(/rest/iu.test(cue.seen) && cue.kind !== 'rest-ended', false,
        `the end of a hold says "${cue.seen}", which points at what to do next`);
    }
  });

  it('says the exercise\'s NAME when a hold begins, and nothing about what follows it', () => {
    const cue = openingCue('work', PLANK_NAME, 45);
    assert.equal(cue.heard.words, PLANK_NAME);
    assert.equal(cue.heard.words, namedWords(PLANK_NAME));
    assert.match(cue.seen, /Plank hold, 45 seconds\./u);
    assert.equal(/next|then|after|coming/iu.test(cue.seen), false);
  });
});

describe('THE COUNT, TAPPED OUT LOUD', () => {
  it('goes up, and down, because a miscount is ordinary', () => {
    let state = noTimers();
    assert.equal(tallyOf(state, TIRED, SQUAT), 0, 'nought is a state, not an absence of one');
    for (let tap = 0; tap < 5; tap += 1) state = countBy(state, TIRED, SQUAT, 1);
    assert.equal(tallyOf(state, TIRED, SQUAT), 5);
    state = countBy(state, TIRED, SQUAT, -1);
    assert.equal(tallyOf(state, TIRED, SQUAT), 4);
  });

  it('stops at nought rather than going negative, and at the record\'s own ceiling', () => {
    let state = countBy(noTimers(), TIRED, SQUAT, -1);
    assert.equal(tallyOf(state, TIRED, SQUAT), 0);
    state = countBy(noTimers(), TIRED, SQUAT, RUNNING_BOUNDS.repetitions + 50);
    assert.equal(tallyOf(state, TIRED, SQUAT), RUNNING_BOUNDS.repetitions);
  });

  it('is per client, so counting for one person does not count for the other', () => {
    const state = countBy(countBy(noTimers(), TIRED, SQUAT, 1), TIRED, SQUAT, 1);
    assert.equal(tallyOf(state, TIRED, SQUAT), 2);
    assert.equal(tallyOf(state, OTHER, SQUAT), 0);
  });

  it('bounds one tap in ONE place, which the drawing reads rather than keeping a second rule', () => {
    // The drawing has to know what a tap makes the tally WITHOUT going through the state, because the
    // chime for reaching the count compares before with after and twenty quick taps all render once.
    // Two bounding rules would drift; this is the one, and `countBy` is asserted to use it.
    assert.equal(tallyAfter(0, 1), 1);
    assert.equal(tallyAfter(0, -1), 0);
    assert.equal(tallyAfter(RUNNING_BOUNDS.repetitions, 1), RUNNING_BOUNDS.repetitions);

    let state = noTimers();
    for (let tap = 0; tap < 3; tap += 1) state = countBy(state, TIRED, SQUAT, 1);
    assert.equal(tallyOf(state, TIRED, SQUAT), tallyAfter(tallyAfter(tallyAfter(0, 1), 1), 1),
      'countBy and tallyAfter disagree, so the drawing and the state bound a tap differently');
  });

  it('goes back to nought for the next set', () => {
    let state = countBy(noTimers(), TIRED, SQUAT, 9);
    state = clearTally(state, TIRED, SQUAT);
    assert.equal(tallyOf(state, TIRED, SQUAT), 0);
  });

  it('knows when the count is reached, and says so without saying what to do next', () => {
    assert.equal(tallyReached(11, 12), false);
    assert.equal(tallyReached(12, 12), true);
    assert.equal(tallyReached(13, 12), true);
    assert.equal(tallyReached(99, null), false, 'a line counting to nothing cannot be reached');

    assert.match(tallyWords(0, 12), /0 counted of 12/u);
    assert.match(tallyWords(12, 12), /That is the count/u);
    assert.match(tallyWords(4, null), /4 counted\./u);
  });

  it('chimes for the count with a visible half of its own', () => {
    const cue = targetCue(12);
    assert.equal(cue.heard.tone, 'ended');
    assert.equal(cue.seen, targetReachedWords(12));
    assert.equal(cue.seen.length > 0, true);
  });
});

describe('AUDIO IS NEVER THE ONLY SIGNAL, and this is the proof rather than the claim', () => {
  it('gives every cue this module can produce BOTH halves, neither optional', () => {
    const every: Cue[] = [
      openingCue('work', PLANK_NAME, 45),
      openingCue('rest', PLANK_NAME, 30),
      targetCue(12),
      ...runAnExercise(silentAudio(), 5).cues,
      ...advance(
        startPhase(noTimers(), TIRED, PLANK, 'timed', 'rest', typed({ restSeconds: '2' }), T0)
          .run as never,
        PLANK_NAME, T0 + 2000,
      ).cues,
    ];

    // EVERY KIND THE TYPE ALLOWS IS COVERED, so this is not five of six.
    assert.deepEqual([...new Set(every.map((cue) => cue.kind))].sort(),
      ['countdown', 'named', 'rest-ended', 'target-reached', 'work-ended']);

    for (const cue of every) {
      assert.equal(cue.seen.trim().length > 0, true,
        `the ${cue.kind} cue has no visible half, so a muted phone loses it`);
      assert.equal(cue.heard.tone !== null || cue.heard.words !== null, true,
        `the ${cue.kind} cue asks the device for nothing at all`);
    }
  });

  it('runs the whole exercise with the audio path DISABLED, and the disabling really applied', () => {
    const disabled = recordingAudio(silentAudio());
    const silent = runAnExercise(disabled, 5);

    // THE DISABLING CONFIRMED TO HAVE APPLIED. A guard never exercised and a guard that held are the
    // same green, so both halves are stated: the port was genuinely asked, and it genuinely refused.
    assert.equal(disabled.asked.length > 0, true,
      'the audio path was never reached, so nothing about disabling it has been proved');
    assert.deepEqual(disabled.did, [],
      'the "disabled" port made a sound, so this run proves the opposite of what it is for');
    assert.equal(disabled.asked.length, silent.cues.length,
      'a cue was drawn that never travelled to the mechanism, or the reverse');

    // AND THE SESSION IS STILL FULLY LEGIBLE: every cue's words are there, in order.
    assert.deepEqual(silent.seen, [
      startedWords(PLANK_NAME, 5), countdownWords(3), countdownWords(2), countdownWords(1),
      `${WORK_ENDED_WORDS} ${PLANK_NAME}.`,
    ]);
  });

  it('reads IDENTICALLY on a device that works and one that refuses', () => {
    const working = recordingAudio(alwaysWorks());
    const refusing = recordingAudio(silentAudio());

    const heard = runAnExercise(working, 5);
    const unheard = runAnExercise(refusing, 5);

    // THE KNOWN POSITIVE FOR THE COMPARISON: the two runs really did differ in the audible channel.
    // Without this, two identical transcripts could mean the ports were the same port.
    assert.equal(working.did.length > 0, true, 'the working device made no sound, so this comparison '
      + 'is between two silent runs and says nothing');
    assert.deepEqual(refusing.did, []);
    assert.notDeepEqual(working.did, refusing.did);

    // AND THE VISIBLE CHANNEL IS THE SAME, cue for cue.
    assert.deepEqual(unheard.seen, heard.seen,
      'the coach on the muted phone reads a different session from the coach who can hear it');
  });

  it('loses nothing for a coach who never taps the offer at all', () => {
    // NEVER UNLOCKED: no unlock call, no sound, and the whole transcript intact.
    const never = recordingAudio(silentAudio());
    const run = runAnExercise(never, 5);

    assert.equal(never.asked.includes('unlock'), false, 'something unlocked audio without a tap');
    assert.deepEqual(never.did, []);
    assert.equal(run.seen.length, 5);
    for (const words of run.seen) assert.equal(words.trim().length > 0, true);
  });
});

describe('the absences, each pointed at a known positive', () => {
  /**
   * The module's own CODE LINES, with prose stripped. The house style documents a prohibition in a
   * comment beside the code it constrains, so a sweep over whole source text matches the very
   * sentences explaining why the forbidden thing is forbidden.
   */
  async function codeOf(file: string): Promise<string> {
    const text = await readFile(path.join(here, file), 'utf8');
    return text
      .split('\n')
      .filter((line) => {
        const trimmed = line.trimStart();
        return !trimmed.startsWith('*') && !trimmed.startsWith('//') && !trimmed.startsWith('/*');
      })
      .join('\n')
      .toLowerCase();
  }

  const MINE = ['exercise-timer.ts', 'session-audio.ts', 'SessionTimer.tsx'];

  /** `SESSION.md` §2: where the session has got to is derived, never persisted and never sent. */
  it('says nothing about where the session has got to', () => {
    const words = everyWordHeReads().toLowerCase();

    for (const forbidden of ['current exercise', 'next exercise', 'step index', 'cursor', 'up next',
      'coming up', 'you are on', 'move on to', 'carry on with', 'exercise 3 of', 'progress through']) {
      assert.ok(
        !words.includes(forbidden),
        `the coach is told "${forbidden}", which is a position in a script. SESSION.md §2: a session `
          + 'is a record of what OCCURRED and the application never dictates what happens after.',
      );
    }
    // The scan pointed at a known positive, so its silence above means something.
    assert.ok('a cursor and up next'.includes('cursor'));
    assert.ok('a cursor and up next'.includes('up next'));
  });

  it('names no cursor in its own code', async () => {
    for (const file of MINE) {
      // eslint-disable-next-line no-await-in-loop
      const code = await codeOf(file);
      for (const forbidden of ['currentexercise', 'nextexercise', 'stepindex', 'cursor',
        'session-next-exercise', 'session-previous-exercise']) {
        assert.ok(!code.includes(forbidden), `${file} names ${forbidden} in its code. The glyph family `
          + 'holds a next and a previous, which are a cursor with a picture on it');
      }
      // The same scan, pointed at something every one of these files genuinely has.
      assert.ok(code.includes('timer') || code.includes('tone'),
        `the scan read no code at all out of ${file}`);
    }
  });

  /**
   * NO TIMER STATE IS PERSISTED, and this is the scan that would be worthless on its own.
   *
   * A running clock is the screen's own transient state, so nothing in these three files may reach a
   * writer at all. An absence sweep for store verbs over a file that has none proves nothing about the
   * sweep — so the SAME sweep is run over a sibling that genuinely writes, and is required to find
   * them there. That turns "this module persists nothing" into a comparison.
   */
  it('reaches no writer, and the sweep that says so finds one in the sibling that does', async () => {
    const WRITERS = ['appendperformed', 'appendreading', 'appendnote', 'recordperformed',
      'recordreading', 'recordnote', 'localstorage', 'sessionstorage', 'indexeddb', 'put(', 'begintx'];

    for (const file of MINE) {
      // eslint-disable-next-line no-await-in-loop
      const code = await codeOf(file);
      for (const verb of WRITERS) {
        assert.ok(!code.includes(verb),
          `${file} names ${verb}: a timer that writes is a second source of truth about where the `
            + 'session is, which SESSION.md §2 exists to prevent');
      }
      assert.ok(!code.includes('localstore'),
        `${file} takes a store. This surface records nothing at all`);
    }

    // THE SAME SWEEP, POINTED AT A FILE THAT GENUINELY WRITES. Without this the loop above passes on
    // an empty string, a renamed file or a typo in every verb.
    const writer = await codeOf('session-readings-source.ts');
    assert.ok(WRITERS.some((verb) => writer.includes(verb)),
      'the sweep found no writer in the sibling that writes, so it proves nothing about the files '
        + 'above — the verbs have been renamed under it');
    assert.ok(writer.includes('localstore'), 'the store scan found no store in the writing sibling');
  });

  it('holds no field that names a position, on the state or on a run', () => {
    const state: TimerState = startPhase(
      openPanel(noTimers(), TIRED, PLANK), TIRED, PLANK, 'timed', 'work', typed(), T0,
    );
    const keys = [...Object.keys(state), ...Object.keys(state.run ?? {})].map((k) => k.toLowerCase());

    for (const forbidden of ['cursor', 'current', 'next', 'stepindex', 'position', 'index']) {
      assert.ok(!keys.includes(forbidden), `the timer holds a field called ${forbidden}`);
    }
    // The same reading, pointed at the keys it genuinely has.
    assert.ok(keys.includes('run') && keys.includes('overrides') && keys.includes('phase'),
      'the reading found no keys at all, so its silence above means nothing');
  });

  it('carries no emoji in anything it says', () => {
    const words = everyWordHeReads();
    // Iconography is `src/design/Glyph.tsx` and the generated family. An emoji renders differently on
    // every platform and is read aloud by a screen reader as whatever its vendor called it.
    const emoji = /\p{Extended_Pictographic}/u;
    assert.doesNotMatch(words, emoji);
    // The same reading, pointed at a string that genuinely has one.
    assert.match('time is up ⏰', emoji, 'this reading cannot see an emoji at all');
  });

  it('suggests nothing, on the screen where a timer would make it feel helpful', () => {
    const words = everyWordHeReads().toLowerCase();
    for (const forbidden of ['suggest', 'recommend', 'progression', 'you should', 'ought to',
      'try for', 'aim for', 'heavier', 'longer than last', 'next time', 'improve on']) {
      assert.ok(!words.includes(forbidden), `the coach is told "${forbidden}"`);
    }
    assert.ok('we suggest you aim for heavier next time'.includes('suggest'));
    assert.ok('we suggest you aim for heavier next time'.includes('aim for'));
  });

  it('does not scroll, focus or move the page under his thumb', async () => {
    const drawing = await codeOf('SessionTimer.tsx');
    for (const forbidden of ['scrollintoview', 'scrollto', 'window.scroll', 'autofocus', '.focus()']) {
      assert.ok(!drawing.includes(forbidden),
        `the drawing uses ${forbidden}. He is mid-hold with his thumb over the control that pauses it`);
    }
    // The same scan, pointed at things this drawing genuinely has.
    assert.ok(drawing.includes('onclick'), 'the scan found no handler at all in the drawing');
    assert.ok(drawing.includes('status-held'), 'the cue line does not reserve its height, so words '
      + 'changing on it make the panel taller while he is reading the routine below');
  });

  /**
   * EVERY DISABLED CONTROL SAYS WHY, and this guard exists because the drawing shipped one that did not.
   *
   * Seen in the browser on the routine's own dead hang, which names a duration and no rest: "Start the
   * rest" was off with nothing beside it. A disabled button with no sentence is a button he presses
   * twice and then distrusts, and no pure test of the module could see it — the sentence existed, the
   * drawing simply never rendered it.
   */
  it('draws the sentence for every refusal it disables a control on', async () => {
    const drawing = await readFile(path.join(here, 'SessionTimer.tsx'), 'utf8');
    const gates = [...drawing.matchAll(/disabled=\{(\w+) !== null\}/gu)].map((hit) => hit[1]);

    assert.equal(gates.length > 0, true, 'the reading found no disabled control at all');
    for (const refusal of gates) {
      assert.ok(
        drawing.includes(`{${refusal} !== null && <p className="field-hint">{${refusal}}</p>}`),
        `"${refusal}" turns a control off and its sentence is never drawn, so the coach is left with a `
          + 'button that does nothing and no way to find out why',
      );
    }
    // The same reading, pointed at both refusals it must have found — a regex that matched one of them
    // would satisfy the loop above while the other went unchecked.
    assert.deepEqual([...gates].sort(), ['restRefusal', 'workRefusal']);
  });

  it('binds no colour of its own, and shows the big number in the foundation\'s own class', async () => {
    const drawing = await readFile(path.join(here, 'SessionTimer.tsx'), 'utf8');
    // TOKEN ROLES, never a value. A hex literal here is a colour nobody is measuring: the contrast
    // harness measures `design/tokens`, and a screen that paints its own is outside it.
    assert.doesNotMatch(drawing, /#[0-9a-fA-F]{3,8}\b/u);
    assert.doesNotMatch(drawing, /\brgba?\(/u);
    // The same readings, pointed at strings that genuinely carry each shape.
    assert.match('color: #ff0000', /#[0-9a-fA-F]{3,8}\b/u);
    assert.match('color: rgb(1,2,3)', /\brgba?\(/u);
    // The number the screen exists to show wears the foundation's class for exactly that.
    assert.match(drawing, /className="value-display tabular"/u);
  });
});

// ── a device that works, for the comparison above ───────────────────────────────────────────────

/** A port that does everything asked of it. The other half of the identical-transcript comparison. */
function alwaysWorks(): AudioPort {
  return {
    async unlock() {
      return { tones: true, speech: true };
    },
    tone() {
      return true;
    },
    speak() {
      return true;
    },
  };
}
