/**
 * THE DEVICE'S OWN RECORD, made available to the screens.
 *
 * Three facts about the running installation that the interface has to be able to state plainly:
 * which build this is, whether it will start without a network, and what this device literally
 * answered when asked to persist its storage. They are gathered once at start and handed down
 * rather than re-measured by whichever screen happens to want them.
 */

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { OfflineStartOutcome } from './offline-start';
import type { PersistenceRecord } from './storage-persistence';

export interface PlatformStatus {
  /** The source stamp of the running build; see `build-identity.ts`. */
  readonly buildStamp: string;
  /** The literal answer this device gave to the persistence request. */
  readonly persistence: PersistenceRecord | null;
  /** Whether the offline worker was registered on this start. */
  readonly offlineStart: OfflineStartOutcome;
}

const PlatformStatusContext = createContext<PlatformStatus | null>(null);

export function PlatformStatusProvider({
  status,
  children,
}: {
  status: PlatformStatus;
  children: ReactNode;
}) {
  return <PlatformStatusContext.Provider value={status}>{children}</PlatformStatusContext.Provider>;
}

/**
 * The platform status, from any screen inside the provider.
 *
 * @throws Error when used outside the provider — a screen silently reading nulls would report a
 * device state that was never measured, which is worse than a crash during development.
 */
export function usePlatformStatus(): PlatformStatus {
  const status = useContext(PlatformStatusContext);
  if (status === null) {
    throw new Error('usePlatformStatus was used outside PlatformStatusProvider');
  }
  return status;
}
