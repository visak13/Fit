/**
 * THE DURABILITY CHOKEPOINT.
 *
 * The governing standard for this application is that the coach's livelihood depends on the data,
 * and therefore: **every write lands durably before any interface acknowledgement.** This file is
 * where that stops being a convention and becomes a structure.
 *
 * ## The gap this closes
 *
 * The local database signals a write TWICE, and the two are far apart in meaning:
 *
 *  1. the individual request succeeds — the value is in the transaction, and nothing is on disk;
 *  2. the transaction completes — the write has genuinely committed.
 *
 * Between the two, the transaction can still abort, and everything in it vanishes. A store that
 * resolves its save on (1) will tell the coach his session is saved and then lose it, and it will
 * do so under test as happily as in production, because the test observed (1) too.
 *
 * So: {@link runWrite} is the ONLY function in this package that opens a read-write transaction,
 * and it resolves on (2) and nothing else. Its callback may read and write inside the transaction
 * and may return a value, but that value is withheld until the commit lands. There is no exported
 * seam by which a caller obtains a writable transaction, and therefore no path by which a caller
 * can be told a thing is saved when it is not.
 *
 * That claim is asserted by a test in two ways: by ordering — the request callback provably fires
 * before the completion callback, and the promise resolves after the completion callback — and by
 * intent, in that no other module in this package names the read-write mode at all.
 *
 * ## Failure is loud
 *
 * An aborted or failed transaction throws {@link StoreWriteError}. It is never a returned status
 * and never a resolved promise with a flag, because the one outcome this layer exists to prevent
 * is a caller carrying on as though the write had landed.
 *
 * ## Reads never load a whole store
 *
 * Volumes are unknown and cannot be clarified. Every read here is either a single keyed lookup or
 * a **bounded page over an index**, and {@link Scope.page} is the shape all of them take. There is
 * deliberately no "get everything and filter" helper for a caller to reach for.
 */

import { StoreWriteError } from './errors.js';
import { atOrBeforeResume, narrowRange } from './keys.js';
import { applySchema, ALL_STORES, DB_NAME, DB_VERSION } from './schema.js';

/**
 * @typedef {Object} DbHandle
 * @property {IDBDatabase} db
 * @property {import('./platform.js').Platform} platform
 * @property {string} name
 * @property {number} version
 * @property {{transactions: number, rowsRead: number, writes: number}} stats
 * @property {boolean} closed
 * @property {() => void} close
 */

/**
 * Open the database, creating or upgrading it to the current schema.
 *
 * @param {import('./platform.js').Platform} platform
 * @param {{name?: string, version?: number}} [options]
 * @returns {Promise<DbHandle>}
 */
export function openDatabase(platform, { name = DB_NAME, version = DB_VERSION } = {}) {
  return new Promise((resolve, reject) => {
    const request = platform.indexedDB.open(name, version);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = /** @type {IDBTransaction} */ (request.transaction);
      applySchema(db, tx, event.oldVersion || 0);
    };

    // Another context is holding the database open at an older version. Say which situation this
    // is, because "the app will not open" with no explanation is the worst version of it.
    request.onblocked = () => reject(new StoreWriteError(
      'Another window has this app open and is stopping the database from upgrading. '
      + 'Close the other window, then reload this one.',
      { name, version },
    ));

    request.onerror = () => reject(new StoreWriteError(
      `The local database could not be opened: ${describeError(request.error)}. Nothing has been saved.`,
      { name, version },
    ));

    request.onsuccess = () => {
      const db = request.result;
      const handle = {
        db,
        platform,
        name,
        version,
        stats: { transactions: 0, rowsRead: 0, writes: 0 },
        closed: false,
        close() {
          if (handle.closed) return;
          handle.closed = true;
          db.close();
        },
      };

      // A version change raised by another context closes this connection out from under us.
      // Mark the handle closed so the next call fails with a sentence rather than a platform error.
      if (typeof db.addEventListener === 'function') {
        db.addEventListener('versionchange', () => handle.close());
      }

      resolve(handle);
    };
  });
}

