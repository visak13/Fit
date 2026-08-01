/**
 * A SESSION THE COACH IS RUNNING — opening one, recording into it, and leaving it.
 *
 * ## There is no resume path, because opening IS resuming
 *
 * {@link openSession} is the only door, and it does the same thing whether the session is being
 * started for the first time or picked up after a power cut: it reads the journal and projects it.
 * A session that never started replays an empty journal; a session interrupted forty minutes in
 * replays forty minutes of facts. Nothing is restored, because nothing was ever held anywhere else
 * to restore FROM.
 *
 * That is why an interruption at any point resumes exactly. Exactness here is a property of the
 * shape, not of a save routine remembering to run — and a save routine is precisely what a power cut
 * does not give you the chance to run.
 *
 * ## Interruption is normal, and a clean exit is a courtesy
 *
 * {@link LiveSession.interrupt} records that he left. A power cut records nothing at all, and leaves
 * the session at `in_progress` with everything that had already been written still there. Both are
 * picked up the same way, and neither loses a fact, because every fact was committed as it happened
 * rather than at the end. There is no state in which closing the application throws away what
 * already happened.
 *
 * ## One window per session
 *
 * The coach may have two windows open on the laptop, each running a live session with a different
 * routine. Opening a session takes the store's lease on it, and a second window is TOLD that the
 * session is open in the other one rather than quietly appending to it. That is reported as a value,
 * not thrown: it is an ordinary situation, and the coach needs a sentence rather than a spinner.
 */

import { timestamp } from '../model/model.js';
import { unfinishedSessions } from '../store/store.js';
import { SessionClosedError, SessionStateError } from './errors.js';
import {
  appendNote, appendPerformed, appendReading, assertAttending, assertRoom, JOURNAL_LIMITS,
  participantsOf, readJournal,
} from './journal.js';
import { clientViewOf, hasEnded, projectSession, RESUMABLE_STATUSES } from './projection.js';

/**
 * @typedef {Object} OpenResult
 * @property {boolean} ok
 * @property {LiveSession} [session] Present when `ok`.
 * @property {'held_elsewhere'|'not_found'|'already_finished'} [reason] Present when not.
 * @property {string} [message] A sentence to show the coach as it stands.
 * @property {string} [session_id]
 */

/**
 * Write down a session that is going to happen. It is not running yet.
 *
 * `mode` says whether the session is run on a call or in a room. It is REQUIRED, it comes from the
 * caller, and it is never worked out from whether a link is present — a session planned online
 * before its link is minted has no link either, so the two would be indistinguishable. A session
 * marked `in_person` may carry no link at all, and the record refuses one that does.
 *
 * ## There is no default here, and the default that used to be is worth naming
 *
 * This function used to write `online` when a caller passed nothing. It existed only because no
 * caller existed yet: nothing in the interface could ask the coach, so something had to be written.
 * The calendar screen is now that caller and asks him every time, so the fallback has been REMOVED
 * rather than left as a safety net. A net that invents a fact about where a session happened is
 * worse than a refusal, because a plausible wrong answer is one nobody investigates — a session run
 * in a room would have been recorded as online, which is the exact ambiguity the field was added to
 * end, in a quieter form.
 *
 * NOTHING IS THROWN HERE, DELIBERATELY. An absent mode travels to `store.create` and the RECORD
 * refuses it, with the sentence the schema already writes for a missing required field. The
 * authority that owns the rule is the one that enforces it; a second check here would be a second
 * rule, free to drift from the first.
 *
 * @param {import('../store/store.js').LocalStore} store
 * @param {{routineId: string, clientIds: string[], mode: string, scheduledAt?: string|null,
 *   meetUrl?: string|null, meetSource?: string|null, now?: number|string|Date}} args
 * @returns {Promise<any>} the session envelope
 */
