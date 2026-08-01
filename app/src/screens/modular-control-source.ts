/**
 * WHERE THE SIX MOVES ARE ACTUALLY RECORDED — and every one of them goes through the core's own verbs.
 *
 * Extracted from the component for the reason every source module in this application is: a static
 * render never runs an effect, so logic living inside one is logic nothing can check. Every function
 * here takes a store, so the suite drives it against a REAL store on the core's own platform double,
 * and the six moves are asserted by reading the record BACK rather than by trusting the call.
 *
 * ## NOTHING HERE IS A NEW WAY TO RECORD ANYTHING
 *
 * `core/session/SESSION.md` §4 already maps each move onto the verb that records it, and
 * `core/session` is finished. This file is the wire between a press and that verb, and the mapping is
 * worth writing down because two of the six have no verb of their own and that is not an omission:
 *
 * | The coach… | reaches | which records |
 * | --- | --- | --- |
 * | jumps to any exercise | {@link recordTheLine} | one fact at position 0; the untouched lines stay `not_yet_recorded` |
 * | reorders | {@link recordTheLine} | facts in the order they were appended, so `order_as_run` differs from the routine's |
 * | skips | {@link skipTheLine} | a fact with status `skipped`, so the line has an OUTCOME |
 * | repeats | {@link recordTheLine} again | a SECOND fact at a later position; the first is not touched |
 * | substitutes | {@link substituteTheLine} | the substitute AND what it replaced, against the line it replaced |
 * | edits | {@link amendTheAttempt} | a revision of that fact; nothing else moves |
 *
 * A JUMP AND A REORDER ARE THEREFORE THE SAME CALL as recording in declared order, and that is the
 * whole point: there is no order to be in, so there is nothing to leave. Anything here that took an
 * opinion about which line may be recorded when would be the application driving the session.
 *
 * ## THE LEASE IS THE ONE THIS WINDOW ALREADY HOLDS
 *
 * Every write is made through the handle `screens/session-handover.ts` is holding — the one the
 * calendar handed over and `runner-source.ts` received. Nothing here calls `openSession`. Doing so
 * over a session this window already held would take a SECOND lease and reintroduce the
 * two-windows-one-session failure the lease exists to prevent; and a session-scoped write with no
 * lease is refused by the store INSIDE the transaction that would have written it, which is why "no
 * handle" is reported to the coach as a situation rather than attempted anyway.
 *
 * ## A REFUSAL IS A VALUE, AND IT IS NEVER SWALLOWED
 *
 * Nothing here throws at the screen. Every failure comes back as {@link MoveResult} carrying the
 * refusal's own sentence — including the journal-full refusal, which is a real, reachable state — and
 * every one is logged with its cause on the way past. A control that silently does nothing is the
 * failure shape this build has been bitten by repeatedly: an absence that looks like a pass.
 *
 * ## WHY EVERY MOVE HANDS BACK THE WHOLE SESSION
 *
 * A move that returned only success would leave the screen holding the view it had BEFORE the fact
 * landed, and the coach would press Record and see nothing change until something else happened to
 * re-read. So each move reads the session back through the same handle and returns it, which is one
 * state change on the screen rather than two and no window in which the record and the screen
 * disagree.
 */

import { libraryPage, listClients } from '../../core/store/store.js';
import { NOT_HELD_HERE, describeRefusal } from './modular-control';
import type { ArrivalChoice, FactValues, RefusalReport, SubstituteChoice } from './modular-control';
import { readExerciseNames } from './runner-source';
import type { SessionView } from './runner-source';
import { heldSession } from './session-handover';
import type { LocalStore } from '../../core/store/store.js';

/**
 * The live handle, as much of it as this file touches.
 *
 * Structural rather than the class, exactly as `runner-source.ts` and `session-handover.ts` treat it:
 * this module calls four of its methods and owns none of it. `core/session/live-session.js` is the
 * authority on all four.
 */
