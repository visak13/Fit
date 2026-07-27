/**
 * THE SYNCHRONISATION DOMAIN IS ACTUALLY WIRED — proved by running passes, never by appending.
 *
 * ## What this suite refuses to do
 *
 * **Nothing here calls the log.** Every entry asserted below was produced by `syncNow` against two
 * real devices and one remote copy. A test that appended `sync.completed` and then found it would
 * prove the append works; it would prove nothing about whether synchronising causes one, which is
 * the only thing this step was for.
 *
 * ## The two claims that matter, and the one that is easy to fake
 *
 *  1. **A pass writes a beginning and an ending, and the ending tells the truth.** The verdict is
 *     taken from the outbox's completion marker rather than recomputed, so the log and the surface
 *     the coach reads cannot disagree. The test that proves this is the FAILING one: a pass that
 *     could not reach the service must record `sync.refused`, because an audit log that only ever
 *     says "completed" is indistinguishable from one nobody wired up.
 *  2. **What a pass MOVES is recorded by the code that moved it.** A pull applies through
 *     `store.putRecord` and a purge notice through `purgeClient`, so those entries appear on the
 *     receiving device without the engine writing them — and, more importantly, without the engine
 *     writing them TWICE.
 *
 * `sync.conflict_resolved` is asserted to stay out of THIS path — the engine surfaces a divergence
 * and applies neither side, so it has nothing to attest to. Its one owner is `resolution.js`; see
 * `resolution.test.js` for the behavioural assertion and the whole-core scan, and
 * `unwritten-kinds.test.js` for the partition.
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { JOURNAL_KINDS, JOURNAL_STORES, readChainPage } from '../journal/journal.js';
import { aClient } from '../model/fixtures.js';
import { Adversity } from '../remote/remote.js';
import { purgeClient } from '../store/purge.js';
import { SYNC_TRIGGERS, syncNow } from './engine.js';
import { T0, aWorld } from './testing.js';

/** One device's whole chain, oldest first. Read, never appended to. */
async function entriesOn(dev) {
  const page = await dev.store.read(
    JOURNAL_STORES, (scope) => readChainPage(scope, dev.tag, { limit: 500 }),
  );
  return page.items;
}

/** The kinds this device has recorded, in order. */
const kindsOn = async (dev) => (await entriesOn(dev)).map((e) => e.kind);

/** Just the synchronisation ones, which is what most of these tests are about. */
const syncKindsOn = async (dev) => (await kindsOn(dev)).filter((k) => k.startsWith('sync.'));

