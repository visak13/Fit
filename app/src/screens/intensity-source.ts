/**
 * WHERE THE CURVES, THE LIBRARY AND EVERYBODY'S RECORD COME FROM — and where the adapter is called.
 *
 * Extracted from the component for the reason every source module in this application is: a static
 * render never runs an effect, so logic living inside one is logic nothing can check. Every function
 * here takes a store, so the suite drives it against a REAL store on the core's own platform double.
 *
 * ## NOTHING HERE IS ARITHMETIC, AND THAT IS THE POINT
 *
 * `core/intensity/intensity.js` shapes the session. This file assembles its four arguments — the
 * pattern he pressed, the routine this session is running, the WHOLE exercise library, and each
 * client's recent record — calls it once per person, and hands back what came out. Not one number is
 * computed here, no proposed value is adjusted here, and no sentence the adapter wrote is reworded
 * here. A second implementation of the ladder at the screen would be a second answer to what the curve
 * asks for, and the one he read would depend on which of the two he was looking at.
 *
 * ## THE ROUTINE IS THE ONE THE SESSION IS ALREADY RUNNING
 *
 * Taken off the live handle this window is holding — `runner-source.ts` has already put it there, and
 * fills it in on a cold arrival where the handover could not. Reading the routine again from the
 * library would be a second source of truth for the thing the session is defined by, and the two could
 * disagree the moment he edits a routine mid-session. Nothing here calls `openSession`, takes a lease,
 * or writes anything at all: shaping a curve is a READ, and the adapter is pure.
 *
 * ## ONE CALL PER PERSON, BECAUSE CALIBRATION IS PER PERSON
 *
 * A session is one routine and a SET of clients, and the whole reason the adapter takes a history is
 * that the shape fits the person. Calling it once for the room and showing one person's numbers to
 * everybody would be the per-client rule broken in the most damaging place available — a tired client
 * shown a fitter one's numbers, mid-session, as though they had been measured.
 *
 * The ORDER, though, is one order: `placeExercises` takes the curve, the routine and the catalogue and
 * no history at all, so every person's proposal places the same movement at the same position.
 * {@link agreedRows} does not assume that — it CHECKS it, and refuses rather than showing one person's
 * order as everybody's if it ever stops being true.
 *
 * ## THE WINDOW IS THIS FILE'S CHOICE, AND IT EXCLUDES THE SESSION HE IS RUNNING
 *
 * The adapter deliberately takes the history as an argument and decides nothing about what "recent"
 * means — a module that fetched its own history would need a clock to bound it. So the choice is here
 * and it is stated: the most recent {@link HISTORY_SESSIONS} sessions before this one, and the session
 * in this window is left out. Including it would mean the same curve proposed different numbers
 * depending on how much of the session was already recorded — two answers to one question during one
 * session — and it would calibrate the lines he has not done yet against the lines he just did. The
 * glance panel beside it excludes the current session for its own reasons and this is consistent with
 * it.
 */

import { proposeSession } from '../../core/intensity/intensity.js';
import { libraryPage, performedForClient } from '../../core/store/store.js';
import { COULD_NOT_SHAPE, toggleFor } from './intensity';
import type {
  PatternToggle, PersonProposal, ProposedEffort, ProposedRow, RoomProposal, ShapingRefusal,
} from './intensity';
import { heldSession } from './session-handover';
import type { LocalStore } from '../../core/store/store.js';

/**
 * HOW MANY OF A CLIENT'S RECENT SESSIONS COUNT AS RECENT.
 *
 * Six, which is a handful of weeks of ordinary training rather than a year of it. The number matters
 * in one direction only: the baseline's CEILING is the most this person has managed anywhere in the
 * window, so a wider window can only ever hold a proposal DOWN, never push one up. It is bounded at
 * all because the window is also the sentence he reads about where a number came from, and "sometime
 * in the last five years" is not provenance.
 */
export const HISTORY_SESSIONS = 6;

/**
 * How many performed records are read per person to find those sessions.
 *
 * A ceiling and not a target: the walk stops as soon as it has seen {@link HISTORY_SESSIONS} sessions,
 * which on ordinary data is a fraction of this. It exists so that one client with years of history
 * cannot turn pressing a curve into a walk of the whole practice.
 */
