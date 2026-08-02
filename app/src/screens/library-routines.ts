/**
 * WHAT THE LIBRARY EDITOR SAYS ABOUT A ROUTINE — the whole derivation, and none of the drawing.
 *
 * The second of the three library kinds. `library-editor.ts` is the first and this file follows it
 * exactly rather than inventing a second shape: every judgement is decided here, in a plain module a
 * test asserts with no browser and no rendering at all, and `LibraryRoutines.tsx` draws the result
 * and holds no decisions.
 *
 * ## NO ROUTINE RULE LIVES HERE EITHER
 *
 * `core/model/entities/routine.js` is the schema and it is sealed: the field list, the name format,
 * the split-day range, the closed vocabularies for focus and body regions, the rule that a routine
 * needs at least one entry, the ranges on every override, and the rule that an entry overrides
 * repetitions OR duration and never both. `store.create` and `store.update` run all of it on the way
 * in. Nothing here restates one of them.
 *
 * There is a SECOND validator, and it is the one a routine cannot pass on its own:
 * `core/model/referential.js` — every exercise a routine names must exist, and an override must agree
 * with that exercise's `measurement`. The store cannot run it, because it validates ONE record and
 * that question needs the exercise library. So `library-routines-source.ts` CALLS it — the core's
 * own function, against the catalogue read off the store — and its issues arrive here in the same
 * shape as the record's own. See that file's header for why it is a call rather than a copy.
 *
 * ## THE THREE INTENSITY POINTS ARE NOT HERE, AND THAT IS THE DESIGN
 *
 * A routine's entry carries `sets`, `repetitions` or `duration_seconds`, and `rest_seconds` — the
 * routine-level OVERRIDES of what the exercise usually asks for, for a movement programmed
 * differently on the pull day than on the functional day. It carries NO intensity: the three points
 * a session is scaled along belong to the EXERCISE (`scaling`, and `R6` which orders them), and
 * `library-editor.ts` already has the editor for them. So an entry OPENS that editor rather than
 * restating those three points inside the routine form. A second place to set the same three values
 * would be a second idea of one truth, and the two would drift the first time either was touched.
 *
 * ## AN OMITTED OVERRIDE IS AN INHERITED ONE, AND THAT IS SAID RATHER THAN LEFT BLANK
 *
 * The record's rule is that omitting a field inherits the exercise default, and that a value merely
 * restating the default is discouraged because it stops tracking edits to the exercise. So a blank
 * box is written as an ABSENT key, never as a nought or an empty string, and the row says in words
 * that it follows the exercise — a blank cell on a screen reads as a value that failed to load.
 */

import {
  CONTENT_PREFIX, describeRefusal, provenanceWords, seconds, vocabularyList, vocabularyWords,
  wholeNumber,
} from './library-editor';
import type { RefusalReport } from './library-editor';

// ═══════════════════════════════════════════════════════════════════════════════
// What the core hands over
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * One entry as the record holds it: an exercise REFERENCE plus whichever overrides were set.
 *
 * Every override is optional and an absent one INHERITS. The record never copies an exercise
 * definition into a routine — he edits an exercise once and every routine using it changes.
 */
export interface RoutineEntryContent {
  readonly exercise_id: string;
  readonly sets?: number;
  readonly repetitions?: number;
  readonly duration_seconds?: number;
  readonly rest_seconds?: number;
}

/** A routine record exactly as the store holds it: an envelope with its content nested. */
export interface RoutineRecord {
  readonly record_id: string;
  readonly rev: number;
  readonly content: {
    readonly id: string;
    readonly name: string;
    readonly split_day: number;
    readonly focus: string;
    readonly body_regions: readonly string[];
    readonly description: string;
    readonly entries: readonly RoutineEntryContent[];
    readonly provenance: string;
  };
}

/** A page of routines exactly as the core paged them. `done` is carried, never dropped. */
export interface RoutinePage {
  readonly items: readonly RoutineRecord[];
  readonly cursor: string | null;
  readonly done: boolean;
}

