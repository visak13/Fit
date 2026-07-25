/**
 * THE PORT'S SHAPE — narrow, provider-neutral, and validating at its own boundary.
 *
 * The tests here guard three things that are easy to erode one convenient addition at a time:
 * the operation list stays six long, no provider vocabulary leaks in, and a malformed request
 * fails HERE rather than travelling to a service to be rejected.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  SPACES, SPACE_VALUES, NAME_MAX, DEFAULT_TIMEOUT_MS,
  PORT_OPERATIONS, PORT_CAPABILITIES, MEASURED_QUIRKS,
  RemoteStoragePort, RemoteNotImplemented, RemoteInvalidRequest, RemoteFileNotFound,
  RemoteCredentialExpired, RemoteUnavailable, RemoteTimeout, RemoteError,
  assertSpace, assertName, assertFileId, assertTimeout,
  normalizeContent, textToBytes, bytesToText, hasMoved,
} from './port.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════════════
// Narrowness
// ═══════════════════════════════════════════════════════════════════════════════

test('the port exposes exactly six operations and nothing else', () => {
  const own = Object.getOwnPropertyNames(RemoteStoragePort.prototype).filter((n) => n !== 'constructor');
  assert.deepEqual(own.sort(), [...PORT_OPERATIONS].sort());
  assert.equal(PORT_OPERATIONS.length, 6);
});

test('every declared operation is actually present, and unimplemented ones say so', async () => {
  const bare = new RemoteStoragePort();
  for (const op of PORT_OPERATIONS) {
    assert.equal(typeof bare[op], 'function', `${op} must exist on the port`);
    await assert.rejects(() => bare[op]('x', {}, {}), (err) => {
      assert.ok(err instanceof RemoteNotImplemented);
      assert.equal(err.operation, op);
      assert.equal(err.retryable, false, 'a missing implementation never becomes present by retrying');
      return true;
    });
  }
});

test('the capability declaration refuses a conditional write, and that refusal is the point', () => {
  assert.equal(PORT_CAPABILITIES.conditional_write, false);
  assert.equal(PORT_CAPABILITIES.name_uniqueness, false);
  assert.equal(PORT_CAPABILITIES.atomic_multi_write, false);
  assert.equal(PORT_CAPABILITIES.content_digest, false);
  assert.equal(PORT_CAPABILITIES.revision_marker, true, 'detection needs a marker that moves');
  assert.ok(Object.isFrozen(PORT_CAPABILITIES));
});

test('every recorded quirk carries its provenance, and none is labelled as an assumption', () => {
  assert.ok(MEASURED_QUIRKS.length >= 2);
  for (const quirk of MEASURED_QUIRKS) {
    assert.equal(quirk.confidence, 'MEASURED', `${quirk.id} must be measured, never assumed`);
    assert.ok(quirk.where && quirk.where.length > 10, `${quirk.id} must say where it was measured`);
    assert.ok(quirk.why_the_double_must_reproduce_it.length > 40,
      `${quirk.id} must say what breaks if the double is kinder than reality`);
    assert.ok(Object.isFrozen(quirk));
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Provider neutrality — the later step should be filling in, not translating
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Split text into lowercase words, scanning characters rather than matching a pattern.
 *
 * Whole words matter here: "drive" is a banned product term, while "driven" and "drives" are
 * ordinary English and appear all over this directory. A substring search would flag them and
 * the check would be abandoned as noise within a week.
 */
function wordsOf(text) {
  const words = new Set();
  let current = '';
  for (const ch of text.toLowerCase()) {
    const isWordChar = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
    if (isWordChar) {
      current += ch;
    } else if (current !== '') {
      words.add(current);
      current = '';
    }
  }
  if (current !== '') words.add(current);
  return words;
}

