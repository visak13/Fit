/**
 * TAKING A DEPARTED CLIENT OUT OF THE QUEUE.
 *
 * ## The gap this closes, and why neither half was wrong on its own
 *
 * A per-client purge removes the client's rows from every record store and leaves a manifest so the
 * removal reaches the remote copies and their backups. It swept every store except the one that
 * accumulates by design: **the outbox**. A delivered entry is KEPT deliberately — it is the evidence
 * a delivery happened, and it is the local half of the duplicate defence — and the only prune in the
 * build was caller-owned with no caller. Both halves were right about their own concern. Between them
 * sat a queue holding, for ever, the departed client's name, general notes and readings in plain
 * text, in a store nothing swept.
 *
 * The retention half has since been rebuilt: the bound is a COUNT applied inside `recordDelivered`'s
 * own transaction (`retention.js`), so it can no longer be declined. That does NOT make this scrub
 * redundant and must never be read as doing so — a bound removes the OLDEST evidence when new
 * deliveries arrive, and a departed client's data has to leave when the coach deletes them, not when
 * two hundred more deliveries happen to push it out.
 *
 * Measured, not theorised: a client created, synchronised, purged and synchronised three more times
 * left the stores and the remote copies clean while three delivered entries still carried the name
 * and the note text.
 *
 * So the purge now reaches in here, inside its own transaction, and the queue is treated as one more
 * place the detail lives.
 *
 * ## The one place this layer looks inside a payload — declared, and bounded
 *
 * Everywhere else the outbox holds `payload` as opaque text: it never encrypts, decrypts, inspects,
 * parses or logs it, and that is what lets ciphertext pass through untouched. This function is the
 * single deliberate exception, and it is bounded three ways:
 *
 *  1. it runs ONLY as part of a purge, never on any delivery path;
 *  2. it parses a payload only far enough to see whether it is one of **our own** synchronisation
 *     documents — a JSON object with a `document_version` and a list of `records`. Anything else is
 *     {@link OPAQUE} and is never parsed further, never rewritten and never inspected field by field;
 *  3. it reads only the envelope fields it must — identity, and the client a record belongs to. It
 *     does not decrypt, and a sealed value is copied or dropped whole, never opened.
 *
 * An opaque payload is therefore handled by IDENTITY alone, from the entry's `refs`.
 *
 * ## Three ways a fix here becomes a worse defect than the one it closed
 *
 * **This deletes data.** So:
 *
 * 1. **Another client's work must survive.** An entry is rewritten record by record, not judged as a
 *    whole: the departed client's records come out, everything else stays exactly as it was, and an
 *    entry that turns out to hold nothing of theirs is not written at all.
 *
 * 2. **A shared session belongs to its other attendees.** A queued copy of a session the departed
 *    client shared is REPLACED with the revision the purge just made — the same session, minus them —
 *    rather than dropped. Dropping it would take the other attendees' copy of their own session out
 *    of work that had not been delivered yet.
 *
 * 3. **Replay must survive.** `entry_id`, `seq`, `idempotency_key`, `operation`, `name`,
 *    `target_file_id` and `status` are never touched, so an entry that was deliverable before is
 *    deliverable after: same order, same recognition of its own earlier write, same idempotency. Only
 *    `payload` and `refs` change. **A cleaned entry stays replayable; it is not removed** — with one
 *    exception, below, where there is nothing left that could be replayed.
 *
 * ## The choice between "still replayable" and "removed outright"
 *
 * For every entry carrying one of our documents the choice is **still replayable**, including when the
 * scrub empties the document. An empty document is a valid document and delivering one is harmless,
 * whereas removing an undelivered entry would drop it out of the sequence and — worse — remove the
 * queued row that stops a re-enqueue of the same idempotency key from queueing a second copy.
 * Keeping it costs a few bytes; removing it risks a duplicate, which is the failure this queue exists
 * to prevent.
 *
 * The exception is an entry whose payload is opaque and whose `refs` name the departed client and
 * NOBODY ELSE. It cannot be cleaned, there is nothing in it but theirs, so it is **removed outright**.
 *
 * ## What is surfaced rather than chosen silently
 *
 * An opaque payload whose refs name the departed client AND somebody else cannot be cleaned without
 * destroying the other client's data. Neither answer is ours to pick quietly, so the entry is left
 * exactly as it is and reported in the purge's own result as `unresolved`, by identity. Nothing in
 * this core produces such an entry today — every payload it queues is one of our documents — so this
 * is a declared boundary with a test on it, not a live path.
 */

