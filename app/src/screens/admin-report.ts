/**
 * WHAT THE ADMIN SCREEN SAYS ABOUT THIS DEVICE — the whole derivation, and none of the drawing.
 *
 * It is separate from the screen for the same reason `sync-indicator.ts` is separate from the chip:
 * this is where the judgements live — which of six states the device is in, which words go with it,
 * and, the one that matters most here, WHAT STAYS ON THE SCREEN AND WHAT FOLDS AWAY. Those are
 * decisions that can be asserted, and a decision buried in a `.tsx` among the markup is a decision
 * nothing checks, because the test runner for this application is `node --test` over `.ts` and it
 * cannot render a component.
 *
 * ## The rule that shapes the split, and it is the dense-screen rule
 *
 * A dense screen stays legible through HIERARCHY AND PROGRESSIVE DISCLOSURE, and never by
 * discarding information. So nothing here is dropped: every field of the record reaches the screen.
 * What differs is only WHERE.
 *
 * PERMANENT — the answer in words, the literal answer the browser gave beside it, any failure, and
 * the sentence about what a grant does not buy. A coach on a video call being asked "did it work"
 * reads those without touching anything.
 *
 * FOLDED — the forensic remainder: the type of that literal value, whether it was already persisted
 * before we asked, when it was asked, and the byte-exact figures. One tap away, counted on the
 * summary so what is folded is still accounted for, and never needed to answer a question he
 * actually has.
 *
 * A failure is deliberately NOT foldable. It is the one field that changes what he should do next.
 *
 * ## AND, SINCE s9, THE WORDS IN FRONT OF THE TWO WAYS OUT OF THIS DEVICE
 *
 * `platform/google-account.ts` has held both acts — the plain sign-out and the separate
 * sign-out-and-erase — since the Google step, correct, journalled and tested, WITH NO PRODUCTION
 * CALLER. A correct routine nothing calls is not a feature the coach has; he could not sign out at
 * all. The mechanism is untouched here. What was missing and is added below is the REACH and the
 * COPY, and the copy is as much the deliverable as the button, for one reason:
 *
 * **HE CANNOT INFER WHICH ACT TAKES WHAT.** Both are spelled "sign out" in the first two words, one
 * keeps his entire practice and one destroys it, and the difference that is hardest to guess is the
 * one nothing on a screen has ever mentioned to him — THE DEVICE KEY SLOT. It survives a plain
 * sign-out, so his medical notes still open afterwards; it is destroyed by an erase, so nothing on
 * this device can open one until he signs in again. So both sentences are said, in his words, in
 * front of both acts. See {@link DEVICE_KEY_SURVIVES_SIGNING_OUT} and
 * {@link DEVICE_KEY_IS_DESTROYED_BY_ERASING}.
 *
 * **AND EACH ACT IS NAMED FOR WHAT IT DESTROYS RATHER THAN FOR WHAT IT RESTORES** — the shape
 * `google-account.ts` and `client-removal.ts` both already follow, and the reason a destructive
 * control is safe to offer at all.
 */

import { eraseReadiness, WHAT_ERASING_DESTROYS, WHAT_SIGNING_OUT_KEEPS } from '../platform/google-account';
import type { DeliveryReadingOutcome, EraseReadiness, EraseVerdict } from '../platform/google-account';
import type { PersistenceRecord } from '../platform/storage-persistence';

/** One label and the value it names, in the order the screen shows them. */
export interface ReportPair {
  readonly label: string;
  /** True when the value came from the machine verbatim and is drawn as `<code>`. */
  readonly literal: boolean;
  readonly value: string;
}

/**
 * How the answer is drawn as a chip. Only ever `success` or `neutral`: a refusal is not a fault and
 * an unsupported browser is not a fault, and drawing either as a warning would be the application
 * raising its voice about something the coach cannot act on and that costs him nothing while the
 * backup path works. A real failure is loud in words instead, permanently, in its own pair.
 */
export type AnswerTone = 'success' | 'neutral';

