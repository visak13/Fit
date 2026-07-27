/**
 * THE DIET PACKAGE API — start here. `index.js` beside it is the test entry point, not the API.
 *
 * Pure projections from the diet plan RECORD to the two views the coach reads:
 *
 *   - {@link projectWeekChart} — one plan as the week grid, days across and times down, plus
 *     {@link chartTable} which is that grid as a flat table and a title, the shape the export takes.
 *   - {@link projectDietHistory} — a client's plans as what they follow NOW against what they
 *     followed BEFORE, using the record's own status rather than any reading of dates.
 *
 * And the way a plan GETS here in the first place, which matters more than either of them because
 * the coach transcribes his wife's plans and will type them by hand if pasting is worse:
 *
 *   - {@link importDietPlan} — a pasted plan in whatever shape it arrives, out as a DRAFT record
 *     plus a plain-language REPORT of what was understood, what was changed and what could not be
 *     placed. It offers a draft; it never stores one, and it never guesses in silence.
 *
 * Nothing here draws, stores, reads a clock or touches a browser. A test drives every one of these
 * directly, with a plain object as the only input.
 *
 * Plaintext, by an explicit decision recorded on the record itself: a diet plan is a food chart, so
 * there is no encryption, no sensitivity flag and no export gating anywhere on this path.
 */

export { projectWeekChart, chartTable } from './chart.js';
export { projectDietHistory, summariseDietPlan } from './history.js';
export { importDietPlan, readPastedCells, splitFoods } from './import.js';
export { WEEKDAYS, DAYS_IN_WEEK, weekdayOf, weekdayNameOf, minutesOfDay, compareTimes } from './week.js';
