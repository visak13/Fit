/**
 * THE CONTEXTUAL LAYER'S RULES.
 *
 * The rule these exist for is the one that keeps the two navigation layers from colliding: a
 * destination never appears in the contextual layer. Six screens are going to declare trails in
 * later steps, and a rule six authors each remember separately is a rule that holds five times —
 * so it is code in `trail.ts`, and this is where it is proved.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DESTINATIONS } from './navigation.ts';
import type { ContextualTrail } from './trail.ts';
import { backControlLabel, contextualLine, namesADestination, trailKey } from './trail.ts';

const PATHS = DESTINATIONS.map((destination) => destination.path);

/** A well-formed trail: inside the Clients destination, two levels down. */
const PRIYA_SESSION: ContextualTrail = {
  back: { label: "Priya's sessions", to: 'clients/priya/sessions' },
  steps: [{ label: 'Priya', to: 'clients/priya' }],
  here: 'Tuesday, 12 June',
};

describe('telling a destination from something inside one', () => {
  it('knows the five destinations themselves', () => {
    for (const path of PATHS) {
      assert.ok(namesADestination(path, PATHS), `${path} is a destination`);
    }
  });

  it('does not mistake something INSIDE a destination for the destination', () => {
    assert.equal(namesADestination('clients/priya', PATHS), false);
    assert.equal(namesADestination('clients/priya/sessions', PATHS), false);
  });

  it('recognises a destination however a screen spelled the route', () => {
    for (const spelling of ['clients', '/clients', '#/clients', 'clients/', ' clients ']) {
      assert.ok(namesADestination(spelling, PATHS), `${spelling} is still the Clients destination`);
    }
  });

  it('does not flag a path that merely resembles one', () => {
    assert.equal(namesADestination('client', PATHS), false);
    assert.equal(namesADestination('', PATHS), false);
  });
});

describe('drawing a well-formed trail', () => {
  const line = contextualLine(PRIYA_SESSION, PATHS);

  it('reports nothing wrong with it', () => {
    assert.deepEqual(line?.problems, []);
  });

  it('words the way back as a place rather than as an arrow', () => {
    assert.equal(line?.back?.label, "Back to Priya's sessions");
    assert.equal(line?.back?.to, 'clients/priya/sessions');
  });

  it('ends the crumbs at where the coach is, which is not a link', () => {
    assert.deepEqual(line?.crumbs, [
      { label: 'Priya', to: 'clients/priya' },
      { label: 'Tuesday, 12 June', to: null },
    ]);
  });

  it('draws nothing at all for a destination’s own screen', () => {
    assert.equal(contextualLine(null, PATHS), null);
  });
});

describe('refusing what would make the two layers collide', () => {
  it('drops a crumb that names a destination, and says which', () => {
    const line = contextualLine(
      { ...PRIYA_SESSION, steps: [{ label: 'Clients', to: 'clients' }, ...PRIYA_SESSION.steps] },
      PATHS,
    );

    assert.deepEqual(
      line?.crumbs.map((crumb) => crumb.label),
      ['Priya', 'Tuesday, 12 June'],
    );
    assert.equal(line?.problems.length, 1);
    assert.equal(line?.problems[0].label, 'Clients');
    assert.ok(line?.problems[0].reason.includes('global navigation'));
  });

  it('drops a way back that points at a destination the rail already carries', () => {
    const line = contextualLine(
      { ...PRIYA_SESSION, back: { label: 'Clients', to: '/clients' } },
      PATHS,
    );

    assert.equal(line?.back, null);
    assert.equal(line?.problems.length, 1);
  });

  it('keeps a way back that points INSIDE a destination, which is what this layer is for', () => {
    const line = contextualLine(
      { ...PRIYA_SESSION, back: { label: "Priya's record", to: 'clients/priya' } },
      PATHS,
    );

    assert.equal(line?.back?.label, "Back to Priya's record");
    assert.deepEqual(line?.problems, []);
  });

  it('refuses an unworded crumb, an unworded way back and an unnamed here', () => {
    const line = contextualLine(
      {
        back: { label: '   ', to: 'clients/priya' },
        steps: [{ label: '', to: 'clients/priya/sessions' }],
        here: '',
      },
      PATHS,
    );

    assert.equal(line?.back, null);
    assert.deepEqual(line?.crumbs, []);
    assert.equal(line?.problems.length, 3);
  });
});

describe('the wording of the way back', () => {
  it('reads as a thing to go back to, not as a screen', () => {
    assert.equal(backControlLabel({ label: "Priya's sessions", to: 'x/y' }), "Back to Priya's sessions");
  });
});

describe('knowing when a screen has declared a DIFFERENT trail', () => {
  it('gives the same trail the same key however many objects it arrives in', () => {
    assert.equal(trailKey(PRIYA_SESSION), trailKey({ ...PRIYA_SESSION, steps: [...PRIYA_SESSION.steps] }));
  });

  it('gives no trail an empty key', () => {
    assert.equal(trailKey(null), '');
  });

  it('changes when a crumb is reworded', () => {
    assert.notEqual(trailKey(PRIYA_SESSION), trailKey({ ...PRIYA_SESSION, here: 'Wednesday, 13 June' }));
  });

  it('does not merge two trails whose words differ only in where the spaces fall', () => {
    // The reason the key is joined on a separator no label can contain rather than on a space:
    // joined on a space these two are one string, and a reworded crumb would not republish.
    const a: ContextualTrail = { ...PRIYA_SESSION, back: { label: 'a b', to: 'c/d' }, here: 'e' };
    const b: ContextualTrail = { ...PRIYA_SESSION, back: { label: 'a', to: 'b c/d' }, here: 'e' };
    assert.notEqual(trailKey(a), trailKey(b));
  });
});
