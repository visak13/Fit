/**
 * THE IMPORT SUITE — driven with plans written the way a person writes them, not the way a parser
 * would like them written.
 *
 * The bar for this action is not "a well-formed paste round-trips". It is that a MESSY paste is
 * either placed or NAMED, that nothing is invented on the way, and that the coach is told what
 * changed. So every fixture below is deliberately imperfect — a quoted cell holding commas, a
 * twelve-hour clock, a missing label, a blank line mid-block, a line that is not a meal at all —
 * and the assertions are mostly about what the REPORT says rather than about what the draft holds.
 *
 * Two of these carry the weight:
 *
 *  - **NOTHING IS SILENTLY DROPPED** proves the line accounting is a partition of the paste, so a
 *    line cannot vanish between the buckets, and that every unplaced line is quoted back verbatim.
 *  - **NOTHING IS INVENTED** takes the finished draft apart and traces every day, every time and
 *    every food back to the text it came from or to the change that was declared for it.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateDietPlan } from '../model/entities/diet-plan.js';
import { DIET_PLAN_STATUSES } from '../model/vocabularies.js';
import { formatIssues } from '../model/issues.js';
import { importDietPlan, readPastedCells, splitFoods } from './import.js';
import { WEEKDAYS, weekdayNameOf } from './week.js';
import { CLIENT_A } from './testing.js';

/** What the screen knows and a paste never does. */
const KNOWN = { client_id: CLIENT_A, name: 'Transcribed from the nutritionist' };

/** Loose day-headed text: a day on its own line, meals beneath, and one line that is not a meal. */
const LOOSE = [
  'Monday',
  '8:00 Breakfast - Oats, milk',
  '1 pm Lunch: Chicken, rice, salad',
  '',
  'Tues:',
  '07.30 Breakfast: Eggs',
  '2 eggs on toast',
  '19:30 Dinner - Soup',
].join('\n');

/** A spreadsheet paste with the days across the top, commas, and quoted cells holding commas. */
const COLUMNS = [
  'Time,Slot,Monday,Tuesday,Wednesday',
  '08:00,Breakfast,"Oats, milk",Eggs on toast,"Yoghurt, berries"',
  '13:00,Lunch,Chicken and rice,,Fish',
  '7.30pm,Dinner,Soup,Steak,',
].join('\n');

/** A spreadsheet paste with a day in the first cell of every row, tab separated, one label absent. */
const ROWS = [
  'Monday\t08:00\tBreakfast\tOats',
  'Monday\t13:00\t\tChicken',
  'Wednesday\t19:00\tDinner\tSoup',
].join('\n');

// ── the chosen constant is the record's, not this module's ────────────────────────────────────────

test('THE IMPORTED STATUS IS A REAL MEMBER of the record\'s own vocabulary', () => {
  const { draft } = importDietPlan(LOOSE, KNOWN);

  assert.ok(DIET_PLAN_STATUSES.includes(draft.status),
    `import chose "${draft.status}", which is not one of ${DIET_PLAN_STATUSES.join(', ')}`);
  // Non-vacuity: the same check really can fail, so the assertion above is about the value.
  assert.ok(!DIET_PLAN_STATUSES.includes('imported'));
});

// ── the three shapes ──────────────────────────────────────────────────────────────────────────────

test('LOOSE DAY-HEADED TEXT: a day on its own line, the meals beneath it', () => {
  const { draft, report } = importDietPlan(LOOSE, KNOWN);

  assert.deepEqual(draft.days.map((day) => day.day), [1, 2]);
  assert.deepEqual(draft.days[0].entries, [
    { time: '08:00', label: 'Breakfast', items: ['Oats', 'milk'], notes: null },
    { time: '13:00', label: 'Lunch', items: ['Chicken', 'rice', 'salad'], notes: null },
  ]);
  assert.deepEqual(draft.days[1].entries, [
    { time: '07:30', label: 'Breakfast', items: ['Eggs'], notes: null },
    { time: '19:30', label: 'Dinner', items: ['Soup'], notes: null },
  ]);
  assert.ok(report.layout.includes('day names on the lines themselves'));
});

