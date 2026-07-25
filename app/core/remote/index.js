/**
 * TEST ENTRY POINT for `node --test core/remote`. This is not the module API — that is
 * `remote.js` beside it.
 *
 * ## Why this file exists
 *
 * On this runtime a positional argument to `--test` is resolved as a MODULE, not searched as
 * a directory. So a directory only works as a test target when something at that path
 * registers the tests, which is what this file does by importing each suite so they all run
 * in one process.
 *
 * Without it, `node --test core/remote` would resolve to whatever sits at the directory root
 * and report a pass having executed nothing at all. A gate that passes vacuously is worse
 * than one that fails, because it reports success while proving nothing.
 *
 * This mirrors `core/model/index.js` exactly, and for the same reason. Any future directory
 * under `core/` that carries an acceptance gate of this shape needs the same file.
 *
 * Nothing in the application imports this. It pulls in the test runner, which has no place in
 * a browser.
 */

import './port.test.js';
import './double.test.js';
import './quirks.test.js';
import './adversity.test.js';
