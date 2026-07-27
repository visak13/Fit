/**
 * THE SYNCHRONISATION INDICATOR, AND THE FOUR PROPERTIES OF IT THAT FAIL SILENTLY.
 *
 * 1. **Three facts, kept independent.** Offline and stopped are not rungs. A single ranked list
 *    would show only the worst of the three, which is how a refusal ends up hidden behind a dropped
 *    connection — and the refusal is the one that never resolves by itself. The tests that matter
 *    most here are the ones that assert TWO things are visible at once.
 * 2. **Five distinguishable silhouettes.** Colour is lost to a colour-blind reader, to sunlight, to
 *    a greyscale screenshot and to video-call compression. If two rungs ever share an outline, the
 *    set has quietly become four rungs and a tint, and nothing on screen would say so.
 * 3. **It never blocks and it is never a modal**, however loud the ceiling gets. `core/status` makes
 *    that a property of the data; these assert the interface keeps the same promise.
 * 4. **The wording is the core's own.** Two copies of a promise drift, and the copy that drifts is
 *    the one that ends up promising something the platform cannot do.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { GLYPHS } from '../design/glyphs.generated.ts';
import { LEVEL, LEVEL_ORDER, LEVELS, OVERDUE_MS, PERSISTENT_WARNING_MS, SEVERELY_OVERDUE_MS } from '../../core/status/levels.js';
import { REASON, REASONS } from '../../core/status/reasons.js';
import {
  NO_BACKUP_YET,
  OFFLINE_WORD,
  RUNG_GLYPH,
  RUNG_SILHOUETTE,
  STOPPED_WORD,
  isOffline,
  isStopped,
  needsAction,
  relativeAge,
  rungOf,
  syncWording,
} from './sync-indicator.ts';
import type { Rung, SyncReason, SyncStatusReading } from './sync-indicator.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

function reasonOf(code: string): SyncReason {
  return { code, ...REASONS[code] };
}

/**
 * A reading, shaped exactly as `accountabilityStatus()` shapes one. The defaults are the healthy
 * case so that each test states only the condition it is about.
 */
function reading(over: Partial<SyncStatusReading> = {}): SyncStatusReading {
  const level = over.level ?? LEVEL.UP_TO_DATE;
  const reasons = over.reasons ?? [];
  return {
    last_synced_at: '2026-07-25T10:00:00.000Z',
    last_synced_age_ms: 4 * 60_000,
    never_synchronised: false,
    undelivered: 0,
    needs_attention: 0,
    rejected: 0,
    oldest_undelivered_age_ms: null,
    oldest_undelivered_label: null,
    // `?? ''` so a level name this build does not know can be built here at all — the point of the
    // fallback test is that such a reading still renders rather than throwing.
    summary: LEVELS[level]?.summary ?? '',
    blocks_application: false,
    in_progress: false,
    reason: reasons[0] ?? null,
    ...over,
    level,
    reasons,
  };
}

describe('the five rungs, and telling them apart with the colour gone', () => {
  const rungs = Object.keys(RUNG_SILHOUETTE) as Rung[];

  it('draws exactly the rungs the core has — no rung without a shape, no shape without a rung', () => {
    assert.deepEqual(
      [...rungs].sort(),
      [...LEVEL_ORDER].sort(),
      'the silhouettes and the core’s ladder no longer name the same set, so either a rung renders ' +
        'as whatever the base rule happens to be, or a shape is drawn for a rung that cannot occur',
    );
  });

  it('draws a different silhouette for every one of them', () => {
    const drawn = rungs.map((rung) => RUNG_SILHOUETTE[rung]);
    assert.equal(
      new Set(drawn).size,
      rungs.length,
      'two rungs now share an outline, so the ladder is only readable in colour — which is the one ' +
        'channel a greyscale screenshot, a colour-blind reader and a compressed video call all lose',
    );
  });

  it('gives every rung a glyph that is actually drawn in the shared family', () => {
    for (const rung of rungs) {
      const glyph = RUNG_GLYPH[rung];
      assert.ok(glyph in GLYPHS, `the rung "${rung}" asks for a glyph "${glyph}" the family does not have`);
    }
  });

  it('draws the ceiling as the widest and the only hollow shape, because it may not block instead', async () => {
    const css = await readFile(path.join(here, '..', 'design', 'console.css'), 'utf8');
    const rule = css.slice(css.indexOf(`[data-silhouette='${RUNG_SILHOUETTE[LEVEL.PERSISTENT_WARNING]}']`));

    assert.ok(rule.includes('--sync-shape-widest'), 'the ceiling is no longer the widest silhouette');
    assert.ok(
      rule.slice(0, rule.indexOf('}')).includes('border:'),
      'the ceiling is no longer drawn hollow, so at the top of a ladder that must never block it is ' +
        'only a fourth shade of the shape below it',
    );
  });

  it('names every silhouette it draws in the stylesheet, so none of them is a rung with no shape', async () => {
    const css = await readFile(path.join(here, '..', 'design', 'console.css'), 'utf8');
    for (const rung of rungs) {
      assert.ok(
        css.includes(`[data-silhouette='${RUNG_SILHOUETTE[rung]}']`),
        `console.css has no rule for the "${RUNG_SILHOUETTE[rung]}" silhouette, so the "${rung}" rung ` +
          'renders as whatever the base rule happens to be',
      );
    }
  });

  it('falls back rather than throwing on a level name this build does not know', () => {
    assert.equal(rungOf(reading({ level: 'invented_by_a_later_step' })), LEVEL.NOT_BACKED_UP);
  });
});

