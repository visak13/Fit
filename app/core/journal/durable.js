/**
 * THE LOG'S HOME IN THE DATABASE — the one writable door, and why an entry commits inside the
 * transaction that made the change it records.
 *
 * `kinds.js`, `entry.js` and `chain.js` beside this file are pure logic: what an entry IS and how
 * entries link. This file is where the log becomes durable. It owns the seam to `core/store` and
 * nothing else owns it: {@link commitEntryInScope} is the ONLY function in this application that can
 * put a row into the journal store.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * ## THE APPEND-VERSUS-TRANSACTION QUESTION, RESOLVED
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `core/store/schema.js` states the discipline the outbox is built to, and it is the right place to
 * start: *"a queue entry must commit in the SAME transaction discipline as the data it describes,
 * through the one writable door in `db.js`. A separate mechanism would be a second door, and the
 * guarantee that a failed credential is a delay and never a loss rests entirely on there being only
 * one."*
 *
 * The same reasoning reaches further here, and lands somewhere stricter.
 *
 * **The resolution: a journal entry commits in the SAME TRANSACTION as the change it records — not
 * merely under the same discipline.** {@link commitEntryInScope} takes a `scope`, never a store
 * handle. It cannot open a transaction; it can only write inside one somebody else already opened.
 * {@link recordChange} is that somebody: it opens ONE `runWrite` over the caller's stores AND
 * {@link JOURNAL_STORES}, runs the caller's own work in it, and writes the entry inside the same
 * unit. Both land in one commit or neither does.
 *
 * ### Why stricter than the outbox, when the outbox's reasoning is sound
 *
 * Because the two failures are not equally recoverable, and that is the whole argument.
 *
 * A queue entry that is missing for a write that happened is a DELAY. The record is still on disk;
 * the next flush, a re-enqueue or a full backup re-derives the delivery from it. Nothing is lost —
 * which is exactly what the outbox's guarantee claims, and it is true.
 *
 * A journal entry that is missing for a change that happened is a HOLE, and nothing anywhere can
 * re-derive it. The event is over. There is no second copy of "the coach unlocked the data at
 * 09:14", and a log that is *usually* complete cannot answer the only question ever asked of an
 * audit log — *did anything else happen?* — because a silently incomplete answer looks exactly like
 * a complete one. The inverse is no better: an entry committing in its own transaction after a
 * record write that then aborts asserts a change that never happened.
 *
 * So the two failure modes are both foreclosed by the same structure, and only by that structure.
 * Same transaction, or the log is a claim rather than a record.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * ## THE PLATFORM RULE THAT SHAPES ALL OF THIS: NO CRYPTOGRAPHY INSIDE A TRANSACTION
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **A digest cannot be awaited inside a database transaction.** The platform ends a transaction the
 * moment control returns to the event loop with no request pending, and `await crypto.subtle.digest`
 * is exactly such a return: the transaction is gone before the entry can be written, and the next
 * call fails with *the transaction has already finished*. This was MEASURED on this build, not
 * inferred — and the in-memory double reproduces it, because the double was written to be strict
 * about precisely this. It is the same trap the paged walk in `core/store/db.js` documents: an
 * `await` in the middle of a transaction that is not a database request is how a unit of work
 * silently ends early.
 *
 * So the append is **split at that seam**, and the invariant this file is written to is absolute:
 *
 *  - {@link prepareEntry} runs BEFORE the write transaction. It reads the chain head and the entry
 *    count in a read transaction of its own, decides the retention plan, and builds and HASHES the
 *    entry — all the cryptography, none of the writing.
 *  - {@link commitEntryInScope} runs INSIDE the caller's write transaction and performs database
 *    requests only: one head re-read, one put, and the bounded prune. No digest, no await that is
 *    not a request.
 *
 * ### What makes precomputing sound rather than optimistic
 *
 * The head re-read. The draft carries the digest of the entry it expects to follow; if the stored
 * head still has that digest then **nothing else has appended to this device's chain since the draft
 * was prepared** — so the count is still the count that was planned against, and the oldest entries
 * are still the ones the plan chose. If the head has moved, the draft is stale and
 * {@link JournalRaceError} is thrown rather than a wrong link written. {@link recordChange} catches
 * it and repeats the whole unit — draft and caller's work together — a bounded number of times.
 *
 * That race is real rather than theoretical: two windows of one browser share one database AND one
 * device tag, so they append to the SAME chain. The platform serialises their write transactions,
 * so the loser sees a moved head and repeats. This is the same shape as the revision conflict
 * `core/store/local-store.js` raises between two windows, resolved the same way — detected, never
 * silently overwritten.
 *
 * ### Reconciled with the standing rule that THE LOG MUST NEVER BLOCK THE APPLICATION
 *
 * These are compatible, and the reconciliation is worth being exact about, because the sloppy
 * reading of "never blocks" is what would destroy the guarantee above.
 *
 * **What "never blocks" means here.** Committing inside a transaction that is already happening adds
 * no round trip to the interface's critical path: no second transaction scheduled behind the first,
 * no second commit to wait on, no network call, nothing for a screen to await that it was not
 * already awaiting. The work an append adds to a write is one head read, one SHA-256 over a few
 * hundred bytes, one put — and once every `PRUNE_BATCH` appends, a bounded prune. That is the COST
 * of the log, bounded and measured. It is not a BLOCK. Nothing else about the log is on a critical
 * path either: verification is a read-only pass a diagnostics screen asks for, never something a
 * save waits on.
 *
 * **What "never blocks" does NOT mean, and this is the important half.** It does not license a
 * best-effort append that swallows its own failures. A `try { append } catch { ignore }` would look
 * like the most obliging possible reading of the rule and would produce precisely the state the
 * outbox reasoning forbids: an entry missing for a change that happened, invisibly, at exactly the
 * moments something was going wrong — which are the moments the log exists for. The rule protects
 * the coach from waiting on the log. It does not protect the log from being false.
 *
 * **So an append can fail the write, and the two ways it can are both correct:**
 *
 *  1. *The entry is refused by the vocabulary or the shape rules* — an unknown kind, a subject on a
 *     kind that forbids one, structured data in a field. Every one of those is a PROGRAMMING ERROR
 *     at the call site, not a condition the coach can be in: kinds are constants, the field set is
 *     closed, and there is no user input on this path. It must be loud, and it is caught the first
 *     time the call site runs, which is in a test. It also happens during {@link prepareEntry},
 *     BEFORE the write transaction opens — so a refused entry costs the coach nothing at all.
 *  2. *The database refuses the write* — realistically, no room left. The change is in the same
 *     transaction and fails with it. This adds no new failure mode: a transaction short of room
 *     fails whether or not it carried an extra row. What the log does add is a few hundred bytes per
 *     change, which is why retention bounds it — see `retention.js`, where bounded growth is argued
 *     as protecting the coach's data from eviction rather than as tidying the log.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * ## RETENTION'S CALLER IS THE APPEND ITSELF
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * This build has twice shipped a correct routine that nothing reached: outbox entries pruned only by
 * a caller who decides to, and a purge manifest carrying a reason nothing consumes. A prune function
 * with no caller is not a retention policy, and a scheduled sweep is only a better class of the same
 * bet — it runs if something schedules it, if the app is open when it fires, if nobody removes the
 * timer during a refactor.
 *
 * So retention is not a pass that visits the log. **It is enforced by the only code that can add to
 * the log.** The log grows in exactly one way — an append — and the same call applies the policy, in
 * the same transaction. There is no ordering in which the bound can be exceeded, no configuration in
 * which the caller is absent, and no path that adds an entry without it.
 *
 * That the pruning function is module-private is part of the same decision: nothing outside this
 * file can call it, so "the prune works when invoked" is not a result this package can produce. The
 * only observable retention behaviour is what APPENDING causes.
 *
 * ## The anchor, and where it lives
 *
 * A prune leaves the surviving head linking to an entry that is gone — on its own, indistinguishable
 * from a deletion. The pass therefore records the digest of the LAST entry it discarded in the
 * store's small-values store, keyed by device, in the same commit as the deletions. That digest is
 * READ from the row being discarded, so recording the anchor needs no cryptography either.
 * `verifyChain` takes the anchor and a pruned chain then verifies exactly; without it the result is
 * `truncated_head`, honest about what it could not check. The pass also appends a
 * `journal.retention_pruned` entry carrying how many were discarded — hashed during
 * {@link prepareEntry} along with the entry that triggered it — so the gap has an account of itself
 * inside the log as well as beside it.
 *
 * A WRONG anchor is not a pass. `verifyChain` reports `head_not_anchored` when the survivor does not
 * link to what retention recorded, so retention cannot be used as cover for a removal.
 */

