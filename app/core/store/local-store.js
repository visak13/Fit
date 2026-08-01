/**
 * THE LOCAL DURABLE STORE — the application's only way to read and write on this device.
 *
 * ## The standard this is built to
 *
 * The coach's livelihood depends on this data. So: **every write lands durably before any
 * interface acknowledgement**, and that is structural rather than a convention. Every mutation here
 * goes through `runWrite` in `db.js`, which resolves only once the transaction has genuinely
 * committed. No function on this object resolves earlier, and nothing in this package can open a
 * writable transaction by another route. A failed write throws; it is never a resolved promise with
 * a flag on it.
 *
 * Change notifications to other windows are sent **after** the commit, for the same reason: a peer
 * told about a write that has not landed is an acknowledgement by another door.
 *
 * ## Reading and writing are asymmetric on purpose
 *
 * Reads are keyed lookups or bounded pages — see `queries.js`, which holds every query the
 * application asks. There is deliberately no "give me all the sessions" call for a caller to reach
 * for, because volumes are UNKNOWN and cannot be clarified, and the roster and history only grow.
 *
 * ## Ciphertext is carried, never inspected
 *
 * Three fields on the client record are ciphertext. This layer moves them exactly as it moves any
 * other value: it never encrypts, never decrypts, never inspects and never logs them. It does not
 * even name them — the field list lives in the model, and a test asserts that no file in this
 * package mentions any of those names, so the claim is checked rather than promised.
 *
 * ## Two windows
 *
 * Per-session isolation is enforced, not advised. A record belonging to a session that is currently
 * live can only be written by the window holding that session's lease, so the second window running
 * a different routine cannot append to the first window's session even by accident. See
 * `coordination.js`.
 *
 * ## Every mutation records itself, in its own transaction
 *
 * This object is the application's only way to change a record on this device, which makes it the
 * one place the event log has to be wired into for the record-change domain to be complete. Each
 * mutating method below goes through {@link LocalStore.#recordingWrite} — one `recordChange` from
 * `core/journal`, which opens ONE transaction over this write's stores AND the log's, runs the work
 * inside it, and commits the entry there. Both land or neither does.
 *
 * **The wiring is here rather than at the callers deliberately.** A screen, an importer, the
 * synchronisation engine and the seed loader all reach the database through these five methods, so
 * wiring them is what makes the log complete; wiring the callers instead would make it complete only
 * for the callers somebody remembered. `journal-wiring.test.js` asserts the mutating surface against
 * this file rather than against a list, so a sixth mutating method added later fails the gate
 * instead of quietly writing nothing.
 *
 * **An entry says only THAT a record changed, and which one.** No name, no note, no content, no
 * revision payload — see `core/journal/entry.js`, which structurally refuses anything else.
 *
 * Three consequences worth knowing before editing these methods:
 *
 *  1. **`work` may run more than once.** If another window appends to this device's chain between
 *     the entry being hashed and the transaction committing, the whole unit repeats. Every body
 *     below already reads current state inside the transaction and computes from it, which is what
 *     makes repeating free — keep it that way.
 *  2. **A mutation that turns out to change nothing ABORTS rather than recording.** `putRecord` and
 *     `importRecords` can decide, inside the transaction, that the local copy already wins. They
 *     throw {@link NothingApplied}, the transaction aborts, and the entry goes with it — because an
 *     entry asserting an import that did not happen is the same defect as a missing one, pointing
 *     the other way. Nothing is lost by aborting: on that path nothing had been written.
 *  3. **The change announcement still happens after the commit**, exactly as before. A peer told
 *     about a write that has not landed is an acknowledgement by another door, and that is as true
 *     now that the write carries an entry as it was before.
 */

import { JOURNAL_KINDS, recordChange } from '../journal/journal.js';
import {
  createEnvelope, laterOf, reviseEnvelope, supersedes, timestamp, tombstoneEnvelope,
  validateRecord, LIBRARY_TYPES, RECORD_TYPES,
} from '../model/model.js';
import { storeCapabilities } from './capabilities.js';
import { assertLease, createCoordinator } from './coordination.js';
import { openDatabase, read, runWrite } from './db.js';
import {
  StoreConflictError, StoreNotFoundError, StoreValidationError,
} from './errors.js';
import { PARTICIPANTS_STORE, RECORD_STORES, storeNameFor } from './schema.js';

