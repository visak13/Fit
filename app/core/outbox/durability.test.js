/**
 * A DELAY, NEVER A LOSS.
 *
 * The four claims this package is answerable for, each proved against the state that would produce the
 * loss rather than against a service that behaves:
 *
 *  1. an entry survives the application being closed and reopened;
 *  2. an interrupted flush loses nothing;
 *  3. a credential that is dead, expired or absent delays the work and never destroys it;
 *  4. the queue is replayed in the order it was written.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { SPACES, bytesToText } from '../remote/remote.js';
import { HOLD, STATUS } from './entry.js';
import { flushOutbox } from './flush.js';
import { queueBackup } from './enqueue.js';
import { countByStatus, dueEntries, entriesByStatus, getEntry, releaseCredentialHolds } from './queue.js';
import { outboxStatus } from './status.js';
import { T0, aDevice, restart } from './testing.js';

/** Queue three backups, in a known order. */
async function queueThree(dev) {
  const one = await queueBackup(dev.store, {
    space: SPACES.VISIBLE, baseName: 'clients.json', payload: '{"clients":1}',
    label: 'backup of the client roster', idempotencyKey: 'key-one', now: dev.now(),
  });
  const two = await queueBackup(dev.store, {
    space: SPACES.VISIBLE, baseName: 'library.json', payload: '{"exercises":2}',
    label: 'backup of the exercise library', idempotencyKey: 'key-two', now: dev.now(),
  });
  const three = await queueBackup(dev.store, {
    space: SPACES.VISIBLE, baseName: 'sessions.json', payload: '{"sessions":3}',
    label: 'backup of this week of sessions', idempotencyKey: 'key-three', now: dev.now(),
  });
  return [one.entry, two.entry, three.entry];
}

test('an entry survives the application closing and opening again', async () => {
  const dev = await aDevice();
  const [first] = await queueThree(dev);
  assert.equal(first.seq, 1);
  assert.equal(first.status, STATUS.PENDING);

  // The tab is killed. Everything the running session knew is gone.
  await restart(dev);

  const revived = await getEntry(dev.store, first.entry_id);
  assert.ok(revived, 'the entry is still there after a restart');
  assert.equal(revived.payload, '{"clients":1}', 'and it still carries its own bytes');
  assert.equal(revived.label, 'backup of the client roster');
  assert.equal(revived.status, STATUS.PENDING);
  assert.equal(await countByStatus(dev.store, STATUS.PENDING), 3);

  // And a restarted application can deliver it without any memory of the session that queued it.
  const report = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(report.delivered, 3);
  assert.equal(report.remaining_undelivered, 0);

  const listing = await dev.remote.list(SPACES.VISIBLE);
  assert.equal(listing.length, 3);
  await dev.store.close();
});

test('the queue is replayed in the order it was written, across a restart', async () => {
  const dev = await aDevice();
  await queueThree(dev);
  await restart(dev);

  const delivered = [];
  await flushOutbox(dev.store, dev.remote, {
    now: dev.now(), onEntry: ({ entry }) => delivered.push(entry.label),
  });

  assert.deepEqual(delivered, [
    'backup of the client roster',
    'backup of the exercise library',
    'backup of this week of sessions',
  ]);
  await dev.store.close();
});

test('a sequence number is allocated once, and never reused, across restarts', async () => {
  const dev = await aDevice();
  const [, , third] = await queueThree(dev);
  assert.equal(third.seq, 3);

  await restart(dev);
  const { entry: fourth } = await queueBackup(dev.store, {
    space: SPACES.VISIBLE, baseName: 'diets.json', payload: '{}', label: 'backup of the diet plans',
    now: dev.now(),
  });
  assert.equal(fourth.seq, 4, 'the counter is durable, not a variable in a running session');
  await dev.store.close();
});

