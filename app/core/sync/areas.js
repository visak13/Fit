/**
 * READING THE UNION — every device's area, combined into one view.
 *
 * Writing is partitioned; reading is not. A device reads every area, including its own, and resolves
 * each record with the model's single last-write-wins rule. That asymmetry is the whole design: it is
 * safe to read a file two devices might both have written a copy of, because reading changes nothing.
 *
 * ## A record found twice is not a conflict, and a record found twice at the same revision by two
 * different devices IS one
 *
 * Areas overlap deliberately: a device that pulled a record and later wrote its whole state out has a
 * copy of somebody else's record in its own area. Two copies of the SAME revision are the same thing
 * and are resolved silently. Two copies of the same revision NUMBER written by two different devices
 * are two edits made in ignorance of each other, and they are surfaced from here just as they are
 * from the pull — the union is the earliest point at which the clash is visible, and swallowing it
 * here would mean the snapshot silently picked a side.
 *
 * ## An unreadable file stops that file, not the synchronisation
 *
 * A file this engine cannot decode is recorded and skipped, and the sync report carries it so the
 * accountability surface can say so out loud. Failing the whole run would mean one bad file on one
 * device stops the coach's phone from backing up anything at all; ignoring it silently would mean
 * synchronising a subset of his data while reporting success. Neither is acceptable, so it is
 * reported.
 *
 * **Reported was not enough on its own, and that was a real defect.** Carrying the fact in the report
 * only helps if something downstream acts on it, and for a while nothing did: an unreadable file was
 * not a `failure`, so the pass still reported a clean completion and the older of two installations
 * showed green while holding none of the newer one's work. The verdict now lives in
 * `core/sync/withheld.js` and both the engine and the accountability surface ask it. Each entry
 * therefore carries `written_by_newer_version` — declared by `payload.js`, which is the only code
 * that knows whether the version was above ours, below it, or not a document at all — so the words
 * the coach reads can name the cause without matching on the text of a message.
 */

import { bytesToText } from '../remote/remote.js';
import { SyncDocumentError } from './errors.js';
import { VERDICT, classify, describeDivergence } from './divergence.js';
import { groupByArea, isUnplaceableAreaFile } from './partition.js';
import { decodeDocument } from './payload.js';

/**
 * @typedef {Object} UnionResult
 * @property {Map<string, any>} records        record_id → the winning envelope.
 * @property {any[]} purges                    Purge notices found in any area, newest last.
 * @property {import('./divergence.js').Divergence[]} divergences Clashes BETWEEN areas.
 * @property {string[]} devices                Every device with an area in this space.
 * @property {{file_id: string, name: string, device: string, records: number}[]} files
 * @property {{name: string, file_id: string, why: string, written_by_newer_version: boolean}[]} unreadable
 * @property {{name: string, file_id: string, why: string, written_by_newer_version: boolean}[]} unplaceable
 *                                             Files named in THIS engine's namespace that this build
 *                                             cannot place. Same shape as `unreadable` because it is
 *                                             the same fact to the coach: work of his that did not
 *                                             arrive. See `isUnplaceableAreaFile`.
 * @property {import('../remote/port.js').RemoteFileMeta[]} unrecognised Files this engine did not write.
 */

/**
 * Read every area in a space and combine them.
 *
 * @param {import('../remote/port.js').RemoteStoragePort} remote
 * @param {{space: string, timeoutMs?: number, prefix?: string}} args
 * @returns {Promise<UnionResult>}
 */
