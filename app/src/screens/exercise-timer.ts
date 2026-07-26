/**
 * THE EXERCISE TIMER AND ITS COUNT — the judgement behind every word, every number and every cue,
 * decided here so the suite can assert it with no rendering and no browser at all.
 *
 * The split every screen in this application follows: `screens/removals.ts` sits beside
 * `screens/RemovalsScreen.tsx`, and the suite drives the module. The drawing is
 * `screens/SessionTimer.tsx`; the audio mechanism is `screens/session-audio.ts`, injected. This file
 * mounts BESIDE `modular-control.ts` and `session-readings.ts` on the runner spine and rebuilds none
 * of it — the six moves, the readings, the route, the screen shell and the lease are all somebody
 * else's, finished.
 *
 * ## A PLANK IS HELD AND A SQUAT IS COUNTED, AND THE ROUTINE ALREADY SAYS WHICH
 *
 * `core/model/entities/exercise.js` pins it: an exercise's `measurement` is `repetitions` or `time`,
 * and `checkPrescription` refuses a prescription that disagrees with it — exactly one of
 * `repetitions` and `duration_seconds` is present on a line. So this file does not classify
 * exercises. It reads which of the two the line carries and opens on that, and it offers BOTH
 * anyway, because a default he can see is a default he can decline and the coach may want to count a
 * hold or time a set of squats on the day. {@link workKindOf} is that reading and nothing more.
 *
 * ## EVERY NUMBER IS OVERRIDABLE IN THE MOMENT, AND OVERRIDING RUNS IT RATHER THAN RECORDING IT
 *
 * A stated requirement, and the line between this action and its sibling is exact: RUNNING a value is
 * this file's, RECORDING one is `modular-control.ts`'s. An override here changes what the clock counts
 * down from and what the tally is measured against, in this window, for this run. It is passed to
 * nothing and stored nowhere, so a client who turns up tired gets a shorter hold without the routine
 * in his library being edited and without a fact being written that he did not perform.
 *
 * ## THE TIMER IS THIS SCREEN'S OWN TRANSIENT STATE AND IT NEVER BECOMES A RECORD OF WHERE HE IS
 *
 * `core/session/SESSION.md` §2 is explicit, and it is the rule a screen breaks with no test noticing:
 * anything describing where a session has got to is DERIVED, never persisted — no stored cursor, no
 * current exercise, no step index, not on the record and not in a view. A running clock is the same
 * kind of thing as which panel he has open, and §10 hands it over in as many words: if a screen needs
 * to remember where the coach was looking, that is the screen's own transient state. So
 * {@link TimerState} lives in the runner's memory, is passed to no writer, and dies with the window.
 * The suite asserts that absence on this module's output and on its own code lines, each scan pointed
 * at a known positive first.
 *
 * ONE CLOCK, because there is one coach with one stopwatch. Starting a run on another line replaces
 * the one that was going rather than leaving two counting in the background — two clocks would be two
 * answers to what is being timed, which is the §2 hazard wearing a stopwatch.
 *
 * ## NOTHING ADVANCES BY ITSELF
 *
 * A finished timer does not start the rest, and a finished rest does not start anything. The standing
 * principle is that the application supports and the coach decides; a surface that walked itself from
 * one exercise to the next would be the linear guided player §2 exists to refuse. What a finished
 * phase does is SAY it finished — in a chime, and in words that stand without it.
 *
 * ## EVERY CUE HAS A VISIBLE COUNTERPART, AND THAT IS ENFORCED HERE RATHER THAN HOPED FOR
 *
 * The countdown, the end of a phase and the spoken name of the exercise are AUDIBLE. The coach may be
 * on a muted phone, in a noisy gym, on a device that refused to speak, or on a browser whose speech
 * synthesis has no voice installed — and a recorded decision names one more: on iPhone audio can be
 * suspended when the screen locks. In every one of those cases nothing may be lost. So a cue is not a
 * sound with a caption bolted on: {@link Cue} carries BOTH {@link Cue.heard} and {@link Cue.seen},
 * neither optional, and {@link cueTranscript} reads the visible half out on its own. The suite drives
 * a whole exercise through an audio port that refuses everything, confirms the port really was asked
 * and really did refuse, and requires the visible transcript to be identical to the one a working
 * port produces.
 */

