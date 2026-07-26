/**
 * WHAT THE STOPPED-CHANGES REVIEW SAYS — the whole derivation, and none of the drawing.
 *
 * ## The gap this closes, stated as what the coach could and could not learn
 *
 * He was told a NUMBER. `core/status/surface.js` carries `outbox.needs_attention` through to
 * `sync-indicator.ts`, which renders "3 changes will not back up without you" — permanently, in the
 * frame, which is right. What he could never learn was WHICH change, what the service actually said
 * about it, or what to do next. A count he cannot act on is a count he learns to live with, and living
 * with it is precisely the silent stop the outbox exists to prevent: an entry that stopped without a
 * word is indistinguishable from one that succeeded.
 *
 * And the core had already named the screen. `core/status/reasons.js` gives the refused case the action
 * code `review_refused` and the unconfirmed case `review_unconfirmed`; `shell/action-destinations.ts`
 * is where those two codes now reach an address instead of a step that never needed to own them.
 *
 * ## THE RULE THE WHOLE SURFACE IS BUILT FROM: TWO GROUPS, NEVER ONE LIST
 *
 * This is not a layout preference. `needsAttention` in `core/outbox/status.js` returns two pages, and
 * its docstring says exactly why: "the two need different words in front of the coach — one says the
 * remote refused it, the other says we cannot tell — and merging them would force the surface to
 * re-derive which is which."
 *
 * Those two conditions call for different things from him, and that is the whole of the difference:
 *
 *   REFUSED — the service said no, and the reason is kept VERBATIM. It is a finished fact. Nothing
 *   about it is uncertain; what is uncertain is only whether the reason means anything to him.
 *
 *   NOT CONFIRMED EITHER WAY — it may have landed, possibly more than once, and the queue REFUSES to
 *   guess (`SURFACED_NEVER_GUESSED`). Every identifier found is carried out so a person can look. The
 *   identifiers are therefore NOT forensic detail behind a fold: they are the whole of what makes the
 *   condition decidable by somebody, so they stay permanently on screen.
 *
 * Merging them would produce one list where the second kind reads as the first — "these failed" — which
 * is the one sentence that is definitely wrong about an ambiguous entry, because it may be sitting in
 * the backup right now.
 *
 * ## What is verbatim, and what this file is allowed to write
 *
 * The service's own words are passed through untouched. `OUTBOX.md` §4.3 requires the rejected entry to
 * keep "its reason verbatim", and a surface that paraphrased it would be inventing the evidence: the
 * coach may need to read that sentence out to whoever set the application up for him, and a reworded
 * version is not the sentence the service said. So `whyVerbatim` is the message as stored, and every
 * word this file writes is around it and never over it.
 *
 * ## What it does NOT do
 *
 * It offers no retry and no discard. Both are deliveries to a real service and belong to the step that
 * owns the credential; reviewing needs neither, which is the whole reason this could be built now. It
 * also never re-derives which group an entry is in — the group carries the core's own `status` value,
 * read off `STATUS`, so nothing here classifies anything a second time.
 */

import { STATUS } from '../../core/outbox/entry.js';
import { REASON, REASONS } from '../../core/status/reasons.js';
import type { ReportPair } from './admin-report';

/**
 * One stopped entry, as the core stores it. Mirrors the fields this surface reads and no more.
 *
 * The core is plain ECMAScript typed in documentation comments and is consumed here UNCHANGED — see
 * `tsconfig.json` — so the shape it needs is stated where it is used rather than the core being
 * converted to satisfy this file.
 */
export interface StoppedEntry {
  readonly entry_id: string;
  /** Plain words for what the delivery was: "backup of the exercise library". Written at enqueue. */
  readonly label: string;
  readonly operation: string;
  readonly space: string;
  readonly name: string | null;
  readonly target_file_id: string | null;
  /** Record identities this delivery was about. May be empty. */
  readonly refs: readonly string[];
  readonly status: string;
  readonly device: string;
  readonly enqueued_at: string;
  readonly settled_at: string | null;
  readonly attempts: number;
  readonly last_error: {
    readonly code: string;
    readonly message: string;
    readonly classification: string;
    readonly at: string;
  } | null;
  /** Identifiers found when more than one file answered to this delivery's name. */
  readonly ambiguity: readonly string[];
}

/** A page exactly as the core paged it. `done` is carried because a queue can be long. */
export interface StoppedPage {
  readonly items: readonly StoppedEntry[];
  readonly cursor: string | null;
  readonly done: boolean;
}

/** The two readings this surface is built from, which are the core's own two pages. */
export interface StoppedReading {
  readonly rejected: StoppedPage;
  readonly ambiguous: StoppedPage;
}

/** The screen's own title, one constant, so the link into it and the screen cannot disagree. */
export const STOPPED_TITLE = 'Changes that stopped';

/**
 * ONE ENTRY, WORDED.
 *
 * `whyVerbatim` is the service's own sentence and is never reworded. `identifiers` is permanent rather
 * than folded, and only the unconfirmed case has any.
 */
