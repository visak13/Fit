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
 *  2. Re-reads after EVERY attempt, on all six declared opportunities, and on a modest interval
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
import type { SyncSeamReading } from './sync-indicator';
import { AccountActionsProvider } from './account-actions';
import type { AccountActions } from './account-actions';
import type { AccountActOutcome } from '../screens/admin-report';
import { SyncActionsProvider } from './sync-actions';
import type { SyncActions } from './sync-actions';
import {
  armSyncOpportunities, browserSyncEnvironment, holdAttempts, oneAtATime, readSyncReading,
  runSyncPass,
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
  /**
   * THE WAY OUT — sign out of the account on this device, and the separate act of erasing it.
   *
   * Two members and not one with a flag, the whole way down: `platform/google-account.ts` keeps them
   * as two routines precisely so that "sign out" and "destroy everything here" can never become one
   * code path with a boolean on it.
   *
   * Both take the store, like `connect` does, and neither throws: every way they can fail is a state
   * the coach is told about in his own language, carried back as an outcome rather than as an
   * exception. Nothing a provider said comes through here either — a failure's own text rides the
   * outcome's `verbatim`, apart from this application's words, so it cannot be spliced into prose.
   */
  readonly signOut: (store: LocalStore) => Promise<AccountActOutcome>;
  /**
   * Sign out AND erase this device.
   *
   * @param reading the delivery figures the gate reads. Passed IN rather than looked up: the live
   * `accountabilityStatus()` result is held here, and a second read of the same queue for the same
   * question is two answers where the whole point is that there is one.
   * @param acknowledged he has read what will be lost and said go ahead. It is minted into a real
   * acknowledgement only where the gate's verdict allows one; nothing here decides that.
   */
  readonly eraseThisDevice: (
    store: LocalStore,
    reading: DeliveryFiguresOutcome,
    acknowledged: boolean,
  ) => Promise<AccountActOutcome>;
}

/**
 * The delivery figures the erase gate reads, as the interface passes them along.
 *
 * Structural rather than imported from the platform, for the reason that module gives about the same
 * shape on its own side: this file may not know a provider exists. The names are the core's own, so
 * the reading this component already holds IS one of these.
 */
export interface DeliveryFigures {
  readonly pending: number;
  readonly waiting_for_credential: number;
  readonly rejected: number;
  readonly ambiguous: number;
  readonly oldest_undelivered_label: string | null;
  readonly oldest_undelivered_age_ms: number | null;
  /**
   * The leading reason, carried so the gate's refusal can name only what the indicator is offering.
   *
   * The reading this component already holds HAS it under this name, so nothing new is read and
   * nothing is converted — which is the point. Two sentences derived from one fact cannot contradict
   * each other, and this pair did.
   */
  readonly reason: { readonly action: string | null } | null;
}

/**
 * THE FIGURES, OR THE FACT THAT THERE ARE NONE — what the erase gate is actually handed.
 *
 * Structural, like {@link DeliveryFigures} above and for the same reason. The reading this component
 * holds IS one of these: `sync-runner.ts` publishes three outcomes and this passes the outcome
 * through whole, so the panel that names what he would lose and the gate that decides whether he may
 * are still reading ONE object — including when that object says the read never came back.
 *
 * That last case is the whole of this type's existence. The reading used to fall back to the empty
 * literal on a failed read, and its four zeroes read to the gate as a device with nothing to lose.
 */
export type DeliveryFiguresOutcome =
  | ({ readonly status: 'not_yet' | 'read' } & DeliveryFigures)
  | { readonly status: 'failed'; readonly failure: { readonly stage: string; readonly errorName: string } };

/** The reading, and WHICH store it was read from. @see RemovalsFromStore for the same shape and why. */
interface ReadingFromStore {
  readonly from: LocalStore;
  readonly reading: SyncSeamReading;
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
   * The world the opportunities are observed in. Injected so every one of the six can be fired and
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
   * Whether a sign-out or an erase is in flight, and what the last one did.
   *
   * Kept apart from `running` above rather than sharing it: a backup pass and a sign-out are
   * different waits, and a card that greyed itself out because an unrelated interval pass had
   * started would be telling him the control was busy when it was not.
   */
  const [accountRunning, setAccountRunning] = useState(false);
  const [accountOutcome, setAccountOutcome] = useState<AccountActOutcome | null>(null);