/**
 * What the exercise catalogue offers a routine, as the entry rows need it.
 *
 * The NAME so a row says what it is, and the MEASUREMENT because it decides which record field the
 * one "how much" box becomes — the same one-box form the exercise editor uses, and for the same
 * reason: two boxes, one of which must be left empty, invites the exact contradiction
 * `referential.js` exists to refuse.
 */
export interface ExerciseChoice {
  readonly contentKey: string;
  readonly name: string;
  readonly measurement: string;
}

/** The catalogue as a lookup, and whether it really was the whole of it. */
export interface ExerciseChoices {
  readonly all: readonly ExerciseChoice[];
  readonly byKey: ReadonlyMap<string, ExerciseChoice>;
  /** False when the read stopped short. Said to him rather than swallowed. */
  readonly whole: boolean;
}

/** What the screen has been told about the routine library right now. */
export interface RoutineReading {
  readonly page: RoutinePage;
  /** What he typed into the filter box, or the empty string. Changes what an empty page MEANS. */
  readonly search: string;
  /** The catalogue, so each entry row can be named rather than shown as a key. */
  readonly choices: ExerciseChoices;
  /** How many routines the LIBRARY holds. Never the page's length — see {@link describeRoutines}. */
  readonly total: number;
}

/** The catalogue as the rows need it, from the content records the store handed over. */
export function exerciseChoices(
  exercises: readonly Record<string, unknown>[],
  whole: boolean,
): ExerciseChoices {
  const all: ExerciseChoice[] = [];
  for (const content of exercises) {
    const key = content.id;
    if (typeof key !== 'string') continue;
    all.push({
      contentKey: key,
      name: typeof content.name === 'string' ? content.name : key,
      measurement: typeof content.measurement === 'string' ? content.measurement : '',
    });
  }
  return { all, byKey: new Map(all.map((choice) => [choice.contentKey, choice])), whole };
}

/** An empty catalogue, so the screen's initial state is not a literal. */
export const NO_CHOICES: ExerciseChoices = Object.freeze({
  all: Object.freeze([]),
  byKey: new Map<string, ExerciseChoice>(),
  whole: false,
});

// ═══════════════════════════════════════════════════════════════════════════════
// The list
// ═══════════════════════════════════════════════════════════════════════════════

/** One entry on a routine, worded. */
export interface EntryLine {
  /** Its place in the routine's own order, counting from one, as a person reads it. */
  readonly position: number;
  readonly exerciseKey: string;
  /** What the coach calls it, or the honest sentence when the catalogue has no such exercise. */
  readonly exerciseName: string;
  /** True when the catalogue does not hold this key — which the record model forbids and he must see. */
  readonly missing: boolean;
  /** What this routine asks for here, and whether any of it is the routine's own. */
  readonly prescription: string;
  /** True when nothing is overridden, so every figure comes from the exercise itself. */
  readonly inherited: boolean;
  readonly first: boolean;
  readonly last: boolean;
}

/** One routine on the library list, worded. */
export interface RoutineSummary {
  readonly recordId: string;
  readonly rev: number;
  readonly contentKey: string;
  readonly name: string;
  /** Its place in the week, worded as a position rather than as a weekday. */
  readonly day: string;
  readonly focus: string;
  readonly regions: string;
  readonly description: string;
  /** How many exercises are in it, with the noun agreeing. */
  readonly size: string;
  readonly entries: readonly EntryLine[];
  readonly provenance: string;
  readonly provenanceWord: string;
}

/** What the whole routine list says. */
export interface RoutineReport {
  /** How many are being SHOWN. Every match when searching, one page when not. */
  readonly count: number;
  /** How many the LIBRARY holds. A different fact from {@link count}. */
  readonly total: number;
  readonly intro: string;
  readonly empty: boolean;
  readonly more: boolean;
  readonly moreWords: string | null;
  readonly items: readonly RoutineSummary[];
}

