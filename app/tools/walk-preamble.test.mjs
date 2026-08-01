/**
 * THE WALK PREAMBLE, PROVEN CAPABLE OF FAILING.
 *
 * The preamble's whole value is an ABSENCE-SHAPED claim — "the browser did not execute a
 * different build" — and this project has paid repeatedly for the fact that such a claim passes
 * identically when the check is broken. So every check here is exercised in BOTH directions: once
 * against a reading that should pass it, and once against the specific reading it exists to
 * catch, asserting on the check's OWN identifier rather than merely on the overall verdict.
 *
 * The two that carry the most weight, and why:
 *
 *   - `entry-module-observed-at-all`. Both entry comparisons are comparisons against a LIST, and a
 *     comparison against an empty list is the vacuous pass. A page that loaded no application code
 *     must fail here rather than sail past the mismatch check with nothing to mismatch.
 *   - `executed-build-stamp-…`. It is the only check that can see a stale bundle whose entry
 *     FILENAME did not change, which is exactly what a CSS-only or asset-only change produces.
 *     There is a test below for precisely that shape: same entry path, different stamp.
 *
 * The browser halves cannot run here, so what is checked about them is what a unit test honestly
 * can: that they parse, and that the reading contract they promise is the one the judge consumes.
 *
 *     npm run test:tools
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  APPLICATION_CHUNK_SEGMENT,
  CHECK_APPLICATION_RAN,
  CHECK_CHUNKS_OBSERVED,
  CHECK_CLEARED,
  CHECK_EXECUTED_ENTRY,
  CHECK_EXECUTED_STAMP,
  CHECK_NOT_SERVED_BY_WORKER,
  CLEAR_OFFLINE_STATE,
  READ_RUNNING_PAGE,
  expectedBuild,
  judgeClearing,
  judgeWalk,
  reportWalk,
} from './walk-preamble.mjs';

const EXPECTED = Object.freeze({
  sourceStamp: '89f08998dce7b5f2',
  entryModule: 'assets/index-DsYfoItL.js',
  entryPath: '/Fit/assets/index-DsYfoItL.js',
  indexHtmlNamesEntry: true,
});

/** A reading of a page that is exactly what the preamble wants to see. */
function goodReading(overrides = {}) {
  return {
    url: 'http://localhost:4173/Fit/#/admin',
    chunksLoaded: ['/Fit/assets/index-DsYfoItL.js'],
    mounted: true,
    stamp: '89f08998dce7b5f2',
    // Zero means the browser fetched this document from the network itself. A registration being
    // present again is expected — the application registers one on every start — and deliberately
    // does NOT fail the walk.
    navigationWorkerStart: 0,
    controller: 'http://localhost:4173/Fit/sw.js',
    registrations: 1,
    caches: ['fit-shell-89f08998dce7b5f2'],
    ...overrides,
  };
}

/** The one check with this id, or a failure naming what was actually there. */
function check(verdict, id) {
  const found = verdict.checks.find((entry) => entry.id === id);
  assert.ok(
    found !== undefined,
    `no check named "${id}" was reported; the verdict held [${verdict.checks
      .map((entry) => entry.id)
      .join(', ')}]`,
  );
  return found;
}

describe('the walk preamble passes a page that is genuinely running this build', () => {
  it('is green, and every check it reports is green', () => {
    const verdict = judgeWalk({ expected: EXPECTED, reading: goodReading() });

    assert.equal(verdict.ok, true, reportWalk(verdict));
    // Guards the reverse of the usual worry: a verdict that is green because it ran NO checks.
    assert.equal(verdict.checks.length, 5);
    assert.ok(verdict.checks.every((entry) => entry.ok));
  });

  it('names every check it claims to own, so a red can be attributed', () => {
    const verdict = judgeWalk({ expected: EXPECTED, reading: goodReading() });
    const ids = verdict.checks.map((entry) => entry.id).sort();

    assert.deepEqual(ids, [
      CHECK_APPLICATION_RAN,
      CHECK_CHUNKS_OBSERVED,
      CHECK_EXECUTED_ENTRY,
      CHECK_EXECUTED_STAMP,
      CHECK_NOT_SERVED_BY_WORKER,
    ].sort());
  });

  it('DOES NOT fail merely because a worker is registered again after the clear', () => {
    // Measured 2026-07-31: the application registers its worker from its own start-up effect, so a
    // page loaded cleanly from the network has a registration within a second. An earlier version
    // of this check asserted `registrations === 0` and reddened every clean walk.
    const verdict = judgeWalk({
      expected: EXPECTED,
      reading: goodReading({
        navigationWorkerStart: 0,
        registrations: 1,
        controller: 'http://localhost:4173/Fit/sw.js',
        caches: ['fit-shell-89f08998dce7b5f2'],
      }),
    });

    assert.equal(verdict.ok, true, reportWalk(verdict));
  });
});

