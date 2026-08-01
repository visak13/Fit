/**
 * THE BOUNDARY, tested as a boundary: what gets through, what is refused, and what was never
 * copyable in the first place.
 *
 * The leak case itself lives in `privacy.test.js`, which reads the finished report's words. This
 * suite is the layer below: it proves the narrowing refuses foreign records, counts what it refused,
 * and rebuilds a session out of the allowlist rather than cleaning one.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ATTENDED_STATUSES, PERFORMED_FIELDS_CARRIED, SESSION_FIELDS_CARRIED,
  clientIdOf, clientNameOf, narrowToClient,
} from './participation.js';
import {
  HER, SESSIONS, THE_OTHER_CLIENT, aClientRecord, aClientRecordWithEverythingOnIt,
  aHistory, stored, theNotes, thePerformed, theReadings, theSessions,
} from './testing.js';

test('a session is REBUILT from the allowlist: the roster, the summary, the routine and the link are not there', () => {
  const { sessions } = narrowToClient(HER.id, { sessions: theSessions() });

  const shared = sessions.find((session) => session.session_id === SESSIONS.shared);
  assert.ok(shared, 'the shared session is her session too, and it is in her report');

  // The KEYS are the whole assertion. Not "summary is undefined" — the field does not exist.
  assert.deepEqual(Object.keys(shared).sort(), [...SESSION_FIELDS_CARRIED, 'attended'].sort());
  for (const field of ['client_ids', 'summary', 'routine_id', 'meet_url', 'meet_source']) {
    assert.equal(Object.prototype.hasOwnProperty.call(shared, field), false,
      `${field} must never be copied out of a session record`);
  }
});

test('a session this client was not on is REFUSED, and the refusal is counted', () => {
  const someoneElses = stored('other-session', {
    routine_id: 'test-full-body',
    client_ids: [THE_OTHER_CLIENT.id],
    status: 'completed',
    mode: 'online',
    started_at: '2026-05-01T09:00:00.000Z',
  });

  const narrowed = narrowToClient(HER.id, { sessions: [...theSessions(), someoneElses] });

  assert.equal(narrowed.sessions.length, 5, 'her five, and not the sixth');
  assert.equal(narrowed.dropped.sessions, 1);
});

test("the other client's performed records and readings are refused, and counted", () => {
  const narrowed = narrowToClient(HER.id, {
    performed: thePerformed(),
    readings: theReadings(),
  });

  assert.equal(narrowed.dropped.performed, 1, 'the sled push belongs to somebody else');
  assert.equal(narrowed.dropped.readings, 1, 'so does the 90 second plank');

  assert.equal(narrowed.performed.some((row) => row.exercise_id === 'sled-push'), false);
  assert.equal(narrowed.readings.some((row) => row.value === 90), false);
});

test('NO MEASUREMENT reaches the report: a performed record arrives without its counts or its load', () => {
  const { performed } = narrowToClient(HER.id, { performed: thePerformed() });

  assert.ok(performed.length > 0, 'there is something to inspect');
  for (const row of performed) {
    assert.deepEqual(Object.keys(row).sort(), [...PERFORMED_FIELDS_CARRIED].sort());
  }

  // NON-VACUITY: the records handed in really do carry the fields that did not get through.
  const raw = thePerformed().map((record) => record.content);
  assert.ok(raw.some((content) => typeof content.repetitions === 'number'));
  assert.ok(raw.some((content) => typeof content.observed_load === 'string'));
});

test('NOTES ARE NOT CARRIED AT ALL — handing them over changes nothing', () => {
  const withNotes = narrowToClient(HER.id, { ...aHistory(), notes: theNotes() });
  const withoutNotes = narrowToClient(HER.id, { ...aHistory(), notes: undefined });

  assert.deepEqual(withNotes, withoutNotes);
  assert.equal(Object.prototype.hasOwnProperty.call(withNotes, 'notes'), false);
});

test('a tombstoned record is dropped and counted, on every collection', () => {
  const narrowed = narrowToClient(HER.id, {
    sessions: [...theSessions(), stored('gone-1', { client_ids: [HER.id], status: 'completed' }, true)],
    performed: [...thePerformed(), stored('gone-2', { client_id: HER.id, status: 'performed' }, true)],
    readings: [...theReadings(), stored('gone-3', { client_id: HER.id, kind: 'plank-hold', value: 1 }, true)],
  });

  assert.equal(narrowed.dropped.sessions, 1);
  assert.equal(narrowed.dropped.performed, 2, 'the tombstone, and the other client\'s record');
  assert.equal(narrowed.dropped.readings, 2);
});

test('everything comes back in time order, oldest first', () => {
  const narrowed = narrowToClient(HER.id, aHistory());

  for (const rows of [narrowed.sessions, narrowed.performed, narrowed.readings]) {
    const instants = rows.map((row) => row.at).filter((at) => at !== null);
    assert.deepEqual(instants, [...instants].sort(), 'ascending');
  }
});

test('a session that ran is marked attended; one that has not is not', () => {
  const { sessions } = narrowToClient(HER.id, { sessions: theSessions() });
  const ahead = sessions.find((session) => session.session_id === SESSIONS.ahead);

  assert.equal(ahead.attended, false, 'a planned session is not attendance');
  assert.equal(ahead.at, '2026-04-27T09:00:00.000Z', 'but it is on the books, at its planned time');
  assert.equal(sessions.filter((session) => session.attended).length, 4);
  assert.equal(ATTENDED_STATUSES.includes('planned'), false);
});

test('an empty client id narrows to nothing rather than to everything', () => {
  const narrowed = narrowToClient('', aHistory());

  assert.deepEqual(narrowed.sessions, []);
  assert.deepEqual(narrowed.performed, []);
  assert.deepEqual(narrowed.readings, []);
  assert.ok(narrowed.dropped.sessions > 0, 'and it says it refused them');
});

test('the client record gives up their name and identity, and NOTHING else', () => {
  assert.equal(clientNameOf(aClientRecord()), HER.name);
  assert.equal(clientIdOf(aClientRecord()), HER.id);
  assert.equal(clientNameOf(aClientRecordWithEverythingOnIt()), HER.name);
  assert.equal(clientNameOf({}), null);
  assert.equal(clientIdOf(undefined), null);
});

test('a reading with no readable value is refused rather than charted as zero', () => {
  const narrowed = narrowToClient(HER.id, {
    readings: [
      stored('r-a', { client_id: HER.id, kind: 'plank-hold', value: 40, unit: 'seconds', taken_at: '2026-03-02T09:00:00.000Z' }),
      stored('r-b', { client_id: HER.id, kind: 'plank-hold', value: 'forty', unit: 'seconds', taken_at: '2026-03-03T09:00:00.000Z' }),
      stored('r-c', { client_id: HER.id, kind: 'plank-hold', value: Number.NaN, unit: 'seconds', taken_at: '2026-03-04T09:00:00.000Z' }),
    ],
  });

  assert.equal(narrowed.readings.length, 1);
  assert.equal(narrowed.dropped.readings, 2);
});
