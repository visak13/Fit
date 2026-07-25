/**
 * THE SESSION LAYER'S ERROR TAXONOMY.
 *
 * Two rules, both inherited from the store and both deliberate:
 *
 *  1. **A failure throws.** It is never a resolved promise carrying a flag, because the one outcome
 *     this layer exists to prevent is a caller carrying on as though a fact had been recorded.
 *  2. **An ordinary state is not an error.** A session that is open in the coach's other window, or
 *     one left interrupted by a power cut, is a normal thing that happens — those are reported as
 *     values (see `openSession`, whose result says which situation it is), not raised as failures.
 *
 * Every message is written to be shown to the coach as it stands. He is not a programmer, and a
 * message he cannot act on is the same as no message at all.
 */

/** Base class, so a caller can catch everything from this layer at once. */
export class SessionError extends Error {
  /** @param {string} message @param {Record<string, unknown>} [detail] */
  constructor(message, detail = {}) {
    super(message);
    this.name = new.target.name;
    this.detail = detail;
  }
}

/**
 * The session is not in a state that permits what was asked — starting one that already ran,
 * resuming one that finished, recording against one that has ended.
 */
export class SessionStateError extends SessionError {}

/**
 * The handle has been let go: the session was completed, abandoned, left, or its lease released.
 * A closed handle refuses every write rather than reacquiring anything behind the coach's back.
 */
export class SessionClosedError extends SessionError {}

/**
 * A fact was offered against somebody who is not attending this session.
 *
 * This is the guard that keeps one client's readings out of another client's history, which is the
 * failure the whole per-client design exists to prevent.
 */
export class SessionParticipantError extends SessionError {}

/**
 * The journal for this session has reached its declared bound.
 *
 * The bound exists so that a session's own record can always be read back WHOLE — see
 * `JOURNAL_LIMITS` in `journal.js`. Refusing loudly at a stated limit is the alternative to a
 * silent truncation, which would look exactly like a session that had recorded less than it did.
 */
export class SessionJournalFullError extends SessionError {}
