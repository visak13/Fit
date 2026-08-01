/**
 * THE DIVERGENCE SEAM — where the picker gets its questions, and where the answers go.
 *
 * ## Why there is a seam at all, and why it is this shape
 *
 * The interface does not open the local store. That is not an accident of the build order: the core
 * is plain dependency-free modules with a test gate that needs no toolchain, and the shell mounts on
 * top of it — so a screen reaching into the store would put the most safety-critical logic in the
 * application behind a build step. Every screen so far therefore consumes a REQUIRED provider
 * (`PlatformStatusProvider`, `SyncStatusProvider`) filled in at `main.tsx`, and this is the third.
 *
 * **Two later screens will copy this seam**, so what it is made of matters more than that it works:
 *
 * - The reading is a plain value, not a hook that fetches. A screen cannot start work of its own.
 * - Its fields are the core's own, field for field and name for name. `pending` holds the objects
 *   `describeDivergence` returned, unconverted — this file renames nothing, and a screen reading a
 *   renamed copy is a screen that drifts from the thing it is showing.
 * - `resolve` is the ONLY way out of the screen, and it is nullable ON PURPOSE. Null means no source
 *   is wired, and the picker then offers no buttons at all. A button that cannot do what its words
 *   say is worse than no button; `core/status/reasons.js` makes the same argument about offering an
 *   action that does not help, and the synchronisation indicator is deliberately not a control today
 *   for exactly this reason.
 * - The provider is REQUIRED. `useDivergences` throws outside it rather than defaulting, because a
 *   default would be this layer inventing a state — and the state it would invent, "nothing to
 *   decide", is the one that looks fine while a clash sits unanswered.
 *
 * ## What the later step supplies, precisely
 *
 * It replaces the SOURCE, not this file and not the screen. It must:
 *
 *   1. open the local store, and after every synchronisation pass take `report.divergences` from
 *      `syncNow` (`core/sync/engine.js`) — the engine already carries them out, applies neither side,
 *      and writes no journal entry for surfacing one;
 *   2. push them into `DivergenceProvider`'s `reading` as `pending`, unchanged;
 *   3. supply `resolve` as a call through to `resolveDivergence` from `core/sync/resolution.js`,
 *      which is the ONE place a divergence is ever applied and the one call site of
 *      `sync.conflict_resolved` in the application. **This screen must not apply anything itself and
 *      must not emit a journal kind** — `core/journal/unwritten-kinds.test.js` asserts a partition
 *      over the whole vocabulary by scanning `core/` alone, so a call site here would leave that test
 *      green while the partition it asserts had quietly become false;
 *   4. re-read after each resolution, so an answered question stops being asked. A resolution that
 *      left the clash on screen would put the same question to him on every pass until he stopped
 *      reading the surface.
 */

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { Divergence, Resolve } from '../screens/divergence-picker';

export type { Divergence, Resolve } from '../screens/divergence-picker';

export interface DivergenceReading {
  /**
   * WHETHER ANYTHING COMPARED THE TWO DEVICES AT ALL, and it is the field that stops this seam
   * lying.
   *
   * An empty `pending` has two completely different meanings — a comparison ran and found the
   * devices in agreement, and NOBODY EVER COMPARED THEM — and the words the picker used to say for
   * the empty case ("Your devices agree on everything they have both been used for") are only true
   * of the first. Nothing in this build compares anything, so the second is what the coach was
   * reading, worded as the first. The count cannot carry that difference and a sentence chosen from
   * the count therefore cannot either: the discriminant is this field.
   */
  readonly checked: boolean;
  /** Clashes the core surfaced and applied neither side of, exactly as it described them. */
  readonly pending: readonly Divergence[];
  /** How an answer reaches the core, or null when no source is wired and nothing can be answered. */
  readonly resolve: Resolve | null;
}

/**
 * What is true in this build: no local store is wired, so nothing has been compared and nothing can
 * be answered. It is not a placeholder standing in for a real value — it is the real value for a
 * device that has never synchronised, which is every device until the synchronisation step lands.
 *
 * `checked: false` is the whole of the difference between saying so and inventing good news. The
 * name of this constant is the older, weaker claim and is left alone deliberately: it is imported by
 * `App.tsx`, which another action owns while this one runs.
 */
export const NOTHING_TO_DECIDE: DivergenceReading = Object.freeze({
  checked: false,
  pending: Object.freeze([]) as readonly Divergence[],
  resolve: null,
});

const DivergenceContext = createContext<DivergenceReading | null>(null);

export function DivergenceProvider({
  reading,
  children,
}: {
  reading: DivergenceReading;
  children: ReactNode;
}) {
  return <DivergenceContext.Provider value={reading}>{children}</DivergenceContext.Provider>;
}

/**
 * The current reading.
 *
 * @throws Error when used outside the provider. A missing seam must be loud: silently rendering
 * "nothing to decide" would be an unwired screen reporting the one state that looks like good news.
 */
export function useDivergences(): DivergenceReading {
  const reading = useContext(DivergenceContext);
  if (reading === null) {
    throw new Error('useDivergences was used outside DivergenceProvider: the divergence seam is not wired');
  }
  return reading;
}