/**
 * Record kinds that belong to a session and are therefore protected while that session is live.
 * @type {readonly string[]}
 */
export const SESSION_SCOPED_TYPES = Object.freeze(['performed-record', 'reading', 'session-note']);

/**
 * **A declared value, asserted by a test, not an absent check.**
 *
 * No path in this store deletes a record because nothing references it. The shipped exercise
 * catalogue deliberately exceeds the shipped week, and the surplus IS the substitution pool the
 * coach draws on when he swaps an exercise mid-session and the intensity adapter draws on when it
 * reaches beyond a routine's own list. An import, reset, migration or backup that tidied away
 * unreferenced entries would silently delete precisely that pool, under the appearance of
 * housekeeping, and it would surface in front of a client as a substitution with nothing to offer.
 *
 * Unreferenced content is a NORMAL state. Pruning it is a defect. This constant exists so that the
 * intent is testable rather than merely missing — an absence is indistinguishable from an oversight,
 * and the next editor "fixes" it.
 */
export const PRUNES_UNREFERENCED_CONTENT = false;

/**
 * Open the local store.
 *
 * @param {{platform: import('./platform.js').Platform, device: string, name?: string, version?: number, channelName?: string}} args
 * @returns {Promise<LocalStore>}
 */
export async function openLocalStore({ platform, device, name, version, channelName }) {
  if (typeof device !== 'string' || device.length < 3) {
    throw new Error('A device tag is required, for example "coach-laptop".');
  }
  const handle = await openDatabase(platform, { name, version });
  const coordinator = createCoordinator({ platform, device, dbName: handle.name, channelName });
  return new LocalStore({ handle, platform, device, coordinator });
}

export class LocalStore {
  /**
   * @param {{handle: import('./db.js').DbHandle, platform: import('./platform.js').Platform, device: string, coordinator: ReturnType<typeof createCoordinator>}} args
   */
  constructor({ handle, platform, device, coordinator }) {
    this.handle = handle;
    this.platform = platform;
    this.device = device;
    this.coordinator = coordinator;
    this.capabilities = storeCapabilities(platform);
  }

  /** Counters a diagnostics screen can show, and a test can assert paging against. */
  get stats() { return this.handle.stats; }

  /** Release the leases, the channel and the connection. */
  async close() {
    await this.coordinator.close();
    this.handle.close();
  }

  // ── reads ───────────────────────────────────────────────────────────────────────────────────

  /**
   * One record by identity.
   * @param {string} type @param {string} recordId
   * @returns {Promise<any|undefined>}
   */
  async get(type, recordId) {
    const store = storeNameFor(type);
    return read(this.handle, store, (scope) => scope.get(store, recordId));
  }

  /**
   * One library record by its content key — `back-squat`, `push-day`.
   *
   * Library content is referenced by content key and app-authored records by identity. That is the
   * model's rule, applied here rather than re-derived by every caller.
   *
   * @param {string} type @param {string} contentKey
   * @returns {Promise<any|undefined>}
   */
  async getByContentKey(type, contentKey) {
    if (!LIBRARY_TYPES.includes(type)) {
      throw new Error(`Only library records have a content key; "${type}" is addressed by identity.`);
    }
    const store = storeNameFor(type);
    return read(this.handle, store, (scope) => scope.getByIndex(store, 'by_content_key', contentKey));
  }

  /**
   * How many records of a kind.
   * @param {string} type
   * @returns {Promise<number>}
   */
  async count(type) {
    const store = storeNameFor(type);
    return read(this.handle, store, (scope) => scope.count(store));
  }

  /**
   * Run a read-only unit of work. The seam `queries.js` builds on.
   * @template T
   * @param {string|string[]} stores
   * @param {(scope: import('./db.js').Scope) => Promise<T>|T} fn
   * @returns {Promise<T>}
   */
  async read(stores, fn) { return read(this.handle, stores, fn); }

  /**
   * A small named value: the installation's device tag, a schema stamp, a sync cursor.
   * @param {string} key
   */
  async getMeta(key) {
    const row = await read(this.handle, 'meta', (scope) => scope.get('meta', key));
    return row?.value;
  }

  /**
   * @param {string} key @param {any} value
   */
  async setMeta(key, value) {
    return runWrite(this.handle, 'meta', (scope) => scope.put('meta', { key, value }));
  }

  // ── writes ──────────────────────────────────────────────────────────────────────────────────

