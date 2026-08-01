/**
 * WHERE THE JOURNAL SCREEN'S FACTS COME FROM — the page, the filter, the count and the verification.
 *
 * This file reads. `screens/journal.ts` beside it words, and the two are kept apart on purpose: the
 * core owns the facts, the words module owns the sentences, and NOTHING here re-shapes, summarises or
 * re-words a fact on the way through. Every type this file hands onward is imported from
 * `screens/journal.ts` rather than declared again — two independently-declared shapes that agree
 * today and drift tomorrow are the defect class this build has already been bitten by.
 *
 * ## THE CORE IS IMPORTED, NOT REDISCOVERED
 *
 * `core/journal/survey.js` already answers the two questions the store itself cannot: which devices
 * wrote, and does the WHOLE log verify. `core/journal/durable.js` already pages a device's chain
 * backwards — `readChainPage(scope, device, {direction: 'prev'})` puts the most recent entry at the
 * top, cursor and all. **There is deliberately no newest-first wrapper here**, because writing one
 * would be a second paging implementation over a read that already does it correctly.
 *
 * ## FILTERING IS IN MEMORY, AND THAT IS THE STORE'S SHAPE RATHER THAN A SHORTCUT
 *
 * `core/store/schema.js` states that the journal store carries NO INDEX AT ALL: its compound primary
 * key `[device, seq]` answers every question the append path asks, and nothing else was added because
 * nothing else was needed to write. So a kind, a domain or a typed word can only be matched over
 * pages that have been read — exactly as `matchesPatternSearch` does for the library, which is the
 * sanctioned pattern here rather than an improvisation.
 *
 * The consequence is {@link JournalPage.total}, and it exists for the reason `countPatterns` exists.
 * A filtered page can be short, or empty, while hundreds of entries sit behind the filter. A screen
 * with only the page in front of it would say "this is all there is" and be wrong, so the total
 * matching the filter across the WHOLE log is carried beside the page and measured by walking it.
 *
 * ## ORDER COMES FROM THE CHAIN, AND THERE IS NO GLOBAL ORDER TO GIVE
 *
 * `at` is the writing device's own clock and is untrusted (`core/journal/JOURNAL.md`). Nothing in
 * this file sorts by it. Entries are per-device chains ordered by `seq`, and there is no sequence
 * spanning devices — so a combined view of several devices **cannot** be put in one true order, and
 * this file does not invent one. It reads each device's chain newest-first, carries a cursor PER
 * DEVICE, and presents the devices in the store's own key order. Interleaving them by timestamp would
 * produce a single confident list whose order was decided by whichever device's clock was wrong.
 *
 * ## THE JOIN THAT IS NOT HERE, AND MUST NEVER BE ADDED
 *
 * An entry carries `subject.record_id` — an OPAQUE identity — and never any content. The tempting
 * line is `store.get(entry.subject.type, entry.subject.record_id)` to put a friendly name on screen.
 * It is forbidden. A removed client is either TOMBSTONED (envelope present, `deleted: true`,
 * `content: null`) or PURGED (nothing there at all), and in the live case the join would put the
 * client's name back into the record of them being removed — resurrecting, on the log screen, the
 * name the deletion path exists to destroy. `screens/journal.ts` says so to the coach through
 * {@link WHY_THERE_IS_NO_NAME}; `journal-source.test.ts` proves it against a real tombstoned record
 * and a real purged one rather than trusting this paragraph.
 *
 * ## A READ THAT FAILED IS ITS OWN STATE, AND IT USED NOT TO BE
 *
 * {@link readJournal} once caught a rejected read, logged it to the console and PUBLISHED NOTHING.
 * The seam therefore stayed at its empty literal — and that literal is not drawn as a blank, it is
 * WORDED AS A FACT: "There is nothing here yet", "This app has not checked its own list yet". So a
 * read that FAILED rendered as the most reassuring state this screen owns, on the one screen that
 * exists so the coach can check the app's account of itself. Reproduced in s17/r2 with a row carrying
 * no device tag: the survey refused it loudly, publish never fired, and the screen reported an empty,
 * unchecked, unalarming log. A TAMPERED LOG READ AS A CLEAN EMPTY ONE.
 *
 * So the reading has THREE states rather than two — {@link JournalNotYetRead}, {@link JournalWasRead}
 * and {@link JournalReadFailed} — and they are mutually exclusive at the type level, because the
 * reason the defect existed is that "failed" and "empty" were the SAME VALUE. A caller cannot reach
 * `page` without first saying which of the three it is looking at.
 *
 * WHAT THE FAILURE CARRIES, AND WHY IT IS SO LITTLE. A closed set of stage tags and the thrown
 * error's CONSTRUCTOR name. Never its message: an exception message is the one string in this
 * application whose contents nobody controls — a store or platform error can quote the key or the row
 * it choked on, and in this log a key is an identity and a row can carry content. The screen is
 * specific about WHAT failed without any of that being reachable, BY CONSTRUCTION rather than by
 * filtering.
 *
 * ## THE CHECK DOES NOT DEPEND ON THE FILTER, AND IS NO LONGER RE-RUN BY IT
 *
 * `verifyWholeJournal` reads and HASHES every entry on every device, and it was re-run by every
 * change to the query — a whole-log re-hash per keystroke at the five-thousand-per-device bound. The
 * filter is applied in memory over pages already read and cannot change what a chain hashes to, so
 * the verification is held per store ({@link verificationFor}) and reused across filter changes.
 * NOTHING ABOUT THE RESULT CHANGES: `checked`, `complete` and `truncated_head` are the core's own
 * numbers from a real run over this store. What invalidates it is the deliberate re-read — the
 * trigger the seam already documents — which is why the `reloads` count is carried into the read.
 */

