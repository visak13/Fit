/**
 * THE WAY OUT IS REALLY ON THE SCREEN — and it is really absent everywhere it could not honour itself.
 *
 * ## Why this file exists, which is the whole argument for the hook that does not throw
 *
 * `useAccountActionsIfWired` deliberately does NOT throw outside its provider, unlike every seam hook
 * in this application, and `account-actions.tsx` gives the reason: a missing READING is filled by a
 * default and the state a default invents is always the reassuring one, so a seam must be loud —
 * whereas a missing CONTROL is honestly drawn as no control, and a hook that threw here would take
 * the WHOLE ADMIN SCREEN down, along with the five cards that report conditions he may urgently need.
 *
 * THAT TRADE HAS A COST AND THIS FILE IS THE GUARD ON IT. The throw was standing in for a check: if
 * the provider were ever missing in the APPLICATION, the coach would silently lose his only way to
 * sign out — which is precisely the defect s9 exists to close, arriving back through a different
 * door, with nothing red anywhere. A provider gap fails at RUNTIME, not at compile time, so typecheck
 * would stay green straight through it.
 *
 * ## AND THE ABSENCE HALF IS PAIRED, EVERY TIME
 *
 * "The control is not drawn" is the easiest assertion in this codebase to pass VACUOUSLY: it passes
 * just as happily when the admin screen failed to render at all for an unrelated reason. So every
 * absence here is paired with a POSITIVE CONTROL in the same test — the same tree, ONE thing changed,
 * and the control appearing.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { AdminScreen } from '../screens/AdminScreen.tsx';
import {
  ERASE_LABEL, SIGN_OUT_CARD_TITLE, SIGN_OUT_LABEL,
} from '../screens/admin-report.ts';
import type { AccountActOutcome } from '../screens/admin-report.ts';
import { LocalStoreProvider } from '../platform/LocalStore.tsx';
import { PlatformStatusProvider } from '../platform/platform-status.tsx';
import { AccountActionsProvider, NO_ACCOUNT_ACTIONS } from './account-actions.tsx';
import type { AccountActions } from './account-actions.tsx';
import { DivergenceProvider, NOTHING_TO_DECIDE } from './Divergences.tsx';
import { KeyMaterialProvider, NO_KEY_MATERIAL_CONDITION } from './KeyMaterial.tsx';
import { NOTHING_AWAITING_REMOVAL, RemovalsProvider } from './Removals.tsx';
import { NOTHING_STOPPED, StoppedChangesProvider } from './StoppedChanges.tsx';
import { NO_BACKUP_YET, SyncStatusProvider } from './SyncStatus.tsx';
import { DESTINATIONS } from './navigation.ts';
import type { Destination } from './navigation.ts';

/**
 * The admin destination, from the navigation surface itself rather than hand-written here.
 *
 * A `Destination` typed out in this file would be a second opinion about what admin is called and
 * where it lives, and it would go on passing after the real one moved.
 */
const ADMIN: Destination = (() => {
  const found = DESTINATIONS.find((destination) => destination.path === 'admin');
  if (found === undefined) throw new Error('there is no admin destination to render');
  return found;
})();

/** The acts, with whatever this test is about changed. */
function acting(over: Partial<AccountActions> = {}): AccountActions {
  return { ...NO_ACCOUNT_ACTIONS, ...over };
}

/**
 * The admin screen, inside the providers `App.tsx` wires around it.
 *
 * The store is provided in its `opening` state, as `no-dead-ends.test.ts` does and for the same
 * reason: it is the state every screen must render in, and it needs no database.
 */
