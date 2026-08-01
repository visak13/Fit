/**
 * TWO DEVICES THAT SEEDED INDEPENDENTLY, MERGING — and the indicator that may not say otherwise.
 *
 * ## The three things proven here, and they are separable on purpose
 *
 *  1. **CONDITION ONE.** Two stores that each seeded the REAL shipped library — 113 records, minted
 *     independently — exchange work over real passes, in BOTH DIRECTIONS, and each receives what the
 *     other made. Everything is read back OUT OF THE STORE: the count AND the arriving record itself.
 *     Never off a report, and never off a screen's own success message.
 *  2. **CONDITION TWO.** 113 does not become 226. Asserted positively, before and after, on the
 *     receiving device — because the dangerous fix for this defect is the one that drops the unique
 *     index, which makes the error disappear and replaces a refused merge with a library that grows a
 *     second copy of every shipped exercise on every pass.
 *  3. **CONDITION THREE.** A pass that could not write a record does not report success, whatever the
 *     cause. It is proven by INJECTING a refusal rather than by the content-key collision, because the
 *     class being closed is "an apply was refused", not "an apply was refused by the one index we
 *     already know about" — and the injection also proves the second half, which is that every record
 *     BEHIND the refused one still arrives. That was the sharpest measured fact of the original
 *     defect: the first colliding exercise threw out of the entire pass, so a CLIENT — which has no
 *     content key and can never collide — never crossed either.
 *
 * ## And the direction that is just as easy to get wrong
 *
 * A pass with nothing to do still reads as up to date. An indicator that reports trouble whenever
 * anything is uncertain is the same defect inverted, and it would pass every test above.
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { aClient, aPerformedRecord, aRoutine, aSession } from '../model/fixtures.js';
import { LIBRARY_TYPES } from '../model/vocabularies.js';
import { checkRoutineReferences, referencesByRecordIdentity } from '../model/referential.js';
import { seedIfNeeded } from '../seed/seed.js';
import { SPACES } from '../remote/remote.js';
import { LEVEL, accountabilityStatus, lastSyncedAt, readLastCompletedSync, recordCompletedSync } from '../status/status.js';
import { REASON } from '../status/reasons.js';
import { SYNC_TRIGGERS, syncNow } from './engine.js';
import { T0, aWorld } from './testing.js';
import { WITHHELD } from './withheld.js';

const SPACE = SPACES.VISIBLE;

/** Everything the shipped library holds, per `core/seed/content.js`: 99 + 7 + 7. */
const SHIPPED = 113;

const sync = (dev, world, trigger = SYNC_TRIGGERS.MANUAL) => syncNow(dev.store, world.remote, {
  trigger, now: world.now(), space: SPACE,
});

/** The shipped library on this device, counted out of the store rather than out of a report. */
async function shippedCount(dev) {
  const counts = await Promise.all(
    ['exercise', 'routine', 'intensity-pattern'].map((type) => dev.store.count(type)),
  );
  return counts.reduce((total, n) => total + n, 0);
}

/**
 * A device as the coach's really is: opened, and therefore seeded, before it has ever synchronised.
 *
 * That order is not a convenience of the test. Seeding happens INSIDE the opening of the store and
 * before the store is published as open, so there is no arrangement of the real application in which
 * a device can synchronise first.
 */
async function anInstalledDevice(world, tag) {
  const dev = await world.device(tag);
  const seeded = await seedIfNeeded(dev.store, { now: world.now() });
  assert.equal(seeded.imported, true, `${tag} seeded its own library on first open`);
  assert.equal(await shippedCount(dev), SHIPPED);
  return dev;
}

