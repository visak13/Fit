/**
 * THE QUEUE ITSELF: enqueueing, reading back in replay order, and recording an outcome.
 *
 * ## Every write here goes through the store's one door
 *
 * `runWrite` in `core/store/db.js` is the only function in this application that opens a writable
 * transaction, and it resolves ONLY once the transaction has genuinely committed. Every function in
 * this file goes through it. That is the whole of "a failed credential is a delay and never a loss":
 * an entry that has been enqueued is on disk before the caller is told anything, so the credential
 * can be dead, absent or expired and the work still exists on the next launch.
 *
 * Nothing here resolves early and nothing returns a status flag. A failure throws.
 *
 * ## The sequence number
 *
 * Replay order is the order things were enqueued, so entries carry a monotonic `seq` that never
 * changes. It is allocated from a counter in the store's `meta` store, read and written INSIDE the
 * same transaction that stores the entry — two windows share one database, and the platform
 * serialises overlapping writable transactions, so two windows enqueueing at once get two different
 * numbers rather than two entries claiming one.
 *
 * ## An attempt is not persisted as a state
 *
 * There is deliberately no `in_flight` status. If there were, an application killed mid-attempt would
 * leave an entry stuck in it, and something would have to decide when a stuck one becomes safe to
 * retry — a lease, a timeout, a guess. Instead an entry stays `pending` for the whole attempt, and
 * only a verdict writes a new state. A killed attempt therefore leaves the queue exactly as it was:
 * the entry is still pending, the next flush picks it up, and the recognition step is what stops the
 * replay from duplicating. Losing nothing across an interruption is the ABSENCE of a mechanism here,
 * not the presence of one.
 *
 * ## The delivered set is bounded HERE, by the one function that can grow it
 *
 * `recordDelivered` is the only function in this application that can put an entry into `delivered`,
 * so the retention bound is applied inside it, in the same transaction. There is no exported prune and
 * no sweep: the bound holds after every delivery rather than after every synchronisation pass, so a
 * pass that never ran, was skipped, or crashed before its tail cannot strand anything. `retention.js`
 * beside this file is the decision and states why it is counted rather than dated.
 */

import { timestamp } from '../model/model.js';
import { runWrite } from '../store/db.js';
import { prefixRange } from '../store/keys.js';
import { META_STORE, OUTBOX_STORE } from '../store/schema.js';
import { backoffMs, describeFailure } from './classify.js';
import {
  HOLD, STATUS, UNDELIVERED_STATUSES, isDue, newEntry, validateEntry,
} from './entry.js';
import { OutboxEntryInvalid, OutboxEntryMissing } from './errors.js';
import { DELIVERED_RETENTION, deliveredRetentionPlan } from './retention.js';

/** Where the sequence counter lives in the store's small-values store. */
export const SEQ_META_KEY = 'outbox.seq';

/** The stores a queue write must hold open: the queue, and the counter beside it. */
const QUEUE_STORES = Object.freeze([OUTBOX_STORE, META_STORE]);

/**
 * Put a delivery on the queue, durably.
 *
 * Resolves once it is committed, with the stored entry. Until it resolves, NOTHING may be reported to
 * the coach as saved or as queued — that is the acknowledgement rule this whole layer is built to.
 *
 * ## Enqueueing the same key twice is not an error, and it does not queue twice
 *
 * The idempotency key is unique across the queue. A caller that re-enqueues the same key — a retry
 * loop above, a screen re-submitting, a restored backup replaying its own work — gets the entry that
 * is already there, in whatever state it has reached. That is the first of the two places duplication
 * is stopped; the second is the recognition step at delivery time.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {{operation: string, space: string, name?: string|null, target_file_id?: string|null,
 *          payload?: string|null, expected_revision?: number|null, label: string,
 *          refs?: readonly string[], idempotency_key?: string, entry_id?: string,
 *          now?: number|string|Date}} spec
 * @returns {Promise<{entry: import('./entry.js').OutboxEntry, queued: boolean}>} `queued: false` when
 *   an entry with this idempotency key was already on the queue and nothing was written.
 */
