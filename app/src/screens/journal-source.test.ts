/**
 * THE JOURNAL READ PATH, DRIVEN AGAINST A REAL LOG — and shaped by what a wrong answer would look
 * like rather than by what a right one looks like.
 *
 * Four of these exist because the failure they guard is invisible:
 *
 *  - **The trap.** An entry carries an opaque record identity and never a name. A source that joined
 *    it back to the record would put a removed client's name on the log screen — resurrecting exactly
 *    what the deletion path destroyed — and every other test here would still pass. So the fixtures
 *    hold a genuinely TOMBSTONED client and a genuinely PURGED one, and the assertion is about what
 *    is ABSENT from the published value, checked against the names the fixtures actually used.
 *  - **The total.** A filtered page is short by design. A screen holding only the page would say
 *    "this is all there is" while entries sat behind the filter, so `total` is asserted to disagree
 *    with the page's own length, and to CHANGE when the filter changes. A count that merely equalled
 *    the page would pass a test asserting it exists.
 *  - **Truncation and a break at once.** `truncated_head` and `ok` are independent facts about one
 *    device, and a surface folding either into the other either accuses retention of tampering or
 *    hides a real break behind a housekeeping notice. Both are asserted on one device, together.
 *  - **Ordering.** There is no global sequence across devices. The assertion is therefore that order
 *    holds WITHIN a device and that devices are not interleaved — not that some combined order is
 *    correct, because no combined order would be.
 *
 * Every field asserted is paired with an assertion that changing it changes the output: a
 * computed-but-unread flag passes its own test while doing nothing.
 *
 *     node tools/run-suite-tests.mjs shell
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { DIVERGENCE } from '../../core/journal/chain.js';
import {
  JOURNAL_STORES, anchorKeyFor, commitEntryInScope, prepareEntry, readChainPage, recordChange,
} from '../../core/journal/durable.js';
import { JournalShapeError } from '../../core/journal/errors.js';
import { JOURNAL_KINDS, KIND_SPECS } from '../../core/journal/kinds.js';
import { verifyWholeJournal } from '../../core/journal/survey.js';
import { aClient, anExercise } from '../../core/model/fixtures.js';
import { createEnvelope } from '../../core/model/model.js';
import { runWrite } from '../../core/store/db.js';
import type { Scope } from '../../core/store/db.js';
import { JOURNAL_STORE, META_STORE, RECORD_STORES } from '../../core/store/schema.js';
import { openLocalStore, purgeClient, storesFor } from '../../core/store/store.js';
import { createLaptop, settle } from '../../core/store/testing/platform-double.js';

import { describeJournal } from './journal';
import {
  FIRST_JOURNAL_PAGE, JOURNAL_PAGE_LIMIT, appendJournalPage, countJournalEntries, domainOfKind,
  matchesJournalEntry, readJournal, readJournalPage, screenReading, verifyJournal,
} from './journal-source';
import type { JournalLogReading, JournalPage, JournalQuery, JournalWasRead } from './journal-source';

const LAPTOP = 'coach-laptop';
const PHONE = 'coach-phone';

/** The small retention policy the core's own suites use, so pruning is reachable without 5000 rows. */
const SMALL = Object.freeze({ max: 20, batch: 5, ceiling: 100 });

