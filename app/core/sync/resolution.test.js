/**
 * APPLYING THE COACH'S ANSWER — and the three ways doing it wrong would be invisible.
 *
 * **One.** The answer is written at the revision both sides already claim. Everything looks right on
 * the device where he answered, and the discarded side comes back on a later pass with nothing
 * having errored. So the proof here is a ROUND TRIP against the other device rather than an
 * assertion about a number, and the same-revision failure is demonstrated rather than described:
 * `wouldBeUndone` is asserted to be TRUE of the write this module refuses to make.
 *
 * **Two.** The log records that a conflict was resolved and says nothing checkable about which one.
 * So the entry's SUBJECT and COUNT are asserted, not merely its kind and its author. The s13
 * reviewer found `sync.completed` recording zero records moved for a pass that had propagated a
 * deletion, because the suites proved which kinds were written and never what they said.
 *
 * **Three.** The ordinary pull path starts writing the kind too, and every routine last-write-wins
 * supersede is relabelled a collision — the log then overstating how often the coach's two devices
 * genuinely clashed. That is asserted twice: behaviourally, that a pass which SURFACED a divergence
 * wrote no such entry, and by a machine-checked scan that exactly one file in the whole core names
 * the kind at all.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import { JOURNAL_KINDS, JOURNAL_STORES, readChainPage } from '../journal/journal.js';
import { createEnvelope, reviseEnvelope } from '../model/model.js';
import { aClient } from '../model/fixtures.js';
import { SYNC_TRIGGERS, syncNow } from './engine.js';
import { describeDivergence } from './divergence.js';
import { SyncBoundaryError } from './errors.js';
import {
  NOTHING_HERE_CHOOSES_A_SIDE, RESOLUTION, RESOLUTION_VALUES, resolveDivergence, sidesOf,
} from './resolution.js';
import { wouldBeUndone } from './revisions.js';
import { T0, aWorld } from './testing.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE = dirname(HERE);

/** A store that fails loudly if it is touched: every refusal below must come before any write. */
const NO_STORE = /** @type {any} */ (new Proxy({}, {
  get() {
    throw new Error('a refused resolution reached the store. The refusal has to happen first, or a '
      + 'divergence that could not be resolved has already half-resolved itself.');
  },
}));

/** One device's chain, oldest first. Read, never appended to. */
async function entriesOn(dev) {
  const page = await dev.store.read(
    JOURNAL_STORES, (scope) => readChainPage(scope, dev.tag, { limit: 500 }),
  );
  return page.items;
}

const conflictEntriesOn = async (dev) => (await entriesOn(dev))
  .filter((e) => e.kind === JOURNAL_KINDS.SYNC_CONFLICT_RESOLVED);

/**
 * Two devices, one client, each having edited revision N without seeing the other — surfaced on the
 * LAPTOP, whose local side is its own note and whose incoming side is the phone's.
 */
