/**
 * THE CURVE — mapping a pattern's *k* intensity points across a routine's *n* exercises.
 *
 * A pattern is a shape, not a schedule: `low medium high low` says an easy opening, a build, the
 * hardest work at the peak and an easier close. It says nothing about how many exercises the coach's
 * routine holds. This module is the one place that gap is closed, and it is pure arithmetic over two
 * numbers and a rule name.
 *
 * ## The three rules, and why each exists
 *
 * | Rule | What it does | The shape it serves |
 * | --- | --- | --- |
 * | `stretch` | Each point covers a contiguous share of the positions | One climb or one arc across the whole session |
 * | `repeat-cycle` | The sequence repeats until the positions run out | Intervals: hard, easy, hard, easy, for as long as there is work |
 * | `hold-last` | The sequence plays once, then its final point holds | A short build into one long working block |
 *
 * ## More points than exercises is an ordinary case, and it is REPORTED
 *
 * A five-point curve on a three-exercise routine cannot express all five points. Under `stretch`
 * the arithmetic simply skips the points that no position lands on, and under `hold-last` the tail
 * of the sequence is never reached. Neither is an error and neither is silently swallowed:
 * `unused_points` names exactly which points the routine was too short to reach, and the curve
 * carries a sentence saying so. A coach who presses a four-point button on a two-exercise routine
 * and gets two levels deserves to be told why.
 *
 * No clock, no store, no randomness, no memory between calls.
 */

import { IntensityInputError } from './errors.js';

/** The mapping rules this module implements — mirrors `MAPPING_RULES` in the record model. */
export const MAPPING_RULES = Object.freeze(['stretch', 'repeat-cycle', 'hold-last']);

/**
 * @typedef {Object} Curve
 * @property {readonly string[]} sequence The pattern's own points, unchanged.
 * @property {string} mapping_rule
 * @property {readonly string[]} levels One intensity level per position, in position order.
 * @property {readonly number[]} unused_points Indices into `sequence` that no position reached.
 * @property {string} note One plain sentence for the coach.
 */

/**
 * Spread a sequence of intensity points across a number of positions.
 *
 * @param {readonly string[]} sequence The pattern's points, in order. At least one.
 * @param {number} positions How many exercises the routine holds. At least one.
 * @param {string} mappingRule One of {@link MAPPING_RULES}.
 * @returns {Curve} Frozen.
 */
export function spreadCurve(sequence, positions, mappingRule) {
  if (!Array.isArray(sequence) || sequence.length < 1) {
    throw new IntensityInputError('A pattern needs at least one intensity point.', { sequence });
  }
  if (!Number.isInteger(positions) || positions < 1) {
    throw new IntensityInputError('A curve needs at least one position to spread across.', { positions });
  }
  if (!MAPPING_RULES.includes(mappingRule)) {
    throw new IntensityInputError(
      `Unknown mapping rule "${mappingRule}". Known rules: ${MAPPING_RULES.join(', ')}.`,
      { mappingRule },
    );
  }

  const levels = [];
  for (let position = 0; position < positions; position += 1) {
    levels.push(sequence[pointIndexFor(position, positions, sequence.length, mappingRule)]);
  }

  const reached = new Set();
  for (let position = 0; position < positions; position += 1) {
    reached.add(pointIndexFor(position, positions, sequence.length, mappingRule));
  }
  const unusedPoints = [];
  for (let point = 0; point < sequence.length; point += 1) {
    if (!reached.has(point)) unusedPoints.push(point);
  }

  return Object.freeze({
    sequence: Object.freeze([...sequence]),
    mapping_rule: mappingRule,
    levels: Object.freeze(levels),
    unused_points: Object.freeze(unusedPoints),
    note: describeSpread(sequence.length, positions, mappingRule, unusedPoints),
  });
}

/**
 * Which point of the sequence a given position takes its level from.
 *
 * `stretch` uses `floor(position * k / n)`, which is monotonic in position and needs no special
 * case for either direction: with more positions than points each point covers a contiguous run,
 * and with fewer it lands on a subset in order. That single expression is why this function has no
 * branch for the short-routine case — the case that would otherwise be forgotten.
 *
 * @param {number} position @param {number} positions @param {number} pointCount @param {string} rule
 * @returns {number}
 */
function pointIndexFor(position, positions, pointCount, rule) {
  if (rule === 'repeat-cycle') return position % pointCount;
  if (rule === 'hold-last') return Math.min(position, pointCount - 1);
  return Math.floor((position * pointCount) / positions);
}

/**
 * One sentence describing how the curve met the routine. Written for the coach, so it names
 * exercises and points rather than indices and rules.
 *
 * @param {number} pointCount @param {number} positions @param {string} rule
 * @param {readonly number[]} unusedPoints
 * @returns {string}
 */
function describeSpread(pointCount, positions, rule, unusedPoints) {
  const points = `${pointCount} ${pointCount === 1 ? 'point' : 'points'}`;
  const exercises = `${positions} ${positions === 1 ? 'exercise' : 'exercises'}`;
  const shortfall = unusedPoints.length === 0
    ? ''
    : ` This routine is too short to reach ${unusedPoints.length === 1 ? 'point' : 'points'} `
      + `${unusedPoints.map((index) => index + 1).join(' and ')} of the curve.`;

  if (rule === 'repeat-cycle') {
    return `The curve's ${points} repeat in order across ${exercises}.${shortfall}`;
  }
  if (rule === 'hold-last') {
    const remaining = positions - pointCount;
    const tail = remaining > 0
      ? ` and its final point then holds for the remaining ${remaining} ${remaining === 1 ? 'exercise' : 'exercises'}`
      : '';
    return `The curve's ${points} play once in order across ${exercises}${tail}.${shortfall}`;
  }
  return `The curve's ${points} are spread evenly across ${exercises}.${shortfall}`;
}