/** Stores opened by this file, closed once at the end whatever happened. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const opened: any[] = [];

after(async () => {
  for (const store of opened) {
    // eslint-disable-next-line no-await-in-loop
    await store.close();
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aStore(device = LAPTOP): Promise<any> {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device });
  opened.push(store);
  return store;
}

/**
 * Entries for ANOTHER device, sitting in this store as a synchronised copy of its chain would: own
 * chain, own sequence from 1. Copied from `core/journal/survey.test.js`, which is where the shape of
 * a second device's chain is defined.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeChainFor(store: any, device: string, count: number): Promise<void> {
  for (let n = 1; n <= count; n += 1) {
    // eslint-disable-next-line no-await-in-loop -- an append links to the entry before it.
    const draft = await prepareEntry(store.handle, {
      kind: JOURNAL_KINDS.SYNC_COMPLETED,
      device,
      entry_id: `${device}-${n}`,
      at: new Date(Date.UTC(2026, 6, 26, 8, 0, n)).toISOString(),
    }, { retention: SMALL });
    // eslint-disable-next-line no-await-in-loop
    await runWrite(store.handle, [...JOURNAL_STORES], (scope: Scope) => commitEntryInScope(scope, draft));
  }
}

/**
 * One record and its entry through the one door, under the SMALL retention policy.
 *
 * `store.create` carries the shipped policy of five thousand entries per device, so pruning is out
 * of reach from it. Copied from `core/journal/survey.test.js`, which is where the shape of a write
 * that can actually prune is defined.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeARecord(store: any, n: number): Promise<void> {
  const at = new Date(Date.UTC(2026, 6, 26, 9, 0, 0) + n * 1000).toISOString();
  const record = createEnvelope({
    type: 'exercise',
    content: anExercise({ id: `journal-source-exercise-${n}` }),
    device: store.device,
    now: at,
  });

  await recordChange(store, {
    stores: storesFor('exercise'),
    retention: SMALL,
    fields: {
      kind: JOURNAL_KINDS.RECORD_CREATED,
      at,
      entry_id: `entry-${store.device}-${n}`,
      subject: { type: 'exercise', record_id: record.record_id },
    },
    work: async (scope: Scope) => {
      await scope.put(RECORD_STORES.exercise, record);
      return record;
    },
  });
}

/** `n` clients created on this device, which is `n` `record.created` entries on its chain. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createClients(store: any, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let n = 1; n <= count; n += 1) {
    // eslint-disable-next-line no-await-in-loop -- writes are sequential, as they are in the app.
    const record = await store.create('client', aClient({ name: `Example Client ${n}` }));
    ids.push(record.record_id);
  }
  return ids;
}

/**
 * Whatever `readJournal` published, or null if it published nothing.
 *
 * `settle` is called repeatedly rather than once: a read on the double is a scheduled task rather
 * than a resolved promise, and this read is several transactions deep — a page per device, the count
 * walk, and a verification per device. One settle drains four turns and would report "nothing was
 * published" for a read still perfectly healthily in flight.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function published(store: any, query: JournalQuery = FIRST_JOURNAL_PAGE, reloads?: number)
  : Promise<JournalLogReading | null> {
  let seen: JournalLogReading | null = null;
  readJournal(store, query, (reading) => { seen = reading; }, { reloads });

  for (let attempt = 0; attempt < 40 && seen === null; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    await settle();
  }
  return seen;
}

/**
 * What the read published, WHEN IT SUCCEEDED — and it fails loudly rather than narrowing quietly.
 *
 * The three states are mutually exclusive at the type level, so a test that wanted a page had to say
 * which state it expected. Saying it here means every existing assertion below is also an assertion
 * that the read did not fail, which is what the old two-state shape could not express.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readOnce(store: any, query: JournalQuery = FIRST_JOURNAL_PAGE)
  : Promise<JournalWasRead | null> {
  const seen = await published(store, query);
  if (seen === null) return null;
  assert.equal(seen.status, 'read', `the read did not succeed: ${JSON.stringify(seen)}`);
  return seen as JournalWasRead;
}

/** The query, with one field changed. */
function withQuery(changes: Partial<JournalQuery>): JournalQuery {
  return { ...FIRST_JOURNAL_PAGE, ...changes };
}

// ── order comes from the chain ──────────────────────────────────────────────────────────────────

