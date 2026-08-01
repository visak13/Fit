/**
 * WHAT THE PENDING-REMOVAL SURFACE SAYS — the whole derivation, and none of the drawing.
 *
 * ## The belief this exists to correct, in the core's own words
 *
 * `core/sync/deletions.js` opens by naming the failure it was written to prevent: *"A clinical
 * reference living on in a backup forever is the failure this exists to prevent, and it is invisible:
 * nothing errors, and the coach believes the client is gone."*
 *
 * The core does the honest half properly. A removal is marked propagated ONLY after this device's own
 * remote area has been READ BACK and shown not to contain the removed identities —
 * `PROPAGATION_IS_VERIFIED_BY_READ_BACK`, asserted by its own test — and `core/store/STORE.md` §7.3 is
 * explicit that a failure leaves the manifest PENDING rather than tidying it away, "because a deletion
 * that quietly stopped being retried is a departed client's note living on in a backup with nothing left
 * saying it should not".
 *
 * And then nothing told him. No screen anywhere listed a manifest sitting pending. The core built an
 * honest record of an unfinished removal and the belief it was written to correct was never corrected.
 * This file is the correction.
 *
 * ## THE ONE SENTENCE THIS SURFACE MUST GET RIGHT
 *
 * **"Not yet confirmed gone" is not "still there".** They are different facts and only the first is
 * known. A pending manifest means this device has not READ BACK a clean area — which is also what one
 * ordinary un-synchronised hour looks like, because the read-back happens during a synchronisation pass
 * and the area is not physically rewritten until a compaction. Saying "their notes are still in your
 * backup" would be alarming and frequently false; saying "gone" would be reassuring and sometimes
 * false. The true statement is the uncomfortable middle one, and it is what this says.
 *
 * ## WHAT THIS SURFACE CANNOT NAME, AND WHY THAT IS RIGHT
 *
 * It cannot tell him WHO. The manifest holds `subject_client_id` and nothing else about the person —
 * `core/store/purge.js` says "identities only, no content of any kind", and the journal entry that
 * outlives them keeps the identity and nothing more, deliberately, so that a purge does not leave the
 * departed client's name lying around in the very records meant to prove they were removed.
 *
 * That is the minimisation posture working exactly as designed, and the screen SAYS SO rather than
 * showing a bare identifier and letting it read as a defect. A surface that apologised for it, or
 * worse, that kept a name in order to be friendlier, would be undoing the protection.
 *
 * ## THE REMOTE HALF, WHICH IS NOW HERE — and the one thing it may say that the local half may not
 *
 * S16 is this paragraph. `core/sync/deletions.js` reads this device's own area BACK and reports, per
 * removal, exactly which record identities it STILL FOUND there — `SyncReport.deletions.still_present`.
 * That is a different and STRONGER fact than a pending manifest: the app has looked, and they were
 * there. So the sentence above — *"not yet confirmed gone" is not "still there"* — is not weakened by
 * this; it is what makes it possible to say "still there" HONESTLY, on the one removal where it is
 * known, without ever saying it about the others.
 *
 * It arrives as a FIELD ON THE SAME READING and a section here, exactly as `shell/Removals.tsx`
 * specified. There is no second screen and no second wire.
 *
 * ### THE TRAP INSIDE IT, AND IT IS A FALSE-GREEN OF THE FAMILIAR SHAPE
 *
 * **An EMPTY `still_present` does not mean "checked and clear".** `core/sync/engine.js` only runs the
 * verify-deletions step when there were carried deletions AND a compaction actually ran; every other
 * pass reports `still_present: []` having looked at nothing. If this surface turned that into "the
 * last check found none of these in your backup", it would be manufacturing the reassuring answer out
 * of a step that never executed — the exact defect `core/sync/false-green.test.js` exists for.
 *
 * So the remote half is **PURELY ADDITIVE**: it can only ever STRENGTHEN what is said about a removal
 * it NAMES. It never produces a reassuring sentence, and `reported` exists on the reading so that a
 * later reader cannot mistake "no pass has run" for "a pass found nothing". A removal the report does
 * not name keeps the local half's words unchanged, which are already the honest ones.
 *
 * ## WHAT THE PURGE COULD NOT CLEAN, WHICH WAS ALREADY IN THIS READING AND SAID NOWHERE
 *
 * `core/store/purge.js` persists the queue sweep's own result ON the manifest — `outbox.unresolved` —
 * and `pendingDeletions` has been handing it to this surface all along. It is the same detected-but-
 * unsurfaced shape as everything else in this step, and closing it needed no wire at all: an opaque
 * queued payload naming the departed client AND a staying one is LEFT ALONE, deliberately and
 * correctly, because cleaning it would destroy the other client's data. That choice is right and is
 * not being changed. What was wrong is that nothing told him.
 *
 * It is worded as what it is: a thing that **will not clear on its own**, unlike everything else on
 * this screen. See `core/INTEGRATION.md` §4 for what is and is not surfaced, and by which surface.
 *
 * ## What it STILL does not do
 *
 * It offers no retry and no give-up: `markDeletionFailed` has no production caller, which is a real
 * gap reported as one rather than filled from a screen.
 */

