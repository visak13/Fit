/**
 * THE ELEMENTS WHOSE OWN DEFAULT BREAKS THE READING FLOOR.
 *
 * Reading text in this application is never below 16px. The failure this file exists for is not an
 * author writing a small size — that is grep-able and already gated. It is an element the browser
 * draws small BY DEFAULT, used correctly, in markup with no size written anywhere in it.
 *
 * It has now happened twice, from two different mechanisms:
 *
 *   `<small>`  the user agent's own 0.8em, measured on the placeholder screen at 13.33px.
 *   `<code>`   the monospace default-size correction: a browser resolving the generic family
 *              `monospace` uses its own default size rather than the inherited one, landing at
 *              about 13px. Found on the admin screen's build stamp — the one string in the
 *              application a coach is asked to read back over a video call.
 *
 * Neither shows up in a review of the screen that used it, because neither screen said anything
 * about size. So the defence is in the foundation, and this is the test that keeps it there: a rule
 * rather than a list of the two we know about, so the third one is caught when it is introduced
 * rather than after it ships.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));

async function consoleCss(): Promise<string> {
  return readFile(path.join(here, 'console.css'), 'utf8');
}

/** The selector block a rule was written in, so an assertion reads the rule and not the whole file. */
function ruleFor(css: string, selector: string): string {
  const pattern = new RegExp(
    `(^|\\})[^{}]*(^|[\\s,])${selector.replace('.', '\\.')}\\s*(,[^{}]*)?\\{([^}]*)\\}`,
    'mu',
  );
  const found = pattern.exec(css);
  assert.ok(found !== null, `no rule in console.css binds ${selector}`);
  return found[4];
}

/**
 * The DECLARATIONS of a rule, with its comment taken off.
 *
 * `ruleFor` returns the rule body verbatim, comment included, and this file's house style puts the
 * reason for a rule inside the rule. That is fine for a match — a declaration is still there to find
 * — and it is fatal for an ABSENCE: an assertion that a rule does not mention `--target-touch` reads
 * the paragraph explaining why it does not, and fails on it. The only way to make such a sweep green
 * is to delete the reasoning, which is the single thing standing between the next editor and undoing
 * the decision. So the comment comes off before an absence is asserted, and never the other way
 * round.
 */
