/**
 * THE IMPORTER: first run, re-run, and what it refuses to decide from.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { validateRecord } from '../model/model.js';
import { openLocalStore } from '../store/local-store.js';
import { libraryPage } from '../store/queries.js';
import { createLaptop } from '../store/testing/platform-double.js';
import { SEED_TYPES, seedContentFor, seedCounts } from './content.js';
import {
  assertNothingPruned, buildSeedRecords, hasBeenSeeded, importSeed, SEED_IMPORT_META_KEY,
  SEED_PRUNES_UNREFERENCED_CONTENT, seedIfNeeded, seedState,
} from './import.js';
import { markEdited, SEED_PROVENANCE } from './provenance.js';

/** A store on a fresh laptop, with nothing in it. */
async function aStore(device = 'coach-laptop') {
  const { world, platform } = createLaptop();
  const store = await openLocalStore({ platform, device });
  return { world, platform, store };
}

/** Every live record of a kind, walked through the ordinary paged read. */
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

test('an empty installation has not been seeded', async () => {
  const { store } = await aStore();
  assert.equal(await hasBeenSeeded(store), false);
  const state = await seedState(store);
  assert.deepEqual(state.stored, { exercise: 0, routine: 0, 'intensity-pattern': 0 });
  assert.equal(state.seeded, false);
  await store.close();
});

test('first run imports every shipped record, and the counts are the shipped counts', async () => {
  const { store } = await aStore();

  const result = await seedIfNeeded(store);
  assert.equal(result.imported, true);
  assert.equal(result.reason, 'first-run');

  const shipped = seedCounts();
  for (const type of SEED_TYPES) {
    assert.equal(await store.count(type), shipped[type],
      `${await store.count(type)} of ${shipped[type]} ${type} records were imported`);
  }
  assert.equal(result.written, shipped.exercise + shipped.routine + shipped['intensity-pattern']);
  await store.close();
});

test('the content is stored VERBATIM inside the envelope, and the content key is not the identity', async () => {
  const { store } = await aStore();
  await seedIfNeeded(store);

  for (const type of SEED_TYPES) {
    for (const content of seedContentFor(type)) {
      const record = await store.getByContentKey(type, content.id);
      assert.ok(record, `${type} "${content.id}" was not imported`);

      // Verbatim: not reshaped, not reordered into, not added to, not stripped.
      assert.deepEqual(record.content, content,
        `${type} "${content.id}" was altered on the way in`);

      // The envelope wraps; it does not merge.
      assert.equal(record.type, type);
      assert.equal(record.rev, 1);
      assert.equal(record.deleted, false);
      assert.equal(record.device, 'coach-laptop');
      assert.equal(record.content.provenance, SEED_PROVENANCE);
      assert.notEqual(record.record_id, content.id,
        'the content key must not become the record identity');
      assert.ok(validateRecord(record).ok);
    }
  }
  await store.close();
});

test('re-running the import on a seeded installation writes NOTHING', async () => {
  const { store } = await aStore();
  await seedIfNeeded(store);

  const before = store.stats.writes;
  const again = await seedIfNeeded(store);

  assert.equal(again.imported, false);
  assert.equal(again.reason, 'already-seeded');
  assert.equal(store.stats.writes, before, 'a second start-up must not write to the library');
  await store.close();
});

test("re-running the import does not undo the coach's edits", async () => {
  const { store } = await aStore();
  await seedIfNeeded(store);

  const first = seedContentFor('exercise')[0];
  const stored = await store.getByContentKey('exercise', first.id);
  const edited = await store.update('exercise', stored.record_id,
    (content) => markEdited({ ...content, coaching_cue: 'Coach own words for this movement here.' }));
  assert.equal(edited.content.provenance, 'shipped-edited');

  await seedIfNeeded(store);

  const after = await store.getByContentKey('exercise', first.id);
  assert.equal(after.content.coaching_cue, 'Coach own words for this movement here.');
  assert.equal(after.content.provenance, 'shipped-edited');
  await store.close();
});

test('first run is decided by the STORE, not by the diagnostics marker', async () => {
  const { store } = await aStore();
  await seedIfNeeded(store);

  // The marker exists, and it is a note about what happened — not the thing that decides.
  assert.ok(await store.getMeta(SEED_IMPORT_META_KEY));

  // Erase it, exactly as a cleared or partially restored meta store would. The library is still
  // seeded, because the library is what the question is about. A flag would have said otherwise
  // and re-imported over the coach's work.
  await store.setMeta(SEED_IMPORT_META_KEY, undefined);
  assert.equal(await hasBeenSeeded(store), true);

  const again = await seedIfNeeded(store);
  assert.equal(again.imported, false);
  assert.equal(again.reason, 'already-seeded');
  await store.close();
});

test('a library the coach has emptied is still a seeded library', async () => {
  const { store } = await aStore();
  await seedIfNeeded(store);

  for (const record of await everything(store, 'intensity-pattern')) {
    await store.tombstone('intensity-pattern', record.record_id);
  }
  assert.equal((await everything(store, 'intensity-pattern')).length, 0,
    'every pattern is deleted as far as a reader is concerned');

  // Deleting is a decision. The next start-up must not quietly put them all back.
  assert.equal(await hasBeenSeeded(store), true);
  const again = await seedIfNeeded(store);
  assert.equal(again.imported, false);
  await store.close();
});

test('the importer refuses to write an incomplete catalogue', () => {
  // The guarantee, exercised directly: this is what stands between a well-meant "tidy up the
  // orphans" change and the silent deletion of the substitution pool.
  const records = buildSeedRecords({ device: 'coach-laptop' });
  const dropped = records.find((r) => r.type === 'exercise');
  const pruned = records.filter((r) => r !== dropped);
  assert.throws(() => assertNothingPruned(pruned), /shipped exercise records/);
  assert.equal(SEED_PRUNES_UNREFERENCED_CONTENT, false);
});

test('every built record validates before anything is written', () => {
  const records = buildSeedRecords({ device: 'coach-laptop' });
  const bad = records.filter((r) => !validateRecord(r).ok);
  assert.deepEqual(bad, []);
  assert.equal(records.length, Object.values(seedCounts()).reduce((a, b) => a + b, 0));
});

test('a supplied identity is used, so a restore keeps the record it already had', () => {
  const fixed = new Map([['exercise', '11111111-2222-4333-8444-555555555555']]);
  const records = buildSeedRecords({
    device: 'coach-laptop',
    identify: (type, content) => (content.id === seedContentFor('exercise')[0].id ? fixed.get(type) : undefined),
  });
  const target = records.find((r) => r.content.id === seedContentFor('exercise')[0].id);
  assert.equal(target.record_id, fixed.get('exercise'));
});

test('importSeed reports the substitution pool it kept', async () => {
  const { store } = await aStore();
  const result = await importSeed(store);
  assert.ok(result.unreferenced_exercises > 0,
    'the shipped catalogue must exceed the shipped week — that surplus is the substitution pool');
  const note = await store.getMeta(SEED_IMPORT_META_KEY);
  assert.equal(note.unreferenced_exercises, result.unreferenced_exercises);
  await store.close();
});
