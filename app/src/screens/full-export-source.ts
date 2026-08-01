/**
 * READING THE WHOLE PRACTICE, for the full export.
 *
 * The same discipline as `client-report-source.ts` and for the same reason: every store query is
 * PAGED, and a backup built from first pages is a file that opens cleanly and restores part of a
 * practice. That is the worst defect a backup can have, because it is discovered at the moment the
 * backup is the only copy left.
 *
 * So every read is walked to the end through {@link readAll}, and an incomplete walk is REPORTED.
 * The surface refuses to write a file from an incomplete read rather than writing a short one.
 *
 * ## TWO THINGS THAT ARE DERIVED RATHER THAN TYPED
 *
 * The library is read PER KIND from the model's own `LIBRARY_TYPES` — the same list the backup
 * writes from — so a fourth library kind is FETCHED as well as written. A backup whose fetch and
 * whose writer disagree about the kinds is the same silent hole approached from the other side.
 *
 * The per-client records are read PER CLIENT, because that is the only index the store has for them,
 * and then DEDUPLICATED BY RECORD IDENTITY. A session in this application carries one to many
 * clients, so a shared session is returned once for each attendee — and a backup that wrote it twice
 * would restore a practice with duplicate sessions in it.
 */

import { LIBRARY_TYPES } from '../../core/model/vocabularies.js';
import {
  dietPlansForClient, libraryPage, listClients, performedForClient, readingsForClient,
  sessionsForClient,
} from '../../core/store/queries.js';
import type { LocalStore } from '../../core/store/local-store.js';
import { readAll } from './client-report-source';

/** One page, as every store query answers. */
interface Page { items: unknown[]; cursor: string | null; done: boolean }

/** Everything the full export can be built from, and whether it really is everything. */
export interface WholePractice {
  clients: unknown[];
  sessions: unknown[];
  performed: unknown[];
  readings: unknown[];
  diet: unknown[];
  library: Record<string, unknown[]>;
  /** False when any walk hit its bound. A backup must not be written from a partial read. */
  complete: boolean;
}

/**
 * Said when the practice could not be read to the end.
 *
 * A backup is the one file whose incompleteness is discovered at the worst possible moment, so this
 * refuses rather than writing a short one — and says so without accusing him of anything.
 */
export const PRACTICE_INCOMPLETE =
  'Your records could not all be read just now, so a file made from them would be missing some of '
  + 'it. Nothing is wrong with the records themselves. Try again in a moment — a backup that is '
  + 'quietly incomplete is worse than one you had to make twice.';

/**
 * The records, keyed by identity so a record reached from two clients is kept once.
 *
 * Records with no identity are kept as they are: a record the store handed over without one is
 * still the coach's data, and dropping it to keep a map tidy would lose it from his backup.
 */
export function deduplicate(records: unknown[]): unknown[] {
  const byId = new Map<string, unknown>();
  const withoutId: unknown[] = [];

  for (const record of records) {
    const id = (record as { record_id?: unknown })?.record_id;
    if (typeof id === 'string') byId.set(id, record);
    else withoutId.push(record);
  }
  return [...byId.values(), ...withoutId];
}

/** The library, and whether every kind of it was read to the end. */
export interface WholeLibrary {
  library: Record<string, unknown[]>;
  complete: boolean;
}

/**
 * Read the LIBRARY ONLY.
 *
 * Separate from {@link readWholePractice} because the library backup is a DEFAULT export — one tap,
 * no friction — and reading every client's whole history to produce it would make the cheapest of
 * the three exports the slowest. It holds no client data at all, so there is nothing else to fetch.
 *
 * The kinds come from the model's own `LIBRARY_TYPES`, never a list typed here: the fetch and the
 * writer must agree about what the library IS, or the backup silently misses a kind from whichever
 * side was forgotten.
 */
export async function readWholeLibrary(store: LocalStore): Promise<WholeLibrary> {
  const library: Record<string, unknown[]> = {};
  let complete = true;

  for (const kind of LIBRARY_TYPES) {
    // eslint-disable-next-line no-await-in-loop -- one paged walk per kind.
    const read = await readAll((after) => libraryPage(store, kind, { after }) as Promise<Page>);
    library[kind] = read.items;
    complete = complete && read.complete;
  }

  return { library, complete };
}

/**
 * Read everything, walking every page.
 *
 * The store is an argument; nothing here reaches for a global, so the incomplete case is drivable in
 * a test with no database.
 */
export async function readWholePractice(store: LocalStore): Promise<WholePractice> {
  const clients = await readAll(
    (after) => listClients(store, { after, includeArchived: true }) as Promise<Page>,
  );
  let complete = clients.complete;

  const library: Record<string, unknown[]> = {};
  for (const kind of LIBRARY_TYPES) {
    // eslint-disable-next-line no-await-in-loop -- one paged walk per kind.
    const read = await readAll((after) => libraryPage(store, kind, { after }) as Promise<Page>);
    library[kind] = read.items;
    complete = complete && read.complete;
  }

  const sessions: unknown[] = [];
  const performed: unknown[] = [];
  const readings: unknown[] = [];
  const diet: unknown[] = [];

  for (const client of clients.items) {
    const id = (client as { record_id?: unknown })?.record_id;
    if (typeof id !== 'string') continue;

    /* eslint-disable no-await-in-loop -- each client's walk depends on its own cursors. */
    const theirs = await readAll((after) => sessionsForClient(store, id, { after }) as Promise<Page>);
    const did = await readAll((after) => performedForClient(store, id, { after }) as Promise<Page>);
    const took = await readAll((after) => readingsForClient(store, id, { after }) as Promise<Page>);
    const plans = await readAll((after) => dietPlansForClient(store, id, { after }) as Promise<Page>);
    /* eslint-enable no-await-in-loop */

    sessions.push(...theirs.items);
    performed.push(...did.items);
    readings.push(...took.items);
    diet.push(...plans.items);
    complete = complete && theirs.complete && did.complete && took.complete && plans.complete;
  }

  return {
    // A shared session is returned once per attendee. Written twice it would restore a practice
    // holding duplicate sessions, which nothing downstream would flag as wrong.
    clients: clients.items,
    sessions: deduplicate(sessions),
    performed: deduplicate(performed),
    readings: deduplicate(readings),
    diet: deduplicate(diet),
    library,
    complete,
  };
}
