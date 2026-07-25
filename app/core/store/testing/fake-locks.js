/**
 * IN-PROCESS DOUBLES for the two cross-context facilities: the lock manager and the message bus.
 *
 * Both are shaped exactly like the platform's own, including the parts that are easy to get wrong:
 *
 *  - a lock is held for as long as the callback's promise is unresolved, not until a release call;
 *  - `ifAvailable` calls back with `null` instead of waiting, which is how the second window learns
 *    a session is already being run rather than hanging until the first one finishes;
 *  - a broadcast channel does NOT deliver a message to the port that sent it, and delivery is
 *    asynchronous. A double that echoed to the sender would let a store pass its own change
 *    notification off as a peer's, and one that delivered synchronously would hide ordering bugs.
 */

/**
 * The lock manager double.
 * @implements {import('../platform.js').LockPort}
 */
export class FakeLockManager {
  constructor() {
    /** @type {Map<string, {mode: 'exclusive'|'shared', holders: number}>} */
    this._held = new Map();
    /** @type {Array<() => void>} */
    this._waiting = [];
    /** Every acquisition, for tests that assert on coordination rather than on its effect. */
    this.log = [];
  }

  /**
   * @param {string} name
   * @param {{mode?: 'exclusive'|'shared', ifAvailable?: boolean, signal?: AbortSignal}} options
   * @param {(lock: unknown) => Promise<any>} callback
   * @returns {Promise<any>}
   */
  async request(name, options, callback) {
    const mode = options?.mode || 'exclusive';

    if (options?.ifAvailable && this._blocked(name, mode)) {
      this.log.push({ name, mode, granted: false });
      return callback(null);
    }

    while (this._blocked(name, mode)) {
      if (options?.signal?.aborted) throw new Error('The lock request was cancelled.');
      await new Promise((resolve) => { this._waiting.push(resolve); });
    }

    const entry = this._held.get(name) || { mode, holders: 0 };
    entry.mode = mode;
    entry.holders += 1;
    this._held.set(name, entry);
    this.log.push({ name, mode, granted: true });

    try {
      return await callback({ name, mode });
    } finally {
      entry.holders -= 1;
      if (entry.holders <= 0) this._held.delete(name);
      const waiting = this._waiting.splice(0);
      for (const resolve of waiting) resolve();
    }
  }

  /** @param {string} name @param {'exclusive'|'shared'} mode */
  _blocked(name, mode) {
    const entry = this._held.get(name);
    if (!entry || entry.holders <= 0) return false;
    return mode === 'exclusive' || entry.mode === 'exclusive';
  }

  /** Names currently held. @returns {string[]} */
  heldNames() {
    return Array.from(this._held.entries()).filter(([, e]) => e.holders > 0).map(([n]) => n);
  }
}

/**
 * A message bus standing in for the platform's cross-context channels.
 *
 * One bus per simulated device. Two contexts asking it for the same channel name are two windows
 * of one browser talking to each other.
 */
export class FakeBus {
  constructor() {
    /** @type {Map<string, Set<any>>} */
    this._channels = new Map();
    /** Every message posted, in order. */
    this.log = [];
  }

  /**
   * @param {string} name
   * @returns {import('../platform.js').ChannelPort}
   */
  channel(name) {
    const ports = this._channels.get(name) || new Set();
    this._channels.set(name, ports);

    const listeners = new Set();
    const port = {
      name,
      closed: false,
      postMessage: (message) => {
        if (port.closed) throw new Error('This channel is closed.');
        this.log.push({ channel: name, message });
        const payload = structuredClone(message);
        for (const other of ports) {
          if (other === port || other.closed) continue;
          // Asynchronous, as the platform's is: a peer never observes a message inside the
          // sender's own call stack.
          setTimeout(() => {
            if (other.closed) return;
            for (const listener of other._listeners) listener({ data: structuredClone(payload) });
          }, 0);
        }
      },
      addEventListener: (type, listener) => {
        if (type === 'message') listeners.add(listener);
      },
      removeEventListener: (type, listener) => {
        if (type === 'message') listeners.delete(listener);
      },
      close: () => {
        port.closed = true;
        ports.delete(port);
      },
      _listeners: listeners,
    };

    ports.add(port);
    return port;
  }

  /** Let every pending delivery land. Tests await this instead of guessing at timing. */
  async settle() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
