/**
 * THE TYPED FAILURES, and the reason each one exists as its own class.
 *
 * Every failure in this directory is something the interface must SAY to the coach, in plain
 * words, at a moment when he is probably mid-session and not thinking about cryptography. A
 * string match on a message would tie that wording to the logic; a class does not. So each
 * failure carries a stable `code`, a `userMessage` written for him rather than for us, and
 * whatever facts the surfacing screen needs to show both sides of the problem.
 *
 * Three of these are the dangerous states this whole directory was built to make loud.
 * {@link MultipleKeyObjectsFound} and {@link NotConnectedYet} are refusals — the application
 * declining to do something plausible because doing it would split the ciphertext silently.
 * {@link SlotAdditionRaced} is a detection after the fact, which is all the platform allows.
 */

/** Base class for every failure raised here. */
export class CryptoError extends Error {
  /**
   * @param {string} message Written for a developer reading a stack trace.
   * @param {{code: string, userMessage: string, cause?: unknown}} opts
   */
  constructor(message, { code, userMessage, cause } = /** @type {any} */ ({})) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = new.target.name;
    /** @type {string} Stable and machine-readable. Never localise or reword this. */
    this.code = code;
    /**
     * @type {string} What the coach is shown. Plain words, no cryptographic vocabulary, and
     * it always says what to DO rather than only what went wrong.
     */
    this.userMessage = userMessage;
  }
}

/**
 * MORE THAN ONE key object of the same role exists, and the application will not choose
 * between them.
 *
 * ## Why this is a refusal rather than a recovery
 *
 * This state was not theorised. It was reached by accident in about fifteen minutes of
 * ordinary two-device use, because the hidden space does not enforce name uniqueness and
 * raised no error on either device. A naive "adopt the first one" would look like a fix and
 * would still split the ciphertext, silently — one device sealing under one key while the
 * other seals under another, with nothing failing until someone tries to read across.
 *
 * There is no information available to this code that could pick correctly. Picking wrong
 * costs the coach clinical notes he cannot recover. So the application surfaces the state,
 * shows both objects with the dates they were created, and lets a human decide.
 */
export class MultipleKeyObjectsFound extends CryptoError {
  /**
   * @param {string} role Which object: the envelope, or the recovery key.
   * @param {import('../remote/port.js').RemoteFileMeta[]} found Every candidate, so the screen can show both sides.
   */
  constructor(role, found) {
    super(
      `Found ${found.length} ${role} objects in the hidden space where at most one may exist. `
      + 'Refusing to choose between them: adopting the wrong one splits the encrypted notes '
      + 'into two families that cannot read each other, and the split is silent.',
      {
        code: 'multiple_key_objects',
        userMessage:
          'This app has found more than one set of encryption details in your Google account. '
          + 'That can happen if two of your devices set themselves up at the same moment. It is '
          + 'not safe for the app to guess which one to keep, because choosing wrong would make '
          + 'some of your clinical notes unreadable. Nothing has been changed. Please get help '
          + 'sorting this out before adding any more clinical notes.',
      });
    /** @type {string} */
    this.role = role;
    /** @type {import('../remote/port.js').RemoteFileMeta[]} */
    this.found = found;
  }
}

/**
 * This device has never synchronised, so it cannot know whether a key already exists, and it
 * REFUSES to create one.
 *
 * ## The helpful behaviour is the dangerous one
 *
 * The tempting alternative is to generate a key and carry on, so the coach is never blocked.
 * That is exactly how the split happens: the other device already has a key, this one has now
 * made a second, and neither will ever be able to read the other's notes. There is no later
 * moment at which the application could notice and merge them, because both are valid.
 *
 * Refusing costs one clinical note delayed until the device connects once. Not refusing costs
 * an unrecoverable split that surfaces weeks later. Only the clinical note is refused —
 * everything else in the application keeps working offline exactly as before.
 */