/**
 * WHERE IN THE WEEK, and it is a POSITION rather than a weekday.
 *
 * The record's own comment says why and this only has to not contradict it: the coach's week does
 * not necessarily start on a Monday and clients train on different days. Saying "Monday" here would
 * be the application claiming to own his calendar off the back of an integer that never meant that.
 */
export function splitDayWords(day: number): string {
  return `Day ${String(day)} of the week`;
}

/** A count of exercises with its noun agreeing. Branched whole, never a plural noun in a gap. */
export function exerciseCountWords(count: number): string {
  return count === 1 ? '1 exercise' : `${String(count)} exercises`;
}

/**
 * WHAT ONE ENTRY ASKS FOR, and which half of it is this routine's own doing.
 *
 * An absent override INHERITS, which is the record's rule, so an absent one is said as "as the
 * exercise asks" rather than drawn as a blank. The overridden figures are named with their units,
 * because a bare number on a row about sets and seconds is a number he has to guess the meaning of.
 */
export function entryPrescriptionWords(
  entry: RoutineEntryContent,
  choice: ExerciseChoice | undefined,
): string {
  const parts: string[] = [];
  if (typeof entry.sets === 'number') {
    parts.push(entry.sets === 1 ? '1 set' : `${String(entry.sets)} sets`);
  }
  if (typeof entry.repetitions === 'number') {
    parts.push(entry.repetitions === 1 ? '1 repetition' : `${String(entry.repetitions)} repetitions`);
  }
  if (typeof entry.duration_seconds === 'number') parts.push(seconds(entry.duration_seconds));
  if (typeof entry.rest_seconds === 'number') parts.push(`${seconds(entry.rest_seconds)} rest`);

  if (parts.length === 0) {
    return choice === undefined
      ? 'Exactly what this exercise asks for'
      : `Exactly what ${choice.name} asks for`;
  }
  // "AND THE REST AS THE EXERCISE ASKS" IS THE WRONG WORD HERE, and it was only visible on the
  // rendered row: this sentence is about sets, repetitions and REST SECONDS, so "the rest" reads as
  // the rest period rather than as the remainder — and next to an overridden "90 seconds rest" it
  // reads as a contradiction. No property check would have caught it.
  return `${parts.join(', ')}, and everything else as the exercise asks`;
}

/** True when this entry overrides nothing at all. */
export function isInherited(entry: RoutineEntryContent): boolean {
  return typeof entry.sets !== 'number'
    && typeof entry.repetitions !== 'number'
    && typeof entry.duration_seconds !== 'number'
    && typeof entry.rest_seconds !== 'number';
}

/** One routine, worded, with its entries named off the catalogue. */
export function describeRoutine(
  record: RoutineRecord,
  choices: ExerciseChoices,
): RoutineSummary {
  const { content } = record;
  const entries = content.entries ?? [];

  return {
    recordId: record.record_id,
    rev: record.rev,
    contentKey: content.id,
    name: content.name,
    day: splitDayWords(content.split_day),
    focus: vocabularyWords(content.focus),
    regions: vocabularyList(content.body_regions, 'Not recorded'),
    description: content.description,
    size: exerciseCountWords(entries.length),
    entries: entries.map((entry, index) => {
      const choice = choices.byKey.get(entry.exercise_id);
      return {
        position: index + 1,
        exerciseKey: entry.exercise_id,
        // A KEY THAT RESOLVES TO NOTHING IS SAID, not drawn as a blank row. The record model forbids
        // it and the referential check refuses it, so seeing one means something upstream is wrong
        // and he is the only person who can be told.
        exerciseName: choice?.name
          ?? `${entry.exercise_id} — no exercise with this key is in your library`,
        missing: choice === undefined,
        prescription: entryPrescriptionWords(entry, choice),
        inherited: isInherited(entry),
        first: index === 0,
        last: index === entries.length - 1,
      };
    }),
    provenance: content.provenance,
    // TAKEN FROM THE EXERCISE HALF rather than written a second time, so the three library kinds
    // cannot end up saying three different things about the same three values.
    provenanceWord: provenanceWords(content.provenance),
  };
}

