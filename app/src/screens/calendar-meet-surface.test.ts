/**
 * THE MEETING-LINK WORDS, READ OUT OF THE MARKUP THE COACH ACTUALLY GETS.
 *
 * ## Why this file exists beside `launcher.test.ts`
 *
 * That suite proves the MODULE DECIDED the right words. This proves the SCREEN DREW THEM, and the
 * two are not the same claim. Every sentence this action adds is behind a condition — the link
 * question appears only on the online answer, the calendar notice only under the make-one answer,
 * the group warning only from two clients up — and a condition written slightly too narrow drops a
 * sentence the module correctly produced, which no assertion about a report would ever notice. This
 * build has been bitten by exactly that: a5's own family had a correct sentence drawn inside a card
 * that stopped being rendered, and every report-level test stayed green.
 *
 * ## And the absences here are read from the RENDERED TEXT, never from the source
 *
 * The house style documents a prohibition beside the code it constrains, so a scan over source
 * matches the very sentences explaining why the forbidden thing is forbidden. What reaches the coach
 * is markup, so markup is what is scanned — and every absence below is pointed at a KNOWN PRESENCE
 * in the same run, because a scan whose whole output is an absence produces the same output when it
 * is broken.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, describe, it } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { aClient, anExercise, aRoutine } from '../../core/model/fixtures.js';
import { openLocalStore } from '../../core/store/store.js';
import { createLaptop } from '../../core/store/testing/platform-double.js';
import { LocalStoreProvider } from '../platform/LocalStore.tsx';
import type { LocalStoreOpening } from '../platform/local-store.ts';
import {
  CALENDAR_NOTICE, GROUP_CALL_WARNING, MAIN_CALENDAR_ID,
} from '../platform/google-meet.ts';
import { NOTHING_AWAITING_REMOVAL, RemovalsProvider } from '../shell/Removals.tsx';
import { DESTINATIONS } from '../shell/navigation.ts';
import type { Destination } from '../shell/navigation.ts';
import { CalendarScreen } from './CalendarScreen.tsx';
import { LINK_CHOICES, LINK_QUESTION, PASTED_LINK_LABEL } from './launcher.ts';

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

/**
 * A furnished practice, so the screen has people and a routine to draw.
 *
 * Names invented and deliberately unmistakable: this repository is public by an explicit decision
 * and no real person appears anywhere in this tree.
 */
async function aPractice(names: string[]): Promise<LocalStoreOpening> {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });
  opened.push(store);

  await store.create('exercise', anExercise({ id: 'test-meet-push' }));
  await store.create('routine', aRoutine({
    id: 'test-meet-routine',
    name: 'Test Meet Routine',
    entries: [{ exercise_id: 'test-meet-push', sets: 3, repetitions: 12 }],
  }));
  for (const name of names) {
    // eslint-disable-next-line no-await-in-loop
    await store.create('client', aClient({ name }));
  }

  return { state: 'open', store } as LocalStoreOpening;
}

/**
 * The calendar, rendered as `main.tsx` renders it.
 *
 * A router is required rather than convenient: this screen reads the address to find out whether the
 * coach arrived here about one person, and it navigates to the runner when a session starts.
 */
function render(opening: LocalStoreOpening, address = '/calendar'): string {
  const markup = renderToStaticMarkup(
    createElement(MemoryRouter, {
      initialEntries: [address],
      children: createElement(LocalStoreProvider, {
        opening,
        children: createElement(RemovalsProvider, {
          reading: NOTHING_AWAITING_REMOVAL,
          children: createElement(CalendarScreen, { destination: calendar }),
        }),
      }),
    }),
  );
  // The renderer escapes; these sentences carry apostrophes and dashes. The text is read back AS
  // TEXT rather than each sentence being hand-escaped, which would be a second encoding of the copy
  // and would drift from the first.
  return markup
    .replace(/&#x27;|&#39;/gu, "'")
    .replace(/&quot;/gu, '"')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&#x2F;/gu, '/');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the calendar screen, on first arrival', () => {
  it('asks nothing about a joining link until he has said the session is a call', async () => {
    const html = render(await aPractice(['Test Client A']));

    // THE NON-VACUITY PROBE, first and in the same run: the render really did produce this screen.
    // Without it every absence below passes for free over an empty string.
    assert.ok(html.includes('Where is this session?'),
      'fixture check: this really is the launcher, drawn, with its mode question on it');

    assert.equal(html.includes(LINK_QUESTION), false,
      'the link question belongs to the online answer, and he has not given one');
    assert.equal(html.includes(PASTED_LINK_LABEL), false);
    assert.equal(html.includes(CALENDAR_NOTICE.main), false,
      'and nothing has been said about a calendar, because nothing is going on one');
  });

  it('promises IN PERSON CREATES NOTHING REMOTE, in the words he reads before choosing', async () => {
    const html = render(await aPractice(['Test Client A']));

    assert.ok(html.includes('No calendar entry, no joining link, no request leaves this device'),
      'a promise about what the app does not do out of his sight has to be ON THE SCREEN, because '
      + 'it is the one kind of promise he cannot verify for himself');
  });

  it('says NOTHING about the sixty-minute cut before there is a group and a call to cut', async () => {
    const html = render(await aPractice(['Test Client A', 'Test Client B']));

    assert.equal(html.includes(GROUP_CALL_WARNING), false,
      'nobody is chosen and no mode is answered, so there is neither a group nor a call');
    assert.ok(html.includes('Where is this session?'),
      'fixture check: the launcher really did render, so the absence above is about the warning '
      + 'rather than about an empty string');
  });
});

