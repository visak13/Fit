/**
 * REMOVALS NOT YET CONFIRMED — and the five ways a surface for this can be wrong while looking right.
 *
 * **One. The pending removal is FICTIONAL.** A hand-built manifest with `status: 'pending'` on it proves
 * this screen can draw an object of that shape and nothing else. So every removal here is INDUCED: a
 * real client, really synchronised out to a real remote double, really removed with `purgeClient`, and
 * the read-back really not yet having confirmed a clean area. `core/sync/deletions.js` decides the state;
 * this file only reads it. If the core ever stops leaving an unconfirmed removal pending, these tests
 * stop having anything to draw rather than going on passing against a fixture.
 *
 * **Two. It says "still there".** That is a DIFFERENT FACT and it is not the one that is known. Pending
 * means this device has not read its area back and seen them gone — which is also what one ordinary
 * un-synchronised hour looks like. "Still in your backup" would be alarming and frequently false;
 * "gone" would be reassuring and sometimes false. The true statement is the uncomfortable middle one,
 * and it is asserted here as a constant that is not reworded.
 *
 * **Three. It keeps a name in order to be friendlier.** `core/store/purge.js` keeps identities only, no
 * content of any kind, precisely so that removing somebody does not leave their name in the record that
 * proves they were removed. So it is asserted that the departed client's real name — which this test
 * knows and the manifest does not — appears NOWHERE in the rendered screen.
 *
 * **Four. THE REMOTE HALF LANDS AND MANUFACTURES GOOD NEWS.** This was S16's boundary and S16 is done,
 * so the assertion that inverted rather than being deleted is here: what used to be *"no still-present
 * identity reaches this screen"* is now *"the still-present identities from a real report DO reach it,
 * and the strong claim is made"*. The guard that replaces it is the harder one, because it is the way
 * this half can be wrong while looking right: **an empty `still_present` is not a clean check.**
 * `core/sync/engine.js` runs the verify step only when deletions were carried AND a compaction ran, so
 * on most passes the empty list means nothing was looked at. It is asserted that no reassuring sentence
 * is ever produced from one — with a NON-VACUITY PROBE proving the reassurance-detector can fire.
 *
 * **Five. It grows a button.** `markDeletionFailed` has no production caller, and giving it one from a
 * screen would be the surface making a judgement about a delivery. It is asserted that nothing anywhere
 * in the reading or the report is callable.
 *
 * **Six. What the purge could NOT clean stays unsaid.** `core/store/purge.js` persists the queue
 * sweep's result on the manifest, `pendingDeletions` has been handing it over all along, and nothing
 * read it — the same detected-but-unsurfaced shape. It is asserted from a REAL opaque queued entry,
 * really swept, that the screen says so, says it will not clear on its own, and words it from the
 * DECLARED CODE rather than from any message text.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { aClient } from '../../core/model/fixtures.js';
import { keyedName } from '../../core/outbox/entry.js';
import { enqueue } from '../../core/outbox/queue.js';
import { UNRESOLVED } from '../../core/outbox/scrub.js';
import {
  deletionForClient, markDeletionFailed, pendingDeletions, purgeClient,
} from '../../core/store/purge.js';
import { SYNC_TRIGGERS, syncNow } from '../../core/sync/engine.js';
import { T0, aWorld } from '../../core/sync/testing.js';
import { LocalStoreProvider } from '../platform/LocalStore.tsx';
import { describeOpeningFailure, STILL_OPENING } from '../platform/local-store.ts';
import type { LocalStoreOpening } from '../platform/local-store.ts';
import { NOTHING_AWAITING_REMOVAL, RemovalsProvider } from '../shell/Removals.tsx';
import type { RemovalsReading } from '../shell/Removals.tsx';
import { remoteConfirmationFrom } from '../shell/removals-source.ts';
import { RemovalsScreen } from './RemovalsScreen.tsx';
import {
  NOT_CONFIRMED_IS_NOT_STILL_THERE, NO_NAME_IS_DELIBERATE, NO_PASS_HAS_REPORTED, REMOVALS_TITLE,
  UNRESOLVED_MEANS, WILL_NOT_CLEAR_ON_ITS_OWN, describeRemovals, describeRemovalsAdminEntry,
} from './removals.ts';

/** The departed client's name. Known HERE and deliberately unknown to everything the surface reads. */
const DEPARTED = 'Rekha Iyer';

/** Worlds opened by this file, closed once at the end whatever happened. */
const worlds: ReturnType<typeof aWorld>[] = [];

after(async () => {
  for (const world of worlds) {
    // eslint-disable-next-line no-await-in-loop
    await world.close();
  }
});

