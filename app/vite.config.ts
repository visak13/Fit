import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { BASE_PATH, OUTPUT_DIRECTORY } from './tools/build-config.mjs';
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
