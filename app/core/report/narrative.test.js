/**
 * THE WORDS — asserted, because copy that is not asserted is copy that drifts.
 *
 * These are the sentences a client reads. The rules they are held to are not stylistic: no
 * repetition count, no personal best, no clinical language, no praise or reproach, no emoji, and
 * above all the singular voice, which is the privacy rule wearing its language.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { projectAttendance } from './attendance.js';
import { projectFocus } from './focus.js';
import {
  COMPANY_WORDS, MOVEMENTS_NAMED, projectNarrative, readDate, readDays, readList, readRange,
} from './narrative.js';
import { narrowToClient } from './participation.js';
import { projectTrends } from './trends.js';
import { HER, aClientRecordWithEverythingOnIt, aHistory, aLibrary } from './testing.js';

/** The whole narrative for the fixture history. */
function herSummary(over = {}) {
  const history = aHistory(over);
  const narrowed = narrowToClient(HER.id, history);
  return projectNarrative({
    client_name: HER.name,
    attendance: projectAttendance(narrowed.sessions),
    focus: projectFocus(narrowed.performed, history.exercises),
    trends: projectTrends(narrowed.readings),
  });
}

test('THE SUMMARY READS AS SENTENCES A PERSON WROTE', () => {
  const summary = herSummary();

  assert.equal(summary.headline, `Progress report for ${HER.name}`);
  assert.deepEqual(summary.paragraphs, [
    'This report covers 2 March to 13 April 2026. You trained 4 sessions over 6 weeks. '
      + 'One of them was cut short and recorded as far as it got.',
    'Your sessions came round steadily, about 2 weeks apart.',
    'You worked on core, pulling and pushing. '
      + 'The movements that came up most often were Dumbbell Row, Plank and Push Up.',
    'Your plank hold went from 40 to 65 seconds. '
      + 'Your resting heart rate went from 62 to 58 beats per minute. '
      + 'Your farmers carry distance went from 30 to 42.',
  ]);
});

test('THE VOICE IS SINGULAR: not one word that implies anybody else was there', () => {
  const words = herSummary().paragraphs.join(' ').toLowerCase();

  const found = COMPANY_WORDS.filter((word) => words.includes(word));
  assert.deepEqual(found, [], 'a plural here tells a client somebody else was in the session');

  // NON-VACUITY: the same scan run over a sentence that DOES imply company must say so.
  const leaky = 'You both held the plank well, and everyone finished together.'.toLowerCase();
  assert.ok(COMPANY_WORDS.some((word) => leaky.includes(word)), 'the scan can see company when it is there');
});

test('NO REPETITION COUNT, NO LOAD, NO BEST reaches a sentence', () => {
  const words = herSummary().paragraphs.join(' ').toLowerCase();

  for (const forbidden of ['repetition', ' reps', 'sets', '20kg', 'kg', 'personal best', 'best', 'peak', 'highest']) {
    assert.equal(words.includes(forbidden), false, `"${forbidden}" has no place in this report`);
  }

  // NON-VACUITY: those words exist in the fixture's own records — they were carried nowhere.
  const raw = JSON.stringify(aHistory()).toLowerCase();
  assert.ok(raw.includes('repetitions') && raw.includes('20kg'),
    'the history really does hold the counts and the load that did not get through');
});

test('NO CLINICAL CONTENT, and none of the coach\'s own notes', () => {
  // The client record as he really keeps it: his reminder, his general notes, his sealed pointer.
  const summary = herSummary({ client: aClientRecordWithEverythingOnIt() });
  const words = summary.paragraphs.join(' ').toLowerCase();

  for (const forbidden of ['shoulder', 'knee', 'injur', 'condition', 'medical', 'clinical', 'folder 12', 'adaptation', 'hike', 'early sessions']) {
    assert.equal(words.includes(forbidden), false, `"${forbidden}" is not a thing this report says`);
  }
  assert.equal(summary.headline, `Progress report for ${HER.name}`, 'and their own name still is');

  // NON-VACUITY: every one of those words really is on the record that was handed in.
  const raw = JSON.stringify(aClientRecordWithEverythingOnIt()).toLowerCase();
  assert.ok(raw.includes('shoulder') && raw.includes('folder 12') && raw.includes('hike'));
});

test('NO EMOJI anywhere in the words', () => {
  for (const line of [herSummary().headline, ...herSummary().paragraphs]) {
    for (const character of line) {
      assert.ok(character.codePointAt(0) < 0x2190,
        `"${character}" is a symbol, and no user-facing string in this application carries one`);
    }
  }
});

test('AN EMPTY HISTORY SAYS SO, plainly, instead of drawing an empty report', () => {
  const summary = projectNarrative({
    client_name: HER.name,
    attendance: projectAttendance([]),
    focus: projectFocus([], aLibrary()),
    trends: [],
  });

  assert.equal(summary.is_empty, true);
  assert.deepEqual(summary.paragraphs, [
    'There is nothing recorded yet, so there is nothing to show in this report.',
  ]);
});

