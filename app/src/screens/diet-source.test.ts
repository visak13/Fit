/**
 * THE DIET SCREEN'S READS, DRIVEN AGAINST A REAL STORE.
 *
 * Nothing here is a stub. Every test opens the core's own in-process database — the same one the
 * store's gate runs on — writes real client and diet-plan records through the real schema, and asks
 * the real queries. A suite satisfied by a shape would pass just as happily against a mock that had
 * quietly stopped agreeing with the record model, which is the failure a screen cannot see from the
 * inside.
 *
 * ## THE PROPERTY THAT MATTERS MOST HERE
 *
 * **One client's plans never appear under another client's name.** The coach taps down a list of
 * people, and the read for the person he tapped a moment ago can resolve after the read for the
 * person he tapped now. That is proven by reading back from a store holding two clients' plans, and
 * by driving the cancel — not by reading the code that was supposed to do it.
 *
 * ## AND THE ONE THIS FILE EXISTS TO KEEP HONEST
 *
 * `readDietPlans` reads a client's plans WHOLE and lets `core/diet/history.js` decide which is
 * current. The cheaper-looking `dietPlanForClient` would ask the index for one row and get whichever
 * it reached first when two plans are both marked current — which is exactly the case the projection
 * refuses to resolve silently. The last test here writes that case into a real store and proves the
 * screen shows both rather than one.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { openLocalStore } from '../../core/store/store.js';
import { createLaptop } from '../../core/store/testing/platform-double.js';
import { describeDiet, describePicker } from './diet';
import { NOTHING_READ } from './diet';
import {
  DIET_CLIENT_PAGE_LIMIT, DIET_PLAN_PAGE_LIMIT, readDietClients, readDietPlans, readDietPlansInto,
} from './diet-source';
import type { LocalStore } from '../../core/store/store.js';

/** Every store opened here, closed at the end so no test leaves a database open behind it. */
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

/** A client, through the real schema. */
async function addClient(store: LocalStore, name: string): Promise<string> {
  const created = (await store.create('client', {
    name,
    notes: '',
    active: true,
  })) as { record_id: string };
  return created.record_id;
}

/** A diet plan, through the real schema — so the record's own validation is what accepted it. */
async function addPlan(
  store: LocalStore,
  clientId: string,
  content: Record<string, unknown>,
): Promise<string> {
  const created = (await store.create('diet-plan', {
    client_id: clientId,
    days: [{ day: 1, entries: [{ time: '09:00', label: 'Breakfast', items: ['Oats'] }] }],
    ...content,
  })) as { record_id: string };
  return created.record_id;
}

describe('the picker’s read', () => {
  it('offers the people on the register, by name and identity', async () => {
    const store = await freshStore();
    await addClient(store, 'Priya');
    await addClient(store, 'Anil');

    const choices = await readDietClients(store);

    assert.deepEqual([...choices.items].map((client) => client.name).sort(), ['Anil', 'Priya']);
    for (const client of choices.items) assert.ok(client.recordId.length > 0);
    assert.equal(choices.done, true);
  });

  it('leaves out somebody he has archived, rather than undoing the archiving', async () => {
    const store = await freshStore();
    await addClient(store, 'Priya');
    const putAway = await addClient(store, 'Someone he stopped training');
    const { archiveClient } = await import('../../core/store/store.js');
    await archiveClient(store, putAway);

    const choices = await readDietClients(store);
    assert.deepEqual(choices.items.map((client) => client.name), ['Priya']);
  });

  it('reads a page, and says so when it is not the whole register', async () => {
    const store = await freshStore();
    for (let at = 0; at <= DIET_CLIENT_PAGE_LIMIT; at += 1) {
      // eslint-disable-next-line no-await-in-loop
      await addClient(store, `Person ${String(at).padStart(3, '0')}`);
    }

    const choices = await readDietClients(store);

    assert.equal(choices.items.length, DIET_CLIENT_PAGE_LIMIT);
    assert.equal(choices.done, false);
    // And the screen says it, rather than presenting twenty-five as the whole register.
    const picker = describePicker({ ...NOTHING_READ, clients: choices.items, clientsComplete: choices.done });
    assert.ok(picker.moreWords !== null);
  });

  it('welcomes a coach with nobody on his register rather than failing', async () => {
    const store = await freshStore();
    const choices = await readDietClients(store);

    assert.deepEqual([...choices.items], []);
    assert.equal(describePicker({ ...NOTHING_READ, clients: choices.items }).empty, true);
  });
});