import type { Prescription } from './modular-control';

// ═══════════════════════════════════════════════════════════════════════════════
// What the routine asked for, and which of the two ways it asked
// ═══════════════════════════════════════════════════════════════════════════════

/** Timed, or counted. The two things an exercise can be measured in, and the core owns the pair. */
export type WorkKind = 'timed' | 'counted';

/** A phase of a run: the work itself, or the rest after it. */
export type Phase = 'work' | 'rest';

/**
 * WHICH WAY THIS LINE IS MEASURED, read off what the routine asked for.
 *
 * `checkPrescription` in `core/model/entities/exercise.js` guarantees exactly one of the two is
 * present on a line that carries a prescription at all, so this reads a fact rather than guessing at
 * one. A line with NO prescription — a routine that asked for nothing in particular — falls back to
 * `counted`, because a count starts from nought and needs no number from anybody, whereas a countdown
 * with nothing to count down from is not a state a coach can be shown. Both are offered either way.
 */
export function workKindOf(prescription: Prescription | null): WorkKind {
  if (prescription === null) return 'counted';
  return prescription.duration_seconds !== null ? 'timed' : 'counted';
}

/**
 * HOW HIGH EACH RUNNING VALUE GOES, AND THESE NUMBERS ARE NOT THIS FILE'S TO CHOOSE.
 *
 * They MIRROR `core/model/entities/performed-record.js` — the record that will CARRY what he runs
 * once his sibling surface writes it down — and not `exercise.js`'s prescription bounds, which are
 * what a LIBRARY entry may ask for. Those two are different bounds on purpose: the library refuses a
 * four-second hold as a published prescription, and a coach shortening a hold for a tired client in
 * the moment is doing something the record permits and the library does not. Mirroring the library
 * here would refuse a value he is allowed to perform and then record.
 *
 * A MIRROR IS A SECOND SOURCE OF TRUTH AND IT DRIFTS, so the suite drives the REAL
 * `validatePerformedRecord` at each boundary and requires it to agree: accept the maximum, refuse one
 * past it. The same discipline `modular-control.ts` uses for the fields it writes.
 */
const RUNNING_MAX: Readonly<Record<string, number>> = Object.freeze({
  seconds: 7200,
  repetitions: 1000,
  restSeconds: 3600,
});

/**
 * The bounds, as the suite reads them to check them against the model.
 *
 * Keyed by the RECORD's own field name, so the agreement test holds no second mapping between this
 * file's names and the model's.
 */
export const RUNNING_BOUNDS: Readonly<Record<string, number>> = Object.freeze({
  duration_seconds: RUNNING_MAX.seconds,
  repetitions: RUNNING_MAX.repetitions,
  rest_seconds: RUNNING_MAX.restSeconds,
});

/**
 * THE ONE FLOOR THAT IS THIS FILE'S OWN, AND IT IS A DECISION RATHER THAN A DRIFT.
 *
 * The record accepts a performed duration of nought — a set he began and did not hold at all is a
 * fact. A COUNTDOWN from nought is not a thing that can be run: it is finished before it starts, and
 * offering it would put a timer on the screen that beeps and ends in the same instant. So a run needs
 * at least one second, and the suite states this difference rather than letting it look like the
 * mirror slipping.
 */
const LEAST_RUNNABLE_SECONDS = 1;

/** Rest of NOUGHT is a real answer — straight on to the next thing — so the floor there is nought. */
const LEAST_REST_SECONDS = 0;

/** A target of at least one repetition, for the same reason a countdown needs at least one second. */
const LEAST_REPETITIONS = 1;

// ═══════════════════════════════════════════════════════════════════════════════
// What he has changed for this run
// ═══════════════════════════════════════════════════════════════════════════════

