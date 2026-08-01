/**
 * ATTENDANCE AND CONSISTENCY — counted from her own sessions, described without a verdict, and
 * measured without a clock.
 *
 * The last of those is the one worth stating: a report is a document. "Last trained 3 days ago"
 * rewrites itself into a reproach the week after it is sent, so every interval here is between two
 * instants that are in the data.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CADENCE_NEEDS, UNEVEN_MULTIPLE, countByMonth, daysBetween, intervalsBetween, middleOf,
  projectAttendance,
} from './attendance.js';
import { narrowToClient } from './participation.js';
import { HER, theSessions } from './testing.js';

const hers = () => narrowToClient(HER.id, { sessions: theSessions() }).sessions;

test('a shared session counts as ONE session, and nothing says who else was on it', () => {
  const attendance = projectAttendance(hers());

  assert.equal(attendance.attended, 4);
  assert.equal(attendance.completed, 3);
  assert.equal(attendance.cut_short, 1, 'the interrupted one is still a session that happened');
  assert.equal(attendance.upcoming, 1);

  // There is no field here that could carry a roster, a headcount or a plural.
  assert.deepEqual(
    Object.keys(attendance).filter((key) => ['client', 'roster', 'shared', 'attendee', 'people', 'others']
      .some((word) => key.includes(word))),
    [],
  );
});

test('the span and the months come from the data, never from today', () => {
  const attendance = projectAttendance(hers());

  assert.equal(attendance.first_at, '2026-03-02T09:00:00.000Z');
  assert.equal(attendance.latest_at, '2026-04-13T09:00:00.000Z');
  assert.equal(attendance.span_days, 42);
  assert.deepEqual(attendance.by_month, [
    { month: '2026-03', count: 3 },
    { month: '2026-04', count: 1 },
  ]);
  assert.equal(attendance.months_with_a_session, 2);
});

test('an even fortnight reads as steady', () => {
  const attendance = projectAttendance(hers());

  assert.equal(attendance.typical_days_between, 14);
  assert.equal(attendance.longest_gap_days, 14);
  assert.equal(attendance.cadence, 'steady');
});

test('a long break makes the cadence UNEVEN, and the typical interval still describes the rest', () => {
  const attendance = projectAttendance([
    { at: '2026-03-02T09:00:00.000Z', status: 'completed', attended: true },
    { at: '2026-03-09T09:00:00.000Z', status: 'completed', attended: true },
    { at: '2026-03-16T09:00:00.000Z', status: 'completed', attended: true },
    { at: '2026-06-01T09:00:00.000Z', status: 'completed', attended: true },
  ]);

  assert.equal(attendance.typical_days_between, 7, 'the middle interval, not the average');
  assert.equal(attendance.longest_gap_days, 77);
  assert.equal(attendance.cadence, 'uneven');
  assert.ok(attendance.longest_gap_days > attendance.typical_days_between * UNEVEN_MULTIPLE);
});

test('TWO SESSIONS DESCRIBE NO PATTERN, and the report says so instead of inventing one', () => {
  const attendance = projectAttendance([
    { at: '2026-03-02T09:00:00.000Z', status: 'completed', attended: true },
    { at: '2026-03-16T09:00:00.000Z', status: 'completed', attended: true },
  ]);

  assert.equal(attendance.attended, 2);
  assert.ok(attendance.attended < CADENCE_NEEDS);
  assert.equal(attendance.cadence, 'too_early_to_say');
});

test('a client with nothing yet gets zeroes and nulls, never a divide by nothing', () => {
  const attendance = projectAttendance([]);

  assert.equal(attendance.attended, 0);
  assert.equal(attendance.first_at, null);
  assert.equal(attendance.span_days, null);
  assert.equal(attendance.typical_days_between, null);
  assert.equal(attendance.longest_gap_days, null);
  assert.equal(attendance.cadence, 'too_early_to_say');
  assert.deepEqual(attendance.by_month, []);
});

test('the middle value is the MIDDLE, not the average', () => {
  assert.equal(middleOf([7, 7, 7, 77]), 7);
  assert.equal(middleOf([1, 2, 3]), 2);
  assert.equal(middleOf([]), null);
});

test('an unreadable instant is left out rather than guessed at', () => {
  assert.equal(daysBetween('not a date', '2026-03-02T09:00:00.000Z'), null);
  assert.deepEqual(intervalsBetween(['2026-03-02T09:00:00.000Z', 'nonsense', '2026-03-16T09:00:00.000Z']), []);
  assert.deepEqual(countByMonth(['bad']), []);
});

test('THE PROJECTION RUNS WITH THE CLOCK TAKEN AWAY', () => {
  const realNow = Date.now;
  const trip = () => { throw new Error('the attendance projection reached for the clock'); };

  try {
    Date.now = trip;
    assert.throws(() => Date.now(), /reached for the clock/, 'the trap is armed');

    const attendance = projectAttendance(hers());
    assert.equal(attendance.attended, 4, 'and it produced the whole thing anyway');
  } finally {
    Date.now = realNow;
  }

  assert.equal(typeof Date.now(), 'number', 'the clock is put back where it was found');
});
