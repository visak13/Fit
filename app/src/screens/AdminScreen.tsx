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

import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Glyph } from '../design/Glyph';
import { Tooltip } from '../design/Tooltip';
import { LocalStoreNotice, useLocalStore } from '../platform/LocalStore';
import { PERSISTENCE_IS_NOT_IMMUNITY } from '../platform/storage-persistence';
import { usePlatformStatus } from '../platform/platform-status';
import { useAccountActionsIfWired } from '../shell/account-actions';
import { useDivergences } from '../shell/Divergences';
import { useKeyMaterial } from '../shell/KeyMaterial';
import { useRemovals } from '../shell/Removals';
import { useStoppedChanges } from '../shell/StoppedChanges';

import {
  DIVERGENCES_PATH, JOURNAL_PATH, KEY_MATERIAL_PATH, REMOVALS_PATH, SETUP_PATH,
  STOPPED_CHANGES_PATH,
} from '../shell/navigation';
import type { Destination } from '../shell/navigation';
import {
  describeAccountAct, describeEraseConfirmation, describePersistence, describeSignOutChoices,
  describeSignOutConfirmation, describeStorage,
} from './admin-report';
import type { ReportPair } from './admin-report';
import { BackupArchiveCard } from './BackupArchiveCard';
import { describeQueue } from './divergence-picker';
import { FullExportCard } from './FullExportCard';
import { JOURNAL_TITLE, WHAT_THE_CHECK_CAN_AND_CANNOT_DO } from './journal';
import { NOT_CHECKED_CHIP, describeAdminEntry } from './key-material-condition';
import { LibraryBackupCard } from './LibraryBackupCard';
import { describeFailedRemovalsAdminEntry, describeRemovalsAdminEntry } from './removals';
import { ResetToDefaultsCard } from './ResetToDefaultsCard';
import { RestoreBackupCard } from './RestoreBackupCard';
import { describeStandingFacts } from './standing-facts';
import { describeSetupAdminEntry } from './setup-surface';
import { publishStandingFacts } from './standing-facts-source';
import type { StandingFactsReading } from './standing-facts-source';
import { describeStoppedAdminEntry } from './stopped-changes';

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

/**
 * THE CALM, PERMANENT CARD — the one surface in this application that is not waiting for anything.
 *
 * Every other card on this screen reports a condition that will change: a decision to make, a
 * removal to confirm, a change to get backed up. This one reports the single condition in this build
 * that will NOT change on its own — an opaque queued payload naming a departed client and a staying
 * one, which `core/outbox/scrub.js` leaves alone deliberately and correctly because cleaning it would
 * destroy the staying client's data.
 *
 * ## WHY IT IS DRAWN QUIETLY, WHICH IS THE WHOLE DESIGN
 *
 * The obvious way to surface this is a needs-attention entry, and it is wrong: `core/status/levels.js`
 * floors the ladder at `overdue` while one exists, so an uncleanable entry would pin the coach's
 * indicator at overdue for ever on a condition he can never act on. A permanent alarm is what teaches
 * him to ignore the indicator. So there is no `chip-warning` and no `note-warning` anywhere in this
 * card, in any state — `standing-facts.ts` cannot even express a fault tone — and the fact is carried
 * by the WORDS, which say it plainly and go on saying it.
 *
 * ## IT IS PERMANENT, LIKE THE LINKS ABOVE IT
 *
 * Present whether or not it has anything to list, for the reason the other cards give: a card that
 * appears only when it has something to say is one nobody can find when they go looking, and its
 * empty state is a real answer — "nothing of anybody's was left behind here" — that he can only get
 * from a card that is there.
 *
 * ## AND IT SAYS WHEN IT HAS NOT LOOKED
 *
 * The reading is `null` until the store has been read, and a null reading draws "Not known yet"
 * rather than the settled sentence. `describeStandingFacts` holds those two apart; this file only
 * draws whichever one it was handed.
 */
