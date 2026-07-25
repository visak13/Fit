/**
 * THE APPLICATION'S INSTALLABLE ICON SET, DERIVED FROM THE ACCEPTED MARK.
 *
 * ## What this is, and what it is not
 *
 * It is not a drawing program and it invents nothing. `public/icons/mark.svg` is the accepted
 * Console mark and it is the only place the artwork exists; this tool rasterises it into the files
 * a platform actually installs. A change to the mark is a change to every icon here. If the mark
 * is wrong, this file is not where it gets fixed.
 *
 * It REPLACES `make-placeholder-icons.mjs`, which drew flat squares. That script had to go for a
 * specific reason worth restating, because it is the reason this one is safe: running it after the
 * real artwork landed would have silently overwritten the mark with coloured rectangles, and
 * nothing would have errored. This tool has the opposite property. Its input is the final artwork,
 * so running it on correct files is a genuine no-op — the same mark in, the same bytes out — and
 * running it after the mark changes is exactly what you want to happen.
 *
 * ## Why the mark now lives under `public/icons/` and this is a promotion, not a fork
 *
 * The mark was authored in `design/direction-two/`, the frozen prototype the direction was chosen
 * from. The copy here is now the application's CANONICAL vector source and the prototype's copy is
 * a historical artefact of how it was chosen. Nothing in the application should depend on a
 * prototype directory once the choice is made, and the mark is finished: accepted, unshared, and
 * not measured by any harness. That is what makes copying it the right move rather than the
 * forked-copy antipattern.
 *
 * **This does not license the same move for the token layer.** `design/tokens/` is LIVE, shared by
 * three directions, and measured as a whole by `design/contrast.mjs` — which would go on passing
 * over the original while a fork drifted underneath it. Different facts, opposite answer: the
 * tokens are read from their one home (see `tools/build-config.mjs`) and never copied.
 *
 * ## Why an installable icon set is four deliberate files, not one file at four sizes
 *
 * - **192 and 512, purpose `any`.** What the manifest needs to be installable at all. Drawn whole,
 *   with at most the platform's own rounded corner applied.
 * - **A maskable 512.** NOT the same artwork scaled. A maskable icon is cropped by the platform to
 *   whatever shape it currently likes — a circle, a squircle, a teardrop — and only a centred
 *   circle covering eighty per cent of the canvas is guaranteed to survive. So the mark is inset
 *   into that safe zone while the BACKGROUND STILL BLEEDS TO EVERY EDGE. Hand the platform the
 *   plain artwork instead and it shaves the ends off the outer bars; hand it a transparent
 *   surround and it fills the crop with white.
 * - **An opaque 180 for iOS.** iOS reads `apple-touch-icon` from the markup rather than the
 *   manifest, and composites what it finds onto a background of ITS OWN choosing. An icon with an
 *   alpha channel comes out looking broken on precisely the device the coach uses, so nothing here
 *   carries transparency at all — which costs nothing, because the mark is opaque by construction.
 *
 * ## Why it reads the mark rather than restating its geometry
 *
 * Geometry copied into this file would make it a second author of the artwork, and the two would
 * disagree the first time the mark was touched. The reader below understands exactly the
 * vocabulary `mark.svg` uses — axis-aligned rectangles, written as `<rect>` or as an `M`/`H`/`V`/
 * `Z` path — and REFUSES anything else rather than approximating it. A missing or unreadable mark
 * is a hard failure with a message, never a fallback shape: a generator that quietly emits a
 * square when it cannot find its source is the loaded gun rebuilt.
 *
 * ## Why a hand-rolled rasteriser and encoder
 *
 * The same reasoning the script it replaces was committed with. The whole mark is five rectangles,
 * the standard library already has the compressor, and an imaging dependency is a thing every
 * future maintainer has to understand. Rectangle coverage is computed analytically — the exact
 * fraction of each pixel a rectangle covers — so edges are properly anti-aliased at the sizes
 * where the geometry does not land on whole pixels, which is most of them.
 */

