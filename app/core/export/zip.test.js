/**
 * THE ARCHIVE, READ BACK RATHER THAN COMPARED.
 *
 * Every assertion here is one a real ZIP reader makes, because the only claim worth proving about
 * this writer is that a reader can walk what it produced. The reader used is in `testing.js` and it
 * refuses rather than repairs, so a disagreement between a local header and the directory is a
 * thrown sentence and not a quietly corrected read.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { crc32, storeOnlyZip } from './zip.js';
import { readZip } from './testing.js';

const PARTS = [
  { name: 'first.xml', text: '<a>one</a>' },
  { name: 'nested/second.xml', text: '<b>two</b>' },
];

test('what goes in comes back out, in order, with its name', () => {
  const entries = readZip(storeOnlyZip(PARTS));

  assert.deepEqual(entries.map((entry) => entry.name), ['first.xml', 'nested/second.xml']);
  assert.deepEqual(entries.map((entry) => entry.text), ['<a>one</a>', '<b>two</b>']);
});

test('every entry is STORED, never compressed: method 0, and the two sizes agree', () => {
  for (const entry of readZip(storeOnlyZip(PARTS))) {
    assert.equal(entry.method, 0, `${entry.name} is not stored`);
    assert.equal(entry.compressedSize, entry.uncompressedSize);
  }
});

test('each checksum is the checksum OF ITS OWN BYTES, computed again from the parsed text', () => {
  const encoder = new TextEncoder();
  for (const entry of readZip(storeOnlyZip(PARTS))) {
    assert.equal(entry.crc, crc32(encoder.encode(entry.text)), `${entry.name} carries a stale checksum`);
  }
});

test('CRC-32 agrees with the published check value', () => {
  // The standard check: the CRC-32 of "123456789" is 0xCBF43926. A table built with the wrong
  // polynomial, or a loop that forgot to invert, produces a self-consistent archive that another
  // reader rejects, so this pins the arithmetic against something outside this file.
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('UTF-8 content survives: a checksum is over BYTES, and a length is a byte length', () => {
  const [entry] = readZip(storeOnlyZip([{ name: 'text.xml', text: 'Diet — 3 August, 60 °C, ×3' }]));

  assert.equal(entry.text, 'Diet — 3 August, 60 °C, ×3');
  assert.equal(
    entry.compressedSize,
    new TextEncoder().encode('Diet — 3 August, 60 °C, ×3').length,
    'the size is the encoded byte length, not the character count',
  );
});

test('an empty part is written and read back as empty rather than skipped', () => {
  const entries = readZip(storeOnlyZip([{ name: 'empty.xml', text: '' }, ...PARTS]));
  assert.equal(entries.length, 3);
  assert.equal(entries[0].text, '');
  assert.equal(entries[0].compressedSize, 0);
});

test('the offsets in the directory point AT the local headers, not near them', () => {
  const bytes = storeOnlyZip(PARTS);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (const entry of readZip(bytes)) {
    assert.equal(view.getUint32(entry.offset, true), 0x04034b50, `${entry.name} offset does not land on a header`);
  }
});

test('the reader is not credulous — it refuses bytes that are not an archive', () => {
  // NON-VACUITY for every assertion above: they are only evidence because this reader can FAIL.
  assert.throws(() => readZip(new Uint8Array(64)), /not a ZIP archive/);

  const damaged = storeOnlyZip(PARTS);
  damaged[0] = 0x00; // break the first local header signature
  assert.throws(() => readZip(damaged), /no local header/);
});

test('an archive of nothing is refused: an empty ZIP is a file nothing will open', () => {
  assert.throws(() => storeOnlyZip([]), /at least one part/);
  assert.throws(() => storeOnlyZip(null), /at least one part/);
});
