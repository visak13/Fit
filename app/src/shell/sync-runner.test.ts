/**
 * THE JOIN, ASSERTED BY CONSEQUENCE — and every guard here is PROVEN ABLE TO FAIL.
 *
 * `core/INTEGRATION.md` recorded the gap this file's subject closes: the sync engine RETURNS a
 * completion, the accountability surface reads a PERSISTED one and refuses to take a caller's word for
 * it, and nothing carried one to the other. Both components were individually correct and individually
 * tested. The wire between them was never built, and the cost of leaving it unbuilt was the surface
 * saying "never synchronised" for ever while synchronisation worked perfectly.
 *
 * So the assertions here are not "the function was called". They are what the coach would SEE: the
 * persisted last-backed-up value, read back the way the surface reads it, before and after a real pass
 * over a real store and the core's own in-memory remote.
 *
 * ## THE BREAK PROBES, AND HOW THE FIRST ONE CORRECTED THE BRIEF IT CAME FROM
 *
 * A probe that removes a whole guard cannot show that the guard's DISCRIMINATOR is load-bearing. The
 * first probe written here was the one the plan's landmine note named — spread the report on the way
 * in — and IT RECORDED A COMPLETION. The note was wrong, in the direction that matters: it says a
 * spread of the report is fatal, and it is not.
 *
 * `completion.js` reaches for `report.flush` and asks whether THAT object carries the outbox's
 * module-private symbol. A shallow spread of the report copies the flush POINTER, so the symbol is
 * still there. The real discriminator is THE FLUSH'S IDENTITY, and the rule that follows is narrower
 * and easier to honour than the one in the brief: **never copy the flush**; reshaping the report
 * around it is harmless.
 *
 * So the probes below are aimed at that, in the loosening direction an editor would actually take:
 *
 *  - the FLUSH is spread — the smallest change that is genuinely fatal;
 *  - the report is round-tripped through JSON;
 *  - the report is `structuredClone`d, which is the modern idiom for "copy this" and is not obviously
 *    a serialisation boundary, so it is the one somebody would reach for unwarned;
 *  - a hand-built lookalike carrying a `completion` field of its own is offered, because a report's
 *    `completion` is plain data and a caller could believe it;
 *  - and, as the CONTROL IN THE OTHER DIRECTION, a rebuilt report that passes the same flush through
 *    is asserted to still work — because a rule stated too broadly gets working code rejected in
 *    review, which is its own kind of failure.
 *
 * Each probe is preceded by the positive control that the pass genuinely earned a completion, so a
 * `recorded: false` cannot be the probe passing for want of anything to lose.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InMemoryRemoteStorage, SPACES } from '../../core/remote/remote.js';
import { readLastCompletedSync, recordCompletedSync } from '../../core/status/status.js';
import { DOCUMENT_KINDS, SYNC_TRIGGERS, areaFileName } from '../../core/sync/sync.js';
import { createEnvelope } from '../../core/model/model.js';
import { aClient } from '../../core/model/fixtures.js';
import { openLocalStore } from '../../core/store/store.js';
import { createLaptop } from '../../core/store/testing/platform-double.js';
import {
  PERIODIC_SYNC_MS, READING_REFRESH_MS, armSyncOpportunities, holdAttempts, oneAtATime,
  readSyncReading, readTheBackup, runSyncPass,
} from './sync-runner.ts';
import type { SyncEnvironment } from './sync-runner.ts';
import { drawnRungOf, needsAction, rungOf, skippedFilesOutstanding } from './sync-indicator.ts';
import type { SyncStatusReading } from './sync-indicator.ts';

/** A real store on the core's own platform double, and a remote that answers. */
async function aDeviceThatCanSynchronise() {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });
  const remote = new InMemoryRemoteStorage();
  return { store, remote };
}

/** Something for a pass to push, so a pass has work rather than nothing. */
async function changeSomething(store: Awaited<ReturnType<typeof openLocalStore>>, name: string) {
  const record = createEnvelope({ type: 'client', content: aClient({ name }), device: store.device });
  await store.putRecord(record);
  return record;
}

/** The persisted value, read exactly as `accountabilityStatus` reads it. */
async function persistedCompletion(store: Awaited<ReturnType<typeof openLocalStore>>) {
  const { completion } = await readLastCompletedSync(store);
  return completion === null ? null : completion.completed_sync_at;
}

/**
 * A READING THAT LANDED — and the narrowing is an ASSERTION rather than a cast.
 *
 * `readSyncReading` publishes three outcomes now (`sync-failed-read.test.ts` holds the third), so
 * every reading read here is checked to have actually come back before its figures are asserted on.
 * A cast would have quietly turned a failed read into a pile of undefineds, and the assertions below
 * would have gone on describing a device nobody looked at — which is the defect that union exists
 * to end, reproduced inside the guard.
 */
async function aReadingThatLanded(
  store: Awaited<ReturnType<typeof openLocalStore>>,
  options: Parameters<typeof readSyncReading>[1],
): Promise<SyncStatusReading> {
  const outcome = await readSyncReading(store, options);
  assert.equal(outcome.status, 'read', 'the read did not come back, so nothing below is about a device');
  return outcome as SyncStatusReading;
}

