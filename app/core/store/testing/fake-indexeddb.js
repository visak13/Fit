/**
 * AN IN-MEMORY DOUBLE OF THE LOCAL DATABASE — faithful where faithfulness is the whole point.
 *
 * The test gate runs on the runtime's own test runner with nothing installed, and that runtime has
 * no local database. So the store is written against a port and this file supplies the other
 * implementation.
 *
 * ## The one rule this double is written to
 *
 * **A double kinder than reality makes the tests pass and moves the failure somewhere more
 * expensive.** Everything below that could be simplified in the store's favour deliberately is not:
 *
 *  1. **A request succeeds BEFORE the transaction completes, always.** These are two separate
 *     events here as they are in a browser, in that order, and the gap between them is real: a
 *     transaction can still abort after every one of its requests has succeeded. That gap is the
 *     exact hole through which a store tells a caller it saved something that is not committed, so
 *     collapsing the two would make the durability test prove nothing while looking green.
 *  2. **An abort undoes the writes.** The stores in scope are snapshotted when the transaction
 *     activates and restored if it aborts, so "the requests succeeded but the data is gone" is a
 *     state the tests can actually reach — `faults.failCommit` reaches it on demand.
 *  3. **Read-write transactions on the same database do not interleave.** Transactions run one at a
 *     time in the order they were created, which is what makes a lost update between two windows
 *     surface as a detected conflict rather than as luck. This is *stricter* than a browser, which
 *     lets read-only transactions overlap; stricter in this direction hides nothing, because the
 *     serialisation the store relies on is the read-write one the platform guarantees.
 *  4. **A boolean, and any missing key-path component, produces no index entry.** That is why no
 *     index in the schema is on a boolean: the query would return nothing, plausibly.
 *  5. **Key order is the platform's**, taken from `../keys.js` — the same module the store's paging
 *     uses, so the tests are not checking the double's arithmetic against itself.
 *
 * ## Where it knowingly differs, and why that is safe
 *
 *  - A cursor snapshots its matching records when it opens, where a browser's cursor is live. No
 *    code here mutates a store while walking it — the deletion sweep collects keys first for
 *    exactly this reason — and a snapshot cannot mask that mistake, it prevents observing it.
 *  - Storage quota is unlimited unless `faults` asks otherwise, so quota exhaustion is tested by
 *    injection rather than by filling memory.
 *  - It is not a general-purpose implementation and does not try to be: it supports the operations
 *    this store performs and refuses the rest loudly.
 */

import { compareKeys, extractKey, isValidKey, sameKey } from '../keys.js';
import { trackedTask } from './pending-work.js';

/**
 * Queue work on a fresh task, as the platform does between a request and its callback.
 *
 * The label is carried so that `settle()` giving up can say WHICH task never ran; see
 * `pending-work.js` for why a turn count would not be a diagnosis.
 *
 * @param {() => void} fn
 * @param {string} label
 */
const nextTask = (fn, label) => trackedTask(label, fn);

/** Errors carry the platform's own names, because the store's messages quote them. */
class FakeDOMException extends Error {
  /** @param {string} name @param {string} message */
  constructor(name, message) {
    super(message);
    this.name = name;
  }
}

/** A name list with the platform's `contains`. */
class NameList extends Array {
  /** @param {string} name */
  contains(name) { return this.includes(name); }
}

// ---------------------------------------------------------------------------------------------
// Key ranges
// ---------------------------------------------------------------------------------------------

/** The key-range constructor, exposing `lower`/`upper`/`lowerOpen`/`upperOpen` as the real one does. */
export class FakeKeyRange {
  /** @param {any} lower @param {any} upper @param {boolean} lowerOpen @param {boolean} upperOpen */
  constructor(lower, upper, lowerOpen, upperOpen) {
    this.lower = lower;
    this.upper = upper;
    this.lowerOpen = lowerOpen;
    this.upperOpen = upperOpen;
  }

