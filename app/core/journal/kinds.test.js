/**
 * THE CLOSED VOCABULARY, AND THE REFUSAL THAT KEEPS IT CLOSED.
 *
 * The refusal is the guard this whole step exists to install, so it is tested from both sides: that
 * every kind the five recorded domains need is present, and that anything else is REJECTED rather
 * than quietly accepted. A vocabulary that merely documents its kinds is a suggestion.
 *
 * The domain coverage is asserted over the whole set rather than over a handful of names, so a kind
 * added later without a domain, or a domain that loses its last kind, fails here rather than
 * showing up as an unanswerable question months on.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { JournalKindError } from './errors.js';
import {
  DOMAIN, JOURNAL_KINDS, KINDS, KIND_SPECS, SUBJECT, assertKind, isKnownKind, kindsInDomain,
} from './kinds.js';

/** The five domains the security standard names. The sixth is the log's own housekeeping. */
const THE_FIVE_RECORDED_DOMAINS = [
  DOMAIN.AUTHENTICATION,
  DOMAIN.RECORD_CHANGE,
  DOMAIN.EXPORT,
  DOMAIN.SYNCHRONISATION,
  DOMAIN.KEY_AND_RECOVERY,
];

test('ALL FIVE RECORDED DOMAINS have kinds — authentication, record changes, exports, sync, keys', () => {
  for (const domain of THE_FIVE_RECORDED_DOMAINS) {
    assert.ok(kindsInDomain(domain).length > 0,
      `${domain} has no kinds, so nothing in that domain could ever be recorded`);
  }
});

test('AUTHENTICATION AND EXPORT kinds exist although no step writes them yet — that is the point', () => {
  // These have no call sites. The steps that own them have not been built. Defining them NOW, from
  // one place, is the entire reason this step comes before them: the step that eventually writes an
  // unlock event finds the kind already named and does not get to invent one.
  assert.ok(isKnownKind(JOURNAL_KINDS.UNLOCKED));
  assert.ok(isKnownKind(JOURNAL_KINDS.UNLOCK_REFUSED));
  assert.ok(isKnownKind(JOURNAL_KINDS.EXPORT_STARTED));
  assert.ok(isKnownKind(JOURNAL_KINDS.EXPORT_COMPLETED));
  assert.ok(isKnownKind(JOURNAL_KINDS.EXPORT_REFUSED));
});

test('AN UNKNOWN KIND IS AN ERROR, never a silent accept', () => {
  // THE GUARD. If this ever became permissive, every later step could write its own vocabulary and
  // the log would stop being able to answer "every authentication event" — which is the failure the
  // decision behind this step names in its own words.
  assert.throws(() => assertKind('client.viewed'), JournalKindError);
  assert.throws(() => assertKind('record.updatd'), JournalKindError);
  assert.throws(() => assertKind('anything at all'), JournalKindError);
});

test('the refusal names the offending kind and lists what IS defined, so the caller can act', () => {
  try {
    assertKind('session.finished');
    assert.fail('an undefined kind was accepted');
  } catch (error) {
    assert.ok(error instanceof JournalKindError);
    assert.equal(error.kind, 'session.finished');
    assert.match(error.message, /record\.updated/, 'the message should list the defined kinds');
    assert.match(error.message, /kinds\.js/, 'the message should say where to add one');
  }
});

test('there is NO permissive value — not empty, not null, not a catch-all "other"', () => {
  // A fallback kind is the escape hatch that would make the whole vocabulary advisory: the first
  // call site under time pressure reaches for it and the log fills with entries meaning nothing.
  for (const escapeHatch of ['', ' ', 'other', 'unknown', 'misc', 'event', null, undefined, 0]) {
    assert.throws(() => assertKind(escapeHatch), JournalKindError, `accepted ${String(escapeHatch)}`);
  }
});

test('a non-string kind cannot slip past by having a toString', () => {
  assert.throws(() => assertKind({ toString: () => 'record.updated' }), JournalKindError);
  assert.throws(() => assertKind(['record.updated']), JournalKindError);
});

test('the vocabulary cannot be extended at runtime by writing to it', () => {
  // Frozen, so a call site cannot add its kind on the way past and then use it.
  assert.throws(() => { KIND_SPECS['record.invented'] = { kind: 'record.invented' }; }, TypeError);
  assert.equal(isKnownKind('record.invented'), false);
});

test('inherited property names are not kinds', () => {
  // `Object.hasOwn` and not `in`: otherwise 'constructor' and 'toString' would both be kinds.
  assert.equal(isKnownKind('constructor'), false);
  assert.equal(isKnownKind('toString'), false);
  assert.equal(isKnownKind('__proto__'), false);
});

test('EVERY kind declares a domain and a subject rule, and its own name matches its key', () => {
  const domains = new Set(Object.values(DOMAIN));
  const subjectRules = new Set(Object.values(SUBJECT));
  for (const kind of KINDS) {
    const spec = KIND_SPECS[kind];
    assert.equal(spec.kind, kind, `${kind} disagrees with its own key`);
    assert.ok(domains.has(spec.domain), `${kind} has no recognised domain`);
    assert.ok(subjectRules.has(spec.subject), `${kind} does not say whether it names a record`);
    assert.ok(spec.means.length > 10, `${kind} does not say what it means`);
  }
});

test('every constant in JOURNAL_KINDS is a defined kind, and every kind is reachable as a constant', () => {
  // Both directions. A constant pointing at nothing would throw at the call site; a kind with no
  // constant would force call sites back to spelling strings, which is what the constants prevent.
  const constants = new Set(Object.values(JOURNAL_KINDS));
  for (const value of constants) assert.ok(isKnownKind(value), `${value} is not defined`);
  for (const kind of KINDS) assert.ok(constants.has(kind), `${kind} has no constant`);
});

test('RECORD CHANGES must name a record; authentication and key activity must NOT', () => {
  // Not a formality. An authentication entry that could carry a client identity would be asserting
  // a link between a person and a record that the event never established.
  assert.equal(KIND_SPECS[JOURNAL_KINDS.RECORD_CREATED].subject, SUBJECT.REQUIRED);
  assert.equal(KIND_SPECS[JOURNAL_KINDS.RECORD_UPDATED].subject, SUBJECT.REQUIRED);
  assert.equal(KIND_SPECS[JOURNAL_KINDS.RECORD_DELETED].subject, SUBJECT.REQUIRED);
  for (const kind of [...kindsInDomain(DOMAIN.AUTHENTICATION), ...kindsInDomain(DOMAIN.KEY_AND_RECOVERY)]) {
    assert.equal(KIND_SPECS[kind].subject, SUBJECT.FORBIDDEN, `${kind} should not name a record`);
  }
});

test('the log has a kind for its own retention, so a pruned head is not read as tampering', () => {
  // The sixth domain, and the reason it exists: retention discards the oldest entries, which leaves
  // a chain whose head links to something gone. Without an entry saying a prune happened, that gap
  // is indistinguishable from a deletion and the log cries wolf on its own housekeeping.
  assert.ok(isKnownKind(JOURNAL_KINDS.RETENTION_PRUNED));
  assert.equal(KIND_SPECS[JOURNAL_KINDS.RETENTION_PRUNED].domain, DOMAIN.JOURNAL);
});

test('no kind name carries a client, a person or a measurement', () => {
  // The vocabulary is read by whoever reads the log. A kind called `client.weight_recorded` would
  // put a fact about a person into the one field that is never sealed.
  for (const kind of KINDS) {
    assert.match(kind, /^[a-z][a-z_]*\.[a-z][a-z_]*$/, `${kind} is not domain.event`);
  }
});