interface RecordingHandle {
  readonly closed: boolean;
  recordPerformed: (clientId: string, fact: Record<string, unknown>) => Promise<unknown>;
  recordSkipped: (
    clientId: string, exerciseId: string, options?: Record<string, unknown>,
  ) => Promise<unknown>;
  recordSubstitution: (clientId: string, fact: Record<string, unknown>) => Promise<unknown>;
  amend: (
    type: string, recordId: string,
    produce: (content: Record<string, unknown>) => Record<string, unknown>,
  ) => Promise<unknown>;
  refresh: () => Promise<SessionView>;
}

/**
 * The live handle as the late-arrival wire touches it: ONE verb, and it owns none of it.
 *
 * Structural rather than the class, exactly as `session-ending-source.ts` names only `complete` and
 * `session-readings-source.ts` names only what it captures. Naming `addClient` alone is the point —
 * `removeClient` sits beside it on the same class, carries its own refusal, and is not in this
 * file's reach.
 */
interface ArrivingHandle {
  addClient: (clientId: string, options?: Record<string, unknown>) => Promise<unknown>;
}

/** The session as it stands after a move, with the names of everything it now mentions. */
export interface SessionReadBack {
  readonly view: SessionView;
  /** Re-read, because a substitution can bring in an exercise the previous read had no name for. */
  readonly exerciseNames: ReadonlyMap<string, string>;
}

/** What a move produced. */
export interface MoveResult {
  readonly ok: boolean;
  /** The session as it stands, present whenever the move landed. */
  readonly reading: SessionReadBack | null;
  /** Why it did not, in the coach's words. Null when it did. */
  readonly refusal: RefusalReport | null;
}

/**
 * RECORD WHAT THIS PERSON DID FOR THIS EXERCISE — which is the jump, the reorder and the repeat.
 *
 * No check that anything else has been recorded first, and no check that this line has not been
 * recorded already. Both would be this file deciding where he ought to be. The core allocates the
 * position from the record, one past the highest already there, so the order the session RAN in stays
 * visible and a repeat is a second fact rather than an edit of the first.
 */
export function recordTheLine(
  store: LocalStore,
  sessionId: string,
  clientId: string,
  exerciseId: string,
  values: FactValues,
): Promise<MoveResult> {
  return throughTheHeldSession(store, sessionId, 'record', (live) =>
    live.recordPerformed(clientId, { ...values, exerciseId }));
}

/**
 * RECORD THAT IT WAS SKIPPED. A skip is a fact about the session, not a gap in it.
 *
 * NO VALUES TRAVEL WITH IT, and that is the record's rule rather than a simplification: a skipped
 * exercise records no work, so sets, repetitions, a duration or a load on a skip is refused outright.
 * A note is the one thing it carries, because why it was skipped is worth keeping.
 */
export function skipTheLine(
  store: LocalStore,
  sessionId: string,
  clientId: string,
  exerciseId: string,
  note: string | null,
): Promise<MoveResult> {
  const options = note !== null && note.length > 0 ? { note } : {};
  return throughTheHeldSession(store, sessionId, 'skip', (live) =>
    live.recordSkipped(clientId, exerciseId, options));
}

/**
 * RECORD SOMETHING ELSE IN ITS PLACE, against the line it replaced.
 *
 * `insteadOf` is what the routine asked for and `exerciseId` is what was actually done. Both are
 * stored: a substitution that forgot what it replaced would lose what was originally programmed, and
 * the projection attaches the attempt to the line it replaced rather than letting it appear as a line
 * of its own — otherwise adapting one exercise for one tired client would read as one line never done
 * and a second appearing out of nowhere.
 *
 * ONE PERSON'S LINE. Nobody else in the session is touched, which is what makes this an adaptation
 * rather than a fork of the session.
 */
export function substituteTheLine(
  store: LocalStore,
  sessionId: string,
  clientId: string,
  substitution: { readonly insteadOf: string; readonly exerciseId: string; readonly values: FactValues },
): Promise<MoveResult> {
  return throughTheHeldSession(store, sessionId, 'substitute', (live) =>
    live.recordSubstitution(clientId, {
      ...substitution.values,
      exerciseId: substitution.exerciseId,
      insteadOf: substitution.insteadOf,
    }));
}

