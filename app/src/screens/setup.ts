/**
 * SETUP — THE WORDS, THE LINKS AND THE DECISIONS FOR THE TWO THINGS ONLY THE COACH CAN SUPPLY.
 *
 * `google-settings.ts` built the two FIELDS — the client id and the coaching calendar — and said in
 * its own header that the screen collecting them was not its step. This is that step's words half.
 * There is no React here, no screen and no route: `SetupScreen.tsx` draws what is decided in this
 * file, exactly as `AdminScreen.tsx` draws `admin-report.ts` and `DietScreen.tsx` draws
 * `diet-source.ts`. A sentence decided inside a component is a sentence nothing can assert.
 *
 * ## THE PROMISE THAT IS ALREADY ON SCREEN
 *
 * `google-meet.ts`'s {@link CALENDAR_NOTICE} has shipped since the Google step and it ends "...then
 * paste its id into Setup". A shipped sentence names a place, so the place has to exist and has to be
 * called what the sentence calls it. {@link SETUP_LABEL} is that word, held here once, and
 * `setup.test.ts` asserts the notice actually spells it — a rename that broke the promise would
 * otherwise be invisible.
 *
 * ## WHY THIS IS A LIST OF LINKS AND NOT A SET OF DIRECTIONS
 *
 * USER-RULED 2026-07-30: "Just use hyperlinks." Every step below opens the SPECIFIC Google console
 * page it is about, in a new tab, and the step's TITLE IS THE LINK. That dissolves the problem the
 * old approach had rather than managing it: you cannot ship a stale screenshot, or stale directions
 * through a menu Google moved, for a page he reaches in one click. There are therefore no pictures of
 * Google's screens anywhere in this build — not captured, not generated, not approximated.
 *
 * A LINK IS A DESTINATION CLAIM LIKE ANY OTHER, so every href here was re-measured on
 * {@link CONSOLE_ADVICE_DATE} with a browser user agent and no signed-in session. The console pages
 * answer 302 to Google sign-in with `continue=` PRESERVING the deep path — he signs in and lands on
 * the page the title promised — and the two API pages answer 200 once a cookie jar is carried. An
 * unauthenticated agent with no cookie jar sees that bounce as a redirect loop, and Google throttles
 * bare agents with 429; NEITHER is a dead link and neither is a reason to "fix" one of these.
 *
 * THE ONE LINK THAT DOES NOT BEHAVE LIKE THE OTHERS is Google Calendar's own settings — and the way
 * it misbehaves is INVISIBLE TO THE CHECK DESCRIBED ABOVE, which is why this paragraph spells out the
 * mechanism rather than the conclusion. Measured signed out, twice: it answers 302 TO SIGN-IN LIKE
 * EVERY OTHER LINK HERE, `accounts.google.com/ServiceLogin?service=cl&…&continue=` carrying the same
 * deep path — the IDENTICAL SHAPE to every console link that DOES arrive. The bail happens at HOP
 * TWO, where that ServiceLogin URL itself 302s a signed-out visitor to
 * `workspace.google.com/intl/en-US/products/calendar/`: Google's Calendar product page, not the
 * settings screen the title promised. ONLY A FOLLOWED CHAIN SHOWS IT. A one-hop unfollowed
 * inspection — exactly what the paragraph above tells you to do — cannot tell this link from a good
 * one, so anyone re-measuring it the recorded way concludes it is fine and deletes the one sentence
 * that makes it usable. It is still the right destination and it is still the only place a calendar
 * id is shown, so the gap is closed in WORDS instead of pretended away: see
 * {@link CALENDAR_SIGN_IN_FIRST}.
 *
 * ## WHAT IS DELIBERATELY NOT TAKEN FROM THE PROTOTYPE THIS SHAPE CAME FROM
 *
 * The tickable-numbered-steps shape, the title-as-link, the origin rendered as copyable code and the
 * placeholder showing the real client-id format are borrowed from a separate clean-room prototype.
 * NO CODE IS. Two of that prototype's four steps contradict settled decisions here and would be false
 * instructions the coach could not detect:
 *
 *  - It enables the Meet REST API. THIS APPLICATION NEVER CALLS IT. The coach is on a free personal
 *    account, where the only path to a meeting link is a calendar event carrying a conference
 *    request — `google-meet.ts` says so in its own header and asserts the absence. So the steps here
 *    enable the DRIVE API and the CALENDAR API, which are the two this application actually uses.
 *  - It adds the coach as a TEST USER. This application needs the sign-in screen PUBLISHED, and the
 *    reason is given to him in his own terms rather than as a setting: a project left in testing
 *    expires his sign-in and signs him out for no reason he can see.
 *
 *     npm run test:shell
 */

