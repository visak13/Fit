/**
 * THE SYNCHRONISATION SEAM AFTER A READ THAT FAILED — the one failed read that reaches a
 * DESTRUCTIVE gate.
 *
 * ## Why this seam is different in kind from the five siblings
 *
 * For the calendar and the pending-removal seams, the reading feeds WORDS, so the three-outcome
 * union STOPS AT THE WORDS MODULE: the worst a failed read can do is say something false. Here the
 * SAME reading is also handed on as `AccountActions.figures` and passed into
 * `backup.eraseThisDevice(store, reading, acknowledged)`, and `platform/google-account.ts` reads
 * `pending`, `rejected`, `ambiguous` and `oldest_undelivered_age_ms` off it to decide whether
 * erasing this device is safe. In the empty reading all four are 0/null. SO A FAILED READ HANDS A
 * DESTRUCTIVE GATE AN EMPTY QUEUE IT NEVER COUNTED, and the failure mode is A DELETION TAKEN ON A
 * FALSE PREMISE — which, unlike a wrong sentence, is not recoverable.
 *
 * ## What was wrong, measured rather than reasoned
 *
 * `readSyncReading` had NO try and NO catch — zero occurrences of `catch` in `sync-runner.ts`. So a
 * rejecting `accountabilityStatus()` did not fall into a swallowed catch the way the two sibling
 * seams did; it ESCAPED `SyncFromStore`'s `refresh()`, which every caller invokes as
 * `void engine.refresh()`. That is an UNHANDLED REJECTION rather than a swallowed error. `setRead`
 * never ran, the `useMemo` fell back to `NO_BACKUP_YET`, and the seam then stood at:
 *
 *     level not_backed_up, "Some changes are saved on this device but not backed up yet."
 *     reason never_synchronised, "This device has never backed up. Nothing here is in your Google
 *     Drive yet."
 *
 * — a real condition worded as a fact, over a device whose queue nobody had looked at. And the same
 * value, with its four zeroes, was what the erase gate read.
 *
 * ## THE TWO THINGS THIS FILE EXISTS TO HOLD TRUE
 *
 *  1. THE ERASE GATE REFUSES ON AN UNKNOWN READING. Zeroes produced by a read that THREW are never
 *     a safe-to-erase signal. *Do not destroy what you did not count.*
 *  2. A FAILED READ MAY NOT PAINT `never_synchronised`.
 *
 * ## HOW IT IS PROVEN: BY BREAKING IT
 *
 * `accountabilityStatus()` is made to REJECT over a REAL store holding REAL outstanding work, the
 * erase is then ATTEMPTED through the real mechanism, and the gate is shown REFUSING — with the
 * erasure port watched, so "refused" is read from the DELETION NOT HAPPENING and not from a return
 * value alone. Every absence-shaped assertion is pointed at a known presence in the same run.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { REASON, REASONS } from '../../core/status/reasons.js';
import { aDevice, queueOne } from '../../core/status/testing.js';
import { openLocalStore } from '../../core/store/store.js';
import { createLaptop } from '../../core/store/testing/platform-double.js';
import { GoogleConnection } from '../platform/google-identity.ts';
import {
  EraseAcknowledgement, eraseReadiness, signOutAndEraseThisDevice,
} from '../platform/google-account.ts';
import type { DeviceErasure } from '../platform/google-account.ts';
import { describeEraseConfirmation } from '../screens/admin-report.ts';
import { painted } from '../proof/painted.ts';
import { readSyncReading } from './sync-runner.ts';
import {
  COULD_NOT_READ_THE_BACKUP_STATUS, NO_BACKUP_YET, SYNC_READ_STAGE_WORDS,
  describeFailedSyncRead,
} from './sync-indicator.ts';
import type { SyncSeamReading } from './sync-indicator.ts';
import { SyncIndicator, SyncStatusProvider } from './SyncStatus.tsx';

/** Stores opened by this file, closed once at the end whatever happened. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const opened: any[] = [];

after(async () => {
  for (const store of opened) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await store.close();
    } catch {
      // An erase test closes its own store on the way past. Closing twice is not a finding.
    }
  }
});

/** Names invented and deliberately unmistakable: no real person appears anywhere in this tree. */
const A_PERSON = 'Test Person Backup Status';

