/**
 * ONE SEAM SHAPE, FIVE TIMES — asserted across all of them rather than described in five file headers.
 *
 * `Divergences.tsx` was the first screen in this application to need data from the core, and it wrote
 * down what a seam here is made of, saying outright that "two later screens will copy this seam, so what
 * it is made of matters more than that it works". There are now five, and every one of them was supposed
 * to be that same thing rather than a fresh idea about how a screen gets its data.
 *
 * "Supposed to be" is what this file replaces. Five headers each claiming to have copied the first is
 * five claims nothing checks — and a second seam of a different shape is exactly the sort of divergence
 * that is invisible in review and expensive later, because the step that wires the store then has to
 * satisfy two contracts and will satisfy one of them badly.
 *
 * THE THREE PROPERTIES, held by all five:
 *
 *  1. **The provider is REQUIRED.** Using the hook outside it THROWS, naming the seam. Not a default —
 *     because the state a default invents is always the reassuring one: "nothing to decide", "nothing is
 *     wrong", "nothing has stopped", "every removal is confirmed". Each of those is the exact false
 *     good news the surface above it exists to prevent.
 *  2. **The empty value is a real reading, frozen.** It is what the core genuinely returns over a store
 *     in this build's condition, not a placeholder, so nothing drifts when the real call arrives.
 *  3. **The reading is DATA.** Nothing on it is callable, with one declared exception: the divergence
 *     seam's `resolve`, which is a question the coach answers and is null until a source is wired. Every
 *     other seam carries facts only, and a control appearing on one of them is a change this fails on.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DivergenceProvider, NOTHING_TO_DECIDE, useDivergences } from './Divergences.tsx';
import { KeyMaterialProvider, NO_KEY_MATERIAL_CONDITION, useKeyMaterial } from './KeyMaterial.tsx';
import { NOTHING_AWAITING_REMOVAL, RemovalsProvider, useRemovals } from './Removals.tsx';
import { NOTHING_STOPPED, StoppedChangesProvider, useStoppedChanges } from './StoppedChanges.tsx';
import { NO_BACKUP_YET, SyncStatusProvider, useSyncStatus } from './SyncStatus.tsx';

/**
 * The five seams, each named, with its hook, its provider and its empty reading.
 *
 * `resolve` is the ONE declared callable in the whole set, and it is declared HERE rather than allowed
 * by a loose rule, so a second one cannot be added without editing this list and saying why.
 */
const SEAMS = [
  {
    what: 'the divergence seam',
    hook: useDivergences,
    provider: DivergenceProvider,
    empty: NOTHING_TO_DECIDE as unknown as Record<string, unknown>,
    allowedCallables: ['resolve'],
  },
  {
    what: 'the synchronisation seam',
    hook: useSyncStatus,
    provider: SyncStatusProvider,
    empty: NO_BACKUP_YET as unknown as Record<string, unknown>,
    allowedCallables: [],
  },
  {
    what: 'the key-material seam',
    hook: useKeyMaterial,
    provider: KeyMaterialProvider,
    empty: NO_KEY_MATERIAL_CONDITION as unknown as Record<string, unknown>,
    allowedCallables: [],
  },
  {
    what: 'the stopped-changes seam',
    hook: useStoppedChanges,
    provider: StoppedChangesProvider,
    empty: NOTHING_STOPPED as unknown as Record<string, unknown>,
    allowedCallables: [],
  },
  {
    what: 'the pending-removal seam',
    hook: useRemovals,
    provider: RemovalsProvider,
    empty: NOTHING_AWAITING_REMOVAL as unknown as Record<string, unknown>,
    allowedCallables: [],
  },
];

/** Everything callable anywhere in a value, by path, however deeply nested. */
function callables(value: unknown, path = ''): string[] {
  if (typeof value === 'function') return [path];
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, held]) =>
    callables(held, path === '' ? key : `${path}.${key}`));
}

describe('every seam in the interface is the same seam', () => {
  it('has five of them, so this file cannot quietly stop covering one', () => {
    assert.equal(
      SEAMS.length,
      5,
      'a sixth seam was added and not listed here. Add it — a seam nobody compared to the others is how '
        + 'a second shape gets in.',
    );
  });

  for (const { what, hook, provider, empty, allowedCallables } of SEAMS) {
    it(`${what}: REQUIRES its provider and throws outside it rather than inventing a state`, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Consumer = () => createElement('p', null, String(Object.keys(hook() as any).length));

      assert.throws(
        () => renderToStaticMarkup(createElement(Consumer)),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(
            error.message,
            /seam is not wired/,
            'the failure must say a SEAM is unwired. An unwired screen that rendered good news is the '
              + 'one outcome none of these five may have.',
          );
          return true;
        },
        `${what} rendered something outside its provider`,
      );
    });

    it(`${what}: renders through its provider with the empty reading`, () => {
      const Consumer = () => createElement('p', null, 'read');
      const html = renderToStaticMarkup(
        createElement(provider as never, { reading: empty, children: createElement(Consumer) }),
      );
      assert.ok(html.includes('read'), `${what} could not be filled with its own empty value`);
    });

    it(`${what}: its empty reading is frozen and is a real value rather than a placeholder`, () => {
      assert.ok(Object.isFrozen(empty), `${what}'s empty reading can be mutated by whoever holds it`);
      assert.ok(
        Object.keys(empty).length > 0,
        `${what}'s empty reading has no fields at all, so it cannot be what the core returns`,
      );
    });

    it(`${what}: carries DATA, and only the declared callable`, () => {
      assert.deepEqual(
        callables(empty),
        allowedCallables.filter((name) => typeof empty[name] === 'function'),
        `${what} carries a function that is not declared in this file. A control arriving on a seam as `
          + 'a convenience is what this asserts against: the four reporting seams have no way to act, '
          + 'and only the divergence seam ever answers a question.',
      );
    });
  }

  it('lets exactly ONE seam carry a way back, and it is nullable until a source is wired', () => {
    const answering = SEAMS.filter((seam) => seam.allowedCallables.length > 0);
    assert.deepEqual(
      answering.map((seam) => seam.what),
      ['the divergence seam'],
      'a second seam has grown a way to act. A divergence is a question the coach ANSWERS; a stopped '
        + 'change, a duplicate key and an unconfirmed removal are conditions he is TOLD about, and the '
        + 'actions on them belong where the delivery happens.',
    );
    assert.equal(
      NOTHING_TO_DECIDE.resolve,
      null,
      'and it is null in this build, so the picker offers no button it cannot honour',
    );
  });
});
