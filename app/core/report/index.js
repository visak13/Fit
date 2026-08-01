/**
 * TEST ENTRY POINT for `node --test core/report/index.js`. This is not the module API — that is
 * `report.js` beside it.
 *
 * ## Why this file exists, and why the gate names it rather than the directory
 *
 * On this runtime a positional argument to `--test` is resolved as a MODULE, not searched as a
 * directory. So a directory only works as a test target when something at that path registers the
 * tests, which is what this file does by importing each suite so they all run in one process.
 *
 * A directory target that finds no entry point does not fail loudly — it can report a PASS having
 * executed nothing at all, and on this build that has happened repeatedly. The recorded acceptance
 * criterion for this action therefore names this file directly: a missing or empty entry point is
 * then a hard resolution error rather than a silent success, and the reviewer independently
 * re-running the same string cannot be fooled by it either.
 *
 * `tools/run-core-tests.mjs` checks that this file imports every suite beside it, so **adding a suite
 * to this directory means adding a line here**, or the gate will not run it.
 *
 * Nothing in the application imports this. It pulls in the test runner, which has no place in a
 * browser. A caller wanting the module imports `core/report/report.js` BY PATH — directory-index
 * resolution is a Node convenience the browser does not have, so importing the directory would pass
 * every test in here and break the application.
 *
 * The order is deliberate: the boundary first, because every other result in this package is only
 * meaningful if the narrowing is right; then the three derivations it feeds; then the words; then the
 * whole report; then the two suites that hold the package to its refusals — the shared-session leak,
 * and purity.
 */

import './participation.test.js';
import './trends.test.js';
import './attendance.test.js';
import './focus.test.js';
import './narrative.test.js';
import './progress.test.js';
import './privacy.test.js';
import './purity.test.js';
