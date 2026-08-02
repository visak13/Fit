/**
 * THE LIBRARY BACKUP — the third default export, and the only one of the three that is about the
 * coach rather than about a client.
 *
 * ## WHY IT IS ITS OWN CONTROL AND NOT A TICK BOX
 *
 * The library backup is a DEFAULT export: one tap, no checklist, no passphrase, no friction, always
 * openable. It reaches the coach as a tick box on the full export as well, because a whole-practice
 * backup obviously contains his library — but a default export reachable ONLY through a checklist is
 * not a default export, it is a checklist item, and the difference is the number of decisions
 * standing between him and the file.
 *
 * It also matters that this one does not sit behind the gated item: the library holds no client data
 * and no clinical content whatsoever, so nothing about it should ever wait on a passphrase question.
 *
 * ## NOTHING HERE MAKES AN ARCHIVE
 *
 * `core/artefacts/` decides what a library backup contains and refuses one missing a kind;
 * `core/export/` packs the parts; `share-delivery.ts` gets the file to the coach and says which way
 * it went. This file is the words and the wiring.
 */

import {
  FULL_EXPORT_FILE_EXTENSION, FULL_EXPORT_MEDIA_TYPE, LIBRARY_BACKUP_TITLE, libraryBackupCounts,
  libraryBackupParts,
} from '../../core/artefacts/artefacts.js';
import { exportFileName, storeOnlyZip } from '../../core/export/export.js';
import { deliverFile, describeDelivery } from '../platform/share-delivery';
import type { DownloadSurface, SharingSurface } from '../platform/share-delivery';
import { toneOf } from './diet-export';
import type { ExportTone } from './diet-export';
import { auditedExport } from './export-audit';
import type { ExportAudit } from './export-audit';

/** What the section is called. */
export const LIBRARY_BACKUP_HEADING = 'Back up your library';

/**
 * Why he would press it, said once.
 *
 * It names what a library backup is FOR — the edits he has made are his, and the shipped set is
 * restorable but his corrections to it are not — because a control whose purpose is unstated is one
 * he will not press until the day he needs it and it is not there.
 */
export const LIBRARY_BACKUP_WORDS =
  'Every edit to exercises, routines and intensity patterns, in one file. Reset cannot bring back '
  + 'your own edits.';

/** The words on the control. */
export const MAKE_THE_BACKUP = 'Make a backup';

/** Said while it is being made. */
export const MAKING_THE_BACKUP = 'Making the backup...';

/** Said when there is genuinely nothing in the library to back up. */
export const NOTHING_IN_THE_LIBRARY = 'Library is empty.';

/** What the screen says afterwards, in the delivery layer's own words. */
export interface LibraryBackupReport {
  readonly words: string;
  readonly tone: ExportTone;
}

/** The browser, as arguments. Nothing here reaches for a global. */
export interface LibraryBackupSurfaces {
  /** Absent when the browser has no share sheet at all, which is the ordinary desktop case. */
  readonly sharing?: SharingSurface;
  readonly download: DownloadSurface;
}

/**
 * How many records the backup would hold — so the coach is told what he just made rather than that
 * something happened.
 *
 * A count is also the only thing that distinguishes a backup of a practice from a backup of nothing,
 * and the two produce identical-looking files.
 */
export function libraryBackupSummary(library: Record<string, unknown[]>): {
  total: number; words: string;
} {
  const counts = libraryBackupCounts(library);
  const parts = Object.entries(counts.per_kind)
    .map(([kind, count]) => `${count} ${kind.replace('-', ' ')}${count === 1 ? '' : 's'}`);

  return { total: counts.total, words: parts.join(', ') };
}

/**
 * Make the backup and deliver it, and report what actually happened.
 *
 * Never throws. A library missing a kind comes back as the artefact package's own sentence, naming
 * the kind — which is the case that means the caller never fetched it, and is worth saying out loud
 * rather than writing a backup that restores a library missing part of itself.
 *
 * ## THE AUDIT CARRIES THE COUNT THE CARD ALREADY SHOWS HIM
 *
 * A library backup is about the whole library rather than one record, so no subject is attached; the
 * count is the same `libraryBackupCounts` total the card draws, so the log cannot say one number
 * while the screen says another. A refusal — a library missing a kind — is recorded as one, because
 * a backup that was never made and a backup nobody asked for must not read the same afterwards. The
 * sink is required rather than optional; see `export-audit.ts`.
 */
export async function makeLibraryBackup(
  audit: ExportAudit,
  library: Record<string, unknown[]>,
  surfaces: LibraryBackupSurfaces,
): Promise<LibraryBackupReport> {
  /*
   * HOW MANY RECORDS THE BACKUP HELD, captured by the work rather than re-derived afterwards.
   *
   * `libraryBackupCounts` refuses a library missing a kind, exactly as `libraryBackupParts` does —
   * so reading it after a refusal would throw a second time, out of a function whose whole contract
   * is that it never throws, and turn a stated refusal into an unhandled error at a tap. It stays
   * null on every path where nothing was made, because the log must not state a number it did not
   * measure.
   */
  let held: number | null = null;

  return auditedExport(
    audit,
    async () => {
      let file: File;
      try {
        const bytes = storeOnlyZip(libraryBackupParts(library));
        held = libraryBackupCounts(library).total;
        file = new File(
          [new Uint8Array(bytes)],
          exportFileName(LIBRARY_BACKUP_TITLE, FULL_EXPORT_FILE_EXTENSION),
          { type: FULL_EXPORT_MEDIA_TYPE },
        );
      } catch (error) {
        const said = error instanceof Error ? error.message : String(error);
        return { words: `The backup could not be made. ${said}`, tone: 'warning' as ExportTone };
      }

      const delivery = await deliverFile(file, {
        sharing: surfaces.sharing,
        download: surfaces.download,
        title: LIBRARY_BACKUP_TITLE,
      });

      return { words: describeDelivery(delivery, file.name), tone: toneOf(delivery) };
    },
    () => held,
  );
}
