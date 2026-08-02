/**
 * THE NOW-CARD — the exercise the coach TAPPED, readable from across the room.
 *
 * USER-RULED (2 August 2026, from the approved Console sheet): the workout surface is a card with
 * the numbers big — repetitions, sets as pips, rest — and a clock the app runs itself. The coach
 * looks at the client; the screen carries one tap per natural pause. Nothing here is a form; the
 * forms (adjust, substitute, hold timer) sit behind one control and appear only when deviating.
 *
 * ## WHY THIS DOES NOT BREAK `SESSION.md` §2
 *
 * The record still holds only what OCCURRED. Which exercise this card shows is what the coach
 * pressed — the same class of transient screen state as an open row, held here and passed to no
 * writer. Sets-done and the rest clock are the same: when the last set completes, ONE fact is
 * recorded through the same write path as the row's one-tap control, and the transient state dies.
 * The application still derives no position, suggests no next exercise, and persists neither.
 *
 * ## THE REST CLOCK
 *
 * Set done → the rest countdown starts on its own, beeps its last three seconds and chimes at
 * zero when sounds are on, and hands the coach back to the next set. Skipping the rest is one tap
 * on the running clock. All of it is this component's own interval; nothing survives unmounting.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { Glyph } from '../design/Glyph';
import { useRecordAsPrescribed } from './SessionControls';
import type { RecordAsPrescribedProps } from './SessionControls';
import type { AudioPort, Unlocked } from './session-audio';

/** The seconds already gone when the beeping starts. Three beeps, then the chime. */
const COUNTDOWN_FROM = 3;

interface NowCardProps extends RecordAsPrescribedProps {
  readonly exerciseName: string;
  /** "5 of 9" — the position in the list as DISPLAYED, which is the coach's own order. */
  readonly positionWords: string;
  readonly port: AudioPort;
  readonly unlocked: Unlocked | null;
  /** Close the card without recording anything. */
  readonly onClose: () => void;
  /** The deviation surface — the existing controls and timer, drawn only when asked for. */
  readonly deviations: React.ReactNode;
}

export function SessionNowCard(props: NowCardProps) {
  const {
    exerciseName, positionWords, prescription, port, unlocked, onClose, deviations, state,
  } = props;
  const record = useRecordAsPrescribed(props);

  const sets = prescription?.sets ?? 1;
  const rest = prescription?.rest_seconds ?? null;
  const [setsDone, setSetsDone] = useState(0);
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const [deviating, setDeviating] = useState(false);
  const ticking = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopClock = useCallback(() => {
    if (ticking.current !== null) clearInterval(ticking.current);
    ticking.current = null;
    setRestLeft(null);
  }, []);

  useEffect(() => stopClock, [stopClock]);

  // A different exercise is a different card: the engine starts over rather than carrying a
  // half-run set count from the line the coach was on before.
  useEffect(() => {
    setSetsDone(0);
    setDeviating(false);
    stopClock();
  }, [props.exerciseId, props.clientId, stopClock]);

  const startRest = useCallback(() => {
    if (rest === null || rest <= 0) return;
    setRestLeft(rest);
    ticking.current = setInterval(() => {
      setRestLeft((held) => {
        if (held === null) return null;
        const next = held - 1;
        if (next > 0 && next <= COUNTDOWN_FROM && unlocked?.tones) port.tone('countdown');
        if (next <= 0) {
          if (ticking.current !== null) clearInterval(ticking.current);
          ticking.current = null;
          if (unlocked?.tones) port.tone('ended');
          return null;
        }
        return next;
      });
    }, 1000);
  }, [rest, port, unlocked]);

  const pressSetDone = useCallback(() => {
    stopClock();
    const done = setsDone + 1;
    if (done >= sets) {
      // The whole line is now fact — recorded once, through the same path as the row's one-tap.
      setSetsDone(done);
      void record().then(onClose);
      return;
    }
    setSetsDone(done);
    startRest();
  }, [setsDone, sets, record, onClose, startRest, stopClock]);

  const work = prescription?.repetitions !== null && prescription?.repetitions !== undefined
    ? { value: `${prescription.repetitions}`, label: 'repetitions' }
    : prescription?.duration_seconds !== null && prescription?.duration_seconds !== undefined
      ? { value: `${prescription.duration_seconds}s`, label: 'hold' }
      : null;

  return (
    <section className="card now-card" aria-label={`Now: ${exerciseName}`}>
      <div className="now-head">
        <span className="chip chip-accent tabular">{positionWords}</span>
        <h4>{exerciseName}</h4>
        <span className="spacer" />
        <button type="button" className="icon-btn" aria-label="Put this card away" onClick={onClose}>
          <Glyph name="close" decorative />
        </button>
      </div>

      <div className="now-measure">
        {work !== null && (
          <div>
            <span className="measure-value">{work.value}</span>
            <span className="measure-label">{work.label}</span>
          </div>
        )}
        <div>
          <span className="measure-value">{`${Math.min(setsDone + 1, sets)} of ${sets}`}</span>
          <span className="measure-label">sets</span>
          <span
            className="set-pips"
            role="img"
            aria-label={`Set ${Math.min(setsDone + 1, sets)} of ${sets}, ${setsDone} complete`}
          >
            {Array.from({ length: sets }, (_unused, at) => (
              // eslint-disable-next-line react/no-array-index-key
              <i
                key={at}
                data-done={at < setsDone ? 'true' : undefined}
                data-current={at === setsDone ? 'true' : undefined}
              />
            ))}
          </span>
        </div>
        {rest !== null && (
          <div>
            <span className="measure-value tabular">{restLeft ?? rest}</span>
            <span className="measure-label">{restLeft !== null ? 'resting…' : 'seconds rest'}</span>
          </div>
        )}
        <div className="inline">
          {restLeft !== null ? (
            <button type="button" className="btn" onClick={stopClock}>
              Skip the rest
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={state.recording}
              onClick={pressSetDone}
            >
              <Glyph name="session-finish" size="dense" decorative />
              <span>{setsDone + 1 >= sets ? 'Last set done' : 'Set done'}</span>
            </button>
          )}
          <button
            type="button"
            className="btn btn-quiet"
            aria-expanded={deviating}
            onClick={() => setDeviating((held) => !held)}
          >
            <Glyph name="edit" size="dense" decorative />
            <span>Adjust</span>
          </button>
        </div>
      </div>

      {/* The forms, ONLY when deviating: the existing controls own every write and every word. */}
      {deviating && <div className="stack-tight">{deviations}</div>}
    </section>
  );
}
