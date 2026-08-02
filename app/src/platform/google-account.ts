/**
 * CONNECTING, SIGNING OUT, AND THE SEPARATE ACT OF ERASING THIS DEVICE.
 *
 * `google-identity.ts` beside this file is the MECHANISM — scopes, gestures, the token and the
 * whitelist that keeps a provider object from escaping. This is the ACT: what the coach means when
 * he taps Connect, what he means when he taps Sign out, and the deliberately separate thing he means
 * when he taps Sign out and erase this device. It is also where the authentication domain of the
 * event log finally acquires a call site, which it has been waiting for since the log was built.
 *
 * ## SIGN OUT DROPS GOOGLE ONLY. IT KEEPS EVERYTHING.
 *
 * Settled as **d110** and not re-opened here. The reasoning is worth carrying because it is what
 * makes the two actions genuinely different rather than one action with a checkbox:
 *
 *  - **The local store is the PRIMARY copy** and Drive is the backup. A sign-out that wiped would
 *    destroy unsynchronised work behind a button that sounds routine, which is the worst shape a
 *    destructive action can have.
 *  - **But a sign-out that never wipes leaves client records in the browser of a borrowed machine**,
 *    and this application will be demonstrated over a video call on somebody else's computer. That
 *    is a real evening, not an edge case.
 *
 * So both exist, they share no button and no confirmation, and the destructive one is named for what
 * it DESTROYS rather than for what it restores — the same shape the admin reset already follows.
 *
 * ## WHAT SURVIVES A SIGN-OUT, STATED RATHER THAN IMPLIED
 *
 * Everything except the Google connection. Clients, sessions, readings, routines, the diet plans,
 * the outbox with its unsent work, the event log, and **the device key slot**. He can sign back in
 * and carry on, and nothing needs recovering, because nothing was taken away. See
 * {@link WHAT_SIGNING_OUT_KEEPS}, which is the sentence a screen must use.
 *
 * ## WHAT ERASING DESTROYS, AND WHAT IT DOES TO THE DEVICE KEY SLOT
 *
 * Erasing deletes the local database, and **the device key slot goes with it** — a browser holds a
 * non-extractable key by keeping the key object in that same local database, so there is no separate
 * place for it to survive in. The consequence is honest and must be said in his words: after erasing,
 * nothing on THIS device can open a clinical note. Nothing is lost overall, because the data key is
 * also reachable through the Google account slot in the hidden Drive space and through a passphrase
 * if he set one, so signing in again on this device recovers it. `erasure-completeness.test.ts`
 * holds this claim to the code rather than to this paragraph: it fails the day anything else starts
 * holding device key material, because a sentence about what is destroyed is only as true as the
 * least-swept copy.
 *
 * ## THE REFUSAL THAT MUST NOT BECOME A DEAD END
 *
 * d110 says erasing will not run until everything pending has synchronised, and that is right: this
 * device holds the only copy of anything not yet backed up. But *pending* has to mean **work that
 * can still be sent**. A permanently refused change never resolves by itself — `core/status/
 * reasons.js` says so in its own words — so a rule that waits for it would leave a coach with one
 * refused entry unable ever to erase a borrowed laptop, for ever, with no way out. A dead end with
 * no exit, built in the name of protecting him.
 *
 * So {@link eraseReadiness} distinguishes two things that are different in KIND and not in degree:
 *
 *  - **WAIT** — something is still being retried and is plausibly about to land. The refusal is
 *    absolute and offers no override, because overriding would throw away work that was about to be
 *    safe, and the cheap fix — connect, tap Sync — costs him nothing.
 *  - **DECIDE** — the refusal names exactly what has not been delivered, says plainly that it will
 *    be lost, and lets him proceed on a separate, explicit acknowledgement.
 *
 * ## AND WAIT IS TIME-BOUNDED, BECAUSE OTHERWISE IT IS THE SAME TRAP ONE LEVEL DOWN
 *
 * The first version of this said WAIT was absolute for as long as anything was queued, on the ground
 * that queued work resolves itself. **It does not always.** If the coach permanently loses access to
 * that Google account — it is closed, suspended, or simply his and no longer reachable — the
 * credential never comes back, the queue never drains, and an absolute WAIT becomes exactly the
 * permanent dead end that was just removed from the refused case, one level down and much harder to
 * see. He would be told to connect and sync by an application that cannot.
 *
 * So WAIT holds only while "it will land on its own" is a claim anybody can still make. The moment
 * the oldest undelivered thing has been stuck past {@link PERSISTENT_WARNING_MS} — the point at
 * which this application's OWN escalation ladder stops treating a delay as a delay and puts a
 * permanent warning on every screen — the verdict becomes DECIDE and the exit opens. The threshold
 * is read from `core/status/levels.js` rather than chosen here, because a second number would be a
 * second opinion about when a delay stops being one.
 *
 * THE INVARIANT, which is the whole point: **there is no state he can be stuck in for ever.** Either
 * the work lands, or the clock carries him to a decision he is allowed to make. Limitation and exit
 * in the same breath, in that order — the same rule the key-material screen follows.
 */

