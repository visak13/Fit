/**
 * THE FULL EXPORT'S SURFACE — the checklist, the one gate on it, and the file that comes out.
 *
 * The three default exports are single taps: the coach sends a client their progress, sends them
 * their diet week, or keeps a backup of his library. This is the other thing — everything he has, in
 * one file, with him choosing what goes in it.
 *
 * ## THE WORDS ARE DERIVED HERE SO THEY CAN BE ASSERTED
 *
 * Copy that lives inside a renderer cannot be held to a rule, and the rules this copy is held to are
 * not stylistic: an unticked gate must leave no hint, a cancellation must never be worded as a
 * failure, and a passphrase must be asked for at the moment it is needed and never before. This
 * mirrors the split already proven in `admin-report.ts` and `diet-export.ts`.
 *
 * ## WHAT THIS FILE DOES NOT DO
 *
 * It does not decide which items exist, whether this selection needs a passphrase, or what each item
 * puts in the file — `core/artefacts/` decides all three, and its tests hold it to them. It does not
 * pack an archive, name a file or write a byte — the export seam does. It does not reach for
 * `navigator` or `document`: they arrive as arguments through the bridge the diet direction built.
 *
 * And it holds NO CRYPTOGRAPHY. The sealing arrives as an argument, required rather than optional,
 * for the reason recorded in the checklist itself: an optional sink is one a later call site omits
 * and still compiles, and an export that quietly skipped the sealing is indistinguishable from one
 * with nothing to seal.
 */

import {
  CLINICAL_ITEM_ID, FULL_EXPORT_FILE_EXTENSION, FULL_EXPORT_ITEMS, FULL_EXPORT_MEDIA_TYPE,
  FULL_EXPORT_TITLE, fullExportArchive, fullExportContents, NOTHING_TICKED, PASSPHRASE_MISSING,
  passphraseNeeded, tickedRecordCount,
} from '../../core/artefacts/artefacts.js';
import type { FullExportRecords } from '../../core/artefacts/full-export-contents.js';
import { exportFileName } from '../../core/export/export.js';
import { deliverFile, describeDelivery } from '../platform/share-delivery';
import type { Delivery, DownloadSurface, SharingSurface } from '../platform/share-delivery';
import { toneOf } from './diet-export';
import type { ExportTone } from './diet-export';
import { auditedExport } from './export-audit';
import type { ExportAudit } from './export-audit';

export { CLINICAL_ITEM_ID, FULL_EXPORT_ITEMS, passphraseNeeded };

/** What the section is called on the admin screen. */
export const FULL_EXPORT_HEADING = 'Export everything';

/**
 * Why it exists, said once.
 *
 * It names the two reasons a coach actually makes this file — keeping a copy somewhere that is not
 * Google, and moving to a new phone — because a control whose purpose is unstated is one he will not
 * press, and this is the only independent copy of his practice he can make.
 */
export const FULL_EXPORT_WORDS = 'One file with everything ticked below.';

/** The words on the control that makes the file. */
export const MAKE_THE_FILE = 'Make the file';

/** What the coach is told while it is being made, since a whole practice is not instant. */
export const MAKING_THE_FILE = 'Making the file...';

/**
 * Said when everything he ticked is empty, so the file would carry nothing at all.
 *
 * THE GATE IS HERE BECAUSE THE SEAM DOES NOT HAVE ONE. The export machinery accepts an empty table
 * without complaint and is right to — it cannot tell a coach who has not started from one with a
 * short list. This module is holding the records and can. Without it he taps Make the file, receives
 * an archive of empty lists, and has every reason to think that is what his practice amounts to.
 *
 * It refuses ONLY when the whole selection is empty. A practice with clients and no diet plans yet is
 * an ordinary practice, and a backup of it is a real backup.
 */
export const NOTHING_IN_WHAT_YOU_TICKED = 'Nothing ticked has any records yet.';

/** Said when the passphrase he typed twice does not match itself. */
export const PASSPHRASE_MISMATCH = 'Those two do not match.';

/** What the second box is for. */
export const PASSPHRASE_AGAIN = 'Type it again';

/**
 * Said beside the passphrase boxes once the gated item is ticked, and NEVER when it is not.
 *
 * The sentence is deliberately blunt about the one thing that cannot be undone. It is the same
 * honesty the rest of this application holds to: a passphrase nobody can recover is a real
 * consequence, and a coach who learns that afterwards has learnt it too late.
 */
export const PASSPHRASE_CANNOT_BE_RECOVERED =
  'This file can only be opened with this passphrase — it will still open years from now, even if '
  + 'this phone and your Google account are both gone, and it cannot be opened without it. It does '
  + 'not protect against somebody who has both the file and the passphrase — keep them apart.';

