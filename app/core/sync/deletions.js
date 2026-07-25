/**
 * CARRYING A DELETION OUTWARD — and being exact about how far outward it reaches.
 *
 * ## What a purge has to achieve
 *
 * A departed client's records are removed from this device outright, and the same removal must reach
 * the remote copies and the archived detail. A clinical reference living on in a backup forever is
 * the failure this exists to prevent, and it is invisible: nothing errors, and the coach believes the
 * client is gone.
 *
 * ## The shared session is the trap inside it
 *
 * Sessions are one routine and one to MANY clients. "Remove everything about this client" carelessly
 * read destroys other people's history. The store's purge already draws that line — the departed
 * client is taken OUT of a shared session as a revision, and the session, its other attendees, their
 * readings, their performed records and their notes all survive — and this engine's job is to carry
 * that revision outward like any other record. A session left with nobody in it is removed entirely.
 *
 * ## How far a deletion actually reaches, stated honestly
 *
 * Partitioning means a device may only write into its own area. So:
 *
 *  - **Immediately and structurally:** the departed client's records leave THIS device's area. They
 *    are already gone from the local store, and a compaction writes this device's area out from the
 *    local store, so the records cannot be in it. The older files that did contain them are removed.
 *  - **On its next synchronisation:** every other device applies the purge notice, purges locally,
 *    and compacts its OWN area — because only it may. That is EVENTUAL, not immediate, and saying
 *    otherwise would be a promise this architecture cannot keep.
 *  - **The snapshot** stops carrying the records as soon as it is rebuilt, which happens in the same
 *    cycle.
 *
 * The manifest is only marked propagated once this device's own area has been READ BACK and shown to
 * contain none of the removed identities. A flag set on the assumption that the write worked is
 * exactly the kind of evidence that is worthless when somebody finally checks.
 */

import {
  DELETIONS_STORE, markDeletionPropagated, pendingDeletions, purgeClient,
} from '../store/store.js';
import { readUnion } from './areas.js';

/** Where the identities of purges we have already applied are remembered. */
export const APPLIED_PURGES_KEY = 'sync.applied_purges';

/**
 * **Asserted by a test.** A deletion is marked propagated only after the area has been read back and
 * shown not to contain the removed identities.
 */
export const PROPAGATION_IS_VERIFIED_BY_READ_BACK = true;

/**
 * The deletions this device still has to carry outward.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {{limit?: number}} [options]
 * @returns {Promise<import('../store/purge.js').DeletionManifest[]>}
 */
export async function pendingPurges(store, options = {}) {
  const page = await pendingDeletions(store, { limit: options.limit ?? 25 });
  return page.items;
}

/**
 * Every identity this device has purged, whatever became of the manifest.
 *
 * **This is what stops a purged client walking back in through the front door.** A purge deliberately
 * removes rows rather than leaving tombstones — that is the whole point of it — so there is nothing
 * local saying "this record is gone" for the next pull to consult. Without this set, the very next
 * synchronisation reads another device's area, finds the departed client's records still in it, and
 * puts them back, exactly as though the coach had never pressed the button. It resurrects silently.
 *
 * The manifests are the memory. They are kept rather than pruned — they are the evidence that the
 * removal happened — and this reads them all, whatever their status, because a propagated manifest
 * describes records that must stay gone just as firmly as a pending one does.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @returns {Promise<Set<string>>}
 */
export async function purgedIdentities(store) {
  /** @type {Set<string>} */
  const purged = new Set();
  let after = null;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const page = await store.read(DELETIONS_STORE, (scope) => scope.page({
      store: DELETIONS_STORE, limit: 100, after,
    }));
    for (const manifest of page.items) {
      purged.add(manifest.subject_client_id);
      for (const removed of manifest.removed || []) purged.add(removed.record_id);
    }
    if (page.done || page.items.length === 0) break;
    after = page.cursor;
  }

  return purged;
}

