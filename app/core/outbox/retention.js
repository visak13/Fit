/**
 * HOW MUCH DELIVERY EVIDENCE THE QUEUE KEEPS — the decision, as a value, counted and never dated.
 *
 * This file is the DECISION. `queue.js` beside it is the mechanism that carries it out, and it is the
 * only caller: the bound is applied inside `recordDelivered`, in the same transaction that moves an
 * entry into `delivered`, so it runs on the one path that can grow the delivered set and there is no
 * sweep that might not run.
 *
 * ---
 *
 * ## 1. WHY THE POLICY IS IN THIS PACKAGE NOW, HAVING DELIBERATELY NOT BEEN
 *
 * `OUTBOX.md` §8 said for a long time that this package holds NO policy — that how long delivery
 * evidence lasts is *"a decision for a caller who knows, not a default that quietly forgets"* — and a
 * retention constant living here would be exactly the default it refused.
 *
 * That reasoning was overturned, and the overturning is recorded rather than quietly applied. The
 * compiled security specialist's field amendment **L3** says, in its own words:
 *
 * > *"A retention policy's caller must be structural, not scheduled. Where a store grows in exactly
 * > ONE way, enforce the bound inside the only function that can add to it, in the same transaction —
 * > then the bound cannot be exceeded by any ordering, configuration or refactor, and there is no
 * > sweep that might not run. Make the pruning function module-private as part of the same decision: a
 * > test then CANNOT report that 'prune works when invoked', so the only observable retention
 * > behaviour is what the real growth path causes."*
 *
 * and it names this very queue as one of the two failures it is the structural answer to: *"outbox
 * entries pruned only by a caller who decides to"*.
 *
 * A bound enforced inside the only growth path cannot be held by a caller in another package, because
 * the growth path is here. So the policy is here. The package's older instinct was not wrong about
 * defaults — it was wrong about where safety comes from, and a bound that no ordering can miss is
 * worth more than a package that holds no numbers.
 *
 * ## 2. COUNTED, NEVER DATED — and the authority for that is L3, NOT L4
 *
 * Be exact about this, because it is the one thing about this file that is easy to get wrong by
 * borrowing an argument that does not reach.
 *
 * Amendment **L4** — *"Retention on an audit log must be counted, NEVER dated"* — is written about THE
 * AUDIT LOG. Every scoping noun in it is the log: it reasons about *"a delete button for the audit
 * log"*, and its counted alternative rests on a sequence *"assigned by the chain"*, which is the
 * journal's hash chain and not this queue's counter. **L4 does not, by its own words, reach the sync
 * outbox**, and it is not claimed here that it does. Its harm model does not transfer either: L4 fears
 * an attacker DELETING evidence by moving the clock forward, and nothing in this queue is evidence
 * anyone would want gone.
 *
 * The bound here is counted for a different reason, and the reason is L3's own promise: **the bound
 * cannot be exceeded by any ordering, configuration or refactor.** A dated bound cannot keep that
 * promise on this device. The cutoff of an age-based prune is derived from the device clock, and the
 * device clock is a setting:
 *
 *  - set it BACKWARDS a year and the cutoff moves back with it. No delivered entry is old enough to
 *    reach, nothing is removed, and the delivered set grows without limit — **while the prune reports
 *    success every single time**. The bound is exceeded and nothing anywhere says so.
 *
 * That matters more here than it would elsewhere, because amendment **L1** [required] establishes what
 * these rows are: *"A durable outbox or send queue is a SECOND copy of every record it carries"*. A
 * bound that a clock setting can suspend indefinitely is not a bound on a second copy of the coach's
 * clients' records; it is a hope about one.
 *
 * A count cannot be moved by the clock. `seq` is allocated from the counter in the store's `meta`
 * store inside the enqueueing transaction, it is monotonic per device, and nothing outside `enqueue`
 * can choose it. So the queue keeps the newest {@link MAX_DELIVERED_ENTRIES} delivered entries, and
 * nothing about the device's idea of the time changes which those are.
 *
 * **Asserted against the source, not only against behaviour**, exactly as the journal's own retention
 * is: a clock reaching this module is precisely the change that looks harmless in review.
 *
 * ## 3. WHERE THE NUMBER COMES FROM
 *
 * The requirement the delivered set actually has to meet is unchanged from the derivation this build
 * already made, and it is short: delivered entries are the LOCAL half of the duplicate defence, and
 * that half can only fire for an idempotency key that can be minted twice. Of the three enqueue sites
 * in the application two mint a fresh random key per call — for which a stored entry can never match —
 * and the third mints `remove:<file_id>`, which can only recur inside a listing taken before the
 * removal landed. That is **one synchronisation pass**, not days and not hundreds of entries.
 *
 * {@link MAX_DELIVERED_ENTRIES} clears that requirement by roughly an order of magnitude, which is the
 * same relationship the superseded seventy-two-hour window had to it. It is deliberately far smaller
 * than the journal's cap, because these rows are not a quarter of a kilobyte each: an outbox entry
 * carries a full payload, so this is a bound on megabytes of a second copy rather than on a list of
 * short facts.
 *
 * ## 4. WHAT THE BOUND MAY NEVER REACH
 *
 * Only `delivered`. Pending, rejected and ambiguous entries are outside it, and that is what spares
 * the entry `scrub.js` deliberately cannot clean — an opaque payload naming both a departed and a
 * staying client, left exactly as it is and reported `unresolved`, with a surface whose whole job is
 * to keep naming it. Be exact about WHY it survives, because the name suggests the wrong reason: it
 * survives because it is NOT DELIVERED. Nothing checks whether an entry is unresolved.
 *
 * And the NEWEST delivered entry always survives, by construction — a bound that could discard the
 * entry whose own delivery triggered it would lose the evidence of the delivery that just happened.
 */