describe('the join: a real pass advances the value the surface displays', () => {
  it('records a completion, and the surface stops saying never synchronised', async () => {
    const { store, remote } = await aDeviceThatCanSynchronise();
    await changeSomething(store, 'Someone to back up');

    const before = await aReadingThatLanded(store, {
      inProgress: false, lastAttempt: null, credential: { present: true, expired: false },
    });
    assert.equal(before.never_synchronised, true, 'nothing has been backed up before the first pass');
    assert.equal(await persistedCompletion(store), null);

    const { report, recorded } = await runSyncPass(store, remote as never, {
      trigger: SYNC_TRIGGERS.MANUAL,
    });

    assert.equal(recorded, true, 'a pass that drained the queue must persist its completion');
    const at = await persistedCompletion(store);
    assert.ok(typeof at === 'string' && at.length > 0, 'and the persisted value must be a real instant');

    const after = await aReadingThatLanded(store, {
      inProgress: false, lastAttempt: report, credential: { present: true, expired: false },
    });
    assert.equal(after.never_synchronised, false, 'THE FACT THE WHOLE ACTION EXISTS FOR');
    assert.equal(after.last_synced_at, at, 'and it is the same instant, not a second opinion');
    assert.equal(after.level, 'up_to_date');
    assert.equal(after.undelivered, 0);
    assert.equal(after.blocks_application, false, 'no rung blocks, on any pass');

    await store.close();
  });

  it('leaves a pass that earned no completion alone rather than clearing or advancing it', async () => {
    const { store, remote } = await aDeviceThatCanSynchronise();
    await changeSomething(store, 'Someone to back up');
    await runSyncPass(store, remote as never, { trigger: SYNC_TRIGGERS.MANUAL });
    const good = await persistedCompletion(store);
    assert.ok(good !== null);

    // A step that cannot reach the service. Not a local defect: the pass reports it and carries on.
    await changeSomething(store, 'Someone else');
    remote.adversity.failNext(20);
    const { report, recorded } = await runSyncPass(store, remote as never, {
      trigger: SYNC_TRIGGERS.MANUAL,
    });
    remote.adversity.clear();

    assert.ok(
      (report as { failures: unknown[] }).failures.length > 0,
      'the probe must actually have broken something — a pass that quietly succeeded would make the '
      + 'assertion below pass for the wrong reason',
    );
    assert.equal(recorded, false, 'a pass that could not reach the service earns no completion');
    assert.equal(
      await persistedCompletion(store),
      good,
      'AND THE PREVIOUS VALUE IS EXACTLY WHERE IT WAS. Clearing it would tell him he has never backed '
      + 'up when he has; advancing it would tell him he is safe when he is not.',
    );

    await store.close();
  });

  it('does not advance it for a pass that skipped a file it could not read — the false green', async () => {
    const { store, remote } = await aDeviceThatCanSynchronise();
    await changeSomething(store, 'Someone to back up');
    await runSyncPass(store, remote as never, { trigger: SYNC_TRIGGERS.MANUAL });
    const good = await persistedCompletion(store);
    assert.ok(good !== null);

    // What the coach's OTHER, NEWER installation would have written. This one cannot decode it.
    await remote.create(SPACES.VISIBLE, {
      name: areaFileName('other-device1', 'push', 'from-a-newer-build'),
      content: JSON.stringify({
        document_version: 99,
        kind: DOCUMENT_KINDS.PUSH,
        device: 'other-device1',
        written_at: new Date().toISOString(),
        cursor: '',
        records: [],
        purges: [],
      }),
    });

    const { report, recorded } = await runSyncPass(store, remote as never, {
      trigger: SYNC_TRIGGERS.MANUAL,
    });

    const skipped = report as { unreadable: unknown[]; failures: unknown[] };
    assert.equal(
      skipped.unreadable.length,
      1,
      'the probe must have landed: the pass has to have MET the undecodable file, or this proves nothing',
    );
    assert.equal(skipped.failures.length, 0, 'and it is NOT a failure — that is the whole trap');
    assert.equal(recorded, false, 'a pass holding none of the other device\'s work must not claim green');
    assert.equal(await persistedCompletion(store), good, 'so the value stays where it was');

    // And the coach is TOLD, in words, rather than merely not being lied to.
    const reading = await aReadingThatLanded(store, {
      inProgress: false, lastAttempt: report, credential: { present: true, expired: false },
    });
    const said = reading.reasons.map((reason) => reason.code);
    assert.ok(
      said.includes('backup_partly_unreadable'),
      'a fact that stops a claim without ever reaching the words is the same defect one layer along',
    );
    const sentence = reading.reasons.find((r) => r.code === 'backup_partly_unreadable')?.message ?? '';
    assert.match(sentence, /1 file/, 'the count is in the words: nine is not "some"');
    assert.match(sentence, /newer version/, 'and it names the ordinary, fixable cause when that is true');

    await store.close();
  });
});