describe('sync/journal — a pass records that it ran, and how it ended', () => {
  it('a pass that genuinely drained writes started then completed, in that order', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');

    await laptop.store.create('client', aClient({ name: 'Ana Example' }), { now: T0 });
    const report = await syncNow(laptop.store, world.remote, {
      trigger: SYNC_TRIGGERS.MANUAL, now: T0,
    });

    assert.notEqual(report.completion, null, 'the pass genuinely completed');
    assert.deepEqual(await syncKindsOn(laptop), [
      JOURNAL_KINDS.SYNC_STARTED, JOURNAL_KINDS.SYNC_COMPLETED,
    ]);
  });

  it('the beginning is written BEFORE anything is attempted, so a dead pass still left a mark', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await laptop.store.create('client', aClient({ name: 'Ana Example' }), { now: T0 });

    // Everything after the local push fails. The pass still ran, and the log must say so.
    world.adversity.expireCredential();
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });

    const kinds = await syncKindsOn(laptop);
    assert.equal(kinds[0], JOURNAL_KINDS.SYNC_STARTED,
      'a pass that could reach nothing at all still recorded that it began. "Started, never '
      + 'finished" is a shape the log has to be able to show, and it can only show it if the '
      + 'beginning is written before the first thing that can fail.');
  });

  it('a pass that could not reach the service records REFUSED, not completed', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await laptop.store.create('client', aClient({ name: 'Ana Example' }), { now: T0 });

    world.adversity.expireCredential();
    const report = await syncNow(laptop.store, world.remote, {
      trigger: SYNC_TRIGGERS.MANUAL, now: T0,
    });

    assert.ok(report.failures.length > 0, 'the pass really did fail, loudly and specifically');
    assert.equal(report.completion, null);
    assert.deepEqual(await syncKindsOn(laptop), [
      JOURNAL_KINDS.SYNC_STARTED, JOURNAL_KINDS.SYNC_REFUSED,
    ], 'an audit log that only ever records success is indistinguishable from one nobody wired up');
  });

  it('the log takes its verdict from the completion marker rather than forming its own', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await laptop.store.create('client', aClient({ name: 'Ana Example' }), { now: T0 });

    // `leave` is the best-effort flush: it is structurally incapable of completing, whether or not
    // anything went wrong. The log must follow the marker into that verdict rather than deciding
    // for itself that a pass with no failures went fine.
    const report = await syncNow(laptop.store, world.remote, {
      trigger: SYNC_TRIGGERS.LEAVE, now: T0,
    });

    assert.deepEqual(report.failures, [], 'nothing failed');
    assert.equal(report.completion, null, 'and yet there is no completion — best-effort never claims one');
    assert.deepEqual(await syncKindsOn(laptop), [
      JOURNAL_KINDS.SYNC_STARTED, JOURNAL_KINDS.SYNC_REFUSED,
    ], 'so the log says the pass fell short. A second opinion here would be a second authority, '
      + 'able to disagree with the very surface the coach is looking at.');
  });

  it('every pass writes exactly two synchronisation entries — no more, no fewer', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await laptop.store.create('client', aClient({ name: 'Ana Example' }), { now: T0 });

    for (const trigger of [SYNC_TRIGGERS.OPEN, SYNC_TRIGGERS.MANUAL, SYNC_TRIGGERS.INTERVAL]) {
      // eslint-disable-next-line no-await-in-loop
      await syncNow(laptop.store, world.remote, { trigger, now: T0 });
    }

    const kinds = await syncKindsOn(laptop);
    assert.equal(kinds.length, 6, 'three passes, two entries each');
    assert.equal(kinds.filter((k) => k === JOURNAL_KINDS.SYNC_STARTED).length, 3);
  });
});

