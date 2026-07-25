/**
 * "LAST BACKED UP" IS A BRAND, NOT A FIELD.
 *
 * The requirement behind this file is a specific, measured worry. The best-effort flush that runs when
 * the app is backgrounded MAY BE KILLED MID-FLIGHT by the platform — on iOS this is ordinary, not
 * exceptional. It must be IMPOSSIBLE, rather than merely forbidden, for that partial outcome to be
 * reported as a completed synchronisation, because the sentence "last backed up: just now" is the one
 * sentence in this application that can lose a professional's work while looking like reassurance.
 *
 * A boolean that callers are supposed to check is a rule someone eventually forgets. A distinct type
 * that cannot be passed where a completion is expected is a rule that cannot be forgotten. The outbox
 * took that approach for its flush report; this module takes the SAME approach one layer up, for the
 * value the interface actually displays.
 *
 * ## How it works, in three sentences
 *
 * The only way to obtain a `CompletedSync` is {@link completionFrom}, which asks
 * `syncCompletionMarker` in `core/outbox` — a function whose own first test is a module-private symbol
 * that only a flush that genuinely ran in this process can carry. The value it returns is stamped with
 * a second module-private symbol belonging to THIS file, so nothing outside can construct one, and a
 * spread, a `JSON.parse(JSON.stringify(...))` or a hand-built lookalike all lose it. Anything else
 * offered as a last-synced value is not merely ignored — it is reported as
 * `unverifiable_sync_claim`, loudly, because silently treating it as "never synchronised" would hide
 * the fact that something in the application is manufacturing completions.
 *
 * ## What this does NOT claim, stated plainly rather than left to be assumed
 *
 * The brand is an IN-PROCESS defence. The persisted value is guarded by there being exactly one writer
 * — {@link recordCompletedSync}, which cannot be satisfied without an authentic report — and not by
 * cryptography: anything that can write to the local database directly can write that key, and no
 * check here would survive that. Saying so is the honest position and it costs nothing; claiming a
 * guarantee this does not have would be the same class of defect as the spinner. What IS structural
 * is the part the requirement asked for: a killed best-effort flush cannot produce a completion, by
 * any route, including the one where a well-meaning caller builds the object by hand.
 */

import { timestamp } from '../model/model.js';
import { syncCompletionMarker } from '../outbox/outbox.js';

/** Where the last genuine completion is kept. One key, one writer. */
export const LAST_SYNC_META_KEY = 'status.last_completed_sync';

/**
 * The brand. Module-private, non-enumerable where it is applied, and exported nowhere.
 *
 * Its value is the instant of the completion rather than `true`, so a stamped object cannot be
 * repurposed onto a different report by copying the symbol across — there is no route to read it out
 * from outside this file in the first place, and this makes the intent legible from inside it.
 */
const SEALED = Symbol('status.completion.sealed');

/**
 * @typedef {Object} CompletedSync
 * @property {string} completed_sync_at The instant the flush that drained the queue finished.
 * @property {string|null} trigger      Which of the five opportunities it was, when known.
 * @property {string|null} device       Which device completed it.
 */

/**
 * Seal a completion, if — and only if — a real flush earned one.
 *
 * Accepts either a synchronisation report or a bare flush report, because both turn up at this
 * boundary and refusing one would push a caller into unwrapping by hand, which is exactly the kind of
 * hand-unwrapping this file exists to remove.
 *
 * A synchronisation report's own `completion` field is deliberately NOT trusted: it is plain data, so
 * a hand-built report could carry one. The flush inside it is re-tested instead, because only the
 * flush can hold the outbox's brand.
 *
 * @param {any} report
 * @returns {Readonly<CompletedSync>|null} Null whenever a completion was not genuinely earned —
 *   a best-effort flush, an interrupted one, one that stopped for any reason but a drained queue,
 *   one leaving anything undelivered, a pass with a failed step, or an object that never was a report.
 */
