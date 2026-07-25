/**
 * EVERY QUERY THE APPLICATION ASKS — each one indexed, each one paged.
 *
 * ## The rule these are written to
 *
 * Session and client volumes are **unknown and cannot be clarified**. The coach may have a dozen
 * clients or two hundred, and a history of one month or five years, and nobody can tell us which. So
 * no query here loads a collection in order to filter or sort it in memory. Every one is either a
 * keyed lookup or a bounded walk over an index range, and every list returns
 * `{ items, cursor, done }` so the caller asks for the next page rather than for everything.
 *
 * The cost of a page is the size of the page. That is the property, and the tests assert it by
 * counting the rows the database actually hands over rather than by trusting the shape of the code.
 *
 * ## What remains linear, and why that is acceptable
 *
 * Three things, all of them bounded by ONE client's own data rather than by the practice:
 *
 *  1. **The deletion sweep** (`purge.js`) visits every row belonging to the client being removed.
 *     It has to: the point is that nothing of theirs is left. It is linear in that client's history
 *     and touches nobody else's.
 *  2. **A session's own detail** — what one client performed in one session, the readings taken, the
 *     notes — is read whole. A session is about an hour and holds a handful of exercises per client;
 *     there is no page worth turning, and paging it would cost more in round trips than it saves.
 *  3. **Filtering archived clients during the roster walk.** The platform cannot index a boolean, so
 *     `active` is applied as the name index is walked rather than as a key. The extra cost is the
 *     archived clients skipped over, which is a fraction of the roster and not a multiple of it. The
 *     alternative — a second derived store, as sessions need — is not worth its maintenance for a
 *     list a person reads.
 *
 * None of the three grows with the practice as a whole, which is the property that matters.
 */

import { prefixRange } from './keys.js';
import { PARTICIPANTS_STORE, RECORD_STORES, storeNameFor } from './schema.js';

/** A page size a person can read, and small enough that a first paint is cheap. */
export const DEFAULT_PAGE = 25;

/**
 * @typedef {Object} PageResult
 * @property {any[]} items
 * @property {string|null} cursor Pass back as `after` for the next page.
 * @property {boolean} done True only when the range is definitively exhausted. A full page is
 *   reported as not done even if it happens to have been the last one.
 */

/**
 * The roster, alphabetically, one page at a time.
 *
 * @param {import('./local-store.js').LocalStore} store
 * @param {{limit?: number, after?: string|null, includeArchived?: boolean}} [options]
 * @returns {Promise<PageResult>}
 */
export async function listClients(store, options = {}) {
  const { limit = DEFAULT_PAGE, after = null, includeArchived = false } = options;
  const name = RECORD_STORES.client;
  return store.read(name, (scope) => scope.page({
    store: name,
    index: 'by_name',
    limit,
    after,
    where: (record) => !record.deleted && (includeArchived || record.content?.active === true),
  }));
}

/**
 * A client's sessions, in time order, newest first.
 *
 * Answered from the derived participants store, because a session carries a SET of clients and the
 * platform has no compound multi-entry index — so this question is unanswerable from the sessions
 * store alone at any acceptable cost. The derived rows are keyed `[client_id, sort_at,
 * session_record_id]`, which makes one client's history a contiguous range.
 *
 * @param {import('./local-store.js').LocalStore} store
 * @param {string} clientId
 * @param {{limit?: number, after?: string|null, direction?: 'next'|'prev'}} [options]
 * @returns {Promise<PageResult>} sessions, newest first by default
 */
export async function sessionsForClient(store, clientId, options = {}) {
  const { limit = DEFAULT_PAGE, after = null, direction = 'prev' } = options;
  return store.read([PARTICIPANTS_STORE, RECORD_STORES.session], async (scope) => {
    const page = await scope.page({
      store: PARTICIPANTS_STORE,
      range: prefixRange(scope.KeyRange, [clientId]),
      direction,
      limit,
      after,
    });
    const items = [];
    for (const row of page.items) {
      const session = await scope.get(RECORD_STORES.session, row.session_record_id);
      if (session && !session.deleted) items.push(session);
    }
    return { items, cursor: page.cursor, done: page.done };
  });
}

