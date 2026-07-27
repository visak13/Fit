/**
 * THE TOLERANT IMPORT — a pasted plan in, a DRAFT plus a REPORT out.
 *
 * The coach's wife is the nutritionist and he TRANSCRIBES her plans. If pasting is worse than
 * typing, he will type, and this feature has failed with every test still green. So this module is
 * generous about the SHAPE it is handed and severe about what it does with what it cannot read.
 *
 * ## The one rule everything else serves: never guess in silence
 *
 * A line dropped quietly is how a client's plan is lost with nobody noticing — no error, no gap the
 * eye catches, just a meal that is no longer there. It is far worse than a line the coach is asked
 * about. So:
 *
 *  - **Every input line lands in exactly one bucket** — blank, day heading, column heading, placed,
 *    or unplaced — and `report.line_accounting` publishes the count of each. A line cannot fall
 *    between the buckets without the totals disagreeing, and a test asserts they agree.
 *  - **Nothing is invented.** No time, no day, no food and no label appears in the draft that was
 *    not written in the paste. Where a reading is genuinely ambiguous this says so in
 *    `report.ambiguous` and leaves the choice to the coach rather than picking one.
 *  - **Every normalisation is named.** `Tues` becoming Tuesday and `7.30am` becoming `07:30` are
 *    changes to what he wrote, so they are listed in `report.changed` with the line and both forms.
 *
 * ## The shapes it reads
 *
 *  - a spreadsheet paste with **days across the top** — a heading row naming two or more days, the
 *    time and the slot in the leading columns, one food cell per day;
 *  - a spreadsheet paste with **a day in the first cell of each row**;
 *  - **loose day-headed text**, a day name alone on a line and the meals written beneath it.
 *
 * Tabs and commas are both read, quoted cells keep the commas inside them, and a blank line in the
 * middle of a block does not end the block.
 *
 * ## What this module is NOT allowed to do
 *
 * **The record is the authority.** `core/model/entities/diet-plan.js` owns the field lengths, the
 * day range, the time pattern and the item bounds, and this file restates none of them: it builds a
 * draft, hands it to `validateDietPlan`, and carries the record's OWN refusal sentences into
 * `report.record_refusals` word for word. A second copy of a rule is a copy that drifts.
 *
 * **It never writes.** Import produces a draft; storing it is the screen's job, after the coach has
 * read the report and said yes.
 *
 * Plaintext, like everything on the diet path: no sealing, no sensitivity flag, no gating.
 *
 * Pure. No clock, no store, no browser, nothing held between calls.
 */

import { validateDietPlan } from '../model/entities/diet-plan.js';
import { DIET_PLAN_STATUSES } from '../model/vocabularies.js';
import {
  compareTimes, readWrittenTime, weekdayNameOf, weekdayNumberFor, withoutTrailingPunctuation,
} from './week.js';

/**
 * The status a freshly imported plan carries. One member of the record's own vocabulary, chosen
 * rather than restated — `import.test.js` asserts it really is in {@link DIET_PLAN_STATUSES}, so a
 * value this file no longer agrees with is a red test and not a silent refusal later.
 */
const IMPORTED_STATUS = 'draft';

/**
 * The slot names people write, lower case. Used ONLY to recognise a word that is already on the
 * line — nothing here is ever added to a meal that did not name it.
 * @type {readonly string[]}
 */
const SLOT_WORDS = Object.freeze([
  'breakfast', 'brunch', 'lunch', 'dinner', 'supper', 'snack', 'snacks', 'tea',
  'morning snack', 'evening snack', 'mid-morning', 'mid morning', 'mid-afternoon', 'mid afternoon',
  'pre-workout', 'pre workout', 'post-workout', 'post workout', 'intra-workout',
  'before bed', 'bedtime', 'on waking', 'first thing', 'shake', 'supplement', 'supplements',
]);

/**
 * What separates two FOODS inside one cell. A comma and a semicolon are the ones people use; the
 * spaced forms of `+` and `&` are safe because an unspaced one belongs to a quantity.
 *
 * `/` is deliberately absent: `rice/potato` means a CHOICE between two foods, and splitting it into
 * two would turn one meal into two portions the client is being told to eat. Nor is the word `and`,
 * which is how `oats and milk` — one bowl — is written.
 *
 * @type {readonly string[]}
 */
