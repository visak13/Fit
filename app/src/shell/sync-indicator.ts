/**
 * WHAT THE PERMANENT SYNCHRONISATION INDICATOR SAYS — derivation only, and it draws nothing.
 *
 * `core/status` is the STATE layer: it answers "where is my data, and if it is not backed up, why
 * not?" and it owns no colour, no markup and no shape. This module is the one step between that
 * answer and what is drawn, and it is deliberately pure for the same reason the core is: every
 * condition can then be driven and asserted without a browser, and the component below it has no
 * decision left to get wrong.
 *
 * **Nothing here invents a state.** Every value returned is derived from a reading that came out of
 * `accountabilityStatus()`, and the two vocabularies it derives from — the rungs in
 * `core/status/levels.js` and the reason codes in `core/status/reasons.js` — are IMPORTED from the
 * core rather than restated, so a rung renamed there is a failure here rather than a silhouette that
 * quietly stops appearing. The rung's sentence is the core's own `summary`, and a specific failure's
 * sentence is the core's own `reason.message`; neither is reworded here, because a promise written
 * twice is a promise that drifts, and the copy that drifts is the one that ends up promising.
 *
 * ## THIS IS THREE FACTS COMPOSED, NOT ONE SIX-WAY SWITCH. Read this before changing the shape.
 *
 * The frozen Console prototype and its README describe a single ladder of six states, with offline
 * as its calmest rung and refused sitting just outside. **That model is not what the core has, and
 * the core wins here.** `core/status` gives three INDEPENDENT things, and this module keeps them
 * independent all the way to the screen:
 *
 * 1. **Which rung the level is at.** Five, worst last, and all five are driven by TIME:
 *    `up_to_date`, `not_backed_up`, `overdue` (6h), `severely_overdue` (24h), and
 *    `persistent_warning` at MORE THAN THREE DAYS. That last threshold is 72 hours, not one day.
 * 2. **Whether the application is working offline.** `REASON.NO_NETWORK`. This is a NORMAL OPERATING
 *    CONDITION of an offline-first application — local is the primary copy and the remote is the
 *    backup, so a basement gym on a Tuesday is the application working. It is not a rung, it is not
 *    a failure, and it is drawn as neither.
 * 3. **Whether something is stopped.** `needs_attention` — an entry the service refused, or one
 *    whose outcome cannot be told. Also not a rung: the core FLOORS the level at `overdue` the
 *    moment one exists, which already prevents a permanently lost change from sitting at the bottom
 *    of the ladder reading healthy, and prevents it better than a sixth silhouette would.
 *
 * 4. **Whether the backup is SHORT OF FILES this device could not read.** `REASON.RECORDS_REFUSED`
 *    and `REASON.BACKUP_PARTLY_UNREADABLE` — the two conditions that are about what the BACKUP does
 *    not hold rather than about how long his own work has been out of it. Both can be true with every
 *    rung figure honestly clean, which is exactly why they are asked separately.
 *
 * **AND ONE OF THEM MOVES THE RUNG — the single exception, named here so it is not a surprise.**
 * `drawnRungOf` escalates `up_to_date`, and only `up_to_date`, to the attention rung while a skip is
 * outstanding. It is not the state layer inventing a sixth level and it is not a latch: the drawn rung
 * is derived from the current reading in both directions, so it comes home the moment a clean pass
 * produces a reading without that reason. Read `drawnRungOf` for what was measured and why the user
 * ruled on it.
 *
 * **Why keeping them independent is the point, not a refinement.** A single ranked list can only
 * ever show one of the three, so offline-and-overdue, or a refusal behind a dropped connection,
 * would hide one behind the other — which is precisely the failure `reasons.js` avoided on purpose
 * ("collapsing to one would hide a refused entry behind a dropped connection, and the refused entry
 * is the one that never resolves by itself"). Composing them means the interface cannot re-introduce
 * in the drawing the defect the state layer was careful not to have.
 *
 * ## What the never-blocking ceiling means for a SHAPE
 *
 * Every rung declares `blocks: false` and there is no rung on which it is true; the maximum
 * escalation is a persistent, unmissable warning and the application always opens. So the top of the
 * ladder escalates by being LOUDER — a heavier, wider silhouette and a plainer sentence — and never
 * by gating, covering, or demanding an answer. Nothing rendered from this module may be a modal.
 *
 * ## Why the count means one thing everywhere
 *
 * `count` is always `undelivered` — everything not safely away — including the `0` when everything
 * is backed up. A number whose meaning changes with the condition is a number that cannot be read at
 * a glance, and the collapsed rail is exactly the place where it must be read at a glance because
 * nothing else there is legible.
 *
 *     npm run test:shell
 */

import { LEVEL, LEVELS, rankOf } from '../../core/status/levels.js';
import { REASON, REASONS } from '../../core/status/reasons.js';
import type { ReadFailure } from '../screens/read-failure';

