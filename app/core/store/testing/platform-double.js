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

/** Let every scheduled task, delivery and commit settle. */
export async function settle() {
  for (let i = 0; i < 4; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
