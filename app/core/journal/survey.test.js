/**
 * THE WHOLE-JOURNAL READ SURFACE, tested in the directions that fail silently.
 *
 * Three of these are shaped by what a wrong answer would look like rather than by what a right one
 * looks like:
 *
 *  - Enumeration is checked against `countOnDevice` per device, not against the number this suite
 *    happened to write. A listing that agreed with the test's own arithmetic and disagreed with the
 *    store would pass a self-consistent test and be wrong.
 *  - The RED case BREAKS A REAL STORED CHAIN and, before believing the red, asserts that the entry
 *    on disk ACTUALLY CHANGED. A corruption that failed to apply reports all-green, which is
 *    indistinguishable from a working guard and from one that checks nothing.
 *  - Truncation is asserted to be reported as truncation AND NOT as a divergence, because the whole
 *    hazard is a surface that folds "retention did its job" into "your log was tampered with".
 *
 * The newest-first claim is proved by ordering assertions over a real paged read rather than by a
 * sentence in a comment: `readChainPage` already takes `direction: 'prev'`, and the question is
 * whether it genuinely pages that way, cursor included.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { anExercise } from '../model/fixtures.js';
import { createEnvelope } from '../model/model.js';
import { runWrite } from '../store/db.js';
import { openLocalStore, storesFor } from '../store/local-store.js';
import { JOURNAL_STORE, META_STORE, RECORD_STORES } from '../store/schema.js';
import { createLaptop } from '../store/testing/platform-double.js';

import { DIVERGENCE } from './chain.js';
import {
  JOURNAL_STORES, anchorKeyFor, commitEntryInScope, countOnDevice, prepareEntry, readChainPage,
  recordChange,
} from './durable.js';
import { JOURNAL_KINDS } from './kinds.js';
import { DEVICE_CEILING, listJournalDevices, verifyWholeJournal } from './survey.js';

const LAPTOP = 'coach-laptop';
const PHONE = 'coach-phone';
const TABLET = 'coach-tablet';

/** The same small policy `durable.test.js` uses, so pruning is reachable without five thousand rows. */
const SMALL = Object.freeze({ max: 20, batch: 5, ceiling: 100 });

/** A store on a fresh simulated laptop. */
async function aStore(device = LAPTOP) {
  const { platform } = createLaptop();
  return openLocalStore({ platform, device });
}

/**
 * Write one record and its entry through the one door, on THIS store's own device.
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {number} n
 */
async function writeARecord(store, n) {
  const at = new Date(Date.UTC(2026, 6, 26, 9, 0, 0) + n * 1000).toISOString();
  const record = createEnvelope({
    type: 'exercise',
    content: anExercise({ id: `survey-exercise-${n}` }),
    device: store.device,
    now: at,
  });

  return recordChange(store, {
    stores: storesFor('exercise'),
    retention: SMALL,
    fields: {
      kind: JOURNAL_KINDS.RECORD_CREATED,
      at,
      entry_id: `entry-${store.device}-${n}`,
      subject: { type: 'exercise', record_id: record.record_id },
    },
    work: async (scope) => {
      await scope.put(RECORD_STORES.exercise, record);
      return record;
    },
  });
}

/** @param {import('../store/local-store.js').LocalStore} store @param {number} count */
async function writeRecords(store, count) {
  for (let n = 1; n <= count; n += 1) {
    // eslint-disable-next-line no-await-in-loop -- writes are sequential, as they are in the app.
    await writeARecord(store, n);
  }
}

/**
 * Entries for ANOTHER device, sitting in this store as a synchronised copy of its chain would:
 * same rows, own chain, own sequence from 1.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {string} device
 * @param {number} count
 * @param {(n: number) => string} [atFor] The device clock to stamp each entry with. It is UNTRUSTED,
 *   so a test that cares about order supplies one that disagrees with the chain — see the last test
 *   in this file.
 */
async function writeChainFor(store, device, count, atFor = (n) => new Date(Date.UTC(2026, 6, 26, 8, 0, n)).toISOString()) {
  for (let n = 1; n <= count; n += 1) {
    // eslint-disable-next-line no-await-in-loop -- an append links to the entry before it.
    const draft = await prepareEntry(store.handle, {
      kind: JOURNAL_KINDS.SYNC_COMPLETED,
      device,
      entry_id: `${device}-${n}`,
      at: atFor(n),
    }, { retention: SMALL });
    // eslint-disable-next-line no-await-in-loop
    await runWrite(store.handle, JOURNAL_STORES, (scope) => commitEntryInScope(scope, draft));
  }
}

