/**
 * TWO QUESTIONS, TWO VOCABULARIES — the guard over the contradiction s12/a3 drove and closed.
 *
 * ## What was measured, on the running application, before the fix
 *
 * One screen. One instant. Both sentences painted at once, transcribed out of the live DOM:
 *
 * - the protected clinical field, inside the Add-a-client form:
 *   *"This device is connected to your Google account, and the part of the app that locks these notes
 *   is not finished yet. It is the last piece of this to be built."*
 * - the permanent backup indicator, in the frame above it:
 *   *"Google has not been connected on this device, so nothing can be backed up. Last complete backup:
 *   3 hours ago."*
 *
 * And in the removal confirmation, from the same one state: *"This device is connected to your Google
 * account and has backed up before."*
 *
 * Neither surface was buggy. They were answering DIFFERENT QUESTIONS — has a backup ever COMPLETED
 * here (the past, read from the persisted completion) versus is Google reachable NOW (the present,
 * read from the credential) — **in the same three words**. A sign-out drops the credential and keeps
 * the completion, so the two answers come apart, and the coach is told two contradictory things by one
 * screen with no error anywhere to search for.
 *
 * ## What this file forbids
 *
 * Not a form of words. A SOURCE: the historical question may not be answered in the present-tense
 * question's vocabulary, in the state names or in the sentences derived from them. Every assertion
 * here derives its universe (`BACKUP_HISTORY`, the core's own reason table) rather than listing it,
 * and every absence-shaped assertion carries a NON-VACUITY PROBE in the same run — pointed at the
 * exact sentence that carried the defect, so a matcher that has stopped seeing anything fails loudly
 * instead of passing quietly.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { NotConnectedYet } from '../../core/crypto/errors.js';
import { REASON, REASONS } from '../../core/status/reasons.js';
import { BACKUP_HISTORY, backupHistoryOf } from './backup-history';
import { describeClinicalField } from './clients';
import { describeBackupOffer } from './client-removal';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * THE PRESENT-TENSE CLAIM, AS ONE MATCHER.
 *
 * The participle is the discriminator: "connected" is a statement about where this device STANDS, and
 * that is the indicator's answer to give. "Connecting" — the act, and the name of the thing he goes and
 * does — is not a claim about this device at all, so a direction may still say it and the two branches
 * of `describeBackupOffer` do.
 */
const A_PRESENT_CONNECTION_CLAIM = /\bconnected\b/iu;

/**
 * THE SENTENCES AS THEY WERE PAINTED, BEFORE THE FIX — the probe every absence assertion below is
 * aimed with. Transcribed verbatim from the live DOM at 2026-08-01, not reconstructed from source.
 */
const WHAT_THE_SCREENS_SAID_BEFORE = Object.freeze({
  clinicalField:
    'This device is connected to your Google account, and the part of the app that locks these notes '
    + 'is not finished yet. It is the last piece of this to be built.',
  backupOffer:
    'This device is connected to your Google account and has backed up before. Taking a backup on '
    + 'demand, from here, is part of the same piece of work and is not finished yet, so there is '
    + 'nothing to press.',
  theIndicatorAtTheSameInstant:
    'Google has not been connected on this device, so nothing can be backed up. Last complete backup: '
    + '3 hours ago.',
});

/** The two words modules that answer the historical question, and every sentence each of them says. */
const HISTORY_SURFACES = Object.freeze([
  { where: 'describeClinicalField', claim: (state: typeof BACKUP_HISTORY[number]) => describeClinicalField(state).whatHappened },
  { where: 'describeBackupOffer', claim: (state: typeof BACKUP_HISTORY[number]) => describeBackupOffer(state).whatHappened },
]);

function read(relative: string): string {
  return fs.readFileSync(path.join(here, relative), 'utf8');
}

describe('the matcher this file is built on can see the thing it is looking for', () => {
  /**
   * THE NON-VACUITY PROBE, RUN FIRST AND OVER FOUR SEPARATE UNIVERSES.
   *
   * Every other assertion in this file is absence-shaped, and an absence assertion whose matcher has
   * gone blind is indistinguishable from a subject that is clean. So the matcher is pointed at four
   * sentences it MUST find: the two the screens really said, the core's own present-tense reason, and
   * the crypto refusal that was borrowed into the screen. If any of these goes quiet, this file is
   * proving nothing and says so here rather than passing everywhere else.
   */
  it('finds the present-connection claim in every sentence that genuinely carries one', () => {
    const mustMatch: readonly (readonly [string, string])[] = [
      ['the clinical field, before the fix', WHAT_THE_SCREENS_SAID_BEFORE.clinicalField],
      ['the backup offer, before the fix', WHAT_THE_SCREENS_SAID_BEFORE.backupOffer],
      ['the indicator, at the same instant', WHAT_THE_SCREENS_SAID_BEFORE.theIndicatorAtTheSameInstant],
      ['the core\'s credential_missing reason', REASONS[REASON.CREDENTIAL_MISSING].message],
      ['the core\'s NotConnectedYet refusal', new NotConnectedYet().userMessage],
    ];

    for (const [what, sentence] of mustMatch) {
      assert.equal(
        A_PRESENT_CONNECTION_CLAIM.test(sentence),
        true,
        `the matcher no longer sees a present-connection claim in ${what}, so every absence `
          + `assertion in this file is now vacuous: ${sentence}`,
      );
    }
  });
});

