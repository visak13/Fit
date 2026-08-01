/**
 * CHANGES THAT STOPPED — where the coach learns WHICH change stopped, what the service said, and what
 * to do about it.
 *
 * Until this screen existed he was told a number and nothing else: the permanent indicator says "3
 * changes will not back up without you", which is right and is not enough. A count he cannot act on is
 * a count he learns to live with.
 *
 * This file is the DRAWING and nothing else. Every judgement it renders — the two groups' different
 * words, what is permanent and what folds, what to do about each condition, and which action code each
 * group answers — is decided in `stopped-changes.ts`, where it can be asserted. The test runner here is
 * `node --test` over `.ts`, so a judgement written into markup is a judgement nothing checks.
 *
 * ## TWO SECTIONS, NEVER ONE LIST, AND THE ORDER IS NOT COSMETIC
 *
 * `needsAttention` in `core/outbox/status.js` hands over two pages and says why: the two need different
 * words in front of the coach, and merging them would force this surface to re-derive which is which.
 * So the refused ones and the unconfirmed ones are two headed sections with their own explanation and
 * their own advice. "These failed" is the one sentence that is definitely wrong about an unconfirmed
 * entry — it may be in the backup right now — and one merged list is how that sentence would end up
 * over both.
 *
 * ## Where the dense-screen rule lands here
 *
 * ONE FIGURE THE SCREEN IS FOR: how many changes are stopped. It is why he opened the screen, and on
 * almost every visit it is nought, which is a good state and is worded as one.
 *
 * THE SECONDARY FOLDS AND IS COUNTED: the forensic half of each entry — references, identifiers, how
 * many times it was tried — goes into a `<details className="disclose">` with the count on its summary.
 * Nothing is discarded; it is what he reads out to whoever is helping him.
 *
 * AND ONE THING NEVER FOLDS: the identifiers on an unconfirmed entry. They are not detail behind a
 * decision, they ARE the decision — the whole reason a person can settle a case the queue refuses to
 * guess at — and disclosure is for the first, never the second. Same rule as the deletion warning on
 * the divergence picker and the persistence failure on Admin.
 *
 * ONE CARD PER QUESTION: one stopped change, one card. Two are two separate things to sort out.
 */

import { Fragment } from 'react';

import { Glyph } from '../design/Glyph';
import { useStoppedChanges } from '../shell/StoppedChanges';
import { describeStoppedChanges } from './stopped-changes';
import type { StoppedGroup, StoppedItem } from './stopped-changes';
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

function StoppedCard({ item }: { item: StoppedItem }) {
  const headingId = `stopped-${item.entryId}`;

  return (
    <section className="card card-tight" aria-labelledby={headingId}>
      <div className="card-header">
        <h4 id={headingId} className="title-section">
          {item.what}
        </h4>
        <span className="spacer" />
        <span className="chip">{item.whenStopped}</span>
      </div>

      <div className="card-body stack">
        {/* THE SERVICE'S OWN WORDS, drawn as a quotation and not as prose of ours. The surrounding
            sentence is this application's; the sentence inside is Google's, verbatim, because the
            coach may have to read it out and a reworded version is not what was said. */}
        {item.whyVerbatim !== null && (
          <blockquote className="note read">
            <Glyph name="sync-failed" size="inline" decorative />
            <span>{item.whyVerbatim}</span>
          </blockquote>
        )}

        {item.whyMissing !== null && <p className="read muted">{item.whyMissing}</p>}

        {/* PERMANENT, never folded. See the note at the top of this file. */}
        {item.identifiers.length > 0 && (
          <div className="stack-tight">
            <p className="read">
              <strong>More than one thing answered to this name. All of them:</strong>
            </p>
            <ul className="rows">
              {item.identifiers.map((identifier) => (
                <li key={identifier} className="row-static">
                  <code>{identifier}</code>
                </li>
              ))}
            </ul>
          </div>
        )}

        {item.records > 0 && (
          <p className="muted read">
            {item.records === 1
              ? 'This change carried 1 record.'
              : `This change carried ${item.records} records.`}
          </p>
        )}
      </div>

      <details className="disclose">
        <summary>
          The full record of this one
          <span className="count">{item.forensic.length}</span>
        </summary>
        <div className="card-body">
          <Pairs pairs={item.forensic} />
        </div>
      </details>
    </section>
  );
}

/** One of the two groups. Its own heading, its own explanation, its own advice — never shared. */
function Group({ group }: { group: StoppedGroup }) {
  const headingId = `stopped-group-${group.status}`;

  return (
    <section className="card stack" aria-labelledby={headingId} data-group={group.status}>
      <div className="card-header">
        <h3 id={headingId} className="title-section">
          {group.heading}
        </h3>
        <span className="spacer" />
        <span className={group.settled ? 'chip chip-success' : 'chip chip-warning'}>
          {group.count}
        </span>
      </div>

      <p className="read">{group.explanation}</p>

      {group.settled ? (
        <p className="read muted">{group.nothingWords}</p>
      ) : (
        <>
          <p className="note read">
            <Glyph name="note" size="inline" decorative />
            <span>{group.whatToDo}</span>
          </p>

          {group.moreWords !== null && <p className="muted read">{group.moreWords}</p>}

          {group.items.map((item) => (
            <StoppedCard key={item.entryId} item={item} />
          ))}
        </>
      )}
    </section>
  );
}

export function StoppedChangesScreen() {
  const review = describeStoppedChanges(useStoppedChanges());

  return (
    <div className="screen">
      <section className="card stack" aria-labelledby="screen-stopped-changes">
        <h2 id="screen-stopped-changes" className="title-screen">
          {review.title}
        </h2>
        {/* THE FIGURE IS A CLAIM and it is drawn only where the queue was read. Nothing reads it in
            this build, and a nought under this title is the reassuring answer arrived at by never
            having looked — the rule the admin screen already states about the removals count. */}
        {review.count !== null && <p className="value-display">{review.count}</p>}
        <p className="screen-intro read">{review.intro}</p>
        {review.nothingHappensByItself !== null && (
          <p className="note read">
            <Glyph name="note" size="inline" decorative />
            <span>{review.nothingHappensByItself}</span>
          </p>
        )}
      </section>

      {/* THE GROUPS ARE DRAWN ONLY WHERE THE QUEUE WAS READ. Each carries its own settled sentence —
          "Google has not refused anything." and "Everything that was sent was confirmed one way or
          the other." — and both are the same unmeasured claim as the intro above, in smaller type
          and two cards further down where a correction to the headline would never have reached
          them. */}
      {review.checked && review.groups.map((group) => (
        <Group key={group.status} group={group} />
      ))}
    </div>
  );
}