describe('the order the page comes back in', () => {
  it('is newest-first within a device, and that is the chain order rather than the clock', async () => {
    const store = await aStore();
    await createClients(store, 6);

    const page = await readJournalPage(store);
    const seqs = page.entries.map((entry) => entry.seq);

    assert.deepEqual(seqs, [...seqs].sort((a, b) => b - a), 'the most recent entry is at the top');
    assert.equal(page.entries[0].seq, 6, 'and it is the newest entry, not the oldest');

    // PAIRED: the order is not an artefact of insertion order agreeing with the clock. The `at`
    // field is the untrusted device clock; making it disagree with the chain must not move anything.
    const newest = await store.read(
      JOURNAL_STORE,
      (scope: Scope) => readChainPage(scope, LAPTOP, { limit: 1, direction: 'prev' }),
    );
    const misdated = { ...newest.items[0], at: new Date(Date.UTC(1999, 0, 1)).toISOString() };
    await runWrite(store.handle, JOURNAL_STORE, (scope: Scope) =>
      scope.put(JOURNAL_STORE, misdated));

    const after = await readJournalPage(store);
    assert.equal(after.entries[0].seq, 6, 'the oldest clock reading is still at the top: order is the chain');
    assert.equal(after.entries[0].at, misdated.at, 'and it is genuinely the row that was re-dated');
  });

  it('keeps devices apart rather than inventing one order across them', async () => {
    const store = await aStore();
    await createClients(store, 3);
    await writeChainFor(store, PHONE, 3);

    const page = await readJournalPage(store);
    const devices = page.entries.map((entry) => entry.device);

    assert.equal(page.entries.length, 6, 'both chains are read');
    // Grouped: every entry of one device is contiguous. An interleaved list would be a single order
    // across devices, and there is no sequence spanning devices to derive one from.
    assert.deepEqual(
      devices.filter((device, index) => index === 0 || devices[index - 1] !== device),
      [...new Set(devices)],
      'each device appears in one run, not interleaved with the other',
    );

    for (const device of new Set(devices)) {
      const seqs = page.entries.filter((entry) => entry.device === device).map((entry) => entry.seq);
      assert.deepEqual(seqs, [...seqs].sort((a, b) => b - a), `${device} is newest-first within itself`);
    }

    // PAIRED: the cursor is per device, so both are carried and neither can be advanced by the other.
    assert.deepEqual(page.cursor.map((held) => held.device).sort(), [LAPTOP, PHONE].sort());
  });

  it('reads one named device and leaves the other alone', async () => {
    const store = await aStore();
    await createClients(store, 3);
    await writeChainFor(store, PHONE, 4);

    const phone = await readJournalPage(store, withQuery({ device: PHONE }));
    assert.equal(phone.entries.length, 4);
    assert.ok(phone.entries.every((entry) => entry.device === PHONE));
    assert.equal(phone.total, 4, 'the total is that device\'s, not the log\'s');

    // PAIRED: naming the other device changes what comes back, so the field is read.
    const laptop = await readJournalPage(store, withQuery({ device: LAPTOP }));
    assert.equal(laptop.entries.length, 3);
    assert.ok(laptop.entries.every((entry) => entry.device === LAPTOP));
  });
});

// ── filtering, in memory, over an index-less store ──────────────────────────────────────────────

describe('filtering', () => {
  it('matches by kind, and the domain comes from the core\'s own table', async () => {
    const store = await aStore();
    const ids = await createClients(store, 3);
    await store.tombstone('client', ids[0], { expectRev: 1 });

    const created = await readJournalPage(store, withQuery({ kind: JOURNAL_KINDS.RECORD_CREATED }));
    assert.equal(created.entries.length, 3);
    assert.ok(created.entries.every((entry) => entry.kind === JOURNAL_KINDS.RECORD_CREATED));

    // PAIRED: a different kind is a different page, so the filter is doing the work.
    const deleted = await readJournalPage(store, withQuery({ kind: JOURNAL_KINDS.RECORD_DELETED }));
    assert.equal(deleted.entries.length, 1);
    assert.equal(deleted.entries[0].kind, JOURNAL_KINDS.RECORD_DELETED);

    // The domain is derived from the kind at read time, never hand-copied.
    const domain = KIND_SPECS[JOURNAL_KINDS.RECORD_CREATED].domain;
    assert.equal(domainOfKind(JOURNAL_KINDS.RECORD_CREATED), domain);
    const byDomain = await readJournalPage(store, withQuery({ domain }));
    assert.equal(byDomain.entries.length, 4, 'every record change, whatever its kind');

    const otherDomain = KIND_SPECS[JOURNAL_KINDS.SYNC_COMPLETED].domain;
    assert.notEqual(otherDomain, domain);
    const none = await readJournalPage(store, withQuery({ domain: otherDomain }));
    assert.equal(none.entries.length, 0, 'and a domain nothing was written in matches nothing');
  });

  it('matches typed text against the entry\'s own fields and never against a record', async () => {
    const store = await aStore();
    const ids = await createClients(store, 2);

    const hit = await readJournalPage(store, withQuery({ search: ids[1].slice(0, 8) }));
    assert.equal(hit.entries.length, 1, 'the opaque identity is searchable, because it is what a helper has');
    assert.equal(hit.entries[0].subject?.record_id, ids[1]);

    // PAIRED: text that matches nothing returns nothing, so the search is not being ignored.
    const miss = await readJournalPage(store, withQuery({ search: 'no-entry-says-this' }));
    assert.equal(miss.entries.length, 0);

    // AND the name the record actually holds is NOT a way to find its entry: the entry does not
    // carry it, and this source does not go and look it up.
    const byName = await readJournalPage(store, withQuery({ search: 'Example Client 2' }));
    assert.equal(byName.entries.length, 0, 'a client\'s name matches no entry, because no entry holds one');
  });

  it('is a pure predicate over one entry, with the same answer the page gives', async () => {
    const store = await aStore();
    await createClients(store, 2);
    const page = await readJournalPage(store);

    for (const entry of page.entries) {
      assert.equal(matchesJournalEntry(entry, FIRST_JOURNAL_PAGE), true);
      assert.equal(matchesJournalEntry(entry, withQuery({ kind: JOURNAL_KINDS.SYNC_COMPLETED })), false);
    }
  });
});

