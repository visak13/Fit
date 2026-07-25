/**
 * THE WHOLE SURFACE, against a real queue and a real local store.
 *
 * The four states the requirement names — never synchronised, healthy, overdue, severely overdue — are
 * each driven here through the actual outbox rather than through hand-made figures, because the claim
 * being made is about what the coach sees on his device, and figures assembled by a test would prove
 * only that the arithmetic works.
 *
 * The two structural claims get their own tests at the end: that nothing this produces can block the
 * application, and that an in-progress synchronisation is never the only thing a caller can see.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { flushBestEffort, flushOutbox } from '../outbox/outbox.js';
import { BLOCKS_APPLICATION, accountabilityStatus } from './surface.js';
import { completionFrom, recordCompletedSync } from './completion.js';
import { LEVEL, LEVELS, LEVEL_ORDER, OVERDUE_MS, PERSISTENT_WARNING_MS, SEVERELY_OVERDUE_MS } from './levels.js';
import { REASON } from './reasons.js';
import { PLATFORM_STATEMENT } from './statement.js';
import {
  aDevice, credentialExpires, queueOne, queueSpread, restart, serviceRefuses, serviceUnreachable,
} from './testing.js';

const HOUR = 60 * 60_000;

/** Queue one backup, deliver it in the foreground, and record the completion it earned. */
async function backUpSuccessfully(dev) {
  await queueOne(dev);
  const flush = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  await recordCompletedSync(dev.store, flush, { now: dev.now() });
  return flush;
}

// ── the four named states ─────────────────────────────────────────────────────────────────────────

test('NEVER SYNCHRONISED: a fresh installation says so, and does not claim to be up to date', async () => {
  const dev = await aDevice();
  const status = await accountabilityStatus(dev.store, { now: dev.now() });

  assert.equal(status.last_synced_at, null, 'null means NEVER, and it is never a guess');
  assert.equal(status.last_synced_age_ms, null);
  assert.equal(status.never_synchronised, true);
  assert.equal(status.level, LEVEL.NOT_BACKED_UP);
  assert.notEqual(status.level, LEVEL.UP_TO_DATE);
  assert.equal(status.reason.code, REASON.NEVER_SYNCHRONISED);
  assert.match(status.reason.message, /never backed up/i);
  await dev.store.close();
});

test('HEALTHY: everything delivered by a real foreground flush, and the time is shown', async () => {
  const dev = await aDevice();
  const flush = await backUpSuccessfully(dev);

  const status = await accountabilityStatus(dev.store, { now: dev.now() });
  assert.equal(status.last_synced_at, flush.finished_at);
  assert.equal(status.last_synced_age_ms, 0);
  assert.equal(status.never_synchronised, false);
  assert.equal(status.pending, 0);
  assert.equal(status.undelivered, 0);
  assert.equal(status.level, LEVEL.UP_TO_DATE);
  assert.equal(status.reason, null, 'nothing is wrong, so nothing is claimed to be');
  assert.deepEqual(status.reasons, []);

  // And it survives the tab being killed, because it is read from the database rather than a session.
  await restart(dev);
  const after = await accountabilityStatus(dev.store, { now: dev.now() });
  assert.equal(after.last_synced_at, flush.finished_at);
  assert.equal(after.level, LEVEL.UP_TO_DATE);
  await dev.store.close();
});

test('OVERDUE: six hours with work in the queue, and it can say WHAT is waiting', async () => {
  const dev = await aDevice();
  await backUpSuccessfully(dev);

  await queueOne(dev, { baseName: 'session.json', label: 'this morning\'s session' });
  serviceUnreachable(dev, 20);
  await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  dev.advance(OVERDUE_MS);

  const status = await accountabilityStatus(dev.store, { now: dev.now() });
  assert.equal(status.level, LEVEL.OVERDUE);
  assert.equal(status.pending, 1);
  assert.equal(status.undelivered, 1);
  assert.equal(status.oldest_pending_age_ms, OVERDUE_MS);
  assert.equal(status.oldest_pending_label, 'this morning\'s session',
    'how much is not enough: he needs to know WHAT is not backed up');
  assert.ok(status.last_synced_at, 'and the last real backup is still shown, because it really happened');
  await dev.store.close();
});

