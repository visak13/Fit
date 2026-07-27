/**
 * THE FALSE GREEN — the most dangerous state this application can be in, and the proof it is over.
 *
 * The coach has two installations and they update at different times, which is the NORMAL case and
 * not an edge one. The older device pulls, meets files written in a shape it does not read, skips
 * every one of them, and — until this file existed — reported a clean completion, advanced
 * last-synced and showed green while holding NONE of the newer device's work. Nothing errored
 * anywhere. That is worse than never having synchronised, because never having synchronised at least
 * LOOKS broken; this is confidently reassuring at the exact moment his data is not arriving.
 *
 * Three things are proven here and they are separable on purpose, because two of them can hold while
 * the third silently does not:
 *
 *  1. the pass does not claim a completion, and last-synced does not move;
 *  2. THE WORDS THE COACH READS name how many files were skipped and say his other device is running
 *     a newer version — asserted against the sentence the surface produces, never against the
 *     presence of a field and never against a code-to-message lookup, which proves a table exists and
 *     nothing about whether the state can be reached;
 *  3. nothing about any of it blocks the application.
 *
 * Every guard here is broken on purpose before it is believed, and each break is confirmed to have
 * LANDED — a break that silently fails to apply reports all-green and is indistinguishable from a
 * working guard.
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { aClient } from '../model/fixtures.js';
import { syncCompletionMarker } from '../outbox/outbox.js';
import { SPACES } from '../remote/remote.js';
import { BLOCKS_APPLICATION, LEVELS, accountabilityStatus, lastSyncedAt, readLastCompletedSync, recordCompletedSync } from '../status/status.js';
import { REASON } from '../status/reasons.js';
import { readUnion } from './areas.js';
import { SYNC_TRIGGERS, syncNow } from './engine.js';
import { SNAPSHOT_NAME } from './partition.js';
import { DOCUMENT_KINDS, DOCUMENT_VERSION, encodeDocument } from './payload.js';
import { T0, aWorld } from './testing.js';
import { WITHHELD, completionWithheldBy } from './withheld.js';

const SPACE = SPACES.VISIBLE;

/** One pass on this device. */
const sync = (dev, world, trigger = SYNC_TRIGGERS.MANUAL) => syncNow(dev.store, world.remote, {
  trigger, now: world.now(),
});

/**
 * A device that has genuinely backed up once, with the completion PERSISTED.
 *
 * Every assertion about the words he reads needs this first, and finding that out was worth the
 * trouble: without a real last-synced time on the device, `never_synchronised` is applicable and it
 * outranks this reason, so the indicator's one line is that one instead. That is the correct
 * precedence — nothing at all in the backup is worse than some of it missing — and it means the
 * sentence under test is only ever the headline for a coach who HAS backed up before, which is
 * exactly the coach this defect was dangerous to.
 */
async function aDeviceThatHasBackedUp(world, tag = 'coach-laptop') {
  const dev = await world.device(tag);
  await dev.store.create('client', aClient({ name: 'His own work' }), { now: T0 });
  const clean = await sync(dev, world);
  const { recorded } = await recordCompletedSync(dev.store, clean, { now: world.now() });
  assert.equal(recorded, true, 'the device starts from a genuine green');
  return dev;
}

/**
 * Put a file into the OTHER device's area written at a HIGHER document version — exactly what an
 * installation running a newer build of this application would leave behind.
 *
 * The document is composed by this build's own encoder and then stamped up a version, so everything
 * about it except the one number is genuinely what this engine writes. A hand-typed blob would prove
 * only that garbage is unreadable, which was never in doubt.
 */
async function aFileFromANewerApp(world, { device = 'coach-phone', name = 'fit.coach-phone.push.newer.json', bump = 1 } = {}) {
  const text = encodeDocument({
    kind: DOCUMENT_KINDS.PUSH, device, records: [], writtenAt: world.now(), cursor: null,
  });
  const document = JSON.parse(text);
  document.document_version = DOCUMENT_VERSION + bump;
  const meta = await world.remote.create(SPACE, { name, content: JSON.stringify(document) });
  return meta;
}

