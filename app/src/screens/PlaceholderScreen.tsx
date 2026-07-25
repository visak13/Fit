/**
 * A destination that resolves, states what will live here, and does nothing else.
 *
 * These exist so the navigation skeleton is genuinely walkable end to end rather than a list of
 * links that mostly 404. Each one is replaced by the real screen in a later step; none of them
 * should acquire behaviour here.
 */

import type { Destination } from '../shell/navigation';

export function PlaceholderScreen({ destination }: { destination: Destination }) {
  return (
    <section aria-labelledby={`screen-${destination.path}`}>
      <h2 id={`screen-${destination.path}`}>{destination.label}</h2>
      <p>{destination.summary}</p>
      <p>
        <small>Not built yet. This screen is a placeholder in the application shell.</small>
      </p>
    </section>
  );
}