const ITEM_SEPARATORS = Object.freeze([',', ';', '\n', ' + ', ' & ']);

/** What separates a slot label from the food after it: `08:00 Breakfast - Oats`. */
const LABEL_SEPARATORS = Object.freeze([' - ', ' – ', ' — ', ' -- ', ': ', ':']);

/** The most words a label may hold before the text is read as food instead. */
const LABEL_WORD_LIMIT = 3;

/** Below this hour, a time written with no am or pm is worth asking about rather than assuming. */
const SUSPICIOUS_HOUR = 7;

/**
 * @typedef {Object} UnplacedLine
 * @property {number} line The 1-based line number in what was pasted.
 * @property {string} text The line exactly as it was written, so nothing has to be retyped.
 * @property {string} reason Plain language: why this could not be filed.
 *
 * @typedef {Object} AmbiguousReading
 * @property {number} line
 * @property {string} text
 * @property {string} question What the coach has to decide, in plain words.
 *
 * @typedef {Object} LineAccounting
 * @property {number} total Every line in the paste, blank ones included.
 * @property {number} blank
 * @property {number} day_heading Lines that named a day and nothing else.
 * @property {number} column_heading Lines that named the day COLUMNS of a spreadsheet.
 * @property {number} placed Lines that produced at least one meal.
 * @property {number} unplaced Lines that produced nothing. Each one appears in `could_not_place`.
 *
 * @typedef {Object} ImportReport
 * @property {boolean} ok Whether the RECORD accepted the draft — its judgement, not this module's.
 * @property {string} layout Which shape was read, in plain words.
 * @property {string} statement One sentence the screen can show above everything else.
 * @property {string[]} understood What was read, in plain sentences.
 * @property {string[]} changed Every normalisation, naming the line and both forms.
 * @property {UnplacedLine[]} could_not_place Nothing is dropped: it is listed here or it is placed.
 * @property {AmbiguousReading[]} ambiguous Readings the coach should confirm, not ones taken.
 * @property {{path: string, code: string, message: string}[]} record_refusals
 *   The record's own issues, its sentences unchanged.
 * @property {LineAccounting} line_accounting
 * @property {number} day_count @property {number} entry_count @property {number} item_count
 *
 * @typedef {Object} ImportResult
 * @property {Record<string, any>} draft A diet plan record, never stored by this module.
 * @property {ImportReport} report
 */

/**
 * Read a pasted diet plan into a draft record and a report on the reading.
 *
 * The draft is offered, never written. `report.ok` is the RECORD's verdict on it; a false verdict
 * with a missing client or name is the ordinary case, because a paste does not carry either and this
 * module refuses to make them up.
 *
 * @param {unknown} text What was pasted.
 * @param {{client_id?: string|null, name?: string|null, status?: string, source_note?: string|null}} [options]
 *   What the SCREEN knows and the paste cannot: whose plan this is and what to call it.
 * @returns {ImportResult}
 */
export function importDietPlan(text, options = {}) {
  const settings = isRecord(options) ? options : {};
  const lines = splitLines(typeof text === 'string' ? text : '');
  const reading = readLines(lines);

  const days = buildDays(reading.meals);
  const draft = {
    client_id: settings.client_id === undefined ? null : settings.client_id,
    name: settings.name === undefined ? null : settings.name,
    status: settings.status === undefined ? IMPORTED_STATUS : settings.status,
    // A paste carries no dates. Reading one out of thin air would put a plan into a client's history
    // on a day nobody wrote.
    effective_from: null,
    effective_to: null,
    days,
    notes: null,
    source_note: settings.source_note === undefined ? null : settings.source_note,
  };

  const verdict = validateDietPlan(draft);

  return { draft, report: buildReport(reading, days, verdict) };
}