describe('one client’s plans', () => {
  it('come back whole — current, past and draft — as the store holds them', async () => {
    const store = await freshStore();
    const priya = await addClient(store, 'Priya');

    await addPlan(store, priya, { name: 'March chart', status: 'current' });
    await addPlan(store, priya, { name: 'February chart', status: 'past', effective_to: '2026-02-28' });
    await addPlan(store, priya, { name: 'April, unfinished', status: 'draft' });

    const plans = await readDietPlans(store, priya);

    assert.equal(plans.items.length, 3);
    assert.equal(plans.done, true);

    // And the screen makes the same three things of them that the projection does.
    const report = describeDiet({
      ...NOTHING_READ,
      clientId: priya,
      clientName: 'Priya',
      plans: plans.items,
      plansComplete: plans.done,
    });
    assert.ok(report.chart !== null);
    assert.equal(report.chart.title, 'March chart');
    assert.deepEqual(report.history.map((entry) => entry.statusWord), ['Past', 'Draft']);
  });

  it('are this client’s and nobody else’s', async () => {
    const store = await freshStore();
    const priya = await addClient(store, 'Priya');
    const anil = await addClient(store, 'Anil');

    await addPlan(store, priya, { name: 'Priya’s chart', status: 'current' });
    await addPlan(store, anil, { name: 'Anil’s chart', status: 'current' });

    const plans = await readDietPlans(store, priya);
    const report = describeDiet({
      ...NOTHING_READ, clientId: priya, clientName: 'Priya', plans: plans.items,
    });

    assert.equal(plans.items.length, 1);
    assert.ok(report.chart !== null);
    assert.equal(report.chart.title, 'Priya’s chart');
    // Nothing about the other client reached this screen at all, so there is nothing to filter out.
    assert.deepEqual([...report.problems], []);
  });

  it('is a real, empty answer for a client who has none yet', async () => {
    const store = await freshStore();
    const anil = await addClient(store, 'Anil');

    const plans = await readDietPlans(store, anil);

    assert.deepEqual([...plans.items], []);
    const report = describeDiet({ ...NOTHING_READ, clientId: anil, clientName: 'Anil', plans: plans.items });
    assert.equal(report.noPlanYet, true);
  });

  it('does not carry a plan the coach deleted back to him', async () => {
    const store = await freshStore();
    const priya = await addClient(store, 'Priya');
    const gone = await addPlan(store, priya, { name: 'Deleted chart', status: 'past' });
    await addPlan(store, priya, { name: 'March chart', status: 'current' });

    // A deletion in this application is a TOMBSTONE, not a row removed: the notice has to reach the
    // other device. `core/diet/plan.js` skips one, and the query excludes it — both, deliberately.
    await store.tombstone('diet-plan', gone);

    const plans = await readDietPlans(store, priya);
    assert.deepEqual(
      plans.items.map((plan) => (plan as unknown as { content: { name: string } }).content.name),
      ['March chart'],
    );
  });

  it('reads a page, and reports a history that stopped short as possibly incomplete', async () => {
    const store = await freshStore();
    const priya = await addClient(store, 'Priya');
    for (let at = 0; at <= DIET_PLAN_PAGE_LIMIT; at += 1) {
      // eslint-disable-next-line no-await-in-loop
      await addPlan(store, priya, { name: `Chart ${String(at).padStart(3, '0')}`, status: 'past' });
    }

    const plans = await readDietPlans(store, priya);

    assert.equal(plans.items.length, DIET_PLAN_PAGE_LIMIT);
    assert.equal(plans.done, false);
    const report = describeDiet({
      ...NOTHING_READ, clientId: priya, plans: plans.items, plansComplete: plans.done,
    });
    assert.ok(report.historyIncomplete !== null);
  });
});

describe('a read that arrives after the coach has moved on', () => {
  it('is dropped, so the wrong diet never lands under the right name', async () => {
    const store = await freshStore();
    const priya = await addClient(store, 'Priya');
    await addPlan(store, priya, { name: 'March chart', status: 'current' });

    let published = 0;
    const cancel = readDietPlansInto(store, priya, () => {
      published += 1;
    });
    cancel();

    // Give the read every chance to resolve into a caller that has gone.
    await readDietPlans(store, priya);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    assert.equal(published, 0, 'a cancelled read still published, so a stale answer can reach the screen');
  });

  it('publishes when it has not been cancelled, so the guard above is not vacuous', async () => {
    const store = await freshStore();
    const priya = await addClient(store, 'Priya');
    await addPlan(store, priya, { name: 'March chart', status: 'current' });

    const published = await new Promise<number>((resolve) => {
      readDietPlansInto(store, priya, (plans) => resolve(plans.items.length));
    });

    assert.equal(published, 1);
  });
});

describe('two plans both marked current, in a real store', () => {
  it('are both shown, because the index would have handed back only one of them', async () => {
    const store = await freshStore();
    const priya = await addClient(store, 'Priya');
    await addPlan(store, priya, { name: 'March chart', status: 'current' });
    await addPlan(store, priya, { name: 'April chart', status: 'current' });

    const plans = await readDietPlans(store, priya);
    const report = describeDiet({
      ...NOTHING_READ, clientId: priya, clientName: 'Priya', plans: plans.items,
    });

    assert.equal(plans.items.length, 2, 'the read collapsed two current plans into one');
    assert.equal(report.chart, null, 'a winner was picked between two plans the coach must resolve');
    assert.equal(report.problems.length, 1);
    assert.match(report.problems[0], /March chart/u);
    assert.match(report.problems[0], /April chart/u);
  });
});