describe('sync/independent-seeding — the two devices the coach actually has', () => {
  it('CONDITION ONE and TWO: each device receives the other, in BOTH directions, with no duplicates', async () => {
    const world = aWorld();
    after(() => world.close());

    const laptop = await anInstalledDevice(world, 'coach-laptop');
    const phone = await anInstalledDevice(world, 'coach-phone');

    // The two libraries are the same content under entirely different identities, which is the
    // artefact a9 read out of IndexedDB on two real profiles. Asserted here so that everything below
    // is measured against the real starting state rather than a convenient one.
    const hereFirst = await laptop.store.getByContentKey('exercise', 'bicycle-crunch');
    const thereFirst = await phone.store.getByContentKey('exercise', 'bicycle-crunch');
    assert.equal(hereFirst.content.id, thereFirst.content.id, 'same content key');
    assert.notEqual(hereFirst.record_id, thereFirst.record_id, 'DIFFERENT record identity');

    // ── laptop → phone ───────────────────────────────────────────────────────────────────────
    const ana = await laptop.store.create('client', aClient({ name: 'Ana Example' }), { now: world.now() });
    world.advance(60_000);
    await sync(laptop, world);

    const phoneBefore = await shippedCount(phone);
    world.advance(60_000);
    const ontoPhone = await sync(phone, world);
    assert.deepEqual(ontoPhone.failures, [], 'nothing failed');
    assert.deepEqual(ontoPhone.pulled.refused, [], 'and nothing was refused');

    // OUT OF THE STORE. The report is not evidence that a record arrived; the record is.
    const anaOnPhone = await phone.store.get('client', ana.record_id);
    assert.ok(anaOnPhone, 'the laptop\'s client is ON THE PHONE — this is the whole action');
    assert.equal(anaOnPhone.content.name, 'Ana Example');
    assert.equal(await phone.store.count('client'), 1);
    assert.equal(await shippedCount(phone), phoneBefore,
      `CONDITION TWO: ${SHIPPED} shipped records before the merge and ${SHIPPED} after. Not 226.`);

    // ── phone → laptop. A fix proven only one way is half a fix. ─────────────────────────────
    const bo = await phone.store.create('client', aClient({ name: 'Bo Example' }), { now: world.now() });
    world.advance(60_000);
    await sync(phone, world);

    const laptopBefore = await shippedCount(laptop);
    world.advance(60_000);
    const ontoLaptop = await sync(laptop, world);
    assert.deepEqual(ontoLaptop.failures, []);
    assert.deepEqual(ontoLaptop.pulled.refused, []);

    const boOnLaptop = await laptop.store.get('client', bo.record_id);
    assert.ok(boOnLaptop, 'and the phone\'s client is ON THE LAPTOP');
    assert.equal(boOnLaptop.content.name, 'Bo Example');
    assert.equal(await shippedCount(laptop), laptopBefore, 'no duplicates on this side either');

    // The libraries have converged on ONE identity per content key, computed independently on each
    // device with nothing passed between them but the records themselves.
    const here = await laptop.store.getByContentKey('exercise', 'bicycle-crunch');
    const there = await phone.store.getByContentKey('exercise', 'bicycle-crunch');
    assert.equal(here.record_id, there.record_id, 'ONE identity, on both devices');
    assert.equal(await laptop.store.count('exercise'), 99);
    assert.equal(await phone.store.count('exercise'), 99);
  });

  it('a second and third pass move nothing new and STILL do not duplicate anything', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await anInstalledDevice(world, 'coach-laptop');
    const phone = await anInstalledDevice(world, 'coach-phone');

    await laptop.store.create('client', aClient({ name: 'Ana Example' }), { now: world.now() });
    for (const dev of [laptop, phone, laptop, phone, phone]) {
      world.advance(60_000);
      // eslint-disable-next-line no-await-in-loop
      const report = await sync(dev, world);
      // eslint-disable-next-line no-await-in-loop
      assert.deepEqual(report.pulled.refused, [], 'no pass refuses anything');
      // eslint-disable-next-line no-await-in-loop
      assert.equal(await shippedCount(dev), SHIPPED, 'and the library stays exactly the shipped set');
    }
    assert.equal(await phone.store.count('client'), 1, 'the client arrived once and stayed once');
  });
});

