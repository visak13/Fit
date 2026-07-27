/**
 * WHAT THE DIET SCREEN SAYS — the whole derivation, and none of the drawing.
 *
 * The diet screen is what the coach opens to see what a client is eating: the plan they follow NOW
 * as a week chart, and the plans they followed BEFORE. Every judgement about it is decided here, in
 * a plain module a test can assert with no browser and no rendering at all, and `DietScreen.tsx`
 * beside it draws the result and holds no decisions. That is the split `screens/clients.ts` and
 * `ClientsScreen.tsx` state as the pattern to copy, and the reason is written in their header: a
 * static render never runs an effect, so logic living inside a component is logic nothing checks.
 *
 * ## NOTHING HERE PROJECTS A PLAN, AND THAT IS THE POINT
 *
 * `core/diet/` already holds both projections and they are pure: {@link projectWeekChart} turns one
 * plan into the grid, {@link projectDietHistory} turns a client's plans into now-against-before.
 * Every judgement they make — times ordering as TIMES, a shared row for a time that appears on two
 * days, an empty cell rather than a missing one, a short plan never padded into a full week, and
 * the refusal to pick a winner when two plans both claim to be current — is theirs and is asserted
 * by their own suite. This module CALLS them and words the result. It re-derives none of it.
 *
 * **NO LIST OF DAY NAMES IS WRITTEN ANYWHERE IN THIS DIRECTION.** The column headings come off the
 * chart, which takes them from the frozen `WEEKDAYS` table in `core/diet/week.js` — the one module
 * that says what a day NUMBER means (ISO-8601, 1 is Monday). The importer resolves a pasted day
 * name through that same table. If this screen kept a private one the coach would import into
 * Tuesday and read it under Wednesday with nothing erroring anywhere, which is the shape of a defect
 * this build has already shipped once with a pair of constants. `diet-guard.test.ts` is the check
 * that keeps it true rather than the promise that it is.
 *
 * ## THE WEEK REPEATS, AND THE SCREEN SAYS SO OUT LOUD
 *
 * `repeats` is a stated fact on the chart rather than an implication, because the first thing a
 * renderer is tempted to do with a day number is turn it into "this Tuesday". {@link REPEATS_WORDS}
 * is the sentence that says it to the coach, and there are no dates on this screen at all.
 *
 * ## DIET IS PLAINTEXT
 *
 * A diet plan is a food chart. No passphrase, no gate, no sensitivity marking, and nothing on this
 * path reaches for the crypto module — `core/model/entities/diet-plan.js` records the decision and
 * `core/model/sealed.js` enforces it. There is nothing in this file to switch on later.
 *
 * ## AND NO MODEL RULE IS RESTATED HERE
 *
 * This is a READ surface: it offers nothing to the record and therefore has no refusal to carry. The
 * one place a record's own words would be needed is the write half, which is a later action.
 */

import { projectDietHistory, projectWeekChart } from '../../core/diet/diet.js';
import { planIdOf } from '../../core/diet/plan.js';

// ═══════════════════════════════════════════════════════════════════════════════
// What the store hands over
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A diet plan exactly as the store holds it: an envelope with the plan nested under its own key.
 *
 * The core is plain ECMAScript typed in documentation comments and is consumed here UNCHANGED — see
 * `tsconfig.json` — so the shape it needs is stated where it is used. Only `record_id` is named,
 * because that is the only field this module reads for itself; everything inside `content` is read
 * by the projections, which own what a plan is.
 */
export interface DietPlanRecord {
  readonly record_id: string;
}

/** One person on the picker. A name and an identity, which is all a client record has to offer. */
export interface DietClient {
  readonly recordId: string;
  readonly name: string;
}