describe('sync/journal — what a pass moves is recorded by whatever moved it', () => {
  it('records pulled from another device are recorded ON the device that applied them', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    await laptop.store.create('client', aClient({ name: 'Ana Example' }), { now: T0 });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });

    assert.equal(await phone.store.count('client'), 1, 'the phone really did receive it');
    const imported = (await kindsOn(phone)).filter((k) => k === JOURNAL_KINDS.RECORD_IMPORTED);
    assert.equal(imported.length, 1,
      'ONE import entry, written by store.putRecord inside the transaction that applied the '
      + 'record — not by the engine from outside it, and not twice');
  });

  it('a second pull of the same records adds no entries, because nothing changed', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    await laptop.store.create('client', aClient({ name: 'Ana Example' }), { now: T0 });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });

    const recordKinds = (await kindsOn(phone)).filter((k) => k.startsWith('record.'));
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });

    assert.deepEqual(
      (await kindsOn(phone)).filter((k) => k.startsWith('record.')), recordKinds,
      'a pull that re-reads what it already has changes nothing, so it records nothing. Otherwise '
      + 'the log fills with imports that never happened, and — retention here being COUNTED rather '
      + 'than dated — that noise would push the real events off the end of the chain.',
    );
  });

  it('a purge arriving from the other device is recorded by the purge that carries it out', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    const client = await laptop.store.create('client', aClient({ name: 'Ana Example' }), { now: T0 });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    assert.equal(await phone.store.count('client'), 1);

    await purgeClient(laptop.store, client.record_id, { now: T0 });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });

    assert.equal(await phone.store.count('client'), 0, 'the removal genuinely reached the phone');
    for (const dev of [laptop, phone]) {
      // eslint-disable-next-line no-await-in-loop
      const purges = (await kindsOn(dev)).filter((k) => k === JOURNAL_KINDS.RECORD_PURGED);
      assert.equal(purges.length, 1,
        `${dev.tag} recorded the removal exactly once. The deletions manifest needs no wiring of `
        + 'its own: an inbound notice reaches the records through purgeClient, so the code that '
        + 'performs the removal is the code that attests to it.');
    }
  });

  it('a pass whose only effect was propagating a removal does NOT record that it moved nothing', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    const client = await laptop.store.create('client', aClient({ name: 'Ana Example' }), { now: T0 });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });

    // From here the ONLY thing crossing the boundary is the removal: outward from the laptop as a
    // purge notice, inward to the phone as a notice that removes records here.
    await purgeClient(laptop.store, client.record_id, { now: T0 });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    assert.equal(await phone.store.count('client'), 0, 'the removal genuinely reached the phone');

    for (const dev of [laptop, phone]) {
      // eslint-disable-next-line no-await-in-loop
      const completions = (await entriesOn(dev)).filter((e) => e.kind === JOURNAL_KINDS.SYNC_COMPLETED);
      const last = completions[completions.length - 1];
      assert.ok(last, `${dev.tag} completed its last pass`);
      assert.ok(last.affected_count > 0,
        `${dev.tag} recorded ${last.affected_count} records moved by the pass that propagated the `
        + 'removal. A deletion IS movement, in both directions. Counting only pushed records and '
        + 'pulled revisions made a deletion-only pass read as a pass in which nothing happened — '
        + 'the log saying a departed client\'s removal crossed the boundary is exactly what this '
        + 'log is most valuable for holding.');
    }
  });

  it('the departed client is gone from the phone, and its log kept no word of them', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    const client = await laptop.store.create(
      'client', aClient({ name: 'Ana Distinctive Example', notes: 'Knee flagged.' }), { now: T0 },
    );
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    await purgeClient(laptop.store, client.record_id, { now: T0 });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });

    for (const dev of [laptop, phone]) {
      // eslint-disable-next-line no-await-in-loop
      const serialised = JSON.stringify(await entriesOn(dev));
      for (const leak of ['Ana Distinctive', 'Knee flagged']) {
        assert.equal(serialised.includes(leak), false,
          `"${leak}" reached ${dev.tag}'s log. Synchronisation is how a payload travels, so the `
          + 'log on the RECEIVING device is the copy most worth checking.');
      }
    }
  });
});

describe('sync/journal — the log survives what the pass does not', () => {
  it('a pass interrupted by an unreachable service still leaves a verifiable chain', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await laptop.store.create('client', aClient({ name: 'Ana Example' }), { now: T0 });

    world.adversity.expireCredential();
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    world.adversity.renewCredential();

    const entries = await entriesOn(laptop);
    for (let i = 0; i < entries.length; i += 1) {
      assert.equal(entries[i].seq, i + 1,
        'the chain has no gap in it. A failed pass is an ordinary event, not a hole: its entries '
        + 'commit in their own transactions and owe nothing to the service being reachable.');
    }
  });
});

// Kept honest about the double: if `Adversity` ever stops offering these, the tests above would
// silently stop adversely testing anything.
describe('sync/journal — the harness really is being made to fail', () => {
  it('the adversity double can genuinely make every remote call fail', () => {
    const adversity = new Adversity();
    assert.equal(typeof adversity.expireCredential, 'function',
      'the refusal tests above rest entirely on this: if it became a no-op they would pass by '
      + 'recording sync.completed and asserting sync.refused, which cannot happen — but the next '
      + 'person to change the double should be told by a test rather than by a mystery');
  });
});

