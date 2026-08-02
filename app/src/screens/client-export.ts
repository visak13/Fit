/**
 * SENDING A CLIENT THEIR PROGRESS REPORT — the second of the three frictionless default exports.
 *
 * The coach opens a client, reads their progress, and has to get it to them. A client has no account
 * here and never will: exported files and images are the only thing they ever receive. So this is
 * the client direction's END, and like the diet export before it, it is deliberately thin — every
 * hard part was built before this file existed and is CALLED here rather than repeated.
 *
 * ## NOTHING HERE MAKES A SPREADSHEET, A PICTURE OR A SHARE
 *
 *   - `core/report/` decides what the report SAYS. Not re-derived here, not re-worded here.
 *   - `core/artefacts/` lays that report out as the export seam's own table.
 *   - `src/platform/table-export.ts` turns the table into a real `.xlsx` or a real `.png`.
 *   - `src/platform/share-delivery.ts` gets it to the share sheet or downloads it, and says WHICH.
 *
 * There is no canvas, no ZIP, no OOXML and no `navigator` anywhere in this file.
 *
 * ## THIS EXPORT CARRIES NO CLINICAL CONTENT AND HAS NO GATE
 *
 * No passphrase, no tick box, no marking, and nothing here reaches for the crypto module. That is
 * not restraint — it is a fact about what the report can reach: `participation.js` never carries a
 * clinical field, an in-session note, the session-wide summary or another client's identity into the
 * report in the first place. The file is always openable because there is nothing in it that would
 * justify a lock, and an unticked gate would itself tell the client that something was withheld.
 *
 * ## A FINDING, RECORDED HERE RATHER THAN FIXED UNILATERALLY
 *
 * {@link sendDietExport}, {@link toneOf} and {@link browserExportSurfaces} are imported from
 * `diet-export.ts` and used UNCHANGED. All three are already fully generic — they take a table, a
 * kind and three browser surfaces, and none of them knows what a diet is — but they carry a domain
 * name and live in a domain module because the diet chart was the only caller when they were
 * written. THE SECOND CALLER HAS NOW ARRIVED, which is the moment they should move to the platform
 * layer under generic names.
 *
 * That move is NOT made here. Three workers are live in this tree, `diet-export.ts` and
 * `DietScreen.tsx` both belong to a direction that is not mine, and renaming an exported symbol
 * across two files I do not own is how a sibling's in-flight work gets corrupted. Importing them is
 * the honest alternative to writing a second copy: a duplicated {@link toneOf} would be two answers
 * to the one question this application cannot afford to get wrong twice — whether a coach dismissing
 * the share sheet is told he cancelled or told something failed.
 */

import { progressReportTable } from '../../core/artefacts/artefacts.js';
import { pictureFile, workbookFile } from '../platform/table-export';
import { deliverFile, describeDelivery } from '../platform/share-delivery';
import { browserExportSurfaces, toneOf } from './diet-export';
import type { DietExportKind, DietExportReport, DietExportSurfaces, ExportTone } from './diet-export';
import { auditedExport } from './export-audit';
import type { ExportAudit } from './export-audit';

/** Which artefact he asked for. The same two the diet chart offers, and there is no third. */
export type ClientExportKind = DietExportKind;

/** What the section offering the two exports is called. */
export const REPORT_EXPORT_TITLE = 'Send this report';

/**
 * Why there are two, said once so he does not have to guess which one to tap.
 *
 * The image is named as the one to send a client for the reason the diet chart names it: it opens
 * inline in a message on any phone, with nothing to download. The wording also says out loud that
 * nothing leaves the device except the file he sends, because that is the question a coach is asked
 * by a client about anything that arrives from an app.
 */
export const REPORT_EXPORT_WORDS =
  'Image opens straight in a message; spreadsheet can be edited. Nothing is uploaded anywhere.';

/** The words on the control that makes the picture. */
export const SEND_REPORT_AS_IMAGE = 'Send as an image';

/** The words on the control that makes the workbook. */
export const SEND_REPORT_AS_SPREADSHEET = 'Send as a spreadsheet';

/**
 * Said instead of the two controls when there is nothing to report yet.
 *
 * THE GATE IS HERE BECAUSE THE SEAM DOES NOT HAVE ONE. The export seam accepts an empty table
 * without complaint, and it is right to: it cannot know that a report holding one sentence saying
 * nothing has been recorded is "not started" rather than "a short report". This module knows,
 * because it is holding the report and can read `is_empty`. Without this gate the coach sends a
 * client a picture of a sentence saying there is nothing to say about them.
 */
export const NOTHING_TO_REPORT = 'Nothing to report yet — run a session and take a reading first.';

