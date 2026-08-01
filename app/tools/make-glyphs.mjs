/**
 * THE GLYPH FAMILY, TURNED INTO ONE TYPED MODULE — derived, never drawn.
 *
 * ## What this is, and what it is not
 *
 * It invents no artwork. `design/icons/` holds the family’s SVGs, drawn on a 24-unit canvas at a 2-unit
 * stroke with round caps and joins, named for what they MEAN rather than what they look like, and
 * reviewed as a family on `design/icons/index.html`. This tool reads that directory and writes
 * `src/design/glyphs.generated.ts`: the one place a glyph is defined for the application.
 *
 * It has the property that made `make-icons.mjs` safe to commit — its input is the finished artwork,
 * so running it on correct files is a genuine no-op, and running it after a glyph changes is exactly
 * what you want. It has one more: `src/design/glyphs.test.ts` re-derives the module on every shell
 * test run and fails if a byte differs, so an SVG edited without re-running this cannot ship.
 *
 * ## Why a generated module rather than one hand-copied component per glyph
 *
 * Because the family's value is that it IS a family, and a directory of files maintained by hand is
 * one chance per file for one of them to acquire its own stroke, its own colour or its own canvas.
 * Nobody would notice: a glyph half a unit heavier than its neighbours looks fine on its own and
 * only reads as wrong beside the other forty-eight, which is a comparison no reviewer makes twice.
 * One generated file cannot drift, and the drift test says so out loud.
 *
 * ## Why the presentation attributes are DROPPED rather than carried over
 *
 * The authored SVGs carry `stroke-width="var(--glyph-stroke, 2)"` and `rx="var(--glyph-radius, 2)"`
 * — the family's shared properties, written out once per glyph. Three reasons none of that comes
 * across, in increasing order of how much they matter.
 *
 * A presentation attribute has LOWER precedence than any CSS rule, so the moment `.glyph` exists
 * these are dead weight: they describe the family in a second place that can never win an argument
 * with the first. One copy of a value per glyph is one chance per glyph for one to be different, and
 * the one that is different is the one nobody looks at twice.
 *
 * Second, they cannot express what the application needs. `--glyph-stroke` is no longer a constant:
 * it is derived from the size on each glyph, and a `2` sitting in an attribute is exactly the fixed
 * stroke the correction exists to get rid of. Whatever it resolved to would be wrong at every size
 * but one.
 *
 * Third, and stated carefully because it was MEASURED rather than assumed: `var()` inside a
 * presentation attribute IS substituted by Chromium — checked in Chrome 148 on 2026-07-25, where a
 * `stroke-width="var(--x, 2)"` picked up a `--x` of 7. WebKit is a different engine and this build
 * has not verified it there, which matters because WebKit is what the coach's iPhone runs. There is
 * no reason to find out: a CSS rule gets the same result on every engine, so depending on the
 * attribute would be taking a risk that buys nothing.
 *
 * So everything the FAMILY shares — fill, stroke, stroke width, caps, joins, the optical correction
 * — is owned by `.glyph` in `src/design/console.css` and appears nowhere else. What is emitted here
 * is only what makes one glyph DIFFERENT from another: its geometry and its name.
 *
 * A `var()` inside a geometry attribute is read as its FALLBACK, which is the value the author
 * committed to and the only number in the file; a `var()` with no fallback is a hard failure,
 * because there is nothing there to read. The corner radius is treated this way rather than kept as
 * a live token deliberately: unlike the stroke, a radius in user units scales with the geometry
 * correctly at every size, so it has nothing to correct for.
 *
 * ## Why it refuses what it does not understand
 *
 * The reader below knows exactly the vocabulary this family uses — `<title>`, `<circle>`, `<rect>`,
 * `<path>`, and one filled shape — and refuses anything else with a message naming the file. A
 * generator that silently skips a shape it cannot read emits a glyph missing a stroke, which is the
 * absence-that-looks-like-a-pass shape this build has met repeatedly.
 *
 *     npm run glyphs
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { GLYPH_SOURCE_DIRECTORY } from './build-config.mjs';
import { applicationRoot } from './source-stamp.mjs';

/** The canvas the whole family is drawn on. Every glyph must declare exactly this view box. */
export const GLYPH_CANVAS = 24;

