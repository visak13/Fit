/**
 * THE DURABLE SEAM: one transaction, a digest that is never taken inside one, and a bound nothing
 * has to remember to apply.
 *
 * ## What "the caller runs" means here, and how it is proved
 *
 * This build has twice shipped a correct routine that nothing reached. So the retention tests below
 * never call a prune, and they COULD not: the pruning function is module-private, so this suite has
 * no way to report that "prune works when invoked". Everything it observes about retention is caused
 * by APPENDING — which is the only way the log grows.
 *
 * `writeARecord` is the call site standing in for the record-change wiring that belongs to the step
 * after this one, written exactly as that wiring will be. It is not a scheduler invented to satisfy
 * a requirement; it is the shape of the real path.
 *
 * ## And the transaction, tested in the direction that can fail silently
 *
 * A test that writes a record and finds an entry beside it proves nothing about atomicity: two
 * separate transactions that both succeeded look identical. So the atomicity tests here make the
 * commit FAIL and assert that NEITHER survives, and make the entry be REFUSED and assert that the
 * change did not land either.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { anExercise } from '../model/fixtures.js';
import { createEnvelope } from '../model/model.js';
import { read, runWrite } from '../store/db.js';
import { openLocalStore, storesFor } from '../store/local-store.js';
import { JOURNAL_STORE, META_STORE, RECORD_STORES } from '../store/schema.js';
import { createLaptop } from '../store/testing/platform-double.js';

import { DIVERGENCE } from './chain.js';
import {
  ANCHOR_META_PREFIX, JOURNAL_STORES, MAX_APPEND_ATTEMPTS, anchorKeyFor, commitEntryInScope,
  countOnDevice, journalStoresFor, latestOnDevice, prepareEntry, readAnchor, readChainPage,
  recordChange, verifyDeviceChain,
} from './durable.js';
import { HASH_FIELD } from './entry.js';
import { JournalRaceError } from './errors.js';
import { JOURNAL_KINDS } from './kinds.js';

const LAPTOP = 'coach-laptop';
const PHONE = 'coach-phone';

/** A small policy, so the behaviour AT the cap is reachable without writing five thousand rows. */
const SMALL = Object.freeze({ max: 20, batch: 5, ceiling: 100 });

/** A store on a fresh simulated laptop. */
async function aStore(device = LAPTOP) {
  const { world, platform } = createLaptop();
  const store = await openLocalStore({ platform, device });
  return { world, store };
}

/**
 * The call site the record-change wiring will be: ONE unit, the record and its entry inside it.
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {number} n
 * @param {{retention?: any, kind?: string, subject?: any}} [options]
 */
async function writeARecord(store, n, options = {}) {
  const at = new Date(Date.UTC(2026, 6, 26, 9, 0, 0) + n * 1000).toISOString();
  const record = createEnvelope({
    type: 'exercise',
    content: anExercise({ id: `test-exercise-${n}` }),
    device: store.device,
    now: at,
  });

  const { result, entry } = await recordChange(store, {
    stores: storesFor('exercise'),
    retention: options.retention ?? SMALL,
    fields: {
      kind: options.kind ?? JOURNAL_KINDS.RECORD_CREATED,
      at,
      entry_id: `entry-${store.device}-${n}`,
      subject: 'subject' in options ? options.subject : { type: 'exercise', record_id: record.record_id },
    },
    work: async (scope) => {
      await scope.put(RECORD_STORES.exercise, record);
      return record;
    },
  });
  return { record: result, entry };
}

/** Everything currently in the journal store, across devices. */
async function allEntries(store) {
  return store.read(JOURNAL_STORE, async (scope) => {
    const out = [];
    let after = null;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop -- pages are read in order.
      const page = await scope.page({ store: JOURNAL_STORE, limit: 200, after });
      out.push(...page.items);
      after = page.cursor;
      if (page.done) break;
    }
    return out;
  });
}

/** Write `count` records the way the application writes them. */
async function writeRecords(store, count, options) {
  for (let n = 1; n <= count; n += 1) {
    // eslint-disable-next-line no-await-in-loop -- writes are sequential, as they are in the app.
    await writeARecord(store, n, options);
  }
}

// ── the seam ────────────────────────────────────────────────────────────────────────────────────