  /** @param {any} value */
  static only(value) { return new FakeKeyRange(value, value, false, false); }

  /** @param {any} value @param {boolean} [open] */
  static lowerBound(value, open = false) { return new FakeKeyRange(value, undefined, open, false); }

  /** @param {any} value @param {boolean} [open] */
  static upperBound(value, open = false) { return new FakeKeyRange(undefined, value, false, open); }

  /** @param {any} lower @param {any} upper @param {boolean} [lowerOpen] @param {boolean} [upperOpen] */
  static bound(lower, upper, lowerOpen = false, upperOpen = false) {
    if (compareKeys(lower, upper) > 0) {
      throw new FakeDOMException('DataError', 'The lower key of a range is greater than its upper key.');
    }
    return new FakeKeyRange(lower, upper, lowerOpen, upperOpen);
  }

  /** @param {any} key */
  includes(key) {
    if (this.lower !== undefined) {
      const c = compareKeys(key, this.lower);
      if (c < 0 || (c === 0 && this.lowerOpen)) return false;
    }
    if (this.upper !== undefined) {
      const c = compareKeys(key, this.upper);
      if (c > 0 || (c === 0 && this.upperOpen)) return false;
    }
    return true;
  }
}

/** @param {any} query @param {any} key */
function matchesQuery(query, key) {
  if (query === undefined || query === null) return true;
  if (query instanceof FakeKeyRange) return query.includes(key);
  return sameKey(query, key);
}

// ---------------------------------------------------------------------------------------------
// The data
// ---------------------------------------------------------------------------------------------

/** One object store's contents, kept sorted by key. */
class StoreData {
  /** @param {string} name @param {string|string[]} keyPath */
  constructor(name, keyPath) {
    this.name = name;
    this.keyPath = keyPath;
    /** @type {{key: any, value: any}[]} */
    this.entries = [];
    /** @type {Map<string, {name: string, keyPath: string|string[], unique: boolean, multiEntry: boolean}>} */
    this.indexes = new Map();
  }

  /** @param {any} key @returns {number} index of the entry, or -(insertion point + 1) */
  locate(key) {
    let lo = 0;
    let hi = this.entries.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const c = compareKeys(this.entries[mid].key, key);
      if (c === 0) return mid;
      if (c < 0) lo = mid + 1; else hi = mid - 1;
    }
    return -(lo + 1);
  }

  /** @param {any} key */
  get(key) {
    const at = this.locate(key);
    // Cloned on the way out as well as in: a browser hands back a copy, so a caller that mutates
    // what it read has not quietly edited the database.
    return at >= 0 ? structuredClone(this.entries[at].value) : undefined;
  }

  /** @param {any} value */
  put(value) {
    const key = extractKey(value, this.keyPath);
    if (!isValidKey(key)) {
      throw new FakeDOMException('DataError',
        `The record has no valid key at "${this.keyPath}" for store "${this.name}".`);
    }
    for (const index of this.indexes.values()) {
      if (!index.unique) continue;
      const indexKey = extractKey(value, index.keyPath);
      if (indexKey === undefined || !isValidKey(indexKey)) continue;
      for (const entry of this.entries) {
        if (sameKey(entry.key, key)) continue;
        if (sameKey(extractKey(entry.value, index.keyPath), indexKey)) {
          throw new FakeDOMException('ConstraintError',
            `The unique index "${index.name}" already has an entry for ${JSON.stringify(indexKey)}.`);
        }
      }
    }
    const stored = { key, value: structuredClone(value) };
    const at = this.locate(key);
    if (at >= 0) this.entries[at] = stored;
    else this.entries.splice(-(at + 1), 0, stored);
    return key;
  }

  /** @param {any} key */
  remove(key) {
    const at = this.locate(key);
    if (at >= 0) this.entries.splice(at, 1);
  }

  /** @param {any} query */
  select(query) {
    return this.entries.filter((e) => matchesQuery(query, e.key));
  }

  /**
   * Index entries in index order, computed on demand.
   *
   * A record with no valid index key is absent, not indexed under a substitute — which is how an
   * optional field and a boolean both end up contributing nothing.
   *
   * @param {string} indexName
   * @returns {{key: any, primaryKey: any, value: any}[]}
   */
  indexEntries(indexName) {
    const index = this.indexes.get(indexName);
    if (!index) throw new FakeDOMException('NotFoundError', `No index "${indexName}" on "${this.name}".`);

    /** @type {{key: any, primaryKey: any, value: any}[]} */
    const out = [];
    for (const entry of this.entries) {
      const raw = extractKey(entry.value, index.keyPath);
      if (raw === undefined) continue;
      if (index.multiEntry && Array.isArray(raw)) {
        const seen = [];
        for (const member of raw) {
          if (!isValidKey(member)) continue;
          if (seen.some((s) => sameKey(s, member))) continue;
          seen.push(member);
          out.push({ key: member, primaryKey: entry.key, value: entry.value });
        }
        continue;
      }
      if (!isValidKey(raw)) continue;
      out.push({ key: raw, primaryKey: entry.key, value: entry.value });
    }
    out.sort((a, b) => compareKeys(a.key, b.key) || compareKeys(a.primaryKey, b.primaryKey));
    return out;
  }
}

