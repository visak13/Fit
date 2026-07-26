/**
 * THE STOPPED-CHANGES REVIEW — and the five ways a surface for this can be wrong while looking right.
 *
 * **One. The stopped entry is FICTIONAL.** A hand-built object with `status: 'rejected'` on it proves
 * the screen can draw an object of that shape and nothing else. So every entry in this file is INDUCED:
 * a real queued delivery, a real remote double, a real refusal or a real name collision, and the core's
 * own `flushOutbox` deciding what state the entry ends in. If the queue ever stops calling these cases
 * rejected and ambiguous, these tests stop having anything to draw rather than going on passing against
 * a fixture nobody re-derived.
 *
 * **Two. THE TWO GROUPS GET MERGED.** `needsAttention` returns two pages and says why: "the two need
 * different words in front of the coach — one says the remote refused it, the other says we cannot tell
 * — and merging them would force the surface to re-derive which is which." A merged list would put
 * "these failed" over an entry that may be sitting in the backup right now. So it is asserted that there
 * are exactly two groups, that their words differ, that each carries the core's own status value rather
 * than re-deriving it, and that with BOTH conditions live at once no entry appears in the other's group.
 *
 * **Three. The service's reason gets reworded.** `OUTBOX.md` §4.3 requires the refusal to keep its
 * reason verbatim. The coach may have to read that sentence out to whoever set the app up for him, and a
 * paraphrase is not what was said. So the exact string the double refused with is asserted to reach the
 * rendered markup, character for character.
 *
 * **Four. The identifiers get folded away.** For an ambiguous entry the identifiers are not detail
 * behind a decision, they ARE the decision — the only thing that lets a person settle a case the queue
 * refuses to guess at. So it is asserted that they are in the permanent part of the screen and NOT
 * inside the `<details>` fold.
 *
 * **Five. The action codes are still orphaned.** `core/status/reasons.js` names `review_refused` and
 * `review_unconfirmed`, and a screen that merely exists does not satisfy them. So it is asserted that
 * each group declares the core's own code, that `action-destinations.ts` maps both to an address, and
 * that the address RESOLVES against the shipped route table to this screen.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { matchRoutes } from 'react-router';

import { STATUS } from '../../core/outbox/entry.js';
import { queueBackup } from '../../core/outbox/enqueue.js';
import { flushOutbox } from '../../core/outbox/flush.js';
import { needsAttention } from '../../core/outbox/status.js';
import { aDevice } from '../../core/outbox/testing.js';
import { RemoteInvalidRequest, SPACES } from '../../core/remote/remote.js';
import { REASON, REASONS } from '../../core/status/reasons.js';
import {
  ACTION_DESTINATIONS, CODES_CLOSED_LOCALLY, destinationForAction,
} from '../shell/action-destinations.ts';
import { STOPPED_CHANGES_PATH } from '../shell/navigation.ts';
import { ROUTE_TABLE } from '../shell/routes.tsx';
import { NOTHING_STOPPED, StoppedChangesProvider } from '../shell/StoppedChanges.tsx';
import type { StoppedChangesReading } from '../shell/StoppedChanges.tsx';
import { StoppedChangesScreen } from './StoppedChangesScreen.tsx';
import {
  STOPPED_TITLE, describeStoppedAdminEntry, describeStoppedChanges,
} from './stopped-changes.ts';
import type { StoppedReading } from './stopped-changes.ts';

/** The exact sentence the double refuses with. Asserted to reach the screen unchanged. */
const REFUSAL = 'That name is not acceptable to this account.';

/** The devices opened by this file, closed once at the end whatever happened. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const opened: any[] = [];

after(async () => {
  for (const dev of opened) {
    // eslint-disable-next-line no-await-in-loop
    await dev.store.close();
  }
});

/** A device with a real local store, a real remote double and a virtual clock. */
async function aQueue() {
  const dev = await aDevice();
  opened.push(dev);
  return dev;
}

