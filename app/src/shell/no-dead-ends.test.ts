/**
 * NO DEAD ENDS — PROVEN AGAINST THE ROUTER THAT SHIPS, NOT ASSERTED IN A REPORT.
 *
 * "There are no dead ends" is a standing requirement of this application, and until now every
 * builder has believed their own screen had a way out. Belief is what this file replaces.
 *
 * ## The thing being checked is a GRAPH, not a list of pages
 *
 * Four properties, and each one is a different way for a coach to get stuck:
 *
 *   1. Every destination the navigation surface offers RESOLVES to a screen that renders.
 *   2. The index address lands somewhere real rather than nowhere.
 *   3. An address the application does not have reaches the not-found screen — and THAT screen
 *      offers a labelled way back that itself resolves. A way back that lands on another unmatched
 *      address is not a way back; it is the dead end wearing a button. It had shipped exactly that
 *      way, which is why this property is written out rather than assumed.
 *   4. From every screen there is a labelled route onward or back that is NOT the browser back
 *      button. The browser back button being the only exit is the specific failure named in the
 *      requirement: on an installed application there is frequently no visible one at all.
 *
 * ## Why this exercises the REAL router and what that cost
 *
 * A check built on a list of paths typed into it passes forever while the route table drifts away
 * from the list — it is testing the copy, and the copy is the thing that cannot be wrong. So
 * nothing here is typed by hand: the addresses come from `DESTINATIONS`, the routes come from
 * `ROUTE_TABLE`, the matching is react-router's own `matchRoutes` — the same matcher the hash
 * router uses underneath — and the screens are really rendered, through react-router's static
 * handler and React's own server renderer, with the providers `main.tsx` wires in.
 *
 * The cost was two changes, both of them stated where they were made. `routes.tsx` now exports the
 * TABLE separately from the call that builds the router, because `createHashRouter` reads
 * `window.history` on the spot and would have made the table importable only by a browser. And
 * `tools/tsx-test-hook.mjs` teaches Node to load `.tsx`, since Node erases types but cannot
 * transform JSX. Neither adds a dependency and neither is a second copy of anything.
 *
 * ## What it does NOT prove, said plainly rather than left to be assumed
 *
 * This is rendered markup, not a browser: nothing here proves an element is visible, on screen, or
 * reachable by touch — `console.css` decides that, and a rendered check has never been able to see
 * it. What it proves is that the address resolves, the screen renders, and the way out is present
 * in the document with words on it.
 *
 * The contextual to-and-fro links the requirement also calls for — client to their sessions, session
 * to the client — do NOT exist yet, because the screens they would join are built in later steps.
 * That is stated here rather than papered over. `trail.ts` and its own suite hold the mechanism;
 * this file holds the routes, and it covers whatever the table carries. The last test in this file
 * is the one that keeps that honest: it fails if a route is ever added that this suite does not
 * exercise, so a destination added in step eight is covered without anybody remembering it.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createStaticHandler, createStaticRouter, matchRoutes, StaticRouterProvider } from 'react-router';
import type { RouteObject } from 'react-router';

import { LocalStoreProvider } from '../platform/LocalStore.tsx';
import { STILL_OPENING } from '../platform/local-store.ts';
import { PlatformStatusProvider } from '../platform/platform-status.tsx';
import { DivergenceProvider, NOTHING_TO_DECIDE } from './Divergences.tsx';
import { KeyMaterialProvider, NO_KEY_MATERIAL_CONDITION } from './KeyMaterial.tsx';
import {
  DEFAULT_DESTINATION_PATH, DESTINATIONS, DIVERGENCES_PATH, JOURNAL_PATH, KEY_MATERIAL_PATH,
  REMOVALS_PATH, SESSION_PATH, SETUP_PATH, STOPPED_CHANGES_PATH,
} from './navigation.ts';
import { NOTHING_AWAITING_REMOVAL, RemovalsProvider } from './Removals.tsx';
import { ROUTE_TABLE } from './routes.tsx';
import { NOTHING_STOPPED, StoppedChangesProvider } from './StoppedChanges.tsx';
import { NO_BACKUP_YET, SyncStatusProvider } from './SyncStatus.tsx';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The shipped table, in the mutable shape react-router's own functions ask for. A copy of the
 * ARRAY, never of its contents: every route object in it is the identical object the application
 * runs on, which is the whole point of importing it rather than describing it.
 */