// ---------------------------------------------------------------------------------------------
// Requests, cursors, transactions
// ---------------------------------------------------------------------------------------------

class FakeRequest {
  /** @param {FakeTransaction|null} tx */
  constructor(tx) {
    this.transaction = tx;
    this.result = undefined;
    this.error = null;
    this.onsuccess = null;
    this.onerror = null;
    /** @type {(() => any)|null} */
    this._op = null;
  }
}

class FakeCursor {
  /**
   * @param {FakeTransaction} tx
   * @param {FakeRequest} request
   * @param {{key: any, primaryKey: any, value: any}[]} entries
   * @param {boolean} withValues
   */
  constructor(tx, request, entries, withValues) {
    this._tx = tx;
    this._request = request;
    this._entries = entries;
    this._withValues = withValues;
    this._at = -1;
  }

  get key() { return this._entries[this._at]?.key; }

  get primaryKey() { return this._entries[this._at]?.primaryKey; }

  get value() {
    if (!this._withValues) return undefined;
    const v = this._entries[this._at]?.value;
    return v === undefined ? undefined : structuredClone(v);
  }

  /** Advance one place, or to the first record at or beyond `key`. @param {any} [key] */
  continue(key) {
    this._step((entries, from) => {
      if (key === undefined) return from;
      for (let i = from; i < entries.length; i += 1) {
        const c = compareKeys(entries[i].key, key);
        if (this._forward ? c >= 0 : c <= 0) return i;
      }
      return entries.length;
    });
  }

  /** @param {number} count */
  advance(count) {
    if (!Number.isInteger(count) || count < 1) {
      throw new FakeDOMException('TypeError', 'advance() takes a positive whole number.');
    }
    this._step((_, from) => from + count - 1);
  }

  /** @param {(entries: any[], from: number) => number} pick */
  _step(pick) {
    const from = this._at + 1;
    const target = pick(this._entries, from);
    this._tx._reissue(this._request, () => {
      this._at = target;
      return this._at < this._entries.length ? this : null;
    });
  }
}

class FakeTransaction {
  /**
   * @param {FakeDatabase} db
   * @param {string[]} storeNames
   * @param {'readonly'|'readwrite'|'versionchange'} mode
   * @param {{durability?: string}} [options]
   */
  constructor(db, storeNames, mode, options = {}) {
    this.db = db;
    this.mode = mode;
    this.objectStoreNames = new NameList(...storeNames);
    this.storeNames = storeNames;
    this.durability = options.durability || 'default';
    this.error = null;
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;

    this.state = 'queued';
    /** @type {FakeRequest[]} */
    this.pending = [];
    /** @type {Map<string, {key: any, value: any}[]>|null} */
    this._snapshot = null;
    this._commitScheduled = false;
  }

