/**
 * THE DOUBLE'S ORDINARY BEHAVIOUR — the six operations, the two spaces, and the boundaries.
 *
 * The measured quirks live in `quirks.test.js`; this file covers everything that is supposed
 * to work normally, so that a change breaking the mundane path is caught here rather than
 * being mistaken for a fidelity problem there.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryRemoteStorage } from './memory-remote.js';
import {
  SPACES, RemoteFileNotFound, RemoteInvalidRequest, RemoteStoragePort, bytesToText, textToBytes,
} from './port.js';
import { manualClock } from './clock.js';

const aStore = (opts = {}) => new InMemoryRemoteStorage({ clock: manualClock(), ...opts });

test('the double IS the port, so anything holding a port can hold this', () => {
  assert.ok(aStore() instanceof RemoteStoragePort);
});

test('a created file can be read back, complete and byte-identical', async () => {
  const remote = aStore();
  const meta = await remote.create(SPACES.VISIBLE, { name: 'backup.json', content: '{"a":1}' });

  assert.equal(meta.space, SPACES.VISIBLE);
  assert.equal(meta.name, 'backup.json');
  assert.equal(meta.revision, 1, 'a new file starts at revision one');
  assert.equal(meta.size, 7);
  assert.ok(meta.file_id);

  const read = await remote.read(meta.file_id);
  assert.equal(bytesToText(read.content), '{"a":1}');
  assert.deepEqual(read.meta, meta);
});

test('binary content survives the round trip untouched', async () => {
  const remote = aStore();
  const bytes = new Uint8Array([0, 1, 254, 255, 128]);
  const meta = await remote.create(SPACES.HIDDEN, { name: 'sealed', content: bytes });
  const read = await remote.read(meta.file_id);
  assert.deepEqual(read.content, bytes);
  assert.equal(read.meta.size, 5);
});

test('what a caller mutates afterwards does not reach the store, in either direction', async () => {
  // A real remote copy is bytes that left this machine. Neither the array handed in nor the
  // array handed back is a live reference into it, and a test that relied on one being live
  // would be relying on something the real service could never do.
  const remote = aStore();
  const source = new Uint8Array([1, 2, 3]);
  const meta = await remote.create(SPACES.HIDDEN, { name: 'sealed', content: source });

  source[0] = 99;
  const first = await remote.read(meta.file_id);
  assert.equal(first.content[0], 1, 'mutating the input must not change what was stored');

  first.content[0] = 42;
  const second = await remote.read(meta.file_id);
  assert.equal(second.content[0], 1, 'mutating the output must not change what was stored');
});

test('overwrite produces a new revision and a new modification time', async () => {
  const clock = manualClock();
  const remote = new InMemoryRemoteStorage({ clock });
  const created = await remote.create(SPACES.VISIBLE, { name: 'backup.json', content: 'first' });

  clock.advance(60_000);
  const updated = await remote.overwrite(created.file_id, 'second');

  assert.equal(updated.file_id, created.file_id, 'the identity survives a rewrite');
  assert.equal(updated.revision, 2);
  assert.notEqual(updated.modified_at, created.modified_at);
  assert.equal(bytesToText((await remote.read(created.file_id)).content), 'second');
});

test('a metadata reading is a snapshot — it does not change under the holder', async () => {
  // This is what makes read-compare-write detection possible at all: the metadata a caller
  // read earlier keeps saying what was true earlier.
  const remote = aStore();
  const created = await remote.create(SPACES.VISIBLE, { name: 'backup.json', content: 'first' });
  await remote.overwrite(created.file_id, 'second');
  assert.equal(created.revision, 1, 'the earlier reading still reports the earlier revision');
});

test('stat returns the same metadata as read, without the payload', async () => {
  const remote = aStore();
  const created = await remote.create(SPACES.VISIBLE, { name: 'backup.json', content: 'x' });
  const read = await remote.read(created.file_id);
  const stat = await remote.stat(created.file_id);
  assert.deepEqual(stat, read.meta);
});

test('remove makes the identifier stop resolving, on every operation that takes one', async () => {
  const remote = aStore();
  const created = await remote.create(SPACES.VISIBLE, { name: 'backup.json', content: 'x' });
  await remote.remove(created.file_id);

  await assert.rejects(() => remote.read(created.file_id), RemoteFileNotFound);
  await assert.rejects(() => remote.stat(created.file_id), RemoteFileNotFound);
  await assert.rejects(() => remote.overwrite(created.file_id, 'y'), RemoteFileNotFound);
  await assert.rejects(() => remote.remove(created.file_id), RemoteFileNotFound);
  assert.equal((await remote.list(SPACES.VISIBLE)).length, 0);
});

test('deleting one file leaves its same-named sibling alone', async () => {
  // Deletion is by identifier, never by name — which is the only safe way to delete anything
  // in a store where a name can address more than one file.
  const remote = aStore();
  const first = await remote.create(SPACES.HIDDEN, { name: 'key-envelope.json', content: 'a' });
  const second = await remote.create(SPACES.HIDDEN, { name: 'key-envelope.json', content: 'b' });

  await remote.remove(first.file_id);

  const left = await remote.list(SPACES.HIDDEN);
  assert.equal(left.length, 1);
  assert.equal(left[0].file_id, second.file_id);
  assert.equal(bytesToText((await remote.read(second.file_id)).content), 'b');
});

test('listing returns creation order, metadata only, and can be narrowed by name prefix', async () => {
  const remote = aStore();
  await remote.create(SPACES.VISIBLE, { name: 'backup-2026-07-01.json', content: 'a' });
  await remote.create(SPACES.VISIBLE, { name: 'backup-2026-07-02.json', content: 'b' });
  await remote.create(SPACES.VISIBLE, { name: 'report.csv', content: 'c' });

  const all = await remote.list(SPACES.VISIBLE);
  assert.deepEqual(all.map((m) => m.name),
    ['backup-2026-07-01.json', 'backup-2026-07-02.json', 'report.csv']);
  assert.equal(Object.prototype.hasOwnProperty.call(all[0], 'content'), false,
    'listing never carries payloads — a backup history would be dragged down with it');

  const backups = await remote.list(SPACES.VISIBLE, { namePrefix: 'backup-' });
  assert.equal(backups.length, 2);
  assert.equal((await remote.list(SPACES.VISIBLE, { namePrefix: 'nothing' })).length, 0);
});

test('an empty space lists as empty rather than failing', async () => {
  const remote = aStore();
  assert.deepEqual(await remote.list(SPACES.HIDDEN), []);
});

test('identifiers are global: a file is read by identifier without naming its space', async () => {
  const remote = aStore();
  const hidden = await remote.create(SPACES.HIDDEN, { name: 'k', content: 'secret' });
  const read = await remote.read(hidden.file_id);
  assert.equal(read.meta.space, SPACES.HIDDEN, 'the space comes back with the file, and is not asked for');
});

test('modification times are in the one canonical form the rest of the app writes', async () => {
  const remote = new InMemoryRemoteStorage({ clock: manualClock('2026-07-25T09:30:00.000Z') });
  const created = await remote.create(SPACES.VISIBLE, { name: 'backup.json', content: 'x' });
  assert.equal(created.modified_at, '2026-07-25T09:30:00.000Z');
});

test('a malformed request is refused at the boundary, before any call is attempted', async () => {
  const remote = aStore();
  await assert.rejects(() => remote.create('elsewhere', { name: 'x', content: 'y' }), RemoteInvalidRequest);
  await assert.rejects(() => remote.create(SPACES.VISIBLE, { name: '', content: 'y' }), RemoteInvalidRequest);
  await assert.rejects(() => remote.create(SPACES.VISIBLE, { name: 'x', content: 42 }), RemoteInvalidRequest);
  await assert.rejects(() => remote.create(SPACES.VISIBLE, null), RemoteInvalidRequest);
  await assert.rejects(() => remote.read(''), RemoteInvalidRequest);
  await assert.rejects(() => remote.list(SPACES.VISIBLE, { namePrefix: 7 }), RemoteInvalidRequest);
  await assert.rejects(() => remote.stat('x', { timeoutMs: 0 }), RemoteInvalidRequest);
});

test('a refused request leaves nothing behind', async () => {
  const remote = aStore();
  await assert.rejects(() => remote.create(SPACES.VISIBLE, { name: '', content: 'y' }), RemoteInvalidRequest);
  assert.equal((await remote.list(SPACES.VISIBLE)).length, 0);
});

test('text content is encoded the same way the rest of the app encodes it', async () => {
  const remote = aStore();
  const created = await remote.create(SPACES.VISIBLE, { name: 'n', content: 'café — ok' });
  const read = await remote.read(created.file_id);
  assert.deepEqual(read.content, textToBytes('café — ok'));
  assert.equal(read.meta.size, textToBytes('café — ok').byteLength,
    'size is bytes, not characters — a caller sizing a payload must not be misled');
});
