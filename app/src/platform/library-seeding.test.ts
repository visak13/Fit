/**
 * THE SHIPPED LIBRARY REACHES A DEVICE THAT HAS NEVER BEEN SEEDED — proven from an empty store,
 * through the seam the running application goes through.
 *
 * ## WHY THE SHAPE OF THIS FILE IS THE POINT
 *
 * The defect this closes shipped with every gate green. `core/seed` has a full suite; so does the
 * store; so does the interface. Every one of them SEEDS ITS OWN FIXTURES and then asserts that a
 * library exists — and a test that writes the library it is about to look for cannot notice that
 * nothing in the application ever writes one. Nothing under `src/` imported the seed package at all,
 * and no suite could have said so, because none of them started from a device.
 *
 * So this file starts from `openLocalStore` on a fresh in-process database with NOTHING written to
 * it, and everything that puts records in it goes through {@link seedingAfterOpening} —
 * the exact function `OpeningLocalStore` wraps the application's own opening in. It does not call
 * `importSeed`, `seedIfNeeded` or the store's writers to arrange its own starting point, with one
 * declared exception: the NON-VACUITY PROBES below, which deliberately reach past the seam in order
 * to show that these assertions can produce the other answer.
 *
 * ## THE PROBES, AND WHY EVERY ABSENCE-SHAPED ASSERTION HAS ONE
 *
 * Three of the properties here are ABSENCES — "writes nothing", "does not refill", "does not import
 * twice". An absence-shaped assertion passes just as happily when the thing it checks is broken in a
 * way that produces no writes at all, and it passes when the check itself is pointed at nothing. So
 * each one is paired with a probe that INDUCES the other answer and asserts the induction landed:
 * a re-import that really does write, an emptied library that really is refilled by a fresh device,
 * a double import that really does double the count. A probe that failed to apply its own break
 * would fail here rather than reporting green, which is the failure mode that corrupts every other
 * result in a prove-by-breaking pass.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import { SEED_TYPES, seedCounts } from '../../core/seed/content.js';
import { hasBeenSeeded, seedIfNeeded } from '../../core/seed/seed.js';
import { libraryPage, openLocalStore } from '../../core/store/store.js';
import {
  createLaptop, createTwoWindowLaptop, settle as settleTheWorld,
} from '../../core/store/testing/platform-double.js';
import { readLaunchpad } from '../screens/launcher-source.ts';
import {
  LIBRARY_ALREADY_HERE, LIBRARY_JUST_IMPORTED, LIBRARY_NOT_YET, SEEDING_LOCK,
  classifySeedingFailure, describeSeedingFailure, librarySnag, seedTheLibrary, seedingAfterOpening,
} from './library-seeding.ts';
import type { LibrarySeeding } from './library-seeding.ts';
import { beginOpening } from './local-store.ts';
import type { LocalStoreOpening } from './local-store.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Stores opened by this file, closed once at the end whatever happened. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const opened: any[] = [];

after(async () => {
  for (const store of opened) {
    // eslint-disable-next-line no-await-in-loop
    await store.close();
  }
});

/**
 * A device that has NEVER BEEN SEEDED. Nothing is written to it here — that is the whole point of
 * the file, and a helper that pre-filled it would reintroduce the defect into its own test.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aFreshDevice(): Promise<any> {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });
  opened.push(store);
  return store;
}

/** How many LIVE records of each seeded kind the store holds — what a screen would find. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function liveCounts(store: any): Promise<Record<string, number>> {
  const found: Record<string, number> = {};
  for (const type of SEED_TYPES) {
    // eslint-disable-next-line no-await-in-loop
    const page = await libraryPage(store, type, { limit: 500 });
    found[type] = page.items.length;
  }
  return found;
}

/** Every record of the seeded kinds, tombstones included — what `hasBeenSeeded` is answered from. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rowCounts(store: any): Promise<Record<string, number>> {
  const found: Record<string, number> = {};
  for (const type of SEED_TYPES) {
    // eslint-disable-next-line no-await-in-loop
    found[type] = await store.count(type);
  }
  return found;
}

/**
 * Let every scheduled task and commit land.
 *
 * The core's OWN settle, not a handful of resolved promises: the database double commits on a
 * timer, so a microtask-only wait returns before anything has been written — and every assertion
 * after it would then be measuring a store mid-flight while looking exactly like a store that was
 * never seeded. That is not a hypothetical; it is what the first run of this file did.
 */
