/**
 * THE EDITOR'S DECISIONS, DRIVEN DIRECTLY — no browser, no rendering, no store.
 *
 * Every claim the editor makes about itself is asserted here rather than through a component,
 * because a static render never runs an effect and a decision inside one is a decision nothing
 * checks. The three moves, the round trip through the record, the sentences that stop a silent loss,
 * and the refusal wording are all reachable as plain functions and are driven as plain functions.
 *
 * ## THE TWO PROPERTIES THIS FILE EXISTS FOR
 *
 * **The round trip is exact.** A plan read into a draft and written back out is the same plan.
 * Anything less is the editor quietly changing a client's food, which nothing downstream could
 * detect — the record would accept it and the chart would draw it.
 *
 * **Nothing the coach typed disappears without being named.** A meal ticked for no day is not
 * saved, so it is said out loud; days the plan is silent about are said out loud. Both are the same
 * failure the importer's `could_not_place` exists to prevent, in the other direction.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { WEEKDAYS } from '../../core/diet/diet.js';
import { validateDietPlan } from '../../core/model/entities/diet-plan.js';
import {
  ADD_MEAL, EMPTY_DRAFT, MAKE_CURRENT_WORDS, addMeal, applyMealAcross, copyDayOnto, describeCopyDay,
  describeEditor, describePlanRefusal, draftFromPlan, foodLines, isBlankMeal, leftWithNoCurrentWords,
  madeCurrentWords, nameOfDay, planContentFromDraft, planFieldLabel, removeMeal, savedPlanWords,
  toggleMealDay, updateMeal,
} from './diet-editor';
import type { PlanDraft } from './diet-editor';

/** A stored plan envelope, the way the store hands one over. */
function stored(days: unknown[], extra: Record<string, unknown> = {}) {
  return {
    record_id: 'plan-1',
    content: {
      client_id: 'client-1',
      name: 'Cutting week',
      status: 'current',
      days,
      ...extra,
    },
  };
}

/** A draft with one meal already in it, ticked for the days given. */
function draftWithMeal(days: readonly number[], overrides: Record<string, string> = {}): PlanDraft {
  const withRow = addMeal(EMPTY_DRAFT, days);
  const id = withRow.meals[0].id;
  return updateMeal(withRow, id, {
    time: '08:00', label: 'Breakfast', items: 'Oats\nMilk', notes: '', ...overrides,
  });
}

