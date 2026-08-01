/**
 * THE WALK — it reaches the end or it refuses, and it does not double a shared session.
 *
 * ## WHY THE PAGING TESTS LOOK PARANOID
 *
 * Because the defect they guard against has no symptom. Every store query is paged; a collector
 * built from first pages returns records of every kind, in the right shape, with plausible counts,
 * and nothing errors at write time or at read time. The twenty-sixth client is simply not in the
 * file, and the only moment that becomes visible is the moment the file is the only copy left.
 *
 * So the assertions here are about the SHORT file that must never be written, and each one is
 * proved by making the walk go wrong on purpose rather than by reading the code and agreeing with
 * it.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { aClient, anExercise, anIntensityPattern, aRoutine, aSession } from '../model/fixtures.js';
import { openLocalStore } from '../store/local-store.js';
import { sessionsForClient } from '../store/queries.js';
import { createLaptop } from '../store/testing/platform-double.js';
import { BACKUP_KINDS } from '../artefacts/restorable-backup.js';
import { BackupIncomplete, collectBackup, MAX_PAGES, walkToTheEnd } from './collect.js';

const NOW = '2026-08-01T09:00:00.000Z';
const COACH = { provenance: 'coach-created' };

async function aStore(device = 'coach-laptop') {
  const { platform } = createLaptop();
  return openLocalStore({ platform, device });
}

test('IT WALKS PAST THE FIRST PAGE — the whole practice, not the first twenty-five of it', async () => {
  const store = await aStore();
  const many = 60;
  for (let n = 0; n < many; n += 1) {
    await store.create('client', aClient({ name: `Fixture Client ${String(n).padStart(3, '0')}` }));
  }
  await store.create('exercise', anExercise({ id: 'coach-floor-press', ...COACH }));
  await store.create('routine', aRoutine({
    id: 'coach-tuesday', entries: [{ exercise_id: 'coach-floor-press', sets: 3, repetitions: 10 }], ...COACH,
  }));
  await store.create('intensity-pattern', anIntensityPattern({ id: 'coach-ramp', ...COACH }));

  // A page size SMALLER than the data, deliberately: with one page big enough to hold everything,
  // this test would pass against a collector that never turned a page at all.
  const set = await collectBackup(store, { taken_at: NOW, pageSize: 7 });

  assert.equal(set.kinds.client.length, many, 'the walk stopped short and nothing said so');
  assert.equal(new Set(set.kinds.client.map((r) => r.record_id)).size, many, 'and it did not read one twice');
});

test('EVERY KIND IS PRESENT, from the model\'s own list rather than one typed here', async () => {
  const store = await aStore();
  await store.create('client', aClient());
  const set = await collectBackup(store, { taken_at: NOW });

  assert.deepEqual(Object.keys(set.kinds).sort(), [...BACKUP_KINDS].sort());
  assert.ok(BACKUP_KINDS.length >= 9, 'the list this is derived from is not empty');
});

test('A WALK THAT STOPS BEFORE THE END REFUSES rather than returning what it managed to read', async () => {
  // A store whose page hands back the cursor it was given: the next request re-reads the same page
  // forever. This is not a walk that is taking a while; it has stopped.
  const stalled = {
    device: 'coach-laptop',
    read: async () => ({ items: [{ record_id: 'a', type: 'client' }], cursor: null, done: false }),
  };

  await assert.rejects(
    () => walkToTheEnd(/** @type {any} */ (stalled), 'client', 5),
    (error) => error instanceof BackupIncomplete && /stopped before the end/.test(error.message),
  );
});

test('...AND A CURSOR THAT REPEATS ITSELF IS THE SAME REFUSAL, not an endless loop', async () => {
  const repeating = {
    device: 'coach-laptop',
    read: async () => ({ items: [{ record_id: 'a', type: 'client' }], cursor: 'always-the-same', done: false }),
  };

  const error = await walkToTheEnd(/** @type {any} */ (repeating), 'client', 5).then(
    () => { throw new Error('the walk returned instead of refusing'); },
    (thrown) => thrown,
  );

  assert.ok(error instanceof BackupIncomplete);
  // It must refuse on the SECOND page rather than grinding to the backstop: an endless walk that
  // eventually gives up is still an application that hung.
  assert.match(error.message, /stopped before the end/);
});

