/**
 * THE RESET'S FACTS AND ITS TWO GUARDS — every read, the backup, and the call that finally has a
 * caller.
 *
 * `core/seed/reset.js` does the reset. This file is what a caller who HOLDS A STORE has to do
 * around it, and it does exactly three things the core cannot:
 *
 *   ONE — READ THE LIBRARY TO THE END, so the backup is of all of it. Every store query in this
 *   application is PAGED, and a reader built from first pages is COMPLETE IN SHAPE AND SHORT IN
 *   SUBSTANCE with nothing erroring anywhere. On a backup that is the worst defect there is,
 *   because it is discovered at the moment the backup is the only copy left. So the walk goes to
 *   the end through `readAll`, which also catches a cursor that fails to advance, and an INCOMPLETE
 *   WALK REFUSES rather than writing a short file.
 *
 *   TWO — RUN THE REFERENTIAL CHECK THE STORE CANNOT. `core/model/referential.js` states the one
 *   invariant that must always hold: every exercise a routine names must exist, and a routine-level
 *   override must agree with that exercise's measurement. It needs the exercise library and so
 *   CANNOT be run by the store, which validates a routine alone — `store.create` and `store.update`
 *   will commit a routine naming an exercise that is not there. The library editor closes that hole
 *   on its write paths by calling `checkRoutineReferences`, and A RESET WRITES ROUTINES, so it has
 *   the same hole unless it calls THE SAME FUNCTION THE SAME WAY. It does, below, and no second
 *   referential check is written here.
 *
 *   THREE — MAKE THE BACKUP, and hand it to the core as the `backup` argument rather than taking it
 *   separately. That is not a stylistic choice: `resetToDefaults` runs `backup` BEFORE anything is
 *   written and lets a rejection through untouched, so a failed backup is followed by NO reset. A
 *   copy taken by a separate button minutes earlier would be a copy of a different library, and a
 *   failure to save it would be a failure the reset never heard about.
 *
 * ## WHY THE RESET'S REFERENTIAL HOLE IS REAL AND NOT THEORETICAL
 *
 * Two of his own routines can be left dangling by a reset that means well:
 *
 *   - a routine HE made naming a shipped exercise from an older version of the library. Reset
 *     removes that exercise, because it is shipped-provenance and no longer shipped, and his
 *     routine is left pointing at nothing.
 *   - a routine HE made overriding repetitions on a shipped exercise he has since edited to be
 *     counted in time. Reset reverts the exercise to its shipped measurement and his override now
 *     contradicts it.
 *
 * Both commit cleanly today and surface as a broken row mid-session in front of a client. Both are
 * caught below, BEFORE anything is written.
 *
 * ## WHAT THIS FILE DOES NOT DO
 *
 * It does not decide what a reset does — `core/seed/reset.js` does, and its own suite holds it to
 * it. It does not write a sentence the coach reads — `reset-to-defaults.ts` does. It does not pack
 * an archive or name a file — `core/export/` does. And it does not reach for `navigator` or
 * `document`: they arrive as arguments, so every path here is drivable in a test with no browser.
 */

import { libraryBackupParts } from '../../core/artefacts/artefacts.js';
import { exportFileName, storeOnlyZip } from '../../core/export/export.js';
import { checkRoutineReferences } from '../../core/model/model.js';
import { LIBRARY_TYPES } from '../../core/model/vocabularies.js';
import { isCoachCreated, seedContentFor, SEED_TYPES } from '../../core/seed/seed.js';
import { describeReset, resetToDefaults } from '../../core/seed/reset.js';
import { libraryPage } from '../../core/store/store.js';
import { StoreValidationError } from '../../core/store/store.js';
import type { LocalStore } from '../../core/store/store.js';
import { deliverFile, describeDelivery } from '../platform/share-delivery';
import type { Delivery, DownloadSurface, SharingSurface } from '../platform/share-delivery';
import { readAll } from './client-report-source';
import { toneOf } from './diet-export';
import type { ExportTone } from './diet-export';

/** One page, as every store query answers. */
interface Page { items: unknown[]; cursor: string | null; done: boolean }

/**
 * WHAT A STORE-ONLY ARCHIVE IS CALLED, and the one honest note about this pair.
 *
 * `core/export/zip.js` builds the archive and does not name its type; `core/artefacts/checklist.js`
 * declares the same two values for the full export. These are the SECOND copy, not a third: the
 * pair belongs beside `storeOnlyZip`, where the one thing that knows what a store-only archive IS
 * could hand the same answer to every caller. Moving them there means editing two packages this
 * action does not own, so they are stated here with the seam named rather than reached for under a
 * constant called `FULL_EXPORT_*`, which would make a library backup claim to be a full export.
 */
