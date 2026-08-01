/**
 * THE DIVERGENCE PICKER — where the coach sees both versions his two devices wrote, and picks one.
 *
 * This file is the DRAWING and nothing else. Every judgement it renders — what each state says, what
 * folds, the order the fields take, how a difference between two envelopes is computed, and the
 * words on the two buttons — is decided in `divergence-picker.ts`, where it can be asserted.
 *
 * ## What it collects, and what it deliberately does not do
 *
 * It COLLECTS the choice. It does not apply one, and it emits no journal entry. Applying the chosen
 * side at a strictly higher revision and recording that a person picked it belong to
 * `core/sync/resolution.js`, which is the one call site of `sync.conflict_resolved` in the
 * application. Putting either here would break two things at once: the revision rule would be
 * re-derived by whoever wrote this file, and `core/journal/unwritten-kinds.test.js` — which asserts
 * that every journal kind is either wired to a named owning file or unwritten with a stated reason,
 * by scanning `core/` alone — would stay green while the partition it asserts had quietly become
 * false. The answer leaves through `resolve` on the seam in `shell/Divergences.tsx` and by no other
 * route.
 *
 * ## Why this is not a sixth destination
 *
 * The five destinations are the five places the application HAS. A clash between two devices is rare
 * and episodic: a permanent sixth entry would be empty almost every time the coach looked at it,
 * which is how a navigation surface teaches someone to stop reading one of its entries. So it has
 * its own address and is reached from the Admin screen — the destination that already carries
 * synchronisation, backup and this device's own record — and `shell/no-dead-ends.test.ts` proves the
 * way in exists, is labelled, and resolves, rather than that being believed.
 *
 * ## Where the dense-screen rule lands here
 *
 * ONE FIGURE THE SCREEN IS FOR: how many decisions are waiting. It is the reason he opened the
 * screen, and on almost every visit it is nought — which is a good state and is worded as one.
 *
 * THE SECONDARY FOLDS AND IS COUNTED: the fields that are IDENTICAL on both versions go into a
 * `<details className="disclose">` with the count on its summary. Nothing is discarded — he may want
 * to see what the record holds before deciding — but what he is CHOOSING between is what differs,
 * and that stays permanently on screen.
 *
 * ONE CARD PER QUESTION: one clash, one card. Two clashes are two separate decisions taken at two
 * separate moments, and merging them into one list is how the second one gets answered by accident.
 *
 * The deletion case is NOT foldable and is marked in three channels — the chip's WORD, a warning
 * note with its own glyph, and the button labels themselves, which say "keep the deletion" rather
 * than "keep this version". One device is about to lose a client's history to the other's tidy-up;
 * that is the sentence he must not be able to miss.
 */

import { Glyph } from '../design/Glyph';
import { useDivergences } from '../shell/Divergences';
import { FIELD, describeChoices, describeQueue } from './divergence-picker';
import type { Choice, FieldRow, FieldValue, SideOffer } from './divergence-picker';

/** One side's value of one field. A sealed value shows the FACT of itself and never its content. */
function Value({ value, whose }: { value: FieldValue; whose: string }) {
  return (
    <td className="compare-value">
      <span className="compare-whose">{whose}</span>
      {value.kind === FIELD.SEALED ? (
        <span className="inline-tight">
          <Glyph name="protected-clinical-note" size="inline" decorative />
          <span>{value.value}</span>
        </span>
      ) : (
        <span className={value.kind === FIELD.ABSENT ? 'muted' : undefined}>{value.value}</span>
      )}
      {value.detail !== null && (
        <details className="disclose">
          <summary>All of it</summary>
          <pre className="tabular">{value.detail}</pre>
        </details>
      )}
    </td>
  );
}

/** The three-column table: the field, then what each device holds for it. */
function Compare({ rows, sides }: { rows: readonly FieldRow[]; sides: readonly [SideOffer, SideOffer] }) {
  return (
    <table className="compare">
      <thead>
        <tr>
          {/* The corner cell names the row headings' own column. It is read once, by a screen
              reader working out the table's shape, and is not a value. */}
          <th scope="col" className="compare-head">
            What
          </th>
          <th scope="col" className="compare-head">
            {sides[0].whose}
          </th>
          <th scope="col" className="compare-head">
            {sides[1].whose}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <th scope="row" className="compare-label">
              {row.label}
            </th>
            <Value value={row.local} whose={sides[0].whose} />
            <Value value={row.incoming} whose={sides[1].whose} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChoiceCard({ choice }: { choice: Choice }) {
  const headingId = `divergence-${choice.recordId}`;

  return (
    <section className="card card-tight" aria-labelledby={headingId}>
      <div className="card-header">
        <h3 id={headingId} className="title-section">
          {choice.title}
        </h3>
        <span className="spacer" />
        {/* The WORD carries the state. The tone is a second channel and never the only one. */}
        <span className={choice.chipTone === 'warning' ? 'chip chip-warning' : 'chip'}>
          {choice.chipWord}
        </span>
      </div>

      <div className="card-body stack">
        <p className="read">{choice.why}</p>

        {choice.deletionWarning !== null && (
          <p className="note note-warning read">
            <Glyph name="delete" size="inline" decorative />
            <span>{choice.deletionWarning}</span>
          </p>
        )}

        <div className="stack-tight">
          {choice.sides.map((side) => (
            <p key={side.side} className="muted read">
              <strong>{side.whose}:</strong> {side.summary}
            </p>
          ))}
        </div>

        {choice.differing.length > 0 && <Compare rows={choice.differing} sides={choice.sides} />}

        {choice.identical.length > 0 && (
          <details className="disclose">
            <summary>
              The same on both versions
              <span className="count">{choice.identical.length}</span>
            </summary>
            <div className="card-body">
              <Compare rows={choice.identical} sides={choice.sides} />
            </div>
          </details>
        )}

        <p className="read">{choice.whatHappensNext}</p>

        {/* No source wired means `press` is null, no answer can reach the core, and no button is
            offered. A control that cannot do what its words say is worse than no control — the same
            reason the synchronisation indicator is a status region rather than a tap today.

            The handler is passed THROUGH and never assembled here: WHICH clash and WHICH side are
            bound in `divergence-picker.ts`, so the object a test invokes is the object this button
            carries. Answering a different question than the one drawn beside the button is the one
            mistake a picker can make that nobody would ever see. */}
        <div className="inline">
          {choice.sides.map((side) =>
            side.press === null ? null : (
              <button
                key={side.side}
                type="button"
                className={side.deleted ? 'btn btn-danger' : 'btn btn-primary'}
                onClick={() => void side.press?.()}
              >
                {side.buttonLabel}
              </button>
            ),
          )}
        </div>
      </div>
    </section>
  );
}

export function DivergencePickerScreen() {
  const { checked, pending, resolve } = useDivergences();
  const queue = describeQueue(pending, checked);
  const choices = describeChoices(pending, resolve);

  return (
    <div className="screen">
      <section className="card stack" aria-labelledby="screen-divergences">
        <h2 id="screen-divergences" className="title-screen">
          {queue.title}
        </h2>
        {/* THE FIGURE IS A CLAIM, so it is drawn only where it was counted. Nothing compared the
            devices in this build, and a nought under this title would be the reassuring answer
            arrived at by never having looked — the same rule the admin screen states about the
            removals count, and the reason this branch exists at all. */}
        {queue.count !== null && <p className="value-display">{queue.count}</p>}
        <p className="screen-intro read">{queue.intro}</p>
      </section>

      {choices.map((choice) => (
        <ChoiceCard key={choice.recordId} choice={choice} />
      ))}
    </div>
  );
}