import { KIND_SPECS } from '../../core/journal/kinds.js';
import { readChainPage } from '../../core/journal/durable.js';
import { listJournalDevices, verifyWholeJournal } from '../../core/journal/survey.js';
import { JOURNAL_STORE } from '../../core/store/schema.js';
import { failureFrom, inStage } from './read-failure';
import type { Scope } from '../../core/store/db.js';
import type { LocalStore } from '../../core/store/store.js';
import type {
  DeviceVerification, JournalEntry, JournalReadFailure, JournalReadStage, JournalReading,
} from './journal';

/**
 * The failure shape, re-exported so the seam takes it from the file it reads through.
 *
 * Declared in `screens/journal.ts` because that module must hold a sentence for every stage, and two
 * independently-declared closed sets that agree today are the drift this pair of files exists to
 * avoid — the same reason every other shape here is imported rather than restated.
 */
export type { JournalReadFailure, JournalReadStage };

/**
 * How many entries are read from ONE device's chain in one page.
 *
 * 25, the same number every other source in this application uses, named here rather than left
 * implicit because the screen's "there are more than these" sentence is derived from the page and a
 * silent change to the number changes what the coach is told. It is per device by necessity: a page
 * is a walk of one chain, and there is no cursor that spans two.
 */
export const JOURNAL_PAGE_LIMIT = 25;

/** How many entries are read at a time when counting how many match a filter. */
const COUNT_PAGE = 200;

/**
 * How long typing must stop before what he typed becomes a READ.
 *
 * Named here rather than at the screen because it is a property of what a read costs, not of how the
 * screen looks. The journal store carries no index, so every changed query walks the whole log to
 * count what matches; a read per keystroke made a six-letter word six whole-log walks. Long enough
 * that a typed word is one read, short enough that a coach who has stopped typing does not wonder
 * whether the control works.
 */
export const JOURNAL_SEARCH_SETTLE_MS = 250;