  /** @param {string} name */
  objectStore(name) {
    if (this.state === 'finished') {
      throw new FakeDOMException('InvalidStateError', 'The transaction has already finished.');
    }
    if (this.mode !== 'versionchange' && !this.storeNames.includes(name)) {
      throw new FakeDOMException('NotFoundError', `"${name}" is not in this transaction's scope.`);
    }
    const data = this.db._entry.stores.get(name);
    if (!data) throw new FakeDOMException('NotFoundError', `No object store "${name}".`);
    return new FakeObjectStore(this, data);
  }

  abort() { this._finish('abort', new FakeDOMException('AbortError', 'The transaction was aborted.')); }

  commit() { this._commit(); }

  // --- internals -----------------------------------------------------------------------------

  _activate() {
    this.state = 'active';
    if (this.mode !== 'readonly') {
      this._snapshot = new Map();
      const names = this.mode === 'versionchange'
        ? Array.from(this.db._entry.stores.keys())
        : this.storeNames;
      for (const name of names) {
        const data = this.db._entry.stores.get(name);
        if (data) this._snapshot.set(name, data.entries.slice());
      }
    }
    for (const request of this.pending.slice()) this._schedule(request);
    this._scheduleCommit();
  }

  /** @param {() => any} op @returns {FakeRequest} */
  _enqueue(op) {
    if (this.state === 'finished') {
      throw new FakeDOMException('TransactionInactiveError', 'The transaction has already finished.');
    }
    const request = new FakeRequest(this);
    request._op = op;
    this.pending.push(request);
    if (this.state === 'active') this._schedule(request);
    return request;
  }

  /** Re-run an existing request, which is how a cursor step works. @param {FakeRequest} request @param {() => any} op */
  _reissue(request, op) {
    if (this.state === 'finished') {
      throw new FakeDOMException('TransactionInactiveError', 'The transaction has already finished.');
    }
    request._op = op;
    this.pending.push(request);
    if (this.state === 'active') this._schedule(request);
  }

  /**
   * Run a request's work, then deliver its callback.
   *
   * Dispatched as a microtask rather than a fresh task. The ordering property that matters —
   * a request's success callback runs BEFORE the transaction's completion callback — is preserved
   * because the commit check is a fresh task and microtasks always drain first. Using a microtask
   * here keeps a test suite that performs thousands of operations to a sensible runtime; using a
   * fresh task for the commit is what keeps the double honest about when a transaction ends.
   *
   * @param {FakeRequest} request
   */
  _schedule(request) {
    queueMicrotask(() => {
      if (this.state !== 'active') return;
      if (!this.pending.includes(request)) return;
      let result;
      try {
        result = request._op();
      } catch (error) {
        this._settle(request, null, /** @type {Error} */ (error));
        return;
      }
      this._settle(request, result, null);
    });
  }

  /** @param {FakeRequest} request @param {any} result @param {Error|null} error */
  _settle(request, result, error) {
    const at = this.pending.indexOf(request);
    if (at >= 0) this.pending.splice(at, 1);

    if (error) {
      request.error = error;
      this.error = error;
      this.db._factory._record('request:error', { store: this.storeNames.join(','), error: error.name });
      let prevented = false;
      if (request.onerror) request.onerror({ target: request, preventDefault() { prevented = true; } });
      // An unhandled request error aborts the transaction, exactly as the platform does.
      if (!prevented) { this._finish('abort', error); return; }
    } else {
      request.result = result;
      // (1) of the file header: the request succeeds HERE, and the commit has not happened yet.
      this.db._factory._record('request:success', { stores: this.storeNames.join(',') });
      if (request.onsuccess) request.onsuccess({ target: request });
    }
    this._scheduleCommit();
  }

