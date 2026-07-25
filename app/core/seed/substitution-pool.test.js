/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *  THE SUBSTITUTION POOL SURVIVES EVERYTHING.
 *
 *  This suite exists to state a GUARANTEE, not to fill a gap. Read it as a promise the
 *  application makes, because the alternative reading — a check nobody got round to writing —
 *  is exactly how it gets deleted.
 *
 *  THE GUARANTEE: an exercise that no routine references is imported, is kept, and is restored
 *  by a reset, and no path in this package removes it for being unreferenced.
 *
 *  WHY IT MATTERS, in the coach's terms: the shipped catalogue deliberately holds more exercises
 *  than the shipped week uses. The surplus is what he SWAPS TO when a client turns up tired, or
 *  injured, or with no equipment at home — a knee push-up instead of a push-up, a band curl
 *  instead of a barbell one — and it is what the intensity adapter draws on when a routine has
 *  nothing left at the level a curve is asking for. Prune it and both features still run, still
 *  pass their own tests, and have nothing to offer. He meets that in front of a client.
 *
 *  THE DIRECTION RULE, which is the whole of it: every exercise a routine NAMES must exist.
 *  Never the reverse. Being referenced by nothing is not an error, is not a defect, and is not
 *  housekeeping waiting to happen.
 *
 *  A reviewer who finds no reverse check here has found the requirement, not an omission.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { checkLibraryIntegrity, referencedExerciseKeys, SUBSTITUTION_POOL_NOTE, unreferencedExercises } from '../model/model.js';
import { PRUNES_UNREFERENCED_CONTENT } from '../store/local-store.js';
import { openLocalStore } from '../store/local-store.js';
import { createLaptop } from '../store/testing/platform-double.js';
import { seedContentFor } from './content.js';
import { SEED_PRUNES_UNREFERENCED_CONTENT, seedIfNeeded, shippedSubstitutionPool } from './import.js';
import { describeReset, resetToDefaults } from './reset.js';

async function aStore(device = 'coach-laptop') {
  const { platform } = createLaptop();
  return openLocalStore({ platform, device });
}

test('the shipped catalogue deliberately exceeds the shipped week', () => {
  const pool = shippedSubstitutionPool();
  const exercises = seedContentFor('exercise');
  const routines = seedContentFor('routine');

  assert.ok(pool.length > 0,
    'there is no substitution pool at all — either the catalogue was pruned or an importer was "tidied"');
  assert.ok(pool.length < exercises.length, 'the routines must reference some of the catalogue');
  assert.equal(pool.length, exercises.length - referencedExerciseKeys(routines).size);
});

test('an unreferenced exercise SURVIVES the import', async () => {
  const store = await aStore();
  await seedIfNeeded(store);

  const pool = shippedSubstitutionPool();
  for (const key of pool) {
    const record = await store.getByContentKey('exercise', key);
    assert.ok(record, `unreferenced exercise "${key}" was dropped by the import. ${SUBSTITUTION_POOL_NOTE}`);
    assert.equal(record.deleted, false);
  }
  assert.equal(await store.count('exercise'), seedContentFor('exercise').length);
  await store.close();
});

test('an unreferenced exercise SURVIVES a reset', async () => {
  const store = await aStore();
  await seedIfNeeded(store);

  const pool = shippedSubstitutionPool();
  const sample = pool[0];
  const before = await store.getByContentKey('exercise', sample);

  // The coach edits one of them, then deletes another outright, then resets. Both come back.
  const deleted = await store.getByContentKey('exercise', pool[1] ?? pool[0]);
  await store.tombstone('exercise', deleted.record_id);

  const plan = await describeReset(store);
  assert.ok(plan.will_restore.some((r) => r.content_key === (pool[1] ?? pool[0])),
    'a deleted unreferenced exercise must be listed for restoration, not quietly forgotten');

  await resetToDefaults(store);

  for (const key of pool) {
    const record = await store.getByContentKey('exercise', key);
    assert.ok(record, `unreferenced exercise "${key}" did not survive the reset. ${SUBSTITUTION_POOL_NOTE}`);
    assert.equal(record.deleted, false);
    assert.deepEqual(record.content, seedContentFor('exercise').find((e) => e.id === key));
  }
  assert.ok(before, 'the pool sample existed before the reset too');
  await store.close();
});

test('referential checking runs in ONE direction only', () => {
  const exercises = seedContentFor('exercise');
  const routines = seedContentFor('routine');

  // Enforced: every exercise a routine names exists.
  assert.ok(checkLibraryIntegrity({ exercises, routines }).ok);

  const dangling = [{ ...routines[0], entries: [{ exercise_id: 'no-such-exercise' }] }];
  assert.equal(checkLibraryIntegrity({ exercises, routines: dangling }).ok, false,
    'a routine naming an exercise that does not exist must be an error');

  // NOT enforced, and never will be: an exercise nothing names. Asserted as a POSITIVE
  // statement so that adding the reverse check breaks this test rather than passing it.
  const noRoutines = checkLibraryIntegrity({ exercises, routines: [] });
  assert.equal(noRoutines.ok, true,
    'with no routines at all, every exercise is unreferenced — and that is not an error');
  assert.equal(unreferencedExercises([], exercises).length, exercises.length);
});

test('both layers declare, as a value, that they prune nothing', () => {
  // Declared rather than absent: an absence is indistinguishable from an oversight to whoever
  // edits this next, and the store and the seed package can each break the guarantee alone.
  assert.equal(SEED_PRUNES_UNREFERENCED_CONTENT, false);
  assert.equal(PRUNES_UNREFERENCED_CONTENT, false);
  assert.match(SUBSTITUTION_POOL_NOTE, /never be pruned/);
});
