/**
 * THE CLIENT REGISTER — the people the coach trains, and the form that adds one.
 *
 * This file is the DRAWING and nothing else. Every judgement — what an empty register says, how a
 * person is summarised, the one-time hint, what the protected field explains and what may not be said
 * about it — is decided in `clients.ts`, `clinical-hint.ts` and `client-register-source.ts`, where
 * each can be asserted with no browser and no rendering at all.
 *
 * ## THE FIRST READ-WRITE SURFACE IN THIS APPLICATION, AND WHAT THAT CHANGED
 *
 * Every screen before this one only ever told the coach something, and each was fed by one of the
 * five reporting seams in `main.tsx` — a frozen reading pushed down from above with nothing callable
 * on it, a shape `shell/seams.test.ts` holds all five to. A register cannot be one of those: the form
 * calls a create, and the list has to re-read afterwards or he adds somebody and does not see them.
 *
 * So this screen takes the STORE, from `platform/LocalStore.tsx`, whose header says in as many words
 * that it is THE SOURCE the five seams are fed from and NOT a sixth one. No seam was added, no seam
 * was bent, and `seams.test.ts` is untouched. `client-register-source.ts` holds every read and the
 * one write, and its header is where the next person building a writing screen should start.
 *
 * ## THE STORE MAY NOT HAVE OPENED, AND THE REGISTER MAY NOT PRETEND OTHERWISE
 *
 * A local database can refuse: a private window, a device with no room, a second window holding the
 * old version. When it has, this screen says so — in the coach's words, from `LocalStoreNotice` —
 * and it does NOT fall back on the empty reading. "Nobody is on your register yet" read off a store
 * that never opened would tell a coach with forty clients that he has none, on the strength of never
 * having looked.
 *
 * ## THE HINT IS A NOTE AND NEVER A WARNING
 *
 * Once, gently, in the ordinary voice of the screen. Not a warning band and not a colour that says
 * something is wrong, because nothing is wrong: he has not made a mistake yet and may never make one.
 * A warning shown every visit is one he stops reading by the second week, and it would take the
 * sentence with it.
 *
 * ## TWO PATHS OFF THE REGISTER, DRAWN AS THE DIFFERENT THINGS THEY ARE
 *
 * ARCHIVE AND RESTORE ARE THE ORDINARY PATH. Two quiet, unmarked buttons on the row, and NEITHER
 * ASKS HIM TO CONFIRM ANYTHING: both are reversible, and a warning in front of a reversible act is
 * how a coach learns to click through the one warning that matters. They carry no glyph on purpose —
 * the marked control on this row is the exceptional one, and that is the only way a row of three
 * buttons says which of them is different.
 *
 * REMOVING IS THE EXCEPTIONAL PATH and it opens a confirmation that says what will happen, that it
 * cannot be undone, and offers to back up first. It is a PANEL IN THE FLOW, not a modal, and that is
 * the stylesheet's own standing ruling rather than a preference invented here: `console.css` says a
 * modal "gets dismissed reflexively, which makes the important message the one least likely to
 * land". A confirmation nobody reads is the failure this whole surface exists to avoid.
 *
 * Every word of both — including the honest account of why a backup cannot be taken yet — is decided
 * in `client-removal.ts`.
 *
 * ## AND WHAT THE REGISTER SAYS AFTERWARDS — FROM THE SEAM, NOW, AND NOT FROM A SECOND READ
 *
 * A removal is done on this device long before it is confirmed gone from the backup, and the coach
 * has to be able to see that from HERE rather than only from a screen he has to know to visit. It is
 * reported in the one sentence this application has for that distinction, imported verbatim.
 *
 * THIS SCREEN USED TO READ THE PENDING REMOVALS ITSELF, and the reason was written down: the
 * pending-removal seam filled once per store and could not refresh, so a register that took the seam
 * would have told a coach who had just removed somebody that nothing was waiting. That reason has
 * stopped being true. The seam now re-reads when a removal COMMITS on this device — see
 * `platform/local-store.ts` and `shell/RemovalsFromStore.tsx` — so the second read was two readers of
 * one fact, and two readers of one fact eventually disagree in front of him. The register raises the
 * signal and reads the seam like every other surface.
 *
 * ## THE PROTECTED FIELD HAS NO INPUTS, ON PURPOSE
 *
 * It is a disclosure he opens, and inside it he is told plainly why it is not ready and where to go.
 * There is deliberately nothing to type into: three inputs that accepted text this build cannot lock
 * would invite exactly the one outcome forbidden here — text taken and silently dropped — and a
 * disabled control with no explanation is the other half of the same failure. The explanation is the
 * feature.
 */

