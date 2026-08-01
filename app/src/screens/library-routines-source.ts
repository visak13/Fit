/**
 * WHERE THE ROUTINE EDITOR'S FACTS COME FROM — every read and every write, extracted from the screen.
 *
 * It copies `library-editor-source.ts` rather than inventing a shape: the store comes from
 * `platform/LocalStore.tsx`, which is the source the five reporting seams in `main.tsx` are
 * themselves fed from and NOT a sixth one, and every read and write is a plain function taking a
 * store so it can be driven in a test against a REAL store on the core's own platform double.
 *
 * ## THE ROUTINE VALIDATOR IS NOT ENOUGH ON ITS OWN, AND THAT IS WHY THIS FILE CALLS A SECOND ONE
 *
 * `store.create` and `store.update` run `entities/routine.js`, which validates a routine ALONE: the
 * field list, the name format, the split-day range, the vocabularies, at least one entry, the ranges
 * on every override, and the rule that an entry overrides repetitions OR duration and never both.
 *
 * What it CANNOT check is the two things that need the exercise library — that every exercise a
 * routine names exists, and that an override agrees with that exercise's `measurement`. Those live
 * in `core/model/referential.js`, which is the model's own module for exactly this, and the store has
 * no way to run it because it validates one record at a time.
 *
 * So {@link checkAgainstTheLibrary} CALLS `checkRoutineReferences` — the core's function, against the
 * catalogue read off this very store — and throws the store's OWN `StoreValidationError` carrying its
 * issues unchanged. Nothing about the rule is restated here: this file supplies the second argument
 * the core has always needed and carries the answer through. A dangling entry is the one failure that
 * surfaces as a broken row in front of a client rather than as an error the coach can act on, so it
 * is refused before the write rather than reported after it.
 *
 * ## PROVENANCE AND DELETION ARE THE CORE'S RULES, CALLED RATHER THAN COPIED
 *
 * `markEdited` from `core/seed/provenance.js`, computed INSIDE the transaction from what is actually
 * on disk; and `store.tombstone`, never a row removal, so a deletion propagates instead of returning
 * from the remote copy at the next sync. Both for the reasons the exercise half's header sets out.
 *
 * ## THE ONE QUESTION THE CORE CANNOT ANSWER FROM A SINGLE RECORD
 *
 * {@link sessionsUsing}. `referential.js` enforces `session.routine_id -> routine.id`, so a routine
 * some session has already run may not be removed without leaving that session pointing at nothing.
 * The answer is MEASURED off the store, over the sessions' own `by_routine` index, and it walks EVERY
 * page rather than the first — a first-page-only answer would say "nothing has run it" about a
 * session that happened to sort late, and the removal that followed would break a history that
 * cannot be rebuilt.
 */

import { libraryPage } from '../../core/store/store.js';
import { StoreValidationError } from '../../core/store/store.js';
import { RECORD_STORES } from '../../core/store/store.js';
import { markEdited } from '../../core/seed/provenance.js';
import { checkRoutineReferences } from '../../core/model/model.js';
import type { LocalStore } from '../../core/store/store.js';
import { readAll } from './client-report-source';
import { exerciseChoices, matchesRoutineSearch } from './library-routines';
import type { ExerciseChoices, RoutinePage, RoutineRecord } from './library-routines';
import type { ExerciseRecord } from './library-editor';

/** The kind names the store holds these under. The core's own vocabulary values. */
const ROUTINE = 'routine';
const EXERCISE = 'exercise';
const SESSION = 'session';

/** How many routines are read in one page. A weekly split is six to eight; this holds several weeks. */
export const ROUTINE_PAGE_LIMIT = 25;

/**
 * How much of the exercise catalogue one read takes, and the ceiling that read will not pass.
 *
 * The WHOLE catalogue is what an entry row needs, because a routine may name any exercise in the
 * library — including the ones no routine currently references, which `referential.js` protects as
 * the substitution pool. So this pages to the end, and the ceiling is a guard against a pathological
 * library rather than a page size. The shipped catalogue is 99.
 */
export const CATALOGUE_PAGE = 200;
export const CATALOGUE_CEILING = 4000;

/**
 * How many sessions are read at a time when asking what has run a routine.
 *
 * Exported so the suite can build a case that genuinely SPANS more than one page — derived from
 * this number rather than from a count typed beside it, which is the only way the paging loop below
 * is actually exercised instead of merely being present.
 */
