/**
 * THE PROJECTION — everything the interface shows, derived from the journal.
 *
 * ## Why this file is pure
 *
 * Not a single function here reads a database, asks the clock, or holds a value between calls. Given
 * the same journal it returns the same view, always. That is what makes resuming an interrupted
 * session EXACT rather than approximately right: resume is a replay of the record, and the record is
 * the only thing that was ever the truth.
 *
 * The corollary is the load-bearing half, and it is a rule rather than an observation: **anything
 * describing where a session has got to is derived HERE and never persisted.** Two sources of truth
 * about where a session is would eventually disagree, and they would disagree in the middle of a
 * real session with a client waiting.
 *
 * ## What this view deliberately does NOT contain
 *
 * There is no current exercise, no next exercise, no cursor and no position in the routine. The
 * routine's own order is a DEFAULT, not a script; the coach jumps, reorders, skips, repeats and
 * substitutes, and the application's job is to track what happened, never to dictate what happens
 * next. `not_yet_recorded` is the closest thing here, and it is a statement about the RECORD — these
 * entries have nothing against them yet — not an instruction about the session. A test asserts the
 * absence of a cursor field, because an absence is indistinguishable from an oversight to the next
 * editor.
 *
 * Nothing here proposes a load, a longer hold or more repetitions, and nothing compares one session
 * to another to derive a progression. A load appears only where the coach observed it.
 */

import { ENDED_SESSION_STATUSES, STARTED_SESSION_STATUSES } from '../model/model.js';
import { participantsOf } from './journal.js';

/**
 * Statuses from which a session can be picked up again.
 *
 * `in_progress` and `interrupted` are treated IDENTICALLY on purpose. A power cut, a closed laptop or
 * a killed tab leaves a session at `in_progress` because nothing got the chance to write anything
 * else — so a resume path that only accepted `interrupted` would fail in exactly the cases the
 * requirement is about. The clean exit is a courtesy, never a precondition.
 * @type {readonly string[]}
 */
export const RESUMABLE_STATUSES = Object.freeze(['in_progress', 'interrupted']);

/**
 * Statuses whose record is a PARTIAL record of a session: it holds what happened without claiming
 * the session finished. A half-finished session is saved as one of these rather than lost or
 * discarded. There is no state in which closing the application throws away what already happened.
 * @type {readonly string[]}
 */
export const PARTIAL_RECORD_STATUSES = Object.freeze(['in_progress', 'interrupted', 'abandoned']);

/**
 * @typedef {Object} Attempt
 * @property {string} record_id
 * @property {string} exercise_id What was ACTUALLY done, after any substitution.
 * @property {string|null} substituted_for_exercise_id What it replaced, when it replaced something.
 * @property {number} position Where it fell in the session as run.
 * @property {string} status `performed` | `partial` | `skipped` | `substituted`
 * @property {string|null} observed_load The coach's observation, verbatim. Never derived from.
 * @property {string} recorded_at
 * @property {any} record The stored envelope, for a caller that needs the rest.
 */

/**
 * @typedef {Object} PlanLine
 * @property {string} exercise_id The exercise the routine named.
 * @property {Object} prescription The routine's own overrides, as stored. Never a load.
 * @property {Attempt[]} attempts Every attempt against this line, in the order they were recorded.
 * @property {string} outcome `not-recorded` until something is recorded, then the LAST attempt's
 *   status. Not-recorded is a fact about the record, not an instruction.
 * @property {boolean} repeated More than one attempt — repeating is normal, not a duplicate.
 */

/**
 * @typedef {Object} ClientView
 * @property {string} client_id
 * @property {PlanLine[]} plan The routine's lines, in the routine's declared order, with what
 *   happened against each. Empty when the routine was not supplied.
 * @property {Attempt[]} timeline Every attempt, in the order the session actually ran.
 * @property {string[]} order_as_run The exercises in the order they were recorded — which is how a
 *   jump or a reorder is visible at all.
 * @property {string[]} not_yet_recorded Routine lines with nothing against them.
 * @property {string[]} beyond_the_routine Exercises recorded that the routine never named.
 * @property {{exercise_id: string, observed_load: string, recorded_at: string}[]} loads
 * @property {any[]} readings
 * @property {any[]} notes
 * @property {number} append_position The position the next append takes for this client: one past
 *   the highest recorded. Derived on read; never stored.
 * @property {{performed: number, readings: number, notes: number}} counts
 */

