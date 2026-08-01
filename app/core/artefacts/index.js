/**
 * TEST ENTRY POINT for `node --test core/artefacts/index.js`. This is not the module API — that is
 * `artefacts.js` beside it.
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
 * The order is deliberate: the three things this package makes, in the order the coach meets them —
 * the report he sends a client, the backup of his own library, the checklist behind the full export
 * — and then the one suite that reads a FINISHED ARTEFACT rather than a function. That one goes last
 * because it is the only claim here that is about bytes, and it is the load-bearing one.
 */

import './report-table.test.js';
import './library-backup.test.js';
import './restorable-backup.test.js';
import './checklist.test.js';
import './full-export-contents.test.js';
import './purity.test.js';
import './export-privacy.test.js';
