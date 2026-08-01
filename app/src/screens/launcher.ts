/**
 * WHAT THE LAUNCHER SAYS — the whole derivation, and none of the drawing.
 *
 * The calendar destination is the way into RUNNING a session: choose the people, choose the routine,
 * say where you are, and start. Every judgement about it is decided here, in a plain module a test
 * can assert with no browser and no rendering at all, and `CalendarScreen.tsx` beside it draws the
 * result and holds no decisions. The same split as `screens/removals.ts` and `screens/clients.ts`,
 * which is the pattern this file copies rather than a shape invented for it.
 *
 * ## THE TWO THINGS THIS SCREEN IS DELIBERATELY NOT
 *
 * **There are no reminders and no notifications, anywhere.** The coach knows his own schedule, and an
 * application that pesters him is the burden this whole product exists not to be. It is also not a
 * diary he keeps: nothing here asks him to enter an appointment in advance as a chore. He arrives,
 * chooses, and starts. {@link launcher.test.ts} asserts the absence, because an absent feature and a
 * forgotten one look identical to the next editor — the same reason `core/session/glance.js` asserts
 * that it proposes no progression.
 *
 * ## ONE ROUTINE, HOWEVER MANY PEOPLE — AND THAT IS A DECISION, NOT A LIMITATION
 *
 * A session is a ROUTINE plus a SET of attending clients; a single app instance always drives a
 * single routine. The rare case of two people in one call needing different programmes is answered by
 * running two instances side by side, and {@link SECOND_INSTANCE_HINT} says so at the moment it
 * becomes relevant. This screen must never grow parallel timelines to accommodate it: that
 * complexity would fight the requirement that the app not feel like a burden, and it would fight it
 * on the screen used with a client already waiting.
 *
 * ## WHERE HE IS IS ASKED, NEVER ASSUMED
 *
 * `mode` is required on the session record and this screen is the caller that supplies it. There is
 * NO default here and no pre-selected answer: {@link canStart} refuses until he has said, because a
 * screen that starts with "Online" already chosen is a screen that answers for him, and it would
 * record a session held in a room as a call. That is exactly the ambiguity the field exists to end.
 * `core/session/live-session.js` used to carry the same default and no longer does.
 *
 * IN PERSON CREATES NOTHING REMOTE — no calendar event, no meeting link, no request of any kind. The
 * record enforces that half (a link on an in-person session is refused as a contradiction); this file
 * says it out loud, because it is a promise about what the app does behind his back.
 *
 * ## NOTHING HERE VALIDATES A SESSION
 *
 * `core/model/entities/session.js` is the schema and it is sealed: the field list, the permitted
 * modes, the roster bound, and the rule that a link and its origin travel together are ITS rules,
 * checked by `store.create` on the way in. This file decides only what makes a selection READY TO
 * OFFER — that he has picked people, a routine and a place — and lets the record answer everything
 * else. {@link describeRefusal} in `clients.ts` is how a refusal reaches him, unchanged.
 *
 * The one place the two touch is {@link MODE_CHOICES}, which must offer exactly the values the record
 * permits. That is not asserted by copying the list; the suite reads `SESSION_MODES` from the core and
 * requires the two to AGREE. Two independent readings of one truth, where the disagreement is the
 * alarm — a copy would drift silently and the screen would offer a choice the record refuses.
 */

/*
 * THERE IS NO SCREEN TITLE CONSTANT IN THIS FILE, for the same reason there is none in `clients.ts`:
 * the calendar is a DESTINATION, and `shell/navigation.ts` is the one list that says what a
 * destination is called. A title here would be a second copy of that word, and a second copy is how
 * a screen ends up heading itself something the navigation surface disagrees with.
 */

import { viewportClass } from '../design/viewport';
import { groupCallWarning } from '../platform/google-meet';
import type { MintOutcome } from '../platform/google-meet';

// ═══════════════════════════════════════════════════════════════════════════════
// What the core hands over
// ═══════════════════════════════════════════════════════════════════════════════

/** Where a session happens. The two values the record permits, and the suite proves it. */
export type SessionMode = 'online' | 'in_person';

/**
 * A client record as this screen reads it. Only the fields it needs are named; the rest of the
 * envelope travels past untouched. The core is plain ECMAScript typed in documentation comments and
 * is consumed here UNCHANGED, so the shape it needs is stated where it is used.
 */
export interface ClientRecord {
  readonly record_id: string;
  readonly content: { readonly name: string; readonly active: boolean };
}

/** A routine record as this screen reads it. `id` is the content key a session references it by. */
export interface RoutineRecord {
  readonly record_id: string;
  readonly content: {
    readonly id: string;
    readonly name: string;
    readonly focus: string;
    readonly description: string;
  };
}

/** A session record as this screen reads it. */
export interface SessionRecord {
  readonly record_id: string;
  readonly content: {
    readonly routine_id: string;
    readonly client_ids: readonly string[];
    readonly status: string;
    readonly mode: string;
    readonly started_at?: string | null;
    readonly ended_at?: string | null;
  };
}

/** The previous session at a glance, exactly as `core/session/glance.js` shapes it. */
export interface Glance {
  readonly session_id: string;
  readonly routine_id: string;
  readonly status: string;
  readonly started_at: string | null;
  readonly partial_record: boolean;
  readonly performed: readonly {
    readonly exercise_id: string;
    readonly substituted_for_exercise_id: string | null;
    readonly status: string;
    readonly sets_completed: number | null;
    readonly repetitions: number | null;
    readonly duration_seconds: number | null;
    readonly observed_load: string | null;
  }[];
  readonly loads: readonly { readonly exercise_id: string; readonly observed_load: string }[];
  readonly readings: readonly {
    readonly kind: string;
    readonly value: number;
    readonly unit: string;
  }[];
}

