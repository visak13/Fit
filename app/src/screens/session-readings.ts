/**
 * READINGS AND NOTES, CAPTURED WITHOUT LOSING HIS PLACE — the judgement behind every word and every
 * piece of state, decided here so the suite can assert it with no rendering at all.
 *
 * The split every screen in this application follows: `screens/removals.ts` sits beside
 * `screens/RemovalsScreen.tsx`, and the suite drives the module. The drawing is
 * `screens/SessionReadings.tsx`; the writes are `screens/session-readings-source.ts`. This file
 * mounts BESIDE `modular-control.ts` on the runner spine and rebuilds none of it — the six moves,
 * the route, the screen shell and the lease are all somebody else's, finished.
 *
 * ## THE ONE PROPERTY THE CORE CANNOT HOLD, AND THE REASON THIS FILE HOLDS STATE AT ALL
 *
 * `core/session/SESSION.md` §6 names it and hands it over: **capturing a reading for one client must
 * not lose the coach's place.** He is mid-exercise with a client waiting, he takes a heart rate for
 * one of three attendees, and he has to come back to exactly where he was — nothing collapsed,
 * nothing scrolled away, no client silently reselected. No amount of correctness in the record
 * prevents an interface from throwing his position away.
 *
 * So WHERE HE IS is a value in this module rather than something the drawing remembers by accident,
 * and {@link capturePlace} is that value read out on its own. Every write hands back a state whose
 * place is IDENTICAL, and the suite asserts that equality directly. A property nothing can name is a
 * property nothing can check.
 *
 * THE PANEL DELIBERATELY STAYS OPEN WHEN A READING LANDS, and that is where this surface parts
 * company with `modular-control.ts`, on purpose. There, a move that landed closes its panel because
 * the fact is now on the record and the record is what the screen reads back. Here, closing the panel
 * takes a section out of the document under his thumb — the page gets shorter and everything below
 * where he was looking moves up, which is the very thing this action exists to prevent. What clears
 * instead is the VALUE, so the next reading is not a correction of the last one by accident.
 *
 * ## WHERE HE IS LOOKING IS NOT WHERE THE SESSION HAS GOT TO
 *
 * `SESSION.md` §2: anything describing where a session has got to is DERIVED, never persisted — no
 * cursor, no current exercise, no step index, not on the record, not in a view and not in anything a
 * screen sends anywhere. {@link CaptureState} is not that. It is which panel he has open and what he
 * has typed into it, it is passed to nothing, and the suite asserts the absence on this module's
 * output and on its own code lines, pointing each scan at a known positive first.
 *
 * ## PER CLIENT, ALWAYS
 *
 * A reading belongs to ONE person and a note is EITHER one person's or the whole session's — the core
 * distinguishes those two and nothing here infers one from the other. Every draft is keyed by that
 * person, so capturing for one client cannot carry a value onto another's row, and the readings and
 * notes read back for a card are read out of that client's own slice of the projection.
 *
 * ## IT SHOWS. IT DOES NOT SUGGEST
 *
 * Nothing here proposes a heavier load, a longer hold or more repetitions, nothing compares two
 * sessions to derive a direction, and nothing carries a value forward from one session into the next.
 * A reading is a measurement he took, read back exactly as he recorded it. The suite asserts that on
 * the WORDS THAT REACH HIM, not on the comment explaining it.
 */

import { READING_KINDS, READING_UNITS } from '../../core/model/vocabularies.js';
import type { GlyphName } from '../design/glyphs.generated.ts';
import type { RefusalReport } from './modular-control';

// ═══════════════════════════════════════════════════════════════════════════════
// What a reading IS, and none of this vocabulary is this file's to invent
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * WHAT EACH READING KIND IS CALLED, in the coach's words rather than the record's.
 *
 * The KEYS are not this file's: `core/model/vocabularies.js` owns the kinds and pins each one to the
 * unit it is measured in, so a plank recorded in beats per minute is refused rather than charted.
 * This is the reading side of that one truth, and it is A MIRROR — so the suite requires every kind
 * the core knows to have words here and every key here to be one the core knows. If the vocabulary
 * ever grows a kind, the disagreement is the alarm rather than a machine key appearing on the screen
 * he reads with a client in front of him.
 */
export const READING_KIND_LABELS: Readonly<Record<string, string>> = Object.freeze({
  'heart-rate': 'Heart rate',
  'resting-heart-rate': 'Resting heart rate',
  'plank-hold': 'Plank hold',
  'hollow-hold': 'Hollow hold',
  'wall-sit': 'Wall sit',
  'dead-hang': 'Dead hang',
});

/**
 * How each unit reads at the end of a number.
 *
 * `count` reads as NOTHING, deliberately: "twelve count" is not a thing anybody says, and the kind's
 * own name already says what was counted. A unit the vocabulary grows later falls through to its own
 * key, which is honest rather than silently dropped.
 */
