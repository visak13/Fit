/**
 * TEST ENTRY POINT for `node --test core/model`. This is not the module API — that is
 * `model.js` beside it.
 *
 * ## Why this file exists
 *
 * On Node 25 a positional argument to `--test` is a FILE glob, not a directory to search:
 * `node --test core/model` resolves the path as a module and runs it, and `node --test .`
 * simply reports `Could not find '.'`. A directory therefore only works as a test target if
 * it resolves to something that registers tests — which is what this file does, by importing
 * each suite so they all register and run in one process.
 *
 * Without it, `node --test core/model` would resolve to a barrel with no tests in it and
 * report `pass 1, fail 0` having executed nothing at all. A gate that passes vacuously is
 * worse than one that fails, because it reports success while proving nothing.
 *
 * ## Why the API barrel is `model.js` and not this file
 *
 * Directory-index resolution is a Node convenience that does not exist in a browser, and
 * this core is written to be adopted unchanged by a browser application: `import { … } from
 * './core/model/model.js'` works in both, `'./core/model'` works in neither. Naming the
 * barrel explicitly is the honest form for where this code actually runs.
 *
 * Nothing in the application imports this file. It pulls in `node:test`, which has no place
 * in a browser bundle.
 */

import './envelope.test.js';
import './entities.test.js';
import './referential.test.js';
import './seed-conformance.test.js';