import { UNRESOLVED } from '../../core/outbox/scrub.js';
import { PERFORMED_ACT, performedFor } from '../shell/action-destinations.ts';
import type { ReportPair } from './admin-report';

/**
 * THE WORDS ON THE CONTROL THAT RUNS A PASS, TAKEN FROM THE TABLE RATHER THAN REMEMBERED.
 *
 * These sentences said "Tap Sync" three times, and NOTHING IN THIS APPLICATION IS CALLED SYNC. It is
 * the same defect `action-destinations.ts` records against the erase gate — a sentence describing the
 * screen from memory — repeated in a file a previous fix had already visited. `setup-surface.ts`
 * takes the connecting act's words the same way and for the same reason: there is one label, so two
 * surfaces cannot come to spell it differently.
 */
const RUN_A_PASS_NOW: string = (() => {
  const performed = performedFor('sync_now');
  if (performed === null || performed.act !== PERFORMED_ACT.SYNCHRONISE) {
    throw new Error('the act that runs a backup pass is no longer performed here, so this screen cannot name it');
  }
  return performed.words;
})();

/**
 * HOW A CONTROL THAT IS NOT ALWAYS THERE IS NAMED HONESTLY.
 *
 * MEASURED, and it is the half that makes the rename more than a spelling correction. The control is
 * drawn by `SyncStatus.tsx` only when the LEADING reason's action code is `sync_now`, and
 * `core/status/reasons.js` ranks `not_yet_backed_up` LAST of eleven — so on an offline device, or one
 * whose credential has expired, the coach is reading this screen with no such button anywhere on it.
 * This surface cannot ask which state the indicator is in: `frame-structure.test.ts` forbids a screen
 * from reading the synchronisation seam at all, and rightly, because a second live region is a second
 * announcement of one state.
 *
 * So the sentence names the real control AND states the condition instead of asserting it, and the
 * thing that is ALWAYS true — a connected moment runs a pass by itself — is what it leads with. A
 * sentence that simply swapped one name for another would still be telling him to press something
 * that is frequently not there, which is the defect rather than its fix.
 */
const A_CONNECTED_MOMENT =
  `Open the app while you have a connection, or press “${RUN_A_PASS_NOW}” on the backup indicator `
  + 'when it is offering it.';

/**
 * A deletion manifest exactly as `core/store/purge.js` wrote it. Nothing renamed, nothing added.
 *
 * The core is plain ECMAScript typed in documentation comments and is consumed here UNCHANGED — see
 * `tsconfig.json` — so the shape it needs is stated where it is used.
 */
export interface DeletionManifest {
  readonly deletion_id: string;
  readonly manifest_version: number;
  /** The departed client's identity. The ONLY thing kept about them, on purpose. */
  readonly subject_client_id: string;
  readonly requested_at: string;
  readonly device: string;
  readonly status: string;
  readonly attempts: number;
  readonly last_error: string | null;
  readonly propagated_at: string | null;
  /** Records to be removed remotely as well. Identities and types only. */
  readonly removed: readonly { readonly type: string; readonly record_id: string }[];
  /** Records to be pushed as a revision instead, because somebody else's history is in them. */
  readonly revised: readonly { readonly type: string; readonly record_id: string; readonly rev: number }[];
  /**
   * What the queue sweep did, as `core/outbox/scrub.js` reported it and the purge PERSISTED it.
   *
   * Identities and counts only — `core/store/purge.js` is explicit that this travels in a manifest
   * that carries no content — which is why it can be shown at all.
   */
  readonly outbox: OutboxSweep;
}

