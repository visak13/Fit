/**
 * THE SHARED SESSION MUST NOT LEAK — proved on a session where somebody else genuinely was, and
 * proved to be capable of failing.
 *
 * ## Why an absence needs a probe
 *
 * "The other client's name is not in the report" is an ABSENCE, and an absence is the easiest thing
 * in the world to prove by accident. A scan pointed at the wrong object, a fixture where nobody else
 * ever attended, a comparison against a name that was never in the data — each of those reports
 * exactly what a clean report reports. So every claim here is made twice: once against the real
 * report, and once against the SAME report with the leak deliberately put back, where the identical
 * assertion must go red.
 *
 * And the red is attributed. `assert.throws` matches the other client's actual name in the failure
 * message, so a red arriving from some unrelated assertion cannot be read as the probe succeeding —
 * a red from the wrong rule is a finding, not a pass.
 *
 * ## What the leak would look like
 *
 * `testing.js` holds it: `narrowSessionsWithTheAllowlistWidened` is the session rebuild with the
 * allowlist replaced by a spread — one line SHORTER than the code that ships. That is the regression
 * this suite exists to catch, not an exotic one.
 *
 * ## Reading the WORDS, not only the fields
 *
 * A field-absence check would pass on a report whose summary sentence said "you and Bergamot both
 * held the plank". So the scan reads the rendered words, and separately walks every string anywhere
 * in the report — because an identifier sitting in the data waiting to be rendered is a disclosure
 * that has not happened yet.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { projectAttendance } from './attendance.js';
import { COMPANY_WORDS } from './narrative.js';
import { allTextIn, projectProgressReport, renderedWords } from './progress.js';
import {
  HER, MOVEMENTS, SESSIONS, THE_OTHER_CLIENT, aHistory, narrowSessionsWithTheAllowlistWidened,
  theSessions,
} from './testing.js';

/**
 * Everything about the other client that must not appear: their identity, their name, each word of
 * it, the routine the coach named after the pair, their own movement, and the sentences the coach
 * wrote about the session as a whole.
 * @returns {string[]}
 */
function everythingThatWouldBeALeak() {
  return [
    THE_OTHER_CLIENT.id,
    THE_OTHER_CLIENT.name,
    ...THE_OTHER_CLIENT.name.split(' '),
    THE_OTHER_CLIENT.routine_id,
    THE_OTHER_CLIENT.session_summary,
    THE_OTHER_CLIENT.note,
    MOVEMENTS.sled,
    'Sled Push',
  ];
}

/**
 * THE SCAN. Every string anywhere in the thing handed over, held against every form the disclosure
 * could take — matched case-insensitively, because a leak that arrives capitalised differently is
 * still a leak.
 *
 * @param {unknown} subject @returns {string[]} what was found, empty when nothing was
 */
function scanForTheOtherClient(subject) {
  const strings = allTextIn(subject).map((text) => text.toLowerCase());
  const found = [];
  for (const secret of everythingThatWouldBeALeak()) {
    const needle = secret.toLowerCase();
    if (strings.some((text) => text.includes(needle))) found.push(secret);
  }
  return found;
}

/**
 * The same claim as an assertion, so a probe can make it FAIL on purpose.
 *
 * The findings go INTO the message. A custom assertion message replaces the diff, so a message that
 * only said "something leaked" would produce a red that no probe could attribute — and an
 * unattributable red is exactly what the probe exists to rule out.
 */
function assertNothingAboutTheOtherClient(subject) {
  const found = scanForTheOtherClient(subject);
  assert.deepEqual(found, [],
    `a client's own report revealed somebody else who was in the session: ${found.join(' | ')}`);
}

const herReport = () => projectProgressReport(aHistory());

test('THE FIXTURE IS GENUINELY SHARED — this suite is not proving something about a solo history', () => {
  const shared = theSessions().find((record) => record.record_id === SESSIONS.shared);

  assert.equal(shared.content.client_ids.length, 2, 'two people really were on this session');
  assert.ok(shared.content.client_ids.includes(HER.id));
  assert.ok(shared.content.client_ids.includes(THE_OTHER_CLIENT.id));
  assert.ok(shared.content.summary.includes(THE_OTHER_CLIENT.name.split(' ')[0]),
    'and the session summary names the other one');
  assert.ok(shared.content.routine_id.includes('bergamot'),
    'and so does the routine the coach named after the pair');

  // The other client's own records are in the very arrays the caller hands over.
  const history = aHistory();
  assert.ok(history.performed.some((record) => record.content.client_id === THE_OTHER_CLIENT.id));
  assert.ok(history.readings.some((record) => record.content.client_id === THE_OTHER_CLIENT.id));
  assert.ok(history.notes.some((record) => record.content.text === THE_OTHER_CLIENT.note));
});

test('NOTHING ABOUT THE OTHER CLIENT REACHES THE REPORT — not a name, not an id, not a count', () => {
  const report = herReport();

  assertNothingAboutTheOtherClient(report);

  // The scan really did read a real report, and not an empty one.
  assert.ok(allTextIn(report).length > 40, 'there was a substantial report to scan');
  assert.equal(report.attendance.attended, 4, 'including the shared session, counted as one of hers');
  assert.ok(report.trends.length >= 3);
});