/**
 * A REAL removal whose propagation the core has genuinely FAILED to confirm.
 *
 * The client is created, synchronised out so the remote copy really holds their records, and then
 * removed. Compaction then does two things: it writes a fresh state file for this device WITHOUT the
 * departed client in it, and it removes the earlier copies that still contain them. **The removal of
 * the earlier copy is what is broken here**, with the double's own adversity narrowed to that one
 * operation — which is what `Adversity.failNext` documents the `operation` argument for: "so a test can
 * break exactly the write while leaving the read that verifies it working".
 *
 * The result is not a contrived state. It is the failure `core/sync/deletions.js` opens by naming, in
 * its precise mechanism: the old file lingers in the area, the read-back finds the departed client's
 * records still in it, nothing errors anywhere the coach can see, and he believes they are gone. The
 * core refuses to mark the manifest propagated, correctly, and until this screen existed no surface
 * anywhere said so.
 *
 * FIRST it is asserted that one pass with NOTHING broken confirms the removal, so the induction is known
 * to be inducing something rather than merely describing the ordinary case.
 */
async function anUnconfirmedRemoval() {
  const world = aWorld();
  worlds.push(world);
  const laptop = await world.device('coach-laptop');

  const departing = await laptop.store.create('client', aClient({ name: DEPARTED }), { now: T0 });
  await laptop.store.create('client', aClient({ name: 'Staying Example' }), { now: T0 });
  // A REAL pass that carried no deletions, so the engine never entered verify-deletions and reported
  // an empty still-present list HAVING CHECKED NOTHING. Kept, because that is the shape the
  // empty-is-not-clear guard below has to be driven by, and a hand-built one would not be it.
  const verifiedNothing = await syncNow(laptop.store, world.remote, {
    trigger: SYNC_TRIGGERS.MANUAL, now: T0,
  });
  assert.deepEqual(verifiedNothing.deletions.still_present, []);

  world.advance(60_000);
  const manifest = await purgeClient(laptop.store, departing.record_id, { now: world.now() });
  assert.equal(manifest.status, 'pending', 'a removal is recorded as work to carry out, not as a wish');

  // Break the one write that takes the departed client's old copy out of the area, and nothing else.
  world.advance(60_000);
  world.adversity.failNext(3, { operation: 'remove' });
  const report = await syncNow(laptop.store, world.remote, {
    trigger: SYNC_TRIGGERS.MANUAL,
    now: world.now(),
  });
  world.adversity.clear();

  const settled = await deletionForClient(laptop.store, departing.record_id);
  assert.equal(
    settled?.status,
    'pending',
    'the CORE left it pending after one pass, because the read-back has not shown the area clear. If '
      + 'this ever becomes "propagated" here, the induction is no longer inducing the condition and '
      + 'these tests must stop passing rather than start proving nothing.',
  );
  assert.ok(
    report.deletions.still_present.length > 0,
    'and the core itself reports the identities it can still see — which is S16\'s half, not read here',
  );

  return { world, laptop, departing, manifest: settled, report, verifiedNothing };
}

/**
 * The reading, taken from the core's own paged call and — for the remote half — from a REAL sync
 * report put through the production derivation.
 *
 * `remote` defaults to the honest literal rather than to an empty list built here, because "no pass
 * has reported" and "a pass reported nothing" are different facts and this file asserts that the
 * surface never confuses them.
 */
async function readingFrom(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store: any,
  report?: unknown,
): Promise<RemovalsReading> {
  return {
    pending: await pendingDeletions(store, { limit: 25 }),
    remote: report === undefined ? NO_PASS_HAS_REPORTED : remoteConfirmationFrom(report),
  } as RemovalsReading;
}

/**
 * A REAL opened store, held for the whole file.
 *
 * The screen now asks the local store what state it is in, because "nothing is waiting" read from a
 * store that never opened would be the exact false good news this surface exists to prevent. So every
 * render below is a render on a device whose store genuinely opened — the state these tests are about
 * — and the other two states are asserted in the block at the bottom of this file.
 */
const openedWorld = aWorld();
worlds.push(openedWorld);
const OPEN: LocalStoreOpening = {
  state: 'open',
  store: (await openedWorld.device('coach-laptop')).store,
};

/** The screen, rendered exactly as the router renders it: through the seam and nothing else. */
function render(reading: RemovalsReading, opening: LocalStoreOpening = OPEN): string {
  return renderToStaticMarkup(
    createElement(LocalStoreProvider, {
      opening,
      children: createElement(RemovalsProvider, {
        reading,
        children: createElement(RemovalsScreen),
      }),
    }),
  );
}

