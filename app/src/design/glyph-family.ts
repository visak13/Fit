/**
 * WHAT A GLYPH IS — the hand-authored half of the family, beside the generated half.
 *
 * `glyphs.generated.ts` holds the artwork and nothing else; this file holds the shape that artwork
 * has to fit and the two facts about the family that are not drawings. Splitting them is what keeps
 * the generated file safe to overwrite: nothing anyone reasoned about lives in a file a tool
 * rewrites.
 *
 * Everything the family SHARES — fill, stroke, stroke width, caps, joins, and Console's optical
 * correction — is in `.glyph` in `console.css` and is deliberately absent here. A second place that
 * knows the family's stroke is a second place it can drift from.
 */

/** One drawn shape, in the family's own coordinate space. */
export type GlyphShape =
  | { readonly kind: 'circle'; readonly cx: number; readonly cy: number; readonly r: number; readonly filled?: true }
  | {
      readonly kind: 'rect';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly rx: number;
      readonly filled?: true;
    }
  | { readonly kind: 'path'; readonly d: string; readonly filled?: true };

/** One glyph: the words it is announced as when it stands alone, and what it draws. */
export interface GlyphDefinition {
  readonly title: string;
  readonly shapes: readonly GlyphShape[];
}

/**
 * The canvas the whole family is drawn on, in user units.
 *
 * Every size the application asks for is a MULTIPLE of this rather than a length of its own, which
 * is what lets the stroke correction below be arithmetic instead of a table. It is repeated in
 * `console.css` as `--glyph-canvas`, and `glyphs.test.ts` fails if the two ever disagree.
 */
export const GLYPH_CANVAS = 24;

/**
 * What the family's line must MEASURE on screen, in CSS pixels, at every size it is drawn at.
 *
 * This is the whole of Console's optical correction stated as a requirement rather than as a pair
 * of numbers. The correction exists because scaling a glyph scales its stroke with it: draw the
 * 24-unit artwork at 32px and a 2-unit line arrives 2.67px thick, which reads as a heavier glyph
 * rather than a bigger one, and the family stops looking like one family. So the AUTHORED stroke is
 * derived from the size instead of fixed, such that what lands on the screen is always this.
 *
 * Also repeated in `console.css` as `--glyph-rendered-stroke`, and also guarded by `glyphs.test.ts`.
 */
export const GLYPH_RENDERED_STROKE = 2;
