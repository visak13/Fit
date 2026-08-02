/**
 * SENDING THE WEEK — the diet chart handed to the export seam, and the honest word about where it
 * went.
 *
 * The coach reads a client's week on the diet screen and then has to get it to that client, who has
 * no account here and never will: exported files and images are the only thing a client ever
 * receives. So this is the diet direction's END, and it is deliberately thin — every hard part of it
 * was built before this file existed and is CALLED here rather than repeated.
 *
 * ## NOTHING HERE MAKES A SPREADSHEET, A PICTURE OR A SHARE, AND THAT IS THE WHOLE POINT
 *
 * The export seam already exists and this is its FIRST CALLER:
 *
 *   - `core/diet/chart.js` projects the plan into the grid and `chartTable` hands that grid over as
 *     `{title, headings, rows}` — the seam's own field names, so it is passed through UNCHANGED.
 *     There is no adapter in this file and there must never be one: an adapter is what turns one
 *     seam into two, and the second one hands the coach a subtly different spreadsheet.
 *   - `src/platform/table-export.ts` turns that table into a real `.xlsx` and a real `.png`.
 *   - `src/platform/share-delivery.ts` gets the file to the phone's share sheet, or downloads it
 *     where that is not possible, and says WHICH.
 *
 * There is no OOXML, no ZIP, no canvas and no `navigator` anywhere in the diet direction. `s9` needs
 * this same capability for the progress report and the full data export and imports the same seam.
 * **If the seam is missing something a diet chart needs, that is a thing to say out loud and widen
 * deliberately — never to work around locally.**
 *
 * ## THE ARTEFACT HAS TO STAND ON ITS OWN
 *
 * It lands in a messaging application with no app around it and sits in somebody's downloads a month
 * later. So the TITLE — which is also the file's name, through the seam's `exportFileName` — carries
 * the client and the plan, and says the week REPEATS. The plan holds no dates and the chart refuses
 * to resolve a day against a calendar, so a repeating week is what is exported; there are no dated
 * rows anywhere in this direction to export instead.
 *
 * ## DIET IS PLAINTEXT AND THIS PATH ADDS NO FRICTION
 *
 * No passphrase, no gate, no sensitivity marking, and nothing here reaches for the crypto module.
 * The step names the diet export as the one that is ALWAYS OPENABLE; a lock here would be a defect
 * rather than caution, and the coach would be fighting it with a client waiting for their chart.
 *
 * ## AND THE DELIVERY IS REPORTED TRUTHFULLY
 *
 * `deliverFile` answers with four outcomes and only ONE of them means the file went. This file
 * consumes that answer and words it through the platform's own {@link describeDelivery}; it does not
 * re-decide which outcome happened, and it does not flatten a fallback download or a dismissed sheet
 * into "Sent". A coach who closes the share sheet has CANCELLED, and telling him something went
 * wrong because he changed his mind teaches him to distrust the message that matters.
 */

import { chartTable } from '../../core/diet/diet.js';
import type { projectWeekChart } from '../../core/diet/diet.js';
import { browserPictureSurface, pictureFile, workbookFile } from '../platform/table-export';
import type { Table } from '../platform/table-export';
import {
  anchorDownload, browserSharing, deliverFile, describeDelivery,
} from '../platform/share-delivery';
import type {
  BrowserSharing, Delivery, DownloadSurface, SharingSurface,
} from '../platform/share-delivery';
import type { PictureSurface } from '../platform/table-picture';
import { auditedExport } from './export-audit';
import type { ExportAudit } from './export-audit';

/** The chart as `core/diet/chart.js` projects it — the same view the screen already draws. */
type WeekChartView = ReturnType<typeof projectWeekChart>;

// ═══════════════════════════════════════════════════════════════════════════════
// The artefact's own title, which is also its file name
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * What the title says after the client and the plan, and it is not decoration.
 *
 * The chart is a week that REPEATS. On screen `REPEATS_WORDS` says so above the grid, but the
 * exported file leaves the application entirely: a client opening a picture of a seven-column grid
 * has nothing telling them it is not a diary of a particular week, and a month later neither has the
 * coach. The seam carries a title and nothing else, so this is where that fact travels.
 */
export const REPEATING_WEEK_WORDS = 'diet, one repeating week';

/** What the client and the plan are separated by, so the title reads as a phrase rather than a key. */
const BETWEEN = ' — ';

/** Said instead of a plan's name when the plan has none. Never an empty title: the seam refuses one. */
const AN_UNNAMED_PLAN = 'Diet plan';

/**
 * The title the artefact carries, and therefore the name of the file the coach shares.
 *
 * The client is named FIRST because that is what the coach is looking for when he finds the file
 * again, and because a client receiving it should see their own name on it rather than the coach's
 * private name for their plan. Both are kept: `Priya — Winter block (diet, one repeating week)`.
 *
 * A client name in a FILE NAME is not the rule this application holds about addresses — an address
 * is bookmarked, restored from a home screen and read over a shoulder, and a name in one is data put
 * somewhere it did not have to be. This artefact is the opposite case: it is made to be handed to
 * that very person, and a file called `Diet plan.png` is the one a client cannot tell from the last
 * three.
 */
