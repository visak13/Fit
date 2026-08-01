/**
 * THE ESCALATION LADDER, AND ITS CEILING.
 *
 * The standard this exists to serve, in the user's own words: the app takes accountability for the
 * data, a real professional will use it, his pay depends on it, and if a synchronisation does not
 * happen the app must highlight that. So there is a ladder, and it climbs.
 *
 * ## The ceiling is the load-bearing part, not the rungs
 *
 * An earlier design had a blocking prompt at seventy-two hours. It was REMOVED, and it must not come
 * back in any form. An application that refuses to open loses the very session it was trying to
 * protect, and it contradicts the standing principle that the app is a supporting role and not the
 * driver. **A persistent, unmissable warning recurring on every screen is the MAXIMUM escalation, and
 * the application always works.**
 *
 * That is enforced here rather than remembered: every rung declares `blocks: false`, the ladder's top
 * rung is the persistent warning, and a test asserts both — for every level, and for every state the
 * surface can produce. A rung that blocked would have to be added by hand, in the open, against a
 * failing test.
 *
 * ## Why the rungs are named rather than numbered, and coloured nowhere
 *
 * The interface owns colour. This module owns meaning. `severely_overdue` reads the same to the
 * screen that renders a red banner, to a test asserting the derivation, and to whoever reads the
 * evidence in a year; `3` reads as nothing to any of them, and `red` would put a rendering decision
 * in the state layer. `rank` exists beside the name purely so two levels can be COMPARED, which is
 * what "the worst of these conditions" needs and what a name alone cannot do.
 *
 * ## Where the thresholds come from
 *
 * Six hours amber, twenty-four hours red, seventy-two hours the persistent warning. These are the
 * user's own recorded figures, not invented ones, and they are exported so that the notes, the
 * interface and the tests all quote the same numbers rather than three copies that drift.
 */

/**
 * The rungs, worst last.
 *
 * - `up_to_date`        — everything is in the backup, and a real synchronisation put it there.
 * - `not_backed_up`     — something is not in the backup yet. Ordinary; not yet a fault.
 * - `overdue`           — it has been waiting long enough to say so plainly.
 * - `severely_overdue`  — long enough that it should be uncomfortable to look at.
 * - `persistent_warning`— the ceiling. Unmissable, on every screen, and the app still opens.
 */
export const LEVEL = Object.freeze({
  UP_TO_DATE: 'up_to_date',
  NOT_BACKED_UP: 'not_backed_up',
  OVERDUE: 'overdue',
  SEVERELY_OVERDUE: 'severely_overdue',
  PERSISTENT_WARNING: 'persistent_warning',
});

/** @type {readonly string[]} Worst last. The order IS the ladder. */
export const LEVEL_ORDER = Object.freeze([
  LEVEL.UP_TO_DATE,
  LEVEL.NOT_BACKED_UP,
  LEVEL.OVERDUE,
  LEVEL.SEVERELY_OVERDUE,
  LEVEL.PERSISTENT_WARNING,
]);

/** Amber. The user's figure. */
export const OVERDUE_MS = 6 * 60 * 60_000;
/** Red. The user's figure. */
export const SEVERELY_OVERDUE_MS = 24 * 60 * 60_000;
/** The ceiling. The user's figure, and the point at which the removed blocking prompt used to sit. */
export const PERSISTENT_WARNING_MS = 72 * 60 * 60_000;

/**
 * What each rung means, in the words the interface may use, and what it may do.
 *
 * `blocks` is false on every rung and there is no rung on which it is true. It is present rather
 * than absent because an absent field is indistinguishable from an oversight to the next editor,
 * and a test asserts the value on every rung — which is what makes "sync never blocks" a property
 * of the data rather than a paragraph in a document.
 *
 * @type {Readonly<Record<string, Readonly<{rank: number, blocks: boolean, persistent: boolean, summary: string}>>>}
 */
export const LEVELS = Object.freeze(Object.fromEntries(LEVEL_ORDER.map((name, rank) => [name, Object.freeze({
  rank,
  blocks: false,
  persistent: name === LEVEL.PERSISTENT_WARNING,
  summary: {
    [LEVEL.UP_TO_DATE]: 'Everything is backed up.',
    [LEVEL.NOT_BACKED_UP]: 'Some changes are saved on this device but not backed up yet.',
    [LEVEL.OVERDUE]: 'Changes have not been backed up for several hours.',
    [LEVEL.SEVERELY_OVERDUE]: 'Changes have not been backed up for more than a day.',
    [LEVEL.PERSISTENT_WARNING]: 'Changes have not been backed up for more than three days. Open a connection and back up.',
  }[name],
})])));

/** The worst rung there is. There is nothing above it, and nothing above it blocks either. */
export const MAX_LEVEL = LEVEL.PERSISTENT_WARNING;

