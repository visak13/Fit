/**
 * THE SEED PACKAGE — the module API.
 *
 * Plain, dependency-free ECMAScript modules. No framework, no bundler, no build step, no
 * third-party package; types are expressed in documentation comments. Named explicitly rather
 * than as a directory, because directory-index resolution is a Node convenience that does not
 * exist in a browser and this core is written to be adopted unchanged.
 *
 * Start at `SEED.md` beside this file for the written notes.
 *
 * ```js
 * import { seedIfNeeded, describeReset, resetToDefaults } from './core/seed/seed.js';
 *
 * await seedIfNeeded(store);                      // first run: the shipped library lands
 *
 * const plan = await describeReset(store);        // what the confirmation needs to say
 * await resetToDefaults(store, { backup: takeBackup });
 * ```
 *
 * Three things worth knowing before using it:
 *
 *  1. **Unreferenced content is NORMAL and is never pruned.** The catalogue deliberately exceeds
 *     the week; the surplus is the substitution pool.
 *  2. **First run is decided from the store, never from a flag.**
 *  3. **This package exposes the reset capability; it writes none of the words.** The
 *     confirmation the coach reads belongs to the interface step.
 */

export * from './content.js';
export * from './provenance.js';
export * from './import.js';
export * from './reset.js';
