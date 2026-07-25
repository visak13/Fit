/**
 * THE REVISION RULE — proved by an actual round trip, and proved twice.
 *
 * Once that lifting the revision makes a reset survive synchronisation, and once that NOT lifting it
 * is genuinely undone by the remote copy. The second half is the important one: a rule whose absence
 * is never demonstrated is a rule nobody can tell is load-bearing, and this is a defect that looks
 * perfect on the device where it was made.
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { createEnvelope } from '../model/model.js';
import { anExercise } from '../model/fixtures.js';
import { SYNC_TRIGGERS, syncNow } from './engine.js';
import { SyncBoundaryError } from './errors.js';
import {
  HIGHER_REVISION_OR_THE_REMOTE_COPY_UNDOES_IT, liftAbove, replaceRecords, wouldBeUndone,
} from './revisions.js';
import { T0, aWorld } from './testing.js';

/** The shipped default, as an admin reset would compose it: a fresh envelope at revision one. */
const shippedDefault = (recordId, now) => createEnvelope({
  type: 'exercise',
  content: anExercise({ name: 'Test Push Up', coaching_cue: 'Body in one straight line, lower under control.' }),
  device: 'coach-laptop',
  now,
  record_id: recordId,
});

const sync = (dev, world, now) => syncNow(dev.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now });

describe('sync/revisions — the arithmetic', () => {
  it('lifts a replacement above what it replaces', () => {
    const existing = { record_id: 'r', type: 'exercise', rev: 7, device: 'coach-phone', created_at: T0 };
    const lifted = liftAbove(existing, { record_id: 'r', type: 'exercise', rev: 1, created_at: '2026-01-01T00:00:00.000Z' },
      { device: 'coach-laptop', now: T0 });

    assert.equal(lifted.rev, 8);
    assert.equal(lifted.device, 'coach-laptop');
    assert.equal(lifted.created_at, T0, 'a restored record did not begin now, but it did not begin then either');
  });

  it('leaves a first write alone, because skipping history would misread every later comparison', () => {
    const fresh = { record_id: 'r', rev: 1 };
    assert.equal(liftAbove(undefined, fresh, { device: 'd', now: T0 }), fresh);
  });

  it('refuses to lift a record above a different record', () => {
    assert.throws(() => liftAbove({ record_id: 'a', rev: 1 }, { record_id: 'b', rev: 1 },
      { device: 'coach-laptop', now: T0 }), SyncBoundaryError);
  });

  it('names the failure it prevents', () => {
    assert.equal(wouldBeUndone({ rev: 3 }, { rev: 1 }), true);
    assert.equal(wouldBeUndone({ rev: 3 }, { rev: 3 }), true, 'equal is not higher, and equal loses on the tiebreak');
    assert.equal(wouldBeUndone({ rev: 3 }, { rev: 4 }), false);
    assert.equal(wouldBeUndone(undefined, { rev: 1 }), false);
    assert.equal(HIGHER_REVISION_OR_THE_REMOTE_COPY_UNDOES_IT, true);
  });
});

describe('sync/revisions — the round trip, which is the only place this can be proved', () => {
  it('a reset written at a HIGHER revision survives synchronisation', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    // The coach edits a shipped exercise on the laptop, and it reaches the phone.
    const exercise = await laptop.store.create('exercise', anExercise(), { now: T0 });
    await sync(laptop, world, T0);
    await sync(phone, world, T0);
    world.advance(60_000);
    await laptop.store.update('exercise', exercise.record_id,
      (c) => ({ ...c, coaching_cue: 'His own cue', provenance: 'shipped-edited' }), { now: world.now() });
    await sync(laptop, world, world.now());
    await sync(phone, world, world.now());
    assert.equal((await phone.store.get('exercise', exercise.record_id)).content.coaching_cue, 'His own cue');

    // He presses reset-to-defaults. The replacement is lifted above what it replaces.
    world.advance(60_000);
    const { written, lifted } = await replaceRecords(laptop.store,
      [shippedDefault(exercise.record_id, world.now())], { now: world.now() });
    assert.equal(lifted, 1);
    assert.ok(written[0].rev > 2, 'it out-revises the edit it replaces');

    // The round trip: out to the remote copy, back to both devices.
    await sync(laptop, world, world.now());
    await sync(phone, world, world.now());
    await sync(laptop, world, world.now());

    assert.equal((await laptop.store.get('exercise', exercise.record_id)).content.coaching_cue,
      'Body in one straight line, lower under control.', 'the reset survived on the device that did it');
    assert.equal((await phone.store.get('exercise', exercise.record_id)).content.coaching_cue,
      'Body in one straight line, lower under control.', 'and reached the other device');
  });

  it('and WITHOUT the lift, the remote copy quietly undoes it — which is the whole point', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    const exercise = await laptop.store.create('exercise', anExercise(), { now: T0 });
    await sync(laptop, world, T0);
    await sync(phone, world, T0);
    world.advance(60_000);
    await laptop.store.update('exercise', exercise.record_id,
      (c) => ({ ...c, coaching_cue: 'His own cue', provenance: 'shipped-edited' }), { now: world.now() });
    await sync(laptop, world, world.now());
    await sync(phone, world, world.now());

    // The naive reset: the shipped default, written as authored, at revision one. An admin reset that
    // imports the shipped library with overwrite does exactly this.
    world.advance(60_000);
    const naive = shippedDefault(exercise.record_id, world.now());
    assert.equal(wouldBeUndone(await laptop.store.get('exercise', exercise.record_id), naive), true);
    await laptop.store.importRecords([naive], { overwrite: true });

    // Locally it looks perfect. The coach watches it work.
    assert.equal((await laptop.store.get('exercise', exercise.record_id)).content.coaching_cue,
      'Body in one straight line, lower under control.');

    // Then the application synchronises.
    await sync(laptop, world, world.now());
    await sync(phone, world, world.now());
    await sync(laptop, world, world.now());

    assert.equal((await laptop.store.get('exercise', exercise.record_id)).content.coaching_cue,
      'His own cue', 'his edited content came back, and nothing errored anywhere');
  });
});
