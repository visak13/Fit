/**
 * THE DIET EDITOR'S WRITES, DRIVEN AGAINST A REAL STORE.
 *
 * Nothing here is a stub. Every test opens the core's own in-process database — the same one the
 * store's gate runs on — and writes through the real schema, so the record's own validation is what
 * accepted or refused each draft. A suite satisfied by a shape would pass just as happily against a
 * mock that had quietly stopped agreeing with the record model, which is the failure a screen cannot
 * see from the inside.
 *
 * ## THE PROPERTY THAT MATTERS MOST HERE
 *
 * **Two plans are never both marked current, and the earlier one is never destroyed.**
 * `dietPlanForClient` asks the by-client-status index with limit 1, so a second current plan is not
 * an error anywhere — it is a plan silently not shown. That state is therefore asserted against
 * directly: after making a plan current, the store is read back and the claimants are COUNTED.
 *
 * And the demotion is checked to be a demotion rather than a deletion: the earlier plan is still in
 * the store, still readable, carrying its own food. The history is the whole point of keeping one.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { dietPlansForClient, openLocalStore } from '../../core/store/store.js';
import { createLaptop } from '../../core/store/testing/platform-double.js';
import { projectDietHistory } from '../../core/diet/diet.js';
import { EMPTY_DRAFT, addMeal, draftFromPlan, updateMeal } from './diet-editor';
import type { PlanDraft } from './diet-editor';
import {
  NEW_PLAN_STATUS, makePlanCurrent, saveChangesToPlan, saveNewPlan,
} from './diet-editor-source';
import { readDietPlans } from './diet-source';
import type { LocalStore } from '../../core/store/store.js';

const opened: LocalStore[] = [];

async function freshStore(): Promise<LocalStore> {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });
  opened.push(store);
  return store;
}

after(async () => {
  for (const store of opened) {
    // eslint-disable-next-line no-await-in-loop
    await store.close?.();
  }
});

async function addClient(store: LocalStore, name = 'Priya'): Promise<string> {
  const created = (await store.create('client', { name, notes: '', active: true })) as {
    record_id: string;
  };
  return created.record_id;
}

/** A plan straight through the real schema, so the record is what accepted it. */
async function addPlan(
  store: LocalStore,
  clientId: string,
  content: Record<string, unknown>,
): Promise<string> {
  const created = (await store.create('diet-plan', {
    client_id: clientId,
    name: 'A plan',
    status: 'draft',
    days: [{ day: 1, entries: [{ time: '09:00', label: 'Breakfast', items: ['Oats'] }] }],
    ...content,
  })) as { record_id: string };
  return created.record_id;
}

/** A draft a coach could plausibly have typed. */
function typedDraft(name: string, days: readonly number[]): PlanDraft {
  const withRow = addMeal({ ...EMPTY_DRAFT, name }, days);
  return updateMeal(withRow, withRow.meals[0].id, {
    time: '08:00', label: 'Breakfast', items: 'Oats\nMilk',
  });
}

/** Every plan of a client's that says it is current, read back from the store itself. */
async function currentPlans(store: LocalStore, clientId: string): Promise<string[]> {
  const page = (await dietPlansForClient(store, clientId, { limit: 50 })) as {
    items: { record_id: string; content: { status: string } }[];
  };
  return page.items.filter((plan) => plan.content.status === 'current').map((plan) => plan.record_id);
}