  /**
   * Commit once the work has drained.
   *
   * Scheduled on a fresh task, not a microtask, so that a request issued from inside the previous
   * request's callback — which is how every awaited request and every cursor step behaves — keeps
   * the transaction alive. Work that hands control back to the event loop between requests does
   * NOT, and a browser behaves the same way.
   */
  _scheduleCommit() {
    if (this._commitScheduled || this.state !== 'active') return;
    this._commitScheduled = true;
    nextTask(() => {
      this._commitScheduled = false;
      if (this.state !== 'active') return;
      if (this.pending.length > 0) return;
      this._commit();
    }, 'a transaction commit check');
  }

  _commit() {
    if (this.state !== 'active') return;
    const faults = this.db._factory.faults;
    if (this.mode !== 'readonly' && (faults.failCommit || faults.failCommitOnce)) {
      faults.failCommitOnce = false;
      this._finish('abort', new FakeDOMException('QuotaExceededError',
        'There is not enough room on this device to save that.'));
      return;
    }
    this._finish('complete', null);
  }

  /** @param {'complete'|'abort'} how @param {Error|null} error */
  _finish(how, error) {
    if (this.state === 'finished') return;
    const wasQueued = this.state === 'queued';
    this.state = 'finished';
    this.pending.length = 0;

    if (how === 'abort' && this._snapshot) {
      // (2) of the file header: every write in this transaction is undone.
      for (const [name, entries] of this._snapshot) {
        const data = this.db._entry.stores.get(name);
        if (data) data.entries = entries;
      }
    }
    this._snapshot = null;
    if (error) this.error = error;

    this.db._entry.scheduler.release(this);

    if (how === 'complete') {
      this.db._factory._record('tx:complete', { stores: this.storeNames.join(',') });
      if (this.oncomplete) this.oncomplete({ target: this });
      return;
    }
    this.db._factory._record('tx:abort', { stores: this.storeNames.join(','), error: error?.name });
    if (this.onerror && !wasQueued) this.onerror({ target: this });
    if (this.onabort) this.onabort({ target: this });
  }
}

class FakeObjectStore {
  /** @param {FakeTransaction} tx @param {StoreData} data */
  constructor(tx, data) {
    this._tx = tx;
    this._data = data;
    this.name = data.name;
    this.keyPath = data.keyPath;
  }

  get indexNames() { return new NameList(...this._data.indexes.keys()); }

  /** @param {string} name */
  index(name) {
    if (!this._data.indexes.has(name)) {
      throw new FakeDOMException('NotFoundError', `No index "${name}" on "${this.name}".`);
    }
    return new FakeIndex(this._tx, this._data, name);
  }

  /** @param {string} name @param {string|string[]} keyPath @param {IDBIndexParameters} [options] */
  createIndex(name, keyPath, options = {}) {
    if (this._tx.mode !== 'versionchange') {
      throw new FakeDOMException('InvalidStateError', 'Indexes may only be created during a version change.');
    }
    this._data.indexes.set(name, {
      name, keyPath, unique: options.unique === true, multiEntry: options.multiEntry === true,
    });
    return this.index(name);
  }

  /** @param {any} key */
  get(key) { return this._tx._enqueue(() => this._data.get(key)); }

  /** @param {any} value */
  put(value) {
    this._assertWritable();
    return this._tx._enqueue(() => this._data.put(value));
  }

  /** @param {any} key */
  delete(key) {
    this._assertWritable();
    return this._tx._enqueue(() => { this._data.remove(key); return undefined; });
  }

  clear() {
    this._assertWritable();
    return this._tx._enqueue(() => { this._data.entries = []; return undefined; });
  }

  /** @param {any} [query] */
  count(query) { return this._tx._enqueue(() => this._data.select(query).length); }

  /** @param {any} [query] @param {number} [count] */
  getAll(query, count) {
    return this._tx._enqueue(() => {
      const rows = this._data.select(query).map((e) => structuredClone(e.value));
      return count === undefined ? rows : rows.slice(0, count);
    });
  }

