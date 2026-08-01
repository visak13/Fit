/**
 * THE PENDING-REMOVAL SEAM — where the removals screen gets its manifests, and the one field that is
 * deliberately not on it.
 *
 * ## The seam `Divergences.tsx` said would be copied, copied a third time
 *
 * Same four properties, deliberately and not by coincidence:
 *
 * - The reading is a PLAIN VALUE, not a hook that fetches. A screen cannot start work of its own.
 * - Its fields are the core's own, field for field and name for name. `pending` holds the PAGE
 *   `pendingDeletions` (`core/store/purge.js`) returned — items, cursor and `done` intact — and each
 *   item is a `DeletionManifest` unconverted.
 * - The provider is REQUIRED. `useRemovals` throws outside it rather than defaulting, because the state
 *   a default would invent — "every removal is confirmed gone" — is precisely the false belief this
 *   surface exists to correct.
 * - What the screen may do with the reading is decided by what the reading contains, and it contains
 *   facts only.
 *
 * ## THE REMOTE HALF LANDED HERE, EXACTLY WHERE THIS FILE SAID IT WOULD
 *
 * This section used to say `still_present` was deliberately absent and belonged to S16. S16 is done and
 * it went where this file specified: **a field on this reading and a section in `removals.ts`**, not a
 * second screen and not a second wire. `remote` is a {@link RemoteConfirmation} carrying
 * `SyncReport.deletions.still_present` field for field — record identities only, no name, no note, and
 * nothing the provider authored.
 *
 * So the reading now carries BOTH halves of one question. The local half — the pending manifest, read
 * straight from this device's own store — says truthfully that a removal has not been CONFIRMED gone,
 * and is honest on day one with nothing from Google. The remote half can only ever STRENGTHEN what is
 * said about a removal the report NAMES: `core/sync/engine.js` skips the verify step entirely on most
 * passes, so an empty `still_present` means "nothing was checked" at least as often as it means
 * "nothing was found", and `removals.ts` is forbidden from turning either into good news.
 *
 * ## WHAT FILLS `remote`, AND THE ONE LINE THAT IS NOT HERE YET
 *
 * `remoteConfirmationFrom(report)` in `removals-source.ts` is the derivation, and it takes a LIVE
 * `SyncReport`. Nothing in this build runs `syncNow` yet — the synchronisation runner is the
 * sync-to-accountability join — so `main.tsx` supplies {@link NO_PASS_HAS_REPORTED}, which is not a
 * placeholder but the true state of a build in this condition: no pass has reported, therefore nothing
 * is confirmed present. **The join must pass each pass's report through that derivation into
 * `RemovalsFromStore`'s `remote` prop.** That handoff is recorded on the plan rather than left to this
 * comment; see `RemovalsFromStore.tsx`.
 *
 * There is also no retry and no "give up on this one". `markDeletionFailed` in `core/store/purge.js`
 * exists, is correct, and has NO PRODUCTION CALLER — which is a real gap and is reported as one, not
 * quietly filled from a screen. Marking a removal failed is a judgement about a delivery, made where
 * the delivery happens, not from the surface that reports it.
 *
 * ## What the later step supplies, precisely
 *
 * It replaces the SOURCE, not this file and not the screen. It must:
 *
 *   1. open the local store and call `pendingDeletions(store, { limit, after })`;
 *   2. push the result in as `pending`, UNCHANGED, manifests and cursor intact;
 *   3. re-read it after every synchronisation pass, because `verifyAndMarkPropagated` is what moves a
 *      manifest out of pending and it only runs during one. A removal confirmed during a pass that
 *      stayed on this screen afterwards would keep telling him something untrue in the safe direction.
 */

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import { NO_PASS_HAS_REPORTED } from '../screens/removals';
import type { RemoteConfirmation, RemovalsPage, RemovalsReadStage } from '../screens/removals';
import type { ReadFailure } from '../screens/read-failure';

export type {
  DeletionManifest, RemoteConfirmation, RemovalsPage, RemovalsReadStage, StillPresentEntry,
} from '../screens/removals';
export { NO_PASS_HAS_REPORTED } from '../screens/removals';

