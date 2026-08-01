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
import { ErrorScreen } from '../screens/ErrorScreen';
import { ClientsScreen } from '../screens/ClientsScreen';
import { DietScreen } from '../screens/DietScreen';
import { DivergencePickerScreen } from '../screens/DivergencePickerScreen';
import { JournalScreen } from '../screens/JournalScreen';
import { KeyMaterialConditionScreen } from '../screens/KeyMaterialConditionScreen';
import { RoutinesScreen } from '../screens/RoutinesScreen';
import { NotFoundScreen } from '../screens/NotFoundScreen';
import { PlaceholderScreen } from '../screens/PlaceholderScreen';
import { RemovalsScreen } from '../screens/RemovalsScreen';
import { RunnerScreen } from '../screens/RunnerScreen';
import { SetupScreen } from '../screens/SetupScreen';
import { StoppedChangesScreen } from '../screens/StoppedChangesScreen';
import { AppFrame } from './AppFrame';
import {
  DEFAULT_DESTINATION_PATH, DESTINATIONS, DIVERGENCES_PATH, JOURNAL_PATH, KEY_MATERIAL_PATH,
  REMOVALS_PATH, SESSION_PATH, SETUP_PATH, STOPPED_CHANGES_PATH,
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
  diet: (destination) => <DietScreen destination={destination} />,
  // The library editor. This is the destination the empty-library message sends the coach to, so
  // until this entry existed the one instruction the application gave him led to the placeholder.
  routines: (destination) => <RoutinesScreen destination={destination} />,
};

/**
 * WHAT THE COACH SEES WHEN A SCREEN THROWS — declared ONCE and put on every route below.
 *
 * React Router chooses a boundary with `route.errorElement || <its own default>`, and that default
 * is not a development-only screen here: MEASURED in the production bundle, its developer fragment
 * is assigned unconditionally, so an unhandled render or loader error put "Unexpected Application
 * Error!" and a raw stack trace in front of the coach. `screens/error-screen.ts` holds the words and
 * `screens/ErrorScreen.tsx` holds why it goes on EVERY route rather than only on the layout: on a
 * child route the frame he already had survives, and on the layout route the frame's own failure is
 * still caught.
 *
 * ONE ELEMENT, REUSED. The screen renders nothing derived from the thrown value and holds no state,
 * so there is nothing for two routes sharing it to disagree about — and one declaration is what
 * makes "every route has a boundary" a property of this file rather than a thing eleven entries have
 * to remember. `no-dead-ends.test.ts` fails if any route in this table is left without one.
 */
const errorElement = <ErrorScreen />;

/**
 * The same table with a boundary on every route in it, however deep.
 *
 * DERIVED rather than written out eleven times, and that is the same choice `DESTINATION_SCREENS`
 * above makes for the same measured reason: a property that has to be remembered per entry is a
 * property the twelfth entry does not have, and the route that would be missing it is by definition
 * the one nobody was thinking about. A route may still declare its OWN boundary — this only fills in
 * the ones that have none — so a screen that later needs different words is a change here and not a
 * fight with this function.
 */
function withErrorBoundary(routes: readonly RouteObject[]): RouteObject[] {
  return routes.map((route) => ({
    ...route,
    errorElement: route.errorElement ?? errorElement,
    ...(route.children === undefined ? {} : { children: withErrorBoundary(route.children) }),
  })) as RouteObject[];
}

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
export const ROUTE_TABLE: readonly RouteObject[] = withErrorBoundary([
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
      // The address `platform/google-meet.ts` has been naming in shipped copy since before it
      // existed. `shell/navigation.ts` holds the argument for it not being a sixth destination.
      { path: SETUP_PATH, element: <SetupScreen /> },
      // The account this application has been keeping of itself since `core/journal/` existed, with
      // nothing ever reading it back. It mounts its OWN seam — the filter is a changed READ over an
      // unindexed store, so the query cannot live above the router. `JournalScreen.tsx` holds why.
      { path: JOURNAL_PATH, element: <JournalScreen /> },
      // WHICH session is a QUERY on this one address rather than a segment under it, so there is one
      // route here and not two. `shell/navigation.ts` holds the argument.
      { path: SESSION_PATH, element: <RunnerScreen /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
]);

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
