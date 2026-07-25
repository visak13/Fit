/**
 * THE LADDER, AND THE FACT THAT IT HAS A CEILING.
 *
 * These are pure derivations over figures, so they are asserted directly rather than through a store.
 * The point of doing it this way is that the four named states in the requirement — never
 * synchronised, healthy, overdue, severely overdue — become four readable assertions rather than four
 * elaborate fixtures, and the ceiling can be proven over EVERY level rather than over the ones a
 * fixture happened to reach.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEVEL, LEVELS, LEVEL_ORDER, MAX_LEVEL, OVERDUE_MS, PERSISTENT_WARNING_MS, SEVERELY_OVERDUE_MS,
  deriveLevel, levelForAge, rankOf, worse,
} from './levels.js';

const HOUR = 60 * 60_000;

/** A healthy installation: everything away, and a real synchronisation put it there. */
const healthy = {
  undelivered: 0, needs_attention: 0, oldest_pending_age_ms: null, never_synchronised: false,
};

test('HEALTHY: nothing outstanding and a real synchronisation behind it is the only up-to-date state', () => {
  assert.equal(deriveLevel(healthy), LEVEL.UP_TO_DATE);
  assert.equal(LEVELS[LEVEL.UP_TO_DATE].rank, 0);
});

test('NEVER SYNCHRONISED is NOT up to date, even with an empty queue', () => {
  // The dangerous reading is that an empty queue means everything is safe. It does not: on a device
  // that has never completed a synchronisation, an empty queue means nothing has been WRITTEN yet,
  // and "everything is backed up" would be the most damaging sentence this surface could produce.
  const level = deriveLevel({ ...healthy, never_synchronised: true });
  assert.equal(level, LEVEL.NOT_BACKED_UP);
  assert.notEqual(level, LEVEL.UP_TO_DATE);
});

test('NEVER SYNCHRONISED still climbs the ladder as its queue ages', () => {
  const base = { undelivered: 4, needs_attention: 0, never_synchronised: true };
  assert.equal(deriveLevel({ ...base, oldest_pending_age_ms: 1 * HOUR }), LEVEL.NOT_BACKED_UP);
  assert.equal(deriveLevel({ ...base, oldest_pending_age_ms: 80 * HOUR }), LEVEL.PERSISTENT_WARNING);
});

test('OVERDUE at six hours, SEVERELY OVERDUE at twenty-four, the persistent warning at seventy-two', () => {
  const pending = (ageMs) => deriveLevel({
    undelivered: 1, needs_attention: 0, oldest_pending_age_ms: ageMs, never_synchronised: false,
  });

  assert.equal(pending(0), LEVEL.NOT_BACKED_UP, 'just queued is not a fault');
  assert.equal(pending(OVERDUE_MS - 1), LEVEL.NOT_BACKED_UP, 'a millisecond short does not escalate');
  assert.equal(pending(OVERDUE_MS), LEVEL.OVERDUE, 'the boundary is inclusive');
  assert.equal(pending(SEVERELY_OVERDUE_MS - 1), LEVEL.OVERDUE);
  assert.equal(pending(SEVERELY_OVERDUE_MS), LEVEL.SEVERELY_OVERDUE);
  assert.equal(pending(PERSISTENT_WARNING_MS - 1), LEVEL.SEVERELY_OVERDUE);
  assert.equal(pending(PERSISTENT_WARNING_MS), LEVEL.PERSISTENT_WARNING);
});

test('and it stops there: a fortnight offline is the same rung as three days', () => {
  const fortnight = deriveLevel({
    undelivered: 900, needs_attention: 12, oldest_pending_age_ms: 14 * 24 * HOUR,
    never_synchronised: true,
  });
  assert.equal(fortnight, MAX_LEVEL);
  assert.equal(MAX_LEVEL, LEVEL.PERSISTENT_WARNING);
  assert.equal(rankOf(fortnight), LEVEL_ORDER.length - 1, 'there is no rung above it');
});

test('NOTHING BLOCKS THE APPLICATION — asserted on every rung, not on a sampled one', () => {
  // The blocking prompt at seventy-two hours was REMOVED, because an application that refuses to
  // open loses the very session it was trying to protect. This is the test that would have to be
  // deleted, in the open, to bring it back.
  for (const name of LEVEL_ORDER) {
    assert.equal(LEVELS[name].blocks, false, `${name} must not block the application`);
  }
  assert.equal(
    LEVEL_ORDER.filter((name) => LEVELS[name].blocks).length, 0,
    'no rung on this ladder blocks, at any age, for any reason',
  );
});

