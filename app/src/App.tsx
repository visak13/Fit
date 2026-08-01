/**
 * THE APPLICATION, AND THE FIVE SEAMS IT FILLS IN.
 *
 * Split out of `main.tsx`, which is now the composition root and nothing else: it decides where the
 * coach's data is sent, finds the element, and renders this. THE SPLIT IS WHAT MAKES THE COMPOSITION
 * ROOT EXPLICIT — while this component and the render call lived in one file, importing the application
 * meant MOUNTING it, so there was exactly one possible root and every dependency choice was implicit in
 * having no alternative. Now the choices are arguments, and a root that supplies different ones is a
 * separate file rather than a branch inside this one.
 *
 * Order still matters and the reason is unchanged. The interface is mounted FIRST, with the platform
 * facts still unknown, and the two platform requests — offline support and persistent storage — are made
 * afterwards, updating the interface when they answer. Waiting for both before rendering anything would
 * mean a browser that is slow or unwilling to answer produces a blank screen. The standing rule for this
 * application is that it always opens and always works; nothing platform-related is allowed to stand
 * between the coach and his session.
 *
 * The local store is opened by the root the same way, and wraps this whole component, because it is the
 * SOURCE the seams are fed from.
 *
 * ## WHERE THE FIVE SEAMS STAND, WHICH IS NOT WHERE THEY STOOD
 *
 * Their comments once said "this build has no local store". That stopped being true, and then "no
 * synchronisation has ever run" stopped being true as well. THREE of the five are now fed from real
 * sources: the pending-removal seam from the store, the synchronisation seam from real passes, and the
 * remote half of a removal from the report those passes return.
 *
 * THE TWO REMAINING LITERALS ARE STILL TRUE, AND THEIR REASONS ARE NARROWER THAN THEY WERE. Neither may
 * lean on "nothing has synchronised" any more:
 *
 *   - the DIVERGENCE seam is `NOTHING_TO_DECIDE` because a divergence is only ever SURFACED by a pass
 *     and never resolved by one, and applying the side he picked is `resolution.js`'s single call site —
 *     which has no caller in the interface yet. A pass that finds one now reports it; what is missing is
 *     the screen's way back, and `resolve` being null is what keeps the picker from offering a button it
 *     cannot honour.
 *   - the KEY-MATERIAL seam is `NO_KEY_MATERIAL_CONDITION` because nothing in the interface calls
 *     `establishKeyMaterial`, so no survey of the hidden space has been attempted here.
 *
 * A REASON THAT HAS STOPPED BEING TRUE IS WORSE THAN NO REASON: the next builder reads the comment
 * beside the value, not the header, and a reason that has quietly expired reads as an invitation.
 */

import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';

import { startBrowserChromeColour } from './design/browser-chrome';
import { DARK_PREFERENCE_QUERY, startThemeController } from './design/theme';
import { buildStamp } from './platform/build-identity';
import { startOfflineSupport } from './platform/offline-start';
import type { OfflineStartOutcome } from './platform/offline-start';
import { PlatformStatusProvider } from './platform/platform-status';
import { LocalStorageJournal, StoragePersistence } from './platform/storage-persistence';
import type { PersistenceRecord } from './platform/storage-persistence';
import { DivergenceProvider, NOTHING_TO_DECIDE } from './shell/Divergences';
import { NewVersionProvider } from './shell/NewVersion';
import { A_NEW_VERSION_IS_WAITING, NO_NEW_VERSION_WAITING } from './shell/new-version';
import type { NewVersionReading } from './shell/new-version';
import { KeyMaterialProvider, NO_KEY_MATERIAL_CONDITION } from './shell/KeyMaterial';
import { NOTHING_STOPPED, StoppedChangesProvider } from './shell/StoppedChanges';
import { createAppRouter } from './shell/routes';
import { RemovalsFromLastPass, SyncFromStore } from './shell/SyncFromStore';
import type { BackupAccess } from './shell/SyncFromStore';

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
 * The persistence answer is journalled by `StoragePersistence` itself, so a refusal on this device is on
 * record whether or not anyone is looking at the admin screen when it happens.
 *
 * ## WHY THE BACKUP ARRIVES AS AN ARGUMENT
 *
 * `backup` is the ONE dependency this application cannot have two of and cannot fake: where the coach's
 * data is actually sent. `main.tsx` supplies the real Google Drive copy, unconditionally — no branch, no
 * environment check, no flag. That property is worth more than it looks: a production file that could be
 * talked into pointing the backup somewhere else would be a worse defect than any this application has
 * had, and it would be live in a public bundle.
 *
 * Injecting it at the composition root is the OPPOSITE of that, and it is the pattern this tree already
 * chose — `OpeningLocalStore` takes `open` for exactly this reason, so that it is *the same component in
 * the application and in a test*. The component is identical whoever supplies the value; only the root
 * differs. That is what lets the synchronisation join be observed end to end against the core's own
 * in-memory remote, in a real browser over a real database, without a line of production code knowing it
 * happened.
 */
