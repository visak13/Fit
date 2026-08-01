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
import { NO_PASS_HAS_REPORTED, describeRemovals } from '../screens/removals';
import { NOTHING_AWAITING_REMOVAL } from './Removals';
import { REMOVALS_PAGE_LIMIT, readPendingRemovals } from './removals-source';
import type { PendingRemovalsOutcome } from './removals-source';

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
async function readOutcome(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store: any,
): Promise<PendingRemovalsOutcome | null> {
  let published: PendingRemovalsOutcome | null = null;
  readPendingRemovals(store, (outcome) => { published = outcome; });
  // The core's own settle: a read on the double is a scheduled task, not a resolved promise, so
  // draining microtasks alone would report "nothing was published" for a read still in flight.
  await settle();
  return published;
}

/** The PAGE a successful read published, or null. Fails loudly on a failure, which is its own test. */
async function readOnce(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store: any,
): Promise<RemovalsPage | null> {
  const outcome = await readOutcome(store);
  return outcome !== null && outcome.status === 'read' ? outcome.page : null;
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
    const report = describeRemovals({ pending: page, remote: NO_PASS_HAS_REPORTED });
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
    let published: PendingRemovalsOutcome | null = null;

    const cancel = readPendingRemovals(store, (outcome) => { published = outcome; });
    cancel();
    await settle();

    assert.equal(published, null, 'a page arrived after the screen that asked for it had gone');
  });

  /**
   * THE TEST THAT USED TO ASSERT THE DEFECT, INVERTED — and the inversion is the whole of s11/a18.
   *
   * It read: "publishes NOTHING when the read fails, rather than the reassuring empty page", and its
   * message argued that publishing the empty page after a failure would turn a failure into the one
   * answer this surface exists to prevent. THE FIRST HALF WAS RIGHT AND THE CONCLUSION DID NOT
   * FOLLOW: publishing nothing left the seam at `NOTHING_AWAITING_REMOVAL`, which IS that empty
   * page, so the sentence it feared was on screen either way. The old test passed, and passed
   * honestly, while the screen said every removal was confirmed gone from a backup nothing had read.
   *
   * It is replaced rather than deleted, and this note is why: a guard removed to silence it is
   * strictly worse than the gap it was reporting, and the next reader has to know the old assertion
   * was not merely redundant but backwards.
   */
  it('publishes the FAILURE when the read fails, so it cannot be mistaken for an empty page', async () => {
    const refusing = {
      read: async () => { throw new Error('the database closed underneath us'); },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await readOutcome(refusing as any);

    assert.ok(
      outcome !== null,
      'a failed read published NOTHING, which leaves the seam at its empty literal — and that '
        + 'literal is worded "Every client you have removed is confirmed gone from your Google Drive '
        + 'backup". Publishing nothing IS publishing that sentence.',
    );
    assert.equal(
      outcome.status,
      'failed',
      'a failed read did not say it had failed. "failed" and "empty" being the same value is the '
        + 'whole defect: the screen cannot word a state the seam cannot express.',
    );
    assert.ok(
      !('page' in outcome),
      'the failure carries a page. There is nothing to draw after a read that looked at nothing, and '
        + 'a shape offering an empty page here is the shape that let a failure be worded as a '
        + 'confirmed deletion.',
    );
  });

  /**
   * THE FENCE, DRIVEN THROUGH THIS READ — the s17/r3 defect, re-proved after the extraction.
   *
   * `screens/read-failure.ts` now holds what `journal-source.ts` used to hold privately, and this
   * asserts the move did not simplify it away. `constructor` is an ORDINARY PROPERTY LOOKUP, so an
   * own `constructor` shadows the prototype's, and `JSON.parse('{"constructor":{"name":"…"}}')` is
   * exactly that shape — a value out of a RECORD naming itself. s17/r3 measured a planted client
   * name and note fragment reaching rendered markup through it.
   */
  it('names a thrown value by its CLASS, and a value out of a record cannot name itself', async () => {
    const PLANTED = 'Rekha_Menon_shoulder_note';
    const fromData = {
      read: async () => {
        throw JSON.parse(`{"constructor":{"name":"${PLANTED}"}}`) as unknown;
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await readOutcome(fromData as any);
    assert.ok(outcome !== null && outcome.status === 'failed');
    assert.notEqual(
      outcome.failure.errorName,
      PLANTED,
      'a value parsed out of a record named ITSELF and that name is drawn on screen. The class name '
        + 'must be read off the PROTOTYPE via Object.getPrototypeOf, never `thrown.constructor.name`.',
    );
    // AND WHAT IT IS INSTEAD IS THE PROTOTYPE'S OWN CONSTRUCTOR — `Object`, because that is what a
    // parsed object's prototype genuinely is. The name came from the language, not from the record:
    // that is the whole distinction the fence draws, and it reads as a weaker result than `unknown`
    // only until you notice `Object` is not a string this store could ever have been carrying.
    assert.equal(
      outcome.failure.errorName,
      'Object',
      'the name published for a parsed object is not its prototype\'s constructor',
    );

    // ...and the pair still discriminates: a real error is still named. A fence that refused
    // everything would pass the assertion above while telling whoever helps him nothing at all.
    const fromCode = { read: async () => { throw new TypeError('a real one'); } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const real = await readOutcome(fromCode as any);
    assert.ok(real !== null && real.status === 'failed');
    assert.equal(real.failure.errorName, 'TypeError', 'a real error stopped being named at all');
  });
});
