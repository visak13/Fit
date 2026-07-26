/**
 * THE LOCAL STORE, MADE AVAILABLE TO THE SCREENS — and the notice for when there is not one.
 *
 * This is the DRAWING half. Every judgement — which refusal this is, what it says, how the three
 * states are ordered — lives in `local-store.ts` beside it, where it is asserted with no rendering
 * at all. The same split as `screens/removals.ts` and `screens/RemovalsScreen.tsx`.
 *
 * ## THIS IS THE SOURCE, NOT A SIXTH SEAM
 *
 * `shell/seams.test.ts` holds the five reporting seams to one shape and asserts that there are
 * exactly five of them, so it is worth saying plainly what this is and is not. The five carry a
 * READING: a frozen page of facts, nothing callable, pushed in from above. This carries the STORE —
 * a live resource with methods on it, which is precisely the thing a reading may never be. It is
 * what the five seams are FED FROM, one layer below them, and adding it to that list would relax the
 * property that list exists to hold.
 *
 * What it does copy, deliberately, is the part that matters:
 *
 *   - the value is a PLAIN value, not a hook that fetches;
 *   - the provider is REQUIRED, and {@link useLocalStore} THROWS outside it rather than defaulting,
 *     because the state a default would invent — "still opening" forever, or worse, "open" — is the
 *     one that makes an unwired screen look like a working one;
 *   - a screen never starts work of its own: it reads the state it is given and says what is true.
 *
 * ## THE OPENING HAPPENS IN AN EFFECT, AFTER MOUNT, AND NEVER AT MODULE SCOPE
 *
 * `main.tsx` mounts the interface first and asks the platform its questions afterwards, so that a
 * browser which is slow or unwilling to answer cannot produce a blank screen. The store is the
 * largest of those questions and is asked the same way. Opening at module scope would also make
 * every module that imports this one unimportable by the interface suite, which renders outside a
 * browser.
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { Glyph } from '../design/Glyph';
import { LIBRARY_NOT_YET, seedingAfterOpening } from './library-seeding';
import type { LibraryCondition, LibrarySeeding } from './library-seeding';
import {
  NO_REMOVAL_RECORDED_YET, STILL_OPENING, STILL_OPENING_WORDS, beginOpening, oneMoreRemoval,
} from './local-store';
import type { LocalRemovals, LocalStoreOpening } from './local-store';
import type { LocalStore } from '../../core/store/store.js';

export type { LocalRemovals, LocalStoreCondition, LocalStoreOpening } from './local-store';
export type { LibraryCondition, LibrarySeeding } from './library-seeding';

const LocalStoreContext = createContext<LocalStoreOpening | null>(null);

/**
 * The removal count, on the SAME provider as the store rather than on one of its own.
 *
 * Two contexts, one component, on purpose. Anything already inside `LocalStoreProvider` is inside
 * the source, and the source is what both the register and the pending-removal seam read — so a
 * screen or a test that is wired for one is wired for the other by construction. A second provider
 * would be a second thing to remember to wrap, and the surface that would render without it is the
 * one that then reports "nothing is waiting" for ever.
 */
const LocalRemovalsContext = createContext<LocalRemovals | null>(null);

/**
 * Whether the shipped library reached this device, on the SAME provider for the same reason the
 * removal count is: this is the SOURCE, and the library answer is produced by the opening it owns.
 *
 * It is NOT a sixth seam. The five carry a frozen READING pushed down from above; this is a fact
 * about the resource this provider already holds, and it arrives with it. `shell/seams.test.ts` is
 * untouched and the five-seam property is unchanged.
 */
const LibrarySeedingContext = createContext<LibrarySeeding | null>(null);

export function LocalStoreProvider({
  opening,
  // WHY THIS IS OPTIONAL WHERE `opening` IS REQUIRED. A provider given no library answer publishes
  // `not-yet` — the honest pre-answer state, and pointedly not `ready`. It is optional because a
  // test that renders a screen against a store it built itself is not exercising the seeding at all,
  // and making every such call site pass a value it has no opinion about would be noise that hides
  // the call sites which DO have one.
  library = LIBRARY_NOT_YET,
  children,
}: {
  opening: LocalStoreOpening;
  library?: LibrarySeeding;
  children: ReactNode;
}) {
  // The count of removals committed here in this sitting. It lives on the provider because the
  // provider is the SOURCE: the register writes it and the pending-removal seam reads it, and
  // neither of them may hold it, since a fact held by one consumer is a fact the other cannot see.
  const [recorded, setRecorded] = useState(NO_REMOVAL_RECORDED_YET);

  const removals = useMemo<LocalRemovals>(
    () => ({ recorded, removalRecorded: () => setRecorded(oneMoreRemoval) }),
    [recorded],
  );

  return (
    <LocalStoreContext.Provider value={opening}>
      <LibrarySeedingContext.Provider value={library}>
        <LocalRemovalsContext.Provider value={removals}>{children}</LocalRemovalsContext.Provider>
      </LibrarySeedingContext.Provider>
    </LocalStoreContext.Provider>
  );
}

/**
 * What is true about the local store, from any screen inside the provider.
 *
 * @throws Error when used outside the provider. A missing source must be loud: a screen that
 * silently believed the store was open would read nothing and report it as nothing to report.
 */
