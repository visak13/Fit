/**
 * THE ADMIN SCREEN'S JUDGEMENTS, ASSERTED WITHOUT A BROWSER.
 *
 * Two things are being defended here and only one of them is the wording.
 *
 * THE FIRST is that every state the device can be in produces a screen. A refusal, a browser with no
 * storage manager at all, a request that threw, and a request that has not come back yet are all
 * ANSWERS about this device — `storage-persistence.ts` is built around exactly that — and an
 * interface that only draws the granted case reports a device state that was never measured.
 *
 * THE SECOND is the dense-screen rule, and it is the one worth having a test for: PROGRESSIVE
 * DISCLOSURE MUST NEVER DISCARD. Every field of the record has to arrive on the screen somewhere,
 * and the fields the coach acts on have to arrive PERMANENTLY. The count test below is the one that
 * catches a later author folding one more thing away because the card was getting long, which is
 * exactly how the rule gets broken — gradually, and with a good reason each time.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PersistenceRecord } from '../platform/storage-persistence.ts';
import { describePersistence, describeStorage } from './admin-report.ts';

const GRANTED: PersistenceRecord = {
  askedAt: '2026-07-25T09:15:00.000Z',
  supported: true,
  alreadyPersisted: false,
  literalAnswer: true,
  literalAnswerType: 'boolean',
  quotaBytes: 64 * 1024 ** 3,
  usageBytes: 3 * 1024 ** 3,
  failure: null,
};

function record(overrides: Partial<PersistenceRecord>): PersistenceRecord {
  return { ...GRANTED, ...overrides };
}

/** Every label the screen puts on screen, permanent and folded together. */
function everyLabel(report: ReturnType<typeof describePersistence>): string[] {
  return [...report.permanent, ...report.folded].map((pair) => pair.label);
}

describe('the state this device is actually in', () => {
  it('names a grant, and says it in words a coach reads rather than in the value', () => {
    const report = describePersistence(GRANTED);
    assert.equal(report.state, 'granted');
    assert.equal(report.tone, 'success');
    assert.match(report.plainWords, /keep the application data on this device/u);
  });

  it('names a refusal WITHOUT drawing it as a fault', () => {
    const report = describePersistence(record({ literalAnswer: false }));
    assert.equal(report.state, 'refused');
    // Not a warning tone: he cannot act on the browser's decision, and the backup path is what
    // actually protects the data. An interface that shouts about this teaches him to ignore it.
    assert.equal(report.tone, 'neutral');
    assert.match(report.plainWords, /backups/u);
  });

  it('names a browser that cannot be asked, and does not present that as a refusal', () => {
    const report = describePersistence(
      record({
        supported: false,
        alreadyPersisted: null,
        literalAnswer: null,
        literalAnswerType: 'undefined',
        failure: 'this browser exposes no storage manager, so persistence cannot be requested',
      }),
    );
    assert.equal(report.state, 'unsupported');
    assert.notEqual(report.state, 'refused');
  });

  it('names a request that threw, and keeps the reason ON the screen rather than folded away', () => {
    const report = describePersistence(
      record({
        literalAnswer: null,
        literalAnswerType: 'undefined',
        failure: 'navigator.storage.persist() did not answer within 10000ms',
      }),
    );
    assert.equal(report.state, 'failed');

    const permanent = report.permanent.map((pair) => pair.value);
    assert.ok(
      permanent.some((value) => value.includes('did not answer within')),
      'the reason a request failed is what changes what he does next, so it cannot be one tap away',
    );
  });

  it('names an answer that is neither true nor false rather than guessing which it meant', () => {
    const report = describePersistence(record({ literalAnswer: null, literalAnswerType: 'object' }));
    assert.equal(report.state, 'unanswered');
  });

  it('has a screen for the moment BEFORE the browser has answered', () => {
    const report = describePersistence(null);
    assert.equal(report.state, 'pending');
    assert.ok(report.permanent.length > 0, 'a pending screen still states where the answer is');
    assert.deepEqual(report.folded, [], 'there is nothing forensic to fold when nothing was said');
  });
});

