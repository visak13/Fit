/**
 * AN INTERRUPTED SYNCHRONISATION RESUMES WITHOUT LOSS AND WITHOUT DUPLICATION.
 *
 * Real sessions are interrupted by power cuts, phone calls, a browser being closed and an operating
 * system killing a backgrounded tab. The claim here is that none of it costs a record and none of it
 * produces two.
 *
 * **Surviving the interruption is the ABSENCE of a mechanism, not the presence of one.** There is no
 * in-flight state anywhere in this stack: an entry stays pending for the whole attempt and only a
 * verdict writes a new state, so a killed pass leaves the queue exactly as it was — still pending,
 * still in order, attempts not counted, nothing half-settled. What stops the resumed replay from
 * duplicating is recognition: the idempotency key lives inside the remote name, so a replay lists by
 * that name and finds its own earlier write.
 *
 * The dangerous state — the write landed and this device never recorded that it did — is produced
 * HONESTLY here rather than simulated: the delivery is performed against the remote, and then the
 * local half is thrown away by restarting the application before any verdict was written.
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { aClient } from '../model/fixtures.js';
import { dueEntries, outboxStatus } from '../outbox/outbox.js';
import { readUnion } from './areas.js';
import { SYNC_TRIGGERS, syncNow } from './engine.js';
import { parseAreaFileName } from './partition.js';
import { T0, aWorld, restart } from './testing.js';

const SPACE = 'visible';
const areaFiles = async (remote) => (await remote.list(SPACE)).filter((m) => parseAreaFileName(m.name));

describe('sync/durability — a pass that never finished', () => {
  it('loses nothing when the pass is killed before anything is delivered', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');

    const one = await laptop.store.create('client', aClient({ name: 'One' }), { now: T0 });
    const two = await laptop.store.create('client', aClient({ name: 'Two' }), { now: T0 });

    // The operating system takes the tab away mid-pass.
    const killed = await syncNow(laptop.store, world.remote, {
      trigger: SYNC_TRIGGERS.OPEN, now: T0, signal: { aborted: true },
    });
    assert.equal(killed.flush.interrupted, true);
    assert.equal(killed.completion, null, 'and it is not reported as a synchronisation');
    assert.equal((await areaFiles(world.remote)).length, 0, 'nothing was delivered');

    // The coach opens the application again.
    await restart(laptop);
    const resumed = await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.OPEN, now: T0 });
    assert.ok(resumed.completion, 'and this pass genuinely completed');

    const union = await readUnion(world.remote, { space: SPACE });
    assert.ok(union.records.has(one.record_id), 'the first record survived the interruption');
    assert.ok(union.records.has(two.record_id), 'and so did the second');
    assert.equal((await outboxStatus(laptop.store)).undelivered, 0);
  });

  it('does not duplicate when the write landed and the acknowledgement was lost', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const client = await laptop.store.create('client', aClient({ name: 'Only once' }), { now: T0 });

    // Queue the work, then stop before it is delivered.
    await syncNow(laptop.store, world.remote, {
      trigger: SYNC_TRIGGERS.OPEN, now: T0, signal: { aborted: true },
    });
    const page = await dueEntries(laptop.store, { now: T0, limit: 5 });
    const entry = page.items[0];
    assert.ok(entry, 'the work is still queued, because no verdict was ever written');

    // The write DID land — and the application died before it could record that. This is the real
    // sequence, not a simulation of it: the file is there and the queue does not know.
    await world.remote.create(SPACE, { name: entry.name, content: entry.payload });
    await restart(laptop);

    const resumed = await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.OPEN, now: T0 });
    assert.ok(resumed.completion);

    const files = await areaFiles(world.remote);
    const answering = files.filter((m) => m.name === entry.name);
    assert.equal(answering.length, 1, 'exactly one file answers to that delivery name — no duplicate');
    assert.equal(resumed.flush.already_landed, 1, 'and the queue said so rather than writing again');

    const union = await readUnion(world.remote, { space: SPACE });
    assert.ok(union.records.has(client.record_id), 'with the record itself in place exactly once');
  });

  it('resumes a compaction that was cut off, without leaving two states of one device', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');

    // Enough passes to make compaction due.
    for (let i = 0; i < 9; i += 1) {
      world.advance(60_000);
      // eslint-disable-next-line no-await-in-loop
      await laptop.store.create('client', aClient({ name: `client ${i}` }), { now: world.now() });
      // eslint-disable-next-line no-await-in-loop
      await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.INTERVAL, now: world.now() });
    }

    // The pass that would compact is killed part way through.
    world.advance(60_000);
    await laptop.store.create('client', aClient({ name: 'the last one' }), { now: world.now() });
    await syncNow(laptop.store, world.remote, {
      trigger: SYNC_TRIGGERS.INTERVAL, now: world.now(), signal: { aborted: true },
    });
    await restart(laptop);

    const resumed = await syncNow(laptop.store, world.remote, {
      trigger: SYNC_TRIGGERS.OPEN, now: world.now(),
    });
    assert.ok(resumed.completion);

    const files = await areaFiles(world.remote);
    const states = files.filter((m) => parseAreaFileName(m.name).kind === 'state');
    assert.equal(states.length, 1, 'one state file for this device, not two');

    const union = await readUnion(world.remote, { space: SPACE });
    assert.equal(union.records.size, 10, 'every client is in the remote copy, exactly once');
    assert.equal((await outboxStatus(laptop.store)).undelivered, 0);
  });

  it('a run interrupted after the queue drained still refuses to claim completion', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await laptop.store.create('client', aClient(), { now: T0 });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.OPEN, now: T0 });

    const interrupted = await syncNow(laptop.store, world.remote, {
      trigger: SYNC_TRIGGERS.OPEN, now: T0, signal: { aborted: true },
    });
    assert.equal(interrupted.flush.interrupted, true);
    assert.equal(interrupted.completion, null,
      'a flush that did not reach its own end cannot say the queue is empty, whatever the counters read');
  });
});
