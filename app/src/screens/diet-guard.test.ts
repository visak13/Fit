/**
 * NO SECOND TABLE OF DAY NAMES ANYWHERE IN THE INTERFACE.
 *
 * `core/diet/week.js` is the one module that says what a diet plan's day NUMBER means: ISO-8601,
 * 1 is Monday, in a frozen `WEEKDAYS` table. Two things need that answer and they must not disagree
 * — the chart labels a column with it, and the import path reads a day name off a pasted plan and
 * turns it back into the same number. If either kept its own list, the coach would IMPORT INTO
 * TUESDAY AND READ IT UNDER WEDNESDAY, with nothing erroring anywhere and no way to notice except by
 * comparing a chart against a piece of paper. This build has already shipped that shape once with a
 * pair of constants.
 *
 * ## THE SCOPE IS DISCOVERED, NEVER TYPED — this project's own recurring defect
 *
 * A guard carrying a hand-written list of the files it covers is a promise somebody has to remember
 * to keep, and this build has now watched that promise break four times: a file is renamed or added,
 * it drops out of the list, and the guard goes green while its own stated claim goes false. So the
 * set below is WALKED off the tree, and the walk asserts it is non-vacuous before it asserts
 * anything about what it found.
 *
 * ## AND THE SCAN CARRIES A POSITIVE CONTROL, because it is absence-shaped
 *
 * "No file lists the days" is indistinguishable from "the matcher is broken and matches nothing" —
 * both report success. So the SAME matcher is run over `core/diet/week.js`, which is known to hold
 * all seven, and is required to flag it. A scan that cannot find the day table where the day table
 * demonstrably is has proven nothing about the files where it found none.
 *
 * ## WHY THE THRESHOLD IS THREE AND NOT ONE
 *
 * The defect is a TABLE, and a table lists all seven. A single day name in prose is ordinary and
 * legitimate: `shell/trail.ts` carries "Tuesday, 12 June" as a worked example of a crumb, and a test
 * fixture naturally names the day its data is about. Forbidding one name would make this guard
 * something authors route around instead of a rule they can live with — and a guard people route
 * around is worse than none, because it still reads as cover.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { WEEKDAYS } from '../../core/diet/diet.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const applicationRoot = path.join(here, '..', '..');
/** The whole interface tree. The screen, the shell and the design layer all draw day names. */
const shellRoot = path.join(applicationRoot, 'src');

/** What a shipped interface source looks like. Tests are excluded — see the header. */
const SOURCE_SUFFIXES = ['.ts', '.tsx', '.css'];

function isShippedSource(name: string): boolean {
  if (name.endsWith('.test.ts') || name.endsWith('.test.tsx')) return false;
  return SOURCE_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

/** Every shipped source under a directory, found by walking rather than by being told. */
async function walk(root: string): Promise<string[]> {
  const found: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(full)));
    else if (isShippedSource(entry.name)) found.push(full);
  }

  return found;
}

/**
 * The file with its comments removed, because A DAY NAME IN A COMMENT IS NOT A TABLE.
 *
 * `console.css` explains an indicator with "a basement gym on a Tuesday", and `shell/trail.ts`
 * carries a worked example of a crumb. A bare text scan counts both as day tables and is wrong about
 * each. Whether a comment is evidence is precisely the question this guard has to answer correctly —
 * `client-register-source.test.ts` had to answer the same question for a different scan and reached
 * the same conclusion, which is why the shape is familiar rather than novel.
 */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * How many DISTINCT day names a source names in its code.
 *
 * Derived from the shared table rather than typed here, so this guard cannot itself become the
 * second list it exists to forbid.
 */
function dayNamesIn(source: string): string[] {
  const code = codeOnly(source);
  return WEEKDAYS
    .map((weekday) => weekday.name)
    .filter((name) => new RegExp(`\\b${name}\\b`, 'u').test(code));
}

/** More than this many distinct day names in one file is a table, not a sentence. */
const A_TABLE = 3;

