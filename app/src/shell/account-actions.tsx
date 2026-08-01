/**
 * THE TWO WAYS OUT OF THIS DEVICE, AS THINGS THAT ACTUALLY HAPPEN.
 *
 * `platform/google-account.ts` has held both since the Google step: `signOutOfGoogle`, which drops
 * the connection and touches nothing else, and `signOutAndEraseThisDevice`, which is separately
 * labelled, separately confirmed, refuses while anything is still deliverable, and destroys the
 * device key slot along with the database. Both were correct, journalled, tested — and had NO
 * PRODUCTION CALLER, which meant the coach could not sign out at all. This file is the caller.
 *
 * ## WHY THIS IS A CONTEXT OF ITS OWN AND NOT A FIELD ON A SEAM
 *
 * The same answer `sync-actions.tsx` reached, for the same reason, and it is worth restating rather
 * than assumed: `shell/seams.test.ts` holds all five reporting seams to a shape with NOTHING
 * CALLABLE on them and asserts that exactly ONE seam ever carries a way to act. A control arriving
 * on a reporting surface as a convenience is a defect rather than a shortcut. So the readings stay
 * facts and the way to act travels beside them, one layer below, supplied by whatever holds the live
 * resources.
 *
 * ## WHY IT IS NOT SIMPLY ADDED TO `SyncActions`
 *
 * Because it is a different question, and `AdminScreen.tsx` argues the general form of this in its
 * own header: ONE CARD PER QUESTION. "Is my backup up to date" and "what happens to my practice if I
 * sign out of Google here" are asked at different moments and by a coach in different states of
 * mind. Two contexts also means the erase gate cannot quietly acquire a dependency on a synchronise
 * button, or the reverse.
 *
 * ## THE ACTS TAKE THE READING RATHER THAN LOOKING IT UP
 *
 * `signOutAndEraseThisDevice` needs the delivery figures to run its gate. Those figures are the ones
 * `SyncFromStore` already holds — it is the one holder of the live `accountabilityStatus()` result —
 * so they are passed down rather than read a second time. Two reads of one queue is two answers to
 * one question, and the second is the one that goes wrong.
 *
 * ## AND NOTHING A PROVIDER SAID REACHES A SENTENCE HERE
 *
 * The same leak rule `sync-actions.tsx` states. A failure's own text is carried as `verbatim` on the
 * outcome, deliberately separated from the application's own words, so a screen can choose to show
 * it as evidence rather than having it spliced into prose that will be read aloud.
 *
 *     npm run test:shell
 */

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { AccountActOutcome } from '../screens/admin-report';
import type { DeliveryFiguresOutcome } from './SyncFromStore';

/**
 * WHAT THE COACH CAN DO ABOUT HIS GOOGLE ACCOUNT ON THIS DEVICE — two acts, and nothing else.
 *
 * They are two rather than one with a flag, at every level this application has: two routines in the
 * platform, two controls on the card, two confirmations, and two members here. A boolean parameter
 * is how "sign out" and "destroy everything" become one code path with a checkbox, which is exactly
 * the shape `google-account.ts` was written to prevent.
 */
