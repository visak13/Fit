/**
 * THE SYNCHRONISATION ENGINE — one pass, and when a pass happens.
 *
 * ## When it runs, and the thing it can never do
 *
 * Synchronisation is attempted at **every opportunity the platform allows**: on opening, on returning
 * to the foreground, on leaving, at intervals while the application is open, and on demand. Those
 * five are declared as data in {@link SYNC_TRIGGERS} and a test asserts the list.
 *
 * **There is no background synchronisation and there cannot be.** The weaker mobile platform provides
 * no background sync and no periodic sync, and even where a platform did, the credential is
 * foreground-only and obtainable solely inside a user gesture — so a background wake-up would have
 * nothing to authenticate with. This is a structural fact about the architecture, not a gap to be
 * filled in later, and nothing here may be built toward it or imply it. `NO_BACKGROUND_SYNC` is
 * declared and asserted so that adding one is a visible code change a test catches.
 *
 * The `leave` opportunity is a BEST-EFFORT flush. The platform may kill the tab mid-flight; the
 * durable queue makes that harmless, and the outbox makes it structurally impossible for such a run
 * to be reported as a completed synchronisation.
 *
 * ## One pass, in order, and why that order
 *
 *  1. **Push** what changed here into THIS device's own area, through the outbox. Local first, so a
 *     dead credential is a delay and never a loss.
 *  2. **Flush** the queue. Foreground, unless the opportunity is `leave`.
 *  3. **Pull** the union of every area and apply it under last-write-wins, surfacing divergences
 *     rather than resolving them.
 *  4. **Apply purge notices** from other devices — before compaction, so the compaction that follows
 *     writes this device's area out without the departed client in it.
 *  5. **Compact** this device's own area when it has grown, or when a deletion needs to reach it.
 *  6. **Verify and mark** deletions propagated, by reading the area back rather than assuming.
 *  7. **Rebuild the snapshot** from the union: detect a race, and repair it from the authority.
 *
 * Push before pull is deliberate: our own work is safely queued before we start applying anybody
 * else's, so an interruption anywhere after step 1 cannot lose it.
 *
 * ## Sync never blocks, and never lies
 *
 * A failure is reported, loudly and specifically, in the result — and the application still opens.
 * The one value permitted to say "everything is backed up" is the outbox's own completion marker,
 * which refuses any best-effort run, any interrupted run, and any run that left an entry undelivered.
 * This engine does not compute its own.
 */

import { timestamp } from '../model/model.js';
import { RECORD_TYPES } from '../model/model.js';
import {
  flushBestEffort, flushOutbox, outboxStatus, queueBackup, queueRemoval, releaseCredentialHolds,
  syncCompletionMarker,
} from '../outbox/outbox.js';
import { RemoteError, SPACES } from '../remote/remote.js';
import { changedSince } from '../store/store.js';
import { readUnion, listOwnArea } from './areas.js';
import { VERDICT, classify, describeDivergence } from './divergence.js';
import {
  applyPurgeNotices, pendingPurges, purgedIdentities, verifyAndMarkPropagated,
} from './deletions.js';
import { SyncBoundaryError } from './errors.js';
import { AREA_FILE_KINDS, areaFileName, areaPrefix, assertDeviceTag } from './partition.js';
import { DOCUMENT_KINDS, encodeDocument } from './payload.js';
import { PUBLISH, assembleSnapshot, locateSnapshot, publishSnapshot, readSnapshot } from './snapshot.js';

/**
 * Every opportunity the platform allows. Declared as data so the list is testable, and so that adding
 * a sixth is a visible change rather than a call site somewhere.
 */
export const SYNC_TRIGGERS = Object.freeze({
  OPEN: 'open',
  FOREGROUND: 'foreground',
  LEAVE: 'leave',
  INTERVAL: 'interval',
  MANUAL: 'manual',
});

/** @type {readonly string[]} */
export const SYNC_TRIGGER_VALUES = Object.freeze(Object.values(SYNC_TRIGGERS));

/**
 * **A declared value, asserted by a test.** There is no background trigger, no service-worker entry
 * point and no timer that runs while the application is closed. See the note at the top of this file.
 */
