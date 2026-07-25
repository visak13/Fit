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
  assert.match(PROMISES.backs_up, /tap Sync/i);
});

test('THE LIMITS ARE PRESENT AND EXPLICIT — no background sync, none while closed, and the icon warning', () => {
  assert.match(LIMITS.no_background_sync, /cannot back up in the background/i);
  assert.match(LIMITS.no_sync_while_closed, /while the app is closed/i);
  assert.match(LIMITS.icon_deletion_destroys_data, /do not delete the app icon/i);
  assert.match(LIMITS.icon_deletion_destroys_data, /deletes everything|deletes the data/i);
  assert.match(LIMITS.reconnect_hourly, /about an hour/i);
});

test('every backup opportunity named is one a person is present for', () => {
  assert.equal(BACKUP_OPPORTUNITIES.length, 5, 'five opportunities, and there is no sixth');
  for (const moment of BACKUP_OPPORTUNITIES) {
    assert.match(moment, /^(when|every so often)/, `"${moment}" should read as a moment, not a mechanism`);
    assert.doesNotMatch(moment, /background|closed|automatic/i);
  }
});

test('and the engine agrees: none of its five triggers is a background one', () => {
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
