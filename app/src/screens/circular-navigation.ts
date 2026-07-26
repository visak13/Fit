/**
 * THE LOOP BETWEEN A CLIENT AND A SESSION — both ends of it, in one module, and the reason that is
 * one module rather than two.
 *
 * The standing requirement is that navigation is CIRCULAR: the coach moves to and fro between
 * related parts of the application rather than reaching a place he can only leave by going back to
 * the start. The first real loop this application has is the one the product is about — a client
 * leads to starting a session with them, and a session leads back to the people in it.
 *
 * Both ends are here because a loop with its two halves written in two files is a loop that breaks
 * in one direction only, silently, the first time somebody edits one of them. `shell/navigation.ts`
 * learned this already and says so: "a second spelling in the linking markup is how a link ends up
 * pointing at an address the table does not answer to". The addresses, the query keys, the words on
 * both links and the words on both arrivals are spelled ONCE, here, and the two screens read them.
 *
 * ## WHY THIS DOES NOT USE THE CONTEXTUAL TRAIL, WHICH IS THE OBVIOUS THING TO REACH FOR
 *
 * `shell/trail.ts` is the second navigation layer and it exists for exactly this kind of to-and-fro.
 * It refuses this one, deliberately and correctly: `namesADestination` drops any crumb or way back
 * that points at a destination, because two layers that both carry "Clients" disagree about where
 * the coach is and the active state starts lying.
 *
 * TODAY BOTH ENDS OF THIS LOOP **ARE** DESTINATIONS. A client is a row on the Clients screen and a
 * session is a row on the Calendar screen; neither has an address of its own. So there is nothing
 * CONTEXTUAL to put in the contextual layer — the trail is not being avoided, it has no case here
 * yet. Its first real case is the session's own screen, which genuinely sits inside a destination
 * rather than being one.
 *
 * A NOTE FOR WHOEVER BUILDS THAT SCREEN, because it is a trap rather than an observation:
 * `routeSegments` splits on a slash, so a destination carrying a query — `calendar?with=x` — is ONE
 * segment that is not equal to `calendar`, and it therefore slips past `namesADestination` without
 * being recognised as a destination at all. Nothing exploits that today and this module does not:
 * it declares NO trail, and the two links below are plain links. But a trail declared on a
 * parameterised destination would pass a rule it is not honouring, and the guard would go on looking
 * like it holds. Whoever changes that rule should be changing it deliberately, with the question
 * "may a parameterised destination be contextual?" actually decided — not as a side effect of
 * needing a link to work.
 *
 * ## WHAT IS CARRIED IN AN ADDRESS, AND WHAT DELIBERATELY IS NOT
 *
 * A record identity, and nothing else. Never a NAME: an address is the one part of this application
 * that gets bookmarked, restored from a home screen and read over somebody's shoulder, and a client's
 * name in it would be the one piece of their data this app puts somewhere it did not have to. The
 * identity means nothing to anyone who does not already have the store it belongs to.
 */

import type { Selection } from './launcher';
import { NOTHING_CHOSEN } from './launcher';

// ═══════════════════════════════════════════════════════════════════════════════
// The two addresses
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The query key the calendar reads to find out who the coach arrived intending to train.
 *
 * A QUERY rather than a path segment, because this is not a different place: it is the calendar,
 * with one answer already filled in. A path segment would be a second address for one screen, and
 * `no-dead-ends.test.ts` would then be holding two routes where the application has one.
 */
export const WITH_CLIENT_KEY = 'with';

/** The query key the register reads to find out which person the coach came back about. */
export const ABOUT_CLIENT_KEY = 'person';

/** Where "start a session with this person" goes. Spelled once; both directions read it from here. */
export function calendarWithClient(clientId: string): string {
  return `/calendar?${WITH_CLIENT_KEY}=${encodeURIComponent(clientId)}`;
}

