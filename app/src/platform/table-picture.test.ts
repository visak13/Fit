/**
 * THE PICTURE, MEASURED RATHER THAN EYEBALLED.
 *
 * A test cannot look at an image, so it must assert the properties that make one readable, and each
 * of these is one a coach would notice being wrong: nothing is clipped, a long cell wraps instead of
 * running off the edge, an empty chart is not swimming in space, and the bitmap is the ratio of the
 * device it is drawn for. The measurer is a substitute with a known width per character, which is
 * what makes the layout arithmetic assertable at all.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  drawTablePicture,
  planTablePicture,
  renderTablePicture,
  wrap,
  type DrawingContext,
  type PictureCanvas,
  type PictureSurface,
  type TextMeasurer,
} from './table-picture.ts';

/** A character is this wide in each of the three fonts, so a width is a length times a number. */
const PER_CHARACTER: TextMeasurer = (text, font) => {
  if (font.startsWith('bold 30')) return text.length * 15;
  if (font.startsWith('bold 17')) return text.length * 9;
  return text.length * 8;
};

/** Every drawing call, in order, so what was drawn can be read back. */
interface Drawn {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly font: string;
}

function aContext(): DrawingContext & { drawn: Drawn[]; scaled: [number, number][]; fills: number[][] } {
  const drawn: Drawn[] = [];
  const scaled: [number, number][] = [];
  const fills: number[][] = [];

  return {
    drawn,
    scaled,
    fills,
    font: '',
    fillStyle: '',
    textBaseline: 'alphabetic',
    measureText(text: string) {
      return { width: PER_CHARACTER(text, this.font) };
    },
    fillText(text: string, x: number, y: number) {
      drawn.push({ text, x, y, font: this.font });
    },
    fillRect(x: number, y: number, width: number, height: number) {
      fills.push([x, y, width, height]);
    },
    scale(x: number, y: number) {
      scaled.push([x, y]);
    },
  };
}

/** A canvas that produces a real Blob, and remembers the size it was given. */
function aCanvas(produce: () => Blob | null = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })) {
  const context = aContext();
  const canvas: PictureCanvas & { context: typeof context; requestedType?: string } = {
    width: 0,
    height: 0,
    context,
    getContext: () => context,
    toBlob(callback, type) {
      canvas.requestedType = type;
      callback(produce());
    },
  };
  return canvas;
}

function aSurface(pixelRatio = 1, produce?: () => Blob | null) {
  const made: ReturnType<typeof aCanvas>[] = [];
  const surface: PictureSurface & { made: typeof made } = {
    made,
    pixelRatio,
    createCanvas: () => {
      const canvas = aCanvas(produce);
      made.push(canvas);
      return canvas;
    },
  };
  return surface;
}

const TABLE = {
  title: 'Diet — week of 3 August',
  headings: ['Day', 'Morning', 'Midday'],
  rows: [
    ['Monday', 'Oats 60 g', 'Chicken & rice'],
    ['Tuesday', 'Eggs ×3', ''],
  ],
};

test('THE SIZE COMES FROM THE CONTENT: more rows is taller, wider cells is wider', () => {
  const small = planTablePicture({ title: 'Diet', rows: [['a', 'b']] }, PER_CHARACTER);
  const tall = planTablePicture({ title: 'Diet', rows: [['a', 'b'], ['c', 'd'], ['e', 'f']] }, PER_CHARACTER);
  const wide = planTablePicture({ title: 'Diet', rows: [['a much longer cell than that', 'b']] }, PER_CHARACTER);

  assert.ok(tall.height > small.height, 'three rows are taller than one');
  assert.ok(wide.width > small.width, 'a long cell makes a wider picture');
  assert.equal(tall.width, small.width, 'and rows alone do not change the width');
});

test('NOTHING IS CLIPPED: every drawn line ends inside the picture', () => {
  const plan = planTablePicture(TABLE, PER_CHARACTER);
  const context = aContext();
  drawTablePicture(plan, context);

  assert.ok(context.drawn.length > 0, 'the check has real draws to read');
  for (const line of context.drawn) {
    const right = line.x + PER_CHARACTER(line.text, line.font);
    assert.ok(right <= plan.width, `"${line.text}" runs to ${right}, past the picture's ${plan.width}`);
  }

  const lowest = Math.max(...context.drawn.map((line) => line.y));
  assert.ok(lowest < plan.height, 'and the last line is inside the bottom edge');
});

test('THE TITLE IS NEVER THE THING THAT IS CLIPPED — a narrow table still fits its own title', () => {
  const plan = planTablePicture({ title: 'A very long diet chart title indeed', rows: [['a']] }, PER_CHARACTER);
  assert.ok(plan.width >= PER_CHARACTER('A very long diet chart title indeed', 'bold 30px'), 'the picture is at least as wide as its title');
});