export async function enqueue(store, spec) {
  const result = await runWrite(store.handle, QUEUE_STORES, async (scope) => {
    if (spec.idempotency_key) {
      const existing = await scope.getByIndex(OUTBOX_STORE, 'by_idempotency_key', spec.idempotency_key);
      if (existing) return { entry: existing, queued: false };
    }

    const counter = await scope.get(META_STORE, SEQ_META_KEY);
    const seq = (counter?.value ?? 0) + 1;

    const entry = newEntry({ ...spec, device: store.device, seq });
    const { ok, issues } = validateEntry(entry);
    if (!ok) {
      throw new OutboxEntryInvalid('That delivery cannot be queued as it stands.', issues, {
        operation: entry.operation, label: entry.label,
      });
    }

    await scope.put(META_STORE, { key: SEQ_META_KEY, value: seq });
    await scope.put(OUTBOX_STORE, entry);
    return { entry, queued: true };
  });

  if (result.queued) {
    store.coordinator.announce({
      kind: 'put', type: 'outbox', record_id: result.entry.entry_id, rev: 1, device: store.device,
    });
  }
  return result;
}

/**
 * One entry by identity.
 * @param {import('../store/local-store.js').LocalStore} store @param {string} entryId
 * @returns {Promise<import('./entry.js').OutboxEntry|undefined>}
 */
export async function getEntry(store, entryId) {
  return store.read(OUTBOX_STORE, (scope) => scope.get(OUTBOX_STORE, entryId));
}

/**
 * One entry by its idempotency key — "has this delivery been queued before?"
 * @param {import('../store/local-store.js').LocalStore} store @param {string} key
 * @returns {Promise<import('./entry.js').OutboxEntry|undefined>}
 */
export async function entryByKey(store, key) {
  return store.read(OUTBOX_STORE, (scope) => scope.getByIndex(OUTBOX_STORE, 'by_idempotency_key', key));
}

/**
 * One page of entries in a status, in replay order.
 *
 * Paged, like every read in this application: the queue's length is unknown, and a device that has
 * been offline for a fortnight may hold a great many entries. There is deliberately no call that
 * loads the whole queue.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {string} status
 * @param {{limit?: number, after?: string|null, direction?: 'next'|'prev'}} [options]
 * @returns {Promise<import('../store/db.js').Page>}
 */
export async function entriesByStatus(store, status, options = {}) {
  const { limit = 50, after = null, direction = 'next' } = options;
  return store.read(OUTBOX_STORE, (scope) => scope.page({
    store: OUTBOX_STORE,
    index: 'by_status_seq',
    range: prefixRange(scope.KeyRange, [status]),
    direction,
    limit,
    after,
  }));
}

/**
 * The pending entries that are due to be attempted, oldest first.
 *
 * The due test is applied DURING the walk rather than to a loaded array, and the range is the pending
 * prefix, so the cost is the page rather than the queue. A held entry is stepped over, not loaded and
 * discarded afterwards.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {{now?: number|string|Date, limit?: number, after?: string|null}} [options]
 * @returns {Promise<import('../store/db.js').Page>}
 */
export async function dueEntries(store, options = {}) {
  const now = timestamp(options.now);
  const { limit = 25, after = null } = options;
  return store.read(OUTBOX_STORE, (scope) => scope.page({
    store: OUTBOX_STORE,
    index: 'by_status_seq',
    range: prefixRange(scope.KeyRange, [STATUS.PENDING]),
    limit,
    after,
    where: (entry) => isDue(entry, now),
  }));
}

/**
 * How many entries are in a status.
 * @param {import('../store/local-store.js').LocalStore} store @param {string} status
 * @returns {Promise<number>}
 */
export async function countByStatus(store, status) {
  return store.read(OUTBOX_STORE, (scope) => scope.countByIndex(
    OUTBOX_STORE, 'by_status_seq', prefixRange(scope.KeyRange, [status]),
  ));
}

/**
 * The oldest entry still waiting in a status, or undefined.
 *
 * One step of a cursor over the index, not a sort of the queue: `seq` is monotonic, so the first row
 * in the status range IS the oldest, and finding it costs one row.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {string} [status]
 * @returns {Promise<import('./entry.js').OutboxEntry|undefined>}
 */
export async function oldestInStatus(store, status = STATUS.PENDING) {
  return store.read(OUTBOX_STORE, (scope) => scope.first({
    store: OUTBOX_STORE,
    index: 'by_status_seq',
    range: prefixRange(scope.KeyRange, [status]),
  }));
}

// ── recording an outcome ──────────────────────────────────────────────────────────────────────────

