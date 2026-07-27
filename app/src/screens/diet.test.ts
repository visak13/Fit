/**
 * WHAT THE DIET SCREEN SAYS, DRIVEN DIRECTLY.
 *
 * Every one of these asserts a judgement `diet.ts` makes, with no browser, no rendering and no
 * store. That is the whole reason the judgements are not in the component: a static render never
 * runs an effect, and a decision taken inside one is a decision nothing can put a question to.
 *
 * ## THE FOUR THAT WOULD COST THE COACH SOMETHING
 *
 * 1. **A contested current plan draws NO chart.** Two plans marked current is ordinary — two
 *    devices, or a new plan made current before the old was marked past. Picking one silently is the
 *    one thing `core/diet/history.js` refuses, because he would be shown one plan, act on it, and
 *    never learn the other existed. This suite proves the screen honours that refusal rather than
 *    quietly reaching past it for something to draw.
 * 2. **A time sorts as a TIME.** `9:00` before `10:00`, which is the opposite of the string order.
 *    Asserted HERE as well as in the core's own suite, on purpose: the failure being guarded against
 *    is this screen re-sorting what the projection already ordered, and a passing core suite says
 *    nothing about that.
 * 3. **A short plan is not padded, and its silence is said out loud.** Five columns for a five-day
 *    plan, and the two days it says nothing about NAMED — because an absent column reads as "nothing
 *    on Saturday" just as easily as an empty one does.
 * 4. **A client with no plan yet is a state, not an error.** Every field present and worded, so the
 *    screen cannot render half an answer.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { WEEKDAYS } from '../../core/diet/diet.js';
import {
  BACK_TO_CURRENT, CHOOSE_SOMEBODY, DIET_CLIENT_KEY, DIET_PLAN_KEY, HISTORY_INCOMPLETE,
  NOBODY_TO_CHOOSE, NOTHING_READ, REPEATS_WORDS, chooseClientLabel, describeDiet, describePicker,
  dietForClient, dietForPlan, noPlanWords, shortWeekWords,
} from './diet';
import type { DietPlanRecord, DietReading } from './diet';

/** A stored plan, in the envelope shape the store hands over. */
function plan(
  recordId: string,
  content: Record<string, unknown>,
): DietPlanRecord {
  return { record_id: recordId, content } as unknown as DietPlanRecord;
}

const PRIYA = 'client-priya';

/** The plan she follows now: three days, breakfast and lunch, and one day with a second snack. */
const CURRENT = plan('plan-current', {
  client_id: PRIYA,
  name: 'March chart',
  status: 'current',
  effective_from: '2026-03-01',
  days: [
    {
      day: 2,
      entries: [
        { time: '10:00', label: 'Mid-morning', items: ['Banana'] },
        { time: '9:00', label: 'Breakfast', items: ['Oats', 'Milk'] },
      ],
    },
    { day: 1, entries: [{ time: '9:00', label: 'Breakfast', items: ['Eggs'] }] },
  ],
});

const PAST = plan('plan-past', {
  client_id: PRIYA,
  name: 'February chart',
  status: 'past',
  effective_from: '2026-02-01',
  effective_to: '2026-02-28',
  days: [{ day: 1, entries: [{ time: '08:00', items: ['Toast'] }] }],
});

const DRAFT = plan('plan-draft', {
  client_id: PRIYA,
  name: 'April, not finished',
  status: 'draft',
  days: [{ day: 3, entries: [{ time: '13:00', items: ['Rice'] }] }],
});

/** A reading with these plans for Priya, and whatever else the case needs. */
function reading(overrides: Partial<DietReading> = {}): DietReading {
  return {
    ...NOTHING_READ,
    clients: [{ recordId: PRIYA, name: 'Priya' }],
    clientId: PRIYA,
    clientName: 'Priya',
    plans: [CURRENT, PAST, DRAFT],
    ...overrides,
  };
}

describe('the address', () => {
  it('carries an identity and never a name', () => {
    assert.equal(dietForClient(PRIYA), `/diet?${DIET_CLIENT_KEY}=${PRIYA}`);
    assert.equal(
      dietForPlan(PRIYA, 'plan-past'),
      `/diet?${DIET_CLIENT_KEY}=${PRIYA}&${DIET_PLAN_KEY}=plan-past`,
    );

    // An address is bookmarked, restored from a home screen and read over somebody's shoulder. A
    // client's name in it would be the one piece of their data this application put somewhere it did
    // not have to — the rule `circular-navigation.ts` states for the two loops it owns.
    assert.ok(!dietForClient(PRIYA).includes('Priya'));
    assert.ok(!dietForPlan(PRIYA, 'plan-past').includes('Priya'));
  });

  it('escapes an identity rather than trusting it to be address-safe', () => {
    assert.equal(dietForClient('a b&c'), `/diet?${DIET_CLIENT_KEY}=a%20b%26c`);
  });
});

