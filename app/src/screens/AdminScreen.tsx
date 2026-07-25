/**
 * ADMIN — and, for now, the only screen with real content: THIS DEVICE'S OWN RECORD.
 *
 * It shows which build is running and exactly what the browser answered when asked to persist
 * storage, including the case where it refused, where it is unsupported, and where the request
 * failed. It states the literal value rather than a friendly interpretation of it, because the
 * value is the evidence and an interpretation is not. What each state SAYS is derived in
 * `admin-report.ts`, where it can be asserted; this file is the drawing and nothing else.
 *
 * ## Why this screen is where the dense-screen rule gets its worked example
 *
 * It is the one screen today with genuinely a lot to say, and six later screens will copy whatever
 * is left here — so the ordering is the point, not the content. `app/DESIGN.md` names four steps and
 * the first two are what this screen is built out of:
 *
 *   ONE FIGURE THE SCREEN IS FOR. The room used on this device, as a `.value-display`, with the
 *   sentence that gives it scale directly under it. Everything else is subordinate and looks it.
 *
 *   THE SECONDARY FOLDS, AND IS COUNTED. The forensic half of the persistence record sits in a
 *   `<details className="disclose">` whose summary carries the count, so what is folded is still
 *   accounted for. NOTHING IS DELETED — the split is decided in `admin-report.ts` and tested there,
 *   including that a failure can never fold, because a failure is the one field that changes what
 *   the coach should do next and disclosure is for detail BEHIND a decision, never the decision.
 *
 * And one thing the contract's list does not say, which this screen is the argument for:
 *
 *   ONE CARD PER QUESTION. "Is my data safe on this device" and "which build am I running" are asked
 *   at two different moments, and a card each is what lets him find the one he came for without
 *   reading the other. The cards are `.card-tight` with `.card-header` and `.card-body`, which is
 *   what lets the folded section's own edge run the full width of the card rather than float inside
 *   a padded box — that is why the primitive has both forms.
 *
 * ## The sentence that is a constant
 *
 * `PERSISTENCE_IS_NOT_IMMUNITY` is one constant so that exactly one sentence in the application says
 * a storage grant is not immunity — it stops the browser evicting data on its own, it does not
 * survive removing the installed icon, and it does not survive clearing site data. IT IS NOT
 * REWORDED HERE OR ANYWHERE. It is drawn as a plain `.note`, not `.note-warning`: it is equally true
 * on the good day, and a permanent warning band is one he stops seeing by the second week — which
 * would take the sentence with it. A companion says this once, plainly, and keeps saying it.
 */

import { Fragment } from 'react';

import { Glyph } from '../design/Glyph';
import { Tooltip } from '../design/Tooltip';
import { PERSISTENCE_IS_NOT_IMMUNITY } from '../platform/storage-persistence';
import { usePlatformStatus } from '../platform/platform-status';
import type { Destination } from '../shell/navigation';
import { describePersistence, describeStorage } from './admin-report';
import type { ReportPair } from './admin-report';

/** The label-and-value primitive from the contract. The screen invents nothing of its own here. */
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
 * The help beside a value a non-technical person could genuinely be stuck on.
 *
 * There are exactly two on this screen and there is no third. Everything needed to USE the screen is
 * already written on the screen permanently — these two add the thing a coach might wonder about and
 * cannot be blocked by, which is precisely what makes a tooltip safe to be unreachable on a phone.
 */
function Help({ about, text }: { about: string; text: string }) {
  return (
    <Tooltip text={text}>
      <button type="button" className="icon-btn" aria-label={`What ${about} means`}>
        <Glyph name="help-explain" decorative />
      </button>
    </Tooltip>
  );
}

export function AdminScreen({ destination }: { destination: Destination }) {
  const { buildStamp, persistence, offlineStart } = usePlatformStatus();
  const report = describePersistence(persistence);
  const storage = describeStorage(persistence);

  return (
    <div className="screen">
      <section className="card stack" aria-labelledby="screen-admin">
        <h2 id="screen-admin" className="title-screen">
          {destination.label}
        </h2>
        <p className="screen-intro">{destination.summary}</p>
      </section>

      <section className="card card-tight" aria-labelledby="admin-device">
        <div className="card-header">
          <h3 id="admin-device" className="title-section">
            This device
          </h3>
          <span className="spacer" />
          {/* The WORD carries the state. The tone is a second channel and never the only one. */}
          <span className={report.tone === 'success' ? 'chip chip-success' : 'chip'}>
            {report.word}
          </span>
          <Help
            about="keeping the data"
            text="Whether this browser has agreed to hold on to your clients, routines and sessions when the device runs short of room. Your backup is what actually protects them either way."
          />
        </div>

        <div className="card-body stack">
          <div className="stack-tight">
            <p className="value-display">{storage.used}</p>
            <p className="muted read">{storage.capacity}</p>
          </div>

          <p className="read">{report.plainWords}</p>

          <Pairs pairs={report.permanent} />

          <p className="note read">
            <Glyph name="note" size="inline" decorative />
            <span>{PERSISTENCE_IS_NOT_IMMUNITY}</span>
          </p>
        </div>

        {report.folded.length > 0 && (
          <details className="disclose">
            <summary>
              The full answer this device gave
              <span className="count">{report.folded.length}</span>
            </summary>
            <div className="card-body">
              <Pairs pairs={report.folded} />
            </div>
          </details>
        )}
      </section>

      <section className="card card-tight" aria-labelledby="admin-build">
        <div className="card-header">
          <h3 id="admin-build" className="title-section">
            This build
          </h3>
          <span className="spacer" />
          <Help
            about="the build"
            text="A short code for the exact version running on this device. Read it out if you are asked which one you have."
          />
        </div>

        <div className="card-body stack">
          <dl className="pairs">
            <dt className="pair-label">Build</dt>
            <dd className="pair-value">
              <code>{buildStamp}</code>
            </dd>

            <dt className="pair-label">Starts without a network</dt>
            <dd className="pair-value">
              {offlineStart.registered
                ? 'Yes — this device can open the application with no connection.'
                : `No — ${offlineStart.reason ?? 'the offline worker was not registered'}`}
            </dd>
          </dl>

          <p className="muted read">
            The build value identifies the source this application was built from. If it does not
            match what the repository says was published, the site is serving an older build.
          </p>
        </div>
      </section>
    </div>
  );
}