test('SEVERELY OVERDUE at a day, and the PERSISTENT WARNING at three — which is the ceiling', async () => {
  const dev = await aDevice();
  await queueSpread(dev, 3);
  serviceUnreachable(dev, 50);
  await flushOutbox(dev.store, dev.remote, { now: dev.now() });

  dev.advance(SEVERELY_OVERDUE_MS);
  const aDay = await accountabilityStatus(dev.store, { now: dev.now() });
  assert.equal(aDay.level, LEVEL.SEVERELY_OVERDUE);
  assert.equal(aDay.level_persistent, false);

  dev.advance(PERSISTENT_WARNING_MS - SEVERELY_OVERDUE_MS);
  const threeDays = await accountabilityStatus(dev.store, { now: dev.now() });
  assert.equal(threeDays.level, LEVEL.PERSISTENT_WARNING);
  assert.equal(threeDays.level_persistent, true, 'unmissable, and recurring on every screen');
  assert.equal(threeDays.blocks_application, false, 'and the app still opens');

  // A fortnight is the same rung. There is nothing above it.
  dev.advance(14 * 24 * HOUR);
  const fortnight = await accountabilityStatus(dev.store, { now: dev.now() });
  assert.equal(fortnight.level, LEVEL.PERSISTENT_WARNING);
  assert.equal(fortnight.blocks_application, false);
  await dev.store.close();
});

// ── the structural claims ─────────────────────────────────────────────────────────────────────────

test('NOTHING THIS PRODUCES CAN BLOCK THE APPLICATION — across every state it can reach', async () => {
  // The blocking prompt at seventy-two hours was removed because an application that refuses to open
  // loses the very session it was trying to protect. This is the test that would have to be deleted,
  // in the open, to bring it back.
  const dev = await aDevice();

  /** @type {any[]} */
  const seen = [];
  const capture = async (options) => {
    const status = await accountabilityStatus(dev.store, { now: dev.now(), ...options });
    seen.push(status);
    assert.equal(status.blocks_application, false, `${status.level} must not block the application`);
    assert.equal(LEVELS[status.level].blocks, false);
    return status;
  };

  await capture({});                                      // never synchronised, empty queue
  await backUpSuccessfully(dev);
  await capture({});                                      // healthy

  await queueSpread(dev, 5);                              // work waiting
  await capture({ in_progress: true });

  serviceRefuses(dev, 1);
  await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  await capture({});                                      // a refused entry

  credentialExpires(dev, 50);
  await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  await capture({ credential: { present: true, expired: true } });

  await queueSpread(dev, 2);                              // and work still waiting behind all of it
  dev.advance(14 * 24 * HOUR);                            // a fortnight of all of it at once
  const worst = await capture({ credential: { present: false }, in_progress: true });

  assert.equal(worst.level, LEVEL.PERSISTENT_WARNING, 'fixture check: the worst state really was reached');
  assert.ok(seen.length >= 6);
  assert.equal(seen.filter((s) => s.blocks_application).length, 0);
  assert.equal(BLOCKS_APPLICATION, false, 'the constant itself, so there is one place to read');
  await dev.store.close();
});