/** One reason, exactly as `core/status/reasons.js` shapes it. */
export interface SyncReason {
  readonly code: string;
  readonly message: string;
  readonly action: string | null;
  readonly queue_wide: boolean;
}

/**
 * WHAT THE SEAM MUST SUPPLY — the fields of the core's `AccountabilityStatus` this indicator reads.
 *
 * Deliberately a SUBSET rather than the whole typedef: naming only what is read is what makes the
 * later step's obligation small and checkable. Every field here comes out of one call to
 * `accountabilityStatus(store, { in_progress, last_attempt, credential })` under the same name, so
 * the later step passes that result straight through and converts nothing.
 */
export interface SyncStatusReading {
  /** Only ever from a genuine completion. `null` means never. */
  readonly last_synced_at: string | null;
  readonly last_synced_age_ms: number | null;
  readonly never_synchronised: boolean;
  /** Everything not yet safely away. This is the number the indicator shows, in every condition. */
  readonly undelivered: number;
  /** Nothing will move these but a person. Rejected plus unconfirmed. */
  readonly needs_attention: number;
  readonly rejected: number;
  /**
   * Queued and still being attempted.
   *
   * NOT READ BY THE INDICATOR, and declared here all the same — with the two below it — because the
   * ERASE GATE reads them, and the reading this seam carries is the only live
   * `accountabilityStatus()` result in the interface. The alternative was a second read of the same
   * queue for the same question, which is two answers where there must be one. The subset grew; it
   * did not become a different shape, and each of these comes out of that one call under this name.
   */
  readonly pending: number;
  /** Held on a dead credential. A SUBSET of `pending`, and still work that can be sent. */
  readonly waiting_for_credential: number;
  /** Sent without being confirmed. Nothing will move these but a person. */
  readonly ambiguous: number;
  /** What the ladder climbs on: the oldest thing not in the backup, stopped entries included. */
  readonly oldest_undelivered_age_ms: number | null;
  readonly oldest_undelivered_label: string | null;
  /**
   * THE QUESTION ASKED OF THE STORE RATHER THAN OF THE QUEUE, and the exact answer to it.
   *
   * `core/status/on-this-device.js` exists because the queue only knows what a PASS put in it: a
   * record written since the last pass is in neither the queue nor the backup, so every queue figure
   * reads clean about work that is on one device and nowhere else. This boolean is the one figure on
   * that surface that is EXACT.
   */
  readonly work_not_in_the_backup: boolean;
  /**
   * HOW MANY WERE SEEN — **A FLOOR, NEVER A TOTAL**, and the name is the core's own warning.
   *
   * The read is bounded at `LOOK_AT` (25) PER RECORD KIND, so more may be waiting behind it. The core
   * accepted that bound deliberately — an indicator expensive enough to page every record store is one
   * a later editor takes off the screen. **Anything painted from this says "at least".** See
   * {@link notInTheBackup}, which is the only thing in this module allowed to read it.
   */
  readonly work_not_in_the_backup_at_least: number;
  /** One of `core/status/levels.js`. */
  readonly level: string;
  /** The rung in one sentence, from the core. Not reworded here. */
  readonly summary: string;
  /** Always false, on every rung. Read here so the interface can prove it rather than assume it. */
  readonly blocks_application: boolean;
  /** Beside the figures, never instead of them. */
  readonly in_progress: boolean;
  readonly reason: SyncReason | null;
  readonly reasons: readonly SyncReason[];
}

/**
 * WHICH HALF OF THE READ FAILED. One member, and it is one because the read is one call.
 *
 * `readSyncReading` makes a single call to `accountabilityStatus()`, so there is exactly one stage
 * to tag. It is a named union rather than a bare string for the reason every other surface's stage
 * set is: the words module below must hold a sentence for every member, and a set that could grow
 * silently is a set a words module can be quietly incomplete against.
 */
export type SyncReadStage = 'accountability';

/**
 * THE SEAM'S VALUE — THREE OUTCOMES, AND THE THIRD IS THE FIX.
 *
 * ## Why this is a TYPE and never a flag beside the reading
 *
 * "Failed" and "not read yet" used to be THE SAME VALUE — there was no failed state at all, so a
 * read that threw left {@link NO_BACKUP_YET} standing. A boolean bolted beside the reading would
 * re-create that one refactor later, because the next reader of the figures is under no obligation
 * to consult the flag. Here the facts are UNREACHABLE without first saying which of the three you
 * are looking at, and the compiler is what enforces it.
 *
 * ## AND THIS IS WHY THE SEVEN PURE FUNCTIONS ABOVE ARE UNCHANGED
 *
 * `rungOf`, `drawnRungOf`, `needsAction`, `isOffline`, `isStopped`, `headlineFor`, `detailFor` and
 * `syncWording` still take a {@link SyncStatusReading} and know nothing about a failure. {@link SyncReadFailed}
 * carries NONE of their fields, so none of them can be handed one — a failed read cannot be
 * coerced into a level, a count or a sentence by any of them, and that is checked by the compiler
 * rather than by a rule somebody has to remember. The union is drawn at the SEAM, exactly where
 * `not_yet` and `read` already differed, and it stops there.
 */
