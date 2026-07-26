/**
 * MODULAR CONTROL OF A RUNNING SESSION — the judgement behind every control, decided here so the
 * suite can assert it with no rendering at all.
 *
 * The split every screen in this application follows: `screens/removals.ts` sits beside
 * `screens/RemovalsScreen.tsx`, and the suite drives the module. The drawing is
 * `screens/SessionControls.tsx`; the writes are `screens/modular-control-source.ts`.
 *
 * ## THE PRINCIPLE THIS FILE EXISTS TO KEEP
 *
 * The application is a SUPPORTING ROLE. A linear press-play timeline would make it the DRIVER of the
 * session, and this one tracks what happened and never dictates what happens after. So every control
 * here is available on EVERY line, at every moment, whatever has or has not been recorded against any
 * other line. The coach jumps, reorders, skips, repeats, substitutes and edits, and none of those is
 * a mode he has to enter.
 *
 * ## THE SIX MOVES ARE NOT SIX FEATURES
 *
 * `core/session/SESSION.md` §4 already records all six against the verbs that record them, and
 * `core/session` is finished. Nothing here reimplements one. What this file adds is only the WORDING
 * and the DRAFT VALUES, and it is worth naming which of the six needs no control of its own:
 *
 *   - **jump** — recording any line at any time IS the jump. There is no control called "jump",
 *     because a control called "jump" would imply somewhere he is jumping FROM.
 *   - **reorder** — the order the facts were appended. Same answer, same reason. Nothing here
 *     rearranges the routine, which is the coach's library record and not this session's business.
 *   - **repeat** — recording a line that already has something against it. A second fact at a later
 *     position; the first is not touched. {@link controlsFor} words it as the ACT and not as advice.
 *   - **skip**, **substitute**, **edit** — the three with a control of their own.
 *
 * ## NOTHING HERE SAYS WHERE HE HAS GOT TO
 *
 * `SESSION.md` §2: anything describing where a session has got to is DERIVED, never persisted — no
 * cursor, no current exercise, no step index, not on the record and not in a view and not in what a
 * screen sends anywhere. Where he is LOOKING — which line he has open to adjust — is the drawing's
 * own transient state and it is passed to nothing. The suite asserts that absence on this module's
 * output and on its own source, and points each scan at a known positive first, because a scan whose
 * whole result is an absence proves nothing until it has been seen to find something.
 *
 * `not_yet_recorded` is not a suggestion and this is the file that could quietly turn it into one:
 * by disabling a control on a line he has already done, by drawing an untouched line as waiting for
 * him, or by wording a repeat as a correction. None of those happens, and each is asserted.
 *
 * ## PER CLIENT, ALWAYS
 *
 * A draft belongs to ONE person's line — {@link draftKey} is what makes that structural rather than
 * remembered. Adapting an exercise for one tired client is a substitution on THAT person's line and
 * changes nothing for anybody else in the room, and editing one person's repetitions may not move
 * another's. The core enforces the record's half; this module never merges two people's values.
 *
 * ## WHAT THIS FILE DOES NOT WORK OUT FOR ITSELF
 *
 * A line's numbers. `screens/effective-prescription.ts` resolves the exercise's own defaults with the
 * routine's overrides on top, ONCE, and this file is handed the answer. It merged nothing before
 * either — it simply took the routine's overrides for the whole prescription, which is why the panel
 * opened empty on every line the routine did not override. Four surfaces read that resolution and
 * none of them may grow a second one.
 */

import {
  hasAnyNumber, hasInheritedNumbers, hasRoutineNumbers,
} from './effective-prescription';
import type { EffectivePrescription, Prescription } from './effective-prescription';

/** The values one recorded fact carries, exactly as the coach typed them. Strings, because a
 * half-typed number is a real state and a number field cannot hold one. */
export interface Draft {
  readonly sets: string;
  readonly repetitions: string;
  readonly durationSeconds: string;
  readonly restSeconds: string;
  readonly observedLoad: string;
  readonly note: string;
}

/** Which value of a draft a keystroke is about. */
export type DraftField = keyof Draft;

/** An empty draft: nothing filled in, which is what an exercise the routine prescribed nothing for
 * starts as. */
export const EMPTY_DRAFT: Draft = {
  sets: '', repetitions: '', durationSeconds: '', restSeconds: '', observedLoad: '', note: '',
};

/**
 * What each field is called, in the coach's words rather than the record's.
 *
 * `duration_seconds` and `rest_seconds` are the record's names for the two timers the requirement
 * calls timers and rest. He is reading these with a client in front of him.
 */
export const FIELD_LABELS: Readonly<Record<DraftField, string>> = {
  sets: 'Sets',
  repetitions: 'Reps',
  durationSeconds: 'Time in seconds',
  restSeconds: 'Rest in seconds',
  observedLoad: 'Load you saw',
  note: 'Note',
};

/**
 * What each field is FOR, where that is not obvious from its name.
 *
 * The load hint is load-bearing rather than decorative: a load is an observation the coach made about
 * one person, and it is the one value in this application that a machine must never derive, raise or
 * carry into another session.
 */