describe('saving a plan', () => {
  it('writes it, and it is readable back through the real queries', async () => {
    const store = await freshStore();
    const clientId = await addClient(store);

    const stored = await saveNewPlan(store, typedDraft('Week 3', [1, 2, 3]), clientId);
    const plans = await readDietPlans(store, clientId);

    assert.equal(plans.items.length, 1);
    assert.equal(plans.items[0].record_id, stored.record_id);
  });

  it('saves a new plan as a DRAFT, never as the plan they follow now', async () => {
    // Which plan is current is an explicit act. A save that promoted a plan would change what a
    // client is eating as a side effect of somebody typing.
    const store = await freshStore();
    const clientId = await addClient(store);

    const stored = await saveNewPlan(store, typedDraft('Week 3', [1]), clientId);
    const back = (await store.get('diet-plan', stored.record_id)) as { content: { status: string } };

    assert.equal(back.content.status, NEW_PLAN_STATUS);
    assert.deepEqual(await currentPlans(store, clientId), []);
  });

  it('lets the RECORD refuse, with its own issues intact', async () => {
    const store = await freshStore();
    const clientId = await addClient(store);

    // No name. Nothing in this direction checks that; the record does.
    await assert.rejects(
      () => saveNewPlan(store, typedDraft('', [1]), clientId),
      (error: unknown) => {
        const issues = (error as { issues?: { path: string; message: string }[] }).issues;
        assert.ok(Array.isArray(issues), 'the refusal arrived without the record’s own issues');
        // The path arrives as the ENVELOPE nests it — `content.name` — which is why the label in
        // `diet-editor.ts` strips that prefix rather than assuming the record's own bare field name.
        assert.ok(issues.some((issue) => issue.path.endsWith('name')), JSON.stringify(issues));
        assert.ok(issues.every((issue) => issue.message.length > 0));
        return true;
      },
    );

    assert.equal(await store.count('diet-plan'), 0, 'a refused plan was written anyway');
  });

  it('changes an existing plan without touching whether anybody is following it', async () => {
    // He is editing the FOOD. Carrying the screen's idea of the status into the write is how an
    // edit silently demotes the plan a client is actually eating.
    const store = await freshStore();
    const clientId = await addClient(store);
    const planId = await addPlan(store, clientId, { name: 'Week 3', status: 'current' });

    const plans = await readDietPlans(store, clientId);
    const draft = draftFromPlan(plans.items[0]);
    const changed = updateMeal(draft, draft.meals[0].id, { items: 'Oats\nBerries' });

    await saveChangesToPlan(store, planId, changed, clientId);
    const back = (await store.get('diet-plan', planId)) as {
      content: { status: string; days: { entries: { items: string[] }[] }[] };
    };

    assert.equal(back.content.status, 'current', 'editing the food demoted the plan');
    assert.deepEqual(back.content.days[0].entries[0].items, ['Oats', 'Berries']);
  });
});

