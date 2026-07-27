/**
 * NO BROWSER IN HERE — ASSERTED OVER A SCOPE THIS SUITE DISCOVERS FOR ITSELF.
 *
 * ## The claim
 *
 * This half of the export seam turns a table into bytes and text. The canvas, the share sheet and
 * the download live in the other half, under `src/`. The split is not tidiness: the moment a
 * `document` or a `Blob` appears in this directory, the core gate can no longer run these modules
 * at all, and the escaping rules that decide whether a coach's workbook opens become untestable
 * without a browser.
 *
 * ## Why the scan DISCOVERS its own scope
 *
 * This build has now shipped the same defect four times: a guard carrying a hand-typed list of the
 * files it covers, a file renamed or added, and the guard going green over something it no longer
 * reads. A typed list is a promise somebody has to remember to keep. So the scope is walked from
 * the tree, and — because a scan that reads nothing reports exactly the same silence as a scan that
 * finds nothing wrong — the discovery is asserted to be non-empty and above a floor, and the
 * scanner itself is pointed at a probe it MUST trip in the same run.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readTable } from './table.js';
import { tableToWorkbook } from './workbook.js';
import { tableToSeparatedValues } from './separated-values.js';
import { exportFileName } from './file-name.js';
import { aTable, readZip } from './testing.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * What may not appear. Each is either the browser itself or an object that only exists inside one,
 * and each has a home in the other half of the seam.
 */
const BROWSER = [
  'window', 'document', 'navigator', 'location', 'self', 'globalThis',
  'canvas', 'HTMLCanvasElement', 'Image', 'ImageData',
  'Blob', 'File', 'FileReader', 'URL', 'createObjectURL',
  'localStorage', 'sessionStorage', 'indexedDB', 'caches',
  'fetch', 'XMLHttpRequest', 'alert', 'requestAnimationFrame',
];

/**
 * The shipped modules of this package, discovered by walking the directory.
 *
 * `index.js` is the test entry point and `testing.js` is test support; neither is loaded by the
 * application, and both are excluded by that rule rather than by name-checking a list of what the
 * package happens to contain today.
 *
 * @returns {string[]} file names
 */
function shippedModules() {
  return readdirSync(HERE)
    .filter((name) => name.endsWith('.js'))
    .filter((name) => !name.endsWith('.test.js'))
    .filter((name) => name !== 'index.js' && name !== 'testing.js')
    .sort();
}

test('THE SCOPE IS DISCOVERED, AND IT IS NOT EMPTY', () => {
  const shipped = shippedModules();

  assert.ok(shipped.length >= 5, `the scan must have real files to read: found ${shipped.join(', ') || 'nothing'}`);
  const read = shipped.map((name) => readFileSync(join(HERE, name), 'utf8'));
  assert.ok(read.every((source) => source.length > 200), 'and every one of them was actually read');
  assert.ok(read.some((source) => source.includes('export function')), 'and holds the module source, not a stub');
});

test('NO BROWSER GLOBAL APPEARS IN ANY SHIPPED MODULE OF THIS PACKAGE', () => {
  const found = [];
  for (const name of shippedModules()) {
    const code = withoutComments(readFileSync(join(HERE, name), 'utf8'));
    for (const forbidden of BROWSER) {
      if (mentions(code, forbidden)) found.push(`${name} names ${forbidden}`);
    }
  }

  assert.deepEqual(found, [], 'this half of the seam is pure: bytes and text, no browser');
});

test('the scanner would SAY SO if one were there — the trap is proved armed', () => {
  // NON-VACUITY, twice over. Without this the assertion above is indistinguishable from a scanner
  // that matches nothing at all, and from one that strips a file down to nothing before reading it.
  const guilty = withoutComments([
    '/* This comment names document and canvas and window, and is not code. */',
    'export function draw() {',
    '  const element = document.createElement("canvas"); // a comment naming navigator',
    '  return new Blob([element]);',
    '}',
  ].join('\n'));

  assert.equal(mentions(guilty, 'document'), true);
  assert.equal(mentions(guilty, 'canvas'), true);
  assert.equal(mentions(guilty, 'Blob'), true);
  assert.equal(mentions(guilty, 'navigator'), false, 'a comment is not code');
  assert.equal(mentions(guilty, 'window'), false, 'nor is a block comment');
  assert.equal(mentions(guilty, 'element'), true, 'and the scanner reads what is left');

  // A name that merely CONTAINS a forbidden word is not a use of it.
  assert.equal(mentions('const documentation = 1;', 'document'), false);
  assert.equal(mentions('const myWindow = 1;', 'window'), false);
});

