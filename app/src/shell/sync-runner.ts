/**
 * THE SYNCHRONISATION RUNNER — the single holder of a live synchronisation report.
 *
 * `core/INTEGRATION.md` records this file's absence as the one gap in the whole foundation, and it
 * says what happens if it stays absent: *the sync engine returns a completion; the accountability
 * surface reads a persisted one and refuses to take a caller's word for it; something must carry the
 * report from one to the other by calling `recordCompletedSync`, and if nothing does, the surface
 * will say "never synchronised" for ever while synchronisation works perfectly.* Two correct
 * components with nothing between them. This is the between.
 *
 * A permanent false alarm on the one indicator the coach is meant to trust is worse than a broken
 * one: it trains him to ignore it, and once ignored it cannot warn him when something is genuinely
 * wrong. His pay depends on this data.
 *
 * ## WHY IT IS ONE MODULE AND NOT TWO, WHICH IS THE WHOLE STRUCTURAL POINT
 *
 * Everything a pass produces is needed in three places — the persisted completion, the reading the
 * indicator draws, and the remote half of a deletion — and every one of them needs THE SAME OBJECT.
 * So there is exactly ONE holder of a live report and exactly one place a pass is run from. Two paths
 * to the surface would be the defect this file closes, rebuilt beside it.
 *
 * ## THE COMPLETION BRAND IS IN-PROCESS, AND IT LIVES ON THE FLUSH. MEASURED, NOT ASSUMED.
 *
 * `core/status/completion.js` does NOT trust a report's own `completion` field — it is plain data and
 * a hand-built report could carry one. It reaches for `report.flush` and asks `core/outbox` whether
 * THAT object carries a module-private symbol **only a flush which genuinely ran in this process can
 * hold**. So the rule is narrower and more useful than "pass the report straight through":
 *
 * **NEVER COPY THE FLUSH.**
 *
 * Six boundaries were probed against a real store rather than reasoned about, because the plan's own
 * landmine note got this wrong in both directions:
 *
 *  - **Records fine** — a shallow spread of the REPORT (`{...report}`), because that copies the flush
 *    POINTER; a completely rebuilt report that passes `report.flush` through by reference; the bare
 *    flush handed in on its own.
 *  - **Records NOTHING** — a shallow spread of the FLUSH; `JSON.parse(JSON.stringify(report))`;
 *    `structuredClone(report)`. Anything that reaches INSIDE the flush loses the symbol, yields null,
 *    and returns `{recorded: false}` — a value nobody is forced to look at.
 *
 * `structuredClone` deserves naming because it is the modern idiom for "copy this object", it is not a
 * serialisation boundary in the way JSON obviously is, and somebody warned only about spreads and JSON
 * would reach for it with no reason to think twice.
 *
 * THE SYMPTOM TO RECOGNISE: a synchronisation you know succeeded, and the indicator does not move.
 * **Look for a copy that reached into the flush** — not merely for a reshaped report, which is
 * harmless. `sync-runner.test.ts` holds all of this as break probes, each with the positive control
 * that the pass really did earn a completion first.
 *
 * ## TWO PERIODICITIES, AND THEY ARE DELIBERATELY NOT THE SAME TIMER
 *
 * {@link READING_REFRESH_MS} refreshes the READING: two local reads, no network, no token. It is what
 * makes the ladder climb with the clock, because an indicator that only updates when something
 * happens sits at healthy precisely when it should be escalating.
 *
 * {@link PERIODIC_SYNC_MS} runs a PASS: a network call that spends a token and touches the service.
 * It is one of the six declared opportunities (`interval`) and nothing else.
 *
 * Collapsing them into one timer would run a synchronisation every thirty seconds on a
 * foreground-only credential with no refresh token — battery and quota spent for nothing, hammering
 * the service while the coach is mid-session. They are separate, and their two constants say why.
 *
 * ## IT DRAWS NOTHING AND TOUCHES NO GLOBAL AT MODULE SCOPE
 *
 * The interface suite imports this outside a browser. The window, the document and the clock arrive
 * through {@link SyncEnvironment}, which is what lets every opportunity be driven and asserted with
 * no browser at all — the same rule `platform/local-store.ts` and `platform/google-identity.ts`
 * follow, and the reason `beginOpening` exists there rather than inside an effect.
 *
 *     npm run test:shell
 */

