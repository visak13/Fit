/**
 * THE PROPERTIES THAT MUST HOLD ACROSS THIS PACKAGE, whatever anybody adds to it later.
 *
 * Four claims are made in `backup.js`, and prose rots silently. Each is asserted here instead: this
 * package writes NO cryptography of its own, reaches NO browser, reads NO clock, and imports its
 * neighbours BY FILE PATH rather than by directory.
 *
 * ## THE SCAN SCOPE IS DISCOVERED AT RUNTIME AND ASSERTED NON-EMPTY
 *
 * Not typed. A hand-written list of files to scan is a list that falls behind the directory, and it
 * falls behind in the one direction nobody notices: a new file simply is not scanned, and the guard
 * goes on reporting clean about a package it is no longer reading all of. Every scan below also
 * carries a NON-VACUITY probe pointed at something it MUST find, because a scan that matches nothing
 * produces exactly the same green as a package that is clean.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Every SHIPPED module here — discovered, never listed. */
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
  assert.ok(shipped.includes('backup.js'), 'the API is in scope');
  assert.ok(shipped.includes('collect.js') && shipped.includes('restore.js'));
  assert.ok(
    !shipped.some((name) => name.endsWith('.test.js')),
    'a suite in scope would let a test fixture satisfy a production guard',
  );
});

test('NO CRYPTOGRAPHY IS WRITTEN HERE: the sealing is COMPOSED, never re-implemented', () => {
  // The one permitted reach into the crypto package, named EXACTLY rather than by prefix — a prefix
  // rule would silently allow a later file to import the envelope, the device key store or the
  // guard, which is how a second key path gets built by somebody who thought they were allowed.
  const PERMITTED = '../crypto/portable.js';

  const found = [];
  for (const name of shippedFiles()) {
    const code = withoutComments(sourceOf(name));

    for (const specifier of importsIn(code)) {
      if (specifier.includes('/crypto/') && specifier !== PERMITTED) {
        found.push(`${name} imports ${specifier}`);
      }
    }
    // ACCESS-SHAPED rather than word-shaped: the headers here deliberately DISCUSS sealing and
    // passphrases in order to record why none of it is written, and a scan for the bare words would
    // flag the sentences that exist to keep the cryptography out.
    for (const token of ['subtle.', 'AES-', 'PBKDF2', 'wrapDataKey', 'sealField', 'newEnvelope', 'makePassphraseSlot']) {
      if (code.includes(token)) found.push(`${name} names ${token}`);
    }
  }
  assert.deepEqual(found, [], 'a second key path is how two incompatible families of ciphertext get created');

  // NON-VACUITY: the same scan over the real cryptography must find plenty.
  const realCrypto = withoutComments(readFileSync(join(HERE, '..', 'crypto', 'envelope.js'), 'utf8'));
  assert.ok(
    ['subtle.', 'AES-', 'PBKDF2', 'wrapDataKey'].some((token) => realCrypto.includes(token)),
    'the scan cannot find cryptography even where there is some, so its silence means nothing',
  );
});

test('NO BROWSER: this package is a store and some records, and the core gate runs it with nothing rendered', () => {
  const forbidden = ['document', 'window', 'navigator', 'canvas', 'Blob', 'File', 'localStorage', 'fetch'];

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
  assert.ok(mentions(browserHalf, 'File'), 'the scan cannot find a browser name even where there is one');
});

test('NO AMBIENT CLOCK: every instant is an ARGUMENT, so a backup is provable rather than observable', () => {
  const found = [];
  for (const name of shippedFiles()) {
    const code = withoutComments(sourceOf(name));
    for (const token of ['Date.now', 'new Date()', 'Math.random', 'performance.now']) {
      if (code.includes(token)) found.push(`${name} names ${token}`);
    }
  }
  assert.deepEqual(found, [], 'a module that reads the clock cannot have its timing proved from a controlled one');

  // `new Date(value)` — PARSING an instant the caller supplied — is a different act from `new Date()`
  // and is deliberately allowed. This asserts the distinction is real rather than a hole: the nudge
  // parses, and it takes `now` as an argument to do it with.
  const nudge = withoutComments(sourceOf('nudge.js'));
  assert.ok(nudge.includes('new Date('), 'the distinction being drawn here does not exist in the code');
  assert.ok(!nudge.includes('new Date()'), 'and the argless form is the one that is forbidden');
});

test('NEIGHBOURS ARE IMPORTED BY FILE PATH, never as a directory', () => {
  // Directory resolution is a Node convenience the BROWSER LACKS, so a directory import passes every
  // test in this package and breaks the application. It is the one defect here that no suite could
  // ever catch by running the code.
  const found = [];
  for (const name of shippedFiles()) {
    for (const specifier of importsIn(withoutComments(sourceOf(name)))) {
      if (specifier.startsWith('.') && !specifier.endsWith('.js')) found.push(`${name} imports ${specifier}`);
    }
  }
  assert.deepEqual(found, []);

  // NON-VACUITY: the check can see a specifier at all.
  const specifiers = importsIn(withoutComments(sourceOf('restore.js')));
  assert.ok(specifiers.length > 3, 'the import reader found almost nothing, so it is reading nothing');
  assert.ok(specifiers.every((s) => !s.startsWith('.') || s.endsWith('.js')));
});

test('NO EMOJI anywhere in this package, in a word the coach reads or a word he does not', () => {
  for (const name of shippedFiles()) {
    const emoji = sourceOf(name).match(/\p{Extended_Pictographic}/gu);
    assert.equal(emoji, null, `${name} carries ${JSON.stringify(emoji)}`);
  }
});

test('the scanner would SAY SO if one were there — the traps are proved armed', () => {
  const guilty = withoutComments([
    '/* This comment names document and PBKDF2 and Date.now, and is not code. */',
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
 * Whether code uses a name as a WHOLE identifier. `documentation` is not `document`.
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
