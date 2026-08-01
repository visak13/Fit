/**
 * ONE SEAM SHAPE, SIX TIMES — asserted across all of them rather than described in six file headers.
 *
 * `Divergences.tsx` was the first screen in this application to need data from the core, and it wrote
 * down what a seam here is made of, saying outright that "two later screens will copy this seam, so what
 * it is made of matters more than that it works". There are now six, and every one of them was supposed
 * to be that same thing rather than a fresh idea about how a screen gets its data.
 *
 * "Supposed to be" is what this file replaces. Six headers each claiming to have copied the first is
 * six claims nothing checks — and a second seam of a different shape is exactly the sort of divergence
 * that is invisible in review and expensive later, because the step that wires the store then has to
 * satisfy two contracts and will satisfy one of them badly.
 *
 * ## AND THE COUNT BELOW IS WHY THE SIXTH IS HERE AT ALL
 *
 * The list is maintained BY HAND, which is the one weakness in an otherwise derived guard: a seam added
 * by an action that does not own this file is simply absent, and every assertion below goes on passing
 * over the five it can see. That is not hypothetical — the journal seam shipped, `journal-seam.test.ts`
 * asserted these properties on it PRIVATELY because it could not edit this file, and this suite was
 * green throughout. The length assertion is what caught it. RAISE that number when a seam is added;
 * deleting it to make the file pass would turn a guard that works into one that is permanently silent.
 *
 * THE THREE PROPERTIES, held by all six:
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
import { JournalProvider, NOTHING_HAS_BEEN_READ, useJournal } from './Journal.tsx';
import { KeyMaterialProvider, NO_KEY_MATERIAL_CONDITION, useKeyMaterial } from './KeyMaterial.tsx';
import { NOTHING_AWAITING_REMOVAL, RemovalsProvider, useRemovals } from './Removals.tsx';
import { NOTHING_STOPPED, StoppedChangesProvider, useStoppedChanges } from './StoppedChanges.tsx';
import { NO_BACKUP_YET, SyncStatusProvider, useSyncStatus } from './SyncStatus.tsx';

/**
 * The six seams, each named, with its hook, its provider and its empty reading.
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
  // THE SIXTH, and the one this file was written waiting for. `journal-seam.test.ts` asserted these
  // same three properties on it privately, because the action that built the seam did not own this
  // file — which is exactly the condition the count below exists to end. A seam checked only against a
  // copy of the rules is a seam nobody compared to the other five.
  {
    what: 'the journal seam',
    hook: useJournal,
    provider: JournalProvider,
    empty: NOTHING_HAS_BEEN_READ as unknown as Record<string, unknown>,
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
  /**
   * THE COUNT, AND THE NAMES BESIDE IT — and the second half was measured rather than assumed.
   *
   * The count alone was break-probed by deleting the journal entry from the list, and it did fail on
   * the right assertion. But its message could only describe the too-MANY case — "a seventh seam was
   * added and not listed" — while what had actually happened was a seam going MISSING, and the diff
   * said `5` against `6` and named nothing. A guard whose red misdescribes the failure sends the next
   * person looking for the wrong thing, on the one file whose job is to notice a seam nobody compared.
   *
   * So the NAMES are asserted too, which makes the diff name the seam that went. The count STAYS: it
   * is what catches a seam added under a name nobody thought to expect, which a name list on its own
   * would swallow by simply being wrong in two places at once. Both are RAISED when a seam is added.
   * Neither is deleted to make this file pass — a guard removed to silence it is strictly worse than
   * the gap it was reporting.
   */
  it('has six of them, by count and by name, so this file cannot quietly stop covering one', () => {
    assert.deepEqual(
      SEAMS.map((seam) => seam.what),
      [
        'the divergence seam',
        'the synchronisation seam',
        'the key-material seam',
        'the stopped-changes seam',
        'the pending-removal seam',
        'the journal seam',
      ],
      'the seams listed here are not the seams this file expects. A NAME MISSING FROM THE LEFT is a '
        + 'seam that stopped being compared to the others; a name missing from the RIGHT is a seam '
        + 'added and never listed. Both are how a second seam shape gets in.',
    );

    assert.equal(
      SEAMS.length,
      6,
      'the number of seams in the interface has changed. RAISE this and the list above together; '
        + 'never delete either to make the file pass. This assertion is the only thing that made the '
        + 'journal seam get listed at all — it shipped, was asserted privately in its own file '
        + 'because the action that built it could not edit this one, and this suite was green '
        + 'throughout.',
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