/**
 * CORRECT A FACT ALREADY RECORDED — a mistyped load, a rep count read back wrong.
 *
 * A REVISION of that fact. Nothing is removed and nothing else moves: the fact itself never
 * disappears from the session's record, and no other line, attempt or person is touched.
 *
 * The correction is applied to what is ACTUALLY STORED rather than to what the screen last saw, which
 * is the core's own reason for taking a function here. A value he CLEARED arrives as null and the key
 * is dropped, because a field he emptied is a field with nothing recorded in it — and the record
 * treats an absent key and not a null as that.
 */
export function amendTheAttempt(
  store: LocalStore,
  sessionId: string,
  recordId: string,
  amendment: Readonly<Record<string, number | string | null>>,
): Promise<MoveResult> {
  return throughTheHeldSession(store, sessionId, 'edit', (live) =>
    live.amend('performed-record', recordId, (content) => applyAmendment(content, amendment)));
}

/** Read the session back without moving anything — after a sibling surface has written, or on demand. */
export function readTheSessionBack(
  store: LocalStore,
  sessionId: string,
): Promise<MoveResult> {
  return throughTheHeldSession(store, sessionId, 'read back', async () => undefined);
}

/**
 * SOMEBODY ARRIVED AFTER THE SESSION STARTED — put them in it.
 *
 * ## Why this is one line here rather than a seam of its own
 *
 * `addClient` USES THE LEASE THIS HANDLE ALREADY HOLDS: it passes `{ lease: this.lease }` to the
 * store and takes none of its own, so there is no lease choreography to design and nothing here that
 * `recordTheLine` does not already do. It is the same three lines, through the same held handle, and
 * every way it can refuse — `SessionClosedError` from the handle's own open check, `StoreLeaseError`
 * from the write — is already in `modular-control.ts`'s coach-facing list, so it needs no failure
 * taxonomy of its own either.
 *
 * ## THE LATE ARRIVAL IS ORDINARY, AND THE APPLICATION USED TO REFUSE IT WITH NOWHERE TO GO
 *
 * Recording against somebody not in the session is refused by `core/session/journal.js` with a
 * sentence that told the coach to add them first — while no file under `src/` called `addClient` at
 * all. This is the call that makes that sentence true, and the sentence now names the control drawn
 * over this function.
 *
 * ONE PERSON, ONE ROUTINE. A session drives one routine however many people are in it, so there is
 * nothing to choose here beyond who: the arrival joins the routine already running. The core makes
 * the write idempotent — adding somebody already in the session returns the record unchanged rather
 * than listing them twice.
 */
export function addTheLateArrival(
  store: LocalStore,
  sessionId: string,
  clientId: string,
): Promise<MoveResult> {
  return throughTheHeldSession<ArrivingHandle>(store, sessionId, 'late arrival', (live) =>
    live.addClient(clientId));
}

/**
 * How many exercises the substitution pool offers at once.
 *
 * The library page's own default is 25, and the pool is deliberately wider: the shipped catalogue
 * holds sixty to a hundred exercises and the surplus over the shipped week IS the substitution pool,
 * so a page of 25 would hide most of it behind a cursor he has no reason to know about. It is still a
 * PAGE and not the whole library — the coach's own library grows for years — and the screen says
 * plainly when there is more than this rather than implying he is looking at everything.
 */
export const SUBSTITUTION_POOL_LIMIT = 200;

/** The substitution pool, and whether it is everything. */
export interface SubstitutionPool {
  readonly choices: readonly SubstituteChoice[];
  /** False when the library holds more than one page. Said to him rather than swallowed. */
  readonly whole: boolean;
}

/**
 * THE EXERCISES THAT CAN STAND IN FOR ONE LINE: the catalogue, not the routine's own list.
 *
 * A routine names a handful of exercises and the catalogue holds many more on purpose — an importer
 * that pruned the unreferenced ones would delete exactly this pool. Read here rather than derived
 * from the session, because the session only mentions what it has already used.
 */
