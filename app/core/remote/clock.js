/**
 * THE CLOCK, injected rather than reached for.
 *
 * The remote port has to model a SLOW call, and a slow call is only useful to a test that can
 * control it. If the double reached for `Date.now()` and `setTimeout` directly, then
 * proving "a call that takes forty seconds against a thirty second timeout fails" would mean
 * a test that genuinely takes forty seconds, which nobody runs, which means it stops being
 * run at all.
 *
 * So time enters through this one seam. {@link systemClock} is what the application uses.
 * {@link manualClock} advances virtual time instantly and is what the tests use, which makes
 * a timeout an ordinary deterministic assertion rather than a stopwatch.
 *
 * A clock is two functions and nothing more:
 *   - `now()`   — milliseconds since the epoch, for stamping a modification time.
 *   - `sleep(ms)` — resolves after `ms` has passed, however this clock defines passing.
 */

/**
 * @typedef {Object} Clock
 * @property {() => number} now Milliseconds since the epoch.
 * @property {(ms: number) => Promise<void>} sleep Resolve once `ms` has elapsed.
 */

/**
 * Real time. Used by the application.
 * @returns {Clock}
 */
export function systemClock() {
  return {
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => { setTimeout(resolve, ms); }),
  };
}

/**
 * Virtual time. Used by tests.
 *
 * `sleep` returns on the next microtask having moved the clock forward, so a simulated
 * forty-second call costs a test nothing. `advance` moves time without a sleeper, for when a
 * test wants two writes to carry different modification times.
 *
 * @param {number|string|Date} [start] The instant this clock begins at.
 * @returns {Clock & {advance: (ms: number) => void}}
 */
export function manualClock(start = '2026-07-25T00:00:00.000Z') {
  let t = new Date(start).getTime();
  return {
    now: () => t,
    sleep: async (ms) => { t += ms; },
    advance: (ms) => { t += ms; },
  };
}
