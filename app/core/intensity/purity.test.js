/**
 * PURITY, ASSERTED DIRECTLY RATHER THAN ASSERTED AROUND.
 *
 * Same inputs, same output. No clock, no store, no randomness, no memory between calls. The reason
 * this suite takes the clock and the random number generator AWAY rather than merely checking that
 * two calls agree: a module that read a clock would pass a same-inputs-same-output test written on a
 * fixed afternoon, and go on passing it forever.
 *
 * Every trap here is proved to be ARMED in the same run, by pointing it at a probe that must trip it.
 * A trap that silently failed to install would report all-green, which is indistinguishable from a
 * module that genuinely touched nothing.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { proposeSession } from './intensity.js';
import { aHistory, anExercise, aPattern, aPerformedRecord, aRoutine, T } from './testing.js';

const HERE = dirname(fileURLToPath(import.meta.url));

const EASY = anExercise({ id: 'glute-bridge', intensity: 'low', movementPattern: 'hip-extension', primaryMuscles: ['glutes'] });
const MIDDLING = anExercise({ id: 'goblet-squat', intensity: 'medium', primaryMuscles: ['glutes', 'quadriceps'] });
const HARD = anExercise({ id: 'jump-squat', intensity: 'high', primaryMuscles: ['glutes', 'quadriceps'] });

/** A request that reaches the branches worth pinning: a measured baseline and a substitution. */
function aRequest() {
  return {
    pattern: aPattern(['low', 'medium', 'high']),
    routine: aRoutine({ exercises: [EASY, MIDDLING, EASY] }),
    catalogue: [EASY, MIDDLING, HARD],
    history: aHistory([
      aPerformedRecord({ exerciseId: 'glute-bridge', recordedAt: T.oldest, repetitions: 12, level: 'low' }),
      aPerformedRecord({ exerciseId: 'glute-bridge', recordedAt: T.latest, repetitions: 30, level: 'low' }),
    ]),
    variation: { rotate: 0 },
  };
}

test('SAME INPUTS, SAME OUTPUT — twice, deeply', () => {
  assert.deepEqual(proposeSession(aRequest()), proposeSession(aRequest()));
});

test('NO MEMORY BETWEEN CALLS: a different request in between changes nothing', () => {
  const first = proposeSession(aRequest());
  proposeSession({
    pattern: aPattern(['high', 'low'], 'repeat-cycle'),
    routine: aRoutine({ exercises: [HARD, EASY] }),
    catalogue: [EASY, HARD],
  });
  const third = proposeSession(aRequest());

  assert.deepEqual(first, third);
});

test('NO CLOCK and NO RANDOMNESS: the adapter runs with both taken away', () => {
  const realNow = Date.now;
  const realRandom = Math.random;
  const realPerformanceNow = globalThis.performance ? globalThis.performance.now : null;
  const trip = (what) => () => { throw new Error(`the adapter reached for ${what}`); };

  try {
    Date.now = trip('the clock');
    Math.random = trip('a random number');
    if (realPerformanceNow) globalThis.performance.now = trip('the high-resolution clock');

    // The traps are ARMED. Proved here, so that a proposal produced below cannot be evidence about a
    // trap that never installed.
    assert.throws(() => Date.now(), /reached for the clock/);
    assert.throws(() => Math.random(), /reached for a random number/);
    if (realPerformanceNow) assert.throws(() => globalThis.performance.now(), /high-resolution clock/);

    const proposal = proposeSession(aRequest());
    assert.equal(proposal.positions.length, 3, 'and it produced a whole session anyway');
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
    if (realPerformanceNow) globalThis.performance.now = realPerformanceNow;
  }

  assert.equal(typeof Date.now(), 'number', 'the clock is put back where it was found');
});

test('ORDERING is an argument: the same rotate always chooses the same substitute', () => {
  const request = () => ({
    pattern: aPattern(['low', 'high']),
    routine: aRoutine({ exercises: [EASY, EASY] }),
    catalogue: [EASY, HARD, anExercise({ id: 'box-jump', intensity: 'high', primaryMuscles: ['glutes'] })],
  });

  const zeroOnce = proposeSession({ ...request(), variation: { rotate: 0 } });
  const zeroAgain = proposeSession({ ...request(), variation: { rotate: 0 } });
  const one = proposeSession({ ...request(), variation: { rotate: 1 } });

  assert.deepEqual(zeroOnce, zeroAgain);
  assert.notEqual(zeroOnce.positions[1].exercise_id, one.positions[1].exercise_id,
    'rotation genuinely selects a different candidate, so the equality above is not trivial');
});

test('THIS PACKAGE IS A LEAF: no shipped module here imports anything outside this directory', () => {
  const notShipped = ['testing.js', 'index.js'];
  const shipped = readdirSync(HERE)
    .filter((name) => name.endsWith('.js') && !name.endsWith('.test.js') && !notShipped.includes(name));
  assert.ok(shipped.length >= 7, `the scan must have real files to read: found ${shipped.join(', ')}`);

  const outsiders = [];
  for (const name of shipped) {
    for (const specifier of importsIn(readFileSync(join(HERE, name), 'utf8'))) {
      if (!specifier.startsWith('./')) outsiders.push(`${name} imports ${specifier}`);
    }
  }
  assert.deepEqual(outsiders, [],
    'no store, no clock, no platform, no framework — the arguments are the only way in');

  // NON-VACUITY: the same scan pointed at a module that DOES reach outside its directory must say so.
  // Without this probe a scan that found no import statements at all would report the same silence.
  const known = importsIn(readFileSync(join(HERE, '..', 'session', 'glance.js'), 'utf8'));
  assert.ok(known.some((specifier) => specifier.startsWith('../')),
    `the scan can find an outside import when there is one: ${known.join(', ')}`);
});

/**
 * The module specifiers a source file imports or re-exports, read by text rather than by pattern
 * matching: this application's shipped source is kept free of regular expressions.
 *
 * A line naming a module always holds `from` followed immediately by a quoted specifier, which covers
 * a single-line import, the closing line of a multi-line one, and an `export … from` re-export alike.
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
