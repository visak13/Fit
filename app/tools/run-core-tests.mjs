/**
 * THE AGGREGATE CORE TEST GATE — it DISCOVERS what to run, and it refuses to shrink quietly.
 *
 * ## The failure this replaces, which is the whole reason it exists
 *
 * `npm test` used to be a hand-maintained list of directories written into `package.json`. That
 * list lost an entry, and the mechanism is worth stating precisely because it is not carelessness
 * and it will happen again to any shared file: several workers were building different core
 * packages in parallel, and each one read `package.json`, appended its own directory, and wrote it
 * back. A worker that read before a sibling wrote CLOBBERED the sibling's entry. Nobody edited
 * anything wrongly and no write failed.
 *
 * What made it expensive is that the loss is invisible from both sides. Each worker only ever ran
 * its OWN directory, so the entry it destroyed belonged to a suite it never exercised; the sibling
 * whose entry vanished is the one least able to notice. The aggregate went on reporting green
 * while a directory underneath it was FAILING, and the action that owned that directory stood
 * recorded as done with its own gate exiting non-zero. It was caught by another worker adding
 * coverage — not by the gate, not by the reviewer, not by the planner.
 *
 * So this runner takes the shared file out of the loop entirely. Nothing has to be edited to add a
 * core package: put test files in it, give it the entry point every core package already needs,
 * and the gate finds it. A list a human edits is a list that silently loses entries.
 *
 * ## But discovery has the SAME failure wearing the opposite mask
 *
 * A discovering gate can find FEWER directories than the list did and still exit zero, which is
 * the identical defect: an absence that looks exactly like a pass. Discovery removes the clobbering
 * mechanism; it does not remove the shape.
 *
 * That is what `core-coverage.json` is for. It records, per directory, the number of tests that
 * directory has actually been MEASURED to run. This gate fails loudly when:
 *
 *   - a directory named in that file is no longer discovered at all;
 *   - a discovered directory runs FEWER tests than it is recorded as having run;
 *   - a discovered directory has test files but no entry point, so it would run nothing;
 *   - an entry point does not import every test file beside it, so it would run only some;
 *   - any directory reports zero tests, whatever its exit code says.
 *
 * A NUMBER THAT DROPS IS A FAILURE EVEN WHEN EVERY TEST PASSES. That sentence is the point of
 * this file. Five separate times in this build a gate exited zero having tested less than it
 * claimed — a directory argument that resolved as a module and ran nothing, a validator run in a
 * mode that skipped its own rules, a list that lost an entry — and in every case the exit code was
 * an honest report of a dishonest question.
 *
 * ## Reading the output
 *
 * A table of directory, tests run, and the recorded floor, then a total. Evidence for this gate is
 * the COUNT, never the exit status alone: a count is present or it is wrong, whereas an absence is
 * invisible to anything that checks only whether a command succeeded.
 *
 *     npm test                        run the gate
 *     node tools/run-core-tests.mjs --update-floors
 *                                     rewrite core-coverage.json from a green run
 *
 * ## Updating the floors is a DELIBERATE, SERIALISED act
 *
 * `--update-floors` exists so the recorded numbers can rise when real tests are added, and it is
 * the only thing that writes that file. Run it on a green tree, alone, and read the diff. It must
 * never be wired into a build step or run by several workers at once — that would recreate exactly
 * the concurrent read-modify-write that lost the directory in the first place, except now on the
 * file whose whole job is to notice.
 *
 * Adding a NEW directory needs no update at all: it is discovered, it must pass, and it simply has
 * no floor until someone records one. Only a DROP is a failure.
 */

import { spawnSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const applicationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE_DIRECTORY = path.join(applicationRoot, 'core');
const COVERAGE_FILE = path.join(applicationRoot, 'tools', 'core-coverage.json');

/** The file every core package carries so a directory target runs its suites instead of nothing. */
const TEST_ENTRY_FILE = 'index.js';

/**
 * Every directory directly under `core/` that holds test files, with the test files it holds.
 *
 * Discovery is by CONTENT — a directory qualifies because it contains `*.test.js`, not because
 * anyone remembered to name it somewhere.
 *
 * @returns {Promise<Array<{name: string, testFiles: string[], hasEntry: boolean}>>}
 */
async function discoverCorePackages() {
  const found = [];

  for (const entry of await readdir(CORE_DIRECTORY, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const contents = await readdir(path.join(CORE_DIRECTORY, entry.name), { withFileTypes: true });
    const testFiles = contents
      .filter((file) => file.isFile() && file.name.endsWith('.test.js'))
      .map((file) => file.name)
      .sort();

    if (testFiles.length === 0) continue;

    found.push({
      name: entry.name,
      testFiles,
      hasEntry: contents.some((file) => file.isFile() && file.name === TEST_ENTRY_FILE),
    });
  }

  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The test files a package's entry point actually imports.
 *
 * The entry point is what makes a directory target run anything at all, so an entry that imports
 * only SOME of its suites is the vacuous-pass trap in miniature: the gate runs, the count is
 * plausible, and the suites nobody listed never execute. Checked here rather than trusted.
 *
 * @param {string} packageName
 * @returns {Promise<Set<string>>}
 */
async function importedTestFiles(packageName) {
  const source = await readFile(path.join(CORE_DIRECTORY, packageName, TEST_ENTRY_FILE), 'utf8');
  const imported = new Set();
  for (const match of source.matchAll(/^\s*import\s+'\.\/([^']+\.test\.js)';/gm)) {
    imported.add(match[1]);
  }
  return imported;
}

/**
 * Run one package's suites in its own process and read back what it actually ran.
 *
 * The summary counts are taken from the runner's own totals rather than by counting ticks, and a
 * run whose totals cannot be found is treated as a FAILURE rather than as zero — an unreadable
 * result and a result of zero are different things, and neither may pass silently.
 *
 * @param {string} packageName
 * @returns {{tests: number, pass: number, fail: number, skipped: number, status: number, output: string}}
 */
function runPackage(packageName) {
  const target = `core/${packageName}/${TEST_ENTRY_FILE}`;
  const result = spawnSync(process.execPath, ['--test', target], {
    cwd: applicationRoot,
    encoding: 'utf8',
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
    skipped: readTotal('skipped'),
    status: result.status ?? 1,
    output,
  };
}

async function main() {
  const updateFloors = process.argv.includes('--update-floors');

  /** @type {{measured: Record<string, number>, note?: string}} */
  let coverage;
  try {
    coverage = JSON.parse(await readFile(COVERAGE_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    coverage = { measured: {} };
  }
  const floors = coverage.measured ?? {};

  const packages = await discoverCorePackages();
  const failures = [];

  console.log(`discovered ${packages.length} core directories with tests:`);
  console.log(`  ${packages.map((entry) => entry.name).join(', ')}\n`);

  // A directory that WAS covered and is not discovered now. This is the check that catches the
  // original defect, and it is checked before anything runs so it is reported even if a suite
  // later fails for its own reasons.
  for (const name of Object.keys(floors)) {
    if (!packages.some((entry) => entry.name === name)) {
      failures.push(
        `core/${name} previously ran ${floors[name]} tests and is NO LONGER DISCOVERED. Either its ` +
          'test files were removed — in which case say so deliberately and update ' +
          'tools/core-coverage.json — or coverage has silently been lost.',
      );
    }
  }

  const measured = {};
  let total = 0;

  for (const entry of packages) {
    if (!entry.hasEntry) {
      failures.push(
        `core/${entry.name} holds ${entry.testFiles.length} test files but has no ` +
          `${TEST_ENTRY_FILE}. A directory target resolves as a MODULE on this runtime, so this ` +
          'directory would report success having run nothing.',
      );
      continue;
    }

    const imported = await importedTestFiles(entry.name);
    const missing = entry.testFiles.filter((file) => !imported.has(file));
    if (missing.length > 0) {
      failures.push(
        `core/${entry.name}/${TEST_ENTRY_FILE} does not import ${missing.join(', ')}. Those suites ` +
          'exist and would never run; add the import lines.',
      );
    }

    const run = runPackage(entry.name);
    const floor = floors[entry.name];

    if (run.tests === null) {
      failures.push(`core/${entry.name}: could not read a test total from the runner output.`);
      console.log(run.output);
      continue;
    }

    measured[entry.name] = run.tests;
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
      `  ${entry.name.padEnd(12)} ${String(run.tests).padStart(4)} tests` +
        `  ${String(run.pass ?? 0).padStart(4)} pass` +
        `  ${String(run.fail ?? 0).padStart(2)} fail` +
        `  floor ${floor === undefined ? '  —' : String(floor).padStart(3)}` +
        `  ${flag}`,
    );

    if (run.status !== 0 || run.fail > 0) {
      failures.push(`core/${entry.name}: ${run.fail ?? '?'} failing tests (exit ${run.status}).`);
      console.log(run.output);
      continue;
    }
    if (run.tests === 0) {
      failures.push(
        `core/${entry.name} ran ZERO tests while exiting 0. That is the vacuous pass this gate ` +
          'exists to catch, not a directory with nothing in it.',
      );
      continue;
    }
    if (floor !== undefined && run.tests < floor) {
      failures.push(
        `core/${entry.name} ran ${run.tests} tests but has previously run ${floor}. A count that ` +
          'DROPS is a failure even when every test passes: tests do not go missing on purpose ' +
          'without someone saying so.',
      );
    }
  }

  console.log(`\n  ${'TOTAL'.padEnd(12)} ${String(total).padStart(4)} tests across ${packages.length} directories`);

  if (updateFloors) {
    if (failures.length > 0) {
      console.error('\nrefusing to record floors from a run that did not pass cleanly.');
    } else {
      await writeFile(
        COVERAGE_FILE,
        `${JSON.stringify({ ...coverage, measured, total }, null, 2)}\n`,
        'utf8',
      );
      console.log(`\nrecorded new floors in tools/core-coverage.json (total ${total}).`);
      return;
    }
  }

  if (failures.length > 0) {
    console.error('\nCORE TEST GATE FAILED\n');
    for (const failure of failures) console.error(`  - ${failure}\n`);
    process.exitCode = 1;
    return;
  }

  console.log('\nevery discovered directory ran, every count held its floor.');
}

main().catch((error) => {
  console.error('the core test gate could not run:', error);
  process.exitCode = 1;
});
