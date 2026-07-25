/**
 * THE LAPTOP-ONLY CAPABILITY, and the rule that it fails closed.
 *
 * Running two live sessions at once is offered on the laptop and **must not be offered on mobile**.
 * The interface reads these values and hides the feature; it does not sniff the device itself and it
 * does not treat the absence as something to work around.
 *
 * Everything here fails closed. A device that cannot be classified is not a laptop. The cost of a
 * false negative is a feature the coach does not see; the cost of a false positive is two windows
 * writing over each other in the middle of a session.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { hasCapability, LAPTOP_ONLY_CAPABILITIES, storeCapabilities } from './capabilities.js';
import { openLocalStore } from './local-store.js';
import { browserPlatform, detectFormFactor } from './platform.js';
import { createContext, createLaptop, createPhone, createWorld } from './testing/platform-double.js';

test('two live sessions at once is offered on a laptop', async () => {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });
  assert.equal(store.capabilities.concurrentSessions.available, true);
  assert.match(store.capabilities.concurrentSessions.reason, /two windows/i);
  await store.close();
});

test('two live sessions at once is NOT offered on a phone', async () => {
  const { platform } = createPhone();
  const store = await openLocalStore({ platform, device: 'coach-phone' });

  assert.equal(store.capabilities.concurrentSessions.available, false);
  assert.match(store.capabilities.concurrentSessions.reason, /laptop feature/i,
    'the reason is in plain words, because a diagnostics panel shows it to a non-technical person');

  // Everything else still works on the phone. Only the extra is withheld.
  assert.equal(store.capabilities.crossContextCoordination.available, true);
  await store.close();
});

test('an unidentifiable device is not treated as a laptop', () => {
  const world = createWorld();
  const unknown = storeCapabilities(createContext(world, { formFactor: 'unknown' }));
  assert.equal(unknown.concurrentSessions.available, false);
  assert.match(unknown.concurrentSessions.reason, /could not be identified/i);
});

test('a laptop missing the coordination facilities is not offered it either', () => {
  const world = createWorld();
  assert.equal(
    storeCapabilities(createContext(world, { locks: false })).concurrentSessions.available, false,
  );
  assert.equal(
    storeCapabilities(createContext(world, { broadcast: false })).concurrentSessions.available, false,
  );
});

test('every capability gives a reason, whether it is available or not', () => {
  const world = createWorld();
  for (const options of [{}, { formFactor: 'mobile' }, { locks: false, broadcast: false, strictDurability: false }]) {
    const capabilities = storeCapabilities(createContext(world, options));
    for (const [name, capability] of Object.entries(capabilities)) {
      assert.equal(typeof capability.available, 'boolean', name);
      assert.ok(capability.reason.length > 20, `${name} must say why, in words a person can read`);
    }
  }
});

test('the laptop-only list names the capability, so a later screen can check rather than remember', () => {
  assert.deepEqual(LAPTOP_ONLY_CAPABILITIES, ['concurrentSessions']);
  const world = createWorld();
  const phone = storeCapabilities(createContext(world, { formFactor: 'mobile' }));
  for (const name of LAPTOP_ONLY_CAPABILITIES) {
    assert.equal(hasCapability(phone, name), false);
  }
});

test('the form factor is read from evidence, most reliable first', () => {
  assert.equal(detectFormFactor({}), 'unknown', 'no navigator at all');
  assert.equal(detectFormFactor({ navigator: { userAgentData: { mobile: true } } }), 'mobile');
  assert.equal(detectFormFactor({ navigator: { userAgentData: { mobile: false } } }), 'desktop');

  const withQueries = (matches) => ({
    navigator: {},
    matchMedia: (q) => ({ matches: matches.includes(q) }),
  });
  assert.equal(detectFormFactor(withQueries(['(pointer: coarse)', '(hover: none)'])), 'mobile');
  assert.equal(detectFormFactor(withQueries(['(pointer: fine)'])), 'desktop');
  assert.equal(detectFormFactor(withQueries([])), 'unknown', 'no evidence either way stays unknown');

  assert.equal(detectFormFactor({ navigator: { maxTouchPoints: 5 } }), 'mobile');
  assert.equal(detectFormFactor({ navigator: { maxTouchPoints: 0 } }), 'unknown');

  // A media query that throws must not take the application down with it.
  assert.equal(detectFormFactor({ navigator: {}, matchMedia: () => { throw new Error('no'); } }), 'unknown');
});

test('a browser with no local database says so instead of half-starting', () => {
  assert.throws(() => browserPlatform({ navigator: {} }), /nothing could be saved on this device/);
});

test('the real platform is assembled from whatever the browser actually offers', () => {
  const fake = {
    indexedDB: { open() {} },
    IDBKeyRange: {},
    navigator: { locks: { request: () => {} }, userAgentData: { mobile: false } },
    BroadcastChannel: class { constructor(name) { this.name = name; } close() {} },
  };
  const platform = browserPlatform(fake);
  assert.ok(platform.locks);
  assert.equal(platform.broadcast('x').name, 'x');
  assert.equal(platform.formFactor, 'desktop');

  const bare = browserPlatform({ indexedDB: { open() {} }, IDBKeyRange: {}, navigator: {} });
  assert.equal(bare.locks, null);
  assert.equal(bare.broadcast, null);
  assert.equal(storeCapabilities(bare).concurrentSessions.available, false);
});
