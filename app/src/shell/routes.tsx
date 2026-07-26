/**
 * THE ROUTE TABLE, built from the destination list rather than beside it.
 *
 * Routing is by URL FRAGMENT (`#/clients`), not by history path, and that is deliberate. The
 * published site is a project page served from a sub-path by a static host: a deep link refreshed
 * under history routing asks that host for a file it does not have and gets a not-found page. It
 * would surface as an intermittent failure on the coach's own device, at the moment he reopened
 * the application on a screen he had left it on. A fragment is never sent to the host, so every
 * address survives a refresh and a cold start from the home screen.
 *
 * ## Why the TABLE and the ROUTER are two exports rather than one
 *
 * `createHashRouter` reads `window.history` the moment it is called, so a module that built the
 * router at import time could only ever be imported by a browser. That is what a check would have
 * to work around, and every workaround is the same shape: rebuild a list of paths beside this file
 * and assert against THAT. Such a check passes forever while this table drifts away from it — it is
 * testing the copy, and the copy is the thing that cannot be wrong.
 *
 * So `ROUTE_TABLE` is the data, importable anywhere, and `createAppRouter` is the one call that
 * needs a browser. `src/shell/no-dead-ends.test.ts` resolves real addresses against this exact
 * array using react-router's own matcher — the same matcher the hash router uses underneath — and
 * renders what it matches. There is still ONE table; nothing was copied to make it checkable.
 */

import { createHashRouter, Navigate } from 'react-router-dom';
import type { ReactElement } from 'react';
import type { RouteObject } from 'react-router-dom';

import { AdminScreen } from '../screens/AdminScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { ClientsScreen } from '../screens/ClientsScreen';
import { DivergencePickerScreen } from '../screens/DivergencePickerScreen';
import { KeyMaterialConditionScreen } from '../screens/KeyMaterialConditionScreen';
import { NotFoundScreen } from '../screens/NotFoundScreen';
import { PlaceholderScreen } from '../screens/PlaceholderScreen';
import { RemovalsScreen } from '../screens/RemovalsScreen';
import { StoppedChangesScreen } from '../screens/StoppedChangesScreen';
import { AppFrame } from './AppFrame';
import {
  DEFAULT_DESTINATION_PATH, DESTINATIONS, DIVERGENCES_PATH, KEY_MATERIAL_PATH, REMOVALS_PATH,
  STOPPED_CHANGES_PATH,
} from './navigation';
import type { Destination } from './navigation';

/** What a destination with no screen of its own shows: its own one-line summary, and no dead end. */
const defaultScreen = (destination: Destination): ReactElement => (
  <PlaceholderScreen destination={destination} />
);

/**
 * The destinations that have a real screen, by path. Everything else is still a placeholder.
 *
 * A LOOKUP rather than a chain of comparisons, because this list grows once per step for the next
 * several steps and a chain is where the fourth one gets added to the wrong branch. A destination
 * missing from here is not an error — it is a destination whose screen has not been built yet, and
 * `PlaceholderScreen` says exactly that in the destination's own words.
 */
const DESTINATION_SCREENS: Readonly<Record<string, (destination: Destination) => ReactElement>> = {
  admin: (destination) => <AdminScreen destination={destination} />,
  calendar: (destination) => <CalendarScreen destination={destination} />,
  clients: (destination) => <ClientsScreen destination={destination} />,
};

/**
 * Every address this application answers to, and the only place they are declared.
 *
 * The destination routes are MAPPED from the navigation list rather than written out, so a
 * destination added there is reachable here without anyone remembering.
 *
 * A route that is NOT a destination is allowed, and the picker is the first — see
 * {@link DIVERGENCES_PATH}. What is not allowed is a route nothing links to, and that is checked
 * rather than trusted: `no-dead-ends.test.ts` renders every screen this table carries and requires
 * each non-destination route to be reached by a LABELLED link that resolves, from a screen that is
 * itself reachable. A screen findable only by typing its address is a screen the coach cannot find.
 */
export const ROUTE_TABLE: readonly RouteObject[] = [
  {
    path: '/',
    element: <AppFrame />,
    children: [
      { index: true, element: <Navigate to={DEFAULT_DESTINATION_PATH} replace /> },
      ...DESTINATIONS.map((destination) => ({
        path: destination.path,
        element: (DESTINATION_SCREENS[destination.path] ?? defaultScreen)(destination),
      })),
      { path: DIVERGENCES_PATH, element: <DivergencePickerScreen /> },
      { path: KEY_MATERIAL_PATH, element: <KeyMaterialConditionScreen /> },
      { path: STOPPED_CHANGES_PATH, element: <StoppedChangesScreen /> },
      { path: REMOVALS_PATH, element: <RemovalsScreen /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
];

/**
 * The router the application actually runs on, built from the table above.
 *
 * Called by `main.tsx` at start. It must not be called at module scope here: `createHashRouter`
 * touches `window` immediately, and this module has to stay importable by anything that wants to
 * ask what the addresses are.
 */
export function createAppRouter() {
  return createHashRouter([...ROUTE_TABLE]);
}