import { read, runWrite } from '../store/db.js';
import { prefixRange } from '../store/keys.js';
import { JOURNAL_STORE, META_STORE } from '../store/schema.js';

import { appendEntry, verifyChain } from './chain.js';
import { HASH_FIELD } from './entry.js';
import { JournalRaceError } from './errors.js';
import { JOURNAL_KINDS } from './kinds.js';
import { RETENTION, policyProblem, retentionPlan } from './retention.js';

export { JOURNAL_STORE, JournalRaceError };

/**
 * The stores an append must hold open: the log, and the small-values store the anchor lives in.
 *
 * Both are named upfront because a transaction's scope is fixed when it opens, and a prune — which
 * happens on one append in `PRUNE_BATCH` and cannot be predicted at the call site — writes the
 * anchor. A caller holding only the log open would fail at the moment of pruning, with the coach
 * watching. Same reason `storesFor` in `core/store/local-store.js` lists the participants store for
 * a session write.
 *
 * @type {readonly string[]}
 */
export const JOURNAL_STORES = Object.freeze([JOURNAL_STORE, META_STORE]);

/** How many times {@link recordChange} repeats a unit whose chain head moved underneath it. */
export const MAX_APPEND_ATTEMPTS = 4;

/**
 * The stores a write must hold open in order to record itself in the log.
 *
 * Callers use this rather than concatenating by hand, so a call site cannot open a transaction that
 * is one store too narrow.
 *
 * @param {string|readonly string[]} stores The stores the write itself needs.
 * @returns {string[]}
 */