/**
 * Split one pasted line into cells.
 *
 * A tab wins where there is one, because a spreadsheet paste is tab-separated and a food name may
 * hold a comma. Otherwise commas separate, and a DOUBLE-QUOTED cell keeps its commas — that is what
 * the quotes are for, and a reader that ignored them would turn `"Oats, milk"` into two columns and
 * push every day one place to the right.
 *
 * Quoting is about the CELL, not about the food: `"Oats, milk"` is one cell holding two foods, and
 * splitting it into two items happens later, on purpose.
 *
 * @param {unknown} line
 * @returns {{cells: string[], unclosed_quote: boolean}}
 */
export function readPastedCells(line) {
  if (typeof line !== 'string') return { cells: [], unclosed_quote: false };
  if (line.includes('\t')) {
    return { cells: line.split('\t').map((cell) => cell.trim()), unclosed_quote: false };
  }

  const cells = [];
  let current = '';
  let quoted = false;
  let at = 0;

  while (at < line.length) {
    const character = line[at];
    if (quoted) {
      if (character === '"') {
        // A doubled quote inside a quoted cell is one literal quote — the spreadsheet convention.
        if (line[at + 1] === '"') { current += '"'; at += 2; continue; }
        quoted = false; at += 1; continue;
      }
      current += character; at += 1; continue;
    }
    if (character === '"') { quoted = true; at += 1; continue; }
    if (character === ',') { cells.push(current.trim()); current = ''; at += 1; continue; }
    current += character; at += 1;
  }
  cells.push(current.trim());

  return { cells, unclosed_quote: quoted };
}

/**
 * Split one cell into the foods written in it, in the order they were written.
 * @param {string} text
 * @returns {string[]}
 */
export function splitFoods(text) {
  let parts = [text];
  for (const separator of ITEM_SEPARATORS) {
    parts = parts.flatMap((part) => part.split(separator));
  }
  return parts
    .map((part) => withoutTrailingPunctuation(part.trim()))
    .filter((part) => part.length > 0);
}

// ── reading the paste ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Meal
 * @property {number} day @property {string} time @property {string|null} label
 * @property {string[]} items
 *
 * @typedef {Object} Reading
 * @property {Meal[]} meals
 * @property {string} layout
 * @property {string[]} changed
 * @property {UnplacedLine[]} could_not_place
 * @property {AmbiguousReading[]} ambiguous
 * @property {LineAccounting} line_accounting
 * @property {Set<number>} days_named
 */

/**
 * Walk every line once, filing each into exactly one bucket.
 * @param {string[]} lines
 * @returns {Reading}
 */
function readLines(lines) {
  /** @type {Reading} */
  const reading = {
    meals: [],
    layout: '',
    changed: [],
    could_not_place: [],
    ambiguous: [],
    line_accounting: {
      total: lines.length, blank: 0, day_heading: 0, column_heading: 0, placed: 0, unplaced: 0,
    },
    days_named: new Set(),
  };

  const rows = lines.map((line, index) => ({ number: index + 1, text: line, ...readPastedCells(line) }));
  const columns = findDayColumns(rows);
  reading.layout = columns === null
    ? 'day names on the lines themselves'
    : 'a spreadsheet with the days across the top';

  /** The day the lines beneath a heading belong to. Never guessed, only ever set by a written day. */
  let currentDay = null;

  for (const row of rows) {
    const filled = row.cells.filter((cell) => cell.length > 0);

    if (row.unclosed_quote) {
      reading.ambiguous.push({
        line: row.number,
        text: row.text,
        question: 'This line opens a quotation mark it never closes, so the columns after it may have '
          + 'been read as one. Check this line reads the way it was meant.',
      });
    }

    if (filled.length === 0) {
      // A blank line inside a block does NOT end the block: a pasted plan is full of them.
      reading.line_accounting.blank += 1;
      continue;
    }

    if (columns !== null && isDayHeadingRow(row.cells)) {
      reading.line_accounting.column_heading += 1;
      continue;
    }

    const heading = filled.length === 1 ? weekdayNumberFor(filled[0]) : null;
    if (heading !== null) {
      currentDay = heading;
      reading.days_named.add(heading);
      noteDayNormalisation(reading, row.number, filled[0], heading);
      reading.line_accounting.day_heading += 1;
      continue;
    }

    const placed = columns === null
      ? readLooseRow(reading, row, currentDay)
      : readColumnRow(reading, row, columns);

    if (placed.day !== null) currentDay = placed.day;
    if (placed.count > 0) reading.line_accounting.placed += 1;
    else reading.line_accounting.unplaced += 1;
  }

  return reading;
}