describe('the induction is inducing something', () => {
  /**
   * THE CONTROL, and it exists because of a measured failure on this recipe: a prove-by-breaking pass
   * whose break silently fails to apply reports all-green and is indistinguishable from a clean run.
   *
   * Here the equivalent risk is the opposite direction: if a removal were left pending by the ORDINARY
   * path, every assertion below would pass while proving nothing about a failure. So the unbroken path
   * is run first and asserted to CONFIRM the removal. That is what makes "pending" in every other test
   * in this file evidence of the broken write rather than of the way this app normally behaves.
   */
  it('CONFIRMS the removal when nothing is broken, so pending elsewhere means the break took hold', async () => {
    const world = aWorld();
    worlds.push(world);
    const laptop = await world.device('coach-laptop');

    const departing = await laptop.store.create('client', aClient({ name: DEPARTED }), { now: T0 });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });

    world.advance(60_000);
    await purgeClient(laptop.store, departing.record_id, { now: world.now() });

    world.advance(60_000);
    const report = await syncNow(laptop.store, world.remote, {
      trigger: SYNC_TRIGGERS.MANUAL,
      now: world.now(),
    });

    assert.deepEqual(
      report.deletions.still_present,
      [],
      'the ordinary path confirms it, so a still-present result later is caused by the broken write',
    );
    assert.equal((await deletionForClient(laptop.store, departing.record_id))?.status, 'propagated');
    assert.deepEqual(
      (await readingFrom(laptop.store)).pending.items,
      [],
      'and this surface is empty in the ordinary case, which is what makes it worth reading when it is not',
    );
  });
});

describe('a removal the core has not confirmed reached the backup', () => {
  it('is listed at all, which is the whole of what was missing', async () => {
    const { laptop, manifest } = await anUnconfirmedRemoval();
    const reading = await readingFrom(laptop.store);

    assert.equal(reading.pending.items.length, 1, 'the core hands over the pending manifest');
    const report = describeRemovals(reading);
    assert.equal(report.count, 1);
    assert.equal(report.settled, false);
    assert.equal(report.items[0].deletionId, manifest?.deletion_id);

    const html = render(reading);
    assert.ok(html.includes('id="screen-removals"'));
    assert.ok(html.includes(REMOVALS_TITLE));
  });

  it('says NOT CONFIRMED and never says STILL THERE, because only the first is known', async () => {
    const { laptop } = await anUnconfirmedRemoval();
    const reading = await readingFrom(laptop.store);
    const report = describeRemovals(reading);

    assert.equal(report.meaning, NOT_CONFIRMED_IS_NOT_STILL_THERE);
    assert.match(report.items[0].whatHappened, /not yet been able to look in your Google Drive/i);
    assert.match(report.items[0].whatHappened, /gone from this device/i);

    const html = render(reading);
    assert.ok(
      html.includes(NOT_CONFIRMED_IS_NOT_STILL_THERE),
      'the sentence that draws the distinction is on the screen, unreworded',
    );
    // The standing sentence is removed before looking, because it contains the phrase in the one form
    // that is legitimate: DENYING the stronger claim. What must not appear is the claim itself.
    const withoutTheDenial = html.split(NOT_CONFIRMED_IS_NOT_STILL_THERE).join('');
    assert.ok(
      !/(are|is) still (in|there)|still in your (backup|Google Drive)|not been (deleted|removed)/i.test(
        withoutTheDenial,
      ),
      'the screen makes the stronger claim somewhere. "Their records are still in your backup" is '
        + 'alarming and frequently false — a pending manifest means this app has not LOOKED, which is '
        + 'also what one ordinary un-synchronised hour looks like. The honest statement is the '
        + 'uncomfortable middle one.',
    );
  });

  it('says what to do, and it is something he can actually cause', async () => {
    const { laptop } = await anUnconfirmedRemoval();
    const report = describeRemovals(await readingFrom(laptop.store));

    assert.match(report.items[0].whatToDo, /tap Sync|while you have a connection/i);
    assert.match(
      report.items[0].whatToDo,
      /reading your backup back/i,
      'and it says WHY a connected moment is needed, so the instruction is not arbitrary',
    );
  });

  it('says how much the removal covers, including the shared records it CHANGES rather than removes', async () => {
    const { laptop, manifest } = await anUnconfirmedRemoval();
    const report = describeRemovals(await readingFrom(laptop.store));
    const item = report.items[0];

    assert.ok((manifest?.removed.length ?? 0) > 0, 'the induced removal really does cover records');
    assert.match(item.scope, new RegExp(`${manifest?.removed.length} records? to remove`));

    // Permanently on screen, not folded: the weight of what is unconfirmed is not detail behind a
    // decision, it is what makes the state worth reading.
    assert.ok(render(await readingFrom(laptop.store)).includes(item.scope));
  });
});

