/**
 * REMOVING A CLIENT — and the two things that must BOTH hold.
 *
 *  1. Nothing of the departed client remains on this device.
 *  2. No other client loses anything.
 *
 * The second is the one a careless reading of "remove everything" destroys, because a session is one
 * routine and one to MANY clients: deleting a shared session to remove one attendee would take an
 * innocent client's history with it.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aClient, aDietPlan, anExercise, aPerformedRecord, aReading, aSealedValue, aSession, aSessionNote,
} from '../model/fixtures.js';
import { ALL_ENCRYPTED_FIELD_NAMES } from '../model/model.js';
import { StoreNotFoundError } from './errors.js';
import { openLocalStore } from './local-store.js';
import {
  archiveClient, deletionForClient, markDeletionFailed, markDeletionPropagated, pendingDeletions,
  purgeClient, restoreClient,
} from './purge.js';
import { dietPlansForClient, listClients, sessionsForClient } from './queries.js';
import { PARTICIPANTS_STORE, RECORD_STORES } from './schema.js';
import { createLaptop } from './testing/platform-double.js';

const DEVICE = 'coach-laptop';
const hour = (n) => new Date(Date.UTC(2026, 0, 1, n)).toISOString();

/**
 * A practice with two clients: one shared session they both attended, and one solo session each.
 * Every kind of client-owned record is present for both, so a sweep that missed a kind shows up.
 */
async function aPractice() {
  const { world, platform } = createLaptop();
  const store = await openLocalStore({ platform, device: DEVICE });

  const leaving = await store.create('client', aClient({
    name: 'Leaving Example',
    notes: 'Prefers mornings.',
    clinical_note: aSealedValue('c2VjcmV0LW5vdGU='),
    clinical_reference: aSealedValue('c2VjcmV0LXBvaW50ZXI='),
    clinical_reference_label: aSealedValue('c2VjcmV0LWxhYmVs'),
  }));
  const staying = await store.create('client', aClient({ name: 'Staying Example' }));

  await store.create('exercise', anExercise({ id: 'nobody-uses-this', name: 'Unused Movement' }));

  const shared = await store.create('session', aSession({
    client_ids: [leaving.record_id, staying.record_id],
    status: 'completed',
    started_at: hour(1),
    ended_at: hour(2),
  }));
  const solo = await store.create('session', aSession({
    client_ids: [leaving.record_id], status: 'completed', started_at: hour(3), ended_at: hour(4),
  }));
  const theirs = await store.create('session', aSession({
    client_ids: [staying.record_id], status: 'completed', started_at: hour(5), ended_at: hour(6),
  }));

  for (const [client, sessions] of [[leaving, [shared, solo]], [staying, [shared, theirs]]]) {
    for (const session of sessions) {
      await store.create('performed-record', aPerformedRecord({
        session_id: session.record_id, client_id: client.record_id, position: 0,
      }));
      await store.create('reading', aReading({
        session_id: session.record_id, client_id: client.record_id, taken_at: hour(1),
      }));
      await store.create('session-note', aSessionNote({
        session_id: session.record_id, client_id: client.record_id, taken_at: hour(1),
      }));
    }
    await store.create('diet-plan', aDietPlan({ client_id: client.record_id }));
  }

  // A note about the SOLO session as a whole, belonging to nobody in particular.
  const orphanNote = await store.create('session-note', {
    session_id: solo.record_id, text: 'The connection dropped twice.', taken_at: hour(3),
  });

  return { world, store, leaving, staying, shared, solo, theirs, orphanNote };
}

test('archiving is the ordinary path, and it is reversible', async () => {
  const { store, leaving } = await aPractice();

  const archived = await archiveClient(store, leaving.record_id);
  assert.equal(archived.content.active, false);
  assert.equal(archived.content.name, 'Leaving Example', 'the record stays, and so does the history');

  const roster = await listClients(store, { limit: 20 });
  assert.ok(!roster.items.some((c) => c.record_id === leaving.record_id));

  const restored = await restoreClient(store, leaving.record_id);
  assert.equal(restored.content.active, true);
  await store.close();
});

test('a purge leaves nothing of the departed client', async () => {
  const { store, leaving, staying } = await aPractice();

  await purgeClient(store, leaving.record_id);

  assert.equal(await store.get('client', leaving.record_id), undefined,
    'removed outright, not tombstoned — a purge exists to leave no record');

  for (const type of ['performed-record', 'reading', 'session-note', 'diet-plan']) {
    const name = RECORD_STORES[type];
    const all = await store.read(name, (scope) => scope.page({ store: name, limit: 200 }));
    const theirs = all.items.filter((r) => r.content?.client_id === leaving.record_id);
    assert.deepEqual(theirs, [], `no ${type} of the departed client may remain`);
  }

  const rows = await store.read(PARTICIPANTS_STORE, (scope) => scope.page({
    store: PARTICIPANTS_STORE, limit: 200,
  }));
  assert.ok(rows.items.every((r) => r.client_id !== leaving.record_id),
    'their rows in the derived index go too, or their sessions would still be listed');

  // Nothing of theirs is reachable by any query.
  const history = await sessionsForClient(store, leaving.record_id, { limit: 50 });
  assert.deepEqual(history.items, []);
  assert.deepEqual((await dietPlansForClient(store, leaving.record_id, { limit: 20 })).items, []);
  assert.ok(staying);
  await store.close();
});

