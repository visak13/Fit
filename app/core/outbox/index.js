/**
 * TEST ENTRY POINT for `node --test core/outbox`. This is not the module API — that is `outbox.js`
 * beside it.
 *
 * ## Why this file exists
 *
 * On this runtime a positional argument to `--test` is resolved as a MODULE, not searched as a
 * directory. So a directory only works as a test target when something at that path registers the
 * tests, which is what this file does by importing each suite so they all run in one process.
 *
 * Without it, `node --test core/outbox` would resolve to whatever sits at the directory root and
 * report a pass having executed nothing at all. A gate that passes vacuously is worse than one that
 * fails, because it reports success while proving nothing — and it has cost this build three times.
 * **Adding a suite to this directory means adding a line here**, or the gate will not run it.
 *
 * This mirrors `core/store/index.js` and `core/remote/index.js` exactly, and for the same reason.
 *
 * Nothing in the application imports this file. It pulls in `node:test`, which has no place in a
 * browser bundle.
 *
 * The order is deliberate: the units first, then the claims that rest on them. If `entry` or
 * `classify` fails, nothing in the suites below it means very much.
 */

import './entry.test.js';
import './classify.test.js';
import './durability.test.js';
import './idempotency.test.js';
import './scrub.test.js';
import './flush.test.js';
import './status.test.js';