/**
 * Read, transform and store one entry inside a single transaction.
 *
 * The transform runs on what is ACTUALLY stored, not on what the caller was holding, so two windows
 * flushing at once compose rather than one overwriting the other. `seq` and `entry_id` are re-imposed
 * from the stored row, because replay order is not a thing an outcome may quietly rewrite.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {string} entryId
 * @param {(entry: import('./entry.js').OutboxEntry) => import('./entry.js').OutboxEntry} produce
 * @returns {Promise<import('./entry.js').OutboxEntry>}
 */
async function reviseEntry(store, entryId, produce, afterPut) {
  const { stored, pruned } = await runWrite(store.handle, OUTBOX_STORE, async (scope) => {
    const current = await scope.get(OUTBOX_STORE, entryId);
    if (!current) throw new OutboxEntryMissing(entryId);

    const next = { ...produce(current), entry_id: current.entry_id, seq: current.seq };
    const { ok, issues } = validateEntry(next);
    if (!ok) {
      throw new OutboxEntryInvalid('That outbox entry cannot be stored as it stands.', issues, {
        entry_id: entryId,
      });
    }
    await scope.put(OUTBOX_STORE, next);
    // Runs INSIDE this transaction, deliberately. Whatever an outcome hands to the store alongside
    // the entry has to land with it or not at all — an invariant applied in a second transaction is
    // one an interruption can leave unapplied, which is the whole failure this arrangement ends.
    return { stored: next, pruned: afterPut ? await afterPut(scope, next) : 0 };
  });

  store.coordinator.announce({
    kind: 'put', type: 'outbox', record_id: stored.entry_id, rev: stored.attempts, device: store.device,
  });
  if (pruned > 0) store.coordinator.announce({ kind: 'delete', type: 'outbox', device: store.device });
  return stored;
}

/**
 * ENFORCE THE BOUND ON DELIVERY EVIDENCE — module-private, and that is a design decision rather than
 * an accident of where it sits.
 *
 * Nothing exports this and nothing may. The compiled security specialist's amendment L3 asks for the
 * pruning function to be module-private *"as part of the same decision"* as making its caller
 * structural, with a stated reason: *"a test then CANNOT report that 'prune works when invoked', so
 * the only observable retention behaviour is what the real growth path causes."* A prune that a caller
 * can invoke is a prune a caller can decline to invoke, and this queue has already shipped that defect
 * once — delivered entries carrying a purged client's name in plain text, indefinitely, because the
 * only prune in the build had no caller outside a test.
 *
 * The bound is a function of the COUNT and of nothing else. See `retention.js` §2 for why it may not
 * be a function of the device's idea of the time, and for why the authority for that is L3 rather than
 * L4.
 *
 * The walk is over the `delivered` prefix of `by_status_seq`, ascending, so it takes the OLDEST first
 * and can reach nothing in any other status. That is what spares the entry `scrub.js` deliberately
 * cannot clean.
 *
 * @param {any} scope The open write transaction's scope. It is NOT given the store, so it cannot open
 *   a transaction of its own — the bound rides the delivery's transaction or it does not run.
 * @param {{max: number, batch: number, ceiling: number}} policy
 * @returns {Promise<number>} How many were discarded.
 */
async function boundDeliveredEvidence(scope, policy) {
  const range = prefixRange(scope.KeyRange, [STATUS.DELIVERED]);
  const plan = deliveredRetentionPlan(
    await scope.countByIndex(OUTBOX_STORE, 'by_status_seq', range),
    policy,
  );
  if (!plan.prune) return 0;

  const page = await scope.page({
    store: OUTBOX_STORE, index: 'by_status_seq', range, limit: plan.discard,
  });
  for (const entry of page.items) await scope.delete(OUTBOX_STORE, entry.entry_id);
  return page.items.length;
}

/**
 * It landed. Kept as the evidence a delivery happened — and this is the ONE function in the
 * application that can put an entry into `delivered`, so it is where the bound on that evidence is.
 *
 * Delivered entries are kept rather than removed because they are what makes "it is in the backup"
 * checkable rather than merely intended, and because they are the local half of the duplicate defence:
 * a re-enqueue of a key that has already been delivered finds it and does not queue again.
 *
 * They are also, unavoidably, a SECOND COPY of every record they carry, so keeping them is bounded.
 * The bound is applied HERE, in the transaction that makes the entry delivered, rather than by a sweep
 * somebody schedules — so it holds after every delivery, and a synchronisation pass that never ran,
 * was skipped as a departing flush, or crashed before its tail cannot leave the set over the cap.
 * `retention.js` beside this file is the decision; `boundDeliveredEvidence` above is the mechanism and
 * is module-private on purpose.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {string} entryId
 * @param {{meta?: import('../remote/port.js').RemoteFileMeta|null, how?: string, now?: number|string|Date,
 *          countsAsAttempt?: boolean,
 *          retention?: {max: number, batch: number, ceiling: number}}} [options]
 *   `retention` overrides the policy for this delivery. It is the only knob this package offers, and
 *   deliberately not a prune: a caller can make the bound TIGHTER and then observe what the real
 *   growth path does with it. There is no way to ask for a prune.
 * @returns {Promise<import('./entry.js').OutboxEntry>}
 */
