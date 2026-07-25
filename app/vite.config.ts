import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import path from 'node:path';

import { BASE_PATH, OUTPUT_DIRECTORY, TOKEN_LAYER_DIRECTORY } from './tools/build-config.mjs';
import { computeSourceStamp } from './tools/source-stamp.mjs';

/**
 * The source stamp is embedded in the bundle so the running application can show which build it
 * is. `tools/finish-build.mjs` computes the same value from the same source for `build-info.json`
 * and the service worker's cache name; there is one definition and three readers, never three
 * definitions.
 */
const { stamp: sourceStamp } = await computeSourceStamp();

export default defineConfig({
  base: BASE_PATH,
  plugins: [react()],
  server: {
    fs: {
      /**
       * THE ONE DIRECTORY OUTSIDE THIS APPLICATION THE BUNDLER MAY READ.
       *
       * `src/design/design-system.ts` imports the shared token layer from `design/tokens`, which is
       * a sibling of this application rather than a file inside it. The development server refuses
       * to serve files outside its root unless they are allowed here, and the refusal arrives as a
       * blank page rather than as a build error — so this entry is what keeps `npm run dev`
       * agreeing with `npm run build`.
       *
       * THE ALTERNATIVE, AND WHY IT WAS REJECTED. The obvious way to avoid this line is to copy
       * `base.css` and `palettes.css` into `src/`. That is a second source of truth, and it fails
       * silently: `design/contrast.mjs` measures the ORIGINAL files and would go on reporting 390
       * of 390 while the application's copy drifted away from the values being measured. Every
       * signal stays green and the interface is painted from colours nobody is checking. One line
       * of configuration is the cheaper half of that trade.
       */
      allow: [path.resolve(import.meta.dirname, TOKEN_LAYER_DIRECTORY), import.meta.dirname],
    },
  },
  define: {
    __BUILD_STAMP__: JSON.stringify(sourceStamp),
  },
  build: {
    // Named once in tools/build-config.mjs and derived by every reader. Moving the output is a
    // one-value change there, which is what the publish step will need when it points this
    // somewhere the static host can actually serve.
    outDir: OUTPUT_DIRECTORY,
    // Committed output: a build that changes every file on every run makes the repository history
    // unreadable. Content hashing means only what actually changed shows up in a diff.
    emptyOutDir: true,
    sourcemap: false,
    // The bundler's own structured record of what it emitted, including which chunk is the entry.
    // `tools/finish-build.mjs` reads the entry from here instead of pattern-matching the built
    // markup, then deletes the manifest so it never reaches the published artefact.
    manifest: true,
  },
});
