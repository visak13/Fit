/**
 * THE IN-SESSION CONTROLS — the six moves, drawn on one person's line.
 *
 * This file is the DRAWING and nothing else. Every judgement — what each control says, what a draft
 * is worth, which values a move records, what a refusal reads as — is decided in
 * `modular-control.ts`, and every write goes through `modular-control-source.ts`, where both are
 * asserted with no browser and no rendering at all. The same split as `screens/removals.ts` against
 * `screens/RemovalsScreen.tsx`.
 *
 * ## THREE CONTROLS FOR SIX MOVES, AND THAT IS THE DESIGN RATHER THAN A SHORTFALL
 *
 * Record, Skipped and Something else, plus Adjust for the values and Edit on a fact already recorded.
 * A JUMP is pressing Record on any line. A REORDER is pressing them in the order he actually works
 * in. A REPEAT is pressing Record on a line that already has something against it. None of those
 * three needs a control of its own, and giving them one would mean the application had an opinion
 * about where he was before he made the move.
 *
 * ## WHAT THIS SCREEN MAY NOT DRAW, AND THE FAMILY ALREADY HOLDS THE TEMPTATION
 *
 * `session-next-exercise` and `session-previous-exercise` are in the glyph family and are NOT used
 * here, deliberately. A next and a previous are a position in a script: they only mean anything if
 * the application knows where he is, and it does not and must not. `SESSION.md` §2 — anything
 * describing where a session has got to is DERIVED, never persisted, and where he is LOOKING is this
 * screen's own transient state. `modular-control.test.ts` asserts both glyphs are absent from this
 * file, and points the same scan at a glyph that IS here first so its silence means something.
 *
 * ## NOTHING IS ORDERED, DISABLED OR MARKED BY WHAT HAS BEEN RECORDED
 *
 * Every control is live on every line whatever has or has not been recorded against it or against any
 * other line — the whole set is refused only while a move is in flight, so that one press records one
 * fact. A line with nothing against it is not drawn as waiting for him and nothing floats it to the
 * top: `not_yet_recorded` is a statement about the RECORD, in the routine's declared order, which is
 * a default and not a script.
 *
 * ## PER CLIENT, AND THE PANEL OPENS IN PLACE
 *
 * The values panel is drawn INSIDE the line it belongs to, so adjusting repetitions, a timer or rest
 * mid-session never means leaving the exercise — the requirement, on a phone, with a client waiting.
 * The draft is keyed by person and line, so adapting an exercise for one tired client changes nothing
 * for anybody else in the room.
 */

import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { Glyph } from '../design/Glyph';
import { RECORD_STAND_IN_LABEL, withLevel } from './intensity';
import type { AcceptedLine } from './intensity';
import type { EffectivePrescription } from './effective-prescription';
import {
  CANCEL_LABEL, CONTROLS_INTRO, EDIT_LABEL, EDIT_WORDS, FIELD_HINTS, FIELD_LABELS,
  SAVE_EDIT_LABEL, SUBSTITUTE_FILTER_LABEL, SUBSTITUTE_MORE_THAN_SHOWN, SUBSTITUTE_NONE_MATCH,
  SUBSTITUTE_TITLE, SUBSTITUTE_WORDS, adjustWords, amendmentFromDraft, changeDraft, closePanel,
  controlsFor, draftKey, draftOf, draftProblem, editKey, lineDraft, noteForLine, openPanel,
  recorded, recording, refused, substituteRows, typeFilter, valuesForLine,
} from './modular-control';
import type {
  AttemptReport, ControlState, Draft, DraftField,
} from './modular-control';
import {
  amendTheAttempt, recordTheLine, skipTheLine, substituteTheLine,
} from './modular-control-source';
import type { MoveResult, SessionReadBack, SubstitutionPool } from './modular-control-source';
import type { LocalStore } from '../../core/store/store.js';

/** Which fields a panel offers. A skip records no work, so the note is all a skip could carry. */
const VALUE_FIELDS: readonly DraftField[] = [
  'sets', 'repetitions', 'durationSeconds', 'restSeconds', 'observedLoad', 'note',
];

