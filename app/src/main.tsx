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
 *
 * THE LOCAL STORE IS NOW OPENED THE SAME WAY, at the bottom of this file, and it is the third
 * request of the three. See the note there for why it wraps the application rather than sitting
 * among the seams.
 *
 * WHAT THAT CHANGES ABOUT THE FIVE SEAMS BELOW. Their comments used to say "this build has no local
 * store", and that has stopped being the reason: this build HAS one. The pending-removal seam is now
 * fed from it and is no longer a literal. The other four literals are still TRUE, but each now
 * states the reason that actually holds — no synchronisation has ever run, so nothing has been
 * backed up, nothing has been compared, and nothing has been queued and stopped; and the hidden
 * space has never been reached, so no key survey has ever happened. Each is exactly what its real
 * call returns over a store in that condition, which is what they were chosen to be.
 *
 * A REASON THAT HAS STOPPED BEING TRUE IS WORSE THAN NO REASON, which is why this was worth a pass
 * of its own: the next builder reads the comment beside the value, not the header, and "there is no
 * store" would send them looking for one to add.
 */

// FIRST, AND ON PURPOSE. This one import is the whole visual foundation: the shared token layer
// from its single home under `design/tokens`, then Console's own structural roles. It is imported
// before anything that renders, so no component can load a style of its own ahead of the layer it
// is supposed to be built from. See `src/design/design-system.ts` for why the layer is consumed
// where it lives rather than copied in.
import './design/design-system';

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { startBrowserChromeColour } from './design/browser-chrome';
import { DARK_PREFERENCE_QUERY, startThemeController } from './design/theme';
import { buildStamp } from './platform/build-identity';
import { OpeningLocalStore } from './platform/LocalStore';
import { openTheLocalStore } from './platform/local-store';
import { startOfflineSupport } from './platform/offline-start';
import type { OfflineStartOutcome } from './platform/offline-start';
import { PlatformStatusProvider } from './platform/platform-status';
import { LocalStorageJournal, StoragePersistence } from './platform/storage-persistence';
import type { PersistenceRecord } from './platform/storage-persistence';
import { DivergenceProvider, NOTHING_TO_DECIDE } from './shell/Divergences';
import { KeyMaterialProvider, NO_KEY_MATERIAL_CONDITION } from './shell/KeyMaterial';
import { RemovalsFromStore } from './shell/RemovalsFromStore';
import { NOTHING_STOPPED, StoppedChangesProvider } from './shell/StoppedChanges';
import { createAppRouter } from './shell/routes';
import { NO_BACKUP_YET, SyncStatusProvider } from './shell/SyncStatus';

const ROOT_ELEMENT_ID = 'root';

/**
 * The one hash router, built here because this is the file that already knows it is in a browser.
 * `shell/routes.tsx` owns the table it is built from; see the note there for why the two are apart.
 */