export const FIELD_HINTS: Readonly<Partial<Record<DraftField, string>>> = {
  observedLoad: 'What this person actually lifted or held, in your own words. Yours to record and '
    + 'nothing is worked out from it.',
  note: 'About this exercise for this person.',
};

/**
 * HOW HIGH EACH COUNTED FIELD GOES, AND THESE NUMBERS ARE NOT THIS FILE'S TO CHOOSE.
 *
 * They MIRROR `core/model/entities/performed-record.js`, which is the authority: `sets_completed`
 * 0-50, `repetitions` 0-1000, `duration_seconds` 0-7200, `rest_seconds` 0-3600. They are repeated
 * here so that a stray keystroke on a phone — the one that turns 12 reps into 1200 — is refused at
 * the field with a sentence he can act on, rather than travelling to the record and coming back as a
 * validation issue written for a programmer.
 *
 * A MIRROR IS A SECOND SOURCE OF TRUTH AND IT DRIFTS. So the suite drives the REAL
 * `validatePerformedRecord` at each boundary and requires it to agree — accept the maximum, refuse
 * one past it. If the model's bound ever moves, the disagreement is the alarm. That is the same
 * discipline the build stamp uses: two readings of one truth, so drift is visible rather than silent.
 */
const COUNT_BOUNDS: Readonly<Record<string, number>> = {
  sets: 50,
  repetitions: 1000,
  durationSeconds: 7200,
  restSeconds: 3600,
};

/**
 * How long the two free-text fields may be, mirroring the same authority: `observed_load` 40
 * characters, `note` 500. Pinned by the same agreement test.
 */
const TEXT_BOUNDS: Readonly<Record<string, number>> = {
  observedLoad: 40,
  note: 500,
};

/** The fields that hold a whole number of something. Everything else is free text. */
const COUNTED_FIELDS: readonly DraftField[] = ['sets', 'repetitions', 'durationSeconds', 'restSeconds'];

/** The fields that hold free text. */
const TEXT_FIELDS: readonly DraftField[] = ['observedLoad', 'note'];

/**
 * The bounds, as the suite reads them to check them against the model.
 *
 * Exported for that one purpose. The record's own field name is the key, so the agreement test does
 * not have to hold a second mapping between this file's names and the model's.
 */
export const RECORDED_BOUNDS: Readonly<Record<string, number>> = Object.freeze({
  sets_completed: COUNT_BOUNDS.sets,
  repetitions: COUNT_BOUNDS.repetitions,
  duration_seconds: COUNT_BOUNDS.durationSeconds,
  rest_seconds: COUNT_BOUNDS.restSeconds,
  observed_load: TEXT_BOUNDS.observedLoad,
  note: TEXT_BOUNDS.note,
});

/**
 * The four numbers a line can carry, RE-EXPORTED from the module that resolves them.
 *
 * It was declared here once, which is how this file came to treat the routine's overrides as a whole
 * prescription: the type it worked from was its own, so nothing pointed at the other half. It now
 * belongs to `screens/effective-prescription.ts` — the authority on what a line is actually
 * prescribed at — and is re-exported so the surfaces that already read it from here still do.
 */
export type { Prescription } from './effective-prescription';

/**
 * A draft filled in from WHAT THE LINE IS PRESCRIBED AT — the resolved prescription, not the
 * routine's overrides.
 *
 * The caller hands over `runner.ts`'s `LineReport.effective`: the exercise's own defaults with the
 * routine's overrides on top. Handed the raw overrides instead — which is what happened until this
 * was fixed — it produced an EMPTY draft on every line the routine did not override, which is seven
 * of the shipped Pull day's nine.
 *
 * A DEFAULT and not a script — the same standing the routine's declared ORDER has. Every value is
 * manually overridable, which is the requirement: a client turns up tired, an exercise is swapped,
 * the numbers change, and none of that is exceptional.
 *
 * The load is deliberately left EMPTY. The shipped library carries no weights at all, nothing is
 * carried forward from a previous session, and a prefilled load would be the application proposing a
 * training load — the one judgement that belongs to the certified professional who is also adapting
 * to a client's medical history.
 */
export function draftFromPrescription(prescription: Prescription | null): Draft {
  if (prescription === null) return EMPTY_DRAFT;
  return {
    ...EMPTY_DRAFT,
    sets: numberAsTyped(prescription.sets),
    repetitions: numberAsTyped(prescription.repetitions),
    durationSeconds: numberAsTyped(prescription.duration_seconds),
    restSeconds: numberAsTyped(prescription.rest_seconds),
  };
}

/** One fact already recorded, as much of its stored content as an edit needs. */
export interface RecordedFact {
  readonly sets_completed?: number | null;
  readonly repetitions?: number | null;
  readonly duration_seconds?: number | null;
  readonly rest_seconds?: number | null;
  readonly observed_load?: string | null;
  readonly note?: string | null;
}

/**
 * A draft filled in from a fact ALREADY RECORDED, for correcting it.
 *
 * From what is STORED rather than from what the routine asked for: an edit is a revision of the fact,
 * so it must open on the fact. Filling it from the prescription would quietly discard whatever he had
 * recorded the first time and show him the routine's numbers as though they were his.
 */
