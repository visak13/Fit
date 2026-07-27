/**
 * THE EVENT LOG — the module API. Import from here.
 *
 * Named explicitly rather than relying on directory-index resolution, for the same reason
 * `core/store/store.js`, `core/status/status.js` and `core/crypto/crypto.js` are: directory
 * resolution is a runtime convenience browsers do not have, and this core is written to be adopted
 * unchanged by the browser application. `'./core/journal/journal.js'` works in both places;
 * `'./core/journal'` works in neither. `index.js` beside this file is the TEST ENTRY POINT, not
 * the API — nothing in the application imports it, because it pulls in the test runner.
 *
 * Plain, dependency-free ECMAScript modules; types in documentation comments. This package touches
 * no document, no element and no style. `kinds.js`, `entry.js` and `chain.js` are pure logic — WHAT
 * an entry is and HOW entries chain; `retention.js` is the policy that bounds the log, and
 * `durable.js` is the seam to `core/store` where the log becomes durable.
 *
 * Start at `JOURNAL.md` beside this file for the written notes.
 *
 * ```js
 * import { JOURNAL_KINDS, appendEntry, verifyChain } from './core/journal/journal.js';
 *
 * const entry = await appendEntry(latestOnThisDevice, {
 *   kind: JOURNAL_KINDS.RECORD_UPDATED,          // a string outside the vocabulary THROWS
 *   device: store.device,                        // the tag the local store already carries
 *   entry_id: crypto.randomUUID(),
 *   subject: { type: 'session-note', record_id },  // WHICH record — never what it says
 * });
 *
 * const result = await verifyChain(entriesForThisDevice);
 * result.ok;                 // false if the chain was altered or an entry removed
 * result.first_divergence;   // WHERE it broke: index, seq, entry_id, reason
 * result.truncated_head;     // the oldest entries were pruned and no anchor was supplied
 * ```
 *
 * The four things worth knowing before using it:
 *
 *  1. **The vocabulary is CLOSED.** {@link assertKind} throws on a kind it does not define, which is
 *     the mechanism that stops each later step growing its own. The account half of the
 *     authentication domain is now written — from the SHELL, because this core may not know a
 *     provider exists — while the local-unlock half and the whole export domain are defined here
 *     with no call sites on purpose, because the steps that own them do not exist.
 *  2. **An entry cannot carry a record's content**, and that is structural: a closed set of fields,
 *     flat values only, and identifier fields that admit no prose. Not a naming convention.
 *  3. **The chain is TAMPER-EVIDENCE, not tamper-proofing.** Anyone who can write the database can
 *     recompute the chain forward from any point. See `chain.js` for what that does and does not
 *     detect. Nothing here claims compliance with anything.
 *  4. **One chain PER DEVICE.** Two devices append independently with no coordinator, so there is
 *     no global order to chain into and none is invented.
 *  5. **An entry commits in the SAME TRANSACTION as the change it records.** {@link recordChange} is
 *     the door: one `runWrite` carries the caller's own work and the entry, so an entry cannot be
 *     missing for a change that happened, or present for one that did not. Retention is enforced by
 *     that same write, because the log grows in exactly one way and the bound belongs where the
 *     growth is.
 *  6. **A digest is never taken inside a database transaction, in either direction.** The platform
 *     ends a transaction the moment control returns to the event loop with no request pending, and
 *     `await crypto.subtle.digest` is exactly that. The append is split at that seam — hash first,
 *     write after — and so is verification. See `durable.js` and the section in `JOURNAL.md`; the
 *     naive shape fails in a way that leaves the change on disk and the entry absent.
 */

export {
  JournalContentError,
  JournalError,
  JournalKindError,
  JournalRaceError,
  JournalShapeError,
} from './errors.js';

export {
  DOMAIN,
  JOURNAL_KINDS,
  KINDS,
  KIND_SPECS,
  SUBJECT,
  assertKind,
  isKnownKind,
  kindsInDomain,
} from './kinds.js';

export {
  ENTRY_FIELDS,
  HASH_FIELD,
  MAX_DEVICE_LENGTH,
  MAX_RECORD_ID_LENGTH,
  MAX_TYPE_LENGTH,
  SUBJECT_FIELDS,
  canonicalText,
  createEntry,
  looksLikeEntry,
} from './entry.js';

export {
  DIVERGENCE,
  appendEntry,
  groupByDevice,
  hashEntry,
  verifyChain,
  verifyJournal,
} from './chain.js';

export {
  MAX_ENTRIES_PER_DEVICE,
  PRUNE_BATCH,
  PRUNE_CEILING,
  RETENTION,
  policyProblem,
  retentionPlan,
} from './retention.js';

export {
  ANCHOR_META_PREFIX,
  JOURNAL_STORE,
  JOURNAL_STORES,
  MAX_APPEND_ATTEMPTS,
  anchorKeyFor,
  commitEntryInScope,
  countOnDevice,
  journalStoresFor,
  latestOnDevice,
  prepareEntry,
  readAnchor,
  readChainForVerification,
  readChainPage,
  recordChange,
  recordEvent,
  verifyDeviceChain,
} from './durable.js';
