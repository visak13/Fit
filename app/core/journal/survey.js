/**
 * THE WHOLE-JOURNAL READ SURFACE — which devices wrote, and does the whole log verify.
 *
 * `durable.js` beside this file owns the APPEND seam and every read an append needs, and all of
 * those reads are questions about ONE device's chain: its latest entry, its count, its oldest
 * entries, a page of it. That is deliberate, and `core/store/schema.js` argues it: the journal store
 * has NO INDEX at all, because a compound primary key of `[device, seq]` answers every question the
 * append path asks.
 *
 * The honest consequence is the gap this file closes. **A reader cannot ask the store which devices
 * exist.** It can only verify a device whose tag it already knows, which means it can never answer
 * the one question a person actually asks of an audit log — *does the WHOLE of this verify?* A
 * surface that verifies only what the caller thought to name reports a clean log while a second
 * device's chain sits broken beside it, and nothing anywhere says so.
 *
 * ## Enumeration without an index, and why it is not a scan
 *
 * {@link listDevicesInScope} walks the primary key and JUMPS: it reads one entry, takes its device
 * tag, then re-opens at the first key strictly after that device's whole range. The key that does
 * the jumping is `[device, AFTER_ALL_KEYS]` — an empty array sorts after every number on this
 * platform's key order (see `core/store/keys.js`), so it is an exact upper bound for one device's
 * entries and is never itself a stored key.
 *
 * So the cost is TWO requests per device — one cursor step and one count — and never one per entry.
 * A device with five thousand entries costs exactly what a device with one costs. No page of entries
 * is ever materialised here; the counts come from the store's own range count.
 *
 * It is bounded a second way as well, by {@link DEVICE_CEILING}, and reports `complete: false`
 * rather than silently returning a partial list. A device tag comes from a synchronised copy of the
 * log and is not something this application controls the number of.
 *
 * ## What verification returns, and the one thing it must not do
 *
 * {@link verifyWholeJournal} enumerates, runs the existing {@link verifyDeviceChain} per device, and
 * returns the per-device results **with `first_divergence` exactly as `chain.js` produced it** —
 * index, seq, entry_id, reason and detail, uncollapsed and unreworded. That is the whole point of a
 * verification surface: WHERE and WHAT. A summary that folds several devices into one boolean, or
 * that turns a divergence into a sentence, destroys the only information that makes a break
 * investigable, and nothing downstream can recover it.
 *
 * The top-level `ok` is the conjunction across devices and is offered ALONGSIDE the per-device
 * results, never instead of them.
 *
 * ## `truncated_head` IS NOT A BREAK, and a caller must be able to tell
 *
 * Retention discards the oldest entries irrecoverably (`retention.js`), recording an anchor and a
 * `journal.retention_pruned` entry. With that anchor a pruned chain verifies EXACTLY. Without it —
 * a synchronised copy that arrived without this device's small-values store — the surviving head
 * links to something that is gone, and `verifyChain` reports `truncated_head: true` with
 * `ok: true` and `first_divergence: null`. That is a normal, expected state.
 *
 * **So the two are distinguished by different fields, and both are carried here unchanged:**
 * truncation is `truncated_head`, a break is `ok` plus `first_divergence`. A surface that reported
 * "not fully verified" for both would tell the coach his log had been tampered with every time
 * retention did its job.
 *
 * **They are INDEPENDENT, and both can be true of one device at once.** A device whose oldest
 * entries were pruned can also carry a corrupted entry further along its chain: that reads as
 * `truncated_head: true` AND `ok: false` with a `first_divergence` localising the break. The two
 * facts stay on separate fields for exactly this case — folding them together would either dress
 * normal housekeeping up as tampering, or hide a real break behind a truncation notice, and the
 * second is the worse of the two. `survey.test.js` covers the both-at-once case on its own.
 *
 * ## Order comes from the chain, never from `at`
 *
 * `at` is the writing device's own clock and is untrusted (`JOURNAL.md`). Nothing here sorts by it.
 * Devices are returned in the store's own key order — which is the device tag — and entries within a
 * device are ordered by `seq`, by the primary key. There is no global sequence across devices and
 * none is invented.
 *
 * ## Reading a page newest-first
 *
 * There is deliberately no page function in this file. `readChainPage` in `durable.js` already takes
 * `direction: 'prev'` and pages backwards correctly — cursor and all — so a caller wanting the most
 * recent entry at the top passes `direction: 'prev'` and pages with the cursor it gets back. That is
 * asserted by a test in `survey.test.js` rather than by this sentence.
 */

import { AFTER_ALL_KEYS } from '../store/keys.js';
import { JOURNAL_STORE, META_STORE } from '../store/schema.js';

import { JournalShapeError } from './errors.js';
import { countOnDevice, verifyDeviceChain } from './durable.js';

/**
 * How many devices {@link listDevicesInScope} will enumerate before it stops and says so.
 *
 * Generous against reality — a coach has a laptop, a phone and perhaps a tablet — and present
 * because device tags arrive from synchronised copies of the log rather than from this device. An
 * unbounded loop over data this application did not create is the shape being avoided, not the
 * number.
 */
export const DEVICE_CEILING = 100;

/**
 * @typedef {Object} DeviceEntryCount
 * @property {string} device The device tag, as it appears in the entries themselves.
 * @property {number} entries How many entries that device's chain holds in this store.
 */

/**
 * The first entry belonging to a device strictly after `device`, or null when there are no more.
 *
 * `[device, AFTER_ALL_KEYS]` is the exact upper bound of one device's range: every stored key is
 * `[device, seq]` with `seq` a number, and an array sorts after every number. So a lower bound at
 * that key skips the whole of the current device in one cursor open rather than stepping through it.
 *
 * @param {import('../store/db.js').Scope} scope
 * @param {string|null} device The device to skip past, or null to start from the beginning.
 * @returns {Promise<object|null>}
 */
