/**
 * WHAT THE DIET EDITOR DECIDES — the whole derivation, and none of the drawing.
 *
 * `DietScreen.tsx` reads a plan. This is the other half: what the coach TYPES, and every judgement
 * about it, in a plain module a test can assert with no browser and no rendering at all.
 * `DietEditor.tsx` beside it draws the result and holds no decisions — the split `clients.ts` and
 * `ClientsScreen.tsx` state as the pattern to copy, for the reason written in their header: a static
 * render never runs an effect, so logic living inside a component is logic nothing checks.
 *
 * ## THE ONE IDEA THIS FILE IS BUILT ON: A MEAL CARRIES ITS DAYS, RATHER THAN A DAY CARRYING MEALS
 *
 * The record stores `days: [{day, entries}]` — seven separate lists. An editor shaped like the
 * record makes the coach type the same breakfast six times, and the step's own words are that the
 * editor must make the REPEATING weekly structure CHEAP TO EXPRESS. Real plans repeat heavily: one
 * breakfast most days, a snack that only changes at the weekend.
 *
 * So the thing he edits is a **meal** — a time, a slot name, the food, and THE SET OF DAYS IT APPLIES
 * TO. That single inversion is what removes the retyping, and it removes it STRUCTURALLY rather than
 * as a feature bolted on top:
 *
 * | The move the step asks for | What it is here |
 * |---|---|
 * | apply an entry across a chosen set of days | ticking days on the meal he already typed |
 * | edit a repeated entry in one place | editing the meal — every day carrying it changes with it |
 * | copy a day onto other days | {@link copyDayOnto}, the one move the shape does not give for free |
 *
 * There is deliberately NO general-purpose grid application here. Three moves, and no more.
 *
 * ## THE RECORD IS STILL THE RECORD, AND THE ROUND TRIP IS EXACT
 *
 * {@link draftFromPlan} and {@link planContentFromDraft} are inverses, and a suite drives a plan
 * through both and compares. Two identical meals on ONE day survive as two, which is the case a
 * careless grouping loses: it is handled by MULTIPLICITY — the second occurrence forms its own meal
 * — rather than by de-duplicating and hoping nobody notices.
 *
 * **ONE NORMALISATION IS APPLIED AND IT IS SAID OUT LOUD**: a day's entries are written in TIME
 * order, through `compareTimes` in `core/diet/week.js`. Nothing is added, dropped or altered; only
 * the order within a day can change, and only for a stored plan whose entries were not in time order
 * to begin with — which the chart already drew in time order anyway. Sorting by string would put
 * nine o'clock after ten, and the wrong answer looks merely plausible.
 *
 * ## NO LIST OF DAY NAMES IS WRITTEN HERE
 *
 * The day pickers, the column headings and every sentence naming a day read `WEEKDAYS` from
 * `core/diet/week.js` — the one module that says what a day NUMBER means (ISO-8601, 1 is Monday).
 * The importer resolves a pasted day name through that same table. Two tables is how the coach
 * imports into Tuesday and edits it under Wednesday with nothing erroring anywhere, and this build
 * has already shipped that shape once with a pair of constants. `diet-guard.test.ts` is the check
 * that keeps it true rather than the promise that it is.
 *
 * ## AND NO MODEL RULE IS RESTATED
 *
 * `core/model/entities/diet-plan.js` owns the field lengths, the day range, the time pattern and the
 * item bounds. NOTHING here validates in front of the write: the draft is offered to the store and
 * the record answers. {@link describePlanRefusal} carries the record's OWN sentence through
 * UNCHANGED and puts a label the coach can read in front of it — a second copy of a rule is a copy
 * that drifts, and a reworded refusal is a sentence the record never agreed to.
 *
 * ## DIET IS PLAINTEXT
 *
 * No passphrase, no gate, no sensitivity marking, and nothing on this path reaches for the crypto
 * module. A diet plan is a food chart. There is nothing in this file to switch on later.
 */

import { WEEKDAYS, compareTimes } from '../../core/diet/diet.js';
import { daysOf, entriesOf, itemsOf, planContentOf } from '../../core/diet/plan.js';
import { verbatimOf } from './clients';

