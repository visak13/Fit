/**
 * TEST ENTRY POINT for `node --test core/intensity`. This is not the module API — that is
 * `intensity.js` beside it.
 *
 * ## Why this file exists
 *
 * On this runtime a positional argument to `--test` is a FILE, not a directory to search:
 * `node --test core/intensity` resolves the path as a module and runs it. A directory therefore only
 * works as a test target if it resolves to something that registers tests, which is what this file
 * does by importing each suite so they all register and run in one process.
 *
 * Without it, `node --test core/intensity` would resolve to a barrel with no tests in it and report a
 * pass having executed nothing at all. That failure has been met three times in this build and it is
 * the worst shape available: a gate that reports success while proving nothing. **Adding a suite to
 * this directory means adding a line here**, or the gate will not run it — and the evidence for a
 * passing gate is the COUNT of tests actually run, never the exit status.
 *
 * ## Why the API barrel is `intensity.js` and not this file
 *
 * Directory-index resolution is a Node convenience that does not exist in a browser, and this core is
 * written to be adopted unchanged by a browser application: `import { proposeSession } from
 * './core/intensity/intensity.js'` works in both, `'./core/intensity'` works in neither.
 *
 * Nothing in the application imports this file. It pulls in `node:test`, which has no place in a
 * browser bundle.
 *
 * `curve.test.js` is deliberately first: it verifies the arithmetic every other result in here is
 * built on top of, and if that is wrong nothing else in this directory means anything.
 */

import './curve.test.js';
import './baseline.test.js';
import './placement.test.js';
import './effort.test.js';
import './proposal.test.js';
import './purity.test.js';
import './shipped-content.test.js';
