/**
 * THE LOOP BETWEEN A CLIENT AND A SESSION, HELD IN BOTH DIRECTIONS AT ONCE.
 *
 * A loop whose two halves are checked separately is a loop that breaks in one direction and passes.
 * So both ends are asserted here, in one file, against the addresses the two screens actually build
 * and against the route table the application actually runs on.
 *
 * WHAT IS PROVEN:
 *
 *  1. Both addresses RESOLVE, using react-router's own matcher over the shipped `ROUTE_TABLE` — the
 *     same matcher the hash router uses underneath. A link that does not resolve is a dead end
 *     wearing a label, and that shape has shipped in this application once already.
 *  2. Neither address is a NEW route. They are the two destinations with one answer filled in, so
 *     the route table is unchanged and `no-dead-ends.test.ts` has nothing new to cover.
 *  3. An address carries an IDENTITY and never a name.
 *  4. Arriving somewhere with a choice already made SAYS SO, in both directions, including the case
 *     the comfortable version skips: the person he came back about is not on the page shown.
 *  5. NEITHER SCREEN DECLARES A CONTEXTUAL TRAIL. That is the assertion that keeps a known trap
 *     shut — see the header of `circular-navigation.ts`.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { matchRoutes } from 'react-router';

import { DESTINATIONS } from '../shell/navigation.ts';
import { ROUTE_TABLE } from '../shell/routes.tsx';
import {
  ABOUT_CLIENT_KEY, CAME_ABOUT_MARK, WITH_CLIENT_KEY, aboutClientDescription, calendarWithClient,
  describeArrivedAbout, describeArrivedWith, registerAboutClient, selectionArrivingWith,
  startSessionLabel,
} from './circular-navigation.ts';
import { NOTHING_CHOSEN } from './launcher.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const applicationRoot = path.join(here, '..', '..');
const source = (relative: string) => readFile(path.join(applicationRoot, relative), 'utf8');

const ROUTES = [...ROUTE_TABLE];

/** A record identity of the shape the store actually mints, rather than a tidy word. */
const A_CLIENT = 'client-01H9ZQ4M2N7X';

/** Which route an address lands on, or null. react-router's own matcher, over the shipped table. */
function landsOn(address: string): string | null {
  const matched = matchRoutes(ROUTES, address);
  return matched === null ? null : matched.at(-1)?.route.path ?? null;
}

describe('a client leads to starting a session with them', () => {
  it('goes to the calendar, and the address resolves rather than falling through to not-found', () => {
    const address = calendarWithClient(A_CLIENT);

    assert.equal(
      landsOn(address),
      'calendar',
      `${address} does not land on the calendar. A control on every row of the register that goes `
        + 'nowhere is the dead-end-wearing-a-button shape this application has shipped once.',
    );
  });

  it('names the person in the control, so forty rows do not offer forty identical sentences', () => {
    assert.equal(startSessionLabel('Test Person One'), 'Start a session with Test Person One');
    assert.notEqual(
      startSessionLabel('Test Person One'),
      startSessionLabel('Test Person Two'),
      'two people on the register share one accessible name, so a screen reader announces the same '
        + 'control twice with nothing to tell them apart',
    );
  });

  it('chooses that person and NOTHING else, because the rest is his to answer', () => {
    const chosen = selectionArrivingWith(A_CLIENT);

    assert.deepEqual(chosen.clientIds, [A_CLIENT]);
    assert.equal(chosen.routineId, null, 'a routine was chosen for him');
    assert.equal(
      chosen.mode,
      null,
      'where he is was answered on his behalf. A session held in a room would then go on record as '
        + 'a call, which is the exact ambiguity that field exists to end.',
    );
  });

  it('chooses nobody when he arrived at the calendar plainly', () => {
    assert.deepEqual(selectionArrivingWith(null), NOTHING_CHOSEN);
    assert.deepEqual(selectionArrivingWith(''), NOTHING_CHOSEN);
    assert.deepEqual(selectionArrivingWith('   '), NOTHING_CHOSEN);
  });

  it('SAYS that it chose somebody, and says how to change it', () => {
    const said = describeArrivedWith(A_CLIENT, 'Test Person One');

    assert.equal(said.present, true);
    assert.ok(said.words !== null && said.words.includes('Test Person One'));
    assert.ok(
      said.howToChange.length > 0,
      'the calendar chose somebody for him and did not say how to undo it. He may have tapped the '
        + 'row below the one he wanted, and the version of that which costs him something is the '
        + 'one he does not notice until the session is running under the wrong name.',
    );
  });

  it('still says something before the register has been read back, rather than waiting silently', () => {
    const said = describeArrivedWith(A_CLIENT, null);

    assert.equal(said.present, true);
    assert.ok(said.words !== null && said.words.length > 0);
    assert.ok(!said.words.includes('null'), 'a missing name reached the screen as the word "null"');
  });

  it('says nothing at all when nobody was chosen for him', () => {
    assert.equal(describeArrivedWith(null, null).present, false);
    assert.equal(describeArrivedWith('', 'Test Person One').present, false);
  });
});

