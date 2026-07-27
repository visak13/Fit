/**
 * THE SYNCHRONISATION SEAM, FILLED FROM THE LOCAL STORE — the one line `main.tsx` said a later step
 * would change, and the join `core/INTEGRATION.md` recorded as unbuilt.
 *
 * `main.tsx` had `NO_BACKUP_YET` in this position. That literal was TRUE rather than a placeholder —
 * no pass had ever run, so nothing had ever been backed up because nothing yet could be, and "never
 * synchronised, nothing queued" is exactly what `accountabilityStatus()` returns over a store in that
 * condition. This component makes it false, by replacing the SOURCE and nothing else.
 * `SyncStatus.tsx`, `sync-indicator.ts` and the frame are untouched by it, which is what that seam was
 * shaped for.
 *
 * ## WHAT IT DOES, IN THE ORDER THE SEAM'S OWN CONTRACT LISTS IT
 *
 *  1. Opens nothing — it uses the store `platform/LocalStore.tsx` already opened — and calls
 *     `accountabilityStatus(store, { in_progress, last_attempt, credential })`, pushing the result
 *     into `SyncStatusProvider` UNCHANGED. The reading is a SUBSET of that object, field for field and
 *     name for name; nothing is converted and nothing is renamed.
 *  2. Re-reads after EVERY attempt, on all five declared opportunities, and on a modest interval
 *     besides — the two periodicities are `sync-runner.ts`'s and they are deliberately not one timer.
 *  3. Hands the LIVE report to `recordCompletedSync`, which is the join. That happens inside
 *     {@link runSyncPass} and never here: by the time a report reaches this component's state it has
 *     already been offered for recording, so no amount of re-rendering can come between the two.
 *  4. Supplies the three acts, on their own context — see `sync-actions.tsx` for why they may not
 *     travel on the reading.
 *
 * ## THE REPORT LIVES IN A REF, AND THAT IS NOT A PERFORMANCE CHOICE
 *
 * `last_attempt` is the live `SyncReport`, and the completion brand on the flush inside it is a
 * module-private symbol that survives only while the object is the same object. A ref holds the very
 * reference; state would too, in this React, but a ref says out loud that this value is IDENTITY and
 * not data — nobody may serialise it, clone it, memoise a copy of it or lift it through anything that
 * would. What the surface reads it FOR is only the failures and the files a pass could not read; the
 * completion comes from the persisted sealed value and from nowhere else.
 *
 * ## THE ONE WINDOW WHERE THE SEAM IS STILL THE EMPTY READING, STATED RATHER THAN HIDDEN
 *
 * Between the store opening and the first reading arriving — two indexed reads and one meta row on an
 * already-open database — the seam still carries `NO_BACKUP_YET`, which says "nothing has been backed
 * up yet". That is a bounded transient, it is the same one `RemovalsFromStore.tsx` names for its own
 * seam, and it is honest in a way the alternatives are not: holding the children back until the read
 * lands would put a blank screen in front of the coach, which this application may not do, and a sixth
 * "not measured yet" field would be a state he could learn to read as normal.
 *
 * The state that LASTS — the store never opening at all — is not left to that transient. It is the
 * reason this component keeps publishing the empty reading rather than a hopeful one: with no store
 * there is no evidence of a backup, and "nothing is backed up" is the true and useful thing to say.
 *
 *     npm run test:shell
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { SYNC_TRIGGERS } from '../../core/sync/sync.js';
import { useLocalStore } from '../platform/LocalStore';
import type { RemoteConfirmation } from '../screens/removals';
import { RemovalsFromStore } from './RemovalsFromStore';
import { NO_PASS_HAS_REPORTED, remoteConfirmationFrom } from './removals-source';
import { NO_BACKUP_YET, SyncStatusProvider } from './SyncStatus';
import type { SyncStatusReading } from './sync-indicator';
import { SyncActionsProvider } from './sync-actions';
import type { SyncActions } from './sync-actions';
import {
  armSyncOpportunities, browserSyncEnvironment, oneAtATime, readSyncReading, runSyncPass,
} from './sync-runner';
import type { RemoteCopy, SyncEnvironment } from './sync-runner';
import type { LocalStore } from '../../core/store/store.js';

/**
 * WHERE THE BACKUP ACTUALLY IS, AND WHAT MAY BE SENT TO IT — injected at the composition root.
 *
 * Three things rather than a Google-shaped object, because nothing in this file may know a provider
 * exists: `main.tsx` supplies the real Drive copy and the real connection, and that is the ONLY place
 * in the interface that decides where the coach's data goes. There is no branch here, no environment
 * check and no flag — the same pattern `OpeningLocalStore` uses for `open`, which is what makes it the
 * same component in the application and under a test.
 */
