/**
 * TEST ENTRY POINT for `node --test core/crypto`. This is not the module API — that is
 * `crypto.js` beside it.
 *
 * ## Why this file exists
 *
 * On this runtime a positional argument to `--test` is resolved as a MODULE, not searched as a
 * directory. So a directory only works as a test target when something at that path registers
 * the tests, which is what this file does by importing each suite so they all run in one
 * process.
 *
 * Without it, `node --test core/crypto` would resolve to whatever sits at the directory root
 * and report a pass having executed nothing at all. A gate that passes vacuously is worse than
 * one that fails, because it reports success while proving nothing — and in this directory it
 * would report that the guard against a silent, unrecoverable key split had been verified when
 * it had not been run.
 *
 * This mirrors `core/model/index.js` and `core/remote/index.js` exactly, and for the same
 * reason. Any future directory under `core/` that carries an acceptance gate of this shape
 * needs the same file.
 *
 * Nothing in the application imports this. It pulls in the test runner, which has no place in
 * a browser.
 */

import './primitives.test.js';
import './envelope.test.js';
import './sealing.test.js';
import './passphrase.test.js';
import './guard.test.js';
import './recovery.test.js';
import './journal-wiring.test.js';
