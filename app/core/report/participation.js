/**
 * THE PRIVACY BOUNDARY — one client's own participation, and structurally nothing else.
 *
 * ## The rule this file exists to keep
 *
 * A session in this application carries ONE TO MANY clients against a single routine. A client's own
 * progress report MUST NEVER REVEAL THAT ANYBODY ELSE WAS THERE — not another client's name, not
 * their identifier, not a COUNT of them, not a plural that implies them, and not a session title that
 * happens to carry one of them.
 *
 * ## Why this is an ALLOWLIST and not a filter
 *
 * A filter removes the leaks somebody thought of. Every field added to the session record afterwards
 * arrives on the safe side of a filter by default, and the person adding it has no reason to know
 * this file exists. So a session is not cleaned here — it is REBUILT, field by named field, out of
 * {@link SESSION_FIELDS_CARRIED} and nothing else. `client_ids`, `summary`, `meet_url`,
 * `meet_source` and `routine_id` are not stripped: they are never copied, and a field invented next
 * year is not copied either because nothing copies it.
 *
 * Three of those deserve their reason stated, because each looks harmless and is not:
 *
 *  - **`client_ids`** is the roster. It is the leak in its most literal form, including its length.
 *  - **`summary`** is free text about the SESSION AS A WHOLE, which is exactly where a coach writes
 *    "worked around Ben's shoulder". A session-wide sentence cannot be attributed to one attendee, so
 *    it cannot be in one attendee's report.
 *  - **`routine_id`** names library content, which is shared and normally safe — but the coach names
 *    his own routines and may name one after the people in it. What the client actually did is
 *    already known from their OWN performed records, which are per client by construction, so the
 *    routine buys nothing the report cannot derive more accurately from data that is definitionally
 *    theirs.
 *
 * ## In-session NOTES are not carried at all
 *
 * Not narrowed, not redacted — absent. The coach's in-session note is his working record, it is not
 * one of the three things this report was asked for, and a note written for himself is not a
 * sentence written for a client to read. The safest handling of text nobody wrote for this audience
 * is to never bring it into the building.
 *
 * ## What is dropped is COUNTED
 *
 * A narrowing that silently discards is indistinguishable from an input that was empty. Every record
 * that does not belong to this client is counted in `dropped`, so a test can assert the boundary
 * actually did work rather than that it found nothing to do.
 *
 * Pure. No clock, no store, no browser.
 */

import { STARTED_SESSION_STATUSES } from '../model/vocabularies.js';
import { byInstant, contentOf, instantOf, liveRecords, recordIdOf, textOf } from './records.js';

/**
 * THE ALLOWLIST. Every session field that may reach a client's own report — the whole list, in one
 * place, so the boundary is readable in a single glance rather than reconstructed from what is
 * missing.
 * @type {readonly string[]}
 */
export const SESSION_FIELDS_CARRIED = Object.freeze(['session_id', 'at', 'status', 'mode']);

/**
 * Every performed-record field that may reach the report.
 *
 * `sets_completed`, `repetitions`, `duration_seconds`, `rest_seconds` and `observed_load` are all
 * deliberately absent. The report says WHAT was worked on, never how many of it: raw repetition
 * counts are the data dump this report was defined against, and `observed_load` is a coaching
 * observation whose audience is the coach.
 * @type {readonly string[]}
 */
export const PERFORMED_FIELDS_CARRIED = Object.freeze(['session_id', 'exercise_id', 'status', 'at']);

/**
 * Session statuses that mean the session actually ran, so attending it is a fact about this client.
 * Read from the model rather than restated here.
 * @type {readonly string[]}
 */
export const ATTENDED_STATUSES = STARTED_SESSION_STATUSES;

/**
 * @typedef {Object} ParticipationSession
 * @property {string|null} session_id
 * @property {string|null} at When it ran — `started_at`, or the planned instant for one that never
 *   started. Never today's date.
 * @property {string} status The record's own status, unchanged.
 * @property {string|null} mode
 * @property {boolean} attended True when the session actually ran.
 */

/**
 * @typedef {Object} ParticipationPerformed
 * @property {string|null} session_id
 * @property {string|null} exercise_id
 * @property {string} status
 * @property {string|null} at
 */

/**
 * @typedef {Object} ParticipationReading
 * @property {string|null} session_id
 * @property {string} kind
 * @property {number} value
 * @property {string|null} unit
 * @property {string|null} at
 */