import { OUTBOX_STORE } from '../store/schema.js';
import { validateEntry } from './entry.js';
import { OutboxEntryInvalid } from './errors.js';

/** How the payload of one entry was understood. Declared so the outcome can be asserted. */
export const PAYLOAD = Object.freeze({
  /** No payload at all — a removal carries an identifier and nothing else. */
  NONE: 'none',
  /** One of our own synchronisation documents: scrubbable record by record. */
  DOCUMENT: 'document',
  /** Not ours. Never parsed further, never rewritten; handled by identity alone. */
  OPAQUE: 'opaque',
});

/** Why an entry could not be cleaned. Codes, not sentences: this goes in a manifest. */
export const UNRESOLVED = Object.freeze({
  /** Opaque payload naming the departed client and somebody else. Left alone, and reported. */
  OPAQUE_SHARED: 'opaque_payload_shared_with_another_client',
  /** A session the departed client was in, with no revision from this purge to put in its place. */
  NO_REVISION: 'shared_session_without_a_revision',
});

/**
 * How many entries one read of the queue takes. Bounded like every other read in this core: a device
 * that has been offline for a fortnight may hold a great many entries.
 */
export const SCRUB_PAGE = 100;

/**
 * Is this text one of our synchronisation documents?
 *
 * Deliberately narrow. A payload that is JSON but not ours — someone else's document, a sealed
 * value that happens to parse — is NOT a document here, and nothing further is read from it.
 *
 * @param {string|null} payload
 * @returns {{kind: string, document: any}}
 */
export function readPayload(payload) {
  if (typeof payload !== 'string') return { kind: PAYLOAD.NONE, document: null };
  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { kind: PAYLOAD.OPAQUE, document: null };
  }
  const ours = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    && typeof parsed.document_version === 'number' && Array.isArray(parsed.records);
  return ours ? { kind: PAYLOAD.DOCUMENT, document: parsed } : { kind: PAYLOAD.OPAQUE, document: null };
}

/**
 * Does this record belong to the departed client?
 *
 * Answered from the record itself rather than only from the manifest, because a payload can hold a
 * copy of a row that was already deleted before the purge and so is on no removal list.
 *
 * @param {any} record @param {string} clientId @param {Set<string>} removedIds
 * @returns {boolean}
 */
function isTheirs(record, clientId, removedIds) {
  if (!record || typeof record !== 'object') return false;
  if (record.record_id === clientId) return true;
  if (removedIds.has(record.record_id)) return true;
  return record.content?.client_id === clientId;
}

/**
 * Rewrite one document with the departed client taken out of it.
 *
 * @param {any} document
 * @param {{clientId: string, removedIds: Set<string>, revised: Map<string, any>}} ctx
 * @returns {{document: any, dropped: string[], replaced: string[], unresolved: string[], changed: boolean}}
 */
export function scrubDocument(document, ctx) {
  /** @type {string[]} */ const dropped = [];
  /** @type {string[]} */ const replaced = [];
  /** @type {string[]} */ const unresolved = [];
  /** @type {any[]} */ const kept = [];

  for (const record of document.records) {
    if (isTheirs(record, ctx.clientId, ctx.removedIds)) {
      dropped.push(record?.record_id);
      continue;
    }

    // A session they shared. It is not theirs to take with them, so it is replaced by the revision
    // the purge just wrote — the same session, without them — and not dropped.
    const participants = record?.content?.client_ids;
    if (Array.isArray(participants) && participants.includes(ctx.clientId)) {
      const revision = ctx.revised.get(record.record_id);
      if (revision) {
        kept.push(revision);
        replaced.push(record.record_id);
        continue;
      }
      // No revision exists for it and it is not on the removal list either, so this copy names them
      // and there is nothing to put in its place. Dropped — the queued copy is not the authority for
      // anybody's session; the local store is, and it is pushed by the pass that follows — and
      // reported rather than done quietly.
      dropped.push(record.record_id);
      unresolved.push(record.record_id);
      continue;
    }

    kept.push(record);
  }

  const changed = dropped.length > 0 || replaced.length > 0;
  return {
    document: changed ? { ...document, records: kept } : document,
    dropped, replaced, unresolved, changed,
  };
}