/**
 * THE SAME PLANT WITH NO SPACES IN IT, AND IT IS A DIFFERENT PROBE ENTIRELY.
 *
 * MEASURED in review (s11/r5): the fence has TWO layers — the prototype read, and the
 * identifier-shaped character walk behind it — and {@link A_PERSON} only ever exercises the SECOND.
 * With `Object.getPrototypeOf` replaced by a bare `error`, a plant carrying spaces still comes back
 * as `unknown`, because the character walk rejects a name with a space in it whatever it was read
 * off. So the leak assertion below stayed GREEN over a broken prototype read: it was proving the
 * character walk and reporting it as proof of the prototype read.
 *
 * A single-word plant is what discriminates them. Same file, same break: this one came back as
 * `Rutherford` — the planted string reaching the published failure, which is the s17/r3 leak itself.
 * A surname is exactly the shape a client record carries, so this is not a contrived worst case; it
 * is the ordinary one, and it was the one nobody was testing.
 */
const A_PERSON_IN_ONE_WORD = 'Rutherford';

/** The sentence a failed read used to paint, from the core rather than transcribed. */
const NEVER_SYNCHRONISED_SENTENCE = REASONS[REASON.NEVER_SYNCHRONISED].message;

/**
 * A REAL device with REAL work that has not been backed up.
 *
 * The device and the queue are the CORE'S OWN harness — `queueOne` goes through `queueBackup` onto
 * the real outbox — rather than a store with a record written to it. MEASURED, not assumed: a bare
 * `putRecord` leaves `accountabilityStatus().pending` at NOUGHT, so a fixture built that way would
 * have made every claim below about a wrong zero worthless while looking like it proved something.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aDeviceWithWorkOutstanding(): Promise<any> {
  const dev = await aDevice();
  opened.push(dev.store);
  await queueOne(dev, { label: 'a backup of the exercise library' });
  return dev.store;
}

/**
 * THE SAME REAL STORE, REFUSING TO READ — and the refusal is at the store's own door.
 *
 * Not a hand-built double: everything above the refusal is the production path.
 * `accountabilityStatus` reaches the outbox and the meta row through `store.read`, so this makes
 * THE REAL READ THROW rather than substituting something that resembles it. What is ON the store is
 * untouched, which is what the aftermath test reads back.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function refusingToRead(store: any, thrown: unknown = new Error('the database closed underneath us')) {
  return new Proxy(store, {
    get(target, property, receiver) {
      if (property === 'read') return async () => { throw thrown; };
      return Reflect.get(target, property, receiver) as unknown;
    },
  });
}

/** One run of the real read, exactly as `SyncFromStore` runs it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readOnce(store: any): Promise<SyncSeamReading> {
  return readSyncReading(store, {
    inProgress: false,
    lastAttempt: null,
    credential: { present: true, expired: false },
  });
}

/** An erasure that records what it was asked to do rather than doing it. */
function watchedErasure(): DeviceErasure & { deleted: number; cleared: number } {
  const record = {
    deleted: 0,
    cleared: 0,
    async deleteLocalDatabase(): Promise<void> { record.deleted += 1; },
    clearSmallFacts(): void { record.cleared += 1; },
  };
  return record;
}

/** A connection with nothing remembered. The refusal happens before it is ever reached. */
function aConnection(): GoogleConnection {
  const held = new Map<string, string>();
  return new GoogleConnection({
    identity: () => null,
    clientId: () => 'a-client-id.apps.googleusercontent.com',
    storage: {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => { held.set(key, value); },
      removeItem: (key: string) => { held.delete(key); },
    },
  });
}