/** What the screen has been told right now. */
export interface DietReading {
  /** Every active client, for the picker. Paged, so {@link clientsComplete} says whether it is all. */
  readonly clients: readonly DietClient[];
  readonly clientsComplete: boolean;
  /** Who he is looking at, from the address. Null before he has chosen anybody. */
  readonly clientId: string | null;
  /** Their name, when they are among the clients read. Null while the picker has not answered yet. */
  readonly clientName: string | null;
  /** This client's plans, as the store paged them. Empty is a real answer, not a missing one. */
  readonly plans: readonly DietPlanRecord[];
  /**
   * Whether every plan was read. FALSE means the chart below may not be the whole history, and the
   * screen says so rather than presenting a partial read as a complete one.
   */
  readonly plansComplete: boolean;
  /** Which plan he asked to look at, from the address. Null means the one he follows now. */
  readonly showing: string | null;
}

/** The reading before anything has been read. One value, so the screen's initial state is not a literal. */
export const NOTHING_READ: DietReading = Object.freeze({
  clients: Object.freeze([]) as readonly DietClient[],
  clientsComplete: true,
  clientId: null,
  clientName: null,
  plans: Object.freeze([]) as readonly DietPlanRecord[],
  plansComplete: true,
  showing: null,
});

// ═══════════════════════════════════════════════════════════════════════════════
// The address
// ═══════════════════════════════════════════════════════════════════════════════

/*
 * WHY THE CHOICE LIVES IN THE ADDRESS AND NOT IN A PIECE OF STATE.
 *
 * The coach opens this on a laptop during an online session and on a phone with a client in front of
 * him, and in both cases the thing he wants back tomorrow is "Priya's diet" rather than "the diet
 * screen". An address that carries the choice is one he can leave open, restore from a cold start
 * and reach from a link; a choice held only in memory is one that is gone the moment iOS reclaims
 * the tab. `circular-navigation.ts` made the same call for the two loops it owns and states the rule
 * this follows: an identity travels in an address, and a NAME never does — an address is bookmarked,
 * restored from a home screen and read over somebody's shoulder, and a client's name in it would be
 * the one piece of their data this application put somewhere it did not have to.
 *
 * These are QUERIES on the destination rather than segments under it, for the same reason the
 * calendar's is: this is not a different place, it is Diet with an answer already filled in. A
 * segment would be a second address for one screen, and `no-dead-ends.test.ts` would then be holding
 * two routes where the application has one.
 *
 * They are declared HERE rather than in `circular-navigation.ts` because that module is deliberately
 * the two ENDS of a loop between two screens, written together so neither end can be edited alone.
 * Both of these are read and written by this one screen.
 */

/** The query key naming whose diet is on screen. */
export const DIET_CLIENT_KEY = 'client';

/** The query key naming which of their plans is on screen. Absent means the one they follow now. */
export const DIET_PLAN_KEY = 'plan';

/** The diet screen showing one person's diet. Spelled once; every link on the screen reads it here. */
export function dietForClient(clientId: string): string {
  return `/diet?${DIET_CLIENT_KEY}=${encodeURIComponent(clientId)}`;
}

/** The diet screen showing one particular plan of theirs, current or past. */
export function dietForPlan(clientId: string, planId: string): string {
  return `${dietForClient(clientId)}&${DIET_PLAN_KEY}=${encodeURIComponent(planId)}`;
}

/*
 * THE TWO WRITE SURFACES ARE QUERIES ON THIS DESTINATION TOO, FOR THE REASON STATED ABOVE.
 *
 * Writing a plan is not a different PLACE — it is Diet with the editor open on a client he has
 * already chosen, and both surfaces need that client. A segment underneath the destination would be
 * a second address for one screen, and `no-dead-ends.test.ts` would then be holding two routes where
 * the application has one. It also means the editor he left open is the editor he comes back to.
 */

/** The query key naming which plan is being WRITTEN. {@link NEW_PLAN} means one that does not exist yet. */
export const DIET_EDIT_KEY = 'edit';

/** The value of {@link DIET_EDIT_KEY} for a plan being written from nothing. */
export const NEW_PLAN = 'new';

/** The query key that opens the paste surface. Present or absent; it carries no plan of its own. */
export const DIET_IMPORT_KEY = 'import';