import { JOURNAL_KINDS, recordEvent } from '../../core/journal/journal.js';
import { PERSISTENT_WARNING_MS } from '../../core/status/status.js';
import { DB_NAME } from '../../core/store/store.js';
import type { LocalStore } from '../../core/store/store.js';

import { THEME_STORAGE_KEY } from '../design/theme.ts';
import { CLINICAL_HINT_KEY } from '../screens/clinical-hint.ts';
import { LAST_SESSION_CHOICE_KEY } from '../screens/launcher.ts';
import { SETUP_PROGRESS_KEY } from '../screens/setup-surface.ts';
// THE ONE PLACE THAT KNOWS WHAT THE INTERFACE OFFERS. Read rather than remembered: this module's
// refusal used to describe the screen from memory, and it was wrong in the state the whole feature
// exists for. See `remedyForAction` for the argument, and for why the WORDS still belong here.
import { NO_REMEDY, REMEDY, remedyForAction } from '../shell/action-destinations.ts';
import type { Remedy } from '../shell/action-destinations.ts';

import { GOOGLE_CONNECTION_KEY } from './google-identity.ts';
import type { AcquireOutcome, GoogleConnection, SmallFactStorage, UserGesture } from './google-identity.ts';
import { COACHING_CALENDAR_KEY, GOOGLE_CLIENT_ID_KEY } from './google-settings.ts';
import { CLIENT_ID_PROVEN_KEY, COACHING_CALENDAR_PROVEN_KEY } from './setting-proof.ts';
import { DEVICE_TAG_KEY } from './local-store.ts';
import { PERSISTENCE_JOURNAL_KEY } from './storage-persistence.ts';

/** The sentence a screen must use for what an ordinary sign-out leaves behind. */
export const WHAT_SIGNING_OUT_KEEPS =
  'Signing out disconnects Google on this device. Everything you have saved here stays exactly '
  + 'where it is — your clients, sessions, readings, routines and diet plans, and anything waiting '
  + 'to be backed up. You can sign back in at any time and carry on.';

/** The sentence a screen must use for what the separate, destructive action takes away. */
export const WHAT_ERASING_DESTROYS =
  'Erasing this device deletes everything this app has saved here: your clients, sessions, '
  + 'readings, routines, diet plans, the record of what happened, and the key this device uses to '
  + 'open medical notes. It does not touch your Google Drive backup or your other device. Signing '
  + 'in again on this device brings your practice back from that backup.';

/**
 * Connect Google, and record that an account was authorised for this installation.
 *
 * ## Why a renewal is not a connection, and does not write an entry
 *
 * `auth.account_connected` means *a remote account was authorised for this installation*. The
 * coach's hourly re-tap is the SAME authorisation being renewed, not a new one, and writing an entry
 * for each would fill the log with a dozen connections a day and destroy the one question this kind
 * can uniquely answer — when was this application actually given access. So the entry is written
 * only when this device had no remembered connection beforehand.
 *
 * ## Why a failed append rolls the connection back
 *
 * The append is NOT wrapped in a swallow-and-continue, and the standing rule that the log must never
 * block the application means never block the COACH, not never surface a write that did not land. If
 * the entry cannot be written, this drops the connection again before letting the failure through —
 * so the state and the log agree, and the log's absence stays true. A silent hole in an append-only
 * log is worse than a visible error, because the log's entire value is that an absence means the
 * thing did not happen.
 */
