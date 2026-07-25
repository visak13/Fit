/**
 * RESET TO DEFAULTS — restore exactly the shipped library.
 *
 * ## What reset does, decided by the content contract rather than inferred here
 *
 *  - It **restores the shipped set**, INCLUDING reverting shipped records the coach has edited.
 *    That is what restoring defaults means. A `shipped-edited` record goes back to its
 *    `shipped-untouched` form.
 *  - It **never touches anything the coach created himself.** A `coach-created` exercise,
 *    routine or pattern is his work, not ours to revert, and it survives untouched.
 *  - It **restores what is missing**, including records he deleted: after a reset the shipped
 *    library is present and whole.
 *  - It is **library-only, and that is settled.** It never touches clients, sessions, readings,
 *    performed records, session notes or diet plans. His client history is not reachable by this
 *    button, and nothing here may describe it as starting a fresh slate.
 *  - It **removes shipped records that are no longer shipped** — a record from an older version
 *    of the library. Removal is a tombstone, so it propagates rather than reappearing from the
 *    remote copy on the next sync.
 *  - It **prunes nothing for being unreferenced.** The catalogue deliberately exceeds the week
 *    and the surplus is the substitution pool; see `import.js`.
 *
 * ## What reset does NOT do, stated so nobody has to guess
 *
 * It does not touch clients, sessions, performed records, readings, session notes or diet plans.
 * This module restores the shipped LIBRARY, which is what the content contract defines and what
 * "reset to defaults" restores. If the admin panel ever offers a wider clear-everything action,
 * that is a different and far more destructive operation with its own confirmation, and it does
 * not belong in the seed package — see `SEED.md`.
 *
 * ## Destructive, and handled properly rather than hidden
 *
 * A professional may well use this experimentally, and reverting his edits is only safe because
 * the confirmation offers to back the data up first. Those two are a pair. This module therefore
 * exposes exactly what an interface needs in order to make that offer honestly:
 *
 *  - {@link describeReset} — everything the confirmation must be able to say, as counts, lists
 *    and machine-readable codes. **It contains no user-facing wording, deliberately.** What the
 *    coach reads is the interface step's to write; this module must not pre-empt it, and a
 *    sentence written here would be the one that ends up on screen unreviewed.
 *  - {@link resetToDefaults} accepts a `backup` function and runs it BEFORE anything is written.
 *    If the backup fails, the reset does not happen: a failed backup followed by a completed
 *    reset is the exact sequence the offer exists to prevent.
 */

import {
  createEnvelope, formatIssues, LIBRARY_TYPES, reviseEnvelope, tombstoneEnvelope, validateRecord,
} from '../model/model.js';
import { libraryPage } from '../store/queries.js';
import { SEED_TYPES, seedContentFor, seedCounts, shippedKeys } from './content.js';
import { assertNothingPruned } from './import.js';
import { COACH_PROVENANCE, EDITED_PROVENANCE, isCoachCreated, isShipped, SEED_PROVENANCE } from './provenance.js';

/**
 * The codes {@link describeReset} speaks in. Codes, not sentences — the words belong upstairs.
 *
 * **There is deliberately no "starts a fresh slate" code here, and none may be added.** That
 * phrasing was withdrawn once it was settled that reset is library-only: it is simply false. It
 * would either frighten the coach away from a safe action, or teach him the button does something
 * it does not — and the second is worse, because he would eventually rely on it. What the
 * interface says is WHAT IS RESTORED and WHAT IS LEFT ALONE, and `scope` is the code for it.
 */
export const RESET_REASON_CODES = Object.freeze({
  action: 'reset-to-defaults',
  scope: 'shipped-library-only-never-client-records',
  why_it_exists: 'restores-the-shipped-library-the-coach-can-freely-edit',
  why_it_is_in_admin: 'destructive-and-rarely-needed',
  backup_first: 'reset-reverts-coach-edits-to-shipped-records',
});

/**
 * A page size for walking the library. Every read here is paged; nothing loads a collection whole.
 */
const PAGE = 100;

/**
 * Every LIVE record of one library kind, walked a page at a time.
 * @param {import('../store/store.js').LocalStore} store @param {string} type
 * @returns {Promise<any[]>}
 */
async function allLibraryRecords(store, type) {
  const out = [];
  let after = null;
  for (;;) {
    const page = await libraryPage(store, type, { limit: PAGE, after });
    out.push(...page.items);
    if (page.done || !page.cursor) return out;
    after = page.cursor;
  }
}

