/**
 * WHERE A READING, A NOTE AND THE PREVIOUS SESSION ACTUALLY COME FROM — through the core's own verbs
 * and through the lease this window already holds.
 *
 * Extracted from the component for the reason every source module in this application is: a static
 * render never runs an effect, so logic living inside one is logic nothing can check. Every function
 * here takes a store, so the suite drives it against a REAL store on the core's own platform double,
 * and every write is asserted by reading the record BACK rather than by trusting the call.
 *
 * ## NOTHING HERE IS A NEW WAY TO RECORD ANYTHING, AND NO NEW FACT EXISTS
 *
 * `core/session/journal.js` owns the three facts a session can record and this action adds none.
 * `recordReading` and `recordNote` on the live handle are the two verbs behind this whole file:
 *
 * | The coach… | reaches | which records |
 * | --- | --- | --- |
 * | takes a heart rate for one attendee | {@link recordTheReading} | a `reading` against THAT client |
 * | takes a plank hold just after the session | {@link recordTheReading} | the same, with the context he chose |
 * | writes a note about one person | {@link recordTheNote} with a client | a `session-note` that follows that person |
 * | writes a note about the session | {@link recordTheNote} with none | a `session-note` belonging to nobody |
 *
 * THE LAST TWO ARE ONE VERB AND TWO FACTS, and the difference is a client identity being present or
 * absent. Nothing here infers one from the other: a note WITH a client follows them into their
 * progress view and their export, and putting one client's note into another's export is precisely
 * what a guess here would do.
 *
 * ## THE LEASE IS THE ONE THIS WINDOW ALREADY HOLDS
 *
 * Every write goes through the handle `screens/session-handover.ts` is holding — the one the calendar
 * handed over on BOTH doors and `runner-source.ts` received. Nothing here calls `openSession`: doing
 * so over a session this window already held would take a SECOND lease and reintroduce the
 * two-windows-one-session failure the lease exists to prevent, and a session-scoped write with no
 * lease is refused by the store INSIDE the transaction that would have written it.
 *
 * `modular-control-source.ts` already holds the one place a refusal becomes a value and a read-back is
 * turned into a fresh view, and its own header anticipated this surface writing through it. So
 * {@link throughTheHeldSession} is imported rather than copied. A second copy would be a second place
 * a refusal could be swallowed and a second definition of "the fact landed but the read-back did not",
 * which must not be got wrong twice.
 *
 * ## THE PREVIOUS SESSION IS READ WITH THE CURRENT ONE EXCLUDED, AND THAT IS THE WHOLE TRICK
 *
 * `previousSessionForClient` accepts `in_progress` among the statuses it will return, deliberately —
 * an interrupted or still-running session is history too. So asked plainly, from inside a running
 * session, it hands back THE SESSION HE IS LOOKING AT and the panel says he last did the routine he is
 * doing now. `excludeSessionId` is what makes it the session BEFORE this one, which is what the
 * requirement asks for, and the suite proves it by asking BOTH ways in the same test.
 */

import { previousSessionAtAGlance } from '../../core/session/glance.js';
import { readExerciseNames } from './launcher-source';
import { throughTheHeldSession } from './modular-control-source';
import type { MoveResult } from './modular-control-source';
import type { ReadingValues } from './session-readings';
import type { Glance } from './launcher';
import type { LocalStore } from '../../core/store/store.js';

/**
 * The live handle, as much of it as this file touches.
 *
 * Structural rather than the class, exactly as every other module on this spine treats it: this one
 * calls two of its methods and owns none of it. `core/session/live-session.js` is the authority on
 * both, including the caps they refuse at.
 */
interface CapturingHandle {
  recordReading: (clientId: string, reading: Record<string, unknown>) => Promise<unknown>;
  recordNote: (note: Record<string, unknown>) => Promise<unknown>;
}

/**
 * RECORD ONE READING AGAINST ONE PERSON.
 *
 * Per client, always. The handle refuses a reading for somebody who is not attending, and it refuses
 * the four hundred and first with the core's own sentence saying the record is intact and this session
 * is simply full — both come back as values with that sentence on them rather than as a throw at the
 * screen.
 *
 * No check that anything has been recorded first and no check about where he is in the routine: a
 * reading is taken at the moment it is taken, which is the requirement, and a condition here would be
 * this file having an opinion about when he is allowed to measure somebody.
 */