/**
 * THE PAINTED WORDS: the indicator's markup with every tag removed, which is what he reads.
 *
 * The stripping is `proof/painted.ts`'s and NOT a second copy of it — corrected in review (s11/r5).
 * This file had rebuilt it, and the rebuild had already drifted: it unescaped BEFORE stripping tags
 * and knew nothing of `&lt;`, `&gt;` or `&#x2F;`, which is the order and the set the shared one is
 * careful about. A painted-words fence that exists twice is one that gets fixed once.
 */
function paintedWords(reading: SyncSeamReading): string {
  return painted(renderToStaticMarkup(
    createElement(SyncStatusProvider, {
      reading,
      children: createElement(SyncIndicator),
    }),
  )).trim();
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the accountability read publishes what happened, including when it threw', () => {
  it('publishes the reading it read, over a queue that is really there', async () => {
    const outcome = await readOnce(await aDeviceWithWorkOutstanding());

    assert.equal(outcome.status, 'read', 'a healthy read did not report itself as a read');
    assert.ok(outcome.status === 'read');
    // NON-VACUITY FOR THE WHOLE FILE. Every claim below that a zero is wrong is worthless if the
    // real read over this store returns zero as well.
    assert.ok(
      outcome.pending > 0,
      'the outstanding work did not reach the reading, so every zero this file objects to would be '
        + 'the truth and no assertion here would be about anything',
    );
  });

  /**
   * THE DEFECT ITSELF. `readSyncReading` had no catch, so this call REJECTED — and in the
   * application that rejection escaped `void engine.refresh()` as an unhandled rejection, leaving
   * the seam at its empty literal.
   */
  it('publishes a FAILURE when the real read throws, rather than rejecting into nothing', async () => {
    const outcome = await readOnce(refusingToRead(await aDeviceWithWorkOutstanding()));

    assert.equal(
      outcome.status,
      'failed',
      'the read did not say it had failed. Rejecting instead leaves the seam at NO_BACKUP_YET — '
        + 'which is worded as "' + NEVER_SYNCHRONISED_SENTENCE + '" and whose four zeroes are what '
        + 'the erase gate reads.',
    );
    assert.ok(outcome.status === 'failed');
    assert.ok(
      !('pending' in outcome),
      'the failure carries delivery figures. There is nothing to count after a read that looked at '
        + 'nothing, and a shape offering zeroes here is the shape that authorises the deletion.',
    );
  });

  it('names the thrown value by its CLASS and never by its message', async () => {
    const outcome = await readOnce(refusingToRead(
      await aDeviceWithWorkOutstanding(),
      new TypeError(`the store choked on ${A_PERSON}`),
    ));
    assert.ok(outcome.status === 'failed');

    assert.equal(outcome.failure.errorName, 'TypeError', 'the CLASS of the failure is what is carried');
    assert.equal(
      JSON.stringify(outcome.failure).includes(A_PERSON),
      false,
      'the exception MESSAGE reached the failure. A store error can quote the row it choked on, and '
        + "in this application a row carries a client's name.",
    );
  });

  /**
   * The fence's prototype read, exercised through THE PRODUCTION PATH rather than against
   * `nameOfThrown` directly. `constructor` is an ordinary property lookup and an own property
   * shadows it; s17/r3 measured a planted client name reaching rendered markup through that hole.
   */
  it('cannot be made to publish a name a stored record was carrying', async () => {
    const dataShaped = JSON.parse(`{"constructor":{"name":"${A_PERSON}"}}`) as unknown;
    const outcome = await readOnce(refusingToRead(await aDeviceWithWorkOutstanding(), dataShaped));
    assert.ok(outcome.status === 'failed');

    assert.equal(
      JSON.stringify(outcome.failure).includes(A_PERSON),
      false,
      'a value carrying its OWN constructor.name named itself. That is the leak s17/r3 measured, and '
        + 'the name is about to be drawn on screen.',
    );
    // AND WHAT IT SAYS INSTEAD, so this is not merely an absence: the name comes off the PROTOTYPE,
    // and a parsed object's prototype is `Object.prototype`. The own `constructor` is never read.
    assert.equal(outcome.failure.errorName, 'Object');
  });

  /**
   * THE SAME HOLE, PLANTED WITH A NAME THE CHARACTER WALK WOULD LET THROUGH. See
   * {@link A_PERSON_IN_ONE_WORD} for why the test above does not cover this and this one does.
   */
  it('cannot publish a one-word name either, which is the plant the character walk would pass', async () => {
    const dataShaped = JSON.parse(`{"constructor":{"name":"${A_PERSON_IN_ONE_WORD}"}}`) as unknown;
    const outcome = await readOnce(refusingToRead(await aDeviceWithWorkOutstanding(), dataShaped));
    assert.ok(outcome.status === 'failed');

    assert.equal(
      JSON.stringify(outcome.failure).includes(A_PERSON_IN_ONE_WORD),
      false,
      'a one-word value carrying its OWN constructor.name named itself. This is the assertion that '
        + 'holds the PROTOTYPE READ up: a spaced plant is stopped by the character walk whatever the '
        + 'prototype read does, so only this one fails when that read is removed.',
    );
    assert.equal(outcome.failure.errorName, 'Object');
  });

  /**
   * THE AFTERMATH RULE. The failed state tells the coach nothing on this device was changed by
   * trying, and a sentence about a failure is a separately checkable claim about what it left
   * behind. This is the check.
   */
  it('leaves the queue exactly as it was, which is what the failure sentence claims', async () => {
    const store = await aDeviceWithWorkOutstanding();
    const before = await readOnce(store);
    assert.ok(before.status === 'read' && before.pending > 0, 'the premise: there is a queue to lose');

    const failed = await readOnce(refusingToRead(store));
    assert.ok(failed.status === 'failed', 'the premise: the read really failed');

    const afterwards = await readOnce(store);
    assert.ok(afterwards.status === 'read');
    assert.equal(
      afterwards.pending,
      before.pending,
      'the queue moved across a failed READ. A sentence about a failure that misdescribes what it '
        + 'left behind is worse than no sentence.',
    );
  });
});