  /**
   * Store a new record.
   *
   * Resolves once the write has committed, with the stored envelope. Until it resolves, nothing may
   * be reported to the coach as saved.
   *
   * @param {string} type
   * @param {Record<string, unknown>} content
   * @param {{recordId?: string, now?: number|string|Date, lease?: import('./coordination.js').SessionLease|null}} [options]
   * @returns {Promise<any>} the stored envelope
   */
  async create(type, content, options = {}) {
    assertKnownType(type);
    const { recordId, now, lease = null } = options;
    const record = createEnvelope({ type, content, device: this.device, now, record_id: recordId });
    assertValid(record);

    const store = storeNameFor(type);
    const stored = await this.#recordingWrite({
      kind: JOURNAL_KINDS.RECORD_CREATED,
      stores: storesFor(type),
      subject: { type, record_id: record.record_id },
    }, async (scope) => {
      await this.#guardLiveSession(scope, lease, sessionIdOf(record));

      if (LIBRARY_TYPES.includes(type) && typeof content?.id === 'string') {
        const clash = await scope.getByIndex(store, 'by_content_key', content.id);
        if (clash) {
          throw new StoreConflictError(
            `There is already a ${type} with the key "${content.id}". Content keys are unique within a kind.`,
            { type, content_key: content.id, existing: clash.record_id },
          );
        }
      }

      await scope.put(store, record);
      if (type === 'session') await rebuildParticipants(scope, record);
      return record;
    });

    this.coordinator.announce({
      kind: 'put', type, record_id: stored.record_id, rev: stored.rev, device: this.device,
    });
    return stored;
  }

  /**
   * Revise a record.
   *
   * `produce` receives the current content and returns the new content. It is called INSIDE the
   * transaction, after the current revision has been read, so the edit is applied to what is
   * actually stored rather than to whatever a screen last saw.
   *
   * Pass `expectRev` to make the write conditional on the revision a screen was showing. Where two
   * windows edit the same record, the second gets {@link StoreConflictError} rather than silently
   * winning — the correct response is to re-read and re-apply.
   *
   * @param {string} type
   * @param {string} recordId
   * @param {(content: any, record: any) => Record<string, unknown>} produce
   * @param {{expectRev?: number, now?: number|string|Date, lease?: import('./coordination.js').SessionLease|null}} [options]
   * @returns {Promise<any>} the stored envelope
   */
  async update(type, recordId, produce, options = {}) {
    assertKnownType(type);
    const { expectRev, now, lease = null } = options;
    const store = storeNameFor(type);

    const stored = await this.#recordingWrite({
      kind: JOURNAL_KINDS.RECORD_UPDATED,
      stores: storesFor(type),
      subject: { type, record_id: recordId },
    }, async (scope) => {
      const current = await scope.get(store, recordId);
      if (!current) throw notFound(type, recordId);
      if (current.deleted) {
        throw new StoreNotFoundError(
          `That ${type} has been deleted and cannot be edited. Create a new one instead.`,
          { type, record_id: recordId },
        );
      }
      assertExpectedRevision(current, expectRev, type);

      const next = reviseEnvelope(current, produce(current.content, current), { device: this.device, now });
      assertValid(next);

      // A live session is the one window's business. That covers both editing a session already in
      // progress and STARTING one: a window cannot start a session it does not hold.
      if (type === 'session') {
        if (current.content?.status === 'in_progress' || next.content?.status === 'in_progress') {
          assertLease(this.coordinator, lease, recordId);
        }
      } else {
        await this.#guardLiveSession(scope, lease, sessionIdOf(next));
      }

      await scope.put(store, next);
      if (type === 'session') await rebuildParticipants(scope, next);
      return next;
    });

    this.coordinator.announce({
      kind: 'put', type, record_id: stored.record_id, rev: stored.rev, device: this.device,
    });
    return stored;
  }

  /**
   * Raise a tombstone: a revision recording that the record is gone.
   *
   * This is the ordinary deletion, and it carries no payload — the content is dropped, so a deleted
   * client's clinical note does not live on inside the tombstone that records their departure. It
   * propagates outward on the next sync, which is why an ordinary delete is a tombstone rather than
   * a removal: a row simply removed here would come back from the remote copy.
   *
   * The deliberate, one-click, complete removal of a client is a different operation with different
   * consequences: see `purge.js`.
   *
   * @param {string} type @param {string} recordId
   * @param {{expectRev?: number, now?: number|string|Date, lease?: import('./coordination.js').SessionLease|null}} [options]
   * @returns {Promise<any>} the tombstone
   */
  async tombstone(type, recordId, options = {}) {
    assertKnownType(type);
    const { expectRev, now, lease = null } = options;
    const store = storeNameFor(type);

    const stored = await this.#recordingWrite({
      kind: JOURNAL_KINDS.RECORD_DELETED,
      stores: storesFor(type),
      subject: { type, record_id: recordId },
    }, async (scope) => {
      const current = await scope.get(store, recordId);
      if (!current) throw notFound(type, recordId);
      assertExpectedRevision(current, expectRev, type);

      if (type === 'session') {
        if (current.content?.status === 'in_progress') assertLease(this.coordinator, lease, recordId);
      } else {
        await this.#guardLiveSession(scope, lease, sessionIdOf(current));
      }

      const next = tombstoneEnvelope(current, { device: this.device, now });
      assertValid(next);
      await scope.put(store, next);
      if (type === 'session') await rebuildParticipants(scope, next);
      return next;
    });

    this.coordinator.announce({
      kind: 'delete', type, record_id: stored.record_id, rev: stored.rev, device: this.device,
    });
    return stored;
  }

  /**
   * Apply a record that came from somewhere else — the remote copy, a restored backup, the other
   * device — under the model's last-write-wins rule, RECONCILING ON THE CONTENT KEY where the same
   * library content arrived under a different identity.
   *
   * The last-write-wins rule is not re-implemented here: `supersedes` in the model is the whole of
   * it, so both devices resolve every comparison identically and cannot converge on two different
   * records. The identity rule is {@link reconcileOnContentKey}, and it is deterministic for exactly
   * the same reason.
   *
   * @param {any} record An envelope.
   * @returns {Promise<ApplyOutcome>} A named outcome, never a boolean. See {@link APPLY}.
   */
  async putRecord(record) {
    assertValid(record);
    const type = record.type;
    const store = storeNameFor(type);

    // The local copy already winning is not a change, so it must not produce an entry. The decision
    // can only be taken inside the transaction — the entry was hashed before it opened — so the work
    // throws and the transaction takes the entry down with it. Nothing is lost: on this path nothing
    // was written. See NothingApplied.
    const result = await this.#recordingWrite({
      kind: JOURNAL_KINDS.RECORD_IMPORTED,
      stores: storesFor(type),
      subject: { type, record_id: record.record_id },
    }, async (scope) => {
      const current = await scope.get(store, record.record_id);
      if (current) {
        if (!supersedes(current, record)) {
          throw new NothingApplied({ outcome: APPLY.KEPT_LOCAL, record: laterOf(current, record) });
        }
        await scope.put(store, record);
        if (type === 'session') await rebuildParticipants(scope, record);
        return { outcome: APPLY.APPLIED, record };
      }

      // Nothing is held under this identity. The same CONTENT may still be here under another one —
      // the whole of the two-device seeding defect — and the unique content-key index would refuse
      // the write. Reconcile instead of colliding.
      const twin = await twinOnContentKey(scope, store, type, record);
      if (twin) return applyReconciliation(scope, store, type, twin, record, {});

      await scope.put(store, record);
      if (type === 'session') await rebuildParticipants(scope, record);
      return { outcome: APPLY.APPLIED, record };
    });

    if (result.outcome !== APPLY.KEPT_LOCAL) {
      this.coordinator.announce({
        kind: 'put',
        type,
        record_id: result.record.record_id,
        rev: result.record.rev,
        device: this.device,
      });
    }
    return result;
  }

  /**
   * Apply many records in ONE transaction — the seed import, an admin reset, a restore.
   *
   * One transaction because a half-applied library is worse than none: either the whole set lands or
   * nothing does, and the coach is never left with routines naming exercises that were not written.
   *
   * **Nothing is pruned.** This call adds and replaces; it never removes a record because nothing
   * references it. See {@link PRUNES_UNREFERENCED_CONTENT}.
   *
   * @param {any[]} records
   * @param {{overwrite?: boolean}} [options] `overwrite` replaces regardless of revision, which is
   *   what an admin reset-to-defaults wants. The default follows last-write-wins.
   * @returns {Promise<{written: number, skipped: number}>}
   */
  async importRecords(records, options = {}) {
    const { overwrite = false } = options;
    for (const record of records) assertValid(record);

    const types = Array.from(new Set(records.map((r) => r.type)));
    const stores = Array.from(new Set(types.flatMap((t) => storesFor(t))));

    const result = await this.#recordingWrite({
      kind: JOURNAL_KINDS.RECORD_IMPORTED,
      stores,
      // No subject: an import is about many records, and the vocabulary makes the subject optional
      // on this kind for exactly that reason. The count is how many records the import CARRIED, and
      // it is fixed before the transaction opens because that is when the entry is hashed — the
      // platform offers no way to amend a hashed entry from inside a transaction, and inventing one
      // would mean hashing in there. A carried record the local copy already superseded was still
      // examined and still part of what arrived.
      affectedCount: records.length,
    }, async (scope) => {
      let written = 0;
      let skipped = 0;
      let reconciled = 0;
      for (const record of records) {
        const store = storeNameFor(record.type);
        const current = await scope.get(store, record.record_id);
        if (current && !overwrite && !supersedes(current, record)) { skipped += 1; continue; }

        // Same reconciliation as `putRecord`, and it is here for the same reason: a restore of a
        // backup taken on the OTHER device carries the shipped library under that device's
        // identities, and the unique content-key index would refuse the whole transaction.
        if (!current) {
          const twin = await twinOnContentKey(scope, store, record.type, record);
          if (twin) {
            const outcome = await applyReconciliation(scope, store, record.type, twin, record, { overwrite });
            if (outcome.outcome === APPLY.KEPT_LOCAL) { skipped += 1; continue; }
            reconciled += 1;
            written += 1;
            continue;
          }
        }

        await scope.put(store, record);
        if (record.type === 'session') await rebuildParticipants(scope, record);
        written += 1;
      }
      // An import in which every record lost is not an import. Same reasoning as putRecord: nothing
      // was written, so aborting costs nothing and stops the log claiming records arrived.
      if (written === 0) throw new NothingApplied({ written, skipped, reconciled });
      return { written, skipped, reconciled };
    });

    this.coordinator.announce({ kind: 'put', type: 'import', device: this.device });
    return result;
  }

  // ── sessions ────────────────────────────────────────────────────────────────────────────────

  /**
   * Take this window's lease on a session, or discover that the other window has it.
   *
   * @param {string} sessionId
   * @returns {Promise<import('./coordination.js').SessionLease|null>} `null` when another window is
   *   running that session. Tell the coach which situation this is; do not retry in a loop.
   */
  async acquireSessionLease(sessionId) {
    return this.coordinator.acquireSessionLease(sessionId);
  }

  /**
   * Listen for changes made in the OTHER windows of this browser.
   * @param {(change: import('./coordination.js').Change) => void} listener
   * @returns {() => void} unsubscribe
   */
  onChange(listener) { return this.coordinator.onChange(listener); }

  // ── internals ───────────────────────────────────────────────────────────────────────────────

  /**
   * Refuse a write into a session that is live in another window.
   *
   * The check is on the session's stored status, not on a flag a caller passes, and it happens
   * inside the same transaction as the write. A session that has finished is freely editable —
   * adding a note afterwards is ordinary work — so this protects the live case only, which is the
   * one that can be corrupted.
   *
   * @param {import('./db.js').Scope} scope
   * @param {import('./coordination.js').SessionLease|null} lease
   * @param {string|undefined} sessionId
   */
  async #guardLiveSession(scope, lease, sessionId) {
    if (!sessionId) return;
    const session = await scope.get(RECORD_STORES.session, sessionId);
    if (!session || session.deleted) return;
    if (session.content?.status !== 'in_progress') return;
    assertLease(this.coordinator, lease, sessionId);
  }

  /**
   * Make a change and record it in the log, in ONE transaction. **Every mutation goes through here.**
   *
   * It is `recordChange` from `core/journal` with this store's stores and the log's held open
   * together, and it exists so that the five mutating methods share one wiring rather than five
   * copies of it — five copies being how the sixth method ends up with none.
   *
   * `work` may run more than once; see the note at the top of this file. Throwing
   * {@link NothingApplied} from it aborts the transaction and returns the carried value instead,
   * which is how a decision taken inside the transaction unwrites an entry that was hashed before it.
   *
   * @template T
   * @param {{kind: string, stores: string|readonly string[],
   *          subject?: {type: string, record_id: string}|null, affectedCount?: number}} spec
   * @param {(scope: import('./db.js').Scope) => Promise<T>|T} work
   * @returns {Promise<T>}
   */
  async #recordingWrite(spec, work) {
    try {
      const { result } = await recordChange(this, {
        stores: spec.stores,
        fields: {
          kind: spec.kind,
          subject: spec.subject ?? null,
          ...(spec.affectedCount === undefined ? {} : { affected_count: spec.affectedCount }),
        },
        work,
      });
      return result;
    } catch (error) {
      if (error instanceof NothingApplied) return error.value;
      throw error;
    }
  }
}