async function aSurfacedDivergence(world) {
  const laptop = await world.device('coach-laptop');
  const phone = await world.device('coach-phone');

  const client = await laptop.store.create('client', aClient({ name: 'Shared' }), { now: T0 });
  await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
  await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });

  world.advance(60_000);
  await laptop.store.update('client', client.record_id, (c) => ({ ...c, notes: 'laptop note' }),
    { now: world.now() });
  world.advance(60_000);
  await phone.store.update('client', client.record_id, (c) => ({ ...c, notes: 'phone note' }),
    { now: world.now() });

  await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });
  const report = await syncNow(laptop.store, world.remote,
    { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });

  assert.equal(report.divergences.length, 1, 'the harness really did produce one, and exactly one');
  return { laptop, phone, client, divergence: report.divergences[0] };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('sync/resolution — it applies an answer and never supplies one', () => {
  it('offers exactly two answers, and declares that it chooses neither', () => {
    assert.deepEqual(RESOLUTION_VALUES, ['local', 'incoming'],
      'a third answer would be this module deciding something. Adding one is a change to this list '
      + 'and therefore a change this assertion sees.');
    assert.equal(NOTHING_HERE_CHOOSES_A_SIDE, true,
      'the counterpart to NEVER_RESOLVED_BY_GUESSING: the classifier does not decide and neither '
      + 'does the applier, so there is no seam between them for a default to be added to');
  });

  it('refuses a resolution with no side named, before touching the store', async () => {
    const start = createEnvelope({ type: 'client', content: aClient(), device: 'coach-laptop', now: T0 });
    const mine = reviseEnvelope(start, aClient({ notes: 'laptop' }), { device: 'coach-laptop', now: T0 });
    const theirs = reviseEnvelope(start, aClient({ notes: 'phone' }), { device: 'coach-phone', now: T0 });

    await assert.rejects(
      () => resolveDivergence(NO_STORE, describeDivergence(mine, theirs), /** @type {any} */ ({})),
      SyncBoundaryError,
      'no default side. A divergence with no answer is still a divergence.',
    );
  });

  it('refuses an answer that is not one of the two', async () => {
    const start = createEnvelope({ type: 'client', content: aClient(), device: 'coach-laptop', now: T0 });
    const mine = reviseEnvelope(start, aClient({ notes: 'laptop' }), { device: 'coach-laptop', now: T0 });
    const theirs = reviseEnvelope(start, aClient({ notes: 'phone' }), { device: 'coach-phone', now: T0 });

    await assert.rejects(
      () => resolveDivergence(NO_STORE, describeDivergence(mine, theirs), { side: 'newer' }),
      (error) => error instanceof SyncBoundaryError && /not an answer/.test(error.message),
      '"newer" is precisely the guess this whole package refuses to make',
    );
  });

  it('refuses an ordinary supersede handed to it as though it were a conflict', async () => {
    const local = createEnvelope({ type: 'client', content: aClient(), device: 'coach-laptop', now: T0 });
    const incoming = reviseEnvelope(local, aClient({ notes: 'later' }), { device: 'coach-phone', now: T0 });

    await assert.rejects(
      () => resolveDivergence(NO_STORE, describeDivergence(local, incoming), { side: RESOLUTION.INCOMING }),
      (error) => error instanceof SyncBoundaryError && /not a divergence/.test(error.message),
      'this is the guard that stops the routine pull path laundering every update through the '
      + 'conflict kind. A log in which every pull is a collision cannot be read for collisions.',
    );
  });

  it('refuses two sides that are not the same record', async () => {
    const mine = createEnvelope({ type: 'client', content: aClient(), device: 'coach-laptop', now: T0 });
    const theirs = createEnvelope({ type: 'client', content: aClient(), device: 'coach-phone', now: T0 });

    await assert.rejects(
      () => resolveDivergence(NO_STORE, { ...describeDivergence(mine, theirs), incoming: theirs },
        { side: RESOLUTION.LOCAL }),
      SyncBoundaryError,
    );
  });

  it('names the side without reading anything else, so a surface can label its own buttons', () => {
    const start = createEnvelope({ type: 'client', content: aClient(), device: 'coach-laptop', now: T0 });
    const mine = reviseEnvelope(start, aClient({ notes: 'laptop' }), { device: 'coach-laptop', now: T0 });
    const theirs = reviseEnvelope(start, aClient({ notes: 'phone' }), { device: 'coach-phone', now: T0 });
    const divergence = describeDivergence(mine, theirs);

    assert.equal(sidesOf(divergence, RESOLUTION.LOCAL).chosen.content.notes, 'laptop');
    assert.equal(sidesOf(divergence, RESOLUTION.LOCAL).discarded.content.notes, 'phone');
    assert.equal(sidesOf(divergence, RESOLUTION.INCOMING).chosen.content.notes, 'phone');
  });
});

describe('sync/resolution — the answer is written ABOVE both sides, never at their revision', () => {
  it('writes the chosen side at a strictly higher revision than either side claimed', async () => {
    const world = aWorld();
    after(() => world.close());
    const { laptop, client, divergence } = await aSurfacedDivergence(world);

    const resolution = await resolveDivergence(laptop.store, divergence,
      { side: RESOLUTION.INCOMING, now: world.now() });

    assert.equal(resolution.from_rev, divergence.rev);
    assert.ok(resolution.to_rev > divergence.local.rev, 'above the side it replaced');
    assert.ok(resolution.to_rev > divergence.incoming.rev, 'and above the side it took');

    const held = await laptop.store.get('client', client.record_id);
    assert.equal(held.content.notes, 'phone note', 'the answer really was applied');
    assert.equal(held.rev, resolution.to_rev);
    assert.equal(held.device, laptop.tag, 'and this device made the write, so the tiebreak knows who did');
  });

  it('the write it REFUSES to make is genuinely the one that loses — the guard, shown failing', async () => {
    const world = aWorld();
    after(() => world.close());
    const { laptop, divergence } = await aSurfacedDivergence(world);

    const resolution = await resolveDivergence(laptop.store, divergence,
      { side: RESOLUTION.INCOMING, now: world.now() });

    // Same content, written at the revision both sides already claim: the shape this module exists
    // to prevent. If this ever stops being undone, the lift above has stopped being load-bearing and
    // every other assertion in this file would pass for free.
    const atTheSameRevision = { ...divergence.incoming, rev: divergence.rev };
    assert.equal(wouldBeUndone(divergence.local, atTheSameRevision), true,
      'writing the answer at the shared revision LOSES the last-write-wins race, silently, minutes '
      + 'later — INTEGRATION.md §5 paid for this once already on the admin reset');
    assert.equal(wouldBeUndone(divergence.local, resolution.record), false,
      'and what the module actually wrote does not');
  });

  it('lifts above a write that landed while the coach was still deciding', async () => {
    const world = aWorld();
    after(() => world.close());
    const { laptop, client, divergence } = await aSurfacedDivergence(world);

    // He leaves the conflict on screen and edits the record elsewhere in the application first.
    world.advance(60_000);
    const meanwhile = await laptop.store.update('client', client.record_id,
      (c) => ({ ...c, notes: 'edited while the question was still open' }), { now: world.now() });

    const resolution = await resolveDivergence(laptop.store, divergence,
      { side: RESOLUTION.LOCAL, now: world.now() });

    assert.ok(resolution.to_rev > meanwhile.rev,
      'the floor is the record as it stands inside the transaction, not the revision the divergence '
      + 'was described at. Trusting the described number would lose to the newer write and undo the '
      + "coach's answer — the same losing-write shape, arriving through a door left open.");
  });
});

