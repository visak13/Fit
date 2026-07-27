/**
 * THE MEETING LINK — minted on demand, read from the response, and never invented.
 *
 * This is the second and last of the two moments this application touches Google, beside
 * `google-drive-remote.ts`. It is the shell's, not the core's: `core/session/live-session.js` records
 * a JOINING LINK and has no idea one of the ways of getting one involves a calendar.
 *
 * ## THE PATH IS MEASURED AND IT IS THE ONLY ONE
 *
 * The coach uses a FREE PERSONAL GMAIL account. On that account type the only way to a meeting link
 * is inserting a real calendar event carrying a conference create-request, with
 * `conferenceDataVersion=1` on the query. The platform spike did exactly that against his own account
 * and a human confirmed the resulting meeting genuinely opens, on a laptop and on an iPhone.
 *
 * THE MEET REST `spaces.create` PATH DOES NOT EXIST FOR THIS ACCOUNT TYPE AND IS NEVER ATTEMPTED. It
 * is not referenced anywhere in this file, and `google-meet.test.ts` asserts that absence against a
 * positive control so the assertion cannot pass by being pointed at nothing.
 *
 * The accepted consequence: EVERY ONLINE SESSION LANDS AS A REAL EVENT ON A REAL CALENDAR. That was
 * put to the user and settled. It is why {@link CALENDAR_NOTICE} exists and why it is on screen
 * BEFORE he mints rather than after.
 *
 * ## READ THE URL, NEVER SYNTHESISE IT
 *
 * {@link videoEntryPoint} takes the address from `conferenceData.entryPoints[]` where
 * `entryPointType === 'video'`, and there is deliberately no other way to a URL in this file: no
 * template, no concatenation, nothing built from `conferenceId`. A fabricated link that LOOKS right
 * and does not work is the worst outcome available at the start of a session — worse than no link at
 * all, because the coach does not discover it until a client is already waiting on the other side.
 *
 * ## A STABLE REQUEST IDENTIFIER, SO A RETRY CANNOT MINT A SECOND MEETING
 *
 * {@link requestIdFor} derives the create-request's identifier from the SESSION'S OWN ID. One session,
 * one meeting link, however many times the mint is retried — a dead token, a lost network, a coach
 * who tapped twice. The service answers a repeated identifier with the conference it already made.
 *
 * ## THE POLLING LOOP HAS NEVER RUN AGAINST GOOGLE, AND THAT IS SAID OUT LOUD
 *
 * A conference can come back `pending` and must be polled through to `success` before its entry point
 * is read. BOTH SPIKE MINTS RETURNED `success` IMMEDIATELY, so this loop is UNEXERCISED AGAINST THE
 * REAL SERVICE — unexercised, which is not the same as disproven. It is built, it is bounded in time
 * and in attempts, and it is exercised HERE against a double that answers `pending` first and against
 * one that answers `pending` for ever. Nothing in this build may report it proven by a live run: no
 * live run has ever entered it.
 *
 * ## NO PRE-FLIGHT, AND NO WIDER SCOPE TO BUY ONE
 *
 * There is no check that the calendar permits conferences before the insert is attempted. The obvious
 * mechanism, `calendarList.get`, is 403 UNDER THE NARROW SCOPE — measured by the platform spike. The
 * narrow scope is the whole privacy posture and it was proven sufficient everywhere else, so the
 * answer is not to widen the consent screen a non-technical coach must read and accept. THE
 * DEGRADATION HAPPENS AT THE INSERT BOUNDARY instead: when the insert comes back without a
 * conference, he is told plainly what this calendar cannot do AND what he can do instead, in that
 * order, in the same breath. See {@link NO_CONFERENCE}.
 *
 * ## THE CALENDAR THE EVENTS LAND ON
 *
 * They belong on a calendar of the application's own, so he can see, mute or delete them as a set
 * rather than finding his personal calendar full of sessions. The same scope wall applies:
 * `calendars.insert` and `calendarList.list` both need the broad calendar scope, so THIS APPLICATION
 * CANNOT CREATE OR EVEN FIND A CALENDAR. It can only insert into one it has been given. So the
 * calendar id is a small fact the coach supplies, exactly like the client id — and until he has,
 * events land on his main calendar and {@link CALENDAR_NOTICE} says so BEFORE he mints. Stated, it is
 * a working state he can change; silent, it would be his personal calendar filling up behind him.
 *
 * ## NOTHING RAW LEAVES THIS FILE
 *
 * A calendar response carries `htmlLink`, whose `eid` segment is base64 of the event id and the
 * calendar id — and on a personal account THE CALENDAR ID IS THE SIGNED-IN GMAIL ADDRESS. It also
 * carries `creator` and `organizer` blocks holding that address in the clear. None of it is a
 * credential, so every credential-shaped scan passes it, which is exactly why it gets shipped.
 * {@link conferenceReading} therefore returns a value BUILT FROM SCRATCH out of three named fields.
 * The response object itself is never returned, stored, queued, exported, journalled or logged, and
 * `core/integration/leak-sweep.test.js` sweeps for it with decoding rather than with a plaintext
 * search. Contains-no-credential is NOT the same thing as safe-to-publish.
 *
 *     npm run test:shell
 */

