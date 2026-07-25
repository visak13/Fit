/**
 * THE VISUAL FOUNDATION, IN ONE IMPORT — and the one place that says where it comes from.
 *
 * ## The token layer is consumed from its one home. It is not copied.
 *
 * `design/tokens/` is a SHARED layer. Three visual directions were built against it in parallel,
 * `design/tokens/palettes.css` is generated from `palettes.mjs`, and `design/contrast.mjs` measures
 * the whole thing — 444 pairs, 390 of them gated — and exits non-zero if one is short.
 *
 * So this file imports those files from where they live, and the bundler content-hashes the result
 * into this application's own stylesheet, which the service worker then precaches like every other
 * asset. Offline, hashed, and still one source of truth.
 *
 * THE ALTERNATIVE WAS A COPY, and it was rejected rather than overlooked, because the next person
 * to read this will be tempted by it: copying `base.css` and `palettes.css` into `src/` removes an
 * unusual import and a line of bundler configuration, and it costs the property that makes the
 * harness worth running. The harness measures the ORIGINALS. A copy drifts, and while it drifts the
 * harness keeps reporting 390 of 390, because it is still measuring files the application no longer
 * uses. Nothing errors, no gate turns red, and the interface is painted from colours nobody is
 * checking. That is the exact shape of failure this build has met repeatedly: an absence that looks
 * like a pass.
 *
 * Two things make the one-home import work, and both name the layer's location once, in
 * `tools/build-config.mjs`:
 *
 * - `vite.config.ts` allows the development server to read that directory. Without it, `npm run
 *   dev` refuses the file and the page is blank while `npm run build` succeeds.
 * - `tools/source-stamp.mjs` hashes those two files, so editing a token makes `npm run check:stale`
 *   report STALE. Without it, a colour could change in the shared layer and the committed build
 *   would still claim to be FRESH.
 *
 * ## Order is load-bearing
 *
 * `base.css` first: type, spacing, density, radius, border, elevation and motion, none of which
 * bind a colour. `palettes.css` second: every colour role, in both themes, for all three palettes.
 * `console.css` last: this application's own structural roles and the primitives screens mount on.
 * The first two never fight because neither defines what the other does; the third consumes both
 * and adds only what the shared layer does not have.
 *
 * ## What a screen imports
 *
 * Nothing. This module is imported once, by `src/main.tsx`, before the interface is created. A
 * screen writes `var(--token)` and a class name; it never reaches for a stylesheet of its own. See
 * `app/DESIGN.md` for the contract a screen mounts through.
 */

import '../../../design/tokens/base.css';
import '../../../design/tokens/palettes.css';
import './console.css';
