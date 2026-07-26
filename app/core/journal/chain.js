/**
 * THE CHAIN — each entry commits to the one before it, and verification says WHERE it broke.
 *
 * ## What this buys, stated honestly
 *
 * Every entry carries the digest of its predecessor, and its own digest is taken over that link
 * along with its own fields. So altering one entry, or removing one, changes a digest that the
 * next entry already committed to, and the break is detectable at a named position.
 *
 * **This is TAMPER-EVIDENCE, not tamper-proofing, and the difference is not a technicality.** The
 * log lives in a database on a device the user controls. Anyone who can write that database —
 * the user, a script running in this origin, anyone with the unlocked device in their hand — can
 * take the chain from any point and RECOMPUTE IT FORWARD. Every digest would then agree, and this
 * verification would report a clean chain, because a clean chain is exactly what it would be. The
 * digest is unkeyed; there is no secret an attacker with local write access does not also have.
 *
 * What the chain therefore actually detects is: accidental corruption, a partial or careless edit,
 * a row deleted by something that did not know to fix up its neighbours, and a copy of the log
 * altered somewhere other than the device that wrote it. That is a real and useful set. It is not
 * "the log cannot be forged", and nothing in this package or its notes will say it is.
 *
 * **No claim of compliance is made anywhere in this package.** An append-only integrity-protected
 * log is one control among many; whether an organisation meets an obligation is a matter of
 * contracts, operating periods and independent examination, none of which live in a source file.
 *
 * ## PER DEVICE, and why there is no global chain
 *
 * Two devices append independently, offline, with no coordinator between them. There is no global
 * order to chain into: a single chain across both would require every append to know the other
 * device's latest entry, which is precisely the round trip a local-first application does not have
 * and would not survive.
 *
 * **So each device keeps its own chain.** `seq` counts from 1 per device, `previous_hash` links
 * only within a device, and {@link verifyChain} refuses to verify a mixture. A synchronised copy of
 * the log is therefore several independent chains side by side, each verifiable on its own, and
 * {@link verifyJournal} verifies them that way.
 *
 * The consequences are stated rather than discovered later:
 *
 *  - **Interleaving between devices is not recoverable and is not claimed.** Timestamps come from
 *    two clocks that were never synchronised. Ordering entries from two devices by `at` produces a
 *    plausible sequence that is not evidence of anything. Within one device, the chain is the
 *    order — regardless of what the timestamps say.
 *  - **A device's chain is only ever complete on that device.** A copy that arrived by
 *    synchronisation can be missing the newest entries; that reads as a SHORTER chain, not a broken
 *    one, and verification reports it as complete-so-far rather than as tampering.
 *  - **A missing device is invisible.** Nothing here can prove a third device's chain was not
 *    dropped wholesale, because nothing local ever committed to its existence.
 *
 * ## The head, and what retention does to it
 *
 * The first entry a device writes has `previous_hash: null`. Once retention discards the oldest
 * entries, the surviving first entry links to something that is gone — indistinguishable, on its
 * own, from an entry someone deleted.
 *
 * {@link verifyChain} therefore takes an ANCHOR: the digest the surviving head is expected to link
 * to, recorded by the retention pass that did the discarding. With the anchor, a pruned chain
 * verifies exactly. Without it, the result is reported as `truncated_head` — checked from the head
 * onwards and honest about what it could not check — never as a silent pass and never as a break.
 * The retention pass writes a `journal.retention_pruned` entry so the gap has an account of itself.
 */

import { sha256, textToBytes, toBase64 } from '../crypto/crypto.js';

import { JournalShapeError } from './errors.js';
import { HASH_FIELD, canonicalText, createEntry, looksLikeEntry } from './entry.js';
import { isKnownKind } from './kinds.js';

/**
 * The ways a chain can fail to verify. Each names a distinct thing that happened to it.
 * @readonly
 */
export const DIVERGENCE = Object.freeze({
  /** The value at this position is not an entry at all. */
  NOT_AN_ENTRY: 'not_an_entry',
  /** The entry's own digest does not match its own fields: it was edited after it was written. */
  ALTERED: 'altered',
  /** This entry does not link to the one before it: an entry was removed, or one was inserted. */
  BROKEN_LINK: 'broken_link',
  /** The sequence numbers are not consecutive: an entry is missing from what was handed over. */
  SEQUENCE_GAP: 'sequence_gap',
  /** Entries from more than one device were handed to a single chain check. */
  DEVICE_MISMATCH: 'device_mismatch',
  /** The first entry claims to be the first but does not link to nothing, or the reverse. */
  HEAD_NOT_ANCHORED: 'head_not_anchored',
  /** The entry names a kind this log does not define — it was not written by this vocabulary. */
  UNKNOWN_KIND: 'unknown_kind',
});

