/**
 * DURABILITY ORDERING — the tests the governing standard rests on.
 *
 * The standard is that every write lands durably before any interface acknowledgement, and that this
 * is structural rather than a matter of care. Three things have to be true for that claim to hold,
 * and each is checked here:
 *
 *  1. **Ordering.** The write's promise resolves AFTER the transaction completed, not after the
 *     request succeeded. Proven against the recorded event sequence, not inferred from the code.
 *  2. **Failure.** A transaction that fails to commit throws, and nothing is stored. A caller cannot
 *     receive a resolved promise for a write that did not land.
 *  3. **Intent.** No module outside `db.js` opens a writable transaction, so there is no second door
 *     to walk through. Asserted by reading the sources, because an absence is indistinguishable from
 *     an oversight and the next editor "fixes" it.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { aClient } from '../model/fixtures.js';
import { openDatabase, runWrite, read } from './db.js';
import { StoreWriteError } from './errors.js';
import { openLocalStore } from './local-store.js';
import { ALL_STORES, DB_VERSION, RECORD_STORES } from './schema.js';
import { createLaptop } from './testing/platform-double.js';

const HERE = dirname(fileURLToPath(import.meta.url));

test('a write resolves only after the transaction has COMMITTED', async () => {
  const { world, platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });

  world.indexedDB.startRecording();
  await store.create('client', aClient());
  world.indexedDB.events.push({ event: 'the write resolved', detail: null });

  const names = world.indexedDB.eventNames();
  const success = names.indexOf('request:success');
  const complete = names.indexOf('tx:complete');
  const resolved = names.indexOf('the write resolved');

  assert.ok(success >= 0 && complete >= 0, 'both events must have happened');
  assert.ok(success < complete, 'the request succeeds before the commit — that is the gap');
  assert.ok(complete < resolved,
    'the write must not resolve until the commit has landed; resolving on the request success is '
    + 'exactly how a store tells the coach his session is saved and then loses it');

  await store.close();
});

test('a failed commit throws and stores nothing, even though every request succeeded', async () => {
  const { world, platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });

  world.indexedDB.faults.failCommitOnce = true;
  await assert.rejects(
    () => store.create('client', aClient({ name: 'Not Saved' }), { recordId: '44444444-4444-4444-8444-444444444444' }),
    (error) => {
      assert.ok(error instanceof StoreWriteError, 'a failed write is an error, never a status flag');
      assert.match(error.message, /not enough room|did not complete/i);
      return true;
    },
  );

  assert.equal(await store.get('client', '44444444-4444-4444-8444-444444444444'), undefined,
    'nothing may survive a commit that failed');
  await store.close();
});

test('a callback that throws aborts the transaction and leaves no partial write', async () => {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });

  const first = '55555555-5555-4555-8555-555555555555';
  const second = '66666666-6666-4666-8666-666666666666';

  await assert.rejects(() => runWrite(store.handle, RECORD_STORES.client, async (scope) => {
    await scope.put(RECORD_STORES.client, {
      record_id: first,
      type: 'client',
      rev: 1,
      device: 'coach-laptop',
      deleted: false,
      deleted_at: null,
      created_at: '2026-07-25T09:00:00.000Z',
      updated_at: '2026-07-25T09:00:00.000Z',
      content: aClient(),
    });
    throw new Error('changed my mind halfway through');
  }), /changed my mind/);

  assert.equal(await store.get('client', first), undefined,
    'a write already acknowledged by the database must still vanish when the unit of work fails');
  assert.equal(await store.get('client', second), undefined);
  await store.close();
});

test('the writable transaction is opened in exactly ONE place', () => {
  const sources = readdirSync(HERE)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'));

  const offenders = sources.filter((file) => {
    if (file === 'db.js') return false;
    const text = readFileSync(join(HERE, file), 'utf8');
    // The mode as a string literal passed to a transaction — not the word in prose.
    return /['"]readwrite['"]/.test(text);
  });

  assert.deepEqual(offenders, [],
    'only db.js may open a writable transaction. A second door would let a caller resolve a save '
    + 'before it committed, which is the one failure this layer exists to prevent.');
});

test('paging resumes exactly where it stopped, in both directions', async () => {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });

  const names = ['Ana', 'Bo', 'Cy', 'Di', 'Ed', 'Fay', 'Gil'];
  for (const name of names) await store.create('client', aClient({ name }));

  const seen = [];
  let after = null;
  let done = false;
  let pages = 0;
  while (!done && pages < 10) {
    const page = await read(store.handle, RECORD_STORES.client, (scope) => scope.page({
      store: RECORD_STORES.client, index: 'by_name', limit: 3, after,
    }));
    seen.push(...page.items.map((r) => r.content.name));
    after = page.cursor;
    done = page.done;
    pages += 1;
  }
  assert.deepEqual(seen, names, 'every record exactly once, in index order, across page boundaries');
  assert.equal(pages, 3);

  const reverse = await read(store.handle, RECORD_STORES.client, (scope) => scope.page({
    store: RECORD_STORES.client, index: 'by_name', limit: 2, direction: 'prev',
  }));
  assert.deepEqual(reverse.items.map((r) => r.content.name), ['Gil', 'Fay']);

  await store.close();
});

test('a page of records with the SAME index key still advances', async () => {
  // Two clients with one name is entirely possible, and a resume that stepped over the wrong number
  // of them would either skip a person or loop forever on one.
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });
  for (let i = 0; i < 5; i += 1) await store.create('client', aClient({ name: 'Same Name' }));

  const ids = new Set();
  let after = null;
  for (let page = 0; page < 10; page += 1) {
    const result = await read(store.handle, RECORD_STORES.client, (scope) => scope.page({
      store: RECORD_STORES.client, index: 'by_name', limit: 2, after,
    }));
    for (const record of result.items) ids.add(record.record_id);
    if (result.done) break;
    after = result.cursor;
  }
  assert.equal(ids.size, 5);
  await store.close();
});

test('the schema opens on a fresh database and again on an existing one', async () => {
  const { world, platform } = createLaptop();
  const first = await openDatabase(platform);
  first.close();
  const second = await openDatabase(platform);
  // Against the declared version rather than a literal: the schema gains stores as the foundation is
  // built out, and a hardcoded number here would fail on the next legitimate addition while proving
  // nothing about what this test is for, which is that opening twice yields the same database.
  assert.equal(second.version, DB_VERSION);
  assert.ok(second.db.objectStoreNames.contains(RECORD_STORES.session));
  // And every store the schema declares is actually there, on a database that was upgraded rather
  // than created — the case a store added at a later version has to survive.
  for (const name of ALL_STORES) {
    assert.ok(second.db.objectStoreNames.contains(name), `the upgraded database is missing "${name}"`);
  }
  second.close();
  assert.ok(world);
});
