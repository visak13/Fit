/**
 * THE CONTROL THAT ADDS A LATE ARRIVAL — the one place in this application that puts somebody into a
 * session already running.
 *
 * This file is the DRAWING and nothing else. Every word and every judgement is decided in
 * `modular-control.ts`, and the write goes through `modular-control-source.ts` on the handle this
 * window already holds. The same split as `screens/SessionEnding.tsx` against `session-ending.ts`.
 *
 * ## IT EXISTS BECAUSE A REFUSAL PROMISED IT DID
 *
 * `core/session/journal.js` refuses a fact offered against somebody who is not attending, and told
 * the coach to add them to the session — while nothing under `src/` called `addClient` at all. The
 * sentence was an instruction with nothing to perform it, which is the worst shape a refusal can
 * take: it reads as the coach's mistake. This control is the other half of that sentence, and the
 * sentence now NAMES it, quoted, so `shell/refusal-names-a-real-control.test.ts` holds the two
 * against each other rather than each against itself.
 *
 * ## DRAWN AT SCREEN LEVEL, NOT IN ANYBODY'S CARD
 *
 * A session is one routine and one to many people. An arrival control inside somebody's card would
 * read as adding them to that person, which is not a thing this record can express — the same reason
 * the finish control and the session note are drawn here rather than per attendee.
 *
 * ## THE ROSTER IT SUBTRACTS IS THE ONE THE SCREEN IS DRAWING
 *
 * Who is already in the room comes in as a prop rather than being read again. The register read
 * hands back the whole page on purpose (`readTheArrivalRegister` says why), and the screen is what
 * knows the roster it is drawing beside — the same division `SubstitutionPoolRows` keeps against the
 * line it is replacing.
 */

import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { Glyph } from '../design/Glyph';
import { Tooltip } from '../design/Tooltip';
import {
  ARRIVAL_ADDING_WORDS, ARRIVAL_ADD_LABEL, ARRIVAL_EVERYONE_HERE, ARRIVAL_FILTER_LABEL,
  ARRIVAL_MORE_THAN_SHOWN, ARRIVAL_NONE_MATCH, ARRIVAL_TITLE, ARRIVAL_WORDS, CANCEL_LABEL,
  arrivalAdded, arrivalAddedWords, arrivalAdding, arrivalOpened, arrivalPutAway, arrivalRefused,
  arrivalRows, arrivalTyped,
} from './modular-control';
import type { ArrivalState } from './modular-control';
import { addTheLateArrival } from './modular-control-source';
import type { ArrivalRegister, SessionReadBack } from './modular-control-source';
import type { LocalStore } from '../../core/store/store.js';

interface SessionArrivalProps {
  readonly store: LocalStore;
  readonly sessionId: string;
  /** The register page, or null while it has not been read. The two are different facts. */
  readonly register: ArrivalRegister | null;
  /** Who is already in the room, from the session's own record. */
  readonly attending: readonly string[];
  readonly state: ArrivalState;
  readonly setState: Dispatch<SetStateAction<ArrivalState>>;
  /** The session as it stands after the arrival, so the screen shows what the record now says. */
  readonly onMoved: (reading: SessionReadBack) => void;
}

