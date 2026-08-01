/**
 * THE SETUP SURFACE, HELD TO THE CLAIMS IT MAKES RATHER THAN TO THE NAMES IT CONTAINS.
 *
 * A sentence that sends somebody somewhere makes three separable claims — the destination EXISTS,
 * it is LABELLED as the sentence says, and if the sentence says WHERE, the direction is right — and
 * this step's dominant defect has been asserting the NAME and calling that done. So every claim
 * below is read off the source that RENDERS it: the heading comes out of the painted markup, the
 * word the coach is told to look for comes out of `google-meet.ts`'s shipped notice, and Admin's
 * promise about itself comes out of `navigation.ts`. Nothing is compared against a string this file
 * also wrote.
 *
 * A LINK IS A DESTINATION CLAIM LIKE ANY OTHER, so every href the screen paints is held to being
 * present, absolute, https and opening in a new tab with `noopener`.
 *
 * ## WHAT A STATIC RENDER CAN AND CANNOT ANSWER, said rather than left to be assumed
 *
 * `renderToStaticMarkup` runs no effects, so the painted screen here is the one a coach meets in the
 * instant before the browser answers: no ticks read back, no saved values, no origin. That is a real
 * state and it is worth painting — it must be a screen with words on it rather than a blank frame —
 * but it is NOT the working screen. The parts that only exist once a browser has answered are proven
 * against their own functions in this file, and proven again by WALKING the running application,
 * which is recorded in the action's evidence. A card that draws and a card that works are different
 * claims.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { CALENDAR_NOTICE } from '../platform/google-meet.ts';
import { COACHING_CALENDAR_KEY, GOOGLE_CLIENT_ID_KEY } from '../platform/google-settings.ts';
import { SMALL_FACT_KEYS, browserErasure } from '../platform/google-account.ts';
import type { SmallFactStorage } from '../platform/google-identity.ts';
import { DESTINATIONS, SETUP_PATH } from '../shell/navigation.ts';
import type { Destination } from '../shell/navigation.ts';
import { LocalStoreProvider } from '../platform/LocalStore.tsx';
import { STILL_OPENING } from '../platform/local-store.ts';
import { PlatformStatusProvider } from '../platform/platform-status.tsx';
import { DivergenceProvider, NOTHING_TO_DECIDE } from '../shell/Divergences.tsx';
import { KeyMaterialProvider, NO_KEY_MATERIAL_CONDITION } from '../shell/KeyMaterial.tsx';
import { NOTHING_AWAITING_REMOVAL, RemovalsProvider } from '../shell/Removals.tsx';
import { NOTHING_STOPPED, StoppedChangesProvider } from '../shell/StoppedChanges.tsx';
import { NO_BACKUP_YET, SyncStatusProvider } from '../shell/SyncStatus.tsx';
import { AdminScreen } from './AdminScreen.tsx';
import { SetupScreen } from './SetupScreen.tsx';
import { CALENDAR_SIGN_IN_FIRST, CALENDAR_STEPS, CLIENT_ID_STEPS, SETUP_LABEL } from './setup.ts';
import * as SURFACE from './setup-surface.ts';
import {
  ALL_SETUP_STEPS, SETUP_PROGRESS_KEY, SETUP_SECTIONS, describeSetupAdminEntry, rememberTicks,
  runningOrigin, standingFor, tickName, tickedSteps,
} from './setup-surface.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

/** A browser's small-fact storage, standing in for one, so a refusal can be arranged on purpose. */
function fakeStorage(refuses = false): SmallFactStorage & { held: Map<string, string> } {
  const held = new Map<string, string>();
  return {
    held,
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => {
      if (refuses) throw new Error('this browser refuses to keep settings');
      held.set(key, value);
    },
    removeItem: (key) => {
      if (refuses) throw new Error('this browser refuses to keep settings');
      held.delete(key);
    },
  };
}

/** The Setup screen as the router paints it. No providers: this screen takes no seam, on purpose. */
function paintSetup(): string {
  return renderToStaticMarkup(
    createElement(MemoryRouter, { children: createElement(SetupScreen) as ReactNode } as never),
  );
}

const ADMIN: Destination = (() => {
  const found = DESTINATIONS.find((destination) => destination.path === 'admin');
  if (found === undefined) throw new Error('there is no admin destination to render');
  return found;
})();

