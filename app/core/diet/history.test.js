/**
 * THE HISTORY — now against before, and the two awkward cases that will really happen.
 *
 * The load-bearing test in this file is the one that proves status is READ rather than WORKED OUT:
 * a plan whose dates have long since passed but whose status still says `current` is still the
 * current plan, because that is a fact the coach set. An implementation that quietly derived the
 * answer from `effective_to` would pass every other test here.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { DIET_PLAN_STATUSES } from '../model/vocabularies.js';
import { validateDietPlan } from '../model/entities/diet-plan.js';
import { projectDietHistory, summariseDietPlan } from './history.js';
import {
  CLIENT_A, CLIENT_B, PLAN_1, PLAN_2, PLAN_3, aDay, aDietPlan, aStoredDietPlan, anEntry,
} from './testing.js';

/** A stored plan with an identity of its own. */
const stored = (recordId, content) => aStoredDietPlan(content, { record_id: recordId });

const CURRENT = stored(PLAN_1, {
  name: 'Winter Cut',
  status: 'current',
  effective_from: '2026-06-01',
  effective_to: null,
});
const OLDER = stored(PLAN_2, {
  name: 'Spring Maintenance',
  status: 'past',
  effective_from: '2026-01-10',
  effective_to: '2026-03-31',
});
const NEWER_PAST = stored(PLAN_3, {
  name: 'Pre-holiday',
  status: 'past',
  effective_from: '2026-04-01',
  effective_to: '2026-05-31',
});

test('THE STATUSES ARE THE RECORD\'S OWN, not a set this file invented', () => {
  assert.deepEqual([...DIET_PLAN_STATUSES], ['draft', 'current', 'past']);
});

test('now against before: one current plan, the rest ordered behind it', () => {
  const history = projectDietHistory([OLDER, CURRENT, NEWER_PAST]);

  assert.equal(history.client_id, CLIENT_A);
  assert.equal(history.has_plans, true);
  assert.equal(history.plan_count, 3);
  assert.equal(history.current.name, 'Winter Cut');
  assert.deepEqual(history.past.map((plan) => plan.name), ['Pre-holiday', 'Spring Maintenance']);
  assert.deepEqual(history.problems, []);
  assert.equal(history.statement, 'Following "Winter Cut"; 2 earlier plans.');
});

test('STATUS IS A FACT HE SET: a plan whose dates ran out last year is still current', () => {
  const stale = stored(PLAN_1, {
    name: 'Still Followed',
    status: 'current',
    effective_from: '2025-01-01',
    effective_to: '2025-02-01',
  });
  const recent = stored(PLAN_2, {
    name: 'Finished Later',
    status: 'past',
    effective_from: '2026-05-01',
    effective_to: '2026-06-30',
  });

  const history = projectDietHistory([stale, recent]);

  // Anything reading the dates would call "Finished Later" the current plan. Nothing here does.
  assert.equal(history.current.name, 'Still Followed');
  assert.deepEqual(history.past.map((plan) => plan.name), ['Finished Later']);
  assert.deepEqual(history.problems, []);
});

test('a draft is neither current nor past, and is reported as its own thing', () => {
  const draft = stored(PLAN_3, { name: 'Typed Up Last Night', status: 'draft' });
  const history = projectDietHistory([CURRENT, draft]);

  assert.equal(history.current.name, 'Winter Cut');
  assert.deepEqual(history.drafts.map((plan) => plan.name), ['Typed Up Last Night']);
  assert.deepEqual(history.past, []);
  assert.deepEqual(history.counts, { current: 1, past: 0, draft: 1, unknown: 0 });
  assert.equal(history.statement, 'Following "Winter Cut"; 1 draft.');
});

// ── the case with no plans ────────────────────────────────────────────────────────────────────────

