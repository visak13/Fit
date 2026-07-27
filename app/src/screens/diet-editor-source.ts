/**
 * WHERE THE DIET EDITOR'S WRITES GO — every write, extracted from the components.
 *
 * `diet-source.ts` beside it holds the READS. This is the write half, and it takes the STORE from
 * `platform/LocalStore.tsx` for the reason `client-register-source.ts` states in its own header: a
 * reporting seam is a frozen page pushed down from above with nothing callable on it, a form must
 * call a create, and bending a seam to carry one would weaken the rule for the four surfaces that
 * property protects. That file says in as many words that a later read-write screen should copy IT
 * rather than invent a sixth seam. This is that.
 *
 * The writes are plain functions taking a store, so they are driven in a test against a REAL store
 * on the core's own platform double — the same reason `registerClient` and `beginOpening` were
 * extracted from their components. A static render never runs an effect.
 *
 * ## NOTHING HERE VALIDATES A PLAN
 *
 * `core/model/entities/diet-plan.js` is the schema: the day range, the time pattern, the item bounds
 * and every field length are ITS rules, checked by `store.create` on the way in. These functions
 * offer the draft and let the record answer. What they throw on a refused draft is the record's own
 * `StoreValidationError` with its issues intact, which `describePlanRefusal` in `diet-editor.ts`
 * puts labels in front of and rewords nowhere. A check here would be a second copy that drifts, and
 * the drift would be silent — the screen would refuse something the record allows, or allow
 * something it refuses.
 *
 * ## AND NOTHING HERE INFERS WHICH PLAN IS CURRENT
 *
 * See {@link makePlanCurrent}. It is the sharpest thing in this file and the one with a hazard
 * underneath it.
 */

import { projectDietHistory } from '../../core/diet/diet.js';
import { planContentOf, planIdOf } from '../../core/diet/plan.js';
import { planContentFromDraft } from './diet-editor';
import type { MadeCurrent, PlanDraft } from './diet-editor';
import type { LocalStore } from '../../core/store/store.js';

/** The record type, spelled once. The store's own name for it, not a second word for the same kind. */
const DIET_PLAN = 'diet-plan';

/**
 * The status a plan being written carries until the coach says otherwise.
 *
 * It is `draft` because that is the honest answer: a plan he is part way through typing is not one
 * anybody is eating. Which plan is CURRENT is an explicit act — {@link makePlanCurrent} — and never
 * a consequence of having saved something. The value is one member of `DIET_PLAN_STATUSES` in
 * `core/model/vocabularies.js`; the record refuses anything else, in its own words, and this file
 * does not restate the list.
 */
export const NEW_PLAN_STATUS = 'draft';

/** A stored plan, in the one shape this module reads off it. */
interface StoredPlan {
  readonly record_id: string;
}

/**
 * Write a new plan. It resolves only once the write has COMMITTED.
 *
 * `store.create` does not resolve before the transaction completed, and a failure throws rather than
 * returning a status — so nothing may be reported to the coach as saved until this resolves. That is
 * the same contract `registerClient` holds, for the same reason.
 */
export async function saveNewPlan(
  store: LocalStore,
  draft: PlanDraft,
  clientId: string,
): Promise<StoredPlan> {
  const content = planContentFromDraft(draft, { clientId, status: NEW_PLAN_STATUS });
  return (await store.create(DIET_PLAN, content)) as StoredPlan;
}

/**
 * Save an imported draft exactly as the core built it.
 *
 * IT IS PASSED THROUGH UNCHANGED, and that is the point: the draft came from
 * `core/diet/import.js`, which traces every value in it back to something the coach actually pasted.
 * Reshaping it here would put a second author between the paste and the record.
 */
export async function saveImportedPlan(
  store: LocalStore,
  draft: Record<string, unknown>,
): Promise<StoredPlan> {
  return (await store.create(DIET_PLAN, draft)) as StoredPlan;
}

/**
 * Save changes to a plan that already exists.
 *
 * **THE STATUS IS TAKEN FROM WHAT IS STORED, INSIDE THE TRANSACTION, NOT FROM WHAT THE SCREEN SAW.**
 * `produce` runs after the current revision has been read, so a plan made current in another window
 * while he was typing stays current: editing the food is not a statement about whether anybody is
 * eating it. Carrying the screen's idea of the status into the write is how an edit silently demotes
 * the plan a client is following.
 */
export async function saveChangesToPlan(
  store: LocalStore,
  planId: string,
  draft: PlanDraft,
  clientId: string,
): Promise<StoredPlan> {
  return (await store.update(DIET_PLAN, planId, (current: Record<string, unknown>) => {
    const status = typeof current?.status === 'string' ? current.status : NEW_PLAN_STATUS;
    return planContentFromDraft(draft, { clientId, status });
  })) as StoredPlan;
}