describe('the brand lives on the FLUSH, and these probes prove which boundary is the fatal one', () => {
  /** A device that has genuinely just earned a completion, so no probe below can pass vacuously. */
  async function afterARealCompletion() {
    const { store, remote } = await aDeviceThatCanSynchronise();
    await changeSomething(store, 'Someone to back up');
    const { report, recorded } = await runSyncPass(store, remote as never, {
      trigger: SYNC_TRIGGERS.MANUAL,
    });
    assert.equal(recorded, true, 'THE POSITIVE CONTROL: there really was a completion to lose');
    assert.ok(await persistedCompletion(store) !== null);
    return { store, report: report as Record<string, unknown> };
  }

  it('records NOTHING when the FLUSH is spread — the smallest genuinely fatal change', async () => {
    const { store, report } = await afterARealCompletion();

    const flushCopied = { ...report, flush: { ...(report.flush as object) } };
    const { recorded } = await recordCompletedSync(store, flushCopied);
    assert.equal(
      recorded,
      false,
      'copying the flush loses the outbox\'s in-process symbol, and a killed best-effort flush must be '
      + 'unable to be reported as a completed synchronisation BY ANY ROUTE',
    );

    await store.close();
  });

  it('records NOTHING for a JSON round trip of the live report', async () => {
    const { store, report } = await afterARealCompletion();

    const { recorded } = await recordCompletedSync(store, JSON.parse(JSON.stringify(report)));
    assert.equal(recorded, false, 'a serialisation boundary reaches inside the flush and loses it');

    await store.close();
  });

  it('records NOTHING for a structuredClone, which is the trap nobody warns about', async () => {
    const { store, report } = await afterARealCompletion();

    const { recorded } = await recordCompletedSync(store, structuredClone(report));
    assert.equal(
      recorded,
      false,
      'it is the modern idiom for "copy this object" and it is not obviously a serialisation boundary, '
      + 'so it is the one an unwarned caller reaches for',
    );

    await store.close();
  });

  it('STILL RECORDS when the report is rebuilt around the SAME flush — the control the other way', async () => {
    const { store, report } = await afterARealCompletion();

    // A wholly new report object. Only `flush` is the original, by reference.
    const rebuilt = {
      trigger: report.trigger,
      device: report.device,
      failures: [],
      unreadable: [],
      unplaceable: [],
      flush: report.flush,
    };
    const { recorded } = await recordCompletedSync(store, rebuilt);
    assert.equal(
      recorded,
      true,
      'THE PLAN\'S LANDMINE NOTE SAYS A REBUILT REPORT IS FATAL AND IT IS NOT. Stating the rule too '
      + 'broadly is not a safe error: it gets working code rejected in review, and it sends somebody '
      + 'debugging a stuck indicator after the wrong cause. The rule is "never copy the flush".',
    );

    await store.close();
  });

  it('records NOTHING for a hand-built report that carries a completion field of its own', async () => {
    const { store, remote } = await aDeviceThatCanSynchronise();

    const lookalike = {
      trigger: SYNC_TRIGGERS.MANUAL,
      device: store.device,
      failures: [],
      unreadable: [],
      unplaceable: [],
      // Plain data, and it looks exactly right. The point is that it is not believed.
      completion: { completed_sync_at: new Date().toISOString() },
      flush: { completed_sync_at: new Date().toISOString() },
    };
    const { recorded } = await recordCompletedSync(store, lookalike);
    assert.equal(recorded, false, 'a report\'s own completion field is never trusted');
    assert.equal(await persistedCompletion(store), null, 'and nothing was written');

    void remote;
    await store.close();
  });
});

describe('the reading is passed through rather than converted', () => {
  it('carries the core\'s own field names, and its own sentence, unreworded', async () => {
    const { store } = await aDeviceThatCanSynchronise();

    const reading = await aReadingThatLanded(store, {
      inProgress: true, lastAttempt: null, credential: { present: false },
    });

    // Every field the indicator reads, by the name the core gave it. A rename anywhere fails here.
    for (const field of [
      'last_synced_at', 'last_synced_age_ms', 'never_synchronised', 'undelivered', 'needs_attention',
      'rejected', 'oldest_undelivered_age_ms', 'oldest_undelivered_label', 'level', 'summary',
      'blocks_application', 'in_progress', 'reason', 'reasons',
    ]) {
      assert.ok(field in reading, `the reading lost "${field}" on the way through`);
    }

    assert.equal(reading.in_progress, true, 'in-progress travels BESIDE the figures');
    assert.ok(reading.summary.length > 0, 'and the rung still has its sentence while it is true');

    // BOTH reasons apply, and the ORDER is the core's precedence rather than the order they were
    // derived in: "nothing at all is in the backup" leads, because it is strictly worse news than the
    // credential that explains it. The panel behind the indicator shows the rest, which is why every
    // reason is carried and not only the worst.
    assert.equal(
      reading.reason?.code,
      'never_synchronised',
      'the worst applicable reason leads the one-line indicator, and this is the core\'s ranking',
    );
    assert.deepEqual(
      reading.reasons.map((reason) => reason.code),
      ['never_synchronised', 'credential_missing'],
      'and a credential that has never been connected is still named specifically, never dropped and '
      + 'never shown as a spinner',
    );

    await store.close();
  });
});