describe('offline is a condition, not a rung', () => {
  const offlineAndOrdinary = reading({
    level: LEVEL.NOT_BACKED_UP,
    undelivered: 3,
    oldest_undelivered_age_ms: 2 * 60_000,
    reasons: [reasonOf(REASON.NO_NETWORK)],
  });

  it('leaves the rung exactly where the ladder put it', () => {
    assert.equal(rungOf(offlineAndOrdinary), LEVEL.NOT_BACKED_UP);
    assert.ok(isOffline(offlineAndOrdinary));
  });

  it('never raises the live region to an alert on its own, because it is the application working', () => {
    assert.equal(needsAction(offlineAndOrdinary), false);
  });

  it('says so in words that describe the application working rather than a connection lost', () => {
    const words = syncWording(offlineAndOrdinary);
    assert.equal(words.offlineWord, OFFLINE_WORD);
    assert.match(words.announced, /saved on this device/u);
    for (const alarming of ['error', 'failed', 'cannot save', 'lost', 'problem']) {
      assert.ok(
        !words.announced.toLowerCase().includes(alarming),
        `the offline statement now says "${alarming}", which teaches the coach to distrust a correct state`,
      );
    }
  });

  it('STILL SHOWS THE RUNG WHEN BOTH ARE TRUE — the thing a single ranked list could not do', () => {
    const offlineAndOverdue = reading({
      level: LEVEL.SEVERELY_OVERDUE,
      undelivered: 31,
      oldest_undelivered_age_ms: 2 * 24 * 60 * 60_000,
      reasons: [reasonOf(REASON.NO_NETWORK)],
    });
    const words = syncWording(offlineAndOverdue);

    assert.equal(rungOf(offlineAndOverdue), LEVEL.SEVERELY_OVERDUE);
    assert.equal(words.offlineWord, OFFLINE_WORD);
    assert.equal(needsAction(offlineAndOverdue), true, 'two days without a backup is not made ordinary by the reason for it');
    assert.match(words.headline, /Not backed up for 2 days/u);
  });
});

describe('a stopped entry is a condition too, and it is the one that never resolves itself', () => {
  const stopped = reading({
    level: LEVEL.OVERDUE,
    undelivered: 4,
    needs_attention: 1,
    rejected: 1,
    oldest_undelivered_age_ms: 7 * 60 * 60_000,
    reasons: [reasonOf(REASON.ENTRY_REJECTED)],
  });

  it('shows beside the rung rather than instead of it', () => {
    assert.ok(isStopped(stopped));
    assert.equal(rungOf(stopped), LEVEL.OVERDUE);
    assert.equal(syncWording(stopped).stoppedWord, STOPPED_WORD);
  });

  it('is announced even when a dropped connection is the reason on top of it', () => {
    const both = reading({
      level: LEVEL.OVERDUE,
      undelivered: 9,
      needs_attention: 2,
      rejected: 2,
      oldest_undelivered_age_ms: 8 * 60 * 60_000,
      reasons: [reasonOf(REASON.ENTRY_REJECTED), reasonOf(REASON.NO_NETWORK)],
    });
    const words = syncWording(both);

    assert.equal(words.stoppedWord, STOPPED_WORD);
    assert.equal(words.offlineWord, OFFLINE_WORD);
    assert.match(words.announced, /refused/u, 'the refusal is no longer announced when a connection problem accompanies it');
  });

  it('makes the coach the actor, since nothing will move it but a person', () => {
    assert.equal(needsAction(stopped), true);
  });
});

