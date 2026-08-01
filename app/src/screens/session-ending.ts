/**
 * FINISHING A SESSION — every word the control says, and the one ending it is allowed to reach.
 *
 * The same split every screen in this application follows: the judgement and the wording live here so
 * the suite can assert them with no rendering at all, `session-ending-source.ts` makes the write, and
 * `SessionEnding.tsx` only draws. `screens/removals.ts` against `screens/RemovalsScreen.tsx` is the
 * shape.
 *
 * ## WHAT WAS ACTUALLY WRONG, AND IT WAS NOT A MISSING MECHANISM
 *
 * `core/session/live-session.js` has named `complete()`, `interrupt()` and `abandon()` as the three
 * endings since the session layer was written, and no screen called `complete()` or `abandon()`. So
 * every session the coach started stayed `in_progress` forever, sat under "Sessions you have not
 * finished" forever, and the calendar's only offer against it was "Pick up where you left off". Three
 * weeks in he had sixty of them. The mechanism was built and unreachable; this is the wire.
 *
 * The landing place was built and unreachable in exactly the same way — `launcher.ts` already holds
 * "Sessions already done", `statusWords('completed')` already reads "Finished", and
 * `launcher-source.ts` already excludes `in_progress` and `interrupted` from history and lets
 * everything else in. Nothing about either list changed to make room for a finished session. The
 * status change was the only thing missing.
 *
 * ## ONE ENDING, AND THE OTHER TWO ARE NOT REACHABLE FROM THIS CONTROL
 *
 * The three endings are three different statements about what happened, and the record keeps
 * whichever one is written. `complete()` means the session went as planned. `interrupt()` means he
 * left and it is not finished — which is what PICKING IT UP is for, and is already how a session that
 * is merely left behaves. `abandon()` means it is not going to be finished.
 *
 * THIS CONTROL WRITES `complete()` AND NOTHING ELSE. A single control covering more than one ending
 * would be a control that silently files "abandoned" on a day the coach meant "done" — and it would
 * corrupt his record in the one direction he has no reason to go looking in, because a finished
 * session that reads as finished is not a thing anybody re-checks. If a later step wants the other
 * two reachable, they are a separate question with a separate control and separate words.
 *
 * ## FINISHING CHANGES NO COUNT, AND SAYING SO IS LOAD-BEARING
 *
 * `core/report/participation.js` sets `ATTENDED_STATUSES = STARTED_SESSION_STATUSES` deliberately: a
 * session that STARTED is already an attended one, and the progress report is assembled from the
 * per-exercise records written DURING the session rather than from an ended flag. So a report over
 * five unfinished sessions already reads "You trained 5 sessions", and it must still read 5 after
 * they are finished. NOTHING HERE FILTERS, GATES OR RE-COUNTS ANYTHING. If a number moves when a
 * session is finished, that is a defect this control introduced and not an improvement it made.
 *
 * ## THE AFTERMATH SENTENCE MAKES CHECKABLE CLAIMS ON PURPOSE
 *
 * {@link FINISHED_WORDS} and the two beside it say what state finishing left behind, and every clause
 * is something the suite reads back off the store: the status left `in_progress`, `ended_at` is
 * written, and every per-exercise record, reading and note captured during the session is still there
 * and unchanged. This build has already shipped a refusal sentence claiming a save had erased
 * something when nothing had moved, which is why a sentence about an outcome is treated here as an
 * assertion rather than as reassurance.
 */

import type { RefusalReport } from './modular-control';

// ═══════════════════════════════════════════════════════════════════════════════
// The control
// ═══════════════════════════════════════════════════════════════════════════════

/** The heading over the control, so it reads as part of the session rather than as a stray button. */
export const FINISH_TITLE = 'Finishing this session';

/**
 * WHAT THE CONTROL SAYS ABOUT ITSELF, and it names the one ending it writes.
 *
 * "Went as planned" rather than "is over": a session he walked out of is ALSO over, and that is
 * `interrupt()`, which is what leaving already does. The difference between the two is the whole
 * reason there is a wording here at all.
 */
export const FINISH_WORDS =
  'Use this when the session went as planned and there is nothing more to record in it. Leaving this '
  + 'screen without pressing it does not finish anything: the session stays open and the Calendar '
  + 'offers to pick it up exactly as it stands.';

/** The control itself. */
export const FINISH_LABEL = 'Finish this session';

/**
 * WHAT HE IS ASKED BEFORE IT HAPPENS, because finishing is one-way and the core says so itself.
 *
 * `openSession` refuses an ended session outright — "That session has already finished" — so a
 * session finished by mistake cannot be picked up and carried on with. A one-way act reached by a
 * single tap on a phone held beside a client is the shape of accident this confirmation exists for.
 * It is a confirmation and NOT a warning: nothing is lost either way, and wording it as a danger
 * would tell him something went wrong on a day nothing did.
 */
