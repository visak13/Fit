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

import { PERSISTENT_WARNING_MS } from '../../core/status/status.js';
import type { DeliveryReading, DeliveryReadingOutcome } from '../platform/google-account.ts';
import { WHAT_ERASING_DESTROYS, WHAT_SIGNING_OUT_KEEPS } from '../platform/google-account.ts';
import type { PersistenceRecord } from '../platform/storage-persistence.ts';
import {
  DEVICE_KEY_IS_DESTROYED_BY_ERASING, DEVICE_KEY_SURVIVES_SIGNING_OUT, describeAccountAct,
  describeEraseConfirmation, describePersistence, describeSignOutChoices,
  describeSignOutConfirmation, describeStorage,
} from './admin-report.ts';

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

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE TWO WAYS OUT OF THIS DEVICE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The mechanism is `platform/google-account.ts`'s and has its own suite. What is defended HERE is
 * the thing that was missing rather than wrong: THE WORDS, and specifically the two sentences the
 * coach cannot possibly infer — that the key which opens his medical notes survives a plain
 * sign-out, and is destroyed by an erase. Both acts begin with the same two words; one of them ends
 * his practice on this device. If the difference is not in the sentences he reads, it is nowhere.
 *
 * AND THAT A REFUSAL IS NEVER BARE. "You cannot erase yet" tells him nothing he can act on. What is
 * outstanding, and whether it is still being retried or has stopped for good, lead to OPPOSITE
 * actions — wait, or decide — so both are asserted, on every path that refuses.
 */

/** Nothing queued and nothing stopped: the device that may simply be erased. */
const EVERYTHING_BACKED_UP: DeliveryReadingOutcome = {
  // A reading that was actually TAKEN. The gate refuses anything else, so saying so is what makes
  // every state below a statement about a queue somebody counted.
  status: 'read',
  pending: 0,
  waiting_for_credential: 0,
  rejected: 0,
  ambiguous: 0,
  oldest_undelivered_label: null,
  oldest_undelivered_age_ms: null,
  // Nothing outstanding is exactly the state in which the core shows no reason at all.
  reason: null,
};

function delivery(over: Partial<DeliveryReading> = {}): DeliveryReadingOutcome {
  return { ...EVERYTHING_BACKED_UP, ...over };
}

/** Still being retried, and not yet old enough for the ladder to give up on it. */
const STILL_RETRYING = delivery({
  pending: 3,
  oldest_undelivered_label: 'a session with Test Client Ben',
  oldest_undelivered_age_ms: 4 * 60_000,
});

/** Refused by the service. Nothing will move these but a person. */
const STOPPED_FOR_GOOD = delivery({
  rejected: 2,
  oldest_undelivered_label: 'a diet plan for Test Client Ben',
  oldest_undelivered_age_ms: 30 * 60_000,
});

/**
 * Still being retried, and stuck past the point the ladder stops calling a delay a delay.
 *
 * THE AGE IS READ FROM `PERSISTENT_WARNING_MS` rather than typed as a number of hours. A literal
 * here would be a second opinion about when a delay stops being one, and it would go on passing
 * after the ladder's own threshold moved — the test agreeing with itself about a world that had
 * changed underneath it.
 */
const RETRYING_BUT_STUCK = delivery({
  pending: 1,
  oldest_undelivered_label: 'a session with Test Client Ben',
  oldest_undelivered_age_ms: PERSISTENT_WARNING_MS + 60_000,
});

