/**
 * THE FILE HE KEEPS OUTSIDE GOOGLE ENTIRELY — and the property it exists for, proved rather than
 * described.
 *
 * `core/crypto/portable.test.js` already proves the CRYPTOGRAPHY: passphrase alone, wrong phrase
 * refused, self-contained envelope, a key per file, two-argument opening with nowhere to put a key.
 * None of that is restated here. What this suite proves is the thing one level up, which is the only
 * thing the coach actually cares about: **a whole practice goes into that file and comes back out of
 * it in a context where nothing else of his exists.**
 *
 * ## "STRIPPED" RATHER THAN "NOT PASSED", AND THE DIFFERENCE IS THE WHOLE TEST
 *
 * A test that simply does not hand over a device key proves that the code path taken did not ask for
 * one. It does not prove the code could not have REACHED one — a module that quietly read an ambient
 * key store would pass that test every time, on the machine that has one, and fail years later on
 * the borrowed laptop that does not.
 *
 * So the ambient key material is REMOVED from the environment for the duration of the open: the
 * database the device key lives in, and the two other places a browser lets code stash something.
 * If anything in the opening path reaches for them it gets `undefined` and throws, and the assertion
 * that follows is about a file that genuinely opened with nothing but a phrase.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aClient, aDietPlan, anExercise, anIntensityPattern, aRoutine,
} from '../model/fixtures.js';
import { openLocalStore } from '../store/local-store.js';
import { createLaptop } from '../store/testing/platform-double.js';
import { collectBackup } from './collect.js';
import { readBackupArchive, restoreBackup } from './restore.js';
import {
  BACKUP_ARCHIVE_FILE_EXTENSION, backupPartsObject, sealBackupArchive,
} from './archive.js';

const NOW = '2026-08-01T09:00:00.000Z';
const LATER = '2026-08-02T09:00:00.000Z';
const PHRASE = 'seven copper lantern meadow drift oyster';

const COACH = { provenance: 'coach-created' };

async function aStore(device = 'coach-laptop') {
  const { platform } = createLaptop();
  return openLocalStore({ platform, device });
}

async function aPractice(store) {
  await store.create('exercise', anExercise({ id: 'coach-floor-press', name: 'Floor Press', ...COACH }));
  await store.create('routine', aRoutine({
    id: 'coach-tuesday', name: 'Tuesday', entries: [{ exercise_id: 'coach-floor-press', sets: 3, repetitions: 10 }], ...COACH,
  }));
  await store.create('intensity-pattern', anIntensityPattern({ id: 'coach-ramp', ...COACH }));
  const client = await store.create('client', aClient({ name: 'Alex Fixture' }));
  await store.create('diet-plan', aDietPlan({ client_id: client.record_id }));
  return client;
}

/** Every ambient place a browser would let key material hide. */
const AMBIENT = ['indexedDB', 'localStorage', 'sessionStorage', 'caches'];

/** Thrown by the traps below, so a test can tell this apart from a real failure. */
class ReachedForAmbientKeyMaterial extends Error {}

/**
 * Run something with every ambient place a key could hide BOOBY-TRAPPED.
 *
 * ## WHY TRAPS RATHER THAN DELETION, WHICH IS WHAT THIS FIRST DID
 *
 * Deleting them was the obvious move and it proved NOTHING here. This suite runs under Node, where
 * `indexedDB` and `localStorage` do not exist in the first place — so "the archive opened with them
 * removed" was a sentence about removing things that were already absent. The assertion was green,
 * permanently, and would have stayed green against a module that read every one of them on a real
 * device. An absence that looks exactly like a pass, aimed at the safety net itself.
 *
 * So they are INSTALLED, as accessors that throw the moment anything so much as reads them. That
 * inverts the test from "nothing was there to find" into "something was there and nothing touched
 * it", which is the claim actually being made about the file.
 *
 * Restored afterwards whatever happens: a suite that leaves the environment poisoned makes the next
 * test's failure somebody else's mystery.
 *
 * @template T @param {() => Promise<T>} work @returns {Promise<T>}
 */
async function withAmbientKeyMaterialBoobyTrapped(work) {
  const held = new Map();

  for (const name of AMBIENT) {
    held.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() { throw new ReachedForAmbientKeyMaterial(`something read ${name} while opening a portable archive`); },
    });
  }
  try {
    return await work();
  } finally {
    for (const name of AMBIENT) {
      const descriptor = held.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (/** @type {any} */ (globalThis))[name];
    }
  }
}