export function recordTheReading(
  store: LocalStore,
  sessionId: string,
  clientId: string,
  reading: ReadingValues,
): Promise<MoveResult> {
  return throughTheHeldSession<CapturingHandle>(store, sessionId, 'reading', (live) =>
    live.recordReading(clientId, { ...reading }));
}

/**
 * RECORD ONE NOTE — about one person, or about the session as a whole.
 *
 * `clientId` null means the session's own note, and it is passed through as the absence it is. The
 * core's `recordNote` reads a client identity as "this person's note" and its absence as "about the
 * session", and it says in as many words that nothing infers one from the other. Neither does this.
 */
export function recordTheNote(
  store: LocalStore,
  sessionId: string,
  clientId: string | null,
  text: string,
): Promise<MoveResult> {
  return throughTheHeldSession<CapturingHandle>(store, sessionId, 'note', (live) =>
    live.recordNote(clientId === null ? { text } : { text, clientId }));
}

/** One person's previous session, with the name of the routine it was run from. */
export interface GlanceForRunner {
  readonly clientId: string;
  /** Null on a FIRST session, which the panel says plainly rather than drawing an empty box. */
  readonly glance: Glance | null;
  /** The previous session's OWN routine, which is not necessarily the one he is running now. */
  readonly routineName: string | null;
}

/** The glances, with the names of everything they mention. */
export interface RunnerGlances {
  readonly items: readonly GlanceForRunner[];
  readonly exerciseNames: ReadonlyMap<string, string>;
}

/**
 * THE PREVIOUS SESSION FOR EACH PERSON IN THE ROOM, with the one being run EXCLUDED.
 *
 * ASKED PER PERSON, and that is the shape rather than an inefficiency: a session carries one to many
 * clients and each attendee's history is their own, and one client's must never appear in another's
 * panel. Each ask is one step of a reverse walk over that person's own index range, so the cost is
 * the number of people in the room and not the size of the practice.
 *
 * THE ROUTINE NAME IS THE PREVIOUS SESSION'S, read by content key from the glance itself. Passing the
 * routine he is running now would tell him he last did today's routine whatever he actually did, which
 * is a false claim about his own history on the panel he reads to remember where somebody got to.
 */
export async function readTheGlances(
  store: LocalStore,
  clientIds: readonly string[],
  options: { readonly excludeSessionId: string | null },
): Promise<readonly GlanceForRunner[]> {
  const found = await Promise.all(clientIds.map(async (clientId) => ({
    clientId,
    glance: (await previousSessionAtAGlance(store, clientId, {
      excludeSessionId: options.excludeSessionId,
    })) as Glance | null,
  })));

  // ONE KEYED READ PER DISTINCT ROUTINE, not one per person: three people whose last session was the
  // same routine is one read. A routine he has since deleted has no record, and the panel then shows
  // the key it kept — honest, because the session really did reference it.
  const names = new Map<string, string | null>();
  await Promise.all([...new Set(found
    .map((each) => each.glance?.routine_id)
    .filter((key): key is string => typeof key === 'string' && key.length > 0))]
    .map(async (key) => {
      const record = await store.getByContentKey('routine', key);
      const name = (record as { content?: { name?: string } } | null)?.content?.name;
      names.set(key, typeof name === 'string' && name.length > 0 ? name : null);
    }));

  return found.map((each) => ({
    ...each,
    routineName: each.glance === null ? null : names.get(each.glance.routine_id) ?? null,
  }));
}

/**
 * Read the glances and publish them, dropping a read that arrives after the caller has gone.
 *
 * A failure publishes NOTHING and is logged, rather than publishing an empty result: a history that
 * could not be read and a client who has never trained are different facts, and showing the second for
 * the first would tell him a regular client has no past. The same rule every read on this spine
 * follows.
 *
 * @returns cancel
 */
export function readGlancesInto(
  store: LocalStore,
  clientIds: readonly string[],
  options: { readonly excludeSessionId: string | null },
  publish: (glances: RunnerGlances) => void,
): () => void {
  let live = true;

  void readTheGlances(store, clientIds, options)
    .then(async (items) => ({
      items,
      // The names of the exercises those sessions mention, by content key. `launcher-source.ts` owns
      // this read for exactly this shape and it is reused rather than written a second time.
      exerciseNames: await readExerciseNames(store, items),
    }))
    .then(
      (glances) => {
        if (live) publish(glances);
      },
      (error: unknown) => {
        console.error('[session] the previous sessions could not be read for the runner', error);
      },
    );

  return () => {
    live = false;
  };
}