/** The one value {@link DIET_IMPORT_KEY} takes, so the address is a fact rather than a flag. */
export const PASTE_OPEN = 'paste';

/** The editor, writing a plan this client does not have yet. */
export function dietNewPlan(clientId: string): string {
  return `${dietForClient(clientId)}&${DIET_EDIT_KEY}=${NEW_PLAN}`;
}

/** The editor, changing a plan that already exists. */
export function dietAmendPlan(clientId: string, planId: string): string {
  return `${dietForClient(clientId)}&${DIET_EDIT_KEY}=${encodeURIComponent(planId)}`;
}

/** The paste surface, for this client. */
export function dietImport(clientId: string): string {
  return `${dietForClient(clientId)}&${DIET_IMPORT_KEY}=${PASTE_OPEN}`;
}

/** Which of the destination's three surfaces an address asks for. */
export type DietSurface = 'read' | 'editor' | 'paste';

/**
 * WHICH SURFACE THE ADDRESS ASKS FOR — decided here rather than inside the component.
 *
 * It is three lines and it could plausibly have been written inline, and that is exactly why it is
 * not: `no-dead-ends.test.ts` proves a destination RESOLVES and RENDERS, and it cannot tell one
 * screen from another, let alone one surface of a screen from another. A rendered check cannot reach
 * this either, because the surfaces only appear once the local store has opened and a static render
 * never opens one. So the wiring is proven HERE, against the shipped link builders, and the answer
 * the component acts on is the answer the test asserts.
 *
 * PASTING WINS an address that somehow asks for both. Not a preference: one answer has to be
 * definite, and the alternative is a screen whose behaviour depends on which key it happened to read
 * first.
 */
export function whichDietSurface(address: { get: (key: string) => string | null }): DietSurface {
  if (address.get(DIET_IMPORT_KEY) === PASTE_OPEN) return 'paste';
  if (address.get(DIET_EDIT_KEY) !== null) return 'editor';
  return 'read';
}

/** The words on the control that opens the paste surface. Named first, because pasting is the path. */
export const PASTE_A_PLAN = 'Paste a plan';

/** The words on the control that opens an empty editor. */
export const WRITE_A_PLAN = 'Write one out by hand';

/** The words on the control that opens an existing plan for changing. */
export const CHANGE_THIS_PLAN = 'Change this plan';

/** The way back to reading, from either write surface. */
export const BACK_TO_THE_DIET = 'Back to this diet';

// ═══════════════════════════════════════════════════════════════════════════════
// The standing sentences
// ═══════════════════════════════════════════════════════════════════════════════

/*
 * THERE IS NO TITLE CONSTANT IN THIS FILE, AND THAT IS DELIBERATE — the same reason `clients.ts`
 * gives. Diet is a DESTINATION, and `shell/navigation.ts` is the one list that says what a
 * destination is called. A title here would be a second copy of that word.
 */

/** What the picker asks, before he has chosen anybody. */
export const CHOOSE_SOMEBODY =
  'Choose somebody to see what they are eating. Their plan is shown as one week, laid out by day '
  + 'and by time of day.';

/**
 * WHAT AN EMPTY REGISTER SAYS HERE, and it is not an error.
 *
 * A new coach reaches Diet before he has added anybody, and a blank panel on that visit teaches him
 * that this application complains at him. It names the way onward instead — Clients is a
 * destination and the navigation surface carries it at every width, so it is NAMED in his own words
 * rather than drawn as a second control that would collide with the first. `app/DESIGN.md` and
 * `shell/trail.ts` both hold that rule.
 */
export const NOBODY_TO_CHOOSE =
  'Nobody is on your register yet. Add the people you train under Clients, on the navigation, and '
  + 'they will be here to choose from.';

/** Said under a paged picker, so a short list is never read as the whole register. */
export const MORE_CLIENTS =
  'There are more people on your register than these. This shows them in name order.';