export async function connectGoogleAccount({
  connection,
  gesture,
  store,
}: {
  connection: GoogleConnection;
  gesture: UserGesture | null;
  store: LocalStore;
}): Promise<AcquireOutcome> {
  const outcome = await connection.acquireForGesture(gesture);
  if (outcome.outcome !== 'acquired') return outcome;
  if (!outcome.firstAuthorisation) return outcome;

  try {
    await recordEvent(store, { kind: JOURNAL_KINDS.ACCOUNT_CONNECTED });
  } catch (error) {
    // Undone rather than ignored. See the paragraph above: the point is that the log's silence keeps
    // meaning something. The failure then reaches the caller, which tells him in plain words.
    await connection.dropConnection();
    throw error;
  }

  return outcome;
}

/** What a sign-out did. */
export type SignOutOutcome = {
  readonly outcome: 'signed-out';
  /**
   * Whether Google was actually told. False on a device with no network, which is an ordinary way to
   * sign out and must still work — the access simply stands at Google until it expires or he removes
   * this app in his own Google account settings. Never reported as a completed revocation.
   */
  readonly revokedAtGoogle: boolean;
} | {
  /** There was nothing to sign out of. No entry is written, because nothing happened. */
  readonly outcome: 'not-connected';
};

/**
 * Sign out of Google on this device. LOCAL DATA IS NOT TOUCHED.
 *
 * The entry is written BEFORE the connection is dropped, and that order is deliberate: if the log
 * cannot be written, nothing has been done yet, so the failure leaves the coach exactly where he
 * was. The opposite order would drop the connection and then fail to say so.
 */
export async function signOutOfGoogle({
  connection,
  store,
}: {
  connection: GoogleConnection;
  store: LocalStore;
}): Promise<SignOutOutcome> {
  if (connection.rememberedConnection() === null) {
    return Object.freeze({ outcome: 'not-connected' as const });
  }

  await recordEvent(store, { kind: JOURNAL_KINDS.ACCOUNT_DISCONNECTED });

  const { revokedAtGoogle } = await connection.dropConnection();
  return Object.freeze({ outcome: 'signed-out' as const, revokedAtGoogle });
}

/**
 * The figures the erase gate reads, which are a SUBSET of what `accountabilityStatus()` returns.
 *
 * Declared structurally rather than imported so that this module depends on the SHAPE and not on the
 * status package — but the shape is not invented here, and `google-account.test.ts` proves the point
 * by feeding a real `accountabilityStatus()` result straight in rather than a fixture that agrees
 * with itself.
 */
export interface DeliveryReading {
  /** Queued and still being attempted. */
  readonly pending: number;
  /** Held on a dead credential. A SUBSET of `pending`, and still work that can be sent. */
  readonly waiting_for_credential: number;
  /** Refused by the service. Nothing will move these but a person. */
  readonly rejected: number;
  /** Sent but unconfirmed. Nothing will move these but a person either. */
  readonly ambiguous: number;
  /** What is oldest among everything not yet safely away, so the refusal can say WHAT is at risk. */
  readonly oldest_undelivered_label: string | null;
  /**
   * How long the oldest undelivered thing has been waiting.
   *
   * This is what stops WAIT becoming permanent. `null` means there is nothing undelivered to age.
   */
  readonly oldest_undelivered_age_ms: number | null;
  /**
   * THE LEADING REASON THE INDICATOR IS SHOWING HIM RIGHT NOW — the same object, not a second read.
   *
   * `accountabilityStatus()` returns it under this name and `SyncFromStore.tsx` hands the whole
   * reading to both, so the sentence this gate writes and the control the indicator draws are two
   * renderings of ONE fact. That is the whole of the fix: they cannot disagree, because there is
   * nothing for them to disagree about.
   *
   * Nullable and REQUIRED, deliberately. Null is a real state — everything is backed up and there is
   * no reason to show — and it is not the same as a caller having forgotten to pass one, which the
   * compiler now refuses. A remedy is never guessed from its absence.
   */
  readonly reason: { readonly action: string | null } | null;
}