import { CALENDAR_NOTICE } from '../platform/google-meet.ts';
import {
  COACHING_CALENDAR_KEY, GOOGLE_CLIENT_ID_KEY, readSetting, writeSetting,
} from '../platform/google-settings.ts';
import type { SmallFactStorage } from '../platform/google-identity.ts';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// What this place is called
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * THE NAME OF THIS PLACE, held once.
 *
 * `CALENDAR_NOTICE` promised it before it existed, so this constant and that sentence have to agree
 * for ever. Spelled here rather than in the screen because the screen is not the thing another
 * module's shipped copy is depending on.
 */
export const SETUP_LABEL = 'Setup';

/**
 * WHEN THE CONSOLE ADVICE BELOW WAS LAST MEASURED — one constant, never typed into a sentence.
 *
 * Google owns those screens and this build has already been burned by their layout moving. The date
 * is what tells a later reader whether the cause-and-effect prose in {@link CONSOLE_TRAPS} is still
 * to be trusted, and a date written into five sentences is a date that gets updated in four of them.
 */
export const CONSOLE_ADVICE_DATE = '31 July 2026';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The steps, as data a test can read
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * One step of the walk, and the whole of it.
 *
 * The TITLE IS THE LINK TEXT — there is no separate "click here" — and it says what he is there to
 * ACHIEVE rather than where to click. "Switch on the Google Drive API, so this app can keep your
 * backup in your Drive" survives Google moving a button; "click Enable in the top bar" does not.
 */
export interface SetupStep {
  /** Stable across wording changes, so a tick he made yesterday is still ticked today. */
  readonly id: string;
  /** The link text. What he is there to achieve, in his words. */
  readonly title: string;
  /** Absolute, https, opens in a new tab. Measured on {@link CONSOLE_ADVICE_DATE}. */
  readonly href: string;
}

const CONSOLE = 'https://console.cloud.google.com';

/**
 * THE WALK TO A CLIENT ID, in the order it has to happen.
 *
 * ENABLING EACH API IS ITS OWN STEP, and each has its own page rather than sharing the library's
 * front door. Two reasons, and the second is the expensive one: a library search is a place to get
 * lost, and an API left un-enabled fails only AFTER sign-in succeeds — which reads to him as this
 * application being broken rather than as a step he skipped.
 */
export const CLIENT_ID_STEPS: readonly SetupStep[] = Object.freeze([
  Object.freeze({
    id: 'project',
    title: 'Make a Google Cloud project that belongs to you',
    href: `${CONSOLE}/projectcreate`,
  }),
  Object.freeze({
    id: 'drive-api',
    title: 'Switch on the Google Drive API, so this app can keep your backup in your own Drive',
    href: `${CONSOLE}/apis/library/drive.googleapis.com`,
  }),
  Object.freeze({
    id: 'calendar-api',
    title: 'Switch on the Google Calendar API, so this app can put your sessions on a calendar',
    href: `${CONSOLE}/apis/library/calendar-json.googleapis.com`,
  }),
  Object.freeze({
    id: 'consent',
    // PUBLISH is in the title because it is the step, not a detail of it. See CONSENT_MUST_BE_PUBLISHED.
    title: 'Set up your sign-in screen and publish it, so your sign-in does not expire',
    href: `${CONSOLE}/apis/credentials/consent`,
  }),
  Object.freeze({
    id: 'client',
    title: 'Create a web client id and allow this app’s address to use it',
    href: `${CONSOLE}/apis/credentials`,
  }),
] as readonly SetupStep[]);

/**
 * THE WALK TO A COACHING CALENDAR — one step, because there is only one thing to do.
 *
 * This application CANNOT make a calendar or even find one: `calendars.insert` and `calendarList.list`
 * both need the broad calendar scope, and the narrow scope is the whole privacy posture. So he makes
 * one and pastes its id, and {@link CALENDAR_ID_LOCATION} says where the id is shown.
 */
export const CALENDAR_STEPS: readonly SetupStep[] = Object.freeze([
  Object.freeze({
    id: 'calendar',
    title: 'Make a calendar for coaching, then copy its id from that calendar’s own settings',
    href: 'https://calendar.google.com/calendar/u/0/r/settings',
  }),
] as readonly SetupStep[]);

