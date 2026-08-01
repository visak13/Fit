/**
 * WHAT THE TEST DOUBLE STILL OWES THE EVENT LOOP.
 *
 * `settle()` in `platform-double.js` used to drain a FIXED FOUR event-loop turns, which is a guard
 * pinned to a snapshot: four was sufficient on a quiet machine, and work needing a fifth was left
 * unsettled with nothing said. A test that proceeds on unsettled state produces a green whose
 * meaning nobody can recover.
 *
 * Draining until QUIESCENT needs a signal, and a turn count is not one — it is exactly the
 * diagnosis-free timeout the fixed count already was. So the doubles register the work they
 * schedule here, and release it when it runs. Quiescence is then a fact that can be read rather
 * than a duration that can be guessed, and when the drain gives up it can name what was still owed
 * instead of printing a number of turns.
 *
 * ## Which schedulers register here, named rather than promised
 *
 * Three, and this list is enumerated deliberately: a sentence claiming *every* scheduled task is
 * tracked would be read as ground truth by the next person and is not enforced by anything.
 *
 *  - `fake-indexeddb.js`'s `nextTask` — database opens and deletes, transaction commit checks, and
 *    the retry of an upgrade blocked by another connection.
 *  - `fake-locks.js`'s channel delivery — a message posted to a peer window.
 *  - Nothing else. In particular the DRAIN'S OWN turn timer in `platform-double.js` deliberately
 *    does NOT register: a drain that counted itself as outstanding work would never observe
 *    quiescence.
 *
 * A scheduler added to this directory later and not registered here is invisible to the drain, and
 * the drain will report quiescence while that work is still owed. That is the failure mode of this
 * module and it is worth knowing about rather than discovering.
 *
 * ## A task that THROWS still releases
 *
 * The release is in a `finally`, so work that fails is no longer outstanding. That is right for
 * QUIESCENCE — the question is whether work is still owed, not whether it succeeded — and it means
 * the give-up message names work that never RAN, never work that ran and threw. A throwing timer
 * callback is not hidden by this: it becomes an uncaught exception and takes the test process down
 * loudly, which is a louder signal than anything this module could add.
 */

/**
 * Work scheduled and not yet run, counted per label. A label is a short human phrase, because it is
 * read in a failure message by someone who wants a diagnosis rather than a symptom.
 *
 * @type {Map<string, number>}
 */
const outstanding = new Map();

/** @param {string} label */
function release(label) {
  const owed = outstanding.get(label) || 0;
  if (owed <= 1) outstanding.delete(label);
  else outstanding.set(label, owed - 1);
}

/**
 * Run `fn` on a fresh event-loop task, and remember that it is owed until it has run.
 *
 * @param {string} label what the task is, in words, for the give-up message
 * @param {() => void} fn
 * @returns {ReturnType<typeof setTimeout>}
 */
export function trackedTask(label, fn) {
  outstanding.set(label, (outstanding.get(label) || 0) + 1);
  return setTimeout(() => {
    try {
      fn();
    } finally {
      release(label);
    }
  }, 0);
}

/**
 * Work scheduled and not yet run, worst first.
 *
 * @returns {Array<{label: string, count: number}>}
 */
export function outstandingWork() {
  return Array.from(outstanding.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * The outstanding work as a sentence fragment for a failure message.
 *
 * @returns {string}
 */
export function describeOutstandingWork() {
  const work = outstandingWork();
  if (work.length === 0) return 'nothing';
  return work.map(({ label, count }) => `${count} × ${label}`).join(', ');
}