test('THE PACKAGE IS A LEAF: no shipped module here imports anything outside this directory', () => {
  const outsiders = [];
  for (const name of shippedModules()) {
    for (const specifier of importsIn(readFileSync(join(HERE, name), 'utf8'))) {
      if (!specifier.startsWith('./')) outsiders.push(`${name} imports ${specifier}`);
    }
  }
  assert.deepEqual(outsiders, [], 'a table and a title are the only way in');

  // NON-VACUITY: the same reader pointed at a module that DOES reach outside must say so.
  const known = importsIn(readFileSync(join(HERE, '..', 'session', 'glance.js'), 'utf8'));
  assert.ok(known.some((specifier) => specifier.startsWith('../')), `the reader finds an outside import when there is one: ${known.join(', ')}`);
});

test('NO CLOCK AND NO RANDOMNESS: both writers run with them taken away', () => {
  const realNow = Date.now;
  const realRandom = Math.random;
  const trip = (what) => () => { throw new Error(`the exporter reached for ${what}`); };

  try {
    Date.now = trip('the clock');
    Math.random = trip('a random number');

    // The traps are ARMED, proved before anything is produced under them.
    assert.throws(() => Date.now(), /reached for the clock/);
    assert.throws(() => Math.random(), /reached for a random number/);

    const workbook = tableToWorkbook(aTable());
    const text = tableToSeparatedValues(aTable());

    assert.equal(readZip(workbook).length, 5, 'and it produced a whole workbook anyway');
    assert.ok(text.includes('Diet — week of 3 August'));
    assert.equal(exportFileName('Diet', '.xlsx'), 'Diet.xlsx');
    assert.equal(readTable(aTable()).rows.length, 3);
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }

  assert.equal(typeof Date.now(), 'number', 'the clock is put back where it was found');
});

test('SAME TABLE, SAME BYTES, SAME TEXT — twice, with a different export in between', () => {
  const firstWorkbook = tableToWorkbook(aTable());
  const firstText = tableToSeparatedValues(aTable());

  tableToWorkbook({ title: 'Something else', rows: [['x', 1]] });

  assert.deepEqual(tableToWorkbook(aTable()), firstWorkbook);
  assert.equal(tableToSeparatedValues(aTable()), firstText);
});

/**
 * Source with its comments removed, so a header that NAMES the browser to say it is absent does not
 * trip a scan for the browser. Strings are deliberately left in: a forbidden name in a string
 * literal in this package is worth reporting too.
 *
 * @param {string} source @returns {string}
 */
function withoutComments(source) {
  let code = '';
  let at = 0;

  while (at < source.length) {
    if (source.startsWith('/*', at)) {
      const close = source.indexOf('*/', at + 2);
      at = close === -1 ? source.length : close + 2;
      code += ' ';
      continue;
    }
    if (source.startsWith('//', at)) {
      const newline = source.indexOf('\n', at);
      at = newline === -1 ? source.length : newline;
      code += ' ';
      continue;
    }
    code += source[at];
    at += 1;
  }

  return code;
}

/**
 * Whether code uses a name — as a whole identifier, not as part of a longer one. `documentation` is
 * not `document`, and a guard that could not tell them apart would be either useless or unusable.
 *
 * @param {string} code @param {string} name @returns {boolean}
 */
function mentions(code, name) {
  const isIdentifierCharacter = (character) => character !== undefined
    && (character === '_' || character === '$'
      || (character >= '0' && character <= '9')
      || (character >= 'a' && character <= 'z')
      || (character >= 'A' && character <= 'Z'));

  let at = code.indexOf(name);
  while (at !== -1) {
    const before = at === 0 ? undefined : code[at - 1];
    const after = code[at + name.length];
    if (!isIdentifierCharacter(before) && !isIdentifierCharacter(after)) return true;
    at = code.indexOf(name, at + 1);
  }
  return false;
}

/**
 * The module specifiers a source file imports, read by text rather than by pattern matching, as the
 * rest of this core's guards read them.
 *
 * @param {string} source @returns {string[]}
 */
function importsIn(source) {
  const marker = "from '";
  const specifiers = [];
  for (const line of source.split('\n')) {
    const at = line.indexOf(marker);
    if (at === -1) continue;
    const opening = at + marker.length;
    const closing = line.indexOf("'", opening);
    if (closing === -1) continue;
    specifiers.push(line.slice(opening, closing));
  }
  return specifiers;
}
