/**
 * THE WEEK CHART — one diet plan, projected into the grid the coach actually reads.
 *
 * Days across, times down, each cell the food at that time on that day. Pure: a plan goes in, a view
 * model comes out, and nothing here draws, stores, or asks what day it is today.
 *
 * ## The four judgements this file exists to make
 *
 * These are not details. Each one is a way the chart can look right and be wrong, and the record
 * itself does not decide any of them.
 *
 * 1. **Times sort as TIMES.** `'9:00'` before `'10:00'`, never the string order that puts breakfast
 *    after lunch. Ordering goes through `compareTimes` in `week.js` and never through `<`.
 * 2. **A time is a ROW ACROSS THE WHOLE WEEK.** Distinct times found on different days line up on
 *    one shared row, which is the entire point: the coach compares Tuesday against Thursday by
 *    reading across, and he can only do that if 08:00 means the same line on both.
 * 3. **A day with nothing at a time gets an EMPTY CELL, never a missing one.** Every row carries
 *    exactly one cell per day in `days`, in the same order, so the grid is rectangular. A sparse row
 *    would render as a SHIFTED row — Thursday's lunch appearing under Tuesday's column — which is
 *    the specific way a chart lies to the person reading it fastest.
 * 4. **A short plan is never padded into a full week.** A five-day plan has five columns, `days`
 *    lists exactly the days the plan holds, and `missing_days` names the rest so an interface can
 *    say "no plan for Saturday" instead of drawing an empty Saturday that looks like a fast day.
 *
 * ## The week REPEATS
 *
 * Nothing here resolves a day against a calendar date, and there is no date arithmetic in this file
 * at all. `repeats` is on the view as a stated fact rather than an implication, because the first
 * thing a renderer is tempted to do with a day number is turn it into "this Tuesday".
 *
 * ## Feeding the export seam
 *
 * The diet export takes a TABLE and a TITLE. {@link chartTable} is that fall-out: a title, a row of
 * HEADINGS of day names, and rows of plain strings — nothing a caller has to flatten, and nothing
 * that needs a renderer built for this shape in particular. This module does not import the exporter
 * and knows nothing about it; it simply does not produce a structure only a bespoke renderer could
 * use.
 *
 * **The field is called `headings` because that is what the seam calls it.** It said `header` until
 * the export was actually wired, which is one name too many for one field: the seam's contract in
 * `core/export/table.js` is `{title, headings, rows}`, and a projection returning a nearly-matching
 * shape is worse than one returning an obviously different shape, because the fix looks like a
 * one-line adapter at the call site. Two of those and the second caller quietly writes a third. So
 * what this returns IS a valid table for the seam, passed straight through, with nothing in between.
 *
 * Plaintext, deliberately. A diet plan is a food chart: no encryption, no sensitivity flag, no
 * export gating anywhere on this path. `core/model/entities/diet-plan.js` records why.
 */

import { DAYS_IN_WEEK, WEEKDAYS, compareTimes, minutesOfDay, weekdayNameOf, weekdayOf } from './week.js';
import { daysOf, entriesOf, itemsOf, planContentOf, planIdOf } from './plan.js';

/** How several entries at one time on one day read in a single cell. */
const BETWEEN_ENTRIES = ' | ';
/** How the foods in one entry read in a single cell. */
const BETWEEN_ITEMS = ', ';

/**
 * @typedef {Object} ChartEntry
 * @property {string} time The record's own 24-hour time, unchanged.
 * @property {string|null} label What the coach calls this slot, when he named it.
 * @property {string[]} items The foods, in the order the plan lists them.
 * @property {string|null} notes
 * @property {string} text The entry as one readable line, for a spreadsheet cell or an image.
 */

/**
 * @typedef {Object} ChartCell
 * @property {number} day
 * @property {string} day_name
 * @property {boolean} empty Nothing planned for this day at this row's time.
 * @property {ChartEntry[]} entries
 * @property {string} text Empty string when the cell is empty — an absence, rendered as an absence.
 */

/**
 * @typedef {Object} ChartRow
 * @property {string} time The time this row is, exactly as the record stores it.
 * @property {number|null} minutes Minutes since midnight, or null for a time that could not be read.
 * @property {string|null} label The slot name when every entry on the row agrees on one, else null.
 * @property {ChartCell[]} cells One per day in `days`, in the same order. Always the same length.
 * @property {number} entry_count
 */