/**
 * THE SENTENCE THAT STOPS THE CHART BEING READ AS A DIARY.
 *
 * The record is a week that REPEATS and holds no dates at all, and the projection refuses to resolve
 * a day against a calendar. Said out loud because a grid with Monday at the left is exactly what a
 * dated week looks like, and a coach reading it as "this week" would go looking for last week.
 */
export const REPEATS_WORDS =
  'This is one week, and it repeats. There are no dates on it: Monday means every Monday, until you '
  + 'change the plan.';

/** What the past-plans section is called. Reachable, and never a thing he has to know to look for. */
export const HISTORY_TITLE = 'Earlier plans';

/** Said when the whole of a client's history could not be read in one page. */
export const HISTORY_INCOMPLETE =
  'This client has more plans than could be read at once, so what is below may not be all of them.';

/** The words on the control that goes back to the plan he follows now. */
export const BACK_TO_CURRENT = 'Show the plan they follow now';

// ═══════════════════════════════════════════════════════════════════════════════
// The picker
// ═══════════════════════════════════════════════════════════════════════════════

/** What the client picker says. */
export interface PickerReport {
  readonly intro: string;
  /** True when there is nobody at all to choose, which for a new coach is the first thing he sees. */
  readonly empty: boolean;
  readonly items: readonly DietClient[];
  /** Said when the page stopped short of the end, or null when it is the whole register. */
  readonly moreWords: string | null;
  /** Who is chosen, or null. The picker says so as well as marking the row. */
  readonly chosenId: string | null;
}

/** Everything the picker says, from the reading. */
export function describePicker(reading: DietReading): PickerReport {
  const empty = reading.clients.length === 0;

  return {
    intro: empty ? NOBODY_TO_CHOOSE : CHOOSE_SOMEBODY,
    empty,
    items: reading.clients,
    moreWords: reading.clientsComplete ? null : MORE_CLIENTS,
    chosenId: reading.clientId,
  };
}

/**
 * What one person's row on the picker announces.
 *
 * It names the person, because a picker of forty rows otherwise offers forty controls announcing the
 * identical sentence — which is what a screen reader reads out, with nothing to tell them apart.
 */