/** Admin, inside the providers `App.tsx` wires around it. The store is left opening, as on a cold start. */
function paintAdmin(): string {
  const screen: ReactNode = createElement(AdminScreen, { destination: ADMIN });
  return renderToStaticMarkup(
    createElement(LocalStoreProvider, {
      opening: STILL_OPENING,
      children: createElement(PlatformStatusProvider, {
        status: { buildStamp: 'setup-surface', persistence: null, offlineStart: { registered: true, reason: null } },
        children: createElement(SyncStatusProvider, {
          reading: NO_BACKUP_YET,
          children: createElement(DivergenceProvider, {
            reading: NOTHING_TO_DECIDE,
            children: createElement(KeyMaterialProvider, {
              reading: NO_KEY_MATERIAL_CONDITION,
              children: createElement(StoppedChangesProvider, {
                reading: NOTHING_STOPPED,
                children: createElement(RemovalsProvider, {
                  reading: NOTHING_AWAITING_REMOVAL,
                  children: createElement(MemoryRouter, { children: screen }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as never),
  );
}

/** Every anchor in a document, with its attributes and the words on it. */
function anchors(html: string): Array<{ tag: string; href: string; label: string }> {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((found) => ({
    tag: found[1],
    href: /href="([^"]*)"/.exec(found[1])?.[1] ?? '',
    label: found[2].replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
  }));
}

/** The text of one element, addressed by an id it carries. React escapes, so this is markup. */
function textOf(html: string, id: string): string {
  const at = html.indexOf(`id="${id}"`);
  assert.notEqual(at, -1, `nothing on this screen carries id="${id}"`);
  const opens = html.indexOf('>', at) + 1;
  const closes = html.indexOf('<', opens);
  return html.slice(opens, closes).trim();
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The promise that shipped before the place did
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the place the shipped calendar notice has been sending him to', () => {
  /**
   * Whether a sentence NAMES a place, as a place rather than by accident.
   *
   * A bare `includes` would pass on any sentence containing the letters, which for a common word
   * like this is most of them. The place has to stand on its own — a boundary before it and a
   * boundary or the end of a clause after it — so the check is about the name being used as a name.
   */
  function namesThePlace(sentence: string, place: string): boolean {
    for (let at = sentence.indexOf(place); at !== -1; at = sentence.indexOf(place, at + 1)) {
      const before = at === 0 ? ' ' : sentence[at - 1];
      const after = sentence[at + place.length] ?? '.';
      if (' ('.includes(before) && ' .,;)'.includes(after)) return true;
    }
    return false;
  }

  it('EXISTS: the route table answers to it and the screen renders', () => {
    const painted = paintSetup();
    assert.ok(painted.includes('id="screen-setup"'), 'the Setup screen did not render itself');
    assert.ok(painted.length > 2000, 'the Setup screen rendered almost nothing');
  });

  it('is LABELLED as BOTH forms of the shipped notice name it, read off the heading not off a constant', () => {
    const heading = textOf(paintSetup(), 'screen-setup');

    for (const [which, notice] of Object.entries(CALENDAR_NOTICE)) {
      assert.ok(
        namesThePlace(notice, heading),
        `CALENDAR_NOTICE.${which} sends the coach to a place this screen does not call itself. The `
        + `notice reads “${notice}” and the screen he arrives at is headed “${heading}”. He follows `
        + 'a working link to a page that is not what he was told to look for, which is the same '
        + 'dead end as a missing screen except that everything looks fine.',
      );
    }
  });

  it('and the DIRECTION is right: the notice says to paste the id INTO this place', () => {
    const heading = textOf(paintSetup(), 'screen-setup');
    assert.ok(
      CALENDAR_NOTICE.main.includes(`paste its id into ${heading}`),
      'the notice no longer tells him to paste the calendar id into this place, so a sentence and a '
      + 'screen that still name each other have stopped agreeing about what he does when he arrives',
    );
  });

  it('and the matcher can genuinely fail, which is what stops the two above being free', () => {
    const heading = textOf(paintSetup(), 'screen-setup');
    assert.equal(
      namesThePlace('...then paste its id into Somewhere Else.', heading),
      false,
      'a planted notice naming a different place still agrees with the heading, so the checks above '
      + 'are reading something other than the notice',
    );
    assert.equal(
      namesThePlace(CALENDAR_NOTICE.main, 'Somewhere Else'),
      false,
      'the matcher reports a place the notice never names',
    );
  });

  it('and the heading is `setup.ts`\'s own constant rather than a second spelling of it', () => {
    assert.equal(textOf(paintSetup(), 'screen-setup'), SETUP_LABEL);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The way in
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the way in from Admin', () => {
  it('is the claim Admin already makes about itself in the navigation surface', () => {
    assert.ok(
      (ADMIN.help ?? '').includes('Setting up your Google account'),
      'the Admin destination no longer promises that setting up the Google account happens here, so '
      + 'the card below is answering a promise nothing makes',
    );
  });

  it('is a labelled link on the Admin screen that points at the Setup address', () => {
    const ways = anchors(paintAdmin()).filter((link) => link.href === `/${SETUP_PATH}`);

    assert.equal(
      ways.length,
      1,
      'Admin carries a number of links to Setup other than exactly one. None is the promise in the '
      + 'Admin tooltip going unanswered; two is a second way in that can be reworded apart from the '
      + 'first, which is how a destination sentence gets DUPLICATED to satisfy a scan.',
    );
    assert.ok(ways[0].label.length > 0, 'the way in to Setup has no words on it');
    assert.equal(ways[0].label, describeSetupAdminEntry().linkLabel);
  });

  it('is PERMANENT — the card is drawn from a function taking no condition at all', () => {
    // A link drawn only when the setup is unfinished is one a coach changing his calendar a year
    // later cannot find. `describeSetupAdminEntry` takes no arguments, so there is nothing it could
    // be conditional on; this asserts that shape rather than trusting the current markup.
    assert.equal(describeSetupAdminEntry.length, 0);
    assert.ok(paintAdmin().includes('id="admin-setup"'));
  });

  it('carries no count and no chip, because a tick is not something this screen may count', () => {
    const painted = paintAdmin();
    const card = painted.slice(painted.indexOf('id="admin-setup"'), painted.indexOf('id="admin-decisions"'));
    assert.ok(card.length > 0, 'the Setup card is no longer above the decisions card');
    assert.ok(
      !card.includes('class="chip'),
      'the Setup card on Admin carries a chip. Every figure available to it is derived from HIS '
      + 'ticks, and a figure drawn from ticks turns a claim into a proof one surface earlier.',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Every link is a destination claim
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('every link the Setup screen paints', () => {
  const painted = paintSetup();
  const outward = anchors(painted).filter((link) => link.href.startsWith('http'));

  it('is present for every step `setup.ts` declares, with the title as the link text', () => {
    for (const step of ALL_SETUP_STEPS) {
      const found = outward.filter((link) => link.href === step.href);
      assert.equal(found.length, 1, `the step "${step.id}" is not on screen as exactly one link`);
      assert.ok(
        found[0].label.startsWith(step.title),
        `the link for "${step.id}" reads “${found[0].label}” rather than the step's own title`,
      );
    }
  });

  it('is absolute and https — never a relative target and never plain http', () => {
    assert.ok(outward.length >= ALL_SETUP_STEPS.length, 'no outward links were found at all');
    for (const link of outward) {
      assert.ok(link.href.startsWith('https://'), `${link.href} is not https`);
      assert.doesNotThrow(() => new URL(link.href), `${link.href} is not an absolute address`);
    }
  });

  it('opens in a new tab, and cannot navigate the tab the application is running in', () => {
    for (const link of outward) {
      assert.ok(link.tag.includes('target="_blank"'), `${link.href} does not open in a new tab`);
      assert.ok(
        link.tag.includes('noopener'),
        `${link.href} opens a new tab WITHOUT noopener, so the page it opens can reach back through `
        + 'window.opener and navigate the only tab an installed application has',
      );
    }
  });

  it('carries the external mark, so a link that leaves the application says so', () => {
    for (const link of outward) {
      const at = painted.indexOf(`href="${link.href}"`);
      const anchor = painted.slice(at, painted.indexOf('</a>', at));
      assert.ok(
        anchor.includes('Opens in a new tab'),
        `${link.href} carries no external-link mark, so on a phone a new tab arrives unannounced`,
      );
    }
  });

  it('and the one link that does NOT behave like the others is warned about AT the link', () => {
    const calendar = CALENDAR_STEPS[0];
    const at = painted.indexOf(`href="${calendar.href}"`);
    assert.notEqual(at, -1, 'the calendar link is not on screen');

    // The warning must be in the same list item, and that item must not be inside a fold. Signed
    // out, that link lands on a page ABOUT Google Calendar — a warning read after he has followed
    // it is a warning that cost him the trip.
    const item = painted.slice(at, painted.indexOf('</li>', at));
    assert.ok(
      item.includes(CALENDAR_SIGN_IN_FIRST),
      'the measured sign-in-first warning is not beside the calendar link',
    );
    assert.ok(
      !painted.slice(0, at).includes('<details'),
      'the calendar link now sits inside a disclosure, so the warning about it is folded away',
    );
  });

  it('and no console step was quietly given the calendar step\'s warning as well', () => {
    // The DUPLICATION control. Repeating a warning into neighbouring strings is the cheap way to
    // satisfy a scan that only asks whether the words are present somewhere.
    assert.equal(
      painted.split(CALENDAR_SIGN_IN_FIRST).length - 1,
      1,
      'the sign-in-first warning appears more than once. It is true of exactly one link, and a '
      + 'warning attached to links it is not true of is one he learns to ignore on the one it is.',
    );
    for (const step of CLIENT_ID_STEPS) {
      const at = painted.indexOf(`href="${step.href}"`);
      const item = painted.slice(at, painted.indexOf('</li>', at));
      assert.ok(!item.includes(CALENDAR_SIGN_IN_FIRST), `${step.id} carries a warning about another link`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A tick is a claim, never a proof
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the ticks', () => {
  const painted = paintSetup();

  it('say on screen that they are his own note rather than the app confirming anything', () => {
    assert.ok(painted.includes(SURFACE.TICKS_ARE_YOURS));
    assert.ok(
      !painted.slice(0, painted.indexOf(SURFACE.TICKS_ARE_YOURS)).includes('<details'),
      'the sentence that stops the ticks reading as a confirmation is inside a fold',
    );
  });

  it('never render as a confirmation, a count, or a completion', () => {
    for (const claim of ['setup complete', 'setup is complete', 'all done', 'you are connected', 'fully set up']) {
      assert.ok(
        !painted.toLowerCase().includes(claim),
        `the Setup screen says “${claim}”. Ticking records that HE SAYS he did a step; the `
        + 'application cannot see what he did inside Google, so nothing drawn from ticks may read '
        + 'as confirmation.',
      );
    }
    assert.ok(
      !painted.includes('class="count"') || painted.indexOf('class="count"') > painted.indexOf('setup-traps'),
      'a counted summary appears above the troubleshooting fold, where the only thing to count '
      + 'would be his ticks',
    );
  });

  it('are announced as what pressing them will DO, and differently in each state', () => {
    const step = ALL_SETUP_STEPS[0];
    assert.notEqual(tickName(step, false), tickName(step, true));
    assert.ok(tickName(step, false).includes(step.title));
    assert.ok(painted.includes(`aria-label="${tickName(step, false)}"`.replace(/"/g, '&quot;'))
      || painted.includes(tickName(step, false).replace(/“|”/g, (m) => (m === '“' ? '“' : '”'))),
      'the first tick is not announced with the words that say what pressing it will do');
  });

  it('are not a label wrapping the link, which would mark a step done by following it', () => {
    const at = painted.indexOf(`href="${ALL_SETUP_STEPS[0].href}"`);
    const before = painted.slice(0, at);
    const label = before.lastIndexOf('<label');
    const closed = before.lastIndexOf('</label>');
    assert.ok(
      label === -1 || closed > label,
      'the step link sits inside a label, so pressing the link also toggles the tick and following '
      + 'a step silently marks it done',
    );
  });
});

describe('a tick survives a reload, and is reachable by the erase', () => {
  it('is remembered and read back', () => {
    const storage = fakeStorage();
    assert.equal(rememberTicks(storage, new Set(['project', 'consent'])), true);
    assert.deepEqual([...tickedSteps(storage)].sort(), ['consent', 'project']);
  });

  it('drops a name no step answers to rather than writing it back for ever', () => {
    const storage = fakeStorage();
    rememberTicks(storage, new Set(['project', 'a-step-that-was-never-built']));
    assert.deepEqual([...tickedSteps(storage)], ['project']);
    assert.ok(!(storage.held.get(SETUP_PROGRESS_KEY) ?? '').includes('never-built'));
  });

  it('FORGETS the name entirely when the last tick comes off', () => {
    const storage = fakeStorage();
    rememberTicks(storage, new Set(['project']));
    assert.ok(storage.held.has(SETUP_PROGRESS_KEY));
    rememberTicks(storage, new Set<string>());
    assert.equal(
      storage.held.has(SETUP_PROGRESS_KEY),
      false,
      'an emptied setting left behind as a blank value is still a trace saying somebody started '
      + 'setting this app up on this machine',
    );
  });

  it('answers FALSE rather than throwing when the browser refuses, and reads back as nothing', () => {
    const refusing = fakeStorage(true);
    assert.equal(rememberTicks(refusing, new Set(['project'])), false);
    assert.deepEqual([...tickedSteps(refusing)], []);
    assert.deepEqual([...tickedSteps(null)], []);
  });

  it('is in the erase sweep — asserted against the list', () => {
    assert.ok(
      (SMALL_FACT_KEYS as readonly string[]).includes(SETUP_PROGRESS_KEY),
      'ticks left behind after an erase are a trace of a session that was meant to leave nothing',
    );
  });

  it('and PROVEN BY CONSEQUENCE: the real erase actually removes it', () => {
    // Reading a key off a list proves the list. This runs the erase's own small-fact sweep over a
    // storage that really holds a tick, and looks afterwards.
    const storage = fakeStorage();
    rememberTicks(storage, new Set(['project', 'drive-api']));
    storage.setItem('fit.something-nobody-sweeps', 'still here');
    assert.ok(storage.held.has(SETUP_PROGRESS_KEY), 'the tick was never written, so the sweep below proves nothing');

    browserErasure(globalThis, storage).clearSmallFacts();

    assert.equal(storage.held.has(SETUP_PROGRESS_KEY), false, 'the erase left his ticks on the device');
    assert.equal(
      storage.held.get('fit.something-nobody-sweeps'),
      'still here',
      'the sweep removed everything, so it would have "passed" whatever list it was given',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The two boxes
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the two boxes', () => {
  it('are bound to `google-settings.ts`\'s own keys, and this screen spells neither', async () => {
    assert.deepEqual(
      SETUP_SECTIONS.map((section) => section.field.key),
      [GOOGLE_CLIENT_ID_KEY, COACHING_CALENDAR_KEY],
    );

    for (const file of ['SetupScreen.tsx', 'setup-surface.ts']) {
      const source = await readFile(path.join(here, file), 'utf8');
      assert.ok(source.length > 500, `${file} was not read, so the check below would pass for free`);
      for (const spelled of ['\'fit.google-client-id\'', '\'fit.google-coaching-calendar\'']) {
        assert.ok(
          !source.includes(spelled),
          `${file} spells ${spelled} itself. A key spelled twice is a key that can drift, and the `
          + 'failure is silent: he enters a client id the application cannot see and nothing errors.',
        );
      }
    }
  });

  it('read and write through the field rather than through anything of their own', () => {
    const storage = fakeStorage();
    const [clientId, calendar] = SETUP_SECTIONS;

    assert.equal(clientId.field.read(storage), null);
    assert.equal(clientId.field.save(storage, '000000000000-abc.apps.googleusercontent.com'), true);
    assert.equal(storage.held.get(GOOGLE_CLIENT_ID_KEY), '000000000000-abc.apps.googleusercontent.com');
    assert.equal(calendar.field.read(storage), null, 'saving the client id also wrote the calendar');

    // Clearing the box is how he takes a setting back — `writeSetting`'s own behaviour, relied on.
    assert.equal(clientId.field.save(storage, '   '), true);
    assert.equal(storage.held.has(GOOGLE_CLIENT_ID_KEY), false);
  });

  it('report a browser refusal as a state, and the screen has words for it', () => {
    assert.equal(SETUP_SECTIONS[0].field.save(fakeStorage(true), 'anything'), false);
    assert.ok(SURFACE.NOT_SAVED_HERE.length > 0);
    assert.notEqual(SURFACE.NOT_SAVED_HERE, SURFACE.SAVED_HERE);
    assert.notEqual(SURFACE.CLEARED_HERE, SURFACE.SAVED_HERE);
  });

  /**
   * WHAT A REFUSAL ACTUALLY LEAVES BEHIND, WHICH IS NOT NOTHING — and the sentence has to agree.
   *
   * This is asserted as the BEHAVIOUR first and the wording second, deliberately. The old sentence
   * said a refusal made the app "behave as though the box were empty", which is only true when
   * nothing was ever saved. A device that kept a value last week and refuses writes today — a phone
   * out of storage, a browser locked down since — still READS the old value and still connects with
   * it, so the sentence would have sent him looking for a setting that was not missing. Holding the
   * behaviour is what stops that returning: the wording is downstream of it, and a later author who
   * changes the words meets the fact rather than a string somebody protected.
   */
  it('leave whatever was already saved standing, so a refusal is not an erasure', () => {
    const held = new Map<string, string>();
    let refusing = false;
    const storage: SmallFactStorage = {
      getItem: (key) => held.get(key) ?? null,
      setItem: (key, value) => {
        if (refusing) throw new Error('this browser refuses to keep settings');
        held.set(key, value);
      },
      removeItem: (key) => {
        if (refusing) throw new Error('this browser refuses to keep settings');
        held.delete(key);
      },
    };

    const [clientId] = SETUP_SECTIONS;
    const first = '000000000000-first.apps.googleusercontent.com';
    assert.equal(clientId.field.save(storage, first), true, 'the working device would not save');

    // The device stops keeping settings. He pastes a correction; it is refused.
    refusing = true;
    assert.equal(
      clientId.field.save(storage, '999999999999-second.apps.googleusercontent.com'), false,
      'the refusing device reported the write as accepted',
    );

    assert.equal(
      clientId.field.read(storage), first,
      'a refused save changed what the application reads. It must change NOTHING — this is the fact '
      + 'the refusal sentence has to be true against, and if it ever stops holding, the sentence is '
      + 'the thing to re-decide rather than this assertion.',
    );
    assert.equal(
      standingFor(storage, clientId.field).state, 'never-used',
      'the statement stopped describing the value that is actually saved after a refused write',
    );
  });

  /**
   * The sentence, held to the meaning that behaviour just established rather than to its own words.
   *
   * The claim it may not make is that the setting is now EMPTY or that nothing is saved, because a
   * refusal guarantees neither. The matcher is proven to discriminate on the sentence this replaced,
   * so this cannot pass by looking at nothing — which is exactly how the first version of it passed.
   */
  it('do not tell him a refused save left the app with nothing, which it does not', () => {
    const claimsEmptiness = (sentence: string): boolean => {
      const said = sentence.toLowerCase();
      return said.includes('as though the box were empty')
        || said.includes('as if the box were empty')
        || said.includes('the app will have nothing')
        || said.includes('nothing is saved');
    };

    assert.equal(
      claimsEmptiness('so the app will behave as though the box were empty.'), true,
      'the matcher cannot see the exact sentence this rule was written against, so the assertion '
      + 'below is reading something other than the claim it names',
    );
    assert.equal(
      claimsEmptiness(SURFACE.NOT_SAVED_HERE), false,
      `the refusal sentence claims the setting is now empty, and a refusal guarantees no such thing: `
      + `“${SURFACE.NOT_SAVED_HERE}”`,
    );
    assert.equal(
      claimsEmptiness(SURFACE.TICKS_NOT_REMEMBERED), false,
      `the tick refusal claims the ticks are gone, and a refusal leaves the remembered set standing: `
      + `“${SURFACE.TICKS_NOT_REMEMBERED}”`,
    );
  });

  it('run the shape check at the point of entry, and it never refuses', () => {
    const [clientId] = SETUP_SECTIONS;
    assert.equal(clientId.field.check('GOCSPX-not-a-client-id').verdict, 'looks-wrong');
    assert.equal(clientId.field.check('000000000000-abc.apps.googleusercontent.com').verdict, 'looks-right');
    // A wrong-looking value still saves. The refusal that does not happen is the point.
    assert.equal(clientId.field.save(fakeStorage(), 'GOCSPX-not-a-client-id'), true);
  });

  it('are on screen with their own labels and placeholders', () => {
    const painted = paintSetup();
    for (const section of SETUP_SECTIONS) {
      assert.ok(painted.includes(section.field.label), `${section.id} has no label on screen`);
      assert.ok(painted.includes(section.field.placeholder.replace(/&/g, '&amp;')), `${section.id} has no placeholder`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The origin
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the authorised JavaScript origin', () => {
  const withLocation = (location: unknown) => ({ location } as unknown as typeof globalThis);

  it('is scheme and host, and never carries the path the site is served under', () => {
    const found = runningOrigin(withLocation({
      protocol: 'https:', host: 'visak13.github.io', pathname: '/Fit/', href: 'https://visak13.github.io/Fit/#/setup',
    }));
    assert.equal(found, 'https://visak13.github.io');
    assert.ok(!(found ?? '').includes('/Fit'), 'the origin carries the path, which Google rejects');
    assert.ok(!(found ?? '').endsWith('/'), 'the origin ends with a slash, which Google rejects');
  });

  it('carries the port, because an origin without it is a different origin', () => {
    assert.equal(
      runningOrigin(withLocation({ protocol: 'http:', host: 'localhost:5173' })),
      'http://localhost:5173',
    );
  });

  it('is NULL outside a browser rather than a guess, and this module still imports', () => {
    assert.equal(runningOrigin(withLocation(undefined)), null);
    assert.equal(runningOrigin({} as typeof globalThis), null);
  });

  it('is NULL for the values that would otherwise become a plausible wrong answer', () => {
    // The opaque-origin case: `location.origin` is the STRING "null" there, which reads as a real
    // value and is the one he would paste into Google.
    assert.equal(runningOrigin(withLocation({ protocol: 'https:', host: '' })), null);
    assert.equal(runningOrigin(withLocation({ protocol: '', host: 'visak13.github.io' })), null);
    assert.equal(runningOrigin(withLocation({ protocol: 5, host: 7 })), null);
  });

  it('and the screen says so rather than drawing an empty box, when nothing answered', () => {
    // A static render runs no effects, so this IS the no-origin-yet state.
    assert.ok(paintSetup().includes(SURFACE.ORIGIN_NOT_KNOWN));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The words this screen decides for itself
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * EVERY SENTENCE THIS MODULE WOULD PUT IN FRONT OF A READER, from its OWN NAMESPACE.
 *
 * Walked recursively rather than listed. A hand-written list is weakest at exactly the moment it
 * matters — when a later author adds a sentence — and this build has already measured that: a1's
 * first break probe planted a claim in a new exported constant and every sweep stayed green.
 */
function everySentence(): readonly string[] {
  const found: string[] = [];
  const seen = new Set<unknown>();

  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      if (value.length > 0) found.push(value);
      return;
    }
    if (value === null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const held of Object.values(value as Record<string, unknown>)) walk(held);
  };

  walk({ ...SURFACE } as Record<string, unknown>);

  // The sentences that are RETURNED rather than exported, driven through every branch.
  walk(describeSetupAdminEntry());
  for (const step of ALL_SETUP_STEPS) {
    walk(tickName(step, false));
    walk(tickName(step, true));
  }
  return found;
}

/**
 * The directions in one sentence. Named once because TWO sweeps use it, and they must agree.
 *
 * ORDER IS OWNED BY THE SCREEN, so a sentence that names a place on it — a direction, a position —
 * rots the first time the screen is reordered, silently, with nothing to go red.
 */
const DIRECTIONS = Object.freeze([
  'further down', 'further up', 'lower down', 'below', 'above', 'at the bottom', 'at the top',
  'scroll down', 'first card', 'last card', 'the card underneath',
]);

function directionsIn(text: string): readonly string[] {
  const lowered = text.toLowerCase();
  return DIRECTIONS.filter((direction) => lowered.includes(direction));
}

describe('the sentences this screen decides for itself', () => {
  const sentences = everySentence();

  it('is a corpus that really contains them, so every absence below is not free', () => {
    assert.ok(sentences.length > 20, `the sweep found only ${String(sentences.length)} strings`);
    assert.ok(sentences.includes(SURFACE.TICKS_ARE_YOURS), 'the corpus is not reading this module');
    assert.ok(
      sentences.some((sentence) => sentence.includes('Take the tick off')),
      'the corpus misses the sentences that are returned rather than exported, which is the half a '
      + 'hand-written list always misses',
    );
  });

  it('makes no claim of compliance, certification, end-to-end encryption, or that data is safe', () => {
    // Not the tree-wide gate repeated: that one reads SOURCE, and the sentences swept here are
    // composed at RUN TIME out of this module's whole namespace, which no source scan can reach.
    //
    // forbidden-claim: fixture — a local sweep has to write the words down to look for them. The
    // gate in src/proof/forbidden-claims.test.ts reads this marker and stops reporting the list
    // below as a claim being made; its reach is eight lines, covering the list and nothing after.
    const forbidden = [
      'hipaa', 'soc 2', 'compliant', 'compliance', 'certified', 'certification', 'end-to-end',
      'end to end', 'secure', 'perfectly safe', 'your data is safe', 'bank-level', 'military-grade',
      'guaranteed', 'encrypted and safe',
    ];
    for (const sentence of sentences) {
      const lowered = sentence.toLowerCase();
      for (const claim of forbidden) {
        assert.ok(
          !lowered.includes(claim),
          `this screen's own words say “${claim}”. The security wording has ONE owner, in `
          + `setup-honesty.ts, and it is rendered rather than re-worded. Offending sentence: ${sentence}`,
        );
      }
    }
  });

  it('names no direction on a screen it does not control the order of', () => {
    for (const sentence of sentences) {
      assert.deepEqual(
        directionsIn(sentence),
        [],
        `a direction in: ${sentence}. Ordering belongs to the screen, and a direction rots silently `
        + 'the first time the screen is reordered — nothing goes red and he looks in the wrong place.',
      );
    }

    // The matcher is proven to match, so a clean sweep is not a dead one.
    assert.deepEqual(directionsIn('The address is in the card below this one.'), ['below']);
  });

  it('carries no emoji', () => {
    for (const sentence of sentences) {
      for (const character of sentence) {
        const point = character.codePointAt(0) ?? 0;
        assert.ok(
          point < 0x2190 || (point >= 0x2c00 && point < 0x1f000),
          `an emoji or symbol renders differently per operating system and cannot be recoloured by `
          + `a token, and one is in: ${sentence}`,
        );
      }
    }
    // Proven to discriminate, in the same run.
    assert.equal([...'a rocket \u{1F680}'].some((c) => (c.codePointAt(0) ?? 0) >= 0x1f000), true);
  });

  it('makes no claim about a platform this build has never tested', () => {
    for (const sentence of sentences) {
      assert.ok(!sentence.toLowerCase().includes('android'), `an untested platform is named in: ${sentence}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The same rule, over every sentence the screen PAINTS rather than every sentence it owns
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * THE WORDS AS THEY REACH HIM: the painted markup with its marks and its tags taken off.
 *
 * A namespace sweep can only see the module it walks, and this screen draws THREE modules. That gap
 * is not hypothetical — it was measured in s10/a4 by LOOKING at the running application: `setup.ts`
 * shipped "Copy it from the box below rather than typing it", a direction on a card this screen
 * orders, and every namespace sweep here was green because the sentence belongs to another module.
 * Worse, the sweep's own proof-of-life had adopted that real shipped sentence as its planted
 * example, so the one place it appeared was the place that declared it a fault and moved on.
 */
function paintedWords(html: string): string {
  return html
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, '\'')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('every sentence the screen paints, whichever module wrote it', () => {
  const words = paintedWords(paintSetup());

  it('is really being read, so the absence below is not free', () => {
    assert.ok(words.length > 3000, `the painted words came to only ${String(words.length)} characters`);
    assert.ok(words.includes(SURFACE.TICKS_ARE_YOURS), 'the extractor is not reading the screen');
    assert.deepEqual(directionsIn(paintedWords('<p>the card <em>below</em> this one</p>')), ['below']);
  });

  it('names no direction, wherever the sentence came from', () => {
    assert.deepEqual(
      directionsIn(words),
      [],
      'a direction is painted on this screen. The screen owns the order of its cards; the module '
      + 'that wrote the sentence does not, and cannot be told when the order changes.',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// What the screen draws, and what it deliberately does not
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('what the screen draws', () => {
  const painted = paintSetup();

  it('renders `setup-honesty.ts`\'s security sentences unchanged and unfolded', async () => {
    const { NOT_AUDITED, SECURITY_SENTENCES, WHO_CAN_READ_THE_NOTES } = await import('./setup-honesty.ts');
    for (const sentence of SECURITY_SENTENCES) {
      const escaped = sentence.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      assert.ok(painted.includes(escaped), `a security sentence is not on the screen: ${sentence}`);
    }
    // The two that must never be softened, and never folded away from a reader looking for comfort.
    for (const sentence of [NOT_AUDITED, WHO_CAN_READ_THE_NOTES]) {
      const at = painted.indexOf(sentence);
      const opens = painted.slice(0, at).split('<details').length - 1;
      const closes = painted.slice(0, at).split('</details>').length - 1;
      assert.equal(opens, closes, `“${sentence.slice(0, 40)}…” is inside a fold`);
    }
  });

  it('renders every expectation WITH its consequence, which is the half that does the work', async () => {
    const { EXPECTATIONS } = await import('./setup-honesty.ts');
    for (const expectation of EXPECTATIONS) {
      const escaped = (text: string) => text.replace(/&/g, '&amp;').replace(/'/g, '&#x27;');
      assert.ok(painted.includes(escaped(expectation.says)), `${expectation.id} says nothing`);
      assert.ok(painted.includes(escaped(expectation.consequence)), `${expectation.id} has no consequence on screen`);
    }
  });

  it('renders every handover step WITH its reason', async () => {
    const { HANDOVER_CHECKLIST } = await import('./setup-honesty.ts');
    for (const step of HANDOVER_CHECKLIST) {
      const escaped = (text: string) => text.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;');
      assert.ok(painted.includes(escaped(step.does)), `${step.id} is not on screen`);
      assert.ok(painted.includes(escaped(step.why)), `${step.id} is on screen with no reason given`);
    }
  });

  it('renders both console traps with the date each was measured', async () => {
    const { CONSOLE_ADVICE_DATE, CONSOLE_TRAPS } = await import('./setup.ts');
    for (const trap of CONSOLE_TRAPS) {
      assert.ok(painted.includes(trap.cause), `${trap.id} has no cause on screen`);
      assert.ok(painted.includes(trap.whatYouShouldSee), `${trap.id} does not say what he should see`);
    }
    assert.ok(painted.includes(CONSOLE_ADVICE_DATE), 'the console advice is on screen with no date on it');
  });

  /*
   * THE SCREEN TAKES NO SYNCHRONISATION READING, and that property is NOT asserted here.
   *
   * `shell/frame-structure.test.ts` already holds EVERY file in this directory to it, which is
   * strictly stronger than a check aimed at one screen, and it does so by reading each file for
   * the two names. A second copy here would have to spell those names to look for them — and a
   * file in this directory spelling them is precisely what that guard refuses, so the duplicate
   * broke the rule it was restating. One property, one owner, and the owner is the frame's.
   */

  /**
   * a4 ASSERTED HERE THAT THIS SCREEN MADE NO CLAIM ABOUT WHETHER EITHER ID HAD EVER WORKED, and it
   * was right to: the evidence had no source on the tree, so any statement would have been made on
   * the strength of never having asked. a5 SUPPLIED THE EVIDENCE and lifted it.
   *
   * WHAT HOLDS THE PROPERTY NOW is stronger than an absence, and it is `setup-confirmation.test.ts`:
   * the statement is DERIVED from what is saved and which VALUE was proven, driven through a real
   * sign-in and a real mint, and asserted to MOVE between all three states rather than merely to
   * render. The cases that matter most are the ones an absence could never have expressed — a
   * perfectly shaped id from the wrong project staying at never-used, and a proof refusing to follow
   * an id that changed underneath it.
   *
   * What is still asserted HERE is the half that belongs to a static render: on a screen that has
   * read no storage, no claim about proof is painted at all. That is not the old assertion narrowed;
   * it is the transient a4's header names, held to being honest.
   */
  it('makes no claim about either id having worked before the browser has answered', () => {
    for (const claim of ['never been used', 'has worked with this client id', 'proves it is the right one']) {
      assert.ok(
        !painted.includes(claim),
        `this screen states “${claim}” on a render that has read no storage, so the statement is `
        + 'made about a setting nothing has looked at yet.',
      );
    }
    // And the statement really is a thing this screen can draw, so the absence above is a statement
    // about the no-storage state rather than about a feature that was never built.
    assert.ok(
      SETUP_SECTIONS.every((section) => typeof standingFor(null, section.field).sentence === 'string'),
      'no section can state where its setting stands, so the absence above is free',
    );
  });
});
