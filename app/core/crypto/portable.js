/**
 * THE PORTABLE ARCHIVE — a file that opens with a passphrase ALONE, and the one door in this package
 * that mints a key for something other than the store.
 *
 * ## READ THIS BEFORE ASSUMING THE HEADER OF `crypto.js` IS WRONG
 *
 * `crypto.js` says `newEnvelope` — the function that brings a data key into existence — is
 * deliberately withheld from the barrel, so that creating a second key is something a later step is
 * STRUCTURALLY UNABLE to do rather than merely told not to do. That is still true, and this module
 * does not weaken it. It is the second caller of that function, after `guard.js`, and the two are
 * doing different things:
 *
 *   - `guard.js` mints THE STORE'S data key. It may only do so after listing the hidden space and
 *     proving it empty, because a second store key is a silent, unrecoverable split of the coach's
 *     own records.
 *   - THIS module mints a key that belongs to ONE FILE and to nothing else. It is used once, it is
 *     never persisted, never written to the hidden space, never adopted by any device, and no record
 *     in the store is ever encrypted with it. Minting a second one tomorrow costs nothing, because
 *     yesterday's file carries its own.
 *
 * ## WHY THAT DISTINCTION IS SAFE HERE AND WOULD NOT BE ANYWHERE ELSE
 *
 * The split-brain failure needs two things: two keys, AND records encrypted under each. This module
 * cannot supply the second. **It takes no remote, no device key store and no store handle, so it is
 * structurally incapable of reaching the space the guard protects** — and that is asserted by a test
 * in `portable.test.js` rather than promised here, because a promise in a header is exactly what the
 * withheld door was chosen over.
 *
 * If you are here because you want a key for a RECORD: you want `establishKeyMaterial` in `guard.js`,
 * and you want it for the reason above. This is not that door and must never become it.
 *
 * ## NO NEW CRYPTOGRAPHY. THE EXISTING PARTS, IN THE EXISTING ORDER, FOR A FILE.
 *
 * Every primitive below already exists and is already covered: `newEnvelope` mints the key,
 * `makePassphraseSlot` wraps it under a key derived from the passphrase by PBKDF2-HMAC-SHA-256 with a
 * fresh random salt, `sealField` encrypts the payload with AES-GCM binding the archive's identity as
 * additional data, and `openWithPassphrase` reverses the wrap. The iteration count comes from
 * `primitives.js`, where it is FIXED AND DELIBERATELY NOT A TUNABLE — a tunable that gets tuned down
 * is a silent weakening — and this module inherits that rather than re-opening it.
 *
 * ## THE PROPERTY THE WHOLE FEATURE EXISTS FOR
 *
 * THE ARCHIVE IS SELF-CONTAINED. Its salt, its iteration count, its wrapped key and its nonce all
 * travel inside the file. Nothing in it refers to the device envelope or to anything in the coach's
 * Drive, because a reference to either resolves to NOTHING in the context the file is opened in —
 * years later, on a borrowed laptop, with the phone lost and the account gone. An archive that could
 * only be opened by the device that wrote it would have failed at the one thing it is for.
 *
 * ## AND THE HONEST COST, WHICH BELONGS IN THE COPY AS WELL AS HERE
 *
 * The passphrase is the ONLY way in, by design — so whoever holds the file and the passphrase holds
 * what is inside it, and nothing else can guard it. Losing the passphrase, however, loses nothing
 * that matters: this is a COPY. The originals keep their own independent ways in, and the coach can
 * simply export again.
 */

import {
  makePassphraseSlot, newEnvelope, openWithPassphrase, parseEnvelope, withSlot,
} from './envelope.js';
import { CryptoInvalidRequest, EnvelopeUnreadable } from './errors.js';
import { randomId } from './primitives.js';
import { openField, sealField } from './sealing.js';

/** The document marker, so a file read years later identifies itself rather than being guessed at. */
export const PORTABLE_DOCUMENT = 'fit-portable-archive';

/**
 * Archive format version. A version this code does not recognise is refused rather than guessed at,
 * for the same reason the key envelope refuses one.
 */
export const PORTABLE_VERSION = 1;

/**
 * The bound context for the payload's authenticated encryption.
 *
 * `type` and `field` are constants of the format; `recordId` is the archive's own identity, so a
 * ciphertext lifted out of one archive and dropped into another fails to open rather than opening as
 * though it belonged there.
 */
const PAYLOAD_TYPE = 'portable-archive';
const PAYLOAD_FIELD = 'payload';

