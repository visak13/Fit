/**
 * DELIVERING THE QUEUE — and the one thing this file exists to make IMPOSSIBLE.
 *
 * ## A best-effort flush can never report a completed synchronisation
 *
 * When the application is being backgrounded, flushing what is queued is worth attempting. On the
 * weaker mobile platform the operating system may kill the tab mid-flight, and there is no way to ask
 * it not to. That must be HARMLESS, which is precisely what the durable queue buys: an entry stays
 * pending until a verdict is written, so a killed flush leaves the queue exactly as it was.
 *
 * It must also never be reported as a completed synchronisation. Not "we take care not to" — the code
 * path must not exist, because a path that can do it will eventually run. So:
 *
 *  1. `mode` is stamped on the report by the function that started the flush, and the report is
 *     FROZEN before it is returned. A caller cannot promote a best-effort report afterwards.
 *  2. {@link claimsCompletedSync} is the only predicate, and its FIRST line refuses any report whose
 *     mode is best-effort — before it looks at anything else, so no combination of counters can
 *     satisfy it.
 *  3. {@link syncCompletionMarker} is the only function in this application permitted to produce the
 *     "last synchronised at" value, and it returns null for anything {@link claimsCompletedSync}
 *     refuses. The accountability surface takes the marker from here or it does not have one.
 *  4. A flush that was interrupted, that stopped on an expired credential, that hit its own limit, or
 *     that leaves ANY entry undelivered fails the predicate as well — because a synchronisation that
 *     did not drain the queue has not completed, whatever it managed.
 *
 * ## Order, and stopping
 *
 * Entries are delivered oldest first, by sequence. A transient failure does not stop the flush: the
 * next entry may be bound elsewhere and may succeed. An expired credential DOES stop it immediately —
 * nothing else can succeed either, and attempting the rest would burn nothing but the coach's battery.
 */

import { timestamp } from '../model/model.js';
import { RemoteFileNotFound } from '../remote/remote.js';
import { FAILURE, classifyFailure } from './classify.js';
import { OPERATION, STATUS } from './entry.js';
import {
  countByStatus, dueEntries, holdDueForCredential, recordAmbiguous, recordCredentialHold,
  recordDelivered, recordRejected, recordTransientFailure,
} from './queue.js';
import { recognise } from './recognition.js';

/**
 * How a flush was started. `best_effort` is the backgrounding case, and it is a different value rather
 * than a flag so that the report carries its own provenance to anywhere it is read.
 */
export const FLUSH_MODE = Object.freeze({ FOREGROUND: 'foreground', BEST_EFFORT: 'best_effort' });

/**
 * The brand that says a report came from a flush that genuinely ran here, and in which mode.
 *
 * Module-private and not exported: nothing outside this file can attach it. See `finish`.
 */
const AUTHENTIC = Symbol('outbox.flush.authentic');

/** Why a flush stopped. */
export const STOPPED = Object.freeze({
  DRAINED: 'drained',
  CREDENTIAL_EXPIRED: 'credential_expired',
  LIMIT: 'limit',
  ABORTED: 'aborted',
  LOCAL_FAILURE: 'local_failure',
});

/**
 * @typedef {Object} FlushReport
 * @property {string} mode                  One of {@link FLUSH_MODE}. Stamped, then frozen.
 * @property {string} started_at
 * @property {string} finished_at
 * @property {number} attempted
 * @property {number} delivered             Landed on this flush.
 * @property {number} already_landed        Recognised as delivered by an earlier, unacknowledged
 *                                          attempt. Counted separately because it is the number that
 *                                          proves the duplicate defence actually fired.
 * @property {number} deferred              Waiting out a growing delay after a transient failure.
 * @property {number} waiting_for_credential
 * @property {number} rejected
 * @property {number} ambiguous
 * @property {number} remaining_undelivered Pending plus stopped-and-visible, AFTER this flush.
 * @property {number} remaining_pending
 * @property {number} needs_attention       Rejected plus ambiguous, in the whole queue.
 * @property {string} stopped_because       One of {@link STOPPED}.
 * @property {boolean} interrupted          A flush that did not reach its own end.
 */

