/**
 * WHERE THE LIBRARY EDITOR'S FACTS COME FROM — every read and every write, extracted from the screen.
 *
 * This is the second read-write surface in the application, and it copies the first rather than
 * inventing a shape: `client-register-source.ts` holds the argument in full, and the short version
 * is that the five reporting seams in `main.tsx` each carry a frozen READING with nothing callable
 * on it, and a surface whose form calls a create and whose list must re-read afterwards cannot be
 * one of them. So the library editor takes the STORE, from `platform/LocalStore.tsx`, which is the
 * source those seams are fed from and NOT a sixth one. `shell/seams.test.ts` is untouched.
 *
 * The reads and the writes are plain functions taking a store, so they are driven in a test against
 * a REAL store on the core's own platform double. A static render never runs an effect, so logic
 * living inside a component is logic nothing can check.
 *
 * ## NOTHING HERE VALIDATES AN EXERCISE
 *
 * `core/model/entities/exercise.js` is the schema and it is sealed — including `R6`, the content
 * contract that a harder intensity point asks for more work and less rest. `store.create` and
 * `store.update` run it on the way in. This file offers the content and lets the record answer, for
 * the same reason the register does: a check here would be a second copy that drifts, and the drift
 * would be silent.
 *
 * ## THE ONE RULE THIS FILE DOES APPLY IS NOT ITS OWN
 *
 * Provenance. `core/seed/provenance.js` owns it and says in as many words that the library editing
 * screen must call `markEdited` rather than assigning a value itself, because a screen that forgets
 * leaves a record claiming to be untouched while showing the coach's changes — and the next admin
 * reset silently reverts work he was never warned about. So {@link saveExercise} calls the core's
 * function and NO provenance string is written anywhere in the interface.
 *
 * ## DELETION IS A TOMBSTONE AND IT IS GUARDED IN ONE DIRECTION
 *
 * `store.tombstone` is the ordinary deletion, and it is a WRITE rather than an absence: a row simply
 * removed here would come back from the remote copy at the next sync. That is the core's rule and it
 * is why nothing in this file removes a row.
 *
 * What this file adds is the one question the core cannot answer from a single record:
 * {@link routinesUsing}. `core/model/referential.js` states the invariant in one direction — every
 * exercise a routine names must exist, and never the reverse — so an exercise nothing points at is
 * an ordinary member of the substitution pool and an exercise a routine IS using may not be removed
 * without leaving that routine pointing at nothing. The answer is MEASURED off the store rather than
 * assumed, and it walks every page of the routines rather than the first, because a first-page-only
 * answer would say "nothing is using it" about a routine that happened to sort late.
 */

import { libraryPage } from '../../core/store/store.js';
import { markEdited } from '../../core/seed/provenance.js';
import { referencedExerciseKeys } from '../../core/model/model.js';
import type { LocalStore } from '../../core/store/store.js';
import { readAll } from './client-report-source';
import { matchesSearch } from './library-editor';
import type { ExerciseRecord, LibraryPage } from './library-editor';

/** The kind name the store holds an exercise under. The core's own vocabulary value. */
const EXERCISE = 'exercise';
/** And a routine's, which is read only to answer what is still using an exercise. */
const ROUTINE = 'routine';

/**
 * How many exercises are read in one page.
 *
 * The core's own default is 25 and the shipped catalogue is 99, so the screen tells him "there are
 * more than these" off the back of a real cursor rather than loading the library to count it. That
 * matters more here than on the register: the catalogue is deliberately larger than the shipped week
 * because the surplus IS the substitution pool, and it only grows.
 */
export const LIBRARY_PAGE_LIMIT = 25;

/** What a read of the library was asked for. */
export interface LibraryQuery {
  /** What he typed into the filter box. Applied to the page that was read, never to the query. */
  readonly search: string;
  /** The cursor from the previous page, or null for the first. */
  readonly after: string | null;
}

/** The first page, unfiltered. One value so the screen's initial state is not a literal. */
export const FIRST_PAGE: LibraryQuery = Object.freeze({ search: '', after: null });

/**
 * One page of the exercise library, filtered by whatever he typed.
 *
 * THIS IS THE PAGING PRIMITIVE AND ITS FILTER IS PAGE-SCOPED, which is correct for what it is used
 * for: reading the NEXT page of an unfiltered list when he presses "show more". It is NOT what the
 * screen searches with. The search goes through {@link readLibraryReadout}, which filters over the
 * COLLECTION — see that function for why the difference is not a preference.
 */
