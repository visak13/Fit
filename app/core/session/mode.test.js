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

/**
 * THE JOINING LINK WRITTEN ONTO A SESSION THAT IS ALREADY RUNNING.
 *
 * A link the coach pasted travels with the session's creation. A MINTED one cannot: the identifier
 * that makes a retry idempotent is derived from the session's own record id, which does not exist
 * until the session does. So it arrives second, through the handle that holds the lease.
 *
 * The runner knows nothing about who minted it. `source` is one of the record's own `MEET_SOURCES`
 * and this layer has no opinion about which — the core is provider-neutral, and nothing under
 * `core/` may learn that one of the two ways of getting a link involves a calendar.
 */
test('a joining link is written onto a running session, with its origin', async () => {
  const { store, routine, clientIds } = await aFurnishedStore();
  const opened = await startSession(store, {
    routineId: routine.content.id, clientIds, mode: 'online', routine, now: T.start,
  });

  await opened.session.recordJoiningLink('https://meet.example.test/tst-abc-def', 'minted');

  const stored = await store.get('session', opened.session.sessionId);
  assert.equal(stored.content.meet_url, 'https://meet.example.test/tst-abc-def');
  assert.equal(stored.content.meet_source, 'minted');

  await opened.session.detach();
  await store.close();
});

/**
 * WRITING THE SAME LINK TWICE IS NOTHING, and that is the idempotent retry arriving intact.
 *
 * A retry sends the identifier it sent before and gets the conference it already made, so recording
 * the link the session already has must be a no-op. Turning it into a refusal would make a
 * successful retry look like a fault at the start of a session.
 */
test('recording the link a session already has is a no-op, not a refusal', async () => {
  const { store, routine, clientIds } = await aFurnishedStore();
  const opened = await startSession(store, {
    routineId: routine.content.id, clientIds, mode: 'online', routine, now: T.start,
  });

  await opened.session.recordJoiningLink('https://meet.example.test/tst-abc-def', 'minted');
  await opened.session.recordJoiningLink('https://meet.example.test/tst-abc-def', 'minted');

  const stored = await store.get('session', opened.session.sessionId);
  assert.equal(stored.content.meet_url, 'https://meet.example.test/tst-abc-def');

  await opened.session.detach();
  await store.close();
});

/**
 * A DIFFERENT LINK IS REFUSED LOUDLY, because absorbing it is the silent failure.
 *
 * Something minted a SECOND meeting, or is about to overwrite a link the coach pasted himself.
 * Either way the session would quietly start pointing somewhere else, and the first person to find
 * out would be a client sitting in an empty call.
 */
test('a SECOND, different link is refused rather than replacing the one the session has', async () => {
  const { store, routine, clientIds } = await aFurnishedStore();
  const opened = await startSession(store, {
    routineId: routine.content.id,
    clientIds,
    mode: 'online',
    meetUrl: 'https://meet.example.test/tst-his-own',
    meetSource: 'pasted',
    routine,
    now: T.start,
  });

  await assert.rejects(
    () => opened.session.recordJoiningLink('https://meet.example.test/tst-somewhere-else', 'minted'),
    (error) => {
      assert.equal(error.name, 'SessionStateError');
      assert.equal(error.detail.held, 'pasted');
      return true;
    },
  );

  const stored = await store.get('session', opened.session.sessionId);
  assert.equal(stored.content.meet_url, 'https://meet.example.test/tst-his-own');
  assert.equal(stored.content.meet_source, 'pasted');

  await opened.session.detach();
  await store.close();
});

/**
 * AND IN PERSON STILL CREATES NOTHING, even by this door.
 *
 * The runner writes no second copy of that rule — `core/model/entities/session.js` owns it and
 * `store.update` runs it — so what is proved here is that the omission REACHES the record. A guard
 * duplicated in the runner would be a second rule free to drift from the first.
 */
test('a link written onto an in-person session is refused BY THE RECORD', async () => {
  const { store, routine, clientIds } = await aFurnishedStore();
  const opened = await startSession(store, {
    routineId: routine.content.id, clientIds, mode: 'in_person', routine, now: T.start,
  });

  await assert.rejects(
    () => opened.session.recordJoiningLink('https://meet.example.test/tst-abc-def', 'minted'),
    (error) => {
      assert.equal(error.name, 'StoreValidationError');
      assert.ok(
        error.issues.some((issue) => issue.path === 'content.meet_url'),
        `refused, but not for the link on an in-person session: ${JSON.stringify(error.issues)}`,
      );
      return true;
    },
  );

  const stored = await store.get('session', opened.session.sessionId);
  assert.equal(stored.content.meet_url, undefined);

  await opened.session.detach();
  await store.close();
});
