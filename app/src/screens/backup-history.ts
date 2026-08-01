/**
 * WHETHER A BACKUP HAS EVER COMPLETED ON THIS DEVICE — one historical fact, in history's own words.
 *
 * ## The contradiction this module exists to make unwritable, measured on the running application
 *
 * Two surfaces on the Clients screen answered what looked like one question and disagreed, in front
 * of the coach, at the same instant, with no error anywhere:
 *
 * - the protected clinical field said *"This device is connected to your Google account, and the part
 *   of the app that locks these notes is not finished yet."*
 * - the permanent backup indicator, six inches above it, said *"Google has not been connected on this
 *   device, so nothing can be backed up. Last complete backup: 3 hours ago."*
 *
 * Both were derived correctly. They were answering DIFFERENT QUESTIONS: the screen asked whether a
 * backup has ever COMPLETED here — a fact about the past, read from the persisted completion — and the
 * indicator asked whether Google is reachable with a live credential RIGHT NOW. A sign-out drops the
 * credential and keeps everything local, the persisted completion included (`platform/google-account.ts`
 * says so in its own words), so the two answers come apart the moment he signs out, and again on a
 * device that has just connected and not yet finished its first pass.
 *
 * **The defect was not the wording. It was that a historical fact was being answered in the present
 * tense's vocabulary** — `'connected' | 'never-connected'` — which is the vocabulary the indicator
 * owns. Two questions sharing one set of words will eventually give two answers to what reads as one
 * question, and no amount of copy editing prevents the next author reaching for the same three words.
 *
 * ## So the history question gets its own state, and its own words
 *
 * `has-backed-up` and `never-backed-up` are statements about what this device HAS DONE. They cannot be
 * read as a claim about what it can reach now, they cannot be confused with the indicator's answer, and
 * anything derived from them that starts saying "connected" is a defect a test can see —
 * `one-question-one-vocabulary.test.ts` is that test, and it fails on the sentences as well as on the
 * state names.
 *
 * The present-tense question is NOT asked here and must not be: `core/status` owns it, `shell/sync-indicator.ts`
 * words it, and neither of them imports this file. One question, one source, one vocabulary — twice.
 *
 *     npm run test:shell
 */

/**
 * The three answers, worst-informed first. Frozen and exported as a tuple so that every test which
 * must cover "all of them" DERIVES the set instead of listing it — a hand-maintained list is a list
 * that guards itself rather than the code.
 */
export const BACKUP_HISTORY = Object.freeze(['unknown', 'never-backed-up', 'has-backed-up'] as const);

/**
 * What is known about this device's backup history.
 *
 * `unknown` is not a hedge: on every cold start the local store has not answered yet, and a surface
 * that guessed either of the others while it waited would be telling him something it had not looked up.
 */
export type BackupHistory = typeof BACKUP_HISTORY[number];

/**
 * The one derivation, from the one fact.
 *
 * `client-register-source.ts`'s `hasEverSynchronised` reads the persisted completion — `null` while the
 * read is outstanding — and this turns that answer into the state. It is a function rather than a
 * ternary at the call site so that there is exactly one place where the historical fact becomes words,
 * and so that a second surface asking the same question cannot answer it differently.
 */
export function backupHistoryOf(everSynchronised: boolean | null): BackupHistory {
  if (everSynchronised === null) return 'unknown';
  return everSynchronised ? 'has-backed-up' : 'never-backed-up';
}