test('the ceiling is the ONLY persistent rung — unmissable, on every screen, and still not a gate', () => {
  const persistent = LEVEL_ORDER.filter((name) => LEVELS[name].persistent);
  assert.deepEqual(persistent, [LEVEL.PERSISTENT_WARNING]);
  assert.equal(LEVELS[LEVEL.PERSISTENT_WARNING].blocks, false);
});

test('a stopped entry floors the level at overdue at once, because time does not heal it', () => {
  // A refused entry is data that will never reach the backup without a person. An age-only ladder
  // would report it as fresh and harmless for its first six hours, which is exactly wrong.
  const justRefused = deriveLevel({
    undelivered: 1, needs_attention: 1, oldest_pending_age_ms: 0, never_synchronised: false,
  });
  assert.equal(justRefused, LEVEL.OVERDUE);

  // And it never DEMOTES an older queue that has already climbed higher.
  const oldAndRefused = deriveLevel({
    undelivered: 5, needs_attention: 1, oldest_pending_age_ms: 100 * HOUR, never_synchronised: false,
  });
  assert.equal(oldAndRefused, LEVEL.PERSISTENT_WARNING);
});

test('a stopped entry escalates even when nothing is pending behind it', () => {
  const level = deriveLevel({
    undelivered: 1, needs_attention: 1, oldest_pending_age_ms: null, never_synchronised: false,
  });
  assert.equal(level, LEVEL.OVERDUE, 'a null pending age must not read as "nothing is wrong"');
});

test('THE LADDER CLIMBS ON EVERYTHING UNDELIVERED, not only on what is still being retried', () => {
  // A refused entry is not waiting for anything, so it has no pending age. Measuring on the pending
  // entries alone would park a four-day-old refusal at `overdue` for ever — data the coach has not
  // backed up since Tuesday, reported as no worse than the moment it was refused.
  const stale = {
    undelivered: 1, needs_attention: 1, oldest_pending_age_ms: null, never_synchronised: false,
  };
  assert.equal(deriveLevel(stale), LEVEL.OVERDUE);
  assert.equal(
    deriveLevel({ ...stale, oldest_undelivered_age_ms: 4 * 24 * HOUR }),
    LEVEL.PERSISTENT_WARNING,
    'the escalation follows the DATA, not the retry',
  );

  // The floor is a floor and not a ceiling: it may only raise a level, never lower one.
  assert.equal(
    deriveLevel({ ...stale, oldest_undelivered_age_ms: 30 * 60_000 }),
    LEVEL.OVERDUE,
    'a fresh refusal is still floored at overdue',
  );
});

test('levelForAge treats an absent age as not-backed-up rather than as up-to-date', () => {
  // The caller reaching this has something undelivered; it merely has no age for it. Defaulting to
  // the healthy rung would be the failure mode where an absence looks like a pass.
  assert.equal(levelForAge(null), LEVEL.NOT_BACKED_UP);
  assert.equal(levelForAge(undefined), LEVEL.NOT_BACKED_UP);
  assert.equal(levelForAge(Number.NaN), LEVEL.NOT_BACKED_UP);
});

test('worse() and rankOf() order the ladder, and an unknown name cannot silently win', () => {
  assert.equal(worse(LEVEL.OVERDUE, LEVEL.UP_TO_DATE), LEVEL.OVERDUE);
  assert.equal(worse(LEVEL.NOT_BACKED_UP, LEVEL.PERSISTENT_WARNING), LEVEL.PERSISTENT_WARNING);
  assert.equal(rankOf('not-a-level'), 0, 'an unknown name sits at the bottom; a status line must not throw');
  assert.equal(worse('not-a-level', LEVEL.OVERDUE), LEVEL.OVERDUE);
});

test('deriveLevel survives being called with nothing at all — a status line that throws is a status line that vanishes', () => {
  assert.equal(deriveLevel(undefined), LEVEL.UP_TO_DATE);
  assert.equal(deriveLevel({}), LEVEL.UP_TO_DATE);
});

test('every rung carries a sentence a person can read', () => {
  for (const name of LEVEL_ORDER) {
    assert.equal(typeof LEVELS[name].summary, 'string');
    assert.ok(LEVELS[name].summary.length > 10, `${name} needs plain words, not a label`);
  }
});
