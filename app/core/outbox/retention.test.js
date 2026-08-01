/**
 * DELIVERY EVIDENCE IS BOUNDED BY THE DELIVERY ITSELF, THE BOUND IS A COUNT, AND NOTHING OUTSIDE THIS
 * MODULE CAN ASK FOR A PRUNE.
 *
 * ## What failed, and what this suite has to prove is now impossible
 *
 * The queue shipped an exported, age-based `pruneDelivered` with no production caller. The measured
 * consequence was three delivered entries carrying a purged client's name, notes and readings in plain
 * text, indefinitely, after the coach had been told that client was deleted. A later pass gave it a
 * caller at the tail of `syncNow`. That closed the "no caller" half and left two others open, and this
 * suite is about those two:
 *
 *  1. **A SCHEDULED CALLER IS NOT AN INVARIANT.** A pass that never ran, was skipped as a departing
 *     flush, or threw before its tail simply did not apply the bound, and nothing said so. So the
 *     load-bearing test here DRIVES APPENDS AND DELIVERIES WITH NO SYNCHRONISATION PASS AT ALL and
 *     reads the queue afterwards.
 *  2. **A DATED BOUND IS NOT A BOUND ON THIS DEVICE.** The cutoff came from the device clock, and the
 *     device clock is a setting. Set it backwards and an age-based prune reaches nothing, for ever,
 *     while reporting success every time.
 *
 * ## The paging trap, honoured deliberately
 *
 * Every read of this store is PAGED. A bound that looks held on page one is exactly the failure being
 * closed here, so nothing below asserts a bound from a first page or from a bare count: `allDelivered`
 * walks to exhaustion and every claim is made about ENTRY IDENTITIES.
 *
 * ## Absences are measured, not observed
 *
 * Three claims here are absence-shaped — no clock reaches the decision, no prune is exported, nothing
 * over the cap survives. Each one POISONS its environment rather than emptying it: the same predicate
 * that reports the absence is shown finding the thing it looks for, in the same run.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { SPACES } from '../remote/remote.js';
import * as outboxApi from './outbox.js';
import { STATUS } from './entry.js';
import { queueBackup } from './enqueue.js';
import { UNRESOLVED } from './scrub.js';
import {
  countByStatus, enqueue, entriesByStatus, getEntry, recordAmbiguous, recordDelivered, recordRejected,
} from './queue.js';
import {
  DELIVERED_RETENTION, MAX_DELIVERED_ENTRIES, PRUNE_BATCH, PRUNE_CEILING, deliveredRetentionPlan,
  policyProblem,
} from './retention.js';
import { aDevice } from './testing.js';

const SPACE = SPACES.VISIBLE;

/** A tight policy, so the behaviour AT the cap can be driven without two hundred deliveries. */
const TIGHT = Object.freeze({ max: 6, batch: 2, ceiling: 4 });

/**
 * EVERY delivered entry, walked to the END of the range.
 *
 * Not a count and not a first page. A bound that holds on page one and not on page three is precisely
 * the shape of failure this file exists to rule out, and a count cannot tell which entries survived.
 *
 * @returns {Promise<string[]>} entry ids, oldest first.
 */
async function allDelivered(store) {
  const ids = [];
  let after = null;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const page = await entriesByStatus(store, STATUS.DELIVERED, { limit: 3, after });
    for (const entry of page.items) ids.push(entry.entry_id);
    if (page.done || !page.cursor) break;
    after = page.cursor;
  }
  return ids;
}

/** Queue one entry and deliver it, with NO flush and NO synchronisation pass anywhere near it. */
async function queueAndDeliver(dev, label, options = {}) {
  const { entry } = await queueBackup(dev.store, {
    space: SPACE, baseName: `${label}.json`, payload: `{"label":"${label}"}`, label, now: dev.now(),
  });
  await recordDelivered(dev.store, entry.entry_id, { now: dev.now(), ...options });
  return entry.entry_id;
}

/**
 * THE ENTRY THE PURGE COULD NOT CLEAN — an opaque payload naming a departed client AND a staying one,
 * which `scrub.js` leaves exactly as it is and reports `unresolved` by identity. It is left PENDING,
 * which is the only reason it survives; nothing checks whether an entry is unresolved.
 */
