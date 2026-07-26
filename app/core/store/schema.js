/**
 * THE DATABASE SHAPE — one object store per record kind, and the indexes each one actually needs.
 *
 * ## Why one store per kind rather than one store for everything
 *
 * A single store keyed on record identity would need a type index and would put every query
 * behind it, so listing clients would walk sessions. Separate stores keep every query's cost
 * proportional to the kind it asks about, which is the whole of the graceful-degradation
 * requirement: volumes are UNKNOWN and cannot be clarified, so nothing here may assume a small
 * practice.
 *
 * ## Every index exists for a named query
 *
 * An index is not free — it is maintained on every write — so each one below names the question
 * it answers. If a query is not listed in `queries.js`, its index should not be here.
 *
 * ## The two derived stores, and why they are not a cache
 *
 * `session_participants` exists because the platform cannot index what is needed: a session
 * carries a SET of clients, and there is no compound multi-entry index, so "this client's
 * sessions in time order" is unanswerable from the sessions store alone. The derived store holds
 * one row per (client, session) keyed `[client_id, sort_at, session_record_id]`, which makes both
 * ordered paging and most-recent-session a bounded range read.
 *
 * **It is written in the SAME transaction as the session it derives from, always.** That is the
 * invariant that keeps it from being a cache that can drift: there is no code path that writes a
 * session without rebuilding its participant rows, because both happen inside one commit or
 * neither happens. A later maintainer optimising the write path is exactly who would break this,
 * so it is stated here, in `STORE.md`, and asserted by a test.
 *
 * `deletions` is the manifest the synchronisation engine reads. Per-client deletion removes rows
 * outright rather than leaving tombstones, so without a manifest there would be nothing left to
 * tell the remote copy what went — and a departed client's clinical note would live on in backups.
 */

import { RECORD_TYPES } from '../model/model.js';

/** The database name. One database per installation; two windows share it. */
export const DB_NAME = 'fit';

/** Current schema version. Bumped when a store or index is added, with a migration beside it. */
export const DB_VERSION = 3;

/** The derived store answering "this client's sessions, in time order". */
export const PARTICIPANTS_STORE = 'session_participants';

/** The manifest of local deletions awaiting outward propagation. */
export const DELETIONS_STORE = 'deletions';

/** Small singleton values: the device tag, the schema stamp, sync bookkeeping. */
export const META_STORE = 'meta';

/**
 * The durable queue every remote-bound write passes through first.
 *
 * It lives in this database, in this schema, rather than in a store of its own, for one reason: a
 * queue entry must commit in the SAME transaction discipline as the data it describes, through the
 * one writable door in `db.js`. A separate mechanism would be a second door, and the guarantee that
 * a failed credential is a delay and never a loss rests entirely on there being only one.
 *
 * `core/outbox` owns its shape and its behaviour; this file owns only the fact that the store and
 * its indexes exist, because {@link ALL_STORES} is what a transaction is checked against.
 */
export const OUTBOX_STORE = 'outbox';

/**
 * The append-only event log: what was let in, what changed, what left, what synchronised, what
 * happened to the keys.
 *
 * `core/journal` owns its shape, its vocabulary and its chain; this file owns only the fact that the
 * store exists, because {@link ALL_STORES} is what a transaction is checked against.
 *
 * ## Not a record kind, deliberately
 *
 * It is absent from {@link RECORD_STORES} and present here and in {@link ALL_STORES}, following
 * {@link OUTBOX_STORE}, {@link DELETIONS_STORE} and {@link META_STORE}. A journal entry is not an
 * envelope: it has no `record_id` of its own, no revision, no tombstone, and it is never synchronised
 * as a record. Putting it in `RECORD_STORES` would also break the bijection {@link schemaCoverage}
 * asserts between the model's kinds and the mapped stores.
 *
 * ## Why the KEY is `[device, seq]` and there is not one index on this store
 *
 * The log's chain is per device — two devices append independently with no coordinator, so `seq`
 * counts from 1 on each. Every question this store is asked is therefore a question about ONE
 * device's chain in sequence order:
 *
 *  - *the latest entry on this device*, which every append must link to — one step of a REVERSE
 *    cursor over the device's prefix;
 *  - *this device's chain from the oldest*, which verification walks — the same prefix, forward,
 *    a page at a time;
 *  - *the oldest entries, to discard* — the front of that same range;
 *  - *how many entries this device holds* — a count over that range.
 *
 * A compound primary key answers all four by itself, so an index beside it would be maintained on
 * every write to answer nothing. The discipline this file is written to is that an index names the
 * question it answers; the honest consequence of that rule here is no index at all.
 *
 * **And there is no flag anywhere in it.** A boolean is not a valid key on this platform: an index on
 * one silently holds zero entries while every query against it returns empty and looks perfectly
 * reasonable — measured twice on this build, on the outbox and on listing clients by `active`. The
 * log therefore carries its result in the KIND (`auth.unlocked` against `auth.unlock_refused`, both
 * keyable text) rather than in an `ok` field, and its ordering in the key rather than in a
 * `pruned`-style marker. See the note on `by_status_seq` below, and `core/journal/JOURNAL.md`.
 */
