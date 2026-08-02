/**
 * PUTTING A BACKUP BACK — the words and the wiring, and the reason the reset's offer is now an undo.
 *
 * ## WHAT THIS CLOSES
 *
 * The reset-to-defaults confirmation has always offered to save a copy first, and that offer has
 * always produced a real file. Nothing in the application read one back in, so the sentence beside
 * the offer had to say so — a copy he keeps, not an undo button. That was the honest thing to say
 * and it was also a gap: the coach's safety net immediately before a destructive act was a file he
 * would have had to reconstruct by hand.
 *
 * `core/backup/` reads both shapes of file this application has ever written. This is the surface
 * that lets him choose one.
 *
 * ## NOTHING HERE DECIDES ANYTHING
 *
 * `core/backup/restore.js` reads the file, runs the referential gate and writes in one transaction;
 * `core/crypto/portable.js` opens the encrypted one. This file is the words, the file-picking and
 * the reporting. In particular it does NOT catch a refusal and carry on: a restore that was refused
 * is reported AS a refusal, in the core's own sentence, because that sentence names the exercise
 * that is missing and a shorter one would leave him with nowhere to go.
 *
 * ## THE PASSPHRASE IS ASKED FOR ONLY WHEN THE FILE NEEDS ONE
 *
 * A plain backup opens with no friction at all, and putting a passphrase box in front of it would be
 * friction on the path he takes when something has already gone wrong. So the file is sniffed
 * first — an encrypted archive says what it is in its own first bytes — and he is asked only if the
 * answer is yes.
 */

import { PORTABLE_DOCUMENT } from '../../core/crypto/portable.js';
import {
  readBackupArchive, readBackupFile, restoreBackup,
} from '../../core/backup/backup.js';
import type { LocalStore } from '../../core/store/local-store.js';

/** What the section is called. */
export const RESTORE_HEADING = 'Put a backup back';

/**
 * Why he would press it.
 *
 * It says what a restore DOES and — the load-bearing half — what it does not: it adds and replaces,
 * it never empties. A coach who thought this wiped everything first would not dare press it on the
 * one day he needed to.
 */
export const RESTORE_WORDS =
  'What the file holds replaces what is here now; anything it does not mention is left exactly as '
  + 'it is. Nothing is emptied first.';

/** The words on the control that opens the file picker. */
export const CHOOSE_A_FILE = 'Choose a backup file';

/** Said while the file is being read and written. */
export const PUTTING_IT_BACK = 'Putting it back...';

/** Asked only for an encrypted archive. */
export const PASSPHRASE_PROMPT = 'The passphrase you set on this file';

/** Said when an encrypted file was chosen and no passphrase was typed. */
export const PASSPHRASE_MISSING = 'This file is encrypted; it needs the passphrase you set on it.';

/** Said when the passphrase did not open the file. */
export const PASSPHRASE_WRONG =
  'That passphrase did not open this file. Nothing on this device was changed.';

/** How the outcome reads. `warning` is a refusal; `plain` is a success. */
export type RestoreTone = 'plain' | 'warning';

export interface RestoreReport {
  readonly tone: RestoreTone;
  readonly words: string;
  /** True only when records were actually written. */
  readonly restored: boolean;
}

/** What the surface hands in: the chosen file's bytes, and the passphrase if one was typed. */
export interface RestoreRequest {
  readonly bytes: Uint8Array;
  readonly passphrase?: string;
  /** The instant, supplied rather than read, so the words are testable. */
  readonly now: string;
}

/**
 * WHETHER THIS FILE NEEDS A PASSPHRASE, decided from the file rather than from its name.
 *
 * A name can be changed by anyone and by any messaging application that touches it, so asking the
 * file is the only reading that survives the journey it is designed to take.
 *
 * @param bytes the chosen file
 */
export function needsPassphrase(bytes: Uint8Array): boolean {
  // A portable archive is text and says what it is near the front. Only the head is decoded: a
  // backup of a large practice is a large file, and this runs on the coach's phone.
  const head = new TextDecoder().decode(bytes.subarray(0, 512));
  return head.includes(PORTABLE_DOCUMENT);
}

