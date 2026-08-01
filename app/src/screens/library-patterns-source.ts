/**
 * WHERE THE CURVE EDITOR'S FACTS COME FROM — every read and every write, extracted from the screen.
 *
 * The third read-write surface over the library, and it copies the first two rather than inventing a
 * shape. Plain functions taking a store, so they are driven in a test against a REAL store on the
 * core's own platform double.
 *
 * ## NOTHING HERE VALIDATES A CURVE
 *
 * `core/model/entities/intensity-pattern.js` is the schema and it is sealed — including `R11`, that a
 * name spelling out a curve must match the sequence. `store.create` and `store.update` run it on the
 * way in. This file offers the content and lets the record answer.
 *
 * And there is no SECOND validator to call here, unlike the routine half: nothing about a pattern
 * depends on another record. It names levels from the model's own vocabulary and a mapping rule from
 * the model's own vocabulary, and both are closed sets the record checks itself. See
 * `library-patterns.ts`'s header for why the more-work-less-rest contract has no check on this
 * record and must not be given one here.
 *
 * ## PROVENANCE AND DELETION ARE THE CORE'S RULES, CALLED RATHER THAN COPIED
 *
 * `markEdited`, computed inside the transaction from what is actually on disk; `store.tombstone`,
 * never a row removal, so the deletion propagates instead of returning from the remote copy.
 */

import { libraryPage } from '../../core/store/store.js';
import { markEdited } from '../../core/seed/provenance.js';
import type { LocalStore } from '../../core/store/store.js';
import { readAll } from './client-report-source';
import { matchesPatternSearch } from './library-patterns';
import type { PatternPage, PatternRecord } from './library-patterns';

/** The kind name the store holds a curve under. The core's own vocabulary value. */
const PATTERN = 'intensity-pattern';

/**
 * How many curves are read in one page.
 *
 * Seven ship and a coach is unlikely to author dozens, but the page is a real page with a real
 * cursor rather than a read of everything: the screen must not start claiming to show all of them
 * because it happened to be true on the shipped set.
 */
export const PATTERN_PAGE_LIMIT = 25;

/** How many curves are counted at a time when answering how many would be left. */
const COUNT_PAGE = 200;

/** What a read of the curves was asked for. */
export interface PatternQuery {
  readonly search: string;
  readonly after: string | null;
}

/** The first page, unfiltered. */
export const FIRST_PATTERN_PAGE: PatternQuery = Object.freeze({ search: '', after: null });

/**
 * One page of the curves, filtered by whatever he typed.
 *
 * THIS IS THE PAGING PRIMITIVE AND ITS FILTER IS PAGE-SCOPED, which is correct for what it is used
 * for: reading the NEXT page of an unfiltered list when he presses "show more". It is NOT what the
 * screen searches with. The search goes through {@link readPatternReadout}, which filters over the
 * COLLECTION — see that function for why the difference is not a preference.
 */
