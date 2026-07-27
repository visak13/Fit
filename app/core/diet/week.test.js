/**
 * THE WEEK: the day table and the time ordering, tested where they are decided.
 *
 * The ordering tests are written so a naive string sort FAILS them. A chart sorted as strings looks
 * sorted — every time still ascends inside its own hour — which is why the cases here are the ones
 * where the two orders disagree.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DAYS_IN_WEEK, WEEKDAYS, compareTimes, minutesOfDay, weekdayNameOf, weekdayOf,
} from './week.js';

test('THE TABLE is the seven days, ISO-8601: 1 is Monday and 7 is Sunday', () => {
  assert.equal(DAYS_IN_WEEK, 7);
  assert.equal(WEEKDAYS.length, 7);
  assert.deepEqual(WEEKDAYS.map((day) => day.day), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(weekdayNameOf(1), 'Monday');
  assert.equal(weekdayNameOf(7), 'Sunday');
  assert.equal(weekdayOf(2).short_name, 'Tue');
  assert.equal(weekdayOf(4).name, 'Thursday');
});

test('THE TABLE IS FROZEN: it is the shared table, not a starting point', () => {
  assert.ok(Object.isFrozen(WEEKDAYS));
  assert.ok(WEEKDAYS.every((day) => Object.isFrozen(day)));
});

test('a day number outside the seven is reported, never renamed into one of them', () => {
  assert.equal(weekdayOf(0), null);
  assert.equal(weekdayOf(8), null);
  assert.equal(weekdayOf('1'), null, 'the record stores an integer; a string is not it');
  assert.equal(weekdayNameOf(9), 'Day 9');
});

test('minutes since midnight, read off the record\'s own 24-hour form', () => {
  assert.equal(minutesOfDay('00:00'), 0);
  assert.equal(minutesOfDay('08:30'), 510);
  assert.equal(minutesOfDay('23:59'), 1439);
});

test('a time that cannot be read is null — never zero, which would sort it to breakfast', () => {
  for (const notATime of ['', '8', '8:00 am', 'noon', '24:00', '12:60', '1:2:3', ':30', '08:', 'ab:cd', null, undefined, 800]) {
    assert.equal(minutesOfDay(notATime), null, `${String(notATime)} is not a readable time`);
  }
});

test('the numeric forms Number() would accept are NOT times', () => {
  assert.equal(minutesOfDay('1e1:00'), null);
  assert.equal(minutesOfDay('0x8:00'), null);
  assert.equal(minutesOfDay(' 8:00'), null);
  assert.equal(minutesOfDay('+8:00'), null);
});

test('TIMES SORT AS TIMES, in the cases where string order disagrees', () => {
  const asWritten = ['13:00', '9:00', '08:00', '10:30'];

  assert.deepEqual([...asWritten].sort(compareTimes), ['08:00', '9:00', '10:30', '13:00']);

  // Non-vacuity: the plain string sort really does get this wrong, so the assertion above is a
  // statement about compareTimes rather than about any sort at all.
  assert.deepEqual([...asWritten].sort(), ['08:00', '10:30', '13:00', '9:00']);
});

test('a time that cannot be read sorts LAST and is never dropped', () => {
  const times = ['later', '08:00', '20:00'];
  assert.deepEqual([...times].sort(compareTimes), ['08:00', '20:00', 'later']);
});

test('the ordering is TOTAL: two unreadable times still have a stable order', () => {
  assert.equal(compareTimes('after gym', 'after gym'), 0);
  assert.ok(compareTimes('a', 'b') < 0);
  assert.ok(compareTimes('b', 'a') > 0);
});

test('equal times compare equal, so a sort never reorders one row against itself', () => {
  assert.equal(compareTimes('08:00', '08:00'), 0);
});
