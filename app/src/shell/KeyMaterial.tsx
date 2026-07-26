/**
 * THE KEY-MATERIAL SEAM — where the condition screen gets its condition, and where nothing goes back.
 *
 * ## This is the seam `Divergences.tsx` said would be copied, copied
 *
 * That file states outright that "two later screens will copy this seam, so what it is made of
 * matters more than that it works", and lists what it is made of. This is one of the two, and it is
 * made of the same four things, deliberately and not by coincidence:
 *
 * - The reading is a PLAIN VALUE, not a hook that fetches. A screen cannot start work of its own.
 * - Its fields are the core's own, field for field and name for name. `condition` holds the
 *   `CryptoError` that `core/crypto/guard.js` threw, unconverted; this file renames nothing.
 * - The provider is REQUIRED. `useKeyMaterial` throws outside it rather than defaulting, because the
 *   state a default would invent — "nothing is wrong" — is the one that looks like good news while a
 *   split key sits unreported.
 * - What the screen may do with the reading is decided HERE, by what the reading contains.
 *
 * ## And ONE THING IS DELIBERATELY ABSENT, which is the whole point of this seam
 *
 * `DivergenceReading` carries a `resolve`, because a divergence is a question the coach answers.
 * **THIS READING CARRIES NO WAY BACK AT ALL, and that is the user ruling of 2026-07-26 expressed as
 * a type.** There is no pick, no discard, no cleanup and no "let the app try" — not present and
 * disabled, not behind a flag, not nullable and waiting to be filled in. Discarding the wrong key
 * makes every clinical note encrypted under it permanently unreadable, and the person pressing it
 * would be a non-technical coach mid-recovery of a wiped device with no second device left to check
 * against.
 *
 * A later step wiring this seam supplies a condition and NOTHING ELSE. If it finds itself wanting to
 * add a function here, that is the ruling being reopened, and it is the user's to reopen —
 * `key-material-condition.test.ts` walks the whole reading and the whole report for anything callable
 * and fails if one appears, so the change cannot arrive quietly as a helpful cleanup button.
 *
 * ## What the later step supplies, precisely
 *
 * It replaces the SOURCE, not this file and not the screen. It must:
 *
 *   1. catch the `CryptoError` thrown by `establishKeyMaterial` (`core/crypto/guard.js`) where the
 *      application can catch it — the core has already journalled the detection with a count and has
 *      already refused to act, so nothing here re-detects and nothing here records;
 *   2. push that error object into `KeyMaterialProvider`'s `reading` as `condition`, UNCHANGED and
 *      in particular with its `found` array intact, since that array is the only reason a screen can
 *      show him two things to look at;
 *   3. word any condition it newly surfaces by adding a member in `screens/key-material-condition.ts`
 *      rather than by wording it at the call site. The four remaining conditions in
 *      `core/crypto/errors.js` are its to route here; they are not built, stubbed or branched on
 *      anywhere in the interface today.
 */

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { KeyMaterialCondition } from '../screens/key-material-condition';

export type { KeyMaterialCondition, RemoteFileMeta } from '../screens/key-material-condition';

export interface KeyMaterialReading {
  /**
   * The condition the core refused to resolve, or null when there is nothing wrong.
   *
   * There is no second field. See the note above: the absence is the design.
   */
  readonly condition: KeyMaterialCondition | null;
}

/**
 * What is true in this build: no remote is wired, so nothing has been surveyed and no condition can
 * have been detected. It is not a placeholder standing in for a real value — it is the real value for
 * a device that has never reached the hidden space, which is every device until the Google step
 * lands.
 */
export const NO_KEY_MATERIAL_CONDITION: KeyMaterialReading = Object.freeze({ condition: null });

const KeyMaterialContext = createContext<KeyMaterialReading | null>(null);

export function KeyMaterialProvider({
  reading,
  children,
}: {
  reading: KeyMaterialReading;
  children: ReactNode;
}) {
  return <KeyMaterialContext.Provider value={reading}>{children}</KeyMaterialContext.Provider>;
}

/**
 * The current reading.
 *
 * @throws Error when used outside the provider. A missing seam must be loud: silently rendering
 * "nothing is wrong" would be an unwired screen reporting the one state that looks like good news.
 */
export function useKeyMaterial(): KeyMaterialReading {
  const reading = useContext(KeyMaterialContext);
  if (reading === null) {
    throw new Error('useKeyMaterial was used outside KeyMaterialProvider: the key-material seam is not wired');
  }
  return reading;
}
