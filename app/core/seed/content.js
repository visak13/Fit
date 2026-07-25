/**
 * THE SHIPPED CONTENT, AS THE APPLICATION SEES IT.
 *
 * One place the rest of the application asks "what does this app ship?", and it never reaches
 * outside `app/` to answer. The three arrays below are the application's own copy of the
 * authored files in `seed/`, embedded verbatim by `sync-content.mjs` and proved identical to
 * their source on every test run by `content-drift.test.js`.
 *
 * These are CONTENT records — exactly the shape `seed/SCHEMA.md` documents, and nothing more.
 * They carry no identity, no revision, no device tag and no timestamps; wrapping them in the
 * record envelope is `import.js`'s job, and the envelope NESTS them rather than merging with
 * them, so nothing here needs unpicking to be stored.
 *
 * **`content.id` is a CONTENT KEY, not a record identity.** It is how one piece of shipped
 * content points at another — a routine entry naming the exercise it wants. The store files a
 * record under its own opaque `record_id`, and the content key survives beside it as an
 * ordinary content field.
 */

import EXERCISES from './content/exercises.js';
import ROUTINES from './content/routines.js';
import INTENSITY_PATTERNS from './content/intensity-patterns.js';

export { EXERCISES, ROUTINES, INTENSITY_PATTERNS };

/**
 * The library kinds this module ships, in IMPORT ORDER.
 *
 * Exercises come before routines because a routine names exercises, and a half-applied import
 * that wrote routines first would, for the instant it existed, describe a library that does not
 * exist. The store writes the whole set in one transaction so that instant never occurs — this
 * order is belt and braces, and it is also the order a human reads the library in.
 *
 * @type {readonly string[]}
 */
export const SEED_TYPES = Object.freeze(['exercise', 'routine', 'intensity-pattern']);

/**
 * The shipped content, by record type.
 * @type {Readonly<Record<string, readonly Record<string, any>[]>>}
 */
export const SEED_CONTENT = Object.freeze({
  exercise: Object.freeze(EXERCISES),
  routine: Object.freeze(ROUTINES),
  'intensity-pattern': Object.freeze(INTENSITY_PATTERNS),
});

/**
 * @param {string} type
 * @returns {readonly Record<string, any>[]}
 */
export function seedContentFor(type) {
  const records = SEED_CONTENT[type];
  if (!records) {
    throw new Error(`"${type}" is not shipped content. The shipped kinds are ${SEED_TYPES.join(', ')}.`);
  }
  return records;
}

/**
 * Every shipped record, flattened, each tagged with the type it should be stored as.
 * @returns {{type: string, content: Record<string, any>}[]}
 */
export function allSeedRecords() {
  return SEED_TYPES.flatMap((type) => seedContentFor(type).map((content) => ({ type, content })));
}

/**
 * How many records of each kind ship. A number a diagnostics screen can show, and the number a
 * test asserts an import against — a count that came from the same array as the import proves
 * nothing, so tests assert against these and against the authored files.
 * @returns {Record<string, number>}
 */
export function seedCounts() {
  return Object.fromEntries(SEED_TYPES.map((type) => [type, seedContentFor(type).length]));
}

/**
 * The set of content keys shipped for a kind.
 * @param {string} type
 * @returns {Set<string>}
 */
export function shippedKeys(type) {
  return new Set(seedContentFor(type).map((record) => record.id));
}