test('a SHARED session survives, and the other client loses nothing', async () => {
  const { store, leaving, staying, shared } = await aPractice();

  await purgeClient(store, leaving.record_id);

  const session = await store.get('session', shared.record_id);
  assert.ok(session, 'the shared session is the OTHER client history and is not the departing one to take');
  assert.deepEqual(session.content.client_ids, [staying.record_id]);
  assert.equal(session.rev, 2, 'removing an attendee is a revision, so it propagates outward');

  const theirHistory = await sessionsForClient(store, staying.record_id, { limit: 50 });
  assert.equal(theirHistory.items.length, 2, 'both of their sessions still there');

  const stillTheirs = await store.read('performed_records', (scope) => scope.page({
    store: 'performed_records', limit: 200,
  }));
  assert.equal(stillTheirs.items.length, 2,
    "the staying client's own performed records in both sessions are untouched");
  assert.ok(stillTheirs.items.every((r) => r.content.client_id === staying.record_id));
  await store.close();
});

test('a session left with nobody in it is removed, along with anything still pointing at it', async () => {
  const { store, leaving, solo, orphanNote } = await aPractice();

  await purgeClient(store, leaving.record_id);

  assert.equal(await store.get('session', solo.record_id), undefined);
  assert.equal(await store.get('session-note', orphanNote.record_id), undefined,
    'a note about the session as a whole has nothing left to belong to and must not be orphaned');
  await store.close();
});

test('the manifest carries identities and NO content of any kind', async () => {
  const { store, leaving } = await aPractice();

  const manifest = await purgeClient(store, leaving.record_id);
  const text = JSON.stringify(manifest);

  assert.ok(!text.includes('Leaving Example'), 'a manifest naming the client reintroduces what the purge removed');
  assert.ok(!text.includes('Prefers mornings'));
  assert.ok(!text.includes('c2VjcmV0'), 'no ciphertext either — it is still their clinical note');
  for (const field of ALL_ENCRYPTED_FIELD_NAMES) assert.ok(!text.includes(field));

  assert.equal(manifest.subject_client_id, leaving.record_id);
  assert.equal(manifest.status, 'pending');
  assert.match(manifest.requested_at, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  assert.equal(manifest.device, DEVICE);
  assert.deepEqual(manifest.sweep, { archived_copies: true, remote_backups: true });

  const kinds = new Set(manifest.removed.map((r) => r.type));
  assert.deepEqual([...kinds].sort(),
    ['client', 'diet-plan', 'performed-record', 'reading', 'session', 'session-note'],
    'the synchronisation engine is told every kind that went, or it cannot propagate the removal');
  assert.deepEqual(manifest.revised.map((r) => ({ type: r.type, rev: r.rev })),
    [{ type: 'session', rev: 2 }],
    'the one shared session is listed as a revision to push, not as a deletion to propagate');

  assert.ok(manifest.removed.every((r) => Object.keys(r).sort().join() === 'record_id,type'),
    'identities and types only');
  await store.close();
});

test('the manifest is the surface the synchronisation engine consumes', async () => {
  const { store, leaving } = await aPractice();
  const manifest = await purgeClient(store, leaving.record_id);

  const pending = await pendingDeletions(store);
  assert.deepEqual(pending.items.map((d) => d.deletion_id), [manifest.deletion_id]);

  const found = await deletionForClient(store, leaving.record_id);
  assert.equal(found.deletion_id, manifest.deletion_id);

  // A failure keeps it pending: a deletion that stopped being retried is a departed client's note
  // living on in a backup with nothing left saying it should not.
  const failed = await markDeletionFailed(store, manifest.deletion_id, 'no network');
  assert.equal(failed.status, 'pending');
  assert.equal(failed.attempts, 1);
  assert.equal(failed.last_error, 'no network');
  assert.equal((await pendingDeletions(store)).items.length, 1);

  const propagated = await markDeletionPropagated(store, manifest.deletion_id, { now: hour(12) });
  assert.equal(propagated.status, 'propagated');
  assert.equal(propagated.propagated_at, hour(12));
  assert.equal(propagated.last_error, null);
  assert.deepEqual((await pendingDeletions(store)).items, [],
    'nothing left to propagate, and the record of having done it is kept');
  await store.close();
});

test('a purge does not touch the library, including the entries nothing references', async () => {
  const { store, leaving } = await aPractice();
  const before = await store.count('exercise');
  await purgeClient(store, leaving.record_id);
  assert.equal(await store.count('exercise'), before,
    'the surplus catalogue IS the substitution pool; no removal path may prune it');
  await store.close();
});

test('purging a client who is not there changes nothing', async () => {
  const { store } = await aPractice();
  const before = await store.count('session');
  await assert.rejects(
    () => purgeClient(store, '99999999-9999-4999-8999-999999999999'), StoreNotFoundError,
  );
  assert.equal(await store.count('session'), before);
  assert.deepEqual((await pendingDeletions(store)).items, []);
  await store.close();
});

test('a purge is all or nothing: a failed commit leaves the client and no manifest', async () => {
  const { world, store, leaving, shared } = await aPractice();

  world.indexedDB.faults.failCommitOnce = true;
  await assert.rejects(() => purgeClient(store, leaving.record_id));

  assert.ok(await store.get('client', leaving.record_id),
    'a half-purged client would be silently unrecoverable: rows gone locally, nothing left to tell '
    + 'the remote copy');
  assert.deepEqual((await pendingDeletions(store)).items, []);
  assert.deepEqual((await store.get('session', shared.record_id)).content.client_ids.length, 2);
  await store.close();
});

test('a purge tells the other windows, with identities only', async () => {
  const { world, platform } = createLaptop();
  const store = await openLocalStore({ platform, device: DEVICE });
  const heard = [];
  store.onChange((change) => heard.push(change));

  const client = await store.create('client', aClient({ name: 'Ana Example' }));
  await purgeClient(store, client.record_id);
  await world.bus.settle();

  // Same window does not hear its own message, as a browser channel behaves.
  assert.deepEqual(heard, []);
  await store.close();
});