test('A SPREADSHEET WITH DAYS ACROSS THE TOP, including a quoted cell holding commas', () => {
  const { draft, report } = importDietPlan(COLUMNS, KNOWN);

  assert.ok(report.layout.includes('across the top'));
  assert.deepEqual(draft.days.map((day) => day.day), [1, 2, 3]);

  // THE QUOTED CELL: the quotes held it together as ONE column, and the foods inside it are two.
  const mondayBreakfast = draft.days[0].entries[0];
  assert.deepEqual(mondayBreakfast, {
    time: '08:00', label: 'Breakfast', items: ['Oats', 'milk'], notes: null,
  });
  // Had the quotes been ignored, `milk` would have become the TUESDAY column and every day after it
  // would have shifted one place — a chart that reads perfectly and is wrong.
  assert.deepEqual(draft.days[1].entries[0].items, ['Eggs on toast']);
  assert.deepEqual(draft.days[2].entries[0].items, ['Yoghurt', 'berries']);

  // An EMPTY cell is a day with nothing at that time, not a line to complain about.
  assert.deepEqual(draft.days[1].entries.map((entry) => entry.time), ['08:00', '19:30']);
  assert.deepEqual(draft.days[2].entries.map((entry) => entry.time), ['08:00', '13:00']);
  assert.deepEqual(report.could_not_place, []);
});

test('A SPREADSHEET WITH THE DAY IN THE FIRST CELL, tab separated, one label missing', () => {
  const { draft, report } = importDietPlan(ROWS, KNOWN);

  assert.deepEqual(draft.days.map((day) => day.day), [1, 3]);
  assert.deepEqual(draft.days[0].entries, [
    { time: '08:00', label: 'Breakfast', items: ['Oats'], notes: null },
    // THE MISSING LABEL: the slot column was empty and the food is still here, under no label.
    { time: '13:00', label: null, items: ['Chicken'], notes: null },
  ]);
  assert.deepEqual(draft.days[1].entries, [
    { time: '19:00', label: 'Dinner', items: ['Soup'], notes: null },
  ]);
  assert.deepEqual(report.could_not_place, []);
});

// ── normalising what people write ─────────────────────────────────────────────────────────────────

test('TIMES ARE NORMALISED to the record\'s form, and every change is NAMED', () => {
  const { draft, report } = importDietPlan([
    'Monday', '8:00 Breakfast - Oats', '7.30pm Dinner - Soup', '1 pm Lunch - Rice',
  ].join('\n'), KNOWN);

  assert.deepEqual(draft.days[0].entries.map((entry) => entry.time), ['08:00', '13:00', '19:30']);

  const changed = report.changed.join('\n');
  assert.ok(changed.includes('"8:00" was read as 08:00'), changed);
  assert.ok(changed.includes('"7.30pm" was read as 19:30'), changed);
  assert.ok(changed.includes('"1 pm" was read as 13:00'), changed);
  // Each one names its line, so the coach can go and look at it.
  for (const sentence of report.changed) assert.ok(sentence.startsWith('Line '), sentence);
});

test('DAY NAMES ARE RESOLVED THROUGH THE SHARED TABLE, in the forms people write them', () => {
  const written = ['MONDAY', 'tues', 'Weds', 'thur', 'Fri:', 'sat', 'Sun -'];

  for (let at = 0; at < written.length; at += 1) {
    const { draft } = importDietPlan(`${written[at]}\n08:00 Oats`, KNOWN);
    assert.deepEqual(draft.days.map((day) => day.day), [WEEKDAYS[at].day],
      `"${written[at]}" must resolve to ${WEEKDAYS[at].name}`);
  }

  // THE POINT OF THE SHARED TABLE: what the importer files under is what the chart labels it. If
  // these two ever disagree the coach imports into Tuesday and reads it under Wednesday, with
  // nothing erroring anywhere.
  const { draft } = importDietPlan('Tues\n08:00 Oats', KNOWN);
  assert.equal(weekdayNameOf(draft.days[0].day), 'Tuesday');
});

