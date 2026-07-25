/**
 * WHERE THE DEVICE SLOT'S KEY LIVES.
 *
 * The device wrapping key is generated non-extractable, which means it can be HELD but never
 * read. In a browser that is exactly what the local database does with a key object: it
 * stores the handle, hands it back next launch, and there is no operation anywhere that turns
 * it into bytes. That is the whole reason the device slot is the primary one — daily use
 * prompts for nothing, and nothing that could leak is ever in ordinary memory.
 *
 * This module is a two-method port and its double, for the same reason the remote storage
 * port exists: the guard and the envelope logic can then be proven in full, in a test, before
 * any browser-specific storage code exists.
 *
 * ## The vanishing case is normal, not exceptional
 *
 * `load` returning nothing is an ORDINARY state with several ordinary causes: a brand-new
 * device, a browser that cleared its storage, or an application that was never installed to
 * the home screen and so had its storage reclaimed after a week of not being opened. A caller
 * must treat an absent device key as "this device needs another way in" and reach for the
 * recovery slot — never as a reason to create a second data key.
 */

/**
 * The port. Two operations, because the device key is written once and read at every launch.
 */
export class DeviceKeyStore {
  /**
   * The wrapping key this device holds, or `null` if it has none.
   * @param {string} deviceId
   * @returns {Promise<CryptoKey|null>}
   */
  // eslint-disable-next-line no-unused-vars
  async load(deviceId) { throw new Error('DeviceKeyStore.load is not implemented.'); }

  /**
   * Hold a wrapping key for this device.
   * @param {string} deviceId
   * @param {CryptoKey} key
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line no-unused-vars
  async store(deviceId, key) { throw new Error('DeviceKeyStore.store is not implemented.'); }

  /**
   * Forget this device's key.
   *
   * Present so a test can reproduce the case the design must survive — a device whose storage
   * was cleared underneath it — rather than only the case where everything works.
   *
   * @param {string} deviceId
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line no-unused-vars
  async forget(deviceId) { throw new Error('DeviceKeyStore.forget is not implemented.'); }
}

/** An in-memory implementation, for tests and for a device that has just started up. */
export class InMemoryDeviceKeyStore extends DeviceKeyStore {
  constructor() {
    super();
    /** @type {Map<string, CryptoKey>} */
    this._keys = new Map();
  }

  /** @param {string} deviceId @returns {Promise<CryptoKey|null>} */
  async load(deviceId) {
    return this._keys.get(deviceId) ?? null;
  }

  /** @param {string} deviceId @param {CryptoKey} key @returns {Promise<void>} */
  async store(deviceId, key) {
    this._keys.set(deviceId, key);
  }

  /** @param {string} deviceId @returns {Promise<void>} */
  async forget(deviceId) {
    this._keys.delete(deviceId);
  }
}