describe('THE ERASE GATE REFUSES ON A READING NOBODY COUNTED', () => {
  /**
   * NON-VACUITY FOR EVERY REFUSAL BELOW: the gate CAN say yes. A gate that refused everything would
   * pass every assertion in this section while protecting nothing.
   */
  it('says CLEAR over a reading that was read and is genuinely empty', () => {
    const readAndEmpty = { ...NO_BACKUP_YET, status: 'read' as const };
    const readiness = eraseReadiness(readAndEmpty);

    assert.equal(
      readiness.verdict,
      'clear',
      'the gate refuses even a reading it actually took, so nothing below distinguishes an unknown '
        + 'reading from any other',
    );
  });

  it('refuses a reading that FAILED, and the zeroes it would have read are the same zeroes', () => {
    const failed: SyncSeamReading = {
      status: 'failed',
      failure: { stage: 'accountability', errorName: 'Error' },
    };
    const readiness = eraseReadiness(failed);

    assert.equal(
      readiness.verdict,
      'unknown',
      'a read that THREW was treated as a queue with nothing in it. Zeroes nobody measured are not a '
        + 'safe-to-erase signal.',
    );
    assert.equal(
      readiness.mayProceedWithAcknowledgement,
      false,
      'an unknown reading offered an override. There is nothing to acknowledge: no figure was ever '
        + 'shown to him, so there is nothing he could have agreed to lose.',
    );
    assert.equal(
      EraseAcknowledgement.forReadiness(readiness),
      null,
      'an acknowledgement was minted for a reading that was never taken',
    );
  });

  it('refuses a reading that has not been taken YET, for the same reason', () => {
    assert.equal(
      eraseReadiness(NO_BACKUP_YET).verdict,
      'unknown',
      'the bounded window before the first read landed was treated as a counted, empty queue. Its '
        + 'zeroes are as unmeasured as a failed read\'s.',
    );
  });

  /**
   * THE ASSERTION THE WHOLE ACTION IS FOR — and it is read from the DELETION NOT HAPPENING.
   *
   * The status read is made to throw over a real store holding real outstanding work; the erase is
   * then attempted through the real mechanism, with the acknowledgement forced true, which is the
   * strongest form of the attempt.
   */
  it('ATTEMPTED OVER A FAILED READ, THE ERASE DOES NOT RUN AND NOTHING IS DELETED', async () => {
    const store = await aDeviceWithWorkOutstanding();
    const outcome = await readOnce(refusingToRead(store));
    assert.ok(outcome.status === 'failed', 'the premise: the status read really threw');

    const erasure = watchedErasure();
    const result = await signOutAndEraseThisDevice({
      connection: aConnection(),
      store,
      reading: outcome,
      erasure,
      acknowledgement: EraseAcknowledgement.forReadiness(eraseReadiness(outcome)),
    });

    assert.equal(
      erasure.deleted,
      0,
      'THE DATABASE WAS DELETED ON A READING NOBODY TOOK. This device is the only place unbacked-up '
        + 'work exists, and the gate approved destroying it on four zeroes produced by a read that '
        + 'threw.',
    );
    assert.equal(erasure.cleared, 0, 'and the small facts went with it');
    assert.equal(result.outcome, 'refused', 'the mechanism reported an erase it must not have run');

    const afterwards = await readOnce(store);
    assert.ok(afterwards.status === 'read');
    assert.ok(
      afterwards.pending > 0,
      'the outstanding work is gone from the store the refusal claims to have left alone',
    );
  });

  it('and the coach ticking the box cannot override it', async () => {
    const store = await aDeviceWithWorkOutstanding();
    const outcome = await readOnce(refusingToRead(store));
    assert.ok(outcome.status === 'failed');

    const erasure = watchedErasure();
    // A forged acknowledgement: the strongest thing a caller could hand in. `forReadiness` refuses
    // to mint one here, so this is what a caller who ignored that would be passing.
    const forged = EraseAcknowledgement.forReadiness(
      eraseReadiness({ ...NO_BACKUP_YET, status: 'read' as const, rejected: 1 }),
    );
    assert.ok(forged !== null, 'the premise: this is a real acknowledgement from a calmer reading');

    const result = await signOutAndEraseThisDevice({
      connection: aConnection(),
      store,
      reading: outcome,
      erasure,
      acknowledgement: forged,
    });

    assert.equal(
      erasure.deleted,
      0,
      'an acknowledgement minted from a DIFFERENT, calmer reading carried an unknown one past the '
        + 'gate. That is the erase running on a queue nobody counted, with a tick as its authority.',
    );
    assert.equal(result.outcome, 'refused');
  });

  /**
   * The gate still WORKS. Without this, every refusal above is compatible with a gate that has been
   * broken into refusing everything, and a permanently refusing erase is its own defect.
   */
  it('still erases a device whose reading was TAKEN and is clear', async () => {
    const { platform } = createLaptop();
    const empty = await openLocalStore({ platform, device: 'coach-laptop-empty' });
    opened.push(empty);

    const outcome = await readOnce(empty);
    assert.ok(outcome.status === 'read', 'the premise: this read landed');
    assert.equal(outcome.pending, 0, 'and it landed on an empty queue');

    const erasure = watchedErasure();
    const result = await signOutAndEraseThisDevice({
      connection: aConnection(),
      store: empty,
      reading: outcome,
      erasure,
    });

    assert.equal(result.outcome, 'erased', 'the gate now refuses a device it should let him erase');
    assert.equal(erasure.deleted, 1);
    assert.equal(erasure.cleared, 1);
  });

  it('draws no button for an unknown reading, and its refusal names no count', () => {
    const confirmation = describeEraseConfirmation({
      status: 'failed',
      failure: { stage: 'accountability', errorName: 'Error' },
    });

    assert.equal(confirmation.verdict, 'unknown');
    assert.equal(
      confirmation.confirmLabel,
      null,
      'a button was drawn for an act the gate refuses. A control that cannot do what its words say '
        + 'is worse than no control.',
    );
    assert.equal(confirmation.acknowledgeLabel, null, 'and there is no tick to click past it with');
    assert.ok(confirmation.refusal !== null, 'a bare refusal is a defect: he is told nothing');

    const everySentence = Object.values(confirmation.refusal).join(' ');
    assert.equal(
      /\b\d+ changes?\b/u.test(everySentence),
      false,
      'the refusal quoted a figure. Nothing was counted, so any number here is invented — and this '
        + 'is the panel that names what he would lose.',
    );
    assert.ok(
      everySentence.includes('could not read') || everySentence.includes('has not read'),
      'the one thing this state exists to make sayable is not said',
    );
  });
});

