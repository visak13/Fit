/**
 * GRACEFUL DEGRADATION — proven by counting, not by reading the code.
 *
 * Session and client volumes are unknown and cannot be clarified, so the property that has to hold
 * is that **the cost of a page is the size of the page, not the size of the practice.** These tests
 * build a history several times larger than any page they ask for and then assert on how many rows
 * the database actually handed over.
 *
 * Counting is the only honest way to check this. A query written as `getAll().filter().sort().slice()`
 * looks perfectly reasonable, passes every functional test, and reads the whole store to answer a
 * question about one client. The row counter is what tells the difference.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aClient, aDietPlan, aPerformedRecord, aReading, aSession, aSessionNote,
} from '../model/fixtures.js';
import { createEnvelope } from '../model/model.js';
import { openLocalStore } from './local-store.js';
import {
  changedSince, dietPlanForClient, dietPlansForClient, latestSessionForClient, listClients,
  performedForClient, performedForClientInSession, previousSessionForClient, readingsForClient,
  sessionCountForClient, sessionsForClient, unfinishedSessions,
} from './queries.js';
import { createLaptop } from './testing/platform-double.js';

const DEVICE = 'coach-laptop';

/** An ISO instant `n` hours after a fixed origin, so ordering is exact and stable. */
const hour = (n) => new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + n * 3600_000).toISOString();

/**
 * A practice with two clients, each with `count` sessions, built in one transaction so the setup
 * cost does not dominate the suite.
 */
async function aPracticeWith(count) {
  const { world, platform } = createLaptop();
  const store = await openLocalStore({ platform, device: DEVICE });

  const ana = await store.create('client', aClient({ name: 'Ana Example' }));
  const bo = await store.create('client', aClient({ name: 'Bo Example' }));

  const records = [];
  const sessionIds = { ana: [], bo: [] };
  for (const [who, client] of [['ana', ana], ['bo', bo]]) {
    for (let i = 0; i < count; i += 1) {
      const record = createEnvelope({
        type: 'session',
        device: DEVICE,
        now: hour(i),
        content: aSession({
          client_ids: [client.record_id],
          status: 'completed',
          started_at: hour(i),
          ended_at: hour(i + 1),
        }),
      });
      records.push(record);
      sessionIds[who].push(record.record_id);
    }
  }
  await store.importRecords(records);
  return { world, store, ana, bo, sessionIds };
}

/** Rows the database handed over while running `fn`. */
async function rowsRead(store, fn) {
  const before = store.stats.rowsRead;
  const value = await fn();
  return { value, rows: store.stats.rowsRead - before };
}

test("a client's sessions come back newest first, a page at a time", async () => {
  const { store, ana } = await aPracticeWith(30);

  const first = await sessionsForClient(store, ana.record_id, { limit: 5 });
  assert.equal(first.items.length, 5);
  assert.equal(first.done, false);
  assert.deepEqual(
    first.items.map((s) => s.content.started_at),
    [hour(29), hour(28), hour(27), hour(26), hour(25)],
    'newest first, in genuine time order',
  );

  const second = await sessionsForClient(store, ana.record_id, { limit: 5, after: first.cursor });
  assert.deepEqual(second.items.map((s) => s.content.started_at),
    [hour(24), hour(23), hour(22), hour(21), hour(20)]);

  // Every session, exactly once, across every page.
  const seen = new Set();
  let after = null;
  let done = false;
  while (!done) {
    const page = await sessionsForClient(store, ana.record_id, { limit: 7, after });
    for (const s of page.items) seen.add(s.record_id);
    after = page.cursor;
    done = page.done;
  }
  assert.equal(seen.size, 30);
  await store.close();
});

test('a page of one client history costs the page, not the practice', async () => {
  const { store, ana } = await aPracticeWith(40);
  // 80 sessions exist. A page of five must not read 80 of anything.
  const { value, rows } = await rowsRead(store, () => sessionsForClient(store, ana.record_id, { limit: 5 }));
  assert.equal(value.items.length, 5);
  assert.ok(rows <= 12,
    `a five-session page read ${rows} rows; it must be bounded by the page (five index rows plus five `
    + 'sessions), not by the history');
  await store.close();
});

