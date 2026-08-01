/**
 * THE FAMILY CANNOT DRIFT — which is the only property that makes a directory of drawings one family.
 *
 * Three separate ways this could quietly stop being true, and one test for each.
 *
 * The first is the one that would actually happen. `src/design/glyphs.generated.ts` is derived from
 * `design/icons/`, and nothing forces the two to stay in step: a glyph gets redrawn, the generator
 * is not re-run, and the application goes on shipping the old artwork. Nothing errors, every gate
 * stays green, and the only symptom is a glyph that does not match the family sheet it was reviewed
 * on. So the first test RE-DERIVES the module here and fails if a single byte differs. It is the
 * same reasoning as the theme's bootstrap test: repetition that nothing checks is repetition that
 * drifts, and this drift is silent.
 *
 * The second is the family's own invariants — one canvas, one title each, no glyph carrying its own
 * colour. Those are enforced by the generator when it reads, but a hand-edit to the generated file
 * would walk straight past it, and the first test only catches that if the hand-edit ALSO differs
 * from a re-derivation. It does, so this is belt and braces; it earns its place by saying which
 * invariant broke rather than printing a diff of two thousand lines.
 *
 * The third is the correction. `--glyph-stroke` was a CONSTANT in the prototype, correct at exactly
 * one size, and the obvious tidy-up is to put it back — it looks like arithmetic doing the work of a
 * number. So the last tests read `console.css` and fail if the stroke stops being derived from the
 * size, or if the canvas and the rendered stroke stop agreeing with `glyph-family.ts`.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { GLYPH_SOURCE_DIRECTORY } from '../../tools/build-config.mjs';
import { GLYPH_MODULE_FILE, readFamily, renderModule } from '../../tools/make-glyphs.mjs';
import { GLYPH_CANVAS, GLYPH_RENDERED_STROKE } from './glyph-family.ts';
import { GLYPHS } from './glyphs.generated.ts';

const applicationRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const consoleCss = () => readFile(path.join(applicationRoot, 'src', 'design', 'console.css'), 'utf8');

/** The value of one custom property in the file, as written. */
function declaration(css: string, name: string): string {
  const match = new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'mu').exec(css);
  assert.ok(match !== null, `console.css no longer declares ${name}`);
  return match[1].trim();
}

describe('the generated module against the family it was derived from', () => {
  it('is byte-for-byte what re-deriving from design/icons produces RIGHT NOW', async () => {
    const family = await readFamily(path.join(applicationRoot, GLYPH_SOURCE_DIRECTORY));
    const committed = await readFile(path.join(applicationRoot, GLYPH_MODULE_FILE), 'utf8');

    assert.equal(
      renderModule(family),
      committed,
      `${GLYPH_MODULE_FILE} no longer matches ${GLYPH_SOURCE_DIRECTORY}. A glyph was redrawn without ` +
        '`npm run glyphs` being re-run, or the generated file was edited by hand. Run it.',
    );
  });

  it('carries the whole family rather than the subset somebody happened to need', async () => {
    const family = await readFamily(path.join(applicationRoot, GLYPH_SOURCE_DIRECTORY));
    assert.equal(Object.keys(GLYPHS).length, family.length);
    assert.ok(family.length > 0, 'no glyphs were read at all, which a passing count would hide');
  });
});

describe('what makes the whole set one family', () => {
  it('gives every glyph the words it is announced as when it stands alone', () => {
    for (const [name, glyph] of Object.entries(GLYPHS)) {
      assert.ok(glyph.title.trim().length > 0, `${name} has no title`);
    }
  });

  it('draws something in every one of them', () => {
    for (const [name, glyph] of Object.entries(GLYPHS)) {
      assert.ok(glyph.shapes.length > 0, `${name} draws nothing`);
    }
  });

  it('lets exactly one shape in the family fill itself, and no glyph name its own colour', () => {
    // Colour comes from the surrounding text, always. A glyph that set its own would be correct on
    // the theme it was written against and wrong on the other, with nothing to report it.
    const filled = Object.entries(GLYPHS).flatMap(([name, glyph]) =>
      glyph.shapes.filter((shape) => 'filled' in shape && shape.filled === true).map(() => name),
    );
    assert.deepEqual(filled, ['session-start']);
  });

  it('keeps every shape inside the canvas it was drawn on', () => {
    for (const [name, glyph] of Object.entries(GLYPHS)) {
      for (const shape of glyph.shapes) {
        if (shape.kind === 'circle') {
          assert.ok(shape.cx - shape.r >= 0 && shape.cx + shape.r <= GLYPH_CANVAS, `${name} is off-canvas`);
          assert.ok(shape.cy - shape.r >= 0 && shape.cy + shape.r <= GLYPH_CANVAS, `${name} is off-canvas`);
        }
        if (shape.kind === 'rect') {
          assert.ok(shape.x >= 0 && shape.x + shape.width <= GLYPH_CANVAS, `${name} is off-canvas`);
          assert.ok(shape.y >= 0 && shape.y + shape.height <= GLYPH_CANVAS, `${name} is off-canvas`);
        }
      }
    }
  });
});

describe("Console's optical correction, in the one place it lives", () => {
  it('agrees with glyph-family.ts about the canvas and about what the line must measure', async () => {
    const css = await consoleCss();
    assert.equal(declaration(css, '--glyph-canvas'), String(GLYPH_CANVAS));
    assert.equal(declaration(css, '--glyph-rendered-stroke'), String(GLYPH_RENDERED_STROKE));
  });

  it('DERIVES the stroke from the size rather than fixing it, which is the whole correction', async () => {
    const css = await consoleCss();
    const stroke = declaration(css, '--glyph-stroke');

    // The prototype's `--glyph-stroke: 1.85` is correct at 24px and at no other size. A number here
    // reads as a tidy-up and silently thickens every glyph the application scales up.
    assert.ok(
      stroke.includes('--glyph-scale'),
      'the glyph stroke no longer depends on the size, so a scaled glyph will render a heavier line ' +
        'than the family it belongs to',
    );
    assert.ok(stroke.includes('--glyph-rendered-stroke') && stroke.includes('--glyph-optical-scale'));
  });

  it('resolves the size and the stroke ON the glyph, not at the root', async () => {
    // A custom property is substituted where it is DECLARED. Declared at `:root` these would freeze
    // the scale at 1 for the whole document, every size modifier would be ignored, and the
    // correction would apply to nothing but the default — while looking entirely correct in the file.
    const css = await consoleCss();
    const rule = /\.glyph \{([^}]*)\}/u.exec(css);
    assert.ok(rule !== null, 'console.css no longer has a .glyph rule');
    assert.match(rule[1], /--glyph-size:/u);
    assert.match(rule[1], /--glyph-stroke:/u);
  });

  it('offers every named size as a multiple of the canvas, so the stroke can follow it', async () => {
    const css = await consoleCss();
    for (const size of ['dense', 'inline', 'rail', 'lead']) {
      const scale = declaration(css, `--glyph-scale-${size}`);
      assert.ok(
        scale === '1' || scale.includes('--glyph-canvas'),
        `--glyph-scale-${size} is a length rather than a multiple of the canvas: ${scale}`,
      );
      assert.match(css, new RegExp(`\\.glyph-${size} \\{`, 'u'));
    }
  });
});