export interface BackupAccess {
  /** The remote copy, behind the core's port. */
  readonly remote: RemoteCopy;
  /**
   * What may be sent right now, in the shape `accountabilityStatus` already accepts.
   *
   * Read on every refresh rather than captured: there is no refresh token, so a tab that has just been
   * opened has a remembered connection and no live token at all, and that transition happens without
   * anything re-rendering.
   */
  readonly credential: () => { readonly present?: boolean; readonly expired?: boolean } | null;
  /**
   * Connect or reconnect, inside the gesture that asked.
   *
   * It returns a sentence to SHOW or null, and it never throws: every way this can fail is a state the
   * coach is told about in his own language, and the sentence is always one of this application's own.
   * Nothing a provider said comes back through here.
   */
  readonly connect: (
    event: { readonly isTrusted?: boolean; readonly type?: string },
    store: LocalStore,
  ) => Promise<string | null>;
}

/** The reading, and WHICH store it was read from. @see RemovalsFromStore for the same shape and why. */
interface ReadingFromStore {
  readonly from: LocalStore;
  readonly reading: SyncStatusReading;
}

/**
 * THE REMOTE HALF OF A DELETION, FROM THE LAST PASS — the second thing a live report is needed for.
 *
 * A per-client deletion that did not reach the backup rides `SyncReport.deletions.still_present`, and
 * `removals-source.ts` already holds the derivation, the words, the drawing and the tests for it. What
 * it did not have was a caller, because nothing in this application had ever held a live report. This
 * is that caller, and it is the SAME object the completion was recorded from: one holder, one report,
 * two consumers.
 *
 * It is a context rather than a prop threaded through `main.tsx` because the consumer sits several
 * providers below the runner. It carries FROZEN DATA and nothing callable, and it is not a sixth seam:
 * the seam is `RemovalsProvider`, which is untouched, and this is one layer below it — the same
 * distinction `platform/LocalStore.tsx` draws about being the SOURCE rather than a seam.
 */
const LastPassContext = createContext<RemoteConfirmation>(NO_PASS_HAS_REPORTED);

/**
 * THE HAND-OFF, AND IT IS A CONNECTION RATHER THAN A SECOND PATH.
 *
 * `main.tsx` had `<RemovalsFromStore remote={NO_PASS_HAS_REPORTED}>`, which was TRUE: no pass had ever
 * reported, so there was nothing to say either way. This replaces that literal with what the last real
 * pass reported, through the derivation that already existed. Nothing about `RemovalsFromStore`,
 * `Removals.tsx`, `screens/removals.ts` or the screen changes — the re-read rides the `remote` prop's
 * own dependency list, exactly where that file said the synchronisation trigger belonged.
 *
 * The default is the honest literal, so this component outside a runner cannot invent good news.
 */
export function RemovalsFromLastPass({ children }: { children: ReactNode }) {
  const remote = useContext(LastPassContext);
  return <RemovalsFromStore remote={remote}>{children}</RemovalsFromStore>;
}

