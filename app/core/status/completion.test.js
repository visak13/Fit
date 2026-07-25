/**
 * "LAST BACKED UP" IS A BRAND — and this is where that is proven rather than asserted in prose.
 *
 * The failure being defended against is specific and it is a platform behaviour, not a hypothesis: the
 * best-effort flush that runs when the app is backgrounded MAY BE KILLED MID-FLIGHT, and on iOS that
 * is ordinary. If that partial outcome could set the last-backed-up time, the app would show
 * reassurance over missing data, which is the exact defect the whole accountability standard exists to
 * prevent.
 *
 * So every route to a completion is tried here, including the ones a well-meaning caller would take.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { flushBestEffort, flushOutbox } from '../outbox/outbox.js';
import {
  LAST_SYNC_META_KEY, completionAgeMs, completionFrom, isCompletedSync, lastSyncedAt,
  readLastCompletedSync, recordCompletedSync,
} from './completion.js';
import { aDevice, credentialExpires, queueOne, restart, serviceRefuses } from './testing.js';

/** A real, complete, foreground flush that drained the queue. */
async function aCompletedFlush(dev) {
  await queueOne(dev);
  const report = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(report.delivered, 1, 'fixture check: the flush really did deliver');
  assert.equal(report.remaining_undelivered, 0, 'fixture check: the queue really did drain');
  return report;
}

// ── the thing that must be impossible ─────────────────────────────────────────────────────────────

test('A BEST-EFFORT FLUSH CANNOT PRODUCE A COMPLETION, even when it delivered everything', async () => {
  const dev = await aDevice();
  await queueOne(dev);

  const report = await flushBestEffort(dev.store, dev.remote, { now: dev.now() });
  assert.equal(report.delivered, 1, 'it did the work');
  assert.equal(report.remaining_undelivered, 0, 'and it left nothing behind');

  // And still: no completion. The platform may have killed it after the delivery and before the
  // acknowledgement, and nothing in the report can tell the difference — so it is never a completion.
  assert.equal(completionFrom(report), null);
  assert.equal(lastSyncedAt(completionFrom(report)), null);
  await dev.store.close();
});

test('A KILLED FLUSH CANNOT PRODUCE ONE — the interruption is what a spinner would have hidden', async () => {
  const dev = await aDevice();
  await queueOne(dev, { baseName: 'a.json', label: 'first' });
  await queueOne(dev, { baseName: 'b.json', label: 'second' });

  // The platform pulls the rug: the app was backgrounded and the flush is stopped part-way.
  const signal = { aborted: false };
  let seen = 0;
  const report = await flushBestEffort(dev.store, dev.remote, {
    now: dev.now(),
    signal,
    onEntry: () => { seen += 1; if (seen === 1) signal.aborted = true; },
  });

  assert.equal(report.interrupted, true);
  assert.ok(report.remaining_undelivered > 0, 'fixture check: something really was left behind');
  assert.equal(completionFrom(report), null);
  await dev.store.close();
});

test('nor can a foreground flush that left ANYTHING behind — pending or stopped', async () => {
  const dev = await aDevice();

  // Stopped rather than pending: the queue is empty of things still being tried, and yet the data is
  // NOT in the backup. A completion here would be the most convincing lie the surface could tell.
  await queueOne(dev);
  serviceRefuses(dev, 1);
  const refused = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(refused.rejected, 1);
  assert.equal(refused.remaining_pending, 0, 'fixture check: nothing is still being attempted');
  assert.equal(refused.remaining_undelivered, 1, 'but the data is not away');
  assert.equal(completionFrom(refused), null, 'a drained-of-pending queue is not a completed backup');

  await dev.store.close();
});

test('nor can a flush stopped by a dead credential', async () => {
  const dev = await aDevice();
  await queueOne(dev);
  credentialExpires(dev);

  const report = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(report.waiting_for_credential, 1);
  assert.equal(completionFrom(report), null);
  await dev.store.close();
});

// ── the thing a caller would try, and must not get away with ──────────────────────────────────────

test('A HAND-BUILT REPORT CANNOT PRODUCE ONE, however convincing it looks', async () => {
  const dev = await aDevice();
  const real = await aCompletedFlush(dev);
  assert.ok(completionFrom(real), 'fixture check: the genuine article does work');

  // Every field copied, every count right, and the brand is a module-private symbol so none of these
  // carries it. This is the difference between a rule someone follows and a rule that cannot be broken.
  assert.equal(completionFrom({ ...real }), null, 'a spread loses the brand');
  assert.equal(completionFrom(JSON.parse(JSON.stringify(real))), null, 'a round trip through JSON loses it');
  assert.equal(completionFrom({
    mode: 'foreground', stopped_because: 'drained', interrupted: false, remaining_undelivered: 0,
    finished_at: '2026-07-25T09:00:00.000Z',
  }), null, 'and a lookalike never had it');

  assert.equal(completionFrom(null), null);
  assert.equal(completionFrom('2026-07-25T09:00:00.000Z'), null);
  assert.equal(completionFrom({}), null);
  await dev.store.close();
});