import { recordCompletedSync } from '../../core/status/status.js';
import { accountabilityStatus } from '../../core/status/status.js';
import { SYNC_TRIGGERS, syncNow } from '../../core/sync/sync.js';
import type { LocalStore } from '../../core/store/store.js';
import { failureFrom, inStage } from '../screens/read-failure.ts';
import type { SyncReadStage, SyncSeamReading, SyncStatusReading } from './sync-indicator.ts';

/**
 * THE ONE STAGE THIS READ HAS. Named once, so the tag published and the tag worded are one string.
 *
 * `readSyncReading` makes a single call, so a rejection can only have come from that call. The tag
 * still travels, because `screens/read-failure.ts` is what keeps an exception's MESSAGE out of
 * anything the screen can reach and a stage tag is half of what it publishes instead.
 */
const SYNC_READ_STAGE: SyncReadStage = 'accountability';

/**
 * The remote copy, as the core's port describes it.
 *
 * Structural rather than imported from a Google-shaped module, and that is the direction the whole
 * architecture depends on: this file runs a pass against A REMOTE. Which remote is a decision made at
 * the composition root — `main.tsx` supplies the real Drive one — and nothing here knows a provider
 * exists.
 */
export interface RemoteCopy {
  readonly list: (...args: never[]) => unknown;
}

/**
 * HOW OFTEN THE READING IS RE-READ FROM THE LOCAL STORE — cheap, local, no network.
 *
 * Thirty seconds, and the figure comes from what is on screen rather than from taste. The finest unit
 * the coach is ever spoken to in is a MINUTE (`relativeAge` in `sync-indicator.ts` returns "a moment"
 * below one and never a decimal), so a refresh at half that guarantees the age he is reading is never
 * more than one unit stale. Faster would repaint the same words; slower would let the sentence lag
 * behind the clock it is describing.
 *
 * It costs two indexed reads and one meta row — `core/status/surface.js` states its own cost and
 * walks neither the queue nor the record stores — because an indicator that is expensive is an
 * indicator somebody eventually hides.
 */
export const READING_REFRESH_MS = 30_000;

/**
 * HOW OFTEN A PASS IS RUN WHILE THE APPLICATION SITS OPEN — the `interval` opportunity, and it spends
 * a token every time.
 *
 * Fifteen minutes, and it is coarse on purpose. There is no refresh token and no background
 * synchronisation: a pass needs a live foreground token, so this is a real network round trip against
 * the coach's own quota, on a phone that is probably in his hand mid-session. The five other
 * opportunities — open, foreground, reconnect, leave and his own tap — already cover every moment when
 * something has plausibly changed; this one exists for the long single sitting where nothing else
 * fires.
 *
 * It runs ONLY while the application is visible. A hidden tab burning quota to learn the same fact
 * repeatedly is exactly the background synchronisation `core/sync/engine.js` declares impossible.
 */
export const PERIODIC_SYNC_MS = 15 * 60_000;

/** What one pass produced. The report is the LIVE object and is not copied on the way out. */
export interface SyncPassOutcome {
  /**
   * The report `syncNow` returned, unmodified.
   *
   * Callers may READ it freely. What they may not do is hand a rebuilt version of it to anything that
   * asks about a completion — see this file's header.
   */
  readonly report: unknown;
  /** Whether a genuine completion was persisted. `false` for every pass that did not earn one. */
  readonly recorded: boolean;
}

