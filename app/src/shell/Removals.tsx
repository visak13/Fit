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
 * ## WHAT IS DELIBERATELY ABSENT, AND WHOSE IT IS
 *
 * There is NO `still_present` on this reading, and that is a scope boundary rather than an omission.
 * `core/sync/deletions.js` computes exactly which record identities are still sitting in the remote
 * copy, and carries them out as `SyncReport.deletions.still_present` — the remote half. Reaching a
 * screen with it needs the report-to-surface wire that **S16** is building, and there is no second wire
 * to be invented here.
 *
 * So this reading carries the LOCAL half only: the pending manifest, read straight from this device's
 * own store, which says truthfully that a removal has not been CONFIRMED gone. That statement is honest
 * on day one and needs nothing from Google. When S16 lands, it adds the remote detail to this same
 * surface — a field here and a section in `removals.ts` — and does not build a second screen for the
 * other half of one question.
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

import type { RemovalsPage } from '../screens/removals';

export type { DeletionManifest, RemovalsPage } from '../screens/removals';

export interface RemovalsReading {
  /**
   * The removals not yet confirmed gone from the backup, as the core paged them.
   *
   * There is no second field. See the note above: the absence is the scope boundary.
   */
  readonly pending: RemovalsPage;
}

/**
 * What is true in this build: no local store is wired, so no client has ever been removed on this
 * device, so nothing can be waiting to be confirmed. It is not a placeholder standing in for a real
 * value — it is exactly what `pendingDeletions` returns over a store in that condition.
 */
export const NOTHING_AWAITING_REMOVAL: RemovalsReading = Object.freeze({
  pending: Object.freeze({
    items: Object.freeze([]) as RemovalsPage['items'],
    cursor: null,
    done: true,
  }),
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
