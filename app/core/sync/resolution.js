/**
 * APPLYING THE SIDE THE COACH PICKED — the one place a divergence is ever resolved.
 *
 * ## Why this lives in the core and not in the screen
 *
 * `divergence.js` classifies a same-revision, different-device clash as {@link VERDICT.DIVERGED},
 * hands back both sides in full, and applies neither. Nothing there resolves anything, and
 * `NEVER_RESOLVED_BY_GUESSING` is a declared value with its own test saying so. What was missing was
 * the other half: something that applies the answer once a person has given one.
 *
 * That half is here rather than in the interface for a reason that is easy to get wrong. The screen
 * COLLECTS the choice; this module APPLIES it and records it. Put the application in the interface
 * instead and two things break at once. The revision rule below would be re-derived by whoever wrote
 * the screen, which is how the reset defect happened. And `core/journal/unwritten-kinds.test.js`
 * asserts a partition over the whole vocabulary — every kind either wired to a named owning file or
 * unwritten with a stated reason — by scanning `core/` alone. A call site in the interface would
 * leave that test green while the partition it asserts had quietly become false: the file would go
 * on claiming nobody writes `sync.conflict_resolved` and nothing would ever say otherwise.
 *
 * ## The revision rule, which is the whole difficulty
 *
 * Both sides of a divergence sit at revision N. That is what a divergence IS. So writing the chosen
 * side back as it stands writes revision N again — and last-write-wins, correctly by its own rule,
 * may then pick the discarded side on the next pass. The coach would see his choice take effect,
 * watch it work, and find it undone minutes later with nothing having errored anywhere.
 * `core/INTEGRATION.md` §5 already paid for this lesson once on the admin reset.
 *
 * So the chosen side is written at a **strictly higher** revision than either side claims, through
 * {@link liftAbove} rather than by arithmetic invented here, and the proof is a ROUND TRIP against
 * the other device rather than an assertion about a number. The floor is recomputed from the record
 * as it stands INSIDE the transaction, because the work may repeat and because a third write may
 * have landed between the coach seeing the conflict and answering it.
 *
 * ## What this module still refuses to do
 *
 * It refuses to choose. There is no default side, no "prefer newer", no "prefer this device", and no
 * option to enable one — {@link NOTHING_HERE_CHOOSES_A_SIDE} is a declared value asserted by a test,
 * exactly as its counterpart in `divergence.js` is. A caller that does not name a side gets a
 * refusal, not a guess.
 *
 * It also refuses to resolve anything that is not actually a divergence. The pair is re-classified
 * here, and a plain last-write-wins supersede handed to this function is thrown out rather than
 * applied. That guard is what stops the ordinary pull path laundering routine updates through the
 * conflict kind: an audit log that called every pull a collision would overstate how often the
 * coach's two devices genuinely clashed, which is worse than not recording collisions at all.
 */

import { JOURNAL_KINDS, recordChange } from '../journal/journal.js';
import { validateRecord } from '../model/model.js';
import { rebuildParticipants, storeNameFor, storesFor } from '../store/store.js';
import { VERDICT, classify } from './divergence.js';
import { SyncBoundaryError } from './errors.js';
import { liftAbove } from './revisions.js';

/**
 * The two answers a person can give. There is no third, and there is no default.
 *
 * Declared as data so the surface builds its buttons from this list rather than from two spelled
 * strings, and so adding a third answer would be a visible change here.
 */
export const RESOLUTION = Object.freeze({
  /** Keep what this device holds; the other device's revision is discarded. */
  LOCAL: 'local',
  /** Take what arrived from the other device; this device's revision is discarded. */
  INCOMING: 'incoming',
});

/** @type {readonly string[]} */
export const RESOLUTION_VALUES = Object.freeze(Object.values(RESOLUTION));

/**
 * **A declared value, asserted by a test.** Nothing in this module picks a side. It applies one that
 * was already picked, and refuses when it was not. The counterpart to `NEVER_RESOLVED_BY_GUESSING`
 * in `divergence.js`: that one says the classifier never decides, this one says the applier never
 * decides either, so there is no seam between them where a default could be helpfully added.
 */
export const NOTHING_HERE_CHOOSES_A_SIDE = true;

/**
 * The side named, out of a described divergence.
 *
 * @param {import('./divergence.js').Divergence} divergence
 * @param {string} side One of {@link RESOLUTION}.
 * @returns {{chosen: any, discarded: any}}
 */
export function sidesOf(divergence, side) {
  if (!divergence || typeof divergence !== 'object') {
    throw new SyncBoundaryError('A described divergence is required — both sides, in full.', {});
  }
  if (!RESOLUTION_VALUES.includes(side)) {
    throw new SyncBoundaryError(
      `"${side}" is not an answer. A divergence is resolved by naming a side — ${RESOLUTION_VALUES.join(' or ')} — `
      + 'and there is deliberately no default: a side chosen here would be a coin toss made on the '
      + "coach's behalf about his own data.",
      { side, offered: RESOLUTION_VALUES },
    );
  }

  const chosen = side === RESOLUTION.LOCAL ? divergence.local : divergence.incoming;
  const discarded = side === RESOLUTION.LOCAL ? divergence.incoming : divergence.local;
  if (!chosen || !discarded) {
    throw new SyncBoundaryError(
      'A described divergence carries BOTH sides in full. One of them is missing, so there is '
      + 'nothing here to choose between.',
      { side, has_local: Boolean(divergence.local), has_incoming: Boolean(divergence.incoming) },
    );
  }
  return { chosen, discarded };
}

