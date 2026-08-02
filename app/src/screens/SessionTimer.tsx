/**
 * THE EXERCISE TIMER AND ITS COUNT, DRAWN ON THE RUNNER — beside the six moves and the readings.
 *
 * This file is the DRAWING and nothing else. Every judgement — what each control says, which way a
 * line is measured, what a running value may be, when a cue falls due and what each cue's visible half
 * says — is decided in `exercise-timer.ts`, and the sound itself is `session-audio.ts`, injected. Both
 * are asserted with no browser and no rendering at all. The same split as `screens/removals.ts` against
 * `screens/RemovalsScreen.tsx`.
 *
 * ## READABLE AT ARM'S LENGTH, MID-EXERCISE, WITH A CLIENT WAITING
 *
 * That is the requirement this drawing is shaped by, and it is why the countdown is `value-display` —
 * the one class in the foundation for the single number a screen exists to show, tabular so the digits
 * do not shuffle the width as they change. Everything else in the panel is smaller than it, on purpose:
 * a panel where the number competes with its own controls is a panel he has to focus on.
 *
 * ## THE VISIBLE HALF IS DRAWN WHETHER OR NOT THERE WAS A SOUND
 *
 * The rule most likely to be quietly broken, so it is structural here rather than remembered: what is
 * drawn comes from `cue.seen`, and nothing in this file reads whether the sound came out in order to
 * decide what to show. {@link CueTranscript} shows the last cues in words; the countdown shows itself;
 * the end of a phase says so on its own line. A coach on a muted phone, in a noisy gym, on a device
 * that refused, or on a browser with no voice installed reads exactly the same screen.
 *
 * ## NOTHING HERE SCROLLS, FOCUSES OR REMOUNTS
 *
 * `SESSION.md` §6 and the four ways a drawing throws his place away — the sibling readings surface
 * measured them on this build. A timer is the worst possible place to move the page: he is mid-hold,
 * looking at a number, and his thumb is over the control that pauses it. So there is no
 * `scrollIntoView`, no `autoFocus`, no scrolling of any kind; the cue transcript has a RESERVED height
 * so words changing on it cannot make the panel taller; and the panel is keyed by nothing that changes
 * when the session is read back.
 *
 * NO GLYPH HERE POINTS AT ANOTHER EXERCISE. The generated family holds `session-next-exercise` and
 * `session-previous-exercise`, which are a cursor with a picture on it — `SESSION.md` §2 — and neither
 * appears in this file. The suite scans for both.
 *
 * ## THE TIMER IS ON THE ROW AS WELL AS IN THE PANEL
 *
 * Putting the panel away does not stop the clock, so the row carries the number too. A coach who
 * collapsed the panel to see the whole routine has not lost his timer, and a timer he cannot see from
 * where he is standing is a timer he will not trust twice.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { Glyph } from '../design/Glyph';
import { Tooltip } from '../design/Tooltip';
import {
  CLEAR_LABEL, CLEAR_TALLY_LABEL, CLOCK_TITLE, COUNT_DOWN_LABEL, COUNT_UP_LABEL, PAUSE_LABEL,
  RESUME_LABEL, START_REST_LABEL, START_WORK_LABEL, TALLY_TITLE, TIMER_INTRO, TIMER_PANEL_LABEL,
  advance, changeOverride, clearRun, clearTally, clockLine, clockWords, countBy, cueTranscript,
  openPanel, openingCue, overrideOf, overrideProblem, panelIsOpen, pauseRun, remainingSeconds,
  resumeRun, runLine, runnableValue, startPhase, startProblem, tallyAfter, tallyOf, tallyReached,
  tallyWords, targetCue, workKindOf, OVERRIDE_FIELDS, OVERRIDE_LABELS,
} from './exercise-timer';
import type { Cue, OverrideField, Phase, Run, TimerState } from './exercise-timer';
import {
  STANDING_WORDS, UNLOCK_LABEL, UNLOCK_WORDS, offerUnlock, soundCue, standingOf,
} from './session-audio';
import type { AudioPort, Unlocked } from './session-audio';
import type { EffectivePrescription } from './effective-prescription';

/** How often the clock is read. Four times a second, so a whole-second change is never late by one. */
const TICK_MS = 250;