describe('sync/false-green — a pass that skipped a file it could not read has not earned a completion', () => {
  it('withholds the completion, and the coach’s last-synced time does not move', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await laptop.store.create('client', aClient({ name: 'His own work' }), { now: T0 });

    // A clean pass first, so there is a genuine last-synced time to protect. This also proves the
    // test can reach green at all — the non-vacuity probe for everything below, which would
    // otherwise be indistinguishable from a suite that can never go green in the first place.
    const clean = await sync(laptop, world);
    assert.equal(clean.unreadable.length, 0, 'nothing was skipped');
    assert.ok(clean.completion, 'a pass that read everything DOES complete');
    assert.equal(clean.completion_withheld, null);
    const first = await recordCompletedSync(laptop.store, clean, { now: world.now() });
    assert.equal(first.recorded, true, 'and it is persisted');
    const green = lastSyncedAt((await readLastCompletedSync(laptop.store)).completion);
    assert.ok(green, 'there is a real last-synced time on the device now');

    // The newer installation writes. Time moves so a completion, if one were manufactured, would be
    // a DIFFERENT instant and the assertion below could not pass by coincidence.
    world.advance(60 * 60_000);
    await aFileFromANewerApp(world);

    const after2 = await sync(laptop, world);
    assert.equal(after2.unreadable.length, 1, 'the file was met and skipped');
    assert.equal(after2.unreadable[0].written_by_newer_version, true);
    assert.deepEqual(after2.failures, [], 'and NOTHING failed — that is the whole trap');

    assert.equal(after2.completion, null,
      'a pass holding none of the other device\'s work must not say everything is backed up');
    assert.equal(after2.completion_withheld?.code, WITHHELD.FILES_SKIPPED);
    assert.equal(after2.completion_withheld?.skipped, 1);
    assert.equal(after2.completion_withheld?.newer_version, 1);

    const recorded = await recordCompletedSync(laptop.store, after2, { now: world.now() });
    assert.equal(recorded.recorded, false, 'nothing is persisted');
    assert.equal(lastSyncedAt((await readLastCompletedSync(laptop.store)).completion), green,
      'and the previous genuine time is left exactly where it was — not advanced, and not cleared '
      + 'either: the last real backup really did happen when it says it did');
  });

  it('BREAK PROBE: with the guard removed, the same pass reports green — so the guard is the reason', async () => {
    // The point of this test is that the trap is REACHABLE. A guard nobody can show failing is a
    // guard nobody can show working; if this passes without the withholding, the assertions above
    // prove nothing about the defect they claim to close.
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await laptop.store.create('client', aClient({ name: 'His own work' }), { now: T0 });
    await sync(laptop, world);
    world.advance(60 * 60_000);
    await aFileFromANewerApp(world);
    const report = await sync(laptop, world);

    // The old rule, restated verbatim: a completion whenever nothing FAILED. Confirm the break has
    // actually landed — that the old rule really does produce a completion on this exact report —
    // rather than assuming it would. Both halves are checked, because "no failures" alone would not
    // have shown green if the flush had not also earned a marker.
    assert.deepEqual(report.failures, [], 'the old rule\'s only test passes');
    assert.equal(completionWithheldBy({ failures: report.failures }), null,
      'judged on failures alone, this pass is clean');
    const oldRule = report.failures.length === 0 ? syncCompletionMarker(report.flush) : null;
    assert.ok(oldRule?.completed_sync_at,
      'THE BREAK LANDED: under the old rule this exact pass produces a real completion marker — '
      + 'which is precisely how it reported green while holding none of the newer device\'s work');

    // And the guard, on the same report, refuses.
    assert.equal(completionWithheldBy(report)?.code, WITHHELD.FILES_SKIPPED,
      'the run stays green ONLY because the unreadable file is now part of the question');
  });

  it('a file this build wrote is still read, so the guard is not simply refusing everything', async () => {
    // The other half of the break probe. A withholding that fired on every pass would make every
    // assertion above pass for the wrong reason, and the coach would never see green again.
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');
    await phone.store.create('client', aClient({ name: 'From the phone' }), { now: T0 });
    await sync(phone, world);

    const report = await sync(laptop, world);
    assert.equal(report.unreadable.length, 0);
    assert.ok(report.completion, 'an ordinary two-device pass still completes');

    const union = await readUnion(world.remote, { space: SPACE });
    const names = [];
    for (const id of union.records.keys()) {
      // eslint-disable-next-line no-await-in-loop
      const held = await laptop.store.get('client', id);
      if (held) names.push(held.content.name);
    }
    assert.deepEqual(names, ['From the phone'],
      'and green is honest here: it genuinely holds the other device\'s work');
  });

  it('a document from an OLDER build is skipped too, but is NOT called a newer version', async () => {
    // Honesty about which direction the mismatch runs. Both are unreadable and both withhold the
    // completion; only one of them means "your other device is ahead of this one", and saying that
    // when it is behind would be a confident sentence about the wrong thing.
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await laptop.store.create('client', aClient(), { now: T0 });
    await sync(laptop, world);
    world.advance(60_000);

    await aFileFromANewerApp(world, { name: 'fit.coach-phone.push.older.json', bump: -DOCUMENT_VERSION });
    const report = await sync(laptop, world);

    assert.equal(report.unreadable.length, 1, 'still skipped');
    assert.equal(report.unreadable[0].written_by_newer_version, false, 'and not attributed to a newer version');
    assert.equal(report.completion, null, 'and it still withholds the completion');
    assert.equal(report.completion_withheld?.newer_version, 0);
  });

  it('a file that is not a document at all is skipped, and is not attributed to a version either', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await laptop.store.create('client', aClient(), { now: T0 });
    await sync(laptop, world);
    world.advance(60_000);
    await world.remote.create(SPACE, { name: 'fit.coach-phone.push.corrupt.json', content: 'not a document' });

    const report = await sync(laptop, world);
    assert.equal(report.unreadable.length, 1);
    assert.equal(report.unreadable[0].written_by_newer_version, false);
    assert.equal(report.completion, null);
  });

  it('a step that could not reach the service still reports THAT, not the unreadable file', async () => {
    // Both conditions at once. The failed step is the broader fact and is the verdict; the skipped
    // files are still carried in the report, which is why the surface reads the LIST and not the
    // verdict when it composes his sentence.
    const both = completionWithheldBy({
      failures: [{ step: 'pull', code: 'unavailable' }],
      unreadable: [{ name: 'a', file_id: '1', why: 'x', written_by_newer_version: true }],
    });
    assert.equal(both?.code, WITHHELD.STEP_FAILED);
    assert.equal(both?.skipped, 0, 'the verdict names one condition');
  });

  it('a bare flush report has no opinion about files it never read', () => {
    // `core/status/completion.js` takes either a pass or a bare flush at its boundary, and a flush
    // carrying neither list must not be read as "nothing was skipped, therefore complete" by
    // accident — it is simply not the thing that answers this question.
    assert.equal(completionWithheldBy({ delivered: 3 }), null);
    assert.equal(completionWithheldBy(null), null);
    assert.equal(completionWithheldBy('a completion, honestly'), null);
  });
});