/**
 * The day columns of a spreadsheet paste, or null when this is not that shape.
 *
 * A heading row must name TWO OR MORE days. One day name among other words is far more likely to be
 * a row that begins with its own day, and reading it as a heading would file the whole plan under
 * the wrong shape — so the rare single-column spreadsheet is reported line by line instead of being
 * guessed at.
 *
 * @param {{cells: string[]}[]} rows
 * @returns {{at: number, day: number}[]|null}
 */
function findDayColumns(rows) {
  for (const row of rows) {
    if (!isDayHeadingRow(row.cells)) continue;
    const columns = [];
    row.cells.forEach((cell, at) => {
      const day = weekdayNumberFor(cell);
      if (day !== null) columns.push({ at, day });
    });
    return columns;
  }
  return null;
}

/**
 * @param {string[]} cells
 * @returns {boolean}
 */
function isDayHeadingRow(cells) {
  if (cells.length < 2) return false;
  const days = cells.filter((cell) => weekdayNumberFor(cell) !== null);
  if (days.length < 2) return false;
  // A row carrying a time is a row of food, however many days it happens to name.
  return !cells.some((cell) => readWrittenTime(cell) !== null);
}

/**
 * Read one row of a spreadsheet whose days run across the top: the time and the slot come from the
 * leading columns, and each day's column holds that day's food.
 *
 * @param {Reading} reading
 * @param {{number: number, text: string, cells: string[]}} row
 * @param {{at: number, day: number}[]} columns
 * @returns {{count: number, day: number|null}}
 */
function readColumnRow(reading, row, columns) {
  const firstDayAt = columns[0].at;
  const leading = row.cells.slice(0, firstDayAt);

  const written = firstWrittenTime(leading);
  if (written === null) {
    reading.could_not_place.push({
      line: row.number,
      text: row.text,
      reason: 'No time is written in the columns before the days, so there is no row of the chart to '
        + 'put this in.',
    });
    return { count: 0, day: null };
  }

  noteTimeReading(reading, row.number, written);

  // Whatever else is in front of the days, in the order it was written. The heading row said what
  // this column is; a label here is read from the paste, never supplied by this module.
  const { label, at: labelAt } = labelFromLeadingCells(leading, written.at);

  let count = 0;
  for (const column of columns) {
    const cell = row.cells[column.at];
    if (cell === undefined) continue;
    const items = splitFoods(cell);
    if (items.length === 0) continue;
    reading.meals.push({ day: column.day, time: written.time.time, label, items });
    reading.days_named.add(column.day);
    count += 1;
  }

  const lastDayAt = columns[columns.length - 1].at;
  const spare = row.cells.slice(lastDayAt + 1).filter((cell) => cell.length > 0);
  if (spare.length > 0) {
    reading.could_not_place.push({
      line: row.number,
      text: spare.join(' | '),
      reason: 'This row has more columns than the heading names days, so this text belongs to no day '
        + 'and was left out of the draft.',
    });
  }

  // EVERY OTHER CELL THIS ROW HOLDS AND THIS READING DID NOT USE. A heading row naming days need not
  // name them in one unbroken run — `Time, Monday, Kcal, Tuesday` is an ordinary shape — and a column
  // the heading does not call a day is read by nothing above: not the time, not the label, not a day.
  // Without this it left the draft in total silence, which is the one failure this module exists to
  // prevent. The text is quoted so the coach can decide where it belongs; nothing is guessed.
  const used = new Set([written.at, ...columns.map((column) => column.at)]);
  if (labelAt !== null) used.add(labelAt);

  const unused = row.cells
    .slice(0, lastDayAt + 1)
    .map((cell, at) => ({ cell, at }))
    .filter(({ cell, at }) => cell.length > 0 && !used.has(at));

  if (unused.length > 0) {
    reading.could_not_place.push({
      line: row.number,
      text: unused.map(({ cell }) => cell).join(' | '),
      reason: 'This text sits in a column the heading does not name as a day, so there is no day to '
        + 'file it under and it was left out of the draft.',
    });
  }

  if (count === 0) {
    reading.could_not_place.push({
      line: row.number,
      text: row.text,
      reason: `A time of ${written.time.time} was read here, but no food is written under any day on `
        + 'this row.',
    });
  }

  return { count, day: null };
}

