/**
 * THE RECORD-CHANGE DOMAIN IS ACTUALLY WIRED — proved by changing records, never by appending.
 *
 * ## What this suite refuses to do, and why that is the whole point
 *
 * **Nothing here calls the log.** No `appendEntry`, no `recordChange`, no `recordEvent`. Every entry
 * asserted below was produced by calling `store.create`, `store.update`, `store.tombstone`,
 * `store.putRecord`, `store.importRecords` or `purgeClient` — the same six doors the application
 * uses. A suite that appended an entry and found it afterwards would prove that the append works,
 * which `core/journal` already proves, and would prove NOTHING about whether editing a client
 * causes one. That gap is exactly where a wiring step quietly fails while looking finished.
 *
 * ## The four things asserted, in the order they can fail silently
 *
 *  1. **An entry exists for every mutation**, of the right kind, naming the right record.
 *  2. **NO entry exists when nothing changed.** `putRecord` and `importRecords` can decide inside
 *     the transaction that the local copy already wins; an entry there would assert an import that
 *     did not happen, which is the same defect as a missing one pointing the other way.
 *  3. **Neither survives without the other.** A commit that fails leaves no record AND no entry —
 *     tested by making the commit fail, because two writes that both succeeded look identical to
 *     one atomic write and prove nothing about atomicity.
 *  4. **No content is in any entry, ever.** Asserted by searching the serialised entry for the text
 *     that was written, rather than by inspecting the fields somebody remembered to check.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { JOURNAL_KINDS, JOURNAL_STORES, readChainPage } from '../journal/journal.js';
import { aClient, aReading, aSession } from '../model/fixtures.js';
import { createEnvelope, reviseEnvelope } from '../model/model.js';
import { APPLY, openLocalStore } from './local-store.js';
import { purgeClient } from './purge.js';
import { createLaptop } from './testing/platform-double.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEVICE = 'coach-laptop';

/** A store on a fresh laptop. */
async function aStore(device = DEVICE) {
  const { world, platform } = createLaptop();
  const store = await openLocalStore({ platform, device });
  return { world, store };
}

/** This device's whole chain, oldest first. Read, never appended to. */
async function entriesOn(store, device = store.device) {
  const page = await store.read(
    JOURNAL_STORES, (scope) => readChainPage(scope, device, { limit: 500 }),
  );
  return page.items;
}