describe('the one table of day names', () => {
  it('is found by this scan where it demonstrably is, which is what makes an absence mean anything', async () => {
    // THE POSITIVE CONTROL. Without it, "no interface file lists the days" and "the matcher is
    // broken" are the same green tick.
    const week = await readFile(path.join(applicationRoot, 'core', 'diet', 'week.js'), 'utf8');
    const found = dayNamesIn(week);

    assert.equal(
      found.length,
      WEEKDAYS.length,
      'the matcher cannot find all seven day names in core/diet/week.js, where the frozen table is. '
      + 'Every other assertion in this file is therefore worthless until this one passes.',
    );
    assert.ok(found.length >= A_TABLE, 'the threshold no longer catches the very table it describes');
  });

  it('walks the interface tree rather than being told what is in it', async () => {
    const files = await walk(shellRoot);

    // NON-VACUITY, and it is derived rather than a recorded number that would rot the same way a
    // typed file list does: the walk must reach every directory the interface is built from, and
    // must find the two files this action added.
    const directories = new Set(files.map((file) => path.dirname(file)));
    assert.ok(
      directories.size >= 4,
      `the walk reached ${directories.size} directories under src/, which is fewer than the `
      + 'interface has. It is scanning almost nothing and would report a pass for the rest.',
    );
    assert.ok(
      files.some((file) => file.endsWith(path.join('screens', 'DietScreen.tsx'))),
      'the walk did not reach the diet screen, which is the file this guard exists for',
    );
    assert.ok(
      files.some((file) => file.endsWith(path.join('screens', 'diet.ts'))),
      'the walk did not reach the diet screen’s decisions',
    );
  });

  it('is the only one: no shipped interface source keeps a list of its own', async () => {
    const files = await walk(shellRoot);
    const offenders: string[] = [];

    for (const file of files) {
      // eslint-disable-next-line no-await-in-loop
      const found = dayNamesIn(await readFile(file, 'utf8'));
      if (found.length >= A_TABLE) {
        offenders.push(`${path.relative(applicationRoot, file)} names ${found.join(', ')}`);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      'these interface sources carry a list of day names of their own. Import WEEKDAYS from '
      + 'core/diet/week.js instead: two tables is how the coach imports into Tuesday and reads it '
      + 'under Wednesday, with nothing erroring anywhere.',
    );
  });
});

describe('the Diet destination', () => {
  /*
   * `no-dead-ends.test.ts` already proves every destination RESOLVES to a screen that renders and
   * says which destination it is. What it cannot tell apart is a real screen from the PLACEHOLDER,
   * because the placeholder also renders and also carries the destination's label — that is its whole
   * job. So this asserts the one thing left: the address reaches THIS screen.
   *
   * It goes through the shipped `ROUTE_TABLE` and react-router's own matcher, never a second list of
   * paths written beside it: the table is the one table, and a copy is the thing that cannot be
   * wrong. Nothing here duplicates the no-dead-ends suite; it answers a different question about the
   * same table.
   */
  it('reaches this screen rather than the placeholder it used to', async () => {
    const { matchRoutes } = await import('react-router');
    const { ROUTE_TABLE } = await import('../shell/routes.tsx');
    const { DESTINATIONS } = await import('../shell/navigation.ts');
    const { DietScreen } = await import('./DietScreen.tsx');
    const { PlaceholderScreen } = await import('./PlaceholderScreen.tsx');

    // The destination is found by its own mark, not by a path typed into this file.
    const diet = DESTINATIONS.find((destination) => destination.glyph === 'nav-diet');
    assert.ok(diet !== undefined, 'the navigation surface no longer carries a Diet destination');

    const matched = matchRoutes([...ROUTE_TABLE], `/${diet.path}`);
    assert.ok(matched !== null, `nothing in the route table answers to /${diet.path}`);

    const leaf = matched.at(-1)?.route;
    assert.notEqual(leaf?.path, '*', 'the Diet destination falls through to not-found');

    // The COMPONENT the table actually carries at that address, read off the shipped element.
    const drawn = (leaf?.element as { type?: unknown } | undefined)?.type;

    assert.notEqual(
      drawn,
      PlaceholderScreen,
      'the Diet destination still resolves to the placeholder, which renders and carries the '
      + 'label — so no-dead-ends cannot tell the difference. Add the entry to DESTINATION_SCREENS.',
    );
    assert.equal(
      drawn,
      DietScreen,
      'the Diet destination resolves to some screen other than the diet screen',
    );
  });
});

/**
 * EVERY SHIPPED FILE OF THE DIET DIRECTION, DISCOVERED RATHER THAN LISTED.
 *
 * This carried a typed list of three names when the direction WAS three files. It is now eight, and
 * the two checks below would have gone on passing while covering the read half only — which is the
 * project's own recurring defect, watched four times: a file is added, it drops out of the list, and
 * the guard goes green while its stated claim goes false. The write half is exactly where a
 * passphrase or a borrowed day table would arrive, so the list is derived off the tree.
 *
 * A file belongs to the direction if its name begins with `diet` or `Diet`. That is a convention
 * rather than a truth, so the caller asserts what the walk FOUND before asserting anything about it.
 */
async function dietDirectionSources(): Promise<string[]> {
  const entries = await readdir(here, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isShippedSource(entry.name))
    .filter((entry) => entry.name.toLowerCase().startsWith('diet'))
    .map((entry) => path.join(here, entry.name));
}

describe('the diet screen against the false friend beside it', () => {
  it('finds the whole direction rather than the three files this guard used to name', async () => {
    // NON-VACUITY, and it is what makes the two assertions after it mean anything. Both halves must
    // be present: the read screen a5 built and the write surfaces beside it.
    const found = (await dietDirectionSources()).map((file) => path.basename(file));

    assert.ok(
      found.length >= 6,
      `the walk found ${String(found.length)} files of the diet direction, which is fewer than it `
      + 'has. It is covering almost nothing and would report a pass for the rest.',
    );
    for (const expected of ['diet.ts', 'DietScreen.tsx', 'diet-editor.ts', 'DietEditor.tsx']) {
      assert.ok(found.includes(expected), `the walk did not reach ${expected}`);
    }
  });

  it('borrows nothing from a routine’s position, which is not a calendar weekday', async () => {
    // A routine's `position` is a slot in a weekly split and its own header says it is explicitly NOT
    // a weekday. A diet day IS one, because the nutritionist writes the day name on the plan the
    // coach transcribes. The two look alike and are not, so the diet direction is held away from it.
    for (const file of await dietDirectionSources()) {
      // eslint-disable-next-line no-await-in-loop
      const code = codeOnly(await readFile(file, 'utf8'));
      assert.ok(
        !/\bposition\b/u.test(code),
        `${path.basename(file)} reads a routine’s position, which is a slot in a split and not a day`,
      );
    }
  });

  /*
   * NO SECOND EXPORTER IN THE DIET DIRECTION — the seam is built once and this is its first caller.
   *
   * The scar is recorded and it is not hypothetical: `s7` declared a set of constants, `s10` could
   * have declared its own, and the coach would have entered a value the application cannot see with
   * nothing erroring anywhere. The same shape here is `s9` writing its own exporter — two
   * implementations, both passing their own tests, handing the coach two subtly different
   * spreadsheets. The defence is that the FIRST caller demonstrably has no machinery of its own, so
   * there is nothing here for a later step to copy.
   *
   * The tokens are the machinery, not the seam: calling `pictureFile` or naming `browserPictureSurface`
   * is USING the seam and is what this direction is supposed to do. Drawing on a context, measuring
   * text, packing an archive or writing spreadsheet parts is BUILDING one.
   */
  const MACHINERY: readonly (readonly [string, RegExp])[] = [
    ['draws on a canvas of its own', /\b(getContext|toBlob|measureText|fillText|fillRect)\b/u],
    ['packs an archive of its own', /\b(crc32|storeOnlyZip|deflate|centralDirectory)\b/u],
    ['writes spreadsheet parts of its own', /(xl\/|sharedStrings|worksheets|OOXML|spreadsheetml)/u],
    ['assembles bytes of its own', /\b(Uint8Array|ArrayBuffer|DataView)\b/u],
  ];

  it('the machinery scan finds machinery where the machinery demonstrably is', async () => {
    // THE POSITIVE CONTROL. "No diet file builds an exporter" and "the matcher matches nothing" are
    // the same green tick without it, and this guard is entirely absence-shaped.
    const drawing = codeOnly(await readFile(path.join(applicationRoot, 'src', 'platform', 'table-picture.ts'), 'utf8'));
    const packing = codeOnly(await readFile(path.join(applicationRoot, 'core', 'export', 'zip.js'), 'utf8'));
    const writing = codeOnly(await readFile(path.join(applicationRoot, 'core', 'export', 'workbook.js'), 'utf8'));

    const tripped = MACHINERY.filter(([, pattern]) => (
      pattern.test(drawing) || pattern.test(packing) || pattern.test(writing)
    ));

    assert.equal(
      tripped.length,
      MACHINERY.length,
      'one of these patterns cannot find the machinery in the seam that provably holds it, so its '
      + 'silence over the diet direction proves nothing: '
      + MACHINERY.filter((entry) => !tripped.includes(entry)).map(([what]) => what).join('; '),
    );
  });

  it('builds NO exporter of its own: it calls the one seam, and s9 must find nothing here to copy', async () => {
    const offenders: string[] = [];

    for (const file of await dietDirectionSources()) {
      // eslint-disable-next-line no-await-in-loop
      const code = codeOnly(await readFile(file, 'utf8'));
      for (const [what, pattern] of MACHINERY) {
        if (pattern.test(code)) offenders.push(`${path.basename(file)} ${what}`);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      'the diet direction has grown export machinery of its own. Call the seam — core/export/export.js '
      + 'with src/platform/table-export.ts and share-delivery.ts — rather than building a second one: '
      + 'two exporters both pass their own tests and hand the coach two subtly different spreadsheets.',
    );
  });

  /*
   * THE SCREEN ACTUALLY OFFERS THE TWO EXPORTS — and this is the honest, cheap check for it.
   *
   * WHAT CANNOT BE USED HERE, so nobody replaces this with something that looks stronger and proves
   * less: a static render never opens the local store, and the chart, the controls under it and both
   * write surfaces only exist once it has. `renderToStaticMarkup` of this screen produces the picker
   * and nothing else whether the export exists or not — that was measured on this direction already.
   * So a rendered assertion would be a green tick with no content, which is the worse failure.
   *
   * WHAT THIS DOES PROVE: the drawing consumes the wiring. Every decision the export makes lives in
   * `diet-export.ts` and is driven directly by `diet-export.test.ts` against real bytes and a
   * substituted share sheet. This closes the one gap those cannot reach — a screen that never calls
   * them — which is the same gap `DESTINATION_SCREENS` left, and it is caught here rather than by the
   * coach finding no way to send a week.
   */
  it('the diet screen actually calls the export wiring, rather than holding it as an unused import', async () => {
    const screen = codeOnly(await readFile(path.join(here, 'DietScreen.tsx'), 'utf8'));

    for (const named of ['dietExportTable', 'sendDietExport', 'exportOffer', 'SEND_AS_IMAGE', 'SEND_AS_SPREADSHEET']) {
      // Twice: once where it is imported and once where it is used. An import alone is a screen that
      // draws no export, and `noUnusedLocals` is satisfied by a single mention in a type annotation.
      const mentions = screen.split(named).length - 1;
      assert.ok(
        mentions >= 2,
        `DietScreen names ${named} ${String(mentions)} time(s). The export seam is imported and not `
        + 'drawn, so the coach has no way to send the week he is looking at.',
      );
    }

    // NON-VACUITY: the same scan over the paste surface, which legitimately has no export on it,
    // must find nothing. Without this, a matcher that says yes to everything reads as a pass.
    const elsewhere = codeOnly(await readFile(path.join(here, 'DietImport.tsx'), 'utf8'));
    assert.ok(!elsewhere.includes('sendDietExport'), 'the scan matches files that do not call the export');
  });

  it('reaches for no crypto anywhere, because a diet plan is a food chart', async () => {
    for (const file of await dietDirectionSources()) {
      // eslint-disable-next-line no-await-in-loop
      const code = codeOnly(await readFile(file, 'utf8'));
      assert.ok(
        !/core\/crypto/u.test(code),
        `${path.basename(file)} imports the crypto module. Diet is PLAINTEXT — no passphrase, no `
        + 'gate, no sensitivity marking — and reaching for it means the step has been misread.',
      );
    }
  });
});

describe('the two write surfaces are actually wired up', () => {
  /*
   * WHY THIS IS ASSERTED AT ALL, given two suites already cover the diet destination.
   *
   * `no-dead-ends.test.ts` proves a destination resolves and renders; it cannot tell a real screen
   * from the placeholder. The suite above closes that for the READ screen. Neither can say anything
   * about the write surfaces, because those appear only once the local store has OPENED and a static
   * render never opens one — so a rendered check would report the same markup whether the editor
   * existed or not.
   *
   * So the wiring is proven where it is decided: the shipped link builders produce an address, the
   * shipped ROUTE_TABLE is asked what that address reaches, and the shipped `whichDietSurface` is
   * asked which surface it selects. No path and no query key is typed into this file.
   */
  const CLIENT = 'client-1';
  const PLAN = 'plan-1';

  async function reaches(link: string): Promise<{ component: unknown; surface: string }> {
    const { matchRoutes } = await import('react-router');
    const { ROUTE_TABLE } = await import('../shell/routes.tsx');
    const { whichDietSurface } = await import('./diet.ts');

    // The link builders produce an application-relative address; a base is needed only to parse it.
    const parsed = new URL(link, 'https://example.invalid');
    const matched = matchRoutes([...ROUTE_TABLE], parsed.pathname);
    assert.ok(matched !== null, `nothing in the route table answers to ${link}`);

    const leaf = matched.at(-1)?.route;
    assert.notEqual(leaf?.path, '*', `${link} falls through to not-found`);

    return {
      component: (leaf?.element as { type?: unknown } | undefined)?.type,
      surface: whichDietSurface(parsed.searchParams),
    };
  }

  it('every one of them reaches the diet screen rather than falling through', async () => {
    const { DietScreen } = await import('./DietScreen.tsx');
    const { dietAmendPlan, dietForClient, dietImport, dietNewPlan } = await import('./diet.ts');

    for (const link of [
      dietForClient(CLIENT), dietNewPlan(CLIENT), dietAmendPlan(CLIENT, PLAN), dietImport(CLIENT),
    ]) {
      // eslint-disable-next-line no-await-in-loop
      assert.equal((await reaches(link)).component, DietScreen, `${link} does not reach the diet screen`);
    }
  });

  it('each link selects the surface it is named for, and reading is what an address without one gets', async () => {
    const { dietAmendPlan, dietForClient, dietImport, dietNewPlan } = await import('./diet.ts');

    assert.equal((await reaches(dietForClient(CLIENT))).surface, 'read');
    assert.equal((await reaches(dietNewPlan(CLIENT))).surface, 'editor');
    assert.equal((await reaches(dietAmendPlan(CLIENT, PLAN))).surface, 'editor');
    assert.equal((await reaches(dietImport(CLIENT))).surface, 'paste');
  });

  it('carries the client through every one of them, because neither surface means anything without one', async () => {
    const { DIET_CLIENT_KEY, dietAmendPlan, dietImport, dietNewPlan } = await import('./diet.ts');

    for (const link of [dietNewPlan(CLIENT), dietAmendPlan(CLIENT, PLAN), dietImport(CLIENT)]) {
      const parsed = new URL(link, 'https://example.invalid');
      assert.equal(parsed.searchParams.get(DIET_CLIENT_KEY), CLIENT, `${link} loses the client`);
    }
  });

  it('names the plan being changed, so amending one plan cannot open another', async () => {
    const { DIET_EDIT_KEY, NEW_PLAN, dietAmendPlan, dietNewPlan } = await import('./diet.ts');

    const amend = new URL(dietAmendPlan(CLIENT, PLAN), 'https://example.invalid');
    assert.equal(amend.searchParams.get(DIET_EDIT_KEY), PLAN);

    const fresh = new URL(dietNewPlan(CLIENT), 'https://example.invalid');
    assert.equal(fresh.searchParams.get(DIET_EDIT_KEY), NEW_PLAN);
  });
});