import { Fragment, useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Glyph } from '../design/Glyph';
import { LocalStoreNotice, useLocalRemovals, useLocalStore } from '../platform/LocalStore';
import { REMOVALS_PATH } from '../shell/navigation';
import type { Destination } from '../shell/navigation';
import {
  ADAPTATION_FLAG_HINT, ADAPTATION_FLAG_LIMIT, CLINICAL_DETAIL_HINT,
  CLINICAL_DETAIL_HINT_ACKNOWLEDGEMENT, EMPTY_DRAFT, FIELD_LABELS, REGISTER_BUTTON,
  REGISTER_FORM_TITLE, describeClinicalField, describeRefusal, describeRegister, registeredWords,
} from './clients';
import type {
  ClientDraft, ClientSummary, RefusalReport, RegisterPage,
} from './clients';
import { backupHistoryOf } from './backup-history';
import type { BackupHistory } from './backup-history';
import { CLINICAL_HINT_KEY, deviceMemory, hintIsStillDue, rememberHintAcknowledged } from './clinical-hint';
import {
  ABOUT_CLIENT_KEY, calendarWithClient, describeArrivedAbout, startSessionLabel,
} from './circular-navigation';
import {
  appendPage, archiveOnRegister, readEverSynchronised, readRegister, readRegisterPage,
  registerClient, removeClientForGood, restoreOnRegister,
} from './client-register-source';
import {
  archivedWords, describeActionFailure, describeRegisterRemovals, describeRemovalConfirmation,
  describeRowActions, removedWords, restoredWords,
} from './client-removal';
import { ClientReportCard } from './ClientReportCard';
import type {
  ActionFailure, RemovalConfirmation,
} from './client-removal';
import { useRemovals } from '../shell/Removals';
import { describeFailedRemovalsRead } from './removals';
import type { LocalStore } from '../../core/store/store.js';

/**
 * The page on screen, and WHICH store and which filter it was read with.
 *
 * Both are carried so a stale page can be discarded during render rather than by an effect whose only
 * job is to reset state — the same reason `RemovalsFromStore` carries the store its page came from.
 */
interface Shown {
  readonly from: LocalStore;
  readonly includingArchived: boolean;
  readonly page: RegisterPage;
}

/**
 * One person, as a row. The row itself still REPORTS — opening a client belongs to a later step —
 * and the two controls on it are the things that act.
 *
 * `row-static` stays on the row for exactly that reason: the row is not a control and must not wear
 * the affordance of one, or the coach learns that pressing a person's name does something and finds
 * out on the day it does not.
 */
