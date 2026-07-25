/**
 * DELETING A CLIENT, AND RESETTING THE LIBRARY — the two destructive things the coach can do.
 *
 * Both have the same dangerous shape, and it is the shape this build has met more often than any
 * other: the screen says the thing happened, nothing errors, and the wrong outcome arrives LATER
 * than the action that caused it, so it does not look like a consequence of it at all.
 *
 *   - A delete written as an ABSENCE rather than as a tombstone is undone by the next pull, and the
 *     client comes back from the dead with no error anywhere.
 *   - A reset written at the same or a lower revision LOSES the sync race, and the coach's edits
 *     come straight back a minute later, which reads exactly like the button not working.
 *
 * Each strand proved its own rule. What no strand proved is that the rules hold TOGETHER through a
 * real round trip against a second device — and, for the reset, that they hold on the function the
 * application actually calls.
 *
 * ## The committed test that proves the right rule about the WRONG FUNCTION
 *
 * There is already a passing test for the reset revision rule, and it exercises the sync engine's
 * `replaceRecords()` — which NO CALLER in this application invokes. The reset the coach presses is
 * `resetToDefaults` in `core/seed/reset.js`, and it honours the same rule by a different mechanism.
 * A green test pointed at dead code is worse than no test: it is not merely absent, it is present,
 * passing, and actively buying confidence in a path nothing runs. Every reset assertion below goes
 * through `resetToDefaults` for that reason.
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { aClient, aSession } from '../model/fixtures.js';
import { UNRESOLVED, PAYLOAD, readPayload } from '../outbox/scrub.js';
import { keyedName } from '../outbox/entry.js';
import { enqueue, getEntry } from '../outbox/queue.js';
import { seedContentFor } from '../seed/content.js';
import { resetToDefaults } from '../seed/reset.js';
import { shippedSubstitutionPool } from '../seed/import.js';
import { accountabilityStatus } from '../status/surface.js';
import { readUnion } from '../sync/areas.js';
import { SYNC_TRIGGERS } from '../sync/engine.js';
import { deletionForClient, purgeClient } from '../store/purge.js';
import { aPractice, sync, SPACE } from './testing.js';

const DEPARTED = 'Test Client Departing';
const STAYING = 'Test Client Staying';

/** Every live record in the remote copy's device areas. */
async function remoteRecords(world) {
  const union = await readUnion(world.remote, { space: SPACE });
  return [...union.records.values()];
}