async function anUnresolvedOpaqueEntry(dev) {
  const { entry } = await enqueue(dev.store, {
    operation: 'create',
    space: SPACE,
    // The remote name must carry the idempotency key, or a replay cannot recognise its own earlier
    // write — the queue refuses the enqueue otherwise, which is how this fixture was first wrong.
    name: 'fit.area.opaque-shared.json',
    payload: 'AAAA-sealed-bytes-this-layer-never-opens-BBBB',
    label: 'a sealed export naming two clients',
    refs: ['client-departed', 'client-staying'],
    idempotency_key: 'opaque-shared',
    now: dev.now(),
  });
  return entry.entry_id;
}

// ── the decision: counted, never dated ────────────────────────────────────────────────────────────

test('THE DECISION READS NO CLOCK — asserted against the source, and the scanner is poisoned to prove it reads', () => {
  // A clock reaching the retention decision is exactly the change that looks harmless in review, so
  // this is asserted against the SOURCE and not only against behaviour — the same way the audit log's
  // own retention asserts it, in `core/journal/retention.test.js`.
  const CLOCKS = ['Date.now', 'new Date', 'Date.parse', 'timestamp('];
  const reaches = (source) => CLOCKS.filter((clock) => source.includes(clock));

  const source = readFileSync(new URL('./retention.js', import.meta.url), 'utf8');

  // POSITIVE CONTROL FIRST: a scanner that read nothing at all would report a clean absence below.
  assert.ok(source.includes('deliveredRetentionPlan'), 'the scanner is genuinely reading this module');

  assert.deepEqual(reaches(source), [], 'the retention decision reaches for the clock');

  // NON-VACUITY BY POISONING, not by emptying. The same predicate, on the same source with one clock
  // read put back into it, must find it — otherwise the green above means only that the check is deaf.
  const poisoned = source.replace(
    'const problem = policyProblem(policy);',
    'const problem = policyProblem(policy); const cutoff = Date.now();',
  );
  assert.notEqual(poisoned, source, 'the poison was genuinely applied');
  assert.deepEqual(reaches(poisoned), ['Date.now'], 'and the check finds a reintroduced clock read');
});

test('THE SAME COUNT PLANS THE SAME WAY, AND NO ARGUMENT CAN CARRY AN INSTANT INTO THE DECISION', () => {
  assert.deepEqual(
    deliveredRetentionPlan(MAX_DELIVERED_ENTRIES + 7),
    deliveredRetentionPlan(MAX_DELIVERED_ENTRIES + 7),
    'a function of the count alone plans identically however long ago the first call was',
  );

  assert.equal(DELIVERED_RETENTION.max, MAX_DELIVERED_ENTRIES);
  assert.equal(DELIVERED_RETENTION.batch, PRUNE_BATCH);
  assert.equal(DELIVERED_RETENTION.ceiling, PRUNE_CEILING);
  assert.deepEqual(Object.keys(DELIVERED_RETENTION).sort(), ['batch', 'ceiling', 'max'],
    'the policy carries three counts and nothing that could be an instant');

  assert.throws(() => deliveredRetentionPlan(-1), /whole number/);
  assert.throws(() => deliveredRetentionPlan(1.5), /whole number/);
  assert.throws(() => deliveredRetentionPlan('40'), /whole number/);
});

test('A POLICY THAT COULD DISCARD THE DELIVERY THAT TRIGGERED IT IS REFUSED, NOT QUIETLY CLAMPED', () => {
  assert.match(String(policyProblem({ max: 10, batch: 10, ceiling: 5 })), /just delivered/);
  assert.throws(() => deliveredRetentionPlan(20, { max: 10, batch: 10, ceiling: 5 }), /just delivered/);

  assert.match(String(policyProblem({ max: 1, batch: 1, ceiling: 1 })), /at least 2/);
  assert.match(String(policyProblem({ max: 10, batch: 0, ceiling: 1 })), /at least 1/);
  assert.match(String(policyProblem({ max: 10, batch: 2, ceiling: 0 })), /at least 1/);
  assert.match(String(policyProblem(null)), /object of/);

  assert.equal(policyProblem(DELIVERED_RETENTION), null, 'and the shipped policy is itself usable');
});

