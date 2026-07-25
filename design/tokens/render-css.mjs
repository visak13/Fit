/**
 * Turns the palette data into the CSS custom-property sheet.
 *
 * This lives in its own module for one reason: `build-tokens.mjs` writes the sheet with
 * it, and `contrast.mjs` re-renders it and compares the result to the committed file. So
 * a colour edited in `palettes.mjs` without rebuilding, or a hex hand-edited straight
 * into the generated CSS, is caught rather than shipped. The harness's report is only
 * evidence about the tokens if the tokens are provably what the harness measured.
 */

import { PALETTES } from './palettes.mjs';

/** The palette a document gets when it names none. The prescribed house default. */
export const DEFAULT_PALETTE_ID = 'house-sepia';

const GENERATED_HEADER = [
  '/*',
  ' * GENERATED FILE — do not edit by hand.',
  ' *',
  ' * Source: design/tokens/palettes.mjs',
  ' * Rebuild: node design/build-tokens.mjs',
  ' * Verified: node design/contrast.mjs re-renders this file and fails if it differs.',
  ' *',
  ' * HOW A DOCUMENT SELECTS ITS LOOK',
  ' *   <html>                                        the house default, light',
  ' *   <html data-theme="dark">                      the house default, dark',
  ' *   <html data-palette="slate-blue">              that palette, light',
  ' *   <html data-palette="slate-blue" data-theme="dark">   that palette, dark',
  ' *',
  ' * Both themes of every palette are in this one sheet, switched by one attribute on the',
  ' * root element. There is never a second stylesheet for dark, because a theme that lives',
  ' * in its own file is a theme that falls behind the one that does not.',
  ' */',
  '',
].join('\n');

function renderBlock(selector, values, colorScheme) {
  const lines = [`${selector} {`];
  lines.push(`  color-scheme: ${colorScheme};`);
  for (const [role, hex] of Object.entries(values)) {
    lines.push(`  --${role}: ${hex};`);
  }
  lines.push('}');
  return lines.join('\n');
}

/** The whole sheet, as a string. Deterministic: same input, same bytes, every time. */
export function renderPalettesCss() {
  const blocks = [GENERATED_HEADER];

  const fallback = PALETTES.find((palette) => palette.id === DEFAULT_PALETTE_ID);
  if (fallback === undefined) {
    throw new Error(`the default palette ${DEFAULT_PALETTE_ID} is not in the palette list`);
  }

  blocks.push('/* The default, for a document that names no palette. */');
  blocks.push(renderBlock(':root', fallback.themes.light, 'light'));
  blocks.push('');
  blocks.push(renderBlock(':root[data-theme="dark"]', fallback.themes.dark, 'dark'));
  blocks.push('');

  for (const palette of PALETTES) {
    blocks.push(`/* ${palette.name} — ${palette.id} */`);
    blocks.push(renderBlock(`:root[data-palette="${palette.id}"]`, palette.themes.light, 'light'));
    blocks.push('');
    blocks.push(
      renderBlock(`:root[data-palette="${palette.id}"][data-theme="dark"]`, palette.themes.dark, 'dark'),
    );
    blocks.push('');
  }

  return `${blocks.join('\n').trimEnd()}\n`;
}