import { deflateSync, crc32 } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { applicationRoot } from './source-stamp.mjs';

/**
 * The share of a maskable icon's width guaranteed to survive every platform's crop, as a centred
 * circle. Fixed by the specification rather than chosen here.
 *
 * @type {number}
 */
const MASKABLE_SAFE_ZONE_FRACTION = 0.8;

/** Where the canonical vector source lives, relative to the application root. */
const MARK_FILE = path.join('public', 'icons', 'mark.svg');

/** Where the rasterised set is written, relative to the application root. */
const ICON_DIRECTORY = path.join('public', 'icons');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BIT_DEPTH_EIGHT = 8;
const COLOUR_TYPE_TRUECOLOUR = 2;
const BYTES_PER_PIXEL = 3;
const FILTER_TYPE_NONE = 0;
const HEX_COLOUR_DIGITS = 6;

/* ─────────────────────────────── reading the mark ─────────────────────────────── */

/**
 * One filled, axis-aligned rectangle in the mark's own coordinate space.
 *
 * @typedef {{x: number, y: number, width: number, height: number,
 *            colour: {red: number, green: number, blue: number}}} MarkRectangle
 */

/**
 * The mark: the square its coordinates are expressed in, and the rectangles that fill it, in the
 * order they are painted.
 *
 * @typedef {{size: number, rectangles: MarkRectangle[]}} Mark
 */

/**
 * A six-digit hexadecimal colour as its three channels.
 *
 * @param {string} value e.g. `#1B5A85`
 * @returns {{red: number, green: number, blue: number}}
 */
function parseColour(value) {
  const digits = value.startsWith('#') ? value.slice(1) : value;
  const channels = Number.parseInt(digits, 16);
  if (digits.length !== HEX_COLOUR_DIGITS || Number.isNaN(channels)) {
    throw new Error(`the mark uses a colour this tool cannot read: ${value}`);
  }
  return {
    red: (channels >> 16) & 0xff,
    green: (channels >> 8) & 0xff,
    blue: channels & 0xff,
  };
}

/**
 * The attributes of one element, read by scanning. Values must be double-quoted, which is true of
 * the mark and is the only form accepted.
 *
 * @param {string} source the text between the element's name and its closing bracket
 * @returns {Map<string, string>}
 */
function readAttributes(source) {
  const attributes = new Map();
  let cursor = 0;
  while (cursor < source.length) {
    const equals = source.indexOf('=', cursor);
    if (equals === -1) break;

    const name = source.slice(cursor, equals).trim();
    const openingQuote = source.indexOf('"', equals);
    if (openingQuote === -1) {
      throw new Error(`unquoted attribute value in the mark, near "${name}"`);
    }
    const closingQuote = source.indexOf('"', openingQuote + 1);
    if (closingQuote === -1) {
      throw new Error(`unterminated attribute value in the mark, near "${name}"`);
    }
    if (name.length > 0) attributes.set(name, source.slice(openingQuote + 1, closingQuote));
    cursor = closingQuote + 1;
  }
  return attributes;
}

/**
 * Every element of one name, in document order, with the offset it appeared at so paint order can
 * be reconstructed across element types.
 *
 * @param {string} document
 * @param {string} elementName
 * @returns {{at: number, attributes: Map<string, string>}[]}
 */
function readElements(document, elementName) {
  const opening = `<${elementName}`;
  const elements = [];
  let cursor = 0;
  for (;;) {
    const start = document.indexOf(opening, cursor);
    if (start === -1) return elements;

    const end = document.indexOf('>', start);
    if (end === -1) throw new Error(`unterminated <${elementName}> in the mark`);

    let body = document.slice(start + opening.length, end);
    if (body.endsWith('/')) body = body.slice(0, -1);
    elements.push({ at: start, attributes: readAttributes(body) });
    cursor = end + 1;
  }
}

/**
 * A numeric attribute. Omitting `fallback` makes it required.
 *
 * @param {Map<string, string>} attributes
 * @param {string} name
 * @param {number} [fallback]
 * @returns {number}
 */