export interface SyncReadingNotYet extends SyncStatusReading {
  readonly status: 'not_yet';
}

/** The reading, taken. The facts are the core's own, under the core's own names. */
export interface SyncReadingRead extends SyncStatusReading {
  readonly status: 'read';
}

/**
 * A read that was attempted and did not come back — WITH NO FIGURES ON IT, deliberately.
 *
 * There is nothing to count after a read that looked at nothing, and a shape offering zeroes here is
 * exactly the shape that authorised a deletion: `platform/google-account.ts` reads `pending`,
 * `rejected`, `ambiguous` and `oldest_undelivered_age_ms` off this value to decide whether erasing
 * this device is safe.
 */
export interface SyncReadFailed {
  readonly status: 'failed';
  readonly failure: ReadFailure<SyncReadStage>;
}

/** What the synchronisation seam carries. @see SyncReadingNotYet for why it is a union. */
export type SyncSeamReading = SyncReadingNotYet | SyncReadingRead | SyncReadFailed;

/**
 * THE FIVE SILHOUETTES, one per rung, in the ladder's own order.
 *
 * A different OUTLINE before it is a different fill, because colour is lost to a colour-blind
 * reader, to sunlight on a phone, to a greyscale screenshot, and to the compression of the video
 * call this application will actually be introduced over. The shapes themselves are in
 * `console.css`; these are the names the two files agree on.
 *
 * The ceiling's silhouette is the widest AND the only hollow one: at the top of a ladder that must
 * never block, being unmissable is the whole of the escalation, so it is bought with size and weight
 * rather than with a gate.
 */
export const RUNG_SILHOUETTE = Object.freeze({
  [LEVEL.UP_TO_DATE]: 'disc',
  [LEVEL.NOT_BACKED_UP]: 'wide-pill',
  [LEVEL.OVERDUE]: 'upright-rectangle',
  [LEVEL.SEVERELY_OVERDUE]: 'hard-square',
  [LEVEL.PERSISTENT_WARNING]: 'wide-hollow-bar',
} as const);

/**
 * A rung this build can draw.
 *
 * Derived from the silhouette map rather than declared beside it, so a rung with no shape is not a
 * thing that can be written down: adding one to the ladder without giving it an outline stops
 * compiling here rather than rendering as whatever the base rule happens to be. `rungOf` is the only
 * way in, and `sync-indicator.test.ts` asserts this set is exactly the core's `LEVEL_ORDER`.
 */
export type Rung = keyof typeof RUNG_SILHOUETTE;

/** Whether the core handed us a rung this build knows how to draw. */
export function isRung(level: string): level is Rung {
  return Object.prototype.hasOwnProperty.call(RUNG_SILHOUETTE, level);
}

/**
 * The family glyph each rung carries — the second reading after the silhouette, with the word as the
 * third. Every one of these is already drawn in the shared family; none is inlined and none is new.
 */
export const RUNG_GLYPH: Readonly<Record<Rung, string>> = Object.freeze({
  [LEVEL.UP_TO_DATE]: 'sync-backed-up',
  [LEVEL.NOT_BACKED_UP]: 'sync-pending',
  [LEVEL.OVERDUE]: 'sync-pending-warning',
  [LEVEL.SEVERELY_OVERDUE]: 'sync-pending-overdue',
  [LEVEL.PERSISTENT_WARNING]: 'sync-pending-overdue',
} as const);

/**
 * The rung an unknown level name is drawn as.
 *
 * A status line that throws is a status line that vanishes, and `levels.js` takes the same view —
 * its own `rankOf` puts an unknown name at the bottom rather than failing. "Not backed up" is the
 * honest reading of a level this build cannot interpret: something may be outstanding and we cannot
 * say it is safe.
 */
const FALLBACK_RUNG = 'not_backed_up' satisfies Rung;

/** The rung the CORE is at, which is the level itself unless the level is a name this build does not know. */
export function rungOf(status: SyncStatusReading): Rung {
  return isRung(status.level) ? status.level : FALLBACK_RUNG;
}

/**
 * Fact five: the backup is short of files this device could not read.
 *
 * Like the two above it this is a CONDITION and not a rung — the ladder measures how long HIS work
 * has been out of the backup, and this says the backup does not hold what he thinks it holds. It is
 * asked separately for the same reason {@link heldNothingBack} is: every rung figure can be genuinely
 * clean while it is true.
 */