describe('a removal that HAS been tried and still is not done', () => {
  it('gets different words from one that has not been tried, and keeps the reason verbatim', async () => {
    const { laptop, manifest } = await anUnconfirmedRemoval();
    const REASON_GIVEN = 'Google could not be reached while checking the backup.';

    // The core's own routine, not a hand-edited record. It leaves the manifest PENDING on purpose —
    // `STORE.md` §7.3 — because a removal that quietly stopped being retried is the failure itself.
    const tried = await markDeletionFailed(laptop.store, manifest?.deletion_id, REASON_GIVEN);
    assert.equal(tried.status, 'pending', 'the CORE keeps it pending rather than tidying it away');
    assert.equal(tried.attempts, 1);

    const report = describeRemovals(await readingFrom(laptop.store));
    const item = report.items[0];

    assert.equal(item.tried, true);
    assert.equal(item.chipWord, 'Tried and not done');
    assert.match(item.whatHappened, /has tried/i);
    assert.equal(item.whyVerbatim, REASON_GIVEN, 'the recorded reason is passed through untouched');

    const html = render(await readingFrom(laptop.store));
    assert.ok(html.includes(REASON_GIVEN));
    assert.match(item.whatToDo, /do not go into Drive and delete files yourself/i);
  });

  it('and an untried one is not described as having been tried', async () => {
    const { laptop } = await anUnconfirmedRemoval();
    const item = describeRemovals(await readingFrom(laptop.store)).items[0];

    assert.equal(item.tried, false);
    assert.equal(item.chipWord, 'Waiting to be checked');
    assert.equal(item.whyVerbatim, null);
    assert.ok(
      !/has tried/i.test(item.whatHappened),
      'nothing has been attempted, and saying otherwise would make the app sound like it is working on '
        + 'something when it is waiting for him',
    );
  });
});

