/**
 * Test material for the session suites: a store with a library and a roster already in it.
 *
 * Written as builders on top of the store's own doubles rather than as a second set of fakes. A
 * session test that mocked the store would prove the projection against a store that does not
 * exist; these run against the same in-memory database, lock manager and message bus everything
 * else in this build is verified on.
 *
 * NO REAL PERSON APPEARS HERE. The repository is public by an explicit decision.
 *
 * This file holds no assertions and nothing in the application imports it.
 */

import { anExercise, aRoutine, aClient, aTimedExercise } from '../model/fixtures.js';
import { openLocalStore } from '../store/store.js';
import { createLaptop, createTwoWindowLaptop } from '../store/testing/platform-double.js';

/** Fixed instants, so a fixture is byte-identical on every run. */
export const T = Object.freeze({
  plan: '2026-07-25T08:00:00.000Z',
  start: '2026-07-25T09:00:00.000Z',
  one: '2026-07-25T09:05:00.000Z',
  two: '2026-07-25T09:12:00.000Z',
  three: '2026-07-25T09:20:00.000Z',
  four: '2026-07-25T09:28:00.000Z',
  cut: '2026-07-25T09:30:00.000Z',
  back: '2026-07-25T10:00:00.000Z',
  end: '2026-07-25T10:20:00.000Z',
});

/** The exercises the fixture routine names, plus one it does not — the substitution pool. */
export const EXERCISES = Object.freeze({
  push: 'test-push-up',
  plank: 'test-plank',
  row: 'test-row',
  spare: 'test-spare-hold',
});

/**
 * A routine of three exercises, in a declared order that the coach is free to ignore.
 * @param {Record<string, any>} [over]
 */
export const aThreeEntryRoutine = (over = {}) => aRoutine({
  id: 'test-full-session',
  name: 'Test Full Session',
  entries: [
    { exercise_id: EXERCISES.push, sets: 3, repetitions: 12 },
    { exercise_id: EXERCISES.plank, sets: 3, duration_seconds: 40 },
    { exercise_id: EXERCISES.row, sets: 4, repetitions: 10 },
  ],
  ...over,
});

/**
 * A store on a fresh laptop, with the library and a roster written in.
 *
 * @param {{clients?: number, device?: string}} [options]
 * @returns {Promise<{store: any, world: any, routine: any, clientIds: string[]}>}
 */
export async function aFurnishedStore(options = {}) {
  const { world, platform } = createLaptop();
  const store = await openLocalStore({ platform, device: options.device || 'coach-laptop' });
  const furnished = await furnish(store, options.clients ?? 1);
  // `platform` is returned so a test can open a SECOND store on the same database after closing
  // the first — which is how an interruption is simulated.
  return { store, world, platform, ...furnished };
}

/**
 * TWO windows of one laptop, sharing one database — the genuine concurrent case.
 * @param {{clients?: number}} [options]
 */
export async function aTwoWindowStore(options = {}) {
  const { world, a, b } = createTwoWindowLaptop();
  const storeA = await openLocalStore({ platform: a, device: 'coach-laptop' });
  const storeB = await openLocalStore({ platform: b, device: 'coach-laptop' });
  const furnished = await furnish(storeA, options.clients ?? 2);
  return { world, storeA, storeB, ...furnished };
}

/**
 * Write the library and the roster into a store.
 * @param {any} store @param {number} clients
 */
async function furnish(store, clients) {
  await store.create('exercise', anExercise({ id: EXERCISES.push }));
  await store.create('exercise', aTimedExercise({ id: EXERCISES.plank }));
  await store.create('exercise', anExercise({
    id: EXERCISES.row, name: 'Test Row', movement_pattern: 'horizontal-pull',
    primary_muscles: ['lats'], secondary_muscles: ['biceps'], equipment: ['dumbbell'],
  }));
  // Deliberately unreferenced by the routine: the surplus IS the substitution pool.
  await store.create('exercise', anExercise({
    id: EXERCISES.spare, name: 'Test Spare Hold', movement_pattern: 'isometric-hold',
    primary_muscles: ['abdominals'], secondary_muscles: [], equipment: ['mat'],
  }));

  const routine = await store.create('routine', aThreeEntryRoutine());

  const clientIds = [];
  for (let i = 0; i < clients; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const record = await store.create('client', aClient({ name: `Test Client ${'ABCDEFGH'[i]}` }));
    clientIds.push(record.record_id);
  }

  return { routine, clientIds };
}