/**
 * The client's most recent session.
 *
 * One step of a reverse walk over the participants range, not a sort of their history. Pass
 * `excludeSessionId` to get the one BEFORE a given session, which is what the session screen wants:
 * the coach is starting a session and needs to see the last one at a glance.
 *
 * @param {import('./local-store.js').LocalStore} store
 * @param {string} clientId
 * @param {{excludeSessionId?: string|null, statuses?: readonly string[]|null}} [options]
 * @returns {Promise<any|null>}
 */
export async function latestSessionForClient(store, clientId, options = {}) {
  const { excludeSessionId = null, statuses = null } = options;
  let after = null;

  // Walks in small steps rather than one big read. The loop turns only when the newest rows are
  // excluded — a tombstoned session, or the session being started — so in practice it runs once.
  for (let page = 0; page < 8; page += 1) {
    const result = await sessionsForClient(store, clientId, { limit: 5, after, direction: 'prev' });
    for (const session of result.items) {
      if (session.record_id === excludeSessionId) continue;
      if (statuses && !statuses.includes(session.content?.status)) continue;
      return session;
    }
    if (result.done) return null;
    after = result.cursor;
  }
  return null;
}

/**
 * The previous session, with everything the coach needs to see at a glance.
 *
 * A stated requirement: when he starts a session, the app shows the previous one — the exercises
 * performed, the loads, and the readings taken. It shows; it does not suggest. Nothing here proposes
 * a heavier load or a longer hold, and nothing derives a progression: that judgement belongs to the
 * coach, who is also adapting to a client's history.
 *
 * Per client, always, even when the session was shared: each attending client has their own
 * performed records, readings and notes, and one client's must never appear in another's view.
 *
 * @param {import('./local-store.js').LocalStore} store
 * @param {string} clientId
 * @param {{excludeSessionId?: string|null}} [options]
 * @returns {Promise<{session: any, performed: any[], readings: any[], notes: any[]}|null>}
 */
export async function previousSessionForClient(store, clientId, options = {}) {
  const session = await latestSessionForClient(store, clientId, {
    excludeSessionId: options.excludeSessionId ?? null,
    statuses: ['completed', 'interrupted', 'abandoned', 'in_progress'],
  });
  if (!session) return null;

  const [performed, readings, notes] = await Promise.all([
    performedForClientInSession(store, session.record_id, clientId),
    readingsInSessionForClient(store, session.record_id, clientId),
    notesInSessionForClient(store, session.record_id, clientId),
  ]);
  return { session, performed, readings, notes };
}

/**
 * What one client actually did in one session, in the order it happened.
 *
 * Read whole rather than paged — see the file header, point 2. What is stored is what was
 * *performed*, never what was proposed.
 *
 * @param {import('./local-store.js').LocalStore} store
 * @param {string} sessionId @param {string} clientId
 * @returns {Promise<any[]>}
 */
export async function performedForClientInSession(store, sessionId, clientId) {
  const name = RECORD_STORES['performed-record'];
  const result = await store.read(name, (scope) => scope.page({
    store: name,
    index: 'by_session_client_position',
    range: prefixRange(scope.KeyRange, [sessionId, clientId]),
    limit: 500,
    where: (record) => !record.deleted,
  }));
  return result.items;
}

/**
 * @param {import('./local-store.js').LocalStore} store
 * @param {string} sessionId @param {string} clientId
 * @returns {Promise<any[]>}
 */
