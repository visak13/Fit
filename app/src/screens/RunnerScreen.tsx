/**
 * THE SESSION RUNNER — the screen the whole application exists for, and this is its SPINE.
 *
 * This file is the DRAWING and nothing else. Every judgement — the wording of each state, what the
 * record says about a line, the order the lines come out in, what may not be said about any of it —
 * is decided in `runner.ts`, and every read and the lease itself live in `runner-source.ts`, where
 * both are asserted with no browser and no rendering at all. The same split as `screens/removals.ts`
 * against `screens/RemovalsScreen.tsx`.
 *
 * ## WHAT THIS STEP BUILT, AND THE SEAMS IT LEFT ON PURPOSE
 *
 * The route, the screen, the live handle and the honest states. Three sibling steps mount ON TOP of
 * this and each is named where it will attach:
 *
 *   - the IN-SESSION CONTROLS that record what happened — performed, skipped, substituted, amended.
 *     BUILT: `SessionControls.tsx` draws them on each per-person line below, judged by
 *     `modular-control.ts` and written through `modular-control-source.ts` on the handle this screen
 *     already holds. Nothing about the route, the shell or the lease changed to make room for them.
 *   - the READINGS and the TIMER. A reading is captured against ONE client at any moment, and
 *     `SESSION.md` §6 names the property the core cannot hold for whoever builds it: capturing a
 *     reading for one client must not lose the coach's place.
 *   - the INTENSITY ADAPTER.
 *
 * THE PREVIOUS SESSION AT A GLANCE IS NOT MINE EITHER, and it is not missing — `core/session/glance.js`
 * holds it and the calendar already shows it while he chooses. Whoever brings it here reads it from
 * there rather than deriving a second one.
 *
 * ## WHERE HE WAS LOOKING IS THIS SCREEN'S OWN BUSINESS
 *
 * `SESSION.md` §2 is explicit and it is the rule a screen breaks without any test noticing: anything
 * describing where a session has got to is DERIVED, never persisted. There is no cursor here, no
 * current exercise and no next exercise — not in the record, not in the view, and not in what this
 * screen sends anywhere. If a later step needs to remember which panel he had open, that is this
 * screen's own transient state and it stays here.
 *
 * ## LEAVING IS NOT ENDING
 *
 * Navigating away releases the lease and says nothing about the session's state — it stays
 * `in_progress`, exactly where a power cut would have left it, and it is picked up the same way.
 * Ending a session because the coach tapped back would destroy the thing the lease was protecting.
 * `runner-source.ts` owns that release; this screen simply stops being on screen.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Glyph } from '../design/Glyph';
import { LocalStoreNotice, useLocalStore } from '../platform/LocalStore';
import {
  ClientCapture, ClientRecorded, PreviousSession, SessionNoteCapture, glanceFor, glanceToggle,
} from './SessionReadings';
import { LineControls, QuickRecord } from './SessionControls';
import { SessionNowCard } from './SessionNowCard';
import { AcceptedLineMark, IntensityToggles, ProposalPanel } from './SessionIntensity';
import {
  COULD_NOT_SHAPE, accepted as acceptTheCurve, acceptedLine, holding, linesInOrder, noIntensity,
  refusedToShape, rejected, setAside, shaping, showing,
} from './intensity';
import type { IntensityState } from './intensity';
import { readGroundInto, shapeTheCurve } from './intensity-source';
import type { IntensityGround } from './intensity-source';
import type { ExerciseDefaults } from './effective-prescription';
import { draftKey, lineOnTheRecord, noArrival, noControls } from './modular-control';
import type { ArrivalState, ControlState, ProjectedSession } from './modular-control';
import { readArrivalRegisterInto, readSubstitutionPoolInto } from './modular-control-source';
import type { ArrivalRegister, SessionReadBack, SubstitutionPool } from './modular-control-source';
import { SessionArrival } from './SessionArrival';
import { noCaptures } from './session-readings';
import type { CaptureState, ProjectedForCapture } from './session-readings';
import { readGlancesInto } from './session-readings-source';
import type { RunnerGlances } from './session-readings-source';
import { SessionEnding } from './SessionEnding';
import { noEnding } from './session-ending';
import type { EndingState } from './session-ending';
import { LineTimer, SoundOffer } from './SessionTimer';
import { noTimers } from './exercise-timer';
import type { TimerState } from './exercise-timer';
import { browserAudio } from './session-audio';
import type { AudioPort, Unlocked } from './session-audio';
import {
  BACK_TO_CALENDAR_LABEL, CALENDAR_ADDRESS, COPY_THE_JOINING_LINK, JOINING_LINK_COPIED,
  JOINING_LINK_LABEL, JOINING_LINK_NOT_COPIED, NO_SESSION_OPEN, NO_SESSION_OPEN_WHAT_TO_DO,
  OPENING_WORDS, OPEN_SESSION_KEY, RUNNER_TITLE, describeOpening, describeSession, joiningLinkOf,
  roomStateWords,
} from './runner';
import type { AttendeeReport } from './runner';
import { openSessionInto } from './runner-source';
import type { SessionReading, SessionView } from './runner-source';
import { heldSessionId } from './session-handover';
import type { LocalStore } from '../../core/store/store.js';

/** What was read, and WHICH store it was read from — the same guard every screen here carries. */
interface Read<T> {
  readonly from: LocalStore;
  readonly what: T;
}