export const JOURNAL_STORE = 'journal';

/**
 * Record kind → object store name.
 *
 * Spelled out rather than derived from the kind by rule, so that a kind added to the model
 * without a store here fails loudly at open instead of writing into a store that does not exist.
 * @type {Readonly<Record<string, string>>}
 */
export const RECORD_STORES = Object.freeze({
  exercise: 'exercises',
  routine: 'routines',
  'intensity-pattern': 'intensity_patterns',
  client: 'clients',
  session: 'sessions',
  'performed-record': 'performed_records',
  reading: 'readings',
  'session-note': 'session_notes',
  'diet-plan': 'diet_plans',
});

/** Every object store the database holds. @type {readonly string[]} */
export const ALL_STORES = Object.freeze([
  ...Object.values(RECORD_STORES), PARTICIPANTS_STORE, DELETIONS_STORE, META_STORE, OUTBOX_STORE,
  JOURNAL_STORE,
]);

/**
 * The store name for a record kind.
 * @param {string} type
 * @returns {string}
 */
export function storeNameFor(type) {
  const name = RECORD_STORES[type];
  if (!name) {
    throw new Error(
      `No object store is defined for record type "${type}". `
      + 'A kind added to the model needs a store and a schema version here.',
    );
  }
  return name;
}

/**
 * Index on the envelope's own `updated_at`, present on every record store.
 *
 * It answers "what changed since" — which the outbox and the synchronisation engine both need,
 * and which must not be answered by reading every record and comparing. It indexes an ENVELOPE
 * field rather than a content one on purpose: it stays valid on a tombstone, whose content is
 * null and whose content-derived index entries have all gone.
 */
const UPDATED_AT_INDEX = Object.freeze({
  name: 'by_updated_at',
  keyPath: 'updated_at',
  answers: 'what changed since — for the outbox and the synchronisation engine, without reading every record',
});

/**
 * The full schema, as data.
 *
 * Written as a value rather than a sequence of calls so that the migration can be driven by it,
 * a test can assert against it, and the diagnostics screen can show what exists.
 *
 * @type {readonly {store: string, keyPath: string|string[], since: number, indexes: readonly {name: string, keyPath: string|string[], options?: IDBIndexParameters, answers: string}[]}[]}
 */
