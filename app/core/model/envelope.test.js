/**
 * THE ENVELOPE — its construction, its revisions, its tombstones, and the boundary it holds
 * against the content contract.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEnvelope, reviseEnvelope, tombstoneEnvelope, validateEnvelope,
  laterOf, supersedes, newRecordId, timestamp, ENVELOPE_FIELDS,
} from './envelope.js';
import { validateRecord } from './model.js';
import { CODES, hasCode, formatIssues } from './issues.js';
import { CONTENT_KEY_PATTERN, UUID_PATTERN } from './primitives.js';
import { aClient, anExercise, T0, T1, T2 } from './fixtures.js';

const DEVICE = 'coach-laptop';
const OTHER_DEVICE = 'coach-phone';

const wrap = (over = {}) => createEnvelope({
  type: 'exercise', content: anExercise(), device: DEVICE, now: T0, ...over,
});

// ───────────────────────────────────────────────────────────────────────────────
// Construction
// ───────────────────────────────────────────────────────────────────────────────

test('a new envelope starts at revision one, alive, with both timestamps equal', () => {
  const e = wrap();
  assert.equal(e.rev, 1);
  assert.equal(e.deleted, false);
  assert.equal(e.deleted_at, null);
  assert.equal(e.created_at, T0);
  assert.equal(e.updated_at, T0);
  assert.equal(e.device, DEVICE);
  assert.equal(e.type, 'exercise');
});

test('the envelope carries exactly its own fields and no others', () => {
  assert.deepEqual(Object.keys(wrap()).sort(), [...ENVELOPE_FIELDS].sort());
});

test('a record identity is a UUID, and is NOT the content key', () => {
  const e = wrap();
  assert.match(e.record_id, UUID_PATTERN);
  // The content key survives untouched, as an ordinary content field beside the identity.
  assert.equal(e.content.id, 'test-push-up');
  assert.match(e.content.id, CONTENT_KEY_PATTERN);
  assert.notEqual(e.record_id, e.content.id);
});

test('two records created from identical content still get distinct identities', () => {
  assert.notEqual(wrap().record_id, wrap().record_id);
  assert.notEqual(newRecordId(), newRecordId());
});

test('timestamps are written in one canonical UTC form', () => {
  assert.equal(timestamp(Date.parse(T0)), T0);
  assert.match(timestamp(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

// ───────────────────────────────────────────────────────────────────────────────
// Revisions
// ───────────────────────────────────────────────────────────────────────────────

test('a revision bumps rev, moves updated_at and device, and preserves identity and creation', () => {
  const first = wrap();
  const second = reviseEnvelope(first, anExercise({ name: 'Renamed Push Up' }),
    { device: OTHER_DEVICE, now: T1 });

  assert.equal(second.rev, 2);
  assert.equal(second.record_id, first.record_id);
  assert.equal(second.created_at, T0);
  assert.equal(second.updated_at, T1);
  assert.equal(second.device, OTHER_DEVICE);
  assert.equal(second.content.name, 'Renamed Push Up');
});

test('revising does not mutate the record it revises', () => {
  const first = wrap();
  const snapshot = JSON.stringify(first);
  reviseEnvelope(first, anExercise({ name: 'Something Else' }), { device: DEVICE, now: T1 });
  assert.equal(JSON.stringify(first), snapshot);
});

test('revising a tombstoned record brings it back to life', () => {
  const dead = tombstoneEnvelope(wrap(), { device: DEVICE, now: T1 });
  const alive = reviseEnvelope(dead, anExercise(), { device: DEVICE, now: T2 });
  assert.equal(alive.deleted, false);
  assert.equal(alive.deleted_at, null);
  assert.equal(alive.rev, 3);
  assert.ok(validateEnvelope(alive).ok, formatIssues(validateEnvelope(alive)));
});

// ───────────────────────────────────────────────────────────────────────────────
// Tombstones
// ───────────────────────────────────────────────────────────────────────────────

test('a tombstone is a revision that keeps identity and DROPS the payload', () => {
  const live = createEnvelope({ type: 'client', content: aClient(), device: DEVICE, now: T0 });
  const dead = tombstoneEnvelope(live, { device: DEVICE, now: T1 });

  assert.equal(dead.deleted, true);
  assert.equal(dead.deleted_at, T1);
  assert.equal(dead.rev, 2);
  assert.equal(dead.record_id, live.record_id);
  assert.equal(dead.created_at, T0);
  assert.equal(dead.content, null);
});

test("a deleted client's clinical fields do not survive inside the tombstone", () => {
  const live = createEnvelope({
    type: 'client',
    device: DEVICE,
    now: T0,
    content: aClient({
      clinical_note: { scheme: 1, iv: 'MTIzNDU2Nzg5MDEy', ct: 'c2VjcmV0' },
    }),
  });
  const dead = tombstoneEnvelope(live, { device: DEVICE, now: T1 });
  assert.equal(dead.content, null);
  assert.ok(!JSON.stringify(dead).includes('c2VjcmV0'),
    'a departed client\'s sealed note must not live on inside the record of their departure');
});

test('a tombstone carrying content is rejected', () => {
  const bad = { ...tombstoneEnvelope(wrap(), { device: DEVICE, now: T1 }), content: anExercise() };
  const r = validateEnvelope(bad);
  assert.equal(r.ok, false);
  assert.ok(hasCode(r, CODES.MISMATCH), formatIssues(r));
});

test('a live record with no content is rejected', () => {
  const r = validateEnvelope({ ...wrap(), content: null });
  assert.equal(r.ok, false);
  assert.ok(hasCode(r, CODES.REQUIRED), formatIssues(r));
});

test('a live record carrying a deletion time is rejected', () => {
  const r = validateEnvelope({ ...wrap(), deleted_at: T1 });
  assert.equal(r.ok, false);
  assert.ok(hasCode(r, CODES.MISMATCH), formatIssues(r));
});

test('a tombstone is validated without needing a content validator', () => {
  const dead = tombstoneEnvelope(wrap(), { device: DEVICE, now: T1 });
  assert.ok(validateRecord(dead).ok, formatIssues(validateRecord(dead)));
});

// ───────────────────────────────────────────────────────────────────────────────
// Envelope validation
// ───────────────────────────────────────────────────────────────────────────────

test('a well-formed envelope validates', () => {
  const r = validateEnvelope(wrap());
  assert.ok(r.ok, formatIssues(r));
});

test('a record identity that is really a content key is rejected', () => {
  const r = validateEnvelope({ ...wrap(), record_id: 'test-push-up' });
  assert.equal(r.ok, false);
  assert.ok(hasCode(r, CODES.FORMAT), formatIssues(r));
});

test('revision zero is rejected — revisions start at one', () => {
  assert.ok(hasCode(validateEnvelope({ ...wrap(), rev: 0 }), CODES.RANGE));
});

test('an unknown record type is rejected', () => {
  assert.ok(hasCode(validateEnvelope({ ...wrap(), type: 'workout' }), CODES.ENUM));
});

test('a malformed device tag is rejected', () => {
  assert.ok(hasCode(validateEnvelope({ ...wrap(), device: 'Coach Laptop' }), CODES.FORMAT));
});

test('a timestamp that is not the canonical UTC form is rejected', () => {
  assert.ok(hasCode(validateEnvelope({ ...wrap(), updated_at: '2026-07-25T09:00:00Z' }), CODES.FORMAT));
});

test('a record updated before it was created is rejected', () => {
  const r = validateEnvelope({ ...wrap(), created_at: T2, updated_at: T0 });
  assert.ok(hasCode(r, CODES.ORDERING), formatIssues(r));
});

test('an unknown envelope field is rejected', () => {
  const r = validateEnvelope({ ...wrap(), synced: true });
  assert.ok(hasCode(r, CODES.UNKNOWN_FIELD), formatIssues(r));
});

// ───────────────────────────────────────────────────────────────────────────────
// The boundary: envelope concerns must not leak into content
// ───────────────────────────────────────────────────────────────────────────────

test('a sync concern that has leaked into content is refused, by its own code', () => {
  for (const leaked of ['rev', 'device', 'deleted', 'updated_at', 'record_id', 'synced_at']) {
    const r = validateEnvelope(wrap({ content: { ...anExercise(), [leaked]: 'x' } }));
    assert.ok(hasCode(r, CODES.ENVELOPE_LEAK),
      `"${leaked}" inside content should be refused as an envelope leak\n${formatIssues(r)}`);
  }
});

test('provenance is content and passes the leak guard untouched', () => {
  // It exists so the admin reset can tell shipped content from the coach's own additions —
  // a single-device concern that would exist with no sync and no encryption at all.
  const r = validateEnvelope(wrap({ content: anExercise({ provenance: 'shipped-edited' }) }));
  assert.ok(r.ok, formatIssues(r));
});

test('the content key stays in content and is never treated as an envelope concern', () => {
  const r = validateEnvelope(wrap({ content: anExercise({ id: 'barbell-bent-over-row' }) }));
  assert.ok(r.ok, formatIssues(r));
});

// ───────────────────────────────────────────────────────────────────────────────
// Last-write-wins
// ───────────────────────────────────────────────────────────────────────────────

test('the higher revision wins, whatever the clocks say', () => {
  const a = { ...wrap(), rev: 5, updated_at: T0, device: DEVICE };
  const b = { ...wrap(), rev: 4, updated_at: T2, device: OTHER_DEVICE };
  assert.equal(laterOf(a, b), a);
  assert.equal(laterOf(b, a), a);
});

test('at equal revisions the later write wins', () => {
  const a = { ...wrap(), rev: 3, updated_at: T0, device: DEVICE };
  const b = { ...wrap(), rev: 3, updated_at: T2, device: OTHER_DEVICE };
  assert.equal(laterOf(a, b), b);
  assert.equal(laterOf(b, a), b);
});

test('an exact tie is broken the same way whichever device asks', () => {
  const a = { ...wrap(), rev: 3, updated_at: T1, device: 'coach-laptop' };
  const b = { ...wrap(), rev: 3, updated_at: T1, device: 'coach-phone' };
  // Not meaningful — only that it CONVERGES. Two devices resolving a tie differently would
  // leave two different records behind, which is worse than losing the write.
  assert.equal(laterOf(a, b).device, laterOf(b, a).device);
});

test('a tombstone does not win automatically — an edit after a delete resurrects', () => {
  const deleted = tombstoneEnvelope(wrap(), { device: DEVICE, now: T1 });          // rev 2
  const edited = reviseEnvelope(wrap(), anExercise({ name: 'Edited Push Up' }),
    { device: OTHER_DEVICE, now: T2 });                                            // rev 2
  assert.equal(laterOf(deleted, edited), edited);
});

test('supersedes agrees with laterOf and is false for the same revision', () => {
  const a = wrap();
  const b = reviseEnvelope(a, anExercise(), { device: DEVICE, now: T1 });
  assert.equal(supersedes(a, b), true);
  assert.equal(supersedes(b, a), false);
  assert.equal(supersedes(a, { ...a }), false);
});