/**
 * RUN ONE PASS AND PERSIST WHAT IT EARNED. The two statements below are the join.
 *
 * ## Nothing may come between them
 *
 * The report goes from `syncNow` into `recordCompletedSync` as the same object, by the same reference.
 * That is the form with nothing to get wrong: it cannot copy the flush, so it cannot lose the brand.
 * Do not put a JSON round trip, a `structuredClone`, or anything that copies `report.flush` between
 * them — see the header for exactly which boundaries were measured to survive and which are fatal.
 *
 * ## A pass that earned no completion leaves the previous value exactly where it was
 *
 * That is `recordCompletedSync`'s own behaviour and it is honest in both directions: the last genuine
 * backup really did happen when it did, so clearing it would tell the coach he has never backed up
 * when he has, and advancing it would tell him he is safe when he is not. It is withheld for a failed
 * step, for a best-effort flush, for anything left undelivered, and for **a pass that skipped a file
 * it could not read** — an older installation that finds every file the newer one wrote undecodable
 * holds none of its work.
 *
 * ## AND WITHHOLDING THE TIMESTAMP IS NOT, BY ITSELF, ENOUGH — THIS PARAGRAPH USED TO SAY IT WAS
 *
 * It said the skipped-file case "must not show green", as though not advancing the completion were
 * what kept the indicator off the calm rung. **It is not, and it never was.** Withholding is a claim
 * about a stored VALUE; the rung is a claim about the CURRENT reading, and `core/status` derives that
 * rung from how long the coach's OWN work has been out of the backup — which, after a pass that
 * skipped somebody else's files, is honestly nothing. Measured on the real application: the sentence
 * named the files and the reason, "Everything is backed up" was correctly gone, this timestamp
 * correctly did not move — and the silhouette stayed on the calm disc beside all of it. The ring is
 * the first thing he sees and the only part legible in the collapsed rail, so a glance returned the
 * reassuring half.
 *
 * **THE USER RULED ON IT WITH THAT MEASUREMENT IN FRONT OF HIM:** while a skip is outstanding the
 * prominent state is NEEDS-ATTENTION, and it returns to the completed rung when a clean pass
 * completes. That is `drawnRungOf` in `sync-indicator.ts`, which is where it belongs — the rung is a
 * drawing decision and this file's job is the join. Nothing about the withholding below changed; what
 * changed is the claim this comment made about what the withholding achieves.
 *
 * @param store the local store, which is the authority on what has been backed up
 * @param remote the remote copy; which one is decided at the composition root
 */
export async function runSyncPass(
  store: LocalStore,
  remote: RemoteCopy,
  options: { readonly trigger: string; readonly timeoutMs?: number },
): Promise<SyncPassOutcome> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const report = await syncNow(store as any, remote as any, options as any);

  // THE JOIN. The live object, by reference, with nothing in between. See the header before editing.
  const { recorded } = await recordCompletedSync(store, report);

  return { report, recorded };
}

/**
 * A PASS THAT ACTUALLY READ THE BACKUP — the discriminator the holder below turns on.
 *
 * The pull is one step of a pass and it is the step that MEETS the other devices' files. When it
 * cannot reach the service, `core/sync/engine.js` records a failure whose `step` is `pull`, and the
 * report it returns carries `unreadable: []` and `unplaceable: []` — not because there is nothing
 * skipped out there, but because nothing was looked at. Those two are the same value and mean opposite
 * things, which is the whole reason this question has to be asked separately.
 */
export function readTheBackup(report: unknown): boolean {
  const failures = (report as { failures?: readonly { step?: string }[] } | null)?.failures;
  if (!Array.isArray(failures)) return false;
  return !failures.some((failure) => failure?.step === 'pull');
}

/** The files a pass met and could not take. Two doors, one fact: they are not in the backup. */
interface SkippedFiles {
  readonly unreadable: readonly unknown[];
  readonly unplaceable: readonly unknown[];
}

