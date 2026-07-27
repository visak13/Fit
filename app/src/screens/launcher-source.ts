/**
 * WHERE THE LAUNCHER'S FACTS COME FROM — every read and every write, extracted from the component.
 *
 * ## THIS SCREEN TAKES THE STORE, AND THE QUESTION WAS ALREADY ANSWERED
 *
 * `screens/client-register-source.ts` settled it for the register, which was the first read-write
 * surface in this application, and its header is the argument in full: the five reporting seams in
 * `main.tsx` each carry a READING — a frozen page of facts pushed down from above with nothing
 * callable on it — and `shell/seams.test.ts` holds all five to that shape. A surface that WRITES
 * cannot be one of them, and bending one to carry a create would weaken the rule for the four
 * surfaces it protects.
 *
 * The launcher is the SECOND such surface, and it does not answer the question a second time. It
 * takes the STORE from `platform/LocalStore.tsx`, which says in as many words that it is the source
 * the five seams are fed from and NOT a sixth one. No seam was added, no seam was bent, and
 * `seams.test.ts` is untouched.
 *
 * ## THE READS AND THE WRITE ARE PLAIN FUNCTIONS, FOR A REASON THAT IS NOT TIDINESS
 *
 * A static render never runs an effect, so logic living inside one is logic nothing can check. Every
 * function here takes a store, so the suite drives it against a REAL store on the core's own platform
 * double — the same in-memory database, lock manager and message bus the whole build is verified on.
 *
 * ## NOTHING HERE DECIDES ANYTHING
 *
 * No validation, no wording, no judgement. `core/model/entities/session.js` is the schema and it is
 * sealed; `screens/launcher.ts` holds every sentence. This file moves records.
 *
 * ## THE HANDLE IS NO LONGER LET GO — IT IS HANDED OVER, AND THIS IS THE STEP THAT SAID IT WOULD BE
 *
 * This file used to RELEASE the store's lease on every session it opened, through a function called
 * `letGo`, and its header said in as many words what would change here: "this function stops
 * detaching and hands the live handle to the runner. Nothing else here moves." That is what happened.
 * Releasing was correct while no screen could run a session — a held lease with no runner locks the
 * coach out of his own session from every window — and it became wrong the moment the runner existed,
 * because a runner handed an outcome with the handle stripped out is refused by the store at its
 * first write, in front of a waiting client.
 *
 * BOTH DOORS HAND OVER, and that is the half a handover forgets. {@link startTheSession} and
 * {@link pickUpTheSession} are the SAME operation as far as the core is concerned — `openSession` is
 * its only door and does the same thing whether a session is seconds old or was disturbed forty
 * minutes in. A handover written for the start path alone would strand every RESUMED session with a
 * runner holding no lease, which is the case a real coach meets after a power cut and the case
 * nobody thinks to try.
 *
 * `screens/session-handover.ts` holds the handle and every rule about holding it. Nothing else here
 * moved.
 */

import { previousSessionAtAGlance } from '../../core/session/glance.js';
import { openSession, startSession } from '../../core/session/live-session.js';
import {
  libraryPage, listClients, sessionsForClient, unfinishedSessions,
} from '../../core/store/store.js';
import type { LocalStore } from '../../core/store/store.js';
import { MINT_REFUSALS } from '../platform/google-meet';
import type { MintOutcome, MintRequest } from '../platform/google-meet';
import type {
  ClientRecord, Glance, OpenOutcome, Page, RoutineRecord, SessionMode, SessionRecord,
} from './launcher';
import { handOver, heldSession } from './session-handover';

/**
 * How many people, routines and sessions are read in one page.
 *
 * The core's own default, named here rather than left implicit, because the screen tells the coach
 * "there are more than these" off the back of it. Client and session volumes are unknown and cannot
 * be clarified — a dozen or two hundred, a month of history or five years — so every list is paged
 * through the core's own cursor and nothing is ever loaded whole in order to count it.
 */