/**
 * The signal that a write decided, INSIDE its transaction, that it was changing nothing.
 *
 * Not an error the application ever sees — {@link LocalStore} catches it and returns the value it
 * carries. It exists because the entry is hashed before the transaction opens (a digest cannot be
 * taken inside one; see `core/journal/durable.js`), so by the time `putRecord` discovers the local
 * copy already wins, the only way to unwrite the entry is to abort the transaction it is in.
 *
 * Aborting is free here and only here: on both paths that throw this, nothing had been put. Reaching
 * for it anywhere something HAS been written would silently discard that write.
 */
class NothingApplied extends Error {
  /** @param {any} value What the caller should receive instead. */
  constructor(value) {
    super('Nothing was applied, so nothing is recorded.');
    this.name = 'NothingApplied';
    this.value = value;
  }
}

// ── applying a record from somewhere else ─────────────────────────────────────────────────────

/**
 * What {@link LocalStore.putRecord} DID. A named outcome, deliberately not a boolean.
 *
 * It was `{applied: boolean}`, and the boolean is what let the reconciliation below be invisible:
 * every caller wrote `if (result.applied)`, a third possibility could not be expressed, and a caller
 * that ignored the flag entirely read exactly like one that had thought about it. A caller now has to
 * name the case it is handling, and a case it has not named is a case it visibly does not handle.
 */