/**
 * THE TWO FACTS A SURFACE NEEDS, HELD APART — what this pass did, and what is still outstanding.
 *
 * ## The defect this exists to close, measured rather than reasoned about
 *
 * A pass that skipped a file it could not decode reports it, `core/status` turns that into "Your
 * backup is missing files", and `drawnRungOf` escalates off the calm disc. Then the NEXT pass fails
 * before it reaches the union — a dropped signal, which is the ordinary event this application is
 * built around. That pass met no undecodable file, because it met nothing, so its report says
 * `unreadable: []`. The surface reads the latest report alone, and **the sentence disappears**:
 * measured in `sync-runner.test.ts` as `skippedFilesOutstanding` going from true to false across a
 * failure, with the finding still perfectly true.
 *
 * That is the application going quiet about a real problem on the strength of a pass that learned
 * nothing — the false-calm shape this build treats as worse than an outright fault, because it is
 * confidently reassuring. It was never specific to any one opportunity; a listener that fires on a
 * flapping gym connection is what turns a rare erasure into a routine one.
 *
 * ## AND THE FIX HAS ITS OWN TRAP, WHICH IS WHY THIS IS TWO VALUES AND NOT ONE
 *
 * Carrying the previous REPORT forward would trade a vanishing sentence for a false present tense:
 * the coach would read "your backup is missing files" as the outcome of a pass whose actual outcome
 * was "Google could not be reached". So the outcome of the LATEST attempt is never replaced — only
 * the two lists that name an OUTSTANDING FINDING are carried, and only across a pass that did not
 * read the union. Every other field the surface derives from — the failures, the instants, the
 * pushed and pulled figures, the completion — is the latest pass's own.
 *
 * **An outstanding finding is cleared by a pass that genuinely READ the union and found nothing, and
 * by nothing else.** Never by a pass that failed before it got there.
 *
 * The value handed out is a reshaped report and it goes to {@link readSyncReading} alone. It must
 * NEVER be offered to `recordCompletedSync` — see this file's header on the flush. Reshaping is
 * harmless; the completion is asked of the LIVE report inside {@link runSyncPass}, and this object
 * exists only to be read.
 */
export function holdAttempts(): {
  /** Take a pass's report. The live object, by reference; nothing here copies it. */
  readonly record: (report: unknown) => void;
  /** What the accountability surface should be asked about — outcome now, findings still standing. */
  readonly forTheSurface: () => unknown;
} {
  let latest: unknown = null;
  let outstanding: SkippedFiles | null = null;

  const skippedBy = (report: unknown): SkippedFiles => {
    const seen = report as { unreadable?: readonly unknown[]; unplaceable?: readonly unknown[] };
    return {
      unreadable: Array.isArray(seen?.unreadable) ? seen.unreadable : [],
      unplaceable: Array.isArray(seen?.unplaceable) ? seen.unplaceable : [],
    };
  };

  return {
    record(report: unknown) {
      latest = report;
      // A pass that read the union is the authority on what is skipped — including when the answer is
      // "nothing", which is how the sentence comes home. A pass that did not read it says nothing
      // about the question and leaves the previous answer exactly where it was.
      if (readTheBackup(report)) outstanding = skippedBy(report);
    },
    forTheSurface() {
      if (latest === null) return null;
      if (outstanding === null || readTheBackup(latest)) return latest;
      return { ...(latest as object), ...outstanding };
    },
  };
}

/**
 * READ THE ACCOUNTABILITY SURFACE — and pass the result straight through.
 *
 * `SyncStatusReading` is a SUBSET of what `accountabilityStatus` returns, field for field and name
 * for name, which is what makes this function two lines instead of a translation layer. Nothing is
 * converted and nothing is renamed. If you find yourself renaming a field here, the shape is wrong
 * somewhere else.
 *
 * `lastAttempt` is the most recent report of this session, held in memory by the caller, and it is
 * read for the reasons a synchronisation fell short — its FAILURES and the files it could not READ.
 * It is never read for a completion: that comes from the persisted sealed value and from nowhere
 * else, which is the property this whole action exists to make true.
 *
 * ## IT USED TO HAVE NO CATCH AT ALL, AND THAT WAS NOT A SWALLOWED ERROR — IT WAS AN ESCAPED ONE
 *
 * There were ZERO occurrences of `catch` in this file. A rejecting `accountabilityStatus()` did not
 * fall into a swallowed catch the way the two sibling seams did; it escaped `SyncFromStore`'s
 * `refresh()`, which every caller invokes as `void engine.refresh()` — an UNHANDLED REJECTION.
 * `setRead` never ran, the seam's `useMemo` fell back to {@link NO_BACKUP_YET}, and the coach was
 * then told **"This device has never backed up. Nothing here is in your Google Drive yet."** on the
 * strength of a read that had looked at nothing.
 *
 * AND THE SAME VALUE IS THE ERASE GATE'S INPUT. `SyncFromStore` hands this reading on as
 * `AccountActions.figures` and into `backup.eraseThisDevice(store, reading, acknowledged)`, where
 * `platform/google-account.ts` reads `pending`, `rejected`, `ambiguous` and
 * `oldest_undelivered_age_ms` off it. All four are 0/null in the fallback, so a failed read handed a
 * DESTRUCTIVE gate an empty queue it never counted — and unlike a wrong sentence, a deletion taken
 * on a false premise is not recoverable.
 *
 * So the outcome is a {@link SyncSeamReading} and never a bare reading: three outcomes, mutually
 * exclusive at the type level. The spread is a copy of PLAIN DATA and is not the copy this file's
 * header forbids — that rule is about `report.flush`, whose brand a copy destroys. Nothing of the
 * kind travels here; the figures are the core's own frozen numbers under the core's own names.
 */
