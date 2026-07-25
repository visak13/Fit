/**
 * THE ONE MECHANISM THAT MAKES A DISCOVERING TEST GATE SAFE, NOW SHARED BY ALL THREE.
 *
 * ## The failure, stated once, here
 *
 * Every gate in this project DISCOVERS what to run rather than reading a hand-maintained list. That
 * is the right design and it was chosen for a measured reason: a list a human edits is a list that
 * silently loses entries, and one of them did — several workers each read `package.json`, appended
 * their own directory and wrote it back, and whoever read before a sibling wrote CLOBBERED the
 * sibling. The aggregate went on reporting green over a directory that was failing underneath it.
 *
 * But discovery carries the same failure wearing the opposite mask, and it is worse because it is
 * invisible: **a glob that matches nothing exits ZERO**. `node --test "src/**` + `/*.test.ts"` over a
 * directory that has been renamed, moved or emptied prints a clean run of nothing at all and
 * succeeds. The gate passes while testing NOTHING, and an exit code is an honest answer to a
 * dishonest question.
 *
 * `tools/run-core-tests.mjs` already solved this for the core, and solved it well: a per-directory
 * floor plus an assertion that every directory that ever ran still runs. The shell and tools gates
 * never inherited it — they were plain globs, and the only thing standing between them and a
 * vacuous pass was that every worker had been told BY HAND to read the count and require strictly
 * greater. That is a human habit doing a check's job, and it had already been done wrong once: a
 * count copied from a document was three actions stale, and a stale-low floor does not weaken the
 * check, it INVERTS it.
 *
 * So the mechanism lives here, once, and all three gates call it. There is no second implementation
 * to drift.
 *
 * ## What it refuses to let pass
 *
 *   - NOTHING DISCOVERED AT ALL. The empty-glob failure at suite level, and the only one that used
 *     to be completely silent.
 *   - A directory that has a recorded floor and is no longer discovered.
 *   - A directory that runs FEWER tests than it has been measured running. A number that DROPS is a
 *     failure even when every test passes: tests do not go missing on purpose without someone
 *     saying so.
 *   - A directory that reports zero tests, whatever its exit code says.
 *   - A run whose totals cannot be read at all — an unreadable result and a result of zero are
 *     different things and neither may pass quietly.
 *   - Any failing test, which is the part that was never in doubt.
 *
 * ## Updating floors is a DELIBERATE, SERIALISED act
 *
 * `--update-floors` is the only thing that writes a coverage file. Run it on a green tree, alone,
 * and read the diff. It must never be wired into a build step or run by several workers at once —
 * that recreates precisely the concurrent read-modify-write that lost a directory in the first
 * place, except now on the file whose whole job is to notice. Adding a NEW directory needs no
 * update: it is discovered, it must pass, and it simply has no floor until someone records one.
 * Only a DROP is a failure.
 */

import { spawnSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

/**
 * Every directory under `root` holding files that end in `suffix`, with those files.
 *
 * Discovery is by CONTENT and it recurses, so a suite moved one directory deeper is found rather
 * than lost. A directory is a GROUP: that is the unit a floor is recorded against, because it is
 * the unit that goes missing.
 *
 * @param {string} root absolute path
 * @param {string} suffix e.g. `.test.ts`
 * @param {string} [relativeTo] absolute path names are reported relative to
 * @returns {Promise<Array<{name: string, files: string[]}>>}
 */
export async function discoverByDirectory(root, suffix, relativeTo = root) {
  const groups = [];

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
      .map((entry) => path.join(directory, entry.name))
      .sort();

    if (files.length > 0) {
      const name = path.relative(relativeTo, directory).split(path.sep).join('/') || '.';
      groups.push({ name, files });
    }

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'node_modules') {
        await walk(path.join(directory, entry.name));
      }
    }
  }

  await walk(root);
  return groups.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Run one group in its own process and read back what it ACTUALLY ran.
 *
 * The counts come from the runner's own totals rather than from counting ticks, and a run whose
 * totals cannot be found is a failure rather than a zero.
 *
 * @param {{cwd: string, nodeArgs?: string[], target: string[]}} group
 */
function runGroup({ cwd, nodeArgs = [], target }) {
  // A CHILD TEST RUN MUST NOT INHERIT A PARENT ONE. Node marks a test process with
  // `NODE_TEST_CONTEXT`, and a `node --test` that sees it refuses to run any file at all —
  // "run() is being called recursively" — while still exiting ZERO with a total of nothing. That is
  // this gate's own failure mode turned on itself, and it is exactly what happened the first time
  // the gate was run from inside a test. Cleared here rather than at each call site.
  const { NODE_TEST_CONTEXT: _ignored, ...environment } = process.env;

  const result = spawnSync(process.execPath, [...nodeArgs, '--test', ...target], {
    cwd,
    encoding: 'utf8',
    env: environment,
    maxBuffer: 64 * 1024 * 1024,
  });

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const readTotal = (label) => {
    const matches = [...output.matchAll(new RegExp(`^\\W*${label} (\\d+)$`, 'gm'))];
    return matches.length === 0 ? null : Number(matches.at(-1)[1]);
  };

  return {
    tests: readTotal('tests'),
    pass: readTotal('pass'),
    fail: readTotal('fail'),
    status: result.status ?? 1,
    output,
  };
}