/**
 * Apply purge notices that arrived from another device.
 *
 * Applying one locally raises this device's OWN manifest, which is what makes the removal reach this
 * device's area on the next compaction. That is deliberate amplification: each device is the only
 * writer that can clear its own area, so each has to know.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {readonly any[]} notices
 * @param {{now?: number|string|Date}} [options]
 * @returns {Promise<{applied: string[], already: string[], absent: string[]}>}
 */
export async function applyPurgeNotices(store, notices, options = {}) {
  const seen = new Set(/** @type {string[]} */ ((await store.getMeta(APPLIED_PURGES_KEY)) || []));
  /** @type {string[]} */ const applied = [];
  /** @type {string[]} */ const already = [];
  /** @type {string[]} */ const absent = [];

  for (const notice of notices) {
    if (!notice || typeof notice.deletion_id !== 'string') continue;
    if (seen.has(notice.deletion_id)) { already.push(notice.deletion_id); continue; }

    // Our own notice, read back out of our own area. Applying it again would be harmless but would
    // raise a second manifest for a client we have already removed.
    if (notice.origin_device === store.device) { seen.add(notice.deletion_id); already.push(notice.deletion_id); continue; }

    // eslint-disable-next-line no-await-in-loop
    const client = await store.get('client', notice.subject_client_id);
    if (client) {
      // eslint-disable-next-line no-await-in-loop
      await purgeClient(store, notice.subject_client_id, { now: options.now });
      applied.push(notice.deletion_id);
    } else {
      // Nothing of theirs here — a device that never held this client, or one that has already
      // purged them. Remembering the notice is what stops it being reconsidered every cycle.
      absent.push(notice.deletion_id);
    }
    seen.add(notice.deletion_id);
  }

  await store.setMeta(APPLIED_PURGES_KEY, [...seen]);
  return { applied, already, absent };
}

/**
 * Read this device's own area back and report which removed identities are still in it.
 *
 * @param {import('../remote/port.js').RemoteStoragePort} remote
 * @param {{space: string, device: string, prefix: string, recordIds: readonly string[], timeoutMs?: number}} args
 * @returns {Promise<{clean: boolean, found: string[]}>}
 */
export async function ownAreaClearedOf(remote, args) {
  const union = await readUnion(remote, {
    space: args.space, prefix: args.prefix, timeoutMs: args.timeoutMs,
  });
  const wanted = new Set(args.recordIds);
  const found = [...union.records.keys()].filter((id) => wanted.has(id));
  return { clean: found.length === 0, found };
}

/**
 * Mark the deletions whose identities are genuinely gone from this device's area.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {import('../remote/port.js').RemoteStoragePort} remote
 * @param {{space: string, prefix: string, manifests: readonly import('../store/purge.js').DeletionManifest[],
 *          now?: number|string|Date, timeoutMs?: number}} args
 * @returns {Promise<{propagated: string[], still_present: {deletion_id: string, found: string[]}[]}>}
 */
export async function verifyAndMarkPropagated(store, remote, args) {
  /** @type {string[]} */ const propagated = [];
  /** @type {{deletion_id: string, found: string[]}[]} */ const stillPresent = [];

  for (const manifest of args.manifests) {
    const ids = (manifest.removed || []).map((r) => r.record_id);
    // eslint-disable-next-line no-await-in-loop
    const { clean, found } = await ownAreaClearedOf(remote, {
      space: args.space, device: manifest.device, prefix: args.prefix,
      recordIds: ids, timeoutMs: args.timeoutMs,
    });
    if (clean) {
      // eslint-disable-next-line no-await-in-loop
      await markDeletionPropagated(store, manifest.deletion_id, { now: args.now });
      propagated.push(manifest.deletion_id);
    } else {
      stillPresent.push({ deletion_id: manifest.deletion_id, found });
    }
  }

  return { propagated, still_present: stillPresent };
}