/**
 * Refuse anything that is not genuinely a divergence between two full, valid envelopes.
 *
 * @param {any} local @param {any} incoming
 */
function assertGenuineDivergence(local, incoming) {
  if (local.record_id !== incoming.record_id || local.type !== incoming.type) {
    throw new SyncBoundaryError(
      'These are two different records, so there is no divergence between them to resolve.',
      { local: `${local.type}:${local.record_id}`, incoming: `${incoming.type}:${incoming.record_id}` },
    );
  }

  const verdict = classify(local, incoming);
  if (verdict !== VERDICT.DIVERGED) {
    throw new SyncBoundaryError(
      `These two revisions are "${verdict}", not a divergence. Only a same-revision clash between `
      + 'two devices is a question a person has to answer; everything else is an ordinary '
      + 'last-write-wins supersede and is applied by the pull. Resolving one through here would '
      + 'write sync.conflict_resolved for a routine pull and make the log overstate how often the '
      + "coach's two devices actually clashed.",
      { verdict, record_id: local.record_id, local_rev: local.rev, incoming_rev: incoming.rev },
    );
  }

  for (const [which, record] of [['local', local], ['incoming', incoming]]) {
    const { ok, issues } = validateRecord(record);
    if (!ok) {
      throw new SyncBoundaryError(
        `The ${which} side of this divergence is not a record that can be saved as it stands.`,
        { side: which, issues },
      );
    }
  }
}

/**
 * @typedef {Object} Resolution
 * @property {string} record_id
 * @property {string} type
 * @property {string} chose            Which side was applied — one of {@link RESOLUTION}.
 * @property {number} from_rev         The revision both sides claimed.
 * @property {number} to_rev           The revision the answer was written at. Strictly higher.
 * @property {any} record              The envelope as written.
 * @property {{device: string, rev: number, deleted: boolean}} discarded The side that was not taken.
 * @property {Readonly<object>} entry  The log entry this resolution wrote.
 */

/**
 * Apply the side the coach picked, and record that a person picked it.
 *
 * **The only call site of `sync.conflict_resolved` in the application.** The entry rides the write it
 * attests to, in one transaction, for the reason `core/journal/durable.js` gives: there IS a paired
 * store write here, so an entry appended beside it could assert a resolution that was rolled back —
 * or go missing for one that landed. It carries the record as its subject, which the vocabulary
 * requires, because an entry saying only "a conflict was resolved" cannot be checked against
 * anything afterwards.
 *
 * The work reads the record as it stands inside the transaction and lifts above THAT, not above the
 * revision the divergence was described at. The coach may have been looking at that screen for a
 * while, and `recordChange` may run the work more than once.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {import('./divergence.js').Divergence} divergence As `describeDivergence` returned it.
 * @param {{side: string, now?: number|string|Date}} options
 * @returns {Promise<Resolution>}
 */
export async function resolveDivergence(store, divergence, options) {
  const side = options?.side;
  const { chosen, discarded } = sidesOf(divergence, side);
  assertGenuineDivergence(divergence.local, divergence.incoming);

  const type = chosen.type;
  const recordId = chosen.record_id;
  const storeName = storeNameFor(type);

  const { result, entry } = await recordChange(store, {
    stores: storesFor(type),
    fields: {
      kind: JOURNAL_KINDS.SYNC_CONFLICT_RESOLVED,
      subject: { type, record_id: recordId },
      // One record moved. A count, and a count carries no name, no note and no reading — which is
      // the whole of what an entry is allowed to say about the client this record may belong to.
      affected_count: 1,
    },
    work: async (scope) => {
      // The floor is whatever is actually here, plus both sides of the question. Lifting above only
      // the revision the divergence was DESCRIBED at would lose to a write that landed while the
      // coach was deciding — the same losing-write shape this module exists to prevent, arriving
      // through the door left open by trusting a number read earlier.
      const current = await scope.get(storeName, recordId);
      const floor = [current, divergence.local, divergence.incoming]
        .filter(Boolean)
        .reduce((highest, candidate) => (candidate.rev > highest.rev ? candidate : highest));

      // The write is marked as descending from an answer, and this is the ONLY place in the
      // application that marks one. Without it the union read cannot tell the coach's answer from an
      // ordinary edit that merely outranks both sides — and it used to be unable to, which cost a
      // real edit: two devices at revision N, one of them editing on to N+1 without ever having seen
      // the other, was read as "he settled it" and the clash was dropped with nobody told. See
      // `core/model/envelope.js`.
      //
      // The MAXIMUM, never a plain overwrite: the chosen side may already descend from an earlier
      // answer, and lowering the mark would put a clash the coach has already settled back in front
      // of him, which is the re-ask-forever failure this filter exists to prevent.
      const lifted = liftAbove(floor, chosen, { device: store.device, now: options?.now });
      const applied = {
        ...lifted,
        resolved_from: Math.max(Number(chosen.resolved_from) || 0, divergence.rev),
      };
      await scope.put(storeName, applied);
      if (type === 'session') await rebuildParticipants(scope, applied);
      return applied;
    },
  });

  // Only after the commit. The other window on this laptop may be running a session against this
  // record, and telling it about a write that could still vanish would be an acknowledgement by
  // another route.
  store.coordinator.announce({
    kind: result.deleted ? 'delete' : 'put',
    type,
    record_id: recordId,
    rev: result.rev,
    device: store.device,
  });

  return {
    record_id: recordId,
    type,
    chose: side,
    from_rev: divergence.rev,
    to_rev: result.rev,
    record: result,
    discarded: {
      device: discarded.device,
      rev: discarded.rev,
      deleted: Boolean(discarded.deleted),
    },
    entry,
  };
}
