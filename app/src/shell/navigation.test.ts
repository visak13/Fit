/**
 * The navigation list is the single source both the router and the navigation bar are built from,
 * so a defect in it produces either a link that goes nowhere or a screen nobody can reach. These
 * checks guard the properties the route table assumes when it maps over the list.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GLYPHS } from '../design/glyphs.generated.ts';
import { DEFAULT_DESTINATION_PATH, DESTINATIONS } from './navigation.ts';

describe('the navigation skeleton', () => {
  it('offers the five destinations the application must reach from anywhere', () => {
    assert.deepEqual(
      DESTINATIONS.map((destination) => destination.path),
      ['clients', 'calendar', 'routines', 'diet', 'admin'],
    );
  });

  it('has no duplicate path, so no destination can shadow another in the route table', () => {
    const paths = DESTINATIONS.map((destination) => destination.path);
    assert.equal(new Set(paths).size, paths.length);
  });

  it('lands its default on a destination that actually exists', () => {
    const paths = DESTINATIONS.map((destination) => destination.path);
    assert.ok(paths.includes(DEFAULT_DESTINATION_PATH));
  });

  it('gives every destination a label and a summary, so no placeholder is a blank page', () => {
    for (const destination of DESTINATIONS) {
      assert.ok(destination.label.length > 0, `${destination.path} has no label`);
      assert.ok(destination.summary.length > 0, `${destination.path} has no summary`);
    }
  });

  it('gives every destination a mark that the glyph family actually has', () => {
    for (const destination of DESTINATIONS) {
      assert.ok(
        Object.hasOwn(GLYPHS, destination.glyph),
        `${destination.path} asks for the glyph "${destination.glyph}", which is not in the family`,
      );
    }
  });

  it('gives no two destinations the same mark, so neither surface can say the wrong one', () => {
    const glyphs = DESTINATIONS.map((destination) => destination.glyph);
    assert.equal(new Set(glyphs).size, glyphs.length);
  });

  it('offers help only where the NAME does not say what is behind it', () => {
    // Deliberately a count rather than a list of which: a tooltip on every destination is noise
    // that trains the coach to ignore all of them, including the one that mattered. If this ever
    // has to rise, the question to answer first is whether the LABEL should have changed instead.
    const withHelp = DESTINATIONS.filter((destination) => destination.help !== undefined);
    assert.equal(withHelp.length, 1);
    assert.ok((withHelp[0].help ?? '').length > 0);
  });

  it('uses plain relative paths, which is what the frame’s links and the route table expect', () => {
    for (const destination of DESTINATIONS) {
      assert.ok(
        !destination.path.startsWith('/') && !destination.path.includes('#'),
        `${destination.path} is not a plain relative path`,
      );
    }
  });
});