/**
 * @typedef {Object} SessionView
 * @property {string} session_id
 * @property {string} status
 * @property {string} routine_id
 * @property {string|null} scheduled_at
 * @property {string|null} started_at
 * @property {string|null} ended_at
 * @property {string|null} meet_url
 * @property {string|null} summary
 * @property {boolean} is_live
 * @property {boolean} is_resumable
 * @property {boolean} is_partial_record
 * @property {string[]} client_ids
 * @property {ClientView[]} clients One per attending client, in the session's own order.
 * @property {any[]} session_notes Notes about the session as a whole, belonging to nobody.
 * @property {{clients: number, performed: number, readings: number, notes: number}} counts
 * @property {number} replayed_records How many stored records this view was built from. Reported as
 *   a number rather than implied, so "it resumed" can be checked rather than believed.
 */

/**
 * Build the whole view of a session from its journal.
 *
 * @param {import('./journal.js').Journal} journal
 * @param {{routine?: any|null}} [context] The routine envelope, when the caller has it. Without it
 *   the view still describes everything that HAPPENED — the plan lines are simply unknown, which is
 *   honest rather than empty: a routine the coach has since deleted must not erase the history of a
 *   session that used it.
 * @returns {SessionView}
 */
export function projectSession(journal, context = {}) {
  const { session } = journal;
  const content = session?.content || {};
  const clientIds = participantsOf(session);
  const entries = routineEntriesOf(context.routine);

  const clients = clientIds.map((clientId) => projectClient({
    clientId,
    entries,
    performed: journal.performed[clientId] || [],
    readings: journal.readings[clientId] || [],
    notes: journal.notes[clientId] || [],
  }));

  const counts = {
    clients: clients.length,
    performed: sum(clients.map((c) => c.counts.performed)),
    readings: sum(clients.map((c) => c.counts.readings)),
    notes: sum(clients.map((c) => c.counts.notes)) + journal.sessionNotes.length,
  };

  return {
    session_id: session?.record_id,
    status: content.status,
    routine_id: content.routine_id,
    scheduled_at: content.scheduled_at ?? null,
    started_at: content.started_at ?? null,
    ended_at: content.ended_at ?? null,
    meet_url: content.meet_url ?? null,
    summary: content.summary ?? null,
    is_live: content.status === 'in_progress',
    is_resumable: RESUMABLE_STATUSES.includes(content.status),
    is_partial_record: PARTIAL_RECORD_STATUSES.includes(content.status),
    client_ids: clientIds,
    clients,
    session_notes: journal.sessionNotes.slice(),
    counts,
    replayed_records: journal.recordCount,
  };
}

/**
 * One client's half of the view.
 *
 * Per client, always. Each attendee has their own performed records, readings and notes, because the
 * coach may modify an exercise for one tired client while the rest continue — and because one
 * client's facts must never appear in another's progress view or export.
 *
 * @param {{clientId: string, entries: any[], performed: any[], readings: any[], notes: any[]}} args
 * @returns {ClientView}
 */
