/**
 * THE PROPERTIES THAT MUST HOLD ACROSS THIS WHOLE PACKAGE, whatever anybody adds to it later.
 *
 * Three claims are made in `artefacts.js`, and prose rots silently. Each is asserted here instead:
 * the package touches no browser, it holds no cryptography, and the three default exports cannot
 * reach a gate even if somebody wanted them to.
 *
 * ## THE SCAN SCOPE IS DISCOVERED AT RUNTIME AND ASSERTED NON-EMPTY
 *
 * Not typed. A hand-written list of files to scan is a list that falls behind the directory, and it
 * falls behind in the one direction nobody notices: a new file simply is not scanned, and the guard
 * goes on reporting clean about a package it is no longer reading all of. Every scan below also
 * carries a NON-VACUITY probe, because a scan that matches nothing produces the same green as a
 * package that is clean.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Every SHIPPED module here — discovered, never listed. Tests and the test entry point are not shipped. */
function shippedFiles() {
  return readdirSync(HERE)
    .filter((name) => name.endsWith('.js'))
    .filter((name) => !name.endsWith('.test.js'))
    .filter((name) => name !== 'index.js');
}

const sourceOf = (name) => readFileSync(join(HERE, name), 'utf8');

/** The module specifiers a file imports or re-exports. */
function importsIn(source) {
  const specifiers = [];
  const pattern = /from\s+['"]([^'"]+)['"]/g;
  let match = pattern.exec(source);
  while (match !== null) {
    specifiers.push(match[1]);
    match = pattern.exec(source);
  }
  return specifiers;
}

test('THE SCAN SCOPE IS DISCOVERED, and it is not empty', () => {
  const shipped = shippedFiles();

  assert.ok(shipped.length > 0, 'an empty scope makes every assertion below pass for free');
  assert.ok(shipped.includes('artefacts.js'), 'the API is in scope');
  assert.ok(
    !shipped.some((name) => name.endsWith('.test.js')),
    'a suite in scope would let a test fixture satisfy a production guard',
  );
});

test('NO BROWSER GLOBAL: this half is content and bytes, and it is testable with nothing rendered', () => {
  const forbidden = ['document', 'window', 'navigator', 'canvas', 'Blob', 'File', 'localStorage'];

  const found = [];
  for (const name of shippedFiles()) {
    const code = withoutComments(sourceOf(name));
    for (const global of forbidden) {
      if (mentions(code, global)) found.push(`${name} names ${global}`);
    }
  }
  assert.deepEqual(found, []);

  // NON-VACUITY: the same reader over a file that DOES reach the browser must say so.
  const browserHalf = withoutComments(readFileSync(join(HERE, '..', '..', 'src', 'platform', 'table-export.ts'), 'utf8'));
  assert.ok(mentions(browserHalf, 'File'), 'the scan can find a browser name when there is one');
});

test('NO CRYPTOGRAPHY: this package names no algorithm and imports no key material', () => {
  const found = [];
  for (const name of shippedFiles()) {
    const code = withoutComments(sourceOf(name));

    for (const specifier of importsIn(code)) {
      if (specifier.includes('/crypto/')) found.push(`${name} imports ${specifier}`);
    }
    // ACCESS-SHAPED rather than word-shaped: the headers here deliberately DISCUSS sealing and
    // passphrases in order to record why the sealing is injected, and a scan for the bare words
    // would flag the sentences that exist to keep the cryptography out.
    for (const token of ['subtle.', 'AES-', 'PBKDF2', 'crypto.', 'wrapDataKey', 'sealField', 'sealContent']) {
      if (code.includes(token)) found.push(`${name} names ${token}`);
    }
  }
  assert.deepEqual(found, [], 'the sealing is INJECTED by the caller; this package holds none of it');

  // NON-VACUITY: the same scan over the real crypto must find plenty.
  const realCrypto = withoutComments(readFileSync(join(HERE, '..', 'crypto', 'envelope.js'), 'utf8'));
  assert.ok(
    ['subtle.', 'AES-', 'PBKDF2', 'wrapDataKey'].some((token) => realCrypto.includes(token)),
    'the scan can find cryptography when there is some',
  );
});

test('NO STORE CALL: the records are an argument; nothing here goes and gets one', () => {
  const found = [];
  for (const name of shippedFiles()) {
    for (const specifier of importsIn(withoutComments(sourceOf(name)))) {
      if (specifier.includes('/store/') || specifier.includes('/remote/') || specifier.includes('/sync/')) {
        found.push(`${name} imports ${specifier}`);
      }
    }
  }
  assert.deepEqual(found, []);

  const aStoreCaller = importsIn(readFileSync(join(HERE, '..', 'seed', 'reset.js'), 'utf8'));
  assert.ok(
    aStoreCaller.some((specifier) => specifier.includes('/store/')),
    'the scan can find a store import when there is one',
  );
});

test('NO CLOCK AND NO RANDOMNESS: two exports of the same records are the same file', () => {
  const found = [];
  for (const name of shippedFiles()) {
    const code = withoutComments(sourceOf(name));
    for (const token of ['Date.now', 'new Date', 'Math.random', 'performance.now']) {
      if (code.includes(token)) found.push(`${name} names ${token}`);
    }
  }
  assert.deepEqual(found, [], 'a file that differs run to run cannot be compared to the one he sent last month');
});

test('NO EMOJI anywhere in this package, in a word the coach reads or a word he does not', () => {
  for (const name of shippedFiles()) {
    const emoji = sourceOf(name).match(/\p{Extended_Pictographic}/gu);
    assert.equal(emoji, null, `${name} carries ${JSON.stringify(emoji)}`);
  }
});

// ── the readers, which are themselves proved to read ───────────────────────────────────────────────

test('the scanner would SAY SO if one were there — the traps are proved armed', () => {
  const guilty = withoutComments([
    '/* This comment names document and PBKDF2 and Math.random, and is not code. */',
    'const element = document.createElement("canvas"); // a comment naming navigator',
  ].join('\n'));

  assert.equal(mentions(guilty, 'document'), true);
  assert.equal(mentions(guilty, 'canvas'), true);
  assert.equal(mentions(guilty, 'navigator'), false, 'a line comment is not code');
  assert.equal(guilty.includes('PBKDF2'), false, 'nor is a block comment');
  assert.equal(mentions('const documentation = 1;', 'document'), false, 'and a longer name is a different name');
});

/**
 * Code with its comments removed, so a header that explains why something is ABSENT does not read as
 * that thing being present. Strings are left alone: a forbidden name inside one is still a use.
 * @param {string} source @returns {string}
 */
function withoutComments(source) {
  let code = source;
  code = code.replace(/\/\*[\s\S]*?\*\//g, ' ');
  code = code.replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  return code;
}

/**
 * Whether code uses a name as a WHOLE identifier. `documentation` is not `document`, and a guard
 * that could not tell them apart would be either useless or unusable.
 * @param {string} code @param {string} name @returns {boolean}
 */
function mentions(code, name) {
  const isIdentifierCharacter = (character) => character !== undefined
    && (character === '_' || character === '$'
      || (character >= '0' && character <= '9')
      || (character >= 'a' && character <= 'z')
      || (character >= 'A' && character <= 'Z'));

  let at = code.indexOf(name);
  while (at !== -1) {
    if (!isIdentifierCharacter(code[at - 1]) && !isIdentifierCharacter(code[at + name.length])) return true;
    at = code.indexOf(name, at + 1);
  }
  return false;
}
