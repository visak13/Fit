/**
 * TRENDS — the series, the discovery that finds them, and the personal best that is not there.
 *
 * The discovery test is the one that matters most: a kind the coach invents must chart itself with no
 * edit to this package, and the same run must prove the discovery found something, because a
 * discovery that found nothing and a client with no readings look identical from the outside.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { READING_KINDS, READING_UNITS } from '../model/vocabularies.js';
import { narrowToClient } from './participation.js';
import {
  MODEL_READING_UNITS, UNIT_WORDS, knownReadingKinds, labelForKind, projectTrends, readValue,
  readingKindsIn, wordsForUnit,
} from './trends.js';
import { HER, WHEN, stored, theReadings } from './testing.js';

/** The narrowed readings this suite charts. */
const hers = () => narrowToClient(HER.id, { readings: theReadings() }).readings;

test('THE KIND LIST IS DISCOVERED FROM THE DATA, and the discovery is not empty', () => {
  const kinds = readingKindsIn(hers());

  assert.ok(kinds.length >= 3, `discovery must find real kinds: found ${kinds.join(', ') || 'nothing'}`);
  assert.deepEqual([...kinds].sort(), ['farmers-carry-distance', 'plank-hold', 'resting-heart-rate']);
});

test('A KIND THE COACH INVENTED IS CHARTED, with no list here knowing about it', () => {
  const trends = projectTrends(hers());
  const invented = trends.find((trend) => trend.kind === 'farmers-carry-distance');

  assert.ok(invented, 'the kind is present at all');
  assert.equal(invented.known, false, 'and it is correctly reported as one the app does not ship');
  assert.equal(invented.point_count, 2);
  assert.equal(invented.change, 12);

  // NON-VACUITY on the other side: a shipped kind IS reported as known.
  assert.equal(trends.find((trend) => trend.kind === 'plank-hold').known, true);
  assert.equal(knownReadingKinds().includes('plank-hold'), true);
  assert.equal(knownReadingKinds().includes('farmers-carry-distance'), false);
});

test('the shipped vocabulary is read from the model, not restated here', () => {
  assert.deepEqual(knownReadingKinds(), Object.keys(READING_KINDS).sort());
  assert.ok(knownReadingKinds().length > 0, 'and the model actually declares some');
});

test('EVERY UNIT THE MODEL DECLARES HAS WORDS — the map cannot fall behind the vocabulary', () => {
  assert.deepEqual(Object.keys(UNIT_WORDS).sort(), [...READING_UNITS].sort());
  assert.deepEqual([...MODEL_READING_UNITS], [...READING_UNITS]);

  assert.equal(wordsForUnit('bpm'), 'beats per minute');
  assert.equal(wordsForUnit('count'), '', 'a bare count reads better as nothing at all');
  assert.equal(wordsForUnit('newton-metres'), 'newton-metres', 'a unit it has never seen reads as itself');
});

test('a series carries its points in time order, with where it started and where it stands', () => {
  const plank = projectTrends(hers()).find((trend) => trend.kind === 'plank-hold');

  assert.deepEqual(plank.points.map((point) => point.value), [40, 48, 55, 65]);
  assert.equal(plank.first.value, 40);
  assert.equal(plank.latest.value, 65);
  assert.equal(plank.change, 25);
  assert.equal(plank.direction, 'up');
  assert.equal(plank.unit, 'seconds');
  assert.equal(plank.label, 'plank hold');
});

test('DOWN IS A DIRECTION, NOT A VERDICT', () => {
  const heart = projectTrends(hers()).find((trend) => trend.kind === 'resting-heart-rate');

  assert.equal(heart.direction, 'down');
  assert.equal(heart.change, -4);
  // Nothing in the trend judges the movement. There is no field that could.
  assert.deepEqual(Object.keys(heart).filter((key) => ['good', 'better', 'worse', 'improved', 'score'].includes(key)), []);
});

test('NO PERSONAL BEST: a spike in the middle changes nothing except that one point', () => {
  const readings = theReadings();
  // The third plank hold becomes an outstanding day. If a best existed anywhere, this is the value
  // that would surface — and the whole point is that it does not.
  const spiked = readings.map((record) => (record.record_id === 'r-3'
    ? stored('r-3', { ...record.content, value: 200 })
    : record));

  const plain = projectTrends(hers()).find((trend) => trend.kind === 'plank-hold');
  const withSpike = projectTrends(narrowToClient(HER.id, { readings: spiked }).readings)
    .find((trend) => trend.kind === 'plank-hold');

  assert.equal(withSpike.first.value, plain.first.value, 'the series still starts where it started');
  assert.equal(withSpike.latest.value, plain.latest.value, 'and still stands where it stands');
  assert.equal(withSpike.change, plain.change, 'and the movement is measured the same way');
  assert.deepEqual(withSpike.points.map((point) => point.value), [40, 48, 200, 65]);

  // And no field anywhere in the trend has crowned it.
  assert.equal(JSON.stringify(withSpike).includes('"best"'), false);
  assert.equal(Object.values(withSpike).includes(200), false, 'the spike is a point, never a headline');
});

test('one point is a measurement, not a trend: there is no direction to report', () => {
  const single = projectTrends([{ kind: 'wall-sit', value: 30, unit: 'seconds', at: WHEN.one, session_id: null }]);

  assert.equal(single[0].point_count, 1);
  assert.equal(single[0].change, null);
  assert.equal(single[0].direction, null);
});

test('a kind recorded in TWO units is charted without a comparison rather than compared wrongly', () => {
  const mixed = projectTrends([
    { kind: 'grip-test', value: 30, unit: 'seconds', at: WHEN.one, session_id: null },
    { kind: 'grip-test', value: 12, unit: 'repetitions', at: WHEN.two, session_id: null },
  ]);

  assert.equal(mixed[0].mixed_units, true);
  assert.equal(mixed[0].unit, null);
  assert.equal(mixed[0].change, null, 'seconds and repetitions do not subtract');
  assert.equal(mixed[0].point_count, 2, 'but both points are still shown');
});

test('steady is a direction of its own', () => {
  const flat = projectTrends([
    { kind: 'resting-heart-rate', value: 58, unit: 'bpm', at: WHEN.one, session_id: null },
    { kind: 'resting-heart-rate', value: 58, unit: 'bpm', at: WHEN.two, session_id: null },
  ]);

  assert.equal(flat[0].direction, 'steady');
  assert.equal(flat[0].change, 0);
});

test('a kind reads as words, and a value reads as a person writes one', () => {
  assert.equal(labelForKind('resting-heart-rate'), 'resting heart rate');
  assert.equal(labelForKind('vo2-max-estimate'), 'vo2 max estimate');
  assert.equal(labelForKind(''), '');

  assert.equal(readValue(40), '40');
  assert.equal(readValue(40.25), '40.3');
  assert.equal(readValue(Number.NaN), '');
});

test('no readings at all is no trends, not an empty chart', () => {
  assert.deepEqual(projectTrends([]), []);
  assert.deepEqual(projectTrends(undefined), []);
});
