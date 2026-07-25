/**
 * PLACEHOLDER application icons.
 *
 * ## Read this before replacing them
 *
 * These are NOT the application's icons. They are flat single-colour squares with no design
 * intent whatsoever, and they exist for one narrow reason: a web application manifest without a
 * sufficiently large icon is not installable at all, and this step's job is to produce an
 * installable shell. The visual system — including the real icon set — is the NEXT step's work,
 * and these files are its inherited placeholder.
 *
 * They are generated from this script rather than committed as opaque binaries so that anyone
 * can see exactly what they are: a colour and a size, nothing more. Regenerate with
 * `npm run icons`. Replacing them means replacing the PNG files in `public/icons/` and deleting
 * this script, not editing the colour here.
 *
 * ## Why a hand-rolled encoder rather than an image library
 *
 * A dependency is a thing the future maintainer must understand. A solid-colour PNG is a header,
 * one compressed block of identical scanlines, and a terminator; the standard library already
 * has the compressor. Adding an imaging package to draw a square would cost more than it saves.
 */

import { deflateSync } from 'node:zlib';
import { crc32 } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { applicationRoot } from './source-stamp.mjs';

/** Deliberately neutral. The visual step chooses the real colour along with the real mark. */
const PLACEHOLDER_COLOUR = Object.freeze({ red: 0x33, green: 0x3a, blue: 0x44 });

/**
 * 192 and 512 are the sizes an installable manifest is expected to offer; 180 is what iOS reads
 * from `apple-touch-icon`.
 */
const ICON_SIZES = Object.freeze([180, 192, 512]);

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BIT_DEPTH_EIGHT = 8;
const COLOUR_TYPE_TRUECOLOUR = 2;
const BYTES_PER_PIXEL = 3;
const FILTER_TYPE_NONE = 0;

/**
 * One PNG chunk: length, type, payload, CRC over type+payload.
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
 * A square PNG filled with one colour.
 *
 * @param {number} size edge length in pixels
 * @param {{red: number, green: number, blue: number}} colour
 * @returns {Buffer}
 */
function solidSquarePng(size, colour) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.writeUInt8(BIT_DEPTH_EIGHT, 8);
  header.writeUInt8(COLOUR_TYPE_TRUECOLOUR, 9);
  header.writeUInt8(0, 10); // compression: deflate, the only value defined
  header.writeUInt8(0, 11); // filter method: adaptive, the only value defined
  header.writeUInt8(0, 12); // interlace: none

  const bytesPerRow = 1 + size * BYTES_PER_PIXEL;
  const raw = Buffer.alloc(size * bytesPerRow);
  for (let row = 0; row < size; row += 1) {
    const rowStart = row * bytesPerRow;
    raw[rowStart] = FILTER_TYPE_NONE;
    for (let column = 0; column < size; column += 1) {
      const pixelStart = rowStart + 1 + column * BYTES_PER_PIXEL;
      raw[pixelStart] = colour.red;
      raw[pixelStart + 1] = colour.green;
      raw[pixelStart + 2] = colour.blue;
    }
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function main() {
  const iconDirectory = path.join(applicationRoot, 'public', 'icons');
  await mkdir(iconDirectory, { recursive: true });

  for (const size of ICON_SIZES) {
    const file = path.join(iconDirectory, `placeholder-${size}.png`);
    await writeFile(file, solidSquarePng(size, PLACEHOLDER_COLOUR));
    console.log(`wrote ${path.relative(applicationRoot, file)} (${size}x${size}, placeholder)`);
  }
}

main().catch((error) => {
  console.error('placeholder icon generation failed:', error);
  process.exitCode = 1;
});
