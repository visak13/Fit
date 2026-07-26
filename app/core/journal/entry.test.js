/**
 * THE ENTRY SHAPE, AND THE THREE LAYERS THAT KEEP A RECORD'S CONTENT OUT OF IT.
 *
 * The no-content rule is the second of the three guards this step installs, and the reason it is
 * tested this hard is that it is the one a later step is most likely to erode by accident: a call
 * site with a useful fact to hand and nowhere to put it will find somewhere. So each layer is
 * attacked on its own terms — an extra field, a structure smuggled under an accepted name, and
 * prose parked in an identifier — and each is watched to refuse.
 *
 * This suite touches no cryptography at all. The shape rules are pure and synchronous, and keeping
 * them testable without a digest is why `createEntry` does not hash.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { JournalContentError, JournalKindError, JournalShapeError } from './errors.js';
import {
  ENTRY_FIELDS, MAX_RECORD_ID_LENGTH, canonicalText, createEntry, looksLikeEntry,
} from './entry.js';
import { JOURNAL_KINDS } from './kinds.js';

const DEVICE = 'coach-laptop';
const AT = '2026-07-26T09:15:00.000Z';
const ID = '2f1a5c60-0000-4000-8000-000000000001';
const RECORD = '9c3e77aa-0000-4000-8000-0000000000ab';

/** A well-formed record-change entry, which each test then bends in one direction. */
const good = () => ({
  kind: JOURNAL_KINDS.RECORD_UPDATED,
  device: DEVICE,
  seq: 1,
  entry_id: ID,
  at: AT,
  subject: { type: 'session-note', record_id: RECORD },
});

