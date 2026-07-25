/**
 * THE REJECTED ENTRY, AND THE FLUSH THAT MUST NEVER CLAIM TO HAVE SYNCHRONISED.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { RemoteInvalidRequest, SPACES } from '../remote/remote.js';
import { STATUS } from './entry.js';
import {
  FLUSH_MODE, STOPPED, claimsCompletedSync, flushBestEffort, flushOutbox, syncCompletionMarker,
} from './flush.js';
import { queueBackup } from './enqueue.js';
import { entriesByStatus, getEntry } from './queue.js';
import { outboxStatus } from './status.js';
import { aDevice, restart } from './testing.js';

/** Queue one backup and hand back its entry. */
async function queueOne(dev, overrides = {}) {
  const { entry } = await queueBackup(dev.store, {
    space: SPACES.VISIBLE, baseName: 'library.json', payload: '{"exercises":2}',
    label: 'backup of the exercise library', now: dev.now(), ...overrides,
  });
  return entry;
}

// ── a rejected entry stops, and is VISIBLE ────────────────────────────────────────────────────────

test('A REJECTED ENTRY STOPS AND IS SURFACED, rather than retrying forever in silence', async () => {
  const dev = await aDevice();
  const entry = await queueOne(dev);

  dev.adversity.failNext(1, { operation: 'create', error: () => new RemoteInvalidRequest('That name is not acceptable.') });

  const report = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(report.rejected, 1);
  assert.equal(report.delivered, 0);

  const settled = await getEntry(dev.store, entry.entry_id);
  assert.equal(settled.status, STATUS.REJECTED);
  assert.equal(settled.last_error.classification, 'rejected');
  assert.equal(settled.last_error.message, 'That name is not acceptable.', 'the reason is kept, specifically');

  // It STOPPED: no further attempt is made, however many flushes run and however much time passes.
  dev.adversity.clear();
  dev.advance(24 * 60 * 60_000);
  const again = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(again.attempted, 0);
  assert.equal((await dev.remote.list(SPACES.VISIBLE)).length, 0);

  // And the important half — it is VISIBLE. A silent stop is indistinguishable from a success, which
  // is the state this whole queue exists to prevent.
  const status = await outboxStatus(dev.store, { now: dev.now() });
  assert.equal(status.pending, 0);
  assert.equal(status.rejected, 1);
  assert.equal(status.needs_attention, 1);
  assert.equal(status.undelivered, 1, 'the data is NOT away, and the number says so');

  await restart(dev);
  const afterRestart = await outboxStatus(dev.store, { now: dev.now() });
  assert.equal(afterRestart.needs_attention, 1, 'and it survives a restart, so it cannot be waited out');
  await dev.store.close();
});

test('a rejection does not stop the entries behind it', async () => {
  const dev = await aDevice();
  await queueOne(dev, { baseName: 'first.json', label: 'first backup' });
  await queueOne(dev, { baseName: 'second.json', label: 'second backup' });

  dev.adversity.failNext(1, { operation: 'create', error: () => new RemoteInvalidRequest('no') });
  const report = await flushOutbox(dev.store, dev.remote, { now: dev.now() });

  assert.equal(report.rejected, 1);
  assert.equal(report.delivered, 1, 'the second one is unrelated and goes through');
  assert.equal(report.needs_attention, 1);
  await dev.store.close();
});

// ── the completed-synchronisation claim ───────────────────────────────────────────────────────────

test('a drained foreground flush is a completed synchronisation, and yields the marker', async () => {
  const dev = await aDevice();
  await queueOne(dev);

  const report = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(report.mode, FLUSH_MODE.FOREGROUND);
  assert.equal(report.stopped_because, STOPPED.DRAINED);
  assert.equal(report.remaining_undelivered, 0);
  assert.equal(claimsCompletedSync(report), true);
  assert.deepEqual(syncCompletionMarker(report), { completed_sync_at: report.finished_at });
  await dev.store.close();
});

