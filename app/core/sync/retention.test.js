/**
 * THIS PACKAGE NO LONGER BOUNDS THE OUTBOX, AND THAT IS THE FIX RATHER THAN A REGRESSION.
 *
 * ## What this file used to prove, and why proving it was not enough
 *
 * `core/sync/retention.js` held a seventy-two-hour window and `syncNow` called it at the tail of every
 * pass. That closed a real defect — an age prune with no caller at all, which had left delivered
 * entries carrying a purged client's name in plain text indefinitely — and this suite proved, at
 * length, that the tail call ran.
 *
 * It proved the wrong thing. A tail is a place a pass REACHES, and this pass has several ordinary ways
 * not to reach it: it can throw, the tab can be torn down mid-flight, and the departing `leave`
 * trigger deliberately skipped the prune so housekeeping was not competing with the flush. After every
 * one of those the bound was simply not applied, and nothing anywhere said so. An invariant that holds
 * only when a pass completes is a habit.
 *
 * The compiled security specialist's amendment **L3** names this queue as one of the two failures it
 * answers — *"outbox entries pruned only by a caller who decides to"* — and asks for the bound to be
 * enforced *"inside the only function that can add to it, in the same transaction"*. That function is
 * `recordDelivered`, and it is in `core/outbox`. So the bound moved there, the module went with it,
 * and this file's job inverted: it now proves that this package holds NO second enforcer, and that
 * every way a pass can fail to reach its own tail no longer strands anything.
 *
 * `core/outbox/retention.test.js` proves the bound itself, including that it is a count and not an
 * age. This suite proves the SYNC-SIDE claims, driven through real passes.
 *
 * ## Two enforcers would be worse than the one this replaced
 *
 * A second bound here, with its own rule, could disagree with the first — and the disagreement would
 * be silent, since both would report success. So "there is no retention in this package" is asserted
 * mechanically below and not left as a note somebody deletes.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

import { RemoteCredentialExpired, SPACES } from '../remote/remote.js';
import { aClient } from '../model/fixtures.js';
import * as syncApi from './sync.js';
import {
  MAX_DELIVERED_ENTRIES, STATUS, entriesByStatus, enqueue, getEntry, queueBackup, recordDelivered,
} from '../outbox/outbox.js';
import { SYNC_TRIGGERS, syncNow } from './engine.js';
import { T0, aWorld } from './testing.js';

const SPACE = SPACES.VISIBLE;

/** A tight policy, for the claims that do not need the engine to apply the shipped one. */
const TIGHT = Object.freeze({ max: 6, batch: 2, ceiling: 4 });

/**
 * EVERY delivered entry, walked to the END of the range — never a first page and never a count.
 * A bound that looks held on page one is exactly the failure being closed.
 */
async function allDelivered(store) {
  const ids = [];
  let after = null;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const page = await entriesByStatus(store, STATUS.DELIVERED, { limit: 50, after });
    for (const entry of page.items) ids.push(entry.entry_id);
    if (page.done || !page.cursor) break;
    after = page.cursor;
  }
  return ids;
}

/** Queue one entry and deliver it, with no flush and no pass. */
async function queueAndDeliver(dev, label, options = {}) {
  const { entry } = await queueBackup(dev.store, {
    space: SPACE, baseName: `${label}.json`, payload: `{"label":"${label}"}`, label, now: T0,
  });
  await recordDelivered(dev.store, entry.entry_id, { now: T0, ...options });
  return entry.entry_id;
}

/**
 * Fill the delivered set to EXACTLY the shipped cap, so one more delivery — made by a real pass — is
 * what tips it over. The shipped policy is what a pass applies; a pass cannot be handed a tighter one,
 * and inventing a way to hand it one would be inventing the knob this design exists to refuse.
 */
async function fillToTheCap(dev) {
  const ids = [];
  for (let i = 0; i < MAX_DELIVERED_ENTRIES; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    ids.push(await queueAndDeliver(dev, `prefill-${i}`));
  }
  assert.equal((await allDelivered(dev.store)).length, MAX_DELIVERED_ENTRIES, 'fixture: the set is exactly at the cap');
  return ids;
}

