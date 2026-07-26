/**
 * TEST ENTRY POINT for `node --test core/session`. This is not the module API — that is
 * `session.js` beside it.
 *
 * ## Why this file exists
 *
 * On Node 25 a positional argument to `--test` is a FILE glob, not a directory to search:
 * `node --test core/session` resolves the path as a module and runs it, and `node --test .` reports
 * `Could not find '.'`. A directory therefore only works as a test target if it resolves to
 * something that registers tests — which is what this file does, by importing each suite so they all
 * register and run in one process.
 *
 * Without it, `node --test core/session` would resolve to a barrel with no tests in it and report
 * `pass 1, fail 0` having executed nothing at all. A gate that passes vacuously is worse than one
 * that fails, because it reports success while proving nothing. **Adding a suite to this directory
 * means adding a line here**, or the gate will not run it.
 *
 * ## Why the API barrel is `session.js` and not this file
 *
 * Directory-index resolution is a Node convenience that does not exist in a browser, and this core is
 * written to be adopted unchanged by a browser application: `import { … } from
 * './core/session/session.js'` works in both, `'./core/session'` works in neither.
 *
 * Nothing in the application imports this file. It pulls in `node:test`, which has no place in a
 * browser bundle.
 *
 * `projection.test.js` is deliberately first: it verifies the pure reducer everything else in here
 * is projected through, and if that is wrong no other result in this directory means anything.
 */

import './projection.test.js';
import './durability.test.js';
import './modularity.test.js';
import './multi-client.test.js';
import './isolation.test.js';
import './glance.test.js';
import './bounds.test.js';
import './mode.test.js';
