/**
 * THE TEST HARNESS: several devices, ONE remote copy between them.
 *
 * Not shipped to a browser — nothing in the application imports this.
 *
 * ## Why the shape is what it is
 *
 * Every claim this package makes is a claim about TWO devices, so a harness with one device could
 * not exercise a single one of them. Each device gets its own local database — a separate world, as a
 * separate phone or laptop has — and they share one remote double and one virtual clock, which is
 * exactly the topology of the real thing.
 *
 * {@link restart} closes a device's store and opens a new one against the same simulated device: the
 * tab being killed and the application opened again, with the local database outliving the code that
 * was using it. Every durability claim here is a claim about what survives that, and a test that kept
 * using the same store object would prove nothing about it.
 *
 * The clock is virtual because the queue's delays are minutes long, and a test that waits them out is
 * a test nobody runs.
 */

import { Adversity, InMemoryRemoteStorage, manualClock } from '../remote/remote.js';
import { openLocalStore } from '../store/store.js';
import { createLaptop } from '../store/testing/platform-double.js';

/** The instant every test starts at, so timestamps in assertions are readable. */
export const T0 = '2026-07-25T09:00:00.000Z';

/**
 * A world: one remote copy, one clock, and as many devices as a test asks for.
 *
 * @param {{at?: string}} [options]
 */
export function aWorld(options = {}) {
  const clock = manualClock(options.at || T0);
  const adversity = new Adversity();
  const remote = new InMemoryRemoteStorage({ clock, adversity });
  /** @type {any[]} */
  const devices = [];

  return {
    clock,
    adversity,
    remote,
    devices,
    /** The current instant, in the form every stored timestamp uses. */
    now: () => new Date(clock.now()).toISOString(),
    /** Move virtual time on, for both the store's timestamps and the remote's. */
    advance: (/** @type {number} */ ms) => clock.advance(ms),

    /**
     * Add a device with its own local database.
     * @param {string} tag @returns {Promise<{tag: string, platform: any, store: any}>}
     */
    async device(tag) {
      const { platform } = createLaptop();
      const store = await openLocalStore({ platform, device: tag });
      const dev = { tag, platform, store };
      devices.push(dev);
      return dev;
    },

    /** Close every device. */
    async close() {
      for (const dev of devices) {
        // eslint-disable-next-line no-await-in-loop
        await dev.store.close();
      }
    },
  };
}

/**
 * Close the application on this device and open it again. The local database and the remote copy are
 * untouched: this is the tab being killed, not the device being wiped.
 *
 * @param {{tag: string, platform: any, store: any}} dev
 */
export async function restart(dev) {
  await dev.store.close();
  dev.store = await openLocalStore({ platform: dev.platform, device: dev.tag });
  return dev.store;
}

/** Let every scheduled task, delivery and commit settle. */
export async function settle() {
  for (let i = 0; i < 4; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  }
}