export interface StoppedItem {
  readonly entryId: string;
  /** What the change was, in the words the core wrote at enqueue time. */
  readonly what: string;
  /** When it stopped. Literal, because the instant is the evidence. */
  readonly whenStopped: string;
  /** The service's own reason, untouched, or null when it stopped without one. */
  readonly whyVerbatim: string | null;
  /** Said when there is no reason at all, so an empty line is never left to speak for itself. */
  readonly whyMissing: string | null;
  /**
   * The identifiers found, for the case where more than one thing answered to one name.
   *
   * PERMANENT, never folded: they are what makes the condition decidable by a person, and disclosure
   * is for detail behind a decision rather than for the decision.
   */
  readonly identifiers: readonly string[];
  /** How many records this one delivery was carrying, so its weight is visible. */
  readonly records: number;
  /** The forensic half: identifiers and counts, folded and counted. Nothing is discarded. */
  readonly forensic: readonly ReportPair[];
}

/** Everything one group says. There are exactly two, and they are never merged. */
export interface StoppedGroup {
  /** The core's own status value. Carried so nothing here re-derives which group an entry is in. */
  readonly status: string;
  /** The action code from `core/status/reasons.js` that this group is the answer to. */
  readonly actionCode: string;
  readonly heading: string;
  /** What this condition IS, in his language. Different words per group, deliberately. */
  readonly explanation: string;
  /** What to do about it. Genuinely available today, and it ends at a person rather than a button. */
  readonly whatToDo: string;
  readonly count: number;
  /** True when the page did not reach the end of the queue, so the count is a floor and says so. */
  readonly more: boolean;
  /** Said only when `more`. Null otherwise, so the screen never draws an empty caveat. */
  readonly moreWords: string | null;
  /** True when this group has nothing in it — a normal state, worded like one. */
  readonly settled: boolean;
  /** Said when the group is empty. Never a blank section. */
  readonly nothingWords: string;
  readonly items: readonly StoppedItem[];
}

/** What the screen says as a whole. */
export interface StoppedReview {
  readonly title: string;
  /** The one figure the screen is for: how many changes are stopped, both groups together. */
  readonly count: number;
  readonly intro: string;
  /** True when nothing at all has stopped. */
  readonly settled: boolean;
  /** The two groups, in a fixed order. A tuple, so a merged list cannot be returned from here. */
  readonly groups: readonly [StoppedGroup, StoppedGroup];
  /**
   * The sentence that is the whole reason this screen is not merely informative.
   *
   * The queue will NOT move these on its own — `OUTBOX.md` §4.3, "never attempted again in silence".
   * He has to do something, and a screen that listed stopped work without saying so would read as a
   * log of things being handled.
   */
  readonly nothingHappensByItself: string;
}

/** How many, in words rather than as a bare number beside a noun that does not agree with it. */
function changeCount(count: number): string {
  return count === 1 ? '1 change' : `${count} changes`;
}

/** The forensic pairs for one entry: identifiers and counts, never content. */
function forensicPairs(entry: StoppedEntry): readonly ReportPair[] {
  const pairs: ReportPair[] = [
    // First, because it is what the person helping him will ask for.
    { label: 'Reference', literal: true, value: entry.entry_id },
    { label: 'What was asked', literal: true, value: entry.operation },
    { label: 'Where', literal: true, value: entry.space },
    { label: 'Queued on this device', literal: true, value: entry.device },
    { label: 'Queued at', literal: true, value: entry.enqueued_at },
    { label: 'Times tried', literal: false, value: String(entry.attempts) },
  ];

  if (entry.name !== null) pairs.push({ label: 'Stored as', literal: true, value: entry.name });
  if (entry.target_file_id !== null) {
    pairs.push({ label: 'File identifier', literal: true, value: entry.target_file_id });
  }
  if (entry.last_error !== null) {
    pairs.push({ label: 'Reported as', literal: true, value: entry.last_error.code });
  }
  if (entry.refs.length > 0) {
    pairs.push({ label: 'Records in this change', literal: true, value: entry.refs.join(', ') });
  }
  return pairs;
}

/** One entry, worded. Nothing in here rewords the service. */
function describeItem(entry: StoppedEntry): StoppedItem {
  const message = entry.last_error === null ? null : entry.last_error.message;

  return {
    entryId: entry.entry_id,
    what: entry.label,
    // `settled_at` is when it reached a terminal status, which is the moment it stopped. An entry that
    // somehow has none falls back to the error's own instant, and then to when it was queued: the
    // question "when" always has an answer, and a blank where a date should be reads as a bug.
    whenStopped: entry.settled_at ?? entry.last_error?.at ?? entry.enqueued_at,
    whyVerbatim: message,
    whyMissing:
      message === null
        ? 'This app has no reason recorded for this one. Read out the reference below to whoever set '
          + 'the app up for you.'
        : null,
    identifiers: entry.ambiguity,
    records: entry.refs.length,
    forensic: forensicPairs(entry),
  };
}

/**
 * THE REFUSED GROUP.
 *
 * Its words are about a finished fact, and the action ends at a person. That is not a shortcut: there
 * is no support desk for this application, so the only exit that exists in the world is whoever set it
 * up for him, and a screen that said "contact support" would be a dead end wearing a sentence.
 */
