/**
 * THE REMOTE STORAGE PORT — the boundary between this foundation and the cloud step.
 *
 * ## What this file is for
 *
 * Everything the application does with remote storage passes through the six operations
 * declared here and through nothing else. That is the whole point: the foundation — the
 * outbox, the sync engine, the key envelope guard — can be built and tested in full before
 * any cloud code exists, and the later integration step then supplies ONE real implementation
 * of this same port and touches nothing else.
 *
 * ## The honesty clause, and it is not decoration
 *
 * Nothing in this directory makes a live call to any provider, and nothing here proves
 * anything about one. A test that passes against the in-memory double proves that OUR LOGIC
 * is correct given the behaviour we modelled. It never proves the platform behaves that way.
 * The value of the double is therefore exactly equal to its fidelity, which is why the two
 * quirks below are recorded as MEASURED, with where they were measured, and are reproduced
 * faithfully rather than sanded smooth. See {@link PROVES_NOTHING_ABOUT_THE_PLATFORM}.
 *
 * ## Why the vocabulary is deliberately bland
 *
 * No provider name, product name or provider-specific term appears anywhere in this port —
 * not in a method name, not in a field name, not in an error. Two SPACES are addressed by
 * their ROLE:
 *
 *   - {@link SPACES.VISIBLE} — an ordinary space the account holder can see and browse. The
 *     backup copies live here, because they are artifacts the user owns and expects to find.
 *   - {@link SPACES.HIDDEN}  — an application-only space the account holder does not browse.
 *     The key envelope lives here. Hidden buys a boundary against OTHER applications and
 *     against accidental sharing. It is never a boundary against the account holder.
 *
 * A later implementation should be a fill-in, not a translation. If the cloud step finds
 * itself renaming concepts to fit, this port was drawn wrong.
 *
 * ## What is deliberately ABSENT
 *
 * There is NO conditional write. Not as an optional parameter, not as a "best effort" flag,
 * not anywhere. The measured service offers no conditional-match facility, so a port that
 * offered one would be advertising a lock that cannot be honoured — and every caller built
 * against that promise would be wrong in a way that only surfaces in the cloud step, where
 * it is most expensive to diagnose. Read-compare-write here is DETECTION AFTER THE FACT.
 * {@link hasMoved} is the whole of what detection can offer, and its own documentation says
 * plainly what it cannot do.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Spaces
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The two spaces this application addresses, named by role rather than by provider term.
 */
export const SPACES = Object.freeze({
  /** An ordinary space the account holder can see and browse. Backup copies live here. */
  VISIBLE: 'visible',
  /** An application-only space the account holder does not browse. The key envelope lives here. */
  HIDDEN: 'hidden',
});

/** @type {readonly string[]} */
export const SPACE_VALUES = Object.freeze([SPACES.VISIBLE, SPACES.HIDDEN]);

/** Longest file name the port accepts. Validated at the boundary so a bad name fails here, not remotely. */
export const NAME_MAX = 255;

/**
 * Default deadline for a single remote call.
 *
 * Every outbound call carries an explicit timeout — there is no "wait forever" path through
 * this port. A call with no deadline is how an app ends up stuck in a spinner it can never
 * leave, which the accountability standard forbids outright: failure must be loud, specific
 * and bounded in time.
 */
export const DEFAULT_TIMEOUT_MS = 30_000;

// ═══════════════════════════════════════════════════════════════════════════════
// Errors — typed, so a caller never has to match on a message string
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Base class for every failure this port raises.
 *
 * Two flags carry the only questions a caller actually asks, so the outbox and the sync
 * engine can decide what to do without parsing text:
 *
 *   - `retryable`   — the same call, unchanged, could succeed later.
 *   - `needsReauth` — it cannot succeed until the user re-authorises, which needs a gesture.
 *
 * `cause` is always preserved when one failure is raised from another. An exception is never
 * swallowed and never re-raised bare.
 */