test('THE NEWEST DELIVERY CAN NEVER BE WHAT A PLAN DISCARDS, AT ANY COUNT', () => {
  assert.equal(deliveredRetentionPlan(TIGHT.max, TIGHT).prune, false, 'at the cap: nothing goes');
  assert.equal(deliveredRetentionPlan(TIGHT.max + 1, TIGHT).prune, true, 'one over: it does');

  for (const count of [TIGHT.max + 1, TIGHT.max + 5, 500, 5000]) {
    const plan = deliveredRetentionPlan(count, TIGHT);
    assert.ok(plan.discard <= count - 1, `at ${count} the newest entry survives its own bound`);
    assert.ok(plan.discard <= TIGHT.ceiling, `at ${count} one delivery is bounded work`);
    assert.equal(plan.keep, count - plan.discard);
    assert.ok(plan.keep >= 1, 'a bound that emptied the queue would lose the delivery that just landed');
  }
});

// ── the bound, driven with no synchronisation pass at all ─────────────────────────────────────────

test('THE BOUND HOLDS WITH NO SYNCHRONISATION PASS AT ALL — the failure this action closes', async () => {
  // THE LOAD-BEARING TEST. The bound used to be applied at the tail of `syncNow`, so a device that
  // delivered work and never completed a pass kept every delivered entry for ever. Nothing below runs
  // a pass, a flush, or anything that could stand in for one: entries are queued and delivered, and
  // then the queue is read.
  const dev = await aDevice();

  const ids = [];
  for (let i = 0; i < TIGHT.max + 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    ids.push(await queueAndDeliver(dev, `delivery-${i}`, { retention: TIGHT }));
    dev.advance(60_000);
  }

  const plan = deliveredRetentionPlan(TIGHT.max + 1, TIGHT);
  const surviving = await allDelivered(dev.store);

  // Asserted by IDENTITY and walked to the end of the range, never from a first page or a count.
  assert.deepEqual(
    surviving, ids.slice(ids.length - surviving.length),
    'what survives is the newest run of deliveries, contiguous and in order',
  );
  assert.ok(surviving.length <= TIGHT.max, `the queue holds ${surviving.length}, which is within the cap of ${TIGHT.max}`);
  assert.ok(surviving.length >= TIGHT.max - plan.discard, 'and it did not discard more than the plan asked for');

  assert.equal(await getEntry(dev.store, ids[0]), undefined, 'the oldest evidence is genuinely gone');
  assert.ok(await getEntry(dev.store, ids[ids.length - 1]), 'and the newest delivery is genuinely there');

  await dev.store.close();
});

test('LOOSENING THE CAP KEEPS WHAT THE TIGHT ONE DISCARDED — the discriminator probed the other way', async () => {
  // A bound that refuses everything is not a bound. Same fixture, same deliveries, a cap wide enough
  // to hold them: if the survivors were identical, the test above would be measuring nothing.
  const dev = await aDevice();

  const ids = [];
  for (let i = 0; i < TIGHT.max + 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    ids.push(await queueAndDeliver(dev, `delivery-${i}`, { retention: { max: 100, batch: 10, ceiling: 20 } }));
  }

  assert.deepEqual(await allDelivered(dev.store), ids, 'under a wide cap every delivery is still there');
  assert.ok(await getEntry(dev.store, ids[0]), 'including the one the tight cap discarded');

  await dev.store.close();
});

test('A DEVICE CLOCK MOVED FAR BACKWARDS AND FAR FORWARDS CHANGES NOTHING ABOUT WHAT IS KEPT', async () => {
  // The reason the bound is counted. `retention.js` §2 states the authority: L3 requires a bound that
  // "cannot be exceeded by any ordering, configuration or refactor", and on this device the clock is a
  // configuration. Three runs, identical work, wildly different ideas of what time it is.
  const TEN_YEARS = 10 * 365 * 24 * 60 * 60_000;

  const run = async (skew) => {
    const dev = await aDevice();
    const ids = [];
    for (let i = 0; i < TIGHT.max + 3; i += 1) {
      if (i === 2) dev.advance(skew);
      // eslint-disable-next-line no-await-in-loop
      ids.push(await queueAndDeliver(dev, `delivery-${i}`, { retention: TIGHT }));
    }
    const surviving = await allDelivered(dev.store);
    const settled = await Promise.all(surviving.map(async (id) => (await getEntry(dev.store, id)).settled_at));
    await dev.store.close();
    return { ids, surviving, settled, kept: surviving.map((id) => ids.indexOf(id)) };
  };

  const steady = await run(60_000);
  const forwards = await run(TEN_YEARS);
  const backwards = await run(-TEN_YEARS);

  // FIXTURE CHECK, and it is load-bearing: without it these could agree because the clock never
  // actually reached the entries and all three runs were the same run.
  assert.ok(
    forwards.settled.some((at) => at > '2035-01-01'), 'the forward skew genuinely reached the stored entries',
  );
  assert.ok(
    backwards.settled.some((at) => at < '2020-01-01'), 'and so did the backward skew',
  );

  assert.deepEqual(forwards.kept, steady.kept, 'a clock ten years fast keeps exactly the same deliveries');
  assert.deepEqual(backwards.kept, steady.kept, 'and so does a clock ten years slow');
});

