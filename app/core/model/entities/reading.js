/**
 * THE READING record — a measurement taken against a specific client.
 *
 * Heart rate, plank hold, hollow hold and the like: the numbers the coach captures with a
 * stopwatch or a verbal count, in session or just after it. They are per CLIENT, not per
 * session, for the same reason performed records are — a shared session still produces one
 * person's numbers — and the in-session interface must let him capture one against a
 * specific client quickly without leaving the routine.
 *
 * These are the numbers the client-facing progress report charts as TRENDS OVER TIME, which
 * is what makes a report read like a report rather than a dump of repetition counts. That is
 * the whole reason a reading is its own record with its own timestamp rather than a field
 * buried inside a session.
 *
 * ## The kind vocabulary is open, and the unit is pinned where it can be
 *
 * The kinds the app knows about each have exactly one sensible unit, so a plank recorded in
 * beats per minute is refused rather than charted. But everything in this app is
 * configurable, so a kind the coach invents is accepted too — it must be a well-formed key
 * and must name its unit explicitly, because there is no pinned unit to fall back on.
 *
 * `session_id` is optional: a reading may be taken outside a session entirely.
 */

import { CODES, Collector } from '../issues.js';
import {
  checkContentKey, checkEnum, checkIsRecord, checkNoUnknownKeys, checkNumber,
  checkRecordId, checkString, checkTimestamp, isAbsent,
} from '../primitives.js';
import { READING_CONTEXTS, READING_KINDS, READING_UNITS } from '../vocabularies.js';

/** @type {readonly string[]} */
export const READING_FIELDS = Object.freeze([
  'client_id', 'session_id', 'kind', 'value', 'unit', 'context', 'taken_at', 'note',
]);

/**
 * Validate one reading.
 * @param {unknown} reading
 * @returns {import('../issues.js').ValidationResult}
 */
export function validateReading(reading) {
  const c = new Collector();
  if (!checkIsRecord(c, reading)) return c.result();
  const r = /** @type {Record<string, any>} */ (reading);

  checkNoUnknownKeys(c, r, READING_FIELDS);

  checkRecordId(c, 'client_id', r.client_id, { required: true });
  // Optional: a reading may be taken outside a session.
  checkRecordId(c, 'session_id', r.session_id);
  const kindOk = checkContentKey(c, 'kind', r.kind, { required: true });
  checkNumber(c, 'value', r.value, { required: true, min: 0 });
  const unitOk = checkEnum(c, 'unit', r.unit, READING_UNITS, { required: true });
  checkEnum(c, 'context', r.context, READING_CONTEXTS, { required: true });
  checkTimestamp(c, 'taken_at', r.taken_at, { required: true });
  checkString(c, 'note', r.note, { max: 300 });

  if (kindOk && unitOk) {
    const pinned = READING_KINDS[r.kind];
    if (pinned && pinned !== r.unit) {
      c.add('unit', CODES.MISMATCH,
        `A ${r.kind} reading is measured in ${pinned}, not ${r.unit}.`);
    }
  }

  return c.result();
}

/**
 * The unit a known reading kind is measured in, or null for a kind the coach invented.
 * @param {string} kind
 * @returns {string|null}
 */
export function unitForKind(kind) {
  return READING_KINDS[kind] || null;
}

/**
 * True when this kind is one the app ships knowledge of, rather than one the coach added.
 * @param {string} kind
 * @returns {boolean}
 */
export function isKnownReadingKind(kind) {
  return !isAbsent(READING_KINDS[kind]);
}
