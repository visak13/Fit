/**
 * THE HISTORY — what this client follows NOW against what they followed BEFORE.
 *
 * That comparison is the question the coach actually asks of the diet module, and this projection is
 * the whole of the answer. Pure: plans in, view model out, no store, no clock, no browser.
 *
 * ## Status is a FACT HE SET, never a sum this file works out
 *
 * The current plan is the one whose `status` says `current`, from the record's own
 * `DIET_PLAN_STATUSES`. There is no date arithmetic in this file and there must never be. A plan
 * that "becomes current" because an `effective_from` passed would change under the coach at
 * midnight, in the middle of a week, with nothing recorded and nothing to point at; the record's
 * own header says so, and it is repeated here because this is the file where the temptation lands.
 * `effective_from` and `effective_to` are shown, ordered by, and never reasoned from.
 *
 * ## The two cases that will happen, handled rather than assumed away
 *
 * - **A client with no plans at all.** The common state, not an error: every field is present and
 *   empty, so an interface cannot render half an answer or a spinner with nothing behind it.
 * - **More than one plan claiming to be current.** Two devices, a plan marked current before the old
 *   one was marked past — ordinary, and the app must not paper over it. `current` is null,
 *   `contested_current` holds every claimant, and `problems` says so in plain words. SILENTLY
 *   PICKING A WINNER IS THE ONE THING THIS MUST NOT DO: the coach would be shown one plan, act on
 *   it, and never learn the other existed.
 *
 * A plan belonging to a different client is likewise named in `problems` and kept OUT of the lists.
 * One client's facts must never appear in another's history.
 */

import { DIET_PLAN_STATUSES } from '../model/vocabularies.js';
import { DAYS_IN_WEEK, compareTimes, weekdayOf } from './week.js';
import { daysOf, entriesOf, isDeletedPlan, itemsOf, planContentOf, planIdOf } from './plan.js';

/** The record's own statuses, named here so a reader of this file can see what they are. */
const CURRENT = 'current';
const DRAFT = 'draft';
const PAST = 'past';

/**
 * @typedef {Object} PlanSummary
 * @property {string|null} plan_id
 * @property {string|null} client_id
 * @property {string} name
 * @property {string} status The record's own value, unchanged.
 * @property {boolean} status_is_known Whether the status is one the record's vocabulary lists.
 * @property {boolean} is_current
 * @property {string|null} effective_from Shown and ordered by. Never reasoned from.
 * @property {string|null} effective_to
 * @property {{day: number, name: string, short_name: string}[]} days
 * @property {number} day_count
 * @property {boolean} is_full_week
 * @property {number} entry_count
 * @property {number} item_count
 * @property {string|null} first_time Earliest time of day anywhere in the plan.
 * @property {string|null} last_time
 * @property {string} covers What this plan covered, in one plain line.
 * @property {string|null} notes
 * @property {string|null} source_note Who wrote the plan the coach transcribed, in his own words.
 */

/**
 * @typedef {Object} DietHistory
 * @property {string|null} client_id
 * @property {boolean} has_plans
 * @property {number} plan_count Plans counted for THIS client, tombstones and strays excluded.
 * @property {PlanSummary|null} current Exactly one plan marked current, or null.
 * @property {PlanSummary[]} contested_current Every claimant when more than one is marked current.
 *   Empty otherwise. Never resolved here.
 * @property {boolean} has_contested_current
 * @property {PlanSummary[]} past Most recently finished first.
 * @property {PlanSummary[]} drafts
 * @property {PlanSummary[]} unknown_status Plans carrying a status the vocabulary does not list.
 * @property {{current: number, past: number, draft: number, unknown: number}} counts
 * @property {string[]} problems Plain-language statements of anything the coach has to resolve.
 *   Empty is the normal case.
 * @property {string} statement The whole history in one sentence, for a screen that has one line.
 */