export function skippedFilesOutstanding(status: SyncStatusReading): boolean {
  return status.reasons.some((reason) => reason.code === REASON.BACKUP_PARTLY_UNREADABLE);
}

/**
 * THE RUNG A SKIP IS DRAWN ON, and it is deliberately not the bottom of the ladder.
 *
 * `overdue` — the upright rectangle — because it is the first rung the coach reads as *something is
 * waiting on you*, and because `not_backed_up` is ALREADY THE TRUE READING OF A DIFFERENT DEVICE: one
 * that has never completed a backup at all. Those two are different facts and they must stay
 * different silhouettes, so this escalates PAST the wide pill rather than onto it.
 */
const ATTENTION_RUNG = 'overdue' satisfies Rung;

/**
 * THE RUNG THAT IS ACTUALLY DRAWN — the core's rung, escalated while the backup is short of files.
 *
 * ## The composition this exists to fix, measured on the real application
 *
 * Every part of the old behaviour was individually true. The skip sentence named how many files and
 * why; "Everything is backed up" was correctly gone; the persisted completion did not advance — and
 * the silhouette stayed on the calm disc beside all of it, because the LEVEL is a time measurement of
 * his own outbound work and that work really had all gone. But the ring is the first thing he sees
 * and the only part legible at a glance in the collapsed rail, so A GLANCE RETURNED THE REASSURING
 * HALF while the sentence beneath it said his other device's work is not on this device. Two true
 * halves, one misleading whole. **The user chose this fix with that measurement in front of him.**
 *
 * ## It escalates from ONE rung, and the enumeration is the point
 *
 * Only `up_to_date` is escalated. Every other rung already sits at or above the attention the skip
 * warrants, and passing them through untouched is what keeps the never-completed device on its own
 * `not_backed_up` wide pill: that device's rung is not `up_to_date`, so nothing here can reach it and
 * the two states cannot collapse into one. `sync-indicator.test.ts` holds both directions.
 *
 * ## AND IT COMES HOME
 *
 * There is no latch and no remembered flag. The escalation is derived from the CURRENT reading, so
 * the moment a clean pass produces a reading with no `backup_partly_unreadable` reason the drawn rung
 * is the core's own again. An indicator that goes to attention and never returns is worse than the
 * defect it was fixing, because he learns to ignore it — so the return path is derived rather than
 * remembered, and it is asserted in the same run as the escalation.
 */
export function drawnRungOf(status: SyncStatusReading): Rung {
  const rung = rungOf(status);
  if (rung === LEVEL.UP_TO_DATE && skippedFilesOutstanding(status)) return ATTENTION_RUNG;
  return rung;
}

/**
 * Whether the coach has something to act on, which is the difference between `role="status"` and
 * `role="alert"` in DESIGN.md.
 *
 * It reads the DRAWN rung, so the escalation above raises the role with the silhouette rather than
 * leaving an attention shape sitting inside a `role="status"` region — which would announce the one
 * state he most needs told about as though nothing had changed.
 *
 * OFFLINE IS DELIBERATELY ABSENT FROM THIS. An offline-first application working from its own copy
 * is not something he must act on, and an indicator that raised an alert every time a gym had no
 * signal is an indicator he would learn to ignore — including on the day it meant something.
 */
export function needsAction(status: SyncStatusReading): boolean {
  return rankOf(drawnRungOf(status)) >= rankOf(LEVEL.OVERDUE) || status.needs_attention > 0;
}

/** Fact two: the application is working from its own copy. A condition, never a rung. */
export function isOffline(status: SyncStatusReading): boolean {
  return status.reasons.some((reason) => reason.code === REASON.NO_NETWORK);
}

/** Fact three: something will not move without a person. Also never a rung. */
export function isStopped(status: SyncStatusReading): boolean {
  return status.needs_attention > 0;
}

/**
 * Fact four: the OTHER device's work arrived and this device would not take it.
 *
 * It is not a rung and it must not become one — the ladder measures how long HIS work has been out of
 * the backup, and this is the opposite direction: the backup holds it and this device does not. But it
 * is the one condition that can be true while every rung figure is genuinely clean, so it is asked
 * separately and it is what stops the headline claiming a backup below.
 */
export function heldNothingBack(status: SyncStatusReading): boolean {
  return status.reasons.some((reason) => reason.code === REASON.RECORDS_REFUSED);
}

