/**
 * PER-CLIENT DELETION, carried outward — and the shared session that must survive it.
 *
 * Two things must BOTH hold, and the second is the one a careless reading destroys: nothing of the
 * departed client remains anywhere, and no other client loses anything. Sessions are one routine and
 * one to MANY clients, so a purge that deleted the session would take somebody else's history with
 * it.
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { aClient, aReading, aSession } from '../model/fixtures.js';
import { deletionForClient, purgeClient } from '../store/store.js';
import { readUnion } from './areas.js';
import { PROPAGATION_IS_VERIFIED_BY_READ_BACK } from './deletions.js';
import { SYNC_TRIGGERS, syncNow } from './engine.js';
import { areaPrefix } from './partition.js';
import { locateSnapshot, readSnapshot } from './snapshot.js';
import { T0, aWorld } from './testing.js';

const SPACE = 'visible';
const sync = (dev, world, now) => syncNow(dev.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now });

/** A shared session: one routine, two clients, a reading each. */
async function aSharedPractice(store, now) {
  const departing = await store.create('client', aClient({ name: 'Departing Client' }), { now });
  const staying = await store.create('client', aClient({ name: 'Staying Client' }), { now });
  const session = await store.create('session', aSession({
    client_ids: [departing.record_id, staying.record_id],
    status: 'completed',
    started_at: now,
    ended_at: now,
  }), { now });
  const theirReading = await store.create('reading', aReading({
    client_id: departing.record_id, session_id: session.record_id, value: 61,
  }), { now });
  const otherReading = await store.create('reading', aReading({
    client_id: staying.record_id, session_id: session.record_id, value: 74,
  }), { now });
  return { departing, staying, session, theirReading, otherReading };
}

