/**
 * THE PLATFORM PORT — the four browser facilities this layer uses, named and injected.
 *
 * The store needs the local database, the key-range constructor, the cross-context lock manager
 * and cross-context messaging. All four are globals in a browser and none of them exists in the
 * runtime the test gate runs in. Rather than reach for globals directly, every module here takes
 * a `platform` object, and there are two implementations:
 *
 *  - {@link browserPlatform} reads the real globals. It is what the application uses.
 *  - `testing/platform-double.js` assembles in-process doubles. It is what the tests use, and
 *    it can hand TWO platforms the SAME database, lock manager and message bus — which is how
 *    two windows on one laptop are simulated honestly rather than described.
 *
 * This is not indirection for its own sake. The most safety-critical logic in the application —
 * durability ordering, conflict detection, per-session isolation — is here, and it has to be
 * verifiable with no browser, no build step and nothing installed. A port is what makes that
 * possible.
 *
 * ## The form factor, and why it is decided here
 *
 * Running two live sessions at once is a LAPTOP-ONLY capability. That decision needs a form
 * factor, and detecting one is the sort of thing that gets re-invented badly in three places, so
 * it is done once, here, and exposed as a value the capability layer reads. It FAILS CLOSED: an
 * environment it cannot classify is treated as not-a-laptop and the capability is withheld.
 */

/**
 * @typedef {Object} LockPort
 * @property {(name: string, options: {mode?: 'exclusive'|'shared', ifAvailable?: boolean, signal?: AbortSignal}, callback: (lock: unknown) => Promise<unknown>) => Promise<unknown>} request
 *   Shaped exactly like the platform's own lock manager: the lock is held for as long as the
 *   callback's promise is unresolved, and `ifAvailable` calls back with `null` rather than
 *   waiting when the lock is already held.
 */

/**
 * @typedef {Object} ChannelPort
 * @property {(message: unknown) => void} postMessage
 * @property {(type: 'message', listener: (event: {data: unknown}) => void) => void} addEventListener
 * @property {(type: 'message', listener: (event: {data: unknown}) => void) => void} [removeEventListener]
 * @property {() => void} close
 */

/**
 * @typedef {Object} Platform
 * @property {IDBFactory} indexedDB              The local database factory.
 * @property {typeof IDBKeyRange} IDBKeyRange    The key-range constructor. Needed for every paged query.
 * @property {LockPort|null} locks               Cross-context locking, or null where unavailable.
 * @property {((name: string) => ChannelPort)|null} broadcast  Cross-context messaging factory, or null.
 * @property {'desktop'|'mobile'|'unknown'} formFactor
 * @property {boolean} supportsStrictDurability  Whether a transaction may ask for strict durability.
 */

/**
 * Classify the device, conservatively.
 *
 * Order of evidence, most reliable first:
 *
 *  1. the user-agent client hint, which answers the question directly where it exists;
 *  2. pointer and hover media queries — a coarse pointer that cannot hover is a touch device,
 *     and a fine pointer is a machine with a mouse or trackpad;
 *  3. touch points, as a last resort.
 *
 * Anything still unresolved is `unknown`, and `unknown` is treated as not-a-laptop everywhere it
 * matters. A tablet reporting itself as a desktop is the residual inaccuracy and it is the benign
 * direction: the capability it would then be offered genuinely works there, because the
 * facilities it needs are present. The reverse — withholding on a real laptop — costs the coach a
 * feature he was told he had, which is why the detection prefers evidence over guessing.
 *
 * @param {any} [global]
 * @returns {'desktop'|'mobile'|'unknown'}
 */
export function detectFormFactor(global = globalThis) {
  const nav = global?.navigator;
  if (!nav) return 'unknown';

  const hint = nav.userAgentData;
  if (hint && typeof hint.mobile === 'boolean') return hint.mobile ? 'mobile' : 'desktop';

  if (typeof global.matchMedia === 'function') {
    const query = (q) => {
      try { return global.matchMedia(q)?.matches === true; } catch { return false; }
    };
    const coarse = query('(pointer: coarse)');
    const noHover = query('(hover: none)');
    if (coarse && noHover) return 'mobile';
    if (query('(pointer: fine)')) return 'desktop';
  }

  if (typeof nav.maxTouchPoints === 'number' && nav.maxTouchPoints > 0) return 'mobile';
  return 'unknown';
}

/**
 * The real platform, read off the globals.
 *
 * Every facility is optional except the database itself: an environment with no local database
 * cannot run this application at all and says so immediately, whereas missing locks or messaging
 * only withdraw a capability. That asymmetry is deliberate — the coach must always be able to
 * open the app and run a session, and only the two-windows-at-once extra depends on the rest.
 *
 * @param {any} [global]
 * @returns {Platform}
 */
export function browserPlatform(global = globalThis) {
  const idb = global?.indexedDB;
  if (!idb) {
    throw new Error(
      'This browser has no local database, so nothing could be saved on this device. '
      + 'The application cannot run here.',
    );
  }

  const lockManager = global.navigator?.locks;
  const locks = lockManager && typeof lockManager.request === 'function'
    ? { request: (name, options, callback) => lockManager.request(name, options, callback) }
    : null;

  const Channel = global.BroadcastChannel;
  const broadcast = typeof Channel === 'function' ? (name) => new Channel(name) : null;

  return {
    indexedDB: idb,
    IDBKeyRange: global.IDBKeyRange,
    locks,
    broadcast,
    formFactor: detectFormFactor(global),
    supportsStrictDurability: true,
  };
}