test('AN INTERRUPTED FLUSH LOSES NOTHING: what was not delivered is still pending afterwards', async () => {
  const dev = await aDevice();
  await queueThree(dev);

  // The platform kills the tab after the first delivery. This is the mobile backgrounding case, and it
  // is the one the queue exists to make harmless.
  const signal = { aborted: false };
  const report = await flushOutbox(dev.store, dev.remote, {
    now: dev.now(),
    signal,
    onEntry: () => { signal.aborted = true; },
  });

  assert.equal(report.interrupted, true);
  assert.equal(report.stopped_because, 'aborted');
  assert.equal(report.delivered, 1);
  assert.equal(report.remaining_pending, 2);

  // Nothing is lost, nothing is stuck: the two survivors are still PENDING, still due, still in order.
  await restart(dev);
  const status = await outboxStatus(dev.store, { now: dev.now() });
  assert.equal(status.pending, 2);
  assert.equal(status.needs_attention, 0);

  const due = await dueEntries(dev.store, { now: dev.now() });
  assert.deepEqual(due.items.map((e) => e.seq), [2, 3], 'still pending, still in order, nothing held');

  const finished = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(finished.delivered, 2);
  assert.equal(finished.remaining_undelivered, 0);

  const listing = await dev.remote.list(SPACES.VISIBLE);
  assert.equal(listing.length, 3, 'all three landed exactly once, across two flushes and a restart');
  await dev.store.close();
});

test('there is no in-flight state to get stuck in: an entry is pending until a verdict is written', async () => {
  const dev = await aDevice();
  await queueThree(dev);

  // A flush that dies inside the very first delivery, before any verdict can be recorded.
  const exploding = {
    list: async () => { throw new Error('the tab was killed mid-call'); },
  };
  await assert.rejects(() => flushOutbox(dev.store, /** @type {any} */ (exploding), { now: dev.now() }));

  await restart(dev);
  const all = await entriesByStatus(dev.store, STATUS.PENDING);
  assert.equal(all.items.length, 3);
  for (const entry of all.items) {
    assert.equal(entry.status, STATUS.PENDING);
    assert.equal(entry.hold, HOLD.NONE, 'nothing was held, nothing was half-settled');
    assert.equal(entry.attempts, 0, 'an attempt that never reached a verdict is not counted against it');
  }
  await dev.store.close();
});

test('AN EXPIRED CREDENTIAL IS A DELAY: the work waits, does not burn attempts, and lands after a renewal', async () => {
  const dev = await aDevice();
  await queueThree(dev);
  dev.adversity.expireCredential();

  const blocked = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(blocked.delivered, 0);
  assert.equal(blocked.attempted, 1, 'it stops at the first: nothing else could succeed either');
  assert.equal(blocked.stopped_because, 'credential_expired');
  assert.equal(blocked.remaining_pending, 3, 'nothing was lost and nothing was rejected');
  assert.equal(blocked.waiting_for_credential, 3,
    'a dead credential is a condition of the whole queue, so everything due joins the wait');

  // No attempt is burned on ANY of them: retrying alone can never renew a credential, and counting
  // these would push the delay of everything behind out into hours for a reason unrelated to the work.
  for (const entry of (await entriesByStatus(dev.store, STATUS.PENDING)).items) {
    assert.equal(entry.hold, HOLD.CREDENTIAL);
    assert.equal(entry.attempts, 0);
    assert.equal(entry.last_error.classification, 'credential');
  }

  // Held entries are not due on a timer, however long the coach waits.
  dev.advance(60 * 60_000);
  assert.equal((await dueEntries(dev.store, { now: dev.now() })).items.length, 0);
  const stillBlocked = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(stillBlocked.attempted, 0, 'and no further call is spent learning the same thing');
  assert.equal(stillBlocked.remaining_pending, 3);

  // The coach taps to reconnect. Everything held becomes due at once.
  dev.adversity.renewCredential();
  const released = await releaseCredentialHolds(dev.store, { now: dev.now() });
  assert.equal(released, 3);

  const after = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(after.delivered, 3);
  assert.equal(after.remaining_undelivered, 0);

  const listing = await dev.remote.list(SPACES.VISIBLE);
  const contents = [];
  for (const meta of listing) contents.push(bytesToText((await dev.remote.read(meta.file_id)).content));
  assert.deepEqual(contents.sort(), ['{"clients":1}', '{"exercises":2}', '{"sessions":3}']);
  await dev.store.close();
});