export function journalStoresFor(stores) {
  const own = typeof stores === 'string' ? [stores] : Array.from(stores);
  return Array.from(new Set([...own, ...JOURNAL_STORES]));
}

/**
 * Where a device's retention anchor lives in the store's small-values store.
 *
 * Keyed per device because chains are per device: pruning the laptop's chain says nothing about the
 * phone's, and one shared anchor would make each prune invalidate the other device's verification.
 */
export const ANCHOR_META_PREFIX = 'journal.anchor.';

/** @param {string} device @returns {string} */
export function anchorKeyFor(device) {
  return `${ANCHOR_META_PREFIX}${device}`;
}

/**
 * @typedef {Object} RetentionAnchor
 * @property {string} device
 * @property {string} hash The digest of the LAST entry retention discarded — what the survivor links to.
 * @property {number} seq That entry's position in the chain.
 * @property {string} at When that entry was written, by the device clock.
 * @property {number} discarded_total How many entries this device has discarded in total, ever.
 */

/**
 * @typedef {Object} EntryDraft
 * @property {string} device
 * @property {Readonly<object>} entry The entry, hashed and ready to store.
 * @property {string|null} expects_head The digest the stored head must still have, or null when this
 *   is the device's first entry ever.
 * @property {Readonly<{prune: boolean, discard: number, keep: number, reason: string}>} plan
 * @property {Readonly<object>|null} accounting The `journal.retention_pruned` entry, hashed, when the
 *   plan prunes.
 */