describe('what this surface cannot say, and says it cannot', () => {
  it('never names the departed client, because the core kept no name to give it', async () => {
    const { laptop, departing } = await anUnconfirmedRemoval();
    const reading = await readingFrom(laptop.store);

    assert.ok(
      !JSON.stringify(reading).includes(DEPARTED),
      'the manifest the core handed over holds identities only — that is the minimisation posture '
        + 'working, not a missing field',
    );

    const html = render(reading);
    assert.ok(
      !html.includes(DEPARTED),
      `"${DEPARTED}" reached the screen. A surface that kept a name in order to be friendlier would `
        + 'undo the reason the purge keeps identities only.',
    );
    assert.ok(
      html.includes(departing.record_id),
      'their reference IS shown: it is the only thing that tells one removal from another, and it is '
        + 'what somebody helping him will ask for',
    );
    assert.ok(
      html.includes(NO_NAME_IS_DELIBERATE),
      'and the screen says WHY there is no name, rather than showing a bare identifier and letting it '
        + 'read as a defect',
    );
  });

  /**
   * THE INVERTED ASSERTION. It used to read "does NOT build S16's half: no still-present identity
   * reaches this screen", and it said so because the wire did not exist. The wire exists, so the
   * assertion is turned round rather than deleted: the guard keeps guarding, from the other side.
   *
   * It is still driven by a REAL report from a REAL broken write, not a hand-built list.
   */
  it('DOES carry the remote half now: the still-present identities from a real report reach the screen', async () => {
    const { laptop, report } = await anUnconfirmedRemoval();
    const reading = await readingFrom(laptop.store, report);

    assert.deepEqual(
      Object.keys(reading).sort(),
      ['pending', 'remote'],
      'the seam carries the local page AND the remote half — a field on this same reading, which is '
        + 'what `shell/Removals.tsx` specified, rather than a second screen or a second wire',
    );

    const stillPresent = report.deletions.still_present.flatMap(
      (entry: { found: string[] }) => entry.found,
    );
    assert.ok(stillPresent.length > 0, 'the core really is carrying identities out, so this can fail');

    const item = describeRemovals(reading).items[0];
    assert.equal(item.confirmedPresent, true, 'the removal the report names is marked confirmed present');
    assert.equal(item.foundCount, stillPresent.length);

    const html = render(reading);
    for (const identity of stillPresent) {
      assert.ok(
        html.includes(identity),
        `${identity} is a record identity the read-back FOUND in the backup and it did not reach the `
          + 'screen. That is the whole of what this wire is for.',
      );
    }
  });

  it('makes the STRONG claim only for the removal the report names, and only from a real read-back', async () => {
    const { laptop, report } = await anUnconfirmedRemoval();

    // Same store, same manifest, two readings — the ONLY difference is whether a pass reported.
    const unreported = await readingFrom(laptop.store);
    const reported = await readingFrom(laptop.store, report);

    const claim = /(are|is) still (in|there)|still in your (backup|Google Drive)/i;
    const strip = (html: string) => html.split(NOT_CONFIRMED_IS_NOT_STILL_THERE).join('');

    assert.ok(
      !claim.test(strip(render(unreported))),
      'the screen made the strong claim with no pass having reported. "Not confirmed gone" is all '
        + 'that is known then, and it is not the same fact.',
    );
    assert.ok(
      claim.test(strip(render(reported))),
      'THE NON-VACUITY PROBE: the detector above must be able to fire, or the assertion before it '
        + 'proves nothing. A pass really did read the backup back and really did find their records, '
        + 'and the screen must say so plainly.',
    );

    assert.equal(describeRemovals(unreported).items[0].confirmedPresent, false);
    assert.equal(describeRemovals(unreported).items[0].foundWords, null);
    assert.match(
      describeRemovals(reported).items[0].whatHappened,
      /some of their records are still there/i,
    );
  });

  /**
   * THE FALSE GREEN, IN THIS HALF. `core/sync/engine.js` runs verify-deletions only when deletions
   * were carried AND a compaction ran; every other pass returns `still_present: []` having looked at
   * nothing. A surface that turned that into "checked, and none of them are in your backup" would be
   * manufacturing the reassuring answer out of a step that never executed.
   *
   * This is asserted against a report the ENGINE genuinely produced with an empty list, not a
   * hand-built one, and the reassurance-detector is proved able to fire on the sentence this surface
   * uses when it IS entitled to reassure.
   */
  it('never turns an EMPTY still-present list into reassurance, because empty is not clear', async () => {
    const { laptop, verifiedNothing } = await anUnconfirmedRemoval();

    // A REAL engine report whose still-present list is empty because the verify step never ran, held
    // alongside a manifest that IS pending. Nothing here is hand-built.
    const reading = await readingFrom(laptop.store, verifiedNothing);
    const report = describeRemovals(reading);

    assert.equal(report.confirmedPresent, 0);
    assert.equal(
      report.confirmedPresentWords,
      null,
      'an empty list produced a sentence. There is no sentence for the empty case ON PURPOSE.',
    );
    assert.equal(report.items[0].confirmedPresent, false);
    assert.equal(report.items[0].foundWords, null);

    const html = render(reading);
    // Narrow on purpose: the PENDING screen legitimately contains "not yet confirmed they are gone
    // from your Google Drive backup", which is the denial, not the claim. What must never appear is
    // the settled wording.
    const reassurance = /confirmed gone|found none|none of (them|their records)/i;
    assert.ok(
      !reassurance.test(html),
      'the screen reported good news off the back of a verify step that never ran. That is the false '
        + 'green in this half, and it is worse than never having checked, because it looks checked.',
    );
    assert.ok(
      reassurance.test(render(NOTHING_AWAITING_REMOVAL)),
      'THE NON-VACUITY PROBE: the reassurance-detector must fire on the screen that IS entitled to '
        + 'reassure — the one where nothing is pending at all — or the assertion above is vacuous.',
    );
  });

  it('says nothing at all about a removal the report does not name, even when it names another', async () => {
    const { laptop, report } = await anUnconfirmedRemoval();
    const second = await laptop.store.create('client', aClient({ name: 'Test Person Second' }));
    await purgeClient(laptop.store, second.record_id);

    const items = describeRemovals(await readingFrom(laptop.store, report)).items;
    assert.equal(items.length, 2);

    const named = items.filter((item) => item.confirmedPresent);
    assert.equal(named.length, 1, 'exactly the one the report named');
    const unnamed = items.find((item) => !item.confirmedPresent);
    assert.equal(unnamed?.foundWords, null);
    assert.match(
      unnamed?.whatHappened ?? '',
      /not yet been able to look/i,
      'the unnamed one keeps the honest middle statement. Being absent from the report is not '
        + 'evidence about it in either direction.',
    );
  });

  /**
   * WHAT THE PURGE COULD NOT CLEAN — the third instance of this step's shape, and the cheapest.
   *
   * `core/store/purge.js` persists the queue sweep's result on the manifest and `pendingDeletions`
   * has been handing it to this surface since s15. Nothing read it. So a queued export naming the
   * departed client AND a staying one could sit in his outbox for ever, left alone deliberately and
   * correctly, with nothing anywhere telling him.
   *
   * The entry below is REAL: a genuinely opaque payload, really enqueued, really swept by the real
   * purge inside its own transaction. Nothing is hand-built and no manifest is edited.
   */
  it('says what the purge could NOT clean, from a real opaque queued entry the real sweep left alone', async () => {
    const world = aWorld();
    worlds.push(world);
    const laptop = await world.device('coach-laptop');

    const departing = await laptop.store.create('client', aClient({ name: DEPARTED }), { now: T0 });
    const staying = await laptop.store.create('client', aClient({ name: 'Staying Example' }), { now: T0 });

    const idempotencyKey = 'removals-screen-opaque-shared-1';
    const { entry } = await enqueue(laptop.store, {
      operation: 'create',
      space: 'fit',
      name: keyedName('progress-report-Q3.xlsx', idempotencyKey),
      idempotency_key: idempotencyKey,
      payload: 'UEsDBBQAAAAI-not-one-of-our-documents-opaque-bytes',
      label: 'Progress reports for two clients',
      refs: [departing.record_id, staying.record_id],
      now: T0,
    });

    const manifest = await purgeClient(laptop.store, departing.record_id, { now: world.now() });
    const unresolved = manifest.outbox.unresolved.filter(
      (held: { entry_id: string }) => held.entry_id === entry.entry_id,
    );
    assert.equal(unresolved.length, 1, 'the real sweep really did leave it and really did report it');
    assert.equal(unresolved[0].why, UNRESOLVED.OPAQUE_SHARED);

    const reading = await readingFrom(laptop.store);
    const report = describeRemovals(reading);
    assert.equal(report.leftBehind, 1);

    const left = report.items[0].leftBehind[0];
    assert.equal(left.entryId, entry.entry_id);
    assert.equal(left.why, UNRESOLVED.OPAQUE_SHARED);
    assert.equal(
      left.whatItMeans,
      UNRESOLVED_MEANS[UNRESOLVED.OPAQUE_SHARED],
      'the words come from the DECLARED CODE. Nothing a service authored is ever displayed here: a '
        + 'failure is what gets written down, and a status surface is where text stops being '
        + 'transient and starts being kept.',
    );

    const html = render(reading);
    assert.ok(html.includes(left.whatItMeans), 'and it actually reaches the screen');
    assert.ok(
      html.includes(WILL_NOT_CLEAR_ON_ITS_OWN),
      'the screen must say this one does NOT resolve itself. Everything else here clears on the next '
        + 'connected moment, and letting this sit among them would have him waiting for something '
        + 'that is never coming.',
    );
    assert.ok(html.includes(entry.entry_id), 'the reference somebody helping him will ask for');
    assert.ok(
      !html.includes(DEPARTED) && !html.includes('Staying Example'),
      'and STILL no name. The entry names two clients by identity; neither name is in the manifest '
        + 'and neither may appear on the screen.',
    );
    assert.ok(
      !html.includes('progress-report-Q3.xlsx') && !html.includes('Progress reports for two clients'),
      'the queued file\'s own name and label are NOT in the manifest and must not be reconstructed '
        + 'onto this screen: a filename is content, and this surface carries identities only.',
    );
  });

  it('says nothing about a purge that had nothing left behind, which is almost every one', async () => {
    const { laptop } = await anUnconfirmedRemoval();
    const reading = await readingFrom(laptop.store);
    const report = describeRemovals(reading);

    assert.equal(report.leftBehind, 0);
    assert.deepEqual(report.items[0].leftBehind, []);
    assert.ok(
      !render(reading).includes(WILL_NOT_CLEAR_ON_ITS_OWN),
      'a permanent "this will never clear" note on an ordinary removal would be an alarm he cannot '
        + 'act on, which is how a surface teaches him to stop reading it',
    );
  });

  it('offers no retry and no give-up, asserted over the whole reading and the whole report', async () => {
    const { laptop } = await anUnconfirmedRemoval();
    const reading = await readingFrom(laptop.store);

    /** Everything callable anywhere in a value, by path, however deeply nested. */
    function callables(value: unknown, path = ''): string[] {
      if (typeof value === 'function') return [path];
      if (value === null || typeof value !== 'object') return [];
      return Object.entries(value as Record<string, unknown>).flatMap(([key, held]) =>
        callables(held, path === '' ? key : `${path}.${key}`));
    }

    assert.deepEqual(
      callables(describeRemovals(reading)),
      [],
      '`markDeletionFailed` has no production caller and this screen is not going to become one: '
        + 'marking a removal failed is a judgement about a delivery, made where the delivery happens.',
    );
    assert.deepEqual(callables(reading), []);
  });
});

