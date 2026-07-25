/**
 * TEST ENTRY POINT for `node --test core/seed`. This is not the module API — that is
 * `seed.js` beside it.
 *
 * ## Why this file exists
 *
 * On this runtime a positional argument to `--test` is resolved as a MODULE, not searched as a
 * directory. A directory therefore only works as a test target if something at that path
 * registers tests — which is what this file does, by importing each suite so they all register
 * and run in one process.
 *
 * Without it, `node --test core/seed` would resolve to a barrel with no tests in it and report
 * success having executed nothing at all. A gate that passes vacuously is worse than one that
 * fails, because it reports success while proving nothing — and that has already cost this
 * build three times. The same reasoning, and the same file, exist in `core/model` and
 * `core/store`.
 *
 * **Anyone reading a passing run of this gate should read the TEST COUNT, not the exit code.**
 *
 * Nothing in the application imports this file. It pulls in `node:test`, which has no place in
 * a browser bundle.
 */

import './content-drift.test.js';
import './import.test.js';
import './reset.test.js';
import './substitution-pool.test.js';
