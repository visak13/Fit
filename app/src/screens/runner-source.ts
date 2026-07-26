/**
 * WHERE THE RUNNER'S FACTS COME FROM — opening the session, reading it back, and leaving it.
 *
 * Extracted from the component for the reason every source module in this application is: a static
 * render never runs an effect, so logic living inside one is logic nothing can check. Every function
 * here takes a store, so the suite drives it against a REAL store on the core's own platform double
 * — the same in-memory database, lock manager and message bus the whole build is verified on. The
 * property this file exists for is a LEASE, and a lease is not a thing a mock can be wrong about
 * quietly.
 *
 * ## THE LEASE IS RECEIVED, NOT RETAKEN
 *
 * The calendar opens a session and hands the live handle over — `screens/session-handover.ts` holds
 * it, and `screens/launcher-source.ts` hands over on BOTH doors, starting and picking up. So the
 * ordinary path through this file takes NO lease at all: it finds the handle this window is already
 * holding and uses it. Calling `openSession` again over a session the launcher still held would take
 * a SECOND lease and reintroduce the two-windows-one-session failure the lease exists to prevent.
 *
 * {@link openTheSession} opens for itself in exactly one case: nothing is held for that session in
 * this window. That is a COLD arrival — a refreshed page, a bookmark, the laptop woken up — where
 * there is no lease to receive because the document that held one is gone. It is not a retake.
 *
 * ## WHY OPENING IS SERIALISED
 *
 * Two opens of the same session in flight at once would race for one lease and the loser would be
 * told the session is open in the coach's other window — about a window he is looking at. This is
 * not hypothetical: React's development double-mount runs an effect, cleans up, and runs it again.
 * So an open in flight is remembered and a second caller AWAITS it rather than starting another.
 *
 * ## AND WHY LEAVING IS DEFERRED BY A TICK
 *
 * Leaving is `detach()`, and it must happen when the coach navigates away. A React cleanup runs on
 * unmount AND between two runs of the same effect, and the second is not the coach going anywhere.
 * So the release is scheduled and the next open cancels it: a re-run keeps the session, and a real
 * departure releases it a tick later. `SESSION.md` §7 — `detach()` says nothing about the session's
 * state, leaving it exactly where a power cut would have. LEAVING IS NOT ENDING: `interrupt()`,
 * `complete()` and `abandon()` are the three endings, they are different acts, and none of them is
 * what the back button means.
 */

import { openSession } from '../../core/session/live-session.js';
import { handOver, heldSession, releaseHeldSession } from './session-handover';
import type { ExerciseDefaults } from './effective-prescription';
import type { LocalStore } from '../../core/store/store.js';

/** A live session, as much of it as this file touches. The core owns the rest. */
interface LiveSessionHandle {
  routine: unknown;
  refresh: () => Promise<SessionView>;
  current: () => Promise<SessionView>;
}

/** The projection, as much of its shape as this file passes along. */
export interface SessionView {
  readonly session_id: string;
  readonly routine_id: string;
  readonly client_ids: readonly string[];
  readonly clients: readonly {
    readonly plan: readonly {
      readonly exercise_id: string;
      /** What was actually done against this line, which is NOT the line's own exercise once
       * something has been recorded in its place. See {@link readExerciseNames}. */
      readonly attempts: readonly { readonly exercise_id: string }[];
    }[];
    readonly beyond_the_routine: readonly string[];
  }[];
  readonly [key: string]: unknown;
}

/** What opening a session produced: the core's own answer, and the view when there is one. */
export interface SessionReading {
  readonly outcome: { ok: boolean; reason?: string; message?: string; session_id?: string };
  readonly view: SessionView | null;
  /** The routine's name, or null when it is no longer in the library. */
  readonly routineName: string | null;
  readonly clientNames: ReadonlyMap<string, string>;
  readonly exerciseNames: ReadonlyMap<string, string>;
  /**
   * Each exercise's own library record by content key, which is where the numbers a line does NOT
   * override are inherited from. Empty for an exercise the coach has since deleted — see
   * {@link readExerciseLibrary}.
   */
  readonly exerciseDefaults: ReadonlyMap<string, ExerciseDefaults>;
}

/** Opens in flight, so two callers asking for one session do not race for its one lease. */
const opening = new Map<string, Promise<SessionReading>>();

/** Releases scheduled but not yet made, so an effect that re-runs keeps the session it just opened. */
const leaving = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Open a session — by receiving the handle this window already holds, or by opening it cold.
 *
 * The refusals come back as VALUES with the core's own sentence on them, exactly as `openSession`
 * wrote them: not on this device, already finished, open in your other window. Nothing here rewords
 * one and nothing here throws on one.
 */
export async function openTheSession(
  store: LocalStore,
  sessionId: string,
): Promise<SessionReading> {
  const key = keyOf(store, sessionId);
  const already = opening.get(key);
  if (already !== undefined) return already;

  const attempt = openOnce(store, sessionId).finally(() => {
    opening.delete(key);
  });
  opening.set(key, attempt);
  return attempt;
}

