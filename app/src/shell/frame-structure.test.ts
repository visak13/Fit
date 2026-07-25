/**
 * THE FRAME'S STRUCTURE, AND THE THREE PROPERTIES OF IT THAT FAIL SILENTLY.
 *
 * None of these are about how the frame looks. They are the properties that, when broken, leave
 * every computed check green and the interface wrong:
 *
 * 1. **The synchronisation slot is a sibling, not a descendant.** Two builders have already made
 *    that element a child of something scrollable while every check on it passed. It is a grid AREA
 *    of `.app` here, and a grid area only places a DIRECT CHILD — so the placement working at all
 *    is the proof, and these tests are what keep the declaration that makes it work.
 * 2. **There is ONE width boundary.** A media query cannot read a custom property, so the number is
 *    written out, and the drift is silent: the boundary moves in TypeScript, the stylesheet keeps
 *    the old one, and for a band of widths the interface shows two global surfaces or none.
 * 3. **There is one destination list.** A second copy in the markup is how a route ends up
 *    reachable by URL and invisible in the interface.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { EXPANDED_VIEWPORT_MIN } from '../design/viewport.ts';
import { DESTINATIONS } from './navigation.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

const consoleCss = await readFile(path.join(here, '..', 'design', 'console.css'), 'utf8');
const appFrame = await readFile(path.join(here, 'AppFrame.tsx'), 'utf8');

/**
 * The source with its comments taken out.
 *
 * The second-copy check below looks for a destination's words written into the frame, and a
 * comment EXPLAINING a destination is not a second copy of the list — the frame's own notes quote
 * "Calendar" while measuring the rail's width. Scanning the prose would make the check fire on
 * documentation, which teaches the next author to delete the note rather than to keep the property.
 */
function withoutComments(source: string): string {
  let out = '';
  let at = 0;
  while (at < source.length) {
    const block = source.indexOf('/*', at);
    const line = source.indexOf('//', at);
    const next = block === -1 ? line : line === -1 ? block : Math.min(block, line);
    if (next === -1) return out + source.slice(at);

    out += source.slice(at, next);
    if (next === block) {
      const close = source.indexOf('*/', next + 2);
      at = close === -1 ? source.length : close + 2;
    } else {
      const end = source.indexOf('\n', next);
      at = end === -1 ? source.length : end;
    }
  }
  return out;
}

const appFrameCode = withoutComments(appFrame);

describe('the four regions of the frame', () => {
  it('lays the wide surface out as the rail beside the content with the status under the rail', () => {
    assert.ok(
      consoleCss.includes("'rail content'") && consoleCss.includes("'status content'"),
      'console.css no longer declares the wide grid as rail-over-status beside a content column',
    );
  });

  it('lays the narrow surface out as content, then status, then bar', () => {
    assert.ok(
      consoleCss.includes("'content'\n      'status'\n      'bar'"),
      'console.css no longer stacks content, then the status slot, then the bar',
    );
  });

  it('places the status slot by grid area, which is the thing only a direct child can do', () => {
    const slot = consoleCss.indexOf('.frame-status {');
    assert.ok(slot > -1, 'console.css has no rule for the synchronisation slot');
    assert.ok(
      consoleCss.slice(slot, slot + 400).includes('grid-area: status'),
      'the synchronisation slot is no longer placed in the frame’s own grid, so it is no longer ' +
        'guaranteed to be a sibling of the content and the rail',
    );
  });
});

describe('the one width boundary', () => {
  const boundaries = [`(max-width: ${EXPANDED_VIEWPORT_MIN - 1}px)`, `(min-width: ${EXPANDED_VIEWPORT_MIN}px)`];

  it('switches the two global surfaces at the expanded class and nowhere else', () => {
    for (const boundary of boundaries) {
      assert.ok(consoleCss.includes(boundary), `console.css no longer branches at ${boundary}`);
    }
  });

  it('removes the rail below it rather than merely leaving it unused', () => {
    const narrow = consoleCss.indexOf(boundaries[0]);
    const wide = consoleCss.indexOf(boundaries[1]);
    assert.ok(narrow > -1 && wide > narrow);

    const narrowBlock = consoleCss.slice(narrow, wide);
    assert.ok(
      narrowBlock.includes('.rail {\n    display: none;\n  }'),
      'the rail is no longer removed on the narrow surface, so a device that may have no pointer ' +
        'can reach an affordance that depends on one',
    );
  });

  it('removes the bar above it, so the two surfaces are never both present', () => {
    assert.ok(
      consoleCss.slice(consoleCss.indexOf(boundaries[1])).includes('.bar {\n    display: none;\n  }'),
    );
  });
});