export const SCHEMA = Object.freeze([
  {
    store: RECORD_STORES.exercise,
    keyPath: 'record_id',
    since: 1,
    indexes: [
      { name: 'by_content_key', keyPath: 'content.id', options: { unique: true }, answers: 'the exercise a routine entry names, by content key' },
      { name: 'by_movement_pattern', keyPath: 'content.movement_pattern', answers: 'substitution candidates of the same movement pattern' },
      { name: 'by_provenance', keyPath: 'content.provenance', answers: 'what the admin reset may revert and what it must leave alone' },
      UPDATED_AT_INDEX,
    ],
  },
  {
    store: RECORD_STORES.routine,
    keyPath: 'record_id',
    since: 1,
    indexes: [
      { name: 'by_content_key', keyPath: 'content.id', options: { unique: true }, answers: 'the routine a session names, by content key' },
      { name: 'by_split_day', keyPath: 'content.split_day', answers: 'the week, in split order' },
      { name: 'by_provenance', keyPath: 'content.provenance', answers: 'what the admin reset may revert' },
      UPDATED_AT_INDEX,
    ],
  },
  {
    store: RECORD_STORES['intensity-pattern'],
    keyPath: 'record_id',
    since: 1,
    indexes: [
      { name: 'by_content_key', keyPath: 'content.id', options: { unique: true }, answers: 'the pattern the adapter was asked for, by content key' },
      { name: 'by_provenance', keyPath: 'content.provenance', answers: 'what the admin reset may revert' },
      UPDATED_AT_INDEX,
    ],
  },
  {
    store: RECORD_STORES.client,
    keyPath: 'record_id',
    since: 1,
    indexes: [
      { name: 'by_name', keyPath: 'content.name', answers: 'the roster, alphabetically, one page at a time' },
      UPDATED_AT_INDEX,
    ],
  },
  {
    store: RECORD_STORES.session,
    keyPath: 'record_id',
    since: 1,
    indexes: [
      { name: 'by_client', keyPath: 'content.client_ids', options: { multiEntry: true }, answers: 'does this client appear in this session at all — membership, not order' },
      { name: 'by_routine', keyPath: 'content.routine_id', answers: 'sessions that used a routine' },
      { name: 'by_status', keyPath: 'content.status', answers: 'sessions left in progress or interrupted, for the resume prompt' },
      { name: 'by_scheduled_at', keyPath: 'content.scheduled_at', answers: 'the calendar' },
      { name: 'by_started_at', keyPath: 'content.started_at', answers: 'what actually ran, in time order' },
      UPDATED_AT_INDEX,
    ],
  },
  {
    store: RECORD_STORES['performed-record'],
    keyPath: 'record_id',
    since: 1,
    indexes: [
      { name: 'by_session_client_position', keyPath: ['content.session_id', 'content.client_id', 'content.position'], answers: 'what this client did in this session, in order — the previous-session panel' },
      { name: 'by_client_recorded_at', keyPath: ['content.client_id', 'content.recorded_at'], answers: 'this client history, paged, for the progress view' },
      { name: 'by_session', keyPath: 'content.session_id', answers: 'everything performed in a session' },
      { name: 'by_client', keyPath: 'content.client_id', answers: 'every row belonging to a client — the deletion sweep' },
      UPDATED_AT_INDEX,
    ],
  },
  {
    store: RECORD_STORES.reading,
    keyPath: 'record_id',
    since: 1,
    indexes: [
      { name: 'by_client_taken_at', keyPath: ['content.client_id', 'content.taken_at'], answers: 'readings over time for one client' },
      { name: 'by_client_kind_taken_at', keyPath: ['content.client_id', 'content.kind', 'content.taken_at'], answers: 'one trend line — heart rate, plank hold — without reading the others' },
      { name: 'by_session', keyPath: 'content.session_id', answers: 'readings taken during a session' },
      { name: 'by_client', keyPath: 'content.client_id', answers: 'every row belonging to a client — the deletion sweep' },
      UPDATED_AT_INDEX,
    ],
  },
  {
    store: RECORD_STORES['session-note'],
    keyPath: 'record_id',
    since: 1,
    indexes: [
      { name: 'by_session', keyPath: 'content.session_id', answers: 'notes on a session, including the ones about the session as a whole' },
      { name: 'by_client_taken_at', keyPath: ['content.client_id', 'content.taken_at'], answers: 'notes that belong to one client, in time order' },
      { name: 'by_client', keyPath: 'content.client_id', answers: 'every row belonging to a client — the deletion sweep' },
      UPDATED_AT_INDEX,
    ],
  },
  {
    store: RECORD_STORES['diet-plan'],
    keyPath: 'record_id',
    since: 1,
    indexes: [
      { name: 'by_client_status', keyPath: ['content.client_id', 'content.status'], answers: 'the plan a client follows now, without reading their history' },
      { name: 'by_client', keyPath: 'content.client_id', answers: 'a client plan history, and the deletion sweep' },
      UPDATED_AT_INDEX,
    ],
  },
  {
    store: PARTICIPANTS_STORE,
    keyPath: ['client_id', 'sort_at', 'session_record_id'],
    since: 1,
    indexes: [
      { name: 'by_session', keyPath: 'session_record_id', answers: 'the rows to rebuild or drop when a session changes' },
    ],
  },
  {
    store: DELETIONS_STORE,
    keyPath: 'deletion_id',
    since: 1,
    indexes: [
      { name: 'by_status', keyPath: 'status', answers: 'deletions still to be propagated outward' },
      { name: 'by_subject_client', keyPath: 'subject_client_id', answers: 'whether this client has already been purged' },
    ],
  },
  {
    store: META_STORE,
    keyPath: 'key',
    since: 1,
    indexes: [],
  },
  {
    store: OUTBOX_STORE,
    keyPath: 'entry_id',
    since: 2,
    indexes: [
      // ['status', 'seq'] and NOT a flag. A boolean is not a valid key here, so an index on
      // `pending` would hold zero entries and every query against it would come back empty while
      // looking perfectly reasonable — measured on this build. The status is keyable text, and the
      // sequence beside it makes "the pending entries, oldest first" one contiguous range.
      { name: 'by_status_seq', keyPath: ['status', 'seq'], answers: 'the queue in replay order, and the oldest pending entry, per status' },
      { name: 'by_idempotency_key', keyPath: 'idempotency_key', options: { unique: true }, answers: 'has this exact delivery already been queued or already landed' },
    ],
  },
  {
    store: JOURNAL_STORE,
    // [device, seq] and no index beside it. The chain is per device and every question asked of this
    // store is "one device's chain, in order" — see the note on JOURNAL_STORE above for the four of
    // them and for why an index here would be maintained on every write to answer nothing.
    keyPath: ['device', 'seq'],
    since: 3,
    indexes: [],
  },
]);

