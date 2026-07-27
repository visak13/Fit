/**
 * TEST ENTRY POINT for `node --test core/diet/index.js`. This is not the module API — that is
 * `diet.js` beside it.
 *
 * On this runtime a positional argument to `--test` is resolved as a MODULE, not searched as a
 * directory, so a directory only works as a test target when something at that path registers the
 * tests. That is what this file does. A directory with no entry point does not fail loudly: it
 * reports a PASS having executed nothing, which has happened repeatedly on this build.
 *
 * **Adding a suite to this directory means adding a line here**, or the gate will not run it — and
 * `tools/run-core-tests.mjs` checks that every `*.test.js` beside this file is imported, so a
 * forgotten line is a red gate rather than a quiet gap.
 *
 * The order is deliberate: the week table and the time ordering first, because both projections and
 * the import path are built on them; then the chart, then the history, then the import; then purity,
 * which reads the finished package off the disk.
 *
 * Nothing in the application imports this. It pulls in the test runner, which has no place in a
 * browser.
 */

import './week.test.js';
import './chart.test.js';
import './history.test.js';
import './import.test.js';
import './purity.test.js';
