/**
 * SEEDING THE SHIPPED LIBRARY — where it belongs in this application, and the words for when it
 * could not happen.
 *
 * ## THE DEFECT THIS CLOSES, AND HOW IT SHIPPED GREEN
 *
 * `core/seed/seed.js` has been finished since s3, and `SEED.md` §3 says plainly that
 * `seedIfNeeded(store)` is "what the application calls on start-up". **The application did not call
 * it.** Nothing under `src/` had ever imported `seedIfNeeded`, `hasBeenSeeded` or `core/seed` at
 * all, so on a device that had never been seeded the coach opened the calendar, found no routines,
 * and could not start a session — the product's central path, dead, on every real device. Every gate
 * was green throughout, because every suite seeds its own fixtures and then asserts that a library
 * exists. That is the exact shape of test this file must not repeat: see `library-seeding.test.ts`,
 * which begins from a store nobody has written to.
 *
 * ## THE DECISION: SEEDING IS PART OF OPENING THE STORE, AND NOT A FOURTH PLATFORM QUESTION
 *
 * The three candidates were bootstrap (at start, beside the theme and the service worker),
 * first-open (inside the opening of the local store), and an explicit admin action. It is
 * FIRST-OPEN, in {@link seedingAfterOpening}, which wraps the opening `main.tsx` already passes to
 * `OpeningLocalStore`. Three reasons, and the third is the one that decided it:
 *
 *  1. **Seeding cannot be asked before there is a store to ask.** First run is decided by asking the
 *     store what is in it and never by a flag (`SEED.md` §3), so the question does not exist until
 *     the store is open. Bootstrap would have to open a second connection of its own — and a second
 *     connection to the same database is the one thing `platform/local-store.ts` is built to avoid,
 *     because it is indistinguishable to the browser from the coach's other window.
 *  2. **An explicit admin action would mean shipping an application whose library is empty until the
 *     coach finds a button.** That is the defect above with a manual workaround, not a fix. The
 *     admin action that DOES exist — reset to defaults — is a different act at a different moment,
 *     and it is S9's: see below.
 *  3. **THE STORE MUST NOT BE PUBLISHED AS OPEN UNTIL THE LIBRARY QUESTION HAS BEEN ANSWERED.** Every
 *     surface that reads content starts reading the moment it is told the store is open —
 *     `readLaunchpadInto` fires from the calendar's effect. Seeding "in parallel" would let the
 *     launcher read an empty library, publish "there are no routines in your library", and then
 *     never re-read, because nothing here has a refresh trigger. The coach would meet the ORIGINAL
 *     defect on the first run of a correctly seeded app, and it would clear on a reload, which is
 *     the hardest kind of fault to report. So the seed lands BETWEEN the store arriving and the
 *     store being published: a screen that is told the store is open is told it about a store whose
 *     library question has already been settled, always.
 *
 * The cost of (3) is stated rather than hidden: on a genuinely first run the interface says "still
 * opening its storage" for as long as one transaction of ~100 records takes. That is honest — the
 * app has genuinely not finished opening — and it is the same sentence a slow database already
 * produces. `main.tsx` still mounts the interface FIRST and nothing here is awaited before render:
 * the standing rule is untouched, and a seeding that fails NEVER becomes a store that failed —
 * {@link seedingAfterOpening} returns the store either way.
 *
 * ## S9 REUSES THIS, IT DOES NOT COPY IT
 *
 * Reset-to-defaults is the same machinery at a different moment: `resetToDefaults(store, {backup})`
 * from the same package restores the same shipped set. It has no wiring of its own to build here —
 * it calls the package directly from the admin surface, and it reports its outcome through the SAME
 * {@link LibrarySeeding} value on the same provider, with the same words in {@link describeSeedingFailure}
 * for the same failures (a device with no room refuses a ~100-record transaction identically
 * whichever call opened it). What S9 must NOT do is add a second first-run path: {@link seedTheLibrary}
 * is the only call site of `seedIfNeeded` in this application, and it should stay the only one.
 *
 * ## WHAT THIS FILE MAY NOT BREAK
 *
 * The rules live in the seed package and are enforced there; they are restated because a wiring is
 * exactly where they get broken by a well-meant convenience:
 *
 *  - **First run is decided by ASKING THE STORE, never by a flag.** Nothing here writes a
 *    "seeded" marker, reads `localStorage`, or looks at `seed:last-import`. If this module held a
 *    flag it would be a second source of truth and would eventually disagree with the store.
 *  - **NEVER SEED ON EMPTY** (recipe decision, 2026-07-26). An emptied library is a SEEDED library:
 *    deletion raises a tombstone, so `hasBeenSeeded` still answers yes, and a coach who deliberately
 *    deleted every routine is not silently refilled behind his back. This module therefore calls
 *    `seedIfNeeded` and NOTHING else — it never counts records itself and never decides to re-seed.
 *    The only way back to the shipped set is the admin reset, explicitly, when he asks for it.
 *  - **Nothing is pruned and nothing is checked in reverse.** The catalogue deliberately exceeds the
 *    shipped week and the surplus IS the substitution pool.
 *
 * ## NOTHING HERE RUNS AT MODULE SCOPE
 *
 * Same rule as `local-store.ts`: the interface suite imports these modules outside a browser, so
 * every global is touched inside a function on the way to an answer somebody asked for.
 */

