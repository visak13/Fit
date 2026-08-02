/**
 * THE SETUP SURFACE'S OWN DECISIONS — the few this screen cannot avoid making, and nothing else.
 *
 * `setup.ts` holds the walk to the two ids and `setup-honesty.ts` holds what to expect and what is
 * not claimed. `SetupScreen.tsx` draws BOTH of them and re-words neither. What is left over is what
 * this file owns: the headings the cards are filed under, the words on a tick, where a tick is
 * remembered, and the origin as this browser actually reports it. A sentence decided inside a
 * component is a sentence nothing can assert, so none of them is written there.
 *
 * ## A TICK IS A CLAIM AND IT IS NEVER A PROOF
 *
 * Ticking a step records that HE SAYS he did it. It is not evidence the step worked, and nothing
 * drawn from these ticks may read as though it were: there is no "setup complete", no "connected",
 * and deliberately no count of how many of the steps are done. Whether a value has ever ACTUALLY
 * worked is a different question with a different answer, and {@link TICKS_ARE_YOURS} is the
 * sentence that keeps the two apart on screen.
 *
 * WHICH IS WHY THE ENTERED-VERSUS-CONFIRMED STATEMENT IS NOW DRAWN, AND WHAT CHANGED TO ALLOW IT.
 *
 * This file used to say the statement was deliberately absent, and the reason was sound: `setup.ts`
 * words all three states and takes `proven` as EVIDENCE IT IS HANDED, and nothing on the tree knew
 * whether a client id had ever signed in or a calendar had ever carried an event — so a screen
 * calling `clientIdStanding({entered: true, proven: false})` would have told the coach his id had
 * never been used on the strength of never having asked.
 *
 * THE EVIDENCE NOW EXISTS. `platform/setting-proof.ts` remembers WHICH VALUE was proven, written by
 * the two places that actually watch a proof happen — a sign-in that succeeded and a meeting link
 * that landed — and {@link standingFor} DERIVES the state by comparing that value with what is saved
 * now. Nothing here remembers a verdict, so nothing here can drift from the thing it describes: paste
 * a different id and the statement falls back to "entered but never used" by itself.
 *
 * AND THE TICKS ARE STILL NOT PART OF IT. A full column of ticks moves this statement not one inch,
 * which is the difference the whole screen turns on.
 *
 * ## WHERE A TICK IS REMEMBERED, AND WHY IT IS SWEPT
 *
 * Ticking is his progress through a ONE-TIME job that spans days, a browser restart and probably a
 * phone call, so it has to survive a reload or it is decoration. It is remembered in the browser's
 * own small-fact storage, through `google-settings.ts`'s reader and writer rather than a second pair
 * of my own — those already answer the two questions that matter here: a blank value REMOVES the
 * name, and a storage refusal comes back as `false` rather than as an exception.
 *
 * {@link SETUP_PROGRESS_KEY} IS REGISTERED IN `SMALL_FACT_KEYS`, and that is not a formality. The
 * erase exists for the evening this application is demonstrated on somebody else's computer; a set
 * of ticks left behind afterwards is both a stale claim and a trace saying the app was used here and
 * how far somebody got. `erasure-completeness.test.ts` holds every `fit.` name in the tree to being
 * swept or stated not to be storage, so this one could not have been added quietly either way.
 */

import { browserSettings, readSetting, writeSetting } from '../platform/google-settings.ts';
import { COACHING_CALENDAR_KEY, GOOGLE_CLIENT_ID_KEY } from '../platform/google-settings.ts';
import { PROOF_KEY_FOR, hasBeenProven } from '../platform/setting-proof.ts';
import type { SmallFactStorage } from '../platform/google-identity.ts';
import { PERFORMED_ACT, performedFor } from '../shell/action-destinations.ts';
import {
  CALENDAR_ID_LOCATION, CALENDAR_SIGN_IN_FIRST, CALENDAR_STEPS, CLIENT_ID_STEPS,
  CONSENT_MUST_BE_PUBLISHED, NO_CLIENT_SECRET, SETUP_FIELDS, SETUP_LABEL,
} from './setup.ts';
import type { SetupField, SetupStep, SettingStanding } from './setup.ts';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// What this screen is called and what it is for
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * THE HEADING, WHICH IS `setup.ts`'S CONSTANT AND NOT A SECOND SPELLING OF IT.
 *
 * `google-meet.ts` shipped "...then paste its id into Setup" before this place existed. Composing
 * the heading FROM {@link SETUP_LABEL} makes the label claim structural: a rename cannot leave the
 * notice pointing at a word this screen no longer renders, because there is only one word.
 */