/**
 * WHY THE SIGN-IN SCREEN IS PUBLISHED RATHER THAN LEFT IN TESTING, in the only terms he can act on.
 *
 * Said as what happens TO HIM, never as a console state: a project left in testing expires his
 * sign-in after a week, and what he meets is being signed out for no reason he can see, on a day he
 * has a client waiting.
 */
export const CONSENT_MUST_BE_PUBLISHED =
  'Publish the sign-in screen rather than leaving it in testing. A project left in testing lets your '
  + 'sign-in expire after a week, and what you would see is this app signing you out for no reason '
  + 'you can point at — usually on the day you have a client waiting.';

/**
 * WHERE A CALENDAR ID IS SHOWN. A plain fact, because a link cannot land on ONE calendar's settings.
 *
 * The link opens Google Calendar's settings; which calendar he then picks is his, and the id is shown
 * under that calendar rather than under the settings page as a whole.
 */
export const CALENDAR_ID_LOCATION =
  'Open the settings for the calendar you just made — not the general settings — and its id is '
  + 'shown there. It is a long address rather than the name you gave the calendar.';

/**
 * THE ONE MEASURED GAP IN THE LINKS, said instead of hidden.
 *
 * Every console link sends a signed-out visitor to Google sign-in and then on to the page it
 * promised. This one does not: signed out, Google Calendar sends him to a page about Google Calendar.
 * Nothing here can change that, so he is told the one thing that makes the link behave — measured on
 * {@link CONSOLE_ADVICE_DATE}.
 */
export const CALENDAR_SIGN_IN_FIRST =
  'Sign in to Google in this browser first. Signed out, this link lands on a page about Google '
  + 'Calendar instead of on your own calendars, and nothing is wrong — sign in and open it again.';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The origin, and the thing he must never enter
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * THE AUTHORISED JAVASCRIPT ORIGIN — scheme and host, and nothing after them.
 *
 * The published site lives under a path, and the origin is NOT the address of the site: Google
 * rejects an origin carrying a path or a trailing slash, and the rejection arrives as a form error he
 * has no way to interpret. The screen renders the running origin as copyable code rather than asking
 * him to type this, which is a stronger guarantee than a constant — this is the value that
 * guarantee is checked against.
 */
export const AUTHORISED_JAVASCRIPT_ORIGIN = 'https://visak13.github.io';

/** The rule the origin has to obey, said as a shape rather than as a Google error message. */
export const ORIGIN_RULE =
  'The authorised JavaScript origin is the address up to the end of the site name and no further — '
  // NOT "the box below". Two things were wrong with that and only one of them was the direction:
  // this card renders the address as a line of code with a copy control, and there is no box on it
  // at all — the two boxes on this screen are the ones he types into, which is exactly what he must
  // NOT do with this value. Naming the card is stable under a reorder; naming a direction is not.
  + 'no folder after it and no slash on the end. Copy it from this card rather than typing it.';

/**
 * THERE IS NO CLIENT SECRET. EVER.
 *
 * The console offers him one on the same page as the client id, so silence here is not neutral: he
 * would reasonably assume the app wants both, go looking for somewhere to put it, and conclude
 * something is missing. This states the fact about what to enter. It makes no claim about safety, and
 * must not grow one — that wording has a single owner elsewhere in this screen.
 */
export const NO_CLIENT_SECRET =
  'This app never asks for a client secret and has nowhere to put one. The page that shows your '
  + 'client id offers a secret as well — leave it where it is and copy only the client id.';

/** What a real client id looks like, shown in the empty box rather than described in a sentence. */
export const CLIENT_ID_PLACEHOLDER = '000000000000-abc123def456.apps.googleusercontent.com';

/** Every client id ends with this. The shape check's whole basis, named once. */
export const CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

/** What a calendar made for coaching ends with. A HINT, never the only legal form — see below. */
export const COACHING_CALENDAR_SUFFIX = '@group.calendar.google.com';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The two console traps — what a link cannot carry
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * A CONTROL THAT IS NOT WHERE HE WOULD LOOK, OR NOT THERE AT ALL, AND WHY.
 *
 * A link opens a page; it cannot explain why the page is missing the thing he was sent to find. A
 * reader who meets an unexplained gap concludes he broke something and stops — so each of these names
 * the CAUSE and then what he should SEE, in that order, and carries the date it was measured.
 */
