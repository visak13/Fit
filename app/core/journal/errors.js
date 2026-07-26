/**
 * THE REFUSALS, named.
 *
 * Each of these exists because a guard in this package throws rather than accepting something
 * questionable, and a caller that wants to distinguish "you used a kind nobody defined" from
 * "you tried to put a client's notes in the log" needs to be able to ask which happened without
 * matching on a message string. Message strings are for people; these types are for code.
 *
 * They all carry a `cause` where one exists, because a refusal that discards what provoked it
 * makes the next person guess.
 */

/** Base for everything this package refuses to do. */
export class JournalError extends Error {
  /** @param {string} message @param {{cause?: unknown}} [options] */
  constructor(message, options) {
    super(message, options);
    this.name = 'JournalError';
  }
}

/**
 * A kind that is not in the closed vocabulary.
 *
 * This is the refusal the whole step exists for: a later step that needs a kind the log does not
 * have must come here and add it, in front of a reviewer, rather than passing its own string and
 * quietly growing a second vocabulary nobody agreed to.
 */
export class JournalKindError extends JournalError {
  /** @param {string} message @param {{cause?: unknown, kind?: unknown}} [options] */
  constructor(message, options) {
    super(message, options);
    this.name = 'JournalKindError';
    /** The kind that was refused, exactly as it was offered. @type {unknown} */
    this.kind = options?.kind;
  }
}

/**
 * An entry that carried, or could have carried, a record's content.
 *
 * The log records THAT something happened and to WHICH record. The moment it also records WHAT
 * the record says, every guarantee about the record store — sealed fields, deletion that
 * propagates, a purge that leaves nothing behind — has a second copy outside it. This build has
 * already measured that exact failure once, in the outbox.
 */
export class JournalContentError extends JournalError {
  /** @param {string} message @param {{cause?: unknown, field?: string}} [options] */
  constructor(message, options) {
    super(message, options);
    this.name = 'JournalContentError';
    /** The offending field path, so the caller is told where to look. @type {string|undefined} */
    this.field = options?.field;
  }
}

/**
 * The device's chain moved between preparing an entry and writing it.
 *
 * Not a defect and not corruption: two windows of one browser share one database AND one device tag,
 * so they append to one chain and one of them must lose. It is its own class rather than a message
 * because the right response is the opposite of every other refusal here — repeat the unit of work,
 * rather than fix the call site. See `durable.js` for why the entry is hashed before the transaction
 * opens, which is what makes this race possible at all.
 */
export class JournalRaceError extends JournalError {
  /**
   * @param {string} message
   * @param {{cause?: unknown, device?: string, expected_head?: string|null, actual_head?: string|null,
   *          attempts?: number}} [options]
   */
  constructor(message, options) {
    super(message, options);
    this.name = 'JournalRaceError';
    /** @type {string|undefined} */
    this.device = options?.device;
    /** The digest the draft expected the head to still carry. @type {string|null|undefined} */
    this.expected_head = options?.expected_head;
    /** What it actually carried. @type {string|null|undefined} */
    this.actual_head = options?.actual_head;
    /** How many times the unit was repeated before giving up. @type {number|undefined} */
    this.attempts = options?.attempts;
  }
}

/** A malformed entry, or a chain that cannot be verified because its inputs are not entries. */
export class JournalShapeError extends JournalError {
  /** @param {string} message @param {{cause?: unknown, field?: string}} [options] */
  constructor(message, options) {
    super(message, options);
    this.name = 'JournalShapeError';
    /** @type {string|undefined} */
    this.field = options?.field;
  }
}