/**
 * @typedef {Object} OutboxScrubResult
 * @property {number} inspected  Entries read.
 * @property {number} rewritten  Entries whose payload had the departed client taken out of it.
 * @property {number} removed    Entries removed outright, having held nothing else.
 * @property {{entry_id: string, why: string, record_ids: string[]}[]} unresolved
 *   Identities only, so this can travel in a manifest that carries no content.
 */

/**
 * Take a departed client out of every entry on the queue.
 *
 * Called from inside the purge's own transaction, with its scope: the queue is swept in the SAME
 * commit as the record stores, so there is no window in which the rows are gone and the queue still
 * holds them, and a failure anywhere leaves everything as it was.
 *
 * @param {import('../store/db.js').Scope} scope
 * @param {{clientId: string, removed?: readonly {record_id: string}[],
 *          revised?: readonly any[], pageSize?: number}} args
 *   `revised` is the revised ENVELOPES the purge wrote, not the manifest's identity rows.
 * @returns {Promise<OutboxScrubResult>}
 */
export async function scrubClientFromOutbox(scope, args) {
  const clientId = args.clientId;
  const removedIds = new Set((args.removed || []).map((r) => r.record_id));
  const revised = new Map((args.revised || []).map((r) => [r.record_id, r]));
  const pageSize = args.pageSize || SCRUB_PAGE;
  const ctx = { clientId, removedIds, revised };

  /** @type {OutboxScrubResult} */
  const result = { inspected: 0, rewritten: 0, removed: 0, unresolved: [] };

  let cursor = null;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const page = await scope.page({ store: OUTBOX_STORE, limit: pageSize, after: cursor });

    for (const entry of page.items) {
      result.inspected += 1;
      const { kind, document } = readPayload(entry.payload);

      if (kind === PAYLOAD.NONE) continue;

      if (kind === PAYLOAD.OPAQUE) {
        const refs = entry.refs || [];
        const theirs = refs.filter((id) => id === clientId || removedIds.has(id));
        if (theirs.length === 0) continue;
        if (theirs.length === refs.length) {
          // Nothing in it but theirs, and it cannot be cleaned. Removed outright.
          // eslint-disable-next-line no-await-in-loop
          await scope.delete(OUTBOX_STORE, entry.entry_id);
          result.removed += 1;
          continue;
        }
        // It holds somebody else's data too and we cannot see inside it. Neither destroying it nor
        // leaving it is ours to choose quietly, so it is left and said out loud.
        result.unresolved.push({
          entry_id: entry.entry_id, why: UNRESOLVED.OPAQUE_SHARED, record_ids: theirs,
        });
        continue;
      }

      const scrubbed = scrubDocument(document, ctx);
      if (!scrubbed.changed) continue;

      const droppedIds = new Set(scrubbed.dropped);
      const next = {
        ...entry,
        payload: JSON.stringify(scrubbed.document),
        refs: (entry.refs || []).filter((id) => !droppedIds.has(id)),
      };

      const { ok, issues } = validateEntry(next);
      if (!ok) {
        // Aborts the whole purge. A half-formed entry that the queue would try and fail to deliver
        // for ever is worse than a purge that did not happen and says so.
        throw new OutboxEntryInvalid(
          'Removing the departed client from a queued delivery would leave it unable to be delivered, so nothing was removed.',
          issues, { entry_id: entry.entry_id, operation: entry.operation },
        );
      }
      // eslint-disable-next-line no-await-in-loop
      await scope.put(OUTBOX_STORE, next);
      result.rewritten += 1;

      for (const recordId of scrubbed.unresolved) {
        result.unresolved.push({
          entry_id: entry.entry_id, why: UNRESOLVED.NO_REVISION, record_ids: [recordId],
        });
      }
    }

    if (page.done || page.items.length === 0) break;
    cursor = page.cursor;
  }

  return result;
}
