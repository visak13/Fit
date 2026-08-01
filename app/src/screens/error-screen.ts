/**
 * THE WORDS FOR A SCREEN THAT STOPPED PART-WAY THROUGH — and the reasoning behind each of them.
 *
 * Until this file existed, an unhandled render or loader error put REACT-ROUTER'S OWN default
 * boundary in front of the coach. That is not a development-only screen here, and the claim was
 * MEASURED in the production bundle rather than reasoned about: the default boundary's developer
 * fragment is assigned UNCONDITIONALLY — the development guard did not survive minification as a
 * branch — and the router picks the boundary with `route.errorElement || <the default>`. With no
 * route declaring one, a coach met "Unexpected Application Error!", a sentence addressed to a
 * developer, and A RAW JAVASCRIPT STACK TRACE, on the screen he was trying to work on.
 *
 * ## THIS FILE IS THE JUDGEMENTS; `ErrorScreen.tsx` ONLY DRAWS
 *
 * The same split as `screens/removals.ts` against `screens/RemovalsScreen.tsx`, and here it is
 * load-bearing rather than tidy: the sentences below make CHECKABLE CLAIMS ABOUT THE STATE A
 * FAILURE LEFT BEHIND, and a claim written into markup is a claim nothing can assert. The test
 * runner is `node --test` over `.ts`.
 *
 * ## THE AFTERMATH RULE, WHICH THIS SCREEN IS THE MOST LIKELY PLACE IN THE BUILD TO BREAK
 *
 * A sentence about a failure makes a separately checkable claim about the state the failure left
 * behind. This build has shipped that defect twice — two refusal sentences told the coach a refused
 * save had ERASED something, and it hid because it is true on a fresh device, the state everyone
 * tests in. So the two aftermath sentences here are written as narrowly as they can be, and each is
 * paired with the way it is proven:
 *
 *   - {@link WHAT_IS_STILL_HERE} claims that what was already saved is still in the local store.
 *     PROVEN by inducing a real unhandled error on a reachable path and READING THE STORE BACK
 *     afterwards, rather than asserted because it is usually true. See `error-screen.test.ts`.
 *   - {@link WHAT_WAS_NOT_SAVED} is the half a reassuring screen would leave out. A screen that
 *     stopped drawing took whatever the coach had typed into it and not yet saved with it, and
 *     saying only the comfortable half would be the same defect wearing a friendlier face.
 *
 * NOTHING FROM THE THROWN VALUE IS WORDED HERE, AND THAT IS DELIBERATE. An error's MESSAGE is the
 * one string in an offline application whose contents nobody controls — a store error can quote the
 * row it choked on, and that row is the coach's client. `s17/r3` measured the subtler version of the
 * same leak: even the exception's CLASS leaked, because `constructor` is an ordinary property lookup
 * that an own property shadows, so a parsed object carrying its own `constructor.name` published a
 * planted client name verbatim. The safe amount of the thrown value to put on screen is NONE of it.
 * `ErrorScreen.tsx` logs it to the console instead, where the failure path is on record and the
 * coach never reads it.
 *
 * ## WHY THE WAY ONWARD IS DERIVED AND NOT TYPED
 *
 * A dead end here is worse than the stack trace: the coach arrived because something already went
 * wrong, and a screen with no door is the failure this application's whole navigation rule exists to
 * prevent. The ways out are therefore MAPPED from `shell/navigation.ts` — the same list the rail and
 * the route table are built from — so a destination renamed or added cannot leave this screen
 * pointing at an address the application no longer answers to. Written ABSOLUTELY, for the reason
 * `NotFoundScreen.tsx` states in full: a relative target resolves against wherever the coach is, and
 * on a screen reached by failure that is the last place to resolve anything against.
 */

import { DESTINATIONS } from '../shell/navigation';
import type { Destination } from '../shell/navigation';

/** The heading's identifier, so a rendered check can find this screen and only this screen. */
export const ERROR_SCREEN_ID = 'screen-error';

/**
 * The heading. It says what happened to the SCREEN, not what is wrong with the application.
 *
 * "Unexpected Application Error" is a sentence about a program. This one is about the thing in front
 * of him: the page he asked for did not finish. A non-technical reader can act on the second.
 */
export const ERROR_TITLE = 'This screen stopped before it finished opening';

/**
 * What happened, in the plainest terms that are still true.
 *
 * It says the app stopped ON PURPOSE rather than that it crashed, because that is what a boundary
 * does, and half a screen is worse than none — a partly drawn screen is one a coach would act on.
 * And it says the fault is the application's, so that a person who has been told all his life that
 * he broke the computer does not go looking for what he did wrong.
 */
export const WHAT_HAPPENED =
  'Something went wrong inside this app while this screen was opening, so it stopped rather than '
  + 'show you half a screen. This is a fault in the app itself. It is not something you did, and it '
  + 'is not a problem with your device.';

/**
 * THE FIRST AFTERMATH CLAIM. Narrow on purpose, and proven by reading the store back.
 *
 * It claims one thing: what was already saved is still where this application keeps it. It does NOT
 * claim that nothing was lost, that everything is fine, or anything at all about the copy in the
 * backup — a screen that stopped knows nothing about any of those, and this application's recurring
 * defect is exactly the reassuring sentence nobody measured.
 */
export const WHAT_IS_STILL_HERE =
  'Your clients, routines, sessions and diets are still on this device. This app keeps them on the '
  + 'device itself, and a screen that stopped does not remove any of them.';

/**
 * THE SECOND AFTERMATH CLAIM — the uncomfortable half, and the reason this screen is honest.
 *
 * A screen that stops drawing takes its own unsaved state with it. Saying only the first sentence
 * would leave the coach believing a half-typed client had been kept, and he would find out it had
 * not at the worst possible moment: the next time he went looking for it.
 */
export const WHAT_WAS_NOT_SAVED =
  'Anything you were part-way through typing on this screen, and had not saved yet, is gone. '
  + 'Nothing that was already saved was changed.';

/**
 * What to do next, in the order a person would actually do it.
 *
 * The links come first because they always work; reloading is offered as ONE try rather than as the
 * fix, because the most likely cause — a record this screen could not read — is still there after a
 * reload and an instruction that fails twice teaches him to distrust the whole screen. The last
 * resort names a PERSON, which is this application's standing answer for a coach who cannot get
 * himself unstuck.
 */
export const WHAT_TO_DO =
  'Go to another part of the app using the links below — they work from here. Coming back to this '
  + 'screen may show this again; if it does, reloading the app is worth one try. If it says this a '
  + 'second time, read this screen out to whoever set the app up for you.';

/** One way out of here: where it goes and the words on it. */
export interface WayOnward {
  /** An ABSOLUTE address under the router's root. See the header for why never a relative one. */
  readonly to: string;
  /** The words on the link, which are the destination's own. */
  readonly label: string;
}

/**
 * Every way onward, mapped from the destination list rather than written out.
 *
 * `destinations` is a parameter so this can be asserted against a list that is not the shipped one —
 * a check that could only ever be run against the real five would pass identically over a mapping
 * that ignored its input.
 */
export function waysOnward(
  destinations: readonly Destination[] = DESTINATIONS,
): readonly WayOnward[] {
  return destinations.map((destination) => ({
    to: `/${destination.path}`,
    label: `Go to ${destination.label}`,
  }));
}