describe('sync/resolution — the entry says WHICH conflict, not merely that there was one', () => {
  it('writes exactly one conflict entry, naming the record it was about', async () => {
    const world = aWorld();
    after(() => world.close());
    const { laptop, client, divergence } = await aSurfacedDivergence(world);

    const before = await conflictEntriesOn(laptop);
    assert.deepEqual(before, [],
      'surfacing a divergence writes nothing. Only answering one does.');

    const resolution = await resolveDivergence(laptop.store, divergence,
      { side: RESOLUTION.LOCAL, now: world.now() });

    const entries = await conflictEntriesOn(laptop);
    assert.equal(entries.length, 1, 'one answer, one entry');
    const [entry] = entries;
    assert.deepEqual(entry.subject, { type: 'client', record_id: client.record_id },
      'the vocabulary requires a subject on this kind, and this is why: an entry saying only "a '
      + 'conflict was resolved" can never be checked against anything afterwards');
    assert.equal(entry.affected_count, 1,
      'one record moved. A count that said zero for a resolution that changed a record is exactly '
      + 'the s13 defect, pointing the other way.');
    assert.equal(entry.device, laptop.tag, 'recorded on the device that answered');
    assert.equal(entry.entry_id, resolution.entry.entry_id,
      'and the entry the caller was handed is the entry that is actually in the chain');
  });

  it('the entry and the record land together or not at all', async () => {
    const world = aWorld();
    after(() => world.close());
    const { laptop, client, divergence } = await aSurfacedDivergence(world);

    await resolveDivergence(laptop.store, divergence, { side: RESOLUTION.LOCAL, now: world.now() });

    const held = await laptop.store.get('client', client.record_id);
    const [entry] = await conflictEntriesOn(laptop);
    const chain = await entriesOn(laptop);
    assert.equal(held.content.notes, 'laptop note');
    assert.ok(entry, 'both, because they commit in one transaction');
    for (let i = 0; i < chain.length; i += 1) {
      assert.equal(chain[i].seq, i + 1, 'and the chain has no gap where the resolution sits');
    }
  });

  it('the discarded side is reported to the caller rather than quietly dropped', async () => {
    const world = aWorld();
    after(() => world.close());
    const { laptop, phone, divergence } = await aSurfacedDivergence(world);

    const resolution = await resolveDivergence(laptop.store, divergence,
      { side: RESOLUTION.LOCAL, now: world.now() });

    assert.equal(resolution.chose, RESOLUTION.LOCAL);
    assert.deepEqual(resolution.discarded, { device: phone.tag, rev: divergence.rev, deleted: false },
      'a surface has to be able to say WHAT was set aside and where it came from. "Resolved" with '
      + 'no account of the losing side is a lost edit the coach has been told about in the vaguest '
      + 'possible terms.');
  });
});