/**
 * What a reset would do, right now, on this store.
 *
 * Everything the confirmation needs and nothing it does not: counts to state the consequence,
 * lists so the coach can see WHICH of his edits are about to go, and codes instead of prose.
 *
 * @param {import('../store/store.js').LocalStore} store
 * @returns {Promise<ResetPlan>}
 */
export async function describeReset(store) {
  /** @type {{type: string, content_key: string, name: string, provenance: string}[]} */
  const revert = [];
  /** @type {{type: string, content_key: string, name: string}[]} */
  const restore = [];
  /** @type {{type: string, content_key: string, name: string, provenance: string}[]} */
  const remove = [];
  /** @type {Record<string, number>} */
  const keep = {};
  /** @type {Record<string, number>} */
  const unchanged = {};

  for (const type of SEED_TYPES) {
    const shipped = new Map(seedContentFor(type).map((c) => [c.id, c]));
    const stored = await allLibraryRecords(store, type);
    keep[type] = 0;
    unchanged[type] = 0;

    const seen = new Set();
    for (const record of stored) {
      const content = record.content ?? {};
      if (isCoachCreated(content)) { keep[type] += 1; continue; }

      const key = content.id;
      const shippedContent = shipped.get(key);
      if (!shippedContent) {
        // Ours once, not ours now: a record from an older shipped library.
        remove.push({ type, content_key: key, name: content.name, provenance: content.provenance });
        continue;
      }
      seen.add(key);
      // Provenance is the contract's signal, but the comparison is what is actually true. A screen
      // that edited a record without updating its provenance would otherwise hide a real change
      // from the coach at the exact moment he is deciding whether to back up.
      if (sameContent(content, shippedContent)) unchanged[type] += 1;
      else revert.push({ type, content_key: key, name: content.name, provenance: content.provenance });
    }

    for (const [key, content] of shipped) {
      if (!seen.has(key)) restore.push({ type, content_key: key, name: content.name });
    }
  }

  const coachCreated = Object.values(keep).reduce((a, b) => a + b, 0);

  return {
    ...RESET_REASON_CODES,
    destructive: true,
    wording_owner: 'interface',
    backup: {
      offer_before: true,
      reason_code: RESET_REASON_CODES.backup_first,
      // Not enforced by this module: an interface may reset without one, and a coach who has
      // never edited anything has nothing to lose. Whether to insist is the interface's call, and
      // `will_revert` is the number that decides it.
      required: false,
    },
    consequences: {
      // What is restored, and what is left alone — the two halves the confirmation must state.
      // NOT "starts a fresh slate": his clients, sessions, readings and diet plans are not
      // reachable by this button, and saying otherwise would be a lie he might come to rely on.
      restored_record_types: SEED_TYPES,
      reverts_coach_edits: revert.length,
      restores_missing: restore.length,
      removes_no_longer_shipped: remove.length,
      leaves_coach_created_untouched: coachCreated,
      already_matching: unchanged,
      untouched_record_types: Object.freeze(
        ['client', 'session', 'performed-record', 'reading', 'session-note', 'diet-plan'],
      ),
    },
    shipped_counts: seedCounts(),
    will_revert: revert,
    will_restore: restore,
    will_remove: remove,
  };
}

/**
 * @typedef {Awaited<ReturnType<typeof describeReset>>} ResetPlan
 */

/**
 * Restore exactly the shipped library.
 *
 * @param {import('../store/store.js').LocalStore} store
 * @param {{backup?: (plan: ResetPlan) => Promise<any>|any, now?: number|string|Date}} [options]
 *   `backup` runs BEFORE anything is written and receives the plan. If it throws or rejects,
 *   NOTHING is written and the rejection is passed on: a failed backup must never be followed by
 *   a completed reset.
 * @returns {Promise<{plan: ResetPlan, backup: 'taken'|'not-offered', written: number, restored: number, reverted: number, removed: number, kept_coach_created: number}>}
 */
