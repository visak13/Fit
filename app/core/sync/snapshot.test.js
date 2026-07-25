/**
 * THE SNAPSHOT — the one place a lost update is possible, and the proof that it is repairable.
 *
 * These tests do the dangerous thing on purpose. The double is faithful to the measured quirk that
 * there is NO conditional match, so a lost update genuinely happens here, and the tests perform it
 * and assert that the loss really occurred rather than describing it. Then they assert the part that
 * makes it survivable: the areas still hold the record, so rebuilding restores it.
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { bytesToText } from '../remote/remote.js';
import { aClient } from '../model/fixtures.js';
import { readUnion } from './areas.js';
import { SYNC_TRIGGERS, refreshSnapshot, recoverFromRemote, syncNow } from './engine.js';
import { SNAPSHOT_NAME } from './partition.js';
import { decodeDocument } from './payload.js';
import {
  PUBLISH, RACE_IS_DETECTED_NOT_PREVENTED, SNAPSHOT_CARRIES_NO_RECORD_OF_ITS_OWN,
  SNAPSHOT_IS_DERIVED_NEVER_AUTHORITY, assembleSnapshot, locateSnapshot, publishSnapshot, readSnapshot,
} from './snapshot.js';
import { T0, aWorld } from './testing.js';

const SPACE = 'visible';
const sync = (dev, world, now = T0) => syncNow(dev.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now });
const namesIn = (snapshot) => snapshot.records.map((r) => r.content?.name).filter(Boolean).sort();

describe('sync/snapshot — the listing has three cases here too', () => {
  it('reports none, exactly one, and more than one', async () => {
    const world = aWorld();
    after(() => world.close());

    assert.equal((await locateSnapshot(world.remote, { space: SPACE })).verdict, 'none');

    await world.remote.create(SPACE, { name: SNAPSHOT_NAME, content: '{}' });
    assert.equal((await locateSnapshot(world.remote, { space: SPACE })).verdict, 'one');

    // The measured quirk: the space does not enforce unique names, so a second create under the same
    // name yields a SECOND file. This is how a key envelope split on real devices in fifteen minutes.
    await world.remote.create(SPACE, { name: SNAPSHOT_NAME, content: '{}' });
    const many = await locateSnapshot(world.remote, { space: SPACE });
    assert.equal(many.verdict, 'many');
    assert.equal(many.file_ids.length, 2);
    assert.match(many.how, /surfaced rather than guessed/);
  });

  it('refuses to write when more than one answers to the name, rather than adopting the first', async () => {
    const world = aWorld();
    after(() => world.close());
    await world.remote.create(SPACE, { name: SNAPSHOT_NAME, content: '{}' });
    await world.remote.create(SPACE, { name: SNAPSHOT_NAME, content: '{}' });

    const result = await publishSnapshot(world.remote, { space: SPACE, text: '{}', held: null });
    assert.equal(result.outcome, PUBLISH.AMBIGUOUS);
    assert.equal(result.file_ids.length, 2);
  });
});

describe('sync/snapshot — detection, and exactly what it does not buy', () => {
  it('detects a revision that moved, and does not write over it', async () => {
    const world = aWorld();
    after(() => world.close());
    const created = await world.remote.create(SPACE, { name: SNAPSHOT_NAME, content: 'first' });

    // Somebody else writes. We are still holding the metadata from before.
    await world.remote.overwrite(created.file_id, 'somebody else’s snapshot');

    const result = await publishSnapshot(world.remote, { space: SPACE, text: 'mine', held: created });
    assert.equal(result.outcome, PUBLISH.RACED);
    const still = await world.remote.read(created.file_id);
    assert.equal(bytesToText(still.content), 'somebody else’s snapshot', 'nothing was discarded');
  });

  it('a caller that checked and found nothing moved can STILL lose the write', async () => {
    // This is the sharper point, and it is the reason nothing in this package calls the check a lock.
    const world = aWorld();
    after(() => world.close());
    const created = await world.remote.create(SPACE, { name: SNAPSHOT_NAME, content: 'first' });

    // 1. read the current metadata     2. compare — it has not moved
    const held = await world.remote.stat(created.file_id);
    assert.equal(held.revision, created.revision, 'the check passes');

    // …and here is the window nothing on this port can close.
    await world.remote.overwrite(created.file_id, 'the other device’s work');

    // 3. write
    await world.remote.overwrite(created.file_id, 'ours, composed before theirs existed');

    const final = await world.remote.read(created.file_id);
    assert.equal(bytesToText(final.content), 'ours, composed before theirs existed');
    assert.ok(!bytesToText(final.content).includes('other device'),
      'their work is simply gone, and nothing anywhere reported an error');
    assert.equal(RACE_IS_DETECTED_NOT_PREVENTED, true);
  });
});

describe('sync/snapshot — DETECTED AND RECOVERABLE: the loss is repaired from the authority', () => {
  it('a record dropped by a snapshot race comes back when the snapshot is rebuilt', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    await laptop.store.create('client', aClient({ name: 'On the laptop' }), { now: T0 });
    await sync(laptop, world);
    world.advance(60_000);
    await phone.store.create('client', aClient({ name: 'On the phone' }), { now: world.now() });
    await sync(phone, world, world.now());
    await sync(laptop, world, world.now());

    const before = await locateSnapshot(world.remote, { space: SPACE });
    const healthy = await readSnapshot(world.remote, before.meta.file_id);
    assert.deepEqual(namesIn(healthy.document), ['On the laptop', 'On the phone']);

    // ── force the lost update ────────────────────────────────────────────────────────────────
    // A device composed its snapshot before the phone's client existed, checked, and wrote inside the
    // window. The phone's client is now missing from the snapshot, and nothing errored.
    const stale = assembleSnapshot({
      union: { records: new Map(healthy.document.records.filter((r) => r.content?.name === 'On the laptop').map((r) => [r.record_id, r])) },
      device: 'coach-laptop',
      writtenAt: world.now(),
    });
    await world.remote.overwrite(before.meta.file_id, stale.text);

    const damaged = await readSnapshot(world.remote, before.meta.file_id);
    assert.deepEqual(namesIn(damaged.document), ['On the laptop'], 'the record really was lost');

    // ── the authority still holds it ─────────────────────────────────────────────────────────
    const union = await readUnion(world.remote, { space: SPACE });
    const survived = [...union.records.values()].some((r) => r.content?.name === 'On the phone');
    assert.equal(survived, true, 'the device areas never lost it — they are the authority');

    // ── rebuild ──────────────────────────────────────────────────────────────────────────────
    const rebuilt = await refreshSnapshot(world.remote, { space: SPACE, device: 'coach-laptop', now: world.now() });
    assert.equal(rebuilt.outcome, PUBLISH.REPLACED);

    const repaired = await readSnapshot(world.remote, before.meta.file_id);
    assert.deepEqual(namesIn(repaired.document), ['On the laptop', 'On the phone'],
      'correctness was restored, not merely reported');
    assert.equal(SNAPSHOT_IS_DERIVED_NEVER_AUTHORITY, true);
  });

  it('holds no record that is not also in a device area', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await laptop.store.create('client', aClient({ name: 'Only copy?' }), { now: T0 });
    await sync(laptop, world);

    const located = await locateSnapshot(world.remote, { space: SPACE });
    const { document } = await readSnapshot(world.remote, located.meta.file_id);
    const union = await readUnion(world.remote, { space: SPACE });

    for (const record of document.records) {
      assert.ok(union.records.has(record.record_id),
        `${record.record_id} is in the snapshot and in an area — the snapshot is never the only copy`);
    }
    assert.equal(SNAPSHOT_CARRIES_NO_RECORD_OF_ITS_OWN, true);
  });
});

describe('sync/snapshot — recovery on a device that has never synchronised', () => {
  it('recovers from the snapshot in one read', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await laptop.store.create('client', aClient({ name: 'His only client' }), { now: T0 });
    await sync(laptop, world);

    const replacement = await world.device('coach-replacement');
    const recovery = await recoverFromRemote(replacement.store, world.remote);
    assert.equal(recovery.source, 'snapshot');
    assert.equal(recovery.applied, 1);
    const page = await replacement.store.read('clients', (scope) => scope.count('clients'));
    assert.equal(page, 1);
  });

  it('recovers from the areas when the snapshot is gone — proving it was never the authority', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await laptop.store.create('client', aClient({ name: 'His only client' }), { now: T0 });
    await sync(laptop, world);

    const located = await locateSnapshot(world.remote, { space: SPACE });
    await world.remote.remove(located.meta.file_id);

    const replacement = await world.device('coach-replacement');
    const recovery = await recoverFromRemote(replacement.store, world.remote);
    assert.equal(recovery.source, 'areas');
    assert.equal(recovery.applied, 1);
  });

  it('reads the areas rather than adopting one of several snapshots', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await laptop.store.create('client', aClient({ name: 'His only client' }), { now: T0 });
    await sync(laptop, world);
    await world.remote.create(SPACE, { name: SNAPSHOT_NAME, content: '{}' });

    const replacement = await world.device('coach-replacement');
    const recovery = await recoverFromRemote(replacement.store, world.remote);
    assert.equal(recovery.source, 'areas');
    assert.match(recovery.how, /More than one file answers to the snapshot name/);
    assert.equal(recovery.applied, 1, 'and it recovered everything anyway');
  });
});

describe('sync/snapshot — a document this engine cannot read is reported, not overwritten', () => {
  it('keeps a broken area file out of the union and says so', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await laptop.store.create('client', aClient({ name: 'Readable' }), { now: T0 });
    await sync(laptop, world);

    await world.remote.create(SPACE, { name: 'fit.coach-phone.push.broken.json', content: 'not a document' });
    const union = await readUnion(world.remote, { space: SPACE });

    assert.equal(union.unreadable.length, 1);
    assert.equal(union.unreadable[0].name, 'fit.coach-phone.push.broken.json');
    assert.ok([...union.records.values()].some((r) => r.content?.name === 'Readable'),
      'and the rest of the synchronisation carried on');

    const report = await sync(laptop, world, world.now());
    assert.equal(report.unreadable.length, 1, 'the accountability surface can say it out loud');
  });

  it('decodes what it wrote', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await laptop.store.create('client', aClient({ name: 'Round trip' }), { now: T0 });
    await sync(laptop, world);

    const located = await locateSnapshot(world.remote, { space: SPACE });
    const file = await world.remote.read(located.meta.file_id);
    const document = decodeDocument(bytesToText(file.content));
    assert.equal(document.kind, 'snapshot');
    assert.equal(document.records.length, 1);
  });
});