test('TOO EARLY TO SAY is said rather than a pattern being invented', () => {
  const summary = projectNarrative({
    client_name: HER.name,
    attendance: projectAttendance([
      { at: '2026-03-02T09:00:00.000Z', status: 'completed', attended: true },
      { at: '2026-03-16T09:00:00.000Z', status: 'completed', attended: true },
    ]),
    focus: projectFocus([], aLibrary()),
    trends: [],
  });

  assert.ok(summary.paragraphs.includes('There are not enough sessions yet to describe a pattern.'));
});

test('an uneven history is described as uneven, without a word of reproach', () => {
  const summary = projectNarrative({
    client_name: null,
    attendance: projectAttendance([
      { at: '2026-03-02T09:00:00.000Z', status: 'completed', attended: true },
      { at: '2026-03-09T09:00:00.000Z', status: 'completed', attended: true },
      { at: '2026-03-16T09:00:00.000Z', status: 'completed', attended: true },
      { at: '2026-06-01T09:00:00.000Z', status: 'completed', attended: true },
    ]),
    focus: projectFocus([], aLibrary()),
    trends: [],
  });

  assert.equal(summary.headline, 'Progress report', 'a client with no name recorded still gets a report');
  assert.ok(summary.paragraphs.some((paragraph) => paragraph.includes(
    'Your sessions were spread unevenly: usually about 7 days apart, with a longest break of 3 months.',
  )));
  const words = summary.paragraphs.join(' ').toLowerCase();
  for (const judgement of ['should', 'must', 'poor', 'missed', 'behind', 'well done', 'great']) {
    assert.equal(words.includes(judgement), false);
  }
});

test('a single measurement is reported as one measurement', () => {
  const summary = projectNarrative({
    client_name: null,
    attendance: projectAttendance([{ at: '2026-03-02T09:00:00.000Z', status: 'completed', attended: true }]),
    focus: projectFocus([], aLibrary()),
    trends: projectTrends([{ kind: 'wall-sit', value: 30, unit: 'seconds', at: '2026-03-02T09:00:00.000Z', session_id: null }]),
  });

  assert.ok(summary.paragraphs.some((paragraph) => paragraph.includes(
    'Your wall sit was measured once, at 30 seconds.',
  )));
  assert.ok(summary.paragraphs.some((paragraph) => paragraph.includes('This report covers 2 March 2026.')));
});

test('a steady reading says it has stayed there', () => {
  const summary = projectNarrative({
    client_name: null,
    attendance: projectAttendance([]),
    focus: projectFocus([], aLibrary()),
    trends: projectTrends([
      { kind: 'resting-heart-rate', value: 58, unit: 'bpm', at: '2026-03-02T09:00:00.000Z', session_id: null },
      { kind: 'resting-heart-rate', value: 58, unit: 'bpm', at: '2026-03-16T09:00:00.000Z', session_id: null },
    ]),
  });

  assert.ok(summary.paragraphs.some((paragraph) => paragraph.includes(
    'Your resting heart rate has stayed at 58 beats per minute across 2 measurements.',
  )));
});

test('at most three movements are named, so a sentence stays a sentence', () => {
  const many = ['push-up', 'plank', 'dumbbell-row', 'wall-sit', 'dead-hang']
    .map((exerciseId, index) => ({ exercise_id: exerciseId, status: 'performed', session_id: `s-${index}` }));

  const summary = projectNarrative({
    client_name: null,
    attendance: projectAttendance([]),
    focus: projectFocus(many, aLibrary()),
    trends: [],
  });

  const sentence = summary.paragraphs.join(' ');
  assert.equal(MOVEMENTS_NAMED, 3);
  assert.ok(sentence.includes('The movements that came up most often were dead hang, Dumbbell Row and Plank.'));
  assert.equal(sentence.includes('wall sit'), false, 'the fourth and fifth are in the data, not in the sentence');
  assert.equal(sentence.includes('Push Up'), false);
});

test('dates and lists read the way a person writes them', () => {
  assert.equal(readDate('2026-07-24T09:00:00.000Z'), '24 July 2026');
  assert.equal(readDate('nonsense'), 'nonsense', 'an unreadable instant is shown, not invented');
  assert.equal(readRange('2026-03-02T09:00:00.000Z', '2026-04-13T09:00:00.000Z'), '2 March to 13 April 2026');
  assert.equal(readRange('2025-12-30T09:00:00.000Z', '2026-01-06T09:00:00.000Z'), '30 December 2025 to 6 January 2026');

  assert.equal(readDays(1), '1 day');
  assert.equal(readDays(9), '9 days');
  assert.equal(readDays(42), '6 weeks');
  assert.equal(readDays(91), '3 months');

  assert.equal(readList(['core']), 'core');
  assert.equal(readList(['core', 'pulling']), 'core and pulling');
  assert.equal(readList(['core', 'pulling', 'pushing']), 'core, pulling and pushing');
  assert.equal(readList([]), '');
});

test('the sentences and the paragraphs say the same thing', () => {
  const summary = herSummary();

  assert.ok(summary.sentences.length >= summary.paragraphs.length);
  assert.equal(summary.sentences.join(' '), summary.paragraphs.join(' '));
});
