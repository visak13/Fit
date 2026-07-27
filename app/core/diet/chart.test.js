/**
 * THE WEEK CHART — the four judgements, each tested by the case that would break it.
 *
 * Every test here is written so the wrong-but-plausible implementation fails it. Sorting as strings,
 * building rows per day instead of across the week, omitting a cell instead of emptying it, and
 * padding a short plan out to seven columns all produce a chart that looks entirely reasonable, so
 * "it rendered" is worth nothing as evidence and none of these assert it.
 *
 * The fixtures are proved against the record's OWN validator first, so nothing below is a projection
 * verified against a plan the record would refuse.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { validateDietPlan } from '../model/entities/diet-plan.js';
import { readTable } from '../export/export.js';
import { chartTable, projectWeekChart } from './chart.js';
import { CLIENT_A, PLAN_1, aDay, aDietPlan, aStoredDietPlan, anEntry } from './testing.js';

test('THE FIXTURES ARE VALID RECORDS, and the check that says so is armed', () => {
  assert.equal(validateDietPlan(aDietPlan()).ok, true);
  assert.equal(validateDietPlan(aStoredDietPlan().content).ok, true);
  assert.equal(validateDietPlan(aDietPlan({ days: fullWeek() })).ok, true);

  // Non-vacuity: the same validator refuses a plan that breaks a rule, so `ok` above means something.
  assert.equal(validateDietPlan(aDietPlan({ days: [aDay(9)] })).ok, false);
  assert.equal(validateDietPlan(aDietPlan({ status: 'archived' })).ok, false);
});

test('an envelope and a bare plan project identically, except for the identity only one has', () => {
  const fromEnvelope = projectWeekChart(aStoredDietPlan());
  const fromBare = projectWeekChart(aDietPlan());

  assert.equal(fromEnvelope.plan_id, PLAN_1);
  assert.equal(fromBare.plan_id, null);
  assert.deepEqual({ ...fromEnvelope, plan_id: null }, fromBare);
});

test('the chart carries the plan\'s own identity and title', () => {
  const chart = projectWeekChart(aStoredDietPlan());

  assert.equal(chart.title, 'Test Cutting Plan');
  assert.equal(chart.client_id, CLIENT_A);
  assert.equal(chart.status, 'current');
});

// ── 1. times sort as TIMES ────────────────────────────────────────────────────────────────────────

test('ROWS ARE IN TIME ORDER, in the case where string order disagrees', () => {
  const chart = projectWeekChart(aDietPlan({
    days: [aDay(1, [
      anEntry({ time: '13:00' }),
      anEntry({ time: '08:00' }),
      anEntry({ time: '09:00' }),
      anEntry({ time: '10:30' }),
    ])],
  }));

  assert.deepEqual(chart.rows.map((row) => row.time), ['08:00', '09:00', '10:30', '13:00']);

  // Non-vacuity: sorted as strings, '13:00' comes before that day's morning. If this ever stops
  // being true the assertion above has stopped being a test of anything.
  assert.deepEqual(['13:00', '08:00', '09:00', '10:30'].sort(), ['08:00', '09:00', '10:30', '13:00']);
  assert.deepEqual(['13:00', '9:00', '08:00'].sort(), ['08:00', '13:00', '9:00']);
});

test('each row reports its own minutes since midnight, ascending', () => {
  const chart = projectWeekChart(aStoredDietPlan());
  const minutes = chart.rows.map((row) => row.minutes);

  assert.deepEqual(minutes, [480, 780, 1170]);
  assert.deepEqual([...minutes].sort((a, b) => a - b), minutes);
});

// ── 2. a time is a row ACROSS THE WHOLE WEEK ──────────────────────────────────────────────────────

test('DISTINCT TIMES ACROSS DIFFERENT DAYS SHARE ONE ROW, so days can be read across', () => {
  const chart = projectWeekChart(aDietPlan({
    days: [
      aDay(2, [anEntry({ time: '08:00', items: ['Tuesday breakfast'] })]),
      aDay(4, [anEntry({ time: '08:00', items: ['Thursday breakfast'] })]),
    ],
  }));

  assert.equal(chart.row_count, 1, 'one time, one row — not one row per day');

  const [row] = chart.rows;
  assert.deepEqual(row.cells.map((cell) => cell.day_name), ['Tuesday', 'Thursday']);
  assert.deepEqual(row.cells.map((cell) => cell.entries[0].items[0]),
    ['Tuesday breakfast', 'Thursday breakfast']);
});

test('a time on one day only still gets a row, with the other days empty beside it', () => {
  const chart = projectWeekChart(aStoredDietPlan());

  const dinner = chart.rows.find((row) => row.time === '19:30');
  assert.deepEqual(dinner.cells.map((cell) => cell.empty), [true, false]);
  assert.deepEqual(dinner.cells.map((cell) => cell.day_name), ['Monday', 'Wednesday']);
});

// ── 3. an empty cell, NEVER a shifted row ─────────────────────────────────────────────────────────

test('THE GRID IS RECTANGULAR: every row holds one cell per day, in the days\' own order', () => {
  const chart = projectWeekChart(aDietPlan({
    days: [
      aDay(1, [anEntry({ time: '08:00' })]),
      aDay(2, [anEntry({ time: '13:00', label: 'Lunch' })]),
      aDay(5, [anEntry({ time: '19:00', label: 'Dinner' })]),
    ],
  }));

  const dayNames = chart.days.map((day) => day.name);
  assert.deepEqual(dayNames, ['Monday', 'Tuesday', 'Friday']);

  for (const row of chart.rows) {
    assert.equal(row.cells.length, chart.day_count, `row ${row.time} has a cell for every day`);
    assert.deepEqual(row.cells.map((cell) => cell.day_name), dayNames,
      `row ${row.time} keeps the columns in the headings order`);
  }
});

test('AN EMPTY CELL IS AN EMPTY CELL — the food stays under the day it belongs to', () => {
  const chart = projectWeekChart(aDietPlan({
    days: [
      aDay(1, [anEntry({ time: '13:00', label: 'Lunch', items: ['Monday lunch'] })]),
      aDay(2, [anEntry({ time: '08:00', label: 'Breakfast', items: ['Tuesday breakfast'] })]),
    ],
  }));

  const breakfast = chart.rows.find((row) => row.time === '08:00');
  const lunch = chart.rows.find((row) => row.time === '13:00');

  // Were the empty cell simply omitted, Tuesday's breakfast would occupy the Monday column here —
  // a chart that reads perfectly and tells the coach the wrong day.
  assert.equal(breakfast.cells[0].empty, true);
  assert.equal(breakfast.cells[0].text, '');
  assert.equal(breakfast.cells[1].day_name, 'Tuesday');
  assert.deepEqual(breakfast.cells[1].entries[0].items, ['Tuesday breakfast']);

  assert.deepEqual(lunch.cells[0].entries[0].items, ['Monday lunch']);
  assert.equal(lunch.cells[1].empty, true);
});

test('several entries at one time on one day share the cell rather than losing one', () => {
  const chart = projectWeekChart(aDietPlan({
    days: [aDay(1, [
      anEntry({ time: '10:00', label: 'Snack', items: ['Almonds'] }),
      anEntry({ time: '10:00', label: 'Supplement', items: ['Creatine'] }),
    ])],
  }));

  assert.equal(chart.row_count, 1);
  assert.equal(chart.rows[0].cells[0].entries.length, 2);
  assert.equal(chart.rows[0].entry_count, 2);
  assert.equal(chart.rows[0].cells[0].text, 'Snack: Almonds | Supplement: Creatine');
});

// ── 4. a short plan is NEVER padded into a full week ──────────────────────────────────────────────

test('A SHORT PLAN HAS SHORT COLUMNS, and the days it says nothing about are NAMED', () => {
  const chart = projectWeekChart(aStoredDietPlan());

  assert.equal(chart.day_count, 2);
  assert.equal(chart.is_full_week, false);
  assert.deepEqual(chart.days.map((day) => day.name), ['Monday', 'Wednesday']);
  assert.deepEqual(chart.missing_days.map((day) => day.name),
    ['Tuesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
});

test('a seven-day plan is a full week, and nothing is reported missing', () => {
  const chart = projectWeekChart(aDietPlan({ days: fullWeek() }));

  assert.equal(chart.day_count, 7);
  assert.equal(chart.is_full_week, true);
  assert.deepEqual(chart.missing_days, []);
  assert.deepEqual(chart.days.map((day) => day.day), [1, 2, 3, 4, 5, 6, 7]);
});

test('days come out ascending however the record listed them', () => {
  const chart = projectWeekChart(aDietPlan({
    days: [aDay(6), aDay(2), aDay(4)],
  }));

  assert.deepEqual(chart.days.map((day) => day.day), [2, 4, 6]);
  assert.deepEqual(chart.days.map((day) => day.short_name), ['Tue', 'Thu', 'Sat']);
});

// ── the week REPEATS ──────────────────────────────────────────────────────────────────────────────

test('THE WEEK REPEATS: no date from the record reaches the chart at all', () => {
  const plan = aStoredDietPlan({
    effective_from: '2026-06-01',
    effective_to: '2026-09-30',
  });
  const chart = projectWeekChart(plan);

  assert.equal(chart.repeats, true);

  const rendered = JSON.stringify(chart);
  assert.ok(!rendered.includes('2026-06-01'), 'the chart never resolves itself against a date');
  assert.ok(!rendered.includes('2026-09-30'));

  // Non-vacuity: those dates really are on the record this chart was built from.
  assert.equal(plan.content.effective_from, '2026-06-01');
});

// ── the flat table the export seam takes ──────────────────────────────────────────────────────────

test('THE TABLE FALLS OUT FLAT: a title, HEADINGS of day names, and rows of plain strings', () => {
  const table = chartTable(projectWeekChart(aStoredDietPlan()));

  assert.equal(table.title, 'Test Cutting Plan');
  assert.deepEqual(table.headings, ['Time', 'Monday', 'Wednesday']);
  assert.deepEqual(table.rows, [
    ['08:00 Breakfast', 'Oats with milk, Banana', ''],
    ['13:00 Lunch', 'Chicken, Rice, Salad', 'Fish, Potatoes'],
    ['19:30 Dinner', '', 'Soup'],
  ]);
});

/*
 * THE RENAME'S WHOLE POINT, ASSERTED AGAINST THE SEAM ITSELF RATHER THAN AGAINST A REMEMBERED SHAPE.
 *
 * This field was called `header` while nothing consumed it, and the seam calls it `headings`. Two
 * names for one field is the shape that gets "fixed" with a one-line adapter at each call site, and
 * two adapters is two seams. So the projection's output is put through the exporter's OWN reader,
 * unchanged and unwrapped: if the names ever drift apart again this goes red here, in the projection's
 * own suite, rather than in whichever caller notices first.
 *
 * `readTable` is imported from `core/export/`, which is the point — the contract is not restated in
 * this file, it is EXERCISED. A copy of the field names written here is a copy that cannot be wrong.
 */
