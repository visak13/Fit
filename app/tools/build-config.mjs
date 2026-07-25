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
 * - `vite.config.ts`      — `base`, `build.outDir`, and the one directory outside this application
 *                              that the bundler is allowed to read from.
 * - `tools/finish-build.mjs` — where to write the build record and the service worker.
 * - `tools/check-stale.mjs`  — where to find the build record to compare against.
 * - `tools/source-stamp.mjs` — which directory to EXCLUDE from the stamp, since the artefact must
 *                              never be an input to the hash that judges it; and which files
 *                              OUTSIDE this application feed it.
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

/**
 * THE TOKEN LAYER — the one place the application's visual vocabulary is defined, and it lives
 * OUTSIDE this application.
 *
 * `design/tokens/` is shared: three visual directions were built against it and a contrast harness
 * measures it as a whole. The application consumes it from there. It is NOT copied in, and the
 * reason is the failure mode rather than the tidiness: a copy is a second source of truth, and
 * `design/contrast.mjs` measures the ORIGINAL. The harness would go on passing at 390 of 390 while
 * the application drifted away from the values it was measuring, and every signal would stay green.
 *
 * Path is relative to the application root, in POSIX form, because both the bundler config and the
 * plain-Node tools join it against that root.
 *
 * @type {string}
 */
export const TOKEN_LAYER_DIRECTORY = '../design/tokens';

/**
 * THE GLYPH FAMILY'S ONE HOME — forty-nine SVGs, also OUTSIDE this application.
 *
 * `design/icons/` is shared in the same sense `design/tokens/` is: it was drawn once, against all
 * three directions, and `design/icons/index.html` is the family sheet it was reviewed on. The
 * application does not read it at runtime and the bundler never sees it. `tools/make-glyphs.mjs`
 * reads it at AUTHORING time and writes `src/design/glyphs.generated.ts`, which is what ships.
 *
 * ## Why this is NOT in `TOKEN_LAYER_FILES`, and it is a deliberate answer rather than an omission
 *
 * The rule this project learned the hard way is that a shared layer consumed from its one home must
 * be added to the freshness marker in the same change, or the one-home decision quietly creates the
 * failure it was meant to prevent. That rule is about files the BUILD READS: a token can change and
 * the committed artefact goes on claiming to be fresh, because nothing hashed changed.
 *
 * These do not have that shape. Editing an SVG here cannot alter a byte of the artefact — the
 * artefact is derived from the GENERATED module, which lives under `src/` and is hashed like any
 * other source file. Adding these to the stamp would report `dist/` stale for an edit that provably
 * did not reach it, which is the cries-wolf failure the stamp's own header warns about.
 *
 * What could still go wrong is different, so it is guarded differently: an SVG edited without the
 * generator being re-run. That is a DRIFT between two files, not a stale artefact, and
 * `src/design/glyphs.test.ts` re-derives the module from this directory on every `npm run
 * test:shell` and fails if a single byte differs.
 *
 * Path is relative to the application root, in POSIX form, for the same reason the token layer's is.
 *
 * @type {string}
 */
export const GLYPH_SOURCE_DIRECTORY = '../design/icons';

/**
 * The token files the bundle actually contains, relative to the application root.
 *
 * Only the two stylesheets are listed, and deliberately: they are what the build reads and what
 * ships. `palettes.mjs` generates `palettes.css` and `README.md` documents the layer, but neither
 * can alter a byte of the artefact — and `design/contrast.mjs` already fails if the generated
 * stylesheet has drifted from its source, so nothing is left unguarded by leaving them out. A
 * freshness marker that fires on a README edit is a marker people learn to ignore.
 *
 * Read by `tools/source-stamp.mjs`, so that editing a token makes `dist/` report STALE. Without
 * this the application could ship a rebuilt bundle whose colours came from an older token layer
 * and `npm run check:stale` would answer FRESH.
 *
 * @type {readonly string[]}
 */
export const TOKEN_LAYER_FILES = Object.freeze([
  `${TOKEN_LAYER_DIRECTORY}/base.css`,
  `${TOKEN_LAYER_DIRECTORY}/palettes.css`,
]);