describe('integration — a deleted client leaves, and the people they trained with do not', () => {
  it('propagates the deletion to the remote copies while the shared session keeps the other attendee intact', async () => {
    const world = aPractice();
    after(() => world.close());
    const laptop = await world.signedInDevice('coach-laptop');
    const phone = await world.signedInDevice('coach-phone', { seed: false });

    const departing = await laptop.store.create('client', aClient({ name: DEPARTED }), { now: world.now() });
    const staying = await laptop.store.create('client', aClient({ name: STAYING }), { now: world.now() });

    // One session they attended together, and one the departing client had alone.
    const shared = await laptop.store.create('session', aSession({
      routine_id: seedContentFor('routine')[0].id,
      client_ids: [departing.record_id, staying.record_id],
      status: 'completed',
      started_at: world.now(),
      ended_at: world.now(),
    }), { now: world.now() });
    const solo = await laptop.store.create('session', aSession({
      routine_id: seedContentFor('routine')[0].id,
      client_ids: [departing.record_id],
      status: 'completed',
      started_at: world.now(),
      ended_at: world.now(),
    }), { now: world.now() });

    await sync(laptop, world, SYNC_TRIGGERS.OPEN);
    world.advance(60_000);
    await sync(phone, world, SYNC_TRIGGERS.OPEN);
    assert.equal(await phone.store.count('client'), 2, 'both clients reached the second device');

    // ── the coach deletes the departing client ──────────────────────────────────────────────
    world.advance(60_000);
    const manifest = await purgeClient(laptop.store, departing.record_id, { now: world.now() });
    assert.equal(manifest.status, 'pending', 'a deletion is recorded as work to propagate, not as a wish');
    assert.ok(manifest.removed.some((r) => r.record_id === solo.record_id),
      'the session nobody else was in is removed outright');
    assert.ok(manifest.revised.some((r) => r.record_id === shared.record_id),
      'the shared session is REVISED, not removed: it is somebody else\'s history too');

    // ── and it genuinely reaches the remote copies ──────────────────────────────────────────
    // Two passes: the first pushes and compacts, and compaction is what physically rewrites this
    // device's area without the departed records in it.
    await sync(laptop, world, SYNC_TRIGGERS.MANUAL);
    world.advance(60_000);
    const propagated = await sync(laptop, world, SYNC_TRIGGERS.MANUAL);

    const settled = await deletionForClient(laptop.store, departing.record_id);
    assert.equal(settled?.status, 'propagated',
      'the manifest is only marked propagated after the area was READ BACK and confirmed clear — '
      + 'a claim of deletion verified by re-reading rather than by having sent something');
    assert.deepEqual(propagated.deletions.still_present, []);

    const out = await remoteRecords(world);
    const names = out.filter((r) => r.type === 'client' && !r.deleted).map((r) => r.content.name);
    assert.deepEqual(names, [STAYING], 'the departed client is gone from the remote copy');
    assert.ok(!JSON.stringify(out).includes(DEPARTED),
      'and their name appears NOWHERE in what the remote copy holds');

    const sharedOut = out.find((r) => r.record_id === shared.record_id);
    assert.ok(sharedOut && !sharedOut.deleted, 'the shared session survives');
    assert.deepEqual(sharedOut.content.client_ids, [staying.record_id],
      'with the departed client taken out of it and the staying client\'s history intact');
    assert.ok(!out.some((r) => r.record_id === solo.record_id && !r.deleted),
      'while the session nobody else attended is gone');

    // ── the second device applies the deletion rather than resurrecting the client ──────────
    world.advance(60_000);
    await sync(phone, world, SYNC_TRIGGERS.OPEN);
    assert.equal(await phone.store.count('client'), 1,
      'the phone REMOVED them. A delete written as an absence would have been undone here: the '
      + 'phone would have seen a record it had and the remote did not, and faithfully pushed it '
      + 'back — the coach deletes a client and they return at the next sync with no error at all.');
    const stillOnPhone = await phone.store.get('session', shared.record_id);
    assert.deepEqual(stillOnPhone.content.client_ids, [staying.record_id]);
  });

  it('THE RESIDUAL CASE, PROVEN RATHER THAN ASSUMED: an opaque shared payload is left alone, reported, and surfaced NOWHERE', async () => {
    const world = aPractice();
    after(() => world.close());
    const laptop = await world.signedInDevice('coach-laptop');

    const departing = await laptop.store.create('client', aClient({ name: DEPARTED }), { now: world.now() });
    const staying = await laptop.store.create('client', aClient({ name: STAYING }), { now: world.now() });

    // An export or backup blob: not one of our documents, so it cannot be cleaned record by record,
    // and it names BOTH clients. This is a real queued artefact, not a contrivance — the admin
    // export produces exactly this shape.
    const idempotencyKey = 'integration-opaque-shared-1';
    const { entry } = await enqueue(laptop.store, {
      operation: 'create',
      space: SPACE,
      name: keyedName('progress-report-Q3.xlsx', idempotencyKey),
      idempotency_key: idempotencyKey,
      payload: 'UEsDBBQAAAAI-not-one-of-our-documents-opaque-bytes',
      label: 'Progress reports for two clients',
      refs: [departing.record_id, staying.record_id],
      now: world.now(),
    });
    assert.equal(readPayload(entry.payload).kind, PAYLOAD.OPAQUE);

    const manifest = await purgeClient(laptop.store, departing.record_id, { now: world.now() });

    // ── the conservative choice, and it is the RIGHT one ────────────────────────────────────
    const survivor = await getEntry(laptop.store, entry.entry_id);
    assert.ok(survivor, 'the entry is LEFT ALONE, because cleaning it would destroy the staying '
      + 'client\'s data and the code cannot see inside it. This is correct and is not being asked '
      + 'to change.');
    assert.equal(survivor.payload, entry.payload, 'untouched, byte for byte');

    const unresolved = manifest.outbox.unresolved.filter((u) => u.entry_id === entry.entry_id);
    assert.equal(unresolved.length, 1, 'it IS reported');
    assert.equal(unresolved[0].why, UNRESOLVED.OPAQUE_SHARED);

    // ── AND HERE IS THE GAP, asserted rather than described ─────────────────────────────────
    // The report has no consumer. The accountability surface — the one place the coach is told
    // what did not happen — does not carry it, so a departed client's data can persist in that
    // entry with him never told. Same shape as the defect this purge was written to close: a
    // correct routine whose output has no caller.
    const status = await accountabilityStatus(laptop.store, { now: world.now() });
    const surfaced = JSON.stringify(status);
    assert.ok(!surfaced.includes(UNRESOLVED.OPAQUE_SHARED),
      'the surface does not mention it');
    assert.ok(!surfaced.includes(entry.entry_id),
      'and does not name the entry either');
    assert.equal(status.needs_attention, 0,
      'nothing on the surface needs attention, while a departed client\'s data sits in the queue. '
      + 'THIS ASSERTION IS THE POINT OF THE TEST: it fails the day somebody wires the manifest to '
      + 'the surface, which is exactly when it should be rewritten. Until then, deletion is not '
      + 'absolute and INTEGRATION.md says so.');
  });
});