export function planSession(store, args) {
  const content = {
    routine_id: args.routineId,
    client_ids: args.clientIds,
    status: 'planned',
    mode: args.mode,
  };
  if (args.scheduledAt) content.scheduled_at = timestamp(args.scheduledAt);
  if (args.meetUrl) {
    content.meet_url = args.meetUrl;
    content.meet_source = args.meetSource || 'pasted';
  }
  return store.create('session', content, { now: args.now });
}

/**
 * Plan a session and open it in one go — the ordinary "start now" path.
 *
 * It is deliberately two writes rather than one. A session record is created `planned` and then
 * moved to `in_progress` while holding its lease, because the store refuses to start a session in a
 * window that does not hold it. Creating one already running would be a way around that guard, and
 * the guard is what stops two windows both believing they are running the same session.
 *
 * `mode` is required and is passed straight through to {@link planSession}, which no longer invents
 * one. See its note for why the fallback was removed rather than kept.
 *
 * @param {import('../store/store.js').LocalStore} store
 * @param {{routineId: string, clientIds: string[], routine?: any|null, mode: string,
 *   meetUrl?: string|null, meetSource?: string|null, now?: number|string|Date}} args
 * @returns {Promise<OpenResult>}
 */
export async function startSession(store, args) {
  const session = await planSession(store, args);
  return openSession(store, session.record_id, { routine: args.routine ?? null, now: args.now });
}

/**
 * Open a session — starting it, or picking it up again. The same operation either way.
 *
 * @param {import('../store/store.js').LocalStore} store
 * @param {string} sessionId
 * @param {{routine?: any|null, now?: number|string|Date}} [options] `routine` is the routine
 *   envelope, when the caller has it. Without it the view still describes everything that happened.
 * @returns {Promise<OpenResult>}
 */
export async function openSession(store, sessionId, options = {}) {
  const stored = await store.get('session', sessionId);
  if (!stored || stored.deleted) {
    return {
      ok: false,
      reason: 'not_found',
      session_id: sessionId,
      message: 'That session is not on this device.',
    };
  }
  if (hasEnded(stored)) {
    return {
      ok: false,
      reason: 'already_finished',
      session_id: sessionId,
      // IT STATES WHAT IS KEPT AND INSTRUCTS NOTHING. It used to send him to the record to look at
      // it or write into it, and he can do neither: `openSession` is the only door and it is this
      // refusal, reading one back in full is not built (`screens/launcher.ts` says so in its own
      // words), and `appendNoteAfterwards` is called by no screen. An unbuilt capability the app is
      // silent about is a disclosure; one it INSTRUCTS him to use is a defect. The wording matches
      // `screens/runner.ts` STATE_WORDS for a finished session deliberately, so the same fact reads
      // the same way whether he arrives at it from the calendar or from the session screen.
      message: 'That session has already finished. Everything recorded in it is kept.',
    };
  }

  const lease = await store.acquireSessionLease(sessionId);
  if (!lease) {
    return {
      ok: false,
      reason: 'held_elsewhere',
      session_id: sessionId,
      message: 'That session is open in your other window. Continue it there, '
        + 'or close that window and open it here.',
    };
  }

  try {
    // Moving to `in_progress` needs the lease we now hold. `started_at` is preserved if it is
    // already set: a session that was interrupted started when it started, and rewriting that
    // instant on every resume would quietly falsify how long it ran.
    const record = await store.update('session', sessionId, (content) => {
      if (content.status !== 'planned' && !RESUMABLE_STATUSES.includes(content.status)) {
        throw new SessionStateError(
          `A session that is "${content.status}" cannot be opened.`,
          { session_id: sessionId, status: content.status },
        );
      }
      return {
        ...content,
        status: 'in_progress',
        started_at: content.started_at || timestamp(options.now),
      };
    }, { lease, now: options.now });

    const live = new LiveSession({ store, record, lease, routine: options.routine ?? null });
    await live.refresh();
    return { ok: true, session: live, session_id: sessionId };
  } catch (error) {
    // A lease held by a session we failed to open would lock the coach out of it from every window.
    await lease.release();
    throw error;
  }
}