test('AN IN-PROGRESS SYNCHRONISATION IS NEVER THE ONLY THING A CALLER CAN SEE', async () => {
  const dev = await aDevice();
  await backUpSuccessfully(dev);
  await queueSpread(dev, 2);
  serviceUnreachable(dev, 20);
  await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  dev.advance(7 * HOUR);

  const status = await accountabilityStatus(dev.store, { now: dev.now(), in_progress: true });

  // A spinner that hides a failure is the exact thing this must make impossible. So: the flag is
  // there, AND every figure behind it is populated at the same moment.
  assert.equal(status.in_progress, true);
  assert.equal(typeof status.last_synced_at, 'string');
  assert.equal(status.pending, 2);
  assert.equal(status.undelivered, 2);
  assert.equal(typeof status.oldest_pending_age_ms, 'number');
  assert.equal(status.level, LEVEL.OVERDUE);
  assert.ok(LEVEL_ORDER.includes(status.level));
  assert.equal(typeof status.summary, 'string');
  await dev.store.close();
});

test('A DEAD CREDENTIAL IS REPORTED AS A QUEUE-WIDE STOP, not as N individually stuck entries', async () => {
  const dev = await aDevice();
  // Backed up once first, so the credential is the ONLY thing wrong. On a device that has never
  // synchronised, "nothing is in the backup" is the truer headline and would rightly outrank it.
  await backUpSuccessfully(dev);
  await queueSpread(dev, 4);
  credentialExpires(dev, 50);
  await flushOutbox(dev.store, dev.remote, { now: dev.now() });

  const status = await accountabilityStatus(dev.store, { now: dev.now() });
  assert.ok(status.waiting_for_credential > 0, 'fixture check: entries really are held on the credential');
  assert.equal(status.reason.code, REASON.CREDENTIAL_EXPIRED);
  assert.equal(status.reason.queue_wide, true);
  assert.equal(status.nothing_can_be_sent, true, 'nothing can go anywhere at all — not "some are stuck"');
  assert.doesNotMatch(status.reason.message, /\d/, 'and the sentence does not quote a per-entry count');
  await dev.store.close();
});

test('a refused entry is surfaced beside everything else, not collapsed into the worst reason', async () => {
  const dev = await aDevice();
  await queueOne(dev, { baseName: 'refused.json', label: 'a refused backup' });
  serviceRefuses(dev, 1);
  await flushOutbox(dev.store, dev.remote, { now: dev.now() });

  const status = await accountabilityStatus(dev.store, {
    now: dev.now(),
    last_attempt: { failures: [{ code: 'unavailable', retryable: true, needs_reauth: false }] },
  });

  const codes = status.reasons.map((r) => r.code);
  assert.ok(codes.includes(REASON.ENTRY_REJECTED), 'the one that never resolves by itself must survive');
  assert.ok(codes.includes(REASON.NO_NETWORK));
  assert.equal(status.needs_attention, 1);
  assert.equal(status.level, LEVEL.OVERDUE, 'time does not heal a refusal, so it does not wait six hours to say so');
  await dev.store.close();
});

test('A REFUSED ENTRY GOES ON AGEING — it does not sit at overdue for ever while nothing retries it', async () => {
  const dev = await aDevice();
  await backUpSuccessfully(dev);

  await queueOne(dev, { baseName: 'refused.json', label: 'Tuesday\'s session' });
  serviceRefuses(dev, 1);
  await flushOutbox(dev.store, dev.remote, { now: dev.now() });

  const fresh = await accountabilityStatus(dev.store, { now: dev.now() });
  assert.equal(fresh.pending, 0, 'fixture check: nothing is still being attempted');
  assert.equal(fresh.undelivered, 1, 'and yet the data is not in the backup');
  assert.equal(fresh.oldest_pending_age_ms, null, 'the queue has no pending age to offer');
  assert.equal(fresh.oldest_undelivered_age_ms, 0, 'but the surface knows how old the data is');
  assert.equal(fresh.level, LEVEL.OVERDUE, 'floored at once, because time does not heal a refusal');

  // Four days later the coach still has not backed that session up. Measuring the ladder on the
  // pending entries alone would report this as no worse than the moment it was refused.
  dev.advance(4 * 24 * HOUR);
  const later = await accountabilityStatus(dev.store, { now: dev.now() });
  assert.equal(later.oldest_undelivered_age_ms, 4 * 24 * HOUR);
  assert.equal(later.oldest_undelivered_label, 'Tuesday\'s session');
  assert.equal(later.level, LEVEL.PERSISTENT_WARNING, 'the escalation follows the DATA, not the retry');
  assert.equal(later.blocks_application, false);
  await dev.store.close();
});