describe('a failed read paints no claim about a backup it has not read', () => {
  it('does NOT say this device has never backed up', () => {
    const words = paintedWords({
      status: 'failed',
      failure: { stage: 'accountability', errorName: 'Error' },
    });

    // NON-VACUITY, FIRST AND IN THE SAME RUN.
    assert.ok(words.length > 40, 'the render produced no indicator at all, so every absence is about nothing');
    assert.ok(
      words.includes(COULD_NOT_READ_THE_BACKUP_STATUS),
      'the failed state drew nothing of its own, so the absences below are an empty indicator rather '
        + 'than an honest one',
    );

    assert.equal(
      words.includes(NEVER_SYNCHRONISED_SENTENCE),
      false,
      'the indicator said "' + NEVER_SYNCHRONISED_SENTENCE + '" on the strength of a read that threw',
    );
    assert.equal(
      words.includes('Nothing backed up yet'),
      false,
      'the headline still reports an empty backup over a queue nobody read',
    );
    assert.equal(
      words.includes('Backed up'),
      false,
      'the indicator reported a backup it did not look at',
    );
  });

  /**
   * THE NON-VACUITY PROBE FOR THE ABOVE, and it is the sharpest one available: the SAME instrument
   * over the not-yet reading MUST find the sentence. If it does not, the scanner is broken and every
   * absence above is an artefact of the scanner rather than a fact about the screen.
   */
  it('and the scanner really can see that sentence, over the reading that legitimately says it', () => {
    const words = paintedWords(NO_BACKUP_YET);
    assert.ok(
      words.includes(NEVER_SYNCHRONISED_SENTENCE),
      'the scanner cannot find the sentence anywhere, so its absence above proves nothing at all',
    );
  });

  it('is not reassuring, and claims nothing about what the failure left behind', () => {
    const report = describeFailedSyncRead({ stage: 'accountability', errorName: 'TypeError' });
    const everySentence = Object.values(report).join(' ');

    assert.equal(report.headline, COULD_NOT_READ_THE_BACKUP_STATUS);
    assert.equal(report.whatFailed, SYNC_READ_STAGE_WORDS.accountability);
    assert.ok(everySentence.includes('could not read'));
    assert.equal(
      /\bbacked up\b(?!\s+(?:yet|status))/u.test(report.headline),
      false,
      'the headline of a state that read nothing still reports on the backup',
    );
    assert.equal(
      everySentence.includes('never backed up'),
      false,
      'the failure report repeats the sentence it exists to replace',
    );
  });

  it('has a sentence for every stage the source can tag, so no failure is drawn as a blank', () => {
    for (const stage of ['accountability'] as const) {
      assert.ok(
        SYNC_READ_STAGE_WORDS[stage].length > 20,
        `the ${stage} stage has no sentence, so a failure there would not say which read failed`,
      );
    }
    const unknown = describeFailedSyncRead({ stage: 'invented', errorName: 'Error' });
    assert.ok(unknown.whatFailed.length > 0, 'an unworded stage drew nothing where a fact belongs');
  });
});
