/**
 * Primitive field checks shared by every entity validator.
 *
 * Each `check*` function appends any problem to the supplied {@link Collector} and returns a
 * boolean saying whether the value is usable. Returning the boolean lets a caller skip a
 * dependent check rather than pile a second, confusing issue on top of the first:
 *
 *   if (checkInteger(c, 'sets', v.sets, { required: true, min: 1, max: 10 })) { ... }
 *
 * Nothing here throws, and nothing here mutates the record being checked.
 */

import { CODES } from './issues.js';

/**
 * A CONTENT KEY, as defined by the seed content contract §3: lowercase letters, digits and
 * single hyphens, 3 to 60 characters, human-meaningful, stable forever.
 *
 * Read the name literally. This is the handle one piece of content uses to point at another
 * — a routine entry naming the exercise it wants. It is NOT the identity the local store
 * files a record under; that is `record_id` on the envelope, and the two live side by side.
 */
export const CONTENT_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Minimum / maximum length of a content key. */
export const CONTENT_KEY_MIN = 3;
export const CONTENT_KEY_MAX = 60;

/**
 * A UUID, as produced by `crypto.randomUUID()`. This is what a `record_id` looks like.
 * Accepts any RFC 4122 version so a record created by an older installation still validates.
 */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * A timestamp in the ONE canonical form this app writes: ISO 8601, UTC, milliseconds, `Z`.
 * Exactly what `new Date(...).toISOString()` produces.
 *
 * The format is pinned rather than merely parsed because timestamps are compared across two
 * devices. A canonical form means a string comparison and a chronological comparison agree,
 * so nothing has to parse a date to order two revisions of the same record.
 */
export const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** A calendar date with no time component: `YYYY-MM-DD`. */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A wall-clock time of day, 24-hour: `HH:MM`. Used by the diet week chart. */
export const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** True for a plain object — not null, not an array, not a Date. */
export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

/** True when the value is absent for validation purposes. */
export function isAbsent(value) {
  return value === undefined || value === null;
}

/**
 * @param {import('./issues.js').Collector} c
 * @param {string} path
 * @param {unknown} value
 * @param {{required?: boolean}} [opts]
 * @returns {boolean} true when the value is present and may be checked further
 */
export function requirePresent(c, path, value, opts = {}) {
  if (isAbsent(value)) {
    if (opts.required) c.add(path, CODES.REQUIRED, 'This field is required.');
    return false;
  }
  return true;
}

/**
 * @param {import('./issues.js').Collector} c
 * @param {string} path
 * @param {unknown} value
 * @param {{required?: boolean, min?: number, max?: number, pattern?: RegExp, patternHint?: string, allowEmpty?: boolean}} [opts]
 * @returns {boolean}
 */
export function checkString(c, path, value, opts = {}) {
  if (!requirePresent(c, path, value, opts)) return false;
  if (typeof value !== 'string') {
    c.add(path, CODES.TYPE, 'Expected text.');
    return false;
  }
  if (!opts.allowEmpty && opts.required && value.trim() === '') {
    c.add(path, CODES.REQUIRED, 'This field must not be blank.');
    return false;
  }
  let good = true;
  if (opts.min !== undefined && value.length < opts.min) {
    c.add(path, CODES.LENGTH, `Must be at least ${opts.min} characters.`);
    good = false;
  }
  if (opts.max !== undefined && value.length > opts.max) {
    c.add(path, CODES.LENGTH, `Must be at most ${opts.max} characters.`);
    good = false;
  }
  if (opts.pattern && !opts.pattern.test(value)) {
    c.add(path, CODES.FORMAT, opts.patternHint || 'Wrong format.');
    good = false;
  }
  return good;
}

/**
 * @param {import('./issues.js').Collector} c
 * @param {string} path
 * @param {unknown} value
 * @param {{required?: boolean, min?: number, max?: number}} [opts]
 * @returns {boolean}
 */
export function checkInteger(c, path, value, opts = {}) {
  if (!requirePresent(c, path, value, opts)) return false;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    c.add(path, CODES.TYPE, 'Expected a whole number.');
    return false;
  }
  let good = true;
  if (opts.min !== undefined && value < opts.min) {
    c.add(path, CODES.RANGE, `Must be at least ${opts.min}.`);
    good = false;
  }
  if (opts.max !== undefined && value > opts.max) {
    c.add(path, CODES.RANGE, `Must be at most ${opts.max}.`);
    good = false;
  }
  return good;
}

