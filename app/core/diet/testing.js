/**
 * Test material for the diet suites — plans built as valid records, then bent one field at a time.
 *
 * Built on the model's own identities from `core/model/fixtures.js` rather than on new ones, so a
 * diet plan here belongs to the same synthetic client every other suite uses. The model has no diet
 * fixture of its own yet; these are it, and `chart.test.js` proves them against `validateDietPlan`
 * so a projection is never verified against a plan the record would refuse.
 *
 * NO REAL PERSON APPEARS HERE. The repository is public by an explicit decision.
 *
 * This file holds no assertions and nothing in the application imports it.
 */

import { CLIENT_A, CLIENT_B } from '../model/fixtures.js';

export { CLIENT_A, CLIENT_B };

/** Fixed record identities, so a test can name a plan without generating anything. */
export const PLAN_1 = '44444444-4444-4444-8444-444444444444';
export const PLAN_2 = '55555555-5555-4555-8555-555555555555';
export const PLAN_3 = '66666666-6666-4666-8666-666666666666';

/**
 * One timed entry.
 * @param {Record<string, any>} [over]
 */
export const anEntry = (over = {}) => ({
  time: '08:00',
  label: 'Breakfast',
  items: ['Oats with milk', 'Banana'],
  notes: null,
  ...over,
});

/**
 * One day of the repeating week.
 * @param {number} day @param {Record<string, any>[]} [entries]
 */
export const aDay = (day, entries = [anEntry()]) => ({ day, entries });

/**
 * A whole plan, as CONTENT — the shape inside the sync envelope.
 * @param {Record<string, any>} [over]
 */
export const aDietPlan = (over = {}) => ({
  client_id: CLIENT_A,
  name: 'Test Cutting Plan',
  status: 'current',
  effective_from: '2026-06-01',
  effective_to: null,
  days: [
    aDay(1, [
      anEntry(),
      anEntry({ time: '13:00', label: 'Lunch', items: ['Chicken', 'Rice', 'Salad'] }),
    ]),
    aDay(3, [
      anEntry({ time: '13:00', label: 'Lunch', items: ['Fish', 'Potatoes'] }),
      anEntry({ time: '19:30', label: 'Dinner', items: ['Soup'] }),
    ]),
  ],
  notes: null,
  source_note: null,
  ...over,
});

/**
 * A plan inside the sync envelope, as the store hands it back.
 * @param {Record<string, any>} [content] @param {Record<string, any>} [over]
 */
export const aStoredDietPlan = (content = {}, over = {}) => ({
  record_id: PLAN_1,
  type: 'diet-plan',
  rev: 1,
  device: 'test-laptop',
  deleted: false,
  deleted_at: null,
  created_at: '2026-07-25T09:00:00.000Z',
  updated_at: '2026-07-25T09:00:00.000Z',
  content: aDietPlan(content),
  ...over,
});