/** One line's running values, exactly as he typed them. Strings, because a half-typed number is real. */
export interface Override {
  /** What the timer counts down from, in seconds. */
  readonly seconds: string;
  /** What the tally is measured against. */
  readonly repetitions: string;
  /** What the rest counts down from, in seconds. */
  readonly restSeconds: string;
}

/** Which of the three running values a keystroke is about. */
export type OverrideField = 'seconds' | 'repetitions' | 'restSeconds';

/** The three, in the order they are drawn. */
export const OVERRIDE_FIELDS: readonly OverrideField[] = Object.freeze(
  ['seconds', 'repetitions', 'restSeconds'] as OverrideField[],
);

/** What each running value is called, in the coach's words. */
export const OVERRIDE_LABELS: Readonly<Record<OverrideField, string>> = Object.freeze({
  seconds: 'Hold for, in seconds',
  repetitions: 'Count to',
  restSeconds: 'Rest for, in seconds',
});

/**
 * WHAT THE ROUTINE ASKED FOR, FILLED IN AND FULLY EDITABLE.
 *
 * A DEFAULT and not a script — the same standing the routine's declared ORDER has. A line the routine
 * said nothing about opens EMPTY rather than on a number this file invented: a prefilled thirty
 * seconds nobody asked for is the application deciding how long a client holds something.
 */
export function overrideFrom(prescription: Prescription | null): Override {
  if (prescription === null) return { seconds: '', repetitions: '', restSeconds: '' };
  return {
    seconds: asTyped(prescription.duration_seconds),
    repetitions: asTyped(prescription.repetitions),
    restSeconds: asTyped(prescription.rest_seconds),
  };
}

/** One keystroke. A whole override back, so the caller holds one value and never three. */
export function editOverride(held: Override, field: OverrideField, value: string): Override {
  return { ...held, [field]: value };
}

/**
 * WHAT IS WRONG WITH ONE RUNNING VALUE, in a sentence he can act on, or null when nothing is.
 *
 * Refused AT THE FIELD rather than at the press, because a stray keystroke on a phone — the one that
 * turns a 30-second hold into 300 — is a thing he needs to see before a client is holding it. An
 * EMPTY box is not a mistake he has made: it is a box he has not typed into, and it reads as one.
 */
export function overrideProblem(field: OverrideField, value: string): string | null {
  const typed = value.trim();
  if (typed.length === 0) return null;
  if (!/^\d+$/u.test(typed)) {
    return `${OVERRIDE_LABELS[field]} takes a whole number of ${field === 'repetitions'
      ? 'repetitions' : 'seconds'}.`;
  }
  const number = Number(typed);
  const most = RUNNING_MAX[field];
  const least = field === 'repetitions'
    ? LEAST_REPETITIONS
    : field === 'restSeconds' ? LEAST_REST_SECONDS : LEAST_RUNNABLE_SECONDS;
  if (number > most) {
    return `${OVERRIDE_LABELS[field]} goes up to ${most}. ${typed} looks like a slip.`;
  }
  if (number < least) {
    return field === 'repetitions'
      ? 'A count runs to at least one repetition.'
      : 'A timer runs for at least one second.';
  }
  return null;
}

/** The number a running value would run with, or null when there is not a usable one in the box. */
export function runnableValue(field: OverrideField, value: string): number | null {
  if (overrideProblem(field, value) !== null) return null;
  const typed = value.trim();
  if (typed.length === 0) return null;
  return Number(typed);
}

// ═══════════════════════════════════════════════════════════════════════════════
// A run, while it is going
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ONE PHASE OF ONE LINE, GOING — and every bit of it is an ordinary value the suite can build.
 *
 * THE CLOCK IS INJECTED AND NOTHING HERE READS ONE. Every moment arrives as a millisecond stamp from
 * the caller, so the suite drives three minutes of a run in three lines and no test waits for a
 * second to pass. That is the same reason `core/session/projection.js` holds no clock.
 *
 * `bankedMs` is what earlier stretches of THIS phase already spent, which is what makes pausing
 * arithmetic rather than a second timer: a pause banks the elapsed and forgets when it started, and
 * resuming starts a fresh stretch on top of the bank.
 */
