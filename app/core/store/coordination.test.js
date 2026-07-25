/**
 * TWO WINDOWS ON ONE LAPTOP, sharing one database — simulated, not described.
 *
 * The requirement is real: the coach may have two windows open, each running a live session with a
 * different routine, against the same local database. Two properties have to hold and they are
 * different properties:
 *
 *  - **Per-session isolation.** One window per session, enforced. The other window is told so.
 *  - **No corruption.** Neither window can overwrite what the other wrote, whatever the timing.
 *
 * Every test here drives TWO stores over ONE database, one lock manager and one message bus, which is
 * what two windows of a browser share. Nothing is mocked at the store's own level: both windows are
 * the real store, and the concurrency they meet is the platform's.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { aClient, aPerformedRecord, aReading, aSession } from '../model/fixtures.js';
import { StoreConflictError, StoreLeaseError } from './errors.js';
import { openLocalStore } from './local-store.js';
import { createContext, createTwoWindowLaptop, settle } from './testing/platform-double.js';

/** Two windows of one browser, each with its own store over the shared database. */
async function twoWindows() {
  const { world, a, b } = createTwoWindowLaptop();
  const windowA = await openLocalStore({ platform: a, device: 'coach-laptop' });
  const windowB = await openLocalStore({ platform: b, device: 'coach-laptop' });
  return { world, windowA, windowB };
}

/** A live session in `owner`'s window, with two clients, and the lease held. */
async function aLiveSession(owner, { clients = 1 } = {}) {
  const ids = [];
  for (let i = 0; i < clients; i += 1) {
    const client = await owner.create('client', aClient({ name: `Client ${'ABCDEF'[i]} Example` }));
    ids.push(client.record_id);
  }
  const session = await owner.create('session', aSession({ client_ids: ids, status: 'planned' }));
  const lease = await owner.acquireSessionLease(session.record_id);
  await owner.update('session', session.record_id,
    (content) => ({ ...content, status: 'in_progress', started_at: '2026-07-25T10:00:00.000Z' }),
    { lease });
  return { session, lease, clientIds: ids };
}

test('both windows read the same database', async () => {
  const { windowA, windowB } = await twoWindows();
  const created = await windowA.create('client', aClient({ name: 'Ana Example' }));
  const seen = await windowB.get('client', created.record_id);
  assert.equal(seen.content.name, 'Ana Example');
  await windowA.close();
  await windowB.close();
});

test('one window per session: the second window is told, not silently let in', async () => {
  const { windowA, windowB } = await twoWindows();
  const { session } = await aLiveSession(windowA);

  const refused = await windowB.acquireSessionLease(session.record_id);
  assert.equal(refused, null,
    'the second window must learn the session is open elsewhere rather than wait on a spinner');

  await windowA.close();
  await windowB.close();
});

test('two live sessions at once, with different routines, one in each window', async () => {
  const { windowA, windowB } = await twoWindows();

  const first = await aLiveSession(windowA);
  const clientB = await windowB.create('client', aClient({ name: 'Bo Example' }));
  const secondSession = await windowB.create('session', aSession({
    client_ids: [clientB.record_id], routine_id: 'test-pull-day', status: 'planned',
  }));
  const secondLease = await windowB.acquireSessionLease(secondSession.record_id);

  assert.ok(secondLease, 'a different session is a different lease and is granted');
  assert.notEqual(first.session.content.routine_id, secondSession.content.routine_id);

  // Each window records into its own session, at the same time, without interfering.
  await windowA.create('performed-record', aPerformedRecord({
    session_id: first.session.record_id, client_id: first.clientIds[0], position: 0,
  }), { lease: first.lease });
  await windowB.create('performed-record', aPerformedRecord({
    session_id: secondSession.record_id, client_id: clientB.record_id, position: 0,
  }), { lease: secondLease });

  assert.equal(await windowA.count('performed-record'), 2);
  await windowA.close();
  await windowB.close();
});

test('a window without the lease cannot write into a live session', async () => {
  const { windowA, windowB } = await twoWindows();
  const { session, lease, clientIds } = await aLiveSession(windowA);

  const reading = aReading({ session_id: session.record_id, client_id: clientIds[0] });

  await assert.rejects(() => windowB.create('reading', reading), (error) => {
    assert.ok(error instanceof StoreLeaseError);
    assert.match(error.message, /not open in this window/);
    return true;
  });

  // Its own lease on a DIFFERENT session is no help either.
  const other = await windowB.create('session', aSession({ client_ids: clientIds, status: 'planned' }));
  const otherLease = await windowB.acquireSessionLease(other.record_id);
  await assert.rejects(() => windowB.create('reading', reading, { lease: otherLease }), StoreLeaseError);

  // The window that holds it can.
  const written = await windowA.create('reading', reading, { lease });
  assert.equal(written.content.session_id, session.record_id);
  await windowA.close();
  await windowB.close();
});

test('a window cannot START a session it does not hold', async () => {
  const { windowA, windowB } = await twoWindows();
  const client = await windowA.create('client', aClient({ name: 'Ana Example' }));
  const session = await windowA.create('session', aSession({
    client_ids: [client.record_id], status: 'planned',
  }));

  await assert.rejects(() => windowB.update('session', session.record_id,
    (c) => ({ ...c, status: 'in_progress', started_at: '2026-07-25T10:00:00.000Z' })), StoreLeaseError);

  const lease = await windowB.acquireSessionLease(session.record_id);
  const started = await windowB.update('session', session.record_id,
    (c) => ({ ...c, status: 'in_progress', started_at: '2026-07-25T10:00:00.000Z' }), { lease });
  assert.equal(started.content.status, 'in_progress');
  await windowA.close();
  await windowB.close();
});