/**
 * The sessions waiting to be picked up — what the resume prompt asks for.
 *
 * `in_progress` and `interrupted` both appear, and neither is more of a problem than the other: a
 * session left at `in_progress` is one the power cut reached before anything could be written down.
 *
 * @param {import('../store/store.js').LocalStore} store
 * @param {{limit?: number}} [options]
 * @returns {Promise<any[]>} session envelopes
 */
export async function resumableSessions(store, options = {}) {
  const page = await unfinishedSessions(store, {
    limit: options.limit ?? 25,
    statuses: RESUMABLE_STATUSES,
  });
  return page.items;
}

/**
 * Read a session's record without opening it — the partial record of a half-finished session, or
 * the whole record of a finished one.
 *
 * Takes no lease and writes nothing, so it is safe against a session another window is running: it
 * is a read of what has committed. This is how a half-finished session is still a saved record
 * rather than something lost.
 *
 * @param {import('../store/store.js').LocalStore} store
 * @param {string} sessionId
 * @param {{routine?: any|null}} [options]
 * @returns {Promise<import('./projection.js').SessionView|null>}
 */
export async function readSession(store, sessionId, options = {}) {
  const stored = await store.get('session', sessionId);
  if (!stored || stored.deleted) return null;
  const journal = await readJournal(store, stored);
  return projectSession(journal, { routine: options.routine ?? null });
}

/**
 * A session open in THIS window.
 *
 * Every method that records something resolves only once the write has committed. Until it resolves,
 * nothing may be shown to the coach as saved.
 */
export class LiveSession {
  /**
   * @param {{store: import('../store/store.js').LocalStore, record: any,
   *   lease: import('../store/store.js').SessionLease, routine: any|null}} args
   */
  constructor({ store, record, lease, routine }) {
    this.store = store;
    this.record = record;
    this.lease = lease;
    this.routine = routine;
    this.sessionId = record.record_id;
    /** The projection as of the last read. See {@link LiveSession.current}. */
    this.view = /** @type {import('./projection.js').SessionView|null} */ (null);
    /** True when facts have been appended since the view was last derived from the record. */
    this.stale = false;
    this.closed = false;
  }

  /** The clients attending, in the session's own order. @returns {string[]} */
  get clientIds() { return participantsOf(this.record); }

  /**
   * Re-read the session and its journal, and re-derive everything.
   *
   * Called after every write, and once on open. The append positions and the counts that guard the
   * journal's bound are re-seeded from what is STORED rather than carried forward in memory, so a
   * handle that has been open across an interruption cannot drift from the record.
   *
   * @returns {Promise<import('./projection.js').SessionView>}
   */
  async refresh() {
    const stored = await this.store.get('session', this.sessionId);
    if (stored && !stored.deleted) this.record = stored;
    const journal = await readJournal(this.store, this.record);
    this.view = projectSession(journal, { routine: this.routine });
    this.stale = false;
    return this.view;
  }

  /**
   * The view, re-derived only if something has been appended since it was last derived.
   *
   * Appending is deliberately NOT a re-read: a session of N facts would then cost N re-reads of a
   * journal that is itself growing, which is quadratic in the length of a session for no benefit —
   * the coach's next repaint asks for the view once, however many facts went in. What an append does
   * update is the append position and the counts, which are the only things the NEXT append needs,
   * and both are re-seeded from what is stored on every refresh.
   *
   * @returns {Promise<import('./projection.js').SessionView>}
   */
  async current() {
    if (!this.view || this.stale) return this.refresh();
    return this.view;
  }

