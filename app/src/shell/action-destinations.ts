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
 * So every code is written down here with exactly one of three dispositions, and there is no fourth:
 *
 *   - an ADDRESS in this application, which must be a route the table actually answers to;
 *   - an ACT PERFORMED WHERE HE IS STANDING, named, for the codes that are not screens at all; or
 *   - an OWNING STEP, named. Not "later", not "the sync step" — the identifier of the step whose job
 *     it is, so the next reader of `reasons.js` can find out where his action code went without
 *     re-deriving it.
 *
 * ## THE THIRD DISPOSITION IS NEW, AND IT EXISTS BECAUSE THE THREE GOOGLE CODES ARE NOW BUILT
 *
 * This file used to have two dispositions, and under them `connect_google`, `reconnect_google` and
 * `sync_now` each named an owning step. They are built now — the report wire exists, the indicator has
 * its tap, and `shell/sync-actions.tsx` holds the acts. Leaving them claiming an owner would be this
 * table lying in the direction it was written to prevent: it would say a piece of work is somebody
 * else's when it is finished, which is how a step comes to be planned twice.
 *
 * They could not become an ADDRESS either, and that is why a third disposition rather than a fudge.
 * Connecting an account and backing up now are not places — they are things that happen, inside the
 * gesture that asked for them, without leaving the screen. Pointing them at a route would mean
 * inventing a screen whose only content is a button, and `no-dead-ends.test.ts` would be right to
 * object. So the disposition says WHICH ACT, by name, and the indicator maps a code to an act through
 * this table rather than through a switch of its own.
 *
 * ## Why this is a table and not five branches in the indicator
 *
 * What was missing was never the button. It was any record of whether an action code HAS a destination
 * at all, which is why two of them sat unbuilt behind a step that never needed to own them.
 *
 * This table is that record, and it is checked rather than believed: `action-destinations.test.ts`
 * asserts that every code in `REASONS` appears here exactly once, that every address resolves against
 * the shipped `ROUTE_TABLE`, that every act names one the interface actually offers, and that a code
 * with none of the three fails. A code added to the core and forgotten here is a failure, not a silent
 * omission.
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
  /**
   * The setup page: walking a non-technical person through creating the Google Cloud project, the
   * consent screen and the client id, and through making a coaching calendar.
   *
   * NO ACTION CODE IS OWNED BY IT, and that is worth saying plainly rather than leaving the constant
   * looking abandoned. Connecting is BUILT — the act exists and runs — but it can refuse with
   * `not-configured` until the coach has been given somewhere to enter his client id, and that
   * somewhere is this step's. The field itself already exists (`platform/google-settings.ts`); what
   * s10 adds is the screen and the words. The vocabulary is kept because the RULE is still enforced:
   * a code may name an owner, and a code that names one nobody declared is a failure.
   */
  SETUP_PAGE: 's10',
});

/** The acts the interface actually offers. Two, and `sync-actions.tsx` is where they are. */
export const PERFORMED_ACT = Object.freeze({
  /** Connect Google, or reconnect it. One call, two sentences — see `sync-actions.tsx`. */
  CONNECT: 'connect',
  /** Run a pass now: the `manual` opportunity, one of the five `SYNC_TRIGGERS` declares. */
  SYNCHRONISE: 'synchronise',
});

/** @see PERFORMED_ACT */
export type PerformedActName = (typeof PERFORMED_ACT)[keyof typeof PERFORMED_ACT];

/**
 * An act performed where the coach is standing, and the words on it.
 *
 * The WORDS live here rather than in the component for the same reason the table does: they are
 * checkable in a plain module with no browser, and there is then one place that knows what the control
 * for a given reason says. They are OUR words — short, imperative, no emoji, and never a provider's
 * text.
 */
export interface PerformedHere {
  readonly act: PerformedActName;
  /** What the button says. Never "Retry", which says nothing about what will happen. */
  readonly words: string;
}

