/*
 * BUILD THE CONTRAST SUMMARY THE COMPARISON PAGE READS.
 *
 * WHY THIS FILE EXISTS AT ALL. design/index.html has to show the measured contrast evidence
 * for each palette, and the requirement is precise about where those numbers come from: they
 * are read OUT OF design/contrast-report.json rather than retyped by a person. A hand-copied
 * figure is indistinguishable from a correct one until the day the palette changes and the
 * page goes on quoting the old number with total confidence.
 *
 * WHY NOT JUST FETCH THE REPORT FROM THE PAGE. The comparison page must open from the file
 * system with a double click, and a browser refuses a fetch of a sibling file at the file
 * scheme because a file-scheme document is treated as its own opaque origin. A <script> tag
 * is not subject to that rule, so the report is reduced here to a small script the page can
 * simply include. The numbers still come out of the report by machine; only the transport
 * changed.
 *
 * WHAT IT DOES NOT DO. It does not measure anything and it must never be mistaken for the
 * thing that does. design/contrast.mjs is the measurement; this reads its output. If the two
 * ever disagree, contrast.mjs is right and this file is stale.
 *
 * RUN IT:  node design/build-contrast-summary.mjs      (from C:\Projects\Fit)
 * It refuses rather than writing a summary it cannot stand behind.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = join(HERE, 'contrast-report.json');
const OUTPUT_PATH = join(HERE, 'contrast-summary.js');

/* The one place the three directions are tied to the three palettes. The comparison page
 * shows evidence per DIRECTION; the report measures per PALETTE. */
const DIRECTION_OF_PALETTE = {
  'house-sepia': 'ledger',
  'slate-blue': 'console',
  'ink-neutral': 'roster',
};

function fail(message) {
  console.error('build-contrast-summary: ' + message);
  process.exit(1);
}

const report = JSON.parse(readFileSync(REPORT_PATH, 'utf8'));

/*
 * FAIL FAST AT THE BOUNDARY. Every field below is read straight out of the report, so a
 * report that has changed shape must stop this script rather than let it emit a summary with
 * undefined in it — which would render on the page as a confident blank.
 */
for (const key of ['standard', 'thresholds', 'palettes', 'counts', 'pairs', 'pass', 'generatedBy']) {
  if (report[key] === undefined) fail(`the report has no "${key}". It has changed shape; this script must be updated rather than worked around.`);
}
if (!Array.isArray(report.pairs) || report.pairs.length === 0) fail('the report carries no pairs.');

/* Only pairs carrying a threshold are pass-or-fail. The rest are recorded for information —
 * a disabled control's own body against the card behind it, for instance, which is meant to
 * recede and has no floor to clear. Counting them as passes would inflate the number; hiding
 * them would misrepresent what was looked at. Both are reported, separately. */
const gatedPairs = report.pairs.filter((pair) => pair.gated === true);
const informationalPairs = report.pairs.filter((pair) => pair.gated !== true);

if (gatedPairs.length === 0) fail('no gated pairs found. A summary claiming everything passes when nothing was measured is exactly the false pass this build keeps meeting.');

const palettes = report.palettes.map((palette) => {
  const mine = gatedPairs.filter((pair) => pair.palette === palette.id);
  if (mine.length === 0) fail(`palette "${palette.id}" has no gated pairs. It is either unmeasured or renamed.`);

  const failed = mine.filter((pair) => pair.passed !== true);

  /* The TIGHTEST pair is the honest headline, not the average and not the best. A palette is
   * only as good as its narrowest margin, and quoting anything else invites the reader to
   * believe a comfortable figure that no pixel on screen actually achieves. Margin rather
   * than raw ratio, because a 3.1 against a floor of 3 is tighter than a 4.6 against 4.5. */
  const byMargin = mine
    .slice()
    .sort((a, b) => (a.ratio - a.threshold) - (b.ratio - b.threshold));
  const tightest = byMargin[0];

  const perTheme = {};
  for (const theme of ['light', 'dark']) {
    const themePairs = mine.filter((pair) => pair.theme === theme);
    if (themePairs.length === 0) fail(`palette "${palette.id}" has no gated pairs in the ${theme} theme. Both themes ship together or neither does.`);
    perTheme[theme] = {
      measured: themePairs.length,
      passed: themePairs.filter((pair) => pair.passed === true).length,
    };
  }

  return {
    id: palette.id,
    direction: DIRECTION_OF_PALETTE[palette.id] || null,
    name: palette.name,
    summary: palette.summary,
    measured: mine.length,
    passed: mine.filter((pair) => pair.passed === true).length,
    failed: failed.length,
    perTheme,
    tightest: {
      ratio: tightest.ratio,
      threshold: tightest.threshold,
      theme: tightest.theme,
      context: tightest.context,
      foreground: tightest.foreground,
      foregroundHex: tightest.foregroundHex,
      background: tightest.background,
      backgroundHex: tightest.backgroundHex,
    },
  };
});

for (const palette of palettes) {
  if (!palette.direction) fail(`palette "${palette.id}" is not mapped to a direction. Update DIRECTION_OF_PALETTE rather than dropping the palette from the page.`);
}

const summary = {
  generatedFrom: 'design/contrast-report.json',
  generatedByReport: report.generatedBy,
  command: 'node design/contrast.mjs',
  commandDirectory: 'C:\\Projects\\Fit',
  standard: report.standard,
  thresholds: report.thresholds,
  totals: {
    palettes: palettes.length,
    themes: report.counts.themes,
    evaluated: report.pairs.length,
    measured: gatedPairs.length,
    passed: gatedPairs.filter((pair) => pair.passed === true).length,
    failed: gatedPairs.filter((pair) => pair.passed !== true).length,
    informational: informationalPairs.length,
  },
  everyMeasuredPairPasses: report.pass === true && gatedPairs.every((pair) => pair.passed === true),
  palettes,
};

/* An internally inconsistent summary must not reach the page. The report's own verdict and a
 * recount of its own pairs have to agree; if they do not, one of them is wrong and neither
 * may be quoted to a person making a decision on it. */
if (summary.totals.passed + summary.totals.failed !== summary.totals.measured) {
  fail('the pass and fail counts do not add up to the measured count.');
}
if (report.pass === true && summary.totals.failed > 0) {
  fail(`the report says it passed but ${summary.totals.failed} measured pairs did not. Fix contrast.mjs; do not publish either number.`);
}

const banner = `/*
 * GENERATED FILE - DO NOT EDIT BY HAND.
 *
 * Written by design/build-contrast-summary.mjs out of design/contrast-report.json, which is
 * itself written by design/contrast.mjs. Every number below was computed and then copied by
 * machine. If you are tempted to correct one here, the correction belongs in the palette and
 * the measurement, not in the report of it.
 *
 * Regenerate:  node design/contrast.mjs && node design/build-contrast-summary.mjs
 */
`;

writeFileSync(OUTPUT_PATH, banner + 'window.CONTRAST_SUMMARY = ' + JSON.stringify(summary, null, 2) + ';\n', 'utf8');

console.log('build-contrast-summary: wrote design/contrast-summary.js');
console.log(`  ${summary.totals.measured} measured pairs across ${summary.totals.palettes} palettes and ${summary.totals.themes} themes`);
console.log(`  ${summary.totals.passed} passed, ${summary.totals.failed} failed, ${summary.totals.informational} recorded for information`);
for (const palette of palettes) {
  console.log(`  ${palette.id.padEnd(12)} tightest ${palette.tightest.ratio}:1 against a floor of ${palette.tightest.threshold}:1 (${palette.tightest.theme}) - ${palette.tightest.context}`);
}
