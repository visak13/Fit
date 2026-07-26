/**
 * REMOVING A CLIENT — the ordinary path, and the deliberate one.
 *
 * ## Two operations, and they are not variations of each other
 *
 * **Archiving** is what happens when a client stops coming. The record stays, marked inactive, out
 * of the roster but still in the history. It is reversible, and it is the ordinary path.
 *
 * **Purging** is the deliberate one-click action: this client's records are removed from this device
 * outright, and a manifest is left behind so the same removal reaches the remote copy and its
 * backups. A departed client's clinical note must not live on in a backup forever.
 *
 * ## The two things that must BOTH hold
 *
 * A purge is worded as "remove everything", and a careless reading of that destroys somebody else's
 * history. Sessions are one routine and one to MANY clients, so:
 *
 *  1. **Nothing of the departed client remains.** Their client record, their performed records,
 *     their readings, their notes, their diet plans, and their rows in the derived index — all gone,
 *     with no tombstone left holding a payload.
 *  2. **No other client loses anything.** A SHARED session is not deleted. The departed client is
 *     removed from its participant set as a revision, and the other attendees keep the session,
 *     their own performed records, their own readings and their own notes. That session is THEIR
 *     history and it is not the departing client's to take with them.
 *
 * A session left with **no** remaining participants is removed, along with anything still pointing
 * at it — including a note that was about the session as a whole rather than about a person.
 *
 * ## The queue is one more place their detail lives
 *
 * Sweeping every record store is not enough, and that was measured rather than argued: a client
 * created, synchronised, purged and synchronised three more times left the stores and the remote
 * copies clean while **delivered outbox entries still carried the name, the general notes and the
 * readings in plain text**. Delivered entries are kept deliberately and pruned only by a caller who
 * decides to, so they accumulate — in the one store this purge did not touch.
 *
 * So the purge reaches into the queue too, in the same transaction, and by the same two rules: the
 * departed client comes out of every entry, and nothing of anybody else's goes with them. A queued
 * copy of a SHARED session is replaced by the revision made below rather than dropped. What that
 * costs, what it deliberately leaves alone, and the one case it refuses to decide silently are all in
 * `core/outbox/scrub.js`.
 *
 * ## Why a manifest rather than tombstones
 *
 * An ordinary deletion is a tombstone, which propagates by itself. A purge deliberately removes the
 * rows instead, because a tombstone is a record and this operation exists to leave no record. That
 * removes the thing that would have carried the news outward — so the news is carried explicitly, by
 * a manifest holding identities and nothing else.
 *
 * **The manifest contains no content.** No name, no note, no ciphertext: record identities, types and
 * revisions only. A manifest naming the client would reintroduce exactly what the purge removed, and
 * would then be synced. A test asserts this rather than trusting it.
 *
 * ## One transaction
 *
 * The whole purge commits at once or not at all. A half-purged client — records gone, manifest
 * missing — would be silently unrecoverable: the local rows are unrecoverable and nothing remains to
 * tell the remote copy, so the departed client's data would live on in the backup with no trace of
 * the intent to remove it. That is the single worst outcome available here, and one transaction is
 * what forecloses it.
 */

import { JOURNAL_KINDS, recordChange } from '../journal/journal.js';
import { newRecordId, reviseEnvelope, timestamp, validateRecord } from '../model/model.js';
import { scrubClientFromOutbox } from '../outbox/scrub.js';
import { runWrite } from './db.js';
import { StoreNotFoundError, StoreValidationError } from './errors.js';
import { prefixRange } from './keys.js';
import { rebuildParticipants } from './local-store.js';
import { DELETIONS_STORE, OUTBOX_STORE, PARTICIPANTS_STORE, RECORD_STORES } from './schema.js';

/** Bumped if the manifest's shape changes, so a synchronisation engine can tell. */
export const DELETION_MANIFEST_VERSION = 1;

/** Manifest states. `pending` is the only one the synchronisation engine acts on. */
export const DELETION_STATUSES = Object.freeze(['pending', 'propagated', 'failed']);