describe('the number, which means one thing everywhere', () => {
  it('is what is not in the backup, in every condition, including the zero', () => {
    assert.equal(syncWording(reading()).count, 0);
    assert.equal(syncWording(reading({ level: LEVEL.NOT_BACKED_UP, undelivered: 7 })).count, 7);
    assert.equal(
      syncWording(reading({ level: LEVEL.OVERDUE, undelivered: 12, needs_attention: 3, rejected: 3 })).count,
      12,
      'the count now shows the stopped entries rather than everything not backed up, so the one ' +
        'number on a collapsed rail means something different depending on the state it is in',
    );
  });
});

describe('the wording is the core’s own', () => {
  it('uses the specific reason’s sentence when there is one', () => {
    const expired = reading({
      level: LEVEL.NOT_BACKED_UP,
      undelivered: 5,
      reasons: [reasonOf(REASON.CREDENTIAL_EXPIRED)],
    });
    assert.equal(syncWording(expired).detail, REASONS[REASON.CREDENTIAL_EXPIRED].message);
  });

  it('quotes no per-entry count for a dead credential, because nothing at all can be sent', () => {
    const expired = reading({
      level: LEVEL.OVERDUE,
      undelivered: 12,
      oldest_undelivered_age_ms: 7 * 60 * 60_000,
      reasons: [reasonOf(REASON.CREDENTIAL_EXPIRED)],
    });
    assert.ok(!syncWording(expired).detail.includes('12'));
  });

  it('uses the rung’s own summary when there is no specific reason', () => {
    const plain = reading({ level: LEVEL.SEVERELY_OVERDUE, undelivered: 2, oldest_undelivered_age_ms: SEVERELY_OVERDUE_MS });
    assert.equal(syncWording(plain).detail, LEVELS[LEVEL.SEVERELY_OVERDUE].summary);
  });

  it('says a synchronisation is running BESIDE the figures and never instead of them', () => {
    const running = reading({ level: LEVEL.NOT_BACKED_UP, undelivered: 3, in_progress: true });
    const words = syncWording(running);

    assert.equal(words.count, 3);
    assert.match(words.headline, /3 changes waiting/u);
    assert.match(words.announced, /Backing up now\./u);
  });

  it('never says everything is backed up on a device that has never backed anything up', () => {
    const fresh = reading({
      level: LEVEL.NOT_BACKED_UP,
      never_synchronised: true,
      last_synced_at: null,
      last_synced_age_ms: null,
      reasons: [reasonOf(REASON.NEVER_SYNCHRONISED)],
    });
    const words = syncWording(fresh);

    assert.equal(words.headline, 'Nothing backed up yet');
    assert.ok(!words.announced.includes('Everything is backed up'));
  });
});

describe('elapsed time in the words a person uses', () => {
  it('calls under a minute a moment rather than zero minutes', () => {
    assert.equal(relativeAge(0), 'a moment');
    assert.equal(relativeAge(59_999), 'a moment');
  });

  it('counts in minutes, then hours, then days, and gets the singular right', () => {
    assert.equal(relativeAge(60_000), '1 minute');
    assert.equal(relativeAge(4 * 60_000), '4 minutes');
    assert.equal(relativeAge(OVERDUE_MS), '6 hours');
    assert.equal(relativeAge(SEVERELY_OVERDUE_MS), '1 day');
    assert.equal(relativeAge(PERSISTENT_WARNING_MS), '3 days');
  });

  it('says nothing at all rather than guessing when there is no figure', () => {
    assert.equal(relativeAge(null), null);
    assert.equal(relativeAge(Number.NaN), null);
  });

  it('reads the backup age on the calm rung and the WAITING age on the climbing ones', () => {
    assert.match(syncWording(reading()).headline, /Backed up 4 minutes ago/u);
    assert.match(
      syncWording(reading({ level: LEVEL.OVERDUE, undelivered: 12, oldest_undelivered_age_ms: 7 * 60 * 60_000 })).headline,
      /12 waiting for 7 hours/u,
    );
  });
});