/**
 * THE READING, OR THE FACT THAT THERE ISN'T ONE — and the gate takes THIS rather than the figures.
 *
 * ## Why the parameter changed shape rather than a flag being added beside it
 *
 * `shell/sync-runner.ts` reads the delivery figures from the local store, and that read can THROW.
 * When it did, nothing published and the seam stood at its empty literal — every figure nought,
 * every age null — and this gate read those four zeroes and returned `clear`. **A DELETION TAKEN ON
 * A FALSE PREMISE**, and unlike a wrong sentence it is not recoverable: this device is the only
 * place unbacked-up work exists.
 *
 * A boolean beside the figures would have re-created that one refactor later, because the next
 * reader of `reading.pending` is under no obligation to consult it. Here the figures are UNREACHABLE
 * without first saying whether they were ever taken, and every caller that used to pass a bare
 * reading stops compiling rather than stopping being safe.
 *
 * `not_yet` is refused on the same ground as `failed`, and the ground is not the exception — it is
 * that NOBODY COUNTED. The seam carries the empty literal for a bounded window before its first read
 * lands, and inside that window the zeroes are as unmeasured as a failed read's. *Do not destroy
 * what you did not count.*
 *
 * The failure is declared STRUCTURALLY, like {@link DeliveryReading} above and for the same reason:
 * the shape is `screens/read-failure.ts`'s `ReadFailure`, and this module may not depend on a screen.
 */
export type DeliveryReadingOutcome =
  | ({ readonly status: 'not_yet' | 'read' } & DeliveryReading)
  | { readonly status: 'failed'; readonly failure: { readonly stage: string; readonly errorName: string } };

/**
 * EVERY ANSWER THIS GATE CAN GIVE, as a value rather than as a type alone.
 *
 * The type is derived FROM this list, so the two cannot come apart: a fourth verdict is a fourth
 * entry here or it does not compile. That matters because a guard has to be able to enumerate the
 * branches AT RUNTIME — a hand-typed list of states in a test is exactly the rot that let the
 * refusal point at a control nobody had built, since no list anybody typed ever grew the state that
 * was wrong.
 */
export const ERASE_VERDICTS = Object.freeze(['clear', 'wait', 'decide', 'unknown'] as const);

/** Whether this device may be erased, and if not, which kind of not. @see ERASE_VERDICTS */
export type EraseVerdict = (typeof ERASE_VERDICTS)[number];

/** The gate's answer, including the words. */
export interface EraseReadiness {
  readonly verdict: EraseVerdict;
  /**
   * WHAT THE WORDS BELOW ARE ALLOWED TO NAME, read off the reason the indicator is showing.
   *
   * Carried on the answer rather than kept inside the sentence so that a guard can hold the two
   * against each other: the prose must name this and nothing else, and this must be what the
   * interface genuinely offers in the same state. A sentence checked only against itself is how
   * "connect to Google and tap Sync" survived every test in this build.
   */
  readonly remedy: Remedy;
  /** Still being retried. Will land on its own. */
  readonly waiting: number;
  /** Permanently stopped. Will never land without a person. */
  readonly stopped: number;
  /** The oldest thing not in the backup, named, or null when there is nothing to name. */
  readonly oldestUndeliveredLabel: string | null;
  readonly headline: string;
  readonly whatHappened: string;
  readonly whatToDo: string;
  /** True on `decide` alone. A `wait` has no override and a `clear` needs none. */
  readonly mayProceedWithAcknowledgement: boolean;
}

/**
 * May this device be erased?
 *
 * @param reading anything with the delivery figures on it — an `accountabilityStatus()` result is one
 */
/**
 * HOW LONG A WAIT CAN LAST, IN HIS UNITS, DERIVED FROM THE LADDER'S OWN FIGURE.
 *
 * Written as a division of {@link PERSISTENT_WARNING_MS} rather than as the number three, so that if
 * the ceiling ever moves the sentence moves with it. A promise about when a refusal ends is worth
 * only as much as its arithmetic.
 */
const WAIT_LASTS_AT_MOST_DAYS = Math.round(PERSISTENT_WARNING_MS / (24 * 60 * 60_000));