/** Everything the routine list says, from the page the core handed over. */
export function describeRoutines(reading: RoutineReading): RoutineReport {
  const items = reading.page.items.map((record) => describeRoutine(record, reading.choices));
  const searching = reading.search.trim().length > 0;

  return {
    count: items.length,
    total: reading.total,
    intro: routineIntro(items.length, searching, reading.search.trim(), reading.total),
    empty: items.length === 0,
    more: !reading.page.done,
    moreWords: reading.page.done
      ? null
      : 'There are more routines than these, a page at a time.',
    items,
  };
}

/**
 * WHICH NUMBER GOES IN WHICH SENTENCE, and they are two different facts.
 *
 * `count` is how many are being SHOWN — every match when he is searching, one page when he is not.
 * `total` is how many the LIBRARY holds. The searching sentences take `count`, because "N routines
 * match" is a claim about the matches; the library sentences take `total`, because "N routines in
 * your library. Every one of them is yours to change or remove" is a claim about the library.
 *
 * PUTTING `count` IN THE LIBRARY SENTENCE IS THE ORIGINAL DEFECT, and putting `total` in the
 * matching sentence is the same defect inverted. NEITHER SENTENCE BORROWS THE OTHER'S NUMBER, and
 * while a search is active the library sentence is not said at all.
 */
function routineIntro(count: number, searching: boolean, search: string, total: number): string {
  if (count === 0) {
    return searching
      ? `No routine matches "${search}". Clear the box to see all of them again.`
      : 'There are no routines in your library. Build one below, or restore the shipped set from Admin.';
  }

  // THE WHOLE SENTENCE AGREES. Rendered, a plural verb over a singular subject reads "1 routine
  // match", which is the fault the exercise half shipped with and which was found by looking.
  if (searching) {
    return count === 1
      ? `1 routine matches "${search}".`
      : `${String(count)} routines match "${search}".`;
  }

  return total === 1
    ? '1 routine in your library, yours to change or remove.'
    : `${String(total)} routines in your library, every one yours to change or remove.`;
}

/**
 * WHICH ROUTINES MATCH WHAT HE TYPED. The name and the description only.
 *
 * Not the entries: a search for "squat" that returned every routine containing a squat would return
 * most of the week, and he has no way to tell the app he meant the routine's own name.
 */
export function matchesRoutineSearch(record: RoutineRecord, search: string): boolean {
  const wanted = search.trim().toLowerCase();
  if (wanted.length === 0) return true;
  const { content } = record;
  return content.name.toLowerCase().includes(wanted)
    || content.description.toLowerCase().includes(wanted);
}

// ═══════════════════════════════════════════════════════════════════════════════
// The form
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * One entry as he types it.
 *
 * `amount` is ONE box and which record field it becomes is decided by the referenced exercise's
 * measurement — the same choice the exercise form makes, for the same reason. Everything is TEXT,
 * because that is what an input holds; an empty box means INHERIT and is omitted from the record
 * rather than written as a nought.
 */
export interface EntryDraft {
  readonly exerciseId: string;
  readonly sets: string;
  readonly amount: string;
  readonly rest: string;
}

/** What the coach typed, before the record has seen it. */
export interface RoutineDraft {
  readonly name: string;
  readonly splitDay: string;
  readonly focus: string;
  readonly bodyRegions: readonly string[];
  readonly description: string;
  readonly entries: readonly EntryDraft[];
}

export const EMPTY_ENTRY: EntryDraft = Object.freeze({
  exerciseId: '', sets: '', amount: '', rest: '',
});