export interface PersistenceReport {
  /** The state, named. Kept so a test asserts the branch rather than the sentence it produced. */
  readonly state: 'pending' | 'granted' | 'refused' | 'unsupported' | 'failed' | 'unanswered';
  /** The chip's word. Short enough to read at a glance on a phone. */
  readonly word: string;
  readonly tone: AnswerTone;
  /** What that means for him, in his words rather than the interface's. */
  readonly plainWords: string;
  /** Permanently on screen, under the words. Never empty. */
  readonly permanent: readonly ReportPair[];
  /** One tap away, counted on the summary. */
  readonly folded: readonly ReportPair[];
}

/** The one figure this screen exists to show, and the sentence that gives it its scale. */
export interface StorageReading {
  /** The `.value-display`: what the application is using, rounded to something readable. */
  readonly used: string;
  /** What that is out of, or the plain admission that the browser did not say. */
  readonly capacity: string;
}

const BYTES_PER_GIGABYTE = 1024 ** 3;
const GIGABYTE_DECIMALS = 2;

/** A size a person reads, rather than a size a machine reported. The exact figure is kept too. */
function gigabytes(bytes: number): string {
  return `${(bytes / BYTES_PER_GIGABYTE).toFixed(GIGABYTE_DECIMALS)} GB`;
}

/**
 * The storage figures, or the honest absence of them.
 *
 * `estimate()` is optional in the platform and its numbers are deliberately approximate, so "not
 * reported" is a real answer about this device rather than a hole in the screen — and it is said in
 * words instead of being left as a blank where a number should be.
 */
export function describeStorage(record: PersistenceRecord | null): StorageReading {
  if (record === null || record.usageBytes === null) {
    return {
      used: 'Not reported',
      capacity: 'This browser does not tell the application how much room it is using.',
    };
  }

  if (record.quotaBytes === null) {
    return {
      used: gigabytes(record.usageBytes),
      capacity: 'This browser does not say how much room it allows in total.',
    };
  }

  return {
    used: gigabytes(record.usageBytes),
    capacity: `of the ${gigabytes(record.quotaBytes)} this browser allows the application on this device.`,
  };
}

/** `true` and `'true'` have to stay distinguishable, so the value is shown as it would be written. */
function literalValue(value: boolean | null): string {
  return JSON.stringify(value);
}

/**
 * Everything the screen says about persistence, derived once.
 *
 * A pending record is a real state and not a blank: the request is asynchronous and the screen can
 * be open before it settles, which on a slow device is a second of a screen saying nothing at all
 * about the thing it exists to report.
 */