/** One stored entry, read back by its primary key. */
async function readEntry(store, device, seq) {
  return store.read(JOURNAL_STORE, (scope) => scope.get(JOURNAL_STORE, [device, seq]));
}

// ── enumeration ─────────────────────────────────────────────────────────────────────────────────

test('an empty log enumerates to no devices at all, and says so completely', async () => {
  const store = await aStore();

  const listing = await listJournalDevices(store);
  assert.deepEqual(listing.devices, [], 'nothing has been written, so no device has a chain');
  assert.equal(listing.complete, true);

  await store.close();
});

test('one device that has written enumerates as one device, with its own count', async () => {
  const store = await aStore();
  await writeRecords(store, 4);

  const listing = await listJournalDevices(store);
  assert.equal(listing.devices.length, 1);
  assert.equal(listing.devices[0].device, LAPTOP);
  assert.equal(listing.devices[0].entries, 4);
  assert.equal(listing.complete, true);

  await store.close();
});

test('several devices are all found, and every count agrees with the STORE rather than with this test', async () => {
  const store = await aStore();
  await writeRecords(store, 4);
  await writeChainFor(store, PHONE, 7);
  await writeChainFor(store, TABLET, 2);

  const listing = await listJournalDevices(store);
  assert.deepEqual(
    listing.devices.map((d) => d.device).slice().sort(),
    [LAPTOP, PHONE, TABLET],
    'no device is invisible merely because nothing asked for it by name',
  );

  for (const { device, entries } of listing.devices) {
    // The count is checked against the store's own count over that device's range, not against the
    // number written above: a listing that agreed with this suite's arithmetic and disagreed with
    // the store would be self-consistently wrong.
    // eslint-disable-next-line no-await-in-loop
    const counted = await store.read(JOURNAL_STORE, (scope) => countOnDevice(scope, device));
    assert.equal(entries, counted, `${device} was counted as ${entries} but holds ${counted}`);
  }

  await store.close();
});

test('enumeration stops at its ceiling and reports the listing as incomplete rather than trimming quietly', async () => {
  const store = await aStore();
  await writeRecords(store, 2);
  await writeChainFor(store, PHONE, 2);
  await writeChainFor(store, TABLET, 2);

  const bounded = await listJournalDevices(store, { ceiling: 2 });
  assert.equal(bounded.devices.length, 2);
  assert.equal(bounded.complete, false, 'a third device exists and the listing must not imply otherwise');

  const atExactly = await listJournalDevices(store, { ceiling: 3 });
  assert.equal(atExactly.devices.length, 3);
  assert.equal(atExactly.complete, true, 'a listing that reached the ceiling and left nothing out is complete');

  assert.ok(DEVICE_CEILING >= 3, 'the default ceiling is generous against a coach with a few devices');

  await store.close();
});

// ── whole-journal verification ──────────────────────────────────────────────────────────────────

test('the whole journal verifies green across several devices, each reported on its own', async () => {
  const store = await aStore();
  await writeRecords(store, 5);
  await writeChainFor(store, PHONE, 3);
  await writeChainFor(store, TABLET, 4);

  const result = await verifyWholeJournal(store);
  assert.equal(result.ok, true, JSON.stringify(result.devices));
  assert.equal(result.device_count, 3);
  assert.equal(result.complete, true);

  for (const device of result.devices) {
    assert.equal(device.ok, true);
    assert.equal(device.first_divergence, null);
    assert.equal(device.truncated_head, false);
    assert.equal(device.checked, device.entries, `${device.device} verified every entry it holds`);
  }

  await store.close();
});

