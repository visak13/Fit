/**
 * THE RETENTION POLICY, AT THE NUMBERS IT ACTUALLY SHIPS WITH.
 *
 * The decision is separated from the mechanism precisely so it can be checked at the REAL cap
 * without writing five thousand rows — a policy only ever tested at a convenient toy cap is a policy
 * nobody has checked. So the shipped numbers are exercised here, and the durable suite beside this
 * one proves that appending is what applies them.
 *
 * The properties asserted are the ones a later editor could break while making the numbers "nicer":
 * that the newest entry is never discarded, that a single pass is bounded, that the chain is never
 * emptied, and that the policy converges instead of oscillating.
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  MAX_ENTRIES_PER_DEVICE, PRUNE_BATCH, PRUNE_CEILING, RETENTION, policyProblem, retentionPlan,
} from './retention.js';

test('the shipped policy is a real bound: a cap, a batch below it, and a ceiling on one pass', () => {
  assert.equal(policyProblem(RETENTION), null);
  assert.equal(RETENTION.max, MAX_ENTRIES_PER_DEVICE);
  assert.equal(RETENTION.batch, PRUNE_BATCH);
  assert.equal(RETENTION.ceiling, PRUNE_CEILING);
  assert.ok(RETENTION.batch < RETENTION.max, 'the batch must be smaller than the cap');
  assert.ok(RETENTION.max >= 1000, 'volumes are unknown; the cap must not assume a small practice');
});

test('under the cap, nothing is discarded — at the cap exactly, still nothing', () => {
  assert.equal(retentionPlan(0).prune, false);
  assert.equal(retentionPlan(1).discard, 0);
  assert.equal(retentionPlan(MAX_ENTRIES_PER_DEVICE - 1).prune, false);
  const atCap = retentionPlan(MAX_ENTRIES_PER_DEVICE);
  assert.equal(atCap.prune, false);
  assert.equal(atCap.discard, 0);
  assert.equal(atCap.keep, MAX_ENTRIES_PER_DEVICE);
});

test('one over the cap prunes to the cap LESS the batch, so the next prune is a batch away', () => {
  const plan = retentionPlan(MAX_ENTRIES_PER_DEVICE + 1);
  assert.equal(plan.prune, true);
  assert.equal(plan.keep, MAX_ENTRIES_PER_DEVICE - PRUNE_BATCH);
  assert.equal(plan.discard, PRUNE_BATCH + 1);
});

test('the headroom is what keeps the accounting entry rare rather than constant', () => {
  // Without headroom a prune would run on EVERY append once the cap is reached, and each one writes
  // a journal.retention_pruned entry — the log would eventually be mostly its own housekeeping.
  const first = retentionPlan(MAX_ENTRIES_PER_DEVICE + 1);
  // `keep` plus one: the pass appends its own journal.retention_pruned entry after discarding, so
  // that is what the chain actually holds when the next append arrives.
  let held = first.keep + 1;
  let appendsUntilNextPrune = 0;
  while (retentionPlan(held).prune === false) {
    held += 1;
    appendsUntilNextPrune += 1;
  }
  assert.equal(appendsUntilNextPrune, PRUNE_BATCH);
});

test('a single pass is bounded, so a cap lowered later converges instead of blocking one commit', () => {
  // The realistic way this arises: a cap reduced in a later version meets a chain built under the
  // old one. Without a ceiling, one transaction would be asked to delete every excess row at once,
  // while the coach waits on a save.
  const huge = retentionPlan(MAX_ENTRIES_PER_DEVICE + 50_000);
  assert.equal(huge.discard, PRUNE_CEILING);

  // And it does converge: repeated passes reach the target rather than stalling above it.
  let held = MAX_ENTRIES_PER_DEVICE + 50_000;
  let passes = 0;
  while (retentionPlan(held).prune) {
    held -= retentionPlan(held).discard;
    passes += 1;
    assert.ok(passes < 200, 'retention must converge');
  }
  assert.ok(held <= MAX_ENTRIES_PER_DEVICE);
  assert.ok(passes > 1, 'a lowered cap is meant to take several bounded passes, not one huge one');
});

test('the newest entry is NEVER among what is discarded, at any count and any policy', () => {
  // The entry that triggered the prune is the one the log would be worst off missing: the log would
  // then have no record of the event that caused its own housekeeping.
  for (const count of [3, 4, 10, 100, MAX_ENTRIES_PER_DEVICE + 1, MAX_ENTRIES_PER_DEVICE + 9999]) {
    for (const policy of [RETENTION, { max: 2, batch: 1, ceiling: 1 }, { max: 5, batch: 4, ceiling: 999 }]) {
      const plan = retentionPlan(count, policy);
      assert.ok(plan.discard < count, `count ${count} discarded everything`);
      assert.ok(plan.keep >= 1, `count ${count} left nothing`);
    }
  }
});

test('the plan says what it discards and what that costs, rather than returning a bare number', () => {
  const plan = retentionPlan(MAX_ENTRIES_PER_DEVICE + 1);
  assert.match(plan.reason, /cannot be verified again/);
  assert.match(plan.reason, /anchor/);
  assert.match(retentionPlan(1).reason, /Nothing is discarded/);
});

test('a policy whose batch is not smaller than its cap is REFUSED, not quietly clamped', () => {
  const problem = policyProblem({ max: 10, batch: 10, ceiling: 5 });
  assert.match(String(problem), /discard the entry that triggered it/);
  assert.throws(() => retentionPlan(20, { max: 10, batch: 10, ceiling: 5 }), /triggered it/);

  assert.match(String(policyProblem({ max: 1, batch: 1, ceiling: 1 })), /at least 2/);
  assert.match(String(policyProblem({ max: 10, batch: 0, ceiling: 1 })), /at least 1/);
  assert.match(String(policyProblem({ max: 10, batch: 2, ceiling: 0 })), /at least 1/);
  assert.match(String(policyProblem(null)), /object of/);
});

test('the count handed in must be a whole number of entries', () => {
  assert.throws(() => retentionPlan(-1), /whole number/);
  assert.throws(() => retentionPlan(1.5), /whole number/);
  assert.throws(() => retentionPlan('40'), /whole number/);
});

test('retention is counted and never dated, because the device clock is not trustworthy', () => {
  // A clock the person being logged can set would make an age-based policy a delete button for the
  // audit log: set the clock forward, and honest housekeeping discards the evidence. So the decision
  // must be a function of the COUNT alone — asserted against the source, because a timestamp reaching
  // this file is exactly the change that would look harmless in review.
  const source = readFileSync(new URL('./retention.js', import.meta.url), 'utf8');
  for (const clock of ['Date.now', 'new Date', 'timestamp(', 'Date.parse']) {
    assert.ok(!source.includes(clock), `retention.js reaches for the clock: ${clock}`);
  }
  assert.deepEqual(
    retentionPlan(MAX_ENTRIES_PER_DEVICE + 7),
    retentionPlan(MAX_ENTRIES_PER_DEVICE + 7),
    'the same count must plan the same way whatever the clock says',
  );
});