test('no provider vocabulary appears anywhere in this directory', () => {
  // The port is a boundary the cloud step implements. If a provider term had leaked into a
  // method name, a field name or an error, that step would begin by translating a vocabulary
  // instead of supplying an implementation — and the port would have quietly become specific
  // to one service.
  const banned = [
    'google', 'gdrive', 'drive', 'appdatafolder', 'appdata', 'oauth', 'gapi',
    'calendar', 'meet', 'bearer', 'mimetype', 'folderid',
  ];
  const files = readdirSync(HERE).filter((f) => f.endsWith('.js') || f.endsWith('.md'));
  assert.ok(files.length >= 4);

  for (const file of files) {
    // This test names the banned words, so it would flag itself. It is the one exemption.
    if (file === 'port.test.js') continue;
    const words = wordsOf(readFileSync(join(HERE, file), 'utf8'));
    for (const word of banned) {
      assert.equal(words.has(word), false,
        `${file} uses the word "${word}". This port is provider-neutral by design — name the role, not the product.`);
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Spaces
// ═══════════════════════════════════════════════════════════════════════════════

test('there are exactly two spaces, named by role', () => {
  assert.deepEqual([...SPACE_VALUES], ['visible', 'hidden']);
  assert.equal(SPACES.VISIBLE, 'visible');
  assert.equal(SPACES.HIDDEN, 'hidden');
  assert.ok(Object.isFrozen(SPACES));
});

test('an unknown space is refused at the boundary', () => {
  assert.throws(() => assertSpace('appdata'), RemoteInvalidRequest);
  assert.throws(() => assertSpace(''), RemoteInvalidRequest);
  assert.throws(() => assertSpace(undefined), RemoteInvalidRequest);
  assert.equal(assertSpace(SPACES.HIDDEN), 'hidden');
});

// ═══════════════════════════════════════════════════════════════════════════════
// Boundary validation
// ═══════════════════════════════════════════════════════════════════════════════

test('a blank or oversized name is refused, and a valid one is returned unchanged', () => {
  assert.throws(() => assertName(''), RemoteInvalidRequest);
  assert.throws(() => assertName('   '), RemoteInvalidRequest);
  assert.throws(() => assertName(42), RemoteInvalidRequest);
  assert.throws(() => assertName('x'.repeat(NAME_MAX + 1)), RemoteInvalidRequest);
  assert.equal(assertName('backup-2026-07-25.json'), 'backup-2026-07-25.json');
});

test('a blank identifier is refused', () => {
  assert.throws(() => assertFileId(''), RemoteInvalidRequest);
  assert.throws(() => assertFileId(null), RemoteInvalidRequest);
  assert.equal(assertFileId('abc'), 'abc');
});

test('every call needs a positive finite deadline — there is no wait-forever path', () => {
  assert.throws(() => assertTimeout(0), RemoteInvalidRequest);
  assert.throws(() => assertTimeout(-1), RemoteInvalidRequest);
  assert.throws(() => assertTimeout(Infinity), RemoteInvalidRequest);
  assert.throws(() => assertTimeout(undefined), RemoteInvalidRequest);
  assert.equal(assertTimeout(1000), 1000);
  assert.equal(assertTimeout(DEFAULT_TIMEOUT_MS), 30_000);
});

test('content normalises to bytes and is COPIED, so a caller cannot reach back into the store', () => {
  assert.deepEqual(normalizeContent('hi'), textToBytes('hi'));
  assert.equal(bytesToText(normalizeContent('round trip')), 'round trip');

  const source = new Uint8Array([1, 2, 3]);
  const stored = normalizeContent(source);
  source[0] = 99;
  assert.equal(stored[0], 1, 'mutating the caller\'s array must not change what was stored');

  assert.throws(() => normalizeContent(42), RemoteInvalidRequest);
  assert.throws(() => normalizeContent({ a: 1 }), RemoteInvalidRequest);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Errors carry the two questions a caller actually asks
// ═══════════════════════════════════════════════════════════════════════════════

test('each failure says whether retrying helps and whether the user must re-authorise', () => {
  const expired = new RemoteCredentialExpired();
  assert.equal(expired.code, 'credential_expired');
  assert.equal(expired.retryable, true);
  assert.equal(expired.needsReauth, true, 'retrying alone never fixes it — it needs a user gesture');

  const unavailable = new RemoteUnavailable();
  assert.equal(unavailable.retryable, true);
  assert.equal(unavailable.needsReauth, false, 'a transient outage must not send the user to a sign-in prompt');

  const timeout = new RemoteTimeout('overwrite', 30_000);
  assert.equal(timeout.retryable, true);
  assert.match(timeout.message, /outcome is unknown/,
    'a timed-out write may have landed; the message must not imply otherwise');

  const notFound = new RemoteFileNotFound('abc');
  assert.equal(notFound.retryable, false);
  assert.match(notFound.message, /abc/);

  const invalid = new RemoteInvalidRequest('bad');
  assert.equal(invalid.retryable, false, 'retrying a malformed request produces the same malformed request');

  for (const err of [expired, unavailable, timeout, notFound, invalid]) {
    assert.ok(err instanceof RemoteError, 'one base class, so a caller can catch the family');
    assert.ok(err instanceof Error);
    assert.equal(err.name, err.constructor.name);
  }
});

test('a cause is preserved rather than swallowed', () => {
  const original = new Error('socket closed');
  const wrapped = new RemoteUnavailable('could not reach the service', { cause: original });
  assert.equal(wrapped.cause, original);
});

// ═══════════════════════════════════════════════════════════════════════════════
// hasMoved — detection, and honest about what it is not
// ═══════════════════════════════════════════════════════════════════════════════

test('hasMoved compares two readings of one file', () => {
  const held = { file_id: 'f', space: 'visible', name: 'n', revision: 1, modified_at: 'T1', size: 3 };
  assert.equal(hasMoved(held, { ...held }), false);
  assert.equal(hasMoved(held, { ...held, revision: 2 }), true);
  assert.equal(hasMoved(held, { ...held, modified_at: 'T2' }), true,
    'a write that somehow kept the revision still changed the file');
});

test('hasMoved refuses to compare two DIFFERENT files, because names are not unique', () => {
  // Comparing across identifiers is exactly the mistake a name-based caller would make, and
  // it would read as "unchanged" while looking at an entirely different file.
  const held = { file_id: 'f1', space: 'hidden', name: 'key-envelope.json', revision: 1, modified_at: 'T1', size: 3 };
  const other = { ...held, file_id: 'f2' };
  assert.throws(() => hasMoved(held, other), RemoteInvalidRequest);
  assert.throws(() => hasMoved(held, null), RemoteInvalidRequest);
});