import { seedIfNeeded } from '../../core/seed/seed.js';
import type { LocalStore } from '../../core/store/store.js';

/**
 * What is true about the shipped library on this device.
 *
 * THREE STATES AND DELIBERATELY NOT FOUR. There is no "seeding" state, because there is no moment
 * at which a screen could observe one: the store is not published as open until this value has
 * settled, so everything downstream sees `not-yet` and then the answer. A fourth state nothing can
 * ever be in is a state the next editor will write a branch for.
 */
export type LibrarySeeding =
  | { readonly state: 'not-yet' }
  | { readonly state: 'ready'; readonly imported: boolean }
  | { readonly state: 'could-not'; readonly condition: LibraryCondition };

/**
 * Nobody has asked yet, because there is no store to ask.
 *
 * The honest pre-answer value, and note which way it is honest: it is NOT `ready`. A default of
 * "the library is there" is the reassuring answer arrived at by not having looked, and it is what an
 * unwired surface would silently show.
 */
export const LIBRARY_NOT_YET: LibrarySeeding = Object.freeze({ state: 'not-yet' as const });

/** The library was already here — the answer on every run after the first. */
export const LIBRARY_ALREADY_HERE: LibrarySeeding =
  Object.freeze({ state: 'ready' as const, imported: false });

/** The shipped library was written on this device just now — the answer on the first run only. */
export const LIBRARY_JUST_IMPORTED: LibrarySeeding =
  Object.freeze({ state: 'ready' as const, imported: true });

/**
 * The kinds of seeding failure this application words separately.
 *
 * Two, because there are two the coach can do something DIFFERENT about. Everything else falls
 * through to `refused`, which is worded to be true of anything — the same rule the store's own
 * conditions follow.
 */
export type LibraryConditionCode = 'no-room' | 'refused';

/** What is wrong with the library, said the way it would be said out loud. */
export interface LibraryCondition {
  readonly code: LibraryConditionCode;
  /** The heading. Never an exception message. */
  readonly headline: string;
  /** What has happened, in one paragraph, including what it means for his work. */
  readonly whatHappened: string;
  /** What HE can do. Always something he can actually cause himself. */
  readonly whatToDo: string;
  /** The browser's own words, kept verbatim, or null. Never the headline. */
  readonly verbatim: string | null;
}

/**
 * The sentence that must be true of every condition below, kept as a constant because it is the
 * promise the design rests on and must not be reworded into something weaker.
 *
 * It says something DIFFERENT from the store's own `THE_APP_STILL_OPENS`: the store is fine here.
 * What is missing is the content that ships with the app, and everything he has made himself is
 * untouched.
 */
export const THE_APP_STILL_WORKS =
  'Everything you have already put in this app is safe and the app itself works normally. What is '
  + 'missing is the exercises and routines it comes with, so there may be nothing to choose from '
  + 'when you go to start a session.';

/** The browser's own text for an error, or null. */
function verbatimOf(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  const held = error as { name?: unknown; message?: unknown };
  const message = typeof held.message === 'string' ? held.message : String(error);
  const name = typeof held.name === 'string' ? held.name : 'Error';
  return `${name}: ${message}`;
}

/**
 * Which seeding failure this is.
 *
 * The evidence is the text, for the reason `classifyOpeningFailure` states in full: the core wraps
 * every write failure in its own error whose message embeds the platform's `Name: message`, and
 * reading it is the only way to tell a full disk from anything else without changing a file under
 * the core. An unrecognised fault falls through to `refused`.
 */
export function classifySeedingFailure(error: unknown): LibraryConditionCode {
  const text = verbatimOf(error) ?? '';

  // The likeliest real failure by some distance: the shipped library is about a hundred records
  // written in one transaction, and it is written on a device the coach has just installed on.
  if (text.includes('QuotaExceededError')) return 'no-room';

  return 'refused';
}

