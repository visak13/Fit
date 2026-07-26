/**
 * THE INTENSITY ADAPTER, DRAWN — the curves he presses, and the shape one would make of this session.
 *
 * This file is the DRAWING and nothing else. Every judgement — the wording, what a toggle is, what
 * accepting does, what may not be said about any of it — is decided in `intensity.ts`, and every read
 * and the call to the adapter live in `intensity-source.ts`, where both are asserted with no browser
 * and no rendering at all. The same split as `screens/removals.ts` against `screens/RemovalsScreen.tsx`.
 *
 * ## BOTH HALVES ARE ON THE SCREEN, AND THAT IS THE POINT OF THE LAYOUT
 *
 * The adapter reorders AND it scales. A panel showing a re-sorted list would hide the numbers; a panel
 * showing changed numbers against the routine's own order would hide the shape. So the rows come out in
 * the CURVE'S order, each one saying which point of the curve it is, and each one carries the numbers
 * for every person in the room underneath it. What the adapter produced is what he can see.
 *
 * ## EVERY NUMBER SAYS WHERE IT CAME FROM
 *
 * `reference.note` is drawn under each person's numbers, verbatim, and so is the sentence for a number
 * that was held back. A number he cannot account for is either trusted blindly or ignored entirely, and
 * both are worse than showing the working. Where there was nothing to calibrate from, the adapter's own
 * sentence saying so is drawn at the top of that person's block — not softened, not omitted, and not
 * replaced with a confident-looking default.
 *
 * ## IT IS HARD TO TRIGGER BY ACCIDENT AND FAST TO READ
 *
 * Pressing a curve draws a panel; it changes nothing. The two ways out are labelled with the acts
 * rather than with yes and no, and the one that changes something is the only one styled as primary.
 * There is no confirmation dialogue over the session, because there is nothing to confirm: accepting
 * writes nothing either.
 */

import type { Dispatch, SetStateAction } from 'react';

import { Glyph } from '../design/Glyph';
import {
  ACCEPT_LABEL, MORE_CURVES_THAN_SHOWN, NO_PATTERNS, READING_PATTERNS, REJECT_LABEL, REJECT_WORDS,
  SET_ASIDE_LABEL, SHAPE_IT_LABEL, SHAPING,
  SHORTFALL_TITLE, TOGGLES_TITLE, TOGGLES_WORDS, VALUES_WORDS, WHY_TITLE, acceptedWords,
  calibrationMark, changeProposed, effortWords, levelWords, proposalProblem, proposalTitle,
  proposedDraft, proposedKey, standsInWords,
} from './intensity';
import type {
  AcceptedLine, IntensityState, PersonProposal, ProposedEffort, ProposedRow, RoomProposal,
} from './intensity';
import { FIELD_LABELS } from './modular-control';
import type { DraftField } from './modular-control';

/** What the toggles need. */
interface TogglesProps {
  /** The curves his library holds, or null while they are being read. */
  readonly curves: RoomCurves | null;
  readonly state: IntensityState;
  /** Pressing one. The screen owns the reading, because it holds the store and the roster. */
  readonly onPress: (patternId: string) => void;
  readonly onSetAside: () => void;
}

/** The curves, as much of `intensity-source.ts`'s reading as the drawing touches. */
export interface RoomCurves {
  readonly toggles: readonly {
    readonly patternId: string;
    readonly name: string;
    readonly words: string;
    readonly curveWords: string;
  }[];
  readonly whole: boolean;
}

/**
 * THE CURVES, AS A ROW OF BUTTONS — one per pattern his library holds.
 *
 * Rendered from the DATA and never from a list in the source: patterns are a record kind precisely so
 * he can add one, edit one or delete one without the application being rebuilt, and the admin reset
 * restores the shipped set. Each button says its shape as well as its name, because `R11` only requires
 * a name to tell the truth about a sequence when it already spells one out.
 */
