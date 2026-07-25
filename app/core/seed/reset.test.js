/**
 * RESET TO DEFAULTS: what it restores, what it reverts, what it must not touch, and what it
 * hands the interface so a backup can be offered first.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { LIBRARY_TYPES } from '../model/model.js';
import { openLocalStore } from '../store/local-store.js';
import { libraryPage } from '../store/queries.js';
import { createLaptop } from '../store/testing/platform-double.js';
import { SEED_TYPES, seedContentFor, seedCounts } from './content.js';
import { seedIfNeeded } from './import.js';
import { markEdited, SEED_PROVENANCE } from './provenance.js';
import { describeReset, RESET_TYPES, resetToDefaults, sameContent } from './reset.js';

async function aStore(device = 'coach-laptop') {
  const { platform } = createLaptop();
  return openLocalStore({ platform, device });
}

async function seeded(device = 'coach-laptop') {
  const store = await aStore(device);
  await seedIfNeeded(store);
  return store;
}

async function everything(store, type) {
  const out = [];
  let after = null;
  for (;;) {
    const page = await libraryPage(store, type, { limit: 100, after });
    out.push(...page.items);
    if (page.done || !page.cursor) return out;
    after = page.cursor;
  }
}

/** A routine the coach wrote himself. */
function aCoachRoutine() {
  const shipped = seedContentFor('routine')[0];
  return {
    ...shipped,
    id: 'coach-own-tuesday',
    name: 'Coach own Tuesday',
    description: 'A routine the coach wrote himself, which no reset may revert or remove.',
    provenance: 'coach-created',
  };
}

test('reset restores exactly the shipped set', async () => {
  const store = await seeded();
  const shipped = seedCounts();

  await resetToDefaults(store);

  for (const type of SEED_TYPES) {
    const live = await everything(store, type);
    assert.equal(live.length, shipped[type]);
    for (const content of seedContentFor(type)) {
      const record = await store.getByContentKey(type, content.id);
      assert.deepEqual(record.content, content, `${type} "${content.id}" is not the shipped record`);
    }
  }
  await store.close();
});

test("reset reverts the coach's edit to a shipped record, and says so beforehand", async () => {
  const store = await seeded();
  const target = seedContentFor('exercise')[0];
  const stored = await store.getByContentKey('exercise', target.id);

  await store.update('exercise', stored.record_id,
    (content) => markEdited({ ...content, coaching_cue: 'His own phrasing for this movement.' }));

  const plan = await describeReset(store);
  assert.equal(plan.consequences.reverts_coach_edits, 1);
  assert.deepEqual(plan.will_revert.map((r) => r.content_key), [target.id]);
  assert.equal(plan.will_revert[0].provenance, 'shipped-edited');

  const result = await resetToDefaults(store);
  assert.equal(result.reverted, 1);

  const after = await store.getByContentKey('exercise', target.id);
  assert.deepEqual(after.content, target);
  assert.equal(after.content.provenance, SEED_PROVENANCE);
  await store.close();
});

test('reset never touches what the coach created himself', async () => {
  const store = await seeded();
  const own = await store.create('routine', aCoachRoutine());

  const plan = await describeReset(store);
  assert.equal(plan.consequences.leaves_coach_created_untouched, 1);
  assert.equal(plan.will_revert.some((r) => r.content_key === own.content.id), false);
  assert.equal(plan.will_remove.some((r) => r.content_key === own.content.id), false);

  await resetToDefaults(store);

  const after = await store.get('routine', own.record_id);
  assert.equal(after.rev, own.rev, "the coach's own record was not even rewritten");
  assert.deepEqual(after.content, own.content);
  assert.equal((await everything(store, 'routine')).length, seedCounts().routine + 1);
  await store.close();
});

test('reset restores a shipped record the coach deleted', async () => {
  const store = await seeded();
  const target = seedContentFor('routine')[1];
  const stored = await store.getByContentKey('routine', target.id);
  await store.tombstone('routine', stored.record_id);
  assert.equal(await store.getByContentKey('routine', target.id), undefined);

  const plan = await describeReset(store);
  assert.ok(plan.will_restore.some((r) => r.content_key === target.id));

  const result = await resetToDefaults(store);
  assert.ok(result.restored >= 1);

  const after = await store.getByContentKey('routine', target.id);
  assert.deepEqual(after.content, target);
  await store.close();
});