test('THE BACKSTOP REFUSES; IT NEVER TRUNCATES', async () => {
  let page = 0;
  const forever = {
    device: 'coach-laptop',
    read: async () => {
      page += 1;
      return { items: [{ record_id: `r${page}`, type: 'client' }], cursor: `c${page}`, done: false };
    },
  };

  await assert.rejects(
    () => walkToTheEnd(/** @type {any} */ (forever), 'client', 1),
    (error) => error instanceof BackupIncomplete && new RegExp(`${MAX_PAGES} pages`).test(error.message),
  );
  assert.ok(page >= MAX_PAGES, 'the cap was not actually reached, so this proved nothing');
});

test('A REFUSAL SAYS HOW MANY IT HAD, so nobody mistakes it for a store that is empty', async () => {
  const stalled = {
    device: 'coach-laptop',
    read: async () => ({ items: [{ record_id: 'a' }, { record_id: 'b' }], cursor: null, done: false }),
  };
  const error = await walkToTheEnd(/** @type {any} */ (stalled), 'client', 5).catch((thrown) => thrown);
  assert.equal(error.gathered, 2);
  assert.equal(error.kind, 'client');
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// The doubled session — the hazard proved REAL, and then proved absent
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('THE PER-CLIENT WALK REALLY DOES CARRY A SHARED SESSION TWICE — the hazard, measured', async () => {
  // This is the probe. Without it, the assertion in the next test is a claim about a danger nobody
  // has shown to exist, and a guard against an imaginary hazard is indistinguishable from a guard
  // that does nothing.
  const store = await aStore();
  const one = await store.create('client', aClient({ name: 'Fixture One' }));
  const two = await store.create('client', aClient({ name: 'Fixture Two' }));
  await store.create('session', aSession({
    routine_id: 'coach-tuesday', client_ids: [one.record_id, two.record_id], status: 'planned',
  }));

  const naive = [
    ...(await sessionsForClient(store, one.record_id)).items,
    ...(await sessionsForClient(store, two.record_id)).items,
  ];

  assert.equal(naive.length, 2, 'per-client is the only index there is, so the shared session comes back once per attendee');
  assert.equal(new Set(naive.map((s) => s.record_id)).size, 1, 'and both are the SAME session');
});

test('...AND THE BACKUP HOLDS IT ONCE, because it walks an index the duplicate cannot arise on', async () => {
  const store = await aStore();
  const one = await store.create('client', aClient({ name: 'Fixture One' }));
  const two = await store.create('client', aClient({ name: 'Fixture Two' }));
  const session = await store.create('session', aSession({
    routine_id: 'coach-tuesday', client_ids: [one.record_id, two.record_id], status: 'planned',
  }));

  const set = await collectBackup(store, { taken_at: NOW });

  assert.equal(set.kinds.session.length, 1);
  assert.equal(set.kinds.session[0].record_id, session.record_id);
});

test('TOMBSTONES ARE IN THE BACKUP, or a restore resurrects everybody he removed', async () => {
  const store = await aStore();
  const leaving = await store.create('client', aClient({ name: 'Leaving Fixture' }));
  await store.tombstone('client', leaving.record_id);

  const set = await collectBackup(store, { taken_at: NOW });
  const held = set.kinds.client.find((record) => record.record_id === leaving.record_id);

  assert.ok(held, 'the deletion is a record, and a backup that dropped it would undo it');
  assert.equal(held.deleted, true);
});

test('the instant is the CALLER\'S, so two backups of one practice differ only where the practice does', async () => {
  const store = await aStore();
  await store.create('client', aClient());

  await assert.rejects(() => collectBackup(store, /** @type {any} */ ({})), TypeError);

  const set = await collectBackup(store, { taken_at: NOW });
  assert.equal(set.taken_at, NOW);
  assert.equal(set.device, 'coach-laptop');
});
