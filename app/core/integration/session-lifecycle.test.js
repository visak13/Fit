/**
 * A WHOLE SESSION, END TO END, ACROSS EVERY STRAND — including the interruption.
 *
 * This is the thing the coach actually does, and it crosses six module boundaries on the way:
 * he registers a client whose clinical note is encrypted before it touches the store, runs a
 * session against a shipped routine capturing readings and notes, is interrupted partway, reopens
 * the application, resumes exactly where he left off, finishes, and every one of those facts
 * reaches the remote copy through the durable queue.
 *
 * Each strand proved its own half of that and none of them could prove the join. The session
 * strand proved a cut resumes; it did not prove the resumed facts SYNCHRONISE. The sync strand
 * proved records reach the remote copy; it did not prove the ones a resumed session appended are
 * among them, nor that a ciphertext field survives the round trip still sealed. The joins are
 * where an integration is either real or a hopeful diagram.
 *
 * The second test is the same flow with the credential dead throughout, which is the state the
 * design is built around: roughly one-hour foreground-only access tokens and no refresh token at
 * all, so an expired credential is not an exceptional case, it is Tuesday.
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { openField } from '../crypto/sealing.js';
import { openSession, readSession, resumableSessions, startSession } from '../session/live-session.js';
import { clientViewOf } from '../session/projection.js';
import { recordCompletedSync } from '../status/completion.js';
import { accountabilityStatus } from '../status/surface.js';
import { readUnion } from '../sync/areas.js';
import { SYNC_TRIGGERS } from '../sync/engine.js';
import { aPractice, aShippedRoutine, registerClientWithNote, restart, sync, SPACE } from './testing.js';

const CLIENT_NAME = 'Test Client Alpha';
const CLINICAL_NOTE = 'MARKER-CLINICAL-4c81: knee reconstruction 2019, avoid deep squats.';

/** Everything about this client's session that must be identical before and after the cut. */
function whatHappened(view, clientId) {
  const client = clientViewOf(view, clientId);
  return {
    status: view.status,
    order_as_run: client.order_as_run,
    readings: client.readings.map((r) => `${r.content.kind}=${r.content.value}`).sort(),
    notes: client.notes.map((n) => n.content.text).sort(),
  };
}

/** Every record now in the remote copy's device areas, by identity. */
async function recordsInRemote(world) {
  const union = await readUnion(world.remote, { space: SPACE });
  return union.records;
}