test('the last-synced time comes ONLY from a sealed completion — a killed flush leaves it alone', async () => {
  const dev = await aDevice();
  const good = await backUpSuccessfully(dev);

  dev.advance(2 * HOUR);
  await queueOne(dev, { baseName: 'later.json', label: 'a later backup' });
  const killed = await flushBestEffort(dev.store, dev.remote, { now: dev.now() });
  assert.equal(completionFrom(killed), null, 'fixture check: a best-effort flush earns nothing');
  await recordCompletedSync(dev.store, killed, { now: dev.now() });

  const status = await accountabilityStatus(dev.store, { now: dev.now() });
  assert.equal(status.last_synced_at, good.finished_at, 'still the last GENUINE one, two hours ago');
  assert.equal(status.last_synced_age_ms, 2 * HOUR);
  await dev.store.close();
});

test('a manufactured last-synced time is reported loudly rather than believed or ignored', async () => {
  const dev = await aDevice();
  await dev.store.setMeta('status.last_completed_sync', { completed_sync_at: 'yesterday-ish' });

  const status = await accountabilityStatus(dev.store, { now: dev.now() });
  assert.equal(status.last_synced_at, null, 'it is not believed');
  assert.equal(status.reason.code, REASON.UNVERIFIABLE_SYNC_CLAIM, 'and it is not silently ignored either');
  assert.equal(status.blocks_application, false);
  await dev.store.close();
});

// ── the honest statement, and the absence of rendering ────────────────────────────────────────────

test('the honest platform statement travels with the status, promising no background synchronisation', async () => {
  const dev = await aDevice();
  const status = await accountabilityStatus(dev.store, { now: dev.now() });

  assert.equal(status.statement, PLATFORM_STATEMENT);
  assert.match(status.statement.promises.saves, /saved on this device/i);
  assert.match(status.statement.promises.backs_up, /open the app|leave it|tap Sync/i);
  assert.match(status.statement.limits.no_background_sync, /cannot back up in the background/i);
  assert.match(status.statement.limits.no_sync_while_closed, /while the app is closed/i);
  await dev.store.close();
});

test('IT DRAWS NOTHING: the status is plain data, and every field survives being serialised', async () => {
  const dev = await aDevice();
  await backUpSuccessfully(dev);
  await queueSpread(dev, 2);
  const status = await accountabilityStatus(dev.store, { now: dev.now(), in_progress: true });

  // No function, no element, no node — the interface renders this however it likes, and this package
  // is testable without a browser precisely because there is nothing in here to draw.
  const walk = (value, path) => {
    assert.notEqual(typeof value, 'function', `${path} is a function; this layer draws nothing`);
    if (value && typeof value === 'object') {
      assert.ok(!('nodeType' in value), `${path} looks like a document node`);
      for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
    }
  };
  walk(status, 'status');
  assert.deepEqual(JSON.parse(JSON.stringify(status)).level, status.level);

  // And it is frozen, so a screen cannot quietly improve the numbers on their way to the coach.
  assert.throws(() => { status.pending = 0; }, TypeError);
  await dev.store.close();
});

test('one status pass costs two reads, so an always-visible indicator stays always visible', async () => {
  const dev = await aDevice();
  await queueSpread(dev, 40);

  const before = dev.store.handle.stats.transactions;
  await accountabilityStatus(dev.store, { now: dev.now() });
  const spent = dev.store.handle.stats.transactions - before;

  // Index range counts and one cursor step, plus one meta row. Nothing here walks the queue, and a
  // status line that costs something is a status line that stops being shown.
  assert.ok(spent <= 8, `a status pass took ${spent} transactions over a queue of 40`);
  await dev.store.close();
});