/**
 * Where one device's chain was left off.
 *
 * A cursor PER DEVICE rather than one for the log, because the log has no single order to hold a
 * position in. `done` is the store's own answer for that device's range and is carried so a finished
 * chain is not re-read on every "show more".
 */
export interface JournalCursor {
  readonly device: string;
  /** The opaque cursor `readChainPage` returned, or null before the first page. */
  readonly after: string | null;
  readonly done: boolean;
}

/** What a read of the log was asked for. */
export interface JournalQuery {
  /** One device's chain, or null for every device that has written to this store. */
  readonly device: string | null;
  /** One of the core's own domains, or null. Derived from the kind at read time, never stored. */
  readonly domain: string | null;
  /** One of the core's own kinds, or null. */
  readonly kind: string | null;
  /** Whatever he typed. Matched over the entry's own fields, never over a record. */
  readonly search: string;
  /** Where each device was left off, or null for the first page. */
  readonly after: readonly JournalCursor[] | null;
}

/** The first page: every device, nothing filtered out. */
export const FIRST_JOURNAL_PAGE: JournalQuery = Object.freeze({
  device: null,
  domain: null,
  kind: null,
  search: '',
  after: null,
});

/** One page of the log, newest first within each device. */
export interface JournalPage {
  /**
   * The entries this page holds, newest first WITHIN each device and grouped by device.
   *
   * NOT a single ordered list across devices. See the header: there is no global sequence, so any
   * combined order would be a claim this application cannot stand behind.
   */
  readonly entries: readonly JournalEntry[];
  /** Where each device was left off. Pass back as {@link JournalQuery.after}. */
  readonly cursor: readonly JournalCursor[];
  /** True only when every device's chain is exhausted. */
  readonly done: boolean;
  /**
   * How many entries in the WHOLE log match the filter — not how many this page holds.
   *
   * The page is short whenever the filter excluded most of what was read, and a screen comparing its
   * own list against nothing would report the short list as the total.
   */
  readonly total: number;
  /** False when more devices exist than the enumeration ceiling allowed. */
  readonly complete: boolean;
}

/**
 * One device's chain, verified — the words module's shape, with the two fields the whole-log survey
 * adds and it does not carry.
 *
 * Extended rather than redeclared: `DeviceVerification` in `screens/journal.ts` is the contract the
 * screen reads, and `entries` and `complete` come from `verifyWholeJournal` on top of it. A separate
 * declaration of the shared fields is the drift this file exists to avoid.
 */
export interface JournalDeviceVerification extends DeviceVerification {
  /** How many entries that device's chain holds, from enumeration. */
  readonly entries: number;
  /** False when the chain was longer than the read ceiling, so `checked` is a floor. */
  readonly complete: boolean;
}

/**
 * The whole log, verified — exactly what `verifyWholeJournal` returned.
 *
 * `ok` and `truncated_head` are INDEPENDENT and both are carried. A device whose oldest entries
 * retention pruned can ALSO hold a corrupted entry further along: that is `truncated_head: true` AND
 * `ok: false` with a `first_divergence` localising the break. Folding either into the other would
 * dress normal housekeeping up as tampering, or hide a real break behind a truncation notice.
 */
export interface WholeJournalVerification {
  /** The conjunction across devices, offered ALONGSIDE the per-device results and never instead. */
  readonly ok: boolean;
  readonly device_count: number;
  /** False when more devices exist than the enumeration ceiling allowed. */
  readonly complete: boolean;
  readonly devices: readonly JournalDeviceVerification[];
}

/** The facts a read produces, in the core's own fields. */
export interface JournalLogFacts {
  readonly page: JournalPage;
  readonly verification: WholeJournalVerification;
}

/** The read has not happened yet: what a store nothing has been read from genuinely yields. */
export interface JournalNotYetRead extends JournalLogFacts {
  readonly status: 'not_yet';
}

/** The read happened, and these are its facts. */
export interface JournalWasRead extends JournalLogFacts {
  readonly status: 'read';
}