// ── the total, which is why a short page is not a claim ─────────────────────────────────────────

describe('the total carried beside the page', () => {
  it('counts the whole log rather than the page, and moves when the filter moves', async () => {
    const store = await aStore();
    await createClients(store, JOURNAL_PAGE_LIMIT + 7);

    const page = await readJournalPage(store);
    assert.equal(page.entries.length, JOURNAL_PAGE_LIMIT, 'the page is bounded');
    assert.equal(page.done, false, 'and it stopped short');
    assert.equal(page.total, JOURNAL_PAGE_LIMIT + 7, 'the total is what is really there');
    assert.notEqual(page.total, page.entries.length, 'which is the whole reason it is carried');

    // PAIRED: the total is the FILTERED total, not a fixed size of the log. A count that ignored the
    // filter would tell the coach entries were hidden behind it when none were.
    const filtered = await readJournalPage(store, withQuery({ kind: JOURNAL_KINDS.SYNC_COMPLETED }));
    assert.equal(filtered.total, 0);
    assert.equal(await countJournalEntries(store, FIRST_JOURNAL_PAGE), JOURNAL_PAGE_LIMIT + 7);
  });

  it('pages backwards through the cursor with nothing repeated or skipped', async () => {
    const store = await aStore();
    await createClients(store, JOURNAL_PAGE_LIMIT + 4);

    const first = await readJournalPage(store);
    const second = await readJournalPage(store, withQuery({ after: first.cursor }));

    assert.equal(second.entries.length, 4);
    assert.equal(second.done, true, 'the chain is exhausted, and the page says so');

    const joined: JournalPage = appendJournalPage(first, second);
    const seqs = joined.entries.map((entry) => entry.seq);
    assert.equal(new Set(seqs).size, seqs.length, 'nothing was read twice');
    assert.deepEqual(seqs, [...seqs].sort((a, b) => b - a), 'and the join is still newest-first');
    assert.equal(joined.entries.length, joined.total, 'the two together are the whole log');
    assert.equal(joined.done, true, 'the joined page carries the LATER done, not the earlier one');

    // PAIRED: a finished device is not re-read. Asking again past the end returns nothing more.
    const third = await readJournalPage(store, withQuery({ after: second.cursor }));
    assert.equal(third.entries.length, 0);
    assert.equal(third.done, true);
  });

  it('still says how many match when NONE of the matches are on the page the coach can see', async () => {
    const store = await aStore();
    const ids = await createClients(store, JOURNAL_PAGE_LIMIT + 7);

    // THE FIXTURE IS THE WHOLE GUARD. A log that fits on one page makes a page-derived total and a
    // walk-derived one identical, so the assertion below would pass while proving nothing. Both facts
    // are asserted here, off the page limit rather than off a hardcoded number, before being relied
    // on — and the second is read from the WALK ITSELF rather than from the page's total, which is
    // the value under test and would shadow the assertion below when it is the thing that broke.
    const whole = await readJournalPage(store);
    assert.equal(whole.entries.length, JOURNAL_PAGE_LIMIT, 'the fixture fills the first page exactly');
    assert.ok(
      await countJournalEntries(store, FIRST_JOURNAL_PAGE) > JOURNAL_PAGE_LIMIT,
      'and there is more of the log than that one page',
    );

    // The first client created is the oldest entry on the chain, and the page is newest-first, so the
    // only entry matching its identity sits beyond the page this read returns.
    const offPage = await readJournalPage(store, withQuery({ search: ids[0] }));
    assert.equal(offPage.entries.length, 0, 'nothing matching is on this page: that is the case under test');

    assert.equal(
      offPage.total,
      1,
      'THE TOTAL MUST COME FROM THE WHOLE-LOG WALK, NEVER FROM THE PAGE. Derived from the page this '
      + 'is 0, and an empty page beside a total of 0 tells the coach the entry does not exist while '
      + 'it sits one page further down — the page-scoped-search defect, arriving on the journal',
    );
  });
});

// ── verification, carried through untouched ─────────────────────────────────────────────────────