export const NO_BACKGROUND_SYNC = true;

/** Where this device's push cursor lives. */
export const PUSH_CURSOR_KEY = 'sync.push_cursor';

/**
 * The opportunities that follow the coach being present — which is when a credential can have been
 * re-acquired, because it is obtainable only inside a user gesture.
 *
 * Entries waiting on an expired credential are released at these opportunities and at no other: they
 * become due at once rather than serving out a delay that was never about a service needing time. On
 * `leave` and `interval` nobody has tapped anything, so releasing would only burn a call to learn the
 * same fact again.
 */
export const CREDENTIAL_RELEASING_TRIGGERS = Object.freeze(['open', 'foreground', 'manual']);

/** How many area files this device may accumulate before it writes its state out and clears them. */
export const COMPACTION_THRESHOLD = 8;

/** How many records one push gathers per read. Bounded, like every other read in this core. */
export const PUSH_PAGE = 50;

/** How many times a snapshot publish is rebuilt-and-retried after a detected race, per pass. */
export const SNAPSHOT_ATTEMPTS = 3;

/** The space the coach can see and browse. Backups belong somewhere he can find them. */
export const DEFAULT_SPACE = SPACES.VISIBLE;

/**
 * The cursor is an instant PLUS what was already sent at that exact instant.
 *
 * The store's changed-since read is inclusive of its lower bound, and it has to be: two records can
 * carry the same `updated_at` to the millisecond, and an exclusive read would drop the second one
 * forever — a silent loss, which is the one outcome this layer exists to prevent. Inclusive alone,
 * though, re-sends the boundary record on every single pass for the rest of the installation's life.
 *
 * So the boundary is remembered as identities: read inclusively, then skip exactly the revisions
 * already sent at that instant. Nothing is dropped and nothing is repeated.
 *
 * @typedef {{at: string, sent: string[]}} PushCursor
 */

/** @param {any} raw @returns {PushCursor} */
function asCursor(raw) {
  if (typeof raw === 'string') return { at: raw, sent: [] };
  if (raw && typeof raw.at === 'string') return { at: raw.at, sent: Array.isArray(raw.sent) ? raw.sent : [] };
  return { at: '', sent: [] };
}

/** The identity of one exact revision, for the boundary set. */
const revisionKey = (record) => `${record.record_id}:${record.rev}:${record.device}`;

/**
 * Everything this device has changed since the cursor, oldest change first.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {{since: PushCursor|string, limit?: number}} args
 * @returns {Promise<{records: any[], cursor: PushCursor}>}
 */
export async function collectLocalChanges(store, args) {
  const limit = args.limit ?? PUSH_PAGE;
  const since = asCursor(args.since);
  const alreadySent = new Set(since.sent);
  /** @type {any[]} */ const records = [];
  let at = since.at;

  for (const type of RECORD_TYPES) {
    let after = null;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const page = await changedSince(store, type, since.at, { limit, after });
      for (const record of page.items) {
        if (record.updated_at === since.at && alreadySent.has(revisionKey(record))) continue;
        records.push(record);
        if (record.updated_at > at) at = record.updated_at;
      }
      if (page.done || page.items.length === 0) break;
      after = page.cursor;
    }
  }

  // What sits exactly on the new boundary — including anything that was already there and is being
  // carried forward, because the next read will meet it again.
  const sent = records.filter((r) => r.updated_at === at).map(revisionKey);
  if (at === since.at) for (const key of since.sent) if (!sent.includes(key)) sent.push(key);

  return { records, cursor: { at, sent } };
}

/**
 * Queue this device's changes into its own area.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {{space: string, now?: number|string|Date, purges?: readonly any[]}} args
 * @returns {Promise<{queued: boolean, records: number, purges: number, cursor: string, name: string|null}>}
 */