/** Whether this client's report can be sent, and what is said instead when it cannot. */
export interface ReportExportOffer {
  readonly offered: boolean;
  /** The sentence to show in place of the two controls, or null when they are drawn. */
  readonly instead: string | null;
}

/**
 * WHETHER THERE IS ANYTHING TO SEND — decided here rather than inside the component.
 *
 * It is two conditions and it could plausibly have been written inline in the markup, which is
 * exactly why it is not: a gate inside a component is a gate nothing checks.
 *
 * @param report As `projectProgressReport` returns it, or null before one has been read.
 */
export function reportExportOffer(report: { is_empty?: boolean } | null): ReportExportOffer {
  if (report === null || report === undefined) return { offered: false, instead: null };
  if (report.is_empty === true) return { offered: false, instead: NOTHING_TO_REPORT };
  return { offered: true, instead: null };
}

/** What the screen says after an export, in the delivery layer's own words. */
export type ClientExportReport = DietExportReport;

/** The browser, as arguments. Nothing in this file reaches for a global. */
export type ClientExportSurfaces = DietExportSurfaces;

/**
 * How a failed export opens, before the layer's OWN sentence is carried through unchanged.
 *
 * The lead-in is client-shaped because that is what he is looking at; the reason is the layer's,
 * because the layer is the only thing that knows what actually went wrong.
 */
export const COULD_NOT_MAKE_THE_REPORT = 'This report could not be made into a file.';

/**
 * Make the artefact and deliver it, and report what actually happened.
 *
 * The table comes from `core/artefacts/`, which lays the report out; this function does not touch
 * the report's content and could not re-word it if it wanted to, because by the time it is here it
 * is a table of cells.
 *
 * ## WHY THE PICTURE'S REFUSAL IS CAUGHT HERE, AND WHY IT IS NOT PREDICTED
 *
 * A progress report grows with a client's history, and past a certain size the picture layer refuses
 * to draw it: the plan exceeds the platform's canvas limit BEFORE the device pixel ratio is applied,
 * so there is no softness left to give up — the content itself does not fit. That refusal is
 * correct, and `table-picture.ts` is left exactly as it is.
 *
 * The refusal is CAUGHT and carried to the coach — and the picture layer's own sentence ALREADY
 * names the spreadsheet as the thing to do instead, so the dead end is already a choice and nothing
 * here re-words it into a worse one.
 *
 * **THIS FUNCTION DOES NOT KNOW WHAT THE LIMIT IS, and must never learn.** No row count, no pixel
 * count, no re-derivation of the bound, and no matching on the refusal's text to work out which
 * refusal it was. It asks, and it carries back whatever it is told. A caller that encoded the
 * threshold would be a SECOND OPINION about the limit and would silently disagree the day somebody
 * changed the constant or the layout grew a column; a caller that matched on the wording would
 * report a blind canvas as a history that is too long, which is a confident lie rather than a
 * missing feature.
 *
 * Never throws. Every path ends in a sentence, because a coach must not meet "something went wrong"
 * with a client waiting.
 *
 * ## THE AUDIT NAMES THE CLIENT, AND THE REFUSAL IS RECORDED TOO
 *
 * This is the one export in the application that is unambiguously ABOUT a person, so the entry
 * carries that client's identity as its subject — WHICH record, never a word of what it says. The
 * refusal above is the case worth having: a coach told a client's history is too long to draw as a
 * picture has an account of why nothing reached them, and without it that is indistinguishable from
 * an export he never attempted. The sink is required rather than optional; see `export-audit.ts`.
 */
export async function sendClientReport(
  audit: ExportAudit,
  kind: ClientExportKind,
  report: Parameters<typeof progressReportTable>[0],
  surfaces: ClientExportSurfaces,
): Promise<ClientExportReport> {
  return auditedExport(audit, async () => {
    const table = progressReportTable(report);

    let file: File;
    try {
      file = kind === 'picture' ? await pictureFile(table, surfaces.picture) : workbookFile(table);
    } catch (error) {
      // The layer's own sentence, labelled and reworded nowhere — the way this application carries
      // every refusal. For a history too long to draw, that sentence is already "share it as a
      // spreadsheet instead", which is the artefact that genuinely works at that size.
      const said = error instanceof Error ? error.message : String(error);
      return { words: `${COULD_NOT_MAKE_THE_REPORT} ${said}`, tone: 'warning' as ExportTone };
    }

    const delivery = await deliverFile(file, {
      sharing: surfaces.sharing,
      download: surfaces.download,
      title: table.title,
    });

    return { words: describeDelivery(delivery, file.name), tone: toneOf(delivery) };
  });
}

/** The real browser, wired at the edge — the diet direction's bridge, reused rather than rewritten. */
export { browserExportSurfaces };