/**
 * The rung's position on the ladder. Unknown names sit at the bottom rather than throwing: this
 * module is read by a status line, and a status line that throws is a status line that vanishes.
 * @param {string} level @returns {number}
 */
export function rankOf(level) {
  return LEVELS[level] ? LEVELS[level].rank : 0;
}

/**
 * The worse of two rungs.
 * @param {string} a @param {string} b @returns {string}
 */
export function worse(a, b) {
  return rankOf(a) >= rankOf(b) ? a : b;
}

/**
 * The rung an age alone earns.
 *
 * @param {number|null} ageMs How long the oldest thing not in the backup has been waiting.
 * @returns {string}
 */
export function levelForAge(ageMs) {
  if (ageMs === null || ageMs === undefined || !Number.isFinite(ageMs)) return LEVEL.NOT_BACKED_UP;
  if (ageMs >= PERSISTENT_WARNING_MS) return LEVEL.PERSISTENT_WARNING;
  if (ageMs >= SEVERELY_OVERDUE_MS) return LEVEL.SEVERELY_OVERDUE;
  if (ageMs >= OVERDUE_MS) return LEVEL.OVERDUE;
  return LEVEL.NOT_BACKED_UP;
}

/**
 * The rung, derived from the three figures the coach is shown.
 *
 * ## Two deliberate decisions, both of which read as odd until the reason is stated
 *
 * **A stopped entry floors the level at `overdue` immediately.** A rejected or ambiguous entry is
 * data that will NEVER reach the backup without a person, so the passage of time does not heal it and
 * an age-only ladder would report it as fresh and harmless for its first six hours. Time is the wrong
 * measure for something that is not waiting for time. It is a FLOOR and not a ceiling: a stopped entry
 * still ages, and the age it is measured on is `oldest_undelivered_age_ms`, which spans everything not
 * in the backup rather than only the entries still being attempted. Measuring the ladder on the
 * pending ones alone would park a refused entry at `overdue` for ever, so a queue holding nothing but
 * a three-day-old refusal — data the coach has not backed up since Tuesday — would never reach the
 * persistent warning. The escalation must follow the DATA, not the retry.
 *
 * **An expired credential floors NOTHING.** It is the one condition with an action attached — a tap —
 * and presenting it as a fault teaches the coach to ignore the indicator, which is the failure this
 * whole surface exists to prevent. It is said loudly in the REASON instead, where it belongs, and the
 * age ladder continues to climb underneath it exactly as it would otherwise. That is not the same as
 * treating it lightly: `reasons.js` reports it as a QUEUE-WIDE stop, because it is one.
 *
 * **A record that has not reached the QUEUE yet is not backed up either, and that is the third
 * figure.** The queue can only answer what was queued, and a record enters it during a pass's push
 * step — so between the coach saving something and the next pass, the queue is empty, every figure
 * above reads clean, and `up_to_date` was returned about work that is on one device and nowhere else.
 * Measured on the real application, with the indicator still saying everything is backed up
 * thirty-six seconds after the write, and the next automatic opportunity up to fifteen minutes away.
 * `work_not_in_the_backup` is answered from the STORE (`on-this-device.js`), which is the only place
 * that fact exists before a pass runs.
 *
 * @param {{undelivered: number, needs_attention: number, oldest_undelivered_age_ms?: number|null,
 *          oldest_pending_age_ms?: number|null, never_synchronised: boolean,
 *          work_not_in_the_backup?: boolean}} figures
 *   `oldest_undelivered_age_ms` spans everything not in the backup, stopped entries included, and is
 *   what the ladder climbs on. `oldest_pending_age_ms` is accepted as a fallback for a caller that has
 *   only the queue's own figure to hand.
 * @returns {string} One of {@link LEVEL_ORDER}.
 */
export function deriveLevel(figures) {
  const {
    undelivered = 0, needs_attention: needsAttention = 0,
    oldest_pending_age_ms: oldestPendingAgeMs = null, never_synchronised: neverSynchronised = false,
    work_not_in_the_backup: workNotInTheBackup = false,
  } = figures || {};
  const oldestAgeMs = figures?.oldest_undelivered_age_ms ?? oldestPendingAgeMs;
  const outstanding = undelivered === 0 && needsAttention === 0 && !workNotInTheBackup;

  // Nothing is outstanding and a real synchronisation has happened. The only rung that may say so.
  if (outstanding && !neverSynchronised) return LEVEL.UP_TO_DATE;

  // Nothing is outstanding, but this installation has never completed a synchronisation. Not a
  // fault and not up to date either: there is no backup yet, and saying "everything is backed up"
  // would be the single most dangerous sentence this surface could produce.
  if (outstanding) return LEVEL.NOT_BACKED_UP;

  let level = levelForAge(oldestAgeMs);
  if (needsAttention > 0) level = worse(level, LEVEL.OVERDUE);
  return level;
}
