/**
 * A RETRY AFTER A LOST ACKNOWLEDGEMENT MUST NOT DUPLICATE THE RECORD.
 *
 * ## How the lost acknowledgement is reproduced, and why not with a timeout
 *
 * The dangerous state is: the remote accepted the write, and this device never recorded that it did.
 * The double CANNOT produce that state through its own adversity — its failures are raised before the
 * write is applied, so a timed-out create genuinely did not land. **That is an unfaithfulness of the
 * double, and it is declared here as data rather than left as an absent check**, because reality's
 * timeout is exactly the one whose outcome is unknown.
 *
 * So these tests produce the state directly and honestly: the delivery is performed against the
 * remote, and the local half is then thrown away — the tab is killed before the verdict commits, which
 * is the real sequence rather than a simulation of it. The entry is still pending, the file is already
 * there, and the replay has to work that out for itself.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { SPACES, bytesToText } from '../remote/remote.js';
import { STATUS, keyedName } from './entry.js';
import { flushOutbox } from './flush.js';
import { queueBackup, queueRemoval, queueUpdate } from './enqueue.js';
import { countByStatus, entriesByStatus, getEntry } from './queue.js';
import { SURFACED_NEVER_GUESSED, recognise } from './recognition.js';
import { T0, aDevice, restart } from './testing.js';

/**
 * The double's own limit, stated as a value so it cannot quietly become a comment someone deletes.
 * A double kinder than reality moves the failure somewhere more expensive; saying where it is kinder
 * is the next best thing to being faithful.
 */
export const DOUBLE_CANNOT_PRODUCE_A_LANDED_TIMEOUT = true;

test('A CREATE WHOSE ACKNOWLEDGEMENT WAS LOST IS RECOGNISED ON REPLAY, AND DOES NOT DUPLICATE', async () => {
  const dev = await aDevice();
  const { entry } = await queueBackup(dev.store, {
    space: SPACES.VISIBLE, baseName: 'library.json', payload: '{"exercises":2}',
    label: 'backup of the exercise library', idempotencyKey: 'key-lost-ack', now: dev.now(),
  });

  // The write lands remotely...
  await dev.remote.create(SPACES.VISIBLE, { name: entry.name, content: entry.payload });
  // ...and the tab is killed before the verdict can be written. The entry is still pending.
  await restart(dev);
  assert.equal((await getEntry(dev.store, entry.entry_id)).status, STATUS.PENDING);

  const report = await flushOutbox(dev.store, dev.remote, { now: dev.now() });

  assert.equal(report.already_landed, 1, 'the replay recognised its own earlier write');
  assert.equal(report.delivered, 1);
  const listing = await dev.remote.list(SPACES.VISIBLE);
  assert.equal(listing.length, 1, 'ONE file, not two — this is the whole claim');
  assert.equal(bytesToText((await dev.remote.read(listing[0].file_id)).content), '{"exercises":2}');

  const settled = await getEntry(dev.store, entry.entry_id);
  assert.equal(settled.status, STATUS.DELIVERED);
  assert.equal(settled.result_meta.file_id, listing[0].file_id, 'and it recorded WHICH file is its own');
  assert.match(settled.delivery_note, /already exists|earlier attempt/i);
  await dev.store.close();
});

test('recognition is by the key inside the name, so a different delivery of the same kind is not mistaken for it', async () => {
  const dev = await aDevice();
  const mine = await queueBackup(dev.store, {
    space: SPACES.VISIBLE, baseName: 'library.json', payload: '{"mine":true}',
    label: 'my backup', idempotencyKey: 'key-mine', now: dev.now(),
  });

  // Someone else's backup, same base name, different delivery. It must NOT be adopted as ours.
  await dev.remote.create(SPACES.VISIBLE, {
    name: keyedName('library.json', 'key-theirs'), content: '{"theirs":true}',
  });

  const known = await recognise(dev.remote, mine.entry);
  assert.equal(known.verdict, 'not_landed');

  await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  const listing = await dev.remote.list(SPACES.VISIBLE);
  assert.equal(listing.length, 2, 'ours was written; theirs was left alone');
  await dev.store.close();
});

