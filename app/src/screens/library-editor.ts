/**
 * WHAT THE LIBRARY EDITOR SAYS ABOUT AN EXERCISE — the whole derivation, and none of the drawing.
 *
 * The exercise library is the catalogue the coach trains from, and this is the half of the Routines
 * destination that lets him see it, add to it, change it and remove from it. Every judgement about
 * it is decided here, in a plain module a test can assert with no browser and no rendering at all,
 * and `RoutinesScreen.tsx` beside it draws the result and holds no decisions. The same split as
 * `screens/clients.ts` and `screens/ClientsScreen.tsx`, which is the pattern this file copies rather
 * than a shape invented for it.
 *
 * ## NO EXERCISE RULE LIVES HERE, AND THAT IS THE POINT
 *
 * `core/model/entities/exercise.js` is the schema and it is sealed. The field list, the speakable
 * name format, the closed vocabularies, the refusal of anything that looks like a load or a weight
 * BY NAME, the rule that exactly one of repetitions and duration is present and that which one is
 * decided by the measurement, and `R6` — THE CONTENT CONTRACT ITSELF, that a harder intensity point
 * asks for more work and less rest and never more load — are all ITS rules. This file does not
 * restate one of them, and it must not: a second copy of the contract is a copy that drifts, and the
 * drift would be silent in the worse direction, with the editor accepting a curve the library
 * refuses or refusing one it allows.
 *
 * So there is no validation in front of the write. The screen offers the draft to `store.create` or
 * `store.update`, and what comes back is either a committed record or the record's own issues, which
 * {@link describeExerciseRefusal} carries through UNCHANGED with a field label in front of them.
 * **That is how the content contract is enforced on this screen: the coach cannot set a violating
 * value, because the record refuses to hold one and tells him why in its own words.**
 *
 * What this file DOES own is the point-of-entry sentence — see {@link SCALING_CONTRACT_HINT} — which
 * says what the three points are for before he types, so the refusal reads as a rule he had been
 * told rather than as the application changing its mind about what it wants.
 *
 * ## PROVENANCE IS NOT ASSIGNED HERE EITHER
 *
 * `core/seed/provenance.js` owns the one rule that turns a shipped record into an edited one and
 * says in as many words that the library editing screen should call it rather than assigning a
 * value itself, because a screen that forgets leaves a record claiming to be untouched while showing
 * his changes — and the next reset silently reverts work he was never warned about. So
 * `library-editor-source.ts` calls `markEdited`, and nothing anywhere in the interface writes a
 * provenance string. This file only puts the three states into WORDS, so the list can tell him which
 * of his exercises the admin reset would put back and which are his own.
 *
 * ## THE VOCABULARY WORDS ARE DERIVED, NEVER TYPED
 *
 * A movement pattern reads `horizontal-push` in the record and "Horizontal push" on the screen, and
 * the second is computed from the first rather than kept in a table beside it. This build has now
 * watched a hand-typed list rot four times, and a table of twenty-five patterns, twenty-six muscle
 * groups and twenty-nine pieces of equipment is the largest one anybody has yet been tempted to
 * write. The vocabularies are frozen in `core/model/vocabularies.js` and extended there; a value
 * added there appears here with nobody remembering.
 */

import { scalingContractFindings } from '../../core/model/model.js';
import { verbatimOf } from './clients';

// ═══════════════════════════════════════════════════════════════════════════════
// What the core hands over
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * One prescription point as the record holds it: how much work, and at a scaling point how much
 * rest. Exactly one of `repetitions` and `duration_seconds` is present, and which one is the
 * record's rule rather than this file's.
 */
export interface PrescriptionContent {
  readonly sets: number;
  readonly repetitions?: number;
  readonly duration_seconds?: number;
  readonly rest_seconds?: number;
}

/**
 * An exercise record exactly as the store holds it: an envelope with the content nested under its
 * own key, never merged into it.
 *
 * The core is plain ECMAScript typed in documentation comments and is consumed here UNCHANGED — see
 * `tsconfig.json` — so the shape it needs is stated where it is used.
 */
export interface ExerciseRecord {
  readonly record_id: string;
  readonly rev: number;
  readonly content: {
    readonly id: string;
    readonly name: string;
    readonly long_name?: string;
    readonly movement_pattern: string;
    readonly primary_muscles: readonly string[];
    readonly secondary_muscles: readonly string[];
    readonly equipment: readonly string[];
    readonly measurement: string;
    readonly default_prescription: PrescriptionContent;
    readonly default_rest_seconds: number;
    readonly intensity: string;
    readonly scaling: Readonly<Record<string, PrescriptionContent>>;
    readonly hiit_suitable: boolean;
    readonly coaching_cue: string;
    readonly provenance: string;
  };
}

/** A page of the library exactly as the core paged it. `done` is carried, never dropped. */
export interface LibraryPage {
  readonly items: readonly ExerciseRecord[];
  readonly cursor: string | null;
  readonly done: boolean;
}