test('A CELL HOLDING SEVERAL FOODS becomes several items — but a choice is not split', () => {
  assert.deepEqual(splitFoods('Oats, milk'), ['Oats', 'milk']);
  assert.deepEqual(splitFoods('Chicken; rice; salad'), ['Chicken', 'rice', 'salad']);
  assert.deepEqual(splitFoods('Eggs + toast'), ['Eggs', 'toast']);
  assert.deepEqual(splitFoods('Oats with milk'), ['Oats with milk']);
  assert.deepEqual(splitFoods('Chicken and rice'), ['Chicken and rice']);
  // `rice/potato` is a CHOICE of one food. Splitting it would tell the client to eat both.
  assert.deepEqual(splitFoods('rice/potato'), ['rice/potato']);
  assert.deepEqual(splitFoods('  Oats.  ,  , milk '), ['Oats', 'milk']);
});

test('QUOTED CELLS, doubled quotes and an unclosed quote', () => {
  assert.deepEqual(readPastedCells('08:00,Breakfast,"Oats, milk",Eggs').cells,
    ['08:00', 'Breakfast', 'Oats, milk', 'Eggs']);
  assert.deepEqual(readPastedCells('a,"say ""hi""",b').cells, ['a', 'say "hi"', 'b']);
  assert.equal(readPastedCells('a,"never closed,b').unclosed_quote, true);
  assert.equal(readPastedCells('a,b').unclosed_quote, false);
  // A tab wins where there is one, so a food name may hold a comma with no quotes at all.
  assert.deepEqual(readPastedCells('08:00\tOats, milk').cells, ['08:00', 'Oats, milk']);
});

test('AN UNCLOSED QUOTE IS ASKED ABOUT rather than absorbed', () => {
  const { report } = importDietPlan('Monday\n08:00 Breakfast - "Oats, milk', KNOWN);

  assert.equal(report.ambiguous.length, 1);
  assert.equal(report.ambiguous[0].line, 2);
  assert.ok(report.ambiguous[0].question.includes('never closes'));
});

// ── refusing to guess ─────────────────────────────────────────────────────────────────────────────

test('AN UNRECOGNISABLE LINE IS NAMED, quoted back, and given a reason', () => {
  const { report } = importDietPlan(LOOSE, KNOWN);

  assert.equal(report.could_not_place.length, 1);
  const [unplaced] = report.could_not_place;
  assert.equal(unplaced.line, 7);
  // Quoted back EXACTLY, so nothing has to be retyped from memory.
  assert.equal(unplaced.text, '2 eggs on toast');
  assert.ok(unplaced.reason.includes('No time could be read'), unplaced.reason);
});

test('A BARE NUMBER IS A QUANTITY, NEVER A TIME', () => {
  const { draft, report } = importDietPlan('Monday\n2 eggs on toast\n3 rice cakes', KNOWN);

  assert.deepEqual(draft.days, [], 'reading `2` as 02:00 would invent a meal at two in the morning');
  assert.deepEqual(report.could_not_place.map((line) => line.text),
    ['2 eggs on toast', '3 rice cakes']);
});

test('A MEAL WITH NO DAY ABOVE IT IS NOT FILED UNDER A GUESS', () => {
  const { draft, report } = importDietPlan('08:00 Breakfast - Oats\n13:00 Lunch - Rice', KNOWN);

  assert.deepEqual(draft.days, []);
  assert.equal(report.could_not_place.length, 2);
  for (const line of report.could_not_place) {
    assert.ok(line.reason.includes('No day has been named yet'), line.reason);
  }
});