/** How many cues the transcript keeps. Enough to read what just happened, not a log. */
const TRANSCRIPT_KEPT = 3;

/**
 * THE REAL CLOCK, NAMED ONCE AT MODULE LEVEL RATHER THAN DEFAULTED INLINE.
 *
 * An inline `() => Date.now()` default is a fresh function on every repaint, which would tear down and
 * rebuild the tick interval each time — a timer that loses a fraction of a second on every render and
 * can miss the boundary a beep is due on. Named here, it is one stable value that effects can depend on
 * honestly, and a caller passing its own clock is what makes this component drivable without real time.
 */
const systemClock = (): number => Date.now();

// ═══════════════════════════════════════════════════════════════════════════════
// The offer, once for the whole screen
// ═══════════════════════════════════════════════════════════════════════════════

/** What the sound offer needs: the port, and where he stands with it. */
interface SoundOfferProps {
  readonly port: AudioPort;
  readonly unlocked: Unlocked | null;
  readonly setUnlocked: Dispatch<SetStateAction<Unlocked | null>>;
}

/**
 * THE ONE TAP, AS A COMPACT LABELLED OFFER — drawn once for the whole screen, not once per line.
 *
 * It is an ordinary control in the control row and not a modal, a banner or anything in the way: a
 * coach who ignores it forever loses nothing, which is what {@link UNLOCK_WORDS} says in the tooltip
 * rather than in a permanent paragraph — the one real constraint (a browser needs a tap before it will
 * make a sound) is worth a sentence he can reach, not one he has to read every time this card renders.
 * Once the device has answered, the offer is replaced by what he can actually expect — including "this
 * browser has no voice", which is a state and not a fault.
 */