describe('the backup history is answered in the history\'s own words', () => {
  it('names no state after the connection', () => {
    for (const state of BACKUP_HISTORY) {
      assert.equal(
        A_PRESENT_CONNECTION_CLAIM.test(state),
        false,
        `the historical state "${state}" is named after the present connection, which is the backup `
          + 'indicator\'s question. The two were measured contradicting each other on one screen; see '
          + 'backup-history.ts.',
      );
    }
  });

  it('says nothing about the connection in the sentence that states what is true of this device', () => {
    for (const surface of HISTORY_SURFACES) {
      for (const state of BACKUP_HISTORY) {
        const said = surface.claim(state);
        assert.equal(
          A_PRESENT_CONNECTION_CLAIM.test(said),
          false,
          `${surface.where}("${state}") answers the BACKUP HISTORY with a claim about the present `
            + 'connection. That is one question answered in the other\'s vocabulary, and it is how '
            + '"This device is connected to your Google account" came to sit under an indicator '
            + `reading "Google has not been connected on this device": ${said}`,
        );
      }
    }
  });

  it('still says what it DID read, in every state, so the fix is not silence', () => {
    // The requiring half of the pair. Deleting the sentences would satisfy every assertion above.
    for (const surface of HISTORY_SURFACES) {
      assert.match(
        surface.claim('never-backed-up'),
        /not backed anything up|never backed anything up/iu,
        `${surface.where} no longer tells him nothing has backed up on this device`,
      );
      assert.match(
        surface.claim('has-backed-up'),
        /has backed up/iu,
        `${surface.where} no longer tells him this device has backed up before`,
      );
      assert.notEqual(
        surface.claim('unknown').length,
        0,
        `${surface.where} says nothing at all while the store has not answered`,
      );
    }
  });
});

describe('the two questions have two sources, and neither can reach the other', () => {
  it('derives the historical state in ONE place, which the screen calls rather than copies', () => {
    const screen = read('ClientsScreen.tsx');

    assert.match(
      screen,
      /backupHistoryOf\(/u,
      'ClientsScreen no longer derives the backup history through backup-history.ts, so the state is '
        + 'being spelled out at the call site again — which is where the disagreeing vocabulary was',
    );
    for (const word of ['\'connected\'', '\'never-connected\'']) {
      assert.equal(
        screen.includes(word),
        false,
        `ClientsScreen.tsx answers a question with the literal ${word} again. The historical fact has `
          + 'its own state; the present connection belongs to core/status and shell/sync-indicator.ts.',
      );
    }
    // NON-VACUITY for the substring search above: a literal the file certainly does hold.
    assert.equal(
      screen.includes('backupHistoryOf'),
      true,
      'the substring search itself found nothing in a file it was handed, so the two assertions above '
        + 'are searching an empty string rather than the screen',
    );
  });

  it('keeps the present-tense seam out of the historical one, and the reverse', () => {
    const history = read('backup-history.ts');
    const indicator = read(path.join('..', 'shell', 'sync-indicator.ts'));

    assert.equal(
      /^\s*import[^\n]*sync-indicator/mu.test(history),
      false,
      'backup-history.ts imports the backup indicator. One of them would then be deriving the other\'s '
        + 'answer, which is the single source that produced the contradiction.',
    );
    assert.equal(
      /^\s*import[^\n]*backup-history/mu.test(indicator),
      false,
      'sync-indicator.ts imports the backup history. The indicator answers the present-tense question '
        + 'from the credential and the queue, and nothing else.',
    );
    // NON-VACUITY: the same import matcher, over an import each file really has.
    assert.equal(
      /^\s*import[^\n]*status\/reasons/mu.test(indicator),
      true,
      'the import matcher finds nothing in sync-indicator.ts, which certainly imports the core\'s '
        + 'reasons — so the two assertions above are blind rather than satisfied',
    );
  });

  it('turns the one fact into the one state, in both directions and while it is unread', () => {
    assert.equal(backupHistoryOf(null), 'unknown');
    assert.equal(backupHistoryOf(false), 'never-backed-up');
    assert.equal(backupHistoryOf(true), 'has-backed-up');
  });
});