describe('the words that are on the screen whatever he chooses', () => {
  /**
   * WHAT A STATIC RENDER CAN AND CANNOT PROVE, said plainly rather than left to be assumed.
   *
   * `renderToStaticMarkup` runs no effect and dispatches no event, so the roster arrives after the
   * markup does and nothing here can press a control. That is why the absences above are the strong
   * claims in this file: they are about the FIRST paint, which is exactly the state a static render
   * models faithfully.
   *
   * What it cannot do is put the screen into the chosen-online-with-two-clients state, so the
   * conditional sentences are proved in two halves that meet: `launcher.test.ts` drives the
   * DERIVATION across every state, and the check below holds the DRAWING to consuming what that
   * derivation produces. Neither half alone would catch a report field the component quietly stopped
   * rendering, which is the failure this build has already met once.
   */
  it('draws the fields the derivation produces, rather than deciding again for itself', async () => {
    const source = await readFile(new URL('./CalendarScreen.tsx', import.meta.url), 'utf8');

    for (const field of ['start.groupCallWarning', 'mint.headline', 'mint.offerPaste',
      'choice.consequence', 'calendarNotice()']) {
      assert.ok(source.includes(field), `${field} is drawn rather than derived a second time here`);
    }

    // NON-VACUITY: the same read, over the same text, does NOT find a name that was never there.
    assert.equal(source.includes('start.thisFieldDoesNotExist'), false,
      'fixture check: the scan is matching real names rather than returning true for anything');

    for (const choice of LINK_CHOICES) {
      assert.ok(choice.consequence.length > 0, `${choice.value} says what choosing it causes`);
    }
    assert.ok(render(await aPractice(['Test Client A'])).length > 0);
  });

  it('carries NO EMOJI anywhere in the markup a coach reads', async () => {
    const html = render(await aPractice(['Test Client A', 'Test Client B']));

    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
    assert.equal(emoji.test(html), false, 'no emoji in any user-facing string');

    // NON-VACUITY: the same pattern over text that DOES carry one finds it. Without this the
    // assertion above passes identically when the regular expression is wrong.
    assert.equal(emoji.test('a calendar 📅 in a sentence'), true,
      'fixture check: the sweep can genuinely see an emoji when there is one');
  });

  it('claims nothing about Android, which nothing in this build has ever tested', async () => {
    const html = render(await aPractice(['Test Client A']));

    assert.equal(/android/i.test(html), false);
    assert.ok(/iphone|ios|calendar|session/i.test(html),
      'fixture check: the scan is reading real markup, not an empty string');
  });
});

describe('the meeting-link sentences, checked as sentences rather than as code', () => {
  it('names the calendar an event lands on, and how to change it, in one breath', () => {
    assert.ok(CALENDAR_NOTICE.main.includes('your main Google calendar'));
    assert.ok(CALENDAR_NOTICE.main.includes('Setup'));
    assert.ok(
      CALENDAR_NOTICE.main.indexOf('your main Google calendar')
      < CALENDAR_NOTICE.main.indexOf('Setup'),
      'which calendar first, then how to change it — the limitation and the exit, in that order',
    );
    assert.equal(CALENDAR_NOTICE.main.includes(MAIN_CALENDAR_ID), false,
      'and it says main calendar in his words rather than repeating the service\'s alias at him');
  });

  it('attributes the group-call cut to Google and says his own links are cut the same way', () => {
    assert.ok(GROUP_CALL_WARNING.includes('60 minutes'));
    assert.ok(GROUP_CALL_WARNING.includes("Google's limit and not this app's"));
    assert.ok(GROUP_CALL_WARNING.includes('link you make yourself'),
      'without this he goes off making links by hand, which costs him effort and changes nothing');
  });
});