/**
 * The digest of an entry's fields, as base64.
 *
 * Taken over {@link canonicalText}, which is positional and therefore independent of key order.
 * The entry's own `hash` is excluded, since nothing can commit to its own digest.
 *
 * @param {object} entry An entry, with or without its `hash` field.
 * @returns {Promise<string>}
 */
export async function hashEntry(entry) {
  return toBase64(await sha256(textToBytes(canonicalText(/** @type {any} */ (entry)))));
}

/**
 * Append an entry to a device's chain.
 *
 * The position and the link are DERIVED from the predecessor rather than accepted from the caller.
 * A caller that could choose its own `seq` and `previous_hash` could write an entry that links
 * nowhere, and the chain would be a field the application fills in rather than a structure it
 * maintains.
 *
 * @param {object|null} previous The device's latest entry, or null if it has never written one.
 * @param {{kind: string, device: string, entry_id: string, at?: string, subject?: {type: string, record_id: string}|null, affected_count?: number|null}} fields
 * @returns {Promise<Readonly<object>>} The entry, hashed and frozen.
 */
export async function appendEntry(previous, fields) {
  if (previous !== null && !looksLikeEntry(previous)) {
    throw new JournalShapeError(
      'Appending needs the device\'s latest entry to link to, or null if it has never written one. '
      + 'It was given something that is not an entry.',
    );
  }
  if (previous !== null && previous.device !== fields.device) {
    throw new JournalShapeError(
      `This device is "${fields.device}" but the entry it was asked to link to was written on `
      + `"${previous.device}". Chains are per device — see the note at the top of chain.js.`,
      { field: 'device' },
    );
  }

  const draft = createEntry({
    ...fields,
    seq: previous === null ? 1 : previous.seq + 1,
    previous_hash: previous === null ? null : previous[HASH_FIELD],
  });

  return Object.freeze({ ...draft, [HASH_FIELD]: await hashEntry(draft) });
}

/**
 * @param {number} index
 * @param {object|undefined} entry
 * @param {string} reason
 * @param {string} detail
 */
function divergence(index, entry, reason, detail) {
  return Object.freeze({
    index,
    seq: entry && Number.isInteger(entry.seq) ? entry.seq : null,
    entry_id: entry && typeof entry.entry_id === 'string' ? entry.entry_id : null,
    reason,
    detail,
  });
}

/**
 * Verify ONE DEVICE'S chain, and report where it first diverges.
 *
 * "Where" and not "whether", because the two answers cost the same to produce and are worth wildly
 * different amounts. A pass that reports only that something is wrong leaves the coach with a
 * warning he cannot act on and a log he can neither trust nor investigate. A position, a sequence
 * number and a reason make the next question answerable: what else happened around then.
 *
 * Verification STOPS at the first divergence. Everything after a break is unverifiable rather than
 * wrong — the entries downstream of a removed entry all fail to link, and reporting them all as
 * separate faults would bury the one that matters under its own consequences.
 *
 * @param {readonly object[]} entries One device's entries, in ascending sequence order.
 * @param {{anchor?: string|null}} [options] `anchor` is the digest the first entry should link to,
 *   which retention records when it discards the entries before it.
 * @returns {Promise<Readonly<{ok: boolean, device: string|null, checked: number, first_divergence: object|null, truncated_head: boolean, head_hash: string|null}>>}
 */
