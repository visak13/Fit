/**
 * THE SCREEN A COACH MEETS WHEN SOMETHING THROWS — proven by MAKING the application throw.
 *
 * Every assertion here is driven from the SHIPPED route table. Nothing is described: the error is a
 * real one raised inside a real route, the boundary that answers it is the one `routes.tsx` carries,
 * and the words come out of the rendered markup rather than out of a module's exports.
 *
 * ## WHY A LOADER ERROR AND NOT A RENDER ERROR, SAID PLAINLY
 *
 * `renderToStaticMarkup` does not run React's error boundaries — a render error propagates straight
 * out of it — so a render-time throw cannot be caught in this runner AT ALL, by any suite. React
 * Router's static handler, on the other hand, catches a LOADER error itself and hands it to the same
 * boundary the router picks in a browser: `route.errorElement || <its own default>`. That is the
 * identical selection, so this file proves the SELECTION and the WORDS.
 *
 * It does not, and cannot, prove the browser half. That is proven in a production build with a real
 * unhandled RENDER error induced on a reachable path, and the honest statement of the gap is here
 * rather than left for a reader to discover.
 *
 * ## THE NON-VACUITY CONTROL IS THE DEFAULT BOUNDARY ITSELF
 *
 * Every check below is a claim that OUR screen appeared. That claim is worthless unless the harness
 * could have seen the other outcome, so {@link THE_HARNESS_CAN_SEE_THE_DEFAULT_BOUNDARY} runs the
 * SAME induced error over the SAME table with the boundary stripped, and requires react-router's
 * "Unexpected Application Error!" to come back. If that ever goes quiet, this file is measuring
 * nothing and fails instead of reporting a pass.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createStaticHandler, createStaticRouter, matchRoutes, StaticRouterProvider } from 'react-router';
import type { RouteObject } from 'react-router';

import { LocalStoreProvider } from '../platform/LocalStore.tsx';
import { STILL_OPENING } from '../platform/local-store.ts';
import { PlatformStatusProvider } from '../platform/platform-status.tsx';
import { DivergenceProvider, NOTHING_TO_DECIDE } from '../shell/Divergences.tsx';
import { KeyMaterialProvider, NO_KEY_MATERIAL_CONDITION } from '../shell/KeyMaterial.tsx';
import { DESTINATIONS } from '../shell/navigation.ts';
import { NOTHING_AWAITING_REMOVAL, RemovalsProvider } from '../shell/Removals.tsx';
import { ROUTE_TABLE } from '../shell/routes.tsx';
import { NOTHING_STOPPED, StoppedChangesProvider } from '../shell/StoppedChanges.tsx';
import { NO_BACKUP_YET, SyncStatusProvider } from '../shell/SyncStatus.tsx';
import {
  ERROR_SCREEN_ID, ERROR_TITLE, WHAT_HAPPENED, WHAT_IS_STILL_HERE, WHAT_TO_DO, WHAT_WAS_NOT_SAVED,
  waysOnward,
} from './error-screen.ts';

import { openLocalStore } from '../../core/store/store.js';
import { createLaptop } from '../../core/store/testing/platform-double.js';

/** The sentence react-router's own default boundary puts on screen. The thing being replaced. */
const THE_DEFAULT_BOUNDARY = 'Unexpected Application Error';

/** The address the induced failure is raised at. Any real one would do; this is the coach's first. */
const WHERE = '/calendar';

/** A fault nothing in this application could produce, so nothing else can be mistaken for it. */
const PLANTED = 'a planted fault, raised by error-screen.test.ts and by nothing else';

/**
 * The shipped table with ONE route made to fail, and nothing else about it altered.
 *
 * The route objects are copied — never mutated — because they are the identical objects the
 * application runs on, imported rather than described. `errorElement` comes along in the copy, which
 * is the whole point: what answers the failure below is the boundary `routes.tsx` declares.
 */