/**
 * The range covering one device's whole chain, in sequence order.
 *
 * The compound primary key is what makes this one contiguous range rather than a filter over the
 * store — see the note on `JOURNAL_STORE` in `core/store/schema.js`.
 *
 * @param {import('../store/db.js').Scope} scope @param {string} device
 */
function chainRange(scope, device) {
  return prefixRange(scope.KeyRange, [device]);
}

/**
 * The device's latest entry, or null if it has never written one.
 *
 * One step of a REVERSE cursor over the device's range, so the cost is one row and not the length of
 * the chain. This is what an append links to.
 *
 * @param {import('../store/db.js').Scope} scope
 * @param {string} device
 * @returns {Promise<object|null>}
 */
export async function latestOnDevice(scope, device) {
  const entry = await scope.first({
    store: JOURNAL_STORE, range: chainRange(scope, device), direction: 'prev',
  });
  return entry ?? null;
}

/**
 * How many entries this device's chain holds.
 * @param {import('../store/db.js').Scope} scope @param {string} device
 * @returns {Promise<number>}
 */
export async function countOnDevice(scope, device) {
  return scope.count(JOURNAL_STORE, chainRange(scope, device));
}

/**
 * The retention anchor recorded for a device, or null if nothing has ever been discarded.
 * @param {import('../store/db.js').Scope} scope @param {string} device
 * @returns {Promise<RetentionAnchor|null>}
 */
export async function readAnchor(scope, device) {
  const row = await scope.get(META_STORE, anchorKeyFor(device));
  return row?.value ?? null;
}

/**
 * One bounded page of a device's chain, oldest first.
 *
 * Paged like every read in this application: the chain is bounded by retention, but a bound of
 * thousands is still not something to load in one go on a phone.
 *
 * @param {import('../store/db.js').Scope} scope
 * @param {string} device
 * @param {{limit?: number, after?: string|null, direction?: 'next'|'prev'}} [options]
 * @returns {Promise<import('../store/db.js').Page>}
 */
export async function readChainPage(scope, device, options = {}) {
  const { limit = 100, after = null, direction = 'next' } = options;
  return scope.page({
    store: JOURNAL_STORE, range: chainRange(scope, device), limit, after, direction,
  });
}

/**
 * Build and hash the entry, OUTSIDE any write transaction. Half one of the append.
 *
 * ⚠ **A DIGEST CANNOT BE TAKEN INSIDE A TRANSACTION.** That is why this half exists at all. Before
 * moving any of it into the write path, read *THE PLATFORM CONSTRAINT* in `JOURNAL.md` beside this
 * file: the obvious shape commits the change, loses the entry, and reports a failure that mentions
 * neither — and it stops erroring at all the moment the append is last or wrapped in a `catch`.
 *
 * Everything cryptographic happens here — see the platform rule at the top of this file. It reads
 * the chain head and the entry count in one read transaction, applies the retention policy, and
 * hashes both the entry and, if the plan prunes, the accounting entry that will account for the gap.
 *
 * A malformed entry is refused HERE, before the caller's write transaction has been opened, so the
 * cost of a programming error at a call site is nothing at all.
 *
 * @param {import('../store/db.js').DbHandle} handle
 * @param {{kind: string, device: string, at?: string, entry_id?: string,
 *          subject?: {type: string, record_id: string}|null, affected_count?: number|null}} fields
 * @param {{retention?: {max: number, batch: number, ceiling: number}}} [options]
 * @returns {Promise<EntryDraft>}
 */
export async function prepareEntry(handle, fields, options = {}) {
  const retention = options.retention ?? RETENTION;
  const problem = policyProblem(retention);
  if (problem) throw new TypeError(problem);

  const { device } = fields;
  const { head, count } = await read(handle, JOURNAL_STORE, async (scope) => ({
    head: await latestOnDevice(scope, device),
    count: await countOnDevice(scope, device),
  }));

  const entry = await link(head, fields);
  // The count AFTER this entry lands is what the plan is made against: this entry is what pushes
  // the chain over. The head re-read at commit time is what keeps that count honest.
  const plan = retentionPlan(count + 1, retention);

  return Object.freeze({
    device,
    entry,
    expects_head: head === null ? null : head[HASH_FIELD],
    plan,
    // Linked onto the entry above, because it is written after it. Hashed here for the same reason
    // everything else is: there is no digest available once the transaction is open.
    accounting: plan.prune
      ? await link(entry, {
        kind: JOURNAL_KINDS.RETENTION_PRUNED,
        device,
        at: entry.at,
        affected_count: plan.discard,
      })
      : null,
  });
}