test('A BEST-EFFORT FLUSH IS NEVER A COMPLETED SYNCHRONISATION, even when it delivers everything', async () => {
  const dev = await aDevice();
  await queueOne(dev);

  const report = await flushBestEffort(dev.store, dev.remote, { now: dev.now() });

  // It did the work — and still cannot claim it. The platform may kill this flush at any moment, and a
  // report that CAN say "synchronised" is a report that eventually says it after being killed.
  assert.equal(report.delivered, 1);
  assert.equal(report.remaining_undelivered, 0);
  assert.equal(report.stopped_because, STOPPED.DRAINED);
  assert.equal(report.interrupted, false);
  assert.equal(report.mode, FLUSH_MODE.BEST_EFFORT);
  assert.equal(claimsCompletedSync(report), false);
  assert.equal(syncCompletionMarker(report), null);
  await dev.store.close();
});

test('the mode cannot be promoted after the fact: the report is frozen', async () => {
  const dev = await aDevice();
  await queueOne(dev);
  const report = await flushBestEffort(dev.store, dev.remote, { now: dev.now() });

  assert.equal(Object.isFrozen(report), true);
  assert.throws(() => { /** @type {any} */ (report).mode = FLUSH_MODE.FOREGROUND; }, TypeError);
  assert.equal(report.mode, FLUSH_MODE.BEST_EFFORT);
  assert.equal(claimsCompletedSync(report), false);

  // And a hand-built copy claiming to be a foreground flush does not work either: the brand a real
  // flush attaches is a module-private symbol and is not enumerable, so it survives no copy.
  const forged = { ...report, mode: FLUSH_MODE.FOREGROUND, stopped_because: STOPPED.DRAINED };
  assert.equal(claimsCompletedSync(forged), false);
  assert.equal(syncCompletionMarker(forged), null);
  assert.equal(claimsCompletedSync(JSON.parse(JSON.stringify(report))), false);
  await dev.store.close();
});

test('a foreground report copied or rebuilt is not evidence: only the flush that ran can produce one', async () => {
  const dev = await aDevice();
  await queueOne(dev);
  const real = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(claimsCompletedSync(real), true);

  assert.equal(claimsCompletedSync({ ...real }), false, 'a spread loses the brand');
  assert.equal(claimsCompletedSync(Object.assign({}, real)), false);
  assert.equal(claimsCompletedSync(structuredClone(real)), false);
  await dev.store.close();
});

test('no report assembled by hand, in ANY state, can claim a completed synchronisation', async () => {
  // Enumerated rather than argued, and it covers the shape a defect would actually take: somewhere
  // above, a well-meaning caller composes an object that looks like a successful flush — from a
  // partial one, from a stored copy, from a best-effort attempt it decided was good enough — and
  // hands it to the marker. Every one of these is refused before a single counter is read.
  const base = {
    mode: FLUSH_MODE.BEST_EFFORT, started_at: 'a', finished_at: 'b', attempted: 0, delivered: 0,
    already_landed: 0, deferred: 0, waiting_for_credential: 0, rejected: 0, ambiguous: 0,
    remaining_pending: 0, needs_attention: 0, remaining_undelivered: 0,
    stopped_because: STOPPED.DRAINED, interrupted: false,
  };
  let combinations = 0;
  for (const interrupted of [true, false]) {
    for (const stopped_because of Object.values(STOPPED)) {
      for (const remaining_undelivered of [0, 1]) {
        for (const delivered of [0, 5]) {
          combinations += 1;
          const report = { ...base, interrupted, stopped_because, remaining_undelivered, delivered };
          assert.equal(claimsCompletedSync(report), false);
          assert.equal(syncCompletionMarker(report), null);
        }
      }
    }
  }
  assert.equal(combinations, 40, 'every combination was actually tried');
});