describe('the verification', () => {
  it('is the core\'s own result, field for field', async () => {
    const store = await aStore();
    await createClients(store, 3);
    await writeChainFor(store, PHONE, 2);

    const mine = await verifyJournal(store);
    const theirs = await verifyWholeJournal(store);

    assert.deepEqual(mine, theirs, 'nothing was re-shaped, summarised or re-worded on the way through');
    assert.equal(mine.device_count, 2);
    assert.equal(mine.complete, true);
    assert.equal(mine.ok, true);
  });

  it('carries first_divergence with its index, seq, entry_id, reason and detail', async () => {
    const store = await aStore();
    await createClients(store, 5);

    const original = await store.read(
      JOURNAL_STORE,
      (scope: Scope) => scope.get(JOURNAL_STORE, [LAPTOP, 3]),
    );
    assert.ok(original, 'the entry to be corrupted exists before it is corrupted');

    const tampered = { ...original, at: new Date(Date.UTC(2020, 0, 1)).toISOString() };
    await runWrite(store.handle, JOURNAL_STORE, (scope: Scope) =>
      scope.put(JOURNAL_STORE, tampered));

    // CONFIRM THE BREAK LANDED. A corruption that failed to apply reports all-green, which looks
    // exactly like a working guard, so the red below is worth nothing until this holds.
    const stored = await store.read(
      JOURNAL_STORE,
      (scope: Scope) => scope.get(JOURNAL_STORE, [LAPTOP, 3]),
    );
    assert.notEqual(stored.at, original.at, 'the corruption actually reached the stored row');

    const result = await verifyJournal(store);
    const laptop = result.devices.find((device) => device.device === LAPTOP);
    assert.ok(laptop);

    assert.equal(result.ok, false);
    assert.equal(laptop.ok, false);
    assert.equal(laptop.first_divergence?.index, 2);
    assert.equal(laptop.first_divergence?.seq, 3);
    assert.equal(laptop.first_divergence?.entry_id, original.entry_id);
    assert.equal(laptop.first_divergence?.reason, DIVERGENCE.ALTERED);
    assert.equal(typeof laptop.first_divergence?.detail, 'string');
    assert.ok((laptop.first_divergence?.detail.length ?? 0) > 0, 'the detail is carried, not dropped');

    // PAIRED: restore the row and the same surface goes green, so the red was the edit and nothing else.
    await runWrite(store.handle, JOURNAL_STORE, (scope: Scope) =>
      scope.put(JOURNAL_STORE, original));
    const restored = await verifyJournal(store);
    assert.equal(restored.ok, true, JSON.stringify(restored.devices));
    assert.equal(restored.devices[0].first_divergence, null);
  });

  it('carries truncation and a break TOGETHER, on their own fields', async () => {
    const store = await aStore();
    // Enough to make retention prune under the small policy — the only way the log is pruned. The
    // store's own writes carry the shipped policy, so the entries are appended through the core's
    // one door with the small one, exactly as `core/journal/survey.test.js` does it.
    for (let n = 1; n <= 60; n += 1) {
      // eslint-disable-next-line no-await-in-loop
      await writeARecord(store, n);
    }
    // A synchronised copy that arrived without this device's anchor: the head links to what is gone.
    await runWrite(store.handle, META_STORE, (scope: Scope) =>
      scope.delete(META_STORE, anchorKeyFor(LAPTOP)));

    const truncatedOnly = await verifyJournal(store);
    assert.equal(truncatedOnly.devices[0].truncated_head, true, 'retention is reported as truncation');
    assert.equal(truncatedOnly.devices[0].ok, true, 'and NOT as a break');
    assert.equal(truncatedOnly.devices[0].first_divergence, null);

    // Now break the pruned chain as well. The seq numbers depend on how much was pruned, so the
    // entry to corrupt is READ rather than assumed.
    const surviving = await store.read(
      JOURNAL_STORE,
      (scope: Scope) => readChainPage(scope, LAPTOP, { limit: 3 }),
    );
    const original = surviving.items[2];
    await runWrite(store.handle, JOURNAL_STORE, (scope: Scope) =>
      scope.put(JOURNAL_STORE, { ...original, at: new Date(Date.UTC(2020, 0, 1)).toISOString() }));

    const both = await verifyJournal(store);
    const laptop = both.devices[0];
    assert.equal(laptop.truncated_head, true, 'the pruned head is STILL reported as truncated');
    assert.equal(laptop.ok, false, 'and the break is STILL a break');
    assert.equal(laptop.first_divergence?.seq, original.seq, 'localised within the surviving chain');
    assert.equal(laptop.first_divergence?.entry_id, original.entry_id);
  });
});

// ── THE TRAP ────────────────────────────────────────────────────────────────────────────────────