export interface AccountActions {
  /** Drop the Google connection on this device. Local data is not touched. */
  readonly signOut: () => void;
  /**
   * Sign out AND erase this device.
   *
   * @param acknowledged he has read what will be lost and said go ahead. It is only ever accepted
   * when the gate's verdict is `decide`; on any other verdict the mechanism ignores it, and on
   * `wait` the mechanism refuses whatever is passed. Nothing here decides that.
   */
  readonly eraseThisDevice: (acknowledged: boolean) => void;
  /**
   * THE DELIVERY FIGURES THE GATE WILL READ — carried here, beside the acts, and NOT read again.
   *
   * ## Why they ride the acts rather than being fetched by the card
   *
   * TWO reasons, and the second is the one that made this the only shape.
   *
   * ONE, the panel that names what he would lose and the gate that decides whether he may erase must
   * be reading THE SAME object. The card would otherwise take a reading of its own, the acts would
   * pass a second one down, and the day those two disagreed the coach would be shown a figure that
   * was not the figure he was refused on — in front of a destructive button, silently.
   *
   * TWO, `shell/frame-structure.test.ts` forbids a screen from calling `useSyncStatus` at all: there
   * is exactly ONE synchronisation indicator, the frame owns it, and a screen reaching for the
   * status reading is how a second live region gets drawn. That guard is right and is not weakened
   * here — the admin card reads no status reading, it is handed the six figures the erase gate
   * needs, by the one holder that already has them.
   *
   * THREE, AND IT IS THE ONE THAT MADE THIS A UNION RATHER THAN SIX NUMBERS: the read that produces
   * them can FAIL, and it did so silently. The outcome travels rather than the figures, so the card
   * cannot draw a confirmation and the gate cannot return `clear` over a queue nobody counted.
   */
  readonly figures: DeliveryFiguresOutcome;
  /** Whether one of them is in flight, so a control can say so rather than offering a second tap. */
  readonly running: boolean;
  /**
   * What the last act did, or null when nothing has been pressed.
   *
   * A FACT AND NOT A SENTENCE. The words are `screens/admin-report.ts`'s, where they are asserted —
   * a sentence decided here would be a second place this application says what signing out means.
   */
  readonly last: AccountActOutcome | null;
}

/**
 * The shape of "nothing is wired", written down once.
 *
 * It is not returned by the hook — nothing renders a dead control — but a caller that must supply a
 * value has an honest one, and it is frozen so nobody can grow it a state by writing to it.
 */
export const NO_ACCOUNT_ACTIONS: AccountActions = Object.freeze({
  signOut: () => {},
  eraseThisDevice: () => {},
  // NOT READ, WHICH IS WHAT IS TRUE OF A DEVICE NOTHING HAS WIRED. The figures below are the ones
  // `accountabilityStatus()` genuinely returns over an untouched store rather than a hopeful
  // default — but nothing has taken that reading here, and `not_yet` is what says so. The gate
  // refuses on it, which is the right answer for a value no read produced.
  figures: Object.freeze({
    status: 'not_yet' as const,
    pending: 0,
    waiting_for_credential: 0,
    rejected: 0,
    ambiguous: 0,
    oldest_undelivered_label: null,
    oldest_undelivered_age_ms: null,
    // No reason to show, which is what `accountabilityStatus()` returns over a store with nothing
    // outstanding — and not the same as a reason nobody passed. Nothing is refused in this state, so
    // there is nothing for a refusal to name either way.
    reason: null,
  }),
  running: false,
  last: null,
});

const AccountActionsContext = createContext<AccountActions | null>(null);

/** The acts, supplied by whatever holds the store, the connection and the delivery reading. */
export function AccountActionsProvider({
  actions,
  children,
}: {
  actions: AccountActions;
  children: ReactNode;
}) {
  return (
    <AccountActionsContext.Provider value={actions}>{children}</AccountActionsContext.Provider>
  );
}

/**
 * What he can do, or `null` when nothing has supplied it.
 *
 * ## THIS DOES NOT THROW, AND THE ARGUMENT IS `sync-actions.tsx`'s ONE, NOT A NEW ONE
 *
 * A missing READING is filled by a default and the state a default invents is always the reassuring
 * one, so a seam must be loud. A missing CONTROL is the opposite case: the honest rendering of "no
 * way to act was supplied" is NO BUTTON, which invents nothing and claims nothing.
 *
 * AND A THROW HERE WOULD TAKE THE WHOLE ADMIN SCREEN DOWN. The card sits among five others that
 * report conditions he may urgently need — a pending removal, a stopped change, a duplicate key —
 * and a provider gap fails at RUNTIME rather than at compile time. Losing the sign-out control is a
 * bad day; losing the screen that tells him what is wrong with his backup is a worse one.
 *
 * The risk that trades for is real and is guarded rather than accepted: if the provider were ever
 * missing in the application itself the coach would silently lose his only way to sign out, which is
 * the very defect this step exists to close. So `sign-out-control.test.ts` renders the REAL frame
 * over the REAL source and asserts both controls are there — a positive control on the provider
 * actually being in place, which is what a throw would have been standing in for.
 */
export function useAccountActionsIfWired(): AccountActions | null {
  return useContext(AccountActionsContext);
}
