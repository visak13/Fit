/**
 * READINGS, NOTES AND THE PREVIOUS SESSION AT A GLANCE — drawn on the runner, beside the six moves.
 *
 * This file is the DRAWING and nothing else. Every judgement — what each control says, what a reading
 * is worth, which unit a kind is measured in, what a refusal reads as, and above all WHERE HE IS — is
 * decided in `session-readings.ts`, and every write goes through `session-readings-source.ts`, where
 * both are asserted with no browser and no rendering at all. The same split as `screens/removals.ts`
 * against `screens/RemovalsScreen.tsx`.
 *
 * ## THE PROPERTY THIS FILE EXISTS TO NOT BREAK
 *
 * `core/session/SESSION.md` §6 hands it over in as many words: capturing a reading for one client must
 * not lose the coach's place. Four things in a drawing throw a place away, and each is avoided here
 * deliberately rather than by luck:
 *
 *   1. **A panel that closes when the write lands.** It does not. `readingRecorded` keeps it open and
 *      keeps the person selected; what clears is the number.
 *   2. **A line that APPEARS.** The panel's status line is drawn from the moment the panel opens, so
 *      recording changes its words rather than the height of everything above the routine.
 *   3. **A list that grows above where he is looking.** What was recorded is drawn at the BOTTOM of the
 *      person's card, below their exercises, so a new reading pushes nothing he was reading downwards.
 *   4. **A component that remounts.** Nothing here is keyed by anything that changes when the session
 *      is read back, and there is no `autoFocus`, no `scrollIntoView` and no scrolling of any kind —
 *      each of which moves the page under his thumb. The suite scans this file for all three.
 *
 * ## IT SHOWS. IT DOES NOT SUGGEST
 *
 * The previous session panel is the screen in this application where adding a suggestion would feel
 * most helpful, and there is none: no proposed load, no longer hold, no comparison of two sessions, and
 * nothing carried forward as a default. Its words come from `launcher.ts`, which the calendar already
 * shows the same panel through — ONE wording of one truth, rather than a second one here free to drift
 * into helpfulness.
 *
 * ## PER CLIENT, ALWAYS
 *
 * Every control is inside the card of the person it is about, so there is no shared selector that could
 * silently reselect somebody. A note is the one thing that has a second home: a note about the SESSION
 * belongs to nobody in particular, so it is drawn once on the session's own card and never inside a
 * person's.
 */

import { Glyph } from '../design/Glyph';
import { Tooltip } from '../design/Tooltip';
import { SECTION_TITLES, describeGlance } from './launcher';
import type { GlanceReport } from './launcher';
import { recordTheNote, recordTheReading } from './session-readings-source';
import type { GlanceForRunner, RunnerGlances } from './session-readings-source';
import {
  CAPTURE_INTRO, CUSTOM_KIND, CUSTOM_KIND_HINT, CUSTOM_KIND_LABEL, GLANCE_LESS_LABEL,
  GLANCE_MORE_LABEL, GLANCE_READING_WORDS, LEAVE_IT_LABEL, NOTES_TAKEN_TITLE,
  NOTE_ABOUT_CLIENT_LABEL, NOTE_ABOUT_CLIENT_TITLE, NOTE_ABOUT_SESSION_LABEL,
  NOTE_ABOUT_SESSION_TITLE, NOTE_ABOUT_SESSION_WORDS, NOTE_RECORDED_WORDS, NOTHING_RECORDED_YET,
  READINGS_TAKEN_TITLE, READING_FIELD_LABELS, READING_KINDS_OFFERED, READING_KIND_LABELS,
  READING_LABEL, READING_TITLE, RECORD_NOTE_LABEL, RECORD_READING_LABEL, UNITS_OFFERED,
  WHEN_LABELS, WHEN_OFFERED, captureKey, capturing, captureRefused,
  changeNote, changeReading, closeCapture, confirmationFor, glanceIsOpen, isCustomKind, kindOfDraft,
  noteAboutClientWords, noteDraftOf, noteFromDraft, noteKey, noteProblem, noteProblemShown,
  noteRecorded, notesOf, openCapture, readingDraftOf, readingFromDraft, readingProblem,
  readingProblemShown, readingRecorded, readingRecordedWords, readingWhoseWords, readingWords,
  readingsOf, refusalFor, toggleGlance, unitOfDraft, valueLabel,
} from './session-readings';
import type { CaptureState, ProjectedForCapture, RefusalWords } from './session-readings';
import type { Dispatch, SetStateAction } from 'react';
import type { MoveResult, SessionReadBack } from './modular-control-source';
import type { LocalStore } from '../../core/store/store.js';