export class RemoteError extends Error {
  /**
   * @param {string} message
   * @param {{code: string, retryable?: boolean, needsReauth?: boolean, cause?: unknown}} opts
   */
  constructor(message, { code, retryable = false, needsReauth = false, cause } = /** @type {any} */ ({})) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = new.target.name;
    /** @type {string} A stable machine-readable code. Never localise or reword this. */
    this.code = code;
    /** @type {boolean} */
    this.retryable = retryable;
    /** @type {boolean} */
    this.needsReauth = needsReauth;
  }
}

/**
 * The request was malformed and no call was attempted. Never retryable — retrying a bad
 * request produces the same bad request.
 */
export class RemoteInvalidRequest extends RemoteError {
  /** @param {string} message @param {{cause?: unknown}} [opts] */
  constructor(message, opts = {}) {
    super(message, { code: 'invalid_request', retryable: false, cause: opts.cause });
  }
}

/** No file exists under that identifier — it was never created, or it has been removed. */
export class RemoteFileNotFound extends RemoteError {
  /** @param {string} fileId @param {{cause?: unknown}} [opts] */
  constructor(fileId, opts = {}) {
    super(`No remote file exists with identifier "${fileId}".`, {
      code: 'not_found', retryable: false, cause: opts.cause,
    });
    this.fileId = fileId;
  }
}

/**
 * The credential has expired. Retryable, but ONLY after the user re-authorises — which needs
 * a real user gesture and therefore cannot be done from a timer or in the background.
 *
 * This is the normal state, not an exceptional one: credentials are short-lived and
 * foreground-only, so "no credential" is what a cold start looks like.
 */
export class RemoteCredentialExpired extends RemoteError {
  /** @param {{cause?: unknown}} [opts] */
  constructor(opts = {}) {
    super('The remote credential has expired. The user must re-authorise before this call can succeed.', {
      code: 'credential_expired', retryable: true, needsReauth: true, cause: opts.cause,
    });
  }
}

/** The service could not be reached or refused the call transiently. Retryable as-is. */
export class RemoteUnavailable extends RemoteError {
  /** @param {string} [message] @param {{cause?: unknown}} [opts] */
  constructor(message = 'The remote service is unavailable.', opts = {}) {
    super(message, { code: 'unavailable', retryable: true, cause: opts.cause });
  }
}

/**
 * The call exceeded its deadline.
 *
 * The outcome is genuinely UNKNOWN, and that is the important part: a write that timed out
 * may well have landed. A caller must never treat a timeout as "it did not happen" — which
 * is why every remote write carries its own idempotency key in the outbox.
 */
