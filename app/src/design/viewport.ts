/**
 * THE THREE WIDTHS THE APPLICATION HAS AN OPINION ABOUT, named once.
 *
 * The coach uses a laptop for online sessions and a phone for in-person ones, and the interface is
 * the SAME information architecture at both — never a second, different design. What does change is
 * the shape of the surfaces around it: a rail on a laptop, a bottom bar on a phone, a tooltip to the
 * right of its target in one and below it in the other.
 *
 * These are the standard window size classes rather than numbers chosen here, which matters because
 * the phone is the device the coach uses with a client in front of him and a boundary invented to
 * suit one screen is a boundary that will be wrong for the next one.
 *
 * | class    | width      | what the interface does |
 * |----------|------------|-------------------------|
 * | compact  | under 600  | bottom bar; nothing that depends on where a pointer is |
 * | medium   | 600 to 839 | still the bottom bar: there is not room for a rail AND a two-column screen |
 * | expanded | 840 and up | the rail, and the horizontal room the two-column screens need |
 *
 * THE FRAME BRANCHES AT ONE OF THESE, NOT BOTH. `medium` names the band; it does not switch
 * anything. The global navigation changes at `EXPANDED_VIEWPORT_MIN` and nowhere else, because the
 * 600-840 band is exactly where you cannot know whether a pointer exists — a tablet and an
 * unmaximised laptop window are indistinguishable from the markup — and a surface whose correctness
 * depends on a fact you cannot observe is the wrong surface to choose. See `AppFrame.tsx`.
 *
 * A CSS `@media` query cannot read a custom property, so any rule that needs one of these has to
 * write the number out. That is the one place these can drift, and it is guarded rather than
 * trusted: `viewport.test.ts` reads `console.css` and fails on a width query that is not one of
 * these.
 */

/** The narrowest width that is no longer compact. Below this the interface is the phone's. */
export const MEDIUM_VIEWPORT_MIN = 600;

/** The narrowest width that gets the rail, and the horizontal room a two-column screen needs. */
export const EXPANDED_VIEWPORT_MIN = 840;

/** What the interface calls the width it is being drawn at. */
export type ViewportClass = 'compact' | 'medium' | 'expanded';

/**
 * The class of a viewport width in CSS pixels.
 *
 * @param width the viewport's width
 */
export function viewportClass(width: number): ViewportClass {
  if (width >= EXPANDED_VIEWPORT_MIN) return 'expanded';
  if (width >= MEDIUM_VIEWPORT_MIN) return 'medium';
  return 'compact';
}
