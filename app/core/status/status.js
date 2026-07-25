/**
 * THE ACCOUNTABILITY SURFACE — the module API. Import from here.
 *
 * Named explicitly rather than relying on directory-index resolution, for the same reason
 * `core/store/store.js`, `core/remote/remote.js`, `core/outbox/outbox.js` and `core/sync/sync.js` are:
 * directory resolution is a runtime convenience that browsers do not have, and this core is written to
 * be adopted unchanged by the browser application. `'./core/status/status.js'` works in both places;
 * `'./core/status'` works in neither. `index.js` beside this file is the TEST ENTRY POINT, not the API.
 *
 * Plain, dependency-free ECMAScript modules. No framework, no bundler, no build step, no third-party
 * package; types are expressed in documentation comments. **Nothing in this package touches a
 * document, an element or a style.** It computes what the interface will show and draws none of it, so
 * the interface may render it however it likes and this may be tested without a browser.
 *
 * Start at `STATUS.md` beside this file for the written notes.
 *
 * ```js
 * import { accountabilityStatus, recordCompletedSync, LEVEL } from './core/status/status.js';
 *
 * const report = await syncNow(store, remote, { trigger: SYNC_TRIGGERS.OPEN });
 * await recordCompletedSync(store, report);   // writes nothing unless one was genuinely earned
 *
 * const status = await accountabilityStatus(store, { last_attempt: report });
 * status.last_synced_at;        // null means NEVER, and it is never a guess
 * status.undelivered;           // how much is not in the backup
 * status.oldest_pending_age_ms; // how long the oldest of it has waited
 * status.level;                 // 'up_to_date' … 'persistent_warning'
 * status.reason;                // WHY, specifically. Never "something went wrong".
 * status.blocks_application;    // false. Always. There is no branch that sets it.
 * ```
 *
 * The five things worth knowing before using it:
 *
 *  1. **A last-backed-up time is a BRAND, not a field.** Only a foreground flush that genuinely
 *     drained the queue can produce one. A best-effort flush killed mid-flight by the platform
 *     cannot, by any route — see `completion.js`.
 *  2. **Sync never blocks.** A persistent, unmissable warning is the maximum escalation and the
 *     application always opens. `blocks_application` is a frozen `false` and every level declares
 *     `blocks: false`.
 *  3. **A dead credential is a condition of the WHOLE QUEUE**, not a property of some entries. It is
 *     reported as a queue-wide stop with one tap attached, because nothing can go anywhere at all.
 *  4. **Failure is loud and specific.** There is no in-progress reason code, so no caller can render
 *     an indeterminate state as the only thing it shows.
 *  5. **The honest statement promises no background synchronisation**, none while the app is closed,
 *     and warns that deleting the installed icon destroys the local data — see `statement.js`.
 *
 * Nothing here makes a live call to any provider, and nothing here proves anything about one.
 */

export * from './levels.js';
export * from './reasons.js';
export * from './completion.js';
export * from './statement.js';
export * from './surface.js';
