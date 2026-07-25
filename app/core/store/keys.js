/**
 * KEY ARITHMETIC — the platform's own key rules, written down once.
 *
 * The local database has a defined key type order and a defined comparison algorithm, and both
 * the paged reads in `db.js` and the in-memory double in `testing/` need them. They live here
 * rather than in either, for a specific reason: if the double carried its own idea of key order,
 * a test would be checking the double's arithmetic against itself. Sharing one implementation
 * means the ordering the tests observe is the ordering the store code reasons about, and any
 * disagreement with a real browser is a single bug in a single place.
 *
 * Only the key shapes this schema actually uses are supported — numbers, strings, dates and
 * arrays of those. Binary keys are refused loudly rather than mis-ordered quietly, because a
 * silently wrong key order is a corrupt index.
 */

/** The platform's key type order: number, then date, then string, then array. */
const TYPE_ORDER = { number: 0, date: 1, string: 2, array: 3 };

/**
 * @param {unknown} key
 * @returns {'number'|'date'|'string'|'array'|null} null when the value cannot be a key.
 */
export function keyType(key) {
  if (typeof key === 'number') return Number.isNaN(key) ? null : 'number';
  if (key instanceof Date) return Number.isNaN(key.getTime()) ? null : 'date';
  if (typeof key === 'string') return 'string';
  if (Array.isArray(key)) return 'array';
  return null;
}

/**
 * True when the value is usable as a key.
 *
 * This is why no boolean appears in any index in `schema.js`: **a boolean is not a valid key**, so
 * an index on a boolean field silently contains no entries at all, and a query against it returns
 * nothing while looking perfectly reasonable. That is the trap behind listing clients by `active`,
 * and the schema avoids it by indexing the name and applying the active filter during the walk.
 *
 * @param {unknown} key
 * @returns {boolean}
 */
export function isValidKey(key) {
  const type = keyType(key);
  if (type === null) return false;
  if (type === 'array') return /** @type {unknown[]} */ (key).every(isValidKey);
  return true;
}

/**
 * Compare two keys by the platform's rules.
 * @param {any} a @param {any} b
 * @returns {-1|0|1}
 */
export function compareKeys(a, b) {
  const ta = keyType(a);
  const tb = keyType(b);
  if (ta === null || tb === null) {
    throw new TypeError(`Not a valid database key: ${JSON.stringify(ta === null ? a : b)}`);
  }
  if (ta !== tb) return TYPE_ORDER[ta] < TYPE_ORDER[tb] ? -1 : 1;

  if (ta === 'array') {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i += 1) {
      const c = compareKeys(a[i], b[i]);
      if (c !== 0) return c;
    }
    if (a.length === b.length) return 0;
    return a.length < b.length ? -1 : 1;
  }

  const va = ta === 'date' ? a.getTime() : a;
  const vb = tb === 'date' ? b.getTime() : b;
  if (va === vb) return 0;
  return va < vb ? -1 : 1;
}

/** @param {any} a @param {any} b */
export function sameKey(a, b) {
  try { return compareKeys(a, b) === 0; } catch { return false; }
}

/**
 * Read a key out of a value by key path.
 *
 * Supports the dotted paths the schema uses (`content.client_id`) and arrays of them for compound
 * keys. Returns `undefined` when any component is missing — which is how an optional field keeps a
 * record out of an index rather than indexing it under a wrong key. A session with no
 * `started_at` is simply absent from the started-at index, and that is correct: it has not started.
 *
 * @param {any} value
 * @param {string|string[]} keyPath
 * @returns {any}
 */
export function extractKey(value, keyPath) {
  if (Array.isArray(keyPath)) {
    const parts = keyPath.map((path) => extractKey(value, path));
    return parts.some((p) => p === undefined) ? undefined : parts;
  }
  let current = value;
  for (const segment of keyPath.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = current[segment];
  }
  return current === null ? undefined : current;
}

/**
 * A key that sorts after every string, number and date.
 *
 * An empty array, because the platform's key type order puts arrays last — so `[clientId, []]` is
 * greater than `[clientId, <any timestamp>]` and is an exact upper bound for "every record whose
 * first key component is this client". A very high string would only be *nearly* right.
 */
export const AFTER_ALL_KEYS = Object.freeze([]);

/**
 * The range covering every record whose compound key starts with `prefix`.
 *
 * This is how a client's own rows are read without touching anybody else's: one contiguous range on
 * an index, walked a page at a time. It is the whole of the graceful-degradation requirement in one
 * function — the cost of a page is the size of the page, not the size of the roster.
 *
 * @param {typeof IDBKeyRange} KeyRange
 * @param {any[]} prefix
 * @returns {IDBKeyRange}
 */
export function prefixRange(KeyRange, prefix) {
  return KeyRange.bound(prefix, [...prefix, AFTER_ALL_KEYS], false, false);
}

/**
 * Narrow a range so a cursor resumes near where the last page stopped.
 *
 * Paging is expressed as a range plus a skip of at most the records sharing the resume key, rather
 * than as a cursor-positioning call, because the range-and-skip form uses only the two cursor
 * operations every implementation has. The skip is bounded by how many records share one index
 * key — one, for every timestamped index in this schema.
 *
 * Returns the string `'EMPTY'` when the resume point falls outside the original range, which means
 * the page is definitively past the end.
 *
 * @param {typeof IDBKeyRange} KeyRange
 * @param {IDBKeyRange|null} range
 * @param {any} key
 * @param {'next'|'prev'} direction
 * @returns {IDBKeyRange|null|'EMPTY'}
 */
export function narrowRange(KeyRange, range, key, direction) {
  const forward = direction !== 'prev';
  const lower = forward ? key : range?.lower;
  const upper = forward ? range?.upper : key;
  const lowerOpen = forward ? false : (range?.lowerOpen ?? false);
  const upperOpen = forward ? (range?.upperOpen ?? false) : false;

  try {
    if (lower === undefined && upper === undefined) return null;
    if (lower === undefined) return KeyRange.upperBound(upper, upperOpen);
    if (upper === undefined) return KeyRange.lowerBound(lower, lowerOpen);
    if (compareKeys(lower, upper) > 0) return 'EMPTY';
    return KeyRange.bound(lower, upper, lowerOpen, upperOpen);
  } catch {
    return 'EMPTY';
  }
}

/**
 * True when a cursor sits at or before the position a previous page stopped at, and should
 * therefore be stepped over.
 *
 * @param {{key: any, primaryKey: any}} at
 * @param {{key: any, primaryKey: any}} resume
 * @param {'next'|'prev'} direction
 */
export function atOrBeforeResume(at, resume, direction) {
  const forward = direction !== 'prev';
  const c = compareKeys(at.key, resume.key);
  if (c !== 0) return forward ? c < 0 : c > 0;
  const p = compareKeys(at.primaryKey, resume.primaryKey);
  return forward ? p <= 0 : p >= 0;
}