describe('integration — a session, an interruption, and the queue that carries it out', () => {
  it('registers, runs, is cut off, resumes exactly, finishes, and reaches the remote copy intact', async () => {
    const world = aPractice();
    after(() => world.close());
    const laptop = await world.signedInDevice('coach-laptop');

    // ── register, with the clinical note sealed before it reaches the store ──────────────────
    const { clientId } = await registerClientWithNote(laptop, world, {
      name: CLIENT_NAME, note: CLINICAL_NOTE, label: 'Notes A',
    });
    const routine = await aShippedRoutine(laptop.store);

    // ── run the first half of the session ───────────────────────────────────────────────────
    const started = await startSession(laptop.store, {
      routineId: routine.content.id, clientIds: [clientId], routine, now: world.now(),
    });
    const sessionId = started.session.sessionId;
    const first = routine.content.entries[0].exercise_id;
    const second = routine.content.entries[1].exercise_id;

    world.advance(5 * 60_000);
    await started.session.recordPerformed(clientId, {
      exerciseId: first, sets: 3, repetitions: 12, recordedAt: world.now(), now: world.now(),
    });
    world.advance(4 * 60_000);
    await started.session.recordReading(clientId, {
      kind: 'heart-rate', value: 132, takenAt: world.now(), now: world.now(),
    });
    world.advance(60_000);
    await started.session.recordNote({
      text: 'Slower on the second set.', clientId, takenAt: world.now(), now: world.now(),
    });

    const before = whatHappened(await started.session.refresh(), clientId);
    assert.equal(before.order_as_run.length, 1);

    // ── the interruption. Nothing is told about it; the application simply stops. ────────────
    // Not `interrupt()` — a power cut does not get to call anything. Dropping the store and
    // opening a new one on the same database is exactly what the device is left holding.
    world.advance(45 * 60_000);
    await restart(laptop);

    const resumable = await resumableSessions(laptop.store);
    assert.equal(resumable.length, 1, 'the unfinished session is offered back rather than lost');
    assert.equal(resumable[0].record_id, sessionId);

    // ── reopen and resume ───────────────────────────────────────────────────────────────────
    const reopened = await openSession(laptop.store, sessionId, { routine, now: world.now() });
    assert.equal(reopened.ok, true, 'the session reopens');
    const after_ = whatHappened(await reopened.session.refresh(), clientId);
    assert.deepEqual(after_, before, 'resumed EXACTLY: nothing lost, nothing invented');

    // ── carry on and finish ─────────────────────────────────────────────────────────────────
    world.advance(5 * 60_000);
    await reopened.session.recordPerformed(clientId, {
      exerciseId: second, sets: 3, repetitions: 10, recordedAt: world.now(), now: world.now(),
    });
    world.advance(60_000);
    await reopened.session.recordReading(clientId, {
      kind: 'heart-rate', value: 118, takenAt: world.now(), now: world.now(),
    });
    await reopened.session.complete({ now: world.now() });

    const finished = await readSession(laptop.store, sessionId);
    assert.equal(finished.status, 'completed', 'the session is finished, not merely abandoned');

    const finalView = whatHappened(await reopened.session.refresh(), clientId);
    assert.deepEqual(finalView.order_as_run, [first, second],
      'the continuation was APPENDED to what happened before the cut, in the order it was run');
    assert.equal(finalView.readings.length, 2, 'both readings survive — one either side of the cut');

    // ── it all reaches the remote copy ──────────────────────────────────────────────────────
    const report = await sync(laptop, world, SYNC_TRIGGERS.OPEN);
    assert.deepEqual(report.failures, [], 'nothing failed on the way out');
    assert.ok(report.completion, 'a completion is only claimed when the queue genuinely drained');

    const remote = await recordsInRemote(world);
    const byType = (type) => [...remote.values()].filter((r) => r.type === type && !r.deleted);

    assert.equal(byType('session').length, 1, 'the session reached the remote copy');
    assert.equal(byType('reading').filter((r) => r.content.session_id === sessionId).length, 2,
      'BOTH readings reached it — the one recorded before the cut and the one after');
    assert.equal(byType('performed-record').filter((r) => r.content.session_id === sessionId).length, 2,
      'and both performed records, including the one appended after resuming');
    assert.equal(byType('session-note').filter((r) => r.content.session_id === sessionId).length, 1);

    // ── NOTHING DUPLICATED, which the flow above is precisely the shape to cause ────────────
    // A resumed session replays its journal; a queue that is flushed twice re-sends. Either one
    // duplicating would produce two of a fact the coach recorded once, and a duplicated reading is
    // a duplicated data point on a progress chart he uses to make decisions.
    const secondPass = await sync(laptop, world, SYNC_TRIGGERS.MANUAL);
    assert.deepEqual(secondPass.failures, []);
    const after2 = await recordsInRemote(world);
    assert.equal(after2.size, remote.size,
      'a second synchronisation adds nothing: the remote copy is keyed by record identity, and a '
      + 'resumed session appends to one record rather than making a second');

    const sessionRecords = [...after2.values()].filter((r) => r.type === 'session');
    assert.equal(sessionRecords.length, 1, 'exactly one session record, not one per resumption');

    // ── and the clinical note is still CIPHERTEXT out there, and still opens ────────────────
    const clientOut = [...after2.values()].find((r) => r.record_id === clientId);
    assert.equal(typeof clientOut.content.clinical_note, 'object',
      'the note left this device sealed and is sealed in the remote copy');
    assert.equal(typeof clientOut.content.clinical_note.ct, 'string');
    assert.ok(!JSON.stringify(clientOut).includes('avoid deep squats'),
      'the plaintext is nowhere in what was sent');

    const opened = await openField(
      laptop.dataKey, { type: 'client', recordId: clientId, field: 'clinical_note' },
      clientOut.content.clinical_note,
    );
    assert.equal(opened, CLINICAL_NOTE, 'and it still opens with this installation key');
  });

  it('an expired credential never blocks the work, is named specifically, and drains without duplicating', async () => {
    const world = aPractice();
    after(() => world.close());
    const laptop = await world.signedInDevice('coach-laptop');

    const { clientId } = await registerClientWithNote(laptop, world, {
      name: 'Test Client Beta', note: 'MARKER-CLINICAL-77ab: shoulder impingement.',
    });
    const routine = await aShippedRoutine(laptop.store);

    // The credential dies before the session and stays dead throughout it.
    world.adversity.expireCredential();

    const started = await startSession(laptop.store, {
      routineId: routine.content.id, clientIds: [clientId], routine, now: world.now(),
    });
    const sessionId = started.session.sessionId;

    for (const entry of routine.content.entries.slice(0, 3)) {
      world.advance(4 * 60_000);
      // eslint-disable-next-line no-await-in-loop
      await started.session.recordPerformed(clientId, {
        exerciseId: entry.exercise_id, sets: 3, repetitions: 10,
        recordedAt: world.now(), now: world.now(),
      });
    }
    world.advance(60_000);
    await started.session.recordReading(clientId, {
      kind: 'heart-rate', value: 141, takenAt: world.now(), now: world.now(),
    });
    await started.session.complete({ now: world.now() });

    // ── EVERYTHING SAVED LOCALLY. The dead credential reached nothing that matters here. ────
    const stored = await readSession(laptop.store, sessionId);
    assert.equal(stored.status, 'completed',
      'the session finished normally: a dead credential is a delay on the way out, never a '
      + 'refusal on the way in');
    const view = clientViewOf(await started.session.refresh(), clientId);
    assert.equal(view.order_as_run.length, 3);
    assert.equal(view.readings.length, 1);

    // ── the attempt fails, and it fails LOUDLY and SPECIFICALLY ────────────────────────────
    const blocked = await sync(laptop, world, SYNC_TRIGGERS.OPEN);
    assert.equal(blocked.completion, null,
      'no completion is manufactured from a pass that did not deliver — the surface must never '
      + 'report a synchronisation that did not happen');

    const status = await accountabilityStatus(laptop.store, {
      now: world.now(), last_attempt: blocked, credential: { present: true, expired: true },
    });
    assert.equal(status.blocks_application, false,
      'the ladder tops out at a persistent warning; the application always opens');
    assert.ok(status.undelivered > 0, 'the pending count is visible and non-zero');
    assert.ok(status.never_synchronised, 'and it says plainly that nothing has ever reached the copy');
    const reasonText = JSON.stringify(status.reasons ?? status);
    assert.match(reasonText, /credential/i,
      'the reason names the credential specifically rather than showing a spinner');

    // ── the credential returns, and the queue drains without duplicating ────────────────────
    const undeliveredBefore = status.undelivered;
    world.advance(30 * 60_000);
    world.adversity.renewCredential();

    const drained = await sync(laptop, world, SYNC_TRIGGERS.OPEN);
    assert.deepEqual(drained.failures, []);
    assert.ok(drained.completion, 'now, and only now, is a completion claimed');

    // A JOIN NO STRAND OWNS, and worth naming because it is the sort of wire that gets left out.
    // The engine RETURNS a completion; the surface reads a PERSISTED one and will not accept a
    // caller's word for it. Somebody has to carry the report from one to the other, and that
    // somebody is whatever calls `syncNow` — the interface step. Persisting only a completion that
    // was actually earned is what makes "last backed up" a fact rather than a hopeful label.
    const persisted = await recordCompletedSync(laptop.store, drained, { now: world.now() });
    assert.equal(persisted.recorded, true);
    assert.equal(
      (await recordCompletedSync(laptop.store, blocked, { now: world.now() })).recorded, false,
      'and the failed pass from earlier still records nothing, so a dead credential can never '
      + 'advance the last-backed-up time',
    );

    const after_ = await accountabilityStatus(laptop.store, { now: world.now(), last_attempt: drained });
    assert.equal(after_.undelivered, 0, `all ${undeliveredBefore} undelivered entries went out`);
    assert.equal(after_.never_synchronised, false);

    const remote = await recordsInRemote(world);
    const sessions = [...remote.values()].filter((r) => r.type === 'session');
    const performed = [...remote.values()].filter(
      (r) => r.type === 'performed-record' && r.content.session_id === sessionId,
    );
    assert.equal(sessions.length, 1, 'one session, not one per failed attempt');
    assert.equal(performed.length, 3,
      'three performed records, not six: an entry held for a credential is retried, and a retry '
      + 'of a delivery that already landed is recognised rather than repeated');

    const again = await sync(laptop, world, SYNC_TRIGGERS.MANUAL);
    assert.deepEqual(again.failures, []);
    assert.equal((await recordsInRemote(world)).size, remote.size, 'and still nothing duplicates');
  });
});
