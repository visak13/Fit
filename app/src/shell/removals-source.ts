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
import { NO_PASS_HAS_REPORTED } from '../screens/removals';
import type { RemoteConfirmation, RemovalsPage, StillPresentEntry } from '../screens/removals';

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

/**
 * THE REMOTE HALF'S DERIVATION — a synchronisation report becomes the seam's `remote`, and nothing
 * else about a report is allowed through this function.
 *
 * ## Why it is a function here rather than a spread at the call site
 *
 * `SyncReport` is a large object. It carries the flush, the outbox figures, every failure with the
 * service's own `message` on it, and the completion brand. **A spread of `report.deletions` into a
 * seam would carry whatever a later field turns out to be**, and the field most likely to be added
 * next to a failure report is the provider's own text — measured on this very step: a provider error
 * message is a privacy leak path precisely because a failure is what gets written down, and a status
 * surface is where text stops being transient. So this reads THREE DECLARED FIELDS by name —
 * `deletion_id`, `found`, and nothing else — and constructs the value itself.
 *
 * ## `reported` is TRUE for any report at all, and that is deliberate
 *
 * It says a pass reported, NOT that a pass verified. `core/sync/engine.js` runs the verify-deletions
 * step only when deletions were carried AND a compaction ran; every other pass reports
 * `still_present: []` having checked nothing. `screens/removals.ts` therefore never turns an empty
 * list into reassurance, and this function must not make that easier by pretending the flag means
 * more than it does.
 *
 * ## THE CALLER THIS IS WAITING FOR
 *
 * The synchronisation runner — the sync-to-accountability join — must pass each pass's LIVE report
 * through here and into `RemovalsFromStore`'s `remote` prop. Until it does, `main.tsx` supplies
 * `NO_PASS_HAS_REPORTED`, which is TRUE of a build with no synchronisation rather than a stand-in.
 *
 * @param report the object `syncNow` returned. Read by declared field only; never stored.
 */
export function remoteConfirmationFrom(report: unknown): RemoteConfirmation {
  const deletions = (report as { deletions?: { still_present?: unknown } } | null)?.deletions;
  const raw = deletions?.still_present;
  if (!Array.isArray(raw)) {
    // A report without the field is not a report saying everything is clear. `reported` still turns
    // true — a pass DID run — and the list stays empty, which says nothing either way, as it must.
    return Object.freeze({ reported: report !== null && report !== undefined, still_present: [] });
  }

  const stillPresent: StillPresentEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry.deletion_id !== 'string') continue;
    stillPresent.push(Object.freeze({
      deletion_id: entry.deletion_id,
      found: Object.freeze(
        (Array.isArray(entry.found) ? entry.found : []).filter(
          (id: unknown): id is string => typeof id === 'string',
        ),
      ),
    }));
  }

  return Object.freeze({ reported: true, still_present: Object.freeze(stillPresent) });
}

/** Re-exported so a caller filling the seam does not have to know two modules to say "nothing yet". */
export { NO_PASS_HAS_REPORTED };