function numericAttribute(attributes, name, fallback) {
  const raw = attributes.get(name);
  if (raw === undefined) {
    if (fallback === undefined) {
      throw new Error(`the mark is missing the required attribute "${name}"`);
    }
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`the mark's "${name}" is not a number: ${raw}`);
  }
  return value;
}

/**
 * The run of characters forming a number, starting at `from` and skipping separators.
 *
 * @param {string} data
 * @param {number} from
 * @returns {{value: number, next: number}}
 */
function readNumber(data, from) {
  let cursor = from;
  while (cursor < data.length && (data[cursor] === ' ' || data[cursor] === ',')) cursor += 1;

  const start = cursor;
  if (data[cursor] === '-' || data[cursor] === '+') cursor += 1;
  while (cursor < data.length) {
    const character = data[cursor];
    const isDigit = character >= '0' && character <= '9';
    if (!isDigit && character !== '.') break;
    cursor += 1;
  }
  const value = Number(data.slice(start, cursor));
  if (cursor === start || !Number.isFinite(value)) {
    throw new Error(`expected a number in the mark's path data at position ${from}`);
  }
  return { value, next: cursor };
}

/**
 * Path data as rectangles. The accepted vocabulary is exactly the one the mark uses: subpaths of
 * `M x y`, then horizontal and vertical lines, then `Z`. A curve, a diagonal or an unclosed
 * subpath is refused rather than approximated — an icon that quietly loses part of the mark is
 * worse than a build that stops and says so.
 *
 * @param {string} data the `d` attribute
 * @param {{red: number, green: number, blue: number}} colour
 * @returns {MarkRectangle[]}
 */
function rectanglesFromPath(data, colour) {
  const rectangles = [];
  let cursor = 0;

  while (cursor < data.length) {
    if (data[cursor] === ' ') {
      cursor += 1;
      continue;
    }
    if (data[cursor] !== 'M') {
      throw new Error(`the mark's path starts a subpath with "${data[cursor]}"; only "M" is understood`);
    }

    const startX = readNumber(data, cursor + 1);
    const startY = readNumber(data, startX.next);
    cursor = startY.next;

    const xs = [startX.value];
    const ys = [startY.value];
    let closed = false;

    while (cursor < data.length && !closed) {
      const command = data[cursor];
      if (command === 'H' || command === 'V') {
        const read = readNumber(data, cursor + 1);
        (command === 'H' ? xs : ys).push(read.value);
        cursor = read.next;
      } else if (command === 'Z' || command === 'z') {
        closed = true;
        cursor += 1;
      } else {
        throw new Error(
          `the mark's path uses "${command}", which is not an axis-aligned command; this tool ` +
            'cannot rasterise it and will not guess',
        );
      }
    }
    if (!closed) throw new Error('the mark has an unclosed subpath');

    const left = Math.min(...xs);
    const top = Math.min(...ys);
    rectangles.push({
      x: left,
      y: top,
      width: Math.max(...xs) - left,
      height: Math.max(...ys) - top,
      colour,
    });
  }

  return rectangles;
}

/**
 * Read the mark. Shapes are returned in the order the author painted them, whatever element each
 * was written as.
 *
 * @param {string} document the contents of `mark.svg`
 * @returns {Mark}
 */
