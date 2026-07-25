/**
 * THE PERFORMED RECORD — what one client actually did, for one exercise, in one session.
 *
 * ## Why it is per client rather than per session
 *
 * A session carries one to many clients against a single routine, and the coach may modify
 * an exercise for one tired client while the rest continue. So "what was performed" cannot
 * hang off the session: it hangs off the pair (session, client), one record per exercise.
 * That is also what makes progress views and exports strictly per client even when the
 * session was shared.
 *
 * ## What gets recorded is what was PERFORMED, never what was proposed
 *
 * The intensity adapter produces a proposal. A proposal is not history, is not written
 * anywhere, and never appears in a progress report. Only this record is history.
 *
 * ## THIS IS THE ONE PLACE A LOAD MAY BE RECORDED
 *
 * `observed_load` is the single load-bearing exception to a rule enforced everywhere else in
 * the model: no library record — exercise, routine, routine entry or intensity pattern —
 * may carry a load, weight or resistance field at all.
 *
 * The two halves of that rule are one idea, not a contradiction:
 *
 *  - A LIBRARY load would be a PRESCRIPTION. It would put the application in the position of
 *    making a training-load judgement about people it has never seen, which belongs to the
 *    certified coach who is also adapting to a client's history.
 *  - This load is an OBSERVATION. The coach watched a specific person lift a specific thing
 *    and wrote down what happened.
 *
 * It is free text (`20kg`, `red band`, `bodyweight`) rather than a number and a unit,
 * because the app has no business normalising what he observed into a scale it can compute
 * on. Nothing derives from it, nothing charts it, and above all nothing raises it: the app
 * never auto-progresses a routine, and it shows him the previous session — exercises, loads
 * and readings — precisely so that HE can decide whether anything goes up.
 */

import { CODES, Collector } from '../issues.js';
import {
  checkContentKey, checkEnum, checkInteger, checkIsRecord, checkNoUnknownKeys,
  checkRecordId, checkString, checkTimestamp, isAbsent,
} from '../primitives.js';
import { PERFORMED_STATUSES } from '../vocabularies.js';

/** @type {readonly string[]} */
export const PERFORMED_RECORD_FIELDS = Object.freeze([
  'session_id', 'client_id', 'exercise_id', 'position', 'status',
  'substituted_for_exercise_id',
  'sets_completed', 'repetitions', 'duration_seconds', 'rest_seconds',
  'observed_load', 'intensity_level', 'note', 'recorded_at',
]);

/**
 * Validate one performed record.
 * @param {unknown} performed
 * @returns {import('../issues.js').ValidationResult}
 */
export function validatePerformedRecord(performed) {
  const c = new Collector();
  if (!checkIsRecord(c, performed)) return c.result();
  const p = /** @type {Record<string, any>} */ (performed);

  checkNoUnknownKeys(c, p, PERFORMED_RECORD_FIELDS);

  checkRecordId(c, 'session_id', p.session_id, { required: true });
  checkRecordId(c, 'client_id', p.client_id, { required: true });
  // The exercise as it was ACTUALLY done — after any substitution.
  checkContentKey(c, 'exercise_id', p.exercise_id, { required: true });
  // Where it fell in the session as run, which is not necessarily where the routine put it:
  // the coach reorders, skips and repeats freely.
  checkInteger(c, 'position', p.position, { required: true, min: 0, max: 999 });
  const statusOk = checkEnum(c, 'status', p.status, PERFORMED_STATUSES, { required: true });
  checkContentKey(c, 'substituted_for_exercise_id', p.substituted_for_exercise_id);
  checkInteger(c, 'sets_completed', p.sets_completed, { min: 0, max: 50 });
  checkInteger(c, 'repetitions', p.repetitions, { min: 0, max: 1000 });
  checkInteger(c, 'duration_seconds', p.duration_seconds, { min: 0, max: 7200 });
  checkInteger(c, 'rest_seconds', p.rest_seconds, { min: 0, max: 3600 });
  // See the header. The one place a load may appear, and it is an observation.
  checkString(c, 'observed_load', p.observed_load, { max: 40 });
  checkEnum(c, 'intensity_level', p.intensity_level, ['low', 'medium', 'high']);
  checkString(c, 'note', p.note, { max: 500 });
  checkTimestamp(c, 'recorded_at', p.recorded_at, { required: true });

  const hasOriginal = !isAbsent(p.substituted_for_exercise_id);
  if (statusOk && p.status === 'substituted' && !hasOriginal) {
    c.add('substituted_for_exercise_id', CODES.REQUIRED,
      'A substitution records which exercise was replaced — otherwise the session history loses what was originally programmed.');
  }
  if (statusOk && p.status !== 'substituted' && hasOriginal) {
    c.add('substituted_for_exercise_id', CODES.MISMATCH,
      'Only a substituted entry names the exercise it replaced.');
  }
  if (statusOk && p.status === 'skipped') {
    for (const field of ['sets_completed', 'repetitions', 'duration_seconds', 'observed_load']) {
      if (!isAbsent(p[field])) {
        c.add(field, CODES.MISMATCH, 'A skipped exercise records no work.');
      }
    }
  }

  return c.result();
}