/**
 * @typedef {Object} WeekChart
 * @property {string} title The plan's name — what the export puts above the table.
 * @property {string|null} plan_id
 * @property {string|null} client_id
 * @property {string} status The record's own status, unchanged.
 * @property {{day: number, name: string, short_name: string}[]} days The days the plan HOLDS,
 *   ascending. Never seven unless the plan holds seven.
 * @property {number} day_count
 * @property {boolean} is_full_week
 * @property {{day: number, name: string, short_name: string}[]} missing_days The days of the week
 *   this plan says nothing about, named so an interface can say so.
 * @property {ChartRow[]} rows Every distinct time across the whole plan, in time order.
 * @property {number} row_count
 * @property {number} entry_count
 * @property {number} item_count
 * @property {boolean} is_empty
 * @property {true} repeats The week repeats. Never resolved against a calendar date.
 * @property {string|null} notes
 * @property {string|null} source_note
 */

/**
 * Project one diet plan into the week chart.
 *
 * @param {unknown} record A stored envelope or a bare plan; `plan.js` accepts either.
 * @returns {WeekChart}
 */
export function projectWeekChart(record) {
  const content = planContentOf(record);
  const days = presentDays(content);
  const times = distinctTimes(days);

  const rows = times.map((time) => buildRow(time, days));

  return {
    title: typeof content.name === 'string' ? content.name : '',
    plan_id: planIdOf(record),
    client_id: typeof content.client_id === 'string' ? content.client_id : null,
    status: typeof content.status === 'string' ? content.status : '',
    days: days.map(({ day, name, short_name }) => ({ day, name, short_name })),
    day_count: days.length,
    is_full_week: days.length === DAYS_IN_WEEK,
    missing_days: missingDays(days),
    rows,
    row_count: rows.length,
    entry_count: rows.reduce((total, row) => total + row.entry_count, 0),
    item_count: rows.reduce((total, row) => total + itemsInRow(row), 0),
    is_empty: rows.length === 0,
    repeats: true,
    notes: typeof content.notes === 'string' ? content.notes : null,
    source_note: typeof content.source_note === 'string' ? content.source_note : null,
  };
}

/**
 * The chart as a flat table with a title — the shape the export seam takes.
 *
 * The first column is the time, carrying the slot name when the whole row agrees on one, so the
 * coach reads "08:00 Breakfast" down the side instead of hunting for it inside three cells that all
 * say it. Every other column is a day the plan holds, in the chart's order, and an empty cell is an
 * empty string rather than a dash or a placeholder: a spreadsheet and an image both render nothing
 * for it, which is what an absence should look like.
 *
 * `[headings, ...rows]` is the whole table when a caller wants one array.
 *
 * The field names are the EXPORT SEAM'S OWN — `{title, headings, rows}`, exactly as
 * `core/export/table.js` declares them — so this is handed to the exporter unchanged. No adapter, no
 * translation at the call site; a translation is what makes one seam into two.
 *
 * @param {WeekChart} chart
 * @returns {{title: string, headings: string[], rows: string[][]}} A valid table for the export seam.
 */
export function chartTable(chart) {
  return {
    title: chart.title,
    headings: ['Time', ...chart.days.map((day) => day.name)],
    rows: chart.rows.map((row) => [
      row.label ? `${row.time} ${row.label}` : row.time,
      ...row.cells.map((cell) => cell.text),
    ]),
  };
}

// ── internals ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The days the plan holds, ascending, one column each.
 *
 * Days are grouped by number rather than trusted to be distinct. The record forbids a day appearing
 * twice, but a projection that assumed it would silently drop the second one's food — and the plan
 * being projected may be a DRAFT an import produced, which has not been validated yet.
 *
 * @param {Record<string, any>} content
 */
function presentDays(content) {
  /** @type {Map<any, {day: any, name: string, short_name: string, entries: Record<string, any>[]}>} */
  const byNumber = new Map();

  for (const day of daysOf(content)) {
    const known = weekdayOf(day.day);
    const found = byNumber.get(day.day) || {
      day: day.day,
      name: weekdayNameOf(day.day),
      short_name: known ? known.short_name : weekdayNameOf(day.day),
      entries: [],
    };
    found.entries.push(...entriesOf(day));
    byNumber.set(day.day, found);
  }

  return [...byNumber.values()].sort((a, b) => compareDayNumbers(a.day, b.day));
}

/**
 * The days of the week this plan says nothing about.
 * @param {{day: any}[]} days
 */
function missingDays(days) {
  const present = new Set(days.map((day) => day.day));
  return WEEKDAYS
    .filter((weekday) => !present.has(weekday.day))
    .map(({ day, name, short_name }) => ({ day, name, short_name }));
}

