/**
 * THE REVISION RULE — the one that is invisible on the device where it is broken.
 *
 * ## The failure it prevents, told as it actually happens
 *
 * The coach presses reset-to-defaults in the admin panel. The shipped library comes back. He watches
 * it work, and it did work: locally, everything is correct. The next time the application
 * synchronises, his edited content quietly returns and the reset is undone. Nothing errored, nothing
 * warned, and the device where he did it showed the right answer the whole time.
 *
 * The cause is not the reset. It is that a restored record was written at a revision at or below the
 * one the remote copy already held, so last-write-wins — correctly, by its own rule — chose the older
 * content. **Any write that must replace an existing record has to carry a HIGHER revision than the
 * record it replaces.** That is a rule about revisions, not a special case about reset, and it binds
 * every restore-from-backup, every import and every migration for the same reason.
 *
 * ## Why it cannot be caught locally
 *
 * The local store applies the write happily — it is the newest thing it has been given. The defect
 * only exists in the comparison between two devices, which is why this rule lives in the
 * synchronisation engine and why the test that proves it is a **round trip** rather than an
 * assertion about a revision number. `resetIsARevisionRule` is proved twice: once that lifting works,
 * and once that NOT lifting is genuinely undone by the remote copy — because a rule whose absence is
 * never demonstrated is a rule nobody can tell is load-bearing.
 */

import { reviseEnvelope, timestamp } from '../model/model.js';
import { SyncBoundaryError } from './errors.js';

/**
 * **A declared value, asserted by a test.** Handle it as a rule about revisions rather than as a
 * special case about reset, or the next feature that replaces records — restore from backup, an
 * import, a migration — will meet it again from scratch.
 */
export const HIGHER_REVISION_OR_THE_REMOTE_COPY_UNDOES_IT = true;

/**
 * Lift a replacement above the record it replaces.
 *
 * The content is the caller's; only the envelope moves. When there is nothing to replace, the record
 * is returned untouched — a first write needs no lift, and inflating its revision would make every
 * later comparison read as though history had been skipped.
 *
 * @param {any|undefined} existing The record being replaced, if any.
 * @param {any} replacement The record as authored — a shipped default, a backup, an import.
 * @param {{device: string, now?: number|string|Date}} args
 * @returns {any} An envelope guaranteed to supersede `existing`.
 */
export function liftAbove(existing, replacement, { device, now }) {
  if (!replacement || typeof replacement !== 'object') {
    throw new SyncBoundaryError('A replacement record is required.', {});
  }
  if (!existing) return replacement;
  if (existing.record_id !== replacement.record_id) {
    throw new SyncBoundaryError(
      'A replacement can only be lifted above the record it actually replaces; these are two different records.',
      { existing: existing.record_id, replacement: replacement.record_id },
    );
  }

  const rev = Math.max(existing.rev, replacement.rev) + 1;
  return {
    ...replacement,
    rev,
    device,
    updated_at: timestamp(now),
    // `created_at` is the record's, not this write's: a restored record did not begin now.
    created_at: existing.created_at,
  };
}

/**
 * Apply a set of replacement records so that each supersedes what it replaces, everywhere.
 *
 * This is what an admin reset-to-defaults, a restore-from-backup and a migration all need. It reads
 * the current local record first, because the local copy is the one that has been kept level with the
 * remote copy by synchronisation — so out-revising it is what makes the replacement survive the round
 * trip rather than merely look right on this screen.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {readonly any[]} replacements
 * @param {{now?: number|string|Date}} [options]
 * @returns {Promise<{written: any[], lifted: number}>}
 */
export async function replaceRecords(store, replacements, options = {}) {
  const written = [];
  let lifted = 0;

  for (const replacement of replacements) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await store.get(replacement.type, replacement.record_id);
    const next = liftAbove(existing, replacement, { device: store.device, now: options.now });
    if (existing) lifted += 1;
    // eslint-disable-next-line no-await-in-loop
    await store.putRecord(next);
    written.push(next);
  }

  return { written, lifted };
}

/**
 * A revision that would be undone: exactly what {@link replaceRecords} exists to prevent.
 *
 * Exposed so a test can demonstrate the failure rather than only the fix, and so a caller writing a
 * new replacement path can assert against it. Returns true when this record would LOSE to what is
 * already held.
 *
 * @param {any|undefined} existing @param {any} replacement
 * @returns {boolean}
 */
export function wouldBeUndone(existing, replacement) {
  if (!existing) return false;
  return replacement.rev <= existing.rev;
}

/**
 * Re-revise a record's content on this device, for a caller that has the record already.
 * A thin, named wrapper so nothing re-derives revision arithmetic by hand.
 *
 * @param {any} record @param {Record<string, unknown>} content
 * @param {{device: string, now?: number|string|Date}} args
 * @returns {any}
 */
export function revise(record, content, args) {
  return reviseEnvelope(record, content, args);
}