test('reset removes a shipped record that is no longer shipped, as a tombstone', async () => {
  const store = await seeded();
  // A record from an older shipped library: ours by provenance, absent from what ships now.
  const stale = { ...seedContentFor('intensity-pattern')[0], id: 'retired-curve', name: 'Retired curve' };
  const created = await store.create('intensity-pattern', stale);

  const plan = await describeReset(store);
  assert.deepEqual(plan.will_remove.map((r) => r.content_key), ['retired-curve']);

  const result = await resetToDefaults(store);
  assert.equal(result.removed, 1);

  const after = await store.get('intensity-pattern', created.record_id);
  assert.equal(after.deleted, true, 'removal must be a tombstone so the deletion propagates');
  assert.equal(after.content, null);
  assert.ok(after.rev > created.rev);
  await store.close();
});

test('a restored record keeps its identity and its revision GOES UP', async () => {
  const store = await seeded();
  const target = seedContentFor('exercise')[2];
  const before = await store.getByContentKey('exercise', target.id);

  await store.update('exercise', before.record_id, (content) => markEdited({ ...content, default_rest_seconds: 5 }));
  const edited = await store.getByContentKey('exercise', target.id);

  await resetToDefaults(store);
  const after = await store.getByContentKey('exercise', target.id);

  assert.equal(after.record_id, before.record_id, 'a reset must not orphan the record it restores');
  assert.ok(after.rev > edited.rev,
    'a reset written at a lower revision would lose to the remote copy and the edit would come back on the next sync');
  assert.equal(after.created_at, before.created_at);
  await store.close();
});

test('the backup runs BEFORE anything is written, and a failed backup cancels the reset', async () => {
  const store = await seeded();
  const target = seedContentFor('exercise')[0];
  const stored = await store.getByContentKey('exercise', target.id);
  await store.update('exercise', stored.record_id, (content) => markEdited({ ...content, default_rest_seconds: 7 }));

  // The backup sees the library as it was, and it sees the plan.
  let sawEditAtBackupTime = null;
  let sawPlan = null;
  await resetToDefaults(store, {
    backup: async (plan) => {
      sawPlan = plan;
      sawEditAtBackupTime = (await store.getByContentKey('exercise', target.id)).content.default_rest_seconds;
    },
  });
  assert.equal(sawEditAtBackupTime, 7, 'the backup must be taken before the reset writes anything');
  assert.equal(sawPlan.consequences.reverts_coach_edits, 1);

  // And when the backup fails, the reset does not happen. A failed backup followed by a
  // completed reset is the exact sequence the offer exists to prevent.
  const second = await store.getByContentKey('exercise', target.id);
  await store.update('exercise', second.record_id, (content) => markEdited({ ...content, default_rest_seconds: 9 }));

  await assert.rejects(
    () => resetToDefaults(store, { backup: () => { throw new Error('drive is unreachable'); } }),
    /drive is unreachable/,
  );
  assert.equal((await store.getByContentKey('exercise', target.id)).content.default_rest_seconds, 9,
    'the reset must not have run');
  await store.close();
});

