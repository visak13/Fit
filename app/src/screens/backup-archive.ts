/**
 * THE COPY HE KEEPS OUTSIDE GOOGLE ENTIRELY — the words, the wiring, and the monthly nudge.
 *
 * ## WHY THIS FILE EXISTS AT ALL, IN ONE SENTENCE HE WOULD RECOGNISE
 *
 * Everything else backs up to his own Drive. That is a real backup and it is not an INDEPENDENT one:
 * a dead device plus a lost or suspended Google account loses the original and the copy together,
 * because they sit under one credential. This is the only file in the application that survives
 * losing the account, and the passphrase is what makes it safe to put anywhere.
 *
 * ## NOTHING HERE IS NEW MACHINERY
 *
 * `core/backup/` walks the practice and seals it through `core/crypto/portable.js`;
 * `share-delivery.ts` gets the file to him and says which way it went. This file is the words, the
 * one meta value that remembers when he last did it, and the nudge that reads it.
 *
 * ## THE NUDGE LIVES HERE RATHER THAN ON THE SYNCHRONISATION LADDER, DELIBERATELY
 *
 * That ladder floors the whole indicator at overdue while anything needs attention, and the one
 * indicator the coach must trust is not a place to put a housekeeping reminder. A missed backup also
 * passes the test that ladder's entries have to pass and this one would fail there for a different
 * reason: it RESOLVES BY ITSELF the moment he takes one, in a single tap, with no credential and no
 * network — so it belongs beside the control that resolves it, not on a surface about synchronising.
 *
 * ## AND THE INSTANT IS RECORDED ONLY AFTER THE FILE REALLY LEFT
 *
 * `last_backup_at` is written after delivery reports success and not before. A nudge cleared by an
 * attempt rather than by an outcome is a nudge that goes quiet on the one occasion it was right.
 *
 * ## AND THE DISCLOSURE ITSELF IS RECORDED, INCLUDING WHEN IT DID NOT HAPPEN
 *
 * The stamp above answers "when did he last take a copy". The event log answers a different
 * question — what was recorded, in order, including the attempts that produced no file: an empty
 * practice, a walk that could not be read to the end, a share sheet he dismissed. Neither surface
 * substitutes for the other, and the sink that carries the entry is a REQUIRED field of
 * {@link ArchiveRequest} for the reason written at `export-audit.ts`.
 */

import {
  BACKUP_ARCHIVE_FILE_EXTENSION, BACKUP_ARCHIVE_MEDIA_TYPE, BACKUP_ARCHIVE_TITLE, backupCounts,
  backupNudge, collectBackup, sealBackupArchive,
} from '../../core/backup/backup.js';
import { exportFileName } from '../../core/export/export.js';
import type { LocalStore } from '../../core/store/local-store.js';
import { deliverFile, describeDelivery, wasCancelled } from '../platform/share-delivery';
import type { DownloadSurface, SharingSurface } from '../platform/share-delivery';
import { toneOf } from './diet-export';
import type { ExportTone } from './diet-export';
import { auditedExport } from './export-audit';
import type { ExportAudit } from './export-audit';

/**
 * Where the instant of the last saved copy lives.
 *
 * A meta value rather than a record: it is a fact about THIS DEVICE and its habits, not part of the
 * practice, and it must not travel to another device and tell that one it has a copy it does not.
 */
export const LAST_BACKUP_META = 'last_backup_archive_at';

/** What the section is called. */
export const ARCHIVE_HEADING = 'Save a copy you can keep anywhere';

/**
 * Why he would press it, said in terms of the thing it protects against rather than the mechanism.
 *
 * It names the honest cost in the same breath as the benefit, because a passphrase he sets and then
 * loses is the one way this file becomes useless, and he should know that before he sets one rather
 * than when he needs it.
 */
export const ARCHIVE_WORDS =
  'One file holding your whole practice, locked with a passphrase you choose. It still works if you '
  + 'lose your Google account, and the passphrase is the only way into it — write the passphrase '
  + 'down separately from the file.';

/**
 * THE ONE THING THIS FILE DOES NOT GIVE HIM BACK ON ITS OWN, said before he relies on it.
 *
 * The medical reminders and their links are stored SEALED, under the data key his devices share
 * through his Google account — not under this file's passphrase. They travel inside the copy, still
 * sealed, and they come back sealed. On a device that has adopted that key they open as usual; on
 * one that never has, everything else restores and those fields do not.
 *
 * This is a real limit and it is stated rather than discovered. A coach restoring onto a borrowed
 * laptop after losing his phone is exactly the person who must not find this out by meeting a row he
 * cannot read. `restore.test.js` asserts the behaviour this sentence describes, so the sentence
 * cannot quietly stop being true.
 */
export const CLINICAL_STAYS_LOCKED =
  'The medical reminders and their links are locked with your Google account key, not with this '
  + 'passphrase. On a device that has never connected to that account, everything else comes back '
  + 'and those do not.';

/** The words on the control. */
export const SAVE_THE_COPY = 'Save the copy';

/** Said while the practice is being read, sealed and handed over. */
export const SAVING_THE_COPY = 'Saving your copy...';

/** Asked for, every time, because there is no other way in. */
export const CHOOSE_A_PASSPHRASE = 'A passphrase for this file';

/** Said when he pressed it with the box empty. */
export const PASSPHRASE_NEEDED = 'This file needs a passphrase.';

/** Said when there is nothing on this device yet. */
export const NOTHING_TO_SAVE = 'Nothing to save yet.';

