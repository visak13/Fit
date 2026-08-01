/**
 * THE WATCH THAT NOTICES A NEWER BUILD — driven in both directions, with no browser.
 *
 * ## THE ONE THING THIS FILE EXISTS TO STOP
 *
 * A FIRST-EVER INSTALL MUST NEVER ANNOUNCE AN UPDATE. Every visit installs a worker, so if the watch
 * cannot tell a first install from an update, every coach opening the application for the first time
 * is told a newer version is ready — about the version he is looking at. That is the failure this
 * design's `controller`-read-before-register exists to make structurally impossible, and it is the one
 * a real browser reproduces least conveniently: it happens on a profile that has never been used.
 *
 * The other direction is checked in the same tests, always: a returning installed visitor MUST be
 * told. An "it stayed quiet" assertion passes just as happily when the watch has stopped working at
 * all, so no silence here is asserted without the same fixture, one field changed, speaking.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  A_NEW_VERSION_IS_WAITING, NEW_VERSION_SENTENCE, NO_NEW_VERSION_WAITING, TAKE_THE_NEW_VERSION,
  newVersionLine,
} from '../shell/new-version.ts';
import { armNewVersionWatch } from './offline-start.ts';
import type {
  ArrivingWorker, WatchableDocument, WatchableRegistration, WatchableWorkers,
} from './offline-start.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Where he is when he is not running a session, which is almost everywhere. */
const ELSEWHERE = Object.freeze({ runningASession: false });

/**
 * A worker arriving, whose state can be moved the way the browser moves it.
 *
 * DELIBERATELY SYNTHETIC. Nothing here is copied out of the tree: the real lifecycle is what the
 * browser walk exercises, and a double that imitated a real object's shape would only prove this file
 * can imitate it.
 */
