/**
 * THE SYNCHRONISATION ENGINE — the module API. Import from here.
 *
 * Named explicitly rather than relying on directory-index resolution, for the same reason
 * `core/store/store.js`, `core/remote/remote.js` and `core/outbox/outbox.js` are: directory
 * resolution is a runtime convenience that browsers do not have, and this core is written to be
 * adopted unchanged by the browser application. `'./core/sync/sync.js'` works in both places;
 * `'./core/sync'` works in neither. `index.js` beside this file is the TEST ENTRY POINT, not the API.
 *
 * Plain, dependency-free ECMAScript modules. No framework, no bundler, no build step, no third-party
 * package; types are expressed in documentation comments.
 *
 * Start at `SYNC.md` beside this file for the written notes, which say plainly which guarantees are
 * structural, which are detected and recoverable, and which are detection alone.
 *
 * ```js
 * import { syncNow, SYNC_TRIGGERS } from './core/sync/sync.js';
 *
 * const report = await syncNow(store, remote, { trigger: SYNC_TRIGGERS.OPEN });
 * report.completion;    // null unless the queue genuinely drained in the foreground
 * report.divergences;   // clashes a person must look at. Never resolved here.
 * ```
 *
 * The five things worth knowing before using it:
 *
 *  1. **Each device writes only into its own area.** Cross-device overwrite is structurally
 *     impossible; reading is the union of every area.
 *  2. **The derived snapshot is the one shared object**, so it is the one place a lost update can
 *     occur. It is detected by read-compare-write and REPAIRED by rebuilding from the areas, which
 *     remain the authority.
 *  3. **Read-compare-write is DETECTION, not a lock.** This service has no conditional match, and the
 *     window between the compare and the write cannot be closed.
 *  4. **A genuine divergence is surfaced, never GUESSED at.** Ordinary sequential use is per-record
 *     last-write-wins; two devices at the same revision is a question only the coach can answer.
 *     Nothing here answers it. `resolution.js` APPLIES an answer once he has given one, writing the
 *     side he chose above both — and it is the only thing in the application that ever records
 *     `sync.conflict_resolved`.
 *  5. **There is no background synchronisation and there cannot be.** Five opportunities, all of them
 *     in the foreground.
 *
 * Nothing here makes a live call to any provider. Everything below was proved against the in-memory
 * double in `core/remote`, which is faithful to two MEASURED quirks and no more; a passing test
 * proves OUR LOGIC given that behaviour, and never proves the platform.
 */

export * from './errors.js';
export * from './partition.js';
export * from './payload.js';
export * from './divergence.js';
export * from './resolution.js';
export * from './revisions.js';
export * from './areas.js';
export * from './snapshot.js';
export * from './deletions.js';
export * from './engine.js';
