/**
 * THE HONEST STATEMENT — asserted as data, because a promise in prose is a promise that drifts.
 *
 * The requirement is that this application promises nothing the platform cannot do: no background
 * synchronisation, none while the app is closed, and no claim that the local data survives removing
 * the installed icon. The wording will be edited by whoever writes the setup page. These tests are
 * what stop an edit from quietly promising something.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { SYNC_TRIGGER_VALUES } from '../sync/sync.js';
import {
  BACKUP_OPPORTUNITIES, FORBIDDEN_IN_PROMISES, LIMITS, PLATFORM_STATEMENT, PROMISES,
} from './statement.js';

test('NO PROMISE CLAIMS BACKGROUND OR AUTOMATIC BEHAVIOUR', () => {
  for (const [field, sentence] of Object.entries(PROMISES)) {
    for (const forbidden of FORBIDDEN_IN_PROMISES) {
      assert.ok(
        !sentence.toLowerCase().includes(forbidden),
        `PROMISES.${field} claims "${forbidden}", which this application cannot do: ${sentence}`,
      );
    }
  }
});

test('the promises say what it DOES do: saves here instantly, backs up on open, on leave, on demand', () => {
  assert.match(PROMISES.saves, /saved on this device/i);
  assert.match(PROMISES.saves, /the moment|instantly|immediately/i);
  assert.match(PROMISES.backs_up, /open the app/i);
  assert.match(PROMISES.backs_up, /leave it/i);

  // ── THE ON-DEMAND BACKUP, GUARDED IN TWO OPPOSED DIRECTIONS ─────────────────────────────────────
  //
  // THESE TWO REPLACE A SINGLE `assert.match(PROMISES.backs_up, /tap Sync/i)`, AND THE ASSERTION
  // THEY REPLACE WAS REQUIRING THE DEFECT. No control in this application is called Sync; the act
  // is "Back up now" (`src/shell/action-destinations.ts`). This change was made to match an
  // INTENTIONAL COPY CORRECTION, not to get a red back to green.
  //
  // Re-aiming one assertion at copy the same author just wrote is indistinguishable in the diff
  // from softening it, so there are two, failing on OPPOSITE edits, neither covering the other:
  //
  //   REQUIRING — the on-demand moment is still claimed AT ALL. Worded to survive the OLD copy
  //   ("whenever you tap Sync") as well as the corrected one ("whenever you ask it to"),
  //   DELIBERATELY: a pair whose halves both red on the same probe is ONE ASSERTION WEARING TWO
  //   NAMES and says nothing about independence. It is the CLAIM this half guards, not the wording.
  assert.match(PROMISES.backs_up, /whenever you /i,
    'the promise no longer says a backup can be asked for by hand at all');
  //   FORBIDDING — and it names no control this application does not have. This half stays GREEN
  //   when the clause is deleted outright, which is precisely why the requiring half exists.
  assert.doesNotMatch(PROMISES.backs_up, /\bsync\b/i,
    'the promise tells the coach to tap "Sync", a control this application does not have — the act '
    + 'is called "Back up now"');
});

test('THE LIMITS ARE PRESENT AND EXPLICIT — no background sync, none while closed, and the icon warning', () => {
  assert.match(LIMITS.no_background_sync, /cannot back up in the background/i);
  assert.match(LIMITS.no_sync_while_closed, /while the app is closed/i);
  assert.match(LIMITS.icon_deletion_destroys_data, /do not delete the app icon/i);
  assert.match(LIMITS.icon_deletion_destroys_data, /deletes everything|deletes the data/i);
  assert.match(LIMITS.reconnect_hourly, /about an hour/i);
});

test('every backup opportunity named is one a person is present for', () => {
  // The COUNT is cross-checked against the engine's own list below rather than pinned here, so this
  // number cannot drift on its own. What this file guards is that every moment READS as a moment a
  // person is present for.
  assert.equal(BACKUP_OPPORTUNITIES.length, SYNC_TRIGGER_VALUES.length,
    'one plain-words moment per declared opportunity, and no moment nobody is there for');
  for (const moment of BACKUP_OPPORTUNITIES) {
    assert.match(moment, /^(when|every so often)/, `"${moment}" should read as a moment, not a mechanism`);
    assert.doesNotMatch(moment, /background|closed|automatic/i);
  }

  // ── THE ON-DEMAND MOMENT, GUARDED IN TWO OPPOSED DIRECTIONS ─────────────────────────────────────
  //
  // NOTHING ABOVE OBJECTED TO "whenever you tap Sync", AND THAT IS WHY IT SURVIVED THE EDIT THAT
  // FIXED THE IDENTICAL DEFECT IN `PROMISES.backs_up` ONE FIELD AWAY: it reads as a moment, it
  // starts with "when", and it names no forbidden mechanism. The defect was entirely in the
  // REFERENT — no control in this application is called Sync; the act is "Back up now"
  // (`src/shell/action-destinations.ts`). The same opposed pair as the `backs_up` test, for the
  // same reason: one assertion re-aimed at copy its own author just wrote is indistinguishable in
  // the diff from a softening.
  //
  //   REQUIRING — the on-demand moment is still listed AT ALL. Worded to survive the OLD entry
  //   ("whenever you tap Sync") as well as the corrected one ("whenever you ask it to"), so the two
  //   halves cannot both red on one probe.
  assert.ok(BACKUP_OPPORTUNITIES.some((moment) => /^whenever you /i.test(moment)),
    'the list no longer names a moment the coach can bring about himself');
  //   FORBIDDING — and no moment names a control this application does not have. Stays GREEN if the
  //   on-demand entry is deleted outright, which is what the requiring half is for.
  for (const moment of BACKUP_OPPORTUNITIES) {
    assert.doesNotMatch(moment, /\bsync\b/i,
      `"${moment}" tells the coach to operate "Sync", a control this application does not have — `
      + 'the act is called "Back up now"');
  }
});

test('and the engine agrees: none of its six triggers is a background one', () => {
  // Read from the synchronisation engine rather than restated here. Two lists that must agree are two
  // lists that will not, and the one that drifts would be the one making the promise.
  assert.equal(SYNC_TRIGGER_VALUES.length, BACKUP_OPPORTUNITIES.length);
  for (const trigger of SYNC_TRIGGER_VALUES) {
    assert.doesNotMatch(trigger, /background|periodic|closed|push/i,
      `"${trigger}" would be a promise this application cannot keep`);
  }
});

test('the statement is frozen, so nothing downstream can soften a limit on its way to a screen', () => {
  assert.throws(() => { PLATFORM_STATEMENT.limits = {}; }, TypeError);
  assert.throws(() => { LIMITS.no_background_sync = 'it syncs in the background'; }, TypeError);
  assert.throws(() => { PROMISES.backs_up = 'it backs up automatically'; }, TypeError);
});

test('the whole statement carries both halves — a promise list with no limits beside it is the defect', () => {
  assert.ok(Object.keys(PLATFORM_STATEMENT.promises).length > 0);
  assert.ok(Object.keys(PLATFORM_STATEMENT.limits).length > 0);
  assert.equal(PLATFORM_STATEMENT.opportunities, BACKUP_OPPORTUNITIES);
});