describe('sync/deletions — the removal reaches the remote copy', () => {
  it('takes the departed client out of the remote copy and leaves the other attendee’s history intact', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');

    const practice = await aSharedPractice(laptop.store, T0);
    await sync(laptop, world, T0);

    // Before: everything is in the remote copy.
    const before = await readUnion(world.remote, { space: SPACE });
    assert.ok(before.records.has(practice.departing.record_id));
    assert.ok(before.records.has(practice.theirReading.record_id));

    // The coach removes the client.
    world.advance(60_000);
    const manifest = await purgeClient(laptop.store, practice.departing.record_id, { now: world.now() });
    assert.equal(manifest.status, 'pending');

    const report = await sync(laptop, world, world.now());

    // ── nothing of theirs remains ────────────────────────────────────────────────────────────
    const union = await readUnion(world.remote, { space: SPACE });
    assert.equal(union.records.has(practice.departing.record_id), false, 'the client record is gone');
    assert.equal(union.records.has(practice.theirReading.record_id), false, 'and their reading with it');

    const bytes = JSON.stringify([...union.records.values()]);
    assert.equal(bytes.includes('Departing Client'), false, 'their name is nowhere in the remote copy');

    // ── and nobody else lost anything ────────────────────────────────────────────────────────
    assert.ok(union.records.has(practice.staying.record_id), 'the other client is untouched');
    assert.ok(union.records.has(practice.otherReading.record_id), 'as is their reading');
    const session = union.records.get(practice.session.record_id);
    assert.ok(session, 'the shared session was NOT deleted — it is their history too');
    assert.deepEqual(session.content.client_ids, [practice.staying.record_id]);

    // ── the manifest is marked only after the area was read back ─────────────────────────────
    assert.deepEqual(report.deletions.propagated, [manifest.deletion_id]);
    assert.equal((await deletionForClient(laptop.store, practice.departing.record_id)).status, 'propagated');
    assert.equal(PROPAGATION_IS_VERIFIED_BY_READ_BACK, true);

    // ── and the snapshot no longer carries them either ───────────────────────────────────────
    const located = await locateSnapshot(world.remote, { space: SPACE });
    const { document } = await readSnapshot(world.remote, located.meta.file_id);
    assert.equal(document.records.some((r) => r.record_id === practice.departing.record_id), false);
  });

  it('the other device applies the notice and clears its OWN area, because only it may', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    const practice = await aSharedPractice(laptop.store, T0);
    await sync(laptop, world, T0);
    await sync(phone, world, T0);

    // The phone holds them too, and has written its own copy into its own area.
    assert.ok(await phone.store.get('client', practice.departing.record_id));
    world.advance(60_000);
    await phone.store.create('client', aClient({ name: 'Someone new' }), { now: world.now() });
    await sync(phone, world, world.now());
    const phoneArea = await readUnion(world.remote, { space: SPACE, prefix: areaPrefix('coach-phone') });
    assert.ok(phoneArea.records.has(practice.departing.record_id), 'the phone’s own area holds them');

    // The purge happens on the laptop.
    world.advance(60_000);
    await purgeClient(laptop.store, practice.departing.record_id, { now: world.now() });
    await sync(laptop, world, world.now());

    // The laptop cannot write into the phone's area — so this is the phone's own next pass.
    const report = await sync(phone, world, world.now());
    assert.equal(report.deletions.notices_applied.length, 1, 'it took the notice');
    assert.equal(await phone.store.get('client', practice.departing.record_id), undefined,
      'and removed them locally');

    const clearedArea = await readUnion(world.remote, { space: SPACE, prefix: areaPrefix('coach-phone') });
    assert.equal(clearedArea.records.has(practice.departing.record_id), false,
      'the phone cleared its own area, which is the only area it may write into');
    assert.ok(clearedArea.records.has(practice.staying.record_id), 'without taking anybody else with it');

    // Applying it twice does nothing: the notice is remembered.
    const again = await sync(phone, world, world.now());
    assert.deepEqual(again.deletions.notices_applied, []);
  });

  it('refuses to let another device’s area put the departed client back', async () => {
    // A purge leaves no tombstone — that is the point of it — so there is nothing local saying "gone"
    // for the next pull to consult. Without the guard the client walks straight back in, silently,
    // from a copy of themselves sitting in an area this device may not write to.
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    const practice = await aSharedPractice(laptop.store, T0);
    await sync(laptop, world, T0);
    await sync(phone, world, T0);

    // The phone writes its own copy of them into its own area, and then goes in a pocket.
    world.advance(60_000);
    await phone.store.create('client', aClient({ name: 'Someone new' }), { now: world.now() });
    await sync(phone, world, world.now());

    world.advance(60_000);
    await purgeClient(laptop.store, practice.departing.record_id, { now: world.now() });
    await sync(laptop, world, world.now());

    // The phone is still asleep. The laptop synchronises again, and reads the phone's area.
    const report = await sync(laptop, world, world.now());
    assert.ok(report.pulled.refused_resurrection >= 1, 'it refused to re-apply them');
    assert.equal(await laptop.store.get('client', practice.departing.record_id), undefined,
      'and they stayed removed');
    assert.equal(await laptop.store.get('reading', practice.theirReading.record_id), undefined);
    assert.ok(await laptop.store.get('client', practice.staying.record_id), 'while the other client is unaffected');
  });

  it('does not consider a purge for a client it never held, more than once', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    const client = await laptop.store.create('client', aClient({ name: 'Never seen elsewhere' }), { now: T0 });
    await sync(laptop, world, T0);
    world.advance(60_000);
    await purgeClient(laptop.store, client.record_id, { now: world.now() });
    await sync(laptop, world, world.now());

    // The phone has never held this client. It must not fail, and it must not reconsider it forever.
    const first = await sync(phone, world, world.now());
    assert.deepEqual(first.deletions.notices_applied, []);
    assert.equal(await phone.store.get('client', client.record_id), undefined);
    const second = await sync(phone, world, world.now());
    assert.deepEqual(second.deletions.notices_applied, []);
  });
});
