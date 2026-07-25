/**
 * THE SINGLE-PAGE FRAME.
 *
 * A persistent navigation surface reaching every destination, and one region the current screen
 * renders into. Nothing else, and deliberately no styling: the visual system is the next step's
 * work and this frame is what it mounts into. Semantic elements are used throughout so that step
 * has something meaningful to attach to rather than a wall of anonymous containers.
 */

import { NavLink, Outlet } from 'react-router-dom';

import { DESTINATIONS } from './navigation';

export function AppFrame() {
  return (
    <>
      <header>
        <h1>Fit</h1>
      </header>

      <nav aria-label="Main">
        <ul>
          {DESTINATIONS.map((destination) => (
            <li key={destination.path}>
              <NavLink to={destination.path}>{destination.label}</NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <main>
        <Outlet />
      </main>
    </>
  );
}
