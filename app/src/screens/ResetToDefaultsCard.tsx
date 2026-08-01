/**
 * THE RESET CONTROL — the card that finally gives `core/seed/reset.js` a caller.
 *
 * `resetToDefaults` and `describeReset` have been correct, tested and CALLED BY NOTHING since the
 * seed step, which made the shipped library a one-way door: the app puts it in once and never again
 * on its own, deliberately, so that a routine the coach deletes stays deleted. Until this card
 * existed there was no path back to it at all.
 *
 * It is its own component rather than markup inside the admin screen for the reason the full export
 * card gives: the screen is a file several actions land in, and a lost update between two authors
 * is harder to see than a conflict. The capability and its tests live here; only the mount is
 * shared.
 *
 * ## EVERY JUDGEMENT IS SOMEWHERE A TEST CAN DRIVE IT
 *
 * `core/seed/reset.js` decides what a reset does and what it would do to his library today.
 * `reset-to-defaults-source.ts` reads the library to the end, runs the referential check the store
 * cannot, and hands the backup to the core as the argument that blocks a reset when it fails.
 * `reset-to-defaults.ts` owns every sentence. This file is markup and four pieces of state.
 *
 * ## THE ORDER ON SCREEN IS THE ORDER OF THE DECISION
 *
 * What it destroys, then why it is here, then what it cannot reach, then the figures for HIS
 * library, then the backup question, then the two buttons. The safe control is `.btn-primary` and
 * the destructive one is `.btn-danger` beside it — the arrangement `ClientsScreen.tsx` measured, and
 * the opposite of the one that makes "yes" the reflex.
 *
 * ## THE DESTRUCTIVE BUTTON IS ABSENT UNTIL THE BACKUP QUESTION HAS AN ANSWER
 *
 * Absent, not disabled, and its label CARRIES the answer — "Save a copy and restore the library" or
 * "Restore the library without a copy" — so he never has to look in two places to know whether a
 * copy is being taken. A greyed-out button would say "this is the thing to press, later" about the
 * one act on this screen he must not be waiting to press, and a bare "Restore" beside a tick box is
 * how a coach ends up restoring without the copy he thought he had asked for.
 */

import { Fragment, useEffect, useState } from 'react';

import type { LocalStore } from '../../core/store/local-store.js';
import { Glyph } from '../design/Glyph';
import { anchorDownload, browserSharing } from '../platform/share-delivery';
import {
  confirmLabelFor, describeBackupOffer, describeResetConfirmation, describeResetFailure,
  describeResetOutcome, MAKING_THE_BACKUP, RESET_TITLE, RESTORING, SEE_WHAT_WOULD_CHANGE,
  WHAT_IT_DESTROYS,
} from './reset-to-defaults';
import type { BackupState, ResetOutcome, ResetPlanReading } from './reset-to-defaults';
import { readResetPlan, restoreShippedLibrary } from './reset-to-defaults-source';
import type { BackupSurfaces } from './reset-to-defaults-source';

/** Said before the plan has been read, because the figures are about HIS library and are not known. */
export const READING_YOUR_LIBRARY = 'Reading your library...';

/** Said when there is no local database to read, so no figure is invented from never having looked. */
export const LIBRARY_NOT_KNOWN_YET =
  'Your library has not been read on this device yet, so there is nothing to say about what '
  + 'restoring it would change.';

/** The real browser, named in one place and only here. */
function browserBackupSurfaces(): BackupSurfaces {
  return {
    sharing: browserSharing(window.navigator),
    download: anchorDownload(
      { createAnchor: () => document.createElement('a') },
      { create: (file) => URL.createObjectURL(file), revoke: (url) => { URL.revokeObjectURL(url); } },
    ),
  };
}