function refusedGroup(page: StoppedPage): StoppedGroup {
  const items = page.items.map(describeItem);

  return {
    status: STATUS.REJECTED,
    // Read off the core's own table, so the code this group answers cannot drift away from the code
    // the status surface produces.
    actionCode: REASONS[REASON.ENTRY_REJECTED].action as string,
    heading: 'Google refused these',
    explanation:
      'Google was asked to store these and said no. They are still saved on this device, and they '
      + 'will not go into your backup on their own. What Google said is shown below exactly as it '
      + 'came back, word for word.',
    whatToDo:
      'Make the change again in the app, and it will be sent afresh. If what Google said means '
      + 'nothing to you, read it out to whoever set this app up for you — it is written for them, '
      + 'not for you.',
    count: items.length,
    more: !page.done,
    moreWords: page.done
      ? null
      : 'There are more than these. This shows the oldest ones first.',
    settled: items.length === 0,
    nothingWords: 'Google has not refused anything.',
    items,
  };
}

/**
 * THE UNCONFIRMED GROUP.
 *
 * The words must not say "failed", because it may be in the backup right now. That single distinction
 * is why this is a separate group and not a second row in one list.
 */
function unconfirmedGroup(page: StoppedPage): StoppedGroup {
  const items = page.items.map(describeItem);

  return {
    status: STATUS.AMBIGUOUS,
    actionCode: REASONS[REASON.OUTCOME_UNKNOWN].action as string,
    heading: 'Not confirmed either way',
    explanation:
      'These were sent, and this app cannot tell whether they arrived. It will not guess, because '
      + 'guessing wrong either loses your work or stores it twice. Everything it found is listed '
      + 'below so a person can look instead.',
    whatToDo:
      'Open your Google Drive and look for what is named below. If it is not there, make the change '
      + 'again in the app. If it is there more than once, do not delete any of them yourself — read '
      + 'this screen out to whoever set the app up for you.',
    count: items.length,
    more: !page.done,
    moreWords: page.done
      ? null
      : 'There are more than these. This shows the oldest ones first.',
    settled: items.length === 0,
    nothingWords: 'Everything that was sent was confirmed one way or the other.',
    items,
  };
}

/**
 * Everything the screen says, from the two pages the core handed over.
 *
 * The two groups are built independently from their own page and are returned as a TUPLE. A single
 * list is not a thing this function can return, which is the point: the split is enforced by the shape
 * rather than by a comment asking for it.
 */
export function describeStoppedChanges(reading: StoppedReading): StoppedReview {
  const refused = refusedGroup(reading.rejected);
  const unconfirmed = unconfirmedGroup(reading.ambiguous);
  const count = refused.count + unconfirmed.count;

  return {
    title: STOPPED_TITLE,
    count,
    intro:
      count === 0
        ? 'Nothing has stopped. Everything you have done has either gone into your backup or is on '
          + 'its way there.'
        : `${changeCount(count)} stopped on the way to your backup. They are safe on this device. `
          + 'Each one below says what it was and what happened to it.',
    settled: count === 0,
    groups: [refused, unconfirmed],
    nothingHappensByItself:
      count === 0
        ? 'If something ever does stop, this app will not quietly keep trying it. It will wait here '
          + 'for you and the number in the corner of every screen will say so.'
        : 'This app will not try these again by itself, on purpose: retrying something Google refused '
          + 'or that may already be there would either fail forever in silence or store your work '
          + 'twice. Nothing here changes until you do something.',
  };
}

/** What the Admin screen says about this, and the words on the way in. */
export interface StoppedAdminEntry {
  readonly title: string;
  readonly count: number;
  readonly intro: string;
  readonly linkLabel: string;
  readonly settled: boolean;
}

/**
 * The permanent way in, worded for both states.
 *
 * PERMANENT, not conditional on there being something to show — the same choice, for the same reason,
 * as the two links above it on the Admin screen. A link that appears only when it has something to say
 * cannot be found by somebody going to look, and it leaves the screen behind it unreachable for the
 * whole of the time it is empty. The count is on the chip, so an empty state is answered without
 * leaving Admin.
 */
export function describeStoppedAdminEntry(reading: StoppedReading): StoppedAdminEntry {
  const review = describeStoppedChanges(reading);

  if (review.settled) {
    return {
      title: STOPPED_TITLE,
      count: 0,
      intro:
        'Nothing has stopped on the way to your backup. If something does, it will be listed here '
        + 'with what happened to it.',
      linkLabel: 'Check for yourself',
      settled: true,
    };
  }

  return {
    title: STOPPED_TITLE,
    count: review.count,
    intro:
      `${changeCount(review.count)} stopped and will not back up without you. They are saved on this `
      + 'device.',
    // Deliberately not "Fix these": nothing behind this link retries or discards anything, and a link
    // promising more than the screen delivers is the reassurance this application does not offer.
    linkLabel: 'See what stopped',
    settled: false,
  };
}