/**
 * Open the session, publish what came back, and hand back the way to leave it.
 *
 * The same shape as the launcher's reads — a call that publishes and returns a cancel — because it
 * is used the same way, from an effect. A reading that arrives after the caller has gone is dropped
 * rather than published.
 *
 * The returned function is LEAVING: it stops listening and schedules the release. See the header for
 * why a tick.
 *
 * @returns leave
 */
export function openSessionInto(
  store: LocalStore,
  sessionId: string,
  publish: (reading: SessionReading) => void,
): () => void {
  let live = true;
  keepTheSession(store, sessionId);

  void openTheSession(store, sessionId).then(
    (reading) => {
      if (live) publish(reading);
    },
    (error: unknown) => {
      console.error('[session] the session could not be opened from the local store', error);
    },
  );

  return () => {
    live = false;
    leaveTheSessionSoon(store, sessionId);
  };
}

/**
 * Leave the session now: release the lease, say nothing about the session's state.
 *
 * Exposed for a caller that knows the coach has finished with the screen. Nothing here ends a
 * session — see the header.
 */
export async function leaveTheSession(store: LocalStore, sessionId: string): Promise<void> {
  keepTheSession(store, sessionId);
  // A release must never overtake an open that has not finished: the handle to release is the one
  // that open is about to hold.
  await opening.get(keyOf(store, sessionId))?.catch(() => undefined);
  await releaseHeldSession(store, sessionId);
}

/** Schedule leaving, so an effect that re-runs immediately can cancel it. */
export function leaveTheSessionSoon(store: LocalStore, sessionId: string): void {
  const key = keyOf(store, sessionId);
  if (leaving.has(key)) return;
  leaving.set(key, setTimeout(() => {
    leaving.delete(key);
    void leaveTheSession(store, sessionId);
  }, 0));
}

/** Cancel a scheduled leaving. The coach did not go anywhere. */
export function keepTheSession(store: LocalStore, sessionId: string): void {
  const key = keyOf(store, sessionId);
  const scheduled = leaving.get(key);
  if (scheduled === undefined) return;
  clearTimeout(scheduled);
  leaving.delete(key);
}

// ── internals ───────────────────────────────────────────────────────────────────────────────────

async function openOnce(store: LocalStore, sessionId: string): Promise<SessionReading> {
  const routine = await routineForSession(store, sessionId);

  // THE ORDINARY PATH TAKES NO LEASE. It receives the one the calendar is holding — for a session
  // just started and for one just picked up, which are the same operation and both hand over.
  let live = heldSession(store, sessionId) as LiveSessionHandle | null;
  let outcome: SessionReading['outcome'] = { ok: true, session_id: sessionId };

  if (live === null) {
    // A COLD ARRIVAL: a refresh, a bookmark, a laptop woken up. There is no lease to receive because
    // the document that held one is gone, so this is an open and not a retake. Opened ONCE — a
    // refusal is reported from this same answer rather than by asking again.
    const opened = await openSession(store, sessionId, { routine });
    handOver(store, opened);
    outcome = {
      ok: opened.ok, reason: opened.reason, message: opened.message, session_id: sessionId,
    };
    live = opened.ok ? ((opened.session ?? null) as LiveSessionHandle | null) : null;
  }

  if (live === null) {
    return {
      outcome,
      view: null,
      routineName: nameOf(routine),
      clientNames: new Map(),
      exerciseNames: new Map(),
      exerciseDefaults: new Map(),
    };
  }

  // A handle handed over WITHOUT the routine would project a view with no lines in it, and the
  // screen would then say the routine is no longer in the library — a false claim about a routine
  // sitting right there. This fills the gap rather than adding a second source of truth: the handle
  // still owns the projection, and it re-derives it.
  let view = await live.current();
  if (live.routine === null && routine !== null) {
    live.routine = routine;
    view = await live.refresh();
  }

  const library = await readExerciseLibrary(store, view);

  return {
    outcome,
    view,
    routineName: nameOf(routine),
    clientNames: await readClientNames(store, view.client_ids),
    exerciseNames: library.names,
    exerciseDefaults: library.defaults,
  };
}

/**
 * The routine a session was run from, read without opening anything.
 *
 * A plain keyed read that takes no lease, so it is safe against a session another window is running.
 * Null when the coach has since deleted the routine — the session's own history is not erased by
 * that, and `projection.js` describes everything that happened without it.
 */
async function routineForSession(store: LocalStore, sessionId: string): Promise<unknown> {
  const stored = await store.get('session', sessionId);
  const key = (stored as { content?: { routine_id?: string } } | null)?.content?.routine_id;
  if (typeof key !== 'string' || key.length === 0) return null;
  return (await store.getByContentKey('routine', key)) ?? null;
}