// ═══════════════════════════════════════════════════════════════════════════════
// What he is editing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ONE MEAL, AND THE DAYS IT IS EATEN ON.
 *
 * `items` is the food AS HE TYPES IT, one per line, and it stays a single string until the moment
 * the draft becomes a record. A list of boxes he has to add and remove is the thing that makes an
 * editor feel like data entry; a textarea is the thing his wife's plan already looks like.
 */
export interface MealDraft {
  /**
   * A handle for this row while it is on screen. It is NEVER stored: the record's entry has no
   * identity of its own, and inventing one that survived a save would be a field the record refuses.
   */
  readonly id: string;
  /** The 24-hour time, as typed. The record judges whether it is one. */
  readonly time: string;
  /** What he calls this slot — "Breakfast", "Pre-workout". Optional to the record and to him. */
  readonly label: string;
  /** The food, one per line as typed. Blank lines are his spacing and are dropped on the way in. */
  readonly items: string;
  /** Anything he wants to say about this meal. */
  readonly notes: string;
  /** The days this meal is eaten on, ascending. Empty is allowed while he is still ticking. */
  readonly days: readonly number[];
}

/** A whole plan, as he is editing it. */
export interface PlanDraft {
  /** What the plan is called. The record requires one and refuses an empty one in its own words. */
  readonly name: string;
  /** Who wrote the plan he is transcribing — the nutritionist, in his words. */
  readonly sourceNote: string;
  /** Anything about the plan as a whole. */
  readonly notes: string;
  /** The meals, in the order they are drawn. */
  readonly meals: readonly MealDraft[];
}

/** The blank draft. One value, so a new plan does not start from a literal written in a component. */
export const EMPTY_DRAFT: PlanDraft = Object.freeze({
  name: '',
  sourceNote: '',
  notes: '',
  meals: Object.freeze([]) as readonly MealDraft[],
});

// ═══════════════════════════════════════════════════════════════════════════════
// The record, in and out
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A STORED PLAN AS SOMETHING HE CAN EDIT.
 *
 * Entries that say exactly the same thing on several days become ONE meal carrying those days —
 * which is what makes "edit it in one place" work on a plan he imported rather than only on one he
 * typed here. Sameness is the whole entry: time, label, food and notes. A Saturday snack that
 * differs by one word stays its own meal, which is right, because it IS a different meal.
 *
 * TWO IDENTICAL ENTRIES ON ONE DAY STAY TWO. The second occurrence on a day joins the SECOND meal
 * with that signature rather than being folded into the first, so a save gives the record back
 * exactly what it held. Collapsing them would be a silent edit to a client's plan.
 */
export function draftFromPlan(record: unknown): PlanDraft {
  const content = planContentOf(record);

  /** Every meal built so far for one signature, in occurrence order. */
  const bySignature = new Map<string, MealDraft[]>();
  const meals: MealDraft[] = [];

  for (const day of daysOf(content)) {
    const dayNumber = day.day as number;
    /** How many entries on THIS day have carried each signature already. */
    const seenHere = new Map<string, number>();

    for (const entry of entriesOf(day)) {
      const meal = {
        time: asText(entry.time),
        label: asText(entry.label),
        items: itemsOf(entry).join('\n'),
        notes: asText(entry.notes),
      };
      const signature = signatureOf(meal);

      const occurrence = seenHere.get(signature) ?? 0;
      seenHere.set(signature, occurrence + 1);

      const group = bySignature.get(signature) ?? [];
      bySignature.set(signature, group);

      if (group[occurrence] === undefined) {
        const made: MealDraft = { id: `meal-${String(meals.length + 1)}`, ...meal, days: [] };
        group[occurrence] = made;
        meals.push(made);
      }

      const at = meals.indexOf(group[occurrence]);
      const held = meals[at];
      const grown: MealDraft = { ...held, days: withDay(held.days, dayNumber) };
      meals[at] = grown;
      group[occurrence] = grown;
    }
  }

  return {
    name: asText(content.name),
    sourceNote: asText(content.source_note),
    notes: asText(content.notes),
    meals: orderMeals(meals),
  };
}

