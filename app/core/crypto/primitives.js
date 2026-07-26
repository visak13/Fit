/**
 * THE NATIVE PRIMITIVES, and nothing above them.
 *
 * ## Invent nothing
 *
 * Every operation in this file is a thin, named call into the cryptography built into the
 * browser and the runtime. There is no third-party cryptography bundle, no hand-rolled
 * cipher, no clever construction and no parameter chosen because it looked reasonable. The
 * scheme assembled from these parts is the published multi-recipient key-wrap pattern, which
 * this application FOLLOWS rather than improves.
 *
 * The reason for a file this thin is that it is the only place where an algorithm name or a
 * parameter appears. Everything above it composes; nothing above it chooses. A change to the
 * cryptography is therefore a change here, where it is visible, rather than a value drifting
 * at one of a dozen call sites.
 *
 * ## The choices, and why each one is not a preference
 *
 * - **AES-GCM, 256-bit, 96-bit IV, fresh per encryption.** Authenticated encryption, so a
 *   modified ciphertext fails to open rather than opening to something else. A 96-bit IV is
 *   the size the algorithm is specified for; anything else forces an internal derivation
 *   step that buys nothing. FRESH per encryption is not advice: reusing an IV under one key
 *   in this mode is catastrophic, not merely weak, so {@link seal} generates it and offers no
 *   way to supply one.
 * - **Additional authenticated data on every sealing.** The record identity and the schema
 *   version are bound in, so a sealed value cannot be lifted from one record onto another and
 *   still open. Without it, moving a ciphertext between two clients' records is undetectable.
 * - **AES-KW for wrapping the data key.** The standard key-wrapping algorithm, and the reason
 *   a device slot can hold a NON-EXTRACTABLE key: wrapping happens inside the implementation,
 *   so the raw bytes of the wrapping key never enter ordinary memory.
 * - **PBKDF2-HMAC-SHA-256 at 600,000 iterations, 16-byte random salt** for the passphrase
 *   slot. See {@link PBKDF2_ITERATIONS} for why the count is fixed rather than tuned.
 * - **HKDF-SHA-256** to turn stored random recovery bytes into a wrapping key. HKDF is the
 *   correct function for material that is ALREADY high-entropy; a password KDF there would
 *   cost time and buy nothing.
 *
 * ## Argon2id is not withheld — it does not exist here
 *
 * Web Crypto implements exactly four derivation algorithms: ECDH, HKDF, PBKDF2 and X25519.
 * Naming Argon2id raises `NotSupportedError`. The memory-hard alternative is therefore not a
 * better option we declined; it is unavailable natively on either of the coach's devices, and
 * reaching it would mean shipping a compiled cryptography library into a public static site
 * with no backend to vet it. PBKDF2 is the only native option, which is why the iteration
 * count carries the whole weight and must not be interpolated downward.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Named constants — no magic numbers anywhere above this file
// ═══════════════════════════════════════════════════════════════════════════════

/** The symmetric algorithm used to seal record fields. */
export const CONTENT_ALGORITHM = 'AES-GCM';

/** Data key length in bits. */
export const DATA_KEY_BITS = 256;

/**
 * Initialisation vector length in bytes.
 *
 * Ninety-six bits is the size AES-GCM is specified for. It is generated fresh for every
 * single sealing and never supplied by a caller — see the note on IV reuse above.
 */
export const IV_BYTES = 12;

/** The key-wrapping algorithm every slot uses. */
export const WRAP_ALGORITHM = 'AES-KW';

/** Wrapping key length in bits. */
export const WRAP_KEY_BITS = 256;

/** The password-based derivation function, and the only one Web Crypto offers for this job. */
export const PASSPHRASE_KDF = 'PBKDF2';

/** The hash beneath both derivation functions. */
export const KDF_HASH = 'SHA-256';

/**
 * PBKDF2 iterations for the passphrase slot. FIXED, and deliberately not a tunable.
 *
 * Six hundred thousand measured at roughly ninety-five milliseconds on the coach's actual
 * phone, which is the device that decides whether a passphrase prompt is usable — a desktop
 * figure would hide it. Ninety-five milliseconds is affordable for an unlock that happens
 * rarely and never during a session.
 *
 * Cost is linear in iterations, so halving this halves an attacker's work too. Because the
 * memory-hard alternative is unavailable natively, this count is the entire defence of the
 * passphrase slot. It must not be interpolated downward to make some other device feel
 * quicker.
 */
export const PBKDF2_ITERATIONS = 600_000;

/** Salt length in bytes for the passphrase slot. */
export const KDF_SALT_BYTES = 16;

/** Length in bytes of the random recovery key held as its own object. */
export const RECOVERY_KEY_BYTES = 32;