export function SessionArrival(props: SessionArrivalProps) {
  const {
    store, sessionId, register, attending, state, setState, onMoved,
  } = props;

  /**
   * ADD THEM.
   *
   * The read-back is handed up before this control's own state is settled, so the roster the screen
   * draws and the sentence this panel shows move together rather than in two repaints — the same
   * order `SessionEnding` uses and for the same reason.
   *
   * THE NAME IS TAKEN FROM THE ROW HE PRESSED rather than read back out of the session, because the
   * sentence is about the person he chose. A read-back that landed without a view would otherwise
   * leave the confirmation with nobody's name in it.
   */
  const pressAdd = useCallback(
    (clientId: string, name: string) => {
      setState(arrivalAdding);
      void addTheLateArrival(store, sessionId, clientId).then((result) => {
        if (result.reading !== null) onMoved(result.reading);
        setState((held) => (result.ok
          // THE ARRIVAL LANDED AND THE READ-BACK DID NOT is still somebody who is in the session, and
          // `throughTheHeldSession` reports that as `ok` with a refusal carrying its own sentence.
          // Telling him it did not land would have him press again on a person already added.
          ? (result.refusal === null
            ? arrivalAdded(held, name)
            : arrivalRefused(arrivalAdded(held, name), result.refusal))
          : arrivalRefused(held, result.refusal ?? {
            headline: 'They could not be added to this session on this device.',
            detail: null,
            journalFull: false,
          })));
      });
    },
    [store, sessionId, setState, onMoved],
  );

  /**
   * WHO IS NOW IN THE SESSION, kept whether or not the panel is open.
   *
   * A confirmation that vanished with the panel would be a write he has no evidence of, on the one
   * control whose whole purpose is to make a promise true.
   */
  const confirmation = state.added !== null && (
    <p className="note read row-panel">
      <Glyph name="session-start" size="inline" decorative />
      <span>{arrivalAddedWords(state.added)}</span>
    </p>
  );

  /** A refusal is drawn whether or not the arrival landed, and is never swallowed. */
  const refusal = state.refusal !== null && (
    <p className="note note-danger read row-panel">
      <Glyph name="sync-failed" size="inline" decorative />
      <span>{state.refusal.headline}</span>
    </p>
  );

  return (
    <>
      {/* THE TRIGGER, COMPACT — one control in the screen's own row rather than a card with a
          heading and a paragraph above it. `ARRIVAL_WORDS`, the one real fact under the heading it
          used to carry (a late arrival joins the routine already running; nothing recorded changes),
          is the tooltip now. `ARRIVAL_TITLE` still labels the control itself, which is what
          `modular-control-source.test.ts` holds against the refusal that names it. */}
      {state.open ? (
        <div className="row-panel stack-tight">
          <label className="field">
            <span className="field-label">{ARRIVAL_FILTER_LABEL}</span>
            <input
              type="text"
              className="input"
              value={state.typed}
              onChange={(event) => setState((held) => arrivalTyped(held, event.target.value))}
            />
          </label>

          <ArrivalRegisterRows
            register={register}
            typed={state.typed}
            attending={attending}
            adding={state.adding}
            onPick={pressAdd}
          />

          <span className="row-actions">
            <button
              type="button"
              className="btn btn-quiet"
              disabled={state.adding}
              onClick={() => setState(arrivalPutAway)}
            >
              {CANCEL_LABEL}
            </button>
          </span>
        </div>
      ) : (
        <Tooltip text={ARRIVAL_WORDS}>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            aria-expanded={state.open}
            onClick={() => setState(arrivalOpened)}
          >
            <Glyph name="session-start" size="dense" decorative />
            <span>{ARRIVAL_TITLE}</span>
          </button>
        </Tooltip>
      )}

      {state.adding && (
        <p className="note read row-panel">
          <Glyph name="sync-pending" size="inline" decorative />
          <span>{ARRIVAL_ADDING_WORDS}</span>
        </p>
      )}

      {confirmation}
      {refusal}
    </>
  );
}

/** The people offered as a late arrival. */
function ArrivalRegisterRows(props: {
  readonly register: ArrivalRegister | null;
  readonly typed: string;
  readonly attending: readonly string[];
  readonly adding: boolean;
  readonly onPick: (clientId: string, name: string) => void;
}) {
  const {
    register, typed, attending, adding: inFlight, onPick,
  } = props;

  // NOT AN EMPTY REGISTER. A register that has not been read yet and a register with nobody in it
  // are different facts, and showing the second for the first would tell him he trains nobody.
  if (register === null) return <p className="muted read">Reading your register…</p>;

  const rows = arrivalRows(register.choices, typed, attending);
  if (rows.matched === 0) {
    // TWO DIFFERENT FACTS, and never the same sentence. Nothing matching what he typed is a search
    // result; nobody left to add is a full session. Reading the first for the second would send him
    // looking for a person who is standing in front of him and already in the room.
    return (
      <p className="muted read">
        {typed.trim().length === 0 ? ARRIVAL_EVERYONE_HERE : ARRIVAL_NONE_MATCH}
      </p>
    );
  }

  return (
    <>
      <ul className="rows rows-boxed">
        {rows.shown.map((choice) => (
          <li key={choice.clientId} className="row row-wrap">
            <span className="row-name">{choice.name}</span>
            <span className="row-actions">
              <button
                type="button"
                className="btn btn-sm"
                disabled={inFlight}
                onClick={() => onPick(choice.clientId, choice.name)}
              >
                {ARRIVAL_ADD_LABEL}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {/* WHAT IS NOT DRAWN, said out loud. A list bounded in silence reads as the whole register. */}
      {rows.moreWords !== null && <p className="muted read">{rows.moreWords}</p>}
      {!register.whole && <p className="muted read">{ARRIVAL_MORE_THAN_SHOWN}</p>}
    </>
  );
}
