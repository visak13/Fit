/**
 * THE DIET PLAN record.
 *
 * A per-client food plan laid out by DAY and by HOUR across a week that repeats. The coach's
 * wife is the nutritionist; he transcribes her plans into the app, which is why the shape
 * favours repeated structure being cheap to express, and why an import path matters more
 * here than a beautiful cell-by-cell editor.
 *
 * Each client accumulates a HISTORY of plans, so the coach can see what a client follows now
 * against what they followed before. `status` records that explicitly rather than leaving it
 * to be inferred from dates: "the current plan" is a fact he sets, not an arithmetic result
 * that changes silently at midnight.
 *
 * ## Plaintext. Explicitly, and by a decision made against the opposite argument
 *
 * The case for treating a diet as sensitive was put — a renal, diabetic or coeliac plan is
 * diagnostic on its face — and was considered and rejected for this practice. The plans here
 * are a food chart. So a diet plan carries NO encryption, NO sensitivity flag and NO export
 * gating, and a diet export is always openable with no passphrase and no friction.
 *
 * That is recorded here so a later step does not re-open it by instinct and quietly add a
 * lock the coach then has to fight while a client waits for their chart.
 */

import { CODES, Collector } from '../issues.js';
import {
  checkDate, checkEnum, checkInteger, checkIsRecord, checkNoUnknownKeys, checkRecordId,
  checkString, checkStringArray, checkChronological, isPlainObject,
} from '../primitives.js';
import { DIET_PLAN_STATUSES } from '../vocabularies.js';
import { TIME_OF_DAY_PATTERN } from '../primitives.js';

/** @type {readonly string[]} */
export const DIET_PLAN_FIELDS = Object.freeze([
  'client_id', 'name', 'status', 'effective_from', 'effective_to',
  'days', 'notes', 'source_note',
]);

/** @type {readonly string[]} */
export const DIET_DAY_FIELDS = Object.freeze(['day', 'entries']);

/** @type {readonly string[]} */
export const DIET_ENTRY_FIELDS = Object.freeze(['time', 'label', 'items', 'notes']);

/**
 * Validate one diet plan.
 * @param {unknown} plan
 * @returns {import('../issues.js').ValidationResult}
 */
export function validateDietPlan(plan) {
  const c = new Collector();
  if (!checkIsRecord(c, plan)) return c.result();
  const p = /** @type {Record<string, any>} */ (plan);

  checkNoUnknownKeys(c, p, DIET_PLAN_FIELDS);

  checkRecordId(c, 'client_id', p.client_id, { required: true });
  checkString(c, 'name', p.name, { required: true, min: 1, max: 80 });
  checkEnum(c, 'status', p.status, DIET_PLAN_STATUSES, { required: true });
  checkDate(c, 'effective_from', p.effective_from);
  checkDate(c, 'effective_to', p.effective_to);
  checkChronological(c, 'effective_to', p.effective_from, p.effective_to,
    'A plan cannot stop applying before it starts.');
  checkString(c, 'notes', p.notes, { max: 4000 });
  // Who authored the plan the coach transcribed, in his own words.
  checkString(c, 'source_note', p.source_note, { max: 200 });

  checkDays(c, p.days);

  return c.result();
}

/**
 * The week chart: up to seven days, each a list of timed entries in the order they occur.
 * @param {Collector} c
 * @param {unknown} days
 */
function checkDays(c, days) {
  const d = c.at('days');
  if (days === undefined || days === null) {
    d.add('', CODES.REQUIRED, 'A plan needs at least one day.');
    return;
  }
  if (!Array.isArray(days)) {
    d.add('', CODES.TYPE, 'Expected a list of days.');
    return;
  }
  if (days.length < 1 || days.length > 7) {
    d.add('', CODES.LENGTH, 'A plan holds between one and seven days.');
  }
  const seenDays = new Set();
  days.forEach((day, i) => {
    const at = c.at(`days[${i}]`);
    if (!isPlainObject(day)) {
      at.add('', CODES.TYPE, 'Expected a day object.');
      return;
    }
    const rec = /** @type {Record<string, any>} */ (day);
    checkNoUnknownKeys(at, rec, DIET_DAY_FIELDS);
    if (checkInteger(at, 'day', rec.day, { required: true, min: 1, max: 7 })) {
      if (seenDays.has(rec.day)) {
        at.add('day', CODES.DUPLICATE, `Day ${rec.day} appears more than once.`);
      }
      seenDays.add(rec.day);
    }
    checkEntries(at, rec.entries);
  });
}

/**
 * @param {Collector} at Collector scoped to one day.
 * @param {unknown} entries
 */
function checkEntries(at, entries) {
  const e = at.at('entries');
  if (entries === undefined || entries === null) {
    e.add('', CODES.REQUIRED, 'A day needs at least one entry.');
    return;
  }
  if (!Array.isArray(entries)) {
    e.add('', CODES.TYPE, 'Expected a list of entries.');
    return;
  }
  if (entries.length < 1) {
    e.add('', CODES.LENGTH, 'A day needs at least one entry.');
  }
  entries.forEach((entry, i) => {
    const en = at.at(`entries[${i}]`);
    if (!isPlainObject(entry)) {
      en.add('', CODES.TYPE, 'Expected an entry object.');
      return;
    }
    const rec = /** @type {Record<string, any>} */ (entry);
    checkNoUnknownKeys(en, rec, DIET_ENTRY_FIELDS);
    checkString(en, 'time', rec.time, {
      required: true,
      pattern: TIME_OF_DAY_PATTERN,
      patternHint: 'Use a 24-hour time such as 08:30.',
    });
    // "Breakfast", "Pre-workout" — what the coach calls this slot.
    checkString(en, 'label', rec.label, { max: 60 });
    checkStringArray(en, 'items', rec.items, {
      required: true,
      min: 1,
      max: 30,
      unique: false,
      each: (col, path, value) => checkString(col, path, value, { required: true, min: 1, max: 160 }),
    });
    checkString(en, 'notes', rec.notes, { max: 500 });
  });
}