/**
 * The read was attempted and did not come back.
 *
 * IT CARRIES NO PAGE AND NO VERIFICATION, and that is the protection rather than an omission: there
 * is nothing to draw, and a shape that offered an empty page here is the shape that let a failed read
 * be worded as an empty log.
 */
export interface JournalReadFailed {
  readonly status: 'failed';
  readonly failure: JournalReadFailure;
}

/**
 * Everything the seam carries — THREE mutually exclusive states.
 *
 * Not two. See the header: `not_yet` and `read` are both worded as facts about the log, so the state
 * where the app TRIED AND COULD NOT LOOK has to be a third thing that neither of them can be mistaken
 * for. The discriminant is what makes the compiler enforce that.
 */
export type JournalLogReading = JournalNotYetRead | JournalWasRead | JournalReadFailed;

/** The domain a kind belongs to, from the core's own table. Null for a kind this core has never had. */
export function domainOfKind(kind: string): string | null {
  const spec = (KIND_SPECS as Record<string, { domain: string } | undefined>)[kind];
  return spec === undefined ? null : spec.domain;
}

/**
 * Does this entry survive the filter?
 *
 * The free-text half matches the entry's OWN fields — its kind, its device, its domain, the type and
 * the opaque identity of its subject. It does not and must not reach a record: see the header.
 */
export function matchesJournalEntry(entry: JournalEntry, query: JournalQuery): boolean {
  if (query.kind !== null && entry.kind !== query.kind) return false;
  if (query.domain !== null && domainOfKind(entry.kind) !== query.domain) return false;

  const search = query.search.trim().toLowerCase();
  if (search === '') return true;

  const fields = [
    entry.kind,
    domainOfKind(entry.kind) ?? '',
    entry.device,
    entry.entry_id,
    entry.subject?.type ?? '',
    entry.subject?.record_id ?? '',
  ];
  return fields.some((field) => field.toLowerCase().includes(search));
}

/** The shape `readChainPage` resolves to, stated where it is used. */
interface ChainPage {
  readonly items: readonly JournalEntry[];
  readonly cursor: string | null;
  readonly done: boolean;
}

/**
 * One page of one device's chain, NEWEST FIRST.
 *
 * `direction: 'prev'` is the whole of it. `durable.js` pages backwards correctly with its own cursor,
 * and a wrapper that re-ordered a forward page in memory would be a second, worse implementation of
 * a read that already works.
 */
async function readDeviceChainPage(
  store: LocalStore,
  device: string,
  after: string | null,
  limit: number,
): Promise<ChainPage> {
  return store.read(
    JOURNAL_STORE,
    (scope: Scope) => readChainPage(scope, device, { limit, after, direction: 'prev' }),
  ) as Promise<ChainPage>;
}

/**
 * Which devices this read covers, and whether that list is complete.
 *
 * A named device is taken at its word — a chain with no entries simply pages to nothing — because
 * enumerating the whole store to check would make the narrow read cost more than the wide one.
 */
async function devicesInScope(
  store: LocalStore,
  query: JournalQuery,
): Promise<{ devices: readonly string[]; complete: boolean }> {
  if (query.device !== null) return { devices: [query.device], complete: true };

  const listing = await listJournalDevices(store) as {
    devices: readonly { device: string }[];
    complete: boolean;
  };
  return { devices: listing.devices.map((entry) => entry.device), complete: listing.complete };
}

/** Where a device was left off, from the cursor the caller carried back. */
function cursorFor(after: readonly JournalCursor[] | null, device: string): JournalCursor {
  const held = after?.find((cursor) => cursor.device === device);
  return held ?? { device, after: null, done: false };
}

/**
 * HOW MANY ENTRIES MATCH, ACROSS THE WHOLE LOG — walked to the end, not counted off the page.
 *
 * The store has no index, so this is the only way to know, and it is the same walk `countPatterns`
 * makes for the library. The pages are read forward: a count has no order.
 */