export function describePersistence(record: PersistenceRecord | null): PersistenceReport {
  if (record === null) {
    return {
      state: 'pending',
      word: 'Still asking',
      tone: 'neutral',
      plainWords:
        'The browser has not answered yet. This takes a moment on the first start after installing.',
      permanent: [{ label: 'What the browser answered', literal: false, value: 'Nothing yet' }],
      folded: [],
    };
  }

  const folded: ReportPair[] = [
    {
      label: 'The type of that answer',
      literal: true,
      value: record.literalAnswerType,
    },
    {
      label: 'Already kept before asking',
      literal: true,
      value: literalValue(record.alreadyPersisted),
    },
    { label: 'Asked at', literal: false, value: record.askedAt },
    {
      label: 'Room used, to the byte',
      literal: false,
      value: record.usageBytes === null ? 'Not reported' : `${record.usageBytes} bytes`,
    },
    {
      label: 'Room allowed, to the byte',
      literal: false,
      value: record.quotaBytes === null ? 'Not reported' : `${record.quotaBytes} bytes`,
    },
  ];

  const answered: ReportPair = {
    label: 'What the browser answered',
    literal: true,
    value: literalValue(record.literalAnswer),
  };

  // A failure stays beside the answer rather than folding with the rest. It is the only field here
  // that changes what the coach should do next, and progressive disclosure is for the detail behind
  // a decision, never for the thing the decision is about.
  const failed: ReportPair[] =
    record.failure === null
      ? []
      : [{ label: 'What went wrong', literal: false, value: record.failure }];

  if (!record.supported) {
    return {
      state: 'unsupported',
      word: 'Cannot be asked',
      tone: 'neutral',
      plainWords:
        'This browser has no way to be asked to keep the data, so it was not asked. Everything still works; keep your backups current.',
      permanent: [answered, ...failed],
      folded,
    };
  }

  if (record.failure !== null) {
    return {
      state: 'failed',
      word: 'The request failed',
      tone: 'neutral',
      plainWords:
        'The browser was asked and something went wrong before it answered. Nothing has been lost by this; keep your backups current.',
      permanent: [answered, ...failed],
      folded,
    };
  }

  if (record.literalAnswer === true) {
    return {
      state: 'granted',
      word: 'Kept',
      tone: 'success',
      plainWords: 'This browser agreed to keep the application data on this device.',
      permanent: [answered],
      folded,
    };
  }

  if (record.literalAnswer === false) {
    return {
      state: 'refused',
      word: 'Not kept',
      tone: 'neutral',
      plainWords:
        'This browser did not agree to keep the data. It may clear it when the device runs short of room, so keep your backups current.',
      permanent: [answered],
      folded,
    };
  }

  return {
    state: 'unanswered',
    word: 'No answer',
    tone: 'neutral',
    plainWords:
      'The browser was asked and gave no answer either way. Keep your backups current.',
    permanent: [answered],
    folded,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// The two ways out of this device, and the words in front of each
// ═══════════════════════════════════════════════════════════════════════════════

/** The card's own heading. One card, one question: what happens to my Google account here. */
export const SIGN_OUT_CARD_TITLE = 'Your Google account on this device';

/** The ordinary control. The one he will normally press. */
export const SIGN_OUT_LABEL = 'Sign out';

/**
 * The exceptional control, and it is named for what it does rather than for how it is different.
 *
 * "Sign out and erase this device" and not "Sign out (advanced)" or "Full sign-out": the destructive
 * word is IN the label, where he reads it before he presses rather than after.
 */
export const ERASE_LABEL = 'Sign out and erase this device';

/**
 * THE SENTENCE ABOUT THE DEVICE KEY THAT SURVIVES — and it is here because nothing else says it.
 *
 * `WHAT_SIGNING_OUT_KEEPS` lists his clients, sessions, readings, routines, diet plans and the work
 * waiting to be backed up. It does NOT mention the key slot, and the key slot is the one thing on
 * that list he could not have guessed at: everything else is data he can see, and this is machinery
 * he has never been shown. `google-account.ts` states in its own header that the slot survives a
 * sign-out; this is that fact reaching the screen.
 *
 * IT IS SAID IN TERMS OF WHAT IT MEANS FOR HIM — that his medical notes still open afterwards —
 * rather than in terms of a key slot, which is a word from the implementation and not from his day.
 */
export const DEVICE_KEY_SURVIVES_SIGNING_OUT =
  'The key this device uses to open your medical notes stays here as well. Signing out does not '
  + 'touch it, so your notes still open on this device straight afterwards.';

/**
 * THE SAME FACT ON THE OTHER SIDE, AND IT IS THE ONE THAT COSTS HIM SOMETHING.
 *
 * A browser holds a non-extractable key by keeping the key object in the local database, so there is
 * nowhere else for it to survive — erasing takes it with everything else. Both halves are said: what
 * is destroyed, and that signing in again on this device brings it back, because the data key is
 * also reachable through the Google account slot. A limitation and its exit in the same breath, in
 * that order, which is the rule the key-material screen already follows.
 */
export const DEVICE_KEY_IS_DESTROYED_BY_ERASING =
  'The key this device uses to open your medical notes is destroyed with everything else, so once '
  + 'this is done nothing on this device can open a medical note. Signing in again on this device '
  + 'brings the key back from your Google account, along with your practice.';

/** One of the two acts, as it reads on the card before he has pressed anything. */
export interface SignOutChoice {
  readonly label: string;
  /**
   * WHAT PRESSING IT DESTROYS. Never what it restores — see the header.
   *
   * Its own field rather than a clause, because it is the sentence the whole card exists to put in
   * front of him and a clause is what gets trimmed when a screen is felt to be getting long.
   */
  readonly whatItDestroys: string;
  /** What it leaves behind, including the device key. Also its own field, and for the same reason. */
  readonly whatSurvives: string;
}

/** Both acts, side by side, which is the only place their difference is visible. */
export interface SignOutChoices {
  readonly title: string;
  readonly intro: string;
  readonly plain: SignOutChoice;
  readonly erase: SignOutChoice;
}

/**
 * The card, before either control is pressed.
 *
 * THE TWO ARE DESCRIBED TOGETHER AND NOT ON TWO SCREENS, because the thing he has to get right is a
 * COMPARISON — one of these keeps his practice and one destroys it — and a comparison drawn on two
 * screens is one he has to hold in his head.
 */
export function describeSignOutChoices(): SignOutChoices {
  return {
    title: SIGN_OUT_CARD_TITLE,
    intro:
      'Two different things, and they are not versions of each other. One disconnects Google and '
      + 'leaves everything here. The other disconnects Google and wipes this device.',
    plain: {
      label: SIGN_OUT_LABEL,
      whatItDestroys:
        'Destroys the Google connection on this device, and nothing else. Nothing you have saved '
        + 'here is touched.',
      whatSurvives: WHAT_SIGNING_OUT_KEEPS,
    },
    erase: {
      label: ERASE_LABEL,
      whatItDestroys:
        'Destroys everything this app has saved on this device, as well as the Google connection. '
        + 'Use it when the computer is not yours.',
      whatSurvives:
        'Your Google Drive backup is not touched, and neither is your other device. This is about '
        + 'this computer only.',
    },
  };
}

/** What the plain sign-out asks before it happens. */
export interface SignOutConfirmation {
  readonly title: string;
  /** {@link WHAT_SIGNING_OUT_KEEPS}, verbatim. The mechanism's own sentence, never reworded here. */
  readonly whatWillHappen: string;
  /** {@link DEVICE_KEY_SURVIVES_SIGNING_OUT}. Its own field: it is the part he cannot infer. */
  readonly deviceKey: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

/**
 * The plain sign-out's confirmation.
 *
 * IT ASKS, EVEN THOUGH IT DESTROYS ALMOST NOTHING — and that is a deliberate departure from the rule
 * `client-removal.ts` states, which is that a reversible act gets no warning because a warning in
 * front of a reversible act teaches him that this application's warnings do not mean much.
 *
 * The departure is not about the risk of THIS act. It is that both controls begin with the same two
 * words, sit on the same card, and one of them is irreversible. A confirmation on only the
 * destructive one would make the confirmation itself the signal — and the day he pressed the wrong
 * one, the thing that would have caught it is the habit of reading the panel. So both ask, the safe
 * one's panel is short and says nothing alarming, and the difference between them stays in the WORDS
 * rather than in whether a panel appeared.
 */
export function describeSignOutConfirmation(): SignOutConfirmation {
  return {
    title: 'Sign out of Google on this device?',
    whatWillHappen: WHAT_SIGNING_OUT_KEEPS,
    deviceKey: DEVICE_KEY_SURVIVES_SIGNING_OUT,
    confirmLabel: 'Sign out',
    // What pressing it LEAVES HIM WITH, in the same shape `client-removal.ts` uses for "Keep <name>".
    cancelLabel: 'Stay signed in',
  };
}

/**
 * Why an erase will not run, in his words — and it is TWO facts, never one.
 *
 * A bare refusal is a defect. He is told WHAT is outstanding and WHETHER IT WILL MOVE ON ITS OWN,
 * because those lead to opposite actions: work that is still being retried needs him to connect and
 * wait, and work that has permanently stopped will never move however long he waits, so waiting is
 * the one thing he must not do.
 */
export interface EraseRefusal {
  /** `eraseReadiness`'s own headline, verbatim. */
  readonly headline: string;
  /** How much has not reached the backup, and the oldest of it by name where there is one. */
  readonly whatIsOutstanding: string;
  /**
   * STILL RETRYING, PERMANENTLY STOPPED, OR BOTH — as its own sentence and never a clause.
   *
   * Derived from the readiness's own `waiting` and `stopped` figures and from its verdict; nothing
   * here re-counts the queue or re-decides the gate.
   */
  readonly stillRetryingOrStopped: string;
  /** `eraseReadiness`'s own advice, verbatim. */
  readonly whatToDo: string;
}

function changes(n: number): string {
  return n === 1 ? '1 change' : `${n} changes`;
}

/**
 * The split sentence: what is still being retried, and what has stopped for good.
 *
 * THE `wait` AND `decide` CASES DIFFER ON MORE THAN A NUMBER. A `wait` means everything outstanding
 * is still being attempted and is plausibly about to land. A `decide` with nothing rejected means
 * the retries are still running but have been running past the point at which this application's own
 * ladder stops calling a delay a delay — so "still being retried" is TRUE and would be MISLEADING on
 * its own, and the sentence says both halves.
 */
function retryingOrStopped(readiness: EraseReadiness): string {
  const { waiting, stopped, verdict } = readiness;

  if (stopped > 0 && waiting === 0) {
    return `${changes(stopped)} ${stopped === 1 ? 'has' : 'have'} stopped for good: nothing is `
      + 'retrying them, and they will not go on their own however long you wait.';
  }

  if (stopped > 0) {
    return `${changes(waiting)} ${waiting === 1 ? 'is' : 'are'} still being retried, and `
      + `${changes(stopped)} ${stopped === 1 ? 'has' : 'have'} stopped for good — nothing is `
      + 'retrying those, and they will not go on their own however long you wait.';
  }

  if (verdict === 'wait') {
    return `${changes(waiting)} ${waiting === 1 ? 'is' : 'are'} still being retried, so `
      + `${waiting === 1 ? 'it' : 'they'} should go on ${waiting === 1 ? 'its' : 'their'} own once `
      + 'this device can reach your Google account.';
  }

  // `decide` with nothing rejected: the retries are still running, and have been for long enough
  // that this application no longer treats their landing as something to wait for.
  return `${changes(waiting)} ${waiting === 1 ? 'is' : 'are'} still being retried, but `
    + `${waiting === 1 ? 'it has' : 'they have'} been waiting for days rather than minutes, so this `
    + 'app has stopped expecting them to go on their own.';
}

/**
 * The refusal, or `null` when the gate is clear and there is nothing to refuse.
 *
 * @param readiness `eraseReadiness()`'s answer. The gate is ITS decision and is not re-made here.
 */
export function describeEraseRefusal(readiness: EraseReadiness): EraseRefusal | null {
  if (readiness.verdict === 'clear') return null;

  /**
   * THE REFUSAL THAT QUOTES NO FIGURE, because there is no figure — the read that would have
   * produced one is the read that failed. Every other refusal below counts; this is the one state
   * where a number would be invented, and this is the panel that names what he would lose.
   *
   * `waiting` and `stopped` are both nought on this verdict, so the ordinary path would say "0
   * changes have not reached your Google Drive backup" — which reads as reassurance and is the exact
   * shape of defect this action exists to end.
   */
  if (readiness.verdict === 'unknown') {
    return {
      headline: readiness.headline,
      whatIsOutstanding: readiness.whatHappened,
      stillRetryingOrStopped:
        'This app has not read the backup status, so it cannot say whether anything here is waiting '
        + 'or has stopped. It is not saying there is nothing.',
      whatToDo: readiness.whatToDo,
    };
  }

  const outstanding = readiness.waiting + readiness.stopped;
  const named = readiness.oldestUndeliveredLabel;

  return {
    headline: readiness.headline,
    whatIsOutstanding:
      `${changes(outstanding)} on this device ${outstanding === 1 ? 'has' : 'have'} not reached `
      + `your Google Drive backup${named === null || named.length === 0 ? '' : `, the oldest being ${named}`}. `
      + 'This device is the only place that work exists.',
    stillRetryingOrStopped: retryingOrStopped(readiness),
    whatToDo: readiness.whatToDo,
  };
}

/** What the erase asks — or refuses — before it happens. */
export interface EraseConfirmation {
  /** The gate's verdict, carried so a test asserts the branch rather than the sentence. */
  readonly verdict: EraseVerdict;
  readonly title: string;
  /** {@link WHAT_ERASING_DESTROYS}, verbatim. */
  readonly whatWillHappen: string;
  /** {@link DEVICE_KEY_IS_DESTROYED_BY_ERASING}. Its own field: it is the part he cannot infer. */
  readonly deviceKey: string;
  readonly cannotBeUndone: string;
  /** Null when the gate is clear. Never null when it is not — a bare refusal is a defect. */
  readonly refusal: EraseRefusal | null;
  /**
   * The words on the tick he must make himself, or null when there is nothing to acknowledge.
   *
   * Present on `decide` alone: a `wait` has no override and a `clear` needs none, which is the
   * mechanism's own rule and is read from it rather than re-decided here.
   */
  readonly acknowledgeLabel: string | null;
  /** Null when nothing may be pressed, so a refused state cannot draw a button it cannot honour. */
  readonly confirmLabel: string | null;
  readonly cancelLabel: string;
}

/**
 * The whole erase confirmation for the queue as it is right now.
 *
 * ## WHY THIS IS A FUNCTION OF THE READINESS AND HOLDS NO QUEUE OPINION OF ITS OWN
 *
 * `eraseReadiness()` decides whether this device may be erased, and it is the only thing that does.
 * This turns its answer into what the coach reads. A second opinion about when a delay stops being a
 * delay — a threshold chosen here, a count re-derived here — is exactly the drift
 * `google-account.ts` refused when it read `PERSISTENT_WARNING_MS` from the ladder rather than
 * naming a number beside itself.
 *
 * ## THE FOUR STATES PRODUCE FOUR DIFFERENT PANELS, AND ONLY ONE OF THEM HAS A BUTTON HE CAN JUST PRESS
 *
 *  - **unknown** — the backup status could not be READ. Refused, with no count in any sentence and
 *    NO OVERRIDE AT ALL: there is nothing to name, so there is nothing he could agree to lose. This
 *    is the state that used to be indistinguishable from `clear`, and it authorised the deletion.
 *  - **clear** — everything is backed up. What will be destroyed, and a button.
 *  - **wait** — refused, with what is outstanding and that it is still being retried. NO BUTTON AND
 *    NO OVERRIDE: the cheap fix costs him nothing and overriding would throw away work that was
 *    about to be safe.
 *  - **decide** — refused, with what is outstanding and that it will not move on its own, plus a
 *    separate tick and then a button. It is his decision and the application does not make it for
 *    him — but he makes it having been told what he is losing.
 */
export function describeEraseConfirmation(reading: DeliveryReadingOutcome): EraseConfirmation {
  // THE GATE IS RUN HERE AND NOT ON THE SCREEN. `AdminScreen.tsx` is the drawing and holds no
  // judgement, which is what lets every sentence below be asserted without a browser — and it is
  // also what stops a second opinion about whether this device may be erased growing in a `.tsx`
  // where nothing would check it.
  const readiness = eraseReadiness(reading);
  const refusal = describeEraseRefusal(readiness);

  return {
    verdict: readiness.verdict,
    title: 'Erase this device?',
    whatWillHappen: WHAT_ERASING_DESTROYS,
    deviceKey: DEVICE_KEY_IS_DESTROYED_BY_ERASING,
    cannotBeUndone:
      'This cannot be undone from this device. Nothing this app has saved here is left behind, '
      + 'which is the whole point of erasing rather than signing out.',
    refusal,
    acknowledgeLabel: readiness.mayProceedWithAcknowledgement
      ? 'I understand that the changes named above will be lost'
      : null,
    // Null on `unknown` for a stronger reason than on `wait`: a `wait` ends by itself, and this
    // does not end until the app can read the status at all. A button here would offer an act the
    // mechanism refuses outright.
    confirmLabel:
      readiness.verdict === 'wait' || readiness.verdict === 'unknown'
        ? null
        : 'Erase everything on this device',
    cancelLabel: 'Leave this device as it is',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// What happened when he pressed
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * WHAT AN ACT DID — plain frozen facts, carried from wherever the act was actually performed.
 *
 * It is a fact rather than a sentence because the sentence is written HERE, where it is asserted,
 * and because the act happens in a component that must not be the second place words about signing
 * out are decided.
 */
export type AccountActOutcome =
  | { readonly act: 'sign-out'; readonly result: 'signed-out'; readonly revokedAtGoogle: boolean }
  | { readonly act: 'sign-out'; readonly result: 'not-connected' }
  | { readonly act: 'erase'; readonly result: 'erased' }
  /**
   * Refused, AND WHY — because the two refusals describe different worlds and one sentence cannot
   * serve both. `more-stopped` is the queue moving under him between reading the figure and
   * pressing; `not-read` is the backup status never having been read at all. Telling him more
   * changes stopped backing up when the truth is that nothing was ever counted is a false sentence
   * at the exact moment of a destructive act.
   */
  | { readonly act: 'erase'; readonly result: 'refused'; readonly because: 'more-stopped' | 'not-read' }
  | { readonly act: 'sign-out' | 'erase'; readonly result: 'failed'; readonly verbatim: string | null };

/** What the card says after an act, in the two parts a report is made of. */
export interface AccountActReport {
  readonly headline: string;
  readonly detail: string;
  /** Whatever the machine said, when it said anything. He may have to read it out. */
  readonly verbatim: string | null;
  /** True when this is a report of something not working, so the drawing can be loud in words. */
  readonly failed: boolean;
}

/**
 * What just happened, in his words.
 *
 * ## THE REVOCATION IS REPORTED HONESTLY AND IS NEVER CLAIMED
 *
 * `signOutOfGoogle` returns `revokedAtGoogle: false` on a device with no network, which is an
 * ORDINARY way to sign out: the connection here is gone, and the access simply stands at Google
 * until it expires or he removes this app in his own Google settings. Saying "your access has been
 * revoked" in that case would be this application reporting something it did not manage to do — so
 * the two cases have two sentences, and the second one tells him where the remaining half is.
 */
export function describeAccountAct(outcome: AccountActOutcome): AccountActReport {
  if (outcome.result === 'failed') {
    return {
      headline: outcome.act === 'sign-out'
        ? 'You were not signed out, and nothing on this device was changed'
        : 'This device was not erased, and nothing was deleted',
      detail: outcome.act === 'sign-out'
        ? 'Everything you have saved here is exactly as it was, and you are still connected. Try '
          + 'again, and if it says this a second time, reload the app.'
        : 'Everything you have saved here is still here and you may still be signed in. Close every '
          + 'other window of this app, then try again.',
      verbatim: outcome.verbatim,
      failed: true,
    };
  }

  if (outcome.act === 'erase') {
    if (outcome.result === 'refused') {
      return {
        headline: 'This device was not erased',
        // TWO REFUSALS, TWO SENTENCES. The first is the race the mechanism re-checks for: more
        // stopped between his reading the figure and his pressing the button, so what he agreed to
        // lose is not what he would have been losing. The second is a different world entirely —
        // nothing was ever counted — and saying the first about it would tell him changes stopped
        // backing up when this app has no idea whether any did.
        detail: outcome.because === 'not-read'
          ? 'This app could not read what is backed up and what is still waiting here, so it stopped '
            + 'rather than erasing work it has not been able to count. Nothing was deleted. Reload '
            + 'the app and try again.'
          : 'More changes stopped backing up while this was open, so this app stopped rather than '
            + 'erasing more than you agreed to. Read the panel again — it now shows what is actually '
            + 'at risk.',
        verbatim: null,
        failed: false,
      };
    }

    return {
      headline: 'This device has been erased',
      // IT TELLS HIM TO CLOSE THE WINDOW, and that is not housekeeping. The storage this app was
      // running on has just been deleted underneath it, so every other screen is now reading a
      // database that is not there. Nothing reloads on his behalf: a reload would open a fresh
      // empty store and seed the shipped library into it, which on somebody else's computer is this
      // app writing itself back onto a machine he just told it to leave.
      detail:
        'Everything this app had saved here is gone, including the key that opens your medical '
        + 'notes, and you are signed out. Your Google Drive backup and your other device are '
        + 'untouched. Close this window now — the app has nothing left to run on here. Signing in '
        + 'again on this device brings your practice back from your backup.',
      verbatim: null,
      failed: false,
    };
  }

  if (outcome.result === 'not-connected') {
    return {
      headline: 'There was no Google account connected on this device',
      detail:
        'So there was nothing to sign out of, and nothing has changed. Everything you have saved '
        + 'here is untouched.',
      verbatim: null,
      failed: false,
    };
  }

  return {
    headline: 'You are signed out of Google on this device',
    detail: outcome.revokedAtGoogle
      ? 'This app has also told Google to drop its access. Everything you have saved here is still '
        + 'here, including the key that opens your medical notes. Sign in again whenever you like.'
      // NOT reported as a completed revocation. See the note above this function.
      : 'This device could not reach Google to hand the access back, so that part will lapse on its '
        + 'own — you can also remove this app under your own Google account settings. Everything '
        + 'you have saved here is still here, including the key that opens your medical notes.',
    verbatim: null,
    failed: false,
  };
}
