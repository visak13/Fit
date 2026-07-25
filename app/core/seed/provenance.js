/**
 * PROVENANCE — where a library record came from, and what reset may therefore do to it.
 *
 * The seed content contract defines three values and this module is the one place their
 * consequences are written down, so that the importer, the reset and the library editing screens
 * cannot each decide it slightly differently.
 *
 * | value                | means                                        | reset does |
 * | -------------------- | -------------------------------------------- | ---------- |
 * | `shipped-untouched`  | ours, unchanged by the coach                  | restores it (usually a no-op) |
 * | `shipped-edited`     | ours, and the coach has since changed it      | REVERTS it to the shipped form |
 * | `coach-created`      | his own work, never ours                      | leaves it completely alone |
 *
 * **Why three states and not a boolean**, restated here because it is the reason reset can be
 * built at all: a boolean can only say "ours" or "his", so it cannot express the middle case. A
 * reset built on a boolean either silently discards the coach's edits to shipped items with no
 * way to even warn him, or leaves them alone and therefore does not actually restore defaults.
 * Both are defensible; choosing between them by accident is not.
 *
 * Reverting his edits is only safe because the reset confirmation offers to back the data up
 * first and every backup is a genuinely restorable point. Those two are a pair — see
 * `describeReset` in `reset.js`, which exists to give the interface everything it needs to make
 * that offer.
 *
 * **No provenance value is ever stored as a boolean or indexed as one.** The store's
 * `by_provenance` index is on the string, deliberately: a boolean is not a valid key in the
 * browser's indexed database, so an index on one silently holds zero entries and every query
 * against it returns nothing while looking perfectly correct.
 */

import { PROVENANCE, SEED_PROVENANCE } from '../model/model.js';

export { PROVENANCE, SEED_PROVENANCE };

/** Ours, and the coach has changed it since. */
export const EDITED_PROVENANCE = 'shipped-edited';

/** His own work. Ours to display, never ours to revert. */
export const COACH_PROVENANCE = 'coach-created';

/**
 * The two values a reset acts on. Anything not in here is the coach's and is left alone.
 * @type {readonly string[]}
 */
export const RESTORABLE_PROVENANCE = Object.freeze([SEED_PROVENANCE, EDITED_PROVENANCE]);

/**
 * Did this record come from the shipped library?
 * @param {Record<string, any>|null|undefined} content
 * @returns {boolean}
 */
export function isShipped(content) {
  return RESTORABLE_PROVENANCE.includes(/** @type {any} */ (content?.provenance));
}

/**
 * Is this the coach's own record, which no reset may touch?
 * @param {Record<string, any>|null|undefined} content
 * @returns {boolean}
 */
export function isCoachCreated(content) {
  return content?.provenance === COACH_PROVENANCE;
}

/**
 * The provenance a record takes on when the coach edits it — the ONE place this rule lives.
 *
 * A shipped record he edits becomes `shipped-edited`, which is what lets a later reset offer to
 * put it back. His own record stays his. **The library editing screen should call this rather
 * than assigning a provenance value itself**, because a screen that forgets leaves a record
 * claiming to be untouched while showing his changes, and the next reset silently reverts work
 * he was never warned about.
 *
 * @param {string|undefined} current
 * @returns {string}
 */
export function provenanceAfterEdit(current) {
  if (current === SEED_PROVENANCE || current === EDITED_PROVENANCE) return EDITED_PROVENANCE;
  return COACH_PROVENANCE;
}

/**
 * Apply {@link provenanceAfterEdit} to a content record, returning a new record.
 * @template {Record<string, any>} T
 * @param {T} content
 * @returns {T}
 */
export function markEdited(content) {
  return { ...content, provenance: provenanceAfterEdit(content?.provenance) };
}