/**
 * Read one line of the other shape: a day may begin the line, or it may have been set by a heading
 * above; the time, the slot and the food follow.
 *
 * @param {Reading} reading
 * @param {{number: number, text: string, cells: string[]}} row
 * @param {number|null} currentDay
 * @returns {{count: number, day: number|null}}
 */
function readLooseRow(reading, row, currentDay) {
  let cells = row.cells.filter((cell) => cell.length > 0);
  let day = currentDay;
  let ownDay = null;

  const leadingDay = weekdayNumberFor(cells[0]);
  if (leadingDay !== null) {
    noteDayNormalisation(reading, row.number, cells[0], leadingDay);
    day = leadingDay;
    ownDay = leadingDay;
    cells = cells.slice(1);
  }

  if (cells.length === 0) {
    // A day name with nothing after it is a heading, and was handled before this was reached.
    reading.could_not_place.push({
      line: row.number, text: row.text, reason: 'Nothing is written after the day on this line.',
    });
    return { count: 0, day: ownDay };
  }

  const written = readWrittenTime(cells[0]);
  if (written === null) {
    reading.could_not_place.push({
      line: row.number,
      text: row.text,
      reason: 'No time could be read at the start of this line. A time needs minutes or an am or pm '
        + '— a number on its own is a quantity, not seven in the morning.',
    });
    return { count: 0, day: ownDay };
  }

  if (day === null) {
    reading.could_not_place.push({
      line: row.number,
      text: row.text,
      reason: 'No day has been named yet, so there is nothing to file this meal under. Put the day on '
        + 'a line of its own above it, or at the start of the line.',
    });
    return { count: 0, day: ownDay };
  }

  noteTimeReading(reading, row.number, { time: written, at: 0 });

  let { label, items_text: itemsText } = readLabel(written.rest);
  let rest = cells.slice(1);

  // A row pasted out of a spreadsheet puts the slot in its OWN cell, so the time's cell holds
  // nothing else. Only a word people actually use as a slot is taken — anything else stays food,
  // because filing a food under the label loses it from the items, which is the silent drop.
  if (label === null && itemsText.length === 0 && rest.length > 0 && isSlotWord(rest[0])) {
    label = withoutTrailingPunctuation(rest[0].trim());
    rest = rest.slice(1);
  }

  const items = [...splitFoods(itemsText), ...rest.flatMap(splitFoods)];

  if (items.length === 0) {
    reading.could_not_place.push({
      line: row.number,
      text: row.text,
      reason: label === null
        ? `A time of ${written.time} was read here, but no food is written after it.`
        : `A time of ${written.time} and the slot "${label}" were read here, but no food is written `
          + 'after them.',
    });
    return { count: 0, day: ownDay };
  }

  reading.meals.push({ day, time: written.time, label, items });
  reading.days_named.add(day);
  return { count: 1, day: ownDay };
}

/**
 * The slot label written in front of the food, and the food text after it.
 *
 * A label is only read when the paste marks one: either a separator sets it off, or the words are a
 * slot people write. Anything else is FOOD, because filing `Oats` as the name of a meal slot and
 * then losing it from the items is exactly the silent drop this module exists to prevent.
 *
 * @param {string} rest What followed the time.
 * @returns {{label: string|null, items_text: string}}
 */
function readLabel(rest) {
  const text = withoutLeadingSeparators(rest.trim());
  if (text.length === 0) return { label: null, items_text: '' };

  for (const separator of LABEL_SEPARATORS) {
    const at = text.indexOf(separator);
    if (at <= 0) continue;
    const candidate = withoutTrailingPunctuation(text.slice(0, at).trim());
    if (candidate.length === 0) continue;
    // A long phrase, or one holding its own commas, is a list of food that happens to contain a
    // dash — not the name of a slot.
    if (candidate.includes(',') || candidate.includes(';')) continue;
    if (candidate.split(' ').filter((word) => word.length > 0).length > LABEL_WORD_LIMIT) continue;
    return { label: candidate, items_text: text.slice(at + separator.length).trim() };
  }

  const bare = withoutTrailingPunctuation(text);
  if (isSlotWord(bare)) return { label: bare, items_text: '' };

  return { label: null, items_text: text };
}

