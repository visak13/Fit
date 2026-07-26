/**
 * THE INTENSITY ADAPTER'S ERROR TAXONOMY.
 *
 * There is exactly one error class here, and the reason is the same reason the module is small:
 * this package computes, it does not act. Nothing it touches can be half-written, so there is no
 * partial-failure state to name. Either the arguments describe a routine, a curve, a catalogue and
 * an optional history well enough to shape a session, or they do not.
 *
 * Two rules, inherited from the session layer and kept deliberately:
 *
 *  1. **A malformed ARGUMENT throws.** A caller that passed the wrong shape has a defect, and
 *     returning a hollow proposal would hide it behind numbers that look measured.
 *  2. **An ordinary state is NOT an error.** A client with no history, a curve the routine cannot
 *     fill, a catalogue with nothing left at a level — all three are ordinary, expected states and
 *     all three are reported as VALUES on the proposal, in the coach's own terms. None of them
 *     throws. Confusing the two would turn a normal Tuesday into a screen that reads as broken.
 *
 * Messages are written to be read by the person who called this, who is another module rather than
 * the coach; the coach's own words live on the proposal.
 */

/** The arguments do not describe something a session can be shaped from. */
export class IntensityInputError extends Error {
  /** @param {string} message @param {Record<string, unknown>} [detail] */
  constructor(message, detail = {}) {
    super(message);
    this.name = new.target.name;
    this.detail = detail;
  }
}
