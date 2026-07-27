/**
 * THE THREE ARTEFACTS, EACH ONE A REAL FILE.
 *
 * These assertions are about what leaves the application: the bytes are the format they claim, the
 * name is the coach's own title, and the declared type is what a share sheet decides on. The
 * comma-separated file's byte order mark has its own test, because it is the only thing this layer
 * adds to the core's text and the reason it adds it is a mangled chart in front of a client.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { tableToSeparatedValues } from '../../core/export/export.js';
import { browserPictureSurface, pictureFile, separatedValuesFile, workbookFile } from './table-export.ts';
import type { PictureCanvas, PictureSurface } from './table-picture.ts';

const TABLE = {
  title: 'Diet — week of 3 August',
  headings: ['Day', 'Morning'],
  rows: [['Monday', 'Yoghurt & fruit'], ['Tuesday', 'Oats, milk']],
};

/** A canvas that answers with a real PNG-shaped blob. */
function aSurface(): PictureSurface {
  const context = {
    font: '',
    fillStyle: '' as string,
    textBaseline: 'alphabetic' as const,
    measureText: (text: string) => ({ width: text.length * 8 }),
    fillText: () => {},
    fillRect: () => {},
    scale: () => {},
  };
  const canvas: PictureCanvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: (callback, type) => callback(new Blob([new Uint8Array([137, 80, 78, 71])], { type })),
  };
  return { pixelRatio: 2, createCanvas: () => canvas };
}

test('the workbook is a real workbook, named from the title and declared as a spreadsheet', async () => {
  const file = workbookFile(TABLE);

  assert.equal(file.name, 'Diet — week of 3 August.xlsx');
  assert.equal(file.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  const bytes = new Uint8Array(await file.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 2)], [0x50, 0x4b], 'the bytes begin PK — it is an archive, not text');
  assert.ok(bytes.length > 100);
});

test('the comma-separated file carries a BYTE ORDER MARK, or Windows mangles every accent', async () => {
  const file = separatedValuesFile(TABLE);

  // Asserted on the BYTES, deliberately. `Blob.text()` decodes UTF-8 and strips a leading mark, so a
  // test written against the decoded text reports the mark missing whether it is there or not — and
  // the bytes are what a spreadsheet application actually reads.
  const bytes = new Uint8Array(await file.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'the file begins with the UTF-8 mark');

  const text = await file.text();
  assert.equal(text, tableToSeparatedValues(TABLE), 'and nothing else about the core\'s text is changed');
  assert.ok(text.includes('Diet — week of 3 August'));
  assert.equal(file.name, 'Diet — week of 3 August.csv');
  assert.equal(file.type, 'text/csv');
});

test('the picture is a PNG named from the same title', async () => {
  const file = await pictureFile(TABLE, aSurface());

  assert.equal(file.name, 'Diet — week of 3 August.png');
  assert.equal(file.type, 'image/png');
  assert.ok(file.size > 0);
});

test('all three artefacts share ONE name and differ only by extension', async () => {
  const picture = await pictureFile(TABLE, aSurface());
  const names = [workbookFile(TABLE).name, separatedValuesFile(TABLE).name, picture.name];

  assert.deepEqual(names.map((name) => name.slice(0, name.lastIndexOf('.'))), [
    'Diet — week of 3 August',
    'Diet — week of 3 August',
    'Diet — week of 3 August',
  ]);
});

test('a title a file system would fight over still produces a usable name', () => {
  assert.equal(workbookFile({ title: 'Diet: 3/8', rows: [['x']] }).name, 'Diet 3 8.xlsx');
});

test('ALL THREE REFUSE THE SAME TABLE — one contract, read in one place', async () => {
  const broken = { title: 'Diet', rows: [[{} as unknown as string]] };

  assert.throws(() => workbookFile(broken), TypeError);
  assert.throws(() => separatedValuesFile(broken), TypeError);
  await assert.rejects(() => pictureFile(broken, aSurface()), TypeError);

  assert.throws(() => workbookFile({ title: '', rows: [['x']] }), /needs a title/);
  assert.throws(() => separatedValuesFile({ title: 'Diet', rows: [] }), /nothing to export/);
});

test('the browser surface hands over the document\'s own canvas and the ratio it was given', () => {
  const created: string[] = [];
  const fakeDocument = {
    createElement: (tag: string) => { created.push(tag); return { tag } as unknown as HTMLCanvasElement; },
  } as unknown as Document;

  const surface = browserPictureSurface(fakeDocument, 2.75);

  assert.equal(surface.pixelRatio, 2.75);
  surface.createCanvas();
  assert.deepEqual(created, ['canvas'], 'and it asks for a canvas, not something else');
});