test('NON-VACUITY FOR THE CLOCK PROOF: THE SUPERSEDED DATED RULE FAILS ON THE SAME FIXTURE', async () => {
  // The probe the test above needs. "The clock changes nothing" is worth exactly as much as the
  // demonstration that a dated rule WOULD have changed something — and the direction matters, because
  // it is the one that reads as harmless: a clock set backwards makes an age-based prune reach nothing
  // at all, for ever, while reporting success on every pass.
  const dev = await aDevice();

  const ids = [];
  for (let i = 0; i < TIGHT.max + 3; i += 1) {
    if (i === 2) dev.advance(-10 * 365 * 24 * 60 * 60_000);
    // eslint-disable-next-line no-await-in-loop
    ids.push(await queueAndDeliver(dev, `delivery-${i}`, { retention: TIGHT }));
  }

  const surviving = await allDelivered(dev.store);
  assert.ok(surviving.length <= TIGHT.max, 'the counted bound held under the skew');

  // THE SUPERSEDED RULE, REINTRODUCED AND RUN: keep every delivered entry settled within the window,
  // where the window is measured from what this device believes the time to be. This is what
  // `core/sync/retention.js` computed.
  const WINDOW_MS = 72 * 60 * 60_000;
  const cutoff = new Date(Date.parse(dev.now()) - WINDOW_MS).toISOString();
  const stored = await Promise.all(ids.map((id) => getEntry(dev.store, id)));
  const datedWouldKeep = stored.filter((entry) => entry && entry.settled_at >= cutoff);

  assert.equal(
    datedWouldKeep.length, stored.filter(Boolean).length,
    'THE DEFECT, IN ONE NUMBER: the dated rule would have kept every entry that exists',
  );
  assert.ok(
    stored.filter(Boolean).length > 0 && stored.filter(Boolean).every((entry) => entry.settled_at >= cutoff),
    'THE DEFECT, DEMONSTRATED: with the clock moved backwards every surviving entry is INSIDE the '
    + 'dated window, so the superseded rule would have discarded nothing here — and would have gone on '
    + 'discarding nothing for as long as the clock stayed there, reporting a successful prune each time',
  );

  await dev.store.close();
});

// ── what the bound may never reach ────────────────────────────────────────────────────────────────

test('NOTHING OUTSIDE THE DELIVERED STATUS IS REACHABLE, WITH A POSITIVE CONTROL IN THE SAME RUN', async () => {
  const dev = await aDevice();

  const plant = async (key, settle) => {
    const { entry } = await enqueue(dev.store, {
      operation: 'create', space: SPACE, name: `fit.area.${key}.json`, label: key,
      payload: '{"document_version":1,"records":[]}', idempotency_key: key, now: dev.now(),
    });
    await settle(entry.entry_id);
    return entry.entry_id;
  };

  const pending = await plant('pending', async () => {});
  const rejected = await plant('rejected', (id) => recordRejected(dev.store, id, new Error('refused'), { now: dev.now() }));
  const ambiguous = await plant('ambiguous', (id) => recordAmbiguous(dev.store, id, {
    how: 'two files answer to this name', now: dev.now(),
  }));

  const delivered = [];
  for (let i = 0; i < TIGHT.max + 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    delivered.push(await queueAndDeliver(dev, `delivery-${i}`, { retention: TIGHT }));
  }

  // The survivals come FIRST, so a bound widened past its range reds HERE rather than being shadowed
  // by a tally below. A guard whose red always arrives from an earlier assertion has never been seen
  // to fail and is not a proven guard.
  assert.ok(await getEntry(dev.store, pending), 'pending: still being attempted');
  assert.ok(await getEntry(dev.store, rejected), 'rejected: the problem it records did not stop mattering');
  assert.ok(await getEntry(dev.store, ambiguous), 'ambiguous: and neither did one nobody can tell the outcome of');

  // THE POSITIVE CONTROL, same run: without it all three survivals would also be satisfied by a bound
  // that did nothing whatsoever.
  assert.equal(await getEntry(dev.store, delivered[0]), undefined, 'the bound genuinely ran on this fixture');
  assert.equal(await countByStatus(dev.store, STATUS.PENDING), 1, 'and it did not quietly take the pending one');

  await dev.store.close();
});

