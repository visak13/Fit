/**
 * THE NUMBERS THE COACH IS SHOWN, and the cost of producing them.
 *
 * Both halves matter. A figure that is wrong misleads him; a figure that is expensive stops being
 * shown, and an indicator that is not always visible is not an accountability surface.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { RemoteInvalidRequest, SPACES } from '../remote/remote.js';
import { HOLD, STATUS } from './entry.js';
import { flushOutbox } from './flush.js';
import { queueBackup } from './enqueue.js';
import {
  SEQ_META_KEY, countByStatus, entriesByStatus, getEntry, oldestInStatus, recordDelivered,
} from './queue.js';
import { countCredentialHolds, needsAttention, outboxStatus } from './status.js';
import { aDevice, restart } from './testing.js';

/** Queue `n` backups, one minute apart, so ages are distinguishable. */
async function queueSpread(dev, n) {
  const entries = [];
  for (let i = 0; i < n; i += 1) {
    const { entry } = await queueBackup(dev.store, {
      space: SPACES.VISIBLE, baseName: `backup-${i}.json`, payload: `{"i":${i}}`,
      label: `backup number ${i}`, now: dev.now(),
    });
    entries.push(entry);
    dev.advance(60_000);
  }
  return entries;
}

test('an empty queue reports zero pending and NO oldest age — not an age of zero', async () => {
  const dev = await aDevice();
  const status = await outboxStatus(dev.store, { now: dev.now() });
  assert.equal(status.pending, 0);
  assert.equal(status.undelivered, 0);
  assert.equal(status.oldest_pending_age_ms, null, 'null means "nothing is waiting"; 0 would mean "something just arrived"');
  assert.equal(status.oldest_pending_at, null);
  await dev.store.close();
});

test('the pending count and the age of the OLDEST pending entry are both exposed', async () => {
  const dev = await aDevice();
  await queueSpread(dev, 3);

  const status = await outboxStatus(dev.store, { now: dev.now() });
  assert.equal(status.pending, 3);
  assert.equal(status.oldest_pending_age_ms, 3 * 60_000, 'measured from the OLDEST, not the newest');
  assert.equal(status.oldest_pending_label, 'backup number 0', 'and it can say what is waiting, not only how much');

  // Both survive a restart, because both are read from the database rather than from a session.
  await restart(dev);
  const after = await outboxStatus(dev.store, { now: dev.now() });
  assert.equal(after.pending, 3);
  assert.equal(after.oldest_pending_age_ms, 3 * 60_000);
  await dev.store.close();
});

test('the age keeps growing while nothing is delivered, which is what an escalation is built on', async () => {
  const dev = await aDevice();
  await queueSpread(dev, 1);

  const early = await outboxStatus(dev.store, { now: dev.now() });
  dev.advance(72 * 60 * 60_000);
  const late = await outboxStatus(dev.store, { now: dev.now() });

  assert.ok(late.oldest_pending_age_ms > early.oldest_pending_age_ms);
  assert.equal(late.oldest_pending_age_ms, early.oldest_pending_age_ms + 72 * 60 * 60_000);
  assert.equal(late.pending, 1, 'and nothing was quietly dropped in the meantime');
  await dev.store.close();
});

test('delivering an entry moves the oldest-pending figure on to the next one', async () => {
  const dev = await aDevice();
  await queueSpread(dev, 3);

  await flushOutbox(dev.store, dev.remote, { now: dev.now(), limit: 1 });
  const status = await outboxStatus(dev.store, { now: dev.now() });

  assert.equal(status.pending, 2);
  assert.equal(status.delivered, 1);
  assert.equal(status.oldest_pending_label, 'backup number 1');
  assert.equal(status.oldest_pending_age_ms, 2 * 60_000);
  await dev.store.close();
});

test('a credential hold is counted separately, because it is the one number with a tap attached', async () => {
  const dev = await aDevice();
  await queueSpread(dev, 2);
  dev.adversity.expireCredential();
  await flushOutbox(dev.store, dev.remote, { now: dev.now() });

  const status = await outboxStatus(dev.store, { now: dev.now() });
  assert.equal(status.pending, 2, 'still pending: the work is not lost');
  assert.equal(status.waiting_for_credential, 2, 'a dead credential blocks everything due, and the figure says so');
  assert.equal(status.needs_attention, 0, 'and it is NOT a fault — presenting it as one teaches him to ignore the indicator');
  assert.equal(await countCredentialHolds(dev.store), 2);
  await dev.store.close();
});