describe('the record round trip', () => {
  it('gives back exactly what it was handed', () => {
    const days = [
      { day: 1, entries: [{ time: '08:00', label: 'Breakfast', items: ['Oats', 'Milk'] }] },
      { day: 2, entries: [{ time: '08:00', label: 'Breakfast', items: ['Oats', 'Milk'] }] },
      { day: 5, entries: [{ time: '13:00', items: ['Rice', 'Dal'], notes: 'Small portion' }] },
    ];

    const draft = draftFromPlan(stored(days, { source_note: 'From Meera', notes: 'Week 3' }));
    const back = planContentFromDraft(draft, { clientId: 'client-1', status: 'current' });

    assert.deepEqual(back.days, days);
    assert.equal(back.name, 'Cutting week');
    assert.equal(back.source_note, 'From Meera');
    assert.equal(back.notes, 'Week 3');
  });

  it('collapses the same meal on several days into ONE thing to edit', () => {
    const everyWeekday = WEEKDAYS.slice(0, 5).map((weekday) => ({
      day: weekday.day,
      entries: [{ time: '08:00', label: 'Breakfast', items: ['Oats'] }],
    }));

    const draft = draftFromPlan(stored(everyWeekday));

    // ONE meal, not five. That is the whole reason the editor is shaped this way: he changes the
    // breakfast in one place and all five days change with it.
    assert.equal(draft.meals.length, 1);
    assert.deepEqual([...draft.meals[0].days], [1, 2, 3, 4, 5]);
  });

  it('keeps two identical meals on ONE day as two, rather than quietly losing one', () => {
    // A careless grouping folds these into one and the record accepts the result, so nothing
    // downstream could ever notice: it is a silent edit to what somebody is eating.
    const twice = [{
      day: 1,
      entries: [
        { time: '16:00', items: ['Shake'] },
        { time: '16:00', items: ['Shake'] },
      ],
    }];

    const draft = draftFromPlan(stored(twice));
    assert.equal(draft.meals.length, 2);

    const back = planContentFromDraft(draft, { clientId: 'client-1', status: 'draft' });
    assert.deepEqual(back.days, twice);
  });

  it('writes a day’s entries in TIME order, and a string sort would fail this', () => {
    const draft = updateMeal(
      updateMeal(addMeal(addMeal(EMPTY_DRAFT, [1]), [1]), 'meal-1', { time: '10:00', items: 'Fruit' }),
      'meal-2',
      { time: '9:00', items: 'Eggs' },
    );

    const back = planContentFromDraft(draft, { clientId: 'client-1', status: 'draft' });
    const times = (back.days as { entries: { time: string }[] }[])[0].entries.map((e) => e.time);

    // '9:00' sorts AFTER '10:00' as a string and before it as a time. The wrong answer here looks
    // merely odd rather than broken, which is exactly why it is asserted.
    assert.deepEqual(times, ['9:00', '10:00']);
  });

  it('omits an empty optional field rather than writing it empty', () => {
    const back = planContentFromDraft(draftWithMeal([1]), { clientId: 'c', status: 'draft' });

    assert.ok(!('notes' in back), 'an empty note was written, recording that he answered when he did not');
    assert.ok(!('source_note' in back), 'an empty source note was written');
    const entry = (back.days as { entries: Record<string, unknown>[] }[])[0].entries[0];
    assert.ok(!('notes' in entry), 'an empty meal note was written');
  });

  it('produces something the RECORD itself accepts', () => {
    // Not a shape this file invented: the real validator is asked.
    const content = planContentFromDraft(
      { ...draftWithMeal([1, 2, 3]), name: 'Cutting week' },
      { clientId: '00000000-0000-4000-8000-000000000001', status: 'draft' },
    );
    const result = validateDietPlan(content) as { ok: boolean; issues: unknown[] };
    assert.equal(result.ok, true, JSON.stringify(result.issues));
  });

  it('OFFERS a draft the record will refuse rather than refusing it first', () => {
    // The editor writes no check of its own. A plan with no name is offered, and the RECORD is what
    // says no — in its own sentence, which is then the one the coach reads. A check here would be a
    // second copy of that rule, and the drift would be silent.
    const content = planContentFromDraft(draftWithMeal([1]), { clientId: 'c', status: 'draft' });
    const result = validateDietPlan(content) as { ok: boolean; issues: { path: string }[] };

    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.path === 'name'));
  });

  it('carries an over-long food WHOLE rather than truncating what the nutritionist wrote', () => {
    const long = 'x'.repeat(300);
    const draft = draftWithMeal([1], { items: long });
    const content = planContentFromDraft(draft, { clientId: 'c', status: 'draft' });
    const entry = (content.days as { entries: { items: string[] }[] }[])[0].entries[0];

    assert.equal(entry.items[0], long, 'the editor shortened a food. The RECORD refuses it; this does not.');
  });

  it('drops a blank line from the food, because a blank line is his spacing and not a food', () => {
    assert.deepEqual(foodLines('Oats\n\n  Milk  \n'), ['Oats', 'Milk']);
  });
});

