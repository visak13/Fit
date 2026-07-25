/**
 * THE SEED IMPORTER — the shipped library, into the local store, on first run.
 *
 * ## What it does, in one paragraph
 *
 * On first run it takes every record in `content.js`, wraps each one in the record envelope
 * WITHOUT altering the content in any way, and writes the whole set in a single transaction.
 * Afterwards every record is an ordinary record: the coach edits it, deletes it, or ignores it,
 * exactly as he would one he created himself. Nothing here is read-only, and nothing about
 * being shipped makes a record special except that `provenance` remembers where it came from,
 * which is what lets the admin reset put it back.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *  THE RULE THAT DESTROYS REAL WORK IF IT IS MISSED
 *
 *  The shipped exercise catalogue DELIBERATELY EXCEEDS the shipped week. The routines
 *  reference under two thirds of it. The remainder is NOT dead weight, NOT orphaned data and
 *  NOT something to tidy up: **the surplus IS the substitution pool**, and two features depend
 *  on it — the coach swapping an exercise mid-session when a client is tired, and the intensity
 *  adapter, which draws from the whole catalogue rather than from a routine's own list.
 *
 *  Referential checking therefore runs in ONE DIRECTION ONLY: every exercise a routine names
 *  must exist, and never the reverse. This importer writes the WHOLE file, and
 *  {@link assertNothingPruned} makes that a guarantee rather than a hope — see
 *  {@link SEED_PRUNES_UNREFERENCED_CONTENT}.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * ## How "first run" is decided
 *
 * By asking the STORE what is in it, not by reading a flag. A flag — in meta, in local storage,
 * in a file — is a second source of truth about whether seeding happened, and it will eventually
 * disagree with the store: it survives a database that was cleared, and it is lost by a device
 * that restored one. When the two disagree the app either re-imports over the coach's library or
 * refuses to seed a genuinely empty one.
 *
 * So: the library has been seeded when any library record exists. A record the coach DELETED
 * still exists — deletion raises a tombstone rather than removing the row — so an emptied
 * library is still a seeded one and is not silently refilled behind him.
 *
 * {@link SEED_IMPORT_META_KEY} is written as diagnostics only, and {@link hasBeenSeeded}
 * deliberately does not read it. `import.test.js` asserts that removing it does not cause a
 * re-import, so the day it disagrees with the store, the store wins.
 */

import {
  checkLibraryIntegrity, createEnvelope, formatIssues, SUBSTITUTION_POOL_NOTE,
  unreferencedExercises, validateRecord,
} from '../model/model.js';
import { allSeedRecords, SEED_CONTENT, SEED_TYPES, seedContentFor, seedCounts } from './content.js';
import { SEED_PROVENANCE } from './provenance.js';

export { SUBSTITUTION_POOL_NOTE };

/**
 * **A declared value, asserted by a test, not an absent check.**
 *
 * No path in this package drops a record because nothing references it. The constant exists so
 * the intent is testable rather than merely missing: an absence is indistinguishable from an
 * oversight to whoever edits this next, and "tidying away orphans" is exactly the well-meant
 * change that would delete the substitution pool.
 *
 * It mirrors `PRUNES_UNREFERENCED_CONTENT` in the local store. Both are false, and both are
 * asserted, because the guarantee has to hold at every layer that could break it.
 */
export const SEED_PRUNES_UNREFERENCED_CONTENT = false;

/** Where the importer leaves a note about the last import. DIAGNOSTICS ONLY — never a decision input. */
export const SEED_IMPORT_META_KEY = 'seed:last-import';

/**
 * Has this installation's library been seeded?
 *
 * Answered from the store's own contents and from nothing else. A tombstoned record counts: the
 * coach deleting everything is a decision, not an empty database.
 *
 * @param {import('../store/store.js').LocalStore} store
 * @returns {Promise<boolean>}
 */
export async function hasBeenSeeded(store) {
  for (const type of SEED_TYPES) {
    if (await store.count(type) > 0) return true;
  }
  return false;
}

/**
 * What is in the library right now, per kind. For a diagnostics screen and for the reset
 * confirmation the interface has to build.
 *
 * @param {import('../store/store.js').LocalStore} store
 * @returns {Promise<{seeded: boolean, stored: Record<string, number>, shipped: Record<string, number>, last_import: any}>}
 */
export async function seedState(store) {
  const stored = {};
  for (const type of SEED_TYPES) stored[type] = await store.count(type);
  return {
    seeded: Object.values(stored).some((n) => n > 0),
    stored,
    shipped: seedCounts(),
    last_import: (await store.getMeta(SEED_IMPORT_META_KEY)) ?? null,
  };
}

/**
 * Import the shipped library IF this installation has never been seeded.
 *
 * This is the call the application makes on start-up. It is safe to call on every start: on a
 * seeded installation it reads three counts and returns, writing nothing.
 *
 * @param {import('../store/store.js').LocalStore} store
 * @param {{now?: number|string|Date}} [options]
 * @returns {Promise<{imported: boolean, reason: string, counts: Record<string, number>, written?: number}>}
 *   `reason` is a machine-readable code, not a sentence to show anyone: `first-run` or
 *   `already-seeded`.
 */
