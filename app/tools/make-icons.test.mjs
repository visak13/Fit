/**
 * PROVES THE ICON DERIVATION, INCLUDING THE PARTS THAT WOULD FAIL SILENTLY.
 *
 * Three of these tests exist because the failure they describe produces a FILE, not an error: a
 * maskable icon whose mark strays outside the safe zone still writes 512 valid pixels and only
 * shows itself as shaved bars on somebody's home screen; an icon that acquires an alpha channel
 * still opens in every viewer and only looks broken once iOS composites it; and a generator that
 * quietly falls back when it cannot read the mark produces a plausible square nobody questions.
 * None of those can be caught by looking at whether the tool exited zero.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ICON_SET, drawMark, encodePng, readMark, writeIconSet } from './make-icons.mjs';
import { applicationRoot } from './source-stamp.mjs';

const MARK_FILE = path.join(applicationRoot, 'public', 'icons', 'mark.svg');

/** The maskable guarantee: a centred circle covering eighty per cent of the canvas. */
const SAFE_ZONE_RADIUS_FRACTION = 0.4;

/** Anti-aliasing puts a partially covered pixel just outside a shape's true edge. */
const EDGE_TOLERANCE_PIXELS = 1.5;

/** How far a channel must differ from the background before a pixel counts as the mark. */
const CONTENT_CHANNEL_DIFFERENCE = 8;

/**
 * The distance from the centre of the furthest pixel that is not the background colour.
 *
 * @param {Buffer} pixels row-major RGB
 * @param {number} size
 * @returns {number}
 */
function furthestContentRadius(pixels, size) {
  const background = [pixels[0], pixels[1], pixels[2]];
  const centre = size / 2;
  let furthest = 0;

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const at = (row * size + column) * 3;
      const differs =
        Math.abs(pixels[at] - background[0]) > CONTENT_CHANNEL_DIFFERENCE ||
        Math.abs(pixels[at + 1] - background[1]) > CONTENT_CHANNEL_DIFFERENCE ||
        Math.abs(pixels[at + 2] - background[2]) > CONTENT_CHANNEL_DIFFERENCE;
      if (!differs) continue;

      // The pixel's own centre, which is what its distance from the icon's centre is measured from.
      const dx = column + 0.5 - centre;
      const dy = row + 0.5 - centre;
      furthest = Math.max(furthest, Math.hypot(dx, dy));
    }
  }
  return furthest;
}

test('reads the application mark as the rectangles it is painted from', async () => {
  const mark = readMark(await readFile(MARK_FILE, 'utf8'));

  assert.equal(mark.size, 512, 'the mark is authored on a 512 canvas');
  assert.ok(mark.rectangles.length >= 5, 'a background, four bars, and the accent');

  const background = mark.rectangles[0];
  assert.deepEqual(
    { x: background.x, y: background.y, width: background.width, height: background.height },
    { x: 0, y: 0, width: 512, height: 512 },
    'the first shape painted is the full-bleed background, which is what the maskable variant relies on',
  );
});

test('refuses artwork it cannot rasterise rather than approximating it', () => {
  const curved =
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">' +
    '<path fill="#000000" d="M10 10C20 20 30 30 40 40Z"/></svg>';
  assert.throws(() => readMark(curved), /not an axis-aligned command/);

  const oblong = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="256"></svg>';
  assert.throws(() => readMark(oblong), /not square/);

  const empty = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"></svg>';
  assert.throws(() => readMark(empty), /no shapes/);
});

test('the maskable variant keeps every mark pixel inside the safe zone, background to the edge', async () => {
  const mark = readMark(await readFile(MARK_FILE, 'utf8'));
  const maskable = ICON_SET.find((icon) => icon.file === 'icon-maskable-512.png');
  assert.ok(maskable !== undefined, 'the set includes a maskable variant');

  const pixels = drawMark(mark, maskable.size, maskable.contentScale);
  const safeRadius = maskable.size * SAFE_ZONE_RADIUS_FRACTION;
  const reach = furthestContentRadius(pixels, maskable.size);

  assert.ok(
    reach <= safeRadius - EDGE_TOLERANCE_PIXELS,
    `the mark reaches ${reach.toFixed(1)}px from centre; the safe zone ends at ${safeRadius}px`,
  );

  // Every corner is background, which is the half a scaled-down icon on transparency would fail.
  const last = maskable.size - 1;
  for (const [row, column] of [[0, 0], [0, last], [last, 0], [last, last]]) {
    const at = (row * maskable.size + column) * 3;
    assert.deepEqual(
      [pixels[at], pixels[at + 1], pixels[at + 2]],
      [pixels[0], pixels[1], pixels[2]],
      'the background bleeds into every corner',
    );
  }
});

test('the as-authored icon would NOT satisfy the safe zone, which is why the variant exists', async () => {
  const mark = readMark(await readFile(MARK_FILE, 'utf8'));
  const pixels = drawMark(mark, 512, 1);

  assert.ok(
    furthestContentRadius(pixels, 512) > 512 * SAFE_ZONE_RADIUS_FRACTION,
    'if this ever stops being true the maskable variant is redundant and should be reconsidered, ' +
      'not left in place unexplained',
  );
});

test('every icon is opaque, correctly sized, and byte-identical on a second run', async () => {
  const mark = readMark(await readFile(MARK_FILE, 'utf8'));

  for (const icon of ICON_SET) {
    const once = encodePng(drawMark(mark, icon.size, icon.contentScale), icon.size);
    const twice = encodePng(drawMark(mark, icon.size, icon.contentScale), icon.size);

    assert.equal(once.readUInt32BE(16), icon.size, `${icon.file} is ${icon.size} wide`);
    assert.equal(once.readUInt32BE(20), icon.size, `${icon.file} is ${icon.size} tall`);
    assert.equal(
      once[25],
      2,
      `${icon.file} must be truecolour with NO alpha channel; iOS composites a transparent ` +
        'touch icon onto its own background and it comes out looking broken',
    );
    assert.deepEqual(once, twice, `${icon.file} must be reproducible, or re-running the tool is a diff`);
  }
});

test('the committed icons are the ones the current mark produces', async () => {
  const mark = readMark(await readFile(MARK_FILE, 'utf8'));

  for (const icon of ICON_SET) {
    const committed = await readFile(path.join(applicationRoot, 'public', 'icons', icon.file));
    const derived = encodePng(drawMark(mark, icon.size, icon.contentScale), icon.size);
    assert.deepEqual(
      committed,
      derived,
      `public/icons/${icon.file} does not match the mark; run "npm run icons"`,
    );
  }
});

test('fails loudly when the mark is missing rather than emitting a fallback shape', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'fit-icons-'));
  await mkdir(path.join(root, 'public', 'icons'), { recursive: true });

  await assert.rejects(writeIconSet(root), /mark is not readable/);

  await writeFile(path.join(root, 'public', 'icons', 'mark.svg'), 'not an svg at all');
  await assert.rejects(writeIconSet(root), /no <svg> element/);
});
