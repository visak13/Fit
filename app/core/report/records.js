/**
 * READING A STORED RECORD — the small, shared act every projection in this package starts with.
 *
 * Records arrive from the store inside the sync envelope: `{record_id, deleted, content}`. A test, a
 * screen holding something unsaved, and a caller that has already unwrapped one all have the bare
 * content instead. Both are accepted here, in one place, so the trend, the attendance and the
 * narrative cannot disagree about what a "reading" or a "session" is — and so none of them has to
 * know.
 *
 * This mirrors `core/diet/plan.js` deliberately. It does not validate: `core/model/entities/*` owns
 * every rule about fields and shapes, and a second copy of a rule is a copy that drifts. This module
 * only reaches fields, defends against a missing one so a projection never throws on a half-written
 * history, and hands what it found onward unchanged.
 *
 * Pure. No clock, no store, no browser.
 */

import { isPlainObject } from '../model/primitives.js';

/**
 * The content, given either an envelope or a bare record.
 * @param {unknown} record
 * @returns {Record<string, any>}
 */
export function contentOf(record) {
  if (!isPlainObject(record)) return {};
  const envelope = /** @type {Record<string, any>} */ (record);
  if (isPlainObject(envelope.content)) return /** @type {Record<string, any>} */ (envelope.content);
  return envelope;
}

/**
 * The record's stable identity, or null for something never stored.
 * @param {unknown} record
 * @returns {string|null}
 */
export function recordIdOf(record) {
  if (!isPlainObject(record)) return null;
  const envelope = /** @type {Record<string, any>} */ (record);
  return typeof envelope.record_id === 'string' ? envelope.record_id : null;
}

/**
 * True when the record is an envelope carrying a tombstone.
 *
 * A deleted record is skipped rather than shown. The store's own queries already exclude them, and a
 * report that carried one anyway would show a client something the coach had removed.
 *
 * @param {unknown} record
 * @returns {boolean}
 */
export function isDeletedRecord(record) {
  return isPlainObject(record) && /** @type {Record<string, any>} */ (record).deleted === true;
}

/**
 * The live records of a list, each paired with its identity.
 *
 * Tombstones and anything that is not a record at all are dropped, and the count of what was dropped
 * comes back with them — an absence nobody counted is indistinguishable from an input that was empty
 * to begin with.
 *
 * @param {unknown} records
 * @returns {{rows: Array<{record_id: string|null, content: Record<string, any>}>, dropped: number}}
 */
export function liveRecords(records) {
  if (!Array.isArray(records)) return { rows: [], dropped: 0 };

  const rows = [];
  let dropped = 0;
  for (const record of records) {
    if (!isPlainObject(record) || isDeletedRecord(record)) {
      dropped += 1;
      continue;
    }
    const content = contentOf(record);
    if (Object.keys(content).length === 0) {
      dropped += 1;
      continue;
    }
    rows.push({ record_id: recordIdOf(record), content });
  }
  return { rows, dropped };
}

/**
 * A timestamp, or null when the field is missing or is not a string.
 *
 * Everything in this package orders by the record's OWN instants and never by today's date, so a
 * timestamp that cannot be read is reported as absent rather than replaced with now.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function instantOf(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * A non-empty string, or null. The same defence as {@link instantOf} for the fields that are
 * identities rather than instants, kept separate so neither reads as the other.
 * @param {unknown} value
 * @returns {string|null}
 */
export function textOf(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Ascending by instant, with unreadable instants sorted last so they never masquerade as the
 * earliest point of a trend.
 *
 * @param {{at: string|null}} a @param {{at: string|null}} b
 * @returns {number}
 */
export function byInstant(a, b) {
  if (a.at === b.at) return 0;
  if (a.at === null) return 1;
  if (b.at === null) return -1;
  return a.at < b.at ? -1 : 1;
}