describe('a session leads back to the people in it', () => {
  it('goes to the register, and the address resolves', () => {
    const address = registerAboutClient(A_CLIENT);

    assert.equal(landsOn(address), 'clients', `${address} does not land on the register`);
  });

  it('says where a name goes, so a roster of links is not four links called nothing but names', () => {
    assert.equal(aboutClientDescription('Test Person One'), 'Test Person One on your register');
  });

  it('MARKS the person when they are on the page, and names them', () => {
    const said = describeArrivedAbout(A_CLIENT, 'Test Person One');

    assert.equal(said.present, true);
    assert.equal(said.markWords, CAME_ABOUT_MARK);
    assert.ok(said.words.includes('Test Person One'));
  });

  it('says they are further down when the page shown does not hold them, rather than nothing', () => {
    const said = describeArrivedAbout(A_CLIENT, null);

    assert.equal(said.present, true, 'the register went quiet, so the link he pressed did nothing visible');
    assert.equal(said.markWords, null, 'a row was marked for somebody who is not on screen');
    assert.match(
      said.words,
      /show more|page at a time/i,
      'the register does not say how to reach them. It is paged twenty-five at a time in name '
        + 'order, so a coach with two hundred clients meets this case often, and silence here is '
        + 'indistinguishable from a broken link.',
    );
  });

  it('says nothing at all when he arrived at the register plainly', () => {
    assert.equal(describeArrivedAbout(null, null).present, false);
    assert.equal(describeArrivedAbout('  ', 'Test Person One').present, false);
  });
});

describe('what the loop deliberately does NOT do', () => {
  it('adds no route: both ends are the destinations the application already had', () => {
    const offered = DESTINATIONS.map((destination) => destination.path);

    assert.ok(offered.includes('calendar') && offered.includes('clients'));
    assert.equal(WITH_CLIENT_KEY, 'with');
    assert.equal(ABOUT_CLIENT_KEY, 'person');

    // The bare destinations still answer, so an address without the query is not a second shape.
    assert.equal(landsOn('/calendar'), 'calendar');
    assert.equal(landsOn('/clients'), 'clients');
  });

  it('carries an IDENTITY and never a name', () => {
    for (const address of [calendarWithClient(A_CLIENT), registerAboutClient(A_CLIENT)]) {
      assert.ok(address.includes(A_CLIENT));
      for (const name of ['Test', 'Person', 'name=']) {
        assert.ok(
          !address.includes(name),
          `${address} carries "${name}". An address is bookmarked, restored from a home screen and `
            + 'read over a shoulder, and a client\'s name in one is the single piece of their data '
            + 'this application would be putting somewhere it did not have to.',
        );
      }
    }
  });

  it('escapes the identity, so a record identity can never break its own address', () => {
    assert.equal(calendarWithClient('a b&c=d'), '/calendar?with=a%20b%26c%3Dd');
  });

  /**
   * THE ASSERTION THAT KEEPS A KNOWN TRAP SHUT.
   *
   * `shell/trail.ts` refuses a crumb or a way back that names a destination, and both ends of this
   * loop ARE destinations — so the contextual layer is not the mechanism here, and neither screen
   * declares one. That is deliberate rather than an omission, and it is asserted because the
   * alternative would pass by ACCIDENT: `routeSegments` splits on a slash, so `calendar?with=x` is
   * one segment that is not equal to `calendar` and slips past `namesADestination` unrecognised.
   * A trail declared on a parameterised destination would pass a rule it is not honouring, and the
   * guard would go on looking like it holds. Whoever changes that rule should be changing it with
   * the question actually decided, not as a side effect of needing a link to work.
   */
  it('declares NO contextual trail on either end, so the destination rule is not passed by accident', async () => {
    for (const file of ['src/screens/ClientsScreen.tsx', 'src/screens/CalendarScreen.tsx']) {
      // eslint-disable-next-line no-await-in-loop
      const text = await source(file);
      assert.ok(
        !text.includes('useDeclareTrail'),
        `${file} declares a contextual trail. Both ends of this loop are destinations, and `
          + '`trail.ts` refuses a destination for a reason that still holds: two layers that both '
          + 'carry "Clients" disagree about where the coach is. See circular-navigation.ts.',
      );
    }
  });

  it('is built from the shared addresses rather than from strings typed into each screen', async () => {
    const register = await source('src/screens/ClientsScreen.tsx');
    const calendar = await source('src/screens/CalendarScreen.tsx');

    assert.ok(
      register.includes('calendarWithClient(') && register.includes(ABOUT_CLIENT_KEY),
      'the register hand-writes one end of the loop. A second spelling in the linking markup is how '
        + 'a link ends up pointing at an address the table does not answer to.',
    );
    assert.ok(
      calendar.includes('registerAboutClient(') && calendar.includes('WITH_CLIENT_KEY'),
      'the calendar hand-writes one end of the loop',
    );

    for (const [file, text] of [['ClientsScreen', register], ['CalendarScreen', calendar]] as const) {
      assert.ok(
        !text.includes(`?${WITH_CLIENT_KEY}=`) && !text.includes(`?${ABOUT_CLIENT_KEY}=`),
        `${file} builds a query address by hand instead of asking circular-navigation.ts for it`,
      );
    }
  });
});
