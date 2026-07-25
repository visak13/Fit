/**
 * ORDINARY UPDATE versus GENUINE DIVERGENCE.
 *
 * The line between them is the whole of this module: sequential use resolves itself, and the case
 * where two devices each wrote revision N is the case where the data cannot say who is right.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createEnvelope, reviseEnvelope, tombstoneEnvelope } from '../model/model.js';
import { aClient } from '../model/fixtures.js';
import { NEVER_RESOLVED_BY_GUESSING, VERDICT, classify, describeDivergence } from './divergence.js';

const T0 = '2026-07-25T09:00:00.000Z';
const T1 = '2026-07-25T10:00:00.000Z';
const T2 = '2026-07-25T11:00:00.000Z';

const base = () => createEnvelope({
  type: 'client', content: aClient(), device: 'coach-laptop', now: T0,
});

describe('sync/divergence — the ordinary case resolves itself', () => {
  it('applies an incoming record there is nothing local for', () => {
    assert.equal(classify(undefined, base()), VERDICT.APPLY);
  });

  it('recognises the same revision by the same device as the same thing', () => {
    const record = base();
    assert.equal(classify(record, { ...record }), VERDICT.SAME);
  });

  it('applies a revision that has seen more history', () => {
    const local = base();
    const incoming = reviseEnvelope(local, { ...aClient(), notes: 'from the phone' },
      { device: 'coach-phone', now: T1 });
    assert.equal(classify(local, incoming), VERDICT.APPLY);
  });

  it('keeps the local revision when it is the one that has seen more', () => {
    const incoming = base();
    const local = reviseEnvelope(incoming, { ...aClient(), notes: 'from the laptop' },
      { device: 'coach-laptop', now: T1 });
    assert.equal(classify(local, incoming), VERDICT.KEEP);
  });

  it('lets an edit made after a delete resurrect the record, because a tombstone is an ordinary revision', () => {
    const local = tombstoneEnvelope(base(), { device: 'coach-laptop', now: T1 });
    const incoming = reviseEnvelope(local, aClient(), { device: 'coach-phone', now: T2 });
    assert.equal(classify(local, incoming), VERDICT.APPLY);
  });
});

describe('sync/divergence — the genuine case is surfaced, never decided', () => {
  it('calls two devices writing the same revision a divergence', () => {
    const start = base();
    const mine = reviseEnvelope(start, { ...aClient(), notes: 'laptop' }, { device: 'coach-laptop', now: T1 });
    const theirs = reviseEnvelope(start, { ...aClient(), notes: 'phone' }, { device: 'coach-phone', now: T2 });

    assert.equal(mine.rev, theirs.rev, 'neither has seen more history than the other');
    assert.equal(classify(mine, theirs), VERDICT.DIVERGED);
  });

  it('does not let a later wall clock quietly decide it', () => {
    const start = base();
    const mine = reviseEnvelope(start, { ...aClient(), notes: 'laptop' }, { device: 'coach-laptop', now: T1 });
    const theirs = reviseEnvelope(start, { ...aClient(), notes: 'phone' }, { device: 'coach-phone', now: T2 });

    // The model's tiebreak WOULD pick one — it exists so both devices pick the same one. Using it
    // here would be a coin toss made on the coach's behalf about his own data.
    assert.equal(classify(mine, theirs), VERDICT.DIVERGED);
    assert.equal(classify(theirs, mine), VERDICT.DIVERGED, 'and it says the same from either side');
  });

  it('shows BOTH sides in full, because a summary cannot be decided and so gets dismissed', () => {
    const start = base();
    const mine = reviseEnvelope(start, { ...aClient(), notes: 'laptop' }, { device: 'coach-laptop', now: T1 });
    const theirs = reviseEnvelope(start, { ...aClient(), notes: 'phone' }, { device: 'coach-phone', now: T2 });

    const description = describeDivergence(mine, theirs);
    assert.equal(description.record_id, mine.record_id);
    assert.deepEqual(description.local, mine);
    assert.deepEqual(description.incoming, theirs);
    assert.equal(description.involves_deletion, false);
    assert.match(description.why, /Both are kept until you choose/);
  });

  it('marks a delete-against-edit clash, which is the one that costs a history', () => {
    const start = base();
    const deleted = tombstoneEnvelope(start, { device: 'coach-laptop', now: T1 });
    const edited = reviseEnvelope(start, { ...aClient(), notes: 'still training' },
      { device: 'coach-phone', now: T2 });

    assert.equal(classify(deleted, edited), VERDICT.DIVERGED);
    const description = describeDivergence(deleted, edited);
    assert.equal(description.involves_deletion, true);
    assert.match(description.why, /deleted on coach-laptop and changed on coach-phone/);
  });

  it('declares that it never resolves one, rather than leaving an absent check', () => {
    assert.equal(NEVER_RESOLVED_BY_GUESSING, true);
  });
});
