/**
 * The ciphertext-bearing field set, and the shape a sealed value takes.
 *
 * ## What is encrypted, and what deliberately is not
 *
 * THREE fields in the entire application are ciphertext, all of them on the client record:
 *
 *   1. `clinical_note`             — the note itself
 *   2. `clinical_reference`        — the pointer to where the real detail lives
 *   3. `clinical_reference_label`  — the pointer's display label
 *
 * The third is the one that is easy to miss and matters most. A label such as
 * `cardiac-history.pdf` is itself health information: it discloses the condition without
 * anyone opening the file. A pointer whose label is in the clear defeats the whole point of
 * encrypting what it points at.
 *
 * Everything else — clients' names and general notes, the non-clinical adaptation flag,
 * routines, exercises, sessions, performed records, readings, in-session notes and diet
 * plans — is PLAINTEXT, deliberately, and that decision is load-bearing in the reassuring
 * direction: because field-level encryption is used rather than whole-store encryption, the
 * blast radius of losing a key is capped at the clinical notes alone. Everything else
 * survives. Any framing of key loss must lead with that.
 *
 * Diet plans are explicitly plaintext. That was ruled on directly: this practice's plans are
 * a food chart by day and hour, they carry no encryption, no sensitivity flag and no export
 * gating, and a diet export is always openable.
 *
 * ## What this module is NOT
 *
 * It declares the SET and the SHAPE. It performs no cryptography, holds no key, and knows
 * nothing about how a value is sealed or opened. A later step owns all of that: key
 * generation, the multi-slot envelope, adopting an existing envelope before writing, and the
 * refusal to create a clinical note on a device that has never synced. The record model and
 * the local store stay equally innocent of it — they move sealed values around without ever
 * being able to read one.
 *
 * The sealing scheme those steps will implement is recorded here so the shape is not
 * re-derived later: native browser cryptography only, one random data key, authenticated
 * encryption with a fresh random initialisation vector per value, and the record identity
 * plus schema version bound in as additional authenticated data so a sealed value cannot be
 * lifted from one record onto another.
 */

import { CODES } from './issues.js';
import { isPlainObject, isAbsent } from './primitives.js';

/** Current sealed-value scheme. Bumped only when the wire shape itself changes. */
export const SEALED_SCHEME = 1;

/** The keys a sealed value carries, and nothing else. @type {readonly string[]} */
export const SEALED_FIELDS = Object.freeze(['scheme', 'iv', 'ct']);

/**
 * The ciphertext-bearing fields, per record type.
 *
 * This is the authoritative list. Anything that decides what may leave the device — an
 * export whitelist, a sync payload builder, a backup writer — reads it from here rather than
 * keeping its own copy, because two copies of a list like this drift and the drift is silent.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const ENCRYPTED_FIELDS = Object.freeze({
  client: Object.freeze(['clinical_note', 'clinical_reference', 'clinical_reference_label']),
});

/**
 * Every ciphertext-bearing field name across all record types, flattened.
 * @type {readonly string[]}
 */
export const ALL_ENCRYPTED_FIELD_NAMES = Object.freeze(
  [...new Set(Object.values(ENCRYPTED_FIELDS).flat())],
);

/**
 * The ciphertext-bearing fields of one record type. Empty for every type but `client`.
 * @param {string} type A record type from `vocabularies.RECORD_TYPES`.
 * @returns {readonly string[]}
 */
export function encryptedFieldsFor(type) {
  return ENCRYPTED_FIELDS[type] || Object.freeze([]);
}

/**
 * A sealed value: an opaque envelope this layer can carry but never read.
 *
 * @typedef {Object} SealedValue
 * @property {number} scheme Sealing scheme, currently {@link SEALED_SCHEME}.
 * @property {string} iv     Base64 initialisation vector, fresh and random per sealing.
 * @property {string} ct     Base64 ciphertext, including the authentication tag.
 */

/** Base64, standard alphabet, optional padding. */
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * True when the value has the shape of a sealed value. Says nothing about whether it would
 * actually decrypt — that is not knowable here and is not this layer's business.
 * @param {unknown} value
 * @returns {value is SealedValue}
 */
export function isSealed(value) {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== SEALED_FIELDS.length) return false;
  if (!SEALED_FIELDS.every((k) => keys.includes(k))) return false;
  if (value.scheme !== SEALED_SCHEME) return false;
  if (typeof value.iv !== 'string' || !BASE64_PATTERN.test(value.iv)) return false;
  if (typeof value.ct !== 'string' || !BASE64_PATTERN.test(value.ct)) return false;
  return true;
}

/**
 * Validate a ciphertext-bearing field.
 *
 * `null` is always allowed and means "the coach recorded nothing here" — most clients have
 * no clinical note at all, and an absent note must not be represented as an encryption of
 * the empty string.
 *
 * A readable string in one of these fields is refused with its OWN code
 * (`PLAINTEXT_IN_SEALED_FIELD`) rather than a generic type error, because it is the exact
 * failure this field set exists to prevent: clinical text reaching the store, the Drive copy
 * and the backups in the clear.
 *
 * @param {import('./issues.js').Collector} c
 * @param {string} path
 * @param {unknown} value
 * @returns {boolean}
 */
export function checkSealed(c, path, value) {
  if (isAbsent(value)) return true;
  if (typeof value === 'string') {
    c.add(path, CODES.PLAINTEXT_IN_SEALED_FIELD,
      'This field must be sealed before it is stored. Clinical detail is never written in the clear.');
    return false;
  }
  if (!isSealed(value)) {
    c.add(path, CODES.NOT_SEALED,
      `Expected a sealed value of the form { scheme: ${SEALED_SCHEME}, iv, ct }.`);
    return false;
  }
  return true;
}

/**
 * A copy of `content` with every ciphertext-bearing field removed.
 *
 * This is the one-line serialiser change that keeps clinical material out of a payload by
 * DEFAULT: an export, a share or a client-facing artefact calls this and cannot forget a
 * field, because the field list lives with the definition rather than at each call site.
 *
 * Removal, not blanking: an absent key is unambiguous, whereas a null one invites a later
 * reader to wonder whether the note was empty or withheld.
 *
 * @param {string} type Record type.
 * @param {Record<string, unknown>} content
 * @returns {Record<string, unknown>} A new object; the input is not mutated.
 */
export function withoutEncryptedFields(type, content) {
  const drop = encryptedFieldsFor(type);
  if (!isPlainObject(content) || drop.length === 0) return { ...content };
  const out = {};
  for (const [k, v] of Object.entries(content)) {
    if (!drop.includes(k)) out[k] = v;
  }
  return out;
}

/**
 * True when this record carries at least one sealed value.
 *
 * Used by the export checklist: the item covering clinical notes is the only one that ever
 * asks for a passphrase, and it should only be offered when there is in fact something
 * sealed to include.
 *
 * @param {string} type
 * @param {Record<string, unknown>} content
 * @returns {boolean}
 */
export function carriesSealedValues(type, content) {
  if (!isPlainObject(content)) return false;
  return encryptedFieldsFor(type).some((f) => isSealed(content[f]));
}
