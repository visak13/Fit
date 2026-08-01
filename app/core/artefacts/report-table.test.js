/**
 * THE PROGRESS REPORT'S LAYOUT, HELD TO WHAT IT PROMISED.
 *
 * The tests that matter here are the ones that would catch this module starting to have OPINIONS:
 * re-wording a sentence, computing a statistic of its own, or carrying a field the report package
 * deliberately kept out. The leak proof lives in `export-privacy.test.js` beside this, because it is
 * about the finished bytes rather than about the layout.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { projectProgressReport, renderedWords } from '../report/report.js';
import { aHistory, anEmptyHistory, HER, SESSIONS, WHEN } from '../report/testing.js';
import { readTable } from '../export/export.js';
import {
  AN_UNNAMED_CLIENT, progressReportTable, progressReportTitle, SESSIONS_SECTION, SUMMARY_SECTION,
} from './report-table.js';

/** The report every test here lays out. */
const aReport = (over = {}) => projectProgressReport({ ...aHistory(), ...over });

/** Every cell of a table, flattened, as text. */
const cellsOf = (table) => table.rows.flat().map((cell) => String(cell));

test('the title names the client, because the title is also the file the coach hands them', () => {
  assert.equal(progressReportTitle(aReport()), `${HER.name} — progress`);
});

test('a report with no client name still has a title, because the seam refuses an empty one', () => {
  const table = progressReportTable(projectProgressReport({ client_id: HER.id, sessions: [] }));
  assert.equal(table.title, `${AN_UNNAMED_CLIENT} — progress`);
  assert.doesNotThrow(() => readTable(table), 'the seam must accept it');
});

test('THE WORDS ARE THE REPORT\'S OWN, carried through and not re-worded', () => {
  const report = aReport();
  const table = progressReportTable(report);

  const summaryRows = table.rows.filter((row, index) => index < renderedWords(report).length);
  assert.deepEqual(
    summaryRows.map((row) => row[1]),
    renderedWords(report),
    'every summary line must be byte-identical to what the report package wrote',
  );
  assert.equal(summaryRows[0][0], SUMMARY_SECTION);
  assert.equal(summaryRows[1][0], '', 'a continuing row carries no repeated label');
});

test('the section label appears ONCE per block, so the artefact reads as a report and not as a key', () => {
  const table = progressReportTable(aReport());
  const labels = table.rows.map((row) => row[0]).filter((label) => label !== '');
  assert.equal(new Set(labels).size, labels.length, 'no section label may appear twice');
});

test('THE SESSION DATES ARE IN THE FILE — attendance made visible rather than only counted', () => {
  const table = progressReportTable(aReport());
  const cells = cellsOf(table);

  assert.ok(cells.includes(WHEN.one.slice(0, 10)), 'the first session date');
  assert.ok(cells.includes(WHEN.shared.slice(0, 10)), 'the shared session date — it is hers too');
  assert.ok(
    !cells.includes(WHEN.ahead.slice(0, 10)),
    'a session that has not run yet is not attendance',
  );
});

test('the readings are in the file as a SERIES, which is the thing a sentence cannot say', () => {
  const report = aReport();
  const table = progressReportTable(report);
  const cells = cellsOf(table);

  const trend = report.trends[0];
  assert.ok(trend, 'the fixture must produce at least one trend or this test proves nothing');
  assert.ok(cells.includes(trend.label), 'the trend is headed by the report\'s own label');

  for (const point of trend.points) {
    const line = cells.find((cell) => cell.startsWith(`${point.at.slice(0, 10)}: ${point.value}`));
    assert.ok(line, `the reading ${point.value} taken on ${point.at} must be in the file`);
    if (trend.unit_words) assert.ok(line.endsWith(trend.unit_words), 'in its own units');
  }
});

test('DATES ARE SLICED, NEVER RESOLVED — so the coach and his client read the same day off one file', () => {
  const table = progressReportTable(aReport());
  for (const cell of cellsOf(table)) {
    assert.ok(
      !/\d{1,2}\/\d{1,2}\/\d{4}/.test(cell),
      `"${cell}" looks like a calendar-resolved date, which depends on the device's time zone`,
    );
  }
});

test('NO IDENTIFIER REACHES THE FILE: they are this client\'s own, and still nobody\'s business', () => {
  const cells = cellsOf(progressReportTable(aReport())).join('\n');
  for (const [name, id] of Object.entries(SESSIONS)) {
    assert.ok(!cells.includes(id), `the ${name} session's identifier is in the exported table`);
  }
  assert.ok(!cells.includes(HER.id), 'her own identifier is not content either');
});

test('the narrowing\'s REFUSED count is not in the file — it is a number about other people\'s data', () => {
  const report = aReport();
  const total = report.refused.sessions + report.refused.performed + report.refused.readings;
  assert.ok(total > 0, 'the fixture must actually refuse something, or this test passes for free');

  const cells = cellsOf(progressReportTable(report)).join('\n');
  assert.ok(!cells.includes('refused'), 'the field name');
  assert.ok(
    !cells.includes(`refused: ${total}`),
    'or the count, which is a number about records belonging to people this client is not',
  );
});

test('a client with no history still exports a file, and it says so in the report\'s own words', () => {
  const report = projectProgressReport(anEmptyHistory());
  const table = progressReportTable(report);

  assert.doesNotThrow(() => readTable(table), 'an empty history is not an export failure');
  assert.deepEqual(table.rows.map((row) => row[1]), renderedWords(report));
});

test('THE SEAM ACCEPTS IT — the whole point of laying out into its contract rather than beside it', () => {
  const read = readTable(progressReportTable(aReport()));
  assert.ok(read.rows.length > 0);
  for (const row of read.rows) {
    assert.equal(row.length, 2, 'every row is the two columns the layout promises');
  }
});