describe('sync/independent-seeding — CONDITION THREE: a refused apply is never a success', () => {
  /**
   * Make this store refuse ONE record, the way the platform refuses one: by throwing out of the
   * write. The cause is deliberately not the content-key index — that one is fixed, and a proof that
   * rested on it would prove only that the fixed thing is fixed. What has to hold is that ANY refusal
   * reaching this seam is reported rather than thrown past everything.
   */
  function refuseOneRecord(store, recordId) {
    const original = store.putRecord.bind(store);
    store.putRecord = async (record) => {
      if (record.record_id !== recordId) return original(record);
      const error = new Error('Unable to add key to index "by_content_key": at least one key does not satisfy the uniqueness requirements.');
      error.name = 'StoreWriteError';
      throw error;
    };
  }

  it('the pass survives it, says so, and every record BEHIND it still arrives', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    const refused = await laptop.store.create('client', aClient({ name: 'Ana Example' }), { now: T0 });
    const behindIt = await laptop.store.create('client', aClient({ name: 'Bo Example' }), { now: T0 });
    world.advance(60_000);
    await sync(laptop, world);

    refuseOneRecord(phone.store, refused.record_id);
    world.advance(60_000);
    const report = await sync(phone, world);

    // Before the fence existed this threw out of syncNow entirely — `attempt()` catches RemoteError
    // and rethrows everything else — so there was no report at all, and the only trace anywhere was
    // an unhandled rejection in a console the coach will never open.
    assert.equal(report.pulled.refused.length, 1, 'the refusal is a REPORTED fact');
    assert.equal(report.pulled.refused[0].record_id, refused.record_id);
    assert.equal(report.pulled.refused[0].type, 'client');
    assert.match(report.pulled.refused[0].why, /StoreWriteError/);

    assert.ok(await phone.store.get('client', behindIt.record_id),
      'AND THE RECORD BEHIND IT ARRIVED. One record this store would not take must not stop the '
      + 'coach\'s phone from receiving anything at all.');
    assert.equal(await phone.store.get('client', refused.record_id), undefined,
      'the refused one is genuinely not here — this is not a test of a refusal that did not happen');

    assert.equal(report.completion, null, 'and the pass did NOT earn a completion');
    assert.equal(report.completion_withheld?.code, WITHHELD.RECORDS_REFUSED);

    const { recorded } = await recordCompletedSync(phone.store, report, { now: world.now() });
    assert.equal(recorded, false, 'so no last-backed-up time is written over a pass that did not');
  });

  it('THE WORDS: the indicator does not say backed up, and it offers the one thing he can do', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    // The phone has genuinely backed up before, so `never_synchronised` — which outranks everything
    // below it — is not what we would be reading instead.
    await phone.store.create('client', aClient({ name: 'His own work' }), { now: T0 });
    const clean = await sync(phone, world);
    assert.ok(clean.completion, 'the device starts from a genuine green');
    await recordCompletedSync(phone.store, clean, { now: world.now() });
    const green = lastSyncedAt((await readLastCompletedSync(phone.store)).completion);

    const refused = await laptop.store.create('client', aClient({ name: 'Ana Example' }), { now: world.now() });
    world.advance(60_000);
    await sync(laptop, world);

    refuseOneRecord(phone.store, refused.record_id);
    world.advance(60_000);
    const report = await sync(phone, world);
    const status = await accountabilityStatus(phone.store, { now: world.now(), last_attempt: report });

    assert.equal(status.refused_applies, 1);
    assert.equal(status.reason?.code, REASON.RECORDS_REFUSED,
      'the one line he reads is about the work that did not arrive');
    assert.match(status.reason.message, /could not be saved on this device/);
    assert.match(status.reason.message, /has not been lost/,
      'and it says which way round it is, because those need different responses');
    assert.equal(status.reason.action, 'sync_now',
      'with the one act available to him attached — the trigger exists and nothing reached it');

    assert.equal(status.blocks_application, false, 'and none of it blocks the application');
    await recordCompletedSync(phone.store, report, { now: world.now() });
    assert.equal(lastSyncedAt((await readLastCompletedSync(phone.store)).completion), green,
      'last-backed-up does not advance over a pass that did not hold his other device\'s work');
  });

  it('AND THE OTHER DIRECTION: a pass with nothing to do still reads as up to date', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');

    await laptop.store.create('client', aClient({ name: 'His own work' }), { now: T0 });
    const first = await sync(laptop, world);
    await recordCompletedSync(laptop.store, first, { now: world.now() });

    // Nothing has happened since. This is the state an over-corrected indicator gets wrong, and it
    // would pass every assertion above while doing so.
    world.advance(60_000);
    const quiet = await sync(laptop, world);
    assert.deepEqual(quiet.pulled.refused, [], 'nothing refused');
    assert.ok(quiet.completion, 'a pass with nothing to do still completes');
    assert.equal(quiet.completion_withheld, null);
    await recordCompletedSync(laptop.store, quiet, { now: world.now() });

    const status = await accountabilityStatus(laptop.store, { now: world.now(), last_attempt: quiet });
    assert.equal(status.work_not_in_the_backup, false);
    assert.equal(status.refused_applies, 0);
    assert.equal(status.level, LEVEL.UP_TO_DATE, 'and it says so');
    assert.equal(status.reason, null, 'with nothing to report, because there is nothing to report');
  });
});