/**
 * MAKE ONE PLAN THE PLAN THEY FOLLOW NOW — and stop every other claimant being one, in the same act.
 *
 * ## THE HAZARD THIS IS SHAPED AROUND
 *
 * `dietPlanForClient` in `core/store/queries.js` asks the by-client-status index with **limit 1**.
 * When two plans are both marked current it returns whichever the index reaches first and NOTHING
 * anywhere reports the contest: no error, no warning, and the coach is shown a plan that may not be
 * the one he meant. So two plans must never BOTH be current, and the act that makes one current is
 * the only place that can hold that.
 *
 * ## WHY THE CLAIMANTS ARE READ FROM THE PROJECTION AND NOT FROM THAT QUERY
 *
 * `core/diet/history.js` takes the client's plans WHOLE and reports every claimant — `current` when
 * there is exactly one and `contested_current` when there are more. It is the only read that can see
 * a contest, and this function is changing the very fact the concealing read would be asked about.
 * That is also why a contest is not merely reported here but RESOLVED: he has explicitly said which
 * plan they follow, so every other claimant is demoted, which is the remedy `history.js` names in
 * its own problem sentence.
 *
 * ## THE ORDER IS DEMOTE, THEN PROMOTE, AND IT IS DELIBERATE
 *
 * The store gives a screen one record per write, so these are two writes, and either could be the
 * last one to land — a closed lid, a dead battery, a browser reclaiming the tab.
 *
 *  - **Promote first** and the window between the writes has TWO plans marked current, which is
 *    exactly the silent state above.
 *  - **Demote first** and the window has NONE. `projectDietHistory` says "No current plan" in plain
 *    words, the plans are all still there, and pressing the control again finishes the job.
 *
 * One of those is invisible and one is stated, so the order is not a preference. And it is the same
 * reason nothing is deleted at any point: the earlier plan becomes PAST and stays on the history,
 * which is the whole point of keeping a history at all.
 *
 * @param plans The client's plans as `readDietPlans` read them — whole, unfiltered.
 */
export async function makePlanCurrent(
  store: LocalStore,
  { clientId, planId, plans }: {
    clientId: string;
    planId: string;
    plans: readonly unknown[];
  },
): Promise<MadeCurrent> {
  const history = projectDietHistory([...plans], { client_id: clientId });

  /**
   * Every plan claiming to be current: the one that is, or all of them when they are in contest.
   *
   * `plan_id` IS NULLABLE AND THAT IS THE PROJECTION TELLING THE TRUTH — a plan that has never been
   * stored has no identity to report, and it says null rather than inventing one. So the absent case
   * is handled here rather than asserted away: a claimant with no identity CANNOT BE WRITTEN TO, and
   * quietly skipping it would leave a second plan marked current with nothing anywhere saying so,
   * which is the exact invisible state this whole function exists to prevent. It is counted and
   * carried out in {@link MadeCurrent.unaddressable}, and the screen says so.
   */
  const claimants: readonly (string | null)[] = history.current === null
    ? history.contested_current.map((plan) => plan.plan_id)
    : [history.current.plan_id];

  const demoted: string[] = [];
  let unaddressable = 0;

  for (const claimant of claimants) {
    if (claimant === planId) continue;
    if (claimant === null) {
      unaddressable += 1;
      continue;
    }
    // eslint-disable-next-line no-await-in-loop -- the order is the safety property; see the header.
    await setPlanStatus(store, claimant, 'past');
    demoted.push(nameOfPlan(plans, claimant));
  }

  try {
    await setPlanStatus(store, planId, 'current');
  } catch (error) {
    // The demotions have committed and the promotion has not, so the client has no current plan.
    // It is SAID rather than swallowed, and the failure itself is re-thrown so the screen shows the
    // store's own words rather than a sentence of this module's.
    (error as { madeCurrent?: MadeCurrent }).madeCurrent = {
      promoted: null, demoted, unaddressable, leftWithNoCurrent: true,
    };
    throw error;
  }

  return { promoted: nameOfPlan(plans, planId), demoted, unaddressable, leftWithNoCurrent: false };
}

/**
 * Set one plan's status, changing nothing else about it.
 *
 * The rest of the content is carried through untouched rather than rebuilt: this is a statement
 * about whether somebody is eating the plan, and it must not become an opportunity to rewrite what
 * they are eating.
 */
async function setPlanStatus(store: LocalStore, planId: string, status: string): Promise<void> {
  await store.update(DIET_PLAN, planId, (current: Record<string, unknown>) => ({
    ...current, status,
  }));
}

/** A plan's own name, for the sentence that says what happened. */
function nameOfPlan(plans: readonly unknown[], planId: string): string {
  const found = plans.find((plan) => planIdOf(plan) === planId);
  const name = found === undefined ? '' : planContentOf(found).name;
  return typeof name === 'string' && name.length > 0 ? name : 'That plan';
}