describe('one pass at a time', () => {
  it('skips a second while one is in flight, rather than queueing a token it would waste', async () => {
    let running = 0;
    let peak = 0;
    let started = 0;
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });

    const guard = oneAtATime(async () => {
      started += 1;
      running += 1;
      peak = Math.max(peak, running);
      await held;
      running -= 1;
    });

    const first = guard.run(SYNC_TRIGGERS.OPEN);
    assert.equal(guard.busy(), true, 'and it says so, which is what the button reads');
    await guard.run(SYNC_TRIGGERS.MANUAL);
    assert.equal(started, 1, 'the second was skipped, not queued');
    release();
    await first;
    assert.equal(peak, 1);
    assert.equal(guard.busy(), false);

    // A second tap AFTER the first finished is a real request and must run.
    await guard.run(SYNC_TRIGGERS.MANUAL);
    assert.equal(started, 2, 'skipping while busy must not become skipping for ever');
  });

  /**
   * THIS PINS THE FACT THAT CAUSED A REAL DEFECT, so the defect cannot come back by looking reasonable.
   *
   * `busy()` is STILL TRUE inside the callback's own `finally`, because the guard clears its flag in a
   * `finally` of its own that runs afterwards. `SyncFromStore` originally asked the guard whether a
   * pass was running while composing the reading it published at the END of a pass — and so published
   * `in_progress: true` and left it standing. The screen read "Everything is backed up. Backing up
   * now.", a sentence that contradicts itself, over a device where nothing was happening.
   *
   * The fix is that the runner states the fact it knows rather than inferring it from a flag whose
   * clearing it does not control. This test is here so the next person who reaches for `busy()` to
   * answer "is a pass running?" at the end of a pass finds out here instead of on the coach's screen.
   */
  it('is STILL busy inside the callback\'s own finally — do not ask it there', async () => {
    let busyInsideFinally: boolean | null = null;
    let guard: ReturnType<typeof oneAtATime>;

    // eslint-disable-next-line prefer-const
    guard = oneAtATime(async () => {
      try {
        // the pass
      } finally {
        busyInsideFinally = guard.busy();
      }
    });

    await guard.run(SYNC_TRIGGERS.MANUAL);
    assert.equal(
      busyInsideFinally,
      true,
      'if this ever becomes false, the ordering changed and the warning above can be relaxed — but it '
      + 'must be relaxed deliberately, not discovered',
    );
    assert.equal(guard.busy(), false, 'and it is false once the run has fully unwound');
  });

  it('does not jam the door shut when a pass throws', async () => {
    const guard = oneAtATime(async () => {
      throw new Error('a local defect, not a service failure');
    });
    await assert.rejects(() => guard.run(SYNC_TRIGGERS.OPEN));
    assert.equal(
      guard.busy(),
      false,
      'a local defect that also stopped the application ever synchronising again would be two faults '
      + 'where the coach can see neither',
    );
  });
});