export function useLocalStore(): LocalStoreOpening {
  const opening = useContext(LocalStoreContext);
  if (opening === null) {
    throw new Error('useLocalStore was used outside LocalStoreProvider: the local store is not wired');
  }
  return opening;
}

/**
 * The removals this device has recorded in this sitting, and the one way to say there is another.
 *
 * @throws Error when used outside the provider, for the same reason {@link useLocalStore} does and
 * with more at stake: a default would silently never change, so the surface that depends on it would
 * never read again and would go on reporting that nothing is waiting to be confirmed gone. That is
 * the exact fault this signal exists to correct, so a missing source may not quietly reintroduce it.
 */
export function useLocalRemovals(): LocalRemovals {
  const removals = useContext(LocalRemovalsContext);
  if (removals === null) {
    throw new Error(
      'useLocalRemovals was used outside LocalStoreProvider: the local store is not wired',
    );
  }
  return removals;
}

/**
 * Whether the shipped library reached this device, from any screen inside the provider.
 *
 * @throws Error when used outside the provider, for the same reason {@link useLocalStore} does: a
 * screen that silently believed the library was fine would show "there are no routines in your
 * library" over a device where the seeding had failed, which is the reassuring half of the truth.
 */
export function useLibrarySeeding(): LibrarySeeding {
  const seeding = useContext(LibrarySeedingContext);
  if (seeding === null) {
    throw new Error(
      'useLibrarySeeding was used outside LocalStoreProvider: the local store is not wired',
    );
  }
  return seeding;
}

/**
 * Opens the local store once, seeds the shipped library into it if this device has never been
 * seeded, and provides whatever state each of those is in.
 *
 * `open` is injected rather than reached for, so this component is the same component in the
 * application and in a test: `main.tsx` passes the real opening, and a test passes a refusal or a
 * store built on the core's own platform double.
 *
 * THE SEEDING IS WRAPPED AROUND `open` RATHER THAN RUN BESIDE IT, and `platform/library-seeding.ts`
 * holds the whole argument for why — in one line: a screen that is told the store is open starts
 * reading content immediately, so the library question has to be settled before that is said. The
 * store is handed on whether the seeding worked or not; a seeding fault is a separate value with its
 * own words, never a store that failed to open.
 *
 * The effect closes the store on the way out, in the scope that opened it. `open` must be a stable
 * reference — a module-level function — or the store is reopened on every render; that is a
 * property of the dependency array and is stated here rather than left to be discovered.
 */
export function OpeningLocalStore({
  open,
  children,
}: {
  open: () => Promise<LocalStore>;
  children: ReactNode;
}) {
  const [opening, setOpening] = useState<LocalStoreOpening>(STILL_OPENING);
  const [library, setLibrary] = useState<LibrarySeeding>(LIBRARY_NOT_YET);

  // Memoised on `open` alone: `setLibrary` is stable, so the wrapped opening is as stable as the
  // opening it wraps, and the store is still opened once rather than on every render.
  const openAndSeed = useMemo(() => seedingAfterOpening(open, setLibrary), [open]);

  useEffect(() => beginOpening(openAndSeed, setOpening), [openAndSeed]);

  return (
    <LocalStoreProvider opening={opening} library={library}>
      {children}
    </LocalStoreProvider>
  );
}

/**
 * What a surface says when it needs the store and there is not one yet.
 *
 * It renders NOTHING when the store is open, so a screen can place it above its own body without
 * asking twice. The refusal is a plain note rather than a warning band for the same reason the
 * removals screen's standing sentence is: this is information, and it is already the loudest thing
 * on a screen that has nothing else to show.
 */
export function LocalStoreNotice({ opening }: { opening: LocalStoreOpening }) {
  if (opening.state === 'open') return null;

  if (opening.state === 'opening') {
    return (
      <p className="note read">
        <Glyph name="sync-pending" size="inline" decorative />
        <span>{STILL_OPENING_WORDS}</span>
      </p>
    );
  }

  const { condition } = opening;

  return <ConditionNotice condition={condition} />;
}

/**
 * What a surface says when the shipped library could not be put on this device.
 *
 * It renders NOTHING unless there is something wrong, so a screen can place it above its own body
 * without asking twice — and it says nothing at all while the store is still opening, because the
 * store's own notice is already saying that and two notices about one condition read as two faults.
 */
export function LibraryNotice({ condition }: { condition: LibraryCondition | null }) {
  if (condition === null) return null;
  return <ConditionNotice condition={condition} />;
}

/**
 * A condition, drawn. ONE drawing for the store's refusals and the library's, because they are the
 * same four sentences said about different things and a second layout would be a second thing to
 * keep true — the headline is what tells him which of them he is reading.
 */
function ConditionNotice({
  condition,
}: {
  condition: { headline: string; whatHappened: string; whatToDo: string; verbatim: string | null };
}) {
  return (
    <section className="card-body stack" aria-live="polite">
      <p className="note read">
        <Glyph name="sync-failed" size="inline" decorative />
        <span>{condition.headline}</span>
      </p>
      <p className="read">{condition.whatHappened}</p>
      <p className="read">{condition.whatToDo}</p>
      {/* The browser's own words, kept verbatim: he may have to read them out, and a reworded
          version is not what was said. Never the headline, and never the only thing shown. */}
      {condition.verbatim !== null && (
        <blockquote className="note read">
          <span>{condition.verbatim}</span>
        </blockquote>
      )}
    </section>
  );
}