/**
 * Project a client's plans into their history.
 *
 * @param {unknown} records Stored envelopes or bare plans, in any order.
 * @param {{client_id?: string|null}} [options] The client the history is FOR. Without it the first
 *   plan's client decides, which is right for the ordinary call and honest about a mixed list.
 * @returns {DietHistory}
 */
export function projectDietHistory(records, options = {}) {
  const all = (Array.isArray(records) ? records : [])
    .filter((record) => !isDeletedPlan(record))
    .map(summariseDietPlan);

  const clientId = options.client_id ?? (all.length > 0 ? all[0].client_id : null);
  const mine = all.filter((plan) => plan.client_id === clientId);
  const strays = all.filter((plan) => plan.client_id !== clientId);

  const claimants = mine.filter((plan) => plan.status === CURRENT).sort(byRecency);
  const contested = claimants.length > 1 ? claimants : [];
  const current = claimants.length === 1 ? claimants[0] : null;

  const past = mine.filter((plan) => plan.status === PAST).sort(byRecency);
  const drafts = mine.filter((plan) => plan.status === DRAFT).sort(byRecency);
  const unknown = mine.filter((plan) => !plan.status_is_known).sort(byRecency);

  const counts = {
    current: claimants.length,
    past: past.length,
    draft: drafts.length,
    unknown: unknown.length,
  };

  return {
    client_id: clientId,
    has_plans: mine.length > 0,
    plan_count: mine.length,
    current,
    contested_current: contested,
    has_contested_current: contested.length > 0,
    past,
    drafts,
    unknown_status: unknown,
    counts,
    problems: problemsIn(contested, unknown, strays),
    statement: statementFor({ current, contested, past, drafts, planCount: mine.length }),
  };
}

/**
 * One plan, summarised into what the coach needs to recognise it by.
 *
 * @param {unknown} record A stored envelope or a bare plan.
 * @returns {PlanSummary}
 */
export function summariseDietPlan(record) {
  const content = planContentOf(record);
  const status = typeof content.status === 'string' ? content.status : '';
  const days = summariseDays(content);
  const times = allTimes(content);

  const entryCount = daysOf(content).reduce((total, day) => total + entriesOf(day).length, 0);
  const itemCount = daysOf(content).reduce(
    (total, day) => total + entriesOf(day).reduce((count, entry) => count + itemsOf(entry).length, 0),
    0,
  );

  const first = times.length > 0 ? times[0] : null;
  const last = times.length > 0 ? times[times.length - 1] : null;

  return {
    plan_id: planIdOf(record),
    client_id: typeof content.client_id === 'string' ? content.client_id : null,
    name: typeof content.name === 'string' ? content.name : '',
    status,
    status_is_known: DIET_PLAN_STATUSES.includes(status),
    is_current: status === CURRENT,
    effective_from: typeof content.effective_from === 'string' ? content.effective_from : null,
    effective_to: typeof content.effective_to === 'string' ? content.effective_to : null,
    days,
    day_count: days.length,
    is_full_week: days.length === DAYS_IN_WEEK,
    entry_count: entryCount,
    item_count: itemCount,
    first_time: first,
    last_time: last,
    covers: coverageLine(days, first, last, entryCount),
    notes: typeof content.notes === 'string' ? content.notes : null,
    source_note: typeof content.source_note === 'string' ? content.source_note : null,
  };
}

// ── internals ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The distinct days the plan holds, ascending. Grouped by number for the same reason the chart
 * groups them: a draft that has not been validated yet may carry a day twice.
 * @param {Record<string, any>} content
 */
function summariseDays(content) {
  const numbers = new Set(daysOf(content).map((day) => day.day));
  return [...numbers]
    .map((day) => weekdayOf(day))
    .filter((weekday) => weekday !== null)
    .sort((a, b) => a.day - b.day)
    .map(({ day, name, short_name }) => ({ day, name, short_name }));
}

/**
 * Every time anywhere in the plan, in time order — the earliest and latest are the ends of it.
 * @param {Record<string, any>} content
 */