export function dietExportTitle(planName: string, clientName: string | null): string {
  const plan = planName.trim() === '' ? AN_UNNAMED_PLAN : planName.trim();
  const named = clientName === null || clientName.trim() === ''
    ? plan
    : `${clientName.trim()}${BETWEEN}${plan}`;

  return `${named} (${REPEATING_WEEK_WORDS})`;
}

/**
 * THE CHART, AS THE SEAM'S OWN TABLE. This is the whole of the wiring, and it is three lines.
 *
 * `chartTable` already returns `{title, headings, rows}` — the seam's field names, because the
 * projection was renamed to the contract rather than adapted to it. The ONLY thing changed on the
 * way through is the title, and that is not a translation of shape: the projection titles the chart
 * with the plan's own name, which is right on a screen that already says whose diet is open, and
 * wrong on a file that has left the application. The rest is passed through untouched.
 *
 * The column headings are the DAY NAMES and they come off the chart, which takes them from the one
 * frozen table in `core/diet/week.js`. No list of them is written here, and the time column is
 * ordered by minutes-of-day rather than by text, because both were settled there. An export whose
 * columns disagree with the screen the coach just read is worse than a missing feature: he sends it
 * to a client without noticing.
 */
export function dietExportTable(chart: WeekChartView, clientName: string | null): Table {
  return { ...chartTable(chart), title: dietExportTitle(chart.title, clientName) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// What the coach is offered, and what he is told afterwards
// ═══════════════════════════════════════════════════════════════════════════════

/** Which of the two artefacts he asked for. There is no third, and neither takes options. */
export type DietExportKind = 'picture' | 'spreadsheet';

/** What the section offering the two exports is called. */
export const EXPORT_TITLE = 'Send this week';

/**
 * Why there are two, said once so he does not have to guess which one to tap.
 *
 * The picture is named as the one to send a client because it is: it opens inline in a messaging
 * application on any phone, with nothing to download and no application that has to own it. The
 * spreadsheet is for him and for anyone who wants to change it.
 */
export const EXPORT_WORDS =
  'Made on this device, nothing uploaded — image to send, spreadsheet to edit.';

/** The words on the control that makes the picture. */
export const SEND_AS_IMAGE = 'Send as an image';

/**
 * The words on the control that makes the workbook.
 *
 * A real `.xlsx` IS the spreadsheet here, and the seam's comma-separated writer is deliberately NOT
 * offered beside it: two controls that both say spreadsheet make the coach choose between two things
 * he cannot tell apart, in front of a client. That writer stays in the seam as the fallback for a
 * target that will not take a workbook, and `s9` may well want it for the full data export.
 */
export const SEND_AS_SPREADSHEET = 'Send as a spreadsheet';

/**
 * Said instead of the two controls when the plan on screen holds nothing.
 *
 * A plan with no meals in it projects a chart with a `Time` heading and no rows, and the seam ACCEPTS
 * that — it cannot know that one heading and no rows means "not written yet" rather than "a table
 * with one column". So the gate is here, which is where the meaning is known. Without it the coach
 * sends a client a picture of the word Time.
 */
export const NOTHING_TO_SEND = 'Nothing in this plan to send yet.';

/** Whether the week on screen can be sent, and what is said instead when it cannot. */
export interface ExportOffer {
  readonly offered: boolean;
  /** The sentence to show in place of the two controls, or null when they are drawn. */
  readonly instead: string | null;
}

/**
 * WHETHER THERE IS ANYTHING TO SEND — decided here rather than inside the component.
 *
 * It is two conditions and it could plausibly have been written inline in the markup, which is
 * exactly why it is not: this is the gate that stops the coach sending a client a picture of the
 * word Time, and a gate inside a component is a gate nothing checks. The surfaces on this screen only
 * appear once the local store has OPENED, and a static render never opens one.
 */
export function exportOffer(chart: WeekChartView | null): ExportOffer {
  if (chart === null) return { offered: false, instead: null };
  if (chart.is_empty) return { offered: false, instead: NOTHING_TO_SEND };
  return { offered: true, instead: null };
}

/** How a finished export is announced. `warning` is reserved for the file not reaching him at all. */
export type ExportTone = 'delivered' | 'kept' | 'stopped' | 'warning';

/** What the screen says after an export, and how loudly. */
export interface DietExportReport {
  /** The sentence, in the delivery layer's own words. Never reworded to sound better than it was. */
  readonly words: string;
  readonly tone: ExportTone;
}

/**
 * WHICH OUTCOME GETS WHICH VOICE — the one judgement this file makes about a delivery.
 *
 * It does not decide WHAT happened; `deliverFile` decided that and {@link describeDelivery} already
 * wrote the sentence. This maps the four outcomes onto how loudly the screen says them, and the
 * mapping is the point: a CANCELLATION IS NOT AN ERROR. He dismissed the sheet, which is a decision,
 * and a red warning against his own decision is how a coach learns to ignore the red warning that
 * matters. A fallback DOWNLOAD is not an error either — he has the file — but it is not "sent", and
 * it does not get the voice that means the client has it.
 */
export function toneOf(delivery: Delivery): ExportTone {
  switch (delivery.outcome) {
    case 'shared': return 'delivered';
    case 'downloaded': return 'kept';
    case 'cancelled': return 'stopped';
    case 'failed': return 'warning';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Doing it
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The browser, as arguments.
 *
 * Nothing in this file reaches for `document`, `navigator` or `window`. They arrive here, which is
 * what lets the share path, the fallback path and the cancelled path all be driven in a test — the
 * three that decide whether the coach is told the truth. {@link browserExportSurfaces} is the one
 * place the real browser is named, and it is called from the component.
 */
export interface DietExportSurfaces {
  readonly picture: PictureSurface;
  /** Absent when the browser has no share sheet at all, which is the ordinary desktop case. */
  readonly sharing?: SharingSurface;
  readonly download: DownloadSurface;
}

/**
 * Make the artefact and deliver it, and report what actually happened.
 *
 * Two failure shapes, both ending in a sentence rather than an exception, because this is called
 * from a tap and a coach must never meet "something went wrong":
 *
 *  - the table is one the seam will not write — a refusal, in the seam's own words, carried through
 *    unchanged the way this application carries every refusal;
 *  - the canvas gives no image back — an error, said as one.
 *
 * `deliverFile` itself never throws, so everything after the file exists is already a stated outcome.
 *
 * ## THE AUDIT IS A REQUIRED ARGUMENT AND THE WHOLE BODY RUNS INSIDE IT
 *
 * A diet week handed to a client is a disclosure, and the log records that it began and how it
 * ended — including the two refusals above, which are the half of the record that a coach actually
 * needs later: an export that failed and an export nobody attempted are otherwise the same silence.
 * The sink is required rather than optional for the reason written at `export-audit.ts`: an optional
 * one is omitted by a later call site, still compiles, and the omission cannot be seen afterwards.
 *
 * The one thing that CAN now throw out of here is the log itself failing to append, and that is
 * deliberate — see the same file.
 */
export async function sendDietExport(
  audit: ExportAudit,
  kind: DietExportKind,
  table: Table,
  surfaces: DietExportSurfaces,
): Promise<DietExportReport> {
  return auditedExport(audit, async () => {
    let file: File;
    try {
      file = kind === 'picture'
        ? await pictureFile(table, surfaces.picture)
        : workbookFile(table);
    } catch (error) {
      // The seam's own sentence, labelled and reworded nowhere. It names the cell that is wrong, which
      // is the difference between a fixable chart and a hunt through a week of meals.
      const said = error instanceof Error ? error.message : String(error);
      return { words: `This week could not be made into a file. ${said}`, tone: 'warning' as ExportTone };
    }

    const delivery = await deliverFile(file, {
      sharing: surfaces.sharing,
      download: surfaces.download,
      title: table.title,
    });

    return { words: describeDelivery(delivery, file.name), tone: toneOf(delivery) };
  });
}

/**
 * The real browser, wired at the edge and nowhere else.
 *
 * Each piece is the one the platform layer already built for it: the canvas surface at the ratio the
 * device reports, the share half of `navigator`, and a download through a temporary anchor and an
 * object URL that is always revoked. Nothing is re-implemented here; this names them.
 *
 * THE SHARE HALF IS ADAPTED BY THE PLATFORM LAYER, NOT HERE. The real `navigator` does not
 * structurally satisfy `SharingSurface` — it declares a mutable file list where the seam takes a
 * readonly one — and `browserSharing` in `share-delivery.ts` is the one honest crossing: it declares
 * the browser's actual shape, copies the array and binds the method, with no cast anywhere. That
 * bridge lives BESIDE the interface it adapts to rather than in this file, because `s9` meets the
 * identical mismatch for the progress report and would otherwise write a second one it could not
 * know already existed. The two capability questions are still NOT re-asked anywhere: whether a
 * browser has a share sheet at all, and whether it will take this particular file, are both decided
 * inside `deliverFile`, which states the reasoning and is tested on it.
 */
export function browserExportSurfaces(
  ownerDocument: Document,
  view: { readonly devicePixelRatio?: number; readonly navigator?: BrowserSharing },
  urls: { create(file: File): string; revoke(url: string): void },
): DietExportSurfaces {
  return {
    picture: browserPictureSurface(ownerDocument, view.devicePixelRatio ?? 1),
    sharing: browserSharing(view.navigator),
    download: anchorDownload(
      { createAnchor: () => ownerDocument.createElement('a') },
      urls,
    ),
  };
}

