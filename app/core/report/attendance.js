/**
 * ATTENDANCE AND CONSISTENCY — the second of the three things the report says.
 *
 * How many sessions this client actually had, over what stretch of time, and how evenly they fall.
 * Nothing here is a score and nothing here is a target: the app is in a supporting role and does not
 * grade the person reading it.
 *
 * ## Counted from their OWN sessions, which is also what makes it private
 *
 * The count comes from the sessions this client was on, narrowed by `participation.js` before it
 * arrives here. A session that carried four people counts as ONE session for each of them, and this
 * module has no way to know it carried anybody else — the roster is not in the data it is given.
 * That is deliberate: a privacy rule kept by construction cannot be broken by a later edit to an
 * arithmetic function.
 *
 * ## There is no clock in this file
 *
 * Every interval is measured between two instants that are IN THE DATA. Nothing is measured against
 * today, because a report is a fixed statement: it must read the same next week as it did when it was made,
 * and a "last trained 3 days ago" line silently rewrites itself into a reproach.
 *
 * A gap is therefore a gap BETWEEN sessions, never the gap since the last one.
 *
 * ## Consistency is described, not judged
 *
 * `cadence` is `steady`, `uneven`, or `too_early_to_say` — and the third one exists because two
 * sessions describe no pattern at all, and a confident word about a pattern that is not there is
 * simply wrong. Nothing here says "good", "poor", "on track" or "behind".
 *
 * Pure. No clock, no store, no browser.
 */

/** Below this many attended sessions there is no cadence to describe, and saying one is a fiction. */
export const CADENCE_NEEDS = 3;

/**
 * How much longer than the typical interval the longest gap may run before the cadence reads as
 * uneven rather than steady. Two whole cycles missed is a visible break in a pattern; one late
 * session is not.
 */
export const UNEVEN_MULTIPLE = 2;

const MILLISECONDS_PER_DAY = 86400000;

/**
 * @typedef {Object} Attendance
 * @property {number} attended Sessions that actually ran, with this client on them.
 * @property {number} completed
 * @property {number} cut_short Interrupted or abandoned. Reported plainly: an interrupted session is
 *   still a session that happened, and hiding it would lose the last thing that did.
 * @property {number} upcoming Sessions on the books that have not run.
 * @property {string|null} first_at
 * @property {string|null} latest_at
 * @property {number|null} span_days First to latest, inclusive of neither end's clock time.
 * @property {{month: string, count: number}[]} by_month Ascending. `month` is the record's own
 *   year and month, sliced from the instant rather than resolved through a calendar.
 * @property {number} months_with_a_session
 * @property {number|null} typical_days_between The MIDDLE interval between consecutive sessions, so
 *   one long holiday does not redraw the whole picture.
 * @property {number|null} longest_gap_days
 * @property {'steady'|'uneven'|'too_early_to_say'} cadence
 */

/**
 * Attendance and consistency for one client.
 *
 * @param {Array<{at: string|null, status: string, attended: boolean}>} sessions Narrowed sessions.
 * @returns {Attendance}
 */
export function projectAttendance(sessions) {
  const rows = (Array.isArray(sessions) ? sessions : []).filter((row) => row && typeof row === 'object');
  const ran = rows.filter((row) => row.attended === true);
  const instants = ran.map((row) => row.at).filter((at) => typeof at === 'string');

  const gaps = intervalsBetween(instants);
  const typical = middleOf(gaps);
  const longest = gaps.length > 0 ? gaps.reduce((a, b) => (a > b ? a : b)) : null;

  return {
    attended: ran.length,
    completed: ran.filter((row) => row.status === 'completed').length,
    cut_short: ran.filter((row) => row.status === 'interrupted' || row.status === 'abandoned').length,
    upcoming: rows.length - ran.length,
    first_at: instants[0] ?? null,
    latest_at: instants.length > 0 ? instants[instants.length - 1] : null,
    span_days: instants.length > 1 ? daysBetween(instants[0], instants[instants.length - 1]) : null,
    by_month: countByMonth(instants),
    months_with_a_session: countByMonth(instants).length,
    typical_days_between: typical,
    longest_gap_days: longest,
    cadence: cadenceOf(ran.length, typical, longest),
  };
}

/**
 * Whole days between two instants, rounded to the nearest day.
 *
 * `Date.parse` is arithmetic on a value that is already in the data. It reads no clock, and the
 * purity suite proves the whole projection still runs with the clock taken away.
 *
 * @param {string} from @param {string} to
 * @returns {number|null} null when either instant cannot be read as a date
 */
export function daysBetween(from, to) {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / MILLISECONDS_PER_DAY);
}

/**
 * The gaps between consecutive sessions, in days.
 * @param {string[]} instants Ascending.
 * @returns {number[]}
 */
export function intervalsBetween(instants) {
  const gaps = [];
  for (let index = 1; index < instants.length; index += 1) {
    const gap = daysBetween(instants[index - 1], instants[index]);
    if (gap !== null) gaps.push(gap);
  }
  return gaps;
}

/**
 * The middle value of a list — the typical interval.
 *
 * The middle rather than the average on purpose: an average interval is dragged by a single holiday
 * into a number that describes none of the weeks it covers.
 *
 * @param {number[]} values
 * @returns {number|null}
 */
export function middleOf(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/**
 * Sessions per calendar month, by slicing the instant rather than resolving it against a calendar —
 * an instant is already stated as year, month and day, and re-deriving them is how a report ends up
 * disagreeing with the date printed beside it.
 *
 * @param {string[]} instants Ascending.
 * @returns {{month: string, count: number}[]}
 */
export function countByMonth(instants) {
  const order = [];
  const counts = new Map();
  for (const instant of instants) {
    const month = instant.slice(0, 7);
    if (month.length !== 7) continue;
    if (!counts.has(month)) order.push(month);
    counts.set(month, (counts.get(month) || 0) + 1);
  }
  return order.map((month) => ({ month, count: counts.get(month) || 0 }));
}

/**
 * @param {number} attended @param {number|null} typical @param {number|null} longest
 * @returns {'steady'|'uneven'|'too_early_to_say'}
 */
function cadenceOf(attended, typical, longest) {
  if (attended < CADENCE_NEEDS || typical === null || longest === null) return 'too_early_to_say';
  if (typical <= 0) return 'steady';
  return longest > typical * UNEVEN_MULTIPLE ? 'uneven' : 'steady';
}