export const ARCHIVE_MEDIA_TYPE = 'application/zip';
/** @see ARCHIVE_MEDIA_TYPE */
export const ARCHIVE_FILE_EXTENSION = '.zip';

/** The library as it stands, and whether that really is all of it. */
export interface LibraryReading {
  /** Keyed by record kind, EVERY kind in `LIBRARY_TYPES`, so the backup cannot be written short. */
  readonly library: Record<string, unknown[]>;
  /** False when any walk hit its bound or met a cursor that did not advance. */
  readonly complete: boolean;
}

/**
 * Said when the library could not be read to the end.
 *
 * It refuses rather than saving a short copy, and it says so without accusing him of anything — the
 * same sentence shape the full export's own incomplete read uses, for the same reason.
 */
export const LIBRARY_INCOMPLETE =
  'Your library could not all be read just now, so a copy made from it would be missing some of '
  + 'it. Nothing is wrong with the library itself. Try again in a moment — a copy that is quietly '
  + 'incomplete is worse than one you had to make twice.';

/**
 * EVERY LIBRARY RECORD, WALKED TO THE END, PER KIND.
 *
 * The kinds come from the model's own `LIBRARY_TYPES`, the same frozen list the backup writes from,
 * so the fetch and the writer cannot disagree about which kinds exist. A fourth library kind added
 * to the model arrives here without anybody remembering, and the backup refuses a library missing
 * one rather than writing an empty section.
 */