/**
 * Every distinct time anywhere in the plan, in time order — the rows of the grid.
 *
 * Keyed by the stored text, so two days sharing 08:00 share one row. The record's validator holds
 * stored times to a single zero-padded form, which is what makes that key sound; a draft that has
 * not been through it yet may show `8:00` and `08:00` as two rows, which is the honest reading of an
 * unvalidated draft rather than a merge this module guessed at.
 *
 * @param {{entries: Record<string, any>[]}[]} days
 */
function distinctTimes(days) {
  const times = new Set();
  for (const day of days) {
    for (const entry of day.entries) {
      if (typeof entry.time === 'string') times.add(entry.time);
    }
  }
  return [...times].sort(compareTimes);
}

/**
 * One row: this time, across every day, with an empty cell wherever that day has nothing.
 * @param {string} time
 * @param {{day: any, name: string, entries: Record<string, any>[]}[]} days
 * @returns {ChartRow}
 */
function buildRow(time, days) {
  const perDay = days.map((day) => ({
    day,
    entries: day.entries.filter((entry) => entry.time === time).map(toChartEntry),
  }));

  // The row's label is decided BEFORE the cells are rendered, because a cell that repeats a label
  // the row already carries makes the coach read the same word three times across one line.
  const label = sharedLabel(perDay);

  const cells = perDay.map(({ day, entries }) => {
    const rendered = entries.map((entry) => ({ ...entry, text: entryText(entry, label) }));
    return {
      day: day.day,
      day_name: day.name,
      empty: rendered.length === 0,
      entries: rendered,
      text: rendered.map((entry) => entry.text).join(BETWEEN_ENTRIES),
    };
  });

  return {
    time,
    minutes: minutesOfDay(time),
    label,
    cells,
    entry_count: cells.reduce((total, cell) => total + cell.entries.length, 0),
  };
}

/**
 * The slot name when every entry on the row agrees on one, else null.
 *
 * Unanimity is the bar on purpose. If Tuesday calls 08:00 "Breakfast" and Thursday calls it
 * "Pre-workout", promoting either to the row would put a word against the other day that the
 * nutritionist did not write there.
 *
 * @param {{entries: {label: string|null}[]}[]} perDay
 * @returns {string|null}
 */
function sharedLabel(perDay) {
  const labels = new Set();
  for (const day of perDay) {
    for (const entry of day.entries) {
      if (!entry.label) return null;
      labels.add(entry.label);
    }
  }
  return labels.size === 1 ? [...labels][0] : null;
}

/**
 * One entry, without its rendered line — the line needs the row's label, which is not known yet.
 * @param {Record<string, any>} entry
 * @returns {Omit<ChartEntry, 'text'>}
 */
function toChartEntry(entry) {
  return {
    time: entry.time,
    label: typeof entry.label === 'string' && entry.label.length > 0 ? entry.label : null,
    items: itemsOf(entry),
    notes: typeof entry.notes === 'string' && entry.notes.length > 0 ? entry.notes : null,
  };
}

/**
 * One entry as the single line it reads as in a cell.
 *
 * The slot name is carried only where it says something the row does not already say, and the note
 * travels with the food rather than being dropped: a note is the nutritionist telling the client
 * how, and losing it in the chart loses it everywhere the coach looks.
 *
 * @param {Omit<ChartEntry, 'text'>} entry @param {string|null} rowLabel
 * @returns {string}
 */
function entryText(entry, rowLabel) {
  const food = entry.items.join(BETWEEN_ITEMS);
  const withLabel = entry.label && entry.label !== rowLabel ? `${entry.label}: ${food}` : food;
  return entry.notes ? `${withLabel} (${entry.notes})` : withLabel;
}

/** @param {ChartRow} row */
function itemsInRow(row) {
  return row.cells.reduce(
    (total, cell) => total + cell.entries.reduce((count, entry) => count + entry.items.length, 0),
    0,
  );
}

/**
 * Day numbers ascending, with anything that is not a number sorted last by its own text so the
 * order is total and a chart is byte-identical on every run.
 * @param {any} a @param {any} b
 */
function compareDayNumbers(a, b) {
  const left = typeof a === 'number' ? a : null;
  const right = typeof b === 'number' ? b : null;
  if (left !== null && right !== null) return left - right;
  if (left !== null) return -1;
  if (right !== null) return 1;
  return String(a).localeCompare(String(b));
}