describe('sync/independent-seeding — CONDITION THREE asked of the STORE: is his work in the backup?', () => {
  it('a record saved with NO PASS RUN is not backed up, and the surface stops saying it is', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');

    await laptop.store.create('client', aClient({ name: 'His own work' }), { now: T0 });
    const first = await sync(laptop, world);
    await recordCompletedSync(laptop.store, first, { now: world.now() });
    const clean = await accountabilityStatus(laptop.store, { now: world.now(), last_attempt: first });
    assert.equal(clean.level, LEVEL.UP_TO_DATE, 'genuinely green first — the non-vacuity of what follows');

    // He saves something. No pass has run, and the next automatic opportunity is up to fifteen
    // minutes away. The QUEUE is empty — a record only enters it during a pass's push step — so every
    // figure this surface used to be built from reads perfectly clean about work that is in exactly
    // one place in the world.
    world.advance(60_000);
    await laptop.store.create('client', aClient({ name: 'Cal Example' }), { now: world.now() });

    const status = await accountabilityStatus(laptop.store, { now: world.now(), last_attempt: first });
    assert.equal(status.undelivered, 0, 'THE QUEUE IS EMPTY — this is the trap, stated as a figure');
    assert.equal(status.work_not_in_the_backup, true, 'and the STORE knows better');
    assert.notEqual(status.level, LEVEL.UP_TO_DATE,
      'so nothing here may say everything is backed up');
    assert.equal(status.reason?.code, REASON.NOT_YET_BACKED_UP);
    assert.equal(status.reason.action, 'sync_now');
    assert.ok(status.oldest_undelivered_age_ms >= 0,
      'and the ladder can climb on it, which it could not while the figure came from the queue');

    // One pass, and it is honest in the other direction again.
    world.advance(60_000);
    const second = await sync(laptop, world);
    await recordCompletedSync(laptop.store, second, { now: world.now() });
    const back = await accountabilityStatus(laptop.store, { now: world.now(), last_attempt: second });
    assert.equal(back.work_not_in_the_backup, false, 'it is in the backup now, and the store says so');
    assert.equal(back.level, LEVEL.UP_TO_DATE);
  });

  it('a record that ARRIVED from the other device is in the backup by definition, and is not counted', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    await laptop.store.create('client', aClient({ name: 'Ana Example' }), { now: T0 });
    await sync(laptop, world);

    world.advance(60_000);
    const pulled = await sync(phone, world);
    await recordCompletedSync(phone.store, pulled, { now: world.now() });
    assert.equal(await phone.store.count('client'), 1, 'it genuinely arrived');

    // Every record a pull applies lands above this device's push cursor. Counting it as unbacked-up
    // work would make a device that had just RECEIVED CORRECTLY start telling the coach his work was
    // not backed up — this fix inverted, and it would pass every assertion in the section above.
    const status = await accountabilityStatus(phone.store, { now: world.now(), last_attempt: pulled });
    assert.equal(status.work_not_in_the_backup, false,
      'it came OUT of the backup, so it is in it');
    assert.equal(status.level, LEVEL.UP_TO_DATE);
  });
});