describe('a removed client\'s name', () => {
  /**
   * One store holding both removal shapes, alongside a client who is still here.
   *
   * TOMBSTONED — the envelope survives with `deleted: true` and `content: null`, so no name exists on
   * it any more. PURGED — `purgeClient` removes the rows outright, so there is nothing there at all.
   * Both leave an entry behind naming only an opaque identity, which is the whole design: the log can
   * still say a removal happened without holding the person it happened to.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function aStoreWithBothRemovals(): Promise<{ store: any; tombstoned: string; purged: string }> {
    const store = await aStore();
    const tombstonedRecord = await store.create('client', aClient({ name: 'Rekha Iyer' }));
    const purgedRecord = await store.create('client', aClient({ name: 'Tomas Alvarez' }));
    await store.create('client', aClient({ name: 'Still Here Example' }));

    await store.tombstone('client', tombstonedRecord.record_id, { expectRev: 1 });
    await purgeClient(store, purgedRecord.record_id);

    return { store, tombstoned: tombstonedRecord.record_id, purged: purgedRecord.record_id };
  }

  it('is gone from the records in both removal shapes — the fixtures are what they claim', async () => {
    const { store, tombstoned, purged } = await aStoreWithBothRemovals();

    const tombstone = await store.get('client', tombstoned);
    assert.ok(tombstone, 'the tombstoned envelope is still there');
    assert.equal(tombstone.deleted, true);
    assert.equal(tombstone.content, null, 'and it holds no name to resurrect');

    const nothing = await store.get('client', purged);
    assert.equal(nothing, undefined, 'the purged client has no row at all');
  });

  it('never reaches the value the seam publishes, from either of them', async () => {
    const { store, tombstoned, purged } = await aStoreWithBothRemovals();

    const reading = await readOnce(store);
    assert.ok(reading, 'the read published something to inspect');

    // NOT VACUOUS: the entries about both removed clients are genuinely on this page, so the absence
    // below is an absence of names rather than an absence of entries.
    const subjects = reading.page.entries.map((entry) => entry.subject?.record_id ?? null);
    assert.ok(subjects.includes(tombstoned), 'the tombstoned client\'s entries are on the page');
    assert.ok(subjects.includes(purged), 'and so are the purged client\'s');

    const published = JSON.stringify(reading);
    assert.ok(!published.includes('Rekha Iyer'), 'the tombstoned client\'s name is nowhere in the reading');
    assert.ok(!published.includes('Tomas Alvarez'), 'nor is the purged client\'s');
    assert.ok(!published.includes('Still Here Example'), 'nor is a LIVE client\'s, which is the same rule');

    // And nothing content-shaped came through at all: the entry field set is closed, and a source
    // that had joined a record in would have had to add a field to carry it.
    for (const entry of reading.page.entries) {
      assert.deepEqual(
        Object.keys(entry).filter((key) => ['content', 'name', 'record', 'subject_record'].includes(key)),
        [],
        'an entry carries an identity and never a record',
      );
    }

    // PAIRED, and this is the assertion that would catch the join being added: the words the screen
    // is handed hold no name either, and they are derived from this same reading.
    const words = JSON.stringify(describeJournal(screenReading(reading)));
    assert.ok(!words.includes('Rekha Iyer'));
    assert.ok(!words.includes('Tomas Alvarez'));
  });
});

// ── THREE STATES, AND THE FAILED ONE IS PUBLISHED  (s17/r2's F1) ────────────────────────────────

/**
 * A FAILED READ USED TO PUBLISH NOTHING, WHICH LEFT THE SEAM SAYING THE LOG WAS EMPTY.
 *
 * The seam's empty value is worded as a fact — there is nothing here yet, this app has not checked
 * its own list yet — so a read that threw rendered as the most reassuring screen this surface has.
 * These assertions are about what is PUBLISHED; `journal-screen.test.ts` asserts what the screen then
 * says, which is the half a "the catch ran" test cannot reach.
 */
describe('a read that fails', () => {
  /** The console line is kept beside the publish; it is held quiet so a passing gate reads as one. */
  async function quietly<T>(work: () => Promise<T>): Promise<T> {
    const held = console.error;
    console.error = () => undefined;
    try {
      return await work();
    } finally {
      console.error = held;
    }
  }

  it('publishes a FAILED reading rather than nothing, over the row r2 reproduced it with', async () => {
    const store = await aStore();
    await createClients(store, 2);
    // The shape `core/journal/survey.js` refuses: a row belonging to no chain at all.
    await runWrite(store.handle, JOURNAL_STORE, (scope: Scope) => scope.put(JOURNAL_STORE, {
      device: '', seq: 1, entry_id: 'not-written-by-this-application',
      kind: JOURNAL_KINDS.RECORD_CREATED, at: new Date(Date.UTC(2026, 6, 31)).toISOString(),
      subject: null, affected_count: null, previous_hash: null,
    }));
    const planted = await store.read(
      JOURNAL_STORE,
      (scope: Scope) => scope.get(JOURNAL_STORE, ['', 1]),
    );
    assert.ok(planted, 'the tagless row never landed, so the read below had nothing to choke on');

    const reading = await quietly(() => published(store));
    assert.ok(reading !== null, 'the read published NOTHING, which is the defect itself');
    assert.equal(reading.status, 'failed');
    // AND IT CARRIES NO PAGE. The shape is what stops a failure being read as an empty log: there is
    // no empty page on it to word.
    assert.equal('page' in reading, false, 'a failed reading carries a page, which is what began this');
    assert.equal('verification' in reading, false);

    // PAIRED: the same store without that row publishes a READ, so the state above is the row and not
    // the read path always saying it failed.
    await runWrite(store.handle, JOURNAL_STORE, (scope: Scope) => scope.delete(JOURNAL_STORE, ['', 1]));
    const healthy = await published(store);
    assert.ok(healthy !== null);
    assert.equal(healthy.status, 'read');
  });

  it('carries the STAGE and the CLASS of what was thrown, and never what it said', async () => {
    const store = await aStore();
    await createClients(store, 1);
    const NAME = 'Rekha Iyer';
    const thrown = new Error(`the row belonging to ${NAME} could not be read`);

    const brittle = new Proxy(store as object, {
      get(target: object, property: string | symbol) {
        if (property === 'read') return async () => { throw thrown; };
        return Reflect.get(target, property, target);
      },
    });

    const reading = await quietly(() => published(brittle));
    assert.ok(reading !== null);
    assert.equal(reading.status, 'failed');
    if (reading.status !== 'failed') return;

    assert.ok(['entries', 'check'].includes(reading.failure.stage), 'the stage is one of the closed set');
    assert.equal(reading.failure.errorName, 'Error');
    assert.ok(
      !JSON.stringify(reading).includes(NAME),
      'the exception message reached the published value, and a message can quote a key or a row',
    );
  });

  /**
   * AND THE CLASS NAME ITSELF MUST NOT BE READABLE OFF THE VALUE  (found by s17/r3).
   *
   * `journal.ts` states the protection as a property of the SHAPE — "a class name comes from code,
   * never from a record" — and the shape is only worth that if it holds for whatever arrives. A
   * `constructor` lookup is an ordinary property lookup, so an OWN `constructor` shadows the
   * prototype's, and `JSON.parse('{"constructor":{"name":"..."}}')` is exactly that shape: a value
   * that came out of a record naming itself whatever the record said, drawn on screen as the class of
   * what was thrown. Nothing in `core/store` throws such a value today, which is what makes this a
   * fence rather than a repair — and a fence is what the sentence in `journal.ts` promises.
   */
  it('will not read a class name off the thrown VALUE, only off its prototype', async () => {
    const store = await aStore();
    await createClients(store, 1);
    const NAME = 'Rekha Iyer (weight 63kg, missed two sessions)';

    async function failWith(thrown: unknown): Promise<JournalLogReading | null> {
      const brittle = new Proxy(store as object, {
        get(target: object, property: string | symbol) {
          if (property === 'read') return async () => { throw thrown; };
          return Reflect.get(target, property, target);
        },
      });
      return quietly(() => published(brittle));
    }

    // A thrown value carrying its own `constructor`, as a value parsed out of a record would.
    const fromData = await failWith(JSON.parse(`{"constructor":{"name":"${NAME}"}}`));
    assert.ok(fromData !== null);
    assert.equal(fromData.status, 'failed');
    assert.ok(
      !JSON.stringify(fromData).includes('Rekha Iyer'),
      'the thrown value named ITSELF, so a record decided what this screen calls the failure',
    );

    // PAIRED, so this cannot pass by the name never being carried: a real class still names itself.
    const fromCode = await failWith(new JournalShapeError('a row belongs to no chain', {}));
    assert.ok(fromCode !== null);
    assert.equal(fromCode.status, 'failed');
    if (fromCode.status !== 'failed') return;
    assert.equal(fromCode.failure.errorName, 'JournalShapeError');
  });
});

// ── THE CHECK DOES NOT DEPEND ON THE FILTER  (s17/r2's F4) ──────────────────────────────────────

/**
 * VERIFICATION READS AND HASHES EVERY ENTRY ON EVERY DEVICE, and it was being re-run by a filter it
 * does not depend on — a whole-log re-hash per keystroke at the five-thousand-per-device bound.
 *
 * The proof is identity rather than a timing or a threshold: the SAME verification object comes back
 * across a changed query, which cannot happen if it ran again. Paired with a deliberate re-read, which
 * genuinely re-runs it — so the reuse is the filter being irrelevant, not the check being skipped.
 */
describe('a changed filter', () => {
  it('does not run the verification again, and a deliberate re-read does', async () => {
    const store = await aStore();
    await createClients(store, 30);

    const first = await published(store);
    assert.ok(first !== null && first.status === 'read');

    const filtered = await published(store, withQuery({ kind: JOURNAL_KINDS.RECORD_CREATED }));
    assert.ok(filtered !== null && filtered.status === 'read');
    assert.equal(
      filtered.verification,
      first.verification,
      'a changed filter re-ran the whole-log verification, which re-hashes every entry on every device',
    );
    // NOT VACUOUS: the filter genuinely changed what was read.
    assert.notEqual(filtered.page, first.page);

    // AND THE RESULT IS UNWEAKENED: it is the same run, so its fields mean exactly what they meant.
    const held = filtered.verification.devices[0];
    assert.equal(held.checked, 30);
    assert.equal(held.complete, true);
    assert.equal(held.truncated_head, false);
    assert.equal(filtered.verification.complete, true);

    // PAIRED: a deliberate re-read is a different stamp, and it verifies again from the store.
    const reloaded = await published(store, FIRST_JOURNAL_PAGE, 1);
    assert.ok(reloaded !== null && reloaded.status === 'read');
    assert.notEqual(
      reloaded.verification,
      first.verification,
      'a deliberate re-read handed back a held result, so the log is never checked again',
    );
    assert.deepEqual(reloaded.verification, first.verification, 'and it found the same thing');
  });

  it('costs a fraction of a read for it, counted from the store\'s own row counter', async () => {
    const store = await aStore();
    await createClients(store, 30);

    const before = store.stats.rowsRead as number;
    await published(store);
    const wholeRead = (store.stats.rowsRead as number) - before;

    const beforeFilter = store.stats.rowsRead as number;
    await published(store, withQuery({ kind: JOURNAL_KINDS.RECORD_CREATED }));
    const filterChange = (store.stats.rowsRead as number) - beforeFilter;

    assert.ok(wholeRead > 0, 'the first read read no rows at all, so nothing here is measured');
    assert.ok(
      filterChange < wholeRead,
      `a filter change costs as much as a whole read (${filterChange} rows against ${wholeRead}), `
      + 'which is the verification being re-run by something it does not depend on',
    );
  });
});

// ── what the seam hands the words module ────────────────────────────────────────────────────────

describe('the reading handed to the screen', () => {
  it('is the page\'s entries, the core\'s per-device verifications, and the page\'s own done', async () => {
    const store = await aStore();
    await createClients(store, 2);
    await writeChainFor(store, PHONE, 1);

    const reading = await readOnce(store);
    assert.ok(reading);

    const forScreen = screenReading(reading);
    assert.equal(forScreen.entries, reading.page.entries, 'the entries are the same array, unconverted');
    assert.equal(forScreen.verification, reading.verification.devices);
    assert.equal(forScreen.done, reading.page.done);

    // It is genuinely readable by the words module, which is the only reason the shape is this one.
    const report = describeJournal(forScreen);
    assert.equal(report.count, 3);
    assert.equal(report.more, false);
    assert.equal(report.devices.length, 2);
    assert.equal(report.intact, true);
  });

  it('publishes a page that stopped short as one, so the screen says there are more', async () => {
    const store = await aStore();
    await createClients(store, JOURNAL_PAGE_LIMIT + 1);

    const reading = await readOnce(store);
    assert.ok(reading);

    const report = describeJournal(screenReading(reading));
    assert.equal(report.count, JOURNAL_PAGE_LIMIT);
    assert.equal(report.more, true, 'the page stopped short, and `done` carried that all the way through');
    assert.ok(report.moreWords !== null);

    // PAIRED: read to the end and the same derivation says the opposite, so `done` is load-bearing.
    const rest = await readJournalPage(store, withQuery({ after: reading.page.cursor }));
    const whole = appendJournalPage(reading.page, rest);
    const complete = describeJournal(screenReading({ page: whole, verification: reading.verification }));
    assert.equal(complete.more, false);
    assert.equal(complete.moreWords, null);
  });
});
