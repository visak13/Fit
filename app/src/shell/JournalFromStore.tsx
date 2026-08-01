/**
 * THE JOURNAL SEAM, FILLED FROM THE LOCAL STORE.
 *
 * It replaces the SOURCE and nothing else: `Journal.tsx`, `screens/journal.ts` and the screen are
 * untouched by it, which is what the seam was shaped for. The judgement about what to read, and what
 * may not be done to the result, is in `screens/journal-source.ts`.
 *
 * ## THE REFETCH KEY, AND WHY EACH PART OF IT IS THERE
 *
 * `[store, query, reloads]`, the same three the library's filtered surfaces use.
 *
 * - `store` because a reading belongs to the store it came from, and a page read from a database
 *   that has since been replaced is not this store's log.
 * - `query` because the filter is applied IN MEMORY over pages (the journal store has no index), so
 *   a changed filter is a changed read rather than a re-render of what is already held.
 * - `reloads` because the log grows underneath this screen. Every write in the application appends
 *   an entry, so there is no single writer to observe and no count that would mean anything; a
 *   deliberate re-read is the honest trigger, and the caller owns it.
 *
 * There is deliberately NO interval and NO polling. A timer would re-hash every entry on every
 * device on a schedule nobody asked for, and it would be a second copy of the knowledge the caller
 * already has about when it wants to look again.
 *
 * AND `reloads` IS PASSED INTO THE READ AS WELL AS BEING A DEP. The verification reads and hashes
 * every entry on every device and does not depend on the filter — a filter is applied in memory over
 * pages already read — so `journal-source.ts` holds it per store and reuses it across a changed
 * query, which is what stops a whole-log re-hash happening per keystroke. The count is what
 * distinguishes "the query moved" from "the caller asked to look again", and only the second is a
 * reason to hash the log a second time.
 *
 * ## THE WINDOW WHERE THE SEAM IS STILL THE EMPTY READING, STATED RATHER THAN HIDDEN
 *
 * Between the store opening and the first reading arriving, the seam carries
 * {@link NOTHING_HAS_BEEN_READ}. `screens/journal.ts` words that state as "this app has not checked
 * its own list yet" rather than as a clean bill of health, which is what makes the transient safe to
 * have. The state that LASTS — the store not opening at all — is not left to it: the surface asks
 * `useLocalStore()` directly and says what is wrong, because an empty log read from a store that
 * never opened would be this screen reporting good news on the strength of never having looked.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { useLocalStore } from '../platform/LocalStore';
import { FIRST_JOURNAL_PAGE, readJournal } from '../screens/journal-source';
import type { JournalLogReading, JournalQuery } from '../screens/journal-source';
import { JournalProvider, NOTHING_HAS_BEEN_READ } from './Journal';
import type { LocalStore } from '../../core/store/store.js';

/**
 * The reading that was read, and WHICH store it came from.
 *
 * The store is carried so a reading can be discarded during render when the store it was read from
 * is no longer the one in play, rather than by an effect that resets state — an effect whose only
 * job is to derive render-time state is an effect that should not exist.
 */
interface ReadingFromStore {
  readonly from: LocalStore;
  readonly reading: JournalLogReading;
}

export function JournalFromStore({
  children,
  query = FIRST_JOURNAL_PAGE,
  reloads = 0,
}: {
  children: ReactNode;
  /** What to read. Defaulted to the first page of every device, unfiltered. */
  query?: JournalQuery;
  /** Bumped by the caller to read again. Read for nothing else; it never reaches the reading. */
  reloads?: number;
}) {
  const opening = useLocalStore();
  const store = opening.state === 'open' ? opening.store : null;
  const [read, setRead] = useState<ReadingFromStore | null>(null);

  useEffect(() => {
    if (store === null) return undefined;
    // `reloads` is passed INTO the read, not merely used as a dep: the verification does not depend
    // on the filter and is held per store, and this count is what tells the read that a deliberate
    // re-read has been asked for and the held result is no longer the one to hand back.
    return readJournal(store, query, (reading) => setRead({ from: store, reading }), { reloads });
  }, [store, query, reloads]);

  const reading = useMemo<JournalLogReading>(
    () => (read !== null && read.from === store ? read.reading : NOTHING_HAS_BEEN_READ),
    [read, store],
  );

  return <JournalProvider reading={reading}>{children}</JournalProvider>;
}