/**
 * Deliver what is due, oldest first.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {import('../remote/port.js').RemoteStoragePort} remote
 * @param {{mode?: string, now?: number|string|Date, limit?: number, timeoutMs?: number,
 *          backoff?: {cap?: number, base?: number, jitter?: (ms: number) => number},
 *          signal?: {aborted: boolean}, onEntry?: (result: {entry: any, outcome: string}) => void}} [options]
 * @returns {Promise<Readonly<FlushReport>>}
 */
export async function flushOutbox(store, remote, options = {}) {
  const mode = options.mode === FLUSH_MODE.BEST_EFFORT ? FLUSH_MODE.BEST_EFFORT : FLUSH_MODE.FOREGROUND;
  const startedAt = timestamp(options.now);
  const { limit = 25, timeoutMs, backoff, signal, onEntry } = options;

  const tally = {
    attempted: 0, delivered: 0, already_landed: 0, deferred: 0,
    waiting_for_credential: 0, rejected: 0, ambiguous: 0,
  };
  let stopped = STOPPED.DRAINED;
  let interrupted = false;

  try {
    // Re-read the due page each round rather than holding a list: an outcome changes an entry's
    // status, so the pending range shrinks as we go, and a held list would be a snapshot of a queue
    // the other window may also be draining.
    for (;;) {
      if (signal?.aborted) { stopped = STOPPED.ABORTED; interrupted = true; break; }

      const page = await dueEntries(store, { now: options.now, limit: 1 });
      const entry = page.items[0];
      // Emptiness is tested BEFORE the limit, so a queue holding exactly `limit` entries reports
      // itself drained rather than limited. The other order would mean a flush that genuinely
      // finished the work could never be a completed synchronisation, which is a false alarm the
      // coach would learn to ignore — and an ignored warning is worse than none.
      if (!entry) { stopped = STOPPED.DRAINED; break; }
      if (tally.attempted >= limit) { stopped = STOPPED.LIMIT; break; }

      tally.attempted += 1;
      const { outcome, error: lastCredentialError } = await deliverOne(
        store, remote, entry, { now: options.now, timeoutMs, backoff },
      );
      // Awaited: an observer that writes — a screen updating, a test queueing more work — must have
      // finished before the next round reads the queue, or the round would read a queue mid-change.
      if (onEntry) await onEntry({ entry, outcome });

      if (outcome === 'delivered') tally.delivered += 1;
      else if (outcome === 'already_landed') { tally.delivered += 1; tally.already_landed += 1; }
      else if (outcome === 'deferred') tally.deferred += 1;
      else if (outcome === 'rejected') tally.rejected += 1;
      else if (outcome === 'ambiguous') tally.ambiguous += 1;
      else if (outcome === 'waiting_for_credential') {
        // Nothing else can succeed either, so everything due joins the wait rather than each later
        // flush spending another call to learn the same thing. Stopping here is not giving up: every
        // entry keeps its place, its attempts and its order, and the next opportunity takes them all.
        tally.waiting_for_credential = 1 + await holdDueForCredential(store, lastCredentialError, {
          now: options.now,
        });
        stopped = STOPPED.CREDENTIAL_EXPIRED;
        break;
      }
    }
  } catch (error) {
    // A failure of the flush itself — the local database, or a defect. The queue is untouched by it:
    // every entry either has a verdict written or is still pending. Loud, never swallowed.
    interrupted = true;
    stopped = STOPPED.LOCAL_FAILURE;
    // The report is a courtesy attached to the failure; composing it must never replace the failure
    // itself, so a database too broken to be counted still throws what actually went wrong.
    const report = await finish(store, { mode, startedAt, tally, stopped, interrupted, now: options.now })
      .catch(() => null);
    throw Object.assign(/** @type {any} */ (error), { flush_report: report });
  }

  return finish(store, { mode, startedAt, tally, stopped, interrupted, now: options.now });
}