test('A TIME WITH NO FOOD AFTER IT IS REPORTED, not stored as an empty meal', () => {
  const { draft, report } = importDietPlan('Monday\n08:00 Breakfast\n13:00 Lunch - Rice', KNOWN);

  assert.deepEqual(draft.days[0].entries.map((entry) => entry.time), ['13:00']);
  assert.equal(report.could_not_place.length, 1);
  assert.ok(report.could_not_place[0].reason.includes('the slot "Breakfast"'),
    report.could_not_place[0].reason);
  assert.ok(report.could_not_place[0].reason.includes('no food is written'));
});

test('AN EARLY HOUR WITH NO AM OR PM IS ASKED ABOUT, and read exactly as written', () => {
  const { draft, report } = importDietPlan('Monday\n1:00 Lunch - Chicken', KNOWN);

  // Read literally. Choosing 13:00 because lunch is usually at lunchtime would be the app deciding
  // what the nutritionist wrote.
  assert.equal(draft.days[0].entries[0].time, '01:00');
  assert.equal(report.ambiguous.length, 1);
  assert.ok(report.ambiguous[0].question.includes('13:00'), report.ambiguous[0].question);

  // And a time that says pm is not asked about.
  assert.deepEqual(importDietPlan('Monday\n1:00pm Lunch - Chicken', KNOWN).report.ambiguous, []);
  assert.deepEqual(importDietPlan('Monday\n08:00 Breakfast - Oats', KNOWN).report.ambiguous, []);
});

test('EXTRA COLUMNS BEYOND THE DAY HEADINGS are reported, never quietly cut off', () => {
  const { report } = importDietPlan([
    'Time,Monday,Tuesday',
    '08:00,Oats,Eggs,Yoghurt',
  ].join('\n'), KNOWN);

  assert.equal(report.could_not_place.length, 1);
  assert.equal(report.could_not_place[0].text, 'Yoghurt');
  assert.ok(report.could_not_place[0].reason.includes('more columns than the heading'));
});

test('A COLUMN THE HEADING DOES NOT NAME AS A DAY IS REPORTED, wherever it sits', () => {
  // BETWEEN two day columns. The row places food under both days, so the line counts as placed —
  // and the cell in the middle still belongs to no day and must be said out loud.
  const between = importDietPlan([
    'Time,Monday,Kcal,Tuesday',
    '08:00,Oats,500,Eggs',
  ].join('\n'), KNOWN);

  assert.deepEqual(
    between.draft.days.map((day) => day.entries.map((entry) => entry.items)),
    [[['Oats']], [['Eggs']]],
    'the food that COULD be placed is still placed',
  );
  assert.equal(between.report.could_not_place.length, 1);
  assert.equal(between.report.could_not_place[0].text, '500');
  assert.ok(between.report.could_not_place[0].reason.includes('does not name as a day'));

  // BEFORE the days, past the cell the label came from. The label is read; the rest is not, and a
  // cell nothing read is a cell the coach has to be told about.
  const leading = importDietPlan([
    'Time,Slot,Kcal,Monday,Tuesday',
    '08:00,Breakfast,500,Oats,Eggs',
  ].join('\n'), KNOWN);

  assert.equal(leading.draft.days[0].entries[0].label, 'Breakfast', 'the label is still read');
  assert.equal(leading.report.could_not_place.length, 1);
  assert.equal(leading.report.could_not_place[0].text, '500');

  // And the ordinary shape reports NOTHING — this must not fire on every well-formed paste.
  const clean = importDietPlan([
    'Time,Slot,Monday,Tuesday',
    '08:00,Breakfast,Oats,Eggs',
  ].join('\n'), KNOWN);
  assert.deepEqual(clean.report.could_not_place, []);
});

// ── the two that carry the weight ─────────────────────────────────────────────────────────────────

