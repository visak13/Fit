/**
 * THE DEPARTED CLIENT MUST NOT SURVIVE IN THE QUEUE EITHER.
 *
 * The record stores are swept by the purge and the remote copies are swept by compaction, and both
 * were proven before this file existed. The queue was the hole between them: a delivered entry is
 * KEPT deliberately — it is the evidence a delivery happened and the local half of the duplicate
 * defence — and the routine that prunes delivered entries is caller-owned with no caller. So entries
 * accumulated forever in the one store the per-client purge did not touch, still holding the
 * departed client's name, general notes and readings in plain text.
 *
 * The scenario below is the one that measured it: create with a distinctive name and notes,
 * synchronise, purge, synchronise again — then look in the queue rather than in the stores.
 *
 * The other three tests are the ways a fix for it turns into a worse defect than the one it closed:
 * another client's pending work destroyed, a shared session's other attendees destroyed with it, or
 * an entry left half-formed and undeliverable for ever.
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { aClient, aReading, aSession } from '../model/fixtures.js';
import { STATUS, STATUS_VALUES, entriesByStatus, validateEntry } from '../outbox/outbox.js';
import { purgeClient } from '../store/store.js';
import { readUnion } from './areas.js';
import { SYNC_TRIGGERS, syncNow } from './engine.js';
import { T0, aWorld } from './testing.js';

const SPACE = 'visible';

/** The name and the notes are deliberately unmistakable: a substring search must not be ambiguous. */
const DEPARTED_NAME = 'Zephyrine Quixotal-Marchetti';
const DEPARTED_NOTES = 'MARKER-GENERAL-NOTES-9f3a: prefers early mornings, avoid deep squats.';
const STAYING_NAME = 'Perpetua Stayingwell';
const STAYING_NOTES = 'MARKER-STAYING-NOTES-71bd: happy with the current split.';

const sync = (dev, world, now) => syncNow(dev.store, world.remote, {
  trigger: SYNC_TRIGGERS.MANUAL, now: now ?? world.now(),
});

/** Every entry in the queue, in every status. There is no call that loads the queue whole. */
async function allEntries(store) {
  /** @type {any[]} */
  const entries = [];
  for (const status of STATUS_VALUES) {
    let cursor = null;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const page = await entriesByStatus(store, status, { limit: 100, after: cursor });
      entries.push(...page.items);
      if (page.done || page.items.length === 0) break;
      cursor = page.cursor;
    }
  }
  return entries;
}

/** The records carried inside one entry's payload, or an empty list when it carries none. */
function recordsIn(entry) {
  if (typeof entry.payload !== 'string') return [];
  let document;
  try {
    document = JSON.parse(entry.payload);
  } catch {
    return [];
  }
  return Array.isArray(document?.records) ? document.records : [];
}

/**
 * A shared practice: two clients, one session they both attended, a reading each, and a solo
 * session for the departing client so there is something whose removal is unambiguous.
 */
async function aSharedPractice(store, now) {
  const departing = await store.create('client', aClient({
    name: DEPARTED_NAME, notes: DEPARTED_NOTES,
  }), { now });
  const staying = await store.create('client', aClient({
    name: STAYING_NAME, notes: STAYING_NOTES,
  }), { now });
  const shared = await store.create('session', aSession({
    client_ids: [departing.record_id, staying.record_id],
    status: 'completed', started_at: now, ended_at: now,
  }), { now });
  const solo = await store.create('session', aSession({
    client_ids: [departing.record_id], status: 'completed', started_at: now, ended_at: now,
  }), { now });
  const theirReading = await store.create('reading', aReading({
    client_id: departing.record_id, session_id: shared.record_id, value: 613, taken_at: now,
  }), { now });
  const otherReading = await store.create('reading', aReading({
    client_id: staying.record_id, session_id: shared.record_id, value: 741, taken_at: now,
  }), { now });
  return { departing, staying, shared, solo, theirReading, otherReading };
}

