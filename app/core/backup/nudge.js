/**
 * THE MONTHLY NUDGE — and the first thing to say about it is what it must never do.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  IT NEVER BLOCKS. THE APPLICATION IS A SUPPORTING ROLE, NOT THE DRIVER.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * An application that stops the coach mid-session to ask about a backup has made itself the point of
 * the hour, and the hour belongs to the client in front of him. {@link BACKUP_NUDGE_BLOCKS} is a
 * declared `false` with a test on it rather than an absent feature, because an absence is
 * indistinguishable from an oversight and the next editor "fixes" it.
 *
 * ## WHY A NUDGE IS LEGITIMATE HERE WHEN IT IS NOT LEGITIMATE ON THE SYNCHRONISATION LADDER
 *
 * This build has a standing rule, earned three times over: before putting anything on an escalating
 * surface, ask whether it EVER RESOLVES BY ITSELF. If it cannot, it does not belong there — a
 * permanent alarm trains the coach to ignore every alarm, and then it cannot warn him when something
 * is genuinely wrong.
 *
 * A missed backup passes that test cleanly. It resolves the moment he takes one, by an act he can
 * perform in one tap, on his own device, with no credential and no network. So it is a legitimate
 * thing to raise — and this module proves the resolution rather than asserting it: the suite drives
 * the nudge from a controlled clock and watches it both APPEAR and DISAPPEAR.
 *
 * **It is deliberately NOT routed through `core/status`.** That ladder floors the whole indicator at
 * overdue while anything needs attention, and the one indicator the coach must trust is not a place
 * to put a housekeeping reminder.
 *
 * ## AND IT IS NOT A PERMANENT BANNER
 *
 * A warning drawn permanently is one he stops seeing. This says nothing at all until a month has
 * passed, and it says nothing again the moment a backup is taken. Between those two states there is
 * no third one where it sits there being ignored.
 *
 * ## NOTHING TO LOSE IS NOT THE SAME AS NOTHING DONE
 *
 * A device the coach has just installed has no backup and needs none. Nagging him on day one, before
 * he has entered a client, teaches him that this message is noise — on the single occasion it is
 * provably wrong. So `holds_records` is an argument and the nudge is silent when it is false. That
 * is the same rule the backup writer itself follows in refusing to write a file holding nothing.
 *
 * No clock. The instant is an argument, which is what makes the timing provable rather than
 * observable.
 */

/**
 * A declared value with a test on it: NOTHING here ever blocks the coach.
 *
 * The maximum this feature may do is say a sentence somewhere he will see it. There is no modal, no
 * interstitial, no confirmation and no refusal to continue anywhere in the nudge, and there may
 * never be one.
 */
export const BACKUP_NUDGE_BLOCKS = false;

/** A month, as this feature counts one: thirty days. */
export const NUDGE_AFTER_DAYS = 30;

/** The same window in milliseconds, which is what the arithmetic uses. */
export const NUDGE_AFTER_MS = NUDGE_AFTER_DAYS * 24 * 60 * 60 * 1000;

/** What it says when he has never taken one. */
export const NEVER_BACKED_UP =
  'You have not saved a copy of your practice outside this app yet. One file holds everything and '
  + 'you can keep it anywhere you like.';

/** What it says when the last one has aged past the window. */
export const DUE_AGAIN =
  'Your last saved copy is over a month old. Saving a new one takes a moment and it is the only '
  + 'copy that does not depend on this device or your Google account.';

/** The words on the control that resolves it. */
export const TAKE_ONE_LABEL = 'Save a copy now';

/**
 * @typedef {Object} BackupNudge
 * @property {boolean} due Whether to say anything at all. False is silence, not a quiet version.
 * @property {'never'|'stale'|null} reason Which of the two situations, or null when silent.
 * @property {string|null} words What to say, or null.
 * @property {string|null} takeLabel The control's words, or null.
 * @property {false} blocks Always. Carried on the value so a surface cannot mislay it.
 * @property {number|null} days_since How long since the last one, whole days. Null when there has
 *   never been one, which is a different sentence rather than a large number.
 */

/**
 * WHETHER TO NUDGE, AND WHY.
 *
 * @param {{last_backup_at?: string|null, holds_records?: boolean, now: string|number|Date}} ctx
 *   `last_backup_at` is when a backup was last SAVED, null if never. `holds_records` is whether
 *   there is anything on this device worth saving.
 * @returns {BackupNudge}
 */
export function backupNudge({ last_backup_at: lastBackupAt = null, holds_records: holdsRecords = true, now } = /** @type {any} */ ({})) {
  const at = instantOf(now, 'A nudge is decided against an instant the caller supplies.');

  if (!holdsRecords) return silent(null);

  if (lastBackupAt === null || lastBackupAt === undefined || lastBackupAt === '') {
    return {
      due: true,
      reason: 'never',
      words: NEVER_BACKED_UP,
      takeLabel: TAKE_ONE_LABEL,
      blocks: BACKUP_NUDGE_BLOCKS,
      days_since: null,
    };
  }

  const last = instantOf(lastBackupAt, 'The time of the last backup is not a time this app can read.');
  const elapsed = at - last;

  // A last-backup time in the FUTURE is a clock that moved, not a backup that has not aged. Treating
  // it as overdue would nag him for having a clock; treating it as fresh is the harmless reading.
  if (elapsed < NUDGE_AFTER_MS) return silent(wholeDays(elapsed));

  return {
    due: true,
    reason: 'stale',
    words: DUE_AGAIN,
    takeLabel: TAKE_ONE_LABEL,
    blocks: BACKUP_NUDGE_BLOCKS,
    days_since: wholeDays(elapsed),
  };
}

/**
 * Whether a backup taken now would clear the nudge. Exists so a caller can say so BEFORE he acts
 * rather than only after, and so a test can prove the disappearance is caused by the backup rather
 * than by the clock moving on.
 *
 * @param {{holds_records?: boolean, now: string|number|Date}} ctx
 * @returns {boolean}
 */
export function nudgeClearedByBackupAt({ holds_records: holdsRecords = true, now }) {
  return backupNudge({ last_backup_at: instantText(now), holds_records: holdsRecords, now }).due === false;
}

/** @param {number|null} daysSince @returns {BackupNudge} */
function silent(daysSince) {
  return {
    due: false,
    reason: null,
    words: null,
    takeLabel: null,
    blocks: BACKUP_NUDGE_BLOCKS,
    days_since: daysSince,
  };
}

/** @param {number} elapsed @returns {number} */
function wholeDays(elapsed) {
  return Math.max(0, Math.floor(elapsed / (24 * 60 * 60 * 1000)));
}

/**
 * An instant as a number of milliseconds, refusing anything that is not one.
 * @param {string|number|Date} value @param {string} complaint @returns {number}
 */
function instantOf(value, complaint) {
  const at = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(at)) throw new TypeError(complaint);
  return at;
}

/** @param {string|number|Date} value @returns {string} */
function instantText(value) {
  return new Date(instantOf(value, 'A backup records when it was taken.')).toISOString();
}