export function SoundOffer({ port, unlocked, setUnlocked }: SoundOfferProps) {
  const standing = standingOf(unlocked);

  const turnOn = useCallback(() => {
    // Fired from a real tap, which is the gesture the platform wants. The promise is awaited here
    // rather than by the caller so that no cue can be waiting on it.
    void port.unlock().then(setUnlocked);
  }, [port, setUnlocked]);

  if (offerUnlock(unlocked)) {
    return (
      <Tooltip text={UNLOCK_WORDS}>
        <button type="button" className="btn btn-quiet btn-sm" onClick={turnOn}>
          <Glyph name="reading-timer" size="dense" decorative />
          <span>{UNLOCK_LABEL}</span>
        </button>
      </Tooltip>
    );
  }

  return <span className="muted" role="status">{STANDING_WORDS[standing]}</span>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// What just happened, in words
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * THE VISIBLE HALF OF THE LAST CUES, and this is the whole of what a silent device is not missing.
 *
 * `role="status"` so it is announced as well as shown, and `status-held` so words changing on it cannot
 * change the height of the panel under his thumb — the 26 pixels a sibling action measured at 390px on
 * this build. Drawn from the moment the panel opens, with its own words for having heard nothing yet,
 * for the same reason.
 */
function CueTranscript({ cues }: { readonly cues: readonly Cue[] }) {
  const said = cueTranscript(cues);
  return (
    <p className="muted read status-held" role="status">
      {said.length === 0 ? 'Nothing has been cued yet.' : said.join(' ')}
    </p>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// One line's timer and count
// ═══════════════════════════════════════════════════════════════════════════════

/** What one line's timer needs. Nothing here reaches a store: this surface records nothing. */
export interface LineTimerProps {
  readonly clientId: string;
  readonly exerciseId: string;
  /** The exercise's own name, which is the word that gets spoken. */
  readonly exerciseName: string;
  /**
   * WHAT THIS LINE IS PRESCRIBED AT, which fills the boxes in as a default he can decline.
   *
   * The RESOLVED prescription off `runner.ts`'s `LineReport.effective` and never the routine's
   * overrides alone: `workKindOf` reads `duration_seconds` to decide whether this line is held or
   * counted, and handed the overrides it read null on every line the routine did not override — so a
   * plank opened as something to count rather than something to hold, and nothing said so.
   */
  readonly prescription: EffectivePrescription | null;
  readonly state: TimerState;
  readonly setState: Dispatch<SetStateAction<TimerState>>;
  readonly port: AudioPort;
  /** Where he stands with the sound, so the panel can say it beside the controls. */
  readonly unlocked: Unlocked | null;
  /**
   * THE CLOCK, INJECTED — the same seam `exercise-timer.ts` is built on.
   *
   * Defaulted rather than required, so the runner mounts this without holding a clock of its own, and
   * overridable so nothing about this component's behaviour depends on real time passing.
   */
  readonly now?: () => number;
}

/**
 * THE CONTROL ON THE ROW, THE PANEL UNDER IT, AND THE CLOCK THAT SHOWS IN BOTH.
 *
 * The panel is opened by the coach and never by anything else. It opens on the way the ROUTINE measures
 * this line — a plank on the clock, a squat on the count — and offers the other anyway, because the
 * routine's answer is a default and a coach may want to count a hold on the day.
 */
export function LineTimer(props: LineTimerProps) {
  const {
    clientId, exerciseId, exerciseName, prescription, state, setState, port, unlocked,
    now = systemClock,
  } = props;

  const kind = workKindOf(prescription);
  const override = overrideOf(state, clientId, exerciseId, prescription);
  const open = panelIsOpen(state, clientId, exerciseId);
  const mine = runLine(state.run, clientId, exerciseId);
  const run = mine ? state.run : null;
  const tally = tallyOf(state, clientId, exerciseId);
  const target = runnableValue('repetitions', override.repetitions);

  /** What has been cued on this line, in words. Transient, and the visible half of every cue. */
  const [cues, setCues] = useState<readonly Cue[]>([]);

  /**
   * THE TICK, AND IT IS THE ONLY THING IN THIS FILE THAT TOUCHES THE REAL CLOCK.
   *
   * `advance` decides everything; this effect only says "the clock now reads this". The interval is
   * torn down when the run ends, when it is put away or when the component leaves, so a coach who
   * navigates back to the calendar mid-hold leaves no interval behind — and `runner-source.ts` releases
   * the lease on that same departure.
   */
  const going = run !== null && run.startedAt !== null && !run.finished;

  /**
   * THE RUN AS THE TICK LAST LEFT IT — and this ref is not a convenience, it is the fix for a defect
   * that only a browser could show.
   *
   * The first version of the tick did the whole step INSIDE the `setState` updater, because that is
   * where the current run was to hand. React re-invokes an updater — it is required to be pure — so the
   * `soundCue` and `setCues` inside it ran TWICE: the end-of-exercise chime sounded twice and the
   * transcript read "Time is up on this one. Dead Hang. Time is up on this one. Dead Hang." React
   * reported the other half of it outright, `Cannot update a component (LineTimer) while rendering a
   * different component (RunnerScreen)` — the timer's own state being set during the parent's render.
   * Every suite here was green throughout: they drive `advance` directly and no pure function can be
   * wrong about this.
   *
   * So the tick now owns its run, advances it once, fires its cues once, and hands the result to
   * `setState` as a value. The updater is pure again.
   */
  const latest = useRef<Run | null>(null);
  useEffect(() => {
    latest.current = state.run;
  });

  useEffect(() => {
    if (!going) return undefined;
    // Seeded from what the last render saw, then owned outright: a second read of state mid-interval
    // would be a stale run, and a stale run re-fires the cue it has already read out.
    let onTheClock = latest.current;
    const timer = setInterval(() => {
      if (onTheClock === null) return;
      const stepped = advance(onTheClock, exerciseName, now());
      onTheClock = stepped.run;
      if (stepped.cues.length > 0) {
        // ASKED FOR, AND DRAWN REGARDLESS. The sound is requested and its answer is not consulted:
        // the words go on the transcript on the next line whatever came back.
        for (const cue of stepped.cues) soundCue(port, cue);
        setCues((kept) => [...kept, ...stepped.cues].slice(-TRANSCRIPT_KEPT));
      }
      const settled = stepped.run;
      setState((held) => (held.run === null || held.run.clientId !== clientId
        || held.run.exerciseId !== exerciseId ? held : { ...held, run: settled }));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [going, clientId, exerciseId, exerciseName, setState, port, now]);

  const begin = useCallback((phase: Phase) => {
    if (startProblem(phase, override) !== null) return;
    const field: OverrideField = phase === 'rest' ? 'restSeconds' : 'seconds';
    const cue = openingCue(phase, exerciseName, runnableValue(field, override[field]) ?? 0);
    setState((held) => startPhase(held, clientId, exerciseId, kind, phase, override, now()));
    // THE NAME IS SAID AND WRITTEN, and the two are independent: the sound is asked for, the words go
    // on the transcript whether or not it came out.
    soundCue(port, cue);
    setCues([cue]);
  }, [clientId, exerciseId, exerciseName, kind, override, setState, port, now]);

  /**
   * THE TALLY AS THE LAST TAP LEFT IT, and this ref is the fix for a defect only a browser could show.
   *
   * The chime for reaching the count is decided by comparing the tally BEFORE a tap with the tally
   * after it, and that comparison was reading "before" out of the last render. Twenty taps in quick
   * succession — which is what twenty band pull-aparts are — all saw the same stale nought, React
   * batched every one of them, and the count was reached in silence. Counted to twenty by hand in the
   * browser: `0 counted` through `20 counted of 20. That is the count.` and not one cue.
   *
   * So the handler advances its own counter synchronously, through the module's own bounding, and the
   * effect below keeps it honest against whatever else changed the tally.
   */
  const counted = useRef(tally);
  useEffect(() => {
    counted.current = tally;
  });

  const countOne = useCallback(() => {
    const was = counted.current;
    const nowAt = tallyAfter(was, 1);
    counted.current = nowAt;
    setState((held) => countBy(held, clientId, exerciseId, 1));
    // THE CHIME FOR REACHING THE COUNT, on the tap that crosses it and not on every tap after it.
    if (target !== null && !tallyReached(was, target) && tallyReached(nowAt, target)) {
      const cue = targetCue(target);
      soundCue(port, cue);
      setCues((kept) => [...kept, cue].slice(-TRANSCRIPT_KEPT));
    }
  }, [clientId, exerciseId, setState, target, port]);

  const left = run === null ? null : remainingSeconds(run, now());
  const workRefusal = startProblem('work', override);
  const restRefusal = startProblem('rest', override);

  return (
    <>
      {/* THE CONTROL, and the clock beside it when there is one. A run shows on the row whether or not
          the panel is open — see the header. */}
      <button
        type="button"
        className={open ? 'btn btn-sm' : 'btn btn-sm btn-quiet'}
        aria-expanded={open}
        onClick={() => setState((held) => openPanel(held, clientId, exerciseId))}
      >
        <Glyph name="reading-timer" size="inline" decorative />
        <span>{TIMER_PANEL_LABEL}</span>
      </button>
      {left !== null && (
        <span className={run !== null && run.finished ? 'chip chip-warning' : 'chip chip-accent'}>
          <span className="tabular">{clockWords(left)}</span>
        </span>
      )}

      {open && (
        <div
          className="row-panel card-tight over-session stack"
          role="group"
          aria-label={`${TIMER_PANEL_LABEL}: ${exerciseName}`}
        >
          <div className="card-body stack">
            <p className="muted read">{TIMER_INTRO}</p>

            {/* WHAT HE CAN CHANGE, ALL THREE, WHATEVER THE ROUTINE ASKED FOR. A box the routine said
                nothing about is empty rather than filled with a number this application invented. */}
            <div className="stack-tight">
              {OVERRIDE_FIELDS.map((field: OverrideField) => {
                const problem = overrideProblem(field, override[field]);
                const id = `timer-${clientId}-${exerciseId}-${field}`;
                return (
                  <div key={field} className="field">
                    <label htmlFor={id}>{OVERRIDE_LABELS[field]}</label>
                    <input
                      id={id}
                      type="text"
                      inputMode="numeric"
                      value={override[field]}
                      aria-invalid={problem !== null}
                      onChange={(event) => setState((held) => changeOverride(
                        held, clientId, exerciseId, prescription, field, event.target.value,
                      ))}
                    />
                    {/* A BOX HE HAS NOT TYPED INTO IS NOT A MISTAKE HE HAS MADE, so this is drawn only
                        when there is something actually wrong with what is in it. */}
                    {problem !== null && <p className="field-hint">{problem}</p>}
                  </div>
                );
              })}
            </div>

            {/* ═══ ON THE CLOCK ═══ */}
            <h4 className="title-block">
              <Glyph name="reading-held-position" size="inline" decorative />
              <span>{CLOCK_TITLE}</span>
            </h4>

            {/* THE BIG NUMBER. `value-display` is the foundation's one class for the single number a
                screen exists to show, and it is tabular so the width does not shuffle as it counts. */}
            <p className="value-display tabular" aria-live="off">
              {left === null ? '—' : clockWords(left)}
            </p>
            <p className="muted read status-held" role="status">{clockLine(run, now())}</p>

            <div className="inline">
              {run === null || run.finished ? (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={workRefusal !== null}
                    onClick={() => begin('work')}
                  >
                    <Glyph name="session-start" size="inline" decorative />
                    <span>{START_WORK_LABEL}</span>
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={restRefusal !== null}
                    onClick={() => begin('rest')}
                  >
                    <Glyph name="rest-interval" size="inline" decorative />
                    <span>{START_REST_LABEL}</span>
                  </button>
                </>
              ) : run.startedAt === null ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setState((held) => resumeRun(held, now()))}
                >
                  <Glyph name="session-start" size="inline" decorative />
                  <span>{RESUME_LABEL}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setState((held) => pauseRun(held, now()))}
                >
                  <Glyph name="session-pause" size="inline" decorative />
                  <span>{PAUSE_LABEL}</span>
                </button>
              )}
              {run !== null && (
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => setState((held) => clearRun(held))}
                >
                  <Glyph name="close" size="inline" decorative />
                  <span>{CLEAR_LABEL}</span>
                </button>
              )}
            </div>

            {/*
              WHY A CONTROL IS OFF, said where the control is. A disabled button with no sentence
              beside it is a button he presses twice and then distrusts.

              BOTH OF THEM, and the second was missing. Seen in the browser on the routine's own dead
              hang, which names a duration and no rest: "Start the rest" was disabled with nothing
              beside it saying why, and the coach's only way to find out was to type a number into a
              box he had no reason to connect to it.
            */}
            {workRefusal !== null && <p className="field-hint">{workRefusal}</p>}
            {restRefusal !== null && <p className="field-hint">{restRefusal}</p>}

            {/* ═══ COUNTED OUT LOUD ═══ */}
            <h4 className="title-block">
              <Glyph name="reading-repetition-count" size="inline" decorative />
              <span>{TALLY_TITLE}</span>
            </h4>

            <p className="value-display tabular" aria-live="off">{tally}</p>
            <p className="muted read status-held" role="status">{tallyWords(tally, target)}</p>

            <div className="inline">
              <button type="button" className="btn btn-primary" onClick={countOne}>
                <Glyph name="add" size="inline" decorative />
                <span>{COUNT_UP_LABEL}</span>
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setState((held) => countBy(held, clientId, exerciseId, -1))}
              >
                <Glyph name="collapse" size="inline" decorative />
                <span>{COUNT_DOWN_LABEL}</span>
              </button>
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => setState((held) => clearTally(held, clientId, exerciseId))}
              >
                <Glyph name="restore" size="inline" decorative />
                <span>{CLEAR_TALLY_LABEL}</span>
              </button>
            </div>

            {/* WHAT WAS CUED, IN WORDS. The half a muted phone still gets. */}
            <CueTranscript cues={cues} />
            <p className="muted read">{STANDING_WORDS[standingOf(unlocked)]}</p>
          </div>
        </div>
      )}
    </>
  );
}
