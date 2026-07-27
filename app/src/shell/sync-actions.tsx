/**
 * THE TAP — the three action codes this step owns, as things that actually happen.
 *
 * `core/status/reasons.js` names an ACTION for five of its reasons, as a code.
 * `shell/action-destinations.ts` says where each one goes, and three of them go NOWHERE IN THE ROUTE
 * TABLE because they are not screens: connecting Google, reconnecting it, and backing up now are ACTS
 * performed where the coach is standing. This is where they are.
 *
 * ## WHY THIS IS NOT ON THE SYNCHRONISATION SEAM, WHICH IS THE ONE RULE HERE
 *
 * `shell/seams.test.ts` holds all five reporting seams to a shape with NOTHING CALLABLE on them, and
 * asserts that exactly ONE seam ever carries a way to act — the divergence seam, because a divergence
 * is a question the coach ANSWERS. A stopped change, a duplicate key, an unconfirmed removal and a
 * backup status are conditions he is TOLD about, and the argument that test makes is that a control
 * arriving on a reporting surface as a convenience is a defect rather than a shortcut.
 *
 * So the reading stays facts, `NO_BACKUP_YET` stays free of functions, `seams.test.ts` is untouched,
 * and the way to act travels on ITS OWN context beside the seam. That is the same answer
 * `platform/LocalStore.tsx` reached for the removal count: it goes where the live resource goes, one
 * layer below the readings, and adding it to the five would relax the property the five exist to hold.
 *
 * ## THE ACTS NEVER THROW, AND NEVER SHOW A PROVIDER'S WORDS
 *
 * Every refusal is one of `ACQUIRE_REFUSALS` in `google-identity.ts` — this application's own
 * sentences, written for a person, one per cause because he can do something different about each. A
 * provider's error text is a LEAK PATH: it can carry the account address or a file identifier, and
 * text is what gets displayed, logged, journalled and exported. Nothing Google said reaches
 * {@link SyncActions.refusal}, and nothing Google said reaches the indicator.
 *
 *     npm run test:shell
 */

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

/**
 * WHAT THE COACH CAN DO ABOUT A BACKUP THAT HAS NOT HAPPENED — and nothing else.
 *
 * Two acts rather than three, because `connect_google` and `reconnect_google` are the SAME call: a
 * first authorisation and an hourly renewal both go through `acquireForGesture`, deliberately, so
 * that there is one door to keep shut rather than two. They are two different SENTENCES to the coach
 * and one act underneath, and pretending otherwise here would be a second path to a token.
 */
export interface SyncActions {
  /**
   * Connect Google, or reconnect it — inside the gesture that asked for it.
   *
   * It takes the EVENT rather than a boolean, because the only way to obtain a `UserGesture` is from
   * an event the browser itself marked trusted. A timer has no event to offer, so a background
   * authorisation prompt is not something this declines to do; it is something it cannot express.
   */
  readonly connect: (event: { readonly isTrusted?: boolean; readonly type?: string }) => void;
  /** Back up now: the `manual` opportunity, which is one of the five the engine declares. */
  readonly synchronise: () => void;
  /**
   * Whether a pass is running right now.
   *
   * Read so a control can say so rather than offering a second tap that would be skipped. It is NOT
   * the surface's `in_progress` — that is a fact about the data and travels on the reading, where the
   * core puts it beside the figures. This one is about the button.
   */
  readonly running: boolean;
  /**
   * Why the last attempt to connect did not produce a connection, in this application's own words, or
   * null when there is nothing to say.
   *
   * It lives here rather than on the reading because it is not a fact about his data — it is what
   * just happened when he tapped. The core cannot know it and must not be told: a shell-side
   * sentence pushed into a core-derived reading would be the interface inventing a state, which is
   * the one thing the indicator is not permitted to do.
   */
  readonly refusal: string | null;
}

/**
 * The shape of "nothing is wired", written down once.
 *
 * Both acts do nothing and `refusal` is null. It is not returned by the hook — nothing renders a dead
 * button — but it exists so a caller that must supply a value has an honest one, and so that
 * `action-destinations.test.ts` can derive the list of acts the interface really offers from the shape
 * itself rather than from a list of names typed out twice.
 */
export const NO_SYNC_ACTIONS: SyncActions = Object.freeze({
  connect: () => {},
  synchronise: () => {},
  running: false,
  refusal: null,
});

const SyncActionsContext = createContext<SyncActions | null>(null);

/** The acts, supplied by whatever holds the store and the connection. */
export function SyncActionsProvider({
  actions,
  children,
}: {
  actions: SyncActions;
  children: ReactNode;
}) {
  return <SyncActionsContext.Provider value={actions}>{children}</SyncActionsContext.Provider>;
}

/**
 * What the coach can do, or `null` when nothing has supplied it.
 *
 * ## THIS DOES NOT THROW, AND THE DIFFERENCE FROM THE FIVE SEAMS IS THE WHOLE REASON
 *
 * Every seam's hook throws outside its provider, and rightly: a missing READING would be filled by a
 * default, and the state a default invents is always the reassuring one — "nothing to decide",
 * "nothing has stopped", "everything is backed up". A surface that renders good news it never measured
 * is the exact failure those seams exist to prevent, so being loud is the only safe behaviour.
 *
 * A missing CONTROL is the opposite case. The honest rendering of "no way to act was supplied" is NO
 * BUTTON, which invents nothing and claims nothing — it is precisely what this indicator did for two
 * whole steps, deliberately, and `reasons.js` makes the argument itself: offering an action that does
 * not help is how an indicator earns the reputation of lying.
 *
 * AND THROWING HERE WOULD COST THE ONE THING THIS SURFACE MAY NOT LOSE. `SyncStatus.tsx` states that
 * the whole accountability posture rests on the indicator being visible at every moment, on both
 * surfaces, in every state the interface can reach. A hook that threw would take the indicator OFF THE
 * SCREEN wherever the reading was wired and the acts were not — and an absent indicator tells the
 * coach nothing at all, which is worse than any wrong value it could have shown. A provider gap fails
 * at RUNTIME, not at compile time, so nothing would have caught it before he did.
 *
 * The risk this trades for is real and is guarded rather than accepted: if the provider were ever
 * missing in the application itself, the coach would silently lose his Connect button. So
 * `sync-control.test.ts` renders the REAL frame inside the REAL source over a store and asserts the
 * control is there — a positive control on the provider actually being in place, which is the check a
 * throw would have been standing in for.
 */
export function useSyncActionsIfWired(): SyncActions | null {
  return useContext(SyncActionsContext);
}