export const SESSION_PAGE_LIMIT = 25;

/** What a read of the routine library was asked for. */
export interface RoutineQuery {
  readonly search: string;
  readonly after: string | null;
}

/** The first page, unfiltered. */
export const FIRST_ROUTINE_PAGE: RoutineQuery = Object.freeze({ search: '', after: null });

/**
 * One page of the routine library, filtered by whatever he typed.
 *
 * THIS IS THE PAGING PRIMITIVE AND ITS FILTER IS PAGE-SCOPED, which is correct for what it is used
 * for: reading the NEXT page of an unfiltered list when he presses "show more". It is NOT what the
 * screen searches with. The search goes through {@link readRoutineReadout}, which filters over the
 * COLLECTION — see that function for why the difference is not a preference. The cursor is carried
 * through untouched, so the screen goes on saying there are more than these until the library
 * genuinely ends.
 */
export async function readRoutinePage(
  store: LocalStore,
  query: RoutineQuery = FIRST_ROUTINE_PAGE,
): Promise<RoutinePage> {
  const page = await libraryPage(store, ROUTINE, {
    limit: ROUTINE_PAGE_LIMIT,
    after: query.after,
  }) as RoutinePage;

  return {
    items: page.items.filter((record) => matchesRoutineSearch(record, query.search)),
    cursor: page.cursor,
    done: page.done,
  };
}

/** A page of records as the walker consumes them. The core's own page shape, named locally. */
interface WalkedPage {
  items: unknown[];
  cursor: string | null;
  done: boolean;
}

/**
 * Said when the routine library could not be walked to its end, so nothing may be concluded from it.
 *
 * Never shown to the coach. It reaches the console through {@link readRoutines}' failure arm, which
 * publishes NOTHING — because the two things a partial walk would otherwise produce are "no routine
 * matches" and a total that is short, and both are the reassuring answer arrived at by not having
 * looked.
 */
export const ROUTINE_WALK_INCOMPLETE =
  'the routine library could not be walked to its end, so neither the total nor a search over it '
  + 'can be trusted';

/**
 * EVERY ROUTINE IN THE LIBRARY, WALKED TO THE END.
 *
 * `readAll` is the house walker and it is reused rather than copied: it carries the page bound and
 * the non-advancing-cursor guard, and it REPORTS whether the end was actually reached instead of
 * returning a short list that looks complete. It is the same walker {@link sessionsUsing} reaches
 * for the same reason — a first-page answer about a collection is an answer about the page.
 */
async function walkRoutines(store: LocalStore): Promise<readonly RoutineRecord[]> {
  const read = await readAll((after) => libraryPage(store, ROUTINE, {
    limit: ROUTINE_PAGE_LIMIT,
    after,
  }) as Promise<WalkedPage>);

  if (!read.complete) throw new Error(ROUTINE_WALK_INCOMPLETE);
  return read.items as readonly RoutineRecord[];
}

/** What one read of the routine library told the screen. */
export interface RoutineReadout {
  /** What to draw. Searching, this is every match in the collection; otherwise the first page. */
  readonly page: RoutinePage;
  /**
   * How many routines THE COLLECTION holds. Never the length of {@link page}.
   *
   * Measured by walking, because the store has no count API — the same reason
   * {@link sessionsUsing} walks rather than asks.
   */
  readonly total: number;
}

/**
 * WHAT THE SCREEN READS: the list to draw, and how big the routine library actually is.
 *
 * ## THE FILTER RUNS OVER THE COLLECTION, NOT OVER THE PAGE
 *
 * A search bound to the first page tells the coach a routine is ABSENT while the uniqueness guard on
 * the very same screen refuses to let him create it because it is PRESENT. Both halves are
 * individually correct, neither reports a fault, and he is left holding two contradictory statements
 * and nothing to search for. Seven routines ship, so both halves are correct TODAY and go wrong the
 * moment he authors his twenty-sixth — which is the app working exactly as it is meant to be used.
 *
 * A search result is therefore UNPAGED — every match, `done`, no cursor — and that is a bound worth
 * saying out loud rather than a claim that the library cannot outgrow it: the walk stops at
 * `readAll`'s page bound and a walk that stopped short is a failure here, not a short list.
 *
 * ## THE UNFILTERED LIST STILL PAGES, EXACTLY AS IT DID
 *
 * Nothing about "show more" moves. Only the SEARCH path goes collection-wide, and only the COUNT
 * stops being the page's length.
 */
