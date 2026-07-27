/**
 * THE TABLE AS A PICTURE — the artefact that lands in a client's messaging app.
 *
 * This is the browser half of the export seam. The pure half is `core/export/export.js`: it settles
 * what a table IS and turns one into workbook bytes and comma-separated text. This file takes the
 * SAME table and the same title and draws it, because the thing a coach actually sends a client is
 * usually a picture — it opens inline, on any phone, with nothing to download and no application to
 * own it.
 *
 * ## READABLE IS THE REQUIREMENT, so the size is MEASURED and never guessed
 *
 * A fixed canvas is what makes a shared chart useless: a long meal name is clipped at the edge, a
 * three-row chart floats in a field of white, and the coach only finds out after his client has it.
 * So {@link planTablePicture} measures every cell with the same context that will draw it, wraps
 * what is too wide for a column, and sizes the image from the result. Nothing here is a guess about
 * how much text there will be.
 *
 * **Device pixel ratio is applied, and it is not a detail.** A canvas sized in CSS pixels and shared
 * as an image is a soft, faintly blurred picture on a phone — the one device this artefact is made
 * on and read on. The bitmap is the plan's size multiplied by the ratio, the context is scaled once,
 * and everything below draws in plain CSS pixels without knowing. The ratio is reduced — never the
 * picture abandoned — when that multiplication would exceed what a browser will allocate.
 *
 * ## THE DECISIONS ARE HERE; THE BROWSER IS AT THE EDGE
 *
 * `planTablePicture` and the wrapping under it are plain functions over numbers and strings — a test
 * drives them with a measurer that needs no canvas at all, which is what makes the layout assertable
 * rather than eyeballed. Only {@link renderTablePicture} touches a real surface, through
 * {@link PictureSurface}, which a test substitutes. Same split as `storage-persistence.ts` and
 * `google-meet.ts`: the platform is an argument, never a global reached for.
 *
 * ## IT TAKES A TABLE AND A TITLE
 *
 * No options, no presets, no styling parameters, no callbacks. The seam has two named callers and
 * the second one extends it deliberately when it gets there.
 */

import { readTable } from '../../core/export/export.js';

/**
 * The table contract itself, taken FROM THE CORE rather than restated here.
 *
 * `core/export/table.js` declares it and this file imports it, the same way `google-drive-remote.ts`
 * imports `Clock` from `core/remote/clock.js`. Nothing about the shape is written twice, and nothing
 * here validates: the drawing calls the core's own `readTable`, so a cell this refuses is refused
 * identically by the workbook and the comma-separated writers.
 */
export type { Table } from '../../core/export/table.js';
import type { Table } from '../../core/export/table.js';

// ═══════════════════════════════════════════════════════════════════════════════
// The slice of the browser this needs, named so a test can supply its own
// ═══════════════════════════════════════════════════════════════════════════════

/** What `measureText` gives back, reduced to the one number used. */
export interface TextMetricsLike {
  readonly width: number;
}

