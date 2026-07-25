/**
 * TEST ENTRY POINT for `node --test core/status/index.js`. This is not the module API — that is
 * `status.js` beside it.
 *
 * ## Why this file exists, and why the gate names it rather than the directory
 *
 * On this runtime a positional argument to `--test` is resolved as a MODULE, not searched as a
 * directory. So a directory only works as a test target when something at that path registers the
 * tests, which is what this file does by importing each suite so they all run in one process.
 *
 * A directory target that finds no entry point does not fail loudly — it can report a PASS having
 * executed nothing at all, and on this build that has now happened three times. The recorded
 * acceptance criterion for this step therefore names this file directly: a missing or empty entry
 * point is then a hard resolution error rather than a silent success, and the reviewer independently
 * re-running the same string cannot be fooled by it either. A second opinion on an unsound criterion
 * is not a second opinion.
 *
 * This mirrors `core/remote/index.js`, `core/outbox/index.js` and `core/sync/index.js` exactly, and
 * for the same reason. **Adding a suite to this directory means adding a line here**, or the gate
 * will not run it.
 *
 * Nothing in the application imports this. It pulls in the test runner, which has no place in a
 * browser.
 *
 * The order is deliberate: the pure derivations first, then the sealed value they depend on, then the
 * surface that composes all three. If `levels` or `reasons` fails, nothing below it means much.
 */

import './levels.test.js';
import './reasons.test.js';
import './statement.test.js';
import './completion.test.js';
import './surface.test.js';