test('a BROKEN chain is red, and first_divergence arrives unchanged — position, seq, entry_id and reason', async () => {
  const store = await aStore();
  await writeRecords(store, 5);
  await writeChainFor(store, PHONE, 3);

  const original = await readEntry(store, LAPTOP, 3);
  assert.ok(original, 'the entry to be corrupted exists before it is corrupted');

  // Edit a stored entry after the fact: its own digest no longer matches its own fields. The clock
  // reading is changed because it is a field an editor would plausibly reach for.
  const tampered = { ...original, at: new Date(Date.UTC(2020, 0, 1)).toISOString() };
  await runWrite(store.handle, JOURNAL_STORE, (scope) => scope.put(JOURNAL_STORE, tampered));

  // CONFIRM THE BREAK LANDED. A corruption that silently failed to apply produces an all-green run
  // that looks exactly like a working guard, so the red below is worth nothing until this holds.
  const stored = await readEntry(store, LAPTOP, 3);
  assert.notEqual(stored.at, original.at, 'the corruption actually reached the stored row');
  assert.equal(stored.hash, original.hash, 'and left the digest it no longer matches');

  const result = await verifyWholeJournal(store);
  assert.equal(result.ok, false, 'one broken device makes the whole log not ok');

  const laptop = result.devices.find((d) => d.device === LAPTOP);
  assert.equal(laptop.ok, false);
  assert.equal(laptop.truncated_head, false, 'a break is not truncation');
  assert.equal(laptop.first_divergence.index, 2, 'the third entry, counting from the head');
  assert.equal(laptop.first_divergence.seq, 3);
  assert.equal(laptop.first_divergence.entry_id, original.entry_id);
  assert.equal(laptop.first_divergence.reason, DIVERGENCE.ALTERED);
  assert.ok(
    Object.values(DIVERGENCE).includes(laptop.first_divergence.reason),
    'the reason comes from the closed set the chain defines',
  );
  assert.equal(typeof laptop.first_divergence.detail, 'string');
  assert.ok(laptop.first_divergence.detail.length > 0, 'the detail is carried through, not dropped');

  const phone = result.devices.find((d) => d.device === PHONE);
  assert.equal(phone.ok, true, 'a break on the laptop says nothing about the phone');
  assert.equal(phone.first_divergence, null);

  // Restore it, and the same surface says so: the red was caused by the edit and by nothing else.
  await runWrite(store.handle, JOURNAL_STORE, (scope) => scope.put(JOURNAL_STORE, original));
  const restored = await verifyWholeJournal(store);
  assert.equal(restored.ok, true, JSON.stringify(restored.devices));

  await store.close();
});

test('a TRUNCATED head is reported as truncation and NOT as a divergence — retention is honest, not corruption', async () => {
  const store = await aStore();
  // Enough to make retention prune under the small policy, which is the only way the log is pruned.
  await writeRecords(store, 60);
  await writeChainFor(store, PHONE, 3);

  // A synchronised copy of the log arrives without the anchor: it lives in this device's own
  // small-values store and is not a record.
  await runWrite(store.handle, META_STORE, (scope) => scope.delete(META_STORE, anchorKeyFor(LAPTOP)));

  const result = await verifyWholeJournal(store);
  const laptop = result.devices.find((d) => d.device === LAPTOP);

  assert.equal(laptop.truncated_head, true, 'the pruned head is reported as truncated');
  assert.equal(laptop.ok, true, 'and NOT as a break');
  assert.equal(laptop.first_divergence, null, 'there is no position to investigate, because nothing diverged');
  assert.equal(result.ok, true, 'so the whole log is still ok');

  const phone = result.devices.find((d) => d.device === PHONE);
  assert.equal(phone.truncated_head, false, 'and pruning one device did not truncate another');

  await store.close();
});

test('a device can be TRUNCATED AND BROKEN AT ONCE, and both facts survive on their own fields', async () => {
  const store = await aStore();
  await writeRecords(store, 60);
  await runWrite(store.handle, META_STORE, (scope) => scope.delete(META_STORE, anchorKeyFor(LAPTOP)));

  // The third SURVIVING entry, whatever retention left — the seq numbers depend on how much was
  // pruned, so it is read rather than assumed.
  const surviving = await store.read(JOURNAL_STORE, (scope) => readChainPage(scope, LAPTOP, { limit: 3 }));
  const original = surviving.items[2];
  assert.ok(original, 'the pruned chain still holds entries to break');

  const tampered = { ...original, at: new Date(Date.UTC(2020, 0, 1)).toISOString() };
  await runWrite(store.handle, JOURNAL_STORE, (scope) => scope.put(JOURNAL_STORE, tampered));
  const stored = await readEntry(store, LAPTOP, original.seq);
  assert.notEqual(stored.at, original.at, 'the corruption actually reached the stored row');

  const laptop = (await verifyWholeJournal(store)).devices.find((d) => d.device === LAPTOP);

  // Both, at once. Neither field is allowed to absorb the other: a truncated head that reads as a
  // break accuses retention, and a break hidden behind a truncation notice is the worse of the two.
  assert.equal(laptop.truncated_head, true, 'the pruned head is still reported as truncated');
  assert.equal(laptop.ok, false, 'and the break is still a break');
  assert.equal(laptop.first_divergence.index, 2, 'localised within the surviving chain');
  assert.equal(laptop.first_divergence.seq, original.seq);
  assert.equal(laptop.first_divergence.entry_id, original.entry_id);
  assert.equal(laptop.first_divergence.reason, DIVERGENCE.ALTERED);

  await store.close();
});