/** @returns {SubtleCrypto} The platform's cryptography, or a clear failure if there is none. */
function subtle() {
  const c = globalThis.crypto;
  if (!c || !c.subtle) {
    throw new Error(
      'This platform provides no native cryptography, so clinical notes cannot be sealed here. '
      + 'The application will not fall back to anything else.');
  }
  return c.subtle;
}

/**
 * Cryptographically random bytes.
 * @param {number} n
 * @returns {Uint8Array}
 */
export function randomBytes(n) {
  if (!Number.isInteger(n) || n <= 0) {
    throw new RangeError('randomBytes needs a positive whole number of bytes.');
  }
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/** A random identifier, from the platform. @returns {string} */
export function randomId() {
  return globalThis.crypto.randomUUID();
}

/**
 * The digest algorithm, named here because this file is the only place an algorithm name appears.
 *
 * SHA-256 and not something newer: it is one of the four digests Web Crypto implements, it is what
 * every other part of this design already leans on through HMAC and the key derivations above, and
 * a chain of hashes needs collision resistance and nothing else. Naming a fifth algorithm would
 * raise `NotSupportedError` on both of the coach's devices.
 */
export const DIGEST_ALGORITHM = 'SHA-256';

/**
 * Hash bytes with {@link DIGEST_ALGORITHM}.
 *
 * A thin call into the platform, like everything else in this file. It exists because the event
 * log chains each entry to its predecessor by hash, and the alternative — a digest assembled at
 * the call site — is exactly the invented construction this file was written to prevent.
 *
 * **This is an UNKEYED digest.** It detects accidental corruption and after-the-fact editing by
 * anyone who does not simply recompute the chain; it is not a signature and proves nothing about
 * WHO wrote an entry. See `core/journal/JOURNAL.md` for what that does and does not buy.
 *
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array>} The 32-byte digest.
 */
export async function sha256(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('sha256 needs a byte array.');
  return new Uint8Array(await subtle().digest(DIGEST_ALGORITHM, bytes));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Base64 — written out rather than borrowed, because neither host's helper is universal
// ═══════════════════════════════════════════════════════════════════════════════

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Reverse lookup, built once. @type {Map<string, number>} */
const B64_INDEX = new Map([...B64_ALPHABET].map((ch, i) => [ch, i]));

/**
 * Bytes to standard-alphabet base64 with padding.
 *
 * Written out here rather than reaching for a host helper because the browser's and the
 * runtime's helpers are different functions with different names, and this core is written to
 * be adopted unchanged by both. Twenty lines is a smaller cost than a branch on the host.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function toBase64(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('toBase64 needs a byte array.');
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : B64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : B64_ALPHABET[b2 & 0x3f];
  }
  return out;
}

/**
 * Standard-alphabet base64 back to bytes. Rejects anything it does not recognise rather than
 * skipping it, because silently ignoring a stray character turns a corrupted envelope into a
 * plausible-looking one.
 *
 * @param {string} text
 * @returns {Uint8Array}
 */
export function fromBase64(text) {
  if (typeof text !== 'string') throw new TypeError('fromBase64 needs text.');
  let clean = text;
  while (clean.endsWith('=')) clean = clean.slice(0, -1);
  const out = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let acc = 0;
  let bits = 0;
  let n = 0;
  for (const ch of clean) {
    const v = B64_INDEX.get(ch);
    if (v === undefined) throw new TypeError(`Not base64: unexpected character ${JSON.stringify(ch)}.`);
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[n++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, n);
}

/** Text to bytes, using the encoder both hosts share. */
export function textToBytes(text) {
  return new TextEncoder().encode(text);
}

/** Bytes back to text. */
export function bytesToText(bytes) {
  return new TextDecoder().decode(bytes);
}

// ═══════════════════════════════════════════════════════════════════════════════
// The data key
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate the data key.
 *
 * EXTRACTABLE, and that is not an oversight: a key that cannot be exported cannot be wrapped,
 * and wrapping it into independent slots is the whole design. Its raw bytes never leave this
 * process — it is persisted only in wrapped form — and the keys that WRAP it (the device
 * slot) are the ones held non-extractable.
 *
 * @returns {Promise<CryptoKey>}
 */
export function generateDataKey() {
  return subtle().generateKey(
    { name: CONTENT_ALGORITHM, length: DATA_KEY_BITS }, true, ['encrypt', 'decrypt']);
}

/**
 * Seal a value with the data key.
 *
 * The initialisation vector is generated here and cannot be supplied, because an IV reused
 * under one key in this mode is a catastrophic failure rather than a weak one, and the only
 * reliable way to prevent it is to give no caller the opportunity.
 *
 * @param {CryptoKey} dataKey
 * @param {Uint8Array} plaintext
 * @param {Uint8Array} additionalData Bound in, so a sealed value cannot be moved between records.
 * @returns {Promise<{iv: Uint8Array, ciphertext: Uint8Array}>}
 */
export async function seal(dataKey, plaintext, additionalData) {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = new Uint8Array(await subtle().encrypt(
    { name: CONTENT_ALGORITHM, iv, additionalData }, dataKey, plaintext));
  return { iv, ciphertext };
}

/**
 * Open a sealed value. Throws if the ciphertext, the initialisation vector or the bound
 * additional data does not match — which is the authentication doing its job, not a bug.
 *
 * @param {CryptoKey} dataKey
 * @param {Uint8Array} iv
 * @param {Uint8Array} ciphertext
 * @param {Uint8Array} additionalData
 * @returns {Promise<Uint8Array>}
 */
export async function open(dataKey, iv, ciphertext, additionalData) {
  return new Uint8Array(await subtle().decrypt(
    { name: CONTENT_ALGORITHM, iv, additionalData }, dataKey, ciphertext));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Wrapping keys — one per slot, produced three different ways
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A fresh wrapping key for a DEVICE slot.
 *
 * NON-EXTRACTABLE. This is the point of the device slot: the key exists as a handle the
 * platform holds, wrapping and unwrapping happen inside the implementation, and the raw bytes
 * never enter ordinary memory where a script, a crash dump or a copied variable could reach
 * them. It can be stored as an object in the local database and used again next launch
 * without ever being readable.
 *
 * @returns {Promise<CryptoKey>}
 */
export function generateDeviceWrappingKey() {
  return subtle().generateKey(
    { name: WRAP_ALGORITHM, length: WRAP_KEY_BITS }, false, ['wrapKey', 'unwrapKey']);
}

/**
 * A wrapping key derived from already-random recovery material, via HKDF.
 *
 * HKDF and not a password function, deliberately: the input is 256 random bits, so there is
 * nothing to make expensive. Spending time here would slow the honest user and not an
 * attacker, who faces the full key space either way.
 *
 * @param {Uint8Array} recoveryKeyBytes
 * @param {Uint8Array} salt
 * @param {string} info Domain separation, so the same material derives differently elsewhere.
 * @returns {Promise<CryptoKey>}
 */
export async function wrappingKeyFromRecoveryMaterial(recoveryKeyBytes, salt, info) {
  const material = await subtle().importKey('raw', recoveryKeyBytes, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'HKDF', hash: KDF_HASH, salt, info: textToBytes(info) },
    material,
    { name: WRAP_ALGORITHM, length: WRAP_KEY_BITS },
    false,
    ['wrapKey', 'unwrapKey']);
}

/**
 * A wrapping key derived from a passphrase, via PBKDF2 at {@link PBKDF2_ITERATIONS}.
 *
 * The iteration count is a parameter of the call rather than a constant read inside it,
 * because an envelope written today must still open in five years with the count it was
 * written under. It comes from the stored slot, not from this file's current value.
 *
 * @param {string} passphrase
 * @param {Uint8Array} salt
 * @param {number} iterations The count recorded in the slot being opened.
 * @returns {Promise<CryptoKey>}
 */
export async function wrappingKeyFromPassphrase(passphrase, salt, iterations) {
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    throw new TypeError('A passphrase is required.');
  }
  if (!Number.isInteger(iterations) || iterations <= 0) {
    throw new RangeError('A passphrase slot must carry a positive iteration count.');
  }
  const material = await subtle().importKey(
    'raw', textToBytes(passphrase), PASSPHRASE_KDF, false, ['deriveKey']);
  return subtle().deriveKey(
    { name: PASSPHRASE_KDF, hash: KDF_HASH, salt, iterations },
    material,
    { name: WRAP_ALGORITHM, length: WRAP_KEY_BITS },
    false,
    ['wrapKey', 'unwrapKey']);
}

/**
 * Wrap the data key under a slot's wrapping key.
 * @param {CryptoKey} dataKey
 * @param {CryptoKey} wrappingKey
 * @returns {Promise<Uint8Array>}
 */
export async function wrapDataKey(dataKey, wrappingKey) {
  return new Uint8Array(await subtle().wrapKey('raw', dataKey, wrappingKey, WRAP_ALGORITHM));
}

/**
 * Unwrap the data key from a slot.
 *
 * A wrong wrapping key fails here rather than yielding a key that decrypts to nonsense,
 * because the wrapping algorithm is itself authenticated. That is what makes "try this slot"
 * a safe operation.
 *
 * @param {Uint8Array} wrapped
 * @param {CryptoKey} wrappingKey
 * @returns {Promise<CryptoKey>}
 */
export function unwrapDataKey(wrapped, wrappingKey) {
  return subtle().unwrapKey(
    'raw', wrapped, wrappingKey, WRAP_ALGORITHM,
    { name: CONTENT_ALGORITHM, length: DATA_KEY_BITS }, true, ['encrypt', 'decrypt']);
}
