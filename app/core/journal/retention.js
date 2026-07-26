/**
 * THE RETENTION POLICY — what the log discards, what that costs, and why it is counted rather than
 * dated.
 *
 * This file is the DECISION. `durable.js` beside it is the mechanism that carries the decision out,
 * and it is the only caller: every path that puts an entry into the database goes through the same
 * function that applies this policy, so the bound cannot be exceeded by anything that forgot to ask
 * for it. See the header of `durable.js` for why the caller is the append itself and not a sweep.
 *
 * ## Bounded growth is not optional here
 *
 * Volumes are UNKNOWN and cannot be clarified — nothing in this application may assume a small
 * practice. The log gains an entry for every record change, every synchronisation pass, every unlock
 * and every export, on a device whose storage the browser may evict when it runs short. An unbounded
 * audit log on an evictable store does not fail by filling up; it fails by making the WHOLE origin a
 * candidate for eviction, taking the coach's sessions with it. Bounding it is protecting the data,
 * not tidying the log.
 *
 * This build has measured the opposite failure twice, and both times the routine was correct and the
 * CALLER was missing: delivered queue entries that accumulate because they are pruned only by a
 * caller who decides to, and a purge manifest carrying a reason nothing anywhere consumes. A prune
 * function with no caller is not a retention policy. So the policy below is a value, and the one
 * place entries enter the database applies it.
 *
 * ## Counted, NEVER dated — and this is a security decision, not a convenience
 *
 * The obvious policy is "keep ninety days". It is wrong here, and dangerously so.
 *
 * `at` comes from the DEVICE CLOCK. A device clock can be wrong, can drift, and — the part that
 * matters — **can be set by the person the log is recording**. An age-based policy would therefore
 * hand anyone who can change the clock a delete button for the audit log: set the clock forward a
 * year, do anything at all, and the retention pass obligingly discards every entry that now looks
 * old. The deletion would be indistinguishable from honest housekeeping, because it would BE the
 * honest housekeeping path.
 *
 * A count cannot be moved by the clock. `seq` is assigned by the chain, monotonic per device, and
 * nothing outside {@link import('./durable.js').appendInScope} can choose it. So the log is bounded
 * by HOW MANY entries it holds, and an attacker who wants the oldest entries gone has to write
 * {@link MAX_ENTRIES_PER_DEVICE} genuine entries to push them out — which is itself thousands of
 * entries of evidence.
 *
 * ## What retention discards, and what that costs
 *
 * It discards the OLDEST entries of one device's chain, and they are gone. Not archived, not
 * summarised, not recoverable: there is no server behind this application to hold them.
 *
 * Three consequences, stated here rather than discovered later:
 *
 *  1. **The discarded entries can never be verified again.** The pass records an ANCHOR — the digest
 *     of the last entry it discarded — so the surviving head can be shown to link to *something*
 *     continuous. The anchor cannot prove what that something SAID. Integrity of the survivors is
 *     preserved; the content of the discarded is not recoverable at all.
 *  2. **A pruned head is indistinguishable from a deletion unless the log says so.** That is why the
 *     pass writes a `journal.retention_pruned` entry carrying HOW MANY it discarded, and why it
 *     records the anchor in the same commit. Without both, verification would have to choose between
 *     crying wolf on every honest prune and staying silent on a real removal.
 *  3. **The window is a window.** Once the cap is reached the log answers questions about the last
 *     {@link MAX_ENTRIES_PER_DEVICE} events on that device and cannot answer questions about
 *     anything earlier — and it says so, rather than returning an empty result that reads like "it
 *     never happened".
 *
 * ## Why there is HEADROOM instead of pruning one entry per append
 *
 * Discarding exactly one entry on every append once the cap is reached would keep the log at the cap
 * with the smallest possible work per write — and would write a `journal.retention_pruned` entry on
 * every single append, so the log would eventually be mostly its own housekeeping. Discarding a
 * batch and leaving headroom means a prune happens once every {@link PRUNE_BATCH} appends: the
 * accounting entry is a fraction of a percent of the log, and the cost is bounded and predictable.
 *
 * {@link PRUNE_CEILING} bounds a single pass. It matters for one case: a cap LOWERED later, which
 * would otherwise ask one transaction to delete an unbounded number of rows while the coach waits.
 * With a ceiling the log converges over the next few appends instead, and every one of those passes
 * is bounded work inside a transaction that was already happening.
 */