/**
 * The best-effort flush: what a page being backgrounded calls.
 *
 * A separate entry point rather than an option, because the mode is the whole point and an option is
 * something a caller can forget. It forces the mode; there is no argument that can turn it into a
 * foreground flush, and its report is frozen with `mode: 'best_effort'` on it, so nothing downstream
 * can read it as a completed synchronisation.
 *
 * The platform may kill this mid-flight. That is expected and harmless.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {import('../remote/port.js').RemoteStoragePort} remote
 * @param {{now?: number|string|Date, limit?: number, timeoutMs?: number, signal?: {aborted: boolean}}} [options]
 * @returns {Promise<Readonly<FlushReport>>}
 */
export async function flushBestEffort(store, remote, options = {}) {
  return flushOutbox(store, remote, { ...options, mode: FLUSH_MODE.BEST_EFFORT });
}

/**
 * One entry: recognise, deliver, record the verdict.
 *
 * Every path through this function ends in a committed verdict or in the entry being left pending.
 * There is no path that returns having neither delivered nor recorded, because that is the shape of a
 * silently dropped write.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {import('../remote/port.js').RemoteStoragePort} remote
 * @param {import('./entry.js').OutboxEntry} entry
 * @param {{now?: number|string|Date, timeoutMs?: number, backoff?: any}} options
 * @returns {Promise<{outcome: string, error: unknown}>} The failure is handed back as well as
 *   recorded, because the credential case needs it to describe the entries it holds alongside.
 */
async function deliverOne(store, remote, entry, options) {
  const { now, timeoutMs, backoff } = options;
  const callOpts = timeoutMs === undefined ? {} : { timeoutMs };

  try {
    const known = await recognise(remote, entry, callOpts);

    if (known.verdict === 'landed') {
      await recordDelivered(store, entry.entry_id, {
        meta: known.meta, how: known.how, now, countsAsAttempt: false,
      });
      return { outcome: 'already_landed', error: null };
    }
    if (known.verdict === 'ambiguous' || known.verdict === 'moved') {
      await recordAmbiguous(store, entry.entry_id, { file_ids: known.file_ids, how: known.how, now });
      return { outcome: 'ambiguous', error: null };
    }

    const meta = await perform(remote, entry, callOpts);
    await recordDelivered(store, entry.entry_id, { meta, how: 'Delivered on this attempt.', now });
    return { outcome: 'delivered', error: null };
  } catch (error) {
    const classification = classifyFailure(error);

    if (classification === FAILURE.CREDENTIAL) {
      await recordCredentialHold(store, entry.entry_id, error, { now });
      return { outcome: 'waiting_for_credential', error };
    }
    if (classification === FAILURE.REJECTED) {
      await recordRejected(store, entry.entry_id, error, { now });
      return { outcome: 'rejected', error };
    }
    if (classification === FAILURE.LOCAL) {
      // Not the remote's refusal, so it must not be shown as one. Let it out: a database that cannot
      // be written is not a queue problem to absorb quietly.
      throw error;
    }
    // Transient, or a deadline that passed with no answer. The work stays. An unknown outcome is why
    // the next attempt begins by recognising rather than by writing.
    await recordTransientFailure(store, entry.entry_id, error, { now, backoff });
    return { outcome: 'deferred', error };
  }
}

/**
 * Perform the entry's operation against the port.
 *
 * @param {import('../remote/port.js').RemoteStoragePort} remote
 * @param {import('./entry.js').OutboxEntry} entry
 * @param {{timeoutMs?: number}} callOpts
 * @returns {Promise<import('../remote/port.js').RemoteFileMeta|null>}
 */