export function chooseClientLabel(name: string): string {
  return `Show the diet for ${name}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// One client's diet
// ═══════════════════════════════════════════════════════════════════════════════

/** One earlier plan, as a row he can open. */
export interface HistoryEntry {
  readonly planId: string;
  readonly name: string;
  /** What it covered, in one plain line — the projection's own sentence, unchanged. */
  readonly covers: string;
  /** The record's own status word, so a draft is not shown as though it were something he followed. */
  readonly statusWord: string;
  /** True when this is the plan currently drawn in the chart. */
  readonly showing: boolean;
}

/** What the diet screen says once a client is chosen. */
export interface DietReport {
  /** False before he has chosen anybody, when the screen is the picker and nothing else. */
  readonly chosen: boolean;
  /** The history's own one-sentence summary, or null when nobody is chosen. */
  readonly statement: string | null;
  /** True when this client has no plans at all. The common state for a new client, not an error. */
  readonly noPlanYet: boolean;
  /** The words for that state, or null. */
  readonly noPlanWords: string | null;
  /**
   * The chart to draw, or null when there is nothing to draw. Comes from `projectWeekChart` and is
   * passed to the component whole: the component reads it and re-derives nothing.
   */
  readonly chart: ReturnType<typeof projectWeekChart> | null;
  /** Whose plan the chart is, in his words — "the plan they follow now", or the earlier one's name. */
  readonly chartCaption: string | null;
  /** The repeating-week sentence when there is a chart, else null. */
  readonly repeatsWords: string | null;
  /** What the plan says nothing about, in plain words, or null when it holds all seven days. */
  readonly shortWeekWords: string | null;
  /** Said when a plan exists but holds no entries at all. */
  readonly emptyChartWords: string | null;
  /** True when he is looking at an earlier plan rather than the current one. */
  readonly showingEarlier: boolean;
  /**
   * The identity of the plan actually drawn, or null when nothing is.
   *
   * It exists so the control that OPENS this plan for changing points at the plan he is looking at.
   * Working it out again in the component would be a second answer to "which plan is on screen",
   * and the two would disagree in exactly the case this screen is most careful about: a contested
   * current, where the answer is deliberately nothing at all.
   */
  readonly drawingPlanId: string | null;
  readonly history: readonly HistoryEntry[];
  readonly historyTitle: string;
  readonly historyIncomplete: string | null;
  /**
   * Anything he has to resolve himself, in the projection's own words — two plans both marked
   * current, a status this application does not recognise, a plan belonging to somebody else. Empty
   * is the normal case, and NOTHING here is resolved on his behalf.
   */
  readonly problems: readonly string[];
}

/** The report for a screen nobody has been chosen on. One value, so the empty case is not a literal. */
const NOBODY_CHOSEN: DietReport = Object.freeze({
  chosen: false,
  statement: null,
  noPlanYet: false,
  noPlanWords: null,
  chart: null,
  chartCaption: null,
  repeatsWords: null,
  shortWeekWords: null,
  emptyChartWords: null,
  showingEarlier: false,
  drawingPlanId: null,
  history: Object.freeze([]) as readonly HistoryEntry[],
  historyTitle: HISTORY_TITLE,
  historyIncomplete: null,
  problems: Object.freeze([]) as readonly string[],
});

/**
 * Everything the screen says about one client's diet.
 *
 * WHICH PLAN IS DRAWN. The one he asked for by identity, when he asked for one and it is among the
 * plans read. Otherwise the one the history calls current — and "the history calls it current" is
 * doing real work there: it is null when two plans both claim to be, and this screen then draws NO
 * chart and shows the projection's own sentence about it instead. Drawing either claimant would be
 * this application choosing between them, which is the one thing `core/diet/history.js` exists to
 * refuse: he would be shown one plan, act on it, and never learn the other existed.
 */
export function describeDiet(reading: DietReading): DietReport {
  if (reading.clientId === null || reading.clientId.trim().length === 0) return NOBODY_CHOSEN;

  const history = projectDietHistory([...reading.plans], { client_id: reading.clientId });
  const byId = new Map(reading.plans.map((plan) => [planIdOf(plan), plan]));

  const asked = reading.showing === null ? null : byId.get(reading.showing) ?? null;
  const currentId = history.current === null ? null : history.current.plan_id;
  const drawing = asked ?? (currentId === null ? null : byId.get(currentId) ?? null);
  const drawingId = drawing === null ? null : planIdOf(drawing);
  const showingEarlier = drawingId !== null && drawingId !== currentId;

  const chart = drawing === null ? null : projectWeekChart(drawing);

  return {
    chosen: true,
    statement: history.statement,
    noPlanYet: !history.has_plans,
    noPlanWords: history.has_plans ? null : noPlanWords(reading.clientName),
    chart,
    chartCaption: chart === null ? null : chartCaption(chart.title, showingEarlier),
    repeatsWords: chart === null ? null : REPEATS_WORDS,
    shortWeekWords: chart === null ? null : shortWeekWords(chart),
    emptyChartWords: chart !== null && chart.is_empty ? emptyChartWords(chart.title) : null,
    showingEarlier,
    drawingPlanId: drawingId,
    history: earlierPlans(history, drawingId),
    historyTitle: HISTORY_TITLE,
    historyIncomplete: reading.plansComplete ? null : HISTORY_INCOMPLETE,
    problems: history.problems,
  };
}

/**
 * A CLIENT WITH NO PLAN YET — the ordinary state of somebody just added, worded as one.
 *
 * It says what would put a plan there, because the alternative is a screen that reports an absence
 * and leaves him to work out whether that is a fault. IT NOW NAMES THE WAY ONWARD, because there now
 * IS one: the two controls beside it are real. It used to end without naming a control, and the
 * reason was written down — a sentence pointing at a button that does not exist is worse than one
 * that does not point anywhere — so the sentence changes in the same action that makes the button
 * exist, rather than being left to rot into a half-truth.
 *
 * PASTING IS NAMED FIRST. He transcribes his wife's plans, and if pasting reads as the advanced
 * option he will type them out instead.
 */
export function noPlanWords(name: string | null): string {
  const who = name === null ? 'This client' : name;
  return `${who} has no diet plan yet. When you have one from the nutritionist, paste it in and `
    + 'check what was read, or write it out here — either way it shows as a week you can read at a '
    + 'glance.';
}

/** Whose plan is in the chart, said above it so an earlier plan is never mistaken for the current one. */
function chartCaption(title: string, showingEarlier: boolean): string {
  const named = title.length > 0 ? title : 'This plan';
  return showingEarlier
    ? `${named} — an earlier plan. This is not what they are following now.`
    : `${named} — the plan they follow now.`;
}

/**
 * WHAT THE PLAN SAYS NOTHING ABOUT, NAMED, and this is the sentence that stops a lie.
 *
 * The chart holds only the days the plan HOLDS, so a five-day plan has five columns and there is no
 * empty Saturday drawn — which is right, because an empty Saturday column reads as a fast day. But
 * an absent column is silent, and silence reads as "nothing on Saturday" just as easily. So the
 * missing days are named in words: the plan does not SAY, which is a different fact from the plan
 * saying nothing is eaten.
 */
export function shortWeekWords(chart: { is_full_week: boolean; missing_days: readonly { name: string }[] }): string | null {
  if (chart.is_full_week || chart.missing_days.length === 0) return null;

  // "There is nothing written for Saturday and Sunday" is right for one day and for five: the
  // subject of the sentence is "nothing", not the days.
  const named = listWords(chart.missing_days.map((day) => day.name));
  return `This plan covers part of the week. There is nothing written for ${named} — that means `
    + 'the plan does not say, not that nothing is eaten.';
}

/** A plan that exists and holds nothing to draw. Rare, and honest about being empty rather than blank. */
function emptyChartWords(title: string): string {
  const named = title.length > 0 ? `"${title}"` : 'This plan';
  return `${named} has no meals written in it yet, so there is nothing to lay out.`;
}

/**
 * THE EARLIER PLANS, REACHABLE — past, drafts and anything carrying a status this app cannot read.
 *
 * All three are here rather than the past alone, and the reason is the same one the projection gives
 * for naming problems instead of solving them: a plan the coach can see in the count and cannot open
 * is a plan he cannot check. The status word travels with each row so a draft is never presented as
 * something the client followed.
 *
 * The plan currently drawn is marked rather than removed from the list, because a list that loses a
 * row when you open it is a list whose length changes under the coach as he reads it.
 */
function earlierPlans(
  history: ReturnType<typeof projectDietHistory>,
  drawingId: string | null,
): readonly HistoryEntry[] {
  const rows: HistoryEntry[] = [];

  for (const plan of [...history.past, ...history.drafts, ...history.unknown_status]) {
    if (plan.plan_id === null) continue;
    rows.push({
      planId: plan.plan_id,
      name: plan.name,
      covers: plan.covers,
      statusWord: statusWord(plan.status, plan.status_is_known),
      showing: plan.plan_id === drawingId,
    });
  }

  return rows;
}

/**
 * The record's own status as a word on a row.
 *
 * A status the vocabulary does not list is shown AS IT IS STORED rather than hidden or translated:
 * the projection has already named it in `problems`, and a row that quietly relabelled it would take
 * away the only place the coach could see what the record actually holds.
 */
function statusWord(status: string, known: boolean): string {
  if (!known) return status.length > 0 ? status : 'No status';
  switch (status) {
    case 'current': return 'Current';
    case 'past': return 'Past';
    case 'draft': return 'Draft';
    // Not unreachable-by-construction: `DIET_PLAN_STATUSES` is the record's list and it may grow.
    // Showing the record's own word is the honest answer to a status this file has no word for.
    default: return status;
  }
}

/** Names in a list, joined the way a person writes them. */
function listWords(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
