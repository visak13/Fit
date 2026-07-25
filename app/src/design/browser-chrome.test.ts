/**
 * The decision this module makes is what to do when the stylesheet has not answered yet, and that
 * is the case worth testing: an invented colour would be a wrong one that no theme change corrects,
 * where an untouched tag is simply the browser's own default.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CHROME_COLOUR_TOKEN, applyBrowserChromeColour } from './browser-chrome.ts';
import type { ChromeMeta } from './browser-chrome.ts';

function fakeMeta(): ChromeMeta & { written: string[] } {
  const written: string[] = [];
  return {
    written,
    setAttribute(name: string, value: string) {
      assert.equal(name, 'content');
      written.push(value);
    },
  };
}

describe("the browser's chrome colour", () => {
  it('is whatever the page floor currently resolves to', () => {
    const meta = fakeMeta();
    const written = applyBrowserChromeColour({ meta, readSurfaceColour: () => '#EFF3F7' });
    assert.equal(written, '#EFF3F7');
    assert.deepEqual(meta.written, ['#EFF3F7']);
  });

  it('is trimmed, because a computed custom property arrives with its leading space', () => {
    const meta = fakeMeta();
    applyBrowserChromeColour({ meta, readSurfaceColour: () => ' #0B0F14' });
    assert.deepEqual(meta.written, ['#0B0F14']);
  });

  it('LEAVES THE TAG ALONE when the stylesheet has not resolved, rather than inventing one', () => {
    const meta = fakeMeta();
    const written = applyBrowserChromeColour({ meta, readSurfaceColour: () => '' });
    assert.equal(written, null);
    assert.deepEqual(meta.written, []);
  });

  it('reads the floor of the interface and not some other surface', () => {
    // The surround the browser draws sits beside the page, so it matches the page rather than a
    // card sitting on it.
    assert.equal(CHROME_COLOUR_TOKEN, '--surface-page');
  });
});