test('NOTHING IS SILENTLY DROPPED: the accounting is a PARTITION of the paste', () => {
  const pastes = [LOOSE, COLUMNS, ROWS, '', 'nonsense\n\nmore nonsense',
    'Monday\n\n\n08:00 Oats\n\nTuesday\n09:00 Eggs'];

  for (const paste of pastes) {
    const { report } = importDietPlan(paste, KNOWN);
    const a = report.line_accounting;

    assert.equal(a.blank + a.day_heading + a.column_heading + a.placed + a.unplaced, a.total,
      `a line fell between the buckets in:\n${paste}`);
    assert.equal(a.total, paste.length === 0 ? 0 : paste.split('\n').length);

    // Every line that produced nothing is quoted back. `unplaced` counts whole lines; a partly read
    // line is `placed` and still contributes its leftover, so this is a floor, not an equality.
    assert.ok(report.could_not_place.length >= a.unplaced,
      `${String(a.unplaced)} lines produced nothing but only ${
        String(report.could_not_place.length)} are reported`);
    for (const line of report.could_not_place) {
      assert.ok(line.line >= 1 && line.line <= a.total);
      assert.ok(line.text.length > 0);
      assert.ok(line.reason.length > 0);
    }
  }
});

test('A BLANK LINE MID-BLOCK does not end the day beneath its heading', () => {
  const { draft, report } = importDietPlan(
    'Monday\n\n08:00 Breakfast - Oats\n\n\n13:00 Lunch - Rice\n\nTuesday\n\n09:00 Breakfast - Eggs',
    KNOWN);

  assert.deepEqual(draft.days.map((day) => day.day), [1, 2]);
  assert.deepEqual(draft.days[0].entries.map((entry) => entry.time), ['08:00', '13:00']);
  assert.deepEqual(draft.days[1].entries.map((entry) => entry.time), ['09:00']);
  assert.equal(report.line_accounting.blank, 5);
  assert.deepEqual(report.could_not_place, []);
});

test('NOTHING IS INVENTED: every day, time and food in the draft traces back to the paste', () => {
  for (const paste of [LOOSE, COLUMNS, ROWS]) {
    const { draft, report } = importDietPlan(paste, KNOWN);
    // What the coach was TOLD was changed is allowed to differ from the paste. Nothing else is.
    const declared = `${paste}\n${report.changed.join('\n')}`;

    assert.ok(draft.days.length > 0, 'this fixture must produce something to trace');
    for (const day of draft.days) {
      assert.ok(declared.includes(weekdayNameOf(day.day)),
        `${weekdayNameOf(day.day)} is in the draft but was never written or declared`);
      for (const entry of day.entries) {
        assert.ok(declared.includes(entry.time),
          `${entry.time} is in the draft but was never written or declared`);
        if (entry.label !== null) {
          assert.ok(paste.includes(entry.label), `the label "${entry.label}" was not in the paste`);
        }
        for (const item of entry.items) {
          assert.ok(paste.includes(item), `the food "${item}" was not in the paste`);
        }
      }
    }
  }

  // NON-VACUITY: the same trace really does catch something that was not written.
  const { draft } = importDietPlan(LOOSE, KNOWN);
  assert.ok(!LOOSE.includes('Porridge'), 'the probe must name something absent');
  draft.days[0].entries[0].items.push('Porridge');
  assert.ok(!draft.days[0].entries[0].items.every((item) => LOOSE.includes(item)));
});

// ── the record judges the draft ───────────────────────────────────────────────────────────────────

test('THE RECORD ACCEPTS A DRAFT built from a real paste', () => {
  const { draft, report } = importDietPlan(COLUMNS, KNOWN);
  const verdict = validateDietPlan(draft);

  assert.ok(verdict.ok, formatIssues(verdict));
  assert.equal(report.ok, true);
  assert.deepEqual(report.record_refusals, []);
});