/** Whether the coach's current selection can be turned into a file, and what is said when it cannot. */
export interface FullExportOffer {
  readonly offered: boolean;
  /** The sentence to show instead of making the file, or null when it can be made. */
  readonly instead: string | null;
  /** Whether the passphrase boxes are drawn at all. Derived, never decided by the component. */
  readonly asksForAPassphrase: boolean;
}

/**
 * WHETHER HE CAN MAKE THE FILE — every refusal in one place, in the order he would meet them.
 *
 * The passphrase questions are asked ONLY when the selection demands one, and that demand comes from
 * `core/artefacts/`. A screen that decided for itself when to ask would be a second rule about when
 * the gate applies, and the two would agree until an item was added.
 */
export function fullExportOffer(
  ticked: readonly string[],
  passphrase: string,
  again: string,
  records?: FullExportRecords,
): FullExportOffer {
  const asksForAPassphrase = passphraseNeeded(ticked);

  if (ticked.length === 0) {
    return { offered: false, instead: NOTHING_TICKED, asksForAPassphrase };
  }
  // Only asked when the caller has the records to hand. A surface that has not read them yet is not
  // in a position to know, and must not refuse on the strength of not having looked.
  if (records !== undefined && tickedRecordCount(ticked, records) === 0) {
    return { offered: false, instead: NOTHING_IN_WHAT_YOU_TICKED, asksForAPassphrase };
  }
  if (asksForAPassphrase && passphrase.trim() === '') {
    return { offered: false, instead: PASSPHRASE_MISSING, asksForAPassphrase };
  }
  if (asksForAPassphrase && passphrase !== again) {
    return { offered: false, instead: PASSPHRASE_MISMATCH, asksForAPassphrase };
  }
  return { offered: true, instead: null, asksForAPassphrase };
}

/** What the screen says after an export, in the delivery layer's own words. */
export interface FullExportReport {
  readonly words: string;
  readonly tone: ExportTone;
}

/** The browser, as arguments. Nothing in this file reaches for a global. */
export interface FullExportSurfaces {
  /** Absent when the browser has no share sheet at all, which is the ordinary desktop case. */
  readonly sharing?: SharingSurface;
  readonly download: DownloadSurface;
}

/**
 * Seals the gated item's plaintext into the one part that replaces it.
 *
 * Supplied by the caller — this module names no algorithm and holds no key. Required whenever the
 * gated item is ticked; the checklist refuses rather than proceeding without it.
 */
export type SealClinical = (
  parts: { name: string; text: string }[],
) => Promise<{ name: string; text: string }>;

/**
 * Make the file and deliver it, and report what actually happened.
 *
 * Never throws. A refusal from the checklist and a failure to pack both come back as sentences: this
 * is called from a tap, and a coach must not meet "something went wrong" while trying to make the
 * only independent copy of his practice.
 *
 * ## THE AUDIT CARRIES A COUNT AND NO SUBJECT, AND BOTH ARE DELIBERATE
 *
 * This export is about the whole practice rather than one record, so there is no honest subject to
 * attach and one is not invented — an identifier field is not somewhere to put a description of what
 * was ticked. What it can honestly say is HOW MANY records left, which is the number the offer above
 * already refuses an empty selection on. The sink is required rather than optional; see
 * `export-audit.ts`.
 */
export async function makeFullExport(
  audit: ExportAudit,
  ticked: readonly string[],
  records: FullExportRecords,
  surfaces: FullExportSurfaces,
  sealClinical?: SealClinical,
): Promise<FullExportReport> {
  /*
   * HOW MANY RECORDS WENT OUT, captured by the work rather than re-derived after it.
   *
   * It is the same count the offer refuses an empty selection on, so the log and the screen cannot
   * disagree about what the file held — and it is read INSIDE the attempt so that a selection this
   * count itself refuses lands in the refusal below rather than throwing out of a function whose
   * contract is that it never does. Null wherever no file was made: an entry must not state a number
   * nothing measured.
   */
  let held: number | null = null;

  return auditedExport(
    audit,
    async () => {
      let file: File;
      try {
        held = tickedRecordCount(ticked, records);
        const bytes = await fullExportArchive({
          ticked,
          contents: fullExportContents(records),
          sealClinical,
        });
        file = new File(
          [new Uint8Array(bytes)],
          exportFileName(FULL_EXPORT_TITLE, FULL_EXPORT_FILE_EXTENSION),
          { type: FULL_EXPORT_MEDIA_TYPE },
        );
      } catch (error) {
        // The refusal in its own words, carried through unchanged the way this application carries every
        // refusal. A library missing a kind says so by name here rather than producing a short backup.
        const said = error instanceof Error ? error.message : String(error);
        return { words: `The file could not be made. ${said}`, tone: 'warning' as ExportTone };
      }

      const delivery: Delivery = await deliverFile(file, {
        sharing: surfaces.sharing,
        download: surfaces.download,
        title: FULL_EXPORT_TITLE,
      });

      return { words: describeDelivery(delivery, file.name), tone: toneOf(delivery) };
    },
    () => held,
  );
}
