/**
 * WHAT A CLASH AND A SKIPPED FILE LEAVE BEHIND — the claim each message makes about the aftermath.
 *
 * ## Why this file exists beside the three that already look at these subjects
 *
 * `divergence-provenance.test.js` proves a clash is DETECTED in both file orderings.
 * `false-green.test.js` proves a pass that skipped a file does not claim a completion.
 * `migration-two-sided.test.js` proves the resolution mark travels in both directions.
 *
 * All three assert what the application SAYS. None of them asserts the separately checkable claim
 * each of those sentences makes about the state it left behind — and that is a different property
 * with a different failure. Every reviewer checks that a refusal is shown rather than thrown; almost
 * nobody checks that what it says about the aftermath is true, and passing the first is what stops
 * anyone looking at the second. Two of these are true on a FRESH device — the state everyone tests in
 * — and would be false exactly where it matters, on a device that already held the coach's work. So
 * every assertion below is taken on a device that ALREADY HELD DATA and the store is read BACK.
 *
 * ## The precondition every conflict claim here rests on, asserted rather than assumed
 *
 * Two devices that never shared a backup have nothing to clash ABOUT, and a green on "the clash
 * surfaced" would then be indistinguishable from "the two stores were never comparable in the first
 * place". So {@link twoDevicesSharingOneBackup} proves the shared footing FIRST, in both directions —
 * a record made on each device is read back on the other — before any divergence is induced.
 *
 * ## And both orderings, separately, because passing one proves nothing about the other
 *
 * The clash is order-dependent at the point of DETECTION: when the higher-revision file is read
 * first, a fold that compares each incoming record against the current winner has already walked past
 * the rev-N copy and sees an ordinary supersede. `areas.js` detects structurally instead, which is
 * why both orderings hold — and the break probe at the foot of this file defeats exactly that,
 * showing the higher-revision-first ordering going RED while the other stays green.
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { aClient } from '../model/fixtures.js';
import { SPACES } from '../remote/remote.js';
import { accountabilityStatus, lastSyncedAt, readLastCompletedSync, recordCompletedSync } from '../status/status.js';
import { REASON } from '../status/reasons.js';
import { readUnion } from './areas.js';
import { SYNC_TRIGGERS, syncNow } from './engine.js';
import { DOCUMENT_KINDS, DOCUMENT_VERSION, encodeDocument } from './payload.js';
import { RESOLUTION, resolveDivergence } from './resolution.js';
import { T0, aWorld } from './testing.js';
import { WITHHELD } from './withheld.js';

const SPACE = SPACES.VISIBLE;

/** One pass on this device. */
const sync = (dev, world) => syncNow(dev.store, world.remote, {
  trigger: SYNC_TRIGGERS.MANUAL, now: world.now(),
});

/** The clashes reported on one record. */
const clashesOn = (reportOrUnion, recordId) => reportOrUnion.divergences
  .filter((d) => d.record_id === recordId);

/**
 * TWO DEVICES GENUINELY SHARING ONE BACKUP — proven, not arranged.
 *
 * A clash between two devices that were never comparable is not a clash, and the failure would be
 * invisible: an empty divergence list reads the same whether nothing clashed or nothing was ever
 * compared. So this asserts the footing in BOTH directions before returning, and every conflict
 * assertion in this file is taken on the world it hands back.
 */
async function twoDevicesSharingOneBackup(world) {
  const laptop = await world.device('coach-laptop');
  const phone = await world.device('coach-phone');

  const shared = await laptop.store.create('client', aClient({ name: 'Shared' }), { now: T0 });
  const fromPhone = await phone.store.create('client', aClient({ name: 'Made on the phone' }), { now: T0 });

  await sync(laptop, world);
  await sync(phone, world);
  world.advance(60_000);
  await sync(laptop, world);

  assert.equal((await phone.store.get('client', shared.record_id))?.content.name, 'Shared',
    'the laptop\'s record is on the phone, so these two devices genuinely share one backup');
  assert.equal((await laptop.store.get('client', fromPhone.record_id))?.content.name, 'Made on the phone',
    'and the phone\'s record is on the laptop. Both directions, because a clash induced between two '
    + 'stores that were never comparable would surface as nothing at all and read as a pass.');

  return { laptop, phone, shared };
}

