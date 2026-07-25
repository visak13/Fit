/**
 * THE IN-SESSION NOTE record.
 *
 * A note the coach captures at any moment during a session, without leaving the routine. In
 * a workout, notes go a long way — this is the record behind that.
 *
 * `client_id` is optional and the distinction matters: a note WITH a client is that person's
 * note and follows them into their progress view and their export; a note WITHOUT one is
 * about the session as a whole and belongs to nobody in particular. In a shared session
 * those are genuinely different things, and inferring one from the other would put one
 * client's note in another client's export.
 *
 * ## Plaintext, deliberately, and what that obliges the interface to say
 *
 * An in-session note is NOT a clinical field and is not encrypted. The ciphertext-bearing
 * set is exactly three fields on the client record and is not extended here.
 *
 * That is a decision with a consequence rather than an oversight: a free-text box invites
 * clinical detail, and clinical detail typed here would be stored, synced and backed up in
 * the clear. The interface that renders this record is therefore obliged to say, at the
 * point of entry, what a note is for — how the session went, what to adjust next time — and
 * that anything clinical belongs in the client's own reference, outside the app.
 */

import { Collector } from '../issues.js';
import {
  checkIsRecord, checkNoUnknownKeys, checkRecordId, checkString, checkTimestamp,
} from '../primitives.js';

/** @type {readonly string[]} */
export const SESSION_NOTE_FIELDS = Object.freeze([
  'session_id', 'client_id', 'text', 'taken_at',
]);

/**
 * Validate one in-session note.
 * @param {unknown} note
 * @returns {import('../issues.js').ValidationResult}
 */
export function validateSessionNote(note) {
  const c = new Collector();
  if (!checkIsRecord(c, note)) return c.result();
  const n = /** @type {Record<string, any>} */ (note);

  checkNoUnknownKeys(c, n, SESSION_NOTE_FIELDS);

  checkRecordId(c, 'session_id', n.session_id, { required: true });
  // Optional: absent means the note is about the session as a whole.
  checkRecordId(c, 'client_id', n.client_id);
  checkString(c, 'text', n.text, { required: true, min: 1, max: 2000 });
  checkTimestamp(c, 'taken_at', n.taken_at, { required: true });

  return c.result();
}