/**
 * RECONCILING IDENTITY MEANS ONE SIDE'S `record_id` STOPS EXISTING. WHAT POINTED AT IT?
 *
 * The reconciliation retires the losing `record_id` and REMOVES the row. If anything else in the
 * coach's data pointed at that id, his history would be intact by COUNT and broken by REFERENCE — on
 * the device that did nothing wrong, delivered by the change written to make merging safe. A count
 * cannot see that, and every count in the evidence above would still read correct.
 *
 * ## The answer, and it is structural rather than lucky
 *
 * The model's reference set is DERIVED from the validators — `referencesByRecordIdentity()` runs each
 * one and reads back which format every field demands — and every reference INTO the library is BY
 * CONTENT KEY:
 *
 *     routine.entries[].exercise_id  ->  exercise      content key
 *     session.routine_id             ->  routine       content key
 *     performed-record.exercise_id   ->  exercise      content key  (checkContentKey, not checkRecordId)
 *     session.client_ids[]           ->  client        RECORD identity
 *     performed-record.{client,session}_id, reading.{client,session}_id,
 *     session-note.{client,session}_id, diet-plan.client_id  ->  RECORD identity
 *
 * EIGHT references are by record identity, and every one of them names a CLIENT or a SESSION.
 * `LIBRARY_TYPES` — the exact list the reconciliation is gated on — contains neither. So no reference
 * in the model can point at a `record_id` this code retires, and the content key a reference DOES use
 * is the very key both sides are reconciled ON: it is preserved by construction, because it is the
 * thing being matched.
 *
 * The count is stated here as a fact of the moment, NOT as the thing under test: the assertion below
 * derives the set afresh and asks only whether any member of it names a library type. Seven of these
 * eight were invisible to the previous form of that assertion, which filtered a hand-written list.
 *
 * That is an argument. Below it is measured instead, on the losing device, after a real pass.
 */