test('THE RECORD\'S OWN REFUSAL SENTENCE is carried through UNCHANGED', () => {
  // No client and no name: a paste carries neither, and this module refuses to invent them.
  const { draft, report } = importDietPlan(LOOSE);

  assert.equal(draft.client_id, null);
  assert.equal(draft.name, null);
  assert.equal(report.ok, false);

  const verdict = validateDietPlan(draft);
  assert.deepEqual(
    report.record_refusals,
    verdict.issues.map((issue) => ({ path: issue.path, code: issue.code, message: issue.message })),
    'a reworded refusal is a second copy of a rule, and the copy is the one that drifts');
  assert.ok(report.record_refusals.some((refusal) => refusal.path === 'client_id'));
});

test('THE MODEL OWNS THE BOUNDS: an over-long food is refused by the RECORD, not pre-judged here', () => {
  const long = 'x'.repeat(200);
  const { draft, report } = importDietPlan(`Monday\n08:00 Breakfast - ${long}`, KNOWN);

  // The food is carried into the draft whole — truncating it here would quietly change what the
  // nutritionist wrote, and the record is what says how long a food may be.
  assert.equal(draft.days[0].entries[0].items[0], long);
  assert.equal(report.ok, false);
  assert.ok(report.record_refusals.some((refusal) => refusal.code === 'LENGTH'),
    JSON.stringify(report.record_refusals));
});

// ── the draft itself ──────────────────────────────────────────────────────────────────────────────

test('FEWER THAN SEVEN DAYS stays fewer than seven days', () => {
  const { draft } = importDietPlan('Monday\n08:00 Oats\nFriday\n08:00 Eggs', KNOWN);

  assert.equal(draft.days.length, 2);
  assert.deepEqual(draft.days.map((day) => day.day), [1, 5]);
  for (const day of draft.days) assert.ok(day.entries.length >= 1);
});

test('ENTRIES COME BACK IN TIME ORDER, sorted as TIMES', () => {
  const { draft } = importDietPlan(
    'Monday\n13:00 Lunch - Rice\n9:00 Breakfast - Oats\n10:30 Snack - Nuts', KNOWN);

  assert.deepEqual(draft.days[0].entries.map((entry) => entry.time), ['09:00', '10:30', '13:00']);
  // Non-vacuity: sorted as text, `9:00` would have come last. The times above are normalised first,
  // so the guard is that the ORDER follows the clock and not the order they were written.
  assert.deepEqual(['13:00', '9:00', '10:30'].slice().sort(), ['10:30', '13:00', '9:00']);
});

test('NO DATE IS INVENTED and nothing is stored', () => {
  const { draft } = importDietPlan(COLUMNS, KNOWN);

  assert.equal(draft.effective_from, null);
  assert.equal(draft.effective_to, null);
  assert.equal(draft.notes, null);
  assert.equal(draft.source_note, null);
  // The record is closed; the draft carries its fields and nothing else — no record_id, no rev, no
  // marker that anything was written, because import writes nothing.
  assert.deepEqual(Object.keys(draft).sort(), [
    'client_id', 'days', 'effective_from', 'effective_to', 'name', 'notes', 'source_note', 'status',
  ]);
});

test('WHAT THE SCREEN KNOWS IS CARRIED, and only that', () => {
  const { draft } = importDietPlan(COLUMNS,
    { ...KNOWN, source_note: 'From the nutritionist, 25 July' });

  assert.equal(draft.client_id, CLIENT_A);
  assert.equal(draft.name, 'Transcribed from the nutritionist');
  assert.equal(draft.source_note, 'From the nutritionist, 25 July');
});

test('EMPTY AND RUBBISH INPUT answer rather than throw', () => {
  for (const input of ['', '   ', '\n\n\n', 'hello', null, undefined, 42, {}, []]) {
    const { draft, report } = importDietPlan(/** @type {any} */ (input), KNOWN);
    assert.deepEqual(draft.days, []);
    assert.equal(report.ok, false);
    assert.ok(report.statement.length > 0);
  }
  assert.ok(importDietPlan('', KNOWN).report.statement.includes('nothing has been lost'));
});

