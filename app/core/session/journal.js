/**
 * THE SESSION JOURNAL — the append side, and the read that hands it back whole.
 *
 * ## The session is a log of what occurred, not a position in a script
 *
 * There is no persisted "which exercise the app thinks he should be on" anywhere in this layer,
 * because a linear guided player would make the application the driver of the session. The coach
 * jumps, reorders, skips, repeats, substitutes and edits at will, captures a reading or a note at any
 * moment, and leaves and returns without the application having an opinion about where he should be.
 *
 * So the only thing written here is a FACT that already happened:
 *
 * | Append | Record kind | What it says |
 * | --- | --- | --- |
 * | {@link appendPerformed} | `performed-record` | one exercise, one client, as it was actually done |
 * | {@link appendReading} | `reading` | a measurement against one client |
 * | {@link appendNote} | `session-note` | a note, about a client or about the session |
 *
 * Everything the interface wants to show — what has happened, what has not been recorded yet, what
 * one client did — is DERIVED from those facts by `projection.js`. That is why resuming is exact: it
 * is a replay, not a restore. There is no second source of truth about where a session is, so there
 * is nothing that can disagree with the record.
 *
 * ## Nothing new is stored
 *
 * These three record kinds already exist in the model, with their indexes already in the store's
 * schema. This layer adds no record kind, no object store and no database version: a session's
 * durability is the durability of the store, which resolves a write only once it has genuinely
 * committed. Nothing here tells a caller a fact is saved before it is.
 *
 * ## The bound, and why there is one at all
 *
 * A log grows, and the cost of replaying it grows with it. This log is bounded twice over: it is
 * per SESSION rather than per practice, and it is capped — see {@link JOURNAL_LIMITS}. The cap is
 * what makes "read the session's own detail whole" safe: the store's per-query read limit is 500,
 * and a query that hits its limit returns a page rather than an error, so a journal allowed past 500
 * would be silently truncated on read and the session would appear to have recorded less than it
 * did. An absence that looks like a pass is the failure mode this whole build has been bitten by.
 */

import { timestamp, unitForKind } from '../model/model.js';
import {
  notesForSession, notesInSessionForClient, performedForClientInSession, readingsInSessionForClient,
} from '../store/store.js';
import { SessionJournalFullError, SessionParticipantError } from './errors.js';

/**
 * The declared bound on one session's journal.
 *
 * Sized so that the store reads a session's detail back WHOLE. `performedForClientInSession` and
 * `readingsInSessionForClient` page at 500 MATCHING rows per client, and `notesForSession` at 500
 * per session, and none of them reports the truncation as an error — so these caps sit below those
 * limits with room to spare, and a test fills a journal to the cap and proves every record still
 * comes back.
 *
 * The numbers are far beyond a real session. A session runs about an hour and holds a handful of
 * exercises per client; four hundred recorded facts for one person in one hour is not a session that
 * happened, it is a runaway caller. Refusing at a stated bound is what turns that into something the
 * coach is told about rather than something that quietly eats his record.
 */
export const JOURNAL_LIMITS = Object.freeze({
  /** Performed records for ONE client in one session. */
  performedPerClient: 400,
  /** Readings for ONE client in one session. */
  readingsPerClient: 400,
  /** Notes on one session, across every client and the session itself. */
  notesPerSession: 400,
});

/** The store's own per-query read limit, which the caps above sit below. Documented, not imported. */
export const STORE_DETAIL_READ_LIMIT = 500;

/**
 * @typedef {Object} Journal
 * @property {any} session The session envelope, as stored.
 * @property {Record<string, any[]>} performed Per client id, in `[position]` order.
 * @property {Record<string, any[]>} readings Per client id, in the order the store returns them.
 * @property {Record<string, any[]>} notes Per client id — a note WITH a client belongs to them.
 * @property {any[]} sessionNotes Notes with no client: about the session as a whole.
 * @property {number} recordCount Every record this journal was read from. Reported, not inferred.
 */

/**
 * Read one session's whole journal.
 *
 * Per client, always, even though the session was shared: one client's performed records, readings
 * and notes must never appear in another's view, so they are never merged into one list here.
 *
 * This is the read a resume replays. Its cost is bounded by ONE session — the roster times that
 * session's own facts — and not by the size of the practice or the length of its history.
 *
 * @param {import('../store/store.js').LocalStore} store
 * @param {any} session A session envelope.
 * @returns {Promise<Journal>}
 */
