/**
 * FAILURES ARE NOT ALIKE, AND COLLAPSING THEM IS THE DEFECT.
 *
 * Three failures, three different right answers, and the wrong pairings are all bad in their own way:
 *
 * | Failure | Right answer | What collapsing it produces |
 * |---|---|---|
 * | The service was unreachable | Keep the work, retry with a growing delay | Treated as a rejection: the coach is told his backup was refused when the wifi merely dropped |
 * | The credential expired | Keep the work, wait for the next opportunity | Treated as transient: an infinite retry loop against a credential that cannot renew itself without a user gesture, burning attempts and pushing out everything behind it |
 * | The remote refused it | STOP, and make it visible | Treated as transient: retried forever in silence, which is exactly the state this queue exists to prevent |
 *
 * ## The classification is read off the port's contract, not off message text
 *
 * Every failure the port raises carries `retryable` and `needsReauth`, declared for this purpose.
 * Matching on a message would break the first time a message is reworded, and would break silently —
 * an unrecognised failure would fall into whichever branch the code happened to end on.
 *
 * A `RemoteTimeout` is deliberately its own class. It is retryable, but its outcome is UNKNOWN: the
 * write may well have landed. So it is retried like a transient failure and its replay must run the
 * recognition step first, which is what stops the retry from duplicating the record.
 */

import { RemoteError, RemoteTimeout } from '../remote/remote.js';

/**
 * What kind of failure this was.
 *
 * - `transient`       — retry the same call later, unchanged. Nothing needs the user.
 * - `credential`      — nothing can succeed until the user re-authorises. Do not burn attempts.
 * - `rejected`        — the remote refused it. Retrying produces the same refusal. Stop, and show it.
 * - `unknown_outcome` — the deadline passed with no answer. It may have landed. Retry, recognising.
 * - `local`           — the failure was on this side (a database write, a bug). Retry; never silent.
 */
export const FAILURE = Object.freeze({
  TRANSIENT: 'transient',
  CREDENTIAL: 'credential',
  REJECTED: 'rejected',
  UNKNOWN_OUTCOME: 'unknown_outcome',
  LOCAL: 'local',
});

/** @type {readonly string[]} */
export const FAILURE_VALUES = Object.freeze(Object.values(FAILURE));

/** The first retry waits this long. */
export const BACKOFF_BASE_MS = 5_000;

/**
 * And no retry ever waits longer than this.
 *
 * Half an hour, not longer: the coach may be mid-session on a phone that keeps dropping, and a delay
 * measured in hours would read to him as the queue having given up. The persistent warning the
 * accountability surface shows is what covers a genuinely long outage, not a longer sleep.
 */
export const BACKOFF_CAP_MS = 30 * 60_000;

/**
 * Classify one failure.
 *
 * @param {unknown} error
 * @returns {string} One of {@link FAILURE_VALUES}.
 */
export function classifyFailure(error) {
  if (error instanceof RemoteTimeout) return FAILURE.UNKNOWN_OUTCOME;
  if (error instanceof RemoteError) {
    if (error.needsReauth) return FAILURE.CREDENTIAL;
    return error.retryable ? FAILURE.TRANSIENT : FAILURE.REJECTED;
  }
  // Not from the port at all — our own database, or a defect. It is not a rejection by the remote,
  // so it must not be presented as one, and it must not be swallowed either.
  return FAILURE.LOCAL;
}

/**
 * Does this classification stop the entry for good?
 * @param {string} classification
 * @returns {boolean}
 */
export function stopsForGood(classification) {
  return classification === FAILURE.REJECTED;
}

/**
 * The delay before the next attempt, growing with the number of attempts already made.
 *
 * Doubling, capped. Deterministic by default — no jitter — because a queue with one client has
 * nobody to collide with, and a deterministic delay is one a test can assert and an evidence line
 * can quote. A caller that wants spread may inject one.
 *
 * @param {number} attempts How many attempts have already reached a verdict. 1 after the first.
 * @param {{cap?: number, base?: number, jitter?: (ms: number) => number}} [options]
 * @returns {number} Milliseconds.
 */
export function backoffMs(attempts, options = {}) {
  const { cap = BACKOFF_CAP_MS, base = BACKOFF_BASE_MS, jitter } = options;
  const n = Math.max(1, Number.isFinite(attempts) ? Math.floor(attempts) : 1);
  const raw = base * 2 ** (n - 1);
  const capped = Math.min(cap, raw);
  return jitter ? Math.max(0, Math.floor(jitter(capped))) : capped;
}

/**
 * A stored description of a failure. No stack, no object graph — this is written to the database and
 * read back by a screen, so it holds the two things a screen needs and the code it can branch on.
 *
 * @param {unknown} error
 * @param {string} at A canonical timestamp.
 * @returns {{code: string, message: string, classification: string, at: string}}
 */
export function describeFailure(error, at) {
  const e = /** @type {any} */ (error);
  return {
    code: typeof e?.code === 'string' ? e.code : (e?.name || 'error'),
    message: typeof e?.message === 'string' ? e.message : String(error),
    classification: classifyFailure(error),
    at,
  };
}