describe('the six opportunities, and the two periodicities that are not one timer', () => {
  /** A world with no browser in it, so every opportunity can be fired by hand. */
  function aWorld() {
    const visibility: Array<() => void> = [];
    const pageHide: Array<() => void> = [];
    const online: Array<() => void> = [];
    const timers: Array<{ ms: number; run: () => void }> = [];
    let visible = true;
    let stopped = 0;
    // THE TWO COUNTERS THAT MAKE THE RECONNECT PROOF BINDING rather than a second foreground test:
    // a pass observed after a `visibilitychange`, or on a window that was ever off the screen, is the
    // opportunity that already worked. See `the network came back` below.
    let visibilityFirings = 0;
    let everHidden = false;

    const environment: SyncEnvironment = {
      onVisibilityChange(listener) {
        visibility.push(listener);
        return () => { stopped += 1; };
      },
      onPageHide(listener) {
        pageHide.push(listener);
        return () => { stopped += 1; };
      },
      onOnline(listener) {
        online.push(listener);
        return () => { stopped += 1; };
      },
      isVisible: () => visible,
      every(ms, run) {
        timers.push({ ms, run });
        return () => { stopped += 1; };
      },
    };

    return {
      environment,
      timers,
      fireVisibility: () => {
        visibilityFirings += 1;
        visibility.forEach((listener) => listener());
      },
      firePageHide: () => pageHide.forEach((listener) => listener()),
      fireOnline: () => online.forEach((listener) => listener()),
      hide: () => { visible = false; everHidden = true; },
      show: () => { visible = true; },
      stoppedCount: () => stopped,
      visibilityFirings: () => visibilityFirings,
      everHidden: () => everHidden,
    };
  }

  function arm(world: ReturnType<typeof aWorld>) {
    const passes: string[] = [];
    let refreshes = 0;
    const disarm = armSyncOpportunities({
      environment: world.environment,
      runPass: (trigger) => passes.push(trigger),
      refreshReading: () => { refreshes += 1; },
    });
    return { passes, disarm, refreshes: () => refreshes };
  }

  it('runs `open` immediately, and only once', () => {
    const world = aWorld();
    const armed = arm(world);
    assert.deepEqual(armed.passes, [SYNC_TRIGGERS.OPEN]);
  });

  it('runs `foreground` on becoming visible and `leave` on becoming hidden', () => {
    const world = aWorld();
    const armed = arm(world);

    world.hide();
    world.fireVisibility();
    world.show();
    world.fireVisibility();

    assert.deepEqual(armed.passes, [SYNC_TRIGGERS.OPEN, SYNC_TRIGGERS.LEAVE, SYNC_TRIGGERS.FOREGROUND]);
  });

  it('leaves ONCE per departure, however many ways the platform announces it', () => {
    const world = aWorld();
    const armed = arm(world);

    // Closing a tab commonly fires both. Two best-effort flushes for one departure is the second of
    // them racing a tab the platform is already tearing down.
    world.hide();
    world.fireVisibility();
    world.firePageHide();
    world.firePageHide();

    assert.deepEqual(
      armed.passes.filter((trigger) => trigger === SYNC_TRIGGERS.LEAVE),
      [SYNC_TRIGGERS.LEAVE],
    );

    // And coming back re-arms it, so a second real departure is not swallowed.
    world.show();
    world.fireVisibility();
    world.hide();
    world.fireVisibility();
    assert.equal(armed.passes.filter((t) => t === SYNC_TRIGGERS.LEAVE).length, 2);
  });

  it('arms TWO timers with different periods, and the pass one is much the coarser', () => {
    const world = aWorld();
    arm(world);

    const periods = world.timers.map((timer) => timer.ms).sort((a, b) => a - b);
    assert.deepEqual(periods, [READING_REFRESH_MS, PERIODIC_SYNC_MS].sort((a, b) => a - b));
    assert.ok(
      PERIODIC_SYNC_MS >= READING_REFRESH_MS * 10,
      'THE TWO PERIODICITIES MUST NOT CONVERGE. Refreshing the reading is two local reads; running a '
      + 'pass is a network call that spends a token on a foreground-only credential with no refresh '
      + 'token. One timer for both would hammer the service while the coach is mid-session.',
    );
  });

  it('refreshes the reading on its timer and runs NO pass for it', () => {
    const world = aWorld();
    const armed = arm(world);
    const readingTimer = world.timers.find((timer) => timer.ms === READING_REFRESH_MS);
    assert.ok(readingTimer !== undefined);

    readingTimer.run();
    readingTimer.run();

    assert.equal(armed.refreshes(), 2, 'the ladder climbs with the clock even when nothing happens');
    assert.deepEqual(armed.passes, [SYNC_TRIGGERS.OPEN], 'and not one extra pass was run for it');
  });

  it('runs `interval` on the coarse timer, and not at all while hidden', () => {
    const world = aWorld();
    const armed = arm(world);
    const passTimer = world.timers.find((timer) => timer.ms === PERIODIC_SYNC_MS);
    assert.ok(passTimer !== undefined);

    passTimer.run();
    assert.deepEqual(armed.passes, [SYNC_TRIGGERS.OPEN, SYNC_TRIGGERS.INTERVAL]);

    world.hide();
    passTimer.run();
    passTimer.run();
    assert.equal(
      armed.passes.filter((trigger) => trigger === SYNC_TRIGGERS.INTERVAL).length,
      1,
      'a hidden tab spending quota to learn the same fact is the background synchronisation the engine '
      + 'declares impossible',
    );
  });

  /**
   * NAMES, NOT A NUMBER — and the rewrite is the point of the test rather than a tidy-up.
   *
   * This read "there is no sixth" and asserted only that each trigger produced was one the engine
   * declared. That check cannot object to anything: it passes for whatever the engine currently
   * holds, so the day a sixth opportunity is added it goes green over it and the sentence in its own
   * name becomes false without a single red. A count is the same rubber stamp one step along — the
   * integer gets bumped by whoever wanted the trigger.
   *
   * So the AUTHORISED set is written out here by name. Adding a seventh now has to be an edit to a
   * list of names in a test that says what it authorises, which is exactly the visible change
   * `core/sync/engine.js` says a new opportunity should be.
   */
  it('produces only the AUTHORISED opportunities, named here rather than counted', () => {
    const world = aWorld();
    const armed = arm(world);
    world.hide();
    world.fireVisibility();
    world.show();
    world.fireVisibility();
    world.fireOnline();
    world.timers.forEach((timer) => timer.run());

    const AUTHORISED: readonly string[] = [
      SYNC_TRIGGERS.OPEN, SYNC_TRIGGERS.FOREGROUND, SYNC_TRIGGERS.RECONNECT, SYNC_TRIGGERS.LEAVE,
      SYNC_TRIGGERS.INTERVAL,
      // `manual` is deliberately absent: it is the coach's own tap and arrives through the actions,
      // so a listener producing it would mean this file had invented a gesture nobody made.
    ];
    for (const trigger of armed.passes) {
      assert.ok(AUTHORISED.includes(trigger), `"${trigger}" is not an opportunity this arms`);
    }
    assert.deepEqual(
      [...new Set(armed.passes)].sort(),
      [...AUTHORISED].sort(),
      'every authorised opportunity really did fire, so the check above is not vacuous — and one that '
      + 'stopped firing would show up here rather than as a quietly narrower green',
    );

    const declared: readonly string[] = Object.values(SYNC_TRIGGERS);
    for (const trigger of AUTHORISED) {
      assert.ok(declared.includes(trigger), `"${trigger}" is not a synchronisation opportunity`);
    }
  });

  it('disarms everything it armed', () => {
    const world = aWorld();
    const armed = arm(world);
    armed.disarm();
    assert.equal(
      world.stoppedCount(),
      5,
      'three listeners and two timers. A timer left running after the store closed would read a store '
      + 'nobody holds, and an `online` listener outliving its scope would run a pass against it.',
    );
  });
});