/**
 * Link one entry onto a predecessor and hash it.
 * @param {object|null} previous
 * @param {object} fields
 */
async function link(previous, fields) {
  return appendEntry(previous, {
    ...fields,
    // The platform's own random identifier, as `newRecordId` in the model uses for a record identity.
    // Not an algorithm choice, and overridable so a test gets a deterministic entry.
    entry_id: fields.entry_id ?? globalThis.crypto.randomUUID(),
  });
}

/**
 * Store a prepared entry INSIDE the caller's transaction, and keep the log bounded. Half two.
 *
 * ⚠ **Database requests only.** One head re-read, one put, and the prune. Nothing here may await
 * anything that is not a request — a digest, a fetch, a timer — because the platform ends a
 * transaction the instant control returns to the event loop with nothing pending, and the caller's
 * transaction would be gone under them. See *THE PLATFORM CONSTRAINT* in `JOURNAL.md`.
 *
 * The head re-read is the correctness argument for the whole split: if the stored head still carries
 * the digest the draft expected, nothing has appended to this chain since the draft was made, so the
 * count and the oldest entries are the ones the plan was made against.
 *
 * @param {import('../store/db.js').Scope} scope A scope from `runWrite` — a read-only one refuses.
 * @param {EntryDraft} draft
 * @returns {Promise<Readonly<object>>} The entry as stored.
 * @throws {JournalRaceError} if another window appended to this chain in between.
 */
export async function commitEntryInScope(scope, draft) {
  const { device, entry, plan } = draft;

  const head = await latestOnDevice(scope, device);
  const headHash = head === null ? null : head[HASH_FIELD];
  if (headHash !== draft.expects_head) {
    throw new JournalRaceError(
      'Another window appended to this device\'s log between preparing this entry and writing it, '
      + 'so the entry would link to the wrong predecessor. The unit of work is repeated rather than '
      + 'a wrong link written.',
      { device, expected_head: draft.expects_head, actual_head: headHash },
    );
  }

  await scope.put(JOURNAL_STORE, entry);
  if (plan.prune) await prune(scope, draft);
  return entry;
}

/**
 * Discard the oldest entries, record what the survivor links to, and account for the gap.
 *
 * **Module-private, deliberately.** Retention on this build has twice been a correct routine nothing
 * reached, so the only way to observe pruning is to append — which is the only way the log grows. A
 * test cannot call this and report that prune works; it can only append and observe that the log
 * stayed bounded.
 *
 * Everything here happens in the caller's transaction: the deletions, the anchor and the accounting
 * entry commit with the entry that triggered them, or none of them do. A prune committing apart from
 * its anchor would leave a chain that reads as tampered.
 *
 * @param {import('../store/db.js').Scope} scope
 * @param {EntryDraft} draft
 * @returns {Promise<number>} How many entries were discarded.
 */