/**
 * THE JOINING LINK, PRINTED — copyable where the session is run, because the client it is FOR is
 * not in this room. The address stays on screen and selectable whatever the clipboard does; the
 * copy control failing costs a longer route, never the link. Same pattern as Setup's origin card.
 */
function JoiningLinkLine({ url }: { url: string }) {
  const [copying, setCopying] = useState<'copied' | 'refused' | null>(null);

  const copy = useCallback(() => {
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (clipboard === undefined) {
      setCopying('refused');
      return;
    }
    clipboard.writeText(url).then(
      () => setCopying('copied'),
      (error: unknown) => {
        console.error('[session] this browser refused the clipboard', error);
        setCopying('refused');
      },
    );
  }, [url]);

  return (
    <div className="inline">
      <span className="meta">{JOINING_LINK_LABEL}</span>
      <p className="copy-value"><code>{url}</code></p>
      <button type="button" className="icon-btn" aria-label={COPY_THE_JOINING_LINK} onClick={copy}>
        <Glyph name="export" decorative />
      </button>
      <a href={url} target="_blank" rel="noopener noreferrer" className="icon-btn" aria-label="Open the call">
        <Glyph name="link-external" decorative />
      </a>
      {copying !== null && (
        <span className="muted read" role="status">
          {copying === 'copied' ? JOINING_LINK_COPIED : JOINING_LINK_NOT_COPIED}
        </span>
      )}
    </div>
  );
}

/** The way back, drawn in every state. A screen with no door is the dead end this build has shipped. */
function WayBack() {
  return (
    <p className="inline">
      <Glyph name="link-back" size="inline" decorative />
      <Link to={CALENDAR_ADDRESS}>{BACK_TO_CALENDAR_LABEL}</Link>
    </p>
  );
}

/** What one person's card needs beyond their own report: everything the controls write through. */
interface AttendeeCardProps {
  readonly attendee: AttendeeReport;
  readonly store: LocalStore;
  readonly sessionId: string;
  /** The projection, for the numbers the routine asked for and the identity of each recorded fact. */
  readonly view: SessionView;
  readonly exerciseNames: ReadonlyMap<string, string>;
  readonly pool: SubstitutionPool | null;
  readonly controls: ControlState;
  readonly setControls: Dispatch<SetStateAction<ControlState>>;
  readonly onMoved: (reading: SessionReadBack) => void;
  /** Where the coach is in the readings and notes surfaces, and whose history he has expanded. */
  readonly captures: CaptureState;
  readonly setCaptures: Dispatch<SetStateAction<CaptureState>>;
  /** The previous session for each person in the room, or null while they are being read. */
  readonly glances: RunnerGlances | null;
  /** Where the coach is in the timers, and what he has changed for this run. Screen state, always. */
  readonly timers: TimerState;
  readonly setTimers: Dispatch<SetStateAction<TimerState>>;
  /** The sound mechanism, built once for the screen and injected the whole way down. */
  readonly port: AudioPort;
  /** What the device turned out to be able to do, or null while it has not been asked. */
  readonly unlocked: Unlocked | null;
  /** The curve he accepted, if any. Screen state; it reaches no writer and nothing derives it. */
  readonly intensity: IntensityState;
}

/**
 * ONE PERSON'S WORK — the WORK column's half of their card: the routine's own declared order,
 * numbered, every position reachable in one tap rather than only the next one. The console mockup's
 * "jump to any exercise" list, per attendee, because each attendee's record against the routine's
 * lines is independent — one may be performed where another is still not_yet_recorded.
 */
