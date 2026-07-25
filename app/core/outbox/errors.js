/**
 * THE QUEUE'S OWN FAILURES.
 *
 * Deliberately few, and deliberately NOT a place where a remote failure is re-wrapped. A failure that
 * came from the port keeps its own type, because `retryable` and `needsReauth` on it are what decide
 * whether an entry waits, holds or stops — re-wrapping would throw away exactly the two facts the
 * queue reads.
 *
 * These are for the two things that are the queue's own business: an entry that cannot be stored, and
 * an entry that is not there.
 */

/** Base class, so a caller can catch everything from this layer with one clause. */
export class OutboxError extends Error {
  /** @param {string} message @param {Record<string, unknown>} [details] */
  constructor(message, details = {}) {
    super(message);
    this.name = new.target.name;
    /** @type {Record<string, unknown>} Never a payload; identifiers and codes only. */
    this.details = details;
  }
}

/**
 * The entry is malformed and was not stored.
 *
 * Carries every field-level issue rather than the first, which is the same discipline the record model
 * uses: a caller fixing one fault at a time against a queue is a slow way to find four.
 */
export class OutboxEntryInvalid extends OutboxError {
  /**
   * @param {string} message
   * @param {{path: string, message: string}[]} issues
   * @param {Record<string, unknown>} [details]
   */
  constructor(message, issues, details = {}) {
    super(message, details);
    /** @type {{path: string, message: string}[]} */
    this.issues = issues;
  }
}

/** No entry exists under that identity — it was pruned, or the identity is wrong. */
export class OutboxEntryMissing extends OutboxError {
  /** @param {string} entryId */
  constructor(entryId) {
    super('No outbox entry exists with that identity.', { entry_id: entryId });
    this.entryId = entryId;
  }
}