function nameOf(routine: unknown): string | null {
  const name = (routine as { content?: { name?: string } } | null)?.content?.name;
  return typeof name === 'string' && name.length > 0 ? name : null;
}

/**
 * The attending clients' names, one keyed read each.
 *
 * The cost is the number of people in the room and not the size of the practice — the same shape
 * `launcher-source.ts` uses for the glances, and for the same reason.
 */
async function readClientNames(
  store: LocalStore,
  clientIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const named = new Map<string, string>();
  await Promise.all(clientIds.map(async (clientId) => {
    const record = await store.get('client', clientId);
    const name = (record as { content?: { name?: string } } | null)?.content?.name;
    if (typeof name === 'string' && name.length > 0) named.set(clientId, name);
  }));
  return named;
}

/**
 * THE NAMES OF THE EXERCISES THIS SESSION MENTIONS.
 *
 * A session references library content by CONTENT KEY, which it keeps whether the exercise was
 * shipped or the coach wrote it himself. Rendered straight, the screen would tell him he is on
 * `look-bench-press` — a machine's word for something he named — on the screen he is reading with a
 * client in front of him.
 *
 * A KEYED LOOKUP PER EXERCISE, never a walk of the library: the cost is the size of one session and
 * not the size of a library he has been building for five years.
 *
 * ## THE ATTEMPTS ARE READ TOO, AND LEAVING THEM OUT WAS A MEASURED DEFECT
 *
 * Found by walking a real session in a browser (s6/a4). A SUBSTITUTE's key appears in
 * `plan[].attempts[].exercise_id` and in NEITHER `plan[].exercise_id` nor `beyond_the_routine` — the
 * projection deliberately attaches it to the line it replaced. So a substitution rendered as
 * "Recorded with something else in its place: kettlebell-swing": a machine's word for something the
 * coach named, on the screen he reads with a client in front of him. Nothing failed; the name simply
 * was not asked for. It is asked for here because this function's job is the names of the exercises
 * this session MENTIONS, and a substitute is one of them.
 */
export async function readExerciseNames(
  store: LocalStore,
  view: SessionView,
): Promise<ReadonlyMap<string, string>> {
  return (await readExerciseLibrary(store, view)).names;
}

/**
 * THE EXERCISE RECORDS THIS SESSION MENTIONS, READ ONCE FOR BOTH THINGS THE SCREEN NEEDS OF THEM.
 *
 * The names, as above, AND the defaults every line inherits where its routine entry overrides
 * nothing. `core/model/entities/routine.js`: the four optional entry fields are OVERRIDES and
 * omitting one inherits the exercise's own default, so a line's numbers are not readable from the
 * session at all — the exercise record is the other half of them, and
 * `screens/effective-prescription.ts` is where the two halves are put together.
 *
 * ONE KEYED READ FOR BOTH. Asking for the names and then asking again for the defaults would be two
 * passes over the same records, and — worse than the cost — two moments at which one of them could
 * be present and the other missing, on a screen where a name with no numbers beside it is exactly
 * the state this was built to end.
 */
export async function readExerciseLibrary(
  store: LocalStore,
  view: SessionView,
): Promise<{
  readonly names: ReadonlyMap<string, string>;
  readonly defaults: ReadonlyMap<string, ExerciseDefaults>;
}> {
  const wanted = new Set<string>();
  for (const client of view.clients) {
    for (const line of client.plan) {
      wanted.add(line.exercise_id);
      for (const attempt of line.attempts ?? []) wanted.add(attempt.exercise_id);
    }
    for (const key of client.beyond_the_routine) wanted.add(key);
  }

  const names = new Map<string, string>();
  const defaults = new Map<string, ExerciseDefaults>();
  await Promise.all([...wanted].map(async (key) => {
    // An exercise he has since deleted has no record, and the key is then shown as it stands. That
    // is honest: the session really did reference it. It has no defaults to inherit either, and the
    // resolution then shows the routine's own numbers alone rather than inventing any.
    const record = await store.getByContentKey('exercise', key);
    const content = (record as { content?: Record<string, unknown> } | null)?.content;
    const name = content?.name;
    if (typeof name === 'string' && name.length > 0) names.set(key, name);
    if (content !== undefined) defaults.set(key, content as ExerciseDefaults);
  }));

  return { names, defaults };
}

/** One session on one store. A handle belongs to the store it was opened on. */
function keyOf(store: LocalStore, sessionId: string): string {
  return `${storeKeys.get(store) ?? register(store)}:${sessionId}`;
}

/**
 * A stable identifier per store instance, so two stores over one database never share an entry in
 * the maps above. A `WeakMap` rather than a field on the store: this module does not own that object
 * and must not write to it.
 */
const storeKeys = new WeakMap<LocalStore, string>();
let registered = 0;

function register(store: LocalStore): string {
  registered += 1;
  const key = `store-${registered}`;
  storeKeys.set(store, key);
  return key;
}
