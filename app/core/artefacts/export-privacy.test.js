/**
 * A CLIENT'S OWN EXPORT NEVER REVEALS THAT ANYBODY ELSE WAS THERE — proven on the BYTES.
 *
 * ## Why this suite exists next to the report package's own privacy suite
 *
 * `core/report/privacy.test.js` proves the boundary holds in the REPORT — an object. This one proves
 * it holds in the ARTEFACT: the actual bytes of the actual workbook, and the actual text of the
 * actual separated-values file, which is what leaves the device and reaches a client's phone. Those
 * are different claims. A guard bound to an intermediate value cannot see a leak class that enters
 * downstream, and the whole reason this build keeps meeting that failure is that the intermediate
 * check looks exactly as green as the real one.
 *
 * ## THE ORDER OF THE ASSERTIONS IS DELIBERATE
 *
 * The leak assertion comes FIRST in every test here, before any count or shape check. An earlier
 * tally that fails shadows the load-bearing assertion, and the probe then proves the wrong thing
 * went red.
 *
 * ## AND THE SCAN IS PROVED TO WORK BEFORE ITS SILENCE IS BELIEVED
 *
 * A sweep whose entire output is an absence produces exactly the same result when it is broken. So
 * the same scan, over the same kind of artefact, is required to FIND the leak when the leak is
 * deliberately reintroduced — and the assertion names WHICH value it found, so a red caused by
 * something unrelated cannot be read as the probe succeeding.
 *
 * The fixture's co-attendee is called Bergamot Whitfield and carries the disclosure in four
 * independent ways: the roster, the session-wide summary that names them, the routine the coach
 * named after the pair, and their own in-session note. All four are looked for.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { projectProgressReport } from '../report/report.js';
import {
  aHistory, narrowSessionsWithTheAllowlistWidened, SESSIONS, THE_OTHER_CLIENT,
} from '../report/testing.js';
import { tableToSeparatedValues, tableToWorkbook } from '../export/export.js';
import { readZip } from '../export/testing.js';
import { progressReportTable } from './report-table.js';

/**
 * EVERY CARRIER OF THE DISCLOSURE, as data rather than as four separate assertions — so one list
 * covers both the clean case and the probe, and neither can drift away from the other.
 */
const CARRIERS = Object.freeze({
  name: THE_OTHER_CLIENT.name,
  identifier: THE_OTHER_CLIENT.id,
  routine_named_after_the_pair: THE_OTHER_CLIENT.routine_id,
  session_wide_summary: THE_OTHER_CLIENT.session_summary,
  their_own_note: THE_OTHER_CLIENT.note,
});

/**
 * EVERYTHING READABLE IN THE FINISHED FILE.
 *
 * Three readings of the same artefact, because a leak does not have to arrive in the cell the reader
 * was looking at:
 *
 *  1. every part of the workbook, unpacked — the shared strings, the sheet, and the metadata;
 *  2. the whole archive as raw bytes read as text, which catches anything outside a part this
 *     unpacker knows about;
 *  3. the separated-values file, which is the other artefact the seam writes.
 *
 * The third exists because the two writers are separate code paths, and a boundary proven on one of
 * them is a boundary proven on one of them.
 */
function everythingIn(table) {
  const bytes = tableToWorkbook(table);
  const parts = readZip(bytes).map((entry) => `${entry.name}\n${entry.text}`);
  const raw = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');

  return [...parts, raw, tableToSeparatedValues(table)].join('\n');
}

/**
 * Which carriers are present in a finished artefact. Named rather than counted: a probe that reports
 * "1 leak" cannot tell you the red came from the rule it was probing.
 *
 * @returns {string[]} the KEYS of {@link CARRIERS} found.
 */
function carriersIn(everything) {
  return Object.entries(CARRIERS)
    .filter(([, value]) => everything.includes(value))
    .map(([carrier]) => carrier);
}

/** The report as the application builds it, from a history that really does hold a shared session. */
const herReport = () => projectProgressReport(aHistory());

test('THE FIXTURE REALLY IS SHARED — checked first, or every absence below is an absence of nothing', () => {
  const shared = aHistory().sessions.find((record) => record.record_id === SESSIONS.shared);

  assert.ok(shared, 'the shared session must be in the history');
  assert.deepEqual(
    shared.content.client_ids.length, 2,
    'two clients on one session, which is the case the whole boundary exists for',
  );
  assert.ok(shared.content.summary.includes(THE_OTHER_CLIENT.name), 'and the summary names the other one');
});

test('NO CO-ATTENDEE REACHES THE FINISHED FILE — the load-bearing assertion, asserted first', () => {
  const everything = everythingIn(progressReportTable(herReport()));

  assert.deepEqual(
    carriersIn(everything), [],
    'a client\'s own export revealed that somebody else attended their session',
  );

  // Only now the shape checks, which must never run before the assertion above.
  assert.ok(everything.includes('Marlow'), 'her own name is hers and belongs in her own report');
});

test('THE PROBE: reintroduce the leak, and the SAME scan goes red on the SAME artefact', () => {
  const report = herReport();

  // The defect, exactly as `report/testing.js` writes it: the session rebuild "simplified" into a
  // spread, which is one line SHORTER than the code that ships.
  const leaked = {
    ...report,
    sessions: narrowSessionsWithTheAllowlistWidened(report.client_id, aHistory().sessions),
  };

  // ...and a layout that dumps a session row wholesale, which is the way a widened boundary would
  // actually reach an artefact from HERE. Written in the test rather than shipped, on purpose.
  const naive = {
    title: 'Probe',
    headings: ['', ''],
    rows: leaked.sessions.map((session) => ['Sessions', JSON.stringify(session)]),
  };

  const found = carriersIn(everythingIn(naive));

  assert.ok(
    found.includes('name') && found.includes('identifier')
      && found.includes('routine_named_after_the_pair') && found.includes('session_wide_summary'),
    `the probe found ${JSON.stringify(found)}. A scan that cannot see a leak of this exact shape is `
    + 'not evidence about the clean case, and the clean case is what the whole suite rests on.',
  );
});

test('AND THE REAL LAYOUT STAYS CLEAN ON THE SAME LEAKY INPUT — because it copies named fields', () => {
  const report = herReport();
  const leaked = {
    ...report,
    sessions: narrowSessionsWithTheAllowlistWidened(report.client_id, aHistory().sessions),
  };

  assert.deepEqual(
    carriersIn(everythingIn(progressReportTable(leaked))), [],
    'the layout must not be the thing that carries a widened boundary into the artefact',
  );

  assert.ok(
    leaked.sessions.some((session) => session.summary === THE_OTHER_CLIENT.session_summary),
    'the input really was leaky, or this test proved nothing',
  );
});

test('the shared session is still HER session: it is counted, it is just not attributed', () => {
  const everything = everythingIn(progressReportTable(herReport()));

  assert.deepEqual(carriersIn(everything), []);
  assert.ok(
    everything.includes('2026-04-13'),
    'the day the shared session ran is a fact about her attendance and belongs in her report',
  );
});

test('a plaintext scan is not trusted on its own: the archive is read as raw bytes too', () => {
  const table = progressReportTable(herReport());
  const bytes = tableToWorkbook(table);
  const raw = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');

  for (const [carrier, value] of Object.entries(CARRIERS)) {
    assert.ok(!raw.includes(value), `${carrier} is in the archive's bytes but not in any part it lists`);
  }
  assert.ok(raw.includes('Marlow'), 'and the raw reading really can see content, or it proves nothing');
});