/**
 * Whether this text is a slot name people write, rather than food.
 * @param {string} text
 * @returns {boolean}
 */
function isSlotWord(text) {
  const lowered = text.trim().toLowerCase();
  if (SLOT_WORDS.includes(lowered)) return true;
  // `Meal 1`, `Meal 2` — the way a nutritionist numbers slots that have no name.
  if (!lowered.startsWith('meal ')) return false;
  const after = lowered.slice('meal '.length).trim();
  return after.length > 0 && [...after].every((character) => '0123456789'.includes(character));
}

/**
 * The first cell that reads as a time, and where it was.
 * @param {string[]} cells
 * @returns {{time: import('./week.js').WrittenTime, at: number}|null}
 */
function firstWrittenTime(cells) {
  for (let at = 0; at < cells.length; at += 1) {
    const time = readWrittenTime(cells[at]);
    if (time !== null) return { time, at };
  }
  return null;
}

/**
 * The label of a spreadsheet row: the first leading cell that is not the time and is not empty.
 *
 * The INDEX comes back with it, because the caller has to know which cells this reading consumed in
 * order to say what it did not. A leading column beyond the label — a calorie count, a note — is
 * used by nothing, and a cell used by nothing must be reported rather than dropped.
 *
 * @param {string[]} leading @param {number} timeAt
 * @returns {{label: string|null, at: number|null}}
 */
function labelFromLeadingCells(leading, timeAt) {
  for (let at = 0; at < leading.length; at += 1) {
    if (at === timeAt) continue;
    const cell = withoutTrailingPunctuation(leading[at].trim());
    if (cell.length > 0) return { label: cell, at };
  }
  return { label: null, at: null };
}

// ── saying what changed ───────────────────────────────────────────────────────────────────────────

/**
 * Record that a written day name was read as one of the record's seven, when the writing differed.
 * @param {Reading} reading @param {number} line @param {string} written @param {number} day
 */
function noteDayNormalisation(reading, line, written, day) {
  const cleaned = withoutTrailingPunctuation(written.trim());
  const name = weekdayNameOf(day);
  if (cleaned === name) return;
  reading.changed.push(`Line ${line}: "${cleaned}" was read as ${name}.`);
}

/**
 * Record how a written time was read — and ask about it when the reading is genuinely open.
 * @param {Reading} reading @param {number} line
 * @param {{time: import('./week.js').WrittenTime, at: number}} written
 */
function noteTimeReading(reading, line, written) {
  const { time } = written;
  if (time.normalised) {
    reading.changed.push(`Line ${line}: "${time.as_written.trim()}" was read as ${time.time}.`);
  }

  const hour = Number(time.time.slice(0, 2));
  const lowered = time.as_written.toLowerCase();
  const saidMeridiem = lowered.includes('am') || lowered.includes('pm')
    || lowered.includes('a.m') || lowered.includes('p.m');

  if (!saidMeridiem && hour >= 1 && hour < SUSPICIOUS_HOUR) {
    const afternoon = `${twoDigits(hour + 12)}:${time.time.slice(3)}`;
    reading.ambiguous.push({
      line,
      text: time.as_written.trim(),
      question: `"${time.as_written.trim()}" was read exactly as written, ${time.time} in the `
        + `morning. If ${afternoon} was meant, write it with pm or as ${afternoon}.`,
    });
  }
}

// ── the draft and the report ──────────────────────────────────────────────────────────────────────

/**
 * The meals as the record's days: sorted by day, entries in time order, nothing merged and nothing
 * added.
 *
 * @param {Meal[]} meals
 * @returns {Record<string, any>[]}
 */