function arriving(state: string) {
  const listeners: Array<() => void> = [];
  const worker = {
    state,
    addEventListener(_type: 'statechange', listener: () => void) {
      listeners.push(listener);
    },
  };
  return {
    worker: worker as ArrivingWorker,
    /** What the browser does: move the state, then tell everyone watching. */
    moveTo(next: string) {
      worker.state = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

/** The container, with the one fact the decision turns on. */
function container(controller: object | null) {
  const listeners: Array<() => void> = [];
  return {
    workers: {
      controller,
      addEventListener(_type: 'controllerchange', listener: () => void) {
        listeners.push(listener);
      },
    } as WatchableWorkers,
    claimThePage() {
      for (const listener of [...listeners]) listener();
    },
  };
}

/**
 * The registration, whose `installing` is whatever the test says is arriving.
 *
 * `checks` counts what the browser was ASKED — one entry per `update()` — which is the only way to tell
 * a check on return from a check on a schedule, since both can be completely silent.
 */
function registration(installing: ArrivingWorker | null) {
  const listeners: Array<() => void> = [];
  const checks: number[] = [];
  return {
    checks,
    registration: {
      installing,
      addEventListener(_type: 'updatefound', listener: () => void) {
        listeners.push(listener);
      },
      update() {
        checks.push(checks.length + 1);
        return Promise.resolve();
      },
    } as WatchableRegistration,
    updateFound() {
      for (const listener of [...listeners]) listener();
    },
  };
}

/**
 * The document being left and returned to — the coach swiping away from his home-screen application and
 * swiping back. Synthetic: `visibilitychange` fires in BOTH directions in a real browser, so it fires in
 * both here, which is what makes "a return" distinguishable from "a departure" testable at all.
 */
function homeScreenApplication() {
  const listeners: Array<() => void> = [];
  const page = {
    visibilityState: 'visible',
    addEventListener(_type: 'visibilitychange', listener: () => void) {
      listeners.push(listener);
    },
  };
  const fire = () => {
    for (const listener of [...listeners]) listener();
  };
  return {
    page: page as WatchableDocument,
    /** He swipes away to something else. */
    leave() {
      page.visibilityState = 'hidden';
      fire();
    },
    /** He swipes back. THIS is the moment the whole feature exists for. */
    returnTo() {
      page.visibilityState = 'visible';
      fire();
    },
  };
}

/**
 * One armed watch over a fixture, and the count of times the coach was told.
 *
 * @param document the page, when the test drives returns. Omitted, the watch is armed exactly as the
 * arrival tests below have always driven it and no return is ever simulated.
 */
function watching(controller: object | null, installingState: string, document?: WatchableDocument) {
  const told: number[] = [];
  const page = container(controller);
  const attach = armNewVersionWatch(page.workers, () => told.push(told.length + 1), document);
  const arrivingWorker = arriving(installingState);
  const found = registration(arrivingWorker.worker);
  attach(found.registration);
  return { told, page, found, arrivingWorker };
}

/** The same, with a document he can leave and come back to. */
function watchingAnInstalledApp(controller: object | null, installingState: string) {
  const app = homeScreenApplication();
  return { ...watching(controller, installingState, app.page), app };
}

/** Stands in for the older build's worker, which is an object or it is null. */
const AN_OLDER_WORKER_IS_ANSWERING = Object.freeze({});

describe('a first-ever install never announces an update', () => {
  it('stays quiet through install, activation and the claim, with no controller at the start', () => {
    const fresh = watching(null, 'installing');

    fresh.found.updateFound();
    fresh.arrivingWorker.moveTo('installed');
    fresh.arrivingWorker.moveTo('activated');
    fresh.page.claimThePage();

    assert.deepEqual(fresh.told, [], 'A FIRST INSTALL TOLD THE COACH A NEWER VERSION WAS READY');

    // NON-VACUITY: the identical sequence on the identical fixture, with the ONE field that differs
    // between a first install and a returning visitor — an older worker already answering.
    const returning = watching(AN_OLDER_WORKER_IS_ANSWERING, 'installing');
    returning.found.updateFound();
    returning.arrivingWorker.moveTo('installed');
    assert.deepEqual(
      returning.told,
      [1],
      'the watch cannot announce at all, so the first install staying quiet proved nothing',
    );
  });
});

describe('a returning installed visitor is told, once', () => {
  it('announces when a new worker reaches installed under a page that was already controlled', () => {
    const returning = watching(AN_OLDER_WORKER_IS_ANSWERING, 'installing');

    returning.found.updateFound();
    assert.deepEqual(returning.told, [], 'nothing has arrived yet — it is still installing');

    returning.arrivingWorker.moveTo('installed');
    assert.deepEqual(returning.told, [1]);
  });

  it('announces when the worker is ALREADY installed by the time the watch looks', () => {
    // The edge a listener-only watch misses: with skipWaiting the states can be one turn apart, so
    // `updatefound` can arrive with the work already done.
    const returning = watching(AN_OLDER_WORKER_IS_ANSWERING, 'installed');
    returning.found.updateFound();
    assert.deepEqual(returning.told, [1]);
  });

  it('announces on the claim alone, which is the other end of the same arrival', () => {
    const returning = watching(AN_OLDER_WORKER_IS_ANSWERING, 'installing');
    returning.page.claimThePage();
    assert.deepEqual(returning.told, [1]);
  });

  it('tells him ONCE however many of the signals fire for one arrival', () => {
    const returning = watching(AN_OLDER_WORKER_IS_ANSWERING, 'installing');

    returning.found.updateFound();
    returning.arrivingWorker.moveTo('installed');
    returning.arrivingWorker.moveTo('activated');
    returning.page.claimThePage();

    assert.deepEqual(returning.told, [1], 'he is being told one thing, so he is told it once');
  });
});

describe('nothing is announced for a state that is not an arrival', () => {
  it('stays quiet while the worker is only installing, and speaks the moment it is not', () => {
    const returning = watching(AN_OLDER_WORKER_IS_ANSWERING, 'installing');
    returning.found.updateFound();
    assert.deepEqual(returning.told, []);

    returning.arrivingWorker.moveTo('installed');
    assert.deepEqual(returning.told, [1], 'the same fixture, one state later');
  });

  it('stays quiet when an update is found with nothing installing behind it', () => {
    const told: number[] = [];
    const page = container(AN_OLDER_WORKER_IS_ANSWERING);
    const attach = armNewVersionWatch(page.workers, () => told.push(1));
    const nothingArriving = registration(null);
    attach(nothingArriving.registration);

    nothingArriving.updateFound();
    assert.deepEqual(told, []);

    // NON-VACUITY: the same armed watch, told the page was claimed.
    page.claimThePage();
    assert.deepEqual(told, [1]);
  });
});

/**
 * THE CHECK ON RETURN — what `d236` bought, and the bound it was bought under.
 *
 * `s11/a19` measured the gap: everything above is armed by `register()`, which runs once per document
 * LOAD, and an installed home-screen application swiped back to issues no navigation. Six simulated
 * resumes across sixty seconds told an old build nothing; one real load told it immediately.
 *
 * The user widened his own "no background nagging" freeze to close that, in his words, "Add the check on
 * return" — ONE CHECK PER RETURN. So the tests below count the checks, and one of them counts them
 * across real elapsed time, because a poll and a return check are indistinguishable by what they SHOW.
 */
describe('a return asks the browser once, and a departure asks nothing', () => {
  it('checks on each return, never on arming, and never on the way out', () => {
    const app = watchingAnInstalledApp(AN_OLDER_WORKER_IS_ANSWERING, 'installing');

    assert.deepEqual(app.found.checks, [], 'ARMING THE WATCH ALREADY CHECKED — that is a load, not a return');

    app.app.returnTo();
    assert.deepEqual(app.found.checks, [1], 'A RETURN DID NOT CHECK: the coach never learns of a new build');

    app.app.leave();
    assert.deepEqual(app.found.checks, [1], 'LEAVING CHECKED: `visibilitychange` fires both ways');

    app.app.returnTo();
    assert.deepEqual(app.found.checks, [1, 2], 'the second return did not check');
  });

  it('does not check on a schedule: real time passes, visible throughout, and the count does not move', async () => {
    const app = watchingAnInstalledApp(AN_OLDER_WORKER_IS_ANSWERING, 'installing');
    app.app.returnTo();
    assert.deepEqual(app.found.checks, [1]);

    // REAL elapsed time, with the document visible and untouched. An interval or a retry — the thing the
    // ruling forbids and the thing that is easiest to reach for — advances this count. A check on return
    // cannot.
    await new Promise((resume) => setTimeout(resume, 300));

    assert.deepEqual(
      app.found.checks,
      [1],
      'THE CHECK IS ON A SCHEDULE, NOT ON RETURN: the count moved while nothing happened',
    );

    // NON-VACUITY: the counter is live in this very test, so the count standing still proved something.
    app.app.returnTo();
    assert.deepEqual(app.found.checks, [1, 2], 'the counter cannot move at all, so the silence proved nothing');
  });

  it('has no timer in the module at all, read off the source', async () => {
    const source = await readFile(path.join(here, 'offline-start.ts'), 'utf8');

    assert.ok(!source.includes('setInterval'), 'A TIMER IS IN offline-start.ts: this is a poll, which d236 forbids');
    assert.ok(!source.includes('setTimeout'), 'A DEFERRED RETRY IS IN offline-start.ts, which d236 forbids');

    // NON-VACUITY: an absence proves nothing until the scanner is shown finding what it looks for.
    const APOLL = 'const nag = setInterval(() => registration.update(), 60000);';
    assert.ok(APOLL.includes('setInterval'), 'THE SCANNER IS BROKEN: it cannot see a poll placed in front of it');
    assert.ok(source.includes('registration.update()'), 'and it cannot find the check that IS in the file');
  });
});

describe('the check on return is really wired, in the file that owns it', () => {
  it('listens on the document and asks the registration, with App.tsx untouched', async () => {
    const source = await readFile(path.join(here, 'offline-start.ts'), 'utf8');

    // CLOSING QUOTE INCLUDED, on purpose. `s11/a19` measured the trap on its own work: a check for
    // `'<NewVersionProvider'` survived a rename to `'<NewVersionProviderXX'`, because the old name is a
    // PREFIX of the new one. Renaming the event breaks the assertion below; a prefix check would not.
    assert.ok(
      source.includes("addEventListener('visibilitychange', () => {"),
      'NOTHING WATCHES FOR THE RETURN: the coach is back to a check that only runs on a load',
    );
    assert.ok(
      source.includes("page.visibilityState !== 'visible'"),
      'THE RETURN IS NOT DISTINGUISHED FROM THE DEPARTURE',
    );
    assert.ok(
      source.includes('registration.update().catch('),
      'THE CHECK EITHER IS NOT MADE OR ITS FAILURE IS SWALLOWED',
    );
    assert.ok(
      source.includes('armNewVersionWatch(navigator.serviceWorker, whenANewerVersionIsReady, document)'),
      'THE REAL DOCUMENT IS NOT HANDED IN: every test here passes and the application checks nothing',
    );

    // NON-VACUITY: this reader must find something it certainly should.
    assert.ok(source.includes('export function armNewVersionWatch('), 'THE READER IS BROKEN: wrong file');
  });
});

describe('a return shows the coach nothing unless a version is genuinely waiting', () => {
  it('stays completely silent across repeated returns with no second build published', () => {
    const app = watchingAnInstalledApp(AN_OLDER_WORKER_IS_ANSWERING, 'installing');

    // Nothing has been published, so the browser finds nothing and no `updatefound` ever fires. This is
    // what almost every return the coach makes looks like.
    app.app.returnTo();
    app.app.leave();
    app.app.returnTo();
    app.app.leave();
    app.app.returnTo();

    assert.deepEqual(app.found.checks, [1, 2, 3], 'the returns were not even made, so the silence is not the guard');
    assert.deepEqual(app.told, [], 'A RETURN ANNOUNCED AN UPDATE THAT DOES NOT EXIST');
    assert.equal(
      newVersionLine(NO_NEW_VERSION_WAITING, ELSEWHERE),
      null,
      'THE COACH IS SHOWN A LINE WITH NOTHING WAITING',
    );

    // NON-VACUITY: the same fixture, with a build actually published.
    app.found.updateFound();
    app.arrivingWorker.moveTo('installed');
    assert.deepEqual(app.told, [1], 'the watch cannot announce at all, so the silent returns proved nothing');
  });

  it('reaches the approved line when a version IS waiting, in the case the coach actually lives in', () => {
    const app = watchingAnInstalledApp(AN_OLDER_WORKER_IS_ANSWERING, 'installing');

    app.app.leave();
    app.app.returnTo();
    assert.deepEqual(app.found.checks, [1], 'the return did not ask the browser, so nothing below can happen');

    // What the browser does with that check when a newer build IS on the server.
    app.found.updateFound();
    app.arrivingWorker.moveTo('installed');

    assert.deepEqual(app.told, [1], 'A RETURN WITH A NEW BUILD WAITING TOLD HIM NOTHING');
    assert.deepEqual(
      newVersionLine(A_NEW_VERSION_IS_WAITING, ELSEWHERE),
      { sentence: NEW_VERSION_SENTENCE, control: TAKE_THE_NEW_VERSION },
      'the announcement does not reach the approved sentence and control',
    );
  });

  it('announces nothing on a return during a session, which is d39 and is not negotiable', () => {
    const IN_A_SESSION = Object.freeze({ runningASession: true });

    assert.equal(
      newVersionLine(A_NEW_VERSION_IS_WAITING, IN_A_SESSION),
      null,
      'THE APPLICATION INTERRUPTED A SESSION TO TALK ABOUT ITSELF',
    );

    // NON-VACUITY: the identical reading speaks the moment he is anywhere else.
    assert.notEqual(newVersionLine(A_NEW_VERSION_IS_WAITING, ELSEWHERE), null, 'the reading itself says nothing');
  });

  it('announces nothing on a return during a FIRST install, with the controlledAtStart guard intact', () => {
    const fresh = watchingAnInstalledApp(null, 'installing');

    fresh.app.leave();
    fresh.app.returnTo();
    fresh.found.updateFound();
    fresh.arrivingWorker.moveTo('installed');
    fresh.arrivingWorker.moveTo('activated');
    fresh.page.claimThePage();

    assert.deepEqual(fresh.found.checks, [1], 'the return did not check, so the silence is not the guard');
    assert.deepEqual(fresh.told, [], 'A FIRST INSTALL TOLD THE COACH A NEWER VERSION WAS READY, ON RETURN');

    // NON-VACUITY: the identical sequence with the ONE field that differs — an older worker answering.
    const returning = watchingAnInstalledApp(AN_OLDER_WORKER_IS_ANSWERING, 'installing');
    returning.app.leave();
    returning.app.returnTo();
    returning.found.updateFound();
    returning.arrivingWorker.moveTo('installed');
    assert.deepEqual(returning.told, [1], 'the watch cannot announce at all, so the first install proved nothing');
  });
});