const ROUTES = [...ROUTE_TABLE];

/** A published address, exactly as the coach's phone would restore it from a cold start. */
const PUBLISHED_ORIGIN = 'https://visak13.github.io/Fit/';

/**
 * The path a fragment address actually asks the router for.
 *
 * Routing here is by fragment, so what the router sees is everything after the `#` and nothing
 * before it — the origin and the published sub-path are never sent anywhere and never matched. This
 * is the one piece of the router's behaviour the harness reproduces rather than calls, so it is
 * kept to the smallest possible thing: take the hash, drop the `#`, default an empty one to `/`.
 * The test below that reads `main.tsx` is what keeps the assumption honest, by failing if the
 * application ever stops being a hash router.
 */
function addressFromFragment(published: string): string {
  const { hash } = new URL(published);
  const requested = hash.replace(/^#/, '');
  return requested === '' ? '/' : requested;
}

/** Every address a screen sits at today, derived — never a list somebody typed. */
const DESTINATION_ADDRESSES = DESTINATIONS.map((destination) => ({
  destination,
  published: `${PUBLISHED_ORIGIN}#/${destination.path}`,
}));

/**
 * Addresses the application does not have, in the three shapes a coach actually arrives by: a stale
 * or mistyped link, a destination with something after it, and a bare typo. The second is derived
 * from the real list so it stays wrong even after the list changes.
 */
const UNMATCHED_ADDRESSES = [
  `${PUBLISHED_ORIGIN}#/a-screen-that-was-never-built`,
  `${PUBLISHED_ORIGIN}#/${DESTINATIONS[0].path}/2024-04-01/nothing-here`,
  `${PUBLISHED_ORIGIN}#/xyzzy`,
];

/** Every route the table carries, flattened, so nothing can be exercised by accident of nesting. */
function flatten(routes: readonly RouteObject[], parent = ''): Array<{ id: string; route: RouteObject }> {
  const out: Array<{ id: string; route: RouteObject }> = [];
  for (const route of routes) {
    const id = `${parent}/${route.index === true ? '<index>' : (route.path ?? '')}`;
    out.push({ id, route });
    if (route.children !== undefined) out.push(...flatten(route.children, id));
  }
  return out;
}

const ALL_ROUTES = flatten(ROUTES);

/** The catch-all leaf. Found by its path rather than by position, which changes when a route is added. */
const SPLAT = ALL_ROUTES.find((entry) => entry.route.path === '*');

/** Every route that is meant to put a SCREEN in front of the coach: leaves that are not the index. */
const SCREEN_ROUTES = ALL_ROUTES.filter(
  (entry) => entry.route.index !== true && entry.route.children === undefined,
);

/**
 * Which routes this suite actually resolved. Recorded as it goes and asserted at the end, so a
 * route added later cannot be quietly untested — the failure names it.
 */
const exercised = new Set<string>();

/** What react-router matches for an address, if anything at all. */
function match(published: string) {
  const address = addressFromFragment(published);
  const matches = matchRoutes(ROUTES, address);
  if (matches !== null) {
    for (const entry of matches) {
      const found = ALL_ROUTES.find((candidate) => candidate.route === entry.route);
      if (found !== undefined) exercised.add(found.id);
    }
  }
  return { address, matches };
}

/**
 * The screen at an address, rendered the way `main.tsx` renders it.
 *
 * The two providers are not scaffolding: the frame's permanent synchronisation indicator and the
 * admin screen's platform report both refuse to render without them, deliberately, so that a seam
 * left unwired is an error rather than an empty space. Rendering without them would only prove that
 * this file can construct a React tree.
 *
 * THE STORE IS PROVIDED IN ITS `opening` STATE, ON PURPOSE. Every screen here is therefore rendered
 * on a device whose local database has not answered yet, which is the state the coach genuinely
 * meets on every cold start — and it makes this suite prove, for the WHOLE route table at once, that
 * a store which has not opened produces a screen with words on it rather than a blank frame. The
 * other two states are proven where they are decided, in `platform/local-store.test.ts`.
 */
async function render(published: string): Promise<string> {
  const { address } = match(published);
  const handler = createStaticHandler(ROUTES);
  const context = await handler.query(new Request(new URL(address, 'http://localhost/').href));

  assert.ok(
    !(context instanceof Response),
    `${published} produced a bare HTTP response rather than a screen`,
  );

  const router = createStaticRouter(ROUTES, context as never);
  return renderToStaticMarkup(
    createElement(LocalStoreProvider, {
      opening: STILL_OPENING,
      children: createElement(PlatformStatusProvider, {
      status: {
        buildStamp: 'no-dead-ends',
        persistence: null,
        offlineStart: { registered: false, reason: 'not asked in a test' },
      },
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
                children: createElement(StaticRouterProvider, { router, context: context as never }),
              }),
            }),
          }),
        }),
      }),
      }),
    }),
  );
}