test('the log has a home: an entry is stored, read back, and links to the one before it', async () => {
  const { store } = await aStore();

  const first = await writeARecord(store, 1);
  const second = await writeARecord(store, 2);

  assert.equal(first.entry.seq, 1);
  assert.equal(first.entry.previous_hash, null);
  assert.equal(second.entry.seq, 2);
  assert.equal(second.entry.previous_hash, first.entry[HASH_FIELD]);

  const stored = await allEntries(store);
  assert.equal(stored.length, 2);
  assert.deepEqual(stored.map((e) => e.seq), [1, 2], 'the compound key IS the chain order');

  const latest = await store.read(JOURNAL_STORE, (scope) => latestOnDevice(scope, LAPTOP));
  assert.equal(latest.seq, 2);
  assert.equal(await store.read(JOURNAL_STORE, (scope) => countOnDevice(scope, LAPTOP)), 2);

  await store.close();
});

test('an append must hold the anchor store open too, because a prune cannot be predicted', () => {
  // A transaction's scope is fixed when it opens, and one append in `batch` writes the anchor. A
  // caller holding only the log open would fail at the moment of pruning, in front of the coach.
  assert.deepEqual(Array.from(JOURNAL_STORES), [JOURNAL_STORE, META_STORE]);
  assert.deepEqual(journalStoresFor(storesFor('session')).sort(), [
    JOURNAL_STORE, META_STORE, RECORD_STORES.session, 'session_participants',
  ].sort());
  assert.deepEqual(journalStoresFor(JOURNAL_STORE), [JOURNAL_STORE, META_STORE], 'no store twice');
});

test('THE PLATFORM RULE: no digest is taken inside a transaction, in either direction', async () => {
  // The naive shape — read the head, hash, write the entry, all inside the caller's transaction —
  // cannot work: awaiting a digest returns control to the event loop with no request pending, and
  // the platform ends the transaction there. This asserts the split that avoids it: preparing an
  // entry is what hashes, and it happens with no write transaction open at all.
  const { store } = await aStore();

  const draft = await prepareEntry(store.handle, {
    kind: JOURNAL_KINDS.SYNC_STARTED, device: LAPTOP, entry_id: 'e1', at: '2026-07-26T09:00:00.000Z',
  }, { retention: SMALL });

  assert.equal(typeof draft.entry[HASH_FIELD], 'string', 'the digest is already taken');
  assert.equal(draft.expects_head, null, 'the first entry follows nothing');
  assert.equal(draft.plan.prune, false);
  assert.equal((await allEntries(store)).length, 0, 'and preparing wrote nothing');

  // Committing it performs database requests only, so the caller's transaction survives it — and the
  // proof is that a caller can go on using the same scope afterwards.
  await runWrite(store.handle, journalStoresFor(META_STORE), async (scope) => {
    await commitEntryInScope(scope, draft);
    await scope.put(META_STORE, { key: 'after-the-append', value: 'the transaction is still alive' });
  });

  assert.equal((await allEntries(store)).length, 1);
  assert.equal(await store.getMeta('after-the-append'), 'the transaction is still alive');

  await store.close();
});

test('committing an entry cannot open a transaction of its own — it is handed one', async () => {
  // The structural half of the resolution: it takes a scope, so an entry can only ever commit
  // alongside the change it records. Handed a READ-ONLY scope, the write is refused.
  const { store } = await aStore();
  const draft = await prepareEntry(store.handle, {
    kind: JOURNAL_KINDS.SYNC_STARTED, device: LAPTOP, entry_id: 'e-ro',
  }, { retention: SMALL });

  await assert.rejects(
    () => read(store.handle, JOURNAL_STORES, (scope) => commitEntryInScope(scope, draft)),
    /read-only/i,
  );
  assert.equal((await allEntries(store)).length, 0);
  await store.close();
});

// ── ONE TRANSACTION: the append-versus-transaction resolution, tested where it can fail ─────────

test('a commit that fails takes the change AND its entry with it — neither is left behind', async () => {
  const { world, store } = await aStore();

  await writeARecord(store, 1);
  assert.equal((await allEntries(store)).length, 1);

  world.indexedDB.faults.failCommitOnce = true;
  await assert.rejects(() => writeARecord(store, 2), /did not complete/);

  assert.equal(await store.count('exercise'), 1, 'the record did not land');
  assert.equal((await allEntries(store)).length, 1, 'and no entry claims it did');

  // The chain is intact rather than merely short: a failed write left no half-linked entry.
  const result = await verifyDeviceChain(store);
  assert.equal(result.ok, true);
  assert.equal(result.checked, 1);

  await store.close();
});

