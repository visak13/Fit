/**
 * THE BOUND ON THE RECORD, MEASURED RATHER THAN ASSERTED.
 *
 * An append-only record grows, and the cost of replaying it grows with it. Session and client
 * volumes are unknown and cannot be clarified, so "it will be small" is not an argument available
 * here. Two facts make the growth safe, and both are checked rather than claimed:
 *
 *  1. **Replay is bounded by ONE session**, not by the practice or its history. Resuming a session
 *     in a store holding many other sessions reads that session's own records and essentially
 *     nothing else — measured on the store's own row counter, which is the only honest way to tell
 *     the difference between a bounded read and a `getAll().filter()` that happens to look right.
 *  2. **One session's journal is capped**, below the store's per-query read limit, so a session's
 *     detail is always read back WHOLE. Past the cap the append is refused loudly rather than the
 *     read silently returning a page — an absence that looks like a pass is the failure this build
 *     has been bitten by three times.
 *
 * See `SESSION.md` §5 for the numbers these tests pin down.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { SessionJournalFullError } from './errors.js';
import { JOURNAL_LIMITS, readJournal, STORE_DETAIL_READ_LIMIT } from './journal.js';
import { startSession } from './live-session.js';
import { clientViewOf } from './projection.js';
import { aFurnishedStore, EXERCISES, T } from './testing.js';

test('the caps sit below the store limit that reads a session back whole', () => {
  for (const [bound, limit] of Object.entries(JOURNAL_LIMITS)) {
    assert.ok(limit < STORE_DETAIL_READ_LIMIT,
      `${bound} (${limit}) must leave room under the store's ${STORE_DETAIL_READ_LIMIT}-row detail read`);
  }
});

test('a journal filled TO the cap is read back complete — nothing is silently dropped', async () => {
  const { store, routine, clientIds } = await aFurnishedStore();
  const [client] = clientIds;
  const opened = await startSession(store, {
    routineId: routine.content.id, clientIds, mode: 'online', routine, now: T.start,
  });
  const live = opened.session;

  const cap = JOURNAL_LIMITS.performedPerClient;
  for (let i = 0; i < cap; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await live.recordPerformed(client, {
      exerciseId: EXERCISES.push, sets: 1, repetitions: 5, recordedAt: T.one, now: T.one,
    });
  }

  const journal = await readJournal(store, live.record);
  assert.equal(journal.performed[client].length, cap,
    'every one of them comes back — the cap is what keeps this true');

  const view = clientViewOf(await live.refresh(), client);
  assert.equal(view.counts.performed, cap);
  assert.equal(view.append_position, cap);
  assert.equal(view.plan[0].attempts.length, cap, 'and they are all attached to their routine line');

  await assert.rejects(() => live.recordPerformed(client, {
    exerciseId: EXERCISES.push, sets: 1, repetitions: 5, recordedAt: T.two, now: T.two,
  }), (error) => {
    assert.ok(error instanceof SessionJournalFullError);
    assert.match(error.message, /Nothing has been lost/,
      'the refusal says what is true: the record is intact, this session is simply full');
    assert.equal(error.detail.limit, cap);
    return true;
  });

  await store.close();
});

test('resuming reads ONE session, whatever else is on the device', async () => {
  const { store, routine, clientIds } = await aFurnishedStore();
  const [client] = clientIds;

  /** Record a session of six facts and leave it. @returns {Promise<string>} */
  async function aFinishedSession() {
    const opened = await startSession(store, {
      routineId: routine.content.id, clientIds, mode: 'online', routine, now: T.start,
    });
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await opened.session.recordPerformed(client, {
        exerciseId: EXERCISES.push, sets: 3, repetitions: 10, recordedAt: T.one, now: T.one,
      });
    }
    await opened.session.recordReading(client, { kind: 'heart-rate', value: 130, takenAt: T.two, now: T.two });
    await opened.session.complete({ now: T.end });
    return opened.session.sessionId;
  }

  // One session's worth of reading, measured on an almost-empty device.
  const first = await aFinishedSession();
  const beforeOne = store.stats.rowsRead;
  await readJournal(store, await store.get('session', first));
  const costOfOne = store.stats.rowsRead - beforeOne;

  // Nine more sessions of the same size, for the same client, all in the same database.
  for (let i = 0; i < 9; i += 1) await aFinishedSession();

  const beforeAgain = store.stats.rowsRead;
  await readJournal(store, await store.get('session', first));
  const costWithTen = store.stats.rowsRead - beforeAgain;

  assert.equal(costWithTen, costOfOne,
    'ten times the history costs exactly the same to replay — the indexes are keyed by session');
  assert.ok(costOfOne <= 12,
    `one session replays in a handful of rows, not a scan (${costOfOne})`);

  await store.close();
});

test('an append costs the same whether it is the first fact of the session or the fiftieth', async () => {
  const { store, routine, clientIds } = await aFurnishedStore();
  const [client] = clientIds;
  const opened = await startSession(store, {
    routineId: routine.content.id, clientIds, mode: 'online', routine, now: T.start,
  });
  const live = opened.session;

  const measure = async () => {
    const before = store.stats.rowsRead;
    await live.recordPerformed(client, {
      exerciseId: EXERCISES.push, sets: 1, repetitions: 5, recordedAt: T.one, now: T.one,
    });
    return store.stats.rowsRead - before;
  };

  const first = await measure();
  for (let i = 0; i < 48; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await live.recordPerformed(client, {
      exerciseId: EXERCISES.push, sets: 1, repetitions: 5, recordedAt: T.one, now: T.one,
    });
  }
  const fiftieth = await measure();

  assert.equal(fiftieth, first,
    'recording a fact does not re-read the session, so a long session does not get slower to write to');

  await store.close();
});
