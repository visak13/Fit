/**
 * THE NUMBERS THE ACCOUNTABILITY SURFACE IS BUILT ON.
 *
 * The standard, in the user's own words: the app is supposed to take accountability for the data, a
 * real professional will use it and his pay depends on it, and if a synchronisation does not happen the
 * app must highlight that. So a persistent indicator shows the pending count and the last synchronised
 * time at all times, and escalates visibly when data has been unsynced beyond a threshold.
 *
 * This module supplies the figures and NOT the policy. It does not know the escalation threshold, does
 * not choose a colour, and does not decide what is alarming — the surface above owns all of that. What
 * it guarantees is that the figures are honest and cheap:
 *
 *  - **Cheap.** Each count is an index range count, and the oldest entry is one step of a cursor. The
 *    queue's length may be large after a fortnight offline, and a status line that read the whole
 *    queue would be a status line that stops being shown.
 *  - **Honest about the stopped ones.** `pending` alone would be a lie by omission: a rejected or
 *    ambiguous entry is data that is NOT in the backup and never will be without a person, so it is
 *    counted in `undelivered` and reported separately in `needs_attention`. An entry that stopped
 *    silently is indistinguishable from one that succeeded, which is the failure this whole queue
 *    exists to prevent.
 *  - **Honest about a dead credential.** `waiting_for_credential` is separated out because it is the
 *    one number with an action attached: a tap. It is not a fault, and presenting it as one teaches the
 *    coach to ignore the indicator.
 */

import { timestamp } from '../model/model.js';
import { HOLD, STATUS, ageMs } from './entry.js';
import { countByStatus, entriesByStatus, oldestInStatus } from './queue.js';
import { prefixRange } from '../store/keys.js';
import { OUTBOX_STORE } from '../store/schema.js';

/**
 * @typedef {Object} OutboxStatus
 * @property {number} pending            Queued, not yet delivered, still being attempted.
 * @property {number} waiting_for_credential Pending entries held because the credential expired. A
 *                                       subset of `pending`, not an addition to it.
 * @property {number} rejected           Stopped: the remote refused them.
 * @property {number} ambiguous          Stopped: it cannot be told whether they landed.
 * @property {number} needs_attention    `rejected + ambiguous`. Nothing will move these but a person.
 * @property {number} undelivered        `pending + needs_attention` — everything not yet safely away.
 * @property {number} delivered          Landed, and not yet pruned.
 * @property {string|null} oldest_pending_at When the oldest pending entry was queued.
 * @property {number|null} oldest_pending_age_ms How long it has been waiting. Null when nothing is.
 * @property {string|null} oldest_pending_label Plain words for what it is, so the surface can say WHAT
 *                                       is unsynced rather than only how much.
 * @property {string} at                 The instant these figures describe.
 */

/**
 * The whole status, in one read pass.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {{now?: number|string|Date}} [options]
 * @returns {Promise<OutboxStatus>}
 */
export async function outboxStatus(store, options = {}) {
  const at = timestamp(options.now);

  const pending = await countByStatus(store, STATUS.PENDING);
  const rejected = await countByStatus(store, STATUS.REJECTED);
  const ambiguous = await countByStatus(store, STATUS.AMBIGUOUS);
  const delivered = await countByStatus(store, STATUS.DELIVERED);
  const waiting = await countCredentialHolds(store);
  const oldest = await oldestInStatus(store, STATUS.PENDING);

  return {
    pending,
    waiting_for_credential: waiting,
    rejected,
    ambiguous,
    needs_attention: rejected + ambiguous,
    undelivered: pending + rejected + ambiguous,
    delivered,
    oldest_pending_at: oldest ? oldest.enqueued_at : null,
    oldest_pending_age_ms: oldest ? ageMs(oldest, at) : null,
    oldest_pending_label: oldest ? oldest.label : null,
    at,
  };
}

/**
 * How many pending entries are waiting on the credential.
 *
 * Counted by walking the pending range and testing the hold, because the hold is not indexed — an
 * index exists for a query, and this walk is bounded by the pending entries, which is the same set the
 * caller is asking about. Adding an index maintained on every write to save a walk over the thing being
 * measured would be the wrong trade.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {{limit?: number}} [options]
 * @returns {Promise<number>}
 */
export async function countCredentialHolds(store, options = {}) {
  const { limit = 1000 } = options;
  const page = await store.read(OUTBOX_STORE, (scope) => scope.page({
    store: OUTBOX_STORE,
    index: 'by_status_seq',
    range: prefixRange(scope.KeyRange, [STATUS.PENDING]),
    limit,
    where: (entry) => entry.hold === HOLD.CREDENTIAL,
  }));
  return page.items.length;
}

/**
 * The entries a person has to look at, oldest first, as a page.
 *
 * Two calls rather than one merged list: the two need different words in front of the coach — one says
 * the remote refused it, the other says we cannot tell — and merging them would force the surface to
 * re-derive which is which.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {{limit?: number, after?: string|null}} [options]
 * @returns {Promise<{rejected: import('../store/db.js').Page, ambiguous: import('../store/db.js').Page}>}
 */
export async function needsAttention(store, options = {}) {
  return {
    rejected: await entriesByStatus(store, STATUS.REJECTED, options),
    ambiguous: await entriesByStatus(store, STATUS.AMBIGUOUS, options),
  };
}
