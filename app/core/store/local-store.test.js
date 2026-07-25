/**
 * THE STORE'S BEHAVIOUR: what it accepts, what it refuses, and what it keeps.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  aClient, anExercise, aReading, aRoutine, aSealedValue, aSession, aPerformedRecord, T0, T1, T2,
} from '../model/fixtures.js';
import { ALL_ENCRYPTED_FIELD_NAMES, createEnvelope, reviseEnvelope } from '../model/model.js';
import { StoreConflictError, StoreNotFoundError, StoreValidationError } from './errors.js';
import {
  openLocalStore, participantRowsFor, PRUNES_UNREFERENCED_CONTENT, storesFor,
} from './local-store.js';
import { libraryPage } from './queries.js';
import { PARTICIPANTS_STORE, RECORD_STORES, schemaCoverage } from './schema.js';
import { createLaptop } from './testing/platform-double.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** A store on a fresh laptop. */
async function aStore(device = 'coach-laptop') {
  const { world, platform } = createLaptop();
  const store = await openLocalStore({ platform, device });
  return { world, platform, store };
}

test('every record kind in the model has a store, and every store belongs to a kind', () => {
  assert.deepEqual(schemaCoverage(), { missingStores: [], orphanStores: [] });
});

test('a record is written, read back whole, and revised', async () => {
  const { store } = await aStore();

  const created = await store.create('client', aClient({ name: 'Ana Example' }));
  assert.equal(created.rev, 1);
  assert.equal(created.device, 'coach-laptop');

  const read = await store.get('client', created.record_id);
  assert.deepEqual(read.content, aClient({ name: 'Ana Example' }));

  const revised = await store.update('client', created.record_id, (content) => ({
    ...content, notes: 'Prefers mornings.',
  }));
  assert.equal(revised.rev, 2);
  assert.equal(revised.created_at, created.created_at, 'identity and creation survive a revision');
  assert.equal(revised.content.notes, 'Prefers mornings.');

  await store.close();
});

test('an invalid record is refused before anything is written, with the field-level issues', async () => {
  const { store } = await aStore();

  await assert.rejects(() => store.create('client', aClient({ email: 'a@b.c' })), (error) => {
    assert.ok(error instanceof StoreValidationError);
    assert.ok(error.issues.some((i) => i.code === 'MINIMISATION'),
      'a client email is refused by name — data never collected cannot leak');
    return true;
  });

  await assert.rejects(() => store.create('client', aClient({ name: '' })), (error) => {
    assert.ok(error.issues.some((i) => i.path === 'content.name'));
    return true;
  });

  assert.equal(await store.count('client'), 0, 'a refused write leaves nothing behind');
  await store.close();
});

test('a revision that moved underneath an edit is a CONFLICT, not a silent overwrite', async () => {
  const { store } = await aStore();
  const created = await store.create('client', aClient());

  // Two windows both read revision 1. The first writes.
  await store.update('client', created.record_id, (c) => ({ ...c, notes: 'first' }), { expectRev: 1 });

  // The second still believes it is editing revision 1.
  await assert.rejects(
    () => store.update('client', created.record_id, (c) => ({ ...c, notes: 'second' }), { expectRev: 1 }),
    (error) => {
      assert.ok(error instanceof StoreConflictError);
      assert.equal(error.detail.actual_rev, 2);
      return true;
    },
  );

  const stored = await store.get('client', created.record_id);
  assert.equal(stored.content.notes, 'first', 'the first write is not lost');
  await store.close();
});

test('a tombstone drops the content, so a departed client note cannot live inside it', async () => {
  const { store } = await aStore();
  const created = await store.create('client', aClient({
    clinical_note: aSealedValue(),
    clinical_reference: aSealedValue('cG9pbnRlcg=='),
    clinical_reference_label: aSealedValue('bGFiZWw='),
  }));

  const dead = await store.tombstone('client', created.record_id);
  assert.equal(dead.deleted, true);
  assert.equal(dead.content, null, 'a tombstone carries no payload at all');
  assert.equal(dead.rev, 2, 'a deletion is a revision, so it propagates rather than reappearing');

  await assert.rejects(() => store.update('client', created.record_id, (c) => c), StoreNotFoundError);
  await store.close();
});

test('ciphertext is carried through untouched and never inspected', async () => {
  const { store } = await aStore();
  const sealed = {
    clinical_note: aSealedValue('c2VhbGVkLW5vdGU='),
    clinical_reference: aSealedValue('c2VhbGVkLXBvaW50ZXI='),
    clinical_reference_label: aSealedValue('c2VhbGVkLWxhYmVs'),
  };
  const created = await store.create('client', aClient(sealed));
  const read = await store.get('client', created.record_id);

  assert.deepEqual(read.content.clinical_note, sealed.clinical_note);
  assert.deepEqual(read.content.clinical_reference, sealed.clinical_reference);
  assert.deepEqual(read.content.clinical_reference_label, sealed.clinical_reference_label);
  await store.close();
});