export const APPLY = Object.freeze({
  /** The incoming record was written under its own identity. */
  APPLIED: 'applied',
  /** The local revision was already the winner. NOTHING was written. */
  KEPT_LOCAL: 'kept-local',
  /** The same content was already here under a DIFFERENT identity; the two lines became one. */
  RECONCILED: 'reconciled',
});

/** @type {readonly string[]} */
export const APPLY_OUTCOMES = Object.freeze(Object.values(APPLY));

/**
 * @typedef {{outcome: 'applied', record: any}
 *   | {outcome: 'kept-local', record: any}
 *   | {outcome: 'reconciled', record: any, retired_record_id: string}} ApplyOutcome
 */

/**
 * THE IDENTITY RULE — the one record two devices holding the same content under two identities must
 * both converge on.
 *
 * ## The defect this closes, measured on the real application by s11/a9
 *
 * Seeding runs when the store opens, before the store is published as open, so BOTH devices seed the
 * shipped library before either can possibly have synchronised. `importRecords` files each envelope
 * under a freshly minted `record_id` while the content key stays the shipped one — so the same 99
 * exercises exist on both devices under the same `content.id` and ZERO shared `record_id`. The
 * content-key index is UNIQUE, so the first shipped record to arrive from the other device was
 * refused, and — because `applyUnion` had no per-record fence — the refusal threw out of the whole
 * pass and took every record behind it, INCLUDING his clients and sessions, which can never collide.
 * Nothing merged, ever, in either direction.
 *
 * ## Why the survivor is chosen by ARITHMETIC and not by "the local one wins"
 *
 * Keeping the local identity is the obvious rule and it never converges: A adopts nothing and keeps
 * `a`, B adopts nothing and keeps `b`, and the two devices hold the same content under two identities
 * FOREVER, reconciling again on every pass. The mirror rule — always adopt the incoming identity —
 * is worse: A takes `b` while B takes `a`, and they SWAP, endlessly.
 *
 * So the survivor is the LEXICOGRAPHICALLY SMALLER `record_id`. It is not meaningful and is not meant
 * to be: it is a function of the pair alone, so both devices compute the same answer from the same
 * two records with no message between them, which is the only property that matters. It is the same
 * reasoning `laterOf` gives for breaking a last-write-wins tie on the device tag.
 *
 * The CONTENT is decided by the model's own last-write-wins ladder and not by anything invented here,
 * with one rung added that `laterOf` cannot have: `laterOf` compares two revisions of the SAME record
 * and therefore cannot break a tie on identity, and a total tie here would otherwise resolve to
 * "whichever was passed first", which is a DIFFERENT record on each device. `created_at` takes the
 * earlier of the two, because the record first existed when the earlier of the two devices wrote it.
 *
 * @param {any} local The envelope already in this store, under its identity.
 * @param {any} incoming The envelope that arrived, under its own.
 * @returns {any} The one envelope both devices converge on. Its `record_id` is the survivor.
 */
