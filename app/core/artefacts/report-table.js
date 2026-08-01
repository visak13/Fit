/**
 * THE PROGRESS REPORT AS THE SEAM'S TABLE — the first of the three frictionless default exports.
 *
 * ## This file decides a LAYOUT. It does not decide CONTENT.
 *
 * Every word a client reads here was written by `core/report/`, and every number was derived there.
 * This module lays those out in the two-column shape the export seam takes and does nothing else: it
 * does not summarise, does not re-word, does not compute a statistic, and does not reach for a
 * record. If a sentence in the exported file is wrong, it is wrong in `narrative.js` and this file
 * carried it faithfully.
 *
 * The separation is not tidiness. The report package spent a whole action getting the privacy
 * boundary and the voice right — the singular "you", no repetition counts, no personal bests, no
 * clinical content — and a layout module that re-derived any of it would be a second opinion about
 * those rules, agreeing with the first until the day it did not.
 *
 * The import is BY PATH — `../report/report.js`, never `../report`. Directory-index resolution is a
 * Node convenience the browser does not have, so importing the directory passes every test in the
 * core gate and breaks the application: a failure invisible to exactly the gate that would be run to
 * find it.
 *
 * ## WHAT THE TABLE CARRIES THAT THE SENTENCES DO NOT
 *
 * The narrative already says how a reading has MOVED — "your resting heart rate has come down from
 * 78 to 71". What it cannot say in a sentence is the SERIES: the readings over time, one row each,
 * which is the first of the three things the report was defined to carry and the thing a client
 * looks at to see whether they are improving. So the trends arrive here twice on purpose, once as
 * the sentence the report wrote and once as the points it plotted, and neither is derived here.
 *
 * ## WHAT IT DELIBERATELY LEAVES OUT, AND WHY EACH ONE LOOKS HARMLESS
 *
 *  - **Identifiers.** `session_id` and `exercise_id` reach this module on the narrowed report and go
 *    no further. They are this client's own, so carrying them would not be a disclosure — it would
 *    be an internal key sitting in a file handed to somebody who cannot use it, and every value in
 *    an artefact that leaves the application is a value somebody may one day have to explain.
 *  - **`refused`.** The narrowing's diagnostic count of records that were not this client's. It is a
 *    number ABOUT other people's data, it is meaningful only to a developer, and a client reading
 *    "refused: 14" has been told something about the size of a practice they are not part of.
 *
 * Both are absences by construction rather than by filter: nothing below copies them.
 *
 * Pure. No clock, no store, no browser, no canvas.
 */

import { renderedWords } from '../report/report.js';

/**
 * What the label column says for a row that continues the section above it.
 *
 * An empty cell rather than a repeated label: a section name printed against every one of its rows
 * reads as a spreadsheet key, and the artefact is meant to read as a report.
 */
const CONTINUES = '';

/** The two column headings. The artefact is handed to a client, so neither is a machine's word. */
export const REPORT_HEADINGS = Object.freeze(['', '']);

/** What the summary block is called. */
export const SUMMARY_SECTION = 'Summary';

/** What the attendance block is called — his word for it, not "attendance rate". */
export const SESSIONS_SECTION = 'Sessions';

/** Said in place of a reading's date when the record carried no readable instant. */
export const UNDATED = 'Undated';

/** What a client's report is called, after their name. */
export const REPORT_TITLE_SUFFIX = 'progress';

/**
 * Said instead of a client's name when the report has none.
 *
 * Never an empty title: the seam refuses one, and it would refuse it at the moment the coach taps
 * Send with a client waiting.
 */
export const AN_UNNAMED_CLIENT = 'Client';

/**
 * The artefact's title, which the seam also uses as the file's name.
 *
 * The client is named first for the same reason the diet export names them first: it is what the
 * coach looks for when he finds the file again months later, and it is what a client should see on
 * a file that is about them.
 *
 * @param {{client_name?: string|null}} report
 * @returns {string}
 */
export function progressReportTitle(report) {
  const name = typeof report?.client_name === 'string' ? report.client_name.trim() : '';
  const named = name === '' ? AN_UNNAMED_CLIENT : name;
  return `${named} — ${REPORT_TITLE_SUFFIX}`;
}

