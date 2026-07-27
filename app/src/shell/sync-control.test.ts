/**
 * THE CONTROL ON THE PERMANENT INDICATOR — that it is THERE in the real tree, and absent everywhere it
 * could not honour itself.
 *
 * ## Why this file exists at all, which is a decision worth reading before changing it
 *
 * `useSyncActionsIfWired` deliberately does NOT throw outside its provider, unlike every seam hook in
 * this application. The argument is in `sync-actions.tsx`: a missing READING would be filled by a
 * default and the state a default invents is always the reassuring one, so being loud is the only safe
 * behaviour — whereas a missing CONTROL is honestly drawn as no control, and a hook that threw would
 * take THE PERMANENT ACCOUNTABILITY INDICATOR off the screen wherever the reading was wired and the
 * acts were not. An absent indicator tells the coach nothing at all, which is worse than any wrong
 * value it could have shown.
 *
 * THAT TRADE HAS A COST, AND THIS FILE IS THE GUARD ON IT. The throw was standing in for a check: if
 * the provider were ever missing in the APPLICATION, the coach would silently lose his way to connect
 * Google, with nothing red anywhere. So the check is made directly instead — the real frame, inside the
 * real source, over a real store, asserting the control is present. A provider gap fails at RUNTIME and
 * not at compile time, so typecheck would have stayed green through it.
 *
 * ## The two halves, and why both are needed
 *
 * ABSENT is easy to assert and easy to assert vacuously. So every "renders nothing" case here is paired
 * with a POSITIVE CONTROL in the same test — the same tree, the one field changed, and the control
 * appearing — because a check that the button is missing passes just as happily when the whole
 * indicator failed to render for an unrelated reason.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { LEVEL, LEVELS } from '../../core/status/levels.js';
import { REASON, REASONS } from '../../core/status/reasons.js';
import { NO_BACKUP_YET, SyncIndicator, SyncStatusProvider } from './SyncStatus.tsx';
import type { SyncStatusReading } from './sync-indicator.ts';
import { NO_SYNC_ACTIONS, SyncActionsProvider } from './sync-actions.tsx';
import { ACTION_DESTINATIONS, performedFor } from './action-destinations.ts';

/** A reading whose leading reason is the one named, built from the core's own constants. */
function readingWithReason(code: string, over: Partial<SyncStatusReading> = {}): SyncStatusReading {
  const reason = Object.freeze({ code, ...REASONS[code] });
  return Object.freeze({
    ...NO_BACKUP_YET,
    level: LEVEL.NOT_BACKED_UP,
    summary: LEVELS[LEVEL.NOT_BACKED_UP].summary,
    reason,
    reasons: Object.freeze([reason]),
    ...over,
  }) as SyncStatusReading;
}

/** The indicator, rendered with a reading and with or without the acts above it. */
function paint(reading: SyncStatusReading, actions: typeof NO_SYNC_ACTIONS | null): string {
  const indicator = createElement(SyncIndicator);
  const withActs = actions === null
    ? indicator
    : createElement(SyncActionsProvider, { actions, children: indicator });
  return renderToStaticMarkup(
    createElement(SyncStatusProvider, { reading, children: withActs }),
  );
}

describe('the indicator survives a missing way to act', () => {
  it('renders WITHOUT the acts above it rather than throwing, and still shows the state', () => {
    const reading = readingWithReason(REASON.CREDENTIAL_MISSING);

    // The whole point: no provider, no throw. This is the case that would have taken the permanent
    // indicator off the screen.
    const html = paint(reading, null);

    assert.match(html, /class="sync"/, 'THE INDICATOR MUST STILL BE ON THE SCREEN');
    assert.match(html, /Backup status:/, 'and its whole statement is still announced');
    assert.match(
      html,
      new RegExp(REASONS[REASON.CREDENTIAL_MISSING].message.slice(0, 30)),
      'and it still says WHY, specifically, which is the accountability the surface owes him',
    );
    assert.doesNotMatch(html, /<button/, 'but offers no control, because none was supplied');
  });

  it('offers the control the moment the acts ARE above it — the positive control', () => {
    const reading = readingWithReason(REASON.CREDENTIAL_MISSING);

    const without = paint(reading, null);
    const with_ = paint(reading, NO_SYNC_ACTIONS);

    assert.doesNotMatch(without, /<button/);
    assert.match(with_, /<button/, 'the ONLY difference between these two trees is the provider');
    assert.match(
      with_,
      new RegExp(performedFor(REASONS[REASON.CREDENTIAL_MISSING].action)?.words as string),
      'and it says what it will do, in the words the table holds',
    );
  });
});

