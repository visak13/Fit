/**
 * THE DOUBLE'S OWN TESTS.
 *
 * Everything else in this package is verified against the in-memory database double, so the double
 * itself has to be verified first. These tests check the four behaviours the rest of the suite
 * depends on being FAITHFUL rather than convenient — the ones a kinder double would smooth over,
 * turning a green suite into a defect discovered in a browser.
 *
 * If one of these fails, no other result in this directory means anything.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createFakeIndexedDB } from './testing/fake-indexeddb.js';

/** A database with one store and one index, ready to use. */
async function aDatabase({ unique = false } = {}) {
  const { indexedDB, IDBKeyRange } = createFakeIndexedDB();
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('t', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('things', { keyPath: 'id' });
      store.createIndex('by_group', 'group', { unique });
      store.createIndex('by_tags', 'tags', { multiEntry: true });
      store.createIndex('by_when', 'when');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return { indexedDB, IDBKeyRange, db };
}

/** @param {IDBRequest} request */
const done = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

test('a request succeeds BEFORE the transaction completes — the gap durability depends on', async () => {
  const { indexedDB, db } = await aDatabase();
  indexedDB.startRecording();

  const order = [];
  const tx = db.transaction(['things'], 'readwrite');
  const complete = new Promise((resolve) => {
    tx.oncomplete = () => { order.push('tx:complete'); resolve(); };
  });

  const request = tx.objectStore('things').put({ id: 'a', group: 'g', when: '1' });
  request.onsuccess = () => order.push('request:success');

  await complete;

  assert.deepEqual(order, ['request:success', 'tx:complete'],
    'the request must succeed first and the commit second — collapsing the two would make the '
    + 'durability test prove nothing');
  assert.deepEqual(indexedDB.eventNames(), ['request:success', 'tx:complete']);
});

test('an abort after every request succeeded undoes the writes', async () => {
  const { db } = await aDatabase();

  const tx = db.transaction(['things'], 'readwrite');
  const settled = new Promise((resolve) => { tx.onabort = () => resolve('aborted'); });
  const put = tx.objectStore('things').put({ id: 'a', group: 'g', when: '1' });
  await new Promise((resolve) => { put.onsuccess = resolve; });
  // The request has succeeded. The data is NOT saved.
  tx.abort();
  assert.equal(await settled, 'aborted');

  const after = db.transaction(['things'], 'readonly');
  assert.equal(await done(after.objectStore('things').get('a')), undefined,
    'a successful request inside an aborted transaction must leave nothing behind');
});

test('a failed commit discards the transaction even though every request succeeded', async () => {
  const { indexedDB, db } = await aDatabase();

  const tx = db.transaction(['things'], 'readwrite');
  const aborted = new Promise((resolve) => { tx.onabort = () => resolve(tx.error); });
  await done(tx.objectStore('things').put({ id: 'a', group: 'g', when: '1' }));
  indexedDB.faults.failCommitOnce = true;

  const error = await aborted;
  assert.equal(error.name, 'QuotaExceededError');

  const after = db.transaction(['things'], 'readonly');
  assert.equal(await done(after.objectStore('things').get('a')), undefined);
});

test('read-write transactions do not interleave', async () => {
  const { db } = await aDatabase();
  const order = [];

  const first = db.transaction(['things'], 'readwrite');
  const second = db.transaction(['things'], 'readwrite');

  const firstDone = new Promise((resolve) => { first.oncomplete = () => { order.push('first'); resolve(); }; });
  const secondDone = new Promise((resolve) => { second.oncomplete = () => { order.push('second'); resolve(); }; });

  // Issue the second transaction's work immediately. It must still land after the first commits.
  const secondPut = second.objectStore('things').put({ id: 'b', group: 'g', when: '2' });
  const firstPut = first.objectStore('things').put({ id: 'a', group: 'g', when: '1' });
  secondPut.onsuccess = () => order.push('second:write');
  firstPut.onsuccess = () => order.push('first:write');

  await Promise.all([firstDone, secondDone]);
  assert.deepEqual(order, ['first:write', 'first', 'second:write', 'second']);
});

test('a unique index refuses a second record with the same key, and the transaction aborts', async () => {
  const { db } = await aDatabase({ unique: true });
  await done(db.transaction(['things'], 'readwrite').objectStore('things').put({ id: 'a', group: 'g', when: '1' }));

  const tx = db.transaction(['things'], 'readwrite');
  const aborted = new Promise((resolve) => { tx.onabort = () => resolve(tx.error); });
  tx.objectStore('things').put({ id: 'b', group: 'g', when: '2' });

  const error = await aborted;
  assert.equal(error.name, 'ConstraintError');
});

test('a record with no valid index key produces no index entry, plausibly and silently', async () => {
  const { db, IDBKeyRange } = await aDatabase();
  const tx = db.transaction(['things'], 'readwrite');
  const store = tx.objectStore('things');
  store.put({ id: 'a', group: 'g', when: '1', flag: true });
  store.put({ id: 'b', group: 'g', flag: false });          // no `when` at all
  await done(store.put({ id: 'c', group: 'g', when: true })); // a boolean is not a key

  const read = db.transaction(['things'], 'readonly');
  const keys = await done(read.objectStore('things').index('by_when').getAllKeys());
  assert.deepEqual(keys, ['a'],
    'this is exactly why no index in the schema is on a boolean: the query returns nothing, and '
    + 'looks reasonable doing it');
});

test('a multi-entry index yields one entry per member and does not de-duplicate records', async () => {
  const { db, IDBKeyRange } = await aDatabase();
  const tx = db.transaction(['things'], 'readwrite');
  const store = tx.objectStore('things');
  store.put({ id: 'a', group: 'g', when: '1', tags: ['x', 'y'] });
  await done(store.put({ id: 'b', group: 'g', when: '2', tags: ['y'] }));

  const read = db.transaction(['things'], 'readonly');
  const forY = await done(read.objectStore('things').index('by_tags').getAllKeys(IDBKeyRange.only('y')));
  assert.deepEqual(forY.sort(), ['a', 'b']);
});

test('a reverse cursor walks the index backwards', async () => {
  const { db } = await aDatabase();
  const tx = db.transaction(['things'], 'readwrite');
  const store = tx.objectStore('things');
  store.put({ id: 'a', group: 'g', when: '1' });
  store.put({ id: 'b', group: 'g', when: '2' });
  await done(store.put({ id: 'c', group: 'g', when: '3' }));

  const read = db.transaction(['things'], 'readonly');
  const seen = [];
  await new Promise((resolve, reject) => {
    const request = read.objectStore('things').index('by_when').openCursor(undefined, 'prev');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { resolve(); return; }
      seen.push(cursor.value.id);
      cursor.continue();
    };
  });
  assert.deepEqual(seen, ['c', 'b', 'a']);
});

test('stored values are cloned, so a caller cannot reach back into the database', async () => {
  const { db } = await aDatabase();
  const original = { id: 'a', group: 'g', when: '1', nested: { n: 1 } };
  await done(db.transaction(['things'], 'readwrite').objectStore('things').put(original));
  original.nested.n = 99;

  const read = await done(db.transaction(['things'], 'readonly').objectStore('things').get('a'));
  assert.equal(read.nested.n, 1);
  read.nested.n = 42;
  const again = await done(db.transaction(['things'], 'readonly').objectStore('things').get('a'));
  assert.equal(again.nested.n, 1);
});