/** The kinds this device has recorded, in order. */
async function kindsOn(store) {
  return (await entriesOn(store)).map((entry) => entry.kind);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// One entry per change, naming the record it was about
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('creating a record writes ONE entry, of the created kind, naming that record', async () => {
  const { store } = await aStore();

  const created = await store.create('client', aClient({ name: 'Ana Example' }));

  const entries = await entriesOn(store);
  assert.equal(entries.length, 1, 'one change, one entry — not zero, and not two');
  assert.equal(entries[0].kind, JOURNAL_KINDS.RECORD_CREATED);
  assert.deepEqual(entries[0].subject, { type: 'client', record_id: created.record_id });
  assert.equal(entries[0].device, DEVICE, 'the store\'s own device tag, not a second identity');
  assert.equal(entries[0].seq, 1);
});

test('revising and tombstoning a record each write their own kind, against the same identity', async () => {
  const { store } = await aStore();
  const created = await store.create('client', aClient({ name: 'Ana Example' }));

  await store.update('client', created.record_id, (content) => ({ ...content, notes: 'Mornings.' }));
  await store.tombstone('client', created.record_id);

  assert.deepEqual(await kindsOn(store), [
    JOURNAL_KINDS.RECORD_CREATED,
    JOURNAL_KINDS.RECORD_UPDATED,
    JOURNAL_KINDS.RECORD_DELETED,
  ]);
  const entries = await entriesOn(store);
  for (const entry of entries) {
    assert.equal(entry.subject.record_id, created.record_id,
      'all three name the same record — a history of one client is answerable by identity');
  }
});

test('a record arriving from elsewhere is recorded as an import, not as a local creation', async () => {
  const { store } = await aStore();
  const fromThePhone = createEnvelope({
    type: 'client', content: aClient({ name: 'Bo Example' }), device: 'coach-phone',
  });

  const result = await store.putRecord(fromThePhone);
  assert.equal(result.outcome, APPLY.APPLIED);

  const entries = await entriesOn(store);
  assert.deepEqual(entries.map((e) => e.kind), [JOURNAL_KINDS.RECORD_IMPORTED]);
  assert.equal(entries[0].subject.record_id, fromThePhone.record_id);
  assert.equal(entries[0].device, DEVICE,
    'recorded against the device that APPLIED it. The chain is per device, and this device is the '
    + 'one that can attest it happened here.');
});

test('a bulk import writes ONE entry carrying a count, and no subject', async () => {
  const { store } = await aStore();
  const records = [
    createEnvelope({ type: 'client', content: aClient({ name: 'Cass' }), device: DEVICE }),
    createEnvelope({ type: 'client', content: aClient({ name: 'Dee' }), device: DEVICE }),
    createEnvelope({ type: 'client', content: aClient({ name: 'Eli' }), device: DEVICE }),
  ];

  const { written } = await store.importRecords(records);
  assert.equal(written, 3);

  const entries = await entriesOn(store);
  assert.equal(entries.length, 1, 'one import is one event, not one event per record');
  assert.equal(entries[0].kind, JOURNAL_KINDS.RECORD_IMPORTED);
  assert.equal(entries[0].subject, null, 'an import is about many records, so it names none');
  assert.equal(entries[0].affected_count, 3,
    'a COUNT is the only thing that grows with the work, deliberately: a count cannot carry a name');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Nothing changed, so nothing is claimed
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('a record that LOSES to the local copy writes no entry at all', async () => {
  const { store } = await aStore();
  const created = await store.create('client', aClient({ name: 'Ana Example' }));
  await store.update('client', created.record_id, (content) => ({ ...content, notes: 'Newer.' }));

  const before = await kindsOn(store);
  const stale = createEnvelope({
    type: 'client', content: aClient({ name: 'Ana Example' }), device: 'coach-phone',
    record_id: created.record_id,
  });

  const result = await store.putRecord(stale);
  assert.equal(result.outcome, APPLY.KEPT_LOCAL, 'the local revision wins — nothing is written');

  assert.deepEqual(await kindsOn(store), before,
    'and so nothing is RECORDED. An entry here would assert that records arrived and were merged '
    + 'in, when the incoming copy was thrown away. A log that overstates is not a smaller problem '
    + 'than one that understates.');
});

test('an import in which every record loses writes no entry', async () => {
  const { store } = await aStore();
  const created = await store.create('client', aClient({ name: 'Ana Example' }));
  await store.update('client', created.record_id, (content) => ({ ...content, notes: 'Newer.' }));
  const before = await kindsOn(store);

  const stale = createEnvelope({
    type: 'client', content: aClient({ name: 'Ana Example' }), device: 'coach-phone',
    record_id: created.record_id,
  });
  const { written, skipped } = await store.importRecords([stale]);

  assert.deepEqual({ written, skipped }, { written: 0, skipped: 1 });
  assert.deepEqual(await kindsOn(store), before, 'nothing arrived, so nothing is recorded');
});

test('the abort that unwrites the entry does not roll back the records that DID apply', async () => {
  const { store } = await aStore();
  const mine = await store.create('client', aClient({ name: 'Ana Example' }));
  await store.update('client', mine.record_id, (content) => ({ ...content, notes: 'Newer.' }));

  const stale = createEnvelope({
    type: 'client', content: aClient({ name: 'Ana Example' }), device: 'coach-phone',
    record_id: mine.record_id,
  });
  const fresh = createEnvelope({
    type: 'client', content: aClient({ name: 'Fay Example' }), device: 'coach-phone',
  });

  const { written, skipped } = await store.importRecords([stale, fresh]);

  assert.deepEqual({ written, skipped }, { written: 1, skipped: 1 },
    'a mixed import still applies what it can — the no-entry abort is reserved for the case where '
    + 'NOTHING was written, which is the only case in which aborting costs nothing');
  assert.equal((await store.get('client', fresh.record_id))?.record_id, fresh.record_id,
    'and the record that won is genuinely on disk afterwards');
  assert.equal(
    (await kindsOn(store)).filter((k) => k === JOURNAL_KINDS.RECORD_IMPORTED).length, 1,
    'with exactly one import entry for it',
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Neither survives without the other
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('a commit that fails leaves NEITHER the record nor its entry', async () => {
  const { world, store } = await aStore();
  await store.create('client', aClient({ name: 'Ana Example' }));
  const before = await entriesOn(store);

  world.indexedDB.faults.failCommitOnce = true;
  await assert.rejects(
    () => store.create('client', aClient({ name: 'Doomed Example' })),
    'the write fails loudly rather than resolving with a flag on it',
  );

  assert.equal(await store.count('client'), 1, 'the record did not land');
  assert.deepEqual(
    (await entriesOn(store)).map((e) => e.entry_id), before.map((e) => e.entry_id),
    'and neither did its entry. This is the direction that can pass by accident: two writes that '
    + 'both succeeded look exactly like one atomic write, so the failing commit is the only test '
    + 'that proves they are in the same transaction.',
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The purge: the entry outlives everything it names
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('purging a client records the purge, and the entries SURVIVE as the only trace left', async () => {
  const { store } = await aStore();
  const client = await store.create('client', aClient({ name: 'Ana Example' }));
  const session = await store.create('session', aSession({ client_ids: [client.record_id] }));
  await store.create('reading', aReading({
    client_id: client.record_id, session_id: session.record_id,
  }));

  const before = (await entriesOn(store)).length;
  const manifest = await purgeClient(store, client.record_id);
  assert.equal(manifest.subject_client_id, client.record_id);

  const entries = await entriesOn(store);
  const purged = entries.filter((e) => e.kind === JOURNAL_KINDS.RECORD_PURGED);
  assert.equal(purged.length, 1, 'one purge, one entry');
  assert.deepEqual(purged[0].subject, { type: 'client', record_id: client.record_id });

  assert.equal(await store.count('client'), 0, 'the client is genuinely gone from the store');
  assert.equal(entries.length, before + 1,
    'and the entries recording their creation are STILL THERE. Sweeping them would delete the '
    + 'evidence that the deletion happened, which is the opposite of what an audit log is for.');
});

test('after a purge the log holds identities and not one word of what was removed', async () => {
  const { store } = await aStore();
  const client = await store.create('client', aClient({
    name: 'Ana Distinctive Example', notes: 'Prefers early mornings, knee flagged.',
  }));
  await store.update('client', client.record_id, (content) => ({
    ...content, notes: 'Adaptation reference: Notes A.',
  }));
  await purgeClient(store, client.record_id);

  const serialised = JSON.stringify(await entriesOn(store));
  for (const leak of ['Ana Distinctive', 'early mornings', 'knee flagged', 'Notes A']) {
    assert.equal(serialised.includes(leak), false,
      `"${leak}" reached the log. An entry carrying a record's content would be a place nobody `
      + 'sweeps — measured on this build once already, in the outbox, after a purge and three syncs.');
  }
  assert.equal(serialised.includes(client.record_id), true,
    'the IDENTITY remains, and is meant to: that is what makes the removal answerable afterwards, '
    + 'and it reads back as nothing at all without a record behind it');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The surface itself, so a sixth method cannot arrive unwired
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('no mutating method opens its own write transaction — the log cannot be bypassed', () => {
  const source = readFileSync(join(HERE, 'local-store.js'), 'utf8');
  const direct = source.match(/runWrite\(this\.handle/g) || [];

  assert.equal(direct.length, 1,
    'exactly ONE direct write transaction is left in this class, and it is `setMeta` — a cursor or '
    + 'a schema stamp is not a record, so it is not a record change. Every other write goes through '
    + '#recordingWrite. This assertion is the gate on a sixth mutating method arriving later and '
    + 'writing nothing to the log: an absent entry is invisible afterwards, so the absence has to '
    + 'fail HERE, in a diff, rather than in production where it looks like a quiet device.');
  assert.match(source, /async setMeta\([\s\S]{0,200}runWrite\(this\.handle/,
    'and that one is setMeta, rather than whichever method most recently reached for it');
});

test('purging goes through the same door, so its entry cannot commit apart from the removal', () => {
  const source = readFileSync(join(HERE, 'purge.js'), 'utf8');

  assert.match(source, /recordChange\(store, \{/,
    'the purge commits its entry inside the transaction that removes the rows');
  assert.equal(/runWrite\(store\.handle, PURGE_STORES/.test(source), false,
    'and no longer opens that transaction itself — a second door here would let the rows go while '
    + 'the entry recording it did not, leaving a removal nothing attests to');
});