export async function pushLocalChanges(store, args) {
  const device = assertDeviceTag(store.device);
  const since = await store.getMeta(PUSH_CURSOR_KEY);
  const { records, cursor } = await collectLocalChanges(store, { since });
  const purges = args.purges || [];

  if (records.length === 0 && purges.length === 0) {
    return { queued: false, records: 0, purges: 0, cursor: cursor.at, name: null };
  }

  const writtenAt = timestamp(args.now);
  const payload = encodeDocument({
    kind: DOCUMENT_KINDS.PUSH, device, records, purges, writtenAt, cursor: cursor.at,
  });

  // The key is generated here and stored on the entry, so a replay after a lost acknowledgement
  // writes the SAME name and the outbox recognises its own earlier delivery instead of duplicating.
  const { entry } = await queueBackup(store, {
    space: args.space,
    baseName: `${areaPrefix(device)}${AREA_FILE_KINDS.PUSH}.json`,
    payload,
    label: `${records.length} record${records.length === 1 ? '' : 's'} from ${device}`,
    refs: records.map((r) => r.record_id),
    now: args.now,
  });

  // Only once the entry is committed. Moving the cursor first would mean an interrupted enqueue
  // silently skipped a change forever, which is the one failure this whole layer exists to prevent.
  await store.setMeta(PUSH_CURSOR_KEY, cursor);
  return { queued: true, records: records.length, purges: purges.length, cursor: cursor.at, name: entry.name };
}

/**
 * Apply a union of the areas to the local store.
 *
 * ## The resurrection guard
 *
 * A purged record has no tombstone — the purge exists to leave no record — so another device's area
 * still holding a copy would put the departed client straight back on the next pull, silently and
 * with no error anywhere. Every identity this device has ever purged is therefore refused here.
 * The count is reported rather than hidden: it is how "the removal is still taking effect elsewhere"
 * becomes something the surface can say.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {import('./areas.js').UnionResult} union
 * @returns {Promise<{applied: number, kept: number, same: number, refused_resurrection: number,
 *                    divergences: import('./divergence.js').Divergence[]}>}
 */
export async function applyUnion(store, union) {
  let applied = 0; let kept = 0; let same = 0; let refused = 0;
  /** @type {import('./divergence.js').Divergence[]} */
  const divergences = [...union.divergences];
  const purged = await purgedIdentities(store);

  for (const incoming of union.records.values()) {
    if (purged.has(incoming.record_id)) { refused += 1; continue; }
    // eslint-disable-next-line no-await-in-loop
    const local = await store.get(incoming.type, incoming.record_id);
    const verdict = classify(local, incoming);

    if (verdict === VERDICT.SAME) { same += 1; continue; }
    if (verdict === VERDICT.KEEP) { kept += 1; continue; }
    if (verdict === VERDICT.DIVERGED) { divergences.push(describeDivergence(local, incoming)); continue; }

    // eslint-disable-next-line no-await-in-loop
    const result = await store.putRecord(incoming);
    if (result.applied) applied += 1; else kept += 1;
  }

  return { applied, kept, same, refused_resurrection: refused, divergences };
}

/**
 * Write this device's whole current state into its area as ONE file, and remove the files it replaces.
 *
 * This is where a deletion reaches the remote copy: the state is written from the local store, and
 * the departed client's records are not in the local store, so they cannot be in it. The older files
 * that did contain them are removed by identifier.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {import('../remote/port.js').RemoteStoragePort} remote
 * @param {{space: string, now?: number|string|Date, timeoutMs?: number, purges?: readonly any[]}} args
 * @returns {Promise<{records: number, replaced: number, name: string}>}
 */
export async function compactOwnArea(store, remote, args) {
  const device = assertDeviceTag(store.device);
  const prefix = areaPrefix(device);
  const existing = await listOwnArea(remote, {
    space: args.space, device, prefix, timeoutMs: args.timeoutMs,
  });

  const { records, cursor } = await collectLocalChanges(store, { since: '' });
  const writtenAt = timestamp(args.now);
  const payload = encodeDocument({
    kind: DOCUMENT_KINDS.STATE, device, records, purges: args.purges || [], writtenAt, cursor: cursor.at,
  });

  const { entry } = await queueBackup(store, {
    space: args.space,
    baseName: `${prefix}${AREA_FILE_KINDS.STATE}.json`,
    payload,
    label: `the whole of ${device}`,
    refs: records.map((r) => r.record_id),
    now: args.now,
  });

  // Queued AFTER the state file, and delivered after it too, because the queue is ordered by
  // sequence. A removal that reached the service before its replacement would leave a window in
  // which this device's records were nowhere in the remote copy at all.
  for (const meta of existing) {
    // eslint-disable-next-line no-await-in-loop
    await queueRemoval(store, {
      fileId: meta.file_id,
      space: args.space,
      label: `an earlier copy of ${device}, now replaced`,
      idempotencyKey: `remove:${meta.file_id}`,
      now: args.now,
    });
  }

  // The state file carries everything, so the next push starts from here.
  await store.setMeta(PUSH_CURSOR_KEY, cursor);
  return { records: records.length, replaced: existing.length, name: /** @type {string} */ (entry.name) };
}

