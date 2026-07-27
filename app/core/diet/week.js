/**
 * THE REPEATING WEEK — the one place that says what a day NUMBER means and how a time ORDERS.
 *
 * The diet plan record stores a day as an integer 1..7 and a time as a 24-hour `HH:MM` string, and
 * it stops there: the record is a food chart for a week that REPEATS, so it never resolves itself
 * against a calendar date and nothing in it is anchored to a real Monday.
 *
 * ## Why the numbering is decided HERE and nowhere else
 *
 * Two things need it and they must not disagree. The chart labels a column so the coach can compare
 * Tuesday against Thursday at a glance; the import path reads a day name off a pasted plan and has
 * to turn it back into the same number. If each wrote its own table, the coach would import into
 * Tuesday and read it under Wednesday, with nothing erroring anywhere. That has already happened
 * once in this build with a pair of constants, so the table lives in one module and both sides
 * import it.
 *
 * The numbering is ISO-8601: **1 is Monday and 7 is Sunday**. That is a decision, not something the
 * record states, and it is written down here so the next reader finds it rather than re-derives it.
 * Note the deliberate contrast with a ROUTINE's `position`, which its own header says is a slot in a
 * weekly split and explicitly NOT a calendar weekday. A diet day is different: the nutritionist
 * writes "Tuesday" on the plan, so the name is part of what the coach is transcribing.
 *
 * ## Times sort as TIMES
 *
 * `'9:00'` sorts before `'10:00'` as a time and after it as a string, and a chart that got that
 * wrong would look plausible — breakfast merely appearing in the wrong place. So ordering goes
 * through {@link minutesOfDay} rather than through string comparison, everywhere.
 *
 * A time this module cannot read is never dropped. It sorts last, keeps its own text, and stays
 * visible in the chart: losing a line of a client's plan silently is the failure that matters here.
 *
 * Pure. No clock, no store, no browser, nothing held between calls.
 */

/**
 * @typedef {Object} Weekday
 * @property {number} day The record's own 1..7.
 * @property {string} name What the coach reads: `Monday`.
 * @property {string} short_name What fits in a narrow column: `Mon`.
 */

/**
 * The seven days, in the record's own order. Frozen: this is the shared table, not a starting point.
 * @type {readonly Weekday[]}
 */
export const WEEKDAYS = Object.freeze([
  Object.freeze({ day: 1, name: 'Monday', short_name: 'Mon' }),
  Object.freeze({ day: 2, name: 'Tuesday', short_name: 'Tue' }),
  Object.freeze({ day: 3, name: 'Wednesday', short_name: 'Wed' }),
  Object.freeze({ day: 4, name: 'Thursday', short_name: 'Thu' }),
  Object.freeze({ day: 5, name: 'Friday', short_name: 'Fri' }),
  Object.freeze({ day: 6, name: 'Saturday', short_name: 'Sat' }),
  Object.freeze({ day: 7, name: 'Sunday', short_name: 'Sun' }),
]);

/** How many days a full week holds — used to say "this plan is not a full week" without a literal. */
export const DAYS_IN_WEEK = WEEKDAYS.length;

/**
 * The weekday a day number names, or null when the number is not one of the record's seven.
 *
 * Null rather than a thrown error or an invented name: a projection's job is to show what is there
 * honestly, and a caller that has somehow been handed a day 9 is better served by a chart that says
 * so than by one that quietly calls it Monday.
 *
 * @param {unknown} day
 * @returns {Weekday|null}
 */
export function weekdayOf(day) {
  return WEEKDAYS.find((weekday) => weekday.day === day) || null;
}

/**
 * A day number's display name, falling back to the number itself when it is not one of the seven.
 * @param {unknown} day
 * @returns {string}
 */
export function weekdayNameOf(day) {
  const weekday = weekdayOf(day);
  return weekday ? weekday.name : `Day ${String(day)}`;
}