// ── the report reads like a person wrote it ───────────────────────────────────────────────────────

test('THE REPORT SAYS WHAT IT UNDERSTOOD, in sentences', () => {
  const { report } = importDietPlan(LOOSE, KNOWN);

  assert.equal(report.day_count, 2);
  assert.equal(report.entry_count, 4);
  assert.equal(report.item_count, 7);

  const understood = report.understood.join(' ');
  assert.ok(understood.includes('Monday, Tuesday'), understood);
  assert.ok(understood.includes('4 meals'), understood);
  assert.ok(understood.includes('7 foods'), understood);
  assert.ok(report.statement.includes('1 line could not be placed'), report.statement);
  assert.ok(report.statement.includes('Nothing is saved until you say so.'));

  // Singular and plural, because a report that says "1 lines" reads like machinery.
  assert.ok(importDietPlan('Monday\n08:00 Oats', KNOWN).report.statement.includes('1 meal across 1 day'));
});

// ── purity, for the one function this suite owns ──────────────────────────────────────────────────

test('SAME PASTE, SAME ANSWER — and the input is not touched', () => {
  const options = { ...KNOWN };
  const first = importDietPlan(LOOSE, options);
  const second = importDietPlan(LOOSE, options);

  assert.deepEqual(first, second);
  assert.deepEqual(options, KNOWN, 'the options handed in are not written to');

  // A different paste in between changes nothing.
  importDietPlan(COLUMNS, KNOWN);
  assert.deepEqual(importDietPlan(LOOSE, options), first);
});

test('THE PACKAGE PURITY SCAN REALLY REACHES THIS FILE', () => {
  // `purity.test.js` proves no shipped file in this package touches a browser or the store, and it
  // DISCOVERS its own scope by walking the directory rather than carrying a list. That is the right
  // shape — but it means a new file is covered only if the walk finds it, and a walk that missed it
  // would report exactly what a clean file reports. So the claim "import writes nothing to the
  // store" is anchored here, on the file this suite is about.
  const here = dirname(fileURLToPath(import.meta.url));
  const discovered = readdirSync(here)
    .filter((name) => name.endsWith('.js') && !name.endsWith('.test.js'));

  assert.ok(discovered.includes('import.js'),
    `the package scan walks this directory and must see the importer: ${discovered.join(', ')}`);

  const source = readFileSync(join(here, 'import.js'), 'utf8');
  for (const forbidden of ['/store/', '/crypto/', '/sync/', '/outbox/', 'node:']) {
    assert.ok(!source.includes(`from '${forbidden}`) && !source.includes(forbidden),
      `import.js must not reach ${forbidden}: a draft is offered, never written`);
  }
  // NON-VACUITY: the same read really can find a store import when a file has one.
  assert.ok(readFileSync(join(here, '..', 'seed', 'reset.js'), 'utf8').includes('/store/'),
    'the check can see a store import when there is one');
});

test('NO CLOCK AND NO RANDOMNESS: import runs with both taken away', () => {
  const realNow = Date.now;
  const realRandom = Math.random;
  const trip = (what) => () => { throw new Error(`the diet import reached for ${what}`); };

  try {
    Date.now = trip('the clock');
    Math.random = trip('a random number');
    // The traps are ARMED — otherwise what follows is evidence about a trap that never installed.
    assert.throws(() => Date.now(), /reached for the clock/);
    assert.throws(() => Math.random(), /reached for a random number/);

    const { draft } = importDietPlan(COLUMNS, KNOWN);
    assert.equal(draft.days.length, 3, 'and it read the whole paste anyway');
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }

  assert.equal(typeof Date.now(), 'number', 'the clock is put back where it was found');
});