test('a session that has finished is freely editable — the guard protects the LIVE case only', async () => {
  const { windowA, windowB } = await twoWindows();
  const { session, lease, clientIds } = await aLiveSession(windowA);

  await windowA.update('session', session.record_id, (c) => ({
    ...c, status: 'completed', ended_at: '2026-07-25T11:00:00.000Z',
  }), { lease });
  await lease.release();

  // Adding a note afterwards is ordinary work and needs no lease at all.
  const note = await windowB.create('session-note', {
    session_id: session.record_id,
    client_id: clientIds[0],
    text: 'Wrote this up after the call.',
    taken_at: '2026-07-25T11:30:00.000Z',
  });
  assert.ok(note.record_id);
  await windowA.close();
  await windowB.close();
});

test('releasing a lease hands the session to the other window', async () => {
  const { windowA, windowB } = await twoWindows();
  const { session, lease } = await aLiveSession(windowA);

  assert.equal(await windowB.acquireSessionLease(session.record_id), null);
  await lease.release();
  const now = await windowB.acquireSessionLease(session.record_id);
  assert.ok(now, 'a released session can be picked up in the other window');
  assert.equal(now.crossContext, true);
  await windowA.close();
  await windowB.close();
});

test('closing a window releases its leases, so a crash cannot lock the coach out', async () => {
  const { windowA, windowB } = await twoWindows();
  const { session } = await aLiveSession(windowA);
  assert.equal(await windowB.acquireSessionLease(session.record_id), null);

  await windowA.close();

  const taken = await windowB.acquireSessionLease(session.record_id);
  assert.ok(taken, 'the lease dies with the window holding it, as the platform lock does');
  await windowB.close();
});

test('CONCURRENT edits to one record cannot lose a write', async () => {
  const { windowA, windowB } = await twoWindows();
  const created = await windowA.create('client', aClient({ name: 'Ana Example', notes: '' }));

  // Both windows issue an edit at the same moment, each reading and writing inside its own
  // transaction. The platform serialises them, and `produce` runs on what is actually stored — so
  // the second edit composes with the first instead of overwriting it.
  const [first, second] = await Promise.all([
    windowA.update('client', created.record_id, (c) => ({ ...c, notes: `${c.notes}A` })),
    windowB.update('client', created.record_id, (c) => ({ ...c, notes: `${c.notes}B` })),
  ]);

  const stored = await windowA.get('client', created.record_id);
  assert.equal(stored.rev, 3, 'two edits, two revisions — neither was overwritten');
  assert.equal(stored.content.notes.length, 2);
  assert.deepEqual([...stored.content.notes].sort(), ['A', 'B'],
    'both windows edits survive, in whichever order the platform ran them');
  assert.notEqual(first.rev, second.rev);
  await windowA.close();
  await windowB.close();
});

test('a conditional edit that lost the race is a CONFLICT, and the winner stands', async () => {
  const { windowA, windowB } = await twoWindows();
  const created = await windowA.create('client', aClient({ name: 'Ana Example' }));

  // Both windows are showing revision 1 and each writes conditionally on it. One must fail.
  const results = await Promise.allSettled([
    windowA.update('client', created.record_id, (c) => ({ ...c, notes: 'from A' }), { expectRev: 1 }),
    windowB.update('client', created.record_id, (c) => ({ ...c, notes: 'from B' }), { expectRev: 1 }),
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].reason instanceof StoreConflictError,
    'the loser is told its revision moved, not quietly ignored');

  const stored = await windowA.get('client', created.record_id);
  assert.equal(stored.rev, 2);
  assert.equal(stored.content.notes, fulfilled[0].value.content.notes);
  await windowA.close();
  await windowB.close();
});

test('a change is announced to the other window only AFTER it has committed', async () => {
  const { world, windowA, windowB } = await twoWindows();

  /** @type {any[]} */
  const heard = [];
  windowB.onChange((change) => heard.push(change));

  const created = await windowA.create('client', aClient({ name: 'Ana Example' }));
  await world.bus.settle();

  assert.equal(heard.length, 1);
  assert.deepEqual(heard[0], {
    kind: 'put', type: 'client', record_id: created.record_id, rev: 1, device: 'coach-laptop',
  });
  assert.ok(await windowB.get('client', created.record_id),
    'by the time the other window hears about a write, the write is readable — it was committed first');

  // A write that failed to commit announces NOTHING. Telling the other window about a write that
  // vanished is an acknowledgement by another door.
  heard.length = 0;
  world.indexedDB.faults.failCommitOnce = true;
  await assert.rejects(() => windowA.create('client', aClient({ name: 'Bo Example' })));
  await world.bus.settle();
  assert.deepEqual(heard, []);

  await windowA.close();
  await windowB.close();
});

test('a browser with no lock manager degrades honestly rather than pretending', async () => {
  const { world, a } = createTwoWindowLaptop();
  const bare = createContext(world, { locks: false, broadcast: false });

  const store = await openLocalStore({ platform: bare, device: 'coach-laptop' });
  assert.equal(store.capabilities.crossContextCoordination.available, false);
  assert.equal(store.capabilities.concurrentSessions.available, false,
    'the interface is never invited into the unprotected situation in the first place');

  // A lease is still issued, and still says what it is: local to this window only.
  const client = await store.create('client', aClient({ name: 'Ana Example' }));
  const session = await store.create('session', aSession({ client_ids: [client.record_id] }));
  const lease = await store.acquireSessionLease(session.record_id);
  assert.equal(lease.crossContext, false, 'nothing pretends the lease holds against other windows');

  await store.close();
  assert.ok(a);
});