export async function readSyncReading(
  store: LocalStore,
  options: {
    readonly inProgress: boolean;
    readonly lastAttempt: unknown;
    readonly credential: { readonly present?: boolean; readonly expired?: boolean } | null;
  },
): Promise<SyncSeamReading> {
  try {
    const status = await inStage('backup status', SYNC_READ_STAGE, accountabilityStatus(store, {
      in_progress: options.inProgress,
      last_attempt: options.lastAttempt,
      credential: options.credential,
    }));
    return { status: 'read', ...(status as unknown as SyncStatusReading) };
  } catch (error: unknown) {
    // Beside the publish and never instead of it. The console is where a developer looks; it was
    // never what the coach reads, and it was never a place a caller could be made to look.
    console.error('[sync] the backup status could not be read from the local store', error);
    return { status: 'failed', failure: failureFrom(error, SYNC_READ_STAGE) };
  }
}

/**
 * THE WORLD THE OPPORTUNITIES ARE OBSERVED IN — every global this module needs, as five functions.
 *
 * A port rather than the window itself, for the reason `local-store.ts` gives about `beginOpening`: a
 * static render never runs an effect, so scheduling that lives inside one is scheduling nothing can
 * check. With this, every one of the six opportunities can be fired and asserted with no browser.
 *
 * Each subscription returns its own removal, so nothing has to remember which listener went with
 * which surface — the document's visibility, the window's page-hide and the window's `online` are
 * three different announcements in the browser and one shape here.
 */
export interface SyncEnvironment {
  /** The document's visibility changed. */
  readonly onVisibilityChange: (listener: () => void) => () => void;
  /** The page is going away — the platform's last honest word before it may kill the tab. */
  readonly onPageHide: (listener: () => void) => () => void;
  /**
   * THE PLATFORM SAYS A NETWORK IS REACHABLE AGAIN — and that is all it says.
   *
   * `online` is a claim about a local interface, never a claim about a route to Google: a phone that
   * has just rejoined a gym's captive portal fires it, and so does one whose signal came back for two
   * seconds. Nothing here treats it as more than an OPPORTUNITY — the pass itself is the only thing
   * that can tell whether the service is reachable, and a pass that finds it is not reports that the
   * way every other failed pass does.
   */
  readonly onOnline: (listener: () => void) => () => void;
  /** Whether the application is on screen right now. */
  readonly isVisible: () => boolean;
  /** Repeat something. Returns the way to stop it. */
  readonly every: (ms: number, run: () => void) => () => void;
}

/**
 * The real browser, behind {@link SyncEnvironment}.
 *
 * Both globals are reached INSIDE the returned functions, so importing this module outside a browser
 * is safe and the interface suite can load it.
 */