/** The record kinds that carry a single `client_id` and are swept by it. @type {readonly string[]} */
const CLIENT_OWNED_TYPES = Object.freeze(['performed-record', 'reading', 'session-note', 'diet-plan']);

/** Every store a purge touches. */
const PURGE_STORES = Object.freeze([
  RECORD_STORES.client,
  RECORD_STORES.session,
  RECORD_STORES['performed-record'],
  RECORD_STORES.reading,
  RECORD_STORES['session-note'],
  RECORD_STORES['diet-plan'],
  PARTICIPANTS_STORE,
  DELETIONS_STORE,
  // The queue is one more place the detail lives. It is held open in the SAME transaction as the
  // record stores, so there is no window in which the rows are gone and the queue still holds them.
  OUTBOX_STORE,
]);

/**
 * Archive a client: out of the roster, still in the history. The ordinary path.
 *
 * @param {import('./local-store.js').LocalStore} store
 * @param {string} clientId
 * @param {{now?: number|string|Date}} [options]
 * @returns {Promise<any>} the revised client record
 */
export async function archiveClient(store, clientId, options = {}) {
  return store.update('client', clientId, (content) => ({ ...content, active: false }), options);
}

/**
 * Un-archive a client.
 * @param {import('./local-store.js').LocalStore} store @param {string} clientId
 * @param {{now?: number|string|Date}} [options]
 * @returns {Promise<any>}
 */
export async function restoreClient(store, clientId, options = {}) {
  return store.update('client', clientId, (content) => ({ ...content, active: true }), options);
}

/**
 * @typedef {Object} DeletionManifest
 * @property {string} deletion_id
 * @property {number} manifest_version
 * @property {string} subject_client_id
 * @property {string} requested_at
 * @property {string} device
 * @property {'pending'|'propagated'|'failed'} status
 * @property {number} attempts
 * @property {string|null} last_error
 * @property {string|null} propagated_at
 * @property {{type: string, record_id: string}[]} removed Delete these remotely, and in archived copies.
 * @property {{type: string, record_id: string, rev: number}[]} revised Push these revisions instead.
 * @property {import('../outbox/scrub.js').OutboxScrubResult} outbox What the queue sweep did. LOCAL
 *   bookkeeping: it is identities and counts only, and the outward notice does not carry it, which is
 *   why {@link DELETION_MANIFEST_VERSION} is unchanged — that version describes what LEAVES the
 *   device, and what leaves the device is exactly what it was.
 * @property {{archived_copies: boolean, remote_backups: boolean}} sweep
 */

/**
 * Remove a client and everything of theirs from this device, and record what must be removed
 * elsewhere.
 *
 * @param {import('./local-store.js').LocalStore} store
 * @param {string} clientId
 * @param {{now?: number|string|Date}} [options]
 * @returns {Promise<DeletionManifest>} committed before this resolves.
 */
export async function purgeClient(store, clientId, options = {}) {
  const { now } = options;
  const at = timestamp(now);
  const device = store.device;
  // Minted out here, not inside the work: the work may repeat, and a second identity would mean the
  // retry wrote a different manifest from the one the first attempt built.
  const deletionId = newRecordId();

  const { result: manifest } = await recordChange(store, {
    stores: PURGE_STORES,
    // The one kind whose entry outlives everything it names. The purge removes the rows; the entry
    // stays, holding the departed client's identity and NOTHING else — no name, no note, no reading
    // — so the log can still answer "was this removal actually carried out" once there is nothing
    // left to look at. `JOURNAL.md` states that residual deliberately rather than sweeping the log
    // too, which would delete the evidence that the deletion happened.
    fields: {
      kind: JOURNAL_KINDS.RECORD_PURGED,
      subject: { type: 'client', record_id: clientId },
    },
    work: (scope) => purgeInScope(scope, { clientId, at, device, now, deletionId }),
  });

  store.coordinator.announce({
    kind: 'purge',
    device,
    subject_client_id: clientId,
    record_ids: manifest.removed.map((r) => r.record_id),
  });
  return manifest;
}