export function completionFrom(report) {
  if (!report || typeof report !== 'object') return null;

  // A pass that could not reach the service withholds its completion even if the queue drained
  // first: the queue may have emptied before the pull failed, and "backed up" would then quietly
  // mean "sent mine, never read yours". This mirrors the engine's own rule rather than restating it
  // differently, because two rules that must agree are two rules that will not.
  if (Array.isArray(report.failures) && report.failures.length > 0) return null;

  const flush = report.flush === undefined ? report : report.flush;
  const marker = syncCompletionMarker(flush);
  if (!marker) return null;

  const sealed = {
    completed_sync_at: marker.completed_sync_at,
    trigger: typeof report.trigger === 'string' ? report.trigger : null,
    device: typeof report.device === 'string' ? report.device : null,
  };
  Object.defineProperty(sealed, SEALED, {
    value: marker.completed_sync_at, enumerable: false, writable: false,
  });
  return Object.freeze(sealed);
}

/**
 * Is this the genuine article?
 * @param {unknown} value
 * @returns {boolean}
 */
export function isCompletedSync(value) {
  return Boolean(value)
    && typeof value === 'object'
    && /** @type {any} */ (value)[SEALED] === /** @type {any} */ (value).completed_sync_at;
}

/**
 * The instant to display, or null.
 *
 * The ONLY route from a value to the words "last backed up". A caller reading
 * `.completed_sync_at` off an unsealed object gets a string it made up itself; a caller coming
 * through here gets null, and the surface says so out loud.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function lastSyncedAt(value) {
  return isCompletedSync(value) ? /** @type {CompletedSync} */ (value).completed_sync_at : null;
}

/**
 * Persist a completion — and persist nothing at all when one was not earned.
 *
 * A pass that did not complete leaves the previous value exactly where it was. That is deliberate and
 * it is the honest behaviour in both directions: the last genuine backup really did happen at that
 * instant, and clearing it would tell the coach he has never backed up when he has, while advancing it
 * would tell him he is safe when he is not.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {any} report
 * @param {{now?: number|string|Date}} [options]
 * @returns {Promise<{recorded: boolean, completion: Readonly<CompletedSync>|null}>}
 */
export async function recordCompletedSync(store, report, options = {}) {
  const completion = completionFrom(report);
  if (!completion) return { recorded: false, completion: null };

  await store.setMeta(LAST_SYNC_META_KEY, {
    completed_sync_at: completion.completed_sync_at,
    trigger: completion.trigger,
    device: completion.device,
    recorded_at: timestamp(options.now),
  });
  return { recorded: true, completion };
}

/**
 * Read the last completion back, re-sealed.
 *
 * The shape is checked rather than assumed. A row that is present but malformed is NOT treated as an
 * absent one: an absence means "never backed up", which is a true and useful statement, whereas a
 * malformed row means something wrote a completion that this module did not, and that is a defect the
 * coach's data depends on somebody noticing. It comes back as `unverifiable`, and the surface turns
 * that into a reason in his own words.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @returns {Promise<{completion: Readonly<CompletedSync>|null, unverifiable: boolean}>}
 */
export async function readLastCompletedSync(store) {
  const row = await store.getMeta(LAST_SYNC_META_KEY);
  if (row === undefined || row === null) return { completion: null, unverifiable: false };

  const at = /** @type {any} */ (row).completed_sync_at;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) {
    return { completion: null, unverifiable: true };
  }

  const sealed = {
    completed_sync_at: at,
    trigger: typeof (/** @type {any} */ (row).trigger) === 'string' ? row.trigger : null,
    device: typeof (/** @type {any} */ (row).device) === 'string' ? row.device : null,
  };
  Object.defineProperty(sealed, SEALED, { value: at, enumerable: false, writable: false });
  return { completion: Object.freeze(sealed), unverifiable: false };
}

/**
 * How long ago, in milliseconds, or null when there has never been one.
 * @param {unknown} value @param {string} at
 * @returns {number|null}
 */
export function completionAgeMs(value, at) {
  const when = lastSyncedAt(value);
  if (!when) return null;
  const age = Date.parse(at) - Date.parse(when);
  return Number.isFinite(age) ? age : null;
}
