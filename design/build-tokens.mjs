/**
 * Writes design/tokens/palettes.css from design/tokens/palettes.mjs.
 *
 * Run:  node design/build-tokens.mjs
 *
 * This is not a build step in the sense the application means it — nothing is bundled,
 * nothing is minified, no dependency is fetched, and the output is a plain stylesheet
 * committed beside its source. It exists so that the colours have exactly ONE home, and
 * so the contrast harness can prove the shipped sheet is the sheet it measured.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderPalettesCss } from './tokens/render-css.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = join(HERE, 'tokens', 'palettes.css');

const css = renderPalettesCss();
writeFileSync(TARGET, css, 'utf8');

process.stdout.write(`wrote ${TARGET} (${Buffer.byteLength(css, 'utf8')} bytes)\n`);
process.stdout.write('now run: node design/contrast.mjs\n');