/**
 * A REAL delivery that the service REFUSED.
 *
 * The refusal comes from the remote double raising the port's own `RemoteInvalidRequest`, and the state
 * the entry ends in is decided by `flushOutbox` and its classifier — not by this file.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function anInducedRefusal(dev: any) {
  const { entry } = await queueBackup(dev.store, {
    space: SPACES.VISIBLE,
    baseName: 'library.json',
    payload: '{"exercises":2}',
    label: 'backup of the exercise library',
    now: dev.now(),
  });

  dev.adversity.failNext(1, {
    operation: 'create',
    error: () => new RemoteInvalidRequest(REFUSAL),
  });
  const report = await flushOutbox(dev.store, dev.remote, { now: dev.now() });

  assert.equal(
    report.rejected,
    1,
    'the harness really did drive a delivery into a refusal, and the CORE called it one — this is not '
      + 'a fixture shaped like a rejected entry',
  );
  return entry;
}

/**
 * A REAL delivery whose outcome CANNOT BE TOLD, induced the way the real service produces it.
 *
 * Two files answer to one name, which is a measured quirk of the real space rather than a contrivance:
 * `idempotency.test.js` records that two devices created a key envelope under one name in about fifteen
 * minutes of ordinary use and the space listed both with no error.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function anInducedAmbiguity(dev: any) {
  const { entry } = await queueBackup(dev.store, {
    space: SPACES.HIDDEN,
    baseName: 'envelope.json',
    payload: '{"envelope":1}',
    label: 'your encryption details',
    idempotencyKey: 'stopped-changes-ambiguous',
    now: dev.now(),
  });

  await dev.remote.create(SPACES.HIDDEN, { name: entry.name, content: '{"envelope":1}' });
  await dev.remote.create(SPACES.HIDDEN, { name: entry.name, content: '{"envelope":1}' });

  const report = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
  assert.equal(
    report.ambiguous,
    1,
    'the harness really did drive a delivery into an unconfirmed outcome, and the CORE called it one',
  );
  return entry;
}

/** The reading, taken from the core's own two-page call and nothing else. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readingFrom(dev: any): Promise<StoppedChangesReading> {
  return needsAttention(dev.store, { limit: 25 }) as Promise<StoppedChangesReading>;
}

/** The screen, rendered exactly as the router renders it: through the seam and nothing else. */
function render(reading: StoppedChangesReading): string {
  return renderToStaticMarkup(
    createElement(StoppedChangesProvider, {
      reading,
      children: createElement(StoppedChangesScreen),
    }),
  );
}

/** Everything inside the folds, so "permanent" can be asserted as "not in here". */
function foldedParts(html: string): string {
  return [...html.matchAll(/<details\b[\s\S]*?<\/details>/g)].map((found) => found[0]).join('');
}

/** Everything OUTSIDE the folds: what the coach sees without opening anything. */
function permanentPart(html: string): string {
  return html.replace(/<details\b[\s\S]*?<\/details>/g, '');
}

describe('a change the service REFUSED', () => {
  it('says WHICH change stopped, and says what the service said WORD FOR WORD', async () => {
    const dev = await aQueue();
    const entry = await anInducedRefusal(dev);
    const reading = await readingFrom(dev);

    const review = describeStoppedChanges(reading);
    const [refused] = review.groups;

    assert.equal(review.count, 1);
    assert.equal(refused.count, 1);
    assert.equal(refused.items[0].entryId, entry.entry_id);
    assert.equal(
      refused.items[0].what,
      'backup of the exercise library',
      'it names the change in the plain words the core wrote at enqueue, not by its identifier',
    );
    assert.equal(
      refused.items[0].whyVerbatim,
      REFUSAL,
      'the reason is the one the service gave, unchanged. A paraphrase is not what was said, and he '
        + 'may have to read this out to whoever set the app up for him.',
    );

    const html = render(reading);
    assert.ok(html.includes(REFUSAL), 'and it reaches the screen, character for character');
    assert.ok(
      permanentPart(html).includes(REFUSAL),
      'permanently, not behind a fold: it is the whole of what he came to find out',
    );
    assert.ok(
      html.includes('backup of the exercise library'),
      'the screen says which change it was',
    );
  });

  it('says what to do, and the way out ends at a person rather than at a button that does not exist', async () => {
    const dev = await aQueue();
    await anInducedRefusal(dev);
    const review = describeStoppedChanges(await readingFrom(dev));
    const [refused] = review.groups;

    assert.match(refused.whatToDo, /make the change again/i, 'the one thing that genuinely works today');
    assert.match(
      refused.whatToDo,
      /whoever set this app up for you/i,
      'and the exit exists in the world rather than only in the route graph: there is no support desk '
        + 'for this application, so the exit is a named person',
    );
    assert.ok(
      !/contact support|support team|help desk/i.test(refused.whatToDo),
      'and it does not send him somewhere that does not exist',
    );
  });

  it('says the queue will NOT try again by itself, which is the whole reason the screen is not a log', async () => {
    const dev = await aQueue();
    const entry = await anInducedRefusal(dev);

    // Proven against the core, not asserted about the copy: more flushes and a day of virtual time
    // later, the entry has still not been attempted again.
    dev.adversity.clear();
    dev.advance(24 * 60 * 60_000);
    const again = await flushOutbox(dev.store, dev.remote, { now: dev.now() });
    assert.equal(again.attempted, 0, 'the CORE really does not retry it');

    const review = describeStoppedChanges(await readingFrom(dev));
    assert.match(review.nothingHappensByItself, /will not try these again by itself/i);
    assert.ok(
      render(await readingFrom(dev)).includes('will not try these again by itself'),
      'and the screen says so, so the list does not read as things being handled',
    );
    assert.equal(review.groups[0].items[0].entryId, entry.entry_id);
  });
});

