/**
 * HOUSEKEEPING MAY NOT EAT THE SIDE HE WAS NEVER ASKED ABOUT.
 *
 * ## The defect, measured at engine level by s11/a10, and why it lands on this action
 *
 * Two devices write revision N of one record, unaware of each other. That is a divergence: it is
 * surfaced, neither side is applied, and nobody has answered it. One of them then edits on to N+1 in
 * the ORDINARY way, still never having seen the other. The other device pulls, last-write-wins
 * applies N+1 correctly, and its own revision-N words now exist in exactly one place in the world:
 * the earlier file in its own area. Then `compactOwnArea` writes that device's whole state from a
 * local store that no longer holds that side, and REMOVES the earlier files. Afterwards a raw scan of
 * every file in the space finds the losing edit NOWHERE, the clash count drops to zero because there
 * is no second copy left to detect, and the question stops being asked. No error, no message.
 *
 * It is UNREACHABLE on the shipped application today for a reason that is not comforting: the merge
 * is refused whole by the unique content-key index, so nothing ever applies and nothing ever clashes.
 * **The reconciliation in `core/store/local-store.js` is what arms it.** Shipping that without this
 * would trade a loud, total, obvious non-delivery for a silent, partial, data-losing one — delivered
 * by the change written to make things safer.
 *
 * ## What is proven here, and what is deliberately NOT
 *
 * The gate is A REFUSAL TO DELETE and nothing more. The coach is still never asked about the clash;
 * that surface does not exist and is disclosed rather than built. What this buys is that his words
 * are still there when somebody builds the asking.
 *
 * ## Read the SPACE, never the report
 *
 * The report is precisely where the losing side already survives while the file carrying it is being
 * deleted underneath it. So the assertion is a raw scan: every file in the space, read back and
 * searched as text for the words the coach typed.
 *
 * ## Both orderings, run separately, never folded
 *
 * a10 measured that with the structural clash detection defeated, one ordering reds on its own
 * assertion while the other stays fully green — so a suite that happened to run only the friendly
 * ordering would report all-green with the defect fully present. Both are here, as two tests.
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { aClient } from '../model/fixtures.js';
import { bytesToText, SPACES } from '../remote/remote.js';
import { COMPACTION_THRESHOLD, SYNC_TRIGGERS, compactOwnArea, syncNow } from './engine.js';
import { SyncBoundaryError } from './errors.js';
import { T0, aWorld } from './testing.js';

const SPACE = SPACES.VISIBLE;

const sync = (dev, world) => syncNow(dev.store, world.remote, {
  trigger: SYNC_TRIGGERS.MANUAL, now: world.now(), space: SPACE,
});

/** Every byte of every file in the space, as text. The rawest reading available here. */
async function everyFileInTheSpace(world) {
  const listing = await world.remote.list(SPACE, {});
  const files = [];
  for (const meta of listing.files ?? listing) {
    // eslint-disable-next-line no-await-in-loop
    const file = await world.remote.read(meta.file_id, {});
    files.push({ name: meta.name, text: bytesToText(file.content) });
  }
  return files;
}

/** Whether the coach's own words are anywhere in the backup at all. */
const somewhereInTheSpace = (files, words) => files.some((file) => file.text.includes(words));

/**
 * Two devices, one client both of them know, each about to write revision 2 of it in ignorance of
 * the other. The state every clash starts from.
 */
async function twoDevicesAtTheSameRevision(world) {
  const laptop = await world.device('coach-laptop');
  const phone = await world.device('coach-phone');

  const client = await laptop.store.create('client', aClient({ name: 'Ana Example' }), { now: T0 });
  world.advance(60_000);
  await sync(laptop, world);
  world.advance(60_000);
  await sync(phone, world);
  assert.ok(await phone.store.get('client', client.record_id), 'both devices hold it before they clash');

  return { laptop, phone, client };
}

/** One edit, made offline, in the coach's own words. */
async function editOffline(dev, client, notes, world) {
  return dev.store.update('client', client.record_id, (content) => ({ ...content, notes }),
    { now: world.now() });
}

/**
 * Nine ordinary edits and passes on an UNRELATED record, answering nothing, until compaction runs.
 *
 * Unrelated on purpose: nothing in this loop touches the clash or acknowledges it. This is the coach
 * carrying on working, which is what actually happens, and it is the housekeeping that follows him
 * that does the damage.
 */
async function nineOrdinaryPasses(dev, world) {
  const other = await dev.store.create('client', aClient({ name: 'Cal Example' }), { now: world.now() });
  let compacted = null;
  for (let n = 0; n < 9; n += 1) {
    world.advance(60_000);
    // eslint-disable-next-line no-await-in-loop
    await dev.store.update('client', other.record_id, (content) => ({ ...content, notes: `session ${n}` }),
      { now: world.now() });
    world.advance(60_000);
    // eslint-disable-next-line no-await-in-loop
    const report = await sync(dev, world);
    if (report.compaction.ran) compacted = report.compaction;
  }
  return compacted;
}

/**
 * Drive one ordering to the point where `loser` has lost its own revision-2 words locally, and then
 * let housekeeping run.
 *
 * @param {'phone-loses'|'laptop-loses'} which
 */