test('a long cell WRAPS instead of making an unreadable picture', () => {
  const long = 'Oats sixty grams with milk two hundred millilitres and a spoon of honey on the side';
  const plan = planTablePicture({ title: 'Diet', rows: [['Monday', long]] }, PER_CHARACTER);

  assert.ok(plan.columns[1].width <= 340, 'the column is capped');
  assert.ok(plan.rows[0].cells[1].lines.length > 1, 'so the text is wrapped across lines');
  assert.equal(plan.rows[0].cells[1].lines.join(' '), long, 'and every word survives the wrapping');
  assert.ok(plan.rows[0].height > plan.rows[0].cells[0].lines.length * 24, 'the row grew to hold them');
});

test('a line break the coach typed is KEPT as a line break', () => {
  const plan = planTablePicture({ title: 'Diet', rows: [['Oats 60g\nMilk 200ml']] }, PER_CHARACTER);
  assert.deepEqual([...plan.rows[0].cells[0].lines], ['Oats 60g', 'Milk 200ml']);
});

test('a word longer than its column is broken rather than clipped', () => {
  const lines = wrap('x'.repeat(200), 80, 'cell', PER_CHARACTER);
  assert.ok(lines.length > 1);
  assert.equal(lines.join(''), 'x'.repeat(200), 'not one character is dropped');
  for (const line of lines) assert.ok(PER_CHARACTER(line, 'cell') <= 80);
});

test('wrapping cannot loop forever when nothing fits', () => {
  const lines = wrap('abc def', 1, 'cell', PER_CHARACTER);
  assert.equal(lines.join('').split(' ').join(''), 'abcdef');
});

test('headings are a row, and they are marked as one so they can be drawn differently', () => {
  const plan = planTablePicture(TABLE, PER_CHARACTER);
  assert.equal(plan.rows[0].heading, true);
  assert.equal(plan.rows[1].heading, false);
  assert.equal(plan.rows.length, 3, 'headings plus two rows');

  const without = planTablePicture({ title: 'Diet', rows: [['a']] }, PER_CHARACTER);
  assert.equal(without.rows[0].heading, false, 'and a table without headings has no heading row');
});

test('a number is marked for right alignment, as a spreadsheet would show it', () => {
  const plan = planTablePicture({ title: 'Loads', rows: [['Monday', 80]] }, PER_CHARACTER);
  assert.equal(plan.rows[0].cells[0].alignRight, false);
  assert.equal(plan.rows[0].cells[1].alignRight, true);
});

test('AND THE MARK IS ACTUALLY OBEYED: the number is drawn against the right edge of its column', () => {
  // The flag above decides nothing unless the drawing reads it. A column of loads that plans itself
  // right-aligned and then draws left-aligned is a test asserting a value nobody uses.
  const plan = planTablePicture({ title: 'Loads', rows: [['Monday', 80], ['Tuesday', 5]] }, PER_CHARACTER);
  const context = aContext();
  drawTablePicture(plan, context);

  const column = plan.columns[1];
  for (const value of ['80', '5']) {
    const line = context.drawn.find((drawn) => drawn.text === value);
    assert.ok(line, `${value} was never drawn`);
    const right = line.x + PER_CHARACTER(value, line.font);
    assert.equal(right, column.x + column.width - 14, `${value} sits against the column's right edge`);
    assert.ok(line.x > column.x + 14, 'and not at the left edge, which is where it was drawn before');
  }

  const monday = context.drawn.find((drawn) => drawn.text === 'Monday');
  assert.equal(monday?.x, plan.columns[0].x + 14, 'while text is still left-aligned');
});

test('a short row in a wide table still gets every column drawn', () => {
  const plan = planTablePicture({ title: 'Diet', headings: ['a', 'b', 'c'], rows: [['only one']] }, PER_CHARACTER);
  assert.equal(plan.columns.length, 3);
  assert.equal(plan.rows[1].cells.length, 3, 'the missing cells are empty, not absent');
  assert.deepEqual([...plan.rows[1].cells[2].lines], ['']);
});

test('the title is drawn, and so is every cell', () => {
  const plan = planTablePicture(TABLE, PER_CHARACTER);
  const context = aContext();
  drawTablePicture(plan, context);

  const drawn = context.drawn.map((line) => line.text);
  assert.ok(drawn.includes('Diet — week of 3 August'), 'the title is on the picture');
  for (const text of ['Day', 'Morning', 'Midday', 'Monday', 'Oats 60 g', 'Chicken & rice', 'Tuesday', 'Eggs ×3']) {
    assert.ok(drawn.includes(text), `${text} was never drawn`);
  }
  assert.ok(context.fills.length > 0, 'and the paper and the rules were filled');
});