export const HISTORY_RECORDS = 400;

/**
 * How much of the exercise library is read for the substitution pool the adapter draws on.
 *
 * The WHOLE library is what the adapter asks for, and `INTENSITY.md` §4 is why: the shipped catalogue
 * deliberately exceeds the shipped week and the surplus IS the substitution pool. So this pages to the
 * end rather than taking a page, and the ceiling below is a guard against a pathological library
 * rather than a page size. {@link Catalogue.whole} says plainly when it was reached.
 */
export const CATALOGUE_PAGE = 200;
export const CATALOGUE_CEILING = 4000;

/** The curves his library holds, and whether that is all of them. */
export interface Curves {
  readonly toggles: readonly PatternToggle[];
  /** The patterns' own content, kept so pressing one does not have to read it again. */
  readonly patterns: ReadonlyMap<string, Record<string, unknown>>;
  /** False when the library holds more curves than were read. Said to him rather than swallowed. */
  readonly whole: boolean;
}

/**
 * THE CURVES HE CAN PRESS, read from the library rather than written down here.
 *
 * Patterns are a record kind seeded from the shipped content, so a curve he added, edited or deleted
 * is a curve this row of buttons reflects. That is the requirement: all of this is meant to be
 * configurable, and a hard-coded list would make the shipped set the only set.
 */
export async function readTheCurves(store: LocalStore): Promise<Curves> {
  const page = await libraryPage(store, 'intensity-pattern', { limit: CATALOGUE_PAGE }) as {
    items: readonly { content?: Record<string, unknown> }[];
    done: boolean;
  };

  const toggles: PatternToggle[] = [];
  const patterns = new Map<string, Record<string, unknown>>();
  for (const record of page.items) {
    const content = record.content;
    if (!content) continue;
    const id = content.id;
    const name = content.name;
    const sequence = content.sequence;
    // A pattern missing any of the three is not something he can be offered as a button: an unnamed
    // curve is a machine talking, and a curve with no sequence has no shape to press.
    if (typeof id !== 'string' || typeof name !== 'string' || !Array.isArray(sequence)) continue;
    patterns.set(id, content);
    toggles.push(toggleFor({
      id,
      name,
      sequence: sequence as readonly string[],
      description: typeof content.description === 'string' ? content.description : undefined,
    }));
  }

  return { toggles, patterns, whole: page.done };
}

/** The exercise library, in full, and whether it really was in full. */
export interface Catalogue {
  readonly exercises: readonly Record<string, unknown>[];
  readonly whole: boolean;
}

/**
 * THE WHOLE LIBRARY, PAGED TO THE END, PRUNING NOTHING.
 *
 * `INTENSITY.md` §4: referential checking runs in one direction only — every exercise a routine names
 * must exist, never the reverse — so an exercise no routine references is a NORMAL state and it is
 * exactly the pool a substitution is drawn from. Filtering here would delete the feature.
 */
export async function readTheCatalogue(store: LocalStore): Promise<Catalogue> {
  const exercises: Record<string, unknown>[] = [];
  let after: string | null = null;
  let whole = false;

  while (exercises.length < CATALOGUE_CEILING) {
    // eslint-disable-next-line no-await-in-loop
    const page = await libraryPage(store, 'exercise', { limit: CATALOGUE_PAGE, after }) as {
      items: readonly { content?: Record<string, unknown> }[];
      cursor: string | null;
      done: boolean;
    };
    for (const record of page.items) {
      const content = record.content;
      if (content && typeof content.id === 'string') exercises.push(content);
    }
    if (page.done || page.cursor === null) {
      whole = true;
      break;
    }
    after = page.cursor;
  }

  return { exercises, whole };
}

/**
 * ONE CLIENT'S RECENT RECORD, as the adapter's `history` argument.
 *
 * Their own performed records, most recent first, from the sessions before this one — see the header
 * for why this one is left out. The window travels with it so the sentence the coach reads about a
 * number can say which sessions it came from.
 *
 * An empty result is ORDINARY and is returned as one rather than as null: `readBaseline` reads an empty
 * `performed` list as no baseline, reports `kind: 'none'`, and writes the sentence saying so. A new
 * client is not an error and must not be shown numbers that look measured.
 */