const UNIT_WORDS: Readonly<Record<string, string>> = Object.freeze({
  bpm: 'bpm',
  seconds: 'seconds',
  repetitions: 'reps',
  count: '',
});

/**
 * The kinds offered in the picker, in the order they are offered.
 *
 * READ OUT OF THE CORE'S OWN VOCABULARY rather than listed again here, so a kind cannot be offered
 * that the record would refuse and a kind the core knows cannot quietly go missing from the picker.
 */
export const READING_KINDS_OFFERED: readonly string[] = Object.freeze(Object.keys(READING_KINDS));

/**
 * The value of the picker's last entry: a kind the coach invented.
 *
 * The vocabulary is OPEN on purpose — everything in this application is his to configure — and a
 * custom kind has no pinned unit to fall back on, so it must name one. This is a SENTINEL and never a
 * stored kind: it contains a character a content key cannot, so it could not be mistaken for one even
 * if it reached the record.
 */
export const CUSTOM_KIND = '::something-else';

/** The units a custom kind may name. The core's own list, not a second one. */
export const UNITS_OFFERED: readonly string[] = READING_UNITS;

/**
 * WHEN THE READING WAS TAKEN, and this is the flexibility the requirement names.
 *
 * The coach takes readings during a session or just after it, and both belong INSIDE the routine
 * rather than in a separate place he has to go to. `standalone` is the core's third context and is
 * deliberately NOT offered here: a reading taken outside a session entirely is not a thing this
 * screen can capture, because this screen only exists while one is open.
 */
export const WHEN_OFFERED: readonly string[] = Object.freeze(['in_session', 'post_session']);

/** What each of those two reads as. A mirror of {@link WHEN_OFFERED}, asserted against the core. */
export const WHEN_LABELS: Readonly<Record<string, string>> = Object.freeze({
  in_session: 'During the session',
  post_session: 'Just after it',
});

/**
 * How long a reading's note may be, mirroring `core/model/entities/reading.js`.
 *
 * A reading's note is 300 characters and a session note is 2000 — two different bounds on two
 * different records, so they are two different numbers here rather than one convenient one. Both are
 * pinned by an agreement test that drives the REAL validators at each boundary.
 */
export const READING_NOTE_MAX = 300;

/** How long a note may be, mirroring `core/model/entities/session-note.js`. */
export const NOTE_MAX = 2000;

/**
 * NO CEILING OF THIS FILE'S OWN ON THE VALUE, and that is a decision rather than an omission.
 *
 * The record requires a finite number of at least nought and sets no upper bound, because there is no
 * honest one: a dead hang in seconds, a heart rate in beats per minute and a count of repetitions do
 * not share a ceiling. A mirror inventing one would refuse a value he could legitimately record,
 * which is the failure the agreement test in `modular-control.test.ts` exists to catch — so this file
 * refuses exactly what the record refuses and nothing more.
 */
export const READING_VALUE_MIN = 0;

/** A content key, as `core/model/primitives.js` defines one. A custom kind must be one. */
const CONTENT_KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// ═══════════════════════════════════════════════════════════════════════════════
// What he has typed
// ═══════════════════════════════════════════════════════════════════════════════

/** One reading, exactly as he typed it. Strings, because a half-typed number is a real state. */
export interface ReadingDraft {
  /** A key from {@link READING_KINDS_OFFERED}, or {@link CUSTOM_KIND}. */
  readonly kind: string;
  /** The key he typed, when the kind is his own. Ignored otherwise. */
  readonly customKind: string;
  /** The unit he named, when the kind is his own. A known kind's unit is pinned and not his to set. */
  readonly customUnit: string;
  readonly value: string;
  readonly note: string;
  /** One of {@link WHEN_OFFERED}. */
  readonly when: string;
}

/** Which value of a reading draft a keystroke is about. */
export type ReadingField = 'kind' | 'customKind' | 'customUnit' | 'value' | 'note' | 'when';

/**
 * A fresh draft.
 *
 * The kind opens on the FIRST kind the vocabulary offers rather than on nothing, so the commonest
 * reading in the requirement — a heart rate — is one field away. That is a default and not a
 * proposal: it says nothing about this client, this exercise or this session.
 */
export const EMPTY_READING: ReadingDraft = Object.freeze({
  kind: READING_KINDS_OFFERED[0],
  customKind: '',
  customUnit: UNITS_OFFERED[0],
  value: '',
  note: '',
  when: WHEN_OFFERED[0],
});

/** One keystroke. A whole draft back, so the caller holds one value and never six. */
export function editReading(draft: ReadingDraft, field: ReadingField, value: string): ReadingDraft {
  return { ...draft, [field]: value };
}

