/**
 * THE CONTEXTUAL LAYER, AS A MECHANISM A SCREEN USES — the React half of `trail.ts`.
 *
 * `trail.ts` holds the rules and the arithmetic and is tested. This file is the seam: a screen
 * DECLARES where it sits, and the frame — which owns the sticky content header the breadcrumb is
 * pinned into — DRAWS it. The two never touch each other directly, which is the point. A screen
 * that reached up into the frame's header would be a screen that could put a destination in it.
 *
 * ## What a screen does
 *
 * ```tsx
 * export function SessionScreen() {
 *   useDeclareTrail({
 *     back: { label: "Priya's sessions", to: 'clients/priya/sessions' },
 *     steps: [{ label: 'Priya', to: 'clients/priya' }],
 *     here: 'Tuesday, 12 June',
 *   });
 *   return <div className="screen">…</div>;
 * }
 * ```
 *
 * A destination's own screen declares nothing — it has no trail, and it is already the thing the
 * global surface highlights.
 *
 * ## Why the trail clears itself
 *
 * The declaration is an effect with a cleanup, so a screen that navigates away takes its trail with
 * it. The alternative — every screen remembering to clear — leaves the previous screen's breadcrumb
 * pinned over the next one, which reads as the application being lost rather than as a missing
 * call.
 */

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { ContextualTrail } from './trail.ts';
import { trailKey } from './trail.ts';

interface TrailChannel {
  readonly trail: ContextualTrail | null;
  readonly declare: (trail: ContextualTrail | null) => void;
}

/**
 * Null when a screen is rendered outside the frame, which is a mistake rather than a mode — so
 * `useDeclareTrail` says so rather than silently doing nothing and leaving the author to wonder why
 * their breadcrumb never appears.
 */
const TrailContext = createContext<TrailChannel | null>(null);

export function TrailProvider({ children }: { children: ReactNode }) {
  const [trail, declare] = useState<ContextualTrail | null>(null);
  const channel = useMemo<TrailChannel>(() => ({ trail, declare }), [trail]);
  return <TrailContext.Provider value={channel}>{children}</TrailContext.Provider>;
}

/** What the frame reads to draw the contextual layer. */
export function useContextualTrail(): ContextualTrail | null {
  return useContext(TrailContext)?.trail ?? null;
}

/**
 * Declare where this screen sits, or `null` for a destination's own screen.
 *
 * @param trail the way back, the ancestors, and what the coach is looking at
 */
export function useDeclareTrail(trail: ContextualTrail | null): void {
  const channel = useContext(TrailContext);
  const declare = channel?.declare;

  // The key, not the object: a screen writes its trail as a literal in its own body, so the object
  // is new on every render and a reference comparison would republish it on every keystroke.
  const key = trailKey(trail);

  useEffect(() => {
    if (declare === undefined) {
      console.error(
        '[trail] a screen declared a contextual trail outside the application frame, so nothing will draw it',
      );
      return;
    }
    declare(trail);
    return () => declare(null);
    // `trail` is deliberately absent from the dependencies: `key` IS its value-identity, and the
    // object changes on every render while the key does not.
  }, [declare, key]);
}