export function Application({ backup }: { backup: BackupAccess }) {
  const [persistence, setPersistence] = useState<PersistenceRecord | null>(null);
  const [offlineStart, setOfflineStart] = useState<OfflineStartOutcome>(OFFLINE_START_PENDING);
  /*
    WHETHER A NEWER BUILD HAS ARRIVED UNDER THIS RUNNING PAGE.

    It starts at "no", which is what is true and stays true almost every time the application opens,
    and it is only ever moved by the watch armed inside `startOfflineSupport` — never by a timer, never
    by anything this component decides. `platform/offline-start.ts` holds why the signal is a new worker
    reaching `installed` while this page was ALREADY controlled, rather than one sitting in `waiting`.
  */
  const [newVersion, setNewVersion] = useState<NewVersionReading>(NO_NEW_VERSION_WAITING);

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

    void startOfflineSupport(import.meta.env.BASE_URL, () => {
      if (stillMounted) setNewVersion(A_NEW_VERSION_IS_WAITING);
    }).then((outcome) => {
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
        THE SYNCHRONISATION SEAM — AND IT IS NO LONGER A FROZEN LITERAL. This is the later step the
        comment here spent two steps waiting for, and it changed this line and nothing below it.

        `SyncFromStore` opens nothing: it uses the store opened by the root, calls
        `accountabilityStatus(store, { in_progress, last_attempt, credential })` and pushes each
        result into the seam UNCHANGED — the reading is a subset of that object, field for field and
        name for name. It re-reads after every attempt, on each of the six opportunities
        `SYNC_TRIGGERS` declares, and on a modest interval besides, because the escalation ladder
        climbs with the clock even when nothing happens.

        AND IT IS THE ONE HOLDER OF A LIVE SYNCHRONISATION REPORT, which is the whole of what was
        missing. `core/INTEGRATION.md` recorded the gap and what it would cost: the engine RETURNS a
        completion, the surface reads a PERSISTED one and refuses to take a caller's word for it, and
        with nothing carrying one to the other the surface would say "never synchronised" for ever
        while synchronisation worked perfectly. The report goes straight from `syncNow` into
        `recordCompletedSync` inside `sync-runner.ts`, by reference, because the completion's brand is
        an in-process symbol that no copy of the object survives.

        `NO_BACKUP_YET` has not become a mock: it is what the seam carries in the bounded window
        before the first read lands, and it is still assembled from the core's own constants.
      */}
      <SyncFromStore backup={backup}>
        {/*
          THE DIVERGENCE SEAM, filled in here on the same terms.

          `NOTHING_TO_DECIDE` is not a placeholder, and its reason has narrowed: passes DO run now and
          a pass that meets a divergence reports it. What is missing is the way BACK — applying the
          side the coach picked is `resolveDivergence` in `core/sync/resolution.js`, the one place a
          divergence is ever applied and the one call site of `sync.conflict_resolved`, and nothing in
          the interface calls it. `resolve` is null, so the picker offers no buttons: a control that
          cannot do what its words say is worse than no control.

          THE LATER STEP CHANGES THIS LINE AND NOTHING BELOW IT: it takes `report.divergences` from
          each pass and pushes them in as `pending`, and supplies `resolve` as a call through to
          `resolveDivergence`. It must re-read after every resolution, so an answered question stops
          being asked. `shell/Divergences.tsx` states the whole contract.
        */}
        <DivergenceProvider reading={NOTHING_TO_DECIDE}>
          {/*
            THE KEY-MATERIAL SEAM, filled in here on the same terms as the two above it.

            `NO_KEY_MATERIAL_CONDITION` is not a placeholder either: nothing in the interface calls
            `establishKeyMaterial`, so the hidden space has never been surveyed from here and no
            duplicate can have been detected. The reading carries a condition and NOTHING ELSE —
            there is deliberately no way back on it, because the user ruled this surface read-only on
            2026-07-26.

            THE LATER STEP CHANGES THIS LINE AND NOTHING BELOW IT: it catches the `CryptoError`
            thrown by `establishKeyMaterial` in `core/crypto/guard.js` and pushes it in as
            `condition`, unchanged and with its `found` array intact. It adds no function here, and
            it words any further condition by adding a member in
            `screens/key-material-condition.ts`. `shell/KeyMaterial.tsx` states the whole contract.
          */}
          <KeyMaterialProvider reading={NO_KEY_MATERIAL_CONDITION}>
            {/*
              THE STOPPED-CHANGES SEAM, on the same terms as the three above it.

              `NOTHING_STOPPED` is not a placeholder, and this reason has narrowed too: passes run, so
              things CAN now be queued and can now stop. What is missing is the read —
              `needsAttention` in `core/outbox/status.js` has no caller in the interface. Until it
              does, this says nothing has stopped, which is what that call returns over a store where
              nothing has.

              THE LATER STEP CHANGES THIS LINE AND NOTHING BELOW IT: it calls `needsAttention(store,
              { limit, after })` and pushes the result in UNCHANGED — BOTH PAGES, separately. Merging
              them into one list is the one thing it must not do; `core/outbox/status.js` returns two
              because the two need different words in front of the coach. It re-reads after every
              flush, because an entry that stops does so during a pass and at no other moment. It adds
              NO retry and NO discard here: both are deliveries and belong to the step that owns the
              credential. `shell/StoppedChanges.tsx` states the whole contract.
            */}
            <StoppedChangesProvider reading={NOTHING_STOPPED}>
              {/*
                THE PENDING-REMOVAL SEAM — AND IT IS NO LONGER A FROZEN LITERAL EITHER.

                `RemovalsFromStore` calls `pendingDeletions(store, { limit, after })` from
                `core/store/purge.js` over the store opened by the root and pushes the page in as
                `pending`, manifests and cursor intact. It replaced the SOURCE: `shell/Removals.tsx`,
                `screens/removals.ts` and the screen are untouched, which is what that seam was shaped
                for.

                IT ALSO RE-READS AFTER A REMOVAL MADE ON THIS DEVICE, which it did not at first and
                which was a real defect: it filled ONCE per store, and the register had since become
                a second writer of the same record, so a coach who removed somebody and came here was
                told nothing was waiting. The trigger is a COUNT on the store provider — see
                `platform/local-store.ts` for why a number rather than a notification mechanism, and
                why it deliberately reaches nothing but this one seam. THE TWO REMAINING LITERALS
                ABOVE ARE NOT FED BY IT and must not be: each is frozen for a reason of its own, and a
                signal that started them reading would have them claim things nobody has measured.

                AND THE REMOTE HALF IS NOW FED BY A REAL PASS. `NO_PASS_HAS_REPORTED` used to sit on
                this line and it was TRUE rather than a placeholder — nothing in the build called
                `syncNow`, so no pass had reported one. `RemovalsFromLastPass` replaces that literal
                with what the last real pass said, through `remoteConfirmationFrom`, which is the
                derivation that already existed: it is CONNECTED to, never rebuilt, and there is no
                second path to this screen. The report it derives from is the SAME object the
                completion above was recorded from — one holder, one report, two consumers.

                It says nothing reassuring, and must not: `screens/removals.ts` is forbidden from
                turning an empty still-present list into "checked and clear", because
                `core/sync/engine.js` skips the verify step on most passes and an empty list means
                "nothing was checked" at least as often as it means "nothing was found".

                IT IS ALSO THE RE-READ TRIGGER THIS SEAM WAS MISSING. `remote` is in
                `RemovalsFromStore`'s dependency list, so a new report re-reads the pending page —
                `verifyAndMarkPropagated` moves a manifest out of pending during a pass and at no
                other moment. `shell/RemovalsFromStore.tsx` states the whole of it.
              */}
              <RemovalsFromLastPass>
                {/*
                  THE UPDATE PATH, WIRED. Without this line the frame's notice is silent for ever and
                  nothing anywhere is red — which is why `shell/new-version-notice.test.ts` reads THIS
                  FILE for this wiring rather than trusting it, and break-probes that check by removing
                  it. `shell/NewVersion.tsx` holds why a missing seam here draws nothing instead of
                  throwing, and why that is not in tension with the five seams that do throw.

                  Taking the newer version is a RELOAD and nothing else: the new worker has already
                  claimed the page by the time he is told, so the next document load comes out of the
                  new build's cache. It is supplied here, at the composition root, for the reason
                  everything else here is — so the component is the same component in a test.
                */}
                <NewVersionProvider reading={newVersion} take={() => window.location.reload()}>
                  <RouterProvider router={router} />
                </NewVersionProvider>
              </RemovalsFromLastPass>
            </StoppedChangesProvider>
          </KeyMaterialProvider>
        </DivergenceProvider>
      </SyncFromStore>
    </PlatformStatusProvider>
  );
}
