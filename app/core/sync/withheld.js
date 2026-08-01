/**
 * WHAT DISQUALIFIES A PASS FROM SAYING "EVERYTHING IS BACKED UP" — asked once, answered here.
 *
 * ## Why this is a module and not two `if` statements
 *
 * There are two places that must reach the same verdict about the same pass: `core/sync/engine.js`,
 * which decides whether the report it returns carries a completion, and
 * `core/status/completion.js`, which re-derives the verdict rather than trusting the report's own
 * `completion` field — deliberately, because that field is plain data and a hand-built report could
 * carry one. Two derivations that must agree are two derivations that will not: `completion.js` said
 * as much in a comment while restating the engine's rule in its own words, which is precisely the
 * arrangement in which one of them later grows a clause the other does not. This is that clause.
 *
 * So the question is asked in ONE place and both callers ask it. A future third condition is added
 * here, once, and cannot be added to one side of the application and not the other.
 *
 * ## The two conditions, and why the second one is not obviously the same as the first
 *
 * **A step could not reach the service.** The queue may have drained before the pull failed, and
 * "backed up" would then quietly mean "sent mine, never read yours". This is the original rule and it
 * is unchanged.
 *
 * **A file in the space could not be read.** This is the same class of fact and it earned the same
 * treatment the hard way. `payload.js` refuses a document whose version is not this application's;
 * `areas.js` catches that refusal PER FILE, records it in `unreadable` and carries on, which is right
 * — one bad file must not stop a phone from backing up anything at all. But an unreadable file was
 * not a `failure`, so the pass reported a clean completion. The coach has two installations that
 * update at different times; the older one pulls, finds every file the newer one wrote undecodable,
 * skips all of them, advances last-synced and shows green while holding NONE of the newer device's
 * work. Nothing errors anywhere. That is worse than never having synchronised, because never having
 * synchronised at least looks broken.
 *
 * A pass holding none of the other device's work has not earned the one value permitted to say
 * everything is backed up. It is withheld, exactly as an unreachable service withholds it.
 *
 * ## What this deliberately does NOT do
 *
 * It does not fail the pass, throw, or block anything. The push still happened, the queue still
 * drained, the readable files were still applied, and the application still opens. The only thing
 * taken away is the CLAIM — and, because `core/status/completion.js` persists nothing when there is
 * no completion, the last-synced time stays where it was rather than advancing over a pass that did
 * not deserve it.
 */

/**
 * The conditions under which a pass may not claim a completion. Declared as data so the list is
 * testable and so that adding a third is a visible change rather than a condition buried in a branch.
 */
export const WITHHELD = Object.freeze({
  STEP_FAILED: 'step_failed',
  RECORDS_REFUSED: 'records_refused',
  FILES_SKIPPED: 'files_skipped',
});

/** @type {readonly string[]} */
export const WITHHELD_VALUES = Object.freeze(Object.values(WITHHELD));

/**
 * Why this pass may not say everything is backed up — or null when it may.
 *
 * Accepts a synchronisation report, and tolerates a bare flush report: a flush carries neither
 * `failures` nor `unreadable`, so neither condition can be met and the verdict is null. That is the
 * honest answer for it — a flush is not a pass and has no opinion about files it never read — and it
 * keeps `core/status/completion.js` able to take either at its boundary without unwrapping by hand.
 *
 * @param {any} report
 * @returns {Readonly<{code: string, skipped: number, newer_version: number}>|null}
 *   `skipped` is how many files were passed over and `newer_version` how many of those a newer
 *   version of this application had written. Both are zero for a failed step, so a caller reading the
 *   figures never has to ask which condition it was holding.
 */
export function completionWithheldBy(report) {
  if (!report || typeof report !== 'object') return null;

  const skipped = skippedFiles(report);
  const newerVersion = skipped.filter((file) => file?.written_by_newer_version === true).length;

  // A failed step is reported first when both are true. It is the broader fact — the service could
  // not be reached at all — and the surface shows every reason it derives anyway, so nothing is lost
  // by ordering them.
  if (Array.isArray(report.failures) && report.failures.length > 0) {
    return Object.freeze({ code: WITHHELD.STEP_FAILED, skipped: 0, newer_version: 0 });
  }
  // A record the local store would not take is the same class of fact as a file that could not be
  // read, and it is reported ABOVE it because it is the more definite one: a skipped file may hold
  // nothing this device is missing, whereas a refused record is a named record that arrived, was
  // examined, and is not here.
  if (refusedApplies(report).length > 0) {
    return Object.freeze({ code: WITHHELD.RECORDS_REFUSED, skipped: 0, newer_version: 0 });
  }
  if (skipped.length > 0) {
    return Object.freeze({
      code: WITHHELD.FILES_SKIPPED, skipped: skipped.length, newer_version: newerVersion,
    });
  }
  return null;
}

/**
 * Every record the pull could not write, out of a report that has a pull in it.
 *
 * Read through a function of its own, exactly as `skippedFiles` is, so that the withholding and the
 * accountability surface ask the same question of the same field rather than each reaching into the
 * report's shape — which is how the two derivations drift, and this module exists because they do.
 *
 * A flush report has no pull, so it has nothing to refuse and answers with an empty list. That is the
 * honest answer for it rather than a missing one.
 *
 * @param {any} report
 * @returns {import('./engine.js').RefusedApply[]}
 */
export function refusedApplies(report) {
  const refused = report?.pulled?.refused;
  return Array.isArray(refused) ? refused : [];
}

/**
 * Every file a pass met and did not take in, from both of the doors it can arrive through.
 *
 * There are TWO, and only one of them was ever watched. A file whose DOCUMENT this build cannot
 * decode lands in `unreadable`; a file whose NAME this build cannot place lands in `unplaceable`,
 * and that one is reached by an ordinary additive change rather than a document version bump — a
 * newer build adding a third kind of area file writes names this one groups as unrecognised. The
 * coach cannot tell the two apart and should not have to: in both, work of his is in the backup and
 * is not on this device.
 *
 * Exported because the surface counts the same two lists when it composes his sentence, and a second
 * place that decided which lists count would be the same drift this module exists to prevent.
 *
 * @param {any} report
 * @returns {{name?: string, written_by_newer_version?: boolean}[]}
 */
export function skippedFiles(report) {
  const unreadable = Array.isArray(report?.unreadable) ? report.unreadable : [];
  const unplaceable = Array.isArray(report?.unplaceable) ? report.unplaceable : [];
  return [...unreadable, ...unplaceable];
}
