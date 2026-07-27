/**
 * THE REASON, AND THE FACT THAT THERE IS ALWAYS A SPECIFIC ONE.
 *
 * Two claims are under test here and they are the two the requirement names. First, that the five
 * distinguishable causes stay distinguished — a missing credential, an expired one, no network, a
 * refused entry, and never having synchronised at all. Second, that an expired credential is reported
 * as a condition of the WHOLE QUEUE rather than as a property of some entries, which is the correction
 * the outbox had to make and which this surface would otherwise undo by counting.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REASON, REASONS, REASON_PRECEDENCE, REASON_VALUES, deriveReasons, describeUnreadable,
  reasonForFailure,
} from './reasons.js';

/** Codes only, in the order the surface would show them. */
const codes = (figures) => deriveReasons(figures).map((r) => r.code);

test('NEVER SYNCHRONISED is its own reason and says nothing at all is in the backup', () => {
  const [first] = deriveReasons({ never_synchronised: true });
  assert.equal(first.code, REASON.NEVER_SYNCHRONISED);
  assert.match(first.message, /never backed up/i);
  assert.equal(first.queue_wide, true);
});

test('A MISSING credential and an EXPIRED one are different sentences, and never both at once', () => {
  assert.deepEqual(
    codes({ credential: { present: false } }),
    [REASON.CREDENTIAL_MISSING],
  );
  assert.deepEqual(
    codes({ credential: { present: true, expired: true } }),
    [REASON.CREDENTIAL_EXPIRED],
  );

  // Never connected AND entries held on a credential: showing both would hand the coach a
  // contradiction to resolve. The stronger, truer statement wins.
  const both = codes({ credential: { present: false }, waiting_for_credential: 4 });
  assert.deepEqual(both, [REASON.CREDENTIAL_MISSING]);
});

test('AN EXPIRED CREDENTIAL IS A QUEUE-WIDE STOP, not a count of individually stuck entries', () => {
  // This is the correction the outbox made and it binds here: modelling it per-entry reports a
  // handful of stuck items when the truth is that NOTHING can go anywhere, and the coach reads a
  // stopped queue as a small problem.
  const [reason] = deriveReasons({ waiting_for_credential: 3 });
  assert.equal(reason.code, REASON.CREDENTIAL_EXPIRED);
  assert.equal(reason.queue_wide, true, 'the whole queue is stopped, not three entries');
  assert.doesNotMatch(reason.message, /\d/, 'the sentence must not quote a per-entry count');
  assert.match(reason.message, /nothing can be backed up/i);
  assert.equal(reason.action, 'reconnect_google', 'it is the one condition with a tap attached');
});

test('the hold alone is evidence — no synchronisation need have been attempted this session', () => {
  assert.deepEqual(codes({ waiting_for_credential: 1 }), [REASON.CREDENTIAL_EXPIRED]);
});

test('NO NETWORK is distinguished from a refusal, in both directions', () => {
  assert.equal(reasonForFailure({ code: 'unavailable', retryable: true }), REASON.NO_NETWORK);
  assert.equal(reasonForFailure({ code: 'invalid_request', retryable: false }), REASON.ENTRY_REJECTED);

  // Treating an unreachable service as a rejection tells the coach his backup was REFUSED when the
  // wifi merely dropped; treating a refusal as transient retries it forever in silence.
  assert.notEqual(
    reasonForFailure({ code: 'unavailable', retryable: true }),
    reasonForFailure({ code: 'invalid_request', retryable: false }),
  );
});

test('a timeout is an UNKNOWN OUTCOME, which is neither of those two', () => {
  assert.equal(reasonForFailure({ code: 'timeout', retryable: true }), REASON.OUTCOME_UNKNOWN);
});

test('classification reads the DECLARED fields, so a reworded message cannot change it', () => {
  // The port declares `retryable` and `needsReauth` for exactly this purpose, and the report carries
  // them through. Matching on text would break silently the first time a message was reworded.
  assert.equal(reasonForFailure({ code: 'anything_at_all', needs_reauth: true }), REASON.CREDENTIAL_EXPIRED);
  assert.equal(reasonForFailure({ code: 'never_seen_before', retryable: true }), REASON.NO_NETWORK);
  assert.equal(reasonForFailure({ code: 'never_seen_before', retryable: false }), REASON.ENTRY_REJECTED);
});