  /** @param {any} [query] @param {number} [count] */
  getAllKeys(query, count) {
    return this._tx._enqueue(() => {
      const keys = this._data.select(query).map((e) => e.key);
      return count === undefined ? keys : keys.slice(0, count);
    });
  }

  /** @param {any} [query] @param {'next'|'prev'} [direction] */
  openCursor(query, direction = 'next') { return this._cursor(query, direction, true); }

  /** @param {any} [query] @param {'next'|'prev'} [direction] */
  openKeyCursor(query, direction = 'next') { return this._cursor(query, direction, false); }

  /** @param {any} query @param {'next'|'prev'} direction @param {boolean} withValues */
  _cursor(query, direction, withValues) {
    const entries = this._data.select(query)
      .map((e) => ({ key: e.key, primaryKey: e.key, value: e.value }));
    if (direction === 'prev') entries.reverse();
    return makeCursorRequest(this._tx, entries, direction, withValues);
  }

  _assertWritable() {
    if (this._tx.mode === 'readonly') {
      throw new FakeDOMException('ReadOnlyError', 'This transaction is read-only.');
    }
  }
}

class FakeIndex {
  /** @param {FakeTransaction} tx @param {StoreData} data @param {string} name */
  constructor(tx, data, name) {
    this._tx = tx;
    this._data = data;
    this.name = name;
    /** Present on an index and absent on a store — the platform's own way of telling them apart. */
    this.objectStore = new FakeObjectStore(tx, data);
  }

  /** @param {any} key */
  get(key) {
    return this._tx._enqueue(() => {
      const hit = this._data.indexEntries(this.name).find((e) => matchesQuery(key, e.key));
      return hit ? structuredClone(hit.value) : undefined;
    });
  }

  /** @param {any} [query] */
  count(query) {
    return this._tx._enqueue(() => this._data.indexEntries(this.name).filter((e) => matchesQuery(query, e.key)).length);
  }

  /** @param {any} [query] @param {number} [count] */
  getAll(query, count) {
    return this._tx._enqueue(() => {
      const rows = this._data.indexEntries(this.name)
        .filter((e) => matchesQuery(query, e.key))
        .map((e) => structuredClone(e.value));
      return count === undefined ? rows : rows.slice(0, count);
    });
  }

  /** @param {any} [query] @param {number} [count] */
  getAllKeys(query, count) {
    return this._tx._enqueue(() => {
      const keys = this._data.indexEntries(this.name)
        .filter((e) => matchesQuery(query, e.key))
        .map((e) => e.primaryKey);
      return count === undefined ? keys : keys.slice(0, count);
    });
  }

  /** @param {any} [query] @param {'next'|'prev'} [direction] */
  openCursor(query, direction = 'next') { return this._cursor(query, direction, true); }

  /** @param {any} [query] @param {'next'|'prev'} [direction] */
  openKeyCursor(query, direction = 'next') { return this._cursor(query, direction, false); }

  /** @param {any} query @param {'next'|'prev'} direction @param {boolean} withValues */
  _cursor(query, direction, withValues) {
    const entries = this._data.indexEntries(this.name).filter((e) => matchesQuery(query, e.key));
    if (direction === 'prev') entries.reverse();
    return makeCursorRequest(this._tx, entries, direction, withValues);
  }
}

/**
 * @param {FakeTransaction} tx
 * @param {{key: any, primaryKey: any, value: any}[]} entries
 * @param {'next'|'prev'} direction
 * @param {boolean} withValues
 */
function makeCursorRequest(tx, entries, direction, withValues) {
  /** @type {FakeRequest} */
  let request;
  /** @type {FakeCursor} */
  let cursor;
  request = tx._enqueue(() => {
    cursor._at = 0;
    return entries.length ? cursor : null;
  });
  cursor = new FakeCursor(tx, request, entries, withValues);
  cursor._forward = direction !== 'prev';
  return request;
}