/**
 * Apply the schema during a version change.
 *
 * Idempotent per version: only stores and indexes not already present are created, so a database
 * upgraded from an older version and one created fresh end up identical. Later versions add a
 * `since` above and, where data must be reshaped, a step in {@link MIGRATIONS}.
 *
 * @param {IDBDatabase} db
 * @param {IDBTransaction} tx The version-change transaction.
 * @param {number} fromVersion 0 for a fresh database.
 */
export function applySchema(db, tx, fromVersion) {
  for (const spec of SCHEMA) {
    const store = db.objectStoreNames.contains(spec.store)
      ? tx.objectStore(spec.store)
      : db.createObjectStore(spec.store, { keyPath: spec.keyPath });

    const existing = new Set(Array.from(store.indexNames));
    for (const index of spec.indexes) {
      if (existing.has(index.name)) continue;
      store.createIndex(index.name, index.keyPath, index.options || {});
    }
  }

  for (const migration of MIGRATIONS) {
    if (migration.to > fromVersion && migration.to <= DB_VERSION) migration.run(db, tx);
  }
}

/**
 * Data reshaping steps, in version order.
 *
 * Empty at version 1, and deliberately present anyway: the first person who needs one should find
 * the seam rather than invent it, because a migration written ad hoc inside the upgrade handler is
 * how a store loses data.
 *
 * **Still empty at version 3, and that is a decision rather than an omission.** Version 3 adds the
 * journal store, which starts empty: no existing row changes shape, moves store or acquires a field,
 * so there is nothing to reshape. `applySchema` creates it from the `since: 3` entry above and a
 * database upgraded from version 2 ends up identical to one created fresh. A migration step that
 * reshaped nothing would be a step every later upgrade has to read past and reason about.
 *
 * @type {readonly {to: number, run: (db: IDBDatabase, tx: IDBTransaction) => void}[]}
 */
export const MIGRATIONS = Object.freeze([]);

/**
 * Every record kind in the model has a store, and every store belongs to a kind.
 *
 * Asserted by a test rather than trusted: a kind added to the model and not here would otherwise
 * fail at the first write, in front of the coach.
 * @returns {{missingStores: string[], orphanStores: string[]}}
 */
export function schemaCoverage() {
  const mapped = Object.keys(RECORD_STORES);
  const defined = new Set(SCHEMA.map((s) => s.store));
  return {
    missingStores: RECORD_TYPES.filter((t) => !mapped.includes(t)),
    orphanStores: mapped.filter((t) => !defined.has(RECORD_STORES[t])),
  };
}