describe('the picker', () => {
  it('welcomes a coach who has nobody on his register instead of showing him a blank', () => {
    const report = describePicker(NOTHING_READ);

    assert.equal(report.empty, true);
    assert.equal(report.intro, NOBODY_TO_CHOOSE);
    // It names the way onward. An empty screen that reads as a fault on the very first visit teaches
    // him that this application complains at him.
    assert.match(report.intro, /Clients/u);
    assert.deepEqual([...report.items], []);
  });

  it('asks him to choose somebody, and says how the plan will be laid out', () => {
    const report = describePicker(reading({ clientId: null }));

    assert.equal(report.empty, false);
    assert.equal(report.intro, CHOOSE_SOMEBODY);
    assert.equal(report.chosenId, null);
  });

  it('marks who is showing, and says a paged register is not the whole of it', () => {
    const report = describePicker(reading({ clientsComplete: false }));

    assert.equal(report.chosenId, PRIYA);
    assert.ok(report.moreWords !== null);
    assert.match(report.moreWords, /more people/u);
  });

  it('names the person in the words a screen reader announces', () => {
    // Forty rows announcing one identical sentence is forty controls told apart by counting.
    assert.equal(chooseClientLabel('Priya'), 'Show the diet for Priya');
    assert.notEqual(chooseClientLabel('Priya'), chooseClientLabel('Rekha'));
  });
});

describe('before anybody is chosen', () => {
  it('says nothing about any client at all, rather than half an answer', () => {
    for (const clientId of [null, '', '   ']) {
      const report = describeDiet(reading({ clientId }));
      assert.equal(report.chosen, false, `chose somebody for ${JSON.stringify(clientId)}`);
      assert.equal(report.chart, null);
      assert.equal(report.noPlanYet, false);
      assert.deepEqual([...report.history], []);
    }
  });
});

describe('a client with no plan yet', () => {
  it('is a state and not an error, worded in full', () => {
    const report = describeDiet(reading({ plans: [] }));

    assert.equal(report.chosen, true);
    assert.equal(report.noPlanYet, true);
    assert.ok(report.noPlanWords !== null);
    assert.match(report.noPlanWords, /Priya has no diet plan yet/u);
    assert.equal(report.chart, null);
    // The projection's own sentence for it, not a second version written here.
    assert.equal(report.statement, 'No diet plan yet.');
  });

  it('says it without a name when the picker has not answered yet', () => {
    const report = describeDiet(reading({ plans: [], clientName: null }));
    assert.match(report.noPlanWords ?? '', /^This client has no diet plan yet/u);
  });

  it('never claims a name it was not given', () => {
    assert.match(noPlanWords(null), /^This client/u);
    assert.match(noPlanWords('Anil'), /^Anil/u);
  });
});

describe('the plan they follow now', () => {
  it('is the one the record marks current, and the chart is captioned as such', () => {
    const report = describeDiet(reading());

    assert.ok(report.chart !== null);
    assert.equal(report.chart.plan_id, 'plan-current');
    assert.equal(report.showingEarlier, false);
    assert.match(report.chartCaption ?? '', /March chart — the plan they follow now/u);
    assert.equal(report.repeatsWords, REPEATS_WORDS);
  });

  it('says the week REPEATS and puts no date on the screen', () => {
    const report = describeDiet(reading());

    assert.ok(report.chart !== null);
    assert.equal(report.chart.repeats, true);
    // The record holds `effective_from`, and it is ordered by and never drawn: a grid with Monday at
    // the left is exactly what a dated week looks like.
    assert.ok(!(report.repeatsWords ?? '').includes('2026'));
    assert.ok(!(report.chartCaption ?? '').includes('2026'));
  });

  it('orders the rows as TIMES, which is the opposite of their string order', () => {
    const report = describeDiet(reading());

    assert.ok(report.chart !== null);
    // '10:00' < '9:00' as text. If this screen ever re-sorted what the projection ordered, breakfast
    // would appear after the mid-morning snack and nothing would error.
    assert.deepEqual(report.chart.rows.map((row) => row.time), ['9:00', '10:00']);
  });

  it('gives every row one cell per day, so no meal lands under the wrong name', () => {
    const report = describeDiet(reading());

    assert.ok(report.chart !== null);
    for (const row of report.chart.rows) {
      assert.equal(row.cells.length, report.chart.days.length);
      assert.deepEqual(
        row.cells.map((cell) => cell.day),
        report.chart.days.map((day) => day.day),
      );
    }

    // Monday has nothing at 10:00, and that is an EMPTY cell rather than a missing one.
    const midMorning = report.chart.rows.find((row) => row.time === '10:00');
    assert.ok(midMorning !== undefined);
    assert.equal(midMorning.cells[0].empty, true);
    assert.equal(midMorning.cells[0].text, '');
  });

  it('takes its column headings from the one shared weekday table', () => {
    const report = describeDiet(reading());

    assert.ok(report.chart !== null);
    // Monday then Tuesday, by NUMBER, from `core/diet/week.js`. A private table in this direction is
    // how the coach imports into Tuesday and reads it under Wednesday with nothing erroring.
    assert.deepEqual(report.chart.days.map((day) => day.day), [1, 2]);
    for (const day of report.chart.days) {
      const shared = WEEKDAYS.find((weekday) => weekday.day === day.day);
      assert.ok(shared !== undefined);
      assert.equal(day.name, shared.name);
      assert.equal(day.short_name, shared.short_name);
    }
  });
});

