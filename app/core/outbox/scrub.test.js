/**
 * TAKING A DEPARTED CLIENT OUT OF THE QUEUE — the boundaries of it.
 *
 * The end-to-end proof that a purged client's name and notes are gone from every entry lives in
 * `core/sync/purge-outbox.test.js`, because it needs a synchronisation pass to put them there. What
 * is proven HERE is the part that turns a fix into a new defect: what the sweep refuses to touch,
 * what it removes outright, and the one case it declines to decide silently.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { aClient, aReading, aSession } from '../model/fixtures.js';
import { openLocalStore } from '../store/local-store.js';
import { purgeClient } from '../store/purge.js';
import { createLaptop } from '../store/testing/platform-double.js';
import { PAYLOAD, UNRESOLVED, readPayload, scrubDocument } from './scrub.js';
import { queueBackup, queueRemoval } from './enqueue.js';
import { getEntry } from './queue.js';

const DEVICE = 'coach-laptop';
const SPACE = 'visible';

/** A device with two clients, one shared session, and a reading each. */
async function aPractice() {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: DEVICE });

  const departing = await store.create('client', aClient({ name: 'Departing Example' }));
  const staying = await store.create('client', aClient({ name: 'Staying Example' }));
  const shared = await store.create('session', aSession({
    client_ids: [departing.record_id, staying.record_id], status: 'completed',
    started_at: '2026-01-01T01:00:00.000Z', ended_at: '2026-01-01T02:00:00.000Z',
  }));
  const theirReading = await store.create('reading', aReading({
    client_id: departing.record_id, session_id: shared.record_id,
  }));
  return { store, departing, staying, shared, theirReading };
}

/** A document of the shape the synchronisation engine queues. */
const aDocument = (records) => ({
  document_version: 1, kind: 'push', device: DEVICE, written_at: '2026-01-01T00:00:00.000Z',
  cursor: null, records, purges: [],
});

test('outbox/scrub — a payload is only ever parsed far enough to see whether it is ours', () => {
  assert.equal(readPayload(null).kind, PAYLOAD.NONE);
  assert.equal(readPayload(JSON.stringify(aDocument([]))).kind, PAYLOAD.DOCUMENT);

  // Not JSON at all, JSON that is not an object, and JSON that is an object but not one of ours:
  // all opaque, and nothing further is read from any of them.
  assert.equal(readPayload('not json at all').kind, PAYLOAD.OPAQUE);
  assert.equal(readPayload('[1,2,3]').kind, PAYLOAD.OPAQUE);
  assert.equal(readPayload(JSON.stringify({ scheme: 1, iv: 'MTIzNDU2Nzg5MDEy', ct: 'Y2lwaGVy' })).kind,
    PAYLOAD.OPAQUE);
  assert.equal(readPayload(JSON.stringify({ document_version: 1 })).kind, PAYLOAD.OPAQUE);
});

test('outbox/scrub — a shared session is REPLACED by the revision, not dropped', () => {
  const them = 'the-departing-client';
  const shared = {
    record_id: 'shared-session', type: 'session', rev: 3,
    content: { client_ids: [them, 'the-staying-client'] },
  };
  const revision = {
    record_id: 'shared-session', type: 'session', rev: 4,
    content: { client_ids: ['the-staying-client'] },
  };
  const theirs = { record_id: 'their-reading', type: 'reading', rev: 1, content: { client_id: them } };
  const other = { record_id: 'other-reading', type: 'reading', rev: 1, content: { client_id: 'the-staying-client' } };

  const result = scrubDocument(aDocument([shared, theirs, other]), {
    clientId: them,
    removedIds: new Set(['their-reading']),
    revised: new Map([['shared-session', revision]]),
  });

  assert.equal(result.changed, true);
  assert.deepEqual(result.dropped, ['their-reading']);
  assert.deepEqual(result.replaced, ['shared-session']);
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(result.document.records.map((r) => r.record_id), ['shared-session', 'other-reading']);
  assert.equal(result.document.records[0].rev, 4, 'the queued copy is the revision, not the old one');
  assert.deepEqual(result.document.records[1], other, 'another client’s record was altered');
});