async function driveTheClash(world, which) {
  const { laptop, phone, client } = await twoDevicesAtTheSameRevision(world);
  const loser = which === 'phone-loses' ? phone : laptop;
  const winner = which === 'phone-loses' ? laptop : phone;
  const losingWords = `the ${loser.tag} words`;

  // Both write revision 2, neither having seen the other. Each pushes into its OWN area, which is
  // the only place its own side exists.
  world.advance(60_000);
  await editOffline(loser, client, losingWords, world);
  await editOffline(winner, client, `the ${winner.tag} words`, world);
  world.advance(60_000);
  await sync(loser, world);
  world.advance(60_000);
  const sawIt = await sync(winner, world);
  assert.ok(sawIt.divergences.length >= 1,
    'the clash is DETECTED — if it never was, nothing below is about the right thing');

  // The winner edits on to revision 3 in the ordinary way, having answered nothing.
  world.advance(60_000);
  await editOffline(winner, client, `the ${winner.tag} words, later`, world);
  world.advance(60_000);
  await sync(winner, world);

  // The loser pulls. Last-write-wins applies revision 3, correctly, and its own revision-2 words are
  // gone from its local store — they survive only in the earlier file in its own area.
  world.advance(60_000);
  const pulled = await sync(loser, world);
  const localNow = await loser.store.get('client', client.record_id);
  assert.equal(localNow.rev, 3, 'the loser now holds the winner\'s revision');
  assert.notEqual(localNow.content.notes, losingWords,
    'and its own words are no longer in its local store — this is the state the defect needs');

  const files = await everyFileInTheSpace(world);
  assert.ok(somewhereInTheSpace(files, losingWords),
    'the losing words ARE still in the space at this point — the non-vacuity of the scan below');

  return { loser, winner, client, losingWords, pulled };
}

describe('sync/compaction-refusal — ORDERING ONE: the phone loses', () => {
  it('nine ordinary passes later, the phone\'s own words are STILL somewhere in the space', async () => {
    const world = aWorld();
    after(() => world.close());
    const { loser, losingWords } = await driveTheClash(world, 'phone-loses');

    const compaction = await nineOrdinaryPasses(loser, world);
    assert.ok(compaction?.ran, `compaction must actually have run — the threshold is ${COMPACTION_THRESHOLD}`);
    assert.ok(compaction.withheld_removals >= 1,
      'and it must have left something alone, or it did not meet the case at all');

    // READ THE SPACE, NOT THE REPORT.
    const files = await everyFileInTheSpace(world);
    assert.ok(somewhereInTheSpace(files, losingWords),
      'HOUSEKEEPING ATE THE SIDE HE WAS NEVER ASKED ABOUT: a raw scan of every file in the space '
      + 'finds the losing edit nowhere, and nothing anywhere said so');

    assert.ok(await loser.store.count('client') >= 2, 'and the device is still working normally');
  });
});

describe('sync/compaction-refusal — ORDERING TWO: the laptop loses', () => {
  it('the same, the other way round — a fix proven one way is half a fix', async () => {
    const world = aWorld();
    after(() => world.close());
    const { loser, losingWords } = await driveTheClash(world, 'laptop-loses');

    const compaction = await nineOrdinaryPasses(loser, world);
    assert.ok(compaction?.ran, 'compaction ran');
    assert.ok(compaction.withheld_removals >= 1, 'and withheld at least one removal');

    const files = await everyFileInTheSpace(world);
    assert.ok(somewhereInTheSpace(files, losingWords),
      'the losing edit is gone from every file in the space, in this ordering');
  });
});

describe('sync/compaction-refusal — AND IT MUST STILL COMPACT', () => {
  it('with nothing unanswered to protect, every earlier file goes, exactly as before', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');

    const compaction = await nineOrdinaryPasses(laptop, world);
    assert.ok(compaction?.ran, 'compaction ran');
    assert.equal(compaction.withheld_removals, 0,
      'nothing was unanswered, so nothing is spared — a refusal that fires unconditionally stops '
      + 'housekeeping for ever, satisfies the letter of the ruling, and looks exactly as green as '
      + 'the correct fix');
    assert.ok(compaction.replaced >= 1, 'and the earlier files were genuinely removed');

    const listing = await world.remote.list(SPACE, {});
    const mine = (listing.files ?? listing).filter((meta) => meta.name.includes('coach-laptop'));
    assert.ok(mine.length < COMPACTION_THRESHOLD,
      `the area really did shrink — ${mine.length} files after compaction`);
  });

  it('and a caller that does not say whether anything is unanswered is REFUSED, not defaulted', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await laptop.store.create('client', aClient({ name: 'Ana Example' }), { now: T0 });

    await assert.rejects(
      () => compactOwnArea(laptop.store, world.remote, { space: SPACE, now: world.now() }),
      SyncBoundaryError,
      'an optional protection is one a later call site omits and still runs, and the omission is '
      + 'undetectable afterwards because a space with nothing protected looks exactly like a space '
      + 'with nothing to protect',
    );
  });

  it('a pass that could not READ the space removes nothing, because it cannot know what it would destroy', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    await laptop.store.create('client', aClient({ name: 'Ana Example' }), { now: T0 });
    await sync(laptop, world);
    world.advance(60_000);

    const result = await compactOwnArea(laptop.store, world.remote, {
      space: SPACE, now: world.now(), unresolved: null,
    });
    assert.equal(result.replaced, 0, 'nothing removed');
    assert.ok(result.withheld_removals >= 1, 'and it says how many it left');
  });
});
