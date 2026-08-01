/**
 * TEST ENTRY POINT for `node --test core/sync`. This is not the module API — that is `sync.js`
 * beside it.
 *
 * ## Why this file exists
 *
 * On this runtime a positional argument to `--test` is resolved as a MODULE, not searched as a
 * directory. So a directory only works as a test target when something at that path registers the
 * tests, which is what this file does by importing each suite so they all run in one process.
 *
 * Without it, `node --test core/sync` would resolve to whatever sits at the directory root and report
 * a pass having executed NOTHING AT ALL. A gate that passes vacuously is worse than one that fails,
 * because it reports success while proving nothing — and on this build it has done exactly that three
 * times. **Adding a suite to this directory means adding a line here.**
 *
 * This mirrors `core/remote/index.js` and `core/outbox/index.js` exactly, and for the same reason.
 *
 * Nothing in the application imports this. It pulls in the test runner, which has no place in a
 * browser.
 */

import './partition.test.js';
import './payload.test.js';
import './divergence.test.js';
import './divergence-provenance.test.js';
import './migration-two-sided.test.js';
import './resolution.test.js';
import './revisions.test.js';
import './snapshot.test.js';
import './deletions.test.js';
import './retention.test.js';
import './purge-outbox.test.js';
import './engine.test.js';
import './false-green.test.js';
import './conflict-aftermath.test.js';
import './durability.test.js';
import './journal-wiring.test.js';
import './independent-seeding.test.js';
import './compaction-refusal.test.js';