/** An empty form. One value, so the screen and its reset cannot disagree about what empty is. */
export function emptyRoutineDraft(): RoutineDraft {
  return Object.freeze({
    name: '',
    splitDay: '',
    focus: '',
    bodyRegions: [],
    description: '',
    entries: [],
  });
}

function numberText(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : '';
}

/**
 * The form filled in from a routine he is editing.
 *
 * IT READS THE RECORD AND NOTHING ELSE — never the worded summary, whose figures have units and
 * prose around them and would be written back as text the record has never held.
 */
export function draftFromRoutine(record: RoutineRecord): RoutineDraft {
  const { content } = record;
  return {
    name: content.name,
    splitDay: numberText(content.split_day),
    focus: content.focus,
    bodyRegions: [...content.body_regions],
    description: content.description,
    entries: (content.entries ?? []).map((entry) => ({
      exerciseId: entry.exercise_id,
      sets: numberText(entry.sets),
      // WHICHEVER FIELD THE RECORD PUT IT IN. Reading the measurement a second time here could
      // disagree with the record about what is actually stored, and the figure would vanish from
      // the box the moment an exercise's measurement was changed underneath a routine.
      amount: typeof entry.repetitions === 'number'
        ? String(entry.repetitions)
        : numberText(entry.duration_seconds),
      rest: numberText(entry.rest_seconds),
    })),
  };
}

// ── the ordering controls ──────────────────────────────────────────────────────

/**
 * THE ORDER IS A DEFAULT AND MOVING A LINE IS THE WHOLE OF REORDERING IT.
 *
 * `entities/routine.js` says the order is the routine's default and NOT a script — the coach jumps,
 * skips, repeats and substitutes mid-session, and the intensity adapter reorders it too. So this
 * changes what he will be shown FIRST, and nothing downstream may read it as an instruction.
 *
 * Out-of-range moves return the draft UNCHANGED rather than throwing or wrapping around: the first
 * line's "up" is a control the screen does not draw, and a wrap would silently move a line to the
 * far end of a routine he is looking at.
 */
export function moveEntry(draft: RoutineDraft, index: number, delta: number): RoutineDraft {
  const target = index + delta;
  if (index < 0 || index >= draft.entries.length) return draft;
  if (target < 0 || target >= draft.entries.length) return draft;

  const entries = [...draft.entries];
  const [held] = entries.splice(index, 1);
  entries.splice(target, 0, held);
  return { ...draft, entries };
}

/** One more line, empty, at the end. */
export function addEntry(draft: RoutineDraft): RoutineDraft {
  return { ...draft, entries: [...draft.entries, EMPTY_ENTRY] };
}

/** One line taken out of the form. Nothing is written until he saves. */
export function removeEntry(draft: RoutineDraft, index: number): RoutineDraft {
  if (index < 0 || index >= draft.entries.length) return draft;
  return { ...draft, entries: draft.entries.filter((_held, at) => at !== index) };
}

/** One line changed in place. */
export function replaceEntry(draft: RoutineDraft, index: number, entry: EntryDraft): RoutineDraft {
  if (index < 0 || index >= draft.entries.length) return draft;
  return { ...draft, entries: draft.entries.map((held, at) => (at === index ? entry : held)) };
}

/**
 * The content of a routine, from the draft and from the key it is replacing.
 *
 * NO PROVENANCE IS SET HERE. `library-routines-source.ts` puts it on by calling the core's own
 * `markEdited`, which is the one place that rule lives.
 *
 * AN EMPTY OVERRIDE BOX IS AN OMITTED KEY. The record's rule is that omitting inherits, so writing a
 * nought would fix a value the coach never typed and would stop the entry tracking edits to the
 * exercise — which is the one thing an in-app library exists to do. What he DID type travels
 * unchanged, so "12kg" reaches the record and is refused by name rather than becoming twelve.
 *
 * @param choices the catalogue, which decides whether a figure is repetitions or seconds. An
 * exercise the catalogue does not hold puts the figure in NEITHER field, and the referential check
 * then says the key does not resolve — which is the honest order to be told those two things in.
 */
