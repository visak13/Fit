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
 */

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
    const stored = await runWrite(this.handle, storesFor(type), async (scope) => {
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

    const stored = await runWrite(this.handle, storesFor(type), async (scope) => {
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

    const stored = await runWrite(this.handle, storesFor(type), async (scope) => {
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
   * device — under the model's last-write-wins rule.
   *
   * The rule is not re-implemented here: `supersedes` in the model is the whole of it, so both
   * devices resolve every comparison identically and cannot converge on two different records.
   *
   * @param {any} record An envelope.
   * @returns {Promise<{applied: boolean, record: any}>} `applied: false` means the local revision
   *   was already the winner and nothing was written.
   */
  async putRecord(record) {
    assertValid(record);
    const type = record.type;
    const store = storeNameFor(type);

    const result = await runWrite(this.handle, storesFor(type), async (scope) => {
      const current = await scope.get(store, record.record_id);
      if (current && !supersedes(current, record)) {
        return { applied: false, record: laterOf(current, record) };
      }
      await scope.put(store, record);
      if (type === 'session') await rebuildParticipants(scope, record);
      return { applied: true, record };
    });

    if (result.applied) {
      this.coordinator.announce({
        kind: 'put', type, record_id: record.record_id, rev: record.rev, device: this.device,
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

    const result = await runWrite(this.handle, stores, async (scope) => {
      let written = 0;
      let skipped = 0;
      for (const record of records) {
        const store = storeNameFor(record.type);
        if (!overwrite) {
          const current = await scope.get(store, record.record_id);
          if (current && !supersedes(current, record)) { skipped += 1; continue; }
        }
        await scope.put(store, record);
        if (record.type === 'session') await rebuildParticipants(scope, record);
        written += 1;
      }
      return { written, skipped };
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