/**
 * WHAT IS NOT IN THE BACKUP — **ONE QUANTITY, READ BY THE NUMBER AND BY THE WORDS, SO THEY CANNOT
 * DISAGREE.** This is the only place in this module that is allowed to read either input.
 *
 * ## The disagreement this closes, measured on a real device
 *
 * The rung and the number were reading DIFFERENT SOURCES. `core/status/surface.js` derives the level
 * from `oldest_undelivered_age_ms` **and** `work_not_in_the_backup` — the question asked of the STORE
 * — while the painted number was `undelivered`, which is the QUEUE alone. So a client written since
 * the last pass moved the app's own `work_not_in_the_backup_at_least` from 6 to 7 the instant it was
 * saved, and the number beside the indicator stayed at 3 one second later AND at thirty-six seconds,
 * past the reading's own refresh. An attention shape beside the words "3 changes waiting", with the
 * application itself holding that at least 7 things are not in the backup.
 *
 * **AND THE NUMBER IS THE HALF THAT SURVIVES.** `SyncStatus.tsx` states it plainly: in the collapsed
 * rail the words fall away and the filled shape and the number never do. So the number is not the
 * lesser of the pair — at rail width it may be the only quantity he sees, which makes a number that
 * understates the higher-stakes half. The user's ruling was never about a rung; it was that a glance
 * must not return the reassuring half, and "3" is the reassuring half.
 *
 * ## Why it is `max` and not a sum
 *
 * The two inputs count different things — the queue holds what a pass sent and could not confirm, the
 * store walk holds what has been written since the push cursor — but nothing GUARANTEES they are
 * disjoint, and a sum would double-count anything that is both. An overstated count is a lie in the
 * alarming direction rather than a safe one, and this build has spent the night closing figures that
 * claimed more than they could prove. `max` is a true floor of the real total in every arrangement of
 * the two, and it closes the disagreement that actually matters: **the number can no longer read 0, or
 * 3, while the rung says there is work.**
 *
 * ## AND IT IS A FLOOR, WHICH IS WHY IT RETURNS A FLAG AND NOT JUST A NUMBER
 *
 * `work_not_in_the_backup_at_least` is bounded at 25 PER RECORD KIND and the core names it so that no
 * caller can mistake it for a total. A bare "7" painted from a floor is a fresh instance of exactly
 * the class this fix exists to close, so the caller is TOLD it is a floor and cannot paint it as an
 * exact count by accident. When the store contributed nothing there is nothing bounded in the answer
 * and the queue figure is exact, so it is reported as exact.
 */
export function notInTheBackup(status: SyncStatusReading): { readonly count: number; readonly isFloor: boolean } {
  const onDevice = status.work_not_in_the_backup_at_least;
  return { count: Math.max(status.undelivered, onDevice), isFloor: onDevice > 0 };
}

/**
 * The quantity as the coach reads it in words — "3 changes" or "at least 7 changes".
 *
 * The floor is said IN WORDS rather than with a symbol, because this is the read channel and "at
 * least" is what the figure actually promises. The chip below is the glanceable channel and says it
 * differently for reasons of width, but neither of them may say a floor as though it were a total.
 */
function countInWords(status: SyncStatusReading, unit = 'change'): string {
  const { count, isFloor } = notInTheBackup(status);
  return `${isFloor ? 'at least ' : ''}${plural(count, unit)}`;
}

/** Milliseconds in each unit the coach is spoken to in. Nothing finer than a minute is useful. */
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/** A phrase that has to start a headline. Only the first letter moves; nothing else is touched. */
function capitalised(phrase: string): string {
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/**
 * A duration in the words a person uses, with no unit smaller than a minute and no decimal.
 *
 * It never returns "0 minutes": under a minute is "a moment", because a figure that rounds to zero
 * on an indicator about elapsed time reads as "no time has passed", which is the opposite of what a
 * fresh backup means and indistinguishable from a stopped clock.
 */
export function relativeAge(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < MINUTE_MS) return 'a moment';
  if (ms < HOUR_MS) return plural(Math.floor(ms / MINUTE_MS), 'minute');
  if (ms < DAY_MS) return plural(Math.floor(ms / HOUR_MS), 'hour');
  return plural(Math.floor(ms / DAY_MS), 'day');
}

/**
 * The word each mark carries, so that neither of the two conditions depends on being seen.
 *
 * The offline one is stated as the application doing its job, because it is. "Working offline" is
 * what it is doing; "no connection" would be what it has lost, and those are the same fact told as
 * a success and as a failure.
 */
export const OFFLINE_WORD = 'Working offline';
export const STOPPED_WORD = 'Needs you';

