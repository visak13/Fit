/**
 * THE SESSION record.
 *
 * ## One routine, one to many clients
 *
 * A session is not "a client plus a routine". It is a ROUTINE plus a SET of attending
 * clients — a single app instance always drives a SINGLE routine, however many people are in
 * the call. The rare case where two people in one call need different programmes is handled
 * by running two app instances side by side on the laptop, not by building parallel
 * timelines into one screen.
 *
 * That distinction is load-bearing for everything downstream. Each attending client keeps
 * their OWN readings, their OWN in-session notes and their OWN record of what was actually
 * performed, because the coach may modify an exercise for one tired client while the rest
 * continue. Those per-client facts are separate records — `performed-record`, `reading`,
 * `session-note` — each naming both the session and the client. Progress views and exports
 * remain strictly per client even though the session was shared.
 *
 * The number of clients in a session is genuinely unknown, so nothing here assumes a small
 * fixed roster. A typical session runs about an hour.
 *
 * ## Interruption is a normal state
 *
 * Real sessions are disturbed by power cuts, illness, phone calls and the browser closing.
 * `interrupted` is therefore a first-class status: an interrupted session resumes exactly
 * where it left off, and a half-finished session is still saved as a partial record rather
 * than lost or discarded.
 *
 * There is deliberately no field recording "which exercise the app thinks he should be on".
 * The routine is modular: he jumps, reorders, skips, repeats, substitutes and edits at will,
 * and what happened is reconstructed from the performed records rather than dictated by a
 * cursor. The app tracks what happened; it never dictates what happens next.
 *
 * ## The Meet link
 *
 * Both paths are supported on purpose. A link can be MINTED at session start through the
 * calendar, or PASTED in from a call that is already running — pasting costs almost nothing
 * and removes a hard dependency on a Google call succeeding at the moment a session begins.
 *
 * Only the joining URL is ever stored. A raw provider response object must never be put in
 * this record, a synced payload, a backup or an export: those responses embed the signed-in
 * account and internal identifiers, none of which is a credential and all of which would be
 * a leak into a client's hands.
 *
 * The roughly one-hour limit that applies elsewhere is on the app's API token and has
 * nothing to do with how long a call runs. Once a link exists the session may run for any
 * length, and the app could lose Google access entirely without affecting the call.
 */

import { CODES, Collector } from '../issues.js';
import {
  checkChronological, checkEnum, checkContentKey, checkIsRecord, checkNoUnknownKeys,
  checkRecordId, checkString, checkStringArray, checkTimestamp, isAbsent,
} from '../primitives.js';
import {
  ENDED_SESSION_STATUSES, MEET_SOURCES, SESSION_STATUSES, STARTED_SESSION_STATUSES,
} from '../vocabularies.js';

/** @type {readonly string[]} */
export const SESSION_FIELDS = Object.freeze([
  'routine_id', 'client_ids', 'status',
  'scheduled_at', 'started_at', 'ended_at',
  'meet_url', 'meet_source', 'summary',
]);

/** Upper bound on a session's roster. Generous — no small fixed roster is assumed. */
export const MAX_CLIENTS_PER_SESSION = 40;

/**
 * Validate one session content record.
 * @param {unknown} session
 * @returns {import('../issues.js').ValidationResult}
 */
export function validateSession(session) {
  const c = new Collector();
  if (!checkIsRecord(c, session)) return c.result();
  const s = /** @type {Record<string, any>} */ (session);

  checkNoUnknownKeys(c, s, SESSION_FIELDS);

  // EXACTLY ONE routine, always. Referenced by content key, because a routine is library
  // content and keeps its content key whether it was shipped or the coach built it.
  checkContentKey(c, 'routine_id', s.routine_id, { required: true });

  // ONE TO MANY attending clients, referenced by RECORD IDENTITY: a client is authored in
  // the app and has no content key.
  checkStringArray(c, 'client_ids', s.client_ids, {
    required: true,
    min: 1,
    max: MAX_CLIENTS_PER_SESSION,
    unique: true,
    each: (col, path, value) => checkRecordId(col, path, value, { required: true }),
  });

  const statusOk = checkEnum(c, 'status', s.status, SESSION_STATUSES, { required: true });
  checkTimestamp(c, 'scheduled_at', s.scheduled_at);
  checkTimestamp(c, 'started_at', s.started_at);
  checkTimestamp(c, 'ended_at', s.ended_at);
  checkString(c, 'summary', s.summary, { max: 2000 });

  checkMeet(c, s);

  if (statusOk) {
    if (STARTED_SESSION_STATUSES.includes(s.status) && isAbsent(s.started_at)) {
      c.add('started_at', CODES.REQUIRED,
        `A session that is "${s.status}" must record when it started.`);
    }
    if (ENDED_SESSION_STATUSES.includes(s.status) && isAbsent(s.ended_at)) {
      c.add('ended_at', CODES.REQUIRED,
        `A session that is "${s.status}" must record when it ended.`);
    }
    if (s.status === 'planned' && !isAbsent(s.started_at)) {
      c.add('started_at', CODES.MISMATCH,
        'A session that has started is no longer planned.');
    }
    if (!ENDED_SESSION_STATUSES.includes(s.status) && !isAbsent(s.ended_at)) {
      c.add('ended_at', CODES.MISMATCH,
        'Only a completed or abandoned session records an end time.');
    }
  }
  checkChronological(c, 'ended_at', s.started_at, s.ended_at,
    'A session cannot have ended before it started.');

  return c.result();
}

/**
 * The joining link and where it came from. Both are optional — a session run in person needs
 * neither — but they travel together.
 * @param {Collector} c
 * @param {Record<string, any>} s
 */
function checkMeet(c, s) {
  const hasUrl = !isAbsent(s.meet_url);
  const hasSource = !isAbsent(s.meet_source);
  if (hasUrl) {
    checkString(c, 'meet_url', s.meet_url, {
      max: 500,
      pattern: /^https:\/\/[^\s]+$/,
      patternHint: 'Store the joining link only — never a whole provider response, which carries the signed-in account and internal identifiers.',
    });
  }
  if (hasSource) checkEnum(c, 'meet_source', s.meet_source, MEET_SOURCES);
  if (hasUrl !== hasSource) {
    c.add(hasUrl ? 'meet_source' : 'meet_url', CODES.MISMATCH,
      'A meeting link and its origin are recorded together: both, or neither.');
  }
}
