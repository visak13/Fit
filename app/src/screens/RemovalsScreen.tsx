/**
 * REMOVALS NOT YET CONFIRMED — where the coach learns that a client he deleted may not be out of his
 * backup yet.
 *
 * `core/sync/deletions.js` names the failure in its own first paragraph: a clinical reference living on
 * in a backup forever, and it is invisible, because nothing errors and the coach believes the client is
 * gone. The core built the honest record — a removal is marked propagated only after the area has been
 * read back and shown to be clear — and until this screen existed, nothing ever told him when that
 * read-back had not happened.
 *
 * This file is the DRAWING and nothing else. Every judgement — what a pending removal MEANS, the
 * different words for one that has been tried and one that has not, what to do about it, and what may
 * not be said about it — is decided in `removals.ts`, where it can be asserted.
 *
 * ## The two sentences this screen exists to keep straight
 *
 * NOT CONFIRMED IS NOT STILL THERE. `NOT_CONFIRMED_IS_NOT_STILL_THERE` is one constant and is drawn in
 * both states, permanently, as a plain `.note` and never as a warning band: it is equally true on the
 * good day, and a permanent warning is one he stops seeing by the second week, which would take the
 * sentence with it.
 *
 * AND THERE IS NO NAME, ON PURPOSE. The manifest holds the departed client's reference and nothing else
 * about them — identities only, no content of any kind — so this screen cannot say who. It says WHY it
 * cannot, in plain words, rather than showing a bare identifier and letting it read as a defect.
 *
 * ## Where the dense-screen rule lands here
 *
 * ONE FIGURE: how many removals are not yet confirmed. Almost always nought, which is a good state and
 * is worded as one.
 *
 * THE SECONDARY FOLDS AND IS COUNTED: the references and counts go into a `<details className="disclose">`
 * with the count on its summary. What NEVER folds is the sentence about what this state means and what to
 * do about it — disclosure is for detail behind a decision, never the decision.
 */

import { Fragment } from 'react';

import { Glyph } from '../design/Glyph';
import { useRemovals } from '../shell/Removals';
import { NO_NAME_IS_DELIBERATE, describeRemovals } from './removals';
import type { RemovalItem } from './removals';
import type { ReportPair } from './admin-report';

/** The label-and-value primitive from the contract, as the Admin screen draws it. */
function Pairs({ pairs }: { pairs: readonly ReportPair[] }) {
  return (
    <dl className="pairs">
      {pairs.map((pair) => (
        <Fragment key={pair.label}>
          <dt className="pair-label">{pair.label}</dt>
          <dd className="pair-value">{pair.literal ? <code>{pair.value}</code> : pair.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function RemovalCard({ item }: { item: RemovalItem }) {
  const headingId = `removal-${item.deletionId}`;

  return (
    <section className="card card-tight" aria-labelledby={headingId}>
      <div className="card-header">
        <h3 id={headingId} className="title-section">
          {item.heading}
        </h3>
        <span className="spacer" />
        {/* The WORD carries the state. The tone is a second channel and never the only one. */}
        <span className={item.tried ? 'chip chip-warning' : 'chip'}>{item.chipWord}</span>
      </div>

      <div className="card-body stack">
        <p className="read">{item.whatHappened}</p>

        {/* The failure text is whatever was recorded when a delivery reported one, and it is passed
            through untouched: he may have to read it out, and a reworded version is not what was said. */}
        {item.whyVerbatim !== null && (
          <blockquote className="note read">
            <Glyph name="sync-failed" size="inline" decorative />
            <span>{item.whyVerbatim}</span>
          </blockquote>
        )}

        <p className="note read">
          <Glyph name="note" size="inline" decorative />
          <span>{item.whatToDo}</span>
        </p>

        <dl className="pairs">
          <dt className="pair-label">Removed at</dt>
          <dd className="pair-value">
            <code>{item.requestedAt}</code>
          </dd>
          <dt className="pair-label">Their reference</dt>
          <dd className="pair-value">
            <code>{item.reference}</code>
          </dd>
        </dl>

        <p className="muted read">{item.scope}</p>
        <p className="muted read">{NO_NAME_IS_DELIBERATE}</p>
      </div>

      <details className="disclose">
        <summary>
          The full record of this removal
          <span className="count">{item.forensic.length}</span>
        </summary>
        <div className="card-body">
          <Pairs pairs={item.forensic} />
        </div>
      </details>
    </section>
  );
}

export function RemovalsScreen() {
  const report = describeRemovals(useRemovals());

  return (
    <div className="screen">
      <section className="card stack" aria-labelledby="screen-removals">
        <h2 id="screen-removals" className="title-screen">
          {report.title}
        </h2>
        <p className="value-display">{report.count}</p>
        <p className="screen-intro read">{report.intro}</p>

        {/* Drawn in BOTH states, as a plain note rather than a warning: it is equally true on the good
            day, and a permanent warning band is one he stops seeing. */}
        <p className="note read">
          <Glyph name="note" size="inline" decorative />
          <span>{report.meaning}</span>
        </p>

        {report.moreWords !== null && <p className="muted read">{report.moreWords}</p>}
      </section>

      {report.items.map((item) => (
        <RemovalCard key={item.deletionId} item={item} />
      ))}
    </div>
  );
}