describe('a change whose outcome CANNOT BE TOLD', () => {
  it('does not say it failed, because it may be in the backup right now', async () => {
    const dev = await aQueue();
    await anInducedAmbiguity(dev);
    const review = describeStoppedChanges(await readingFrom(dev));
    const [, unconfirmed] = review.groups;

    assert.equal(unconfirmed.count, 1);
    assert.equal(unconfirmed.status, STATUS.AMBIGUOUS);
    assert.ok(
      !/failed|refused|rejected/i.test(unconfirmed.heading + unconfirmed.explanation),
      'the one sentence that is definitely WRONG about this condition is that it failed: it may have '
        + 'landed. That is the whole reason this is a separate group and not a second row in one list.',
    );
    assert.match(unconfirmed.explanation, /cannot tell whether they arrived/i);
    assert.match(unconfirmed.explanation, /will not guess/i);
  });

  it('shows EVERY identifier it found, permanently, because they are the decision and not detail behind one', async () => {
    const dev = await aQueue();
    await anInducedAmbiguity(dev);
    const reading = await readingFrom(dev);
    const entry = reading.ambiguous.items[0];

    assert.equal(entry.ambiguity.length, 2, 'the core kept both, so a person can look at both');

    const review = describeStoppedChanges(reading);
    assert.deepEqual(
      [...review.groups[1].items[0].identifiers],
      [...entry.ambiguity],
      'all of them, in the order the core found them, and none dropped',
    );

    const html = render(reading);
    const permanent = permanentPart(html);
    const folded = foldedParts(html);
    for (const identifier of entry.ambiguity) {
      assert.ok(permanent.includes(identifier), `${identifier} must be on screen without opening anything`);
      assert.ok(
        !folded.includes(identifier),
        `${identifier} is inside a fold. Disclosure is for detail BEHIND a decision, and these ARE `
          + 'the decision — the only thing that lets a person settle a case the queue refuses to guess.',
      );
    }
  });

  it('tells him not to tidy it up himself, which is the one action that destroys something', async () => {
    const dev = await aQueue();
    await anInducedAmbiguity(dev);
    const [, unconfirmed] = describeStoppedChanges(await readingFrom(dev)).groups;

    assert.match(unconfirmed.whatToDo, /do not delete any of them yourself/i);
    assert.match(unconfirmed.whatToDo, /whoever set the app up for you/i);
  });
});