function projectClient({ clientId, entries, performed, readings, notes }) {
  const attempts = performed
    .filter((record) => !record.deleted && record.content)
    .map(toAttempt)
    .sort(byRunOrder);

  /** @type {Map<string, Attempt[]>} */
  const byLine = new Map();
  /** @type {Attempt[]} */
  const beyond = [];

  for (const attempt of attempts) {
    // A substitution belongs to the line it REPLACED — otherwise swapping an exercise for a tired
    // client would read as one line never done and a second appearing out of nowhere.
    const line = attempt.substituted_for_exercise_id || attempt.exercise_id;
    if (entries.some((entry) => entry.exercise_id === line)) {
      const list = byLine.get(line) || [];
      list.push(attempt);
      byLine.set(line, list);
    } else {
      beyond.push(attempt);
    }
  }

  const plan = entries.map((entry) => {
    const lineAttempts = byLine.get(entry.exercise_id) || [];
    const last = lineAttempts[lineAttempts.length - 1];
    return {
      exercise_id: entry.exercise_id,
      prescription: prescriptionOf(entry),
      attempts: lineAttempts,
      outcome: last ? last.status : 'not-recorded',
      repeated: lineAttempts.length > 1,
    };
  });

  return {
    client_id: clientId,
    plan,
    timeline: attempts,
    order_as_run: attempts.map((attempt) => attempt.exercise_id),
    not_yet_recorded: plan.filter((line) => !line.attempts.length).map((line) => line.exercise_id),
    beyond_the_routine: unique(beyond.map((attempt) => attempt.exercise_id)),
    loads: attempts
      .filter((attempt) => attempt.observed_load)
      .map(({ exercise_id, observed_load, recorded_at }) => ({
        exercise_id, observed_load, recorded_at,
      })),
    readings: readings.filter((record) => !record.deleted),
    notes: notes.filter((record) => !record.deleted),
    append_position: attempts.length
      ? Math.max(...attempts.map((attempt) => attempt.position)) + 1
      : 0,
    counts: {
      performed: attempts.length,
      readings: readings.filter((record) => !record.deleted).length,
      notes: notes.filter((record) => !record.deleted).length,
    },
  };
}

/**
 * What resuming needs to know, and nothing more.
 *
 * Deliberately thin. It says what the session IS and what has been recorded — never what to do next.
 * The interface decides how to present that; a decision about where to carry on is the coach's.
 *
 * @param {SessionView} view
 * @returns {{session_id: string, status: string, resumable: boolean, partial_record: boolean,
 *   recorded: number, started_at: string|null}}
 */
export function resumeStateOf(view) {
  return {
    session_id: view.session_id,
    status: view.status,
    resumable: view.is_resumable,
    partial_record: view.is_partial_record,
    recorded: view.replayed_records,
    started_at: view.started_at,
  };
}

/**
 * One client's slice of a view, or null when they were not in the session.
 * @param {SessionView} view @param {string} clientId
 * @returns {ClientView|null}
 */
export function clientViewOf(view, clientId) {
  return view.clients.find((client) => client.client_id === clientId) || null;
}

/** @param {any} session A session envelope. @returns {boolean} */
export function hasStarted(session) {
  return STARTED_SESSION_STATUSES.includes(session?.content?.status);
}

/** @param {any} session A session envelope. @returns {boolean} */
export function hasEnded(session) {
  return ENDED_SESSION_STATUSES.includes(session?.content?.status);
}

// ── internals ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The routine's entries, or an empty list when no routine was supplied.
 * @param {any} routine A routine envelope.
 * @returns {any[]}
 */
function routineEntriesOf(routine) {
  const entries = routine?.content?.entries;
  return Array.isArray(entries) ? entries : [];
}

/**
 * The routine's own overrides for one entry.
 *
 * Copied field by field rather than spread, so that a load field appearing on a library record —
 * which the model forbids outright — could never travel into a view through this seam.
 *
 * @param {any} entry
 */
function prescriptionOf(entry) {
  return {
    sets: entry.sets ?? null,
    repetitions: entry.repetitions ?? null,
    duration_seconds: entry.duration_seconds ?? null,
    rest_seconds: entry.rest_seconds ?? null,
  };
}

/**
 * @param {any} record A performed-record envelope.
 * @returns {Attempt}
 */
function toAttempt(record) {
  const c = record.content;
  return {
    record_id: record.record_id,
    exercise_id: c.exercise_id,
    substituted_for_exercise_id: c.substituted_for_exercise_id ?? null,
    position: c.position,
    status: c.status,
    observed_load: c.observed_load ?? null,
    recorded_at: c.recorded_at,
    record,
  };
}

/**
 * The order the session actually ran in.
 *
 * `position` first, because that is the coach's own sequence and it survives two facts recorded in
 * the same millisecond; `recorded_at` breaks a tie only if a caller ever reused a position.
 *
 * @param {Attempt} a @param {Attempt} b
 */
function byRunOrder(a, b) {
  if (a.position !== b.position) return a.position - b.position;
  return String(a.recorded_at).localeCompare(String(b.recorded_at));
}

/** @param {number[]} values */
function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

/** @param {string[]} values */
function unique(values) {
  return Array.from(new Set(values));
}
