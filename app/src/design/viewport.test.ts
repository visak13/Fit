/**
 * THE WIDTH CLASSES, AND THE ONE PLACE THEY CAN DRIFT.
 *
 * A CSS media query cannot read a custom property, so a rule that changes at a width has to write
 * the number out — which makes it the one boundary in the visual system that is NOT bound to a
 * token. The drift is the familiar silent kind: the rail's breakpoint moves in TypeScript, the
 * stylesheet keeps the old one, and for a band of widths the interface shows a rail styled as though
 * it were a bottom bar with nothing failing.
 *
 * The last test is therefore a RULE rather than a list: every width query in `console.css` must be
 * one of the named classes. A list would have to be extended by whoever adds the next query, and the
 * one that was not extended is the drift it was meant to catch.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { EXPANDED_VIEWPORT_MIN, MEDIUM_VIEWPORT_MIN, viewportClass } from './viewport.ts';

describe('naming a width', () => {
  it('calls a phone compact', () => {
    assert.equal(viewportClass(390), 'compact');
    assert.equal(viewportClass(MEDIUM_VIEWPORT_MIN - 1), 'compact');
  });

  it('calls a small window medium — still the bottom bar, because a rail would not leave room', () => {
    assert.equal(viewportClass(MEDIUM_VIEWPORT_MIN), 'medium');
    assert.equal(viewportClass(EXPANDED_VIEWPORT_MIN - 1), 'medium');
  });

  it('calls a laptop expanded, which is the only width that gets the rail', () => {
    assert.equal(viewportClass(EXPANDED_VIEWPORT_MIN), 'expanded');
    assert.equal(viewportClass(1440), 'expanded');
  });
});

describe('the stylesheet against these names', () => {
  // Stated plainly because a passing test with nothing to check is worth less than it looks: the
  // navigation frame is the first thing that needs a width query, so today this rule has no
  // subjects and holds vacuously. It is here now so that it is already in place when it does.
  it('writes no width query that is not one of them', async () => {
    const css = await readFile(
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'console.css'),
      'utf8',
    );

    const named = new Set([
      String(MEDIUM_VIEWPORT_MIN),
      String(MEDIUM_VIEWPORT_MIN - 1),
      String(EXPANDED_VIEWPORT_MIN),
      String(EXPANDED_VIEWPORT_MIN - 1),
    ]);

    const queries = [...css.matchAll(/\(\s*(?:min|max)-width\s*:\s*(\d+)px\s*\)/gu)];
    for (const [whole, width] of queries) {
      assert.ok(
        named.has(width),
        `console.css has "${whole}", which is not one of the named width classes in viewport.ts`,
      );
    }
  });
});
