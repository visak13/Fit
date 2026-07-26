/**
 * THE CURVE spreads a pattern's points across a routine's exercises, and says what it could not
 * reach.
 *
 * The interesting case is the one nobody presses on purpose: a five-point curve on a two-exercise
 * routine. The arithmetic handles it without a branch, and the point of these tests is that it is
 * REPORTED rather than quietly delivering two of five points as though that were the whole shape.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { MAPPING_RULES, spreadCurve } from './curve.js';
import { IntensityInputError } from './errors.js';

test('STRETCH: four points across eight exercises gives each point two positions', () => {
  const curve = spreadCurve(['low', 'medium', 'high', 'low'], 8, 'stretch');

  assert.deepEqual([...curve.levels],
    ['low', 'low', 'medium', 'medium', 'high', 'high', 'low', 'low']);
  assert.deepEqual([...curve.unused_points], []);
  assert.equal(curve.note, "The curve's 4 points are spread evenly across 8 exercises.");
});

test('STRETCH: three points across eight does not divide evenly, and lands in order anyway', () => {
  const curve = spreadCurve(['low', 'medium', 'high'], 8, 'stretch');

  // Eight positions over three points: three, three and two. The remainder lands on the LAST point
  // rather than the first, which is what keeps the shape climbing rather than doubling back.
  assert.deepEqual([...curve.levels],
    ['low', 'low', 'low', 'medium', 'medium', 'medium', 'high', 'high']);
  // Monotonic: the curve never goes back down a point it has left. That is what makes it a shape.
  const indices = curve.levels.map((level) => ['low', 'medium', 'high'].indexOf(level));
  assert.deepEqual(indices, [...indices].sort((a, b) => a - b));
});

test('REPEAT-CYCLE: hard, easy, hard, easy, for as long as there is work', () => {
  const curve = spreadCurve(['high', 'low'], 5, 'repeat-cycle');

  assert.deepEqual([...curve.levels], ['high', 'low', 'high', 'low', 'high']);
  assert.deepEqual([...curve.unused_points], []);
  assert.equal(curve.note, "The curve's 2 points repeat in order across 5 exercises.");
});

test('HOLD-LAST: the sequence plays once and its final point holds the remainder', () => {
  const curve = spreadCurve(['low', 'medium', 'high'], 6, 'hold-last');

  assert.deepEqual([...curve.levels], ['low', 'medium', 'high', 'high', 'high', 'high']);
  assert.equal(curve.note,
    "The curve's 3 points play once in order across 6 exercises and its final point then holds for the remaining 3 exercises.");
});

test('a routine too short for the curve REPORTS the points it could not reach', () => {
  const curve = spreadCurve(['low', 'medium', 'high', 'medium', 'high'], 2, 'stretch');

  assert.equal(curve.levels.length, 2, 'two exercises, two positions — never a longer session than the routine');
  assert.deepEqual([...curve.unused_points], [1, 3, 4]);
  assert.ok(curve.note.includes('too short to reach points 2 and 4 and 5'),
    `the coach is told which points went unreached: ${curve.note}`);

  // NON-VACUITY: the same assertion on a routine long enough must come back with nothing unreached,
  // or the check above would pass on a curve that always reports a shortfall.
  const enough = spreadCurve(['low', 'medium', 'high', 'medium', 'high'], 5, 'stretch');
  assert.deepEqual([...enough.unused_points], []);
  assert.ok(!enough.note.includes('too short'));
});

test('HOLD-LAST on a short routine also names the tail it never played', () => {
  const curve = spreadCurve(['low', 'medium', 'high'], 2, 'hold-last');

  assert.deepEqual([...curve.levels], ['low', 'medium']);
  assert.deepEqual([...curve.unused_points], [2]);
  assert.ok(curve.note.includes('too short to reach point 3'), curve.note);
});

test('a curve is frozen, and the same request always spreads the same way', () => {
  const once = spreadCurve(['low', 'high'], 5, 'repeat-cycle');
  const twice = spreadCurve(['low', 'high'], 5, 'repeat-cycle');

  assert.deepEqual(once, twice);
  assert.ok(Object.isFrozen(once) && Object.isFrozen(once.levels));
  assert.throws(() => { /** @type {any} */ (once).levels[0] = 'high'; }, TypeError,
    'a curve is a description to read, not a structure to edit');
});

test('a malformed request is refused by name rather than producing a hollow curve', () => {
  assert.throws(() => spreadCurve([], 3, 'stretch'), IntensityInputError);
  assert.throws(() => spreadCurve(['low'], 0, 'stretch'), IntensityInputError);
  assert.throws(() => spreadCurve(['low'], 2, 'shuffle'), (error) => {
    assert.ok(error instanceof IntensityInputError);
    assert.ok(error.message.includes(MAPPING_RULES.join(', ')), 'the message names the rules that do exist');
    return true;
  });
});