function AttendeeWork(props: AttendeeCardProps) {
  const {
    attendee, store, sessionId, view, exerciseNames, pool, controls, setControls, onMoved,
    timers, setTimers, port, unlocked, intensity,
  } = props;
  const headingId = `session-attendee-${attendee.clientId}`;

  /**
   * WHICH ROW IS OPEN, AND IT IS THIS COMPONENT'S OWN TRANSIENT STATE — exactly the class of state
   * `controls`/`captures`/`timers` already are at screen level, held here instead because it answers
   * a narrower question: which of THIS person's rows is showing its controls. `SESSION.md` §2 is not
   * in tension with it — an open row is a fact about what the coach is LOOKING AT, never about where
   * the session has got to, and it is passed to no writer and dies with the window. Only one row open
   * at a time, per person, the same shape `modular-control.ts`'s own `open` already uses.
   */
  // Which line is ON THE CARD — what the coach pressed, never where the app thinks he should be.
  const [nowKey, setNowKey] = useState<string | null>(null);

  /**
   * THE LINES, IN THE ORDER OF THE CURVE HE ACCEPTED — and in the routine's own order when he has
   * accepted none, which is every case until he presses one.
   *
   * This is NOT the rule in `SESSION.md` §2 being bent. It consults nothing about what has been
   * recorded, it does not move as he records, and it is not this application's reading of anything: it
   * is the shape he pressed and accepted, held in the screen's own transient state. A list that floated
   * the untouched lines to the top would be telling him where to go next; a list in the order of the
   * curve he chose is the feature he pressed a button for. `intensity.ts` holds the distinction and
   * `intensity.test.ts` asserts it.
   */
  const lines = linesInOrder(attendee.lines, intensity.accepted);

  return (
    <section className="card-tight stack" aria-labelledby={headingId}>
      <div className="card-header">
        <h3 id={headingId} className="title-section">
          {attendee.name}
        </h3>
        <span className="spacer" />
        <span className="chip">{attendee.recordedWords}</span>
      </div>

      {/*
        A STATEMENT ABOUT THE RECORD, and never a list of what to do next. It is drawn above the
        lines rather than beside any one of them, because a mark on a particular line is how a
        statement about the record turns into a pointer at the exercise the application thinks he
        should be on.
      */}
      {attendee.notYetRecordedWords !== null && (
        <p className="muted read">{attendee.notYetRecordedWords}</p>
      )}

      {/*
        THE ROUTINE'S OWN DECLARED ORDER, which is a DEFAULT and not a script — numbered, so the
        position is stated the way the console mockup states it, and never a pointer at where the
        coach should be next. Nothing here re-sorts by what has been recorded: a list that floated
        the untouched lines to the top would be telling him where to go next, which is the one thing
        this application does not do.

        THE IN-SESSION CONTROLS ARE ON EVERY ROW, and every one of them is live whatever has or has
        not been recorded against that row or any other. A row is no longer `row-static` because the
        controls write; nothing about the ORDER or the marking changed to make room for them.
      */}
      {/*
        THE NOW-CARD — the line the coach TAPPED, big. Everything on it is the same transient class
        of state as an open row; the record is written once, at the last set, through the same path
        as the row's one-tap control. Closed by tapping the row again, its own close, or recording.
      */}
      {lines.map((line, index) => {
        if (draftKey(attendee.clientId, line.exerciseId) !== nowKey) return null;
        const onTheRecord = lineOnTheRecord(
          view as unknown as ProjectedSession, attendee.clientId, line.exerciseId, exerciseNames,
        );
        const shaped = acceptedLine(intensity.accepted, attendee.clientId, line.exerciseId);
        return (
          <SessionNowCard
            key={`now-${attendee.clientId}-${line.exerciseId}`}
            store={store}
            sessionId={sessionId}
            clientId={attendee.clientId}
            exerciseId={line.exerciseId}
            exerciseName={line.name}
            positionWords={`${index + 1} of ${lines.length}`}
            prescription={line.effective}
            state={controls}
            setState={setControls}
            onMoved={onMoved}
            accepted={shaped}
            port={port}
            unlocked={unlocked}
            onClose={() => setNowKey(null)}
            deviations={(
              <>
                <div className="inline">
                  <AcceptedLineMark line={shaped} lineName={line.name} />
                  {line.loads.length > 0 && (
                    <span className="row-value nowrap">{line.loads.join(' · ')}</span>
                  )}
                </div>
                {onTheRecord !== null && (
                  <LineControls
                    store={store}
                    sessionId={sessionId}
                    clientId={attendee.clientId}
                    exerciseId={line.exerciseId}
                    prescription={line.effective}
                    attempts={onTheRecord.attempts}
                    pool={pool}
                    state={controls}
                    setState={setControls}
                    onMoved={onMoved}
                    accepted={shaped}
                  />
                )}
                <LineTimer
                  clientId={attendee.clientId}
                  exerciseId={line.exerciseId}
                  exerciseName={line.name}
                  prescription={line.effective}
                  state={timers}
                  setState={setTimers}
                  port={port}
                  unlocked={unlocked}
                />
              </>
            )}
          />
        );
      })}

      {lines.length > 0 && (
        <ul className="rows rows-boxed" role="list">
          {lines.map((line, index) => {
            const shaped = acceptedLine(intensity.accepted, attendee.clientId, line.exerciseId);
            const rowKey = draftKey(attendee.clientId, line.exerciseId);
            const isNow = nowKey === rowKey;
            // A SHORT CHIP AND ITS FULL SENTENCE, KEPT APART. Nothing pins the long phrase to a
            // literal string, so the visible chip is the one word the mockup's own rows carry —
            // "Waiting" — while `line.words`, the record's own sentence, stays the accessible name
            // rather than being lost. Every other outcome already reads short ("Recorded", "Recorded
            // as skipped"…) and is left as it was.
            const chipShort = line.notYetRecorded ? 'Waiting' : line.words;
            return (
              <li
                key={`${attendee.clientId}-${line.exerciseId}`}
                className="row-wrap"
                role="listitem"
              >
                {/*
                  THE ROW ITSELF IS THE TAP TARGET — one line, and tapping it puts this exercise on
                  the now-card above the list. What gets recorded and how never moved; only where
                  the big numbers are drawn did.
                */}
                <div className="row row-line">
                  <button
                    type="button"
                    className="row-main row-toggle"
                    aria-pressed={isNow}
                    onClick={() => setNowKey((held) => (held === rowKey ? null : rowKey))}
                  >
                    <span className="row-position tabular">{index + 1}</span>
                    <span className="row-name">{line.name}</span>
                    {/* WHAT RECORD WRITES WHEN HE HAS CHANGED NOTHING. A default he can see is a
                        default he can decline. */}
                    {line.prescription !== null && (
                      <span className="row-value nowrap">{line.prescription}</span>
                    )}
                  </button>

                  {/*
                    THE ONE-TAP COMMON CASE, on the untouched row only: done as written, one press,
                    nothing opened. A line with something already against it drops it — Record-again
                    and corrections are deviations, and deviations live behind the row.
                  */}
                  {line.notYetRecorded && (
                    <QuickRecord
                      store={store}
                      sessionId={sessionId}
                      clientId={attendee.clientId}
                      exerciseId={line.exerciseId}
                      exerciseName={line.name}
                      prescription={line.effective}
                      state={controls}
                      setState={setControls}
                      onMoved={onMoved}
                      accepted={shaped}
                    />
                  )}

                  {/*
                    THE INNER SPAN IS WHAT LETS IT GIVE WAY. Measured at 390px (s6/a4): "Recorded with
                    something else in its place" is a sentence, `.chip` is `white-space: nowrap`, and
                    the bare-text chip CLIPPED its own last words rather than ellipsizing them — a
                    silent truncation reads as a complete statement that is false. `.row-wrap .chip >
                    span` is the rule that ellipsizes, and it needs a span to apply to.
                  */}
                  <span
                    className={line.notYetRecorded ? 'chip' : 'chip chip-warning'}
                    aria-label={line.words}
                  >
                    <span aria-hidden="true">{chipShort}</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {attendee.beyondTheRoutine.length > 0 && (
        <p className="note read">
          <Glyph name="note" size="inline" decorative />
          <span>
            {`Recorded as well, outside the routine: ${attendee.beyondTheRoutine.join(', ')}.`}
          </span>
        </p>
      )}
    </section>
  );
}

/**
 * ONE PERSON'S CAPTURE — the CAPTURE column's half of their card: the previous session at a glance,
 * a reading or a note at any moment, and what has already been recorded for them. The console
 * mockup's per-client capture column, which never leaves the screen while the routine scrolls.
 */
function AttendeeCapture(props: AttendeeCardProps) {
  const {
    attendee, store, sessionId, view, captures, setCaptures, glances, onMoved,
  } = props;

  return (
    <section className="card-tight stack" aria-labelledby={`session-capture-${attendee.clientId}`}>
      <div className="card-header">
        <h4 id={`session-capture-${attendee.clientId}`} className="title-section">
          {attendee.name}
        </h4>
      </div>

      {/*
        THE PREVIOUS SESSION, SHOWN. A stated requirement: starting a session shows the one before it —
        the exercises performed, the loads recorded and the readings taken — so progress can be
        monitored across sessions. It SHOWS and it does not suggest: nothing here proposes a heavier
        load, compares two sessions or carries a value forward. `core/session/glance.js` is the panel
        and `launcher.ts` is its wording, both already in use on the calendar.
      */}
      <PreviousSession
        found={glanceFor(glances, attendee.clientId)}
        clientName={attendee.name}
        exerciseNames={glances?.exerciseNames ?? new Map()}
        {...glanceToggle(captures, setCaptures, attendee.clientId)}
      />

      {/*
        A READING OR A NOTE FOR THIS PERSON, AT ANY MOMENT AND WITHOUT LEAVING THE ROUTINE. Inside
        their own card, so there is no shared selector that could silently reselect somebody, and
        drawn so that recording changes nothing about where the rest of the screen sits — see
        `SessionReadings.tsx` for the four ways a drawing throws his place away.
      */}
      <ClientCapture
        store={store}
        sessionId={sessionId}
        clientId={attendee.clientId}
        clientName={attendee.name}
        state={captures}
        setState={setCaptures}
        onCaptured={onMoved}
      />

      {/*
        WHAT WAS RECORDED FOR THIS PERSON, BELOW THEIR CAPTURE, and the placement is the point: a row
        appearing above where he is reading pushes the capture fields down under his thumb at the
        moment he presses Record. Their own readings and their own notes — nobody else's is asked for.
      */}
      <ClientRecorded
        view={view as unknown as ProjectedForCapture}
        clientId={attendee.clientId}
      />
    </section>
  );
}

export function RunnerScreen() {
  const opening = useLocalStore();
  const store = opening.state === 'open' ? opening.store : null;

  // WHICH SESSION, from the address. A query and not a path segment — `shell/navigation.ts` holds the
  // argument. With none, this window's own live session answers instead, which is what "the session
  // you are running" means when he arrived at the runner plainly.
  const [address] = useSearchParams();
  const named = address.get(OPEN_SESSION_KEY);
  const sessionId = named !== null && named.length > 0
    ? named
    : store === null ? null : heldSessionId(store);

  const [reading, setReading] = useState<Read<SessionReading> | null>(null);

  /**
   * THE SESSION AS IT STANDS AFTER A MOVE.
   *
   * A move records a fact and reads the session back through the same handle, and this is where that
   * read-back lands — one state change for one press, with no window in which the record holds a fact
   * the screen does not show. It is keyed to the store AND the session so that arriving at a different
   * session cannot show the previous one's facts for an instant.
   */
  const [moved, setMoved] = useState<Read<SessionReadBack & { sessionId: string }> | null>(null);

  /**
   * WHERE THE COACH IS LOOKING, and it is this screen's own transient state.
   *
   * `SESSION.md` §2: anything describing where a session has got to is DERIVED, never persisted. This
   * is not that — it is which panel he has open and what he has typed into it — and it is passed to
   * `modular-control.ts` and nowhere near the record. It lives at SCREEN level rather than inside each
   * row so that only one panel is open at a time and what he typed survives putting it away.
   */
  const [controls, setControls] = useState<ControlState>(noControls);

  /**
   * WHERE HE IS IN THE READINGS AND NOTES SURFACES, and it is this screen's own transient state too.
   *
   * Held here rather than inside each card for the reason the controls are: one panel open at a time,
   * what he typed survives putting it away, and — the property this action turns on — a capture cannot
   * lose his place, because the place is one value that a capture hands back unchanged. It goes to
   * `session-readings.ts` and nowhere near the record.
   */
  const [captures, setCaptures] = useState<CaptureState>(noCaptures);

  /**
   * THE TIMERS, AND THEY ARE THIS SCREEN'S OWN TRANSIENT STATE FOR THE SAME REASON THE OTHER TWO ARE.
   *
   * `SESSION.md` §2 is the rule a running clock could break with no test noticing: anything describing
   * where a session has got to is DERIVED, never persisted — no stored cursor, no current exercise, no
   * step index. §10 says what a screen does about that in as many words, and this is it. Held at SCREEN
   * level rather than inside each row so there is ONE clock: a coach has one stopwatch, and two timers
   * counting where he can only see one would be two answers to what is being timed.
   *
   * It goes to `exercise-timer.ts` and nowhere near the record. Nothing below writes it anywhere.
   */
  const [timers, setTimers] = useState<TimerState>(noTimers);

  /**
   * THE INTENSITY ADAPTER'S SURFACE, AND IT IS THIS SCREEN'S OWN TRANSIENT STATE TOO.
   *
   * The curve on screen, what he has typed over its numbers, and the curve he accepted. Held at SCREEN
   * level for the same reasons the other three are: one panel at a time, what he typed survives putting
   * it away, and — the property this action turns on — accepting a curve reorders and fills in the lines
   * for EVERYBODY in the room, which is one value rather than one per card.
   *
   * `SESSION.md` §2: anything describing where a session has got to is DERIVED, never persisted. This
   * is not that. An accepted curve is not a cursor, not a current exercise and not a step index; it is
   * a shape he chose, it says nothing about what has happened, and it is passed to no writer. It dies
   * with the window, and the session it shaped is completely unaware of it.
   */
  const [intensity, setIntensity] = useState<IntensityState>(noIntensity);

  /**
   * THE FINISH CONTROL'S OWN SMALL LIFE — whether a confirmation is open, and what the ending said.
   *
   * This screen's own transient state exactly as the four above are, and for the same reason:
   * `SESSION.md` §2, anything describing where a session has got to is DERIVED, never persisted. It
   * is passed to no writer. WHETHER THE CONTROL IS OFFERED AT ALL is not held here — that is read off
   * the record's own status, so the control goes because the session ended and not because this
   * remembers being pressed.
   */
  const [ending, setEnding] = useState<EndingState>(noEnding);

  /** The curves, the whole library and this session's routine. Read once — see `intensity-source.ts`. */
  const [ground, setGround] = useState<Read<IntensityGround & { sessionId: string }> | null>(null);

  /**
   * THE SOUND, BUILT ONCE FOR THE SCREEN AND INJECTED THE WHOLE WAY DOWN.
   *
   * Once, because a port per row would be an audio context per row. Built from `window` here — this is
   * the one place in the application that names it — and every file below takes the port as an ordinary
   * argument, which is what lets the suites drive a device that refuses, a device with no voice and a
   * device that was never asked, with no browser anywhere.
   *
   * NOTHING IS CONSTRUCTED UNTIL HE TAPS. `browserAudio` reads the host lazily; see its header for why
   * an `AudioContext` built before a gesture is a context that never resumes on iOS.
   */
  const port: AudioPort = useMemo(
    () => browserAudio(typeof window === 'undefined' ? null : window as never),
    [],
  );

  /** What the device turned out to be able to do, or null while it has not been offered the chance. */
  const [unlocked, setUnlocked] = useState<Unlocked | null>(null);

  /** The exercises that can stand in for a line: the whole catalogue, not the routine's own list. */
  const [pool, setPool] = useState<Read<SubstitutionPool> | null>(null);

  /**
   * THE ARRIVAL CONTROL'S OWN SMALL LIFE, and the register it offers.
   *
   * Held at screen level exactly as the four panels above are, and for the same reason: it describes
   * where a control has got to and never where the SESSION has, so it is passed to no writer and dies
   * with the window. The register is a read of the coach's own people — the ONE list this screen
   * needs that the session cannot supply, because a late arrival is by definition somebody the
   * session has never mentioned.
   */
  const [arrival, setArrival] = useState<ArrivalState>(noArrival);
  const [register, setRegister] = useState<Read<ArrivalRegister> | null>(null);

  /** Each attendee's PREVIOUS session, which is the one before the session in this window. */
  const [glances, setGlances] = useState<Read<RunnerGlances & { sessionId: string }> | null>(null);

  useEffect(() => {
    if (store === null || sessionId === null) return undefined;
    return openSessionInto(store, sessionId, (what) => setReading({ from: store, what }));
  }, [store, sessionId]);

  useEffect(() => {
    if (store === null) return undefined;
    return readSubstitutionPoolInto(store, (what) => setPool({ from: store, what }));
  }, [store]);

  // KEYED ON THE STORE ALONE, as the substitution pool is: the register is the coach's own people and
  // has nothing to do with which session is open, so re-reading it per session would be a read that
  // could only ever hand back the same answer.
  useEffect(() => {
    if (store === null) return undefined;
    return readArrivalRegisterInto(store, (what) => setRegister({ from: store, what }));
  }, [store]);

  const onMoved = useCallback(
    (readBack: SessionReadBack) => {
      if (store === null || sessionId === null) return;
      setMoved({ from: store, what: { ...readBack, sessionId } });
    },
    [store, sessionId],
  );

  /**
   * WHOSE HISTORY TO READ, as a STABLE key rather than as the roster array itself.
   *
   * Every recorded fact hands back a fresh view with a fresh `client_ids` array, and an effect keyed on
   * that array would re-read three people's previous sessions on every press. The people in the room
   * change when somebody is added or removed and not when a load is written down, so the key is the
   * identities and not the object that carries them. It comes from the OPENING read for the same
   * reason: the roster is what the session says it is, not what the last move handed back.
   */
  const attending = reading !== null && reading.from === store
    ? reading.what.view?.client_ids ?? []
    : [];
  const attendingKey = attending.join(',');

  useEffect(() => {
    if (store === null || sessionId === null || attendingKey.length === 0) return undefined;
    // EXCLUDING THIS SESSION IS THE WHOLE POINT. `previousSessionForClient` will return a session that
    // is still `in_progress` — deliberately, because an interrupted session is history too — so asked
    // plainly from inside a running one it hands back the session he is looking at.
    return readGlancesInto(
      store,
      attendingKey.split(','),
      { excludeSessionId: sessionId },
      (what) => setGlances({ from: store, what: { ...what, sessionId } }),
    );
  }, [store, sessionId, attendingKey]);

  const known = opening.state === 'open';
  const found = reading !== null && reading.from === store ? reading.what : null;
  const answered = found !== null && found.outcome.session_id === sessionId;
  const since = moved !== null && moved.from === store && moved.what.sessionId === sessionId
    ? moved.what
    : null;
  // WHAT IS ON THE RECORD NOW: the read-back from the last move where there has been one, and the
  // opening read otherwise. Both come from the same handle and the same projection.
  const view = since?.view ?? found?.view ?? null;
  const exerciseNames = since?.exerciseNames ?? found?.exerciseNames ?? new Map<string, string>();
  // FROM THE OPENING READ, exactly as `clientNames` and `routineName` are, and deliberately NOT
  // refreshed by a move: an exercise's own defaults are library content and recording a fact against
  // a line does not change what that exercise is normally done at. `exerciseNames` is re-read after a
  // move because a SUBSTITUTION can put a key on the row that the session did not mention before;
  // the lines a prescription is resolved for come from the routine and do not move.
  const exerciseDefaults = found?.exerciseDefaults ?? new Map<string, ExerciseDefaults>();
  const report = answered && view !== null
    ? describeSession(view as never, {
      clientNames: found.clientNames,
      exerciseNames,
      exerciseDefaults,
      routineName: found.routineName,
    })
    : null;
  const opened = answered ? describeOpening(found.outcome) : null;

  /**
   * THE GROUND A CURVE IS SHAPED ON, read once the session is open.
   *
   * AFTER the session and not beside it: the routine comes off the live handle this window is holding,
   * which `runner-source.ts` puts there on the handover and fills in on a cold arrival, so there is
   * nothing to read until one of those has happened. Keyed to the store AND the session, so arriving at
   * a different session cannot shape a curve across the previous one's routine.
   *
   * `clientNames` comes from the OPENING read, for the same reason the glances' roster does: it is what
   * the session says it is, and it does not change because a load was written down.
   */
  const openedNames = found?.clientNames ?? null;
  useEffect(() => {
    if (store === null || sessionId === null || openedNames === null) return undefined;
    return readGroundInto(store, sessionId, openedNames, (what) => {
      setGround({ from: store, what: { ...what, sessionId } });
    });
  }, [store, sessionId, openedNames]);

  const heldGround = ground !== null && ground.from === store
    && ground.what.sessionId === sessionId ? ground.what : null;

  /**
   * HE PRESSED A CURVE. Nothing is written, and nothing could be — see `intensity-source.ts`.
   *
   * The whole act is a read: everybody's recent record, then the adapter, then a panel. A refusal comes
   * back as a value and lands as a sentence rather than as a panel that goes blank.
   */
  const pressCurve = useCallback(
    (patternId: string) => {
      if (store === null || sessionId === null || heldGround === null) return;
      setIntensity((held) => shaping(held, patternId));
      void shapeTheCurve(store, sessionId, patternId, heldGround, attendingKey.split(','))
        .then((result) => {
          setIntensity((held) => (result.proposal !== null
            ? showing(held, result.proposal)
            : refusedToShape(held, result.refusal ?? { headline: COULD_NOT_SHAPE, detail: null })));
        });
    },
    [store, sessionId, heldGround, attendingKey],
  );

  /**
   * HE ACCEPTED IT, AND THIS WRITES NOTHING.
   *
   * It fills the lines in and puts them in the curve's order. A fact still reaches the record only when
   * he presses Record on a line, with the numbers in front of him, through the same verb every other
   * move goes through. That is why nothing here confirms anything: there is nothing to confirm.
   *
   * THE WHOLE ACCEPTANCE IS COMPUTED BEFORE EITHER setState IS CALLED, and that is not a style
   * preference. React re-invokes an updater, so anything with an effect inside one happens twice — a
   * measured defect on this build (s6/a6, where an updater rang the chime twice with every suite green).
   * `accepted()` is pure and both calls below are plain replacements of a value.
   */
  const acceptCurve = useCallback(() => {
    const proposal = intensity.showing;
    if (proposal === null) return;
    const acceptance = acceptTheCurve(intensity, proposal, controls);
    setControls(acceptance.controls);
    setIntensity((held) => holding(held, acceptance));
  }, [intensity, controls]);

  /** He rejected it outright, and lands back exactly where he was. There is nothing to undo. */
  const rejectCurve = useCallback(() => setIntensity(rejected), []);

  /**
   * He set an accepted shape aside: the routine's own order comes back and the curve's numbers go,
   * except on a line he has since changed himself. Computed once, then two plain replacements.
   */
  const setCurveAside = useCallback(() => {
    const done = setAside(intensity, controls);
    setControls(done.controls);
    setIntensity(done.state);
  }, [intensity, controls]);

  return (
    <div className="screen">
      <section className="card stack" aria-labelledby="screen-session">
        {/* The heading is drawn in every state, so a coach who arrived from a stale link still knows
            where he is even when the screen cannot tell him anything else. */}
        <div className="inline">
          <Glyph name="session-start" size="lead" decorative />
          <h2 id="screen-session" className="title-screen">
            {report === null ? RUNNER_TITLE : report.heading}
          </h2>
        </div>

        {!known ? (
          <LocalStoreNotice opening={opening} />
        ) : sessionId === null ? (
          <>
            <p className="screen-intro read">{NO_SESSION_OPEN}</p>
            <p className="muted read">{NO_SESSION_OPEN_WHAT_TO_DO}</p>
          </>
        ) : opened === null ? (
          <p className="note read">
            <Glyph name="sync-pending" size="inline" decorative />
            <span>{OPENING_WORDS}</span>
          </p>
        ) : !opened.open ? (
          <>
            {/*
              THE CORE'S OWN SENTENCE, VERBATIM. `openSession` writes one for every reason it can
              refuse and this screen shows that one — a second version written here would be two
              sentences about one refusal, drifting apart, and the one he read would depend on which
              screen he happened to be on.
            */}
            <p className="note note-danger read">
              <Glyph name="sync-failed" size="inline" decorative />
              <span>{opened.headline}</span>
            </p>
            {opened.whatToDo !== null && <p className="muted read">{opened.whatToDo}</p>}
          </>
        ) : report === null ? (
          <p className="note read">
            <Glyph name="sync-pending" size="inline" decorative />
            <span>{OPENING_WORDS}</span>
          </p>
        ) : (
          <>
            {/* WHO IS HERE AND WHAT THE RECORD SAYS THE SESSION'S STATE IS, folded into one meta
                line — two facts that used to be two stacked paragraphs. The stored-fact count that
                used to sit under them is dropped: what it verified (a clean resume) is now simply
                true or the screen above it would already be showing a refusal. */}
            <p className="muted read">{roomStateWords(report.attendees, report.stateWords)}</p>

            {/* THE JOINING LINK, when this session carries one — minted or pasted, the record's own
                copy. Printed HERE because this is the screen he is on when the client asks for it. */}
            {view !== null && joiningLinkOf(view as never) !== null && (
              <JoiningLinkLine url={joiningLinkOf(view as never) as string} />
            )}
            {report.routineUnknownWords !== null && (
              <p className="note read">
                <Glyph name="note" size="inline" decorative />
                <span>{report.routineUnknownWords}</span>
              </p>
            )}

            {/*
              THE SCREEN'S OWN CONTROL ROW — sounds, a note about the session, a late arrival, and the
              finish control, as compact icon/label buttons rather than four stacked cards each with
              its own heading and paragraph. Every explanation that named a real constraint moved into
              that control's own tooltip; the rest — reassurance a professional coach does not need
              read back to him on every render — is cut. Nothing about what each control DOES, writes
              or refuses changed; `SoundOffer`, `SessionNoteCapture`, `SessionArrival` and
              `SessionEnding` still own their every judgement and every write.
            */}
            <div className="row-actions">
              <SoundOffer port={port} unlocked={unlocked} setUnlocked={setUnlocked} />

              {store !== null && sessionId !== null && (
                <SessionNoteCapture
                  store={store}
                  sessionId={sessionId}
                  state={captures}
                  setState={setCaptures}
                  onCaptured={onMoved}
                />
              )}

              {/*
                SOMEBODY ARRIVED AFTER IT STARTED, which is an ordinary thing that happens to a coach
                with a group in front of him — and until this was wired the application REFUSED to
                record against them and told him to add them first, while offering no way to do it.
                `addClient` had been built and called by no file under `src/` at all.
              */}
              {store !== null && sessionId !== null && (
                <SessionArrival
                  store={store}
                  sessionId={sessionId}
                  register={register !== null && register.from === store ? register.what : null}
                  attending={attending}
                  state={arrival}
                  setState={setArrival}
                  onMoved={onMoved}
                />
              )}

              {/*
                THE ONE CONTROL THAT ENDS A SESSION, and until it was wired NOTHING IN THIS
                APPLICATION DID: `complete()` had been built and called by no screen, so every session
                the coach started sat under "Sessions you have not finished" forever.

                IT WRITES `complete()` AND NOTHING ELSE. Leaving this screen is already what
                `interrupt()` means and already happens by itself.
              */}
              {store !== null && sessionId !== null && (
                <SessionEnding
                  store={store}
                  sessionId={sessionId}
                  report={report}
                  state={ending}
                  setState={setEnding}
                  onMoved={onMoved}
                />
              )}
            </div>

            {report.sessionNotes.length > 0 && (
              <ul className="rows">
                {report.sessionNotes.map((words) => (
                  <li key={words} className="row row-static row-wrap">
                    <span className="row-sentence">{words}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <WayBack />
      </section>

      {/*
        THE TWO-COLUMN LAYOUT — the WORK column (every attendee's own routine, in reach in one tap,
        then the curve that would shape the whole session) beside the CAPTURE column (every
        attendee's previous session, readings and notes), matching the console mockup's
        `.two-column`. It collapses to one column below 840px in `console.css`, the same boundary
        the rail itself branches at — never a second, different design, only a narrower one.
      */}
      {report !== null && view !== null && store !== null && sessionId !== null && (
        <div className="two-column">
          <div className="stack">
            {report.attendees.map((attendee) => (
              <AttendeeWork
                key={attendee.clientId}
                attendee={attendee}
                store={store}
                sessionId={sessionId}
                view={view}
                exerciseNames={exerciseNames}
                pool={pool !== null && pool.from === store ? pool.what : null}
                controls={controls}
                setControls={setControls}
                onMoved={onMoved}
                captures={captures}
                setCaptures={setCaptures}
                glances={glances !== null && glances.from === store
                  && glances.what.sessionId === sessionId ? glances.what : null}
                timers={timers}
                setTimers={setTimers}
                port={port}
                unlocked={unlocked}
                intensity={intensity}
              />
            ))}

            {/*
              SHAPE THE WHOLE SESSION, after every attendee's own rows — the console mockup's order.
              Drawn ONCE for the whole screen rather than in anybody's card, because a curve shapes the
              session — one routine, however many people are in the room — and a control inside
              somebody's card would read as shaping it for that person alone. The per-person NUMBERS
              are per person, inside the panel, because calibration is.

              IT PROPOSES AND THE COACH DISPOSES. Pressing a curve draws a panel and changes nothing;
              accepting one fills the lines in and still writes nothing; and a fact reaches the record
              only when he presses Record on a line. See `intensity.ts` for why each of those is
              structural here rather than a promise.
            */}
            <IntensityToggles
              curves={heldGround === null ? null : heldGround.curves}
              state={intensity}
              onPress={pressCurve}
              onSetAside={setCurveAside}
            />

            {intensity.showing !== null && (
              <ProposalPanel
                proposal={intensity.showing}
                state={intensity}
                setState={setIntensity}
                onAccept={acceptCurve}
                onReject={rejectCurve}
              />
            )}
          </div>

          <div className="stack">
            {report.attendees.map((attendee) => (
              <AttendeeCapture
                key={attendee.clientId}
                attendee={attendee}
                store={store}
                sessionId={sessionId}
                view={view}
                exerciseNames={exerciseNames}
                pool={pool !== null && pool.from === store ? pool.what : null}
                controls={controls}
                setControls={setControls}
                onMoved={onMoved}
                captures={captures}
                setCaptures={setCaptures}
                glances={glances !== null && glances.from === store
                  && glances.what.sessionId === sessionId ? glances.what : null}
                timers={timers}
                setTimers={setTimers}
                port={port}
                unlocked={unlocked}
                intensity={intensity}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
