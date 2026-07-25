/**
 * WHY IT DID NOT SYNCHRONISE — the actual reason, never a spinner.
 *
 * The requirement is blunt: failure must be LOUD AND SPECIFIC. A spinner that hides a failure is the
 * exact thing this must make impossible, so this module produces the reason a synchronisation did not
 * happen, distinguishing at minimum a missing credential, an expired credential, no network, an entry
 * the service refused, and never having synchronised at all.
 *
 * ## The in-progress rule, and how it is enforced rather than requested
 *
 * "Never expose an indeterminate in-progress state as the ONLY thing a caller can see." A boolean
 * saying a synchronisation is running is useful and is exposed — but it is exposed BESIDE the figures
 * and the reason, never instead of them. That is why this module has no in-progress reason code at
 * all: there is no value it can return that means "wait and see", so a caller cannot render one. The
 * surface carries `in_progress` as a separate field and a test asserts the rest of the state is fully
 * populated while it is true.
 *
 * ## A DEAD CREDENTIAL IS A CONDITION OF THE WHOLE QUEUE
 *
 * The outbox got this wrong first and corrected it, and the correction binds here. If an expired
 * credential is modelled per-entry, this surface reports a handful of individually-stuck items when
 * the truth is that NOTHING can go anywhere at all, and the coach reads a stopped queue as a small
 * problem. So the credential reason carries `queue_wide: true` and the plain sentence says so. The
 * per-entry count remains available, but it is not the headline and it is not what the words describe.
 *
 * ## Classification is read off declared fields, never off message text
 *
 * The same discipline as `core/outbox/classify.js`: every failure the port raises declares `retryable`
 * and `needsReauth`, and the synchronisation report carries them through as `retryable` and
 * `needs_reauth`. Matching on a message would break the first time a message is reworded, and would
 * break SILENTLY — an unrecognised failure would land in whichever branch the code happened to end on,
 * which for this surface means telling the coach the wrong thing about his data.
 */

/**
 * Every reason this surface can give. All specific; none of them is "something went wrong".
 *
 * - `never_synchronised`      — this installation has never completed one. Nothing is in the backup.
 * - `credential_missing`      — Google has never been connected on this device.
 * - `credential_expired`      — it was connected and the access has run out. QUEUE-WIDE. One tap.
 * - `no_network`              — the service could not be reached.
 * - `entry_rejected`          — the service refused something. It will never land without a person.
 * - `outcome_unknown`         — an attempt timed out and it cannot be told whether it landed.
 * - `local_failure`           — the failure was on this side. Not the service's fault, and not silent.
 * - `unverifiable_sync_claim` — a last-synced value turned up that no genuine flush produced.
 */
export const REASON = Object.freeze({
  NEVER_SYNCHRONISED: 'never_synchronised',
  CREDENTIAL_MISSING: 'credential_missing',
  CREDENTIAL_EXPIRED: 'credential_expired',
  NO_NETWORK: 'no_network',
  ENTRY_REJECTED: 'entry_rejected',
  OUTCOME_UNKNOWN: 'outcome_unknown',
  LOCAL_FAILURE: 'local_failure',
  UNVERIFIABLE_SYNC_CLAIM: 'unverifiable_sync_claim',
});

/** @type {readonly string[]} */
export const REASON_VALUES = Object.freeze(Object.values(REASON));

/**
 * Worst first. The first entry of the derived list is the one a single-line indicator shows.
 *
 * `unverifiable_sync_claim` leads because it is the only reason that says the surface itself cannot be
 * trusted, and every figure below it is then suspect. `never_synchronised` is second because it is the
 * only state in which NOTHING is in the backup rather than merely something.
 *
 * @type {readonly string[]}
 */
export const REASON_PRECEDENCE = Object.freeze([
  REASON.UNVERIFIABLE_SYNC_CLAIM,
  REASON.NEVER_SYNCHRONISED,
  REASON.ENTRY_REJECTED,
  REASON.OUTCOME_UNKNOWN,
  REASON.LOCAL_FAILURE,
  REASON.CREDENTIAL_MISSING,
  REASON.CREDENTIAL_EXPIRED,
  REASON.NO_NETWORK,
]);

/**
 * What each reason says, and what the coach can do about it.
 *
 * `action` is `null` where there is genuinely nothing he can do, and that is deliberate: offering an
 * action that does not help is how an indicator earns the reputation of lying.
 *
 * @type {Readonly<Record<string, Readonly<{message: string, action: string|null, queue_wide: boolean}>>>}
 */
