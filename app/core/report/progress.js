/**
 * THE CLIENT PROGRESS REPORT — one client's history, projected into what the report SAYS.
 *
 * This module decides the content. It does not decide the file: nothing here writes, encodes, zips
 * or names an artefact, and `core/export/` remains the only export machinery in this application, by
 * an explicit decision recorded in its own header. A report goes in there; it is not built there.
 *
 * ## The three things it says, and the fourth it deliberately does not
 *
 *  1. **Trends over time** in the readings the coach actually captures — discovered from the client's
 *     own readings at runtime, never from a list typed here (`trends.js`).
 *  2. **Attendance and consistency** (`attendance.js`).
 *  3. **A plain-language summary** of what they worked on (`focus.js`, then `narrative.js`).
 *
 * And NOT a personal best. Bests were offered to the user and explicitly not chosen; an earlier
 * decision listing them is superseded. Nothing here takes a maximum, ranks a value against a
 * previous one, or crowns anything — and the reason is worth keeping: a best is the one number a
 * client cannot beat on a bad day, which turns a report meant to show movement into a standing
 * reproach. If a later step believes a best would improve the report, that is a finding to raise,
 * not a line to add.
 *
 * Also not here: raw repetition counts, sets, loads and rest — `participation.js` never carries them
 * in — and no clinical content of any kind. The default report needs no passphrase and has no
 * friction, because there is nothing in it that would justify either.
 *
 * ## PRIVACY IS STRUCTURAL, NOT EDITORIAL
 *
 * A session can carry several clients. This function is given one client's identity and their
 * history, and the FIRST thing it does is narrow that history to what is theirs — after which no
 * other client's name, identifier or count exists anywhere in the data the rest of the pipeline can
 * see. Nothing downstream filters, because there is nothing left to filter.
 *
 * {@link allTextIn} exists so a test can read every string the report carries — DISCOVERED by
 * walking the finished object rather than by listing the fields somebody remembered — and prove a
 * co-attendee reaches none of them.
 *
 * ## The API is this file, by path
 *
 * `index.js` beside it is the TEST entry point and nothing else. Directory-index resolution is a Node
 * convenience the browser does not have, so a caller importing the directory would pass every test
 * here and break the application. Import `core/report/report.js`.
 *
 * Pure. No clock, no store, no browser.
 */

import { projectAttendance } from './attendance.js';
import { projectFocus } from './focus.js';
import { projectNarrative } from './narrative.js';
import { clientIdOf, clientNameOf, narrowToClient } from './participation.js';
import { projectTrends } from './trends.js';

/**
 * @typedef {Object} ProgressReportInput
 * @property {unknown} [client] The client's own record, for their name. Envelope or bare.
 * @property {string} [client_id] Their identity. Taken from `client` when that is an envelope.
 * @property {unknown[]} [sessions] The sessions they were on, as the store hands them over.
 * @property {unknown[]} [performed] Their performed records.
 * @property {unknown[]} [readings] Their readings.
 * @property {unknown[]} [exercises] The exercise library, for movement names. Optional.
 */

/**
 * @typedef {Object} ProgressReport
 * @property {string|null} client_id
 * @property {string|null} client_name
 * @property {string} headline
 * @property {import('./attendance.js').Attendance} attendance
 * @property {import('./participation.js').ParticipationSession[]} sessions Her sessions, in time
 *   order, as the allowlist rebuilt them — the dates a chart plots attendance against. This is the
 *   one place a session reaches the finished report, which is why the allowlist is load-bearing on
 *   the artefact and not only on an intermediate value.
 * @property {import('./trends.js').Trend[]} trends One per reading kind this client has.
 * @property {import('./focus.js').Focus} focus What they worked on.
 * @property {import('./narrative.js').Narrative} summary The plain-language words.
 * @property {boolean} is_empty
 * @property {{sessions: number, performed: number, readings: number}} refused Records the narrowing
 *   would not accept because they are not this client's. Diagnostic, never shown to a client.
 */

/**
 * Project one client's history into their progress report.
 *
 * @param {ProgressReportInput} input
 * @returns {ProgressReport}
 */
export function projectProgressReport(input = {}) {
  const clientId = typeof input.client_id === 'string' && input.client_id.length > 0
    ? input.client_id
    : clientIdOf(input.client);

  // THE BOUNDARY. Everything below sees one client's facts and has no access to anybody else's.
  const participation = narrowToClient(clientId || '', {
    sessions: input.sessions,
    performed: input.performed,
    readings: input.readings,
  });

  const attendance = projectAttendance(participation.sessions);
  const trends = projectTrends(participation.readings);
  const focus = projectFocus(participation.performed, input.exercises);
  const clientName = clientNameOf(input.client);
  const summary = projectNarrative({ client_name: clientName, attendance, focus, trends });

  return {
    client_id: clientId,
    client_name: clientName,
    headline: summary.headline,
    attendance,
    sessions: participation.sessions,
    trends,
    focus,
    summary,
    is_empty: summary.is_empty,
    refused: participation.dropped,
  };
}

/**
 * Every string the report carries, found by WALKING it.
 *
 * The point is the walk. A hand-written list of the fields to check is a promise the next editor does
 * not know exists, and a privacy check reading a list that has fallen behind the object is a check
 * that passes while the leak sits in the field nobody added to the list. This finds a new field the
 * day it appears.
 *
 * Keys are collected as well as values: a leak can arrive as an identifier used as a map key just as
 * easily as it can arrive as a sentence.
 *
 * @param {unknown} value Any part of a report, or the whole of one.
 * @returns {string[]}
 */
export function allTextIn(value) {
  const found = [];
  walk(value, found, new Set());
  return found;
}

/**
 * The words a CLIENT reads — the headline and the summary's sentences, and nothing else.
 *
 * Separate from {@link allTextIn} on purpose: a privacy check must read both, and they fail
 * differently. An identifier reaching the data but never the page is a defect waiting to be
 * rendered; a name reaching the page is a disclosure that has already happened.
 *
 * @param {ProgressReport} report
 * @returns {string[]}
 */
export function renderedWords(report) {
  const summary = report?.summary;
  return [
    report?.headline,
    ...(Array.isArray(summary?.paragraphs) ? summary.paragraphs : []),
  ].filter((line) => typeof line === 'string' && line.length > 0);
}

/**
 * @param {unknown} value @param {string[]} found @param {Set<unknown>} seen
 */
function walk(value, found, seen) {
  if (typeof value === 'string') {
    found.push(value);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) walk(item, found, seen);
    return;
  }
  for (const [key, nested] of Object.entries(/** @type {Record<string, unknown>} */ (value))) {
    found.push(key);
    walk(nested, found, seen);
  }
}