describe('the three moves', () => {
  it('applies one meal across a chosen set of days, and SETS rather than adds', () => {
    const draft = applyMealAcross(draftWithMeal([1, 2, 3]), 'meal-1', [1, 2, 3, 4, 5, 6]);
    assert.deepEqual([...draft.meals[0].days], [1, 2, 3, 4, 5, 6]);

    // "Every day except Sunday" must be reachable. If this added instead of set, no sequence of
    // presses could ever take a day back off.
    const fewer = applyMealAcross(draft, 'meal-1', [1, 2]);
    assert.deepEqual([...fewer.meals[0].days], [1, 2]);
  });

  it('edits a repeated meal in ONE place and every day carrying it changes', () => {
    const draft = updateMeal(draftWithMeal([1, 2, 3, 4, 5]), 'meal-1', { items: 'Oats\nBerries' });
    const content = planContentFromDraft(draft, { clientId: 'c', status: 'draft' });

    for (const day of content.days as { entries: { items: string[] }[] }[]) {
      assert.deepEqual(day.entries[0].items, ['Oats', 'Berries']);
    }
    assert.equal((content.days as unknown[]).length, 5);
  });

  it('copies a day onto other days so those days end up IDENTICAL to it', () => {
    // Monday has a breakfast; Tuesday has a different lunch. After the copy Tuesday must look like
    // Monday and NOT like a merge of the two — a merge leaves the old lunch sitting there with
    // nothing to show the copy did not take.
    const monday = draftWithMeal([1]);
    const both = updateMeal(addMeal(monday, [2]), 'meal-2', { time: '13:00', items: 'Rice' });

    const copied = copyDayOnto(both, 1, [2]);
    const content = planContentFromDraft(copied, { clientId: 'c', status: 'draft' });
    const days = content.days as { day: number; entries: { time: string }[] }[];

    assert.deepEqual(days.map((day) => day.day), [1, 2]);
    assert.deepEqual(days[0].entries.map((e) => e.time), ['08:00']);
    assert.deepEqual(days[1].entries.map((e) => e.time), ['08:00']);
  });

  it('says what copying a day will REPLACE, before he does it', () => {
    const both = updateMeal(addMeal(draftWithMeal([1]), [2]), 'meal-2', { time: '13:00', items: 'Rice' });

    const words = describeCopyDay(both, 1, [2]);
    assert.ok(words !== null);
    assert.ok(words.includes(nameOfDay(1)), 'the sentence does not name the day being copied');
    assert.ok(words.includes(nameOfDay(2)), 'the sentence does not name the day being copied onto');
    assert.match(words, /replaced/u, 'the sentence does not say that what is there will be replaced');
  });

  it('does not threaten to replace a day that has nothing on it', () => {
    const words = describeCopyDay(draftWithMeal([1]), 1, [2]);
    assert.ok(words !== null);
    assert.doesNotMatch(words, /replaced/u);
  });

  it('copying a day onto nothing changes nothing at all', () => {
    const draft = draftWithMeal([1]);
    assert.equal(copyDayOnto(draft, 1, []), draft);
    assert.equal(copyDayOnto(draft, 1, [1]), draft, 'a day was copied onto itself');
    assert.equal(describeCopyDay(draft, 1, [1]), null);
  });

  it('ticks a day on and off', () => {
    const on = toggleMealDay(draftWithMeal([1]), 'meal-1', 6);
    assert.deepEqual([...on.meals[0].days], [1, 6]);
    assert.deepEqual([...toggleMealDay(on, 'meal-1', 1).meals[0].days], [6]);
  });

  it('takes a meal off the plan', () => {
    assert.equal(removeMeal(draftWithMeal([1]), 'meal-1').meals.length, 0);
  });

  it('gives every added meal its own handle, and never stores one', () => {
    const two = addMeal(addMeal(EMPTY_DRAFT), EMPTY_DRAFT.meals.map(() => 1));
    assert.notEqual(two.meals[0].id, two.meals[1].id);

    const content = planContentFromDraft(draftWithMeal([1]), { clientId: 'c', status: 'draft' });
    const entry = (content.days as { entries: Record<string, unknown>[] }[])[0].entries[0];
    assert.ok(!('id' in entry), 'a row handle reached the record, which has no field for one');
  });
});

