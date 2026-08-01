/**
 * THE UPDATE LINE, IN THE REAL FRAME, AT REAL ADDRESSES — and the wiring that makes it possible.
 *
 * ## WHY THIS FILE EXISTS, WHICH IS A DECISION WORTH READING BEFORE CHANGING IT
 *
 * `useNewVersionIfWired` deliberately does NOT throw outside its provider, unlike every reporting seam
 * in this application. The argument is in `NewVersion.tsx`: the discriminator is whether the empty
 * state MAKES A CLAIM. A seam whose empty reading is worded as a fact — "There is nothing here yet" —
 * asserts something about his data that nobody measured, so silence there is a lie and must be loud.
 * An absent "a newer version is ready" line asserts nothing at all; its absence is indistinguishable
 * from the ordinary case of being up to date, which is true almost every time he opens the
 * application.
 *
 * THAT TRADE HAS A PRICE AND THIS FILE IS THE GUARD ON IT. Unwired-renders-nothing is exactly the
 * shape where a feature nobody wired passes every test in silence. So the throw is replaced by a
 * DIRECT check: the composition root really carries the provider, and the frame really draws the
 * notice. Both are read off the shipped source, and both are paired with a positive control proving
 * the reader can find something it must find.
 *
 * ## AND THE WORDS ARE GUARDED AS PAINTED, NOT AS EXPORTED
 *
 * Every assertion about what the coach sees runs over RENDERED MARKUP with the tags stripped. A guard
 * over a module's exports proves the string exists; it cannot prove anything reached the screen.
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
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router';

import { LocalStoreProvider } from '../platform/LocalStore.tsx';
import { STILL_OPENING } from '../platform/local-store.ts';
import { PlatformStatusProvider } from '../platform/platform-status.tsx';
import { OPEN_SESSION_KEY, RUNNER_ADDRESS } from '../screens/runner.ts';
import { DivergenceProvider, NOTHING_TO_DECIDE } from './Divergences.tsx';
import { KeyMaterialProvider, NO_KEY_MATERIAL_CONDITION } from './KeyMaterial.tsx';
import { NewVersionProvider } from './NewVersion.tsx';
import { NOTHING_AWAITING_REMOVAL, RemovalsProvider } from './Removals.tsx';
import { ROUTE_TABLE } from './routes.tsx';
import { NOTHING_STOPPED, StoppedChangesProvider } from './StoppedChanges.tsx';
import { NO_BACKUP_YET, SyncStatusProvider } from './SyncStatus.tsx';
import {
  A_NEW_VERSION_IS_WAITING, NEW_VERSION_SENTENCE, NO_NEW_VERSION_WAITING, TAKE_THE_NEW_VERSION,
} from './new-version.ts';
import type { NewVersionReading } from './new-version.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

const ROUTES = [...ROUTE_TABLE];

/** An address the coach is genuinely at, with a real session open on it. */
const A_LIVE_SESSION = `${RUNNER_ADDRESS}?${OPEN_SESSION_KEY}=session-01J8ZQ`;