/** One device in a world, and the tidy-up. */
async function aDeviceInAWorld() {
  const world = aWorld();
  const dev = await world.device('coach-laptop');
  return { world, dev, close: () => world.close() };
}

// ── there is no second enforcer in this package ───────────────────────────────────────────────────

test('THE SUPERSEDED RETENTION MODULE IS GONE FROM THIS PACKAGE, AND THE CHECK CAN SEE THE DIRECTORY', () => {
  const here = (name) => new URL(`./${name}`, import.meta.url);

  // POSITIVE CONTROL FIRST. An absence check against a path the process cannot read reports a clean
  // absence for the wrong reason, and this build has already recorded two confident false absences.
  assert.ok(existsSync(here('engine.js')), 'the check is genuinely reading this directory');

  assert.equal(existsSync(here('retention.js')), false, 'core/sync no longer holds a retention policy');
});

test('THE ENGINE PERFORMS NO PRUNE OF ITS OWN — measured against its source, with the scanner poisoned', () => {
  const reaches = (source) => ['pruneDeliver', 'pruneDelivered', 'retention.js', 'RETENTION_PAGE']
    .filter((needle) => source.includes(needle));

  const source = readFileSync(new URL('./engine.js', import.meta.url), 'utf8');

  assert.ok(source.includes('syncNow'), 'the scanner is genuinely reading the engine');
  assert.deepEqual(reaches(source), [], 'the pass has no housekeeping step and imports no prune');

  // POISONED rather than emptied: the same predicate, the same source, one call put back.
  const poisoned = source.replace('  return {\n    trigger,', '  await pruneDeliveryEvidence(store);\n  return {\n    trigger,');
  assert.notEqual(poisoned, source, 'the poison was genuinely applied');
  assert.deepEqual(reaches(poisoned), ['pruneDeliver'], 'and a reinstated tail call is found');
});

test('THIS PACKAGE PUBLISHES NOTHING THAT COULD BE A SECOND ENFORCER', () => {
  // Deliberately NOT matching "purge". This package's purge routines are the departed-client deletion
  // path — a different subject with a different trigger, and sweeping them into a retention check
  // would make this guard red for a reason that has nothing to do with what it is guarding.
  const invocablePrunes = (api) => Object.keys(api)
    .filter((name) => /prune|forget|evict|retention/i.test(name))
    .filter((name) => typeof api[name] === 'function');

  assert.ok(typeof syncApi.syncNow === 'function', 'the namespace was genuinely enumerated');
  assert.deepEqual(invocablePrunes(syncApi), [], 'no retention routine is reachable from core/sync');

  assert.deepEqual(
    invocablePrunes({ ...syncApi, pruneDeliveryEvidence: async () => ({}) }), ['pruneDeliveryEvidence'],
    'and the predicate finds one restored, so its silence above means something',
  );
});

test('A PASS NO LONGER REPORTS WHAT ITS HOUSEKEEPING DID, BECAUSE IT NO LONGER DOES ANY', async () => {
  const { world, dev, close } = await aDeviceInAWorld();

  const report = await syncNow(dev.store, world.remote, { trigger: SYNC_TRIGGERS.OPEN, space: SPACE, now: T0 });

  // POSITIVE CONTROL: the report was genuinely produced and genuinely read.
  assert.ok(report.outbox, 'the pass still reports the queue figures the accountability surface needs');
  assert.equal(Object.hasOwn(report, 'retention'), false, 'and carries no retention outcome at all');

  await close();
});

// ── every way a pass can fail to reach its tail, and none of them strands anything ────────────────

test('THE BOUND IS APPLIED BY A REAL PASS S OWN DELIVERIES, AT THE SHIPPED CAP', async () => {
  const { world, dev, close } = await aDeviceInAWorld();
  const prefilled = await fillToTheCap(dev);

  // Real work, delivered by a real pass through the real flush.
  await dev.store.create('client', aClient({ name: 'a client whose record must reach the backup' }), { now: T0 });
  const report = await syncNow(dev.store, world.remote, { trigger: SYNC_TRIGGERS.OPEN, space: SPACE, now: T0 });

  assert.ok(report.pushed.records > 0 || report.pushed.queued > 0, 'fixture: the pass genuinely delivered something');

  const surviving = await allDelivered(dev.store);
  assert.ok(surviving.length <= MAX_DELIVERED_ENTRIES, `the set holds ${surviving.length}, within the cap`);
  assert.equal(await getEntry(dev.store, prefilled[0]), undefined, 'and the oldest evidence went, by identity');
  assert.ok(await getEntry(dev.store, prefilled[prefilled.length - 1]), 'while recent evidence stayed');

  await close();
});

