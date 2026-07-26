/**
 * OPENING THE LOCAL STORE — the three states it can be in, and the words for the two nobody plans for.
 *
 * This is the first time in this application that the interface opens the local database. Everything
 * above it — the five seams in `main.tsx`, every screen that will ever want a client or a session —
 * is fed from the one store this file opens, which is why the opening is authored on its own rather
 * than smuggled inside whichever screen needed it first.
 *
 * ## THE PROPERTY THAT MATTERS, AND IT IS NOT THE HAPPY PATH
 *
 * The standing rule for this application is that it ALWAYS OPENS AND ALWAYS WORKS. `main.tsx` says
 * so in its own first paragraph and mounts the interface before the platform has answered anything.
 * A local database is the largest new thing that can refuse, and it can refuse in ordinary ways: a
 * private window where storage is switched off, a device with no room left, a second window holding
 * the old version open, a database written by a NEWER build than the one now loaded.
 *
 * None of those may produce a blank screen, an error at start, or a spinner that never resolves. So
 * the opening is not a promise a screen awaits — it is a VALUE with three legible states:
 *
 *   - `opening`      — asked, not yet answered. Says so.
 *   - `open`         — the store is here.
 *   - `unavailable`  — it could not be opened, and this carries the SENTENCE saying why and what the
 *                      coach can do about it, in his language and never as an exception message.
 *
 * A screen that needs the store and finds the third state says what is wrong. It does not blank, and
 * it does not quietly render the reassuring empty case, which for the pending-removal surface would
 * be the exact false good news that surface exists to prevent.
 *
 * ## WHY THE JUDGEMENT IS HERE AND NOT IN THE COMPONENT
 *
 * `LocalStore.tsx` beside this file is the drawing and holds no decisions — the same split as
 * `screens/removals.ts` and `screens/RemovalsScreen.tsx`. Everything that can be wrong about the
 * opening is decided here, in a plain module a test can assert against with no browser and no
 * rendering at all: the classification of a failure, the words for each one, the device tag, and the
 * ORDER the three states are published in. `beginOpening` exists precisely so that the sequence is
 * testable outside a browser — a static render never runs an effect, so logic living inside one is
 * logic nothing can check.
 *
 * ## NOTHING HERE RUNS AT MODULE SCOPE
 *
 * The interface suite renders these modules outside a browser, and a module-scope `indexedDB` read
 * makes them unimportable there. Every global is touched inside a function, on the way to an
 * answer somebody asked for.
 */

import { browserPlatform, openLocalStore } from '../../core/store/store.js';
import type { LocalStore } from '../../core/store/store.js';

/**
 * What is true about the local store right now.
 *
 * A discriminated union rather than three loose fields: there is no such thing as "open and also
 * unavailable", and a screen that reads `store` must be unable to compile without having answered
 * which state it is in first.
 */
export type LocalStoreOpening =
  | { readonly state: 'opening' }
  | { readonly state: 'open'; readonly store: LocalStore }
  | { readonly state: 'unavailable'; readonly condition: LocalStoreCondition };

/** Asked, not yet answered. One frozen value, so nothing invents a fourth state by mistake. */
export const STILL_OPENING: LocalStoreOpening = Object.freeze({ state: 'opening' as const });

/**
 * The kinds of refusal this application words separately.
 *
 * They are separate because the coach can do something DIFFERENT about each one. A single "could not
 * open the database" would be true of all five and useful for none: closing the other window fixes
 * one of them and none of the others, and freeing space fixes exactly one more.
 */
export type LocalStoreConditionCode =
  | 'no-database'
  | 'another-window'
  | 'newer-build'
  | 'no-room'
  | 'refused';

/** What is wrong, said the way it would be said out loud. */
export interface LocalStoreCondition {
  readonly code: LocalStoreConditionCode;
  /** The heading. Never an exception message. */
  readonly headline: string;
  /** What has happened, in one paragraph, including what it means for his data. */
  readonly whatHappened: string;
  /** What HE can do. Always something he can actually cause himself. */
  readonly whatToDo: string;
  /**
   * The browser's own words, kept verbatim, or null.
   *
   * Kept because he may have to read it out to whoever set the app up for him, and a reworded
   * version is not what was said. It is never the headline.
   */
  readonly verbatim: string | null;
}

/** What the interface says while the answer is still coming. */
export const STILL_OPENING_WORDS =
  'This app is still opening its storage on this device. It only takes a moment.';

/**
 * The one sentence that must be true of every condition below, kept as a constant because it is the
 * promise the whole design rests on and it must not be reworded into something weaker.
 */
export const THE_APP_STILL_OPENS =
  'The app itself is still open and you can move around it. Nothing can be saved or read on this '
  + 'device until this is sorted out, so do not run a session on it yet.';

