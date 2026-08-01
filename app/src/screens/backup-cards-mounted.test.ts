/**
 * THE TWO CARDS ARE REALLY ON THE ADMIN SCREEN — proved by RENDERING, never by grepping.
 *
 * ## WHY THIS SUITE EXISTS SEPARATELY FROM THE TWO IT GUARDS
 *
 * `backup-archive.test.ts` and `restore-backup.test.ts` prove the logic. Neither of them proves the
 * coach can REACH it, and that is a different claim with its own failure mode: a card imported and
 * never mounted, or mounted behind a condition that never holds, passes every import check, every
 * type check and every unit suite in this repository. This build has already met that shape as
 * "correct work, carried out, with no caller" — four capabilities built, tested, green and reachable
 * by nobody.
 *
 * It matters more than usual for these two. The reset confirmation now TELLS the coach he can put
 * his copy back from this page. If the card that does so is not on the page, that sentence is a
 * promise the application does not keep, made at the moment he is about to destroy something.
 *
 * ## WHY THIS FILE IS `.test.ts` AND BUILDS ITS TREE WITH `createElement`
 *
 * NOT STYLE. It was written as `.test.tsx` first and the shell gate DID NOT RUN IT — `run-suite-tests.mjs`
 * discovers by the suffix `.test.ts`, so a `.test.tsx` file anywhere under `src/` is invisible to
 * the aggregate: it reports no tests, fails nothing, and the total simply does not include it. The
 * suite passes when run by hand and does not exist as far as the gate is concerned.
 *
 * That is the recorded hazard exactly — discovery is only as good as its assumption about where
 * things live, and a discovering gate that finds FEWER files than there are reports green. It was
 * caught here only because the shell total came back three lower than the arithmetic said it should.
 * Every other suite in this directory is `.test.ts` and reaches React through `createElement`, which
 * is why nobody had met it before. This file follows that convention rather than widening a shared
 * tool file mid-flight; the trap itself is reported upward.
 *
 * ## THE HARNESS OPENS A REAL STORE, and that is not incidental
 *
 * Both cards are drawn only when the store is open, so a harness that leaves it opening renders
 * neither and asserts nothing while looking thorough.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { openLocalStore } from '../../core/store/local-store.js';
import { createLaptop } from '../../core/store/testing/platform-double.js';
import { aClient } from '../../core/model/fixtures.js';
import { LocalStoreProvider } from '../platform/LocalStore';
import { PlatformStatusProvider } from '../platform/platform-status';
import { DivergenceProvider, NOTHING_TO_DECIDE } from '../shell/Divergences';
import { KeyMaterialProvider, NO_KEY_MATERIAL_CONDITION } from '../shell/KeyMaterial';
import { NOTHING_AWAITING_REMOVAL, RemovalsProvider } from '../shell/Removals';
import { NOTHING_STOPPED, StoppedChangesProvider } from '../shell/StoppedChanges';
import { NO_BACKUP_YET, SyncStatusProvider } from '../shell/SyncStatus';
import { DESTINATIONS } from '../shell/navigation';
import type { Destination } from '../shell/navigation';
import { AdminScreen } from './AdminScreen';
import { ARCHIVE_HEADING, CLINICAL_STAYS_LOCKED } from './backup-archive';
import { RESTORE_HEADING, RESTORE_WORDS } from './restore-backup';

const ADMIN: Destination = (() => {
  const found = DESTINATIONS.find((destination) => destination.path === 'admin');
  if (found === undefined) throw new Error('there is no admin destination to render');
  return found;
})();

/** The admin screen with a REAL open store, inside the providers `App.tsx` wires around it. */
async function paint(): Promise<string> {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });
  await store.create('client', aClient({ name: 'Alex Fixture' }));

  const screen: ReactNode = createElement(AdminScreen, { destination: ADMIN });

  return renderToStaticMarkup(
    createElement(LocalStoreProvider, {
      opening: { state: 'open', store },
      children: createElement(PlatformStatusProvider, {
        status: { buildStamp: 'test-build', persistence: null, offlineStart: { registered: true, reason: null } },
        children: createElement(SyncStatusProvider, {
          reading: NO_BACKUP_YET,
          children: createElement(DivergenceProvider, {
            reading: NOTHING_TO_DECIDE,
            children: createElement(KeyMaterialProvider, {
              reading: NO_KEY_MATERIAL_CONDITION,
              children: createElement(StoppedChangesProvider, {
                reading: NOTHING_STOPPED,
                children: createElement(RemovalsProvider, {
                  reading: NOTHING_AWAITING_REMOVAL,
                  children: createElement(MemoryRouter, { children: screen }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as never),
  );
}

describe('the backup cards are reachable', () => {
  it('THE WAY BACK IS ON THE SCREEN, which is what the reset confirmation now promises him', async () => {
    const painted = await paint();

    // THE LOAD-BEARING ASSERTION FIRST, so no earlier tally can shadow it.
    assert.ok(
      painted.includes(RESTORE_HEADING),
      'the reset confirmation tells him he can put a copy back from this page, and the card that '
      + 'does so is not on it',
    );
    assert.ok(painted.includes('Nothing is emptied first'), 'it does not say what a restore leaves alone');
    assert.ok(painted.includes('Choose a backup file'), 'there is nothing on the screen that opens a file');

    // THE POSITIVE CONTROL for a render assertion: a string that is demonstrably not there. Without
    // it, a `paint` that returned the whole repository would satisfy everything above.
    assert.equal(painted.includes('Put a backup sideways'), false);
    assert.ok(painted.length > 500, 'the render produced almost nothing, so it is asserting about nothing');
  });

  it('AND SO IS THE COPY HE KEEPS ELSEWHERE, with its limit stated where he decides', async () => {
    const painted = await paint();

    assert.ok(painted.includes(ARCHIVE_HEADING), 'the encrypted copy cannot be made from anywhere');
    assert.ok(painted.includes('A passphrase for this file'), 'there is no passphrase box, so the control cannot work');

    // The honest limit is on the screen rather than only in a comment. A coach restoring onto a
    // borrowed laptop must not discover it by meeting a row he cannot read.
    assert.ok(
      painted.includes(CLINICAL_STAYS_LOCKED.slice(0, 60)),
      'the sentence about what the copy cannot open on its own is not shown to him',
    );
  });

  it('the two are DIFFERENT cards, so neither is the other one being counted twice', async () => {
    const painted = await paint();

    assert.notEqual(RESTORE_HEADING, ARCHIVE_HEADING);
    assert.notEqual(RESTORE_WORDS, CLINICAL_STAYS_LOCKED);
    assert.ok(painted.indexOf(ARCHIVE_HEADING) < painted.indexOf(RESTORE_HEADING),
      'making a copy reads before putting one back, which is the order he meets them in');
  });
});