export function reconcileOnContentKey(local, incoming) {
  const winner = contentWinner(local, incoming);
  return {
    ...winner,
    record_id: local.record_id <= incoming.record_id ? local.record_id : incoming.record_id,
    created_at: local.created_at <= incoming.created_at ? local.created_at : incoming.created_at,
  };
}

/**
 * `laterOf`'s ladder, with the fourth rung it cannot have.
 *
 * Rungs one to three are the model's, in the model's order, and are not restated as a judgement —
 * they are re-walked here only because the fourth rung has to sit under them. The fourth is identity,
 * which is unreachable in `laterOf` because both sides there ARE one record; here the two sides are
 * two records, and without it a total tie resolves to the argument order, which differs by device.
 *
 * @param {any} a @param {any} b @returns {any}
 */
function contentWinner(a, b) {
  if (a.rev !== b.rev) return a.rev > b.rev ? a : b;
  if (a.updated_at !== b.updated_at) return a.updated_at > b.updated_at ? a : b;
  if (a.device !== b.device) return a.device > b.device ? a : b;
  return a.record_id <= b.record_id ? a : b;
}

/**
 * The record already here holding the SAME content under a DIFFERENT identity, or null.
 *
 * Only library records have a content key and only their stores carry the unique index, so this asks
 * nothing of the others. It is a keyed index lookup inside the transaction that is about to write —
 * asking outside it would be a decision taken against a state another window may already have moved.
 *
 * @param {import('./db.js').Scope} scope @param {string} store @param {string} type @param {any} record
 * @returns {Promise<any|null>}
 */