/**
 * Run a READ-ONLY unit of work.
 *
 * @template T
 * @param {DbHandle} handle
 * @param {string|string[]} storeNames
 * @param {(scope: Scope) => Promise<T>|T} fn
 * @returns {Promise<T>}
 */
export async function read(handle, storeNames, fn) {
  const names = assertStores(handle, storeNames);
  const tx = handle.db.transaction(names, 'readonly');
  const settled = watchTransaction(tx, names, 'readonly');
  handle.stats.transactions += 1;
  const value = await fn(makeScope(handle, tx));
  await settled;
  return value;
}

/**
 * Run a unit of work that WRITES, and resolve only once it has genuinely committed.
 *
 * This is the only function in the package that opens a writable transaction. See the file header
 * for why that matters; the short version is that a save must not be able to resolve early, and
 * the way to guarantee it is to leave no other door.
 *
 * @template T
 * @param {DbHandle} handle
 * @param {string|string[]} storeNames
 * @param {(scope: Scope) => Promise<T>|T} fn Reads and writes inside the transaction. Its return
 *   value is held back until the commit lands.
 * @returns {Promise<T>} The callback's value, delivered only after the transaction completed.
 * @throws {StoreWriteError} if the transaction aborted or failed — the data is NOT saved.
 */
export async function runWrite(handle, storeNames, fn) {
  const names = assertStores(handle, storeNames);
  const tx = beginWritable(handle, names);
  // Attached BEFORE the first await, so no completion event can be missed.
  const committed = watchTransaction(tx, names, 'readwrite');
  handle.stats.transactions += 1;

  let value;
  try {
    value = await fn(makeScope(handle, tx));
  } catch (error) {
    try { tx.abort(); } catch { /* already finished; the rejection below carries the reason */ }
    await committed.catch(() => {});
    throw error;
  }

  // ─── THE ACKNOWLEDGEMENT GATE ───────────────────────────────────────────────────────────────
  // Nothing above this line may be reported to a caller. `value` is already computed and is
  // deliberately withheld: until this resolves, the write does not exist.
  await committed;

  return value;
}

/**
 * Open the writable transaction. The one place in this package that names the read-write mode.
 *
 * Strict durability is requested where the platform supports it — it is the difference between the
 * platform's default "committed, eventually" and "committed, now", and this application is the
 * case the option exists for. An implementation that does not know the option ignores it, so no
 * feature test is needed beyond the platform flag.
 *
 * @param {DbHandle} handle
 * @param {string[]} names
 * @returns {IDBTransaction}
 */
function beginWritable(handle, names) {
  const mode = 'readwrite';
  if (handle.platform.supportsStrictDurability) {
    try {
      return handle.db.transaction(names, mode, { durability: 'strict' });
    } catch { /* older implementation: fall through to the two-argument form */ }
  }
  return handle.db.transaction(names, mode);
}

/**
 * A promise that resolves when the transaction COMPLETES and rejects when it aborts or errors.
 *
 * @param {IDBTransaction} tx
 * @param {string[]} names
 * @param {string} mode
 * @returns {Promise<void>}
 */
function watchTransaction(tx, names, mode) {
  return new Promise((resolve, reject) => {
    let lastError = null;
    tx.oncomplete = () => resolve();
    tx.onerror = () => { lastError = tx.error; };
    tx.onabort = () => reject(new StoreWriteError(
      mode === 'readwrite'
        ? `The save did not complete and nothing was written: ${describeError(lastError || tx.error)}`
        : `A read was interrupted: ${describeError(lastError || tx.error)}`,
      { stores: names, mode },
    ));
  });
}

/**
 * @param {DbHandle} handle
 * @param {string|string[]} storeNames
 * @returns {string[]}
 */