describe('one destination list, two surfaces', () => {
  it('never writes a destination’s words into the frame', () => {
    for (const destination of DESTINATIONS) {
      assert.ok(
        !appFrameCode.includes(`'${destination.label}'`) &&
          !appFrameCode.includes(`"${destination.label}"`) &&
          !appFrameCode.includes(`>${destination.label}<`),
        `AppFrame.tsx spells out "${destination.label}", which is a second copy of the destination list`,
      );
    }
  });

  it('builds both surfaces from the one list', () => {
    // Three, not two: the rail, the bar, and the path list the contextual layer is checked against
    // so that a destination cannot appear in a breadcrumb. All three read the same array.
    assert.equal(
      appFrameCode.split('DESTINATIONS.map').length - 1,
      3,
      'the wide rail and the narrow bar are no longer both built by mapping the one destination list',
    );
  });
});

describe('the synchronisation slot, and the indicator now in it', () => {
  it('is a child of the frame rather than of the content, which is what can scroll', () => {
    const app = appFrame.indexOf('className="app"');
    const slot = appFrame.indexOf('className="frame-status"');
    const content = appFrame.indexOf('className="content"');

    assert.ok(app > -1 && slot > -1 && content > -1, 'the frame no longer has all three regions');
    assert.ok(slot > app, 'the synchronisation slot is outside the application frame');
    assert.ok(
      slot < content,
      'the synchronisation slot now opens after the content region, so it can be inside it — the ' +
        'exact defect that has already shipped twice with every computed check green',
    );
  });

  /*
   * The three assertions below are the SOURCE-LEVEL half of the property. They cannot prove the
   * element is on screen — nothing that reads the DOM at rest can, which is the whole lesson of the
   * two builds that shipped this wrong with every check green — but they do catch the edit that
   * would make it untrue, which is somebody moving the indicator to where the words are.
   */
  it('renders the indicator into the slot rather than anywhere else in the frame', () => {
    assert.equal(
      appFrameCode.split('<SyncIndicator').length - 1,
      1,
      'the indicator is drawn a number of times other than once, and two of them would be two live ' +
        'regions announcing the same state with a rule that only one counts, which nothing can check',
    );

    const slot = appFrameCode.indexOf('className="frame-status"');
    const indicator = appFrameCode.indexOf('<SyncIndicator');
    const content = appFrameCode.indexOf('className="content"');

    assert.ok(indicator > slot, 'the indicator is no longer inside the frame’s status slot');
    assert.ok(
      indicator < content,
      'the indicator now sits after the content region opens, so it can be inside the one thing in ' +
        'this application that scrolls',
    );
  });

  it('is not drawn by a screen, because there is exactly one of it and the frame owns it', async () => {
    const screens = path.join(here, '..', 'screens');
    for (const file of await readdir(screens)) {
      const source = await readFile(path.join(screens, file), 'utf8');
      assert.ok(
        !source.includes('SyncIndicator') && !source.includes('useSyncStatus'),
        `${file} draws or reads the synchronisation indicator; a second one on a screen is a second ` +
          'live region, and a screen is exactly the thing that can scroll away',
      );
    }
  });
});

describe('the attribute that hides things actually hides them', () => {
  it('ships the one rule that beats an author display rule', () => {
    assert.ok(
      consoleCss.includes('[hidden] {\n  display: none !important;\n}'),
      'without this, setting element.hidden leaves the element on screen wherever a component sets ' +
        'display — four times in one step, with nothing wrong in the markup or the script',
    );
  });
});