export interface ConsoleTrap {
  readonly id: string;
  /** Why the control is not where he expects it. Never "Google changed things". */
  readonly cause: string;
  /** What is actually on his screen, so he can tell he is in the right place. */
  readonly whatYouShouldSee: string;
  /** {@link CONSOLE_ADVICE_DATE}, carried rather than typed into the prose. */
  readonly measuredOn: string;
  /** Where the thing actually lives now. Absolute, https, measured the same day. */
  readonly href: string;
}

/**
 * THE TWO THAT COST PEOPLE AN AFTERNOON.
 *
 * They are kept as dated prose while everything else became a link precisely because a link cannot
 * carry them: the first is about a control having MOVED, the second about a control being ABSENT
 * rather than hidden — and absent-with-no-explanation is the state that makes a non-technical person
 * conclude the instructions are wrong and give up.
 */
export const CONSOLE_TRAPS: readonly ConsoleTrap[] = Object.freeze([
  Object.freeze({
    id: 'moved-under-audience',
    cause:
      'Permissions and test users are no longer on the sign-in screen page where guides put them. '
      + 'They now sit under Data access and Audience, which are their own entries in the menu.',
    whatYouShouldSee:
      'Data access lists what the app may reach. Audience is where the publishing status is, and it '
      + 'is the page you finish on.',
    measuredOn: CONSOLE_ADVICE_DATE,
    href: `${CONSOLE}/auth/audience`,
  }),
  Object.freeze({
    id: 'no-test-users-in-production',
    cause:
      'A project already set to In Production has no test users section at all — not an empty one, '
      + 'no section. Nothing is broken and nothing is hidden: the list only exists while a project is '
      + 'in testing, so putting it back to Testing is what makes it appear.',
    whatYouShouldSee:
      'Under Audience, the publishing status says In Production and there is nothing about test '
      + 'users anywhere on the page. This app wants In Production, so you should only need to go '
      + 'back to Testing if you are looking for that list.',
    measuredOn: CONSOLE_ADVICE_DATE,
    href: `${CONSOLE}/auth/audience`,
  }),
] as readonly ConsoleTrap[]);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The shape check — at the field, with no network call
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * WHAT A SHAPE CHECK IS ALLOWED TO DO, DECLARED AS DATA RATHER THAN LEFT AS AN ABSENT BRANCH.
 *
 * It NEVER blocks a save, and that is a decision rather than an omission. A refusal here would be
 * this application overruling a value Google would have accepted — his primary calendar id is his own
 * e-mail address, and a check built around the coaching-calendar suffix would reject it. A warning he
 * can save past catches the obvious paste error and costs him nothing when it is wrong; a refusal he
 * cannot pass costs him the feature.
 *
 * Frozen and asserted so that a later author turning this into a gate has to change a constant a test
 * is watching, rather than adding an early return nobody notices.
 */
export const SHAPE_CHECK_BLOCKS_SAVING = false;

/** Nothing entered, plausible, or plainly not the right kind of thing. Three states, never two. */
export type ShapeVerdict = 'empty' | 'looks-right' | 'looks-wrong';

/** The verdict and the sentence that goes with it. The sentence is never empty. */
export interface ShapeCheck {
  readonly verdict: ShapeVerdict;
  /** What looks wrong, in plain words, or what this looks like when it looks right. */
  readonly sentence: string;
}

/** Blank, or what he actually typed with the edges taken off. */
function entered(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Does this read as an address — something, an at sign, then a name with a dot in it.
 *
 * Written as a character walk rather than as a pattern, deliberately: this house does not put a
 * pattern in front of a value the coach typed without asking first, and a walk is also the thing a
 * reader can check against the sentence beside it.
 */
function looksLikeAnAddress(value: string): boolean {
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) return false;

  const host = value.slice(at + 1);
  const dot = host.indexOf('.');
  if (dot <= 0 || dot === host.length - 1) return false;

  for (const character of value) {
    if (character === ' ' || character === '\t') return false;
  }
  return true;
}

/**
 * DOES THIS LOOK LIKE A CLIENT ID — asked at the field, while he is still looking at it.
 *
 * The one thing worth catching is the one thing he is most likely to do: paste something else from
 * that console page. Every client id ends {@link CLIENT_ID_SUFFIX}; a project number, a client
 * secret, an API key and a whole downloaded JSON block do not, and none of them will ever work.
 */
