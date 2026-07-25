/**
 * THE SHIPPED SEED, run through this model.
 *
 * The record model is written against the seed content contract. That agreement is worth
 * exactly nothing until the real files are put through the real validators, so this suite
 * reads `seed/exercises.json`, `seed/routines.json` and `seed/intensity-patterns.json` from
 * disk and validates every record in them.
 *
 * It also wraps each one in an envelope — which is what the importer will do on first run —
 * and proves the wrapped record still validates end to end. The two layers agreeing on paper
 * is not the same as them agreeing on the actual content.
 *
 * The seed lives outside the application directory, so if it is not present this suite
 * SKIPS rather than fails: the model is usable without it, and a false failure here would
 * say nothing about the model.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { validateRecord, createEnvelope } from './model.js';
import { validateExercise, validateRoutine, validateIntensityPattern } from './entities/index.js';
import { checkLibraryIntegrity, unreferencedExercises } from './referential.js';
import { formatIssues } from './issues.js';
import { SEED_PROVENANCE } from './vocabularies.js';

const here = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = join(here, '..', '..', '..', 'seed');

const seedPath = (name) => join(SEED_DIR, name);
const hasSeed = ['exercises.json', 'routines.json', 'intensity-patterns.json']
  .every((f) => existsSync(seedPath(f)));

const load = (name) => JSON.parse(readFileSync(seedPath(name), 'utf8'));

/** Report the first few failures rather than only a count — a count is not diagnosable. */
function assertAllValid(records, validate, kind) {
  const failures = [];
  records.forEach((record, i) => {
    const r = validate(record);
    if (!r.ok) failures.push(`${kind}[${i}] (${record?.id}):\n${formatIssues(r)}`);
  });
  assert.equal(failures.length, 0,
    `${failures.length} of ${records.length} ${kind} records failed:\n\n${failures.slice(0, 5).join('\n\n')}`);
}

test('the shipped seed', { skip: hasSeed ? false : `no seed directory at ${SEED_DIR}` }, async (t) => {
  const exercises = load('exercises.json');
  const routines = load('routines.json');
  const patterns = load('intensity-patterns.json');

  await t.test('every shipped exercise validates against this model', () => {
    assert.ok(exercises.length > 0);
    assertAllValid(exercises, validateExercise, 'exercise');
  });

  await t.test('every shipped routine validates against this model', () => {
    assert.ok(routines.length > 0);
    assertAllValid(routines, validateRoutine, 'routine');
  });

  await t.test('every shipped intensity pattern validates against this model', () => {
    assert.ok(patterns.length > 0);
    assertAllValid(patterns, validateIntensityPattern, 'intensity-pattern');
  });

  await t.test('the shipped library is referentially sound in the one enforced direction', () => {
    const r = checkLibraryIntegrity({ exercises, routines });
    assert.ok(r.ok, formatIssues(r));
  });

  await t.test('the shipped catalogue deliberately exceeds the shipped week', () => {
    // Not an accident and not a defect: the surplus is the substitution pool. If this ever
    // reads zero, either the library was pruned or an importer was "tidied" — both are bugs.
    const pool = unreferencedExercises(routines, exercises);
    assert.ok(pool.length > 0,
      'the catalogue must hold more exercises than the week references — that surplus is the substitution pool');
    assert.ok(pool.length < exercises.length);
  });

  await t.test('every shipped record is shipped-untouched', () => {
    for (const record of [...exercises, ...routines, ...patterns]) {
      assert.equal(record.provenance, SEED_PROVENANCE, `${record.id} claims ${record.provenance}`);
    }
  });

  await t.test('no shipped record carries an envelope concern', () => {
    // The content contract reserves no space for identity, revision, device, tombstones or
    // timestamps, and the envelope is what adds them. Proving it on the real files is what
    // makes the boundary real rather than agreed.
    for (const record of [...exercises, ...routines, ...patterns]) {
      for (const forbidden of ['record_id', 'rev', 'device', 'deleted', 'created_at', 'updated_at']) {
        assert.equal(forbidden in record, false,
          `${record.id} carries "${forbidden}", which belongs to the envelope`);
      }
    }
  });

  await t.test('wrapping a seed record in an envelope needs no change to the record', () => {
    const cases = [['exercise', exercises], ['routine', routines], ['intensity-pattern', patterns]];
    for (const [type, records] of cases) {
      for (const content of records) {
        const enveloped = createEnvelope({ type, content, device: 'coach-laptop' });
        const r = validateRecord(enveloped);
        assert.ok(r.ok, `${type} ${content.id}\n${formatIssues(r)}`);
        // The content key survives as an ordinary content field beside the record identity.
        assert.equal(enveloped.content.id, content.id);
        assert.notEqual(enveloped.record_id, content.id);
      }
    }
  });
});
