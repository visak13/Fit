/**
 * THE KEY ENVELOPE — one data key, wrapped independently by several slots.
 *
 * ## The construction, which is followed and not invented
 *
 * This is the multi-recipient key-wrap pattern that disk encryption and password managers
 * have used for years: the thing that actually encrypts data is ONE random key, generated
 * exactly once in the lifetime of the installation and never persisted in the clear. What is
 * persisted is a small document holding that key wrapped separately under each of several
 * INDEPENDENT credentials. Any one of them opens it; none of them is the key; adding or
 * removing a way in never re-encrypts a single record.
 *
 * That last property is why the pattern is worth following rather than improving. A design
 * where the passphrase IS the key cannot add a second way in without decrypting and
 * re-encrypting everything, so in practice it never gets one, and the day the passphrase is
 * forgotten is the day the data is gone.
 *
 * ## The three slots, and what each is FOR
 *
 * - **DEVICE** — primary and automatic. A wrapping key generated on this device and held
 *   NON-EXTRACTABLE, so its raw bytes never enter ordinary memory. Ordinary daily use
 *   therefore prompts for nothing at all: the coach opens a client and reads the note, with no
 *   passphrase in front of a client and no sign-in interruption mid-session.
 * - **RECOVERY** — the recovery authority. A random key kept as its OWN object in the hidden
 *   space, so getting back in on a new or wiped device is simply signing in. Nothing to
 *   memorise, nothing to print, nothing to lose.
 * - **PASSPHRASE** — OPTIONAL, offered rather than required. It exists for one case: the coach
 *   wanting the account provider outside the trust boundary. If chosen it is an
 *   application-generated six-word phrase that serves as both the passphrase and the written
 *   recovery code — one artefact to keep safe, not two.
 *
 * ## Security is the WEAKEST slot; recoverability is the STRONGEST
 *
 * This is the sentence that must never be softened, and it is stated again in `CRYPTO.md`
 * where the coach can read it. Every slot opens the same data key, so the data is exactly as
 * protected as the easiest slot to obtain — and exactly as recoverable as the hardest one to
 * lose. Adding the recovery slot makes losing everything nearly impossible AND puts the notes
 * within reach of anyone who can sign into the account. Both halves of that are true at once.
 *
 * ## What this module does and does not do
 *
 * It builds, reads and writes the DOCUMENT. It never talks to the remote store, never decides
 * whether an envelope may be created, and never lists anything. That guard is `guard.js`
 * beside it, and the separation is deliberate: the document shape is ordinary work, while
 * deciding whether to create one is the most dangerous decision in the application.
 */

import {
  CONTENT_ALGORITHM, DATA_KEY_BITS, KDF_HASH, KDF_SALT_BYTES, PASSPHRASE_KDF,
  PBKDF2_ITERATIONS, RECOVERY_KEY_BYTES, WRAP_ALGORITHM,
  bytesToText, fromBase64, generateDataKey, randomBytes, randomId, textToBytes, toBase64,
  unwrapDataKey, wrapDataKey, wrappingKeyFromPassphrase, wrappingKeyFromRecoveryMaterial,
} from './primitives.js';
import { CryptoInvalidRequest, EnvelopeUnreadable, NoUsableSlot } from './errors.js';

/** The document marker, so a file read from the hidden space identifies itself. */
export const ENVELOPE_DOCUMENT = 'key-envelope';

/** The recovery-key document marker. Its own object, its own shape. */
export const RECOVERY_DOCUMENT = 'recovery-key';

/**
 * Envelope format version. Bumped only when the document shape itself changes.
 *
 * A version this code does not recognise is refused rather than guessed at: a newer device
 * may have written something this one cannot represent, and writing back a downgraded copy
 * would destroy whatever it added.
 */
export const ENVELOPE_VERSION = 1;

/** The three slot kinds, and there are deliberately no others. */
export const SLOT_KINDS = Object.freeze({
  DEVICE: 'device',
  RECOVERY: 'recovery',
  PASSPHRASE: 'passphrase',
});