export async function readingsInSessionForClient(store, sessionId, clientId) {
  const name = RECORD_STORES.reading;
  const result = await store.read(name, (scope) => scope.page({
    store: name,
    index: 'by_session',
    range: scope.KeyRange.only(sessionId),
    limit: 500,
    where: (record) => !record.deleted && record.content?.client_id === clientId,
  }));
  return result.items;
}

/**
 * Notes belonging to one client in one session.
 *
 * A note WITH a client is that person's and follows them into their progress view and export; a note
 * without one is about the session as a whole. Inferring one from the other would put one client's
 * note into another's export, so the two are never conflated here.
 *
 * @param {import('./local-store.js').LocalStore} store
 * @param {string} sessionId @param {string} clientId
 * @returns {Promise<any[]>}
 */
export async function notesInSessionForClient(store, sessionId, clientId) {
  const name = RECORD_STORES['session-note'];
  const result = await store.read(name, (scope) => scope.page({
    store: name,
    index: 'by_session',
    range: scope.KeyRange.only(sessionId),
    limit: 500,
    where: (record) => !record.deleted && record.content?.client_id === clientId,
  }));
  return result.items;
}

/**
 * Every note on a session, including the ones about the session as a whole.
 * @param {import('./local-store.js').LocalStore} store @param {string} sessionId
 * @returns {Promise<any[]>}
 */
export async function notesForSession(store, sessionId) {
  const name = RECORD_STORES['session-note'];
  const result = await store.read(name, (scope) => scope.page({
    store: name,
    index: 'by_session',
    range: scope.KeyRange.only(sessionId),
    limit: 500,
    where: (record) => !record.deleted,
  }));
  return result.items;
}

/**
 * A client's readings over time — the trend lines a progress report is built from.
 *
 * Narrowing by `kind` uses its own index rather than reading every reading and filtering, because a
 * client with years of history has many kinds and a chart wants one.
 *
 * @param {import('./local-store.js').LocalStore} store
 * @param {string} clientId
 * @param {{kind?: string|null, from?: string|null, to?: string|null, limit?: number, after?: string|null, direction?: 'next'|'prev'}} [options]
 * @returns {Promise<PageResult>}
 */
export async function readingsForClient(store, clientId, options = {}) {
  const {
    kind = null, from = null, to = null, limit = DEFAULT_PAGE, after = null, direction = 'next',
  } = options;
  const name = RECORD_STORES.reading;

  return store.read(name, (scope) => {
    const { KeyRange } = scope;
    const prefix = kind ? [clientId, kind] : [clientId];
    const index = kind ? 'by_client_kind_taken_at' : 'by_client_taken_at';

    let range;
    if (from || to) {
      range = KeyRange.bound(
        [...prefix, from || ''],
        [...prefix, to || '￿'],
      );
    } else {
      range = prefixRange(KeyRange, prefix);
    }

    return scope.page({
      store: name, index, range, direction, limit, after, where: (r) => !r.deleted,
    });
  });
}

/**
 * A client's performed history, paged — what the progress view walks.
 * @param {import('./local-store.js').LocalStore} store @param {string} clientId
 * @param {{limit?: number, after?: string|null, direction?: 'next'|'prev'}} [options]
 * @returns {Promise<PageResult>}
 */
export async function performedForClient(store, clientId, options = {}) {
  const { limit = DEFAULT_PAGE, after = null, direction = 'prev' } = options;
  const name = RECORD_STORES['performed-record'];
  return store.read(name, (scope) => scope.page({
    store: name,
    index: 'by_client_recorded_at',
    range: prefixRange(scope.KeyRange, [clientId]),
    direction,
    limit,
    after,
    where: (r) => !r.deleted,
  }));
}

/**
 * The diet plan a client follows now, without reading their history.
 * @param {import('./local-store.js').LocalStore} store @param {string} clientId
 * @param {string} [status]
 * @returns {Promise<any|undefined>}
 */