test('THE ENTRY scrub.js DELIBERATELY LEAVES UNRESOLVED IS UNTOUCHED, BYTE FOR BYTE', async () => {
  // When a client is purged, `scrub.js` leaves alone an entry whose payload is opaque and whose refs
  // name both the departed client and a staying one — it cannot be cleaned without destroying the
  // other client's data — and reports it `unresolved` by identity. A surface exists whose whole job is
  // to keep naming those. If the bound ate one, that surface would go QUIET, and quiet reads as good
  // news, which is the worst shape a failure in this build can take.
  const dev = await aDevice();

  const opaque = await anUnresolvedOpaqueEntry(dev);
  const delivered = [];
  for (let i = 0; i < TIGHT.max * 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    delivered.push(await queueAndDeliver(dev, `delivery-${i}`, { retention: TIGHT }));
  }

  // ASSERTED FIRST, ON PURPOSE. Ordered after a tally, this check would be shadowed: a widened range
  // would red on the count and this — the one that matters — would never have been seen to fail.
  const survivor = await getEntry(dev.store, opaque);
  assert.ok(survivor, `the ${UNRESOLVED.OPAQUE_SHARED} entry must survive the bound untouched`);
  assert.equal(survivor.payload, 'AAAA-sealed-bytes-this-layer-never-opens-BBBB', 'and untouched means byte for byte');
  assert.deepEqual([...survivor.refs], ['client-departed', 'client-staying']);
  assert.equal(survivor.status, STATUS.PENDING, 'it survives because it is NOT DELIVERED — nothing checks unresolvedness');

  // THE POSITIVE CONTROL: a bound that never ran would satisfy every line above.
  assert.equal(await getEntry(dev.store, delivered[0]), undefined, 'the bound was genuinely applied in this run');

  await dev.store.close();
});

// ── the absence of a public prune, measured ───────────────────────────────────────────────────────

test('THERE IS NO PUBLIC PRUNE ON THE MODULE API — the absence measured, and the predicate poisoned', async () => {
  // L3 asks for the pruning function to be module-private as part of the same decision that makes its
  // caller structural, so that a test CANNOT report that "prune works when invoked" and the only
  // observable retention behaviour is what the real growth path causes. This is that assertion, and it
  // is worthless unless the predicate is shown to be capable of finding something.
  //
  // It looks for a CALLABLE, not for a name: `PRUNE_BATCH` and `PRUNE_CEILING` are policy counts and
  // publishing them removes nothing from anybody. What may not exist is something a caller can invoke.
  const invocablePrunes = (api) => Object.keys(api)
    .filter((name) => /prune|purge|forget|discard|evict/i.test(name))
    .filter((name) => typeof api[name] === 'function');

  // POSITIVE CONTROL FIRST: the namespace was genuinely read.
  assert.ok(Object.keys(outboxApi).includes('recordDelivered'), 'the module API was genuinely enumerated');
  assert.ok(typeof outboxApi.deliveredRetentionPlan === 'function', 'and it does publish the DECISION, which is pure');

  assert.deepEqual(invocablePrunes(outboxApi), [], 'no prune is reachable from outside this module');

  // POISONED, not emptied: the same predicate over the same API with one prune restored onto it.
  assert.deepEqual(
    invocablePrunes({ ...outboxApi, pruneDelivered: async () => 0 }), ['pruneDelivered'],
    'and the predicate finds a restored public prune, so its silence above means something',
  );

  // The one knob that DOES exist is not a prune: it can only make the bound tighter, and it is the
  // real growth path that applies it. Proven rather than asserted, because "it is only a policy" is
  // exactly the sentence under which an exported prune would come back.
  const dev = await aDevice();
  const kept = await queueAndDeliver(dev, 'the-only-delivery', { retention: TIGHT });
  assert.ok(await getEntry(dev.store, kept), 'handing in a policy cannot itself remove anything');
  await dev.store.close();
});