/** What the screen has been told about the exercise library right now. */
export interface LibraryReading {
  readonly page: LibraryPage;
  /** What he typed into the filter box, or the empty string. Changes what an empty page MEANS. */
  readonly search: string;
  /**
   * How many exercises the COLLECTION holds, measured by walking it.
   *
   * Separate from the page's length on purpose: the counting sentence is a claim about his library,
   * and stating a page size where a library total belongs is how it came to say "25 exercises in
   * your library" to a coach holding a hundred.
   */
  readonly total: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Vocabulary words, derived
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A closed-vocabulary value as a person reads it: `horizontal-push` becomes "Horizontal push".
 *
 * Mechanical on purpose. The alternative is a table of eighty-odd phrases beside the vocabularies,
 * and this build's own recurring defect is exactly that shape — the table stops matching the world
 * and nothing errors. A value the vocabulary gains tomorrow reads correctly here today.
 */
export function vocabularyWords(value: string): string {
  const spaced = value.replace(/-/gu, ' ');
  const sentence = spaced.charAt(0).toUpperCase() + spaced.slice(1);
  // The one thing the mechanical rule cannot know — see ACRONYMS.
  return sentence
    .split(' ')
    .map((word) => ACRONYMS[word.toLowerCase()] ?? word)
    .join(' ');
}

/**
 * THE ONE THING THE MECHANICAL RULE CANNOT DERIVE: a vocabulary value that is an ACRONYM.
 *
 * `hiit` came out as "Hiit" on the routine form, which is not a word and is not what a coach calls
 * it — found by reading the rendered screen, exactly like the plural-agreement defects. Sentence
 * case is right for every other value and stays the rule; this is the narrow exception.
 *
 * IT CANNOT ROT SILENTLY: `library-routines.test.ts` asserts that every key here is a value some
 * frozen vocabulary actually holds, so an entry that stops matching the world turns red instead of
 * sitting here forever. That is the opposite risk profile from the eighty-phrase table this file's
 * header refuses, and it is why one entry is acceptable where a table is not.
 */
const ACRONYMS: Readonly<Record<string, string>> = { hiit: 'HIIT' };

/** The acronyms above, exposed so the guard can check them against the vocabularies. */
export const ACRONYM_VALUES: readonly string[] = Object.freeze(Object.keys(ACRONYMS));

/** A list of vocabulary values as a sentence fragment, or the honest word for none of them. */
export function vocabularyList(values: readonly string[], none: string): string {
  if (values.length === 0) return none;
  return values.map(vocabularyWords).join(', ');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Provenance, in words
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * WHAT PROVENANCE MEANS TO THE COACH, and it is stated as what a reset would DO rather than as a
 * category, because the category is machinery and the consequence is the thing he needs.
 *
 * The three keys are the record's own values. They are not re-declared as constants here —
 * `core/seed/provenance.js` owns them, and this is a lookup from a value to a sentence, which is the
 * one direction that cannot invent a fourth state.
 */
const PROVENANCE_WORDS: Readonly<Record<string, string>> = {
  'shipped-untouched': 'Came with the app',
  'shipped-edited': 'Came with the app, you have changed it',
  'coach-created': 'Yours',
};

/**
 * The word for where an exercise came from, or the value itself when it is one this screen has no
 * sentence for.
 *
 * A provenance value with no word is shown AS THE RECORD HOLDS IT rather than swallowed or guessed
 * at. An unlabelled row would be a state the coach can see the effect of and not the cause.
 */
export function provenanceWords(provenance: string): string {
  return PROVENANCE_WORDS[provenance] ?? provenance;
}

// ═══════════════════════════════════════════════════════════════════════════════
// The list
// ═══════════════════════════════════════════════════════════════════════════════

/** One exercise on the library list, worded. */
export interface ExerciseSummary {
  readonly recordId: string;
  /** The record's revision, carried so an edit can be written against the one he was shown. */
  readonly rev: number;
  /** The content key. Machinery, and shown only so a coach can read it out when something is wrong. */
  readonly contentKey: string;
  /** What he calls it. This is what he scans the list for. */
  readonly name: string;
  /** The movement, worded. */
  readonly movement: string;
  /** The muscles it is for, worded. */
  readonly muscles: string;
  /** What it needs, worded. */
  readonly equipment: string;
  /** How it is counted, and how much, in one phrase. */
  readonly prescription: string;
  /** The rest between sets, as a phrase with its unit. */
  readonly rest: string;
  /** The intensity level it sits at, worded. */
  readonly intensity: string;
  /** His own coaching cue, shown as he wrote it. */
  readonly cue: string;
  readonly provenance: string;
  readonly provenanceWord: string;
  /**
   * The contract's notice about this exercise's three points, or null.
   *
   * ON THE ROW rather than only on the form, because the notice's whole purpose is that a slip he
   * waved past is still visible when he comes back to it. A warning that only ever appears in the
   * second before he presses save is one nobody sees twice.
   */
  readonly contractNotice: string | null;
}

/** What the whole library list says. */
export interface LibraryReport {
  /** How many are being SHOWN — every match while searching, one page while not. */
  readonly count: number;
  /** How many the LIBRARY holds. What the counting sentence is a claim about. */
  readonly total: number;
  readonly intro: string;
  /** True when there is nothing at all to show. */
  readonly empty: boolean;
  /** True when the page stopped short of the end, so the count is a floor rather than a total. */
  readonly more: boolean;
  readonly moreWords: string | null;
  readonly items: readonly ExerciseSummary[];
}

/** Seconds as a phrase with its unit. A value and its unit belong together. */
export function seconds(value: number): string {
  return value === 1 ? '1 second' : `${value} seconds`;
}

/**
 * How much work one point asks for, in one phrase.
 *
 * Which of the two work fields is present is the RECORD's decision, driven by the measurement, so
 * this reads whichever it finds rather than consulting the measurement a second time and reaching a
 * different answer from the record about what is stored.
 */
export function prescriptionWords(point: PrescriptionContent): string {
  const sets = point.sets === 1 ? '1 set' : `${point.sets} sets`;

  if (typeof point.repetitions === 'number') {
    const reps = point.repetitions === 1 ? '1 repetition' : `${point.repetitions} repetitions`;
    return `${sets} of ${reps}`;
  }
  if (typeof point.duration_seconds === 'number') {
    return `${sets} of ${seconds(point.duration_seconds)}`;
  }
  // Neither is present, which the record does not allow. Said plainly rather than rendered as an
  // empty phrase: a blank where a figure should be reads as a screen that failed to load.
  return `${sets}, and this record says nothing about how much`;
}

/** One exercise, worded. */
export function describeExercise(record: ExerciseRecord): ExerciseSummary {
  const { content } = record;

  return {
    recordId: record.record_id,
    rev: record.rev,
    contentKey: content.id,
    name: content.name,
    movement: vocabularyWords(content.movement_pattern),
    muscles: vocabularyList(content.primary_muscles, 'Not recorded'),
    equipment: vocabularyList(content.equipment, 'Nothing'),
    prescription: prescriptionWords(content.default_prescription),
    rest: seconds(content.default_rest_seconds),
    intensity: vocabularyWords(content.intensity),
    cue: content.coaching_cue,
    provenance: content.provenance,
    provenanceWord: provenanceWords(content.provenance),
    contractNotice: describeContractNotice(content)?.summary ?? null,
  };
}

/**
 * Everything the library list says, from the page the core handed over.
 *
 * AN EMPTY LIBRARY IS A REAL STATE AND IT IS NOT AN ERROR. The shipped library is seeded once and
 * never again on the application's own initiative, so a coach who has deleted everything has done it
 * deliberately and must not be told he has broken something. He is told where the shipped set can be
 * brought back from instead, in words rather than by a link, because Admin is a destination and a
 * destination never appears inside a screen.
 *
 * The empty sentence differs by whether he is FILTERING, because the two are different facts: one
 * says the library is empty, the other says nothing in it matches what he typed.
 */
export function describeLibrary(reading: LibraryReading): LibraryReport {
  const items = reading.page.items.map(describeExercise);
  const searching = reading.search.trim().length > 0;

  return {
    count: items.length,
    total: reading.total,
    intro: libraryIntro(items.length, searching, reading.search.trim(), reading.total),
    empty: items.length === 0,
    more: !reading.page.done,
    moreWords: reading.page.done
      ? null
      : 'There are more than these. This shows them in key order, a page at a time.',
    items,
  };
}

/**
 * WHICH NUMBER GOES IN WHICH SENTENCE, and they are two different facts.
 *
 * `count` is how many are being SHOWN — every match when he is searching, one page when he is not.
 * `total` is how many the LIBRARY holds. The searching sentences take `count`, because "N exercises
 * match" is a claim about the matches; the library sentences take `total`, because "N exercises in
 * your library. Every one of them is yours to change or remove" is a claim about the library.
 *
 * PUTTING `count` IN THE LIBRARY SENTENCE IS THE ORIGINAL DEFECT, and putting `total` in the
 * matching sentence is the same defect inverted — it would answer "Sled" with "100 exercises match".
 */
function libraryIntro(count: number, searching: boolean, search: string, total: number): string {
  if (count === 0) {
    return searching
      ? `Nothing in your library matches "${search}". Clear the box to see all of it again.`
      : 'There are no exercises in your library. Add one below, or restore the set the app came '
        + 'with from the Admin screen on the navigation.';
  }

  // The VERB is branched with the noun, not left plural over a singular subject. Rendered, the other
  // way round reads "1 exercise match", which is the same fault the removal panel had and was found
  // the same way — by looking at the screen after every property check had passed.
  if (searching) {
    return count === 1 ? `1 exercise matches "${search}".` : `${count} exercises match "${search}".`;
  }

  return total === 1
    ? '1 exercise in your library, and it is yours to change or remove.'
    : `${total} exercises in your library. Every one of them is yours to change or remove.`;
}

/**
 * WHICH EXERCISES MATCH WHAT HE TYPED, and it is a plain function so the filtering is asserted
 * rather than buried in a component.
 *
 * It matches the NAME and the coaching cue only. Deliberately not the vocabularies: a search for
 * "bench" that returned every exercise using a bench would bury the bench press he was looking for
 * under thirty accessory movements, and he has no way to tell the app he meant the name.
 */
export function matchesSearch(record: ExerciseRecord, search: string): boolean {
  const wanted = search.trim().toLowerCase();
  if (wanted.length === 0) return true;

  const { content } = record;
  return content.name.toLowerCase().includes(wanted)
    || content.coaching_cue.toLowerCase().includes(wanted);
}

// ═══════════════════════════════════════════════════════════════════════════════
// The form
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * One prescription point as he types it.
 *
 * `amount` is ONE box rather than two, and which record field it becomes is decided by the
 * measurement in {@link exerciseContent}. Two boxes, one of which must be left empty, is a form that
 * invites the exact mistake `R5` exists to refuse — and having typed into the wrong one, he would
 * be told his exercise is counted in repetitions by a screen that offered him a duration.
 *
 * Everything is held as TEXT, because that is what an input holds. Turning it into a number is done
 * once, on the way to the record, and a value that is not a whole number reaches the record as it
 * was typed so the record refuses it in its own words rather than this file inventing a sentence.
 */
export interface PointDraft {
  readonly sets: string;
  readonly amount: string;
  readonly rest: string;
}

/** What the coach typed, before the record has seen it. */
export interface ExerciseDraft {
  readonly name: string;
  readonly longName: string;
  readonly movementPattern: string;
  readonly primaryMuscles: readonly string[];
  readonly secondaryMuscles: readonly string[];
  readonly equipment: readonly string[];
  readonly measurement: string;
  readonly defaultSets: string;
  readonly defaultAmount: string;
  readonly defaultRest: string;
  readonly intensity: string;
  readonly scaling: Readonly<Record<string, PointDraft>>;
  readonly hiitSuitable: boolean;
  readonly coachingCue: string;
}

const EMPTY_POINT: PointDraft = Object.freeze({ sets: '', amount: '', rest: '' });

/**
 * An empty form. One value, so the screen and its reset cannot disagree about what empty is.
 *
 * The three scaling keys come from the record model's own `INTENSITY_LEVELS`, so a level added there
 * appears on the form without anybody remembering. That is why this is built rather than written out.
 */
export function emptyExerciseDraft(levels: readonly string[]): ExerciseDraft {
  return Object.freeze({
    name: '',
    longName: '',
    movementPattern: '',
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: [],
    measurement: '',
    defaultSets: '',
    defaultAmount: '',
    defaultRest: '',
    intensity: '',
    scaling: Object.freeze(Object.fromEntries(levels.map((level) => [level, EMPTY_POINT]))),
    hiitSuitable: false,
    coachingCue: '',
  });
}

/** How much work a point asks for, whichever field the record put it in. */
function amountOf(point: PrescriptionContent | undefined): string {
  if (point === undefined) return '';
  if (typeof point.repetitions === 'number') return String(point.repetitions);
  if (typeof point.duration_seconds === 'number') return String(point.duration_seconds);
  return '';
}

function numberText(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : '';
}

/**
 * The form filled in from an exercise he is editing.
 *
 * IT READS THE RECORD AND NOTHING ELSE. A form seeded from the worded summary would show him the
 * words this file computed rather than the values the record holds, and the round trip would quietly
 * rewrite his exercise the first time he pressed save without changing anything.
 */
export function draftFromExercise(record: ExerciseRecord, levels: readonly string[]): ExerciseDraft {
  const { content } = record;

  return {
    name: content.name,
    longName: content.long_name ?? '',
    movementPattern: content.movement_pattern,
    primaryMuscles: [...content.primary_muscles],
    secondaryMuscles: [...content.secondary_muscles],
    equipment: [...content.equipment],
    measurement: content.measurement,
    defaultSets: numberText(content.default_prescription?.sets),
    defaultAmount: amountOf(content.default_prescription),
    defaultRest: numberText(content.default_rest_seconds),
    intensity: content.intensity,
    scaling: Object.fromEntries(levels.map((level) => {
      const point = content.scaling?.[level];
      return [level, {
        sets: numberText(point?.sets),
        amount: amountOf(point),
        rest: numberText(point?.rest_seconds),
      }];
    })),
    hiitSuitable: content.hiit_suitable === true,
    coachingCue: content.coaching_cue,
  };
}

/**
 * A typed figure as a whole number, or AS HE TYPED IT when it is not one.
 *
 * The wrong thing to do here is coerce: `Number('')` is nought and `parseInt('12kg')` is twelve, and
 * both would put a value into the record that he never entered. What is not a whole number travels
 * to the record unchanged, and the record says what is wrong with it in the sentence it wrote for
 * exactly that — which is also the sentence a load token has to reach, since "12kg" is precisely the
 * shape a coach reaching for a weight would type.
 */
export function wholeNumber(text: string): number | string {
  const trimmed = text.trim();
  if (!/^-?\d+$/u.test(trimmed)) return trimmed;
  return Number(trimmed);
}

/**
 * THE CONTENT KEY FOR A NEW EXERCISE, DERIVED FROM HIS NAME RATHER THAN ASKED FOR.
 *
 * The key is machinery: it is what a routine's entry names, what the seed's shipped set is compared
 * against, and what the store holds unique per kind. He should never be asked to invent one, and a
 * box asking for "lowercase letters, digits and single hyphens" on a screen about squats is a box he
 * would rightly resent.
 *
 * The name format the record enforces is letters and single spaces, so the conversion is total for
 * every name the record accepts. It is applied to whatever he typed regardless — a name the record
 * will refuse produces a key that goes with it, and the record refuses the pair together with its
 * own sentence about the name rather than this file guessing which of the two is wrong.
 */
export function contentKeyFor(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

/**
 * The content of an exercise, from the draft and from the record it is replacing.
 *
 * NO PROVENANCE IS SET HERE. `library-editor-source.ts` puts it on by calling the core's own
 * `markEdited`, which is the one place the rule lives — see the header.
 *
 * `measurement` decides which work field each point carries, which is the presentation mapping the
 * one-box form is built on, and it is NOT the rule: the record checks the same relationship itself
 * and refuses a mismatch. If he switches an exercise from repetitions to time, the figures he
 * already typed move with it, and the record then says whether the values are in range for their new
 * unit. Nothing is silently dropped and nothing is silently converted.
 *
 * @param levels the record model's own `INTENSITY_LEVELS`, in its own order.
 */
export function exerciseContent(
  draft: ExerciseDraft,
  levels: readonly string[],
  existingKey: string | null,
): Record<string, unknown> {
  const name = draft.name.trim();
  const longName = draft.longName.trim();

  const point = (sets: string, amount: string, rest: string | null): Record<string, unknown> => {
    const built: Record<string, unknown> = { sets: wholeNumber(sets) };
    // The measurement decides which field the figure lands in. An unanswered measurement puts it in
    // neither, and the record's own exclusivity rule is what tells him to answer that question — a
    // guess here would pick one and let a plank be prescribed in repetitions.
    if (draft.measurement === 'repetitions') built.repetitions = wholeNumber(amount);
    else if (draft.measurement === 'time') built.duration_seconds = wholeNumber(amount);
    if (rest !== null) built.rest_seconds = wholeNumber(rest);
    return built;
  };

  const content: Record<string, unknown> = {
    // An existing exercise KEEPS ITS KEY when he renames it. The key is what a routine's entry
    // points at, so re-deriving it from a corrected spelling would break every routine using it
    // while the screen reported a successful save.
    id: existingKey ?? contentKeyFor(name),
    name,
    movement_pattern: draft.movementPattern,
    primary_muscles: [...draft.primaryMuscles],
    secondary_muscles: [...draft.secondaryMuscles],
    equipment: [...draft.equipment],
    measurement: draft.measurement,
    default_prescription: point(draft.defaultSets, draft.defaultAmount, null),
    default_rest_seconds: wholeNumber(draft.defaultRest),
    intensity: draft.intensity,
    scaling: Object.fromEntries(levels.map((level) => {
      const held = draft.scaling[level] ?? EMPTY_POINT;
      return [level, point(held.sets, held.amount, held.rest)];
    })),
    hiit_suitable: draft.hiitSuitable,
    coaching_cue: draft.coachingCue.trim(),
  };

  // AN EMPTY LONG NAME IS OMITTED RATHER THAN WRITTEN AS AN EMPTY STRING. The field is optional to
  // the record, and an empty string would record that he answered when he did not — and would then
  // be refused for being shorter than the minimum, which is a refusal about a question he declined.
  if (longName.length > 0) content.long_name = longName;

  return content;
}

// ═══════════════════════════════════════════════════════════════════════════════
// The words on the form
// ═══════════════════════════════════════════════════════════════════════════════

/** The words on each field, in the order they are asked for. */
export const FIELD_LABELS = Object.freeze({
  name: 'Name',
  longName: 'Longer name',
  movementPattern: 'Movement',
  primaryMuscles: 'Main muscles',
  secondaryMuscles: 'Other muscles worked',
  equipment: 'Equipment',
  measurement: 'Counted in',
  defaultSets: 'Sets',
  defaultAmount: 'How much',
  defaultRest: 'Rest between sets',
  intensity: 'Intensity',
  hiitSuitable: 'Suitable for interval work',
  coachingCue: 'Coaching cue',
});

/** The heading over the form, for each of the two things it does. */
export const ADD_FORM_TITLE = 'Add an exercise';
export const EDIT_FORM_TITLE = 'Change this exercise';

/** What the button says. An exercise, not a record. */
export const ADD_BUTTON = 'Add this exercise';
export const SAVE_BUTTON = 'Save these changes';
export const CANCEL_BUTTON = 'Leave it as it was';

/**
 * WHAT THE NAME BOX IS FOR, standing under the field itself.
 *
 * The record refuses abbreviations and bare letters, and the reason is not obvious from the refusal
 * alone: the app READS THIS ALOUD during a session. Told beforehand, "RDL" reads as a rule he had
 * been given; told only by the refusal, it reads as fussiness.
 */
export const NAME_HINT =
  'Write the movement out the way you would say it, because the app reads this aloud during a '
  + 'session. "Romanian deadlift", not "RDL".';

/**
 * THE CONTENT CONTRACT, SAID BEFORE HE TYPES rather than only when the record refuses him.
 *
 * The rule itself belongs to `core/model/entities/exercise.js` and is enforced there. This is the
 * same rule in his words, at the point of entry, and it is the ONE sentence on this screen that has
 * to be right: the three points are what the intensity adapter scales a session along, and a curve
 * that gets easier as it rises would have the app proposing a lighter session for a harder day in
 * front of a client.
 */
export const SCALING_CONTRACT_HINT =
  'These three are how hard a session can be made, and they only ever move one way: a harder point '
  + 'asks for more work and less rest than an easier one. Never more weight — the app does not '
  + 'prescribe weight at all, because that is your call for the person in front of you, and you '
  + 'record what they actually lifted during the session.';

/** What the "how much" box means, and it depends on the answer above it. */
export function amountHint(measurement: string): string {
  if (measurement === 'time') return 'How many seconds each set is held or worked for.';
  if (measurement === 'repetitions') return 'How many repetitions in each set.';
  return 'Answer "Counted in" first, and this becomes either repetitions or seconds.';
}

/**
 * WHY THE APP NEVER ASKS FOR A WEIGHT, said once where he would go looking for the box.
 *
 * He is a certified professional and the absence of a load field is the most surprising thing about
 * this form. Unexplained it reads as an omission, and the natural response to an omission is to type
 * the weight into the coaching cue, where nothing can ever use it.
 */
export const NO_LOAD_HERE =
  'There is no weight or resistance box, on purpose. What somebody lifts is your judgement about '
  + 'that person on that day, so it is recorded during the session against the client, not fixed '
  + 'here for everybody.';

// ═══════════════════════════════════════════════════════════════════════════════
// Refusals
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The envelope's own prefix on a validation path. Measured, not assumed — see `clients.ts`.
 *
 * Exported because all three library kinds strip it, and three copies of the same string is three
 * places to miss if the envelope ever names its content differently.
 */
export const CONTENT_PREFIX = 'content.';

/**
 * A field's label from the path the record named it by.
 *
 * The path is DERIVED rather than matched against a typed list of field names: an issue arrives as
 * `content.scaling.high.rest_seconds`, and a lookup keyed on whole paths would need one entry per
 * point per field and would miss the next one added. So the leading segment picks the label and the
 * rest is carried through as the record wrote it, which keeps a deep path readable and keeps a path
 * this screen has no word for visible IN FULL rather than swallowed.
 */
export function fieldLabel(path: string): string {
  const field = path.startsWith(CONTENT_PREFIX) ? path.slice(CONTENT_PREFIX.length) : path;
  const [head, ...rest] = field.split('.');
  const tail = rest.length > 0 ? ` (${rest.join(' ')})` : '';

  switch (head) {
    case 'name': return FIELD_LABELS.name;
    case 'long_name': return FIELD_LABELS.longName;
    case 'movement_pattern': return FIELD_LABELS.movementPattern;
    case 'primary_muscles': return FIELD_LABELS.primaryMuscles;
    case 'secondary_muscles': return FIELD_LABELS.secondaryMuscles;
    case 'equipment': return FIELD_LABELS.equipment;
    case 'measurement': return FIELD_LABELS.measurement;
    case 'default_prescription': return `${FIELD_LABELS.defaultSets} and how much${tail}`;
    case 'default_rest_seconds': return FIELD_LABELS.defaultRest;
    case 'intensity': return FIELD_LABELS.intensity;
    case 'scaling': return `The three intensity points${tail}`;
    case 'hiit_suitable': return FIELD_LABELS.hiitSuitable;
    case 'coaching_cue': return FIELD_LABELS.coachingCue;
    // The content key he was never asked for. Named as what he DID type, because a refusal about a
    // field with no box on the form is a refusal he cannot act on.
    case 'id': return 'Name (the app makes a key out of it)';
    // A provenance issue is this application's fault and not his, and it is labelled as such rather
    // than dressed up as a field he could correct.
    case 'provenance': return 'Where this exercise came from (this is the app\'s own record)';
    default: return path;
  }
}

/** One issue the record raised, with a field label in front of it. */
export interface RefusedField {
  readonly label: string;
  readonly path: string;
  readonly code: string;
  /** The record's own words. Never reworded here — see the header. */
  readonly message: string;
}

/** What the screen says when an exercise could not be saved. */
export interface RefusalReport {
  readonly headline: string;
  readonly fields: readonly RefusedField[];
  /** The failure's own text when it was not a validation refusal. Kept verbatim. */
  readonly verbatim: string | null;
}

/** A validation issue as `core/model/issues.js` shapes it, and as `StoreValidationError` carries it. */
interface Issue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

function issuesOf(error: unknown): readonly Issue[] | null {
  if (error === null || typeof error !== 'object') return null;
  const held = (error as { issues?: unknown }).issues;
  if (!Array.isArray(held)) return null;
  const issues = held.filter(
    (issue): issue is Issue =>
      issue !== null && typeof issue === 'object'
      && typeof (issue as Issue).path === 'string'
      && typeof (issue as Issue).code === 'string'
      && typeof (issue as Issue).message === 'string',
  );
  return issues.length > 0 ? issues : null;
}

/**
 * WHY A LIBRARY RECORD OF ANY KIND COULD NOT BE SAVED, in the record's words.
 *
 * THIS IS WHERE THE CONTENT CONTRACT REACHES THE COACH. A curve whose harder point rests longer is
 * refused by `checkScaling` with a sentence that says a harder point means less rest and never more,
 * and that sentence arrives here and is shown as it was written. Rewording it would be this screen
 * paraphrasing a rule it does not own, and the two versions would come apart the first time either
 * was edited.
 *
 * IT IS ONE FUNCTION FOR ALL THREE LIBRARY KINDS rather than one per kind, and that is the point:
 * the exercise editor, the routine editor and the curve editor all show a record's own issues with a
 * field label in front of them, and three copies of that would be three chances for one of them to
 * start swallowing an issue it has no label for. What differs between the kinds is the NOUN and the
 * label lookup, so those are arguments — see `library-routines.ts` and `library-patterns.ts`, which
 * pass their own.
 *
 * `verbatimOf` is imported from `clients.ts` rather than written again: it is already the one idea
 * of "the failure's own words" in this interface, and its own header says so.
 *
 * @param noun what the coach calls the thing he was saving — "exercise", "routine", "curve".
 * @param label the kind's own path-to-label function. A path it has no word for must come back IN
 * FULL rather than swallowed, which is what {@link fieldLabel} does and what a kind's own must do.
 */
export function describeRefusal(
  error: unknown,
  noun: string,
  label: (path: string) => string,
): RefusalReport {
  const issues = issuesOf(error);

  if (issues === null) {
    return {
      headline: `That ${noun} could not be saved on this device`,
      fields: [],
      verbatim: verbatimOf(error),
    };
  }

  return {
    headline: issues.length === 1
      ? `That ${noun} was not saved, and this is why`
      : `That ${noun} was not saved, and these are the reasons`,
    fields: issues.map((issue) => ({
      label: label(issue.path),
      path: issue.path,
      code: issue.code,
      message: issue.message,
    })),
    verbatim: null,
  };
}

/** {@link describeRefusal} for an exercise, with the exercise form's own labels. */
export function describeExerciseRefusal(error: unknown): RefusalReport {
  return describeRefusal(error, 'exercise', fieldLabel);
}

// ═══════════════════════════════════════════════════════════════════════════════
// The contract's notice — a warning, on his own exercise, that does not stop him
// ═══════════════════════════════════════════════════════════════════════════════

/** One point that breaks the contract, and the record's own sentence about it. */
export interface NoticedPoint {
  /** The level as the record names it — `high`. */
  readonly level: string | null;
  /** The level as the ladder's own legend names it — "High". */
  readonly label: string;
  /** The record's words. Never reworded here, for the reason `describeRefusal` gives. */
  readonly message: string;
}

/** What the screen says about a ladder that breaks the contract on HIS exercise. */
export interface ContractNotice {
  readonly title: string;
  readonly points: readonly NoticedPoint[];
  readonly closing: string;
  /** The whole thing as one line, for a list row that has no room for three. */
  readonly summary: string;
}

/**
 * THE TITLE, AND WHY IT IS NOT AN ALARM.
 *
 * The user settled that this warns rather than refuses, and the reasoning was that he is the
 * certified professional and the app is a supporting role. A red band saying something is WRONG
 * would be the app overruling him in the voice it uses for its own failures — and it is a band he
 * would learn to press past, which would take the sentence with it. It states what it noticed,
 * quietly, and names the point.
 */
export const CONTRACT_NOTICE_TITLE = 'These three points do not rise the way a harder point usually does';

/**
 * WHAT IT COSTS, said once and said plainly.
 *
 * Not a plea to change it. The one fact he cannot see from this form is REACH: these three numbers
 * are what the intensity adapter builds every future session from for this exercise, for every
 * client, until he changes them. That is the sentence that makes an accepted slip recoverable —
 * he knows where it will show up.
 */
const CONTRACT_NOTICE_CLOSING =
  'Nothing here stops you saving it. Every session you shape to a curve builds this exercise from '
  + 'these three points, for everyone you train, until you change them here.';

/**
 * WHAT THE CONTRACT NOTICED ABOUT ONE EXERCISE, or nothing at all.
 *
 * The findings come from `core/model/entities/exercise.js` — the SAME `R6` that refuses a shipped
 * ladder, run as a detector rather than as a gate. This file adds no comparison of its own: a
 * second copy of the rule would drift from the record's, and the drift would show up as a form
 * warning about a ladder the record was perfectly happy with, or worse, the reverse.
 *
 * IT NAMES EVERY OFFENDING POINT, one line each, in the record's own sentence. Collapsing them into
 * a single "check your values" is the failure this notice exists instead of: a warning that names
 * nothing is one he cannot act on, and it is indistinguishable from decoration.
 *
 * @param content one exercise's content — the draft on its way to the record, or the record itself.
 */
export function describeContractNotice(content: unknown): ContractNotice | null {
  const findings = scalingContractFindings(content as Record<string, unknown>);
  if (findings.length === 0) return null;

  const points: NoticedPoint[] = findings.map((finding) => ({
    level: finding.level,
    // A finding the record raised about the ladder as a whole is labelled as such rather than
    // being pinned on a point it did not name.
    label: finding.level === null ? 'These three points' : vocabularyWords(finding.level),
    message: finding.message,
  }));

  return {
    title: CONTRACT_NOTICE_TITLE,
    points,
    closing: CONTRACT_NOTICE_CLOSING,
    summary: `${CONTRACT_NOTICE_TITLE}: ${points.map((point) => point.label).join(', ')}.`,
  };
}

/** What the screen says when an exercise HAS been saved. Said once, then gone. */
export function savedWords(name: string, added: boolean): string {
  return added
    ? `${name} is in your library and saved on this device.`
    : `Your changes to ${name} are saved on this device.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Deleting
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * WHAT DELETING AN EXERCISE ASKS HIM, and the one thing it will not let him do.
 *
 * `core/model/referential.js` states the invariant in one direction: every exercise a routine names
 * must exist, and never the reverse. An exercise nothing points at is a NORMAL state — it is the
 * substitution pool the coach swaps from mid-session and the pool the intensity adapter draws on —
 * so removing an unused one asks a plain question and gets on with it.
 *
 * An exercise a routine IS using is different, and this refuses it rather than warning about it. That
 * is not the app overruling him: it is the app declining to leave a routine pointing at something
 * that is not there, which is a state nothing in this build can render and which would surface as a
 * broken session in front of a client rather than as an error here. He is told WHICH routines, so
 * the thing he has to do next is on the screen rather than left for him to find.
 */
export interface RemovalConfirmation {
  readonly title: string;
  /** True when he may go ahead. False when a routine is still using it. */
  readonly allowed: boolean;
  readonly whatWillHappen: string;
  /** Named when it is blocked, so he knows where to go. Empty when nothing uses it. */
  readonly usedBy: readonly string[];
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

/**
 * The confirmation for one exercise.
 *
 * @param usedBy the NAMES of the routines whose entries point at this exercise, as
 * `library-editor-source.ts` read them off the store. An empty list means nothing points at it, and
 * that must be a measured answer rather than an assumption — see the source module.
 */
export function describeRemoval(
  exercise: ExerciseSummary,
  usedBy: readonly string[],
): RemovalConfirmation {
  if (usedBy.length > 0) {
    // THE WHOLE SENTENCE AGREES, not just its first clause. It read "while this routine still ask
    // for it. Take it out of them first" on a real screen with one routine on it — every property
    // check passed, and it was found by looking. So the two halves are branched together rather
    // than a plural noun being dropped into a sentence written for the other number.
    const one = usedBy.length === 1;
    const asks = one ? 'a routine still asks for it' : 'routines still ask for it';
    const takeItOut = one ? 'Take it out of that routine' : 'Take it out of those routines';

    return {
      title: `${exercise.name} is still being used`,
      allowed: false,
      whatWillHappen:
        `${exercise.name} cannot be removed while ${asks}. ${takeItOut} first, or swap it for `
        + 'something else, and then remove it here.',
      usedBy: [...usedBy],
      // NOTHING TO CONFIRM, so there is no confirming label to press. The screen draws no such
      // control in this state, and the field is the empty string rather than a plausible sentence
      // that would read as a button if anything ever drew one.
      confirmLabel: '',
      cancelLabel: 'Close',
    };
  }

  return {
    title: `Remove ${exercise.name}?`,
    allowed: true,
    whatWillHappen: exercise.provenance === 'coach-created'
      ? `${exercise.name} is yours, so nothing will bring it back. No routine is using it. Sessions `
        + 'you have already recorded keep what was actually done and are not touched.'
      : `${exercise.name} came with the app, so restoring the shipped library from Admin would bring `
        + 'it back — along with every other shipped exercise and routine you have changed since. No '
        + 'routine is using it. Sessions you have already recorded are not touched.',
    usedBy: [],
    confirmLabel: `Remove ${exercise.name}`,
    cancelLabel: 'Keep it',
  };
}

/** What the screen says once an exercise is gone. Said in his words, with its name. */
export function removedWords(name: string): string {
  return `${name} is no longer in your library on this device.`;
}
