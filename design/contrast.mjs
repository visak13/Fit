/**
 * THE CONTRAST HARNESS — the evidence behind every palette in this design layer.
 *
 * Run:   node design/contrast.mjs           (from C:\Projects\Fit)
 * Exit:  0 when every gated pair passes, non-zero the moment one does not.
 *
 * No build, no dependency, nothing but Node. It reads the palettes from their single
 * source, re-renders the generated stylesheet and checks the committed one still matches,
 * computes the contrast ratio of every pair a person will actually look at, prints a
 * table, writes design/contrast-report.json, and fails loudly if anything is short.
 *
 * WHAT THIS FILE REFUSES TO DO, and it is the whole point of it existing:
 * it does not round a ratio up, it does not relax a threshold, and it does not decide a
 * pair is unimportant when the number comes back short. A palette that cannot pass is a
 * palette whose colours change. 4.499:1 fails.
 *
 * WHY IT ALSO COUNTS WHAT IT RAN. An exit code says a command finished; it does not say
 * the command tested anything. A harness that enumerated nothing exits zero just as
 * happily as one that measured every pair, and the difference is invisible to anyone
 * reading the exit status. So the count of pairs evaluated is printed, carried in the
 * report, and asserted against a floor: no pairs, no pass.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DISABLED_NOTE,
  FOCUS_INDICATOR_NOTE,
  PALETTES,
  ROLES,
  THRESHOLDS,
  enumeratePairs,
} from './tokens/palettes.mjs';
import { renderPalettesCss } from './tokens/render-css.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GENERATED_CSS = join(HERE, 'tokens', 'palettes.css');
const REPORT = join(HERE, 'contrast-report.json');

/**
 * The smallest number of pairs this harness is willing to call a run.
 *
 * Deliberately a floor rather than an exact count: an exact count turns every honest
 * addition of a role into a failing gate, and a gate that cries wolf gets edited until
 * it stops. A floor only ever fires when enumeration has COLLAPSED, which is the failure
 * that would otherwise look exactly like a clean pass.
 */
const MINIMUM_PAIRS_EXPECTED = 200;

const HEX_DIGITS = '0123456789abcdefABCDEF';

/**
 * Reads a `#RRGGBB` string into its three channels.
 *
 * Hand-parsed rather than pattern-matched: this project does not use regular expressions
 * without explicit approval, and a six-digit hex string does not need one.
 */