describe('the words in front of the two acts, which is what he actually decides from', () => {
  it('names what EACH act destroys, and never what it restores', () => {
    const choices = describeSignOutChoices();

    assert.match(choices.plain.whatItDestroys, /Destroys the Google connection on this device/u);
    assert.match(choices.erase.whatItDestroys, /Destroys everything this app has saved on this device/u);

    // The trap this asserts against: a card that describes the safe act by what he KEEPS and the
    // destructive one by what he LOSES reads as two different kinds of statement, and the
    // comparison — which is the whole reason both are on one card — stops being possible.
    for (const choice of [choices.plain, choices.erase]) {
      assert.match(
        choice.whatItDestroys,
        /^Destroys /u,
        `"${choice.label}" is described by something other than what it destroys`,
      );
    }
  });

  it('says the device key SURVIVES a plain sign-out, in the words he reads', () => {
    const confirmation = describeSignOutConfirmation();

    assert.equal(confirmation.deviceKey, DEVICE_KEY_SURVIVES_SIGNING_OUT);
    assert.match(confirmation.deviceKey, /stays here/u);
    assert.match(confirmation.deviceKey, /open your medical notes/u);
    // Its own field and not folded into the sentence above it: `WHAT_SIGNING_OUT_KEEPS` lists the
    // data and does NOT mention the key, which is exactly why this sentence had to exist.
    assert.equal(
      WHAT_SIGNING_OUT_KEEPS.includes('medical notes'),
      false,
      'the mechanism\'s sentence has grown a clause about the key. If it now says this itself, this '
        + 'field is a second copy of one fact and one of the two will drift — fold them into one.',
    );
  });

  it('says the device key IS DESTROYED by an erase, and how to get it back', () => {
    const confirmation = describeEraseConfirmation(EVERYTHING_BACKED_UP);

    assert.equal(confirmation.deviceKey, DEVICE_KEY_IS_DESTROYED_BY_ERASING);
    assert.match(confirmation.deviceKey, /is destroyed/u);
    assert.match(confirmation.deviceKey, /nothing on this device can open a medical note/u);
    // A limitation and its exit in the same breath, in that order.
    assert.match(confirmation.deviceKey, /Signing in again on this device brings the key back/u);
  });

  it('carries the mechanism\'s own two sentences verbatim rather than a friendlier retelling', () => {
    assert.equal(describeSignOutConfirmation().whatWillHappen, WHAT_SIGNING_OUT_KEEPS);
    assert.equal(describeEraseConfirmation(EVERYTHING_BACKED_UP).whatWillHappen, WHAT_ERASING_DESTROYS);
  });

  it('the two device-key sentences DISAGREE, which is the only reason either is worth reading', () => {
    // Both say the same words about the same key and reach opposite conclusions. A pair that had
    // been edited into agreement would be the defect this card exists to prevent, and it would look
    // perfectly reasonable in review.
    assert.match(DEVICE_KEY_SURVIVES_SIGNING_OUT, /does not touch it/u);
    assert.match(DEVICE_KEY_IS_DESTROYED_BY_ERASING, /destroyed with everything else/u);
    assert.notEqual(DEVICE_KEY_SURVIVES_SIGNING_OUT, DEVICE_KEY_IS_DESTROYED_BY_ERASING);
  });
});

describe('the erase gate, as the coach reads it', () => {
  it('lets him erase a device with everything backed up, and says what goes', () => {
    const confirmation = describeEraseConfirmation(EVERYTHING_BACKED_UP);

    assert.equal(confirmation.verdict, 'clear');
    assert.equal(confirmation.refusal, null, 'there is nothing to refuse on a clear device');
    assert.equal(confirmation.acknowledgeLabel, null, 'a clear device needs nothing acknowledged');
    assert.ok(confirmation.confirmLabel !== null, 'and there is a button to press');
    assert.match(confirmation.cannotBeUndone, /cannot be undone/u);
  });

  it('REFUSES while work is still being retried, and offers no way past it', () => {
    const confirmation = describeEraseConfirmation(STILL_RETRYING);

    assert.equal(confirmation.verdict, 'wait');
    assert.equal(
      confirmation.confirmLabel,
      null,
      'a wait has no override: overriding would throw away work that was about to be safe, and the '
        + 'cheap fix costs him nothing',
    );
    assert.equal(confirmation.acknowledgeLabel, null, 'and there is no tick to click past it with');
  });

  it('lets him DECIDE when waiting has stopped being the answer, behind his own tick', () => {
    for (const reading of [STOPPED_FOR_GOOD, RETRYING_BUT_STUCK]) {
      const confirmation = describeEraseConfirmation(reading);

      assert.equal(confirmation.verdict, 'decide');
      assert.ok(confirmation.confirmLabel !== null, 'the exit exists');
      assert.ok(
        confirmation.acknowledgeLabel !== null,
        'and it is behind an acknowledgement he makes himself, not behind a button he can reflex on',
      );
    }
  });

  it('NEVER REFUSES BARELY — every refusal names what is outstanding AND whether it will move', () => {
    for (const reading of [STILL_RETRYING, STOPPED_FOR_GOOD, RETRYING_BUT_STUCK]) {
      const { refusal, verdict } = describeEraseConfirmation(reading);

      assert.ok(refusal !== null, `the ${verdict} case refused without saying why`);
      for (const [field, text] of Object.entries(refusal)) {
        assert.ok(
          text.trim().length > 0,
          `the ${verdict} refusal left "${field}" empty. A refusal he cannot act on is the defect, `
            + 'not the refusal.',
        );
      }
    }
  });

  it('names WHAT is outstanding, by count and by the oldest thing at risk', () => {
    const refusal = describeEraseConfirmation(STILL_RETRYING).refusal;

    assert.match(refusal?.whatIsOutstanding ?? '', /3 changes/u);
    assert.match(refusal?.whatIsOutstanding ?? '', /a session with Test Client Ben/u);
    assert.match(refusal?.whatIsOutstanding ?? '', /only place that work exists/u);
  });

  it('says STILL RETRYING when it is still being retried', () => {
    const refusal = describeEraseConfirmation(STILL_RETRYING).refusal;

    assert.match(refusal?.stillRetryingOrStopped ?? '', /still being retried/u);
    assert.match(refusal?.stillRetryingOrStopped ?? '', /should go on their own/u);
    assert.equal(
      /stopped for good/u.test(refusal?.stillRetryingOrStopped ?? ''),
      false,
      'work that is still being retried was reported as permanently stopped, which would send him '
        + 'to decide about losing something that was about to arrive',
    );
  });

  it('says PERMANENTLY STOPPED when nothing is retrying it, and does not soften it', () => {
    const refusal = describeEraseConfirmation(STOPPED_FOR_GOOD).refusal;

    assert.match(refusal?.stillRetryingOrStopped ?? '', /stopped for good/u);
    assert.match(refusal?.stillRetryingOrStopped ?? '', /nothing is retrying them/u);
    assert.match(refusal?.stillRetryingOrStopped ?? '', /however long you wait/u);
  });

  it('says BOTH when both are true, rather than picking the reassuring half', () => {
    const refusal = describeEraseConfirmation(
      delivery({
        pending: 2,
        rejected: 1,
        oldest_undelivered_label: 'a session with Test Client Ben',
        oldest_undelivered_age_ms: 20 * 60_000,
      }),
    ).refusal;

    assert.match(refusal?.stillRetryingOrStopped ?? '', /2 changes are still being retried/u);
    assert.match(refusal?.stillRetryingOrStopped ?? '', /1 change has stopped for good/u);
  });

  it('does not call a retry that has been running for days something to wait for', () => {
    // The subtle one. `waiting` is above nought and the retries genuinely are still running, so
    // "still being retried" is TRUE — and on its own it would tell him to wait for something this
    // application has already given up expecting. Both halves, in one sentence.
    const refusal = describeEraseConfirmation(RETRYING_BUT_STUCK).refusal;

    assert.match(refusal?.stillRetryingOrStopped ?? '', /still being retried/u);
    assert.match(refusal?.stillRetryingOrStopped ?? '', /stopped expecting/u);
  });

  it('says "1 change" and never "1 changes", on every path that counts', () => {
    for (const reading of [
      delivery({ pending: 1, oldest_undelivered_age_ms: 60_000 }),
      delivery({ rejected: 1, oldest_undelivered_age_ms: 60_000 }),
      delivery({ ambiguous: 1, oldest_undelivered_age_ms: 60_000 }),
    ]) {
      const refusal = describeEraseConfirmation(reading).refusal;
      const said = `${refusal?.whatIsOutstanding ?? ''} ${refusal?.stillRetryingOrStopped ?? ''}`;
      assert.equal(/1 changes/u.test(said), false, said);
    }
  });
});

