/**
 * THE WORDS AND THE TWO CONDITIONS — asserted directly, with no browser and no rendering.
 *
 * This is the half of the update path that decides ANYTHING IS SAID AT ALL, so it is also the half
 * whose failures are silent: a line that never appears looks exactly like an application with no
 * update waiting, which is the truth almost every time it opens.
 *
 * EVERY ABSENCE HERE IS PAIRED WITH A POSITIVE CONTROL IN THE SAME TEST — the same call, one field
 * changed, the line appearing. A check that the line is absent passes just as happily when the
 * function has stopped being able to produce one at all.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { OPEN_SESSION_KEY, RUNNER_ADDRESS } from '../screens/runner.ts';
import {
  A_NEW_VERSION_IS_WAITING, NEW_VERSION_SENTENCE, NO_NEW_VERSION_WAITING, TAKE_THE_NEW_VERSION,
  newVersionLine, runningASession,
} from './new-version.ts';

/** Not in a session, which is where the coach is on twelve of the thirteen addresses. */
const ELSEWHERE = Object.freeze({ runningASession: false });

describe('the words themselves', () => {
  it('say a newer version is ready, in language a non-technical reader already has', () => {
    assert.equal(NEW_VERSION_SENTENCE, 'A newer version of this app is ready.');
    assert.equal(TAKE_THE_NEW_VERSION, 'Update now');
  });

  it('never name the machinery the coach has no reason to have heard of', () => {
    // The browser's own vocabulary for this. It is the natural thing to write and it is meaningless
    // to the person reading it, which is the failure this assertion exists to keep out.
    const machinery = ['service worker', 'worker', 'cache', 'bundle', 'skipWaiting', 'registration'];
    const said = `${NEW_VERSION_SENTENCE} ${TAKE_THE_NEW_VERSION}`.toLowerCase();
    for (const word of machinery) {
      assert.ok(!said.includes(word), `the copy says "${word}", which names the machinery`);
    }

    // NON-VACUITY: the same scan, pointed at a sentence it MUST catch. Without this, a scan that had
    // stopped looking at anything would report the copy clean for ever.
    const wouldHaveShipped = 'A new service worker is waiting.'.toLowerCase();
    assert.ok(
      machinery.some((word) => wouldHaveShipped.includes(word)),
      'THE SCAN IS DEAD: it cannot find the machinery in a sentence made entirely of it',
    );
  });

  it('claims nothing about his data, so it owes no proof of what an update leaves behind', () => {
    const said = `${NEW_VERSION_SENTENCE} ${TAKE_THE_NEW_VERSION}`.toLowerCase();
    for (const word of ['data', 'keep', 'kept', 'lose', 'lost', 'saved', 'backup', 'nothing']) {
      assert.ok(!said.includes(word), `the copy says "${word}", which is a claim about the aftermath`);
    }
  });
});

describe('it is said only when a version is actually waiting', () => {
  it('says nothing when none is', () => {
    assert.equal(newVersionLine(NO_NEW_VERSION_WAITING, ELSEWHERE), null);

    // POSITIVE CONTROL: the identical call with the one field flipped.
    const waiting = newVersionLine(A_NEW_VERSION_IS_WAITING, ELSEWHERE);
    assert.notEqual(waiting, null, 'the line cannot be produced at all, so the absence proved nothing');
    assert.equal(waiting?.sentence, NEW_VERSION_SENTENCE);
    assert.equal(waiting?.control, TAKE_THE_NEW_VERSION);
  });

  it('carries the words from this module rather than any written at the drawing', () => {
    const line = newVersionLine(A_NEW_VERSION_IS_WAITING, ELSEWHERE);
    assert.deepEqual(line, { sentence: NEW_VERSION_SENTENCE, control: TAKE_THE_NEW_VERSION });
  });
});

describe('it never interrupts a session in progress', () => {
  it('says nothing while he is at the runner with a session open, even with one waiting', () => {
    const inSession = Object.freeze({ runningASession: true });
    assert.equal(newVersionLine(A_NEW_VERSION_IS_WAITING, inSession), null);

    // POSITIVE CONTROL: same reading, same call, he has left the session.
    assert.notEqual(
      newVersionLine(A_NEW_VERSION_IS_WAITING, ELSEWHERE),
      null,
      'the reading itself produces no line, so suppressing it during a session proved nothing',
    );
  });
});

describe('what counts as a session in progress', () => {
  const anOpenSession = 'client-session-01J8Z';

  it('is the runner address WITH a session open on it', () => {
    assert.equal(runningASession(RUNNER_ADDRESS, `?${OPEN_SESSION_KEY}=${anOpenSession}`), true);
  });

  it('is not the runner address with nothing open — that screen says no session is open', () => {
    assert.equal(runningASession(RUNNER_ADDRESS, ''), false);
    assert.equal(runningASession(RUNNER_ADDRESS, `?${OPEN_SESSION_KEY}=`), false);

    // POSITIVE CONTROL: the same address, the key filled in.
    assert.equal(runningASession(RUNNER_ADDRESS, `?${OPEN_SESSION_KEY}=${anOpenSession}`), true);
  });

  it('is not any other address, however the query is filled in', () => {
    assert.equal(runningASession('/calendar', `?${OPEN_SESSION_KEY}=${anOpenSession}`), false);
    assert.equal(runningASession('/clients', ''), false);
    assert.equal(runningASession('/admin', `?${OPEN_SESSION_KEY}=${anOpenSession}`), false);

    // POSITIVE CONTROL: the query really is the one the runner uses.
    assert.equal(runningASession(RUNNER_ADDRESS, `?${OPEN_SESSION_KEY}=${anOpenSession}`), true);
  });

  it('reads the address and the key from the runner rather than from a second spelling', () => {
    // A guard written against a copy of the address keeps passing after the application moves, and it
    // fails in the safest-looking direction: it silently stops guarding.
    assert.equal(RUNNER_ADDRESS, '/session');
    assert.equal(OPEN_SESSION_KEY, 'open');
  });
});