/** The browser's own text for an error, or null. Never parsed for meaning beyond {@link classifyOpeningFailure}. */
function verbatimOf(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  const held = error as { name?: unknown; message?: unknown };
  const message = typeof held.message === 'string' ? held.message : String(error);
  const name = typeof held.name === 'string' ? held.name : 'Error';
  return `${name}: ${message}`;
}

/**
 * Which refusal this is.
 *
 * The evidence is the text, and that is a deliberate choice rather than a shortcut. `core/store/db.js`
 * wraps every opening failure in a `StoreWriteError` whose message embeds the platform's own
 * `Name: message` — so the platform's name for the fault survives, and reading it is the only way to
 * tell a version clash from a full disk without changing a file under the core, which this step may
 * not do. Matching is by plain substring: an unrecognised fault falls through to `refused`, which is
 * worded to be true of anything.
 */
export function classifyOpeningFailure(error: unknown): LocalStoreConditionCode {
  const text = verbatimOf(error) ?? '';

  // `browserPlatform` refuses before any database is touched when the factory is simply not there —
  // a private window with storage switched off, or a browser locked down by policy.
  if (text.includes('no local database')) return 'no-database';

  // `openDatabase`'s own sentence for a blocked upgrade. It is this application's wording, not the
  // platform's, which is why it is matched on rather than on a platform error name.
  if (text.includes('Another window')) return 'another-window';

  // The platform's name for "the stored database is at a HIGHER version than the one asked for".
  if (text.includes('VersionError')) return 'newer-build';

  if (text.includes('QuotaExceededError')) return 'no-room';

  return 'refused';
}

/**
 * A refusal, worded.
 *
 * The switch is exhaustive by construction: a code added to {@link LocalStoreConditionCode} without
 * words here fails to compile, rather than falling through to a generic sentence that would be
 * shipped to the coach unnoticed.
 */
export function describeOpeningFailure(error: unknown): LocalStoreCondition {
  const code = classifyOpeningFailure(error);
  const verbatim = verbatimOf(error);

  switch (code) {
    case 'no-database':
      return {
        code,
        headline: 'This browser will not let the app save anything on this device',
        whatHappened:
          'This app keeps your clients, routines and sessions on the device you are using, and this '
          + 'browser is not allowing it. That is usually a private or incognito window, or a browser '
          + 'setting that blocks sites from storing anything.',
        whatToDo:
          'Open the app in an ordinary window rather than a private one. If it is already an ordinary '
          + 'window, allow this site to store data in your browser settings and then reload. '
          + THE_APP_STILL_OPENS,
        verbatim,
      };

    case 'another-window':
      return {
        code,
        headline: 'Another window has this app open',
        whatHappened:
          'This app is open in another window or tab on this device, and that older copy is holding '
          + 'on to the storage while this one is trying to bring it up to date.',
        whatToDo:
          'Close the other window or tab, then reload this one. If you are not sure which one it is, '
          + 'close every window of the app and open it once more. ' + THE_APP_STILL_OPENS,
        verbatim,
      };

    case 'newer-build':
      return {
        code,
        headline: 'This device has a newer version of the app than the one now loaded',
        whatHappened:
          'What is saved on this device was written by a newer version of the app, and an older '
          + 'version must not write to it. Nothing has been lost: the app is refusing to touch it '
          + 'rather than risk damaging it.',
        whatToDo:
          'Reload the page so the browser fetches the newest version of the app. If it still says '
          + 'this, close every window of the app and open it again. ' + THE_APP_STILL_OPENS,
        verbatim,
      };

    case 'no-room':
      return {
        code,
        headline: 'There is no room left on this device',
        whatHappened:
          'The browser has run out of the space it gives this app, so it could not open its storage.',
        whatToDo:
          'Free up space on the device — photos and unused apps are usually the quickest — then '
          + 'reload. Do NOT clear this browser’s site data to make room: that would delete what '
          + 'the app has already saved here. ' + THE_APP_STILL_OPENS,
        verbatim,
      };

    case 'refused':
      return {
        code,
        headline: 'The app could not open its storage on this device',
        whatHappened:
          'This app keeps your clients, routines and sessions on the device you are using, and the '
          + 'browser refused to open that storage. It has not said why in a way this app recognises.',
        whatToDo:
          'Reload the page. If it says this again, close every window of the app and open it once '
          + 'more. If it still says this, read this screen out to whoever set the app up for you '
          + 'rather than clearing your browser data, which would delete what has already been saved '
          + 'here. ' + THE_APP_STILL_OPENS,
        verbatim,
      };

    default: {
      // A code with no words is a compile error here, and that is the whole point of this clause.
      const unreached: never = code;
      throw new Error(`no words were written for the local-store condition "${String(unreached)}"`);
    }
  }
}

