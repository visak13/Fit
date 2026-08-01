/**
 * TWO FOUNDATION RULES WHOSE REACH IS THE WHOLE POINT OF THEM, and which have each now been paid
 * for twice.
 *
 * ## WHAT THIS FILE IS NOT
 *
 * IT IS NOT THE ACCEPTANCE EVIDENCE FOR EITHER FIX, and saying so here is load-bearing rather than
 * modest. Both defects were found by RENDERING the screen and measuring boxes — a source assertion
 * about a stylesheet cannot see what a browser paints, which is the exact blindness that let both
 * of them ship. The evidence is a measured one: four password boxes at 326 x 21.2 px and 13.3333px
 * becoming 326 x 44 at 16px at 390 and 1300 x 44 at 1440, and `document.elementFromPoint` at the
 * centre of the destination surface returning NULL with /admin scrolled to the bottom and then
 * returning the surface itself. This file is the TRIPWIRE that keeps those two decisions from being
 * quietly undone between one browser walk and the next.
 *
 * ## ONE — THE FIELD SIZES REACH EVERY TEXT-ENTRY INPUT, NOT ONLY THOSE INSIDE A `.field`
 *
 * The comment above that rule claimed "Any input, anywhere, gets these sizes" while the selector
 * read `.field input`. It happened once to a heart-rate input at 21px tall, the SENTENCE was
 * generalised and the SELECTOR was not, and it then happened again to four password boxes on
 * /admin — including the two that a coach types into to seal and to open his encrypted archive,
 * where iOS Safari zooms the viewport on focus of anything under 16px.
 *
 * ## TWO — `.content` IS A CONTAINING BLOCK, SO NOTHING ABSOLUTE ESCAPES THE SCROLL PANEL
 *
 * `.visually-hidden` is `position: absolute` with no offsets. Without a positioned ancestor its
 * containing block is the PAGE, so it leaves the panel and the DOCUMENT grows to fit it, carrying
 * the whole frame — rail, bar and all — off the screen. DietEditor met this at forty-nine hidden
 * spans and worked around it in its own markup rather than in the foundation; /admin then met it
 * again through a visually-hidden file input.
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

/**
 * A selector list split on the commas that SEPARATE BRANCHES, and not on the ones inside `:not()`.
 *
 * Written because a plain `.split(',')` broke `input:not([type='checkbox'], [type='radio'], …)` into
 * fragments, and every assertion below then read a fragment and PASSED — one of them for entirely
 * the wrong reason. An instrument that cannot see is indistinguishable from a subject that is clean.
 */
function splitSelectorList(head: string): string[] {
  const branches: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of head) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      branches.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  branches.push(current.trim());
  return branches.filter((one) => one !== '').map((one) => one.replace(/\s+/gu, ' '));
}

/** Every rule in the sheet, as selector text and declarations, with comments taken off. */
function rulesOf(css: string): Array<{ selectors: string[]; declarations: string }> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, '');
  const found: Array<{ selectors: string[]; declarations: string }> = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/gu;
  let match = pattern.exec(withoutComments);
  while (match !== null) {
    const head = match[1].trim();
    // An `@media` head is the last thing before its first inner rule; it declares no properties of
    // its own, and skipping it here is why this reads rules rather than a rule tree.
    if (!head.startsWith('@')) {
      found.push({ selectors: splitSelectorList(head), declarations: match[2] });
    }
    match = pattern.exec(withoutComments);
  }
  return found;
}

/**
 * The ONE rule that binds the field sizes, found by what it DOES rather than by its selector —
 * because its selector is the thing under test and a finder that looked it up by name would only
 * ever confirm the name it was given.
 *
 * IT IS FOUND ON `--surface-input` ALONE, AND NOT ON THE SIZES IT BINDS. A finder that read the
 * quantity under test would turn a real red — the size declarations gone — into a red about not
 * finding the rule, which is a different fact and reads like the probe having missed. Measured on
 * this file: with the finder keyed on `font: inherit` too, deleting `font: inherit` failed all
 * three tests here with a "found 0" message instead of the one assertion that was supposed to
 * catch it. `--surface-input` appears exactly once in the sheet, and it separates this rule from
 * `.btn`, which also binds a control height and `font: inherit`: a control the coach TYPES INTO is
 * the only thing wearing the input surface.
 */
