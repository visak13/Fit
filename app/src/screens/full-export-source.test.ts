/**
 * READING THE WHOLE PRACTICE — the deduplication, and the honest incomplete.
 *
 * The walk itself is proved in `client-report-source.test.ts`; this suite covers what is decided
 * HERE, and the load-bearing one is the shared session. A session with two clients on it is returned
 * by the store once for EACH of them, because per client is the only index there is — so a backup
 * that concatenated the results would restore a practice holding every shared session twice, with
 * nothing anywhere reporting a problem.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { deduplicate, PRACTICE_INCOMPLETE } from './full-export-source';

test('A SHARED SESSION IS KEPT ONCE, however many clients reached it', () => {
  const shared = { record_id: 's-shared', content: { client_ids: ['a', 'b'] } };
  const hers = { record_id: 's-hers', content: { client_ids: ['a'] } };
  const his = { record_id: 's-his', content: { client_ids: ['b'] } };

  // What the walk actually produces: client A's sessions, then client B's, with the shared one twice.
  const kept = deduplicate([hers, shared, shared, his]);

  assert.equal(kept.length, 3, 'a backup restoring duplicate sessions is a corrupted practice');
  assert.deepEqual(
    kept.map((record) => (record as { record_id: string }).record_id).sort(),
    ['s-hers', 's-his', 's-shared'],
  );
});

test('...AND THE PROBE: without deduplication the same walk really does carry it twice', () => {
  const shared = { record_id: 's-shared', content: {} };
  const naive = [shared, shared];

  assert.equal(naive.length, 2, 'the input this guard exists for is genuinely duplicated');
  assert.equal(deduplicate(naive).length, 1);
});

test('a record with no identity is KEPT, not dropped to keep a map tidy', () => {
  const orphan = { content: { name: 'no envelope' } };
  const kept = deduplicate([{ record_id: 'a', content: {} }, orphan]);

  assert.equal(kept.length, 2);
  assert.ok(kept.includes(orphan), 'it is still his data, and a backup is the wrong place to lose it');
});

test('deduplication keeps the LAST copy, so a fresher read wins over a staler one', () => {
  const first = { record_id: 'x', content: { revision: 1 } };
  const later = { record_id: 'x', content: { revision: 2 } };

  assert.deepEqual(deduplicate([first, later]), [later]);
});

test('the incomplete refusal explains the cost rather than accusing him of anything', () => {
  assert.ok(PRACTICE_INCOMPLETE.includes('Nothing is wrong with the records'));
  assert.ok(
    PRACTICE_INCOMPLETE.includes('quietly incomplete is worse'),
    'he must be told WHY he is being made to try again, or the refusal reads as the app being broken',
  );
  assert.ok(!/\p{Extended_Pictographic}/u.test(PRACTICE_INCOMPLETE));
});