function allTimes(content) {
  const times = new Set();
  for (const day of daysOf(content)) {
    for (const entry of entriesOf(day)) {
      if (typeof entry.time === 'string') times.add(entry.time);
    }
  }
  return [...times].sort(compareTimes);
}

/**
 * What this plan covered, in one line: the days by name, the span of the day, and how much is in it.
 * @param {{short_name: string}[]} days @param {string|null} first @param {string|null} last
 * @param {number} entryCount
 */
function coverageLine(days, first, last, entryCount) {
  if (days.length === 0) return 'No days.';

  const named = days.map((day) => day.short_name).join(', ');
  const span = first === null ? null : (first === last ? first : `${first} to ${last}`);
  const size = `${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`;

  return [named, span, size].filter((part) => part !== null).join(' — ');
}

/**
 * Everything the coach has to resolve himself, said plainly. Never resolved here.
 * @param {PlanSummary[]} contested @param {PlanSummary[]} unknown @param {PlanSummary[]} strays
 * @returns {string[]}
 */
function problemsIn(contested, unknown, strays) {
  const problems = [];

  if (contested.length > 0) {
    problems.push(
      `${contested.length} plans are all marked current: ${quotedNames(contested)}. ` +
      'This app will not choose between them — mark the ones no longer followed as past.',
    );
  }

  for (const plan of unknown) {
    problems.push(
      `${quoted(plan.name)} carries a status this app does not recognise: ${quoted(plan.status)}.`,
    );
  }

  if (strays.length > 0) {
    problems.push(strays.length === 1
      ? '1 plan belongs to a different client and is not shown here.'
      : `${strays.length} plans belong to a different client and are not shown here.`);
  }

  return problems;
}

/**
 * The whole history in one sentence.
 * @param {{current: PlanSummary|null, contested: PlanSummary[], past: PlanSummary[],
 *   drafts: PlanSummary[], planCount: number}} state
 */
function statementFor({ current, contested, past, drafts, planCount }) {
  if (planCount === 0) return 'No diet plan yet.';

  const before = past.length === 0
    ? null
    : `${past.length} earlier ${past.length === 1 ? 'plan' : 'plans'}`;
  const unfinished = drafts.length === 0
    ? null
    : `${drafts.length} ${drafts.length === 1 ? 'draft' : 'drafts'}`;

  const now = contested.length > 0
    ? `${contested.length} plans are marked current`
    : (current ? `Following ${quoted(current.name)}` : 'No current plan');

  return `${[now, before, unfinished].filter((part) => part !== null).join('; ')}.`;
}

/**
 * Most recently finished first.
 *
 * A plan's recency is when it STOPPED applying, falling back to when it started for one that never
 * stopped. Both are stored as `YYYY-MM-DD`, so comparing them as text is exactly comparing them as
 * dates — an ordering, not an inference about which plan is in force. A plan with neither date sorts
 * last rather than first: it says less about itself, not that it is older. Name then identity break
 * the remaining ties, so the same plans always come back in the same order.
 *
 * @param {PlanSummary} a @param {PlanSummary} b
 */
function byRecency(a, b) {
  const byEnd = descending(a.effective_to ?? a.effective_from, b.effective_to ?? b.effective_from);
  if (byEnd !== 0) return byEnd;

  const byStart = descending(a.effective_from, b.effective_from);
  if (byStart !== 0) return byStart;

  return a.name.localeCompare(b.name) || String(a.plan_id).localeCompare(String(b.plan_id));
}

/** Later first, with an absent date last. @param {string|null} a @param {string|null} b */
function descending(a, b) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b.localeCompare(a);
}

/** @param {string} text */
function quoted(text) {
  return `"${text}"`;
}

/** @param {PlanSummary[]} plans */
function quotedNames(plans) {
  return plans.map((plan) => quoted(plan.name)).join(', ');
}
