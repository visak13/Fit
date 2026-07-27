/**
 * A PROMISE OF DELETION IS ONLY AS TRUE AS THE LEAST-SWEPT COPY.
 *
 * `google-account.ts` tells the coach, in his own language, that erasing this device deletes
 * everything this app has saved here — including the key it uses to open medical notes. That is a
 * claim about the WHOLE application, made by one module, and the modules it is a claim about are
 * free to add a new place to keep something at any time without ever reading that sentence.
 *
 * This file is what stops the sentence rotting. It holds the claim against the code twice:
 *
 *  1. **Every small fact kept outside the local database is accounted for.** Each `fit.` key in the
 *     application source is either swept by the erase or stated here NOT to be storage at all, with
 *     a reason. A key in neither list fails, which is what stops a later step quietly adding one
 *     that survives an erase. The same partition `core/journal/unwritten-kinds.test.js` uses over
 *     the log's vocabulary, and for the same reason.
 *
 *  2. **Nothing but the local database holds device key material.** The erase destroys the device
 *     slot by deleting the database that holds it. That is TRUE TODAY and it is a property of there
 *     being exactly one implementation of the key store, held in memory. The day somebody writes a
 *     browser one that keeps the key anywhere else, this test goes red — which is exactly the day
 *     the sentence about what erasing destroys stops being true and has to be rewritten.
 *
 * Documenting a known limitation is prose, and prose rots silently. Asserting it cannot.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { SEEDING_LOCK } from './library-seeding.ts';
import { SMALL_FACT_KEYS } from './google-account.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = dirname(HERE);
const CORE_ROOT = join(dirname(SOURCE_ROOT), 'core');

/** The prefix every name this application writes into the browser's small-fact storage carries. */
const PREFIX = 'fit.';

/**
 * Names that start with the prefix and are NOT storage, with the reason each one is not.
 *
 * Every entry is a claim that the ABSENCE from the sweep is correct. A name may not be parked here
 * to make a failing test pass — a reviewer's job is to check the reason against the code.
 */
const NOT_STORAGE = Object.freeze({
  'fit.snapshot.json':
    'the name of a file in the coach\'s Google Drive, named in a comment in core/sync/partition.js. '
    + 'It is REMOTE rather than local, and erasing this device deliberately does not touch the '
    + 'backup — that is the whole reason signing in again brings his practice back. It is here '
    + 'because the scan reads the prefix wherever it appears, which is what makes it able to catch '
    + 'a key somebody added without telling anyone.',
  [SEEDING_LOCK]:
    'a lock name held across the first-run seeding so two windows of one browser cannot both '
    + 'import, taken from the platform lock manager. Nothing is stored under it and there is '
    + 'nothing to sweep; the lock does not outlive the tab that held it.',
});

/** Every application source file under `src/` and `core/` — no tests, no harnesses. */
function applicationSources(): string[] {
  const files: string[] = [];
  for (const root of [SOURCE_ROOT, CORE_ROOT]) {
    for (const name of readdirSync(root, { recursive: true })) {
      const relative = String(name).split('\\').join('/');
      if (!['.ts', '.tsx', '.js'].some((suffix) => relative.endsWith(suffix))) continue;
      if (relative.includes('.test.')) continue;
      if (relative.includes('/testing/') || relative.endsWith('/testing.js')) continue;
      files.push(join(root, String(name)));
    }
  }
  return files;
}

/** The characters a storage name here is written from. Anything else ends the name. */
const NAME_CHARACTERS = new Set([
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.-_',
]);

/**
 * Every `fit.`-prefixed name any application source names.
 *
 * A plain scan rather than a pattern, because shipped source under `src` is regex-free and a test
 * reaching for one to read that source would be an odd thing to have.
 */
function namesInSource(): Set<string> {
  const found = new Set<string>();
  for (const path of applicationSources()) {
    const text = readFileSync(path, 'utf8');
    let from = text.indexOf(PREFIX);
    while (from !== -1) {
      let to = from;
      while (to < text.length && NAME_CHARACTERS.has(text[to] as string)) to += 1;
      const name = text.slice(from, to);
      // A sentence mentioning the prefix in prose ends up as the bare prefix; a real name has more.
      if (name.length > PREFIX.length && !name.endsWith('.')) found.add(name);
      from = text.indexOf(PREFIX, to === from ? from + 1 : to);
    }
  }
  return found;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('every small fact outside the database is accounted for', () => {
  it('is either swept by the erase or stated not to be storage — no third state', () => {
    const swept = new Set(SMALL_FACT_KEYS);
    const stated = new Set(Object.keys(NOT_STORAGE));

    const unaccounted = [...namesInSource()].filter((name) => !swept.has(name) && !stated.has(name));

    assert.deepEqual(unaccounted, [],
      'a name the application writes and the erase does not sweep would SURVIVE somebody being told '
      + 'this device was erased. If it is storage, add it to SMALL_FACT_KEYS. If it is not, say so '
      + 'in NOT_STORAGE with the reason, where a reviewer can check it against the code.');
  });

  it('sweeps nothing that no longer exists', () => {
    const named = namesInSource();
    for (const key of SMALL_FACT_KEYS) {
      assert.ok(named.has(key), `${key} is swept and nothing names it any more`);
    }
  });

  it('and the scan can genuinely find names — it is not reading an empty tree', () => {
    const named = namesInSource();

    assert.ok(named.has('fit.device-tag'),
      'this one is definitely there, in local-store.ts. If the scan cannot find it then both '
      + 'assertions above pass for free and this file proves precisely nothing.');
    assert.ok(named.size >= SMALL_FACT_KEYS.length,
      'and it found at least as many as are swept');
    assert.ok(applicationSources().length > 40,
      'and it really is walking the source tree rather than an empty list');
  });
});

describe('nothing but the local database holds device key material', () => {
  /** Files declaring an implementation of the key-store port. */
  function implementations(): string[] {
    const found: string[] = [];
    for (const path of applicationSources()) {
      if (readFileSync(path, 'utf8').includes('extends DeviceKeyStore')) {
        found.push(path.split('\\').join('/').split('/').slice(-2).join('/'));
      }
    }
    return found.sort();
  }

  it('has exactly one implementation, and it holds nothing that outlives the tab', () => {
    assert.deepEqual(implementations(), ['crypto/device-key-store.js'],
      'THIS IS THE ASSERTION THAT MUST GO RED when a browser key store is written. The erase '
      + 'destroys the device slot by deleting the local database, which is where a browser holds a '
      + 'non-extractable key object. A key store that kept it anywhere ELSE would leave the device '
      + 'slot alive on a machine the coach was told had been erased — and the sentence in '
      + 'google-account.ts about what erasing destroys would be confidently wrong. Extend the '
      + 'erase, then extend this list.');
  });

  it('and the scan for one is not vacuous', () => {
    assert.equal(implementations().length, 1,
      'a scan whose entire output is an absence must be seen to find a known positive in the same '
      + 'run; this one finds the in-memory store, which is genuinely there');
  });
});
