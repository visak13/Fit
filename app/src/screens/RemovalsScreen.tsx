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
 * ## AND THE REMOTE HALF IS HERE NOW, WHICH IS WHAT MAKES THE DISTINCTION BELOW WORTH DRAWING
 *
 * A pass reads this device's area BACK and reports which of the departed client's records it still
 * found. For a removal the report NAMES, this screen says plainly that their records are still in his
 * backup — the strong claim, made in the one place it is actually known. For every other removal the
 * words are unchanged, because an absent entry means the check did not run at least as often as it
 * means it came back clear. There is deliberately NO sentence anywhere for the empty case.
 *
 * A removal may also carry something the purge could not clean at all: a queued file naming this
 * client and another one, left alone on purpose because opening it is impossible and deleting it
 * would take the other client's data. That is drawn inside the removal it belongs to, and it says
 * WILL NOT CLEAR ON ITS OWN, because everything else on this screen does.
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
 * ## AND THERE IS A THIRD STATE NOW: THE STORE MAY NOT HAVE OPENED
 *
 * This screen reads from the local database, and a local database can refuse — a private window, a
 * device with no room, a second window holding the old version open. When it has, this screen says
 * SO, and it says what he can do about it, in his words and never as an exception message.
 *
 * It emphatically does not fall back on the empty reading. "Nothing is waiting" is the reassuring
 * answer, and reporting it from a store that never opened would be this surface telling him every
 * removal is confirmed gone on the strength of never having looked — the same failure as the one
 * `core/sync/deletions.js` opens by naming, arriving through the screen built to correct it.
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
import { LocalStoreNotice, useLocalStore } from '../platform/LocalStore';
import { useRemovals } from '../shell/Removals';
import {
  NO_NAME_IS_DELIBERATE, REMOVALS_TITLE, describeFailedRemovalsRead, describeRemovals,
} from './removals';
import type { LeftBehindItem, RemovalItem } from './removals';
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

/**
 * A queued delivery the purge could not clean.
 *
 * It is drawn INSIDE the removal it belongs to and never as a card of its own, because it is not a
 * separate event: it is part of what this one removal did and did not achieve. And its
 * "will not clear" sentence is NOT folded — everything else on this screen resolves itself on the
 * next connected moment, and a thing that never will must not sit among them looking the same.
 */
function LeftBehindNote({ item }: { item: LeftBehindItem }) {
  return (
    <div className="note read stack">
      <p>
        <Glyph name="sync-failed" size="inline" decorative />
        <span>{item.whatItMeans}</span>
      </p>
      <p>{item.persists}</p>
      <p>{item.whatToDo}</p>
      <details className="disclose">
        <summary>
          What this app could not clean
          <span className="count">{item.forensic.length}</span>
        </summary>
        <div className="card-body">
          <Pairs pairs={item.forensic} />
        </div>
      </details>
    </div>
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
        {/* The WORD carries the state. The tone is a second channel and never the only one — which
            is why the confirmed-present case is a different WORD and not merely a louder colour. */}
        <span className={item.tried || item.confirmedPresent ? 'chip chip-warning' : 'chip'}>
          {item.chipWord}
        </span>
      </div>

      <div className="card-body stack">
        <p className="read">{item.whatHappened}</p>

        {/* Drawn ONLY when the read-back genuinely found something. There is no counterpart sentence
            for the empty case, and that is the whole discipline of this half: an absent still-present
            entry means nothing was checked at least as often as it means nothing was found. */}
        {item.foundWords !== null && <p className="read">{item.foundWords}</p>}

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

        {item.leftBehind.map((left) => (
          <LeftBehindNote key={left.entryId} item={left} />
        ))}

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
  const opening = useLocalStore();
  const reading = useRemovals();
  /**
   * THE READ FAILED, WHICH IS A THIRD STATE AND NOT A QUIET SCREEN.
   *
   * The store-open branch below discriminates STORE-DID-NOT-OPEN from OPEN and says nothing about a
   * read that failed AFTER opening — which is exactly how the defect survived: the guard existed,
   * looked like it covered this, and did not. `shell/Removals.tsx` states the whole of it.
   */
  if (reading.status === 'failed') {
    const couldNotRead = describeFailedRemovalsRead(reading.failure);
    return (
      <div className="screen">
        <section className="card stack" aria-labelledby="screen-removals">
          <h2 id="screen-removals" className="title-screen">{couldNotRead.title}</h2>
          {/*
            NO FIGURE IS DRAWN HERE, and its absence is the fix. The count in this position is the
            first thing on the screen and it used to read `0` after a failed read — a nought this
            app never counted, above a sentence saying every removal was confirmed gone from a
            backup it had not looked at.
          */}
          <div className="note read" role="status">
            <Glyph name="sync-failed" size="inline" decorative />
            <div className="stack-tight">
              <span>{couldNotRead.headline}</span>
              <span>{couldNotRead.whatFailed}</span>
              <span>{couldNotRead.notAVerdict}</span>
              <span className="muted">{couldNotRead.whatToDo}</span>
              <span className="muted">{`${couldNotRead.stage} · ${couldNotRead.errorName}`}</span>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const report = describeRemovals(reading);
  const known = opening.state === 'open';

  return (
    <div className="screen">
      <section className="card stack" aria-labelledby="screen-removals">
        {/* The heading is drawn in every state, so a coach who arrived from a link still knows where
            he is even when the screen cannot tell him anything else. */}
        <h2 id="screen-removals" className="title-screen">
          {known ? report.title : REMOVALS_TITLE}
        </h2>

        {/*
          THE FIGURE AND THE ANSWER ARE DRAWN ONLY WHEN THE STORE IS OPEN, and that is the whole
          point of this branch. The empty reading says "nothing is waiting", which on a device whose
          storage never opened would be a nought this app never counted and a sentence saying every
          removal is confirmed gone — the exact false good news `removals.ts` exists to prevent. What
          is NOT known is said instead, and it is said in his words.
        */}
        {known ? (
          <>
            <p className="value-display">{report.count}</p>
            <p className="screen-intro read">{report.intro}</p>

            {/* The one figure the remote half adds, and it is drawn only when it is non-zero. A row
                reading "0 found still in your backup" would be the reassuring answer built out of a
                verify step that, on most passes, never ran at all. */}
            {report.confirmedPresentWords !== null && (
              <p className="note read">
                <Glyph name="sync-failed" size="inline" decorative />
                <span>{report.confirmedPresentWords}</span>
              </p>
            )}

            {/* Drawn in BOTH states, as a plain note rather than a warning: it is equally true on the
                good day, and a permanent warning band is one he stops seeing. */}
            <p className="note read">
              <Glyph name="note" size="inline" decorative />
              <span>{report.meaning}</span>
            </p>

            {report.moreWords !== null && <p className="muted read">{report.moreWords}</p>}
          </>
        ) : (
          <LocalStoreNotice opening={opening} />
        )}
      </section>

      {known && report.items.map((item) => <RemovalCard key={item.deletionId} item={item} />)}
    </div>
  );
}