export async function readTheHistory(
  store: LocalStore,
  clientId: string,
  options: { readonly excludeSessionId?: string | null } = {},
): Promise<{
  readonly client_id: string;
  readonly window: { from: string | null; to: string | null; session_count: number };
  readonly performed: readonly Record<string, unknown>[];
}> {
  const exclude = options.excludeSessionId ?? null;
  const page = await performedForClient(store, clientId, {
    limit: HISTORY_RECORDS, direction: 'prev',
  }) as { items: readonly { content?: Record<string, unknown> }[] };

  const performed: Record<string, unknown>[] = [];
  const sessions = new Set<string>();
  let latest: string | null = null;
  let earliest: string | null = null;

  for (const record of page.items) {
    const content = record.content;
    if (!content) continue;
    const sessionId = typeof content.session_id === 'string' ? content.session_id : null;
    if (sessionId !== null && sessionId === exclude) continue;
    if (sessionId !== null && !sessions.has(sessionId)) {
      // The walk stops at the session that would be one too many, rather than part way through it: a
      // half-read session would make the ceiling depend on how the records happened to be paged.
      if (sessions.size >= HISTORY_SESSIONS) break;
      sessions.add(sessionId);
    }
    performed.push(content);
    const at = typeof content.recorded_at === 'string' ? content.recorded_at : null;
    if (at !== null) {
      if (latest === null || at > latest) latest = at;
      if (earliest === null || at < earliest) earliest = at;
    }
  }

  return {
    client_id: clientId,
    window: { from: earliest, to: latest, session_count: sessions.size },
    performed,
  };
}

/** Everything a curve needs, read once and kept while he presses one curve after another. */
export interface IntensityGround {
  readonly curves: Curves;
  readonly catalogue: Catalogue;
  /** The routine this session is running, as the live handle holds it. Null when it is gone. */
  readonly routine: Record<string, unknown> | null;
  /** Each attending client's name, for the per-person panels. */
  readonly clientNames: ReadonlyMap<string, string>;
}

/**
 * READ EVERYTHING A CURVE NEEDS, once.
 *
 * Read once rather than per press: the library and the curves do not change while he is mid-session,
 * and re-reading a hundred exercises on every button press would be a pause with a client waiting.
 * The HISTORY is deliberately NOT in here — it is read per press, per person, because it is the one
 * thing that changes while the session runs.
 */
export async function readTheGround(
  store: LocalStore,
  sessionId: string,
  clientNames: ReadonlyMap<string, string>,
): Promise<IntensityGround> {
  const [curves, catalogue] = await Promise.all([
    readTheCurves(store),
    readTheCatalogue(store),
  ]);
  const live = heldSession(store, sessionId) as { routine?: unknown } | null;
  const routine = (live?.routine as { content?: Record<string, unknown> } | null | undefined)
    ?.content ?? null;
  return { curves, catalogue, routine, clientNames };
}

/**
 * Read the ground and publish it, dropping a read that arrives after the caller has gone.
 *
 * A failure publishes NOTHING and is logged, the same rule every read in this family follows: an empty
 * ground would read as "your library holds no curves", which is a nought this application counts.
 *
 * @returns cancel
 */
export function readGroundInto(
  store: LocalStore,
  sessionId: string,
  clientNames: ReadonlyMap<string, string>,
  publish: (ground: IntensityGround) => void,
): () => void {
  let live = true;

  void readTheGround(store, sessionId, clientNames).then(
    (ground) => {
      if (live) publish(ground);
    },
    (error: unknown) => {
      console.error('[session] the intensity curves could not be read from the local store', error);
    },
  );

  return () => {
    live = false;
  };
}

/** What shaping a curve produced: the proposal, or the sentence saying why there is none. */
export interface ShapingResult {
  readonly proposal: RoomProposal | null;
  /** Why there is none. Null on success. */
  readonly refusal: ShapingRefusal | null;
}