test('an entry the vocabulary refuses ABORTS the change it was recording, loudly and early', async () => {
  // The tempting misreading of "the log must never block the application" is a best-effort append
  // that swallows its own failures. That would leave an entry missing for a change that happened —
  // invisibly, and exactly when something was going wrong. A refusal is a programming error at the
  // call site, and it must be loud. It is also raised while PREPARING, before any transaction opens,
  // so it costs the coach nothing.
  const { store } = await aStore();

  await assert.rejects(
    () => writeARecord(store, 1, { kind: 'record.updatd' }),
    /not an event kind this log defines/,
  );
  assert.equal(await store.count('exercise'), 0, 'the record was not written either');
  assert.equal((await allEntries(store)).length, 0);

  // The same in the other direction: a subject on a kind that forbids one.
  await assert.rejects(
    () => writeARecord(store, 2, {
      kind: JOURNAL_KINDS.SYNC_STARTED, subject: { type: 'exercise', record_id: 'x' },
    }),
    /not about a record/,
  );
  assert.equal(await store.count('exercise'), 0);

  await store.close();
});

test('a failed unit consumes no position: the next entry is still the one it would have been', async () => {
  const { world, store } = await aStore();

  world.indexedDB.faults.failCommitOnce = true;
  await assert.rejects(() => writeARecord(store, 1));
  assert.equal((await allEntries(store)).length, 0);

  const { entry } = await writeARecord(store, 2);
  assert.equal(entry.seq, 1);
  assert.equal(entry.previous_hash, null);

  await store.close();
});

test('a draft whose chain moved underneath it is REFUSED rather than linked to the wrong entry', async () => {
  // Two windows share one database AND one device tag, so they append to one chain. The loser of the
  // race must not write an entry that links to a predecessor that is no longer the head.
  const { store } = await aStore();

  const stale = await prepareEntry(store.handle, {
    kind: JOURNAL_KINDS.SYNC_STARTED, device: LAPTOP, entry_id: 'stale',
  }, { retention: SMALL });

  await writeARecord(store, 1); // somebody else appended in between

  await assert.rejects(
    () => runWrite(store.handle, JOURNAL_STORES, (scope) => commitEntryInScope(scope, stale)),
    (error) => {
      assert.ok(error instanceof JournalRaceError);
      assert.equal(error.device, LAPTOP);
      assert.equal(error.expected_head, null);
      assert.equal(typeof error.actual_head, 'string');
      return true;
    },
  );

  const result = await verifyDeviceChain(store);
  assert.equal(result.ok, true, 'the chain was left intact rather than mis-linked');
  assert.equal(result.checked, 1);

  await store.close();
});

test('the door repeats the whole unit on a race, and gives up loudly rather than skipping the entry', async () => {
  const { store } = await aStore();
  let attempts = 0;

  await assert.rejects(() => recordChange(store, {
    stores: META_STORE,
    retention: SMALL,
    fields: { kind: JOURNAL_KINDS.SYNC_STARTED, entry_id: 'never-lands' },
    work: async (scope) => {
      attempts += 1;
      // A row landing on this device's chain AFTER the draft read the head, on every attempt — the
      // other window that always wins. The point is not that it can happen this often, but that the
      // unit FAILS rather than quietly skipping the entry, and that the caller's work was genuinely
      // repeated each time rather than only the append.
      await scope.put(JOURNAL_STORE, {
        device: LAPTOP,
        seq: 1,
        entry_id: 'the-other-window',
        kind: JOURNAL_KINDS.SYNC_REFUSED,
        at: '2026-07-26T09:00:00.000Z',
        subject: null,
        affected_count: null,
        previous_hash: null,
        [HASH_FIELD]: `${'B'.repeat(43)}=`,
      });
    },
  }), (error) => {
    assert.ok(error instanceof JournalRaceError);
    assert.equal(error.attempts, MAX_APPEND_ATTEMPTS);
    assert.match(error.message, /Nothing was written/);
    return true;
  });

  assert.equal(attempts, MAX_APPEND_ATTEMPTS, 'the whole unit was repeated, not just the append');
  assert.equal((await allEntries(store)).length, 0, 'and the failed unit left nothing behind');

  await store.close();
});

// ── RETENTION, observed only through appending ──────────────────────────────────────────────────