export function draftFromFact(fact: RecordedFact): Draft {
  return {
    sets: numberAsTyped(fact.sets_completed ?? null),
    repetitions: numberAsTyped(fact.repetitions ?? null),
    durationSeconds: numberAsTyped(fact.duration_seconds ?? null),
    restSeconds: numberAsTyped(fact.rest_seconds ?? null),
    observedLoad: fact.observed_load ?? '',
    note: fact.note ?? '',
  };
}

/** One keystroke. A whole draft back, so the caller holds one value and never six. */
export function editDraft(draft: Draft, field: DraftField, value: string): Draft {
  return { ...draft, [field]: value };
}

/**
 * WHICH PERSON'S LINE A DRAFT BELONGS TO.
 *
 * Per client, always. The coach may be running one routine for three people and adjusting the same
 * exercise differently for each; a draft keyed by the exercise alone would carry one person's
 * repetitions onto another's row, which is the failure the whole per-client design exists to prevent.
 * The separator is a pair of colons because neither a record identity nor a content key contains one.
 */
export function draftKey(clientId: string, exerciseId: string): string {
  return `${clientId}::${exerciseId}`;
}

/**
 * WHAT IS WRONG WITH A DRAFT, in a sentence he can act on, or null when nothing is.
 *
 * Checked at the field rather than at the record. The record would refuse it too — that is the
 * authority and it stays the authority — but its issue is written for whoever is reading a validation
 * list, and this one is read mid-session by a coach with a client waiting.
 */
export function draftProblem(draft: Draft): string | null {
  for (const field of COUNTED_FIELDS) {
    const typed = draft[field].trim();
    if (typed.length === 0) continue;
    const value = Number(typed);
    if (!Number.isInteger(value) || value < 0) {
      return `${FIELD_LABELS[field]} has to be a whole number, or be left empty.`;
    }
    const ceiling = COUNT_BOUNDS[field];
    if (value > ceiling) {
      return `${FIELD_LABELS[field]} reads as ${value}. This holds up to ${ceiling}, `
        + 'so check it before recording it.';
    }
  }
  for (const field of TEXT_FIELDS) {
    const typed = draft[field].trim();
    const ceiling = TEXT_BOUNDS[field];
    if (typed.length > ceiling) {
      return `${FIELD_LABELS[field]} is longer than the ${ceiling} characters this holds.`;
    }
  }
  return null;
}

/** What a draft records, in the shape `LiveSession.recordPerformed` takes. Absent where he left it
 * empty: an omitted value is a value he did not record, and a nought is a value he did. */
export interface FactValues {
  sets?: number;
  repetitions?: number;
  durationSeconds?: number;
  restSeconds?: number;
  observedLoad?: string;
  note?: string;
  /**
   * WHICH POINT OF A CURVE THIS WAS DONE AT, when the coach accepted one for this line.
   *
   * Never typed and never a field on a {@link Draft}: {@link factFromDraft} does not set it, because
   * nothing he types says what level he was working at. It is put on by `intensity.ts` from the curve
   * he accepted, and only there — see `withLevel`. A line with no accepted curve records no level,
   * because nobody said what level it was done at, and inventing one would be worse than leaving it
   * out.
   *
   * `intensity` is the key `LiveSession.recordPerformed` already takes, mapped by
   * `core/session/journal.js` onto the record model's own `intensity_level`. Nothing new is stored.
   * Leaving it off is what breaks the intensity adapter's no-ratchet guarantee at this seam:
   * `core/intensity/effort.js` reads a level-less fact as though it had been performed at the
   * exercise's own library level, so work done at a curve's harder point comes back proposed at an
   * easier one.
   */
  intensity?: string;
}

/**
 * The values a draft records.
 *
 * Refuses rather than guesses: an unusable draft has a sentence from {@link draftProblem} and this
 * returns null, so a screen cannot record half of what he typed. Fail at the edge, once, rather than
 * letting a wrong number reach the record and be found later in a progress report.
 */
export function factFromDraft(draft: Draft): FactValues | null {
  if (draftProblem(draft) !== null) return null;

  const values: FactValues = {};
  const sets = countOf(draft.sets);
  if (sets !== null) values.sets = sets;
  const repetitions = countOf(draft.repetitions);
  if (repetitions !== null) values.repetitions = repetitions;
  const durationSeconds = countOf(draft.durationSeconds);
  if (durationSeconds !== null) values.durationSeconds = durationSeconds;
  const restSeconds = countOf(draft.restSeconds);
  if (restSeconds !== null) values.restSeconds = restSeconds;

  const load = draft.observedLoad.trim();
  if (load.length > 0) values.observedLoad = load;
  const note = draft.note.trim();
  if (note.length > 0) values.note = note;

  return values;
}

/**
 * The values an EDIT writes over a fact already stored.
 *
 * Every field is present, including the ones he cleared, because clearing a mistyped load is a
 * correction and a shape that only carried what was filled in could never express it. Null is what
 * the store's own pruning reads as absent.
 */
export function amendmentFromDraft(draft: Draft): Record<string, number | string | null> | null {
  const values = factFromDraft(draft);
  if (values === null) return null;
  return {
    sets_completed: values.sets ?? null,
    repetitions: values.repetitions ?? null,
    duration_seconds: values.durationSeconds ?? null,
    rest_seconds: values.restSeconds ?? null,
    observed_load: values.observedLoad ?? null,
    note: values.note ?? null,
  };
}