test('THE DEPARTING PASS CAN NO LONGER STRAND ANYTHING — the skip that used to be safe is now moot', async () => {
  // `leave` runs while the platform is tearing the tab down and may be killed mid-flight, so the tail
  // prune was skipped on it deliberately and the next `open` was expected to catch up. On a device
  // whose only passes are departing ones, that expectation never arrives. The bound no longer depends
  // on it: it is applied by the delivery, and a `leave` pass delivers exactly like any other.
  const { world, dev, close } = await aDeviceInAWorld();
  const prefilled = await fillToTheCap(dev);

  await dev.store.create('client', aClient({ name: 'saved just as the tab goes away' }), { now: T0 });
  await syncNow(dev.store, world.remote, { trigger: SYNC_TRIGGERS.LEAVE, space: SPACE, now: T0 });

  const surviving = await allDelivered(dev.store);
  assert.ok(surviving.length <= MAX_DELIVERED_ENTRIES, 'a leave-only device is bounded like any other');
  assert.equal(
    await getEntry(dev.store, prefilled[0]), undefined,
    'the oldest evidence left on a departing pass, which under the tail prune it never could',
  );

  await close();
});

test('A PASS THAT CANNOT REACH THE SERVICE AT ALL LEAVES THE BOUND HELD', async () => {
  // The credential is foreground-only and normally absent, so this is the ordinary state of most
  // opens rather than an edge case. Under the tail prune the bound depended on passes that got far
  // enough; here the deliveries already happened and the pass adds nothing to the invariant.
  const { dev, close } = await aDeviceInAWorld();

  const ids = [];
  for (let i = 0; i < TIGHT.max + 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    ids.push(await queueAndDeliver(dev, `delivery-${i}`, { retention: TIGHT }));
  }
  const beforeThePass = await allDelivered(dev.store);
  assert.ok(beforeThePass.length <= TIGHT.max, 'the bound was already held before any pass ran');

  const deadRemote = new Proxy({}, {
    get: () => async () => { throw new RemoteCredentialExpired('the credential has expired'); },
  });
  const report = await syncNow(dev.store, /** @type {any} */ (deadRemote), {
    trigger: SYNC_TRIGGERS.OPEN, space: SPACE, now: T0,
  });

  assert.equal(report.completion, null, 'fixture: this pass genuinely could not reach the service');
  assert.ok(report.failures.length > 0, 'and it said so');
  assert.deepEqual(await allDelivered(dev.store), beforeThePass, 'and the queue is exactly as the deliveries left it');
  assert.equal(await getEntry(dev.store, ids[0]), undefined, 'including the oldest, which the deliveries removed');

  await close();
});

test('NO PASS AT ALL: THE QUEUE IS BOUNDED ON A DEVICE THAT HAS NEVER SYNCHRONISED SUCCESSFULLY', async () => {
  // The failure in one sentence, from this package's side: retention that lives in a pass does not
  // happen on a device where a pass does not happen. Nothing here calls syncNow.
  const { dev, close } = await aDeviceInAWorld();

  const ids = [];
  for (let i = 0; i < TIGHT.max * 2; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    ids.push(await queueAndDeliver(dev, `delivery-${i}`, { retention: TIGHT }));
  }

  const surviving = await allDelivered(dev.store);
  assert.ok(surviving.length <= TIGHT.max, `bounded at ${surviving.length} with no pass anywhere in this test`);
  assert.deepEqual(surviving, ids.slice(ids.length - surviving.length), 'and what survived is the newest run, by identity');

  await close();
});

