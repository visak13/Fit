/**
 * READING A CLIENT'S WHOLE HISTORY, so the report is about all of it.
 *
 * ## THE FAILURE THIS FILE EXISTS TO PREVENT
 *
 * Every history query in `core/store/queries.js` is PAGED. A caller that reads one page and projects
 * a report from it produces a document that is complete in shape and wrong in substance: the trends
 * start later than the client did, the attendance count is short, and the cadence is computed over a
 * slice. NOTHING ERRORS. The coach sends it to a client, and the client reads an understatement of
 * their own progress — which is the precise opposite of what the report is for.
 *
 * It is the same family this build keeps meeting: an absence that looks like a pass. So the pages
 * are walked to the end, and running out of patience is REPORTED rather than absorbed.
 *
 * ## AND WHY THE BOUND IS REPORTED RATHER THAN TRUSTED
 *
 * The walk is bounded, because an unbounded loop over a cursor is a hung screen if a cursor ever
 * fails to advance. But a bound that silently returned what it had would reintroduce the exact
 * defect above with an extra step. So {@link WholeHistory} carries `complete`, and the surface must
 * refuse to export an incomplete history rather than quietly send a shortened report.
 *
 * That flag is not decoration: a test drives the loop against a store that never finishes and
 * asserts it comes back false.
 */

import {
  libraryPage, performedForClient, readingsForClient, sessionsForClient,
} from '../../core/store/queries.js';
import type { LocalStore } from '../../core/store/local-store.js';

/** One page of records and where to continue from. The shape every history query answers with. */
interface Page {
  items: unknown[];
  cursor: string | null;
  done: boolean;
}

/** A paged reader, as this module uses it. Named so a test can drive one without a database. */
export type ReadPage = (after: string | null) => Promise<Page>;

/**
 * How many pages are walked before the walk gives up.
 *
 * Generous rather than tuned: at the store's default page size this reaches years of history for a
 * client who trains daily. It exists to stop a cursor that never advances from hanging the screen,
 * not to cap what the coach can export, and reaching it is reported as an incomplete read.
 */
export const PAGE_LIMIT = 200;

/** A client's whole history, and whether it really is whole. */
export interface WholeHistory {
  client: unknown;
  client_id: string;
  sessions: unknown[];
  performed: unknown[];
  readings: unknown[];
  exercises: unknown[];
  /** False when any walk hit {@link PAGE_LIMIT}. A report from an incomplete history must not be sent. */
  complete: boolean;
}

/**
 * Walk a paged reader to the end.
 *
 * @returns The records, and whether the end was actually reached.
 */
export async function readAll(page: ReadPage): Promise<{ items: unknown[]; complete: boolean }> {
  const items: unknown[] = [];
  let after: string | null = null;

  for (let walked = 0; walked < PAGE_LIMIT; walked += 1) {
    // eslint-disable-next-line no-await-in-loop -- the cursor for page N+1 is on page N.
    const read = await page(after);
    items.push(...read.items);

    if (read.done || read.cursor === null) return { items, complete: true };
    // A cursor that does not advance would otherwise walk the same page until the bound, and report
    // the same records over and over as though they were history.
    if (read.cursor === after) return { items, complete: false };
    after = read.cursor;
  }

  return { items, complete: false };
}

/**
 * Everything a progress report is projected from, for one client.
 *
 * The store is an argument. Nothing here reaches for a global, so the whole walk — including the
 * incomplete case — is driven in a test with no database.
 */
export async function readWholeHistory(
  store: LocalStore,
  client: { recordId: string; record?: unknown },
): Promise<WholeHistory> {
  const id = client.recordId;

  const sessions = await readAll((after) => sessionsForClient(store, id, { after }) as Promise<Page>);
  const performed = await readAll((after) => performedForClient(store, id, { after }) as Promise<Page>);
  const readings = await readAll((after) => readingsForClient(store, id, { after }) as Promise<Page>);
  // The library is read for MOVEMENT NAMES only. A missing library is not a failure: the report
  // reads a movement's key as words when it cannot find the name, which is `focus.js`'s decision.
  const exercises = await readAll((after) => libraryPage(store, 'exercise', { after }) as Promise<Page>);

  return {
    client: client.record ?? null,
    client_id: id,
    sessions: sessions.items,
    performed: performed.items,
    readings: readings.items,
    exercises: exercises.items,
    complete: sessions.complete && performed.complete && readings.complete && exercises.complete,
  };
}

/**
 * Said when the history could not be read to the end.
 *
 * It refuses rather than sending a shortened report, and it says WHY in a way that does not accuse
 * the coach of anything: the alternative is a document that looks finished and understates his
 * client's progress, which he would have no way of noticing.
 */
export const HISTORY_INCOMPLETE =
  'This client\'s history could not be read all the way back, so a report now would leave some of it '
  + 'out. Nothing is wrong with the records — try again, and if it keeps happening the report can '
  + 'still be sent as a spreadsheet from the full export.';
