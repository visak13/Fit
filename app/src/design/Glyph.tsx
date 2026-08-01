/**
 * A GLYPH FROM THE FAMILY — the only way one is drawn in this application.
 *
 * The family's SVGs live in `design/icons/`, `tools/make-glyphs.mjs` turns them into
 * `glyphs.generated.ts`, and this component draws one. Nothing else inlines an `<svg>`: the family's
 * whole value is that it looks like one family, and a hand-inlined glyph is how one of them quietly
 * acquires its own stroke, its own colour or its own canvas.
 *
 * ## What this component deliberately does NOT do
 *
 * It sets no colour, no stroke width, no caps and no joins. Those belong to `.glyph` in
 * `console.css`, where Console's optical correction lives, and they belong there rather than here so
 * that a size the application has not asked for yet still arrives correct — see that rule for what
 * the correction is and why it is arithmetic rather than a table. A glyph takes its colour from the
 * text around it, always, because the only thing it is ever allowed to be is the shape of the word
 * beside it.
 *
 * ## The accessible name is a REQUIRED decision, not a defaulted one
 *
 * A glyph is either beside a visible label, where naming it again makes a screen reader say
 * everything twice, or standing alone, where an unnamed one is a control nobody can identify. There
 * is no sensible default: whichever this component picked, the other case would be wrong silently,
 * and both are invisible to anyone testing with their eyes. So the props make it a choice that
 * cannot be skipped — `decorative` or a `label` — and the type refuses to compile without one.
 *
 * ```tsx
 * <button className="icon-btn" aria-label="Delete Priya">
 *   <Glyph name="delete" decorative />           // the button carries the name
 * </button>
 *
 * <Glyph name="sync-offline" label="Working offline" />   // nothing else says it
 * ```
 */

import type { GlyphShape } from './glyph-family.ts';
import { GLYPH_CANVAS } from './glyph-family.ts';
import type { GlyphName } from './glyphs.generated.ts';
import { GLYPHS } from './glyphs.generated.ts';

/**
 * The sizes the family is asked for, named for the place rather than the number, so a screen says
 * what it is drawing into. The number each lands on is in `console.css` beside the role that sets
 * it; a screen that needs another one sets `--glyph-scale` and the stroke follows it.
 */
export type GlyphSize = 'dense' | 'inline' | 'rail' | 'lead';

/** How a glyph is presented to a screen reader, which is a choice with no safe default. */
type GlyphNaming =
  /** Beside a visible label that already names it. Hidden, so nothing is announced twice. */
  | { readonly decorative: true; readonly label?: never }
  /** Standing alone. These are the words it is announced as. */
  | { readonly label: string; readonly decorative?: never };

export type GlyphProps = GlyphNaming & {
  readonly name: GlyphName;
  /** Rail size when omitted, which is the size the family was drawn to be read at. */
  readonly size?: GlyphSize;
  /** Only for placing the glyph. Anything that would change how it LOOKS belongs to `.glyph`. */
  readonly className?: string;
};

/** One shape as an element. The family's one filled shape carries the marker `.glyph` reads. */
function Shape({ shape }: { shape: GlyphShape }) {
  const filled = shape.filled === true ? { 'data-filled': 'true' } : undefined;
  switch (shape.kind) {
    case 'circle':
      return <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...filled} />;
    case 'rect':
      return (
        <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} {...filled} />
      );
    case 'path':
      return <path d={shape.d} {...filled} />;
  }
}

export function Glyph({ name, size = 'rail', className, decorative, label }: GlyphProps) {
  const glyph = GLYPHS[name];
  const classes = ['glyph', `glyph-${size}`, className].filter(Boolean).join(' ');

  return (
    <svg
      className={classes}
      viewBox={`0 0 ${GLYPH_CANVAS} ${GLYPH_CANVAS}`}
      // A named glyph is an image with a name; a decorative one is not in the tree at all. Both are
      // stated rather than left to a reader's guess about what an <svg> in a button means.
      role={decorative === true ? undefined : 'img'}
      aria-hidden={decorative === true ? true : undefined}
      aria-label={label}
    >
      {glyph.shapes.map((shape, at) => (
        <Shape key={at} shape={shape} />
      ))}
    </svg>
  );
}