test('a foreground flush that did not drain the queue is not a completed synchronisation either', async () => {
  const dev = await aDevice();
  await queueOne(dev, { baseName: 'first.json' });
  await queueOne(dev, { baseName: 'second.json' });

  // Interrupted.
  const signal = { aborted: false };
  const interrupted = await flushOutbox(dev.store, dev.remote, {
    now: dev.now(), signal, onEntry: () => { signal.aborted = true; },
  });
  assert.equal(claimsCompletedSync(interrupted), false);
  assert.equal(syncCompletionMarker(interrupted), null);

  // Stopped on a credential.
  dev.adversity.expireCredential();
  const blocked = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(blocked.stopped_because, STOPPED.CREDENTIAL_EXPIRED);
  assert.equal(claimsCompletedSync(blocked), false);
  await dev.store.close();
});

test('a flush that delivered everything but left a REJECTED entry behind has not completed', async () => {
  const dev = await aDevice();
  await queueOne(dev, { baseName: 'first.json' });
  dev.adversity.failNext(1, { operation: 'create', error: () => new RemoteInvalidRequest('no') });
  await flushOutbox(dev.store, dev.remote, { now: dev.now() });

  await queueOne(dev, { baseName: 'second.json' });
  const report = await flushOutbox(dev.store, dev.remote, { now: dev.now() });

  assert.equal(report.delivered, 1);
  assert.equal(report.remaining_pending, 0);
  assert.equal(report.needs_attention, 1);
  assert.equal(report.remaining_undelivered, 1);
  assert.equal(claimsCompletedSync(report), false,
    'data that stopped is data that is not in the backup, whatever this flush managed');
  await dev.store.close();
});

test('the remaining figures come from the database, not from arithmetic on what this flush did', async () => {
  const dev = await aDevice();
  await queueOne(dev, { baseName: 'first.json' });

  // Something is enqueued DURING the flush — the other window, or the coach still working.
  let queuedLate = false;
  const report = await flushOutbox(dev.store, dev.remote, {
    now: dev.now(),
    onEntry: async () => {
      if (queuedLate) return;
      queuedLate = true;
      await queueBackup(dev.store, {
        space: SPACES.VISIBLE, baseName: 'late-arrival.json', payload: '{}',
        label: 'a backup queued while the flush was running', now: dev.now(),
      });
    },
  });

  assert.equal(report.delivered, 2, 'the flush picked it up because it re-reads the queue each round');
  assert.equal(report.remaining_pending, 0);
  assert.equal(claimsCompletedSync(report), true);
  await dev.store.close();
});

test('a flush stops at its limit rather than running unbounded, and says so', async () => {
  const dev = await aDevice();
  for (let i = 0; i < 4; i += 1) await queueOne(dev, { baseName: `backup-${i}.json` });

  const report = await flushOutbox(dev.store, dev.remote, { now: dev.now(), limit: 2 });
  assert.equal(report.delivered, 2);
  assert.equal(report.stopped_because, STOPPED.LIMIT);
  assert.equal(report.remaining_pending, 2);
  assert.equal(claimsCompletedSync(report), false);

  const rest = await flushOutbox(dev.store, dev.remote, { now: dev.now(), limit: 2 });
  assert.equal(rest.delivered, 2);
  assert.equal(rest.stopped_because, STOPPED.DRAINED, 'a queue of exactly the limit reports itself drained');
  assert.equal(claimsCompletedSync(rest), true);
  await dev.store.close();
});

test('a local failure is thrown rather than presented as a remote refusal', async () => {
  const dev = await aDevice();
  await queueOne(dev);

  const broken = { list: async () => { throw new TypeError('a defect, not a refusal'); } };
  await assert.rejects(
    () => flushOutbox(dev.store, /** @type {any} */ (broken), { now: dev.now() }),
    (error) => {
      assert.ok(error instanceof TypeError);
      assert.equal(error.flush_report.interrupted, true);
      assert.equal(claimsCompletedSync(error.flush_report), false);
      return true;
    },
  );

  assert.equal((await entriesByStatus(dev.store, STATUS.PENDING)).items.length, 1, 'the work is still there');
  assert.equal((await entriesByStatus(dev.store, STATUS.REJECTED)).items.length, 0, 'and it was not blamed on the remote');
  await dev.store.close();
});
