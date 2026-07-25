/**
 * WHAT AN ENTRY MUST CARRY, AND WHAT IT MUST NOT BE.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { SPACES } from '../remote/remote.js';
import {
  ENTRY_VERSION, HOLD, HOLD_VALUES, OPERATION, STATUS, STATUS_VALUES, TERMINAL_STATUSES,
  UNDELIVERED_STATUSES, ageMs, isDue, isTerminal, keyedName, newEntry, validateEntry,
} from './entry.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const T0 = '2026-07-25T09:00:00.000Z';

/** A valid create entry. */
function aCreate(overrides = {}) {
  const key = 'k-11111111';
  return newEntry({
    operation: OPERATION.CREATE,
    space: SPACES.VISIBLE,
    name: keyedName('library-backup.json', key),
    payload: '{"exercises":1}',
    label: 'backup of the exercise library',
    idempotency_key: key,
    device: 'coach-laptop',
    seq: 1,
    now: T0,
    ...overrides,
  });
}

test('a fresh entry is pending, unheld, due immediately, and stamped with its format', () => {
  const entry = aCreate();
  assert.equal(entry.status, STATUS.PENDING);
  assert.equal(entry.hold, HOLD.NONE);
  assert.equal(entry.attempts, 0);
  assert.equal(entry.entry_version, ENTRY_VERSION);
  assert.equal(entry.next_attempt_at, T0);
  assert.equal(isDue(entry, T0), true);
  assert.equal(isTerminal(entry), false);
  assert.deepEqual(validateEntry(entry), { ok: true, issues: [] });
});

test('an entry carries everything a replay needs and nothing that only this session can resolve', () => {
  const entry = aCreate();
  // The whole point: serialise it, throw the session away, and it is still deliverable.
  const revived = JSON.parse(JSON.stringify(entry));
  assert.deepEqual(validateEntry(revived), { ok: true, issues: [] });
  assert.equal(revived.payload, '{"exercises":1}', 'the bytes travel with the entry, not a pointer to them');
  assert.equal(revived.space, SPACES.VISIBLE);
  assert.equal(revived.operation, OPERATION.CREATE);
  assert.equal(revived.idempotency_key, 'k-11111111');
  for (const [field, value] of Object.entries(revived)) {
    assert.notEqual(typeof value, 'function', `${field} must be data, not behaviour`);
  }
});

test('a create whose name does not carry its idempotency key is REFUSED', () => {
  const entry = aCreate({ name: 'library-backup.json' });
  const { ok, issues } = validateEntry(entry);
  assert.equal(ok, false);
  assert.ok(issues.some((i) => i.path === 'name' && /idempotency key/i.test(i.message)));
});

test('keyedName puts the key before the extension, and copes with a name that has none', () => {
  assert.equal(keyedName('library-backup.json', 'abc'), 'library-backup.abc.json');
  assert.equal(keyedName('envelope', 'abc'), 'envelope.abc');
  assert.equal(keyedName('a.b.c.json', 'k'), 'a.b.c.k.json');
  assert.throws(() => keyedName('', 'k'));
  assert.throws(() => keyedName('x.json', ''));
});

test('every operation is refused without the fields its delivery needs', () => {
  const noTarget = newEntry({
    operation: OPERATION.OVERWRITE, space: SPACES.VISIBLE, payload: 'x',
    label: 'l', device: 'd', seq: 1, now: T0,
  });
  assert.equal(validateEntry(noTarget).ok, false);
  assert.ok(validateEntry(noTarget).issues.some((i) => i.path === 'target_file_id'));

  const noPayload = newEntry({
    operation: OPERATION.OVERWRITE, space: SPACES.VISIBLE, target_file_id: 'f1',
    label: 'l', device: 'd', seq: 1, now: T0,
  });
  assert.ok(validateEntry(noPayload).issues.some((i) => i.path === 'payload'));

  const removal = newEntry({
    operation: OPERATION.REMOVE, space: SPACES.VISIBLE, target_file_id: 'f1',
    label: 'l', device: 'd', seq: 1, now: T0,
  });
  assert.equal(validateEntry(removal).ok, true, 'a removal needs no payload');
});

