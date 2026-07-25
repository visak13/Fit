/**
 * An address that does not resolve.
 *
 * The standing requirement is that there are no dead ends, so this offers the way back rather
 * than only stating the problem.
 */

import { Link } from 'react-router-dom';

import { DEFAULT_DESTINATION_PATH } from '../shell/navigation';

export function NotFoundScreen() {
  return (
    <section aria-labelledby="screen-not-found">
      <h2 id="screen-not-found">Nothing here</h2>
      <p>That address does not belong to any screen in this application.</p>
      <p>
        <Link to={DEFAULT_DESTINATION_PATH}>Go back to the calendar</Link>
      </p>
    </section>
  );
}
