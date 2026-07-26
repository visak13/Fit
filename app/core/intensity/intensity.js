/**
 * THE INTENSITY ADAPTER — the module entry point for code. `index.js` beside it is the test entry
 * point and nothing else.
 *
 * ```js
 * import { proposeSession } from './core/intensity/intensity.js';
 *
 * const proposal = proposeSession({
 *   pattern,                       // an intensity-pattern record: the curve he pressed
 *   routine,                       // the routine record he is running
 *   catalogue: allExercises,       // the WHOLE library, not the routine's own list
 *   history,                       // this client's recent performed records, or null
 *   variation: { rotate: 0 },      // which of several equally good substitutes to prefer
 * });
 * ```
 *
 * Read `INTENSITY.md` in this directory before changing anything here. The two sentences that matter
 * most, restated so they cannot be missed by someone who only reads this file:
 *
 *  - **It proposes and the coach disposes.** This module returns a frozen description. It applies
 *    nothing, saves nothing, and exports no verb that would. Nothing here opens a store.
 *  - **It never asks for anything harder than both the coach's own library and the client's own
 *    record.** It has no third source, so it has no number of its own to raise. It prescribes no
 *    load at any point: harder means more work and less rest, which is the same rule the shipped
 *    library is validated against.
 *
 * Pure: same arguments, same proposal. No clock, no store, no randomness, no memory between calls.
 */

import { readBaseline } from './baseline.js';
import { assembleProposal, readArguments } from './proposal.js';

export { IntensityInputError } from './errors.js';
export { MAPPING_RULES, spreadCurve } from './curve.js';
export { CALIBRATABLE_LEVELS, readBaseline } from './baseline.js';
export {
  BOUNDS, NEVER_GUESSES_A_LEVEL, PROPOSES_NO_LOAD, scaleToLevel, workUnitOf,
} from './effort.js';
export { INTENSITY_LADDER } from './placement.js';
export { PROPOSAL_KIND } from './proposal.js';
export {
  findEmoji, findWords, humanSentencesOf, LOAD_WORDS, namesIn, PROGRESSION_WORDS,
} from './words.js';

/**
 * Shape a complete session to an intensity curve: reorder the exercises, scale the effort, and say
 * what it did and what it could not do.
 *
 * @param {Object} request
 * @param {Record<string, any>} request.pattern The intensity-pattern record the coach pressed.
 * @param {Record<string, any>} request.routine The routine record being run.
 * @param {readonly Record<string, any>[]|Readonly<Record<string, Record<string, any>>>} request.catalogue
 *   The whole exercise library, as a list or keyed by id. Drawn from in full: an exercise no routine
 *   references is the substitution pool, not dead data, and nothing here prunes it.
 * @param {null|{client_id?: string|null,
 *   window?: {from?: string|null, to?: string|null, session_count?: number|null},
 *   performed?: readonly Record<string, any>[]}} [request.history]
 *   This client's recent performed records, chosen by the caller. Null or absent is an ordinary
 *   case: the proposal then comes from the library and says so.
 * @param {{rotate?: number}} [request.variation] Which of several equally good catalogue substitutes
 *   to prefer. An argument rather than a random draw, so the same request always shapes the same
 *   session.
 * @returns {import('./proposal.js').Proposal} Deep-frozen. Nothing has been applied or saved.
 */
export function proposeSession({ pattern, routine, catalogue, history = null, variation = {} }) {
  const keyed = readArguments(pattern, routine, catalogue);
  const baseline = readBaseline(history);
  return assembleProposal(pattern, routine, keyed, baseline, variation);
}