export async function resetToDefaults(store, options = {}) {
  const { backup, now } = options;
  const plan = await describeReset(store);

  if (backup) await backup(plan);

  const records = [];
  let reverted = 0;
  let restored = 0;

  for (const type of SEED_TYPES) {
    const stored = await allLibraryRecords(store, type);
    const byKey = new Map(stored.filter((r) => !isCoachCreated(r.content)).map((r) => [r.content?.id, r]));

    for (const content of seedContentFor(type)) {
      const current = byKey.get(content.id);
      if (current) {
        // A REVISION of the record that is already there, so it keeps its identity and its
        // history — and so its revision number GOES UP. That second part is not cosmetic: a
        // reset written as a fresh revision 1 would lose to the remote copy under last-write-wins
        // and the coach's edits would come straight back on the next sync, which reads exactly
        // like the reset button not working.
        records.push(reviseEnvelope(current, shippedForm(content), { device: store.device, now }));
        if (!sameContent(current.content, content)) reverted += 1;
      } else {
        // Nothing live holds this key. A record he deleted leaves a tombstone, and a tombstone
        // carries no content, so it cannot be found by content key and cannot be revived in
        // place: the restored record is a new identity. The tombstone stays a tombstone and
        // still propagates, so the other device does not resurrect the old one.
        records.push(createEnvelope({ type, content: shippedForm(content), device: store.device, now }));
        restored += 1;
      }
      byKey.delete(content.id);
    }

    // Whatever shipped-provenance records are left over came from an older library.
    for (const leftover of byKey.values()) {
      if (!isShipped(leftover.content)) continue;
      records.push(tombstoneEnvelope(leftover, { device: store.device, now }));
    }
  }

  const failures = [];
  for (const record of records) {
    const result = validateRecord(record);
    if (!result.ok) failures.push(`${record.type} ${record.content?.id ?? record.record_id}:\n${formatIssues(result)}`);
  }
  if (failures.length) {
    throw new Error(`The reset would have written ${failures.length} invalid record(s), so nothing `
      + `was written:\n\n${failures.slice(0, 5).join('\n\n')}`);
  }

  // The completeness guarantee again, on the reset path. An import that keeps the whole catalogue
  // and a reset that quietly drops the unreferenced part of it would be the same defect arriving
  // by a different door — and reset is the more dangerous door, because it runs on a library the
  // coach has been working in.
  assertNothingPruned(records.filter((r) => !r.deleted));

  const result = await store.importRecords(records, { overwrite: true });
  const removed = records.filter((r) => r.deleted).length;

  return {
    plan,
    backup: backup ? 'taken' : 'not-offered',
    written: result.written,
    restored,
    reverted,
    removed,
    kept_coach_created: plan.consequences.leaves_coach_created_untouched,
  };
}

/**
 * The shipped form of a content record: exactly what ships, with provenance back to
 * `shipped-untouched` — which is true again the moment the coach's edit has been reverted.
 * @param {Record<string, any>} content
 * @returns {Record<string, any>}
 */
function shippedForm(content) {
  return content.provenance === SEED_PROVENANCE ? content : { ...content, provenance: SEED_PROVENANCE };
}

/**
 * Is the stored content the shipped content, ignoring only provenance?
 *
 * Provenance is excluded because a record can be `shipped-edited` with the edit since undone, and
 * because that field is what reset is going to set anyway. Everything else is compared.
 *
 * @param {Record<string, any>|null|undefined} stored @param {Record<string, any>} shipped
 * @returns {boolean}
 */
export function sameContent(stored, shipped) {
  if (!stored) return false;
  const strip = (/** @type {Record<string, any>} */ o) => {
    const { provenance, ...rest } = o;
    return canonical(rest);
  };
  return strip(stored) === strip(shipped);
}

/**
 * A stable string for a content value: object keys in sorted order at EVERY depth, arrays in
 * their own order because order is meaningful in a routine's entries.
 *
 * Written out rather than done with `JSON.stringify`'s array replacer, which applies its key
 * list at every depth and would silently drop nested fields — a comparison that quietly ignores
 * `scaling` and `entries` would report a heavily edited routine as unchanged, and the coach
 * would not be warned about the edit he was about to lose.
 *
 * @param {any} value
 * @returns {string}
 */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * The library kinds a reset acts on — the shipped kinds, which are the model's library kinds.
 * Asserted rather than assumed, because a fourth library kind added to the model and not to the
 * seed would otherwise be silently outside every reset.
 * @type {readonly string[]}
 */
export const RESET_TYPES = SEED_TYPES;

/** @type {readonly string[]} */
export const MODEL_LIBRARY_TYPES = LIBRARY_TYPES;

export { COACH_PROVENANCE, EDITED_PROVENANCE, shippedKeys };