/**
 * THE DRAFT AS THE RECORD WANTS IT — offered, never checked.
 *
 * A meal ticked for no day at all reaches no day, and a meal with nothing written in it reaches
 * nothing: both are the ordinary state of a row he has started and not finished, and neither is an
 * error this file is entitled to raise. What is NOT dropped is a half-finished meal on a day he DID
 * tick — a time with no food, or food with no time — because that is the record's judgement and the
 * record's sentence is the one he should read.
 *
 * `effective_from` and `effective_to` are deliberately absent. The record's own header says the
 * current plan is a fact the coach SETS and never an arithmetic result that changes at midnight, so
 * this editor writes no date and reads none.
 */
export function planContentFromDraft(
  draft: PlanDraft,
  { clientId, status }: { clientId: string; status: string },
): Record<string, unknown> {
  const days: { day: number; entries: Record<string, unknown>[] }[] = [];
  const ordered = orderMeals(draft.meals);

  for (const weekday of WEEKDAYS) {
    const entries: Record<string, unknown>[] = [];

    for (const meal of ordered) {
      if (!meal.days.includes(weekday.day)) continue;
      if (isBlankMeal(meal)) continue;
      entries.push(entryFromMeal(meal));
    }

    if (entries.length > 0) days.push({ day: weekday.day, entries });
  }

  const content: Record<string, unknown> = {
    client_id: clientId,
    name: draft.name.trim(),
    status,
    days,
  };

  // AN EMPTY STRING AND AN ABSENT FIELD ARE DIFFERENT THINGS TO THE RECORD. Both optional fields are
  // omitted rather than written empty, so a plan he said nothing about does not record that he did.
  const notes = draft.notes.trim();
  if (notes.length > 0) content.notes = notes;
  const sourceNote = draft.sourceNote.trim();
  if (sourceNote.length > 0) content.source_note = sourceNote;

  return content;
}

/** One meal as the record's entry. The optional fields are omitted rather than written empty. */
function entryFromMeal(meal: MealDraft): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    time: meal.time.trim(),
    items: foodLines(meal.items),
  };
  const label = meal.label.trim();
  if (label.length > 0) entry.label = label;
  const notes = meal.notes.trim();
  if (notes.length > 0) entry.notes = notes;
  return entry;
}

/**
 * The food he typed as the record's list.
 *
 * A blank line is HIS SPACING and is not a food; everything else is carried whole, including a line
 * longer than the record allows. Truncating here would quietly change what the nutritionist wrote —
 * the record says how long a food may be, and the record is the one that should refuse it.
 */
