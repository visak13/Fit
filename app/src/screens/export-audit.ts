/**
 * THE EXPORT AUDIT SEAM — the ONE place the three export kinds are ever written, and the argument
 * for why every export path in the application goes through it.
 *
 * ## WHY AN EXPORT IS RECORDED AT ALL
 *
 * An export is a DISCLOSURE: data leaving the application in readable form, into a message, a
 * download folder, a memory stick. It is the one act in this application whose effect is entirely
 * outside it — nothing on the device changes, so nothing on the device would otherwise remember it
 * happened. `core/journal/kinds.js` names the three kinds for exactly that reason and says so:
 * *"an export is a disclosure — data leaving the application in readable form — which is why it is
 * recorded at all, and why it is recorded even when it fails."*
 *
 * **The refusal path matters as much as the success path**, and it is the half a wiring step drops.
 * The questions this log answers later are mostly about things that did NOT happen: a coach who was
 * told his client's history was too long to draw, or that the selection he ticked was empty, has an
 * account of why nothing arrived. Without it, an export that failed and an export nobody attempted
 * are the same silence.
 *
 * ## WHY IT IS WIRED HERE, IN THE SHELL, AND NOT IN `core/export/`
 *
 * `core/export/` is byte machinery: it is handed a TABLE and a TITLE and knows nothing about whose
 * data it is, why, or whether the file ever reached anybody. An entry written from there would fire
 * when bytes were assembled, which is not the event — an audit trail that records assembly rather
 * than disclosure is worse than none, because it looks complete. That package is also a LEAF that
 * imports nothing outside itself; recording from inside it would have forced either a widened seam
 * or a second door.
 *
 * The precedent is already set and stated in `unwritten-kinds.test.js`: `auth.account_connected` is
 * written from `src/platform/google-account.ts`, in the shell, because the core is provider-neutral.
 * The scan reads both layers for that reason.
 *
 * ## THE SINK IS A REQUIRED ARGUMENT, AND THAT IS THE LOAD-BEARING PART
 *
 * {@link ExportAudit.journal} is required — not optional, not defaulted, not derived from a store a
 * function happens to be holding. **An optional sink is one a later call site omits and still
 * compiles, and the omission is undetectable afterwards**, because a log with no export entries in
 * it looks exactly like a device where nobody has ever exported anything. That is the same defect
 * this seam exists to close, arriving by the back door. `core/crypto/guard.js` took a required sink
 * for the identical reason and wrote the reason at the boundary rather than in a design note; this
 * is that reason, at this boundary.
 *
 * The five export entry points therefore take an {@link ExportAudit} and a new one cannot be written
 * without one. {@link exportJournal} is the single place `recordEvent` is named for an export.
 *
 * ## WHICH DOOR: `recordEvent`, AND THE TEST THAT DECIDES IT
 *
 * `JOURNAL.md` states the rule and it is not a matter of taste: **is there a PAIRED STORE WRITE this
 * entry has to be consistent with?** An export writes no record. Nothing is created, revised,
 * tombstoned or imported; the practice is read and bytes leave. So there is no second write for the
 * entry to be inconsistent with, and a standalone append IS the whole event.
 *
 * The one write anywhere near an export is `saveBackupArchive` stamping `last_backup_archive_at`
 * through `setMeta` — and `JOURNAL.md` already places `setMeta` outside the record-change domain
 * ("writes cursors and stamps rather than records"). It is a fact about this device's habits, not
 * part of the practice, so it does not turn a disclosure into a record change.
 *
 * `recordEvent` is `recordChange` with no work to do, so the head re-read, the race retry and the
 * retention bound are inherited rather than reimplemented. This module does not hand-roll an append.
 *
 * ## WHAT AN ENTRY MAY SAY ABOUT AN EXPORT — and what it must never say
 *
 * That it happened, when, on which device, and enough to say WHICH export. **Never the content.** An
 * audit log that copied what was exported would become a second copy of the very thing the export
 * was being careful about — a place no purge sweeps and no deletion propagates to. The entry shape
 * enforces this structurally, and nothing here tries to work around it.
 *
 * So an export carries at most two identifying things, both already permitted:
 *
 *  - a **subject**, where the export is about ONE record — a client's progress report names that
 *    client, a diet week names that plan. Omitted where the export is about the whole practice,
 *    rather than parking a description in an identifier field: a field that sometimes holds an
 *    identifier and sometimes holds a sentence is one nothing downstream can read.
 *  - an **`affected_count`**, where a count is meaningful — how many records the file carried. A
 *    count cannot carry a name, a note or a measurement, which is exactly why it is the only field
 *    that may grow with the work.
 *
 * **A whole-practice export is therefore distinguishable by its count and not by its artefact.** The
 * full export, the library backup and the encrypted archive all record `export.started` with no
 * subject. Saying which of the three would need a field the entry shape does not have, and adding
 * one is a MIGRATION that changes every digest — not something to do in passing. Stated here so the
 * next reader knows it is a bounded limit rather than an oversight.
 *
 * ## AN APPEND THAT FAILS IS NOT SWALLOWED
 *
 * These entry points otherwise never throw, deliberately: a coach must not meet "something went
 * wrong" with a client waiting. A failure of the LOG is the one exception, and it propagates.
 * `JOURNAL.md` is explicit that the rule protecting the coach from waiting on the log "does not
 * protect the log from being false" — a `try { append } catch { ignore }` here would produce exactly
 * the silent hole this seam was built to close, at exactly the moment something was going wrong.
 */