test('WHAT THE PROJECTION RETURNS IS DIRECTLY A VALID TABLE FOR THE EXPORT SEAM — no adapter', () => {
  const table = chartTable(projectWeekChart(aStoredDietPlan()));

  // Passed WHOLE. Not spread, not renamed, not picked apart: the argument is the projection's output.
  const read = readTable(table);

  assert.equal(read.title, table.title);
  assert.deepEqual([...read.headings], table.headings);
  assert.deepEqual(read.rows.map((row) => [...row]), table.rows);
});

/*
 * AND THE ONE PLACE THE SEAM WILL NOT SAVE A CALLER, PINNED HERE SO A CALLER KNOWS.
 *
 * The seam refuses a table holding neither headings nor rows, because that is an artefact the coach
 * would read as the app losing his week. An EMPTY PLAN does not reach that refusal: it still has a
 * `Time` heading, so it reads as valid and would export as a title over one empty column. That is
 * not the seam's bug — it cannot know that one heading and no rows means "nothing written yet". It
 * is the CALLER'S obligation, and it is written down here rather than discovered by a coach sending
 * a client a picture of the word Time. `chart.is_empty` is the flag to gate on.
 */
test('an EMPTY plan is not refused by the seam, so a caller must not offer to export one', () => {
  const chart = projectWeekChart({ content: { name: 'Nothing yet', days: [] } });
  const empty = chartTable(chart);

  assert.equal(chart.is_empty, true, 'the flag a caller gates on');
  assert.deepEqual(empty.rows, []);
  assert.doesNotThrow(() => readTable(empty), 'the seam accepts it — the gate has to be the caller’s');
});

