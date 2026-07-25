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
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createStaticHandler, createStaticRouter, matchRoutes, StaticRouterProvider } from 'react-router';
import type { RouteObject } from 'react-router';

import { PlatformStatusProvider } from '../platform/platform-status.tsx';
import { DEFAULT_DESTINATION_PATH, DESTINATIONS } from './navigation.ts';
import { ROUTE_TABLE } from './routes.tsx';
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
    createElement(PlatformStatusProvider, {
      status: {
        buildStamp: 'no-dead-ends',
        persistence: null,
        offlineStart: { registered: false, reason: 'not asked in a test' },
      },
      children: createElement(SyncStatusProvider, {
        reading: NO_BACKUP_YET,
        children: createElement(StaticRouterProvider, { router, context: context as never }),
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

  it('has no route reachable by address that the navigation surface never shows', () => {
    const offered = new Set(DESTINATIONS.map((destination) => destination.path));
    for (const entry of SCREEN_ROUTES) {
      if (entry.route.path === '*') continue;
      assert.ok(
        offered.has(entry.route.path ?? ''),
        `the route table answers to "${entry.route.path}", which no destination offers. A screen ` +
          'reachable only by typing its address is a screen the coach cannot find.',
      );
    }
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

describe('a way onward that is not the browser back button', () => {
  const everyAddress = [
    ...DESTINATION_ADDRESSES.map((entry) => entry.published),
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
    const main = await readFile(path.join(here, '..', 'main.tsx'), 'utf8');

    assert.ok(
      routes.includes('createHashRouter(') && main.includes('createAppRouter()'),
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
      main.split('createHashRouter').length - 1,
      0,
      'a second router is being built outside routes.tsx, so there are now two route tables and ' +
        'this suite can only see one of them',
    );
  });
});