import { DEFAULT_TIMEOUT_MS, assertTimeout } from '../../core/remote/port.js';
import { systemClock } from '../../core/remote/clock.js';
import type { Clock } from '../../core/remote/clock.js';

import type { HttpRequestLike, HttpTransport } from './google-drive-remote.ts';
import type { CarriedToken } from './google-identity.ts';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The service, as little of it as is needed
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Where events live. One host, one path; the calendar id is the only part that varies. */
export const CALENDARS_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars';

/**
 * The query parameter without which none of this works.
 *
 * Omit it and the service accepts the insert, drops the conference request on the floor and returns
 * a perfectly ordinary event with no conference at all — a success that produced nothing. It is named
 * as a constant so the one place it is set is the one place a reviewer has to look.
 */
export const CONFERENCE_DATA_VERSION = '1';

/** The conference solution asked for. The only one a personal account can be given. */
export const CONFERENCE_SOLUTION = 'hangoutsMeet';

/** The entry point type the joining address is read from, and the only one this file will accept. */
export const VIDEO_ENTRY_POINT = 'video';

/** The service's own words for how a conference request is getting on. */
export const CONFERENCE_STATUS = Object.freeze({
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILURE: 'failure',
});

/**
 * The calendar an event lands on when the coach has not supplied one of his own.
 *
 * The service's own alias for the account's main calendar. Using it is a DECLARED fallback, never a
 * silent one — see {@link CALENDAR_NOTICE}.
 */
export const MAIN_CALENDAR_ID = 'primary';

/**
 * What every event this application creates is called, and it names nobody.
 *
 * A constant rather than the routine, the clients or anything else about the session. Whatever goes
 * in this field is sent to Google and shown on a calendar; the product deliberately collects no
 * client contact detail at all, and putting client names into a calendar event would hand across the
 * one thing about them the application does hold. The coach can see which session it was in the
 * application, which is where the session actually lives.
 */
export const SESSION_EVENT_TITLE = 'Coaching session';

/** How long an event is booked for when the caller does not say. About a session. */
export const DEFAULT_SESSION_MINUTES = 60;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// What he is told, and the shape every one of these sentences holds to
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * THE EXIT. Appended to every sentence below, last, after the limitation.
 *
 * The rule this file follows everywhere: the limitation and the way out arrive TOGETHER, in that
 * order. A dead end with an exit that exists — the same rule the key-material screen follows. It is
 * one constant rather than a phrase written five times so that the exit cannot go missing from one of
 * them, and `google-meet.test.ts` asserts that every refusal sentence ends with it.
 */
export const PASTE_INSTEAD =
  'You can paste a link instead: start the call in Google Meet, copy its joining link and paste it '
  + 'onto the session. The session runs either way.';

/**
 * WHEN THE INSERT COMES BACK WITHOUT A CONFERENCE — the degradation this file was designed around.
 *
 * It must not read as something he did wrong, because it is not: it is a property of the calendar and
 * of the account behind it. So the sentence says what the calendar cannot do, and then what he can,
 * and it does not use the word failed.
 */
