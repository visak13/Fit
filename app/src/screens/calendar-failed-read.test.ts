/**
 * THE CALENDAR AFTER A READ THAT FAILED — the screen a cold start lands on, and the worst false
 * sentence this application could say.
 *
 * ## What was wrong
 *
 * `readLaunchpadInto` caught a rejected read, logged it to the console and PUBLISHED NOTHING. The
 * screen's `pad` therefore stayed at `null` — and `CalendarScreen.tsx` wrote `pad === null` and
 * "nobody is on the register" as ONE BRANCH, so it painted {@link NO_CLIENTS}:
 *
 *     "Nobody is on your register yet. Add the people you train under Clients, on the navigation,
 *      and they appear here."
 *
 * A coach with forty clients, on a read that failed, was told he has none — and instructed to go and
 * add them. Beneath it {@link NO_ROUTINES} accused him of having DELETED his routines. Both are
 * statements about what HE has and has done, published by a read that looked at nothing.
 *
 * s17/r2 found the shape on the journal and s11/a3 measured it here. This is the screen the
 * application opens on, so it is the instance that matters most.
 *
 * ## WHAT THIS FILE CAN AND CANNOT REACH, STATED RATHER THAN GLOSSED
 *
 * A STATIC RENDER NEVER RUNS AN EFFECT, and the calendar's read lives in one — deliberately, because
 * this screen has no seam and `CalendarScreen.tsx` explains at length why one was not added. So this
 * file CANNOT drive the screen into the `failed` state and read the notice out of the markup; that
 * needs the real browser, and the walk is recorded on the action rather than faked here.
 *
 * WHAT IT CAN PROVE IS THE THING THAT ACTUALLY FIXES THE DEFECT, and it is stronger than a test of
 * the notice would have been: THE FALSE SENTENCES ARE NOW UNREACHABLE FROM ANY STATE BUT A READ THAT
 * LANDED. They used to be painted from `pad === null`, which is every state the screen has before a
 * read succeeds. A static render IS that state — it is the not-yet state, exactly — so a render that
 * does not contain them is evidence about the branch that shipped them, over the real screen, from
 * real markup.
 *
 * Every absence below is pointed at a KNOWN PRESENCE in the same run, because a scan whose whole
 * output is an absence produces the same output when it is broken.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { aClient, anExercise, aRoutine } from '../../core/model/fixtures.js';
import { listClients, openLocalStore } from '../../core/store/store.js';
import { createLaptop, settle } from '../../core/store/testing/platform-double.js';
import { LocalStoreProvider } from '../platform/LocalStore.tsx';
import type { LocalStoreOpening } from '../platform/local-store.ts';
import { NOTHING_AWAITING_REMOVAL, RemovalsProvider } from '../shell/Removals.tsx';
import { DESTINATIONS } from '../shell/navigation.ts';
import type { Destination } from '../shell/navigation.ts';
import { CalendarScreen } from './CalendarScreen.tsx';
import {
  A_FAILED_READ_CHANGED_NOTHING, COULD_NOT_READ_THE_LAUNCHPAD, LAUNCHER_INTRO,
  LAUNCHPAD_STAGE_WORDS, NO_CLIENTS, NO_ROUTINES, SECTION_TITLES, describeFailedLaunchpadRead,
} from './launcher.ts';
import { readLaunchpadInto } from './launcher-source.ts';
import type { LaunchpadReading } from './launcher-source.ts';

/** Stores opened by this file, closed once at the end whatever happened. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const opened: any[] = [];

after(async () => {
  for (const store of opened) {
    // eslint-disable-next-line no-await-in-loop
    await store.close();
  }
});

const calendar = DESTINATIONS.find((held) => held.path === 'calendar') as Destination;

/** Names invented and deliberately unmistakable: no real person appears anywhere in this tree. */
const A_PERSON = 'Test Person Calendar';

