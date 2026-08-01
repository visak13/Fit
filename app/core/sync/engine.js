/**
 * THE SYNCHRONISATION ENGINE — one pass, and when a pass happens.
 *
 * ## When it runs, and the thing it can never do
 *
 * Synchronisation is attempted at **every opportunity the platform allows**: on opening, on returning
 * to the foreground, on the network coming back under a window that never left the screen, on
 * leaving, at intervals while the application is open, and on demand. Those six are declared as data
 * in {@link SYNC_TRIGGERS} and a test asserts the list BY NAME.
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
 *
 * ## What a pass writes to the event log, and what it deliberately does not
 *
 * A pass writes exactly TWO entries: `sync.started` before it attempts anything, and one of
 * `sync.completed` or `sync.refused` at the end. Both stand alone rather than riding a transaction,
 * because a pass running is not a change to any record — there is no paired write for the entry to
 * be consistent with, which is the test for which of the log's two doors a call site uses.
 *
 * The verdict is **taken from the completion marker and not recomputed**. A second opinion in the
 * audit log would be a second authority, able to disagree with the surface the coach is reading.
 *
 * **The records this pass moves record themselves**, and not from here. A pull applies through
 * `store.putRecord` and a purge notice through `purgeClient`, both of which are mutating methods of
 * the local store and both of which already commit their own entry in their own transaction. Adding
 * a per-record entry here would either duplicate those or, worse, assert a change from outside the
 * transaction that made it. The deletions manifest needs no wiring of its own for the same reason:
 * an inbound notice reaches the records through `purgeClient`, so the removal is recorded by the
 * code that performs it.
 *
 * **`sync.conflict_resolved` is not written here and must never be.** Nothing in this engine resolves
 * a divergence — see `divergence.js`, where refusing to is a declared value with a test on it — so it
 * has nothing to attest to: an entry here would say the coach answered a question nobody has put to
 * him. The kind belongs to `resolution.js`, which applies the side he actually picked, and a test
 * scans the whole core to assert that it has exactly one writer. A call site at this ordinary
 * last-write-wins path would relabel every routine pull as a collision and make the log overstate how
 * often his two devices genuinely clashed.
 */

import { JOURNAL_KINDS, recordEvent } from '../journal/journal.js';
import { timestamp } from '../model/model.js';
import { RECORD_TYPES } from '../model/model.js';
import {
  flushBestEffort, flushOutbox, outboxStatus, queueBackup, queueRemoval, releaseCredentialHolds,
  syncCompletionMarker,
} from '../outbox/outbox.js';
import { RemoteError, SPACES } from '../remote/remote.js';
import { APPLY, changedSince } from '../store/store.js';
import { readUnion, listOwnArea } from './areas.js';
import { VERDICT, classify, describeDivergence } from './divergence.js';
import {
  applyPurgeNotices, pendingPurges, purgedIdentities, verifyAndMarkPropagated,
} from './deletions.js';
import { SyncBoundaryError } from './errors.js';
import { AREA_FILE_KINDS, areaFileName, areaPrefix, assertDeviceTag } from './partition.js';
import { DOCUMENT_KINDS, encodeDocument } from './payload.js';
import { PUBLISH, assembleSnapshot, locateSnapshot, publishSnapshot, readSnapshot } from './snapshot.js';
import { completionWithheldBy } from './withheld.js';

/**
 * Every opportunity the platform allows. Declared as data so the list is testable, and so that adding
 * a seventh is a visible change rather than a call site somewhere.
 *
 * **`reconnect` is the network coming back, and it is deliberately not `foreground`.** The trigger is
 * PERSISTED with the completion (`core/status/completion.js`) and turned into plain words for the
 * coach (`BACKUP_OPPORTUNITIES` in `core/status/statement.js`), so a reconnect pass wearing the
 * `foreground` name would tell him the backup happened because he brought the application back to the
 * screen — at a moment when he had been looking straight at it the whole time. The event is real and
 * separately observable, so it gets its own name.
 *
 * **It is not a background pass and {@link NO_BACKGROUND_SYNC} is untouched.** The listener behind it
 * (`src/shell/sync-runner.ts`) runs only while the application is OPEN AND ON SCREEN; a hidden tab
 * that rejoins a network does nothing until he comes back, which is the `foreground` opportunity.
 */