/**
 * How many delivered entries one device's queue may hold.
 *
 * See §3. Clears the duplicate defence's real requirement — about one synchronisation pass — by
 * roughly an order of magnitude, and bounds a store whose rows carry full payloads.
 */
export const MAX_DELIVERED_ENTRIES = 200;

/**
 * How far below the cap a prune takes the delivered set, and therefore how many deliveries pass
 * between one prune and the next.
 *
 * Headroom rather than discarding one row per delivery: it keeps the work off the delivery path
 * except once every {@link PRUNE_BATCH} deliveries, and the cost is bounded and predictable.
 */
export const PRUNE_BATCH = 50;

/** The most one delivery may discard, so a cap LOWERED later converges over several deliveries. */
export const PRUNE_CEILING = 100;

/**
 * The retention policy, as a value.
 *
 * A value rather than three constants read directly, so a caller can be handed a different one — which
 * is how behaviour at the cap is tested without driving two hundred deliveries. Handing one in is the
 * ONLY knob this package offers, and it is deliberately not a prune: a caller can make the bound
 * tighter and then watch what the real growth path does, and cannot ask for a prune at all.
 *
 * @type {Readonly<{max: number, batch: number, ceiling: number}>}
 */
export const DELIVERED_RETENTION = Object.freeze({
  max: MAX_DELIVERED_ENTRIES,
  batch: PRUNE_BATCH,
  ceiling: PRUNE_CEILING,
});

/**
 * Whether a policy is usable, or the reason it is not.
 *
 * Checked rather than assumed because a policy whose batch is not smaller than its cap would ask a
 * delivery to discard the entry it had just delivered — the queue would then be missing the evidence
 * of the delivery that caused its own housekeeping, which is the one shape of loss this bound must
 * never produce.
 *
 * @param {{max: number, batch: number, ceiling: number}} policy
 * @returns {string|null} null when the policy is usable.
 */
export function policyProblem(policy) {
  if (policy === null || typeof policy !== 'object') {
    return 'A retention policy is an object of { max, batch, ceiling }.';
  }
  const { max, batch, ceiling } = policy;
  if (!Number.isInteger(max) || max < 2) return 'A retention cap is a whole number of entries, at least 2.';
  if (!Number.isInteger(batch) || batch < 1) return 'A prune batch is a whole number of entries, at least 1.';
  if (!Number.isInteger(ceiling) || ceiling < 1) return 'A prune ceiling is a whole number of entries, at least 1.';
  if (batch >= max) {
    return 'A prune batch must be smaller than the cap, or a delivery would discard the entry it had '
      + 'just delivered and the queue would be missing the evidence of the delivery that caused its '
      + 'own housekeeping.';
  }
  return null;
}

/**
 * What a delivery should discard, given how many delivered entries the queue holds RIGHT NOW.
 *
 * Pure and synchronous, and — the load-bearing property — a function of the COUNT alone. Nothing in
 * this module reads the device's idea of the time, so no setting of it changes what is kept. See §2.
 *
 * `count` is the count AFTER the entry that triggered the check became delivered, because that entry
 * is what pushed the set over.
 *
 * `discard` never reaches `count`: at least one entry always survives, and by construction the
 * survivor set always includes the newest.
 *
 * @param {number} count How many delivered entries the queue holds.
 * @param {{max: number, batch: number, ceiling: number}} [policy]
 * @returns {Readonly<{prune: boolean, discard: number, keep: number, reason: string}>}
 */
export function deliveredRetentionPlan(count, policy = DELIVERED_RETENTION) {
  const problem = policyProblem(policy);
  if (problem) throw new TypeError(problem);
  if (!Number.isInteger(count) || count < 0) {
    throw new TypeError('The number of delivered entries held is a whole number.');
  }

  if (count <= policy.max) {
    return Object.freeze({
      prune: false,
      discard: 0,
      keep: count,
      reason: `The queue holds ${count} delivered entries and the cap is ${policy.max}. Nothing is discarded.`,
    });
  }

  const target = policy.max - policy.batch;
  // Bounded twice: by the ceiling, so one delivery is bounded work; and by `count - 1`, so the newest
  // delivered entry — the one whose delivery triggered this — can never be among what is discarded.
  const discard = Math.min(count - target, policy.ceiling, count - 1);

  return Object.freeze({
    prune: true,
    discard,
    keep: count - discard,
    reason: `The queue holds ${count} delivered entries, over the cap of ${policy.max}. The oldest `
      + `${discard} are discarded, leaving ${count - discard}; they were the evidence those deliveries `
      + 'happened, and that evidence is gone rather than archived.',
  });
}