/**
 * @param {import('./issues.js').Collector} c
 * @param {string} path
 * @param {unknown} value
 * @param {{required?: boolean, min?: number, max?: number}} [opts]
 * @returns {boolean}
 */
export function checkNumber(c, path, value, opts = {}) {
  if (!requirePresent(c, path, value, opts)) return false;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    c.add(path, CODES.TYPE, 'Expected a number.');
    return false;
  }
  let good = true;
  if (opts.min !== undefined && value < opts.min) {
    c.add(path, CODES.RANGE, `Must be at least ${opts.min}.`);
    good = false;
  }
  if (opts.max !== undefined && value > opts.max) {
    c.add(path, CODES.RANGE, `Must be at most ${opts.max}.`);
    good = false;
  }
  return good;
}

/**
 * @param {import('./issues.js').Collector} c
 * @param {string} path
 * @param {unknown} value
 * @param {{required?: boolean}} [opts]
 * @returns {boolean}
 */
export function checkBoolean(c, path, value, opts = {}) {
  if (!requirePresent(c, path, value, opts)) return false;
  if (typeof value !== 'boolean') {
    c.add(path, CODES.TYPE, 'Expected true or false.');
    return false;
  }
  return true;
}

/**
 * @param {import('./issues.js').Collector} c
 * @param {string} path
 * @param {unknown} value
 * @param {readonly string[]} allowed
 * @param {{required?: boolean}} [opts]
 * @returns {boolean}
 */
export function checkEnum(c, path, value, allowed, opts = {}) {
  if (!requirePresent(c, path, value, opts)) return false;
  if (typeof value !== 'string') {
    c.add(path, CODES.TYPE, 'Expected text.');
    return false;
  }
  if (!allowed.includes(value)) {
    c.add(path, CODES.ENUM, `Must be one of: ${allowed.join(', ')}.`);
    return false;
  }
  return true;
}

/**
 * A content key as defined by the seed contract §3.
 * @param {import('./issues.js').Collector} c
 * @param {string} path
 * @param {unknown} value
 * @param {{required?: boolean}} [opts]
 * @returns {boolean}
 */
export function checkContentKey(c, path, value, opts = {}) {
  return checkString(c, path, value, {
    ...opts,
    min: CONTENT_KEY_MIN,
    max: CONTENT_KEY_MAX,
    pattern: CONTENT_KEY_PATTERN,
    patternHint: 'Must be lowercase letters, digits and single hyphens, for example barbell-bent-over-row.',
  });
}

/**
 * A record identity — the envelope's stable handle, distinct from any content key.
 * @param {import('./issues.js').Collector} c
 * @param {string} path
 * @param {unknown} value
 * @param {{required?: boolean}} [opts]
 * @returns {boolean}
 */
export function checkRecordId(c, path, value, opts = {}) {
  return checkString(c, path, value, {
    ...opts,
    pattern: UUID_PATTERN,
    patternHint: 'Must be a record identity (a UUID), not a content key.',
  });
}

/**
 * @param {import('./issues.js').Collector} c
 * @param {string} path
 * @param {unknown} value
 * @param {{required?: boolean}} [opts]
 * @returns {boolean}
 */
export function checkTimestamp(c, path, value, opts = {}) {
  if (!checkString(c, path, value, {
    ...opts,
    pattern: TIMESTAMP_PATTERN,
    patternHint: 'Must be a UTC timestamp with milliseconds, for example 2026-07-25T09:30:00.000Z.',
  })) return false;
  if (Number.isNaN(Date.parse(/** @type {string} */(value)))) {
    c.add(path, CODES.FORMAT, 'Not a real date and time.');
    return false;
  }
  return true;
}

/**
 * @param {import('./issues.js').Collector} c
 * @param {string} path
 * @param {unknown} value
 * @param {{required?: boolean}} [opts]
 * @returns {boolean}
 */
export function checkDate(c, path, value, opts = {}) {
  return checkString(c, path, value, {
    ...opts,
    pattern: DATE_PATTERN,
    patternHint: 'Must be a calendar date, for example 2026-07-25.',
  });
}