async function twinOnContentKey(scope, store, type, record) {
  if (!LIBRARY_TYPES.includes(type)) return null;
  const key = record.content?.id;
  if (typeof key !== 'string') return null;
  const twin = await scope.getByIndex(store, 'by_content_key', key);
  if (!twin || twin.record_id === record.record_id) return null;
  return twin;
}

/**
 * Write the reconciled record and retire the identity that lost.
 *
 * The loser's row is REMOVED rather than tombstoned. A tombstone is a statement that the coach
 * deleted something and it propagates as one; this is two names for one thing becoming one name, and
 * nothing about it should reach him as a deletion. Nothing is lost with the row: the content it held
 * is the content of the record being written, or it lost the last-write-wins comparison to it.
 *
 * @param {import('./db.js').Scope} scope @param {string} store @param {string} type
 * @param {any} twin @param {any} incoming @param {{overwrite?: boolean}} options
 * @returns {Promise<ApplyOutcome>}
 */
async function applyReconciliation(scope, store, type, twin, incoming, options) {
  const merged = options.overwrite === true
    // A restore or a reset says outright that what it carries replaces what is here, so the content
    // comparison is not asked — only the identity question is, and it is answered the same way.
    ? { ...incoming, record_id: reconcileOnContentKey(twin, incoming).record_id }
    : reconcileOnContentKey(twin, incoming);

  // Already reconciled on an earlier pass: the other device's area still carries its old identity and
  // will until it compacts, so this arrives again and again. Writing an identical record each time
  // would put an import entry in the log on every pass for a change nobody made.
  if (isSameStoredRecord(twin, merged)) {
    throw new NothingApplied({ outcome: APPLY.KEPT_LOCAL, record: twin });
  }

  assertValid(merged);
  const retired = merged.record_id === twin.record_id ? incoming.record_id : twin.record_id;
  if (retired === twin.record_id) await scope.delete(store, twin.record_id);
  await scope.put(store, merged);
  if (type === 'session') await rebuildParticipants(scope, merged);
  return { outcome: APPLY.RECONCILED, record: merged, retired_record_id: retired };
}

/**
 * Whether these two envelopes are the same stored thing, field for field.
 *
 * Field by field rather than by serialising both: two envelopes assembled by different spreads carry
 * the same fields in different orders, and a serialised comparison would call them different and
 * rewrite the record on every pass forever.
 *
 * @param {any} a @param {any} b @returns {boolean}
 */
