/**
 * THE LINE THAT TELLS THE COACH A NEWER VERSION IS READY, AND THE ONE CONTROL THAT TAKES IT.
 *
 * This file DRAWS. Every judgement — the words, whether they are said at all, and what counts as a
 * session in progress — is in `new-version.ts` beside it, where it is asserted with no browser and no
 * rendering. The same split as `sync-indicator.ts` against `SyncStatus.tsx`.
 *
 * ## WHERE IT IS, AND WHY IT IS IN THE FRAME RATHER THAN ON A SCREEN
 *
 * In the content header, beside the application's name, on every address. A newer version is a fact
 * about the whole application rather than about wherever he happens to be standing, and a coach who
 * had to visit Admin to find out a fix had landed would find out by accident or not at all.
 *
 * IT IS NEVER A MODAL AND NEVER COVERS ANYTHING. It is a line and a button in the ordinary flow of the
 * header. `d39` is the rule and it is unconditional: nothing may stand between him and running a
 * session. A dialogue demanding an answer before he can carry on would be exactly that, and the
 * session guard below is the second half of the same promise.
 *
 * ## THE SEAM DOES NOT THROW WHEN IT IS MISSING, WHICH IS THE OPPOSITE OF THE FIVE REPORTING SEAMS
 *
 * Every seam hook in this application throws outside its provider, and rightly: their empty readings
 * are WORDED AS FACTS — "There is nothing here yet", "Nothing needs your decision" — so a default
 * invents reassuring news about his data that nobody measured.
 *
 * THE DISCRIMINATOR IS WHETHER THE EMPTY STATE MAKES A CLAIM, and this one does not. An absent
 * "a newer version is ready" line asserts nothing at all: its absence is indistinguishable from the
 * ordinary case of being up to date, which is what is true almost every time he opens the application.
 * So the honest rendering of "nothing supplied this" is NO LINE, and it is the same argument
 * `sync-actions.tsx` makes for its control.
 *
 * THAT TRADE HAS A PRICE AND THE PRICE IS PAID DIRECTLY. Unwired-renders-nothing is precisely the
 * shape where a feature nobody wired passes every test in silence — this build's whole recurring
 * family. So `new-version-notice.test.ts` renders the real frame with the real provider AND reads the
 * composition root to prove the wiring is really there, and that check is break-probed by unwiring it.
 */

import { useLocation } from 'react-router-dom';
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import { newVersionLine, runningASession } from './new-version.ts';
import type { NewVersionReading } from './new-version.ts';

/** The reading, and the one thing he can do about it. */
export interface NewVersionSeam {
  readonly reading: NewVersionReading;
  /**
   * Take the newer version.
   *
   * A RELOAD AND NOTHING ELSE, supplied by the composition root rather than reached for here. The new
   * worker has already claimed the page by the time he is told, so the next document load comes out of
   * the new build's cache; there is no message to post and no worker to instruct. Injecting it is what
   * lets this component be the same component in the application and in a test.
   */
  readonly take: () => void;
}

const NewVersionContext = createContext<NewVersionSeam | null>(null);

/** The seam, supplied by whatever is watching the worker. `App.tsx` is the one caller. */
export function NewVersionProvider({
  reading,
  take,
  children,
}: {
  reading: NewVersionReading;
  take: () => void;
  children: ReactNode;
}) {
  return <NewVersionContext.Provider value={{ reading, take }}>{children}</NewVersionContext.Provider>;
}

/** The seam, or null when nothing has supplied it. See the header for why this does not throw. */
export function useNewVersionIfWired(): NewVersionSeam | null {
  return useContext(NewVersionContext);
}

/**
 * THE LINE. Nothing when nothing is waiting, and nothing while he is running a session.
 *
 * The address is read here rather than passed in because the router is what knows it, and it is
 * handed straight to `runningASession` without being interpreted on the way — the decision is one
 * function, in one place, tested without a browser.
 */
export function NewVersionNotice() {
  const seam = useNewVersionIfWired();
  const location = useLocation();

  if (seam === null) return null;

  const line = newVersionLine(seam.reading, {
    runningASession: runningASession(location.pathname, location.search),
  });
  if (line === null) return null;

  return (
    <p className="new-version" role="status">
      <span className="read">{line.sentence}</span>
      <button type="button" className="btn btn-sm" onClick={seam.take}>
        {line.control}
      </button>
    </p>
  );
}