export const REASONS = Object.freeze({
  [REASON.NEVER_SYNCHRONISED]: Object.freeze({
    message: 'This device has never backed up. Nothing here is in your Google Drive yet.',
    action: 'connect_google',
    queue_wide: true,
  }),
  [REASON.CREDENTIAL_MISSING]: Object.freeze({
    message: 'Google has not been connected on this device, so nothing can be backed up.',
    action: 'connect_google',
    queue_wide: true,
  }),
  [REASON.CREDENTIAL_EXPIRED]: Object.freeze({
    // Queue-wide, and the words say so. Not "3 items are stuck" — nothing at all can be sent.
    message: 'Your Google connection has expired, so nothing can be backed up until you reconnect.',
    action: 'reconnect_google',
    queue_wide: true,
  }),
  [REASON.NO_NETWORK]: Object.freeze({
    message: 'Google could not be reached. Your work is saved on this device and will be backed up when it can.',
    action: null,
    queue_wide: true,
  }),
  [REASON.ENTRY_REJECTED]: Object.freeze({
    message: 'Google refused some of your changes. They are saved on this device but will not back up on their own.',
    action: 'review_refused',
    queue_wide: false,
  }),
  [REASON.OUTCOME_UNKNOWN]: Object.freeze({
    message: 'Some changes were sent but not confirmed, so it cannot be said whether they arrived.',
    action: 'review_unconfirmed',
    queue_wide: false,
  }),
  [REASON.LOCAL_FAILURE]: Object.freeze({
    message: 'Backing up failed inside the app rather than at Google. Your work is saved on this device.',
    action: null,
    queue_wide: true,
  }),
  [REASON.UNVERIFIABLE_SYNC_CLAIM]: Object.freeze({
    message: 'A last-backed-up time was found that no completed backup produced. Treat it as no backup at all.',
    action: 'sync_now',
    queue_wide: true,
  }),
});

/**
 * One failure from a synchronisation report, as a reason code.
 *
 * @param {{code?: string, retryable?: boolean, needs_reauth?: boolean}} failure
 * @returns {string} One of {@link REASON_VALUES}.
 */
export function reasonForFailure(failure) {
  const f = failure || {};
  // Declared first, code second. `needs_reauth` is the port's own statement about itself; the code is
  // a label. Where they disagree the declaration wins, because it is what the queue itself acts on.
  if (f.needs_reauth === true || f.code === 'credential_expired') return REASON.CREDENTIAL_EXPIRED;
  if (f.code === 'unavailable' || f.code === 'network_unavailable') return REASON.NO_NETWORK;
  if (f.code === 'timeout') return REASON.OUTCOME_UNKNOWN;
  if (f.code === 'invalid_request' || f.code === 'not_found' || f.code === 'not_implemented') {
    return REASON.ENTRY_REJECTED;
  }
  // Retryable and otherwise unrecognised: the service was reachable-but-unhappy or not reachable at
  // all, and the honest reading of "retry this later, unchanged" is that it did not get through.
  if (f.retryable === true) return REASON.NO_NETWORK;
  if (f.retryable === false) return REASON.ENTRY_REJECTED;
  return REASON.LOCAL_FAILURE;
}

/**
 * Every reason that currently applies, worst first.
 *
 * Every one of them, not just the worst: the single-line indicator shows the first, and the panel the
 * coach opens after tapping it shows the rest. Collapsing to one would hide a refused entry behind a
 * dropped connection, and the refused entry is the one that never resolves by itself.
 *
 * @param {{never_synchronised?: boolean, credential?: {present?: boolean, expired?: boolean}|null,
 *          waiting_for_credential?: number, rejected?: number, ambiguous?: number,
 *          failures?: readonly {code?: string, retryable?: boolean, needs_reauth?: boolean}[],
 *          unverifiable_sync_claim?: boolean}} figures
 * @returns {Readonly<{code: string, message: string, action: string|null, queue_wide: boolean}>[]}
 */
export function deriveReasons(figures) {
  const f = figures || {};
  /** @type {Set<string>} */
  const codes = new Set();

  if (f.unverifiable_sync_claim) codes.add(REASON.UNVERIFIABLE_SYNC_CLAIM);
  if (f.never_synchronised) codes.add(REASON.NEVER_SYNCHRONISED);

  if (f.credential) {
    if (f.credential.present === false) codes.add(REASON.CREDENTIAL_MISSING);
    else if (f.credential.expired === true) codes.add(REASON.CREDENTIAL_EXPIRED);
  }
  // The queue holding entries on the credential is a queue-wide stop in its own right, whether or not
  // the caller told us about the credential and whether or not a synchronisation has been attempted
  // since. The hold IS the evidence.
  if ((f.waiting_for_credential || 0) > 0) codes.add(REASON.CREDENTIAL_EXPIRED);

  if ((f.rejected || 0) > 0) codes.add(REASON.ENTRY_REJECTED);
  if ((f.ambiguous || 0) > 0) codes.add(REASON.OUTCOME_UNKNOWN);

  for (const failure of f.failures || []) codes.add(reasonForFailure(failure));

  // A credential that is known missing and a credential that is known expired are two different
  // sentences, and showing both would be a contradiction the coach has to resolve himself.
  if (codes.has(REASON.CREDENTIAL_MISSING)) codes.delete(REASON.CREDENTIAL_EXPIRED);

  return REASON_PRECEDENCE
    .filter((code) => codes.has(code))
    .map((code) => Object.freeze({ code, ...REASONS[code] }));
}
