/**
 * THE ONE GOOGLE CONNECTION THIS TAB HAS, AND THE MINTING THAT USES IT.
 *
 * `google-identity.ts` describes a connection and `google-meet.ts` describes minting; neither
 * decides where the single instance of either lives, and both take everything they need as injected
 * functions. This file is where the instances actually are.
 *
 * ## ONE CONNECTION PER TAB, AND WHY THAT IS NOT AN OPTIMISATION
 *
 * The connection HOLDS THE ACCESS TOKEN, in memory, for as long as the tab lives. A second instance
 * would hold a second token — so the screen that mints a link would be asking Google for a token
 * that the screen that syncs to Drive cannot see, and the coach would meet two consent popups an
 * hour instead of one. Worse, `GoogleConnection` builds the identity library's token client once and
 * re-points its callbacks, because the library treats a fresh client as a fresh grant: two instances
 * would put him through the FULL consent screen rather than a moment's reconnect.
 *
 * So there is one, it is built on first use rather than at module scope, and everything that needs a
 * token asks this file for it.
 *
 * ## NOTHING HERE RUNS AT IMPORT
 *
 * The identity library is a script that arrives when it arrives, the settings live in a storage a
 * browser may refuse, and this module is imported by a suite that has neither. Every global is
 * reached inside a function, on the way to answering something somebody asked.
 *
 *     npm run test:shell
 */

import { GoogleConnection } from './google-identity.ts';
import type { GoogleIdentityLike } from './google-identity.ts';
import { GoogleMeetLinks } from './google-meet.ts';
import { browserSettings, coachingCalendarId, googleClientId } from './google-settings.ts';

/** Everything this tab's Google access is made of. */
export interface GoogleOnThisDevice {
  readonly connection: GoogleConnection;
  readonly meet: GoogleMeetLinks;
}

let built: GoogleOnThisDevice | null = null;

/**
 * The identity library, or null while the script has not arrived.
 *
 * Read through `unknown` rather than declared as a global, so no part of this application depends on
 * a type it does not own. Null is the ORDINARY state on a device that is offline, and it becomes the
 * `identity-unavailable` refusal with its own sentence rather than an exception.
 */
function identityLibrary(global: typeof globalThis): GoogleIdentityLike | null {
  const google = (global as unknown as { google?: { accounts?: { oauth2?: unknown } } }).google;
  const oauth2 = google?.accounts?.oauth2;
  return oauth2 === undefined || oauth2 === null ? null : oauth2 as GoogleIdentityLike;
}

/**
 * This tab's Google connection and its minting, built once.
 *
 * The settings are read on EVERY call rather than captured at construction, because the coach may
 * enter his client id or his coaching calendar while the application is open — and a value captured
 * once would mean the setting he just saved does nothing until he reloads, which reads as the setup
 * page not having worked.
 */
export function googleOnThisDevice(global: typeof globalThis = globalThis): GoogleOnThisDevice {
  if (built !== null) return built;

  const storage = browserSettings(global);
  const connection = new GoogleConnection({
    identity: () => identityLibrary(global),
    clientId: () => googleClientId(storage),
    storage,
  });

  built = {
    connection,
    meet: new GoogleMeetLinks({
      // THE ONLY TOKEN PATH. Minting does not acquire, renew or know how a token is obtained; the
      // tap that starts the session is where the acquisition happens, and this reads what it left.
      token: () => connection.tokenForRequest(),
      coachingCalendarId: () => coachingCalendarId(storage),
    }),
  };
  return built;
}

/**
 * Forget the built instance. FOR A SUITE, and named so that is obvious at the call site.
 *
 * Nothing in the application calls this: a tab has one connection for its whole life, and dropping
 * it mid-session would silently throw away a live token and send the coach back through a consent
 * screen he had already cleared.
 */
export function forgetGoogleForTesting(): void {
  built = null;
}
