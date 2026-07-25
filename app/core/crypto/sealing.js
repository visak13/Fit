/**
 * SEALING RECORD FIELDS — deliberately narrow, and the narrowness is the point.
 *
 * ## What is encrypted
 *
 * Three fields in the entire application, all on the client record: the clinical note, its
 * reference pointer, and the pointer's DISPLAY LABEL. The third is the one that is easy to
 * miss and matters most — a label such as `cardiac-history.pdf` is itself health information,
 * disclosing the condition without anyone opening the file.
 *
 * Nothing else, ever. Clients' names and general notes, the non-clinical adaptation flag,
 * routines, sessions, readings, diets and exports all stay plaintext.
 *
 * ## Why narrow rather than encrypting the store
 *
 * It caps the blast radius of key loss at the notes alone. Everything else survives a lost
 * key, so the application stays usable and recoverable without one — and every framing of key
 * loss must lead with that, because the fear it answers is otherwise wildly out of proportion
 * to the facts. Worst case is one field per client, whose detail already lives outside the
 * application by design.
 *
 * ## The field list is not kept here
 *
 * It is read from the record model's own declaration. Two lists of what is secret WILL
 * diverge, and the divergence is silent: the day someone adds a fourth clinical field to the
 * model and not to this file is the day that field syncs in the clear and nothing complains.
 * One list, owned by the model, read by everyone.
 *
 * ## What binding the record identity buys
 *
 * Every sealing binds the record type, the record identifier, the field name and the scheme
 * version as additional authenticated data. A sealed value therefore opens ONLY in the exact
 * place it was written. Lifting one client's ciphertext into another client's record, or
 * moving a note into the label field of the same record, produces a value that fails to open
 * rather than one that opens somewhere it should not. Ciphertext without this is portable,
 * and portable ciphertext is how a note ends up attached to the wrong person.
 */

import { SEALED_SCHEME, encryptedFieldsFor, isSealed } from '../model/sealed.js';
import { bytesToText, fromBase64, open, seal, textToBytes, toBase64 } from './primitives.js';
import { CryptoInvalidRequest } from './errors.js';

/**
 * The separator between bound context parts.
 *
 * A null character, chosen because it cannot occur in a record type, a field name or an
 * identifier — so two different contexts can never encode to the same bytes and no part can
 * run into the next. It is written as an escape rather than typed literally, because an
 * invisible byte in source is a byte the next reader cannot see and will eventually "tidy".
 */
const CONTEXT_DELIMITER = '\u0000';

/**
 * The canonical form of the bound context.
 *
 * A single delimited string rather than a structured encoding, because it must be reproduced
 * byte-for-byte to open a value written years earlier. The delimiter is one that cannot occur
 * in a record type, a field name or an identifier, so two different contexts can never encode
 * to the same bytes.
 *
 * @param {{type: string, recordId: string, field: string}} ctx
 * @returns {Uint8Array}
 */
export function additionalDataFor({ type, recordId, field }) {
  requireText(type, 'record type');
  requireText(recordId, 'record id');
  requireText(field, 'field name');
  for (const part of [type, recordId, field]) {
    if (part.includes(CONTEXT_DELIMITER)) {
      throw new CryptoInvalidRequest('A bound context part may not contain a null character.');
    }
  }
  return textToBytes(
    ['fit/sealed/v' + SEALED_SCHEME, type, recordId, field].join(CONTEXT_DELIMITER));
}

/**
 * Seal one field's value.
 *
 * `null` in, `null` out, and that is not a shortcut. Most clients have no clinical note at
 * all, and an absent note must not be represented as an encryption of the empty string: doing
 * so would put a ciphertext on every client record, which tells a reader that this client has
 * a note when they do not.
 *
 * @param {CryptoKey} dataKey
 * @param {{type: string, recordId: string, field: string}} ctx
 * @param {string|null|undefined} plaintext
 * @returns {Promise<import('../model/sealed.js').SealedValue|null>}
 */
export async function sealField(dataKey, ctx, plaintext) {
  if (plaintext === null || plaintext === undefined) return null;
  if (typeof plaintext !== 'string') {
    throw new CryptoInvalidRequest(`${ctx.field} must be text or absent.`);
  }
  const { iv, ciphertext } = await seal(
    dataKey, textToBytes(plaintext), additionalDataFor(ctx));
  return { scheme: SEALED_SCHEME, iv: toBase64(iv), ct: toBase64(ciphertext) };
}

/**
 * Open one field's value.
 *
 * A failure here is the authentication working, not a bug: the value was altered, or it was
 * written under a different key, or it belongs to a different record. All three are things the
 * caller must be told about rather than shown an empty note for, so nothing is caught here.
 *
 * @param {CryptoKey} dataKey
 * @param {{type: string, recordId: string, field: string}} ctx
 * @param {import('../model/sealed.js').SealedValue|null|undefined} sealed
 * @returns {Promise<string|null>}
 */
export async function openField(dataKey, ctx, sealed) {
  if (sealed === null || sealed === undefined) return null;
  if (!isSealed(sealed)) {
    throw new CryptoInvalidRequest(`${ctx.field} does not hold a sealed value.`);
  }
  return bytesToText(await open(
    dataKey, fromBase64(sealed.iv), fromBase64(sealed.ct), additionalDataFor(ctx)));
}

/**
 * Seal every ciphertext-bearing field of a record's content.
 *
 * The record's own content is returned with those fields replaced and everything else
 * untouched, because the store, the outbox and the sync engine all move records around
 * without ever being able to read one — that separation only holds if sealing happens at the
 * edge, once, on the way in.
 *
 * @param {CryptoKey} dataKey
 * @param {{type: string, recordId: string}} ctx
 * @param {Record<string, unknown>} content
 * @returns {Promise<Record<string, unknown>>} A new object; the input is not mutated.
 */
export async function sealContent(dataKey, { type, recordId }, content) {
  const fields = encryptedFieldsFor(type);
  if (fields.length === 0) return { ...content };
  const out = { ...content };
  for (const field of fields) {
    const value = content[field];
    // Already sealed is left exactly as it is. Re-sealing would change the ciphertext of an
    // unchanged note on every save, which makes every sync a write and every diff a lie.
    if (isSealed(value)) continue;
    out[field] = await sealField(dataKey, { type, recordId, field }, /** @type {any} */ (value));
  }
  return out;
}

/**
 * Open every ciphertext-bearing field of a record's content.
 * @param {CryptoKey} dataKey
 * @param {{type: string, recordId: string}} ctx
 * @param {Record<string, unknown>} content
 * @returns {Promise<Record<string, unknown>>}
 */
export async function openContent(dataKey, { type, recordId }, content) {
  const fields = encryptedFieldsFor(type);
  if (fields.length === 0) return { ...content };
  const out = { ...content };
  for (const field of fields) {
    out[field] = await openField(dataKey, { type, recordId, field }, /** @type {any} */ (content[field]));
  }
  return out;
}

/** @param {unknown} value @param {string} what */
function requireText(value, what) {
  if (typeof value !== 'string' || value === '') {
    throw new CryptoInvalidRequest(`A sealed value must be bound to a ${what}.`);
  }
}
