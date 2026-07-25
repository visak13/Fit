/**
 * APPLICATION START.
 *
 * Order matters here and the reason is worth stating. The interface is mounted FIRST, with the
 * platform facts still unknown, and the two platform requests — offline support and persistent
 * storage — are made afterwards, updating the interface when they answer.
 *
 * The alternative, waiting for both before rendering anything, would mean a browser that is slow
 * or unwilling to answer produces a blank screen. The standing rule for this application is that
 * it always opens and always works; nothing platform-related is allowed to stand between the
 * coach and his session.
 */

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { buildStamp } from './platform/build-identity';
import { startOfflineSupport } from './platform/offline-start';
import type { OfflineStartOutcome } from './platform/offline-start';
import { PlatformStatusProvider } from './platform/platform-status';
import { LocalStorageJournal, StoragePersistence } from './platform/storage-persistence';
import type { PersistenceRecord } from './platform/storage-persistence';
import { router } from './shell/routes';

const ROOT_ELEMENT_ID = 'root';

const OFFLINE_START_PENDING: OfflineStartOutcome = {
  registered: false,
  reason: 'still being set up',
};

/**
 * Asks the platform its two questions once, after mount, and publishes the answers.
 *
 * The persistence answer is journalled by `StoragePersistence` itself, so a refusal on this device
 * is on record whether or not anyone is looking at the admin screen when it happens.
 */
function Application() {
  const [persistence, setPersistence] = useState<PersistenceRecord | null>(null);
  const [offlineStart, setOfflineStart] = useState<OfflineStartOutcome>(OFFLINE_START_PENDING);

  useEffect(() => {
    let stillMounted = true;

    const persistenceRequest = new StoragePersistence({
      storage: navigator.storage,
      journal: new LocalStorageJournal(window.localStorage),
    });

    // Show the previously recorded answer immediately, so the admin screen is never blank on a
    // device that has already been asked, then replace it with this session's answer.
    const previous = persistenceRequest.lastRecordedAnswer();
    if (previous !== null) setPersistence(previous);

    void persistenceRequest.requestAndRecord().then((record) => {
      if (stillMounted) setPersistence(record);
    });

    void startOfflineSupport(import.meta.env.BASE_URL).then((outcome) => {
      if (stillMounted) setOfflineStart(outcome);
    });

    return () => {
      stillMounted = false;
    };
  }, []);

  return (
    <PlatformStatusProvider status={{ buildStamp: buildStamp(), persistence, offlineStart }}>
      <RouterProvider router={router} />
    </PlatformStatusProvider>
  );
}

const rootElement = document.getElementById(ROOT_ELEMENT_ID);
if (rootElement === null) {
  throw new Error(`the application cannot start: no #${ROOT_ELEMENT_ID} element in the document`);
}

createRoot(rootElement).render(
  <StrictMode>
    <Application />
  </StrictMode>,
);