export function checkClientIdShape(value: string | null | undefined): ShapeCheck {
  const typed = entered(value);

  if (typed.length === 0) {
    return Object.freeze({
      verdict: 'empty' as const,
      sentence: 'Nothing entered yet. Until there is, this app cannot connect to your Google account.',
    });
  }

  if (!typed.endsWith(CLIENT_ID_SUFFIX)) {
    return Object.freeze({
      verdict: 'looks-wrong' as const,
      sentence:
        `This does not end ${CLIENT_ID_SUFFIX}, and every client id does. It may be the client `
        + 'secret or the project number from the same page. You can still save it, but connecting is '
        + 'unlikely to work until this is the client id.',
    });
  }

  if (typed.indexOf('-') <= 0) {
    return Object.freeze({
      verdict: 'looks-wrong' as const,
      sentence:
        'The ending is right but the front is missing: a client id begins with a long number, then a '
        + 'dash. Check you copied the whole thing. You can still save it.',
    });
  }

  return Object.freeze({
    verdict: 'looks-right' as const,
    sentence: 'This has the shape of a client id.',
  });
}

/**
 * DOES THIS LOOK LIKE A CALENDAR ID — and it must not refuse what Google would accept.
 *
 * A calendar made for coaching ends {@link COACHING_CALENDAR_SUFFIX}. His MAIN calendar's id is his
 * own e-mail address, which is a perfectly legal thing to put here and would be rejected by a check
 * built only around the suffix. So the suffix is a HINT that raises confidence, an address is
 * accepted and named for what it is, and only something that is neither is called out.
 */