describe('once the core HAS confirmed it', () => {
  it('drops off this surface, because a confirmed removal is not waiting for anything', async () => {
    const { world, laptop, departing } = await anUnconfirmedRemoval();

    // Adversity is already cleared. The queued removal is waiting out its backoff, so time moves on and
    // ordinary passes run — nothing here forces the outcome, the core decides and it is asserted after.
    let report = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      world.advance(60 * 60_000);
      // eslint-disable-next-line no-await-in-loop
      report = await syncNow(laptop.store, world.remote, {
        trigger: SYNC_TRIGGERS.MANUAL,
        now: world.now(),
      });
      // eslint-disable-next-line no-await-in-loop
      const state = await deletionForClient(laptop.store, departing.record_id);
      if (state?.status === 'propagated') break;
    }

    const settled = await deletionForClient(laptop.store, departing.record_id);
    assert.equal(
      settled?.status,
      'propagated',
      'the core marked it propagated only after READING THE AREA BACK and finding it clear',
    );
    assert.deepEqual(report?.deletions.still_present, []);

    const reading = await readingFrom(laptop.store);
    assert.deepEqual(reading.pending.items, [], 'so nothing is pending any more');

    const done = describeRemovals(reading);
    assert.equal(done.count, 0);
    assert.equal(done.settled, true);
    assert.match(done.intro, /confirmed gone from your Google Drive backup/i);
  });
});