export const LAUNCHER_PAGE_LIMIT = 25;

/**
 * The minting, as much of it as this file uses.
 *
 * Structural rather than the class, so the suite drives this path with a double and no transport at
 * all. `platform/google-meet.ts` owns everything about how a link is actually obtained; this file
 * only knows that asking for one returns an outcome.
 */
export interface MeetMinting {
  mint(request: MintRequest): Promise<MintOutcome>;
}

/**
 * How many unfinished sessions are offered at once.
 *
 * Smaller than a page on purpose. An interruption is normal but not frequent, and a long list of
 * them would read as a pile of problems rather than as somewhere to carry on from. If there are ever
 * more than this the coach has a different problem, and it is not one this screen can solve.
 */
export const UNFINISHED_LIMIT = 5;

/** How many finished sessions are shown per chosen person. Enough to see that they happened. */
export const HISTORY_LIMIT = 5;

/** Everything the screen needs before he has chosen anybody. */
export interface Launchpad {
  readonly clients: Page<ClientRecord>;
  readonly routines: Page<RoutineRecord>;
  readonly unfinished: readonly SessionRecord[];
}

/**
 * The roster, the library and anything left unfinished, in one read.
 *
 * ACTIVE CLIENTS ONLY. An archived client is somebody he has put away, and offering them as a person
 * to train today would undo the archiving. Archived is reachable under Clients, which is where it
 * belongs; this screen is the ordinary path.
 */
export async function readLaunchpad(store: LocalStore): Promise<Launchpad> {
  const [clients, routines, unfinished] = await Promise.all([
    listClients(store, { limit: LAUNCHER_PAGE_LIMIT, includeArchived: false }),
    libraryPage(store, 'routine', { limit: LAUNCHER_PAGE_LIMIT }),
    unfinishedSessions(store, { limit: UNFINISHED_LIMIT }),
  ]);

  return {
    clients: clients as Page<ClientRecord>,
    routines: routines as Page<RoutineRecord>,
    unfinished: (unfinished as Page<SessionRecord>).items,
  };
}

/**
 * Read the launchpad and publish it, dropping a read that arrives after the caller has gone.
 *
 * A failure is reported to the console and NOTHING is published. That is deliberate, and it is the
 * same rule the register follows: an empty page says "nobody is on your register", and publishing it
 * after a failed read would tell a coach with forty clients that he has none — the reassuring
 * answer, arrived at by not having looked. The screen guards on the store's own state instead.
 *
 * @returns cancel
 */
export function readLaunchpadInto(
  store: LocalStore,
  publish: (launchpad: Launchpad) => void,
): () => void {
  let live = true;

  void readLaunchpad(store).then(
    (launchpad) => {
      if (live) publish(launchpad);
    },
    (error: unknown) => {
      console.error('[calendar] the launcher could not be read from the local store', error);
    },
  );

  return () => {
    live = false;
  };
}

/** One person's previous session, or null on their first. */
export interface GlanceFor {
  readonly clientId: string;
  readonly glance: Glance | null;
}

/**
 * The previous session at a glance for each chosen person.
 *
 * ASKED PER PERSON, and that is the shape rather than an inefficiency: a session carries one to many
 * clients and each attendee's history is their own — their performed records, their loads, their
 * readings — and one client's must never appear in another's view. `previousSessionForClient` is one
 * step of a reverse walk over that person's own index range, so the cost is the number of people in
 * the room and not the size of the practice.
 */
export async function readGlances(
  store: LocalStore,
  clientIds: readonly string[],
): Promise<readonly GlanceFor[]> {
  return Promise.all(
    clientIds.map(async (clientId) => ({
      clientId,
      glance: (await previousSessionAtAGlance(store, clientId)) as Glance | null,
    })),
  );
}