/**
 * A seeding failure, worded.
 *
 * The switch is exhaustive by construction: a code added to {@link LibraryConditionCode} with no
 * words here fails to compile rather than falling through to a generic sentence nobody wrote.
 */
export function describeSeedingFailure(error: unknown): LibraryCondition {
  const code = classifySeedingFailure(error);
  const verbatim = verbatimOf(error);

  switch (code) {
    case 'no-room':
      return {
        code,
        headline: 'There was no room to put the exercises and routines on this device',
        whatHappened:
          'This app comes with a library of exercises and routines, and it puts them on the device '
          + 'the first time it opens there. The browser has run out of the space it gives this app, '
          + 'so they were not written. Nothing was half-written: it is all or none.',
        whatToDo:
          'Free up space on the device — photos and unused apps are usually the quickest — then '
          + 'reload the app and it will try again. Do NOT clear this browser’s site data to make '
          + 'room: that would delete what you have already saved here. ' + THE_APP_STILL_WORKS,
        verbatim,
      };

    case 'refused':
      return {
        code,
        headline: 'The exercises and routines this app comes with could not be put on this device',
        whatHappened:
          'This app comes with a library of exercises and routines, and it puts them on the device '
          + 'the first time it opens there. That did not work here, and the browser has not said why '
          + 'in a way this app recognises. Nothing was half-written: it is all or none.',
        whatToDo:
          'Reload the app and it will try again. If it says this a second time, read this screen out '
          + 'to whoever set the app up for you rather than clearing your browser data, which would '
          + 'delete what you have already saved here. ' + THE_APP_STILL_WORKS,
        verbatim,
      };

    default: {
      // A code with no words is a compile error here, and that is the whole point of this clause.
      const unreached: never = code;
      throw new Error(`no words were written for the library condition "${String(unreached)}"`);
    }
  }
}

/** The name the seeding holds while it runs, so two windows of one browser cannot both import. */
export const SEEDING_LOCK = 'fit.seed-the-library';

/**
 * ONE SEEDING AT A TIME IN THIS PROCESS — and it is not paranoia, it fires on every development run.
 *
 * React invokes an effect twice in development, so `OpeningLocalStore` opens the store, throws that
 * opening away, and opens a second one. Both openings ask an unseeded store what is in it, both are
 * told nothing, and both import.
 *
 * WHAT THAT COSTS, MEASURED RATHER THAN ASSUMED. The first guess was that it produces two copies of
 * the shipped library, since `importRecords` files each envelope under a freshly minted
 * `record_id`. It does not, and the reason CHANGED UNDER THIS PARAGRAPH — which is worth stating,
 * because the note that used to be here read as a standing fact and had become false:
 *
 *  - **It used to be refused.** `by_content_key` is UNIQUE, so the second transaction was thrown out
 *    whole with a `ConstraintError`, and what the coach got was a SEEDING FAILURE REPORTED ON A
 *    DEVICE THAT SEEDED PERFECTLY WELL a moment earlier, in the app's own words, on his first run.
 *  - **It is now reconciled.** That same refusal was the mechanism by which two DEVICES could never
 *    merge (s11/a9, measured on two real profiles), so the store now reconciles a library record
 *    arriving under a different identity onto the one it already holds, on the content key. The
 *    second import therefore lands, writes nothing new, doubles nothing, and reports no failure.
 *
 * The guard below is UNCHANGED and is still the point: the second import is now redundant work
 * rather than a false alarm, and redundant work on first run is still work worth not doing.
 *
 * The second caller therefore WAITS for the first and then asks again — `seedIfNeeded` re-reads the
 * store, finds the library, and writes nothing. It is not skipped, because skipping would make the
 * second answer a guess about what the first one did.
 */
let seedingInFlight: Promise<LibrarySeeding> | null = null;

/**
 * Ask the seed package to seed this store if it has never been seeded, and turn its answer into a
 * value the interface can show.
 *
 * IT NEVER REJECTS. A failure to seed is a condition to REPORT — the store is open, everything the
 * coach has made is there, and the app works. Turning it into a rejection would make it arrive at
 * whoever opened the store, which would report the wrong thing about the wrong operation.
 *
 * The cross-window lock is taken through the store's OWN platform port, the same one session leases
 * are taken through, so two windows opened at once on a fresh device queue rather than both
 * importing — and neither is told the library failed. A platform with no lock manager
 * (`platform.locks` is null — an old browser, or one where the facility is switched off) still gets
 * the in-process guard above, and its residual case is two SEPARATE windows racing on the very first
 * run of a fresh install. That residual is now one redundant import and never a doubled or
 * half-written library: the store reconciles the second copy of each record onto the first, on the
 * content key, in the same transaction. It used to be a false failure report — see above.
 */