export async function recordDelivered(store, entryId, options = {}) {
  const at = timestamp(options.now);
  const policy = options.retention ?? DELIVERED_RETENTION;
  return reviseEntry(store, entryId, (entry) => ({
    ...entry,
    status: STATUS.DELIVERED,
    hold: HOLD.NONE,
    attempts: entry.attempts + (options.countsAsAttempt === false ? 0 : 1),
    last_attempt_at: at,
    settled_at: at,
    result_meta: options.meta ?? entry.result_meta ?? null,
    last_error: null,
    delivery_note: options.how ?? null,
  }), (scope) => boundDeliveredEvidence(scope, policy));
}

/**
 * A transient failure, or a deadline that passed with no answer. The work stays; the delay grows.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {string} entryId
 * @param {unknown} error
 * @param {{now?: number|string|Date, backoff?: {cap?: number, base?: number, jitter?: (ms: number) => number}}} [options]
 * @returns {Promise<import('./entry.js').OutboxEntry>}
 */
export async function recordTransientFailure(store, entryId, error, options = {}) {
  const at = timestamp(options.now);
  return reviseEntry(store, entryId, (entry) => {
    const attempts = entry.attempts + 1;
    return {
      ...entry,
      status: STATUS.PENDING,
      hold: HOLD.BACKOFF,
      attempts,
      last_attempt_at: at,
      next_attempt_at: timestamp(Date.parse(at) + backoffMs(attempts, options.backoff)),
      last_error: describeFailure(error, at),
    };
  });
}

/**
 * The credential is expired. Wait for the next opportunity; do not burn an attempt.
 *
 * `attempts` is deliberately NOT incremented. Attempts drive the growing delay, and a delay is the
 * answer to a service that might recover on its own. A credential cannot: it needs a user gesture, so
 * counting these would push the backoff of everything behind it out into hours for a reason that has
 * nothing to do with the queue.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {string} entryId
 * @param {unknown} error
 * @param {{now?: number|string|Date}} [options]
 * @returns {Promise<import('./entry.js').OutboxEntry>}
 */
export async function recordCredentialHold(store, entryId, error, options = {}) {
  const at = timestamp(options.now);
  return reviseEntry(store, entryId, (entry) => ({
    ...entry,
    status: STATUS.PENDING,
    hold: HOLD.CREDENTIAL,
    last_attempt_at: at,
    last_error: describeFailure(error, at),
  }));
}

/**
 * The remote refused it, in a way retrying cannot fix. STOP — and be visible.
 *
 * The important half is the visibility, not the stopping. An entry that stopped quietly is
 * indistinguishable from one that succeeded, and this queue exists so the coach is never quietly
 * missing data: a rejected entry is counted into the attention figure, keeps the failure that caused
 * it, and is never attempted again in silence.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {string} entryId
 * @param {unknown} error
 * @param {{now?: number|string|Date}} [options]
 * @returns {Promise<import('./entry.js').OutboxEntry>}
 */
export async function recordRejected(store, entryId, error, options = {}) {
  const at = timestamp(options.now);
  return reviseEntry(store, entryId, (entry) => ({
    ...entry,
    status: STATUS.REJECTED,
    hold: HOLD.NONE,
    attempts: entry.attempts + 1,
    last_attempt_at: at,
    settled_at: at,
    last_error: describeFailure(error, at),
  }));
}

/**
 * It cannot be told whether this landed, or it landed more than once. Stop, and show a person.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {string} entryId
 * @param {{file_ids?: readonly string[], how: string, now?: number|string|Date}} options
 * @returns {Promise<import('./entry.js').OutboxEntry>}
 */
