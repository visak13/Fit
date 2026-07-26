/**
 * EVERY ACTION CODE GOES SOMEWHERE, OR IS SOMEBODY'S — and a code that is neither fails this file.
 *
 * `core/status/reasons.js` does not merely say why a synchronisation did not happen; for five of its
 * reasons it names an ACTION as a code. `SyncStatus.tsx` listed all five as things "the later step" must
 * supply and named no step — and naming no step is exactly how two of them came to be waiting on the
 * Google integration for no reason at all. Both are reads over the LOCAL outbox queue.
 *
 * So the table exists, and this file is what stops it becoming decoration:
 *
 *  1. Every action code the CORE declares appears in the table, derived from `REASONS` rather than typed
 *     here, so a code added to the core and forgotten in the table is a failure and not an omission.
 *  2. The table declares no code the core does not, so it cannot grow entries for actions nothing
 *     produces.
 *  3. Exactly one of `path` and `ownedBy` is set on every member. Both would be a claim that something
 *     is built and also somebody's; neither is the "later" this table was written to abolish.
 *  4. Every `path` RESOLVES against the shipped route table and is not the catch-all — checked with
 *     react-router's own matcher against the real array, not against a list of paths typed in here.
 *  5. **The check is proven able to fail.** A guard never observed failing is not known to guard
 *     anything, so the last test builds each malformed table this file is supposed to reject and asserts
 *     that the same rules reject it.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { matchRoutes } from 'react-router';

import { REASONS } from '../../core/status/reasons.js';
import {
  ACTION_DESTINATIONS, CODES_CLOSED_LOCALLY, DECLARED_ACTION_CODES, OWNING_STEP,
  destinationForAction,
} from './action-destinations.ts';
import type { ActionDestination } from './action-destinations.ts';
import { ROUTE_TABLE } from './routes.tsx';

const ROUTES = [...ROUTE_TABLE];

/**
 * The rules, as one function over a table, so the real table and the deliberately broken ones below are
 * judged by the SAME code. A check that judged the real table by one route and the counterexamples by
 * another would prove only that this file can write two functions.
 */
function faultsIn(
  table: Readonly<Record<string, ActionDestination>>,
  declared: readonly string[],
): string[] {
  const faults: string[] = [];

  for (const code of declared) {
    if (!(code in table)) faults.push(`${code} is declared by the core and appears nowhere in the table`);
  }
  for (const [code, destination] of Object.entries(table)) {
    if (!declared.includes(code)) faults.push(`${code} is in the table and no core reason produces it`);

    const hasPath = typeof destination.path === 'string' && destination.path.length > 0;
    const hasOwner = typeof destination.ownedBy === 'string' && destination.ownedBy.length > 0;

    if (hasPath && hasOwner) faults.push(`${code} claims both an address and an owner`);
    if (!hasPath && !hasOwner) faults.push(`${code} has neither an address nor a named owner`);
    if (destination.because.trim().length === 0) faults.push(`${code} does not say why`);

    if (hasPath) {
      const matched = matchRoutes(ROUTES, `/${destination.path as string}`);
      if (matched === null) faults.push(`${code} leads to /${destination.path}, which matches no route`);
      else if (matched.at(-1)?.route.path === '*') {
        faults.push(`${code} leads to /${destination.path}, which falls through to not-found`);
      }
    }
  }
  return faults;
}

describe('the table against the core', () => {
  it('has an entry for every action code the core declares, and no entry the core does not', () => {
    assert.deepEqual(
      faultsIn(ACTION_DESTINATIONS, DECLARED_ACTION_CODES),
      [],
      'the shipped table must satisfy every rule this file holds',
    );
  });

  it('derives the codes from REASONS rather than from a list typed into either file', () => {
    const fromCore = [
      ...new Set(
        Object.values(REASONS)
          .map((reason: { action: string | null }) => reason.action)
          .filter((action): action is string => action !== null),
      ),
    ];

    assert.deepEqual([...DECLARED_ACTION_CODES].sort(), fromCore.sort());
    assert.ok(DECLARED_ACTION_CODES.length > 0, 'and the derivation really found some');
  });

  it('drops the reasons where there is genuinely nothing to do rather than inventing an action', () => {
    const withoutAction = Object.values(REASONS).filter(
      (reason: { action: string | null }) => reason.action === null,
    );
    assert.ok(
      withoutAction.length > 0,
      '`reasons.js` is explicit that some reasons have no action on purpose: offering one that does not '
        + 'help is how an indicator earns the reputation of lying. If none is left, that decision was '
        + 'reversed somewhere and this table should be re-read.',
    );
  });
});

