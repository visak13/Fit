/**
 * THE OPTIONAL PASSPHRASE — the word list's integrity and the phrase's honesty.
 *
 * The entropy figure that appears in the security notes is only true if the list holds no
 * duplicates and the draw is uniform. Both are asserted here rather than assumed, because an
 * overstated security figure is worse than an absent one: it is a claim the architecture does
 * not support, made to the one person who has no way to check it.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { PHRASE_ENTROPY_BITS, PHRASE_WORDS, WORDS } from './wordlist.js';
import { generatePassphrase, normalizePassphrase, unknownWords } from './passphrase.js';
import { CryptoInvalidRequest } from './errors.js';

/**
 * Written as an escape rather than typed. A non-breaking space is indistinguishable from an
 * ordinary one on screen, and an invisible test input is a test nobody can read.
 */
const NON_BREAKING_SPACE = '\u00a0';

test('the word list holds no duplicates, which is what makes the entropy figure true', () => {
  assert.equal(new Set(WORDS).size, WORDS.length,
    'a repeated word would make the list shorter than it looks and the stated bits an overstatement');
});

test('the word list is sorted, so a duplicate is visible to a reader as well as to this test', () => {
  assert.deepEqual(WORDS, [...WORDS].sort());
});

test('every entry is a plain lower-case word a person can write down and type back', () => {
  for (const word of WORDS) {
    assert.equal(word, word.toLowerCase(), word);
    assert.ok(word.length >= 2 && word.length <= 10, `${word} is an awkward length`);
    for (const ch of word) {
      assert.ok(ch >= 'a' && ch <= 'z',
        `${word} contains ${JSON.stringify(ch)}; a hyphen or apostrophe does not survive being `
        + 'copied off paper');
    }
  }
});

test('the list is large enough for the phrase length to mean something', () => {
  assert.ok(WORDS.length >= 1_000, `only ${WORDS.length} words`);
  assert.equal(PHRASE_WORDS, 6);
  assert.ok(PHRASE_ENTROPY_BITS > 60,
    `six words from this list carry ${PHRASE_ENTROPY_BITS.toFixed(1)} bits`);
  assert.equal(PHRASE_ENTROPY_BITS, Math.log2(WORDS.length) * PHRASE_WORDS,
    'computed from the list\'s real length, so adding or removing a word moves it — a constant '
    + 'would keep asserting yesterday\'s figure and nothing would notice');
});

test('a generated phrase is six words, all of them from the list', () => {
  const known = new Set(WORDS);

  for (let i = 0; i < 50; i += 1) {
    const { phrase, words } = generatePassphrase();
    assert.equal(words.length, PHRASE_WORDS);
    assert.equal(phrase, words.join(' '));
    for (const word of words) assert.ok(known.has(word), word);
  }
});

test('the draw is spread across the list rather than clustered at its start', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    for (const word of generatePassphrase().words) seen.add(WORDS.indexOf(word));
  }

  const high = [...seen].filter((i) => i >= WORDS.length / 2).length;
  assert.ok(high > 200,
    `only ${high} of 1200 draws landed in the second half of the list, which would suggest the `
    + 'selection is biased towards the earliest words');
});

test('two phrases are not the same phrase', () => {
  assert.notEqual(generatePassphrase().phrase, generatePassphrase().phrase);
});

test('a phrase written on paper and typed back survives capitals, spacing and a line break', () => {
  const canonical = 'anchor bridge canyon dolphin ember forest';

  assert.equal(normalizePassphrase('Anchor Bridge Canyon Dolphin Ember Forest'), canonical);
  assert.equal(normalizePassphrase('  anchor   bridge\tcanyon\ndolphin  ember forest  '), canonical);
  assert.equal(normalizePassphrase(canonical.split(' ').join(NON_BREAKING_SPACE)), canonical,
    'a mobile keyboard inserts a non-breaking space now and then without telling anyone');
});

test('normalising never corrects a word — a wrong phrase stays wrong', () => {
  assert.equal(normalizePassphrase('anchr bridge'), 'anchr bridge',
    'silently correcting a near-miss would mean the app deciding what the coach meant to write');
});

test('unknown words are pointed at by position, so the coach knows which one to check', () => {
  assert.deepEqual(unknownWords('anchor brydge canyon'), [{ index: 1, word: 'brydge' }]);
  assert.deepEqual(unknownWords('anchor bridge canyon'), []);
});

test('a phrase that is not text is refused rather than coerced', () => {
  assert.throws(() => normalizePassphrase(null), (err) => err instanceof CryptoInvalidRequest);
  assert.throws(() => generatePassphrase({ words: 0 }), (err) => err instanceof CryptoInvalidRequest);
});
