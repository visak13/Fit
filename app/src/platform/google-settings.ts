/**
 * THE TWO THINGS THE COACH TELLS THIS APPLICATION ABOUT GOOGLE, AND WHERE THEY ARE KEPT.
 *
 * `google-identity.ts` takes its client id as an injected function and `google-meet.ts` takes its
 * coaching calendar the same way. Both were written that way deliberately — neither should know
 * where a setting lives — which left the question of where they actually come from unanswered. This
 * file answers it, and it is the ONLY answer: two names, one storage, read on the way to a request.
 *
 * ## WHY THESE ARE SUPPLIED BY HIM RATHER THAN OBTAINED BY THE APP
 *
 * THE CLIENT ID, because the coach OWNS the Google Cloud project and the OAuth client. That is what
 * makes him the publisher of his own application, which is why he never meets the unverified-app
 * warning and why no Google verification is pursued.
 *
 * THE COACHING CALENDAR, because THIS APPLICATION CANNOT MAKE ONE OR EVEN FIND ONE. Under the narrow
 * `calendar.events` scope it may write events onto a calendar it has been given; `calendars.insert`
 * and `calendarList.list` both need the broad calendar scope, and `calendarList.get` was measured 403
 * on the platform spike. The narrow scope is the whole privacy posture and it is not widened to buy a
 * convenience. So he makes a calendar in Google Calendar and pastes its id here — one setup step,
 * against a permission he would otherwise carry for ever.
 *
 * UNTIL HE HAS, SESSIONS LAND ON HIS MAIN CALENDAR AND THE SCREEN SAYS SO BEFORE THEY DO. That
 * fallback is honest only for as long as it is visible: unsaid, the temporary state becomes the
 * shipped one and his personal calendar quietly fills with sessions. See `CALENDAR_NOTICE` in
 * `google-meet.ts`, which is on screen ahead of the tap rather than after it.
 *
 * ## THE SCREEN THAT COLLECTS THEM IS NOT THIS STEP'S
 *
 * The setup page walks a non-technical person through creating the Cloud project, the consent screen,
 * the client id and now the calendar. It is its own step. What is built here is the FIELD — the name,
 * the reader, the writer and the erasure — so that the screen has something to claim and so that
 * `google-meet.ts` has a real source rather than a null.
 *
 *     npm run test:shell
 */

import type { SmallFactStorage } from './google-identity.ts';

/** The coach's own OAuth client id, from the Cloud project he owns. */
export const GOOGLE_CLIENT_ID_KEY = 'fit.google-client-id';

/**
 * The calendar this application's events land on.
 *
 * A calendar id, not a name: the value Google Calendar shows under a calendar's settings, which for a
 * secondary calendar looks like an address ending `@group.calendar.google.com`. Absent until he sets
 * it, and absent is a WORKING state — see the header.
 */
export const COACHING_CALENDAR_KEY = 'fit.google-coaching-calendar';

/**
 * Read one small fact, or null.
 *
 * A blank value is null rather than an empty string, because a setting he cleared and a setting he
 * never wrote are the same thing to everything downstream, and two representations of one state is
 * how a check ends up passing for one of them.
 *
 * It never throws. A browser refusing storage — private mode, a locked-down device — is a state the
 * application already handles everywhere else, and it must not become an exception on the way to
 * starting a session.
 */
export function readSetting(storage: SmallFactStorage | null, key: string): string | null {
  if (storage === null) return null;
  try {
    const held = storage.getItem(key);
    if (held === null) return null;
    const trimmed = held.trim();
    return trimmed.length === 0 ? null : trimmed;
  } catch (error) {
    console.error('[google] a stored setting could not be read', error);
    return null;
  }
}

/**
 * Write one small fact, or forget it when what he supplied is blank.
 *
 * Clearing the box is how he takes a setting back, so it must not leave the old value in place. A
 * setting he believes he removed and which is still being used is the worst of both.
 *
 * @returns whether the storage accepted it
 */
export function writeSetting(
  storage: SmallFactStorage | null,
  key: string,
  value: string,
): boolean {
  if (storage === null) return false;
  const trimmed = value.trim();
  try {
    if (trimmed.length === 0) storage.removeItem(key);
    else storage.setItem(key, trimmed);
    return true;
  } catch (error) {
    console.error('[google] a setting could not be saved on this device', error);
    return false;
  }
}

/** The coach's OAuth client id, or null before he has entered one. */
export function googleClientId(storage: SmallFactStorage | null): string | null {
  return readSetting(storage, GOOGLE_CLIENT_ID_KEY);
}

/** The calendar sessions land on, or null — in which case they land on his main one, and he is told. */
export function coachingCalendarId(storage: SmallFactStorage | null): string | null {
  return readSetting(storage, COACHING_CALENDAR_KEY);
}

/**
 * The browser's own small-fact storage, or null where it is refused.
 *
 * Reached INSIDE the call rather than at module scope, so this module is importable by a suite
 * running outside a browser — the same rule every other platform module here follows.
 */
export function browserSettings(global: typeof globalThis): SmallFactStorage | null {
  try {
    return global.localStorage;
  } catch (error) {
    console.error('[google] this browser will not allow settings to be stored', error);
    return null;
  }
}