export async function countJournalEntries(
  store: LocalStore,
  query: JournalQuery = FIRST_JOURNAL_PAGE,
): Promise<number> {
  const { devices } = await devicesInScope(store, query);
  let total = 0;

  for (const device of devices) {
    let after: string | null = null;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop -- each page starts where the previous one ended.
      const page: ChainPage = await store.read(
        JOURNAL_STORE,
        (scope: Scope) => readChainPage(scope, device, { limit: COUNT_PAGE, after }),
      ) as ChainPage;
      total += page.items.filter((entry) => matchesJournalEntry(entry, query)).length;
      if (page.done || page.cursor === null) break;
      after = page.cursor;
    }
  }

  return total;
}

/**
 * One page of the log, filtered, with the total matching the filter beside it.
 *
 * Each device that has not finished contributes one raw page, which is then filtered — the order the
 * library sources use, and for the same reason: the cursor belongs to the store's walk and a filter
 * applied before it would advance the cursor by a number of entries nobody could predict.
 */
export async function readJournalPage(
  store: LocalStore,
  query: JournalQuery = FIRST_JOURNAL_PAGE,
): Promise<JournalPage> {
  const { devices, complete } = await devicesInScope(store, query);

  const entries: JournalEntry[] = [];
  const cursor: JournalCursor[] = [];

  for (const device of devices) {
    const held = cursorFor(query.after, device);
    if (held.done) {
      cursor.push(held);
      continue;
    }

    // eslint-disable-next-line no-await-in-loop -- one page per device; there is no combined range.
    const page = await readDeviceChainPage(store, device, held.after, JOURNAL_PAGE_LIMIT);
    for (const entry of page.items) {
      if (matchesJournalEntry(entry, query)) entries.push(entry);
    }
    cursor.push({ device, after: page.cursor, done: page.done });
  }

  return Object.freeze({
    entries: Object.freeze(entries),
    cursor: Object.freeze(cursor),
    done: cursor.every((held) => held.done),
    total: await countJournalEntries(store, query),
    complete,
  });
}

/**
 * The whole log verified, PASSED THROUGH UNCHANGED.
 *
 * Field for field as `core/journal/survey.js` produced it, `first_divergence` included with its
 * index, seq, entry_id, reason and detail. Nothing here summarises it and nothing here words it: a
 * divergence collapsed into a sentence cannot be un-collapsed by the screen, and where a break is
 * and what it was are the only facts that make it investigable.
 */
export async function verifyJournal(store: LocalStore): Promise<WholeJournalVerification> {
  return await verifyWholeJournal(store) as WholeJournalVerification;
}

/**
 * The verification this store last produced, so a changed FILTER does not re-hash the whole log.
 *
 * Keyed on the store object itself and dropped with it, and stamped with the `reloads` count it was
 * measured under: a deliberate re-read is a different stamp and therefore a real re-run. A REJECTED
 * verification is never kept — a store that was momentarily unreadable would otherwise stay
 * unreadable until the caller thought to ask again.
 */
const HELD_VERIFICATION = new WeakMap<
  LocalStore,
  { readonly reloads: number; readonly verification: Promise<WholeJournalVerification> }
>();

/** The verification for this store under this `reloads` stamp, run once and then reused. */
function verificationFor(store: LocalStore, reloads: number): Promise<WholeJournalVerification> {
  const held = HELD_VERIFICATION.get(store);
  if (held !== undefined && held.reloads === reloads) return held.verification;

  const verification = verifyJournal(store);
  HELD_VERIFICATION.set(store, { reloads, verification });
  void verification.catch(() => {
    const current = HELD_VERIFICATION.get(store);
    if (current?.verification === verification) HELD_VERIFICATION.delete(store);
  });
  return verification;
}

