/**
 * THE THREE WAYS TO PUT WORK ON THE QUEUE, and why they are named rather than generic.
 *
 * `enqueue` in `queue.js` takes an operation and its fields. These three wrap it so that the caller
 * cannot get the parts that MUST agree wrong:
 *
 *  - a create's remote name has to carry its idempotency key, or a replay after a lost
 *    acknowledgement cannot recognise its own earlier write. {@link queueBackup} builds the name from
 *    the key, so the rule is satisfied by construction rather than by remembering it;
 *  - an update has to carry the revision it was composed against if a lost update is ever to be
 *    DETECTED, so {@link queueUpdate} asks for it explicitly and states what it does and does not buy;
 *  - a removal needs an identifier and nothing else, and passing content to one is a mistake worth
 *    refusing rather than ignoring.
 *
 * ## Nothing remote-bound may bypass this
 *
 * The rule is that everything Drive-bound enters the queue first. It is worth saying why, because the
 * shortcut is always available and always looks harmless: the alternative is a call made directly at
 * the moment the coach taps, which succeeds while he is online and vanishes when he is not. The
 * failure it produces is not an error message — it is a session that was never backed up, discovered
 * weeks later when the device is gone.
 */

import { newRecordId } from '../model/model.js';
import { OPERATION, keyedName } from './entry.js';
import { enqueue } from './queue.js';

/**
 * Queue a NEW remote file — a backup copy, an export, a key envelope.
 *
 * The remote name is built as `<base>.<key>.<extension>`, which is readable to the account holder
 * browsing the folder and exact enough for a replay to find. Pass `idempotencyKey` to make the
 * delivery stable across re-enqueues: the same key twice returns the entry that already exists rather
 * than queueing a second copy. Omit it and every call is a distinct delivery — which is right for
 * "back up now" and wrong for a retry loop.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {{space: string, baseName: string, payload: string, label: string, refs?: readonly string[],
 *          idempotencyKey?: string, now?: number|string|Date}} args
 * @returns {Promise<{entry: import('./entry.js').OutboxEntry, queued: boolean}>}
 */
export async function queueBackup(store, args) {
  if (typeof args.payload !== 'string') {
    throw new TypeError('A backup payload must already be text. This layer never serialises, encrypts or inspects it.');
  }
  const key = args.idempotencyKey || newRecordId();
  return enqueue(store, {
    operation: OPERATION.CREATE,
    space: args.space,
    name: keyedName(args.baseName, key),
    payload: args.payload,
    label: args.label,
    refs: args.refs,
    idempotency_key: key,
    now: args.now,
  });
}

/**
 * Queue a replacement of an existing remote file.
 *
 * `expectedRevision` is what makes a lost update DETECTABLE. Be exact about what that is worth: there
 * is no conditional-match facility on this service, so the check happens at delivery time and another
 * writer can still land between the check and the write. What it buys is that a clash which HAS
 * already happened is surfaced to a person instead of being silently overwritten — and an unreported
 * conflict is a lost edit whichever way it faces. Omit it and the update is unconditional, which is
 * right only when this device is the sole author of that file.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {{fileId: string, space: string, payload: string, label: string, expectedRevision?: number|null,
 *          refs?: readonly string[], idempotencyKey?: string, now?: number|string|Date}} args
 * @returns {Promise<{entry: import('./entry.js').OutboxEntry, queued: boolean}>}
 */
export async function queueUpdate(store, args) {
  if (typeof args.payload !== 'string') {
    throw new TypeError('An update payload must already be text. This layer never serialises, encrypts or inspects it.');
  }
  return enqueue(store, {
    operation: OPERATION.OVERWRITE,
    space: args.space,
    target_file_id: args.fileId,
    payload: args.payload,
    expected_revision: args.expectedRevision ?? null,
    label: args.label,
    refs: args.refs,
    idempotency_key: args.idempotencyKey,
    now: args.now,
  });
}

/**
 * Queue the removal of a remote file — the outward half of a purge.
 *
 * A removal is naturally idempotent: the second attempt of one whose acknowledgement was lost finds
 * nothing there, and that is the outcome asked for. So a stable key is usually worth passing, and the
 * obvious one is the identifier being removed.
 *
 * @param {import('../store/local-store.js').LocalStore} store
 * @param {{fileId: string, space: string, label: string, refs?: readonly string[],
 *          idempotencyKey?: string, now?: number|string|Date}} args
 * @returns {Promise<{entry: import('./entry.js').OutboxEntry, queued: boolean}>}
 */
export async function queueRemoval(store, args) {
  return enqueue(store, {
    operation: OPERATION.REMOVE,
    space: args.space,
    target_file_id: args.fileId,
    payload: null,
    label: args.label,
    refs: args.refs,
    idempotency_key: args.idempotencyKey,
    now: args.now,
  });
}
