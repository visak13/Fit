/**
 * THE GATE'S OWN GATE.
 *
 * `tools/test-gate.mjs` is the thing that decides whether every other gate in this project is
 * telling the truth, so a protection nobody has seen fail is a protection nobody should trust. It
 * was proven to fail by hand when it was built — an emptied root, a dropped floor, a directory
 * moved aside — and these are those proofs made permanent, because a hand-run proof only ever holds
 * for the person who ran it.
 *
 * The three cases here are the three that used to be SILENT. Each one is a run that exits zero
 * today under a plain glob while testing less than it claims.
 */

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, before, after } from 'node:test';

import { discoverByDirectory, runTestGate } from './test-gate.mjs';

/** A test file that really runs, so the gate is reading a real total rather than a parsed guess. */
const ONE_PASSING_TEST = `
import { test } from 'node:test';
import assert from 'node:assert/strict';
test('a real test, so the count is a measurement', () => assert.ok(true));
`;

let workspace;

before(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'fit-test-gate-'));
  await mkdir(path.join(workspace, 'suites', 'alpha'), { recursive: true });
  await mkdir(path.join(workspace, 'suites', 'beta'), { recursive: true });
  await mkdir(path.join(workspace, 'empty'), { recursive: true });
  await writeFile(path.join(workspace, 'suites', 'alpha', 'a.test.mjs'), ONE_PASSING_TEST);
  await writeFile(path.join(workspace, 'suites', 'beta', 'b.test.mjs'), ONE_PASSING_TEST);
});

after(async () => {
  await rm(workspace, { recursive: true, force: true });
});

/** Runs the gate without letting a deliberate failure set this suite's own exit code. */
async function gate(options) {
  const previous = process.exitCode;
  const result = await runTestGate({ label: 'fixture', cwd: workspace, ...options });
  process.exitCode = previous;
  return result;
}

describe('discovery', () => {
  it('groups test files by the directory they live in, recursively', async () => {
    const groups = await discoverByDirectory(workspace, '.test.mjs', workspace);
    assert.deepEqual(
      groups.map((group) => group.name),
      ['suites/alpha', 'suites/beta'],
    );
    assert.equal(groups[0].files.length, 1);
  });

  it('finds nothing in a directory with nothing in it, which is the case that must not pass', async () => {
    const groups = await discoverByDirectory(path.join(workspace, 'empty'), '.test.mjs');
    assert.deepEqual(groups, []);
  });
});

describe('the failures that used to be silent', () => {
  it('REFUSES A RUN THAT DISCOVERED NOTHING, which a bare glob reports as success', async () => {
    const { failures, total } = await gate({
      coverageFile: path.join(workspace, 'no-such-coverage.json'),
      groups: [],
    });

    assert.equal(total, 0);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /NOTHING WAS DISCOVERED/);
  });

  it('refuses a directory that has a recorded floor and is no longer discovered', async () => {
    const coverageFile = path.join(workspace, 'coverage-missing.json');
    await writeFile(coverageFile, JSON.stringify({ measured: { 'suites/gamma': 4 } }));

    const { failures } = await gate({
      coverageFile,
      groups: await discoverByDirectory(workspace, '.test.mjs', workspace),
    });

    assert.equal(failures.length, 1);
    assert.match(failures[0], /suites\/gamma previously ran 4 tests and is NO LONGER DISCOVERED/);
  });

  it('refuses a count that DROPPED even though every test passed', async () => {
    const coverageFile = path.join(workspace, 'coverage-dropped.json');
    await writeFile(coverageFile, JSON.stringify({ measured: { 'suites/alpha': 9 } }));

    const { failures, total } = await gate({
      coverageFile,
      groups: await discoverByDirectory(workspace, '.test.mjs', workspace),
    });

    assert.equal(total, 2, 'both fixture suites really ran');
    assert.equal(failures.length, 1);
    assert.match(failures[0], /ran 1 tests but has previously run 9/);
  });

  it('passes, and says so, when every directory ran and every floor held', async () => {
    const coverageFile = path.join(workspace, 'coverage-green.json');
    await writeFile(coverageFile, JSON.stringify({ measured: { 'suites/alpha': 1, 'suites/beta': 1 } }));

    const { failures, total } = await gate({
      coverageFile,
      groups: await discoverByDirectory(workspace, '.test.mjs', workspace),
    });

    assert.deepEqual(failures, []);
    assert.equal(total, 2);
  });

  it('records floors only from a clean run, never from a failing one', async () => {
    const coverageFile = path.join(workspace, 'coverage-refuse.json');
    await writeFile(coverageFile, JSON.stringify({ measured: { 'suites/gamma': 4 } }));

    await gate({
      coverageFile,
      groups: await discoverByDirectory(workspace, '.test.mjs', workspace),
      updateFloors: true,
    });

    const after = JSON.parse(await (await import('node:fs/promises')).readFile(coverageFile, 'utf8'));
    assert.deepEqual(
      after.measured,
      { 'suites/gamma': 4 },
      'the floors were rewritten from a run that had already failed, which would erase the very ' +
        'record that failed it',
    );
  });
});