/**
 * THE NAMES OF THE EXERCISES A GLANCE MENTIONS.
 *
 * A glance names exercises by CONTENT KEY, because that is how a session references library content
 * and it keeps that key whether the exercise was shipped or the coach wrote it. Rendered straight,
 * the panel told him he last did `look-bench-press` — a machine's word for something he named
 * himself, on the panel he reads to remember where somebody got to.
 *
 * A KEYED LOOKUP PER EXERCISE, never a walk of the library. `getByContentKey` is one index read, and
 * it is asked only for the handful of keys the glances actually mention — so the cost is the size of
 * one session and not the size of a library the coach has been building for five years.
 */
export async function readExerciseNames(
  store: LocalStore,
  glances: readonly GlanceFor[],
): Promise<ReadonlyMap<string, string>> {
  const wanted = new Set<string>();
  for (const found of glances) {
    for (const record of found.glance?.performed ?? []) {
      wanted.add(record.exercise_id);
      if (record.substituted_for_exercise_id !== null) wanted.add(record.substituted_for_exercise_id);
    }
    for (const load of found.glance?.loads ?? []) wanted.add(load.exercise_id);
  }

  const named = new Map<string, string>();
  await Promise.all([...wanted].map(async (key) => {
    // An exercise the coach has since deleted has no record, and the key is then shown as it
    // stands. That is honest: the session really did reference it, and inventing a name for
    // something no longer in the library would be worse than showing the key he can look up.
    const record = await store.getByContentKey('exercise', key);
    const name = record?.content?.name;
    if (typeof name === 'string' && name.length > 0) named.set(key, name);
  }));

  return named;
}

/** The glances, with the names of every exercise they mention. */
export interface GlanceReading {
  readonly items: readonly GlanceFor[];
  readonly exerciseNames: ReadonlyMap<string, string>;
}

/**
 * Read the glances and publish them, dropping a read that arrives after the caller has gone.
 * @returns cancel
 */
export function readGlancesInto(
  store: LocalStore,
  clientIds: readonly string[],
  publish: (reading: GlanceReading) => void,
): () => void {
  let live = true;

  void readGlances(store, clientIds)
    .then(async (items) => ({ items, exerciseNames: await readExerciseNames(store, items) }))
    .then(
      (reading) => {
        if (live) publish(reading);
      },
      (error: unknown) => {
        console.error('[calendar] the previous sessions could not be read', error);
      },
    );

  return () => {
    live = false;
  };
}

/**
 * The statuses that are NOT history, because they are still open.
 *
 * The same two `unfinishedSessions` offers for pick-up, and they are excluded here for a reason
 * found by looking at the rendered screen: a session was listed under "Sessions already done" with
 * "Still open" written beside it, while the very same session sat in the pick-up panel above. Both
 * statements were true and together they read as a contradiction. A session is either something he
 * can carry on with or something that happened, and the screen says one thing about it.
 */
const STILL_OPEN = Object.freeze(['in_progress', 'interrupted']);

/**
 * The sessions of the chosen people that already happened, newest first, without duplicating a
 * shared one.
 *
 * DE-DUPLICATED BY RECORD IDENTITY, because a session two of them attended is ONE session and
 * listing it twice would tell him he ran two. The order is the order the newest-first reads arrive
 * in, interleaved by start time, so a shared session sits where it happened rather than under
 * whichever person was read first.
 */
export async function readHistory(
  store: LocalStore,
  clientIds: readonly string[],
): Promise<readonly SessionRecord[]> {
  const pages = await Promise.all(
    clientIds.map((clientId) => sessionsForClient(store, clientId, { limit: HISTORY_LIMIT })),
  );

  const seen = new Set<string>();
  const found: SessionRecord[] = [];
  for (const page of pages) {
    for (const session of page.items as SessionRecord[]) {
      if (seen.has(session.record_id)) continue;
      seen.add(session.record_id);
      if (STILL_OPEN.includes(session.content.status)) continue;
      found.push(session);
    }
  }

  return found
    .sort((a, b) => whenOf(b).localeCompare(whenOf(a)))
    .slice(0, HISTORY_LIMIT);
}