// ---------------------------------------------------------------------------------------------
// Database, scheduler, factory
// ---------------------------------------------------------------------------------------------

/**
 * One transaction at a time, in creation order.
 *
 * Point (3) of the file header. Strict first-in-first-out means no transaction can starve and no
 * two can interleave, which is what turns a lost update between two windows into a conflict the
 * store detects instead of an outcome that depends on timing.
 */
class Scheduler {
  constructor() {
    /** @type {FakeTransaction[]} */
    this.queue = [];
    /** @type {FakeTransaction|null} */
    this.active = null;
  }

  /** @param {FakeTransaction} tx */
  add(tx) {
    this.queue.push(tx);
    this.pump();
  }

  /** @param {FakeTransaction} tx */
  release(tx) {
    const at = this.queue.indexOf(tx);
    if (at >= 0) this.queue.splice(at, 1);
    if (this.active === tx) this.active = null;
    this.pump();
  }

  pump() {
    if (this.active) return;
    const next = this.queue[0];
    if (!next || next.state !== 'queued') return;
    this.active = next;
    next._activate();
  }
}

class FakeDatabase {
  /** @param {FakeIndexedDB} factory @param {string} name @param {any} entry @param {number} version */
  constructor(factory, name, entry, version) {
    this._factory = factory;
    this._entry = entry;
    this.name = name;
    this.version = version;
    this.closed = false;
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  get objectStoreNames() { return new NameList(...this._entry.stores.keys()); }

  /** @param {string} name @param {{keyPath: string|string[]}} options */
  createObjectStore(name, options) {
    if (this._entry.stores.has(name)) {
      throw new FakeDOMException('ConstraintError', `Object store "${name}" already exists.`);
    }
    const data = new StoreData(name, options.keyPath);
    this._entry.stores.set(name, data);
    return new FakeObjectStore(this._factory._upgradeTx, data);
  }

  /** @param {string} name */
  deleteObjectStore(name) { this._entry.stores.delete(name); }

  /**
   * @param {string|string[]} storeNames
   * @param {'readonly'|'readwrite'} [mode]
   * @param {{durability?: string}} [options]
   */
  transaction(storeNames, mode = 'readonly', options = {}) {
    if (this.closed) {
      throw new FakeDOMException('InvalidStateError', 'The database connection is closed.');
    }
    const names = Array.isArray(storeNames) ? storeNames.slice() : [storeNames];
    for (const name of names) {
      if (!this._entry.stores.has(name)) {
        throw new FakeDOMException('NotFoundError', `No object store "${name}".`);
      }
    }
    const tx = new FakeTransaction(this, names, mode, options);
    this._entry.scheduler.add(tx);
    return tx;
  }

  close() {
    this.closed = true;
    const at = this._entry.connections.indexOf(this);
    if (at >= 0) this._entry.connections.splice(at, 1);
  }

  /** @param {string} type @param {Function} listener */
  addEventListener(type, listener) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(listener);
  }

  /** @param {string} type */
  _dispatch(type) {
    for (const listener of this._listeners.get(type) || []) listener({ target: this, type });
  }
}

/** The database factory. Shared between contexts to give them one database, as two windows have. */
export class FakeIndexedDB {
  constructor() {
    /** @type {Map<string, {version: number, stores: Map<string, StoreData>, connections: FakeDatabase[], scheduler: Scheduler}>} */
    this._databases = new Map();
    /** Fault injection. `failCommit` fails every commit; `failCommitOnce` fails the next one. */
    this.faults = { failCommit: false, failCommitOnce: false };
    /** An ordered log of the events a durability test needs to see in order. @type {{event: string, detail: any}[]} */
    this.events = [];
    this._recording = false;
    /** @type {FakeTransaction|null} */
    this._upgradeTx = null;
  }