/** Where the generated module is written, relative to the application root. */
export const GLYPH_MODULE_FILE = path.join('src', 'design', 'glyphs.generated.ts');

/** The elements one glyph may be built from, and the numeric attributes each one carries. */
const SHAPE_VOCABULARY = Object.freeze({
  circle: Object.freeze(['cx', 'cy', 'r']),
  rect: Object.freeze(['x', 'y', 'width', 'height', 'rx']),
  path: Object.freeze([]),
});

/**
 * The two attributes that mark the family's one FILLED shape — the play triangle inside
 * `session-start`. Any other combination is refused: a glyph that sets its own colour, or that
 * fills without saying it means to, is a glyph leaving the family.
 */
const FILLED_MARKERS = Object.freeze({ fill: 'currentColor', stroke: 'none' });

/* ─────────────────────────────── reading a glyph ─────────────────────────────── */

/**
 * One drawn shape, in the family's own 24-unit coordinate space.
 *
 * @typedef {{kind: 'circle', cx: number, cy: number, r: number, filled?: true}
 *          |{kind: 'rect', x: number, y: number, width: number, height: number, rx: number,
 *            filled?: true}
 *          |{kind: 'path', d: string, filled?: true}} GlyphShape
 */

/**
 * One glyph: the name it is asked for by, the words it is announced as, and what it draws.
 *
 * @typedef {{name: string, title: string, shapes: GlyphShape[]}} Glyph
 */

/**
 * The attributes of one element, read by scanning. Values must be double-quoted, which is true of
 * every file in the family and is the only form accepted.
 *
 * @param {string} source the text between the element's name and its closing bracket
 * @param {string} where the file being read, for the message
 * @returns {Map<string, string>}
 */
function readAttributes(source, where) {
  const attributes = new Map();
  let cursor = 0;
  while (cursor < source.length) {
    const equals = source.indexOf('=', cursor);
    if (equals === -1) break;

    const name = source.slice(cursor, equals).trim();
    const openingQuote = source.indexOf('"', equals);
    if (openingQuote === -1) throw new Error(`${where}: unquoted attribute value near "${name}"`);

    const closingQuote = source.indexOf('"', openingQuote + 1);
    if (closingQuote === -1) throw new Error(`${where}: unterminated attribute value near "${name}"`);

    if (name.length > 0) attributes.set(name, source.slice(openingQuote + 1, closingQuote));
    cursor = closingQuote + 1;
  }
  return attributes;
}

/**
 * Every element in the document, in the order it was drawn, whatever its name.
 *
 * @param {string} document
 * @param {string} where
 * @returns {{name: string, attributes: Map<string, string>}[]}
 */
function readElements(document, where) {
  const elements = [];
  let cursor = 0;
  for (;;) {
    const start = document.indexOf('<', cursor);
    if (start === -1) return elements;
    if (document[start + 1] === '/' || document[start + 1] === '?' || document[start + 1] === '!') {
      cursor = start + 1;
      continue;
    }

    const end = document.indexOf('>', start);
    if (end === -1) throw new Error(`${where}: unterminated element`);

    let body = document.slice(start + 1, end);
    if (body.endsWith('/')) body = body.slice(0, -1);

    const nameEnd = body.search(/\s/u);
    const name = nameEnd === -1 ? body : body.slice(0, nameEnd);
    elements.push({
      name,
      attributes: nameEnd === -1 ? new Map() : readAttributes(body.slice(nameEnd), where),
    });
    cursor = end + 1;
  }
}

/**
 * A geometry attribute as a number in user units.
 *
 * `var(--name, fallback)` is read as its fallback — see the header for why that is the honest
 * reading rather than a shortcut. A `var()` with no fallback has no value this tool can commit to,
 * so it stops rather than guessing zero.
 *
 * @param {Map<string, string>} attributes
 * @param {string} name
 * @param {string} where
 * @returns {number}
 */
