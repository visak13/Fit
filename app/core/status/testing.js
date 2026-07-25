/**
 * THE TEST HARNESS for the accountability surface.
 *
 * Not shipped to a browser — nothing in the application imports this.
 *
 * The device, the clock and the restart come from `core/outbox/testing.js` rather than being built
 * again here, and deliberately so: this surface reports on the outbox's queue, so a second harness
 * would be a second definition of what a device IS, and the two would drift. What is added here is the
 * one thing this package needs and that one does not — a short way to put a queue into each of the
 * states the requirement names, so a test reads as the state it is asserting rather than as six lines
 * of setup.
 *
 * The clock is virtual. The ladder's rungs are hours and days apart, and a test that waited them out
 * would take days and would stop being run.
 */

import { RemoteCredentialExpired, RemoteInvalidRequest, RemoteUnavailable, SPACES } from '../remote/remote.js';
import { queueBackup } from '../outbox/outbox.js';

export { T0, aDevice, restart, settle } from '../outbox/testing.js';
export { RemoteCredentialExpired, RemoteInvalidRequest, RemoteUnavailable, SPACES };

/**
 * Queue one backup on this device.
 * @param {any} dev @param {{baseName?: string, label?: string}} [overrides]
 */
export async function queueOne(dev, overrides = {}) {
  const { entry } = await queueBackup(dev.store, {
    space: SPACES.VISIBLE,
    baseName: overrides.baseName || 'library.json',
    payload: '{"exercises":2}',
    label: overrides.label || 'backup of the exercise library',
    now: dev.now(),
  });
  return entry;
}

/**
 * Queue `n` backups, one minute apart, so the oldest is distinguishable from the newest.
 * @param {any} dev @param {number} n
 */
export async function queueSpread(dev, n) {
  const entries = [];
  for (let i = 0; i < n; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    entries.push(await queueOne(dev, { baseName: `backup-${i}.json`, label: `backup number ${i}` }));
    dev.advance(60_000);
  }
  return entries;
}

/** The next `n` calls fail as an expired credential — the queue-wide stop. */
export function credentialExpires(dev, n = 10) {
  dev.adversity.failNext(n, { error: () => new RemoteCredentialExpired('The access token has expired.') });
}

/** The next `n` calls fail as an unreachable service. */
export function serviceUnreachable(dev, n = 10) {
  dev.adversity.failNext(n, { error: () => new RemoteUnavailable('Google could not be reached.') });
}

/** The next `n` calls are refused outright — data that will never land without a person. */
export function serviceRefuses(dev, n = 1) {
  dev.adversity.failNext(n, {
    operation: 'create', error: () => new RemoteInvalidRequest('That name is not acceptable.'),
  });
}