/**
 * What the envelope inside the archive records as its origin.
 *
 * A portable archive has no device: it is made ON one and opened somewhere else entirely, which is
 * the point. The marker is a constant rather than the real device identity, because a device
 * identifier in a file the coach hands to somebody is a value he would have to explain.
 */
const NO_PARTICULAR_DEVICE = 'portable-export';

/** What the passphrase slot is called if anything ever shows it to a person. */
const SLOT_LABEL = 'The passphrase you set on this file';

/**
 * Seal a payload into a portable archive.
 *
 * @param {string} passphrase The passphrase the coach set. The only way in, by design.
 * @param {string} payload The plaintext to protect.
 * @param {{at: string}} ctx The instant, supplied rather than read — this package holds no clock.
 * @returns {Promise<string>} The archive as text, ready to be written into a file.
 */
export async function sealPortableArchive(passphrase, payload, { at } = /** @type {any} */ ({})) {
  if (typeof passphrase !== 'string' || passphrase.trim() === '') {
    throw new CryptoInvalidRequest('A portable archive needs a passphrase; it is the only way in.');
  }
  if (typeof payload !== 'string') {
    throw new CryptoInvalidRequest('A portable archive seals text.');
  }
  if (typeof at !== 'string' || at === '') {
    throw new CryptoInvalidRequest('A portable archive records when it was made.');
  }

  // A key for THIS FILE. Minted here, used twice, and gone when this function returns: it is never
  // persisted, never written anywhere, and nothing outside this call can reach it.
  const { dataKey, envelope } = await newEnvelope({ deviceId: NO_PARTICULAR_DEVICE, at });
  const archiveId = randomId();

  const slot = await makePassphraseSlot(dataKey, passphrase, { at, label: SLOT_LABEL });
  const sealed = await sealField(
    dataKey,
    { type: PAYLOAD_TYPE, recordId: archiveId, field: PAYLOAD_FIELD },
    payload,
  );

  return JSON.stringify({
    document: PORTABLE_DOCUMENT,
    portable_version: PORTABLE_VERSION,
    archive_id: archiveId,
    created_at: at,
    // The whole envelope travels WITH the file. This is the self-containment the feature exists for.
    envelope: withSlot(envelope, slot),
    payload: sealed,
  }, null, 2);
}

/**
 * Open a portable archive with the passphrase alone.
 *
 * TWO ARGUMENTS, AND THAT IS LOAD-BEARING: there is no device key, no account, no store and no
 * envelope from anywhere else. If this function ever grows a third input, the file has stopped being
 * openable by somebody holding only the file and the phrase, which is the entire feature.
 *
 * @param {string} passphrase
 * @param {string} archive The text {@link sealPortableArchive} produced.
 * @returns {Promise<string>} The payload.
 */
export async function openPortableArchive(passphrase, archive) {
  const doc = readArchive(archive);
  const envelope = parseEnvelope(JSON.stringify(doc.envelope));

  // Throws on a wrong passphrase, through the envelope's own slot handling. A wrong phrase and a
  // corrupted file are different failures and are left as the different errors they already are.
  const dataKey = await openWithPassphrase(envelope, passphrase);

  return /** @type {string} */ (await openField(
    dataKey,
    { type: PAYLOAD_TYPE, recordId: doc.archive_id, field: PAYLOAD_FIELD },
    doc.payload,
  ));
}

/**
 * The archive document, checked before anything is derived from it.
 * @param {unknown} archive @returns {Record<string, any>}
 */
function readArchive(archive) {
  let doc;
  try {
    doc = JSON.parse(typeof archive === 'string' ? archive : '');
  } catch (cause) {
    throw new EnvelopeUnreadable('this file is not a readable archive.', { cause });
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new EnvelopeUnreadable('this file is not a readable archive.');
  }
  if (doc.document !== PORTABLE_DOCUMENT) {
    throw new EnvelopeUnreadable(`this file is not a ${PORTABLE_DOCUMENT} document.`);
  }
  if (doc.portable_version !== PORTABLE_VERSION) {
    throw new EnvelopeUnreadable(
      `this archive is version ${doc.portable_version}, and this application understands version `
      + `${PORTABLE_VERSION}.`);
  }
  if (typeof doc.archive_id !== 'string' || doc.archive_id === '') {
    throw new EnvelopeUnreadable('this archive has no identity, so its contents cannot be bound to it.');
  }
  return doc;
}