export const FINISH_CONFIRM_WORDS =
  'Everything already recorded in it is kept. A finished session cannot be picked up again, so if '
  + 'there is anything left to record, record it first.';

export const FINISH_CONFIRM_LABEL = 'Yes, finish it';

/** The way out of the confirmation, which changes nothing at all. */
export const FINISH_CANCEL_LABEL = 'Not yet';

/** What the control says while the ending is being written. */
export const FINISHING_WORDS = 'Finishing this session…';

// ═══════════════════════════════════════════════════════════════════════════════
// The aftermath, and every clause of it is checkable
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * WHAT FINISHING LEFT BEHIND. Three claims, each one read back off the store by the suite.
 *
 * It does not say the session was "saved" as though the saving were the event — every fact in it was
 * already saved as it was recorded, and implying otherwise would suggest the earlier ones had been
 * waiting for this press.
 */
export const FINISHED_WORDS =
  'Finished. Everything recorded in it — the exercises, the readings and the notes — is still here, '
  + 'exactly as it was.';

/** Where it went, named by the words the calendar actually draws over each list. */
export const FINISHED_WHERE =
  'It has left "Sessions you have not finished" and is now under "Sessions already done" on the '
  + 'Calendar.';

/**
 * AND WHAT HE STILL CANNOT DO THERE, said in the same breath rather than left to be discovered.
 *
 * `launcher.ts` already declares this of its own history list — "Reading one back in full — what was
 * done, the loads, the progress — is not built yet" — and that declaration is still true. Repeating it
 * at the moment he finishes a session is the point: this is when he would go looking.
 */
export const FINISHED_NOT_BUILT =
  'Reading a past session back in full — what was done, the loads — is not built yet, so the '
  + 'Calendar lists it rather than opening it.';

// ═══════════════════════════════════════════════════════════════════════════════
// Where the control is in its own small life
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The control's own transient state, held by the screen exactly as the other four surfaces on this
 * spine are.
 *
 * `SESSION.md` §2: anything describing where a session has got to is DERIVED, never persisted. This
 * is not that — it is whether a confirmation is open — and it is passed to no writer and dies with
 * the window.
 */
export interface EndingState {
  /** True once he has pressed Finish and is being asked to confirm. */
  readonly asking: boolean;
  /** True while the ending is in flight, so one press writes one ending. */
  readonly finishing: boolean;
  /** True once the session has been finished from this screen. */
  readonly finished: boolean;
  /** Why it did not, in the coach's words. Null when nothing has been refused. */
  readonly refusal: RefusalReport | null;
}

/** Nothing pressed, nothing asked, nothing refused. */
export const noEnding: EndingState = Object.freeze({
  asking: false, finishing: false, finished: false, refusal: null,
});

/** He pressed Finish. A previous refusal goes: he is being asked again, not told again. */
export function asking(state: EndingState): EndingState {
  return { ...state, asking: true, refusal: null };
}

/** He backed out. Nothing was written and nothing is claimed. */
export function notYet(state: EndingState): EndingState {
  return { ...state, asking: false, refusal: null };
}

/** He confirmed, and the write is in flight. */
export function finishing(state: EndingState): EndingState {
  return { ...state, asking: false, finishing: true, refusal: null };
}

/** It landed. */
export function finished(state: EndingState): EndingState {
  return { ...state, asking: false, finishing: false, finished: true, refusal: null };
}

/**
 * SOMETHING WAS REFUSED, and it is reported rather than swallowed.
 *
 * IT DOES NOT DECIDE WHETHER THE SESSION FINISHED — it carries `finished` through exactly as it
 * found it, and that is the whole care in this function. There are two refusals here and they mean
 * opposite things: the ending was refused outright, applied over a state where `finished` is false;
 * and the ending LANDED but the read-back after it did not, which `throughTheHeldSession` reports as
 * `ok` with a sentence on it, applied over a state where `finished` is true. A version that forced
 * `finished` to false would tell him the session is still open when it is ended — and he would press
 * again and be refused by the core for a reason that reads as a fault.
 *
 * A control that simply fell quiet on either is the absence-that-looks-like-a-pass this build has
 * been bitten by repeatedly, which is why neither is swallowed.
 */
export function refused(state: EndingState, refusal: RefusalReport): EndingState {
  return { ...state, asking: false, finishing: false, refusal };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Whether the control is offered at all
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * WHETHER THERE IS A SESSION HERE TO FINISH.
 *
 * `is_live` on the projection is `status === 'in_progress'`, which is exactly the question: a session
 * this window is running is one that can be completed, and a session already ended is not. So the
 * control disappears the moment it is used, because the record says the session is no longer running
 * — not because this module remembered pressing it.
 *
 * IT IS NOT CONDITIONAL ON ANYTHING HAVING BEEN RECORDED. A session where nothing was recorded is
 * still a session that happened, and a control that refused to finish an empty one would be this
 * module deciding what counts as a real session.
 */
export function canFinish(report: { readonly live: boolean } | null): boolean {
  return report !== null && report.live;
}
