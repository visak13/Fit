/**
 * WALKING A CLIENT'S HISTORY TO THE END.
 *
 * The defect these tests exist to catch does not error and does not look wrong: a report projected
 * from the FIRST PAGE of a history is complete in shape and short in substance. So the walk is
 * proved to reach the end, and — the load-bearing half — the case where it CANNOT is proved to come
 * back saying so rather than handing back what it managed to read.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { HISTORY_INCOMPLETE, PAGE_LIMIT, readAll } from './client-report-source';
import type { ReadPage } from './client-report-source';

/** A reader over `total` records, handing out `size` at a time, ending honestly. */
function pagesOf(total: number, size: number): { read: ReadPage; calls: () => number } {
  let calls = 0;
  const read: ReadPage = async (after) => {
    calls += 1;
    const from = after === null ? 0 : Number(after);
    const items = Array.from({ length: Math.min(size, total - from) }, (_, index) => ({ n: from + index }));
    const next = from + items.length;
    return { items, cursor: next >= total ? null : String(next), done: next >= total };
  };
  return { read, calls: () => calls };
}

test('THE WHOLE HISTORY IS READ, not the first page of it', async () => {
  const pages = pagesOf(250, 50);
  const walked = await readAll(pages.read);

  assert.equal(walked.items.length, 250, 'a short read here is a report that understates the client');
  assert.equal(walked.complete, true);
  assert.ok(pages.calls() > 1, 'and it really did page, or this test proves nothing about paging');
});

test('a history that fits in one page is read in one page and is complete', async () => {
  const walked = await readAll(pagesOf(3, 50).read);

  assert.equal(walked.items.length, 3);
  assert.equal(walked.complete, true);
});

test('AN INCOMPLETE READ SAYS SO — the bound never returns a short history as though it were whole', async () => {
  // A store that always offers another page. Without the bound this hangs; with a bound that stayed
  // silent, it would produce a plausible report from an arbitrary slice.
  let served = 0;
  const endless: ReadPage = async (after) => {
    served += 1;
    return { items: [{ n: served }], cursor: String(Number(after ?? '0') + 1), done: false };
  };

  const walked = await readAll(endless);

  assert.equal(walked.complete, false, 'the flag the surface refuses on');
  assert.equal(served, PAGE_LIMIT, 'and it stopped at the bound rather than running forever');
});

test('A CURSOR THAT DOES NOT ADVANCE is caught, rather than read as history over and over', async () => {
  const stuck: ReadPage = async () => ({ items: [{ n: 1 }], cursor: 'always-the-same', done: false });

  const walked = await readAll(stuck);

  assert.equal(walked.complete, false);
  assert.ok(
    walked.items.length < PAGE_LIMIT,
    'it must stop at the repeat rather than collecting the same page two hundred times',
  );
});

test('the refusal is a read to try again, not an accusation', () => {
  assert.ok(!HISTORY_INCOMPLETE.toLowerCase().includes('error'));
  assert.ok(HISTORY_INCOMPLETE.includes('Nothing is wrong with the records'));
  assert.ok(!/\p{Extended_Pictographic}/u.test(HISTORY_INCOMPLETE));
});
