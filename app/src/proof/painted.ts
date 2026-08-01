/**
 * THE WORDS A PERSON ACTUALLY READS, from the screens this application really renders.
 *
 * ## Why this is a module rather than another copy
 *
 * A sweep that walks a MODULE'S NAMESPACE is aimed at the wrong thing, and it has already failed
 * here for real: a screen composing its copy from three modules was guarded by a sweep over one of
 * them, so it stayed green while a sentence from a second module sat on the screen pointing at a box
 * that did not exist. The guard has to run over what is PAINTED.
 *
 * `src/shell/no-dead-ends.test.ts` had already built the render — the real `ROUTE_TABLE`, react
 * router's own static handler, the providers `main.tsx` wires — and `src/proof/
 * unchecked-conditions.test.ts` had already built the tag stripper. Both were correct and both were
 * private to a suite. This file is those two capabilities PROMOTED so the third caller does not
 * write a third one; nothing here is new behaviour.
 *
 * `no-dead-ends.test.ts` keeps its own render deliberately: its copy is entangled with the
 * bookkeeping that records WHICH routes were exercised, which is a property of that suite rather
 * than of painting, and prising it apart mid-flight would put a settled dead-end guard at risk to
 * save a duplicate nobody has to maintain twice.
 *
 * ## What it does NOT prove
 *
 * This is rendered markup, not a browser. Nothing here says an element is visible, on screen, or
 * reachable by touch — a rendered check has never been able to see that. What it proves is which
 * words reach the document.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router';
import type { RouteObject } from 'react-router';

import { LocalStoreProvider } from '../platform/LocalStore';
import { STILL_OPENING } from '../platform/local-store';
import { PlatformStatusProvider } from '../platform/platform-status';
import { DivergenceProvider, NOTHING_TO_DECIDE } from '../shell/Divergences';
import { KeyMaterialProvider, NO_KEY_MATERIAL_CONDITION } from '../shell/KeyMaterial';
import { NOTHING_AWAITING_REMOVAL, RemovalsProvider } from '../shell/Removals';
import { ROUTE_TABLE } from '../shell/routes';
import { NOTHING_STOPPED, StoppedChangesProvider } from '../shell/StoppedChanges';
import { NO_BACKUP_YET, SyncStatusProvider } from '../shell/SyncStatus';

/**
 * MARKUP AS WORDS: tags away, entities back, whitespace collapsed.
 *
 * Entities are put back because the renderer escapes and this application's copy carries
 * apostrophes. Attributes go with the tags: a scan of raw markup misses a sentence broken by a
 * `<span>` and matches one that only ever existed in an attribute, and both errors point the wrong
 * way — the first passes over a claim, the second reds on markup no person can read.
 */
export function painted(markup: string): string {
  return markup
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&#x27;|&#39;/gu, "'")
    .replace(/&quot;/gu, '"')
    .replace(/&#x2F;|&#47;/gu, '/')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&')
    .replace(/\s+/gu, ' ');
}

/** One route in the shipped table, flattened, with the address a coach would actually be at. */
type Leaf = { readonly id: string; readonly address: string };

/** An address the application does not have, so the not-found screen is painted like any other. */
const UNMATCHED = '/a-screen-that-was-never-built';

/**
 * Every address the table can put a screen at, DERIVED from `ROUTE_TABLE` and never typed.
 *
 * A typed list is the defect this build has watched rot four times: it passes forever while the
 * table drifts away from it. A route added in a later step is painted here without anybody
 * remembering, which is the whole reason the addresses come from the table.
 */
export function everyAddress(routes: readonly RouteObject[] = ROUTE_TABLE, parent = ''): Leaf[] {
  const out: Leaf[] = [];
  for (const route of routes) {
    const own = route.index === true ? '' : (route.path ?? '');
    const joined = own.startsWith('/') ? own : `${parent.replace(/\/$/u, '')}/${own}`;
    const address = joined === '' ? '/' : joined;
    if (route.children === undefined) {
      out.push({
        id: route.index === true ? `${parent}<index>` : joined,
        address: route.path === '*' ? UNMATCHED : address,
      });
    } else {
      out.push(...everyAddress(route.children, address));
    }
  }
  return out;
}

/**
 * One address, rendered the way `main.tsx` renders it and reduced to its words.
 *
 * THE STORE IS IN ITS `opening` STATE, which is the state the coach genuinely meets on every cold
 * start — and the providers are not scaffolding: the frame's synchronisation indicator and the admin
 * screen's platform report refuse to render without them, deliberately, so that an unwired seam is
 * an error rather than an empty space.
 */
export async function paintAddress(address: string): Promise<string> {
  const routes = [...ROUTE_TABLE];
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request(new URL(address, 'http://localhost/').href));
  if (context instanceof Response) {
    throw new Error(`${address} produced a bare HTTP response rather than a screen`);
  }

  const router = createStaticRouter(routes, context as never);
  return painted(renderToStaticMarkup(
    createElement(LocalStoreProvider, {
      opening: STILL_OPENING,
      children: createElement(PlatformStatusProvider, {
        status: {
          buildStamp: 'painted',
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
  ));
}

/** A screen this application really puts in front of the coach, as the words on it. */
export type PaintedScreen = { readonly where: string; readonly address: string; readonly text: string };

/** Every screen the shipped route table carries, painted. */
export async function paintEveryScreen(): Promise<readonly PaintedScreen[]> {
  const painted: PaintedScreen[] = [];
  for (const leaf of everyAddress()) {
    painted.push({ where: `rendered${leaf.id}`, address: leaf.address, text: await paintAddress(leaf.address) });
  }
  return painted;
}