/**
 * WHAT HE CAN DO, IN ONE SENTENCE, AND ONLY EVER ABOUT SOMETHING THAT IS THERE.
 *
 * Three shapes and no fourth, one per {@link REMEDY} kind, and the name of the control or the screen
 * is QUOTED — always, and nothing else in a refusal ever is. That is a house rule with a purpose:
 * it makes "what does this sentence tell him to press" a thing a guard can extract from the finished
 * prose instead of a thing a reviewer has to read for, which is how this defect got past a reviewer
 * in the first place.
 *
 * THE THIRD SHAPE IS NOT A FAILURE TO WRITE THE OTHER TWO. Where the core declares no action there
 * is genuinely nothing in this application that helps, and the honest sentence — nothing to press,
 * and where the explanation is — is worth more to him than an invented button. `reasons.js` makes
 * the same argument for leaving those actions null: offering one that does not help is how an
 * indicator earns the reputation of lying.
 */
/** The same sentence, continuing one rather than opening it. The quoted name is untouched. */
function lowerFirst(sentence: string): string {
  return sentence.charAt(0).toLowerCase() + sentence.slice(1);
}

function whatHeCanDo(remedy: Remedy): string {
  if (remedy.kind === REMEDY.ACT) {
    return `Tap "${remedy.named}" on the backup indicator, which is on the edge of every screen.`;
  }
  if (remedy.kind === REMEDY.ADDRESS) {
    return `Open "${remedy.named}" from this screen and see what the backup said about them.`;
  }
  return 'There is nothing here you can press that would help — the backup indicator says what is '
    + 'in the way, and this device keeps trying on its own.';
}