export function browserSyncEnvironment(view: Window & typeof globalThis): SyncEnvironment {
  return {
    onVisibilityChange(listener) {
      view.document.addEventListener('visibilitychange', listener);
      return () => view.document.removeEventListener('visibilitychange', listener);
    },
    onPageHide(listener) {
      // `pagehide` rather than `beforeunload`: on the weaker mobile platform a tab is frozen or
      // discarded without `beforeunload` ever firing, and `pagehide` is the one the platform does
      // deliver. The flush it triggers is best-effort by declaration, which is why it is safe for it
      // to be interrupted — `core/outbox` makes it structurally impossible for an interrupted flush
      // to be reported as a completed synchronisation.
      view.addEventListener('pagehide', listener);
      return () => view.removeEventListener('pagehide', listener);
    },
    onOnline(listener) {
      // On the window rather than the document: `online` and `offline` are announced there, and the
      // global is reached INSIDE this function like every other one here, so the interface suite can
      // still import this module with no browser anywhere.
      view.addEventListener('online', listener);
      return () => view.removeEventListener('online', listener);
    },
    isVisible() {
      return view.document.visibilityState === 'visible';
    },
    every(ms, run) {
      const handle = view.setInterval(run, ms);
      return () => view.clearInterval(handle);
    },
  };
}

/**
 * RUN ONE THING AT A TIME, AND SAY SO RATHER THAN QUEUEING.
 *
 * Two passes at once would both push, both flush and both rebuild the snapshot, racing each other
 * into the very lost-update the snapshot repair exists to detect. Queueing the second would be worse
 * than skipping it: by the time it ran, the pass that overtook it has already done its work, so it
 * would spend a second token to learn the same fact.
 *
 * SKIPPED IS NOT SILENT. The coach is already being told a synchronisation is running — `in_progress`
 * sits beside the figures on the surface and the indicator says "Backing up now" — so a tap during a
 * pass is answered by the state he can already see, which is the honest answer to it.
 *
 * @returns the guarded runner, and a way to ask whether one is in flight
 */
export function oneAtATime(run: (trigger: string) => Promise<void>): {
  readonly run: (trigger: string) => Promise<void>;
  readonly busy: () => boolean;
} {
  let inFlight = false;
  return {
    async run(trigger: string) {
      if (inFlight) return;
      inFlight = true;
      try {
        await run(trigger);
      } finally {
        // Cleared in `finally` on purpose: a pass that threw must not leave the application unable
        // ever to synchronise again. `syncNow` reports service failures rather than throwing them,
        // so reaching here at all means a local defect — and a local defect that also jammed the
        // door shut would be two faults where the coach can see neither.
        inFlight = false;
      }
    },
    busy() {
      return inFlight;
    },
  };
}

/**
 * ARM ALL FIVE OPPORTUNITIES, PLUS THE READING'S OWN CLOCK.
 *
 * `SYNC_TRIGGERS` in `core/sync/engine.js` declares the six as data, and `syncNow` REFUSES a trigger
 * that is not one of them, so this cannot quietly invent a seventh. Five of them are observed here;
 * the sixth is the coach's own tap and arrives through the actions rather than through a listener.
 *
 *  - **open** — once, now, as this is armed.
 *  - **foreground** — the document became visible again.
 *  - **reconnect** — the network came back under a window that never left the screen. See below.
 *  - **leave** — it became hidden, or the page is going away. Best-effort by declaration.
 *  - **interval** — {@link PERIODIC_SYNC_MS}, and only while visible.
 *  - *manual* — not here. See {@link SyncActions} in `sync-actions.tsx`.
 *
 * AND THE READING'S OWN TIMER, at {@link READING_REFRESH_MS}, which runs NO pass. It is why the
 * ladder still climbs at three in the morning with nothing happening.
 *
 * ## The leave-once rule
 *
 * Hiding a tab fires `visibilitychange`, and closing it commonly fires `visibilitychange` AND
 * `pagehide`. Without a guard that is two best-effort flushes for one departure, the second of them
 * racing a tab the platform is already tearing down. So a departure flushes once and the next
 * `foreground` re-arms it — which is also the honest reading of the platform's own model, where
 * hidden is the state and page-hide is one way of entering it.
 *
 * ## SYNCHRONISATION ON RECONNECT, AND WHY IT HAS ITS OWN NAME
 *
 * The coach works in gyms. A session's worth of work can be queued while the phone has no signal, and
 * before this listener existed the ONLY thing that ran a pass afterwards was him leaving the
 * application and coming back, or fifteen minutes passing — with the window in front of him the whole
 * time, saying the work was not backed up and doing nothing about it. `online` is the platform's own
 * announcement that the wait is over, and it is measured: the listener fires with the document never
 * leaving `visible`, so nothing the visibility handler does can stand in for it.
 *
 * **It runs `reconnect`, NOT `foreground`, and that was ruled on rather than assumed.** Borrowing the
 * neighbouring trigger looked free and is not: `core/status/completion.js` PERSISTS the trigger with
 * the completion and `core/status/statement.js` turns the set into plain words the coach reads, so a
 * reconnect pass wearing the `foreground` name tells him the backup happened because he brought the
 * application back to the screen — at the one moment he never left it. A sentence about an event that
 * makes a false, separately-checkable claim about the state that produced it is this application's
 * signature defect, not a naming quibble.
 *
 * **It is NOT in `CREDENTIAL_RELEASING_TRIGGERS`, and the omission is load-bearing.** Nobody tapped
 * anything, so no credential can have been acquired; releasing entries held on a dead one would spend
 * a call to learn the same fact again. His next return or his next tap releases them.
 *
 * **Hidden means no pass**, for the reason {@link PERIODIC_SYNC_MS} gives: a hidden tab spending a
 * token is the background synchronisation the engine declares impossible, and the `foreground`
 * opportunity already covers his return. `NO_BACKGROUND_SYNC` is untouched by this listener.
 *
 * **A flapping connection costs ONE pass, not one per flap.** `online` can fire repeatedly while a
 * signal comes and goes; `oneAtATime` in `SyncFromStore` skips rather than queues, so the second and
 * every later announcement while a pass is in flight is answered by the pass already running. That is
 * the guard doing what it was built for, and `sync-runner.test.ts` drives a flap through a real one.
 *
 * **AND AN `online` EVENT IS NOT A ROUTE TO GOOGLE.** It says a local interface came up. A pass
 * started this way and then failing is an ordinary failed pass: no completion is persisted, the
 * previous one is neither advanced nor cleared, and whatever the last attempt already had to say —
 * including files it could not read — is left standing rather than replaced by a calmer sentence.
 *
 * @returns the way to disarm everything, for the scope that armed it
 */
