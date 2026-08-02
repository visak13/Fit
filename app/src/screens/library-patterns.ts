/**
 * WHAT THE LIBRARY EDITOR SAYS ABOUT A CURVE — the third library kind, and the one nothing could edit.
 *
 * An intensity pattern is a CURVE: the ordered intensity points a session is shaped to, plus the rule
 * for spreading a curve of *k* points across a routine of *n* exercises. Seven ship. They are the
 * buttons the coach presses mid-session, and until this module there was no way to add one, change
 * one or take one away — while the admin reset restored them faithfully to a set he could not see the
 * whole of. `entities/intensity-pattern.js` says in as many words that patterns ship as DATA rather
 * than as code precisely so that he can.
 *
 * ## THE CURVE'S OWN WORDS COME FROM `intensity.ts`, NOT FROM HERE
 *
 * `toggleFor` already turns a stored pattern into the name, the description and the spelled-out
 * sequence he sees on the button he presses. That IS this application's idea of what a curve is
 * called and what shape it has, and the editor composes with it: the list rows and the buttons are
 * the same sentence, so a curve he renames reads identically in both places. A second wording here
 * would be a second idea of one truth, and the drift would show up as an editor describing a curve
 * differently from the button that runs it.
 *
 * ## THE CONTENT CONTRACT AND THIS RECORD — READ THIS BEFORE ADDING A CHECK
 *
 * The contract is that a harder intensity point means MORE WORK AND LESS REST, never more load.
 *
 * **`entities/intensity-pattern.js` HAS NO SUCH VALIDATOR, AND IT SHOULD NOT.** A pattern carries no
 * work value, no rest value and no load value — it carries a `sequence` of names drawn from the
 * model's own `INTENSITY_LEVELS`, and a `mapping_rule` for spreading them. There is no field on this
 * record in which a coach could set more rest at a harder point, so there is nothing here for such a
 * rule to check. What the work and the rest actually ARE at each named level belongs to each
 * EXERCISE — `scaling`, ordered by `R6`/`checkScaling` in `entities/exercise.js`, which is where the
 * contract is enforced and where the exercise editor already carries it to him.
 *
 * So the contract binds patterns STRUCTURALLY rather than by a check: `checkNoUnknownKeys` against
 * `INTENSITY_PATTERN_FIELDS` refuses any field outside the six, and `classifyLibraryKey` refuses a
 * load-shaped one by name with the contract's own sentence. A rule invented in this screen would be
 * a rule about fields that do not exist, and it would be the copy that drifts.
 *
 * The pattern record DOES have a rule of its own, `R11`, and it is the one the editor has to carry:
 * a name that spells out a curve must tell the truth about the sequence, because a button labelled
 * `Low Medium High Low` whose curve is anything else is a lie on a control he presses in front of a
 * client.
 */

import { CONTENT_PREFIX, describeRefusal, provenanceWords, vocabularyWords } from './library-editor';
import type { RefusalReport } from './library-editor';
import { toggleFor } from './intensity';

// ═══════════════════════════════════════════════════════════════════════════════
// What the core hands over
// ═══════════════════════════════════════════════════════════════════════════════

/** A pattern record exactly as the store holds it. */
export interface PatternRecord {
  readonly record_id: string;
  readonly rev: number;
  readonly content: {
    readonly id: string;
    readonly name: string;
    readonly sequence: readonly string[];
    readonly mapping_rule: string;
    readonly description: string;
    readonly provenance: string;
  };
}

/** A page of curves exactly as the core paged them. */
export interface PatternPage {
  readonly items: readonly PatternRecord[];
  readonly cursor: string | null;
  readonly done: boolean;
}