export const NO_CONFERENCE =
  `This calendar cannot create meeting links, so the session has no link of its own. ${PASTE_INSTEAD}`;

/** When the conference was still being made when this gave up waiting. See {@link STILL_PENDING}. */
export const STILL_PENDING =
  'Google is still making the meeting link and this app has stopped waiting for it, so there is no '
  + `link yet. ${PASTE_INSTEAD} Starting this session again asks Google for the same link rather `
  + 'than a second one.';

/** Why an attempt produced nothing. Each is a different thing for him to do about it. */
export type MintRefusalCode =
  | 'no-credential'
  | 'not-reachable'
  | 'refused'
  | 'timed-out'
  | 'unreadable';

/**
 * The sentence for each refusal.
 *
 * Separate sentences because he can do something DIFFERENT about each — the same reason
 * `google-identity.ts` words its five refusals separately rather than saying "could not connect".
 * NONE of them carries anything the service said: a provider's error text put here is a provider
 * string on the coach's screen.
 */
export const MINT_REFUSALS: Readonly<Record<MintRefusalCode, string>> = Object.freeze({
  'no-credential':
    'Your Google connection has run out, so the meeting link could not be made. Connect again and '
    + `start the session once more to ask for it. ${PASTE_INSTEAD}`,
  'not-reachable':
    `This device could not reach Google, so the meeting link could not be made. ${PASTE_INSTEAD}`,
  refused:
    `Google would not make a meeting link for this calendar. ${PASTE_INSTEAD}`,
  'timed-out':
    `Google did not answer in time, so there is no meeting link yet. ${PASTE_INSTEAD} Starting this `
    + 'session again asks for the same link rather than a second one.',
  unreadable:
    `Google answered in a way this app could not read, so there is no meeting link. ${PASTE_INSTEAD}`,
});

/**
 * WHICH CALENDAR THIS LANDS ON, SAID BEFORE IT LANDS THERE.
 *
 * Permanent, on the screen, ahead of the tap — never once-only and never afterwards. The fallback to
 * his main calendar is honest only for as long as he KNOWS about it and can change it; unsaid, the
 * temporary state becomes the shipped one and his personal calendar quietly fills with sessions he
 * did not put there.
 *
 * It reads as a working state rather than a fault, because it is one. Limitation then exit, the same
 * order as everything else in this file.
 */
export const CALENDAR_NOTICE = Object.freeze({
  main:
    'This session goes on your main Google calendar, and you can give the app a calendar of its own: '
    + 'make a new calendar in Google Calendar, then paste its id into Setup. Sessions land there '
    + 'instead, where you can hide or delete them as a set.',
  own:
    'This session goes on the calendar you set aside for coaching. You can change which calendar in '
    + 'Setup.',
});

/**
 * The words for which calendar an event is about to land on.
 *
 * @param calendarId the coach's coaching calendar, or null when he has not set one
 */