export function StandingFactsCard({ reading }: { reading: StandingFactsReading | null }) {
  const report = describeStandingFacts(reading);

  return (
    <section className="card card-tight" aria-labelledby="admin-standing-facts">
      <div className="card-header">
        <h3 id="admin-standing-facts" className="title-section">
          {report.title}
        </h3>
        <span className="spacer" />
        {/* NEVER `chip-warning` OR `chip-danger`. See the header — the tone this card is allowed to
            take is decided in `standing-facts.ts` and there is no fault value to pick. */}
        <span className={report.tone === 'success' ? 'chip chip-success' : 'chip'}>
          {report.chip}
        </span>
      </div>

      <div className="card-body stack">
        <p className="read">{report.intro}</p>
        <p className="muted read">{report.meaning}</p>
        {report.moreWords !== null && <p className="muted read">{report.moreWords}</p>}

        {report.items.map((item) => (
          <div className="stack-tight" key={item.entry.entryId}>
            <strong>{item.heading}</strong>
            <p className="read">{item.stillHere}</p>
            <p className="read">{item.whatRemains}</p>
            <p className="read">{item.whereItIs}</p>
            <p className="read">{item.entry.whatItMeans}</p>
            {/* A plain `.note`, not `.note-warning`: it is equally true on a good day, and a warning
                band that can never come down is one he stops seeing by the second week — which would
                take the sentence with it. */}
            <p className="note read">
              <Glyph name="note" size="inline" decorative />
              <span>{item.entry.persists}</span>
            </p>
            <p className="read">{item.entry.whatToDo}</p>

            <details className="disclose">
              <summary>
                The references for this one
                <span className="count">{item.forensic.length}</span>
              </summary>
              <div className="card-body">
                <Pairs pairs={item.forensic} />
              </div>
            </details>
          </div>
        ))}

        {report.noName !== null && <p className="muted read">{report.noName}</p>}
      </div>
    </section>
  );
}

/**
 * THE WAY OUT OF THIS DEVICE — and the card that finally gives both acts a caller.
 *
 * `platform/google-account.ts` has held `signOutOfGoogle` and `signOutAndEraseThisDevice` since the
 * Google step, correct and tested and CALLED BY NOTHING, so the coach could not sign out at all.
 * This is the reach. Not one line of the mechanism is repeated here: the gate, the acknowledgement
 * and the erasure are all its, the words are `admin-report.ts`'s, and this file draws them.
 *
 * ## ONE PANEL AT A TIME, AND THE SAFE CHOICE IS ALWAYS THE PROMINENT ONE
 *
 * Asking about one act closes the other, so the two confirmations can never be on screen together
 * with two buttons a hand's width apart. Inside each panel the cancel is `.btn-primary` and the
 * destructive one is `.btn-danger` beside it — the arrangement `ClientsScreen.tsx` measured, and the
 * opposite of the one that makes "yes" the reflex.
 *
 * ## THE ERASE BUTTON IS ABSENT RATHER THAN DISABLED WHEN THE GATE REFUSES
 *
 * `describeEraseConfirmation` returns a null `confirmLabel` on a `wait`, and a control with no words
 * is not drawn. A greyed-out button would say "this is the thing to press, later" about an act he
 * must NOT be waiting to press — the refusal's own advice is to connect and sync, which is
 * elsewhere. And the acknowledgement tick appears only where the gate mints one, so the tick cannot
 * become a way to click past a `wait`.
 *
 * ## AND THE WHOLE CARD IS ABSENT WHEN NOTHING SUPPLIED THE ACTS
 *
 * Not disabled, and not drawn with its explanation and no buttons. The honest rendering of "no way
 * to act was supplied" is nothing at all — a card describing two acts it cannot perform would be
 * this screen telling him he can sign out when he cannot, which is the exact shape of defect this
 * step exists to close. `sign-out-control.test.ts` is the guard on that trade: it renders the real
 * screen with and without the provider, so absence here can never quietly become absence in the
 * application.
 */