describe('the two facts a surface needs: what this pass did, and what is still outstanding', () => {
  /** A pass that reached the union. `failures` is empty, so no step — least of all `pull` — failed. */
  const aPassThatRead = (unreadable: readonly string[]) => ({
    trigger: SYNC_TRIGGERS.RECONNECT,
    failures: [],
    unreadable: unreadable.map((name) => ({ name, why: 'written by a newer version' })),
    unplaceable: [],
  });

  /** A pass that never got there: the pull step is the one that failed, so it met nothing. */
  const aPassThatFailedBeforeReading = () => ({
    trigger: SYNC_TRIGGERS.RECONNECT,
    failures: [{ step: 'pull', code: 'no_network', message: 'Google could not be reached' }],
    unreadable: [],
    unplaceable: [],
  });

  const skipped = (report: unknown) => ((report as { unreadable: unknown[] }).unreadable).length;

  it('tells a pass that READ the backup from one that never got there', () => {
    assert.equal(readTheBackup(aPassThatRead([])), true);
    assert.equal(readTheBackup(aPassThatFailedBeforeReading()), false);
    assert.equal(
      readTheBackup({ failures: [{ step: 'push', code: 'no_network' }], unreadable: [] }),
      true,
      'a push that failed says nothing about the pull, and a pass whose pull SUCCEEDED is the '
      + 'authority on what it met however badly the rest of it went',
    );
    assert.equal(readTheBackup(null), false, 'and nothing at all is not a pass that read anything');
  });

  it('carries an outstanding finding across a pass that could not look', () => {
    const attempts = holdAttempts();
    attempts.record(aPassThatRead(['fit.other.push.newer.json']));
    assert.equal(skipped(attempts.forTheSurface()), 1, 'the pass that met it says so');

    attempts.record(aPassThatFailedBeforeReading());
    const surface = attempts.forTheSurface() as { unreadable: unknown[]; failures: { step: string }[] };
    assert.equal(
      skipped(surface),
      1,
      'THE FINDING SURVIVES A PASS THAT LEARNED NOTHING ABOUT IT. Before this holder existed the '
      + 'surface read the latest report alone and "your backup is missing files" vanished on the next '
      + 'dropped signal, with the finding still true.',
    );
    assert.deepEqual(
      surface.failures.map((failure) => failure.step),
      ['pull'],
      'and the OUTCOME is the latest pass\'s own, unreplaced — carrying the previous report whole '
      + 'would tell him a file could not be read when what just happened was a dead connection',
    );
  });

  it('clears it on a pass that genuinely READ the backup and found nothing', () => {
    const attempts = holdAttempts();
    attempts.record(aPassThatRead(['fit.other.push.newer.json']));
    attempts.record(aPassThatFailedBeforeReading());
    assert.equal(skipped(attempts.forTheSurface()), 1, 'still standing after the failure');

    attempts.record(aPassThatRead([]));
    assert.equal(
      skipped(attempts.forTheSurface()),
      0,
      'A FINDING IS NOT A LATCH. The other installation upgraded, the file became readable, and the '
      + 'pass that looked is the one entitled to say so — an indicator that cannot come home is one he '
      + 'learns to ignore, including on the day it means something.',
    );
  });

  it('says nothing at all before the first pass', () => {
    assert.equal(holdAttempts().forTheSurface(), null, 'and null is what the surface already handles');
  });
});

/**
 * SYNCHRONISATION ON RECONNECT — and every assertion here is driven WITHOUT the window ever moving.
 *
 * The trap this whole block is written around: `foreground` already runs a pass, and a reconnect test
 * that hides the window and shows it again proves `foreground`, not the new listener. So the world
 * below has NO visibility events at all — the visibility handler is armed and never fires, and
 * `isVisible` answers `true` throughout. The only thing that can produce a pass is `online`.
 */
