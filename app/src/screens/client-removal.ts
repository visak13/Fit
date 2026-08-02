/**
 * ARCHIVING, RESTORING AND REMOVING A CLIENT — every word and every judgement, and none of the
 * drawing.
 *
 * The controls are three buttons. What sits behind them is the most consequential thing on this
 * screen, which is why it is a module of its own rather than three more constants in `clients.ts`,
 * and why `ClientsScreen.tsx` beside it holds no decisions at all. The same split as
 * `screens/removals.ts` and `screens/RemovalsScreen.tsx`, which is the pattern this file copies
 * rather than a shape invented for it.
 *
 * ## TWO PATHS, AND THEY ARE NOT VARIATIONS OF EACH OTHER
 *
 * `core/store/purge.js` opens by saying this in as many words, and the interface is where it either
 * survives or quietly collapses into one path with a warning in front of it.
 *
 * **ARCHIVING IS THE ORDINARY PATH.** A client who has stopped training is archived: the record
 * stays, marked inactive, off the register and still in the history. Restoring brings them back.
 * Both are reversible, so NEITHER ASKS HIM TO CONFIRM ANYTHING — a warning in front of a reversible
 * act teaches him that this application's warnings do not mean much, and the one warning that does
 * mean something is the one he then clicks through.
 *
 * **REMOVING IS THE EXCEPTIONAL PATH** and it is presented completely differently: it says in plain
 * words what will happen, that it cannot be undone, and it OFFERS TO BACK UP FIRST rather than merely
 * warning — which is a recorded decision about destructive actions, not a nicety. It also names the
 * reversible path, because the most likely reason a coach is standing in front of this confirmation
 * is that he wanted the other one.
 *
 * ## THE OFFER IS SHOWN EVEN THOUGH IT CANNOT RUN, AND THAT IS THE DELIBERATE PART
 *
 * Backing up needs the Google step, which is a later piece of work — so today {@link BackupOffer}
 * carries `canRun: false` in every state. The offer is still SHOWN, with an honest account of why it
 * cannot run and what he could do about it, because hiding a thing he is entitled to in order to
 * spare him a sentence is this application deciding on his behalf. The removal stays available with
 * that known: it is his decision, and he makes it with the whole picture rather than with the
 * comfortable half of it.
 *
 * `canRun` is a literal `false` for the same reason `ClinicalFieldReport.canAccept` is: this module's
 * own suite asserts it, so the day somebody wires a real backup the assertion FAILS — which is
 * exactly the day the sentences below stop being true and must be rewritten. A limitation described
 * in prose rots silently; a limitation asserted in a test cannot.
 *
 * ## WHAT THE REGISTER SAYS AFTERWARDS, AND THE ONE SENTENCE IT MAY NOT REWORD
 *
 * A removal is marked propagated only after this device's own backup area has been READ BACK and
 * shown not to contain the removed identities. Until that happens the removal is PENDING, and he must
 * be able to see it from the register rather than only from a screen he has to know to visit.
 *
 * The sentence that draws the distinction — {@link NOT_CONFIRMED_IS_NOT_STILL_THERE} — is IMPORTED
 * from `removals.ts` and used verbatim. Not confirmed is not the same as still there, only the first
 * is known, and there is exactly one sentence in this application that says so. A second, softer copy
 * written for the register would be two sentences about one fact, drifting apart from the moment
 * either was edited, and the softer one would be the one he read most often.
 *
 * ## WHAT IS DELIBERATELY NOT HERE
 *
 * No retry, and no give-up. `markDeletionFailed` in `core/store/purge.js` has no production caller —
 * a deliberately reported gap rather than a hole to be filled from a screen, because marking a
 * removal failed is a judgement about a DELIVERY ATTEMPT and belongs where deliveries happen. A
 * button here would be this screen inventing an opinion about a synchronisation it cannot see.
 * `client-removal.test.ts` asserts that absence rather than trusting this paragraph.
 */

import type { BackupHistory } from './backup-history';
import { verbatimOf } from './clients';
import type { ClientSummary } from './clients';
import { NOT_CONFIRMED_IS_NOT_STILL_THERE, NO_NAME_IS_DELIBERATE, REMOVALS_TITLE } from './removals';
import type { RemovalsReading } from './removals';

// ═══════════════════════════════════════════════════════════════════════════════
// The ordinary path: archive and restore
// ═══════════════════════════════════════════════════════════════════════════════

/** What the reversible control says for a client who is on the register. */
export const ARCHIVE_LABEL = 'Archive';

