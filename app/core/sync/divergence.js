/**
 * TELLING AN ORDINARY UPDATE FROM A GENUINE DIVERGENCE — and refusing to decide the second one.
 *
 * ## The two cases are not degrees of the same thing
 *
 * **The ordinary case.** The coach uses one device at a time: laptop for online sessions, phone for
 * in-person ones. A record edited on the phone reaches the laptop having seen the laptop's history,
 * so its revision is higher and it simply wins. Per-record last-write-wins is sufficient, it is the
 * model's own rule (`supersedes`), and it is not re-implemented here — two devices that resolved a
 * comparison differently would converge on two different records, which is worse than losing a write.
 *
 * **The genuine case.** Two devices both wrote revision N of the same record, each unaware of the
 * other. Neither has seen more history than the other; there is no fact that makes one right. The
 * model's tiebreak would still pick one — it exists so both devices pick the SAME one — but picking
 * silently would throw away an edit the coach made and never tell him. So this module classifies it
 * as a divergence, hands back **both sides in full**, and applies neither.
 *
 * ## When you cannot tell, surface
 *
 * That is the whole rule for the boundary between the two. A same-revision clash between two devices
 * is the case where the data cannot say who is right, so it goes to the person who can.
 * `NEVER_RESOLVED_BY_GUESSING` is a declared value asserted by a test rather than an absent check:
 * absence reads as an oversight, and the next editor helpfully adds "just take the newer timestamp",
 * turning a visible problem into a silent lost edit.
 *
 * ## A deletion is compared like anything else
 *
 * A tombstone is an ordinary revision. An edit made after a delete correctly resurrects the record; a
 * delete and an edit at the SAME revision is a divergence like any other, and it is the one a person
 * most needs to see — one device is about to lose a client's session history to the other's tidy-up.
 */

import { isSameRevision, supersedes } from '../model/model.js';

/** What to do with one incoming record. */
export const VERDICT = Object.freeze({
  /** Nothing local, or the incoming revision has seen more history. Apply it. */
  APPLY: 'apply',
  /** The local revision is the winner. Keep it; nothing is written. */
  KEEP: 'keep',
  /** The same revision by the same device: the two copies are the same thing. */
  SAME: 'same',
  /** Both devices wrote this revision independently. A person decides. */
  DIVERGED: 'diverged',
});

/**
 * **A declared value, asserted by a test.** Nothing in this module resolves a divergence. There is no
 * "prefer newer", no "prefer this device", and no option to enable one.
 */
export const NEVER_RESOLVED_BY_GUESSING = true;

/**
 * Classify one incoming record against what is held locally.
 *
 * @param {any|undefined} local The local envelope, or undefined when there is none.
 * @param {any} incoming The envelope that arrived.
 * @returns {string} One of {@link VERDICT}.
 */
export function classify(local, incoming) {
  if (!local) return VERDICT.APPLY;
  if (isSameRevision(local, incoming)) return VERDICT.SAME;

  // Same revision number, different author: neither has seen the other's write, so neither is ahead.
  // The model's tiebreak could pick one and both devices would pick the same one — but it would be a
  // coin toss made on the coach's behalf about his own data.
  if (local.rev === incoming.rev && local.device !== incoming.device) return VERDICT.DIVERGED;

  return supersedes(local, incoming) ? VERDICT.APPLY : VERDICT.KEEP;
}

/**
 * @typedef {Object} Divergence
 * @property {string} record_id
 * @property {string} type
 * @property {number} rev            The revision both sides claim.
 * @property {any} local             The whole local envelope. Both sides are shown, in full.
 * @property {any} incoming          The whole incoming envelope.
 * @property {string} why            Plain words for the coach.
 * @property {boolean} involves_deletion One side deletes and the other does not — the costliest case.
 */

/**
 * Describe a divergence for the surface that will show it.
 *
 * **Both sides in full, not a summary.** A conflict shown as "there is a conflict on this client"
 * cannot be decided by the person looking at it, so it gets dismissed, and a dismissed conflict is a
 * silent lost edit with extra steps. Sealed values travel inside the envelopes exactly as they are;
 * nothing here can read one, and the interface shows what it can decrypt.
 *
 * @param {any} local @param {any} incoming
 * @returns {Divergence}
 */
export function describeDivergence(local, incoming) {
  const involvesDeletion = local.deleted !== incoming.deleted;
  const what = involvesDeletion
    ? `It was deleted on ${local.deleted ? local.device : incoming.device} and changed on ${local.deleted ? incoming.device : local.device}.`
    : `It was changed on ${local.device} and on ${incoming.device}.`;

  return {
    record_id: local.record_id,
    type: local.type,
    rev: local.rev,
    local,
    incoming,
    involves_deletion: involvesDeletion,
    why: `${what} Neither device had seen the other's change, so there is nothing in the data that says which is right. Both are kept until you choose.`,
  };
}
