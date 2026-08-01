/**
 * THE APPLICATION FRAME — Console's shape, and the thing every screen mounts into.
 *
 * ## Two surfaces, one breakpoint, and why the names are not "phone" and "laptop"
 *
 * There is ONE width boundary in this frame, at 840px (`EXPANDED_VIEWPORT_MIN`). At or above it the
 * global navigation is the WIDE surface — a 76px icon rail expanding to 248px on hover or keyboard
 * focus. Below it, at every width, it is the NARROW surface — a bottom bar of five items, icon
 * above label. There is no third treatment and there must not be one.
 *
 * The names are `wide` and `narrow` rather than `laptop` and `phone` on purpose. The 600-840 band
 * is exactly where you cannot know whether a pointer exists: it is a tablet, or it is a laptop
 * browser window that is not maximised, and nothing in the markup can tell you which. When a
 * surface's correctness depends on a fact you cannot observe, take the surface that does not need
 * it — the bar works with a pointer and without one, while the rail is degraded without one and its
 * expansion to 248 would eat a third of an 800px window. Naming devices is what hides that: the
 * thing actually being branched on is available width and pointer certainty.
 *
 * The consequence, stated so nobody reports it as a bug: a coach working in a HALF-WIDTH laptop
 * window gets the bottom bar, not the rail. That is the correct trade.
 *
 * ## The structure, and what it is protecting
 *
 * `.app` is a grid the height of the viewport with four areas — `rail`, `content`, `status`, `bar`
 * — and the whole reason it is a grid is the `status` one. The permanent synchronisation indicator
 * (`SyncStatus.tsx`, rendered into that slot) has to be a SIBLING of anything that scrolls,
 * collapses or hides, and it has to appear at the FOOT OF THE RAIL on the wide
 * surface and IMMEDIATELY ABOVE THE BAR on the narrow one. Grid areas are what let one DOM element
 * be in both places without existing twice: two elements would mean two live regions announcing
 * the same state, and a rule that only one of them is real which nothing could check.
 *
 * Two builders have already made that element a descendant of something scrollable while every
 * computed check passed. Here it cannot be: it is a child of `.app`, beside the content, not
 * inside it.
 *
 * Only `.content` scrolls. The page itself never does, which is what makes "permanently visible"
 * true of the rail, the bar and the status slot rather than merely intended — a rail that is a
 * sibling of the content is as tall as the CONTENT unless something stops it, and that is how a
 * status chip ends up a thousand pixels below the fold with fourteen green checks on it.
 *
 * See `app/DESIGN.md` for the contract a screen mounts through, and `trail.ts` for the contextual
 * layer this frame draws into its sticky header.
 */

import { Link, NavLink, Outlet } from 'react-router-dom';

import { Glyph } from '../design/Glyph.tsx';
import { Tooltip } from '../design/Tooltip.tsx';
import { NewVersionNotice } from './NewVersion.tsx';
import { SyncIndicator } from './SyncStatus.tsx';
import { TrailProvider, useContextualTrail } from './ContextualTrail.tsx';
import type { Destination } from './navigation.ts';
import { DESTINATIONS } from './navigation.ts';
import { contextualLine } from './trail.ts';

const APPLICATION_NAME = 'Fit';

/** The mark's own file, resolved through the published sub-path rather than written out. */
const MARK_SOURCE = `${import.meta.env.BASE_URL}icons/mark.svg`;

const DESTINATION_PATHS = DESTINATIONS.map((destination) => destination.path);

/**
 * One destination, on either surface.
 *
 * THE MICRO-LABEL COLLISION IS RESOLVED THE SAME WAY ON BOTH, and this component is where that is
 * true rather than in two places that could drift. `DIRECTIONS.md` specifies icon above a
 * micro-label; the token layer says 14px `--type-meta` is for timestamps, units and record
 * identifiers and is never a control label. Both cannot hold: "Calendar" measures 56px at 14 and
 * 64px at 16, and a 76px rail has 60px inside its padding.
 *
 * The resolution the user looked at and chose: the micro-label is present at 14 and marked
 * DECORATIVE, and the accessible name every assistive technology reads comes from the full 16px
 * label, which is in the markup whether or not it is painted. So there is always exactly one
 * visible name and always exactly one announced name, and they are the same words.
 */
function DestinationItem({
  destination,
  surface,
  // Forwarded rather than ignored: `Tooltip` describes its child by cloning this onto it, and a
  // component that swallowed it would leave a tooltip that renders and is announced to nobody.
  'aria-describedby': describedBy,
}: {
  destination: Destination;
  surface: 'rail' | 'bar';
  'aria-describedby'?: string;
}) {
  return (
    <NavLink to={destination.path} className={`nav-item nav-item-${surface}`} aria-describedby={describedBy}>
      <Glyph name={destination.glyph} decorative />
      <span className="nav-item-micro" aria-hidden="true">
        {destination.label}
      </span>
      <span className="nav-item-label">{destination.label}</span>
    </NavLink>
  );
}