test('an entry records THAT, to WHICH record, WHEN and on WHICH DEVICE — and nothing else', () => {
  const entry = createEntry(good());
  assert.deepEqual(Object.keys(entry).sort(), [...ENTRY_FIELDS].sort());
  assert.equal(entry.kind, JOURNAL_KINDS.RECORD_UPDATED);
  assert.equal(entry.device, DEVICE);
  assert.equal(entry.at, AT);
  assert.deepEqual(entry.subject, { type: 'session-note', record_id: RECORD });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LAYER 1 — the closed set of fields
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('LAYER 1: a caller passing CONTENT is refused', () => {
  // The plain attempt, and the one that matters most: the note text itself.
  assert.throws(
    () => createEntry({ ...good(), content: 'Left knee still painful on descent.' }),
    JournalContentError,
  );
});

test('LAYER 1: every plausible name for "and here is a bit more about it" is refused', () => {
  // There is no detail, meta, payload, note or reason field, and a caller cannot create one. If a
  // later step genuinely needs a fact recorded, it adds a named typed field where a reviewer sees it.
  for (const field of ['detail', 'details', 'meta', 'metadata', 'payload', 'note', 'notes',
    'reason', 'message', 'summary', 'description', 'data', 'extra', 'context', 'name']) {
    assert.throws(() => createEntry({ ...good(), [field]: 'anything' }), JournalContentError,
      `"${field}" was accepted`);
  }
});

test('LAYER 1: the refusal says which field and where to add one properly', () => {
  try {
    createEntry({ ...good(), notes: 'x' });
    assert.fail('content was accepted');
  } catch (error) {
    assert.ok(error instanceof JournalContentError);
    assert.equal(error.field, 'notes');
    assert.match(error.message, /entry\.js/);
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LAYER 2 — flat values only
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('LAYER 2: a structure smuggled in under an ACCEPTED field name is refused', () => {
  // The obvious way past layer 1: use a field the entry does accept, and put the content in it.
  assert.throws(() => createEntry({ ...good(), at: { was: 'then', note: 'sore knee' } }),
    JournalContentError);
  assert.throws(() => createEntry({ ...good(), device: ['coach-laptop', 'sore knee'] }),
    JournalContentError);
  assert.throws(() => createEntry({ ...good(), affected_count: { readings: 4 } }),
    JournalContentError);
});

test('LAYER 2: the subject holds WHICH record and refuses anything beside it', () => {
  assert.throws(
    () => createEntry({ ...good(), subject: { type: 'client', record_id: RECORD, name: 'A. Client' } }),
    JournalContentError,
  );
  assert.throws(
    () => createEntry({ ...good(), subject: { type: 'reading', record_id: RECORD, value: 148 } }),
    JournalContentError,
  );
});

test('LAYER 2: affected_count is a whole number, because a count cannot carry a name or a reading', () => {
  const entry = createEntry({ ...good(), kind: JOURNAL_KINDS.RECORD_PURGED, affected_count: 12 });
  assert.equal(entry.affected_count, 12);
  assert.equal(createEntry(good()).affected_count, null);
  for (const bad of ['12', 1.5, -1, Number.NaN]) {
    assert.throws(() => createEntry({ ...good(), affected_count: bad }), JournalShapeError,
      `accepted ${String(bad)}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LAYER 3 — identifiers must look like identifiers
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('LAYER 3: prose parked in an identifier field is refused', () => {
  // The way past layer 2: keep the value flat, and make it a sentence.
  assert.throws(
    () => createEntry({ ...good(), subject: { type: 'session-note', record_id: 'knee pain, 3 sets' } }),
    JournalContentError,
  );
  assert.throws(
    () => createEntry({ ...good(), subject: { type: 'the client A Client', record_id: RECORD } }),
    JournalContentError,
  );
  assert.throws(
    () => createEntry({ ...good(), subject: { type: 'client', record_id: 'x'.repeat(MAX_RECORD_ID_LENGTH + 1) } }),
    JournalContentError,
  );
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The vocabulary and the subject rules meet here
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('an entry cannot be built with a kind the vocabulary does not define', () => {
  assert.throws(() => createEntry({ ...good(), kind: 'client.viewed' }), JournalKindError);
});

test('a record change without its record is refused; authentication WITH one is refused too', () => {
  assert.throws(() => createEntry({ ...good(), subject: undefined }), JournalShapeError);
  assert.throws(
    () => createEntry({ ...good(), kind: JOURNAL_KINDS.UNLOCKED, subject: { type: 'client', record_id: RECORD } }),
    JournalShapeError,
  );
  // …and an authentication entry with no subject is exactly right.
  const unlocked = createEntry({ kind: JOURNAL_KINDS.UNLOCKED, device: DEVICE, seq: 1, entry_id: ID, at: AT });
  assert.equal(unlocked.subject, null);
});

test('the DEVICE is the local store\'s device tag, held to the same rule the store holds it to', () => {
  assert.throws(() => createEntry({ ...good(), device: 'ab' }), JournalShapeError);
  assert.throws(() => createEntry({ ...good(), device: undefined }), JournalShapeError);
});

test('the sequence counts from 1 and is a whole number', () => {
  assert.throws(() => createEntry({ ...good(), seq: 0 }), JournalShapeError);
  assert.throws(() => createEntry({ ...good(), seq: 1.5 }), JournalShapeError);
});

test('the timestamp must be an ISO instant in UTC — the device clock, honestly labelled', () => {
  assert.throws(() => createEntry({ ...good(), at: '26 July 2026' }), JournalShapeError);
  assert.throws(() => createEntry({ ...good(), at: '2026-07-26T09:15:00+05:30' }), JournalShapeError);
  assert.match(createEntry({ ...good(), at: undefined }).at, /Z$/, 'it should fall back to now');
});

test('an entry is frozen once built, so nothing can edit it between building and hashing', () => {
  const entry = createEntry(good());
  assert.throws(() => { entry.kind = JOURNAL_KINDS.RECORD_DELETED; }, TypeError);
  assert.throws(() => { entry.subject.record_id = 'somewhere-else'; }, TypeError);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The canonical form the chain hashes
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('the canonical form is POSITIONAL, so key order cannot change a hash', () => {
  // The reason this is not `JSON.stringify(entry)`: key order is an implementation detail of
  // whatever built the object, and a chain that depends on it verifies on one machine and fails on
  // another.
  const one = createEntry(good());
  const other = createEntry({
    entry_id: ID, at: AT, subject: { record_id: RECORD, type: 'session-note' },
    seq: 1, device: DEVICE, kind: JOURNAL_KINDS.RECORD_UPDATED,
  });
  assert.equal(canonicalText(one), canonicalText(other));
});

test('the canonical form changes when ANY recorded field changes', () => {
  const base = canonicalText(createEntry(good()));
  assert.notEqual(base, canonicalText(createEntry({ ...good(), seq: 2 })));
  assert.notEqual(base, canonicalText(createEntry({ ...good(), at: '2026-07-26T09:15:00.001Z' })));
  assert.notEqual(base, canonicalText(createEntry({ ...good(), kind: JOURNAL_KINDS.RECORD_DELETED })));
  assert.notEqual(base, canonicalText(createEntry({ ...good(), device: 'coach-phone' })));
  assert.notEqual(base, canonicalText(createEntry({
    ...good(), subject: { type: 'session-note', record_id: 'another-record' },
  })));
});

test('looksLikeEntry rejects what the verification pass must not choke on', () => {
  assert.equal(looksLikeEntry(null), false);
  assert.equal(looksLikeEntry('an entry'), false);
  assert.equal(looksLikeEntry([]), false);
  assert.equal(looksLikeEntry({ ...createEntry(good()) }), false, 'no hash yet');
  assert.equal(looksLikeEntry({ ...createEntry(good()), hash: 'x' }), true);
});