/**
 * THE MEASURED HISTORY, run in whichever file ordering is asked for.
 *
 * laptop edits; both sync; laptop edits again and pushes; phone edits offline HAVING NEVER SEEN THE
 * LAPTOP; laptop edits once more HAVING NEVER SEEN THE PHONE; phone syncs.
 *
 * `higherRevisionFirst` decides which of the two clashing files the union reads first, and it is the
 * ONLY difference between the two runs:
 *
 *  - `true`  — the laptop's rev 3 is written BEFORE the phone's rev 2. A fold comparing each incoming
 *              record against the current winner has already replaced the laptop's own rev 2 by the
 *              time the phone's arrives, so it sees N+1 against N and reports nothing. THIS IS THE
 *              ORDERING A TEST CAN PASS WHILE THE DEFECT IS FULLY PRESENT.
 *  - `false` — the phone's rev 2 is written first, so both copies are standing when they meet.
 */
async function aClashBetweenTwoDevices(world, { higherRevisionFirst }) {
  const { laptop, phone, shared } = await twoDevicesSharingOneBackup(world);

  world.advance(60_000);
  await laptop.store.update('client', shared.record_id, (c) => ({ ...c, notes: 'laptop rev2' }),
    { now: world.now() });
  await sync(laptop, world);

  // The phone edits having never seen the laptop's rev 2 — it has not synchronised since rev 1.
  world.advance(60_000);
  await phone.store.update('client', shared.record_id, (c) => ({ ...c, notes: 'phone rev2' }),
    { now: world.now() });

  if (!higherRevisionFirst) {
    world.advance(60_000);
    await sync(phone, world);
  }

  // The laptop edits once more, still never having seen the phone. Nothing was resolved and nobody
  // was asked, yet a revision above both sides now exists.
  world.advance(60_000);
  await laptop.store.update('client', shared.record_id, (c) => ({ ...c, notes: 'laptop rev3' }),
    { now: world.now() });
  await sync(laptop, world);

  if (higherRevisionFirst) {
    world.advance(60_000);
    await sync(phone, world);
  }

  return { laptop, phone, shared };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

for (const higherRevisionFirst of [true, false]) {
  const ordering = higherRevisionFirst
    ? "the laptop's rev 3 is read BEFORE the phone's rev 2"
    : "the phone's rev 2 is read BEFORE the laptop's rev 3";

  describe(`sync/conflict — the phone's edit is not silently replaced, when ${ordering}`, () => {
    it('the clash reaches the phone\'s OWN pass, with both sides in full', async () => {
      const world = aWorld();
      after(() => world.close());
      const { phone, shared } = await aClashBetweenTwoDevices(world, { higherRevisionFirst });

      world.advance(60_000);
      const pass = await sync(phone, world);
      const [clash, ...extra] = clashesOn(pass, shared.record_id);

      assert.ok(clash,
        'the phone is the device whose edit is at stake, and a report it never carries is a question '
        + 'nobody can put to him');
      assert.deepEqual(extra, [], 'and it is reported once, not once per file holding a copy');
      assert.equal(clash.rev, 2, 'at the revision both sides claim, not at the winner');
      assert.deepEqual(
        [clash.local, clash.incoming].map((side) => side.content.notes).sort(),
        ['laptop rev2', 'phone rev2'],
        'BOTH SIDES IN FULL. The phone\'s edit is in the report as content he can read, which is the '
        + 'only reason it is still answerable after the pull replaced it in the store.',
      );
    });

    it('the phone\'s store IS overwritten by the pull — so the report is the only thing holding his edit', async () => {
      // Stated as measured rather than implied. The clash surfacing does NOT stop last-write-wins
      // applying the higher revision, so on this device the phone's own words are gone from the
      // store the moment the pass runs. That is not silent — it is reported — but anything that
      // later drops the report drops the edit with it, and this assertion is what makes that
      // dependency visible instead of assumed.
      const world = aWorld();
      after(() => world.close());
      const { phone, shared } = await aClashBetweenTwoDevices(world, { higherRevisionFirst });

      world.advance(60_000);
      await sync(phone, world);
      const held = await phone.store.get('client', shared.record_id);
      assert.equal(held.content.notes, 'laptop rev3');
      assert.equal(held.device, 'coach-laptop',
        'the record on the phone is the laptop\'s writing, not the phone\'s own');
    });

    it('`local` is the FIRST FILE READ and not this device\'s copy — the pass is running on the phone', async () => {
      // Measured, and it matters to anything that words the two sides. A clash found by reading the
      // areas is found between two FILES; `local` means "the first envelope met at this revision",
      // which here is the laptop's, on a pass running on the phone. Anything that presents `local`
      // as "this device" would name the wrong device on this exact history — and would hand the
      // wrong side to `resolveDivergence` if it bound its answer by that reading rather than by the
      // value `resolution.js` declares.
      const world = aWorld();
      after(() => world.close());
      const { phone, shared } = await aClashBetweenTwoDevices(world, { higherRevisionFirst });

      world.advance(60_000);
      const pass = await sync(phone, world);
      const [clash] = clashesOn(pass, shared.record_id);

      assert.equal(pass.device, 'coach-phone', 'the pass is the phone\'s');
      assert.equal(clash.local.device, 'coach-laptop');
      assert.equal(clash.incoming.device, 'coach-phone');
    });

    it('choosing the phone\'s side restores his edit above both, and it reaches the laptop', async () => {
      // THE BAR, end to end: not that a question was asked, but that answering it puts his words
      // back — on this device and on the other one.
      const world = aWorld();
      after(() => world.close());
      const { laptop, phone, shared } = await aClashBetweenTwoDevices(world, { higherRevisionFirst });

      world.advance(60_000);
      const pass = await sync(phone, world);
      const [clash] = clashesOn(pass, shared.record_id);
      const phonesSide = clash.local.device === 'coach-phone' ? RESOLUTION.LOCAL : RESOLUTION.INCOMING;

      world.advance(60_000);
      const resolution = await resolveDivergence(phone.store, clash, { side: phonesSide, now: world.now() });
      assert.ok(resolution.to_rev > 3,
        'written strictly above BOTH sides and above the ordinary edit that outranked them, or '
        + 'last-write-wins undoes his answer on the next pass with nothing having errored');

      const back = await phone.store.get('client', shared.record_id);
      assert.equal(back.content.notes, 'phone rev2', 'his edit is what the phone holds again');

      world.advance(60_000);
      await sync(phone, world);
      world.advance(60_000);
      const laptopPass = await sync(laptop, world);
      assert.equal((await laptop.store.get('client', shared.record_id)).content.notes, 'phone rev2',
        'and it crossed the device boundary — an answer that stayed on one device would be the same '
        + 'lost edit one pass later');

      assert.deepEqual(clashesOn(laptopPass, shared.record_id), [],
        'and the question stops being asked, on the device that never saw it answered');
    });

    it('NON-VACUITY: the same reader reports NOTHING when the two devices never clashed', async () => {
      // Every assertion above is that a clash IS reported, and each one would pass for the wrong
      // reason if this reader reported a clash on any two-device history at all.
      const world = aWorld();
      after(() => world.close());
      const { laptop, phone, shared } = await twoDevicesSharingOneBackup(world);

      world.advance(60_000);
      await laptop.store.update('client', shared.record_id, (c) => ({ ...c, notes: 'only the laptop' }),
        { now: world.now() });
      await sync(laptop, world);
      world.advance(60_000);
      const pass = await sync(phone, world);

      assert.deepEqual(clashesOn(pass, shared.record_id), [],
        'an ordinary edit the other device had seen is not a clash, so this reader is discriminating '
        + 'rather than alarming at every history it is shown');
      assert.equal((await phone.store.get('client', shared.record_id)).content.notes, 'only the laptop',
        'and the ordinary update still arrives');
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('sync/conflict — WHAT THE CONFLICT SENTENCE CLAIMS ABOUT THE AFTERMATH', () => {
  it('"Both are kept until you choose" — and both are readable from the report on every pass until he does', async () => {
    // The sentence `describeDivergence` writes is a promise about the state, not a description of an
    // event. It is checked here the only way it can be: by not answering, running further ordinary
    // passes on BOTH devices, and reading both sides back each time.
    const world = aWorld();
    after(() => world.close());
    const { laptop, phone, shared } = await aClashBetweenTwoDevices(world, { higherRevisionFirst: true });

    world.advance(60_000);
    const first = await sync(phone, world);
    const [clash] = clashesOn(first, shared.record_id);
    assert.match(clash.why, /Both are kept until you choose/,
      'the sentence under test is the one the core actually writes');

    for (const dev of [laptop, phone, laptop]) {
      world.advance(60_000);
      // eslint-disable-next-line no-await-in-loop
      const pass = await sync(dev, world);
      const [again] = clashesOn(pass, shared.record_id);
      assert.ok(again, `${dev.tag} still has the question to put to him`);
      assert.deepEqual(
        [again.local, again.incoming].map((side) => side.content.notes).sort(),
        ['laptop rev2', 'phone rev2'],
        'and BOTH sides are still readable in full. A pass that went on reporting a clash while one '
        + 'side had become unreadable would be asking him to choose between one thing.',
      );
    }
  });

  it('an UNANSWERED clash is not resolved by anything: neither device silently picks a side', async () => {
    const world = aWorld();
    after(() => world.close());
    const { laptop, phone, shared } = await aClashBetweenTwoDevices(world, { higherRevisionFirst: false });

    world.advance(60_000);
    await sync(phone, world);
    world.advance(60_000);
    await sync(laptop, world);

    const union = await readUnion(world.remote, { space: SPACE });
    const settled = union.records.get(shared.record_id);
    assert.equal(settled.resolved_from ?? null, null,
      'nothing anywhere marked this record as descending from an answer, because nobody answered. A '
      + 'mark appearing without the resolution seam having run is the union speaking for a question '
      + 'the coach was never asked.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * A file from a newer installation THAT CARRIES A RECORD.
 *
 * The existing false-green fixtures carry none, which is right for what they assert — but it makes
 * the sentence's claim that "what is in it is not on this device" true for free. A file with a real
 * record in it is what makes that clause checkable.
 */
async function aNewerAppFileHolding(world, record, name = 'fit.coach-phone.push.newer.json') {
  const document = JSON.parse(encodeDocument({
    kind: DOCUMENT_KINDS.PUSH, device: 'coach-phone', records: [record], writtenAt: world.now(), cursor: null,
  }));
  document.document_version = DOCUMENT_VERSION + 1;
  return world.remote.create(SPACE, { name, content: JSON.stringify(document) });
}

describe('sync/false-green — WHAT THE SKIPPED-FILES SENTENCE CLAIMS ABOUT THE AFTERMATH', () => {
  it('nothing the device already held is touched, and the sentence never says otherwise', async () => {
    // THE FRESH-DEVICE BLIND SPOT, closed. A pass that skipped files is exercised on a device with
    // the coach's own work already on it, and the work is read back afterwards — not counted, read.
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');

    const his = [];
    for (const name of ['Rutherford', 'Okonkwo', 'Baptiste']) {
      // eslint-disable-next-line no-await-in-loop
      his.push(await laptop.store.create('client', aClient({ name }), { now: T0 }));
    }
    const clean = await sync(laptop, world);
    assert.ok(clean.completion, 'he starts from a genuine green');
    await recordCompletedSync(laptop.store, clean, { now: world.now() });
    const green = lastSyncedAt((await readLastCompletedSync(laptop.store)).completion);

    // The other installation, running ahead, writes a record this build cannot read.
    world.advance(60 * 60_000);
    const theirs = await (await world.device('coach-phone')).store
      .create('client', aClient({ name: 'Written on the newer phone' }), { now: world.now() });
    await aNewerAppFileHolding(world, theirs);

    const report = await sync(laptop, world);
    assert.equal(report.unreadable.length, 1, 'it was met and skipped');
    assert.deepEqual(report.failures, [], 'and nothing failed — that is the trap');
    assert.equal(report.completion, null);
    assert.equal(report.completion_withheld?.code, WITHHELD.FILES_SKIPPED);

    // ── THE AFTERMATH, read back off the store ────────────────────────────────────────────────
    for (const record of his) {
      // eslint-disable-next-line no-await-in-loop
      const held = await laptop.store.get('client', record.record_id);
      assert.ok(held, `${record.content.name} is still on this device`);
      assert.equal(held.content.name, record.content.name);
      assert.equal(held.rev, record.rev,
        'and untouched — a pass that skipped what it could not read did not rewrite what it could');
    }
    assert.equal(lastSyncedAt((await readLastCompletedSync(laptop.store)).completion), green,
      'and the last genuine backup time is left exactly where it was: not advanced over a pass that '
      + 'did not deserve it, and not cleared either, because that backup really did happen');

    // ── AND THE CLAUSE THE SENTENCE MAKES ABOUT THE SKIPPED FILE ──────────────────────────────
    const status = await accountabilityStatus(laptop.store, { now: world.now(), last_attempt: report });
    const words = status.reason?.message ?? '';
    assert.equal(status.reason?.code, REASON.BACKUP_PARTLY_UNREADABLE);
    assert.match(words, /is not on this device/,
      'the sentence makes a claim about where that work is');
    assert.equal(await laptop.store.get('client', theirs.record_id), undefined,
      'AND IT IS TRUE: the record inside the file this device could not read is genuinely not here. '
      + 'A half-applied file would make the sentence false while every count in it stayed right.');
    assert.doesNotMatch(words, /lost|deleted|erased|removed/i,
      'and it claims nothing about his own work having gone, because nothing of his did');
  });

  it('NON-VACUITY: the same record in a file this build CAN read does arrive', async () => {
    // Without this, "the skipped record is not on this device" passes for a device that receives
    // nothing at all, and the assertion above would be about the harness rather than the skip.
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await laptop.store.create('client', aClient({ name: 'Rutherford' }), { now: T0 });
    await sync(laptop, world);

    world.advance(60_000);
    const phone = await world.device('coach-phone');
    const theirs = await phone.store.create('client', aClient({ name: 'Written on the newer phone' }),
      { now: world.now() });
    await sync(phone, world);

    world.advance(60_000);
    const report = await sync(laptop, world);
    assert.deepEqual(report.unreadable, [], 'nothing was skipped this time');
    assert.ok(report.completion, 'so the pass completes');
    assert.equal((await laptop.store.get('client', theirs.record_id))?.content.name,
      'Written on the newer phone',
      'and the record DOES arrive — so its absence in the test above was the skip and not the fixture');
  });

  it('a refused pass claims nothing about erasure, and erases nothing, on a device that already held data', async () => {
    // The refusal family, taken on the same terms. A step that could not reach the service withholds
    // the completion and says so; what it must NOT do is leave the coach thinking something went. A
    // refusal changes nothing, and the only way to know that is to read the store back.
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const his = await laptop.store.create('client', aClient({ name: 'Rutherford' }), { now: T0 });
    const clean = await sync(laptop, world);
    await recordCompletedSync(laptop.store, clean, { now: world.now() });
    const green = lastSyncedAt((await readLastCompletedSync(laptop.store)).completion);

    world.advance(60_000);
    world.adversity.failNext(1, { operation: 'list' });
    const report = await sync(laptop, world);

    assert.ok(report.failures.length > 0, 'the pass genuinely could not do its work');
    assert.equal(report.completion, null, 'and it does not claim it did');
    assert.equal(report.completion_withheld?.code, WITHHELD.STEP_FAILED);

    const held = await laptop.store.get('client', his.record_id);
    assert.equal(held?.content.name, 'Rutherford', 'his record is exactly where it was');
    assert.equal(held?.rev, his.rev, 'at the same revision — a refusal wrote nothing');
    assert.equal(lastSyncedAt((await readLastCompletedSync(laptop.store)).completion), green,
      'and his last real backup is still recorded as having happened when it did');

    const status = await accountabilityStatus(laptop.store, { now: world.now(), last_attempt: report });
    for (const reason of status.reasons) {
      assert.doesNotMatch(reason.message, /\b(lost|erased|deleted|wiped)\b/i,
        `"${reason.message}" tells him something went. Nothing did — this is a refusal, and a `
        + 'refusal leaves whatever was saved before exactly as it was.');
    }
  });
});
