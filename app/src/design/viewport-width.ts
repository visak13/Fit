/**
 * HOW WIDE THE WINDOW IS, AS A VALUE A COMPONENT CAN READ.
 *
 * Nearly every width decision in this application is CSS's — `AppFrame.tsx` branches at
 * `EXPANDED_VIEWPORT_MIN` in a media query and no module has to know. This exists for the case CSS
 * cannot answer: a judgement that decides whether a SENTENCE IS SAID AT ALL rather than how it is
 * laid out. Hiding words with `display: none` leaves them in the markup, in the accessibility tree
 * and in anything that reads the page, so a claim that the app "does not offer" something is not a
 * claim CSS can make. `screens/launcher.ts` makes exactly one of those — see `canOpenASecondWindow`.
 *
 * ## THE SUBSCRIPTION IS SPLIT OUT SO IT CAN BE ASSERTED
 *
 * {@link subscribeToWidth} and {@link readWidth} are plain functions over a {@link WidthSource},
 * which is the subset of `window` they use. That is what lets the whole behaviour — reads the
 * current width, publishes on a resize, and STOPS LISTENING when it is released — be proven with
 * `node:test` and no browser, in a project with no DOM renderer. The hook below is then the two of
 * them handed to React and nothing else.
 *
 * `useSyncExternalStore` rather than `useState` + an effect: the width is state that lives OUTSIDE
 * React and changes without asking it, which is the one thing that primitive is for. An effect
 * mirroring it into state would render once with a stale value first, and on this screen a stale
 * value is the wrong sentence on screen rather than a wrong pixel.
 */

import { useSyncExternalStore } from 'react';

/** The part of `window` this needs. Named so a test can supply one without a browser. */
export interface WidthSource {
  readonly innerWidth: number;
  addEventListener(type: 'resize', listener: () => void): void;
  removeEventListener(type: 'resize', listener: () => void): void;
}

/**
 * The viewport's width in CSS pixels.
 *
 * `innerWidth` rather than `documentElement.clientWidth` because it is the width a CSS `@media`
 * query matches — scrollbar included — and this reading has to agree with the frame's own boundary
 * rather than sit a scrollbar's width away from it.
 */
export function readWidth(source: WidthSource): number {
  return source.innerWidth;
}

/**
 * Follow the width until the returned function is called.
 *
 * The listener is removed in the same scope that added it, and the function returned is the only
 * way to stop: a subscription whose release is optional is a subscription that outlives its
 * component.
 */
export function subscribeToWidth(source: WidthSource, onChange: () => void): () => void {
  source.addEventListener('resize', onChange);
  return () => source.removeEventListener('resize', onChange);
}

/** The viewport's width, kept current while the component is mounted. */
export function useViewportWidth(): number {
  return useSyncExternalStore(
    (onChange) => subscribeToWidth(window, onChange),
    () => readWidth(window),
    // Rendered on a server there is no window at all. This application is not rendered on one, and
    // the value stated here is what a build that started doing so would show for one frame; the
    // narrow answer is the one that withholds a capability rather than offering an absent one.
    () => 0,
  );
}