test("the most recent session is one step of a reverse walk, not a sort of the history", async () => {
  const { store, ana, bo } = await aPracticeWith(40);

  const { value, rows } = await rowsRead(store, () => latestSessionForClient(store, ana.record_id));
  assert.equal(value.content.started_at, hour(39));
  assert.ok(rows <= 12, `finding the latest session read ${rows} rows`);

  // And it is the right client's. A shared database with two clients' histories interleaved is
  // exactly where a query that forgot to narrow would still look correct.
  const theirs = await latestSessionForClient(store, bo.record_id);
  assert.ok(theirs.content.client_ids.includes(bo.record_id));
  assert.ok(!theirs.content.client_ids.includes(ana.record_id));
  await store.close();
});

test('the previous session is shown at a glance: exercises, loads and readings, per client', async () => {
  const { world, platform } = createLaptop();
  const store = await openLocalStore({ platform, device: DEVICE });

  const ana = await store.create('client', aClient({ name: 'Ana Example' }));
  const bo = await store.create('client', aClient({ name: 'Bo Example' }));

  // One SHARED session: two clients, one routine, separate capture for each.
  const shared = await store.create('session', aSession({
    client_ids: [ana.record_id, bo.record_id],
    status: 'completed',
    started_at: hour(1),
    ended_at: hour(2),
  }));

  for (const [client, load] of [[ana, '20kg'], [bo, '12kg']]) {
    await store.create('performed-record', aPerformedRecord({
      session_id: shared.record_id, client_id: client.record_id, position: 0, observed_load: load,
    }));
    await store.create('reading', aReading({
      session_id: shared.record_id, client_id: client.record_id, kind: 'plank-hold',
      value: load === '20kg' ? 70 : 45, unit: 'seconds', taken_at: hour(1),
    }));
    await store.create('session-note', aSessionNote({
      session_id: shared.record_id, client_id: client.record_id, text: `A note about ${load}.`,
      taken_at: hour(1),
    }));
  }
  // A note about the session as a whole belongs to nobody in particular.
  await store.create('session-note', aSessionNote({
    session_id: shared.record_id, client_id: undefined, text: 'Room was busy.', taken_at: hour(1),
  }));

  // Now the coach starts a new session with Ana and wants to see the last one.
  const starting = await store.create('session', aSession({
    client_ids: [ana.record_id], status: 'planned', scheduled_at: hour(5),
  }));

  const glance = await previousSessionForClient(store, ana.record_id, {
    excludeSessionId: starting.record_id,
  });

  assert.equal(glance.session.record_id, shared.record_id);
  assert.deepEqual(glance.performed.map((p) => p.content.observed_load), ['20kg'],
    "the shared session shows only THIS client's performed record, with the load he observed");
  assert.deepEqual(glance.readings.map((r) => r.content.value), [70]);
  assert.deepEqual(glance.notes.map((n) => n.content.text), ['A note about 20kg.'],
    "a note about the session as a whole is not folded into one client's view, and neither is the "
    + "other client's note");

  const theirs = await previousSessionForClient(store, bo.record_id);
  assert.deepEqual(theirs.performed.map((p) => p.content.observed_load), ['12kg']);
  await store.close();
});

test('one trend line is read without touching the others', async () => {
  const { world, platform } = createLaptop();
  const store = await openLocalStore({ platform, device: DEVICE });
  const ana = await store.create('client', aClient({ name: 'Ana Example' }));
  const bo = await store.create('client', aClient({ name: 'Bo Example' }));

  const records = [];
  for (let i = 0; i < 30; i += 1) {
    for (const [client, kinds] of [[ana, ['plank-hold', 'resting-heart-rate']], [bo, ['plank-hold']]]) {
      for (const kind of kinds) {
        records.push(createEnvelope({
          type: 'reading',
          device: DEVICE,
          now: hour(i),
          content: aReading({
            client_id: client.record_id,
            session_id: undefined,
            kind,
            value: kind === 'plank-hold' ? 40 + i : 60 + i,
            unit: kind === 'plank-hold' ? 'seconds' : 'bpm',
            context: 'standalone',
            taken_at: hour(i),
          }),
        }));
      }
    }
  }
  await store.importRecords(records);
  assert.equal(await store.count('reading'), 90);

  const { value, rows } = await rowsRead(store, () => readingsForClient(store, ana.record_id, {
    kind: 'resting-heart-rate', limit: 10,
  }));
  assert.equal(value.items.length, 10);
  assert.ok(value.items.every((r) => r.content.kind === 'resting-heart-rate'));
  assert.ok(value.items.every((r) => r.content.client_id === ana.record_id));
  assert.ok(rows <= 11, `one trend line of ten points read ${rows} rows out of ninety`);

  // Narrowed to a window of time, still on the index.
  const window = await readingsForClient(store, ana.record_id, {
    kind: 'plank-hold', from: hour(10), to: hour(14), limit: 50,
  });
  assert.deepEqual(window.items.map((r) => r.content.taken_at),
    [hour(10), hour(11), hour(12), hour(13), hour(14)]);
  await store.close();
});