/** What the screen has been told about the curves right now. */
export interface PatternReading {
  readonly page: PatternPage;
  readonly search: string;
  /** How many curves the LIBRARY holds. Never the page's length — see {@link describePatterns}. */
  readonly total: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// The list
// ═══════════════════════════════════════════════════════════════════════════════

/** One curve on the list, worded. */
export interface PatternSummary {
  readonly recordId: string;
  readonly rev: number;
  readonly contentKey: string;
  readonly name: string;
  /** The curve spelled out. `intensity.ts`'s own wording, so the row and the button agree. */
  readonly curveWords: string;
  /** How many points it has, with the noun agreeing. */
  readonly length: string;
  /** What the mapping rule does, in his words. */
  readonly mapping: string;
  /** The pattern's own description, as whoever authored it wrote it. */
  readonly description: string;
  readonly provenance: string;
  readonly provenanceWord: string;
}

/** What the whole curve list says. */
export interface PatternReport {
  /** How many are being SHOWN. Every match when searching, one page when not. */
  readonly count: number;
  /** How many the LIBRARY holds. A different fact from {@link count}. */
  readonly total: number;
  readonly intro: string;
  readonly empty: boolean;
  readonly more: boolean;
  readonly moreWords: string | null;
  readonly items: readonly PatternSummary[];
}

/**
 * WHAT EACH MAPPING RULE DOES, in the coach's terms rather than the vocabulary's.
 *
 * A lookup FROM a value, which is the one direction that cannot invent a rule the model does not
 * have. A rule with no sentence falls back to the vocabulary's own word rather than being swallowed
 * — and `library-routines.test.ts` asserts every value in `MAPPING_RULES` has one, read off the
 * frozen vocabulary at run time, so a rule added to the model shows up as a red rather than as a
 * button explaining nothing.
 */
const MAPPING_WORDS: Readonly<Record<string, string>> = {
  stretch: 'Spread the curve evenly across however many exercises the routine holds.',
  'repeat-cycle': 'Repeat the curve over and over until the routine runs out of exercises.',
  // "for the rest of the routine" was the shipped wording and it is the one sentence on this screen
  // that could not survive it: `rest` is a FIELD on the routine editor beside this text (rest
  // seconds), so in its ordinary English sense it reads as the rest PERIOD and says the opposite of
  // what it means. Reworded to match the register of the two rules above it, which already say
  // "until the routine runs out of exercises" rather than naming a remainder.
  'hold-last': 'Run the curve once, then hold its last point for every exercise after that.',
};

export function mappingWords(rule: string): string {
  return MAPPING_WORDS[rule] ?? vocabularyWords(rule);
}

/** A count of points with its noun agreeing. Branched whole. */
export function pointCountWords(count: number): string {
  return count === 1 ? '1 point' : `${String(count)} points`;
}

/** One curve, worded. */
export function describePattern(record: PatternRecord): PatternSummary {
  const { content } = record;
  // THE BUTTON'S OWN WORDING, not a second one. See the header.
  const toggle = toggleFor({
    id: content.id,
    name: content.name,
    sequence: content.sequence ?? [],
    description: content.description,
  });

  return {
    recordId: record.record_id,
    rev: record.rev,
    contentKey: content.id,
    name: toggle.name,
    curveWords: toggle.curveWords,
    length: pointCountWords((content.sequence ?? []).length),
    mapping: mappingWords(content.mapping_rule),
    description: toggle.words,
    provenance: content.provenance,
    provenanceWord: provenanceWords(content.provenance),
  };
}

/** Everything the curve list says. */
export function describePatterns(reading: PatternReading): PatternReport {
  const items = reading.page.items.map(describePattern);
  const searching = reading.search.trim().length > 0;

  return {
    count: items.length,
    total: reading.total,
    intro: patternIntro(items.length, searching, reading.search.trim(), reading.total),
    empty: items.length === 0,
    more: !reading.page.done,
    moreWords: reading.page.done
      ? null
      : 'There are more curves than these, a page at a time.',
    items,
  };
}

/**
 * WHICH NUMBER GOES IN WHICH SENTENCE, and they are two different facts.
 *
 * `count` is how many are being SHOWN — every match when he is searching, one page when he is not.
 * `total` is how many the LIBRARY holds. The searching sentences take `count`, because "N curves
 * match" is a claim about the matches; the library sentences take `total`, because "N curves in your
 * library" is a claim about the library.
 *
 * PUTTING `count` IN THE LIBRARY SENTENCE IS THE ORIGINAL DEFECT, and putting `total` in the
 * matching sentence is the same defect inverted — it would answer one match with "100 curves match".
 * NEITHER SENTENCE BORROWS THE OTHER'S NUMBER, and while a search is active the library sentence is
 * not said at all.
 */
function patternIntro(count: number, searching: boolean, search: string, total: number): string {
  if (count === 0) {
    return searching
      ? `No curve matches "${search}". Clear the box to see all of them again.`
      : 'No curves in your library, so a session cannot be shaped to one. Add one, or restore the '
        + 'shipped set from Admin.';
  }

  // Branched whole, both halves. See the routine half for the defect this shape avoids: rendered,
  // a plural verb over a singular subject reads "1 curve match".
  if (searching) {
    return count === 1
      ? `1 curve matches "${search}".`
      : `${String(count)} curves match "${search}".`;
  }

  return total === 1
    ? '1 curve in your library. Yours to change or remove.'
    : `${String(total)} curves in your library. Every one yours to change or remove.`;
}

/** Which curves match what he typed: the name and the description. */
export function matchesPatternSearch(record: PatternRecord, search: string): boolean {
  const wanted = search.trim().toLowerCase();
  if (wanted.length === 0) return true;
  const { content } = record;
  return content.name.toLowerCase().includes(wanted)
    || content.description.toLowerCase().includes(wanted);
}

// ═══════════════════════════════════════════════════════════════════════════════
// The form
// ═══════════════════════════════════════════════════════════════════════════════

/** What the coach typed, before the record has seen it. */
export interface PatternDraft {
  readonly name: string;
  /** The curve, in order. Levels drawn from the model's own `INTENSITY_LEVELS`, never typed. */
  readonly sequence: readonly string[];
  readonly mappingRule: string;
  readonly description: string;
}

export function emptyPatternDraft(): PatternDraft {
  return Object.freeze({ name: '', sequence: [], mappingRule: '', description: '' });
}

/** The form filled in from a curve he is editing. It reads the record and nothing else. */
export function draftFromPattern(record: PatternRecord): PatternDraft {
  const { content } = record;
  return {
    name: content.name,
    sequence: [...(content.sequence ?? [])],
    mappingRule: content.mapping_rule,
    description: content.description,
  };
}

/** One more point on the end of the curve. */
export function addPoint(draft: PatternDraft, level: string): PatternDraft {
  return { ...draft, sequence: [...draft.sequence, level] };
}

/** One point taken out. */
export function removePoint(draft: PatternDraft, index: number): PatternDraft {
  if (index < 0 || index >= draft.sequence.length) return draft;
  return { ...draft, sequence: draft.sequence.filter((_held, at) => at !== index) };
}

/**
 * One point moved along the curve.
 *
 * Out-of-range moves return the draft UNCHANGED, for the same reason the routine's entries do: the
 * first point's "earlier" is a control the screen does not draw, and a wrap would silently send a
 * point to the far end of a curve he is looking at.
 */
export function movePoint(draft: PatternDraft, index: number, delta: number): PatternDraft {
  const target = index + delta;
  if (index < 0 || index >= draft.sequence.length) return draft;
  if (target < 0 || target >= draft.sequence.length) return draft;

  const sequence = [...draft.sequence];
  const [held] = sequence.splice(index, 1);
  sequence.splice(target, 0, held);
  return { ...draft, sequence };
}

/**
 * The content of a curve, from the draft and from the key it is replacing.
 *
 * NO PROVENANCE IS SET HERE — `library-patterns-source.ts` calls the core's `markEdited`.
 *
 * NOTHING IS VALIDATED HERE EITHER. The sequence goes to the record as it stands, including a curve
 * of one point or of none, and the record refuses it with its own sentence about how many points a
 * curve needs. A check here would be the copy that drifts.
 */
export function patternContent(
  draft: PatternDraft,
  existingKey: string | null,
): Record<string, unknown> {
  const name = draft.name.trim();
  return {
    // A CURVE KEEPS ITS KEY when he renames it: a proposal names the pattern by key, so re-deriving
    // it from a corrected spelling would break the identity of the curve he has been pressing.
    id: existingKey ?? patternKeyFor(name),
    name,
    sequence: [...draft.sequence],
    mapping_rule: draft.mappingRule,
    description: draft.description.trim(),
  };
}

/** The content key for a new curve, derived from his name rather than asked for. */
export function patternKeyFor(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

// ═══════════════════════════════════════════════════════════════════════════════
// The words on the form
// ═══════════════════════════════════════════════════════════════════════════════

export const PATTERN_FIELD_LABELS = Object.freeze({
  name: 'Name',
  sequence: 'The curve',
  mappingRule: 'How it spreads across a routine',
  description: 'What it is for',
});

export const ADD_PATTERN_TITLE = 'Add a curve';
export const EDIT_PATTERN_TITLE = 'Change this curve';
export const ADD_PATTERN_BUTTON = 'Add this curve';
export const SAVE_PATTERN_BUTTON = 'Save these changes';
export const CANCEL_PATTERN_BUTTON = 'Leave it as it was';

/** What a curve IS, said before he builds one. */
export const CURVE_HINT =
  'The shape of a session: which points come first, peak, and how it finishes. Two to eight '
  + 'points; a point may repeat.';

/**
 * WHERE THE WORK AND THE REST ACTUALLY COME FROM, said on the form where he would expect to set them.
 *
 * A curve names points and nothing else. What "harder" costs at each point is the exercise's own
 * three intensity points, and the rule that a harder one asks for more work and less rest is
 * enforced there. Saying it here is what stops him looking for numbers on this form and concluding
 * they were forgotten.
 *
 * THE CLAIM IS THE USER'S OWN AND IS NOT SOFTENED. What changed is the last sentence: telling him
 * the numbers belong "to each exercise" names an owner and not a DESTINATION, and a sentence that
 * names no place is one he has to go hunting from. The Exercises list and its three points — Low,
 * Medium and High — are on this same screen, so they are named as what they are called there. A
 * sentence naming a control that does not exist is the failure this is written against, so
 * `library-curve-contract.test.ts` reads the heading and the point legends off the screen's own
 * source rather than trusting these words.
 */
export const CURVE_HAS_NO_NUMBERS =
  'A curve carries no numbers of its own. Work and rest belong to the exercise: a harder point asks '
  + 'for more work and less rest, never more weight. Open one from the Exercises list and change '
  + 'its Low, Medium and High points.';

/**
 * `R11` IN HIS WORDS, at the point of entry rather than only when the record refuses him.
 *
 * The rule is the record's and is enforced there. Told beforehand, a refusal reads as a rule he had
 * been given; told only by the refusal, it reads as the app changing its mind about a name it just
 * accepted the parts of.
 */
export const NAME_MUST_MATCH_HINT =
  'A name that spells the curve out has to match it. A descriptive name, like Steady Build, is '
  + 'yours to choose freely.';

/** The curve as he is building it, spelled out. `intensity.ts`'s separator, never a second one. */
export function draftCurveWords(sequence: readonly string[]): string {
  if (sequence.length === 0) return 'No points yet. Add at least two.';
  return toggleFor({ id: 'draft', name: 'draft', sequence }).curveWords;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Refusals
// ═══════════════════════════════════════════════════════════════════════════════

/** A field's label from the path the record named it by. Anything unknown is carried through IN FULL. */
export function patternFieldLabel(path: string): string {
  const field = path.startsWith(CONTENT_PREFIX) ? path.slice(CONTENT_PREFIX.length) : path;
  const [head, ...rest] = field.split('.');
  const tail = rest.length > 0 ? ` (${rest.join(' ')})` : '';

  switch (head) {
    case 'name': return PATTERN_FIELD_LABELS.name;
    case 'sequence': return `${PATTERN_FIELD_LABELS.sequence}${tail}`;
    case 'mapping_rule': return PATTERN_FIELD_LABELS.mappingRule;
    case 'description': return PATTERN_FIELD_LABELS.description;
    case 'id': return 'Name (the app makes a key out of it)';
    case 'provenance': return 'Where this curve came from (this is the app\'s own record)';
    default: return path;
  }
}

/** Why a curve could not be saved, in the record's own words. */
export function describePatternRefusal(error: unknown): RefusalReport {
  return describeRefusal(error, 'curve', patternFieldLabel);
}

/** What the screen says once a curve HAS been saved. */
export function patternSavedWords(name: string, added: boolean): string {
  return added
    ? `${name} is in your library and saved on this device.`
    : `Your changes to ${name} are saved on this device.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Deleting
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * WHAT DELETING A CURVE ASKS HIM.
 *
 * NOTHING STORED POINTS AT A PATTERN, and that is a measured fact rather than an assumption: the
 * enforced directions are listed in `core/model/referential.js`'s own `REFERENTIAL_DIRECTION`, and
 * no record kind names a pattern — a proposal carries `pattern_id` but a proposal is transient and
 * never reaches the store. So removing a curve leaves no record pointing at nothing, and there is no
 * reference guard to draw. `library-routines.test.ts` asserts that off `REFERENTIAL_DIRECTION` at run
 * time rather than trusting this comment, so a kind that starts naming a pattern turns it red.
 *
 * That does NOT make removing one harmless, and the sentence says what it actually costs: this is a
 * button he presses mid-session, and taking the last one away leaves him with no shape to press at
 * all. Both are named as destruction rather than as a reset he could undo it with.
 */
export interface PatternRemoval {
  readonly title: string;
  readonly allowed: boolean;
  readonly whatWillHappen: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

/**
 * @param remaining how many curves would be left afterwards, counted off the store rather than off
 * the page on screen — a page-deep count would say "this is your last one" about a library with
 * thirty more in it.
 */
export function describePatternRemoval(
  pattern: PatternSummary,
  remaining: number,
): PatternRemoval {
  const last = remaining <= 0
    ? ' It is the only curve you have left; removing it leaves no shape to press until you add one '
      + 'or restore the shipped set from Admin.'
    : '';

  return {
    title: `Remove ${pattern.name}?`,
    allowed: true,
    whatWillHappen: (pattern.provenance === 'coach-created'
      ? `${pattern.name} is yours, so nothing will bring it back. It stops being a shape you can `
        + 'press during a session.'
      : `${pattern.name} came with the app. Removing it destroys it here; restoring the shipped `
        + 'library from Admin also takes back every other shipped exercise, routine and curve you '
        + 'have changed since. It stops being a shape you can press during a session.')
      + ' Sessions you have already run are not touched.'
      + last,
    confirmLabel: `Remove ${pattern.name}`,
    cancelLabel: 'Keep it',
  };
}

/** What the screen says once a curve is gone. */
export function patternRemovedWords(name: string): string {
  return `${name} is no longer a shape you can press during a session on this device.`;
}