/**
 * WHAT PRESSING RECORD ON A LINE WRITES, whether or not he opened the values first.
 *
 * With the panel never opened, it is WHAT THE LINE IS PRESCRIBED AT — the resolved prescription, the
 * routine's own numbers where it overrode and the exercise's own where it did not, as
 * `screens/effective-prescription.ts` puts them together. Pressing Record on a line means this person
 * did what that line asked for, and those same numbers are drawn on the row beside the control, so
 * what is about to be recorded is in front of him rather than assumed behind his back. With the panel
 * opened, it is what he typed — every value manually overridable, which is the requirement.
 *
 * Null when what he typed cannot be recorded; {@link draftProblem} is the sentence for that.
 */
export function valuesForLine(
  state: ControlState,
  clientId: string,
  exerciseId: string,
  prescription: Prescription | null,
  seed: Draft | null = null,
): FactValues | null {
  return factFromDraft(lineDraft(state, clientId, exerciseId, prescription, seed));
}

/** The note on one line's draft, which is the one thing a SKIP carries. */
export function noteForLine(
  state: ControlState,
  clientId: string,
  exerciseId: string,
): string | null {
  const note = draftOf(state, draftKey(clientId, exerciseId)).note.trim();
  return note.length === 0 ? null : note;
}

/**
 * The draft a line is working from: what he typed, or the line's RESOLVED prescription where he has
 * typed nothing. One place, so the control's words, its validation and what it records cannot
 * disagree.
 *
 * `seed` is what stands in place of that prescription where something else has offered a set — an
 * accepted intensity curve, which fills the lines in. It sits BELOW what he typed and ABOVE the
 * prescription, which is the same precedence the panel already had with one more source in it: his
 * own keystrokes always win, and what the line is prescribed at is still the floor when nothing else
 * has an answer.
 */
export function lineDraft(
  state: ControlState,
  clientId: string,
  exerciseId: string,
  prescription: Prescription | null,
  seed: Draft | null = null,
): Draft {
  return state.drafts.get(draftKey(clientId, exerciseId))
    ?? seed
    ?? draftFromPrescription(prescription);
}

