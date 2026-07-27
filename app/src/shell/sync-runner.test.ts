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
  PERIODIC_SYNC_MS, READING_REFRESH_MS, armSyncOpportunities, oneAtATime, readSyncReading, runSyncPass,
} from './sync-runner.ts';
import type { SyncEnvironment } from './sync-runner.ts';

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

describe('the join: a real pass advances the value the surface displays', () => {
  it('records a completion, and the surface stops saying never synchronised', async () => {
    const { store, remote } = await aDeviceThatCanSynchronise();
    await changeSomething(store, 'Someone to back up');

    const before = await readSyncReading(store, {
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

    const after = await readSyncReading(store, {
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
    const reading = await readSyncReading(store, {
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

    const reading = await readSyncReading(store, {
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

describe('the five opportunities, and the two periodicities that are not one timer', () => {
  /** A world with no browser in it, so every opportunity can be fired by hand. */
  function aWorld() {
    const visibility: Array<() => void> = [];
    const pageHide: Array<() => void> = [];
    const timers: Array<{ ms: number; run: () => void }> = [];
    let visible = true;
    let stopped = 0;

    const environment: SyncEnvironment = {
      onVisibilityChange(listener) {
        visibility.push(listener);
        return () => { stopped += 1; };
      },
      onPageHide(listener) {
        pageHide.push(listener);
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
      fireVisibility: () => visibility.forEach((listener) => listener()),
      firePageHide: () => pageHide.forEach((listener) => listener()),
      hide: () => { visible = false; },
      show: () => { visible = true; },
      stoppedCount: () => stopped,
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

  it('every trigger it produces is one the engine declares — there is no sixth', () => {
    const world = aWorld();
    const armed = arm(world);
    world.hide();
    world.fireVisibility();
    world.show();
    world.fireVisibility();
    world.timers.forEach((timer) => timer.run());

    const declared: readonly string[] = Object.values(SYNC_TRIGGERS);
    for (const trigger of armed.passes) {
      assert.ok(declared.includes(trigger), `"${trigger}" is not a synchronisation opportunity`);
    }
    assert.ok(
      armed.passes.length > 3,
      'and the check is not vacuous: several opportunities really did fire',
    );
  });

  it('disarms everything it armed', () => {
    const world = aWorld();
    const armed = arm(world);
    armed.disarm();
    assert.equal(
      world.stoppedCount(),
      4,
      'two listeners and two timers. A timer left running after the store closed would read a store '
      + 'nobody holds.',
    );
  });
});
