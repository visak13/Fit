/**
 * THE WHOLE REPORT — the three things it says, composed, and the fourth it does not.
 *
 * The parts are proved beside this file. What is proved HERE is that they compose into one document
 * with a client's name on it, that the composition is derivation and nothing else, and that a report
 * with nothing in it says so rather than drawing an empty page.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { allTextIn, projectProgressReport, renderedWords } from './progress.js';
import { HER, SESSIONS, aHistory, anEmptyHistory, stored, theSessions } from './testing.js';

test('THE THREE THINGS ARE ALL THERE, in one report', () => {
  const report = projectProgressReport(aHistory());

  // ONE — trends over time in the readings the coach actually captured.
  assert.deepEqual(report.trends.map((trend) => trend.kind),
    ['plank-hold', 'resting-heart-rate', 'farmers-carry-distance']);
  assert.deepEqual(report.trends.map((trend) => trend.point_count), [4, 2, 2]);

  // TWO — attendance and consistency, with the dates a chart plots them against.
  assert.equal(report.attendance.attended, 4);
  assert.equal(report.attendance.cadence, 'steady');
  assert.equal(report.sessions.length, 5, 'four that ran and one on the books');
  for (const session of report.sessions) {
    assert.deepEqual(Object.keys(session).sort(), ['at', 'attended', 'mode', 'session_id', 'status']);
  }

  // THREE — a plain-language summary of what she worked on.
  assert.equal(report.headline, `Progress report for ${HER.name}`);
  assert.ok(report.summary.paragraphs.some((paragraph) => paragraph.includes('You worked on core, pulling and pushing.')));
  assert.equal(report.is_empty, false);
});

test('the identity comes from the client record when it is not passed separately', () => {
  const report = projectProgressReport(aHistory({ client_id: undefined }));

  assert.equal(report.client_id, HER.id);
  assert.equal(report.client_name, HER.name);
  assert.equal(report.attendance.attended, 4, 'and the whole report follows from it');
});

test('A FIRST REPORT SAYS SO, rather than drawing an empty one', () => {
  const report = projectProgressReport(anEmptyHistory());

  assert.equal(report.is_empty, true);
  assert.deepEqual(report.trends, []);
  assert.equal(report.attendance.attended, 0);
  assert.deepEqual(renderedWords(report), [
    `Progress report for ${HER.name}`,
    'There is nothing recorded yet, so there is nothing to show in this report.',
  ]);
});

test('a client on the books who has not trained yet is not a client with nothing', () => {
  const booked = projectProgressReport(aHistory({
    sessions: [theSessions().find((record) => record.record_id === SESSIONS.ahead)],
    performed: [],
    readings: [],
  }));

  assert.equal(booked.attendance.attended, 0);
  assert.equal(booked.attendance.upcoming, 1);
  assert.ok(renderedWords(booked).some((line) => line.includes('You have sessions booked, and none has run yet.')));
});

test('NO FILE IS MADE HERE: the report is data, and nothing on it names an artefact', () => {
  const report = projectProgressReport(aHistory());
  const keys = allTextIn(report);

  for (const artefact of ['file_name', 'filename', 'mime', 'blob', 'csv', 'zip', 'sheet']) {
    assert.equal(keys.includes(artefact), false, `${artefact} belongs to core/export/, not here`);
  }
});

test('the refusals are reported as diagnostics, and are not part of what she reads', () => {
  const report = projectProgressReport(aHistory());

  assert.deepEqual(report.refused, { sessions: 0, performed: 1, readings: 1 });
  const words = renderedWords(report).join(' ');
  assert.equal(words.includes('refused'), false);
  assert.equal(words.includes('1'), true, 'numbers she does read are her own sessions and readings');
});

test('a caller handing over somebody else entirely gets a report about nobody', () => {
  const report = projectProgressReport({
    client: stored('99999999-9999-4999-8999-999999999999', { name: 'Someone Else', notes: '', active: true }),
    ...aHistory({ client: undefined, client_id: undefined }),
    client_id: '99999999-9999-4999-8999-999999999999',
  });

  assert.equal(report.attendance.attended, 0);
  assert.equal(report.is_empty, true);
  assert.ok(report.refused.sessions > 0, 'and it says it refused a history that was not theirs');
});

test('the walk finds every string, including the ones nested deep in a trend', () => {
  const report = projectProgressReport(aHistory());
  const text = allTextIn(report);

  assert.ok(text.includes('plank-hold'), 'a value deep inside the trends');
  assert.ok(text.includes('point_count'), 'and a key deep inside them');
  assert.ok(text.includes(HER.name));
  assert.ok(text.length > 40, `a real report was walked: ${text.length} strings`);
});

test('the walk survives a report that refers to itself', () => {
  const looped = { headline: 'a', nested: {} };
  looped.nested.back = looped;

  assert.deepEqual(allTextIn(looped).includes('a'), true);
});
