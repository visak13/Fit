/**
 * THE ENGINE, against two real devices and one remote copy.
 *
 * The claim these tests exist for is the structural one: **two devices writing at the same time never
 * lose each other's records**, because there is no object either of them can overwrite. Everything
 * else in this file is what makes that claim safe to rely on — the areas staying disjoint, the
 * ordinary case resolving itself, the genuine clash being surfaced instead of decided, and the
 * completion marker refusing to say "backed up" when it is not.
 *
 * Nothing here calls any provider. Every assertion is about OUR logic given the behaviour the double
 * models, and none of it proves the platform.
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { aClient, anExercise } from '../model/fixtures.js';
import { SPACES } from '../remote/remote.js';
import {
  NO_BACKGROUND_SYNC, SYNC_TRIGGERS, SYNC_TRIGGER_VALUES, syncNow,
} from './engine.js';
import { SyncBoundaryError } from './errors.js';
import { parseAreaFileName } from './partition.js';
import { T0, aWorld } from './testing.js';

/** Every file in the space, so a test can see who wrote where. */
const filesIn = (remote) => remote.list(SPACES.VISIBLE);

describe('sync/engine — per-device partitioning is structural', () => {
  it('two devices writing concurrently lose nothing, and never touch each other’s area', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    // Both write while neither has seen the other. This is the sequence that destroys a shared
    // object: read, modify, write, last writer wins, and nothing errors.
    const onLaptop = await laptop.store.create('client', aClient({ name: 'Written on the laptop' }), { now: T0 });
    const onPhone = await phone.store.create('client', aClient({ name: 'Written on the phone' }), { now: T0 });

    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });

    for (const dev of [laptop, phone]) {
      // eslint-disable-next-line no-await-in-loop
      const a = await dev.store.get('client', onLaptop.record_id);
      // eslint-disable-next-line no-await-in-loop
      const b = await dev.store.get('client', onPhone.record_id);
      assert.equal(a?.content.name, 'Written on the laptop', `${dev.tag} kept the laptop's record`);
      assert.equal(b?.content.name, 'Written on the phone', `${dev.tag} kept the phone's record`);
    }

    // The structural half: every file was written by the device whose area it is in. There is no
    // object either device could have overwritten, so there was nothing to lose.
    const listing = await filesIn(world.remote);
    const areaFiles = listing.map((m) => parseAreaFileName(m.name)).filter(Boolean);
    assert.ok(areaFiles.length >= 2, 'both devices wrote');
    assert.deepEqual([...new Set(areaFiles.map((f) => f.device))].sort(), ['coach-laptop', 'coach-phone']);
  });

  it('a hundred writes from two devices arrive complete', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    const ids = [];
    for (let i = 0; i < 50; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const l = await laptop.store.create('client', aClient({ name: `laptop ${i}` }), { now: T0 });
      // eslint-disable-next-line no-await-in-loop
      const p = await phone.store.create('client', aClient({ name: `phone ${i}` }), { now: T0 });
      ids.push(l.record_id, p.record_id);
    }

    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.OPEN, now: T0 });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.OPEN, now: T0 });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.OPEN, now: T0 });

    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      assert.ok(await laptop.store.get('client', id), `the laptop has ${id}`);
      // eslint-disable-next-line no-await-in-loop
      assert.ok(await phone.store.get('client', id), `the phone has ${id}`);
    }
  });
});

describe('sync/engine — the ordinary case, and the one that is not ordinary', () => {
  it('carries a sequential edit across, per-record last-write-wins', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    const client = await laptop.store.create('client', aClient({ name: 'First' }), { now: T0 });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });

    world.advance(60_000);
    await phone.store.update('client', client.record_id, (c) => ({ ...c, name: 'Renamed on the phone' }),
      { now: world.now() });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });
    const report = await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });

    const onLaptop = await laptop.store.get('client', client.record_id);
    assert.equal(onLaptop.content.name, 'Renamed on the phone');
    assert.equal(report.divergences.length, 0, 'sequential use produces no conflicts at all');
    assert.ok(report.pulled.applied >= 1);
  });

  it('surfaces a genuine divergence and applies NEITHER side', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    const client = await laptop.store.create('client', aClient({ name: 'Shared' }), { now: T0 });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });

    // Both edit the same revision, neither having seen the other.
    world.advance(60_000);
    await laptop.store.update('client', client.record_id, (c) => ({ ...c, notes: 'laptop note' }), { now: world.now() });
    world.advance(60_000);
    await phone.store.update('client', client.record_id, (c) => ({ ...c, notes: 'phone note' }), { now: world.now() });

    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });
    const report = await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });

    assert.equal(report.divergences.length, 1, 'it is surfaced');
    const divergence = report.divergences[0];
    assert.equal(divergence.record_id, client.record_id);
    assert.equal(divergence.local.content.notes, 'laptop note');
    assert.equal(divergence.incoming.content.notes, 'phone note', 'both sides are shown');

    const held = await laptop.store.get('client', client.record_id);
    assert.equal(held.content.notes, 'laptop note',
      'nothing was overwritten: the losing edit is not discarded on the coach’s behalf');
  });
});

