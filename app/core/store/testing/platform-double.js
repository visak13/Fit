/**
 * ASSEMBLING A SIMULATED DEVICE, and simulating two windows of it.
 *
 * A "world" here is one device: one database, one lock manager, one message bus. A "context" is one
 * window open on that device. Two contexts of the same world therefore share the database exactly
 * as two windows of a browser do — which is the genuine concurrent-write case this application has
 * to survive, and the only way to test it is to build it rather than describe it.
 *
 * `mobileContext` exists for the other half of that requirement: running two live sessions at once
 * is laptop-only, and the mobile build must not offer it. A test that can construct a mobile
 * context can prove the capability is withheld there rather than trusting a comment.
 */

import { createFakeIndexedDB } from './fake-indexeddb.js';
import { FakeBus, FakeLockManager } from './fake-locks.js';
import { describeOutstandingWork, outstandingWork } from './pending-work.js';

/**
 * @typedef {Object} World
 * @property {import('./fake-indexeddb.js').FakeIndexedDB} indexedDB
 * @property {any} IDBKeyRange
 * @property {FakeLockManager} locks
 * @property {FakeBus} bus
 */

/**
 * One simulated device.
 * @returns {World}
 */
export function createWorld() {
  const { indexedDB, IDBKeyRange } = createFakeIndexedDB();
  return { indexedDB, IDBKeyRange, locks: new FakeLockManager(), bus: new FakeBus() };
}

/**
 * One window open on a device.
 *
 * @param {World} world
 * @param {{formFactor?: 'desktop'|'mobile'|'unknown', locks?: boolean, broadcast?: boolean, strictDurability?: boolean}} [options]
 * @returns {import('../platform.js').Platform}
 */
export function createContext(world, options = {}) {
  const {
    formFactor = 'desktop', locks = true, broadcast = true, strictDurability = true,
  } = options;

  return {
    indexedDB: /** @type {any} */ (world.indexedDB),
    IDBKeyRange: world.IDBKeyRange,
    locks: locks ? { request: (...args) => world.locks.request(...args) } : null,
    broadcast: broadcast ? (name) => world.bus.channel(name) : null,
    formFactor,
    supportsStrictDurability: strictDurability,
  };
}

/**
 * A single laptop window — the ordinary case, and what most tests want.
 * @param {{formFactor?: 'desktop'|'mobile'|'unknown'}} [options]
 * @returns {{world: World, platform: import('../platform.js').Platform}}
 */
export function createLaptop(options = {}) {
  const world = createWorld();
  return { world, platform: createContext(world, options) };
}

/**
 * TWO windows on ONE laptop, sharing one database, one lock manager and one message bus.
 *
 * This is the shape of the real requirement: the coach may have two windows open running two live
 * sessions with different routines at the same time.
 *
 * @returns {{world: World, a: import('../platform.js').Platform, b: import('../platform.js').Platform}}
 */
export function createTwoWindowLaptop() {
  const world = createWorld();
  return { world, a: createContext(world), b: createContext(world) };
}

/**
 * A phone. Same database facilities; a mobile form factor, so the laptop-only capability is
 * withheld.
 * @returns {{world: World, platform: import('../platform.js').Platform}}
 */
export function createPhone() {
  const world = createWorld();
  return { world, platform: createContext(world, { formFactor: 'mobile' }) };
}

/**
 * Turns the drain always runs, whatever the registry says.
 *
 * This is the drain it replaced, kept as a FLOOR so that no caller green today drains less than it
 * did. It is deliberately conservative and it is NOT the mechanism: work owed beyond these turns is
 * waited for, and `quiescentAt` in the report is what says whether the registry saw anything, so a
 * detector that had silently stopped working could not hide behind this number.
 */
const MINIMUM_TURNS = 4;

/**
 * Turns after which the drain gives up and says so.
 *
 * Generous — a turn is a `setTimeout(0)`, so the whole ceiling is a fraction of a second — because
 * its job is to catch work that never finishes, not to police work that is merely slow.
 */
const CEILING_TURNS = 200;

/** @returns {Promise<void>} one event-loop turn, which also drains every microtask queued in it */
const oneTurn = () => new Promise((resolve) => { setTimeout(resolve, 0); });

/**
 * Let every scheduled task, delivery and commit settle — DRAINING UNTIL QUIESCENT, not for a fixed
 * number of turns.
 *
 * ## Why the fixed count had to go
 *
 * This drained exactly FOUR turns. Four was sufficient on a quiet machine, so work needing a fifth
 * was left UNSETTLED and the test carried on regardless. That is a guard pinned to a snapshot, and
 * the snapshot is a number of event-loop turns — the thing that shifts first under load. Worse, it
 * was SILENT: a test proceeding on unsettled state produces a green whose meaning nobody can
 * recover afterwards.
 *
 * ## What it does instead
 *
 * It runs turns until the doubles report no scheduled work outstanding (`pending-work.js`), then
 * returns. If the ceiling arrives first it THROWS, naming what was still owed — a silent give-up
 * would be strictly worse than the fixed count it replaced, because it would put the old defect back
 * with a longer timeout in front of it.
 *
 * ## Reading the report
 *
 * `turnsDrained` is how long the drain ran; `quiescentAt` is the turn at which it first OBSERVED
 * quiescence. They differ whenever the floor is doing the waiting, and a `quiescentAt` that never
 * moves past 1 across a suite means the registry is seeing nothing and the drain is a fixed count
 * again wearing a new name.
 *
 * @param {{ceiling?: number}} [options]
 * @returns {Promise<{turnsDrained: number, quiescentAt: number}>}
 */
export async function settle({ ceiling = CEILING_TURNS } = {}) {
  /** The first turn of the current unbroken run of quiescent observations; null while work is owed. */
  let quiescentAt = null;

  for (let turn = 1; turn <= ceiling; turn += 1) {
    // eslint-disable-next-line no-await-in-loop
    await oneTurn();

    if (outstandingWork().length > 0) {
      quiescentAt = null;
      continue;
    }

    if (quiescentAt === null) quiescentAt = turn;
    if (turn >= MINIMUM_TURNS) return { turnsDrained: turn, quiescentAt };
  }

  throw new Error(
    `settle() drained ${ceiling} event-loop turns and the test double still owes work: `
    + `${describeOutstandingWork()}. Either the work under test never finishes, or it schedules `
    + 'more work every turn. This is a diagnosis, not a timeout: the labels above name the tasks '
    + 'that were scheduled and had not run when the drain gave up.',
  );
}