/** Everything the indicator draws, in words. Every field is always present. */
export interface SyncWording {
  /** The rung in a few words. What the eye lands on. */
  readonly headline: string;
  /** The sentence under it — the core's own, for the specific failure or for the rung. */
  readonly detail: string;
  /**
   * EVERYTHING NOT IN THE BACKUP, in every condition, including the zero — {@link notInTheBackup}.
   *
   * It used to be `undelivered`, which is the QUEUE alone, and that is the defect this closes: the
   * rung already read the store as well, so the two could and did disagree. Read {@link countIsFloor}
   * before painting it: this number may be a floor, and painting a floor as a total is the same class
   * of claim the whole indicator exists to avoid making.
   */
  readonly count: number;
  /** Whether {@link count} is a FLOOR rather than a total. Nothing may paint the number without it. */
  readonly countIsFloor: boolean;
  /**
   * The number as the collapsed rail paints it — `"7"`, or `"7+"` when it is a floor.
   *
   * The chip is the one thing that survives the rail collapsing, so at that width it may be the only
   * quantity he sees. A bare number there, taken from a bounded read, is an exactness claim the figure
   * cannot support; the `+` is the shortest honest form that still fits the 20px the measurement left
   * for it. The words say "at least" in full, where there is room to.
   */
  readonly countLabel: string;
  /** The word beside the offline mark, or null when the application is not offline. */
  readonly offlineWord: string | null;
  /** The word beside the stopped mark, or null when nothing is stopped. */
  readonly stoppedWord: string | null;
  /**
   * THE LAST GENUINE BACKUP, NAMED IN WORDS — or null when the headline already says it, or when
   * there has never been one.
   *
   * The silhouette used to be where this fact lived: a device whose last pass skipped files kept the
   * calm disc because the last COMPLETE backup really had happened. That is a true fact carried by
   * the wrong thing — a shape read at a glance cannot say "complete, and then something went wrong
   * after it". So the shape now carries the current state and this carries the completion, in words,
   * where it can be read as the past-tense fact it is. **The fact is not destroyed by the fix; it is
   * moved to a channel that can hold it honestly.**
   */
  readonly lastCompleteBackup: string | null;
  /** The one complete sentence assistive technology is given, collapsed or expanded. */
  readonly announced: string;
}

/**
 * THE HEADLINE OF A DEVICE THAT DID NOT RECEIVE — and it is a headline rather than only a detail line
 * because the headline is the part he reads.
 *
 * Measured on the real application: after a refused apply, both devices painted "Backup status: Backed
 * up a moment ago. Everything is backed up." while one of them held none of the other's work, for
 * ever, and the error reached him NOWHERE except an unhandled console rejection. The rung was honestly
 * `up_to_date` — his own queue was empty and it had genuinely all been sent — so the sentence was
 * true about the direction it was measuring and false about the one he would have cared about.
 *
 * It says SOME, never a count. The count is of records, and the coach thinks in exercises and clients;
 * a number here would be precise about the wrong unit.
 */
export const DID_NOT_RECEIVE = 'Some changes did not arrive';

/**
 * THE HEADLINE OF A BACKUP THAT IS SHORT OF FILES — and it says the BACKUP, not the device.
 *
 * The count and the cause are the core's own sentence underneath ({@link describeUnreadable} in
 * `core/status/reasons.js`), which names how many files and why, and is not repeated or reworded here.
 * What this line has to do is different and smaller: stop the part he reads at a glance from being a
 * statement that his data is safe. So it names the subject — the backup — and the shortfall, and it
 * carries no figure, because the figure is one line below and a number in two places is a number that
 * drifts.
 */
export const BACKUP_IS_MISSING_FILES = 'Your backup is missing files';

/**
 * Whether the headline is ITSELF the statement of the last complete backup.
 *
 * One helper for two readers, so they cannot drift: {@link headlineFor} takes this branch to say
 * "Backed up a moment ago", and {@link syncWording} uses it to decide whether the completion still
 * needs stating separately. The alternative — matching the headline's text — is a claim about a
 * sentence rather than about a state, and it would go quietly wrong the first time either was reworded.
 */
function headlineIsTheCompletion(rung: Rung, status: SyncStatusReading): boolean {
  return rung === LEVEL.UP_TO_DATE && !skippedFilesOutstanding(status) && !heldNothingBack(status);
}

function headlineFor(rung: Rung, status: SyncStatusReading): string {
  const backedUp = relativeAge(status.last_synced_age_ms);
  const waited = relativeAge(status.oldest_undelivered_age_ms);

  if (headlineIsTheCompletion(rung, status)) {
    return backedUp === null ? 'Backed up' : `Backed up ${backedUp} ago`;
  }

  // Both of these sit above every rung, because they are the two facts a rung cannot carry: the
  // ladder is about his work leaving this device and these are about what the backup does not hold.
  // They are in the core's own precedence order (`REASON_PRECEDENCE` in `core/status/reasons.js`),
  // where a backup short of files ranks above a named record this device refused.
  if (skippedFilesOutstanding(status)) return BACKUP_IS_MISSING_FILES;
  if (heldNothingBack(status)) return DID_NOT_RECEIVE;

  // ONE quantity, and it says "at least" wherever that is what it is. See {@link notInTheBackup}.
  const { count, isFloor } = notInTheBackup(status);
  const many = isFloor ? `At least ${count}` : `${count}`;
  const manyInWords = capitalised(countInWords(status));

  switch (rung) {
    case LEVEL.OVERDUE:
      return waited === null ? `${manyInWords} waiting` : `${many} waiting for ${waited}`;
    case LEVEL.SEVERELY_OVERDUE:
    case LEVEL.PERSISTENT_WARNING:
      return waited === null ? 'Not backed up' : `Not backed up for ${waited}`;
    default:
      return count > 0 ? `${manyInWords} waiting` : 'Nothing backed up yet';
  }
}

