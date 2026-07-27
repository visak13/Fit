/**
 * PURITY, ASSERTED DIRECTLY RATHER THAN ASSERTED AROUND.
 *
 * The acceptance for this package is partly an ABSENCE — no browser global, no store call — and an
 * absence is the easiest thing in the world to prove by accident. A scan that looked at nothing
 * reports exactly what a clean package reports.
 *
 * So every scan here does two things it would be cheaper not to do:
 *
 *  - **It DERIVES its own scope by walking this directory**, and never carries a typed list of the
 *    files it covers. A typed list is a promise somebody has to remember to keep, and in this build
 *    guard-scope rot has now been the recurring defect four separate times: a file gets renamed, it
 *    drops out of the list, and the guard goes green while checking less than it says it does.
 *  - **It proves the scope is NON-VACUOUS in the same run** — a floor on the number of files found,
 *    and a probe pointed at something that must trip the check. A trap that failed to install and a
 *    module that touched nothing are otherwise the same green.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chartTable, projectWeekChart } from './chart.js';
import { projectDietHistory } from './history.js';
import { aDay, aDietPlan, aStoredDietPlan, anEntry } from './testing.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Not shipped: the test entry point and the test material. Everything else is the module. */
const NOT_SHIPPED = ['index.js', 'testing.js'];

/** The floor the DISCOVERY itself must clear, so a scan that found nothing cannot pass. */
const AT_LEAST = 4;

/**
 * The shipped source files of this package, discovered by walking the directory.
 * @returns {string[]}
 */
function shippedFiles() {
  return readdirSync(HERE)
    .filter((name) => name.endsWith('.js') && !name.endsWith('.test.js') && !NOT_SHIPPED.includes(name))
    .sort();
}

test('THE SCAN SCOPE IS DISCOVERED, and it is not empty', () => {
  const shipped = shippedFiles();

  assert.ok(shipped.length >= AT_LEAST,
    `the scans below must have real files to read: found ${shipped.join(', ') || 'nothing'}`);
  // The package's own API is in scope — the cheapest proof that discovery reached the right place.
  assert.ok(shipped.includes('diet.js'));
  assert.ok(shipped.includes('chart.js'));
  assert.ok(shipped.includes('history.js'));
});

test('NO BROWSER GLOBAL appears in any shipped file in this package', () => {
  const browserOnly = [
    'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB',
    'fetch(', 'canvas', 'alert(', 'XMLHttpRequest', 'HTMLElement', 'setTimeout', 'requestAnimationFrame',
  ];

  const found = [];
  for (const name of shippedFiles()) {
    const source = readFileSync(join(HERE, name), 'utf8');
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

test('NO STORE CALL: nothing here imports the store, the crypto or anything that reaches a device', () => {
  const forbidden = ['/store/', '/crypto/', '/sync/', '/remote/', '/outbox/', 'node:'];

  const found = [];
  for (const name of shippedFiles()) {
    for (const specifier of importsIn(readFileSync(join(HERE, name), 'utf8'))) {
      if (forbidden.some((part) => specifier.includes(part))) {
        found.push(`${name} imports ${specifier}`);
      }
    }
  }
  assert.deepEqual(found, [],
    'a plan is an argument; the diet package never goes and gets one, and never seals one');

  // NON-VACUITY: the reader really can see an import of the store when a file has one.
  const aStoreCaller = importsIn(readFileSync(join(HERE, '..', 'seed', 'reset.js'), 'utf8'));
  assert.ok(aStoreCaller.some((specifier) => specifier.includes('/store/')),
    `the scan can find a store import when there is one: ${aStoreCaller.join(', ')}`);
});

test('DIET IS PLAINTEXT: nothing in this package seals, unseals or asks for a passphrase', () => {
  // Call-shaped tokens on purpose. The headers here SAY the words "encryption" and "sensitivity" —
  // that is the decision being recorded so a later step does not re-open it by instinct — so a scan
  // for the bare words would flag the very sentences that exist to prevent the thing.
  const locks = ['seal(', 'unseal(', 'sealValue', 'encrypt(', 'decrypt(', 'passphrase'];

  const found = [];
  for (const name of shippedFiles()) {
    const source = readFileSync(join(HERE, name), 'utf8');
    for (const lock of locks) {
      if (source.includes(lock)) found.push(`${name} calls ${lock}`);
    }
  }
  assert.deepEqual(found, [], 'a diet plan is a food chart; a lock here is a misread of the step');

  // NON-VACUITY: the same scan run over the module that DOES seal things must find something.
  const sealing = readFileSync(join(HERE, '..', 'crypto', 'sealing.js'), 'utf8');
  assert.ok(locks.some((lock) => sealing.includes(lock)),
    'the scan can find a lock when there is one');
});

test('SAME PLAN, SAME CHART — twice, deeply', () => {
  assert.deepEqual(projectWeekChart(aStoredDietPlan()), projectWeekChart(aStoredDietPlan()));
  assert.deepEqual(chartTable(projectWeekChart(aStoredDietPlan())),
    chartTable(projectWeekChart(aStoredDietPlan())));
});

test('NO MEMORY BETWEEN CALLS: a different plan in between changes nothing', () => {
  const first = projectWeekChart(aStoredDietPlan());
  projectWeekChart(aDietPlan({ days: [aDay(7, [anEntry({ time: '22:00', items: ['Something else'] })])] }));
  const third = projectWeekChart(aStoredDietPlan());

  assert.deepEqual(first, third);
});

test('NO CLOCK and NO RANDOMNESS: both projections run with both taken away', () => {
  const realNow = Date.now;
  const realRandom = Math.random;
  const realDate = globalThis.Date;
  const trip = (what) => () => { throw new Error(`the diet projection reached for ${what}`); };

  try {
    Date.now = trip('the clock');
    Math.random = trip('a random number');

    // The traps are ARMED. Proved here, so what runs below is not evidence about a trap that never
    // installed.
    assert.throws(() => Date.now(), /reached for the clock/);
    assert.throws(() => Math.random(), /reached for a random number/);

    const chart = projectWeekChart(aStoredDietPlan());
    const history = projectDietHistory([aStoredDietPlan()]);

    assert.equal(chart.row_count, 3, 'and it produced a whole chart anyway');
    assert.equal(history.plan_count, 1, 'and a whole history anyway');
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
    globalThis.Date = realDate;
  }

  assert.equal(typeof Date.now(), 'number', 'the clock is put back where it was found');
});

test('NOTHING IS MUTATED: the record handed in comes back untouched', () => {
  const plan = aStoredDietPlan();
  const before = JSON.stringify(plan);

  projectWeekChart(plan);
  projectDietHistory([plan]);

  assert.equal(JSON.stringify(plan), before);
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