/** When a session happened, for ordering. Empty rather than invented when it was never recorded. */
function whenOf(session: SessionRecord): string {
  return session.content.started_at ?? session.content.ended_at ?? '';
}

/**
 * Read the history and publish it, dropping a read that arrives after the caller has gone.
 * @returns cancel
 */
export function readHistoryInto(
  store: LocalStore,
  clientIds: readonly string[],
  publish: (sessions: readonly SessionRecord[]) => void,
): () => void {
  let live = true;

  void readHistory(store, clientIds).then(
    (sessions) => {
      if (live) publish(sessions);
    },
    (error: unknown) => {
      console.error('[calendar] the sessions already done could not be read', error);
    },
  );

  return () => {
    live = false;
  };
}

/** What the coach chose, ready to hand to the core. */
export interface StartRequest {
  readonly routineId: string;
  readonly clientIds: readonly string[];
  /** HIS ANSWER, always. Never a default — see the note below and `core/session/live-session.js`. */
  readonly mode: SessionMode;
  /** A link he pasted, or null. Never minted here, and never present on an in-person session. */
  readonly meetUrl: string | null;
  /**
   * The routine's own record, when the screen has it — and it does, because the coach chose it from
   * the list this file read.
   *
   * PASSED SO THE RUNNER RECEIVES A VIEW WITH THE ROUTINE'S LINES IN IT. `projectSession` derives
   * the plan from the routine envelope it is given; without one the view still describes everything
   * that HAPPENED, but the lines the routine named — and therefore everything not yet recorded — are
   * unknown. The handle is handed over already carrying it, so the runner does not re-read something
   * the launcher had in its hand.
   */
  readonly routine?: RoutineRecord | null;
}

/**
 * Start a session, and resolve only once it has actually started.
 *
 * THE MODE IS PASSED EXPLICITLY, EVERY TIME. This function is the caller that closed a known hole:
 * `planSession` used to write `online` when a caller passed nothing, which existed only because no
 * caller existed. The fallback is gone, so a caller that forgets is refused by the record itself with
 * the schema's own sentence — and this one does not forget, because `canStart` in `launcher.ts`
 * refuses to offer the button until the coach has said where he is.
 *
 * A LINK IS ONLY EVER PASSED ON THE ONLINE PATH, and it is only ever one he pasted. Nothing here
 * mints a link, nothing here contacts anything, and an in-person start issues no remote request of
 * any kind. `meetSource` is `pasted` for the same reason: it is the truth about where the link came
 * from, and the record holds a link and its origin to travelling together.
 *
 * The handle is HANDED OVER to the runner rather than released — see the file header, and
 * `screens/session-handover.ts` for what holding it means.
 */
export async function startTheSession(
  store: LocalStore,
  request: StartRequest,
): Promise<OpenOutcome> {
  const outcome = await startSession(store, {
    routineId: request.routineId,
    clientIds: [...request.clientIds],
    mode: request.mode,
    routine: request.routine ?? null,
    ...(request.meetUrl === null ? {} : { meetUrl: request.meetUrl, meetSource: 'pasted' }),
  });

  return handOver(store, outcome);
}

/**
 * ASK FOR A MEETING LINK AND WRITE IT ONTO THE SESSION THAT HAS JUST STARTED.
 *
 * ## Why this runs AFTER the session exists, and not before
 *
 * The create-request identifier that makes a retry idempotent is derived from the session's own
 * record id, so there is nothing stable to send until the session has been written. One session, one
 * meeting link, however many times this is retried. Minting first and creating second would mean a
 * new identifier every attempt, and a coach who tapped twice on a bad connection would own two
 * meetings — with the session pointing at whichever one answered last.
 *
 * ## The session is already real before this is called, and that is the point
 *
 * By the time this runs the session has started, the lease is held and everything recorded into it
 * is kept. So NOTHING HERE CAN COST HIM THE SESSION. A calendar that cannot make links, a dead
 * token, a lost network: each of them is a sentence about the LINK and never about the session, and
 * `screens/launcher.ts` words all of them from the outcome this returns.
 *
 * ## It never throws, and it never leaves a link half-recorded
 *
 * `mint` returns a value on every path rather than raising. The write that follows it is the one
 * thing here that CAN raise — the record refuses a link on an in-person session, and refuses a
 * second link that disagrees with the first — and a failure to write is reported as the link not
 * being on the session, which is exactly what is true. The exit is the same one every other path
 * offers: he can paste one.
 *
 * @param links the minting, from `platform/google-meet.ts`
 * @param sessionId the session that has already started
 * @param startsAt when the session began, for the event's window
 */