test('a synchronisation report\'s own completion field is NOT trusted — the flush inside it is re-tested', async () => {
  const dev = await aDevice();
  await queueOne(dev);
  const killed = await flushBestEffort(dev.store, dev.remote, { now: dev.now() });

  // Exactly the shape the engine returns, with a completion someone put there by hand.
  const forged = {
    trigger: 'open', device: 'coach-laptop', failures: [],
    flush: killed,
    completion: { completed_sync_at: '2026-07-25T09:00:00.000Z' },
  };
  assert.equal(completionFrom(forged), null, 'plain data on the report cannot make a backup have happened');
  await dev.store.close();
});

test('a pass with a FAILED STEP withholds the completion even if the queue drained first', async () => {
  const dev = await aDevice();
  const real = await aCompletedFlush(dev);

  const partialPass = {
    trigger: 'open', device: dev.store.device, flush: real,
    failures: [{ step: 'pull', code: 'unavailable', retryable: true, needs_reauth: false }],
  };
  // The queue may have emptied before the pull failed, and "backed up" would then quietly mean
  // "sent mine, never read yours".
  assert.equal(completionFrom(partialPass), null);

  // The same report with no failed step is a completion, so the test above is testing the failure and
  // not the fixture.
  assert.ok(completionFrom({ ...partialPass, failures: [] }));
  await dev.store.close();
});

test('the sealed value cannot be edited, and a copy of it stops being one', async () => {
  const dev = await aDevice();
  const completion = completionFrom(await aCompletedFlush(dev));

  assert.equal(isCompletedSync(completion), true);
  assert.throws(() => { completion.completed_sync_at = '2030-01-01T00:00:00.000Z'; }, TypeError);
  assert.equal(isCompletedSync({ ...completion }), false, 'a copy is not the article');
  assert.equal(lastSyncedAt({ completed_sync_at: '2030-01-01T00:00:00.000Z' }), null,
    'reading the field off an unsealed object gets a caller nothing');
  await dev.store.close();
});

// ── what is persisted, and what is not ────────────────────────────────────────────────────────────

test('a genuine completion is persisted and survives a restart', async () => {
  const dev = await aDevice();
  const report = await aCompletedFlush(dev);

  const { recorded, completion } = await recordCompletedSync(dev.store, {
    trigger: 'open', device: dev.store.device, failures: [], flush: report,
  }, { now: dev.now() });
  assert.equal(recorded, true);
  assert.equal(completion.completed_sync_at, report.finished_at);
  assert.equal(completion.trigger, 'open');

  // The tab is killed and the coach opens the app again. The local database outlives the code.
  await restart(dev);
  const read = await readLastCompletedSync(dev.store);
  assert.equal(read.unverifiable, false);
  assert.equal(lastSyncedAt(read.completion), report.finished_at);
  assert.equal(isCompletedSync(read.completion), true, 're-sealed on the way out, so it can be displayed');
  await dev.store.close();
});

test('A FLUSH THAT DID NOT COMPLETE WRITES NOTHING — and does not clear what did', async () => {
  const dev = await aDevice();
  const good = await aCompletedFlush(dev);
  await recordCompletedSync(dev.store, good, { now: dev.now() });

  dev.advance(60 * 60_000);
  await queueOne(dev, { baseName: 'later.json', label: 'a later backup' });
  const killed = await flushBestEffort(dev.store, dev.remote, { now: dev.now() });

  const outcome = await recordCompletedSync(dev.store, killed, { now: dev.now() });
  assert.equal(outcome.recorded, false);
  assert.equal(outcome.completion, null);

  // Advancing it would say he is safe when he is not. Clearing it would say he has never backed up
  // when he has. Leaving it alone is the only honest option and it is what happens.
  const read = await readLastCompletedSync(dev.store);
  assert.equal(lastSyncedAt(read.completion), good.finished_at);
  await dev.store.close();
});

test('nothing at all recorded reads as NEVER, and never as a guess', async () => {
  const dev = await aDevice();
  const read = await readLastCompletedSync(dev.store);
  assert.equal(read.completion, null);
  assert.equal(read.unverifiable, false, 'an absence is a true statement, not a defect');
  assert.equal(lastSyncedAt(read.completion), null);
  await dev.store.close();
});

test('A MALFORMED ROW IS NOT TREATED AS AN ABSENCE — it is reported as unverifiable', async () => {
  const dev = await aDevice();

  // Something other than this module wrote a completion. That is a defect somebody must notice, and
  // reading it as "never backed up" would hide it behind a state that looks ordinary.
  await dev.store.setMeta(LAST_SYNC_META_KEY, { completed_sync_at: 'the other day' });
  const read = await readLastCompletedSync(dev.store);
  assert.equal(read.completion, null);
  assert.equal(read.unverifiable, true);

  await dev.store.setMeta(LAST_SYNC_META_KEY, { nothing: 'like a completion' });
  assert.equal((await readLastCompletedSync(dev.store)).unverifiable, true);
  await dev.store.close();
});

test('the age of the last backup is measured from the sealed value and from nothing else', async () => {
  const dev = await aDevice();
  const report = await aCompletedFlush(dev);
  const completion = completionFrom(report);

  dev.advance(3 * 60 * 60_000);
  assert.equal(completionAgeMs(completion, dev.now()), 3 * 60 * 60_000);
  assert.equal(completionAgeMs(null, dev.now()), null);
  assert.equal(completionAgeMs({ completed_sync_at: report.finished_at }, dev.now()), null,
    'an unsealed lookalike has no age, because it has no last-backed-up time');
  await dev.store.close();
});