export async function readJournal(store, session) {
  const sessionId = session.record_id;
  const clientIds = participantsOf(session);

  /** @type {Journal} */
  const journal = {
    session, performed: {}, readings: {}, notes: {}, sessionNotes: [], recordCount: 0,
  };

  for (const clientId of clientIds) {
    // Sequential rather than concurrent: three reads per client, and a roster of forty would
    // otherwise open a hundred and twenty overlapping transactions on one database.
    /* eslint-disable no-await-in-loop */
    const performed = await performedForClientInSession(store, sessionId, clientId);
    const readings = await readingsInSessionForClient(store, sessionId, clientId);
    const notes = await notesInSessionForClient(store, sessionId, clientId);
    /* eslint-enable no-await-in-loop */
    journal.performed[clientId] = performed;
    journal.readings[clientId] = readings;
    journal.notes[clientId] = notes;
    journal.recordCount += performed.length + readings.length + notes.length;
  }

  const everyNote = await notesForSession(store, sessionId);
  journal.sessionNotes = everyNote.filter((note) => !note.content?.client_id);
  journal.recordCount += journal.sessionNotes.length;

  return journal;
}

/**
 * The clients attending a session, in the session's own order.
 * @param {any} session A session envelope.
 * @returns {string[]}
 */
export function participantsOf(session) {
  const ids = session?.content?.client_ids;
  return Array.isArray(ids) ? ids.slice() : [];
}

/**
 * Append what one client actually did for one exercise.
 *
 * `position` is where it fell in the session AS RUN, which is not where the routine put it: he
 * jumps, reorders and repeats, and each of those is expressed as the position the fact was recorded
 * at rather than as a rearrangement of anything stored. A repeat is a second record with a later
 * position, not an edit of the first — the first attempt genuinely happened and is not overwritten.
 *
 * A load may be recorded here and nowhere else, and it is an OBSERVATION: the coach watched a
 * specific person lift a specific thing. Nothing derives from it and nothing raises it.
 *
 * @param {import('../store/store.js').LocalStore} store
 * @param {{sessionId: string, clientId: string, position: number, exerciseId: string,
 *   status?: string, substitutedFor?: string|null, sets?: number, repetitions?: number,
 *   durationSeconds?: number, restSeconds?: number, observedLoad?: string, intensity?: string,
 *   note?: string, recordedAt?: number|string|Date, now?: number|string|Date,
 *   lease?: import('../store/store.js').SessionLease|null}} fact
 * @returns {Promise<any>} the stored envelope — resolved means COMMITTED
 */
export function appendPerformed(store, fact) {
  const content = pruneAbsent({
    session_id: fact.sessionId,
    client_id: fact.clientId,
    exercise_id: fact.exerciseId,
    position: fact.position,
    status: fact.status || 'performed',
    substituted_for_exercise_id: fact.substitutedFor ?? undefined,
    sets_completed: fact.sets,
    repetitions: fact.repetitions,
    duration_seconds: fact.durationSeconds,
    rest_seconds: fact.restSeconds,
    observed_load: fact.observedLoad,
    intensity_level: fact.intensity,
    note: fact.note,
    recorded_at: timestamp(fact.recordedAt ?? fact.now),
  });
  return store.create('performed-record', content, { now: fact.now, lease: fact.lease ?? null });
}

/**
 * Append a measurement against one client.
 *
 * The unit is filled in from the kind when the app knows the kind, so a caller cannot record a plank
 * in beats per minute by omission. A kind the coach invented has no pinned unit and must name one.
 *
 * @param {import('../store/store.js').LocalStore} store
 * @param {{sessionId: string, clientId: string, kind: string, value: number, unit?: string,
 *   context?: string, note?: string, takenAt?: number|string|Date, now?: number|string|Date,
 *   lease?: import('../store/store.js').SessionLease|null}} reading
 * @returns {Promise<any>}
 */
export function appendReading(store, reading) {
  const content = pruneAbsent({
    client_id: reading.clientId,
    session_id: reading.sessionId,
    kind: reading.kind,
    value: reading.value,
    unit: reading.unit || unitForKind(reading.kind) || undefined,
    context: reading.context || 'in_session',
    taken_at: timestamp(reading.takenAt ?? reading.now),
    note: reading.note,
  });
  return store.create('reading', content, { now: reading.now, lease: reading.lease ?? null });
}

