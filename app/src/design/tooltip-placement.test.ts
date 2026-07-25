/**
 * WHERE A TOOLTIP OPENS, PROVED RATHER THAN LOOKED AT.
 *
 * The two failures this arithmetic exists to prevent are both invisible on the screen you happen to
 * be developing on. A bubble runs off the edge only at a width you are not sitting at, and it covers
 * its own target only when the target is near an edge you did not try. Both are certain to happen to
 * the coach, on a phone, mid-session, and neither is something he could report usefully.
 *
 * So the last two suites do not test cases. They assert the INVARIANTS over a sweep of targets
 * across two real viewports: whatever is chosen is inside the screen, and whatever is chosen does
 * not overlap the control it is describing. A case-by-case test passes for the cases somebody
 * thought of, which is exactly the set that was never the problem.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Box } from './tooltip-placement.ts';
import { placeTooltip } from './tooltip-placement.ts';
import { EXPANDED_VIEWPORT_MIN } from './viewport.ts';

const LAPTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const GAP = 8;
const MARGIN = 8;

/** A bubble of the size the token layer's cap allows, which is the worst case for fitting. */
const BUBBLE = { width: 300, height: 96 };

const place = (target: Box, viewport: { width: number; height: number }, bubble = BUBBLE) =>
  placeTooltip({ target, bubble, viewport, gap: GAP, margin: MARGIN });

/** A rail destination: the most common trigger in the application. */
const railTarget: Box = { left: 8, top: 200, width: 60, height: 60 };

describe('which side a tooltip opens on', () => {
  it('opens to the RIGHT of a rail destination on a laptop', () => {
    assert.equal(place(railTarget, LAPTOP).side, 'right');
  });

  it('opens BELOW on a phone, where there is no room beside anything', () => {
    assert.equal(place({ left: 8, top: 100, width: 44, height: 44 }, PHONE).side, 'below');
  });

  it('opens below on a window too narrow for the rail, however much room is beside the target', () => {
    // The right-hand side is a laptop affordance because the rail is: below one destination is on
    // top of the next. At this width the destinations are along the bottom instead.
    const narrow = { width: EXPANDED_VIEWPORT_MIN - 1, height: 900 };
    assert.equal(place({ left: 8, top: 100, width: 44, height: 44 }, narrow).side, 'below');
  });

  it('falls back rather than opening off the screen when the target is near the right edge', () => {
    const nearEdge: Box = { left: LAPTOP.width - 100, top: 200, width: 44, height: 44 };
    assert.equal(place(nearEdge, LAPTOP).side, 'below');
  });

  it('opens ABOVE when the target is at the bottom and the bubble would not fit below it', () => {
    const atFoot: Box = { left: 20, top: PHONE.height - 60, width: 44, height: 44 };
    assert.equal(place(atFoot, PHONE).side, 'above');
  });
});

describe('the room it is allowed to take', () => {
  it('caps a bubble to the room on the side it chose rather than letting it overflow', () => {
    // A phone, a target near the top, and more text than fits below it. The bubble scrolls; it does
    // not run past the bottom of the screen and it does not climb back over the target.
    const target: Box = { left: 20, top: 60, width: 44, height: 44 };
    const tall = { width: 240, height: 900 };
    const placement = place(target, PHONE, tall);

    assert.equal(placement.side, 'below');
    assert.ok(placement.top >= target.top + target.height, 'it climbed back over its target');
    assert.ok(placement.top + placement.maxHeight <= PHONE.height - MARGIN, 'it runs off the bottom');
  });

  it('takes the roomier side when the bubble fits on neither', () => {
    // Below has 184px and above has 584px. Choosing below and capping to it would be honest and
    // nearly useless; the point of the cap is that it does not have to choose the smaller side.
    const target: Box = { left: 20, top: 600, width: 44, height: 44 };
    const placement = place(target, PHONE, { width: 240, height: 900 });

    assert.equal(placement.side, 'above');
    assert.ok(placement.top >= MARGIN, 'it runs off the top');
    assert.ok(placement.top + placement.maxHeight <= target.top, 'it covers its target');
  });

  it('never reports negative room', () => {
    const target: Box = { left: 0, top: PHONE.height - 4, width: 44, height: 44 };
    assert.ok(place(target, PHONE).maxHeight >= 0);
  });
});

describe('the two invariants, over every position a target can be in', () => {
  /** Targets swept across the whole viewport, including the corners and past the edges. */
  function* targets(viewport: { width: number; height: number }): Generator<Box> {
    for (let left = -20; left <= viewport.width; left += 37) {
      for (let top = -20; top <= viewport.height; top += 41) {
        yield { left, top, width: 44, height: 44 };
      }
    }
  }

  for (const [name, viewport] of [
    ['a laptop', LAPTOP],
    ['a phone', PHONE],
  ] as const) {
    it(`stays inside the screen on ${name}`, () => {
      for (const target of targets(viewport)) {
        const at = place(target, viewport);
        const width = Math.min(BUBBLE.width, viewport.width);
        assert.ok(at.left >= 0, `left ${at.left} for target at ${target.left},${target.top}`);
        assert.ok(at.top >= 0, `top ${at.top} for target at ${target.left},${target.top}`);
        assert.ok(at.left + width <= viewport.width, `runs off the right at ${target.left},${target.top}`);
        assert.ok(
          at.top + Math.min(BUBBLE.height, at.maxHeight) <= viewport.height,
          `runs off the bottom at ${target.left},${target.top}`,
        );
      }
    });

    it(`never covers the control it describes on ${name}`, () => {
      for (const target of targets(viewport)) {
        const at = place(target, viewport);
        const height = Math.min(BUBBLE.height, at.maxHeight);
        const overlaps =
          at.left < target.left + target.width &&
          at.left + BUBBLE.width > target.left &&
          at.top < target.top + target.height &&
          at.top + height > target.top;
        assert.ok(!overlaps, `covers its target at ${target.left},${target.top} (opened ${at.side})`);
      }
    });
  }
});