/**
 * What an action code leads to.
 *
 * Exactly one of `path`, `performed` and `ownedBy` is set, and which one is the whole content of this
 * table. The shape does not enforce it — three nullable fields cannot — so this file's own check does,
 * and that check is proven able to fail: a member with two of them, or with none, is rejected by rules
 * the test drives against deliberately broken tables.
 */
export interface ActionDestination {
  /** The address in this application, or null when it is not a place. */
  readonly path: string | null;
  /** The act performed in place, or null when it is not a thing that happens here. */
  readonly performed: PerformedHere | null;
  /** The step that owns building it, or null when it is built and one of the two above says how. */
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
    performed: Object.freeze({ act: PERFORMED_ACT.CONNECT, words: 'Connect Google' }),
    ownedBy: null,
    because:
      'Connecting is an act, not a place: the token can only be acquired inside the gesture that asked '
      + 'for it, so it happens on the indicator he tapped and he does not leave the screen. It may '
      + `still refuse until he has entered his own client id, which is ${OWNING_STEP.SETUP_PAGE}'s `
      + 'screen to give him — the refusal has its own sentence and names that page.',
  }),
  reconnect_google: Object.freeze({
    path: null,
    performed: Object.freeze({ act: PERFORMED_ACT.CONNECT, words: 'Reconnect Google' }),
    ownedBy: null,
    because:
      'The SAME act as connecting, with different words in front of it. There is no refresh token, so '
      + 'an hourly renewal is the same gesture-bound acquisition as the first one — one door rather '
      + 'than two — and "reconnect" is what it is to him.',
  }),
  sync_now: Object.freeze({
    path: null,
    performed: Object.freeze({ act: PERFORMED_ACT.SYNCHRONISE, words: 'Back up now' }),
    ownedBy: null,
    because:
      'The tap that runs a real pass and reads the report back. It is the `manual` opportunity the '
      + 'engine declares, and the report it returns is what advances the last-backed-up value, so '
      + 'this is the one code whose whole point is that it changes what the indicator says.',
  }),
  review_refused: Object.freeze({
    path: STOPPED_CHANGES_PATH,
    performed: null,
    ownedBy: null,
    because:
      'Reviewing a refused change is a read over the local queue: `needsAttention` in '
      + '`core/outbox/status.js`, whose refusal reason is already kept verbatim. It never needed '
      + 'Google, and had been carried behind it by proximity.',
  }),
  review_unconfirmed: Object.freeze({
    path: STOPPED_CHANGES_PATH,
    performed: null,
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

/**
 * THE THREE CODES THE SYNCHRONISATION JOIN CLOSED, named so the claim can be checked against the code.
 *
 * Read off `REASONS` rather than spelled, exactly like {@link CODES_CLOSED_LOCALLY}: if the core ever
 * renames one, this constant follows it and the assertions about it keep meaning what they meant.
 *
 * `never_synchronised` and `credential_missing` both name `connect_google`, so the set is de-duplicated
 * — three ACTS, from four reasons.
 */
export const CODES_PERFORMED_HERE: readonly string[] = Object.freeze([
  ...new Set([
    REASONS[REASON.NEVER_SYNCHRONISED].action as string,
    REASONS[REASON.CREDENTIAL_MISSING].action as string,
    REASONS[REASON.CREDENTIAL_EXPIRED].action as string,
    REASONS[REASON.UNVERIFIABLE_SYNC_CLAIM].action as string,
  ]),
]);

/**
 * The act for one action code, or null when this code is not something that happens here.
 *
 * The indicator asks this rather than carrying a switch of its own, so there is ONE place that knows
 * which codes are acts — the same reason the addresses are a table rather than five branches.
 */
export function performedFor(code: string | null): PerformedHere | null {
  if (code === null) return null;
  return ACTION_DESTINATIONS[code]?.performed ?? null;
}
