/**
 * THE PREVIOUS SESSION AT A GLANCE — and the progression that must NOT be there.
 *
 * When the coach starts a session the app shows the previous one: the exercises performed, any loads
 * recorded and the readings taken, so progress can be monitored across sessions. It SHOWS. There is
 * no automatic week-over-week progression anywhere: the app never suggests a heavier load, a longer
 * hold or more repetitions, because that judgement belongs to the certified professional who is also
 * adapting to a client's medical history.
 *
 * The absence is asserted rather than assumed. An absent feature and a forgotten one look identical
 * to the next editor, and this is the screen where adding one would feel most helpful.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { previousSessionAtAGlance } from './glance.js';
import { startSession } from './live-session.js';
import { aFurnishedStore, EXERCISES, T } from './testing.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * One completed session for the client, with a load and a reading in it.
 * @param {any} store @param {any} routine @param {string[]} clientIds
 * @param {{load: string, hr: number, at: string}} detail
 */
async function aSessionThatHappened(store, routine, clientIds, detail) {
  const opened = await startSession(store, {
    routineId: routine.content.id, clientIds, routine, now: detail.at,
  });
  await opened.session.recordPerformed(clientIds[0], {
    exerciseId: EXERCISES.push, sets: 3, repetitions: 12, observedLoad: detail.load,
    recordedAt: detail.at, now: detail.at,
  });
  await opened.session.recordSkipped(clientIds[0], EXERCISES.row, {
    note: 'Ran out of time.', recordedAt: detail.at, now: detail.at,
  });
  await opened.session.recordReading(clientIds[0], {
    kind: 'heart-rate', value: detail.hr, takenAt: detail.at, now: detail.at,
  });
  await opened.session.recordNote({
    text: 'Good session.', clientId: clientIds[0], takenAt: detail.at, now: detail.at,
  });
  await opened.session.complete({ now: detail.at });
  return opened.session.sessionId;
}

test('the panel shows the exercises performed, the loads and the readings', async () => {
  const { store, routine, clientIds } = await aFurnishedStore();
  await aSessionThatHappened(store, routine, clientIds, { load: '20kg', hr: 138, at: T.start });

  const glance = await previousSessionAtAGlance(store, clientIds[0]);

  assert.equal(glance.status, 'completed');
  assert.equal(glance.partial_record, false);
  assert.deepEqual(glance.performed.map((row) => [row.exercise_id, row.status]), [
    [EXERCISES.push, 'performed'],
    [EXERCISES.row, 'skipped'],
  ], 'what he did, in the order he did it — including what he skipped');
  assert.deepEqual(glance.loads, [
    { exercise_id: EXERCISES.push, observed_load: '20kg', recorded_at: T.start },
  ]);
  assert.deepEqual(glance.readings, [
    { kind: 'heart-rate', value: 138, unit: 'bpm', taken_at: T.start, note: null },
  ]);
  assert.deepEqual(glance.notes, [{ text: 'Good session.', taken_at: T.start }]);

  await store.close();
});

test('starting a session shows the one BEFORE it, not the one he is looking at', async () => {
  const { store, routine, clientIds } = await aFurnishedStore();
  await aSessionThatHappened(store, routine, clientIds, { load: '20kg', hr: 138, at: T.start });

  const opened = await startSession(store, {
    routineId: routine.content.id, clientIds, routine, now: T.back,
  });

  const glance = await previousSessionAtAGlance(store, clientIds[0], {
    excludeSessionId: opened.session.sessionId,
  });
  assert.equal(glance.started_at, T.start, 'the last one that happened');
  assert.deepEqual(glance.loads.map((l) => l.observed_load), ['20kg']);

  await store.close();
});

test('an interrupted session is still the previous session, and says that it did not finish', async () => {
  const { store, routine, clientIds } = await aFurnishedStore();
  const opened = await startSession(store, {
    routineId: routine.content.id, clientIds, routine, now: T.start,
  });
  await opened.session.recordPerformed(clientIds[0], {
    exerciseId: EXERCISES.push, sets: 2, repetitions: 8, observedLoad: '15kg',
    recordedAt: T.one, now: T.one,
  });
  await opened.session.interrupt({ now: T.cut });

  const glance = await previousSessionAtAGlance(store, clientIds[0]);
  assert.equal(glance.status, 'interrupted');
  assert.equal(glance.partial_record, true,
    'hiding a half-finished session would lose the last thing that actually happened');
  assert.deepEqual(glance.loads.map((l) => l.observed_load), ['15kg']);

  await store.close();
});

test('a client with no history gets null, not an empty panel that reads like a fault', async () => {
  const { store, clientIds } = await aFurnishedStore();
  assert.equal(await previousSessionAtAGlance(store, clientIds[0]), null);
  await store.close();
});

test('NOTHING here progresses a routine, suggests a load, or compares two sessions', async () => {
  const { store, routine, clientIds } = await aFurnishedStore();
  await aSessionThatHappened(store, routine, clientIds, { load: '20kg', hr: 130, at: T.start });
  await aSessionThatHappened(store, routine, clientIds, { load: '22kg', hr: 128, at: T.back });

  const glance = await previousSessionAtAGlance(store, clientIds[0]);

  // The panel is the LAST session, verbatim. It carries no comparison with the one before it, no
  // direction of travel, and no proposal for the session about to start.
  const keys = Object.keys(glance);
  const forbidden = /suggest|propose|recommend|progress(ion)?|increase|next_|target|goal|delta|trend|improve/i;
  assert.deepEqual(keys.filter((key) => forbidden.test(key)), [],
    'the app is a supporting role: it tracks what happened, it does not decide what happens next');
  assert.deepEqual(glance.loads.map((l) => l.observed_load), ['22kg'],
    'the load shown is the one he observed, exactly as he wrote it');

  // And the module itself names no such thing, so the absence cannot be quietly filled in later.
  const source = readFileSync(join(HERE, 'glance.js'), 'utf8');
  const code = source.slice(source.indexOf('*/') + 2);
  for (const word of ['suggest', 'recommend', 'autoProgress', 'progression', 'increase']) {
    assert.ok(!code.includes(word),
      `"${word}" appears in glance.js — a progression here would make the app the driver`);
  }

  await store.close();
});
