/**
 * THE ENCRYPTED ARCHIVE — one file the coach can put anywhere outside Google, and the reason it is
 * the only independent copy he has.
 *
 * ## WHY THIS EXISTS AT ALL
 *
 * Everything else in this application backs up to the coach's own Drive. That is a real backup and
 * it is not an INDEPENDENT one: a dead device plus a lost or suspended Google account loses
 * everything at once, because the copy and the original sit under one credential. This file is the
 * answer to that, and it is the only one available inside a no-backend design.
 *
 * ## NO NEW CRYPTOGRAPHY. NONE. THIS MODULE COMPOSES.
 *
 * `core/crypto/portable.js` already seals a payload under a passphrase alone, and it was built for
 * exactly this. It mints a key that belongs to ONE FILE, wraps it in a passphrase slot, seals the
 * payload with the archive's own identity bound in as additional data, and puts the whole envelope
 * INSIDE the file — so the archive opens years later, on a borrowed laptop, with the phone lost and
 * the account gone.
 *
 * This module writes no algorithm, no salt, no iteration count and no key handling. It turns a
 * practice into text and hands the text over. **A second key path is how two incompatible families
 * of ciphertext get created**, and the way to not have one is to not write one.
 *
 * ## THE PAYLOAD IS THE SAME DOCUMENT THE PLAIN BACKUP CARRIES
 *
 * Deliberately, and it is the reason there is one restore rather than two. The archive holds the
 * ZIP's parts as text rather than a different, archive-shaped document, so `readBackupParts` reads
 * an opened archive and an opened file through the same door. A format that only the encrypted path
 * produced would be a second format, and a second format is a second thing that can rot untested.
 */

import { sealPortableArchive } from '../crypto/portable.js';
import { backupParts } from '../artefacts/restorable-backup.js';

/** The archive's own name, before the extension. */
export const BACKUP_ARCHIVE_TITLE = 'Fit backup (encrypted)';

/**
 * What the archive is called on disk. Its own extension rather than `.zip`, because it is not one
 * and a coach who double-clicks it should be told so by his own machine rather than by an error.
 */
export const BACKUP_ARCHIVE_FILE_EXTENSION = '.fitbackup';

/** The media type. Text, because the sealed archive IS text: it is a self-describing document. */
export const BACKUP_ARCHIVE_MEDIA_TYPE = 'application/json';

/**
 * The parts of a backup, as the object the archive carries.
 *
 * @param {import('../artefacts/restorable-backup.js').BackupSet} set
 * @returns {Record<string, string>} Part name to text.
 */
export function backupPartsObject(set) {
  /** @type {Record<string, string>} */
  const parts = {};
  for (const part of backupParts(set)) parts[part.name] = part.text;
  return parts;
}

/**
 * SEAL A PRACTICE INTO ONE ENCRYPTED FILE.
 *
 * @param {string} passphrase The passphrase the coach set. The only way in, by design.
 * @param {import('../artefacts/restorable-backup.js').BackupSet} set
 * @param {{at: string}} ctx The instant, supplied rather than read.
 * @returns {Promise<string>} The archive as text, ready to be written into a file.
 * @throws {TypeError} Through `backupParts`, on a set missing a kind or empty in every kind.
 */
export async function sealBackupArchive(passphrase, set, { at } = /** @type {any} */ ({})) {
  const parts = backupPartsObject(set);
  return sealPortableArchive(passphrase, JSON.stringify(parts), { at });
}