describe('sync/false-green — THE OTHER DOOR: a file this build cannot PLACE', () => {
  /**
   * What a newer build adding a THIRD kind of area file leaves behind. No version bump is involved —
   * this is the ordinary additive change this codebase prefers, which is what makes this door the
   * more likely of the two rather than the more exotic.
   */
  const aFileKindThisBuildDoesNotKnow = (world, name = 'fit.coach-phone.digest.k1.json') => world.remote.create(
    SPACE, { name, content: '{"document_version":1,"kind":"digest"}' },
  );

  /**
   * The other installation, having written at least one file this build CAN place.
   *
   * That is not fixture ceremony — it is the evidence the predicate turns on. A device area this
   * space can actually show is what separates "a build we do not know wrote this" from "the coach
   * named a file with our prefix", and a fixture that skipped it would be asserting against a
   * predicate the real world never reaches.
   */
  async function theOtherInstallation(world, tag = 'coach-phone') {
    const phone = await world.device(tag);
    await phone.store.create('client', aClient({ name: 'From the phone' }), { now: world.now() });
    await sync(phone, world);
    return phone;
  }

  it('is not a failure and not unreadable, and it STILL withholds the completion', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await aDeviceThatHasBackedUp(world);
    await theOtherInstallation(world);
    const green = lastSyncedAt((await readLastCompletedSync(laptop.store)).completion);
    world.advance(60 * 60_000);
    await aFileKindThisBuildDoesNotKnow(world);

    const report = await sync(laptop, world);
    assert.deepEqual(report.failures, [], 'nothing failed');
    assert.deepEqual(report.unreadable, [], 'and nothing was undecodable — it was never opened');
    assert.equal(report.unplaceable.length, 1, 'it came through the OTHER door');
    assert.equal(report.unplaceable[0].written_by_newer_version, true);

    assert.equal(report.completion, null,
      'the same false green, reached without a version bump: work of his is in the backup and this '
      + 'pass did not take it in');
    assert.equal(report.completion_withheld?.code, WITHHELD.FILES_SKIPPED);
    await recordCompletedSync(laptop.store, report, { now: world.now() });
    assert.equal(lastSyncedAt((await readLastCompletedSync(laptop.store)).completion), green,
      'and last-synced does not advance over it');
  });

  it('reaches the words too, so it is not merely detected a second time', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await aDeviceThatHasBackedUp(world);
    await theOtherInstallation(world);
    world.advance(60_000);
    await aFileKindThisBuildDoesNotKnow(world, 'fit.coach-phone.digest.k1.json');
    await aFileKindThisBuildDoesNotKnow(world, 'fit.coach-phone.digest.k2.json');

    const status = await accountabilityStatus(laptop.store, {
      now: world.now(), last_attempt: await sync(laptop, world),
    });
    assert.equal(status.reason?.code, REASON.BACKUP_PARTLY_UNREADABLE);
    assert.match(status.reason.message, /\b2 files\b/);
    assert.match(status.reason.message, /newer version of this app/i);
    assert.equal(status.blocks_application, false);
  });

  it('A FILE IN THIS APP’S NAMESPACE THAT NO DEVICE AREA CLAIMS IS NOT ALARMING EITHER', async () => {
    // The narrower half of the same protection, and the one worth stating: `fit.` is a short prefix
    // in a folder the coach browses, and he is free to use it. The namespace ALONE is suggestive, not
    // conclusive — so the conclusive test is the device, and a name whose device segment owns no area
    // here is reported as found-and-not-ours rather than as his missing work.
    const world = aWorld();
    after(() => world.close());
    const laptop = await aDeviceThatHasBackedUp(world);
    world.advance(60_000);
    await world.remote.create(SPACE, { name: 'fit.notes.for.tuesday.json', content: 'his own' });
    await world.remote.create(SPACE, { name: 'fit.receipts.json', content: 'his own' });

    const report = await sync(laptop, world);
    assert.deepEqual(report.unplaceable, [],
      'no device area claims either name, so neither is evidence of a build we do not know');
    assert.ok(report.completion, 'and his backup is still allowed to say it completed');

    // NON-VACUITY: the SAME shape of name, under a device that DOES own an area here, is counted.
    // Without this the assertion above would pass for a predicate that alarms at nothing.
    await aFileKindThisBuildDoesNotKnow(world, `fit.${laptop.tag}.digest.k9.json`);
    const second = await sync(laptop, world);
    assert.equal(second.unplaceable.length, 1,
      'the device is the evidence, and this test can tell the two apart');
    assert.equal(second.completion, null);
  });

  it('THE COACH’S OWN FILE IN HIS OWN FOLDER IS NOT A FAULT, and this is the line that keeps it honest', async () => {
    // The visible space is a folder he can see and browse. Treating anything unfamiliar in it as
    // missing work would put a permanent warning in front of him for dropping a photo in his Drive,
    // and an indicator that cries wolf is one he stops reading — which would cost more than the
    // defect it was added to catch.
    const world = aWorld();
    after(() => world.close());
    const laptop = await aDeviceThatHasBackedUp(world);
    world.advance(60_000);
    await world.remote.create(SPACE, { name: 'holiday-photo.jpg', content: 'not ours at all' });
    await world.remote.create(SPACE, { name: 'notes for tuesday.txt', content: 'his own' });

    const report = await sync(laptop, world);
    assert.deepEqual(report.unplaceable, [], 'nothing of his counts as our missing work');
    assert.ok(report.unrecognised.length >= 2, 'they are still REPORTED as found and not ours');
    assert.ok(report.completion, 'and his backup is still allowed to say it completed');

    const status = await accountabilityStatus(laptop.store, { now: world.now(), last_attempt: report });
    assert.equal(status.reasons.some((r) => r.code === REASON.BACKUP_PARTLY_UNREADABLE), false,
      'and he is told nothing alarming about his own file');
  });

  it('the shared snapshot is not an area file and is not mistaken for one', async () => {
    // It lives at a reserved name in this namespace and has never parsed as an area. Counting it
    // would make every pass on every device report a skipped file, for ever.
    const world = aWorld();
    after(() => world.close());
    const laptop = await aDeviceThatHasBackedUp(world);
    const listing = await world.remote.list(SPACE);
    assert.ok(listing.some((m) => m.name === SNAPSHOT_NAME), 'fixture check: the snapshot is there');

    const report = await sync(laptop, world);
    assert.deepEqual(report.unplaceable, []);
    assert.ok(report.completion);
  });
});

