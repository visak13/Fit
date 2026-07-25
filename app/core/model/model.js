/**
 * THE RECORD MODEL — the one place the shape of stored data is defined.
 *
 * Plain, dependency-free ECMAScript modules. No framework, no bundler, no build step, no
 * third-party package; types are expressed in documentation comments so nothing here
 * presumes compilation. Whatever front-end stack is chosen later must be able to adopt this
 * core unchanged — that is the constraint this package is written to, and it is why the test
 * gate runs on the runtime's own test runner with nothing installed.
 *
 * Start at `MODEL.md` in the application root for the written contract. This file is the
 * entry point for code.
 *
 * ```js
 * import { createEnvelope, validateRecord } from './core/model/model.js';
 *
 * const record = createEnvelope({
 *   type: 'client',
 *   device: 'coach-laptop',
 *   content: { name: 'A. Client', notes: '', active: true },
 * });
 * const result = validateRecord(record);   // { ok, issues }
 * ```
 */

import { CODES, Collector, mergeResults } from './issues.js';
import { validateEnvelope } from './envelope.js';
import { validatorFor } from './entities/index.js';

export * from './issues.js';
export * from './primitives.js';
export * from './vocabularies.js';
export * from './sealed.js';
export * from './envelope.js';
export * from './referential.js';
export * from './entities/index.js';

/**
 * Validate a stored record end to end: the envelope, then its content against the validator
 * for its declared type.
 *
 * Content is NOT validated when the record is a tombstone, because a tombstone deliberately
 * carries none.
 *
 * @param {unknown} record An envelope, as produced by `createEnvelope`.
 * @returns {import('./issues.js').ValidationResult}
 */
export function validateRecord(record) {
  const envelopeResult = validateEnvelope(record);
  const e = /** @type {any} */ (record);
  if (!envelopeResult.ok || e?.deleted === true) return envelopeResult;

  const validate = validatorFor(e.type);
  if (!validate) {
    const c = new Collector();
    c.add('type', CODES.ENUM, `No validator is registered for record type "${e.type}".`);
    return c.result();
  }
  const contentResult = validate(e.content);
  return mergeResults(envelopeResult, {
    ok: contentResult.ok,
    issues: contentResult.issues.map((i) => ({ ...i, path: i.path ? `content.${i.path}` : 'content' })),
  });
}

/**
 * Validate many records, returning one result per record alongside the record.
 * @param {unknown[]} records
 * @returns {Array<{record: unknown, result: import('./issues.js').ValidationResult}>}
 */
export function validateRecords(records) {
  return records.map((record) => ({ record, result: validateRecord(record) }));
}
