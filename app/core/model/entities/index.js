/**
 * The entity validator registry.
 *
 * One validator per record type, keyed by the same `type` the envelope carries, so a caller
 * holding an envelope never has to switch on the kind by hand.
 */

import { validateExercise } from './exercise.js';
import { validateRoutine } from './routine.js';
import { validateIntensityPattern } from './intensity-pattern.js';
import { validateClient } from './client.js';
import { validateSession } from './session.js';
import { validatePerformedRecord } from './performed-record.js';
import { validateReading } from './reading.js';
import { validateSessionNote } from './session-note.js';
import { validateDietPlan } from './diet-plan.js';

/**
 * @type {Readonly<Record<string, (content: unknown) => import('../issues.js').ValidationResult>>}
 */
export const VALIDATORS = Object.freeze({
  exercise: validateExercise,
  routine: validateRoutine,
  'intensity-pattern': validateIntensityPattern,
  client: validateClient,
  session: validateSession,
  'performed-record': validatePerformedRecord,
  reading: validateReading,
  'session-note': validateSessionNote,
  'diet-plan': validateDietPlan,
});

/**
 * The validator for a record type, or null if the type is unknown.
 * @param {string} type
 * @returns {((content: unknown) => import('../issues.js').ValidationResult)|null}
 */
export function validatorFor(type) {
  return VALIDATORS[type] || null;
}

export {
  validateExercise, validateRoutine, validateIntensityPattern, validateClient,
  validateSession, validatePerformedRecord, validateReading, validateSessionNote,
  validateDietPlan,
};

export {
  EXERCISE_FIELDS, SCALING_POINT_FIELDS, classifyLibraryKey, checkPrescription, checkScaling,
  scalingContractFindings,
} from './exercise.js';
export { ROUTINE_FIELDS, ROUTINE_ENTRY_FIELDS } from './routine.js';
export { INTENSITY_PATTERN_FIELDS } from './intensity-pattern.js';
export { CLIENT_FIELDS, CLIENT_ENCRYPTED_FIELDS, classifyClientKey } from './client.js';
export { SESSION_FIELDS, MAX_CLIENTS_PER_SESSION } from './session.js';
export { PERFORMED_RECORD_FIELDS } from './performed-record.js';
export { READING_FIELDS, unitForKind, isKnownReadingKind } from './reading.js';
export { SESSION_NOTE_FIELDS } from './session-note.js';
export { DIET_PLAN_FIELDS, DIET_DAY_FIELDS, DIET_ENTRY_FIELDS } from './diet-plan.js';