describe('integration — reset restores the shipped library, through the function the coach actually presses', () => {
  it('restores shipped content, keeps the unreferenced pool, and SURVIVES a round trip against a higher remote revision', async () => {
    const world = aPractice();
    after(() => world.close());
    const laptop = await world.signedInDevice('coach-laptop');
    const phone = await world.signedInDevice('coach-phone', { seed: false });

    const [firstRoutine] = seedContentFor('routine');
    const pool = shippedSubstitutionPool();
    assert.ok(pool.length > 0,
      'the shipped catalogue deliberately exceeds the shipped week — the surplus IS the '
      + 'substitution pool, and two features depend on it surviving');
    const orphan = pool[0];

    // ── the coach edits a shipped record, and it reaches the other device ───────────────────
    const stored = await laptop.store.getByContentKey('routine', firstRoutine.id);
    await laptop.store.update('routine', stored.record_id, (content) => ({
      ...content, name: 'His Own Name For It',
    }), { now: world.now() });
    await sync(laptop, world, SYNC_TRIGGERS.OPEN);
    world.advance(60_000);
    await sync(phone, world, SYNC_TRIGGERS.OPEN);

    const onPhone = await phone.store.getByContentKey('routine', firstRoutine.id);
    assert.equal(onPhone.content.name, 'His Own Name For It', 'the edit reached the phone');
    const editedRev = onPhone.rev;

    // ── he presses reset. THE REAL ENTRY POINT. ─────────────────────────────────────────────
    world.advance(60_000);
    let backupTaken = false;
    const result = await resetToDefaults(laptop.store, {
      now: world.now(),
      backup: () => { backupTaken = true; },
    });
    assert.equal(backupTaken, true, 'the backup offer runs BEFORE anything is written');
    assert.ok(result.reverted > 0, 'the coach\'s edit to a shipped record was reverted');

    const afterReset = await laptop.store.getByContentKey('routine', firstRoutine.id);
    assert.equal(afterReset.content.name, firstRoutine.name, 'the shipped name is back');
    assert.ok(afterReset.rev > editedRev,
      'AND AT A STRICTLY HIGHER REVISION. This is the whole game: a reset written at the same or a '
      + 'lower revision loses the last-write-wins race, and the coach\'s edits come back minutes '
      + 'later with nothing having errored.');

    // ── the unreferenced pool is NOT tidied away ────────────────────────────────────────────
    const survivor = await laptop.store.getByContentKey('exercise', orphan.id);
    assert.ok(survivor && !survivor.deleted,
      `${orphan.id} is referenced by no routine and MUST survive the reset: an importer that tidies `
      + 'up orphans would silently delete exactly the pool the coach substitutes from mid-session');

    const untouchedClients = await laptop.store.count('client');
    assert.equal(untouchedClients, 0);
    assert.deepEqual(
      result.plan.consequences.untouched_record_types.includes('client'), true,
      'and reset says plainly that it does not reach his clients, sessions or diet plans — it is '
      + 'library-only, not a fresh slate',
    );

    // ── THE ROUND TRIP: the phone still holds the edited copy. Who wins? ────────────────────
    await sync(laptop, world, SYNC_TRIGGERS.MANUAL);
    world.advance(60_000);
    await sync(phone, world, SYNC_TRIGGERS.OPEN);

    const settled = await phone.store.getByContentKey('routine', firstRoutine.id);
    assert.equal(settled.content.name, firstRoutine.name,
      'the RESET won the round trip. The edited copy on the phone was at a lower revision, so the '
      + 'restore carried outward instead of being reverted by it.');

    world.advance(60_000);
    await sync(phone, world, SYNC_TRIGGERS.MANUAL);
    await sync(laptop, world, SYNC_TRIGGERS.OPEN);
    const back = await laptop.store.getByContentKey('routine', firstRoutine.id);
    assert.equal(back.content.name, firstRoutine.name,
      'and it stays reset after the phone has had its turn to push — the edit does not come back '
      + 'from the dead one sync later, which is how this failure actually presents');

    const stillThere = await phone.store.getByContentKey('exercise', orphan.id);
    assert.ok(stillThere && !stillThere.deleted,
      'the substitution pool survived the round trip on both devices');
  });
});