export function armSyncOpportunities({
  environment,
  runPass,
  refreshReading,
  readingRefreshMs = READING_REFRESH_MS,
  periodicSyncMs = PERIODIC_SYNC_MS,
}: {
  readonly environment: SyncEnvironment;
  readonly runPass: (trigger: string) => void;
  readonly refreshReading: () => void;
  readonly readingRefreshMs?: number;
  readonly periodicSyncMs?: number;
}): () => void {
  let departed = false;

  const leave = () => {
    if (departed) return;
    departed = true;
    runPass(SYNC_TRIGGERS.LEAVE);
  };

  const stopVisibility = environment.onVisibilityChange(() => {
    if (environment.isVisible()) {
      departed = false;
      runPass(SYNC_TRIGGERS.FOREGROUND);
      return;
    }
    leave();
  });

  const stopPageHide = environment.onPageHide(leave);

  const stopOnline = environment.onOnline(() => {
    // The `departed` latch is deliberately untouched: a network returning is not a return to the
    // screen, and a departure that has already flushed must stay flushed until he genuinely comes
    // back. See the reconnect note above.
    if (!environment.isVisible()) return;
    runPass(SYNC_TRIGGERS.RECONNECT);
  });

  const stopPeriodicSync = environment.every(periodicSyncMs, () => {
    // A hidden application does not spend a token to learn the same fact. See the constant.
    if (!environment.isVisible()) return;
    runPass(SYNC_TRIGGERS.INTERVAL);
  });

  // The cheap one. It reads the store and nothing else, so it runs whether or not the application is
  // on screen: a tab returning to the foreground must show the age it has NOW, not the age it had
  // when it was hidden, and the visibility handler above cannot be the only thing that refreshes it.
  const stopReadingRefresh = environment.every(readingRefreshMs, refreshReading);

  // LAST, and after every listener is attached. `open` is the one opportunity that fires immediately,
  // and a pass that resolved before the timers existed would leave an application that synchronised
  // once and then never again.
  runPass(SYNC_TRIGGERS.OPEN);

  return () => {
    stopVisibility();
    stopPageHide();
    stopOnline();
    stopPeriodicSync();
    stopReadingRefresh();
  };
}