function paint(actions: AccountActions | null): string {
  const screen = createElement(AdminScreen, { destination: ADMIN });
  const withActs: ReactNode = actions === null
    ? screen
    : createElement(AccountActionsProvider, { actions, children: screen });

  return renderToStaticMarkup(
    createElement(LocalStoreProvider, {
      opening: { state: 'opening' },
      children: createElement(PlatformStatusProvider, {
        status: { buildStamp: 'test-build', persistence: null, offlineStart: { registered: true, reason: null } },
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
                  // The screen's `Link`s need a router around them, and nothing else does.
                  children: createElement(MemoryRouter, { children: withActs }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as never),
  );
}

describe('the coach can reach both acts from the admin screen', () => {
  it('DRAWS BOTH CONTROLS, separately labelled, when the acts are supplied', () => {
    const html = paint(acting());

    assert.match(html, new RegExp(SIGN_OUT_CARD_TITLE), 'the card is not on the screen');
    assert.match(html, new RegExp(SIGN_OUT_LABEL), 'there is no way to sign out');
    assert.match(html, new RegExp(ERASE_LABEL), 'there is no way to sign out and erase');

    // SEPARATELY LABELLED IS THE POINT, not that two buttons exist. The destructive one says what it
    // destroys IN ITS LABEL; if the two ever read the same, the coach is choosing blind.
    assert.notEqual(SIGN_OUT_LABEL, ERASE_LABEL);
    assert.ok(
      ERASE_LABEL.includes('erase'),
      'the destructive control stopped naming what it does. It is the label he reads before he '
        + 'presses, not after.',
    );
  });

  it('draws NEITHER when nothing supplied them — paired with the case above', () => {
    const without = paint(null);
    const with_ = paint(acting());

    assert.doesNotMatch(without, new RegExp(SIGN_OUT_CARD_TITLE));
    // NON-VACUITY. The unwired render must still be a real admin screen, or the absence above is the
    // output of a screen that did not render at all — which is the same failure this file exists to
    // catch, moved into the test.
    assert.match(without, /This build/u, 'the unwired render is not an admin screen at all');
    assert.match(with_, new RegExp(SIGN_OUT_CARD_TITLE), 'the ONLY difference is the provider');
  });
});

describe('the erase control appears only where the gate would let it act', () => {
  /** Work queued and still being retried: the gate's `wait`, where there is no way past. */
  const STILL_RETRYING = acting({
    // WRITTEN OUT RATHER THAN SPREAD FROM `NO_ACCOUNT_ACTIONS`, and `status` is why: the figures are
    // a union now, and this fixture has to say which member it is. `read` is load-bearing — the gate
    // refuses a reading nobody took, so a fixture left at `not_yet` would be exercising the unread
    // state rather than the wait this test is about.
    figures: {
      status: 'read',
      pending: 2,
      waiting_for_credential: 0,
      rejected: 0,
      ambiguous: 0,
      oldest_undelivered_label: 'a session with Test Client Ben',
      oldest_undelivered_age_ms: 5 * 60_000,
      reason: null,
    },
  });

  it('offers no button at all while work is still being retried, and says what is outstanding', () => {
    const html = paint(STILL_RETRYING);

    // The card and both openers are still there — he must be able to READ why he cannot.
    assert.match(html, new RegExp(SIGN_OUT_CARD_TITLE));
    assert.match(html, new RegExp(ERASE_LABEL));
    // The refusal itself is behind the panel he opens, which a static render cannot press. What is
    // asserted without a browser is that the words exist and say both halves — `admin-report.test.ts`
    // does that directly, over the same function this screen calls.
    assert.doesNotMatch(
      html,
      /Erase everything on this device/u,
      'the confirm button was drawn before he had even opened the panel',
    );
  });

  it('never draws the confirm button on a first render, however clear the device is', () => {
    // The panel is closed until he asks, so the destructive words cannot be one stray tap away on a
    // screen he came to for the storage figure.
    assert.doesNotMatch(paint(acting()), /Erase everything on this device/u);
  });
});

describe('what the last act did is reported on the card', () => {
  it('says he is signed out, once he is', () => {
    const outcome: AccountActOutcome = { act: 'sign-out', result: 'signed-out', revokedAtGoogle: true };
    const html = paint(acting({ last: outcome }));

    assert.match(html, /signed out of Google on this device/u);
  });

  it('reports an erase that could not run, and keeps the machine\'s own words apart', () => {
    const said = 'Another window or tab still has this app open, so its storage could not be deleted.';
    const html = paint(acting({ last: { act: 'erase', result: 'failed', verbatim: said } }));

    assert.match(html, /This device was not erased/u);
    assert.match(html, /Another window or tab/u, 'the one platform sentence he can act on is shown');
    // Drawn as evidence in its own muted line rather than spliced into prose — see `admin-report.ts`.
    assert.match(html, /class="muted"/u);
  });

  it('says nothing at all before he has pressed anything', () => {
    const html = paint(acting());
    assert.doesNotMatch(html, /signed out of Google on this device/u);
    assert.doesNotMatch(html, /This device was not erased/u);
  });
});