describe('sync/resolution — the answer survives the round trip, which is the only proof there is', () => {
  it('the chosen side reaches the other device and the discarded one does not come back', async () => {
    const world = aWorld();
    after(() => world.close());
    const { laptop, phone, client, divergence } = await aSurfacedDivergence(world);

    // He keeps the laptop's note. The phone is the device holding the side being discarded, so the
    // phone is where "it came back" would show up.
    await resolveDivergence(laptop.store, divergence, { side: RESOLUTION.LOCAL, now: world.now() });

    world.advance(60_000);
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });
    const onPhone = await syncNow(phone.store, world.remote,
      { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });

    assert.deepEqual(onPhone.divergences, [],
      'the question was answered, so it is not asked again. A resolution that left the clash in '
      + 'place would ask him the same thing on every pass until he stopped reading the surface.');
    assert.equal((await phone.store.get('client', client.record_id)).content.notes, 'laptop note',
      "the coach's answer crossed the device boundary");

    // Two more passes each way: this is where a write at the shared revision quietly loses.
    for (const dev of [laptop, phone, laptop, phone]) {
      world.advance(60_000);
      // eslint-disable-next-line no-await-in-loop
      await syncNow(dev.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });
    }

    for (const dev of [laptop, phone]) {
      // eslint-disable-next-line no-await-in-loop
      const held = await dev.store.get('client', client.record_id);
      assert.equal(held.content.notes, 'laptop note',
        `${dev.tag} still holds the answer several passes later. The failure this asserts against `
        + 'is not an error: it is the discarded edit returning minutes afterwards with everything '
        + 'reporting success.');
    }
  });

  it('a resolution taking the OTHER device\'s side survives the same way', async () => {
    const world = aWorld();
    after(() => world.close());
    const { laptop, phone, client, divergence } = await aSurfacedDivergence(world);

    await resolveDivergence(laptop.store, divergence, { side: RESOLUTION.INCOMING, now: world.now() });

    world.advance(60_000);
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });
    world.advance(60_000);
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });

    for (const dev of [laptop, phone]) {
      // eslint-disable-next-line no-await-in-loop
      const held = await dev.store.get('client', client.record_id);
      assert.equal(held.content.notes, 'phone note',
        `${dev.tag} holds the side he chose, and the laptop's own note did not reassert itself `
        + 'merely because the laptop is where the answer was given');
    }
  });
});

describe('sync/resolution — the ordinary supersede path still cannot say a conflict was resolved', () => {
  it('a pass that SURFACED a divergence recorded no resolution on either device', async () => {
    const world = aWorld();
    after(() => world.close());
    const { laptop, phone } = await aSurfacedDivergence(world);

    for (const dev of [laptop, phone]) {
      // eslint-disable-next-line no-await-in-loop
      assert.deepEqual(await conflictEntriesOn(dev), [],
        `${dev.tag} surfaced or caused a clash and wrote no resolution entry for it. The engine `
        + 'applies neither side, so it has nothing to attest to; an entry here would say the coach '
        + 'answered a question nobody has put to him yet.');
    }
  });

  it('a run of ordinary sequential passes writes none either', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    const client = await laptop.store.create('client', aClient({ name: 'Sequential' }), { now: T0 });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    world.advance(60_000);
    await phone.store.update('client', client.record_id, (c) => ({ ...c, notes: 'phone' }),
      { now: world.now() });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });

    for (const dev of [laptop, phone]) {
      // eslint-disable-next-line no-await-in-loop
      assert.deepEqual(await conflictEntriesOn(dev), [],
        'a routine last-write-wins pull is not a collision. Recording it as one would make the log '
        + "overstate how often the coach's two devices actually clashed — which is the number the "
        + 'log exists to be able to answer honestly.');
    }
  });

  it('exactly ONE file in the whole core names the kind, and this scan can genuinely find it', () => {
    const needle = 'JOURNAL_KINDS.SYNC_CONFLICT_RESOLVED';
    const sources = [];
    for (const name of readdirSync(CORE, { recursive: true })) {
      const posix = String(name).split('\\').join('/');
      if (!posix.endsWith('.js') || posix.endsWith('.test.js')) continue;
      if (posix.includes('/testing/') || posix.endsWith('/testing.js')) continue;
      if (posix.endsWith('/index.js') || posix === 'journal/kinds.js') continue;
      sources.push(join(CORE, String(name)));
    }

    const writers = sources
      .filter((path) => readFileSync(path, 'utf8').includes(needle))
      .map((path) => relative(CORE, path).split('\\').join('/'));

    assert.deepEqual(writers, ['sync/resolution.js'],
      'the kind has exactly one owner. A second writer is how a vocabulary stops meaning one thing, '
      + 'and the engine acquiring one is how every routine pull becomes a recorded collision.');
    assert.ok(sources.length > 20, 'and the scan really walked the source tree rather than an empty list');
    assert.ok(
      readFileSync(join(CORE, 'sync/engine.js'), 'utf8').includes('JOURNAL_KINDS.SYNC_STARTED'),
      'the scan finds constants where they genuinely are — without this, the assertion above would '
      + 'pass for free on a tree where nothing referenced anything',
    );
  });
});