test('A CLIENT WITH NO PLANS gets a whole answer, every field present and empty', () => {
  const history = projectDietHistory([], { client_id: CLIENT_A });

  assert.equal(history.client_id, CLIENT_A);
  assert.equal(history.has_plans, false);
  assert.equal(history.plan_count, 0);
  assert.equal(history.current, null);
  assert.deepEqual(history.past, []);
  assert.deepEqual(history.drafts, []);
  assert.deepEqual(history.contested_current, []);
  assert.equal(history.has_contested_current, false);
  assert.deepEqual(history.counts, { current: 0, past: 0, draft: 0, unknown: 0 });
  assert.deepEqual(history.problems, [], 'having no plan yet is a state, not a problem');
  assert.equal(history.statement, 'No diet plan yet.');
});

test('nothing at all is the same answer, rather than a throw', () => {
  for (const nothing of [null, undefined, 'plans', {}]) {
    const history = projectDietHistory(nothing);
    assert.equal(history.has_plans, false);
    assert.equal(history.current, null);
    assert.equal(history.statement, 'No diet plan yet.');
  }
});

test('past plans with no current one say so rather than promoting the most recent', () => {
  const history = projectDietHistory([OLDER, NEWER_PAST]);

  assert.equal(history.current, null);
  assert.equal(history.statement, 'No current plan; 2 earlier plans.');
  assert.deepEqual(history.past.map((plan) => plan.name), ['Pre-holiday', 'Spring Maintenance']);
});

// ── the case with more than one current ───────────────────────────────────────────────────────────

test('MORE THAN ONE CURRENT IS SURFACED, and no winner is picked', () => {
  const second = stored(PLAN_2, {
    name: 'Also Current',
    status: 'current',
    effective_from: '2026-07-01',
    effective_to: null,
  });

  const history = projectDietHistory([CURRENT, second, OLDER]);

  assert.equal(history.current, null, 'not one of them, silently');
  assert.equal(history.has_contested_current, true);
  assert.deepEqual(history.contested_current.map((plan) => plan.name), ['Also Current', 'Winter Cut']);
  assert.equal(history.counts.current, 2);
  assert.deepEqual(history.problems, [
    '2 plans are all marked current: "Also Current", "Winter Cut". This app will not choose ' +
    'between them — mark the ones no longer followed as past.',
  ]);
  assert.equal(history.statement, '2 plans are marked current; 1 earlier plan.');
});

test('three claimants are all named — the list is what was found, not a sample', () => {
  const history = projectDietHistory([
    stored(PLAN_1, { name: 'One', status: 'current', effective_from: '2026-01-01' }),
    stored(PLAN_2, { name: 'Two', status: 'current', effective_from: '2026-02-01' }),
    stored(PLAN_3, { name: 'Three', status: 'current', effective_from: '2026-03-01' }),
  ]);

  assert.equal(history.contested_current.length, 3);
  assert.deepEqual(history.contested_current.map((plan) => plan.name), ['Three', 'Two', 'One']);
  assert.ok(history.problems[0].includes('"Three", "Two", "One"'));
});

// ── everything else the coach has to resolve ──────────────────────────────────────────────────────

test('a status the vocabulary does not list is named, never counted as past', () => {
  const strange = stored(PLAN_2, { name: 'Imported Somehow', status: 'archived' });
  const history = projectDietHistory([CURRENT, strange]);

  assert.deepEqual(history.unknown_status.map((plan) => plan.name), ['Imported Somehow']);
  assert.deepEqual(history.past, []);
  assert.equal(history.counts.unknown, 1);
  assert.deepEqual(history.problems, [
    '"Imported Somehow" carries a status this app does not recognise: "archived".',
  ]);
});

test('ANOTHER CLIENT\'S PLAN IS NAMED AND KEPT OUT — one client\'s facts stay theirs', () => {
  const someoneElse = stored(PLAN_2, { client_id: CLIENT_B, name: 'Not This Client', status: 'past' });
  const history = projectDietHistory([CURRENT, someoneElse]);

  assert.equal(history.client_id, CLIENT_A);
  assert.equal(history.plan_count, 1);
  assert.deepEqual(history.past, []);
  assert.deepEqual(history.problems, [
    '1 plan belongs to a different client and is not shown here.',
  ]);
  assert.ok(!JSON.stringify(history).includes('Not This Client'));
});