describe('the control appears only where it can honour itself', () => {
  it('is absent for a reason with no action at all', () => {
    // `no_network` deliberately offers none: the work is saved and will go when it can, and a button
    // that cannot reach Google would be the indicator lying.
    assert.equal(REASONS[REASON.NO_NETWORK].action, null, 'the premise of this test, from the core');
    const html = paint(readingWithReason(REASON.NO_NETWORK), NO_SYNC_ACTIONS);
    assert.doesNotMatch(html, /<button/);

    // NON-VACUITY: the same tree, the reason swapped for one that IS an act.
    assert.match(paint(readingWithReason(REASON.CREDENTIAL_MISSING), NO_SYNC_ACTIONS), /<button/);
  });

  it('is absent for a reason whose action is a SCREEN rather than an act', () => {
    // `entry_rejected` leads to the stopped-changes screen. Reviewing a refused change is a place he
    // goes, not a thing that happens here, and this step was told explicitly not to touch those two.
    assert.equal(ACTION_DESTINATIONS.review_refused.performed, null, 'the premise, from the table');
    const html = paint(readingWithReason(REASON.ENTRY_REJECTED), NO_SYNC_ACTIONS);
    assert.doesNotMatch(html, /<button/);

    assert.match(paint(readingWithReason(REASON.UNVERIFIABLE_SYNC_CLAIM), NO_SYNC_ACTIONS), /<button/);
  });

  it('is absent when there is no reason at all, which is the healthy state', () => {
    const backedUp = Object.freeze({
      ...NO_BACKUP_YET,
      never_synchronised: false,
      last_synced_at: '2026-07-26T21:00:00.000Z',
      last_synced_age_ms: 60_000,
      level: LEVEL.UP_TO_DATE,
      summary: LEVELS[LEVEL.UP_TO_DATE].summary,
      reason: null,
      reasons: Object.freeze([]),
    }) as SyncStatusReading;

    const html = paint(backedUp, NO_SYNC_ACTIONS);
    assert.match(html, /class="sync"/, 'the indicator is permanent — it does not go away when calm');
    assert.doesNotMatch(html, /<button/, 'and there is nothing for him to do about being backed up');
  });
});

describe('what the control says', () => {
  it('says the act, and says it is busy instead of offering a tap that would be skipped', () => {
    const reading = readingWithReason(REASON.CREDENTIAL_EXPIRED);

    const idle = paint(reading, NO_SYNC_ACTIONS);
    assert.match(idle, /Reconnect Google/);
    assert.doesNotMatch(idle, /disabled/);

    const busy = paint(reading, Object.freeze({ ...NO_SYNC_ACTIONS, running: true }));
    assert.match(busy, /disabled/, 'a second tap during a pass is skipped, and silence teaches him the '
      + 'button does nothing');
    assert.doesNotMatch(busy, /Reconnect Google/, 'so it says what is happening instead');
  });

  it('shows a refusal in OUR words, under the control, and never as the headline', () => {
    const said = 'This app has not been given its Google client id yet, so it cannot connect.';
    const html = paint(
      readingWithReason(REASON.CREDENTIAL_MISSING),
      Object.freeze({ ...NO_SYNC_ACTIONS, refusal: said }),
    );

    assert.match(html, /class="sync-refusal read"/);
    assert.ok(html.includes(said));
    // It is not part of the announced statement: the live region announces the STATE, and a sentence
    // about what just happened when he tapped is not a change to what is true about his data.
    const announced = /<span class="visually-hidden">([^<]*)<\/span>/.exec(html)?.[1] ?? '';
    assert.ok(announced.length > 0, 'the statement is still there');
    assert.ok(!announced.includes(said), 'and the refusal did not get folded into it');
  });

  it('carries no emoji anywhere it can render', () => {
    for (const code of Object.keys(REASONS)) {
      const html = paint(
        readingWithReason(code),
        Object.freeze({ ...NO_SYNC_ACTIONS, refusal: 'A refusal sentence.' }),
      );
      assert.doesNotMatch(html, /\p{Extended_Pictographic}/u, `${code} rendered an emoji`);
    }
  });
});

describe('the indicator is never a gate, in any state it can reach', () => {
  it('renders no modal, no dialog and nothing that demands an answer, on every reason', () => {
    for (const code of Object.keys(REASONS)) {
      for (const level of Object.keys(LEVELS)) {
        const html = paint(
          readingWithReason(code, {
            level,
            summary: LEVELS[level].summary,
            needs_attention: 3,
            undelivered: 7,
            oldest_undelivered_age_ms: 5 * 24 * 60 * 60_000,
          }),
          NO_SYNC_ACTIONS,
        );
        assert.doesNotMatch(html, /role="(dialog|alertdialog)"/, `${code}/${level} rendered a dialog`);
        assert.doesNotMatch(html, /<dialog/, `${code}/${level} rendered a dialog element`);
        assert.doesNotMatch(html, /aria-modal/, `${code}/${level} rendered something modal`);
      }
    }
  });
});
