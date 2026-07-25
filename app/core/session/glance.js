/**
 * THE PREVIOUS SESSION AT A GLANCE.
 *
 * A stated requirement, in the user's own words: when the coach starts a session, the app shows the
 * previous one — the exercises performed, any loads recorded and the readings taken — so progress
 * can be monitored across sessions.
 *
 * ## It SHOWS. It does not suggest
 *
 * There is no automatic week-over-week progression anywhere in this application, and this is the
 * screen where one would be most tempting to add. Nothing here proposes a heavier load, a longer
 * hold or more repetitions; nothing compares two sessions to derive a direction; nothing carries a
 * load forward as a default for the next one. A load is a per-client OBSERVATION the coach made in
 * a session, shown back to him exactly as he wrote it, so that HE can decide whether anything goes
 * up. That judgement belongs to a certified professional who is also adapting to a client's history.
 *
 * A test asserts that this module names no such thing, because an absent feature and a forgotten one
 * look identical to the next editor.
 *
 * ## Per client, even when the session was shared
 *
 * A session carries one to many clients against a single routine. Each attendee's glance is their
 * own — their performed records, their loads, their readings — and one client's must never appear in
 * another's view.
 */

import { previousSessionForClient } from '../store/store.js';

/**
 * @typedef {Object} Glance
 * @property {string} session_id
 * @property {string} routine_id
 * @property {string} status
 * @property {string|null} started_at
 * @property {string|null} ended_at
 * @property {boolean} partial_record True when that session did not finish. Shown as what it is —
 *   an interrupted session is still history, and hiding it would lose the last thing that happened.
 * @property {{exercise_id: string, substituted_for_exercise_id: string|null, status: string,
 *   sets_completed: number|null, repetitions: number|null, duration_seconds: number|null,
 *   observed_load: string|null, note: string|null, recorded_at: string}[]} performed
 *   In the order that session actually ran.
 * @property {{exercise_id: string, observed_load: string, recorded_at: string}[]} loads
 *   Every load he wrote down, verbatim. Nothing is derived from these.
 * @property {{kind: string, value: number, unit: string, taken_at: string,
 *   note: string|null}[]} readings
 * @property {{text: string, taken_at: string}[]} notes That client's notes from that session.
 */

/**
 * The previous session for one client, shaped for the panel the coach sees when he starts one.
 *
 * @param {import('../store/store.js').LocalStore} store
 * @param {string} clientId
 * @param {{excludeSessionId?: string|null}} [options] Pass the session being started, so the panel
 *   shows the one BEFORE it rather than the one he is looking at.
 * @returns {Promise<Glance|null>} null when this is the client's first session — which the interface
 *   must say plainly rather than showing an empty panel that reads like a fault.
 */
export async function previousSessionAtAGlance(store, clientId, options = {}) {
  const found = await previousSessionForClient(store, clientId, {
    excludeSessionId: options.excludeSessionId ?? null,
  });
  if (!found) return null;
  return shapeGlance(found);
}

/**
 * The same shape, for a session already in hand.
 *
 * @param {{session: any, performed: any[], readings: any[], notes: any[]}} found
 * @returns {Glance}
 */
export function shapeGlance(found) {
  const { session, performed, readings, notes } = found;
  const content = session.content || {};

  const rows = performed
    .filter((record) => !record.deleted && record.content)
    .map((record) => record.content)
    .sort((a, b) => a.position - b.position)
    .map((c) => ({
      exercise_id: c.exercise_id,
      substituted_for_exercise_id: c.substituted_for_exercise_id ?? null,
      status: c.status,
      sets_completed: c.sets_completed ?? null,
      repetitions: c.repetitions ?? null,
      duration_seconds: c.duration_seconds ?? null,
      observed_load: c.observed_load ?? null,
      note: c.note ?? null,
      recorded_at: c.recorded_at,
    }));

  return {
    session_id: session.record_id,
    routine_id: content.routine_id,
    status: content.status,
    started_at: content.started_at ?? null,
    ended_at: content.ended_at ?? null,
    partial_record: content.status !== 'completed',
    performed: rows,
    loads: rows
      .filter((row) => row.observed_load)
      .map(({ exercise_id, observed_load, recorded_at }) => ({
        exercise_id, observed_load, recorded_at,
      })),
    readings: readings
      .filter((record) => !record.deleted && record.content)
      .map((record) => ({
        kind: record.content.kind,
        value: record.content.value,
        unit: record.content.unit,
        taken_at: record.content.taken_at,
        note: record.content.note ?? null,
      })),
    notes: notes
      .filter((record) => !record.deleted && record.content)
      .map((record) => ({ text: record.content.text, taken_at: record.content.taken_at })),
  };
}
