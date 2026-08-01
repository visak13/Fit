/**
 * THE FULL EXPORT — a CHECKLIST of what to include, not a button.
 *
 * ## Why a checklist at all, said once so nobody simplifies it away
 *
 * "Export everything" is one tap and one decision the coach cannot see. This is several decisions he
 * CAN see: he ticks what should be in the file. The item covering medical notes is LABELLED as
 * needing a passphrase, and he may simply leave it unticked — at which point the file that comes out
 * is completely ordinary and there is no passphrase anywhere in the flow.
 *
 * ## THE THREE PROPERTIES THIS MODULE IS RESPONSIBLE FOR
 *
 * **ONE. AN UNTICKED CLINICAL ITEM LEAVES NO TRACE.** Not a placeholder, not an empty section, not a
 * note saying something was withheld. A file that says "medical notes: not included" has told its
 * reader that medical notes exist for this client, which is a disclosure the coach did not make and
 * cannot take back. So the part is absent, and a test reads every byte of every part for the words
 * that would give it away rather than trusting that it is.
 *
 * **TWO. THE PASSPHRASE IS DEMANDED BY THE SELECTION, NOT BY THE SCREEN.** {@link passphraseNeeded}
 * derives it from the ticked items and the items' own declarations. A screen that decided this for
 * itself would be a second rule about when the gate applies, and the two would agree until an item
 * was added.
 *
 * **THREE. THE SEALING IS INJECTED AND REQUIRED, NEVER IMPORTED.** This package names no algorithm
 * and holds no key material, and `purity.test.js` beside this file asserts that rather than trusting
 * it. When the clinical item is ticked the caller must supply the sealing function, and it is a
 * REQUIRED argument rather than an optional one for the reason the crypto package already records
 * about its own journal sink — an optional sink is one a later call site omits and still compiles,
 * and the omission is undetectable afterwards because an unsealed export and an export with nothing
 * to seal look identical from the outside.
 *
 * ## The file is a store-only ZIP of text parts, and that needed NO widening of the seam
 *
 * `zip.js` already packs named text parts and is already exported. A multi-sheet workbook would have
 * meant changing `tableToWorkbook` from one table to many, and the seam's own header says a widening
 * happens deliberately, in the open, with its reason recorded — not because it was convenient for the
 * second caller.
 *
 * Pure. No clock, no store, no browser, no cryptography.
 */

import { storeOnlyZip } from '../export/export.js';

/**
 * The identity of the one item that is gated. Named so no caller matches on a label.
 *
 * REMINDERS RATHER THAN NOTES, AND THE WORD MATTERS. This application never holds a medical record:
 * it holds a short non-clinical adaptation reminder, a pointer to where the real detail lives in the
 * coach's own system, and that pointer's label. Calling the item "medical notes" would tell every
 * reader — including whoever opens the archive — that the file contains clinical history, which is
 * both untrue and the opposite of the minimisation this design is built on.
 */
export const CLINICAL_ITEM_ID = 'medical-reminders';

/**
 * @typedef {Object} ChecklistItem
 * @property {string} id
 * @property {string} label What the coach reads beside the tick box.
 * @property {string} words One line under the label saying what it actually puts in the file.
 * @property {boolean} requires_passphrase
 */

/**
 * THE CHECKLIST. Every item the full export can carry, in the order they are shown.
 *
 * The gated item is LAST and says so in its own label, because a gate discovered after the decision
 * is a gate that feels like a trap. No emoji, and no exclamation: this is a list of things to
 * include, not a warning.
 *
 * @type {readonly ChecklistItem[]}
 */
export const FULL_EXPORT_ITEMS = Object.freeze([
  Object.freeze({
    id: 'clients',
    label: 'Clients',
    words: 'Names, general notes and the adaptation reminders you wrote for yourself.',
    requires_passphrase: false,
  }),
  Object.freeze({
    id: 'sessions',
    label: 'Sessions and what was performed',
    words: 'Every session, what was done in it, and the readings taken.',
    requires_passphrase: false,
  }),
  Object.freeze({
    id: 'diet',
    label: 'Diet plans',
    words: 'The weekly plans, as they are written in the app.',
    requires_passphrase: false,
  }),
  Object.freeze({
    id: 'library',
    label: 'Your exercise and routine library',
    words: 'Exercises, routines and intensity patterns, including your own edits.',
    requires_passphrase: false,
  }),
  Object.freeze({
    id: CLINICAL_ITEM_ID,
    label: 'Medical reminders and links (needs a passphrase)',
    words:
      'The short reminders you wrote for yourself and the links to where you keep the real detail. '
      + 'Leave this unticked and the file needs no passphrase at all. Tick it and you set one; that '
      + 'file can then only be opened with it, on any device, even if this phone and your Google '
      + 'account are both gone.',
    requires_passphrase: true,
  }),
]);

/** The archive's own name, before the extension. */
export const FULL_EXPORT_TITLE = 'Fit export';

/**
 * What the finished file IS.
 *
 * These live here rather than in `core/export/` on purpose. The seam's media types describe the two
 * things IT writes — a workbook and a separated-values file — and the container the full export
 * happens to use is a decision of the full export, not of the table contract. Putting them in the
 * seam would be widening it for a caller it does not have.
 */
