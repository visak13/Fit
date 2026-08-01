/**
 * SEALING THE GATED ITEM — the provider the full export injects, and the only place the export
 * direction touches cryptography.
 *
 * ## WHY THIS IS A SEPARATE FILE FROM EVERYTHING THAT USES IT
 *
 * `core/artefacts/` decides what the full export contains and enforces the gate, and it names no
 * algorithm and holds no key — a purity test asserts that. So the sealing cannot live there. It
 * arrives as an argument, which is what lets the whole checklist be driven in a test with a stub
 * sealer and no cryptography at all, and lets THIS be tested against the real thing with no
 * checklist.
 *
 * ## WHAT IT ACTUALLY SEALS, IN PROPORTION
 *
 * Not a medical record. This application never holds one: it holds a short non-clinical adaptation
 * reminder, a POINTER to where the real detail lives in the coach's own system, and that pointer's
 * label. The label is sealed along with the rest because a file name like `cardiac-history.pdf` is
 * itself health information — which is why it was ciphertext in the store to begin with.
 *
 * The words the coach reads must stay in that proportion too. This is a tick box he can simply leave
 * unticked, and every default export is frictionless regardless.
 *
 * ## THE PLAINTEXT ARRIVES ALREADY OPENED, AND THAT IS DELIBERATE
 *
 * In the store these fields are sealed under the device's data key. A file that must open with a
 * passphrase ALONE cannot carry them in that form — the key that opens them is precisely what is not
 * present in the opening context. So the caller opens them first, and this function re-seals them
 * under the passphrase. It never sees the store's key and has no way to reach it.
 */

import { sealPortableArchive } from '../../core/crypto/crypto.js';

/** What the sealed part is called inside the archive. */
export const SEALED_PART_NAME = 'medical-reminders.sealed.json';

/** Said if the sealing is somehow reached without a passphrase. The checklist refuses first. */
export const NO_PASSPHRASE = 'A passphrase is needed before medical reminders can go in the file.';

/** One part of the export, as the checklist passes them. */
interface Part { name: string; text: string }

/**
 * Build the sealer for one export, bound to the passphrase the coach just set.
 *
 * A factory rather than a bare function because the passphrase belongs to THIS export and to no
 * other: binding it here means it cannot be left behind in a module and reused by the next one.
 *
 * @param passphrase The phrase he typed twice. The only way into the file that comes out.
 * @param now Supplied rather than read, so the whole path stays drivable in a test.
 */
export function sealClinicalWith(
  passphrase: string,
  now: () => string = () => new Date().toISOString(),
): (parts: Part[]) => Promise<Part> {
  return async (parts: Part[]): Promise<Part> => {
    if (typeof passphrase !== 'string' || passphrase.trim() === '') {
      throw new TypeError(NO_PASSPHRASE);
    }

    // The item's own parts, verbatim, as one document. Sealed together rather than one file each:
    // the number and names of the parts would themselves say how many clients have a reminder.
    const payload = JSON.stringify(parts, null, 2);

    return {
      name: SEALED_PART_NAME,
      text: await sealPortableArchive(passphrase, payload, { at: now() }),
    };
  };
}