test('outbox/scrub — a session naming them with no revision to replace it is reported, not silently dropped', () => {
  const them = 'the-departing-client';
  const orphan = {
    record_id: 'a-session', type: 'session', rev: 2, content: { client_ids: [them, 'somebody-else'] },
  };
  const result = scrubDocument(aDocument([orphan]), {
    clientId: them, removedIds: new Set(), revised: new Map(),
  });

  assert.deepEqual(result.dropped, ['a-session']);
  assert.deepEqual(result.unresolved, ['a-session']);
});

test('outbox/scrub — an entry holding nothing of theirs is not rewritten at all', async (t) => {
  const practice = await aPractice();
  t.after(() => practice.store.close());

  const { entry } = await queueBackup(practice.store, {
    space: SPACE,
    baseName: 'library-backup.json',
    payload: JSON.stringify(aDocument([{
      record_id: 'an-exercise', type: 'exercise', rev: 1, content: { id: 'push-up' },
    }])),
    label: 'backup of the exercise library',
    refs: ['an-exercise'],
  });

  await purgeClient(practice.store, practice.departing.record_id);

  const after = await getEntry(practice.store, entry.entry_id);
  assert.deepEqual(after, entry, 'an entry that holds nothing of theirs was rewritten anyway');
});

test('outbox/scrub — a removal carries no content, so it is left exactly as it is', async (t) => {
  const practice = await aPractice();
  t.after(() => practice.store.close());

  const { entry } = await queueRemoval(practice.store, {
    fileId: 'an-earlier-file', space: SPACE, label: 'an earlier copy, now replaced',
    idempotencyKey: 'remove:an-earlier-file',
  });

  await purgeClient(practice.store, practice.departing.record_id);

  assert.deepEqual(await getEntry(practice.store, entry.entry_id), entry);
});

test('outbox/scrub — an opaque payload that is ONLY theirs is removed outright', async (t) => {
  const practice = await aPractice();
  t.after(() => practice.store.close());

  // Not one of our documents: it cannot be cleaned record by record. Everything it is about is
  // theirs, so removing it destroys nobody else's data and is the only cleaning available.
  const { entry } = await queueBackup(practice.store, {
    space: SPACE,
    baseName: 'an-export.bin',
    payload: 'not one of our documents',
    label: 'an export',
    refs: [practice.departing.record_id, practice.theirReading.record_id],
  });

  const manifest = await purgeClient(practice.store, practice.departing.record_id);

  assert.equal(await getEntry(practice.store, entry.entry_id), undefined);
  assert.equal(manifest.outbox.removed, 1);
  assert.deepEqual(manifest.outbox.unresolved, []);
});

test('outbox/scrub — an opaque payload shared with another client is LEFT ALONE and said out loud', async (t) => {
  const practice = await aPractice();
  t.after(() => practice.store.close());

  const { entry } = await queueBackup(practice.store, {
    space: SPACE,
    baseName: 'an-export.bin',
    payload: 'not one of our documents',
    label: 'an export',
    refs: [practice.departing.record_id, practice.staying.record_id],
  });

  const manifest = await purgeClient(practice.store, practice.departing.record_id);

  // Cleaning it would destroy the staying client's data and we cannot see inside it. Neither answer
  // is ours to choose quietly, so the entry stands and the purge reports it by identity.
  assert.deepEqual(await getEntry(practice.store, entry.entry_id), entry);
  assert.equal(manifest.outbox.removed, 0);
  assert.deepEqual(manifest.outbox.unresolved, [{
    entry_id: entry.entry_id,
    why: UNRESOLVED.OPAQUE_SHARED,
    record_ids: [practice.departing.record_id],
  }]);
});

test('outbox/scrub — what the sweep reports carries identities and counts, never content', async (t) => {
  const practice = await aPractice();
  t.after(() => practice.store.close());

  await queueBackup(practice.store, {
    space: SPACE,
    baseName: 'push.json',
    payload: JSON.stringify(aDocument([
      { ...practice.departing }, { ...practice.staying }, { ...practice.shared },
    ])),
    label: 'a push',
    refs: [practice.departing.record_id, practice.staying.record_id, practice.shared.record_id],
  });

  const manifest = await purgeClient(practice.store, practice.departing.record_id);
  const text = JSON.stringify(manifest);

  assert.ok(!text.includes('Departing Example'), 'the manifest reintroduced the name the purge removed');
  assert.ok(!text.includes('Staying Example'));
  assert.equal(manifest.outbox.rewritten, 1);
  assert.ok(manifest.outbox.inspected >= 1);
});
