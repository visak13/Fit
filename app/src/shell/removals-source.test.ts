/**
 * THE PENDING-REMOVAL SEAM, READ FROM A REAL STORE — the literal is gone and this is what replaced it.
 *
 * Until this step, `main.tsx` filled this seam with `NOTHING_AWAITING_REMOVAL`, and that value was
 * TRUE rather than a placeholder: no client can have been removed on a device with no store. This
 * suite is the evidence it is no longer what the surface reports — that a client genuinely removed
 * from a genuine store reaches the seam, as the core paged him, with nothing converted on the way.
 *
 * ## WHY THE READ IS A PLAIN FUNCTION AND NOT AN EFFECT
 *
 * A static render never runs an effect, so a read living inside one is a read nothing can check. The
 * read is therefore `readPendingRemovals`, driven here against a real `LocalStore` on the core's own
 * in-process double, holding a real manifest written by `purgeClient`.
 *
 * ## THE ASSERTION THAT MATTERS MOST IS ABOUT WHAT WAS *NOT* DONE
 *
 * `shell/Removals.tsx` requires the page to go in UNCHANGED — items, cursor and `done` intact — and
 * the reason is not tidiness. `screens/removals.ts` derives its "there are more than these" sentence
 * from `done` and its forensic detail from fields on the manifest, so a page flattened, counted or
 * trimmed on the way through would turn a floor into a claim that this is all of them. So what is
 * published is compared against the core's own call, whole.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { aClient } from '../../core/model/fixtures.js';
import { openLocalStore } from '../../core/store/store.js';
import { pendingDeletions, purgeClient } from '../../core/store/purge.js';
import { createLaptop, settle } from '../../core/store/testing/platform-double.js';
import type { RemovalsPage } from '../screens/removals';
import { describeRemovals } from '../screens/removals';
import { NOTHING_AWAITING_REMOVAL } from './Removals';
import { REMOVALS_PAGE_LIMIT, readPendingRemovals } from './removals-source';

/** Stores opened by this file, closed once at the end whatever happened. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const opened: any[] = [];

after(async () => {
  for (const store of opened) {
    // eslint-disable-next-line no-await-in-loop
    await store.close();
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aStore(): Promise<any> {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });
  opened.push(store);
  return store;
}

/** A store where a client was genuinely registered and then genuinely removed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aStoreWithARemoval(): Promise<any> {
  const store = await aStore();
  const departing = await store.create('client', aClient({ name: 'Rekha Iyer' }));
  await store.create('client', aClient({ name: 'Staying Example' }));

  const manifest = await purgeClient(store, departing.record_id);
  assert.equal(manifest.status, 'pending', 'the core recorded the removal as work still to carry out');
  return store;
}

/** Whatever the read published, or null if it published nothing. */
async function readOnce(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store: any,
): Promise<RemovalsPage | null> {
  let published: RemovalsPage | null = null;
  readPendingRemovals(store, (page) => { published = page; });
  // The core's own settle: a read on the double is a scheduled task, not a resolved promise, so
  // draining microtasks alone would report "nothing was published" for a read still in flight.
  await settle();
  return published;
}

describe('the pending-removal seam, fed from the local store', () => {
  it('carries a REAL removal, which the frozen literal never could', async () => {
    const page = await readOnce(await aStoreWithARemoval());

    assert.ok(page !== null, 'nothing reached the seam at all');
    assert.equal(page.items.length, 1, 'the removal the coach made is not on the surface that reports removals');
    assert.notDeepEqual(
      page.items,
      NOTHING_AWAITING_REMOVAL.pending.items,
      'the seam is still reporting the empty literal over a store that holds a pending removal',
    );
  });

  it('pushes the page in UNCHANGED — items, cursor and done, as the core paged it', async () => {
    const store = await aStoreWithARemoval();
    const published = await readOnce(store);
    const direct = await pendingDeletions(store, { limit: REMOVALS_PAGE_LIMIT });

    assert.deepEqual(
      published,
      direct,
      'the page was altered between the core and the seam. Everything the screen says is derived from '
        + 'this shape: `done` becomes "there are more than these", and the manifest becomes the '
        + 'forensic record, so a page reshaped here is a screen saying something the core did not.',
    );
  });

  it('carries the manifest whole, so the screen can say what the removal covers', async () => {
    const page = await readOnce(await aStoreWithARemoval());
    assert.ok(page !== null);

    const [manifest] = page.items;
    assert.ok(typeof manifest.deletion_id === 'string' && manifest.deletion_id.length > 0);
    assert.ok(typeof manifest.subject_client_id === 'string' && manifest.subject_client_id.length > 0);
    assert.ok(Array.isArray(manifest.removed), 'the records to remove did not survive the journey');
    assert.ok(Array.isArray(manifest.revised), 'the shared records to change did not survive the journey');

    // And it is enough for the surface to word it, which is the point of carrying it whole.
    const report = describeRemovals({ pending: page });
    assert.equal(report.count, 1);
    assert.ok(report.items[0].scope.length > 0);
    assert.ok(!report.items[0].reference.includes('Rekha'), 'the departed client\'s NAME reached the surface');
  });

  it('reads nothing on a store where nobody was ever removed, and that is a real reading', async () => {
    const page = await readOnce(await aStore());

    assert.ok(page !== null);
    assert.deepEqual(page.items, [], 'a removal appeared on a store where nobody was removed');
    assert.equal(page.done, true);
    assert.deepEqual(
      page,
      NOTHING_AWAITING_REMOVAL.pending,
      'the empty literal that shipped before the store was wired is exactly what the real call '
        + 'returns over an untouched store — so nothing drifted when the real source arrived',
    );
  });

  it('is PAGED, and the limit is the number the screen\'s "there are more" sentence rests on', async () => {
    assert.equal(REMOVALS_PAGE_LIMIT, 25, 'the core\'s own default, named rather than left implicit');
  });

  it('publishes nothing after the caller has gone', async () => {
    const store = await aStoreWithARemoval();
    let published: RemovalsPage | null = null;

    const cancel = readPendingRemovals(store, (page) => { published = page; });
    cancel();
    await settle();

    assert.equal(published, null, 'a page arrived after the screen that asked for it had gone');
  });

  it('publishes NOTHING when the read fails, rather than the reassuring empty page', async () => {
    const refusing = {
      read: async () => { throw new Error('the database closed underneath us'); },
    };
    let published: RemovalsPage | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readPendingRemovals(refusing as any, (page) => { published = page; });
    await settle();

    assert.equal(
      published,
      null,
      'a failed read published a page. The empty page says "nothing is waiting", so publishing it '
        + 'after a failure would turn a failure into the one answer this surface exists to prevent.',
    );
  });
});