/** What it says for one who has already been put away. */
export const RESTORE_LABEL = 'Restore';

/** What the exceptional control says. "Remove" rather than "delete": it is his word, not a machine's. */
export const REMOVE_LABEL = 'Remove for good';

/**
 * The two controls on one person's row.
 *
 * THE DESCRIPTIONS EXIST BECAUSE THE LABELS REPEAT. Every row carries the same two words, so a
 * screen reader moving through a register of forty people is handed "Archive" forty times with
 * nothing saying whose. The visible label stays short, and the description carries the name.
 */
export interface RowActions {
  /** `archive` for somebody on the register, `restore` for somebody put away. */
  readonly reversibleKind: 'archive' | 'restore';
  readonly reversibleLabel: string;
  readonly reversibleDescription: string;
  readonly removeLabel: string;
  readonly removeDescription: string;
}

/**
 * What this person's row offers, and it is decided by whether they are archived rather than by the
 * screen holding two branches of its own.
 *
 * NEITHER REVERSIBLE CONTROL CARRIES A CONFIRMATION, and that is the decision this function encodes:
 * there is no `confirm` field to set, because a reversible act does not get one.
 */
export function describeRowActions(client: ClientSummary): RowActions {
  const reversibleKind = client.archived ? 'restore' : 'archive';

  return {
    reversibleKind,
    reversibleLabel: client.archived ? RESTORE_LABEL : ARCHIVE_LABEL,
    reversibleDescription: client.archived
      ? `Restore ${client.name} to your register`
      : `Archive ${client.name}`,
    removeLabel: REMOVE_LABEL,
    removeDescription: `Remove ${client.name} and their history for good`,
  };
}

/**
 * What the screen says once somebody has been archived.
 *
 * It says where they went, because "Archived" on its own reads as something having been taken away
 * from him. Nothing was: the history is the thing he keeps.
 */
export function archivedWords(name: string): string {
  return `${name} is archived. Everything of theirs is kept — show archived clients to find them.`;
}

/** What it says once somebody has been brought back. */
export function restoredWords(name: string): string {
  return `${name} is back on your register.`;
}

/**
 * What it says once somebody has been removed.
 *
 * IT SAYS THIS DEVICE, AND ONLY THIS DEVICE, deliberately. That is the whole of what is known at the
 * instant the removal commits: the backup has not been looked at, and it cannot be until this device
 * next has a connection. The rest of the truth is carried by the pending-removal notice below, which
 * is why this sentence stops where it does rather than reassuring him one clause too far.
 */
