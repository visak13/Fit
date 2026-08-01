/**
 * WHAT EACH TICKED ITEM PUTS IN THE FILE — the full export's contents, assembled and scrubbed.
 *
 * `checklist.js` decides WHICH items go in and enforces the gate. This decides what each one IS. The
 * split matters: the gate is a rule about the coach's choice, and this is a rule about the data, and
 * folding them together would mean the scrubbing below could be skipped by anybody who assembled the
 * contents themselves.
 *
 * ## TWO FIELD CLASSES ARE REMOVED BY REBUILD, NOT BY STRIP
 *
 * **THE CLINICAL FIELDS ARE NOT IN THE CLIENTS ITEM.** They belong to the gated item and only to it.
 * This is the failure that would be easiest to ship and hardest to see: a clients part that dumps
 * client records verbatim carries `clinical_reference` and `clinical_reference_label` into the
 * UNGATED half of the file, so an export the coach deliberately left unticked contains the very
 * thing he declined to include. Nothing would error, the file would open, and the gate would look
 * like it worked.
 *
 * **THE MEET LINK AND ITS SOURCE ARE NOT IN THE SESSIONS ITEM.** A calendar link's encoded segment
 * embeds the signed-in Gmail address — measured on this build's own spike output, not theorised —
 * and a credential scanner passes it clean because it is not a credential. The recorded rule binds
 * an export, a synced payload AND a backup, so it binds here even though this file is the coach's
 * own: a backup is a file that gets sent onward, and his email address in a client's hands defeats
 * the minimisation posture that deliberately collects no client contact detail at all.
 *
 * Both are ALLOWLIST REBUILDS. Nothing is deleted from a copy: the record is rebuilt out of a named
 * list of fields, so a field added to a client or a session next year arrives on the SAFE side by
 * default and the person adding it has no reason to know this file exists. A strip protects against
 * the leaks somebody thought of; a rebuild protects against the ones nobody has had yet.
 *
 * ## AND THE LIBRARY IS NOT REBUILT, DELIBERATELY
 *
 * It goes out verbatim, through `library-backup.js`, because it holds no client data at all and
 * because a library backup that dropped a field would restore a library missing part of itself.
 * Different data, different rule, stated so the difference does not read as an oversight.
 *
 * Pure. No clock, no store, no browser, no cryptography.
 */

import { CLINICAL_ITEM_ID } from './checklist.js';
import { libraryBackupParts } from './library-backup.js';
import { contentOf, recordsParts } from './records-table.js';

/**
 * THE CLIENT FIELDS THAT MAY LEAVE IN THE UNGATED HALF — the whole list, in one place, so the
 * boundary is readable at a glance rather than reconstructed from what is missing.
 *
 * `clinical_reference`, `clinical_reference_label` and anything added beside them are not stripped:
 * they are never copied.
 * @type {readonly string[]}
 */
export const CLIENT_FIELDS_CARRIED = Object.freeze(['name', 'notes', 'adaptation_flag', 'active']);

/**
 * The session fields that may leave.
 *
 * `meet_url` and `meet_source` are absent for the reason in this file's header. `summary` IS carried:
 * a session-wide summary must never reach a CLIENT's own report, and `core/report/` refuses it for
 * that reason — but this file is the coach's own backup of his own working notes, and a backup that
 * dropped what he wrote about his own sessions would not be a backup of his practice.
 * @type {readonly string[]}
 */
export const SESSION_FIELDS_CARRIED = Object.freeze([
  'routine_id', 'client_ids', 'status', 'mode', 'scheduled_at', 'started_at', 'ended_at', 'summary',
]);

/** The clinical fields, which travel only inside the gated item. Named so a test can look for them. */
export const CLINICAL_FIELDS = Object.freeze([
  'clinical_reference', 'clinical_reference_label', 'clinical_note',
]);