function isSameStoredRecord(a, b) {
  return a.record_id === b.record_id && a.rev === b.rev && a.device === b.device
    && a.updated_at === b.updated_at && a.created_at === b.created_at
    && Boolean(a.deleted) === Boolean(b.deleted) && (a.deleted_at ?? null) === (b.deleted_at ?? null)
    && (a.resolved_from ?? null) === (b.resolved_from ?? null)
    && JSON.stringify(a.content ?? null) === JSON.stringify(b.content ?? null);
}

// ── module helpers ────────────────────────────────────────────────────────────────────────────

/**
 * The stores a write of this kind must hold open.
 *
 * A session write also touches the derived participants store, and a session-scoped write reads the
 * session to see whether it is live. Both are listed here rather than at each call site so that a
 * transaction can never be opened with too narrow a scope — which fails at the moment of writing,
 * with the coach watching.
 *
 * @param {string} type
 * @returns {string[]}
 */
export function storesFor(type) {
  const own = storeNameFor(type);
  if (type === 'session') return [own, PARTICIPANTS_STORE];
  if (SESSION_SCOPED_TYPES.includes(type)) return [own, RECORD_STORES.session];
  return [own];
}

/**
 * Rebuild the derived participant rows for a session, INSIDE the session's own transaction.
 *
 * The invariant that makes the derived store trustworthy: there is no code path that writes a
 * session without rebuilding these rows, because both happen in one commit or neither happens. A
 * later maintainer optimising the write path is exactly who would break this — the derivation would
 * then be a cache, and a cache over one shared database with two windows writing drifts.
 *
 * A tombstoned session yields no rows, so a deleted session leaves nothing behind in the index.
 *
 * @param {import('./db.js').Scope} scope
 * @param {any} record A session envelope.
 */
export async function rebuildParticipants(scope, record) {
  const existing = await scope.keysByIndex(
    PARTICIPANTS_STORE, 'by_session', scope.KeyRange.only(record.record_id),
  );
  for (const key of existing) await scope.delete(PARTICIPANTS_STORE, key);
  for (const row of participantRowsFor(record)) await scope.put(PARTICIPANTS_STORE, row);
}

/**
 * One row per (client, session), keyed so that a client's sessions are a contiguous range in time
 * order.
 *
 * The sort key resolves to when the session actually started, else when it was scheduled, else when
 * the record was created. It is never absent, because a compound key with a missing component
 * produces no index entry at all — a session would simply vanish from its clients' histories.
 *
 * @param {any} record A session envelope.
 * @returns {{client_id: string, sort_at: string, session_record_id: string}[]}
 */
export function participantRowsFor(record) {
  if (record.deleted || !record.content) return [];
  const sortAt = record.content.started_at || record.content.scheduled_at || record.created_at;
  const clientIds = Array.isArray(record.content.client_ids) ? record.content.client_ids : [];
  return clientIds.map((clientId) => ({
    client_id: clientId,
    sort_at: sortAt,
    session_record_id: record.record_id,
  }));
}

/** @param {any} record */
function sessionIdOf(record) {
  if (!SESSION_SCOPED_TYPES.includes(record.type)) return undefined;
  const id = record.content?.session_id;
  return typeof id === 'string' ? id : undefined;
}

/** @param {any} record */
function assertValid(record) {
  const { ok, issues } = validateRecord(record);
  if (!ok) {
    throw new StoreValidationError(
      `That ${record?.type || 'record'} cannot be saved as it stands.`, issues, { type: record?.type },
    );
  }
}

/** @param {string} type */
function assertKnownType(type) {
  if (!RECORD_TYPES.includes(type)) throw new Error(`"${type}" is not a record type.`);
}

/** @param {any} current @param {number|undefined} expectRev @param {string} type */
function assertExpectedRevision(current, expectRev, type) {
  if (expectRev === undefined || current.rev === expectRev) return;
  throw new StoreConflictError(
    `That ${type} was changed elsewhere while you were editing it. Reload it and apply your change again.`,
    { type, record_id: current.record_id, expected_rev: expectRev, actual_rev: current.rev },
  );
}

/** @param {string} type @param {string} recordId */
function notFound(type, recordId) {
  return new StoreNotFoundError(`No ${type} is stored with that identity.`, { type, record_id: recordId });
}