  /**
   * Record what one client actually did for one exercise.
   *
   * The position is allocated from the record — one past the highest already there — so a repeat is
   * a second fact rather than an edit of the first, and the order the session ran in stays visible.
   *
   * @param {string} clientId
   * @param {{exerciseId: string, status?: string, substitutedFor?: string|null, sets?: number,
   *   repetitions?: number, durationSeconds?: number, restSeconds?: number, observedLoad?: string,
   *   intensity?: string, note?: string, recordedAt?: number|string|Date,
   *   now?: number|string|Date}} fact
   * @returns {Promise<any>} the stored envelope
   */
  async recordPerformed(clientId, fact) {
    const client = this.#clientOrRefuse(clientId);
    assertRoom('performedPerClient', client.counts.performed, {
      session_id: this.sessionId, client_id: clientId,
    });

    const stored = await appendPerformed(this.store, {
      ...fact,
      sessionId: this.sessionId,
      clientId,
      position: client.append_position,
      lease: this.lease,
    });
    // The position is allocated by this window, which is the only one that may write into a live
    // session — that is what the lease guarantees, and it is why a counter is sound here.
    client.append_position += 1;
    this.#recorded(client, 'performed');
    return stored;
  }

  /**
   * Record that an exercise was skipped. A skip is a fact about the session, not a gap in it.
   * @param {string} clientId @param {string} exerciseId
   * @param {{note?: string, recordedAt?: number|string|Date, now?: number|string|Date}} [options]
   */
  recordSkipped(clientId, exerciseId, options = {}) {
    return this.recordPerformed(clientId, { ...options, exerciseId, status: 'skipped' });
  }

  /**
   * Record a substitution: what was done, and what it replaced.
   *
   * Both halves are stored, because a substitution that forgot what it replaced would lose what was
   * originally programmed — and the coach swaps an exercise mid-session whenever a client is tired,
   * which is ordinary rather than exceptional.
   *
   * @param {string} clientId
   * @param {{exerciseId: string, insteadOf: string, sets?: number, repetitions?: number,
   *   durationSeconds?: number, restSeconds?: number, observedLoad?: string, note?: string,
   *   recordedAt?: number|string|Date, now?: number|string|Date}} fact
   */
  recordSubstitution(clientId, fact) {
    const { insteadOf, ...rest } = fact;
    return this.recordPerformed(clientId, {
      ...rest, status: 'substituted', substitutedFor: insteadOf,
    });
  }

  /**
   * Capture a measurement against one client, at any moment, without leaving the routine.
   * @param {string} clientId
   * @param {{kind: string, value: number, unit?: string, context?: string, note?: string,
   *   takenAt?: number|string|Date, now?: number|string|Date}} reading
   */
  async recordReading(clientId, reading) {
    const client = this.#clientOrRefuse(clientId);
    assertRoom('readingsPerClient', client.counts.readings, {
      session_id: this.sessionId, client_id: clientId,
    });
    const stored = await appendReading(this.store, {
      ...reading, sessionId: this.sessionId, clientId, lease: this.lease,
    });
    this.#recorded(client, 'readings');
    return stored;
  }