/** The queue sweep's own result, field for field as `core/outbox/scrub.js` names them. */
export interface OutboxSweep {
  readonly inspected: number;
  readonly rewritten: number;
  readonly removed: number;
  readonly unresolved: readonly UnresolvedEntry[];
}

/** One queued delivery the sweep could not clean. `why` is a declared CODE, never a message. */
export interface UnresolvedEntry {
  readonly entry_id: string;
  readonly why: string;
  readonly record_ids: readonly string[];
}

/** A page exactly as the core paged it. `done` is carried because a restore can produce many at once. */
export interface RemovalsPage {
  readonly items: readonly DeletionManifest[];
  readonly cursor: string | null;
  readonly done: boolean;
}

/**
 * One entry of `SyncReport.deletions.still_present`, field for field and name for name.
 *
 * `found` is record IDENTITIES the read-back saw in this device's own area — no name, no note, no
 * content, and nothing the provider authored. That is what makes it safe to put on a screen.
 */
export interface StillPresentEntry {
  readonly deletion_id: string;
  readonly found: readonly string[];
}

/**
 * What the last synchronisation pass was able to confirm about removals — the REMOTE half.
 *
 * `reported` is carried separately from the list and it is not decoration. An empty `still_present`
 * has two completely different meanings — "a pass verified and found none" and "no pass verified
 * anything" — and this surface is forbidden from turning either into reassurance. See the header.
 */
export interface RemoteConfirmation {
  /** True once a synchronisation pass has reported at all. Never used to say anything is clear. */
  readonly reported: boolean;
  readonly still_present: readonly StillPresentEntry[];
}

/**
 * What is true before any pass has reported, and it is a FACT rather than a placeholder: nothing has
 * been read back, so nothing is confirmed present. It says nothing reassuring, on purpose.
 */
export const NO_PASS_HAS_REPORTED: RemoteConfirmation = Object.freeze({
  reported: false,
  still_present: Object.freeze([]) as readonly StillPresentEntry[],
});

export interface RemovalsReading {
  readonly pending: RemovalsPage;
  /** The remote half. `NO_PASS_HAS_REPORTED` until a synchronisation pass has reported one. */
  readonly remote: RemoteConfirmation;
}

/** The screen's own title, one constant, so the link into it and the screen cannot disagree. */
export const REMOVALS_TITLE = 'Removals not yet confirmed';

/**
 * The sentence that says what a pending removal MEANS, and it is one constant for the same reason
 * `PERSISTENCE_IS_NOT_IMMUNITY` is: exactly one sentence in this application draws this distinction, and
 * it is not reworded anywhere. "Not confirmed gone" is a statement about what this app KNOWS, not a
 * statement that the records are still there.
 */
export const NOT_CONFIRMED_IS_NOT_STILL_THERE =
  'Not confirmed does not mean still there. It means this app has not yet looked in your backup and '
  + 'seen that they are gone, so it will not tell you they are.';

/**
 * Why this app cannot say who the removal was for. Stated as the protection working, because it is.
 */
export const NO_NAME_IS_DELIBERATE =
  'This app did not keep their name. When you remove a client it keeps only a reference, so that '
  + 'removing somebody does not leave their name behind in the very record that proves they were '
  + 'removed.';

/**
 * What a queued delivery the sweep could not clean MEANS, keyed on the declared code.
 *
 * KEYED ON THE CODE AND NEVER ON MESSAGE TEXT. `core/status/reasons.js` already draws that line for
 * classification; this draws it for DISPLAY, which is the half that line did not cover. A provider's
 * own words can carry an account address or a response fragment, and a surface is where text stops
 * being transient and starts being written down. Nothing here is authored anywhere but here.
 */
