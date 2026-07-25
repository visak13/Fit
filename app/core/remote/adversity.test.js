/**
 * DELIBERATE ADVERSITY — the three failures, and why they must stay three.
 *
 * The outbox and the sync engine are built to survive failure. A component built to survive
 * failure that has only ever been driven through success has been demonstrated, not tested.
 * These tests prove the double can produce each failure on demand, and — more importantly —
 * that the three stay distinguishable, because each one demands a different response:
 *
 *   a failing call     → keep the work and retry later. Nothing needs the user.
 *   an expired credential → keep the work and ASK THE USER TO TAP. Retrying alone never helps.
 *   a slow call        → the outcome is UNKNOWN. A write that timed out may have landed.
 *
 * Collapsing them into "it failed" is how an application retries forever against a dead
 * credential behind a spinner that can never resolve.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryRemoteStorage } from './memory-remote.js';
import { Adversity } from './adversity.js';
import {
  SPACES, RemoteCredentialExpired, RemoteTimeout, RemoteUnavailable, RemoteInvalidRequest,
  bytesToText,
} from './port.js';
import { manualClock } from './clock.js';

function aStore(start) {
  const clock = manualClock(start);
  return { remote: new InMemoryRemoteStorage({ clock }), clock };
}

// ═══════════════════════════════════════════════════════════════════════════════
// A failing call
// ═══════════════════════════════════════════════════════════════════════════════

test('an armed failure fires once, and the work SURVIVES to land on the retry', async () => {
  // Counted rather than permanent, because the interesting proof is that the second attempt
  // works. A permanently broken service only proves nothing crashed.
  const { remote } = aStore();
  remote.adversity.failNext(1);

  await assert.rejects(
    () => remote.create(SPACES.VISIBLE, { name: 'backup.json', content: 'x' }),
    (err) => {
      assert.ok(err instanceof RemoteUnavailable);
      assert.equal(err.retryable, true);
      assert.equal(err.needsReauth, false, 'a transient outage must never send the user to re-authorise');
      return true;
    },
  );

  const created = await remote.create(SPACES.VISIBLE, { name: 'backup.json', content: 'x' });
  assert.equal(bytesToText((await remote.read(created.file_id)).content), 'x');
});

test('a failed call changes nothing — the store is exactly as it was', async () => {
  const { remote } = aStore();
  const created = await remote.create(SPACES.VISIBLE, { name: 'backup.json', content: 'original' });

  remote.adversity.failNext(1);
  await assert.rejects(() => remote.overwrite(created.file_id, 'never landed'), RemoteUnavailable);

  const after = await remote.read(created.file_id);
  assert.equal(bytesToText(after.content), 'original');
  assert.equal(after.meta.revision, 1, 'a refused write must not consume a revision');
});

test('failures can be aimed at ONE operation, so a test can break the write and keep the check', async () => {
  const { remote } = aStore();
  const created = await remote.create(SPACES.VISIBLE, { name: 'backup.json', content: 'original' });

  remote.adversity.failNext(3, { operation: 'overwrite' });
  await assert.rejects(() => remote.overwrite(created.file_id, 'a'), RemoteUnavailable);

  // Reading still works, which is what lets a test verify the damage the write did not do.
  assert.equal(bytesToText((await remote.read(created.file_id)).content), 'original');
  assert.equal(remote.adversity.pendingFailures, 2);
});

test('an armed count is consumed exactly, then the service is well again', async () => {
  const { remote } = aStore();
  remote.adversity.failNext(2);
  assert.equal(remote.adversity.pendingFailures, 2);

  await assert.rejects(() => remote.list(SPACES.VISIBLE), RemoteUnavailable);
  await assert.rejects(() => remote.list(SPACES.VISIBLE), RemoteUnavailable);
  assert.deepEqual(await remote.list(SPACES.VISIBLE), []);
  assert.equal(remote.adversity.pendingFailures, 0);
});

test('a different failure can be supplied when a test needs a specific one', async () => {
  const { remote } = aStore();
  remote.adversity.failNext(1, { error: () => new RemoteCredentialExpired() });
  await assert.rejects(() => remote.list(SPACES.VISIBLE), RemoteCredentialExpired);
});

// ═══════════════════════════════════════════════════════════════════════════════
// An expired credential
// ═══════════════════════════════════════════════════════════════════════════════

test('an expired credential fails every call until the user re-authorises', async () => {
  const { remote } = aStore();
  const created = await remote.create(SPACES.VISIBLE, { name: 'backup.json', content: 'original' });

  remote.adversity.expireCredential();
  assert.equal(remote.adversity.credentialExpired, true);

  for (const call of [
    () => remote.list(SPACES.VISIBLE),
    () => remote.create(SPACES.VISIBLE, { name: 'n', content: 'c' }),
    () => remote.read(created.file_id),
    () => remote.overwrite(created.file_id, 'c'),
    () => remote.stat(created.file_id),
    () => remote.remove(created.file_id),
  ]) {
    await assert.rejects(call, (err) => {
      assert.ok(err instanceof RemoteCredentialExpired);
      assert.equal(err.needsReauth, true, 'the caller must be told a gesture is required, not just that it failed');
      assert.equal(err.retryable, true, 'it CAN succeed later — but only after the user acts');
      return true;
    });
  }

  // Nothing was lost while the credential was dead.
  remote.adversity.renewCredential();
  assert.equal(bytesToText((await remote.read(created.file_id)).content), 'original');
});

test('a dead credential does not consume an armed failure, because the call never got that far', async () => {
  const { remote } = aStore();
  remote.adversity.failNext(1).expireCredential();

  await assert.rejects(() => remote.list(SPACES.VISIBLE), RemoteCredentialExpired);
  assert.equal(remote.adversity.pendingFailures, 1, 'the queued failure is still waiting');

  remote.adversity.renewCredential();
  await assert.rejects(() => remote.list(SPACES.VISIBLE), RemoteUnavailable);
});

// ═══════════════════════════════════════════════════════════════════════════════
// A slow call
// ═══════════════════════════════════════════════════════════════════════════════

test('a call slower than its deadline times out, and says the outcome is unknown', async () => {
  const { remote } = aStore();
  remote.adversity.setLatency(45_000);

  await assert.rejects(
    () => remote.create(SPACES.VISIBLE, { name: 'backup.json', content: 'x' }, { timeoutMs: 30_000 }),
    (err) => {
      assert.ok(err instanceof RemoteTimeout);
      assert.equal(err.operation, 'create');
      assert.equal(err.timeoutMs, 30_000);
      assert.equal(err.retryable, true);
      assert.match(err.message, /outcome is unknown/);
      return true;
    },
  );
});

test('a call slower than the deadline burns exactly the deadline, not the whole latency', async () => {
  // Virtual time, so a forty-five second call costs this test nothing. The assertion is that
  // the caller gives up ON TIME rather than waiting out a slow service it already abandoned.
  const { remote, clock } = aStore('2026-07-25T00:00:00.000Z');
  remote.adversity.setLatency(45_000);
  const before = clock.now();

  await assert.rejects(() => remote.list(SPACES.VISIBLE, { timeoutMs: 30_000 }), RemoteTimeout);
  assert.equal(clock.now() - before, 30_000);
});

test('a call slower than expected but INSIDE its deadline still succeeds', async () => {
  // The opposite mistake: an app that treats any non-instant call as a failure. Slow is not
  // broken, and a phone on a bad connection must not be told its data was lost.
  const { remote, clock } = aStore('2026-07-25T00:00:00.000Z');
  remote.adversity.setLatency(20_000);

  const created = await remote.create(SPACES.VISIBLE, { name: 'backup.json', content: 'x' }, { timeoutMs: 30_000 });
  assert.equal(created.revision, 1);
  assert.equal(clock.now() - new Date('2026-07-25T00:00:00.000Z').getTime(), 20_000);
});

test('the deadline is per call, so one slow operation can be tolerated while another is not', async () => {
  const { remote } = aStore();
  remote.adversity.setLatency(10_000);
  await remote.create(SPACES.VISIBLE, { name: 'backup.json', content: 'x' }, { timeoutMs: 60_000 });
  await assert.rejects(() => remote.list(SPACES.VISIBLE, { timeoutMs: 5_000 }), RemoteTimeout);
});

test('a timeout beats a dead credential, because no response ever arrived to reveal it', async () => {
  const { remote } = aStore();
  remote.adversity.setLatency(45_000).expireCredential().failNext(1);

  await assert.rejects(() => remote.list(SPACES.VISIBLE, { timeoutMs: 30_000 }), RemoteTimeout);
  assert.equal(remote.adversity.pendingFailures, 1, 'and it consumed no queued failure either');
});

// ═══════════════════════════════════════════════════════════════════════════════
// The switchboard itself
// ═══════════════════════════════════════════════════════════════════════════════

test('clear puts the service back to calm', async () => {
  const { remote } = aStore();
  remote.adversity.setLatency(45_000).expireCredential().failNext(3);
  remote.adversity.clear();

  assert.equal(remote.adversity.credentialExpired, false);
  assert.equal(remote.adversity.latencyMs, 0);
  assert.equal(remote.adversity.pendingFailures, 0);
  assert.deepEqual(await remote.list(SPACES.VISIBLE, { timeoutMs: 1 }), []);
});

test('the switchboard refuses nonsense settings rather than behaving strangely later', () => {
  const adversity = new Adversity();
  assert.throws(() => adversity.failNext(0), RemoteInvalidRequest);
  assert.throws(() => adversity.failNext(1.5), RemoteInvalidRequest);
  assert.throws(() => adversity.setLatency(-1), RemoteInvalidRequest);
  assert.throws(() => adversity.setLatency(Infinity), RemoteInvalidRequest);
});

test('a store can be handed its own switchboard, so a test can arm it before the first call', async () => {
  const adversity = new Adversity().expireCredential();
  const remote = new InMemoryRemoteStorage({ clock: manualClock(), adversity });
  await assert.rejects(() => remote.list(SPACES.VISIBLE), RemoteCredentialExpired);
  assert.equal(remote.adversity, adversity);
});