test('THE PRACTICE COMES BACK OUT OF THE ENCRYPTED FILE with the passphrase ALONE, nothing else present', async () => {
  const source = await aStore('coach-laptop');
  const client = await aPractice(source);

  const set = await collectBackup(source, { taken_at: NOW });
  const archive = await sealBackupArchive(PHRASE, set, { at: NOW });

  assert.equal(typeof archive, 'string', 'the archive is text, so it survives any channel he sends it through');
  assert.ok(!archive.includes('Alex Fixture'), 'a client name in readable text would mean nothing was sealed');
  assert.ok(!archive.includes('Floor Press'));

  // NOTHING OF HIS IS REACHABLE HERE, and every place one could hide is armed to say so.
  const read = await withAmbientKeyMaterialBoobyTrapped(() => readBackupArchive(PHRASE, archive));

  assert.equal(read.shape, 'full');
  assert.ok(
    read.content.client.some((record) => record.name === 'Alex Fixture'),
    'the archive opened and the practice was not in it',
  );

  // ...and it is genuinely restorable, not merely readable.
  const fresh = await aStore('coach-phone');
  const result = await restoreBackup(fresh, read, { now: LATER });
  assert.ok(result.written > 0);
  assert.deepEqual((await fresh.get('client', client.record_id)).content, client.content);
});

test('...AND A WRONG PASSPHRASE FAILS, or the test above proved only that a file opens', async () => {
  const source = await aStore('coach-laptop');
  await aPractice(source);
  const archive = await sealBackupArchive(PHRASE, await collectBackup(source, { taken_at: NOW }), { at: NOW });

  await assert.rejects(() => readBackupArchive('seven copper lantern meadow drift oysters', archive));
  await assert.rejects(() => readBackupArchive('', archive));
});

test('THE TRAPS ARE ARMED — pointed at a known positive, or the test above is green about nothing', async () => {
  // WITHOUT THIS, "it opened with the ambient key material trapped" is an untested claim about a
  // HELPER. A helper that armed nothing would let every assertion in this file pass for ever, and
  // its greenness would be evidence of nothing. So each trap is TRIPPED ON PURPOSE, here, and the
  // suite fails if one stays quiet.
  await withAmbientKeyMaterialBoobyTrapped(async () => {
    for (const name of AMBIENT) {
      assert.throws(
        () => /** @type {any} */ (globalThis)[name],
        ReachedForAmbientKeyMaterial,
        `the trap on ${name} did not fire, so nothing was guarding it`,
      );
    }
  });

  // And every one is put back, so the next test's failure is not this test's mess.
  for (const name of AMBIENT) {
    assert.doesNotThrow(() => /** @type {any} */ (globalThis)[name]);
  }
  const { platform } = createLaptop();
  assert.ok(platform.indexedDB, 'a store can still be built afterwards');
});

test('THE ARCHIVE IS THE SAME DOCUMENT AS THE PLAIN FILE, so there is ONE restore and not two', async () => {
  const source = await aStore('coach-laptop');
  await aPractice(source);
  const set = await collectBackup(source, { taken_at: NOW });

  const parts = backupPartsObject(set);
  const opened = await readBackupArchive(PHRASE, await sealBackupArchive(PHRASE, set, { at: NOW }));

  assert.deepEqual(Object.keys(parts).sort(), Object.keys(JSON.parse(JSON.stringify(parts))).sort());
  assert.equal(opened.shape, 'full', 'the sealed payload is read by the same reader as the plain file');
  assert.ok(Object.keys(parts).includes('backup.json'));
});

test('an empty practice is refused rather than sealed into a file that says everything is safe', async () => {
  const empty = await aStore('coach-laptop');
  const set = await collectBackup(empty, { taken_at: NOW });

  await assert.rejects(() => sealBackupArchive(PHRASE, set, { at: NOW }), /nothing in this practice/i);
});

test('the archive is named for what it is rather than borrowing an extension it would not honour', () => {
  assert.equal(BACKUP_ARCHIVE_FILE_EXTENSION, '.fitbackup');
  assert.ok(!BACKUP_ARCHIVE_FILE_EXTENSION.includes('zip'), 'it is not a ZIP and must not claim to be');
});
