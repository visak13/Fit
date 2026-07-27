/**
 * THE LEASE HANDOVER — how a live session passes from the screen that opened it to the screen that
 * runs it, without ever being dropped and retaken.
 *
 * ## What this replaces, and why the thing it replaces was right at the time
 *
 * `launcher-source.ts` used to RELEASE the handle the instant a session opened, through a function
 * called `letGo`. That was correct while the runner did not exist: a handle held by a screen that
 * cannot run a session holds the store's lease on it, which locks the coach out of that session from
 * every window including the one that will eventually be able to run it. Its own header named this
 * file's job in as many words — "this function stops detaching and hands the live handle to the
 * runner".
 *
 * It became wrong the moment a runner existed, and the failure it becomes is precise.
 * `core/session/SESSION.md` §7: opening a session TAKES the store's lease on it, and a
 * session-scoped write with no lease on a live session is refused by the store INSIDE the same
 * transaction that would have written it. So a runner handed an outcome with the handle stripped out
 * is a runner that is refused at its first write, in front of a waiting client. And a runner that
 * answered that by calling `openSession` itself, on a session the launcher was still holding, would
 * take a SECOND lease — reintroducing the two-windows-one-session failure the lease exists to
 * prevent. The lease PASSES. It is never dropped and retaken.
 *
 * ## Why the handle is held at WINDOW scope rather than in React state
 *
 * The lease is a property of the WINDOW — `letGo`'s own note said so, and the platform releases it
 * when the page dies. The two screens either side of the handover are two ROUTES: the calendar
 * unmounts as the runner mounts, so neither can hold the thing being passed between them. A module
 * holder is the same scope as the lease itself, and it goes when the document goes.
 *
 * The cost of a singleton is a stranded lease, so the two rules that make one impossible are written
 * into it rather than left to callers:
 *
 *   - **At most one.** Handing over a DIFFERENT session releases the one held before it, because a
 *     window runs one session at a time and an unclaimed handle from a previous attempt is exactly a
 *     stranded lease.
 *   - **Claiming does not consume.** {@link heldSession} may be asked as often as anybody likes and
 *     answers the same. A consuming read would have failed under React's development double-mount:
 *     the second mount would find nothing, call `openSession`, and be refused `held_elsewhere` — by
 *     its own handle, in its own window.
 *
 * The store is held beside the handle and checked on the way out. A handle belongs to the store it
 * was opened on; if that store has been replaced, the handle is not the answer to a question about
 * the new one.
 */

import type { LocalStore } from '../../core/store/store.js';

/**
 * A live session, as much of it as this module needs to know.
 *
 * Deliberately structural rather than the class: this module passes the handle along and releases
 * it, and nothing here records anything into a session. `core/session/live-session.js` owns the rest.
 */
export interface LiveHandle {
  readonly sessionId: string;
  /**
   * True once the handle has let the session go — by leaving it, or by one of the three ENDINGS.
   *
   * Checked on the way out rather than only on the way in, because a session can stop being live
   * without this module being told: `complete()`, `interrupt()` and `abandon()` are called on the
   * handle itself, by whoever is running the session. A closed handle answered as "the session you
   * are running" would put a finished session on screen as a live one.
   */
  readonly closed?: boolean;
  detach: () => Promise<unknown>;
  /**
   * Write the joining link onto the session this handle is holding.
   *
   * Declared here because the LEASE is what makes the write possible and this handle is what holds
   * it. A link that is MINTED cannot travel with the session's creation — the identifier that makes
   * a retry idempotent is derived from the session's own id, which does not exist until the session
   * does — so it arrives second, onto a record already open in this window.
   *
   * Optional so that a test double standing in for a live session is not obliged to grow a method it
   * has no use for. `core/session/live-session.js` owns what it actually does.
   */
  recordJoiningLink?: (url: string, source: string) => Promise<unknown>;
}

/** What opening a session returns, with the handle still on it. */
export interface OpenedSession {
  readonly ok: boolean;
  readonly reason?: string;
  readonly message?: string;
  readonly session_id?: string;
  readonly session?: LiveHandle;
}

/** What a caller is given back: everything the core said, and no handle to accidentally hold. */
export interface HandedOver {
  readonly ok: boolean;
  readonly reason?: string;
  readonly message?: string;
  readonly session_id?: string;
}

/** The one session this window is running, or nothing. */
interface Held {
  readonly store: LocalStore;
  readonly sessionId: string;
  readonly session: LiveHandle;
}

let held: Held | null = null;

/**
 * Take ownership of a live session on behalf of the runner, and give the caller back what the core
 * said about opening it.
 *
 * The returned value is the same shape `letGo` returned — ok, reason, message, session_id — so the
 * launcher's wording is untouched. What changed is what happens to the handle: it is KEPT, for the
 * runner to pick up at {@link heldSession}, instead of being detached.
 *
 * A refusal carries no handle and nothing is held; the outcome passes straight through.
 */
export function handOver(store: LocalStore, outcome: OpenedSession): HandedOver {
  const live = outcome.session;
  if (outcome.ok && live !== undefined) {
    const sessionId = outcome.session_id ?? live.sessionId;
    // A different session, or a different store, means whatever was held before this is now
    // unreachable — and an unreachable handle is a lease nobody can release. Let it go first.
    releaseUnless(store, sessionId);
    held = { store, sessionId, session: live };
  }

  return {
    ok: outcome.ok,
    reason: outcome.reason,
    message: outcome.message,
    session_id: outcome.session_id,
  };
}

/**
 * The live session this window is running, if it is the one being asked about.
 *
 * Does NOT consume: asking twice answers twice. See the header for the double-mount this protects.
 */
export function heldSession(store: LocalStore, sessionId: string): LiveHandle | null {
  if (held === null || held.store !== store || held.sessionId !== sessionId) return null;
  return held.session.closed === true ? null : held.session;
}

/**
 * Which session this window is running, if any.
 *
 * The runner asks this when it was reached without a session named in the address — "the session you
 * are running" is a real question a window can answer about itself.
 */
export function heldSessionId(store: LocalStore): string | null {
  if (held === null || held.store !== store || held.session.closed === true) return null;
  return held.sessionId;
}

/**
 * LEAVING. Releases the lease and says NOTHING about the session's state.
 *
 * This is `detach()` and it is deliberately not one of the three endings. `interrupt()`,
 * `complete()` and `abandon()` each say something about how the session finished; a screen that
 * ended a session because the coach tapped back would have destroyed the thing the lease was
 * protecting. Leaving puts the session exactly where a power cut would have left it, which is
 * `in_progress` and resumable, and that is what the coach means when he navigates away.
 *
 * A failure to release is reported and swallowed for the same reason `letGo` swallowed one: the
 * session itself is intact, the lease is scoped to this window, and it goes when the window does.
 */
export async function releaseHeldSession(store: LocalStore, sessionId: string): Promise<void> {
  const live = heldSession(store, sessionId);
  if (live === null) return;
  held = null;
  try {
    await live.detach();
  } catch (error: unknown) {
    console.error('[session] the session was left but its handle would not be released', error);
  }
}

/** Release whatever is held unless it is already exactly this session on this store. */
function releaseUnless(store: LocalStore, sessionId: string): void {
  if (held === null) return;
  if (held.store === store && held.sessionId === sessionId) return;
  const previous = held;
  held = null;
  void previous.session.detach().catch((error: unknown) => {
    console.error('[session] a session opened earlier would not release its handle', error);
  });
}