  /**
   * Capture a note, at any moment.
   *
   * With a client it is that person's note and follows them into their progress view and export;
   * without one it is about the session as a whole. Nothing here infers one from the other.
   *
   * @param {{text: string, clientId?: string|null, takenAt?: number|string|Date,
   *   now?: number|string|Date}} note
   */
  async recordNote(note) {
    this.#assertOpen();
    const client = note.clientId ? this.#clientOrRefuse(note.clientId) : null;
    assertRoom('notesPerSession', this.#noteCount(), { session_id: this.sessionId });
    const stored = await appendNote(this.store, {
      ...note, sessionId: this.sessionId, lease: this.lease,
    });
    this.#recorded(client, 'notes');
    return stored;
  }

  /**
   * Correct a fact already recorded — a mistyped load, a rep count read back wrong.
   *
   * `produce` receives what is ACTUALLY stored and returns the correction, so an edit composes with
   * whatever else has happened rather than overwriting it with what a screen last saw. Nothing is
   * removed: a correction is a revision of the fact, and the fact itself never disappears from the
   * session's record.
   *
   * @param {'performed-record'|'reading'|'session-note'} type
   * @param {string} recordId
   * @param {(content: any, record: any) => Record<string, unknown>} produce
   * @param {{now?: number|string|Date}} [options]
   */
  async amend(type, recordId, produce, options = {}) {
    this.#assertOpen();
    if (!['performed-record', 'reading', 'session-note'].includes(type)) {
      throw new SessionStateError(`A session does not hold a ${type}.`, { type });
    }
    const stored = await this.store.update(type, recordId, produce, {
      lease: this.lease, now: options.now,
    });
    await this.refresh();
    return stored;
  }

  /**
   * Someone arrived late. They attend the same single routine — a session drives ONE routine however
   * many people are in it.
   * @param {string} clientId
   * @param {{now?: number|string|Date}} [options]
   */
  async addClient(clientId, options = {}) {
    this.#assertOpen();
    const record = await this.store.update('session', this.sessionId, (content) => {
      if (content.client_ids.includes(clientId)) return content;
      return { ...content, client_ids: [...content.client_ids, clientId] };
    }, { lease: this.lease, now: options.now });
    this.record = record;
    await this.refresh();
    return record;
  }

  /**
   * Somebody was added by mistake and has nothing recorded against them.
   *
   * Refused once they have a single fact against them, because removing them from the session would
   * strand their performed records, readings and notes outside any session they attended. Somebody
   * who was here and left is part of what happened; removing a person from history is a purge, and
   * a purge is a deliberate, different operation that belongs to the store.
   *
   * @param {string} clientId
   * @param {{now?: number|string|Date}} [options]
   */
  async removeClient(clientId, options = {}) {
    this.#assertOpen();
    const client = clientViewOf(await this.refresh(), clientId);
    const recorded = client
      ? client.counts.performed + client.counts.readings + client.counts.notes
      : 0;
    if (recorded > 0) {
      throw new SessionStateError(
        'That person already has results recorded in this session, so they cannot be taken out of it. '
        + 'What happened, happened.',
        { session_id: this.sessionId, client_id: clientId, recorded },
      );
    }
    const record = await this.store.update('session', this.sessionId, (content) => ({
      ...content, client_ids: content.client_ids.filter((id) => id !== clientId),
    }), { lease: this.lease, now: options.now });
    this.record = record;
    await this.refresh();
    return record;
  }

  /**
   * The joining link, written onto a session that is already running.
   *
   * ## Why this exists at all, when a link can be given at the start
   *
   * A link the coach pasted travels with `startSession` and never comes near this method. A MINTED
   * one cannot: minting is done on demand at the moment the session starts, and the identifier that
   * makes a retry idempotent is derived from the session's own id — which does not exist until the
   * session does. So the order is session first, link second, and second means an update on a record
   * whose lease this handle is holding.
   *
   * ## It knows nothing about who minted it
   *
   * `source` is one of the record's own `MEET_SOURCES`, and this file has no opinion about which. The
   * core is provider-neutral: a joining link is a joining link, and nothing under `core/` may learn
   * that one of the two ways of getting one involves Google. The whole of that lives in the shell.
   *
   * ## Writing the same link twice is nothing; writing a DIFFERENT one is refused
   *
   * A retry that comes back with the identifier it sent gets the same conference, so re-recording the
   * link it already has must be a no-op rather than an error — that is the idempotent path working,
   * and turning it into a refusal would make a successful retry look like a fault. A link that
   * disagrees with the one already recorded is the opposite: something minted a SECOND meeting, or is
   * about to overwrite a link the coach pasted himself, and either way the session would silently
   * start pointing somewhere else. That is refused loudly rather than absorbed.
   *
   * The rest — that an in-person session may carry no link, that a link and its origin travel
   * together, that a link is an https address and not a whole provider response — belongs to
   * `core/model/entities/session.js` and is enforced there, on the way in. No copy of those rules is
   * made here.
   *
   * @param {string} url
   * @param {string} source one of `MEET_SOURCES`
   * @param {{now?: number|string|Date}} [options]
   */
  async recordJoiningLink(url, source, options = {}) {
    this.#assertOpen();
    const record = await this.store.update('session', this.sessionId, (content) => {
      if (content.meet_url === url) return content;
      if (content.meet_url) {
        throw new SessionStateError(
          'This session already has a joining link. Recording a different one would send everybody '
          + 'to a meeting the session is not pointing at.',
          { session_id: this.sessionId, held: content.meet_source ?? null },
        );
      }
      return { ...content, meet_url: url, meet_source: source };
    }, { lease: this.lease, now: options.now });

    this.record = record;
    await this.refresh();
    return record;
  }

  /**
   * He is leaving, and the session is not finished. The record stands as a partial record of what
   * happened, and it can be picked up later exactly as it stands.
   * @param {{now?: number|string|Date}} [options]
   */
  interrupt(options = {}) {
    return this.#end('interrupted', options);
  }

  /**
   * The session finished.
   * @param {{summary?: string, now?: number|string|Date}} [options]
   */
  complete(options = {}) {
    return this.#end('completed', options);
  }

  /**
   * The session is not going to be finished — the client left, the power went and did not come back.
   * What was recorded is kept: an abandoned session is a partial record, not a discarded one.
   * @param {{summary?: string, now?: number|string|Date}} [options]
   */
  abandon(options = {}) {
    return this.#end('abandoned', options);
  }

  /**
   * Let the session go WITHOUT saying anything about its state — moving to the other window, or
   * closing this one deliberately.
   *
   * The session stays `in_progress`, which is exactly where a power cut would have left it, and it
   * is picked up the same way. Nothing is lost either way; this simply releases the lease so another
   * window can take it.
   */
  async detach() {
    if (this.closed) return this.record;
    this.closed = true;
    await this.lease.release();
    return this.record;
  }

  // ── internals ───────────────────────────────────────────────────────────────────────────────

  /**
   * @param {string} status
   * @param {{summary?: string, now?: number|string|Date}} options
   */
  async #end(status, options) {
    this.#assertOpen();
    const ended = ['completed', 'abandoned'].includes(status);
    const record = await this.store.update('session', this.sessionId, (content) => {
      const next = { ...content, status };
      if (ended) next.ended_at = timestamp(options.now);
      if (options.summary) next.summary = options.summary;
      return next;
    }, { lease: this.lease, now: options.now });

    this.record = record;
    // The state is written BEFORE the lease is released. Releasing first would leave a window in
    // which another window could open a session whose status had not yet moved.
    this.closed = true;
    await this.lease.release();
    return record;
  }

