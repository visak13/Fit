/**
 * THE EXPORT SEAM — the module API. Import from here.
 *
 * Named explicitly rather than relying on directory-index resolution, for the same reason
 * `core/status/status.js` and `core/store/store.js` are: directory resolution is a runtime
 * convenience browsers do not have, and this core is written to be adopted unchanged by the browser
 * application. `'./core/export/export.js'` works in both places; `'./core/export'` works in neither.
 * `index.js` beside this file is the TEST ENTRY POINT, not the API.
 *
 * ## What this package is FOR, stated once so the next caller does not have to guess
 *
 * This is the application's first export machinery, and it is deliberately the only one there will
 * be. Two steps need it: the diet week chart the coach sends a client, and the progress report and
 * data export that come after. **A second exporter is the failure this package exists to prevent** —
 * two implementations, both passing their own tests, handing the coach two subtly different
 * spreadsheets with nothing erroring anywhere. So this is not a diet exporter that a report can
 * borrow. It takes a TABLE and a TITLE, and both callers express themselves in those terms.
 *
 * ```js
 * import {
 *   tableToWorkbook, tableToSeparatedValues, exportFileName,
 *   WORKBOOK_MEDIA_TYPE, WORKBOOK_FILE_EXTENSION,
 *   SEPARATED_VALUES_MEDIA_TYPE, SEPARATED_VALUES_FILE_EXTENSION,
 * } from './core/export/export.js';
 *
 * const table = {
 *   title: 'Diet — week of 3 August',
 *   headings: ['Day', '08:00', '13:00'],
 *   rows: [['Monday', 'Oats, 60 g', 'Chicken & rice'], ['Tuesday', 'Eggs ×3', '']],
 * };
 *
 * const bytes = tableToWorkbook(table);              // Uint8Array — a genuine .xlsx
 * const text  = tableToSeparatedValues(table);       // string — the same layout, CRLF records
 * exportFileName(table.title, WORKBOOK_FILE_EXTENSION);  // 'Diet — week of 3 August.xlsx'
 * ```
 *
 * The five things worth knowing before using it:
 *
 *  1. **The contract is a table and a title, and it does not widen for a caller that does not
 *     exist.** No options, no formatting hooks, no styling, no callbacks. Read `table.js`; its
 *     header is the contract two steps depend on.
 *  2. **Bytes and text come back, never a Blob and never a file.** Nothing in this package touches a
 *     document, a canvas, a navigator or a window — that is the browser half of the seam, under
 *     `src/`, and keeping the split means this half is testable in the core gate with nothing
 *     mocked. A test asserts the absence rather than trusting it.
 *  3. **Both writers refuse the same input.** They read through `readTable`, so a cell holding a
 *     record is a thrown sentence in both and `[object Object]` in neither.
 *  4. **The workbook is a real workbook** — a store-only ZIP of five OOXML parts, ported from code
 *     verified on the installed iOS app, not a comma-separated file wearing a spreadsheet's name.
 *  5. **Escaping is not optional and not the caller's job.** A meal called `Yoghurt & fruit`, a note
 *     reading `<200 kcal`, a quotation mark, a comma, a line break inside a cell: all of them
 *     survive both writers intact, and each is pinned by its own test.
 */

export { readTable } from './table.js';

export {
  tableToWorkbook,
  sheetNameFor,
  escapeXml,
  columnLetter,
  WORKBOOK_MEDIA_TYPE,
  WORKBOOK_FILE_EXTENSION,
  WORKBOOK_PARTS,
} from './workbook.js';

export {
  tableToSeparatedValues,
  SEPARATED_VALUES_MEDIA_TYPE,
  SEPARATED_VALUES_FILE_EXTENSION,
} from './separated-values.js';

export { exportFileName } from './file-name.js';

export { storeOnlyZip, crc32 } from './zip.js';

export { readStoreOnlyZip, readStoreOnlyZipParts, STORED } from './unzip.js';