export function SyncFromStore({
  backup,
  environment,
  children,
}: {
  backup: BackupAccess;
  /**
   * The world the opportunities are observed in. Injected so every one of the five can be fired and
   * asserted with no browser; `main.tsx` passes the real window.
   */
  environment?: SyncEnvironment;
  children: ReactNode;
}) {
  const opening = useLocalStore();
  const store = opening.state === 'open' ? opening.store : null;

  const [read, setRead] = useState<ReadingFromStore | null>(null);
  const [running, setRunning] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  /**
   * What the last pass said about deletions that did not reach the backup.
   *
   * Derived the instant the pass returns and kept as plain frozen data, unlike `lastAttempt` below:
   * `remoteConfirmationFrom` reads declared fields only and copies what it needs, so nothing here
   * depends on the live object's identity. It is state rather than a ref precisely because a new one
   * MUST re-render — a fresh value is the announcement that a pass ran, and it is the only trigger the
   * pending-removal surface has.
   */
  const [confirmation, setConfirmation] = useState<RemoteConfirmation>(NO_PASS_HAS_REPORTED);

  /**
   * The most recent report of this session, BY REFERENCE. See the header: this is identity, not data.
   * It is deliberately not state — a re-render must not be able to replace it with a copy.
   */
  const lastAttempt = useRef<unknown>(null);

  /**
   * Everything the acts and the timers need, rebuilt only when the store or the access changes.
   *
   * `oneAtATime` lives here rather than inside the effect so that the tap and the timers share ONE
   * guard: two guards would let a manual tap and an interval pass run together, which is the race the
   * snapshot repair exists to detect rather than to cause.
   */
  const engine = useMemo(() => {
    if (store === null) return null;

    /**
     * WHETHER A PASS IS RUNNING, held here rather than asked of the guard — and the difference was a
     * REAL DEFECT, found by walking the application rather than by any test.
     *
     * `oneAtATime` clears its own in-flight flag in ITS `finally`, which runs AFTER the callback's. So
     * a refresh at the end of the pass that ASKED THE GUARD was still told "busy", and it published a
     * reading carrying `in_progress: true` — which then stood until the next pass or the next tick of
     * the reading timer. The screen read "Everything is backed up. Backing up now.", a sentence that
     * contradicts itself, over a device where nothing was happening at all.
     *
     * That is the exact failure `core/status/reasons.js` exists to prevent — an indeterminate
     * in-progress state left in front of the coach — arriving through the interface rather than
     * through the core. So the runner states the fact it actually knows, in the order it knows it,
     * instead of inferring it from a guard whose clearing it does not control.
     */
    const passInFlight = { now: false };

    const refresh = async () => {
      const reading = await readSyncReading(store, {
        inProgress: passInFlight.now,
        lastAttempt: lastAttempt.current,
        credential: backup.credential(),
      });
      setRead({ from: store, reading });
    };

    const guard = oneAtATime(async (trigger: string) => {
      passInFlight.now = true;
      setRunning(true);
      // The reading is refreshed BEFORE the pass as well as after it, so `in_progress` reaches the
      // screen while the pass is still running. Without it the coach taps and nothing changes until
      // the pass finishes, which on a slow connection is exactly when he most needs to be told
      // something is happening — and it is the core's own rule that in-progress sits BESIDE the
      // figures rather than replacing them.
      await refresh();
      try {
        const { report } = await runSyncPass(store, backup.remote, { trigger });
        // The live object, by reference. It has ALREADY been offered to `recordCompletedSync` inside
        // the pass; this is the surface's read of its failures and its skipped files.
        lastAttempt.current = report;
        // THE SECOND CONSUMER OF THE SAME REPORT, and the last hop of a7's work: the remote half of a
        // deletion that did not reach the backup. Derived here, from this object, rather than by a
        // second path to the same screen.
        setConfirmation(remoteConfirmationFrom(report));
      } finally {
        // CLEARED BEFORE THE LAST REFRESH, and the order is the whole of the fix above: a refresh that
        // ran while this still said "running" would publish a reading claiming a pass is in flight,
        // and that reading is what the coach would be left looking at.
        passInFlight.now = false;
        setRunning(false);
        await refresh();
      }
    });

    return { guard, refresh };
  }, [store, backup]);

  useEffect(() => {
    if (engine === null) return undefined;
    return armSyncOpportunities({
      environment: environment ?? browserSyncEnvironment(window),
      runPass: (trigger) => {
        void engine.guard.run(trigger);
      },
      refreshReading: () => {
        void engine.refresh();
      },
    });
  }, [engine, environment]);

  const actions = useMemo<SyncActions>(
    () => ({
      connect: (event) => {
        if (store === null) return;
        void (async () => {
          const said = await backup.connect(event, store);
          setRefusal(said);
          // Whether it succeeded or refused, what may be sent has changed and the indicator must say
          // so. On success the queue's credential holds are released by the pass itself, because
          // `manual` is one of the opportunities the engine releases them at.
          if (said === null) await engine?.guard.run(SYNC_TRIGGERS.MANUAL);
          else await engine?.refresh();
        })();
      },
      synchronise: () => {
        void engine?.guard.run(SYNC_TRIGGERS.MANUAL);
      },
      running,
      refusal,
    }),
    [backup, engine, running, refusal, store],
  );

  const reading = useMemo<SyncStatusReading>(
    () => (read !== null && read.from === store ? read.reading : NO_BACKUP_YET),
    [read, store],
  );

  return (
    <SyncStatusProvider reading={reading}>
      <SyncActionsProvider actions={actions}>
        <LastPassContext.Provider value={confirmation}>{children}</LastPassContext.Provider>
      </SyncActionsProvider>
    </SyncStatusProvider>
  );
}