/** @type {readonly string[]} */
export const SLOT_KIND_VALUES = Object.freeze(Object.values(SLOT_KINDS));

/**
 * Domain separation for the recovery slot's derivation.
 *
 * The same recovery material must derive a different key here than it ever would elsewhere,
 * so a future use of that material cannot accidentally produce a key that opens this
 * envelope. It is a constant of the format and is never a caller's choice.
 */
const RECOVERY_DERIVATION_INFO = 'fit/key-envelope/recovery-slot/v1';

/**
 * @typedef {Object} KeySlot
 * @property {string} slot_id       Identity of this way in, stable across envelope revisions.
 * @property {string} kind          One of {@link SLOT_KINDS}.
 * @property {string} added_at      ISO 8601 UTC.
 * @property {string|null} device_id       Which device owns it, for a device slot.
 * @property {string|null} recovery_object_id Which recovery object it pairs with, for a recovery slot.
 * @property {string} label         Shown to the coach when he is asked to choose a way in.
 * @property {string} wrap_alg      The wrapping algorithm this slot was written with.
 * @property {string} wrapped_key   Base64 of the data key, wrapped under this slot.
 * @property {Object|null} kdf      How the wrapping key is reached, or null for a device slot.
 */

/**
 * @typedef {Object} KeyEnvelope
 * @property {string} document
 * @property {number} envelope_version
 * @property {string} envelope_id   Identity independent of the file name, because names are not unique.
 * @property {string} created_at
 * @property {string} created_by_device
 * @property {KeySlot[]} slots
 */

/**
 * A brand-new data key and the envelope that will carry it.
 *
 * This function is the ONLY place a data key comes into existence, and calling it a second
 * time on a second device is the failure the whole guard exists to prevent. It is therefore
 * deliberately NOT exported from the module barrel for general use — `guard.js` calls it, and
 * only after a listing has proven the hidden space is genuinely empty.
 *
 * @param {{deviceId: string, at: string}} ctx
 * @returns {Promise<{dataKey: CryptoKey, envelope: KeyEnvelope}>}
 */
export async function newEnvelope({ deviceId, at }) {
  requireText(deviceId, 'deviceId');
  requireText(at, 'at');
  const dataKey = await generateDataKey();
  return {
    dataKey,
    envelope: {
      document: ENVELOPE_DOCUMENT,
      envelope_version: ENVELOPE_VERSION,
      envelope_id: randomId(),
      created_at: at,
      created_by_device: deviceId,
      slots: [],
    },
  };
}

/**
 * A device slot, wrapping the data key under a key this device holds non-extractably.
 * @param {CryptoKey} dataKey
 * @param {CryptoKey} deviceWrappingKey Non-extractable; see `primitives.generateDeviceWrappingKey`.
 * @param {{deviceId: string, label: string, at: string}} ctx
 * @returns {Promise<KeySlot>}
 */
export async function makeDeviceSlot(dataKey, deviceWrappingKey, { deviceId, label, at }) {
  requireText(deviceId, 'deviceId');
  return {
    slot_id: randomId(),
    kind: SLOT_KINDS.DEVICE,
    added_at: at,
    device_id: deviceId,
    recovery_object_id: null,
    label: label || `This device (${deviceId})`,
    wrap_alg: WRAP_ALGORITHM,
    wrapped_key: toBase64(await wrapDataKey(dataKey, deviceWrappingKey)),
    kdf: null,
  };
}

/**
 * A recovery slot, wrapping the data key under material held as its own object in the hidden
 * space.
 *
 * The salt is stored in the slot rather than derived from anything, so the slot is
 * self-describing: a device that has never seen this envelope before can open it with nothing
 * but the recovery material and what is written here.
 *
 * @param {CryptoKey} dataKey
 * @param {Uint8Array} recoveryKeyBytes
 * @param {{recoveryObjectId: string, at: string}} ctx
 * @returns {Promise<KeySlot>}
 */
