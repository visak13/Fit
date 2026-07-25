/**
 * WHAT LEAVES THIS DEVICE — a whitelist, and the reason it is a whitelist.
 *
 * ## Why not a blacklist
 *
 * The obvious design is to strip the fields you know are dangerous. It fails for a reason that is
 * easy to miss and impossible to fix afterwards: **a provider's response object carries the account
 * holder's own address encoded inside identifier segments**, so a plain search of the outgoing bytes
 * for his address comes back clean while it is sitting right there in an opaque-looking id. A
 * blacklist can only remove what somebody thought of; the thing that leaks is by definition the thing
 * nobody thought of.
 *
 * So nothing is stripped. **Every outbound record is rebuilt field by field** from the envelope's own
 * declared field list, and its content must pass the content contract's own validator — which refuses
 * unknown keys. A raw provider response cannot survive that, not because we looked for it, but
 * because there is no path by which an unrecognised field is copied. `REFUSED_BY_SHAPE_NOT_BY_SEARCH`
 * is a declared value asserted by a test, so this cannot quietly become a scan.
 *
 * ## Ciphertext passes through opaquely
 *
 * A sealed value is content, and it is copied verbatim as the opaque object it is. Nothing here
 * decrypts, inspects, parses or logs one, and nothing here needs a key. The engine moves the coach's
 * clinical fields without ever being able to read them.
 *
 * ## A purge notice carries identities and nothing else
 *
 * The purge exists to leave no record of a departed client, so its outward notice must not
 * reintroduce one. No name, no note, no ciphertext, no adaptation flag: record identities, types and
 * revisions. The store's manifest is already built that way; this rebuilds it field by field anyway,
 * because "it was already safe upstream" is exactly the assumption that stops being true later.
 */

import { ENVELOPE_FIELDS, validateEnvelope, validateRecord } from '../model/model.js';
import { DELETION_MANIFEST_VERSION } from '../store/store.js';
import { SyncDocumentError, SyncPayloadRefused } from './errors.js';

/** Bumped if the document shape changes, so a reader can tell rather than guess. */
export const DOCUMENT_VERSION = 1;

/** What a document is for. Both are area files; the snapshot has its own module. */
export const DOCUMENT_KINDS = Object.freeze({ PUSH: 'push', STATE: 'state', SNAPSHOT: 'snapshot' });

/**
 * **A declared value, asserted by a test.** The defence against a foreign object leaving this device
 * is the rebuild below, not a search of the bytes for anything that looks alarming. A search cannot
 * see an address encoded inside an identifier segment; a rebuild never carries the segment at all.
 */
export const REFUSED_BY_SHAPE_NOT_BY_SEARCH = true;

/**
 * Rebuild one record for transmission, field by field.
 *
 * @param {any} record An envelope from the local store.
 * @returns {any} A new object holding the envelope's declared fields and nothing else.
 * @throws {SyncPayloadRefused} when the record does not conform. Refused, never trimmed.
 */
export function outboundRecord(record) {
  const envelope = validateEnvelope(record);
  if (!envelope.ok) {
    throw new SyncPayloadRefused(
      'A record whose envelope does not conform is not sent. Sending it would put a shape the other device cannot read into the backup.',
      { record_id: record?.record_id, issues: envelope.issues },
    );
  }
  const full = validateRecord(record);
  if (!full.ok) {
    throw new SyncPayloadRefused(
      'A record whose content does not conform to the content contract is not sent. Unknown fields are refused rather than stripped, because the field nobody thought of is the one that leaks.',
      { record_id: record.record_id, type: record.type, issues: full.issues },
    );
  }

  /** @type {Record<string, unknown>} */
  const out = {};
  for (const field of ENVELOPE_FIELDS) out[field] = record[field];
  return out;
}

/**
 * Rebuild a deletion manifest as an outward notice: identities only.
 *
 * @param {import('../store/purge.js').DeletionManifest} manifest
 * @returns {{deletion_id: string, manifest_version: number, subject_client_id: string,
 *            requested_at: string, origin_device: string,
 *            removed: {type: string, record_id: string}[],
 *            revised: {type: string, record_id: string, rev: number}[]}}
 */
export function outboundPurgeNotice(manifest) {
  if (!manifest || typeof manifest.subject_client_id !== 'string') {
    throw new SyncPayloadRefused('A purge notice needs the identity of the client it is about.', {});
  }
  if (manifest.manifest_version !== DELETION_MANIFEST_VERSION) {
    throw new SyncPayloadRefused(
      'This deletion manifest is a version this engine does not know how to send onward.',
      { manifest_version: manifest.manifest_version },
    );
  }
  return {
    deletion_id: manifest.deletion_id,
    manifest_version: manifest.manifest_version,
    subject_client_id: manifest.subject_client_id,
    requested_at: manifest.requested_at,
    origin_device: manifest.device,
    removed: (manifest.removed || []).map((r) => ({ type: r.type, record_id: r.record_id })),
    revised: (manifest.revised || []).map((r) => ({ type: r.type, record_id: r.record_id, rev: r.rev })),
  };
}

/**
 * Compose the text of one area file.
 *
 * @param {{kind: string, device: string, records?: readonly any[],
 *          purges?: readonly import('../store/purge.js').DeletionManifest[],
 *          writtenAt: string, cursor?: string|null}} args
 * @returns {string}
 */
export function encodeDocument(args) {
  if (!Object.values(DOCUMENT_KINDS).includes(args.kind)) {
    throw new SyncPayloadRefused(`"${args.kind}" is not a kind of document.`, { kind: args.kind });
  }
  const document = {
    document_version: DOCUMENT_VERSION,
    kind: args.kind,
    device: args.device,
    written_at: args.writtenAt,
    cursor: args.cursor ?? null,
    records: (args.records || []).map(outboundRecord),
    purges: (args.purges || []).map(outboundPurgeNotice),
  };
  return JSON.stringify(document);
}

/**
 * Read one back, refusing anything this engine did not write.
 *
 * @param {string} text
 * @param {{name?: string, fileId?: string}} [where] For the message a person will read.
 * @returns {{document_version: number, kind: string, device: string, written_at: string,
 *            cursor: string|null, records: any[], purges: any[]}}
 */
export function decodeDocument(text, where = {}) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new SyncDocumentError(
      'A file in the synchronisation space is not readable as a document. It is left alone rather than overwritten.',
      { ...where, cause: String(cause) },
    );
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SyncDocumentError('A synchronisation document must be an object.', where);
  }
  if (parsed.document_version !== DOCUMENT_VERSION) {
    throw new SyncDocumentError(
      `This document is version ${parsed.document_version} and this application reads version ${DOCUMENT_VERSION}. A newer version of the app may have written it; it is left alone.`,
      { ...where, document_version: parsed.document_version },
    );
  }
  if (!Array.isArray(parsed.records) || !Array.isArray(parsed.purges)) {
    throw new SyncDocumentError('A synchronisation document carries a list of records and a list of purges.', where);
  }
  for (const record of parsed.records) {
    const result = validateEnvelope(record);
    if (!result.ok) {
      throw new SyncDocumentError(
        'A record inside a synchronisation document does not carry a conforming envelope, so nothing from this file is applied.',
        { ...where, record_id: record?.record_id, issues: result.issues },
      );
    }
  }
  return parsed;
}
