/**
 * An address that does not resolve.
 *
 * The standing requirement is that there are no dead ends, so this offers the way back rather
 * than only stating the problem.
 *
 * ## This is the one screen allowed to name a destination, and the exception is written down
 *
 * `app/DESIGN.md` forbids a destination inside a screen, because the rail is already saying where
 * the coach is and two layers that overlap start disagreeing. Here nothing is current in the rail —
 * this address belongs to none of the five — so there is nothing for a link to disagree with. And it
 * is the one screen a coach arrives at WITHOUT MEANING TO, from a stale link or a mistyped address,
 * which is the worst possible moment to ask a non-technical person to find their own way out. The
 * exception is named in the contract beside the rule, so it stays one exception rather than becoming
 * the precedent six later screens cite.
 *
 * ## The words on the control are the destination's own
 *
 * Taken from `navigation.ts` rather than written here. "Go to the calendar" typed into this file is
 * a second copy of a label, and the copy is the one that does not get renamed — leaving a screen
 * that sends him somewhere by a name the rail no longer uses.
 *
 * ## The way back is written ABSOLUTELY, and that is not a style choice
 *
 * A RELATIVE `to` is resolved against wherever the coach currently is, and on this screen that is by
 * definition an address the application does not have. From `#/typo` a relative "calendar" resolves
 * to `#/typo/calendar` — which is another unmatched address, so the one control on the screen whose
 * entire job is getting him out of a dead end delivered him into the next one, and each press went
 * one level deeper. It shipped, because nothing rendered this screen at an address that does not
 * exist; the rail's own links resolved correctly from every address that DOES, which is where they
 * were looked at. Caught by `no-dead-ends.test.ts` rendering it at an unmatched address, and that
 * test is what keeps it fixed.
 */

import { Link } from 'react-router-dom';

import { Glyph } from '../design/Glyph';
import { DEFAULT_DESTINATION_PATH, DESTINATIONS } from '../shell/navigation';

/**
 * The default destination, as the navigation list has it.
 *
 * Resolved rather than assumed: if the default is ever pointed at a path the list does not carry,
 * this screen would be sending the coach into another not-found from the screen whose whole job is
 * getting him out of one. It falls back to the first destination, which the list always has.
 */
const HOME =
  DESTINATIONS.find((destination) => destination.path === DEFAULT_DESTINATION_PATH) ??
  DESTINATIONS[0];

export function NotFoundScreen() {
  return (
    <div className="screen">
      <section className="card stack" aria-labelledby="screen-not-found">
        <h2 id="screen-not-found" className="title-screen">
          Nothing here
        </h2>

        <p className="screen-intro">
          That address does not belong to any screen in this application. Nothing has gone wrong with
          your data.
        </p>

        <div className="inline">
          <Link className="btn btn-primary" to={`/${HOME.path}`}>
            <Glyph name="link-back" size="inline" decorative />
            Go to {HOME.label}
          </Link>
        </div>

        <p className="muted read">
          The five parts of the application are also on screen at all times, so you can go straight
          to any of them from here.
        </p>
      </section>
    </div>
  );
}
