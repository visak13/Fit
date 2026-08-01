/**
 * WHERE A SESSION IS ACTUALLY FINISHED — through the core's own verb and the lease this window
 * already holds.
 *
 * Extracted from the component for the reason every source module in this application is: a static
 * render never runs an effect, so logic living inside one is logic nothing can check. This function
 * takes a store, so the suite drives it against a REAL store on the core's own platform double and
 * asserts the ending by READING THE STORED SESSION RECORD BACK rather than by trusting the call.
 *
 * ## ONE VERB, AND IT IS THE CORE'S
 *
 * `LiveSession.complete()` — already built, and until now called by nothing. It writes `status:
 * 'completed'` and `ended_at`, in one store transaction, and releases the lease AFTER the state is
 * written rather than before, so there is no window in which another window could open a session
 * whose status had not yet moved. Nothing here reimplements any part of that, and nothing here writes
 * a status directly.
 *
 * `interrupt()` and `abandon()` ARE NOT IMPORTED HERE, deliberately and not by oversight. They are
 * different statements about what happened and belong to a different control with different words —
 * see `session-ending.ts`. A module that had all three in reach is a module one edit away from
 * filing "abandoned" on a day the coach meant "done".
 *
 * ## THE LEASE IS THE ONE THIS WINDOW ALREADY HOLDS
 *
 * `screens/session-handover.ts` is holding the handle the calendar handed over and `runner-source.ts`
 * received. Nothing here calls `openSession`: doing so over a session this window already held would
 * take a SECOND lease and reintroduce the two-windows-one-session failure the lease exists to
 * prevent, and `#end` needs the lease this handle carries.
 *
 * `modular-control-source.ts` already holds the one place a refusal becomes a value and a read-back is
 * turned into a fresh view, and its own header anticipated the sibling surfaces on this spine writing
 * through it — `session-readings-source.ts` already does. So {@link throughTheHeldSession} is imported
 * rather than copied. A second copy would be a second place a refusal could be swallowed and a second
 * definition of "the act landed but the read-back did not".
 *
 * ## THE READ-BACK AFTER AN ENDING IS A FRESH READ, AND THAT WAS MEASURED RATHER THAN ASSUMED
 *
 * `complete()` closes the handle and releases the lease, so everything the screen shows afterwards
 * comes back through a handle the core considers closed. If `refresh()` answered from a cached view
 * there, every assertion made through it would be about a reading that was never taken — and it would
 * look exactly like a pass.
 *
 * MEASURED: `refresh()` takes no part in `#assertOpen`. It re-reads the session record from the store
 * and re-reads the journal. Driven against a real store, a `session-note` written into the store
 * AFTER completing and THROUGH A DIFFERENT PATH — a plain `store.create` with no lease, which the
 * store permits precisely because the status has left `in_progress` — was picked up by the next
 * `refresh()`, whose replayed count rose with it. `session-ending-source.test.ts` keeps that measured
 * rather than remembered.
 *
 * The acceptance is nevertheless asserted against the STORE DIRECTLY and not through the handle. The
 * question is what is on the record, and reading the record is the answer to it.
 */

import { throughTheHeldSession } from './modular-control-source';
import type { MoveResult } from './modular-control-source';
import type { LocalStore } from '../../core/store/store.js';

/**
 * The live handle, as much of it as this file touches.
 *
 * Structural rather than the class, exactly as every other module on this spine treats it: this one
 * calls ONE of its methods and owns none of it. Naming only `complete` is the point — the other two
 * endings are not in this file's reach.
 */
interface EndableHandle {
  complete: (options?: Record<string, unknown>) => Promise<unknown>;
}

/**
 * FINISH THE SESSION: it went as planned, and there is nothing more to record in it.
 *
 * No check that anything was recorded and no check about where he is in the routine. Both would be
 * this file having an opinion about what counts as a session, and a coach who ran a session where
 * nothing needed writing down still ran it.
 *
 * NOTHING IS PASSED WITH IT. `complete()` accepts a `summary`, and none is sent: a summary the app
 * composed would be the application describing a session it did not watch, and there is no surface
 * for him to write one at this seam. `ended_at` is the core's own timestamp.
 *
 * A refusal comes back as a VALUE with its own sentence on it, exactly as every other move on this
 * spine does — including the case where the ending landed and the read-back did not, which must not
 * be reported as a failure to finish.
 */
export function finishTheSession(store: LocalStore, sessionId: string): Promise<MoveResult> {
  return throughTheHeldSession<EndableHandle>(store, sessionId, 'finish', (live) => live.complete());
}