describe('the network comes back, and he never left the screen', () => {
  /**
   * A world whose only moving part is the network.
   *
   * `hide()` changes only what `isVisible` ANSWERS and announces nothing, which is not what a browser
   * does — it is what makes the hidden case a statement about the `online` handler consulting
   * visibility rather than about the visibility handler running.
   */
  function aNetwork() {
    const online: Array<() => void> = [];
    const stops: string[] = [];
    // The visibility listeners are COLLECTED AND NEVER CALLED, and this world exposes no way to call
    // them. That is what makes the reconnect proof binding: the foreground opportunity is armed, and
    // it is structurally unable to be the thing that produced any pass observed below.
    const visibilityListeners: Array<() => void> = [];
    let visible = true;

    const environment: SyncEnvironment = {
      onVisibilityChange(listener) {
        visibilityListeners.push(listener);
        return () => stops.push('visibility');
      },
      onPageHide() {
        return () => stops.push('pagehide');
      },
      onOnline(listener) {
        online.push(listener);
        return () => stops.push('online');
      },
      isVisible: () => visible,
      every() {
        return () => stops.push('timer');
      },
    };

    return {
      environment,
      fireOnline: () => online.forEach((listener) => listener()),
      hide: () => { visible = false; },
      subscribersToVisibility: () => visibilityListeners.length,
    };
  }

  /** Let every microtask and timer callback already queued run to completion. */
  const settled = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

  it('runs a `reconnect` pass on `online`, with the document never leaving `visible`', () => {
    const network = aNetwork();
    const passes: string[] = [];
    const disarm = armSyncOpportunities({
      environment: network.environment,
      runPass: (trigger) => passes.push(trigger),
      refreshReading: () => {},
    });
    // Compared through a COPY: `assert.deepEqual` narrows its first argument's type to the expected
    // literal, and the assertion below has to be able to ask about a trigger that is not in it.
    assert.deepEqual([...passes], [SYNC_TRIGGERS.OPEN], 'the arming pass, and nothing else yet');

    network.fireOnline();

    assert.deepEqual(
      [...passes],
      [SYNC_TRIGGERS.OPEN, SYNC_TRIGGERS.RECONNECT],
      'THE WHOLE POINT: a queued session\'s work reaches the backup while the coach sits looking at '
      + 'the screen that told him it had not, instead of waiting for him to leave and come back',
    );

    // THE HALF THAT MAKES IT BINDING. The visibility handler IS armed — so the silence below is the
    // world genuinely not moving, not an unsubscribed listener that could never have spoken.
    assert.equal(
      network.subscribersToVisibility(),
      1,
      'the foreground opportunity is armed as ever — and this world cannot fire it, so nothing above '
      + 're-proves the trigger that already worked',
    );
    assert.ok(
      !passes.includes(SYNC_TRIGGERS.FOREGROUND),
      'a reconnect recorded as `foreground` would tell him, in the words the completion is read back '
      + 'in, that the backup happened because he came back to a screen he never left',
    );

    disarm();
  });

  it('runs NO pass when the network returns to a window that is off the screen', () => {
    const network = aNetwork();
    const passes: string[] = [];
    const disarm = armSyncOpportunities({
      environment: network.environment,
      runPass: (trigger) => passes.push(trigger),
      refreshReading: () => {},
    });

    network.hide();
    network.fireOnline();
    network.fireOnline();

    assert.deepEqual(
      passes,
      [SYNC_TRIGGERS.OPEN],
      'a hidden tab that rejoins a network and spends a token is the background synchronisation the '
      + 'engine declares impossible; his return is the `foreground` opportunity and it already exists',
    );

    disarm();
  });

  it('costs ONE pass for a flapping connection, not one per announcement', async () => {
    const network = aNetwork();
    const started: string[] = [];
    let release: () => void = () => {};
    let held = new Promise<void>((resolve) => { release = resolve; });

    // A REAL `oneAtATime`, the same guard `SyncFromStore` puts between the opportunities and the pass.
    const guard = oneAtATime(async (trigger) => {
      started.push(trigger);
      await held;
    });
    const disarm = armSyncOpportunities({
      environment: network.environment,
      runPass: (trigger) => { void guard.run(trigger); },
      refreshReading: () => {},
    });

    // THE ARMING PASS IS LET GO FIRST. A flap skipped because `open` was still in flight would prove
    // nothing about the flap.
    release();
    await settled();
    assert.deepEqual(started, [SYNC_TRIGGERS.OPEN]);
    assert.equal(guard.busy(), false, 'the arming pass is done, so the guard is open for the flap');

    held = new Promise<void>((resolve) => { release = resolve; });
    for (let flap = 0; flap < 5; flap += 1) network.fireOnline();
    await settled();

    assert.deepEqual(
      started,
      [SYNC_TRIGGERS.OPEN, SYNC_TRIGGERS.RECONNECT],
      'a signal coming and going five times is one opportunity, not five: the guard SKIPS rather than '
      + 'queueing, so the later announcements are answered by the pass already running',
    );
    assert.equal(guard.busy(), true, 'and that pass is genuinely still in flight — not five that ran');

    // And skipping while busy must not become skipping for ever: the next real reconnect runs.
    release();
    await settled();
    network.fireOnline();
    await settled();
    assert.deepEqual(
      started,
      [SYNC_TRIGGERS.OPEN, SYNC_TRIGGERS.RECONNECT, SYNC_TRIGGERS.RECONNECT],
      'a connection that drops again an hour later is a new opportunity, not a swallowed one',
    );

    disarm();
  });

  /**
   * AN `online` EVENT IS NOT A ROUTE TO GOOGLE, AND THIS IS THE PASS THAT PROVES IT BY FAILING.
   *
   * The pass is driven through the real listener over a real store and the core's own remote, and it
   * is MADE to fail rather than reasoned about. What is read back afterwards is the persisted
   * completion and the reading the indicator draws from — not the code.
   */
  it('leaves an honest state when the pass it started then fails', async () => {
    const { store, remote } = await aDeviceThatCanSynchronise();
    await changeSomething(store, 'Someone to back up');

    // THE SEAM'S OWN HOLDER, not a mirror of it: `SyncFromStore.tsx` records into exactly this and
    // asks exactly this for what the surface reads. Every fact asserted below is read from the store
    // or from the runner's own report.
    const attempts = holdAttempts();
    const network = aNetwork();
    const guard = oneAtATime(async (trigger) => {
      const { report } = await runSyncPass(store, remote as never, { trigger });
      attempts.record(report);
    });
    // A pass over a real store takes as long as it takes, so the pass this listener starts is AWAITED
    // rather than given a tick to finish in. A timeout would make every assertion below a race.
    let passing: Promise<void> = Promise.resolve();
    const disarm = armSyncOpportunities({
      environment: network.environment,
      runPass: (trigger) => { passing = guard.run(trigger); },
      refreshReading: () => {},
    });
    await passing;

    const green = await persistedCompletion(store);
    assert.ok(green !== null, 'THE POSITIVE CONTROL: there is a real completion here to lose');

    // ── A SKIP LANDS, AND THE INDICATOR ESCALATES OFF THE CALM RUNG ────────────────────────────────
    // What the coach's other, newer installation would have written. This one cannot decode it.
    await remote.create(SPACES.VISIBLE, {
      name: areaFileName('other-device1', 'push', 'from-a-newer-build'),
      content: JSON.stringify({
        document_version: 99,
        kind: DOCUMENT_KINDS.PUSH,
        device: 'other-device1',
        written_at: new Date().toISOString(),
        cursor: '',
        records: [],
        purges: [],
      }),
    });

    network.fireOnline();
    await passing;

    const skipping = (attempts.forTheSurface() ?? {}) as { unreadable: unknown[]; failures: unknown[] };
    assert.equal(skipping.unreadable.length, 1, 'the reconnect pass MET the undecodable file');
    assert.equal(skipping.failures.length, 0, 'and it is not a failure — that is the trap');

    const escalated = await aReadingThatLanded(store, {
      inProgress: false, lastAttempt: attempts.forTheSurface(), credential: { present: true, expired: false },
    });
    assert.equal(skippedFilesOutstanding(escalated), true, 'the skip is outstanding');
    assert.equal(rungOf(escalated), 'up_to_date', 'his OWN work really has all gone — that is the trap');
    assert.notEqual(
      drawnRungOf(escalated),
      rungOf(escalated),
      'and the drawn rung is escalated off the calm disc while the skip stands: the ring is the first '
      + 'thing he sees and the only part legible in the collapsed rail',
    );
    assert.equal(needsAction(escalated), true, 'so a glance says something needs him');

    // ── NOW THE RECONNECT PASS THAT FAILS ─────────────────────────────────────────────────────────
    await changeSomething(store, 'Someone else');
    remote.adversity.failNext(20);
    network.fireOnline();
    await passing;
    remote.adversity.clear();

    const failed = attempts.forTheSurface() as { failures: unknown[]; unreadable: unknown[] };
    assert.ok(
      failed.failures.length > 0,
      'THE PROBE MUST HAVE LANDED: a pass that quietly succeeded would make everything below pass for '
      + 'the wrong reason',
    );
    assert.equal(
      await persistedCompletion(store),
      green,
      'the completion is left EXACTLY where it was — an `online` event is a local interface coming up '
      + 'and never a route to Google, so a pass it started that then failed neither advances it (he is '
      + 'safe when he is not) nor clears it (he never backed up when he did)',
    );

    const after = await aReadingThatLanded(store, {
      inProgress: false, lastAttempt: attempts.forTheSurface(), credential: { present: true, expired: false },
    });
    assert.equal(
      after.in_progress,
      false,
      'and nothing is left claiming a pass is running: an indeterminate in-progress state standing in '
      + 'front of him is the defect the runner states its own facts to avoid',
    );
    assert.notEqual(
      drawnRungOf(after),
      'up_to_date',
      'THE RING DOES NOT RETURN TO THE CALM DISC ACROSS THE FAILURE. A reconnect that ended in a '
      + 'failure and left the shape saying everything was backed up would have used the new trigger '
      + 'to hide the very thing it was added to fix.',
    );
    assert.equal(after.undelivered, 1, 'the work that could not go through is counted, not forgotten');

    // ── THE TWO FACTS, BOTH STILL SAID ────────────────────────────────────────────────────────────
    //
    // MEASURED BEFORE THE GUARD EXISTED, at exactly this point: `skippedFilesOutstanding` went from
    // true to FALSE across the failure. The failed pass never reached the union, so it met no
    // undecodable file, so it reported none — and the surface, reading the latest report alone,
    // dropped a finding that was still perfectly true. The application going quiet about a real
    // problem on the strength of a pass that learned nothing.
    const codes = after.reasons.map((reason) => reason.code);
    assert.ok(
      codes.includes('no_network'),
      'THE OUTCOME IS THIS PASS\'S OWN: the service could not be reached, which is what an `online` '
      + 'event never promised in the first place. A finding carried forward must not become a stale '
      + 'present tense that speaks over what actually just happened.',
    );
    assert.equal(
      skippedFilesOutstanding(after),
      true,
      'AND THE FINDING IS STILL OUTSTANDING. A pass that failed before it reached the union learned '
      + 'nothing about the files it could not read, so it may not be the thing that clears them — the '
      + 'coach is still told his backup is missing files, because it still is.',
    );

    disarm();
    await store.close();
  });
});
