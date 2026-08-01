/**
 * THE JOURNAL SEAM, HELD TO THE SHAPE THE OTHER FIVE ARE HELD TO.
 *
 * `seams.test.ts` beside this file asserts three properties across every seam in the interface —
 * provider REQUIRED, empty value a real frozen reading, reading carries DATA and nothing callable —
 * and it counts its own members so a seam nobody compared to the others cannot quietly appear. This
 * seam is the SIXTH, and it IS NOW LISTED THERE — the action that built this seam could not edit that
 * file and reported the gap instead, and the action that mounted the screen closed it.
 *
 * WHAT IS ASSERTED HERE IS THEREFORE ASSERTED TWICE, DELIBERATELY, AND NOTHING IS DELETED FOR IT. The
 * shared file holds this seam to the shape the other five are held to; this file holds it to the thing
 * that is TRUE OF THIS SEAM ALONE, below. Writing these three away now that the shared check covers
 * them would be trading a check that was in place for one that has only just arrived.
 *
 * The fourth assertion here is the one specific to this seam: the empty reading must not read as a
 * clean bill of health. `ok` over no devices is vacuously true, so `device_count` is what stops an
 * unread log being reported as a verified one.
 *
 *     node tools/run-suite-tests.mjs shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { describeJournal } from '../screens/journal';
import { screenReading } from '../screens/journal-source';
import { JournalProvider, NOTHING_HAS_BEEN_READ, useJournal } from './Journal.tsx';

/** Everything callable anywhere in a value, by path, however deeply nested. */
function callables(value: unknown, path = ''): string[] {
  if (typeof value === 'function') return [path];
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, held]) =>
    callables(held, path === '' ? key : `${path}.${key}`));
}

describe('the journal seam', () => {
  it('REQUIRES its provider and throws outside it rather than inventing a state', () => {
    const Consumer = () => {
      const reading = useJournal();
      // Three states, and a consumer has to say which one it is reading before it can reach a page.
      return createElement('p', null, reading.status === 'failed' ? 'failed' : String(reading.page.total));
    };

    assert.throws(
      () => renderToStaticMarkup(createElement(Consumer)),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(
          error.message,
          /seam is not wired/,
          'the failure must say a SEAM is unwired: an unwired log screen rendering an empty, '
            + 'verified log is the one outcome this surface may not have',
        );
        return true;
      },
    );
  });

  it('renders through its provider with its own empty reading', () => {
    const Consumer = () => createElement('p', null, 'read');
    const html = renderToStaticMarkup(
      createElement(JournalProvider, {
        reading: NOTHING_HAS_BEEN_READ,
        children: createElement(Consumer),
      }),
    );
    assert.ok(html.includes('read'));
  });

  it('has a frozen empty reading that is a real value rather than a placeholder', () => {
    assert.ok(Object.isFrozen(NOTHING_HAS_BEEN_READ));
    assert.ok(Object.isFrozen(NOTHING_HAS_BEEN_READ.page));
    assert.ok(Object.isFrozen(NOTHING_HAS_BEEN_READ.verification));
    assert.equal(NOTHING_HAS_BEEN_READ.page.total, 0);
    assert.equal(NOTHING_HAS_BEEN_READ.page.done, true);

    // AND IT IS THE NOT-YET STATE, WHICH IS NOT THE FAILED ONE. This literal used to be what the
    // seam carried after a read that FAILED, because a failure published nothing and left it in
    // place — so the screen said "this app has not checked its own list yet" about a log it had been
    // unable to read. Three states now, and this is the one that means the read has not happened.
    assert.equal(NOTHING_HAS_BEEN_READ.status, 'not_yet');
  });

  it('carries DATA, with nothing callable on it', () => {
    assert.deepEqual(
      callables(NOTHING_HAS_BEEN_READ),
      [],
      'a control on this seam would let the screen start work of its own',
    );
  });

  it('does not let an unread log read as a verified one', () => {
    assert.equal(NOTHING_HAS_BEEN_READ.verification.device_count, 0);

    // `ok` is vacuously true over no devices, which is why it is not the field the screen leans on.
    const report = describeJournal(screenReading(NOTHING_HAS_BEEN_READ));
    assert.match(report.verificationHeadline, /has not checked/);
    assert.ok(
      !/every entry joins up/.test(report.verificationHeadline),
      'an unread log must not be worded as a checked one',
    );

    // PAIRED: with a device present and intact, the same derivation DOES say the log joins up — so
    // the sentence above is the empty reading being honest, not the wording being incapable.
    const checked = describeJournal(screenReading({
      page: NOTHING_HAS_BEEN_READ.page,
      verification: {
        ok: true,
        device_count: 1,
        complete: true,
        devices: [Object.freeze({
          device: 'coach-laptop',
          entries: 3,
          checked: 3,
          ok: true,
          truncated_head: false,
          complete: true,
          first_divergence: null,
        })],
      },
    }));
    assert.match(checked.verificationHeadline, /every entry joins up/);
  });
});
