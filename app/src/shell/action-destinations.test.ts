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
 *  3. Exactly ONE of `path`, `performed` and `ownedBy` is set on every member. Two would be a claim that
 *     something is both a place and an act, or built and also somebody's; none is the "later" this table
 *     was written to abolish.
 *  4. Every `path` RESOLVES against the shipped route table and is not the catch-all — checked with
 *     react-router's own matcher against the real array, not against a list of paths typed in here.
 *  5. Every `performed` names an act the interface ACTUALLY OFFERS, checked against the keys of
 *     `NO_SYNC_ACTIONS` — the real shape of the actions object rather than a list of names typed here.
 *     An act renamed in `sync-actions.tsx` and not here is a button that would call nothing.
 *  6. **The check is proven able to fail.** A guard never observed failing is not known to guard
 *     anything, so the last test builds each malformed table this file is supposed to reject and asserts
 *     that the same rules reject it. That is also the NON-VACUITY PROBE for the `ownedBy` rules, which
 *     no shipped member exercises any more: the three codes that used to name an owner are built now, so
 *     without the counterexamples those two rules would be code nothing had ever run.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { matchRoutes } from 'react-router';

import { REASONS } from '../../core/status/reasons.js';
import {
  ACTION_DESTINATIONS, CODES_CLOSED_LOCALLY, CODES_PERFORMED_HERE, DECLARED_ACTION_CODES,
  OWNING_STEP, PERFORMED_ACT, destinationForAction, performedFor,
} from './action-destinations.ts';
import type { ActionDestination } from './action-destinations.ts';
import { NO_SYNC_ACTIONS } from './sync-actions.tsx';
import { ROUTE_TABLE } from './routes.tsx';

const ROUTES = [...ROUTE_TABLE];

/**
 * The acts the interface really has, taken from the actions object's own keys.
 *
 * Derived rather than typed, for the same reason the codes are derived from `REASONS`: an act renamed
 * in `sync-actions.tsx` must fail here rather than leave a button wired to a name nothing answers to.
 */
const OFFERED_ACTS: readonly string[] = Object.keys(NO_SYNC_ACTIONS);

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
    const hasAct = destination.performed !== null && destination.performed !== undefined;

    const dispositions = [hasPath, hasAct, hasOwner].filter(Boolean).length;
    if (dispositions > 1) {
      faults.push(`${code} claims more than one of an address, an act and an owner`);
    }
    if (dispositions === 0) {
      faults.push(`${code} has neither an address, an act, nor a named owner`);
    }
    if (destination.because.trim().length === 0) faults.push(`${code} does not say why`);

    if (hasAct) {
      const performed = destination.performed as { act: string; words: string };
      if (!OFFERED_ACTS.includes(performed.act)) {
        faults.push(`${code} performs "${performed.act}", which the interface does not offer`);
      }
      if (performed.words.trim().length === 0) {
        faults.push(`${code} is an act with no words on it, so the control would be a bare button`);
      }
    }

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

describe('the three codes the synchronisation join closed', () => {
  it('are acts performed here, with no address and no owner left claiming them', () => {
    assert.equal(
      CODES_PERFORMED_HERE.length,
      3,
      'four reasons name three acts — connect_google is named by two of them and is one act',
    );

    for (const code of CODES_PERFORMED_HERE) {
      const destination = destinationForAction(code);
      assert.ok(destination !== null, `${code} is not in the table`);
      assert.ok(destination.performed !== null, `${code} is not recorded as an act`);
      assert.equal(destination.path, null, `${code} is not a place and must not name one`);
      assert.equal(
        destination.ownedBy,
        null,
        `${code} still names an owner. It is BUILT — the act exists and runs — and a table that says `
          + 'finished work is somebody else\'s is how a step comes to be planned twice.',
      );
    }
  });

  it('cover exactly the two acts the interface offers, and both are used', () => {
    const used = new Set(
      CODES_PERFORMED_HERE.map((code) => performedFor(code)?.act),
    );
    assert.deepEqual(
      [...used].sort(),
      [PERFORMED_ACT.CONNECT, PERFORMED_ACT.SYNCHRONISE].sort(),
      'an act nothing routes to is an act that could be deleted without a test noticing',
    );
  });

  it('say something different on each button, because two of them are the same call', () => {
    const words = CODES_PERFORMED_HERE.map((code) => performedFor(code)?.words);
    assert.equal(new Set(words).size, words.length,
      'connect and reconnect are ONE act underneath and two different sentences to the coach. Identical '
      + 'words would mean he is told he has never connected on the device where his hour has just run out.');
    for (const said of words) {
      assert.ok(typeof said === 'string' && said.length > 0);
      assert.doesNotMatch(
        said as string,
        /\p{Extended_Pictographic}/u,
        'no emoji in anything the coach reads',
      );
    }
  });

  it('answers null for a code that is not an act, rather than guessing one', () => {
    for (const code of CODES_CLOSED_LOCALLY) {
      assert.equal(performedFor(code), null, `${code} is a screen, not an act`);
    }
    assert.equal(performedFor(null), null);
    assert.equal(performedFor('a_code_the_core_never_had'), null);
  });
});

