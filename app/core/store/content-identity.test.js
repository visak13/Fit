/**
 * TWO DEVICES, ONE LIBRARY, TWO IDENTITIES — the merge that could not happen, and the convergence
 * that has to.
 *
 * ## What was measured, on the real application, before any of this existed
 *
 * s11/a9 drove two real browser profiles. Seeding runs when the store OPENS — inside the opening,
 * deliberately before the store is published as open — so both devices seed the shipped library
 * before either can possibly have synchronised. `importRecords` mints a fresh `record_id` per
 * envelope while the content key stays the shipped one. Result, read straight out of IndexedDB on
 * both devices: ALL 99 shipped exercises share the same `content.id` and ZERO of 99 share a
 * `record_id`. `by_content_key` is UNIQUE, so the first shipped record to arrive from the other
 * device was refused — `StoreWriteError: ConstraintError` — and the refusal threw out of the whole
 * pass, taking every record behind it, INCLUDING clients and sessions, which have no content key and
 * cannot collide. Nothing merged, ever, in either direction, under a green indicator.
 *
 * ## The cheapest reproduction needs no second device and no courier at all
 *
 * That is the first test below, and it is a9's own test (b): ask ONE store to file one of ITS OWN
 * library records under a different `record_id`. The index refuses it. The mechanism is entirely
 * local, so a harness cannot have manufactured it.
 *
 * ## What this file is really guarding, which is not the absence of an error
 *
 * The dangerous fix is the one that makes the ConstraintError go away: drop the unique index, and a
 * refused merge becomes a library that grows a second copy of every shipped exercise on every single
 * pass. It would pass a naive count assertion on the day it shipped. So every test here counts BOTH
 * sides and asserts the identity that survived, and the convergence test drives the exchange in BOTH
 * DIRECTIONS — because a reconciliation that keeps the local identity, or one that adopts the
 * incoming one, both look perfect from one side and never converge from two.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { anExercise, aClient, aRoutine, T0, T1 } from '../model/fixtures.js';
import { createEnvelope, reviseEnvelope } from '../model/model.js';
import { APPLY, openLocalStore, reconcileOnContentKey } from './local-store.js';
import { createLaptop } from './testing/platform-double.js';

/** Two identities, fixed and ORDERED, so "the smaller one survives" is a checkable claim. */
const SMALLER = '11111111-1111-4111-8111-000000000001';
const LARGER = '99999999-9999-4999-8999-000000000009';

async function aStore(device = 'coach-laptop') {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device });
  return store;
}

/** The same shipped exercise as another device would hold it: same content, its own identity. */
const asWrittenBy = (device, recordId, over = {}) => createEnvelope({
  type: 'exercise',
  content: anExercise({ id: 'bicycle-crunch', ...over }),
  device,
  now: T0,
  record_id: recordId,
});

test('a9 test (b): ONE store, no courier, no second profile — the same content under a second identity', async () => {
  const store = await aStore();
  const mine = await store.create('exercise', anExercise({ id: 'bicycle-crunch' }), { now: T0 });
  assert.equal(await store.count('exercise'), 1);

  // Exactly what the other device sends: the same shipped exercise, under an identity this device
  // has never seen. Before the reconciliation existed this threw StoreWriteError: ConstraintError,
  // and there was nothing between that throw and the whole pass dying.
  const theirs = asWrittenBy('coach-phone', LARGER);
  const outcome = await store.putRecord(theirs);

  assert.equal(outcome.outcome, APPLY.RECONCILED,
    'the two identities became one — not applied beside it, and not refused');
  assert.equal(await store.count('exercise'), 1,
    'CONDITION TWO: one shipped exercise before, one after. Never two.');

  const survivor = await store.getByContentKey('exercise', 'bicycle-crunch');
  assert.equal(survivor.record_id, mine.record_id < LARGER ? mine.record_id : LARGER);
  assert.equal(outcome.retired_record_id, survivor.record_id === LARGER ? mine.record_id : LARGER);
  assert.equal(await store.get('exercise', outcome.retired_record_id), undefined,
    'and the identity that lost is gone rather than sitting there as a second row');

  await store.close();
});

test('a device that seeded independently RECEIVES, in BOTH directions, and both land on ONE identity', async () => {
  // Two stores that have never met. Each holds the same shipped exercise under its own identity,
  // exactly as first-open seeding leaves them.
  const laptop = await aStore('coach-laptop');
  const phone = await aStore('coach-phone');

  const onLaptop = asWrittenBy('coach-laptop', SMALLER);
  const onPhone = asWrittenBy('coach-phone', LARGER);
  await laptop.putRecord(onLaptop);
  await phone.putRecord(onPhone);
  assert.equal(await laptop.count('exercise'), 1);
  assert.equal(await phone.count('exercise'), 1);

  // The exchange, both ways, with NEITHER device having heard the other's answer first. This is the
  // arrangement that kills "keep the local identity" (both keep their own, for ever) and "take the
  // incoming identity" (they swap, for ever). Neither device is told which to pick; both compute it.
  const ontoPhone = await phone.putRecord(onLaptop);
  const ontoLaptop = await laptop.putRecord(onPhone);
  assert.equal(ontoPhone.outcome, APPLY.RECONCILED);
  assert.equal(ontoLaptop.outcome, APPLY.RECONCILED);

  const here = await laptop.getByContentKey('exercise', 'bicycle-crunch');
  const there = await phone.getByContentKey('exercise', 'bicycle-crunch');
  assert.equal(here.record_id, there.record_id,
    'CONDITION ONE, the part that matters: ONE identity, computed independently on both devices');
  assert.equal(here.record_id, SMALLER, 'and it is the smaller of the two, by the stated rule');
  assert.deepEqual(here, there, 'the whole envelope, field for field, on both devices');

  assert.equal(await laptop.count('exercise'), 1, 'one before, one after');
  assert.equal(await phone.count('exercise'), 1, '113 must not become 226, at n = 1');

  await laptop.close();
  await phone.close();
});

