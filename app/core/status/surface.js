/**
 * THE ACCOUNTABILITY SURFACE — one object, everything the coach is owed, and no rendering at all.
 *
 * This is the state layer. It computes what the interface will show and it DRAWS NOTHING: there is no
 * document access anywhere in this package, no colour, no markup and no timer. The interface decides
 * how a `severely_overdue` level looks; this decides that it is one, and can be tested without a
 * browser because of it.
 *
 * ## What it always answers, at any moment
 *
 *  - when the last successful synchronisation was — and only if a real one produced it;
 *  - how many changes are waiting;
 *  - how long the oldest one has been waiting;
 *  - which rung of the escalation ladder that puts it on, plainly named;
 *  - and, when something is wrong, WHAT is wrong, specifically.
 *
 * Every one of those is present in every state this function can return. That is the whole design: a
 * caller cannot receive a partial answer, so a caller cannot render a spinner with nothing behind it.
 * `in_progress` sits beside the figures rather than in place of them, and a test asserts the figures
 * are fully populated while it is true.
 *
 * ## It cannot block the application, and that is a property of the data
 *
 * `blocks_application` is present on every result and is the frozen constant `false`. There is no
 * branch that sets it, no level that carries `blocks: true`, and no threshold past which this returns
 * something a screen could interpret as a gate. The maximum escalation is a persistent, unmissable
 * warning; the application always opens. A test drives a wide matrix of states — including a fortnight
 * offline with a dead credential and refused entries — and asserts the value never changes.
 *
 * ## Cost, because a status line that is expensive stops being shown
 *
 * Two reads: the outbox's own status pass, which is index range counts plus one cursor step, and one
 * meta row. Nothing here walks the queue and nothing here walks the record stores. An indicator that is
 * not always visible is not an accountability surface, and the surest way to make it invisible is to
 * make it cost something.
 */

import { timestamp } from '../model/model.js';
import { STATUS, ageMs, oldestInStatus, outboxStatus } from '../outbox/outbox.js';
import { completionAgeMs, lastSyncedAt, readLastCompletedSync } from './completion.js';
import { LEVELS, deriveLevel } from './levels.js';
import { deriveReasons } from './reasons.js';
import { PLATFORM_STATEMENT } from './statement.js';

/**
 * The one and only answer to "may this stop the coach working?".
 *
 * A frozen constant rather than a literal at each return site: one place to read, one place a future
 * change would have to be made, and it would have to be made in the open against a failing test.
 */
export const BLOCKS_APPLICATION = false;

/**
 * @typedef {Object} AccountabilityStatus
 * @property {string} at                          The instant these figures describe.
 * @property {string|null} last_synced_at         Only ever from a genuine completion. Null means never.
 * @property {number|null} last_synced_age_ms
 * @property {boolean} never_synchronised         Nothing at all is in the backup yet.
 * @property {number} pending                     Queued, still being attempted.
 * @property {number} waiting_for_credential      Held on a dead credential. A SUBSET of `pending`, and
 *                                                a queue-wide stop rather than that many small ones.
 * @property {number} rejected
 * @property {number} ambiguous
 * @property {number} needs_attention             Nothing will move these but a person.
 * @property {number} undelivered                 Everything not yet safely away.
 * @property {string|null} oldest_pending_at
 * @property {number|null} oldest_pending_age_ms
 * @property {string|null} oldest_pending_label   So the surface can say WHAT is waiting, not only how much.
 * @property {string|null} oldest_undelivered_at  The oldest thing NOT in the backup, still being
 *                                                attempted or stopped. What the ladder climbs on.
 * @property {number|null} oldest_undelivered_age_ms
 * @property {string|null} oldest_undelivered_label
 * @property {string} level                       One of `core/status/levels.js`.
 * @property {number} level_rank
 * @property {boolean} level_persistent           True only at the ceiling: show it on every screen.
 * @property {string} summary                     The rung in one sentence.
 * @property {boolean} blocks_application         Always false. See {@link BLOCKS_APPLICATION}.
 * @property {boolean} in_progress                A synchronisation is running RIGHT NOW. Never the only
 *                                                thing here: every field above is populated regardless.
 * @property {{code: string, message: string, action: string|null, queue_wide: boolean}|null} reason
 *                                                The worst applicable reason, for a one-line indicator.
 * @property {{code: string, message: string, action: string|null, queue_wide: boolean}[]} reasons
 *                                                All of them, worst first, for the panel behind it.
 * @property {boolean} nothing_can_be_sent        A queue-wide stop: not "some items are stuck".
 * @property {typeof PLATFORM_STATEMENT} statement What may honestly be said about backing up.
 */