export function readMark(document) {
  const root = readElements(document, 'svg')[0];
  if (root === undefined) throw new Error('no <svg> element in the mark');

  const width = numericAttribute(root.attributes, 'width');
  const height = numericAttribute(root.attributes, 'height');
  if (width !== height) {
    throw new Error(`the mark is not square (${width}x${height}); an application icon must be`);
  }

  /** @type {{at: number, rectangles: MarkRectangle[]}[]} */
  const painted = [];

  for (const { at, attributes } of readElements(document, 'rect')) {
    const fill = attributes.get('fill');
    if (fill === undefined) throw new Error('a <rect> in the mark has no fill');
    painted.push({
      at,
      rectangles: [
        {
          x: numericAttribute(attributes, 'x', 0),
          y: numericAttribute(attributes, 'y', 0),
          width: numericAttribute(attributes, 'width'),
          height: numericAttribute(attributes, 'height'),
          colour: parseColour(fill),
        },
      ],
    });
  }

  for (const { at, attributes } of readElements(document, 'path')) {
    const fill = attributes.get('fill');
    const data = attributes.get('d');
    if (fill === undefined || data === undefined) {
      throw new Error('a <path> in the mark has no fill or no data');
    }
    painted.push({ at, rectangles: rectanglesFromPath(data, parseColour(fill)) });
  }

  painted.sort((left, right) => left.at - right.at);
  const rectangles = painted.flatMap((entry) => entry.rectangles);
  if (rectangles.length === 0) throw new Error('the mark contains no shapes this tool can read');

  return { size: width, rectangles };
}

/* ──────────────────────────────── drawing it ──────────────────────────────── */

/**
 * Whether a rectangle covers the whole mark, which makes it the BACKGROUND. The background is the
 * one thing that must never be inset: on a maskable icon it is what fills the area the platform
 * crops into.
 *
 * @param {MarkRectangle} rectangle
 * @param {number} markSize
 * @returns {boolean}
 */
function isFullBleed(rectangle, markSize) {
  return (
    rectangle.x <= 0 &&
    rectangle.y <= 0 &&
    rectangle.x + rectangle.width >= markSize &&
    rectangle.y + rectangle.height >= markSize
  );
}

/**
 * How much of the pixel spanning `low`..`low + 1` lies inside `from`..`to`.
 *
 * @param {number} low
 * @param {number} from
 * @param {number} to
 * @returns {number} between 0 and 1
 */
function axisCoverage(low, from, to) {
  const overlap = Math.min(low + 1, to) - Math.max(low, from);
  return overlap > 0 ? overlap : 0;
}

/**
 * Rasterise the mark into a truecolour buffer with no alpha channel, so every icon produced is
 * fully opaque — what iOS requires, and what a maskable icon needs at its edges.
 *
 * @param {Mark} mark
 * @param {number} size edge length in pixels
 * @param {number} contentScale 1 draws the mark as authored; below 1 insets everything except the
 *   full-bleed background, which is how the maskable variant is derived
 * @returns {Buffer} `size * size * 3` bytes, row-major
 */
export function drawMark(mark, size, contentScale) {
  const pixels = Buffer.alloc(size * size * BYTES_PER_PIXEL);
  const unit = size / mark.size;
  const centre = size / 2;

  for (const rectangle of mark.rectangles) {
    const scale = isFullBleed(rectangle, mark.size) ? 1 : contentScale;
    const toDevice = (value) => (value - mark.size / 2) * unit * scale + centre;

    const left = toDevice(rectangle.x);
    const right = toDevice(rectangle.x + rectangle.width);
    const top = toDevice(rectangle.y);
    const bottom = toDevice(rectangle.y + rectangle.height);

    const firstColumn = Math.max(0, Math.floor(left));
    const lastColumn = Math.min(size - 1, Math.ceil(right) - 1);
    const firstRow = Math.max(0, Math.floor(top));
    const lastRow = Math.min(size - 1, Math.ceil(bottom) - 1);

    for (let row = firstRow; row <= lastRow; row += 1) {
      const rowCoverage = axisCoverage(row, top, bottom);
      if (rowCoverage === 0) continue;

      for (let column = firstColumn; column <= lastColumn; column += 1) {
        const coverage = rowCoverage * axisCoverage(column, left, right);
        if (coverage === 0) continue;

        const at = (row * size + column) * BYTES_PER_PIXEL;
        pixels[at] = Math.round(pixels[at] * (1 - coverage) + rectangle.colour.red * coverage);
        pixels[at + 1] = Math.round(pixels[at + 1] * (1 - coverage) + rectangle.colour.green * coverage);
        pixels[at + 2] = Math.round(pixels[at + 2] * (1 - coverage) + rectangle.colour.blue * coverage);
      }
    }
  }

  return pixels;
}