/**
 * Rebuild the snapshot from the areas and publish it, repairing a detected race.
 *
 * The loop is the point. A race means another device wrote the snapshot between our reading it and
 * our writing it — so what we composed is stale, and the answer is not to retry the same text but to
 * **rebuild from the authority**, which still holds every record, and publish that.
 *
 * @param {import('../remote/port.js').RemoteStoragePort} remote
 * @param {{space: string, device: string, now?: number|string|Date, timeoutMs?: number,
 *          attempts?: number}} args
 * @returns {Promise<{outcome: string, attempts: number, raced: number, records: number,
 *                    rebuilt: boolean, how: string, file_ids: string[]}>}
 */
export async function refreshSnapshot(remote, args) {
  const limit = args.attempts ?? SNAPSHOT_ATTEMPTS;
  let raced = 0;
  let outcome = PUBLISH.RACED;
  let how = '';
  let records = 0;
  let fileIds = /** @type {string[]} */ ([]);

  for (let attempt = 1; attempt <= limit; attempt += 1) {
    // Locate first: the metadata we publish against must be the one we composed against, or the
    // comparison proves nothing.
    // eslint-disable-next-line no-await-in-loop
    const located = await locateSnapshot(remote, { space: args.space, timeoutMs: args.timeoutMs });
    if (located.verdict === 'many') {
      return {
        outcome: PUBLISH.AMBIGUOUS, attempts: attempt, raced, records: 0, rebuilt: false,
        how: located.how, file_ids: located.file_ids,
      };
    }

    // eslint-disable-next-line no-await-in-loop
    const union = await readUnion(remote, { space: args.space, timeoutMs: args.timeoutMs });
    const assembled = assembleSnapshot({ union, device: args.device, writtenAt: timestamp(args.now) });
    records = assembled.records;

    // eslint-disable-next-line no-await-in-loop
    const result = await publishSnapshot(remote, {
      space: args.space, text: assembled.text, held: located.meta, timeoutMs: args.timeoutMs,
    });
    outcome = result.outcome;
    how = result.how;
    fileIds = result.file_ids;

    if (result.outcome !== PUBLISH.RACED) {
      return { outcome, attempts: attempt, raced, records, rebuilt: raced > 0, how, file_ids: fileIds };
    }
    raced += 1;
  }

  return { outcome, attempts: limit, raced, records, rebuilt: raced > 0, how, file_ids: fileIds };
}

/**
 * Run one step of a pass, keeping a remote failure as a REPORTED fact rather than an exception.
 *
 * Sync never blocks: the application always opens, and a step that could not reach the service is
 * said out loud — loudly, specifically, and with the two things a caller needs to decide what to do
 * next, which the port declares for exactly this purpose. A failure that did NOT come from the port
 * is a local defect and is rethrown untouched: swallowing it would report a synchronisation that
 * never happened.
 *
 * @template T
 * @param {string} step @param {() => Promise<T>} run @param {any[]} failures
 * @returns {Promise<T|null>}
 */
async function attempt(step, run, failures) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof RemoteError) {
      failures.push({
        step,
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        needs_reauth: error.needsReauth,
      });
      return null;
    }
    throw error;
  }
}