async function prune(scope, draft) {
  const { device, plan, accounting } = draft;

  // The oldest `discard` entries, one bounded page from the front of the device's range. Read as
  // VALUES rather than keys because the last one's digest becomes the anchor — it is what the
  // surviving head links to, and it is about to stop existing.
  const page = await scope.page({
    store: JOURNAL_STORE, range: chainRange(scope, device), limit: plan.discard,
  });
  const doomed = page.items;
  if (doomed.length === 0) return 0;

  const last = doomed[doomed.length - 1];
  for (const entry of doomed) await scope.delete(JOURNAL_STORE, [entry.device, entry.seq]);

  const previous = await readAnchor(scope, device);
  /** @type {RetentionAnchor} */
  const anchor = {
    device,
    hash: last[HASH_FIELD],
    seq: last.seq,
    at: last.at,
    discarded_total: (previous?.discarded_total ?? 0) + doomed.length,
  };
  await scope.put(META_STORE, { key: anchorKeyFor(device), value: anchor });

  // The log's account of its own gap, written after the deletions so it can never be among what was
  // discarded. It carries a COUNT and no identities: an entry naming what it discarded would be a
  // copy of the entries it removed.
  if (accounting) await scope.put(JOURNAL_STORE, accounting);

  return doomed.length;
}

/**
 * Make a change and record it in the log, in ONE transaction. **The door.**
 *
 * ```js
 * await recordChange(store, {
 *   stores: storesFor(type),
 *   fields: { kind: JOURNAL_KINDS.RECORD_UPDATED, device: store.device, subject: { type, record_id } },
 *   work: async (scope) => { await scope.put(storeName, record); return record; },
 * });
 * ```
 *
 * `work` runs inside the same transaction as the entry, and its value is returned once the commit
 * has genuinely landed — `runWrite` withholds it until then, and nothing here changes that.
 *
 * **`work` may run more than once.** If another window appended to this device's chain between the
 * draft and the commit, the whole unit repeats: a fresh draft, a fresh transaction, `work` again.
 * Write `work` as the store's own methods are written — reading current state inside the transaction
 * and computing from it — and repeating is free. That is also why the retry lives here rather than at
 * each call site: one place decides how many times, and the alternative is every call site inventing
 * its own answer or, worse, none of them handling it.
 *
 * @template T
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {{stores: string|readonly string[],
 *          fields: {kind: string, device?: string, at?: string, entry_id?: string,
 *                   subject?: {type: string, record_id: string}|null, affected_count?: number|null},
 *          work: (scope: import('../store/db.js').Scope) => Promise<T>|T,
 *          retention?: {max: number, batch: number, ceiling: number}}} spec
 * @returns {Promise<{result: T, entry: Readonly<object>}>}
 */
export async function recordChange(store, spec) {
  const fields = { device: store.device, ...spec.fields };
  const stores = journalStoresFor(spec.stores);

  let lastRace = null;
  for (let attempt = 1; attempt <= MAX_APPEND_ATTEMPTS; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop -- attempts are sequential by nature.
    const draft = await prepareEntry(store.handle, fields, { retention: spec.retention });
    try {
      // eslint-disable-next-line no-await-in-loop
      return await runWrite(store.handle, stores, async (scope) => {
        const result = await spec.work(scope);
        const entry = await commitEntryInScope(scope, draft);
        return { result, entry };
      });
    } catch (error) {
      if (!(error instanceof JournalRaceError)) throw error;
      lastRace = error;
    }
  }

  // Loud rather than a silent skip of the entry. A log that quietly gives up under contention is a
  // log with holes exactly when the application was busiest.
  throw new JournalRaceError(
    `The log could not be appended to after ${MAX_APPEND_ATTEMPTS} attempts because another window `
    + 'kept appending to this device\'s chain first. Nothing was written.',
    {
      cause: lastRace,
      device: fields.device,
      expected_head: lastRace?.expected_head ?? null,
      actual_head: lastRace?.actual_head ?? null,
      attempts: MAX_APPEND_ATTEMPTS,
    },
  );
}

