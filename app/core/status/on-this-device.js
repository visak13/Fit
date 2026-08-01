/**
 * IS THERE WORK ON THIS DEVICE THAT IS NOT IN THE BACKUP? — asked of the STORE, not of the queue.
 *
 * ## Why this module exists at all, in one measured sentence
 *
 * A record only enters the outbox during a pass's PUSH step. So the queue can answer "what is
 * queued", and the accountability surface was using that answer to say "everything is backed up" —
 * which is a different question, and the gap between the two is a defect rather than a nuance. A
 * record written after the last pass is in NEITHER the queue NOR the backup, and every figure the
 * surface had was drawn from the queue, so it reported the freshest possible state about work that is
 * nowhere.
 *
 * MEASURED IN THE REAL APPLICATION by s11/a9: a client is written, no pass has run, the backup
 * space's file count does not move (2 → 2), and the indicator reads "Backup status: Backed up a
 * moment ago. Everything is backed up." at one second and STILL at thirty-six seconds, after the
 * reading's own refresh has run. That window is not a flicker: nothing in `src/` listens for the
 * browser's `online` event and the only idle timer is fifteen minutes, so it is up to fifteen minutes
 * of "everything is backed up" said about work that is in one place on one device.
 *
 * ## Why it is a QUESTION and not a flag
 *
 * The first shape of this fix was a refusal flag: the pull refused a record, so raise a bit and let
 * the surface read it. That closes the one mechanism found. Asking the store instead closes the
 * CLASS — anything at all that leaves a record on this device and not in the backup, including the
 * mechanisms nobody has found yet, because the evidence is the record itself rather than a report
 * that somebody remembered to raise.
 *
 * ## The boundary rule is the engine's, and it is not re-derived here
 *
 * "Not in the backup" means "after the push cursor", and the cursor is an instant PLUS the exact
 * revisions already sent at that instant — because two records can share a millisecond and an
 * exclusive read would drop the second one for ever. That rule belongs to `core/sync/engine.js`; this
 * module imports the cursor's key and applies the same skip rather than inventing a second reading of
 * the same boundary. A second reading is how the boundary record ends up reported as unbacked-up on
 * every single pass for the life of the installation.
 *
 * ## Cost
 *
 * One indexed page per record kind, on `by_updated_at`, lower-bounded at the cursor — the same index
 * and the same bound the push itself uses. No record store is walked and nothing is read that the
 * push would not read. The surface's own note said "two reads" before this; it is now two reads plus
 * one bounded index page per kind, which is the price of the figure being about his data instead of
 * about the queue.
 */

import { RECORD_TYPES } from '../model/model.js';
import { storeNameFor } from '../store/store.js';
import { PUSH_CURSOR_KEY } from '../sync/sync.js';

/** How many records of one kind to look at. The oldest is first, and the oldest is what is wanted. */
export const LOOK_AT = 25;

/**
 * @typedef {Object} WorkNotInTheBackup
 * @property {boolean} any            Whether there is any at all. THE answer.
 * @property {number} at_least        How many were seen. A FLOOR, never a total — the read is bounded
 *                                    per kind, so more may be waiting behind it. Named so that no
 *                                    caller can mistake it for a count of everything.
 * @property {string|null} oldest_at  When the oldest of them was written. What the ladder climbs on.
 */

/** The identity of one exact revision — the engine's own boundary form. */
const revisionKey = (record) => `${record.record_id}:${record.rev}:${record.device}`;

/**
 * Work written on this device that no push has yet carried into the backup.
 *
 * It reports a FLOOR rather than a total on purpose. The honest total would mean paging every record
 * store on every status read, and the surface is drawn on every screen; a figure that expensive stops
 * being shown, and an indicator that is not shown is not an accountability surface. The one figure
 * that has to be exact is the boolean, and the boolean is exact.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @returns {Promise<Readonly<WorkNotInTheBackup>>}
 */
export async function workNotInTheBackup(store) {
  const mine = store.device;

  let atLeast = 0;
  /** @type {string|null} */
  let oldest = null;

  // ONE transaction over every record store AND the meta row, rather than one per kind plus a meta
  // read of its own. The budget is the reason and it is asserted: an always-visible indicator that
  // costs a transaction per kind is one a later editor takes off the screen to make a page feel
  // faster. Reading the cursor inside the same transaction is also the more correct reading — the
  // cursor and the records it bounds are then one consistent view rather than two.
  const names = RECORD_TYPES.map(storeNameFor);
  await store.read([...names, 'meta'], async (scope) => {
    const raw = (await scope.get('meta', PUSH_CURSOR_KEY))?.value;
    const at = typeof raw === 'string' ? raw : (typeof raw?.at === 'string' ? raw.at : '');
    const sent = new Set(Array.isArray(raw?.sent) ? raw.sent : []);

    for (const name of names) {
      // eslint-disable-next-line no-await-in-loop
      const page = await scope.page({
        store: name,
        index: 'by_updated_at',
        range: scope.KeyRange.lowerBound(at),
        limit: LOOK_AT,
        after: null,
      });
      for (const record of page.items) {
        // ── the two skips, and the second one is the difference between this and a false alarm ──
        //
        // Exactly the engine's boundary skip: a revision already sent that happens to sit on the
        // cursor's instant IS in the backup, and counting it would report a permanent phantom.
        if (record.updated_at === at && sent.has(revisionKey(record))) continue;
        // A RECORD THIS DEVICE DID NOT WRITE CAME OUT OF THE BACKUP, so it is in it by definition.
        // Every record the pull applies lands above the push cursor and would otherwise be counted
        // as unbacked-up work — so a device that had just RECEIVED correctly would report that the
        // coach's work was not backed up, until its next push. That is this fix inverted: an
        // indicator that cries about a state that is fine teaches him to ignore the one that isn't.
        // The author tag is the evidence, and it is the record's own.
        if (record.device !== mine) continue;
        atLeast += 1;
        if (oldest === null || record.updated_at < oldest) oldest = record.updated_at;
      }
    }
  });

  return Object.freeze({ any: atLeast > 0, at_least: atLeast, oldest_at: oldest });
}
