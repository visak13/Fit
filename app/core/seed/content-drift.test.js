/**
 * THE COPY HAS NOT DRIFTED FROM ITS SOURCE.
 *
 * The application ships its own copy of the seed content so that a published static site carries
 * its content rather than reaching outside itself. A copy is only as good as the guarantee that
 * it still matches what it was copied from — and a copy that silently diverges is the same
 * defect family as everything else that has bitten this build: it looks fine, it passes, and the
 * wrong content ships.
 *
 * So the check is a TEST rather than a one-time manual comparison, and it compares TEXT as well
 * as parsed values. A semantic comparison alone would let a reformatting pass through, and the
 * point of the copy is that nothing was touched.
 *
 * If the authored seed directory is entirely absent — a checkout of `app/` on its own — the
 * suite skips, because the application genuinely does not need it to run. If the directory is
 * there but a file is missing, that FAILS: something removed a file the application ships.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CONTENT_DIR, CONTENT_FILES, embeddedText, readAuthored, SOURCE_DIR, sync,
} from './sync-content.mjs';
import { SEED_CONTENT, SEED_TYPES, seedContentFor, seedCounts } from './content.js';

const hasSource = existsSync(SOURCE_DIR);

test('the application copy of the shipped content', { skip: hasSource ? false : `no authored seed directory at ${SOURCE_DIR} — the copy cannot be checked against its source here` }, async (t) => {
  await t.test('every authored file the application ships is still there', () => {
    for (const entry of CONTENT_FILES) {
      assert.ok(existsSync(join(SOURCE_DIR, entry.file)),
        `${entry.file} is missing from ${SOURCE_DIR}, and the application ships its content`);
    }
  });

  await t.test('the copy is the authored file byte for byte', () => {
    for (const entry of CONTENT_FILES) {
      const authored = readAuthored(join(SOURCE_DIR, entry.file));
      const copied = embeddedText(readFileSync(join(CONTENT_DIR, entry.module), 'utf8'));
      assert.ok(copied !== null, `${entry.module} has lost its content markers`);
      assert.equal(copied, authored,
        `${entry.module} has drifted from seed/${entry.file}. Run: node core/seed/sync-content.mjs`);
    }
  });

  await t.test('the sync script agrees that nothing needs regenerating', () => {
    // The same question asked the other way round, through the code the maintainer actually runs.
    const result = sync({ check: true });
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.drifted, [],
      'the copy is out of date. Run: node core/seed/sync-content.mjs');
  });

  await t.test('the imported modules parse to exactly the authored records', () => {
    for (const entry of CONTENT_FILES) {
      const authored = JSON.parse(readFileSync(join(SOURCE_DIR, entry.file), 'utf8'));
      assert.deepEqual(seedContentFor(entry.type), authored,
        `the ${entry.type} records the application imports are not the authored ones`);
    }
  });
});

test('the shipped content is a bare array of content records per kind', () => {
  for (const type of SEED_TYPES) {
    const records = seedContentFor(type);
    assert.ok(Array.isArray(records), `${type} content must be a bare array`);
    assert.ok(records.length > 0, `${type} content is empty`);
    for (const record of records) {
      assert.equal(typeof record.id, 'string');
      // The content key is a content key. Nothing in the file may carry an envelope concern.
      for (const forbidden of ['record_id', 'rev', 'device', 'deleted', 'created_at', 'updated_at']) {
        assert.equal(forbidden in record, false,
          `shipped ${type} "${record.id}" carries "${forbidden}", which belongs to the envelope`);
      }
    }
  }
});

test('the shipped counts are what the application believes it ships', () => {
  const counts = seedCounts();
  for (const type of SEED_TYPES) {
    assert.equal(counts[type], SEED_CONTENT[type].length);
    assert.ok(counts[type] > 0);
  }
});

test('the application reads its content from inside its own directory', () => {
  // The published site must not reach outside itself for the content it ships. `content.js`
  // imports the copy under `core/seed/content/` and nothing else: a relative path climbing out
  // of `app/` here would work on this machine and fail on the coach's phone.
  const source = readFileSync(new URL('./content.js', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
  for (const specifier of imports) {
    assert.ok(specifier.startsWith('./content/'),
      `content.js imports "${specifier}" — the shipped content must come from the application's own directory`);
  }
});