test('the table is rectangular and every cell is a string — nothing to flatten', () => {
  const table = chartTable(projectWeekChart(aDietPlan({ days: fullWeek() })));
  const whole = [table.headings, ...table.rows];

  for (const row of whole) {
    assert.equal(row.length, table.headings.length);
    for (const cell of row) assert.equal(typeof cell, 'string');
  }
});

test('a slot name shared by the whole row is said ONCE, down the side', () => {
  const table = chartTable(projectWeekChart(aDietPlan({
    days: [
      aDay(1, [anEntry({ time: '08:00', label: 'Breakfast', items: ['Oats'] })]),
      aDay(2, [anEntry({ time: '08:00', label: 'Breakfast', items: ['Eggs'] })]),
    ],
  })));

  assert.deepEqual(table.rows, [['08:00 Breakfast', 'Oats', 'Eggs']]);
});

test('where the days DISAGREE about the slot, each cell keeps its own name', () => {
  const chart = projectWeekChart(aDietPlan({
    days: [
      aDay(1, [anEntry({ time: '08:00', label: 'Breakfast', items: ['Oats'] })]),
      aDay(2, [anEntry({ time: '08:00', label: 'Pre-workout', items: ['Toast'] })]),
    ],
  }));

  assert.equal(chart.rows[0].label, null, 'no word is put against a day that did not use it');
  assert.deepEqual(chartTable(chart).rows, [['08:00', 'Breakfast: Oats', 'Pre-workout: Toast']]);
});

