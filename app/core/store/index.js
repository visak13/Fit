/**
 * TEST ENTRY POINT for `node --test core/store`. This is not the module API — that is `store.js`
 * beside it.
 *
 * ## Why this file exists
 *
 * On Node 25 a positional argument to `--test` is a FILE glob, not a directory to search:
 * `node --test core/store` resolves the path as a module and runs it, and `node --test .` reports
 * `Could not find '.'`. A directory therefore only works as a test target if it resolves to
 * something that registers tests — which is what this file does, by importing each suite so they all
 * register and run in one process.
 *
 * Without it, `node --test core/store` would resolve to a barrel with no tests in it and report
 * `pass 1, fail 0` having executed nothing at all. A gate that passes vacuously is worse than one
 * that fails, because it reports success while proving nothing. **Adding a suite to this directory
 * means adding a line here**, or the gate will not run it.
 *
 * ## Why the API barrel is `store.js` and not this file
 *
 * Directory-index resolution is a Node convenience that does not exist in a browser, and this core is
 * written to be adopted unchanged by a browser application: `import { … } from
 * './core/store/store.js'` works in both, `'./core/store'` works in neither.
 *
 * Nothing in the application imports this file. It pulls in `node:test`, which has no place in a
 * browser bundle.
 *
 * `double.test.js` is deliberately first: everything else is verified against the in-memory database
 * double, so if the double is wrong, no other result in here means anything.
 */

import './double.test.js';
import './settle.test.js';
import './schema.test.js';
import './db.test.js';
import './local-store.test.js';
import './queries.test.js';
import './coordination.test.js';
import './purge.test.js';
import './capabilities.test.js';
import './journal-wiring.test.js';
import './content-identity.test.js';
