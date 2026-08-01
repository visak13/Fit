/**
 * THE SCREEN A COACH MEETS WHEN SOMETHING IN THIS APP THROWS — the route-level `errorElement`.
 *
 * This file is the DRAWING and nothing else. Every sentence, every judgement about what may be
 * claimed, and every way onward is decided in `error-screen.ts`, where it is asserted without a
 * browser. See that file's header for the whole argument, including the two aftermath claims and
 * why NOTHING derived from the thrown value is rendered.
 *
 * ## WHY IT IS DECLARED ON EVERY ROUTE RATHER THAN ONCE AT THE ROOT
 *
 * React Router walks UP from the route that threw to the nearest boundary. Declared only on the
 * layout route, this screen would replace the WHOLE frame — including the navigation surface — for
 * an error in one screen, which throws away the working half of the application. Declared on every
 * route, an error inside a screen is drawn INSIDE the frame the coach already had, and the frame's
 * own failure is still caught by the layout route's copy. `routes.tsx` puts it on both, from one
 * declaration, and `no-dead-ends.test.ts` fails if any route is left without one.
 *
 * ## THE THROWN VALUE IS LOGGED, NEVER RENDERED
 *
 * Swallowing it would leave whoever is helping him nothing at all, so it goes to the console, which
 * is where this application already puts its failure paths. It goes there in an effect rather than
 * during render because logging is a side effect: React may render a component more than once before
 * anything is committed, and a `console.error` in the body would report one fault twice.
 */

import { useEffect } from 'react';
import { Link, useRouteError } from 'react-router-dom';

import { Glyph } from '../design/Glyph';
import {
  ERROR_SCREEN_ID, ERROR_TITLE, WHAT_HAPPENED, WHAT_IS_STILL_HERE, WHAT_TO_DO, WHAT_WAS_NOT_SAVED,
  waysOnward,
} from './error-screen';

export function ErrorScreen() {
  const error = useRouteError();

  useEffect(() => {
    console.error('[shell] a screen stopped before it finished opening', error);
  }, [error]);

  return (
    <div className="screen">
      <section className="card stack" aria-labelledby={ERROR_SCREEN_ID}>
        <h2 id={ERROR_SCREEN_ID} className="title-screen">
          {ERROR_TITLE}
        </h2>

        <p className="screen-intro read">{WHAT_HAPPENED}</p>

        <p className="note read">
          <Glyph name="note" size="inline" decorative />
          <span>{WHAT_IS_STILL_HERE}</span>
        </p>

        <p className="read">{WHAT_WAS_NOT_SAVED}</p>

        <p className="read">{WHAT_TO_DO}</p>

        <ul className="rows">
          {waysOnward().map((way) => (
            <li key={way.to} className="row-static">
              <Link className="btn" to={way.to}>
                <Glyph name="link-forward" size="inline" decorative />
                {way.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