/**
 * THE GATE. Runs every group, holds every floor, and reports what it measured.
 *
 * @param {{
 *   label: string,
 *   cwd: string,
 *   coverageFile: string,
 *   groups: Array<{name: string, files: string[]}>,
 *   nodeArgs?: string[],
 *   updateFloors?: boolean,
 *   priorFailures?: string[],
 *   emptyDiscoveryHint?: string,
 * }} plan
 * @returns {Promise<{failures: string[], total: number, measured: Record<string, number>}>}
 */
export async function runTestGate(plan) {
  const {
    label,
    cwd,
    coverageFile,
    groups,
    nodeArgs = [],
    updateFloors = false,
    priorFailures = [],
    emptyDiscoveryHint = '',
  } = plan;

  /** @type {{measured: Record<string, number>, note?: string}} */
  let coverage;
  try {
    coverage = JSON.parse(await readFile(coverageFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    coverage = { measured: {} };
  }
  const floors = coverage.measured ?? {};
  const failures = [...priorFailures];

  console.log(`discovered ${groups.length} ${label} directories with tests:`);
  console.log(`  ${groups.map((group) => group.name).join(', ') || '(none)'}\n`);

  // THE EMPTY-GLOB FAILURE, caught at last. A discovering gate that finds nothing has always
  // reported success; there is nothing to run, every count holds, and the exit code is zero.
  if (groups.length === 0) {
    failures.push(
      `NOTHING WAS DISCOVERED for ${label}. A gate that finds no tests runs no tests and exits ` +
        'zero, which is indistinguishable from a green run and is the exact failure this gate ' +
        `exists to catch.${emptyDiscoveryHint === '' ? '' : ` ${emptyDiscoveryHint}`}`,
    );
  }

  // A directory that WAS covered and is not discovered now. Checked before anything runs, so it is
  // reported even if a suite later fails for its own reasons.
  for (const name of Object.keys(floors)) {
    if (!groups.some((group) => group.name === name)) {
      failures.push(
        `${label}/${name} previously ran ${floors[name]} tests and is NO LONGER DISCOVERED. Either ` +
          'its test files were removed — in which case say so deliberately and update ' +
          `${path.basename(coverageFile)} — or coverage has silently been lost.`,
      );
    }
  }

  /** @type {Record<string, number>} */
  const measured = {};
  let total = 0;

  for (const group of groups) {
    const run = runGroup({ cwd, nodeArgs, target: group.files });
    const floor = floors[group.name];

    if (run.tests === null) {
      failures.push(`${label}/${group.name}: could not read a test total from the runner output.`);
      console.log(run.output);
      continue;
    }

    measured[group.name] = run.tests;
    total += run.tests;

    const flag =
      run.status !== 0 || run.fail > 0
        ? 'FAILED'
        : run.tests === 0
          ? 'RAN NOTHING'
          : floor !== undefined && run.tests < floor
            ? `DROPPED from ${floor}`
            : 'ok';

    console.log(
      `  ${group.name.padEnd(14)} ${String(run.tests).padStart(4)} tests` +
        `  ${String(run.pass ?? 0).padStart(4)} pass` +
        `  ${String(run.fail ?? 0).padStart(2)} fail` +
        `  floor ${floor === undefined ? '  —' : String(floor).padStart(3)}` +
        `  ${flag}`,
    );

    if (run.status !== 0 || run.fail > 0) {
      failures.push(`${label}/${group.name}: ${run.fail ?? '?'} failing tests (exit ${run.status}).`);
      console.log(run.output);
      continue;
    }
    if (run.tests === 0) {
      failures.push(
        `${label}/${group.name} ran ZERO tests while exiting 0. That is the vacuous pass this gate ` +
          'exists to catch, not a directory with nothing in it.',
      );
      continue;
    }
    if (floor !== undefined && run.tests < floor) {
      failures.push(
        `${label}/${group.name} ran ${run.tests} tests but has previously run ${floor}. A count ` +
          'that DROPS is a failure even when every test passes: tests do not go missing on purpose ' +
          'without someone saying so.',
      );
    }
  }

  console.log(
    `\n  ${'TOTAL'.padEnd(14)} ${String(total).padStart(4)} tests across ${groups.length} directories`,
  );

  if (updateFloors) {
    if (failures.length > 0) {
      console.error('\nrefusing to record floors from a run that did not pass cleanly.');
    } else {
      await writeFile(
        coverageFile,
        `${JSON.stringify({ ...coverage, measured, total }, null, 2)}\n`,
        'utf8',
      );
      console.log(`\nrecorded new floors in ${path.basename(coverageFile)} (total ${total}).`);
      return { failures, total, measured };
    }
  }

  if (failures.length > 0) {
    console.error(`\n${label.toUpperCase()} TEST GATE FAILED\n`);
    for (const failure of failures) console.error(`  - ${failure}\n`);
    process.exitCode = 1;
    return { failures, total, measured };
  }

  console.log('\nevery discovered directory ran, every count held its floor.');
  return { failures, total, measured };
}
