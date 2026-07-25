/**
 * CROSS-CONTEXT COORDINATION — two windows on one laptop, sharing one database.
 *
 * This is a real requirement and not a theoretical one. The coach may have two windows open, each
 * running a live session with a different routine, against the same local database. Two things have
 * to hold, and they are different things:
 *
 *  1. **Per-session isolation.** Exactly one window may run a given session. The other window is
 *     told plainly that the session is already open here, rather than quietly appending to it.
 *  2. **No corruption.** Neither window may overwrite what the other wrote. That guarantee lives in
 *     `db.js` and `local-store.js`, not here: every mutation reads and writes inside ONE
 *     transaction, the platform serialises overlapping read-write transactions, and a revision that
 *     moved under us surfaces as a conflict. Locking makes the two windows *deliberate*; the
 *     transaction is what makes them *safe*. A lock alone would leave the store trusting that every
 *     writer remembered to take it.
 *
 * ## The lease is held by an unresolved promise, not released by a call
 *
 * That is the platform's own model, and it is the better one: a window that crashes, is closed, or
 * is discarded by the operating system releases its lock automatically, because the promise dies
 * with the page. A lease stored in a table would outlive the window holding it and lock the coach
 * out of his own session — with no way to clear it except knowing to clear it.
 *
 * ## Without locking
 *
 * Where the platform offers no lock manager, leases degrade to being local to this window only, and
 * say so: `lease.crossContext === false`. Nothing pretends. The `concurrentSessions` capability is
 * withheld in that case, so the interface never invites the coach into the unprotected situation in
 * the first place.
 */

import { StoreLeaseError } from './errors.js';

/** The channel every context of one installation talks on. */
export const CHANGE_CHANNEL = 'fit:store-changes';

/**
 * @typedef {Object} SessionLease
 * @property {string} sessionId
 * @property {string} device
 * @property {boolean} crossContext True when the lease is held against other windows too.
 * @property {boolean} active
 * @property {() => Promise<void>} release
 */

/**
 * @typedef {Object} Change
 * @property {'put'|'delete'|'purge'} kind
 * @property {string} [type]
 * @property {string} [record_id]
 * @property {number} [rev]
 * @property {string} device
 * @property {string} [subject_client_id]
 * @property {string[]} [record_ids]
 */

/**
 * @param {{platform: import('./platform.js').Platform, device: string, dbName: string, channelName?: string}} args
 */
export function createCoordinator({ platform, device, dbName, channelName = CHANGE_CHANNEL }) {
  const channel = platform.broadcast ? platform.broadcast(`${channelName}:${dbName}`) : null;
  /** @type {Set<(change: Change) => void>} */
  const listeners = new Set();
  /** @type {Map<string, SessionLease>} */
  const leases = new Map();
  let closed = false;

  if (channel) {
    channel.addEventListener('message', (event) => {
      const change = /** @type {Change} */ (event.data);
      for (const listener of listeners) {
        try { listener(change); } catch { /* a listener's failure is not the store's */ }
      }
    });
  }

  /** @param {string} sessionId */
  const lockName = (sessionId) => `fit/${dbName}/session/${sessionId}`;

  return {
    device,

    /** True when other windows are told about changes. */
    get notifies() { return Boolean(channel); },

    /** True when leases hold against other windows rather than only this one. */
    get coordinates() { return Boolean(platform.locks); },

    /**
     * Take the lease on a session, or find out that another window has it.
     *
     * Returns `null` rather than waiting: the coach needs to be told "that session is open in your
     * other window", not left looking at a spinner until the other window finishes.
     *
     * @param {string} sessionId
     * @returns {Promise<SessionLease|null>}
     */
    async acquireSessionLease(sessionId) {
      if (closed) throw new StoreLeaseError('This store is closed and can hold no session.');
      if (leases.has(sessionId)) return leases.get(sessionId);

      /** @type {() => void} */
      let releaseHold;
      const held = new Promise((resolve) => { releaseHold = resolve; });

      /** @type {SessionLease} */
      const lease = {
        sessionId,
        device,
        crossContext: Boolean(platform.locks),
        active: true,
        async release() {
          if (!lease.active) return;
          lease.active = false;
          leases.delete(sessionId);
          releaseHold();
          await held;
        },
      };

      if (!platform.locks) {
        // No lock manager: the lease is local to this window and says so.
        leases.set(sessionId, lease);
        return lease;
      }

      return new Promise((resolve, reject) => {
        platform.locks.request(
          lockName(sessionId),
          { mode: 'exclusive', ifAvailable: true },
          (lock) => {
            if (!lock) {
              resolve(null);
              return Promise.resolve();
            }
            leases.set(sessionId, lease);
            resolve(lease);
            // Holding the lock for exactly as long as the lease lives.
            return held;
          },
        ).catch(reject);
      });
    },

    /**
     * The lease this context holds on a session, if any.
     * @param {string} sessionId
     * @returns {SessionLease|undefined}
     */
    leaseFor(sessionId) { return leases.get(sessionId); },

    /** Sessions this context is running. @returns {string[]} */
    heldSessions() { return Array.from(leases.keys()); },

    /**
     * Tell the other windows something changed.
     *
     * Called only AFTER a commit. Announcing an uncommitted write would be an acknowledgement by
     * another route, and the other window would act on data that may still vanish.
     *
     * @param {Change} change
     */
    announce(change) {
      if (!channel || closed) return;
      try { channel.postMessage(change); } catch { /* a closed channel is not a failed write */ }
    },

    /**
     * Listen for changes made by other windows.
     * @param {(change: Change) => void} listener
     * @returns {() => void} unsubscribe
     */
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async close() {
      if (closed) return;
      closed = true;
      for (const lease of Array.from(leases.values())) await lease.release();
      listeners.clear();
      if (channel) channel.close();
    },
  };
}

/**
 * Refuse a session-scoped write with no lease on that session.
 *
 * @param {ReturnType<typeof createCoordinator>} coordinator
 * @param {SessionLease|null|undefined} lease
 * @param {string} sessionId
 */
export function assertLease(coordinator, lease, sessionId) {
  if (!lease || !lease.active) {
    throw new StoreLeaseError(
      'That session is not open in this window, so nothing can be recorded against it here.',
      { session_id: sessionId },
    );
  }
  if (lease.sessionId !== sessionId) {
    throw new StoreLeaseError(
      'This window holds a different session. A reading belongs to the session it was taken in.',
      { held: lease.sessionId, attempted: sessionId },
    );
  }
  if (coordinator.leaseFor(sessionId) !== lease) {
    throw new StoreLeaseError(
      'That session lease was not issued by this store, or has since been released.',
      { session_id: sessionId },
    );
  }
}
