/**
 * THE CLIENT record.
 *
 * A person the coach trains. This is the most carefully bounded record in the application,
 * and the boundaries are decisions rather than preferences.
 *
 * ## What is collected, and the far longer list of what is not
 *
 * A client carries a NAME, GENERAL NOTES, a plaintext NON-CLINICAL ADAPTATION FLAG, and an
 * encrypted CLINICAL NOTE with an encrypted REFERENCE POINTER and an encrypted POINTER
 * LABEL. That is the whole record.
 *
 * No email. No phone number. No address. No date of birth. No photograph. Those are not
 * merely omitted — {@link CODES.MINIMISATION} refuses them by name, because data that is
 * never collected cannot leak, and that is the strongest protection available to an
 * application with no backend, served from a public static site, storing to a personal
 * Drive. The refusal is a distinct code so that attempting to add one fails as the decision
 * it is rather than being absorbed as a typo.
 *
 * The coach also never adds a client as a Meet invitee, which is what keeps "no client email
 * is ever collected" true in practice rather than only in the schema.
 *
 * ## The clinical fields, and why there are three of them
 *
 * The app does NOT store medical history. It stores a short non-clinical flag — enough to
 * remind the coach that a client needs adaptation — and a POINTER to where the real detail
 * lives in his own private records. The clinical content itself is never typed into, stored
 * in, or synced by the app.
 *
 * The pointer's LABEL is encrypted alongside it, and that is the part which is easy to get
 * wrong: a label such as `cardiac-history.pdf` is itself health information. Encrypting what
 * a pointer points at while leaving its name in the clear protects nothing.
 *
 * `adaptation_flag` is deliberately PLAINTEXT and deliberately short. It is for what changes
 * the programme — *knee injury, avoid deep squats* — and never for a diagnosis, a medication
 * or a doctor's note. The hint that says so at the point of entry belongs to the interface;
 * what belongs here is the length bound that makes a transcribed case history physically not
 * fit.
 *
 * ## What losing the key costs
 *
 * Only the three clinical fields are ciphertext. A client's name, notes and adaptation flag,
 * and all of their sessions, readings, performed records and diet plans, are plaintext and
 * survive the loss of a key entirely. Field-level rather than whole-store encryption is what
 * caps the blast radius that way, and any framing of key loss must lead with it.
 */

import { CODES, Collector } from '../issues.js';
import { checkBoolean, checkIsRecord, checkNoUnknownKeys, checkString } from '../primitives.js';
import { MINIMISED_FIELD_TOKENS, matchToken } from '../vocabularies.js';
import { checkSealed, ENCRYPTED_FIELDS } from '../sealed.js';

/** @type {readonly string[]} */
export const CLIENT_FIELDS = Object.freeze([
  'name', 'notes', 'adaptation_flag',
  'clinical_note', 'clinical_reference', 'clinical_reference_label',
  'active',
]);

/**
 * The ciphertext-bearing fields of a client, re-exported from the single authoritative list
 * so nothing keeps a second copy.
 * @type {readonly string[]}
 */
export const CLIENT_ENCRYPTED_FIELDS = ENCRYPTED_FIELDS.client;

/**
 * Classify an unknown key on a client record: a field the app refuses to collect at all is
 * reported as a minimisation refusal, not as a typo.
 * @param {string} key
 * @returns {{code: string, message: string}|null}
 */
export function classifyClientKey(key) {
  const token = matchToken(key, MINIMISED_FIELD_TOKENS);
  if (!token) return null;
  return {
    code: CODES.MINIMISATION,
    message: `"${key}" is contact or identifying information the app does not collect. A client shares a name, notes and an optional adaptation flag — nothing else. Data that is never collected cannot leak.`,
  };
}

/**
 * Validate one client content record.
 * @param {unknown} client
 * @returns {import('../issues.js').ValidationResult}
 */
export function validateClient(client) {
  const c = new Collector();
  if (!checkIsRecord(c, client)) return c.result();
  const v = /** @type {Record<string, any>} */ (client);

  checkNoUnknownKeys(c, v, CLIENT_FIELDS, classifyClientKey);

  checkString(c, 'name', v.name, { required: true, min: 1, max: 80 });
  // General, non-clinical. Required as a key so nothing has to test for its absence; empty
  // is the ordinary case.
  checkString(c, 'notes', v.notes, { required: true, max: 4000, allowEmpty: true });
  // Short on purpose: a reminder that a client needs adaptation, never the condition itself.
  checkString(c, 'adaptation_flag', v.adaptation_flag, { max: 120 });
  checkBoolean(c, 'active', v.active, { required: true });

  for (const field of CLIENT_ENCRYPTED_FIELDS) checkSealed(c, field, v[field]);

  // A pointer with no label, or a label with no pointer, is a half-built reference. Both are
  // sealed, so this compares presence only — nothing here can read either one.
  const hasPointer = v.clinical_reference !== undefined && v.clinical_reference !== null;
  const hasLabel = v.clinical_reference_label !== undefined && v.clinical_reference_label !== null;
  if (hasPointer !== hasLabel) {
    c.add(hasPointer ? 'clinical_reference_label' : 'clinical_reference', CODES.MISMATCH,
      'A reference pointer and its label are stored together: both, or neither.');
  }

  return c.result();
}