/**
 * @typedef {Object} SyncReport
 * @property {string} trigger
 * @property {string} device
 * @property {string} started_at
 * @property {string} finished_at
 * @property {{queued: boolean, records: number, purges: number}} pushed
 * @property {any} flush                      The outbox's own report from the final flush of this pass.
 * @property {{completed_sync_at: string}|null} completion The ONLY value that may say "backed up".
 * @property {{step: string, code: string, message: string, retryable: boolean, needs_reauth: boolean}[]} failures
 *                                            Steps that could not reach the service. Loud and specific;
 *                                            `needs_reauth` is the one with a tap attached.
 * @property {{applied: number, kept: number, same: number, seen: number}} pulled
 * @property {import('./divergence.js').Divergence[]} divergences Surfaced. Never resolved here.
 * @property {{notices_applied: string[], propagated: string[], still_present: any[], pending: number}} deletions
 * @property {{ran: boolean, records: number, replaced: number}} compaction
 * @property {any} snapshot
 * @property {{name: string, file_id: string, why: string}[]} unreadable
 * @property {any} outbox                     The figures the accountability surface is built on.
 */

/**
 * One synchronisation pass.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {import('../remote/port.js').RemoteStoragePort} remote
 * @param {{trigger: string, space?: string, now?: number|string|Date, timeoutMs?: number,
 *          limit?: number, signal?: {aborted: boolean}}} options
 * @returns {Promise<SyncReport>}
 */
export async function syncNow(store, remote, options) {
  const trigger = options?.trigger;
  if (!SYNC_TRIGGER_VALUES.includes(trigger)) {
    throw new SyncBoundaryError(
      `"${trigger}" is not a synchronisation opportunity. There are five, and none of them is a background one: ${SYNC_TRIGGER_VALUES.join(', ')}.`,
      { trigger },
    );
  }
  const device = assertDeviceTag(store.device);
  const space = options.space || DEFAULT_SPACE;
  const startedAt = timestamp(options.now);
  const flushOptions = {
    now: options.now, timeoutMs: options.timeoutMs, signal: options.signal,
    ...(options.limit === undefined ? {} : { limit: options.limit }),
  };
  const flushOnce = () => (trigger === SYNC_TRIGGERS.LEAVE
    ? flushBestEffort(store, remote, flushOptions)
    : flushOutbox(store, remote, flushOptions));

  /** @type {any[]} */
  const failures = [];

  // ── 1. push, 2. flush ───────────────────────────────────────────────────────────────────────
  // The push is local: it commits to the durable queue, so it does not depend on the service being
  // reachable at all. Everything after this point does, and each step reports rather than throws.
  const outstanding = await pendingPurges(store);
  const pushed = await pushLocalChanges(store, {
    space, now: options.now, purges: outstanding,
  });

  // The coach is here, so a credential may have been re-acquired inside the gesture that brought him.
  // Anything that stopped on a dead one becomes due at once rather than serving out a delay that was
  // never about a service needing time.
  if (CREDENTIAL_RELEASING_TRIGGERS.includes(trigger)) {
    await releaseCredentialHolds(store, { now: options.now });
  }
  let flush = await flushOnce();

  // ── 3. pull ─────────────────────────────────────────────────────────────────────────────────
  const union = await attempt('pull', () => readUnion(remote, { space, timeoutMs: options.timeoutMs }), failures);

  // Purge notices are applied BEFORE the records they are about. The other order re-applies a
  // departed client's records and removes them again a moment later — which works, but writes the
  // clinical reference of a client the coach removed back onto this device in between.
  const notices = union
    ? await applyPurgeNotices(store, union.purges, { now: options.now })
    : { applied: [], already: [], absent: [] };

  const pulled = union
    ? await applyUnion(store, union)
    : { applied: 0, kept: 0, same: 0, refused_resurrection: 0, divergences: [] };

  // ── 5. compaction ───────────────────────────────────────────────────────────────────────────
  // Forced by a deletion that has to reach this device's area, and otherwise by growth alone.
  const carried = await pendingPurges(store);
  const own = await attempt('list own area',
    () => listOwnArea(remote, { space, device, prefix: areaPrefix(device), timeoutMs: options.timeoutMs }),
    failures);
  const mustCompact = own !== null && (carried.length > 0 || own.length >= COMPACTION_THRESHOLD);

  let compaction = { ran: false, records: 0, replaced: 0 };
  if (mustCompact) {
    const result = await attempt('compact', () => compactOwnArea(store, remote, {
      space, now: options.now, timeoutMs: options.timeoutMs, purges: carried,
    }), failures);
    if (result) {
      compaction = { ran: true, records: result.records, replaced: result.replaced };
      flush = await flushOnce();
    }
  }

  // ── 6. verify the deletions actually left the area ──────────────────────────────────────────
  const verified = (carried.length > 0 && compaction.ran
    ? await attempt('verify deletions', () => verifyAndMarkPropagated(store, remote, {
      space, prefix: areaPrefix(device), manifests: carried, now: options.now, timeoutMs: options.timeoutMs,
    }), failures)
    : null) || { propagated: [], still_present: [] };

  // ── 7. the snapshot ─────────────────────────────────────────────────────────────────────────
  const snapshot = await attempt('snapshot', () => refreshSnapshot(remote, {
    space, device, now: options.now, timeoutMs: options.timeoutMs,
  }), failures);

  const outbox = await outboxStatus(store, { now: options.now });
  const remaining = await pendingPurges(store);

  return {
    trigger,
    device,
    started_at: startedAt,
    finished_at: timestamp(options.now),
    pushed: { queued: pushed.queued, records: pushed.records, purges: pushed.purges },
    flush,
    // Taken from the outbox and nowhere else. A pass that flushed best-effort, was interrupted, or
    // left anything undelivered has no completion, and this engine cannot manufacture one. A step
    // that could not reach the service withholds it as well: the queue may have drained before the
    // pull failed, and "synchronised" would then mean "sent mine, never read yours".
    completion: failures.length === 0 ? syncCompletionMarker(flush) : null,
    failures,
    pulled: {
      applied: pulled.applied, kept: pulled.kept, same: pulled.same,
      refused_resurrection: pulled.refused_resurrection, seen: union ? union.records.size : 0,
    },
    divergences: pulled.divergences,
    deletions: {
      notices_applied: notices.applied,
      propagated: verified.propagated,
      still_present: verified.still_present,
      pending: remaining.length,
    },
    compaction,
    snapshot,
    unreadable: union ? union.unreadable : [],
    outbox,
  };
}