export function checkCalendarIdShape(value: string | null | undefined): ShapeCheck {
  const typed = entered(value);

  if (typed.length === 0) {
    return Object.freeze({
      verdict: 'empty' as const,
      sentence:
        'Nothing entered yet, which is a working state: sessions go on your main Google calendar '
        + 'until you set one aside for coaching.',
    });
  }

  if (typed.endsWith(COACHING_CALENDAR_SUFFIX)) {
    return Object.freeze({
      verdict: 'looks-right' as const,
      sentence: 'This has the shape of a calendar you made for coaching.',
    });
  }

  if (looksLikeAnAddress(typed)) {
    return Object.freeze({
      verdict: 'looks-right' as const,
      sentence:
        'This looks like an e-mail address, which is the id of your own main calendar. That is a '
        + 'real calendar id and it will work — sessions will land on your main calendar rather '
        + 'than on one of their own.',
    });
  }

  return Object.freeze({
    verdict: 'looks-wrong' as const,
    sentence:
      'This does not look like a calendar id. An id is an address rather than the name you gave the '
      + `calendar — a calendar you made ends ${COACHING_CALENDAR_SUFFIX}. You can still save it.`,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Entered is not confirmed
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * THE THREE STATES A SETTING IS ACTUALLY IN, and the middle one is the whole point of this section.
 *
 * A shape check says a value is PLAUSIBLE. It cannot say it is RIGHT — a client id from the wrong
 * project has the correct shape and fails at the moment he signs in, in front of somebody. So a
 * screen that shows a tick for "looks right" is telling him something it does not know. These three
 * separate what he typed from what has been proven, and the proof is NAMED rather than implied.
 */
export type StandingState = 'nothing-entered' | 'never-used' | 'proven';

/** What is known about one setting, and how it is said. */
export interface SettingStanding {
  /** The state, named, so a test asserts the branch rather than the sentence it produced. */
  readonly state: StandingState;
  /** What he reads. Says WHICH proof, never just "not verified". */
  readonly sentence: string;
}

/**
 * WHAT THIS FUNCTION IS TOLD, AND WHY IT IS TOLD RATHER THAN FINDING OUT.
 *
 * Nothing here reads storage, calls Google, or inspects a connection. Whether a value has ever
 * actually WORKED is a fact somebody else holds — a sign-in that succeeded, a meeting link that was
 * minted — and this module deciding it for itself would be a second opinion about the app's own
 * state, growing quietly beside the first.
 */
export interface StandingEvidence {
  /** Is there a value saved at all. */
  readonly entered: boolean;
  /** Has this value ever actually been used successfully. Never inferred from its shape. */
  readonly proven: boolean;
}

/**
 * WHERE THE CLIENT ID STANDS, and the proof is SIGNING IN.
 *
 * There is no other proof available and there is no test button that could invent one: connecting is
 * the only thing this application does with a client id, so the only thing that proves it is
 * connecting once.
 */
export function clientIdStanding(evidence: StandingEvidence): SettingStanding {
  if (!evidence.entered) {
    return Object.freeze({
      state: 'nothing-entered' as const,
      sentence: 'No client id saved on this device, so there is nothing to connect with yet.',
    });
  }

  if (!evidence.proven) {
    return Object.freeze({
      state: 'never-used' as const,
      sentence:
        'A client id is saved, and it has never been used. Signing in to Google on this device is '
        + 'what proves it is the right one — until that has worked once, this is only what you '
        + 'typed.',
    });
  }

  return Object.freeze({
    state: 'proven' as const,
    sentence: 'Signing in to Google on this device has worked with this client id, so it is the right one.',
  });
}

/**
 * WHERE THE COACHING CALENDAR STANDS, and the proof is MAKING A MEETING LINK ON IT ONCE.
 *
 * A different proof from the client id's, and it is named as a different one. An id that is saved and
 * has never carried an event is a calendar this application has never written to, and the first time
 * it tries will be at the start of a session.
 */
export function coachingCalendarStanding(evidence: StandingEvidence): SettingStanding {
  if (!evidence.entered) {
    return Object.freeze({
      state: 'nothing-entered' as const,
      sentence:
        'No coaching calendar saved, so sessions go on your main Google calendar. That works — '
        + 'it is not an unfinished setting.',
    });
  }

  if (!evidence.proven) {
    return Object.freeze({
      state: 'never-used' as const,
      sentence:
        'A calendar id is saved, and no session has landed on it yet. Starting one online and '
        + 'getting a meeting link is what proves this calendar is reachable — until that has '
        + 'happened once, this is only what you typed.',
    });
  }

  return Object.freeze({
    state: 'proven' as const,
    sentence:
      'A meeting link has been made on this calendar, so this app can reach it and sessions land '
      + 'there.',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The two fields, bound to their keys once
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ONE FIELD, WITH ITS KEY ALREADY ATTACHED.
 *
 * The key is `google-settings.ts`'s constant and is never spelled here — a key invented in this step
 * is one the app cannot see, with nothing erroring anywhere. Binding the reader and the writer to the
 * key HERE, once, is also what stops the screen pairing the wrong field with the wrong key: that
 * defect would save the calendar id under the client id's name and neither value would error.
 */
export interface SetupField {
  /** The key from `google-settings.ts`. Carried, never spelled. */
  readonly key: string;
  /** What the box is called. */
  readonly label: string;
  /** Shown in the empty box, or empty where a placeholder would be a guess. */
  readonly placeholder: string;
  /** Read what is saved on this device, or null. Delegates; holds no reading of its own. */
  readonly read: (storage: SmallFactStorage | null) => string | null;
  /** Save it, or forget it when he clears the box. Returns whether storage accepted it. */
  readonly save: (storage: SmallFactStorage | null, value: string) => boolean;
  /** The shape check for this field, at the point of entry, with no network call. */
  readonly check: (value: string | null | undefined) => ShapeCheck;
  /** Where this field stands, given what somebody else knows about whether it has ever worked. */
  readonly standing: (evidence: StandingEvidence) => SettingStanding;
}

/** Both fields, in the order the screen asks for them. The client id first: nothing works without it. */
export const SETUP_FIELDS: readonly SetupField[] = Object.freeze([
  Object.freeze({
    key: GOOGLE_CLIENT_ID_KEY,
    label: 'Google client id',
    placeholder: CLIENT_ID_PLACEHOLDER,
    read: (storage: SmallFactStorage | null) => readSetting(storage, GOOGLE_CLIENT_ID_KEY),
    save: (storage: SmallFactStorage | null, value: string) =>
      writeSetting(storage, GOOGLE_CLIENT_ID_KEY, value),
    check: checkClientIdShape,
    standing: clientIdStanding,
  }),
  Object.freeze({
    key: COACHING_CALENDAR_KEY,
    label: 'Coaching calendar id',
    placeholder: `coaching${COACHING_CALENDAR_SUFFIX}`,
    read: (storage: SmallFactStorage | null) => readSetting(storage, COACHING_CALENDAR_KEY),
    save: (storage: SmallFactStorage | null, value: string) =>
      writeSetting(storage, COACHING_CALENDAR_KEY, value),
    check: checkCalendarIdShape,
    standing: coachingCalendarStanding,
  }),
] as readonly SetupField[]);

/**
 * THE SENTENCE THAT PROVES THIS PLACE IS THE ONE THE CALENDAR NOTICE MEANT.
 *
 * Exported so the promise and the place are read from one module in the test rather than from two,
 * and so a rename of {@link SETUP_LABEL} shows up as a failure here rather than as a coach following
 * an instruction to somewhere that no longer exists.
 */
export const CALENDAR_NOTICE_NAMING_THIS_PLACE = CALENDAR_NOTICE.main;