/**
 * SHAPE ONE CURVE ACROSS THIS SESSION, FOR EVERYBODY IN THE ROOM.
 *
 * One `proposeSession` per attending client, each with that person's own history, and the rows checked
 * to agree — see {@link agreedRows}. Nothing is written and nothing could be: the adapter opens no
 * store and exports no verb that would apply what it returns.
 *
 * A refusal comes back as a VALUE, never as a throw at the screen. The adapter's own message goes in
 * the DETAIL and not the headline, and that is its own instruction rather than a preference:
 * `core/intensity/errors.js` says in as many words that its messages are written for the module that
 * called it and that the coach's own words live on the proposal. A sentence about a missing scaling
 * point is the right thing to show and the wrong thing to lead with, mid-session, with a client
 * waiting. It is still shown — a refusal nobody can describe is a refusal nobody can fix.
 */
export async function shapeTheCurve(
  store: LocalStore,
  sessionId: string,
  patternId: string,
  ground: IntensityGround,
  clientIds: readonly string[],
): Promise<ShapingResult> {
  const pattern = ground.curves.patterns.get(patternId) ?? null;
  if (pattern === null) {
    return {
      proposal: null,
      refusal: { headline: 'That curve is not in your library any more.', detail: null },
    };
  }
  if (ground.routine === null) {
    return {
      proposal: null,
      refusal: {
        headline: 'The routine this session was run from is not in your library any more, so a curve '
          + 'has nothing to shape. Everything already recorded is still here.',
        detail: null,
      },
    };
  }
  if (clientIds.length === 0) {
    return {
      proposal: null,
      refusal: {
        headline: 'Nobody is recorded as attending this session, so there is nobody to shape it for.',
        detail: null,
      },
    };
  }

  try {
    const shaped: { clientId: string; proposal: Record<string, any> }[] = [];
    for (const clientId of clientIds) {
      // eslint-disable-next-line no-await-in-loop
      const history = await readTheHistory(store, clientId, { excludeSessionId: sessionId });
      shaped.push({
        clientId,
        proposal: proposeSession({
          pattern,
          routine: ground.routine,
          catalogue: ground.catalogue.exercises,
          history,
          // AN ARGUMENT AND NEVER A RANDOM DRAW. The same request shapes the same session on every
          // device and in every run, which is what makes a proposal something he can talk about.
          variation: { rotate: 0 },
        }) as Record<string, any>,
      });
    }

    const rows = agreedRows(shaped.map((one) => one.proposal), ground);
    if (rows === null) {
      return {
        proposal: null,
        refusal: {
          headline: 'That curve placed the exercises differently for different people in this session, '
            + 'so there is no single order to show you. Nothing has been changed. Running one routine '
            + 'per person, in its own window, is the way to shape two different sessions.',
          detail: null,
        },
      };
    }

    const first = shaped[0].proposal;
    return {
      proposal: {
        patternId: String(first.pattern_id),
        patternName: String(first.pattern_name),
        standingWords: [...(first.notes as readonly string[])],
        curveWords: String(first.curve.note),
        shortfallWords: (first.shortfalls as readonly { note: string }[]).map((one) => one.note),
        rows,
        people: shaped.map(({ clientId, proposal }) => personProposal(clientId, proposal, ground)),
      },
      refusal: null,
    };
  } catch (error: unknown) {
    console.error('[session] that curve could not be shaped across this routine', error);
    return { proposal: null, refusal: { headline: COULD_NOT_SHAPE, detail: causeOf(error) } };
  }
}

// ── internals ───────────────────────────────────────────────────────────────────────────────────

/**
 * THE ONE ORDER, CHECKED RATHER THAN ASSUMED.
 *
 * `placeExercises` is handed the curve, the routine and the catalogue and no history, so every
 * person's proposal must place the same movement at the same position. This function verifies that
 * before showing one person's placement as the room's, and returns null when it does not hold. An
 * assumption about another module's behaviour, made silently at a seam, is exactly the class of defect
 * that neither module's own suite can see.
 */
