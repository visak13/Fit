/**
 * THE MODULE API for the encryption envelope. Import from here.
 *
 * Named explicitly rather than relying on directory-index resolution, for the same reason
 * `core/model/model.js` and `core/remote/remote.js` are: directory resolution is a runtime
 * convenience browsers do not have, and this core is written to be adopted unchanged by the
 * browser application. `'./core/crypto/crypto.js'` works in both; `'./core/crypto'` works in
 * neither.
 *
 * `index.js` beside this file is the TEST ENTRY POINT, not the API. Nothing in the
 * application imports it — it pulls in the test runner, which has no place in a browser.
 *
 * ## What is deliberately NOT exported
 *
 * `newEnvelope` — the one function that brings a data key into existence. It is reachable only
 * from `guard.js`, and only from behind a listing that has proven the hidden space is empty.
 * Keeping it off this barrel is what makes "create a second key" something a later step is
 * structurally unable to do, rather than something it is merely told not to do. A discipline
 * that depends on remembering drifts; a door that is not there does not.
 */

// The guard — the entry point for getting a data key, and the only road to creating one.
export {
  ENVELOPE_OBJECT_NAME,
  RECOVERY_OBJECT_NAME,
  LISTING_STATES,
  OUTCOMES,
  classifyListing,
  surveyKeyObjects,
  establishKeyMaterial,
  addSlotToEnvelope,
} from './guard.js';

// The envelope document: reading it, and adding ways in.
export {
  ENVELOPE_DOCUMENT,
  ENVELOPE_VERSION,
  RECOVERY_DOCUMENT,
  SLOT_KINDS,
  SLOT_KIND_VALUES,
  deviceSlotFor,
  makeDeviceSlot,
  makePassphraseSlot,
  makeRecoverySlot,
  openWithDeviceSlot,
  openWithPassphrase,
  openWithRecoveryMaterial,
  parseEnvelope,
  parseRecoveryObject,
  serializeEnvelope,
  serializeRecoveryObject,
  slotsOfKind,
  withSlot,
} from './envelope.js';

// The portable archive - a file that opens on a passphrase ALONE. Read portable.js before assuming
// the note above about newEnvelope is stale: that door is still shut for the STORE's key, and this
// one mints a key for a single file that no record is ever encrypted with.
export {
  openPortableArchive,
  PORTABLE_DOCUMENT,
  PORTABLE_VERSION,
  sealPortableArchive,
} from './portable.js';

// Sealing record fields.
export {
  additionalDataFor,
  openContent,
  openField,
  sealContent,
  sealField,
} from './sealing.js';

// The optional passphrase.
export {
  PHRASE_ENTROPY_BITS,
  PHRASE_WORDS,
  generatePassphrase,
  normalizePassphrase,
  unknownWords,
} from './passphrase.js';

// Where the device slot's key is held.
export { DeviceKeyStore, InMemoryDeviceKeyStore } from './device-key-store.js';

// The parameters, so a caller can display them rather than restate them — and the three thin
// native calls the event log needs. `core/journal` chains its entries by hash, and the rule it is
// built to is that no package outside this one may name an algorithm or assemble a construction of
// its own. Withholding `sha256` here would not prevent the chain; it would only push the digest
// call into a package where the algorithm name is invisible to anyone auditing the cryptography.
// `textToBytes` and `toBase64` come with it because a digest is useless without the encoding either
// side of it, and a second hand-written base64 is precisely the drift this barrel exists to stop.
export {
  CONTENT_ALGORITHM,
  DATA_KEY_BITS,
  DIGEST_ALGORITHM,
  IV_BYTES,
  KDF_HASH,
  KDF_SALT_BYTES,
  PASSPHRASE_KDF,
  PBKDF2_ITERATIONS,
  RECOVERY_KEY_BYTES,
  WRAP_ALGORITHM,
  WRAP_KEY_BITS,
  generateDeviceWrappingKey,
  sha256,
  textToBytes,
  toBase64,
} from './primitives.js';

// The failures, so a caller can branch on a class rather than on a message.
export {
  CryptoError,
  CryptoInvalidRequest,
  EnvelopeUnreadable,
  MultipleKeyObjectsFound,
  NoUsableSlot,
  NotConnectedYet,
  SlotAdditionRaced,
} from './errors.js';
