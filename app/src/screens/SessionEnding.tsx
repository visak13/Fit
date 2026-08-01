/**
 * THE FINISH CONTROL — the one place in this application that ends a session.
 *
 * This file is the DRAWING and nothing else. Every word and every judgement is decided in
 * `session-ending.ts`, and the write goes through `session-ending-source.ts` on the handle this
 * window already holds. The same split as `screens/SessionControls.tsx` against
 * `screens/modular-control.ts`.
 *
 * ## ONE CONTROL, ONE ENDING
 *
 * It writes `complete()`. `interrupt()` and `abandon()` are not reachable from anything drawn here,
 * and neither is imported by the module that does the writing. LEAVING this screen is already
 * `interrupt()`'s meaning and already happens by itself, so there is nothing for a second control to
 * do that the back button does not.
 *
 * ## IT DISAPPEARS BECAUSE THE RECORD SAYS SO, NOT BECAUSE IT REMEMBERS BEING PRESSED
 *
 * `canFinish` reads `is_live` off the projection, which is `status === 'in_progress'`. So the control
 * goes when the session's status moves, on the read-back the ending itself hands over — and it would
 * be equally gone on a fresh arrival at a session that was finished in another window. A control that
 * hid itself on its own say-so would still be offered after a refusal.
 *
 * ## DRAWN AT SCREEN LEVEL, NOT IN ANYBODY'S CARD
 *
 * A session is one routine and one to many people. A finish control inside somebody's card would read
 * as finishing it for that person alone, which is not a thing this record can express.
 */

import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { Glyph } from '../design/Glyph';
import {
  FINISHED_NOT_BUILT, FINISHED_WHERE, FINISHED_WORDS, FINISHING_WORDS, FINISH_CANCEL_LABEL,
  FINISH_CONFIRM_LABEL, FINISH_CONFIRM_WORDS, FINISH_LABEL, FINISH_TITLE, FINISH_WORDS,
  asking, canFinish, finished, finishing, notYet, refused,
} from './session-ending';
import type { EndingState } from './session-ending';
import { finishTheSession } from './session-ending-source';
import type { SessionReadBack } from './modular-control-source';
import type { LocalStore } from '../../core/store/store.js';

interface SessionEndingProps {
  readonly store: LocalStore;
  readonly sessionId: string;
  /** What the record says about the session, or null while there is nothing to say. */
  readonly report: { readonly live: boolean } | null;
  readonly state: EndingState;
  readonly setState: Dispatch<SetStateAction<EndingState>>;
  /** The session as it stands after the ending, so the screen shows what the record now says. */
  readonly onMoved: (reading: SessionReadBack) => void;
}

export function SessionEnding(props: SessionEndingProps) {
  const {
    store, sessionId, report, state, setState, onMoved,
  } = props;

  /**
   * FINISH IT.
   *
   * The read-back is handed up before the state is settled, so the screen's own view of the session
   * and this control's state move together rather than in two repaints.
   */
  const pressFinish = useCallback(() => {
    setState(finishing);
    void finishTheSession(store, sessionId).then((result) => {
      if (result.reading !== null) onMoved(result.reading);
      setState((held) => (result.ok
        // THE ENDING LANDED AND THE READ-BACK DID NOT is still a session that was finished, and
        // `throughTheHeldSession` reports it as `ok` with a refusal carrying its own sentence.
        // Telling him it did not finish would have him press again on a session that is already
        // ended, and be refused by the core for a reason that would read as a fault.
        ? (result.refusal === null ? finished(held) : refused(finished(held), result.refusal))
        : refused(held, result.refusal ?? {
          headline: 'This session could not be finished on this device.',
          detail: null,
          journalFull: false,
        })));
    });
  }, [store, sessionId, setState, onMoved]);

  /**
   * WHAT IT LEFT BEHIND, said once the session has been finished from this screen.
   *
   * Every clause of it is read back off the store by `session-ending-source.test.ts`: the status has
   * left `in_progress`, everything recorded during the session is still there, and the calendar's two
   * lists have moved it from one to the other.
   */
  const aftermath = state.finished && (
    <>
      <p className="note read">
        <Glyph name="session-finish" size="inline" decorative />
        <span>{FINISHED_WORDS}</span>
      </p>
      <p className="muted read">{FINISHED_WHERE}</p>
      {/* WHAT HE STILL CANNOT DO, in the same breath rather than left to be discovered. This is the
          moment he would go looking for it. */}
      <p className="muted read">{FINISHED_NOT_BUILT}</p>
    </>
  );

  /**
   * A REFUSAL IS SHOWN WHETHER OR NOT THE ENDING LANDED, and never swallowed. It is drawn below the
   * aftermath rather than instead of it, because the two say different things and both can be true.
   */
  const refusal = state.refusal !== null && (
    <p className="note note-danger read">
      <Glyph name="sync-failed" size="inline" decorative />
      <span>{state.refusal.headline}</span>
    </p>
  );

  if (!canFinish(report)) {
    return (
      <>
        {aftermath}
        {refusal}
      </>
    );
  }

  return (
    <section className="stack" aria-labelledby="session-ending">
      <h3 id="session-ending" className="title-section">{FINISH_TITLE}</h3>
      <p className="muted read">{FINISH_WORDS}</p>

      {state.asking ? (
        <>
          {/* WHAT CONFIRMING MEANS, before the control that does it. A one-way act reached by one tap
              on a phone beside a client is the accident this step exists for. */}
          <p className="read">{FINISH_CONFIRM_WORDS}</p>
          <span className="row-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={state.finishing}
              onClick={pressFinish}
            >
              <Glyph name="session-finish" size="dense" decorative />
              <span>{FINISH_CONFIRM_LABEL}</span>
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={state.finishing}
              onClick={() => setState(notYet)}
            >
              {FINISH_CANCEL_LABEL}
            </button>
          </span>
        </>
      ) : (
        <span className="row-actions">
          <button
            type="button"
            className="btn btn-quiet"
            disabled={state.finishing}
            aria-expanded={state.asking}
            onClick={() => setState(asking)}
          >
            <Glyph name="session-finish" size="dense" decorative />
            <span>{FINISH_LABEL}</span>
          </button>
        </span>
      )}

      {state.finishing && (
        <p className="note read">
          <Glyph name="sync-pending" size="inline" decorative />
          <span>{FINISHING_WORDS}</span>
        </p>
      )}

      {refusal}
    </section>
  );
}