async function firstEntryAfterDevice(scope, device) {
  const range = device === null
    ? null
    : scope.KeyRange.lowerBound([device, AFTER_ALL_KEYS], false);
  const entry = await scope.first({ store: JOURNAL_STORE, range });
  return entry ?? null;
}

/**
 * Which devices have entries in this store, and how many each holds.
 *
 * Bounded twice over: two requests per device rather than one per entry, and never more than
 * `ceiling` devices. Nothing is loaded into memory but one entry at a time and the counts.
 *
 * Devices come back in the store's own key order, which is the device tag. That is an arbitrary
 * order and is not a claim about who wrote first — there is no global sequence across devices.
 *
 * @param {import('../store/db.js').Scope} scope A scope holding {@link JOURNAL_STORE} open.
 * @param {{ceiling?: number}} [options]
 * @returns {Promise<Readonly<{devices: readonly DeviceEntryCount[], complete: boolean}>>}
 *   `complete` is false only when more devices exist than the ceiling allowed.
 * @throws {JournalShapeError} if a row in the journal store carries no device tag, since such a row
 *   cannot be grouped into any chain and enumeration would step over it silently.
 */
export async function listDevicesInScope(scope, options = {}) {
  const { ceiling = DEVICE_CEILING } = options;

  /** @type {DeviceEntryCount[]} */
  const devices = [];
  let device = /** @type {string|null} */ (null);
  let complete = true;

  while (devices.length < ceiling) {
    // eslint-disable-next-line no-await-in-loop -- each jump starts where the previous one landed.
    const entry = await firstEntryAfterDevice(scope, device);
    if (entry === null) return frozenListing(devices, true);

    if (typeof entry.device !== 'string' || entry.device.length === 0) {
      throw new JournalShapeError(
        'A row in the log carries no device tag, so it belongs to no chain and enumeration cannot '
        + 'step past it. The log is read per device; a row without one was not written by this '
        + 'application.',
        { field: 'device', seq: entry.seq ?? null },
      );
    }

    device = entry.device;
    devices.push(Object.freeze({
      device,
      // eslint-disable-next-line no-await-in-loop -- one count per device, not one per entry.
      entries: await countOnDevice(scope, device),
    }));
  }

  // At the ceiling: one more jump decides whether anything was actually left out. Asking is cheaper
  // than reporting an incomplete listing that is in fact complete.
  complete = await firstEntryAfterDevice(scope, device) === null;
  return frozenListing(devices, complete);
}

/**
 * @param {DeviceEntryCount[]} devices
 * @param {boolean} complete
 */
function frozenListing(devices, complete) {
  return Object.freeze({ devices: Object.freeze(devices.slice()), complete });
}

/**
 * Which devices have entries in this store, read in a transaction of its own.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {{ceiling?: number}} [options]
 * @returns {Promise<Readonly<{devices: readonly DeviceEntryCount[], complete: boolean}>>}
 */
export async function listJournalDevices(store, options = {}) {
  return store.read(JOURNAL_STORE, (scope) => listDevicesInScope(scope, options));
}

/**
 * @typedef {Object} DeviceVerification
 * @property {string} device
 * @property {number} entries How many entries that device's chain holds, from enumeration.
 * @property {number} checked How many of them verification actually checked.
 * @property {boolean} ok
 * @property {boolean} truncated_head Honest truncation by retention — NOT a break. See the file note.
 * @property {boolean} complete False when the chain was longer than the read ceiling.
 * @property {object|null} first_divergence Exactly as `verifyChain` produced it: `{index, seq,
 *   entry_id, reason, detail}`. Never collapsed, re-worded or re-coded.
 */

/**
 * Verify EVERY device's chain in this store, and say per device where each one stands.
 *
 * The diagnostics entry point for the whole log, as `verifyDeviceChain` is for one device. Nothing
 * on a write path calls it: it reads and hashes, and hashing may not happen inside a transaction
 * (see the platform note at the top of `durable.js`), so each device is read in a transaction of its
 * own and verified outside it.
 *
 * The per-device results carry `first_divergence` UNCHANGED. A caller that wants a single word for
 * the whole log has `ok`; a caller that wants to investigate has the position, the sequence number,
 * the entry identifier and the reason, and neither is available at the other's expense.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {{ceiling?: number, chain?: {ceiling?: number, pageSize?: number}}} [options]
 *   `ceiling` bounds the device enumeration; `chain` is passed to each device's verification.
 * @returns {Promise<Readonly<{ok: boolean, device_count: number, complete: boolean,
 *   devices: readonly DeviceVerification[]}>>}
 */
export async function verifyWholeJournal(store, options = {}) {
  const listing = await store.read(
    [JOURNAL_STORE, META_STORE],
    (scope) => listDevicesInScope(scope, { ceiling: options.ceiling }),
  );

  /** @type {DeviceVerification[]} */
  const devices = [];
  for (const { device, entries } of listing.devices) {
    // eslint-disable-next-line no-await-in-loop -- one chain at a time; each reads its own transaction.
    const result = await verifyDeviceChain(store, device, options.chain ?? {});
    devices.push(Object.freeze({
      device,
      entries,
      checked: result.checked,
      ok: result.ok,
      truncated_head: result.truncated_head,
      complete: result.complete,
      first_divergence: result.first_divergence,
    }));
  }

  return Object.freeze({
    ok: devices.every((result) => result.ok),
    device_count: devices.length,
    complete: listing.complete,
    devices: Object.freeze(devices),
  });
}