/** The key a draft for CORRECTING one recorded fact is held under. One fact, one draft. */
export function editKey(recordId: string): string {
  return `edit::${recordId}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WHERE HE IS LOOKING — this screen's own transient state, and it goes nowhere near the record
// ═══════════════════════════════════════════════════════════════════════════════

/** Which kind of panel is open on a line. */
export type PanelKind = 'adjust' | 'substitute' | 'edit';

/** The panel he has open. */
export interface OpenPanel {
  readonly kind: PanelKind;
  /** Which draft it is editing — {@link draftKey} for a line, {@link editKey} for a correction. */
  readonly key: string;
  readonly clientId: string;
  readonly exerciseId: string;
  /** The fact being corrected, on an `edit` panel. Null on the other two. */
  readonly recordId: string | null;
}

/**
 * EVERYTHING THE SCREEN REMEMBERS, AND NONE OF IT IS A POSITION IN THE SESSION.
 *
 * `SESSION.md` §2 is explicit that where the coach is LOOKING is the screen's own business and stays
 * there. This is that state, and it is held in one value so the suite can assert the property the
 * requirement turns on with no rendering at all: adjusting one person's numbers leaves every other
 * person's exactly as they were.
 *
 * THE DRAFTS OUTLIVE THE PANEL, deliberately. Putting a panel away keeps what he typed, so opening
 * another line and coming back does not silently discard a load he had entered while a client was
 * talking to him. They are keyed per PERSON per line, which is what makes the isolation structural
 * rather than remembered.
 */
export interface ControlState {
  /** What has been typed against each line and each correction, by key. */
  readonly drafts: ReadonlyMap<string, Draft>;
  /** The one panel open, or null when none is. */
  readonly open: OpenPanel | null;
  /** What he has typed to narrow the substitution pool. */
  readonly typed: string;
  /** The last refusal, until he does something else. Never cleared by time. */
  readonly refusal: RefusalReport | null;
  /**
   * WHICH LINE THE REFUSAL BELONGS TO, so it is drawn where it happened.
   *
   * A refusal shown at the top of the screen, on a card with three people and eight exercises each,
   * is a refusal he has to work out the subject of. Not every refusal has a panel open — pressing
   * Record without opening the values can be refused too — so the key is carried rather than read off
   * {@link ControlState.open}.
   */
  readonly refusalKey: string | null;
  /** True while a move is in flight, so one press records one fact. */
  readonly recording: boolean;
}

/** Nothing open, nothing typed, nothing refused. */
export function noControls(): ControlState {
  return {
    drafts: new Map(), open: null, typed: '', refusal: null, refusalKey: null, recording: false,
  };
}

/**
 * OPEN A PANEL ON ONE PERSON'S LINE.
 *
 * ONE AT A TIME. On a phone, two open panels is a screen he has to scroll to read, and this is used
 * with a client waiting. Opening the panel that is already open puts it away, so the control he
 * pressed to get here is the control that gets him out.
 *
 * The draft is seeded from the routine's own numbers the FIRST time only. Reopening keeps what he
 * typed, because re-seeding would silently throw away the change he came back to finish.
 */
export function openPanel(
  state: ControlState,
  panel: OpenPanel,
  seed: Draft,
): ControlState {
  if (state.open !== null && state.open.kind === panel.kind && state.open.key === panel.key) {
    return closePanel(state);
  }
  const drafts = state.drafts.has(panel.key)
    ? state.drafts
    : new Map(state.drafts).set(panel.key, seed);
  return { ...state, drafts, open: panel, typed: '', refusal: null, refusalKey: null };
}

/** Put the panel away. What he typed is kept; see {@link ControlState}. */
export function closePanel(state: ControlState): ControlState {
  return { ...state, open: null, typed: '' };
}

/**
 * ONE KEYSTROKE, INTO THE OPEN PANEL'S DRAFT AND NOWHERE ELSE.
 *
 * The key comes from the OPEN PANEL rather than from the caller, so a keystroke cannot land on
 * another person's line even by a caller's mistake — which is the requirement that editing
 * repetitions, timers or rest for one client must not silently change another's, made structural at
 * the screen as well as in the record.
 */
export function changeDraft(state: ControlState, field: DraftField, value: string): ControlState {
  if (state.open === null) return state;
  const held = state.drafts.get(state.open.key) ?? EMPTY_DRAFT;
  const drafts = new Map(state.drafts).set(state.open.key, editDraft(held, field, value));
  return { ...state, drafts, refusal: null, refusalKey: null };
}

/** What has been typed against one key, or an empty draft where nothing has. */
export function draftOf(state: ControlState, key: string): Draft {
  return state.drafts.get(key) ?? EMPTY_DRAFT;
}

/** Narrow the substitution pool. */
export function typeFilter(state: ControlState, typed: string): ControlState {
  return { ...state, typed };
}

/** A move is in flight, so nothing else may be pressed into the same session. */
export function recording(state: ControlState, inFlight: boolean): ControlState {
  return { ...state, recording: inFlight };
}

/**
 * A move was refused, and the panel STAYS OPEN with what he typed still in it.
 *
 * Closing it would take the values away from him at the moment he has to act on them, and he would
 * have to type them again to find out whether the refusal was about the values at all.
 */
export function refused(
  state: ControlState,
  key: string,
  refusal: RefusalReport,
): ControlState {
  return { ...state, refusal, refusalKey: key, recording: false };
}

/**
 * A move LANDED: the panel closes and the draft it was editing is forgotten.
 *
 * Forgotten because it is now on the RECORD, and the record is what the screen reads back. Keeping it
 * would leave the same numbers sitting in a panel that no longer describes anything, and pressing
 * Record again would look like a repeat of something already recorded when it is a fresh fact.
 */
export function recorded(state: ControlState, key: string): ControlState {
  const drafts = new Map(state.drafts);
  drafts.delete(key);
  return {
    drafts, open: null, typed: '', refusal: null, refusalKey: null, recording: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// What the controls say
// ═══════════════════════════════════════════════════════════════════════════════

/** The words on one line's controls. */
export interface LineControls {
  /** Recording what this person did. The words differ once something is on the record, because
   * recording again is a REPEAT and he should be able to see that is what he is doing. */
  readonly record: string;
  /** Recording that it was not done. A skip is an outcome, not a gap. */
  readonly skip: string;
  /** Recording something else in its place, against this line. */
  readonly substitute: string;
  /** Opening the values, without leaving the exercise. */
  readonly adjust: string;
  /** What the adjust panel is called when it is open, so the panel is not an unlabelled box. */
  readonly adjustOpen: string;
}

/**
 * THE CONTROLS ON ONE LINE, AND THE ONE THING THEIR WORDING MUST NOT DO.
 *
 * Every one of them is offered on every line, whatever has been recorded against this line or any
 * other. `recorded` changes only the RECORD control's words — "Record again" — and that is a
 * statement about what pressing it does: a second fact at a later position, with the first left
 * exactly where it is. It is not a warning, not a correction and not a nudge; correcting is the EDIT
 * control on the attempt itself, which is a different act on a different thing.
 *
 * @param recorded whether this line already has an attempt against it
 */
export function controlsFor(recorded: boolean): LineControls {
  return {
    record: recorded ? 'Record again' : 'Record',
    skip: 'Skipped',
    substitute: 'Something else',
    adjust: 'Adjust',
    adjustOpen: 'Values for this exercise',
  };
}

/**
 * WHAT THE PANEL OF VALUES SAYS ABOUT ITSELF, once, above the fields — AND IT NAMES WHOSE NUMBERS
 * THOSE ARE RATHER THAN ASSUMING.
 *
 * It used to be one constant sentence: "The routine's own numbers are filled in." That sentence was
 * FALSE in the most damaging direction on the shipped content — seven of the Pull day's nine lines
 * override nothing, so the panel opened EMPTY under a heading telling him the numbers were there.
 * Now that a line inherits the exercise's own defaults, the boxes really are filled, and the honest
 * thing to say is which of them the coach's routine chose and which come from what the exercise is
 * normally done at. That distinction is worth showing him: it is the difference between a number he
 * programmed and a number the library suggests as a starting point, and only one of those is his.
 *
 * IT IS DERIVED FROM THE RESOLUTION, never asserted beside it. The sources come off
 * {@link EffectivePrescription.sources}, so the sentence cannot go on claiming something the numbers
 * stopped doing — which is exactly how the old one came to be false.
 *
 * @param effective the line's resolved prescription, or null where there is no line to speak of.
 */
export function adjustWords(effective: EffectivePrescription | null): string {
  const change = 'Change any of them for this person, for this session, without leaving the '
    + 'exercise. What you record is what you type here.';

  if (effective === null || !hasAnyNumber(effective)) {
    // A REAL STATE, not a fault: an exercise deleted from the library, on a line whose routine entry
    // overrode nothing, has no numbers from either place. Saying so is the whole point — the boxes
    // are empty and he is told they are, rather than told they are filled.
    return 'There are no numbers to start from for this exercise, so these boxes are empty. '
      + 'What you record is what you type here.';
  }
  if (!hasInheritedNumbers(effective)) {
    return `These are this routine's own numbers for this exercise. ${change}`;
  }
  if (!hasRoutineNumbers(effective)) {
    return `These are the numbers this exercise is normally done at. ${change}`;
  }
  return 'These are the numbers this exercise is normally done at, with this routine\'s own on top. '
    + change;
}