describe('the two codes closed here', () => {
  it('both have an address and no owner, because they are built', () => {
    assert.equal(CODES_CLOSED_LOCALLY.length, 2);
    for (const code of CODES_CLOSED_LOCALLY) {
      const destination = destinationForAction(code);
      assert.ok(destination !== null, `${code} is not in the table`);
      assert.ok(typeof destination.path === 'string' && destination.path.length > 0);
      assert.equal(destination.ownedBy, null);
    }
  });

  it('lead to the SAME address, because they are two halves of one review', () => {
    const [refused, unconfirmed] = CODES_CLOSED_LOCALLY.map(destinationForAction);
    assert.equal(
      refused?.path,
      unconfirmed?.path,
      'one screen answers both, with two groups inside it. Two addresses would be two screens for one '
        + 'question, and the coach would have to know which of his stopped changes was which before he '
        + 'could go and look at it.',
    );
  });
});

describe('the codes that are NOT this step\'s', () => {
  it('name a real step and offer no address at all', () => {
    const local = new Set(CODES_CLOSED_LOCALLY);
    const owned = Object.entries(ACTION_DESTINATIONS).filter(([code]) => !local.has(code));
    const steps = new Set<string>(Object.values(OWNING_STEP));

    assert.equal(owned.length, 3);
    for (const [code, destination] of owned) {
      assert.equal(destination.path, null, `${code} must not have an address in this build`);
      assert.ok(
        steps.has(destination.ownedBy as string),
        `${code} names "${destination.ownedBy}", which is not one of the steps this file declares. `
          + '"Later" is what this table exists to abolish.',
      );
    }
  });

  it('are not stubbed anywhere: naming an owner is the opposite of half-building it', () => {
    for (const [code, destination] of Object.entries(ACTION_DESTINATIONS)) {
      if (destination.ownedBy === null) continue;
      assert.ok(
        destination.because.length > 20,
        `${code} says nothing about why it is not here, so the next reader has to guess whether it was `
          + 'a decision or an oversight',
      );
    }
  });
});

describe('an unknown code', () => {
  it('is answered with null rather than a throw, because the coach\'s screen is not where that fails', () => {
    assert.equal(destinationForAction('a_code_the_core_never_had'), null);
  });
});

describe('the check is proven able to fail', () => {
  const anAddress = ACTION_DESTINATIONS[CODES_CLOSED_LOCALLY[0]].path as string;

  /** Every malformed table these rules are supposed to reject, with the fault each one carries. */
  const BROKEN: Array<{ what: string; table: Record<string, ActionDestination>; declared: string[] }> = [
    {
      what: 'a code the core declares and the table has no entry for',
      table: {},
      declared: ['review_refused'],
    },
    {
      what: 'a code in the table that no core reason produces',
      table: { invented_code: { path: anAddress, ownedBy: null, because: 'made up' } },
      declared: [],
    },
    {
      what: 'a code claiming both an address and an owner',
      table: { review_refused: { path: anAddress, ownedBy: 's7', because: 'both' } },
      declared: ['review_refused'],
    },
    {
      what: 'a code with neither an address nor an owner, which is the "later" this table abolishes',
      table: { review_refused: { path: null, ownedBy: null, because: 'later' } },
      declared: ['review_refused'],
    },
    {
      what: 'an address the route table does not answer to',
      table: {
        review_refused: { path: 'a-screen-that-was-never-built', ownedBy: null, because: 'gone' },
      },
      declared: ['review_refused'],
    },
    {
      what: 'a destination that does not say why',
      table: { review_refused: { path: anAddress, ownedBy: null, because: '   ' } },
      declared: ['review_refused'],
    },
  ];

  for (const { what, table, declared } of BROKEN) {
    it(`rejects ${what}`, () => {
      const faults = faultsIn(table, declared);
      assert.ok(
        faults.length > 0,
        `${what} passed. A guard never observed failing is not known to guard anything, and this one is `
          + 'the only thing standing between a named owner and the word "later" coming back.',
      );
    });
  }
});