describe('sync/false-green — THE WORDS THE COACH READS', () => {
  it('name how many files were skipped and say his other device is running a newer version', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await aDeviceThatHasBackedUp(world);
    world.advance(60_000);

    // THREE of them, so the count in the sentence cannot be a coincidence of the number one and
    // cannot be a pluralisation that happens to read correctly either way.
    await aFileFromANewerApp(world, { name: 'fit.coach-phone.push.a.json' });
    await aFileFromANewerApp(world, { name: 'fit.coach-phone.push.b.json' });
    await aFileFromANewerApp(world, { name: 'fit.coach-phone.push.c.json' });

    const report = await sync(laptop, world);
    assert.equal(report.unreadable.length, 3);

    const status = await accountabilityStatus(laptop.store, { now: world.now(), last_attempt: report });

    // The sentence itself. Not `status.reason.code`, not `REASONS[code].message`, not a field being
    // present: the words a screen would put in front of him.
    const words = status.reason?.message ?? '';
    assert.match(words, /\b3 files\b/, 'it names HOW MANY were skipped');
    assert.match(words, /newer version of this app/i, 'and says WHY, in his terms');
    assert.match(words, /other device/i, 'attributing it to the other installation, not to a fault here');
    assert.match(words, /does not hold everything/i, 'and says what that means for his backup');
    assert.equal(status.reason?.code, REASON.BACKUP_PARTLY_UNREADABLE);

    // NON-VACUITY: the same read on a clean pass produces no such sentence anywhere. Without this,
    // a `match` against a string that is always present would pass for the wrong reason.
    const cleanStatus = await accountabilityStatus(laptop.store, {
      now: world.now(), last_attempt: { ...report, unreadable: [] },
    });
    assert.equal(
      cleanStatus.reasons.some((r) => /newer version of this app/i.test(r.message)), false,
      'the sentence appears only when files were actually skipped',
    );
  });

  it('says ONE file, not 1 files, and drops the version clause when no version caused it', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await aDeviceThatHasBackedUp(world);
    world.advance(60_000);
    await world.remote.create(SPACE, { name: 'fit.coach-phone.push.corrupt.json', content: 'not a document' });

    const report = await sync(laptop, world);
    const status = await accountabilityStatus(laptop.store, { now: world.now(), last_attempt: report });
    const words = status.reason?.message ?? '';

    assert.match(words, /\b1 file\b/);
    assert.doesNotMatch(words, /1 files/, 'a count in a sentence has to read as a sentence');
    assert.doesNotMatch(words, /newer version/i,
      'nothing here says his other device is ahead, because nothing here knows that it is');
  });

  it('the sentence reaches him THROUGH the surface, so a pass that skipped files is never silent', async () => {
    // The defect this closes twice over: a correct routine whose output has no caller. The count is
    // measured in `areas.js`, carried by the report, threaded through `accountabilityStatus` and
    // composed into words — and this asserts the whole run of it end to end, from a file on the
    // remote copy to a sentence, with nothing hand-fed in between.
    const world = aWorld();
    after(() => world.close());
    const laptop = await aDeviceThatHasBackedUp(world);
    world.advance(60_000);
    await aFileFromANewerApp(world, { name: 'fit.coach-phone.push.a.json' });
    await aFileFromANewerApp(world, { name: 'fit.coach-phone.push.b.json' });

    const status = await accountabilityStatus(laptop.store, {
      now: world.now(), last_attempt: await sync(laptop, world),
    });

    assert.ok(status.reasons.some((r) => r.code === REASON.BACKUP_PARTLY_UNREADABLE),
      'it is in the panel behind the indicator as well as on it');
    assert.match(status.reason.message, /\b2 files\b/);
    assert.equal(status.reason.action, null,
      'and no action, because there is no tap in this application that resolves it — offering one '
      + 'that does not help is how an indicator earns the reputation of lying');
  });
});