test('NOTHING ABOUT THE OTHER CLIENT REACHES THE WORDS SHE READS', () => {
  const report = herReport();
  const words = renderedWords(report);

  assert.ok(words.length >= 4, `there are real sentences to read: ${words.length}`);
  assertNothingAboutTheOtherClient(words);

  const joined = words.join(' ').toLowerCase();
  const plurals = COMPANY_WORDS.filter((word) => joined.includes(word));
  assert.deepEqual(plurals, [], 'and not a plural that implies anybody either');
});

test('NO COUNT OF ATTENDEES EXISTS TO BE LEAKED: the roster is not in the report in any form', () => {
  const report = herReport();
  const serialised = JSON.stringify(report);

  assert.equal(serialised.includes('client_ids'), false);
  assert.equal(serialised.includes(THE_OTHER_CLIENT.id), false);
  // A shared session is indistinguishable from a solo one in her report, which is the point.
  const soloOnly = projectProgressReport(aHistory({
    sessions: theSessions().map((record) => (record.record_id === SESSIONS.shared
      ? { ...record, content: { ...record.content, client_ids: [HER.id], summary: undefined, routine_id: 'test-full-body' } }
      : record)),
  }));
  assert.deepEqual(report.attendance, soloOnly.attendance,
    'her attendance reads identically whether or not anybody else was there');
  assert.deepEqual(report.sessions, soloOnly.sessions, 'and so do her sessions');
  assert.deepEqual(renderedWords(report), renderedWords(soloOnly),
    'and so do her words');
});

test('THE PROBE: with the leak put back, the SAME assertion goes red — and goes red ON THE LEAK', () => {
  // The regression: the session rebuild "simplified" into a spread. One line shorter than the code
  // that ships.
  const widened = narrowSessionsWithTheAllowlistWidened(HER.id, theSessions());
  const leaky = {
    ...herReport(),
    attendance: projectAttendance(widened),
    sessions: widened,
  };

  // FIRST: the leak really is present now — otherwise the red below could come from anywhere.
  const found = scanForTheOtherClient(leaky);
  assert.ok(found.includes(THE_OTHER_CLIENT.id), 'the widened rebuild carried the roster');
  assert.ok(found.includes(THE_OTHER_CLIENT.name), 'and the summary that names them');
  assert.ok(found.includes(THE_OTHER_CLIENT.routine_id), 'and the routine named after the pair');

  // THEN: the identical assertion that passes on the real report fails on this one, and the failure
  // NAMES the leak — so the red is attributed to the rule being probed and not to something else.
  assert.throws(
    () => assertNothingAboutTheOtherClient(leaky),
    (error) => {
      assert.ok(error instanceof assert.AssertionError, 'a failed assertion, not a crash');
      assert.ok(String(error.message).includes(THE_OTHER_CLIENT.name),
        `the red must name the leak; it said: ${error.message}`);
      assert.ok(String(error.message).includes(THE_OTHER_CLIENT.id));
      return true;
    },
  );

  // And the shipped code, run on the same input, does not do it.
  assertNothingAboutTheOtherClient(herReport());
});

test('THE PROBE, SECOND FORM: a leaked sentence is caught by the words scan too', () => {
  const report = herReport();
  const leakedWords = [
    ...renderedWords(report),
    `You and ${THE_OTHER_CLIENT.name} held the plank well, and everyone finished together.`,
  ];

  assert.throws(
    () => assertNothingAboutTheOtherClient(leakedWords),
    (error) => String(error.message).includes(THE_OTHER_CLIENT.name),
  );

  const joined = leakedWords.join(' ').toLowerCase();
  assert.ok(COMPANY_WORDS.some((word) => joined.includes(word)),
    'and the plural scan sees it independently');
});

test("the other client's WORK is not in her focus, her trends or her attendance", () => {
  const report = herReport();

  assert.equal(report.focus.movements.some((movement) => movement.exercise_id === MOVEMENTS.sled), false);
  const plank = report.trends.find((trend) => trend.kind === 'plank-hold');
  assert.deepEqual(plank.points.map((point) => point.value), [40, 48, 55, 65]);
  assert.equal(plank.points.some((point) => point.value === 90), false,
    'the 90 second plank was theirs, taken in the same session, and it is not hers');

  // The narrowing says out loud that it refused them.
  assert.equal(report.refused.performed, 1);
  assert.equal(report.refused.readings, 1);
});

test('a leak cannot arrive as a KEY either — the walk reads keys as well as values', () => {
  const asAKey = { [THE_OTHER_CLIENT.id]: { plank: 90 } };

  assert.ok(allTextIn(asAKey).includes(THE_OTHER_CLIENT.id), 'the walk sees keys');
  assert.throws(() => assertNothingAboutTheOtherClient(asAKey),
    (error) => String(error.message).includes(THE_OTHER_CLIENT.id));
});