function geometry(attributes, name, where) {
  const raw = attributes.get(name);
  if (raw === undefined) throw new Error(`${where}: a shape is missing the required "${name}"`);

  const variable = /^var\(\s*--[\w-]+\s*,\s*([^)]+)\)$/u.exec(raw);
  const text = variable === null ? raw : variable[1].trim();
  if (variable === null && raw.startsWith('var(')) {
    throw new Error(
      `${where}: "${name}" is var() with no fallback, and var() is not substituted in a ` +
        'presentation attribute, so this has no value at all — give it a fallback in user units',
    );
  }

  const value = Number(text);
  if (!Number.isFinite(value)) throw new Error(`${where}: "${name}" is not a number: ${raw}`);
  return value;
}

/**
 * Whether a shape is the family's one deliberately filled shape, refusing every other use of `fill`
 * or `stroke` on a child — those are the family's shared properties and they belong to `.glyph`.
 *
 * @param {Map<string, string>} attributes
 * @param {string} where
 * @returns {boolean}
 */
function readFilled(attributes, where) {
  const fill = attributes.get('fill');
  const stroke = attributes.get('stroke');
  if (fill === undefined && stroke === undefined) return false;
  if (fill === FILLED_MARKERS.fill && stroke === FILLED_MARKERS.stroke) return true;

  throw new Error(
    `${where}: a shape sets fill="${fill}" stroke="${stroke}". The family's fill and stroke are ` +
      'owned by .glyph; the only accepted exception is a solid shape marked ' +
      `fill="${FILLED_MARKERS.fill}" stroke="${FILLED_MARKERS.stroke}"`,
  );
}

/**
 * Read one glyph.
 *
 * @param {string} document the contents of one `.svg`
 * @param {string} name the file's base name, which is what the application asks for it by
 * @returns {Glyph}
 */
export function readGlyph(document, name) {
  const where = `${name}.svg`;
  const elements = readElements(document, where);

  const root = elements[0];
  if (root === undefined || root.name !== 'svg') throw new Error(`${where}: does not start with <svg>`);

  const viewBox = root.attributes.get('viewBox');
  const expected = `0 0 ${GLYPH_CANVAS} ${GLYPH_CANVAS}`;
  if (viewBox !== expected) {
    throw new Error(
      `${where}: viewBox is "${viewBox}" and the family's canvas is "${expected}". A glyph on its ` +
        'own canvas is a glyph that will not match its neighbours at any size',
    );
  }

  const titleAt = document.indexOf('<title>');
  const titleEnd = document.indexOf('</title>');
  if (titleAt === -1 || titleEnd === -1) {
    throw new Error(`${where}: has no <title>, which is the words it is announced as when it stands alone`);
  }
  const title = document.slice(titleAt + '<title>'.length, titleEnd).trim();
  if (title.length === 0) throw new Error(`${where}: has an empty <title>`);

  /** @type {GlyphShape[]} */
  const shapes = [];
  for (const element of elements.slice(1)) {
    if (element.name === 'title') continue;

    const known = Object.hasOwn(SHAPE_VOCABULARY, element.name);
    if (!known) {
      throw new Error(
        `${where}: uses <${element.name}>, which this family does not draw with. The accepted ` +
          `shapes are ${Object.keys(SHAPE_VOCABULARY).join(', ')}`,
      );
    }

    const filled = readFilled(element.attributes, where);
    /** @type {GlyphShape} */
    let shape;
    if (element.name === 'path') {
      const d = element.attributes.get('d');
      if (d === undefined || d.trim().length === 0) throw new Error(`${where}: a <path> has no data`);
      shape = { kind: 'path', d: d.trim() };
    } else {
      shape = /** @type {GlyphShape} */ ({ kind: element.name });
      for (const attribute of SHAPE_VOCABULARY[element.name]) {
        shape[attribute] = geometry(element.attributes, attribute, where);
      }
    }
    if (filled) shape.filled = true;
    shapes.push(shape);
  }

  if (shapes.length === 0) throw new Error(`${where}: draws nothing`);
  return { name, title, shapes };
}

/**
 * Read the whole family, in the order the application will list it: by name, so the generated file
 * is stable under a directory listing that is not.
 *
 * @param {string} directory absolute path to the family's one home
 * @returns {Promise<Glyph[]>}
 */