function readColour(role, hex) {
  if (typeof hex !== 'string' || hex.length !== 7 || hex[0] !== '#') {
    throw new Error(`role ${role} has ${JSON.stringify(hex)}, which is not a #RRGGBB colour`);
  }
  for (let index = 1; index < hex.length; index += 1) {
    if (!HEX_DIGITS.includes(hex[index])) {
      throw new Error(`role ${role} has ${hex}, which contains a character that is not a hex digit`);
    }
  }
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

/** WCAG 2.2 relative luminance, straight from the definition. */
function relativeLuminance({ r, g, b }) {
  const channel = (value) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.2 contrast ratio. Always >= 1. */
function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Two decimal places, always TOWARDS ZERO.
 *
 * A ratio of 4.499 displayed as 4.50 beside a 4.5 threshold reads as a pass and is not
 * one. Truncating means the printed number can never flatter the measurement, and the
 * comparison itself is made on the raw value regardless.
 */
function showRatio(ratio) {
  return (Math.floor(ratio * 100) / 100).toFixed(2);
}

function pad(text, width) {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function padStart(text, width) {
  return text.length >= width ? text : ' '.repeat(width - text.length) + text;
}

function measure(pair) {
  const foreground = readColour(pair.foreground, pair.foregroundHex);
  const background = readColour(pair.background, pair.backgroundHex);
  const ratio = contrastRatio(foreground, background);
  const gated = pair.threshold !== null && pair.threshold !== undefined;
  return {
    ...pair,
    ratio,
    ratioShown: Number(showRatio(ratio)),
    gated,
    // The comparison is on the raw ratio. Nothing is rounded before it is judged.
    passed: gated ? ratio >= pair.threshold : null,
  };
}

/**
 * Confirms the committed stylesheet is still the one these colours generate.
 *
 * Without this, someone edits a hex in the CSS to fix a look, the harness goes on
 * measuring the untouched source, and the report is green about colours nobody is
 * seeing. Byte comparison, no parsing, no pattern matching.
 */
function checkGeneratedCssIsCurrent() {
  const expected = renderPalettesCss();
  let actual;
  try {
    actual = readFileSync(GENERATED_CSS, 'utf8');
  } catch (cause) {
    return {
      ok: false,
      detail:
        `tokens/palettes.css could not be read (${cause.code ?? cause.message}). ` +
        'Run: node design/build-tokens.mjs',
    };
  }
  if (actual !== expected) {
    return {
      ok: false,
      detail:
        'tokens/palettes.css does not match what tokens/palettes.mjs generates, so the shipped ' +
        'colours and the measured colours are not the same colours. Run: node design/build-tokens.mjs',
    };
  }
  return { ok: true, detail: 'tokens/palettes.css matches tokens/palettes.mjs byte for byte.' };
}

/**
 * Every role that CLAIMS a threshold is actually measured, in every theme of every palette.
 *
 * This exists because the pair-count floor below was watched to fail and did not fire. A
 * role was deliberately dropped out of the enumeration, thirty pairs disappeared, and the
 * run still reported PASS with a healthy-looking count — because a floor can only see a
 * total collapse, never the quiet loss of one entry. That is the same shape this build has
 * met repeatedly: the absence is invisible to anything counting only totals.
 *
 * So this is a SECOND, INDEPENDENT reading of the same truth. The role table says which
 * roles carry a threshold; the enumeration says which roles were measured. Neither is the
 * authority. The DISAGREEMENT between them is the alarm, and it is loud whether a role was
 * dropped from the enumeration or added to the table and never wired in.
 */
function checkEveryGatedRoleIsMeasured(results) {
  const mustBeMeasured = ROLES.filter(
    (role) => role.gate === 'text' || role.gate === 'non-text' || role.gate === 'on-fill',
  ).map((role) => role.name);

  const problems = [];
  for (const palette of PALETTES) {
    for (const themeName of Object.keys(palette.themes)) {
      const measured = new Set(
        results
          .filter((result) => result.gated && result.palette === palette.id && result.theme === themeName)
          .map((result) => result.foreground),
      );
      for (const name of mustBeMeasured) {
        if (!measured.has(name)) {
          problems.push(
            `${palette.id}/${themeName}: role ${name} declares a threshold but no gated pair measures it`,
          );
        }
      }
    }
  }
  return problems;
}

/** Every role in ROLES has a value in every theme of every palette, and nothing extra. */
function checkEveryRoleIsBound() {
  const declared = ROLES.map((role) => role.name);
  const problems = [];
  for (const palette of PALETTES) {
    for (const [themeName, values] of Object.entries(palette.themes)) {
      for (const name of declared) {
        if (values[name] === undefined) {
          problems.push(`${palette.id}/${themeName} is missing the role ${name}`);
        }
      }
      for (const name of Object.keys(values)) {
        if (!declared.includes(name)) {
          problems.push(`${palette.id}/${themeName} binds ${name}, which is not a declared role`);
        }
      }
    }
    const themeNames = Object.keys(palette.themes).sort();
    if (themeNames.length !== 2 || themeNames[0] !== 'dark' || themeNames[1] !== 'light') {
      problems.push(`${palette.id} must ship exactly a light and a dark theme, and ships ${themeNames.join(', ')}`);
    }
  }
  return problems;
}

function main() {
  const out = [];
  const say = (line = '') => out.push(line);

  say('CONTRAST REPORT — every pair a person will actually look at');
  say('WCAG 2.2: 4.5:1 for text read at body size, 3:1 for anything whose boundary carries meaning.');
  say(`Disabled text: ${DISABLED_NOTE}`);
  say(`Focus: ${FOCUS_INDICATOR_NOTE}`);
  say();

  const structural = checkEveryRoleIsBound();
  const drift = checkGeneratedCssIsCurrent();

  const results = [];
  for (const palette of PALETTES) {
    for (const themeName of Object.keys(palette.themes)) {
      for (const pair of enumeratePairs(palette, themeName)) {
        results.push(measure(pair));
      }
    }
  }

  const gatedResults = results.filter((result) => result.gated);
  const informational = results.filter((result) => !result.gated);
  const failures = gatedResults.filter((result) => !result.passed);
  const unmeasured = checkEveryGatedRoleIsMeasured(results);

  const columns = { fg: 22, bg: 20, hex: 9, ratio: 9, need: 6, verdict: 5 };
  for (const palette of PALETTES) {
    for (const themeName of Object.keys(palette.themes)) {
      const forThisTheme = results.filter(
        (result) => result.palette === palette.id && result.theme === themeName,
      );
      const gatedHere = forThisTheme.filter((result) => result.gated);
      const failedHere = gatedHere.filter((result) => !result.passed);

      say(`${palette.id} / ${themeName}  —  ${palette.name}`);
      say(
        pad('foreground', columns.fg) +
          pad('background', columns.bg) +
          pad('fg hex', columns.hex) +
          pad('bg hex', columns.hex) +
          padStart('ratio', columns.ratio) +
          padStart('needs', columns.need) +
          padStart('', columns.verdict),
      );
      say('-'.repeat(columns.fg + columns.bg + columns.hex * 2 + columns.ratio + columns.need + columns.verdict));

      for (const result of forThisTheme) {
        const need = result.gated ? `${result.threshold.toFixed(1)}` : '-';
        let verdict = ' note';
        if (result.gated) {
          verdict = result.passed ? ' PASS' : ' FAIL';
        }
        say(
          pad(result.foreground, columns.fg) +
            pad(result.background, columns.bg) +
            pad(result.foregroundHex, columns.hex) +
            pad(result.backgroundHex, columns.hex) +
            padStart(showRatio(result.ratio), columns.ratio) +
            padStart(need, columns.need) +
            padStart(verdict, columns.verdict),
        );
      }
      say(
        `   ${gatedHere.length} gated pairs, ${gatedHere.length - failedHere.length} pass, ` +
          `${failedHere.length} fail; ${forThisTheme.length - gatedHere.length} reported without a gate.`,
      );
      say();
    }
  }

  say('SUMMARY');
  say(`  palettes measured          ${PALETTES.length}`);
  say(`  themes measured            ${PALETTES.length * 2}`);
  say(`  pairs evaluated            ${results.length}`);
  say(`  gated against a threshold  ${gatedResults.length}`);
  say(`  reported without a gate    ${informational.length}`);
  say(`  gated pairs passing        ${gatedResults.length - failures.length}`);
  say(`  gated pairs failing        ${failures.length}`);
  say(`  generated stylesheet       ${drift.ok ? 'current' : 'STALE'}`);
  say(`  role binding               ${structural.length === 0 ? 'complete' : `${structural.length} problems`}`);
  say(`  role coverage              ${unmeasured.length === 0 ? 'every gated role measured' : `${unmeasured.length} unmeasured`}`);
  say();

  const blocking = [];

  if (unmeasured.length > 0) {
    say('A ROLE THAT CLAIMS A THRESHOLD IS NOT BEING MEASURED');
    say('  The role table and the enumeration disagree. One of them is wrong; neither is trusted.');
    for (const problem of unmeasured) {
      say(`  ${problem}`);
    }
    say();
    blocking.push(`${unmeasured.length} gated roles are never measured`);
  }

  if (structural.length > 0) {
    say('ROLE BINDING PROBLEMS');
    for (const problem of structural) {
      say(`  ${problem}`);
    }
    say();
    blocking.push(`${structural.length} role binding problems`);
  }

  if (!drift.ok) {
    say('GENERATED STYLESHEET IS NOT CURRENT');
    say(`  ${drift.detail}`);
    say();
    blocking.push('the generated stylesheet does not match its source');
  }

  if (results.length < MINIMUM_PAIRS_EXPECTED) {
    say('THIS RUN TESTED ALMOST NOTHING');
    say(
      `  ${results.length} pairs were enumerated and at least ${MINIMUM_PAIRS_EXPECTED} were expected. ` +
        'An exit code cannot tell you this happened, which is why the count is a gate.',
    );
    say();
    blocking.push(`only ${results.length} pairs enumerated`);
  }

  if (failures.length > 0) {
    say('FAILING PAIRS — change the colour, never the threshold');
    for (const failure of failures) {
      say(
        `  ${failure.palette}/${failure.theme}  ${failure.foreground} (${failure.foregroundHex}) on ` +
          `${failure.background} (${failure.backgroundHex}) is ${showRatio(failure.ratio)}:1 and needs ` +
          `${failure.threshold.toFixed(1)}:1 — ${failure.context}`,
      );
    }
    say();
    blocking.push(`${failures.length} pairs below their threshold`);
  }

  const report = {
    generatedBy: 'design/contrast.mjs',
    standard: 'WCAG 2.2 SC 1.4.3 (contrast minimum) and SC 1.4.11 (non-text contrast)',
    thresholds: THRESHOLDS,
    disabledTextNote: DISABLED_NOTE,
    focusIndicatorNote: FOCUS_INDICATOR_NOTE,
    minimumPairsExpected: MINIMUM_PAIRS_EXPECTED,
    palettes: PALETTES.map((palette) => ({
      id: palette.id,
      name: palette.name,
      summary: palette.summary,
      themes: Object.keys(palette.themes).sort(),
    })),
    counts: {
      palettes: PALETTES.length,
      themes: PALETTES.length * 2,
      pairsEvaluated: results.length,
      gated: gatedResults.length,
      informational: informational.length,
      passed: gatedResults.length - failures.length,
      failed: failures.length,
    },
    generatedStylesheet: drift,
    roleBindingProblems: structural,
    unmeasuredGatedRoles: unmeasured,
    blocking,
    pass: blocking.length === 0,
    pairs: results.map((result) => ({
      palette: result.palette,
      theme: result.theme,
      foreground: result.foreground,
      foregroundHex: result.foregroundHex,
      background: result.background,
      backgroundHex: result.backgroundHex,
      kind: result.kind,
      threshold: result.threshold ?? null,
      ratio: result.ratioShown,
      gated: result.gated,
      passed: result.passed,
      context: result.context,
    })),
  };

  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  say(`report written to ${REPORT}`);

  if (blocking.length === 0) {
    say('RESULT: PASS — every gated pair meets its threshold.');
  } else {
    say(`RESULT: FAIL — ${blocking.join('; ')}.`);
  }

  process.stdout.write(`${out.join('\n')}\n`);
  process.exitCode = blocking.length === 0 ? 0 : 1;
}

main();