function assertStores(handle, storeNames) {
  if (handle.closed) {
    throw new StoreWriteError('The local database connection is closed. Nothing has been read or written.');
  }
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  for (const name of names) {
    if (!ALL_STORES.includes(name)) throw new Error(`Unknown object store "${name}".`);
  }
  return names;
}

/** @param {unknown} error @returns {string} */
function describeError(error) {
  if (!error) return 'no reason was given';
  const e = /** @type {any} */ (error);
  return `${e.name || 'Error'}: ${e.message || String(error)}`;
}

/**
 * Turn one database request into a promise.
 *
 * Resolves on the request's own success, which is emphatically NOT durability — this is used for
 * reads, and for the internal reads a write performs before deciding what to store. The commit
 * gate is in {@link runWrite}.
 *
 * @template T
 * @param {IDBRequest<T>} request
 * @returns {Promise<T>}
 */
export function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new StoreWriteError(
      `The database refused an operation: ${describeError(request.error)}`,
    ));
  });
}

/**
 * @typedef {Object} PageOptions
 * @property {string} store
 * @property {string} [index]      Index name; omitted means the primary key.
 * @property {IDBKeyRange|null} [range]
 * @property {'next'|'prev'} [direction]
 * @property {number} [limit]
 * @property {string|null} [after] An opaque cursor from a previous page.
 * @property {(value: any) => boolean} [where] Applied DURING the walk, never to a loaded array.
 */

/**
 * @typedef {Object} Page
 * @property {any[]} items
 * @property {string|null} cursor Opaque; pass back as `after` for the next page.
 * @property {boolean} done True only when the range is definitively exhausted.
 */

/**
 * The operations available inside a transaction.
 *
 * Callers get this rather than the raw transaction, so the vocabulary stays small and every read
 * is either keyed or paged.
 *
 * @typedef {ReturnType<typeof makeScope>} Scope
 */

/**
 * @param {DbHandle} handle
 * @param {IDBTransaction} tx
 */
function makeScope(handle, tx) {
  const { IDBKeyRange: KeyRange } = handle.platform;
  const count = (n = 1) => { handle.stats.rowsRead += n; };

  const source = (storeName, indexName) => {
    const store = tx.objectStore(storeName);
    return indexName ? store.index(indexName) : store;
  };

  const scope = {
    /** The key-range constructor, so callers do not reach for a global. */
    KeyRange,

    /** @param {string} storeName @param {any} key */
    async get(storeName, key) {
      const value = await requestAsPromise(tx.objectStore(storeName).get(key));
      if (value !== undefined) count();
      return value;
    },

    /** @param {string} storeName @param {string} indexName @param {any} key */
    async getByIndex(storeName, indexName, key) {
      const value = await requestAsPromise(source(storeName, indexName).get(key));
      if (value !== undefined) count();
      return value;
    },

    /** @param {string} storeName @param {any} value */
    async put(storeName, value) {
      handle.stats.writes += 1;
      return requestAsPromise(tx.objectStore(storeName).put(value));
    },

    /** @param {string} storeName @param {any} key */
    async delete(storeName, key) {
      handle.stats.writes += 1;
      return requestAsPromise(tx.objectStore(storeName).delete(key));
    },

    /** @param {string} storeName @param {IDBKeyRange|null} [range] */
    async count(storeName, range = null) {
      return requestAsPromise(tx.objectStore(storeName).count(range ?? undefined));
    },

    /** @param {string} storeName @param {string} indexName @param {IDBKeyRange|null} [range] */
    async countByIndex(storeName, indexName, range = null) {
      return requestAsPromise(source(storeName, indexName).count(range ?? undefined));
    },

    /**
     * Primary keys matching an index range.
     *
     * Bounded by the range, and keys only — used by the deletion sweep, where the rows are about
     * to be removed and their contents are of no interest.
     *
     * @param {string} storeName @param {string} indexName @param {IDBKeyRange|null} range
     */
    async keysByIndex(storeName, indexName, range) {
      const keys = await requestAsPromise(source(storeName, indexName).getAllKeys(range ?? undefined));
      count(keys.length);
      return keys;
    },

    /** @param {string} storeName @param {IDBKeyRange|null} range */
    async keysInRange(storeName, range) {
      const keys = await requestAsPromise(tx.objectStore(storeName).getAllKeys(range ?? undefined));
      count(keys.length);
      return keys;
    },

    /**
     * One bounded page, walked over an index in key order.
     * @param {PageOptions} options
     * @returns {Promise<Page>}
     */
    page(options) {
      return walk(handle, source(options.store, options.index), options, true);
    },

    /**
     * The first record in a range, in the given direction.
     *
     * This is how "the most recent session for a client" is answered: one step of a reverse cursor
     * over an index, not a sort of everything.
     *
     * @param {Omit<PageOptions, 'limit'|'after'>} options
     */
    async first(options) {
      const result = await walk(handle, source(options.store, options.index), { ...options, limit: 1 }, true);
      return result.items[0];
    },
  };

  return scope;
}

