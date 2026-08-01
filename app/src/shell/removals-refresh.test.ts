/**
 * THE STALE COUNT — the defect this file exists to hold shut, described before it is asserted.
 *
 * A coach removes a client on the register. He walks to the surface that reports removals awaiting
 * confirmation and it tells him nothing is waiting, while a manifest for that very client sits in
 * the store marked pending. The two screens are looking at one fact and saying opposite things about
 * it, and the one he is more likely to believe is the reassuring one.
 *
 * ## HOW IT GOT IN, BECAUSE NOBODY WAS CARELESS
 *
 * `RemovalsFromStore` filled the seam ONCE per store and deliberately carried no refresh. That was
 * CORRECT when it was written: `verifyAndMarkPropagated` is the only thing that moves a manifest out
 * of pending, it only runs during a synchronisation pass, and there was no pass and no other writer.
 * The client register then became a SECOND writer of the same record — `purgeClient` leaves a pending
 * manifest with no pass involved — and the file that had reasoned about one writer could not know.
 * Neither side could have found this alone: the seam could not know a second writer was coming, and
 * the register could not see the surface it broke.
 *
 * ## WHAT IS PROVEN HERE, IN THREE PARTS, AND WHY IT TAKES THREE
 *
 *  1. **THE READING GOES STALE, AND READING AGAIN IS WHAT CORRECTS IT.** Driven against a REAL store
 *     on the core's own double: read the surface, remove somebody for real, and show that the reading
 *     taken BEFORE still says "nothing is waiting" — the false good news, reproduced — while a fresh
 *     read of the same store says a removal is waiting. This is the deletes-then-reads-the-surface
 *     proof, done at the level of the WORDS the coach sees rather than at the level of a page object,
 *     because the words are the thing that was wrong.
 *
 *  2. **THE SIGNAL CANNOT SILENTLY STOP FIRING.** `oneMoreRemoval` strictly increases and never
 *     repeats. That is the whole load-bearing arithmetic: a signal that could return to a value it
 *     has held before — a boolean flipped back, a coarse timestamp, the identity of the last removal —
 *     would stop triggering a re-read on the SECOND removal, which is the hardest version to notice.
 *
 *  3. **THE WIRE IS WHERE IT IS CLAIMED TO BE, AND IS NOT A POLL.** A static render never runs an
 *     effect, so no test in this suite can watch the seam re-read; that is a real limit and it is
 *     stated rather than papered over. What CAN be held is that the count is in the seam's dependency
 *     list, that the register raises it after the purge, that nothing on this path ticks on a timer,
 *     and that the four seams which are still honestly frozen were NOT woken by any of it. Those are
 *     read off the shipped source, which is the same thing `client-removal.test.ts` does for the
 *     absence it guards.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import { aClient } from '../../core/model/fixtures.js';
import { openLocalStore } from '../../core/store/store.js';
import { purgeClient } from '../../core/store/purge.js';
import { createLaptop, settle } from '../../core/store/testing/platform-double.js';
import { NO_REMOVAL_RECORDED_YET, oneMoreRemoval } from '../platform/local-store.ts';
import { NO_PASS_HAS_REPORTED, describeRemovals } from '../screens/removals.ts';
import type { RemovalsPage } from '../screens/removals.ts';
import { readPendingRemovals } from './removals-source.ts';
import type { PendingRemovalsOutcome } from './removals-source.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const applicationRoot = path.join(here, '..', '..');

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

/** One read of the surface's source, settled. Null when the read published nothing. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readTheSurface(store: any): Promise<RemovalsPage | null> {
  let published: PendingRemovalsOutcome | null = null;
  readPendingRemovals(store, (outcome) => { published = outcome; });
  // The core's own settle: a read on the double is a scheduled task rather than a resolved promise.
  await settle();
  // A FAILURE IS NOT A PAGE, and this helper hands back only pages. The read now publishes one of
  // three outcomes — see `removals-source.ts` — and every test in this file is about the refresh
  // TRIGGER over reads that succeed; a failure reaching here as `null` would be read as "the read
  // never fired", which is a different fault from the one these tests are watching for.
  // The cast is the compiler's flow analysis, not a claim: `published` is only ever written inside
  // the callback above, which TypeScript cannot see running, so it narrows the binding to `null`.
  const outcome = published as PendingRemovalsOutcome | null;
  return outcome !== null && outcome.status === 'read' ? outcome.page : null;
}

const source = (relative: string) => readFile(path.join(applicationRoot, relative), 'utf8');

describe('the surface that reports removals awaiting confirmation, after a removal made here', () => {
  it('says a removal is waiting once it reads again, and said the opposite before', async () => {
    const store = await aStore();
    const departing = await store.create('client', aClient({ name: 'Test Person Departing' }));
    await store.create('client', aClient({ name: 'Test Person Staying' }));

    // WHAT THE SURFACE HELD BEFORE HE REMOVED ANYBODY. True at the time it was taken.
    const before = await readTheSurface(store);
    assert.ok(before !== null, 'the surface never read the store at all');
    const said = describeRemovals({ pending: before, remote: NO_PASS_HAS_REPORTED });
    assert.equal(said.count, 0);
    assert.equal(said.settled, true, 'something was waiting on a device nobody had removed anybody from');

    // THE REMOVAL, FOR REAL, THROUGH THE CORE'S OWN OPERATION — the one the register calls.
    const manifest = await purgeClient(store, departing.record_id);
    assert.equal(manifest.status, 'pending', 'the core did not record the removal as work still to carry out');

    // THE DEFECT, REPRODUCED. The reading taken a moment ago is now false, and it is false in the
    // reassuring direction: it tells him every client he has removed is confirmed gone from his
    // backup, which is the exact belief `core/sync/deletions.js` opens by naming.
    assert.equal(
      describeRemovals({ pending: before, remote: NO_PASS_HAS_REPORTED }).settled,
      true,
      'the reading taken before the removal is what the seam went on carrying, and this is the '
        + 'sentence the coach was shown. If this ever stops holding, the defect has changed shape '
        + 'and the fix below is guarding the wrong thing.',
    );
    assert.ok(
      describeRemovals({ pending: before, remote: NO_PASS_HAS_REPORTED }).intro.includes('confirmed gone'),
      'the stale reading no longer claims the removals are confirmed gone, so the false good news '
        + 'this file reproduces is not the one being fixed',
    );

    // AND THE FIX: reading the surface again, which is what the signal on the source causes.
    const afterwards = await readTheSurface(store);
    assert.ok(afterwards !== null, 'the second read published nothing');
    const now = describeRemovals({ pending: afterwards, remote: NO_PASS_HAS_REPORTED });

    assert.equal(now.count, 1, 'the removal he just made is not on the surface that reports removals');
    assert.equal(now.settled, false);
    assert.deepEqual(
      afterwards.items.map((item) => item.subject_client_id),
      [departing.record_id],
      'the surface is waiting on somebody other than the client who was removed',
    );
    assert.ok(
      !JSON.stringify(now).includes('Test Person Departing'),
      'the departed client\'s NAME reached the surface. The manifest holds identities and no '
        + 'content precisely so that it cannot.',
    );
  });

  it('is still empty on a device where nobody was removed, so the fix did not invent a removal', async () => {
    const store = await aStore();
    await store.create('client', aClient({ name: 'Test Person Staying' }));

    const page = await readTheSurface(store);
    assert.ok(page !== null);
    assert.equal(describeRemovals({ pending: page, remote: NO_PASS_HAS_REPORTED }).count, 0);
    assert.equal(describeRemovals({ pending: page, remote: NO_PASS_HAS_REPORTED }).settled, true);
  });
});

describe('the signal that makes it read again', () => {
  it('starts at nothing recorded, which is the honest value rather than a placeholder', () => {
    assert.equal(NO_REMOVAL_RECORDED_YET, 0);
  });

  it('STRICTLY INCREASES, so a re-read cannot be skipped on a later removal', () => {
    let held = NO_REMOVAL_RECORDED_YET;
    const seen = new Set<number>([held]);

    for (let removal = 1; removal <= 50; removal += 1) {
      const next = oneMoreRemoval(held);
      assert.ok(next > held, `removal ${removal} did not move the signal forward`);
      assert.ok(
        !seen.has(next),
        `removal ${removal} returned the signal to a value it has already held. A dependency that `
          + 'repeats is a re-read that silently stops happening — and it would stop on a LATER '
          + 'removal, not the first, which is the version nobody notices.',
      );
      seen.add(next);
      held = next;
    }
  });

  it('is a number and carries nothing else, so it cannot become a way to act', () => {
    assert.equal(typeof oneMoreRemoval(NO_REMOVAL_RECORDED_YET), 'number');
  });
});

describe('where the signal is wired, read off the source that ships', () => {
  it('is in the pending-removal seam\'s dependency list, so a changed count is a fresh read', async () => {
    const seam = await source('src/shell/RemovalsFromStore.tsx');

    assert.ok(
      seam.includes('useLocalRemovals'),
      'the seam no longer reads the removal count from the source, so it fills once per store again '
        + 'and the stale count is back',
    );
    // THE LIST GREW, AND THIS ASSERTION WAS PINNED TO ITS EXACT OLD LITERAL.
    //
    // It used to match `}, [store, recorded]);` — the whole list, character for character — and that
    // made it fail the moment the remote half added `remote` to the same list, which is the trigger
    // this very file said belonged there. A guard pinned to an exact literal fails on the change it
    // was written to WELCOME, so it is rewritten to assert what it actually cares about: the count is
    // still a dependency, and everything on the list is a dependency of THE READ rather than a second
    // mechanism beside it. It now also holds the new half to the same rule.
    const list = /\}, \[([^\]]*)\]\);/.exec(seam);
    assert.ok(list !== null, 'the seam\'s read is no longer driven by a dependency list at all');
    const dependencies = list[1].split(',').map((name) => name.trim());

    assert.ok(
      dependencies.includes('recorded'),
      'the seam\'s read no longer depends on the recorded count. The dependency list IS the fix: '
        + 'without the count in it the effect runs once per store, which is the defect.',
    );
    assert.ok(
      dependencies.includes('remote'),
      'the seam\'s read no longer depends on the last pass\'s report. `verifyAndMarkPropagated` moves '
        + 'a manifest out of pending during a synchronisation pass and at no other moment, so a new '
        + 'report IS the announcement that one ran. Without it in this list, a removal confirmed '
        + 'during a pass stays on the screen afterwards, telling him something untrue.',
    );
    assert.ok(
      dependencies.includes('store'),
      'the read no longer depends on the store it reads from, so a page from a previous store can '
        + 'be published against the current one',
    );
  });

  it('is RAISED by the register, after the purge and nowhere else in the interface', async () => {
    const register = await source('src/screens/ClientsScreen.tsx');

    assert.ok(
      register.includes('removalRecorded()'),
      'the register no longer says that a removal committed here, so nothing tells the surface to '
        + 'read again and the seam is stale from the moment he presses the control',
    );

    const purgeAt = register.indexOf('await removeClientForGood(');
    const signalAt = register.indexOf('removalRecorded()');
    assert.ok(purgeAt > -1, 'the register no longer removes a client through the core\'s own purge');
    assert.ok(
      signalAt > purgeAt,
      'the signal is raised BEFORE the purge resolves. `purgeClient` resolving is the write '
        + 'committing, so a signal ahead of it makes the seam read a store that has not moved yet — '
        + 'and the re-read then lands on the old answer and is never repeated.',
    );
  });

  it('is raised in exactly ONE place, because there is exactly one place a removal is made', async () => {
    const files = [
      'src/screens/ClientsScreen.tsx',
      'src/screens/CalendarScreen.tsx',
      'src/screens/AdminScreen.tsx',
      'src/screens/RemovalsScreen.tsx',
      'src/shell/RemovalsFromStore.tsx',
    ];

    const raising: string[] = [];
    for (const file of files) {
      // eslint-disable-next-line no-await-in-loop
      if ((await source(file)).includes('removalRecorded()')) raising.push(file);
    }

    assert.deepEqual(
      raising,
      ['src/screens/ClientsScreen.tsx'],
      'a second surface is announcing a removal. The register is the only thing in this interface '
        + 'that creates one, and a surface that announces a removal it did not make is a surface '
        + 'guessing about the store.',
    );
  });

  it('is NOT a poll: nothing on this path ticks on a timer', async () => {
    const files = [
      'src/shell/RemovalsFromStore.tsx',
      'src/shell/removals-source.ts',
      'src/platform/LocalStore.tsx',
      'src/platform/local-store.ts',
    ];

    for (const file of files) {
      // eslint-disable-next-line no-await-in-loop
      const text = await source(file);
      for (const ticking of ['setInterval', 'setTimeout', 'requestAnimationFrame']) {
        assert.ok(
          !text.includes(`${ticking}(`),
          `${file} re-reads on a ${ticking}. A timer here is a second copy of the store's own `
            + 'knowledge, ticking for ever to catch an event that already announces itself — and it '
            + 'is a mechanism S16 would then have to unpick to wire the real trigger.',
        );
      }
    }
  });

  /**
   * THE REMOVAL COUNT STAYED NARROW — and this test lost its proxy, which is the point.
   *
   * It used to assert that four named literals were still present in `main.tsx`, on the reasoning
   * that those seams were frozen BECAUSE no synchronisation had ever run. That reasoning was true
   * when it was written and it is now FALSE BY DESIGN: synchronisation runs, and the seams it froze
   * are legitimately fed. The anchor was always a PROXY for the real rule, and a proxy that has
   * stopped standing for anything fails on the work it was waiting for rather than on a defect.
   *
   * So the proxy is dropped and the load-bearing rule is kept, which is the one that was never about
   * how many seams are literals: **`main.tsx` must not read the removal count.** That signal belongs
   * between the register and the pending-removal seam and nowhere else — anything wider is the
   * general notification mechanism this fix exists NOT to be, and the composition root is precisely
   * where a narrow signal would get widened into one.
   */
  it('kept the removal count NARROW: the composition root does not read it', async () => {
    const main = await source('src/main.tsx');

    // The comment beside the seam NAMES the count, which is house style and is why this looks for
    // the CALL rather than the word.
    assert.ok(
      !/useLocalRemovals\(/.test(main),
      'the removal count is being read in main.tsx. It says ONE thing about ONE record — that a '
        + 'removal committed on this device — and reading it at the composition root is how it '
        + 'becomes a general signal that wakes seams it knows nothing about.',
    );

    // And the narrowness is a property of the whole interface, not of one file. Only the seam that
    // has a removal to re-read may consume it.
    //
    // THIS IS NON-VACUOUS BY CONSTRUCTION, which the absence-shaped assertion above is not on its
    // own: it asserts the list equals exactly ONE file, so a scanner that had stopped matching
    // anything would produce an empty list and FAIL here rather than passing quietly.
    const consumers: string[] = [];
    for (const file of [
      'src/main.tsx',
      'src/shell/RemovalsFromStore.tsx',
      'src/shell/Removals.tsx',
      'src/shell/SyncStatus.tsx',
      'src/shell/Divergences.tsx',
      'src/shell/StoppedChanges.tsx',
      'src/shell/KeyMaterial.tsx',
    ]) {
      // eslint-disable-next-line no-await-in-loop
      if (/useLocalRemovals\(/.test(await source(file))) consumers.push(file);
    }

    assert.deepEqual(
      consumers,
      ['src/shell/RemovalsFromStore.tsx'],
      'a seam other than the pending-removal one is reading the removal count. It is a number about '
        + 'a removal, and a seam that reads it to refresh something else is claiming a removal told '
        + 'it something it did not.',
    );
  });

  it('left the five-seam rule alone: the reading still carries facts and nothing callable', async () => {
    const seamFile = await source('src/shell/Removals.tsx');

    assert.ok(
      !seamFile.includes('removalRecorded') && !seamFile.includes('useLocalRemovals'),
      'the signal was put ON the pending-removal seam. `seams.test.ts` holds the four reporting '
        + 'seams to a shape with nothing callable on them, because a control arriving on a surface '
        + 'the coach is TOLD things by is the defect that test exists to catch. The signal belongs '
        + 'on the SOURCE — `platform/LocalStore.tsx`, which is not a seam and says so.',
    );
  });
});