test('a failure that is not the service at all is a LOCAL failure, and is not swallowed', () => {
  assert.equal(reasonForFailure({}), REASON.LOCAL_FAILURE);
  assert.equal(reasonForFailure(null), REASON.LOCAL_FAILURE);
  const [reason] = deriveReasons({ failures: [{ code: 'db_write_failed' }] });
  assert.equal(reason.code, REASON.LOCAL_FAILURE);
  assert.match(reason.message, /inside the app/i);
});

test('A REJECTED ENTRY is reported, and is NOT a queue-wide condition', () => {
  const [reason] = deriveReasons({ rejected: 2 });
  assert.equal(reason.code, REASON.ENTRY_REJECTED);
  assert.equal(reason.queue_wide, false, 'these entries are stopped; the rest of the queue still moves');
  assert.equal(reason.action, 'review_refused', 'nothing will move them but a person');
});

test('an ambiguous entry is its own reason: it cannot be said whether it landed', () => {
  const [reason] = deriveReasons({ ambiguous: 1 });
  assert.equal(reason.code, REASON.OUTCOME_UNKNOWN);
  assert.match(reason.message, /cannot be said|not confirmed/i);
});

test('EVERY reason is reported, worst first — a refusal is not hidden behind a dropped connection', () => {
  const all = codes({
    never_synchronised: true,
    waiting_for_credential: 2,
    rejected: 1,
    ambiguous: 1,
    failures: [{ code: 'unavailable', retryable: true }],
  });

  assert.deepEqual(all, [
    REASON.NEVER_SYNCHRONISED,
    REASON.ENTRY_REJECTED,
    REASON.OUTCOME_UNKNOWN,
    REASON.CREDENTIAL_EXPIRED,
    REASON.NO_NETWORK,
  ]);
  assert.ok(all.includes(REASON.ENTRY_REJECTED), 'the one that never resolves by itself must survive the collapse');
});

test('FILES SKIPPED because they could not be read is its own reason, and it carries the count', () => {
  const [reason] = deriveReasons({ skipped_unreadable: { count: 4, newer_version: 4 } });
  assert.equal(reason.code, REASON.BACKUP_PARTLY_UNREADABLE);

  // The count is in the WORDS, not merely in a field beside them. "Some files could not be read" is
  // the sentence a busy person skims past; four is not some.
  assert.match(reason.message, /\b4 files\b/);
  assert.match(reason.message, /newer version of this app/i, 'and it says why, in his terms');
  assert.equal(reason.action, null,
    'there is no tap in this application that resolves it, and offering one that does not help is '
    + 'how an indicator earns the reputation of lying');
  assert.equal(reason.queue_wide, false,
    'his own work is still being sent — this is about what did not come the other way');
});

test('it says a NEWER VERSION only when a newer version is what happened', () => {
  // Every other way a document can be unreadable — corrupt, not a document, written by an OLDER
  // build — means something else, and a confident sentence about the wrong thing is still a lie.
  const corrupt = deriveReasons({ skipped_unreadable: { count: 2, newer_version: 0 } })[0];
  assert.match(corrupt.message, /\b2 files\b/, 'it still names how many');
  assert.doesNotMatch(corrupt.message, /newer version/i);

  const mixed = deriveReasons({ skipped_unreadable: { count: 3, newer_version: 1 } })[0];
  assert.match(mixed.message, /\b3 files\b/);
  assert.match(mixed.message, /newer version/i, 'one of them was, so he is told so');
});

test('one file reads as one file, and zero files is not a reason at all', () => {
  const [one] = deriveReasons({ skipped_unreadable: { count: 1, newer_version: 1 } });
  assert.match(one.message, /\b1 file\b/);
  assert.doesNotMatch(one.message, /1 files/, 'a count in a sentence has to read as a sentence');

  assert.deepEqual(deriveReasons({ skipped_unreadable: { count: 0, newer_version: 0 } }), []);
  assert.deepEqual(deriveReasons({ skipped_unreadable: null }), []);
  assert.deepEqual(deriveReasons({}), [], 'and a caller that never had the figure says nothing');
});