const router = createAppRouter();

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

    // The theme is already ON the root element — `index.html` put it there before the first frame,
    // because a module cannot run early enough to prevent a dark-themed phone flashing white. What
    // starts here is the part that outlives that instant: following the device for as long as the
    // choice is `system`, and remembering an explicit choice. Both are stopped on unmount, in the
    // scope that opened them.
    const theme = startThemeController({
      root: document.documentElement,
      storage: window.localStorage,
      darkPreference: window.matchMedia(DARK_PREFERENCE_QUERY),
    });
    const stopChromeColour = startBrowserChromeColour(document);

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
      theme.stop();
      stopChromeColour();
    };
  }, []);

  return (
    <PlatformStatusProvider status={{ buildStamp: buildStamp(), persistence, offlineStart }}>
      {/*
        THE SYNCHRONISATION SEAM, and this is the one place it is filled in.

        The permanent indicator in the frame renders whatever this provider gives it and never
        invents a state of its own. Today that is `NO_BACKUP_YET`, which is not a placeholder value
        so much as a TRUE one: real synchronisation is a later step, so no pass has ever run,
        nothing has ever been backed up because nothing yet can be, and "never synchronised,
        nothing queued" is exactly what `accountabilityStatus()` returns over a store in that
        condition.

        THE LATER STEP CHANGES THIS LINE AND NOTHING BELOW IT: it opens the local store, calls
        `accountabilityStatus(store, { in_progress, last_attempt, credential })` from
        `core/status`, and pushes each result in here — on every synchronisation opportunity in
        `SYNC_TRIGGERS`, after every attempt, and on an interval besides, because the escalation
        ladder climbs with the clock even when nothing happens. `SyncStatus.tsx` states the whole
        contract, including the action the tap is waiting for.
      */}
      <SyncStatusProvider reading={NO_BACKUP_YET}>
        {/*
          THE DIVERGENCE SEAM, filled in here for the same reason and on the same terms.

          `NOTHING_TO_DECIDE` is not a placeholder: no synchronisation has ever run, so no two devices
          have ever been compared, so nothing is waiting to be decided and nothing can be answered.
          `resolve` is null, and the picker therefore offers no buttons — a control that cannot do
          what its words say is worse than no control.

          THE LATER STEP CHANGES THIS LINE AND NOTHING BELOW IT: it takes `report.divergences` from
          each `syncNow` pass and pushes them in as `pending`, and supplies `resolve` as a call
          through to `resolveDivergence` from `core/sync/resolution.js` — the one place a divergence
          is ever applied and the one call site of `sync.conflict_resolved`. It must re-read after
          every resolution, so an answered question stops being asked. `shell/Divergences.tsx`
          states the whole contract.
        */}
        <DivergenceProvider reading={NOTHING_TO_DECIDE}>
          {/*
            THE KEY-MATERIAL SEAM, filled in here on the same terms as the two above it.

            `NO_KEY_MATERIAL_CONDITION` is not a placeholder either: this build never reaches the
            hidden space, so no survey has ever run and no duplicate can have been detected. The
            reading carries a condition and NOTHING ELSE — there is deliberately no way back on it,
            because the user ruled this surface read-only on 2026-07-26.

            THE LATER STEP CHANGES THIS LINE AND NOTHING BELOW IT: it catches the `CryptoError`
            thrown by `establishKeyMaterial` in `core/crypto/guard.js` and pushes it in as
            `condition`, unchanged and with its `found` array intact. It adds no function here, and
            it words any further condition by adding a member in
            `screens/key-material-condition.ts`. `shell/KeyMaterial.tsx` states the whole contract.
          */}
          <KeyMaterialProvider reading={NO_KEY_MATERIAL_CONDITION}>
            {/*
              THE STOPPED-CHANGES SEAM, on the same terms as the three above it.

              `NOTHING_STOPPED` is not a placeholder: no synchronisation has ever run, so nothing has ever
              been queued, so nothing can have stopped — which is exactly what `needsAttention` returns
              over a store in that condition.

              THE LATER STEP CHANGES THIS LINE AND NOTHING BELOW IT: it opens the local store, calls
              `needsAttention(store, { limit, after })` from `core/outbox/status.js`, and pushes the
              result in UNCHANGED — BOTH PAGES, separately. Merging them into one list is the one thing
              it must not do; `core/outbox/status.js` returns two because the two need different words
              in front of the coach. It re-reads after every flush, because an entry that stops does so
              during a pass and at no other moment. It adds NO retry and NO discard here: both are
              deliveries and belong to the step that owns the credential. `shell/StoppedChanges.tsx`
              states the whole contract.
            */}
            <StoppedChangesProvider reading={NOTHING_STOPPED}>
              {/*
                THE PENDING-REMOVAL SEAM — AND IT IS NO LONGER A FROZEN LITERAL. This is the later
                step the four comments above are still waiting for, taken for this seam alone.

                `RemovalsFromStore` calls `pendingDeletions(store, { limit, after })` from
                `core/store/purge.js` over the store opened above and pushes the page in as `pending`,
                manifests and cursor intact. It replaced the SOURCE: `shell/Removals.tsx`,
                `screens/removals.ts` and the screen are untouched, which is what that seam was shaped
                for.

                IT ALSO RE-READS AFTER A REMOVAL MADE ON THIS DEVICE, which it did not at first and
                which was a real defect: it filled ONCE per store, and the register had since become
                a second writer of the same record, so a coach who removed somebody and came here was
                told nothing was waiting. The trigger is a COUNT on the store provider above — see
                `platform/local-store.ts` for why a number rather than a notification mechanism, and
                why it deliberately reaches nothing but this one seam. THE FOUR LITERALS ABOVE ARE
                NOT FED BY IT and must not be: they are frozen because no synchronisation has run,
                which is honest, and a signal that started them reading would have them claim things
                nobody has measured.

                WHAT IT STILL DOES NOT DO, and it is reported rather than faked: it does not re-read
                after a synchronisation pass, because this build has no synchronisation to re-read
                after — `verifyAndMarkPropagated` is what moves a manifest out of pending and it only
                runs during a pass. That trigger is S16's and it belongs on the same dependency list,
                not on a second mechanism. The remote half — which record identities are STILL
                PRESENT in the backup — rides `SyncReport.deletions.still_present` and is S16's to add
                to this same surface, not a second screen. `shell/RemovalsFromStore.tsx` states the
                whole of it.
              */}
              <RemovalsFromStore>
                <RouterProvider router={router} />
              </RemovalsFromStore>
            </StoppedChangesProvider>
          </KeyMaterialProvider>
        </DivergenceProvider>
      </SyncStatusProvider>
    </PlatformStatusProvider>
  );
}

const rootElement = document.getElementById(ROOT_ELEMENT_ID);
if (rootElement === null) {
  throw new Error(`the application cannot start: no #${ROOT_ELEMENT_ID} element in the document`);
}

/*
  THE LOCAL STORE, OPENED FOR THE FIRST TIME IN THIS APPLICATION.

  It wraps the whole application rather than sitting among the seams, because it is the SOURCE all
  five of them are eventually fed from, and because wrapping here leaves every one of their comments
  and their indentation exactly where it was — the seams are what a later step edits, and a whole-file
  reindentation would bury those edits in noise.

  It is opened AFTER MOUNT and its state is a VALUE, not a promise anything waits on: `opening`,
  `open`, and `could not be opened` carrying a sentence saying why. That is the same rule the two
  platform requests above follow — the application always opens and always works, and a database that
  refuses is a condition to REPORT, never a blank screen, never an error at start, and never a spinner
  that does not resolve. `platform/local-store.ts` holds every word of every refusal.

  `openTheLocalStore` is passed in rather than reached for, and it is a module-level function so the
  reference is stable: the store is opened once, not on every render.
*/
createRoot(rootElement).render(
  <StrictMode>
    <OpeningLocalStore open={openTheLocalStore}>
      <Application />
    </OpeningLocalStore>
  </StrictMode>,
);