export async function seedIfNeeded(store, options = {}) {
  if (await hasBeenSeeded(store)) {
    const state = await seedState(store);
    return { imported: false, reason: 'already-seeded', counts: state.stored };
  }
  const result = await importSeed(store, options);
  return { imported: true, reason: 'first-run', counts: result.counts, written: result.written };
}

/**
 * Import the shipped library unconditionally, adding what is missing and leaving alone anything
 * whose stored revision is already ahead.
 *
 * This is the plain import. It is what first run uses, and it is deliberately NOT what reset
 * uses: reset must overwrite the coach's edits to shipped records, which is a different and more
 * destructive act with its own confirmation. See `reset.js`.
 *
 * @param {import('../store/store.js').LocalStore} store
 * @param {{now?: number|string|Date}} [options]
 * @returns {Promise<{written: number, skipped: number, counts: Record<string, number>, unreferenced_exercises: number}>}
 */
export async function importSeed(store, options = {}) {
  const { now } = options;
  const records = buildSeedRecords({ device: store.device, now });

  await store.importRecords(records);

  const pool = unreferencedExercises(seedContentFor('routine'), seedContentFor('exercise'));
  const counts = seedCounts();
  const note = {
    at: records[0]?.created_at ?? null,
    device: store.device,
    counts,
    unreferenced_exercises: pool.length,
  };
  await store.setMeta(SEED_IMPORT_META_KEY, note);

  return {
    written: records.length,
    skipped: 0,
    counts,
    unreferenced_exercises: pool.length,
  };
}

/**
 * Every shipped record, wrapped in a fresh envelope, validated, and checked for completeness.
 *
 * Exported because the reset builds on the same wrapping, and because a test can inspect the
 * result without a store.
 *
 * @param {{device: string, now?: number|string|Date, identify?: (type: string, content: Record<string, any>) => string|undefined}} args
 *   `identify` supplies an existing record identity for a content key — the reset uses it so a
 *   restored record keeps the identity, and therefore the history, it already had.
 * @returns {any[]} envelopes
 */
export function buildSeedRecords({ device, now, identify }) {
  assertContentIsSound();

  const records = allSeedRecords().map(({ type, content }) => createEnvelope({
    type,
    // VERBATIM. The envelope nests the content; it does not merge with it, reshape it, or add a
    // field to it. `content.id` stays exactly where the contract put it.
    content,
    device,
    now,
    record_id: identify?.(type, content),
  }));

  const failures = [];
  for (const record of records) {
    const result = validateRecord(record);
    if (!result.ok) failures.push(`${record.type} ${record.content?.id}:\n${formatIssues(result)}`);
  }
  if (failures.length) {
    throw new Error(
      `${failures.length} shipped record(s) do not conform to the record model, so nothing was `
      + `imported:\n\n${failures.slice(0, 5).join('\n\n')}`,
    );
  }

  assertNothingPruned(records);
  return records;
}

/**
 * The shipped content is referentially sound IN THE ONE ENFORCED DIRECTION.
 *
 * Every exercise a routine names must exist, because a routine naming one that does not puts a
 * dangling row on the coach's screen in the middle of a session. **The reverse is not checked and
 * must never be**: {@link SUBSTITUTION_POOL_NOTE}.
 */
function assertContentIsSound() {
  const result = checkLibraryIntegrity({
    exercises: seedContentFor('exercise'),
    routines: seedContentFor('routine'),
  });
  if (!result.ok) {
    throw new Error(`The shipped library is not referentially sound:\n${formatIssues(result)}`);
  }

  for (const type of SEED_TYPES) {
    for (const record of seedContentFor(type)) {
      if (record.provenance !== SEED_PROVENANCE) {
        throw new Error(
          `Shipped ${type} "${record.id}" claims provenance "${record.provenance}". Everything in `
          + `the shipped library is "${SEED_PROVENANCE}" by definition of what it is.`,
        );
      }
    }
  }
}

/**
 * **Every shipped record is going to be written — including the ones nothing references.**
 *
 * This is the guarantee, not a sanity check. It is here because the failure it prevents is
 * silent: an importer that filtered the catalogue to what the routines reach would write a
 * perfectly valid library, pass every other test, and delete the substitution pool. The coach
 * would meet it in front of a client, as a swap with nothing to offer.
 *
 * @param {any[]} records
 */
export function assertNothingPruned(records) {
  const shipped = seedCounts();
  for (const type of SEED_TYPES) {
    const built = records.filter((r) => r.type === type).length;
    if (built !== shipped[type]) {
      throw new Error(
        `The import was about to write ${built} of ${shipped[type]} shipped ${type} records. `
        + `${SUBSTITUTION_POOL_NOTE} Nothing was imported.`,
      );
    }
  }
  if (SEED_PRUNES_UNREFERENCED_CONTENT) {
    throw new Error('This package does not prune unreferenced content, and must not start.');
  }
}

/**
 * The shipped exercises no shipped routine references — the substitution pool, as a list a
 * diagnostics screen can show and a test can assert is non-empty.
 *
 * READ {@link SUBSTITUTION_POOL_NOTE} FIRST. This is a resource, not a cleanup list.
 *
 * @returns {string[]} content keys
 */
export function shippedSubstitutionPool() {
  return unreferencedExercises(SEED_CONTENT.routine, SEED_CONTENT.exercise);
}