test('a stopped entry is counted as undelivered and listed for a person, with its reason', async () => {
  const dev = await aDevice();
  await queueSpread(dev, 2);
  dev.adversity.failNext(1, { operation: 'create', error: () => new RemoteInvalidRequest('That name is not acceptable.') });
  await flushOutbox(dev.store, dev.remote, { now: dev.now() });

  const status = await outboxStatus(dev.store, { now: dev.now() });
  assert.equal(status.rejected, 1);
  assert.equal(status.needs_attention, 1);
  assert.equal(status.undelivered, 1, 'pending is zero, and the data is still not away');
  assert.equal(status.pending, 0);

  const attention = await needsAttention(dev.store);
  assert.equal(attention.rejected.items.length, 1);
  assert.equal(attention.ambiguous.items.length, 0, 'the two are reported apart: they need different words');
  assert.equal(attention.rejected.items[0].last_error.message, 'That name is not acceptable.');
  await dev.store.close();
});

test('the status is read from bounded index reads, not by walking the queue', async () => {
  const dev = await aDevice();
  await queueSpread(dev, 40);

  const before = dev.store.stats.rowsRead;
  await outboxStatus(dev.store, { now: dev.now() });
  const cost = dev.store.stats.rowsRead - before;

  // Counts are index-range counts and cost no rows; the oldest is ONE row; the credential-hold walk is
  // the only pass over the pending set. Forty entries must not cost anything like forty rows twice
  // over, or a status line shown on every screen becomes the most expensive thing in the app.
  assert.ok(cost <= 45, `the whole status cost ${cost} rows for 40 entries`);
  assert.ok(cost > 0);
  await dev.store.close();
});

test('the oldest pending entry is found in one step, whatever the queue holds', async () => {
  const dev = await aDevice();
  await queueSpread(dev, 30);

  const before = dev.store.stats.rowsRead;
  const oldest = await oldestInStatus(dev.store, STATUS.PENDING);
  assert.equal(dev.store.stats.rowsRead - before, 1, 'one row, because seq order IS arrival order');
  assert.equal(oldest.label, 'backup number 0');
  await dev.store.close();
});

test('the queue is paged, and there is no call that loads it whole', async () => {
  const dev = await aDevice();
  await queueSpread(dev, 12);

  const first = await entriesByStatus(dev.store, STATUS.PENDING, { limit: 5 });
  assert.equal(first.items.length, 5);
  assert.equal(first.done, false);
  assert.deepEqual(first.items.map((e) => e.seq), [1, 2, 3, 4, 5]);

  const second = await entriesByStatus(dev.store, STATUS.PENDING, { limit: 5, after: first.cursor });
  assert.deepEqual(second.items.map((e) => e.seq), [6, 7, 8, 9, 10]);
  await dev.store.close();
});

test('delivered entries are kept as evidence, and bounded by the delivery that adds to them', async () => {
  const dev = await aDevice();
  const [first] = await queueSpread(dev, 2);
  await flushOutbox(dev.store, dev.remote, { now: dev.now() });

  assert.equal(await countByStatus(dev.store, STATUS.DELIVERED), 2, 'kept: this is the evidence a delivery happened');

  // There is no prune to call and no sweep to schedule. The NEXT DELIVERY is what applies the bound,
  // in its own transaction — which is why time is not advanced here and nothing needs to.
  const [third] = await queueSpread(dev, 1);
  await recordDelivered(dev.store, third.entry_id, {
    now: dev.now(), retention: { max: 2, batch: 1, ceiling: 1 },
  });

  assert.equal(await countByStatus(dev.store, STATUS.DELIVERED), 2, 'the set is held at its cap');
  assert.equal(await getEntry(dev.store, first.entry_id), undefined, 'and the OLDEST evidence is what went');
  await dev.store.close();
});

