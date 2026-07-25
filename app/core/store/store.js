/**
 * THE LOCAL DURABLE STORE — the module API.
 *
 * Plain, dependency-free ECMAScript modules. No framework, no bundler, no build step, no third-party
 * package; types are expressed in documentation comments. Whatever front-end stack is chosen must be
 * able to adopt this core unchanged, and the test gate runs on the runtime's own test runner with
 * nothing installed.
 *
 * Start at `STORE.md` beside this file for the written notes. This file is the entry point for code —
 * named explicitly rather than as a directory, because directory-index resolution does not exist in
 * a browser.
 *
 * ```js
 * import { browserPlatform, openLocalStore, sessionsForClient } from './core/store/store.js';
 *
 * const store = await openLocalStore({ platform: browserPlatform(), device: 'coach-laptop' });
 *
 * const client = await store.create('client', { name: 'A. Client', notes: '', active: true });
 * // ↑ resolved means COMMITTED. Only now may the interface say it is saved.
 *
 * const history = await sessionsForClient(store, client.record_id, { limit: 25 });
 * ```
 *
 * The four things worth knowing before using it:
 *
 *  1. **A resolved write is a committed write.** Nothing here resolves before the transaction
 *     completed, and a failure throws rather than returning a status.
 *  2. **Every list is a page.** `{ items, cursor, done }`, and there is no call that loads a
 *     collection whole.
 *  3. **A live session belongs to one window.** Writing into one needs its lease.
 *  4. **Ciphertext passes through untouched.** This layer never encrypts, decrypts or inspects it.
 */

export * from './errors.js';
export * from './platform.js';
export * from './capabilities.js';
export * from './keys.js';
export * from './schema.js';
export * from './db.js';
export * from './coordination.js';
export * from './local-store.js';
export * from './queries.js';
export * from './purge.js';
