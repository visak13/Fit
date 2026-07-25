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
