/**
 * THE INTENSITY PATTERN record — content, owned by the seed content contract §6.
 *
 * A pattern is a curve: the ordered intensity points the adapter shapes a session to, plus
 * the rule for mapping a curve of *k* points across a routine of *n* exercises.
 *
 * Patterns ship as DATA rather than as code precisely so the coach can add one, edit one or
 * delete one without the app being rebuilt, and so the admin reset restores exactly the
 * shipped set. That is why they are a record kind here at all.
 *
 * ## `R11` — a name that spells out a curve must tell the truth
 *
 * If the name contains two or more of the words `low`, `medium`, `high`, those words must
 * match the sequence exactly, in order and in count. A button labelled `low medium high low`
 * whose sequence is anything else is a lie on a control the coach presses in front of a
 * client. A name containing one intensity word or none is a descriptive label and is not
 * checked against the sequence.
 *
 * ## What is NOT validated here
 *
 * Whether a pattern is SERVABLE by a particular routine. A routine of eight or nine
 * exercises holds roughly three at each level, so a curve demanding more positions at one
 * level than the routine can supply cannot be filled exactly — and that is ordinary,
 * designed behaviour rather than a defect: the adapter substitutes down the ladder and says
 * so, in the coach's own terms.
 *
 * The shipped patterns are all demonstrably servable against the shipped routines. A pattern
 * the coach authors himself is under no such guarantee, so the session runner must never
 * assume it: it degrades honestly, telling him plainly which level ran short, rather than
 * silently substituting a different intensity or producing a shorter session than asked for.
 */

import { CODES, Collector } from '../issues.js';
import {
  checkContentKey, checkEnum, checkIsRecord, checkNoUnknownKeys, checkString, checkStringArray,
} from '../primitives.js';
import { INTENSITY_LEVELS, MAPPING_RULES, PROVENANCE } from '../vocabularies.js';
import { classifyLibraryKey } from './exercise.js';

/** @type {readonly string[]} */
export const INTENSITY_PATTERN_FIELDS = Object.freeze([
  'id', 'name', 'sequence', 'mapping_rule', 'description', 'provenance',
]);

/**
 * Validate one intensity pattern content record.
 * @param {unknown} pattern
 * @returns {import('../issues.js').ValidationResult}
 */
export function validateIntensityPattern(pattern) {
  const c = new Collector();
  if (!checkIsRecord(c, pattern)) return c.result();
  const p = /** @type {Record<string, any>} */ (pattern);

  checkNoUnknownKeys(c, p, INTENSITY_PATTERN_FIELDS, classifyLibraryKey);

  checkContentKey(c, 'id', p.id, { required: true });
  const nameOk = checkString(c, 'name', p.name, { required: true, min: 3, max: 60 });
  // A curve of two to eight points. The sequence may legitimately repeat a level
  // (`low medium high low`), so uniqueness is explicitly OFF.
  const sequenceOk = checkStringArray(c, 'sequence', p.sequence, {
    required: true, min: 2, max: 8, unique: false, allowed: INTENSITY_LEVELS,
  });
  checkEnum(c, 'mapping_rule', p.mapping_rule, MAPPING_RULES, { required: true });
  checkString(c, 'description', p.description, { required: true, min: 10, max: 300 });
  checkEnum(c, 'provenance', p.provenance, PROVENANCE, { required: true });

  if (nameOk && sequenceOk) checkNameMatchesSequence(c, p.name, p.sequence);

  return c.result();
}

/**
 * `R11`. Extract the intensity words from a name, in order; if there are two or more, they
 * must equal the sequence.
 * @param {Collector} c
 * @param {string} name
 * @param {string[]} sequence
 * @returns {boolean}
 */
export function checkNameMatchesSequence(c, name, sequence) {
  const spelled = (name.toLowerCase().match(/\b(low|medium|high)\b/g) || []);
  if (spelled.length < 2) return true; // a descriptive label, not a spelled-out curve
  if (spelled.length !== sequence.length || spelled.some((w, i) => w !== sequence[i])) {
    c.add('name', CODES.MISMATCH,
      `The name spells out "${spelled.join(' ')}" but the sequence is "${sequence.join(' ')}". A button must not misdescribe the curve it presses.`);
    return false;
  }
  return true;
}