/**
 * The written forms of a day, lower case, mapped to the record's number.
 *
 * The full names and the plain three-letter forms are DERIVED from {@link WEEKDAYS} rather than
 * typed out, so the two tables cannot drift apart. Only the irregular short forms are listed by
 * hand, and they are here because people write them — this table describes handwriting, not a
 * standard.
 *
 * @type {ReadonlyMap<string, number>}
 */
export const DAY_ALIASES = buildDayAliases();

/**
 * The day a written name means, or null when the text does not name one.
 *
 * Trailing punctuation is ignored: a day heading in a pasted plan reads `Tuesday`, `Tuesday:` or
 * `Tuesday -` with equal likelihood. NOTHING ELSE IS GUESSED. A word that is not a day comes back
 * null so the caller can report that it could not place the line, which is always better than
 * filing a client's food under a day nobody wrote.
 *
 * @param {unknown} text
 * @returns {number|null}
 */
export function weekdayNumberFor(text) {
  if (typeof text !== 'string') return null;

  const cleaned = withoutTrailingPunctuation(text.trim()).toLowerCase();
  const found = DAY_ALIASES.get(cleaned);
  return found === undefined ? null : found;
}

/**
 * Minutes since midnight for a `HH:MM` time, or null when the text is not a time this can read.
 *
 * Read character by character rather than by pattern match: this application's shipped source is
 * kept free of regular expressions, and the record's own validator already owns the question of
 * whether a stored time is well formed. This function only needs to ORDER one.
 *
 * @param {unknown} time
 * @returns {number|null}
 */
export function minutesOfDay(time) {
  if (typeof time !== 'string') return null;
  const parts = time.split(':');
  if (parts.length !== 2) return null;

  const hours = wholeNumber(parts[0]);
  const minutes = wholeNumber(parts[1]);
  if (hours === null || minutes === null) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return (hours * 60) + minutes;
}

/**
 * Order two times as TIMES.
 *
 * A time that cannot be read sorts after every time that can, then by its own text, so the ordering
 * is total and the same input always produces the same chart.
 *
 * @param {unknown} a @param {unknown} b
 * @returns {number}
 */
export function compareTimes(a, b) {
  const left = minutesOfDay(a);
  const right = minutesOfDay(b);
  if (left !== null && right !== null && left !== right) return left - right;
  if (left !== null && right === null) return -1;
  if (left === null && right !== null) return 1;
  return String(a).localeCompare(String(b));
}

/**
 * @typedef {Object} WrittenTime
 * @property {string} time The record's 24-hour form: `13:00`.
 * @property {string} as_written Exactly the text that was read, so a report can quote it.
 * @property {string} rest What followed it, untouched.
 * @property {boolean} normalised Whether the writing differed from the record's form.
 */

/**
 * Read a time off the FRONT of a line, in the forms people actually write it.
 *
 * `08:00`, `8:00`, `8.00`, `8:00am`, `8 am`, `1 pm`, `13.30` — all of them, normalised to the
 * 24-hour form the record demands. Returns null when there is no time to read; the caller then says
 * so rather than inventing one.
 *
 * **A bare number is NOT a time, and this is the rule that matters.** `2 eggs` starts a line in
 * every real plan ever pasted, and an implementation generous enough to read `2` as `02:00` would
 * invent a two-in-the-morning meal out of a quantity — silently, plausibly, and in a client's food
 * chart. So a time needs either a minutes part after `:` or `.`, or an am/pm. Nothing else counts.
 *
 * @param {unknown} text
 * @returns {WrittenTime|null}
 */