test('THE BOUND CAN REACH NOTHING BUT DELIVERED ENTRIES — the invariant a retention policy rests on', async () => {
  // The bound now runs inside `recordDelivered` itself, in the same transaction, so what it can and
  // cannot reach is not theoretical: it applies on every delivery this application makes.
  //
  // THE ONE THAT MATTERS: when a client is purged, `scrub.js` LEAVES an entry whose payload is opaque
  // and whose refs name both the departed client and a staying one — it cannot be cleaned without
  // destroying the other client's data — and reports it `unresolved` by identity. A surface exists
  // whose whole job is to keep naming those. If the bound ate one, that surface would go QUIET, and
  // quiet reads as good news. It survives because it is not DELIVERED, and that is a property of this
  // range rather than of anything checking whether it is unresolved.
  const dev = await aDevice();

  // One of every status the queue has, settled in that order because a flush drains whatever is due:
  // the two that must stay undelivered are queued LAST and never flushed.
  const [landed] = await queueSpread(dev, 1);
  await flushOutbox(dev.store, dev.remote, { now: dev.now() });

  const [rejected] = await queueSpread(dev, 1);
  dev.adversity.failNext(1, { operation: 'create', error: () => new RemoteInvalidRequest('refused') });
  await flushOutbox(dev.store, dev.remote, { now: dev.now() });

  const [pending] = await queueSpread(dev, 1);
  const { entry: opaque } = await queueBackup(dev.store, {
    space: SPACES.VISIBLE,
    baseName: 'sealed-export.json',
    payload: 'AAAA-sealed-bytes-this-layer-never-opens-BBBB',
    label: 'a sealed export naming two clients',
    refs: ['client-departed', 'client-staying'],
    now: dev.now(),
  });

  // Fixture check, because everything below is about which status each entry is IN. Written after
  // the first attempt at this test put the opaque entry behind a flush that delivered it — the
  // assertion then failed for a fixture reason and said nothing at all about the prune.
  assert.equal(await countByStatus(dev.store, STATUS.DELIVERED), 1);
  assert.equal(await countByStatus(dev.store, STATUS.REJECTED), 1);
  assert.equal(await countByStatus(dev.store, STATUS.PENDING), 2);

  // Two further deliveries, under a cap of two, so the bound genuinely has work to do and the oldest
  // delivered entry — `landed` — is what it has to reach for.
  const extra = await queueSpread(dev, 2);
  const TIGHT = { max: 2, batch: 1, ceiling: 2 };
  for (const entry of extra) {
    // eslint-disable-next-line no-await-in-loop
    await recordDelivered(dev.store, entry.entry_id, { now: dev.now(), retention: TIGHT });
  }

  const stillThere = async (id) => Boolean(await dev.store.read('outbox', (s) => s.get('outbox', id)));

  // Asserted BEFORE the count, so a bound widened past its range reds HERE rather than being
  // shadowed by a tally — a guard whose red always arrives from an earlier assertion has never been
  // seen to fail. This ordering was arrived at by breaking the range and watching where it went red.
  assert.ok(await stillThere(opaque.entry_id), 'the unresolved opaque-shared entry must survive the bound untouched');
  assert.ok(await stillThere(pending.entry_id), 'pending: still being attempted');
  assert.ok(await stillThere(rejected.entry_id), 'rejected: the problem it records did not stop mattering');

  // THE POSITIVE CONTROL, same run: without it every survival above would also be satisfied by a
  // bound that did nothing at all.
  assert.equal(await stillThere(landed.entry_id), false, 'the bound genuinely ran on this fixture');
  // One, not two: a bound with headroom takes the set to `max - batch` when it fires, so the next
  // few deliveries cost nothing. The cap is a ceiling on the set, never a target it is held at.
  assert.equal(await countByStatus(dev.store, STATUS.DELIVERED), 1, 'and took the delivered set below its cap');

  await dev.store.close();
});

test('the bound never touches an entry that stopped, however many deliveries follow it', async () => {
  const dev = await aDevice();
  await queueSpread(dev, 1);
  dev.adversity.failNext(1, { operation: 'create', error: () => new RemoteInvalidRequest('no') });
  await flushOutbox(dev.store, dev.remote, { now: dev.now() });

  // The old shape of this test advanced a year, because the bound was an age. It is now a count, so
  // the pressure that could reach a stopped entry is DELIVERIES, and that is what is applied here.
  const later = await queueSpread(dev, 4);
  for (const entry of later) {
    // eslint-disable-next-line no-await-in-loop
    await recordDelivered(dev.store, entry.entry_id, {
      now: dev.now(), retention: { max: 2, batch: 1, ceiling: 2 },
    });
  }
  assert.equal(await countByStatus(dev.store, STATUS.DELIVERED), 2, 'positive control: the bound did run here');

  const status = await outboxStatus(dev.store, { now: dev.now() });
  assert.equal(status.needs_attention, 1, 'the problem it records does not stop mattering because more work landed');
  await dev.store.close();
});

test('the sequence counter lives in the durable store, not in a running session', async () => {
  const dev = await aDevice();
  await queueSpread(dev, 3);
  assert.equal(await dev.store.getMeta(SEQ_META_KEY), 3);
  await restart(dev);
  assert.equal(await dev.store.getMeta(SEQ_META_KEY), 3);
  await dev.store.close();
});

test('a pending entry on backoff is still counted as pending — a hold is not a disappearance', async () => {
  const dev = await aDevice();
  await queueSpread(dev, 1);
  dev.adversity.failNext(1, { operation: 'create' });
  await flushOutbox(dev.store, dev.remote, { now: dev.now() });

  const entry = (await entriesByStatus(dev.store, STATUS.PENDING)).items[0];
  assert.equal(entry.hold, HOLD.BACKOFF);

  const status = await outboxStatus(dev.store, { now: dev.now() });
  assert.equal(status.pending, 1);
  assert.equal(status.undelivered, 1);
  assert.ok(status.oldest_pending_age_ms >= 0);
  await dev.store.close();
});
