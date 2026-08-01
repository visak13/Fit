/**
 * WHICH VALUE HAS ACTUALLY BEEN PROVEN TO WORK — remembered as the VALUE, never as a flag.
 *
 * `google-settings.ts` holds the two things the coach tells this application about Google, and
 * `screens/setup.ts` words the three states one of those settings can be in: nothing entered, entered
 * but never actually used, and proven. That module takes `proven` as EVIDENCE IT IS HANDED and
 * deliberately finds nothing out for itself. This file is where the evidence comes from.
 *
 * ## THE ONE DECISION THIS FILE EXISTS TO MAKE, AND IT IS NOT THE OBVIOUS ONE
 *
 * The obvious shape is a boolean: sign-in worked, write `proven: true`. IT IS WRONG, AND THE CASE IT
 * IS WRONG IN IS THE CASE THE THREE STATES WERE INVENTED FOR. A client id from the wrong Cloud
 * project has a perfect shape and fails at the moment he signs in in front of somebody; a boolean
 * SURVIVES HIM CHANGING THE SETTING, so the id he pasted this morning inherits the proof the previous
 * one earned and the screen tells him it is the right one on the strength of a value that is gone.
 *
 * SO WHAT IS REMEMBERED IS THE VALUE THAT WAS PROVEN, and the state is DERIVED by comparing it with
 * what is saved now — {@link hasBeenProven}. A flag can drift from the thing it describes because it
 * is a second fact about it; a value cannot drift from itself. Change the id and the standing falls
 * back to "entered but never used" with nothing anywhere needing to be told, and no reset to forget.
 *
 * DO NOT "SIMPLIFY" THIS INTO A BOOLEAN. It reads as one indirection too many right up until the
 * evening it is the difference between a coach believing his setup works and knowing it does not.
 *
 * ## A FAILURE IS NOT A DISPROOF, SO NOTHING HERE IS EVER CLEARED BY ONE
 *
 * There is only a writer for SUCCESS. The access token lives about an hour, there is no refresh
 * token, and a flat network, a closed Google window or a declined consent are all ordinary things
 * that happen on a phone. Retiring a proof on a transient failure would tell him his working setup
 * had broken at the moment he could least check it. A proof is retired by ONE thing: the saved value
 * ceasing to be the proven value.
 *
 * ## THE VALUE PROVEN IS THE VALUE THE ATTEMPT ACTUALLY USED
 *
 * Both writers are handed the id BY THE CALL THAT USED IT, captured when the request was formed —
 * never re-read from storage when the answer comes back. A sign-in takes as long as a person takes to
 * read a consent screen, and he can edit the box while it is in flight: a storage read at that moment
 * would stamp the NEW id as proven on the strength of the OLD id's success, which is precisely the
 * drift the value-not-flag design above exists to prevent, arriving through the one seam it does not
 * cover by itself.
 *
 * ## BOTH NAMES ARE SWEPT BY THE ERASE
 *
 * They are in `SMALL_FACT_KEYS`, and it is not a formality: a proof left behind on somebody else's
 * computer says this account was set up here and that it worked. `erasure-completeness.test.ts` holds
 * every `fit.` name in the tree to being swept or stated not to be storage.
 *
 *     npm run test:shell
 */

import { readSetting, writeSetting } from './google-settings.ts';
import { COACHING_CALENDAR_KEY, GOOGLE_CLIENT_ID_KEY } from './google-settings.ts';
import type { SmallFactStorage } from './google-identity.ts';

/**
 * The client id a sign-in has actually succeeded with on this device.
 *
 * Named beside the setting it is about rather than under a proofs-of-its-own namespace, so that the
 * pair is obvious to anybody reading the storage: the setting, and the value of it that worked.
 */
export const CLIENT_ID_PROVEN_KEY = 'fit.google-client-id.proven';

/** The coaching calendar a meeting link has actually been made on. */
export const COACHING_CALENDAR_PROVEN_KEY = 'fit.google-coaching-calendar.proven';

/**
 * WHICH PROOF BELONGS TO WHICH SETTING, held once so nothing pairs them by hand.
 *
 * The defect this closes is the one `setup.ts` binds each field to its own key to prevent, arriving
 * from the other side: a screen that read the calendar's proof against the client id's saved value
 * would report a state neither setting is in, and neither value would error.
 */
export const PROOF_KEY_FOR: Readonly<Record<string, string>> = Object.freeze({
  [GOOGLE_CLIENT_ID_KEY]: CLIENT_ID_PROVEN_KEY,
  [COACHING_CALENDAR_KEY]: COACHING_CALENDAR_PROVEN_KEY,
});

/**
 * Remember that THIS value worked. Called only from the place that watched it work.
 *
 * @param used the id the attempt actually used, captured when the request was formed
 * @returns whether this device kept it. A refusal costs him the statement, never the connection, so
 *   it is answered rather than thrown: a browser that will not remember is not a reason to fail a
 *   sign-in that has already succeeded.
 */
export function recordProvenValue(
  storage: SmallFactStorage | null,
  proofKey: string,
  used: string,
): boolean {
  const value = typeof used === 'string' ? used.trim() : '';
  // A blank would REMOVE the name — `writeSetting`'s own behaviour, and correct there. Here it would
  // mean "nothing has been proven", which is not what a successful attempt just demonstrated, so it
  // is refused rather than written.
  if (value.length === 0) return false;
  return writeSetting(storage, proofKey, value);
}

/** The value that was proven, or null when nothing has been. */
export function provenValue(storage: SmallFactStorage | null, proofKey: string): string | null {
  return readSetting(storage, proofKey);
}

/**
 * HAS THE VALUE HE HAS SAVED RIGHT NOW EVER ACTUALLY WORKED — the derivation, and the whole point.
 *
 * Not "has anything ever worked". A saved value that is not the proven one has never been used, and
 * that is true whether he corrected a typo, moved to a second Cloud project, or pasted something from
 * the wrong page that happens to be shaped right.
 *
 * @param saved what is in the setting now, as `google-settings.ts` reads it — null when nothing is
 */
export function hasBeenProven(
  storage: SmallFactStorage | null,
  proofKey: string,
  saved: string | null,
): boolean {
  if (saved === null) return false;
  const proven = provenValue(storage, proofKey);
  return proven !== null && proven === saved;
}