function buildDays(meals) {
  /** @type {Map<number, Record<string, any>[]>} */
  const byDay = new Map();
  for (const meal of meals) {
    if (!byDay.has(meal.day)) byDay.set(meal.day, []);
    /** @type {Record<string, any>[]} */ (byDay.get(meal.day)).push({
      time: meal.time, label: meal.label, items: meal.items, notes: null,
    });
  }

  return [...byDay.keys()]
    .sort((a, b) => a - b)
    .map((day) => ({
      day,
      entries: /** @type {Record<string, any>[]} */ (byDay.get(day))
        .slice()
        .sort((a, b) => compareTimes(a.time, b.time)),
    }));
}

/**
 * @param {Reading} reading
 * @param {Record<string, any>[]} days
 * @param {import('../model/issues.js').ValidationResult} verdict
 * @returns {ImportReport}
 */
function buildReport(reading, days, verdict) {
  const entryCount = days.reduce((total, day) => total + day.entries.length, 0);
  const itemCount = days.reduce(
    (total, day) => total + day.entries.reduce((sum, entry) => sum + entry.items.length, 0), 0);

  const understood = [];
  understood.push(`Read ${plural(reading.line_accounting.total, 'line')} as ${reading.layout}.`);
  if (days.length > 0) {
    understood.push(`Found ${plural(days.length, 'day')}: ${
      days.map((day) => weekdayNameOf(day.day)).join(', ')}.`);
    understood.push(`Found ${plural(entryCount, 'meal')} holding ${plural(itemCount, 'food')}.`);
  } else {
    understood.push('No meal could be read from this, so the draft holds no days.');
  }
  if (reading.line_accounting.blank > 0) {
    understood.push(`${plural(reading.line_accounting.blank, 'blank line')} ignored; a blank line `
      + 'does not end a day.');
  }

  return {
    ok: verdict.ok,
    layout: reading.layout,
    statement: statementFor(reading, days.length, entryCount, itemCount),
    understood,
    changed: reading.changed,
    could_not_place: reading.could_not_place,
    ambiguous: reading.ambiguous,
    // The record's own words, carried through unchanged. Rewording a refusal here would put a second
    // copy of a rule in the app, and the copy is the one that drifts.
    record_refusals: verdict.issues.map((issue) => ({
      path: issue.path, code: issue.code, message: issue.message,
    })),
    line_accounting: reading.line_accounting,
    day_count: days.length,
    entry_count: entryCount,
    item_count: itemCount,
  };
}

/**
 * @param {Reading} reading @param {number} dayCount @param {number} entryCount @param {number} itemCount
 * @returns {string}
 */
function statementFor(reading, dayCount, entryCount, itemCount) {
  if (entryCount === 0) {
    return 'Nothing could be read as a meal. Every line is listed below with the reason, so nothing '
      + 'has been lost.';
  }
  const read = `Read ${plural(entryCount, 'meal')} across ${plural(dayCount, 'day')}, holding `
    + `${plural(itemCount, 'food')}.`;
  const left = reading.could_not_place.length === 0
    ? ' Every line was placed.'
    : ` ${plural(reading.could_not_place.length, 'line')} could not be placed and ${
      reading.could_not_place.length === 1 ? 'is' : 'are'} listed below.`;
  const asked = reading.ambiguous.length === 0
    ? ''
    : ` ${plural(reading.ambiguous.length, 'reading')} needs your eye.`;
  return `${read}${left}${asked} Nothing is saved until you say so.`;
}

// ── small shared parts ────────────────────────────────────────────────────────────────────────────

/**
 * The paste as lines, with the carriage returns of a spreadsheet copy taken off.
 * @param {string} text
 * @returns {string[]}
 */
function splitLines(text) {
  if (text.length === 0) return [];
  return text.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

/**
 * @param {string} text
 * @returns {string}
 */
function withoutLeadingSeparators(text) {
  let cleaned = text;
  while (cleaned.length > 0 && ':-–—'.includes(cleaned[0])) cleaned = cleaned.slice(1).trimStart();
  return cleaned;
}

/** @param {unknown} value */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {number} value */
function twoDigits(value) {
  return value < 10 ? `0${String(value)}` : String(value);
}

/**
 * `1 line`, `3 lines` — so a report never reads like machinery.
 * @param {number} count @param {string} noun
 * @returns {string}
 */
function plural(count, noun) {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}
