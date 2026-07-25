/**
 * Validation issue plumbing.
 *
 * Every validator in this package returns the SAME shape, so a caller never has to
 * learn a second convention:
 *
 *   { ok: boolean, issues: Issue[] }
 *
 * An `Issue` names a path, a machine-readable code and a sentence a person can read.
 * The code is what a test asserts on; the message is what a screen shows. Both are
 * required — a validator that only produces prose cannot be tested precisely, and one
 * that only produces codes cannot be shown to the coach.
 *
 * Nothing here throws. Validation reports; it does not control flow by exception.
 *
 * @typedef {Object} Issue
 * @property {string} path    Dotted/bracketed path into the record, e.g. `scaling.high.sets`.
 * @property {string} code    One of {@link CODES}.
 * @property {string} message Plain-language explanation.
 *
 * @typedef {Object} ValidationResult
 * @property {boolean} ok     True when `issues` is empty.
 * @property {Issue[]} issues Every problem found. Validators do NOT stop at the first.
 */

/**
 * The closed set of issue codes.
 *
 * Several of these exist to distinguish a defect that is merely a typo from one that
 * breaks a recorded product decision. `UNKNOWN_FIELD` is a typo; `FORBIDDEN_LOAD` and
 * `MINIMISATION` are decisions, and a reviewer must be able to tell them apart without
 * reading the message text.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const CODES = Object.freeze({
  /** A required field is absent, null or undefined. */
  REQUIRED: 'REQUIRED',
  /** Present, but the wrong JavaScript type. */
  TYPE: 'TYPE',
  /** A number or integer outside its allowed range. */
  RANGE: 'RANGE',
  /** A string or array outside its allowed length. */
  LENGTH: 'LENGTH',
  /** A string that does not match its required format (id key, timestamp, ...). */
  FORMAT: 'FORMAT',
  /** A value outside its allowed vocabulary. */
  ENUM: 'ENUM',
  /** Duplicate entry where uniqueness is required. */
  DUPLICATE: 'DUPLICATE',
  /** A key that is not part of the record. Records are closed; unknown keys are errors. */
  UNKNOWN_FIELD: 'UNKNOWN_FIELD',
  /** Exactly one of a mutually exclusive pair was required; zero or both were present. */
  EXCLUSIVE: 'EXCLUSIVE',
  /** Two fields disagree with each other (e.g. a duration on a repetition exercise). */
  MISMATCH: 'MISMATCH',
  /** A required ordering across values does not hold (e.g. scaling that gets easier as it hardens). */
  ORDERING: 'ORDERING',
  /** A reference names something that does not exist. */
  DANGLING_REFERENCE: 'DANGLING_REFERENCE',
  /** A ciphertext-bearing field is not in the sealed-value shape. */
  NOT_SEALED: 'NOT_SEALED',
  /** A ciphertext-bearing field is holding readable text. */
  PLAINTEXT_IN_SEALED_FIELD: 'PLAINTEXT_IN_SEALED_FIELD',
  /**
   * A field the app is not allowed to collect at all — client email, phone, address,
   * date of birth, photo. Data that is never collected cannot leak; this code exists so
   * that attempting to collect it fails loudly rather than being absorbed as a typo.
   */
  MINIMISATION: 'MINIMISATION',
  /**
   * A load / weight / resistance field on a LIBRARY record. Training load is the coach's
   * per-client judgement, captured in session as an observation, and is never a value the
   * shipped library or the app suggests.
   */
  FORBIDDEN_LOAD: 'FORBIDDEN_LOAD',
  /**
   * A synchronisation, history or secrecy field (record identity, revision, device tag,
   * tombstone, timestamps, encryption markers) found inside a CONTENT record. Those belong
   * to the envelope and must not leak back into content.
   */
  ENVELOPE_LEAK: 'ENVELOPE_LEAK',
});

/**
 * Collects issues while walking a record.
 *
 * `at()` returns a child scoped to a sub-path that shares the same underlying array, so a
 * nested validator never has to know how deep it is.
 */
export class Collector {
  /** @param {string} [root] @param {Issue[]} [sink] */
  constructor(root = '', sink = []) {
    /** @type {string} */
    this.root = root;
    /** @type {Issue[]} */
    this.issues = sink;
  }

  /**
   * @param {string} path Relative path; empty string means "this node".
   * @param {string} code One of {@link CODES}.
   * @param {string} message
   * @returns {this}
   */
  add(path, code, message) {
    this.issues.push({ path: joinPath(this.root, path), code, message });
    return this;
  }

  /**
   * A child collector scoped under `path`, sharing this collector's issue array.
   * @param {string} path
   * @returns {Collector}
   */
  at(path) {
    return new Collector(joinPath(this.root, path), this.issues);
  }

  /** @returns {ValidationResult} */
  result() {
    return { ok: this.issues.length === 0, issues: this.issues };
  }
}

/**
 * Join a parent path with a child segment. Array indices arrive already bracketed
 * (`entries[0]`) and are appended without a dot.
 * @param {string} parent
 * @param {string} child
 * @returns {string}
 */
export function joinPath(parent, child) {
  if (!child) return parent;
  if (!parent) return child;
  if (child.startsWith('[')) return `${parent}${child}`;
  return `${parent}.${child}`;
}

/**
 * A passing result. Cheap helper so callers never build the object by hand.
 * @returns {ValidationResult}
 */
export function pass() {
  return { ok: true, issues: [] };
}

/**
 * Merge several results into one.
 * @param {...ValidationResult} results
 * @returns {ValidationResult}
 */
export function mergeResults(...results) {
  const issues = results.flatMap((r) => r.issues);
  return { ok: issues.length === 0, issues };
}

/**
 * Every issue carrying a given code. Convenience for tests and for a screen that wants to
 * show, say, only the minimisation refusals.
 * @param {ValidationResult} result
 * @param {string} code
 * @returns {Issue[]}
 */
export function issuesWithCode(result, code) {
  return result.issues.filter((i) => i.code === code);
}

/**
 * True when the result carries at least one issue with this code.
 * @param {ValidationResult} result
 * @param {string} code
 * @returns {boolean}
 */
export function hasCode(result, code) {
  return result.issues.some((i) => i.code === code);
}

/**
 * A one-line-per-issue rendering, for a test failure message or a log line.
 * Never shown to the coach as-is; the screen renders `message` on the field itself.
 * @param {ValidationResult} result
 * @returns {string}
 */
export function formatIssues(result) {
  if (result.ok) return 'ok';
  return result.issues.map((i) => `${i.path || '<record>'}: [${i.code}] ${i.message}`).join('\n');
}
