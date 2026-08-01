/**
 * THE DRAIN THAT DECIDES WHETHER OTHER TESTS ARE BELIEVABLE.
 *
 * `settle()` is what six suites await before asserting that something was published, delivered or
 * committed. It used to drain a FIXED FOUR event-loop turns: sufficient on a quiet machine, and
 * silently insufficient for anything needing a fifth. A test that proceeds on unsettled state does
 * not fail — it asserts against a half-finished world and reports a green nobody can interpret.
 *
 * So the replacement is held to three separate proofs, because the obvious one is not enough:
 *
 *  1. IT EXTENDS — work needing a fifth turn is left unsettled by a four-turn drain and settled by
 *     this one.
 *  2. IT REFUSES — work that never quiesces makes it throw, naming what was still owed.
 *  3. IT OBSERVES — and this is the one that is easy to leave out. The drain keeps the old four
 *     turns as a floor, which means a quiescence detector that had silently stopped working would
 *     still drain four turns, every caller would stay green, and the suite would look EXACTLY as it
 *     does now. `quiescentAt` is reported separately from `turnsDrained` for that reason, and (3)
 *     asserts the two numbers can be told apart.
 *
 * The chains below are built out of the message bus because one hop is exactly one event-loop turn,
 * which makes "needs a fifth turn" a construction rather than a hope about timing.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorld, settle } from './testing/platform-double.js';
import { outstandingWork } from './testing/pending-work.js';

/** The drain this replaced, so the fifth-turn case can be run through both and compared. */
async function drainFourTurns() {
  for (let i = 0; i < 4; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  }
}

/**
 * A chain of `hops` message deliveries: each delivery posts the next, so the whole chain takes
 * exactly `hops` event-loop turns to finish.
 *
 * @param {number} hops
 */
function aChainOfDeliveries(hops) {
  const world = createWorld();
  const sender = world.bus.channel('chain');
  const peer = world.bus.channel('chain');
  const reached = { hop: 0 };

  peer.addEventListener('message', (event) => {
    reached.hop = event.data.hop;
    if (reached.hop < hops) sender.postMessage({ hop: reached.hop + 1 });
  });

  sender.postMessage({ hop: 1 });
  return {
    reached,
    close() {
      sender.close();
      peer.close();
    },
  };
}

/** A chain that reposts for ever: quiescence never arrives, however long anyone waits. */
function anEndlessChain() {
  const world = createWorld();
  const sender = world.bus.channel('endless');
  const peer = world.bus.channel('endless');

  peer.addEventListener('message', (event) => {
    if (!sender.closed) sender.postMessage({ hop: event.data.hop + 1 });
  });

  sender.postMessage({ hop: 1 });
  return {
    close() {
      sender.close();
      peer.close();
    },
  };
}

test('the fixed four-turn drain leaves work needing a fifth turn unsettled', async () => {
  const chain = aChainOfDeliveries(6);
  try {
    await drainFourTurns();
    assert.equal(chain.reached.hop, 4,
      'the four-turn drain should reach exactly four of six hops — this is the defect being fixed, '
      + 'and if this number is six the chain is no longer one hop per turn and the rest of this '
      + 'file is proving nothing');
    assert.ok(outstandingWork().length > 0,
      'with two hops still to come the double should still owe work');
  } finally {
    chain.close();
    await settle();
  }
});

test('the drain runs past four turns and settles work the fixed count missed', async () => {
  const chain = aChainOfDeliveries(6);
  try {
    const report = await settle();

    assert.equal(chain.reached.hop, 6,
      'every hop should have landed: the drain waits for the work rather than for a turn count');
    assert.equal(outstandingWork().length, 0, 'nothing should still be owed once the drain returns');
    assert.ok(report.turnsDrained > 4,
      `the drain should have run past the old four turns, ran ${report.turnsDrained}`);
    assert.ok(report.quiescentAt > 4,
      `quiescence should have been observed past turn four, was observed at ${report.quiescentAt}`);
  } finally {
    chain.close();
  }
});

test('quiescence is OBSERVED, not assumed from the turn floor', async () => {
  // Nothing scheduled at all, so the world is quiescent from the first turn. The drain still runs
  // its four-turn floor — and reports that it saw quiescence at turn one. Those two numbers being
  // different is the whole proof that the detector is doing something: were it broken so as to
  // report quiescent always, this test would still pass, but the fifth-turn test above could not.
  const report = await settle();

  assert.equal(report.quiescentAt, 1,
    `an empty world is quiescent on the first turn, observed at ${report.quiescentAt}`);
  assert.equal(report.turnsDrained, 4,
    `the floor should still have been drained, drained ${report.turnsDrained}`);
  assert.notEqual(report.quiescentAt, report.turnsDrained,
    'the turn quiescence was observed and the turns drained must be separately readable, or a '
    + 'detector that had stopped working would be indistinguishable from one that had not');
});

test('the ceiling fails LOUDLY, naming what was still outstanding', async () => {
  const chain = anEndlessChain();
  try {
    await assert.rejects(
      () => settle({ ceiling: 12 }),
      (error) => {
        assert.ok(error instanceof Error, 'the drain should give up by throwing, not by returning');
        assert.match(error.message, /drained 12 event-loop turns/,
          `the message should say how long it waited, said: ${error.message}`);
        assert.match(error.message, /message delivery on the endless channel/,
          `the message should NAME the outstanding work rather than report a timeout, said: ${error.message}`);
        return true;
      },
    );
  } finally {
    chain.close();
    await settle();
  }
});