describe('sync/independent-seeding — what pointed at the identity that stopped existing', () => {
  it('the model enforces no reference into the library by record identity, and none into a reconciled type at all', () => {
    // DERIVED BY RUNNING THE VALIDATORS, not read off a list. s11/a32 measured what the previous
    // form of this assertion was worth: it filtered three lines of prose that named ONE of the
    // EIGHT identity references the validators declare, so a32 added a reference into the library
    // by record identity — the exact thing the message below promises to catch — and this stayed
    // GREEN, with all of core/model green beside it. The set now comes from `referential.js`'s
    // derivation, which asks each validator what format each of its fields demands.
    const byRecordIdentity = referencesByRecordIdentity();

    // NON-VACUITY, and it is a FLOOR rather than a count to keep in step: a derivation that threw,
    // read nothing, or lost its field lists would report "nothing points into the library" for
    // free, which is this whole family of defect turned on itself.
    assert.ok(byRecordIdentity.length >= 8,
      `only ${byRecordIdentity.length} references by record identity were derived from the validators, `
      + 'so "none of them points into the library" is an answer about an empty derivation rather '
      + 'than about the model');
    // POSITIVE CONTROL: the reference everybody already knows is there must be in the answer. A
    // derivation that silently stopped naming it would satisfy the floor above on the other seven.
    assert.ok(
      byRecordIdentity.some((r) => r.from === 'session' && r.path === 'client_ids[]' && r.to === 'client'),
      'the derivation cannot find session.client_ids[] -> client, a reference the model demonstrably '
      + 'declares, so its silence about the library means nothing at all',
    );

    const intoLibrary = byRecordIdentity
      .filter((r) => LIBRARY_TYPES.includes(r.to))
      .map((r) => `${r.from}.${r.path} -> ${r.to}`);
    assert.deepEqual(intoLibrary, [],
      'A REFERENCE INTO THE LIBRARY BY RECORD IDENTITY NOW EXISTS. Identity reconciliation retires '
      + 'one side\'s record_id and removes the row, so somebody has to decide what happens to '
      + `whatever names it: ${intoLibrary.join(', ')}`,
    );
    assert.equal(LIBRARY_TYPES.includes('client'), false,
      'and the type every one of those references names is not one this code ever reconciles');
  });

  it('a session and its history, on the LOSING device, still resolve after the merge retires its exercise id', async () => {
    const world = aWorld();
    after(() => world.close());

    const laptop = await anInstalledDevice(world, 'coach-laptop');
    const phone = await anInstalledDevice(world, 'coach-phone');

    // Which device LOSES is a fact about the two minted ids, not a choice: the survivor is the
    // lexicographically smaller one. So it is read, not assumed, and the coach's work is put on
    // whichever device is about to have its identity retired underneath it.
    const here = await laptop.store.getByContentKey('exercise', 'bicycle-crunch');
    const there = await phone.store.getByContentKey('exercise', 'bicycle-crunch');
    const loser = here.record_id <= there.record_id ? phone : laptop;
    const winner = loser === phone ? laptop : phone;
    const doomedId = (await loser.store.getByContentKey('exercise', 'bicycle-crunch')).record_id;

    // A real week of the coach's own work on the losing device, referencing that exercise.
    const ana = await loser.store.create('client', aClient({ name: 'Ana Example' }), { now: world.now() });
    const routine = await loser.store.create('routine', aRoutine({
      id: 'ana-core-day', name: 'Ana Core Day', split_day: 3, focus: 'core-and-conditioning',
      entries: [{ exercise_id: 'bicycle-crunch', sets: 3, repetitions: 12 }],
      provenance: 'coach-created',
    }), { now: world.now() });
    const session = await loser.store.create('session', aSession({
      routine_id: 'ana-core-day',
      client_ids: [ana.record_id],
      status: 'completed',
      started_at: world.now(),
      ended_at: world.now(),
    }), { now: world.now() });
    const performed = await loser.store.create('performed-record', aPerformedRecord({
      session_id: session.record_id, client_id: ana.record_id,
      exercise_id: 'bicycle-crunch', position: 0, recorded_at: world.now(),
    }), { now: world.now() });

    // The pass that reconciles. The winner pushes its library; the losing device pulls it and its own
    // `bicycle-crunch` identity is retired in favour of the smaller id.
    world.advance(60_000);
    await sync(winner, world);
    world.advance(60_000);
    const merged = await sync(loser, world);
    assert.deepEqual(merged.pulled.refused, [], 'nothing was refused — this is the merged path');

    // The identity really is gone. Without this the rest of the test proves nothing.
    assert.ok(!(await loser.store.get('exercise', doomedId)),
      'the losing record_id stopped existing, which is the premise of the whole question');
    const survivor = await loser.store.getByContentKey('exercise', 'bicycle-crunch');
    assert.ok(survivor, 'and one record still holds the content key');
    assert.notEqual(survivor.record_id, doomedId);
    assert.equal(await shippedCount(loser), SHIPPED + 1,
      `${SHIPPED} shipped plus the one routine he authored himself. Not 226, and not 113 either — `
      + 'his own routine is a library record too and reconciliation must not swallow it',
    );

    // ── now RESOLVE the coach's history through the store, the way the app would ──────────────
    const heldPerformed = await loser.store.get('performed-record', performed.record_id);
    assert.ok(heldPerformed, 'his history is still there');
    const performedExercise = await loser.store.getByContentKey('exercise', heldPerformed.content.exercise_id);
    assert.ok(performedExercise,
      'THE EXERCISE HE ACTUALLY PERFORMED STILL RESOLVES on the device whose identity was retired');
    assert.equal(performedExercise.content.name, survivor.content.name);

    const heldSession = await loser.store.get('session', session.record_id);
    const itsRoutine = await loser.store.getByContentKey('routine', heldSession.content.routine_id);
    assert.ok(itsRoutine, 'the session still resolves its routine');
    assert.equal(itsRoutine.record_id, routine.record_id,
      'and the routine he authored was not reconciled with anything — nothing else holds that key');
    const attendee = await loser.store.get('client', heldSession.content.client_ids[0]);
    assert.ok(attendee, 'the one reference by RECORD IDENTITY still resolves, because clients are never reconciled');
    assert.equal(attendee.content.name, 'Ana Example');

    // And the model's own referential check, run over what the store actually holds afterwards.
    const routines = (await loser.store.read(['routines'], (scope) => scope.page({
      store: 'routines', index: 'by_updated_at', range: null, limit: 200, after: null,
    }))).items.map((record) => record.content);
    const exercises = (await loser.store.read(['exercises'], (scope) => scope.page({
      store: 'exercises', index: 'by_updated_at', range: null, limit: 200, after: null,
    }))).items.map((record) => record.content);
    const check = checkRoutineReferences(routines, exercises);
    assert.deepEqual(check.issues, [],
      'EVERY exercise EVERY routine names still exists after the merge — measured over the whole '
      + 'store, not only the one record this test wired',
    );
  });
});