  /**
   * Account for a fact that has just committed.
   *
   * The counts are what the NEXT append checks against the journal's bound, so they are kept current
   * rather than re-read; the view as a whole is marked stale, and `current()` re-derives it from the
   * record when somebody actually asks for it.
   *
   * @param {import('./projection.js').ClientView|null} client
   * @param {'performed'|'readings'|'notes'} kind
   */
  #recorded(client, kind) {
    if (client) client.counts[kind] += 1;
    if (this.view) this.view.counts[kind] += 1;
    this.stale = true;
  }

  #assertOpen() {
    if (!this.closed) return;
    throw new SessionClosedError(
      'This session is no longer open in this window, so nothing more can be recorded against it.',
      { session_id: this.sessionId },
    );
  }

  /**
   * @param {string} clientId
   * @returns {import('./projection.js').ClientView}
   */
  #clientOrRefuse(clientId) {
    this.#assertOpen();
    assertAttending(this.record, clientId);
    const client = this.view && clientViewOf(this.view, clientId);
    if (!client) {
      throw new SessionStateError(
        'That person is in the session but has not been read back yet. Reopen the session.',
        { session_id: this.sessionId, client_id: clientId },
      );
    }
    return client;
  }

  /** Notes on this session, across every client and the session itself. */
  #noteCount() {
    return this.view ? this.view.counts.notes : JOURNAL_LIMITS.notesPerSession;
  }
}
