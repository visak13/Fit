/**
 * THE ROUTE TABLE, built from the destination list rather than beside it.
 *
 * Routing is by URL FRAGMENT (`#/clients`), not by history path, and that is deliberate. The
 * published site is a project page served from a sub-path by a static host: a deep link refreshed
 * under history routing asks that host for a file it does not have and gets a not-found page. It
 * would surface as an intermittent failure on the coach's own device, at the moment he reopened
 * the application on a screen he had left it on. A fragment is never sent to the host, so every
 * address survives a refresh and a cold start from the home screen.
 */

import { createHashRouter, Navigate } from 'react-router-dom';

import { AdminScreen } from '../screens/AdminScreen';
import { NotFoundScreen } from '../screens/NotFoundScreen';
import { PlaceholderScreen } from '../screens/PlaceholderScreen';
import { AppFrame } from './AppFrame';
import { DEFAULT_DESTINATION_PATH, DESTINATIONS } from './navigation';

/** The one destination that already has content; the rest are placeholders for later steps. */
const ADMIN_PATH = 'admin';

export const router = createHashRouter([
  {
    path: '/',
    element: <AppFrame />,
    children: [
      { index: true, element: <Navigate to={DEFAULT_DESTINATION_PATH} replace /> },
      ...DESTINATIONS.map((destination) => ({
        path: destination.path,
        element:
          destination.path === ADMIN_PATH ? (
            <AdminScreen destination={destination} />
          ) : (
            <PlaceholderScreen destination={destination} />
          ),
      })),
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
]);