export async function dietPlanForClient(store, clientId, status = 'current') {
  const name = RECORD_STORES['diet-plan'];
  const result = await store.read(name, (scope) => scope.page({
    store: name,
    index: 'by_client_status',
    range: scope.KeyRange.only([clientId, status]),
    limit: 1,
    where: (r) => !r.deleted,
  }));
  return result.items[0];
}

/**
 * A client's diet plans, current and past.
 * @param {import('./local-store.js').LocalStore} store @param {string} clientId
 * @param {{limit?: number, after?: string|null}} [options]
 * @returns {Promise<PageResult>}
 */
export async function dietPlansForClient(store, clientId, options = {}) {
  const { limit = DEFAULT_PAGE, after = null } = options;
  const name = RECORD_STORES['diet-plan'];
  return store.read(name, (scope) => scope.page({
    store: name,
    index: 'by_client',
    range: scope.KeyRange.only(clientId),
    limit,
    after,
    where: (r) => !r.deleted,
  }));
}

/**
 * Sessions left in progress or interrupted — what the resume prompt asks for.
 *
 * Interruption is normal: real sessions are disturbed by power cuts, illness, phone calls and the
 * browser closing. This query is how a disturbed session is found again; the deciding what to do
 * about it belongs to the session runner, not here.
 *
 * @param {import('./local-store.js').LocalStore} store
 * @param {{limit?: number, after?: string|null, statuses?: readonly string[]}} [options]
 * @returns {Promise<PageResult>}
 */
export async function unfinishedSessions(store, options = {}) {
  const { limit = DEFAULT_PAGE, after = null, statuses = ['in_progress', 'interrupted'] } = options;
  const name = RECORD_STORES.session;
  const items = [];
  let cursor = after;
  let done = false;

  for (const status of statuses) {
    const page = await store.read(name, (scope) => scope.page({
      store: name,
      index: 'by_status',
      range: scope.KeyRange.only(status),
      limit,
      where: (r) => !r.deleted,
    }));
    items.push(...page.items);
    cursor = page.cursor;
    done = page.done;
  }
  return { items, cursor, done };
}

/**
 * A page of the library, in content-key order.
 * @param {import('./local-store.js').LocalStore} store @param {string} type
 * @param {{limit?: number, after?: string|null}} [options]
 * @returns {Promise<PageResult>}
 */
export async function libraryPage(store, type, options = {}) {
  const { limit = DEFAULT_PAGE, after = null } = options;
  const name = storeNameFor(type);
  return store.read(name, (scope) => scope.page({
    store: name, index: 'by_content_key', limit, after, where: (r) => !r.deleted,
  }));
}

/**
 * Records of one kind changed at or after an instant, oldest first.
 *
 * The question the outbox and the synchronisation engine ask, answered from the envelope's own
 * `updated_at` index — which stays valid on a tombstone, whose content-derived index entries have
 * all gone. A deletion must reach the remote copy, so it must be findable here.
 *
 * @param {import('./local-store.js').LocalStore} store
 * @param {string} type @param {string} since An ISO timestamp.
 * @param {{limit?: number, after?: string|null}} [options]
 * @returns {Promise<PageResult>}
 */
export async function changedSince(store, type, since, options = {}) {
  const { limit = DEFAULT_PAGE, after = null } = options;
  const name = storeNameFor(type);
  return store.read(name, (scope) => scope.page({
    store: name,
    index: 'by_updated_at',
    range: scope.KeyRange.lowerBound(since),
    limit,
    after,
  }));
}

/**
 * Whether a client appears in a session at all.
 *
 * Membership, not order — that is what the multi-entry index on the session's client set is for, and
 * it is the one question it can answer well.
 *
 * @param {import('./local-store.js').LocalStore} store @param {string} clientId
 * @returns {Promise<number>}
 */
export async function sessionCountForClient(store, clientId) {
  const name = RECORD_STORES.session;
  return store.read(name, (scope) => scope.countByIndex(name, 'by_client', scope.KeyRange.only(clientId)));
}