export const FULL_EXPORT_MEDIA_TYPE = 'application/zip';

/** @see FULL_EXPORT_MEDIA_TYPE */
export const FULL_EXPORT_FILE_EXTENSION = '.zip';

/** What the checklist is headed with. */
export const CHECKLIST_TITLE = 'Choose what goes in the file';

/** Said under the heading, once. */
export const CHECKLIST_WORDS =
  'The file is made on this device and nothing is uploaded anywhere. Tick what you want in it.';

/** Said when he has ticked nothing and pressed the control anyway. */
export const NOTHING_TICKED =
  'Nothing is ticked, so there is nothing to put in the file. Tick at least one thing above.';

/**
 * What he is asked for when the gated item is ticked, and nothing is asked otherwise.
 *
 * ## IT SAYS WHAT THE PASSPHRASE DOES NOT PROTECT AGAINST
 *
 * A control that guards one threat and not another must name which, or the coach reads a protection
 * that is not there. This one guards a file that is LOST or SENT TO THE WRONG PERSON. It does not
 * guard against somebody who has both the file and the passphrase — that is the whole deal, and it
 * is exactly the deal a prompt saying only "protected by a passphrase" would let him misread.
 *
 * Saying so also tells him the one thing he can act on: keep the two apart. A warning he cannot act
 * on is decoration; this one has an instruction in it.
 */
export const PASSPHRASE_PROMPT =
  'Set a passphrase for this file. It is the only way to open the file afterwards, and nobody — '
  + 'including us — can recover it for you. Anyone who has both this file and the passphrase can '
  + 'read what is inside it, so do not send them together. Forgetting it loses nothing that matters: '
  + 'this is a copy, so you can simply make another.';

/** Said when the gated item is ticked and no passphrase was given. */
export const PASSPHRASE_MISSING =
  'This file includes medical notes, so it needs a passphrase before it can be made.';

/**
 * The item with this id, or null.
 * @param {string} id @returns {ChecklistItem|null}
 */
export function itemFor(id) {
  return FULL_EXPORT_ITEMS.find((item) => item.id === id) ?? null;
}

/**
 * WHETHER THIS SELECTION NEEDS A PASSPHRASE — derived from the items, never from a screen.
 *
 * @param {readonly string[]} ticked The ids he has ticked.
 * @returns {boolean}
 */
export function passphraseNeeded(ticked) {
  return readSelection(ticked).some((item) => item.requires_passphrase);
}

/**
 * The ticked items, in the checklist's own order, refusing anything it does not recognise.
 *
 * Order comes from the checklist rather than from the order he tapped, so two exports of the same
 * selection are the same file. An unknown id is refused rather than ignored: an id that reaches here
 * and matches nothing means a screen and this list have drifted, and silently dropping it would
 * produce a file missing whatever that item was.
 *
 * @param {readonly string[]} ticked
 * @returns {ChecklistItem[]}
 * @throws {TypeError} On an id no item has.
 */
export function readSelection(ticked) {
  const ids = Array.isArray(ticked) ? ticked : [];
  for (const id of ids) {
    if (itemFor(id) === null) {
      throw new TypeError(`There is nothing in the export called "${id}".`);
    }
  }
  return FULL_EXPORT_ITEMS.filter((item) => ids.includes(item.id));
}

/**
 * @typedef {Object} FullExportRequest
 * @property {readonly string[]} ticked
 * @property {Record<string, {name: string, text: string}[]>} contents The parts each item
 *   contributes, keyed by item id. Supplied by the caller, because this module knows what the file
 *   is made of and not where the records come from.
 * @property {((parts: {name: string, text: string}[]) => Promise<{name: string, text: string}>)} [sealClinical]
 *   REQUIRED when the gated item is ticked. Takes that item's parts and returns the one sealed part
 *   that replaces them. Injected rather than imported so this package still touches no cryptography.
 */

/**
 * THE FILE, as its parts.
 *
 * @param {FullExportRequest} request
 * @returns {Promise<{name: string, text: string}[]>}
 * @throws {TypeError} On nothing ticked, an unknown item, or a gated item with no sealing function.
 */
export async function fullExportParts(request) {
  const selection = readSelection(request?.ticked);
  if (selection.length === 0) throw new TypeError(NOTHING_TICKED);

  const contents = request?.contents ?? {};
  const parts = [];

  for (const item of selection) {
    const own = Array.isArray(contents[item.id]) ? contents[item.id] : [];

    if (!item.requires_passphrase) {
      parts.push(...own);
      continue;
    }

    if (typeof request?.sealClinical !== 'function') {
      throw new TypeError(
        `"${item.label}" is ticked, so a sealing function is required. It is a required argument `
        + 'rather than an optional one because an export that quietly skipped the sealing would be '
        + 'indistinguishable, from the outside, from one that had nothing to seal.',
      );
    }
    parts.push(await request.sealClinical(own));
  }

  return parts;
}

/**
 * The finished archive.
 *
 * @param {FullExportRequest} request
 * @returns {Promise<Uint8Array>}
 */
export async function fullExportArchive(request) {
  return storeOnlyZip(await fullExportParts(request));
}
