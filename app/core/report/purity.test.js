/**
 * PURITY AND REFUSALS, ASSERTED DIRECTLY RATHER THAN ASSERTED AROUND.
 *
 * Half of this package's acceptance is an ABSENCE — no store, no browser, no clock, no repetition
 * count, no personal best, no clinical field — and an absence is the easiest thing in the world to
 * prove by accident. A scan that looked at nothing reports exactly what a clean package reports.
 *
 * So every scan here does two things it would be cheaper not to do:
 *
 *  - **It DERIVES its own scope by walking this directory**, and never carries a typed list of the
 *    files it covers. A typed list is a promise somebody has to remember to keep, and guard-scope rot
 *    has been this build's recurring defect four separate times: a file is renamed, it drops out of
 *    the list, and the guard goes green while checking less than it says it does.
 *  - **It proves the scope is NON-VACUOUS in the same run** — a floor on the number of files found,
 *    and a probe pointed at a file that must trip the same check. A scan that read nothing and a
 *    package that does nothing wrong are otherwise the same green.
 *
 * Scans that would flag their own explanation are written as CALL-SHAPED or ACCESS-SHAPED tokens.
 * The headers in this package say the words "repetitions", "observed load" and "personal best" on
 * purpose — that is the decision being recorded so a later step does not re-open it by instinct — so
 * a scan for the bare words would flag the very sentences that exist to prevent the thing.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { projectProgressReport, allTextIn } from './progress.js';
import { aHistory, anEmptyHistory } from './testing.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Not shipped: the test entry point and the test material. Everything else is the module. */
const NOT_SHIPPED = ['index.js', 'testing.js'];

/** The floor the DISCOVERY itself must clear, so a scan that found nothing cannot pass. */
const AT_LEAST = 6;

/**
 * The shipped source files of this package, discovered by walking the directory.
 * @returns {string[]}
 */
function shippedFiles() {
  return readdirSync(HERE)
    .filter((name) => name.endsWith('.js') && !name.endsWith('.test.js') && !NOT_SHIPPED.includes(name))
    .sort();
}

/** @param {string} name @returns {string} */
const sourceOf = (name) => readFileSync(join(HERE, name), 'utf8');

test('THE SCAN SCOPE IS DISCOVERED, and it is not empty', () => {
  const shipped = shippedFiles();

  assert.ok(shipped.length >= AT_LEAST,
    `the scans below must have real files to read: found ${shipped.join(', ') || 'nothing'}`);
  // The package's own API and its boundary are in scope — the cheapest proof that discovery reached
  // the right place rather than some other directory that happens to hold JavaScript.
  for (const required of ['report.js', 'progress.js', 'participation.js', 'trends.js']) {
    assert.ok(shipped.includes(required), `${required} must be inside the scanned scope`);
  }
});

test('NO BROWSER GLOBAL appears in any shipped file in this package', () => {
  const browserOnly = [
    'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB',
    'fetch(', 'canvas', 'alert(', 'XMLHttpRequest', 'HTMLElement', 'setTimeout', 'requestAnimationFrame',
  ];

  const found = [];
  for (const name of shippedFiles()) {
    const source = sourceOf(name);
    for (const global of browserOnly) {
      if (source.includes(global)) found.push(`${name} mentions ${global}`);
    }
  }
  assert.deepEqual(found, [], 'this package is pure logic and runs with no browser at all');

  // NON-VACUITY: the same scan pointed at a file that DOES use a browser global must say so.
  const browserSource = readFileSync(join(HERE, '..', '..', 'src', 'main.tsx'), 'utf8');
  assert.ok(browserOnly.some((global) => browserSource.includes(global)),
    'the scan can find a browser global when there is one');
});

test('NO STORE CALL: a history is an argument; this package never goes and gets one', () => {
  const forbidden = ['/store/', '/crypto/', '/sync/', '/remote/', '/outbox/', '/export/', 'node:'];

  const found = [];
  for (const name of shippedFiles()) {
    for (const specifier of importsIn(sourceOf(name))) {
      if (forbidden.some((part) => specifier.includes(part))) found.push(`${name} imports ${specifier}`);
    }
  }
  assert.deepEqual(found, [],
    'a report is projected from records handed in, and it is not written out from here either');

  // NON-VACUITY: the reader really can see an import of the store when a file has one.
  const aStoreCaller = importsIn(readFileSync(join(HERE, '..', 'seed', 'reset.js'), 'utf8'));
  assert.ok(aStoreCaller.some((specifier) => specifier.includes('/store/')),
    `the scan can find a store import when there is one: ${aStoreCaller.join(', ')}`);
});