export function calendarNotice(calendarId: string | null): string {
  return usableCalendarId(calendarId) === null ? CALENDAR_NOTICE.main : CALENDAR_NOTICE.own;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The group call, warned about at the moment he books it
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Where the cut falls, on a free personal account. Google's number, not this application's. */
export const GROUP_CALL_LIMIT_MINUTES = 60;

/**
 * More than one client attending means three or more people in the call, counting the coach.
 *
 * The coach is always in his own session, so the threshold is MORE THAN ONE ATTENDING CLIENT rather
 * than "marked as a group": two clients plus him is three participants, which is where the cut lands.
 * One client plus him is a one-to-one call and is not affected at all.
 */
export const GROUP_CALL_FROM_CLIENTS = 2;

/**
 * SAID WHEN HE MARKS THE SESSION, NOT WHEN THE CALL DROPS.
 *
 * A session runs about an hour and the cut is at an hour, so this is not a remote possibility — it is
 * the ordinary case for a group session, and he needs it before the call rather than forty minutes
 * into one with two clients on it.
 *
 * IT IS ATTRIBUTED TO GOOGLE, EXPLICITLY, and says the same limit applies to a link he makes by hand.
 * Without that he reads it as this application being deficient and goes off to create links manually,
 * which costs him effort and changes nothing.
 */
export const GROUP_CALL_WARNING =
  'More than one client is in this session, so the call has three or more people in it. Google cuts '
  + `group calls at ${GROUP_CALL_LIMIT_MINUTES} minutes on a free personal account, and sessions run `
  + 'about that long. This is Google\'s limit and not this app\'s: it applies in exactly the same way '
  + 'to a link you make yourself, and only a paid Google Workspace account lifts it. A call with one '
  + 'client is not affected.';

/**
 * The group warning, or null when it does not apply.
 *
 * TWO CONDITIONS, and the second is easy to forget: a session held IN THE ROOM has no call to be cut,
 * and warning about a meeting length for a session with no meeting is noise that teaches him to stop
 * reading these.
 *
 * @param attendingClients how many clients are attending
 * @param mode where the session happens
 */
export function groupCallWarning(attendingClients: number, mode: string | null): string | null {
  if (mode !== 'online') return null;
  return attendingClients >= GROUP_CALL_FROM_CLIENTS ? GROUP_CALL_WARNING : null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The whitelist — three named fields, and the rest dropped on the floor
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Everything this application takes from a calendar response. There is no fourth field.
 *
 * NOT `htmlLink` (base64 of the event id and the signed-in address), NOT `creator`, NOT `organizer`,
 * NOT `iCalUID`, NOT `conferenceData.conferenceId`, and NOT the object it all came in. Built from
 * scratch rather than copied-and-deleted, so a field Google adds next year is carried by nobody
 * rather than carried by default.
 */
export interface ConferenceReading {
  /** The event, so a pending conference can be polled. Used within one mint and never kept. */
  readonly eventId: string;
  /** `pending`, `success`, `failure`, or `''` when the response carried no conference at all. */
  readonly status: string;
  /** The joining address READ FROM THE VIDEO ENTRY POINT, or null. Never built. */
  readonly videoUrl: string | null;
}

/**
 * The joining address, read from the entry points.
 *
 * The type check is the whole function. A conference carries several entry points — a video one, a
 * phone one, sometimes more — and only the video one is a joining link. Taking `entryPoints[0]`
 * would hand the coach a telephone number on the day Google reorders the array, and the failure would
 * appear at the start of a session rather than in a test.
 *
 * Returns null rather than guessing, and nothing anywhere in this file turns a null into a URL.
 */
export function videoEntryPoint(conferenceData: unknown): string | null {
  if (conferenceData === null || typeof conferenceData !== 'object') return null;
  const points = (conferenceData as { entryPoints?: unknown }).entryPoints;
  if (!Array.isArray(points)) return null;

  for (const point of points) {
    if (point === null || typeof point !== 'object') continue;
    const entry = point as { entryPointType?: unknown; uri?: unknown };
    if (entry.entryPointType !== VIDEO_ENTRY_POINT) continue;
    if (typeof entry.uri !== 'string') continue;
    // The record holds a joining link to being an https address; a response that carried anything
    // else is not something to write down and half-trust.
    if (!entry.uri.startsWith('https://')) continue;
    return entry.uri;
  }
  return null;
}

/**
 * Rebuild the three fields worth having, or null when the response is not one this app can read.
 *
 * @param raw the provider's object, which does not leave this function
 */
export function conferenceReading(raw: unknown): ConferenceReading | null {
  if (raw === null || typeof raw !== 'object') return null;
  const event = raw as { id?: unknown; conferenceData?: unknown };
  if (typeof event.id !== 'string' || event.id.length === 0) return null;

  const conference = event.conferenceData;
  if (conference === null || typeof conference !== 'object') {
    // A perfectly valid event that carries no conference. This is the degradation boundary, and it
    // is a READING rather than a failure — the caller says the sentence.
    return Object.freeze({ eventId: event.id, status: '', videoUrl: null });
  }

  const request = (conference as { createRequest?: unknown }).createRequest;
  const status = typeof request === 'object' && request !== null
    ? (request as { status?: { statusCode?: unknown } }).status?.statusCode
    : undefined;

  return Object.freeze({
    eventId: event.id,
    status: typeof status === 'string' ? status : '',
    videoUrl: videoEntryPoint(conference),
  });
}

/**
 * The create-request identifier for a session. THE SAME SESSION ALWAYS PRODUCES THE SAME ONE.
 *
 * That is the whole point: a retry sends the identifier it sent before, and the service answers with
 * the conference it already made rather than making a second one. One session, one meeting.
 *
 * Prefixed so an identifier seen in an account's data is traceable to this application, and no part
 * of it is random, timed or counted.
 */
export function requestIdFor(sessionId: string): string {
  return `fit-session-${sessionId}`;
}

/** The coaching calendar he supplied, or null when what is held is not usable. */
export function usableCalendarId(calendarId: string | null | undefined): string | null {
  if (typeof calendarId !== 'string') return null;
  const trimmed = calendarId.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// What a mint produces
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** What came of asking for a meeting link. */
export type MintOutcome =
  | {
    readonly outcome: 'minted';
    /** Read from the video entry point. Never built, never templated. */
    readonly url: string;
    /** True when this landed on his main calendar because no coaching calendar is set. */
    readonly onMainCalendar: boolean;
    /** How many times the conference was polled before it was ready. Zero on the measured path. */
    readonly polls: number;
  }
  | {
    readonly outcome: 'no-conference';
    /** The limitation and the exit, in that order. {@link NO_CONFERENCE}. */
    readonly sentence: string;
    /** True when the conference request came back `failure` rather than being absent entirely. */
    readonly requestFailed: boolean;
  }
  | {
    readonly outcome: 'still-pending';
    readonly sentence: string;
    readonly polls: number;
  }
  | {
    readonly outcome: 'refused';
    readonly code: MintRefusalCode;
    readonly sentence: string;
  };

/** What one mint is for. Nothing about the clients: see {@link SESSION_EVENT_TITLE}. */
export interface MintRequest {
  /** The session's record id. The create-request identifier is derived from it, and only from it. */
  readonly sessionId: string;
  /** When the session starts. */
  readonly startsAt: Date;
  /** How long to book. Defaults to {@link DEFAULT_SESSION_MINUTES}. */
  readonly minutes?: number;
  readonly timeoutMs?: number;
}

/** What the minting needs of the world around it. */
export interface GoogleMeetDependencies {
  /**
   * The access token for this request, or null when there is not a live one.
   *
   * This is `GoogleConnection.tokenForRequest` and THERE IS NO SECOND TOKEN PATH: nothing here asks
   * for a token, renews one, or knows how one is obtained. Minting is attached to the tap that starts
   * the session, and that tap is where the token is acquired.
   */
  readonly token: () => CarriedToken | null;
  /** The coaching calendar the coach supplied, or null. See {@link CALENDAR_NOTICE}. */
  readonly coachingCalendarId: () => string | null;
  readonly transport?: HttpTransport;
  readonly clock?: Clock;
  readonly timeoutMs?: number;
  /** How long to leave between polls of a pending conference. */
  readonly pollIntervalMs?: number;
  /** The most polls one mint will make. See {@link MAX_POLLS}. */
  readonly maxPolls?: number;
  /** How the interval between polls is waited out. Injected so a suite is not a stopwatch. */
  readonly waitBetweenPolls?: (ms: number) => Promise<void>;
}

/** How long between polls of a conference that came back pending. */
export const DEFAULT_POLL_INTERVAL_MS = 1_000;

/**
 * THE BOUND ON THE POLLING LOOP, and it is not decoration.
 *
 * A loop that waits for a pending conference until it is ready is a loop that never ends when the
 * conference never becomes ready — and what the coach would meet is a spinner he cannot leave, at the
 * start of a session, with a client waiting. The accountability standard this build is held to
 * forbids exactly that: failure must be loud and specific, never a spinner that hides it.
 *
 * So the loop gives up, and giving up is a REPORTED STATE with words and a way out
 * ({@link STILL_PENDING}), not a silent return. `google-meet.test.ts` drives a double that answers
 * pending for ever and asserts the loop ends.
 */
export const MAX_POLLS = 8;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The implementation
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Minting a meeting link, and degrading honestly when the calendar cannot.
 *
 * NOTHING HERE THROWS. Every way this can fail is a state the coach is given a sentence for, because
 * this runs at the moment he presses start with somebody waiting, and an exception at that moment is
 * a blank screen instead of a sentence he can act on. The same choice `GoogleConnection` makes and
 * for the same reason — and the opposite of `GoogleDriveRemoteStorage`, which throws typed failures
 * because its caller is a durable queue that classifies them.
 */
export class GoogleMeetLinks {
  readonly #token: () => CarriedToken | null;
  readonly #coachingCalendarId: () => string | null;
  readonly #transport: HttpTransport;
  readonly #clock: Clock;
  readonly #defaultTimeoutMs: number;
  readonly #pollIntervalMs: number;
  readonly #maxPolls: number;
  readonly #wait: (ms: number) => Promise<void>;

  constructor({
    token, coachingCalendarId, transport, clock, timeoutMs, pollIntervalMs, maxPolls,
    waitBetweenPolls,
  }: GoogleMeetDependencies) {
    this.#token = token;
    this.#coachingCalendarId = coachingCalendarId;
    this.#transport = transport ?? defaultTransport;
    this.#clock = clock ?? systemClock();
    this.#defaultTimeoutMs = assertTimeout(timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.#pollIntervalMs = pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.#maxPolls = maxPolls ?? MAX_POLLS;
    this.#wait = waitBetweenPolls ?? ((ms: number) => this.#clock.sleep(ms));
  }

  /** Which calendar the next mint lands on, so a screen can say so before he taps. */
  calendarInUse(): { readonly calendarId: string; readonly onMainCalendar: boolean } {
    const own = usableCalendarId(this.#coachingCalendarId());
    return own === null
      ? { calendarId: MAIN_CALENDAR_ID, onMainCalendar: true }
      : { calendarId: own, onMainCalendar: false };
  }

  /** The words for which calendar the next mint lands on. */
  calendarNotice(): string {
    return calendarNotice(this.#coachingCalendarId());
  }

  /**
   * Mint a meeting link for one session, polling a pending conference through to ready.
   *
   * The order is: insert with the conference request and the stable identifier, read the response
   * through the whitelist, poll while it says pending, read the video entry point. Every step has a
   * named outcome and none of them throws.
   */
  async mint(request: MintRequest): Promise<MintOutcome> {
    const token = this.#token();
    if (token === null) return refusal('no-credential');

    const timeoutMs = assertTimeout(request.timeoutMs ?? this.#defaultTimeoutMs);
    const { calendarId, onMainCalendar } = this.calendarInUse();
    const headers = {
      Authorization: token.authorizationHeader(),
      'Content-Type': 'application/json',
    };

    const inserted = await this.#call(
      `${this.#eventsUrl(calendarId)}?conferenceDataVersion=${CONFERENCE_DATA_VERSION}`,
      { method: 'POST', headers, body: insertBody(request) },
      timeoutMs,
    );
    if ('code' in inserted) return refusal(inserted.code);

    let reading = inserted.reading;
    let polls = 0;

    // The conference is polled through to ready, bounded in attempts. Each poll re-reads the EVENT
    // rather than a conference endpoint, because the conference is a property of the event and the
    // create-request status travels on it.
    while (reading.status === CONFERENCE_STATUS.PENDING && polls < this.#maxPolls) {
      await this.#wait(this.#pollIntervalMs);
      polls += 1;

      const polled = await this.#call(
        `${this.#eventsUrl(calendarId)}/${encodeURIComponent(reading.eventId)}`
        + `?conferenceDataVersion=${CONFERENCE_DATA_VERSION}`,
        { method: 'GET', headers },
        timeoutMs,
      );
      if ('code' in polled) return refusal(polled.code);
      reading = polled.reading;
    }

    if (reading.status === CONFERENCE_STATUS.PENDING) {
      return Object.freeze({ outcome: 'still-pending' as const, sentence: STILL_PENDING, polls });
    }

    if (reading.videoUrl === null) {
      // THE DEGRADATION BOUNDARY. Either the conference request came back `failure`, or the event
      // carried no conference at all, or it carried one with no video entry point — three ways to
      // arrive at the same place, and the same thing for him to do about it.
      return Object.freeze({
        outcome: 'no-conference' as const,
        sentence: NO_CONFERENCE,
        requestFailed: reading.status === CONFERENCE_STATUS.FAILURE,
      });
    }

    return Object.freeze({
      outcome: 'minted' as const, url: reading.videoUrl, onMainCalendar, polls,
    });
  }

  /** The events collection on one calendar. */
  #eventsUrl(calendarId: string): string {
    return `${CALENDARS_ENDPOINT}/${encodeURIComponent(calendarId)}/events`;
  }

  /**
   * One call, under its deadline, with its answer already through the whitelist.
   *
   * Returns a reading or a refusal code — never an exception and never the provider's object.
   */
  async #call(
    url: string,
    request: { method: string; headers: Record<string, string>; body?: Uint8Array },
    timeoutMs: number,
  ): Promise<{ reading: ConferenceReading } | { code: MintRefusalCode }> {
    const controller = new AbortController();
    const outbound: HttpRequestLike = {
      method: request.method,
      headers: request.headers,
      ...(request.body === undefined ? {} : { body: request.body }),
      signal: controller.signal,
    };

    // The deadline is enforced by giving up on the WAIT, not by hoping the request returns, and the
    // request is aborted when the deadline wins so nothing is left holding a socket. The same shape
    // as `google-drive-remote.ts`, deliberately: one way of bounding a remote call in this build.
    const raced = await Promise.race([
      this.#transport(url, outbound).then(
        (response) => ({ kind: 'answered' as const, response }),
        (failure: unknown) => ({ kind: 'unreachable' as const, failure }),
      ),
      this.#clock.sleep(timeoutMs).then(() => ({ kind: 'deadline' as const })),
    ]);

    if (raced.kind === 'deadline') {
      controller.abort();
      return { code: 'timed-out' };
    }
    if (raced.kind === 'unreachable') {
      console.error('[meet] this device could not reach the calendar service');
      return { code: 'not-reachable' };
    }

    const { response } = raced;
    if (!response.ok) {
      // NOTHING THE SERVICE SAID IS READ OR CARRIED. The status decides the type; the sentence is
      // this application's own. A 401 or 403 is the credential having run out or the grant having
      // been withdrawn, and both are fixed by connecting again rather than by retrying.
      return { code: response.status === 401 || response.status === 403 ? 'no-credential' : 'refused' };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { code: 'unreadable' };
    }

    const reading = conferenceReading(body);
    return reading === null ? { code: 'unreadable' } : { reading };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Small parts, kept out of the class so a test can drive them directly
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The insert body: the event, its window, and the conference request.
 *
 * FIVE KEYS AND NO MORE. No attendees — the client is never added as an invitee, so no client email
 * is collected or stored anywhere and none is needed here. No description. No reminders: the product
 * does not pester him, and a calendar entry that pings him would do it from outside the application
 * where the promise cannot be kept.
 *
 * Exported so a reviewer can read the exact bytes that would go to Google without standing anything
 * up.
 */
export function insertBody(request: MintRequest): Uint8Array {
  const minutes = request.minutes ?? DEFAULT_SESSION_MINUTES;
  const endsAt = new Date(request.startsAt.getTime() + minutes * 60_000);

  return new TextEncoder().encode(JSON.stringify({
    summary: SESSION_EVENT_TITLE,
    start: { dateTime: request.startsAt.toISOString() },
    end: { dateTime: endsAt.toISOString() },
    conferenceData: {
      createRequest: {
        requestId: requestIdFor(request.sessionId),
        conferenceSolutionKey: { type: CONFERENCE_SOLUTION },
      },
    },
  }));
}

/** A refusal, worded. */
function refusal(code: MintRefusalCode): MintOutcome {
  return Object.freeze({ outcome: 'refused' as const, code, sentence: MINT_REFUSALS[code] });
}

/**
 * The platform's own fetch, read INSIDE the call rather than at module scope.
 *
 * This module is imported by a suite running outside a browser, where reading `fetch` at module
 * scope would capture whatever was there at import time.
 */
const defaultTransport: HttpTransport = (url, request) => globalThis.fetch(url, {
  method: request.method,
  headers: { ...request.headers },
  ...(request.body === undefined ? {} : { body: request.body as BodyInit }),
  signal: request.signal,
});