describe('two groups, never one merged list', () => {
  it('keeps a refusal and an unconfirmed outcome apart when BOTH are live at once', async () => {
    const dev = await aQueue();
    const refusedEntry = await anInducedRefusal(dev);
    const ambiguousEntry = await anInducedAmbiguity(dev);

    const review = describeStoppedChanges(await readingFrom(dev));

    assert.equal(review.groups.length, 2, 'two, and there is no shape here that could be one list');
    assert.equal(review.count, 2, 'and the headline figure counts both');

    const [refused, unconfirmed] = review.groups;
    assert.deepEqual(
      refused.items.map((item) => item.entryId),
      [refusedEntry.entry_id],
      'the refused group holds the refusal and nothing else',
    );
    assert.deepEqual(
      unconfirmed.items.map((item) => item.entryId),
      [ambiguousEntry.entry_id],
      'and the unconfirmed group holds the other one and nothing else',
    );
  });

  it('carries the CORE\'s own status value, so nothing here classifies an entry a second time', async () => {
    const dev = await aQueue();
    await anInducedRefusal(dev);
    await anInducedAmbiguity(dev);
    const reading = await readingFrom(dev);
    const [refused, unconfirmed] = describeStoppedChanges(reading).groups;

    assert.equal(refused.status, STATUS.REJECTED);
    assert.equal(unconfirmed.status, STATUS.AMBIGUOUS);
    assert.equal(
      reading.rejected.items[0].status,
      refused.status,
      'the group\'s status is the status the entry actually has. A surface that re-derived which group '
        + 'an entry belongs in would be making the same judgement twice, and the second copy is the one '
        + 'that goes wrong.',
    );
    assert.equal(reading.ambiguous.items[0].status, unconfirmed.status);
  });

  it('gives the two groups genuinely different words in every place words are said', async () => {
    const dev = await aQueue();
    await anInducedRefusal(dev);
    await anInducedAmbiguity(dev);
    const [refused, unconfirmed] = describeStoppedChanges(await readingFrom(dev)).groups;

    for (const field of ['heading', 'explanation', 'whatToDo', 'nothingWords'] as const) {
      assert.notEqual(
        refused[field],
        unconfirmed[field],
        `both groups say the same ${field}. If the words are the same, the split is decoration and the `
          + 'merged list this surface refuses to be is what he is actually reading.',
      );
    }
  });

  it('draws them as two headed sections, each with its own count', async () => {
    const dev = await aQueue();
    await anInducedRefusal(dev);
    await anInducedAmbiguity(dev);
    const html = render(await readingFrom(dev));

    assert.ok(html.includes(`data-group="${STATUS.REJECTED}"`));
    assert.ok(html.includes(`data-group="${STATUS.AMBIGUOUS}"`));
    assert.ok(html.includes('Google refused these'));
    assert.ok(html.includes('Not confirmed either way'));
  });
});

describe('the two action codes the core had already named', () => {
  it('are the codes these two groups declare, read off the core rather than spelled here', async () => {
    const dev = await aQueue();
    await anInducedRefusal(dev);
    await anInducedAmbiguity(dev);
    const [refused, unconfirmed] = describeStoppedChanges(await readingFrom(dev)).groups;

    assert.equal(refused.actionCode, REASONS[REASON.ENTRY_REJECTED].action);
    assert.equal(unconfirmed.actionCode, REASONS[REASON.OUTCOME_UNKNOWN].action);
    assert.deepEqual([...CODES_CLOSED_LOCALLY], [refused.actionCode, unconfirmed.actionCode]);
  });

  it('now reach an ADDRESS, and that address resolves to THIS screen', () => {
    for (const code of CODES_CLOSED_LOCALLY) {
      const destination = destinationForAction(code);
      assert.ok(destination !== null, `${code} is not mapped anywhere at all`);
      assert.equal(
        destination.path,
        STOPPED_CHANGES_PATH,
        `${code} must lead to the review surface rather than to a step that never needed to own it`,
      );
      assert.equal(destination.ownedBy, null, `${code} is built, so nothing still owns building it`);

      const matched = matchRoutes([...ROUTE_TABLE], `/${destination.path}`);
      assert.ok(matched !== null, `/${destination.path} matches no route at all`);
      assert.notEqual(
        matched.at(-1)?.route.path,
        '*',
        `/${destination.path} falls through to not-found, so the action code leads nowhere after all`,
      );
    }
  });

  it('left the three Google-bound codes alone, with a NAMED owner and no stub', () => {
    const local = new Set(CODES_CLOSED_LOCALLY);
    const others = Object.entries(ACTION_DESTINATIONS).filter(([code]) => !local.has(code));

    assert.equal(others.length, 3, 'the other three codes are still exactly three');
    for (const [code, destination] of others) {
      assert.equal(destination.path, null, `${code} must NOT have an address in this build`);
      assert.ok(
        typeof destination.ownedBy === 'string' && destination.ownedBy.length > 0,
        `${code} has no owner named. "Later" is how two of these came to be waiting on work they `
          + 'never needed; a named step is the whole point of this table.',
      );
    }
  });
});