/* ────────────────────────────── writing it out ────────────────────────────── */

/**
 * One PNG chunk: length, type, payload, and the checksum over type and payload.
 *
 * @param {string} type four ASCII characters
 * @param {Buffer} payload
 * @returns {Buffer}
 */
function chunk(type, payload) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length, 0);
  const typeAndPayload = Buffer.concat([Buffer.from(type, 'ascii'), payload]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndPayload) >>> 0, 0);
  return Buffer.concat([length, typeAndPayload, checksum]);
}

/**
 * An opaque truecolour PNG.
 *
 * @param {Buffer} pixels `size * size * 3` bytes
 * @param {number} size
 * @returns {Buffer}
 */
export function encodePng(pixels, size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.writeUInt8(BIT_DEPTH_EIGHT, 8);
  header.writeUInt8(COLOUR_TYPE_TRUECOLOUR, 9);
  header.writeUInt8(0, 10); // compression: deflate, the only value defined
  header.writeUInt8(0, 11); // filter method: adaptive, the only value defined
  header.writeUInt8(0, 12); // interlace: none

  const stride = size * BYTES_PER_PIXEL;
  const raw = Buffer.alloc(size * (1 + stride));
  for (let row = 0; row < size; row += 1) {
    const destination = row * (1 + stride);
    raw[destination] = FILTER_TYPE_NONE;
    pixels.copy(raw, destination + 1, row * stride, (row + 1) * stride);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * The set, each entry named for what it is FOR rather than only how big it is.
 *
 * @type {ReadonlyArray<{file: string, size: number, contentScale: number, what: string}>}
 */
export const ICON_SET = Object.freeze([
  { file: 'icon-192.png', size: 192, contentScale: 1, what: 'manifest, purpose any' },
  { file: 'icon-512.png', size: 512, contentScale: 1, what: 'manifest, purpose any' },
  {
    file: 'icon-maskable-512.png',
    size: 512,
    contentScale: MASKABLE_SAFE_ZONE_FRACTION,
    what: 'manifest, purpose maskable — mark inside the safe zone, background to full bleed',
  },
  {
    file: 'apple-touch-icon-180.png',
    size: 180,
    contentScale: 1,
    what: 'iOS home screen — opaque, read from index.html rather than from the manifest',
  },
]);

/**
 * Derive the whole set from the mark.
 *
 * @param {string} [root] absolute path to the application root
 * @returns {Promise<string[]>} the files written, relative to the application root
 */
export async function writeIconSet(root = applicationRoot) {
  const markPath = path.join(root, MARK_FILE);

  let document;
  try {
    document = await readFile(markPath, 'utf8');
  } catch (error) {
    // Never a fallback shape. See the header: emitting something when the source is missing is
    // how the placeholder generator became dangerous in the first place.
    throw new Error(`the application mark is not readable at ${MARK_FILE}: ${error.message}`, {
      cause: error,
    });
  }

  const mark = readMark(document);
  const directory = path.join(root, ICON_DIRECTORY);
  await mkdir(directory, { recursive: true });

  const written = [];
  for (const icon of ICON_SET) {
    await writeFile(path.join(directory, icon.file), encodePng(drawMark(mark, icon.size, icon.contentScale), icon.size));
    written.push(path.posix.join('public', 'icons', icon.file));
  }
  return written;
}

/**
 * Run only when invoked directly, so the pieces above stay importable by a test. Compared as file
 * URLs rather than as paths, because a Windows path is not a URL and the naive comparison silently
 * never matches there — which would make `npm run icons` do nothing at all on this machine.
 */
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeIconSet()
    .then((written) => {
      for (const file of written) console.log(`wrote ${file}`);
    })
    .catch((error) => {
      console.error('icon derivation failed:', error.message);
      process.exitCode = 1;
    });
}