function ClientRow({
  client, busy, cameAbout, onReport, onReversible, onRemove,
}: {
  client: ClientSummary;
  /** True while any of the three writes is in flight, from any row. */
  busy: boolean;
  /** The words marking this person as the one he came back about, or null. */
  cameAbout: string | null;
  onReport: (client: ClientSummary) => void;
  onReversible: (client: ClientSummary) => void;
  onRemove: (client: ClientSummary) => void;
}) {
  const actions = describeRowActions(client);

  return (
    // `row-wrap`: the name and the flag describe the PERSON and hold the first line; the session
    // count moves under them when a phone width cannot take all three. See `console.css`.
    // `aria-current`: the mark below is visual, and a person arriving by screen reader from a
    // session's roster needs the same answer to "which of these is the one I asked for".
    <li className="row row-static row-wrap" aria-current={cameAbout !== null ? 'true' : undefined}>
      <span className="row-name">{client.name}</span>

      {/* HE CAME HERE FROM A SESSION THIS PERSON WAS IN. A plain chip and not a filled one, for
          the reason the adaptation flag beside it is plain: filled, it out-weighs the NAME, and
          the name is what he is scanning the list to find. */}
      {cameAbout !== null && (
        <span className="chip">
          <Glyph name="link-forward" size="inline" decorative />
          <span>{cameAbout}</span>
        </span>
      )}

      {/*
        The flag is his own shorthand and is shown as he typed it.

        A PLAIN CHIP RATHER THAN A FILLED ONE, and that was decided by looking. Filled, it out-weighed
        the client's NAME on every row — the flag is what tells him somebody needs adapting for, and
        the name is what he is scanning the list to find. The mark is decorative: the words beside it
        already say what this is, and the mark's job is to make the chip distinguishable from the
        archived one by silhouette rather than by reading it.
      */}
      {client.adaptationFlag !== null && (
        <span className="chip">
          <Glyph name="client-adaptation-flag" size="inline" decorative />
          {/* The words are their own element so they can truncate inside the chip while the mark
              stays whole — see the `.row .chip` rule in `console.css` for what that fixed. */}
          <span>{client.adaptationFlag}</span>
        </span>
      )}

      {/* The WORD carries the state, never a tone on its own. */}
      {client.archivedWord !== null && <span className="chip">{client.archivedWord}</span>}

      {/* `nowrap`: "No sessions yet" split across three lines once. A value and its unit belong
          together, and the row wraps as a whole rather than fragmenting this. */}
      <span className="row-value nowrap">{client.sessionWords}</span>

      {/*
        THE TWO PATHS OFF THIS ROW, AND BOTH ARE QUIET. THAT WAS MEASURED, AND IT WAS WRONG FIRST.

        The removal was drawn with the danger fill, which is the obvious reading of "present the
        exceptional path differently". At 390px it was a solid red block on EVERY row, and it
        out-weighed the client's NAME — the same fault a3 found with a filled adaptation chip, in the
        same place, for the same reason: the name is what he is scanning the list to find. A register
        of forty people would have been a wall of red for an act he performs once a year, and a
        warning drawn permanently is one he stops seeing.

        So the difference is carried by the WORDS and the MARK, which survive a greyscale screenshot
        and a colour-blind reader as a tone never does: "Remove for good" beside an unmarked
        "Archive". The danger tone appears exactly once, in the confirmation, where the consequence
        actually is — which is also the only place it can still mean something.

        Both are disabled while any write is in flight, from any row: two removals racing each other
        would be two transactions against the same participant index, and the second is the one that
        finds the world it read has moved.
      */}
      <span className="row-actions">
        {/*
          THE WAY FROM A PERSON TO A SESSION WITH THEM — the half of the circular navigation that
          starts here, and the ORDINARY thing to do on this screen rather than an extra.

          A LINK, not a button, because it goes somewhere: it must be openable in a second window,
          it must be restorable from an address, and the coach's own gesture for "take me there" has
          to work. It carries no confirmation and starts nothing — the calendar still asks him for
          the routine and for where he is, and answers neither on his behalf.

          The accessible name says WHOSE session, because a register of forty rows otherwise offers
          forty controls announcing the identical sentence.
        */}
        <Link
          className="btn btn-quiet btn-sm"
          to={calendarWithClient(client.recordId)}
          aria-label={startSessionLabel(client.name)}
        >
          <Glyph name="session-start" size="inline" decorative />
          <span>Start a session</span>
        </Link>

        {/*
          THE WAY FROM A PERSON TO THE REPORT HE SENDS THEM. An ordinary control rather than a
          danger or a confirmation: sending a client their own progress is the most routine thing on
          this screen, and it is the one artefact a client ever receives.

          The accessible name says WHOSE progress, because a register of forty rows otherwise offers
          forty controls announcing the identical sentence.
        */}
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          aria-label={`Send ${client.name} their progress report`}
          disabled={busy}
          onClick={() => onReport(client)}
        >
          <Glyph name="progress-over-time" size="inline" decorative />
          <span>Progress</span>
        </button>

        <button
          type="button"
          className="btn btn-quiet btn-sm"
          aria-label={actions.reversibleDescription}
          disabled={busy}
          onClick={() => onReversible(client)}
        >
          {actions.reversibleLabel}
        </button>

        <button
          type="button"
          className="btn btn-quiet btn-sm"
          aria-label={actions.removeDescription}
          disabled={busy}
          onClick={() => onRemove(client)}
        >
          <Glyph name="delete" size="inline" decorative />
          {actions.removeLabel}
        </button>
      </span>
    </li>
  );
}

/**
 * THE CONFIRMATION, AND IT IS A PANEL IN THE FLOW RATHER THAN A MODAL.
 *
 * `console.css` states the ruling this follows: a modal "gets dismissed reflexively, which makes the
 * important message the one least likely to land". Everything this panel says is a thing he needs to
 * have read, so it is drawn where reading it is the ordinary act rather than in a box whose first
 * affordance is a way to make it go away.
 *
 * NOTHING FOLDS. The one-figure-then-fold rule is for detail BEHIND a decision; every sentence here
 * IS the decision. The backup offer in particular is drawn even though it cannot run — see
 * `client-removal.ts` for why hiding it would be this application deciding on his behalf.
 */