/**
 * WHAT THE CONTROLS DO, once for the whole set.
 *
 * Drawn above one person's lines rather than on each of them. Permanent, at the reading floor: a
 * control whose consequence only becomes visible after pressing it is one he has to learn by damaging
 * a record, and this is used with a client waiting.
 */
export function ControlsIntro() {
  return <p className="muted read">{CONTROLS_INTRO}</p>;
}

/** What one line's controls need. */
interface LineControlsProps {
  readonly store: LocalStore;
  readonly sessionId: string;
  readonly clientId: string;
  /** The line's own exercise, which is what a move is recorded against. */
  readonly exerciseId: string;
  /**
   * WHAT THIS LINE IS PRESCRIBED AT, which is what Record writes when he has changed nothing.
   *
   * The RESOLVED prescription off `runner.ts`'s `LineReport.effective` — the exercise's own defaults
   * with the routine's overrides on top — and never the routine's overrides on their own. That is
   * what makes this panel open with numbers in it on a line the routine did not override, which is
   * most of them, and it carries where each number came from so the panel can say so.
   */
  readonly prescription: EffectivePrescription | null;
  /** Every attempt already on the record for this line, each with its own way to be corrected. */
  readonly attempts: readonly AttemptReport[];
  /** The exercises that can stand in for this one, or null while the library is being read. */
  readonly pool: SubstitutionPool | null;
  readonly state: ControlState;
  readonly setState: Dispatch<SetStateAction<ControlState>>;
  /** The session as it stands after a move landed. */
  readonly onMoved: (reading: SessionReadBack) => void;
  /**
   * THE CURVE HE ACCEPTED FOR THIS LINE, or null when he has accepted none for it.
   *
   * Three things follow from it and each is visible before he presses anything: the numbers the line
   * offers, the LEVEL recorded with the fact — see `intensity.ts`, without which the adapter's
   * no-ratchet guarantee is lost — and whether pressing Record records something standing in for this
   * line rather than the line's own exercise.
   */
  readonly accepted?: AcceptedLine | null;
}