test('NO SECOND EXPORTER: nothing here writes, encodes, names or packs a file', () => {
  const writing = [
    'writeFile', 'createWriteStream', 'Blob(', 'toBlob', 'download', '.zip', 'text/csv',
    'application/', 'saveAs', 'fileName(', 'workbook',
  ];

  const found = [];
  for (const name of shippedFiles()) {
    const source = sourceOf(name);
    for (const token of writing) {
      if (source.includes(token)) found.push(`${name} mentions ${token}`);
    }
  }
  assert.deepEqual(found, [],
    'core/export/ is deliberately the only export machinery; this package makes content for it');

  // NON-VACUITY: the same scan over the real exporter must find something.
  const exporter = readFileSync(join(HERE, '..', 'export', 'workbook.js'), 'utf8');
  assert.ok(writing.some((token) => exporter.includes(token)),
    'the scan can find export machinery when there is some');
});

test('NO MEASUREMENT IS EVER READ: no shipped file reaches for a count, a load or a rest', () => {
  // ACCESS-SHAPED on purpose. The headers here name these fields to record why they are absent, so a
  // scan for the bare words would flag the sentences that exist to keep them out.
  const reaches = [
    '.repetitions', '.sets_completed', '.duration_seconds', '.rest_seconds', '.observed_load',
    '.intensity_level', '.clinical_note', '.clinical_reference', '.adaptation_flag', '.notes',
  ];

  const found = [];
  for (const name of shippedFiles()) {
    const source = sourceOf(name);
    for (const token of reaches) {
      if (source.includes(token)) found.push(`${name} reads ${token}`);
    }
  }
  assert.deepEqual(found, [],
    'the report says what was worked on and what was measured, never how many and never a diagnosis');

  // NON-VACUITY: the same scan over a file that DOES read those fields must find them.
  const glance = readFileSync(join(HERE, '..', 'session', 'glance.js'), 'utf8');
  assert.ok(reaches.some((token) => glance.includes(token)),
    'the scan can find a measurement being read when one is');
});

test('NO PERSONAL BEST: no shipped file takes a maximum, a peak or a ranking of a reading', () => {
  const crowning = ['personal_best', 'personalBest', 'best_value', 'bestValue', 'is_best', 'isBest',
    'peak_value', 'peakValue', 'highest', 'Math.max(', 'Math.min('];

  const found = [];
  for (const name of shippedFiles()) {
    const source = sourceOf(name);
    for (const token of crowning) {
      if (source.includes(token)) found.push(`${name} computes ${token}`);
    }
  }
  assert.deepEqual(found, [],
    'bests were offered to the user and explicitly not chosen; a best is the one number a client '
    + 'cannot beat on a tired day');

  // NON-VACUITY: the scan is capable of finding one. This is what it would look like.
  const wouldBeALeak = 'const best = Math.max(...points.map((point) => point.value));';
  assert.ok(crowning.some((token) => wouldBeALeak.includes(token)),
    'the scan can find a maximum being taken when there is one');
});

test('NO CLOCK AND NO RANDOMNESS: the whole report is produced with both taken away', () => {
  const realNow = Date.now;
  const realRandom = Math.random;
  const trip = (what) => () => { throw new Error(`the report reached for ${what}`); };

  try {
    Date.now = trip('the clock');
    Math.random = trip('a random number');

    // The traps are ARMED. Proved here, so what runs below is not evidence about a trap that never
    // installed.
    assert.throws(() => Date.now(), /reached for the clock/);
    assert.throws(() => Math.random(), /reached for a random number/);

    const report = projectProgressReport(aHistory());
    assert.equal(report.attendance.attended, 4, 'and it produced a whole report anyway');
    assert.equal(report.summary.paragraphs.length, 4);
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }

  assert.equal(typeof Date.now(), 'number', 'the clock is put back where it was found');
});

test('SAME HISTORY, SAME REPORT — twice, deeply', () => {
  assert.deepEqual(projectProgressReport(aHistory()), projectProgressReport(aHistory()));
});

test('NO MEMORY BETWEEN CALLS: another client in between changes nothing', () => {
  const first = projectProgressReport(aHistory());
  projectProgressReport(anEmptyHistory());
  const third = projectProgressReport(aHistory());

  assert.deepEqual(first, third);
});

test('NOTHING IS MUTATED: the records handed in come back untouched', () => {
  const history = aHistory();
  const before = JSON.stringify(history);

  projectProgressReport(history);

  assert.equal(JSON.stringify(history), before);
});

test('NO EMOJI in any string the report carries', () => {
  for (const text of allTextIn(projectProgressReport(aHistory()))) {
    for (const character of text) {
      assert.ok(character.codePointAt(0) < 0x2190, `"${character}" is a symbol, in "${text}"`);
    }
  }
});

/**
 * The module specifiers a source file imports or re-exports, read by text rather than by pattern
 * matching: this application's shipped source is kept free of regular expressions.
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
