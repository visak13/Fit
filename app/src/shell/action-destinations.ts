/**
 * WHERE EACH OF THE STATUS SURFACE'S ACTION CODES ACTUALLY GOES — and who owns the ones that have
 * nowhere to go yet.
 *
 * ## The gap this file closes
 *
 * `core/status/reasons.js` does not merely say why a synchronisation did not happen; for five of its
 * eight reasons it names an ACTION the coach can take, as a code. `SyncStatus.tsx` then listed all
 * five as things "the later step" must supply — and named no step. That sentence is how two of them
 * came to be waiting on the Google integration for no reason at all: `review_refused` and
 * `review_unconfirmed` are reads over the LOCAL outbox queue, and they had been carried along behind
 * the Google work by proximity rather than by need.
 *
 * So every code is written down here with exactly one of two dispositions, and there is no third:
 *
 *   - an ADDRESS in this application, which must be a route the table actually answers to; or
 *   - an OWNING STEP, named. Not "later", not "the sync step" — the identifier of the step whose job
 *     it is, so the next reader of `reasons.js` can find out where his action code went without
 *     re-deriving it.
 *
 * ## Why this is a table and not five branches in the indicator
 *
 * The indicator is not a control today and deliberately says so: there is nothing to connect to and
 * nothing to send, and a button that cannot do what its words say is worse than no button —
 * `reasons.js` makes that argument itself about offering an action that does not help. What was
 * missing was not the button. It was any record of whether an action code HAS a destination at all,
 * which is why two of them sat unbuilt behind a step that never needed to own them.
 *
 * This table is that record, and it is checked rather than believed: `action-destinations.test.ts`
 * asserts that every code in `REASONS` appears here exactly once, that every address resolves against
 * the shipped `ROUTE_TABLE`, and that a code with neither an address nor a named owner fails. A code
 * added to the core and forgotten here is a failure, not a silent omission.
 *
 * IT DOES NOT BUILD, STUB OR BRANCH ON the three Google-bound codes. Naming the step that owns one is
 * the opposite of stubbing it: a stub is a thing that looks built and is not, and this is a written
 * statement that it is not built and whose it is.
 */

import { REASON, REASONS } from '../../core/status/reasons.js';
// Only the stopped-changes address appears below. The pending-removal surface is deliberately absent:
// `core/status/reasons.js` declares no action code for an unconfirmed removal, so there is nothing here
// for it to be the destination OF. Adding it would be this table growing an entry no core reason
// produces, which is the drift its own check exists to catch in the other direction.
import { STOPPED_CHANGES_PATH } from './navigation';

/**
 * The step identifiers used below.
 *
 * Written out so the words in this file are the recipe's own words for these pieces of work, and so a
 * reader who has never seen the plan can still tell that "s7" and "S16" are two different owners
 * rather than two spellings of "not yet".
 */
export const OWNING_STEP = Object.freeze({
  /** The Google integration: the OAuth token model, minting a Meet link, reaching Drive at all. */
  GOOGLE: 's7',
  /** The synchronisation join: carrying a completed pass's report through to the surface. */
  SYNC_REPORT_WIRE: 'S16',
});

/**
 * What an action code leads to.
 *
 * Exactly one of `path` and `ownedBy` is set, and which one is the whole content of this table. The
 * shape enforces it rather than a comment asking for it: a member with both, or with neither, is a
 * member this file's own check rejects.
 */
export interface ActionDestination {
  /** The address in this application, or null when nothing here answers to it yet. */
  readonly path: string | null;
  /** The step that owns building it, or null when it is built and `path` says where. */
  readonly ownedBy: string | null;
  /** Why it is where it is, in one line. Read by a person, not by the application. */
  readonly because: string;
}

/**
 * Every action code `core/status/reasons.js` can produce, and where it goes.
 *
 * Keyed by the code itself and read off `REASONS` in the test rather than typed twice here — the
 * strings below are the keys of this object, and the check is that the two sets are equal.
 */
export const ACTION_DESTINATIONS: Readonly<Record<string, ActionDestination>> = Object.freeze({
  connect_google: Object.freeze({
    path: null,
    ownedBy: OWNING_STEP.GOOGLE,
    because:
      'Connecting an account needs the OAuth token flow, which is the whole of what that step is. '
      + 'There is nothing local to show and nothing to build here ahead of it.',
  }),
  reconnect_google: Object.freeze({
    path: null,
    ownedBy: OWNING_STEP.GOOGLE,
    because:
      'Re-acquiring an expired access token must happen inside the user gesture that needed it, so it '
      + 'belongs to the step that owns the token model.',
  }),
  sync_now: Object.freeze({
    path: null,
    ownedBy: OWNING_STEP.SYNC_REPORT_WIRE,
    because:
      'A manual synchronisation is the tap that runs a real pass and reads the report back. The pass '
      + 'exists in the core; the wire from it to the surface is what that step is building.',
  }),
  review_refused: Object.freeze({
    path: STOPPED_CHANGES_PATH,
    ownedBy: null,
    because:
      'Reviewing a refused change is a read over the local queue: `needsAttention` in '
      + '`core/outbox/status.js`, whose refusal reason is already kept verbatim. It never needed '
      + 'Google, and had been carried behind it by proximity.',
  }),
  review_unconfirmed: Object.freeze({
    path: STOPPED_CHANGES_PATH,
    ownedBy: null,
    because:
      'Same read, the other half of the same pair. The identifiers a person needs in order to decide '
      + 'are already carried on the entry, locally.',
  }),
});

/**
 * Where an action code leads, or null if this application has never heard of it.
 *
 * Null rather than a throw: an unknown code reaching here means the core grew one that nobody mapped,
 * and the place that fails for that is the check, loudly, at build time — not the coach's screen while
 * he is looking at it.
 */
export function destinationForAction(code: string): ActionDestination | null {
  return ACTION_DESTINATIONS[code] ?? null;
}

/**
 * Every action code the core actually declares, derived from `REASONS` rather than listed.
 *
 * `null` actions are dropped: a reason with no action is a reason where there is genuinely nothing the
 * coach can do, which `reasons.js` is explicit about being deliberate.
 */
export const DECLARED_ACTION_CODES: readonly string[] = Object.freeze([
  ...new Set(
    Object.values(REASONS)
      .map((reason: { action: string | null }) => reason.action)
      .filter((action): action is string => action !== null),
  ),
]);

/**
 * The two codes this step closed, named so the record can be checked against the claim.
 *
 * They are read off `REASONS` rather than spelled, so if the core ever renames one, this constant
 * follows it and the assertions about it keep meaning what they meant.
 */
export const CODES_CLOSED_LOCALLY: readonly string[] = Object.freeze([
  REASONS[REASON.ENTRY_REJECTED].action as string,
  REASONS[REASON.OUTCOME_UNKNOWN].action as string,
]);
