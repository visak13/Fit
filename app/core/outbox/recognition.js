/**
 * TELLING A REPLAY FROM A FRESH WRITE — the mechanism, and what it rests on.
 *
 * ## The problem, stated exactly
 *
 * A delivery has two halves: the remote accepts the write, and this device records that it did. The
 * application can die between them — the operating system kills a backgrounded tab, the browser is
 * closed, the phone runs out of battery — and it can also never learn the answer at all, because a
 * call that exceeds its deadline has an UNKNOWN outcome and may well have landed.
 *
 * So on every attempt, the queue must assume the work may already be done. If it assumes otherwise
 * it duplicates the coach's records; if it assumes it IS done it loses them.
 *
 * ## What this does NOT rest on
 *
 * **There is no conditional-match facility.** This was measured against the real service: the
 * revision, the content digest and the modification time are all output-only, and none of them can be
 * sent back as a precondition on a write. `PORT_CAPABILITIES.conditional_write` is `false`, declared
 * as data so that changing it is a visible code change a test catches. So "write this only if it has
 * not already been written" cannot be expressed, and no amount of care here creates it.
 *
 * The second measured quirk removes the other obvious answer: **the space does not enforce name
 * uniqueness.** Creating a file under a name that already exists yields a SECOND, DISTINCT file, and
 * both are then listed. That happened on real devices in about fifteen minutes of ordinary
 * two-device use. So a create can genuinely duplicate, and nothing on the remote side will say so.
 *
 * ## What it DOES rest on, per operation
 *
 * | Operation | How a replay is recognised | What that rests on |
 * |---|---|---|
 * | `create` | The idempotency key is inside the remote NAME. List by that name and count exact matches: none means it never landed, one means it did, more than one means the quirk happened. | `list` filtered by name prefix — the only metadata a listing can be narrowed on — plus the naming rule `entry.js` enforces at enqueue. |
 * | `overwrite` | Read the target back and compare the bytes with the payload. Equal means this exact revision already landed. | `read`, which returns metadata and content together. Nothing conditional. |
 * | `remove` | Attempt it. `RemoteFileNotFound` means it is already gone, which is the outcome asked for. | The port's typed not-found error. |
 *
 * Every one of these is DETECTION, and detection has a window: another writer can act between the
 * check and the write, and nothing here can close that. What it buys is that the queue's own retries
 * do not duplicate, which is the loss this queue was built to prevent. A clash with another writer is
 * surfaced, never silently overwritten — see `SURFACED_NEVER_GUESSED`.
 *
 * ## The three cases, and the third is the one nobody lists
 *
 * A listing returns none, exactly one, or MORE THAN ONE. The third is proven reachable, so it is
 * handled explicitly: the entry stops as `ambiguous` carrying every identifier found, and a person
 * decides. Adopting the first would be a guess, and a guess here means either a duplicate record in
 * the coach's backup or a delivery reported as complete against the wrong file.
 */

import { RemoteFileNotFound, bytesToText } from '../remote/remote.js';
import { OPERATION } from './entry.js';

/**
 * **A declared value, asserted by a test, not an absent check.**
 *
 * Nothing in this module resolves an ambiguous listing by picking one. An absence of that code is
 * indistinguishable from an oversight to the next editor, who would helpfully add "just take the
 * first one" and turn a visible problem into a silent wrong answer.
 */
export const SURFACED_NEVER_GUESSED = true;

/**
 * @typedef {Object} Recognition
 * @property {'landed'|'not_landed'|'ambiguous'|'moved'} verdict
 * @property {import('../remote/port.js').RemoteFileMeta|null} meta What is there, when one thing is.
 * @property {readonly string[]} file_ids Every identifier found. More than one means `ambiguous`.
 * @property {string} how Plain words, stored on the entry and shown to a person.
 */

/**
 * Has this entry's work already landed?
 *
 * Called before every attempt, including the first — the first attempt of a REPLAYED entry after a
 * restart is indistinguishable from a genuine first attempt, and treating them differently would need
 * exactly the session memory an entry is forbidden to depend on.
 *
 * Failures are not caught here. A recognition step that cannot reach the service is a failure of the
 * attempt, classified like any other, and swallowing it would let a delivery proceed as though it had
 * proven something it did not.
 *
 * @param {import('../remote/port.js').RemoteStoragePort} remote
 * @param {import('./entry.js').OutboxEntry} entry
 * @param {{timeoutMs?: number}} [options]
 * @returns {Promise<Recognition>}
 */
export async function recognise(remote, entry, options = {}) {
  const opts = options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs };

  if (entry.operation === OPERATION.CREATE) {
    // Narrowed by name prefix, then matched EXACTLY. A prefix match alone would also catch a longer
    // name that happens to start with ours, and adopting that would report the delivery against
    // somebody else's file.
    const listing = await remote.list(entry.space, { namePrefix: entry.name, ...opts });
    const mine = listing.filter((meta) => meta.name === entry.name);

    if (mine.length === 0) {
      return {
        verdict: 'not_landed', meta: null, file_ids: [],
        how: 'Nothing in the space answers to this delivery name, so the write never landed.',
      };
    }
    if (mine.length === 1) {
      return {
        verdict: 'landed', meta: mine[0], file_ids: [mine[0].file_id],
        how: 'A file already exists under this delivery name, so an earlier attempt landed and its acknowledgement was lost.',
      };
    }
    return {
      verdict: 'ambiguous', meta: null, file_ids: Object.freeze(mine.map((m) => m.file_id)),
      how: `${mine.length} files answer to this delivery name. The space does not enforce unique names, so this must be resolved by a person rather than guessed.`,
    };
  }

  if (entry.operation === OPERATION.OVERWRITE) {
    let current;
    try {
      current = await remote.read(/** @type {string} */ (entry.target_file_id), opts);
    } catch (error) {
      if (error instanceof RemoteFileNotFound) {
        // The file this revision was for is gone. Overwriting is impossible and recreating it would
        // resurrect something that may have been deliberately removed. A person decides.
        return {
          verdict: 'ambiguous', meta: null, file_ids: [],
          how: 'The file this update was for no longer exists remotely. It may have been removed on another device; recreating it here would undo that.',
        };
      }
      throw error;
    }

    if (bytesToText(current.content) === entry.payload) {
      return {
        verdict: 'landed', meta: current.meta, file_ids: [current.meta.file_id],
        how: 'The remote copy already holds exactly these bytes, so this update landed and its acknowledgement was lost.',
      };
    }

    if (entry.expected_revision !== null && current.meta.revision !== entry.expected_revision) {
      // Somebody else wrote between our composing this and our sending it. DETECTION, not a lock —
      // and the correct answer is to show both sides, because an unreported conflict is a lost edit
      // whichever way it faces.
      return {
        verdict: 'moved', meta: current.meta, file_ids: [current.meta.file_id],
        how: `The remote copy is at revision ${current.meta.revision} but this update was composed against ${entry.expected_revision}. Something else wrote to it; overwriting now would discard that.`,
      };
    }

    return {
      verdict: 'not_landed', meta: current.meta, file_ids: [current.meta.file_id],
      how: 'The remote copy holds different bytes and is at the revision this update expected, so the update has not landed.',
    };
  }

  // A removal needs no advance check: attempting it twice is the same as attempting it once, and the
  // port's not-found error is the recognition. Doing it this way costs one call instead of two.
  return {
    verdict: 'not_landed', meta: null, file_ids: [],
    how: 'A removal is recognised by its own outcome: a file that is already gone reports not-found, which is the result asked for.',
  };
}