test('the SAME arrival a second time writes NOTHING — the other device\'s area keeps sending it', async () => {
  const store = await aStore();
  await store.putRecord(asWrittenBy('coach-laptop', SMALLER));
  const first = await store.putRecord(asWrittenBy('coach-phone', LARGER));
  assert.equal(first.outcome, APPLY.RECONCILED);

  // The phone's area still carries its old identity until the phone compacts, so this arrives on
  // every pass. A reconciliation that rewrote the record each time would put an import entry in the
  // log, and an announcement on the channel, for a change nobody made.
  const again = await store.putRecord(asWrittenBy('coach-phone', LARGER));
  assert.equal(again.outcome, APPLY.KEPT_LOCAL, 'nothing to do, and it says so');
  assert.equal(await store.count('exercise'), 1);
  await store.close();
});

test('the CONTENT is decided by last-write-wins, and the identity separately', async () => {
  const store = await aStore();
  const local = asWrittenBy('coach-laptop', SMALLER);
  await store.putRecord(local);

  // The other device's copy is genuinely ahead — a later revision of the same content key under its
  // own identity. The survivor keeps the smaller identity AND the winning content.
  const ahead = reviseEnvelope(
    asWrittenBy('coach-phone', LARGER), anExercise({ id: 'bicycle-crunch', name: 'Bicycle crunch on the mat' }),
    { device: 'coach-phone', now: T1 },
  );
  const outcome = await store.putRecord(ahead);

  assert.equal(outcome.outcome, APPLY.RECONCILED);
  const survivor = await store.getByContentKey('exercise', 'bicycle-crunch');
  assert.equal(survivor.record_id, SMALLER, 'identity: the smaller');
  assert.equal(survivor.content.name, 'Bicycle crunch on the mat', 'content: the later');
  assert.equal(survivor.rev, ahead.rev, 'and the revision it won at');
  await store.close();
});

test('the survivor is a FUNCTION OF THE PAIR — the same answer whichever side computes it', () => {
  const a = asWrittenBy('coach-laptop', SMALLER);
  const b = asWrittenBy('coach-phone', LARGER);

  const fromA = reconcileOnContentKey(a, b);
  const fromB = reconcileOnContentKey(b, a);
  assert.deepEqual(fromA, fromB,
    'no argument order anywhere in this may change the answer, or two devices converge on two records');

  // The total tie is the case `laterOf` cannot settle, because it compares two revisions of ONE
  // record and there is no identity left to break on. Here there is, and it must be used.
  const twin = { ...a, record_id: LARGER };
  assert.equal(reconcileOnContentKey(a, twin).record_id, SMALLER);
  assert.equal(reconcileOnContentKey(twin, a).record_id, SMALLER);
});

test('importRecords reconciles too, because a RESTORE carries the other device\'s identities', async () => {
  const store = await aStore();
  await store.create('exercise', anExercise({ id: 'bicycle-crunch' }), { now: T0 });
  await store.create('routine', aRoutine({ id: 'push-day', entries: [{ exercise_id: 'bicycle-crunch', sets: 3 }] }), { now: T0 });
  const before = await store.count('exercise');

  // A backup taken on the other device: the same shipped content, that device's identities.
  const result = await store.importRecords([
    asWrittenBy('coach-phone', LARGER),
    createEnvelope({
      type: 'exercise', content: anExercise({ id: 'shoulder-press' }), device: 'coach-phone', now: T0,
    }),
  ]);

  assert.equal(result.reconciled, 1, 'the twin was reconciled rather than refusing the whole import');
  assert.equal(result.written, 2);
  assert.equal(await store.count('exercise'), before + 1,
    'one genuinely new exercise arrived and the twin did NOT become a second copy');
  await store.close();
});

test('a record with no content key is untouched by any of this', async () => {
  const store = await aStore();
  const fromThePhone = createEnvelope({
    type: 'client', content: aClient({ name: 'Bo Example' }), device: 'coach-phone', now: T0,
  });
  const outcome = await store.putRecord(fromThePhone);
  assert.equal(outcome.outcome, APPLY.APPLIED, 'clients arrive as clients always did');
  assert.equal(await store.count('client'), 1);
  await store.close();
});