function tableThatFailsAt(address: string, options: { keepBoundary: boolean }): RouteObject[] {
  const failing = address.replace(/^\//u, '');
  const rebuild = (routes: readonly RouteObject[]): RouteObject[] =>
    routes.map((route) => {
      const copy: RouteObject = { ...route };
      if (!options.keepBoundary) delete copy.errorElement;
      if (route.children !== undefined) copy.children = rebuild(route.children);
      if (route.path === failing) {
        copy.loader = () => {
          throw new Error(PLANTED);
        };
      }
      return copy;
    });
  return rebuild(ROUTE_TABLE);
}

/** What the coach's browser would show, rendered the way `no-dead-ends.test.ts` renders a screen. */
async function renderAt(address: string, routes: RouteObject[]): Promise<string> {
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request(new URL(address, 'http://localhost/').href));
  assert.ok(!(context instanceof Response), `${address} produced a bare response rather than a screen`);

  const router = createStaticRouter(routes, context as never);
  return renderToStaticMarkup(
    createElement(LocalStoreProvider, {
      opening: STILL_OPENING,
      children: createElement(PlatformStatusProvider, {
        status: {
          buildStamp: 'error-screen',
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

/**
 * Rendered markup as the coach READS it: tags gone, entities back, whitespace collapsed.
 *
 * THE SCRIPT ELEMENTS GO FIRST, AND THAT IS A MEASURED CORRECTION RATHER THAN A CONVENIENCE.
 * `StaticRouterProvider` writes a hydration payload into a `<script>`, and that payload carries the
 * thrown error's MESSAGE AND STACK — so a scan of the raw markup finds the planted fault even when
 * our screen is what rendered, and the "nothing from the thrown value reached the page" check would
 * fail for a reason that has nothing to do with the screen. That payload is an artefact of rendering
 * on a server: the application ships a hash router built in the browser, which emits no such script.
 * Stripping it is what makes this file measure THE PAINTED WORDS, which is the rule this build
 * already runs its guards under.
 */
function painted(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&#x27;|&apos;/gu, "'")
    .replace(/&quot;/gu, '"')
    .replace(/&amp;/gu, '&')
    .replace(/\s+/gu, ' ')
    .trim();
}

describe('THE HARNESS CAN SEE THE DEFAULT BOUNDARY — without this, every check below is free', () => {
  it('renders react-router’s own error screen when the boundary is stripped off the table', async () => {
    const html = await renderAt(WHERE, tableThatFailsAt(WHERE, { keepBoundary: false }));

    assert.ok(
      painted(html).includes(THE_DEFAULT_BOUNDARY),
      'with no errorElement anywhere, the induced failure did NOT produce react-router’s default '
      + 'boundary. That means the failure is not reaching a boundary at all, so every assertion in '
      + 'this file that OUR screen appeared is passing for the wrong reason.',
    );
  });

  it('and the planted fault is the one being raised, not something else that happens to fail', async () => {
    const html = await renderAt(WHERE, tableThatFailsAt(WHERE, { keepBoundary: false }));
    assert.ok(
      painted(html).includes(PLANTED),
      'the default boundary reported a failure that is not the planted one, so the probe missed',
    );
  });
});

describe('a real failure inside a real route', () => {
  it('shows THIS application’s screen and none of react-router’s', async () => {
    const html = await renderAt(WHERE, tableThatFailsAt(WHERE, { keepBoundary: true }));
    const shown = painted(html);

    assert.ok(html.includes(`id="${ERROR_SCREEN_ID}"`), 'the error screen’s own heading is not in the document');
    assert.ok(shown.includes(ERROR_TITLE), `the error screen’s heading is not on the page: ${shown.slice(0, 300)}`);
    assert.ok(
      !shown.includes(THE_DEFAULT_BOUNDARY),
      'react-router’s default boundary is still what the coach meets',
    );
    assert.ok(
      !shown.includes(PLANTED),
      'the thrown value reached the rendered markup. An error MESSAGE is the one string in this '
      + 'application whose contents nobody controls — a store error can quote the row it choked on, '
      + 'and that row is a client of his.',
    );
  });

  it('is rendered by the boundary the SHIPPED table declares, at the address that failed', async () => {
    const matched = matchRoutes(tableThatFailsAt(WHERE, { keepBoundary: true }), WHERE);
    assert.ok(matched !== null, `${WHERE} matches no route`);
    for (const entry of matched) {
      assert.notEqual(
        entry.route.errorElement,
        undefined,
        'a route on the path that failed carries no boundary, so the error walked past it',
      );
    }
  });

  it('says what happened, what is still here, and what was not saved — all four sentences', async () => {
    const shown = painted(await renderAt(WHERE, tableThatFailsAt(WHERE, { keepBoundary: true })));

    for (const sentence of [WHAT_HAPPENED, WHAT_IS_STILL_HERE, WHAT_WAS_NOT_SAVED, WHAT_TO_DO]) {
      assert.ok(
        shown.includes(painted(sentence)),
        `a sentence this screen decides was not painted: ${sentence.slice(0, 80)}…`,
      );
    }
  });

  it('offers a labelled way to every destination, and every one of them RESOLVES', async () => {
    const html = await renderAt(WHERE, tableThatFailsAt(WHERE, { keepBoundary: true }));
    const links = [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gu)].map((found) => ({
      href: found[1],
      label: painted(found[2]),
    }));

    for (const destination of DESTINATIONS) {
      const way = links.find((link) => link.label.includes(destination.label));
      assert.ok(
        way !== undefined,
        `nothing on the error screen offers a labelled route to ${destination.label}. A dead end `
        + 'HERE is worse than the stack trace this screen replaced: he arrived because something '
        + 'had already gone wrong.',
      );
      const landing = matchRoutes([...ROUTE_TABLE], way.href);
      assert.ok(
        landing !== null && landing.at(-1)?.route.path !== '*',
        `the way out to ${destination.label} points at ${way.href}, which this application does not answer to`,
      );
    }
  });
});

describe('the words are derived from the destination list, never typed beside it', () => {
  it('maps whatever list it is given, so the mapping is proven rather than the five', () => {
    const invented = [
      { path: 'a-place-nobody-has-built', label: 'A Place Nobody Has Built', summary: '', glyph: 'note' },
    ] as unknown as Parameters<typeof waysOnward>[0];

    assert.deepEqual(waysOnward(invented), [
      { to: '/a-place-nobody-has-built', label: 'Go to A Place Nobody Has Built' },
    ]);
  });

  it('and the shipped ways out are exactly the five destinations, in their order', () => {
    assert.deepEqual(
      waysOnward().map((way) => way.to),
      DESTINATIONS.map((destination) => `/${destination.path}`),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// THE AFTERMATH RULE — the sentence about the state the failure left behind
// ═══════════════════════════════════════════════════════════════════════════════

const opened: { close(): Promise<void> }[] = [];

after(async () => {
  for (const store of opened) {
    // eslint-disable-next-line no-await-in-loop
    await store.close();
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aRealStore(): Promise<any> {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });
  opened.push(store);
  return store;
}

describe('WHAT IS STILL HERE is a claim about the store, so it is checked against a store', () => {
  /**
   * The sentence says his records are still on the device. This drives a REAL failure through the
   * boundary with a REAL store open beside it, and then READS THE STORE BACK — rather than trusting
   * that a screen which stopped drawing cannot have written anything.
   *
   * This build has shipped the opposite defect twice: two refusal sentences told the coach a refused
   * save had ERASED something, and both hid because they are true on a fresh device — the state
   * everyone tests in. So the store here is NOT fresh: records are written first, and it is those
   * records the read-back is compared against.
   */
  it('leaves every record exactly where it was after a failure has been through the boundary', async () => {
    const store = await aRealStore();

    const before = await Promise.all([
      store.create('client', { name: 'Test Person Alpha', notes: '', active: true }),
      store.create('client', { name: 'Test Person Beta', notes: '', active: true }),
    ]);

    const shown = painted(await renderAt(WHERE, tableThatFailsAt(WHERE, { keepBoundary: true })));
    assert.ok(shown.includes(ERROR_TITLE), 'the failure did not reach the screen, so nothing was measured');

    const after = await Promise.all(
      before.map((record: { record_id: string }) => store.get('client', record.record_id)),
    );

    assert.deepEqual(
      after.map((record: { content: { name: string } } | undefined) => record?.content.name),
      ['Test Person Alpha', 'Test Person Beta'],
      'a record written before the failure is not readable after it, so WHAT_IS_STILL_HERE is false',
    );
    assert.deepEqual(
      after.map((record: { rev: number } | undefined) => record?.rev),
      before.map((record: { rev: number }) => record.rev),
      'a record was rewritten while a screen was failing, so "nothing that was already saved was '
      + 'changed" is false',
    );
  });
});