/** The facts a read of this surface produces, in the core's own fields. */
export interface RemovalsFacts {
  /**
   * The removals not yet confirmed gone from the backup, as the core paged them.
   *
   * The LOCAL half, read from this device's own store. Honest with nothing from Google.
   */
  readonly pending: RemovalsPage;
  /**
   * The REMOTE half: what the last synchronisation pass READ BACK and still found.
   *
   * `NO_PASS_HAS_REPORTED` until a pass has reported one. It carries `reported` as well as the list
   * precisely so that "no pass has run" can never be mistaken for "a pass found nothing".
   */
  readonly remote: RemoteConfirmation;
}

/** The read has not happened yet: what a store nothing has been read from genuinely yields. */
export interface RemovalsNotYetRead extends RemovalsFacts {
  readonly status: 'not_yet';
}

/** The read happened, and these are its facts. */
export interface RemovalsWasRead extends RemovalsFacts {
  readonly status: 'read';
}

/**
 * The read was attempted and did not come back.
 *
 * IT CARRIES NO PAGE, and that is the protection rather than an omission: there is nothing to draw,
 * and a shape that offered an empty page here is the shape that let a failed read be worded as a
 * confirmed deletion.
 */
export interface RemovalsReadFailed {
  readonly status: 'failed';
  readonly failure: ReadFailure<RemovalsReadStage>;
}

/**
 * Everything the seam carries — THREE mutually exclusive states, not one.
 *
 * ## WHY, AND IT IS THE SHARPEST INSTANCE OF THIS DEFECT IN THE APPLICATION
 *
 * `removals-source.ts` used to catch a rejected read, log it to the console and PUBLISH NOTHING. The
 * seam therefore stayed at {@link NOTHING_AWAITING_REMOVAL} — and that literal is not drawn as a
 * blank, it is worded by `screens/removals.ts` as *"Every client you have removed is confirmed gone
 * from your Google Drive backup as well as from this device"*.
 *
 * THAT IS NOT A DEGRADED SCREEN. It is this application VOUCHING FOR A DELETION IT NEVER VERIFIED —
 * a positive claim about a REMOTE system, published by a read that looked at nothing, on the one
 * surface built so the coach can trust that a departed client's data is gone. The old comment beside
 * the catch called publishing-nothing deliberate, and it was reasoned rather than measured: it is
 * true that publishing the empty page would be worse, and false that publishing nothing avoids it,
 * because the empty page WAS ALREADY THERE.
 *
 * The discriminant is what makes the compiler refuse to let a caller reach `pending` without first
 * saying which of the three it is looking at. A flag beside the page would not have.
 */
export type RemovalsReading = RemovalsNotYetRead | RemovalsWasRead | RemovalsReadFailed;

/**
 * What is true in this build: no local store is wired, so no client has ever been removed on this
 * device, so nothing can be waiting to be confirmed. It is not a placeholder standing in for a real
 * value — it is exactly what `pendingDeletions` returns over a store in that condition.
 *
 * Its `remote` is `NO_PASS_HAS_REPORTED` for the same kind of reason and not as a default: nothing
 * has run a synchronisation pass, so nothing has been read back, so nothing is confirmed present.
 */
export const NOTHING_AWAITING_REMOVAL: RemovalsNotYetRead = Object.freeze({
  status: 'not_yet',
  pending: Object.freeze({
    items: Object.freeze([]) as RemovalsPage['items'],
    cursor: null,
    done: true,
  }),
  remote: NO_PASS_HAS_REPORTED,
});

const RemovalsContext = createContext<RemovalsReading | null>(null);

export function RemovalsProvider({
  reading,
  children,
}: {
  reading: RemovalsReading;
  children: ReactNode;
}) {
  return <RemovalsContext.Provider value={reading}>{children}</RemovalsContext.Provider>;
}

/**
 * The current reading.
 *
 * @throws Error when used outside the provider. A missing seam must be loud: silently rendering
 * "nothing is waiting" would be an unwired screen reporting the one state that looks like good news —
 * and here that state is the exact false belief the core wrote this machinery to prevent.
 */
export function useRemovals(): RemovalsReading {
  const reading = useContext(RemovalsContext);
  if (reading === null) {
    throw new Error('useRemovals was used outside RemovalsProvider: the pending-removal seam is not wired');
  }
  return reading;
}