test('the roster is paged and hides archived clients without a boolean index', async () => {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: DEVICE });

  for (const name of ['Ana Example', 'Bo Example', 'Cy Example', 'Di Example']) {
    await store.create('client', aClient({ name }));
  }
  const gone = await store.create('client', aClient({ name: 'Ez Example', active: false }));

  const page = await listClients(store, { limit: 10 });
  assert.deepEqual(page.items.map((c) => c.content.name),
    ['Ana Example', 'Bo Example', 'Cy Example', 'Di Example']);

  const withArchived = await listClients(store, { limit: 10, includeArchived: true });
  assert.equal(withArchived.items.length, 5);
  assert.ok(withArchived.items.some((c) => c.record_id === gone.record_id));

  const first = await listClients(store, { limit: 2 });
  assert.deepEqual(first.items.map((c) => c.content.name), ['Ana Example', 'Bo Example']);
  const second = await listClients(store, { limit: 2, after: first.cursor });
  assert.deepEqual(second.items.map((c) => c.content.name), ['Cy Example', 'Di Example']);
  await store.close();
});

test('a tombstoned record disappears from every list without being deleted', async () => {
  const { store, ana, sessionIds } = await aPracticeWith(3);

  assert.equal((await sessionsForClient(store, ana.record_id, { limit: 10 })).items.length, 3);
  await store.tombstone('session', sessionIds.ana[0]);

  const after = await sessionsForClient(store, ana.record_id, { limit: 10 });
  assert.equal(after.items.length, 2);

  // It is still findable as a change to propagate — a deletion has to reach the other device.
  const changes = await changedSince(store, 'session', '2000-01-01T00:00:00.000Z', { limit: 50 });
  assert.ok(changes.items.some((r) => r.record_id === sessionIds.ana[0] && r.deleted === true));
  await store.close();
});

test('unfinished sessions are found so an interrupted one can be resumed', async () => {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: DEVICE });
  const ana = await store.create('client', aClient({ name: 'Ana Example' }));

  await store.create('session', aSession({
    client_ids: [ana.record_id], status: 'completed', started_at: hour(1), ended_at: hour(2),
  }));
  const interrupted = await store.create('session', aSession({
    client_ids: [ana.record_id], status: 'interrupted', started_at: hour(2),
  }));

  const found = await unfinishedSessions(store);
  assert.deepEqual(found.items.map((s) => s.record_id), [interrupted.record_id]);
  await store.close();
});

test('the remaining queries answer from an index', async () => {
  const { store, ana, sessionIds } = await aPracticeWith(4);

  assert.equal(await sessionCountForClient(store, ana.record_id), 4);

  await store.create('performed-record', aPerformedRecord({
    session_id: sessionIds.ana[0], client_id: ana.record_id, recorded_at: hour(1),
  }));
  const history = await performedForClient(store, ana.record_id, { limit: 10 });
  assert.equal(history.items.length, 1);

  const inSession = await performedForClientInSession(store, sessionIds.ana[0], ana.record_id);
  assert.equal(inSession.length, 1);

  await store.create('diet-plan', aDietPlan({ client_id: ana.record_id, status: 'current' }));
  await store.create('diet-plan', aDietPlan({ client_id: ana.record_id, status: 'past', name: 'Old week' }));

  const current = await dietPlanForClient(store, ana.record_id);
  assert.equal(current.content.status, 'current');
  const all = await dietPlansForClient(store, ana.record_id, { limit: 10 });
  assert.equal(all.items.length, 2);
  await store.close();
});
