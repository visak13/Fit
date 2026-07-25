/**
 * THE DERIVED SNAPSHOT — the one shared object, and the only place a lost update is possible.
 *
 * ## What it is for
 *
 * Reading the union means reading every device's area: several files, several round trips, before the
 * first screen can show anything. The snapshot is that union assembled once and written down, so an
 * ordinary open is one read, and so a device that has never synchronised — a replacement phone — can
 * recover the coach's data without knowing which devices ever existed.
 *
 * ## What it is NOT
 *
 * **It is not the authority.** The device areas are. Everything in the snapshot is a copy of a record
 * that exists in at least one area, and the snapshot can be thrown away and rebuilt at any moment.
 * That single sentence is what turns its one weakness into something survivable, so it is asserted as
 * a value (`SNAPSHOT_IS_DERIVED_NEVER_AUTHORITY`) and proved by a test that deletes it and rebuilds.
 *
 * ## The three tiers, told apart
 *
 * | Tier | Where | What it means |
 * |---|---|---|
 * | **STRUCTURAL** | device areas | Cross-device overwrite CANNOT occur. No shared writable object exists. |
 * | **DETECTED AND RECOVERABLE** | this file | A lost update CAN occur, is noticed, and is repaired from the authority. |
 * | **DETECTED ONLY** | genuine divergence | Two devices edited one record; the data cannot say who is right, so a person does. |
 *
 * ## Why read-compare-write, and exactly what it buys
 *
 * There is **no conditional-match facility on this service** — revision, digest and modification time
 * are output-only, so "write only if the revision is still N" cannot be expressed and no care creates
 * it. The cycle is therefore read, compare, write, and **another writer can land between the compare
 * and the write**. That window cannot be closed here. So:
 *
 *  - comparing BEFORE writing stops us overwriting a change we have already seen — that much is real;
 *  - it does NOT stop the change that arrives in the window, and a caller that checked and found
 *    nothing moved can still lose its write. The double reproduces exactly that, and a test performs
 *    it and asserts the loss really happened.
 *
 * **Detection is not prevention, and this file never says otherwise.** What makes it survivable is
 * the tier above: the loss is noticed on the next cycle, and the snapshot is rebuilt from the areas,
 * which still hold every record. So the honest claim is not "we detect it" — it is **detect, then
 * rebuild from authority**, and correctness is restored rather than merely reported.
 *
 * ## Why this one write does not go through the outbox
 *
 * Every write carrying DATA goes through the durable outbox, because a failed credential must be a
 * delay and never a loss. The snapshot carries no data of its own: it is derived, and a snapshot
 * write that never lands costs one rebuild. Queueing it would also leave a permanent
 * needs-attention entry every time a race is detected — a warning about a file the engine repairs by
 * itself on the next pass, in the surface the coach relies on for warnings that matter. An indicator
 * that cries wolf is worse than no indicator, so this write is attempted directly and its failure is
 * reported in the sync result. `SNAPSHOT_CARRIES_NO_RECORD_OF_ITS_OWN` is the invariant that makes
 * that safe, and it is asserted rather than assumed.
 *
 * ## The listing has three cases here too
 *
 * The space does not enforce name uniqueness, so a listing narrowed to the snapshot name can return
 * none, exactly one, or MORE THAN ONE. The third is proven reachable — it is how a key envelope split
 * on real devices in fifteen minutes — and it is surfaced, never resolved by adopting the first.
 */

import { hasMoved, bytesToText } from '../remote/remote.js';
import { SNAPSHOT_NAME, SNAPSHOT_PREFIX } from './partition.js';
import { DOCUMENT_KINDS, decodeDocument, encodeDocument } from './payload.js';

/** **Asserted by a test.** Every record in a snapshot also lives in a device area. */
export const SNAPSHOT_IS_DERIVED_NEVER_AUTHORITY = true;

/** **Asserted by a test.** Nothing is ever written to the snapshot that is not written to an area first. */
export const SNAPSHOT_CARRIES_NO_RECORD_OF_ITS_OWN = true;

/**
 * **Asserted by a test.** Read-compare-write on this service is detection, and the window between the
 * compare and the write cannot be closed. Do not add a conditional-write parameter; the port refuses
 * to offer one for this reason.
 */
export const RACE_IS_DETECTED_NOT_PREVENTED = true;

/** How a publish attempt ended. */
export const PUBLISH = Object.freeze({
  CREATED: 'created',
  REPLACED: 'replaced',
  /** The revision moved under us. Nothing was written; rebuild from the areas and try again. */
  RACED: 'raced',
  /** More than one file answers to the snapshot name. A person decides; nothing is written. */
  AMBIGUOUS: 'ambiguous',
});

/**
 * Assemble the snapshot text from a union of the areas.
 *
 * @param {{union: import('./areas.js').UnionResult, device: string, writtenAt: string}} args
 * @returns {{text: string, records: number}}
 */
export function assembleSnapshot({ union, device, writtenAt }) {
  const records = [...union.records.values()];
  const text = encodeDocument({
    kind: DOCUMENT_KINDS.SNAPSHOT,
    device,
    records,
    writtenAt,
    cursor: null,
  });
  // Purges are carried as notices in the areas that raised them; the snapshot simply does not contain
  // the purged records, which is the same fact expressed by absence.
  return { text, records: records.length };
}