/**
 * WHAT THE CONTROLS DO, said ONCE for the whole set rather than on every line.
 *
 * Eight lines each repeating the same four sentences is a wall of text on the screen he uses with a
 * client in front of him. It is drawn once, above the lines, permanently — the density requirement is
 * the requirement, and a control whose consequence is only visible after pressing it is one he has to
 * learn by damaging a record.
 *
 * IT DESCRIBES THE CONTROLS AND NOT AN ORDER. Nothing here says which line to press first, and the
 * sentence about recording again exists precisely because a repeat and a correction are different
 * acts on different things.
 */
export const CONTROLS_INTRO =
  'Record what each person did, on any exercise, in whatever order you work in. '
  + 'Skipped puts an outcome on a line rather than leaving it with nothing against it. Something else '
  + 'records a swap against the line it replaced, for this person only. Adjust opens the numbers '
  + 'without leaving the exercise. Recording a line again keeps the first one, and Edit on a recorded '
  + 'line corrects it.';

/** The heading over the substitution pool. */
export const SUBSTITUTE_TITLE = 'Something else in its place';

/**
 * What substituting DOES, which is the half a coach cannot see from a list of names.
 *
 * Both halves are stored, and the substitute attaches to the line it replaced rather than appearing
 * as a line of its own. Saying so is what makes it obvious that adapting one exercise for one tired
 * client does not fork the session or lose what was programmed.
 */
export const SUBSTITUTE_WORDS =
  'What you pick is recorded against this line for this person, together with what it replaced. '
  + 'Nobody else in the session is changed.';

/** The words on the field that narrows the pool. */
export const SUBSTITUTE_FILTER_LABEL = 'Find an exercise';

/** What to say when nothing in the pool matches what he typed. */
export const SUBSTITUTE_NONE_MATCH = 'Nothing in your library matches that.';

/** What to say when the library page does not hold everything. Honest rather than silent. */
export const SUBSTITUTE_MORE_THAN_SHOWN =
  'Your library holds more exercises than these. Type to narrow them.';

/**
 * HOW MANY ROWS THE POOL DRAWS AT ONCE.
 *
 * MEASURED, not guessed: the shipped catalogue is around a hundred exercises, and drawing the lot put
 * a hundred rows inside one line of one person's card on a phone. It was legible and it was a wall —
 * he would scroll past the rest of the session to get out of it, with a client waiting. So the list is
 * bounded and the way to reach the rest is the field that is already there.
 *
 * NOT A HIDDEN LIMIT. {@link substituteRows} reports how many matched, and the screen says so, because
 * a silently truncated list reads as "this is your library".
 */
export const SUBSTITUTE_ROWS_SHOWN = 12;

/** The words on the control that edits a fact already recorded. */
export const EDIT_LABEL = 'Edit';

/** What an edit is, said where it is pressed. */
export const EDIT_WORDS = 'A correction to what was recorded. Nothing else in the session moves.';

/** The words on the control that puts a panel away without recording anything. */
export const CANCEL_LABEL = 'Leave it';

/** The words on the control that commits an edit. */
export const SAVE_EDIT_LABEL = 'Save the correction';

/** One exercise offered as a substitute. */
export interface SubstituteChoice {
  readonly exerciseId: string;
  readonly name: string;
}

/**
 * The exercises offered in place of one line, narrowed by what he has typed.
 *
 * THE POOL IS THE WHOLE CATALOGUE AND NOT THE ROUTINE'S OWN LIST. The shipped library deliberately
 * holds more exercises than the shipped week references, and that surplus IS the substitution pool —
 * it is there precisely so an exercise can be swapped when a client is tired.
 *
 * The line's own exercise is left out: recording it in place of itself is the RECORD control, and
 * two controls doing one thing is one of them he has to work out.
 */
export function substituteChoices(
  catalogue: readonly SubstituteChoice[],
  typed: string,
  insteadOf: string,
): readonly SubstituteChoice[] {
  const wanted = typed.trim().toLowerCase();
  return catalogue.filter((choice) => {
    if (choice.exerciseId === insteadOf) return false;
    if (wanted.length === 0) return true;
    return choice.name.toLowerCase().includes(wanted);
  });
}