export function foodLines(items: string): string[] {
  return items.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// The three moves
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A new, empty meal at the end, ticked for the days given.
 *
 * Every move returns a NEW draft rather than editing one in place: the screen holds the draft in
 * state, and a mutation React never saw is an edit that appears one keystroke late.
 */
export function addMeal(draft: PlanDraft, days: readonly number[] = []): PlanDraft {
  const meal: MealDraft = {
    id: nextMealId(draft),
    time: '',
    label: '',
    items: '',
    notes: '',
    days: sortedDays(days),
  };
  return { ...draft, meals: [...draft.meals, meal] };
}

/**
 * EDIT A REPEATED MEAL IN ONE PLACE — which is simply editing the meal.
 *
 * The meal is one object however many days carry it, so there is no fan-out to write and none to get
 * wrong. That is the whole reason a meal carries its days rather than the other way round.
 */
export function updateMeal(
  draft: PlanDraft,
  id: string,
  patch: Partial<Omit<MealDraft, 'id'>>,
): PlanDraft {
  return {
    ...draft,
    meals: draft.meals.map((meal) => (meal.id === id
      ? { ...meal, ...patch, days: patch.days === undefined ? meal.days : sortedDays(patch.days) }
      : meal)),
  };
}

/** Take a meal off the plan entirely. */
export function removeMeal(draft: PlanDraft, id: string): PlanDraft {
  return { ...draft, meals: draft.meals.filter((meal) => meal.id !== id) };
}

/** One day on or off one meal — the tick in the grid. */
export function toggleMealDay(draft: PlanDraft, id: string, day: number): PlanDraft {
  const meal = draft.meals.find((candidate) => candidate.id === id);
  if (meal === undefined) return draft;

  const days = meal.days.includes(day)
    ? meal.days.filter((held) => held !== day)
    : withDay(meal.days, day);

  return updateMeal(draft, id, { days });
}

/**
 * APPLY THIS MEAL ACROSS A CHOSEN SET OF DAYS — the second of the three moves.
 *
 * It SETS the days rather than adding to them, because that is what the control says: he has chosen
 * the days this meal is eaten on. Adding would make "every day except Sunday" impossible to express
 * by any sequence of presses, which is precisely the plan shape the coach has.
 */
export function applyMealAcross(draft: PlanDraft, id: string, days: readonly number[]): PlanDraft {
  return updateMeal(draft, id, { days: sortedDays(days) });
}

/**
 * COPY A DAY ONTO OTHER DAYS — the one move the meal-carries-its-days shape does not give for free.
 *
 * Afterwards each target day holds EXACTLY what the source day holds: meals on the source gain the
 * targets, and meals NOT on the source lose them. Anything less is not a copy — it is a merge, and a
 * merge would leave Tuesday's old lunch sitting under Monday's new one with nothing to show that the
 * copy had not taken.
 *
 * **IT IS DESTRUCTIVE AND THE SCREEN SAYS SO FIRST**: {@link describeCopyDay} words what will be
 * replaced, in his own terms, BEFORE he presses it.
 */
export function copyDayOnto(
  draft: PlanDraft,
  from: number,
  targets: readonly number[],
): PlanDraft {
  const onto = sortedDays(targets).filter((day) => day !== from);
  if (onto.length === 0) return draft;

  return {
    ...draft,
    meals: draft.meals.map((meal) => {
      const source = meal.days.includes(from);
      const days = source
        ? sortedDays([...meal.days, ...onto])
        : meal.days.filter((day) => !onto.includes(day));
      return { ...meal, days };
    }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// What the editor says
// ═══════════════════════════════════════════════════════════════════════════════

/** The heading over the whole surface, for a new plan and for one he is amending. */
export const NEW_PLAN_TITLE = 'Write a new plan';
export const AMEND_PLAN_TITLE = 'Change this plan';

/**
 * WHAT THE EDITOR IS FOR, SAID ONCE AT THE TOP.
 *
 * It names the repetition move rather than leaving him to discover it, because an editor whose whole
 * point is that he does not have to retype Monday six times has failed if he retypes it anyway.
 */
export const EDITOR_INTRO = 'Write each meal once and tick the days it is eaten on.';

/** Said above the import control, because pasting is the path he should be on. */
export const PREFER_PASTING = 'Prefer pasting if you have the plan in writing.';

/** What the day grid announces to a screen reader, since a grid of ticks says nothing on its own. */
export const DAY_GRID_LABEL = 'The days each meal is eaten on';

/** The words on the control that adds a row. */
export const ADD_MEAL = 'Add a meal';

/** The words on the save control, for each of the two cases. */
export const SAVE_NEW_PLAN = 'Save this plan';
export const SAVE_CHANGES = 'Save these changes';

/** A plan a client actually follows, versus one still being written. */
export const MAKE_CURRENT = 'Make this the plan they follow now';

/**
 * WHAT MAKING A PLAN CURRENT ACTUALLY DOES, said before he does it.
 *
 * The history is the whole point of the repository, so the sentence says plainly that the earlier
 * plan is KEPT — a coach who thinks "current" overwrites will not press it, and a coach who thinks
 * it deletes will not either.
 */
export const MAKE_CURRENT_WORDS =
  'The plan they follow now becomes an earlier plan and stays on their history. Nothing is deleted, '
  + 'and only one plan is ever the current one.';

/** One meal as the editor draws it. */
export interface MealRow {
  readonly id: string;
  readonly time: string;
  readonly label: string;
  readonly items: string;
  readonly notes: string;
  /** Which days are ticked, as a lookup the drawing can ask per column without a search. */
  readonly onDay: (day: number) => boolean;
  /** How many days carry it, so a repeated meal can say so rather than being counted by eye. */
  readonly dayCount: number;
  /** Said on a repeated meal: editing it changes every day at once, and he should know before he does. */
  readonly repeatedWords: string | null;
  /** True while nothing has been typed into it — a row he has started, never an error. */
  readonly blank: boolean;
}

/** Everything the editor says. */
export interface EditorReport {
  readonly title: string;
  readonly intro: string;
  readonly days: typeof WEEKDAYS;
  readonly rows: readonly MealRow[];
  /** Said when there is not a single meal yet. */
  readonly emptyWords: string | null;
  /** What this plan covers, in one line, so he can check it against the paper in front of him. */
  readonly coverWords: string;
  /** The days he has written nothing for, named. Null when the plan covers the whole week. */
  readonly untouchedWords: string | null;
  /** Meals that are written but ticked for no day, named. They reach no day and he should know. */
  readonly unplacedWords: string | null;
  /** The words on the save control. */
  readonly saveWords: string;
}

/** Everything the editor says, from the draft. */
export function describeEditor(draft: PlanDraft, { amending }: { amending: boolean }): EditorReport {
  const rows = orderMeals(draft.meals).map((meal) => mealRow(meal));

  const written = draft.meals.filter((meal) => !isBlankMeal(meal));
  const placed = written.filter((meal) => meal.days.length > 0);
  const unplaced = written.filter((meal) => meal.days.length === 0);

  const covered = new Set<number>();
  for (const meal of placed) for (const day of meal.days) covered.add(day);
  const untouched = WEEKDAYS.filter((weekday) => !covered.has(weekday.day));

  return {
    title: amending ? AMEND_PLAN_TITLE : NEW_PLAN_TITLE,
    intro: EDITOR_INTRO,
    days: WEEKDAYS,
    rows,
    emptyWords: draft.meals.length === 0 ? NOTHING_WRITTEN_YET : null,
    coverWords: coverWords(covered.size, placed.length),
    untouchedWords: untouchedWords(untouched, covered.size),
    unplacedWords: unplacedWords(unplaced),
    saveWords: amending ? SAVE_CHANGES : SAVE_NEW_PLAN,
  };
}

/** Said on an editor with no rows at all. It names the first move rather than describing a void. */
export const NOTHING_WRITTEN_YET = 'Nothing is written yet. Add a meal to start.';

/** One row of the grid. */
function mealRow(meal: MealDraft): MealRow {
  const days = new Set(meal.days);
  return {
    id: meal.id,
    time: meal.time,
    label: meal.label,
    items: meal.items,
    notes: meal.notes,
    onDay: (day: number) => days.has(day),
    dayCount: meal.days.length,
    repeatedWords: meal.days.length > 1
      ? `Eaten on ${String(meal.days.length)} days — editing it changes all of them.`
      : null,
    blank: isBlankMeal(meal),
  };
}

/** What the plan covers, in one line he can check against the paper. */
function coverWords(dayCount: number, mealCount: number): string {
  if (mealCount === 0) return 'Nothing is on this plan yet.';
  return `${countWords(dayCount, 'day')} and ${countWords(mealCount, 'meal')} on this plan.`;
}

/**
 * THE DAYS THE PLAN IS SILENT ABOUT, NAMED — the same honesty the read screen already keeps.
 *
 * A plan is allowed to cover part of the week and the record accepts one. What it must not do is
 * leave him to notice: an absent day reads as a fast day just as easily as it reads as "the plan
 * does not say", and only one of those is true.
 */
function untouchedWords(
  untouched: readonly { name: string }[],
  coveredCount: number,
): string | null {
  if (untouched.length === 0 || coveredCount === 0) return null;
  return `Nothing is written for ${listWords(untouched.map((day) => day.name))} — the plan does `
    + 'not say, not that nothing is eaten.';
}

/**
 * MEALS WRITTEN AND TICKED FOR NO DAY — the one way this editor could drop food silently.
 *
 * They are not saved, because a meal on no day belongs to no day. So they are NAMED, for the same
 * reason the importer quotes back a line it could not place: what he typed and cannot find later is
 * how a client's plan is lost with nobody noticing.
 */
function unplacedWords(unplaced: readonly MealDraft[]): string | null {
  if (unplaced.length === 0) return null;
  const named = listWords(unplaced.map((meal) => quotedMeal(meal)));
  return `${named} ${unplaced.length === 1 ? 'is' : 'are'} ticked for no day and will not be saved.`;
}

/** A meal named the way he would name it: by its time, or by its slot, or by its first food. */
function quotedMeal(meal: MealDraft): string {
  const time = meal.time.trim();
  const label = meal.label.trim();
  if (time.length > 0 && label.length > 0) return `"${time} ${label}"`;
  if (time.length > 0) return `"${time}"`;
  if (label.length > 0) return `"${label}"`;
  const first = foodLines(meal.items)[0];
  return first === undefined ? 'a meal' : `"${first}"`;
}

/**
 * WHAT COPYING A DAY WILL DO, BEFORE HE DOES IT.
 *
 * The move REPLACES what is on the target days, and a control that silently replaced a day he had
 * already written would be the editor losing his work at the moment he was trying to save it. So the
 * sentence names the source, the targets, and what happens to what is already there.
 */
export function describeCopyDay(
  draft: PlanDraft,
  from: number,
  targets: readonly number[],
): string | null {
  const onto = sortedDays(targets).filter((day) => day !== from);
  if (onto.length === 0) return null;

  const source = nameOfDay(from);
  const named = listWords(onto.map((day) => nameOfDay(day)));
  const replacing = onto.filter((day) => draft.meals.some(
    (meal) => meal.days.includes(day) && !isBlankMeal(meal) && !meal.days.includes(from),
  ));

  const head = `${source} will be copied onto ${named}.`;
  if (replacing.length === 0) return head;

  return `${head} What is already written for ${listWords(replacing.map((day) => nameOfDay(day)))} `
    + 'will be replaced.';
}

/** A day's name, from the one table. Never from a list written here. */
export function nameOfDay(day: number): string {
  const weekday = WEEKDAYS.find((candidate) => candidate.day === day);
  return weekday === undefined ? `Day ${String(day)}` : weekday.name;
}

// ═══════════════════════════════════════════════════════════════════════════════
// What happened when he saved
// ═══════════════════════════════════════════════════════════════════════════════

/** Said once, after a plan has genuinely committed. It never claims more than that. */
export function savedPlanWords(name: string): string {
  const named = name.trim().length > 0 ? `"${name.trim()}"` : 'That plan';
  return `${named} is saved on this device.`;
}

/**
 * WHAT MAKING A PLAN CURRENT ACTUALLY DID — reported, because it can go wrong halfway.
 *
 * Declared here rather than beside the write in `diet-editor-source.ts` so that the words and the
 * shape they describe are written together: a result whose sentence lives in another file is a
 * result whose sentence stops matching it.
 */
export interface MadeCurrent {
  /** The plan that is now current, or null when the promotion did not land. */
  readonly promoted: string | null;
  /** The plans that stopped being current in the same act. They are PAST, never deleted. */
  readonly demoted: readonly string[];
  /**
   * How many claimants could not be written to because they have no identity to write to.
   *
   * Almost always zero. It is carried rather than dropped because the alternative is a plan that is
   * still marked current with nothing anywhere saying so — the invisible two-current state, which
   * the limit-one read would then resolve by silently picking one.
   */
  readonly unaddressable: number;
  /** True when the demotions landed and the promotion did not, leaving NO current plan. */
  readonly leftWithNoCurrent: boolean;
}

/**
 * What making a plan current did, in his words — INCLUDING what happened to the earlier plan.
 *
 * The demotion is named rather than left silent. A coach who presses this and is told only that the
 * new plan is current has been given no reason to believe the old one still exists, and the history
 * is the whole point of keeping one.
 */
export function madeCurrentWords(result: MadeCurrent): string {
  const named = result.promoted === null ? 'That plan' : `"${result.promoted}"`;

  const head = result.demoted.length === 0
    ? `${named} is the plan they follow now.`
    : `${named} is the plan they follow now. `
      + `${listWords(result.demoted.map((name) => `"${name}"`))} `
      + `${result.demoted.length === 1 ? 'is' : 'are'} now an earlier plan and still on their `
      + 'history.';

  // NEVER LEFT SILENT. A claimant this could not write to is still marked current, and a coach who
  // is not told will be shown one of two plans by a read that picks whichever it reaches first.
  if (result.unaddressable === 0) return head;
  return `${head} ${String(result.unaddressable)} other `
    + `${result.unaddressable === 1 ? 'plan is' : 'plans are'} still marked current and could not be `
    + 'changed, because there is no saved plan to change. Their diet will say so.';
}

/**
 * THE HALFWAY FAILURE, SAID PLAINLY.
 *
 * The earlier plan was demoted and the new one was not promoted, so nobody is following anything.
 * Nothing is lost and pressing the control again finishes the job — but he is TOLD, because a client
 * with no current plan is a state he would otherwise discover by opening their diet and finding no
 * chart.
 */
export function leftWithNoCurrentWords(demoted: readonly string[]): string {
  const earlier = demoted.length === 0
    ? 'The earlier plan'
    : listWords(demoted.map((name) => `"${name}"`));
  return `${earlier} ${demoted.length === 1 || demoted.length === 0 ? 'is' : 'are'} now an earlier `
    + 'plan, but the new plan could not be made current, so nothing is marked as the plan they '
    + 'follow now. Nothing was deleted. Press it again to finish.';
}

// ═══════════════════════════════════════════════════════════════════════════════
// When the record refuses
// ═══════════════════════════════════════════════════════════════════════════════

/** One refused field, labelled and carrying the record's own sentence. */
export interface RefusedField {
  readonly label: string;
  readonly path: string;
  readonly code: string;
  /** The record's own words. Never reworded here. */
  readonly message: string;
}

/** Why a plan could not be saved. */
export interface PlanRefusal {
  readonly headline: string;
  readonly fields: readonly RefusedField[];
  /** The failure's own text when it carried no issues — a store that would not open, say. */
  readonly verbatim: string | null;
}

/**
 * WHY A PLAN COULD NOT BE SAVED, IN THE RECORD'S WORDS.
 *
 * Every sentence the coach reads here was written by `core/model/entities/diet-plan.js` and is
 * passed through untouched. This function adds a LABEL and an ORDER and takes nothing away. There is
 * no length check, no time check and no day check anywhere in this direction: a second copy of a
 * rule is a copy that drifts, and the drift is silent — the screen would refuse something the record
 * allows, or allow something it refuses.
 *
 * The plan CONTENT is taken so a machine's path can be turned into a place he recognises:
 * `days[2].entries[0].items[3]` is meaningless, and "Wednesday, the meal at 08:00" is where he was
 * typing. The content is read for its day numbers and times only — never for judgement.
 */
export function describePlanRefusal(error: unknown, content?: Record<string, unknown>): PlanRefusal {
  const issues = issuesOf(error);

  if (issues === null) {
    return {
      headline: 'That plan could not be saved on this device',
      fields: [],
      verbatim: verbatimOf(error),
    };
  }

  return {
    headline: issues.length === 1
      ? 'That plan was not saved, and this is why'
      : 'That plan was not saved, and these are the reasons',
    fields: issues.map((issue) => ({
      label: planFieldLabel(issue.path, content),
      path: issue.path,
      code: issue.code,
      message: issue.message,
    })),
    verbatim: null,
  };
}

/** Issues arrive on a `StoreValidationError` under a `content.` prefix, as the envelope nests them. */
const CONTENT_PREFIX = 'content.';

/**
 * A refused path as a place he recognises.
 *
 * A path this has no word for is shown AS THE RECORD NAMED IT, in full, rather than swallowed: an
 * issue with no label is a refusal he can see the effect of and not the cause, and the whole path is
 * at least something he can read out to somebody.
 */
export function planFieldLabel(path: string, content?: Record<string, unknown>): string {
  const field = path.startsWith(CONTENT_PREFIX) ? path.slice(CONTENT_PREFIX.length) : path;

  switch (field) {
    case 'name': return 'Plan name';
    case 'notes': return 'Notes on the plan';
    case 'source_note': return 'Who wrote this plan';
    case 'status': return 'Whether they follow this plan now';
    case 'client_id': return 'Whose plan this is';
    case 'days': return 'The week';
    case 'effective_from':
    case 'effective_to': return 'When this plan applies';
    default: return withinTheWeek(field, content) ?? path;
  }
}

/**
 * A path INSIDE the week, as the day and the meal he was typing in.
 *
 * Read by walking the path rather than by matching a pattern: this application's shipped source is
 * kept free of regular expressions by a recorded decision, and the shape here is `days[i]` followed
 * by `entries[j]` followed by a field.
 */
function withinTheWeek(field: string, content?: Record<string, unknown>): string | null {
  const parts = field.split('.');
  const dayAt = indexIn(parts[0] ?? '', 'days');
  if (dayAt === null) return null;

  const day = Array.isArray(content?.days) ? (content?.days as Record<string, unknown>[])[dayAt] : undefined;
  const dayName = typeof day?.day === 'number' ? nameOfDay(day.day) : `Day ${String(dayAt + 1)}`;
  if (parts.length === 1) return dayName;

  const entryAt = indexIn(parts[1] ?? '', 'entries');
  if (entryAt === null) return dayName;

  const entries = Array.isArray(day?.entries) ? (day?.entries as Record<string, unknown>[]) : [];
  const time = typeof entries[entryAt]?.time === 'string' ? String(entries[entryAt].time) : '';
  const meal = time.length > 0 ? `the meal at ${time}` : `meal ${String(entryAt + 1)}`;

  const rest = parts.slice(2).join('.');
  const what = rest.length === 0 ? '' : `, ${mealFieldWord(rest)}`;
  return `${dayName}, ${meal}${what}`;
}

/** The word for a field inside one meal. An unknown one is shown as the record wrote it. */
function mealFieldWord(rest: string): string {
  if (rest === 'time') return 'the time';
  if (rest === 'label') return 'the slot name';
  if (rest === 'notes') return 'the notes';
  if (rest === 'items' || indexIn(rest, 'items') !== null) return 'the food';
  return rest;
}

/** The index in `name[7]`, or null when the text is not that shape or names a different field. */
function indexIn(text: string, name: string): number | null {
  if (!text.startsWith(`${name}[`) || !text.endsWith(']')) return null;
  const inside = text.slice(name.length + 1, -1);
  if (inside.length === 0) return null;
  let value = 0;
  for (const character of inside) {
    const digit = '0123456789'.indexOf(character);
    if (digit === -1) return null;
    value = (value * 10) + digit;
  }
  return value;
}

/** A validation issue as `core/model/issues.js` shapes it, and as `StoreValidationError` carries it. */
interface Issue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

/** Whether a thrown thing is a refusal carrying the record's own issues. */
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

// ═══════════════════════════════════════════════════════════════════════════════
// Small shared things
// ═══════════════════════════════════════════════════════════════════════════════

/** A field off a record as text, whatever it actually held. */
function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** True when nothing has been typed into a meal. */
export function isBlankMeal(meal: MealDraft): boolean {
  return meal.time.trim().length === 0
    && meal.label.trim().length === 0
    && meal.notes.trim().length === 0
    && foodLines(meal.items).length === 0;
}

/** What makes two entries the same meal: everything the record stores about one. */
function signatureOf(meal: { time: string; label: string; items: string; notes: string }): string {
  return JSON.stringify([meal.time, meal.label, meal.items, meal.notes]);
}

/** Days ascending and without repeats. */
function sortedDays(days: readonly number[]): number[] {
  return [...new Set(days)].sort((a, b) => a - b);
}

/** One more day on a set, still ascending. */
function withDay(days: readonly number[], day: number): number[] {
  return sortedDays([...days, day]);
}

/**
 * Meals in the order they are drawn: BY TIME, through the shared comparison.
 *
 * `compareTimes` orders nine o'clock before ten; a string comparison orders it after, and the wrong
 * answer looks merely plausible. It is used WHOLE rather than reasoned around: it already sorts a
 * time it cannot read after every time it can, which is exactly where a row he has just added and
 * not yet timed belongs. Ties keep the order he wrote them in, which is what makes a second
 * breakfast stay under the first.
 */
function orderMeals(meals: readonly MealDraft[]): MealDraft[] {
  return meals
    .map((meal, at) => ({ meal, at }))
    .sort((a, b) => {
      const byTime = compareTimes(a.meal.time.trim(), b.meal.time.trim());
      return byTime === 0 ? a.at - b.at : byTime;
    })
    .map(({ meal }) => meal);
}

/** The next unused row handle. Never stored — see {@link MealDraft.id}. */
function nextMealId(draft: PlanDraft): string {
  let at = draft.meals.length + 1;
  const held = new Set(draft.meals.map((meal) => meal.id));
  while (held.has(`meal-${String(at)}`)) at += 1;
  return `meal-${String(at)}`;
}

/** "3 days" and "1 day", so a sentence does not read as a machine wrote it. */
function countWords(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

/** Names in a list, joined the way a person writes them. */
export function listWords(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

