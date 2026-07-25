/**
 * TEST ENTRY POINT for `node --test core/integration`. This directory has no module API — it is
 * cross-strand scenarios and nothing else, so there is no `integration.js` beside this file.
 *
 * On this runtime a positional argument to `--test` resolves as a MODULE rather than being
 * searched as a directory, so a directory only works as a test target when something at that path
 * registers the tests. Without this file the command would resolve to nothing and report success
 * having executed nothing at all — the vacuous pass that has cost this build repeatedly.
 *
 * The aggregate gate checks that every `*.test.js` beside this file is imported here, so a suite
 * added without a line below fails the gate rather than silently never running.
 *
 * Nothing in the application imports this. It pulls in the test runner, which has no place in a
 * browser bundle.
 */

import './session-lifecycle.test.js';
import './two-devices.test.js';
import './deletion-and-reset.test.js';
import './leak-sweep.test.js';