test('plaintext in a sealed field is refused at the store boundary too', async () => {
  const { store } = await aStore();
  await assert.rejects(
    () => store.create('client', aClient({ clinical_note: 'torn meniscus, see letter' })),
    (error) => {
      assert.ok(error.issues.some((i) => i.code === 'PLAINTEXT_IN_SEALED_FIELD'));
      return true;
    },
  );
  await store.close();
});

test('no file in this package names a ciphertext-bearing field', () => {
  // The store moves sealed values without being able to read one, and this is how that claim is
  // checked rather than promised: if a module here started special-casing the clinical note, it
  // would have to name it.
  const files = [];
  const collect = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { collect(join(dir, entry.name)); continue; }
      if (!entry.name.endsWith('.js')) continue;
      if (entry.name.endsWith('.test.js')) continue;
      files.push(join(dir, entry.name));
    }
  };
  collect(HERE);

  const offenders = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const field of ALL_ENCRYPTED_FIELD_NAMES) {
      if (text.includes(field)) offenders.push(`${file} mentions ${field}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('a library record is addressed by content key, and the key is unique within its kind', async () => {
  const { store } = await aStore();
  await store.create('exercise', anExercise({ id: 'goblet-squat', name: 'Goblet Squat' }));

  const found = await store.getByContentKey('exercise', 'goblet-squat');
  assert.equal(found.content.name, 'Goblet Squat');

  await assert.rejects(
    () => store.create('exercise', anExercise({ id: 'goblet-squat', name: 'Goblet Squat Two' })),
    StoreConflictError,
  );

  await assert.rejects(() => store.getByContentKey('client', 'x'), /addressed by identity/,
    'an app-authored record has no content key, and asking for one is a mistake worth naming');
  await store.close();
});

test('the seed import lands in one transaction and prunes NOTHING', async () => {
  const { store } = await aStore();

  // A catalogue that deliberately exceeds the routines that reference it. The surplus IS the
  // substitution pool, and an importer that tidied it away would delete exactly what the coach
  // needs when a client is tired.
  const referenced = anExercise({ id: 'push-up', name: 'Push Up' });
  const surplus = [
    anExercise({ id: 'knee-push-up', name: 'Knee Push Up' }),
    anExercise({ id: 'band-press', name: 'Band Press', equipment: ['resistance-band'] }),
  ];
  const routine = aRoutine({ id: 'push-day', entries: [{ exercise_id: 'push-up' }] });

  const records = [referenced, ...surplus].map((content) => createEnvelope({
    type: 'exercise', content, device: 'coach-laptop', now: T0,
  }));
  records.push(createEnvelope({ type: 'routine', content: routine, device: 'coach-laptop', now: T0 }));

  const result = await store.importRecords(records);
  assert.deepEqual(result, { written: 4, skipped: 0 });

  assert.equal(PRUNES_UNREFERENCED_CONTENT, false,
    'a declared value, not a missing check: unreferenced content is NORMAL and pruning it is a defect');

  const catalogue = await libraryPage(store, 'exercise', { limit: 50 });
  assert.deepEqual(catalogue.items.map((r) => r.content.id).sort(),
    ['band-press', 'knee-push-up', 'push-up'],
    'every catalogue entry survives import, including the ones no routine names');

  // Re-importing the same set changes nothing, and still removes nothing.
  const again = await store.importRecords(records);
  assert.deepEqual(again, { written: 0, skipped: 4 });
  assert.equal(await store.count('exercise'), 3);
  await store.close();
});

test('an import is all or nothing', async () => {
  const { store } = await aStore();
  const good = createEnvelope({ type: 'exercise', content: anExercise({ id: 'a-lift' }), device: 'coach-laptop' });
  const bad = createEnvelope({ type: 'routine', content: aRoutine({ entries: [] }), device: 'coach-laptop' });

  await assert.rejects(() => store.importRecords([good, bad]), StoreValidationError);
  assert.equal(await store.count('exercise'), 0,
    'a routine that could not be written must not leave the exercises half-imported');
  await store.close();
});

test('a record from elsewhere is applied under the model last-write-wins rule', async () => {
  const { store } = await aStore();
  const mine = await store.create('client', aClient({ name: 'Ana Example' }), { now: T0 });

  const theirs = reviseEnvelope(mine, { ...mine.content, notes: 'from the phone' },
    { device: 'coach-phone', now: T1 });
  const applied = await store.putRecord(theirs);
  assert.equal(applied.applied, true);
  assert.equal((await store.get('client', mine.record_id)).content.notes, 'from the phone');

  // An older revision arriving late does not undo the newer one.
  const stale = reviseEnvelope(mine, { ...mine.content, notes: 'stale' }, { device: 'coach-phone', now: T0 });
  const rejected = await store.putRecord(stale);
  assert.equal(rejected.applied, false);
  assert.equal((await store.get('client', mine.record_id)).content.notes, 'from the phone');
  await store.close();
});

test('a session write rebuilds its derived participant rows in the SAME transaction', async () => {
  const { store } = await aStore();
  const ana = await store.create('client', aClient({ name: 'Ana Example' }));
  const bo = await store.create('client', aClient({ name: 'Bo Example' }));

  const session = await store.create('session', aSession({
    client_ids: [ana.record_id, bo.record_id], scheduled_at: T1,
  }));

  const rows = await store.read(PARTICIPANTS_STORE, (scope) => scope.page({
    store: PARTICIPANTS_STORE, limit: 50,
  }));
  assert.equal(rows.items.length, 2);
  assert.deepEqual(rows.items.map((r) => r.client_id).sort(), [ana.record_id, bo.record_id].sort());
  assert.ok(rows.items.every((r) => r.sort_at === T1 && r.session_record_id === session.record_id));

  // Removing an attendee removes their row; nothing has to remember to do it separately.
  await store.update('session', session.record_id, (c) => ({ ...c, client_ids: [ana.record_id] }));
  const after = await store.read(PARTICIPANTS_STORE, (scope) => scope.page({
    store: PARTICIPANTS_STORE, limit: 50,
  }));
  assert.deepEqual(after.items.map((r) => r.client_id), [ana.record_id]);

  // And a tombstoned session leaves none at all.
  await store.tombstone('session', session.record_id);
  const gone = await store.read(PARTICIPANTS_STORE, (scope) => scope.page({
    store: PARTICIPANTS_STORE, limit: 50,
  }));
  assert.deepEqual(gone.items, []);

  await store.close();
});

test('the participants store is always in scope for a session write, so it cannot be written alone', () => {
  assert.deepEqual(storesFor('session'), [RECORD_STORES.session, PARTICIPANTS_STORE]);
  assert.deepEqual(storesFor('reading'), [RECORD_STORES.reading, RECORD_STORES.session]);
  assert.deepEqual(storesFor('client'), [RECORD_STORES.client]);
});

test('the participant sort key falls back so a session never vanishes from a history', () => {
  const base = createEnvelope({
    type: 'session', content: aSession(), device: 'coach-laptop', now: T0, record_id: 'r',
  });

  assert.equal(participantRowsFor(base)[0].sort_at, T0, 'falls back to when the record was created');
  assert.equal(participantRowsFor({ ...base, content: { ...base.content, scheduled_at: T1 } })[0].sort_at, T1);
  assert.equal(
    participantRowsFor({ ...base, content: { ...base.content, scheduled_at: T1, started_at: T2 } })[0].sort_at,
    T2,
    'when it actually started wins over when it was planned',
  );
  assert.deepEqual(participantRowsFor({ ...base, deleted: true, content: null }), []);
});

test('a small named value round-trips through the meta store', async () => {
  const { store } = await aStore();
  assert.equal(await store.getMeta('install-id'), undefined);
  await store.setMeta('install-id', 'abc');
  assert.equal(await store.getMeta('install-id'), 'abc');
  await store.close();
});

test('a performed record keeps the one place an observed load may be recorded', async () => {
  const { store } = await aStore();
  const client = await store.create('client', aClient());
  const session = await store.create('session', aSession({ client_ids: [client.record_id] }));

  const performed = await store.create('performed-record', aPerformedRecord({
    session_id: session.record_id, client_id: client.record_id, observed_load: '20kg',
  }));
  assert.equal(performed.content.observed_load, '20kg');

  // And the library still refuses one.
  await assert.rejects(
    () => store.create('exercise', anExercise({ load_kg: 40 })),
    (error) => {
      assert.ok(error.issues.some((i) => i.code === 'FORBIDDEN_LOAD' || i.code === 'UNKNOWN_FIELD'));
      return true;
    },
  );
  await store.close();
});

test('a reading is refused for an unknown record type', async () => {
  const { store } = await aStore();
  await assert.rejects(() => store.create('not-a-kind', {}), /is not a record type/);
  await store.close();
});

test('a closed store refuses to read or write rather than half-working', async () => {
  const { store } = await aStore();
  await store.close();
  await assert.rejects(() => store.get('client', 'x'), /closed/);
  await assert.rejects(() => store.create('client', aClient()), /closed/);
});