/** Where a person's name on a session row goes. */
export function registerAboutClient(clientId: string): string {
  return `/clients?${ABOUT_CLIENT_KEY}=${encodeURIComponent(clientId)}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Client → session
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * What the control on a person's row says.
 *
 * IT NAMES THE PERSON. A row of identical "Start a session" buttons is a row where the one he means
 * is told apart by counting downwards, and the accessible name of every one of them would be the
 * same sentence — which is what a screen reader would read out, over and over, with nothing to
 * distinguish them.
 */
export function startSessionLabel(name: string): string {
  return `Start a session with ${name}`;
}

/**
 * The calendar's own selection, with the person he arrived about already chosen.
 *
 * NOTHING ELSE IS CHOSEN. The routine and the place are still his to answer, and pre-answering
 * either would be the application deciding: a session held in a room would go on record as a call
 * on the strength of a default nobody chose.
 *
 * @param clientId the identity from the address, or null when he arrived at the calendar plainly
 */
export function selectionArrivingWith(clientId: string | null): Selection {
  if (clientId === null || clientId.trim().length === 0) return NOTHING_CHOSEN;
  return { ...NOTHING_CHOSEN, clientIds: Object.freeze([clientId]) as readonly string[] };
}

/** What the calendar says about a person it chose on his behalf. */
export interface ArrivedWithNotice {
  /** False when he arrived plainly, in which case the calendar says nothing about any of this. */
  readonly present: boolean;
  /** Who was chosen for him, by name. Null while the register has not been read back yet. */
  readonly words: string | null;
  /** How he undoes it, said as a thing he can do rather than as a warning. */
  readonly howToChange: string;
}

/**
 * WHAT HE IS TOLD WHEN THE CALENDAR CHOSE SOMEBODY FOR HIM, AND WHY HE IS TOLD ANYTHING AT ALL.
 *
 * A screen that arrives with a choice already made and says nothing about it is a screen that has
 * decided. He may have tapped the wrong row — the rows on the register are a list of names and the
 * one below the one he wanted is one thumb-width away — and the version of this that costs him
 * something is the one where he does not notice until the session is running under the wrong name.
 *
 * So it is SAID, and it is said as a starting point rather than as a state: the same toggle he would
 * have used to choose is sitting there, already able to unchoose. There is no separate "clear"
 * control, because a second way to undo something that already has one is a second thing to find.
 *
 * @param name the person's name, or null if the register has not been read back yet
 */
export function describeArrivedWith(clientId: string | null, name: string | null): ArrivedWithNotice {
  if (clientId === null || clientId.trim().length === 0) {
    return { present: false, words: null, howToChange: '' };
  }

  return {
    present: true,
    words:
      name === null
        ? 'You came here to start a session with somebody from your register, and they are already '
          + 'chosen below.'
        : `${name} is already chosen, because that is who you came here to train.`,
    howToChange:
      'Press their name below to unchoose them, and choose anybody else the same way. Nothing else '
      + 'has been chosen for you.',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Session → client
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * What a person's name on a session row says when it is a link.
 *
 * The visible words are the NAME, because that is what he is reading the row for. This is the
 * accessible name, which has to say where the link goes: a screen reader announcing four links
 * called "Priya", "Rekha", "Anil" and "Sunil" has not said that any of them is a link to anywhere.
 */
export function aboutClientDescription(name: string): string {
  return `${name} on your register`;
}

/** What the register says about a person it was sent to find. */
export interface ArrivedAboutNotice {
  /** False when he arrived at the register plainly. */
  readonly present: boolean;
  /** The sentence naming who he came about, or the honest one for when they are not on this page. */
  readonly words: string;
  /** The chip on their row, or null when they are not among the rows shown. */
  readonly markWords: string | null;
}

/** The words on the row of the person he came back about. Short: it sits beside a name. */
export const CAME_ABOUT_MARK = 'The person you came about';

/**
 * WHAT THE REGISTER SAYS WHEN IT WAS SENT TO FIND SOMEBODY, INCLUDING WHEN IT CANNOT.
 *
 * The register is PAGED — twenty-five at a time, in name order — so a person reached from a session
 * may well not be among the rows on screen, and a coach with two hundred clients will meet that case
 * often. The comfortable thing would be to say nothing in that case and let him wonder why the link
 * appeared to do nothing. The honest thing is to say they are further down and name the control that
 * fetches more, which is what this does.
 *
 * IT DOES NOT FILTER THE REGISTER DOWN TO ONE PERSON. He arrived from a session, not from a search,
 * and a register that silently showed one row would look like a register that had lost everybody
 * else — the same false-nought shape this application refuses everywhere it counts something.
 *
 * @param clientId the identity from the address, or null when he arrived plainly
 * @param name their name if they are among the rows shown, otherwise null
 */
export function describeArrivedAbout(clientId: string | null, name: string | null): ArrivedAboutNotice {
  if (clientId === null || clientId.trim().length === 0) {
    return { present: false, words: '', markWords: null };
  }

  if (name === null) {
    return {
      present: true,
      words:
        'You came here about somebody in that session, and they are not among the people shown yet. '
        + 'Your register is shown a page at a time in name order — show more of it to reach them.',
      markWords: null,
    };
  }

  return {
    present: true,
    words: `${name} is marked below. They were in the session you came from.`,
    markWords: CAME_ABOUT_MARK,
  };
}