export function eraseReadiness(reading: DeliveryReadingOutcome): EraseReadiness {
  // THE FIRST QUESTION IS NOT HOW MUCH IS OUTSTANDING — IT IS WHETHER ANYBODY COUNTED.
  //
  // Refusing is the only defensible default for a figure nobody measured. There is nothing to
  // acknowledge either: no count was ever put in front of him, so there is nothing he could have
  // agreed to lose, and `EraseAcknowledgement.forReadiness` therefore mints none here.
  if (reading.status !== 'read') {
    return Object.freeze({
      verdict: 'unknown' as const,
      // NO REMEDY. A remedy is read off the reason the indicator is showing him, and this is the
      // state in which there is no reason because there is no reading. Naming a control from a
      // reason nobody read is how an indicator earns the reputation of lying.
      remedy: NO_REMEDY,
      // NOT NOUGHT — nought is a count, and counting is what did not happen. There is no honest
      // number for these two, so the words below quote neither and no sentence anywhere may.
      waiting: 0,
      stopped: 0,
      oldestUndeliveredLabel: null,
      headline: 'This app cannot tell what is backed up on this device',
      whatHappened:
        'This app could not read what is backed up and what is still waiting here, so it does not '
        + 'know whether anything on this device is the only copy. It will not erase work it has not '
        + 'been able to count.',
      whatToDo:
        'Reload the app and open this screen again. If it still cannot read the backup status, '
        + 'close every other window of this app and reload once more.',
      // NO OVERRIDE, and this is the one refusal with no way past it at all. A `decide` names what
      // he would be losing and lets him accept it; here there is nothing to name, so an override
      // would be him agreeing to lose something nobody could describe.
      mayProceedWithAcknowledgement: false,
    });
  }

  // `waiting_for_credential` is a subset of `pending` and is NOT added to it. It is work held on a
  // dead credential, which one tap fixes — usually. See `stuck` below for when it is not.
  const waiting = reading.pending;
  const stopped = reading.rejected + reading.ambiguous;
  const oldestUndeliveredLabel = reading.oldest_undelivered_label;

  // Past the point where this application's own ladder stops calling a delay a delay. Beyond it,
  // "it will land on its own" is no longer a claim anybody can make, so the exit opens.
  const age = reading.oldest_undelivered_age_ms;
  const stuck = age !== null && age >= PERSISTENT_WARNING_MS;

  // THE ONE FACT EVERY SENTENCE BELOW IS ALLOWED TO NAME A CONTROL FROM. Read once, from the reason
  // the coach is being shown, through the table that decides what the interface actually offers.
  const remedy = remedyForAction(reading.reason?.action ?? null);

  if (waiting > 0 && !stuck) {
    return Object.freeze({
      verdict: 'wait' as const,
      remedy,
      waiting,
      stopped,
      oldestUndeliveredLabel,
      headline: 'Not yet — this device still has work that has not been backed up',
      whatHappened:
        `${countOf(waiting, 'change')} on this device ${waiting === 1 ? 'has' : 'have'} not reached `
        + `your Google Drive yet${nameOf(oldestUndeliveredLabel)}. This device is the only place `
        + 'that work exists, so erasing now would lose it.',
      // The remedy first, then the two promises that make this a wait rather than a dead end: it
      // ends by itself when the work lands, and it ends anyway if it does not. The second one used
      // to go unsaid, which was survivable while the first sentence named a cheap fix — and is not,
      // now that the honest answer in several states is that there is no fix to name.
      whatToDo:
        `${whatHeCanDo(remedy)} You do not have to decide anything: once the last change is backed `
        + 'up, this screen will let you carry on, and if it is still waiting after '
        + `${WAIT_LASTS_AT_MOST_DAYS} days this screen will let you erase anyway.`,
      mayProceedWithAcknowledgement: false,
    });
  }

  const atRisk = waiting + stopped;
  if (atRisk > 0) {
    const one = atRisk === 1;
    return Object.freeze({
      verdict: 'decide' as const,
      remedy,
      waiting,
      stopped,
      oldestUndeliveredLabel,
      headline: stopped > 0 && waiting === 0
        ? 'This device has changes Google will not accept'
        : 'This device has changes that have not backed up, and waiting is not fixing it',
      whatHappened:
        `${countOf(atRisk, 'change')} on this device ${one ? 'has' : 'have'} not reached your `
        + `Google Drive${nameOf(oldestUndeliveredLabel)}. ${whyItWillNotResolve(waiting, stopped, stuck)} `
        + `This is yours to decide rather than something to wait out: if you erase this device now, `
        + `${one ? 'that change is' : 'those changes are'} lost and cannot be recovered from your `
        + 'backup.',
      // THE EXIT IS SAID WHATEVER THE REMEDY IS, and it is said second. He is allowed to erase this
      // device from here; what changes with the state is only whether there is anything he could
      // try first. Where there is nothing, that is the sentence — and the decision is still his.
      whatToDo:
        `${one ? 'To keep it' : 'To keep them'}: ${lowerFirst(whatHeCanDo(remedy))} If you have `
        + 'decided they can go, confirm that separately and this device can be erased.',
      mayProceedWithAcknowledgement: true,
    });
  }

  return Object.freeze({
    verdict: 'clear' as const,
    // NOT the remedy for the reason, and this is the one place that is right: nothing is undelivered,
    // so there is nothing to remedy and nothing for this sentence to name. The confirm button below
    // it is this panel's own control and is drawn from `mayProceedWithAcknowledgement` and the
    // verdict, which is where a control belongs — not smuggled in as advice about somewhere else.
    remedy: NO_REMEDY,
    waiting,
    stopped,
    oldestUndeliveredLabel,
    headline: 'Everything on this device is backed up',
    whatHappened: WHAT_ERASING_DESTROYS,
    whatToDo:
      'If this is a computer that is not yours, this is the one to use. Confirm below and this app '
      + 'will remove everything it has saved here.',
    mayProceedWithAcknowledgement: false,
  });
}

/**
 * HE HAS READ WHAT WILL BE LOST AND SAID GO AHEAD — a type, so it cannot be assumed.
 *
 * The same shape as `UserGesture` and for the same reason. An acknowledgement is minted from the
 * READINESS that named what would be lost, so it cannot be a boolean somebody passed `true` for, and
 * it cannot be carried over from a different, calmer reading of the queue.
 */