describe('what the editor says', () => {
  it('names the days the plan is silent about, because an absent day reads as a fast day', () => {
    const report = describeEditor(draftWithMeal([1, 2, 3]), { amending: false });

    assert.ok(report.untouchedWords !== null);
    for (const weekday of WEEKDAYS.slice(3)) {
      assert.ok(
        report.untouchedWords.includes(weekday.name),
        `${weekday.name} is written nowhere on the plan and the editor does not say so`,
      );
    }
    assert.match(report.untouchedWords, /does not say/u);
  });

  it('says nothing about untouched days on a plan that covers the whole week', () => {
    const whole = applyMealAcross(draftWithMeal([1]), 'meal-1', WEEKDAYS.map((day) => day.day));
    assert.equal(describeEditor(whole, { amending: false }).untouchedWords, null);
  });

  it('NAMES a meal that is written and ticked for no day, because it will not be saved', () => {
    // This is the one way this editor could lose food silently, and it is the same failure the
    // importer's `could_not_place` exists to prevent, in the other direction.
    const orphan = draftWithMeal([]);
    const report = describeEditor(orphan, { amending: false });

    assert.ok(report.unplacedWords !== null);
    assert.match(report.unplacedWords, /08:00 Breakfast/u, 'the meal is not quoted back to him');
    assert.match(report.unplacedWords, /will not be saved/u);

    const content = planContentFromDraft(orphan, { clientId: 'c', status: 'draft' });
    assert.deepEqual(content.days, [], 'it was saved after all, onto no day');
  });

  it('says nothing about an unfinished row he has only just added', () => {
    const report = describeEditor(addMeal(EMPTY_DRAFT), { amending: false });
    assert.equal(report.unplacedWords, null, 'a row he has started is reported as lost work');
    assert.ok(isBlankMeal(addMeal(EMPTY_DRAFT).meals[0]));
  });

  it('tells him a meal is repeated BEFORE he edits it', () => {
    const rows = describeEditor(draftWithMeal([1, 2, 3]), { amending: false }).rows;
    assert.ok(rows[0].repeatedWords !== null);
    assert.match(rows[0].repeatedWords, /3 days/u);
    assert.equal(describeEditor(draftWithMeal([1]), { amending: false }).rows[0].repeatedWords, null);
  });

  it('counts what is on the plan so he can check it against the paper', () => {
    const report = describeEditor(draftWithMeal([1, 2, 3]), { amending: false });
    assert.match(report.coverWords, /3 days/u);
    assert.match(report.coverWords, /1 meal\b/u);
  });

  it('names the first move on an editor with nothing in it', () => {
    const report = describeEditor(EMPTY_DRAFT, { amending: false });
    assert.ok(report.emptyWords !== null);
    assert.match(report.emptyWords, /Add a meal/u);
    assert.equal(ADD_MEAL, 'Add a meal', 'the sentence and the control no longer agree');
  });

  it('draws the days from the ONE table and every one of them', () => {
    assert.deepEqual(
      describeEditor(EMPTY_DRAFT, { amending: false }).days.map((day) => day.day),
      WEEKDAYS.map((day) => day.day),
    );
  });

  it('orders the rows by TIME, so a row added later lands where it belongs', () => {
    const later = updateMeal(addMeal(draftWithMeal([1]), [1]), 'meal-2', { time: '07:00', items: 'Tea' });
    const rows = describeEditor(later, { amending: false }).rows;
    assert.deepEqual(rows.map((row) => row.time), ['07:00', '08:00']);
  });

  it('puts a row with no time yet at the end, where a row he has just added belongs', () => {
    const rows = describeEditor(addMeal(draftWithMeal([1])), { amending: false }).rows;
    assert.deepEqual(rows.map((row) => row.time), ['08:00', '']);
  });
});