/** The words the coach can actually read, with every tag taken out. */
function painted(html: string): string {
  return html
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The real frame at a real address, through the real route table.
 *
 * `reading` null means the update seam is NOT WIRED AT ALL — the case the missing provider produces,
 * which is the one a throw would have caught and this file has to catch instead.
 */
async function frameAt(address: string, reading: NewVersionReading | null): Promise<string> {
  const handler = createStaticHandler(ROUTES);
  const context = await handler.query(new Request(new URL(address, 'http://localhost/').href));
  assert.ok(!(context instanceof Response), `${address} produced a bare response rather than a screen`);

  const router = createStaticRouter(ROUTES, context as never);
  const screen = createElement(StaticRouterProvider, { router, context: context as never });
  const withSeam =
    reading === null
      ? screen
      : createElement(NewVersionProvider, { reading, take: () => {}, children: screen });

  return renderToStaticMarkup(
    createElement(LocalStoreProvider, {
      opening: STILL_OPENING,
      children: createElement(PlatformStatusProvider, {
        status: {
          buildStamp: 'new-version-notice',
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
                  children: withSeam,
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  );
}

describe('the line the coach actually reads', () => {
  it('is painted in the frame, with the control beside it, when a version is waiting', async () => {
    const html = await frameAt('/calendar', A_NEW_VERSION_IS_WAITING);
    const words = painted(html);

    assert.ok(
      words.includes(NEW_VERSION_SENTENCE),
      `the sentence never reached the screen. What was painted: ${words.slice(0, 300)}`,
    );
    assert.ok(words.includes(TAKE_THE_NEW_VERSION), 'the control carries no words he can read');
    assert.match(html, /<button[^>]*>Update now<\/button>/, 'the control is a real button');
  });

  it('is in the FRAME rather than on a screen, so it is on every address', async () => {
    for (const address of ['/calendar', '/clients', '/admin', '/routines', '/diet']) {
      const words = painted(await frameAt(address, A_NEW_VERSION_IS_WAITING));
      assert.ok(words.includes(NEW_VERSION_SENTENCE), `nothing was said at ${address}`);
    }
  });
});

describe('it appears only when a version is actually waiting', () => {
  it('says nothing when none is', async () => {
    const quiet = painted(await frameAt('/calendar', NO_NEW_VERSION_WAITING));
    assert.ok(!quiet.includes(NEW_VERSION_SENTENCE));
    assert.ok(!quiet.includes(TAKE_THE_NEW_VERSION));

    // POSITIVE CONTROL: the same address, the same frame, the one field flipped.
    const waiting = painted(await frameAt('/calendar', A_NEW_VERSION_IS_WAITING));
    assert.ok(
      waiting.includes(NEW_VERSION_SENTENCE),
      'the frame cannot paint the line at all, so its absence proved nothing',
    );
  });

  it('says nothing when the seam was never wired, rather than taking the frame down', async () => {
    const unwired = await frameAt('/calendar', null);

    // The frame itself must survive: this is the case a throwing hook would have turned into a blank
    // screen, and a blank screen tells the coach nothing at all.
    assert.match(unwired, /class="app"/, 'THE FRAME WENT DOWN WITH THE MISSING SEAM');
    assert.match(unwired, /class="sync"/, 'and the permanent accountability indicator went with it');
    assert.ok(!painted(unwired).includes(NEW_VERSION_SENTENCE));

    // POSITIVE CONTROL: the identical tree with the provider put back.
    const wired = painted(await frameAt('/calendar', A_NEW_VERSION_IS_WAITING));
    assert.ok(wired.includes(NEW_VERSION_SENTENCE), 'the provider is the ONLY difference between these');
  });
});

describe('it never interrupts a session in progress', () => {
  it('is absent at the runner with a session open, with a version waiting', async () => {
    const inSession = painted(await frameAt(A_LIVE_SESSION, A_NEW_VERSION_IS_WAITING));

    assert.ok(
      !inSession.includes(NEW_VERSION_SENTENCE),
      'THE APPLICATION INTERRUPTED A SESSION TO TALK ABOUT ITSELF',
    );
    assert.ok(!inSession.includes(TAKE_THE_NEW_VERSION));

    // NON-VACUITY, TWO WAYS. The session screen really did render — so the silence is the guard and
    // not a screen that failed to draw...
    assert.match(await frameAt(A_LIVE_SESSION, A_NEW_VERSION_IS_WAITING), /class="content-body"/);
    // ...and the identical reading DOES speak the moment he is anywhere else.
    const elsewhere = painted(await frameAt('/calendar', A_NEW_VERSION_IS_WAITING));
    assert.ok(elsewhere.includes(NEW_VERSION_SENTENCE), 'the reading itself produces no line');
  });

  it('is present at the runner with NO session open, which is not a session in progress', async () => {
    // That screen says "No session is open in this window". Being told about an update there costs
    // him nothing, and suppressing it would be the guard watching the address instead of the work.
    const words = painted(await frameAt(RUNNER_ADDRESS, A_NEW_VERSION_IS_WAITING));
    assert.ok(words.includes(NEW_VERSION_SENTENCE));
  });
});

describe('the wiring the missing throw was standing in for', () => {
  it('is really in the composition root, which is what makes the whole path exist', async () => {
    const app = await readFile(path.join(here, '..', 'App.tsx'), 'utf8');

    // THE ELEMENT, OPENED AND CLOSED, rather than the bare prefix. Measured while break-probing this
    // very assertion: `app.includes('<NewVersionProvider')` stays TRUE when the element is renamed to
    // `<NewVersionProviderXX>`, because the old name is a prefix of the new one. A wiring check that
    // survives the wiring being renamed is a check on a spelling, not on the wiring.
    assert.ok(
      app.includes('<NewVersionProvider ') && app.includes('</NewVersionProvider>'),
      'THE UPDATE PATH IS NOT WIRED IN App.tsx: the line can never appear and nothing else is red',
    );
    assert.ok(
      app.includes('startOfflineSupport(import.meta.env.BASE_URL, ()'),
      'THE WATCH IS NOT ARMED in App.tsx: nothing can ever move the reading off "no update waiting"',
    );

    // NON-VACUITY: this reader must be able to find something it certainly should.
    assert.ok(
      app.includes('<RouterProvider'),
      'THE READER IS BROKEN: it cannot find the router in the composition root either',
    );
  });

  it('is really drawn by the frame, on every address rather than by one screen', async () => {
    const frame = await readFile(path.join(here, 'AppFrame.tsx'), 'utf8');

    assert.ok(frame.includes('<NewVersionNotice />'), 'THE FRAME NO LONGER DRAWS THE UPDATE LINE');
    assert.ok(frame.includes('<SyncIndicator />'), 'THE READER IS BROKEN: the indicator is gone too');
  });
});
