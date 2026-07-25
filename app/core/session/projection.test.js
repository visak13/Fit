/**
 * THE PROJECTION IS PURE, AND THAT IS WHY RESUMING IS EXACT.
 *
 * These tests hand `projectSession` a journal directly — no database, no clock, no store — because
 * the claim being made about it is a claim about a function: the same record always yields the same
 * view. Resume is a replay of the record, so if replay is deterministic then resuming is exact by
 * construction rather than by a save routine having remembered to run.
 *
 * The suite that drives it through a real store and a real interruption is `durability.test.js`.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { aRoutine } from '../model/fixtures.js';
import { projectSession, resumeStateOf, RESUMABLE_STATUSES } from './projection.js';
import { EXERCISES, T } from './testing.js';

const CLIENT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SESSION = '33333333-3333-4333-8333-333333333333';

/** A stored envelope, built by hand: these tests never touch a store. */
const envelope = (type, content, recordId) => ({
  record_id: recordId, type, rev: 1, device: 'coach-laptop',
  created_at: T.start, updated_at: T.start, deleted: false, content,
});

const aSessionRecord = (over = {}) => envelope('session', {
  routine_id: 'test-full-session',
  client_ids: [CLIENT],
  status: 'in_progress',
  started_at: T.start,
  ...over,
}, SESSION);

const aRoutineRecord = () => envelope('routine', aRoutine({
  id: 'test-full-session',
  entries: [
    { exercise_id: EXERCISES.push, sets: 3, repetitions: 12 },
    { exercise_id: EXERCISES.plank, sets: 3, duration_seconds: 40 },
    { exercise_id: EXERCISES.row, sets: 4, repetitions: 10 },
  ],
}), 'routine-1');

const performed = (over, id) => envelope('performed-record', {
  session_id: SESSION, client_id: CLIENT, exercise_id: EXERCISES.push,
  position: 0, status: 'performed', recorded_at: T.one, ...over,
}, id);

/** @param {any[]} records @param {any} [session] */
const aJournal = (records, session = aSessionRecord()) => ({
  session,
  performed: { [CLIENT]: records },
  readings: { [CLIENT]: [] },
  notes: { [CLIENT]: [] },
  sessionNotes: [],
  recordCount: records.length,
});

test('the same journal projects to the same view, every time', () => {
  const journal = aJournal([
    performed({ position: 0, recorded_at: T.one, observed_load: '20kg' }, 'p1'),
    performed({ position: 1, exercise_id: EXERCISES.row, recorded_at: T.two }, 'p2'),
  ]);
  const context = { routine: aRoutineRecord() };

  const once = projectSession(journal, context);
  const twice = projectSession(journal, context);

  assert.deepEqual(twice, once, 'no clock, no counter, no memory between calls');
});

test('the order the facts arrive in does not change the view', () => {
  const a = performed({ position: 0, recorded_at: T.one }, 'p1');
  const b = performed({ position: 1, exercise_id: EXERCISES.plank, recorded_at: T.two }, 'p2');
  const c = performed({ position: 2, exercise_id: EXERCISES.row, recorded_at: T.three }, 'p3');
  const context = { routine: aRoutineRecord() };

  const forwards = projectSession(aJournal([a, b, c]), context);
  const backwards = projectSession(aJournal([c, b, a]), context);

  assert.deepEqual(backwards, forwards,
    'the session ran in the order the positions say, however the records came back');
  assert.deepEqual(forwards.clients[0].order_as_run,
    [EXERCISES.push, EXERCISES.plank, EXERCISES.row]);
});

test('a deleted record is not part of what happened', () => {
  const alive = performed({ position: 0 }, 'p1');
  const dead = { ...performed({ position: 1, exercise_id: EXERCISES.row }, 'p2'), deleted: true, content: null };

  const view = projectSession(aJournal([alive, dead]), { routine: aRoutineRecord() });
  assert.equal(view.clients[0].counts.performed, 1);
  assert.deepEqual(view.clients[0].order_as_run, [EXERCISES.push]);
});

test('without the routine, the view still says everything that HAPPENED', () => {
  // A routine the coach has since deleted must not erase the history of a session that used it.
  const view = projectSession(aJournal([
    performed({ position: 0, observed_load: '20kg' }, 'p1'),
  ]), {});

  assert.deepEqual(view.clients[0].plan, [], 'the plan is unknown, which is honest');
  assert.deepEqual(view.clients[0].order_as_run, [EXERCISES.push]);
  assert.deepEqual(view.clients[0].loads,
    [{ exercise_id: EXERCISES.push, observed_load: '20kg', recorded_at: T.one }]);
  assert.deepEqual(view.clients[0].beyond_the_routine, [EXERCISES.push]);
});

test('the append position is one past the highest recorded, and is derived rather than stored', () => {
  const empty = projectSession(aJournal([]), { routine: aRoutineRecord() });
  assert.equal(empty.clients[0].append_position, 0);

  const some = projectSession(aJournal([
    performed({ position: 0 }, 'p1'),
    performed({ position: 7, exercise_id: EXERCISES.row }, 'p2'),
  ]), { routine: aRoutineRecord() });
  assert.equal(some.clients[0].append_position, 8,
    'a gap in the positions is not a hole to fill — the next fact goes after the last one');
});

test('a client with nothing recorded still appears, with nothing recorded', () => {
  const journal = {
    session: aSessionRecord({ client_ids: [CLIENT, OTHER] }),
    performed: { [CLIENT]: [performed({ position: 0 }, 'p1')], [OTHER]: [] },
    readings: { [CLIENT]: [], [OTHER]: [] },
    notes: { [CLIENT]: [], [OTHER]: [] },
    sessionNotes: [],
    recordCount: 1,
  };
  const view = projectSession(journal, { routine: aRoutineRecord() });

  assert.equal(view.counts.clients, 2);
  assert.equal(view.clients[1].client_id, OTHER);
  assert.deepEqual(view.clients[1].not_yet_recorded,
    [EXERCISES.push, EXERCISES.plank, EXERCISES.row],
    'somebody who is here and has not done anything yet is not somebody who is missing');
});

test('every resumable status is treated as resumable, and a partial record stays a record', () => {
  for (const status of RESUMABLE_STATUSES) {
    const view = projectSession(aJournal([performed({}, 'p1')], aSessionRecord({ status })));
    assert.equal(view.is_resumable, true, `${status} can be picked up`);
    assert.equal(view.is_partial_record, true, `${status} holds what happened`);
    assert.equal(resumeStateOf(view).recorded, 1);
  }

  const finished = projectSession(
    aJournal([performed({}, 'p1')], aSessionRecord({ status: 'completed', ended_at: T.end })),
  );
  assert.equal(finished.is_resumable, false);
  assert.equal(finished.is_partial_record, false);
  assert.equal(finished.is_live, false);
});

test('the view reports how many records it was built from, as a number', () => {
  const view = projectSession(aJournal([
    performed({ position: 0 }, 'p1'), performed({ position: 1 }, 'p2'),
  ]));
  assert.equal(view.replayed_records, 2,
    'a resume that says nothing about how much it replayed cannot be checked, only believed');
});