export class EraseAcknowledgement {
  /**
   * How many permanently stopped changes he accepted losing.
   *
   * CHECKED AGAIN AT THE LAST MOMENT, in {@link signOutAndEraseThisDevice}, and the re-check is the
   * reason this is a number rather than a flag. A readiness is a photograph of the queue, and the
   * queue moves: he can read "1 change will be lost", walk away, have four more refusals land, and
   * come back to press the button he already agreed to. Without the re-check that erase destroys
   * five things on an acknowledgement of one — which is not an acknowledgement of anything, because
   * the whole point of naming what will be lost is that he agreed to THAT loss and not to a larger
   * one nobody showed him.
   */
  readonly stopped: number;

  private constructor(stopped: number) {
    this.stopped = stopped;
  }

  /** The acknowledgement for this readiness, or `null` when there is nothing to acknowledge. */
  static forReadiness(readiness: EraseReadiness): EraseAcknowledgement | null {
    if (!readiness.mayProceedWithAcknowledgement) return null;
    return new EraseAcknowledgement(readiness.stopped);
  }
}

/** The three things erasing a device actually does, as a port so a test can watch it happen. */
export interface DeviceErasure {
  /** Delete the local database outright. The device key slot lives in it and goes with it. */
  deleteLocalDatabase(): Promise<void>;
  /** Forget the small facts kept outside the database: the device tag, and this app's own notes. */
  clearSmallFacts(): void;
}

/** What an erase attempt did, or why it did not. */
export type EraseOutcome = {
  readonly outcome: 'erased';
  readonly revokedAtGoogle: boolean;
} | {
  readonly outcome: 'refused';
  readonly readiness: EraseReadiness;
};

/**
 * SIGN OUT AND ERASE THIS DEVICE — the separate, separately confirmed act.
 *
 * It signs out first, so the disconnection is a real event in the log before the log goes with the
 * database. That is not ceremony: the erase can fail halfway on a browser that refuses to delete a
 * database somebody else has open, and if it does, the coach is left signed out on a device that
 * still holds his data, with an entry saying exactly that.
 *
 * @param acknowledgement required, and only accepted, when the readiness says `decide`
 */
export async function signOutAndEraseThisDevice({
  connection,
  store,
  reading,
  erasure,
  acknowledgement = null,
}: {
  connection: GoogleConnection;
  store: LocalStore;
  reading: DeliveryReadingOutcome;
  erasure: DeviceErasure;
  acknowledgement?: EraseAcknowledgement | null;
}): Promise<EraseOutcome> {
  const readiness = eraseReadiness(reading);

  // NOBODY COUNTED, SO NOTHING IS DESTROYED. This is checked HERE and not only where the panel is
  // drawn: the screen already declines to draw a button, but the gate is the thing that must be
  // un-bypassable, and a caller reaching this function directly is exactly what it exists for. No
  // acknowledgement is consulted, because none can be minted for a reading nobody took.
  if (readiness.verdict === 'unknown') {
    return Object.freeze({ outcome: 'refused' as const, readiness });
  }
  if (readiness.verdict === 'wait') {
    return Object.freeze({ outcome: 'refused' as const, readiness });
  }
  if (readiness.verdict === 'decide') {
    if (acknowledgement === null) {
      return Object.freeze({ outcome: 'refused' as const, readiness });
    }
    // THE ACKNOWLEDGEMENT IS RE-CHECKED AGAINST THE QUEUE AS IT IS NOW, not as it was when he read
    // it. More has stopped since, so what he agreed to lose is not what he would be losing, and the
    // refusal carries the CURRENT readiness — which names the new figure, so the second reading is
    // the one he decides from. Fewer is not refused: he already agreed to more than is now at risk.
    if (readiness.stopped > acknowledgement.stopped) {
      return Object.freeze({ outcome: 'refused' as const, readiness });
    }
  }

  const signOut = await signOutOfGoogle({ connection, store });
  const revokedAtGoogle = signOut.outcome === 'signed-out' && signOut.revokedAtGoogle;

  // The store is closed before the database is deleted: a live connection blocks a delete on this
  // platform, and a delete that silently waits for one is indistinguishable from a hang.
  await store.close();
  await erasure.deleteLocalDatabase();
  erasure.clearSmallFacts();

  return Object.freeze({ outcome: 'erased' as const, revokedAtGoogle });
}