/** A REAL store with a REAL person and a REAL routine on it, so "nobody" is measurably false. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aFurnishedStore(): Promise<any> {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });
  opened.push(store);

  await store.create('exercise', anExercise({ id: 'test-calendar-push' }));
  await store.create('routine', aRoutine({
    id: 'test-calendar-routine',
    name: 'Test Calendar Routine',
    entries: [{ exercise_id: 'test-calendar-push', sets: 3, repetitions: 12 }],
  }));
  await store.create('client', aClient({ name: A_PERSON }));

  return store;
}

/**
 * THE SAME REAL STORE, REFUSING TO READ — and the refusal is at the store's own door.
 *
 * Not a hand-built double: everything above the refusal is the production path. `listClients`,
 * `libraryPage` and `unfinishedSessions` are the core's own functions and they all go through
 * `store.read`, so this makes THE REAL READ THROW rather than substituting something that resembles
 * it. What is on the store is untouched, which is what the aftermath test below reads back.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function refusingToRead(store: any, thrown: unknown = new Error('the database closed underneath us')) {
  return new Proxy(store, {
    get(target, property, receiver) {
      if (property === 'read') {
        return async () => { throw thrown; };
      }
      return Reflect.get(target, property, receiver) as unknown;
    },
  });
}

/** One run of the real read, settled. Null when it published nothing — which is the old defect. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readOnce(store: any): Promise<LaunchpadReading | null> {
  let published: LaunchpadReading | null = null;
  readLaunchpadInto(store, (reading) => { published = reading; });
  // The core own settle: a read on the double is a scheduled task rather than a resolved promise,
  // so draining microtasks alone would report nothing was published for a read still in flight.
  await settle();
  return published as LaunchpadReading | null;
}

/**
 * The calendar, rendered as `main.tsx` renders it, with entities decoded back to text.
 *
 * The renderer escapes; these sentences carry apostrophes and dashes. The text is read back AS TEXT
 * rather than each sentence being hand-escaped, which would be a second encoding of the copy and
 * would drift from the first.
 */
function paint(opening: LocalStoreOpening): string {
  return renderToStaticMarkup(
    createElement(MemoryRouter, {
      initialEntries: ['/calendar'],
      children: createElement(LocalStoreProvider, {
        opening,
        children: createElement(RemovalsProvider, {
          reading: NOTHING_AWAITING_REMOVAL,
          children: createElement(CalendarScreen, { destination: calendar }),
        }),
      }),
    }),
  )
    .replace(/&#x27;|&#39;/gu, "'")
    .replace(/&quot;/gu, '"')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&#x2F;/gu, '/');
}

/** The PAINTED WORDS: the markup with every tag removed, which is what the coach actually reads. */
function paintedWords(opening: LocalStoreOpening): string {
  // Tags stripped rather than the report's exports asserted — a correct sentence inside a card that
  // stopped being rendered is the failure this instrument exists to catch, and no assertion about a
  // module's return value would ever notice it.
  return paint(opening).replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim();
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the calendar read publishes what happened, including when nothing came back', () => {
  it('publishes the page it read, so this file is measuring a read that works', async () => {
    const reading = await readOnce(await aFurnishedStore());

    assert.ok(reading !== null, 'the real read published nothing over a healthy store');
    assert.equal(reading.status, 'read', 'a healthy read did not report itself as a read');
    assert.equal(
      reading.status === 'read' ? reading.launchpad.clients.items.length : -1,
      1,
      'the person on the store did not reach the reading, so every absence below is about nothing',
    );
  });

  /**
   * THE ASSERTION THE WHOLE ACTION IS FOR.
   *
   * The old code's catch logged and returned. Nothing was published, so the screen kept the value it
   * already had — and that value is worded as a fact about his register.
   */
  it('publishes the FAILURE when the real read throws, rather than leaving the empty value standing', async () => {
    const reading = await readOnce(refusingToRead(await aFurnishedStore()));

    assert.ok(
      reading !== null,
      'the read published NOTHING. That is not neutral: it leaves the screen at the value it already '
        + 'held, which the screen words as "Nobody is on your register yet".',
    );
    assert.equal(
      reading.status,
      'failed',
      'a failed read did not say it had failed. "failed" and "not read yet" being one value is the '
        + 'whole defect — the screen cannot word a state the reading cannot express.',
    );
    assert.ok(
      !('launchpad' in reading),
      'the failure carries a launchpad. There is nothing to draw after a read that looked at '
        + 'nothing, and a shape offering an empty roster here is the shape that shipped the defect.',
    );
  });

  it('says WHICH read it was, and names the thrown value by its class and never by its message', async () => {
    const reading = await readOnce(
      refusingToRead(await aFurnishedStore(), new TypeError(`the store choked on ${A_PERSON}`)),
    );
    assert.ok(reading !== null && reading.status === 'failed');

    assert.ok(
      ['clients', 'routines', 'unfinished'].includes(reading.failure.stage),
      'the stage tag is not one this screen words, so the screen would say nothing about what failed',
    );
    assert.equal(reading.failure.errorName, 'TypeError', 'the CLASS of the failure is what is carried');
    assert.equal(
      JSON.stringify(reading.failure).includes(A_PERSON),
      false,
      'the exception MESSAGE reached the failure. A store error can quote the row it choked on, and '
        + 'in this application a row carries a client\'s name.',
    );
  });

  /**
   * THE AFTERMATH RULE — the copy makes a claim about the state the failure left behind, so the
   * state is read back.
   *
   * {@link A_FAILED_READ_CHANGED_NOTHING} tells the coach "Nothing on this device was changed by
   * trying. Whatever is on your register is still on it." Two refusal sentences in this build once
   * told him a refused save had ERASED something, and they were false. A sentence about a failure is
   * a separately checkable claim; this is the check.
   */
  it('leaves the register exactly as it was, which is what the failure sentence claims', async () => {
    const store = await aFurnishedStore();
    const before = await listClients(store, { limit: 25 });

    const reading = await readOnce(refusingToRead(store));
    assert.ok(reading !== null && reading.status === 'failed', 'the premise: the read really failed');

    const afterwards = await listClients(store, { limit: 25 });
    assert.deepEqual(
      afterwards,
      before,
      'the register moved across a failed READ. The screen tells him "whatever is on your register '
        + 'is still on it", and a sentence about a failure that misdescribes what it left behind is '
        + 'worse than no sentence.',
    );
    assert.equal(
      afterwards.items.length,
      1,
      'the register was empty on both sides, so this test compared nothing against nothing',
    );
  });
});