test('an entry that cannot be written takes the CHANGE with it — the log is never best-effort', async () => {
  // The direct attack on the tempting reading of "the log must never block the application". If the
  // append were wrapped in a catch that shrugged, this unit would succeed, the exercise would be on
  // disk, and nothing anywhere would record that it had been created. The entry failing must fail
  // the change, or the log is a claim rather than a record.
  const { store } = await aStore();
  const record = createEnvelope({
    type: 'exercise', content: anExercise({ id: 'test-never-recorded' }), device: LAPTOP,
  });

  await assert.rejects(() => recordChange(store, {
    stores: storesFor('exercise'),
    retention: SMALL,
    fields: {
      kind: JOURNAL_KINDS.RECORD_CREATED,
      subject: { type: 'exercise', record_id: record.record_id },
    },
    work: async (scope) => {
      await scope.put(RECORD_STORES.exercise, record);
      // The other window lands an entry first, every time: the append cannot succeed.
      await scope.put(JOURNAL_STORE, {
        device: LAPTOP,
        seq: 1,
        entry_id: 'the-other-window',
        kind: JOURNAL_KINDS.SYNC_REFUSED,
        at: '2026-07-26T09:00:00.000Z',
        subject: null,
        affected_count: null,
        previous_hash: null,
        [HASH_FIELD]: `${'C'.repeat(43)}=`,
      });
    },
  }), JournalRaceError);

  assert.equal(await store.count('exercise'), 0,
    'the change must not survive an append that could not be written');
  await store.close();
});

test('THE CALLER RUNS: writing records the way the application writes them bounds the log', async () => {
  // Nothing in this test calls a prune. It cannot: the pruning function is module-private. The only
  // thing done here is what the application does — write records — and the log stays inside its cap.
  const { store } = await aStore();
  await writeRecords(store, 60);

  const held = await store.read(JOURNAL_STORE, (scope) => countOnDevice(scope, LAPTOP));
  assert.ok(held <= SMALL.max, `the log held ${held} entries with a cap of ${SMALL.max}`);
  assert.ok(held > 0);
  assert.equal(await store.count('exercise'), 60, 'every record still landed');

  const stored = await allEntries(store);
  const pruned = stored.filter((e) => e.kind === JOURNAL_KINDS.RETENTION_PRUNED);
  assert.ok(pruned.length > 0, 'the log accounts for its own gaps');
  assert.ok(pruned.every((e) => Number.isInteger(e.affected_count) && e.affected_count > 0),
    'the accounting entry says HOW MANY, and a count cannot carry an identity');
  assert.ok(pruned.every((e) => e.subject === null), 'it is not about a record');

  await store.close();
});

test('a pruned chain still verifies EXACTLY, because retention recorded what the survivor links to', async () => {
  const { store } = await aStore();
  await writeRecords(store, 60);

  const anchor = await store.read(META_STORE, (scope) => readAnchor(scope, LAPTOP));
  assert.ok(anchor, 'the pass recorded an anchor');
  assert.equal(anchor.device, LAPTOP);
  assert.ok(anchor.discarded_total > 0);

  const result = await verifyDeviceChain(store);
  assert.equal(result.ok, true, JSON.stringify(result.first_divergence));
  assert.equal(result.truncated_head, false, 'with the anchor, a pruned chain verifies exactly');
  assert.equal(result.complete, true);
  assert.ok(result.checked > 0);

  await store.close();
});

test('the anchor is what the surviving head ACTUALLY links to, not an excuse for a gap', async () => {
  const { store } = await aStore();
  await writeRecords(store, 60);

  const { anchor, head } = await store.read(JOURNAL_STORES, async (scope) => ({
    anchor: await readAnchor(scope, LAPTOP),
    head: (await readChainPage(scope, LAPTOP, { limit: 1 })).items[0],
  }));

  assert.equal(head.previous_hash, anchor.hash, 'the head links to the last discarded entry');
  assert.equal(head.seq, anchor.seq + 1, 'and follows it in sequence');

  await store.close();
});

test('WITHOUT the anchor a pruned chain is truncated_head — never a silent pass, never a false break', async () => {
  const { store } = await aStore();
  await writeRecords(store, 60);

  // A synchronised copy of the log arrives without the anchor: it lives in this device's own
  // small-values store and is not a record.
  await runWrite(store.handle, META_STORE, (scope) => scope.delete(META_STORE, anchorKeyFor(LAPTOP)));

  const result = await verifyDeviceChain(store);
  assert.equal(result.ok, true, 'a pruned head is not a break');
  assert.equal(result.truncated_head, true, 'and it is not silently a pass either');
  assert.equal(result.anchor, null);

  await store.close();
});

