/**
 * THE TEST HARNESS: one simulated device, one local store, one remote double, one virtual clock.
 *
 * Not shipped to a browser — nothing in the application imports this.
 *
 * ## The one thing this file exists to make possible: a restart
 *
 * Every durability claim in this package is a claim about what survives the application going away.
 * {@link restart} closes the store and opens a new one against the SAME simulated device, which is
 * what a browser does when the tab is killed and the coach opens the app again: the local database
 * outlives the code that was using it. A test that merely kept using the same store object would
 * prove nothing about that, and would pass just as happily against a queue held in memory.
 *
 * ## The clock is virtual
 *
 * The queue's delays are minutes long. A test that waited them out would take minutes and would stop
 * being run, so the clock is one that can be advanced instantly, and every timed assertion is an
 * ordinary deterministic comparison.
 */

import { openLocalStore } from '../store/store.js';
import { createLaptop } from '../store/testing/platform-double.js';
import { Adversity, InMemoryRemoteStorage, manualClock } from '../remote/remote.js';

/** The instant every test starts at, so timestamps in assertions are readable. */
export const T0 = '2026-07-25T09:00:00.000Z';

/**
 * A device: a local store, a remote double, and a clock shared by both.
 *
 * @param {{device?: string, at?: string}} [options]
 */
export async function aDevice(options = {}) {
  const { device = 'coach-laptop', at = T0 } = options;
  const { world, platform } = createLaptop();
  const clock = manualClock(at);
  const adversity = new Adversity();
  const remote = new InMemoryRemoteStorage({ clock, adversity });
  const store = await openLocalStore({ platform, device });

  return {
    world,
    platform,
    clock,
    adversity,
    remote,
    store,
    /** The current instant, in the form every stored timestamp uses. */
    now: () => new Date(clock.now()).toISOString(),
    /** Move virtual time on. */
    advance: (ms) => clock.advance(ms),
  };
}

/**
 * Close the application and open it again on the same device.
 *
 * The local database and the remote are untouched: this is the tab being killed, not the device being
 * wiped. Returns the new store, and mutates `dev.store` so a test can carry on with one name.
 *
 * @param {Awaited<ReturnType<typeof aDevice>>} dev
 * @param {{device?: string}} [options]
 */
export async function restart(dev, options = {}) {
  await dev.store.close();
  const store = await openLocalStore({
    platform: dev.platform,
    device: options.device || dev.store.device,
  });
  dev.store = store;
  return store;
}

/** Let every scheduled task, delivery and commit settle. */
export async function settle() {
  for (let i = 0; i < 4; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  }
}