/**
 * HOW MANY REMOVALS THIS DEVICE HAS RECORDED SINCE THE APPLICATION OPENED — the narrowest signal
 * that could correct the stale count, and the reasoning for why it is this and not something larger.
 *
 * ## THE FAULT IT EXISTS TO FIX
 *
 * `shell/RemovalsFromStore.tsx` fills the pending-removal seam ONCE per store and deliberately
 * carries no refresh. That was correct when it was written: `verifyAndMarkPropagated` is the only
 * thing that moves a manifest out of pending and it only runs during a synchronisation pass, so
 * there was exactly ONE writer of that record and it did not exist yet. The client register has
 * since become a SECOND writer — `purgeClient` leaves a pending manifest the moment the coach
 * removes somebody, on this device, with no pass involved. So he removes a client on the register,
 * walks to the surface that reports removals awaiting confirmation, and is told nothing is waiting
 * while a manifest sits there pending. That is FALSE GOOD NEWS about a departed client's data,
 * which is the precise failure the whole removal machinery was built to prevent.
 *
 * ## WHY A COUNT, AND NOT A NOTIFICATION MECHANISM
 *
 * The obvious fix is a way for one part of the interface to tell another that something changed.
 * That is a general mechanism, and a general mechanism here would be the wrong size of thing three
 * times over: it would be a second way for facts to move, beside the seams; it would have to be
 * unpicked when S16 wires the real trigger, which is a synchronisation pass and not a screen; and
 * anything general enough to carry this would be general enough to wake the FOUR seams that are
 * still frozen literals — and those are honestly frozen, because nothing has synchronised. A signal
 * that started them reading would have them claim things nobody has measured.
 *
 * So what moves is a NUMBER, on the source both surfaces already share. It says one fact and can say
 * nothing else. It is not a poll: nothing here has a timer, an interval or a subscription, and the
 * count changes only when a removal has genuinely COMMITTED on this device.
 *
 * ## WHY IT LIVES ON THE SOURCE RATHER THAN ON THE SEAM
 *
 * `shell/seams.test.ts` holds all five reporting seams to a shape with nothing callable on them,
 * because a control arriving on a surface the coach is TOLD things by is the defect that test
 * exists to catch. {@link LocalRemovals} therefore does NOT go on the seam. It goes where the store
 * itself goes — `platform/LocalStore.tsx`, which states in its own header that it is THE SOURCE the
 * five seams are fed from and NOT a sixth one, and which already carries a live resource with
 * methods on it. Nothing about the five-seam property changes and `seams.test.ts` is untouched.
 */
export interface LocalRemovals {
  /**
   * How many removals have COMMITTED on this device since the application opened.
   *
   * It is never read for its VALUE — nothing displays it and nothing counts anything with it. It is
   * read so that a re-read can depend on it, which is the whole of its job.
   */
  readonly recorded: number;
  /**
   * Say that one more has committed. Called by the surface that made it, immediately after the
   * purge resolved and never before: `purgeClient` resolving is the write COMMITTING, and a signal
   * raised ahead of that would have the seam read a store that has not changed yet.
   */
  readonly removalRecorded: () => void;
}

/** Before the coach has removed anybody in this sitting. The honest starting value, not a placeholder. */
export const NO_REMOVAL_RECORDED_YET = 0;

/**
 * One more removal has committed here.
 *
 * A plain function rather than an increment written inside a component, because the property the fix
 * rests on is arithmetic and is therefore assertable: the number STRICTLY INCREASES and never
 * repeats, so the re-read that depends on it runs every single time. A signal that could return to a
 * value it has held before — a boolean flipped back, a timestamp at one-second resolution, the
 * identity of the last removal — would be a signal that silently stops firing, and it would stop
 * firing on the second removal rather than the first, which is the hardest version to notice.
 */
export function oneMoreRemoval(recorded: number): number {
  return recorded + 1;
}

/** Where this device's own tag is remembered between sessions. */
export const DEVICE_TAG_KEY = 'fit.device-tag';

/** How many characters of minted identity a tag carries. See {@link mintDeviceId} for why this is enough. */
export const DEVICE_ID_LENGTH = 12;

/** The alphabet the minted half is written in: digits and lower-case letters. */
const DEVICE_ID_RADIX = 36;

/**
 * The two things this needs of a store of small facts, and nothing more.
 *
 * A narrow port rather than the platform's whole `Storage`, for the same reason `theme.ts` takes one:
 * a test can then supply a store that REFUSES, which is a real state on a locked-down device and the
 * only way to prove the failing-soft below actually fails soft.
 */