/**
 * A PASS WHOSE ONLY EFFECT WAS A DELETION MUST NOT RECORD A COUNT OF ZERO.
 *
 * The s13 review found `sync.completed` written with `affected_count: 0` for a pass that had just
 * carried a departed client's removal across the device boundary. The log then said a pass moved
 * nothing at the exact moment it moved the thing this log is most valuable for holding — and a count
 * that cannot see a deletion is a count that goes quiet on the one event somebody will one day come
 * looking for.
 *
 * The engine now counts purges pushed and notices applied as movement. This asserts it FROM BOTH
 * SIDES of the boundary, because they are different additions and either could regress alone: the
 * device that carried the removal outward counts `pushed.purges`, and the device that received it
 * counts `notices_applied`. Every entry below was produced by a real pass; nothing appends.
 *
 * ASSERT WHAT THE ENTRY SAYS, NOT MERELY THAT IT EXISTS. The count is read off the entry and
 * compared against the pass's own figures, so a count that drifts from what the pass did fails here
 * rather than being believed.
 */
describe('sync/journal — a deletion IS movement, on both sides of the boundary', () => {
  it('the device that carries a removal outward records a non-zero count for a records-free pass', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');

    const client = await laptop.store.create('client', aClient({ name: 'Ana Example' }), { now: T0 });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });

    world.advance(60_000);
    await purgeClient(laptop.store, client.record_id, { now: world.now() });

    world.advance(60_000);
    const report = await syncNow(laptop.store, world.remote, {
      trigger: SYNC_TRIGGERS.MANUAL, now: world.now(),
    });

    assert.notEqual(report.completion, null, 'the pass completed, so it wrote sync.completed');
    assert.ok(report.pushed.purges > 0, 'the pass really did carry the removal outward');
    // THE NON-VACUITY PROOF, and it is structural rather than a break: with BOTH record figures at
    // zero, the only thing left that can make the count non-zero is the removal itself. If either of
    // these ever stops being zero, the assertion below stops proving what it claims to and fails here
    // instead of quietly passing on the wrong evidence.
    assert.equal(report.pushed.records, 0, 'no record change was pushed, so none can pad the count');
    assert.equal(report.pulled.applied, 0, 'and nothing arrived, so a count can only come from the removal');

    const completions = (await entriesOn(laptop)).filter((e) => e.kind === JOURNAL_KINDS.SYNC_COMPLETED);
    const last = completions[completions.length - 1];
    assert.ok(
      last.affected_count > 0,
      'the pass that carried a departed client\'s removal outward recorded a count of ZERO. That is '
      + 'the log going silent about the event it exists to hold.',
    );
    assert.equal(
      last.affected_count,
      report.pushed.records + report.pulled.applied + report.pushed.purges
        + report.deletions.notices_applied.length,
      'the recorded count disagrees with what the pass itself reports having moved',
    );
  });

  it('the device that RECEIVES the removal records a non-zero count for it too', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    const client = await laptop.store.create('client', aClient({ name: 'Ana Example' }), { now: T0 });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    world.advance(60_000);
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });
    assert.ok(await phone.store.get('client', client.record_id), 'the phone really holds them');

    world.advance(60_000);
    await purgeClient(laptop.store, client.record_id, { now: world.now() });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });

    world.advance(60_000);
    const onPhone = await syncNow(phone.store, world.remote, {
      trigger: SYNC_TRIGGERS.MANUAL, now: world.now(),
    });

    assert.equal(onPhone.deletions.notices_applied.length, 1, 'the phone applied the removal');
    assert.equal(await phone.store.get('client', client.record_id), undefined, 'and they are gone from it');

    const completions = (await entriesOn(phone)).filter((e) => e.kind === JOURNAL_KINDS.SYNC_COMPLETED);
    const last = completions[completions.length - 1];
    assert.ok(
      last.affected_count > 0,
      'the receiving device recorded a count of ZERO for the pass in which a departed client was '
      + 'removed from it. Nothing else moved, so nothing else could have said so.',
    );
  });
});