/**
 * Find the snapshot. Three cases, and the third is the one nobody lists.
 *
 * @param {import('../remote/port.js').RemoteStoragePort} remote
 * @param {{space: string, timeoutMs?: number}} args
 * @returns {Promise<{verdict: 'none'|'one'|'many', meta: import('../remote/port.js').RemoteFileMeta|null,
 *                    file_ids: string[], how: string}>}
 */
export async function locateSnapshot(remote, args) {
  const opts = args.timeoutMs === undefined ? {} : { timeoutMs: args.timeoutMs };
  const listing = await remote.list(args.space, { namePrefix: SNAPSHOT_PREFIX, ...opts });
  const mine = listing.filter((meta) => meta.name === SNAPSHOT_NAME);

  if (mine.length === 0) {
    return { verdict: 'none', meta: null, file_ids: [], how: 'No snapshot has been written yet.' };
  }
  if (mine.length === 1) {
    return { verdict: 'one', meta: mine[0], file_ids: [mine[0].file_id], how: 'One snapshot, as expected.' };
  }
  return {
    verdict: 'many',
    meta: null,
    file_ids: mine.map((m) => m.file_id),
    how: `${mine.length} files answer to the snapshot name. This space does not enforce unique names, so two devices can each have created one. It is surfaced rather than guessed: adopting one would hide the other's records until somebody noticed they were missing.`,
  };
}

/**
 * Read a snapshot back.
 *
 * @param {import('../remote/port.js').RemoteStoragePort} remote
 * @param {string} fileId
 * @param {{timeoutMs?: number}} [options]
 * @returns {Promise<{document: any, meta: import('../remote/port.js').RemoteFileMeta}>}
 */
export async function readSnapshot(remote, fileId, options = {}) {
  const opts = options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs };
  const file = await remote.read(fileId, opts);
  return {
    document: decodeDocument(bytesToText(file.content), { name: file.meta.name, fileId }),
    meta: file.meta,
  };
}

/**
 * Publish the snapshot, comparing before writing.
 *
 * `held` is the metadata this text was composed against. Passing it is what makes a lost update
 * DETECTABLE; passing null means "create if there is none", which is checked against the listing
 * rather than assumed.
 *
 * @param {import('../remote/port.js').RemoteStoragePort} remote
 * @param {{space: string, text: string, held?: import('../remote/port.js').RemoteFileMeta|null,
 *          timeoutMs?: number}} args
 * @returns {Promise<{outcome: string, meta: import('../remote/port.js').RemoteFileMeta|null,
 *                    file_ids: string[], how: string}>}
 */
export async function publishSnapshot(remote, args) {
  const opts = args.timeoutMs === undefined ? {} : { timeoutMs: args.timeoutMs };
  const located = await locateSnapshot(remote, { space: args.space, timeoutMs: args.timeoutMs });

  if (located.verdict === 'many') {
    return { outcome: PUBLISH.AMBIGUOUS, meta: null, file_ids: located.file_ids, how: located.how };
  }

  if (located.verdict === 'none') {
    if (args.held) {
      // We composed against a snapshot that has since been removed. Recreating it would undo a
      // removal that may have been deliberate, and it is not ours to decide.
      return {
        outcome: PUBLISH.RACED, meta: null, file_ids: [],
        how: 'The snapshot this was composed against no longer exists. It was removed elsewhere; it is rebuilt on the next cycle rather than resurrected here.',
      };
    }
    const meta = await remote.create(args.space, { name: SNAPSHOT_NAME, content: args.text }, opts);
    return { outcome: PUBLISH.CREATED, meta, file_ids: [meta.file_id], how: 'The first snapshot was written.' };
  }

  const current = /** @type {import('../remote/port.js').RemoteFileMeta} */ (located.meta);

  if (!args.held) {
    // Somebody created one while we were composing. Ours was assembled without their records in it.
    return {
      outcome: PUBLISH.RACED, meta: current, file_ids: [current.file_id],
      how: 'A snapshot appeared while this one was being assembled, so this text was composed without whatever it holds. It is rebuilt from the areas rather than written over.',
    };
  }

  // ── compare ─────────────────────────────────────────────────────────────────────────────────
  // `stat` rather than the listing, because this is the freshest reading available and the window
  // this cycle cannot close begins the instant it returns.
  const stat = await remote.stat(current.file_id, opts);
  if (hasMoved(args.held, stat)) {
    return {
      outcome: PUBLISH.RACED, meta: stat, file_ids: [stat.file_id],
      how: `The snapshot is at revision ${stat.revision} but this text was composed against ${args.held.revision}. Another device wrote it; overwriting now would discard that.`,
    };
  }

  // ── write ───────────────────────────────────────────────────────────────────────────────────
  // Another device can land between the line above and this one. Nothing on this port can prevent
  // that, and pretending otherwise is the defect this whole module is written against. The loss is
  // caught on the next cycle by the same comparison, and repaired by rebuilding from the areas.
  const meta = await remote.overwrite(current.file_id, args.text, opts);
  return { outcome: PUBLISH.REPLACED, meta, file_ids: [meta.file_id], how: 'The snapshot was replaced.' };
}