/** The kind a draft would record: the picker's key, or the one he typed. */
export function kindOfDraft(draft: ReadingDraft): string {
  return draft.kind === CUSTOM_KIND ? draft.customKind.trim() : draft.kind;
}

/**
 * THE UNIT A DRAFT WOULD RECORD, and it is PINNED wherever the core pins it.
 *
 * A known kind's unit is not his to choose and not this file's to guess — `READING_KINDS` says a
 * plank hold is seconds, and offering him a unit for it would let him record a plank in beats per
 * minute by a mis-tap, which the record would then refuse in front of a client. A kind he invented
 * has no pinned unit, so there it is the one he named.
 */
export function unitOfDraft(draft: ReadingDraft): string {
  const pinned = READING_KINDS[kindOfDraft(draft)];
  if (typeof pinned === 'string' && pinned.length > 0) return pinned;
  return draft.customUnit.trim();
}

/** True when the kind is the coach's own, so the drawing knows to ask for a key and a unit. */
export function isCustomKind(draft: ReadingDraft): boolean {
  return draft.kind === CUSTOM_KIND;
}

/**
 * WHY A READING CANNOT BE RECORDED WHEN HE HAS NOT TYPED THE NUMBER, named so that
 * {@link readingProblemShown} can tell it apart from a mistake he has actually made.
 *
 * DECLARED BEFORE THE FUNCTION THAT READS IT. Module-scope `const` is hoisted uninitialised, so a
 * reference from a function called after the module finished evaluating is fine — but this file is
 * hot-reloaded during development, and a partially applied module graph found it undefined and threw
 * inside a render. A constant read by a function belongs above it.
 */
export const NO_NUMBER_YET = 'A reading needs the number you measured.';

/**
 * WHAT IS WRONG WITH A READING DRAFT, in a sentence he can act on, or null when nothing is.
 *
 * Checked at the field rather than at the record. The record would refuse it too — that is the
 * authority and it stays the authority — but its issue is written for whoever is reading a validation
 * list, and this one is read mid-session by a coach with a client waiting.
 */
export function readingProblem(draft: ReadingDraft): string | null {
  const kind = kindOfDraft(draft);
  if (kind.length === 0) {
    return 'Name what you measured, in lowercase words joined by hyphens, for example grip-strength.';
  }
  if (!CONTENT_KEY.test(kind)) {
    return `"${kind}" cannot be recorded as a kind of reading. Use lowercase letters, digits and `
      + 'single hyphens, for example grip-strength.';
  }
  if (unitOfDraft(draft).length === 0) {
    return 'Say what that is measured in, so the number means something when you read it back.';
  }

  const typed = draft.value.trim();
  if (typed.length === 0) return NO_NUMBER_YET;
  const value = Number(typed);
  if (!Number.isFinite(value)) return `"${typed}" is not a number this can record.`;
  if (value < READING_VALUE_MIN) return 'A reading cannot be less than nought.';

  if (draft.note.trim().length > READING_NOTE_MAX) {
    return `The note on a reading holds ${READING_NOTE_MAX} characters. Anything longer belongs in a `
      + 'note of its own.';
  }
  if (!WHEN_OFFERED.includes(draft.when)) {
    return 'Say whether you took that during the session or just after it.';
  }
  return null;
}

/**
 * THE PROBLEM WORTH DRAWING, which is not every problem.
 *
 * A FIELD HE HAS NOT FILLED IN YET IS NOT A MISTAKE HE HAS MADE. Measured by looking (s6/a5): the
 * panel opened with "A reading needs the number you measured" already on it, telling him off for not
 * having typed into a box he had just that moment opened. The control that records is refused anyway
 * and the empty box says the same thing without the reprimand.
 *
 * Every OTHER problem is drawn as soon as it is true — a kind of his own that cannot be recorded, a
 * unit he has not named, a number that is not one — because each of those is a thing he did type and
 * would otherwise be refused by a control with no sentence beside it.
 */
export function readingProblemShown(draft: ReadingDraft): string | null {
  const problem = readingProblem(draft);
  if (problem === NO_NUMBER_YET) return null;
  return problem;
}

/** What a reading draft records, in the shape `LiveSession.recordReading` takes. */
export interface ReadingValues {
  readonly kind: string;
  readonly value: number;
  readonly unit: string;
  readonly context: string;
  readonly note?: string;
}

/**
 * The reading a draft records, or null when it cannot be recorded.
 *
 * Refuses rather than guesses: an unusable draft has a sentence from {@link readingProblem} and this
 * returns null, so a screen cannot record half of what he typed. The note is omitted where he left it
 * empty, because an absent key is what the record reads as nothing recorded.
 */
export function readingFromDraft(draft: ReadingDraft): ReadingValues | null {
  if (readingProblem(draft) !== null) return null;
  const note = draft.note.trim();
  return {
    kind: kindOfDraft(draft),
    value: Number(draft.value.trim()),
    unit: unitOfDraft(draft),
    context: draft.when,
    ...(note.length > 0 ? { note } : {}),
  };
}