/**
 * A list of strings, with optional uniqueness, size bounds and an allowed vocabulary.
 * @param {import('./issues.js').Collector} c
 * @param {string} path
 * @param {unknown} value
 * @param {{required?: boolean, min?: number, max?: number, unique?: boolean, allowed?: readonly string[], each?: (col: import('./issues.js').Collector, p: string, v: unknown) => boolean}} [opts]
 * @returns {boolean}
 */
export function checkStringArray(c, path, value, opts = {}) {
  if (!requirePresent(c, path, value, opts)) return false;
  if (!Array.isArray(value)) {
    c.add(path, CODES.TYPE, 'Expected a list.');
    return false;
  }
  let good = true;
  if (opts.min !== undefined && value.length < opts.min) {
    c.add(path, CODES.LENGTH, `Must hold at least ${opts.min} item${opts.min === 1 ? '' : 's'}.`);
    good = false;
  }
  if (opts.max !== undefined && value.length > opts.max) {
    c.add(path, CODES.LENGTH, `Must hold at most ${opts.max} items.`);
    good = false;
  }
  value.forEach((item, i) => {
    const p = `${path}[${i}]`;
    if (opts.each) {
      if (!opts.each(c, p, item)) good = false;
      return;
    }
    if (typeof item !== 'string') {
      c.add(p, CODES.TYPE, 'Expected text.');
      good = false;
      return;
    }
    if (opts.allowed && !opts.allowed.includes(item)) {
      c.add(p, CODES.ENUM, `Must be one of: ${opts.allowed.join(', ')}.`);
      good = false;
    }
  });
  if (opts.unique !== false) {
    const seen = new Set();
    value.forEach((item, i) => {
      if (typeof item !== 'string') return;
      if (seen.has(item)) {
        c.add(`${path}[${i}]`, CODES.DUPLICATE, `Repeated entry: ${item}.`);
        good = false;
      }
      seen.add(item);
    });
  }
  return good;
}

/**
 * Reject keys the record does not declare.
 *
 * Records are CLOSED. An unknown key is an error rather than something to ignore, because a
 * typo in a field name would otherwise become a silently dropped value — the same reasoning
 * that puts `additionalProperties: false` on every seed schema.
 *
 * `classify` lets a caller upgrade a particular unknown key to a more specific refusal
 * (minimisation, a forbidden load field, an envelope concern leaking into content) so those
 * read as the decisions they are rather than as typos.
 *
 * @param {import('./issues.js').Collector} c
 * @param {Record<string, unknown>} value
 * @param {readonly string[]} allowed
 * @param {(key: string) => {code: string, message: string}|null} [classify]
 * @returns {boolean}
 */
export function checkNoUnknownKeys(c, value, allowed, classify) {
  let good = true;
  for (const key of Object.keys(value)) {
    if (allowed.includes(key)) continue;
    good = false;
    const special = classify ? classify(key) : null;
    if (special) c.add(key, special.code, special.message);
    else c.add(key, CODES.UNKNOWN_FIELD, `Unknown field. Allowed fields are: ${allowed.join(', ')}.`);
  }
  return good;
}

/**
 * Gate a record before its fields are walked: it must be a plain object.
 * @param {import('./issues.js').Collector} c
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function checkIsRecord(c, value) {
  if (!isPlainObject(value)) {
    c.add('', CODES.TYPE, 'Expected a record object.');
    return false;
  }
  return true;
}

/**
 * Assert `later` is at or after `earlier`, when both are present and well-formed.
 * @param {import('./issues.js').Collector} c
 * @param {string} path Path of the later field, which is where the issue is reported.
 * @param {unknown} earlier
 * @param {unknown} later
 * @param {string} message
 * @returns {boolean}
 */
export function checkChronological(c, path, earlier, later, message) {
  if (typeof earlier !== 'string' || typeof later !== 'string') return true;
  const a = Date.parse(earlier);
  const b = Date.parse(later);
  if (Number.isNaN(a) || Number.isNaN(b)) return true;
  if (b < a) {
    c.add(path, CODES.ORDERING, message);
    return false;
  }
  return true;
}