/**
 * The second line, and it is the core's sentence in both branches.
 *
 * `reason.message` when there is a specific cause, because `reasons.js` is where the wording for a
 * dead credential, a refusal and a dropped connection was decided and tested — including the rule
 * that the credential sentence quotes no per-entry count, since nothing at all can be sent. The
 * rung's own `summary` otherwise, which is the core's one-sentence statement of the rung. Neither is
 * rewritten here.
 */
function detailFor(rung: Rung, status: SyncStatusReading): string {
  if (status.reason !== null) return status.reason.message;
  return status.summary || LEVELS[rung].summary;
}

/**
 * The whole indicator, in words.
 *
 * `in_progress` is APPENDED to the announced sentence rather than replacing anything, which is the
 * shell's half of the core's structural rule: a synchronisation that is running is said beside the
 * figures and never instead of them, so there is no arrangement of this data that can produce a
 * spinner with nothing behind it.
 */
export function syncWording(status: SyncStatusReading): SyncWording {
  const rung = drawnRungOf(status);
  const headline = headlineFor(rung, status);
  const core = detailFor(rung, status);
  const offline = isOffline(status);
  const stopped = isStopped(status);

  // The core's sentence for the leading reason does not always name the OTHER condition — a refusal
  // and a dropped connection can both be true, and `reasons.js` returns both while a one-line
  // indicator shows the first. So each condition the sentence has not already named gets a clause of
  // its own. That is what keeps "every state carries a word" true of the visible layer: the marks
  // are the redundant, wordless reading, and this is the read one.
  const mentionsOffline = core.includes('could not be reached');
  const mentionsStopped = core.includes('refused') || core.includes('not confirmed');

  // Stated only where the headline is not already saying it, and only where there is one to state. A
  // device that has never completed a backup gets NO sentence here rather than a hedged one — it has
  // no completion to name, and inventing a form of words for the absence of one is how a screen ends
  // up reassuring somebody about a thing that never happened.
  const completed = relativeAge(status.last_synced_age_ms);
  const lastCompleteBackup = headlineIsTheCompletion(rung, status) || completed === null
    ? null
    : `Last complete backup: ${completed} ago`;

  const detail = [
    core,
    // Short here and long in the announcement: this line sits in a phone bar above the bottom bar,
    // and a paragraph there is taken out of the session runner.
    offline && !mentionsOffline ? `${OFFLINE_WORD}.` : null,
    stopped && !mentionsStopped ? `${plural(status.needs_attention, 'change')} ${STOPPED_WORD.toLowerCase()}.` : null,
    status.in_progress ? 'Backing up now.' : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' ');

  const announced = [
    headline.endsWith('.') ? headline : `${headline}.`,
    core,
    // Beside the state and after it, never instead of it: the completion is a past-tense fact and the
    // sentence above is the present one, so it is announced in that order too.
    lastCompleteBackup === null ? null : `${lastCompleteBackup}.`,
    offline && !mentionsOffline
      ? 'Working offline. Your work is saved on this device and will be backed up when it can.'
      : null,
    stopped && !mentionsStopped
      ? `${plural(status.needs_attention, 'change')} will not back up without you.`
      : null,
    status.in_progress ? 'Backing up now.' : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' ');

  const { count, isFloor } = notInTheBackup(status);

  return {
    headline,
    detail,
    count,
    countIsFloor: isFloor,
    countLabel: isFloor ? `${count}+` : `${count}`,
    offlineWord: offline ? OFFLINE_WORD : null,
    stoppedWord: stopped ? STOPPED_WORD : null,
    lastCompleteBackup,
    announced: `Backup status: ${announced}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THE INDICATOR SAYS WHEN THE READ ITSELF DID NOT COME BACK
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * THE HEADLINE OF A STATE THAT READ NOTHING — and it reports on the READ, never on the backup.
 *
 * Every other headline this module produces is a statement about where his data is. This one cannot
 * be: nothing was measured. The old behaviour said "Nothing backed up yet" underneath "This device
 * has never backed up. Nothing here is in your Google Drive yet." — a real condition, worded as a
 * fact, over a queue nobody had looked at.
 *
 * IT IS NOT REASSURING, and that is the point rather than a tone. An unread backup state is not a
 * healthy one, and the coach must be able to tell the two apart at a glance.
 */
export const COULD_NOT_READ_THE_BACKUP_STATUS = 'Could not read the backup status';

/**
 * A SENTENCE PER STAGE. One stage, one sentence, and the words module is complete against the set.
 *
 * It says WHICH read failed in his terms and stops there. What it must not do is characterise the
 * backup, because characterising the backup is precisely what failed.
 */
export const SYNC_READ_STAGE_WORDS: Readonly<Record<SyncReadStage, string>> = Object.freeze({
  accountability:
    'This app could not read what is backed up and what is still waiting on this device.',
});

/**
 * WHAT THE FAILURE LEFT BEHIND — a separately checkable claim, and it is checked.
 *
 * Two refusal sentences in this build once told the coach that a refused save had ERASED something,
 * and they were false. A sentence about a failure makes a claim about the state it left behind, so
 * this one says only what a READ can leave behind — which is nothing — and `sync-failed-read.test.ts`
 * reads the queue back across an induced failure to prove it.
 *
 * It stops short of telling him his work is safe. It is not: the read that would have told either of
 * us is the read that failed, and this state exists because that is not knowable right now.
 */
export const A_FAILED_STATUS_READ_CHANGED_NOTHING =
  'Nothing on this device was changed by trying to read it. What this app cannot tell you right now '
  + 'is whether it has all reached your Google Drive.';

/** What to do, and it is the one thing that helps. Never a control this surface does not offer. */
export const AFTER_A_FAILED_STATUS_READ = 'Reload the app. If it says this again, close every other '
  + 'window of this app and reload once more.';

/** The failed state, in words. Every field is always present. */
export interface SyncFailureReport {
  readonly headline: string;
  /** Which read failed, in his terms. */
  readonly whatFailed: string;
  /** What the failure left behind, which is a claim and is checked. */
  readonly notAVerdict: string;
  readonly whatToDo: string;
  /** The stage tag and the CLASS of what was thrown. Both come from code; neither from a record. */
  readonly stage: string;
  readonly errorName: string;
}

/**
 * THE FAILED READ, IN WORDS.
 *
 * An unworded stage draws a GAP rather than a blank: the stage set could grow in the source without
 * this module noticing, and a missing sentence must read as something missing rather than as nothing
 * being wrong.
 */
export function describeFailedSyncRead(failure: ReadFailure<string>): SyncFailureReport {
  const known = Object.prototype.hasOwnProperty.call(SYNC_READ_STAGE_WORDS, failure.stage);
  return {
    headline: COULD_NOT_READ_THE_BACKUP_STATUS,
    whatFailed: known
      ? SYNC_READ_STAGE_WORDS[failure.stage as SyncReadStage]
      : 'This app could not read its backup status, and it cannot say which part of the read failed.',
    notAVerdict: A_FAILED_STATUS_READ_CHANGED_NOTHING,
    whatToDo: AFTER_A_FAILED_STATUS_READ,
    stage: failure.stage,
    errorName: failure.errorName,
  };
}

/**
 * THE READING AN INSTALLATION HAS BEFORE ITS LOCAL STORE IS WIRED, AND IT IS A TRUE ONE.
 *
 * The seam's starting value, not a mock and not a demonstration state. Real synchronisation is a
 * later step, so on this build nothing has ever been backed up — because nothing yet can be — and
 * "never synchronised, nothing queued" is precisely what `accountabilityStatus()` returns over a
 * store in that condition. The rung, its sentence and the reason are the core's own constants rather
 * than words written here, so this cannot drift away from what the real call will produce.
 *
 * It lives in this module rather than beside the component so that it can be asserted without a
 * browser. **The later step replaces the SOURCE, not this value** — see `SyncStatus.tsx`.
 */
export const NO_BACKUP_YET: SyncReadingNotYet = Object.freeze({
  status: 'not_yet',
  last_synced_at: null,
  last_synced_age_ms: null,
  never_synchronised: true,
  undelivered: 0,
  needs_attention: 0,
  rejected: 0,
  // Nothing has ever been queued on a device in this condition, so all three are nought — which is
  // what `accountabilityStatus()` genuinely returns over such a store, not a hopeful default.
  pending: 0,
  waiting_for_credential: 0,
  ambiguous: 0,
  oldest_undelivered_age_ms: null,
  oldest_undelivered_label: null,
  // Nothing has been written on a device in this condition either, so the store's own question
  // answers no — which is what `workNotInTheBackup` genuinely returns over such a store.
  work_not_in_the_backup: false,
  work_not_in_the_backup_at_least: 0,
  level: LEVEL.NOT_BACKED_UP,
  summary: LEVELS[LEVEL.NOT_BACKED_UP].summary,
  blocks_application: false,
  in_progress: false,
  reason: Object.freeze({ code: REASON.NEVER_SYNCHRONISED, ...REASONS[REASON.NEVER_SYNCHRONISED] }),
  reasons: Object.freeze([
    Object.freeze({ code: REASON.NEVER_SYNCHRONISED, ...REASONS[REASON.NEVER_SYNCHRONISED] }),
  ]),
});