/** Every link in a rendered document, with the words on it. An empty label is not a way out. */
function links(html: string): Array<{ href: string; label: string }> {
  return [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((found) => ({
    href: found[1],
    label: found[2]
      .replace(/<svg[\s\S]*?<\/svg>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  }));
}

/** The screen's own region, so a screen is never credited with the frame's navigation surface. */
function screenRegion(html: string): string {
  const opens = html.indexOf('<div class="content-body">');
  assert.ok(opens > -1, 'the frame no longer has a content body, so no screen can be inside one');
  return html.slice(opens);
}

/** Whether a link's target is an address the application actually has. */
function resolves(href: string): boolean {
  const matches = matchRoutes(ROUTES, href);
  if (matches === null) return false;
  return matches.at(-1)?.route.path !== '*';
}

describe('every destination the navigation surface offers', () => {
  for (const { destination, published } of DESTINATION_ADDRESSES) {
    it(`resolves ${published} to a screen that renders`, async () => {
      const { matches } = match(published);
      assert.ok(matches !== null, `${published} matches no route at all`);
      assert.notEqual(
        matches.at(-1)?.route.path,
        '*',
        `${destination.label} is in the navigation surface but its address falls through to ` +
          'not-found, which is a link the coach can see and cannot use',
      );

      const html = await render(published);
      const screen = screenRegion(html);
      assert.ok(screen.length > 0, `${destination.label} rendered an empty screen region`);
      assert.ok(
        !screen.includes('id="screen-not-found"'),
        `${destination.label} rendered the not-found screen`,
      );
      assert.ok(
        screen.includes(destination.label),
        `the screen at ${published} never says it is ${destination.label}, so a coach who ` +
          'arrived from a stale link cannot tell where he is',
      );
    });
  }

  /**
   * A DESTINATION WHOSE SCREEN EXISTS MUST NOT STILL RESOLVE TO THE PLACEHOLDER.
   *
   * Everything above this proves a destination RESOLVES, RENDERS and NAMES ITSELF — and the
   * placeholder does all three, because that is its entire job. So the suite passes identically
   * whether a step built its screen or not, and every destination still to come inherits that false
   * assurance. It was measured on this exact table: with the diet entry removed from
   * `DESTINATION_SCREENS`, this file reported 33 passes and 0 failures.
   *
   * The one thing left to check is that the address reaches the screen somebody BUILT. It is derived
   * rather than listed: a destination `diet` has a screen when `screens/DietScreen.tsx` is on disk,
   * which is this application's own naming and the reason a typed list is not written here — such a
   * list is the defect this build has watched rot four times. A destination with no such file is
   * legitimately a placeholder and is required to still BE one, which is what stops this reading as
   * a pass over a scan that matches nothing.
   */
  it('resolves to the screen that was BUILT, wherever one exists, rather than to the placeholder', async () => {
    const { PlaceholderScreen } = await import('../screens/PlaceholderScreen.tsx');
    const screensDirectory = path.join(here, '..', 'screens');
    const built = await readdir(screensDirectory);

    /** `diet` → `DietScreen.tsx`, the convention every screen in this application already follows. */
    const componentFor = (destinationPath: string): string =>
      `${destinationPath.charAt(0).toUpperCase()}${destinationPath.slice(1)}Screen.tsx`;

    let checked = 0;
    let placeholders = 0;

    for (const destination of DESTINATIONS) {
      const file = componentFor(destination.path);
      const matches = matchRoutes(ROUTES, `/${destination.path}`);
      assert.ok(matches !== null, `${destination.path} matches no route`);
      const drawn = (matches.at(-1)?.route.element as { type?: unknown } | undefined)?.type;

      if (!built.includes(file)) {
        // The NEGATIVE control. Without it, a scan that found no built screens at all would report
        // the same clean pass as one that found them all correctly wired.
        assert.equal(
          drawn,
          PlaceholderScreen,
          `${destination.label} has no ${file} but does not draw the placeholder either`,
        );
        placeholders += 1;
        continue;
      }

      const { [file.replace('.tsx', '')]: component } = await import(`../screens/${file}`);
      assert.equal(
        drawn,
        component,
        `${destination.label} has a real screen at screens/${file}, but its address still resolves `
        + 'to something else — the placeholder RENDERS and CARRIES THE LABEL, so every other check '
        + `in this file passes while the coach never reaches it. Add ${destination.path} to `
        + 'DESTINATION_SCREENS in routes.tsx.',
      );
      checked += 1;
    }

    // NON-VACUITY, derived rather than recorded — AND THE CONTROL HAS HAD TO CHANGE, which is worth
    // stating rather than quietly editing.
    //
    // It used to require at least one destination to still be a placeholder, so that the second
    // branch was proven to have run. That was really a MILESTONE wearing a control's clothes: it
    // could only hold while some destination was unbuilt, and s9 built the last one. Waiting for a
    // control to become unsatisfiable and then deleting it is how a guard quietly stops guarding, so
    // it is REPLACED by two assertions that do the same work and do not expire.
    //
    // ONE — the matcher that decides "this destination has a screen" is proven to DISCRIMINATE, by
    // asking it about a destination that demonstrably has none. Without this, a `built` list that
    // matched everything would send every destination down the first branch and the second would
    // never run again with nobody noticing.
    //
    // TWO — the two branches are proven to be TOTAL. Every destination went down one of them, so a
    // destination cannot escape both and be checked by neither.
    assert.ok(checked >= 3, `only ${String(checked)} destinations have a built screen to check`);
    assert.equal(
      built.includes(componentFor('a-destination-nobody-has-built')),
      false,
      'the screens directory reports a file for a destination nobody has built, so the branch that '
      + 'requires an unbuilt destination to draw the placeholder can never have discriminated',
    );
    assert.equal(
      checked + placeholders,
      DESTINATIONS.length,
      `${String(checked)} destinations were checked against a built screen and `
      + `${String(placeholders)} against the placeholder, out of ${String(DESTINATIONS.length)}. `
      + 'One went down neither branch and was checked by nothing.',
    );
  });

  /**
   * WHAT THIS ASSERTION USED TO BE, AND WHY IT IS NOW STRONGER RATHER THAN RELAXED.
   *
   * It used to require every screen route to BE a destination. That was a proxy for the property
   * that matters — no screen is reachable only by typing its address — and it held for exactly as
   * long as every screen was a destination. The divergence picker is deliberately not one: a clash
   * between two devices is rare, and a permanent sixth entry that is empty almost every visit is an
   * entry the coach learns to stop reading.
   *
   * So the proxy is replaced by the property itself. A non-destination route must be reached by a
   * LABELLED link that RESOLVES, from a screen that is itself reachable — which is a strictly harder
   * thing to satisfy than membership of a list, and it is checked by rendering the screens rather
   * than by reading them. It also now covers the case the old form could not see at all: a
   * destination whose screen links onward to something that does not exist.
   */
  it('reaches every route the navigation surface does NOT carry by a labelled link that resolves', async () => {
    const offered = new Set(DESTINATIONS.map((destination) => destination.path));
    const unlisted = SCREEN_ROUTES.map((entry) => entry.route.path ?? '').filter(
      (path) => path !== '*' && !offered.has(path),
    );

    // Every link on every screen the coach can already get to, with where it was found.
    const ways: Array<{ href: string; label: string; from: string }> = [];
    for (const { published } of DESTINATION_ADDRESSES) {
      // eslint-disable-next-line no-await-in-loop
      const html = await render(published);
      for (const link of links(screenRegion(html))) ways.push({ ...link, from: published });
    }

    for (const path of unlisted) {
      const found = ways.filter((way) => {
        if (way.label.length === 0) return false;
        const matched = matchRoutes(ROUTES, way.href);
        return matched !== null && matched.at(-1)?.route.path === path;
      });

      assert.ok(
        found.length > 0,
        `the route table answers to "${path}", which no destination carries and no screen links ` +
          'to with words. A screen reachable only by typing its address is a screen the coach ' +
          'cannot find — and it is worse than a missing screen, because the work in it looks done.',
      );
    }

    assert.ok(
      unlisted.length > 0,
      'no route is outside the navigation surface, so this check exercised nothing. It is not ' +
        'wrong yet — but a check that currently proves nothing must not be trusted later, so ' +
        'delete it or give it something to hold when that becomes true.',
    );
  });
});

describe('the index address', () => {
  it('lands on a destination that exists rather than on nothing', async () => {
    const { matches } = match(`${PUBLISHED_ORIGIN}#`);
    assert.ok(matches !== null, 'the index address matches no route');

    const index = matches.find((entry) => entry.route.index === true);
    assert.ok(index !== undefined, 'the index address no longer resolves to the index route');

    // The redirect's own target, read off the element the table carries rather than from a copy of
    // the default written into this file. A `<Navigate>` cannot be rendered here to prove where it
    // goes — a static render is by definition the initial one, where react-router refuses it — so
    // the destination is taken from the element and then MATCHED, which is the half that matters.
    const element = index.route.element as { props?: { to?: string } } | undefined;
    const target = element?.props?.to;
    assert.equal(
      typeof target,
      'string',
      'the index route no longer redirects, so an application opened at its own address shows nothing',
    );
    assert.equal(target, DEFAULT_DESTINATION_PATH);

    const landing = matchRoutes(ROUTES, `/${target}`);
    assert.ok(landing !== null && landing.at(-1)?.route.path !== '*', `the index sends the coach to /${target}, which is not a screen`);

    const html = await render(`${PUBLISHED_ORIGIN}#/${target}`);
    assert.ok(screenRegion(html).length > 0, `the index landing at /${target} renders nothing`);
  });
});

describe('an address the application does not have', () => {
  for (const published of UNMATCHED_ADDRESSES) {
    it(`reaches the not-found screen from ${published}`, async () => {
      const { matches } = match(published);
      assert.ok(matches !== null, `${published} matched nothing at all, so the coach sees a blank frame`);
      assert.equal(
        matches.at(-1)?.route.path,
        '*',
        `${published} resolved to something other than the not-found screen`,
      );

      const html = await render(published);
      assert.ok(
        screenRegion(html).includes('id="screen-not-found"'),
        `${published} did not render the not-found screen`,
      );
    });

    it(`offers a labelled way back from ${published} that itself resolves`, async () => {
      const ways = links(screenRegion(await render(published))).filter((link) => resolves(link.href));

      assert.ok(
        ways.length > 0,
        'the not-found screen offers no way back that resolves. THIS IS THE DEFECT THAT SHIPPED: a ' +
          'RELATIVE target is resolved against where the coach is, and here that is by definition ' +
          'an address the application does not have, so "go to the calendar" from #/typo became ' +
          '#/typo/calendar — unmatched too, one level deeper on every press. Write the target ' +
          'absolutely.',
      );

      for (const way of ways) {
        assert.ok(
          way.label.length > 0,
          `the way back to ${way.href} has no words on it, so nothing announces where it goes`,
        );
      }
    });
  }
});

/**
 * Every route this table carries that is not a destination, as an address a coach could restore.
 *
 * The second of them is why each entry carries the identifier of the screen it must
 * produce rather than the suite asserting one screen by name. All of them would fall through to
 * not-found in exactly the same way; an assertion that only ever named the picker would have gone on
 * passing for the picker while the others resolved to nothing.
 *
 * The two added in the middle are the pair `core/status/reasons.js` had already named an action code for
 * and the pending-removal list that `core/sync/deletions.js` had been keeping honestly with nobody
 * reading it.
 *
 * THE SESSION RUNNER IS THE ONE THE APPLICATION EXISTS FOR, and it is the only one not reached from
 * Admin: it is reached from the CALENDAR, which is where both doors into a session are. It is
 * addressed with no session named here on purpose — that is the state a coach meets when he follows the
 * standing link without a session running, and it is the state that must still be a screen with words
 * on it rather than a blank frame.
 */
const UNLISTED_SCREENS = [
  { what: 'the divergence picker', published: `${PUBLISHED_ORIGIN}#/${DIVERGENCES_PATH}`, id: 'id="screen-divergences"' },
  { what: 'the key-material condition screen', published: `${PUBLISHED_ORIGIN}#/${KEY_MATERIAL_PATH}`, id: 'id="screen-key-material"' },
  { what: 'the stopped-changes review', published: `${PUBLISHED_ORIGIN}#/${STOPPED_CHANGES_PATH}`, id: 'id="screen-stopped-changes"' },
  { what: 'the pending-removal list', published: `${PUBLISHED_ORIGIN}#/${REMOVALS_PATH}`, id: 'id="screen-removals"' },
  { what: 'the setup surface', published: `${PUBLISHED_ORIGIN}#/${SETUP_PATH}`, id: 'id="screen-setup"' },
  { what: 'the session runner', published: `${PUBLISHED_ORIGIN}#/${SESSION_PATH}`, id: 'id="screen-session"' },
  // THE ACTIVITY LOG, and it is the first entry here that MOUNTS ITS OWN SEAM rather than reading one
  // this file provides. Its filter is a changed READ over an unindexed store, so the query cannot live
  // above the router — which means nothing has to be added to `render` below for it. In this suite the
  // store is deliberately STILL_OPENING, so what is exercised is the state a coach meets on every cold
  // start: the screen says its database has not answered rather than reporting an empty, verified log.
  { what: 'the activity log', published: `${PUBLISHED_ORIGIN}#/${JOURNAL_PATH}`, id: 'id="screen-journal"' },
];

const UNLISTED_ADDRESSES = UNLISTED_SCREENS.map((entry) => entry.published);

describe('the screens that are deliberately not destinations', () => {
  for (const { what, published, id } of UNLISTED_SCREENS) {
    it(`resolves ${published} to a screen that renders rather than to not-found`, async () => {
      const { matches } = match(published);
      assert.ok(matches !== null, `${published} matches no route at all`);
      assert.notEqual(
        matches.at(-1)?.route.path,
        '*',
        'a screen linked from the admin screen must not fall through to not-found — that is the ' +
          'dead end wearing a button',
      );

      const screen = screenRegion(await render(published));
      assert.ok(
        !screen.includes('id="screen-not-found"'),
        `${published} rendered the not-found screen`,
      );
      assert.ok(screen.includes(id), `${published} did not render ${what}`);
    });
  }
});

describe('a way onward that is not the browser back button', () => {
  const everyAddress = [
    ...DESTINATION_ADDRESSES.map((entry) => entry.published),
    ...UNLISTED_ADDRESSES,
    ...UNMATCHED_ADDRESSES,
  ];

  for (const published of everyAddress) {
    it(`is on screen at ${published}`, async () => {
      const html = await render(published);
      const reachable = links(html).filter((link) => link.label.length > 0 && resolves(link.href));

      // Every destination, from anywhere. That is the requirement the navigation frame exists to
      // meet, and it is checked at EVERY address rather than once, because the frame is the thing
      // an installed application has instead of a browser's chrome.
      for (const destination of DESTINATIONS) {
        assert.ok(
          reachable.some((link) => link.label.includes(destination.label)),
          `nothing at ${published} offers a labelled route to ${destination.label}. On an installed ` +
            'application there is no visible back button, so a screen without one of these is a room ' +
            'with no door.',
        );
      }
    });
  }
});

describe('every route answers a failure with a screen of this application’s own', () => {
  /**
   * A ROUTE WITH NO BOUNDARY IS A DEAD END THIS SUITE COULD NOT SEE.
   *
   * Everything above proves where the coach can GO. This proves what he meets when a screen cannot
   * finish — and until it existed, the answer was react-router's own developer screen: "Unexpected
   * Application Error!", a sentence addressed to a programmer, and a raw stack trace. MEASURED in
   * the production bundle rather than assumed to be development-only: the default boundary's
   * developer fragment is assigned UNCONDITIONALLY there, so the guard did not survive minification
   * as a branch, and the router picks it with `route.errorElement || <that default>`.
   *
   * It is asserted over EVERY route the table carries, flattened, because the router walks UP from
   * the route that threw: a leaf without one is answered by its parent, and the top of the tree has
   * nobody above it at all. `routes.tsx` fills them in from ONE declaration, so this holds by
   * construction — which is exactly why it is checked rather than trusted, since a table built a
   * different way tomorrow would lose the property silently.
   */
  it('declares an errorElement, so no failure is answered by react-router’s developer screen', () => {
    const without = ALL_ROUTES.filter((entry) => entry.route.errorElement === undefined);
    assert.deepEqual(
      without.map((entry) => entry.id),
      [],
      'these routes declare no errorElement. React Router answers an unhandled render or loader '
      + 'error under them with its own default boundary, which in THIS application’s production '
      + 'bundle shows "Unexpected Application Error!" and a raw JavaScript stack trace to a coach '
      + 'in the middle of a session. `screens/ErrorScreen.tsx` is the screen; `routes.tsx` puts it '
      + 'on every route from one declaration.',
    );
  });

  /**
   * NON-VACUITY. The assertion above is absence-shaped over a list this file derives, so it passes
   * for free the day `flatten` stops finding routes — the shape this build has been bitten by
   * repeatedly. So the list is proven to be REAL: it has to hold every route, and the boundary it
   * finds has to be the screen this application built rather than any element at all.
   */
  it('and that check is looking at a real, complete list of routes with THIS application’s screen on it', async () => {
    const { ErrorScreen } = await import('../screens/ErrorScreen.tsx');

    assert.ok(
      ALL_ROUTES.length > 10,
      `the route walk found only ${String(ALL_ROUTES.length)} routes, so the check above is `
      + 'asserting an absence over almost nothing',
    );
    assert.equal(
      SCREEN_ROUTES.length + 1 + 1,
      ALL_ROUTES.length,
      'the flattened list no longer accounts for every route as a screen leaf, the index route and '
      + 'the layout — so it is not the complete list the boundary check believes it is',
    );

    const drawn = new Set(
      ALL_ROUTES.map((entry) => (entry.route.errorElement as { type?: unknown } | undefined)?.type),
    );
    assert.deepEqual(
      [...drawn],
      [ErrorScreen],
      'a route answers a failure with something other than screens/ErrorScreen.tsx. Every route in '
      + 'this table is meant to reach the one screen whose words were written for a coach.',
    );
  });
});

describe('the check itself cannot go stale', () => {
  it('exercised every route the table carries, so a route added later is covered without anyone remembering', () => {
    const untouched = ALL_ROUTES.filter((entry) => !exercised.has(entry.id));
    assert.deepEqual(
      untouched.map((entry) => entry.id),
      [],
      'these routes exist and no address in this suite reaches them. They are derived from ' +
        'DESTINATIONS and the route table, so this can only mean a route was added that is neither ' +
        'a destination nor the catch-all — give it an address here rather than deleting this test.',
    );
  });

  it('is checking the router that actually ships', async () => {
    const routes = await readFile(path.join(here, 'routes.tsx'), 'utf8');

    // BOTH FILES THAT START THE APPLICATION, because there are two now: `main.tsx` is the composition
    // root and `App.tsx` is what it mounts. This read used to be `main.tsx` alone, and the split moved
    // the thing it was looking for — a check pointed at the file the application USED to be composed in
    // would have gone on passing right up until it stopped, then failed for the wrong reason.
    const composed = await Promise.all(
      ['main.tsx', 'App.tsx'].map((name) => readFile(path.join(here, '..', name), 'utf8')),
    );
    const start = composed.join('\n');
    assert.ok(
      composed.every((source) => source.length > 200),
      'one of the two files that start the application is missing or empty, so this check is reading '
      + 'nothing and would report a pass for it',
    );

    assert.ok(
      routes.includes('createHashRouter(') && start.includes('createAppRouter()'),
      'the application no longer starts a hash router built from this table. Every address in this ' +
        'suite is a FRAGMENT, so if routing moved to history paths these checks are exercising a ' +
        'convention the coach no longer uses.',
    );
    assert.ok(
      SPLAT !== undefined,
      'the route table no longer has a catch-all, so an unknown address renders an empty frame with ' +
        'no explanation and no way back',
    );
    assert.equal(
      start.split('createHashRouter').length - 1,
      0,
      'a second router is being built outside routes.tsx, so there are now two route tables and ' +
        'this suite can only see one of them',
    );
  });
});