test('validation reports EVERY fault at once, not the first', () => {
  const { ok, issues } = validateEntry({ ...aCreate(), seq: 0, status: 'nope', hold: 'nope', refs: 'no' });
  assert.equal(ok, false);
  const paths = issues.map((i) => i.path).sort();
  assert.deepEqual(paths, ['hold', 'refs', 'seq', 'status']);
});

test('a boolean status or hold is refused, because a boolean is not a valid database key', () => {
  // Measured on this build: an index on a boolean field silently holds ZERO entries, so every query
  // against it returns nothing while the code, the schema and the query all look correct. Refusing it
  // at the entry is cheaper than discovering an empty queue later.
  const issues = validateEntry({ ...aCreate(), status: true, hold: false }).issues;
  assert.ok(issues.some((i) => i.path === 'status'));
  assert.ok(issues.some((i) => i.path === 'hold'));
});

test('the status vocabulary is text, and the terminal and undelivered sets are what they claim', () => {
  for (const value of [...STATUS_VALUES, ...HOLD_VALUES]) assert.equal(typeof value, 'string');
  assert.deepEqual([...TERMINAL_STATUSES].sort(), ['ambiguous', 'delivered', 'rejected']);
  assert.deepEqual([...UNDELIVERED_STATUSES].sort(), ['ambiguous', 'pending', 'rejected']);
  assert.ok(!UNDELIVERED_STATUSES.includes(STATUS.DELIVERED));
  assert.ok(
    UNDELIVERED_STATUSES.includes(STATUS.REJECTED) && UNDELIVERED_STATUSES.includes(STATUS.AMBIGUOUS),
    'a stopped entry is data that is NOT away, and must be counted as such',
  );
});

test('a backoff hold becomes due when its instant passes; a credential hold never does on a timer', () => {
  const later = '2026-07-25T09:05:00.000Z';
  const onBackoff = { ...aCreate(), hold: HOLD.BACKOFF, next_attempt_at: later };
  assert.equal(isDue(onBackoff, T0), false);
  assert.equal(isDue(onBackoff, later), true);

  const onCredential = { ...aCreate(), hold: HOLD.CREDENTIAL, next_attempt_at: T0 };
  assert.equal(isDue(onCredential, T0), false, 'no amount of waiting renews a credential');
  assert.equal(isDue(onCredential, '2027-01-01T00:00:00.000Z'), false);

  for (const status of TERMINAL_STATUSES) {
    assert.equal(isDue({ ...aCreate(), status }, later), false, `${status} is never attempted again`);
  }
});

test('age is measured from when it was queued, and never goes negative', () => {
  const entry = aCreate();
  assert.equal(ageMs(entry, '2026-07-25T09:00:30.000Z'), 30_000);
  assert.equal(ageMs(entry, '2026-07-25T08:00:00.000Z'), 0);
});

test('no module in this package names an encrypted field, so a payload cannot be special-cased', async () => {
  // The same claim the local store makes, for the same reason: this layer carries ciphertext and must
  // never inspect it. Naming the field is the first thing code would have to do to start peeking.
  const { ALL_ENCRYPTED_FIELD_NAMES } = await import('../model/model.js');
  const files = readdirSync(HERE).filter((f) => f.endsWith('.js') || f.endsWith('.md'));
  assert.ok(files.length >= 8, `expected the package's files, found ${files.length}`);

  for (const file of files) {
    const text = readFileSync(join(HERE, file), 'utf8');
    for (const field of ALL_ENCRYPTED_FIELD_NAMES) {
      assert.ok(
        !new RegExp(`\\b${field}\\b`).test(text),
        `${file} names the encrypted field "${field}"; this layer must carry ciphertext without knowing what it is`,
      );
    }
  }
});
