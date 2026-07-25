/**
 * THE SHELL AND TOOLS GATES — the two that used to be a bare glob.
 *
 * ## What this replaces, and why it is worth a file
 *
 * These were:
 *
 *     "test:shell": "node --test \"src/ ** / *.test.ts\""
 *     "test:tools": "node --test \"tools/ ** / *.test.mjs\""
 *
 * and they are the same shape as the core gate before it grew its floors: they DISCOVER their
 * members, which is right, and **a glob that matches nothing exits ZERO**, which is the price. A
 * renamed directory, a moved suite, a pattern that stops matching on a different runtime — any of
 * them produces a clean run of nothing and a green tick. The gate can pass while running no tests at
 * all, and nothing says so.
 *
 * The only thing that had ever stood between this project and that failure was planner discipline:
 * every worker was told BY HAND to read the count and require strictly greater. A human habit
 * standing in for a check, and it had already been done wrong once — a count quoted from a document
 * was three actions stale, and a stale-LOW floor does not weaken the check, it inverts it.
 *
 * `tools/run-core-tests.mjs` had solved this properly for the core. It was never the shell's, and
 * that is all this file changes: the SAME mechanism (`tools/test-gate.mjs`), pointed at these two
 * suites. There is no third implementation.
 *
 * ## What a "directory" is here
 *
 * The unit a floor is recorded against is a DIRECTORY, because that is the unit that goes missing:
 * `src/design`, `src/shell`, `src/platform`, `src/screens`, `tools`. Discovery walks the tree and
 * groups by directory, and the files are passed to the runner EXPLICITLY rather than as a pattern —
 * so the empty-glob failure cannot happen inside a group either. If a directory that has a recorded
 * floor stops being discovered, the gate says which one and refuses.
 *
 *     npm run test:shell
 *     npm run test:tools
 *     node tools/run-suite-tests.mjs shell --update-floors     (deliberate, serialised, on green)
 *
 * ## The shell suite loads `.tsx`
 *
 * Node erases types but cannot transform JSX, so `--import ./tools/tsx-test-hook.mjs` is passed to
 * every shell group. That is what lets `no-dead-ends.test.ts` render the real screens through the
 * real route table instead of reading source text and hoping. It is applied here rather than left
 * to each suite, because a suite that forgot it would fail in a way that looks like a missing file.
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { discoverByDirectory, runTestGate } from './test-gate.mjs';

const applicationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The two suites, and everything that differs between them. Adding a third means adding an entry
 * here, not writing another runner.
 */
const SUITES = {
  shell: {
    root: 'src',
    suffix: '.test.ts',
    coverage: 'shell-coverage.json',
    // The JSX loader. Only the shell has components; the tools suite is plain ECMAScript.
    nodeArgs: ['--import', './tools/tsx-test-hook.mjs'],
    emptyDiscoveryHint:
      'src/ holds no *.test.ts files at all. The interface is not tested; it is not that the ' +
      'interface has no tests to run.',
  },
  tools: {
    root: 'tools',
    suffix: '.test.mjs',
    coverage: 'tools-coverage.json',
    nodeArgs: [],
    emptyDiscoveryHint:
      'tools/ holds no *.test.mjs files at all. The build tooling — the stamp, the icons, the ' +
      'glyphs — is unguarded.',
  },
};

const requested = process.argv[2];
const suite = SUITES[requested];

if (suite === undefined) {
  console.error(
    `run-suite-tests.mjs needs one of: ${Object.keys(SUITES).join(', ')} — it was given ` +
      `"${requested ?? '(nothing)'}".`,
  );
  process.exit(1);
}

const groups = await discoverByDirectory(
  path.join(applicationRoot, suite.root),
  suite.suffix,
  applicationRoot,
);

await runTestGate({
  label: requested,
  cwd: applicationRoot,
  coverageFile: path.join(applicationRoot, 'tools', suite.coverage),
  groups: groups.map((group) => ({
    name: group.name,
    // Relative to the application root, so the table reads the way a person would type the command.
    files: group.files.map((file) => path.relative(applicationRoot, file).split(path.sep).join('/')),
  })),
  nodeArgs: suite.nodeArgs,
  updateFloors: process.argv.includes('--update-floors'),
  emptyDiscoveryHint: suite.emptyDiscoveryHint,
});