describe('nothing on this surface can act', () => {
  it('offers no retry and no discard, asserted over the whole reading and the whole report', async () => {
    const dev = await aQueue();
    await anInducedRefusal(dev);
    await anInducedAmbiguity(dev);
    const reading = await readingFrom(dev);

    /** Everything callable anywhere in a value, by path, however deeply nested. */
    function callables(value: unknown, path = ''): string[] {
      if (typeof value === 'function') return [path];
      if (value === null || typeof value !== 'object') return [];
      return Object.entries(value as Record<string, unknown>).flatMap(([key, held]) =>
        callables(held, path === '' ? key : `${path}.${key}`));
    }

    assert.deepEqual(
      callables(describeStoppedChanges(reading)),
      [],
      'a retry or discard button arriving here quietly as a convenience is what this asserts against. '
        + 'Both are deliveries to a real service and belong to the step that owns the credential.',
    );
    assert.deepEqual(callables(reading), [], 'and the seam carries no way to act either');
  });
});

describe('when nothing has stopped', () => {
  it('reads as a normal state rather than as an empty screen', () => {
    const review = describeStoppedChanges(NOTHING_STOPPED as StoppedReading);

    assert.equal(review.count, 0);
    assert.equal(review.settled, true);
    assert.match(review.intro, /Nothing has stopped/);
    assert.equal(review.groups.length, 2, 'both groups are still present, both saying they are empty');
    for (const group of review.groups) {
      assert.equal(group.settled, true);
      assert.ok(group.nothingWords.length > 0, 'and neither is a blank section');
    }

    const html = render(NOTHING_STOPPED);
    assert.ok(html.includes(STOPPED_TITLE));
    assert.ok(html.includes('id="screen-stopped-changes"'));
  });

  it('is what a store with nothing ever queued actually produces, not a hand-written blank', async () => {
    const dev = await aQueue();
    const reading = await readingFrom(dev);

    assert.deepEqual(reading.rejected.items, []);
    assert.deepEqual(reading.ambiguous.items, []);
    assert.equal(
      describeStoppedChanges(reading).intro,
      describeStoppedChanges(NOTHING_STOPPED as StoppedReading).intro,
      'the seam\'s empty value says exactly what the real call over an untouched store says',
    );
  });
});

describe('the count is honest about being a page', () => {
  it('says there are more when the page did not reach the end of the queue', async () => {
    const dev = await aQueue();
    await anInducedRefusal(dev);
    const full = await readingFrom(dev);

    // The core's own paging, asked for one at a time, which is what a long queue produces.
    const paged = (await needsAttention(dev.store, { limit: 1 })) as StoppedChangesReading;
    assert.equal(paged.rejected.items.length, 1);

    const review = describeStoppedChanges(paged);
    if (paged.rejected.done) {
      // One entry, one place: the page genuinely IS the end of the queue, so the caveat must be absent.
      assert.equal(review.groups[0].more, false);
      assert.equal(review.groups[0].moreWords, null);
    } else {
      assert.equal(review.groups[0].more, true);
      assert.ok(review.groups[0].moreWords !== null);
      assert.ok(render(paged).includes(review.groups[0].moreWords as string));
    }

    // Whichever it was, the caveat follows the core's own `done` and is not invented here.
    assert.equal(review.groups[0].more, !paged.rejected.done);
    assert.equal(describeStoppedChanges(full).groups[0].more, !full.rejected.done);
  });
});

describe('the way in from Admin', () => {
  it('is worded for both states and never promises to fix anything', async () => {
    const dev = await aQueue();
    const empty = describeStoppedAdminEntry(await readingFrom(dev));
    assert.equal(empty.settled, true);
    assert.equal(empty.count, 0);
    assert.equal(empty.linkLabel, 'Check for yourself');

    await anInducedRefusal(dev);
    const busy = describeStoppedAdminEntry(await readingFrom(dev));
    assert.equal(busy.settled, false);
    assert.equal(busy.count, 1);
    assert.ok(
      !/fix|sort|repair|resend|retry/i.test(busy.linkLabel),
      'the link must not promise more than the screen behind it delivers',
    );
    assert.equal(busy.title, empty.title, 'and it is called the same thing in both states');
  });
});