export async function makeRecoverySlot(dataKey, recoveryKeyBytes, { recoveryObjectId, at }) {
  requireBytes(recoveryKeyBytes, RECOVERY_KEY_BYTES, 'recoveryKeyBytes');
  const salt = randomBytes(KDF_SALT_BYTES);
  const wrappingKey = await wrappingKeyFromRecoveryMaterial(
    recoveryKeyBytes, salt, RECOVERY_DERIVATION_INFO);
  return {
    slot_id: randomId(),
    kind: SLOT_KINDS.RECOVERY,
    added_at: at,
    device_id: null,
    recovery_object_id: recoveryObjectId,
    label: 'Your Google account',
    wrap_alg: WRAP_ALGORITHM,
    wrapped_key: toBase64(await wrapDataKey(dataKey, wrappingKey)),
    kdf: { alg: 'HKDF', hash: KDF_HASH, salt: toBase64(salt), info: RECOVERY_DERIVATION_INFO },
  };
}

/**
 * An optional passphrase slot.
 *
 * The iteration count is WRITTEN INTO the slot rather than assumed at open time. An envelope
 * sealed today must still open years from now even if this file's constant has moved on, and
 * a mismatch would present as a wrong passphrase — the single most misleading failure this
 * design could produce, because the coach would believe he had lost the phrase he is holding
 * in his hand.
 *
 * @param {CryptoKey} dataKey
 * @param {string} passphrase
 * @param {{at: string, label?: string, iterations?: number}} ctx
 * @returns {Promise<KeySlot>}
 */
export async function makePassphraseSlot(dataKey, passphrase, { at, label, iterations } = /** @type {any} */ ({})) {
  const rounds = iterations ?? PBKDF2_ITERATIONS;
  const salt = randomBytes(KDF_SALT_BYTES);
  const wrappingKey = await wrappingKeyFromPassphrase(passphrase, salt, rounds);
  return {
    slot_id: randomId(),
    kind: SLOT_KINDS.PASSPHRASE,
    added_at: at,
    device_id: null,
    recovery_object_id: null,
    label: label || 'Your written recovery phrase',
    wrap_alg: WRAP_ALGORITHM,
    wrapped_key: toBase64(await wrapDataKey(dataKey, wrappingKey)),
    kdf: {
      alg: PASSPHRASE_KDF, hash: KDF_HASH, iterations: rounds, salt: toBase64(salt),
    },
  };
}

/**
 * A copy of the envelope with one more slot. PURE — the input is not mutated.
 *
 * Purity matters here beyond tidiness: the envelope we hold is also the evidence of what the
 * remote copy looked like when we read it, and mutating it in place would destroy the thing
 * the race detection compares against.
 *
 * @param {KeyEnvelope} envelope
 * @param {KeySlot} slot
 * @returns {KeyEnvelope}
 */
export function withSlot(envelope, slot) {
  if (envelope.slots.some((s) => s.slot_id === slot.slot_id)) {
    throw new CryptoInvalidRequest(`Slot ${slot.slot_id} is already on this envelope.`);
  }
  return { ...envelope, slots: [...envelope.slots, slot] };
}

/**
 * A copy of the envelope with THIS device's own device slot removed. PURE.
 *
 * Needed for one case that is ordinary rather than exotic: a device whose stored key vanished
 * — a browser that cleared its storage, or an application never installed to the home screen
 * and so reclaimed after a week — comes back, recovers, and gives itself a new slot. Appending
 * would leave a stale slot beside the new one, and a later lookup finding the stale one first
 * would fail to open the key on a device that is in fact perfectly fine.
 *
 * It removes only the slot belonging to the device asking. Another device's slot is never
 * touched, because a device cannot know whether that one still works, and removing a way in
 * that someone is relying on is the same harm as losing one.
 *
 * @param {KeyEnvelope} envelope
 * @param {string} deviceId
 * @returns {KeyEnvelope}
 */
export function withoutDeviceSlot(envelope, deviceId) {
  return {
    ...envelope,
    slots: envelope.slots.filter(
      (s) => !(s.kind === SLOT_KINDS.DEVICE && s.device_id === deviceId)),
  };
}

