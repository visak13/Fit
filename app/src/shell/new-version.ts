/**
 * WHAT THE COACH IS TOLD WHEN A NEWER VERSION OF THIS APPLICATION IS READY â€” the words, and the two
 * conditions that decide whether they are said at all. This module draws nothing and needs no browser.
 *
 * ## THE GAP THIS CLOSES, IN THE USER'S OWN TERMS
 *
 * The handover this whole application is built around is a loop: he gives it to the coach, the coach
 * uses it and tells him what to fix, he ships the fix. WITHOUT A WAY FOR A FIX TO REACH THE PHONE THAT
 * LOOP IS BROKEN BY CONSTRUCTION, and it is broken silently â€” measured by `s11/a1` on a real
 * persistent-profile browser with two genuinely different builds: a returning installed visitor ran the
 * PREVIOUS build for one to two full openings, was told nothing at any point, and the application
 * looked completely normal and completely unchanged throughout.
 *
 * `dist/sw.js` calling `skipWaiting()` and `clients.claim()` is why that is one to two openings rather
 * than forever-until-every-tab-closes. **THAT IS THE CEILING WORKING, NOT AN UPDATE PATH.** A mechanism
 * that bounds how long the old build can survive is not a mechanism that TELLS HIM, and the two are
 * easy to confuse when reading that file. The bar here is that he is told and that he can act.
 *
 * ## THE SCOPE IS FROZEN, AND THE FREEZE IS THE DESIGN
 *
 * A sentence and a control. NO release notes, NO version history, NO background checking that nags
 * him. Every one of those would be this application asking for his attention about ITSELF, and the
 * five destinations are the five places his work happens.
 *
 * ## TWO CONDITIONS, AND THE SECOND IS THE ONE WITH A DECISION BEHIND IT
 *
 * 1. **Only when one is actually waiting.** A line that is present and empty is a line he learns to
 *    read past, and he learns it about the whole frame rather than about that one line.
 * 2. **NEVER WHILE A SESSION IS IN PROGRESS.** `d39` is unconditional â€” no state of this application
 *    may stand between the coach and running a session â€” and a version banner appearing between a
 *    client's sets is the application becoming the driver instead of the support. The bias is
 *    deliberately toward SILENCE: the line is suppressed whenever he is at the runner with a session
 *    open, and the update is still there the moment he leaves. Nothing is lost by waiting; something
 *    real is lost by interrupting.
 *
 * The address and the query key are IMPORTED from `screens/runner.ts` rather than written out again.
 * A second spelling of where a session lives is how a guard ends up watching an address the
 * application stopped using, and it would fail in the safest-looking direction: silently stopping
 * guarding.
 *
 *     npm run test:shell
 */

import { OPEN_SESSION_KEY, RUNNER_ADDRESS } from '../screens/runner.ts';

/**
 * Whether a newer version of this application is ready to be taken.
 *
 * ONE BOOLEAN AND NOTHING ELSE, on purpose. A version number, a name or a date would each be a fact
 * the coach has no use for and this application would then have to keep true; `platform/offline-start.ts`
 * can honestly know only that the browser installed something newer than what this page is running.
 */
export interface NewVersionReading {
  readonly waiting: boolean;
}

/** What is true almost always, and what a source that has not seen an update supplies. */
export const NO_NEW_VERSION_WAITING: NewVersionReading = Object.freeze({ waiting: false });

/** What `platform/offline-start.ts` publishes when a newer build has arrived under a running page. */
export const A_NEW_VERSION_IS_WAITING: NewVersionReading = Object.freeze({ waiting: true });

/**
 * THE SENTENCE. Plain language for a non-technical reader, and that is the whole of the requirement.
 *
 * NOT "a new service worker is waiting", which is what the browser would call this and what the coach
 * has no reason to have ever heard of. It says nothing about his data, nothing about what is in the
 * newer version, and nothing about anything else â€” a sentence that made a claim about the update's
 * aftermath would owe a proof of that aftermath, and this one deliberately owes none.
 */
export const NEW_VERSION_SENTENCE = 'A newer version of this app is ready.';

/** The control, saying what it will do rather than "Reload" or "Retry". */
export const TAKE_THE_NEW_VERSION = 'Update now';

/** Where the coach is standing, as the only fact this decision needs about it. */
export interface WhereHeIs {
  /** He is at the session runner with a session open. */
  readonly runningASession: boolean;
}

/** The line to draw, or null when nothing is to be said. */
export interface NewVersionLine {
  readonly sentence: string;
  readonly control: string;
}

/**
 * Whether the address he is at is a session he is running.
 *
 * A PATH AND A NON-EMPTY KEY, both. The runner's address without an open session is the screen saying
 * "No session is open in this window", which is not a session in progress and is a perfectly ordinary
 * place to be told about an update.
 *
 * @param pathname the router's path, as `useLocation` reports it
 * @param search the query, with or without its leading question mark
 */
export function runningASession(pathname: string, search: string): boolean {
  if (pathname !== RUNNER_ADDRESS) return false;
  const open = new URLSearchParams(search).get(OPEN_SESSION_KEY);
  return open !== null && open !== '';
}

/**
 * What to say, or nothing.
 *
 * Both refusals return the same null, and that is correct rather than lossy: the coach is not owed a
 * different silence for "nothing is waiting" than for "not now, you are working". Neither says
 * anything, and a surface that is absent asserts nothing at all â€” which is why it is safe for this one
 * to be absent and would not be safe for a seam whose empty reading is worded as a fact.
 */
export function newVersionLine(
  reading: NewVersionReading,
  where: WhereHeIs,
): NewVersionLine | null {
  if (!reading.waiting) return null;
  if (where.runningASession) return null;
  return { sentence: NEW_VERSION_SENTENCE, control: TAKE_THE_NEW_VERSION };
}
