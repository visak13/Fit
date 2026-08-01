/**
 * THE NUDGE, DRIVEN FROM A CONTROLLED CLOCK — it appears, it never blocks, and it goes away.
 *
 * All three matter and the third is the one that is usually missed. A reminder that appears is easy
 * to test and easy to build; a reminder that DISAPPEARS when the thing is done is what stops it
 * becoming a permanent banner the coach reads past. So every timing claim below is made against an
 * instant this suite chooses, and the disappearance is proved by taking a backup rather than by
 * moving the clock somewhere convenient.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BACKUP_NUDGE_BLOCKS, backupNudge, DUE_AGAIN, NEVER_BACKED_UP, nudgeClearedByBackupAt,
  NUDGE_AFTER_DAYS, NUDGE_AFTER_MS,
} from './nudge.js';

/** The controlled clock: every instant below is derived from this one, never from the host. */
const DAY = 24 * 60 * 60 * 1000;
const TAKEN = Date.parse('2026-06-01T09:00:00.000Z');
const at = (days) => new Date(TAKEN + days * DAY).toISOString();

test('IT NEVER BLOCKS, in every state it has — the ceiling, asserted before anything else', () => {
  const states = [
    backupNudge({ last_backup_at: null, now: at(0) }),
    backupNudge({ last_backup_at: at(0), now: at(1) }),
    backupNudge({ last_backup_at: at(0), now: at(NUDGE_AFTER_DAYS) }),
    backupNudge({ last_backup_at: at(0), now: at(3650) }),
    backupNudge({ last_backup_at: null, holds_records: false, now: at(9999) }),
  ];

  for (const state of states) {
    assert.equal(state.blocks, false, 'a backup reminder may never stand between him and a session');
  }
  assert.equal(BACKUP_NUDGE_BLOCKS, false);

  // A YEAR OVERDUE IS STILL NOT A BLOCK, and that is deliberate rather than an oversight: the
  // application is a supporting role, and the worst thing this feature could do is refuse to open on
  // the morning of a session it was trying to protect.
  const veryLate = backupNudge({ last_backup_at: at(0), now: at(3650) });
  assert.equal(veryLate.due, true);
  assert.equal(veryLate.blocks, false);
});

test('IT APPEARS once a month has passed, and NOT ONE DAY BEFORE', () => {
  const dayBefore = backupNudge({ last_backup_at: at(0), now: new Date(TAKEN + NUDGE_AFTER_MS - 1).toISOString() });
  assert.equal(dayBefore.due, false, 'a month means a month; nagging early is how a reminder becomes noise');
  assert.equal(dayBefore.words, null);

  const onTheDay = backupNudge({ last_backup_at: at(0), now: new Date(TAKEN + NUDGE_AFTER_MS).toISOString() });
  assert.equal(onTheDay.due, true);
  assert.equal(onTheDay.reason, 'stale');
  assert.equal(onTheDay.words, DUE_AGAIN);
  assert.equal(onTheDay.days_since, NUDGE_AFTER_DAYS);
});

test('IT DISAPPEARS THE MOMENT A BACKUP IS TAKEN — proved by taking one, not by moving the clock', () => {
  const now = at(45);

  const before = backupNudge({ last_backup_at: at(0), now });
  assert.equal(before.due, true, 'the fixture must actually be overdue, or the disappearance is free');

  // The ONLY thing that changes is that a backup was taken. The instant is the same instant.
  const after = backupNudge({ last_backup_at: now, now });
  assert.equal(after.due, false);
  assert.equal(after.words, null);
  assert.equal(after.days_since, 0);

  assert.equal(nudgeClearedByBackupAt({ now }), true);
});

test('A DEVICE HE HAS JUST INSTALLED IS NOT NAGGED, because there is nothing on it to lose', () => {
  const brandNew = backupNudge({ last_backup_at: null, holds_records: false, now: at(0) });
  assert.equal(brandNew.due, false);

  // The discriminator in the LOOSENING direction: once there IS something, it speaks. A guard that
  // stayed silent whatever the state would pass the assertion above and be worth nothing.
  const withRecords = backupNudge({ last_backup_at: null, holds_records: true, now: at(0) });
  assert.equal(withRecords.due, true);
  assert.equal(withRecords.reason, 'never');
  assert.equal(withRecords.words, NEVER_BACKED_UP);
  assert.equal(withRecords.days_since, null, 'never is a different sentence, not a large number');
});

test('NEVER AND STALE ARE DIFFERENT SENTENCES, because they are different situations', () => {
  const never = backupNudge({ last_backup_at: null, now: at(0) });
  const stale = backupNudge({ last_backup_at: at(0), now: at(60) });

  assert.notEqual(never.words, stale.words);
  assert.match(never.words, /not saved a copy/);
  assert.match(stale.words, /over a month old/);
});

test('a clock that moved backwards is not treated as a backup that never aged', () => {
  // A last-backup time in the future is a device whose clock changed, and nagging him for that would
  // be the application blaming him for his phone.
  const fromTheFuture = backupNudge({ last_backup_at: at(10), now: at(0) });
  assert.equal(fromTheFuture.due, false);
});

test('an unreadable instant is refused rather than silently read as the beginning of time', () => {
  assert.throws(() => backupNudge({ last_backup_at: 'last Tuesday', now: at(0) }), TypeError);
  assert.throws(() => backupNudge({ last_backup_at: at(0), now: 'soon' }), TypeError);
});

test('NO EMOJI in anything it says', () => {
  for (const words of [NEVER_BACKED_UP, DUE_AGAIN]) {
    assert.equal(words.match(/\p{Extended_Pictographic}/gu), null);
  }
});
