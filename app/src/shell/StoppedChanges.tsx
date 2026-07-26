/**
 * THE STOPPED-CHANGES SEAM — where the review surface gets the two queues, and why it is two.
 *
 * ## The seam `Divergences.tsx` said would be copied, copied a second time
 *
 * That file states what a seam in this application is made of, and this is made of the same things
 * deliberately rather than by coincidence:
 *
 * - The reading is a PLAIN VALUE, not a hook that fetches. A screen cannot start work of its own, and
 *   the core stays behind no build step.
 * - Its fields are the core's own, field for field and name for name. `rejected` and `ambiguous` hold
 *   the PAGES `needsAttention` (`core/outbox/status.js`) returned, unconverted — items, cursor and
 *   `done` intact. Nothing is renamed and nothing is flattened.
 * - The provider is REQUIRED. `useStoppedChanges` throws outside it rather than defaulting, because the
 *   state a default would invent — "nothing has stopped" — is the one that looks like good news while
 *   the coach's work sits in a queue that will never move it.
 *
 * ## WHY THE READING CARRIES TWO PAGES AND NEVER ONE LIST
 *
 * This is not a shape chosen here. `needsAttention` returns two pages, and its own docstring says
 * why: "the two need different words in front of the coach — one says the remote refused it, the other
 * says we cannot tell — and merging them would force the surface to re-derive which is which."
 *
 * A merged list would have to be re-split by reading each entry's `status`, which is the same
 * judgement made twice in two places, and the second copy is the one that goes wrong. So the split
 * survives the whole way to the screen: two pages here, two groups in `stopped-changes.ts`, two
 * headed sections on the screen, and `stopped-changes.test.ts` fails if they are ever merged.
 *
 * ## `done` AND `cursor` ARE CARRIED, AND THAT IS NOT INCIDENTAL
 *
 * A page is a page because the queue can be long after a fortnight offline. Dropping `done` here would
 * leave the screen unable to tell the difference between "these are all of them" and "these are the
 * first twenty-five of an unknown number", and it would silently show the second while saying the
 * first. The derivation reads `done` and says which it is.
 *
 * ## What the later step supplies, precisely
 *
 * It replaces the SOURCE, not this file and not the screen. It must:
 *
 *   1. open the local store and call `needsAttention(store, { limit, after })` from
 *      `core/outbox/status.js`;
 *   2. push the result in as this reading, UNCHANGED — both pages, both cursors;
 *   3. re-read it after every flush, because an entry that stopped during a pass is exactly what this
 *      surface exists to report and it appears at no other moment.
 *
 * WHAT IT MUST NOT DO IS ADD A CONTROL HERE. There is no retry and no discard on this reading, and
 * that is deliberate: both are deliveries to a real service, so both belong to the step that owns the
 * credential. Reviewing a stopped change needs neither, which is the whole reason this surface could
 * be built now — and `stopped-changes.test.ts` walks the reading and the report for anything callable,
 * so a retry button cannot arrive here quietly as a convenience.
 */

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { StoppedPage } from '../screens/stopped-changes';

export type { StoppedEntry, StoppedPage } from '../screens/stopped-changes';

export interface StoppedChangesReading {
  /** The page of entries the service REFUSED, oldest first, exactly as the core paged them. */
  readonly rejected: StoppedPage;
  /** The page whose outcome CANNOT BE TOLD, oldest first, exactly as the core paged them. */
  readonly ambiguous: StoppedPage;
}

/** An empty page, in the core's own three fields. `done` is true: there is nothing beyond this. */
const NO_ENTRIES: StoppedPage = Object.freeze({
  items: Object.freeze([]) as StoppedPage['items'],
  cursor: null,
  done: true,
});

/**
 * What is true in this build: no local store is wired, so nothing has ever been queued, so nothing can
 * have stopped. It is not a placeholder standing in for a real value — it is exactly what
 * `needsAttention` returns over a store in that condition, which is every device until the
 * synchronisation step lands.
 */
export const NOTHING_STOPPED: StoppedChangesReading = Object.freeze({
  rejected: NO_ENTRIES,
  ambiguous: NO_ENTRIES,
});

const StoppedChangesContext = createContext<StoppedChangesReading | null>(null);

export function StoppedChangesProvider({
  reading,
  children,
}: {
  reading: StoppedChangesReading;
  children: ReactNode;
}) {
  return <StoppedChangesContext.Provider value={reading}>{children}</StoppedChangesContext.Provider>;
}

/**
 * The current reading.
 *
 * @throws Error when used outside the provider. A missing seam must be loud: silently rendering
 * "nothing has stopped" would be an unwired screen reporting the one state that looks like good news.
 */
export function useStoppedChanges(): StoppedChangesReading {
  const reading = useContext(StoppedChangesContext);
  if (reading === null) {
    throw new Error('useStoppedChanges was used outside StoppedChangesProvider: the stopped-changes seam is not wired');
  }
  return reading;
}