export function IntensityToggles(props: TogglesProps) {
  const { curves, state, onPress, onSetAside } = props;

  return (
    <section className="card-tight stack" aria-labelledby="session-intensity">
      <div className="inline">
        <Glyph name="session-reorder-exercises" size="lead" decorative />
        <h3 id="session-intensity" className="title-section">{TOGGLES_TITLE}</h3>
      </div>
      <p className="muted read">{TOGGLES_WORDS}</p>

      {curves === null ? (
        <p className="muted read">{READING_PATTERNS}</p>
      ) : curves.toggles.length === 0 ? (
        <p className="note read">
          <Glyph name="note" size="inline" decorative />
          <span>{NO_PATTERNS}</span>
        </p>
      ) : (
        <ul className="rows rows-boxed">
          {curves.toggles.map((toggle) => (
            <li key={toggle.patternId} className="row row-wrap">
              <span className="row-name">{toggle.name}</span>
              <span className="row-value nowrap">{toggle.curveWords}</span>
              {toggle.words.length > 0 && (
                <span className="row-sentence muted">{toggle.words}</span>
              )}
              <span className="row-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={state.shaping !== null}
                  onClick={() => onPress(toggle.patternId)}
                >
                  {state.shaping === toggle.patternId ? SHAPING : SHAPE_IT_LABEL}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* WHAT IS NOT DRAWN, said out loud. A list bounded in silence reads as the whole library. */}
      {curves !== null && !curves.whole && (
        <p className="muted read">{MORE_CURVES_THAN_SHOWN}</p>
      )}

      {/*
        THE REFUSAL, WITH THE CAUSE UNDER IT. The headline is written for him and the adapter's own
        message sits beneath as the detail — `intensity.ts` says why that way round. The same shape the
        in-session controls use for a refused move, so a refusal reads the same wherever it happens.
      */}
      {state.refusal !== null && (
        <div className="note note-danger read" role="status">
          <Glyph name="sync-failed" size="inline" decorative />
          <div className="stack-tight">
            <span>{state.refusal.headline}</span>
            {state.refusal.detail !== null && (
              <span className="muted">{state.refusal.detail}</span>
            )}
          </div>
        </div>
      )}

      {/*
        THE CURVE HE ACCEPTED, said where he can see it and undone from the same place. Reachable
        because accepting wrote nothing: setting a shape aside puts the routine's own order back and
        clears the numbers it filled in, keeping anything he typed himself afterwards.
      */}
      {state.accepted !== null && (
        <div className="note read">
          <Glyph name="note" size="inline" decorative />
          <div className="stack-tight">
            <span>{acceptedWords(state.accepted.patternName)}</span>
            <span>
              <button type="button" className="btn btn-quiet btn-sm" onClick={onSetAside}>
                {SET_ASIDE_LABEL}
              </button>
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

/** What the proposal panel needs. */
interface ProposalProps {
  readonly proposal: RoomProposal;
  readonly state: IntensityState;
  readonly setState: Dispatch<SetStateAction<IntensityState>>;
  readonly onAccept: () => void;
  readonly onReject: () => void;
}

/**
 * THE PROPOSAL — the shape a curve would make of this session, in a form he can read and change.
 *
 * Nothing on this panel has been applied. It is the adapter's own first sentence, drawn at the top of
 * it verbatim, and it is true of everything below: nothing changed, nothing saved, every value his to
 * alter, and the whole shape can be set aside.
 */
export function ProposalPanel(props: ProposalProps) {
  const { proposal, state, setState, onAccept, onReject } = props;
  const problem = proposalProblem(state, proposal);
  const many = proposal.people.length > 1;

  return (
    <section className="card stack" aria-labelledby="session-proposal">
      <div className="card-header">
        <h3 id="session-proposal" className="title-section">
          {proposalTitle(proposal.patternName)}
        </h3>
      </div>

      {/* THE ADAPTER'S OWN STANDING SENTENCES, VERBATIM. The first is the whole contract said out
          loud, in the place he is actually looking. */}
      {proposal.standingWords.map((words) => (
        <p key={words} className="read">{words}</p>
      ))}
      <p className="muted read">{proposal.curveWords}</p>
      <p className="muted read">{VALUES_WORDS}</p>

      {/*
        WHO WAS CALIBRATED AND WHO WAS NOT, said before the numbers rather than after them. With one
        person in the room this is their sentence; with three it is three, because a baseline is per
        person and one person's cannot stand for another's.
      */}
      {proposal.people.map((person) => (
        <p key={person.clientId} className="muted read">
          {many ? `${person.name}: ${person.baselineWords}` : person.baselineWords}
        </p>
      ))}

      <ul className="rows rows-boxed">
        {proposal.rows.map((row) => (
          <PositionRow
            key={`${row.position}-${row.exerciseId}`}
            row={row}
            people={proposal.people}
            many={many}
            state={state}
            setState={setState}
          />
        ))}
      </ul>

      {/*
        WHERE THE ROUTINE RAN SHORT, in the adapter's own words. A curve he wrote himself is under no
        guarantee of being servable, and the honest report is that the session keeps its full length
        and says which level could not be filled — never a silent substitution of a different
        intensity, and never a shorter session than asked for.
      */}
      {proposal.shortfallWords.length > 0 && (
        <>
          <h4 className="title-section">{SHORTFALL_TITLE}</h4>
          {proposal.shortfallWords.map((words) => (
            <p key={words} className="note note-warning read">
              <Glyph name="note" size="inline" decorative />
              <span>{words}</span>
            </p>
          ))}
        </>
      )}

      {problem !== null && (
        <p className="note note-warning read" role="status">
          <Glyph name="note" size="inline" decorative />
          <span>{problem}</span>
        </p>
      )}

      <p className="muted read">{REJECT_WORDS}</p>

      <p className="row-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={problem !== null}
          onClick={onAccept}
        >
          {ACCEPT_LABEL}
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={onReject}>
          {REJECT_LABEL}
        </button>
      </p>
    </section>
  );
}

/** One position of the curve, and what everybody in the room would do at it. */
function PositionRow(props: {
  readonly row: ProposedRow;
  readonly people: readonly PersonProposal[];
  readonly many: boolean;
  readonly state: IntensityState;
  readonly setState: Dispatch<SetStateAction<IntensityState>>;
}) {
  const { row, people, many, state, setState } = props;

  return (
    <li className="row row-wrap">
      <span className="chip"><span>{levelWords(row.askedForLevel)}</span></span>
      <span className="row-name">{row.exerciseName}</span>

      {/*
        SOMETHING FROM THE WIDER LIBRARY, STANDING ON ONE OF THE ROUTINE'S LINES, NAMED WHERE IT SITS.
        A substitute the coach could not see would be the routine silently changed underneath him.
      */}
      {row.standsInForName !== null && (
        <span className="row-value">
          <Glyph name="session-substitute-exercise" size="dense" decorative />
          <span>{standsInWords(row.exerciseName, row.standsInForName)}</span>
        </span>
      )}

      {row.substitutionWords !== null && (
        <span className="row-sentence muted">{row.substitutionWords}</span>
      )}
      {row.shortfallWords !== null && (
        <span className="row-sentence muted">{row.shortfallWords}</span>
      )}

      {people.map((person) => {
        const effort = person.efforts[row.position] ?? null;
        if (effort === null) return null;
        return (
          <PersonEffort
            key={person.clientId}
            person={person}
            effort={effort}
            position={row.position}
            many={many}
            state={state}
            setState={setState}
          />
        );
      })}
    </li>
  );
}

/**
 * ONE PERSON'S NUMBERS AT ONE POSITION, editable in place.
 *
 * Per person, always. The draft is keyed by the person and the position, so altering a tired client's
 * numbers is structurally incapable of moving anybody else's — the same property, made the same way, as
 * the in-session controls' own drafts.
 */
function PersonEffort(props: {
  readonly person: PersonProposal;
  readonly effort: ProposedEffort;
  readonly position: number;
  readonly many: boolean;
  readonly state: IntensityState;
  readonly setState: Dispatch<SetStateAction<IntensityState>>;
}) {
  const { person, effort, position, many, state, setState } = props;
  const key = proposedKey(person.clientId, position);
  const draft = proposedDraft(state, person.clientId, position, effort);
  const panelId = `proposed-${key}`;

  /** Which numbers this exercise is counted in. The library files it one way or the other. */
  const fields: readonly DraftField[] = [
    'sets',
    effort.measurement === 'time' ? 'durationSeconds' : 'repetitions',
    'restSeconds',
  ];

  return (
    <div className="card-tight stack-tight row-panel">
      <div className="inline">
        {many && <span className="row-name">{person.name}</span>}
        <span className="chip"><span>{calibrationMark(person.calibrated)}</span></span>
        <span className="spacer" />
        <span className="row-value nowrap">{effortWords(draft)}</span>
      </div>

      {fields.map((field) => (
        <div key={field} className="field">
          <label htmlFor={`${panelId}-${field}`}>{FIELD_LABELS[field]}</label>
          <input
            id={`${panelId}-${field}`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={draft[field]}
            /* THE DRAFT IS THE SEED, so the first keystroke on one number does not empty the two
               beside it — see `changeProposed`, where this was a measured defect. */
            onChange={(event) => setState((held) => changeProposed(
              held, key, field, event.target.value, draft,
            ))}
          />
        </div>
      ))}

      {/*
        WHY THESE NUMBERS ARE THESE NUMBERS — the adapter's own sentence, verbatim, and the one about a
        number that was held back beside it. Drawn under the fields rather than hidden behind a control:
        the calibration must be visible, not implied.
      */}
      <p className="field-hint read">
        <Glyph name="help-explain" size="inline" decorative />
        <span>{`${WHY_TITLE}: ${effort.referenceWords}`}</span>
      </p>
      {effort.heldBackWords !== null && (
        <p className="field-hint read">{effort.heldBackWords}</p>
      )}
    </div>
  );
}

/**
 * WHAT AN ACCEPTED CURVE SAYS ON ONE OF THE ROUTINE'S LINES.
 *
 * Which point of the curve this line is, and what stands in for it. Drawn on the line itself, because a
 * session in an order he did not choose to look at would otherwise be unaccounted for — and because
 * pressing Record on this line records a stand-in rather than the line's own exercise, which he must be
 * able to see before he presses it rather than afterwards.
 */
export function AcceptedLineMark(props: {
  readonly line: AcceptedLine | null;
  readonly lineName: string;
}) {
  const { line, lineName } = props;
  if (line === null) return null;

  return (
    <>
      <span className="chip"><span>{levelWords(line.level)}</span></span>
      {line.standsInWithName !== null && (
        <span className="row-value">
          <Glyph name="session-substitute-exercise" size="dense" decorative />
          <span>{standsInWords(line.standsInWithName, lineName)}</span>
        </span>
      )}
    </>
  );
}