export const UNRESOLVED_MEANS: Readonly<Record<string, string>> = Object.freeze({
  [UNRESOLVED.OPAQUE_SHARED]:
    'A file that was already waiting to go to your Google Drive mentions this client and another '
    + 'client together. This app cannot open that file to take one of them out of it, and deleting '
    + 'the whole file would take data belonging to the other client with it. So it was left exactly '
    + 'as it is.',
  [UNRESOLVED.NO_REVISION]:
    'A shared session this client was in could not be rewritten without them, so it was left exactly '
    + 'as it is rather than removing history belonging to another client along with theirs.',
});

/** What is said about a code nobody has worded yet. It says what is known and invents nothing. */
export const UNRESOLVED_UNWORDED =
  'Part of this removal could not be carried out, and this app was not able to say why in plain '
  + 'words. The reference below is what somebody helping you will need.';

/**
 * The sentence that says this one is DIFFERENT from everything else on the screen.
 *
 * Every other state here resolves itself the next time the app has a connection. This one does not,
 * ever, and a surface that let it sit among things that clear on their own would have him waiting for
 * something that is never coming.
 */
export const WILL_NOT_CLEAR_ON_ITS_OWN =
  'This one will not clear on its own. This app has deliberately not touched that file, because '
  + 'data belonging to another client is in it too.';

/** One queued delivery the purge could not clean, worded. Identities and our own words only. */
export interface LeftBehindItem {
  readonly entryId: string;
  /** The declared code, kept literal because it is what somebody helping him will search for. */
  readonly why: string;
  readonly whatItMeans: string;
  readonly persists: string;
  readonly whatToDo: string;
  readonly forensic: readonly ReportPair[];
}

/** One pending removal, worded. */
export interface RemovalItem {
  readonly deletionId: string;
  /** The heading. Never a name, because there is none — see {@link NO_NAME_IS_DELIBERATE}. */
  readonly heading: string;
  /** The departed client's reference, which is what somebody helping him would ask for. */
  readonly reference: string;
  /** When he removed them. Literal: the instant is the evidence. */
  readonly requestedAt: string;
  /** What state this is in, as a word. The word carries it; a tone is only ever a second channel. */
  readonly chipWord: string;
  /** What is true about this one, in one paragraph. */
  readonly whatHappened: string;
  /**
   * The service's own failure text if a delivery reported one, verbatim, or null.
   *
   * Kept because a manifest can be pending WITH a recorded reason — `markDeletionFailed` leaves it
   * pending on purpose — and "tried and did not work" needs different words from "not tried yet".
   */
  readonly whyVerbatim: string | null;
  /** True when a delivery has actually been attempted and reported a reason. */
  readonly tried: boolean;
  /** What to do. Genuinely available today: it is a synchronisation, which he can cause. */
  readonly whatToDo: string;
  /** How much this removal covers, permanently, so its weight is not hidden behind a fold. */
  readonly scope: string;
  /**
   * TRUE only when a pass READ THE BACKUP BACK AND FOUND THEM. This is the one flag on this screen
   * that licenses the strong claim, and it is never inferred from an absence — see the header.
   */
  readonly confirmedPresent: boolean;
  /** How many of their record identities the read-back actually saw. Zero unless confirmed. */
  readonly foundCount: number;
  /** What the read-back found, said out loud. Null unless it found something. */
  readonly foundWords: string | null;
  /** What the purge could not clean, worded. Empty on almost every removal there will ever be. */
  readonly leftBehind: readonly LeftBehindItem[];
  /** The forensic half: references and counts, folded and counted. Nothing is discarded. */
  readonly forensic: readonly ReportPair[];
}

/** What the screen says as a whole. */
export interface RemovalsReport {
  readonly title: string;
  /** The one figure the screen is for: how many removals are not yet confirmed gone. */
  readonly count: number;
  readonly intro: string;
  /**
   * How many of them a pass READ BACK AND FOUND. Never a proportion and never a reassurance: the
   * other `count - confirmedPresent` are UNKNOWN, not clear.
   */
  readonly confirmedPresent: number;
  /** Said only when something was found. Null otherwise, including when no pass has ever run. */
  readonly confirmedPresentWords: string | null;
  /** How many queued deliveries the purge could not clean, across every removal on this page. */
  readonly leftBehind: number;
  readonly settled: boolean;
  /** The standing sentence, present in both states, never reworded. */
  readonly meaning: string;
  /** True when the page stopped short of the end of the list, so the count is a floor. */
  readonly more: boolean;
  readonly moreWords: string | null;
  readonly items: readonly RemovalItem[];
}