test('a longer name that merely STARTS with ours is not our delivery', async () => {
  const dev = await aDevice();
  const { entry } = await queueBackup(dev.store, {
    space: SPACES.VISIBLE, baseName: 'library', payload: '{}', label: 'backup',
    idempotencyKey: 'key-prefix', now: dev.now(),
  });
  // A listing can only be narrowed by name PREFIX, so this is what a careless exact-match would adopt.
  await dev.remote.create(SPACES.VISIBLE, { name: `${entry.name}.old`, content: '{}' });

  const known = await recognise(dev.remote, entry);
  assert.equal(known.verdict, 'not_landed', 'a prefix match is not a match');
  await dev.store.close();
});

test('enqueueing the same idempotency key twice does not queue it twice', async () => {
  const dev = await aDevice();
  const first = await queueBackup(dev.store, {
    space: SPACES.VISIBLE, baseName: 'library.json', payload: '{"v":1}',
    label: 'backup', idempotencyKey: 'key-stable', now: dev.now(),
  });
  const second = await queueBackup(dev.store, {
    space: SPACES.VISIBLE, baseName: 'library.json', payload: '{"v":2}',
    label: 'backup again', idempotencyKey: 'key-stable', now: dev.now(),
  });

  assert.equal(first.queued, true);
  assert.equal(second.queued, false, 'the second call found the first entry rather than adding one');
  assert.equal(second.entry.entry_id, first.entry.entry_id);
  assert.equal(await countByStatus(dev.store, STATUS.PENDING), 1);

  // And it still holds only once after delivery, so a retry loop above cannot resurrect it.
  await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  const third = await queueBackup(dev.store, {
    space: SPACES.VISIBLE, baseName: 'library.json', payload: '{"v":3}',
    label: 'backup a third time', idempotencyKey: 'key-stable', now: dev.now(),
  });
  assert.equal(third.queued, false);
  assert.equal(third.entry.status, STATUS.DELIVERED);
  assert.equal((await dev.remote.list(SPACES.VISIBLE)).length, 1);
  await dev.store.close();
});

test('MORE THAN ONE FILE ANSWERING TO ONE NAME IS SURFACED, NEVER RESOLVED BY GUESSING', async () => {
  // The third case, and the one nobody has on their list. It is proven reachable on the real service:
  // two devices created a key envelope under one name in about fifteen minutes of ordinary use, and
  // the space listed both with no error. The double reproduces it exactly.
  const dev = await aDevice();
  const { entry } = await queueBackup(dev.store, {
    space: SPACES.HIDDEN, baseName: 'envelope.json', payload: '{"envelope":1}',
    label: 'the key envelope', idempotencyKey: 'key-split', now: dev.now(),
  });

  await dev.remote.create(SPACES.HIDDEN, { name: entry.name, content: '{"envelope":1}' });
  await dev.remote.create(SPACES.HIDDEN, { name: entry.name, content: '{"envelope":1}' });

  const report = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(report.ambiguous, 1);
  assert.equal(report.delivered, 0);
  assert.equal(report.needs_attention, 1);

  const settled = await getEntry(dev.store, entry.entry_id);
  assert.equal(settled.status, STATUS.AMBIGUOUS);
  assert.equal(settled.ambiguity.length, 2, 'both identifiers are kept, so a person can look at both');
  assert.match(settled.last_error.message, /does not enforce unique names|resolved by a person/i);

  assert.equal((await dev.remote.list(SPACES.HIDDEN)).length, 2, 'and it did not add a THIRD');
  assert.equal(SURFACED_NEVER_GUESSED, true);

  // It is stopped: a further flush does not quietly try again.
  const again = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(again.attempted, 0);
  assert.equal(again.needs_attention, 1, 'and it stays visible');
  await dev.store.close();
});

test('an update whose acknowledgement was lost is recognised by reading the bytes back', async () => {
  const dev = await aDevice();
  const created = await dev.remote.create(SPACES.VISIBLE, { name: 'library.json', content: '{"v":1}' });

  const { entry } = await queueUpdate(dev.store, {
    fileId: created.file_id, space: SPACES.VISIBLE, payload: '{"v":2}',
    label: 'update of the exercise library', expectedRevision: created.revision, now: dev.now(),
  });

  // It lands; the acknowledgement is lost.
  await dev.remote.overwrite(created.file_id, '{"v":2}');
  await restart(dev);

  const report = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(report.already_landed, 1);

  const after = await dev.remote.stat(created.file_id);
  assert.equal(after.revision, 2, 'it was NOT written a second time');
  assert.equal((await getEntry(dev.store, entry.entry_id)).status, STATUS.DELIVERED);
  await dev.store.close();
});