export async function readPatternPage(
  store: LocalStore,
  query: PatternQuery = FIRST_PATTERN_PAGE,
): Promise<PatternPage> {
  const page = await libraryPage(store, PATTERN, {
    limit: PATTERN_PAGE_LIMIT,
    after: query.after,
  }) as PatternPage;

  return {
    items: page.items.filter((record) => matchesPatternSearch(record, query.search)),
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
 * Said when the curves could not be walked to their end, so nothing may be concluded from them.
 *
 * Never shown to the coach. It reaches the console through {@link readPatterns}' failure arm, which
 * publishes NOTHING — because the two things a partial walk would otherwise produce are "no curve
 * matches" and a total that is short, and both are the reassuring answer arrived at by not having
 * looked.
 */
export const PATTERN_WALK_INCOMPLETE =
  'the intensity curves could not be walked to their end, so neither the total nor a search over '
  + 'them can be trusted';

/**
 * EVERY CURVE IN THE LIBRARY, WALKED TO THE END.
 *
 * `readAll` is the house walker and it is reused rather than copied: it carries the page bound and
 * the non-advancing-cursor guard, and it REPORTS whether the end was actually reached instead of
 * returning a short list that looks complete. {@link countPatterns} is left alone: it answers a
 * different question — how many would be LEFT after a removal — and it cannot answer this one,
 * because a search needs the records themselves and one walk that serves both cannot disagree with
 * itself about how big the library is.
 */
async function walkPatterns(store: LocalStore): Promise<readonly PatternRecord[]> {
  const read = await readAll((after) => libraryPage(store, PATTERN, {
    limit: PATTERN_PAGE_LIMIT,
    after,
  }) as Promise<WalkedPage>);

  if (!read.complete) throw new Error(PATTERN_WALK_INCOMPLETE);
  return read.items as readonly PatternRecord[];
}

/** What one read of the curves told the screen. */
export interface PatternReadout {
  /** What to draw. Searching, this is every match in the collection; otherwise the first page. */
  readonly page: PatternPage;
  /**
   * How many curves THE COLLECTION holds. Never the length of {@link page}.
   *
   * Measured by walking, because the store has no count API — the same reason
   * {@link countPatterns} walks rather than asks.
   */
  readonly total: number;
}

/**
 * WHAT THE SCREEN READS: the list to draw, and how many curves he actually has.
 *
 * ## THE FILTER RUNS OVER THE COLLECTION, NOT OVER THE PAGE
 *
 * A search bound to the first page tells the coach a curve is ABSENT while the uniqueness guard on
 * the very same screen refuses to let him create it because it is PRESENT. Both halves are
 * individually correct, neither reports a fault, and he is left holding two contradictory statements
 * and nothing to search for. Seven curves ship, so both halves are correct TODAY and go wrong the
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
export async function readPatternReadout(
  store: LocalStore,
  search: string,
): Promise<PatternReadout> {
  const all = await walkPatterns(store);

  if (search.trim().length === 0) {
    return { page: await readPatternPage(store, FIRST_PATTERN_PAGE), total: all.length };
  }

  return {
    page: {
      items: all.filter((record) => matchesPatternSearch(record, search)),
      cursor: null,
      done: true,
    },
    total: all.length,
  };
}

/**
 * Read the curves and publish them, dropping a reading that arrives after the caller has gone.
 *
 * A failure publishes NOTHING, for the reason the other two give: an empty page says the coach has
 * no curves at all, and saying that after a failed read would be the reassuring answer arrived at by
 * not having looked — and here it would tell him a session cannot be shaped at all.
 *
 * @returns cancel
 */
export function readPatterns(
  store: LocalStore,
  search: string,
  publish: (readout: PatternReadout) => void,
): () => void {
  let live = true;

  void readPatternReadout(store, search).then(
    (readout) => {
      if (live) publish(readout);
    },
    (error: unknown) => {
      console.error('[library] the intensity curves could not be read from the local store', error);
    },
  );

  return () => {
    live = false;
  };
}

/** The next page joined onto the one already on screen. */
export function appendPatternPage(held: PatternPage, next: PatternPage): PatternPage {
  return { items: [...held.items, ...next.items], cursor: next.cursor, done: next.done };
}

/**
 * HOW MANY CURVES THERE ARE IN TOTAL — walked to the end, not counted off the page on screen.
 *
 * The removal sentence tells him when he is about to remove his LAST curve, and that claim has to be
 * measured against the whole library: a count taken from the filtered page in front of him would say
 * "this is the only one" while thirty more sat behind a search box.
 */
export async function countPatterns(store: LocalStore): Promise<number> {
  let total = 0;
  let after: string | null = null;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const page = await libraryPage(store, PATTERN, { limit: COUNT_PAGE, after }) as {
      items: readonly unknown[];
      cursor: string | null;
      done: boolean;
    };
    total += page.items.length;
    if (page.done || page.cursor === null) return total;
    after = page.cursor;
  }
}

/**
 * Add a curve, and resolve only once the write has COMMITTED.
 *
 * THE PROVENANCE COMES FROM THE CORE — `markEdited` over content carrying none returns
 * `coach-created`, which is what the admin reset reads to leave his own curves alone.
 */
export async function addPattern(
  store: LocalStore,
  content: Record<string, unknown>,
): Promise<PatternRecord> {
  return (await store.create(PATTERN, markEdited(content))) as PatternRecord;
}

/**
 * Save changes to a curve, and resolve only once the write has COMMITTED.
 *
 * `produce` runs INSIDE the transaction, after the current revision has been read, so a shipped
 * curve he edits becomes `shipped-edited` off what is ACTUALLY on disk rather than off what the
 * screen last saw — which is the fact the admin reset is built against.
 */
export async function savePattern(
  store: LocalStore,
  recordId: string,
  content: Record<string, unknown>,
  expectRev: number,
): Promise<PatternRecord> {
  return (await store.update(
    PATTERN,
    recordId,
    (current: Record<string, unknown>) => ({
      ...content,
      provenance: markEdited(current).provenance,
    }),
    { expectRev },
  )) as PatternRecord;
}

/**
 * Remove a curve from this device, as a tombstone.
 *
 * Unguarded, and here that is not a deferral to the screen but a measured fact: no stored record
 * names a pattern, so removing one leaves nothing pointing at nothing. See
 * `describePatternRemoval`'s header, and the assertion in `library-routines.test.ts` that reads the
 * enforced directions off `core/model/referential.js` rather than trusting either comment.
 */
export async function removePattern(
  store: LocalStore,
  recordId: string,
  expectRev: number,
): Promise<void> {
  await store.tombstone(PATTERN, recordId, { expectRev });
}