function removalCount(count: number): string {
  return count === 1 ? '1 removal' : `${count} removals`;
}

/** How much one removal covers, in plain words. Both numbers, because they mean different things. */
function scopeWords(manifest: DeletionManifest): string {
  const removed = manifest.removed.length;
  const revised = manifest.revised.length;
  const removedWords = removed === 1 ? '1 record to remove' : `${removed} records to remove`;

  if (revised === 0) return `${removedWords}.`;

  // A revised record is a SHARED session another client also attended: it is edited to take the
  // departed client out rather than deleted, because it is somebody else's history too. Saying this is
  // what stops the count reading as "some were missed".
  return (
    `${removedWords}, and ${revised === 1 ? '1 shared record' : `${revised} shared records`} to change `
    + 'rather than remove, because another client is in them too.'
  );
}

function forensicPairs(manifest: DeletionManifest, found: readonly string[]): readonly ReportPair[] {
  const pairs: ReportPair[] = [
    { label: 'Removal reference', literal: true, value: manifest.deletion_id },
    { label: 'Client reference', literal: true, value: manifest.subject_client_id },
    { label: 'Removed on this device', literal: true, value: manifest.device },
    { label: 'Removed at', literal: true, value: manifest.requested_at },
    { label: 'Records to remove', literal: false, value: String(manifest.removed.length) },
    { label: 'Shared records to change', literal: false, value: String(manifest.revised.length) },
    { label: 'Times tried', literal: false, value: String(manifest.attempts) },
  ];
  if (manifest.last_error !== null) {
    pairs.push({ label: 'Last reason given', literal: true, value: manifest.last_error });
  }
  // Only when the read-back genuinely found something. A row reading "0" would be a claim that a
  // check ran and came back clear, which is precisely what an absent entry does NOT mean.
  for (const identity of found) {
    pairs.push({ label: 'Still in the backup', literal: true, value: identity });
  }
  return pairs;
}

/** How many of their records the read-back saw, said as a fact about a moment rather than a state. */
function foundWords(count: number): string {
  return count === 1
    ? '1 of their records was still in your Google Drive backup when this app last looked.'
    : `${count} of their records were still in your Google Drive backup when this app last looked.`;
}

/** One queued delivery the purge could not clean, worded from the CODE and nothing else. */
export function describeLeftBehind(unresolved: UnresolvedEntry): LeftBehindItem {
  return {
    entryId: unresolved.entry_id,
    why: unresolved.why,
    whatItMeans: UNRESOLVED_MEANS[unresolved.why] ?? UNRESOLVED_UNWORDED,
    persists: WILL_NOT_CLEAR_ON_ITS_OWN,
    whatToDo:
      'There is nothing to tap for this one. If you want that file out of your Google Drive, read '
      + 'this out to whoever set the app up for you — do not go into Drive and delete files '
      + 'yourself, because data belonging to another client is in it.',
    forensic: [
      { label: 'Queued delivery reference', literal: true, value: unresolved.entry_id },
      { label: 'Reason recorded', literal: true, value: unresolved.why },
      ...unresolved.record_ids.map((recordId) => (
        { label: 'Record named in it', literal: true, value: recordId } as ReportPair
      )),
    ],
  };
}

/**
 * One removal, worded.
 *
 * THREE states now, and the third is the only one permitted to say they are still there: never
 * tried, tried and not confirmed, and READ BACK AND FOUND. The third comes from `still_present` and
 * from nowhere else — an absence never produces it, and an absence never softens the other two.
 */