test('an update whose target moved under it is surfaced as a conflict, never blindly overwritten', async () => {
  const dev = await aDevice();
  const created = await dev.remote.create(SPACES.VISIBLE, { name: 'library.json', content: '{"v":1}' });
  const { entry } = await queueUpdate(dev.store, {
    fileId: created.file_id, space: SPACES.VISIBLE, payload: '{"v":2,"mine":true}',
    label: 'update of the exercise library', expectedRevision: created.revision, now: dev.now(),
  });

  // The other device writes while ours is queued. There is no conditional-match facility, so this is
  // DETECTION and nothing else — but an unreported conflict is a lost edit whichever way it faces.
  await dev.remote.overwrite(created.file_id, '{"v":2,"theirs":true}');

  const report = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(report.ambiguous, 1);
  assert.equal(bytesToText((await dev.remote.read(created.file_id)).content), '{"v":2,"theirs":true}',
    "the other device's write was not discarded");

  const settled = await getEntry(dev.store, entry.entry_id);
  assert.equal(settled.status, STATUS.AMBIGUOUS);
  assert.equal(settled.payload, '{"v":2,"mine":true}', 'and OUR edit is still here to be re-applied');
  assert.match(settled.last_error.message, /revision/i);
  await dev.store.close();
});

test('an unconditional update is delivered without a conflict check, because that is what it asked for', async () => {
  const dev = await aDevice();
  const created = await dev.remote.create(SPACES.VISIBLE, { name: 'sole-author.json', content: '{"v":1}' });
  await queueUpdate(dev.store, {
    fileId: created.file_id, space: SPACES.VISIBLE, payload: '{"v":2}',
    label: 'update of a file only this device writes', now: dev.now(),
  });

  const report = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(report.delivered, 1);
  assert.equal(bytesToText((await dev.remote.read(created.file_id)).content), '{"v":2}');
  await dev.store.close();
});

test('a removal replayed after a lost acknowledgement is satisfied by the file already being gone', async () => {
  const dev = await aDevice();
  const created = await dev.remote.create(SPACES.VISIBLE, { name: 'departed-client.json', content: '{}' });
  const { entry } = await queueRemoval(dev.store, {
    fileId: created.file_id, space: SPACES.VISIBLE,
    label: 'removal of a departed client from the backup', idempotencyKey: created.file_id, now: dev.now(),
  });

  await dev.remote.remove(created.file_id);
  await restart(dev);

  const report = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(report.delivered, 1, 'already gone IS the outcome asked for');
  assert.equal(report.rejected, 0, 'and it is NOT reported as a refusal');
  assert.equal((await getEntry(dev.store, entry.entry_id)).status, STATUS.DELIVERED);
  await dev.store.close();
});

test('an update whose target has been removed elsewhere is surfaced rather than recreating it', async () => {
  const dev = await aDevice();
  const created = await dev.remote.create(SPACES.VISIBLE, { name: 'library.json', content: '{"v":1}' });
  await queueUpdate(dev.store, {
    fileId: created.file_id, space: SPACES.VISIBLE, payload: '{"v":2}',
    label: 'update of the exercise library', now: dev.now(),
  });
  await dev.remote.remove(created.file_id);

  const report = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(report.ambiguous, 1);
  assert.equal((await dev.remote.list(SPACES.VISIBLE)).length, 0, 'a deliberate removal was not undone');

  const settled = (await entriesByStatus(dev.store, STATUS.AMBIGUOUS)).items[0];
  assert.match(settled.last_error.message, /no longer exists|removed on another device/i);
  await dev.store.close();
});

test('the double is kinder than reality about timeouts, and that is recorded rather than hidden', async () => {
  const dev = await aDevice();
  await queueBackup(dev.store, {
    space: SPACES.VISIBLE, baseName: 'library.json', payload: '{}', label: 'backup', now: dev.now(),
  });
  dev.adversity.setLatency(45_000);

  await flushOutbox(dev.store, dev.remote, { now: dev.now(), timeoutMs: 30_000 });

  dev.adversity.clear();
  assert.equal((await dev.remote.list(SPACES.VISIBLE)).length, 0,
    'the double raises its timeout BEFORE applying the write, so nothing landed');
  assert.equal(DOUBLE_CANNOT_PRODUCE_A_LANDED_TIMEOUT, true,
    'reality can time out AFTER landing; that case is proved by the lost-acknowledgement tests above');
  await dev.store.close();
});
