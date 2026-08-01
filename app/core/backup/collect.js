/**
 * WALKING THE WHOLE STORE INTO A BACKUP — and refusing rather than writing a short file.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  A BACKUP'S INCOMPLETENESS IS DISCOVERED AT THE MOMENT IT IS THE ONLY COPY LEFT.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ## EVERY STORE QUERY IS PAGED, AND THAT IS THE WHOLE HAZARD
 *
 * A reader built from FIRST PAGES is COMPLETE IN SHAPE AND SHORT IN SUBSTANCE with nothing erroring
 * anywhere. It returns records of every kind, the counts look plausible, the file opens, and the
 * twenty-sixth client is simply not in it. There is no error to notice, at write time or at read
 * time; the only moment it becomes visible is the one moment nothing can be done about it.
 *
 * So {@link collectBackup} walks to the END, and an incomplete walk REFUSES rather than returning
 * what it got. Three separate things can end a walk and only one of them is finishing:
 *
 *  1. the page reports `done` — the range is definitively exhausted, and that is the ONLY success;
 *  2. the cursor FAILS TO ADVANCE — a page hands back the cursor it was given, so the next request
 *     re-reads the same page forever. Caught explicitly, because the alternative is a walk that
 *     never terminates or one capped at some number and silently short;
 *  3. the walk exceeds {@link MAX_PAGES} — a backstop, and reaching it is a REFUSAL, never a
 *     truncation. A cap that returns what it has is the short-file defect wearing a limit's clothes.
 *
 * A full page is reported as not-done even when it happens to have been the last one, which is the
 * store's own contract; so the walk always asks once more than it strictly needed to, and that extra
 * request is the price of knowing.
 *
 * ## WHY THIS WALKS `by_updated_at` AND NOT THE PER-CLIENT INDEX
 *
 * A shared session is returned ONCE PER ATTENDEE by `sessionsForClient`, because per-client is the
 * only index there is for that question. A backup assembled by walking every client and
 * concatenating would therefore hold a two-client session TWICE — and restore a practice in which
 * every shared session appears twice.
 *
 * The answer taken here is not to concatenate and then deduplicate. It is to walk an index over
 * which the duplicate CANNOT ARISE: `changedSince` walks each kind's own `by_updated_at` range, so
 * every record is met exactly once whoever it belongs to. Deduplication by record identity is still
 * applied afterwards, as a belt on a walk that already cannot produce a duplicate, and
 * `collect.test.js` proves BOTH halves: that the per-client walk really does carry a shared session
 * twice (so the hazard is real rather than quoted), and that this walk does not.
 *
 * That index has a second property this needs and the per-client one lacks: it stays valid on a
 * TOMBSTONE, whose content-derived index entries have all gone. A backup that dropped tombstones
 * would restore a practice in which every deleted client came back from the dead.
 */

import { changedSince } from '../store/queries.js';
import { BACKUP_KINDS } from '../artefacts/restorable-backup.js';

/**
 * The lower bound of the walk. Every timestamp this application writes is an ISO instant, and this
 * one sorts below all of them, so the range is "everything" rather than "everything since a date
 * somebody chose".
 */
export const FROM_THE_BEGINNING = '0000-01-01T00:00:00.000Z';

/** How many records a page asks for. Larger than a screen's page: nobody is reading this one. */
export const BACKUP_PAGE = 200;

/**
 * The backstop. Reaching it REFUSES; it never truncates.
 *
 * At {@link BACKUP_PAGE} records a page this is two hundred thousand records of one kind, which is
 * far beyond any practice this application is for. It exists so that a store misbehaving in a way
 * nobody predicted ends in a sentence rather than in a loop.
 */
export const MAX_PAGES = 1000;

/** Said when a walk could not be completed. The caller must not write a file after seeing this. */
export class BackupIncomplete extends Error {
  /** @param {string} message @param {{kind: string, gathered: number}} detail */
  constructor(message, detail) {
    super(message);
    this.name = 'BackupIncomplete';
    this.kind = detail.kind;
    this.gathered = detail.gathered;
  }
}

/**
 * EVERY RECORD OF EVERY KIND, walked to the end.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {{taken_at: string, pageSize?: number}} ctx The instant is supplied: this package holds no
 *   clock, so two backups of the same practice differ only where the practice differs.
 * @returns {Promise<import('../artefacts/restorable-backup.js').BackupSet>} Ready for `backupParts`,
 *   which is what refuses a set that is empty in every kind at once.
 * @throws {BackupIncomplete} When any kind's walk did not reach the end. Nothing partial is returned.
 */
export async function collectBackup(store, { taken_at: takenAt, pageSize = BACKUP_PAGE } = /** @type {any} */ ({})) {
  if (typeof takenAt !== 'string' || takenAt === '') {
    throw new TypeError('A backup records when it was taken; this package holds no clock, so the caller supplies it.');
  }

  /** @type {Record<string, any[]>} */
  const kinds = {};
  for (const kind of BACKUP_KINDS) {
    kinds[kind] = await walkToTheEnd(store, kind, pageSize);
  }

  return { kinds, taken_at: takenAt, device: store.device };
}

/**
 * One kind, from the beginning to the definitive end of its range.
 *
 * Exported because the RESTORE needs the same guarantee when it reads the target store to check
 * references against: a referential check run over a first page would confirm that every exercise a
 * routine names exists, having looked at twenty-five of them. That is a check that passes because it
 * did not look, which is the failure this build keeps meeting from every direction.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {string} kind @param {number} [pageSize]
 * @returns {Promise<any[]>}
 * @throws {BackupIncomplete} Rather than returning what it managed to read.
 */
export async function walkToTheEnd(store, kind, pageSize = BACKUP_PAGE) {
  /** @type {Map<string, any>} */
  const byIdentity = new Map();
  /** @type {string|null} */
  let after = null;
  let pages = 0;

  for (;;) {
    if (pages >= MAX_PAGES) {
      throw new BackupIncomplete(
        `Reading the ${kind} records did not finish after ${MAX_PAGES} pages, so this backup would `
        + 'have been written short. Nothing was saved.',
        { kind, gathered: byIdentity.size },
      );
    }
    pages += 1;

    const page = await changedSince(store, kind, FROM_THE_BEGINNING, { limit: pageSize, after });

    for (const record of page.items ?? []) {
      // A belt on a walk that cannot produce a duplicate. See this file's header: the strap is the
      // choice of index, and this is here so that a later change of index cannot silently
      // reintroduce the doubled session.
      if (typeof record?.record_id === 'string') byIdentity.set(record.record_id, record);
      else byIdentity.set(`${byIdentity.size}`, record);
    }

    if (page.done) return [...byIdentity.values()];

    // A page that hands back the cursor it was given would be re-read forever. That is not a walk
    // that is taking a while; it is a walk that has stopped, and the file must not be written.
    if (page.cursor === null || page.cursor === after) {
      throw new BackupIncomplete(
        `Reading the ${kind} records stopped before the end, so this backup would have held only `
        + `${byIdentity.size} of them. Nothing was saved.`,
        { kind, gathered: byIdentity.size },
      );
    }
    after = page.cursor;
  }
}