/** The rows the pool draws, and what it says about the ones it did not. */
export interface SubstituteRows {
  readonly shown: readonly SubstituteChoice[];
  /** How many matched altogether. Reported, so nothing is truncated in silence. */
  readonly matched: number;
  /** The sentence about what is not drawn, or null when everything that matched is. */
  readonly moreWords: string | null;
}

/**
 * THE ROWS TO DRAW, bounded, with the count said out loud.
 *
 * The bound is a phone's screen and not a cost: the read is already one page. What it protects is the
 * session underneath — a hundred rows inside one exercise of one person's card buries everything else
 * on the screen, and he is holding the phone with a client in front of him.
 */
export function substituteRows(
  catalogue: readonly SubstituteChoice[],
  typed: string,
  insteadOf: string,
): SubstituteRows {
  const matching = substituteChoices(catalogue, typed, insteadOf);
  const shown = matching.slice(0, SUBSTITUTE_ROWS_SHOWN);
  return {
    shown,
    matched: matching.length,
    moreWords: matching.length > shown.length
      ? `${shown.length} of ${matching.length} in your library. Type above to narrow them.`
      : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// What the record already says about one line
// ═══════════════════════════════════════════════════════════════════════════════

/** One attempt against one line, as the record holds it and as a screen has to draw it. */
export interface AttemptReport {
  readonly recordId: string;
  /** What the record says happened. Never a position and never an instruction. */
  readonly words: string;
  /** The values recorded, worded, or null where none were. */
  readonly values: string | null;
  /** The draft an edit of this attempt opens on. */
  readonly draft: Draft;
}

/** What one attempt's status says, in the coach's words. */
const ATTEMPT_WORDS: Readonly<Record<string, string>> = {
  performed: 'Recorded as done',
  partial: 'Recorded as partly done',
  skipped: 'Recorded as skipped',
  substituted: 'Recorded with something else in its place',
};

/** One attempt as `projection.js` derives it, as much of it as this module reads. */
export interface Attempt {
  readonly record_id: string;
  readonly exercise_id: string;
  readonly substituted_for_exercise_id: string | null;
  readonly status: string;
  readonly record?: { readonly content?: RecordedFact };
}

/**
 * WHAT HAS BEEN RECORDED AGAINST ONE LINE, one row per attempt, in the order they were recorded.
 *
 * Every attempt is drawn, not only the last. A repeat is a second fact and the first genuinely
 * happened: collapsing them to the most recent would present an edit and a repeat as the same thing
 * and quietly lose a set the client did.
 *
 * @param attempts the line's attempts, from `projectSession`
 * @param exerciseNames each exercise's name by content key, for a substitute's own name
 */
export function attemptsOf(
  attempts: readonly Attempt[],
  exerciseNames: ReadonlyMap<string, string>,
): readonly AttemptReport[] {
  return attempts.map((attempt) => {
    const content = attempt.record?.content ?? {};
    const said = ATTEMPT_WORDS[attempt.status] ?? 'Recorded';
    const substitute = attempt.substituted_for_exercise_id === null
      ? null
      : exerciseNames.get(attempt.exercise_id) ?? attempt.exercise_id;

    return {
      recordId: attempt.record_id,
      // THE SUBSTITUTE'S NAME COMES FIRST, and that is a phone-width decision rather than a
      // stylistic one. Measured (s6/a4): worded as "Recorded with something else in its place:
      // Kettlebell Swing", the row ellipsized at 390px to "Recorded with something else in…" — the
      // truncation announced itself honestly and ate the ONE thing on the row he needed, which is
      // WHAT he swapped in. What gives way now is the explanation, which the chip above already says.
      words: substitute === null ? said : `${substitute}, recorded in its place`,
      values: describeValues(content),
      draft: draftFromFact(content),
    };
  });
}

/**
 * One line, as the controls on it need it: what is recorded against it.
 *
 * IT DELIBERATELY DOES NOT CARRY A PRESCRIPTION. It used to carry the projection's
 * `prescriptionOf(entry)` — the routine's OVERRIDES as stored — and the controls drawn from it then
 * treated an override as a whole prescription, which on the shipped Pull day meant six empty boxes
 * under a heading claiming they were filled. The prescription a control works from is the RESOLVED
 * one on `runner.ts`'s `LineReport.effective`, resolved once by `screens/effective-prescription.ts`.
 * Handing the raw overrides back out of here as well would be a second answer to the same question,
 * free to disagree with the first on exactly the line where it matters.
 */
export interface LineOnTheRecord {
  readonly attempts: readonly AttemptReport[];
}

/** As much of the projection as this module reads. `projectSession` owns the rest. */
export interface ProjectedSession {
  readonly clients: readonly {
    readonly client_id: string;
    // No `prescription` is named here on purpose. The projection carries one — the routine's
    // overrides as stored — and this module must not read it: see {@link LineOnTheRecord}.
    readonly plan: readonly {
      readonly exercise_id: string;
      readonly attempts: readonly Attempt[];
    }[];
  }[];
}

/**
 * ONE PERSON'S LINE, READ OUT OF THE PROJECTION.
 *
 * Read from the VIEW rather than from the worded report the spine derives, because a control needs the
 * numbers the routine asked for and the identity of each fact, and the spine's report is words for
 * reading. One reading of one truth either way: both come from the same projection.
 *
 * Null when the person or the line is not in the view — a client removed from the session, a routine
 * changed underneath. A control drawn over nothing would be a control that cannot do what it says.
 */
export function lineOnTheRecord(
  view: ProjectedSession,
  clientId: string,
  exerciseId: string,
  exerciseNames: ReadonlyMap<string, string>,
): LineOnTheRecord | null {
  const client = view.clients.find((each) => each.client_id === clientId);
  if (client === undefined) return null;
  const line = client.plan.find((each) => each.exercise_id === exerciseId);
  if (line === undefined) return null;
  return {
    attempts: attemptsOf(line.attempts, exerciseNames),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// When a move is refused
// ═══════════════════════════════════════════════════════════════════════════════

/** What a refused move reads as. */
export interface RefusalReport {
  /** The sentence to show him. The core's own where the core wrote one. */
  readonly headline: string;
  /** The failure's own text, kept verbatim where the headline is NOT already it — he may have to
   * read it out to somebody. Null where the headline is the failure's own sentence. */
  readonly detail: string | null;
  /** True when the session's journal is full, which is a real and reachable state with its own
   * words rather than a fault to hide. */
  readonly journalFull: boolean;
}

/**
 * WHAT TO SAY WHEN A MOVE IS REFUSED, AND IT IS THE CORE'S OWN SENTENCE WHEREVER THERE IS ONE.
 *
 * `core/session/errors.js` writes every message to be shown to the coach as it stands, including the
 * one that matters most here: a session's journal is CAPPED at four hundred performed records per
 * person, the four hundred and first is refused LOUDLY, and its sentence already says the record is
 * intact and this session is simply full. Rewording it here would be two sentences about one refusal,
 * free to drift, and the one he read would depend on which screen he was on.
 *
 * A failure with no sentence at all is still reported rather than swallowed, and its own text is
 * carried beside the headline rather than dropped. A control that silently does nothing is the shape
 * this whole build has been bitten by: an absence that looks like a pass.
 *
 * The two taxonomies whose messages are written FOR HIM are named rather than matched loosely:
 * `core/session/errors.js` says so in as many words, and the store's lease refusals are ordinary
 * situations with a sentence each ("That session is not open in this window"). Everything else gets
 * the honest headline with its own text underneath.
 */
export function describeRefusal(error: unknown): RefusalReport {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  const journalFull = name === 'SessionJournalFullError';
  const written = COACH_FACING_FAILURES.includes(name);

  if (written && message.length > 0) {
    return { headline: message, detail: null, journalFull };
  }
  return {
    headline: 'That could not be recorded on this device. Nothing already recorded has been lost.',
    detail: name.length > 0 ? `${name}: ${message}` : message,
    journalFull,
  };
}

/**
 * The failures whose own message is written for the coach and is carried through as the headline.
 *
 * ENUMERATED rather than matched on a name prefix. A prefix would silently adopt whatever a later
 * error class is called, including one whose message is written for a programmer, and the coach would
 * be shown it mid-session with a client waiting.
 */
const COACH_FACING_FAILURES: readonly string[] = [
  'SessionJournalFullError',
  'SessionParticipantError',
  'SessionStateError',
  'SessionClosedError',
  'StoreLeaseError',
];

/** What to say when this window is not holding the session any more — the laptop slept, the other
 * window took it. It names the way back rather than reporting a fault. */
export const NOT_HELD_HERE =
  'This window is not holding that session any more, so nothing can be recorded into it from here. '
  + 'Open it again from the Calendar.';

// ── internals ───────────────────────────────────────────────────────────────────────────────────

/** A stored number as it would have been typed, and an absent one as an empty field. */
function numberAsTyped(value: number | null): string {
  return value === null ? '' : String(value);
}

/** A counted field's value, or null when he left it empty. Validated by {@link draftProblem} first. */
function countOf(typed: string): number | null {
  const text = typed.trim();
  if (text.length === 0) return null;
  return Number(text);
}

/**
 * The values on one recorded fact, as one line of reading.
 *
 * His own load appears exactly as he wrote it. Nothing is derived from it, nothing is compared to
 * another session, and nothing is carried forward.
 */
function describeValues(content: RecordedFact): string | null {
  const parts: string[] = [];
  if (typeof content.sets_completed === 'number') parts.push(`${content.sets_completed} sets`);
  if (typeof content.repetitions === 'number') parts.push(`${content.repetitions} reps`);
  if (typeof content.duration_seconds === 'number') {
    parts.push(`${content.duration_seconds} seconds`);
  }
  if (typeof content.rest_seconds === 'number') {
    parts.push(`${content.rest_seconds} seconds rest`);
  }
  if (typeof content.observed_load === 'string' && content.observed_load.length > 0) {
    parts.push(content.observed_load);
  }
  if (typeof content.note === 'string' && content.note.length > 0) parts.push(content.note);
  return parts.length === 0 ? null : parts.join(' · ');
}