async function settle(): Promise<void> {
  await settleTheWorld();
}

/**
 * Settle until something is true, and FAIL LOUDLY rather than carry on if it never becomes true.
 *
 * A fixed number of turns is a guess about how long a transaction takes, and a guess that is too
 * short does not fail — it returns early and every assertion after it reads a store mid-flight. This
 * file's first run did exactly that and produced a store that looked unseeded, then a half-emptied
 * library, both of which read as findings about the code rather than about the wait.
 */
async function settleUntil(ready: () => boolean, what: string): Promise<void> {
  for (let round = 0; round < 40; round += 1) {
    if (ready()) return;
    // eslint-disable-next-line no-await-in-loop
    await settle();
  }
  assert.fail(`${what} never happened, so nothing after this point was measured against anything`);
}

/**
 * DRIVE THE APPLICATION'S OWN OPENING over a store, exactly as `OpeningLocalStore` composes it:
 * `beginOpening(seedingAfterOpening(open, publishLibrary), publishOpening)`.
 *
 * Nothing here re-implements the composition — the composition is asserted against the component's
 * own source below, so this helper cannot quietly drift into testing a wiring the app does not use.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function openTheAppOver(store: any): Promise<{
  opening: LocalStoreOpening[];
  library: LibrarySeeding[];
  cancel: () => void;
}> {
  const opening: LocalStoreOpening[] = [];
  const library: LibrarySeeding[] = [];

  const cancel = beginOpening(
    seedingAfterOpening(async () => store, (seeding) => void library.push(seeding)),
    (state) => void opening.push(state),
  );
  await settleUntil(
    () => opening.length > 0 && library.length > 0,
    'the opening did not publish both a store state and a library answer',
  );

  return { opening, library, cancel };
}

describe('the shipped library reaches a device that has never been seeded', () => {
  it('lands the whole shipped library, from an empty store, through the application’s own seam', async () => {
    const store = await aFreshDevice();

    // THE PRECONDITION IS ASSERTED, NOT ASSUMED. If this store were already seeded the whole test
    // would pass for the wrong reason — which is precisely how the original defect survived.
    assert.equal(await hasBeenSeeded(store), false, 'the device was already seeded before we started');
    assert.deepEqual(await liveCounts(store), { exercise: 0, routine: 0, 'intensity-pattern': 0 });

    const { opening, library } = await openTheAppOver(store);

    assert.deepEqual(library, [LIBRARY_JUST_IMPORTED], 'the seeding did not report a first-run import');
    assert.equal(opening.length, 1);
    assert.equal(opening[0].state, 'open');

    // THE WHOLE SHIPPED SET, including the exercises no routine references. A count short of this is
    // the substitution pool being pruned, which is the one failure the seed package is built around.
    assert.deepEqual(await liveCounts(store), { ...seedCounts() });
  });

  it('publishes the library answer BEFORE the store is published as open', async () => {
    // NOT AN ORDERING PREFERENCE — it is the whole reason seeding lives inside the opening. Every
    // surface that reads content starts reading the moment it is told the store is open, and nothing
    // in this build re-reads. A library that landed afterwards would leave the coach looking at "no
    // routines" on a correctly seeded app until he reloaded.
    const store = await aFreshDevice();
    const order: string[] = [];

    const cancel = beginOpening(
      seedingAfterOpening(async () => store, () => void order.push('library')),
      () => void order.push('open'),
    );
    await settleUntil(() => order.length === 2, 'the opening did not publish both answers');
    cancel();

    assert.deepEqual(order, ['library', 'open']);
  });

  it('gives the coach a routine he can actually pick, read the way the calendar reads it', async () => {
    // The end of the walk, in the suite: not "records exist" but "the screen that starts a session
    // has something to offer". `readLaunchpad` is the calendar's own read, unchanged.
    const store = await aFreshDevice();
    await openTheAppOver(store);

    const pad = await readLaunchpad(store);
    assert.ok(pad.routines.items.length > 0, 'the calendar would still say there are no routines');

    const routine = pad.routines.items[0];
    assert.ok(typeof routine.content.name === 'string' && routine.content.name.length > 0);
    assert.ok(typeof routine.content.id === 'string' && routine.content.id.length > 0);

    // And the routine's exercises are really there, because a routine naming exercises that were not
    // written is the half-applied library the single transaction exists to prevent.
    const named = (routine.content as { entries?: { exercise_id: string }[] }).entries ?? [];
    assert.ok(named.length > 0, 'the first shipped routine names no exercises');
    for (const entry of named) {
      // eslint-disable-next-line no-await-in-loop
      const found = await store.getByContentKey('exercise', entry.exercise_id);
      assert.ok(found, `the routine names "${entry.exercise_id}" and it was not written`);
    }
  });
});

describe('seeding happens ONCE and never on the application’s own initiative', () => {
  it('writes NOTHING on the second opening — and the probe shows both comparisons can move', async () => {
    const store = await aFreshDevice();

    const beforeAnything = await rowCounts(store);
    const noteBeforeAnything = await store.getMeta('seed:last-import');

    await openTheAppOver(store);
    const afterFirst = await rowCounts(store);
    const noteAfterFirst = await store.getMeta('seed:last-import');

    // ── NON-VACUITY PROBE, RUN BEFORE THE ABSENCE IT GUARDS ────────────────────────────────────
    // "nothing was written" is an absence, and an absence passes just as happily over a store that
    // cannot be written to at all, or through a comparison pointed at nothing. Both comparisons the
    // property rests on are therefore shown moving FIRST, in this same run, on this same store,
    // driven by the same seam. If either of these two fails, nothing below it means anything.
    assert.notDeepEqual(
      afterFirst, beforeAnything,
      'the row counts did not move across a real first-run import: this comparison cannot see a write',
    );
    assert.notDeepEqual(
      noteAfterFirst, noteBeforeAnything,
      'the import note did not move across a real import: this comparison cannot see the importer run',
    );

    const { library } = await openTheAppOver(store);
    assert.deepEqual(library, [LIBRARY_ALREADY_HERE], 'the second opening did not report already-seeded');
    assert.deepEqual(await rowCounts(store), afterFirst, 'the second opening wrote records');
    assert.deepEqual(
      await store.getMeta('seed:last-import'), noteAfterFirst,
      'the second opening rewrote the import note, so it went through the importer',
    );
  });

  it('does NOT refill a library the coach has emptied — and the probe shows an empty device would be filled', async () => {
    const store = await aFreshDevice();
    await openTheAppOver(store);

    // HE DELETES THE LOT. Deletion raises a tombstone, so the rows stay and the library stays
    // SEEDED; what goes is everything a screen would show him.
    for (const type of SEED_TYPES) {
      // eslint-disable-next-line no-await-in-loop
      const page = await libraryPage(store, type, { limit: 500 });
      for (const record of page.items) {
        // eslint-disable-next-line no-await-in-loop
        await store.tombstone(type, record.record_id);
      }
    }
    assert.deepEqual(await liveCounts(store), { exercise: 0, routine: 0, 'intensity-pattern': 0 });
    assert.equal(await hasBeenSeeded(store), true, 'an emptied library must still be a seeded one');

    const { library } = await openTheAppOver(store);
    assert.deepEqual(library, [LIBRARY_ALREADY_HERE], 'the app decided to re-seed a library he emptied');
    assert.deepEqual(
      await liveCounts(store), { exercise: 0, routine: 0, 'intensity-pattern': 0 },
      'the app silently put back content the coach deliberately deleted',
    );

    // ── NON-VACUITY PROBE ──────────────────────────────────────────────────────────────────────
    // The assertion above would also pass if the seam had simply stopped seeding anything, anywhere.
    // So point it at a KNOWN POSITIVE in the same run: a device that has never been seeded, through
    // the same seam, in the same process, must come out full.
    const fresh = await aFreshDevice();
    const { library: onFresh } = await openTheAppOver(fresh);
    assert.deepEqual(onFresh, [LIBRARY_JUST_IMPORTED], 'the seam seeds nothing at all, so the check above proved nothing');
    assert.deepEqual(await liveCounts(fresh), { ...seedCounts() });
  });

  it('two openings at once seed ONCE and neither is told the library failed', async () => {
    // React invokes an effect twice in development, so this fires on EVERY `npm run dev`: the store
    // is opened, that opening is thrown away, and a second one is opened. Both ask an unseeded store
    // what is in it, both are told nothing, and both would import.
    const { world, a, b } = createTwoWindowLaptop();
    const first = await openLocalStore({ platform: a, device: 'coach-laptop' });
    const second = await openLocalStore({ platform: b, device: 'coach-laptop' });
    opened.push(first, second);

    const answers = await Promise.all([seedTheLibrary(first), seedTheLibrary(second)]);
    await settle();

    assert.deepEqual(
      answers.filter((answer) => answer === LIBRARY_JUST_IMPORTED).length, 1,
      'exactly one of the two openings may report a first-run import',
    );
    assert.deepEqual(
      answers.filter((answer) => answer.state === 'could-not'), [],
      'an opening was told the library could not be written on a device where it was written fine',
    );
    assert.deepEqual(await liveCounts(first), { ...seedCounts() });
    assert.ok(
      world.locks.log.some((entry: { name: string }) => entry.name === SEEDING_LOCK),
      'the cross-window lock was never taken, so two real windows are not held apart',
    );

    // ── NON-VACUITY PROBE, RE-AIMED (s11/a27) ──────────────────────────────────────────────────
    // "neither was told it failed" is an absence, and it would pass just as happily if nothing here
    // could ever produce that answer. So run the SAME race past the guard, on a second device, and
    // require the thing the guard prevents to appear.
    //
    // WHAT IT USED TO REQUIRE, AND WHY THAT EVIDENCE IS GONE. It required a REJECTION: the second
    // import was refused whole by the unique content-key index, and what the coach would have got is
    // a seeding failure on a device that seeded perfectly well. That refusal was the same mechanism
    // that stopped two DEVICES ever merging (s11/a9), and the store now reconciles a library record
    // arriving under another identity instead of colliding with it — so the unguarded race no longer
    // throws, and the probe went hollow. **It is re-aimed, not weakened.** A probe that passes because
    // there is nothing left to catch and a probe that passes because it was softened produce the same
    // green, and this step has paid for that four times.
    //
    // WHAT IT REQUIRES NOW is the SAME QUANTITY the guarded assertion above measures — how many of the
    // two openings report a first-run import. Guarded: exactly one. Unguarded: two, measured. The
    // second import is redundant work rather than an error now, which is a better outcome and a
    // weaker signal, so the signal is taken from the guard's own subject instead of from an index
    // that happened to be standing nearby.
    const { a: c, b: d } = createTwoWindowLaptop();
    const third = await openLocalStore({ platform: c, device: 'coach-laptop' });
    const fourth = await openLocalStore({ platform: d, device: 'coach-laptop' });
    opened.push(third, fourth);

    const unguarded = await Promise.allSettled([seedIfNeeded(third), seedIfNeeded(fourth)]);
    assert.equal(
      unguarded.filter((outcome) => outcome.status === 'fulfilled'
        && (outcome.value as { imported: boolean }).imported === true).length, 2,
      'the unguarded race imported once, so the guard above was never shown doing anything',
    );
    assert.deepEqual(
      await liveCounts(third), { ...seedCounts() },
      'and the doubled import did NOT double the library — which is the store reconciling on the '
      + 'content key, not the guard, and is asserted here so that the two are not confused',
    );
  });
});

describe('a seeding that could not happen is REPORTED, and never becomes a store that would not open', () => {
  it('hands the store on regardless, with a condition instead of a rejection', async () => {
    const store = await aFreshDevice();
    const library: LibrarySeeding[] = [];
    const opening: LocalStoreOpening[] = [];

    const refuses = async () => {
      throw new Error('QuotaExceededError: the quota has been exceeded');
    };

    beginOpening(
      seedingAfterOpening(async () => store, (seeding) => void library.push(seeding), refuses),
      (state) => void opening.push(state),
    );
    await settleUntil(
      () => opening.length > 0 && library.length > 0,
      'the opening did not publish both a store state and a library answer',
    );

    // THE PROPERTY THAT MATTERS: the app still opened. A device with no room is a condition to
    // report, not a blank screen and not "your storage could not be opened", which would be a
    // sentence about the wrong thing.
    assert.equal(opening.length, 1);
    assert.equal(opening[0].state, 'open');

    assert.equal(library.length, 1);
    assert.equal(library[0].state, 'could-not');
    assert.ok(library[0].state === 'could-not');
    assert.equal(library[0].condition.code, 'no-room');
  });

  it('says something different for a fault it does not recognise, and both say the app still works', () => {
    assert.equal(classifySeedingFailure(new Error('QuotaExceededError: no room')), 'no-room');
    assert.equal(classifySeedingFailure(new Error('something nobody has seen')), 'refused');
    assert.equal(classifySeedingFailure(null), 'refused');

    const noRoom = describeSeedingFailure(new Error('QuotaExceededError: no room'));
    const refused = describeSeedingFailure(new Error('something nobody has seen'));

    assert.notEqual(noRoom.headline, refused.headline, 'two different faults were given one sentence');
    for (const condition of [noRoom, refused]) {
      assert.ok(condition.headline.length > 0);
      assert.ok(condition.whatToDo.includes('safe'), 'a condition that does not say his own work is safe');
      assert.doesNotMatch(
        condition.headline, /Error|Exceeded/,
        'the headline is the platform’s words rather than the coach’s',
      );
    }
    // The browser's own words survive, and they are never the headline.
    assert.match(String(noRoom.verbatim), /QuotaExceededError/);
    assert.equal(describeSeedingFailure(null).verbatim, null);
  });

  it('has nothing to say while the answer is still coming, or once it is fine', () => {
    // Two notices about one condition read as two faults: the store's own notice is already saying
    // the store is not open, and the library says nothing until it has something of its own to say.
    assert.equal(librarySnag(LIBRARY_NOT_YET), null);
    assert.equal(librarySnag(LIBRARY_ALREADY_HERE), null);
    assert.equal(librarySnag(LIBRARY_JUST_IMPORTED), null);

    const condition = describeSeedingFailure(new Error('QuotaExceededError: no room'));
    assert.equal(librarySnag({ state: 'could-not', condition }), condition);
  });
});

describe('the seam this file drives is the seam the application runs on', () => {
  it('is composed by OpeningLocalStore itself, so this suite cannot drift into testing a wiring nobody uses', async () => {
    // The interface suite renders outside a browser and a static render never runs an effect, so the
    // composition inside `OpeningLocalStore` is beyond its reach. Reading it is the honest second
    // best, and it is the same thing `local-store.test.ts` does to the core's own sentences: it fails
    // when somebody unpicks the wiring, which is the change this is here to catch.
    const source = await readFile(path.join(here, 'LocalStore.tsx'), 'utf8');

    assert.match(
      source, /seedingAfterOpening\(open, setLibrary\)/,
      'OpeningLocalStore no longer wraps its opening in the seeding: a fresh device would not be seeded',
    );
    assert.match(
      source, /beginOpening\(openAndSeed, setOpening\)/,
      'OpeningLocalStore opens something other than the seeded opening',
    );
    assert.match(
      source, /library=\{library\}/,
      'the library answer is no longer published to the screens, so a failure would be silent',
    );
  });

  it('is the ONLY place this application asks the seed package to seed', async () => {
    // A second call site is how "seed once" becomes "seed whenever this other thing runs". The scan
    // is pointed at a known positive in the same run — this module — so its silence about everything
    // else means something.
    const root = path.join(here, '..');
    const found = await callSitesOf('seedIfNeeded', root);

    assert.deepEqual(
      found, ['platform/library-seeding.ts'],
      'seedIfNeeded is called somewhere else under src/, or has stopped being called at all',
    );
  });
});

/** Every file under `root` whose text names `symbol`, as paths relative to `root`. */
async function callSitesOf(symbol: string, root: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises');
  const found: string[] = [];

  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith('.test.ts')) continue;
      const text = await readFile(full, 'utf8');
      if (text.includes(`${symbol}(`)) {
        found.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  };

  await walk(root);
  return found.sort();
}