function RemovalConfirmationPanel({
  confirmation, busy, onConfirm, onCancel,
}: {
  confirmation: RemovalConfirmation;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { backup } = confirmation;

  return (
    <section className="card card-tight" aria-labelledby="client-removal-confirm">
      <div className="card-header">
        <h3 id="client-removal-confirm" className="title-section">
          {confirmation.title}
        </h3>
      </div>

      <div className="card-body stack">
        <p className="read">{confirmation.whatWillHappen}</p>

        <p className="note note-danger read">
          <Glyph name="delete" size="inline" decorative />
          <span>{confirmation.cannotBeUndone}</span>
        </p>

        <p className="read">{confirmation.archiveInstead}</p>

        {/* THE OFFER. It is drawn in every state, with an honest account of what this device can
            actually do, and there is deliberately no button on it while there is nothing for a
            button to do — a control that did nothing would be the same lie wearing an affordance. */}
        <div className="note read">
          <Glyph name="backup" size="inline" decorative />
          <div className="stack-tight">
            <strong>{backup.title}</strong>
            <span>{backup.whatItIsFor}</span>
            <span>{backup.whatHappened}</span>
            {backup.whatToDo !== null && <span>{backup.whatToDo}</span>}
          </div>
        </div>

        {/*
          THE SAFE CHOICE IS FIRST AND IT IS THE PROMINENT ONE. Keeping the client is the ordinary
          outcome of arriving here by accident, and the destructive control is the quiet one beside
          it — the opposite of the arrangement that makes "yes" the reflex.
        */}
        {/*
          `inline` RATHER THAN `spread`, AND THAT WAS MEASURED. `.spread` justifies to the two ends
          and does not wrap, so at 390px it squeezed both controls until "Keep Test Person Alpha"
          rendered over three lines with its own words broken — the identical fault a3 found on the
          hint acknowledgement, in the identical way: by looking, after every property check passed.
          `.inline` wraps, so each control keeps its natural width and the second drops to its own
          line when the two cannot fit.
        */}
        <div className="inline">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onCancel}>
            {confirmation.cancelLabel}
          </button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={onConfirm}>
            <Glyph name="delete" size="inline" decorative />
            {confirmation.confirmLabel}
          </button>
        </div>
      </div>
    </section>
  );
}

/** What the protected clinical field says. No inputs — see the note at the top of this file. */
function ProtectedField({ state }: { state: BackupHistory }) {
  const report = describeClinicalField(state);

  return (
    <details className="disclose">
      <summary>
        <Glyph name="protected-clinical-note" size="inline" decorative />
        {report.title}
      </summary>
      <div className="card-body stack">
        <p className="read">{report.purpose}</p>
        <p className="note read">
          <Glyph name="note" size="inline" decorative />
          <span>{report.whatHappened}</span>
        </p>
        {report.whatToDo !== null && <p className="read">{report.whatToDo}</p>}
        <p className="muted read">{report.nothingIsKept}</p>
      </div>
    </details>
  );
}