export function routineContent(
  draft: RoutineDraft,
  choices: ExerciseChoices,
  existingKey: string | null,
): Record<string, unknown> {
  const name = draft.name.trim();

  const entries = draft.entries.map((entry) => {
    const built: Record<string, unknown> = { exercise_id: entry.exerciseId.trim() };
    const measurement = choices.byKey.get(entry.exerciseId.trim())?.measurement ?? '';

    if (entry.sets.trim().length > 0) built.sets = wholeNumber(entry.sets);
    if (entry.amount.trim().length > 0) {
      if (measurement === 'repetitions') built.repetitions = wholeNumber(entry.amount);
      else if (measurement === 'time') built.duration_seconds = wholeNumber(entry.amount);
    }
    if (entry.rest.trim().length > 0) built.rest_seconds = wholeNumber(entry.rest);
    return built;
  });

  return {
    // A ROUTINE KEEPS ITS KEY when he renames it. The key is what a session names, so re-deriving it
    // from a corrected spelling would orphan every session that has already run it while the screen
    // reported a successful save.
    id: existingKey ?? routineKeyFor(name),
    name,
    split_day: wholeNumber(draft.splitDay),
    focus: draft.focus,
    body_regions: [...draft.bodyRegions],
    description: draft.description.trim(),
    entries,
  };
}

/**
 * THE CONTENT KEY FOR A NEW ROUTINE, DERIVED FROM HIS NAME RATHER THAN ASKED FOR.
 *
 * Same reasoning as the exercise half, and it is a separate function rather than the same one only
 * because a routine name legitimately carries digits and hyphens where an exercise name may not. The
 * conversion is the same and the result is the same shape of key.
 */