/** Why a note cannot be recorded when he has not written one. Above its reader, as above. */
export const NO_NOTE_YET = 'A note needs something in it.';

/**
 * WHAT IS WRONG WITH A NOTE, or null when nothing is.
 *
 * An empty note is refused rather than recorded as a blank fact: the record requires at least one
 * character, and a note that says nothing is a row he has to read to find out it says nothing.
 */
export function noteProblem(text: string): string | null {
  const typed = text.trim();
  if (typed.length === 0) return NO_NOTE_YET;
  if (typed.length > NOTE_MAX) {
    return `A note holds ${NOTE_MAX} characters. This one is ${typed.length}.`;
  }
  return null;
}

/**
 * The note problem worth drawing — which an empty box he has just opened is not. Same reading as
 * {@link readingProblemShown}, for the same reason.
 */
export function noteProblemShown(text: string): string | null {
  const problem = noteProblem(text);
  return problem === NO_NOTE_YET ? null : problem;
}

/** The text a note records, or null when it cannot be recorded. */
export function noteFromDraft(text: string): string | null {
  return noteProblem(text) === null ? text.trim() : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WHERE HE IS — this screen's own transient state, and the thing that must survive a write
// ═══════════════════════════════════════════════════════════════════════════════

/** Which of the two things he has open. */
export type CaptureKind = 'reading' | 'note';

/**
 * WHOSE PANEL IS OPEN.
 *
 * `clientId` null means the note is about the SESSION as a whole. That null is the feature rather
 * than a missing value: the core distinguishes a note about one person from a note about the session,
 * one follows that person into their export and the other belongs to nobody, and nothing here infers
 * one from the other.
 */
export interface OpenCapture {
  readonly kind: CaptureKind;
  readonly clientId: string | null;
}

/**
 * EVERYTHING THIS SURFACE REMEMBERS, AND NONE OF IT IS A POSITION IN THE SESSION.
 *
 * Held in ONE value at screen level so the property the action turns on can be asserted with no
 * rendering at all: a reading captured for one of three clients leaves everything else exactly as it
 * was. Held at screen level rather than inside each card for the same reason `ControlState` is —
 * one panel open at a time, and what he typed survives putting it away.
 */
export interface CaptureState {
  /** The one panel open, or null when none is. */
  readonly open: OpenCapture | null;
  /** What has been typed as a reading, per client. */
  readonly readings: ReadonlyMap<string, ReadingDraft>;
  /** What has been typed as a note, by {@link noteKey}. */
  readonly notes: ReadonlyMap<string, string>;
  /**
   * WHOSE PREVIOUS SESSION HE HAS EXPANDED, and this is half of "nothing collapsed".
   *
   * A section he opened is a section he opened. Recording a reading may not shut it, which is exactly
   * the kind of thing a screen does by accident when a write re-reads the world.
   */
  readonly openGlances: ReadonlySet<string>;
  /** What was recorded, said back to him where he recorded it, by key. */
  readonly confirmed: ReadonlyMap<string, string>;
  /** The last refusal, until he does something else. Never cleared by time. */
  readonly refusal: RefusalWords | null;
  /** Which panel the refusal belongs to, so it is drawn where it happened. */
  readonly refusalKey: string | null;
  /** True while a capture is in flight, so one press records one fact. */
  readonly recording: boolean;
}

/**
 * A refusal, in the coach's words.
 *
 * THE SAME TYPE `modular-control.ts` produces, aliased rather than declared again, because this
 * surface uses that module's `describeRefusal` rather than growing a second version of it: the
 * journal-full sentence is the core's own, and two screens wording one refusal is two sentences free
 * to drift apart, where the one he reads depends on which control he happened to press.
 */
export type RefusalWords = RefusalReport;

/** Nothing open, nothing typed, nothing refused. */
export function noCaptures(): CaptureState {
  return {
    open: null,
    readings: new Map(),
    notes: new Map(),
    openGlances: new Set(),
    confirmed: new Map(),
    refusal: null,
    refusalKey: null,
    recording: false,
  };
}

/**
 * WHICH PANEL A DRAFT, A CONFIRMATION OR A REFUSAL BELONGS TO.
 *
 * Per client, always, and per kind: the reading he is typing for one person and the note he is
 * typing for another are two drafts, and the session's own note is a third. The separator is a pair
 * of colons because neither a record identity nor a content key contains one. The session-wide note
 * is keyed by a word rather than by an empty string, so a key can never be produced by accident from
 * a client identity that failed to arrive.
 */
export function captureKey(kind: CaptureKind, clientId: string | null): string {
  return `${kind}::${clientId ?? 'the-session'}`;
}

/** The key a note is held under. The session's own note has no client and that is deliberate. */
export function noteKey(clientId: string | null): string {
  return captureKey('note', clientId);
}

/**
 * WHERE HE IS, ON ITS OWN, so that "he did not lose his place" is one comparison.
 *
 * Everything a capture must leave untouched and nothing it is allowed to change. Not the drafts —
 * clearing the value he just recorded is correct — and not the confirmation, which is the whole point
 * of recording. What may not move is which panel is open, whose it is, and what he had expanded.
 */
export interface Place {
  readonly kind: CaptureKind | null;
  /** Whose panel is open. The SELECTION, which must never change by itself. */
  readonly clientId: string | null;
  /** Whose previous session is expanded, in a stable order so two places compare cleanly. */
  readonly openGlances: readonly string[];
}

/** Read his place out of the state. */
export function capturePlace(state: CaptureState): Place {
  return {
    kind: state.open?.kind ?? null,
    clientId: state.open?.clientId ?? null,
    openGlances: [...state.openGlances].sort(),
  };
}

/**
 * OPEN A PANEL, on one person or on the session.
 *
 * ONE AT A TIME. On a phone, two open panels is a screen he has to scroll to read, and this is used
 * with a client waiting. Pressing the control of the panel that is already open puts it away, so the
 * control that got him here is the control that gets him out.
 *
 * The draft is seeded ONCE. Reopening keeps what he typed, because re-seeding would silently throw
 * away the number he had entered while a client was talking to him.
 */
export function openCapture(state: CaptureState, target: OpenCapture): CaptureState {
  if (state.open !== null
    && state.open.kind === target.kind && state.open.clientId === target.clientId) {
    return closeCapture(state);
  }

  let { readings, notes } = state;
  if (target.kind === 'reading' && target.clientId !== null && !readings.has(target.clientId)) {
    readings = new Map(readings).set(target.clientId, EMPTY_READING);
  }
  if (target.kind === 'note') {
    const key = noteKey(target.clientId);
    if (!notes.has(key)) notes = new Map(notes).set(key, '');
  }

  return { ...state, readings, notes, open: target, refusal: null, refusalKey: null };
}

/** Put the panel away. What he typed is kept; see {@link CaptureState}. */
export function closeCapture(state: CaptureState): CaptureState {
  return { ...state, open: null };
}

/**
 * ONE KEYSTROKE, INTO THE OPEN PANEL'S DRAFT AND NOWHERE ELSE.
 *
 * The person comes from the OPEN PANEL rather than from the caller, so a keystroke cannot land on
 * another client's reading even by a caller's mistake. That is the per-client rule made structural at
 * the screen as well as in the record.
 */
export function changeReading(
  state: CaptureState,
  field: ReadingField,
  value: string,
): CaptureState {
  const open = state.open;
  if (open === null || open.kind !== 'reading' || open.clientId === null) return state;
  const held = state.readings.get(open.clientId) ?? EMPTY_READING;
  const readings = new Map(state.readings).set(open.clientId, editReading(held, field, value));
  return { ...state, readings, refusal: null, refusalKey: null };
}

/** One keystroke into the open NOTE, whether it is a person's or the session's. */
export function changeNote(state: CaptureState, text: string): CaptureState {
  const open = state.open;
  if (open === null || open.kind !== 'note') return state;
  const notes = new Map(state.notes).set(noteKey(open.clientId), text);
  return { ...state, notes, refusal: null, refusalKey: null };
}

/** What has been typed as a reading for one person, or a fresh draft where nothing has. */
export function readingDraftOf(state: CaptureState, clientId: string): ReadingDraft {
  return state.readings.get(clientId) ?? EMPTY_READING;
}

/** What has been typed as a note for one person, or for the session when the client is null. */
export function noteDraftOf(state: CaptureState, clientId: string | null): string {
  return state.notes.get(noteKey(clientId)) ?? '';
}

/**
 * EXPAND OR COLLAPSE ONE PERSON'S PREVIOUS SESSION.
 *
 * His own doing, and the only thing that may change it. Nothing else in this module touches
 * {@link CaptureState.openGlances} — see {@link capturePlace}.
 */
export function toggleGlance(state: CaptureState, clientId: string): CaptureState {
  const openGlances = new Set(state.openGlances);
  if (!openGlances.delete(clientId)) openGlances.add(clientId);
  return { ...state, openGlances };
}

/** True when this person's previous session is expanded. */
export function glanceIsOpen(state: CaptureState, clientId: string): boolean {
  return state.openGlances.has(clientId);
}

/** A capture is in flight, so nothing else may be pressed into the same session. */
export function capturing(state: CaptureState, inFlight: boolean): CaptureState {
  return { ...state, recording: inFlight };
}

/**
 * A CAPTURE WAS REFUSED, and the panel stays open with what he typed still in it.
 *
 * Closing it would take the number away from him at the moment he has to act on it, and he would
 * have to measure again to find out whether the refusal was about the number at all. The journal
 * being full is the reachable case this matters most for: the record is intact, the session is simply
 * full, and what he was holding is still in front of him.
 */
export function captureRefused(
  state: CaptureState,
  key: string,
  refusal: RefusalWords,
): CaptureState {
  return { ...state, refusal, refusalKey: key, recording: false };
}

/**
 * A READING LANDED — AND HIS PLACE DOES NOT MOVE.
 *
 * The panel stays open, the client stays selected, every expanded section stays expanded. What
 * changes is exactly two things: the number and its note are cleared, so the next reading is not a
 * correction of the last one by accident, and a sentence appears saying what went on the record. The
 * kind, the unit and the when are KEPT, because a second reading in the same moment is usually the
 * same kind for the same person and re-picking it is a tap he does not need with a client waiting.
 *
 * @param words what was recorded, said back to him
 */
export function readingRecorded(
  state: CaptureState,
  clientId: string,
  words: string,
): CaptureState {
  const held = readingDraftOf(state, clientId);
  const readings = new Map(state.readings).set(clientId, { ...held, value: '', note: '' });
  const confirmed = new Map(state.confirmed).set(captureKey('reading', clientId), words);
  return { ...state, readings, confirmed, refusal: null, refusalKey: null, recording: false };
}

/**
 * A NOTE LANDED, and his place does not move either.
 *
 * The text is cleared because it is now on the record and the record is what the screen reads back;
 * leaving it in the box would have him record the same note twice, reading it as a draft he had not
 * finished.
 */
export function noteRecorded(
  state: CaptureState,
  clientId: string | null,
  words: string,
): CaptureState {
  const key = noteKey(clientId);
  const notes = new Map(state.notes).set(key, '');
  const confirmed = new Map(state.confirmed).set(key, words);
  return { ...state, notes, confirmed, refusal: null, refusalKey: null, recording: false };
}

/** What was last recorded through one panel, or null when nothing has been. */
export function confirmationFor(state: CaptureState, key: string): string | null {
  return state.confirmed.get(key) ?? null;
}

/** The refusal to draw on one panel, or null when the last refusal was not this one's. */
export function refusalFor(state: CaptureState, key: string): RefusalWords | null {
  return state.refusal !== null && state.refusalKey === key ? state.refusal : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// What is already on the record
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ONE READING, WORDED.
 *
 * The kind reaches him as WORDS and never as its content key. That is the same defect a substitute's
 * name was found with in this screen's own family (s6/a4): a session references vocabulary by key,
 * and rendered straight the panel tells him he measured `hollow-hold` — a machine's word, on the
 * screen he reads with a client in front of him. A kind he invented is titled from his own key,
 * because that key is words he wrote.
 */
export function readingWords(kind: string, value: number, unit: string): string {
  const label = READING_KIND_LABELS[kind] ?? titled(kind);
  const unitWord = UNIT_WORDS[unit] ?? unit;
  return unitWord.length === 0 ? `${label} ${value}` : `${label} ${value} ${unitWord}`;
}

/** One reading on the record, as this surface draws it. */
export interface ReadingRow {
  readonly recordId: string;
  /** What was measured, worded. His own number, read back exactly as he recorded it. */
  readonly words: string;
  /** Which glyph says what class of thing this is, chosen by the UNIT and never by the kind. */
  readonly glyph: GlyphName;
  /** Said only when it was taken after the session rather than during it. */
  readonly whenWords: string | null;
  /** His own note on the reading, or null. */
  readonly note: string | null;
}

/**
 * THE GLYPH FOR A READING, CHOSEN BY ITS UNIT.
 *
 * By the unit rather than by the kind, so a kind the coach invents gets a picture that is right
 * about what class of thing it is instead of falling back to a blank. There is no glyph that means
 * "a reading of some sort" in the family, and inventing a mapping per kind would need a new entry
 * every time he names one.
 */
function glyphForUnit(unit: string): GlyphName {
  if (unit === 'bpm') return 'reading-heart-rate';
  if (unit === 'seconds') return 'reading-timer';
  if (unit === 'repetitions') return 'reading-repetition-count';
  return 'reading-held-position';
}

/** As much of the projection as this module reads. `projection.js` owns the rest. */
export interface ProjectedForCapture {
  readonly clients: readonly {
    readonly client_id: string;
    readonly readings: readonly {
      readonly record_id: string;
      readonly content?: {
        readonly kind?: string;
        readonly value?: number;
        readonly unit?: string;
        readonly context?: string;
        readonly note?: string | null;
      };
    }[];
    readonly notes: readonly {
      readonly record_id: string;
      readonly content?: { readonly text?: string; readonly taken_at?: string };
    }[];
  }[];
}

/**
 * ONE PERSON'S READINGS, READ OUT OF THEIR OWN SLICE OF THE PROJECTION.
 *
 * Their own slice and never a filter over everybody's: the projection already keeps each attendee's
 * readings apart, and re-deriving that here would be a second place where one client's numbers could
 * end up in another's panel. A person who is not in the view has no readings rather than everybody's.
 */
export function readingsOf(
  view: ProjectedForCapture,
  clientId: string,
): readonly ReadingRow[] {
  const client = view.clients.find((each) => each.client_id === clientId);
  if (client === undefined) return [];

  return client.readings.map((record) => {
    const content = record.content ?? {};
    const kind = content.kind ?? '';
    const unit = content.unit ?? '';
    const note = typeof content.note === 'string' && content.note.length > 0 ? content.note : null;
    return {
      recordId: record.record_id,
      words: readingWords(kind, content.value ?? 0, unit),
      glyph: glyphForUnit(unit),
      whenWords: content.context === 'post_session' ? WHEN_LABELS.post_session : null,
      note,
    };
  });
}

/** One note on the record. */
export interface NoteRow {
  readonly recordId: string;
  readonly text: string;
}

/**
 * ONE PERSON'S NOTES, from their own slice.
 *
 * A note WITH a client is that person's and follows them into their export; the session's own notes
 * are not here and are not mixed in, because inferring one from the other would put one client's note
 * into another's record.
 */
export function notesOf(view: ProjectedForCapture, clientId: string): readonly NoteRow[] {
  const client = view.clients.find((each) => each.client_id === clientId);
  if (client === undefined) return [];
  return client.notes
    .map((record) => ({ recordId: record.record_id, text: record.content?.text ?? '' }))
    .filter((row) => row.text.length > 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// What this surface says
// ═══════════════════════════════════════════════════════════════════════════════

/** The words on the control that opens the reading panel. */
export const READING_LABEL = 'Take a reading';

/** The heading on the panel, so it is not an unlabelled box. */
export const READING_TITLE = 'A reading for this person';

/**
 * WHOSE READING THIS IS, in ONE LINE.
 *
 * It names the person because the panel is inside their card and a coach reading it mid-session with
 * three people on screen should not have to work out which card he is in. It says nothing is worked
 * out from the number, which is the standing principle: the application supports and the coach
 * decides.
 *
 * MEASURED (s6/a5): the first version of this sentence also said the reading is taken at the moment he
 * takes it, without leaving the routine — three lines at 390px, saying again what
 * {@link CAPTURE_INTRO} says once above. On a panel that was already taller than a phone's viewport,
 * the same sentence twice is what gets cut.
 */
export function readingWhoseWords(clientName: string): string {
  return `Recorded against ${clientName} only. Yours to record; nothing is worked out from it.`;
}

/** The words on each field of the reading panel. */
export const READING_FIELD_LABELS = Object.freeze({
  kind: 'What you measured',
  customKind: 'Name it yourself',
  customUnit: 'Measured in',
  value: 'The number',
  note: 'Note on this reading',
  when: 'When you took it',
});

/**
 * THE NUMBER FIELD'S LABEL, CARRYING THE UNIT the core pinned for the kind he picked.
 *
 * In the LABEL rather than in a hint below the field, which is where it started: a line of its own
 * under every field is how a panel becomes taller than the phone it is read on, and the unit is part
 * of what the field is asking for rather than a note about it. A kind of his own names its unit in a
 * field of its own, so there is nothing to carry here.
 */
export function valueLabel(draft: ReadingDraft): string {
  const unit = unitOfDraft(draft);
  return isCustomKind(draft) || unit.length === 0
    ? READING_FIELD_LABELS.value
    : `${READING_FIELD_LABELS.value}, in ${unit}`;
}

/** What the picker's last entry says. */
export const CUSTOM_KIND_LABEL = 'Something else';

/** What to type into a kind of his own, said where he types it. */
export const CUSTOM_KIND_HINT =
  'Lowercase words joined by hyphens, for example grip-strength. Say what it is measured in as well, '
  + 'because this is your own kind and the app has no unit pinned for it.';

/*
 * THERE IS NO SENTENCE UNDER "WHEN YOU TOOK IT", and there was one. It said that a reading taken just
 * after the session is recorded as that, so reading it back later says which it was — true, and
 * already the whole content of the two answers he is choosing between. Measured at 390px (s6/a5): two
 * more lines on a panel that did not fit the viewport, explaining a choice that explains itself.
 */

/** The words on the control that records the reading. */
export const RECORD_READING_LABEL = 'Record the reading';

/** The heading over the readings already taken for one person in this session. */
export const READINGS_TAKEN_TITLE = 'Readings taken';

/** The words on the control that opens a note about one person. */
export const NOTE_ABOUT_CLIENT_LABEL = 'Note about this person';

/** The words on the control that opens a note about the session as a whole. */
export const NOTE_ABOUT_SESSION_LABEL = 'Note about the session';

/** The heading on a note about one person. */
export const NOTE_ABOUT_CLIENT_TITLE = 'A note about this person';

/** The heading on a note about the whole session. */
export const NOTE_ABOUT_SESSION_TITLE = 'A note about this session';

/**
 * WHAT A NOTE ABOUT ONE PERSON IS FOR, AND WHAT MUST NOT GO IN IT.
 *
 * `core/model/entities/session-note.js` obliges the interface that renders this record to say so at
 * the point of entry, and the obligation is the reason rather than the decoration: an in-session note
 * is PLAINTEXT — stored, synchronised and backed up in the clear — and a free-text box invites
 * clinical detail. So the box says what it is for and where the clinical detail belongs, in the same
 * plain terms the register uses for the same reason.
 */
export function noteAboutClientWords(clientName: string): string {
  return `How it went for ${clientName}, and anything you want to remember. It follows them, so it `
    + 'reaches their progress view and their export. Kept as plain text and backed up as plain text, '
    + 'so a medical detail belongs in your own private records rather than here.';
}

/** What a note about the whole session is for, and that it belongs to nobody in particular. */
export const NOTE_ABOUT_SESSION_WORDS =
  'About the session itself rather than about one person, so it reaches nobody\'s export. Kept as '
  + 'plain text and backed up as plain text, so a medical detail belongs in your own private records '
  + 'rather than here.';

/** The words on the control that records a note. */
export const RECORD_NOTE_LABEL = 'Record the note';

/** The heading over the notes already taken about one person in this session. */
export const NOTES_TAKEN_TITLE = 'Notes about this person';

/** The words on the control that puts a panel away without recording anything. */
export const LEAVE_IT_LABEL = 'Leave it';

/** The words on the control that expands one person's previous session. */
export const GLANCE_MORE_LABEL = 'What they did, line by line';

/** The words on the control that collapses it again. */
export const GLANCE_LESS_LABEL = 'Close that';

/**
 * SAID WHILE THE PREVIOUS SESSION IS STILL BEING READ.
 *
 * Not an empty panel and not a first session: a history that has not been read yet and a client who
 * has never trained are different facts, and drawing the second for the first would tell him a
 * regular client has no past.
 */
export const GLANCE_READING_WORDS = 'Reading their last session…';

/**
 * WHAT THE READING AND NOTE CONTROLS DO, said ONCE for the whole screen.
 *
 * Once, beside the session's own note, rather than inside each of three people's cards — the same
 * choice `CONTROLS_INTRO` makes for the six moves and for the same measured reason: three lines
 * repeated for each attendee is a wall of text on the screen he reads with a client in front of him.
 */
export const CAPTURE_INTRO =
  'Recording a reading or a note leaves the session exactly where it is on your screen.';

/**
 * WHAT THE PANEL'S OWN STATUS LINE SAYS BEFORE ANYTHING HAS GONE THROUGH IT.
 *
 * It exists so that the line is DRAWN FROM THE MOMENT THE PANEL OPENS rather than appearing when a
 * reading lands. A line that appears is a line that makes the panel taller, and everything below it —
 * the routine he was working through — moves down by its height at the moment he presses Record. That
 * is the "nothing scrolled away" half of this action's one property, and it is cheaper to hold by
 * drawing the line always than by remembering not to.
 *
 * Nought is a state rather than the absence of one, which is the same reading every count on this
 * build gets.
 */
export const NOTHING_RECORDED_YET = 'Nothing recorded from here yet.';

/**
 * WHAT ONE RECORDED READING SAYS BACK TO HIM, so a press has a visible consequence.
 *
 * It does NOT name the person, and it did. The panel it is drawn in already says whose reading this is
 * — {@link readingWhoseWords} — and the name was what tipped this sentence onto a second line at 390px,
 * which made the panel taller and moved the routine below it. The words that go on a line whose height
 * is reserved are kept short where they are written.
 */
export function readingRecordedWords(words: string): string {
  return `Recorded: ${words}.`;
}

/** What one recorded note says back to him. */
export const NOTE_RECORDED_WORDS = 'That note is on the record.';

// ── internals ───────────────────────────────────────────────────────────────────────────────────

/**
 * A content key as words: hyphens become spaces and the first letter is capitalised.
 *
 * For a kind the COACH invented, which is the only case that reaches here — the kinds the app knows
 * have their words in {@link READING_KIND_LABELS}, asserted. His own key is already words he wrote,
 * so titling it is the whole of what is needed and inventing anything more would be a machine
 * rewriting his own wording.
 */
function titled(key: string): string {
  const words = key.replace(/-/g, ' ').trim();
  return words.length === 0 ? key : words.charAt(0).toUpperCase() + words.slice(1);
}