/** The drawing calls used here, and no others. */
export interface DrawingContext {
  font: string;
  /** Widened to the real context's own type, so a browser canvas satisfies this without a cast. */
  fillStyle: string | CanvasGradient | CanvasPattern;
  textBaseline: CanvasTextBaseline;
  measureText(text: string): TextMetricsLike;
  fillText(text: string, x: number, y: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  scale(x: number, y: number): void;
}

/** A canvas, reduced to what producing an image needs. */
export interface PictureCanvas {
  width: number;
  height: number;
  getContext(contextId: '2d'): DrawingContext | null;
  toBlob(callback: (blob: Blob | null) => void, type?: string): void;
}

/** Where a canvas comes from, and at what pixel ratio. Supplied, never reached for. */
export interface PictureSurface {
  createCanvas(): PictureCanvas;
  /** `window.devicePixelRatio` in the application; a fixed number in a test. */
  readonly pixelRatio: number;
}

/** Text measured with a given font. The layout needs nothing else from a context. */
export interface TextMeasurer {
  (text: string, font: string): number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// The look. Fixed, because the seam takes a table and a title.
// ═══════════════════════════════════════════════════════════════════════════════

const TITLE_FONT = 'bold 30px system-ui, -apple-system, "Segoe UI", sans-serif';
const HEADING_FONT = 'bold 17px system-ui, -apple-system, "Segoe UI", sans-serif';
const CELL_FONT = '17px system-ui, -apple-system, "Segoe UI", sans-serif';

const INK = '#101418';
const QUIET_INK = '#5a6875';
const PAPER = '#ffffff';
const RULE = '#d7dee6';
const HEADING_PAPER = '#f2f5f8';

const MARGIN = 28;
const CELL_PADDING = 14;
const LINE_HEIGHT = 24;
const TITLE_HEIGHT = 46;
const TITLE_GAP = 18;

/**
 * How wide one column may grow before its text wraps instead.
 *
 * A cap is what keeps a picture shareable: without one, a single long note makes an image thousands
 * of pixels wide, which a messaging application scales down until every other row is unreadable.
 */
const MAX_COLUMN_WIDTH = 340;

/** Below this a column of short values looks like a mistake rather than a column. */
const MIN_COLUMN_WIDTH = 56;

/** Beyond this a picture is refused rather than produced: a browser silently fails on a huge canvas. */
const MAX_PIXELS = 4096;

// ═══════════════════════════════════════════════════════════════════════════════
// The plan — pure, and the part worth testing
// ═══════════════════════════════════════════════════════════════════════════════

/** One cell, already wrapped to its column. */
export interface PlannedCell {
  readonly lines: readonly string[];
  /** Right-aligned when the value was a number, as a spreadsheet would show it. */
  readonly alignRight: boolean;
}

/** One row, at its measured height. */
export interface PlannedRow {
  readonly y: number;
  readonly height: number;
  readonly heading: boolean;
  readonly cells: readonly PlannedCell[];
}

/** Everything the drawing needs, in CSS pixels, decided without a canvas. */
export interface PicturePlan {
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly columns: readonly { readonly x: number; readonly width: number }[];
  readonly rows: readonly PlannedRow[];
}

/**
 * Decide the picture's size and every line of text in it.
 *
 * @param table The same contract the workbook and the comma-separated writers take.
 * @param measure Text width for a given font — the real context's in the application.
 * @throws {TypeError} Through `readTable`, on a table no writer would accept either.
 */
export function planTablePicture(table: Table, measure: TextMeasurer): PicturePlan {
  const read = readTable(table);

  const bodyRows: { cells: readonly (string | number)[]; heading: boolean }[] = [];
  if (read.headings.length > 0) bodyRows.push({ cells: read.headings, heading: true });
  for (const row of read.rows) bodyRows.push({ cells: row, heading: false });

  const columnCount = bodyRows.reduce((widest, row) => Math.max(widest, row.cells.length), 0);

  // A column is as wide as its widest cell needs, up to the cap. Measured across every row,
  // including the headings, so a heading is never the thing that gets clipped.
  const columnWidths: number[] = [];
  for (let column = 0; column < columnCount; column += 1) {
    let widest = 0;
    for (const row of bodyRows) {
      const font = row.heading ? HEADING_FONT : CELL_FONT;
      for (const line of String(row.cells[column] ?? '').split('\n')) {
        widest = Math.max(widest, measure(line, font));
      }
    }
    columnWidths.push(clamp(Math.ceil(widest) + CELL_PADDING * 2, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH));
  }

  const columns: { x: number; width: number }[] = [];
  let x = MARGIN;
  for (const width of columnWidths) {
    columns.push({ x, width });
    x += width;
  }

  const rows: PlannedRow[] = [];
  let y = MARGIN + TITLE_HEIGHT + TITLE_GAP;

  for (const row of bodyRows) {
    const font = row.heading ? HEADING_FONT : CELL_FONT;
    const cells: PlannedCell[] = columns.map((column, index) => {
      const value = row.cells[index];
      return {
        lines: wrap(String(value ?? ''), column.width - CELL_PADDING * 2, font, measure),
        alignRight: typeof value === 'number',
      };
    });

    const tallest = cells.reduce((most, cell) => Math.max(most, cell.lines.length), 1);
    const height = tallest * LINE_HEIGHT + CELL_PADDING * 2;
    rows.push({ y, height, heading: row.heading, cells });
    y += height;
  }

  // The title is not allowed to be the thing that is clipped either: a picture narrower than its own
  // title is a picture whose whole subject is cut off.
  const tableWidth = columns.reduce((total, column) => total + column.width, 0);
  const titleWidth = Math.ceil(measure(read.title, TITLE_FONT));
  const width = Math.max(tableWidth, titleWidth) + MARGIN * 2;

  return {
    title: read.title,
    width,
    height: y + MARGIN,
    columns,
    rows,
  };
}

/**
 * Draw a plan. Every coordinate is in CSS pixels; the caller has already scaled the context.
 */
export function drawTablePicture(plan: PicturePlan, context: DrawingContext): void {
  context.fillStyle = PAPER;
  context.fillRect(0, 0, plan.width, plan.height);

  context.textBaseline = 'top';
  context.fillStyle = INK;
  context.font = TITLE_FONT;
  context.fillText(plan.title, MARGIN, MARGIN);

  for (const row of plan.rows) {
    if (row.heading) {
      context.fillStyle = HEADING_PAPER;
      context.fillRect(MARGIN, row.y, tableWidthOf(plan), row.height);
    }

    // The rule under each row, which is what makes a grid of text read as a table at a glance.
    context.fillStyle = RULE;
    context.fillRect(MARGIN, row.y + row.height - 1, tableWidthOf(plan), 1);

    context.font = row.heading ? HEADING_FONT : CELL_FONT;
    context.fillStyle = row.heading ? QUIET_INK : INK;

    row.cells.forEach((cell, index) => {
      const column = plan.columns[index];
      if (!column) return;
      cell.lines.forEach((line, lineIndex) => {
        // A number sits against the right edge of its column, which is what makes a column of loads
        // or grams readable down the page rather than a ragged left-hand stack. Measured with the
        // font already set above, so the alignment is the row's own font and not the last one used.
        const x = cell.alignRight
          ? column.x + column.width - CELL_PADDING - context.measureText(line).width
          : column.x + CELL_PADDING;
        context.fillText(line, x, row.y + CELL_PADDING + lineIndex * LINE_HEIGHT);
      });
    });
  }
}

/**
 * Draw the table and hand back a real image.
 *
 * @returns The image, and the size it was drawn at, so a caller can say so.
 * @throws {Error} When the surface has no 2d context, or produces no image. Both are refusals, not
 *   silent empties: a share with nothing in it is worse than a share that did not happen.
 */
export async function renderTablePicture(
  table: Table,
  surface: PictureSurface,
): Promise<{ blob: Blob; width: number; height: number }> {
  const measuringCanvas = surface.createCanvas();
  const measuringContext = measuringCanvas.getContext('2d');
  if (!measuringContext) throw new Error('This browser gave no 2d canvas context, so no picture can be drawn.');

  const measure: TextMeasurer = (text, font) => {
    measuringContext.font = font;
    return measuringContext.measureText(text).width;
  };

  const plan = planTablePicture(table, measure);
  if (plan.width > MAX_PIXELS || plan.height > MAX_PIXELS) {
    throw new Error(
      `This table is too large to share as a picture (${plan.width}×${plan.height}). Share it as a spreadsheet instead.`,
    );
  }

  // The ratio is clamped rather than trusted: a ratio of zero from a substitute surface would
  // produce a canvas with no pixels, and a very high one multiplies the bitmap past what a phone
  // will allocate — which fails by producing nothing rather than by throwing.
  const requested = clamp(Number.isFinite(surface.pixelRatio) ? surface.pixelRatio : 1, 1, 3);

  // THE LIMIT APPLIES TO THE BITMAP, NOT THE DRAWING. What a browser refuses to allocate is
  // `plan × ratio`, so a chart comfortably inside the limit in CSS pixels is three times outside it
  // on a phone — and that failure arrives as `toBlob` handing back nothing. So the ratio is reduced
  // until the bitmap fits: a picture slightly softer than the screen deserves beats no picture at
  // all, and a plan that will not fit even at a ratio of one was already refused above.
  const ratio = Math.min(requested, MAX_PIXELS / plan.width, MAX_PIXELS / plan.height);

  const canvas = surface.createCanvas();
  canvas.width = Math.ceil(plan.width * ratio);
  canvas.height = Math.ceil(plan.height * ratio);

  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser gave no 2d canvas context, so no picture can be drawn.');

  context.scale(ratio, ratio);
  drawTablePicture(plan, context);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((produced) => resolve(produced), PICTURE_MEDIA_TYPE);
  });
  if (!blob) throw new Error('The browser produced no image from the canvas, so there is nothing to share.');