describe('the literal answer, which is the evidence', () => {
  it('shows it as it would be written, so true and the string "true" stay apart', () => {
    const answered = describePersistence(GRANTED).permanent.find(
      (pair) => pair.label === 'What the browser answered',
    );
    assert.equal(answered?.value, 'true');
    assert.equal(answered?.literal, true, 'a machine value is drawn as one');
  });

  it('keeps it BESIDE the words on every answered state, never behind the disclosure', () => {
    for (const state of [
      GRANTED,
      record({ literalAnswer: false }),
      record({ literalAnswer: null, literalAnswerType: 'undefined', failure: 'it threw' }),
    ]) {
      const report = describePersistence(state);
      assert.ok(
        report.permanent.some((pair) => pair.label === 'What the browser answered'),
        `${report.state} hid the literal answer`,
      );
    }
  });

  it('carries the TYPE of that answer, which is what makes the value evidence', () => {
    const report = describePersistence(record({ literalAnswerType: 'string' }));
    const type = report.folded.find((pair) => pair.label === 'The type of that answer');
    assert.equal(type?.value, 'string');
  });
});

describe('progressive disclosure that discards nothing', () => {
  it('puts every field of the record somewhere on the screen', () => {
    const labels = everyLabel(describePersistence(GRANTED)).join(' | ').toLowerCase();

    // One assertion per field of PersistenceRecord. A field added to the record without a home here
    // is a field the admin screen silently stops reporting.
    assert.match(labels, /answered/u, 'literalAnswer');
    assert.match(labels, /type of that answer/u, 'literalAnswerType');
    assert.match(labels, /already kept/u, 'alreadyPersisted');
    assert.match(labels, /asked at/u, 'askedAt');
    assert.match(labels, /room used/u, 'usageBytes');
    assert.match(labels, /room allowed/u, 'quotaBytes');
  });

  it('folds only the forensic remainder — the permanent part is never empty', () => {
    for (const state of [GRANTED, record({ literalAnswer: false }), null]) {
      const report = describePersistence(state);
      assert.ok(report.permanent.length > 0, `${report.state} left nothing on the screen`);
    }
  });

  it('never folds a failure, in any state that has one', () => {
    for (const state of [
      record({ failure: 'it threw' }),
      record({ supported: false, failure: 'no storage manager' }),
    ]) {
      const report = describePersistence(state);
      assert.ok(
        !report.folded.some((pair) => pair.label === 'What went wrong'),
        'a failure was folded away',
      );
      assert.ok(report.permanent.some((pair) => pair.label === 'What went wrong'));
    }
  });

  it('says nothing went wrong by having no such pair, rather than by saying "none"', () => {
    const labels = everyLabel(describePersistence(GRANTED));
    assert.ok(!labels.includes('What went wrong'));
  });
});

describe('the room this device has', () => {
  it('reads the used figure as a size a person reads', () => {
    assert.equal(describeStorage(GRANTED).used, '3.00 GB');
    assert.match(describeStorage(GRANTED).capacity, /64\.00 GB/u);
  });

  it('admits in words when the browser reported nothing, rather than drawing a blank', () => {
    const reading = describeStorage(record({ usageBytes: null, quotaBytes: null }));
    assert.equal(reading.used, 'Not reported');
    assert.match(reading.capacity, /does not tell the application/u);
  });

  it('still shows what is used when only the total is missing', () => {
    const reading = describeStorage(record({ quotaBytes: null }));
    assert.equal(reading.used, '3.00 GB');
    assert.match(reading.capacity, /does not say how much room it allows/u);
  });

  it('has an answer before the request has settled', () => {
    assert.equal(describeStorage(null).used, 'Not reported');
  });
});
