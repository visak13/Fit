/**
 * TEST ENTRY POINT for `node --test core/export/index.js`. This is not the module API — that is
 * `export.js` beside it.
 *
 * On this runtime a positional argument to `--test` resolves as a MODULE, not as a directory to
 * search, so a directory only works as a test target when something at that path registers the
 * tests. Without this file the gate reports a PASS having executed nothing at all, which on this
 * build has happened more than once. `tools/run-core-tests.mjs` checks that this file imports every
 * suite beside it, so **adding a suite to this directory means adding a line here**.
 *
 * Nothing in the application imports this. It pulls in the test runner, which has no place in a
 * browser.
 *
 * The order is deliberate: the contract first, because both writers refuse through it; then the ZIP
 * layer the workbook is packed into; then the two writers; then the name they share; then the
 * properties that must hold across all of them.
 */

import './table.test.js';
import './zip.test.js';
import './unzip.test.js';
import './workbook.test.js';
import './separated-values.test.js';
import './file-name.test.js';
import './purity.test.js';