describe('every check goes red against the state it exists to catch', () => {
  it('refuses a document a service worker actually served', () => {
    const verdict = judgeWalk({
      expected: EXPECTED,
      reading: goodReading({
        navigationWorkerStart: 12.5,
        controller: 'http://localhost:4173/Fit/sw.js',
        registrations: 1,
      }),
    });

    const failed = check(verdict, CHECK_NOT_SERVED_BY_WORKER);
    assert.equal(failed.ok, false);
    assert.match(failed.message, /A SERVICE WORKER SERVED THIS DOCUMENT/);
    assert.equal(verdict.ok, false);
  });

  it('refuses rather than assumes when the navigation timing cannot be read', () => {
    const verdict = judgeWalk({
      expected: EXPECTED,
      reading: goodReading({ navigationWorkerStart: null }),
    });

    const failed = check(verdict, CHECK_NOT_SERVED_BY_WORKER);
    assert.equal(failed.ok, false);
    assert.match(failed.message, /COULD NOT BE READ/);
    assert.match(failed.message, /Refused rather than assumed/);
  });

  it('refuses a page whose application never rendered, even with the right chunk fetched', () => {
    const verdict = judgeWalk({ expected: EXPECTED, reading: goodReading({ mounted: false }) });

    const failed = check(verdict, CHECK_APPLICATION_RAN);
    assert.equal(failed.ok, false);
    assert.match(failed.message, /DID NOT RENDER/);
    // The point of this check: fetched is not executed, and the chunk comparison cannot tell.
    assert.equal(check(verdict, CHECK_EXECUTED_ENTRY).ok, true);
  });

  it('REFUSES A VACUOUS PASS: no application chunk observed at all', () => {
    const verdict = judgeWalk({ expected: EXPECTED, reading: goodReading({ chunksLoaded: [] }) });

    const failed = check(verdict, CHECK_CHUNKS_OBSERVED);
    assert.equal(failed.ok, false);
    assert.match(failed.message, /NO APPLICATION CHUNK WAS OBSERVED AT ALL/);
    assert.match(failed.message, /pass vacuously/);
  });

  it('refuses a page that executed a different entry module', () => {
    const verdict = judgeWalk({
      expected: EXPECTED,
      reading: goodReading({ chunksLoaded: ['/Fit/assets/index-OLDoldOL.js'] }),
    });

    const failed = check(verdict, CHECK_EXECUTED_ENTRY);
    assert.equal(failed.ok, false);
    assert.match(failed.message, /DID NOT EXECUTE THE ENTRY MODULE/);
    assert.match(failed.message, /index-OLDoldOL\.js/);
  });

  it('refuses a page that loaded the right entry AND an extra chunk from another build', () => {
    const verdict = judgeWalk({
      expected: EXPECTED,
      reading: goodReading({
        chunksLoaded: ['/Fit/assets/index-DsYfoItL.js', '/Fit/assets/index-OLDoldOL.js'],
      }),
    });

    assert.equal(check(verdict, CHECK_EXECUTED_ENTRY).ok, false);
  });

  it('THE SILENT CASE: same entry filename, different build — only the stamp check sees it', () => {
    // A CSS-only or asset-only change does not move the entry chunk's content hash, so the
    // filename is identical across the two builds and every filename-based comparison agrees.
    const verdict = judgeWalk({
      expected: EXPECTED,
      reading: goodReading({ stamp: '0000deadbeef0000' }),
    });

    assert.equal(check(verdict, CHECK_EXECUTED_ENTRY).ok, true, 'the filename genuinely matches');
    const failed = check(verdict, CHECK_EXECUTED_STAMP);
    assert.equal(failed.ok, false);
    assert.match(failed.message, /A DIFFERENT BUILD FROM THE ONE ON DISK/);
    assert.match(failed.message, /0000deadbeef0000/);
    assert.match(failed.message, /89f08998dce7b5f2/);
    assert.equal(verdict.ok, false);
  });

  it('refuses rather than skips when the build stamp cannot be read at all', () => {
    const verdict = judgeWalk({ expected: EXPECTED, reading: goodReading({ stamp: null }) });

    const failed = check(verdict, CHECK_EXECUTED_STAMP);
    assert.equal(failed.ok, false);
    assert.match(failed.message, /COULD NOT BE READ/);
    assert.match(failed.message, /Refused rather than skipped/);
  });
});

