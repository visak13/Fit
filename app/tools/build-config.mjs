/**
 * THE BUILD'S TWO LOCATIONS, EACH NAMED EXACTLY ONCE.
 *
 * A location that appears in more than one file is a location that can silently disagree with
 * itself. This project has already paid for that once: the published sub-path was originally
 * written out in four places — the bundler base, the manifest start URL, the manifest scope and
 * the manifest icon paths — and the four had to agree or the installed application half-broke in
 * ways nobody could describe. It is now named once and derived everywhere. This module is the
 * same treatment for the other location that was still hardcoded.
 *
 * ## Why the OUTPUT DIRECTORY needed it too, and it is not tidiness
 *
 * The site is served by a static host that publishes a branch's ROOT or a `docs/` directory and
 * nothing else. This application builds to neither, and no continuous-integration service is
 * permitted to move the output afterwards. So the publish step is going to have to point the
 * build somewhere else — that is not speculation, it is arithmetic.
 *
 * If the output directory were still hardcoded in four files when that happens, the likely
 * failure is not a crash. It is that the build writes a perfectly correct artefact into a
 * directory nothing will ever serve, every check passes, and the mismatch survives all the way to
 * the coach opening the URL and finding the wrong thing there. That is the absence-that-looks-
 * like-a-pass shape this build has met repeatedly, and it would be the worst instance of it,
 * because every automated signal would be green the entire way.
 *
 * Naming it once turns that from a structural change spread across four files into a ONE-VALUE
 * change made in this file. The publish step then decides the layout, which is its decision to
 * make: it interacts with how the repository is rooted and with ignore rules that a separate
 * publish branch does NOT automatically inherit. Nothing here chooses that layout, and nothing
 * here should.
 *
 * ## Who reads these
 *
 * - `vite.config.ts`      — `base` and `build.outDir`.
 * - `tools/finish-build.mjs` — where to write the build record and the service worker.
 * - `tools/check-stale.mjs`  — where to find the build record to compare against.
 * - `tools/source-stamp.mjs` — which directory to EXCLUDE from the stamp, since the artefact must
 *                              never be an input to the hash that judges it.
 *
 * Plain ECMAScript with no imports, so both the TypeScript config file and the plain-Node tools
 * can read it without a build step standing between them.
 */

/**
 * Where the bundler writes the built site, relative to the application root.
 *
 * CHANGE THIS ONE VALUE to move the build output. Everything above derives from it, including the
 * stamp's exclusion rule, so a move cannot leave one reader pointing at the old place.
 *
 * @type {string}
 */
export const OUTPUT_DIRECTORY = 'dist';

/**
 * The published sub-path. The site is a project page served under the repository name, so every
 * asset URL carries this prefix; getting it wrong produces a page that loads locally and is blank
 * in production. Scheme and host are NOT part of it, and it always ends in a slash.
 *
 * @type {string}
 */
export const BASE_PATH = '/Fit/';

/**
 * The bundler's structured record of what it emitted, relative to the output directory.
 *
 * This is what replaced pattern-matching the built markup. See `tools/finish-build.mjs` for why
 * reading the built HTML with a regular expression was the wrong shape of answer.
 *
 * @type {string}
 */
export const BUNDLER_MANIFEST_FILE = '.vite/manifest.json';
