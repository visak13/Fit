/**
 * The store's error taxonomy.
 *
 * Every failure this layer can produce is one of these, each with a stable `code` a test can
 * assert on and a `message` a person can read. They are distinct types rather than one generic
 * error because the interface above has to react differently to each: a validation failure is
 * the coach's to fix, a conflict needs a re-read and a retry, a lease refusal is another window
 * legitimately holding a session, and a write failure means the data is NOT saved and must be
 * said so loudly.
 *
 * The one rule that matters here: a write failure is never softened. `StoreWriteError` means the
 * transaction did not commit, and the caller must treat the write as not having happened.
 */

/** Base class, so a caller can catch everything this layer throws in one clause. */
export class StoreError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Record<string, unknown>} [detail]
   */
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
    this.detail = detail;
  }
}

/**
 * A record was refused by the model before anything was written.
 *
 * The store validates on the way in rather than trusting its callers, so a malformed record
 * cannot reach the database and be discovered later by something that cannot report it. The
 * `issues` array is the model's own `{ path, code, message }` list, unchanged, so a screen can
 * attach each one to the field it belongs to.
 */
export class StoreValidationError extends StoreError {
  /**
   * @param {string} message
   * @param {Array<{path: string, code: string, message: string}>} issues
   * @param {Record<string, unknown>} [detail]
   */
  constructor(message, issues, detail = {}) {
    super('VALIDATION', message, detail);
    this.name = 'StoreValidationError';
    this.issues = issues;
  }
}

/**
 * A read-modify-write lost the race: the stored revision is no longer the one that was read.
 *
 * This is the mechanism that keeps two laptop windows from corrupting each other. Because every
 * mutation reads and writes inside ONE transaction, and the platform serialises overlapping
 * read-write transactions, the second writer sees a revision it did not expect instead of
 * silently overwriting the first. The correct response is to re-read and re-apply, never to
 * force the write through.
 */
export class StoreConflictError extends StoreError {
  /** @param {string} message @param {Record<string, unknown>} [detail] */
  constructor(message, detail = {}) {
    super('CONFLICT', message, detail);
    this.name = 'StoreConflictError';
  }
}

/**
 * The transaction did not commit. **The data is not saved.**
 *
 * Raised when the platform aborts or fails a write transaction — quota exhausted, the database
 * closed underneath us, a constraint violated. It is deliberately a hard error rather than a
 * returned status, because the one outcome this layer exists to prevent is a caller carrying on
 * as though a write had landed.
 */
export class StoreWriteError extends StoreError {
  /** @param {string} message @param {Record<string, unknown>} [detail] */
  constructor(message, detail = {}) {
    super('WRITE_FAILED', message, detail);
    this.name = 'StoreWriteError';
  }
}

/** The record asked for is not in the store. */
export class StoreNotFoundError extends StoreError {
  /** @param {string} message @param {Record<string, unknown>} [detail] */
  constructor(message, detail = {}) {
    super('NOT_FOUND', message, detail);
    this.name = 'StoreNotFoundError';
  }
}

/**
 * A session-scoped write was attempted without a live lease on that session.
 *
 * Per-session isolation is enforced rather than advised: a context that does not hold the
 * session's lease cannot write into it, so the second window running a different routine
 * cannot append to the first window's session even by mistake.
 */
export class StoreLeaseError extends StoreError {
  /** @param {string} message @param {Record<string, unknown>} [detail] */
  constructor(message, detail = {}) {
    super('LEASE', message, detail);
    this.name = 'StoreLeaseError';
  }
}

/**
 * A capability the platform does not offer here was used.
 *
 * The concrete case: running two live sessions at once is a laptop-only capability, and the
 * mobile build must not offer it. Asking for it where it is withheld is a programming error and
 * says so, rather than half-working.
 */
export class StoreCapabilityError extends StoreError {
  /** @param {string} message @param {Record<string, unknown>} [detail] */
  constructor(message, detail = {}) {
    super('CAPABILITY', message, detail);
    this.name = 'StoreCapabilityError';
  }
}