/**
 * The wide surface. 76px at rest, 248px on hover OR KEYBOARD FOCUS, holding open while focus is
 * anywhere inside it.
 *
 * That last clause is the half that is usually missing, and it is the half a keyboard user depends
 * on entirely: a rail that collapsed the moment focus moved to its second item would be unusable
 * from a keyboard and would look perfectly fine to whoever built it with a mouse. It is
 * `:focus-within` in `console.css` — no state, no JavaScript, nothing to get out of step.
 *
 * The tooltip is on the ONE destination whose name does not tell a non-technical person what is
 * behind it. It is on this surface only: the narrow one must inherit nothing that depends on where
 * a pointer is, and a `Tooltip` wrapper there would also become the flex item the bar distributes
 * its five equal columns to, which is a defect this build has already met once.
 */
function Rail() {
  return (
    <nav className="rail" aria-label="Destinations">
      <ul className="nav-list">
        {DESTINATIONS.map((destination) => (
          <li key={destination.path}>
            {destination.help === undefined ? (
              <DestinationItem destination={destination} surface="rail" />
            ) : (
              <Tooltip text={destination.help}>
                <DestinationItem destination={destination} surface="rail" />
              </Tooltip>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The narrow surface: the same five destinations, in the same order, with the same words.
 *
 * Nothing here depends on where a pointer is. The five items share the bar equally, and the rule
 * that does that sits on the LIST ITEM rather than on the link — a `flex` declaration on a
 * grandchild of the flex container computes correctly on the element, reads correctly in the
 * source, and does nothing at all, which is how a destination once ended up with a 37px target for
 * no reason but the length of its name.
 */
function Bar() {
  return (
    <nav className="bar" aria-label="Destinations">
      <ul className="nav-list">
        {DESTINATIONS.map((destination) => (
          <li key={destination.path}>
            <DestinationItem destination={destination} surface="bar" />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * THE CONTEXTUAL LAYER, drawn. One line pinned into the sticky content header, so it survives
 * scrolling on a long session screen.
 *
 * Nothing is rendered when the current screen is a destination's own, which is most of them today:
 * an empty breadcrumb rail on every screen would be chrome that says nothing.
 */
function ContextualLine() {
  const trail = useContextualTrail();
  const line = contextualLine(trail, DESTINATION_PATHS);
  if (line === null) return null;

  for (const problem of line.problems) {
    console.error(`[trail] "${problem.label}" was not drawn: ${problem.reason}`);
  }

  return (
    <div className="crumbs">
      {line.back !== null && (
        <Link className="back-link" to={line.back.to}>
          <Glyph name="link-back" size="inline" decorative />
          {line.back.label}
        </Link>
      )}
      {line.crumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="crumb-list">
            {line.crumbs.map((crumb) => (
              <li key={`${crumb.label}${String(crumb.to)}`}>
                {crumb.to === null ? (
                  <span aria-current="page">{crumb.label}</span>
                ) : (
                  <Link to={crumb.to}>{crumb.label}</Link>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
    </div>
  );
}

export function AppFrame() {
  return (
    <TrailProvider>
      <div className="app">
        <Rail />

        {/*
          THE SYNCHRONISATION INDICATOR'S SLOT, AND WHAT IS NOW IN IT.

          It is a CHILD OF `.app` — a sibling of the rail, of the bar and of the content — and the
          grid puts it at the foot of the rail column on the wide surface and immediately above the
          bar on the narrow one. Both are Console's specified placements, with one element and no
          duplicate: two would mean two live regions announcing the same state with a rule that
          only one of them counts, which nothing could check.

          What must NOT happen to it: it must not be moved inside the rail, inside `.content`,
          inside the sticky header or inside a screen. Every one of those can scroll, collapse or
          hide, and every one of them passes a computed check while doing it. That is not a
          hypothetical — it has shipped twice. See DESIGN.md, "Where the synchronisation indicator
          goes", and `SyncStatus.tsx` for the seam that drives it.
        */}
        <div className="frame-status">
          <SyncIndicator />
        </div>

        <Bar />

        <div className="content">
          <header className="content-header">
            <div className="brand">
              {/* Decorative: the words beside it are the name, and announcing both says it twice. */}
              <img className="brand-mark" src={MARK_SOURCE} alt="" />
              <h1 className="brand-name">{APPLICATION_NAME}</h1>
            </div>
            <ContextualLine />

            {/*
              A NEWER VERSION IS READY, WHEN ONE ACTUALLY IS. Absent otherwise, and absent while he is
              running a session — `shell/new-version.ts` owns both conditions and the words. It is in
              the header rather than on a screen because a newer build is a fact about the whole
              application, and a coach who had to go looking for it would find out by accident.
            */}
            <NewVersionNotice />
          </header>

          <div className="content-body">
            <Outlet />
          </div>
        </div>
      </div>
    </TrailProvider>
  );
}