export function removedWords(name: string): string {
  return `${name} is removed from this device.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// The exceptional path: the confirmation, and the offer inside it
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * What is true about this device's ability to take a backup before a removal IS ITS BACKUP HISTORY —
 * `backup-history.ts`, the same state the protected clinical field reads.
 *
 * One fact, one type, one set of words: whether a synchronisation has ever COMPLETED on this device.
 * The clinical field and this offer really are the same question wearing two hats, and two answers to
 * it would eventually disagree.
 *
 * WHAT IS NOT THE SAME QUESTION is whether Google is reachable NOW. This type used to spell its
 * members `'connected' | 'never-connected'` — the backup indicator's vocabulary, for a fact about the
 * past — and the two were measured contradicting each other on one screen. See `backup-history.ts`.
 */

/** The offer to back up before removing somebody. */
export interface BackupOffer {
  readonly title: string;
  /** Why he might want one — including the part that is uncomfortable. */
  readonly whatItIsFor: string;
  /** What is true about THIS device, in his words. */
  readonly whatHappened: string;
  /** Something he can actually cause himself, or null when there genuinely is nothing. */
  readonly whatToDo: string | null;
  /**
   * Whether this build can take a backup from here at all.
   *
   * FALSE IN EVERY STATE TODAY, and asserted as false by this module's own suite — see the note at
   * the top of this file for why that assertion is the point rather than a formality.
   */
  readonly canRun: false;
}

/** What the confirmation says, in the order it says it. */
export interface RemovalConfirmation {
  readonly title: string;
  /** What is about to happen, in plain words, including what is kept and why. */
  readonly whatWillHappen: string;
  /** That it cannot be undone. Its own field because it is its own sentence and never a clause. */
  readonly cannotBeUndone: string;
  /** The reversible path, named — because it is most likely the one he actually wants. */
  readonly archiveInstead: string;
  readonly backup: BackupOffer;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

/** The heading on the offer, wherever it appears. */
export const BACKUP_OFFER_TITLE = 'Back up first?';

/**
 * WHY A BACKUP BEFORE A REMOVAL IS WORTH TAKING, AND WHAT IT COSTS — one sentence each, and the
 * second one is the honest half that a friendlier version of this screen would leave out.
 *
 * A backup taken now CONTAINS the person he is about to remove. That is exactly what makes it useful
 * — it is what he would restore from if he removed the wrong client — and it is also a copy of their
 * history that this application cannot reach into afterwards to take them out of. Both are true, both
 * matter to the decision, and he is told both before he decides rather than discovering the second
 * one later.
 */
export const BACKUP_OFFER_PURPOSE =
  'A backup taken now would still contain them — useful if you removed the wrong person, but this '
  + 'app cannot remove them from it afterwards.';

/**
 * What the offer says for the state this device is actually in.
 *
 * THE STATE IS READ, NOT ASSUMED. "This device has never backed anything up" is true today and stops
 * being true the moment the Google step lands; an offer that went on saying it would be telling him
 * to connect an account that is already connected — no error anywhere, and the only symptom a
 * sentence that quietly stopped being true.
 */
export function describeBackupOffer(state: BackupHistory): BackupOffer {
  const common = {
    title: BACKUP_OFFER_TITLE,
    whatItIsFor: BACKUP_OFFER_PURPOSE,
    canRun: false as const,
  };

  switch (state) {
    case 'unknown':
      return {
        ...common,
        whatHappened: 'Checking whether this device can back up — one moment.',
        whatToDo: null,
      };

    case 'never-backed-up':
      return {
        ...common,
        // IT NAMES THE FACT IT READ, WHICH IS THE HISTORY. It used to open "because your Google
        // account has not been connected here yet" — a statement about the present connection, which
        // this offer does not measure and the indicator does. Connecting is still named, as the ACT
        // that makes a backup possible rather than as a claim about where this device stands now.
        whatHappened: 'This device has never backed anything up, so there is nothing to back up to yet.',
        // WHERE THE CONNECTING IS SET UP, NAMED AS A SCREEN RATHER THAN AS A BUTTON — the same
        // correction s11/a41 made to `clients.ts`'s WHERE_TO_CONNECT, and that constant's own note
        // carries the measurement. In one line: Admin holds no connect act and is forbidden to, and
        // neither control that does hold it can be promised to be on screen when he reads this, so
        // this names Admin and "Open Setup" — both of which are permanent — and claims no third.
        whatToDo:
          'Open Admin, then Open Setup, to connect your Google account first — or go ahead without one.',
      };

    case 'has-backed-up':
      return {
        ...common,
        // This device HAS backed up, so sending him off to connect would be false. The honest answer
        // is the uncomfortable one: taking a backup on demand is not built.
        //
        // AND IT CLAIMS ONLY THE PAST. It used to open "This device is connected to your Google
        // account and has backed up before" — the first half of which this offer never measured, and
        // which the indicator flatly contradicted after a sign-out. The second half is the half that
        // was read, so it is the only half said.
        whatHappened:
          'This device has backed up to your Google account before. Taking a backup on demand from '
          + 'here is not finished yet.',
        whatToDo: null,
      };

    default: {
      // A state with no words is a compile error here, which is the point of this clause.
      const unreached: never = state;
      throw new Error(`no words were written for the backup-offer state "${String(unreached)}"`);
    }
  }
}

/**
 * The whole confirmation for removing one person.
 *
 * ## WHAT IT PROMISES IS WHAT THE CORE ACTUALLY DOES
 *
 * `core/store/purge.js` holds two rules that BOTH have to hold, and the second is the one a confident
 * sentence here would get wrong: a session shared with another client is NOT deleted, it is edited to
 * take the departed client out, because that session is the other person's history too. Saying
 * "everything of theirs is removed" and stopping would be a promise this application deliberately
 * does not keep, and he would eventually find the shared session and conclude the removal had failed.
 *
 * ## WHY THE REVERSIBLE PATH IS NAMED HERE
 *
 * Not to talk him out of it. He is standing in front of this because he chose the exceptional
 * control, and the most common reason for choosing it is not knowing the ordinary one exists.
 * Naming it costs one sentence and is the difference between a coach who archived a client and a
 * coach who destroyed a history he wanted.
 */
export function describeRemovalConfirmation(
  name: string,
  state: BackupHistory,
): RemovalConfirmation {
  return {
    title: `Remove ${name} for good?`,
    whatWillHappen:
      `Removes ${name}'s record, sessions, readings, notes and diet plans from this device, and `
      + 'queues the removal for your Google Drive backup. A session shared with another client is '
      + `kept, with ${name} taken out of it.`,
    cannotBeUndone: 'This cannot be undone — nothing of theirs is left on this device.',
    archiveInstead: `Archive ${name} instead to keep everything and bring them back later.`,
    backup: describeBackupOffer(state),
    confirmLabel: 'Remove them for good',
    // "Keep" rather than "Cancel": it says what pressing it leaves him with, and it is the safe one.
    cancelLabel: `Keep ${name}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// When one of the three does not work
// ═══════════════════════════════════════════════════════════════════════════════

/** Which of the three was being attempted. The headline differs; the failure's own words do not. */
export type ClientAction = 'archive' | 'restore' | 'remove';

/** What the screen says when one of them failed. */
export interface ActionFailure {
  readonly headline: string;
  /** Whatever went wrong, in its own words. He may have to read it out. */
  readonly verbatim: string | null;
}

/**
 * Why an archive, a restore or a removal did not happen.
 *
 * THE REMOVAL HEADLINE SAYS NOTHING WAS TOUCHED, AND IT IS ENTITLED TO. `purgeClient` commits the
 * whole removal in ONE transaction — the records, the queue sweep and the manifest together — so a
 * failure leaves the client exactly as they were. That is worth saying out loud: the state a coach
 * fears after a failed deletion is the half-deleted one, and this is the sentence that tells him it
 * is not the state he is in.
 */
export function describeActionFailure(
  error: unknown,
  name: string,
  action: ClientAction,
): ActionFailure {
  const headline =
    action === 'archive'
      ? `${name} could not be archived on this device`
      : action === 'restore'
        ? `${name} could not be restored on this device`
        : `${name} was not removed, and nothing of theirs was changed`;

  return { headline, verbatim: verbatimOf(error) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// What the register says about removals that are not confirmed gone
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The register's own report of removals not yet confirmed gone from the backup.
 *
 * This is the half of a removal that used to be invisible. The core does the honest work — a manifest
 * stays pending until this device has read its own backup area back and seen the identities are not
 * in it — and until now the only place that showed one was a screen he had to know to visit. It is on
 * the register too now, which is where he is standing when he removes somebody.
 */
export interface RegisterRemovalsNotice {
  /** True when there is something outstanding. False means the register draws nothing. */
  readonly present: boolean;
  readonly count: number;
  readonly heading: string;
  readonly intro: string;
  /** {@link NOT_CONFIRMED_IS_NOT_STILL_THERE}, verbatim. Never reworded — see the top of this file. */
  readonly meaning: string;
  /** Why this app cannot say who. Verbatim, from the same author as the sentence above it. */
  readonly noName: string;
  readonly linkLabel: string;
}

function removalCount(count: number): string {
  return count === 1 ? '1 removal' : `${count} removals`;
}

/**
 * What the register says about outstanding removals, from the page the core handed over.
 *
 * ## IT IS DRAWN ONLY WHEN THERE IS SOMETHING OUTSTANDING, and that is a departure worth defending
 *
 * The ways in to the removals screen from Admin are PERMANENT, on purpose: a link that appears only
 * when it has something to say is a link nobody can find when they go looking. That reasoning is
 * about REACHABILITY, and it is already satisfied — Admin carries the permanent way in and
 * `no-dead-ends.test.ts` proves it resolves.
 *
 * This is a different thing: a REPORT of something outstanding, on the busiest screen in the
 * application. A panel saying "nothing is waiting" on every visit to the register is one he stops
 * reading by the second week, and it would take the sentence with it on the week it was not empty.
 */
export function describeRegisterRemovals(reading: RemovalsReading): RegisterRemovalsNotice {
  const count = reading.pending.items.length;
  // The remote half STRENGTHENS this notice and never softens it. A register panel reading "not yet
  // confirmed" while the screen behind it says "still there" would have him decide from the summary
  // not to look. An empty still-present list changes nothing here, for the reason `removals.ts`
  // states: on most passes the verify step never runs, so empty is not clear.
  const found = reading.remote.still_present.some((entry) => entry.found.length > 0);

  return {
    present: count > 0,
    count,
    heading: REMOVALS_TITLE,
    intro: found
      ? `${removalCount(count)} done on this device — checked against your Google Drive backup, `
        + 'and records were found still there.'
      : `${removalCount(count)} done on this device, not yet confirmed gone from your Google Drive `
        + 'backup.',
    meaning: NOT_CONFIRMED_IS_NOT_STILL_THERE,
    noName: NO_NAME_IS_DELIBERATE,
    linkLabel: 'See which removals',
  };
}