  /** Start recording events, clearing whatever was there. */
  startRecording() {
    this.events.length = 0;
    this._recording = true;
  }

  /** @param {string} event @param {any} detail */
  _record(event, detail) {
    if (this._recording) this.events.push({ event, detail });
  }

  /** Just the event names, in order — what an ordering assertion reads. @returns {string[]} */
  eventNames() { return this.events.map((e) => e.event); }

  /** @param {string} name @param {number} [version] */
  open(name, version) {
    const request = new FakeRequest(null);
    request.onupgradeneeded = null;
    request.onblocked = null;

    let attempts = 0;
    const attempt = () => {
      let entry = this._databases.get(name);
      if (!entry) {
        entry = { version: 0, stores: new Map(), connections: [], scheduler: new Scheduler() };
        this._databases.set(name, entry);
      }
      const target = version === undefined ? Math.max(entry.version, 1) : version;

      if (target < entry.version) {
        request.error = new FakeDOMException('VersionError',
          `The requested version (${target}) is older than the stored one (${entry.version}).`);
        if (request.onerror) request.onerror({ target: request });
        return;
      }

      if (target === entry.version) {
        finish(entry, target);
        return;
      }

      // A version change needs every other connection to let go first.
      const others = entry.connections.filter((c) => !c.closed);
      if (others.length > 0) {
        for (const other of others) other._dispatch('versionchange');
        const stillOpen = entry.connections.filter((c) => !c.closed);
        if (stillOpen.length > 0) {
          if (attempts === 0 && request.onblocked) request.onblocked({ target: request });
          attempts += 1;
          if (attempts > 100) {
            request.error = new FakeDOMException('AbortError',
              'Another window kept the database open and the upgrade could not proceed.');
            if (request.onerror) request.onerror({ target: request });
            return;
          }
          nextTask(attempt, 'a database upgrade waiting for another window to close');
          return;
        }
      }

      const oldVersion = entry.version;
      const db = new FakeDatabase(this, name, entry, target);
      entry.connections.push(db);
      const tx = new FakeTransaction(db, Array.from(entry.stores.keys()), 'versionchange');
      this._upgradeTx = tx;
      entry.scheduler.queue.push(tx);
      entry.scheduler.active = tx;
      tx.state = 'active';
      tx._snapshot = new Map();

      request.result = db;
      request.transaction = tx;
      entry.version = target;

      tx.oncomplete = () => {
        this._upgradeTx = null;
        request.transaction = null;
        if (request.onsuccess) request.onsuccess({ target: request });
      };
      tx.onabort = () => {
        this._upgradeTx = null;
        request.error = tx.error;
        if (request.onerror) request.onerror({ target: request });
      };

      if (request.onupgradeneeded) {
        request.onupgradeneeded({ target: request, oldVersion, newVersion: target });
      }
      tx._scheduleCommit();
    };

    /** @param {any} entry @param {number} target */
    const finish = (entry, target) => {
      const db = new FakeDatabase(this, name, entry, target);
      entry.connections.push(db);
      request.result = db;
      if (request.onsuccess) request.onsuccess({ target: request });
    };

    nextTask(attempt, 'a database open');
    return request;
  }

  /** @param {string} name */
  deleteDatabase(name) {
    const request = new FakeRequest(null);
    nextTask(() => {
      this._databases.delete(name);
      if (request.onsuccess) request.onsuccess({ target: request });
    }, 'a database delete');
    return request;
  }
}

/**
 * A fresh in-memory database factory and its key-range constructor.
 *
 * Two platforms built over ONE of these share a database, which is how the two-windows tests are
 * two windows rather than a description of them.
 *
 * @returns {{indexedDB: FakeIndexedDB, IDBKeyRange: typeof FakeKeyRange}}
 */
export function createFakeIndexedDB() {
  return { indexedDB: new FakeIndexedDB(), IDBKeyRange: FakeKeyRange };
}

export { FakeDOMException };
