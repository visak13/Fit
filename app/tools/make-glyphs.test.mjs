/**
 * THE GLYPH GENERATOR — and what it REFUSES matters more than what it accepts.
 *
 * The accepting half is already proved every time the shell tests run: `src/design/glyphs.test.ts`
 * re-derives the whole family from `design/icons/` and compares it byte for byte with what shipped.
 * That is a better test of the happy path than anything here could be, because its input is the real
 * forty-nine rather than a fixture somebody wrote to pass.
 *
 * What that cannot reach is the refusals, and the refusals are the point. A generator that quietly
 * skips a shape it does not understand emits a glyph with a piece missing; one that reads a
 * `var()` with no fallback as zero emits a glyph collapsed to a point. Both look like artwork
 * problems rather than tooling problems, both survive review, and neither turns a gate red.
 *
 *     npm run test:tools
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readGlyph, renderModule } from './make-glyphs.mjs';

/** A glyph in the family's own dialect, so a test changes only the thing it is about. */
const glyph = (body) =>
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" ' +
  'fill="none" stroke="currentColor" stroke-width="var(--glyph-stroke, 2)" stroke-linecap="round" ' +
  `stroke-linejoin="round">\n  <title>An example</title>\n${body}\n</svg>\n`;

describe('reading one glyph', () => {
  it('keeps the name, the words it is announced as, and the geometry', () => {
    const read = readGlyph(glyph('  <circle cx="12" cy="7" r="3"/>\n  <path d="M3 20v-2"/>'), 'example');

    assert.equal(read.name, 'example');
    assert.equal(read.title, 'An example');
    assert.deepEqual(read.shapes, [
      { kind: 'circle', cx: 12, cy: 7, r: 3 },
      { kind: 'path', d: 'M3 20v-2' },
    ]);
  });

  it('reads a var() geometry as its FALLBACK, which is the only value it actually has', () => {
    // The fallback is the value the author committed to and the only number in the file. Nothing
    // here depends on how a browser treats `var()` in a presentation attribute — see the generator's
    // header for what was measured about that and why the application does not rely on it either.
    const read = readGlyph(glyph('  <rect x="3" y="4" width="18" height="16" rx="var(--glyph-radius, 2)"/>'), 'e');
    assert.deepEqual(read.shapes, [{ kind: 'rect', x: 3, y: 4, width: 18, height: 16, rx: 2 }]);
  });

  it('marks the one filled shape rather than letting it inherit a stroke it should not have', () => {
    const read = readGlyph(glyph('  <path d="M10 8.5 16 12l-6 3.5Z" fill="currentColor" stroke="none"/>'), 'e');
    assert.deepEqual(read.shapes, [{ kind: 'path', d: 'M10 8.5 16 12l-6 3.5Z', filled: true }]);
  });
});

describe('what it refuses, and refuses loudly', () => {
  const refuses = (document, expected) =>
    assert.throws(() => readGlyph(document, 'example'), (error) => {
      assert.match(error.message, expected);
      assert.match(error.message, /example\.svg/u, 'the message does not name the file');
      return true;
    });

  it('a canvas that is not the family\'s', () => {
    refuses(
      glyph('  <circle cx="8" cy="8" r="4"/>').replace('0 0 24 24', '0 0 32 32'),
      /viewBox/u,
    );
  });

  it('a glyph with no title, which is a glyph nobody can be told the name of', () => {
    refuses(glyph('  <circle cx="12" cy="12" r="4"/>').replace(/<title>.*<\/title>\n/u, ''), /<title>/u);
  });

  it('a shape it does not understand, rather than dropping it', () => {
    refuses(glyph('  <polygon points="0,0 4,4 0,4"/>'), /polygon/u);
  });

  it('a var() with no fallback, rather than reading it as zero', () => {
    refuses(glyph('  <circle cx="12" cy="12" r="var(--glyph-radius)"/>'), /no fallback/u);
  });

  it('a glyph that names its own colour, because colour comes from the text around it', () => {
    refuses(glyph('  <circle cx="12" cy="12" r="4" fill="#1B5A85"/>'), /owned by \.glyph/u);
  });

  it('a glyph that draws nothing', () => {
    refuses(glyph(''), /draws nothing/u);
  });

  it('a path with no data', () => {
    refuses(glyph('  <path/>'), /no data/u);
  });
});

describe('the module it writes', () => {
  it('is stable: the same family in, the same bytes out', () => {
    const family = [readGlyph(glyph('  <circle cx="12" cy="12" r="4"/>'), 'example')];
    assert.equal(renderModule(family), renderModule(family));
  });

  it('says at the top that it is generated, since that is what stops it being edited', () => {
    const source = renderModule([readGlyph(glyph('  <circle cx="12" cy="12" r="4"/>'), 'example')]);
    assert.match(source, /GENERATED FILE/u);
    assert.match(source, /npm run glyphs/u);
  });
});