export class NotConnectedYet extends CryptoError {
  constructor() {
    super(
      'This device has never reached the hidden space, so it cannot tell whether a key envelope '
      + 'already exists. Refusing to create one: a second envelope would split the ciphertext '
      + 'silently and unrecoverably.',
      {
        code: 'not_connected_yet',
        userMessage:
          'This device has not connected to your Google account yet, so it cannot add a clinical '
          + 'note. Please connect once while you have a signal, so this device can share the same '
          + 'encryption details as your other one. Everything else in the app works normally, and '
          + 'nothing you have already entered is affected.',
      });
  }
}

/**
 * Another device changed the envelope between our read and our write, so the slot we were
 * adding was written on top of theirs — or would have been.
 *
 * ## Detection, never prevention
 *
 * The remote store offers no conditional write. Read-compare-write is therefore detection
 * after the fact and nothing more, and the window between the compare and the write cannot be
 * closed by any code here. What CAN be guaranteed is that a detected clash is never resolved
 * silently: the other device's slot is not discarded, ours is not discarded either, and both
 * sides are surfaced. An unreported conflict is a lost slot whichever way it faces, and a
 * lost slot is a way back into the notes that the coach believes he has and does not.
 */
export class SlotAdditionRaced extends CryptoError {
  /**
   * @param {{fileId: string, heldRevision: number, currentRevision: number,
   *          ourSlotIds: string[], theirSlotIds: string[]}} detail
   */
  constructor(detail) {
    super(
      `The key envelope ${detail.fileId} moved from revision ${detail.heldRevision} to `
      + `${detail.currentRevision} while a slot was being added. Refusing to write over it: the `
      + 'other device\'s slot would be destroyed and the store would report success.',
      {
        code: 'slot_addition_raced',
        userMessage:
          'Another of your devices changed your encryption details at the same moment as this '
          + 'one. To avoid losing either change, this device has not saved anything. Please try '
          + 'again in a moment.',
      });
    Object.assign(this, detail);
  }
}

/** The envelope document could not be understood — corrupted, truncated, or a future version. */
export class EnvelopeUnreadable extends CryptoError {
  /** @param {string} why @param {{cause?: unknown}} [opts] */
  constructor(why, opts = {}) {
    super(`The key envelope could not be read: ${why}`, {
      code: 'envelope_unreadable',
      userMessage:
        'The app could not read the encryption details stored in your Google account. Your '
        + 'clinical notes have not been changed or lost, but they cannot be opened until this is '
        + 'sorted out. Please get help rather than deleting anything.',
      cause: opts.cause,
    });
  }
}

/**
 * No slot on this envelope could open the data key with the credentials offered.
 *
 * The most likely cause is not an attack. It is the device slot having VANISHED: a browser
 * that has not been opened for a week can have its storage cleared out from underneath it if
 * the application was never installed to the home screen. That is exactly the case the design
 * requires be loud rather than silent, which is why this failure names the recovery route
 * instead of merely reporting that decryption failed.
 */
export class NoUsableSlot extends CryptoError {
  /** @param {string[]} triedKinds */
  constructor(triedKinds) {
    super(
      `None of the slots tried (${triedKinds.join(', ') || 'none'}) could open the data key on this device.`,
      {
        code: 'no_usable_slot',
        userMessage:
          'This device can no longer open your clinical notes on its own — its saved encryption '
          + 'details are gone, which can happen if the app was removed from the home screen or the '
          // NOT LOST, NEVER "SAFE" — the same correction d214 made to the screen that words this
          // same condition. This copy is the SOURCE the screen was written from, so leaving it here
          // would have put the claim back the next time anyone quoted the error message.
          + 'browser cleared its storage. Sign in to your Google account to restore access. The '
          + 'notes themselves have not been lost and are still in your Google account.',
      });
    /** @type {string[]} */
    this.triedKinds = triedKinds;
  }
}

/** A caller asked for something this module refuses on its face. Never a remote condition. */
export class CryptoInvalidRequest extends CryptoError {
  /** @param {string} message */
  constructor(message) {
    super(message, {
      code: 'invalid_request',
      userMessage: 'The app asked for something it should not have. This is a fault in the app itself.',
    });
  }
}