export function readWrittenTime(text) {
  if (typeof text !== 'string') return null;

  let at = skipSpaces(text, 0);
  const from = at;

  let hourDigits = '';
  while (at < text.length && isDigit(text[at]) && hourDigits.length < 2) {
    hourDigits += text[at];
    at += 1;
  }
  if (hourDigits.length === 0) return null;
  // `0800` and `2026` are not times written the way a person writes one.
  if (at < text.length && isDigit(text[at])) return null;

  let minutes = 0;
  let hasMinutes = false;
  if (at < text.length && (text[at] === ':' || text[at] === '.')) {
    at += 1;
    let minuteDigits = '';
    while (at < text.length && isDigit(text[at]) && minuteDigits.length < 2) {
      minuteDigits += text[at];
      at += 1;
    }
    if (minuteDigits.length !== 2) return null;
    if (at < text.length && isDigit(text[at])) return null;
    minutes = Number(minuteDigits);
    hasMinutes = true;
  }

  const meridiem = readMeridiem(text, skipSpaces(text, at));
  if (!hasMinutes && meridiem === null) return null;
  if (minutes > 59) return null;

  let hours = Number(hourDigits);
  if (meridiem !== null) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem.value === 'am') hours = hours === 12 ? 0 : hours;
    else hours = hours === 12 ? 12 : hours + 12;
  } else if (hours > 23) {
    return null;
  }

  const to = meridiem === null ? at : meridiem.end;
  const time = `${twoDigits(hours)}:${twoDigits(minutes)}`;
  const asWritten = text.slice(from, to);

  return { time, as_written: asWritten, rest: text.slice(to), normalised: asWritten !== time };
}

/**
 * The text with any trailing heading punctuation taken off: `Tuesday:` and `Tuesday -` are both
 * `Tuesday`. Exported because the import path needs exactly this on a cell as well as on a line.
 * @param {string} text
 * @returns {string}
 */
export function withoutTrailingPunctuation(text) {
  let cleaned = text;
  while (cleaned.length > 0 && ':-–—.,;'.includes(cleaned[cleaned.length - 1])) {
    cleaned = cleaned.slice(0, -1).trimEnd();
  }
  return cleaned;
}

// ── internals ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Every written form of every day, derived from the one table plus the short forms people write.
 * @returns {ReadonlyMap<string, number>}
 */
function buildDayAliases() {
  /** The irregular ones. The regular `mon`/`tue`/… come off {@link WEEKDAYS} below. */
  const irregular = { tues: 2, weds: 3, thur: 4, thurs: 4 };

  const aliases = new Map();
  for (const weekday of WEEKDAYS) {
    const name = weekday.name.toLowerCase();
    aliases.set(name, weekday.day);
    aliases.set(name.slice(0, 3), weekday.day);
    aliases.set(weekday.short_name.toLowerCase(), weekday.day);
  }
  for (const [alias, day] of Object.entries(irregular)) aliases.set(alias, day);
  return aliases;
}

/**
 * An `am` or `pm` at this position, in the forms people write them, or null.
 * @param {string} text @param {number} at
 * @returns {{value: string, end: number}|null}
 */
function readMeridiem(text, at) {
  const forms = [
    { written: 'a.m.', value: 'am' }, { written: 'p.m.', value: 'pm' },
    { written: 'am', value: 'am' }, { written: 'pm', value: 'pm' },
  ];
  const rest = text.slice(at).toLowerCase();
  for (const form of forms) {
    if (rest.startsWith(form.written)) return { value: form.value, end: at + form.written.length };
  }
  return null;
}

/** @param {string} text @param {number} at */
function skipSpaces(text, at) {
  let i = at;
  while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i += 1;
  return i;
}

/** @param {string} character */
function isDigit(character) {
  return '0123456789'.includes(character);
}

/** @param {number} value */
function twoDigits(value) {
  return value < 10 ? `0${String(value)}` : String(value);
}

/**
 * A run of digits as a number, or null for anything else — including an empty string, a sign, a
 * space, or the `1e2` and `0x10` forms `Number()` would happily accept.
 * @param {string} text
 * @returns {number|null}
 */
function wholeNumber(text) {
  if (text.length === 0) return null;
  let value = 0;
  for (const character of text) {
    const digit = '0123456789'.indexOf(character);
    if (digit === -1) return null;
    value = (value * 10) + digit;
  }
  return value;
}