export function agreedRows(
  proposals: readonly Record<string, any>[],
  ground: IntensityGround,
): readonly ProposedRow[] | null {
  const first = proposals[0];
  const shape = (proposal: Record<string, any>) => (proposal.positions as readonly Record<string, any>[])
    .map((position) => `${position.position}:${position.asked_for_level}:${position.exercise_id}:`
      + `${position.substituted_for_exercise_id ?? ''}`)
    .join('|');
  const agreed = shape(first);
  for (const proposal of proposals.slice(1)) {
    if (shape(proposal) !== agreed) return null;
  }

  return (first.positions as readonly Record<string, any>[]).map((position) => ({
    position: Number(position.position),
    askedForLevel: String(position.asked_for_level),
    exerciseId: String(position.exercise_id),
    exerciseName: nameOf(String(position.exercise_id), position.exercise_name, ground),
    fromLibrary: position.source === 'catalogue-substitute',
    // The ROUTINE'S OWN LINE this position sits on, which is the line a move is recorded against. A
    // substitute is placed in the stead of one of the routine's leftover exercises, and the projection
    // attaches an attempt to the line it replaced rather than letting it appear as a line of its own.
    lineExerciseId: String(position.substituted_for_exercise_id ?? position.exercise_id),
    standsInForName: position.substituted_for_exercise_id === null
      || position.substituted_for_exercise_id === undefined
      ? null
      : nameOf(
        String(position.substituted_for_exercise_id),
        position.substituted_for_exercise_name,
        ground,
      ),
    substitutionWords: position.substitution_note ?? null,
    shortfallWords: position.shortfall === null || position.shortfall === undefined
      ? null
      : String(position.shortfall.note),
  }));
}

/** One person's calibration and their own numbers at every position. */
function personProposal(
  clientId: string,
  proposal: Record<string, any>,
  ground: IntensityGround,
): PersonProposal {
  return {
    clientId,
    name: ground.clientNames.get(clientId) ?? 'Somebody on this device',
    calibrated: proposal.baseline.kind === 'measured',
    baselineWords: String(proposal.baseline.note),
    efforts: (proposal.positions as readonly Record<string, any>[]).map(effortOf),
  };
}

/** One position's numbers, and the sentences saying where they came from. */
function effortOf(position: Record<string, any>): ProposedEffort {
  return {
    measurement: String(position.measurement),
    sets: Number(position.sets),
    repetitions: position.repetitions === null || position.repetitions === undefined
      ? null : Number(position.repetitions),
    durationSeconds: position.duration_seconds === null || position.duration_seconds === undefined
      ? null : Number(position.duration_seconds),
    restSeconds: Number(position.rest_seconds),
    referenceWords: String(position.reference.note),
    referenceSource: String(position.reference.source),
    heldBackWords: position.clamp_note ?? null,
  };
}

/**
 * An exercise's name: the adapter's, the library's, or the content key as it stands.
 *
 * The adapter is handed the catalogue and names every exercise it placed, so its own name is the first
 * answer. The key is shown as it stands where there is none, rather than replaced with an invented
 * name — `runner-source.ts` settled that for the session's own lines and the reasoning is identical.
 */
function nameOf(exerciseId: string, given: unknown, ground: IntensityGround): string {
  if (typeof given === 'string' && given.length > 0) return given;
  for (const exercise of ground.catalogue.exercises) {
    if (exercise.id === exerciseId && typeof exercise.name === 'string' && exercise.name.length > 0) {
      return exercise.name as string;
    }
  }
  return exerciseId;
}

/**
 * THE CAUSE, shown under the headline rather than as it.
 *
 * An `IntensityInputError` names what was actually wrong — a routine with no exercises, an exercise
 * whose library entry has lost the scaling point a curve asked it for — and that is worth putting in
 * front of him even though it is not written for him: it is the difference between a curve he can fix
 * and one that mysteriously does not work. Anything else is a defect rather than a refusal, and its
 * name and message are the two things that make it reportable; the whole error is already on the
 * console with its stack.
 */
function causeOf(error: unknown): string | null {
  if (!(error instanceof Error) || error.message.length === 0) return null;
  return error.name === 'IntensityInputError'
    ? error.message
    : `${error.name}: ${error.message}`;
}
