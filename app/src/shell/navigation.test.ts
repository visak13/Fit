/**
 * The navigation list is the single source both the router and the navigation bar are built from,
 * so a defect in it produces either a link that goes nowhere or a screen nobody can reach. These
 * checks guard the properties the route table assumes when it maps over the list.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

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

  it('uses plain relative paths, which is what the frame’s links and the route table expect', () => {
    for (const destination of DESTINATIONS) {
      assert.ok(
        !destination.path.startsWith('/') && !destination.path.includes('#'),
        `${destination.path} is not a plain relative path`,
      );
    }
  });
});