export const SETUP_HEADING = SETUP_LABEL;

/** One line under the heading, in the shape every destination's summary already takes. */
export const SETUP_INTRO =
  'The two things only you can give this app, and what to expect once you have. You do this once.';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The cards, and the questions each one answers
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ONE CARD PER QUESTION, and the questions are named here rather than typed into the markup.
 *
 * `AdminScreen.tsx` established the rule and the argument for it: a coach arrives with one question
 * and has to be able to find the card that answers it without reading the ones that do not.
 */
export const CARD_TITLES = Object.freeze({
  clientId: 'Getting your Google client id',
  calendar: 'Getting a calendar for coaching',
  origin: 'The address to give Google',
  traps: 'If something is not where these steps say',
  expectations: 'What to expect once it is set up',
  security: 'What is encrypted, and what this app does not claim',
  // The call checklist is `HANDOVER.md`'s, for whoever helps him set up — USER-RULED off this
  // screen (2 August 2026): the coach's own setup page carries no section addressed to somebody
  // else. The title stays named here so the ruling is checkable against what the screen renders.
  handover: 'Setting this up with him over a call',
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The ticks
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * WHAT A TICK MEANS, said on the screen rather than assumed.
 *
 * Without it a full column of ticks reads as the application confirming the setup, which it has not
 * done and cannot do from ticks. The sentence is permanent and does not fold: it is what stops the
 * ticks standing in for a proof, which is the whole risk of having them.
 */
export const TICKS_ARE_YOURS =
  'Ticks are your own notes — this app cannot see what you did in Google.';

/**
 * The accessible name on one tick, which says what pressing it will DO rather than what it is.
 *
 * A checkbox announced as its step's title says the same thing the link beside it already says, and
 * leaves a screen-reader user with two identical announcements and no idea which one is the tick.
 */
export function tickName(step: SetupStep, ticked: boolean): string {
  return ticked
    ? `Take the tick off “${step.title}”`
    : `Tick “${step.title}” as done`;
}

/**
 * THE EXTERNAL-LINK MARK'S OWN NAME, and it is announced rather than decorative.
 *
 * The mark is what a sighted reader sees; this is what a screen-reader user gets in its place, and
 * without it the two are not told the same thing. It matters more here than on an ordinary link:
 * every step on this screen leaves the application, and on an installed application a new tab is a
 * bigger event than it is on a laptop — there is no visible browser chrome to explain where he went.
 */
export const OPENS_IN_A_NEW_TAB = 'Opens in a new tab';

/**
 * WHERE THE TICKS LIVE. One name, registered in `SMALL_FACT_KEYS` — see the header.
 *
 * Under `fit.setup.` rather than beside the two Google settings, because it is not one of them: it
 * is this screen's memory of a job in progress, and it belongs to the screen the way
 * `fit.clients.clinical-hint-acknowledged` belongs to the register.
 */
export const SETUP_PROGRESS_KEY = 'fit.setup.steps-ticked';

/** Every step that can be ticked, in the order the screen asks for them. */
export const ALL_SETUP_STEPS: readonly SetupStep[] = Object.freeze([
  ...CLIENT_ID_STEPS,
  ...CALENDAR_STEPS,
]);

/** The separator between remembered ids. A space, because no step id contains one. */
const BETWEEN_IDS = ' ';

/**
 * Which steps he has ticked on this device.
 *
 * UNKNOWN NAMES ARE DROPPED rather than carried, and that is the honest direction: a remembered tick
 * whose step no longer exists cannot be shown to him, so keeping it would only mean writing it back
 * for ever. A step RENAMED keeps its tick, because `SetupStep.id` is stable across wording changes —
 * which is what that field is for.
 */
export function tickedSteps(storage: SmallFactStorage | null): ReadonlySet<string> {
  const held = readSetting(storage, SETUP_PROGRESS_KEY);
  if (held === null) return new Set<string>();

  const known = new Set(ALL_SETUP_STEPS.map((step) => step.id));
  const found = new Set<string>();
  for (const name of held.split(BETWEEN_IDS)) {
    if (known.has(name)) found.add(name);
  }
  return found;
}

/**
 * Remember the ticks, or forget them all when the last one comes off.
 *
 * @returns whether this device accepted it. A refusal is a STATE the screen shows him, never an
 *   exception: a browser that will not remember is not a reason to stop him setting the app up.
 */
export function rememberTicks(
  storage: SmallFactStorage | null,
  ticked: ReadonlySet<string>,
): boolean {
  const known = ALL_SETUP_STEPS.map((step) => step.id).filter((id) => ticked.has(id));
  // Blank REMOVES the name — `writeSetting`'s own behaviour, and the right one here: with no ticks
  // left there is nothing to remember and an empty value left behind is a trace of a job somebody
  // started on this machine.
  return writeSetting(storage, SETUP_PROGRESS_KEY, known.join(BETWEEN_IDS));
}

/** What the screen says when this browser would not remember a tick. */
export const TICKS_NOT_REMEMBERED =
  'This device would not remember that. Your ticks will be back to however they were the last time '
  + 'it did remember them, which costs you nothing except having to find your place again.';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The origin — read from the browser, never typed
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * THE AUTHORISED JAVASCRIPT ORIGIN AS THIS BROWSER REPORTS IT — scheme and host, nothing after.
 *
 * Built from `protocol` and `host` rather than read off `location.origin`, for a reason that only
 * shows up in the case that matters: `origin` is the string `"null"` for an opaque origin, which is
 * a plausible-looking value he would paste into Google and which Google would reject with a form
 * error he cannot interpret. Two named parts can each be checked for being a string with something
 * in it; one composite value cannot.
 *
 * NULL WHERE THERE IS NO BROWSER, which is not a failure: this module is imported by a suite that
 * runs outside one, so every global is reached inside a call on the way to an answer somebody asked
 * for — the rule every platform module here already follows.
 */
export function runningOrigin(global: typeof globalThis = globalThis): string | null {
  try {
    const { location } = global as { location?: { protocol?: unknown; host?: unknown } };
    if (location === undefined || location === null) return null;

    const { protocol, host } = location;
    if (typeof protocol !== 'string' || typeof host !== 'string') return null;
    if (protocol.length === 0 || host.length === 0) return null;

    return `${protocol}//${host}`;
  } catch (error) {
    console.error('[setup] this browser would not say what address it is serving from', error);
    return null;
  }
}

/** What to say when the browser will not say. Never a guess dressed as the answer. */
export const ORIGIN_NOT_KNOWN =
  'This app cannot read the address it is running from in this browser, so it will not guess one. '
  + 'Open it from your home-screen icon and this box will fill in.';

/** The words on the control that puts the origin on his clipboard. */
export const COPY_THE_ORIGIN = 'Copy this address';

/** After it worked. Said as a fact rather than as praise. */
export const ORIGIN_COPIED = 'Copied. Paste it into Authorised JavaScript origins in Google.';

/**
 * After it did not.
 *
 * The address is still on screen and still selectable, so the failure costs him a longer route
 * rather than the step — which is what this says, instead of only reporting that something failed.
 */
export const ORIGIN_NOT_COPIED =
  'This browser would not let the app use your clipboard. Select the address in this card and copy '
  + 'it yourself — it is the same thing.';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The two boxes
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** The words on the control that saves one box. */
export const SAVE_LABEL = 'Save';

/** After a save this device accepted. */
export const SAVED_HERE = 'Saved on this device.';

/** After he cleared the box and saved, which is how a setting is taken back. */
export const CLEARED_HERE = 'Cleared. This app no longer has that setting.';

/** Permanent, at the box, because nothing else on the screen says how to undo a setting. */
export const CLEARING_TAKES_IT_BACK =
  'Emptying the box and saving is how you take a setting back.';

/**
 * A REFUSAL BY THE BROWSER, WHICH IS A STATE AND NOT AN ERROR.
 *
 * `writeSetting` answers whether storage accepted the value. A private window or a locked-down
 * device answers no, and the coach must be told, because everything downstream then behaves as if
 * he never entered it — which without this sentence looks like the app ignoring him.
 *
 * AND IT MAY NOT SAY THE SETTING IS NOW EMPTY, which is what it used to say. A refusal changes
 * NOTHING: whatever was saved here before is still what the application reads and still what it
 * connects with. The two states are only the same when nothing was ever saved. On a device that
 * kept a value last week and is refusing writes today — a phone out of storage, a browser locked
 * down since — "the app will behave as though the box were empty" would tell him he has nothing
 * configured while the OLD id, possibly the wrong one, is the one still in use. That is the
 * unfixable version of the same defect: he would go looking for a setting that is not missing.
 */
export const NOT_SAVED_HERE =
  'This device would not save that. Nothing is wrong with what you entered — this browser is '
  + 'refusing to keep settings, so the app is still using whatever was saved here before, which may '
  + 'be nothing at all.';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Entered is not confirmed — the statement, and the one act that can move it
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * WHERE ONE SETTING STANDS, DERIVED — and there is no verdict written down anywhere.
 *
 * Two facts, both read at the moment the question is asked: what is SAVED, through the field's own
 * reader, and whether THAT VALUE is the one a real attempt proved. `setting-proof.ts` argues why the
 * proven VALUE is remembered rather than a boolean; the consequence here is that this function cannot
 * be wrong about a setting he has changed, because there is no second fact to go stale.
 *
 * THE WORDS ARE `setup.ts`'s AND ARE NOT RE-WORDED. This decides only which of its three states is
 * true; each of them already names WHICH proof — signing in, or making a meeting link once — because
 * they are different proofs and a statement that said only "not verified" would leave him with
 * nothing to do about it.
 */
export function standingFor(
  storage: SmallFactStorage | null,
  field: SetupField,
): SettingStanding {
  const saved = field.read(storage);
  const proofKey = PROOF_KEY_FOR[field.key];
  return field.standing({
    entered: saved !== null,
    // A field this file and `setting-proof.ts` no longer agree about has no proof that could be
    // trusted, and the honest reading of that is "never used" rather than a claim built on a lookup
    // that missed. It cannot happen quietly: `setup-confirmation.test.ts` holds every field to
    // having a proof name.
    proven: proofKey === undefined ? false : hasBeenProven(storage, proofKey, saved),
  });
}

/**
 * THE WORDS ON THE TRY-IT, AND THEY ARE THE CONNECT ACT'S OWN RATHER THAN A SECOND SPELLING.
 *
 * `action-destinations.ts` decides what the control that connects Google says, once, for the whole
 * application. Taking the string FROM there makes this a structural claim: the try-it on this card
 * and the control on the accountability indicator cannot come to be labelled differently, because
 * there is only one label. It is the SAME act underneath as well — see {@link SAME_CONNECTING}.
 */
export const TRY_THE_CLIENT_ID: string = (() => {
  const performed = performedFor('connect_google');
  if (performed === null || performed.act !== PERFORMED_ACT.CONNECT) {
    throw new Error('the act that connects Google is no longer performed here, so this card cannot offer it');
  }
  return performed.words;
})();

/** While the attempt is in flight. Says what is happening rather than going blank. */
export const TRYING_THE_CLIENT_ID = 'Connecting';

/**
 * WHY THIS BUTTON IS NOT A SECOND WAY IN, said because the coach can see two of them.
 *
 * It is the same act, through the one connection this tab has: signing in from this card and signing
 * in from the accountability indicator are one code path and one token, and either of them proves the
 * id. Without this he would reasonably wonder which one counted.
 */
export const SAME_CONNECTING =
  'This is the same connecting the app does anywhere else, so signing in from either place is what '
  + 'proves your client id. There is nothing here you have to do twice.';

/**
 * WHY THERE IS NO EQUIVALENT BUTTON FOR THE CALENDAR, and it is a decision rather than an omission.
 *
 * A meeting link is a REAL CALENDAR EVENT — that is the only path to one on a personal account, and
 * `platform/google-meet.ts` says so in its own header. A try-it here would therefore put a session on
 * his calendar that never happened, which is a worse thing to own than an unconfirmed setting. So the
 * proof is taken from the first real session that lands, and `setup.ts` already tells him that is
 * what it will take. NAMES NO PLACE ON PURPOSE: a sentence that sent him somewhere would be a claim
 * about that place, and there is nothing here he needs to be sent to.
 */
export const NO_CALENDAR_TRY_IT =
  'There is no button here to test this one. A meeting link is a real event on the calendar, so a '
  + 'test would leave a session on it that never happened. The first online session you start is what '
  + 'settles it.';

/**
 * ONE SECTION: a walk, and the box the walk produces a value for.
 *
 * They are one card because they are one question. A screen that listed all the steps and then all
 * the boxes would make him carry a long identifier from the bottom of one card to the top of
 * another, and that is where a value gets pasted into the wrong box — the defect `setup.ts` binds
 * each field to its own key to prevent, arriving from the interface instead.
 */
export interface SetupSection {
  /** Stable, and the prefix for every element id on the card. */
  readonly id: string;
  /** What the card is headed. */
  readonly title: string;
  /** The walk, in order. Each title is the link. */
  readonly steps: readonly SetupStep[];
  /** The box at the end of it, with its key already attached by `setup.ts`. */
  readonly field: SetupField;
  /** Said beside the LINK rather than at the foot of the card, or null where there is nothing. */
  readonly besideTheLink: string | null;
  /** Standing facts about the walk, permanent and unfolded. */
  readonly notes: readonly string[];
  /**
   * WHETHER THE PROOF FOR THIS SETTING CAN BE ATTEMPTED FROM THIS CARD.
   *
   * True only for the client id, and the asymmetry is the honest one rather than an unfinished half:
   * signing in costs nothing and leaves nothing behind, while minting a meeting link leaves a real
   * event on a real calendar. Where it is false, {@link insteadOfTryIt} says why in his own terms —
   * an absent control with no reason given is the state a reader concludes is broken.
   */
  readonly canTryHere: boolean;
  /** Why there is no try-it on this card, or null where there is one. */
  readonly insteadOfTryIt: string | null;
}

/**
 * The field `setup.ts` bound to this key.
 *
 * IT THROWS RATHER THAN RETURNING NULL. A missing field is not a state to draw — it is `setup.ts`
 * and this file having stopped agreeing about what the two settings are, and the honest rendering of
 * that is not a card with one box quietly missing from it.
 */
function fieldFor(key: string): SetupField {
  const found = SETUP_FIELDS.find((field) => field.key === key);
  if (found === undefined) {
    throw new Error(`setup.ts no longer carries a field for ${key}, so this screen cannot draw it`);
  }
  return found;
}

/** The two walks, each with its own box. The client id first: nothing else works without it. */
export const SETUP_SECTIONS: readonly SetupSection[] = Object.freeze([
  Object.freeze({
    id: 'client-id',
    title: CARD_TITLES.clientId,
    steps: CLIENT_ID_STEPS,
    field: fieldFor(GOOGLE_CLIENT_ID_KEY),
    besideTheLink: null,
    notes: Object.freeze([CONSENT_MUST_BE_PUBLISHED, NO_CLIENT_SECRET]),
    canTryHere: true,
    insteadOfTryIt: null,
  }),
  Object.freeze({
    id: 'calendar',
    title: CARD_TITLES.calendar,
    steps: CALENDAR_STEPS,
    field: fieldFor(COACHING_CALENDAR_KEY),
    // AT THE LINK, and this is the reason the field exists rather than the note going in `notes`.
    // Every console link sends a signed-out visitor to sign-in and then on; this one sends him to a
    // page ABOUT Google Calendar, which is the state one-time setup is actually done in. A warning
    // about a link, folded away or sitting under the card, is read after he has already followed it.
    besideTheLink: CALENDAR_SIGN_IN_FIRST,
    notes: Object.freeze([CALENDAR_ID_LOCATION]),
    canTryHere: false,
    insteadOfTryIt: NO_CALENDAR_TRY_IT,
  }),
] as readonly SetupSection[]);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The way in, from Admin
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** What the Admin card says, decided here so the screen that draws it decides nothing. */
export interface AdminEntry {
  readonly title: string;
  readonly intro: string;
  readonly linkLabel: string;
}

/**
 * THE WAY IN, AND IT IS PERMANENT LIKE EVERY OTHER NON-DESTINATION'S.
 *
 * There is no state on it and no chip: a setup is not a queue and there is nothing here that could
 * be counted honestly. The link's words are not "finish setting up" — this screen is equally the
 * place he comes back to when he changes his calendar a year later, and a link that promises a job
 * to finish reads as a fault on every visit after the first.
 *
 * Admin's own tooltip in `shell/navigation.ts` already says Admin is where "Setting up your Google
 * account" happens. That is a claim about a place, and this card is what makes it true.
 */
export function describeSetupAdminEntry(): AdminEntry {
  return Object.freeze({
    title: SETUP_HEADING,
    intro:
      'The two things only you can give this app — your Google client id and the calendar your '
      + 'sessions land on — with the steps for getting them, and what to expect afterwards.',
    linkLabel: 'Open Setup',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** The browser's small-fact storage, or null where it is refused. Reached inside the call. */
export function setupStorage(global: typeof globalThis = globalThis): SmallFactStorage | null {
  return browserSettings(global);
}
