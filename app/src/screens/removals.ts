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
 * ## What it does NOT do
 *
 * It names no record identity that is still present remotely — that rides the sync report and belongs to
 * S16 (see `shell/Removals.tsx`). It offers no retry and no give-up: `markDeletionFailed` has no
 * production caller, which is a real gap reported as one rather than filled from a screen.
 */

import type { ReportPair } from './admin-report';

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
}

/** A page exactly as the core paged it. `done` is carried because a restore can produce many at once. */
export interface RemovalsPage {
  readonly items: readonly DeletionManifest[];
  readonly cursor: string | null;
  readonly done: boolean;
}

export interface RemovalsReading {
  readonly pending: RemovalsPage;
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
  /** The forensic half: references and counts, folded and counted. Nothing is discarded. */
  readonly forensic: readonly ReportPair[];
}

/** What the screen says as a whole. */
export interface RemovalsReport {
  readonly title: string;
  /** The one figure the screen is for: how many removals are not yet confirmed gone. */
  readonly count: number;
  readonly intro: string;
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

function forensicPairs(manifest: DeletionManifest): readonly ReportPair[] {
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
  return pairs;
}

/** One removal, worded. The two states — never tried, and tried and not done — get different words. */
export function describeRemoval(manifest: DeletionManifest): RemovalItem {
  const tried = manifest.attempts > 0 || manifest.last_error !== null;

  return {
    deletionId: manifest.deletion_id,
    heading: 'A client you removed',
    reference: manifest.subject_client_id,
    requestedAt: manifest.requested_at,
    chipWord: tried ? 'Tried and not done' : 'Waiting to be checked',
    whatHappened: tried
      ? 'They are gone from this device. This app has tried to make sure they are gone from your '
        + 'Google Drive backup as well, and it has not been able to confirm it.'
      : 'They are gone from this device. This app has not yet been able to look in your Google Drive '
        + 'backup and confirm they are gone from there too.',
    whyVerbatim: manifest.last_error,
    tried,
    whatToDo: tried
      ? 'Tap Sync, or open the app while you have a connection, and it will try again and check. If '
        + 'this one keeps saying the same thing, read this screen out to whoever set the app up for '
        + 'you — do not go into Drive and delete files yourself.'
      : 'Open the app while you have a connection, or tap Sync. This app checks by reading your '
        + 'backup back, so it needs one connected moment before it can tell you they are gone.',
    scope: scopeWords(manifest),
    forensic: forensicPairs(manifest),
  };
}

/**
 * Everything the screen says, from the page the core handed over.
 *
 * Nothing pending is a NORMAL state and it is worded like one. This is a surface the coach will see
 * empty almost every time he opens it, and an empty screen that reads as a fault teaches him that the
 * surface cries wolf — which would cost him the one time it was not empty.
 */
export function describeRemovals(reading: RemovalsReading): RemovalsReport {
  const items = reading.pending.items.map(describeRemoval);

  return {
    title: REMOVALS_TITLE,
    count: items.length,
    intro:
      items.length === 0
        ? 'Every client you have removed is confirmed gone from your Google Drive backup as well as '
          + 'from this device.'
        : `${removalCount(items.length)} you made are done on this device, and this app has not yet `
          + 'confirmed they are gone from your Google Drive backup.',
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
    // the one the coach meets first. `describeRemovals` above already agrees its own verb.
    intro:
      `${removalCount(report.count)} ${report.count === 1 ? 'is' : 'are'} done on this device and `
      + 'not yet confirmed gone from your backup.',
    linkLabel: 'See which removals',
    settled: false,
  };
}
