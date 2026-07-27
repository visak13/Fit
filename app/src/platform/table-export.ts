/**
 * THE EXPORT SEAM'S BROWSER SURFACE — a table and a title in, a file the coach can send out.
 *
 * This is where the two halves meet. `core/export/export.js` decides what a table is and turns one
 * into workbook bytes and comma-separated text with no browser anywhere near it;
 * `table-picture.ts` draws the same table; this file wraps each of them as a FILE, named from the
 * title, ready for `share-delivery.ts`.
 *
 * It exists so that no screen has to know that a workbook is bytes and a picture is a canvas
 * operation, and so that the same table always produces the same three artefacts with the same name.
 * **s9 imports these rather than writing its own** — the whole reason the seam was built once.
 *
 * ## THE ONE DECISION MADE HERE RATHER THAN IN THE CORE
 *
 * The comma-separated file carries a UTF-8 BYTE ORDER MARK; the core's text does not. This is
 * measured, not stylistic: the writer's output is valid UTF-8, and Excel on Windows opens a
 * comma-separated file as the system's own encoding unless a mark says otherwise — so a chart
 * reading `Diet — week of 3 August` arrives reading `Diet â€” week of 3 August`, in front of a
 * client. The mark belongs here rather than in the core because the core produces TEXT and this is a
 * fact about a FILE. Anything reading the text form back gets it unmarked.
 */

import {
  exportFileName,
  SEPARATED_VALUES_FILE_EXTENSION,
  SEPARATED_VALUES_MEDIA_TYPE,
  tableToSeparatedValues,
  tableToWorkbook,
  WORKBOOK_FILE_EXTENSION,
  WORKBOOK_MEDIA_TYPE,
} from '../../core/export/export.js';
import {
  PICTURE_FILE_EXTENSION,
  PICTURE_MEDIA_TYPE,
  renderTablePicture,
  type PictureSurface,
  type Table,
} from './table-picture.ts';

export type { Table } from './table-picture.ts';

/** What a spreadsheet application needs to read a comma-separated file as UTF-8. */
const BYTE_ORDER_MARK = '﻿';

/**
 * The table as a genuine `.xlsx` workbook.
 *
 * @throws {TypeError} Through the core's own reader, on a table it will not write.
 */
export function workbookFile(table: Table): File {
  // Copied into a buffer the type checker can prove is not shared: the core is plain ECMAScript and
  // its `Uint8Array` carries no such proof, and a file may not be built over shared memory.
  const bytes = new Uint8Array(tableToWorkbook(table));
  return new File([bytes], exportFileName(table.title, WORKBOOK_FILE_EXTENSION), {
    type: WORKBOOK_MEDIA_TYPE,
  });
}

/**
 * The table as comma-separated text — the fallback for a target that will not take a workbook.
 *
 * @throws {TypeError} Through the core's own reader, identically to {@link workbookFile}.
 */
export function separatedValuesFile(table: Table): File {
  const text = tableToSeparatedValues(table);
  return new File([BYTE_ORDER_MARK + text], exportFileName(table.title, SEPARATED_VALUES_FILE_EXTENSION), {
    type: SEPARATED_VALUES_MEDIA_TYPE,
  });
}

/**
 * The table as a picture — the artefact that lands readably in a messaging application.
 *
 * @throws {Error} When the surface gives no context or produces no image, and {@link TypeError}
 *   through the core's reader. Both are said out loud rather than resolved to an empty file.
 */
export async function pictureFile(table: Table, surface: PictureSurface): Promise<File> {
  const { blob } = await renderTablePicture(table, surface);
  return new File([blob], exportFileName(table.title, PICTURE_FILE_EXTENSION), {
    type: PICTURE_MEDIA_TYPE,
  });
}

/**
 * The real browser's canvas, wired at the edge.
 *
 * Takes the document and the ratio as arguments rather than reading globals, so everything above it
 * stays testable and this one function is the whole of the coupling.
 */
export function browserPictureSurface(ownerDocument: Document, pixelRatio: number): PictureSurface {
  return {
    pixelRatio,
    createCanvas: () => ownerDocument.createElement('canvas'),
  };
}