export function ResetToDefaultsCard({ store, surfaces }: {
  store: LocalStore | null;
  /** The browser, injectable so every path here is drivable with no browser at all. */
  surfaces?: BackupSurfaces;
}) {
  const [asking, setAsking] = useState(false);
  const [plan, setPlan] = useState<ResetPlanReading | null>(null);
  const [backup, setBackup] = useState<BackupState>('unanswered');
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<ResetOutcome | null>(null);

  useEffect(() => {
    if (store === null || !asking) return undefined;
    let live = true;
    void readResetPlan(store).then(
      (read) => { if (live) setPlan(read as unknown as ResetPlanReading); },
      (error: unknown) => {
        // NOTHING IS PUBLISHED ON A FAILED READ. An empty plan reads as "this would change
        // nothing", which is the reassuring answer arrived at by not having looked.
        console.error('[reset] the reset plan could not be read from the local store', error);
      },
    );
    return () => { live = false; };
  }, [store, asking]);

  function ask(open: boolean): void {
    setAsking(open);
    // The backup answer is minted with the panel and never remembered across an opening: an answer
    // given before an evening of editing is an answer about a different library.
    setBackup('unanswered');
    setPlan(null);
    setOutcome(null);
  }

  const offer = describeBackupOffer(backup);
  const confirmLabel = confirmLabelFor(backup);
  const confirmation = plan === null ? null : describeResetConfirmation(plan);

  async function restore(): Promise<void> {
    if (store === null || !offer.answered) return;
    setRunning(true);
    setOutcome(null);
    try {
      const result = await restoreShippedLibrary(store, {
        withBackup: backup === 'with-backup',
        surfaces: surfaces ?? browserBackupSurfaces(),
      });
      setOutcome(describeResetOutcome(result));
      setAsking(false);
    } catch (error: unknown) {
      // Every throw on that path leaves the library untouched, and the sentence says so. The
      // refusal's own words are carried through rather than reworded.
      setOutcome(describeResetFailure(error));
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="card card-tight" aria-labelledby="admin-reset">
      <div className="card-header">
        <h3 id="admin-reset" className="title-section">{RESET_TITLE}</h3>
      </div>

      <div className="card-body stack">
        {/* WHAT IT DESTROYS, PERMANENTLY AND BEFORE HE OPENS ANYTHING. It never folds: the
            difference between what this reaches and what it cannot is the entire question the card
            exists to answer, and disclosure is for detail BEHIND a decision. */}
        <p className="read">{WHAT_IT_DESTROYS}</p>

        {outcome !== null && (
          <p className={outcome.failed ? 'note note-danger read' : 'note read'} role="status">
            <Glyph name={outcome.failed ? 'sync-failed' : 'note'} size="inline" decorative />
            <span className="stack-tight">
              <strong>{outcome.headline}</strong>
              <span>{outcome.detail}</span>
            </span>
          </p>
        )}

        {!asking && (
          <div className="inline">
            <button
              type="button"
              className="btn"
              disabled={running || store === null}
              onClick={() => ask(true)}
            >
              <Glyph name="link-forward" size="inline" decorative />
              <span>{SEE_WHAT_WOULD_CHANGE}</span>
            </button>
          </div>
        )}

        {asking && store === null && <p className="read" role="status">{LIBRARY_NOT_KNOWN_YET}</p>}

        {asking && store !== null && confirmation === null && (
          <p className="muted read" role="status">{READING_YOUR_LIBRARY}</p>
        )}

        {asking && confirmation !== null && (
          <div className="stack" role="group" aria-label={confirmation.title}>
            <strong>{confirmation.title}</strong>
            <p className="read">{confirmation.whyItIsInAdmin}</p>
            <p className="note read">
              <Glyph name="note" size="inline" decorative />
              <span>{confirmation.leftAlone}</span>
            </p>

            {confirmation.changesNothingWords !== null ? (
              <p className="read">{confirmation.changesNothingWords}</p>
            ) : (
              <dl className="pairs">
                {confirmation.consequences.map((line) => (
                  <Fragment key={line.label}>
                    <dt className="pair-label">{line.label}</dt>
                    <dd className="pair-value">
                      <span className="stack-tight">
                        <span>{line.value}</span>
                        {line.names.length > 0 && (
                          <span className="muted read">{line.names.join('; ')}</span>
                        )}
                      </span>
                    </dd>
                  </Fragment>
                ))}
              </dl>
            )}

            {/* THE OFFER, AND IT IS ANSWERED BEFORE THERE IS ANYTHING TO PRESS. */}
            <div className="stack-tight">
              <strong>{offer.heading}</strong>
              <p className="read">{offer.words}</p>
              <div className="inline">
                <button
                  type="button"
                  className={backup === 'with-backup' ? 'btn btn-primary' : 'btn'}
                  disabled={running}
                  onClick={() => setBackup('with-backup')}
                >
                  <Glyph name="backup" size="inline" decorative />
                  <span>{offer.takeLabel}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-quiet"
                  disabled={running}
                  onClick={() => setBackup('without-backup')}
                >
                  {offer.declineLabel}
                </button>
              </div>
            </div>

            <div className="inline">
              <button
                type="button"
                className="btn btn-primary"
                disabled={running}
                onClick={() => ask(false)}
              >
                {confirmation.cancelLabel}
              </button>
              {/* Absent, not disabled, until the backup question has an answer. See the header. */}
              {confirmLabel !== null && (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={running}
                  onClick={() => { void restore(); }}
                >
                  <Glyph name="delete" size="inline" decorative />
                  <span>
                    {running
                      ? (backup === 'with-backup' ? MAKING_THE_BACKUP : RESTORING)
                      : confirmLabel}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
