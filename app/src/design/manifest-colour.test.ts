/**
 * THE TWO LITERALS THE TOKEN LAYER CANNOT REACH — CHECKED ANYWAY.
 *
 * `public/manifest.webmanifest` is JSON: no comments, no custom properties, and one `theme_color`
 * and one `background_color` that cannot follow a theme. `app/DESIGN.md` names it as the single
 * exception to the no-literals rule, records that both values are a copy of `--surface-page` in the
 * `slate-blue` DARK theme, and states the accepted cost of choosing dark.
 *
 * That contract ends with "nothing checks them, because nothing can". The first half was true; the
 * second half was not, and this file is the difference. A COPY cannot be kept honest by a rule
 * saying it must be updated with its original — that rule is a person remembering, and the failure
 * it guards against is silent by construction: the token moves, the manifest keeps the old value,
 * the built site installs with a splash screen in a colour the application no longer uses, and
 * nothing anywhere errors.
 *
 * So the ORIGINAL is read here — from `design/tokens/palettes.css`, at its one home, the same files
 * `design-system.ts` imports and `source-stamp.mjs` hashes — and compared to the copy. What the
 * manifest cannot do is FOLLOW the token. Agreeing with it at build time is a different thing, and
 * that is checkable.
 *
 * If this fails, the fix is to make the manifest match the token layer and to update the two
 * literals quoted in `DESIGN.md` alongside it. Do not change the expectation to match the manifest:
 * the token layer is the source and the manifest is the copy.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { TOKEN_LAYER_DIRECTORY } from '../../tools/build-config.mjs';

const applicationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The palette and theme the manifest's two values are a copy of, per DESIGN.md. */
const PALETTE = 'slate-blue';
const THEME = 'dark';

/** The role that is the floor of the interface, and so the colour a splash screen should be. */
const ROLE = '--surface-page';

const palettes = await readFile(
  path.join(applicationRoot, TOKEN_LAYER_DIRECTORY, 'palettes.css'),
  'utf8',
);

const manifest = JSON.parse(
  await readFile(path.join(applicationRoot, 'public', 'manifest.webmanifest'), 'utf8'),
) as { theme_color?: string; background_color?: string };

/**
 * The value the token layer gives a role for one palette and theme.
 *
 * Found by locating the selector's own block rather than by searching the whole file: the role is
 * defined once per palette per theme, and a search that ignored the block would return whichever
 * copy came first in the file, which is a check that passes on the wrong answer.
 */
function tokenValue(role: string): string {
  const selector = `:root[data-palette="${PALETTE}"][data-theme="${THEME}"]`;
  const opens = palettes.indexOf(selector);
  assert.ok(opens > -1, `the token layer no longer defines ${selector}`);

  const block = palettes.slice(opens, palettes.indexOf('}', opens));
  const found = block.match(new RegExp(`${role}\\s*:\\s*([^;]+);`));
  assert.ok(found !== null, `${selector} no longer defines ${role}`);
  return found[1].trim();
}

describe('the manifest colours, which are copies of a token', () => {
  const expected = tokenValue(ROLE);

  it('paints the splash screen the same colour the application opens on', () => {
    assert.equal(
      manifest.background_color?.toLowerCase(),
      expected.toLowerCase(),
      `background_color is a copy of ${ROLE} at ${PALETTE}/${THEME}. The token layer now says ` +
        `${expected}. A splash screen in a colour the application no longer uses is a flash of the ` +
        'wrong colour at the moment the coach opens it, and nothing else would report it.',
    );
  });

  it('tints the browser surround and the task-switcher card the same colour', () => {
    assert.equal(
      manifest.theme_color?.toLowerCase(),
      expected.toLowerCase(),
      `theme_color is a copy of ${ROLE} at ${PALETTE}/${THEME}, which the token layer now gives as ` +
        `${expected}`,
    );
  });

  it('holds the two values DESIGN.md quotes, so the contract and the file cannot disagree', async () => {
    const design = await readFile(path.join(applicationRoot, 'DESIGN.md'), 'utf8');
    for (const [key, value] of [
      ['theme_color', manifest.theme_color],
      ['background_color', manifest.background_color],
    ] as const) {
      assert.ok(
        design.includes(`"${key}": "${value}"`),
        `DESIGN.md quotes a different ${key} than the manifest carries. The document is where a ` +
          'reader finding two anonymous hex values goes to learn why they are allowed to exist; a ' +
          'document quoting the wrong one sends them to change the wrong file.',
      );
    }
  });
});
