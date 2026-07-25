/**
 * WHAT THIS DEVICE CAN DO — reported as values, so the interface withholds rather than discovers.
 *
 * One capability here is a decision rather than a platform fact, and it is the reason this file
 * exists separately from `platform.js`:
 *
 * > **Running two live sessions at once is LAPTOP ONLY. The mobile build must not offer it.**
 *
 * The coach may have two windows open on the laptop, each running a live session with a different
 * routine, sharing one database. That is supported, deliberately and properly. On a phone it is not
 * offered at all — not disabled with a message, not degraded, not attempted: **absent**. The phone
 * is used in person, one client at a time, and a second live session there would be an
 * accidentally-opened tab, not an intention.
 *
 * The interface reads {@link storeCapabilities} and hides the feature. It must not sniff the device
 * itself, and it must not treat the absence as an error to work around.
 *
 * Everything here **fails closed**: a form factor that cannot be classified is not a laptop, and a
 * facility that cannot be confirmed is unavailable. The cost of a false negative is a feature the
 * coach does not see; the cost of a false positive is two windows writing over each other.
 */

/**
 * @typedef {Object} Capability
 * @property {boolean} available
 * @property {string} reason Plain words, suitable for a diagnostics panel. Always populated.
 */

/**
 * @typedef {Object} StoreCapabilities
 * @property {Capability} crossContextCoordination Locking between windows of one browser.
 * @property {Capability} crossContextNotification Change messages between windows.
 * @property {Capability} concurrentSessions       Two live sessions at once. LAPTOP ONLY.
 * @property {Capability} strictDurability         Whether a commit can be asked to be immediate.
 */

/**
 * Capabilities that must never be offered on a phone, whatever the platform reports.
 * @type {readonly string[]}
 */
export const LAPTOP_ONLY_CAPABILITIES = Object.freeze(['concurrentSessions']);

/**
 * @param {import('./platform.js').Platform} platform
 * @returns {StoreCapabilities}
 */
export function storeCapabilities(platform) {
  const hasLocks = Boolean(platform.locks);
  const hasChannel = Boolean(platform.broadcast);
  const isLaptop = platform.formFactor === 'desktop';

  const crossContextCoordination = hasLocks
    ? { available: true, reason: 'This browser can coordinate between its own windows.' }
    : { available: false, reason: 'This browser cannot coordinate between windows, so only one window should be used at a time.' };

  const crossContextNotification = hasChannel
    ? { available: true, reason: 'Other windows are told when data changes.' }
    : { available: false, reason: 'This browser cannot notify its other windows, so a second window may show stale data until it is reloaded.' };

  /** @type {Capability} */
  let concurrentSessions;
  if (!isLaptop) {
    concurrentSessions = {
      available: false,
      reason: platform.formFactor === 'mobile'
        ? 'Running two sessions at once is a laptop feature and is not offered on a phone or tablet.'
        : 'Running two sessions at once is only offered on a laptop, and this device could not be identified as one.',
    };
  } else if (!hasLocks || !hasChannel) {
    concurrentSessions = {
      available: false,
      reason: 'This browser is missing the coordination it would take to run two sessions safely at once.',
    };
  } else {
    concurrentSessions = {
      available: true,
      reason: 'Two windows on this laptop may each run a live session, with different routines.',
    };
  }

  return {
    crossContextCoordination,
    crossContextNotification,
    concurrentSessions,
    strictDurability: platform.supportsStrictDurability
      ? { available: true, reason: 'Saves are committed immediately rather than when the browser gets round to it.' }
      : { available: false, reason: 'This browser decides for itself when to flush a save to disk.' },
  };
}

/**
 * True when a capability is offered here.
 * @param {StoreCapabilities} capabilities
 * @param {keyof StoreCapabilities} name
 */
export function hasCapability(capabilities, name) {
  return capabilities[name]?.available === true;
}