  /**
   * The attempts of this session, BY REFERENCE. See the header: this is identity, not data. It is
   * deliberately not state — a re-render must not be able to replace it with a copy.
   *
   * It became a holder rather than a bare report because the bare report was destroying a true
   * finding: a pass that failed before it reached the union reports no skipped files, and the
   * surface, reading the latest report alone, dropped "your backup is missing files" on the next
   * dropped signal. {@link holdAttempts} keeps the OUTCOME of the latest pass and the OUTSTANDING
   * FINDING apart — read its own header for the trap in the obvious fix.
   */
  const attempts = useRef(holdAttempts());

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
        lastAttempt: attempts.current.forTheSurface(),
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
        attempts.current.record(report);
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
        // `void` DISCARDS A REJECTION, and it is safe here for one reason only: `readSyncReading`
        // reports a failed read as an OUTCOME and no longer rejects, so there is nothing left for
        // this to drop. It used to have no catch at all — the rejection escaped through here
        // unhandled, `setRead` never ran, and the seam stood at NO_BACKUP_YET, whose four zeroes the
        // erase gate then read as a device with nothing to lose. Anything awaited inside `refresh`
        // that CAN reject must report an outcome the way the read does, or this line goes back to
        // being the hole it was.
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

  const reading = useMemo<SyncSeamReading>(
    () => (read !== null && read.from === store ? read.reading : NO_BACKUP_YET),
    [read, store],
  );

  /**
   * THE TWO WAYS OUT OF THIS DEVICE, on their own context beside the acts above.
   *
   * They are here rather than in a component of their own for ONE reason, and it is the reason this
   * file already gives about the last pass's report: the erase gate reads the delivery figures, and
   * this is the one holder of a live `accountabilityStatus()` result. A second component would have
   * to read the same queue again to answer the same question, and two reads of one queue is two
   * answers — the second of which is the one that goes wrong, silently, in front of a destructive
   * button. One holder, one reading, three consumers now.
   *
   * THE READING IT PASSES IS THE ONE ON SCREEN. `reading` is what the coach is looking at when he
   * presses, which is the whole point: the panel that named what he would lose and the gate that
   * decides whether he may are reading the same object. The mechanism re-checks the figure once more
   * at the last moment for the case where the queue moved while he was reading — see
   * `EraseAcknowledgement` — and that re-check is its own, not a second one added here.
   */
  const accountActions = useMemo<AccountActions>(
    () => ({
      signOut: () => {
        if (store === null || accountRunning) return;
        setAccountRunning(true);
        void (async () => {
          try {
            setAccountOutcome(await backup.signOut(store));
          } finally {
            setAccountRunning(false);
            // What may be sent has changed, so the indicator must say so. `refresh` and not a pass:
            // there is no credential to run one with any more.
            await engine?.refresh();
          }
        })();
      },
      eraseThisDevice: (acknowledged: boolean) => {
        if (store === null || accountRunning) return;
        setAccountRunning(true);
        void (async () => {
          try {
            setAccountOutcome(await backup.eraseThisDevice(store, reading, acknowledged));
          } finally {
            setAccountRunning(false);
            // NO REFRESH AFTER THIS ONE. A successful erase has closed the store and deleted the
            // database; reading it again would be this component asking a question of a thing it
            // just destroyed. A REFUSAL leaves everything exactly as it was, so there is nothing new
            // to read either — the figures it refused on are the figures already on screen.
          }
        })();
      },
      // THE SAME OBJECT the erase call above passes to the gate. The card reads these to say what is
      // outstanding; the gate reads them to decide. One reading, so the two cannot disagree.
      figures: reading,
      running: accountRunning,
      last: accountOutcome,
    }),
    [backup, engine, store, reading, accountRunning, accountOutcome],
  );

  return (
    <SyncStatusProvider reading={reading}>
      <SyncActionsProvider actions={actions}>
        <AccountActionsProvider actions={accountActions}>
          <LastPassContext.Provider value={confirmation}>{children}</LastPassContext.Provider>
        </AccountActionsProvider>
      </SyncActionsProvider>
    </SyncStatusProvider>
  );
}