/**
 * @typedef {Object} FullExportRecords
 * @property {unknown[]} [clients]
 * @property {unknown[]} [sessions]
 * @property {unknown[]} [performed]
 * @property {unknown[]} [readings]
 * @property {unknown[]} [diet]
 * @property {Record<string, unknown[]>} [library] Every kind, or the library backup refuses it.
 * @property {unknown[]} [clinical] The clinical fields, ALREADY OPENED by the caller. They are
 *   ciphertext in the store, sealed under the device's data key; a file that must open with a
 *   passphrase alone cannot carry them in that form, because the key that opens them is exactly what
 *   is not present in the opening context. So the caller opens them and this module never sees a key.
 */

/**
 * What each item contributes, ready for `fullExportParts`.
 *
 * @param {FullExportRecords} records
 * @returns {Record<string, {name: string, text: string}[]>}
 */
export function fullExportContents(records = {}) {
  return {
    clients: recordsParts('clients', 'Clients', rebuiltAll(records.clients, CLIENT_FIELDS_CARRIED)),
    sessions: [
      ...recordsParts('sessions', 'Sessions', rebuiltAll(records.sessions, SESSION_FIELDS_CARRIED)),
      ...recordsParts('performed', 'What was performed', records.performed ?? []),
      ...recordsParts('readings', 'Readings', records.readings ?? []),
    ],
    diet: recordsParts('diet', 'Diet plans', records.diet ?? []),
    library: records.library === undefined ? [] : libraryBackupParts(records.library),
    [CLINICAL_ITEM_ID]: recordsParts('medical-reminders', 'Medical reminders and links', records.clinical ?? []),
  };
}

/**
 * HOW MANY RECORDS EACH ITEM WOULD ACTUALLY PUT IN THE FILE.
 *
 * ## Why this exists, and why it is DERIVED from the parts rather than from the records
 *
 * The export seam accepts an empty table without complaint, and it is right to — it cannot tell "the
 * coach has not started yet" from "a short list". So refusing to write a file holding nothing is the
 * CALLER's gate, and this is what the caller counts.
 *
 * The obvious implementation is a second mapping from item id to the arrays it draws from. That
 * mapping would be a copy of the one in {@link fullExportContents}, and the two would agree until
 * somebody changed what an item contains — at which point the count would be right about a file that
 * had stopped being what it counted. So the count is read back OUT of the parts that were actually
 * built. There is one mapping, and this reads its output.
 *
 * @param {FullExportRecords} records
 * @returns {Record<string, number>} Keyed by item id.
 */
export function fullExportCounts(records = {}) {
  const contents = fullExportContents(records);

  /** @type {Record<string, number>} */
  const counts = {};
  for (const [item, parts] of Object.entries(contents)) {
    counts[item] = parts
      .filter((part) => part.name.endsWith('.json'))
      .reduce((held, part) => held + JSON.parse(part.text).length, 0);
  }
  return counts;
}

/**
 * How many records THIS SELECTION would put in the file. Zero means the file would carry nothing.
 *
 * @param {readonly string[]} ticked
 * @param {FullExportRecords} records
 * @returns {number}
 */
export function tickedRecordCount(ticked, records = {}) {
  const counts = fullExportCounts(records);
  return (Array.isArray(ticked) ? ticked : [])
    .reduce((held, item) => held + (counts[item] ?? 0), 0);
}

/**
 * A record rebuilt out of an allowlist. Field by named field — nothing here spreads a record, and
 * nothing may.
 *
 * A field the record does not have is simply absent from the rebuild rather than present as empty,
 * so a backup does not invent a field the application never wrote.
 *
 * @param {unknown} record @param {readonly string[]} fields @returns {Record<string, any>}
 */
export function rebuilt(record, fields) {
  const content = contentOf(record);
  /** @type {Record<string, any>} */
  const out = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(content, field)) out[field] = content[field];
  }
  return out;
}

/** @param {unknown} records @param {readonly string[]} fields @returns {Record<string, any>[]} */
function rebuiltAll(records, fields) {
  return (Array.isArray(records) ? records : []).map((record) => rebuilt(record, fields));
}
