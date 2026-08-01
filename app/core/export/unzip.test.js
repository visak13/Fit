/**
 * READING BACK WHAT THIS PACKAGE WRITES — and refusing what it could only pretend to read.
 *
 * The writer's own suites already assert that a workbook is a well-formed archive, THROUGH this
 * reader. What is asserted here is the reader itself: that it round-trips, that it refuses a file
 * this application could not honestly open, and that its refusals are refusals rather than repairs.
 *
 * That last one is the reason a reader belongs in shipped code at all. A restore is the caller, and
 * every repair a lenient parser might perform is a defect it would hide behind a file that opened.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { storeOnlyZip } from './zip.js';
import { readStoreOnlyZip, readStoreOnlyZipParts, STORED } from './unzip.js';
import { tableToWorkbook } from './workbook.js';
import { aTable, NASTY } from './testing.js';

test('WHAT GOES IN COMES OUT, byte for byte, including the cells that break writers', () => {
  const parts = [
    { name: 'backup.json', text: '[{"id":"coach-floor-press"}]' },
    { name: 'exercise.csv', text: `id,name\r\ncoach-floor-press,"${NASTY.QUOTE}"\r\n` },
    { name: 'notes.txt', text: NASTY.EVERYTHING },
  ];

  const entries = readStoreOnlyZip(storeOnlyZip(parts));

  assert.equal(entries.length, parts.length);
  assert.deepEqual(entries.map((e) => e.name), parts.map((p) => p.name), 'the order given is the order written');
  for (const [index, part] of parts.entries()) {
    assert.equal(entries[index].text, part.text, `${part.name} did not survive the round trip`);
    assert.equal(entries[index].method, STORED);
  }
});

test('A COMPRESSED ENTRY IS REFUSED, because decoding it as text would hand the caller rubbish', () => {
  // Nothing this application writes is compressed, so a compressed entry means the file came from
  // somewhere else. Reporting the method and trusting the caller to look at it is what the
  // test-support version did; a restore would not have looked.
  const bytes = storeOnlyZip([{ name: 'backup.json', text: '[]' }]);

  // Method 0 -> 8 (deflate) in the local header AND the central directory, which is what a real
  // compressed archive would carry. Nothing else about the file changes.
  const compressed = Uint8Array.from(bytes);
  compressed[8] = 8;
  const directoryStart = new DataView(compressed.buffer).getUint32(compressed.length - 6, true);
  compressed[directoryStart + 10] = 8;

  assert.throws(() => readStoreOnlyZip(compressed), /compressed entries \(backup\.json\)/);

  // NON-VACUITY, and it is the load-bearing half: the SAME bytes with the method left alone must
  // read cleanly. Without this, a reader that threw on everything would pass the assertion above.
  assert.equal(readStoreOnlyZip(bytes)[0].name, 'backup.json');
});

test('TWO ENTRIES WITH ONE NAME ARE REFUSED rather than resolved by whichever came last', () => {
  const bytes = storeOnlyZip([
    { name: 'backup.json', text: '[{"first":true}]' },
    { name: 'backup.json', text: '[{"second":true}]' },
  ]);

  // The walk still reads both — the file genuinely holds two, and saying otherwise would be the
  // reader lying about the bytes.
  assert.equal(readStoreOnlyZip(bytes).length, 2);

  // But "the last one wins" is a rule that decides silently which half of a backup gets restored.
  assert.throws(() => readStoreOnlyZipParts(bytes), /two entries called "backup\.json"/);
});

test('A FILE THAT IS NOT AN ARCHIVE IS REFUSED IN WORDS, not with an out-of-range read', () => {
  assert.throws(() => readStoreOnlyZip(new Uint8Array(0)), /too short/);
  assert.throws(() => readStoreOnlyZip(new TextEncoder().encode('this is a note, not an archive')), /not a ZIP archive/);
  assert.throws(() => readStoreOnlyZip(/** @type {any} */ ('a string')), /read from bytes/);
});

test('A TRUNCATED ARCHIVE IS REFUSED, rather than read as far as it goes', () => {
  const bytes = storeOnlyZip([
    { name: 'backup.json', text: JSON.stringify(Array.from({ length: 40 }, (_, n) => ({ n }))) },
    { name: 'exercise.csv', text: 'id,name\r\n' },
  ]);

  // The end record survives, its directory does not: the shape a half-written file has.
  const truncated = Uint8Array.from([...bytes.subarray(0, 40), ...bytes.subarray(bytes.length - 22)]);
  assert.throws(() => readStoreOnlyZip(truncated));
});

test('A CORRUPTED HEADER IS REFUSED rather than parsed into a plausible entry', () => {
  const bytes = storeOnlyZip([{ name: 'backup.json', text: '[]' }]);
  const tampered = Uint8Array.from(bytes);
  // The local header's recorded size, changed so it disagrees with the directory. A reader that
  // accepted this would produce a file some readers open and others refuse.
  tampered[18] = 99;
  assert.throws(() => readStoreOnlyZip(tampered), /disagree about the size/);
});

test('IT READS A REAL WORKBOOK, which is the archive this package has always written', () => {
  // The same reader, the same package, a different caller: a workbook and a backup are one format.
  const parts = readStoreOnlyZipParts(tableToWorkbook(aTable()));

  assert.ok(parts.has('[Content_Types].xml'), 'the part a spreadsheet application looks for first');
  assert.ok(parts.size >= 5);
});

test('the parts map is name to text, and nothing is lost between the two readers', () => {
  const parts = [
    { name: 'backup.json', text: '{"a":1}' },
    { name: 'client.csv', text: 'id\r\n' },
  ];
  const bytes = storeOnlyZip(parts);

  const walked = readStoreOnlyZip(bytes);
  const mapped = readStoreOnlyZipParts(bytes);

  assert.equal(walked.length, mapped.size);
  for (const entry of walked) assert.equal(mapped.get(entry.name), entry.text);
});
