/**
 * FOLLOWING THE WINDOW'S WIDTH — asserted with no browser, because there is no DOM renderer here.
 *
 * `viewport-width.ts` exists so ONE judgement can be made in JavaScript that CSS cannot make: a
 * sentence that must not be SAID on a phone, rather than one laid out differently there. That makes
 * its release matter as much as its reading — a listener that outlives the screen goes on answering
 * for a component that is gone — so all three are asserted: what it reads, that it republishes on a
 * resize, and that it stops.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readWidth, subscribeToWidth } from './viewport-width.ts';
import type { WidthSource } from './viewport-width.ts';

/** A window that is only what this module uses of one, and that reports what it was asked. */
function aWindow(width: number) {
  const listeners: (() => void)[] = [];
  const source: WidthSource & { resizeTo(next: number): void; listening(): number } = {
    innerWidth: width,
    addEventListener(_type, listener) { listeners.push(listener); },
    removeEventListener(_type, listener) {
      const at = listeners.indexOf(listener);
      if (at >= 0) listeners.splice(at, 1);
    },
    resizeTo(next: number) {
      (source as { innerWidth: number }).innerWidth = next;
      for (const listener of [...listeners]) listener();
    },
    listening: () => listeners.length,
  };
  return source;
}

describe('following the window width', () => {
  it('reads the width the window reports', () => {
    assert.equal(readWidth(aWindow(390)), 390);
    assert.equal(readWidth(aWindow(1280)), 1280);
  });

  it('publishes on a resize, and the reading taken then is the NEW width', () => {
    const window = aWindow(1280);
    let published = 0;
    let seen: number | null = null;

    subscribeToWidth(window, () => { published += 1; seen = readWidth(window); });
    window.resizeTo(390);

    assert.equal(published, 1);
    assert.equal(seen, 390, 'it published the change and then reported the width from before it');
  });

  /**
   * THE RELEASE, AND IT IS ASSERTED AGAINST THE WINDOW RATHER THAN AGAINST A FLAG OF ITS OWN.
   *
   * A cancel that stops calling back while leaving the listener attached passes any test that
   * counts its own publications, and leaks exactly the same way.
   */
  it('stops listening when released, and leaves the window as it found it', () => {
    const window = aWindow(1280);
    let published = 0;

    const release = subscribeToWidth(window, () => { published += 1; });
    assert.equal(window.listening(), 1);

    release();
    assert.equal(window.listening(), 0, 'the listener is still attached to the window after release');

    window.resizeTo(390);
    assert.equal(published, 0);
  });
});