describe('what the card says after he has pressed', () => {
  it('reports a sign-out that also reached Google', () => {
    const report = describeAccountAct({ act: 'sign-out', result: 'signed-out', revokedAtGoogle: true });

    assert.equal(report.failed, false);
    assert.match(report.headline, /signed out/u);
    assert.match(report.detail, /told Google to drop its access/u);
    // The reassurance he needs at that moment, and it is the same fact the confirmation promised.
    assert.match(report.detail, /key that opens your medical notes/u);
  });

  it('NEVER CLAIMS a revocation that did not happen, and says where the rest of it went', () => {
    const report = describeAccountAct({ act: 'sign-out', result: 'signed-out', revokedAtGoogle: false });

    assert.equal(
      /told Google to drop its access/u.test(report.detail),
      false,
      'an offline sign-out was reported as a completed revocation. The connection here is gone; the '
        + 'access at Google is not, and saying otherwise is this app reporting what it failed to do.',
    );
    assert.match(report.detail, /could not reach Google/u);
    assert.match(report.detail, /your own Google account settings/u);
  });

  it('says plainly when there was no connection to sign out of', () => {
    const report = describeAccountAct({ act: 'sign-out', result: 'not-connected' });

    assert.equal(report.failed, false);
    assert.match(report.detail, /nothing has changed/u);
  });

  it('tells him to close the window after an erase, because the storage is gone from under it', () => {
    const report = describeAccountAct({ act: 'erase', result: 'erased' });

    assert.match(report.headline, /has been erased/u);
    assert.match(report.detail, /Close this window/u);
    assert.match(report.detail, /Google Drive backup and your other device are\s+untouched/u);
  });

  it('explains a refusal that arrived AFTER he pressed, rather than repeating the panel', () => {
    const report = describeAccountAct({ act: 'erase', result: 'refused', because: 'more-stopped' });

    assert.match(report.detail, /stopped backing up while this was open/u);
    assert.equal(report.failed, false, 'the mechanism protecting him is not a failure');
  });

  it('says nothing was changed when an act failed, which is the state he actually fears', () => {
    for (const act of ['sign-out', 'erase'] as const) {
      const report = describeAccountAct({ act, result: 'failed', verbatim: null });
      assert.equal(report.failed, true);
      assert.match(report.headline, /nothing (on this device )?was (changed|deleted)/u);
    }
  });

  it('keeps whatever the machine said APART from this application\'s words', () => {
    const said = 'Another window or tab still has this app open, so its storage could not be deleted.';
    const report = describeAccountAct({ act: 'erase', result: 'failed', verbatim: said });

    assert.equal(report.verbatim, said);
    assert.equal(
      report.detail.includes(said),
      false,
      'the platform\'s sentence was spliced into this application\'s prose. It is evidence and is '
        + 'drawn as evidence; prose is what gets read aloud.',
    );
  });
});