/**
 * The progress report, laid out as the seam's table.
 *
 * @param {import('../report/progress.js').ProgressReport} report As `projectProgressReport` returns
 *   it. Already narrowed to one client — this module is not a second boundary and must never become
 *   one, because a second boundary is a second opinion about where the first one is.
 * @returns {{title: string, headings: string[], rows: (string|number)[][]}} The seam's own contract,
 *   passed to `tableToWorkbook`, `tableToSeparatedValues` or the picture surface unchanged.
 */
export function progressReportTable(report) {
  const rows = [];

  // The words, exactly as the report wrote them: the headline, then the paragraphs. `renderedWords`
  // is the report package's own reader for "what a client actually sees", so this cannot drift out
  // of step with the sentences the privacy suite reads.
  const words = renderedWords(report);
  words.forEach((line, index) => {
    rows.push([index === 0 ? SUMMARY_SECTION : CONTINUES, line]);
  });

  // The dates the sessions ran, which is the attendance half made visible rather than counted. A
  // client seeing the dates can check them against their own memory; a client seeing "12" cannot.
  const sessions = attendedDates(report);
  sessions.forEach((date, index) => {
    rows.push([index === 0 ? SESSIONS_SECTION : CONTINUES, date]);
  });

  // One block per reading kind, each headed by the kind's own label and carrying its points in time
  // order. The label and the unit words come off the trend; nothing here names a reading kind.
  for (const trend of trendsOf(report)) {
    const points = Array.isArray(trend?.points) ? trend.points : [];
    points.forEach((point, index) => {
      rows.push([
        index === 0 ? labelOf(trend) : CONTINUES,
        readingWords(point, trend),
      ]);
    });
  }

  return {
    title: progressReportTitle(report),
    headings: [...REPORT_HEADINGS],
    rows,
  };
}

/**
 * The dates this client's sessions actually ran, in time order.
 *
 * `attended` is the report's own judgement about whether a session happened, read rather than
 * re-decided here: `participation.js` sets it from the model's own started-session statuses, and a
 * second reading of "did this count" is a second answer waiting to disagree.
 *
 * @param {{sessions?: unknown}} report
 * @returns {string[]}
 */
function attendedDates(report) {
  const sessions = Array.isArray(report?.sessions) ? report.sessions : [];
  return sessions
    .filter((session) => session && session.attended === true)
    .map((session) => dayOf(session.at))
    .filter((day) => day !== null);
}

/**
 * A reading, as one line: the day it was taken and the value in its own units.
 *
 * @param {{at?: string|null, value?: unknown}} point
 * @param {{unit_words?: string}} trend
 * @returns {string}
 */
function readingWords(point, trend) {
  const day = dayOf(point?.at) ?? UNDATED;
  const unit = typeof trend?.unit_words === 'string' && trend.unit_words.length > 0
    ? ` ${trend.unit_words}`
    : '';
  return `${day}: ${point?.value}${unit}`;
}

/**
 * The day part of an instant, as the record itself wrote it.
 *
 * SLICED, never resolved through a calendar — the same discipline `attendance.js` holds, and for the
 * same reason: reading an instant through a calendar makes the exported file depend on the time zone
 * of the device that made it, so the coach and his client could read different dates off one
 * artefact.
 *
 * @param {unknown} instant
 * @returns {string|null}
 */
function dayOf(instant) {
  return typeof instant === 'string' && instant.length >= 10 ? instant.slice(0, 10) : null;
}

/** @param {{trends?: unknown}} report @returns {any[]} */
function trendsOf(report) {
  return Array.isArray(report?.trends) ? report.trends : [];
}

/**
 * What a trend's block is headed with — the report's own label for the kind, never a name invented
 * here. A kind the coach made up is labelled by the report as his own words; that is its decision.
 *
 * @param {{label?: unknown, kind?: unknown}} trend
 * @returns {string}
 */
function labelOf(trend) {
  if (typeof trend?.label === 'string' && trend.label.length > 0) return trend.label;
  return typeof trend?.kind === 'string' ? trend.kind : '';
}