export async function readWholeLibrary(store: LocalStore): Promise<LibraryReading> {
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

/** What the screen says after a backup, in the delivery layer's own words. */
export interface BackupReport {
  readonly words: string;
  readonly tone: ExportTone;
}

/** The browser, as arguments. Nothing in this file reaches for a global. */
export interface BackupSurfaces {
  /** Absent when the browser has no share sheet at all, which is the ordinary desktop case. */
  readonly sharing?: SharingSurface;
  readonly download: DownloadSurface;
}

/**
 * Thrown when the copy did not reach him, so `resetToDefaults` never writes.
 *
 * A DISMISSED SHARE SHEET IS A FAILED BACKUP AND IS TREATED AS ONE. He tapped the share sheet away,
 * so no file was kept — and a reset that went ahead on the strength of a share he cancelled would
 * be exactly the sequence the offer exists to prevent. It carries the delivery layer's own sentence
 * rather than a second wording of it.
 */
export class BackupNotKeptError extends Error {
  readonly report: BackupReport;

  constructor(report: BackupReport) {
    super(report.words);
    this.name = 'BackupNotKeptError';
    this.report = report;
  }
}

/**
 * SAVE A COPY OF THE LIBRARY, and resolve only once it actually reached him.
 *
 * The archive is `core/artefacts/`'s parts packed by `core/export/`'s zip — no second exporter, and
 * the parts carry every kind twice, faithfully as records and readably as a table.
 *
 * @throws {Error} on an incomplete read, so a short copy is never written.
 * @throws {BackupNotKeptError} when the file was not delivered or was dismissed.
 */
export async function saveLibraryBackup(
  store: LocalStore,
  surfaces: BackupSurfaces,
): Promise<BackupReport> {
  const reading = await readWholeLibrary(store);
  if (!reading.complete) throw new Error(LIBRARY_INCOMPLETE);

  const bytes = storeOnlyZip(libraryBackupParts(reading.library)) as Uint8Array;
  const file = new File(
    [new Uint8Array(bytes)],
    exportFileName(BACKUP_TITLE, ARCHIVE_FILE_EXTENSION),
    { type: ARCHIVE_MEDIA_TYPE },
  );

  const delivery: Delivery = await deliverFile(file, {
    sharing: surfaces.sharing,
    download: surfaces.download,
    title: BACKUP_TITLE,
  });

  const report: BackupReport = {
    words: describeDelivery(delivery, file.name),
    tone: toneOf(delivery),
  };
  // `delivered` and `kept` are the two outcomes where a file exists somewhere he can find it.
  // Everything else — dismissed, or an error — means there is nothing to go back to.
  if (report.tone !== 'delivered' && report.tone !== 'kept') throw new BackupNotKeptError(report);
  return report;
}

/** What the file is called before its extension. Named for what it holds, not for when it was made. */
export const BACKUP_TITLE = 'Fit library before restoring defaults';

// ═══════════════════════════════════════════════════════════════════════════════
// The referential guard the store cannot run
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * THE LIBRARY AS IT WILL BE AFTER THE RESET — derived from the shipped content and from what
 * survives, never from a hand-written expectation.
 *
 * The rule reset applies is the one this reads: shipped content comes back whole, and anything the
 * coach made himself is left exactly as it is. Everything else — a shipped record he edited, a
 * shipped record he deleted, a shipped record from an older library — ends up as the shipped set
 * says, which is why the shipped content is taken verbatim rather than merged with what is stored.
 */
async function libraryAfterReset(store: LocalStore, kind: string): Promise<Record<string, any>[]> {
  const read = await readAll((after) => libraryPage(store, kind, { after }) as Promise<Page>);
  if (!read.complete) throw new Error(LIBRARY_INCOMPLETE);

  const his = (read.items as { content?: Record<string, any> }[])
    .map((record) => record.content)
    .filter((content): content is Record<string, any> => !!content && isCoachCreated(content));

  return [...(seedContentFor(kind) as Record<string, any>[]), ...his];
}

/**
 * WOULD THIS RESET LEAVE A ROUTINE POINTING AT NOTHING? Asked BEFORE anything is written.
 *
 * The same function the library editor calls, called the same way: `checkRoutineReferences` over
 * routine content and exercise content, throwing the store's own `StoreValidationError` so a
 * referential refusal arrives in exactly the shape a record's own refusal does. NO SECOND
 * REFERENTIAL CHECK IS WRITTEN HERE, and none may be: two copies of the invariant would agree until
 * one was edited, and the drift would be silent in the worse direction.
 *
 * It is asked about the library that WILL EXIST, which is the only question worth asking — the
 * library that exists today is already consistent, and it is the reset that can break it.
 *
 * @throws {StoreValidationError} naming every routine entry that would dangle or contradict.
 */
export async function checkReferencesSurviveTheReset(store: LocalStore): Promise<void> {
  const exercises = await libraryAfterReset(store, 'exercise');
  const routines = await libraryAfterReset(store, 'routine');

  const result = checkRoutineReferences(routines, exercises) as {
    ok: boolean;
    issues: { path: string; code: string; message: string }[];
  };
  if (!result.ok) {
    throw new StoreValidationError(
      'Restoring the library would leave one of your own routines naming an exercise that would '
      + 'not be there, so nothing was changed.',
      result.issues,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// The reset itself, with a caller at last
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * What a reset would do to the library he has right now. The core's plan, carried, never re-derived.
 */
export async function readResetPlan(store: LocalStore) {
  return describeReset(store);
}

/** The kinds a reset restores, from the core's own list. Stated so the card need not import twice. */
export const RESET_KINDS: readonly string[] = SEED_TYPES;

/** How a reset was asked for. */
export interface ResetRequest {
  /** True when a copy is to be saved first. A false here is his explicit decision, never a default. */
  readonly withBackup: boolean;
  /** Required whenever `withBackup` is true; nothing else uses it. */
  readonly surfaces?: BackupSurfaces;
}

/**
 * RESTORE THE SHIPPED LIBRARY — the production caller, and the whole order of events.
 *
 * The referential guard runs first, so a reset that would break one of his routines refuses before
 * he is asked to save anything. Then `resetToDefaults` runs, and the backup goes IN as its `backup`
 * argument rather than being taken beforehand: the core runs it before the first write and lets a
 * rejection through, so a copy that failed to save is followed by no reset at all.
 *
 * It throws rather than returning a status, and every throw leaves the library untouched. The
 * screen turns whatever came out into a sentence; this file invents none.
 */
export async function restoreShippedLibrary(store: LocalStore, request: ResetRequest) {
  await checkReferencesSurviveTheReset(store);

  const surfaces = request.surfaces;
  if (request.withBackup && surfaces === undefined) {
    // Not a sentence for the coach: a caller asking for a backup with nothing to deliver it through
    // is a wiring fault, and a reset that quietly went ahead without the copy he asked for is the
    // exact failure the offer exists to prevent.
    throw new Error('A reset was asked to save a copy first, but no way to deliver it was supplied.');
  }

  return resetToDefaults(store, {
    backup: request.withBackup && surfaces !== undefined
      ? () => saveLibraryBackup(store, surfaces)
      : undefined,
  });
}