export async function readLibraryPage(
  store: LocalStore,
  query: LibraryQuery = FIRST_PAGE,
): Promise<LibraryPage> {
  const page = await libraryPage(store, EXERCISE, {
    limit: LIBRARY_PAGE_LIMIT,
    after: query.after,
  });

  return {
    items: (page.items as ExerciseRecord[]).filter((record) => matchesSearch(record, query.search)),
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
 * Said when the library could not be walked to its end, so nothing may be concluded from it.
 *
 * Never shown to the coach. It reaches the console through {@link readLibrary}'s failure arm, which
 * publishes NOTHING — because the two things a partial walk would otherwise produce are "nothing in
 * your library matches" and a total that is short, and both are the reassuring answer arrived at by
 * not having looked.
 */
export const LIBRARY_WALK_INCOMPLETE =
  'the exercise library could not be walked to its end, so neither the total nor a search over it '
  + 'can be trusted';

/**
 * EVERY EXERCISE IN THE LIBRARY, WALKED TO THE END.
 *
 * `readAll` is the house walker and it is reused rather than copied: it carries the page bound and
 * the non-advancing-cursor guard, and it REPORTS whether the end was actually reached instead of
 * returning a short list that looks complete.
 */
async function walkLibrary(store: LocalStore): Promise<readonly ExerciseRecord[]> {
  const read = await readAll((after) => libraryPage(store, EXERCISE, {
    limit: LIBRARY_PAGE_LIMIT,
    after,
  }) as Promise<WalkedPage>);

  if (!read.complete) throw new Error(LIBRARY_WALK_INCOMPLETE);
  return read.items as ExerciseRecord[];
}

/** What one read of the library told the screen. */
export interface LibraryReadout {
  /** What to draw. Searching, this is every match in the collection; otherwise the first page. */
  readonly page: LibraryPage;
  /**
   * How many exercises THE COLLECTION holds. Never the length of {@link page}.
   *
   * Measured by walking, because the store has no count API — the same reason
   * {@link routinesUsing} walks rather than asks.
   */
  readonly total: number;
}

/**
 * WHAT THE SCREEN READS: the list to draw, and how big the library actually is.
 *
 * ## THE FILTER RUNS OVER THE COLLECTION, NOT OVER THE PAGE
 *
 * A search bound to the first page tells the coach an exercise is ABSENT while the uniqueness guard
 * on the very same screen refuses to let him create it because it is PRESENT. Both halves are
 * individually correct, neither reports a fault, and he is left holding two contradictory statements
 * and nothing to search for. That is why this walks: the store pages on the content-key index and has
 * no index on a substring, so a collection-wide answer has to be measured rather than queried.
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
export async function readLibraryReadout(
  store: LocalStore,
  search: string,
): Promise<LibraryReadout> {
  const all = await walkLibrary(store);

  if (search.trim().length === 0) {
    return { page: await readLibraryPage(store, FIRST_PAGE), total: all.length };
  }

  return {
    page: {
      items: all.filter((record) => matchesSearch(record, search)),
      cursor: null,
      done: true,
    },
    total: all.length,
  };
}

/**
 * Read the library and publish it, dropping a reading that arrives after the caller has gone.
 *
 * A failure is reported to the console and NOTHING is published, for the same reason the register
 * does it: an empty page says "there are no exercises in your library", and publishing that after a
 * failed read would tell a coach with ninety-nine of them that he has none — the reassuring answer,
 * arrived at by not having looked. The screen guards on the store's own state instead.
 *
 * @returns cancel
 */
export function readLibrary(
  store: LocalStore,
  search: string,
  publish: (readout: LibraryReadout) => void,
): () => void {
  let live = true;

  void readLibraryReadout(store, search).then(
    (readout) => {
      if (live) publish(readout);
    },
    (error: unknown) => {
      console.error('[library] the exercise library could not be read from the local store', error);
    },
  );

  return () => {
    live = false;
  };
}

/**
 * The next page joined onto the one already on screen.
 *
 * A pure function rather than a merge written inside the component, because it is the one place a
 * page can be LOST: keeping the older cursor would ask for the same page for ever, and keeping the
 * older `done` would either hide the rest of the catalogue or claim there is more when there is not.
 */
export function appendPage(held: LibraryPage, next: LibraryPage): LibraryPage {
  return {
    items: [...held.items, ...next.items],
    cursor: next.cursor,
    done: next.done,
  };
}

/**
 * Add an exercise, and resolve only once the write has COMMITTED.
 *
 * `store.create` does not resolve before the transaction completed, and a failure throws rather than
 * returning a status — so nothing may be reported to the coach as saved until this resolves. What it
 * throws on a refused draft is the record's own `StoreValidationError`, issues intact, and on a
 * duplicate content key a `StoreConflictError`; `describeExerciseRefusal` puts labels in front of
 * the first and shows the second's own sentence.
 *
 * THE PROVENANCE COMES FROM THE CORE. A new exercise is his, so `markEdited` over content carrying
 * none returns `coach-created` — which is the value the admin reset reads to leave it alone. This
 * function does not name that value and must not: see the header.
 */
export async function addExercise(
  store: LocalStore,
  content: Record<string, unknown>,
): Promise<ExerciseRecord> {
  return (await store.create(EXERCISE, markEdited(content))) as ExerciseRecord;
}

/**
 * Save changes to an exercise, and resolve only once the write has COMMITTED.
 *
 * `produce` runs INSIDE the transaction, after the current revision has been read, so the provenance
 * is computed from what is ACTUALLY STORED rather than from whatever the screen last saw. That is
 * the difference between a shipped exercise correctly becoming `shipped-edited` and one that a
 * second window had already edited being quietly re-marked from a stale reading.
 *
 * `expectRev` makes the write conditional on the revision he was shown. Two laptop windows editing
 * one exercise is a case this build supports, and the second gets a `StoreConflictError` rather than
 * silently winning — which is a refusal he can act on rather than work that vanished.
 */
export async function saveExercise(
  store: LocalStore,
  recordId: string,
  content: Record<string, unknown>,
  expectRev: number,
): Promise<ExerciseRecord> {
  return (await store.update(
    EXERCISE,
    recordId,
    (current: Record<string, unknown>) => ({
      ...content,
      // The ONE rule from the core, applied to the provenance that is actually on disk: a shipped
      // exercise becomes `shipped-edited` so a later reset can offer to put it back, and one of his
      // own stays his.
      provenance: markEdited(current).provenance,
    }),
    { expectRev },
  )) as ExerciseRecord;
}

/**
 * WHICH ROUTINES STILL NAME THIS EXERCISE — every page of them, by name.
 *
 * The whole point of asking is that the answer must be COMPLETE. A partial read would answer
 * "nothing is using it" for a routine that happened to sort past the first page, and the removal
 * that followed would leave that routine pointing at an exercise which is not there — a state
 * `core/model/referential.js` names as the one direction that must always hold, and which would
 * surface as a session failing in front of a client rather than as an error here.
 *
 * The keys each routine names are read with the core's own `referencedExerciseKeys`, so there is no
 * second idea in the interface of what "a routine uses an exercise" means.
 */
export async function routinesUsing(store: LocalStore, contentKey: string): Promise<string[]> {
  const names: string[] = [];
  let after: string | null = null;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const page = await libraryPage(store, ROUTINE, { limit: LIBRARY_PAGE_LIMIT, after });

    for (const routine of page.items as { content: Record<string, unknown> }[]) {
      if (referencedExerciseKeys([routine.content]).has(contentKey)) {
        const name = routine.content.name;
        names.push(typeof name === 'string' && name.length > 0 ? name : String(routine.content.id));
      }
    }

    if (page.done || page.cursor === null) return names;
    after = page.cursor;
  }
}

/**
 * Remove an exercise from this device, as a tombstone.
 *
 * IT IS NOT GUARDED HERE, and that is deliberate rather than an omission. {@link routinesUsing} is
 * asked BEFORE the confirmation is drawn, so the coach is told what is using it instead of pressing
 * a button that refuses — and the screen never offers the confirming control when the answer is not
 * empty. Putting a second check in front of the write would be a rule in two places, and the one
 * here would be the copy: the store is what actually commits, and it has no opinion about routines.
 *
 * A failure throws with the core's own error, and the screen shows what was thrown rather than a
 * sentence of its own.
 */
export async function removeExercise(
  store: LocalStore,
  recordId: string,
  expectRev: number,
): Promise<void> {
  await store.tombstone(EXERCISE, recordId, { expectRev });
}