test('A DEVICE CLOCK MOVED BACKWARDS ACROSS PASSES CHANGES NOTHING ABOUT WHAT IS KEPT', async () => {
  // The counted bound in one sync-shaped fixture. Under the superseded window the cutoff was derived
  // from this clock, so a device sitting ten years in the past pruned nothing, for ever, while every
  // pass reported a successful prune.
  const { world, dev, close } = await aDeviceInAWorld();

  const ids = [];
  for (let i = 0; i < TIGHT.max + 3; i += 1) {
    if (i === 2) world.advance(-10 * 365 * 24 * 60 * 60_000);
    // eslint-disable-next-line no-await-in-loop
    const { entry } = await queueBackup(dev.store, {
      space: SPACE, baseName: `skewed-${i}.json`, payload: `{"i":${i}}`, label: `skewed ${i}`, now: world.now(),
    });
    // eslint-disable-next-line no-await-in-loop
    await recordDelivered(dev.store, entry.entry_id, { now: world.now(), retention: TIGHT });
    ids.push(entry.entry_id);
  }

  const surviving = await allDelivered(dev.store);
  const settled = await Promise.all(surviving.map(async (id) => (await getEntry(dev.store, id)).settled_at));

  assert.ok(settled.some((at) => at < '2020-01-01'), 'fixture: the skew genuinely reached the stored entries');
  assert.ok(surviving.length <= TIGHT.max, 'and the bound held anyway, because it counts rather than dates');
  assert.deepEqual(surviving, ids.slice(ids.length - surviving.length), 'keeping the newest run, by identity');

  await close();
});

test('THE DECLARED BOUNDARY: SPARING IS BY STATUS, AND A PASS IS WHAT CHANGES AN ENTRY S STATUS', async () => {
  // `scrub.js` leaves an opaque payload naming both a departed and a staying client exactly as it is,
  // and a surface exists whose whole job is to keep naming it. It survives the bound because it is NOT
  // DELIVERED — nothing checks whether an entry is unresolved — and `core/outbox/retention.test.js`
  // proves that survival, byte for byte, across three times the cap.
  //
  // THIS test is the other half, and it is a KNOWN LIMITATION ASSERTED RATHER THAN LEFT AS PROSE. A
  // pass FLUSHES pending entries, so a pass is exactly what turns such an entry into a delivered one —
  // and a delivered one is inside the only range the bound can walk. Written after this test was first
  // built expecting survival and went red: the entry had been delivered by the pass, which is the
  // boundary rather than a defect.
  //
  // Nothing in this core can queue an opaque payload today: `scrub.js` declares that every payload
  // this core queues is one of our own documents, so the fixture below reaches past the application to
  // build one. THE DAY A STEP QUEUES ONE FOR REAL, this test is what says the sparing needs a guard of
  // its own rather than resting on status.
  const { world, dev, close } = await aDeviceInAWorld();

  const { entry: opaque } = await enqueue(dev.store, {
    operation: 'create',
    space: SPACE,
    name: 'fit.area.opaque-shared.json',
    payload: 'AAAA-sealed-bytes-this-layer-never-opens-BBBB',
    label: 'a sealed export naming two clients',
    refs: ['client-departed', 'client-staying'],
    idempotency_key: 'opaque-shared',
    now: T0,
  });
  const prefilled = await fillToTheCap(dev);

  await dev.store.create('client', aClient({ name: 'work that pushes the set over' }), { now: T0 });
  await syncNow(dev.store, world.remote, { trigger: SYNC_TRIGGERS.OPEN, space: SPACE, now: T0 });

  // THE POSITIVE CONTROL FIRST: without it everything below is satisfied by a bound that never ran.
  assert.equal(await getEntry(dev.store, prefilled[0]), undefined, 'the bound genuinely ran in this pass');

  assert.equal(
    await getEntry(dev.store, opaque.entry_id), undefined,
    'DECLARED BOUNDARY: the pass delivered this entry, and once delivered it is the oldest thing in '
    + 'the only range the bound can walk. If this is now failing, either something changed the status '
    + 'a flush leaves an opaque entry in, or a step has begun queueing opaque payloads for real — and '
    + 'in the second case the sparing needs to exclude unresolved entries explicitly rather than '
    + 'relying on their status.',
  );

  await close();
});
