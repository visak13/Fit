/**
 * THE DURABLE OUTBOX — the module API. Import from here.
 *
 * Named explicitly rather than relying on directory-index resolution, for the same reason
 * `core/store/store.js` and `core/remote/remote.js` are: directory resolution is a runtime
 * convenience that browsers do not have, and this core is written to be adopted unchanged by the
 * browser application. `'./core/outbox/outbox.js'` works in both places; `'./core/outbox'` works in
 * neither. `index.js` beside this file is the TEST ENTRY POINT, not the API.
 *
 * Plain, dependency-free ECMAScript modules. No framework, no bundler, no build step, no third-party
 * package; types are expressed in documentation comments.
 *
 * Start at `OUTBOX.md` beside this file for the written notes.
 *
 * ```js
 * import { openLocalStore, browserPlatform } from './core/store/store.js';
 * import { queueBackup, flushOutbox, flushBestEffort, outboxStatus, syncCompletionMarker }
 *   from './core/outbox/outbox.js';
 *
 * const { entry } = await queueBackup(store, {
 *   space: SPACES.VISIBLE, baseName: 'library-backup.json', payload: json,
 *   label: 'backup of the exercise library',
 * });
 * // ↑ resolved means COMMITTED. The credential can be dead; the work is not lost.
 *
 * const report = await flushOutbox(store, remote);
 * const marker = syncCompletionMarker(report);   // null unless the queue genuinely drained
 * const { pending, oldest_pending_age_ms } = await outboxStatus(store);
 * ```
 *
 * The five things worth knowing before using it:
 *
 *  1. **Nothing remote-bound may bypass it.** Every write that leaves this device is enqueued first
 *     and delivered second, so a failed, expired or absent credential is a DELAY and never a LOSS.
 *  2. **A resolved enqueue is a committed enqueue.** It goes through the store's single writable door.
 *  3. **Replay is idempotent, and by a stated mechanism** — see `recognition.js`. It rests on a
 *     name-embedded key and a read-back comparison, NOT on a conditional write, which the service does
 *     not have.
 *  4. **Failures are three different things** — transient, credential, rejected — and are treated as
 *     three different things.
 *  5. **A best-effort flush can never report a completed synchronisation.** Structurally: see
 *     `claimsCompletedSync`.
 */

export * from './errors.js';
export * from './entry.js';
export * from './classify.js';
export * from './recognition.js';
export * from './queue.js';
export * from './flush.js';
export * from './status.js';
export * from './enqueue.js';
export * from './scrub.js';