export interface DeviceTagStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * A fresh identity for a device that has never been given one.
 *
 * `Math.random` rather than the cryptographic generator, deliberately and with the cost stated: this
 * is a LABEL, not a secret and not a key. It ends up on deletion manifests and journal entries so
 * that "which device did this" can be answered. Twelve base-36 characters is about sixty-two bits,
 * and a clash between the coach's laptop and his phone would cost attribution in a record, never
 * data — the store's own conflict detection does not depend on it. Nothing here is a security
 * boundary, and using the crypto generator would imply it was.
 */
export function mintDeviceId(random: () => number = Math.random): string {
  let id = '';
  while (id.length < DEVICE_ID_LENGTH) {
    id += Math.floor(random() * DEVICE_ID_RADIX).toString(DEVICE_ID_RADIX);
  }
  return id;
}

/**
 * This device's tag, minted once and remembered.
 *
 * `openLocalStore` requires one and refuses anything shorter than three characters, because a store
 * that cannot say which device wrote a record cannot honour last-write-wins across the coach's
 * laptop and his phone.
 *
 * IT FAILS SOFT. A browser that refuses storage still gets a tag — a fresh one for this session —
 * because refusing to open the store over a missing label would turn a cosmetic problem into the
 * one outcome this application may not have. The refusal is logged rather than swallowed.
 */
export function deviceTag({
  storage,
  formFactor,
  random,
}: {
  storage: DeviceTagStorage | null;
  formFactor: 'desktop' | 'mobile' | 'unknown';
  random?: () => number;
}): string {
  if (storage !== null) {
    try {
      const remembered = storage.getItem(DEVICE_TAG_KEY);
      if (remembered !== null && remembered.length > 0) return remembered;
    } catch (error) {
      console.error('[store] this device’s tag could not be read; minting a fresh one', error);
    }
  }

  const minted = `${formFactor}-${mintDeviceId(random)}`;

  if (storage !== null) {
    try {
      storage.setItem(DEVICE_TAG_KEY, minted);
    } catch (error) {
      console.error('[store] this device’s tag could not be remembered', error);
    }
  }

  return minted;
}

/** `localStorage`, or null where reading it throws — which it does in some locked-down browsers. */
function rememberedOn(global: typeof globalThis): DeviceTagStorage | null {
  try {
    return global.localStorage ?? null;
  } catch (error) {
    console.error('[store] this browser refused access to its own local storage', error);
    return null;
  }
}

/**
 * Open the real local store on the real browser.
 *
 * Both globals are read INSIDE this function, so importing this module outside a browser is safe;
 * `browserPlatform` throwing for a missing database becomes a rejected promise rather than a throw
 * at start, which is what keeps the refusal a reportable state instead of a blank screen.
 */
export async function openTheLocalStore(global: typeof globalThis = globalThis): Promise<LocalStore> {
  const platform = browserPlatform(global);
  const device = deviceTag({ storage: rememberedOn(global), formFactor: platform.formFactor });
  return openLocalStore({ platform, device });
}

/**
 * Drive one opening, publishing each state as it becomes true.
 *
 * This is the whole of the effect in `LocalStore.tsx`, extracted so that the ORDER of the three
 * states can be asserted with no browser and no rendering: a static render never runs an effect, so
 * anything living inside one is beyond the reach of the interface suite.
 *
 * It returns a cancel function, and cancelling is not merely "stop listening": the store is CLOSED,
 * in the scope that opened it, whether it arrived BEFORE the caller went away or after. Both
 * directions matter and they fail differently. A store that arrives after cancellation would
 * otherwise be a connection nobody holds — React's own double-invoked effects in development produce
 * exactly that, and the next version upgrade is then blocked by the application itself. A store that
 * arrived earlier and was published is the same leak by a slower route: the caller has gone, so
 * nothing will ever close what it opened. `close` is idempotent (`core/store/db.js`), so closing a
 * connection the platform has already taken away costs nothing.
 *
 * @param open the opening, injected so a test can supply a refusal or a store built on the double
 * @param publish called with each state as it becomes true; never called after cancellation
 * @returns cancel
 */
export function beginOpening(
  open: () => Promise<LocalStore>,
  publish: (opening: LocalStoreOpening) => void,
): () => void {
  let live = true;
  /** The connection this opening owns, once it has one. Held so that cancelling can close it. */
  let held: LocalStore | null = null;

  void open().then(
    (store) => {
      if (!live) {
        void store.close();
        return;
      }
      held = store;
      publish({ state: 'open', store });
    },
    (error: unknown) => {
      // Logged as well as reported: the sentence the coach reads is deliberately not the platform's,
      // and the platform's own words must still reach a console somebody can look at.
      console.error('[store] the local store could not be opened', error);
      if (!live) return;
      publish({ state: 'unavailable', condition: describeOpeningFailure(error) });
    },
  );

  return () => {
    live = false;
    if (held !== null) {
      const closing = held;
      held = null;
      void closing.close();
    }
  };
}