/**
 * The purge itself, inside a transaction somebody else opened.
 *
 * Split out from {@link purgeClient} because the entry recording the purge commits in the same
 * transaction, so the body is now a `work` callback rather than the whole of the function — and
 * because that callback **may run more than once**, if another window appends to this device's chain
 * in between. Everything here reads current state through `scope` and computes from it, so repeating
 * is free. The two values that are NOT re-derived — the instant and the manifest identity — are
 * passed in deliberately: a repeat that minted a second `deletion_id` would leave the retry writing
 * a different manifest from the one the first attempt built.
 *
 * @param {import('./db.js').Scope} scope
 * @param {{clientId: string, at: string, device: string, deletionId: string,
 *          now?: number|string|Date}} args
 * @returns {Promise<DeletionManifest>}
 */
async function purgeInScope(scope, { clientId, at, device, now, deletionId }) {
  const { KeyRange } = scope;
  /** @type {{type: string, record_id: string}[]} */
  const removed = [];
  /** @type {{type: string, record_id: string, rev: number}[]} */
  const revised = [];
  /** The revised envelopes themselves, for the queue sweep. Never leave this device. @type {any[]} */
  const revisedRecords = [];

  const client = await scope.get(RECORD_STORES.client, clientId);
  if (!client) {
    throw new StoreNotFoundError(
      'No client is stored with that identity, so there is nothing to remove.',
      { record_id: clientId },
    );
  }

  // ── 1. every row that belongs to this client alone ───────────────────────────────────────
  for (const type of CLIENT_OWNED_TYPES) {
    const storeName = RECORD_STORES[type];
    const keys = await scope.keysByIndex(storeName, 'by_client', KeyRange.only(clientId));
    for (const key of keys) {
      await scope.delete(storeName, key);
      removed.push({ type, record_id: key });
    }
  }

  // ── 2. sessions: revise the shared ones, remove the ones left with nobody ────────────────
  const sessionIds = await scope.keysByIndex(
    RECORD_STORES.session, 'by_client', KeyRange.only(clientId),
  );
  for (const sessionId of sessionIds) {
    const session = await scope.get(RECORD_STORES.session, sessionId);
    if (!session) continue;

    const remaining = (session.content?.client_ids || []).filter((id) => id !== clientId);

    if (remaining.length > 0) {
      // Somebody else's history. Take the departed client out of it and leave the rest alone.
      const next = reviseEnvelope(session, { ...session.content, client_ids: remaining }, { device, now });
      const { ok, issues } = validateRecord(next);
      if (!ok) {
        throw new StoreValidationError(
          'Removing this client from a shared session would leave the session invalid, so nothing was removed.',
          issues, { session_id: sessionId },
        );
      }
      await scope.put(RECORD_STORES.session, next);
      await rebuildParticipants(scope, next);
      revised.push({ type: 'session', record_id: sessionId, rev: next.rev });
      revisedRecords.push(next);
      continue;
    }

    // Nobody left in it. Remove the session and anything still pointing at it — including a note
    // that was about the session as a whole rather than about a person.
    for (const type of ['performed-record', 'reading', 'session-note']) {
      const storeName = RECORD_STORES[type];
      const keys = await scope.keysByIndex(storeName, 'by_session', KeyRange.only(sessionId));
      for (const key of keys) {
        await scope.delete(storeName, key);
        removed.push({ type, record_id: key });
      }
    }
    const rows = await scope.keysByIndex(
      PARTICIPANTS_STORE, 'by_session', KeyRange.only(sessionId),
    );
    for (const key of rows) await scope.delete(PARTICIPANTS_STORE, key);

    await scope.delete(RECORD_STORES.session, sessionId);
    removed.push({ type: 'session', record_id: sessionId });
  }

  // ── 3. the derived index rows for this client ────────────────────────────────────────────
  const participantKeys = await scope.keysInRange(
    PARTICIPANTS_STORE, prefixRange(KeyRange, [clientId]),
  );
  for (const key of participantKeys) await scope.delete(PARTICIPANTS_STORE, key);

  // ── 4. the client record itself, last, so a failure above leaves it findable ─────────────
  await scope.delete(RECORD_STORES.client, clientId);
  removed.push({ type: 'client', record_id: clientId });

  // ── 5. the queue, which is where their detail was living on ──────────────────────────────
  // After the sweep above, so the removal list is complete: an entry is judged against what was
  // actually removed as well as against the record in front of it.
  const outbox = await scrubClientFromOutbox(scope, {
    clientId, removed, revised: revisedRecords,
  });

  // ── 6. the manifest: identities only, no content of any kind ─────────────────────────────
  /** @type {DeletionManifest} */
  const record = {
    deletion_id: deletionId,
    manifest_version: DELETION_MANIFEST_VERSION,
    subject_client_id: clientId,
    requested_at: at,
    device,
    status: 'pending',
    attempts: 0,
    last_error: null,
    propagated_at: null,
    removed,
    revised,
    outbox,
    sweep: { archived_copies: true, remote_backups: true },
  };
  await scope.put(DELETIONS_STORE, record);
  return record;
}