test('a WRONG anchor is head_not_anchored, so retention cannot be used to cover a removal', async () => {
  const { store } = await aStore();
  await writeRecords(store, 60);

  const anchor = await store.read(META_STORE, (scope) => readAnchor(scope, LAPTOP));
  await runWrite(store.handle, META_STORE, (scope) => scope.put(META_STORE, {
    key: anchorKeyFor(LAPTOP),
    // A digest of the right shape and the wrong value — what someone removing an entry and rewriting
    // the anchor to cover for it would produce.
    value: { ...anchor, hash: `${'A'.repeat(43)}=` },
  }));

  const result = await verifyDeviceChain(store);
  assert.equal(result.ok, false);
  assert.equal(result.first_divergence.reason, DIVERGENCE.HEAD_NOT_ANCHORED);
  assert.equal(result.first_divergence.index, 0);

  await store.close();
});

test('an entry removed from the middle of a stored chain is still caught, at its position', async () => {
  const { store } = await aStore();
  await writeRecords(store, 6);

  await runWrite(store.handle, JOURNAL_STORE, (scope) => scope.delete(JOURNAL_STORE, [LAPTOP, 3]));

  const result = await verifyDeviceChain(store);
  assert.equal(result.ok, false);
  assert.equal(result.first_divergence.reason, DIVERGENCE.SEQUENCE_GAP);
  assert.equal(result.first_divergence.seq, 4);

  await store.close();
});

test('chains, anchors and pruning are PER DEVICE — one device does not condemn or prune another', async () => {
  const { store } = await aStore(LAPTOP);

  // The phone's entries sit in the same store as a synchronised copy would: same rows, own chain,
  // own sequence from 1. Nothing about the laptop's chain may reach into them.
  for (let n = 1; n <= 3; n += 1) {
    // eslint-disable-next-line no-await-in-loop
    const draft = await prepareEntry(store.handle, {
      kind: JOURNAL_KINDS.SYNC_COMPLETED,
      device: PHONE,
      entry_id: `phone-${n}`,
      at: new Date(Date.UTC(2026, 6, 26, 8, 0, n)).toISOString(),
    }, { retention: SMALL });
    // eslint-disable-next-line no-await-in-loop
    await runWrite(store.handle, JOURNAL_STORES, (scope) => commitEntryInScope(scope, draft));
  }

  await writeRecords(store, 60);

  assert.equal(await store.read(JOURNAL_STORE, (scope) => countOnDevice(scope, PHONE)), 3,
    'pruning the laptop chain did not touch the phone chain');
  assert.equal(await store.read(META_STORE, (scope) => readAnchor(scope, PHONE)), null,
    'and gave it no anchor it did not earn');

  assert.equal((await verifyDeviceChain(store, LAPTOP)).ok, true);
  const onPhone = await verifyDeviceChain(store, PHONE);
  assert.equal(onPhone.ok, true);
  assert.equal(onPhone.truncated_head, false);

  // Break the laptop's chain; the phone's verdict is unmoved.
  await runWrite(store.handle, JOURNAL_STORE, (scope) => scope.delete(JOURNAL_STORE, [LAPTOP, 58]));
  assert.equal((await verifyDeviceChain(store, LAPTOP)).ok, false);
  assert.equal((await verifyDeviceChain(store, PHONE)).ok, true);

  await store.close();
});

test('the anchor key names its device, so two devices cannot share or overwrite one', () => {
  assert.equal(anchorKeyFor(LAPTOP), `${ANCHOR_META_PREFIX}${LAPTOP}`);
  assert.notEqual(anchorKeyFor(LAPTOP), anchorKeyFor(PHONE));
});

test('verification says so when a chain is longer than it was willing to read', async () => {
  const { store } = await aStore();
  await writeRecords(store, 8);

  const bounded = await verifyDeviceChain(store, LAPTOP, { ceiling: 4, pageSize: 2 });
  assert.equal(bounded.complete, false, 'it does not report a verdict over part of a chain as whole');
  assert.equal(bounded.ok, true, 'what it did read is genuinely intact');
  assert.equal(bounded.checked, 4);

  const whole = await verifyDeviceChain(store);
  assert.equal(whole.complete, true);
  assert.equal(whole.checked, 8);

  await store.close();
});

test('a policy that would discard the entry that triggered it is refused before anything is written', async () => {
  const { store } = await aStore();
  await assert.rejects(
    () => writeARecord(store, 1, { retention: { max: 4, batch: 4, ceiling: 10 } }),
    /discard the entry that triggered it/,
  );
  assert.equal(await store.count('exercise'), 0);
  assert.equal((await allEntries(store)).length, 0);
  await store.close();
});
