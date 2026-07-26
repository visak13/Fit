/**
 * THE RUNNER NO LONGER INVENTS WHERE A SESSION HAPPENED — asserted, because a removal is invisible.
 *
 * `planSession` used to write `mode: args.mode || 'online'`. That default existed for one reason:
 * nothing in the interface could ask the coach, so something had to be written. The calendar screen
 * is now that caller and asks him every time, so the default has been removed — and a removal is
 * precisely the kind of change nothing reports. Nobody grepping for it later would know whether it
 * went deliberately or was never there, and re-adding it would look like a kindness.
 *
 * ## Why the assertion is about the RECORD refusing rather than the runner throwing
 *
 * There is no check in the runner and there must not be one. `core/model/entities/session.js`
 * already declares `mode` required over a frozen two-value vocabulary, and `store.create` runs it.
 * A second check in the runner would be a second rule with the same job, free to drift from the
 * first the day either is edited. So the loud failure is the record's, and this file proves the
 * caller's omission actually reaches it.
 *
 * ## The positive control is half this file
 *
 * A test that only shows the refusal proves nothing about the removal: a runner that still defaulted
 * would fail this test in the same way as one whose store was simply broken. So both directions are
 * asserted in the same run — an omitted mode is REFUSED naming `content.mode`, and both permitted
 * values are WRITTEN THROUGH unchanged. If the fallback ever comes back, the first goes red while
 * the second stays green, which is the shape that names the cause rather than the symptom.
 *
 *     npm test
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { planSession, startSession } from './live-session.js';
import { aFurnishedStore, T } from './testing.js';

test('a caller that does not say where the session happened is refused BY THE RECORD', async () => {
  const { store, routine, clientIds } = await aFurnishedStore();

  await assert.rejects(
    // Exactly the shape of a caller that forgot to ask the coach. Before the fallback was removed
    // this wrote `online` and committed, and a session held in a room was on record as a call.
    () => planSession(store, {
      routineId: routine.content.id, clientIds, now: T.plan,
    }),
    (error) => {
      assert.equal(error.name, 'StoreValidationError');
      const mode = error.issues.find((issue) => issue.path === 'content.mode');
      assert.ok(
        mode !== undefined,
        `the write was refused, but not for the missing mode: ${JSON.stringify(error.issues)}`,
      );
      assert.equal(mode.code, 'REQUIRED');
      return true;
    },
  );

  await store.close();
});

test('both answers the coach can give are written through exactly as given', async () => {
  const { store, routine, clientIds } = await aFurnishedStore();

  const online = await planSession(store, {
    routineId: routine.content.id, clientIds, mode: 'online', now: T.plan,
  });
  assert.equal(online.content.mode, 'online');

  const inPerson = await planSession(store, {
    routineId: routine.content.id, clientIds, mode: 'in_person', now: T.plan,
  });
  assert.equal(inPerson.content.mode, 'in_person');

  await store.close();
});

test('an in-person session started through the runner carries no link and no link origin', async () => {
  const { store, routine, clientIds } = await aFurnishedStore();

  const opened = await startSession(store, {
    routineId: routine.content.id, clientIds, mode: 'in_person', routine, now: T.start,
  });
  assert.equal(opened.ok, true);

  // In person means no calendar event and no meeting link AT ALL. The record refuses one that has
  // them, so this is the whole of the promise: nothing remote was created, so nothing was stored.
  const stored = await store.get('session', opened.session.sessionId);
  assert.equal(stored.content.mode, 'in_person');
  assert.equal(stored.content.meet_url, undefined);
  assert.equal(stored.content.meet_source, undefined);

  await opened.session.detach();
  await store.close();
});