export async function readRoutineReadout(
  store: LocalStore,
  search: string,
): Promise<RoutineReadout> {
  const all = await walkRoutines(store);

  if (search.trim().length === 0) {
    return { page: await readRoutinePage(store, FIRST_ROUTINE_PAGE), total: all.length };
  }

  return {
    page: {
      items: all.filter((record) => matchesRoutineSearch(record, search)),
      cursor: null,
      done: true,
    },
    total: all.length,
  };
}

/**
 * Read the routine library and publish it, dropping a reading that arrives after the caller has gone.
 *
 * A failure is reported to the console and NOTHING is published — an empty page says "there are no
 * routines in your library", and publishing that after a failed read would tell a coach with a full
 * week of them that he has none: the reassuring answer, arrived at by not having looked.
 *
 * @returns cancel
 */
export function readRoutines(
  store: LocalStore,
  search: string,
  publish: (readout: RoutineReadout) => void,
): () => void {
  let live = true;

  void readRoutineReadout(store, search).then(
    (readout) => {
      if (live) publish(readout);
    },
    (error: unknown) => {
      console.error('[library] the routine library could not be read from the local store', error);
    },
  );

  return () => {
    live = false;
  };
}

/** The next page joined onto the one already on screen. */
export function appendRoutinePage(held: RoutinePage, next: RoutinePage): RoutinePage {
  return { items: [...held.items, ...next.items], cursor: next.cursor, done: next.done };
}

/**
 * THE WHOLE EXERCISE CATALOGUE, PAGED TO THE END, PRUNING NOTHING.
 *
 * An entry row must be able to name any exercise he has, and `referential.js` is explicit that an
 * exercise no routine references is a NORMAL state and is the substitution pool — filtering it out
 * here would hide from the routine form precisely the exercises he reaches for when adapting.
 *
 * `whole` says plainly when the read stopped short, and the screen says so rather than presenting a
 * partial catalogue as the whole of it.
 */
export async function readExerciseChoices(store: LocalStore): Promise<ExerciseChoices> {
  const exercises: Record<string, unknown>[] = [];
  let after: string | null = null;
  let whole = false;

  while (exercises.length < CATALOGUE_CEILING) {
    // eslint-disable-next-line no-await-in-loop
    const page = await libraryPage(store, EXERCISE, { limit: CATALOGUE_PAGE, after }) as {
      items: readonly { content?: Record<string, unknown> }[];
      cursor: string | null;
      done: boolean;
    };
    for (const record of page.items) {
      if (record.content && typeof record.content.id === 'string') exercises.push(record.content);
    }
    if (page.done || page.cursor === null) {
      whole = true;
      break;
    }
    after = page.cursor;
  }

  return exerciseChoices(exercises, whole);
}

/**
 * ONE EXERCISE, BY THE KEY A ROUTINE ENTRY NAMES IT BY — the reachability hop.
 *
 * This is what lets an entry row OPEN the exercise editor on the exercise it points at, instead of
 * the routine form restating that exercise's three intensity points. `store.getByContentKey` is the
 * model's own rule that library content is addressed by content key, applied rather than re-derived.
 *
 * `undefined` when there is no such exercise, which the screen says rather than opening an empty
 * form: a form seeded from nothing would offer to save an exercise he never asked for.
 */
export async function readExerciseByKey(
  store: LocalStore,
  contentKey: string,
): Promise<ExerciseRecord | undefined> {
  return (await store.getByContentKey(EXERCISE, contentKey)) as ExerciseRecord | undefined;
}

/**
 * THE SECOND VALIDATOR — the core's, given the argument only a caller with a store can supply.
 *
 * Throws the store's own `StoreValidationError` so that a referential refusal arrives at the screen
 * in exactly the shape a record's own refusal does, and `describeRoutineRefusal` needs no second
 * branch to show it. The issues are the core's, unchanged.
 */
export async function checkAgainstTheLibrary(
  store: LocalStore,
  content: Record<string, unknown>,
): Promise<void> {
  const choices = await readExerciseChoices(store);
  const exercises = choices.all.map((choice) => ({
    id: choice.contentKey,
    measurement: choice.measurement,
  }));

  const result = checkRoutineReferences([content], exercises) as {
    ok: boolean;
    issues: { path: string; code: string; message: string }[];
  };
  if (!result.ok) {
    throw new StoreValidationError(
      'This routine names an exercise that does not fit it.',
      result.issues,
    );
  }
}