/** A page of records exactly as the core paged it. `done` is carried, never dropped. */
export interface Page<T> {
  readonly items: readonly T[];
  readonly cursor: string | null;
  readonly done: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// The choice he is making
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * HOW THIS SESSION GETS ITS JOINING LINK, and all three of these are real answers.
 *
 * Minting one and pasting one are TWO FIRST-CLASS PATHS, not a path and its fallback. A pasted link
 * costs nothing, needs no Google call to succeed at the moment a session begins, and covers the case
 * where the call is already running — that is a decision on the record, not a consolation prize. And
 * `none` is a real answer too: an online session may perfectly well have no link in the app at all.
 */
export type LinkPlan = 'mint' | 'paste' | 'none';

/**
 * What has been chosen so far.
 *
 * `mode` is null until he answers, and that null is the feature — see the header. `pastedLink` is
 * the empty string when he has pasted nothing, which is a different thing from a link he cleared.
 */
export interface Selection {
  readonly clientIds: readonly string[];
  readonly routineId: string | null;
  readonly mode: SessionMode | null;
  readonly pastedLink: string;
  /** How he wants the link. Only ever consulted on an online session. */
  readonly linkPlan: LinkPlan;
}

/**
 * Nothing chosen. One value, so the screen and its reset cannot disagree about what empty is.
 *
 * `linkPlan` DOES carry a default where `mode` deliberately does not, and the difference is worth
 * stating because the two look alike. `mode` records a FACT ABOUT THE WORLD — where the session was
 * actually held — and a pre-selected answer would write down a fact nobody supplied. `linkPlan` is
 * an INSTRUCTION about what the app should do next, its consequence is on screen beside it, and it
 * is reversible by tapping the other answer. Minting on demand at the start of a session is the
 * recorded decision, so that is what an untouched screen does.
 */
export const NOTHING_CHOSEN: Selection = Object.freeze({
  clientIds: Object.freeze([]) as readonly string[],
  routineId: null,
  mode: null,
  pastedLink: '',
  linkPlan: 'mint' as LinkPlan,
});

/** Add or remove one person. One to many: more than one person can be in a single call. */
export function toggleClient(selection: Selection, clientId: string): Selection {
  const held = selection.clientIds;
  return {
    ...selection,
    clientIds: held.includes(clientId)
      ? held.filter((id) => id !== clientId)
      : [...held, clientId],
  };
}

/**
 * Choose the routine. ALWAYS EXACTLY ONE, however many people are in the room.
 *
 * Choosing the one already chosen clears it rather than doing nothing, so the control he pressed to
 * select is the control he presses to change his mind. A selection with no way back out is how a
 * mis-tap becomes a session started for the wrong programme.
 */
export function chooseRoutine(selection: Selection, routineId: string): Selection {
  return { ...selection, routineId: selection.routineId === routineId ? null : routineId };
}

/** Say where the session happens. Leaving in person clears any pasted link — see {@link canStart}. */
export function chooseMode(selection: Selection, mode: SessionMode): Selection {
  return { ...selection, mode, pastedLink: mode === 'in_person' ? '' : selection.pastedLink };
}

/** What he has typed into the optional link box. Never trimmed here; see {@link linkToStore}. */
export function pasteLink(selection: Selection, link: string): Selection {
  return { ...selection, pastedLink: link };
}

/**
 * Say how this session gets its link. Leaving the paste answer clears what was pasted.
 *
 * Cleared for the same reason {@link chooseMode} clears it on the in-person answer: a link sitting in
 * a box he can no longer see would still be the link written onto the session, and he would have no
 * way to tell why the session points where it does.
 */
export function chooseLinkPlan(selection: Selection, plan: LinkPlan): Selection {
  return { ...selection, linkPlan: plan, pastedLink: plan === 'paste' ? selection.pastedLink : '' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Where the session happens
// ═══════════════════════════════════════════════════════════════════════════════

/** One answer to "where are you", with what choosing it actually does. */
export interface ModeChoice {
  readonly value: SessionMode;
  readonly label: string;
  /** What this answer causes, in plain words. Permanent on screen, never a tooltip. */
  readonly consequence: string;
}

/**
 * THE TWO ANSWERS, AND WHAT EACH ONE DOES.
 *
 * The consequences are on the screen rather than behind help, because they are the difference
 * between the two and he is choosing between them. In particular the in-person promise is a promise
 * about what the app does NOT do out of his sight, and a promise he cannot verify has to be stated.
 *
 * These values must be exactly `SESSION_MODES` from `core/model/vocabularies.js`. The suite reads
 * both and requires agreement rather than this file copying the list — see the header.
 */
export const MODE_CHOICES: readonly ModeChoice[] = Object.freeze([
  Object.freeze({
    value: 'online' as const,
    label: 'Online',
    consequence:
      'Recorded as a call. Choose below whether the app makes a joining link for it or you paste '
      + 'one you already have. Either way the session starts straight away and never waits on a link.',
  }),
  Object.freeze({
    value: 'in_person' as const,
    label: 'In person',
    consequence:
      'Recorded as a session in the room. Nothing is created anywhere else — no calendar entry, no '
      + 'joining link, and no request of any kind leaves this device.',
  }),
]);

/** What the mode question is called, above the two answers. */
export const MODE_QUESTION = 'Where is this session?';

/** The optional link box, which exists only on the online answer. */
export const PASTED_LINK_LABEL = 'Joining link, if you already have one';

/** Said under it, so an empty box never reads as something unfinished. */
export const PASTED_LINK_HINT =
  'Optional. Paste a link from a call you have already started, and it is kept with the session. '
  + 'Leave it empty and the session still starts.';

// ═══════════════════════════════════════════════════════════════════════════════
// How the session gets its joining link
// ═══════════════════════════════════════════════════════════════════════════════

/** What the link question is called, above its three answers. Only on the online mode. */
export const LINK_QUESTION = 'The joining link';

/** One answer to the link question, with what choosing it actually does. */
export interface LinkChoice {
  readonly value: LinkPlan;
  readonly label: string;
  /** What this answer causes, in plain words. Permanent on screen, never a tooltip. */
  readonly consequence: string;
}

/**
 * THE THREE ANSWERS, AND WHAT EACH ONE DOES.
 *
 * The mint answer's consequence says out loud that a real calendar event is created and that Google
 * may ask him to connect at that moment. Both are true, both were accepted deliberately, and neither
 * is something he should discover by watching his calendar fill up. The screen also carries the
 * calendar notice from `platform/google-meet.ts` beside this, which names WHICH calendar.
 */
export const LINK_CHOICES: readonly LinkChoice[] = Object.freeze([
  Object.freeze({
    value: 'mint' as const,
    label: 'Make one now',
    consequence:
      'The app asks Google for a Meet link as the session starts, which puts a real event on your '
      + 'calendar. Google may ask you to connect at that moment. If it cannot make one, it says so '
      + 'and you can paste a link instead.',
  }),
  Object.freeze({
    value: 'paste' as const,
    label: 'Paste one I already have',
    consequence:
      'Nothing is created anywhere and no calendar event is made. Use this for a call you have '
      + 'already started, or any link of your own.',
  }),
  Object.freeze({
    value: 'none' as const,
    label: 'No link',
    consequence:
      'The session is recorded as a call with no joining link kept in the app. Nothing is sent to '
      + 'Google. You can still paste one afterwards.',
  }),
]);

/**
 * Whether starting this session should ask Google for a link.
 *
 * Three conditions, and each of them can stand alone as a reason not to. He is in the room; he asked
 * for a different answer; or he has ALREADY PASTED ONE, in which case minting would create a second
 * meeting for a session that already knows where it is going.
 */
export function shouldMint(selection: Selection): boolean {
  if (selection.mode !== 'online') return false;
  if (selection.linkPlan !== 'mint') return false;
  return linkToStore(selection) === null;
}

/**
 * The link to write with the session, or null.
 *
 * TRIMMED HERE AND NOWHERE ELSE, and an empty box becomes null rather than an empty string: the
 * field is optional on the record, and writing an empty string would record that he pasted something
 * when he did not. Whether what he pasted is acceptable is the record's answer, not this function's
 * — the schema holds it to a length and to being an https address, with its own sentence.
 *
 * An in-person session never carries one, whatever is in the box. The box is not shown on that
 * answer and {@link chooseMode} clears it, so this is the third guard on the same rule rather than
 * the first; the record refuses a link on an in-person session outright, which is the one that
 * matters.
 */
export function linkToStore(selection: Selection): string | null {
  if (selection.mode !== 'online') return null;
  const pasted = selection.pastedLink.trim();
  return pasted.length > 0 ? pasted : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Whether he can start
// ═══════════════════════════════════════════════════════════════════════════════

/** What the start control says, and what is still needed before it does anything. */
export interface StartReport {
  readonly canStart: boolean;
  /** What is still missing, in the order the screen asks for it. Empty when he can start. */
  readonly missing: readonly string[];
  readonly label: string;
  /** The choice read back to him in one line, or null before there is anything to read back. */
  readonly summary: string | null;
  /**
   * Shown when more than one person is attending AND the app is being drawn somewhere a second
   * window can actually be opened. See {@link SECOND_INSTANCE_HINT} and {@link canOpenASecondWindow}.
   */
  readonly secondInstanceHint: string | null;
  /**
   * THE SIXTY-MINUTE CUT ON A GROUP CALL, SAID HERE — at the moment he books the session.
   *
   * Not when the call drops. A session runs about an hour and Google cuts a group call at an hour on
   * a free personal account, so for a session with two clients in it this is the ORDINARY case
   * rather than an edge one. The words are `platform/google-meet.ts`'s, carried through unchanged,
   * because they are the ones that attribute the limit to Google and say it applies identically to a
   * link he makes himself.
   */
  readonly groupCallWarning: string | null;
}

/** What the start control says. A session, not a record: he is starting work with a person. */
export const START_BUTTON = 'Start this session';

/**
 * THE HINT ABOUT A SECOND INSTANCE, shown before the session starts and only when it applies.
 *
 * A recorded decision: one app instance drives one routine, and a couple needing different
 * programmes is answered by opening the app twice rather than by building parallel timelines here.
 * He cannot be expected to guess that, so it is said — at the moment more than one person is
 * attending, which is the only moment it means anything. A hint shown always is one he stops
 * reading, and it would take this sentence with it.
 *
 * IT IS ALSO NOT SHOWN WHERE IT CANNOT BE FOLLOWED — see {@link canOpenASecondWindow}. The sentence
 * itself is CORRECT and is not the defect; where it was reachable was.
 */
export const SECOND_INSTANCE_HINT =
  'Everyone here does the same routine. If two of them need different programmes today, open the '
  + 'app in a second window and run that one there.';

/**
 * WHETHER THIS DEVICE CAN DO WHAT {@link SECOND_INSTANCE_HINT} ASKS OF IT.
 *
 * Running two sessions side by side is a LAPTOP capability and a recorded decision says so. An
 * installed home-screen app has no second window to open and no way to make one, so on a phone that
 * sentence is advice that cannot be followed — and it arrives at the exact moment he has two people
 * in front of him and no time, where he will read it as his own failure to find the window rather
 * than as something the app should not have said. Nothing crashes, which is why it survived: it
 * fails as ADVICE rather than as a control, and advice that cannot be followed looks like help.
 *
 * THE BOUNDARY IS THE FRAME'S OWN, `EXPANDED_VIEWPORT_MIN`, and not a number chosen here. Below it
 * the interface is already the phone's — the bottom bar rather than the rail — and `viewport.ts`
 * says out loud why the 600-840 band cannot be split further: a tablet and an unmaximised laptop
 * window are indistinguishable from the markup. A capability offered on a guess is offered wrongly
 * half the time, and the half that is wrong is the one standing in front of a client. So the hint
 * is offered at `expanded` and withheld everywhere narrower.
 *
 * @param viewportWidth the viewport's width in CSS pixels, as the screen measured it
 */
export function canOpenASecondWindow(viewportWidth: number): boolean {
  return viewportClass(viewportWidth) === 'expanded';
}

/** What is still needed, worded as the thing to do rather than as a fault. */
const MISSING_WORDS = Object.freeze({
  clients: 'Choose who is training.',
  routine: 'Choose the routine.',
  mode: 'Say whether you are on a call or in the room.',
});

/**
 * Whether the selection is ready to offer to the core.
 *
 * Three questions, and the third is the one this action exists for: `mode` must have been ANSWERED,
 * not defaulted. See the header for why a pre-selected answer would be worse than an unanswered one.
 */
export function canStart(selection: Selection): boolean {
  return selection.clientIds.length > 0 && selection.routineId !== null && selection.mode !== null;
}

/**
 * Everything the start control says.
 *
 * `viewportWidth` is MEASURED by the screen and JUDGED here, which is the same split the rest of
 * this module keeps: `CalendarScreen.tsx` knows how wide the window is and decides nothing, and the
 * one place that decides what a width MEANS is {@link canOpenASecondWindow}. It is required rather
 * than defaulted for the reason `mode` is: a default would be this function answering a question
 * about the coach's device that nobody asked it, and the safe-looking default — assume a laptop —
 * is precisely the one that puts the unfollowable advice back on his phone.
 *
 * @param selection what has been chosen
 * @param names the chosen clients' names, in the order he chose them
 * @param routineName the chosen routine's name, or null
 * @param viewportWidth the viewport's width in CSS pixels
 */
export function describeStart(
  selection: Selection,
  names: readonly string[],
  routineName: string | null,
  viewportWidth: number,
): StartReport {
  const missing: string[] = [];
  if (selection.clientIds.length === 0) missing.push(MISSING_WORDS.clients);
  if (selection.routineId === null) missing.push(MISSING_WORDS.routine);
  if (selection.mode === null) missing.push(MISSING_WORDS.mode);

  return {
    canStart: canStart(selection),
    missing,
    label: START_BUTTON,
    summary: summarise(names, routineName, selection.mode),
    secondInstanceHint: selection.clientIds.length > 1 && canOpenASecondWindow(viewportWidth)
      ? SECOND_INSTANCE_HINT
      : null,
    groupCallWarning: groupCallWarning(selection.clientIds.length, selection.mode),
  };
}

/**
 * The choice read back in one line, so what he is about to start is on screen beside the button.
 *
 * Built from whatever has been chosen so far rather than only when everything has, because the value
 * of reading it back is highest while he is still choosing.
 */
function summarise(
  names: readonly string[],
  routineName: string | null,
  mode: SessionMode | null,
): string | null {
  const parts: string[] = [];
  if (names.length > 0) parts.push(listWords(names));
  if (routineName !== null) parts.push(routineName);
  if (mode !== null) parts.push(mode === 'online' ? 'on a call' : 'in the room');
  return parts.length > 0 ? `${parts.join(', ')}.` : null;
}

/**
 * Names as a person writes them: "Ana", "Ana and Ben", "Ana, Ben and Cara".
 *
 * A comma-joined list reads as machine output at three names and is genuinely ambiguous at two.
 */
export function listWords(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// The previous session at a glance
// ═══════════════════════════════════════════════════════════════════════════════

/** What the glance panel says for one person. */
export interface GlanceReport {
  readonly clientId: string;
  readonly clientName: string;
  /** True when the core returned nothing — which is a FIRST SESSION, never missing data. */
  readonly firstSession: boolean;
  readonly headline: string;
  /** Said when the previous session did not finish. Interrupted history is still history. */
  readonly partialWords: string | null;
  /** What was performed, worded. Empty on a first session. */
  readonly performed: readonly string[];
  /** The loads he wrote down, verbatim. Nothing is derived from these. */
  readonly loads: readonly string[];
  readonly readings: readonly string[];
  /** Said when the previous session recorded nothing at all against this person. */
  readonly nothingRecorded: string | null;
}

/**
 * THE WORDS FOR A FIRST SESSION, and they are the good news rather than an absence.
 *
 * `previousSessionAtAGlance` returns null when a client has never had a session, and the core's own
 * header says the interface must say so plainly rather than showing an empty panel that reads like a
 * fault. A blank space where history should be is the shape of a failed read, and the coach has no
 * way to tell the two apart.
 */
export function firstSessionWords(clientName: string): string {
  return `${clientName}'s first session. There is nothing before this one, which is exactly as it should be.`;
}

/**
 * The glance for one person, worded.
 *
 * IT SHOWS AND IT DOES NOT SUGGEST. Nothing here proposes a heavier load, a longer hold or more
 * repetitions, nothing compares two sessions to derive a direction, and nothing carries a load
 * forward as a default. A load is an observation he made, shown back exactly as he wrote it, so that
 * HE decides whether anything goes up. That judgement belongs to a certified professional who is
 * also adapting to a client's history, and this is the screen where adding a suggestion would be
 * most tempting. The suite asserts the absence.
 */
export function describeGlance(
  clientId: string,
  clientName: string,
  glance: Glance | null,
  routineName: string | null,
  /**
   * The name of each exercise the glance mentions, by content key.
   *
   * A key with no name is shown AS IT STANDS rather than hidden or guessed at: an exercise the coach
   * has since deleted is genuinely gone from the library, and the session really did reference it.
   */
  exerciseNames: ReadonlyMap<string, string> = new Map(),
): GlanceReport {
  if (glance === null) {
    return {
      clientId,
      clientName,
      firstSession: true,
      headline: firstSessionWords(clientName),
      partialWords: null,
      performed: [],
      loads: [],
      readings: [],
      nothingRecorded: null,
    };
  }

  const nameOf = (key: string): string => exerciseNames.get(key) ?? key;
  const performed = glance.performed.map((record) => performedWords(record, nameOf));
  const loads = glance.loads.map((load) => `${nameOf(load.exercise_id)}: ${load.observed_load}`);
  const readings = glance.readings.map((reading) => `${reading.kind} ${reading.value}${reading.unit}`);
  const empty = performed.length === 0 && loads.length === 0 && readings.length === 0;

  return {
    clientId,
    clientName,
    firstSession: false,
    headline: `${clientName} last did ${routineName ?? glance.routine_id}${whenWords(glance.started_at)}.`,
    partialWords: glance.partial_record
      ? 'That session did not finish. What was recorded is here; the rest of it never happened.'
      : null,
    performed,
    loads,
    readings,
    nothingRecorded: empty
      ? 'Nothing was recorded against them in that session.'
      : null,
  };
}

/** One performed record, worded. The counts are his; nothing is inferred from a missing one. */
function performedWords(
  record: Glance['performed'][number],
  nameOf: (key: string) => string,
): string {
  const parts: string[] = [nameOf(record.exercise_id)];

  if (record.status === 'skipped') parts.push('— skipped');
  if (record.status === 'substituted' && record.substituted_for_exercise_id !== null) {
    parts.push(`— instead of ${nameOf(record.substituted_for_exercise_id)}`);
  }
  if (record.sets_completed !== null && record.repetitions !== null) {
    parts.push(`${record.sets_completed} x ${record.repetitions}`);
  } else if (record.sets_completed !== null) {
    parts.push(`${record.sets_completed} sets`);
  }
  if (record.duration_seconds !== null) parts.push(`${record.duration_seconds}s`);
  if (record.observed_load !== null) parts.push(record.observed_load);

  return parts.join(' ');
}

/**
 * The word this module puts in front of a recorded day. It is written here ONCE because
 * {@link describeHistory} strips it again, and that strip takes its length from this literal rather
 * than from a number counted by hand — a hand-counted length would survive an edit to the word and
 * quietly start cutting the phrase in the wrong place.
 */
const ON_PREFIX = 'on ';

/** The day, if it was recorded. Never a guess, and never a relative phrase this app cannot keep true. */
function whenWords(startedAt: string | null): string {
  if (startedAt === null) return '';
  const day = startedAt.slice(0, 10);
  return ` ${ON_PREFIX}${day}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sessions left unfinished
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * WHY THIS IS NOT A RECOVERY MODE, AND WHY THE WORDING MATTERS.
 *
 * A power cut, a phone call, a browser closing mid-session: all of them are NORMAL, and the core
 * treats them as such — `openSession` is the only door and does the same thing whether a session is
 * being started for the first time or picked up forty minutes in. So the words here are the words of
 * an ordinary start. Anything that reads like a crash report would tell him something went wrong on a
 * day when nothing did.
 */
export const UNFINISHED_TITLE = 'Sessions you have not finished';

export const UNFINISHED_INTRO =
  'These are still open. Picking one up is the same as starting: nothing was lost, and everything '
  + 'already recorded in it is still there.';

/**
 * ONE PERSON IN A SESSION, HELD BY IDENTITY AS WELL AS BY NAME — and the reason the reports below
 * stopped folding the roster into their sentence.
 *
 * "A session leads back to the people in it" is one half of the circular navigation the product
 * promises, and it means each person on a session row is a way back to them on the register. A name
 * cannot be both prose inside a sentence and a link: rendering the sentence and then repeating the
 * same names underneath as links is the same words twice on a phone row, and splitting a finished
 * sentence back apart in the drawing is a parser guessing at what it just built.
 *
 * So the roster comes out WHOLE, beside the sentence rather than inside it, and the sentence is the
 * session — its routine and when it was. `screens/circular-navigation.ts` owns where each name goes
 * and what its link is called.
 */
export interface SessionPerson {
  readonly clientId: string;
  readonly name: string;
}

/** One unfinished session, offered for pick-up. */
export interface UnfinishedReport {
  readonly sessionId: string;
  /** The session: its routine and when it started. The roster is {@link people}, not this. */
  readonly words: string;
  /** Everyone in it whose name could be read back, in the order the session holds them. */
  readonly people: readonly SessionPerson[];
  readonly modeWords: string;
  readonly pickUpLabel: string;
}

/** How a session's mode reads back. The WORD carries it, never a colour. */
export function modeWords(mode: string): string {
  if (mode === 'in_person') return 'In person';
  if (mode === 'online') return 'Online';
  // A record written by a version of the app this one does not know about. Shown as it stands
  // rather than translated into one of the two above, which would be inventing what it said.
  return mode;
}

/**
 * One unfinished session, worded.
 *
 * WHEN THE ROSTER CANNOT BE READ BACK the sentence says "this session" rather than naming nobody.
 * That case is real: the register is paged, so a session may hold somebody who is not among the
 * people currently read, and a row beginning with a dash would look like a defect rather than like a
 * name this screen has not fetched.
 */
export function describeUnfinished(
  session: SessionRecord,
  routineName: string | null,
  people: readonly SessionPerson[],
): UnfinishedReport {
  const what = routineName ?? session.content.routine_id;
  const when = whenWords(session.content.started_at ?? null);

  return {
    sessionId: session.record_id,
    words: people.length > 0 ? `${what}${when}` : `this session — ${what}${when}`,
    people,
    modeWords: modeWords(session.content.mode),
    pickUpLabel: 'Pick up where you left off',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sessions that already happened
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * WHAT PAST SESSIONS LOOK LIKE HERE, AND WHAT THEY DELIBERATELY DO NOT.
 *
 * Enough to see that they happened, and no more. Reading a session — the full record, the progress
 * across sessions, the exports — belongs to later steps, and building a thin version of it here
 * would be a second reading surface for the same facts, drifting from the real one from the day it
 * lands. So this is a list of dates and names, and it says what it is.
 */
export const HISTORY_TITLE = 'Sessions already done';

export const HISTORY_INTRO =
  'For the people you have chosen. Reading one back in full — what was done, the loads, the '
  + 'progress — is not built yet.';

/** Said when the chosen people have no finished sessions between them. */
export const HISTORY_EMPTY = 'Nothing yet for the people you have chosen.';

/** Said when nobody has been chosen, so there is nothing to look up. */
export const HISTORY_NOBODY_CHOSEN = 'Choose who is training and their sessions appear here.';

/** One past session, worded. */
export interface HistoryReport {
  readonly sessionId: string;
  /** When it was and what it was. The roster is {@link people} — see {@link SessionPerson}. */
  readonly words: string;
  /** Everyone in it whose name could be read back, each a way back to them on the register. */
  readonly people: readonly SessionPerson[];
  readonly statusWords: string;
  readonly modeWords: string;
}

/** How a session's status reads back to a person. */
export function statusWords(status: string): string {
  switch (status) {
    case 'completed': return 'Finished';
    case 'interrupted': return 'Interrupted';
    case 'abandoned': return 'Not finished';
    case 'in_progress': return 'Still open';
    case 'planned': return 'Planned';
    default: return status;
  }
}

/** One past session, worded. */
export function describeHistory(
  session: SessionRecord,
  routineName: string | null,
  people: readonly SessionPerson[],
): HistoryReport {
  const what = routineName ?? session.content.routine_id;
  const when = whenWords(session.content.started_at ?? session.content.ended_at ?? null).trim();
  // The history line reads the day on its own, so the leading word goes. An explicit check on
  // {@link ON_PREFIX} and a slice of that same literal's length: if the phrase does not start with
  // it, it is left exactly as it came, which is what happens when no day was recorded at all.
  const day = when.startsWith(ON_PREFIX) ? when.slice(ON_PREFIX.length) : when;

  return {
    sessionId: session.record_id,
    words: [when === '' ? null : day, what]
      .filter((part): part is string => part !== null && part !== '')
      .join(' — '),
    people,
    statusWords: statusWords(session.content.status),
    modeWords: modeWords(session.content.mode),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// What happened when he pressed start
// ═══════════════════════════════════════════════════════════════════════════════

/** The core's answer to opening a session, exactly as `live-session.js` shapes it. */
export interface OpenOutcome {
  readonly ok: boolean;
  readonly reason?: string;
  /** The core's own sentence for the coach. Used VERBATIM — see {@link describeOutcome}. */
  readonly message?: string;
  readonly session_id?: string;
}

/** What the screen says after he pressed start, or pressed pick up. */
export interface OutcomeReport {
  readonly started: boolean;
  readonly headline: string;
  /** The second half, or null. Never a reworded version of the headline. */
  readonly detail: string | null;
  readonly sessionId: string | null;
}

/**
 * WHAT IS TRUE THE MOMENT A SESSION STARTS.
 *
 * The session is real: a record is written, it is moved to `in_progress`, and everything recorded
 * into it from here is kept. This screen hands the live handle to the runner — `session-handover.ts`
 * — and `CalendarScreen.tsx` then goes straight to `sessionAddress(...)`, so pressing start OPENS the
 * session rather than leaving it somewhere to be found.
 *
 * CORRECTED, and the correction is the point of this note surviving. Both this sentence and this
 * comment used to say the screen that RUNS a session was still being built and that the session was
 * merely "waiting below" — true when they were written, false since the runner shipped, and shipped
 * copy telling the coach a screen is unbuilt while he is standing on it is the same kind of untruth
 * as a claim about a condition nobody measured. It went wrong a second time when the finish control
 * was wired: picking it up stopped being the only thing he can do with a started session.
 *
 * WHAT IT STILL DOES NOT PROMISE: nothing here says a session ENDS by itself. It does not — leaving
 * the runner leaves the session open, deliberately, and finishing it is a control he presses there.
 */
export const STARTED_WORDS =
  'Started and saved on this device. It opens on the session screen now. If you leave without '
  + 'finishing it, nothing is lost: it waits below under "Sessions you have not finished", and '
  + 'picking it up is the same button.';

/**
 * What to say about the core's answer.
 *
 * A refusal is reported in THE CORE'S OWN WORDS, carried through unchanged. `openSession` writes a
 * sentence for the coach on every reason it can refuse — the session is open in the other window,
 * the session is not on this device, the session has already finished — and each is a sentence
 * somebody wrote for him. A second version here would be two sentences about one refusal, drifting
 * apart from the moment either is edited.
 */
export function describeOutcome(outcome: OpenOutcome): OutcomeReport {
  if (outcome.ok) {
    return {
      started: true,
      headline: STARTED_WORDS,
      detail: null,
      sessionId: outcome.session_id ?? null,
    };
  }

  return {
    started: false,
    headline: outcome.message ?? 'That session could not be opened on this device.',
    detail: null,
    sessionId: outcome.session_id ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// What came of asking for a link
// ═══════════════════════════════════════════════════════════════════════════════

/** What the screen says about the link, after the session has already started. */
export interface MintReport {
  /** True when there is a joining link on the session now. */
  readonly linked: boolean;
  /** The sentence for him. On the good path it is the plain fact; otherwise it carries the exit. */
  readonly headline: string;
  /**
   * True when he should be offered the paste box for the session that HAS ALREADY STARTED.
   *
   * This is what stops the exit being nominal. Every sentence in `google-meet.ts` ends by telling
   * him he can paste a link instead — and a sentence saying that, on a screen with nowhere to paste
   * it, would be a dead end wearing the words of a way out.
   */
  readonly offerPaste: boolean;
  /** The link, when there is one. Read from the entry point; never built. */
  readonly url: string | null;
}

/** Said when a link was made. The plain fact and nothing celebratory. */
export const LINK_MADE = 'A joining link was made for this session and saved with it.';

/** Said when he pasted one onto a session that had already started. The same plain fact. */
export const LINK_PASTED = 'Your link is saved with this session.';

/** What the box for pasting one afterwards is called, and what pressing the button does. */
export const PASTE_AFTERWARDS_LABEL = 'Paste a joining link for this session';
export const PASTE_AFTERWARDS_BUTTON = 'Save this link';

/**
 * What to say about the mint.
 *
 * THE SENTENCES ARE `google-meet.ts`'s OWN, CARRIED THROUGH UNCHANGED — the same rule
 * {@link describeOutcome} follows for the core's refusals. Each of them already names the limitation
 * and then the way out, in that order; a second version written here would be two sentences about
 * one situation, drifting apart from the moment either was edited.
 */
export function describeMint(outcome: MintOutcome): MintReport {
  if (outcome.outcome === 'minted') {
    return { linked: true, headline: LINK_MADE, offerPaste: false, url: outcome.url };
  }
  return { linked: false, headline: outcome.sentence, offerPaste: true, url: null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// The standing sentences
// ═══════════════════════════════════════════════════════════════════════════════

/** What the screen says above everything, so its purpose is not inferred from its controls. */
export const LAUNCHER_INTRO =
  'Choose who is training, the routine they are doing and where you are, then start. Nothing here '
  + 'needs setting up in advance.';

/** The section headings, in the order he works down them. */
export const SECTION_TITLES = Object.freeze({
  clients: 'Who is training',
  routine: 'Which routine',
  mode: MODE_QUESTION,
  glance: 'Last time',
});

/** Said when there is nobody on the register to choose from. */
export const NO_CLIENTS =
  'Nobody is on your register yet. Add the people you train under Clients, on the navigation, and '
  + 'they appear here.';

// ═══════════════════════════════════════════════════════════════════════════════
// A READ THAT FAILED, WHICH IS NOT AN EMPTY REGISTER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * WHICH THIRD of the first read did not come back. A closed set, declared here for the reason
 * {@link MODE_CHOICES} is: this module must hold a sentence for every member, and the set it words
 * and the set `launcher-source.ts` tags must be the same one.
 */
export type LaunchpadReadStage = 'clients' | 'routines' | 'unfinished';

/**
 * THE SENTENCE THAT MADE THE THIRD STATE WORTH HAVING, and every word of it is deliberate.
 *
 * {@link NO_CLIENTS} is what he used to be shown here, and it is worded as a real condition — a fact
 * about his register, with an instruction attached. Over a read that FAILED it told a coach with
 * forty clients that he had none and sent him off to add them. This says the opposite thing, and it
 * says it plainly: the app could not look. AN UNREAD REGISTER IS NOT AN EMPTY ONE.
 *
 * It is deliberately NOT reassuring. He is standing in front of a client and this screen is how he
 * starts the session, so a sentence that let him carry on believing the screen would cost him the
 * one thing this surface is for.
 */
export const COULD_NOT_READ_THE_LAUNCHPAD =
  'This app could not read your calendar from this device. What is below is not your register: it '
  + 'is what this app can see, which right now is nothing.';

/** Which third of the read it was. One sentence per member of {@link LaunchpadReadStage}. */
export const LAUNCHPAD_STAGE_WORDS: Readonly<Record<LaunchpadReadStage, string>> = Object.freeze({
  clients: 'It was the list of people you train that could not be read.',
  routines: 'It was your routines that could not be read.',
  unfinished: 'It was the sessions you have left unfinished that could not be read.',
});

/** Said when the tag is one this module has no sentence for. Never a blank where a fact should be. */
export const LAUNCHPAD_STAGE_UNWORDED = 'This app has not recorded which part of the read it was.';

/**
 * WHAT A FAILED READ DID NOT DO, and this claim is CHECKABLE ON PURPOSE.
 *
 * A sentence about a failure makes a separate claim about the state it left behind, and this build
 * has already shipped two that were false — refusal messages telling the coach a refused save had
 * erased something, when a refusal changes nothing. So this one is kept to what a READ can be held
 * to: reading is not writing, and nothing on the device moved. `launcher-source.test.ts` induces a
 * real failure and READS THE STORE BACK to prove it rather than trusting this paragraph.
 */
export const A_FAILED_READ_CHANGED_NOTHING =
  'Nothing on this device was changed by trying. Whatever is on your register is still on it — this '
  + 'app just cannot see it at the moment.';

/** What to do about it. Try again first, because a read that failed once may not fail twice. */
export const WHAT_TO_DO_ABOUT_A_FAILED_LAUNCHPAD =
  'Close this app and open it again. If it still cannot read your calendar, ask the person who set '
  + 'this app up for you, and show them this screen.';

/** Everything the calendar says when its first read failed. A different report: a different state. */
export interface LaunchpadFailureReport {
  /** The app tried and could not. The one sentence this state exists to make sayable. */
  readonly headline: string;
  /** Which third of the read it was. */
  readonly whatFailed: string;
  /** What this does NOT mean, because he will assume the worse of the two. */
  readonly notAVerdict: string;
  readonly whatToDo: string;
  /** The stage tag, literal, because it is what somebody helping him will search for. */
  readonly stage: string;
  /** The class of what was thrown, literal, for the same reader and the same reason. */
  readonly errorName: string;
}

/**
 * A FAILED FIRST READ, WORDED.
 *
 * Deliberately NOT a variant of the empty-register wording. Every sentence there is a statement
 * about who is on the register, and after a failed read this app has not been able to look at the
 * register — a report that shared them would be one flag away from saying both things at once.
 */
export function describeFailedLaunchpadRead(
  failure: { readonly stage: string; readonly errorName: string },
): LaunchpadFailureReport {
  return {
    headline: COULD_NOT_READ_THE_LAUNCHPAD,
    whatFailed: LAUNCHPAD_STAGE_WORDS[failure.stage as LaunchpadReadStage] ?? LAUNCHPAD_STAGE_UNWORDED,
    notAVerdict: A_FAILED_READ_CHANGED_NOTHING,
    whatToDo: WHAT_TO_DO_ABOUT_A_FAILED_LAUNCHPAD,
    stage: failure.stage,
    errorName: failure.errorName,
  };
}

/**
 * Said when there is no routine in the library to choose from.
 *
 * ## IT USED TO POINT AT ROUTINES, AND THAT WAS A SIGNPOST TO NOWHERE
 *
 * The words were "Build one under Routines, on the navigation, and it appears here." Routines is
 * still a PLACEHOLDER destination — it says so honestly when he gets there, and it cannot build
 * anything. Each half was defensible alone: an empty state that says what to do next is good
 * practice, and a placeholder that admits it is unbuilt is honest. Together they were worse than
 * either, because the app's single instruction led to a screen that could not help, and a coach who
 * follows an instruction and finds nothing concludes the app is BROKEN rather than unfinished.
 *
 * ## SO IT NOW EXPLAINS RATHER THAN DIRECTS
 *
 * And what it explains has become true: the shipped library is now put on the device the first time
 * the app opens there (`platform/library-seeding.ts`), so an empty routine list no longer means "you
 * have not built one yet" — it means the routines that came with the app have been DELETED from this
 * device, which is a decision the coach made and which the app deliberately does not undo behind
 * him. There is no honest instruction to give him yet: putting the shipped set back is the admin
 * reset, and that is not built. Naming it here would be the same fault in a new place.
 *
 * A DIFFERENT SENTENCE IS SHOWN when the seeding could not happen at all — that is not an empty
 * library, it is a failure, and it has its own words and its own thing to do. See
 * `platform/library-seeding.ts` and `librarySnag`.
 */
export const NO_ROUTINES =
  'There are no routines in your library. The exercises and routines this app comes with were put '
  + 'on this device when it first opened here, so an empty list means they have since been deleted '
  + 'from it.';

/** Said above the glance panel before anybody has been chosen. */
export const GLANCE_NOBODY_CHOSEN = 'Choose who is training and their last session appears here.';