export function routineKeyFor(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

// ═══════════════════════════════════════════════════════════════════════════════
// The words on the form
// ═══════════════════════════════════════════════════════════════════════════════

export const ROUTINE_FIELD_LABELS = Object.freeze({
  name: 'Name',
  splitDay: 'Where it sits in the week',
  focus: 'What it is for',
  bodyRegions: 'Body regions',
  description: 'Description',
  entries: 'The exercises in it',
  entryExercise: 'Exercise',
  entrySets: 'Sets',
  entryAmount: 'How much',
  entryRest: 'Rest after each set',
});

export const ADD_ROUTINE_TITLE = 'Build a routine';
export const EDIT_ROUTINE_TITLE = 'Change this routine';
export const ADD_ROUTINE_BUTTON = 'Add this routine';
export const SAVE_ROUTINE_BUTTON = 'Save these changes';
export const CANCEL_ROUTINE_BUTTON = 'Leave it as it was';
export const ADD_ENTRY_BUTTON = 'Add an exercise to this routine';

/** What the split-day box means, said where he answers it. */
export const SPLIT_DAY_HINT = 'A position in your week, one to seven, not a weekday.';

/**
 * WHAT AN EMPTY OVERRIDE BOX MEANS, said before he leaves one empty.
 *
 * Unexplained, an empty box on a form reads as a question he forgot to answer, and the natural
 * response is to copy the exercise's own numbers into it — which is exactly the thing the record's
 * own comment discourages, because a copied value stops following the exercise when he edits it.
 */
export const OVERRIDE_HINT =
  'An empty box follows whatever the exercise asks for. Fill one in only where this routine wants '
  + 'something different.';

/**
 * WHERE THE THREE INTENSITY POINTS ARE, said on the routine form because this is where he would
 * look for them.
 *
 * They are on the EXERCISE and there is one place to set them.
 *
 * NOT EVERY ROW CARRIES THE CONTROL, AND THIS DOCSTRING SAID IT DID UNTIL s11/a41 MEASURED IT.
 *
 * It used to justify the sentence with "every entry row carries a control that opens that exercise
 * in the form above, so this sentence is followed by a way to act on it". THAT WAS FALSE FOR THE
 * STATE THIS FORM OPENS IN. `LibraryRoutines.tsx` draws Open only when `chosen !== undefined`, and
 * {@link emptyRoutineDraft} returns `entries: []` — so pressing "Add a routine" paints this
 * paragraph with ZERO Open controls anywhere on the screen. The same holds for a row whose exercise
 * has left the catalogue, which is {@link exerciseGoneWords}'s case: no `chosen`, so no Open, while
 * the sentence went on pointing at one.
 *
 * A JUSTIFICATION IS NOT A GUARD AND NOTHING IN ANY SUITE READS A COMMENT, which is why the wording
 * below is now a CONDITION rather than an instruction, and why this paragraph was corrected with it
 * rather than left standing over a repaired sentence.
 *
 * IT DOES NOT SAY "BELOW". It said so until the screen was read: the exercise form this sends him
 * to is ABOVE the routine form, and the control that opens it is on the entry row itself. A
 * direction that points the wrong way is worse than none, because he goes looking.
 */
export const SCALING_LIVES_ON_THE_EXERCISE =
  'Its three intensity points belong to the exercise itself, set once, and every routine using it '
  + 'follows. A row whose exercise is in your library carries an Open control; a routine with none '
  + 'yet, or a removed exercise, has nothing to open.';

export function openExerciseLabel(name: string): string {
  return `Open ${name} to change how hard it can be made`;
}

/**
 * WHAT THE HOP SAYS WHEN THE EXERCISE IS NOT THERE ANY MORE.
 *
 * The row offered to open it because the catalogue held it when the page was read, and a second
 * window may have removed it since. Saying so is the only honest answer: opening an empty form
 * would offer to save an exercise he never asked for, under a name he did not choose.
 */
export function exerciseGoneWords(contentKey: string): string {
  return `No exercise with the key "${contentKey}" is in your library. It may have been removed in `
    + 'another window.';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Refusals
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A field's label from the path the record named it by.
 *
 * DERIVED rather than matched against a typed list of whole paths: an issue arrives as
 * `content.entries[3].duration_seconds`, and a lookup on the whole string would need one entry per
 * line per field and would miss the fourth line. So the leading segment picks the label, the entry
 * index is turned into the position a person counts from, and anything this screen has no word for
 * is carried through IN FULL rather than swallowed.
 *
 * The referential check names its paths differently again — `routines[0](legs-strength).entries[2]
 * .exercise_id` — because it validates a whole library at once. That shape is recognised too, for
 * the same reason: an issue whose label reads as machine noise is one he cannot act on.
 */
export function routineFieldLabel(path: string): string {
  const field = path.startsWith(CONTENT_PREFIX) ? path.slice(CONTENT_PREFIX.length) : path;
  // The referential check's own prefix, dropped so the tail is read exactly like the record's own.
  const own = field.replace(/^routines\[\d+\]\([^)]*\)\./u, '');
  const [head, ...rest] = own.split('.');
  const entry = /^entries\[(\d+)\]$/u.exec(head);

  if (entry !== null) {
    const position = Number(entry[1]) + 1;
    const within = rest.length > 0 ? `, ${entryFieldWords(rest.join('.'))}` : '';
    return `Exercise ${String(position)} in this routine${within}`;
  }

  switch (head) {
    case 'name': return ROUTINE_FIELD_LABELS.name;
    case 'split_day': return ROUTINE_FIELD_LABELS.splitDay;
    case 'focus': return ROUTINE_FIELD_LABELS.focus;
    case 'body_regions': return ROUTINE_FIELD_LABELS.bodyRegions;
    case 'description': return ROUTINE_FIELD_LABELS.description;
    case 'entries': return ROUTINE_FIELD_LABELS.entries;
    case 'id': return 'Name (the app makes a key out of it)';
    case 'provenance': return 'Where this routine came from (this is the app\'s own record)';
    default: return path;
  }
}

/** The words for one field inside an entry, or the record's own name for it. */
function entryFieldWords(field: string): string {
  switch (field) {
    case 'exercise_id': return 'which exercise';
    case 'sets': return 'sets';
    case 'repetitions': return 'repetitions';
    case 'duration_seconds': return 'how long';
    case 'rest_seconds': return 'rest';
    default: return field;
  }
}

/** Why a routine could not be saved, in the record's own words. */
export function describeRoutineRefusal(error: unknown): RefusalReport {
  return describeRefusal(error, 'routine', routineFieldLabel);
}

/** What the screen says once a routine HAS been saved. Said once, then gone. */
export function routineSavedWords(name: string, added: boolean): string {
  return added
    ? `${name} is in your library and saved on this device.`
    : `Your changes to ${name} are saved on this device.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Deleting
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * WHAT DELETING A ROUTINE ASKS HIM, AND THE ONE THING IT WILL NOT LET HIM DO.
 *
 * `core/model/referential.js` enforces `session.routine_id -> routine.id`: a session names one
 * routine and it must resolve. A routine that has never been run is an ordinary state and removing
 * it asks a plain question. A routine some session ALREADY RAN is different, and this refuses it
 * rather than warning about it — removing it would leave that session pointing at nothing, which is
 * a broken history rather than an error he could act on afterwards. He is told WHICH sessions.
 *
 * THE SENTENCE NAMES WHAT THE ACT DESTROYS, NOT WHAT WOULD RESTORE IT. A routine of his own is gone
 * for good and is said so plainly; a shipped one can come back from the admin reset, and that is
 * said with its price attached — the reset takes back every other shipped record he has changed
 * since, so offering it as a comfort without its cost would be the app under-selling a destruction.
 */
export interface RoutineRemoval {
  readonly title: string;
  readonly allowed: boolean;
  readonly whatWillHappen: string;
  /** Named when it is blocked, so he knows where to go. Empty when nothing has run it. */
  readonly usedBy: readonly string[];
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

export function describeRoutineRemoval(
  routine: RoutineSummary,
  usedBy: readonly string[],
): RoutineRemoval {
  if (usedBy.length > 0) {
    // BOTH HALVES BRANCH TOGETHER. A plural noun dropped into a sentence written for the other
    // number is the defect the exercise half shipped with, twice, and it is only ever found by
    // reading the rendered screen.
    const one = usedBy.length === 1;
    const has = one ? 'a session has already run it' : 'sessions have already run it';
    const those = one ? 'that session' : 'those sessions';

    return {
      title: `${routine.name} has already been used`,
      allowed: false,
      whatWillHappen: `${routine.name} cannot be removed while ${has}. Removing it would leave `
        + `${those} pointing at nothing. Change the routine, or leave it in place.`,
      usedBy: [...usedBy],
      // NOTHING TO CONFIRM, so there is no confirming label. The screen draws no such control in
      // this state and the field is empty rather than a plausible sentence.
      confirmLabel: '',
      cancelLabel: 'Close',
    };
  }

  return {
    title: `Remove ${routine.name}?`,
    allowed: true,
    whatWillHappen: routine.provenance === 'coach-created'
      ? `${routine.name} is yours, so nothing will bring it back. Its ${routine.size} stay in your `
        + 'library; only the routine is destroyed. No session has run it.'
      : `${routine.name} came with the app. Removing it destroys it here; restoring the shipped `
        + 'library from Admin also takes back every other shipped exercise, routine and curve you '
        + `have changed since. Its ${routine.size} stay in your library. No session has run it.`,
    usedBy: [],
    confirmLabel: `Remove ${routine.name}`,
    cancelLabel: 'Keep it',
  };
}

/** What the screen says once a routine is gone. */
export function routineRemovedWords(name: string): string {
  return `${name} is no longer in your library on this device.`;
}