export function describeRemoval(
  manifest: DeletionManifest,
  found: readonly string[] = [],
): RemovalItem {
  const tried = manifest.attempts > 0 || manifest.last_error !== null;
  const confirmedPresent = found.length > 0;
  const leftBehind = (manifest.outbox?.unresolved ?? []).map(describeLeftBehind);

  return {
    deletionId: manifest.deletion_id,
    heading: 'A client you removed',
    reference: manifest.subject_client_id,
    requestedAt: manifest.requested_at,
    chipWord: confirmedPresent
      ? 'Still in your backup'
      : (tried ? 'Tried and not done' : 'Waiting to be checked'),
    // The strong claim, made ONLY here. Everywhere else on this screen the honest statement is the
    // uncomfortable middle one, because "not confirmed gone" is all that is known. Here the app
    // has looked and seen them, so saying anything softer would be underselling a fact he needs.
    whatHappened: confirmedPresent
      ? 'They are gone from this device. This app has now looked in your Google Drive backup, and '
        + 'some of their records are still there.'
      : (tried
        ? 'They are gone from this device. This app has tried to make sure they are gone from your '
          + 'Google Drive backup as well, and it has not been able to confirm it.'
        : 'They are gone from this device. This app has not yet been able to look in your Google '
          + 'Drive backup and confirm they are gone from there too.'),
    whyVerbatim: manifest.last_error,
    tried,
    whatToDo: confirmedPresent
      ? `${A_CONNECTED_MOMENT} This app rewrites its part of your backup and then reads it back to `
        + 'check, so another pass is what clears this. If it keeps saying the same thing, read this '
        + 'screen out to whoever set the app up for you — do not go into Drive and delete files '
        + 'yourself.'
      : (tried
        ? `${A_CONNECTED_MOMENT} It will try again and check. If this one keeps saying the same `
          + 'thing, read this screen out to whoever set the app up for you — do not go into Drive '
          + 'and delete files yourself.'
        : `${A_CONNECTED_MOMENT} This app checks by reading your backup back, so it needs one `
          + 'connected moment before it can tell you they are gone.'),
    scope: scopeWords(manifest),
    confirmedPresent,
    foundCount: found.length,
    foundWords: confirmedPresent ? foundWords(found.length) : null,
    leftBehind,
    forensic: forensicPairs(manifest, found),
  };
}

/**
 * Which record identities the last pass found for one removal.
 *
 * A lookup and nothing more: no entry means NOT NAMED BY THE REPORT, which is not the same as clear
 * and is never treated as such.
 */
function foundFor(remote: RemoteConfirmation, deletionId: string): readonly string[] {
  const entry = remote.still_present.find((held) => held.deletion_id === deletionId);
  return entry ? entry.found : [];
}

/**
 * Everything the screen says, from the page the core handed over.
 *
 * Nothing pending is a NORMAL state and it is worded like one. This is a surface the coach will see
 * empty almost every time he opens it, and an empty screen that reads as a fault teaches him that the
 * surface cries wolf — which would cost him the one time it was not empty.
 */
export function describeRemovals(reading: RemovalsReading): RemovalsReport {
  const items = reading.pending.items.map(
    (manifest) => describeRemoval(manifest, foundFor(reading.remote, manifest.deletion_id)),
  );
  const confirmedPresent = items.filter((item) => item.confirmedPresent).length;
  const leftBehind = items.reduce((total, item) => total + item.leftBehind.length, 0);

  return {
    title: REMOVALS_TITLE,
    count: items.length,
    // The opening sentence STRENGTHENS when the read-back found something and never weakens when it
    // did not. `reading.remote.reported` is deliberately not consulted here: a pass that ran without
    // reaching the verify step reports an empty list, and letting that soften anything would be the
    // reassuring answer built out of a check that did not happen.
    intro:
      items.length === 0
        ? 'Every client you have removed is confirmed gone from your Google Drive backup as well as '
          + 'from this device.'
        // "1 removal you made IS done", "2 removals you made ARE done". The verb agrees here for the
        // same reason it agrees in `describeRemovalsAdminEntry` below, and it did NOT until now — see
        // the note there, which used to claim this function already agreed and was wrong about it.
        : (confirmedPresent > 0
          ? `${removalCount(items.length)} you made ${items.length === 1 ? 'is' : 'are'} done on this `
            + 'device, and this app has looked in your Google Drive backup and found records still there.'
          : `${removalCount(items.length)} you made ${items.length === 1 ? 'is' : 'are'} done on this `
            + 'device, and this app has not yet confirmed they are gone from your Google Drive backup.'),
    confirmedPresent,
    confirmedPresentWords: confirmedPresent === 0
      ? null
      : (confirmedPresent === 1
        ? 'For 1 of them, this app has looked and their records are still in your backup.'
        : `For ${confirmedPresent} of them, this app has looked and their records are still in your `
          + 'backup.'),
    leftBehind,
    settled: items.length === 0,
    meaning: NOT_CONFIRMED_IS_NOT_STILL_THERE,
    more: !reading.pending.done,
    moreWords: reading.pending.done
      ? null
      : 'There are more than these. This shows the oldest ones first.',
    items,
  };
}