describe('sync/purge — the queue is one more place the departed client lives', () => {
  it('leaves the name and the notes in no outbox entry, delivered or not', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');

    const practice = await aSharedPractice(laptop.store, T0);
    await sync(laptop, world, T0);

    // Measured before the purge, so a test that proves nothing is visible as one: the detail IS in
    // the queue at this point, which is what makes its later absence meaningful.
    const queued = await allEntries(laptop.store);
    assert.ok(queued.some((e) => String(e.payload).includes(DEPARTED_NAME)),
      'the scenario is wrong if the name was never in the queue to begin with');

    world.advance(60_000);
    await purgeClient(laptop.store, practice.departing.record_id, { now: world.now() });

    for (let pass = 0; pass < 3; pass += 1) {
      world.advance(60_000);
      // eslint-disable-next-line no-await-in-loop
      await sync(laptop, world);
    }

    const entries = await allEntries(laptop.store);
    assert.ok(entries.length > 0, 'the queue is empty, so this proves nothing');

    for (const entry of entries) {
      const text = JSON.stringify(entry);
      assert.ok(!text.includes(DEPARTED_NAME),
        `entry ${entry.entry_id} (${entry.status}) still carries the departed client's name`);
      assert.ok(!text.includes(DEPARTED_NOTES),
        `entry ${entry.entry_id} (${entry.status}) still carries the departed client's notes`);

      // The structural check, which is the real one. A text search can only find what somebody
      // thought to search for; this finds any record of theirs whatever it holds.
      for (const record of recordsIn(entry)) {
        assert.notEqual(record.record_id, practice.departing.record_id);
        assert.notEqual(record.record_id, practice.theirReading.record_id);
        assert.notEqual(record.record_id, practice.solo.record_id);
        assert.notEqual(record.content?.client_id, practice.departing.record_id);
        assert.ok(!(record.content?.client_ids || []).includes(practice.departing.record_id),
          `entry ${entry.entry_id} still names the departed client in a session's participants`);
      }
    }

    // And the local stores and the remote copy are clean too — the gap was the queue, and closing
    // it must not have re-opened either of the halves that already worked.
    assert.equal(await laptop.store.get('client', practice.departing.record_id), undefined);
    const union = await readUnion(world.remote, { space: SPACE });
    assert.ok(!union.records.has(practice.departing.record_id));
    assert.ok(!union.records.has(practice.theirReading.record_id));
  });

  it('leaves another client’s undelivered entry intact, and still deliverable', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');

    const practice = await aSharedPractice(laptop.store, T0);

    // Nothing can leave the device, so the work stays on the queue where the purge will meet it.
    world.adversity.expireCredential();
    await sync(laptop, world, T0);

    const pendingBefore = await entriesByStatus(laptop.store, STATUS.PENDING, { limit: 100 });
    assert.ok(pendingBefore.items.length > 0, 'the scenario needs undelivered work to protect');

    world.advance(60_000);
    await purgeClient(laptop.store, practice.departing.record_id, { now: world.now() });

    // The staying client's work is still queued, still pending, and still names them.
    const pendingAfter = await allEntries(laptop.store);
    const carrying = pendingAfter.filter((e) => recordsIn(e)
      .some((r) => r.record_id === practice.staying.record_id));
    assert.ok(carrying.length > 0, 'the purge destroyed the staying client’s queued work');
    for (const entry of carrying) assert.equal(entry.status, STATUS.PENDING);

    // Deliverable, not merely present. The credential comes back and the queue drains.
    world.adversity.renewCredential();
    world.advance(60_000);
    const report = await sync(laptop, world);
    assert.deepEqual(report.failures, [], 'a cleaned entry made the queue undeliverable');

    const stillWaiting = await entriesByStatus(laptop.store, STATUS.PENDING, { limit: 100 });
    assert.equal(stillWaiting.items.length, 0, 'an entry is stuck pending after the purge');
    assert.equal((await entriesByStatus(laptop.store, STATUS.REJECTED, { limit: 100 })).items.length, 0);
    assert.equal((await entriesByStatus(laptop.store, STATUS.AMBIGUOUS, { limit: 100 })).items.length, 0);

    // And what landed is the staying client, without the departed one.
    const union = await readUnion(world.remote, { space: SPACE });
    assert.ok(union.records.has(practice.staying.record_id));
    assert.ok(union.records.has(practice.otherReading.record_id));
    assert.ok(!union.records.has(practice.departing.record_id));
    assert.ok(!union.records.has(practice.theirReading.record_id));
  });

  it('keeps the shared session for its other attendees, minus the departed client', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');

    const practice = await aSharedPractice(laptop.store, T0);
    await sync(laptop, world, T0);

    world.advance(60_000);
    await purgeClient(laptop.store, practice.departing.record_id, { now: world.now() });

    const entries = await allEntries(laptop.store);
    const copies = entries.flatMap(recordsIn).filter((r) => r.record_id === practice.shared.record_id);
    assert.ok(copies.length > 0, 'the shared session was destroyed in the queue, taking the other attendee’s history');
    for (const copy of copies) {
      assert.deepEqual(copy.content.client_ids, [practice.staying.record_id]);
    }

    // The other attendee's own rows are untouched wherever they were queued.
    const theirs = entries.flatMap(recordsIn)
      .filter((r) => r.record_id === practice.otherReading.record_id);
    assert.ok(theirs.length > 0, 'the staying client’s reading was swept up with the departed client’s');
    for (const copy of theirs) assert.equal(copy.content.value, 741);
  });

  it('leaves no entry half-formed: every entry the purge touched is still a valid one', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');

    const practice = await aSharedPractice(laptop.store, T0);
    world.adversity.expireCredential();
    await sync(laptop, world, T0);

    world.advance(60_000);
    await purgeClient(laptop.store, practice.departing.record_id, { now: world.now() });

    for (const entry of await allEntries(laptop.store)) {
      const { ok, issues } = validateEntry(entry);
      assert.ok(ok, `entry ${entry.entry_id} is no longer a valid entry: ${JSON.stringify(issues)}`);
      // The three fields a replay rests on are never rewritten, or the queue loses its ordering and
      // its recognition of its own earlier write.
      assert.equal(typeof entry.idempotency_key, 'string');
      assert.ok(Number.isInteger(entry.seq) && entry.seq >= 1);
      if (entry.operation === 'create') assert.ok(entry.name.includes(entry.idempotency_key));
      if (entry.payload !== null) assert.doesNotThrow(() => JSON.parse(entry.payload));
    }
  });
});