/**
 * Append a note.
 *
 * `clientId` is optional and the distinction is load-bearing: a note WITH a client is that person's
 * and follows them into their progress view and their export; a note WITHOUT one is about the
 * session as a whole. Inferring one from the other would put one client's note into another's
 * export, so nothing here guesses.
 *
 * @param {import('../store/store.js').LocalStore} store
 * @param {{sessionId: string, clientId?: string|null, text: string,
 *   takenAt?: number|string|Date, now?: number|string|Date,
 *   lease?: import('../store/store.js').SessionLease|null}} note
 * @returns {Promise<any>}
 */
export function appendNote(store, note) {
  const content = pruneAbsent({
    session_id: note.sessionId,
    client_id: note.clientId ?? undefined,
    text: note.text,
    taken_at: timestamp(note.takenAt ?? note.now),
  });
  return store.create('session-note', content, { now: note.now, lease: note.lease ?? null });
}

/**
 * Write up a note AFTER the session has finished.
 *
 * Deliberately a free function needing no lease, because a finished session is freely editable and
 * writing up a note afterwards is ordinary work rather than a live-session operation. The store
 * guards the live case only, which is the only case that can be corrupted.
 *
 * @param {import('../store/store.js').LocalStore} store
 * @param {{sessionId: string, clientId?: string|null, text: string, takenAt?: number|string|Date}} note
 * @returns {Promise<any>}
 */
export function appendNoteAfterwards(store, note) {
  return appendNote(store, { ...note, lease: null });
}

/**
 * Refuse a fact offered against somebody who is not attending.
 *
 * ## THE SECOND SENTENCE NAMES A CONTROL THAT EXISTS, AND IT DID NOT USED TO
 *
 * It read "Add them to the session first" while NOTHING in the application could do that: `addClient`
 * sat on `live-session.js` called by no screen, so the refusal was an instruction with nothing to
 * perform it. A coach with a late arrival in front of him was told to go and do something the app
 * offered no way to do, which reads as his own mistake rather than as the application's gap.
 *
 * The control now exists — `screens/SessionArrival.tsx`, drawn on the session screen — and this
 * sentence names it by its own label, QUOTED. The quoting is the house rule that makes a referent
 * extractable from finished prose, and `src/shell/refusal-names-a-real-control.test.ts` sweeps a
 * universe walked from the filesystem that reaches this file, so the name below is checked against
 * the application's real inventory of labels rather than against an author's memory of it.
 *
 * IF THAT CONTROL IS RENAMED, THIS SENTENCE MUST BE RENAMED WITH IT. `modular-control.ts`'s
 * `ARRIVAL_TITLE` is the single place the words are decided; this is prose in the other tree and
 * cannot import it, which is exactly why the guard holds the two together instead.
 *
 * @param {any} session A session envelope.
 * @param {string} clientId
 */
export function assertAttending(session, clientId) {
  if (participantsOf(session).includes(clientId)) return;
  throw new SessionParticipantError(
    'That person is not in this session, so nothing can be recorded against them here. '
    + 'Tap "Someone arrived late" on the session screen to add them.',
    { session_id: session?.record_id, client_id: clientId },
  );
}

/**
 * Refuse an append that would take the journal past its declared bound.
 *
 * @param {'performedPerClient'|'readingsPerClient'|'notesPerSession'} bound
 * @param {number} existing How many are already recorded.
 * @param {Record<string, unknown>} [detail]
 */
export function assertRoom(bound, existing, detail = {}) {
  const limit = JOURNAL_LIMITS[bound];
  if (existing < limit) return;
  throw new SessionJournalFullError(
    `This session has already recorded ${existing} of these, which is as many as one session holds. `
    + 'Nothing has been lost — finish this session and start another.',
    { bound, limit, existing, ...detail },
  );
}

/**
 * Drop the keys whose value is absent.
 *
 * The model refuses an unknown key and treats `undefined` as absent, so building content by spread
 * and then pruning is how an optional field stays genuinely optional without every caller composing
 * an object conditionally.
 *
 * @param {Record<string, any>} content
 * @returns {Record<string, any>}
 */
function pruneAbsent(content) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const [key, value] of Object.entries(content)) {
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out;
}