/**
 * THE FAILURE FENCE IS SHARED, AND IT IS THE ONE s17 BUILT RATHER THAN A SECOND COPY OF IT.
 *
 * `screens/read-failure.ts` holds what used to be four private functions here: the class name read
 * off the PROTOTYPE via `Object.getPrototypeOf` — never `thrown.constructor.name`, because an OWN
 * `constructor` property shadows the lookup and s17/r3 measured a planted client name and note
 * fragment reaching rendered markup through exactly that hole — and then the IDENTIFIER-SHAPED
 * CHARACTER WALK over the result. THE TWO CLOSE DIFFERENT HALVES and neither is redundant beside the
 * other: the prototype read stops a value naming itself, the character walk stops anything that is
 * not a class name being drawn whatever it was read off.
 *
 * It moved because s11/a18 found the same publish-nothing defect on the calendar and on the
 * pending-removal seam, and a security fence with four copies is a fence fixed in one place.
 * `journal-source.test.ts` still drives the data-shaped throw through THIS file's public read.
 */

/**
 * Read a page and the verification together and publish the outcome, dropping a reading that arrives
 * after the caller has gone.
 *
 * A FAILURE PUBLISHES {@link JournalReadFailed}, and that is this function's whole reason for having
 * been changed. It used to publish nothing, which left the seam at its empty literal — and that
 * literal is worded as "there is nothing here yet" and "this app has not checked its own list yet",
 * so a read that failed produced the most reassuring screen this surface has. The console line is
 * kept beside the publish; it is where a developer looks and it was never what the coach reads.
 *
 * @returns cancel
 */
export function readJournal(
  store: LocalStore,
  query: JournalQuery,
  publish: (reading: JournalLogReading) => void,
  { reloads = 0 }: { readonly reloads?: number } = {},
): () => void {
  let live = true;

  void Promise.all([
    inStage('journal', 'entries', readJournalPage(store, query)),
    inStage('journal', 'check', verificationFor(store, reloads)),
  ]).then(
    ([page, verification]) => {
      if (live) publish({ status: 'read', page, verification });
    },
    (thrown: unknown) => {
      console.error('[journal] the log could not be read from the local store', thrown);
      if (live) publish({ status: 'failed', failure: failureFrom(thrown, 'entries') });
    },
  );

  return () => {
    live = false;
  };
}

/**
 * The next page joined onto the one already on screen.
 *
 * Duplicated per source by the convention this application follows rather than unified with the
 * library's: the cursor here is a LIST, one per device, and the next page's list replaces the held
 * one because every device that was still going has moved.
 */
export function appendJournalPage(held: JournalPage, next: JournalPage): JournalPage {
  return Object.freeze({
    entries: Object.freeze([...held.entries, ...next.entries]),
    cursor: next.cursor,
    done: next.done,
    total: next.total,
    complete: next.complete,
  });
}

/**
 * The reading the words module takes, composed from the facts the seam carries.
 *
 * The one place the two halves meet, and it does nothing but name fields: the entries as they were
 * read, the per-device verifications as the core produced them, and from the page its `done`, the
 * whole-log `total` and the two completeness flags. The words module's own type is the return type,
 * so a field it grows is a compile error here rather than a blank on the screen.
 *
 * THE LAST THREE ARE WHY THIS FUNCTION IS WORTH READING. A reading that carried the page alone let
 * the screen say how many entries were on it with nothing to say how many there were — which is the
 * "this is all there is" claim {@link countJournalEntries} pays a whole-log walk to prevent — and let
 * a survey stopped at the device ceiling be worded as a clean bill of health over devices nobody
 * looked at. The facts were on the seam the whole time; they were simply not carried across it.
 */
export function screenReading(reading: JournalLogFacts): JournalReading {
  return {
    entries: reading.page.entries,
    verification: reading.verification.devices,
    done: reading.page.done,
    total: reading.page.total,
    complete: reading.page.complete,
    verificationComplete: reading.verification.complete,
  };
}