test('an unlabelled entry is fine, and a note travels with the food', () => {
  const chart = projectWeekChart(aDietPlan({
    days: [aDay(1, [
      anEntry({ time: '16:00', label: null, items: ['Apple'], notes: 'Only if training later' }),
    ])],
  }));

  assert.equal(chart.rows[0].label, null);
  assert.equal(chart.rows[0].cells[0].text, 'Apple (Only if training later)');
});

// ── the shapes a real plan arrives in ─────────────────────────────────────────────────────────────

test('counts are reported so a caller can say how big a plan is without walking it', () => {
  const chart = projectWeekChart(aStoredDietPlan());

  assert.equal(chart.row_count, 3);
  assert.equal(chart.entry_count, 4);
  assert.equal(chart.item_count, 8);
  assert.equal(chart.is_empty, false);
});

test('a plan with no days at all projects an EMPTY chart rather than throwing', () => {
  const chart = projectWeekChart({ content: { name: 'Nothing yet', days: [] } });

  assert.equal(chart.is_empty, true);
  assert.deepEqual(chart.days, []);
  assert.deepEqual(chart.rows, []);
  assert.equal(chart.is_full_week, false);
  assert.equal(chart.missing_days.length, 7);
  assert.deepEqual(chartTable(chart), { title: 'Nothing yet', headings: ['Time'], rows: [] });
});

test('nothing at all still projects a chart: a screen cannot be handed half an answer', () => {
  for (const nothing of [null, undefined, 'a plan', 42, []]) {
    const chart = projectWeekChart(nothing);
    assert.equal(chart.is_empty, true);
    assert.equal(chart.repeats, true);
    assert.equal(chart.title, '');
  }
});

test('a day listed twice keeps both days\' food in one column, rather than dropping one', () => {
  // The record forbids this; an import DRAFT has not been through the record yet, and losing a
  // line of a client's plan silently is the failure that matters most on this path.
  const chart = projectWeekChart({
    days: [
      aDay(1, [anEntry({ time: '08:00', items: ['First'] })]),
      aDay(1, [anEntry({ time: '13:00', items: ['Second'] })]),
    ],
  });

  assert.equal(chart.day_count, 1);
  assert.equal(chart.row_count, 2);
  assert.deepEqual(chart.rows.map((row) => row.cells[0].entries[0].items[0]), ['First', 'Second']);
});

test('a time the projection cannot read is kept, sorted last, and never silently dropped', () => {
  const chart = projectWeekChart({
    days: [aDay(1, [
      anEntry({ time: 'after gym', items: ['Shake'] }),
      anEntry({ time: '08:00', items: ['Oats'] }),
    ])],
  });

  assert.deepEqual(chart.rows.map((row) => row.time), ['08:00', 'after gym']);
  assert.equal(chart.rows[1].minutes, null);
  assert.equal(chart.entry_count, 2);
});

/** Seven days, each with one entry — the full-week case. */
function fullWeek() {
  return [1, 2, 3, 4, 5, 6, 7].map((day) => aDay(day, [anEntry({ items: [`Day ${day} breakfast`] })]));
}