import { JOURNAL_KINDS, recordEvent } from '../../core/journal/journal.js';
import type { LocalStore } from '../../core/store/local-store.js';
import type { ExportTone } from './diet-export';

/** WHICH record an export is about, when it is about exactly one. Never a description. */
export interface ExportSubject {
  /** The record kind as the model spells it — `client`, `diet-plan`. */
  readonly type: string;
  /** The identifier the store already holds. */
  readonly record_id: string;
}

/** The fields an export entry may carry. The log's own shape rules refuse anything else. */
export interface ExportEntryFields {
  readonly kind: string;
  readonly subject?: ExportSubject;
  /** How many records the file carried, where that is known. Never what they said. */
  readonly affected_count?: number;
}

/** Where an export entry goes. Async because the append is a database write. */
export type ExportJournalSink = (fields: ExportEntryFields) => Promise<unknown>;

/**
 * What an export path must be given before it may disclose anything.
 *
 * `journal` is REQUIRED — see the header. `about` is not a capability but a FACT about this export,
 * and its absence is meaningful rather than a default: a whole-practice export names no single
 * record, and the vocabulary marks all three export kinds as taking a subject optionally.
 */
export interface ExportAudit {
  readonly journal: ExportJournalSink;
  readonly about?: ExportSubject;
}

/**
 * The sink for a real device — the ONE place `recordEvent` is named for an export.
 *
 * A function rather than the store itself, so an export path is handed the narrow capability it
 * needs instead of the whole database, and a test can watch what was written without a store.
 */
export function exportJournal(store: LocalStore): ExportJournalSink {
  return (fields) => recordEvent(store, fields);
}

/**
 * Whether the file actually left the application.
 *
 * `delivered` is the share sheet taking it and `kept` is the fallback download — in both the file
 * exists outside the application, which is what a disclosure IS. `stopped` is a dismissal, which the
 * vocabulary names as a refusal in its own words ("it failed, or it was DECLINED"), and `warning` is
 * a failure. One mapping, in one place: five call sites each deciding what counts as a completed
 * export is five answers to a question the log has to answer once.
 */
export function exportCompleted(tone: ExportTone): boolean {
  return tone === 'delivered' || tone === 'kept';
}

/**
 * RUN AN EXPORT AND RECORD IT — started before, completed or refused after, always both.
 *
 * The pairing is why this is a wrapper rather than two calls at each site: an entry point that
 * recorded the start and then returned down a path with no matching end would leave the log saying
 * an export began and never finished, which is a claim about a disclosure nobody can check.
 *
 * @param audit the required sink, and which record this export is about
 * @param make the export itself — the entry point's own body, unchanged
 * @param countOf how many records the finished file carried, or null where a count means nothing.
 *
 * **`countOf` IS CALLED ON EVERY OUTCOME, INCLUDING REFUSALS, AND IT MUST NOT THROW.** Read a value
 * the work already MEASURED — a variable it set as it went — never re-derive one from the input the
 * work has just refused. That mistake was made here and caught by the suite: `libraryBackupCounts`
 * refuses a library missing a kind exactly as the packing does, so re-deriving the count turned a
 * stated refusal into an unhandled error out of a function whose whole contract is that it never
 * throws, at a tap, with nothing on screen to explain it. A null is the honest answer wherever
 * nothing was measured; an entry must not state a number that was never counted.
 */
export async function auditedExport<R extends { readonly tone: ExportTone }>(
  audit: ExportAudit,
  make: () => Promise<R>,
  countOf: (report: R) => number | null = () => null,
): Promise<R> {
  const about = audit.about === undefined ? {} : { subject: audit.about };

  await audit.journal({ kind: JOURNAL_KINDS.EXPORT_STARTED, ...about });

  let report: R;
  try {
    report = await make();
  } catch (error) {
    // These paths are written not to throw, so arriving here means something unforeseen went wrong
    // WHILE data was being prepared to leave. That is the last moment an audit log should go quiet,
    // so the refusal is recorded before the error carries on to whoever can act on it.
    await audit.journal({ kind: JOURNAL_KINDS.EXPORT_REFUSED, ...about });
    throw error;
  }

  const count = countOf(report);
  await audit.journal({
    kind: exportCompleted(report.tone) ? JOURNAL_KINDS.EXPORT_COMPLETED : JOURNAL_KINDS.EXPORT_REFUSED,
    ...about,
    ...(count === null ? {} : { affected_count: count }),
  });

  return report;
}
