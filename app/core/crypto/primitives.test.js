/**
 * THE PRIMITIVES, and the boundary this directory keeps.
 *
 * Two kinds of test live here. The first proves the thin native wrappers actually do what
 * their names say — base64 that round-trips every byte, authenticated encryption that refuses
 * a tampered value, wrapping that refuses the wrong key. The second is a structural check:
 * that nothing in this directory imports anything outside the core.
 *
 * That structural check is worth more than it looks. The Google step depends on this one, not
 * the reverse: this directory consumes the remote storage port abstractly and makes no live
 * provider call. If a provider client ever appeared in an import here, the encryption would
 * have quietly acquired a network dependency — and the notes would stop being sealable at
 * exactly the moment a credential expired.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DATA_KEY_BITS, IV_BYTES, KDF_SALT_BYTES, PBKDF2_ITERATIONS, RECOVERY_KEY_BYTES, WRAP_KEY_BITS,
  fromBase64, generateDataKey, generateDeviceWrappingKey, open, randomBytes, seal, textToBytes,
  toBase64, unwrapDataKey, wrapDataKey, wrappingKeyFromPassphrase, wrappingKeyFromRecoveryMaterial,
} from './primitives.js';

const HERE = dirname(fileURLToPath(import.meta.url));

test('base64 round-trips every byte value, including the ones that need padding', () => {
  for (let length = 0; length <= 8; length += 1) {
    const bytes = new Uint8Array(length).map((_, i) => (i * 37) % 256);
    assert.deepEqual(fromBase64(toBase64(bytes)), bytes, `length ${length}`);
  }
  const all = new Uint8Array(256).map((_, i) => i);
  assert.deepEqual(fromBase64(toBase64(all)), all);
});

test('base64 refuses a character it does not recognise rather than skipping it', () => {
  assert.throws(() => fromBase64('AAAA!AAA'),
    'silently ignoring a stray character turns a corrupted envelope into a plausible-looking one');
});

test('the parameters are the ones the design fixed, and are not quietly tunable', () => {
  assert.equal(DATA_KEY_BITS, 256);
  assert.equal(WRAP_KEY_BITS, 256);
  assert.equal(IV_BYTES, 12);
  assert.equal(KDF_SALT_BYTES, 16);
  assert.equal(RECOVERY_KEY_BYTES, 32);
  assert.equal(PBKDF2_ITERATIONS, 600_000,
    'the memory-hard alternative is unavailable natively, so this count is the whole defence of '
    + 'the passphrase slot and must not be interpolated downward');
});

test('sealing generates its own initialisation vector and it is never reused', async () => {
  const key = await generateDataKey();
  const aad = textToBytes('bound');

  const first = await seal(key, textToBytes('a note'), aad);
  const second = await seal(key, textToBytes('a note'), aad);

  assert.equal(first.iv.length, IV_BYTES);
  assert.notDeepEqual(first.iv, second.iv,
    'IV reuse under one key in this mode is catastrophic rather than weak, which is why no '
    + 'caller is given the opportunity to supply one');
  assert.deepEqual(await open(key, first.iv, first.ciphertext, aad), textToBytes('a note'));
});

test('opening with different bound data fails rather than yielding something else', async () => {
  const key = await generateDataKey();
  const { iv, ciphertext } = await seal(key, textToBytes('a note'), textToBytes('record-1'));

  await assert.rejects(() => open(key, iv, ciphertext, textToBytes('record-2')));
});

test('a wrapped data key comes back identical, and a wrong wrapping key is refused', async () => {
  const dataKey = await generateDataKey();
  const right = await generateDeviceWrappingKey();
  const wrong = await generateDeviceWrappingKey();
  const wrapped = await wrapDataKey(dataKey, right);

  const back = await unwrapDataKey(wrapped, right);

  const [a, b] = await Promise.all([dataKey, back].map(exportRaw));
  assert.equal(a, b);
  await assert.rejects(() => unwrapDataKey(wrapped, wrong),
    'the wrapping algorithm is itself authenticated, which is what makes "try this slot" safe');
});

test('the device wrapping key is NON-EXTRACTABLE, so its bytes never enter ordinary memory', async () => {
  const key = await generateDeviceWrappingKey();

  assert.equal(key.extractable, false);
  await assert.rejects(() => globalThis.crypto.subtle.exportKey('raw', key));
});

test('the same passphrase and salt derive the same wrapping key; a different salt does not', async () => {
  const salt = randomBytes(KDF_SALT_BYTES);
  const other = randomBytes(KDF_SALT_BYTES);
  const dataKey = await generateDataKey();

  const wrapped = await wrapDataKey(dataKey, await wrappingKeyFromPassphrase('a phrase', salt, 1_000));

  await unwrapDataKey(wrapped, await wrappingKeyFromPassphrase('a phrase', salt, 1_000));
  await assert.rejects(
    async () => unwrapDataKey(wrapped, await wrappingKeyFromPassphrase('a phrase', other, 1_000)),
    'the salt is stored beside the slot precisely because the derivation depends on it');
  await assert.rejects(
    async () => unwrapDataKey(wrapped, await wrappingKeyFromPassphrase('a phrase', salt, 2_000)),
    'and so does the iteration count, which is why the slot records the one it was written with');
});

test('recovery material derives a wrapping key that depends on its domain separation', async () => {
  const material = randomBytes(RECOVERY_KEY_BYTES);
  const salt = randomBytes(KDF_SALT_BYTES);
  const dataKey = await generateDataKey();

  const wrapped = await wrapDataKey(
    dataKey, await wrappingKeyFromRecoveryMaterial(material, salt, 'purpose/one'));

  await unwrapDataKey(wrapped, await wrappingKeyFromRecoveryMaterial(material, salt, 'purpose/one'));
  await assert.rejects(
    async () => unwrapDataKey(wrapped, await wrappingKeyFromRecoveryMaterial(material, salt, 'purpose/two')),
    'the same material must derive differently elsewhere, so a future use of it cannot '
    + 'accidentally produce a key that opens this envelope');
});

// ═══════════════════════════════════════════════════════════════════════════════
// The boundary
// ═══════════════════════════════════════════════════════════════════════════════

test('nothing in this directory imports anything outside the core', () => {
  const offenders = [];
  for (const file of readdirSync(HERE).filter((f) => f.endsWith('.js'))) {
    for (const specifier of importSpecifiers(readFileSync(join(HERE, file), 'utf8'))) {
      const allowed = specifier.startsWith('./')
        || specifier.startsWith('../model/')
        || specifier.startsWith('../remote/')
        || (file.endsWith('.test.js') && specifier.startsWith('node:'));
      if (!allowed) offenders.push(`${file} imports ${specifier}`);
    }
  }

  assert.deepEqual(offenders, [],
    'this directory consumes the remote storage PORT abstractly and makes no live provider '
    + 'call; a provider client appearing here would give the encryption a network dependency');
});

test('the application modules pull in no test runner and no filesystem', () => {
  const offenders = [];
  for (const file of readdirSync(HERE).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))) {
    if (file === 'index.js') continue; // The test entry point, and the only exception.
    for (const specifier of importSpecifiers(readFileSync(join(HERE, file), 'utf8'))) {
      if (specifier.startsWith('node:')) offenders.push(`${file} imports ${specifier}`);
    }
  }

  assert.deepEqual(offenders, [],
    'this core is adopted unchanged by a browser, where none of those exist');
});

/**
 * Every module specifier a source file imports.
 *
 * Scanned by walking for the `from '…'` that follows each `import`, rather than by pattern
 * matching, so this file needs no expression language of its own. It is deliberately simple:
 * it reads what an import statement looks like in this directory, where every one is written
 * plainly at the top of the file.
 *
 * @param {string} source
 * @returns {string[]}
 */
function importSpecifiers(source) {
  const out = [];
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    const isStatement = line.startsWith('import ')
      || line.startsWith('export ')
      || line.startsWith('} from ');
    const dynamicAt = line.indexOf('await import(');
    if (!isStatement && dynamicAt < 0) continue;

    const opener = dynamicAt >= 0 ? "import('" : (line.includes("from '") ? "from '" : "import '");
    const at = line.indexOf(opener);
    if (at < 0) continue;
    const start = at + opener.length;
    const end = line.indexOf("'", start);
    if (end > start) out.push(line.slice(start, end));
  }
  return out;
}

/** @param {CryptoKey} key */
async function exportRaw(key) {
  return toBase64(new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', key)));
}