/** What every capture control needs to reach the record and hand the session back. */
interface CaptureWiring {
  readonly store: LocalStore;
  readonly sessionId: string;
  readonly state: CaptureState;
  readonly setState: Dispatch<SetStateAction<CaptureState>>;
  /** The session as it stands after a capture landed — the same seam the six moves publish through. */
  readonly onCaptured: (reading: SessionReadBack) => void;
}

/**
 * COMMIT ONE CAPTURE, AND LET THE SCREEN SEE THE RECORD RATHER THAN THE PRESS.
 *
 * The one place a capture is committed from, so no control can grow its own quieter handling of a
 * refusal. `settle` is what the state becomes when it landed — and every one of those keeps his place,
 * which is the property `capturePlace` exists to let the suite assert.
 */
async function commit(
  wiring: CaptureWiring,
  key: string,
  write: () => Promise<MoveResult>,
  settle: (held: CaptureState) => CaptureState,
): Promise<void> {
  const { setState, onCaptured } = wiring;
  setState((held) => capturing(held, true));
  const result = await write();
  if (result.reading !== null) onCaptured(result.reading);
  setState((held) => {
    if (!result.ok) {
      return captureRefused(held, key, result.refusal ?? {
        headline: 'That could not be recorded on this device.', detail: null, journalFull: false,
      });
    }
    // A capture that landed but could not be read back is still a capture that landed, and its own
    // sentence says so; reporting it as a failure would have him record the same fact twice.
    const settled = settle(held);
    return result.refusal === null ? settled : captureRefused(settled, key, result.refusal);
  });
}

/**
 * THE PANEL'S OWN STATUS LINE, DRAWN FROM THE MOMENT THE PANEL OPENS.
 *
 * Not conditional on anything having been recorded — see the header, point 2. `role="status"` so the
 * consequence of a press is announced rather than only shown, which is the same reason the refusals on
 * the six moves carry one.
 */
function CaptureStatus({ words }: { readonly words: string }) {
  // `status-held` RESERVES two lines of height. Measured at 390px: this line went from one line to two
  // when a reading landed, the panel grew 26px, and the routine below it moved at the moment he pressed
  // Record. Chromium's scroll anchoring hid that exactly; WebKit has no such thing, and this build is
  // designed to the weaker iOS baseline by a recorded decision.
  return (
    <p className="muted read status-held" role="status">{words}</p>
  );
}

/** A refusal, where it happened. The journal being full is a real state and reads as its own words. */
function CaptureRefusal({ refusal }: { readonly refusal: RefusalWords }) {
  return (
    <div
      className={refusal.journalFull
        ? 'note note-warning read row-panel'
        : 'note note-danger read row-panel'}
      role="status"
    >
      <Glyph name={refusal.journalFull ? 'note' : 'sync-failed'} size="inline" decorative />
      <div className="stack-tight">
        <span>{refusal.headline}</span>
        {refusal.detail !== null && <span className="muted">{refusal.detail}</span>}
      </div>
    </div>
  );
}

/** What one person's capture controls need. */
interface ClientCaptureProps extends CaptureWiring {
  readonly clientId: string;
  readonly clientName: string;
}

/**
 * THE TWO CONTROLS AND THEIR PANELS, INSIDE ONE PERSON'S CARD.
 *
 * Inside the card rather than at the top of the screen, because a shared control would need a person
 * chosen beside it and a chosen person is a thing that can be silently reselected. There is nothing to
 * reselect here: the card he is in IS the person.
 */