/**
 * Recover a device that has never synchronised: read the snapshot, fall back to the areas.
 *
 * The snapshot is read FIRST because it is one call, and the areas are read when there is no snapshot
 * or it cannot be used — which is also the proof that the snapshot is never the only copy of
 * anything. Nothing here writes to the remote copy.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {import('../remote/port.js').RemoteStoragePort} remote
 * @param {{space?: string, timeoutMs?: number}} [options]
 * @returns {Promise<{source: 'snapshot'|'areas'|'nothing', applied: number, records: number, how: string}>}
 */
export async function recoverFromRemote(store, remote, options = {}) {
  const space = options.space || DEFAULT_SPACE;
  const located = await locateSnapshot(remote, { space, timeoutMs: options.timeoutMs });

  if (located.verdict === 'one') {
    const { document } = await readSnapshot(remote, /** @type {string} */ (located.meta?.file_id), options);
    let applied = 0;
    for (const record of document.records) {
      // eslint-disable-next-line no-await-in-loop
      const result = await store.putRecord(record);
      if (result.applied) applied += 1;
    }
    return {
      source: 'snapshot', applied, records: document.records.length,
      how: 'Recovered from the derived snapshot in one read.',
    };
  }

  const union = await readUnion(remote, { space, timeoutMs: options.timeoutMs });
  if (union.records.size === 0) {
    return {
      source: 'nothing', applied: 0, records: 0,
      how: located.verdict === 'many'
        ? `${located.file_ids.length} files answer to the snapshot name and no device area holds anything. Nothing was chosen.`
        : 'There is nothing in the remote copy to recover.',
    };
  }

  let applied = 0;
  for (const record of union.records.values()) {
    // eslint-disable-next-line no-await-in-loop
    const result = await store.putRecord(record);
    if (result.applied) applied += 1;
  }
  return {
    source: 'areas', applied, records: union.records.size,
    how: located.verdict === 'many'
      ? 'More than one file answers to the snapshot name, so none was adopted; the device areas — the authority — were read instead.'
      : 'There is no snapshot, so the device areas were read directly.',
  };
}