/**
 * How many entries one device's chain may hold.
 *
 * Chosen for an unknown practice rather than a small one: a busy day is tens of entries, so this is
 * months of ordinary use, and at roughly a quarter of a kilobyte an entry it is a low single-digit
 * number of megabytes — small beside the records themselves, and far below any storage quota this
 * application could otherwise reach.
 *
 * It also bounds VERIFICATION, which is the same decision seen from the other side: a verification
 * pass reads a device's whole chain, so a chain that could grow without limit would eventually make
 * verifying it unaffordable, and an integrity check nobody can afford to run is not an integrity
 * check.
 */
export const MAX_ENTRIES_PER_DEVICE = 5000;

/**
 * How far below the cap a prune takes the chain — and therefore how many appends pass between one
 * prune and the next.
 */
export const PRUNE_BATCH = 250;

/** The most one pass may discard, so a lowered cap converges over several appends rather than in one. */
export const PRUNE_CEILING = 1000;

/**
 * The retention policy, as a value.
 *
 * A value rather than three constants read directly, so that a caller can be handed a different one
 * — which is how the behaviour at the cap is tested without writing five thousand entries, and how a
 * later step could tighten the bound on a device known to be short of room. The default is the one
 * the application uses and the only one it ships with.
 *
 * @type {Readonly<{max: number, batch: number, ceiling: number}>}
 */
export const RETENTION = Object.freeze({
  max: MAX_ENTRIES_PER_DEVICE,
  batch: PRUNE_BATCH,
  ceiling: PRUNE_CEILING,
});

/**
 * Whether a policy is usable, or the reason it is not.
 *
 * Checked rather than assumed because a policy whose batch exceeds its cap would ask a pass to
 * discard the entry that was just written — the log would then be missing the event that triggered
 * the prune, which is the one class of gap this whole package exists to prevent.
 *
 * @param {{max: number, batch: number, ceiling: number}} policy
 * @returns {string|null} null when the policy is usable.
 */
export function policyProblem(policy) {
  if (policy === null || typeof policy !== 'object') return 'A retention policy is an object of { max, batch, ceiling }.';
  const { max, batch, ceiling } = policy;
  if (!Number.isInteger(max) || max < 2) return 'A retention cap is a whole number of entries, at least 2.';
  if (!Number.isInteger(batch) || batch < 1) return 'A prune batch is a whole number of entries, at least 1.';
  if (!Number.isInteger(ceiling) || ceiling < 1) return 'A prune ceiling is a whole number of entries, at least 1.';
  if (batch >= max) {
    return 'A prune batch must be smaller than the cap, or a pass would discard the entry that '
      + 'triggered it and the log would be missing the event that caused its own housekeeping.';
  }
  return null;
}

/**
 * What a pass should discard, given how many entries the device's chain holds RIGHT NOW.
 *
 * Pure and synchronous: the decision is separable from the database, so it can be reasoned about and
 * tested at the real numbers without writing five thousand rows. `count` is the count AFTER the
 * entry that triggered the check was written, because that entry is what pushed the chain over.
 *
 * `discard` never reaches `count`: at least one entry always survives, and by construction the
 * survivor set always includes the newest. A pass that emptied the chain would leave a device with a
 * log that starts nowhere and links to nothing — unverifiable, and indistinguishable from one that
 * had been wiped.
 *
 * @param {number} count How many entries this device's chain holds.
 * @param {{max: number, batch: number, ceiling: number}} [policy]
 * @returns {Readonly<{prune: boolean, discard: number, keep: number, reason: string}>}
 */
export function retentionPlan(count, policy = RETENTION) {
  const problem = policyProblem(policy);
  if (problem) throw new TypeError(problem);
  if (!Number.isInteger(count) || count < 0) {
    throw new TypeError('The number of entries held is a whole number.');
  }

  if (count <= policy.max) {
    return Object.freeze({
      prune: false,
      discard: 0,
      keep: count,
      reason: `The chain holds ${count} entries and the cap is ${policy.max}. Nothing is discarded.`,
    });
  }

  const target = policy.max - policy.batch;
  // Bounded twice: by the ceiling, so one pass is bounded work; and by `count - 1`, so the newest
  // entry — the one whose write triggered this — can never be among what is discarded.
  const discard = Math.min(count - target, policy.ceiling, count - 1);

  return Object.freeze({
    prune: true,
    discard,
    keep: count - discard,
    reason: `The chain holds ${count} entries, over the cap of ${policy.max}. The oldest ${discard} `
      + `are discarded, leaving ${count - discard}; the entries before the survivor are gone and `
      + 'cannot be verified again, which is why the pass records an anchor and an accounting entry.',
  });
}
