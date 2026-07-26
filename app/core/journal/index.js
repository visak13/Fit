/**
 * TEST ENTRY POINT for `node --test core/journal/index.js`. This is not the module API — that is
 * `journal.js` beside it.
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
 * re-running the same string cannot be fooled by it either.
 *
 * This mirrors `core/status/index.js`, `core/store/index.js` and `core/crypto/index.js` exactly, and
 * for the same reason. **Adding a suite to this directory means adding a line here**, or the gate
 * will not run it — `tools/run-core-tests.mjs` checks that this file imports every `*.test.js`
 * beside it, precisely because an entry point that lists only some of them reports a plausible
 * number having run less than it claims.
 *
 * Nothing in the application imports this. It pulls in the test runner, which has no place in a
 * browser.
 *
 * The order is deliberate: the vocabulary first, because the entry shape is built out of it; then
 * the entry, because the chain is built out of that. If `kinds` fails, nothing below it means much.
 * Retention's policy is pure arithmetic and comes before the durable seam that applies it, for the
 * same reason.
 */

import './kinds.test.js';
import './entry.test.js';
import './chain.test.js';
import './retention.test.js';
import './durable.test.js';
import './unwritten-kinds.test.js';