/**
 * Deletions still to be propagated outward.
 *
 * This is the surface the synchronisation engine consumes. It is paged like everything else, because
 * a restored backup could produce many at once.
 *
 * @param {import('./local-store.js').LocalStore} store
 * @param {{limit?: number, after?: string|null}} [options]
 * @returns {Promise<import('./queries.js').PageResult>}
 */
export async function pendingDeletions(store, options = {}) {
  const { limit = 25, after = null } = options;
  return store.read(DELETIONS_STORE, (scope) => scope.page({
    store: DELETIONS_STORE,
    index: 'by_status',
    range: scope.KeyRange.only('pending'),
    limit,
    after,
  }));
}

/**
 * Whether this client has already been purged from this device.
 * @param {import('./local-store.js').LocalStore} store @param {string} clientId
 * @returns {Promise<DeletionManifest|undefined>}
 */
export async function deletionForClient(store, clientId) {
  return store.read(DELETIONS_STORE, (scope) => scope.getByIndex(DELETIONS_STORE, 'by_subject_client', clientId));
}

/**
 * Record that a deletion reached the remote copy.
 *
 * Kept rather than removed: the manifest becomes the evidence that the removal happened and
 * completed, which is what makes the claim "their note is not in the backup any more" checkable
 * rather than merely intended.
 *
 * @param {import('./local-store.js').LocalStore} store @param {string} deletionId
 * @param {{now?: number|string|Date}} [options]
 * @returns {Promise<DeletionManifest>}
 */
export async function markDeletionPropagated(store, deletionId, options = {}) {
  return updateManifest(store, deletionId, (record) => ({
    ...record,
    status: 'propagated',
    propagated_at: timestamp(options.now),
    last_error: null,
  }));
}

/**
 * Record that propagating a deletion failed, and why.
 *
 * It stays `pending` unless explicitly given up on, because a deletion that quietly stopped being
 * retried is a departed client's note living on in a backup with nothing left saying it should not.
 *
 * @param {import('./local-store.js').LocalStore} store @param {string} deletionId
 * @param {string} reason
 * @param {{giveUp?: boolean}} [options]
 * @returns {Promise<DeletionManifest>}
 */
export async function markDeletionFailed(store, deletionId, reason, options = {}) {
  return updateManifest(store, deletionId, (record) => ({
    ...record,
    status: options.giveUp ? 'failed' : 'pending',
    attempts: (record.attempts || 0) + 1,
    last_error: String(reason),
  }));
}

/**
 * @param {import('./local-store.js').LocalStore} store @param {string} deletionId
 * @param {(record: DeletionManifest) => DeletionManifest} produce
 * @returns {Promise<DeletionManifest>}
 */
async function updateManifest(store, deletionId, produce) {
  return runWrite(store.handle, DELETIONS_STORE, async (scope) => {
    const current = await scope.get(DELETIONS_STORE, deletionId);
    if (!current) {
      throw new StoreNotFoundError('No deletion is recorded with that identity.', { deletion_id: deletionId });
    }
    const next = produce(current);
    await scope.put(DELETIONS_STORE, next);
    return next;
  });
}