// ── reading newest-first ────────────────────────────────────────────────────────────────────────

test('a page can be read NEWEST-FIRST, and pages that way across the cursor', async () => {
  const store = await aStore();
  await writeRecords(store, 12);

  const newest = await store.read(JOURNAL_STORE, (scope) => readChainPage(scope, LAPTOP, {
    limit: 5, direction: 'prev',
  }));
  assert.equal(newest.items.length, 5);
  assert.equal(newest.items[0].seq, 12, 'the most recent entry is at the top');
  assert.deepEqual(newest.items.map((e) => e.seq), [12, 11, 10, 9, 8]);

  const next = await store.read(JOURNAL_STORE, (scope) => readChainPage(scope, LAPTOP, {
    limit: 5, direction: 'prev', after: newest.cursor,
  }));
  assert.deepEqual(next.items.map((e) => e.seq), [7, 6, 5, 4, 3],
    'the second page continues backwards from the cursor, with nothing repeated or skipped');

  const oldest = await store.read(JOURNAL_STORE, (scope) => readChainPage(scope, LAPTOP, {
    limit: 5, direction: 'prev', after: next.cursor,
  }));
  assert.deepEqual(oldest.items.map((e) => e.seq), [2, 1]);
  assert.equal(oldest.done, true);

  // The opposite direction is unchanged, so newest-first is an option rather than a reversal of the
  // order verification walks in.
  const forwards = await store.read(JOURNAL_STORE, (scope) => readChainPage(scope, LAPTOP, { limit: 3 }));
  assert.deepEqual(forwards.items.map((e) => e.seq), [1, 2, 3]);

  await store.close();
});

test('newest-first is the CHAIN order, proved with the untrusted clock running backwards', async () => {
  // The test above stamps `at` in step with `seq`, so it cannot tell the two apart: an ordering that
  // came from the device clock would pass it identically. `at` is the writing device's own clock and
  // is untrusted (JOURNAL.md), so the claim is only proved on entries where the clock and the chain
  // DISAGREE — here the clock runs backwards as the chain runs forwards.
  const store = await aStore();
  await writeChainFor(store, PHONE, 8, (n) => new Date(Date.UTC(2026, 6, 26, 12, 0, 0) - n * 60000).toISOString());

  const page = await store.read(JOURNAL_STORE, (scope) => readChainPage(scope, PHONE, {
    limit: 5, direction: 'prev',
  }));
  const seqs = page.items.map((e) => e.seq);
  assert.deepEqual(seqs, [8, 7, 6, 5, 4], 'the page is newest-first by the chain, not by the clock');

  // And the probe is not vacuous: sorted by `at`, this same page would come back the other way round.
  const byClock = page.items.slice().sort((a, b) => (a.at < b.at ? 1 : -1)).map((e) => e.seq);
  assert.notDeepEqual(
    byClock, seqs,
    'this test proves nothing unless the clock order and the chain order actually differ on these entries',
  );

  const rest = await store.read(JOURNAL_STORE, (scope) => readChainPage(scope, PHONE, {
    limit: 5, direction: 'prev', after: page.cursor,
  }));
  assert.deepEqual(rest.items.map((e) => e.seq), [3, 2, 1], 'and the cursor continues by the chain too');

  // A backwards clock is not a break: verification walks the chain and never reads `at` for order.
  const phone = (await verifyWholeJournal(store)).devices.find((d) => d.device === PHONE);
  assert.equal(phone.ok, true, 'a device whose clock ran backwards has not diverged');
  assert.equal(phone.first_divergence, null);

  await store.close();
});