export async function verifyChain(entries, options = {}) {
  if (!Array.isArray(entries)) {
    throw new JournalShapeError('verifyChain needs an array of entries.');
  }
  const anchor = options.anchor ?? null;

  /** @param {object} result */
  const done = (result) => Object.freeze({
    ok: result.first_divergence === null,
    device: result.device ?? null,
    checked: result.checked,
    first_divergence: result.first_divergence,
    truncated_head: result.truncated_head ?? false,
    head_hash: result.head_hash ?? null,
  });

  if (entries.length === 0) {
    return done({ device: null, checked: 0, first_divergence: null });
  }

  const device = looksLikeEntry(entries[0]) ? entries[0].device : null;
  let truncatedHead = false;
  let previous = /** @type {object|null} */ (null);

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];

    if (!looksLikeEntry(entry)) {
      return done({
        device,
        checked: index,
        first_divergence: divergence(index, undefined, DIVERGENCE.NOT_AN_ENTRY,
          'The value at this position does not have the shape of a log entry.'),
      });
    }
    if (entry.device !== device) {
      return done({
        device,
        checked: index,
        first_divergence: divergence(index, entry, DIVERGENCE.DEVICE_MISMATCH,
          `This entry was written on "${entry.device}" but the chain being checked is `
          + `"${device}". Group the entries by device first — chains do not span devices.`),
      });
    }
    if (!isKnownKind(entry.kind)) {
      return done({
        device,
        checked: index,
        first_divergence: divergence(index, entry, DIVERGENCE.UNKNOWN_KIND,
          `"${entry.kind}" is not a kind this log defines, so this entry was not written through `
          + 'the vocabulary. Either it was placed here by something else, or it predates a kind '
          + 'that has since been removed.'),
      });
    }

    if (previous === null) {
      // THE HEAD. Three cases, and they are genuinely different.
      if (entry.seq === 1) {
        // The first entry the device ever wrote must link to nothing.
        if (entry.previous_hash !== null) {
          return done({
            device,
            checked: index,
            first_divergence: divergence(index, entry, DIVERGENCE.HEAD_NOT_ANCHORED,
              'This entry claims to be the first this device wrote, yet it links to a predecessor. '
              + 'Either it is not the first, or its position was rewritten.'),
          });
        }
      } else if (anchor !== null) {
        // A pruned chain, and retention told us what the survivor should link to.
        if (entry.previous_hash !== anchor) {
          return done({
            device,
            checked: index,
            first_divergence: divergence(index, entry, DIVERGENCE.HEAD_NOT_ANCHORED,
              'The oldest surviving entry does not link to the digest the retention pass recorded '
              + 'when it discarded the entries before it. Something was removed other than by '
              + 'retention.'),
          });
        }
      } else if (entry.previous_hash === null) {
        // Claims to be a head, but is numbered as though entries came before it.
        return done({
          device,
          checked: index,
          first_divergence: divergence(index, entry, DIVERGENCE.HEAD_NOT_ANCHORED,
            `This entry is numbered ${entry.seq}, so ${entry.seq - 1} entries preceded it, yet it `
            + 'links to nothing. A pruned head links to what retention discarded.'),
        });
      } else {
        // Pruned, with no anchor to check against. Honest about what it cannot check.
        truncatedHead = true;
      }
    } else {
      if (entry.seq !== previous.seq + 1) {
        return done({
          device,
          checked: index,
          first_divergence: divergence(index, entry, DIVERGENCE.SEQUENCE_GAP,
            `Entry ${previous.seq} is followed by entry ${entry.seq}. The entries in between are `
            + 'missing from what was handed over, or were never written.'),
        });
      }
      if (entry.previous_hash !== previous[HASH_FIELD]) {
        return done({
          device,
          checked: index,
          first_divergence: divergence(index, entry, DIVERGENCE.BROKEN_LINK,
            'This entry does not link to the entry before it. Something between the two was '
            + 'removed, replaced or inserted.'),
        });
      }
    }

    if (await hashEntry(entry) !== entry[HASH_FIELD]) {
      return done({
        device,
        checked: index,
        first_divergence: divergence(index, entry, DIVERGENCE.ALTERED,
          'This entry\'s own digest does not match its own fields, so a field was changed after it '
          + 'was written.'),
      });
    }

    previous = entry;
  }

  return done({
    device,
    checked: entries.length,
    first_divergence: null,
    truncated_head: truncatedHead,
    head_hash: previous === null ? null : previous[HASH_FIELD],
  });
}

/**
 * Split a mixed pile of entries into one list per device, each in ascending sequence order.
 *
 * A synchronised copy of the log holds several devices' chains interleaved by arrival. This is the
 * step that has to happen before any of them can be verified, and it is here rather than left to
 * each caller so that "sorted by seq within a device" is one decision instead of several.
 *
 * @param {readonly object[]} entries
 * @returns {Map<string, object[]>}
 */
export function groupByDevice(entries) {
  /** @type {Map<string, object[]>} */
  const byDevice = new Map();
  for (const entry of entries) {
    const device = looksLikeEntry(entry) ? entry.device : '';
    const existing = byDevice.get(device);
    if (existing) existing.push(entry);
    else byDevice.set(device, [entry]);
  }
  for (const list of byDevice.values()) {
    list.sort((a, b) => (a?.seq ?? 0) - (b?.seq ?? 0));
  }
  return byDevice;
}

/**
 * Verify every device's chain in a mixed pile of entries, independently.
 *
 * The result is per device and deliberately does not reduce to one boolean plus one position: a
 * chain broken on the tablet says nothing about the laptop's, and folding them together would lose
 * exactly the information that makes the break investigable.
 *
 * @param {readonly object[]} entries
 * @param {{anchors?: Readonly<Record<string, string|null>>}} [options] Retention anchors per device.
 * @returns {Promise<Readonly<{ok: boolean, devices: readonly object[]}>>}
 */
export async function verifyJournal(entries, options = {}) {
  const anchors = options.anchors ?? {};
  const results = [];
  for (const [device, list] of groupByDevice(entries)) {
    // eslint-disable-next-line no-await-in-loop -- chains are verified in order, one per device.
    results.push(await verifyChain(list, { anchor: anchors[device] ?? null }));
  }
  results.sort((a, b) => String(a.device).localeCompare(String(b.device)));
  return Object.freeze({
    ok: results.every((result) => result.ok),
    devices: Object.freeze(results),
  });
}