function declarationsOf(css: string, selector: string): string {
  const body = ruleFor(css, selector);
  const stripped = body.replace(/\/\*[\s\S]*?\*\//gu, '');
  // The positive control. A stripper that ate the declarations too would make every absence below
  // pass by having nothing left to read — which is the same clean-because-broken result it exists to
  // rule out. Assert it left something a rule certainly has.
  assert.match(
    stripped,
    /[a-z-]+\s*:\s*[^;]+;/u,
    `stripping comments off the ${selector} rule left no declarations, so every absence asserted `
      + 'against it would pass vacuously',
  );
  return stripped;
}

describe('elements the browser draws below the reading floor', () => {
  it('rebinds every one of them to the inherited size', async () => {
    const css = await consoleCss();

    // `small` is an aside; `code`, `kbd` and `samp` are the machine-voice family and share one
    // rule. Each is named because each has its own default, not because the list is complete.
    for (const element of ['small', 'code', 'kbd', 'samp']) {
      assert.match(
        ruleFor(css, element),
        /font-size:\s*inherit/u,
        `${element} keeps a size of its own, and its own is below the floor`,
      );
    }
  });

  it('gives the machine voice a real face ahead of the generic one', async () => {
    // Naming a real face is half the correction: on several browsers the default-size rule is keyed
    // to the generic family resolving on its own, so `font-size: inherit` alone is not the belt it
    // looks like. Both are needed and neither is redundant.
    const rule = ruleFor(await consoleCss(), 'code');
    assert.match(rule, /font-family:\s*var\(--font-code\)/u);

    const declared = /--font-code:\s*([^;]+);/u.exec(await consoleCss());
    assert.ok(declared !== null, '--font-code is not declared as a role');
    assert.match(declared[1], /monospace\s*$/u, 'the generic family stays as the last fallback');
    assert.ok(
      declared[1].split(',').length > 2,
      'a single-entry fallback chain is the case the correction fires on',
    );
  });
});

/**
 * THE SAME FAMILY, ONE FLOOR OVER: the element whose own default breaks the TAP floor.
 *
 * `<a>` has no box of its own. An INLINE box's height is the font's content area — measured at
 * 21.6px for this face at 16px — and it does not follow `line-height`, so a link sitting on a 24px
 * line still measures 21.6. It does not follow the wrapping either: a link wrapped over two lines is
 * two 21.6px fragments and not one 43.2px target. Measured on the running application at 390px, the
 * two "Open the page it is on now" links inside the setup screen's console-traps disclosure came out
 * 216.1 x 21.6, under the 24px floor of WCAG 2.2 SC 2.5.8. Every other anchor in the application
 * cleared it, and every one of them cleared it because a CLASS or a flex parent had already given it
 * a box — those two are the only anchors the application draws with no class at all.
 *
 * WHY THREE ASSERTIONS AND NOT ONE. `min-block-size` on an inline box is SILENTLY INERT: the
 * declaration computes, `getComputedStyle` reports it, and the element is still 21.6px tall. So a
 * guard that only reads the minimum would go on passing over a rule that had stopped doing anything,
 * which is this build's own recurring shape. The box type is asserted separately because it is the
 * half that actually carries the fix.
 */
describe('the element whose own default breaks the tap floor', () => {
  it('gives the anchor a minimum tappable height', async () => {
    assert.match(
      ruleFor(await consoleCss(), 'a'),
      /min-block-size:\s*var\(--target-minimum\)/u,
      'the anchor has no minimum tappable height. An inline link measures the font’s content area — '
        + '21.6px at the reading floor — which is under the 24px of WCAG 2.2 SC 2.5.8, and no amount '
        + 'of wording or wrapping lifts it over.',
    );
  });

  it('gives it a box that can honour that minimum, which an inline box cannot', async () => {
    // The silent half. `display: inline` accepts the declaration above and ignores it.
    const rule = ruleFor(await consoleCss(), 'a');
    assert.match(
      rule,
      /display:\s*inline-block/u,
      'the anchor is back to an inline box, so its minimum height is inert: the declaration computes, '
        + 'getComputedStyle reports it, and the link still renders at the font’s content area.',
    );
  });

  it('binds the reading floor and not the session floor, in that direction and the other', async () => {
    // Both numbers are real and this build has already shipped a defect from binding the looser one
    // where the tighter belonged. Here it is the other way round, and it is equally wrong: 44px on
    // every anchor puts 20px of dead space under every link in a paragraph. Named so a later edit
    // has to be a decision.
    const rule = declarationsOf(await consoleCss(), 'a');
    assert.doesNotMatch(
      rule,
      /--target-touch/u,
      'the anchor binds --target-touch (44px), which is what this application holds anything TAPPED '
        + 'DURING A SESSION to. A link inside reading matter is not that control.',
    );
    assert.doesNotMatch(
      rule,
      /min-block-size:\s*\d/u,
      'the tap floor is written as a literal beside the token that names it, so the two are free to '
        + 'disagree',
    );
  });
});

describe('the label-and-value primitive', () => {
  it('exists in the one place a primitive is allowed to live', async () => {
    const css = await consoleCss();
    for (const selector of ['.pairs', '.pair-label', '.pair-value']) {
      assert.ok(css.includes(`${selector} {`) || css.includes(`${selector},`), `${selector} is missing`);
    }
  });

  it('sizes its label column to content, capped by a named role rather than by a number', async () => {
    const rule = ruleFor(await consoleCss(), '.pairs');
    assert.match(rule, /fit-content\(var\(--pair-label-column\)\)/u);
  });

  it('takes the browser indent off the value, which a grid cell would otherwise pay for', async () => {
    assert.match(ruleFor(await consoleCss(), '.pair-value'), /margin:\s*0/u);
  });

  it('has its row in the contract, which is that document’s own rule for a primitive', async () => {
    // "A primitive several screens will want: add it to console.css AND add a row to the tables, so
    // the next author finds it instead of writing their own." A primitive that exists and is not
    // written down is a primitive the next author reinvents — which is the whole failure the
    // contract was written to stop.
    const design = await readFile(path.join(here, '..', '..', 'DESIGN.md'), 'utf8');
    assert.match(design, /`\.pairs`/u, 'the primitive is not in app/DESIGN.md');
    assert.match(design, /`\.pair-label`/u);
    assert.match(design, /`\.pair-value`/u);
  });
});