/**
 * The oldest entry that is NOT in the backup, whether or not anything is still trying to send it.
 *
 * The queue's own figure covers the pending entries, which is the right measure for "how long has this
 * been waiting". It is the wrong measure for the escalation ladder: a refused entry is not waiting for
 * anything, so a queue holding nothing but a three-day-old refusal would report the freshest possible
 * age — none at all — while the coach has genuinely not backed that data up since Tuesday. The
 * escalation must follow the DATA, not the retry.
 *
 * Two extra cursor steps at most, and only when there is something stopped to look at. Nothing here
 * walks the queue.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {{rejected: number, ambiguous: number, oldest_pending_at: string|null,
 *          oldest_pending_age_ms: number|null, oldest_pending_label: string|null}} outbox
 * @param {string} at
 * @returns {Promise<{at: string|null, age_ms: number|null, label: string|null}>}
 */
async function oldestUndelivered(store, outbox, at) {
  let oldest = {
    at: outbox.oldest_pending_at, age_ms: outbox.oldest_pending_age_ms, label: outbox.oldest_pending_label,
  };

  const stopped = [
    ...(outbox.rejected > 0 ? [STATUS.REJECTED] : []),
    ...(outbox.ambiguous > 0 ? [STATUS.AMBIGUOUS] : []),
  ];
  for (const status of stopped) {
    // eslint-disable-next-line no-await-in-loop
    const entry = await oldestInStatus(store, status);
    if (!entry) continue;
    const age = ageMs(entry, at);
    if (oldest.age_ms === null || (age !== null && age > oldest.age_ms)) {
      oldest = { at: entry.enqueued_at, age_ms: age, label: entry.label };
    }
  }
  return oldest;
}

/**
 * The whole surface, in one pass.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {{now?: number|string|Date, in_progress?: boolean,
 *          last_attempt?: any,
 *          credential?: {present?: boolean, expired?: boolean}|null}} [options]
 *   `last_attempt` is the most recent synchronisation report, when there has been one this session. It
 *   is read for its FAILURES only — the reason a synchronisation did not happen — never for a
 *   completion, which comes from the persisted sealed value and from nowhere else.
 * @returns {Promise<Readonly<AccountabilityStatus>>}
 */
export async function accountabilityStatus(store, options = {}) {
  const at = timestamp(options.now);

  const outbox = await outboxStatus(store, { now: options.now });
  const { completion, unverifiable } = await readLastCompletedSync(store);

  const lastAt = lastSyncedAt(completion);
  const neverSynchronised = lastAt === null;

  const reasons = deriveReasons({
    never_synchronised: neverSynchronised,
    unverifiable_sync_claim: unverifiable,
    credential: options.credential || null,
    waiting_for_credential: outbox.waiting_for_credential,
    rejected: outbox.rejected,
    ambiguous: outbox.ambiguous,
    failures: options.last_attempt?.failures || [],
  });

  const oldest = await oldestUndelivered(store, outbox, at);

  const level = deriveLevel({
    undelivered: outbox.undelivered,
    needs_attention: outbox.needs_attention,
    oldest_undelivered_age_ms: oldest.age_ms,
    never_synchronised: neverSynchronised,
  });

  return Object.freeze({
    at,

    last_synced_at: lastAt,
    last_synced_age_ms: completionAgeMs(completion, at),
    never_synchronised: neverSynchronised,

    pending: outbox.pending,
    waiting_for_credential: outbox.waiting_for_credential,
    rejected: outbox.rejected,
    ambiguous: outbox.ambiguous,
    needs_attention: outbox.needs_attention,
    undelivered: outbox.undelivered,
    oldest_pending_at: outbox.oldest_pending_at,
    oldest_pending_age_ms: outbox.oldest_pending_age_ms,
    oldest_pending_label: outbox.oldest_pending_label,
    // Everything not in the backup, stopped entries included. This is what the ladder climbs on.
    oldest_undelivered_at: oldest.at,
    oldest_undelivered_age_ms: oldest.age_ms,
    oldest_undelivered_label: oldest.label,

    level,
    level_rank: LEVELS[level].rank,
    level_persistent: LEVELS[level].persistent,
    summary: LEVELS[level].summary,

    // Not derived, not conditional, not overridable. The ladder tops out at a persistent warning.
    blocks_application: BLOCKS_APPLICATION,

    // Beside the figures, never instead of them.
    in_progress: options.in_progress === true,

    reason: reasons[0] || null,
    reasons,
    // The distinction the outbox had to correct: a dead credential stops the QUEUE, not some entries.
    nothing_can_be_sent: reasons.some((r) => r.queue_wide) && outbox.undelivered > 0,

    statement: PLATFORM_STATEMENT,
  });
}