export async function seedTheLibrary(store: LocalStore): Promise<LibrarySeeding> {
  const mine = (seedingInFlight ?? Promise.resolve(LIBRARY_NOT_YET))
    .catch(() => LIBRARY_NOT_YET)
    .then(() => withTheLock(store, () => askTheSeedPackage(store)));

  seedingInFlight = mine;
  try {
    return await mine;
  } finally {
    // Only the newest in-flight seeding clears the slot, or a slow first caller resolving after a
    // second one started would let a third jump the queue.
    if (seedingInFlight === mine) seedingInFlight = null;
  }
}

/** Hold {@link SEEDING_LOCK} across `run`, where the platform has a lock manager to hold it with. */
async function withTheLock(
  store: LocalStore,
  run: () => Promise<LibrarySeeding>,
): Promise<LibrarySeeding> {
  const locks = (store as { platform?: { locks?: { request?: unknown } | null } }).platform?.locks;
  if (locks === null || locks === undefined || typeof locks.request !== 'function') return run();

  const request = locks.request as (
    name: string,
    options: { mode: 'exclusive' },
    callback: () => Promise<LibrarySeeding>,
  ) => Promise<LibrarySeeding>;

  try {
    return await request(SEEDING_LOCK, { mode: 'exclusive' }, run);
  } catch (error: unknown) {
    // A lock manager that refuses is not a reason to leave the library unseeded, and it is not a
    // reason to seed twice either: the in-process guard is still held by the caller above.
    console.error('[seed] the seeding lock could not be taken; seeding without it', error);
    return run();
  }
}

/** The one call to `seedIfNeeded` in this application, and its answer as a value. */
async function askTheSeedPackage(store: LocalStore): Promise<LibrarySeeding> {
  try {
    const result = await seedIfNeeded(store);
    return result.imported ? LIBRARY_JUST_IMPORTED : LIBRARY_ALREADY_HERE;
  } catch (error: unknown) {
    // Logged as well as reported: the sentence the coach reads is deliberately not the platform's,
    // and the platform's own words must still reach a console somebody can look at.
    console.error('[seed] the shipped library could not be written to this device', error);
    return { state: 'could-not', condition: describeSeedingFailure(error) };
  }
}

/**
 * THE SEAM. The opening `main.tsx` already passes to `OpeningLocalStore`, with the library question
 * answered inside it.
 *
 * This is a WRAPPER rather than a change to `beginOpening`, deliberately: the three states of the
 * opening, the cancellation, and the closing of a store that arrives after its caller has gone are
 * all properties `local-store.ts` already proves, and none of them should have to be re-proved
 * because the library needs seeding. What arrives here is the store, and what leaves is the same
 * store, later.
 *
 * THE STORE IS RETURNED WHETHER THE SEEDING WORKED OR NOT. A seeding fault must never present
 * itself to the coach as a storage refusal — the store is open, everything he has made is in it. So
 * nothing thrown in here escapes: {@link seedTheLibrary} already answers with a condition rather
 * than rejecting, and the catch below is the second belt, because the ONE outcome this application
 * may not have is a blank screen.
 *
 * @param open the opening to wrap — `openTheLocalStore` in the application, a double in a test
 * @param publish called with the library answer, once, before the store is handed on
 * @param seed injected so a test can supply a refusal without a broken store
 * @returns an opening of exactly the same shape, to hand to `beginOpening`
 */
export function seedingAfterOpening(
  open: () => Promise<LocalStore>,
  publish: (seeding: LibrarySeeding) => void,
  seed: (store: LocalStore) => Promise<LibrarySeeding> = seedTheLibrary,
): () => Promise<LocalStore> {
  return async () => {
    const store = await open();
    try {
      publish(await seed(store));
    } catch (error: unknown) {
      console.error('[seed] the library question could not be answered at all', error);
      publish({ state: 'could-not', condition: describeSeedingFailure(error) });
    }
    return store;
  };
}

/**
 * The condition to show, or null when there is nothing to say about the library.
 *
 * A judgement rather than a comparison written inside a screen, so the suite asserts it with no
 * rendering at all — the same split as `screens/removals.ts` and `screens/RemovalsScreen.tsx`.
 * `not-yet` says NOTHING: the store is not open either, and the screen is already showing the
 * store's own notice for that. Two notices about one condition read as two faults.
 */
export function librarySnag(seeding: LibrarySeeding): LibraryCondition | null {
  return seeding.state === 'could-not' ? seeding.condition : null;
}