test('a transient failure retries with a GROWING delay, and the work is never touched', async () => {
  const dev = await aDevice();
  await queueBackup(dev.store, {
    space: SPACES.VISIBLE, baseName: 'clients.json', payload: '{"clients":1}',
    label: 'backup of the client roster', idempotencyKey: 'key-one', now: dev.now(),
  });

  dev.adversity.failNext(3, { operation: 'create' });

  const first = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(first.deferred, 1);
  assert.equal(first.remaining_pending, 1);

  const afterOne = (await entriesByStatus(dev.store, STATUS.PENDING)).items[0];
  assert.equal(afterOne.attempts, 1);
  assert.equal(afterOne.hold, HOLD.BACKOFF);
  assert.equal(afterOne.payload, '{"clients":1}', 'the work is untouched by the failure');
  const firstWait = Date.parse(afterOne.next_attempt_at) - Date.parse(dev.now());
  assert.ok(firstWait > 0);

  // Not due yet: a flush now does nothing at all rather than hammering the service.
  const tooSoon = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(tooSoon.attempted, 0);

  dev.advance(firstWait);
  await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  const afterTwo = (await entriesByStatus(dev.store, STATUS.PENDING)).items[0];
  assert.equal(afterTwo.attempts, 2);
  const secondWait = Date.parse(afterTwo.next_attempt_at) - Date.parse(dev.now());
  assert.ok(secondWait > firstWait, `the delay grows: ${firstWait} then ${secondWait}`);

  // The service comes back. The work is still there and lands.
  dev.advance(secondWait);
  dev.adversity.clear();
  const recovered = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(recovered.delivered, 1);
  assert.equal((await dev.remote.list(SPACES.VISIBLE)).length, 1);
  await dev.store.close();
});

test('a slow call that passes its deadline leaves the work pending, and its outcome is treated as unknown', async () => {
  const dev = await aDevice();
  await queueBackup(dev.store, {
    space: SPACES.VISIBLE, baseName: 'clients.json', payload: '{"clients":1}',
    label: 'backup of the client roster', now: dev.now(),
  });

  dev.adversity.setLatency(45_000);
  const report = await flushOutbox(dev.store, dev.remote, { now: dev.now(), timeoutMs: 30_000 });
  assert.equal(report.deferred, 1);
  assert.equal(report.remaining_pending, 1);

  const entry = (await entriesByStatus(dev.store, STATUS.PENDING)).items[0];
  assert.equal(entry.last_error.code, 'timeout');
  assert.equal(entry.last_error.classification, 'unknown_outcome');
  assert.notEqual(entry.status, STATUS.REJECTED, 'a deadline is not a refusal');
  await dev.store.close();
});

test('the entry that was queued is the entry that is delivered, byte for byte', async () => {
  const dev = await aDevice();
  const payload = '{"sealed":"AAECAwQFBgcICQ==","note":"carried, never inspected"}';
  await queueBackup(dev.store, {
    space: SPACES.HIDDEN, baseName: 'envelope.json', payload,
    label: 'the key envelope', now: dev.now(),
  });
  await restart(dev);
  await flushOutbox(dev.store, dev.remote, { now: dev.now() });

  const [meta] = await dev.remote.list(SPACES.HIDDEN);
  const file = await dev.remote.read(meta.file_id);
  assert.equal(bytesToText(file.content), payload);
  assert.equal(meta.space, SPACES.HIDDEN, 'and it went to the space it was addressed to');
  await dev.store.close();
});

test('nothing is enqueued before it is committed: the entry is readable the instant enqueue resolves', async () => {
  const dev = await aDevice();
  const { entry } = await queueBackup(dev.store, {
    space: SPACES.VISIBLE, baseName: 'clients.json', payload: '{}', label: 'backup', now: dev.now(),
  });

  // No settle, no wait: if enqueue resolved before the commit, this read would come back empty — which
  // is exactly how a queue tells the coach his work is safe and then loses it.
  const stored = await getEntry(dev.store, entry.entry_id);
  assert.ok(stored, 'a resolved enqueue is a committed enqueue');
  assert.equal(stored.seq, entry.seq);
  await dev.store.close();
});

test('a failed commit is loud, and the queue is unchanged by it', async () => {
  const dev = await aDevice();
  dev.world.indexedDB.faults.failCommitOnce = true;

  await assert.rejects(() => queueBackup(dev.store, {
    space: SPACES.VISIBLE, baseName: 'clients.json', payload: '{}', label: 'backup', now: dev.now(),
  }), (error) => {
    assert.match(error.message, /did not complete|not been saved|refused/i);
    return true;
  });

  assert.equal(await countByStatus(dev.store, STATUS.PENDING), 0, 'nothing half-written was left behind');
  await dev.store.close();
});