describe('making a plan current', () => {
  it('demotes the plan they were following, in the same act, and NEVER deletes it', async () => {
    const store = await freshStore();
    const clientId = await addClient(store);
    const oldId = await addPlan(store, clientId, { name: 'Week 2', status: 'current' });
    const newId = await addPlan(store, clientId, { name: 'Week 3', status: 'draft' });

    const plans = await readDietPlans(store, clientId);
    const result = await makePlanCurrent(store, { clientId, planId: newId, plans: plans.items });

    assert.deepEqual(await currentPlans(store, clientId), [newId]);
    assert.deepEqual([...result.demoted], ['Week 2']);
    assert.equal(result.leftWithNoCurrent, false);

    // THE HISTORY IS THE POINT OF THE REPOSITORY. The earlier plan is still here, still readable,
    // still holding its own food, and it now says PAST.
    const old = (await store.get('diet-plan', oldId)) as {
      deleted?: boolean;
      content: { status: string; name: string; days: unknown[] };
    };
    assert.notEqual(old.deleted, true, 'the earlier plan was deleted rather than demoted');
    assert.equal(old.content.status, 'past');
    assert.equal(old.content.name, 'Week 2');
    assert.equal(old.content.days.length, 1, 'the earlier plan lost its food');
  });

  it('never leaves TWO plans marked current, which is the state nothing else would report', async () => {
    const store = await freshStore();
    const clientId = await addClient(store);
    await addPlan(store, clientId, { name: 'Week 2', status: 'current' });
    const newId = await addPlan(store, clientId, { name: 'Week 3', status: 'draft' });

    const plans = await readDietPlans(store, clientId);
    await makePlanCurrent(store, { clientId, planId: newId, plans: plans.items });

    const claimants = await currentPlans(store, clientId);
    assert.equal(claimants.length, 1, `${String(claimants.length)} plans are marked current`);
  });

  it('RESOLVES a contest rather than adding to it', async () => {
    // Two devices, or a plan made current before the old one was marked past. `history.js` refuses
    // to pick a winner and says so; this is the coach picking one, and it must demote BOTH losers.
    const store = await freshStore();
    const clientId = await addClient(store);
    await addPlan(store, clientId, { name: 'Week 1', status: 'current' });
    await addPlan(store, clientId, { name: 'Week 2', status: 'current' });
    const chosen = await addPlan(store, clientId, { name: 'Week 3', status: 'draft' });

    const before = await readDietPlans(store, clientId);
    const contested = projectDietHistory([...before.items], { client_id: clientId }) as {
      current: unknown; contested_current: unknown[];
    };
    assert.equal(contested.current, null, 'the fixture is not actually contested');
    assert.equal(contested.contested_current.length, 2);

    const result = await makePlanCurrent(store, { clientId, planId: chosen, plans: before.items });

    assert.deepEqual(await currentPlans(store, clientId), [chosen]);
    assert.deepEqual([...result.demoted].sort(), ['Week 1', 'Week 2']);
    assert.equal(result.unaddressable, 0);

    // And the projection now agrees, which is what the coach will actually be shown.
    const after = await readDietPlans(store, clientId);
    const settled = projectDietHistory([...after.items], { client_id: clientId }) as {
      current: { plan_id: string } | null; problems: string[];
    };
    assert.equal(settled.current?.plan_id, chosen);
    assert.deepEqual(settled.problems, []);
  });

  it('makes an already-current plan current again without demoting it', async () => {
    const store = await freshStore();
    const clientId = await addClient(store);
    const planId = await addPlan(store, clientId, { name: 'Week 3', status: 'current' });

    const plans = await readDietPlans(store, clientId);
    const result = await makePlanCurrent(store, { clientId, planId, plans: plans.items });

    assert.deepEqual([...result.demoted], []);
    assert.deepEqual(await currentPlans(store, clientId), [planId]);
  });

  it('leaves NO current plan rather than two when the promotion fails', async () => {
    // The order is the safety property. Promote-first would leave two plans current in this window
    // and NOTHING would report it; demote-first leaves none, which `history.js` states in plain
    // words and which pressing the control again puts right.
    const store = await freshStore();
    const clientId = await addClient(store);
    await addPlan(store, clientId, { name: 'Week 2', status: 'current' });

    const plans = await readDietPlans(store, clientId);
    const missing = 'a-plan-that-is-not-there';

    await assert.rejects(
      () => makePlanCurrent(store, { clientId, planId: missing, plans: plans.items }),
      (error: unknown) => {
        const partial = (error as { madeCurrent?: { demoted: string[]; leftWithNoCurrent: boolean } })
          .madeCurrent;
        assert.ok(partial !== undefined, 'the halfway state was swallowed instead of reported');
        assert.equal(partial.leftWithNoCurrent, true);
        assert.deepEqual([...partial.demoted], ['Week 2']);
        return true;
      },
    );

    assert.deepEqual(await currentPlans(store, clientId), [], 'a claimant survived the failure');
    // And nothing was lost: the earlier plan is still readable, as PAST.
    const still = await readDietPlans(store, clientId);
    assert.equal(still.items.length, 1);
  });

  it('touches nobody else’s plans', async () => {
    const store = await freshStore();
    const priya = await addClient(store, 'Priya');
    const anil = await addClient(store, 'Anil');
    const anilsCurrent = await addPlan(store, anil, { name: 'Anil week 1', status: 'current' });
    await addPlan(store, priya, { name: 'Priya week 1', status: 'current' });
    const priyasNew = await addPlan(store, priya, { name: 'Priya week 2', status: 'draft' });

    const plans = await readDietPlans(store, priya);
    await makePlanCurrent(store, { clientId: priya, planId: priyasNew, plans: plans.items });

    assert.deepEqual(await currentPlans(store, anil), [anilsCurrent]);
  });
});
