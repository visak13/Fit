/**
 * THE THREE FAILURES ARE THREE FAILURES.
 *
 * This suite exists because collapsing them is the defect that would be invisible in ordinary use: an
 * application that retries everything forever looks fine against a service that always works.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RemoteCredentialExpired, RemoteError, RemoteFileNotFound, RemoteInvalidRequest, RemoteTimeout,
  RemoteUnavailable,
} from '../remote/remote.js';
import {
  BACKOFF_BASE_MS, BACKOFF_CAP_MS, FAILURE, backoffMs, classifyFailure, describeFailure, stopsForGood,
} from './classify.js';

test('an unreachable service is transient: keep the work and try again', () => {
  assert.equal(classifyFailure(new RemoteUnavailable()), FAILURE.TRANSIENT);
  assert.equal(stopsForGood(FAILURE.TRANSIENT), false);
});

test('an expired credential is its own class, and is NOT transient', () => {
  const error = new RemoteCredentialExpired();
  assert.equal(classifyFailure(error), FAILURE.CREDENTIAL);
  assert.equal(error.retryable, true, 'it is retryable in principle...');
  assert.equal(error.needsReauth, true, '...but only after a user gesture, which is why it is separate');
  assert.notEqual(classifyFailure(error), FAILURE.TRANSIENT);
});

test('a refusal is rejected and stops for good', () => {
  assert.equal(classifyFailure(new RemoteInvalidRequest('malformed')), FAILURE.REJECTED);
  assert.equal(classifyFailure(new RemoteFileNotFound('f1')), FAILURE.REJECTED);
  assert.equal(stopsForGood(FAILURE.REJECTED), true);
});

test('a timeout is its own class, because its outcome is UNKNOWN and it may have landed', () => {
  assert.equal(classifyFailure(new RemoteTimeout('create', 30_000)), FAILURE.UNKNOWN_OUTCOME);
  assert.equal(stopsForGood(FAILURE.UNKNOWN_OUTCOME), false, 'it is retried — with recognition first');
});

test('the classification is read off the declared contract, not off message text', () => {
  // A failure this file has never heard of, with an unhelpful message, still classifies correctly —
  // which is the whole point. Matching on words would break silently the first time one was reworded.
  class SomeFutureFailure extends RemoteError {
    constructor() { super('???', { code: 'future', retryable: true, needsReauth: true }); }
  }
  assert.equal(classifyFailure(new SomeFutureFailure()), FAILURE.CREDENTIAL);

  class AnotherFutureFailure extends RemoteError {
    constructor() { super('???', { code: 'future2', retryable: false }); }
  }
  assert.equal(classifyFailure(new AnotherFutureFailure()), FAILURE.REJECTED);
});

test('a failure that did not come from the port is local, and is never dressed up as a refusal', () => {
  assert.equal(classifyFailure(new TypeError('x is not a function')), FAILURE.LOCAL);
  assert.equal(classifyFailure('a string'), FAILURE.LOCAL);
  assert.equal(classifyFailure(undefined), FAILURE.LOCAL);
});

test('the delay grows, and stops growing at the cap', () => {
  assert.equal(backoffMs(1), BACKOFF_BASE_MS);
  assert.equal(backoffMs(2), BACKOFF_BASE_MS * 2);
  assert.equal(backoffMs(3), BACKOFF_BASE_MS * 4);
  assert.ok(backoffMs(4) > backoffMs(3), 'it grows');
  assert.equal(backoffMs(50), BACKOFF_CAP_MS, 'and it is bounded, so a long outage is not an hours-long sleep');
  assert.equal(backoffMs(0), BACKOFF_BASE_MS, 'a nonsensical attempt count still yields a usable delay');
  assert.equal(backoffMs(3, { base: 1000, cap: 1500 }), 1500);
});

test('a stored failure description holds a code, plain words and its classification — and no stack', () => {
  const described = describeFailure(new RemoteUnavailable('The service is unavailable.'), '2026-07-25T09:00:00.000Z');
  assert.deepEqual(described, {
    code: 'unavailable',
    message: 'The service is unavailable.',
    classification: FAILURE.TRANSIENT,
    at: '2026-07-25T09:00:00.000Z',
  });
  assert.equal('stack' in described, false, 'a stack is not something a screen can use or a database should keep');
});