/** What the Admin screen says about this, and the words on the way in. */
export interface RemovalsAdminEntry {
  readonly title: string;
  readonly count: number;
  readonly intro: string;
  readonly linkLabel: string;
  readonly settled: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A READ THAT FAILED, WHICH IS NOT A CONFIRMED DELETION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * WHICH READ did not come back. One member today, declared as a closed set for the reason every
 * other closed set in this module is: this file must hold a sentence for every member, and the set
 * it words and the set `shell/removals-source.ts` tags must be the same one.
 */
export type RemovalsReadStage = 'pending';

/** Which read it was. One sentence per member of {@link RemovalsReadStage}. */
export const REMOVALS_STAGE_WORDS: Readonly<Record<RemovalsReadStage, string>> = Object.freeze({
  pending: 'It was the list of removals waiting to be confirmed that could not be read.',
});

/** Said when the tag is one this module has no sentence for. Never a blank where a fact should be. */
export const REMOVALS_STAGE_UNWORDED = 'This app has not recorded which part of the read it was.';

/**
 * THE SENTENCE THE THIRD STATE EXISTS TO MAKE SAYABLE, and it is the exact opposite of what shipped.
 *
 * What a coach saw after a failed read was *"Every client you have removed is confirmed gone from
 * your Google Drive backup as well as from this device"* — a POSITIVE CLAIM ABOUT A REMOTE SYSTEM,
 * made by a read that looked at nothing. This says the only true thing available: the app could not
 * look, so it is not in a position to confirm anything.
 *
 * It must not be reassuring. This is the surface a coach comes to when he needs to know a departed
 * client's data is gone, and a soft sentence here is worth less than no screen at all.
 */
export const COULD_NOT_READ_THE_REMOVALS =
  'This app could not read your removals from this device. It cannot tell you whether anything is '
  + 'waiting, and it has NOT confirmed that any removal is gone from your backup.';

/**
 * WHAT A FAILED READ DID NOT DO, and this claim is CHECKABLE ON PURPOSE.
 *
 * Two refusal sentences in this build once told the coach a refused save had ERASED something, when
 * a refusal changes nothing — a sentence about a failure makes a separate, checkable claim about the
 * state it left behind. So this one is held to what a READ can be held to: reading is not writing.
 * `removals-source.test.ts` induces a real failure and READS THE STORE BACK to prove it.
 */
export const A_FAILED_REMOVALS_READ_CHANGED_NOTHING =
  'Nothing was changed by trying. Every removal you have made is still recorded on this device, and '
  + 'this app will still check your backup for it.';

/** What to do about it. Try again first, because a read that failed once may not fail twice. */
export const WHAT_TO_DO_ABOUT_A_FAILED_REMOVALS_READ =
  'Close this app and open it again. If it still cannot read them, ask the person who set this app '
  + 'up for you, and show them this screen.';

/** Everything the removals surface says when its read FAILED. A different report: a different state. */
export interface RemovalsFailureReport {
  readonly title: string;
  /** The app tried and could not. */
  readonly headline: string;
  /** Which read it was. */
  readonly whatFailed: string;
  /** What this does NOT mean. */
  readonly notAVerdict: string;
  readonly whatToDo: string;
  /** The stage tag, literal, because it is what somebody helping him will search for. */
  readonly stage: string;
  /** The class of what was thrown, literal, for the same reader and the same reason. */
  readonly errorName: string;
}

/**
 * A FAILED READ, WORDED.
 *
 * Deliberately NOT a variant of {@link describeRemovals}: every sentence there is a statement about
 * what is waiting, and after a failed read this app has not been able to look. A report that shared
 * them would be one flag away from saying both things at once.
 */
export function describeFailedRemovalsRead(
  failure: { readonly stage: string; readonly errorName: string },
): RemovalsFailureReport {
  return {
    title: REMOVALS_TITLE,
    headline: COULD_NOT_READ_THE_REMOVALS,
    whatFailed: REMOVALS_STAGE_WORDS[failure.stage as RemovalsReadStage] ?? REMOVALS_STAGE_UNWORDED,
    notAVerdict: A_FAILED_REMOVALS_READ_CHANGED_NOTHING,
    whatToDo: WHAT_TO_DO_ABOUT_A_FAILED_REMOVALS_READ,
    stage: failure.stage,
    errorName: failure.errorName,
  };
}

/**
 * THE WAY IN, when the read behind it failed.
 *
 * The link stays — it is permanent, like every other entry on the Admin screen — but the summary may
 * not say "nothing is waiting", which is what the settled branch below says and what a failed read
 * used to reach. `count` is null rather than 0 for the same reason: a nought here is a figure this
 * app never counted.
 */
export const REMOVALS_ADMIN_COULD_NOT_READ =
  'This app could not read your removals from this device, so it cannot say whether anything is '
  + 'waiting. Open this to see what happened.';

/**
 * THE WAY IN AFTER A FAILED READ, as its own function rather than a branch inside
 * {@link describeRemovalsAdminEntry}.
 *
 * The same separation s17 drew between `describeJournal` and `describeFailedJournalRead`, and for
 * the same reason: every sentence the other function produces is a statement about what is waiting,
 * and after a failed read this app has not looked. Sharing them would be one flag away from saying
 * both things at once — and the settled branch of the other function is exactly the sentence a
 * failed read used to reach.
 *
 * `settled` is FALSE. It is what the card reads to decide whether to draw itself quietly, and a
 * failed read is not a quiet state. `count` is 0 because the shape requires a number; the surface
 * draws {@link RemovalsAdminEntry.intro}, which says the app could not count, rather than the
 * figure — see `AdminScreen.tsx`.
 */
export function describeFailedRemovalsAdminEntry(): RemovalsAdminEntry {
  return {
    title: REMOVALS_TITLE,
    count: 0,
    intro: REMOVALS_ADMIN_COULD_NOT_READ,
    linkLabel: 'See what happened',
    settled: false,
  };
}

/**
 * The permanent way in, worded for both states.
 *
 * PERMANENT, not conditional on there being something to show — the same choice, for the same reason, as
 * the other links on the Admin screen.
 */
export function describeRemovalsAdminEntry(reading: RemovalsReading): RemovalsAdminEntry {
  const report = describeRemovals(reading);

  if (report.settled) {
    return {
      title: REMOVALS_TITLE,
      count: 0,
      intro:
        'Nothing is waiting. When you remove a client, this app checks your backup afterwards and '
        + 'lists them here until it has confirmed they are gone from it too.',
      linkLabel: 'Check for yourself',
      settled: true,
    };
  }

  return {
    title: REMOVALS_TITLE,
    count: report.count,
    // "1 removal IS", "2 removals ARE". Found by looking at the Admin screen during the s5 join
    // walk-through, with one removal pending: it read "1 removal are done on this device". The
    // count is interpolated and the verb was not, so the sentence was correct for every number but
    // the one the coach meets first.
    //
    // THIS NOTE USED TO END "`describeRemovals` above already agrees its own verb", AND THAT WAS FALSE
    // — it hardcoded "are" and shipped "1 removal you made are done on this device" to the removals
    // screen for the whole of that time. The sentence was corrected in the s7 join walk-through, by
    // READING THE SCREEN rather than the code. The reason it survived one round of this exact fix is
    // the clause itself: a comment asserting coverage is what stops the next reader looking, and no
    // test had ever driven the singular case. Both are fixed together, because leaving either would
    // leave the trap armed.
    //
    // AND IT STRENGTHENS WHEN THE READ-BACK FOUND SOMETHING. The way in must not be milder than the
    // screen behind it: "not yet confirmed" in front of a screen saying "still there" would have him
    // decide from the summary not to open it.
    intro: report.confirmedPresent > 0
      ? `${removalCount(report.count)} ${report.count === 1 ? 'is' : 'are'} done on this device, and `
        + 'this app has looked in your backup and found records still there.'
      : `${removalCount(report.count)} ${report.count === 1 ? 'is' : 'are'} done on this device and `
        + 'not yet confirmed gone from your backup.',
    linkLabel: 'See which removals',
    settled: false,
  };
}