describe('making a plan current, in words', () => {
  it('says the earlier plan is KEPT, because the history is the point of the repository', () => {
    assert.match(MAKE_CURRENT_WORDS, /Nothing is deleted/u);
    assert.match(MAKE_CURRENT_WORDS, /only one plan is ever the current one/u);
  });

  it('names what was demoted rather than only what was promoted', () => {
    const words = madeCurrentWords({
      promoted: 'Week 4', demoted: ['Week 3'], unaddressable: 0, leftWithNoCurrent: false,
    });
    assert.match(words, /"Week 4" is the plan they follow now/u);
    assert.match(words, /"Week 3"/u);
    assert.match(words, /still on their history/u);
  });

  it('NEVER stays silent about a claimant it could not change', () => {
    // A plan still marked current that nothing said anything about is the invisible two-current
    // state, which the limit-one read then resolves by picking whichever it reaches first.
    const words = madeCurrentWords({
      promoted: 'Week 4', demoted: [], unaddressable: 1, leftWithNoCurrent: false,
    });
    assert.match(words, /still marked current/u);
  });

  it('says plainly when the demotion landed and the promotion did not', () => {
    const words = leftWithNoCurrentWords(['Week 3']);
    assert.match(words, /nothing is marked as the plan they/u);
    assert.match(words, /Nothing was deleted/u);
    assert.match(words, /Press it again/u);
  });

  it('claims nothing more than a save when a plan is saved', () => {
    assert.equal(savedPlanWords('Week 4'), '"Week 4" is saved on this device.');
  });
});

describe('when the record refuses', () => {
  /** A refusal shaped as `StoreValidationError` carries one. */
  function refusal(issues: { path: string; code: string; message: string }[]) {
    return Object.assign(new Error('That diet plan is not valid.'), { issues });
  }

  it('carries the record’s own sentence through UNCHANGED', () => {
    const sentence = 'Use a 24-hour time such as 08:30.';
    const report = describePlanRefusal(refusal([
      { path: 'content.days[0].entries[0].time', code: 'pattern', message: sentence },
    ]));

    assert.equal(report.fields[0].message, sentence, 'the record’s sentence was reworded');
    assert.equal(report.fields.length, 1);
  });

  it('names the day and the meal he was typing in, rather than a machine’s path', () => {
    const content = planContentFromDraft(draftWithMeal([3]), { clientId: 'c', status: 'draft' });
    const report = describePlanRefusal(
      refusal([{ path: 'content.days[0].entries[0].time', code: 'pattern', message: 'no' }]),
      content,
    );

    assert.equal(report.fields[0].label, `${nameOfDay(3)}, the meal at 08:00, the time`);
  });

  it('shows a path it has no word for AS THE RECORD NAMED IT rather than swallowing it', () => {
    assert.equal(planFieldLabel('content.something_new'), 'content.something_new');
    assert.equal(planFieldLabel('content.name'), 'Plan name');
  });

  it('falls back to the failure’s own words when it carried no issues', () => {
    const report = describePlanRefusal(new TypeError('the store would not open'));
    assert.deepEqual(report.fields, []);
    assert.equal(report.verbatim, 'TypeError: the store would not open');
  });
});

describe('nothing on this surface is gated', () => {
  it('says no word about a passphrase, a lock or sensitivity anywhere it speaks', () => {
    // A diet plan is a food chart, and the failure this guards is a later author adding a lock the
    // coach has to fight while a client waits for their chart. Every sentence this module can
    // produce is swept, not a chosen few.
    const draft = draftWithMeal([]);
    const everything = [
      MAKE_CURRENT_WORDS,
      savedPlanWords('Week 4'),
      leftWithNoCurrentWords(['Week 3']),
      madeCurrentWords({ promoted: 'a', demoted: ['b'], unaddressable: 1, leftWithNoCurrent: false }),
      describeCopyDay(draft, 1, [2]) ?? '',
      ...Object.values(describeEditor(draft, { amending: false })).flatMap((value) => {
        if (typeof value === 'string') return [value];
        if (Array.isArray(value)) return value.map((entry) => JSON.stringify(entry));
        return [];
      }),
    ];

    assert.ok(everything.length > 8, 'the sweep found almost nothing to read, so it proves nothing');
    for (const words of everything) {
      for (const banned of ['passphrase', 'password', 'unlock', 'locked', 'sensitive', 'encrypt']) {
        assert.ok(
          !words.toLowerCase().includes(banned),
          `the editor says "${banned}" in: ${words}`,
        );
      }
    }
  });
});