function theFieldSizingRule(rules: ReturnType<typeof rulesOf>) {
  const hits = rules.filter((rule) => /background:\s*var\(--surface-input\)/u.test(rule.declarations));
  assert.equal(
    hits.length, 1,
    'the field sizing rule is found by its declarations, and there must be exactly one of it — '
    + `found ${hits.length}, so this test no longer knows which rule it is asserting about`,
  );
  return hits[0];
}

describe('the field sizes reach every text-entry input, wherever it sits', () => {
  it('IS NOT SCOPED INSIDE A WRAPPER CLASS, because the box that broke was in a label.stack', async () => {
    const rule = theFieldSizingRule(rulesOf(await consoleCss()));

    // THE ANTI-REVERT HALF. Every branch of the selector list must be a bare element selector — a
    // descendant selector is exactly the narrowing this rule has now been narrowed by twice. It
    // asserts a SHAPE and not a set of declarations, so it survives a rule that lost its
    // declarations entirely, which is the other half's business.
    for (const selector of rule.selectors) {
      assert.ok(
        !/\s/u.test(selector.replace(/\([^)]*\)/gu, '')),
        `"${selector}" is a descendant selector, so the sizes reach only what is inside something `
        + 'else — which is how four password boxes on /admin came to measure 21.2px tall',
      );
    }

    // AND IT REACHES A PASSWORD BOX WITH NO CLASS AND NO WRAPPER. `className="input"` on two of the
    // four sites matched NO rule in any stylesheet; enumerating every matching rule in the browser
    // returned an empty list. Nothing here may depend on a class again.
    assert.ok(
      rule.selectors.some((selector) => selector.startsWith('input')),
      'no branch of this rule starts at `input`, so an input outside a wrapper gets nothing',
    );
  });

  it('AND STILL BINDS A SIZE AND A FONT — the half that survives the old narrow selector', async () => {
    const rule = theFieldSizingRule(rulesOf(await consoleCss()));

    // THE REQUIRING HALF. It reds if the declarations go, and it is GREEN against the old
    // `.field input` copy, which bound both and merely bound them to too little. `font: inherit` is
    // not decoration: it is what stops iOS Safari zooming the viewport when he focuses the box to
    // type the passphrase for his encrypted archive.
    assert.match(rule.declarations, /min-height:\s*var\(--control-height\)/u);
    assert.match(rule.declarations, /font:\s*inherit/u);
  });

  it('and leaves the marks alone: a radio is a 24px MARK and drew as an empty box with a dot in it', async () => {
    const rule = theFieldSizingRule(rulesOf(await consoleCss()));
    const inputBranch = rule.selectors.find((selector) => selector.startsWith('input')) ?? '';
    for (const type of ['checkbox', 'radio', 'file']) {
      assert.match(
        inputBranch, new RegExp(`\\[type=['"]${type}['"]\\]`, 'u'),
        `${type} is not text entry and must be excluded, or this rule gives it a border, a `
        + 'background and a 44px box',
      );
    }
  });
});

describe('the scroll panel is a containing block', () => {
  function theContentRule(css: string) {
    const rule = rulesOf(css).find((one) => one.selectors.includes('.content'));
    assert.ok(rule !== undefined, 'no rule in console.css binds .content');
    return rule;
  }

  it('DECLARES A POSITION, so nothing absolute inside it escapes and stretches the document', async () => {
    const rule = theContentRule(await consoleCss());
    assert.match(
      rule.declarations, /position:\s*(relative|sticky)/u,
      'without a positioned ancestor a `.visually-hidden` control is laid out against the PAGE, and '
      + 'the document grows to fit it — /admin measured 6633 tall against a viewport of 844, with '
      + 'the destination bar at top -5055 and elementFromPoint at its centre returning null',
    );
  });

  it('AND IS STILL THE THING THAT SCROLLS — the opposed half, because deleting the scroll also hides the symptom', async () => {
    const rule = theContentRule(await consoleCss());
    // Making `.content` stop scrolling would collapse the document height too, and would take the
    // frame's fixed height with it. This half reds on that and is green on the fix above.
    assert.match(
      rule.declarations, /overflow-y:\s*auto/u,
      '.content stopped being the scroll panel, which is the frame giving up rather than the escape '
      + 'being contained',
    );
  });
});