export interface ArchiveReport {
  readonly tone: ExportTone;
  readonly words: string;
  /** The instant the copy was saved, or null when it was not. */
  readonly saved_at: string | null;
}

export interface ArchiveSurfaces {
  /** Absent when the browser has no share sheet at all, which is the ordinary desktop case. */
  readonly sharing?: SharingSurface;
  readonly download: DownloadSurface;
}

export interface ArchiveRequest {
  readonly passphrase: string;
  /** The instant, supplied rather than read, so the words and the nudge are testable. */
  readonly at: string;
  readonly surfaces: ArchiveSurfaces;
  /**
   * WHERE THE DISCLOSURE IS RECORDED, and it is a required field for the reason written at
   * `export-audit.ts`: an optional sink is one a later call site omits and still compiles, and the
   * omission is undetectable afterwards. This is the copy that leaves Google entirely, so it is the
   * last export whose absence from the log should be possible.
   */
  readonly audit: ExportAudit;
}

/**
 * WHAT THE CARD NEEDS TO KNOW BEFORE HE PRESSES ANYTHING: whether a nudge is due, and whether there
 * is anything here to save.
 *
 * @param store the local store
 * @param now the instant, supplied
 */
export async function readArchiveState(store: LocalStore, now: string): Promise<{
  readonly last_backup_at: string | null;
  readonly holds_records: boolean;
  readonly nudge: ReturnType<typeof backupNudge>;
}> {
  const lastBackupAt = (await store.getMeta(LAST_BACKUP_META)) ?? null;

  // "Anything to lose" is asked of the RECORDS rather than of a flag somebody set, because a flag is
  // a second reading of a truth the store already holds and the two would eventually disagree.
  let held = 0;
  for (const kind of ['client', 'exercise', 'routine', 'intensity-pattern', 'session', 'diet-plan']) {
    held += await store.count(kind);
    if (held > 0) break;
  }
  const holdsRecords = held > 0;

  return {
    last_backup_at: lastBackupAt as string | null,
    holds_records: holdsRecords,
    nudge: backupNudge({ last_backup_at: lastBackupAt as string | null, holds_records: holdsRecords, now }),
  };
}

/**
 * MAKE THE COPY AND GET IT TO HIM, and report what actually happened.
 *
 * Every failure ends in a sentence rather than an exception, because this is called from a tap and a
 * coach must never meet "something went wrong". The two that matter are told apart: a practice that
 * could not be READ TO THE END refuses in the core's own words and writes no file at all, and a
 * delivery he dismissed is not a failure and must never be worded as one.
 *
 * @param store the local store
 * @param request the passphrase, the instant, and how to deliver
 */
export async function saveBackupArchive(
  store: LocalStore,
  request: ArchiveRequest,
): Promise<ArchiveReport> {
  /*
   * HOW MANY RECORDS THE FILE HELD, held here so the entry can carry it.
   *
   * It stays null on every path where nothing was walked — an empty passphrase refuses before the
   * practice is read at all — so the log never states a count it did not measure. Where the walk DID
   * happen and found nothing, it is a genuine zero, and a refusal carrying zero is exactly the
   * account he needs of a copy that was not taken.
   */
  let held: number | null = null;

  return auditedExport(
    request.audit,
    async (): Promise<ArchiveReport> => {
      if (request.passphrase.trim() === '') {
        return { tone: 'warning', words: PASSPHRASE_NEEDED, saved_at: null };
      }

      let text: string;
      let total: number;
      try {
        const set = await collectBackup(store, { taken_at: request.at });
        total = backupCounts(set).total;
        held = total;
        if (total === 0) return { tone: 'warning', words: NOTHING_TO_SAVE, saved_at: null };
        text = await sealBackupArchive(request.passphrase, set, { at: request.at });
      } catch (error) {
        // An incomplete walk refuses HERE, before a file exists. A short backup is the worst defect
        // available to this feature, because it is discovered when it is the only copy left.
        return { tone: 'warning', words: sentenceOf(error), saved_at: null };
      }

      const name = exportFileName(BACKUP_ARCHIVE_TITLE, BACKUP_ARCHIVE_FILE_EXTENSION);
      const file = new File([text], name, { type: BACKUP_ARCHIVE_MEDIA_TYPE });

      const delivery = await deliverFile(file, {
        sharing: request.surfaces.sharing,
        download: request.surfaces.download,
      });

      // A dismissal is not a save, and recording the instant for one would silence the nudge on the
      // occasion it was most right. `downloaded` IS a save: the file is on the device, which is exactly
      // where a copy he keeps elsewhere starts its journey.
      if (delivery.outcome !== 'shared' && delivery.outcome !== 'downloaded') {
        return {
          tone: toneOf(delivery),
          words: describeDelivery(delivery, name),
          saved_at: null,
        };
      }

      await store.setMeta(LAST_BACKUP_META, request.at);

      return {
        tone: toneOf(delivery),
        words: `${describeDelivery(delivery, name)} It holds ${total} ${total === 1 ? 'record' : 'records'}, `
          + 'and the passphrase you set is the only way into it.',
        saved_at: request.at,
      };
    },
    () => held,
  );
}

/** An error's sentence, without the machinery around it. */
function sentenceOf(error: unknown): string {
  if (wasCancelled(error)) return 'Nothing was saved.';
  return error instanceof Error && error.message !== '' ? error.message : 'The copy could not be made.';
}