describe('the calendar paints no claim about a register it has not read', () => {
  /**
   * A STATIC RENDER IS THE NOT-YET STATE, exactly — the effect that reads has not run, which is the
   * same value the screen held after a failed read for the whole of the defect's life. So these
   * absences are read from the branch that shipped it.
   */
  it('does not say the register is empty before the read has landed', async () => {
    const opening = { state: 'open', store: await aFurnishedStore() } as LocalStoreOpening;
    const words = paintedWords(opening);

    // NON-VACUITY, FIRST AND IN THE SAME RUN. This scan reports the same clean result when the
    // render produced nothing at all, so it is pointed at sentences it MUST find before its
    // absences are worth anything.
    assert.ok(
      words.includes(LAUNCHER_INTRO.slice(0, 40)),
      'the render produced no calendar at all, so every absence below is about an empty string',
    );
    assert.ok(words.includes(SECTION_TITLES.clients), 'the section this screen is about was not drawn');
    assert.ok(words.length > 400, 'the painted words are too short to be this screen');

    assert.equal(
      words.includes(NO_CLIENTS),
      false,
      'the screen said "Nobody is on your register yet" over a register it has not read. It is a '
        + 'statement about what HE has, with an instruction attached, and this is the screen a cold '
        + 'start lands on.',
    );
    assert.equal(
      words.includes(NO_ROUTINES),
      false,
      'the screen said his routines are gone over a library it has not read. NO_ROUTINES says he '
        + 'DELETED them, which is an accusation about something he did.',
    );
  });

  it('draws the register sentence as a BLANK rather than as a fact, which is the discriminant', async () => {
    const { platform } = createLaptop();
    const empty = await openLocalStore({ platform, device: 'coach-laptop-empty' });
    opened.push(empty);

    const words = paintedWords({ state: 'open', store: empty } as LocalStoreOpening);
    assert.ok(words.includes(SECTION_TITLES.clients), 'the section heading is drawn in every state');
    assert.equal(
      words.includes(NO_CLIENTS),
      false,
      'an unread register is still worded as an empty one. An empty value DRAWN AS A BLANK is '
        + 'honest; the same value WORDED AS A FACT is not, and that is the whole discriminant.',
    );
  });
});

describe('the words a failed read has, which it did not have before', () => {
  /**
   * The report is asserted here as well as being drawn, because the browser walk is what proves it
   * REACHES the screen and this proves it SAYS the right thing when it does. Neither claim is the
   * other, and the file header says plainly which instrument covers which.
   */
  it('says the app could not read, never that there is nobody, and carries no instruction to add anyone', () => {
    const report = describeFailedLaunchpadRead({ stage: 'clients', errorName: 'TypeError' });

    assert.equal(report.headline, COULD_NOT_READ_THE_LAUNCHPAD);
    assert.equal(report.whatFailed, LAUNCHPAD_STAGE_WORDS.clients);
    assert.equal(report.notAVerdict, A_FAILED_READ_CHANGED_NOTHING);
    assert.equal(report.stage, 'clients');
    assert.equal(report.errorName, 'TypeError');

    const everySentence = Object.values(report).join(' ');
    assert.equal(
      everySentence.includes('Nobody is on your register'),
      false,
      'the failure report repeats the sentence it exists to replace',
    );
    assert.ok(
      everySentence.includes('could not read'),
      'the one thing this state exists to make sayable is not said',
    );
  });

  it('has a sentence for every stage the source can tag, so no failure is drawn as a blank', () => {
    for (const stage of ['clients', 'routines', 'unfinished'] as const) {
      assert.ok(
        LAUNCHPAD_STAGE_WORDS[stage].length > 20,
        `the ${stage} stage has no sentence, so a failure there would say which read failed and not say it`,
      );
    }
    // And an unknown tag does not produce a blank either — the set could grow in the source without
    // this module noticing, and a missing sentence must read as a gap rather than as nothing.
    const unknown = describeFailedLaunchpadRead({ stage: 'invented', errorName: 'Error' });
    assert.ok(unknown.whatFailed.length > 0, 'an unworded stage drew nothing where a fact belongs');
  });
});
