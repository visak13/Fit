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
  /** What the ladder climbs on: the oldest thing not in the backup, stopped entries included. */
  readonly oldest_undelivered_age_ms: number | null;
  readonly oldest_undelivered_label: string | null;
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

/** The rung to draw, which is the level itself unless the level is a name this build does not know. */
export function rungOf(status: SyncStatusReading): Rung {
  return isRung(status.level) ? status.level : FALLBACK_RUNG;
}

/**
 * Whether the coach has something to act on, which is the difference between `role="status"` and
 * `role="alert"` in DESIGN.md.
 *
 * OFFLINE IS DELIBERATELY ABSENT FROM THIS. An offline-first application working from its own copy
 * is not something he must act on, and an indicator that raised an alert every time a gym had no
 * signal is an indicator he would learn to ignore — including on the day it meant something.
 */
export function needsAction(status: SyncStatusReading): boolean {
  return rankOf(rungOf(status)) >= rankOf(LEVEL.OVERDUE) || status.needs_attention > 0;
}

/** Fact two: the application is working from its own copy. A condition, never a rung. */
export function isOffline(status: SyncStatusReading): boolean {
  return status.reasons.some((reason) => reason.code === REASON.NO_NETWORK);
}

/** Fact three: something will not move without a person. Also never a rung. */
export function isStopped(status: SyncStatusReading): boolean {
  return status.needs_attention > 0;
}

/** Milliseconds in each unit the coach is spoken to in. Nothing finer than a minute is useful. */
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
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
  /** Always `undelivered`, in every condition, including the zero. */
  readonly count: number;
  /** The word beside the offline mark, or null when the application is not offline. */
  readonly offlineWord: string | null;
  /** The word beside the stopped mark, or null when nothing is stopped. */
  readonly stoppedWord: string | null;
  /** The one complete sentence assistive technology is given, collapsed or expanded. */
  readonly announced: string;
}

function headlineFor(rung: Rung, status: SyncStatusReading): string {
  const backedUp = relativeAge(status.last_synced_age_ms);
  const waited = relativeAge(status.oldest_undelivered_age_ms);

  switch (rung) {
    case LEVEL.UP_TO_DATE:
      return backedUp === null ? 'Backed up' : `Backed up ${backedUp} ago`;
    case LEVEL.OVERDUE:
      return waited === null
        ? `${plural(status.undelivered, 'change')} waiting`
        : `${status.undelivered} waiting for ${waited}`;
    case LEVEL.SEVERELY_OVERDUE:
    case LEVEL.PERSISTENT_WARNING:
      return waited === null ? 'Not backed up' : `Not backed up for ${waited}`;
    default:
      return status.undelivered > 0
        ? `${plural(status.undelivered, 'change')} waiting`
        : 'Nothing backed up yet';
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
  const rung = rungOf(status);
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

  return {
    headline,
    detail,
    count: status.undelivered,
    offlineWord: offline ? OFFLINE_WORD : null,
    stoppedWord: stopped ? STOPPED_WORD : null,
    announced: `Backup status: ${announced}`,
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
export const NO_BACKUP_YET: SyncStatusReading = Object.freeze({
  last_synced_at: null,
  last_synced_age_ms: null,
  never_synchronised: true,
  undelivered: 0,
  needs_attention: 0,
  rejected: 0,
  oldest_undelivered_age_ms: null,
  oldest_undelivered_label: null,
  level: LEVEL.NOT_BACKED_UP,
  summary: LEVELS[LEVEL.NOT_BACKED_UP].summary,
  blocks_application: false,
  in_progress: false,
  reason: Object.freeze({ code: REASON.NEVER_SYNCHRONISED, ...REASONS[REASON.NEVER_SYNCHRONISED] }),
  reasons: Object.freeze([
    Object.freeze({ code: REASON.NEVER_SYNCHRONISED, ...REASONS[REASON.NEVER_SYNCHRONISED] }),
  ]),
});