/**
 * Every small fact this application keeps outside the local database.
 *
 * ENUMERATED IN ONE PLACE ON PURPOSE. A promise that erasing removes everything is only as true as
 * the least-swept copy, and the copies that get missed are the operational ones rather than the ones
 * in the data model. A test asserts this list against the keys the application actually writes, so a
 * key added by a later step fails the gate instead of quietly surviving an erase.
 */
export const SMALL_FACT_KEYS = Object.freeze([
  GOOGLE_CONNECTION_KEY,
  DEVICE_TAG_KEY,
  PERSISTENCE_JOURNAL_KEY,
  // Preferences and acknowledgements rather than records, and they are swept all the same. Erasing
  // is for the case where this is somebody else's computer, and a preference left behind is still a
  // trace that says the app was used here and how.
  THEME_STORAGE_KEY,
  CLINICAL_HINT_KEY,
  // How far he got through the one-time setup. His own note of where he stopped, and swept for the
  // same reason as the two above it: this application is demonstrated on somebody else's computer,
  // and a set of ticks left behind afterwards says the app was used here and how far somebody got.
  SETUP_PROGRESS_KEY,
  // Who trained last and what they did — names by identity, so it says who this device coached.
  LAST_SESSION_CHOICE_KEY,
  // The two settings he supplied about Google. Neither is a credential — a client id is public by
  // design and a calendar id is an address — but both say WHO used this device and with what
  // account, which is exactly what erasing is for when the computer belongs to somebody else.
  GOOGLE_CLIENT_ID_KEY,
  COACHING_CALENDAR_KEY,
  // And which VALUE of each has actually been proven to work — the evidence behind the setup screen's
  // statement about whether an id has ever been used. Each holds a copy of the id itself, so the
  // argument above applies to them word for word; and a proof left behind on somebody else's computer
  // says not only that this account was set up here but that it got as far as working.
  CLIENT_ID_PROVEN_KEY,
  COACHING_CALENDAR_PROVEN_KEY,
]);

/**
 * The real erasure, on a real browser.
 *
 * Both globals are reached inside the functions, so importing this module outside a browser is safe.
 */
export function browserErasure(
  global: typeof globalThis,
  storage: SmallFactStorage | null,
): DeviceErasure {
  return {
    deleteLocalDatabase(): Promise<void> {
      return new Promise((resolve, reject) => {
        const request = global.indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error('the local database refused to be deleted'));
        // Another window still holds the database open. Reported rather than waited on: a delete
        // that never settles looks exactly like an application that has hung.
        request.onblocked = () => reject(new Error(
          'Another window or tab still has this app open, so its storage could not be deleted. '
          + 'Close every other window of the app and try again.',
        ));
      });
    },
    clearSmallFacts(): void {
      if (storage === null) return;
      for (const key of SMALL_FACT_KEYS) {
        try {
          storage.removeItem(key);
        } catch (error) {
          console.error('[google] a stored setting could not be cleared', error);
        }
      }
    },
  };
}

/**
 * Why the wait is over, in his words, and it is a different sentence for each cause.
 *
 * Two things can bring him here and they are not the same thing to be told: Google REFUSED
 * something, or Google has simply not been reachable for days. Collapsing them into one sentence
 * would leave him unable to tell a problem he could still fix from one he cannot.
 */
function whyItWillNotResolve(waiting: number, stopped: number, stuck: boolean): string {
  if (stopped > 0 && waiting === 0) {
    return `${stopped === 1 ? 'It was' : 'They were'} refused by Google, or sent without being `
      + `confirmed, so ${stopped === 1 ? 'it' : 'they'} will not back up on `
      + `${stopped === 1 ? 'its' : 'their'} own however long you wait.`;
  }
  if (stopped > 0) {
    return 'Some were refused by Google and some have simply been waiting for days, which usually '
      + 'means this device has not been able to reach your Google account at all.';
  }
  return stuck
    ? 'They have been waiting for days rather than minutes, which usually means this device has not '
      + 'been able to reach your Google account at all.'
    : 'They are still waiting.';
}

/** "1 change" / "3 changes", so a sentence never says "1 changes". */
function countOf(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** ", the oldest being X" — or nothing at all, rather than a dangling empty clause. */
function nameOf(label: string | null): string {
  return label === null || label.length === 0 ? '' : `, the oldest being ${label}`;
}