export interface Run {
  readonly clientId: string;
  readonly exerciseId: string;
  readonly phase: Phase;
  readonly kind: WorkKind;
  /** What this phase counts down from, in whole seconds. Nought for a counted phase, which has none. */
  readonly seconds: number;
  /** When the stretch now running began, on the injected clock, or null while it is paused. */
  readonly startedAt: number | null;
  /** What earlier stretches of this same phase already spent. */
  readonly bankedMs: number;
  /** How far the cues have been read out to, so a repaint cannot sound the same beep twice. */
  readonly cuedToMs: number;
  /** True once this phase has run itself out. A finished phase does not restart on the next tick. */
  readonly finished: boolean;
}

/**
 * WHERE THE COACH IS IN THIS SURFACE, and it is the runner's own transient state.
 *
 * `SESSION.md` §2 and §10: this is not where the session has got to. It is which panel he has open,
 * what he has typed into it, what he has tallied and whether he has offered the browser a chance to
 * make a sound. It is passed to no writer and stored nowhere.
 */
export interface TimerState {
  /** Which line's panel is open, as {@link lineKey} spells it, or null with none open. */
  readonly open: string | null;
  /** The one clock. Null when nothing is going. */
  readonly run: Run | null;
  /** What he has changed for a line, keyed by {@link lineKey}. */
  readonly overrides: ReadonlyMap<string, Override>;
  /** What he has tallied on a counted line, keyed by {@link lineKey}. */
  readonly tallies: ReadonlyMap<string, number>;
}

/** Nothing open, nothing going, nothing typed. */
export function noTimers(): TimerState {
  return { open: null, run: null, overrides: new Map(), tallies: new Map() };
}

/**
 * WHICH LINE, as one key.
 *
 * Per client, ALWAYS — `SESSION.md` §6. The coach may be running one routine for three people and
 * timing the same hold differently for each; a key made of the exercise alone would carry one
 * person's shortened hold onto another's line.
 */
export function lineKey(clientId: string, exerciseId: string): string {
  return `${clientId} ${exerciseId}`;
}

/** True when this line's panel is the open one. */
export function panelIsOpen(state: TimerState, clientId: string, exerciseId: string): boolean {
  return state.open === lineKey(clientId, exerciseId);
}

/**
 * OPEN ONE LINE'S PANEL, or put it away.
 *
 * One panel at a time, at screen level rather than inside each row, for the reason
 * `modular-control.ts` and `session-readings.ts` both hold theirs there: what he typed survives
 * putting the panel away, and two open panels on a phone is two things competing for the width.
 *
 * PUTTING THE PANEL AWAY DOES NOT STOP THE CLOCK. He may want the whole screen while a plank runs,
 * and a timer that died because he collapsed the panel would be a timer he cannot trust. The run
 * shows on the row either way — see {@link runLine}.
 */
export function openPanel(state: TimerState, clientId: string, exerciseId: string): TimerState {
  const key = lineKey(clientId, exerciseId);
  return { ...state, open: state.open === key ? null : key };
}

/** What he has changed for one line, or the routine's own numbers where he has changed nothing. */
export function overrideOf(
  state: TimerState, clientId: string, exerciseId: string, prescription: Prescription | null,
): Override {
  return state.overrides.get(lineKey(clientId, exerciseId)) ?? overrideFrom(prescription);
}

