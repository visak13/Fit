/**
 * THE REPORT PACKAGE API — start here. `index.js` beside it is the TEST entry point, not the API.
 *
 * Import this file BY PATH: `import { projectProgressReport } from './core/report/report.js'`.
 * Directory-index resolution is a Node convenience the browser does not have, so a caller that
 * imports the directory passes every test in this package and breaks the application — a failure
 * invisible to exactly the gate that would be run to find it.
 *
 * One pure projection, from a client's own history to what their progress report SAYS:
 *
 *   - {@link projectProgressReport} — trends in the readings the coach captures, attendance and
 *     consistency, and a plain-language summary of what they worked on. No repetition counts, no
 *     personal bests, no clinical content, and nothing about anybody else who was in the session.
 *
 * The parts, exported because a caller may want one without the whole:
 *
 *   - {@link narrowToClient} — THE PRIVACY BOUNDARY. A session is rebuilt out of an allowlist, so the
 *     roster, the session-wide summary and the routine name are never present rather than filtered.
 *   - {@link projectTrends} — one series per reading kind, DISCOVERED from the client's own readings.
 *   - {@link projectAttendance} — how many sessions, over what stretch, how evenly.
 *   - {@link projectFocus} — the movements and movement families, named and never counted.
 *   - {@link projectNarrative} — the sentences.
 *
 * And two readers a test or a renderer needs:
 *
 *   - {@link renderedWords} — the words a client actually sees.
 *   - {@link allTextIn} — every string anywhere in a report, found by walking it.
 *
 * This package writes no file and encodes no format. `core/export/` is deliberately the only export
 * machinery in this application; a report is content that goes into it.
 *
 * Nothing here draws, stores, reads a clock or touches a browser. A test drives every one of these
 * directly, with plain objects as the only input.
 */

export { projectProgressReport, allTextIn, renderedWords } from './progress.js';
export {
  narrowToClient, clientNameOf, clientIdOf,
  SESSION_FIELDS_CARRIED, PERFORMED_FIELDS_CARRIED, ATTENDED_STATUSES,
} from './participation.js';
export {
  projectTrends, readingKindsIn, knownReadingKinds, labelForKind, wordsForUnit, readValue,
  UNIT_WORDS,
} from './trends.js';
export {
  projectAttendance, daysBetween, intervalsBetween, middleOf, countByMonth,
  CADENCE_NEEDS, UNEVEN_MULTIPLE,
} from './attendance.js';
export {
  projectFocus, exerciseIndex, familyOf, readExerciseKey, PATTERN_FAMILIES, WORKED_STATUSES,
} from './focus.js';
export {
  projectNarrative, readDate, readRange, readDays, readList, COMPANY_WORDS, MOVEMENTS_NAMED,
} from './narrative.js';
export { contentOf, recordIdOf, isDeletedRecord, liveRecords } from './records.js';