export const SYNC_TRIGGERS = Object.freeze({
  OPEN: 'open',
  FOREGROUND: 'foreground',
  RECONNECT: 'reconnect',
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
 *
 * **`reconnect` IS NOT IN THIS LIST, AND THE OMISSION IS THE DELIBERATE PART.** A reconnect is the
 * network changing its mind, not the coach arriving: no gesture happened, so no token can have been
 * acquired, and releasing entries into a pass that cannot possibly satisfy them would burn a call to
 * learn the same fact again — the exact cost the other two exclusions exist to avoid. His next tap or
 * his next return is what releases them.
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
 * ## A RECORD THAT CANNOT BE WRITTEN STOPS THAT RECORD, NOT THE PASS
 *
 * Every apply is fenced individually and a refusal is REPORTED, for the same reason an undecodable
 * file is reported rather than thrown: one record this store will not take must not stop the coach's
 * phone from receiving anything at all. It cost exactly that. The unique content-key index refused
 * the first shipped exercise the other device sent, the `StoreWriteError` went straight up through
 * `syncNow` — `attempt()` catches `RemoteError` and rethrows everything else — and every record
 * behind it was never applied, including his CLIENTS, which have no content key and cannot collide.
 *
 * **Reported is not the same as swallowed, and the difference is the whole of condition three.** A
 * refusal here withholds the pass's completion through `withheld.js`, exactly as a skipped file does,
 * so a pass that could not take the other device's work cannot say everything is backed up. It is
 * caught broadly ON PURPOSE: the class this closes is "an apply was refused", not "an apply was
 * refused by the one index we already know about".
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {import('./areas.js').UnionResult} union
 * @returns {Promise<{applied: number, kept: number, same: number, reconciled: number,
 *                    refused_resurrection: number, refused: RefusedApply[],
 *                    divergences: import('./divergence.js').Divergence[]}>}
 */
export async function applyUnion(store, union) {
  let applied = 0; let kept = 0; let same = 0; let refused = 0; let reconciled = 0;
  /** @type {import('./divergence.js').Divergence[]} */
  const divergences = [...union.divergences];
  /** @type {RefusedApply[]} */
  const refusals = [];
  const purged = await purgedIdentities(store);

  for (const incoming of union.records.values()) {
    if (purged.has(incoming.record_id)) { refused += 1; continue; }
    // eslint-disable-next-line no-await-in-loop
    const local = await store.get(incoming.type, incoming.record_id);
    const verdict = classify(local, incoming);

    if (verdict === VERDICT.SAME) { same += 1; continue; }
    if (verdict === VERDICT.KEEP) { kept += 1; continue; }
    if (verdict === VERDICT.DIVERGED) { divergences.push(describeDivergence(local, incoming)); continue; }

    let result;
    try {
      // eslint-disable-next-line no-await-in-loop
      result = await store.putRecord(incoming);
    } catch (error) {
      refusals.push(describeRefusal(incoming, error));
      continue;
    }

    if (result.outcome === APPLY.APPLIED) applied += 1;
    else if (result.outcome === APPLY.RECONCILED) { applied += 1; reconciled += 1; }
    else kept += 1;
  }

  return {
    applied, kept, same, reconciled, refused_resurrection: refused, refused: refusals, divergences,
  };
}

/**
 * @typedef {Object} RefusedApply
 * @property {string} record_id
 * @property {string} type
 * @property {string} why      The refusal's own words, kept verbatim. Never a sentence for the coach.
 */

/**
 * One refused apply, as a fact the report can carry.
 *
 * The error's own text is kept because this is the only place it exists: it does not reach a screen
 * and it will be read by whoever is working out why a device is not receiving. It carries no content
 * and no name — a record identity and a kind, which is what an entry about a record is allowed to say.
 *
 * @param {any} record @param {any} error @returns {RefusedApply}
 */
function describeRefusal(record, error) {
  const name = typeof error?.name === 'string' ? error.name : 'Error';
  const message = typeof error?.message === 'string' ? error.message : String(error);
  return { record_id: record.record_id, type: record.type, why: `${name}: ${message}` };
}

/**
 * Write this device's whole current state into its area as ONE file, and remove the files it
 * replaces — EXCEPT any file carrying a side of a clash nobody has answered.
 *
 * This is where a deletion reaches the remote copy: the state is written from the local store, and
 * the departed client's records are not in the local store, so they cannot be in it. The older files
 * that did contain them are removed by identifier.
 *
 * ## THE REFUSAL TO DESTROY AN UNRESOLVED SIDE
 *
 * Measured by s11/a10 at engine level. Two devices write revision N of one record, unaware of each
 * other — a divergence, surfaced, applied by neither side, and nobody has answered it. One of them
 * then edits on to N+1 in the ordinary way. The other pulls, last-write-wins applies N+1 correctly,
 * and ITS OWN revision-N words now exist in exactly one place: the earlier file in its own area. Then
 * this function ran, wrote the whole state from a local store that no longer holds that side, and
 * removed the file that did. Afterwards a raw scan of every file in the space finds the losing edit
 * NOWHERE, `divergences` drops to zero because there is no longer a second copy to detect, and the
 * question stops being asked. No error, no message, and the coach was never asked.
 *
 * So a file that carries a side of an UNANSWERED clash is not removed. That is all this does: it is a
 * refusal to delete, not a resolution and not a surface. Nothing here asks the coach anything — that
 * remains unbuilt and disclosed. What it buys is that his work is still there when someone builds the
 * asking.
 *
 * **`unresolved` is REQUIRED, and `null` is not the same as `[]`.** An optional argument is one a
 * later call site omits and still runs, and the omission is undetectable afterwards because a space
 * with nothing protected looks exactly like a space with nothing to protect. `null` means the pull
 * could not tell us — a step that failed, a union never read — and it FAILS CLOSED: nothing is
 * removed. `[]` means asked and answered: there is no unanswered clash, and compaction proceeds in
 * full, which is the direction that must be proven as hard as the other one.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {import('../remote/port.js').RemoteStoragePort} remote
 * @param {{space: string, now?: number|string|Date, timeoutMs?: number, purges?: readonly any[],
 *          unresolved: readonly any[]|null}} args
 * @returns {Promise<{records: number, replaced: number, withheld_removals: number, name: string}>}
 */
export async function compactOwnArea(store, remote, args) {
  if (args?.unresolved === undefined) {
    throw new SyncBoundaryError(
      'compactOwnArea must be told which clashes are unanswered before it removes anything. Pass '
      + 'the pass\'s own `union.divergences`, or null when the pull could not say — null withholds '
      + 'every removal, which is the safe direction. There is deliberately no default: a caller that '
      + 'forgot would silently delete a side of a clash the coach was never asked about.',
      // ⚠ THE DAY A SECOND CALLER OF THIS FUNCTION APPEARS, THIS PARAMETER MUST BECOME THE UNION
      // ITSELF RATHER THAN A LIST. A required argument prevents FORGETTING; it does not prevent
      // LYING. Today there is exactly one non-test caller — `syncNow` — and it never types a
      // literal: what it passes is what a completed read of the space RETURNED, so `[]` is not a
      // claim anybody makes, it is an answer. A second caller could hand this an empty array
      // without having read anything, and nothing here could tell the difference. That is
      // disclosed rather than closed, deliberately: widening this boundary to harden it is a
      // contract change, and this seam's whole licence is a refusal to delete.
      { device: store.device },
    );
  }
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
  const spared = filesToSpare(existing, args.unresolved, records);
  let removed = 0;
  for (const meta of existing) {
    if (spared.has(meta.file_id)) continue;
    // eslint-disable-next-line no-await-in-loop
    await queueRemoval(store, {
      fileId: meta.file_id,
      space: args.space,
      label: `an earlier copy of ${device}, now replaced`,
      idempotencyKey: `remove:${meta.file_id}`,
      now: args.now,
    });
    removed += 1;
  }

  // The state file carries everything, so the next push starts from here.
  await store.setMeta(PUSH_CURSOR_KEY, cursor);
  return {
    records: records.length,
    replaced: removed,
    withheld_removals: spared.size,
    name: /** @type {string} */ (entry.name),
  };
}

/**
 * The files this compaction must NOT remove, and why each one.
 *
 * A file is spared when it carries a side of an unanswered clash that the state being written does
 * not itself carry. The second half of that sentence is what keeps compaction working: once the state
 * file holds that exact revision, the earlier file is no longer the only copy and removing it
 * destroys nothing.
 *
 * The revision is matched exactly — record, revision AND author — because that triple is what a side
 * of a clash IS. A record at the same revision written by the other device is the OTHER side, and
 * treating it as this one would spare a file while the words in it went.
 *
 * @param {readonly {file_id: string}[]} existing
 * @param {readonly any[]|null} unresolved The pass's unanswered clashes, or null for "cannot say".
 * @param {readonly any[]} records The whole state about to be written.
 * @returns {Set<string>} file ids to leave alone.
 */
function filesToSpare(existing, unresolved, records) {
  // Cannot say. Every file could be the only copy of a side, so none of them goes. A pass that could
  // not read the union has not earned a deletion.
  if (unresolved === null) return new Set(existing.map((meta) => meta.file_id));

  const carried = new Set(records.map(revisionKey));
  const spare = new Set();
  for (const divergence of unresolved) {
    for (const [side, fileId] of [
      [divergence?.local, divergence?.local_file_id],
      [divergence?.incoming, divergence?.incoming_file_id],
    ]) {
      if (!side || typeof fileId !== 'string') continue;
      if (carried.has(revisionKey(side))) continue;
      spare.add(fileId);
    }
  }
  // Only our own files are ours to remove or to spare; the rest were never candidates.
  return new Set(existing.map((meta) => meta.file_id).filter((id) => spare.has(id)));
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
 * @property {{code: string, skipped: number, newer_version: number}|null} completion_withheld
 *                                            Why there is none, when there is none. See `withheld.js`.
 * @property {{step: string, code: string, message: string, retryable: boolean, needs_reauth: boolean}[]} failures
 *                                            Steps that could not reach the service. Loud and specific;
 *                                            `needs_reauth` is the one with a tap attached.
 * @property {{applied: number, kept: number, same: number, reconciled: number,
 *             refused_resurrection: number, refused: RefusedApply[], seen: number}} pulled
 *                                            `refused` is every record this store would not take —
 *                                            the fact that withholds the completion. `reconciled` is
 *                                            how many of `applied` arrived under another identity.
 * @property {import('./divergence.js').Divergence[]} divergences Surfaced. Never resolved here.
 * @property {{notices_applied: string[], propagated: string[], still_present: any[], pending: number}} deletions
 * @property {{ran: boolean, records: number, replaced: number, withheld_removals: number}} compaction
 *                                            `withheld_removals` are earlier files left in place
 *                                            because they carry a side of a clash nobody answered.
 * @property {any} snapshot
 * @property {{name: string, file_id: string, why: string, written_by_newer_version: boolean}[]} unreadable
 *                                            Files skipped because this engine could not DECODE them.
 *                                            NOT a failure — and, since it withholds the completion,
 *                                            not a clean pass either.
 * @property {{name: string, file_id: string, why: string, written_by_newer_version: boolean}[]} unplaceable
 *                                            Files skipped because this engine could not PLACE their
 *                                            name. The same fact through the other door.
 * @property {any[]} unrecognised             Files in the space this application did not write at
 *                                            all — the coach's own. Reported, and NOT a fault.
 * @property {any} outbox                     The figures the accountability surface is built on.
 *
 * There is deliberately NO `retention` field. A pass briefly reported what its tail housekeeping had
 * done to the delivered set; the queue now bounds itself inside the delivery that grows it, so a pass
 * has nothing to report and — more to the point — nothing to fail to do. See section 9 below.
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
      `"${trigger}" is not a synchronisation opportunity. There are six, and none of them is a background one: ${SYNC_TRIGGER_VALUES.join(', ')}.`,
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

  // ── 0. the log ──────────────────────────────────────────────────────────────────────────────
  // A pass BEGINNING is an event in its own right and not a change to any record, so it stands
  // alone rather than riding a transaction — there is no paired write for it to be consistent with.
  // It is written before anything is attempted, so a pass that dies partway through still left a
  // mark: "started, never finished" is exactly the shape the log has to be able to show.
  await recordEvent(store, { kind: JOURNAL_KINDS.SYNC_STARTED });

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
    : {
      applied: 0, kept: 0, same: 0, reconciled: 0, refused_resurrection: 0, refused: [],
      divergences: [],
    };

  // ── 5. compaction ───────────────────────────────────────────────────────────────────────────
  // Forced by a deletion that has to reach this device's area, and otherwise by growth alone.
  const carried = await pendingPurges(store);
  const own = await attempt('list own area',
    () => listOwnArea(remote, { space, device, prefix: areaPrefix(device), timeoutMs: options.timeoutMs }),
    failures);
  const mustCompact = own !== null && (carried.length > 0 || own.length >= COMPACTION_THRESHOLD);

  let compaction = { ran: false, records: 0, replaced: 0, withheld_removals: 0 };
  if (mustCompact) {
    const result = await attempt('compact', () => compactOwnArea(store, remote, {
      space,
      now: options.now,
      timeoutMs: options.timeoutMs,
      purges: carried,
      // The clashes nobody has answered, as this pass read them out of the SPACE. Null when the pull
      // did not happen: compaction then removes nothing, because it cannot know what it would be
      // destroying. `pulled.divergences` is the same list plus any this device found against its own
      // store, and it is the one passed so a clash detected either way protects its file.
      unresolved: union ? pulled.divergences : null,
    }), failures);
    if (result) {
      compaction = {
        ran: true,
        records: result.records,
        replaced: result.replaced,
        // Files this compaction left alone because removing them would have destroyed a side of a
        // clash the coach has not been asked about. Reported rather than silent: an area that stops
        // shrinking is a fact somebody will one day have to explain.
        withheld_removals: result.withheld_removals,
      };
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

  // ── 8. how the pass ended ───────────────────────────────────────────────────────────────────
  // The log takes its verdict from the completion marker and computes nothing of its own, for the
  // same reason this engine does not compute one: the outbox's marker is the ONE value permitted to
  // say everything is backed up, and a second opinion in the audit log would be a second authority
  // — the one able to disagree with the surface the coach is actually looking at.
  //
  // So `sync.completed` means exactly what the marker means, and `sync.refused` covers every way a
  // pass can fall short of it: a step that could not reach the service, a credential that expired
  // with entries still queued, and the best-effort flush on `leave`, which is deliberately incapable
  // of completing. Calling that last one refused is not a slight on it — the pass genuinely stopped
  // without draining, which is the fact the log exists to hold.
  //
  // The disqualifying conditions are asked for ONCE, in `withheld.js`, because `core/status`
  // re-derives the same verdict rather than trusting this field — and two derivations that must
  // agree are two derivations that will not.
  const unreadable = union ? union.unreadable : [];
  const unplaceable = union ? union.unplaceable : [];
  // The pull's own figures, composed BEFORE the verdict is asked for, because the verdict is asked
  // of a report shape and a second shape assembled here for the question alone is a second shape that
  // can drift from the one the accountability surface reads. Same object, same fields, one question.
  const pulledFigures = {
    applied: pulled.applied,
    kept: pulled.kept,
    same: pulled.same,
    reconciled: pulled.reconciled,
    refused_resurrection: pulled.refused_resurrection,
    // Records this store would not take. The pass reports them; `withheld.js` reads THIS field.
    refused: pulled.refused,
    seen: union ? union.records.size : 0,
  };
  const withheld = completionWithheldBy({
    failures, unreadable, unplaceable, pulled: pulledFigures,
  });
  const completion = withheld ? null : syncCompletionMarker(flush);
  await recordEvent(store, {
    kind: completion ? JOURNAL_KINDS.SYNC_COMPLETED : JOURNAL_KINDS.SYNC_REFUSED,
    // Records that actually moved in this pass. A count, and a count cannot carry a name, a note or
    // a reading — which is the whole of what an entry is allowed to say about them.
    //
    // DELETIONS COUNT AS MOVEMENT, in both directions, and leaving them out was a real defect: a
    // pass whose only effect was propagating a removal — purge notices pushed outward, or notices
    // arriving and removing records here — recorded `sync.completed` with a count of zero. The log
    // then said a pass moved nothing while a departed client's removal crossed the device boundary,
    // which is precisely the event this log is most valuable for holding. A removal that reaches the
    // remote copy is the deletions manifest doing its job, and the log has to be able to say it did.
    affected_count: pushed.records + pulled.applied + pushed.purges + notices.applied.length,
  });

  // ── 9. THERE IS NO HOUSEKEEPING STEP HERE, AND ITS ABSENCE IS THE POINT ─────────────────────
  // A prune of the queue's delivery evidence used to run at this tail. It has been REMOVED rather
  // than moved earlier, and the queue is not left unbounded by its removal: `core/outbox` now applies
  // the bound inside `recordDelivered`, in the same transaction that makes an entry delivered.
  //
  // A tail is the wrong place for an invariant, and this build's own shape says why. This pass can
  // end before reaching here — it can throw, the tab can be torn down mid-flight, and the departing
  // `leave` trigger deliberately skipped the prune so the flush was not competing with housekeeping.
  // Every one of those is an ordinary event, and after every one of them the bound would simply not
  // have been applied, with nothing anywhere saying so. An invariant that holds only when a pass
  // completes is not an invariant; it is a habit.
  //
  // NOTHING MAY REINSTATE A SECOND ENFORCER HERE. Two enforcers with two rules can disagree, and the
  // one that disagrees quietly is worse than the single one this replaced.

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
    // pull failed, and "synchronised" would then mean "sent mine, never read yours". A file this
    // engine could not READ withholds it for the same reason and it is the same class of fact — a
    // pass that skipped every file the other device wrote holds none of its work, and green is the
    // one thing it must not show. See `withheld.js`.
    completion,
    // WHY there is no completion, when there is none. Null when the pass earned one. The surface
    // turns this into the coach's own words rather than deriving the condition a second time.
    completion_withheld: withheld,
    failures,
    pulled: pulledFigures,
    divergences: pulled.divergences,
    deletions: {
      notices_applied: notices.applied,
      propagated: verified.propagated,
      still_present: verified.still_present,
      pending: remaining.length,
    },
    compaction,
    snapshot,
    unreadable,
    // Files named for this application that this build cannot place. Detected in `partition.js`
    // since the beginning and, until now, dropped here: `groupByArea` recorded them, the note beside
    // it said they were worth surfacing, and the report did not carry them — so the surface could
    // not say a word about work of his that never arrived.
    unplaceable,
    unrecognised: union ? union.unrecognised : [],
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
      // Reconciled counts as recovered: the record arrived and this device now holds it. Only
      // `kept-local` did not move anything.
      if (result.outcome !== APPLY.KEPT_LOCAL) applied += 1;
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
    if (result.outcome !== APPLY.KEPT_LOCAL) applied += 1;
  }
  return {
    source: 'areas', applied, records: union.records.size,
    how: located.verdict === 'many'
      ? 'More than one file answers to the snapshot name, so none was adopted; the device areas — the authority — were read instead.'
      : 'There is no snapshot, so the device areas were read directly.',
  };
}
