/**
 * THE JOURNAL SEAM — where the log screen gets its entries and its verification, and the shape of
 * both is the core's own.
 *
 * The same four properties as the removals seam, deliberately and not by coincidence:
 *
 * - The reading is a PLAIN VALUE, not a hook that fetches. A screen cannot start work of its own.
 * - Its fields are the core's own, field for field and name for name. `page` holds what
 *   `readJournalPage` read — entries, per-device cursors, `done`, the matching total and whether the
 *   device enumeration was complete — and `verification` is what `verifyWholeJournal` returned,
 *   `first_divergence` included, uncollapsed and unreworded.
 * - The provider is REQUIRED. {@link useJournal} throws outside it rather than defaulting, because
 *   the state a default would invent — an empty log that verifies — is the reassuring answer arrived
 *   at by never having looked, and this is the screen that exists to say what actually happened.
 * - What the screen may do with the reading is decided by what the reading contains, and it contains
 *   facts only. `screens/journal.ts` turns them into sentences; nothing here words anything.
 *
 * ## THE EMPTY LITERAL IS NOT A PLACEHOLDER, AND IT IS ALSO NOT REASSURANCE
 *
 * {@link NOTHING_HAS_BEEN_READ} is what a store in that condition genuinely yields: no entries, no
 * devices, nothing checked. `screens/journal.ts` words `device_count: 0` as "this app has not checked
 * its own list yet" rather than as a clean bill of health, which is exactly why the count is carried
 * instead of a bare `ok`. `ok` over no devices is vacuously true, and a surface that read it alone
 * would tell the coach his log was intact on the strength of there being none of it.
 *
 * AND IT IS NOT A FAILED READ EITHER, WHICH IS WHAT IT USED TO HAVE TO STAND IN FOR. This literal
 * carries `status: 'not_yet'`, one of the THREE states `screens/journal-source.ts` publishes. It used
 * to be the whole of what the seam could say when a read went wrong, because a failure published
 * nothing at all and left this value in place — so "this app has not checked its own list yet" was
 * what a coach saw after a read that FAILED. The states are now mutually exclusive at the type level,
 * and a screen cannot reach `page` without saying which of the three it is looking at.
 *
 * ## WHY THE VERIFICATION IS ON THE SEAM RATHER THAN ASKED FOR BY THE SCREEN
 *
 * Verification reads and hashes every entry on every device. A screen that triggered it would decide
 * when it ran, and the two facts the coach reads side by side — what happened, and does it join up —
 * would then have been measured at two different moments over two different reads. They are read
 * together, published together, and refreshed together.
 */

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { JournalLogReading, JournalNotYetRead } from '../screens/journal-source';

export type {
  JournalCursor, JournalDeviceVerification, JournalLogFacts, JournalLogReading, JournalNotYetRead,
  JournalPage, JournalQuery, JournalReadFailed, JournalReadFailure, JournalWasRead,
  WholeJournalVerification,
} from '../screens/journal-source';

/**
 * What is true of a store that has never been written to: no entries, no devices, nothing checked.
 *
 * Not a stand-in for a real reading — it is exactly what the two reads return over a log in that
 * condition. `complete` is true in both places because nothing was left out; `device_count: 0` is
 * what stops `ok` being read as a clean bill of health over an empty log.
 */
export const NOTHING_HAS_BEEN_READ: JournalNotYetRead = Object.freeze({
  status: 'not_yet',
  page: Object.freeze({
    entries: Object.freeze([]) as JournalNotYetRead['page']['entries'],
    cursor: Object.freeze([]) as JournalNotYetRead['page']['cursor'],
    done: true,
    total: 0,
    complete: true,
  }),
  verification: Object.freeze({
    ok: true,
    device_count: 0,
    complete: true,
    devices: Object.freeze([]) as JournalNotYetRead['verification']['devices'],
  }),
});

const JournalContext = createContext<JournalLogReading | null>(null);

export function JournalProvider({
  reading,
  children,
}: {
  reading: JournalLogReading;
  children: ReactNode;
}) {
  return <JournalContext.Provider value={reading}>{children}</JournalContext.Provider>;
}

/**
 * The current reading.
 *
 * @throws Error when used outside the provider. A missing seam must be loud: silently rendering an
 * empty log that verifies would be an unwired screen reporting the one state that looks like good
 * news, on the surface built to make the app's own account of itself checkable.
 */
export function useJournal(): JournalLogReading {
  const reading = useContext(JournalContext);
  if (reading === null) {
    throw new Error('useJournal was used outside JournalProvider: the journal seam is not wired');
  }
  return reading;
}