  return { blob, width: plan.width, height: plan.height };
}

/** What the picture is. PNG, because text drawn on white must not be smeared by lossy compression. */
export const PICTURE_MEDIA_TYPE = 'image/png';

/** The extension that goes with it, with its dot. */
export const PICTURE_FILE_EXTENSION = '.png';

// ═══════════════════════════════════════════════════════════════════════════════
// Wrapping
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * One cell's text, broken into lines that fit.
 *
 * A break the coach typed is kept — two items on two lines stay on two lines. A word longer than the
 * column is broken across lines rather than clipped, because a clipped word is a word the client
 * silently never sees.
 */
export function wrap(text: string, maxWidth: number, font: string, measure: TextMeasurer): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(' ').filter((word) => word !== '');
    if (words.length === 0) { lines.push(''); continue; }

    let line = '';
    for (const word of words) {
      const candidate = line === '' ? word : `${line} ${word}`;
      if (line !== '' && measure(candidate, font) > maxWidth) {
        lines.push(line);
        line = '';
      }
      if (measure(word, font) > maxWidth) {
        const pieces = breakWord(line === '' ? word : `${line} ${word}`, maxWidth, font, measure);
        lines.push(...pieces.slice(0, -1));
        line = pieces[pieces.length - 1] ?? '';
        continue;
      }
      line = line === '' ? word : `${line} ${word}`;
    }
    lines.push(line);
  }

  return lines;
}

/**
 * A single run of text with no usable break in it, cut by character.
 *
 * The loop always consumes at least one character per line, so a measurer that reports every string
 * as too wide produces one character per line rather than an unterminated loop — a layout failure
 * the coach can see beats a tab that hangs while he waits to share.
 */
function breakWord(text: string, maxWidth: number, font: string, measure: TextMeasurer): string[] {
  const pieces: string[] = [];
  let piece = '';

  for (const character of text) {
    const candidate = piece + character;
    if (piece !== '' && measure(candidate, font) > maxWidth) {
      pieces.push(piece);
      piece = character;
      continue;
    }
    piece = candidate;
  }

  pieces.push(piece);
  return pieces;
}

/** @returns The table's width in CSS pixels, excluding the margins. */
function tableWidthOf(plan: PicturePlan): number {
  return plan.columns.reduce((total, column) => total + column.width, 0);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
