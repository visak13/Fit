/**
 * WHERE THE PENDING-REMOVAL SEAM'S FACTS COME FROM — the source `Removals.tsx` said a later step
 * would supply.
 *
 * `shell/Removals.tsx` wrote down exactly what this had to be, and it is worth repeating rather than
 * paraphrasing, because the temptation at this point is to improve it:
 *
 *   1. open the local store and call `pendingDeletions(store, { limit, after })`;
 *   2. push the result in as `pending`, UNCHANGED, manifests and cursor intact;
 *   3. re-read it after every synchronisation pass.
 *
 * The first two are done here. **The third cannot be done yet and is reported rather than faked**:
 * `verifyAndMarkPropagated` is what moves a manifest out of pending and it only runs during a
 * synchronisation pass, and this build has no synchronisation — the report-to-surface wire is S16's.
 * So this reads once per store, and there is deliberately no interval, no polling and no invented
 * refresh, because a re-read on a timer would be a second mechanism to unpick when the real trigger
 * arrives.
 *
 * ## NOTHING IS CONVERTED
 *
 * The page goes in as the core paged it: items, cursor and `done`. `screens/removals.ts` is where a
 * manifest becomes words, and it takes the manifest whole. A shape adjusted here — a flattened list,
 * a dropped cursor, a count instead of a page — would be a second model of the same fact, and the
 * screen's `more` sentence is derived from `done`, so dropping it would silently turn "there are more
 * than these" into a claim that this is all of them.
 */

import { pendingDeletions } from '../../core/store/purge.js';
import type { LocalStore } from '../../core/store/store.js';
import type { RemovalsPage } from '../screens/removals';

/**
 * How many manifests are read in one page.
 *
 * The core's own default, named here rather than left implicit, because the screen tells the coach
 * "there are more than these" off the back of it and a silent change to the number changes what he
 * is told. Almost every visit reads nought of them; a restored backup is the case that can produce
 * many at once, and that is exactly why the call is paged rather than whole.
 */
export const REMOVALS_PAGE_LIMIT = 25;

/**
 * Read the first page of removals not yet confirmed gone, and publish it.
 *
 * Extracted from the component for the same reason `beginOpening` was: a static render never runs an
 * effect, so a read living inside one is a read the interface suite cannot check. Here it can be
 * driven against a REAL store holding a REAL unconfirmed removal.
 *
 * A failure is reported to the console and nothing is published. That is deliberate: the seam's
 * empty reading says "nothing is waiting", and publishing it after a failed read would turn a
 * failure into the reassuring answer, which is the one thing this surface exists to prevent. The
 * surfaces guard on the store's own state instead — see `platform/LocalStore.tsx`.
 *
 * @returns cancel, so a page arriving after the caller has gone is dropped rather than set
 */
export function readPendingRemovals(
  store: LocalStore,
  publish: (page: RemovalsPage) => void,
): () => void {
  let live = true;

  void pendingDeletions(store, { limit: REMOVALS_PAGE_LIMIT }).then(
    (page: RemovalsPage) => {
      if (live) publish(page);
    },
    (error: unknown) => {
      console.error('[removals] the pending removals could not be read from the local store', error);
    },
  );

  return () => {
    live = false;
  };
}