/** One keystroke on one line's running values. */
export function changeOverride(
  state: TimerState,
  clientId: string,
  exerciseId: string,
  prescription: Prescription | null,
  field: OverrideField,
  value: string,
): TimerState {
  const key = lineKey(clientId, exerciseId);
  const held = state.overrides.get(key) ?? overrideFrom(prescription);
  const overrides = new Map(state.overrides);
  overrides.set(key, editOverride(held, field, value));
  return { ...state, overrides };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Starting, pausing and stopping
// ═══════════════════════════════════════════════════════════════════════════════

/** What a phase cannot be started from, worded, or null when it can. */
export function startProblem(phase: Phase, override: Override): string | null {
  const field: OverrideField = phase === 'rest' ? 'restSeconds' : 'seconds';
  const stated = overrideProblem(field, override[field]);
  if (stated !== null) return stated;
  const seconds = runnableValue(field, override[field]);
  if (seconds === null) {
    return phase === 'rest'
      ? 'Say how many seconds of rest, and the timer will run it.'
      : 'Say how many seconds to hold for, and the timer will run it.';
  }
  if (phase === 'work' && seconds < LEAST_RUNNABLE_SECONDS) {
    return 'A timer runs for at least one second.';
  }
  return null;
}

/**
 * START A PHASE, REPLACING WHATEVER WAS GOING.
 *
 * ONE CLOCK. Starting here abandons the run that was going rather than leaving it counting where he
 * cannot see it — see the header. Nothing is recorded by abandoning it: this surface writes nothing,
 * so a run that was replaced simply stops having a display.
 *
 * A phase that cannot be run is refused by returning the state UNCHANGED, and the refusal he reads is
 * {@link startProblem} beside the control. A start that silently produced a timer of nought would be
 * a beep and an ending in the same instant.
 */
export function startPhase(
  state: TimerState,
  clientId: string,
  exerciseId: string,
  kind: WorkKind,
  phase: Phase,
  override: Override,
  now: number,
): TimerState {
  if (startProblem(phase, override) !== null) return state;
  const field: OverrideField = phase === 'rest' ? 'restSeconds' : 'seconds';
  const seconds = runnableValue(field, override[field]) ?? 0;
  return {
    ...state,
    run: {
      clientId,
      exerciseId,
      phase,
      kind,
      seconds,
      startedAt: now,
      bankedMs: 0,
      cuedToMs: 0,
      finished: false,
    },
  };
}

/**
 * HOLD IT THERE, or let it go on.
 *
 * A real interruption mid-plank — a phone call, a client who needs a word — and the alternative is
 * starting again from the top, which loses the hold he was forty seconds into. Pausing banks what has
 * been spent; resuming opens a fresh stretch on top of the bank.
 */
export function pauseRun(state: TimerState, now: number): TimerState {
  const run = state.run;
  if (run === null || run.startedAt === null || run.finished) return state;
  return {
    ...state,
    run: { ...run, bankedMs: spentMs(run, now), startedAt: null },
  };
}

/** Let a paused run go on. */
export function resumeRun(state: TimerState, now: number): TimerState {
  const run = state.run;
  if (run === null || run.startedAt !== null || run.finished) return state;
  return { ...state, run: { ...run, startedAt: now } };
}

/** Put the clock away. Nothing is recorded and nothing is claimed about what he did. */
export function clearRun(state: TimerState): TimerState {
  return { ...state, run: null };
}

/** True when this line is the one with the clock on it. */
export function runLine(run: Run | null, clientId: string, exerciseId: string): boolean {
  return run !== null && run.clientId === clientId && run.exerciseId === exerciseId;
}

// ═══════════════════════════════════════════════════════════════════════════════
// The tally, for a line that is counted
// ═══════════════════════════════════════════════════════════════════════════════

/** What he has tallied on one line. Nought is a state and not an absence of one. */
export function tallyOf(state: TimerState, clientId: string, exerciseId: string): number {
  return state.tallies.get(lineKey(clientId, exerciseId)) ?? 0;
}

/**
 * ONE MORE, OR ONE FEWER.
 *
 * Counting out loud is what the requirement says the coach does, so the tally is a thing he taps
 * rather than a thing the application infers. It goes DOWN as well as up because a miscount is
 * ordinary and the alternative is starting the set again. It stops at nought rather than going
 * negative, and it stops at the record's own ceiling.
 */
export function countBy(
  state: TimerState, clientId: string, exerciseId: string, by: number,
): TimerState {
  const key = lineKey(clientId, exerciseId);
  const tallies = new Map(state.tallies);
  tallies.set(key, tallyAfter(state.tallies.get(key) ?? 0, by));
  return { ...state, tallies };
}

/**
 * WHAT ONE TAP MAKES THE TALLY, bounded — and it is exported because the DRAWING needs the same answer
 * without going through the state.
 *
 * Found in the browser: the chime for reaching the count is decided by comparing the tally before a tap
 * with the tally after it, and the drawing was reading "before" out of the last render. Twenty taps in
 * quick succession — which is exactly what twenty band pull-aparts are — all saw the same stale nought,
 * so the count was reached and nothing was cued. The arithmetic lives here, in one place, so the
 * drawing can advance its own counter honestly instead of keeping a second bounding rule.
 */
export function tallyAfter(tally: number, by: number): number {
  return Math.max(0, Math.min(RUNNING_MAX.repetitions, tally + by));
}

/** Back to nought, for the next set. */
export function clearTally(state: TimerState, clientId: string, exerciseId: string): TimerState {
  const tallies = new Map(state.tallies);
  tallies.set(lineKey(clientId, exerciseId), 0);
  return { ...state, tallies };
}

/** True once the tally has reached what he is counting to. False when he is not counting to anything. */
export function tallyReached(tally: number, target: number | null): boolean {
  return target !== null && tally >= target;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Reading the clock
// ═══════════════════════════════════════════════════════════════════════════════

/** How long this phase has been going, in milliseconds, banked stretches included. */
export function spentMs(run: Run, now: number): number {
  const going = run.startedAt === null ? 0 : Math.max(0, now - run.startedAt);
  return Math.min(run.seconds * 1000, run.bankedMs + going);
}

/**
 * WHAT THE BIG NUMBER SAYS, in whole seconds remaining.
 *
 * ROUNDED UP, deliberately: a countdown that shows 0 for the whole of the last second tells him it is
 * over while a client is still holding it. Ceiling means 30 is on screen from the moment he presses
 * and 1 is on screen through the final second, which is what a stopwatch in a hand does.
 */
export function remainingSeconds(run: Run, now: number): number {
  const left = run.seconds * 1000 - spentMs(run, now);
  return Math.max(0, Math.ceil(left / 1000));
}

/** True once the phase has run itself out. */
export function runIsOut(run: Run, now: number): boolean {
  return run.finished || remainingSeconds(run, now) === 0;
}

/**
 * THE BIG NUMBER, as minutes and seconds.
 *
 * Readable at arm's length on a phone mid-exercise is the requirement, and past a minute a bare count
 * of seconds stops being readable at a glance: "1:45" is a shape, "105" is arithmetic. Under a minute
 * it stays a bare number, which is the shape a countdown wants.
 */
export function clockWords(secondsLeft: number): string {
  if (secondsLeft < 60) return String(secondsLeft);
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// The cues — and neither half of one is optional
// ═══════════════════════════════════════════════════════════════════════════════

/** What kind of cue this is. */
export type CueKind = 'named' | 'countdown' | 'work-ended' | 'rest-ended' | 'target-reached';

/**
 * ONE CUE, IN BOTH CHANNELS AT ONCE.
 *
 * `heard` is what the audio mechanism is asked to do and `seen` is what is drawn, and NEITHER IS
 * OPTIONAL — that is the whole shape of this type, and it is the shape because the rule is the one
 * most likely to be quietly broken. A cue that could be built with only a sound would let a silent
 * device lose something, and the loss would be invisible to every test that did not have a speaker.
 */
export interface Cue {
  readonly kind: CueKind;
  /** What the audio mechanism is asked for. A tone, or words to say. Never nothing. */
  readonly heard: { readonly tone: ToneKind | null; readonly words: string | null };
  /** What is drawn, and it stands alone. Never empty. */
  readonly seen: string;
}

/** The two sounds this surface makes. Both are synthesised; neither is a file. */
export type ToneKind = 'countdown' | 'ended';

/**
 * THE LAST SECONDS THAT GET A BEEP.
 *
 * Three, because three is what a coach counts down out loud and it is short enough that a client
 * hears it as the end arriving rather than as a rhythm. The visible half is the big number itself,
 * which is already changing every second, plus the words {@link COUNTDOWN_WORDS}.
 */
export const COUNTDOWN_FROM = 3;

/** What the last seconds say on screen, so a muted phone sees the countdown it cannot hear. */
export function countdownWords(secondsLeft: number): string {
  return secondsLeft === 1 ? 'One second left.' : `${secondsLeft} seconds left.`;
}

/** What the end of a hold says on screen, beside the chime. */
export const WORK_ENDED_WORDS = 'Time is up on this one.';

/** What the end of a rest says on screen, beside the chime. */
export const REST_ENDED_WORDS = 'Rest is over.';

/** What reaching the count says on screen, beside the chime. */
export function targetReachedWords(target: number): string {
  return `That is ${target} counted.`;
}

/** What is SAID when a hold begins: the exercise's own name, and nothing about what comes after it. */
export function namedWords(exerciseName: string): string {
  return exerciseName;
}

/** What the start of a hold says on screen. */
export function startedWords(exerciseName: string, seconds: number): string {
  return `${exerciseName}, ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`;
}

/** What the start of a rest says on screen. */
export function restStartedWords(seconds: number): string {
  return `Resting ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`;
}

/**
 * THE CUE FOR THE MOMENT A PHASE BEGINS — the spoken exercise name, and its visible twin.
 *
 * Spoken because the coach's hands and eyes are on the client rather than on the phone, and that is
 * the whole value of hearing which exercise is running. It says the exercise's NAME and no more: a
 * cue that said what came after it would be the application driving the session.
 */
export function openingCue(phase: Phase, exerciseName: string, seconds: number): Cue {
  if (phase === 'rest') {
    return {
      kind: 'named',
      heard: { tone: null, words: 'Rest' },
      seen: restStartedWords(seconds),
    };
  }
  return {
    kind: 'named',
    heard: { tone: null, words: namedWords(exerciseName) },
    seen: startedWords(exerciseName, seconds),
  };
}

/** The cue for reaching a count. A counted line has no clock, so this one is not on the tick. */
export function targetCue(target: number): Cue {
  return {
    kind: 'target-reached',
    heard: { tone: 'ended', words: null },
    seen: targetReachedWords(target),
  };
}

/**
 * WHAT A TICK MADE DUE, and the run wound forward to where it has been read out to.
 *
 * A tick is not a timer: it is "the clock now says this", handed in by whoever is holding the
 * interval, so the suite drives a whole minute of cues without waiting for one. Cues due STRICTLY
 * AFTER where they were last read out and at or before now, so a repaint at the same moment sounds
 * nothing twice — which on a React screen is the difference between three beeps and thirty.
 */
export function advance(
  run: Run, exerciseName: string, now: number,
): { readonly run: Run; readonly cues: readonly Cue[] } {
  if (run.finished) return { run, cues: [] };
  const spent = spentMs(run, now);
  if (spent <= run.cuedToMs) return { run, cues: [] };

  const cues: Cue[] = [];
  const wholeMs = run.seconds * 1000;

  // The beeps, one for each of the last seconds whose boundary this tick crossed. A tick that jumped —
  // a phone that slept, a tab that was backgrounded — may cross more than one, and each still gets its
  // cue rather than being collapsed, because the visible transcript is what the coach reads afterwards.
  //
  // EXCEPT ON THE TICK THAT ENDS IT, which is what `spent < wholeMs` says. A phone that slept through a
  // whole hold comes back and must say the hold is over, not beep its way down to an ending it already
  // reached; three beeps arriving at once after the fact is a cue about a moment that has passed.
  for (let left = COUNTDOWN_FROM; left >= 1; left -= 1) {
    const boundary = wholeMs - left * 1000;
    if (boundary >= 0 && boundary > run.cuedToMs && boundary <= spent && spent < wholeMs) {
      cues.push({
        kind: 'countdown',
        heard: { tone: 'countdown', words: null },
        seen: countdownWords(left),
      });
    }
  }

  const out = spent >= wholeMs;
  if (out) {
    cues.push(run.phase === 'rest'
      ? { kind: 'rest-ended', heard: { tone: 'ended', words: null }, seen: REST_ENDED_WORDS }
      : {
        kind: 'work-ended',
        heard: { tone: 'ended', words: null },
        // The exercise's name in the words, because the chime alone does not say WHICH hold ended
        // when he is running three people through one routine.
        seen: `${WORK_ENDED_WORDS} ${exerciseName}.`,
      });
  }

  return {
    run: {
      ...run,
      cuedToMs: spent,
      finished: out,
      // A FINISHED RUN LETS GO OF WHEN IT STARTED AND BANKS WHAT IT SPENT, and the second half is not
      // tidiness. Found by this module's own suite: releasing `startedAt` without banking left the
      // run reading as though nothing had elapsed, so a hold that had just ended showed its FULL
      // duration again — a countdown that reads 2 while the chime is still sounding.
      startedAt: out ? null : run.startedAt,
      bankedMs: out ? wholeMs : run.bankedMs,
    },
    cues,
  };
}

/**
 * THE VISIBLE HALF OF A RUN OF CUES, ON ITS OWN.
 *
 * This is the assertion the whole audio design turns on: it reads the same whether the device made a
 * sound, refused to, had no voice installed, or was never offered the chance. The suite compares it
 * across all four.
 */
export function cueTranscript(cues: readonly Cue[]): readonly string[] {
  return cues.map((cue) => cue.seen);
}

// ═══════════════════════════════════════════════════════════════════════════════
// What the panel says
// ═══════════════════════════════════════════════════════════════════════════════

/** What the control that opens the panel says. */
export const TIMER_PANEL_LABEL = 'Time or count';

/** What the panel says it is for, once per screen rather than on every row. */
export const TIMER_INTRO =
  'Hold something for a set time, or count repetitions out loud, and change either number here for '
  + 'this run. Nothing you do on a timer is written down — record what happened with the controls on '
  + 'the line.';

/** What the control that starts a hold says. */
export const START_WORK_LABEL = 'Start the timer';

/** What the control that starts a rest says. */
export const START_REST_LABEL = 'Start the rest';

/** What the control that holds a run says. */
export const PAUSE_LABEL = 'Hold it there';

/** What the control that lets a held run go on says. */
export const RESUME_LABEL = 'Carry on';

/** What the control that puts the clock away says. */
export const CLEAR_LABEL = 'Put the timer away';

/** What the control that adds one to the tally says. */
export const COUNT_UP_LABEL = 'Count one';

/** What the control that takes one off the tally says. */
export const COUNT_DOWN_LABEL = 'Take one off';

/** What the control that puts the tally back to nought says. */
export const CLEAR_TALLY_LABEL = 'Back to nought';

/** The title of the counted half of the panel. */
export const TALLY_TITLE = 'Counted out loud';

/** The title of the timed half of the panel. */
export const CLOCK_TITLE = 'On the clock';

/** What the tally reads as, drawn from the moment the panel opens rather than when the first tap lands. */
export function tallyWords(tally: number, target: number | null): string {
  const counted = `${tally} counted`;
  if (target === null) return `${counted}.`;
  if (tally >= target) return `${counted} of ${target}. That is the count.`;
  return `${counted} of ${target}.`;
}

/**
 * WHAT THE CLOCK'S OWN LINE SAYS, and it is drawn from the moment the panel opens.
 *
 * The same reason `session-readings.ts` draws its status line unconditionally: a line that APPEARS
 * when a timer starts makes the panel taller under his thumb, and everything he was reading moves.
 * Measured on this build at 390px by a sibling action; the class that reserves the height is
 * `status-held`.
 */
export function clockLine(run: Run | null, now: number): string {
  if (run === null) return 'No timer is going.';
  const left = remainingSeconds(run, now);
  const what = run.phase === 'rest' ? 'rest' : 'this one';
  if (run.finished || left === 0) {
    return run.phase === 'rest' ? REST_ENDED_WORDS : WORK_ENDED_WORDS;
  }
  if (run.startedAt === null) {
    return `Held at ${clockWords(left)} of ${what}.`;
  }
  return `${clockWords(left)} left of ${what}.`;
}

// ── internals ───────────────────────────────────────────────────────────────────────────────────

/** A number as he would have typed it, or an empty box where the routine named none. */
function asTyped(value: number | null): string {
  return value === null ? '' : String(value);
}