async function perform(remote, entry, callOpts) {
  if (entry.operation === OPERATION.CREATE) {
    return remote.create(entry.space, { name: /** @type {string} */ (entry.name), content: entry.payload }, callOpts);
  }
  if (entry.operation === OPERATION.OVERWRITE) {
    return remote.overwrite(/** @type {string} */ (entry.target_file_id), entry.payload, callOpts);
  }
  try {
    await remote.remove(/** @type {string} */ (entry.target_file_id), callOpts);
  } catch (error) {
    // Already gone IS the outcome asked for. This is the whole of a removal's idempotency: the second
    // attempt of a removal whose acknowledgement was lost finds nothing there and is satisfied.
    if (!(error instanceof RemoteFileNotFound)) throw error;
  }
  return null;
}

/**
 * Compose the report, reading the queue's real state for the remaining figures, and freeze it.
 *
 * The remaining counts come from the DATABASE rather than from arithmetic on the tally. Arithmetic
 * would be wrong whenever the other window enqueued something during the flush, and it would be wrong
 * in the dangerous direction: it would report zero remaining, which is the one thing that makes a
 * synchronisation look complete.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {{mode: string, startedAt: string, tally: any, stopped: string, interrupted: boolean, now?: any}} args
 * @returns {Promise<Readonly<FlushReport>>}
 */
async function finish(store, { mode, startedAt, tally, stopped, interrupted, now }) {
  const pending = await countByStatus(store, STATUS.PENDING);
  const rejected = await countByStatus(store, STATUS.REJECTED);
  const ambiguous = await countByStatus(store, STATUS.AMBIGUOUS);

  const report = {
    mode,
    started_at: startedAt,
    finished_at: timestamp(now),
    ...tally,
    remaining_pending: pending,
    needs_attention: rejected + ambiguous,
    remaining_undelivered: pending + rejected + ambiguous,
    stopped_because: stopped,
    interrupted,
  };

  // The brand. It is a module-private symbol and it is NOT enumerable, so it survives nothing: not a
  // spread, not JSON, not a hand-built object that merely looks like a report. Only a flush that
  // actually ran can put it there, and it records the mode that flush ran in. That is what makes
  // "a partial flush cannot set a success marker" structural rather than a rule someone follows.
  Object.defineProperty(report, AUTHENTIC, { value: mode, enumerable: false, writable: false });
  return Object.freeze(report);
}

/**
 * Did this flush genuinely complete a synchronisation?
 *
 * The ONLY predicate. Every condition is a reason a report might look successful while the coach's
 * data is not where he thinks it is.
 *
 * @param {Readonly<FlushReport>|null|undefined} report
 * @returns {boolean}
 */
export function claimsCompletedSync(report) {
  // First, and before anything else is considered. Two things at once: that this is a report a flush
  // in THIS process actually produced, and that the flush was a foreground one rather than a
  // best-effort attempt the platform may have killed halfway through. No counter below can overturn
  // it, and no object assembled elsewhere can satisfy it.
  if (!report || report[AUTHENTIC] !== FLUSH_MODE.FOREGROUND) return false;
  if (report.interrupted) return false;
  if (report.stopped_because !== STOPPED.DRAINED) return false;
  // Undelivered rather than merely pending: an entry that stopped as rejected or ambiguous is data
  // that is NOT in the backup, and a synchronisation that leaves one behind has not completed.
  return report.remaining_undelivered === 0;
}

/**
 * The "last synchronised at" value, or null.
 *
 * This is the only function in the application permitted to produce that marker. A screen that shows a
 * last-synced time takes it from here; nothing else may compute one, because every other route is a
 * route by which a partial flush eventually sets it.
 *
 * @param {Readonly<FlushReport>|null|undefined} report
 * @returns {{completed_sync_at: string}|null}
 */
export function syncCompletionMarker(report) {
  if (!claimsCompletedSync(report)) return null;
  return { completed_sync_at: /** @type {Readonly<FlushReport>} */ (report).finished_at };
}
