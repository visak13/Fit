/**
 * READING A STORED PLAN — the small, shared act both projections start with.
 *
 * A diet plan arrives from the store inside the sync envelope: `{record_id, deleted, content}`, with
 * the plan itself nested under `content`. A test, an import draft and a screen holding an unsaved
 * edit all have the bare plan instead. Both are accepted here, in one place, so the chart and the
 * history cannot disagree about what a "plan" is — and so neither of them has to know.
 *
 * `record_id` is the plan's identity. The plan CONTENT carries no id of its own: the record's field
 * list is `client_id, name, status, effective_from, effective_to, days, notes, source_note` and
 * nothing else, so a bare plan simply has no identity to report and says so with null rather than
 * inventing one.
 *
 * ## What this deliberately does not do
 *
 * It does not validate. `core/model/entities/diet-plan.js` owns every rule about field lengths, the
 * day range, the time pattern and the item bounds, and a second copy of a rule is a copy that
 * drifts. This module only reaches fields, defends against a missing one so a projection never
 * throws on a half-built draft, and hands what it found onward unchanged.
 *
 * Pure. No clock, no store, no browser.
 */

import { isPlainObject } from '../model/primitives.js';

/**
 * The plan content, given either an envelope or a bare plan.
 * @param {unknown} record
 * @returns {Record<string, any>}
 */
export function planContentOf(record) {
  if (!isPlainObject(record)) return {};
  const envelope = /** @type {Record<string, any>} */ (record);
  if (isPlainObject(envelope.content)) return /** @type {Record<string, any>} */ (envelope.content);
  return envelope;
}

/**
 * The plan's stable identity, or null for a plan that has never been stored.
 * @param {unknown} record
 * @returns {string|null}
 */
export function planIdOf(record) {
  if (!isPlainObject(record)) return null;
  const envelope = /** @type {Record<string, any>} */ (record);
  return typeof envelope.record_id === 'string' ? envelope.record_id : null;
}

/**
 * True when the record is an envelope carrying a tombstone.
 *
 * A deleted plan is skipped rather than shown: the store's own queries already exclude them, and a
 * projection that showed one anyway would put a plan the coach deleted back in front of him.
 *
 * @param {unknown} record
 * @returns {boolean}
 */
export function isDeletedPlan(record) {
  return isPlainObject(record) && /** @type {Record<string, any>} */ (record).deleted === true;
}

/**
 * The plan's days as a list, in the record's own order and without judgement about them.
 * @param {Record<string, any>} content
 * @returns {Record<string, any>[]}
 */
export function daysOf(content) {
  const { days } = content;
  return Array.isArray(days) ? days.filter(isPlainObject) : [];
}

/**
 * One day's entries as a list.
 * @param {Record<string, any>} day
 * @returns {Record<string, any>[]}
 */
export function entriesOf(day) {
  const { entries } = day;
  return Array.isArray(entries) ? entries.filter(isPlainObject) : [];
}

/**
 * One entry's items as a list of strings.
 * @param {Record<string, any>} entry
 * @returns {string[]}
 */
export function itemsOf(entry) {
  const { items } = entry;
  return Array.isArray(items) ? items.filter((item) => typeof item === 'string') : [];
}