export async function recordAmbiguous(store, entryId, options) {
  const at = timestamp(options.now);
  return reviseEntry(store, entryId, (entry) => ({
    ...entry,
    status: STATUS.AMBIGUOUS,
    hold: HOLD.NONE,
    attempts: entry.attempts + 1,
    last_attempt_at: at,
    settled_at: at,
    ambiguity: Object.freeze([...(options.file_ids || [])]),
    last_error: {
      code: 'ambiguous_outcome', message: options.how, classification: 'ambiguous', at,
    },
  }));
}

/**
 * The credential is dead, so put EVERY due entry on the credential hold, not only the one that
 * discovered it.
 *
 * An expired credential is a condition of the whole queue rather than a property of one entry: nothing
 * else can succeed either. Holding only the entry that hit it would leave the rest due, so every later
 * flush would spend another pointless call to learn the same thing, and — worse — the figure the coach
 * is shown would say one item is waiting to reconnect when in truth everything is.
 *
 * No attempt is burned on any of them, for the same reason it is not burned on the first.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {unknown} error
 * @param {{now?: number|string|Date, limit?: number}} [options]
 * @returns {Promise<number>} How many were put on hold.
 */
export async function holdDueForCredential(store, error, options = {}) {
  const at = timestamp(options.now);
  const { limit = 500 } = options;
  const described = describeFailure(error, at);

  const held = await runWrite(store.handle, OUTBOX_STORE, async (scope) => {
    const page = await scope.page({
      store: OUTBOX_STORE,
      index: 'by_status_seq',
      range: prefixRange(scope.KeyRange, [STATUS.PENDING]),
      limit,
      where: (entry) => entry.hold !== HOLD.CREDENTIAL && isDue(entry, at),
    });
    for (const entry of page.items) {
      await scope.put(OUTBOX_STORE, { ...entry, hold: HOLD.CREDENTIAL, last_error: described });
    }
    return page.items.length;
  });

  if (held > 0) store.coordinator.announce({ kind: 'put', type: 'outbox', device: store.device });
  return held;
}

/**
 * The user re-authorised: release every entry waiting on a credential, in place.
 *
 * They become due immediately rather than after a delay. The wait was never about a service needing
 * time, and making the coach wait out a backoff after he has just tapped to reconnect would read as
 * the app ignoring him.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {{now?: number|string|Date, limit?: number}} [options]
 * @returns {Promise<number>} How many were released.
 */
export async function releaseCredentialHolds(store, options = {}) {
  const at = timestamp(options.now);
  const { limit = 500 } = options;

  const released = await runWrite(store.handle, OUTBOX_STORE, async (scope) => {
    const page = await scope.page({
      store: OUTBOX_STORE,
      index: 'by_status_seq',
      range: prefixRange(scope.KeyRange, [STATUS.PENDING]),
      limit,
      where: (entry) => entry.hold === HOLD.CREDENTIAL,
    });
    for (const entry of page.items) {
      await scope.put(OUTBOX_STORE, { ...entry, hold: HOLD.NONE, next_attempt_at: at });
    }
    return page.items.length;
  });

  if (released > 0) {
    store.coordinator.announce({ kind: 'put', type: 'outbox', device: store.device });
  }
  return released;
}

/**
 * THERE IS DELIBERATELY NO `pruneDelivered` HERE ANY MORE, AND THIS PARAGRAPH IS THE REASON.
 *
 * This file used to export an age-based `pruneDelivered(store, {before, limit})` that any caller could
 * invoke and any caller could forget. It was forgotten: it shipped with no production caller outside a
 * test, and the measured consequence was three delivered entries carrying a purged client's name,
 * general notes and readings in plain text, indefinitely, after the coach had been told that client
 * was deleted.
 *
 * It has been replaced, not relocated. The bound is a COUNT, it is applied by
 * `boundDeliveredEvidence` inside `recordDelivered`'s own transaction, and neither the policy nor the
 * mechanism is reachable from outside this module. Restoring an exported prune would restore the
 * defect, because an exported prune is one a caller can decline to call and a test can report as
 * working when nothing invokes it in production.
 *
 * NOTHING ELSE IS EVER REMOVED. A rejected or ambiguous entry is not bounded at all: the problem it
 * records does not stop mattering because more entries arrived.
 */

/**
 * Every status that means the coach's data is not yet where it belongs, as a list a caller can walk.
 * Exported so a status screen does not re-derive it.
 */
export { UNDELIVERED_STATUSES };
