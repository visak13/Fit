/**
 * A destination that resolves, states what will live here, and does nothing else.
 *
 * These exist so the navigation skeleton is genuinely walkable end to end rather than a list of
 * links that mostly 404. Each one is replaced by the real screen in a later step; none of them
 * should acquire behaviour here.
 *
 * ## It is not a throwaway, because it is what the coach actually sees
 *
 * Four of the five destinations are this screen until later steps land, so this is most of the
 * application by area for now. A blank page is a dead end and a dead end is the one thing this must
 * not be — so the destination's own one-line summary from `navigation.ts` is the content, and it is
 * ORIENTATION: it says what is coming to this exact place, in the same words the rail used to get
 * here. The summary lives on the destination rather than in this file for the usual reason: a second
 * table of screen descriptions beside the navigation list is how one of them ends up saying
 * something the rail disagrees with.
 *
 * ## Why there is no link out of it, which looks like an omission and is not
 *
 * `app/DESIGN.md`: a destination never appears inside a screen. This screen IS a destination — the
 * rail and the bar are marking it current while it is open — so a link from here to another
 * destination would have the two navigation layers telling the coach two different things about
 * where he is. The way onward is the frame, which carries all five destinations at every width and
 * cannot scroll away. That is not a dead end; it is the layer whose job this is, doing it.
 */

import { Glyph } from '../design/Glyph';
import type { Destination } from '../shell/navigation';

export function PlaceholderScreen({ destination }: { destination: Destination }) {
  return (
    <div className="screen">
      <section className="card stack" aria-labelledby={`screen-${destination.path}`}>
        <div className="inline">
          {/* The same mark the rail carries for this destination, so arriving here confirms the tap
            * landed where he aimed. Decorative: the heading beside it already says the word. */}
          <Glyph name={destination.glyph} size="lead" decorative />
          <h2 id={`screen-${destination.path}`} className="title-screen">
            {destination.label}
          </h2>
        </div>

        <p className="screen-intro">{destination.summary}</p>

        <p className="note read">
          <Glyph name="note" size="inline" decorative />
          <span>
            This part is not built yet. The rest of the application is unaffected and stays where it
            is.
          </span>
        </p>
      </section>
    </div>
  );
}