describe('it never blocks and it is never a modal', () => {
  it('is a live region rather than a dialog, at every rung', async () => {
    const source = await readFile(path.join(here, 'SyncStatus.tsx'), 'utf8');

    for (const forbidden of ['role="dialog"', 'role="alertdialog"', '<dialog', 'showModal', 'requestFocus', '.focus()']) {
      assert.ok(
        !source.includes(forbidden),
        `SyncStatus.tsx now uses "${forbidden}" — status is never a modal and an alert never steals focus`,
      );
    }
    assert.ok(source.includes(`role={needsAction(status) ? 'alert' : 'status'}`));
  });

  it('escalates the announcement only where the coach has something to do about it', () => {
    assert.equal(needsAction(reading()), false);
    assert.equal(needsAction(reading({ level: LEVEL.NOT_BACKED_UP, undelivered: 3 })), false);
    assert.equal(needsAction(reading({ level: LEVEL.OVERDUE, undelivered: 3 })), true);
    assert.equal(needsAction(reading({ level: LEVEL.PERSISTENT_WARNING, undelivered: 3 })), true);
  });

  it('reads a ceiling that still declares it cannot block', () => {
    const ceiling = reading({
      level: LEVEL.PERSISTENT_WARNING,
      undelivered: 40,
      oldest_undelivered_age_ms: 4 * 24 * 60 * 60_000,
    });

    assert.equal(ceiling.blocks_application, false);
    assert.equal(LEVELS[LEVEL.PERSISTENT_WARNING].blocks, false);
    assert.match(syncWording(ceiling).headline, /Not backed up for 4 days/u);
  });
});

describe('the seam', () => {
  it('is required, so a missing one is loud rather than a state the component invented', async () => {
    const source = await readFile(path.join(here, 'SyncStatus.tsx'), 'utf8');
    assert.match(source, /useSyncStatus was used outside SyncStatusProvider/u);
  });

  it('starts from a reading that is true rather than from a demonstration state', () => {
    assert.equal(NO_BACKUP_YET.never_synchronised, true);
    assert.equal(NO_BACKUP_YET.undelivered, 0);
    assert.equal(NO_BACKUP_YET.blocks_application, false);
    assert.equal(NO_BACKUP_YET.reason?.code, REASON.NEVER_SYNCHRONISED);
    assert.equal(syncWording(NO_BACKUP_YET).headline, 'Nothing backed up yet');
  });

  /**
   * THIS USED TO READ `main.tsx` FOR A LITERAL, AND THE LITERAL MOVED.
   *
   * It asserted `main.tsx` contained `<SyncStatusProvider reading={NO_BACKUP_YET}>` — which held the
   * property while the seam was a frozen value wired at the start. Two things then happened: the seam
   * acquired a real SOURCE, so the literal is no longer written at the application's start at all, and
   * the application was split out of `main.tsx` into `App.tsx`, so the file this read is not the file
   * that composes it any more.
   *
   * Either change alone would have made this a check pointed at the wrong place. So it asserts the
   * PROPERTY instead of a string in a file: the seam is filled in EXACTLY ONE place in the whole
   * interface, and that place is not a screen. A rename, a move, or another split cannot green it —
   * only a second wiring can fail it, which is the thing worth catching.
   */
  it('is wired once, in one source, and not inside a screen', async () => {
    const root = path.join(here, '..');

    /** Every module of the interface, at any depth, tests excluded. */
    async function everyModule(directory: string): Promise<string[]> {
      const entries = await readdir(directory, { withFileTypes: true });
      const found: string[] = [];
      for (const entry of entries) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          // eslint-disable-next-line no-await-in-loop
          found.push(...await everyModule(full));
        } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
          found.push(full);
        }
      }
      return found;
    }

    const modules = await everyModule(root);
    assert.ok(modules.length > 20, `only ${modules.length} modules were found, so this scan is broken`);

    const wiring: string[] = [];
    for (const file of modules) {
      // eslint-disable-next-line no-await-in-loop
      const source = await readFile(file, 'utf8');
      // The component's own module defines the provider; every other mention is a USE of it.
      if (path.basename(file) === 'SyncStatus.tsx') continue;
      if (/<SyncStatusProvider/.test(source)) wiring.push(path.relative(root, file));
    }

    assert.equal(
      wiring.length,
      1,
      `the synchronisation seam is filled in ${wiring.length} places: ${wiring.join(', ')}. Two sources `
      + 'for one indicator is two states it could be in, and only one of them would be on screen.',
    );
    assert.doesNotMatch(
      wiring[0],
      /^screens[\\/]/,
      'the seam is filled from inside a screen. The indicator is permanent and lives in the frame, so a '
      + 'screen wiring it would take it away on every other screen.',
    );

    // NON-VACUITY: the scan really can find the string it is counting.
    const source = await readFile(path.join(root, wiring[0]), 'utf8');
    assert.match(source, /<SyncStatusProvider/);
  });
});