describe('when nothing is waiting', () => {
  it('reads as a normal state rather than as an empty screen, and still draws the standing sentence', () => {
    const report = describeRemovals(NOTHING_AWAITING_REMOVAL);

    assert.equal(report.count, 0);
    assert.equal(report.settled, true);
    assert.equal(report.meaning, NOT_CONFIRMED_IS_NOT_STILL_THERE);

    const html = render(NOTHING_AWAITING_REMOVAL);
    assert.ok(html.includes(REMOVALS_TITLE));
    assert.ok(
      html.includes(NOT_CONFIRMED_IS_NOT_STILL_THERE),
      'the sentence is drawn in BOTH states: it is equally true on the good day, and a warning that '
        + 'only appears on the bad one is one he has to learn the meaning of at the worst moment',
    );
  });

  it('is what a store where nobody was ever removed actually produces, not a hand-written blank', async () => {
    const world = aWorld();
    worlds.push(world);
    const laptop = await world.device('coach-laptop');
    const reading = await readingFrom(laptop.store);

    assert.deepEqual(reading.pending.items, []);
    assert.equal(
      describeRemovals(reading).intro,
      describeRemovals(NOTHING_AWAITING_REMOVAL).intro,
      'the seam\'s empty value says exactly what the real call over an untouched store says',
    );
  });
});

describe('the way in from Admin', () => {
  it('is worded for both states and never promises to finish the removal', async () => {
    const world = aWorld();
    worlds.push(world);
    const quiet = await world.device('coach-laptop');
    const empty = describeRemovalsAdminEntry(await readingFrom(quiet.store));
    assert.equal(empty.settled, true);
    assert.equal(empty.count, 0);
    assert.equal(empty.linkLabel, 'Check for yourself');

    const { laptop } = await anUnconfirmedRemoval();
    const busy = describeRemovalsAdminEntry(await readingFrom(laptop.store));
    assert.equal(busy.settled, false);
    assert.equal(busy.count, 1);
    assert.ok(
      !/finish|fix|force|delete now|remove now/i.test(busy.linkLabel),
      'the link must not promise more than the screen behind it delivers',
    );
    assert.equal(busy.title, empty.title);

    // AND THE VERB AGREES WITH THE COUNT. It did not: with one removal pending the Admin screen
    // read "1 removal ARE done on this device", which is the number the coach meets first and the
    // only one the sentence got wrong. Found by looking at the rendered screen during the s5 join,
    // with every gate green — the count was interpolated and the verb was not.
    assert.ok(
      busy.intro.startsWith('1 removal is done on this device'),
      `the sentence must open with the singular verb, and it opened with: ${busy.intro}`,
    );
  });

  it('agrees its verb with the count for more than one as well, so neither number is left wrong', async () => {
    const { laptop } = await anUnconfirmedRemoval();
    const second = await laptop.store.create('client', aClient({ name: 'Test Person Second' }));
    await purgeClient(laptop.store, second.record_id);

    const busy = describeRemovalsAdminEntry(await readingFrom(laptop.store));
    assert.equal(busy.count, 2);
    assert.ok(
      busy.intro.startsWith('2 removals are done on this device'),
      `the sentence must open with the plural verb, and it opened with: ${busy.intro}`,
    );
  });

  /**
   * THE SAME BUG, ON THE SCREEN ITSELF, WHICH THE FIX ABOVE NEVER REACHED — and a comment claimed it
   * had.
   *
   * When the Admin entry's verb was corrected during the s5 join, its note ended by saying
   * `describeRemovals` "already agrees its own verb". It did not: it hardcoded "are", and the removals
   * SCREEN went on reading "1 removal you made are done on this device" for every coach who had
   * removed exactly one client — the state he meets first, on the surface whose entire job is to be
   * trusted about a departed client's records.
   *
   * It survived one round of its own fix for two reasons, and both are addressed here rather than one:
   * NOTHING TESTED THE SINGULAR CASE on this function, and a COMMENT ASSERTED THAT IT WAS COVERED,
   * which is what stops the next reader looking. Found in the s7 join walk-through by reading the
   * rendered screen, not the code — no gate was red at any point.
   */
  it('agrees the SCREEN\'S OWN verb with the count too, in both numbers', async () => {
    const { laptop } = await anUnconfirmedRemoval();

    const one = describeRemovals(await readingFrom(laptop.store));
    assert.equal(one.count, 1);
    assert.ok(
      one.intro.startsWith('1 removal you made is done on this device'),
      `the singular sentence is wrong, and it read: ${one.intro}`,
    );

    const second = await laptop.store.create('client', aClient({ name: 'Test Person Second' }));
    await purgeClient(laptop.store, second.record_id);

    const two = describeRemovals(await readingFrom(laptop.store));
    assert.equal(two.count, 2);
    assert.ok(
      two.intro.startsWith('2 removals you made are done on this device'),
      `the plural sentence is wrong, and it read: ${two.intro}`,
    );
  });

  it('agrees it in the found-records-still-there wording as well, which is a different branch', async () => {
    // The intro has TWO non-empty branches, chosen by whether the read-back found anything. Fixing the
    // verb in one and not the other is exactly how this bug got here, so both are driven.
    //
    // The manifest comes from a REAL removal on a real store, and the remote half goes through
    // `remoteConfirmationFrom` — a7's own derivation — rather than being written by hand here. A
    // hand-built shape is what this file already warns against: it agrees with itself and with nothing
    // the application produces, and the first attempt at this test proved the point by throwing on a
    // field the real manifest carries and the invented one did not.
    const { laptop } = await anUnconfirmedRemoval();
    const real = await readingFrom(laptop.store);
    assert.equal(real.pending.items.length, 1, 'the premise: exactly one real manifest to talk about');

    const manifest = real.pending.items[0];
    const stillThere: RemovalsReading = {
      ...real,
      remote: remoteConfirmationFrom({
        deletions: {
          still_present: [{
            deletion_id: manifest.deletion_id,
            found: [manifest.subject_client_id],
          }],
        },
      }),
    };

    const report = describeRemovals(stillThere);
    assert.equal(report.confirmedPresent, 1, 'the branch under test must actually have been taken');
    assert.ok(
      report.intro.startsWith('1 removal you made is done on this device'),
      `the still-there branch has the wrong verb, and it read: ${report.intro}`,
    );
    assert.match(report.intro, /found records still there/);
  });
});

