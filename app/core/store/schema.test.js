/**
 * THE SCHEMA AS DATA — what version 3 added, and the two rules it had to obey to be allowed in.
 *
 * The schema is written as a value rather than a sequence of calls precisely so that a test can
 * assert against it. What is checked here is not "the store exists" — that would pass on a store put
 * in the wrong place — but the properties that make a NEW store safe to add: that it is reachable by
 * a transaction, that it did not join the record kinds, that the bijection between the model and the
 * record stores still holds, and that nothing in the whole schema is keyed on something the platform
 * cannot key on.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { RECORD_TYPES } from '../model/model.js';
import { openDatabase, read, runWrite } from './db.js';
import { isValidKey } from './keys.js';
import {
  ALL_STORES, DB_VERSION, JOURNAL_STORE, MIGRATIONS, RECORD_STORES, SCHEMA, schemaCoverage,
} from './schema.js';
import { createLaptop } from './testing/platform-double.js';

test('the schema is at version 3 and the journal store arrived with it', () => {
  assert.equal(DB_VERSION, 3);
  const spec = SCHEMA.find((s) => s.store === JOURNAL_STORE);
  assert.ok(spec, 'the journal store is in SCHEMA');
  assert.equal(spec.since, 3);
  assert.deepEqual(spec.keyPath, ['device', 'seq']);
});

test('the journal is infrastructure, not a record kind — the bijection is untouched', () => {
  // The same precedent as the outbox, the deletions manifest and the small-values store: in SCHEMA
  // and in ALL_STORES, and deliberately absent from RECORD_STORES. schemaCoverage asserts a strict
  // bijection between the model's kinds and the mapped stores, and a journal entry is not a record:
  // no envelope, no revision, no tombstone.
  assert.ok(ALL_STORES.includes(JOURNAL_STORE), 'a transaction is checked against ALL_STORES');
  assert.ok(!Object.values(RECORD_STORES).includes(JOURNAL_STORE));
  assert.ok(!RECORD_TYPES.includes('journal'));
  assert.deepEqual(schemaCoverage(), { missingStores: [], orphanStores: [] });
});

test('every store in the schema is reachable by a transaction, and every reachable store is defined', () => {
  const defined = SCHEMA.map((s) => s.store).sort();
  assert.deepEqual(Array.from(ALL_STORES).sort(), defined,
    'a store missing from ALL_STORES has every transaction naming it refused');
});

test('every index in the whole schema names the question it answers', () => {
  for (const spec of SCHEMA) {
    for (const index of spec.indexes) {
      assert.equal(typeof index.answers, 'string', `${spec.store}.${index.name} has no stated question`);
      assert.ok(index.answers.length > 10, `${spec.store}.${index.name} states no real question`);
    }
  }
});

test('no index anywhere is keyed on something the platform cannot key on', () => {
  // A boolean is not a valid key: an index on one silently holds zero entries while every query
  // against it comes back empty and looks reasonable. This build has been bitten twice. The check is
  // on the SHAPE of the key path rather than on a value, so it catches a field named like a flag.
  assert.equal(isValidKey(true), false, 'the premise this rule rests on');
  const suspicious = /(^|\.)(is_|has_|active$|pending$|deleted$|ok$|enabled$|pruned$|verified$)/;
  for (const spec of SCHEMA) {
    for (const index of spec.indexes) {
      for (const path of [].concat(index.keyPath)) {
        assert.ok(!suspicious.test(path), `${spec.store}.${index.name} indexes what looks like a flag: ${path}`);
      }
    }
  }
});

test('version 3 needed no migration, because nothing already stored changed shape', () => {
  // The seam is deliberately present and deliberately empty: a step that reshaped nothing is one
  // every later upgrade has to read past. Adding a store is not a reshaping.
  assert.equal(MIGRATIONS.length, 0);
});

test('a database created fresh at version 3 holds the journal store and accepts a write to it', async () => {
  const { platform } = createLaptop();
  const handle = await openDatabase(platform);
  assert.equal(handle.version, 3);
  assert.ok(handle.db.objectStoreNames.contains(JOURNAL_STORE));

  const row = { device: 'coach-laptop', seq: 1, entry_id: 'e1', kind: 'sync.started' };
  await runWrite(handle, JOURNAL_STORE, (scope) => scope.put(JOURNAL_STORE, row));
  const back = await read(handle, JOURNAL_STORE, (scope) => scope.get(JOURNAL_STORE, ['coach-laptop', 1]));
  assert.equal(back.entry_id, 'e1', 'the compound key is what a row is addressed by');

  handle.close();
});

test('an existing database is upgraded to 3 and keeps every row it already held', async () => {
  // applySchema is idempotent per version and drives itself off SCHEMA, so an upgraded database and
  // a fresh one must converge. Losing data on the way is the defect that matters, so a row is put in
  // before the upgrade and looked for after it — the coach's history is what a bad upgrade costs.
  const { platform } = createLaptop();
  const before = await openDatabase(platform, { version: 2 });
  await runWrite(before, 'meta', (scope) => scope.put('meta', { key: 'before-the-upgrade', value: 42 }));
  before.close();

  const after = await openDatabase(platform);
  assert.equal(after.version, 3);
  assert.ok(after.db.objectStoreNames.contains(JOURNAL_STORE));
  const kept = await read(after, 'meta', (scope) => scope.get('meta', 'before-the-upgrade'));
  assert.equal(kept.value, 42, 'the upgrade did not cost the coach anything already stored');
  const upgradedStores = Array.from(after.db.objectStoreNames).sort();
  after.close();

  const { platform: freshPlatform } = createLaptop();
  const clean = await openDatabase(freshPlatform);
  const freshStores = Array.from(clean.db.objectStoreNames).sort();
  clean.close();

  assert.deepEqual(upgradedStores, freshStores, 'an upgraded database and a fresh one are identical');
});

test('a transaction naming a store outside ALL_STORES is refused by name', async () => {
  const { platform } = createLaptop();
  const handle = await openDatabase(platform);
  await assert.rejects(() => read(handle, 'journals', () => null), /Unknown object store "journals"/);
  handle.close();
});