test('the plan says everything a confirmation needs, and none of the words', async () => {
  const store = await seeded();
  const plan = await describeReset(store);

  assert.equal(plan.action, 'reset-to-defaults');
  assert.equal(plan.destructive, true);
  assert.equal(plan.wording_owner, 'interface');
  assert.equal(plan.backup.offer_before, true);
  assert.deepEqual([...plan.consequences.restored_record_types].sort(), [...SEED_TYPES].sort());
  assert.ok(plan.why_it_exists.length > 0);
  assert.ok(plan.why_it_is_in_admin.length > 0);
  assert.deepEqual(plan.shipped_counts, seedCounts());

  // Reset restores the LIBRARY. Everything the coach and his clients produced is out of scope,
  // and the plan states which kinds rather than leaving the interface to assume.
  assert.deepEqual([...plan.consequences.untouched_record_types].sort(),
    ['client', 'diet-plan', 'performed-record', 'reading', 'session', 'session-note']);

  // No user-facing prose: every code is a machine-readable token, so the interface cannot
  // accidentally render a sentence this module wrote and nobody reviewed.
  for (const code of [plan.action, plan.scope, plan.why_it_exists, plan.why_it_is_in_admin, plan.backup.reason_code]) {
    assert.match(code, /^[a-z0-9]+(-[a-z0-9]+)*$/, `"${code}" reads like prose; the plan speaks in codes`);
  }

  // "Starts a fresh slate" is FALSE of a library-only reset and must not be exposed in any form.
  // It would either frighten the coach away from a safe action or teach him the button does
  // something it does not — and he would eventually rely on it.
  assert.equal('starts_fresh_slate' in plan.consequences, false);
  assert.equal(JSON.stringify(plan).includes('fresh'), false,
    'the plan must not describe reset as a fresh slate; it restores the library and leaves his records alone');
  await store.close();
});

test('reset REVERTS an edited shipped record and leaves client-side records UNTOUCHED, in one act', async () => {
  // ═════════════════════════════════════════════════════════════════════════════════════════
  //  These two behaviours together ARE the decision: reset restores the shipped library, and
  //  it cannot reach the coach's client history. Asserting them in one test is deliberate —
  //  it is the test that fails loudly if anyone later widens reset into a wipe, which would
  //  destroy a working professional's records behind one admin button.
  // ═════════════════════════════════════════════════════════════════════════════════════════
  const store = await seeded();

  const client = await store.create('client', {
    name: 'A Client', notes: 'Prefers mornings.', active: true,
  });
  const session = await store.create('session', {
    routine_id: seedContentFor('routine')[0].id,
    client_ids: [client.record_id],
    status: 'completed',
    scheduled_at: '2026-07-20T09:00:00.000Z',
    started_at: '2026-07-20T09:01:00.000Z',
    ended_at: '2026-07-20T10:00:00.000Z',
  });

  const target = seedContentFor('exercise')[0];
  const stored = await store.getByContentKey('exercise', target.id);
  await store.update('exercise', stored.record_id,
    (content) => markEdited({ ...content, coaching_cue: 'His own phrasing, about to be reverted.' }));

  const result = await resetToDefaults(store);

  // The shipped record went back.
  assert.equal(result.reverted, 1);
  assert.deepEqual((await store.getByContentKey('exercise', target.id)).content, target);

  // His client and his session did not move AT ALL — not reverted, not tombstoned, not even
  // rewritten at a new revision.
  const clientAfter = await store.get('client', client.record_id);
  assert.equal(clientAfter.rev, client.rev);
  assert.equal(clientAfter.deleted, false);
  assert.deepEqual(clientAfter.content, client.content);

  const sessionAfter = await store.get('session', session.record_id);
  assert.equal(sessionAfter.rev, session.rev);
  assert.equal(sessionAfter.deleted, false);
  assert.deepEqual(sessionAfter.content, session.content);

  await store.close();
});

test('every library kind the model has is a kind the reset covers', () => {
  assert.deepEqual([...RESET_TYPES].sort(), [...LIBRARY_TYPES].sort());
  assert.deepEqual([...SEED_TYPES].sort(), [...LIBRARY_TYPES].sort());
});

test('the content comparison looks all the way down', () => {
  const routine = seedContentFor('routine')[0];
  assert.equal(sameContent(routine, routine), true);
  assert.equal(sameContent({ ...routine, provenance: 'shipped-edited' }, routine), true,
    'provenance alone is not a content difference');

  const nested = { ...routine, entries: routine.entries.map((e, i) => (i ? e : { ...e, sets: (e.sets ?? 3) + 1 })) };
  assert.equal(sameContent(nested, routine), false,
    'a change buried inside entries must count as a change, or the coach is not warned about it');

  const exercise = seedContentFor('exercise')[0];
  const scaled = { ...exercise, scaling: { ...exercise.scaling, high: { ...exercise.scaling.high, sets: 9 } } };
  assert.equal(sameContent(scaled, exercise), false);
});