export function ClientsScreen({ destination }: { destination: Destination }) {
  const opening = useLocalStore();
  const store = opening.state === 'open' ? opening.store : null;
  // The signal this screen RAISES, on the source, when a removal commits here. It is the only thing
  // in the interface that creates a pending removal, so it is the only thing that raises it.
  const { removalRecorded } = useLocalRemovals();
  // And the seam it READS afterwards, like every other surface — see the header for why this screen
  // no longer keeps a read of its own.
  const awaitingRemoval = useRemovals();

  // WHO HE CAME BACK ABOUT, if he arrived from a person's name on a session row. A query on this
  // destination rather than an address of its own — see `circular-navigation.ts`, which owns both
  // ends of this loop and the reason neither end declares a contextual trail.
  const [address] = useSearchParams();
  const cameAbout = address.get(ABOUT_CLIENT_KEY);

  const [includeArchived, setIncludeArchived] = useState(false);
  // Bumped after a client is added, so the effect below reads the register again. The list must show
  // him what he just did; anything less is the screen lying about the one thing he came here to do.
  const [reloads, setReloads] = useState(0);
  const [shown, setShown] = useState<Shown | null>(null);

  const [draft, setDraft] = useState<ClientDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<RefusalReport | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const [hintDue, setHintDue] = useState(false);
  const [everSynchronised, setEverSynchronised] = useState<boolean | null>(null);

  // Who he is being asked about, held BY NAME as well as by identity: the moment the removal
  // commits there is nothing left on the device that could answer "who was that", and the sentence
  // afterwards is owed his name rather than a reference.
  // Whose progress report is open, or null. One at a time: the card reads a whole history, and two
  // open at once would be two long reads racing to say something about different people.
  const [reporting, setReporting] = useState<ClientSummary | null>(null);
  const [confirming, setConfirming] = useState<{ recordId: string; name: string } | null>(null);
  // The identity of whichever write is in flight, or null. One at a time, from any row.
  const [working, setWorking] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [failure, setFailure] = useState<ActionFailure | null>(null);

  useEffect(() => {
    if (store === null) return undefined;
    return readRegister(store, { includeArchived, after: null }, (page) =>
      setShown({ from: store, includingArchived: includeArchived, page }));
  }, [store, includeArchived, reloads]);

  useEffect(() => {
    if (store === null) return undefined;
    return readEverSynchronised(store, setEverSynchronised);
  }, [store]);

  // Asked once, after mount rather than at module scope: this module is imported by the interface
  // suite, which renders outside a browser and has no storage to read.
  useEffect(() => {
    setHintDue(hintIsStillDue(deviceMemory()));
  }, []);

  const acknowledgeHint = useCallback(() => {
    rememberHintAcknowledged(deviceMemory());
    setHintDue(false);
  }, []);

  const showMore = useCallback(() => {
    if (store === null || shown === null || shown.page.cursor === null) return;
    const after = shown.page.cursor;

    void readRegisterPage(store, { includeArchived, after }).then(
      (next) => setShown((held) =>
        (held === null || held.from !== store || held.includingArchived !== includeArchived
          ? held
          : { ...held, page: appendPage(held.page, next) })),
      (error: unknown) => console.error('[clients] the next page of the register could not be read', error),
    );
  }, [store, shown, includeArchived]);

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (store === null || saving) return;

      setSaving(true);
      setRefusal(null);
      setAdded(null);

      try {
        const created = await registerClient(store, draft);
        // Only now: `store.create` resolving means the write COMMITTED, and nothing may be reported
        // to him as saved before that.
        setDraft(EMPTY_DRAFT);
        setAdded(created.content.name);
        setReloads((count) => count + 1);
      } catch (error: unknown) {
        // Whatever the record refused, in the record's own words. Nothing is reworded here.
        setRefusal(describeRefusal(error));
      } finally {
        setSaving(false);
      }
    },
    [store, draft, saving],
  );

  /**
   * ARCHIVE OR RESTORE, WITH NOTHING IN FRONT OF IT.
   *
   * There is deliberately no confirmation here, and no dialogue to write: both are reversible, the
   * other direction is one press away on the same row, and a warning in front of a reversible act
   * is how a coach learns that this application's warnings are noise.
   */
  const runReversible = useCallback(
    async (client: ClientSummary) => {
      if (store === null || working !== null) return;

      setWorking(client.recordId);
      setOutcome(null);
      setFailure(null);

      try {
        if (client.archived) {
          await restoreOnRegister(store, client.recordId);
          setOutcome(restoredWords(client.name));
        } else {
          await archiveOnRegister(store, client.recordId);
          setOutcome(archivedWords(client.name));
        }
        setReloads((count) => count + 1);
      } catch (error: unknown) {
        setFailure(describeActionFailure(error, client.name, client.archived ? 'restore' : 'archive'));
      } finally {
        setWorking(null);
      }
    },
    [store, working],
  );

  /**
   * THE REMOVAL ITSELF, and it happens only from the confirmation.
   *
   * `removeClientForGood` resolves once the whole purge has COMMITTED — the records, the queue
   * sweep and the manifest in one transaction — so nothing is reported as removed before it is, and
   * a failure means nothing was touched at all.
   */
  const confirmRemoval = useCallback(async () => {
    if (store === null || confirming === null || working !== null) return;
    const { recordId, name } = confirming;

    setWorking(recordId);
    setOutcome(null);
    setFailure(null);

    try {
      await removeClientForGood(store, recordId);
      setConfirming(null);
      setOutcome(removedWords(name));
      // The person is off the register.
      setReloads((count) => count + 1);
      // AND A REMOVAL IS NOW WAITING TO BE CONFIRMED GONE FROM THE BACKUP. Said HERE, after the
      // purge has resolved and therefore committed, and never before it: the seam reads the store
      // when this changes, and a signal raised ahead of the commit would have it read a store that
      // has not moved yet. This is the only place in the interface that raises it, because this is
      // the only place in the interface that creates one.
      removalRecorded();
    } catch (error: unknown) {
      setFailure(describeActionFailure(error, name, 'remove'));
    } finally {
      setWorking(null);
    }
  }, [store, confirming, working, removalRecorded]);

  const known = opening.state === 'open';
  const report = describeRegister({
    page: shown !== null && shown.from === store
      ? shown.page
      : { items: [], cursor: null, done: true },
    includingArchived: includeArchived,
  });
  // THE BACKUP HISTORY, DERIVED IN ONE PLACE AND IN THE HISTORY'S OWN WORDS — `backup-history.ts`.
  //
  // Whether a backup can be taken before a removal and whether a clinical note can be locked are one
  // question wearing two hats, so both read this one state. What this is NOT is the question the
  // permanent backup indicator answers — whether Google is reachable now. This screen used to answer
  // the historical question in that indicator's vocabulary, and the two were measured contradicting
  // each other on this very screen: "This device is connected to your Google account" under a bar
  // reading "Google has not been connected on this device". One fact, one derivation, its own words.
  const backupHistory = backupHistoryOf(everSynchronised);
  const confirmation = confirming === null
    ? null
    : describeRemovalConfirmation(confirming.name, backupHistory);
  // THE SEAM ITSELF, not a second read of the same fact: the register and the removals surface are
  // now reading one page, so they cannot disagree about what is waiting or about what "nothing is
  // waiting" means. Discarding a page belonging to a store no longer in play is the seam's own job,
  // done where the page is read, which is why there is nothing to do about it here.
  /**
   * THE REGISTER'S PANEL, and a failed read is the one state it may not stay silent in.
   *
   * This panel is drawn only when something is OUTSTANDING — `client-removal.ts` defends that at
   * length, and the argument holds: a panel saying "nothing is waiting" on every visit is one he
   * stops reading. But a read that FAILED is not "nothing is waiting". It used to publish nothing,
   * leave the seam at its empty literal, and take this panel away — so the busiest screen in the
   * application went quiet, which on a surface whose silence MEANS all clear is the reassuring
   * answer arrived at by not having looked.
   */
  const removalsCouldNotBeRead = awaitingRemoval.status === 'failed'
    ? describeFailedRemovalsRead(awaitingRemoval.failure)
    : null;
  const outstanding = awaitingRemoval.status === 'failed'
    ? null
    : describeRegisterRemovals(awaitingRemoval);
  // The person he came back about, if they are among the rows on screen. The register is PAGED, so
  // "not shown yet" is an ordinary answer rather than an error, and the notice words both.
  const arrived = describeArrivedAbout(
    cameAbout,
    report.items.find((person) => person.recordId === cameAbout)?.name ?? null,
  );

  return (
    <div className="screen">
      <section className="card stack" aria-labelledby="screen-clients">
        <div className="inline">
          {/* The same mark the rail carries, so arriving here confirms the tap landed where he aimed. */}
          <Glyph name={destination.glyph} size="lead" decorative />
          <h2 id="screen-clients" className="title-screen">
            {destination.label}
          </h2>
        </div>

        {/*
          THE REGISTER IS DRAWN ONLY WHEN THE STORE IS OPEN. The empty reading says nobody is on the
          register, which on a device whose storage never opened would be a nought this app never
          counted. What is NOT known is said instead, in his words.
        */}
        {known ? (
          <>
            {/*
              WHILE A REMOVAL IS BEING ASKED ABOUT, THE QUESTION HAS THE CARD. That was arrived at by
              looking, after two worse arrangements.
                • Under the whole list, a question raised from the first of four rows on a phone was
                  BELOW THE FOLD: he pressed a destructive control and the screen appeared to do
                  nothing, which is the worst available answer to that press.
                • Inside the list, attached to its own row, it was in view — and four levels of
                  nested padding had squeezed the reading measure to about two hundred pixels, four
                  words to a line, for the longest and most consequential prose on the screen.
              So the register stands aside for as long as the question is open. It is the one
              decision on this screen that genuinely cannot proceed without an answer, the way back
              is the first control on it and says whose name it keeps, and nothing is destroyed by
              looking at it. `console.css` rules out a MODAL for this, and this is not one: it is in
              the flow, at the reading measure, and it cannot be dismissed by a reflex.
            */}
            {confirmation !== null ? (
              <RemovalConfirmationPanel
                confirmation={confirmation}
                busy={working !== null}
                onConfirm={() => void confirmRemoval()}
                onCancel={() => setConfirming(null)}
              />
            ) : (
              <>
                <p className="screen-intro read">{report.intro}</p>

                {/* HE CAME HERE FROM A SESSION, ABOUT ONE PERSON IN IT. Said plainly, including
                    when they are further down the register than the page shown — the comfortable
                    alternative is to say nothing and leave him wondering why the link he pressed
                    appeared to do nothing at all. The register is NOT filtered down to them: he
                    arrived from a session, not from a search, and a register showing one row would
                    read as a register that had lost everybody else. */}
                {arrived.present && (
                  <p className="note read" role="status">
                    <Glyph name="link-forward" size="inline" decorative />
                    <span>{arrived.words}</span>
                  </p>
                )}

                <div className="spread">
                  {/* Archived clients are REACHABLE rather than hidden. The control is permanent, so
                      it is not a thing he has to already know about to find. */}
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    aria-pressed={report.includingArchived}
                    onClick={() => setIncludeArchived((held) => !held)}
                  >
                    <Glyph name="filter" size="inline" decorative />
                    {report.archivedToggleLabel}
                  </button>
                </div>

                {!report.empty && (
                  <ul className="rows rows-boxed">
                    {report.items.map((client) => (
                      <ClientRow
                        key={client.recordId}
                        client={client}
                        busy={working !== null}
                        cameAbout={client.recordId === cameAbout ? arrived.markWords : null}
                        onReport={(person) => {
                          // The question and the outcome both belong to whoever was on screen a
                          // moment ago; leaving either up under a different person reads as an
                          // answer about them.
                          setConfirming(null);
                          setOutcome(null);
                          setReporting(person);
                        }}
                        onReversible={(person) => void runReversible(person)}
                        onRemove={(person) => {
                          // The question replaces whatever was on screen: an outcome from a moment
                          // ago sitting above a question about somebody else reads as an answer to it.
                          setOutcome(null);
                          setFailure(null);
                          setConfirming({ recordId: person.recordId, name: person.name });
                        }}
                      />
                    ))}
                  </ul>
                )}

                {/*
                  THE PROGRESS REPORT HE SENDS A CLIENT, drawn where he pressed for it.

                  Its own component so this screen holds none of it: the card reads the whole
                  history, refuses an empty one and an incomplete one differently, and words its own
                  outcome. `store` is non-null inside this branch — the surfaces on this screen only
                  appear once the local store has OPENED.
                */}
                {reporting !== null && store !== null && (
                  <ClientReportCard
                    store={store}
                    client={{ recordId: reporting.recordId, name: reporting.name }}
                    onClose={() => setReporting(null)}
                  />
                )}

                {report.moreWords !== null && (
                  <>
                    <p className="muted read">{report.moreWords}</p>
                    <button type="button" className="btn btn-sm" onClick={showMore}>
                      Show more clients
                    </button>
                  </>
                )}
              </>
            )}

            {/* Said once, then gone the next time he acts. It reports what happened and stops
                there — what is NOT yet known is the panel below, and the two are not merged. */}
            {outcome !== null && (
              <p className="note read" role="status">
                <Glyph name="nav-clients" size="inline" decorative />
                <span>{outcome}</span>
              </p>
            )}

            {failure !== null && (
              <section className="stack" role="alert">
                <p className="note note-danger read">
                  <Glyph name="sync-failed" size="inline" decorative />
                  <span>{failure.headline}</span>
                </p>
                {failure.verbatim !== null && (
                  <blockquote className="note read">
                    <span>{failure.verbatim}</span>
                  </blockquote>
                )}
              </section>
            )}

            {/*
              THE HALF OF A REMOVAL THAT USED TO BE INVISIBLE, ON THE SCREEN WHERE HE MAKES ONE.

              It is drawn only when something is outstanding — see `client-removal.ts` for why that
              is a report rather than the permanent way in, which Admin already carries. The
              sentence about what "not confirmed" means is imported verbatim and is NOT a warning
              band: it is equally true on the good day.
            */}
            {/*
              AND THE PANEL A FAILED READ DRAWS INSTEAD, with no count and no reassurance. The chip
              carries a WORD rather than a nought, the same choice the Admin card makes and for the
              same reason: a figure here would be one this app never counted.
            */}
            {removalsCouldNotBeRead !== null && (
              <section className="card card-tight" aria-labelledby="clients-removals">
                <div className="card-header">
                  <h3 id="clients-removals" className="title-section">
                    {removalsCouldNotBeRead.title}
                  </h3>
                  <span className="spacer" />
                  <span className="chip chip-warning">Could not read</span>
                </div>

                <div className="card-body stack" role="status">
                  <p className="read">{removalsCouldNotBeRead.headline}</p>
                  <p className="read">{removalsCouldNotBeRead.notAVerdict}</p>
                  <p className="muted read">{removalsCouldNotBeRead.whatToDo}</p>

                  <p>
                    <Link className="btn" to={`/${REMOVALS_PATH}`}>
                      <Glyph name="link-forward" size="inline" decorative />
                      <span>See what happened</span>
                    </Link>
                  </p>
                </div>
              </section>
            )}

            {outstanding !== null && outstanding.present && (
              <section className="card card-tight" aria-labelledby="clients-removals">
                <div className="card-header">
                  <h3 id="clients-removals" className="title-section">
                    {outstanding.heading}
                  </h3>
                  <span className="spacer" />
                  <span className="chip chip-warning">{outstanding.count}</span>
                </div>

                <div className="card-body stack">
                  <p className="read">{outstanding.intro}</p>

                  <p className="note read">
                    <Glyph name="note" size="inline" decorative />
                    <span>{outstanding.meaning}</span>
                  </p>

                  <p className="muted read">{outstanding.noName}</p>

                  <p>
                    <Link className="btn" to={`/${REMOVALS_PATH}`}>
                      <Glyph name="link-forward" size="inline" decorative />
                      <span>{outstanding.linkLabel}</span>
                    </Link>
                  </p>
                </div>
              </section>
            )}
          </>
        ) : (
          <LocalStoreNotice opening={opening} />
        )}
      </section>

      <section className="card stack" aria-labelledby="screen-clients-add">
        <h3 id="screen-clients-add" className="title-section">
          {REGISTER_FORM_TITLE}
        </h3>

        {/* Once and gently: a plain note in the voice of the screen, never a warning band, and never
            a colour that says something is wrong. Acknowledging it is what makes it once — see
            `clinical-hint.ts` for why that is the event rather than the first render. */}
        {hintDue && (
          <div className="note read" data-hint={CLINICAL_HINT_KEY}>
            <Glyph name="note" size="inline" decorative />
            {/*
              THE ACKNOWLEDGEMENT SITS BELOW THE WORDS, NOT BESIDE THEM, AND THAT WAS MEASURED.
              Beside them it is a flex sibling of a paragraph capped at a readable measure, so it was
              squeezed to about seventy pixels and rendered as "I / understand" over two lines with
              its own words broken. Every property check passed — sixteen pixels, forty-four high,
              contrast met — because none of them is a question about composition. It was found by
              looking at the rendered page.
            */}
            <div className="stack-tight">
              <span>{CLINICAL_DETAIL_HINT}</span>
              <div>
                <button type="button" className="btn btn-quiet btn-sm" onClick={acknowledgeHint}>
                  {CLINICAL_DETAIL_HINT_ACKNOWLEDGEMENT}
                </button>
              </div>
            </div>
          </div>
        )}

        <form className="stack" onSubmit={submit}>
          <div className="field">
            <label htmlFor="client-name">{FIELD_LABELS.name}</label>
            <input
              id="client-name"
              name="name"
              type="text"
              autoComplete="off"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="client-notes">{FIELD_LABELS.notes}</label>
            <textarea
              id="client-notes"
              name="notes"
              value={draft.notes}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="client-adaptation-flag">{FIELD_LABELS.adaptationFlag}</label>
            <input
              id="client-adaptation-flag"
              name="adaptation_flag"
              type="text"
              autoComplete="off"
              maxLength={ADAPTATION_FLAG_LIMIT}
              aria-describedby="client-adaptation-flag-hint"
              value={draft.adaptationFlag}
              onChange={(event) => setDraft({ ...draft, adaptationFlag: event.target.value })}
            />
            {/*
              Permanent, and required to be at the point of entry: it says what THIS box is for. The
              one-time note above says something different — where clinical detail goes.

              `muted read` RATHER THAN `field-hint`, and it is a choice rather than an oversight.
              `.field-hint` binds `--type-meta`, which the token layer documents as "14px —
              timestamps and units only", and this is prose he reads to decide what to type: it
              belongs at the sixteen-pixel reading floor this whole direction is built to defend.
              `.field-hint` is left exactly as the approved packet drew it — changing a shared
              component to suit one screen is not this action's to do — and the tension is reported
              upward instead.
            */}
            <p id="client-adaptation-flag-hint" className="muted read">
              {ADAPTATION_FLAG_HINT}
            </p>
          </div>

          <ProtectedField state={backupHistory} />

          <div className="spread">
            <button type="submit" className="btn btn-primary" disabled={!known || saving}>
              <Glyph name="add" size="inline" decorative />
              {REGISTER_BUTTON}
            </button>
          </div>
        </form>

        {/* Said once, then gone the moment he types again. Polite: he is looking at the screen he
            just pressed a button on, and nothing needs to interrupt him. */}
        {added !== null && (
          <p className="note read" role="status">
            <Glyph name="nav-clients" size="inline" decorative />
            <span>{registeredWords(added)}</span>
          </p>
        )}

        {/*
          WHY THIS IS THE RECORD TALKING AND NOT THIS SCREEN. Every sentence below was written by
          `core/model/entities/client.js` — including the one that refuses contact and identifying
          information BY NAME and explains that data never collected cannot leak. It is passed through
          untouched. A reworded version would be a second sentence about a decision the record already
          stated, drifting from it the moment either is edited.
        */}
        {refusal !== null && (
          /*
            THE NOTE IS THE HEADLINE, NOT THE WRAPPER, and that was measured. Putting `note` and
            `stack` on one element made the column direction win over the note's own row layout, so
            the mark lost its gap and sat jammed against the first word — and the whole panel then
            spanned the card instead of the reading measure. The established idiom is a stack whose
            first child is the note; it is copied here rather than approximated.
          */
          <section className="stack" role="alert">
            <p className="note note-danger read">
              <Glyph name="sync-failed" size="inline" decorative />
              <span>{refusal.headline}</span>
            </p>

            {refusal.fields.length > 0 && (
              <dl className="pairs">
                {refusal.fields.map((field) => (
                  <Fragment key={`${field.path}:${field.code}`}>
                    <dt className="pair-label">{field.label}</dt>
                    <dd className="pair-value read">{field.message}</dd>
                  </Fragment>
                ))}
              </dl>
            )}

            {refusal.verbatim !== null && (
              <blockquote className="note read">
                <span>{refusal.verbatim}</span>
              </blockquote>
            )}
          </section>
        )}
      </section>
    </div>
  );
}
