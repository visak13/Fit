/**
 * THE WORDS THAT REACH THE COACH — collected, and swept for the two things they must never say.
 *
 * ## Why this is a shipped module and not a test helper
 *
 * Two of this package's promises are about LANGUAGE rather than about numbers: nothing the coach
 * reads may name a load, and nothing may offer him a progression. A promise about language is only
 * as good as a check that reads the language, and this build has measured the failure of doing it the
 * other way round: a sweep pointed at SOURCE matches the very comments explaining why a thing is
 * forbidden, and then either fails on its own documentation or gets "fixed" by deleting the
 * explanation. So the sweep reads the STRINGS THE PROPOSAL CARRIES, and it lives beside the code it
 * checks where a reviewer can point it at anything.
 *
 * ## THE NAMES ARE MASKED FIRST, and this was measured rather than foreseen
 *
 * The shipped library holds an exercise called Bodyweight Squat. Sweeping the proposal's sentences for
 * the word `weight` fired on it forty times over the real content, and the sweep was right about the
 * letters and wrong about the meaning: that name is the coach's content, interpolated into our
 * sentence, and it prescribes nothing. So `findWords` takes the names to ignore and removes them
 * before it looks — `namesIn` collects every one the proposal interpolates.
 *
 * The general rule, which is worth more than this instance: **a word sweep over GENERATED prose must
 * mask the content interpolated into it, or it is checking the library's vocabulary rather than the
 * application's wording.** Masking is not a softening of the rule either — a coach who names a
 * routine Heavy Load Day has said `load` himself, and this application has still not said it.
 *
 * ## The two lists, and the exception each one deliberately holds
 *
 * `LOAD_WORDS` is about a PRESCRIBED load. `resistance` is deliberately NOT on it: in this library
 * that word names a piece of equipment — a resistance band — and not a number of kilograms, so
 * including it would flag an honest sentence about a band. Nothing in this package names equipment in
 * a sentence today; if that changes, the distinction is here rather than lost.
 *
 * `PROGRESSION_WORDS` is about the app deciding that today should be harder than last week. It does
 * NOT contain `propose`, `proposal` or `proposes`, and that is the point rather than an oversight:
 * this package's entire output is a proposal the coach disposes of. What it must never do is
 * recommend, suggest, target or progress.
 *
 * ## The sweeps are pointed at a known positive before their silence is believed
 *
 * Each of these functions returns the offences it FOUND, so a caller can assert both directions in
 * one run: nothing on the real proposal, and something on a deliberately poisoned copy. A sweep whose
 * entire output is an absence proves nothing on its own, because a broken sweep and a clean subject
 * produce the same silence. `proposal.test.js` does both, every run.
 */

/**
 * Words that would mean the application had prescribed a load.
 *
 * `kg` is listed WITHOUT a leading space, and that was measured rather than guessed: the natural way
 * to write it is `5kg`, and a list holding ` kg` reads that as clean. No English word in a sentence
 * this package produces contains those two letters, so the bare form costs nothing and catches the
 * form somebody would actually type.
 */
export const LOAD_WORDS = Object.freeze([
  'load', 'weight', 'heavier', 'kilogram', 'kilo', 'kg', 'pound', 'one rep max', '1rm',
]);

/** Words that would mean the application had decided the direction of travel. */
export const PROGRESSION_WORDS = Object.freeze([
  'progression', 'progressive', 'progresses', 'recommend', 'suggest', 'target',
  'week over week', 'automatically', 'improve', 'you should',
]);

/**
 * Unicode ranges holding emoji and the variation selector that turns a symbol into one. No emoji in
 * any user-facing string is a standing requirement across this application.
 *
 * Punctuation this codebase does use — the em dash, curly quotes — sits below `0x2500` and outside
 * every range here, so it is not caught. That is checked rather than assumed: `proposal.test.js`
 * passes an em dash and a curly quote through this sweep and asserts they come back clean.
 */
const EMOJI_RANGES = Object.freeze([
  Object.freeze([0x2600, 0x27bf]),
  Object.freeze([0x2b00, 0x2bff]),
  Object.freeze([0xfe0f, 0xfe0f]),
  Object.freeze([0x1f000, 0x1faff]),
]);

/**
 * Every sentence in a proposal that a human reads.
 *
 * This ENUMERATES the fields it reads rather than claiming to reach all of them, because a claim to
 * completeness that the code does not enforce is read as ground truth by every later editor. What
 * pins the enumeration is a test: `proposal.test.js` walks the whole proposal for anything
 * sentence-shaped and asserts this function returns exactly that set, so a sentence added to a new
 * field fails here instead of escaping the sweep.
 *
 * @param {import('./proposal.js').Proposal} proposal
 * @returns {string[]}
 */
export function humanSentencesOf(proposal) {
  const sentences = [proposal.curve.note, proposal.baseline.note, ...proposal.notes];
  for (const shortfall of proposal.shortfalls) sentences.push(shortfall.note);
  for (const position of proposal.positions) {
    sentences.push(position.reference.note);
    if (position.substitution_note) sentences.push(position.substitution_note);
    if (position.shortfall) sentences.push(position.shortfall.note);
    if (position.clamp_note) sentences.push(position.clamp_note);
  }
  return sentences;
}

/**
 * Every name a proposal interpolates into its own sentences: the curve the coach pressed, the routine
 * he is running, and each exercise placed or displaced. These are his content, not our wording, and
 * `findWords` masks them before it looks — see the header.
 *
 * @param {import('./proposal.js').Proposal} proposal
 * @returns {string[]}
 */
export function namesIn(proposal) {
  const names = [proposal.pattern_name, proposal.routine_name];
  for (const position of proposal.positions) {
    names.push(position.exercise_name);
    if (position.substituted_for_exercise_name) names.push(position.substituted_for_exercise_name);
  }
  return names.filter((name) => typeof name === 'string' && name.length > 0);
}

/**
 * Which of `words` appear in any of `sentences`, case-insensitively, once every name in `ignoring` has
 * been removed from the sentence.
 *
 * @param {readonly string[]} sentences @param {readonly string[]} words
 * @param {readonly string[]} [ignoring] Names that belong to the coach's content rather than to our
 *   wording. Pass `namesIn(proposal)`.
 * @returns {{word: string, sentence: string}[]}
 */
export function findWords(sentences, words, ignoring = []) {
  const masks = ignoring.map((name) => String(name).toLowerCase()).filter((name) => name.length > 0);
  const found = [];
  for (const sentence of sentences) {
    let lowered = String(sentence).toLowerCase();
    for (const mask of masks) lowered = lowered.split(mask).join(' ');
    for (const word of words) {
      if (lowered.includes(word)) found.push({ word, sentence });
    }
  }
  return found;
}

/**
 * Every emoji codepoint in `sentences`, reported with the sentence it sat in.
 * @param {readonly string[]} sentences
 * @returns {{codepoint: number, sentence: string}[]}
 */
export function findEmoji(sentences) {
  const found = [];
  for (const sentence of sentences) {
    for (const character of String(sentence)) {
      const codepoint = character.codePointAt(0) ?? 0;
      if (EMOJI_RANGES.some(([from, to]) => codepoint >= from && codepoint <= to)) {
        found.push({ codepoint, sentence });
      }
    }
  }
  return found;
}