export async function readTheSubstitutionPool(store: LocalStore): Promise<SubstitutionPool> {
  const page = await libraryPage(store, 'exercise', { limit: SUBSTITUTION_POOL_LIMIT }) as {
    items: readonly { content?: { id?: string; name?: string } }[];
    done: boolean;
  };

  const choices: SubstituteChoice[] = [];
  for (const record of page.items) {
    const exerciseId = record.content?.id;
    const name = record.content?.name;
    // An exercise with neither is not something he can be offered by name, and offering it by key
    // would be a machine talking on the screen he reads with a client in front of him.
    if (typeof exerciseId === 'string' && typeof name === 'string' && name.length > 0) {
      choices.push({ exerciseId, name });
    }
  }

  return { choices, whole: page.done };
}

/**
 * Read the pool and publish it, dropping a read that arrives after the caller has gone.
 *
 * A failure publishes NOTHING and is logged: an empty pool would read as "your library holds no
 * exercises", which is a nought this application never counted. The same rule the launcher's reads
 * follow.
 *
 * @returns cancel
 */
export function readSubstitutionPoolInto(
  store: LocalStore,
  publish: (pool: SubstitutionPool) => void,
): () => void {
  let live = true;

  void readTheSubstitutionPool(store).then(
    (pool) => {
      if (live) publish(pool);
    },
    (error: unknown) => {
      console.error('[session] the exercise library could not be read for a substitution', error);
    },
  );

  return () => {
    live = false;
  };
}

/**
 * How many people the arrival picker offers at once.
 *
 * The same number and the same reasoning as {@link SUBSTITUTION_POOL_LIMIT}: a coach's register grows
 * for years, so this is a PAGE and not the whole of it, and the screen says plainly when there is
 * more rather than implying he is looking at everybody.
 */
export const ARRIVAL_REGISTER_LIMIT = 200;

/** The people who could be added, and whether that is everybody. */
export interface ArrivalRegister {
  readonly choices: readonly ArrivalChoice[];
  /** False when the register holds more than one page. Said to him rather than swallowed. */
  readonly whole: boolean;
}

/**
 * THE PEOPLE WHO COULD BE ADDED TO A RUNNING SESSION: the register, not the session's own roster.
 *
 * THE ONE READ THE RUNNER DID NOT ALREADY DO. Every other list this screen draws comes off the
 * session — who is in it, what they did, what the routine asked for — and a late arrival is by
 * definition somebody the session has never mentioned. So it is read from the register, exactly as
 * the substitution pool is read from the catalogue and for the same reason: the thing he needs is
 * the one the session cannot tell him about.
 *
 * ## `listClients` AND NOT `libraryPage`, AND THAT WAS MEASURED RATHER THAN CHOSEN
 *
 * The substitution pool's read is `libraryPage`, and this was written the same way first. IT THROWS:
 * `NotFoundError: No index "by_content_key" on "clients"`. The catalogue is content-keyed and the
 * register is not — people are not library content, they have no content key, and the store says so
 * by having no such index. `listClients` is the register's OWN query, which the register screen has
 * always used: alphabetical by name, and archived people left out unless they are asked for.
 *
 * SO THE ARCHIVED QUESTION IS ANSWERED BY THE STORE'S OWN CONVENTION rather than by an opinion held
 * here. Somebody the coach has stopped training does not appear in the picker, which is exactly what
 * he sees on his register — and if he wants them back it is the register that brings them back, one
 * place rather than two.
 *
 * WHO IS ALREADY IN THE ROOM IS NOT SUBTRACTED HERE. That is the screen's to do, because the screen
 * is what knows the roster it is drawing beside — the same division `readTheSubstitutionPool` keeps
 * against the line being replaced.
 */
export async function readTheArrivalRegister(store: LocalStore): Promise<ArrivalRegister> {
  const page = await listClients(store, { limit: ARRIVAL_REGISTER_LIMIT }) as {
    items: readonly { record_id?: string; content?: { name?: string } }[];
    done: boolean;
  };

  const choices: ArrivalChoice[] = [];
  for (const record of page.items) {
    const clientId = record.record_id;
    const name = record.content?.name;
    // A person the coach cannot be offered BY NAME is not somebody he can knowingly add to a session,
    // and offering a record id would be a machine talking on the screen he reads with a client in
    // front of him. The identity is the RECORD ID here and not a content key, because that is what
    // a session's `client_ids` holds and what `addClient` is given.
    if (typeof clientId === 'string' && typeof name === 'string' && name.length > 0) {
      choices.push({ clientId, name });
    }
  }

  return { choices, whole: page.done };
}