/** Every slot of one kind. @param {KeyEnvelope} envelope @param {string} kind @returns {KeySlot[]} */
export function slotsOfKind(envelope, kind) {
  return envelope.slots.filter((s) => s.kind === kind);
}

/**
 * This device's own slot, if it has one. A device that finds none is not broken — it has
 * simply never been given a way in of its own, or its slot was removed.
 * @param {KeyEnvelope} envelope
 * @param {string} deviceId
 * @returns {KeySlot|undefined}
 */
export function deviceSlotFor(envelope, deviceId) {
  return envelope.slots.find((s) => s.kind === SLOT_KINDS.DEVICE && s.device_id === deviceId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Opening the envelope
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Open the data key using this device's own slot.
 * @param {KeyEnvelope} envelope
 * @param {string} deviceId
 * @param {CryptoKey} deviceWrappingKey
 * @returns {Promise<CryptoKey>}
 */
export async function openWithDeviceSlot(envelope, deviceId, deviceWrappingKey) {
  const slot = deviceSlotFor(envelope, deviceId);
  if (!slot) throw new NoUsableSlot([SLOT_KINDS.DEVICE]);
  return unwrapOrFail(slot, deviceWrappingKey, SLOT_KINDS.DEVICE);
}

/**
 * Open the data key using the recovery material.
 *
 * This is the path a NEW or WIPED device takes, and it is the whole answer to a lost phone:
 * sign in, read the recovery object, open the envelope, and the notes are readable again.
 * Every recovery slot on the envelope is tried, because an envelope may carry more than one
 * over its life and the coach cannot be asked which.
 *
 * @param {KeyEnvelope} envelope
 * @param {Uint8Array} recoveryKeyBytes
 * @returns {Promise<CryptoKey>}
 */
export async function openWithRecoveryMaterial(envelope, recoveryKeyBytes) {
  requireBytes(recoveryKeyBytes, RECOVERY_KEY_BYTES, 'recoveryKeyBytes');
  const slots = slotsOfKind(envelope, SLOT_KINDS.RECOVERY);
  if (slots.length === 0) throw new NoUsableSlot([SLOT_KINDS.RECOVERY]);
  let lastCause;
  for (const slot of slots) {
    const kdf = requireKdf(slot, 'HKDF');
    try {
      const wrappingKey = await wrappingKeyFromRecoveryMaterial(
        recoveryKeyBytes, fromBase64(kdf.salt), kdf.info || RECOVERY_DERIVATION_INFO);
      return await unwrapDataKey(fromBase64(slot.wrapped_key), wrappingKey);
    } catch (cause) {
      lastCause = cause;
    }
  }
  throw failed(SLOT_KINDS.RECOVERY, lastCause);
}

/**
 * Open the data key using the optional passphrase.
 * @param {KeyEnvelope} envelope
 * @param {string} passphrase
 * @returns {Promise<CryptoKey>}
 */
export async function openWithPassphrase(envelope, passphrase) {
  const slots = slotsOfKind(envelope, SLOT_KINDS.PASSPHRASE);
  if (slots.length === 0) throw new NoUsableSlot([SLOT_KINDS.PASSPHRASE]);
  let lastCause;
  for (const slot of slots) {
    const kdf = requireKdf(slot, PASSPHRASE_KDF);
    try {
      const wrappingKey = await wrappingKeyFromPassphrase(
        passphrase, fromBase64(kdf.salt), kdf.iterations);
      return await unwrapDataKey(fromBase64(slot.wrapped_key), wrappingKey);
    } catch (cause) {
      lastCause = cause;
    }
  }
  throw failed(SLOT_KINDS.PASSPHRASE, lastCause);
}

// ═══════════════════════════════════════════════════════════════════════════════
// The wire form
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The envelope as bytes, ready to be written to the hidden space.
 * @param {KeyEnvelope} envelope
 * @returns {Uint8Array}
 */
export function serializeEnvelope(envelope) {
  return textToBytes(JSON.stringify(envelope, null, 2));
}

/**
 * Bytes back to an envelope, refusing anything it cannot fully account for.
 *
 * Strictness here is a safety property, not fussiness. A document that is nearly an envelope
 * is far more dangerous than one that is obviously not: the application would carry on,
 * seal notes against a key it half-understood, and fail at some later moment with no
 * indication of where the damage began.
 *
 * @param {Uint8Array|string} raw
 * @returns {KeyEnvelope}
 */
export function parseEnvelope(raw) {
  let doc;
  try {
    doc = JSON.parse(typeof raw === 'string' ? raw : bytesToText(raw));
  } catch (cause) {
    throw new EnvelopeUnreadable('it is not valid JSON.', { cause });
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new EnvelopeUnreadable('it is not an object.');
  }
  if (doc.document !== ENVELOPE_DOCUMENT) {
    throw new EnvelopeUnreadable(`it is not a ${ENVELOPE_DOCUMENT} document.`);
  }
  if (doc.envelope_version !== ENVELOPE_VERSION) {
    throw new EnvelopeUnreadable(
      `it is version ${doc.envelope_version}, and this device understands version `
      + `${ENVELOPE_VERSION}. A newer device may have written something this one cannot `
      + 'represent, and writing back a downgraded copy would destroy it.');
  }
  requireEnvelopeText(doc.envelope_id, 'envelope_id');
  requireEnvelopeText(doc.created_at, 'created_at');
  requireEnvelopeText(doc.created_by_device, 'created_by_device');
  if (!Array.isArray(doc.slots)) throw new EnvelopeUnreadable('its slots are not a list.');
  for (const slot of doc.slots) checkSlot(slot);
  return doc;
}

/** @param {unknown} slot */
function checkSlot(slot) {
  if (slot === null || typeof slot !== 'object') throw new EnvelopeUnreadable('a slot is not an object.');
  const s = /** @type {any} */ (slot);
  requireEnvelopeText(s.slot_id, 'slot_id');
  if (!SLOT_KIND_VALUES.includes(s.kind)) {
    throw new EnvelopeUnreadable(
      `a slot has kind ${JSON.stringify(s.kind)}, which this device does not understand.`);
  }
  requireEnvelopeText(s.wrapped_key, 'wrapped_key');
  if (s.wrap_alg !== WRAP_ALGORITHM) {
    throw new EnvelopeUnreadable(
      `a slot was wrapped with ${JSON.stringify(s.wrap_alg)}, and this device only performs `
      + `${WRAP_ALGORITHM}.`);
  }
  if (s.kind === SLOT_KINDS.DEVICE && s.kdf !== null) {
    throw new EnvelopeUnreadable('a device slot carries a derivation it should not have.');
  }
  if (s.kind !== SLOT_KINDS.DEVICE && (s.kdf === null || typeof s.kdf !== 'object')) {
    throw new EnvelopeUnreadable(`a ${s.kind} slot is missing its derivation parameters.`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// The recovery object — its own document, in its own file
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} RecoveryObject
 * @property {string} document
 * @property {number} envelope_version
 * @property {string} recovery_object_id
 * @property {string} created_at
 * @property {string} created_by_device
 * @property {string} key Base64 of the random recovery material.
 */

/**
 * A fresh recovery object.
 *
 * It is a SEPARATE file from the envelope, and that separation is load-bearing in one
 * direction the envelope's own guard does not cover: this object is subject to exactly the
 * same non-uniqueness quirk as the envelope, so two devices that both believe they must
 * establish recovery produce two of these, silently. Whoever writes one must run the same
 * three-case guard `guard.js` runs for the envelope. It is worse here than there, because a
 * split envelope announces itself the first time a device cannot read the other's notes,
 * whereas an ambiguous recovery object announces itself only when somebody actually tries to
 * recover — which is precisely the moment there is no other copy left.
 *
 * @param {{deviceId: string, at: string}} ctx
 * @returns {{recovery: RecoveryObject, keyBytes: Uint8Array}}
 */
export function newRecoveryObject({ deviceId, at }) {
  requireText(deviceId, 'deviceId');
  const keyBytes = randomBytes(RECOVERY_KEY_BYTES);
  return {
    keyBytes,
    recovery: {
      document: RECOVERY_DOCUMENT,
      envelope_version: ENVELOPE_VERSION,
      recovery_object_id: randomId(),
      created_at: at,
      created_by_device: deviceId,
      key: toBase64(keyBytes),
    },
  };
}

/** @param {RecoveryObject} recovery @returns {Uint8Array} */
export function serializeRecoveryObject(recovery) {
  return textToBytes(JSON.stringify(recovery, null, 2));
}

/**
 * @param {Uint8Array|string} raw
 * @returns {{recovery: RecoveryObject, keyBytes: Uint8Array}}
 */
export function parseRecoveryObject(raw) {
  let doc;
  try {
    doc = JSON.parse(typeof raw === 'string' ? raw : bytesToText(raw));
  } catch (cause) {
    throw new EnvelopeUnreadable('the recovery object is not valid JSON.', { cause });
  }
  if (doc === null || typeof doc !== 'object' || doc.document !== RECOVERY_DOCUMENT) {
    throw new EnvelopeUnreadable(`it is not a ${RECOVERY_DOCUMENT} document.`);
  }
  if (doc.envelope_version !== ENVELOPE_VERSION) {
    throw new EnvelopeUnreadable(
      `the recovery object is version ${doc.envelope_version}, and this device understands `
      + `version ${ENVELOPE_VERSION}.`);
  }
  requireEnvelopeText(doc.recovery_object_id, 'recovery_object_id');
  requireEnvelopeText(doc.key, 'key');
  let keyBytes;
  try {
    keyBytes = fromBase64(doc.key);
  } catch (cause) {
    throw new EnvelopeUnreadable('the recovery material is not readable.', { cause });
  }
  if (keyBytes.length !== RECOVERY_KEY_BYTES) {
    throw new EnvelopeUnreadable(
      `the recovery material is ${keyBytes.length} bytes and should be ${RECOVERY_KEY_BYTES}.`);
  }
  return { recovery: doc, keyBytes };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Small shared checks
// ═══════════════════════════════════════════════════════════════════════════════

/** @param {KeySlot} slot @param {CryptoKey} wrappingKey @param {string} kind */
async function unwrapOrFail(slot, wrappingKey, kind) {
  try {
    return await unwrapDataKey(fromBase64(slot.wrapped_key), wrappingKey);
  } catch (cause) {
    throw failed(kind, cause);
  }
}

/** @param {string} kind @param {unknown} cause */
function failed(kind, cause) {
  const err = new NoUsableSlot([kind]);
  if (cause !== undefined) {
    // The cause is preserved rather than swallowed: a wrapping failure and a missing slot are
    // different problems with the same user-facing outcome, and only the cause tells them apart.
    Object.defineProperty(err, 'cause', { value: cause, configurable: true, writable: true });
  }
  return err;
}

/** @param {KeySlot} slot @param {string} expectedAlg */
function requireKdf(slot, expectedAlg) {
  const kdf = /** @type {any} */ (slot.kdf);
  if (!kdf || kdf.alg !== expectedAlg) {
    throw new EnvelopeUnreadable(
      `a ${slot.kind} slot names derivation ${JSON.stringify(kdf && kdf.alg)}, and this device `
      + `performs ${expectedAlg} for that slot kind.`);
  }
  return kdf;
}

/** @param {unknown} value @param {string} what */
function requireText(value, what) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CryptoInvalidRequest(`${what} is required and must not be blank.`);
  }
}

/** @param {unknown} value @param {string} what */
function requireEnvelopeText(value, what) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new EnvelopeUnreadable(`its ${what} is missing or blank.`);
  }
}

/** @param {unknown} value @param {number} length @param {string} what */
function requireBytes(value, length, what) {
  if (!(value instanceof Uint8Array) || value.length !== length) {
    throw new CryptoInvalidRequest(`${what} must be ${length} bytes.`);
  }
}

/** Re-exported so a caller composing an envelope need not reach past this module. */
export { CONTENT_ALGORITHM, DATA_KEY_BITS, RECOVERY_KEY_BYTES };
