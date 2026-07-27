/**
 * THE COMPOSITION ROOT — and it is the only file in the application that decides where the coach's data
 * is sent.
 *
 * This file used to be the application as well as its start. It is now three decisions and a render:
 * load the visual foundation first, choose the real backup, open the real local store, mount
 * {@link Application}. Everything about what the interface DOES lives in `App.tsx` beside it.
 *
 * ## WHY THE SPLIT WAS WORTH TAKING
 *
 * While the component and the render call lived together, importing the application MOUNTED it. There
 * was therefore exactly one possible root, and every dependency choice was implicit in there being no
 * alternative — which reads as safety and is not: nothing named the choices, so nothing could be checked
 * against them. Now they are arguments, made once, here.
 *
 * THAT IS NOT AN ESCAPE HATCH AND IT MUST NOT BECOME ONE. Both values below are supplied
 * UNCONDITIONALLY: no branch, no environment check, no flag, nothing this file could be talked into
 * pointing somewhere else. A production module that could select a different backup destination would be
 * a worse defect than any this application has had, and it would be live in a public bundle. Injecting at
 * a composition root is the opposite of that, and it is the pattern this tree already chose —
 * `OpeningLocalStore` takes `open` for exactly this reason.
 */

// FIRST, AND ON PURPOSE. This one import is the whole visual foundation: the shared token layer
// from its single home under `design/tokens`, then Console's own structural roles. It is imported
// before anything that renders, so no component can load a style of its own ahead of the layer it
// is supposed to be built from. See `src/design/design-system.ts` for why the layer is consumed
// where it lives rather than copied in.
import './design/design-system';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Application } from './App';
import { OpeningLocalStore } from './platform/LocalStore';
import { backupOnThisDevice } from './platform/drive-on-this-device';
import { openTheLocalStore } from './platform/local-store';

const ROOT_ELEMENT_ID = 'root';

const rootElement = document.getElementById(ROOT_ELEMENT_ID);
if (rootElement === null) {
  throw new Error(`the application cannot start: no #${ROOT_ELEMENT_ID} element in the document`);
}

/*
  WHERE THE COACH'S DATA IS ACTUALLY SENT — decided once, here, and nowhere else.

  The real Google Drive copy, on the one access token this tab has, plus the credential and the act of
  connecting. `platform/drive-on-this-device.ts` is the only place in the interface where "a remote" and
  "Google" meet; everything above it runs against a remote and does not know a provider exists.
*/
const THE_BACKUP = backupOnThisDevice(window);

/*
  THE LOCAL STORE, OPENED FOR THE FIRST TIME IN THIS APPLICATION.

  It wraps the whole application rather than sitting among the seams, because it is the SOURCE all five
  of them are fed from.

  It is opened AFTER MOUNT and its state is a VALUE, not a promise anything waits on: `opening`, `open`,
  and `could not be opened` carrying a sentence saying why. That is the same rule the platform requests
  in `App.tsx` follow — the application always opens and always works, and a database that refuses is a
  condition to REPORT, never a blank screen, never an error at start, and never a spinner that does not
  resolve. `platform/local-store.ts` holds every word of every refusal.

  `openTheLocalStore` is passed in rather than reached for, and it is a module-level function so the
  reference is stable: the store is opened once, not on every render.

  THE SHIPPED LIBRARY IS SEEDED INSIDE THAT OPENING, and this is the one line saying so at the top of
  the application. `OpeningLocalStore` wraps `openTheLocalStore` in `seedingAfterOpening`, so a fresh
  device has its exercises and routines before any screen is told the store is open — see
  `platform/library-seeding.ts` for why first-open and not here at bootstrap, and for why a seeding
  that fails is a condition with its own words rather than a store that would not open.
*/
createRoot(rootElement).render(
  <StrictMode>
    <OpeningLocalStore open={openTheLocalStore}>
      <Application backup={THE_BACKUP} />
    </OpeningLocalStore>
  </StrictMode>,
);
