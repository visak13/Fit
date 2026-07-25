/**
 * SWITCHABLE ADVERSITY — the failures the double can be told to produce on demand.
 *
 * ## Why this exists at all
 *
 * The outbox and the sync engine are built to survive failure, and a component built to
 * survive failure that has only ever been driven through success has not been tested. It has
 * been demonstrated. The difference shows up in production.
 *
 * Three failures matter to this application, and they are three because each one demands a
 * DIFFERENT response from the code above:
 *
 *  1. **A failing call** — the service is unreachable or refuses transiently. Response: leave
 *     the work in the outbox and try again later. Nothing needs the user.
 *  2. **An expired credential** — the call cannot succeed until the user re-authorises, and
 *     re-authorising needs a real user gesture, so no amount of retrying in the background
 *     will help. Response: keep the work safe, and ask the user to tap. This is the normal
 *     state on a cold start, not an exceptional one.
 *  3. **A slow call** — the call exceeds its deadline and the outcome is UNKNOWN. Response:
 *     the most careful of the three, because a write that timed out may well have landed.
 *
 * Collapsing those into one "it failed" is how an application ends up retrying forever
 * against a dead credential, showing a spinner that can never resolve.
 *
 * ## Order of resolution
 *
 * When more than one adversity is armed, they resolve in the order the real world would
 * produce them, and the order is fixed so tests are deterministic:
 *
 *   1. **Latency versus the deadline.** The request goes out and time passes. If the deadline
 *      expires first, {@link RemoteTimeout} wins and NOTHING else is learned — a caller that
 *      timed out never finds out whether the credential was also stale, because no response
 *      ever arrived. A timeout consumes no queued failure, for the same reason.
 *   2. **The credential.** A stale credential is rejected before the request is considered.
 *      It does NOT consume a queued failure — the call never got far enough to fail that way.
 *   3. **A queued failure.** The service was reached and refused.
 *
 * Latency is applied whether or not the call ultimately succeeds, because a slow failure is
 * as real as a slow success.
 */

import { RemoteCredentialExpired, RemoteTimeout, RemoteUnavailable, RemoteInvalidRequest } from './port.js';

/**
 * A switchboard of deliberate failures, owned by a double and driven by a test.
 *
 * It holds no storage and knows nothing about files: its single responsibility is deciding
 * whether the next call is allowed to proceed, and how long it takes to find out.
 */
export class Adversity {
  constructor() {
    /** @type {boolean} */
    this._credentialExpired = false;
    /** @type {number} */
    this._latencyMs = 0;
    /** @type {Array<{remaining: number, operation: string|null, makeError: () => Error}>} */
    this._queued = [];
  }

  // ── the expired credential ───────────────────────────────────────────────────

  /**
   * From now on, every call fails with {@link RemoteCredentialExpired} until the credential is
   * renewed. Models the ordinary end of a short-lived, foreground-only credential.
   * @returns {this}
   */
  expireCredential() {
    this._credentialExpired = true;
    return this;
  }

  /** The user re-authorised. Calls may proceed again. @returns {this} */
  renewCredential() {
    this._credentialExpired = false;
    return this;
  }

  /** @returns {boolean} */
  get credentialExpired() {
    return this._credentialExpired;
  }

  // ── the failing call ─────────────────────────────────────────────────────────

  /**
   * Arm the next `count` calls to fail.
   *
   * Counted rather than permanent so a test can prove the interesting case: that the work
   * SURVIVES the failure and lands on a later attempt. A permanently broken service only ever
   * proves that nothing crashed.
   *
   * @param {number} [count] How many calls fail. Must be a positive whole number.
   * @param {{operation?: string, error?: () => Error}} [opts]
   *   `operation` narrows the failure to one operation by name, so a test can break exactly
   *   the write while leaving the read that verifies it working. `error` supplies a different
   *   failure to raise.
   * @returns {this}
   */
  failNext(count = 1, opts = {}) {
    if (!Number.isInteger(count) || count < 1) {
      throw new RemoteInvalidRequest('failNext needs a positive whole number of calls to fail.');
    }
    this._queued.push({
      remaining: count,
      operation: opts.operation ?? null,
      makeError: opts.error ?? (() => new RemoteUnavailable()),
    });
    return this;
  }

  /** How many armed failures are still waiting to fire. @returns {number} */
  get pendingFailures() {
    return this._queued.reduce((total, entry) => total + entry.remaining, 0);
  }

  // ── the slow call ────────────────────────────────────────────────────────────

  /**
   * Every call from now on takes `ms` to come back. Set it above a caller's deadline to
   * produce a timeout; set it below to prove the caller waits properly rather than giving up
   * on anything that is not instant.
   * @param {number} ms
   * @returns {this}
   */
  setLatency(ms) {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
      throw new RemoteInvalidRequest('Latency must be a non-negative, finite number of milliseconds.');
    }
    this._latencyMs = ms;
    return this;
  }

  /** @returns {number} */
  get latencyMs() {
    return this._latencyMs;
  }

  // ── back to a calm service ───────────────────────────────────────────────────

  /** Disarm everything: credential renewed, queue emptied, latency zeroed. @returns {this} */
  clear() {
    this._credentialExpired = false;
    this._latencyMs = 0;
    this._queued = [];
    return this;
  }

  // ── what the double calls ────────────────────────────────────────────────────

  /**
   * Let the clock run, then decide whether this call proceeds.
   *
   * Called by the double before every operation. Returns normally when the call may go ahead,
   * and throws the appropriate typed error when it may not.
   *
   * @param {string} operation One of the port's operation names.
   * @param {{timeoutMs: number, clock: import('./clock.js').Clock}} ctx
   * @returns {Promise<void>}
   */
  async apply(operation, { timeoutMs, clock }) {
    // 1. Time passes first, because in reality it does.
    if (this._latencyMs > timeoutMs) {
      // The deadline expires while the request is still in flight. We wait out the deadline
      // and then give up: the response never arrives, so nothing further is ever learned.
      await clock.sleep(timeoutMs);
      throw new RemoteTimeout(operation, timeoutMs);
    }
    if (this._latencyMs > 0) await clock.sleep(this._latencyMs);

    // 2. A stale credential is refused before the request is considered.
    if (this._credentialExpired) throw new RemoteCredentialExpired();

    // 3. The service was reached, and refused.
    const entry = this._queued.find((e) => e.remaining > 0 && (e.operation === null || e.operation === operation));
    if (entry) {
      entry.remaining -= 1;
      if (entry.remaining === 0) this._queued = this._queued.filter((e) => e !== entry);
      throw entry.makeError();
    }
  }
}