test('a deleted plan is not history — the coach deleted it', () => {
  const tombstone = aStoredDietPlan({ name: 'Deleted Plan', status: 'past' },
    { record_id: PLAN_2, deleted: true });

  const history = projectDietHistory([CURRENT, tombstone]);

  assert.equal(history.plan_count, 1);
  assert.deepEqual(history.past, []);
  assert.ok(!JSON.stringify(history).includes('Deleted Plan'));
});

test('the client the history is FOR can be stated, so an empty list still knows whose it is', () => {
  assert.equal(projectDietHistory([], { client_id: CLIENT_B }).client_id, CLIENT_B);
  assert.equal(projectDietHistory([CURRENT], { client_id: CLIENT_B }).plan_count, 0);
});

// ── ordering the past ─────────────────────────────────────────────────────────────────────────────

test('the past is ordered by when each plan STOPPED applying, most recent first', () => {
  const history = projectDietHistory([OLDER, NEWER_PAST]);
  assert.deepEqual(history.past.map((plan) => plan.effective_to), ['2026-05-31', '2026-03-31']);
});

test('a plan with no dates sorts last, and the order is stable rather than incidental', () => {
  const undated = stored(PLAN_1, { name: 'Undated', status: 'past', effective_from: null, effective_to: null });
  const forwards = projectDietHistory([undated, OLDER, NEWER_PAST]);
  const backwards = projectDietHistory([NEWER_PAST, OLDER, undated]);

  assert.deepEqual(forwards.past.map((plan) => plan.name), ['Pre-holiday', 'Spring Maintenance', 'Undated']);
  assert.deepEqual(forwards.past, backwards.past, 'the input order does not decide the output order');
});

// ── what each plan covered ────────────────────────────────────────────────────────────────────────

test('each plan says what it COVERED, in one line the coach can read', () => {
  const summary = summariseDietPlan(aStoredDietPlan());

  assert.deepEqual(summary.days.map((day) => day.short_name), ['Mon', 'Wed']);
  assert.equal(summary.day_count, 2);
  assert.equal(summary.is_full_week, false);
  assert.equal(summary.entry_count, 4);
  assert.equal(summary.item_count, 8);
  assert.equal(summary.first_time, '08:00');
  assert.equal(summary.last_time, '19:30');
  assert.equal(summary.covers, 'Mon, Wed — 08:00 to 19:30 — 4 entries');
});

test('a one-entry plan reads as one entry and one time, not a range of one', () => {
  const summary = summariseDietPlan(aDietPlan({
    days: [aDay(5, [anEntry({ time: '07:15' })])],
  }));

  assert.equal(summary.covers, 'Fri — 07:15 — 1 entry');
});

test('a plan with nothing in it says so rather than pretending to a shape', () => {
  assert.equal(summariseDietPlan({ days: [] }).covers, 'No days.');
});

test('the summary carries the plan\'s identity, its dates and who wrote it', () => {
  const summary = summariseDietPlan(stored(PLAN_3, {
    name: 'From The Nutritionist',
    source_note: 'Written by the nutritionist, transcribed 25 July.',
    notes: 'Drink water with every meal.',
    effective_from: '2026-07-01',
    effective_to: '2026-08-31',
    status: 'past',
  }));

  assert.equal(summary.plan_id, PLAN_3);
  assert.equal(summary.client_id, CLIENT_A);
  assert.equal(summary.name, 'From The Nutritionist');
  assert.equal(summary.status, 'past');
  assert.equal(summary.status_is_known, true);
  assert.equal(summary.is_current, false);
  assert.equal(summary.effective_from, '2026-07-01');
  assert.equal(summary.effective_to, '2026-08-31');
  assert.equal(summary.source_note, 'Written by the nutritionist, transcribed 25 July.');
  assert.equal(summary.notes, 'Drink water with every meal.');
});

test('the plans these tests are built from are records the model accepts', () => {
  for (const plan of [CURRENT, OLDER, NEWER_PAST]) {
    assert.equal(validateDietPlan(plan.content).ok, true, `${plan.content.name} is a valid record`);
  }
  assert.equal(validateDietPlan({ ...CURRENT.content, status: 'archived' }).ok, false);
});