/**
 * Walk a cursor, collecting at most `limit` records.
 *
 * Written as one imperative handler rather than an awaited loop on purpose. Awaiting between
 * cursor steps hands control back to the event loop, and a transaction with no pending request
 * commits — so an `await` in the middle of an iteration is how a walk silently truncates. Every
 * step here is issued from inside the previous step's callback, which keeps the transaction alive
 * for exactly as long as the walk.
 *
 * @param {DbHandle} handle
 * @param {IDBObjectStore|IDBIndex} src
 * @param {PageOptions} options
 * @param {boolean} values
 * @returns {Promise<Page>}
 */
function walk(handle, src, options, values) {
  const { range = null, direction = 'next', limit = 50, after = null, where } = options;
  const resume = after ? decodeCursor(after) : null;
  const KeyRange = handle.platform.IDBKeyRange;
  const effective = resume ? narrowRange(KeyRange, range, resume.key, direction) : range;

  if (effective === 'EMPTY') {
    return Promise.resolve({ items: [], cursor: after, done: true });
  }

  return new Promise((resolve, reject) => {
    const request = values
      ? src.openCursor(effective ?? undefined, direction)
      : src.openKeyCursor(effective ?? undefined, direction);

    /** @type {any[]} */
    const items = [];
    let past = !resume;
    let last = null;

    request.onerror = () => reject(new StoreWriteError(
      `The database refused a paged read: ${describeError(request.error)}`,
    ));

    request.onsuccess = () => {
      const cursor = request.result;

      if (!cursor) {
        resolve({ items, cursor: items.length ? encodeCursor(last) : after, done: true });
        return;
      }

      // Step over the records already delivered by the previous page. Bounded by how many records
      // share the resume key, which is one for every timestamped index in this schema.
      if (!past) {
        if (atOrBeforeResume(cursor, resume, direction)) {
          cursor.continue();
          return;
        }
        past = true;
      }

      last = { key: cursor.key, primaryKey: cursor.primaryKey };
      const value = values ? cursor.value : cursor.primaryKey;
      handle.stats.rowsRead += 1;

      if (!where || where(value)) items.push(value);

      if (items.length >= limit) {
        resolve({ items, cursor: encodeCursor(last), done: false });
        return;
      }
      cursor.continue();
    };
  });
}

/**
 * @param {{key: any, primaryKey: any}} position
 * @returns {string}
 */
export function encodeCursor(position) {
  return JSON.stringify([position.key, position.primaryKey]);
}

/**
 * @param {string} token
 * @returns {{key: any, primaryKey: any}}
 */
export function decodeCursor(token) {
  const [key, primaryKey] = JSON.parse(token);
  return { key, primaryKey };
}

export { DB_NAME, DB_VERSION };
