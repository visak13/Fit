/**
 * THE FAILURES THAT ARE THIS LAYER'S OWN BUSINESS.
 *
 * A remote failure is the port's (`RemoteError`, carrying `retryable` and `needsReauth`); a local
 * write failure is the store's. These three are what only the synchronisation engine can raise, and
 * each is thrown rather than returned as a status, so a caller cannot carry on having ignored it.
 */

/** A caller handed this package something it refuses at the boundary. */
export class SyncBoundaryError extends Error {
  /** @param {string} message @param {Record<string, unknown>} [details] */
  constructor(message, details = {}) {
    super(message);
    this.name = 'SyncBoundaryError';
    this.details = details;
  }
}

/**
 * A document read out of the remote copy is not one this engine wrote, or not one it understands.
 *
 * Thrown rather than skipped: a file we cannot read in a space we write into is either a newer
 * version of this application or a corruption, and both need a person. Quietly ignoring it would
 * mean synchronising a subset of the coach's data while reporting success.
 */
export class SyncDocumentError extends Error {
  /** @param {string} message @param {Record<string, unknown>} [details] */
  constructor(message, details = {}) {
    super(message);
    this.name = 'SyncDocumentError';
    this.details = details;
  }
}

/**
 * A record was refused on its way OUT.
 *
 * The outbound payload is a whitelist: envelope fields rebuilt one by one, content that conforms to
 * the content contract, and nothing else. A record that does not fit is refused rather than trimmed,
 * because trimming is how something unexpected rides along in a field nobody thought to look at.
 */
export class SyncPayloadRefused extends Error {
  /** @param {string} message @param {Record<string, unknown>} [details] */
  constructor(message, details = {}) {
    super(message);
    this.name = 'SyncPayloadRefused';
    this.details = details;
  }
}