describe('a plan whose days do not fill the week', () => {
  it('names what the plan says nothing about, and says the plan does not SAY', () => {
    const report = describeDiet(reading());

    assert.ok(report.chart !== null);
    assert.equal(report.chart.is_full_week, false);
    assert.equal(report.chart.days.length, 2);

    const words = report.shortWeekWords;
    assert.ok(words !== null);
    // Every one of the five it is silent about, by name, from the shared table.
    for (const day of ['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      assert.match(words, new RegExp(day, 'u'));
    }
    // AND the distinction that stops it being a lie: an unwritten day is not a fast day.
    assert.match(words, /does not say, not that nothing is eaten/u);
  });

  it('says nothing at all about a plan that holds all seven days', () => {
    const sevenDays = plan('plan-seven', {
      client_id: PRIYA,
      name: 'Full week',
      status: 'current',
      days: WEEKDAYS.map((weekday) => ({
        day: weekday.day,
        entries: [{ time: '09:00', items: ['Oats'] }],
      })),
    });

    const report = describeDiet(reading({ plans: [sevenDays] }));
    assert.ok(report.chart !== null);
    assert.equal(report.chart.is_full_week, true);
    assert.equal(report.shortWeekWords, null);
  });

  it('is silent for a full week and speaks for a short one, asked directly', () => {
    assert.equal(shortWeekWords({ is_full_week: true, missing_days: [] }), null);
    assert.match(
      shortWeekWords({ is_full_week: false, missing_days: [{ name: 'Sunday' }] }) ?? '',
      /There is nothing written for Sunday/u,
    );
    assert.match(
      shortWeekWords({ is_full_week: false, missing_days: [{ name: 'Saturday' }, { name: 'Sunday' }] }) ?? '',
      /There is nothing written for Saturday and Sunday/u,
    );
  });
});

describe('the earlier plans', () => {
  it('are reachable, with the record’s own status on each row', () => {
    const report = describeDiet(reading());

    assert.deepEqual(
      report.history.map((entry) => [entry.planId, entry.statusWord]),
      [['plan-past', 'Past'], ['plan-draft', 'Draft']],
    );
    // The projection's own one-line summary of what a plan covered, carried through unchanged.
    assert.match(report.history[0].covers, /Mon/u);
  });

  it('draws the one he asked for, and says plainly it is not what they follow now', () => {
    const report = describeDiet(reading({ showing: 'plan-past' }));

    assert.ok(report.chart !== null);
    assert.equal(report.chart.plan_id, 'plan-past');
    assert.equal(report.showingEarlier, true);
    assert.match(report.chartCaption ?? '', /an earlier plan\. This is not what they are following now/u);
    // And the way back exists as words rather than as a thing he has to know.
    assert.match(BACK_TO_CURRENT, /follow now/u);
  });

  it('marks the plan being drawn rather than dropping its row from the list', () => {
    const report = describeDiet(reading({ showing: 'plan-past' }));

    assert.equal(report.history.length, 2, 'the list lost a row when he opened one of them');
    assert.deepEqual(
      report.history.map((entry) => entry.showing),
      [true, false],
    );
  });

  it('falls back to the current plan when the address names one he no longer has', () => {
    const report = describeDiet(reading({ showing: 'plan-that-was-deleted' }));

    assert.ok(report.chart !== null);
    assert.equal(report.chart.plan_id, 'plan-current');
    assert.equal(report.showingEarlier, false);
  });

  it('says so when the history could not be read whole', () => {
    const report = describeDiet(reading({ plansComplete: false }));
    assert.equal(report.historyIncomplete, HISTORY_INCOMPLETE);
    assert.match(report.historyIncomplete ?? '', /may not be all of them/u);
  });
});

describe('two plans both marked current', () => {
  const secondCurrent = plan('plan-also-current', {
    client_id: PRIYA,
    name: 'April chart',
    status: 'current',
    days: [{ day: 5, entries: [{ time: '09:00', items: ['Poha'] }] }],
  });

  it('draws NO chart, because choosing between them is not this application’s to do', () => {
    const report = describeDiet(reading({ plans: [CURRENT, secondCurrent] }));

    assert.equal(report.chart, null, 'a claimant was drawn, so one of the two is now invisible');
    assert.equal(report.chartCaption, null);
  });

  it('names both claimants in the projection’s own words and tells him what to do', () => {
    const report = describeDiet(reading({ plans: [CURRENT, secondCurrent] }));

    assert.equal(report.problems.length, 1);
    assert.match(report.problems[0], /2 plans are all marked current/u);
    assert.match(report.problems[0], /"March chart"/u);
    assert.match(report.problems[0], /"April chart"/u);
    assert.match(report.problems[0], /will not choose between them/u);
  });

  it('still shows him the one he asks for by identity, so neither is unreachable', () => {
    const report = describeDiet(reading({ plans: [CURRENT, secondCurrent], showing: 'plan-also-current' }));

    assert.ok(report.chart !== null);
    assert.equal(report.chart.plan_id, 'plan-also-current');
    // And it is still not called the plan they follow now, because nothing has established that.
    assert.match(report.chartCaption ?? '', /an earlier plan/u);
    assert.equal(report.problems.length, 1, 'the contested-current problem stopped being reported');
  });
});

describe('a plan belonging to somebody else', () => {
  it('is kept out of the chart and named as a problem, never shown under this client', () => {
    const someoneElse = plan('plan-stray', {
      client_id: 'client-rekha',
      name: 'Rekha’s chart',
      status: 'current',
      days: [{ day: 1, entries: [{ time: '09:00', items: ['Idli'] }] }],
    });

    const report = describeDiet(reading({ plans: [PAST, someoneElse] }));

    assert.equal(report.chart, null, 'another client’s plan was drawn as this client’s current one');
    assert.ok(report.problems.some((problem) => /different client/u.test(problem)));
    assert.deepEqual(report.history.map((entry) => entry.planId), ['plan-past']);
  });
});

describe('a plan with nothing in it', () => {
  it('says it is empty rather than drawing an empty grid', () => {
    const empty = plan('plan-empty', {
      client_id: PRIYA,
      name: 'Started, nothing in it',
      status: 'current',
      days: [],
    });

    const report = describeDiet(reading({ plans: [empty] }));

    assert.ok(report.chart !== null);
    assert.equal(report.chart.is_empty, true);
    assert.ok(report.emptyChartWords !== null);
    assert.match(report.emptyChartWords, /no meals written in it yet/u);
  });
});

describe('nothing on this screen is gated', () => {
  it('says no word about a passphrase, a lock or sensitivity anywhere it speaks', () => {
    // A diet plan is a food chart. The decision is recorded on the record itself, and the failure
    // this guards is a later author adding a lock the coach has to fight while a client waits for
    // their chart. Every sentence this module can produce is swept, not a chosen few.
    const everything = [
      CHOOSE_SOMEBODY, NOBODY_TO_CHOOSE, REPEATS_WORDS, HISTORY_INCOMPLETE, BACK_TO_CURRENT,
      noPlanWords('Priya'),
      ...Object.values(describeDiet(reading())).flatMap((value) => {
        if (typeof value === 'string') return [value];
        if (Array.isArray(value)) return value.map((entry) => JSON.stringify(entry));
        return [];
      }),
    ];

    assert.ok(everything.length > 8, 'the sweep found almost nothing to read, so it proves nothing');
    for (const words of everything) {
      for (const forbidden of ['passphrase', 'password', 'unlock', 'locked', 'sensitive', 'encrypt']) {
        assert.ok(
          !words.toLowerCase().includes(forbidden),
          `"${forbidden}" appears in the diet screen's words: ${words}`,
        );
      }
    }
  });
});