/**
 * THE STATE THIS SCREEN NEVER HAD BEFORE THE STORE WAS WIRED, AND IT IS THE ONE THAT MATTERS.
 *
 * Every test above renders on a device whose local store opened. A local store can also refuse — a
 * private window, a device with no room, another window holding the old version open — and until the
 * store was wired there was no such thing as this screen being asked on a device that had not
 * answered yet.
 *
 * The failure being asserted against is precise: the seam's empty reading says "nothing is waiting",
 * and the report built from it says every removal is confirmed gone from the backup. Rendering THAT
 * on a store which never opened would be this screen telling him the good news on the strength of
 * never having looked — the same belief `core/sync/deletions.js` opens by naming, arriving through
 * the screen built to correct it. So it is asserted that the reassuring sentence is ABSENT, not
 * merely that a notice is present: a notice above the old words would still have said them.
 */
describe('when the local store has not opened', () => {
  const REASSURANCE = describeRemovals(NOTHING_AWAITING_REMOVAL).intro;

  /** The two states that are not `open`, each with what the coach must be told in it. */
  const NOT_OPEN: Array<{ what: string; opening: LocalStoreOpening }> = [
    { what: 'still opening', opening: STILL_OPENING },
    {
      what: 'could not be opened',
      opening: {
        state: 'unavailable',
        condition: describeOpeningFailure(new Error('This browser has no local database, so nothing could be saved on this device.')),
      },
    },
  ];

  for (const { what, opening } of NOT_OPEN) {
    it(`does NOT say every removal is confirmed gone when the store is ${what}`, () => {
      const html = render(NOTHING_AWAITING_REMOVAL, opening);

      assert.ok(
        !html.includes(REASSURANCE),
        `the screen reported "nothing is waiting" from a store that is ${what}. That is a claim about `
          + 'the coach\'s backup made without having read anything, and it is the precise false good '
          + 'news this whole surface exists to prevent.',
      );
    });

    it(`still renders, still says where he is, and says something when the store is ${what}`, () => {
      const html = render(NOTHING_AWAITING_REMOVAL, opening);

      assert.ok(
        html.includes('id="screen-removals"'),
        'the screen went blank rather than reporting the condition. The standing rule is that this '
          + 'application always opens and always works; a store that will not open is a state to '
          + 'REPORT, never an empty frame.',
      );
      assert.ok(
        html.includes(REMOVALS_TITLE),
        'the screen stopped naming itself, so a coach who arrived from a stale link cannot tell where he is',
      );
      assert.ok(
        html.length > `id="screen-removals"${REMOVALS_TITLE}`.length + 100,
        'the screen rendered a heading and nothing else, which is a blank screen with a title on it',
      );
    });
  }

  it('says what is wrong and what he can do about it, in his words rather than as an exception', () => {
    const condition = describeOpeningFailure(
      new Error('This browser has no local database, so nothing could be saved on this device.'),
    );
    const html = render(NOTHING_AWAITING_REMOVAL, { state: 'unavailable', condition });

    assert.ok(html.includes(condition.headline), 'the refusal is not named on the screen');
    assert.ok(html.includes(condition.whatToDo), 'the screen does not say what he can do about it');
    assert.ok(
      !html.includes('IndexedDB') && !html.includes('StoreWriteError'),
      'the screen put the machinery in front of the coach. The browser\'s own words are kept verbatim '
        + 'because he may have to read them out, but they are never what the screen SAYS.',
    );
  });
});