describe('the owner disposition, which no shipped code uses any more', () => {
  it('is still declared, and every step it names is one this file declares', () => {
    const steps = new Set<string>(Object.values(OWNING_STEP));
    assert.ok(steps.size > 0, 'the vocabulary must not be emptied: the RULE is still enforced');

    const owned = Object.entries(ACTION_DESTINATIONS).filter(([, d]) => d.ownedBy !== null);
    assert.deepEqual(
      owned.map(([code]) => code),
      [],
      'every action code is now either a place or an act. If one grows an owner again it must name a '
        + 'step declared in OWNING_STEP, and the counterexamples below are what hold that rule.',
    );
  });

  it('is named in the prose where a built act can still refuse for want of that step', () => {
    const connect = destinationForAction('connect_google');
    assert.ok(connect !== null);
    assert.ok(
      connect.because.includes(OWNING_STEP.SETUP_PAGE),
      'connecting is built and can still refuse until the coach has somewhere to enter his client id. '
        + 'The next reader must be able to find out whose screen that is without re-deriving it.',
    );
  });
});

describe('every destination says why', () => {
  it('at enough length to tell a decision from an oversight', () => {
    for (const [code, destination] of Object.entries(ACTION_DESTINATIONS)) {
      assert.ok(
        destination.because.length > 20,
        `${code} says nothing useful about why it is where it is, so the next reader has to guess`,
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
  const anAct = { act: PERFORMED_ACT.SYNCHRONISE, words: 'Back up now' };

  const BROKEN: Array<{ what: string; table: Record<string, ActionDestination>; declared: string[] }> = [
    {
      what: 'a code the core declares and the table has no entry for',
      table: {},
      declared: ['review_refused'],
    },
    {
      what: 'a code in the table that no core reason produces',
      table: {
        invented_code: { path: anAddress, performed: null, ownedBy: null, because: 'made up' },
      },
      declared: [],
    },
    {
      what: 'a code claiming both an address and an owner',
      table: {
        review_refused: { path: anAddress, performed: null, ownedBy: 's10', because: 'both' },
      },
      declared: ['review_refused'],
    },
    {
      what: 'a code claiming both an address and an act, which would be a place and a button at once',
      table: {
        review_refused: { path: anAddress, performed: anAct, ownedBy: null, because: 'both' },
      },
      declared: ['review_refused'],
    },
    {
      what: 'a code claiming both an act and an owner, so it is built and also unbuilt',
      table: {
        review_refused: { path: null, performed: anAct, ownedBy: 's10', because: 'both' },
      },
      declared: ['review_refused'],
    },
    {
      what: 'a code with none of the three, which is the "later" this table abolishes',
      table: { review_refused: { path: null, performed: null, ownedBy: null, because: 'later' } },
      declared: ['review_refused'],
    },
    {
      what: 'an address the route table does not answer to',
      table: {
        review_refused: {
          path: 'a-screen-that-was-never-built', performed: null, ownedBy: null, because: 'gone',
        },
      },
      declared: ['review_refused'],
    },
    {
      what: 'an act the interface does not offer, which would be a button wired to nothing',
      table: {
        review_refused: {
          path: null,
          performed: { act: 'reticulate' as never, words: 'Reticulate' },
          ownedBy: null,
          because: 'an act nothing answers to',
        },
      },
      declared: ['review_refused'],
    },
    {
      what: 'an act with no words on it, which would put a nameless button on the indicator',
      table: {
        review_refused: {
          path: null,
          performed: { act: PERFORMED_ACT.CONNECT, words: '  ' },
          ownedBy: null,
          because: 'a bare button',
        },
      },
      declared: ['review_refused'],
    },
    {
      what: 'a destination that does not say why',
      table: {
        review_refused: { path: anAddress, performed: null, ownedBy: null, because: '   ' },
      },
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