test('DEVICE PIXEL RATIO: the bitmap is scaled up and the context is scaled once to match', async () => {
  const surface = aSurface(3);
  const { width, height } = await renderTablePicture(TABLE, surface);

  const drawnOn = surface.made[surface.made.length - 1];
  assert.equal(drawnOn.width, Math.ceil(width * 3), 'the bitmap is three times the drawing width');
  assert.equal(drawnOn.height, Math.ceil(height * 3));
  assert.deepEqual(drawnOn.context.scaled, [[3, 3]], 'and the context is scaled exactly once');
});

test('a ratio of one leaves the bitmap the size of the drawing', async () => {
  const surface = aSurface(1);
  const { width } = await renderTablePicture(TABLE, surface);
  assert.equal(surface.made[surface.made.length - 1].width, width);
});

test('an absurd ratio is clamped rather than trusted — a zero produces no pixels at all', async () => {
  const none = aSurface(0);
  const { width } = await renderTablePicture(TABLE, none);
  assert.equal(none.made[none.made.length - 1].width, width, 'clamped up to 1');

  const huge = aSurface(12);
  const big = await renderTablePicture(TABLE, huge);
  assert.equal(huge.made[huge.made.length - 1].width, Math.ceil(big.width * 3), 'clamped down to 3');
});

test('THE BITMAP IS WHAT IS BOUNDED: a tall chart lowers its ratio rather than producing nothing', async () => {
  // Thirty rows is well inside the limit as a drawing and three times outside it as a bitmap. A
  // canvas past what the browser will allocate does not throw — `toBlob` simply hands back nothing —
  // so bounding the drawing instead of the bitmap is a limit that never fires when it is needed.
  const rows = Array.from({ length: 30 }, (_unused, index) => [`row ${index}`, 'x']);
  const surface = aSurface(3);
  const { height } = await renderTablePicture({ title: 'Everything', rows }, surface);

  assert.ok(height * 3 > 4096, 'the check has a case that would have overflowed');

  const canvas = surface.made[surface.made.length - 1];
  assert.ok(canvas.height <= 4096, `the bitmap is ${canvas.height}, past what a phone will allocate`);
  assert.ok(canvas.width <= 4096);

  const [ratio] = canvas.context.scaled[0];
  assert.ok(ratio < 3, 'the ratio came down');
  assert.ok(ratio > 1, 'but the picture is still sharper than one-to-one — softness is given up, not the picture');
  assert.equal(canvas.height, Math.ceil(height * ratio), 'and the bitmap matches the ratio it was scaled by');
});

test('a chart that fits keeps the full ratio — the bound does not soften pictures it was not meant to', async () => {
  const surface = aSurface(3);
  const { width, height } = await renderTablePicture(TABLE, surface);
  const canvas = surface.made[surface.made.length - 1];

  assert.deepEqual(canvas.context.scaled, [[3, 3]]);
  assert.equal(canvas.width, Math.ceil(width * 3));
  assert.equal(canvas.height, Math.ceil(height * 3));
});

test('a real image comes back, declared as a PNG', async () => {
  const surface = aSurface(2);
  const { blob } = await renderTablePicture(TABLE, surface);

  assert.ok(blob instanceof Blob);
  assert.ok(blob.size > 0);
  assert.equal(surface.made[surface.made.length - 1].requestedType, 'image/png');
});

test('NO CONTEXT AND NO IMAGE ARE BOTH SAID OUT LOUD, never resolved to an empty share', async () => {
  const noContext: PictureSurface = {
    pixelRatio: 1,
    createCanvas: () => ({ width: 0, height: 0, getContext: () => null, toBlob: () => {} }),
  };
  await assert.rejects(() => renderTablePicture(TABLE, noContext), /no 2d canvas context/);

  await assert.rejects(() => renderTablePicture(TABLE, aSurface(1, () => null)), /produced no image/);
});

test('a table too large to share as a picture is refused, with what to do instead', async () => {
  const rows = Array.from({ length: 400 }, (_unused, index) => [`row ${index}`, 'x']);
  await assert.rejects(
    () => renderTablePicture({ title: 'Everything', rows }, aSurface(1)),
    /too large to share as a picture.*spreadsheet/s,
  );
});

test('it refuses exactly what the core refuses — the contract is not re-implemented here', () => {
  assert.throws(() => planTablePicture({ title: '', rows: [['x']] }, PER_CHARACTER), /needs a title/);
  assert.throws(() => planTablePicture({ title: 'Diet', rows: [] }, PER_CHARACTER), /nothing to export/);
  assert.throws(() => planTablePicture({ title: 'Diet', rows: [[{} as unknown as string]] }, PER_CHARACTER), TypeError);
});