export function ClientCapture(props: ClientCaptureProps) {
  const { clientId, clientName, state, setState } = props;
  const open = state.open;
  const readingOpen = open !== null && open.kind === 'reading' && open.clientId === clientId;
  const noteOpen = open !== null && open.kind === 'note' && open.clientId === clientId;

  const readingKey = captureKey('reading', clientId);
  const theNoteKey = noteKey(clientId);
  const draft = readingDraftOf(state, clientId);
  // TWO READINGS OF ONE DRAFT, and they are different questions. `readingProblem` is whether it can be
  // RECORDED, which is what the control obeys; `readingProblemShown` is whether he has made a mistake
  // worth telling him about, which a box he has not typed into yet is not.
  const problem = readingProblem(draft);
  const shownProblem = readingProblemShown(draft);
  const noteText = noteDraftOf(state, clientId);
  const noteIssue = noteProblem(noteText);
  const shownNoteIssue = noteProblemShown(noteText);

  const pressRecordReading = () => {
    const values = readingFromDraft(draft);
    if (values === null) return;
    // Worded BEFORE the write, from the draft that is about to be cleared. The same numbers reach the
    // record and the sentence, so what he is told is what went in.
    const said = readingRecordedWords(
      readingWords(kindOfDraft(draft), values.value, unitOfDraft(draft)),
    );
    void commit(
      props,
      readingKey,
      () => recordTheReading(props.store, props.sessionId, clientId, values),
      (held) => readingRecorded(held, clientId, said),
    );
  };

  const pressRecordNote = () => {
    const text = noteFromDraft(noteText);
    if (text === null) return;
    void commit(
      props,
      theNoteKey,
      () => recordTheNote(props.store, props.sessionId, clientId, text),
      (held) => noteRecorded(held, clientId, NOTE_RECORDED_WORDS),
    );
  };

  return (
    <>
      <p className="row-actions">
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={state.recording}
          aria-expanded={readingOpen}
          onClick={() => setState((held) => openCapture(held, { kind: 'reading', clientId }))}
        >
          <Glyph name="reading-heart-rate" size="dense" decorative />
          <span>{READING_LABEL}</span>
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={state.recording}
          aria-expanded={noteOpen}
          onClick={() => setState((held) => openCapture(held, { kind: 'note', clientId }))}
        >
          <Glyph name="note" size="dense" decorative />
          <span>{NOTE_ABOUT_CLIENT_LABEL}</span>
        </button>
      </p>

      {readingOpen && (
        <section className="card-tight stack row-panel">
          <h4 className="title-section">{READING_TITLE}</h4>
          <p className="muted read">{readingWhoseWords(clientName)}</p>

          <div className="field">
            <label htmlFor={`reading-kind-${clientId}`}>{READING_FIELD_LABELS.kind}</label>
            <select
              id={`reading-kind-${clientId}`}
              value={draft.kind}
              onChange={(event) => setState((held) => changeReading(held, 'kind', event.target.value))}
            >
              {READING_KINDS_OFFERED.map((kind) => (
                <option key={kind} value={kind}>{READING_KIND_LABELS[kind] ?? kind}</option>
              ))}
              {/* HIS OWN KIND, offered last. The vocabulary is open on purpose — everything in this
                  application is his to configure — and a kind he invents must name its own unit. */}
              <option value={CUSTOM_KIND}>{CUSTOM_KIND_LABEL}</option>
            </select>
          </div>

          {isCustomKind(draft) && (
            <>
              <div className="field">
                <label htmlFor={`reading-own-kind-${clientId}`}>
                  {READING_FIELD_LABELS.customKind}
                </label>
                <input
                  id={`reading-own-kind-${clientId}`}
                  type="text"
                  autoComplete="off"
                  value={draft.customKind}
                  onChange={(event) => setState((held) =>
                    changeReading(held, 'customKind', event.target.value))}
                />
                <p className="field-hint read">{CUSTOM_KIND_HINT}</p>
              </div>
              <div className="field">
                <label htmlFor={`reading-own-unit-${clientId}`}>
                  {READING_FIELD_LABELS.customUnit}
                </label>
                <select
                  id={`reading-own-unit-${clientId}`}
                  value={draft.customUnit}
                  onChange={(event) => setState((held) =>
                    changeReading(held, 'customUnit', event.target.value))}
                >
                  {UNITS_OFFERED.map((unit) => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* THE UNIT IS CARRIED BY THE LABEL AND NOT ASKED FOR on a kind the app knows:
              `READING_KINDS` pins it, and offering him a choice would let a plank be recorded in beats
              per minute by a mis-tap. In the label rather than in a line under the field, because a
              line under every field is how a panel outgrows the phone it is read on. */}
          <div className="field">
            <label htmlFor={`reading-value-${clientId}`}>{valueLabel(draft)}</label>
            <input
              id={`reading-value-${clientId}`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={draft.value}
              onChange={(event) => setState((held) =>
                changeReading(held, 'value', event.target.value))}
            />
          </div>

          <div className="field">
            <label htmlFor={`reading-when-${clientId}`}>{READING_FIELD_LABELS.when}</label>
            <select
              id={`reading-when-${clientId}`}
              value={draft.when}
              onChange={(event) => setState((held) => changeReading(held, 'when', event.target.value))}
            >
              {WHEN_OFFERED.map((when) => (
                <option key={when} value={when}>{WHEN_LABELS[when] ?? when}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor={`reading-note-${clientId}`}>{READING_FIELD_LABELS.note}</label>
            <input
              id={`reading-note-${clientId}`}
              type="text"
              autoComplete="off"
              value={draft.note}
              onChange={(event) => setState((held) =>
                changeReading(held, 'note', event.target.value))}
            />
          </div>

          <p className="row-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={state.recording || problem !== null}
              onClick={pressRecordReading}
            >
              {RECORD_READING_LABEL}
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => setState(closeCapture)}
            >
              {LEAVE_IT_LABEL}
            </button>
          </p>

          <CaptureStatus words={confirmationFor(state, readingKey) ?? NOTHING_RECORDED_YET} />
          {shownProblem !== null && (
            <p className="note note-warning read" role="status">
              <Glyph name="note" size="inline" decorative />
              <span>{shownProblem}</span>
            </p>
          )}
          {refusalFor(state, readingKey) !== null && (
            <CaptureRefusal refusal={refusalFor(state, readingKey) as RefusalWords} />
          )}
        </section>
      )}

      {noteOpen && (
        <NotePanel
          panelId={`note-${clientId}`}
          title={NOTE_ABOUT_CLIENT_TITLE}
          words={noteAboutClientWords(clientName)}
          text={noteText}
          problem={noteIssue}
          shownProblem={shownNoteIssue}
          status={confirmationFor(state, theNoteKey) ?? NOTHING_RECORDED_YET}
          refusal={refusalFor(state, theNoteKey)}
          recording={state.recording}
          setState={setState}
          onRecord={pressRecordNote}
        />
      )}
    </>
  );
}

/**
 * WHAT WAS RECORDED FOR ONE PERSON IN THIS SESSION.
 *
 * Drawn at the BOTTOM of their card, below their exercises, and that placement is the point rather
 * than a preference: a row appearing above where he is reading pushes the routine down under his
 * thumb at the moment he presses Record. See the header, point 3.
 *
 * Their OWN readings and notes, read out of their own slice of the projection. Nobody else's can
 * appear here because nobody else's is asked for.
 */
export function ClientRecorded(props: {
  readonly view: ProjectedForCapture;
  readonly clientId: string;
}) {
  const { view, clientId } = props;
  const readings = readingsOf(view, clientId);
  const notes = notesOf(view, clientId);

  return (
    <>
      {readings.length > 0 && (
        <>
          <h4 className="title-section">{READINGS_TAKEN_TITLE}</h4>
          <ul className="rows">
            {readings.map((reading) => (
              <li key={reading.recordId} className="row row-static row-wrap">
                <Glyph name={reading.glyph} size="dense" decorative />
                <span className="row-name">{reading.words}</span>
                {/* Said only when it was taken after the session, because during it is the ordinary
                    case and marking every row with it would be four hundred rows of noise. */}
                {reading.whenWords !== null && (
                  <span className="chip"><span>{reading.whenWords}</span></span>
                )}
                {reading.note !== null && (
                  <span className="row-value">{reading.note}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {notes.length > 0 && (
        <>
          <h4 className="title-section">{NOTES_TAKEN_TITLE}</h4>
          <ul className="rows">
            {notes.map((note) => (
              <li key={note.recordId} className="row row-static row-wrap">
                <span className="row-sentence">{note.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/**
 * A NOTE ABOUT THE SESSION AS A WHOLE, drawn once on the session's own card.
 *
 * Once, and not inside anybody's card, because the core distinguishes a note about one person from a
 * note about the session and nothing infers one from the other. A control for it sitting in Priya's
 * card would be an invitation to record her note as the session's.
 */
export function SessionNoteCapture(props: CaptureWiring) {
  const { state, setState } = props;
  const open = state.open;
  const isOpen = open !== null && open.kind === 'note' && open.clientId === null;
  const key = noteKey(null);
  const text = noteDraftOf(state, null);
  const problem = noteProblem(text);
  const shownProblem = noteProblemShown(text);

  const pressRecord = () => {
    const recorded = noteFromDraft(text);
    if (recorded === null) return;
    void commit(
      props,
      key,
      () => recordTheNote(props.store, props.sessionId, null, recorded),
      (held) => noteRecorded(held, null, NOTE_RECORDED_WORDS),
    );
  };

  return (
    <>
      {/* THE TRIGGER, COMPACT — one control among the screen's own row rather than a card of its
          own. `CAPTURE_INTRO` used to sit above it as a permanent paragraph; the one fact in it that
          is not reassurance — that recording leaves the session exactly where it is on screen — is
          the tooltip now, reachable rather than read every time this card renders. */}
      <Tooltip text={CAPTURE_INTRO}>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={state.recording}
          aria-expanded={isOpen}
          onClick={() => setState((held) => openCapture(held, { kind: 'note', clientId: null }))}
        >
          <Glyph name="note" size="dense" decorative />
          <span>{NOTE_ABOUT_SESSION_LABEL}</span>
        </button>
      </Tooltip>

      {isOpen && (
        <div className="row-panel">
          <NotePanel
            panelId="note-the-session"
            title={NOTE_ABOUT_SESSION_TITLE}
            words={NOTE_ABOUT_SESSION_WORDS}
            text={text}
            problem={problem}
            shownProblem={shownProblem}
            status={confirmationFor(state, key) ?? NOTHING_RECORDED_YET}
            refusal={refusalFor(state, key)}
            recording={state.recording}
            setState={setState}
            onRecord={pressRecord}
          />
        </div>
      )}
    </>
  );
}

/**
 * ONE PERSON'S PREVIOUS SESSION.
 *
 * The words are `launcher.ts`'s, because the calendar shows this same panel while he chooses and one
 * panel with two wordings would drift — and the one that drifted into proposing something would be
 * whichever screen he happened to be on.
 *
 * The line-by-line list is behind a control WITH ITS COUNT IN THE WORDS, which is this build's one
 * answer to a screen holding more than fits: the headline, the partial-record mark, the loads and the
 * readings are drawn always, and what is folded away is accounted for out loud rather than silently
 * absent. Measured on a phone: three attendees each showing a whole previous session above their own
 * routine buried the session he is running.
 */
export function PreviousSession(props: {
  readonly found: GlanceForRunner | null;
  readonly clientName: string;
  readonly exerciseNames: ReadonlyMap<string, string>;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  const { found, clientName, exerciseNames, expanded, onToggle } = props;

  // NOT a first session, and not an empty panel: a history that has not been read yet is a different
  // fact from a client who has never trained, and drawing the second for the first would tell him a
  // regular client has no past.
  if (found === null) {
    return (
      <div className="stack-tight">
        <h4 className="title-section">{SECTION_TITLES.glance}</h4>
        <p className="muted read">{GLANCE_READING_WORDS}</p>
      </div>
    );
  }

  const report: GlanceReport = describeGlance(
    found.clientId, clientName, found.glance, found.routineName, exerciseNames,
  );

  return (
    <div className="stack-tight">
      <h4 className="title-section">{SECTION_TITLES.glance}</h4>
      <p className="read"><strong>{report.headline}</strong></p>

      {report.partialWords !== null && (
        <p className="note read">
          <Glyph name="session-pause" size="inline" decorative />
          <span>{report.partialWords}</span>
        </p>
      )}

      {report.nothingRecorded !== null && <p className="muted read">{report.nothingRecorded}</p>}

      {/* HIS OWN OBSERVATIONS, verbatim. Nothing is derived from them, nothing is compared with this
          session, and nothing is carried into the numbers on the lines below. */}
      {report.loads.length > 0 && (
        <p className="muted read">{report.loads.join(' · ')}</p>
      )}

      {/*
        THE READINGS ARE WORDED HERE AND NOT TAKEN FROM `report.readings`, and that is the one place
        this panel departs from the calendar's.

        `describeGlance` words a reading as its own content key — "heart-rate 128bpm" — which is a
        machine's word for something the coach named, on a panel he reads with a client in front of
        him. It is the same defect a substitute's name was found with on this screen (s6/a4). It is not
        corrected in `launcher.ts` because that module has NO imports at all, deliberately: it is pure
        judgement with nothing to drift against, and reaching into this file for a label would end
        that. So the words come from {@link readingWords}, which is also what a reading recorded on
        this screen reads back as — one wording for a reading, on the surface that owns readings.
      */}
      {found.glance !== null && found.glance.readings.length > 0 && (
        <p className="inline muted read">
          <Glyph name="reading-heart-rate" size="inline" decorative />
          <span>
            {found.glance.readings
              .map((reading) => readingWords(reading.kind, reading.value, reading.unit))
              .join(' · ')}
          </span>
        </p>
      )}

      {report.performed.length > 0 && (
        <>
          <p>
            <button type="button" className="btn btn-quiet btn-sm" aria-expanded={expanded} onClick={onToggle}>
              <Glyph name={expanded ? 'collapse' : 'expand'} size="dense" decorative />
              <span>
                {expanded
                  ? GLANCE_LESS_LABEL
                  : `${GLANCE_MORE_LABEL} (${report.performed.length})`}
              </span>
            </button>
          </p>
          {expanded && (
            <ul className="rows">
              {report.performed.map((words, at) => (
                // The list is one session in the order it ran; there is no identity on a line of it to
                // key by, and the order is the meaning.
                // eslint-disable-next-line react/no-array-index-key
                <li key={`${report.clientId}-did-${at}`} className="row row-static row-wrap">
                  <span className="row-sentence">{words}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** One person's previous session, or null while it is still being read. */
export function glanceFor(
  glances: RunnerGlances | null,
  clientId: string,
): GlanceForRunner | null {
  return glances?.items.find((each) => each.clientId === clientId) ?? null;
}

/** Whether one person's previous session is expanded, and the way to change that. */
export function glanceToggle(
  state: CaptureState,
  setState: Dispatch<SetStateAction<CaptureState>>,
  clientId: string,
): { readonly expanded: boolean; readonly onToggle: () => void } {
  return {
    expanded: glanceIsOpen(state, clientId),
    onToggle: () => setState((held) => toggleGlance(held, clientId)),
  };
}

// ── internals ───────────────────────────────────────────────────────────────────────────────────

/** A note, about one person or about the session. One panel, because it is one act on one record. */
function NotePanel(props: {
  readonly panelId: string;
  readonly title: string;
  readonly words: string;
  readonly text: string;
  /** Whether it can be RECORDED, which is what the control obeys. */
  readonly problem: string | null;
  /** Whether he has made a mistake worth telling him about, which an empty box is not. */
  readonly shownProblem: string | null;
  readonly status: string;
  readonly refusal: RefusalWords | null;
  readonly recording: boolean;
  readonly setState: Dispatch<SetStateAction<CaptureState>>;
  readonly onRecord: () => void;
}) {
  const {
    panelId, title, words, text, problem, shownProblem, status, refusal, recording, setState,
    onRecord,
  } = props;

  return (
    <section className="card-tight stack row-panel">
      <h4 className="title-section">{title}</h4>
      {/* WHAT A NOTE IS FOR AND WHAT MUST NOT GO IN IT, at the point of entry. The record's own header
          obliges the interface that draws it to say so: an in-session note is plaintext, and a
          free-text box invites clinical detail. */}
      <p className="muted read">{words}</p>

      <div className="field">
        <label htmlFor={`text-${panelId}`}>{title}</label>
        <textarea
          id={`text-${panelId}`}
          rows={3}
          value={text}
          onChange={(event) => setState((held) => changeNote(held, event.target.value))}
        />
      </div>

      <p className="row-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={recording || problem !== null}
          onClick={onRecord}
        >
          {RECORD_NOTE_LABEL}
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setState(closeCapture)}>
          {LEAVE_IT_LABEL}
        </button>
      </p>

      <CaptureStatus words={status} />
      {shownProblem !== null && (
        <p className="note note-warning read" role="status">
          <Glyph name="note" size="inline" decorative />
          <span>{shownProblem}</span>
        </p>
      )}
      {refusal !== null && <CaptureRefusal refusal={refusal} />}
    </section>
  );
}