export async function readUnion(remote, args) {
  const opts = args.timeoutMs === undefined ? {} : { timeoutMs: args.timeoutMs };
  const listing = await remote.list(args.space, { ...opts, ...(args.prefix ? { namePrefix: args.prefix } : {}) });
  const { areas, unrecognised } = groupByArea(listing);

  /** @type {UnionResult} */
  const union = {
    records: new Map(),
    purges: [],
    divergences: [],
    devices: [...areas.keys()].sort(),
    files: [],
    unreadable: [],
    // Taken from `unrecognised` rather than replacing it: the coach's own files in his own folder are
    // still reported as found-and-not-ours, and only the ones written INTO A DEVICE AREA THIS SPACE
    // ALREADY SHOWS are counted as work that did not arrive. The device list is the evidence — see
    // `isUnplaceableAreaFile` for why the namespace alone is not enough to alarm him with.
    unplaceable: unrecognised
      .filter((meta) => isUnplaceableAreaFile(meta.name, [...areas.keys()]))
      .map((meta) => ({
        name: meta.name,
        file_id: meta.file_id,
        why: 'This file is in one of your devices\' areas but this build does not know its kind. A newer version of the app may have written it; it is left alone.',
        // The strongest statement the evidence supports: the device that wrote this also writes area
        // files this build parses, so it is an installation of this application running a build that
        // knows a name this one does not.
        written_by_newer_version: true,
      })),
    unrecognised,
  };

  /**
   * The first envelope met at each `record_id@rev`, so that a clash is found by structure rather
   * than by whatever the fold happens to be holding. See the detection note in the loop below.
   * @type {Map<string, any>}
   */
  const firstAtRevision = new Map();

  // Oldest first, so that within one area a later file's revision meets an earlier one in the order
  // they were written. Between areas the order does not matter: last-write-wins is commutative.
  const metas = [...areas.values()].flat()
    .sort((a, b) => (a.modified_at < b.modified_at ? -1 : a.modified_at > b.modified_at ? 1 : 0));

  for (const meta of metas) {
    let document;
    try {
      // eslint-disable-next-line no-await-in-loop
      const file = await remote.read(meta.file_id, opts);
      document = decodeDocument(bytesToText(file.content), { name: meta.name, fileId: meta.file_id });
    } catch (error) {
      if (error instanceof SyncDocumentError) {
        union.unreadable.push({
          name: meta.name,
          file_id: meta.file_id,
          why: error.message,
          // Read off the declared detail, never off `why`. Absent means false rather than unknown:
          // every other way a document can be unreadable — not JSON, not an object, a broken
          // envelope, a version BELOW ours — is genuinely not a newer version having written it.
          written_by_newer_version: error.details?.written_by_newer_version === true,
        });
        continue;
      }
      throw error;
    }

    union.files.push({
      file_id: meta.file_id, name: meta.name, device: document.device, records: document.records.length,
    });
    for (const purge of document.purges) union.purges.push(purge);

    for (const incoming of document.records) {
      const held = union.records.get(incoming.record_id);
      const verdict = classify(held, incoming);
      if (verdict === VERDICT.APPLY) union.records.set(incoming.record_id, incoming);
      // Nothing else is applied. A divergence in particular chooses neither side: the record stays
      // as it was in the union and the clash is reported below, rather than the snapshot quietly
      // picking one.

      // ── detection does NOT go through the fold, and that is the whole point ──────────────────
      //
      // Comparing each incoming against the CURRENT WINNER only finds a clash that happens to be
      // standing when its counterpart arrives. It misses one the fold has already walked past, and
      // whether it has walked past depends on the order the files were written in:
      //
      //   two devices write revision N unaware of each other; one of them, still never having seen
      //   the other, edits on to N+1. If that N+1 file is read BEFORE the other device's N, the
      //   rev-N copy from its own line has already been replaced by the time the clash arrives, and
      //   the comparison is N+1 against N — an ordinary supersede. Nothing is ever reported.
      //
      // So a clash is detected structurally instead: the FIRST envelope seen at each record and
      // revision is remembered, and a second envelope at that same revision from a DIFFERENT device
      // is a divergence whenever it turns up and whatever has happened to the winner since. The
      // memory cost is one reference per record-and-revision actually present in the areas, which is
      // bounded by the records already being read.
      const at = `${incoming.record_id}@${incoming.rev}`;
      const first = firstAtRevision.get(at);
      if (!first) firstAtRevision.set(at, incoming);
      else if (first.device !== incoming.device) {
        union.divergences.push(describeDivergence(first, incoming));
      }
    }
  }

  // ── clashes the coach has already ANSWERED ──────────────────────────────────────────────────
  //
  // An area file is history, not a current statement. Two files holding revision N from two devices
  // are a clash the moment they are read — but if the coach has already answered it, `resolution.js`
  // wrote the side he picked at a strictly higher revision, and the older files carrying the two
  // rev-N copies stay in the areas until compaction removes them. Reporting those anyway would ask
  // him the same question on every pass FOREVER after he answered it, which is how a surface teaches
  // the person reading it to stop reading it. That protection is real and it is kept.
  //
  // ## The test used to be "a higher revision exists", and that was wrong
  //
  // It read "something outranks both sides" as "the question was answered". It is true when the
  // resolution seam wrote the higher revision — but the seam is not the only thing that can. Two
  // devices write revision N unaware of each other; one of them, STILL never having seen the other,
  // edits again in the ordinary way to N+1. Nothing was resolved, nobody was asked, and there is now
  // a revision above both sides. The clash was dropped, the other device's edit was discarded, and
  // nothing anywhere said so — which is exactly the silent-loss shape this whole area exists to
  // prevent, arriving inside the guard against it.
  //
  // The two cases differ in provenance, not in arithmetic, so provenance is what is asked for.
  // `resolved_from` is written by the resolution seam alone and inherited by later revisions, so it
  // says "this line of history descends from an answer" and names the revision that answer settled.
  // A clash is dropped only when the settled record descends from an answer given at or above the
  // revision the two sides claim. An ordinary edit carries its parent's mark and cannot raise it, so
  // it can no longer speak for a question the coach was never asked.
  //
  // Nothing is chosen here and nothing is discarded either way; this only decides what he is shown.
  union.divergences = union.divergences.filter((divergence) => {
    const settled = union.records.get(divergence.record_id);
    if (!settled || settled.rev <= divergence.rev) return true;
    const answered = Number(settled.resolved_from);
    return !(Number.isInteger(answered) && answered >= divergence.rev);
  });

  return union;
}

/**
 * The files belonging to one device's area, oldest first.
 *
 * @param {import('../remote/port.js').RemoteStoragePort} remote
 * @param {{space: string, device: string, prefix: string, timeoutMs?: number}} args
 * @returns {Promise<import('../remote/port.js').RemoteFileMeta[]>}
 */
export async function listOwnArea(remote, args) {
  const opts = args.timeoutMs === undefined ? {} : { timeoutMs: args.timeoutMs };
  const listing = await remote.list(args.space, { namePrefix: args.prefix, ...opts });
  const { areas } = groupByArea(listing);
  const mine = areas.get(args.device) || [];
  return mine.sort((a, b) => (a.modified_at < b.modified_at ? -1 : a.modified_at > b.modified_at ? 1 : 0));
}
