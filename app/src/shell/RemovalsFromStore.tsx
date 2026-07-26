/**
 * THE PENDING-REMOVAL SEAM, FILLED FROM THE LOCAL STORE — the one line `main.tsx` said a later step
 * would change.
 *
 * `main.tsx` had `NOTHING_AWAITING_REMOVAL` in this position, and that literal was TRUE rather than a
 * placeholder: no client can have been removed on a device with no store. This component makes it
 * false, by replacing the SOURCE and nothing else. `Removals.tsx`, `screens/removals.ts` and
 * `RemovalsScreen.tsx` are untouched by it, which is what that seam was shaped for.
 *
 * ## WHAT THIS DOES NOT DECIDE
 *
 * Nothing. The reading it publishes is the page `pendingDeletions` returned, and the judgement about
 * what to read and what may not be done to the result is in `removals-source.ts`.
 *
 * ## IT READS AGAIN AFTER A REMOVAL MADE ON THIS DEVICE, AND THAT WAS A REAL DEFECT
 *
 * This read used to happen ONCE per store, with no refresh, and the reason given was sound at the
 * time: `verifyAndMarkPropagated` is what moves a manifest out of pending, it only runs during a
 * synchronisation pass, and there was no pass and no other writer. The client register then became
 * the second writer — `purgeClient` leaves a pending manifest the moment the coach removes somebody
 * — and nobody had told this file. So he removed a client on the register, walked to the surface
 * that reports removals awaiting confirmation, and was told nothing was waiting while a manifest sat
 * there pending: false good news about a departed client's data, which is the one thing this surface
 * exists to prevent.
 *
 * The correction is the smallest one available. `useLocalRemovals` is a COUNT on the source both
 * sides already share — see `platform/local-store.ts` for why a number rather than a notification
 * mechanism, and why it deliberately cannot wake the four seams that are still honestly frozen. The
 * count is in the dependency list below and is read for NOTHING else; it never reaches the reading,
 * so the seam still carries facts and nothing callable.
 *
 * WHAT IS STILL NOT DONE, and is reported rather than faked: this does not re-read after a
 * SYNCHRONISATION pass, because there is no synchronisation to re-read after. That trigger is S16's
 * and it belongs on this same line — another entry in the same dependency list, not a second
 * mechanism. And there is deliberately no interval and no polling: a timer would be a second copy of
 * the store's own knowledge, ticking for ever to catch an event that already announces itself.
 *
 * ## THE ONE WINDOW WHERE THE SEAM IS STILL THE EMPTY READING, STATED RATHER THAN HIDDEN
 *
 * Between the store opening and the first page arriving — one microtask on an already-open database —
 * the seam still carries `NOTHING_AWAITING_REMOVAL`, which says "nothing is waiting". That is a
 * bounded transient and it is named here because the alternative is worse in both directions: holding
 * the children back until the read lands would put a blank screen in front of the coach, which this
 * application may not do, and inventing a sixth field on the seam to say "not read yet" would give
 * the other four seams a shape they do not have.
 *
 * The state that LASTS — the store not opening at all — is not left to this transient. The surfaces
 * ask `useLocalStore()` directly and say what is wrong, which is the case that matters: an empty page
 * read from a store that never opened would be the exact false good news the removals surface was
 * built to prevent.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { useLocalRemovals, useLocalStore } from '../platform/LocalStore';
import type { RemovalsPage } from '../screens/removals';
import { NOTHING_AWAITING_REMOVAL, RemovalsProvider } from './Removals';
import type { RemovalsReading } from './Removals';
import { readPendingRemovals } from './removals-source';
import type { LocalStore } from '../../core/store/store.js';

/**
 * The page that was read, and WHICH store it came from.
 *
 * The store is carried so the page can be discarded during render if the store it was read from is
 * no longer the one in play, rather than by an effect that resets state — an effect whose only job is
 * to derive render-time state is an effect that should not exist.
 */
interface PageFromStore {
  readonly from: LocalStore;
  readonly page: RemovalsPage;
}

export function RemovalsFromStore({ children }: { children: ReactNode }) {
  const opening = useLocalStore();
  const store = opening.state === 'open' ? opening.store : null;
  // Read for nothing but this: it changes when a removal has COMMITTED here, and a changed
  // dependency is a fresh read. It never reaches the reading below — see the header.
  const { recorded } = useLocalRemovals();
  const [read, setRead] = useState<PageFromStore | null>(null);

  useEffect(() => {
    if (store === null) return undefined;
    return readPendingRemovals(store, (page) => setRead({ from: store, page }));
  }, [store, recorded]);

  const reading = useMemo<RemovalsReading>(
    () =>
      read !== null && read.from === store ? { pending: read.page } : NOTHING_AWAITING_REMOVAL,
    [read, store],
  );

  return <RemovalsProvider reading={reading}>{children}</RemovalsProvider>;
}
