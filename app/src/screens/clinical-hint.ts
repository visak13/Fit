/**
 * ONCE MEANS ONCE — remembering, on this device, that the coach has read the hint.
 *
 * The register shows one gentle note at the point of entry saying that clinical detail belongs in
 * the protected field rather than in general notes. It is shown ONCE. This file is the half that
 * remembers; `clients.ts` holds the words, and `ClientsScreen.tsx` draws them.
 *
 * ## WHY THIS IS A DEVICE PREFERENCE AND NOT A RECORD
 *
 * Whether a hint has been read is a fact about a browser, not about the coach's practice. It does
 * not belong in the local store, it must never reach the Drive copy, and it is worth nothing on
 * another device — a coach who reads it on his laptop is not thereby told on his phone, and being
 * told once per device is the correct behaviour rather than a limitation. `theme.ts` and the device
 * tag in `platform/local-store.ts` treat their own facts of this class the same way and for the same
 * reason, so this is the third use of an idiom rather than a new one.
 *
 * ## WHAT "ONCE" MEANS, PRECISELY, BECAUSE THE TWO READINGS DIFFER
 *
 * It is remembered when he ACKNOWLEDGES it, not when it is first drawn. The alternative — recording
 * it as seen the moment it renders — makes "once" true of the code and false of the coach: a note
 * that appeared while he was looking at the name field, and never returned, was shown once and read
 * never. Acknowledgement is the only event that means he saw it.
 *
 * The cost is stated rather than hidden: a coach who ignores the note sees it again next visit. That
 * is the right side to err on for a sentence whose whole purpose is that clinical detail does not
 * end up in the wrong box, and it is bounded — one press ends it for good on that device.
 *
 * ## NOTHING HERE RUNS AT MODULE SCOPE
 *
 * The interface suite imports these modules outside a browser, so every global is touched inside a
 * function on the way to an answer somebody asked for.
 */

/** Where the acknowledgement is remembered. `window.localStorage` satisfies this. */
export interface HintStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** One key, named once, so the reader and the writer cannot disagree about where it lives. */
export const CLINICAL_HINT_KEY = 'fit.clients.clinical-hint-acknowledged';

/**
 * The value written. A word rather than `true`, so a person reading their own browser storage can
 * tell what it meant without this file in front of them.
 */
export const CLINICAL_HINT_ACKNOWLEDGED = 'acknowledged';

/**
 * Whether the hint still has to be shown on this device.
 *
 * IT FAILS TOWARDS SHOWING. A browser that refuses to be read — a locked-down device, a private
 * window — leaves this true, so the hint is shown rather than silently skipped. Showing a note one
 * extra time costs a reader a moment; skipping it costs the reason the note exists. The refusal is
 * logged rather than swallowed.
 */
export function hintIsStillDue(storage: HintStorage | null): boolean {
  if (storage === null) return true;
  try {
    return storage.getItem(CLINICAL_HINT_KEY) !== CLINICAL_HINT_ACKNOWLEDGED;
  } catch (error) {
    console.error('[clients] this device’s memory of the clinical hint could not be read', error);
    return true;
  }
}

/**
 * Remember that he has read it.
 *
 * A device that will not remember gets the note again next time, which is a cosmetic cost. It is
 * never allowed to become an error in front of the coach: he pressed acknowledge, and the note
 * going away is the whole of what he asked for.
 */
export function rememberHintAcknowledged(storage: HintStorage | null): void {
  if (storage === null) return;
  try {
    storage.setItem(CLINICAL_HINT_KEY, CLINICAL_HINT_ACKNOWLEDGED);
  } catch (error) {
    console.error('[clients] this device would not remember that the clinical hint was read', error);
  }
}

/**
 * `localStorage`, or null where reaching it throws — which it does in some locked-down browsers.
 *
 * Read inside a function, never at module scope, so this module stays importable outside a browser.
 */
export function deviceMemory(global: typeof globalThis = globalThis): HintStorage | null {
  try {
    return global.localStorage ?? null;
  } catch (error) {
    console.error('[clients] this browser refused access to its own local storage', error);
    return null;
  }
}
