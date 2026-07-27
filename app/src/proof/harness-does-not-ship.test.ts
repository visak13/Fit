/**
 * THE PROOF PAGE IS NOT IN THE PUBLISHED ARTEFACT — asserted against the artefact, not against a
 * configuration.
 *
 * ## What is being guarded, and why a promise was not enough
 *
 * `src/proof/sync-join.tsx` is a second composition root that points the coach's backup at an in-memory
 * double. That is legitimate where it is: it is how the synchronisation join was watched happening in a
 * real browser without putting a flag into production code. It would be a serious defect if it SHIPPED.
 * A page reachable in the public bundle that writes his practice to a fake destination is the exact
 * thing the no-backdoor discipline exists to prevent, arriving through a different door.
 *
 * It is safe today because it is not an entry in the bundler's inputs, so `vite build` never reaches it.
 * THAT IS A CONFIGURATION, AND A CONFIGURATION WITH NO TEST IS A PROMISE. Adding an entry to
 * `rollupOptions.input` for some later reason — a second real page, a print view, an installer — would
 * emit every root the bundler can find, and nothing anywhere would say so. The step that rebuilds on a
 * settled tree would produce a green build containing it.
 *
 * ## THE POSITIVE CONTROL IS THE POINT OF THIS FILE, NOT A COURTESY
 *
 * An absence-shaped check is the easiest kind to pass by accident. If `dist/` moved, or the scan read
 * the wrong directory, or the glob stopped matching, "the harness is not in the output" would be
 * reported by a scan looking at nothing at all — green, and blind. So every assertion below is paired
 * with something that is KNOWN to be present and MUST be found: the real entry, the real markup, the
 * real chunk. If the control is not found, this file fails and says the scan is broken rather than
 * saying the output is clean.
 *
 * ## What it reads
 *
 * The COMMITTED build output. This application commits its artefact, so the thing published is on disk
 * and can be looked at directly rather than inferred from a build that this test would have to run.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { OUTPUT_DIRECTORY } from '../../tools/build-config.mjs';

const applicationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const output = path.join(applicationRoot, OUTPUT_DIRECTORY);

/** Every file in the built output, relative to it, at any depth. */
async function everythingEmitted(directory: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const here = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      // eslint-disable-next-line no-await-in-loop
      found.push(...await everythingEmitted(path.join(directory, entry.name), here));
    } else {
      found.push(here);
    }
  }
  return found;
}

const emitted = await everythingEmitted(output);

/** The text of every emitted file that could carry a module graph or a script reference. */
const readable = await Promise.all(
  emitted
    .filter((name) => /\.(html|js|css|json|webmanifest)$/.test(name))
    .map(async (name) => ({ name, text: await readFile(path.join(output, name), 'utf8') })),
);

describe('the scan is looking at a real published artefact', () => {
  it('found the output directory, with files in it', async () => {
    const details = await stat(output);
    assert.ok(details.isDirectory(), `${OUTPUT_DIRECTORY} is not a directory`);
    assert.ok(
      emitted.length > 3,
      `only ${emitted.length} files were found in ${OUTPUT_DIRECTORY}. An absence-shaped check over an `
      + 'empty directory is a green tick for nothing.',
    );
  });

  it('found the REAL entry, which is the positive control for every absence below', () => {
    assert.ok(
      emitted.includes('index.html'),
      'the shipped page is not in the output, so this scan cannot be trusted to say what is',
    );
    const shipped = readable.find((file) => file.name === 'index.html');
    assert.ok(shipped !== undefined);
    assert.match(
      shipped.text,
      /<div id="root">/,
      'the shipped markup does not look like this application\'s page',
    );
    assert.ok(
      emitted.some((name) => name.startsWith('assets/') && name.endsWith('.js')),
      'no bundled script was emitted, so a scan for a script that must NOT be there proves nothing',
    );
  });

  it('and the control really can tell present from absent', () => {
    // The check below looks for the harness by name. Prove the same method FINDS something that is
    // genuinely in the output, so a clean result means clean rather than broken.
    const mentionsTheRealEntry = readable.some((file) => file.text.includes('index'));
    assert.ok(
      mentionsTheRealEntry,
      'the search method found no trace of the real entry anywhere, so it is not a working search',
    );
  });
});

describe('the proof harness is nowhere in the published artefact', () => {
  /** The names that would betray it. Each is a distinct way it could arrive. */
  const TRACES: ReadonlyArray<{ what: string; pattern: RegExp }> = [
    { what: 'the harness page itself', pattern: /sync-join\.html/ },
    { what: 'the harness module', pattern: /sync-join\.tsx/ },
    { what: 'the proof directory', pattern: /src\/proof|proof\/sync-join/ },
    {
      what: 'the global the harness hangs its hooks on',
      pattern: /proofOfTheJoin/,
    },
    {
      what: 'the in-memory double, which is the fake backup destination itself',
      pattern: /InMemoryRemoteStorage/,
    },
    {
      what: 'the double\'s own switchboard for making a service misbehave',
      pattern: /DOUBLE_REFUSES|failNext/,
    },
    {
      what: 'the core\'s test fixtures, which the harness imports to invent a client',
      pattern: /model\/fixtures/,
    },
  ];

  it('EVERY PATTERN IS PROVEN ABLE TO FIND THE HARNESS — the probe that stops a typo passing', async () => {
    // The whole check is a set of regular expressions asserted not to match. A misspelled one never
    // matches anything, so it reports the output clean for ever and the guard is decoration. So each
    // one is pointed at the harness's own source, where it MUST fire.
    const harness = await readFile(path.join(applicationRoot, 'src', 'proof', 'sync-join.tsx'), 'utf8');
    const page = await readFile(path.join(applicationRoot, 'src', 'proof', 'sync-join.html'), 'utf8');
    const both = `${harness}\n${page}`;

    for (const { what, pattern } of TRACES) {
      assert.match(
        both,
        pattern,
        `the pattern for ${what} does not match the harness it is supposed to detect, so its absence `
        + 'from the built output says nothing at all',
      );
    }
  });

  it('emitted no file whose NAME belongs to the harness', () => {
    const named = emitted.filter((name) => /proof|sync-join/i.test(name));
    assert.deepEqual(named, [], 'the harness was emitted as a file of its own');
  });

  for (const { what, pattern } of TRACES) {
    it(`carries no trace of ${what}`, () => {
      const guilty = readable
        .filter((file) => pattern.test(file.text))
        .map((file) => file.name);
      assert.deepEqual(
        guilty,
        [],
        `${what} reached the published artefact, in: ${guilty.join(', ')}. A page that writes the `
        + 'coach\'s practice to a fake backup destination must not be reachable in a public bundle.',
      );
    });
  }

  it('and the service worker does not offer it for offline use either', () => {
    const worker = readable.find((file) => file.name === 'sw.js');
    assert.ok(worker !== undefined, 'no service worker was emitted, so this check has nothing to read');
    assert.doesNotMatch(worker.text, /proof|sync-join/i, 'the harness is in the offline cache list');
    // The control: the worker really does list the things it caches, so the check above is reading a
    // list rather than an empty file.
    assert.match(
      worker.text,
      /index\.html|\.\/|assets\//,
      'the service worker does not appear to reference any asset, so a clean scan of it means nothing',
    );
  });
});