export function LineControls(props: LineControlsProps) {
  const {
    store, sessionId, clientId, exerciseId, prescription, attempts, pool, state, setState, onMoved,
    accepted = null,
  } = props;

  const key = draftKey(clientId, exerciseId);
  const open = state.open;
  const mine = open !== null && open.clientId === clientId && open.exerciseId === exerciseId;
  /**
   * The numbers an accepted curve filled in, kept after a fact lands so a REPEAT is still the curve's
   * rather than silently the routine's — see `AcceptedLine.values`. Below anything he typed himself.
   */
  const seed = accepted?.values ?? null;
  const draft = lineDraft(state, clientId, exerciseId, prescription, seed);
  const standingIn = accepted?.standsInWithId ?? null;
  const words = controlsFor(attempts.length > 0);

  /**
   * Make a move, and let the screen see the record rather than the press.
   *
   * The one place a move is committed from, so no control can grow its own quieter handling of a
   * refusal. `whose` is the draft the outcome belongs to: on success it is forgotten because it is now
   * on the record, and on a refusal it stays exactly as he typed it, with the sentence beside it.
   */
  const make = useCallback(
    async (whose: string, move: () => Promise<MoveResult>) => {
      setState((held) => recording(held, true));
      const result = await move();
      if (result.reading !== null) onMoved(result.reading);
      setState((held) => (result.ok
        // A move that landed but could not be read back is still a move that landed, and its sentence
        // says so; it must not be reported as a failure or he would record the same fact twice.
        ? (result.refusal === null
          ? recorded(held, whose)
          : refused(recorded(held, whose), whose, result.refusal))
        : refused(held, whose, result.refusal ?? {
          headline: 'That could not be recorded on this device.', detail: null, journalFull: false,
        })));
    },
    [setState, onMoved],
  );

  const problem = draftProblem(draft);

  /**
   * The fact being corrected, when the open panel is a correction of one of THIS line's attempts.
   *
   * Read off the attempts rather than off the panel alone: a correction panel whose fact has gone —
   * the record re-read, the session reopened — would otherwise draw a panel that can save nothing.
   */
  const correcting = open !== null && open.kind === 'edit' && open.recordId !== null
    && attempts.some((attempt) => attempt.recordId === open.recordId)
    ? { key: open.key, recordId: open.recordId }
    : null;

  /**
   * RECORD WHAT THIS PERSON DID ON THIS LINE.
   *
   * With an accepted curve standing something else on this line, that is a SUBSTITUTION and it is
   * recorded as one — the same verb the Something else control reaches, so the record keeps both what
   * was done and what it replaced. Recording it as a plain fact against the line would lose what the
   * routine originally asked for. The level travels either way, and only when a curve was accepted.
   */
  const pressRecord = useCallback(() => {
    const typed = valuesForLine(state, clientId, exerciseId, prescription, seed);
    if (typed === null) return;
    const values = withLevel(typed, accepted);
    void make(key, () => (standingIn === null
      ? recordTheLine(store, sessionId, clientId, exerciseId, values)
      : substituteTheLine(store, sessionId, clientId, {
        insteadOf: exerciseId, exerciseId: standingIn, values,
      })));
  }, [
    make, key, state, store, sessionId, clientId, exerciseId, prescription, seed, accepted,
    standingIn,
  ]);

  const pressSkip = useCallback(() => {
    void make(key, () =>
      skipTheLine(store, sessionId, clientId, exerciseId, noteForLine(state, clientId, exerciseId)));
  }, [make, key, state, store, sessionId, clientId, exerciseId]);

  const pressSubstitute = useCallback(
    (substitute: string) => {
      const values = valuesForLine(state, clientId, exerciseId, prescription, seed);
      if (values === null) return;
      // NO LEVEL ON A SUBSTITUTE HE PICKED HIMSELF, even under an accepted curve. The curve named a
      // level for a movement it chose; this is a different movement, chosen by him, and its numbers are
      // the ones sitting in the panel rather than ones scaled for it. Recording the curve's level here
      // would file his own choice as though the curve had measured it — which is the precise mistake
      // the level exists to prevent, made in the other direction.
      void make(key, () => substituteTheLine(store, sessionId, clientId, {
        insteadOf: exerciseId, exerciseId: substitute, values,
      }));
    },
    [make, key, state, store, sessionId, clientId, exerciseId, prescription, seed],
  );

  const pressSaveCorrection = useCallback(
    (recordId: string) => {
      const amendment = amendmentFromDraft(draftOf(state, editKey(recordId)));
      if (amendment === null) return;
      void make(editKey(recordId), () =>
        amendTheAttempt(store, sessionId, recordId, amendment));
    },
    [make, state, store, sessionId],
  );

  return (
    <>
      {/*
        THE CONTROLS, ON EVERY LINE, IN THE SAME ORDER EVERY TIME. Nothing here is conditional on what
        the record says about this line or any other — see the header. `row-actions` is the house
        control cluster and it is the same one the register and the removals list use.
      */}
      <span className="row-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={state.recording || problem !== null}
          onClick={pressRecord}
        >
          {/* WHAT PRESSING IT RECORDS, when that is no longer this line's own exercise. A control
              whose act changed underneath it while keeping its old label is the one shape of surprise
              a screen used with a client waiting cannot afford. */}
          {standingIn === null ? words.record : RECORD_STAND_IN_LABEL}
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={state.recording}
          onClick={pressSkip}
        >
          <Glyph name="session-skip-exercise" size="dense" decorative />
          <span>{words.skip}</span>
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={state.recording}
          aria-expanded={mine && open.kind === 'substitute'}
          onClick={() => setState((held) => openPanel(
            held,
            { kind: 'substitute', key, clientId, exerciseId, recordId: null },
            draft,
          ))}
        >
          <Glyph name="session-substitute-exercise" size="dense" decorative />
          <span>{words.substitute}</span>
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={state.recording}
          aria-expanded={mine && open.kind === 'adjust'}
          onClick={() => setState((held) => openPanel(
            held,
            { kind: 'adjust', key, clientId, exerciseId, recordId: null },
            draft,
          ))}
        >
          <Glyph name="edit" size="dense" decorative />
          <span>{words.adjust}</span>
        </button>
      </span>

      {mine && open.kind === 'adjust' && (
        <ValuePanel
          panelId={`${key}-adjust`}
          title={words.adjustOpen}
          words={adjustWords(prescription)}
          draft={draft}
          problem={problem}
          setState={setState}
          onClose={() => setState(closePanel)}
        />
      )}

      {mine && open.kind === 'substitute' && (
        <section className="card-tight stack row-panel">
          <h4 className="title-section">{SUBSTITUTE_TITLE}</h4>
          <p className="muted read">{SUBSTITUTE_WORDS}</p>

          <div className="field">
            <label htmlFor={`substitute-filter-${key}`}>{SUBSTITUTE_FILTER_LABEL}</label>
            <input
              id={`substitute-filter-${key}`}
              type="search"
              autoComplete="off"
              value={state.typed}
              onChange={(event) => setState((held) => typeFilter(held, event.target.value))}
            />
          </div>

          <SubstitutionPoolRows
            pool={pool}
            typed={state.typed}
            insteadOf={exerciseId}
            recording={state.recording}
            onPick={pressSubstitute}
          />

          <p>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setState(closePanel)}>
              {CANCEL_LABEL}
            </button>
          </p>
        </section>
      )}

      {/*
        WHAT IS ALREADY ON THE RECORD FOR THIS LINE — every attempt, not only the most recent. A
        repeat is a second fact and the first genuinely happened; showing only the last would present
        an edit and a repeat as the same thing and lose a set the client did.
      */}
      {attempts.length > 0 && (
        <ul className="rows row-panel">
          {attempts.map((attempt) => (
            <li key={attempt.recordId} className="row row-static row-wrap">
              <span className="row-name">{attempt.words}</span>
              {attempt.values !== null && (
                <span className="row-value">{attempt.values}</span>
              )}
              <span className="row-actions">
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={state.recording}
                  aria-expanded={open !== null && open.kind === 'edit'
                    && open.recordId === attempt.recordId}
                  onClick={() => setState((held) => openPanel(
                    held,
                    {
                      kind: 'edit',
                      key: editKey(attempt.recordId),
                      clientId,
                      exerciseId,
                      recordId: attempt.recordId,
                    },
                    attempt.draft,
                  ))}
                >
                  <Glyph name="edit" size="dense" decorative />
                  <span>{EDIT_LABEL}</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {correcting !== null && (
        <ValuePanel
          panelId={correcting.key}
          title={EDIT_LABEL}
          words={EDIT_WORDS}
          draft={draftOf(state, correcting.key)}
          problem={draftProblem(draftOf(state, correcting.key))}
          setState={setState}
          onClose={() => setState(closePanel)}
          commit={{
            label: SAVE_EDIT_LABEL,
            disabled: state.recording,
            press: () => pressSaveCorrection(correcting.recordId),
          }}
        />
      )}

      {/*
        THE REFUSAL, WHERE IT HAPPENED. Drawn on this line only when it is this line's refusal, so a
        card carrying three people and eight exercises each never leaves him working out what a
        sentence at the top of the screen was about. The journal-full state is a real, reachable one
        and reads as its own sentence rather than as a fault.
      */}
      {state.refusal !== null
        && (state.refusalKey === key
          || attempts.some((attempt) => state.refusalKey === editKey(attempt.recordId))) && (
        <div
          className={state.refusal.journalFull
            ? 'note note-warning read row-panel'
            : 'note note-danger read row-panel'}
          role="status"
        >
          <Glyph name={state.refusal.journalFull ? 'note' : 'sync-failed'} size="inline" decorative />
          <div className="stack-tight">
            <span>{state.refusal.headline}</span>
            {state.refusal.detail !== null && (
              <span className="muted">{state.refusal.detail}</span>
            )}
          </div>
        </div>
      )}

      {problem !== null && (
        <p className="note note-warning read row-panel" role="status">
          <Glyph name="note" size="inline" decorative />
          <span>{problem}</span>
        </p>
      )}
    </>
  );
}

/** The exercises offered in place of one line. */
function SubstitutionPoolRows(props: {
  readonly pool: SubstitutionPool | null;
  readonly typed: string;
  readonly insteadOf: string;
  readonly recording: boolean;
  readonly onPick: (exerciseId: string) => void;
}) {
  const { pool, typed, insteadOf, recording: inFlight, onPick } = props;

  // NOT an empty pool. A library that has not been read yet and a library with nothing in it are
  // different facts, and showing the second for the first would tell him his library is empty.
  if (pool === null) return <p className="muted read">Reading your library…</p>;

  const rows = substituteRows(pool.choices, typed, insteadOf);
  if (rows.matched === 0) return <p className="muted read">{SUBSTITUTE_NONE_MATCH}</p>;

  return (
    <>
      <ul className="rows rows-boxed">
        {rows.shown.map((choice) => (
          <li key={choice.exerciseId} className="row row-wrap">
            <span className="row-name">{choice.name}</span>
            <span className="row-actions">
              <button
                type="button"
                className="btn btn-sm"
                disabled={inFlight}
                onClick={() => onPick(choice.exerciseId)}
              >
                {'In its place'}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {/* WHAT IS NOT DRAWN, said out loud. A list bounded in silence reads as the whole library. */}
      {rows.moreWords !== null && <p className="muted read">{rows.moreWords}</p>}
      {!pool.whole && <p className="muted read">{SUBSTITUTE_MORE_THAN_SHOWN}</p>}
    </>
  );
}

/**
 * THE VALUES, IN PLACE.
 *
 * Drawn inside the line it belongs to. Editing repetitions, a timer or rest mid-session must be
 * reachable in the moment, on a phone, without leaving the exercise — so this is not a dialogue, not
 * another screen and not a drawer over the session.
 */
function ValuePanel(props: {
  /** Unique per person, per line and per panel, because two people's rows are on one document and
   * two fields sharing an identity give one of them a label that points at the other. */
  readonly panelId: string;
  readonly title: string;
  readonly words: string;
  readonly draft: Draft;
  readonly problem: string | null;
  readonly setState: Dispatch<SetStateAction<ControlState>>;
  readonly onClose: () => void;
  /** A panel that commits something of its own — a correction. The adjust panel has none: what he
   * types there is recorded by the line's own Record control, so a second one would be two ways to
   * do one thing. */
  readonly commit?: {
    readonly label: string;
    readonly disabled: boolean;
    readonly press: () => void;
  };
}) {
  const { panelId, title, words, draft, problem, setState, onClose, commit } = props;

  return (
    <section className="card-tight stack row-panel">
      <h4 className="title-section">{title}</h4>
      <p className="muted read">{words}</p>

      {VALUE_FIELDS.map((field) => (
        <div key={field} className="field">
          <label htmlFor={`value-${panelId}-${field}`}>{FIELD_LABELS[field]}</label>
          <input
            id={`value-${panelId}-${field}`}
            type="text"
            inputMode={field === 'observedLoad' || field === 'note' ? 'text' : 'numeric'}
            autoComplete="off"
            value={draft[field]}
            onChange={(event) => setState((held) => changeDraft(held, field, event.target.value))}
          />
          {FIELD_HINTS[field] !== undefined && (
            <p className="field-hint read">{FIELD_HINTS[field]}</p>
          )}
        </div>
      ))}

      <p className="row-actions">
        {commit !== undefined && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={commit.disabled || problem !== null}
            onClick={commit.press}
          >
            {commit.label}
          </button>
        )}
        <button type="button" className="btn btn-quiet btn-sm" onClick={onClose}>
          {CANCEL_LABEL}
        </button>
      </p>
    </section>
  );
}