/**
 * @typedef {Object} Participation
 * @property {string} client_id
 * @property {ParticipationSession[]} sessions Ascending by instant.
 * @property {ParticipationPerformed[]} performed Ascending by instant.
 * @property {ParticipationReading[]} readings Ascending by instant.
 * @property {{sessions: number, performed: number, readings: number}} dropped How many records were
 *   refused because they belong to somebody else, are tombstoned, or are not records at all.
 */

/**
 * Narrow a client's raw history down to the facts that are theirs.
 *
 * @param {string} clientId The client whose report this is.
 * @param {{sessions?: unknown[], performed?: unknown[], readings?: unknown[]}} [history] Records as
 *   the store hands them over — envelopes or bare content, either is read.
 * @returns {Participation}
 */
export function narrowToClient(clientId, history = {}) {
  const id = typeof clientId === 'string' ? clientId : '';

  const sessions = narrowSessions(id, history.sessions);
  const performed = narrowPerformed(id, history.performed);
  const readings = narrowReadings(id, history.readings);

  return {
    client_id: id,
    sessions: sessions.rows,
    performed: performed.rows,
    readings: readings.rows,
    dropped: {
      sessions: sessions.dropped,
      performed: performed.dropped,
      readings: readings.dropped,
    },
  };
}

/**
 * Sessions rebuilt out of the allowlist, keeping only the ones this client was actually on.
 *
 * A session whose roster does not name this client is somebody else's and is dropped — which is the
 * case a caller creates by handing over a whole practice rather than one client's history.
 *
 * @param {string} clientId @param {unknown} records
 * @returns {{rows: ParticipationSession[], dropped: number}}
 */
function narrowSessions(clientId, records) {
  const { rows: live, dropped: notLive } = liveRecords(records);
  const rows = [];
  let dropped = notLive;

  for (const { record_id: recordId, content } of live) {
    const roster = Array.isArray(content.client_ids) ? content.client_ids : [];
    if (!roster.includes(clientId)) {
      dropped += 1;
      continue;
    }

    const status = typeof content.status === 'string' ? content.status : 'unknown';
    // Field by named field. Nothing here spreads the record, and nothing may.
    rows.push({
      session_id: recordId,
      at: instantOf(content.started_at) || instantOf(content.scheduled_at),
      status,
      mode: typeof content.mode === 'string' ? content.mode : null,
      attended: ATTENDED_STATUSES.includes(status),
    });
  }

  rows.sort(byInstant);
  return { rows, dropped };
}

/**
 * @param {string} clientId @param {unknown} records
 * @returns {{rows: ParticipationPerformed[], dropped: number}}
 */
function narrowPerformed(clientId, records) {
  const { rows: live, dropped: notLive } = liveRecords(records);
  const rows = [];
  let dropped = notLive;

  for (const { content } of live) {
    if (content.client_id !== clientId) {
      dropped += 1;
      continue;
    }
    rows.push({
      session_id: textOf(content.session_id),
      exercise_id: textOf(content.exercise_id),
      status: typeof content.status === 'string' ? content.status : 'unknown',
      at: instantOf(content.recorded_at),
    });
  }

  rows.sort(byInstant);
  return { rows, dropped };
}

/**
 * @param {string} clientId @param {unknown} records
 * @returns {{rows: ParticipationReading[], dropped: number}}
 */
function narrowReadings(clientId, records) {
  const { rows: live, dropped: notLive } = liveRecords(records);
  const rows = [];
  let dropped = notLive;

  for (const { content } of live) {
    if (content.client_id !== clientId || typeof content.kind !== 'string'
      || typeof content.value !== 'number' || !Number.isFinite(content.value)) {
      dropped += 1;
      continue;
    }
    rows.push({
      session_id: textOf(content.session_id),
      kind: content.kind,
      value: content.value,
      unit: textOf(content.unit),
      at: instantOf(content.taken_at),
    });
  }

  rows.sort(byInstant);
  return { rows, dropped };
}

/**
 * The client's own name, from their record. Their name is the one name a client's report may carry —
 * it is theirs.
 *
 * Nothing else on the client record is read. `notes` are the coach's, `adaptation_flag` is a
 * reminder he wrote for himself, and `clinical_note` / `clinical_reference` are sealed and stay
 * sealed: this report carries no clinical content, needs no passphrase, and has no friction.
 *
 * @param {unknown} client An envelope or a bare client record.
 * @returns {string|null}
 */
export function clientNameOf(client) {
  const content = contentOf(client);
  return typeof content.name === 'string' && content.name.length > 0 ? content.name : null;
}

/**
 * The client's identity, given their record — the envelope's `record_id`, because a client record's
 * content carries no id of its own.
 * @param {unknown} client
 * @returns {string|null}
 */
export function clientIdOf(client) {
  return recordIdOf(client);
}