export class RemoteTimeout extends RemoteError {
  /** @param {string} operation @param {number} timeoutMs @param {{cause?: unknown}} [opts] */
  constructor(operation, timeoutMs, opts = {}) {
    super(`The remote call "${operation}" exceeded its ${timeoutMs}ms deadline. Its outcome is unknown.`, {
      code: 'timeout', retryable: true, cause: opts.cause,
    });
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

/** Raised by the port base class when an implementation has not supplied an operation. */
export class RemoteNotImplemented extends RemoteError {
  /** @param {string} operation */
  constructor(operation) {
    super(`This remote storage implementation does not provide "${operation}".`, {
      code: 'not_implemented', retryable: false,
    });
    this.operation = operation;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// The shape of what comes back
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The metadata a read-compare-write cycle needs, and no more.
 *
 * @typedef {Object} RemoteFileMeta
 * @property {string} file_id     Opaque identifier. The ONLY reliable way to address a file.
 * @property {string} space       Which space it lives in.
 * @property {string} name        The name it was created under. NOT unique — see MEASURED_QUIRKS.
 * @property {number} revision    Increments on every overwrite. The detector for a lost update.
 * @property {string} modified_at When this revision was written, ISO 8601 UTC with milliseconds.
 * @property {number} size        Byte length of the content.
 */

/**
 * @typedef {Object} RemoteFile
 * @property {RemoteFileMeta} meta
 * @property {Uint8Array} content
 */

// ═══════════════════════════════════════════════════════════════════════════════
// What this port is, declared as data so it can be tested rather than merely described
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The six operations. This list is the port's narrowness, written down where a test can hold
 * it — `port.test.js` asserts the class exposes exactly these and nothing more.
 *
 * Narrow is the whole design. Every operation added here is one the cloud step must implement
 * for real, and one more way for the double to drift from the platform.
 */
export const PORT_OPERATIONS = Object.freeze([
  'list', 'create', 'read', 'overwrite', 'remove', 'stat',
]);

/**
 * What the port promises, and — more usefully — what it refuses to promise.
 *
 * Declared as data rather than as prose so that removing a guarantee is a code change a test
 * catches, not a paragraph someone quietly edits.
 */
export const PORT_CAPABILITIES = Object.freeze({
  /**
   * FALSE, and this is the single most important line in the file. The measured service has
   * no conditional-match facility, so the port offers no way to say "write this only if the
   * revision is still N". Adding one would be advertising a lock that cannot be honoured.
   */
  conditional_write: false,
  /**
   * FALSE in BOTH spaces. Creating a file with a name that already exists produces a SECOND
   * file. It does not fail, replace, or de-duplicate.
   */
  name_uniqueness: false,
  /**
   * TRUE. A revision marker moves on every overwrite, which is what makes a lost update
   * DETECTABLE after the fact. Detectable is not preventable.
   */
  revision_marker: true,
  /**
   * FALSE. There is no server-side content digest on this port. Revision plus modification
   * time is the whole detection surface; a caller wanting content comparison reads the bytes.
   */
  content_digest: false,
  /**
   * FALSE. There are no transactions and no batch atomicity. Two writes are two writes, and
   * either may land without the other.
   */
  atomic_multi_write: false,
});

/**
 * THE MEASURED QUIRKS, recorded with their provenance.
 *
 * Every entry says whether it was MEASURED or INFERRED, and an inferred one says which
 * direction it was inferred in. That distinction is the difference between a fact this
 * foundation can lean on and a guess it must stay ready to be wrong about, and collapsing
 * the two is exactly how a double becomes kinder than reality without anyone noticing.
 */
export const MEASURED_QUIRKS = Object.freeze([
  Object.freeze({
    id: 'no-name-uniqueness',
    confidence: 'MEASURED',
    where: 'Observed on real devices during the platform spike, 2026-07-25.',
    what: 'The hidden application-only space does NOT enforce name uniqueness. Two writes of '
      + 'the same name from two devices produced two DISTINCT files, with no error, no '
      + 'de-duplication and no conflict raised.',
    how_it_was_found: 'Two devices each created a key envelope under the same name during about '
      + 'fifteen minutes of ordinary two-device use, by someone doing nothing wrong. The hidden '
      + 'space then listed BOTH, with different identifiers.',
    why_the_double_must_reproduce_it: 'The adopt-before-create guard exists precisely to prevent '
      + 'a second envelope, and a split key family is silent and unrecoverable. If the double '
      + 'rejected or merged a same-name write, that guard would never be exercised against the '
      + 'state it exists to prevent, and the most dangerous defect in this design would pass its '
      + 'own test.',
    also_note: 'The spike measured this in the HIDDEN space. The double applies it to the VISIBLE '
      + 'space too. That is an INFERENCE, and it is deliberately made in the harsher direction: '
      + 'assuming no uniqueness where there might be some costs a redundant check, whereas '
      + 'assuming uniqueness where there is none costs a silent duplicate.',
  }),
  Object.freeze({
    id: 'no-conditional-write',
    confidence: 'MEASURED',
    where: 'Established against the real service during specialist research, 2026-07-25.',
    what: 'There is NO conditional-match facility. The revision, content digest and modification '
      + 'time are all output-only: nothing can be sent back as a precondition on a write.',
    how_it_was_found: 'The service exposes no precondition header or parameter on its update path; '
      + 'the fields that would serve as one are documented as read-only outputs.',
    why_the_double_must_reproduce_it: 'It makes read-compare-write DETECTION rather than a lock. '
      + 'Nothing stops the other device writing between our read and our write, so a lost update '
      + 'is genuinely reachable and the sync engine must catch it after the fact and surface both '
      + 'sides. A double that prevented the loss would let the conflict-surfacing code be assumed '
      + 'correct rather than proven.',
    also_note: 'This is why the port exposes no conditional parameter at all. Offering one would '
      + 'encode a facility the platform lacks.',
  }),
]);

/**
 * The claim this directory is allowed to make, stated once and asserted by a test so it
 * cannot rot into a comment nobody reads.
 */
export const PROVES_NOTHING_ABOUT_THE_PLATFORM =
  'No live provider call is made anywhere in this directory, and no claim about one is made. '
  + 'A passing test against the in-memory double proves that OUR LOGIC is correct given the '
  + 'behaviour modelled here. It NEVER proves the platform behaves that way. The double is '
  + 'worth exactly its fidelity to the measured quirks and nothing more.';

// ═══════════════════════════════════════════════════════════════════════════════
// Boundary validation — a bad request fails HERE, before any call is attempted
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @param {unknown} space
 * @returns {string}
 * @throws {RemoteInvalidRequest}
 */
export function assertSpace(space) {
  if (typeof space !== 'string' || !SPACE_VALUES.includes(space)) {
    throw new RemoteInvalidRequest(
      `Unknown space ${JSON.stringify(space)}. Must be one of: ${SPACE_VALUES.join(', ')}.`);
  }
  return space;
}

/**
 * @param {unknown} name
 * @returns {string}
 * @throws {RemoteInvalidRequest}
 */
export function assertName(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new RemoteInvalidRequest('A file name is required and must not be blank.');
  }
  if (name.length > NAME_MAX) {
    throw new RemoteInvalidRequest(`A file name must be at most ${NAME_MAX} characters.`);
  }
  return name;
}

/**
 * @param {unknown} fileId
 * @returns {string}
 * @throws {RemoteInvalidRequest}
 */
export function assertFileId(fileId) {
  if (typeof fileId !== 'string' || fileId.trim() === '') {
    throw new RemoteInvalidRequest('A file identifier is required and must not be blank.');
  }
  return fileId;
}

/**
 * @param {unknown} timeoutMs
 * @returns {number}
 * @throws {RemoteInvalidRequest}
 */
export function assertTimeout(timeoutMs) {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RemoteInvalidRequest(
      'A remote call needs a positive, finite timeout in milliseconds. There is no wait-forever path through this port.');
  }
  return timeoutMs;
}

/** Text to bytes, using the encoder built into both the browser and the runtime. */
export function textToBytes(text) {
  return new TextEncoder().encode(text);
}

/** Bytes back to text. */
export function bytesToText(bytes) {
  return new TextDecoder().decode(bytes);
}

/**
 * Normalise content to bytes, COPYING it on the way in.
 *
 * The copy is fidelity, not caution. A real remote store holds bytes that left this machine;
 * a caller who mutates the array they handed over cannot reach back and change what was
 * stored. A double that kept the caller's reference would let a test pass that depends on
 * something the real service could never do.
 *
 * @param {unknown} content
 * @returns {Uint8Array}
 * @throws {RemoteInvalidRequest}
 */
export function normalizeContent(content) {
  if (typeof content === 'string') return textToBytes(content);
  if (content instanceof Uint8Array) return new Uint8Array(content);
  if (content instanceof ArrayBuffer) return new Uint8Array(content.slice(0));
  throw new RemoteInvalidRequest('Content must be text, a byte array, or an array buffer.');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Detection — all that is on offer, and honest about it
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Did this file change between the metadata we hold and the metadata we just read?
 *
 * ## Read this before using it
 *
 * This is DETECTION AFTER THE FACT and it is NOT a lock. Because the service has no
 * conditional-match facility, the sequence is unavoidably:
 *
 *   1. read the current metadata
 *   2. compare it with what we held        ← `hasMoved` answers only this
 *   3. write
 *
 * Between step 2 and step 3 there is a window nothing can close, so the other device's write
 * can still land in it and be destroyed by ours. `hasMoved` returning `false` therefore does
 * NOT mean the write is safe; it means no change had landed at the moment we looked.
 *
 * That window is not a defect in this function — it is the platform, and pretending otherwise
 * is the failure this port is drawn to prevent. The correct response to a detected change is
 * to surface BOTH sides to the user. Never silently overwrite, and never silently discard the
 * losing write: an unreported conflict is a lost edit whichever way it faces.
 *
 * @param {RemoteFileMeta} held    The metadata we read before deciding to write.
 * @param {RemoteFileMeta} current The metadata as it stands now.
 * @returns {boolean} true when the file moved under us.
 */
export function hasMoved(held, current) {
  if (!held || !current) {
    throw new RemoteInvalidRequest('hasMoved needs both the metadata held and the metadata read now.');
  }
  if (held.file_id !== current.file_id) {
    throw new RemoteInvalidRequest(
      'hasMoved compares two readings of the SAME file. Two different identifiers are two different files — '
      + 'which, given that names are not unique, is a case the caller must handle rather than compare away.');
  }
  return held.revision !== current.revision || held.modified_at !== current.modified_at;
}

// ═══════════════════════════════════════════════════════════════════════════════
// The port itself
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The remote storage port: six operations, two spaces, no provider vocabulary.
 *
 * Implementations extend this class. It is written as a class rather than as a bag of
 * functions so that an implementation is one object with one lifetime — the in-memory double
 * today, the real client later — and so that a caller can hold "the remote store" as a value
 * without knowing or caring which it has.
 *
 * Every operation is asynchronous, every operation takes an explicit deadline, and every
 * operation fails with a typed {@link RemoteError}.
 */
export class RemoteStoragePort {
  /**
   * List a space.
   *
   * Returns metadata only — never content — because listing is how a caller discovers what
   * exists, and pulling every payload to answer "what is here" is the wrong shape for a
   * space that may hold a backup history.
   *
   * The returned array MAY contain several entries sharing one name. That is not a defect;
   * see {@link MEASURED_QUIRKS}. A caller that assumes at most one match per name is wrong.
   *
   * @param {string} space
   * @param {{namePrefix?: string, timeoutMs?: number}} [opts]
   * @returns {Promise<RemoteFileMeta[]>}
   */
  // eslint-disable-next-line no-unused-vars
  async list(space, opts) { throw new RemoteNotImplemented('list'); }

  /**
   * Create a file with a name and content.
   *
   * ALWAYS creates. It is never an upsert, it never replaces a same-named file, and it never
   * fails because the name is taken — because the measured service does none of those things.
   * A caller that wants at-most-one must list first and decide; that guard is the caller's
   * responsibility precisely because the store will not do it.
   *
   * @param {string} space
   * @param {{name: string, content: string|Uint8Array|ArrayBuffer}} file
   * @param {{timeoutMs?: number}} [opts]
   * @returns {Promise<RemoteFileMeta>}
   */
  // eslint-disable-next-line no-unused-vars
  async create(space, file, opts) { throw new RemoteNotImplemented('create'); }

  /**
   * Read a file by identifier, content included.
   * @param {string} fileId
   * @param {{timeoutMs?: number}} [opts]
   * @returns {Promise<RemoteFile>}
   */
  // eslint-disable-next-line no-unused-vars
  async read(fileId, opts) { throw new RemoteNotImplemented('read'); }

  /**
   * Overwrite a file by identifier, producing a new revision.
   *
   * There is NO conditional parameter and there will not be one. See {@link PORT_CAPABILITIES}.
   *
   * @param {string} fileId
   * @param {string|Uint8Array|ArrayBuffer} content
   * @param {{timeoutMs?: number}} [opts]
   * @returns {Promise<RemoteFileMeta>}
   */
  // eslint-disable-next-line no-unused-vars
  async overwrite(fileId, content, opts) { throw new RemoteNotImplemented('overwrite'); }

  /**
   * Delete a file by identifier.
   * @param {string} fileId
   * @param {{timeoutMs?: number}} [opts]
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line no-unused-vars
  async remove(fileId, opts) { throw new RemoteNotImplemented('remove'); }

  /**
   * Read the metadata a read-compare-write cycle needs, without pulling the content.
   * @param {string} fileId
   * @param {{timeoutMs?: number}} [opts]
   * @returns {Promise<RemoteFileMeta>}
   */
  // eslint-disable-next-line no-unused-vars
  async stat(fileId, opts) { throw new RemoteNotImplemented('stat'); }
}