/**
 * Record something that happened and changed no record. **The other door, and there are only two.**
 *
 * ```js
 * await recordEvent(store, { kind: JOURNAL_KINDS.SYNC_STARTED });
 * ```
 *
 * ## When this is correct, and when reaching for it is the bug
 *
 * The test is not whether the domain feels transactional. **It is whether there is a PAIRED STORE
 * WRITE the entry has to be consistent with.**
 *
 * Where the thing being recorded IS a change to a record, the entry MUST ride that change's
 * transaction through {@link recordChange}, or the hole this whole file argues against is back: an
 * entry missing for a change that happened, or — just as bad — an entry asserting a change that was
 * rolled back. Reaching for `recordEvent` there because it is one argument shorter is precisely the
 * mistake, and it is invisible afterwards, because a log with a hole in it looks exactly like a log
 * without one.
 *
 * Where there is NO paired store write, there is nothing for the entry to be inconsistent WITH, and
 * a standalone append is not a weaker form of the same thing — it is the whole of it. A
 * synchronisation pass beginning, a device declining to create key material, two key envelopes found
 * where there should be one: each of those IS the event. Nothing else lands or fails to land beside
 * it.
 *
 * ## It is the same door, deliberately
 *
 * This is {@link recordChange} with no work to do, and it is written that way rather than as a
 * second append path. The head re-read, the race detection, the bounded repeat and the retention
 * bound all come along unchanged, because they are properties of the one append and not of the
 * caller. A hand-rolled *"just open a transaction and put the entry"* would be a second door — the
 * exact thing `commitEntryInScope` takes a scope rather than a handle in order to make impossible.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {{kind: string, device?: string, at?: string, entry_id?: string,
 *          subject?: {type: string, record_id: string}|null, affected_count?: number|null}} fields
 * @param {{retention?: {max: number, batch: number, ceiling: number}}} [options]
 * @returns {Promise<Readonly<object>>} The entry as stored.
 */
export async function recordEvent(store, fields, options = {}) {
  const { entry } = await recordChange(store, {
    stores: [],
    fields,
    work: () => null,
    ...(options.retention === undefined ? {} : { retention: options.retention }),
  });
  return entry;
}

/**
 * Read a device's chain and its anchor, ready to be verified. Read-only, and never on a save path.
 *
 * Reads a page at a time up to `ceiling` entries — affordable precisely BECAUSE retention bounds the
 * chain, which is the same decision seen from the other side. If the chain is longer than the
 * ceiling the result carries `complete: false` rather than a verdict over part of a chain.
 *
 * The reading is separate from the verifying for the platform reason at the top of this file: the
 * verification hashes, and hashing inside a transaction would end it. So the entries come out first
 * and the digests are taken afterwards.
 *
 * @param {import('../store/db.js').Scope} scope
 * @param {string} device
 * @param {{ceiling?: number, pageSize?: number}} [options]
 * @returns {Promise<{entries: object[], anchor: RetentionAnchor|null, complete: boolean}>}
 */
export async function readChainForVerification(scope, device, options = {}) {
  const { ceiling = RETENTION.max + RETENTION.batch, pageSize = 250 } = options;
  const anchor = await readAnchor(scope, device);

  /** @type {object[]} */
  const entries = [];
  let after = /** @type {string|null} */ (null);
  let complete = true;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- pages are read in order; the next needs this cursor.
    const page = await readChainPage(scope, device, {
      limit: Math.min(pageSize, ceiling - entries.length), after,
    });
    entries.push(...page.items);
    after = page.cursor;
    if (page.done) break;
    if (entries.length >= ceiling) { complete = false; break; }
  }

  return { entries, anchor, complete };
}

/**
 * Verify a device's stored chain against the anchor retention recorded for it.
 *
 * The diagnostics entry point: nothing on a write path calls it. It reads inside a transaction and
 * verifies outside one, which is the only order the platform allows.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {string} [device] Defaults to this installation's own device tag.
 * @param {{ceiling?: number, pageSize?: number}} [options]
 * @returns {Promise<Readonly<{ok: boolean, complete: boolean, anchor: RetentionAnchor|null} & Record<string, any>>>}
 */
export async function verifyDeviceChain(store, device = store.device, options = {}) {
  const { entries, anchor, complete } = await store.read(
    JOURNAL_STORES, (scope) => readChainForVerification(scope, device, options),
  );
  const result = await verifyChain(entries, { anchor: anchor?.hash ?? null });
  return Object.freeze({ ...result, complete, anchor });
}