describe('sync/engine — when it runs, and what it may claim', () => {
  it('has exactly five opportunities, none of them in the background', () => {
    assert.deepEqual([...SYNC_TRIGGER_VALUES].sort(), ['foreground', 'interval', 'leave', 'manual', 'open']);
    assert.equal(SYNC_TRIGGER_VALUES.includes('background'), false);
    assert.equal(NO_BACKGROUND_SYNC, true);
  });

  it('refuses an opportunity it does not have', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await assert.rejects(
      () => syncNow(laptop.store, world.remote, { trigger: 'background' }),
      SyncBoundaryError,
    );
  });

  it('a foreground pass that drains the queue may say when it synchronised', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await laptop.store.create('client', aClient(), { now: T0 });

    const report = await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.OPEN, now: T0 });
    assert.ok(report.completion, 'the queue drained, so there is a completion marker');
    assert.equal(report.outbox.undelivered, 0);
  });

  it('a pass on leaving is best effort and can NEVER say it synchronised', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await laptop.store.create('client', aClient(), { now: T0 });

    const report = await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.LEAVE, now: T0 });
    assert.equal(report.flush.mode, 'best_effort');
    assert.equal(report.completion, null,
      'the platform may kill this mid-flight, so it is never reported as a completed synchronisation');
  });

  it('an expired credential is a delay and not a loss, and is not reported as synchronised', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const client = await laptop.store.create('client', aClient({ name: 'Queued while signed out' }), { now: T0 });

    world.adversity.expireCredential();
    const blocked = await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.OPEN, now: T0 });

    // It did not throw. The application still opens; the failure is reported rather than raised.
    assert.equal(blocked.completion, null);
    assert.ok(blocked.failures.length > 0, 'the failure is said out loud');
    assert.ok(blocked.failures.every((f) => f.needs_reauth),
      'and specifically: this one has a tap attached, it is not a service outage');
    assert.ok(blocked.outbox.waiting_for_credential >= 1, 'the work is waiting, not lost');
    assert.ok(await laptop.store.get('client', client.record_id), 'and it is still here');

    // The tap. Nothing was lost in between.
    world.adversity.renewCredential();
    const recovered = await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    assert.deepEqual(recovered.failures, []);
    assert.ok(recovered.completion, 'and now it is genuinely backed up');
  });

  it('a run that could not read the other devices does not call itself synchronised', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await laptop.store.create('client', aClient(), { now: T0 });
    const clean = await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.OPEN, now: T0 });
    assert.ok(clean.completion, 'everything this device had is delivered');

    // Now nothing is queued, so the queue "drains" — and the read of the other devices fails.
    // "Synchronised" would mean "sent mine, never read yours", which is exactly the half-truth the
    // accountability standard forbids.
    world.adversity.failNext(20, { operation: 'list' });
    const report = await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.OPEN, now: T0 });

    assert.equal(report.outbox.undelivered, 0, 'everything queued did land');
    assert.ok(report.failures.some((f) => f.step === 'pull'));
    assert.equal(report.completion, null);
    world.adversity.clear();
  });
});

describe('sync/engine — compaction', () => {
  it('replaces this device’s own files with one, and removes only its own', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    await phone.store.create('exercise', anExercise({ id: 'phone-move' }), { now: T0 });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    const phoneFilesBefore = (await filesIn(world.remote))
      .filter((m) => parseAreaFileName(m.name)?.device === 'coach-phone').map((m) => m.file_id);

    // Enough passes on the laptop to cross the compaction threshold.
    for (let i = 0; i < 10; i += 1) {
      world.advance(60_000);
      // eslint-disable-next-line no-await-in-loop
      await laptop.store.create('client', aClient({ name: `client ${i}` }), { now: world.now() });
      // eslint-disable-next-line no-await-in-loop
      await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.INTERVAL, now: world.now() });
    }

    const listing = await filesIn(world.remote);
    const laptopFiles = listing.filter((m) => parseAreaFileName(m.name)?.device === 'coach-laptop');
    const phoneFilesAfter = listing
      .filter((m) => parseAreaFileName(m.name)?.device === 'coach-phone').map((m) => m.file_id);

    assert.ok(laptopFiles.some((m) => parseAreaFileName(m.name).kind === 'state'), 'it wrote its state out');
    assert.ok(laptopFiles.length < 10, `it cleared up after itself (${laptopFiles.length} files)`);
    assert.deepEqual(phoneFilesAfter, phoneFilesBefore, 'and did not touch the phone’s area');

    // Everything it ever wrote is still readable from the union.
    const report = await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });
    assert.ok(report.pulled.seen >= 11, 'ten clients and the phone’s own exercise survived compaction');
  });
});