test('the counted sentence and the figure-less one come from ONE writer, so they cannot drift', () => {
  // The static entry IS this function called with nothing to hand. If someone reworded one of them
  // the coach would be reading two different accounts of the same condition depending on which
  // caller reached him first.
  assert.equal(REASONS[REASON.BACKUP_PARTLY_UNREADABLE].message, describeUnreadable());
  assert.notEqual(describeUnreadable({ count: 4 }), describeUnreadable(),
    'and the counted form is genuinely different, so this is not passing by both being empty');
});

test('SKIPPED FILES rank with NEVER SYNCHRONISED, because both mean the backup is not what he thinks', () => {
  const skipped = REASON_PRECEDENCE.indexOf(REASON.BACKUP_PARTLY_UNREADABLE);
  const never = REASON_PRECEDENCE.indexOf(REASON.NEVER_SYNCHRONISED);
  assert.equal(skipped, never + 1, 'immediately below it — adjacent, and in that order');

  // Below never_synchronised because nothing at all in the backup is strictly worse than some of the
  // other device's work missing from it. Above everything else because a queue that is merely
  // stopped has still not told him something untrue.
  for (const code of [REASON.ENTRY_REJECTED, REASON.OUTCOME_UNKNOWN, REASON.LOCAL_FAILURE,
    REASON.CREDENTIAL_MISSING, REASON.CREDENTIAL_EXPIRED, REASON.NO_NETWORK]) {
    assert.ok(skipped < REASON_PRECEDENCE.indexOf(code), `it outranks ${code}`);
  }

  const [first] = deriveReasons({
    never_synchronised: true, skipped_unreadable: { count: 9, newer_version: 9 },
  });
  assert.equal(first.code, REASON.NEVER_SYNCHRONISED, 'and the ordering holds when both apply');
});

test('a manufactured last-synced time outranks everything, because it makes the rest suspect', () => {
  const [first] = deriveReasons({ unverifiable_sync_claim: true, never_synchronised: true, rejected: 5 });
  assert.equal(first.code, REASON.UNVERIFIABLE_SYNC_CLAIM);
  assert.equal(REASON_PRECEDENCE[0], REASON.UNVERIFIABLE_SYNC_CLAIM);
});

test('THERE IS NO IN-PROGRESS REASON CODE — a caller cannot render "wait and see" as the answer', () => {
  // The rule is that an indeterminate state may never be the ONLY thing a caller can see. This is the
  // structural half of it: there is no value this module can return that means "a synchronisation is
  // happening, check back". The surface carries `in_progress` beside the figures instead.
  for (const code of REASON_VALUES) {
    assert.doesNotMatch(code, /progress|pending|working|wait|spinner|syncing/i, `"${code}" reads as indeterminate`);
  }
});

test('a healthy installation has no reasons at all', () => {
  assert.deepEqual(deriveReasons({ never_synchronised: false }), []);
  assert.deepEqual(deriveReasons({}), []);
  assert.deepEqual(deriveReasons(undefined), []);
});

test('every reason carries plain words, and an action only where one would help', () => {
  for (const code of REASON_VALUES) {
    const reason = REASONS[code];
    assert.ok(reason, `${code} has no entry`);
    assert.ok(reason.message.length > 20, `${code} needs a sentence, not a label`);
    assert.doesNotMatch(reason.message, /error|failed to|exception|null|undefined/i,
      `${code} must read as plain words to a coach, not as a developer's message`);
    assert.equal(typeof reason.queue_wide, 'boolean');
    assert.ok(reason.action === null || typeof reason.action === 'string');
  }
});

test('the derived reasons are frozen, so a screen cannot edit the words on their way through', () => {
  const [reason] = deriveReasons({ never_synchronised: true });
  assert.throws(() => { reason.message = 'everything is fine'; }, TypeError);
});