export async function readFamily(directory) {
  const names = (await readdir(directory))
    .filter((file) => file.endsWith('.svg'))
    .map((file) => file.slice(0, -'.svg'.length))
    .sort();

  if (names.length === 0) throw new Error(`no glyphs found in ${directory}`);

  const family = [];
  for (const name of names) {
    family.push(readGlyph(await readFile(path.join(directory, `${name}.svg`), 'utf8'), name));
  }
  return family;
}

/* ────────────────────────────── writing it out ────────────────────────────── */

/** A number as source: whole where it is whole, so the file reads like the artwork does. */
const number = (value) => String(Number(value.toFixed(4)));

/** A string as source, single-quoted, which is how every other file in this application writes one. */
const quote = (value) => `'${value.replace(/\\/gu, '\\\\').replace(/'/gu, "\\'")}'`;

/**
 * One shape as a TypeScript object literal.
 *
 * @param {GlyphShape} shape
 * @returns {string}
 */
function shapeSource(shape) {
  const fields =
    shape.kind === 'path'
      ? [`kind: 'path'`, `d: ${quote(shape.d)}`]
      : [
          `kind: '${shape.kind}'`,
          ...SHAPE_VOCABULARY[shape.kind].map((name) => `${name}: ${number(shape[name])}`),
        ];
  if (shape.filled === true) fields.push('filled: true');
  return `{ ${fields.join(', ')} }`;
}

/**
 * The generated module.
 *
 * @param {Glyph[]} family
 * @returns {string}
 */
export function renderModule(family) {
  const entries = family
    .map(
      (glyph) =>
        `  ${quote(glyph.name)}: {\n` +
        `    title: ${quote(glyph.title)},\n` +
        `    shapes: [\n${glyph.shapes.map((shape) => `      ${shapeSource(shape)},`).join('\n')}\n` +
        `    ],\n` +
        `  },`,
    )
    .join('\n');

  return `/**
 * GENERATED FILE — do not edit. Run \`npm run glyphs\` instead.
 *
 * Derived from \`design/icons/\` by \`tools/make-glyphs.mjs\`, which is where the reasoning lives.
 * \`src/design/glyphs.test.ts\` re-derives this on every shell test run and fails if a byte differs,
 * so an edit here or a glyph edited without re-running the generator cannot ship silently.
 *
 * Only what makes one glyph DIFFERENT from another is here. Everything the family shares — fill,
 * stroke, stroke width, caps, joins and Console's optical correction — belongs to \`.glyph\` in
 * \`src/design/console.css\` and appears nowhere else.
 */

import type { GlyphDefinition } from './glyph-family.ts';

/** Every glyph the family draws, keyed by the name it is asked for by. */
export const GLYPHS = {
${entries}
} as const satisfies Record<string, GlyphDefinition>;

/** The name of a glyph in the family. A name that is not one of these does not type-check. */
export type GlyphName = keyof typeof GLYPHS;
`;
}

/**
 * Derive the module from the family.
 *
 * @param {string} [root] absolute path to the application root
 * @returns {Promise<{file: string, count: number}>}
 */
export async function writeGlyphModule(root = applicationRoot) {
  const directory = path.join(root, GLYPH_SOURCE_DIRECTORY);

  let family;
  try {
    family = await readFamily(directory);
  } catch (error) {
    // Never a fallback shape, for the reason make-icons.mjs states: a generator that emits
    // something when it cannot read its source is a loaded gun.
    throw new Error(`the glyph family is not readable at ${GLYPH_SOURCE_DIRECTORY}: ${error.message}`, {
      cause: error,
    });
  }

  await writeFile(path.join(root, GLYPH_MODULE_FILE), renderModule(family), 'utf8');
  return { file: GLYPH_MODULE_FILE, count: family.length };
}

/**
 * Run only when invoked directly, so the pieces above stay importable by a test. Compared as file
 * URLs rather than as paths, because a Windows path is not a URL and the naive comparison silently
 * never matches there.
 */
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeGlyphModule()
    .then(({ file, count }) => console.log(`wrote ${file} — ${count} glyphs`))
    .catch((error) => {
      console.error('glyph derivation failed:', error.message);
      process.exitCode = 1;
    });
}
