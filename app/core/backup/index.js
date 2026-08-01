/**
 * TEST ENTRY POINT for `node --test core/backup/index.js`. This is not the module API — that is
 * `backup.js` beside it.
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
 * The order is the order the coach meets the feature: the walk that takes a copy, the read that puts
 * it back, the encrypted file he keeps elsewhere, the nudge that reminds him — and then the purity
 * suite, which reads the package rather than a function and goes last for that reason.
 */

import './collect.test.js';
import './restore.test.js';
import './archive.test.js';
import './nudge.test.js';
import './purity.test.js';