export async function mintTheLink(
  store: LocalStore,
  links: MeetMinting,
  sessionId: string,
  startsAt: Date,
): Promise<MintOutcome> {
  const outcome = await links.mint({ sessionId, startsAt });
  if (outcome.outcome !== 'minted') return outcome;

  const recorded = await attachTheLink(store, sessionId, outcome.url, 'minted');
  if (recorded) return outcome;

  // The link exists at Google but could not be written down here. Reported as "no link on the
  // session", because that is the true statement — and the retry is safe: the same session sends
  // the same identifier and Google answers with the meeting it already made rather than a second.
  return Object.freeze({
    outcome: 'refused' as const,
    code: 'unreadable' as const,
    sentence: MINT_REFUSALS.unreadable,
  });
}

/**
 * Write a joining link onto a session this window is running.
 *
 * THE LEASE IS WHAT MAKES THIS POSSIBLE, and this window holds it: the store refuses a write to a
 * session it does not hold, which is what stops two windows disagreeing about one session. So the
 * write goes through the HELD HANDLE rather than through the store directly.
 *
 * @returns whether the link is now on the session
 */
export async function attachTheLink(
  store: LocalStore,
  sessionId: string,
  url: string,
  source: string,
): Promise<boolean> {
  const live = heldSession(store, sessionId);
  if (live === undefined || live === null || live.recordJoiningLink === undefined) {
    console.error('[calendar] the joining link has nowhere to be written: this window is not running that session');
    return false;
  }
  try {
    await live.recordJoiningLink(url, source);
    return true;
  } catch (error: unknown) {
    console.error('[calendar] the joining link could not be written onto the session', error);
    return false;
  }
}

/**
 * Pick up a session that was left unfinished. THE SAME OPERATION AS STARTING ONE.
 *
 * `openSession` is the core's only door and does the same thing either way: it reads the journal and
 * projects it, so a session interrupted forty minutes in comes back exactly as it stood. There is no
 * recovery mode here because there is nothing to recover — every fact was committed as it happened.
 *
 * Its refusals are returned as values rather than thrown, because they are ordinary situations the
 * coach needs a sentence for: the session is open in his other window, it is not on this device, it
 * has already finished. `describeOutcome` shows the core's own sentence for each.
 *
 * IT HANDS OVER FOR THE SAME REASON THE START PATH DOES, and this is the half a handover forgets.
 * Picking a session up is not a lesser operation than starting one; a resumed session whose handle
 * was dropped here would put the coach in front of a runner that cannot write, forty minutes into a
 * session that already has facts in it.
 *
 * IF THIS WINDOW IS ALREADY RUNNING THAT SESSION, IT IS NOT REOPENED. Asking the store for a lease
 * this window already holds would be refused `held_elsewhere` — and the sentence that comes with that
 * refusal says the session is open in his OTHER window, which would be a lie about a window he is
 * looking at. What is held is handed straight back.
 */
export async function pickUpTheSession(
  store: LocalStore,
  sessionId: string,
  routine: RoutineRecord | null = null,
): Promise<OpenOutcome> {
  if (heldSession(store, sessionId) !== null) return { ok: true, session_id: sessionId };
  return handOver(store, await openSession(store, sessionId, { routine }));
}