function SignOutCard() {
  const acts = useAccountActionsIfWired();
  const [asking, setAsking] = useState<'sign-out' | 'erase' | null>(null);
  // Reset with the panel, never remembered across an opening: an acknowledgement is minted from the
  // reading that named what would be lost, and a tick that survived a close would be one he made
  // about a different queue.
  const [acknowledged, setAcknowledged] = useState(false);

  const choices = describeSignOutChoices();
  const signOutConfirmation = describeSignOutConfirmation();

  function ask(which: 'sign-out' | 'erase' | null) {
    setAsking(which);
    setAcknowledged(false);
  }

  // See the header. Every hook above runs first, unconditionally, because they must.
  if (acts === null) return null;

  // THE FIGURES COME WITH THE ACTS, so the panel that names what is at risk and the gate that
  // refuses are reading one object. This screen calls no status hook of its own — the frame owns the
  // one synchronisation reading, and `frame-structure.test.ts` holds it to that.
  const eraseConfirmation = describeEraseConfirmation(acts.figures);
  const report = acts.last === null ? null : describeAccountAct(acts.last);

  return (
    <section className="card card-tight" aria-labelledby="admin-sign-out">
      <div className="card-header">
        <h3 id="admin-sign-out" className="title-section">
          {choices.title}
        </h3>
      </div>

      <div className="card-body stack">
        <p className="read">{choices.intro}</p>

        {/*
          WHAT EACH ONE DESTROYS, BEFORE EITHER IS PRESSED. Both descriptions are permanent and
          neither folds: the difference between them is the entire question this card exists to
          answer, and progressive disclosure is for the detail BEHIND a decision, never for the
          thing the decision is about.
        */}
        <dl className="pairs">
          <dt className="pair-label">{choices.plain.label}</dt>
          <dd className="pair-value">{choices.plain.whatItDestroys}</dd>
          <dt className="pair-label">{choices.erase.label}</dt>
          <dd className="pair-value">{choices.erase.whatItDestroys}</dd>
        </dl>

        {report !== null && (
          <p className={report.failed ? 'note note-danger read' : 'note read'}>
            <Glyph name={report.failed ? 'sync-failed' : 'note'} size="inline" decorative />
            <span className="stack-tight">
              <strong>{report.headline}</strong>
              <span>{report.detail}</span>
              {report.verbatim !== null && <span className="muted">{report.verbatim}</span>}
            </span>
          </p>
        )}

        {asking === null && (
          <div className="inline">
            <button
              type="button"
              className="btn"
              disabled={acts.running}
              onClick={() => ask('sign-out')}
            >
              <Glyph name="sign-out" size="inline" decorative />
              <span>{choices.plain.label}</span>
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={acts.running}
              onClick={() => ask('erase')}
            >
              <Glyph name="sign-out-and-erase-this-device" size="inline" decorative />
              <span>{choices.erase.label}</span>
            </button>
          </div>
        )}

        {asking === 'sign-out' && (
          <div className="stack" role="group" aria-label={signOutConfirmation.title}>
            <strong>{signOutConfirmation.title}</strong>
            <p className="read">{signOutConfirmation.whatWillHappen}</p>
            {/* THE SENTENCE HE COULD NOT HAVE GUESSED. Its own line, never folded into the one
                above it — see `admin-report.ts` for why the key slot is the part that has to be
                said rather than implied. */}
            <p className="note read">
              <Glyph name="protected-clinical-note" size="inline" decorative />
              <span>{signOutConfirmation.deviceKey}</span>
            </p>
            <div className="inline">
              <button
                type="button"
                className="btn btn-primary"
                disabled={acts.running}
                onClick={() => ask(null)}
              >
                {signOutConfirmation.cancelLabel}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={acts.running}
                onClick={() => {
                  acts.signOut();
                  ask(null);
                }}
              >
                {signOutConfirmation.confirmLabel}
              </button>
            </div>
          </div>
        )}

        {asking === 'erase' && (
          <div className="stack" role="group" aria-label={eraseConfirmation.title}>
            <strong>{eraseConfirmation.title}</strong>
            <p className="read">{eraseConfirmation.whatWillHappen}</p>
            <p className="note read">
              <Glyph name="protected-clinical-note" size="inline" decorative />
              <span>{eraseConfirmation.deviceKey}</span>
            </p>
            <p className="note note-danger read">
              <Glyph name="delete" size="inline" decorative />
              <span>{eraseConfirmation.cannotBeUndone}</span>
            </p>

            {/*
              THE REFUSAL, AND IT IS NEVER BARE. What is outstanding and whether it is still being
              retried are two separate sentences, because they lead to opposite actions: work still
              being retried needs him to connect and wait, and work that has stopped for good will
              never move however long he waits.
            */}
            {eraseConfirmation.refusal !== null && (
              <div className="note note-warning read">
                <Glyph name="sync-pending-warning" size="inline" decorative />
                <div className="stack-tight">
                  <strong>{eraseConfirmation.refusal.headline}</strong>
                  <span>{eraseConfirmation.refusal.whatIsOutstanding}</span>
                  <span>{eraseConfirmation.refusal.stillRetryingOrStopped}</span>
                  <span>{eraseConfirmation.refusal.whatToDo}</span>
                </div>
              </div>
            )}

            {eraseConfirmation.acknowledgeLabel !== null && (
              <label className="choice" htmlFor="erase-acknowledged">
                <input
                  id="erase-acknowledged"
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                <span>{eraseConfirmation.acknowledgeLabel}</span>
              </label>
            )}

            <div className="inline">
              <button
                type="button"
                className="btn btn-primary"
                disabled={acts.running}
                onClick={() => ask(null)}
              >
                {eraseConfirmation.cancelLabel}
              </button>
              {/* Absent, not disabled, when the gate refuses outright. See the header. */}
              {eraseConfirmation.confirmLabel !== null && (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={
                    acts.running
                    // The tick is his, and it gates the button rather than being remembered
                    // somewhere. Where the gate mints no acknowledgement there is none to make.
                    || (eraseConfirmation.acknowledgeLabel !== null && !acknowledged)
                  }
                  onClick={() => {
                    acts.eraseThisDevice(acknowledged);
                    ask(null);
                  }}
                >
                  <Glyph name="sign-out-and-erase-this-device" size="inline" decorative />
                  {eraseConfirmation.confirmLabel}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function AdminScreen({ destination }: { destination: Destination }) {
  const { buildStamp, persistence, offlineStart } = usePlatformStatus();
  const divergences = useDivergences();
  const keyMaterialReading = useKeyMaterial();
  const stoppedReading = useStoppedChanges();
  const removalsReading = useRemovals();
  // The removals entry below is the one thing on this screen read from the local store, so it is the
  // one thing that has to say when there is not one. Everything else here is a platform observation.
  const opening = useLocalStore();
  const storeIsOpen = opening.state === 'open';
  // THE STANDING FACTS ARE READ FROM THE STORE, not pushed down a seam, because the whole gap they
  // close is a manifest that has LEFT the pending set — so there is no reading already travelling
  // that carries them. Null until a real read lands: the card says "not known yet" rather than
  // inventing the reassuring answer out of never having looked.
  const [standingFacts, setStandingFacts] = useState<StandingFactsReading | null>(null);
  const store = opening.state === 'open' ? opening.store : null;

  useEffect(() => {
    if (store === null) return undefined;
    return publishStandingFacts(store, setStandingFacts);
  }, [store]);
  const report = describePersistence(persistence);
  const storage = describeStorage(persistence);
  const decisions = describeQueue(divergences.pending, divergences.checked);
  const keyMaterial = describeAdminEntry(keyMaterialReading.condition, keyMaterialReading.checked);
  const stopped = describeStoppedAdminEntry(stoppedReading);
  /**
   * A READ THAT FAILED IS A THIRD STATE HERE TOO, and `storeIsOpen` never covered it.
   *
   * That guard discriminates STORE-DID-NOT-OPEN from OPEN. A read that rejected AFTER the store
   * opened satisfies it, and used to reach the settled sentence below — "Nothing is waiting" — on
   * the card that decides whether he opens the screen at all.
   */
  const removalsReadFailed = removalsReading.status === 'failed';
  const removals = removalsReading.status === 'failed'
    ? describeFailedRemovalsAdminEntry()
    : describeRemovalsAdminEntry(removalsReading);
  const setup = describeSetupAdminEntry();

  return (
    <div className="screen">
      <section className="card stack" aria-labelledby="screen-admin">
        <h2 id="screen-admin" className="title-screen">
          {destination.label}
        </h2>
        <p className="screen-intro">{destination.summary}</p>
      </section>

      {/*
        THE WAY IN TO SETUP, AND IT IS FIRST ON THIS SCREEN.

        It is not here because it is the most important card — everything below reports something
        that can go wrong, and this reports nothing. It is first because it is the CLAIM THIS SCREEN
        ALREADY MAKES ABOUT ITSELF: the Admin destination's `help` tooltip in `shell/navigation.ts`
        says Admin is where "Setting up your Google account" happens, and that tooltip is the only
        reason a coach looking for it comes here at all. A promise answered eight cards down is one
        he scrolls past on a phone and concludes was not kept.

        NO CHIP AND NO COUNT, unlike every card under it. A setup is not a queue and there is nothing
        here that could be counted honestly — the ticks on that screen are HIS note of where he got
        to, not the application confirming anything, so a figure drawn from them here would be this
        screen quietly turning a claim into a proof one surface earlier.

        PERMANENT AND NOT CONDITIONAL on the setup being unfinished, for a reason the other links do
        not have: a coach coming back to change his coaching calendar a year later has finished
        setting up, and a way in that disappeared once it had been used would be one he cannot use
        twice. `no-dead-ends.test.ts` proves this link really resolves; `setup-surface.test.ts`
        proves the screen behind it is headed with the word the shipped calendar notice tells him to
        look for.
      */}
      <section className="card card-tight" aria-labelledby="admin-setup">
        <div className="card-header">
          <h3 id="admin-setup" className="title-section">
            {setup.title}
          </h3>
        </div>

        <div className="card-body stack">
          <p className="read">{setup.intro}</p>
          <p>
            <Link className="btn" to={`/${SETUP_PATH}`}>
              <Glyph name="link-forward" size="inline" decorative />
              <span>{setup.linkLabel}</span>
            </Link>
          </p>
        </div>
      </section>

      {/*
        THE WAY IN TO THE DIVERGENCE PICKER, and it is here PERMANENTLY rather than only when there
        is something waiting.

        A link that appears only when it has something to say is a link nobody can find when they go
        looking, and it makes the screen it leads to unreachable for the whole of the time it is
        empty — which is almost always. The count is on the chip, so an empty queue is answered
        without leaving this screen; `no-dead-ends.test.ts` is what proves the link is really here
        and really resolves, for a route the navigation surface deliberately does not carry.
      */}
      <section className="card card-tight" aria-labelledby="admin-decisions">
        <div className="card-header">
          <h3 id="admin-decisions" className="title-section">
            {decisions.title}
          </h3>
          <span className="spacer" />
          {/* THE SAME RULE AS THE REMOVALS CARD BELOW, and it arrived here for the same reason: a
              figure is a claim, and nothing in this build compares the two devices. A green nought
              would be this card reporting agreement on the strength of never having looked. A WORD
              stands in its place. */}
          {decisions.checked ? (
            <span className={decisions.settled ? 'chip chip-success' : 'chip chip-warning'}>
              {decisions.count}
            </span>
          ) : (
            <span className="chip">{NOT_CHECKED_CHIP}</span>
          )}
        </div>

        <div className="card-body stack">
          <p className="read">{decisions.intro}</p>
          <p>
            <Link className="btn" to={`/${DIVERGENCES_PATH}`}>
              <Glyph name="link-forward" size="inline" decorative />
              <span>{decisions.linkLabel}</span>
            </Link>
          </p>
        </div>
      </section>

      {/*
        THE WAY IN TO THE KEY-MATERIAL CONDITION SCREEN, and it is PERMANENT for the same reason the
        one above it is: a link that appears only when it has something to say cannot be found by
        somebody going to look, and it leaves the screen behind it unreachable for the whole of the
        time it is empty — which here is almost always, because the condition it reports is rare.

        The words on the link come from `key-material-condition.ts` and are deliberately not "fix" or
        "sort out": the screen behind this link shows both candidates, changes nothing, and names who
        to ask. A link promising more than the screen delivers is the reassuring-sounding action this
        ruling forbids, one step earlier.
      */}
      <section className="card card-tight" aria-labelledby="admin-key-material">
        <div className="card-header">
          <h3 id="admin-key-material" className="title-section">
            {keyMaterial.title}
          </h3>
          <span className="spacer" />
          {/* `chip` rather than `count`: four of the six key-material conditions have no figure to
              give, and an empty chip reads as a card that failed to load rather than as a card with
              nothing to report. `key-material-condition.ts` decides what goes on it. */}
          {/* The TONE comes from `checked`, not from `settled`: a success chip asserts that
              something was found to be in order, and nothing has surveyed anything. The chip's WORD
              still carries the state, which is why an unsurveyed card is legible rather than blank. */}
          <span
            className={
              keyMaterial.checked
                ? (keyMaterial.settled ? 'chip chip-success' : 'chip chip-danger')
                : 'chip'
            }
          >
            {keyMaterial.chip}
          </span>
        </div>

        <div className="card-body stack">
          <p className="read">{keyMaterial.intro}</p>
          <p>
            <Link className="btn" to={`/${KEY_MATERIAL_PATH}`}>
              <Glyph name="link-forward" size="inline" decorative />
              <span>{keyMaterial.linkLabel}</span>
            </Link>
          </p>
        </div>
      </section>

      {/*
        THE WAY IN TO THE STOPPED-CHANGES REVIEW, and it closes a debt rather than adding a feature.

        `core/status/reasons.js` has named this screen all along: the refused case carries the action
        code `review_refused` and the unconfirmed case `review_unconfirmed`. Until now the permanent
        indicator could only say "3 changes will not back up without you" — a number he could not act
        on, which is a number he learns to live with. The words on the link come from
        `stopped-changes.ts` and are deliberately not "fix these": nothing behind this link retries or
        discards anything, because both are deliveries and belong to the step that owns the credential.

        PERMANENT, like the two above it, for the same reason.
      */}
      <section className="card card-tight" aria-labelledby="admin-stopped">
        <div className="card-header">
          <h3 id="admin-stopped" className="title-section">
            {stopped.title}
          </h3>
          <span className="spacer" />
          {/* Nothing reads the outbox in this build, so the same rule as the two cards above: no
              figure where nothing counted, and a word in its place. */}
          {stopped.checked ? (
            <span className={stopped.settled ? 'chip chip-success' : 'chip chip-warning'}>
              {stopped.count}
            </span>
          ) : (
            <span className="chip">{NOT_CHECKED_CHIP}</span>
          )}
        </div>

        <div className="card-body stack">
          <p className="read">{stopped.intro}</p>
          <p>
            <Link className="btn" to={`/${STOPPED_CHANGES_PATH}`}>
              <Glyph name="link-forward" size="inline" decorative />
              <span>{stopped.linkLabel}</span>
            </Link>
          </p>
        </div>
      </section>

      {/*
        THE WAY IN TO THE PENDING REMOVALS, and this is the one whose absence was most expensive.

        `core/sync/deletions.js` verifies a removal reached the backup by READING THE AREA BACK, and
        leaves the manifest pending when it cannot confirm it. Nothing anywhere listed a pending one, so
        the belief that file's first paragraph names — "the coach believes the client is gone" — was
        never corrected. It is corrected here.

        The remote half, which names which record identities are still present, rides the sync report and
        belongs to S16; it is not stubbed here and no second wire is invented for it.
      */}
      <section className="card card-tight" aria-labelledby="admin-removals">
        <div className="card-header">
          <h3 id="admin-removals" className="title-section">
            {removals.title}
          </h3>
          <span className="spacer" />
          {/*
            THE COUNT IS A CLAIM, so it is only made when it was actually counted. A green nought on a
            device whose storage never opened would say every removal is confirmed gone on the
            strength of never having looked — see `RemovalsScreen.tsx` for the same branch and the
            same reason. A WORD stands in its place, because the word carries the state and the tone
            is only ever a second channel.
          */}
          {/*
            THE SAME RULE ONE STATE WIDER. A failed read counted nothing either, so it gets a WORD
            in the figure's place for exactly the reason the note above gives — and a nought here
            would have been the reassuring answer arrived at by not having looked.
          */}
          {storeIsOpen && !removalsReadFailed ? (
            <span className={removals.settled ? 'chip chip-success' : 'chip chip-warning'}>
              {removals.count}
            </span>
          ) : (
            <span className="chip">{removalsReadFailed ? 'Could not read' : 'Not known yet'}</span>
          )}
        </div>

        <div className="card-body stack">
          {storeIsOpen ? (
            <p className="read">{removals.intro}</p>
          ) : (
            <LocalStoreNotice opening={opening} />
          )}
          <p>
            <Link className="btn" to={`/${REMOVALS_PATH}`}>
              <Glyph name="link-forward" size="inline" decorative />
              <span>{removals.linkLabel}</span>
            </Link>
          </p>
        </div>
      </section>

      {/*
        WHAT WAS LEFT HERE ON PURPOSE, and it sits directly under the removals card because it is the
        rest of that sentence: the removals card lists what is still being confirmed, and this one
        lists what stopped being mentioned the moment it was.
      */}
      <StandingFactsCard reading={standingFacts} />

      {/*
        THE WAY IN TO WHAT THIS APP HAS DONE, and it sits directly above "This device" because the two
        are one sentence: that card says what this device HAS, and this says what it has DONE.

        `core/journal/` has been writing an entry for every unlock, every record change, every export
        and every synchronisation since it existed — one hash-linked chain per device — and until this
        link, NOTHING ANYWHERE READ IT BACK. The application kept an account of itself that the man it
        was kept for could not see.

        NO CHIP AND NO COUNT, unlike every card above it, and for a harder reason than the setup
        card's. There IS a figure here — how many entries, and whether the chains join up — and getting
        it means walking and HASHING every entry on every device. Putting it on this card would make
        every coach pay that on every visit to Admin for a figure he did not ask for; and a stale or
        cheap approximation of "does your list join up" is precisely the reassurance
        `screens/journal.ts` refuses to let this application make. The check runs when he goes to look.

        THE SENTENCE UNDER IT IS `WHAT_THE_CHECK_CAN_AND_CANNOT_DO`, NOT REWORDED. It is the same
        constant the screen behind this link is required to render, and it is here as well as there on
        purpose: a link promising a verified record would set the expectation one surface before the
        screen could correct it. The chain is TAMPER-EVIDENCE. It is not proofing, and nothing on the
        way in may imply it is.

        PERMANENT, like the links above it. `no-dead-ends.test.ts` proves this link really resolves,
        for a route the navigation surface deliberately does not carry.
      */}
      <section className="card card-tight" aria-labelledby="admin-journal">
        <div className="card-header">
          <h3 id="admin-journal" className="title-section">
            {JOURNAL_TITLE}
          </h3>
        </div>

        <div className="card-body stack">
          <p className="note read">
            <Glyph name="note" size="inline" decorative />
            <span>{WHAT_THE_CHECK_CAN_AND_CANNOT_DO}</span>
          </p>
          <p>
            <Link className="btn" to={`/${JOURNAL_PATH}`}>
              <Glyph name="link-forward" size="inline" decorative />
              <span>{JOURNAL_TITLE}</span>
            </Link>
          </p>
        </div>
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

      {/*
        THE TWO WAYS TO GET A COPY OUT, and they sit HERE — below everything that merely reports and
        directly above the reset — for the two reasons this screen already argues elsewhere.

        BELOW THE REPORTS, because these are things the coach DOES rather than things he READS, and
        this screen's ordering has always put the doing at the bottom (see the reset and the sign-out
        below). The suggestion on the way in was to put them between the removals and this device;
        that suggestion's own reasoning is the one applied here, and the screen's structure decides
        where the reasoning lands.

        AND DIRECTLY ABOVE THE RESET, because the reset must offer a backup first and this is the
        control that makes one. A coach weighing "put the shipped library back" can see "back up
        what I have" without leaving the card he is reading.

        BACKUP FIRST, THEN EVERYTHING. The library backup holds no client data and no clinical
        content, so it is the small, unconditional one; the full export is the checklist with the
        passphrase behind it. Neither is drawn before the store is open: both READ the store to say
        anything true at all, and a card offering to back up a practice it has not opened is the
        reassuring answer arrived at by not having looked — the same trade `SignOutCard` makes above,
        where the honest drawing of "nothing to act on was supplied" is nothing at all. The store's
        own notice is already on the removals card and is not repeated twice more here.
      */}
      {store !== null && <LibraryBackupCard store={store} />}
      {store !== null && <FullExportCard store={store} />}

      {/*
        THE ONE COPY THAT SURVIVES LOSING THE GOOGLE ACCOUNT. Everything above this line backs up to
        his own Drive, which is a real backup and not an INDEPENDENT one: the original and the copy
        sit under one credential. This is the only file in the application that outlives that, which
        is why it is here rather than folded into the export checklist as a tick box.
      */}
      {store !== null && <BackupArchiveCard store={store} />}

      {/*
        THE WAY BACK IN, DIRECTLY BELOW THE WAYS OUT. A backup and the restore that reads it are one
        feature and belong within sight of each other: a coach who has just made a file is the same
        coach who will one day need to put it back, and a restore he cannot find is a backup that was
        never restorable in the only sense that counts to him.
      */}
      {store !== null && <RestoreBackupCard store={store} />}

      {/*
        THE WAY BACK TO THE SHIPPED LIBRARY, and it sits directly above the way out of the device
        because they are the two destructive controls in the application and a coach weighing one
        should be able to see the other. It is BELOW everything that merely reports, for the reason
        the sign-out card gives: a destructive control he has to scroll past on every visit is one
        he eventually stops seeing.

        It is the ONLY path back to the shipped set. The library is seeded once and remembered, and
        the app never re-seeds on empty — deliberately, so that a routine he deleted stays deleted.
      */}
      <ResetToDefaultsCard store={store} />

      {/*
        THE WAY OUT, AND IT IS LAST ON PURPOSE.

        Every card above reports a condition; this one destroys something. A coach opens Admin to
        find out whether his backup is up to date far more often than to leave a device, and a
        destructive control he has to scroll PAST on every visit is one he eventually stops seeing —
        which is the same argument the permanent-warning band lost, one screen along.
      */}
      <SignOutCard />
    </div>
  );
}