/**
 * Add a routine, and resolve only once the write has COMMITTED.
 *
 * The library check runs FIRST, so a routine naming an exercise that is not there is refused before
 * anything is written rather than committed and discovered mid-session.
 *
 * THE PROVENANCE COMES FROM THE CORE. A new routine is his, so `markEdited` over content carrying
 * none returns `coach-created` — the value the admin reset reads to leave it alone.
 */
export async function addRoutine(
  store: LocalStore,
  content: Record<string, unknown>,
): Promise<RoutineRecord> {
  await checkAgainstTheLibrary(store, content);
  return (await store.create(ROUTINE, markEdited(content))) as RoutineRecord;
}

/**
 * Save changes to a routine, and resolve only once the write has COMMITTED.
 *
 * `produce` runs INSIDE the transaction, after the current revision has been read, so the provenance
 * is computed from what is ACTUALLY STORED rather than from whatever the screen last saw.
 * `expectRev` makes the write conditional on the revision he was shown, so a second laptop window
 * gets a refusal it can act on rather than work that vanished.
 */
export async function saveRoutine(
  store: LocalStore,
  recordId: string,
  content: Record<string, unknown>,
  expectRev: number,
): Promise<RoutineRecord> {
  await checkAgainstTheLibrary(store, content);
  return (await store.update(
    ROUTINE,
    recordId,
    (current: Record<string, unknown>) => ({
      ...content,
      provenance: markEdited(current).provenance,
    }),
    { expectRev },
  )) as RoutineRecord;
}

/**
 * WHICH SESSIONS HAVE ALREADY RUN THIS ROUTINE — every page of them, named so he can find them.
 *
 * Answered over the sessions' own `by_routine` index rather than by reading every session, and the
 * walk continues to the end: the whole point of asking is that the answer must be COMPLETE, because
 * a partial "nothing has run it" would be followed by a removal that leaves a real session pointing
 * at a routine which is not there.
 *
 * A session is named by WHEN it was, because that is how he would recognise one — a record identity
 * is machinery he has never seen.
 */
export async function sessionsUsing(store: LocalStore, contentKey: string): Promise<string[]> {
  const name = RECORD_STORES[SESSION];
  const names: string[] = [];
  let after: string | null = null;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const page = await store.read(name, (scope) => scope.page({
      store: name,
      index: 'by_routine',
      range: scope.KeyRange.only(contentKey),
      limit: SESSION_PAGE_LIMIT,
      after,
      where: (record: { deleted?: boolean }) => !record.deleted,
    })) as {
      items: { content?: Record<string, unknown> }[];
      cursor: string | null;
      done: boolean;
    };

    for (const session of page.items) {
      names.push(sessionWords(session.content ?? {}));
    }

    if (page.done || page.cursor === null) return names;
    after = page.cursor;
  }
}

/**
 * ONE SESSION, AS HE WOULD RECOGNISE IT.
 *
 * When it ran if it ran, when it was scheduled for otherwise, and what became of it. A session with
 * neither instant is said as one rather than shown as a blank line, because a blank row in a list of
 * reasons he cannot delete something is a reason he cannot check.
 */
export function sessionWords(content: Record<string, unknown>): string {
  const at = typeof content.started_at === 'string' && content.started_at.length > 0
    ? content.started_at
    : (typeof content.scheduled_at === 'string' ? content.scheduled_at : '');
  const status = typeof content.status === 'string' ? content.status.replace(/_/gu, ' ') : 'recorded';
  if (at.length === 0) return `A session with no date on it (${status})`;
  return `${at.slice(0, 10)} (${status})`;
}

/**
 * Remove a routine from this device, as a tombstone.
 *
 * IT IS NOT GUARDED HERE, and that is deliberate. {@link sessionsUsing} is asked BEFORE the
 * confirmation is drawn, so the coach is told what has run it instead of pressing a button that
 * refuses — and the screen never offers the confirming control when the answer is not empty. A
 * second check in front of the write would be a rule in two places, and the one here would be the
 * copy.
 */
export async function removeRoutine(
  store: LocalStore,
  recordId: string,
  expectRev: number,
): Promise<void> {
  await store.tombstone(ROUTINE, recordId, { expectRev });
}
