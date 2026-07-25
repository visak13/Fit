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
 */

import { bytesToText } from '../remote/remote.js';
import { SyncDocumentError } from './errors.js';
import { VERDICT, classify, describeDivergence } from './divergence.js';
import { groupByArea } from './partition.js';
import { decodeDocument } from './payload.js';

/**
 * @typedef {Object} UnionResult
 * @property {Map<string, any>} records        record_id → the winning envelope.
 * @property {any[]} purges                    Purge notices found in any area, newest last.
 * @property {import('./divergence.js').Divergence[]} divergences Clashes BETWEEN areas.
 * @property {string[]} devices                Every device with an area in this space.
 * @property {{file_id: string, name: string, device: string, records: number}[]} files
 * @property {{name: string, file_id: string, why: string}[]} unreadable
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
    unrecognised,
  };

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
        union.unreadable.push({ name: meta.name, file_id: meta.file_id, why: error.message });
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
      else if (verdict === VERDICT.DIVERGED) {
        union.divergences.push(describeDivergence(held, incoming));
        // Neither side is chosen. The record stays as it was in the union, and the clash travels with
        // the result so the caller shows it rather than the snapshot quietly picking one.
      }
    }
  }

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