/**
 * PUT A BACKUP BACK, and say what happened in words he can act on.
 *
 * @param store the local store
 * @param request the chosen file, the passphrase if there was one, and the instant
 * @returns what to tell him. A refusal is a REPORT rather than a thrown error, because it is an
 *   ordinary outcome of choosing a file and he needs to read it rather than meet a broken screen.
 */
export async function putABackupBack(
  store: LocalStore,
  request: RestoreRequest,
): Promise<RestoreReport> {
  const encrypted = needsPassphrase(request.bytes);

  if (encrypted && (request.passphrase ?? '') === '') {
    return { tone: 'warning', words: PASSPHRASE_MISSING, restored: false };
  }

  let read;
  try {
    read = encrypted
      ? await readBackupArchive(
        request.passphrase as string,
        new TextDecoder().decode(request.bytes),
      )
      : readBackupFile(request.bytes);
  } catch (error) {
    // A wrong passphrase and an unreadable file are DIFFERENT situations and get different
    // sentences: one is worth trying again, the other is not.
    if (encrypted) return { tone: 'warning', words: PASSPHRASE_WRONG, restored: false };
    return { tone: 'warning', words: sentenceOf(error), restored: false };
  }

  try {
    const done = await restoreBackup(store, read, { now: request.now });
    return { tone: 'plain', words: saidBack(done), restored: true };
  } catch (error) {
    // The core's own sentence, carried through unchanged. It NAMES what is missing, and a shorter
    // one of ours would be a dead end wearing a safety check's clothes.
    return { tone: 'warning', words: sentenceOf(error), restored: false };
  }
}

/**
 * WHAT CAME BACK, counted.
 *
 * A restore that says only "done" is indistinguishable from one that wrote nothing, and the coach
 * has no other way to tell those apart at the moment he most needs to.
 *
 * ## AND IT COUNTS WHAT HE WILL SEE, NOT WHAT THE FILE CARRIED
 *
 * This read `done.kinds`, which is the number of ROWS the file put back — and a backup carries
 * tombstones, because a deletion has to reach the other device. Measured by s11/a11: the sentence
 * said "102 exercises, 12 routines, 16 intensity curves" and the library then showed 100, 7 and 8.
 * The records came back correctly every time; only the number was wrong. That is not a smaller
 * defect than one that understates — it is the same defect pointing the other way, and it lands on
 * the one sentence a coach reads after a disaster restore, where he has nothing else to check it
 * against. So it reads `done.live`, which counts what every list in this application counts.
 *
 * @param done what the core reported
 */
function saidBack(done: {
  written: number; kinds: Record<string, number>; live: Record<string, number>;
}): string {
  const said = Object.entries(done.live)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${count} ${wordFor(kind, count)}`);

  // NOTHING LIVE CAME BACK AND YET ROWS WERE WRITTEN, which is a file of removals and nothing else.
  // "Nothing here changed" would be false — the removals landed — and a list of zeroes would be
  // noise. Reachable only through this branch, and only since the count started counting live
  // records: it is the one case the old sentence could not produce.
  if (said.length === 0 && done.written > 0) {
    return 'Put back: removals only — nothing that shows in a list.';
  }

  if (said.length === 0) return 'That file held nothing to put back.';

  const last = said.pop() as string;
  const list = said.length === 0 ? last : `${said.join(', ')} and ${last}`;
  return `Put back: ${list}.`;
}

/** What each kind is called in a sentence, singular or plural. */
function wordFor(kind: string, count: number): string {
  const words: Record<string, [string, string]> = {
    exercise: ['exercise', 'exercises'],
    routine: ['routine', 'routines'],
    'intensity-pattern': ['intensity curve', 'intensity curves'],
    client: ['client', 'clients'],
    session: ['session', 'sessions'],
    'performed-record': ['performed record', 'performed records'],
    reading: ['reading', 'readings'],
    'session-note': ['note', 'notes'],
    'diet-plan': ['diet plan', 'diet plans'],
  };
  const pair = words[kind] ?? [kind, kind];
  return count === 1 ? pair[0] : pair[1];
}

/** An error's sentence, without the machinery around it. */
function sentenceOf(error: unknown): string {
  return error instanceof Error && error.message !== '' ? error.message : 'That file could not be read.';
}