describe('the clearing is judged on what it LEFT, not on having been attempted', () => {
  it('accepts a clearing that removed everything', () => {
    const judged = judgeClearing({
      before: { registrations: ['http://localhost:4173/Fit/sw.js'], caches: ['fit-shell-old'] },
      after: { registrations: 0, caches: 0 },
    });

    assert.equal(judged.id, CHECK_CLEARED);
    assert.equal(judged.ok, true);
    assert.match(judged.message, /1 service worker\(s\) and 1 cache\(s\) removed/);
  });

  it('refuses a clearing that left a registration behind', () => {
    const judged = judgeClearing({
      before: { registrations: ['http://localhost:4173/Fit/sw.js'], caches: [] },
      after: { registrations: 1, caches: 0 },
    });

    assert.equal(judged.ok, false);
    assert.match(judged.message, /THE CLEARING DID NOT CLEAR/);
  });

  it('refuses a clearing that left a cache behind', () => {
    const judged = judgeClearing({
      before: { registrations: [], caches: ['fit-shell-old'] },
      after: { registrations: 0, caches: 1 },
    });

    assert.equal(judged.ok, false);
    assert.match(judged.message, /1 cache\(s\)/);
  });
});

describe('the report a person reads puts the failures first', () => {
  it('leads with the red and marks it as red', () => {
    const verdict = judgeWalk({ expected: EXPECTED, reading: goodReading({ stamp: 'other' }) });
    const lines = reportWalk(verdict).split('\n');

    assert.ok(lines[0].startsWith('RED '), lines[0]);
    assert.ok(lines[0].includes(CHECK_EXECUTED_STAMP));
    assert.equal(lines.length, 5);
  });
});

describe('the page halves are real programs and promise the reading the judge consumes', () => {
  it('both sources parse as ECMAScript', () => {
    // They are evaluated inside the browser by a driver in another process, so a typo here would
    // otherwise surface only as an opaque failure mid-walk.
    for (const [name, source] of [
      ['CLEAR_OFFLINE_STATE', CLEAR_OFFLINE_STATE],
      ['READ_RUNNING_PAGE', READ_RUNNING_PAGE],
    ]) {
      assert.doesNotThrow(() => new Function(`return (${source});`), `${name} does not parse`);
    }
  });

  it('the reading script carries the chunk segment the judge filters on', () => {
    // One definition, used on both sides: a page script hunting for a different segment than the
    // judge expects would silently report an empty chunk list.
    assert.ok(READ_RUNNING_PAGE.includes(JSON.stringify(APPLICATION_CHUNK_SEGMENT)));
  });

  it('the reading script reports every field the judge reads', () => {
    for (const field of ['chunksLoaded', 'mounted', 'stamp', 'navigationWorkerStart', 'controller']) {
      assert.ok(READ_RUNNING_PAGE.includes(field), `READ_RUNNING_PAGE never mentions ${field}`);
    }
  });
});

describe('what dist/ says the browser ought to be running', () => {
  it('reads the entry and stamp from the build record and notes whether the markup agrees', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'walk-preamble-'));
    try {
      await mkdir(path.join(root, 'dist'), { recursive: true });
      await writeFile(
        path.join(root, 'dist', 'build-info.json'),
        JSON.stringify({ sourceStamp: 'abcd1234abcd1234', entryModule: 'assets/index-AAAA.js' }),
      );
      await writeFile(
        path.join(root, 'dist', 'index.html'),
        '<!doctype html><script type="module" src="/Fit/assets/index-AAAA.js"></script>',
      );

      const expected = await expectedBuild(root);

      assert.equal(expected.sourceStamp, 'abcd1234abcd1234');
      assert.equal(expected.entryPath, '/Fit/assets/index-AAAA.js');
      assert.equal(expected.indexHtmlNamesEntry, true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports a build record and a markup file that disagree, rather than assuming they agree', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'walk-preamble-'));
    try {
      await mkdir(path.join(root, 'dist'), { recursive: true });
      await writeFile(
        path.join(root, 'dist', 'build-info.json'),
        JSON.stringify({ sourceStamp: 'abcd1234abcd1234', entryModule: 'assets/index-AAAA.js' }),
      );
      await writeFile(
        path.join(root, 'dist', 'index.html'),
        '<!doctype html><script type="module" src="/Fit/assets/index-BBBB.js"></script>',
      );

      assert.equal((await expectedBuild(root)).indexHtmlNamesEntry, false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