/**
 * Read the register and publish it, dropping a read that arrives after the caller has gone.
 *
 * A failure publishes NOTHING and is logged, exactly as the substitution pool's read does: an empty
 * register would read as "you train nobody", which is a nought this application never counted and
 * would be a lie told at the moment he is trying to add somebody.
 *
 * @returns cancel
 */
export function readArrivalRegisterInto(
  store: LocalStore,
  publish: (register: ArrivalRegister) => void,
): () => void {
  let live = true;

  void readTheArrivalRegister(store).then(
    (register) => {
      if (live) publish(register);
    },
    (error: unknown) => {
      console.error('[session] your register could not be read for a late arrival', error);
    },
  );

  return () => {
    live = false;
  };
}

// ── internals ───────────────────────────────────────────────────────────────────────────────────

/**
 * Every move, through the handle this window is holding, with the session read back after it.
 *
 * The one place a refusal is turned into a value, so no move can grow its own quieter version of
 * that. The cause is logged with the move's name before it is worded for the coach: a failure he
 * reads as a sentence still has to be traceable afterwards.
 *
 * EXPORTED FOR THE SIBLING SURFACES ON THE SAME SPINE (s6/a5), which was already anticipated here by
 * {@link readTheSessionBack}: readings and notes are recorded through the same held handle, are
 * refused by the same taxonomy, and need the same read-back for the same reason. A second copy of
 * this would be a second place where a refusal could be swallowed and a second definition of "the
 * fact landed and the read-back did not" — which is the one distinction in this file that must not be
 * got wrong twice.
 *
 * @param move what was being attempted, for the log line
 */
export async function throughTheHeldSession<H extends object = RecordingHandle>(
  store: LocalStore,
  sessionId: string,
  move: string,
  act: (live: H) => Promise<unknown>,
): Promise<MoveResult> {
  // The handle is the core's whole `LiveSession`; each caller names only the verbs it reaches, which
  // is how `runner-source.ts` and `session-handover.ts` treat it too. The intersection is what lets
  // this function keep checking `closed` and reading the session back for every one of them.
  const live = heldSession(store, sessionId) as (H & RecordingHandle) | null;
  if (live === null || live.closed) {
    return { ok: false, reading: null, refusal: { headline: NOT_HELD_HERE, detail: null, journalFull: false } };
  }

  try {
    await act(live);
  } catch (error: unknown) {
    console.error(`[session] the ${move} could not be recorded into the session`, error);
    return { ok: false, reading: null, refusal: describeRefusal(error) };
  }

  try {
    const view = await live.refresh();
    return {
      ok: true,
      reading: { view, exerciseNames: await readExerciseNames(store, view) },
      refusal: null,
    };
  } catch (error: unknown) {
    // THE FACT LANDED AND THE READ-BACK DID NOT, which is a different thing from the move failing and
    // must not be reported as one: telling him it was not recorded would have him record it twice.
    console.error(`[session] the ${move} was recorded but the session could not be read back`, error);
    return {
      ok: true,
      reading: null,
      refusal: {
        headline: 'That was recorded. This screen could not read the session back to show it — '
          + 'nothing is lost, and reopening the session shows everything that is on the record.',
        detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        journalFull: false,
      },
    };
  }
}

/**
 * A correction applied to what is stored.
 *
 * A null means he CLEARED the field, and the key is dropped rather than written as null: the record
 * treats an absent key as nothing recorded, and a null would be a value it refuses. Every other key
 * on the stored fact — its session, its person, its position, its status, what it replaced — is left
 * exactly as it is, which is what "nothing else moves" means at this seam.
 */
function applyAmendment(
  content: Record<string, unknown>,
  amendment: Readonly<Record<string, number | string | null>>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...content };
  for (const [field, value] of Object.entries(amendment)) {
    if (value === null) delete next[field];
    else next[field] = value;
  }
  return next;
}
