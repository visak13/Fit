/**
 * WHERE A TOOLTIP OPENS — arithmetic, separated from the component so it can be proved.
 *
 * Two things must be true of every bubble this returns, and neither is checkable by looking at a
 * screen you happened to open:
 *
 * 1. **It is inside the viewport.** A bubble that opens past the edge of a phone is unreadable, and
 *    on a device with no pointer the coach has no way to make it happen again to look at it.
 * 2. **It does not cover the thing it describes.** A tooltip that hides its own target is worse than
 *    no tooltip: the control disappears at the moment he reached for it.
 *
 * They pull against each other at the extremes, and the resolution is the third return value.
 * Rather than choosing which invariant to break, the placement reports the room actually available
 * on the side it chose, and the bubble is CAPPED to it. Both hold, always, and a bubble that would
 * not have fitted scrolls instead of lying.
 *
 * Everything is in CSS pixels relative to the viewport — the same space `getBoundingClientRect`
 * reports in — because the bubble is positioned against the viewport rather than against its
 * trigger. A rail that clips its own overflow would otherwise clip the tooltip explaining it.
 */

import { EXPANDED_VIEWPORT_MIN } from './viewport.ts';

/** A rectangle in viewport coordinates. The subset of `DOMRect` this needs, so a test can make one. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Which side of its target a bubble opened on. */
export type TooltipSide = 'right' | 'below' | 'above';

/** Where a bubble opens, and how tall it is allowed to be there. */
export interface TooltipPlacement {
  readonly side: TooltipSide;
  readonly left: number;
  readonly top: number;
  readonly maxHeight: number;
}

export interface PlacementRequest {
  /** The control the tooltip describes. */
  readonly target: Box;
  /** The bubble at its natural size, measured before it is placed. */
  readonly bubble: { readonly width: number; readonly height: number };
  /** The visible area. */
  readonly viewport: { readonly width: number; readonly height: number };
  /** Between the target and the bubble. */
  readonly gap: number;
  /** Between the bubble and the edge of the screen. */
  readonly margin: number;
}

/** Keep `value` within `low`..`high`, and prefer `low` when the range has collapsed. */
function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, high));
}

/**
 * Place a bubble.
 *
 * The preferred side is the RIGHT on a laptop, where the rail is the most common trigger and a
 * bubble below one would sit on top of the next destination; below it on anything narrower. Right is
 * taken only when the bubble genuinely fits there, so a wide-enough window with a target near its
 * edge falls back rather than opening off the screen.
 */
export function placeTooltip({ target, bubble, viewport, gap, margin }: PlacementRequest): TooltipPlacement {
  const targetRight = target.left + target.width;
  const targetBottom = target.top + target.height;

  const roomRight = viewport.width - margin - (targetRight + gap);
  const roomBelow = viewport.height - margin - (targetBottom + gap);
  const roomAbove = target.top - gap - margin;

  if (viewport.width >= EXPANDED_VIEWPORT_MIN && bubble.width <= roomRight) {
    // Vertically aligned with the target's own top, then held inside the screen. Clamping upward
    // cannot push it over the target: the two are disjoint horizontally whatever happens here.
    const room = viewport.height - margin * 2;
    return {
      side: 'right',
      left: targetRight + gap,
      top: clamp(target.top, margin, Math.max(margin, viewport.height - margin - Math.min(bubble.height, room))),
      maxHeight: room,
    };
  }

  // Below, unless above has more room. Whichever is chosen, the bubble is capped to that room, so
  // it can neither overflow the screen nor be clamped back across the target.
  const below = bubble.height <= roomBelow || roomBelow >= roomAbove;
  const left = clamp(target.left, margin, Math.max(margin, viewport.width - margin - bubble.width));

  return below
    ? { side: 'below', left, top: targetBottom + gap, maxHeight: Math.max(0, roomBelow) }
    : {
        side: 'above',
        left,
        top: Math.max(margin, target.top - gap - Math.min(bubble.height, Math.max(0, roomAbove))),
        maxHeight: Math.max(0, roomAbove),
      };
}