describe('sync/false-green — and none of it blocks the application', () => {
  it('blocks_application stays false, every rung declares blocks false, and nothing is a modal', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await aDeviceThatHasBackedUp(world);

    // The worst state this change can produce: files skipped, a dead credential, refused entries,
    // and three days of it. If anything added here could gate the app, it would gate it here.
    world.advance(72 * 60 * 60_000);
    await aFileFromANewerApp(world, { name: 'fit.coach-phone.push.a.json' });
    await aFileFromANewerApp(world, { name: 'fit.coach-phone.push.b.json' });
    const report = await sync(laptop, world);

    const status = await accountabilityStatus(laptop.store, {
      now: world.now(), last_attempt: report, credential: { present: true, expired: true },
    });

    assert.equal(status.blocks_application, false);
    assert.equal(status.blocks_application, BLOCKS_APPLICATION);
    assert.ok(status.reasons.some((r) => r.code === REASON.BACKUP_PARTLY_UNREADABLE),
      'the state under test is genuinely present — this is not a vacuous pass');
    for (const level of Object.values(LEVELS)) {
      assert.equal(level.blocks, false, 'the ladder escalates by being louder, never by gating');
    }

    // The ladder may climb as loud as it likes. It may not become a gate, and it may not become a
    // question either: nothing this reason carries asks him to answer anything before continuing.
    assert.equal(status.reason.queue_wide, false,
      'his own work is still being sent; only what came the other way was skipped');
    assert.equal(status.nothing_can_be_sent === true, status.reasons.some((r) => r.queue_wide) && status.undelivered > 0);
  });
});
