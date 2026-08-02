/**
 * WHAT THE ACTIVITY LIST SAYS — every sentence and every judgement, and none of the drawing.
 *
 * The screen that draws this holds no logic at all; that separation is the house pattern, and
 * `src/screens/removals.ts` against `RemovalsScreen.tsx` is the closest analogue.
 *
 * ## THE DECISION THIS FILE IS MOST DEFINED BY: HOW AN ENTRY'S SUBJECT IS RENDERED
 *
 * **This module never looks a record up, and therefore says the same thing about a record that is
 * live, one that is tombstoned, and one that is gone altogether.** That identical treatment is the
 * decision, not an omission, and it is the whole protection.
 *
 * An entry carries `subject.record_id` — an opaque identity — and never any content. That is
 * deliberate: `core/store/purge.js` keeps identities only so that removing a client does not leave
 * the client's name behind in the very records that prove they were removed. A reader that joined
 * that identity back to a live record to show a friendly name would resurrect a removed client's
 * name on the one screen that exists to show they were removed — and it would do it silently, on
 * the entries where the join happened to succeed, which is exactly the shape of defect that looks
 * right in review.
 *
 * The three outcomes of the join this file refuses to perform:
 *
 *  - **LIVE** — an envelope with content. A name exists, and showing it would defeat the guarantee
 *    for every client who is later removed, because the surface would then be a name-shaped hole
 *    that opens and closes without saying which it is doing.
 *  - **TOMBSTONED** — envelope present, `deleted: true`, `content: null`. NO NAME EXISTS. Anything
 *    the surface showed here would be an identifier dressed up as a name.
 *  - **PURGED** — `undefined`, nothing at all (`core/store/purge.js`). Retention may also have
 *    discarded the entry that named it.
 *
 * So the subject is worded from its TYPE alone — "one client record", "one session record" — with
 * the opaque reference offered separately for somebody helping him, and {@link WHY_THERE_IS_NO_NAME}
 * saying WHY there is no name rather than showing a bare identifier that reads as a defect. The
 * precedent for that wording is `NO_NAME_IS_DELIBERATE` in `removals.ts`, and the reason is the
 * same one: the words must never imply the app has forgotten something it was supposed to keep. It
 * kept exactly what it meant to keep.
 *
 * ## THE VOCABULARY IS DERIVED, NEVER COPIED
 *
 * The kinds are a closed set owned by `core/journal/kinds.js`, and this file reads `KIND_SPECS` at
 * runtime rather than holding a list of names. The wording is mine; the SET is the core's. A kind
 * added to core with no phrase here degrades to {@link UNWORDED_KIND} — an honest sentence rather
 * than an exception, because a screen that refuses to load is worse for the coach than one plain
 * line — and `journal.test.ts` iterates the closed set and fails on any such fallback, so the
 * honest degradation cannot become a silent hole. The same holds for domains and for record types,
 * which come from `RECORD_STORES` for the same reason.
 *
 * MEASURED 2026-07-31: 26 kinds across 6 domains. The step text said 23 across five and the
 * grounding brief said 25 across six; both are prose, and neither is what the tree holds. Nothing
 * in this file depends on the number.
 *
 * ## WHAT THIS SURFACE IS NOT ALLOWED TO CLAIM
 *
 * The chain is TAMPER-EVIDENCE, and that is a smaller thing than it sounds like beside a tick and
 * the word "verified" — see {@link WHAT_THE_CHECK_CAN_AND_CANNOT_DO}, which is exported so the
 * screen must render it. Nothing here says anything about regimes, certification, regulation or
 * how protected the coach's information is, and `journal.test.ts` sweeps this module's own
 * exported strings for that vocabulary — with a planted positive in the same run, because a scan
 * whose whole output is an absence proves nothing until it is shown able to speak.
 *
 * ## A TRUNCATED HEAD IS HOUSEKEEPING, NOT DAMAGE
 *
 * `core/journal/retention.js` prunes the oldest entries irrecoverably by design and records what it
 * discarded. A reader that called that corruption would tell the coach his records had been
 * interfered with when nothing whatever had happened — see {@link OLDEST_ENTRIES_WERE_DROPPED}.
 */

import { DOMAIN, JOURNAL_KINDS, KIND_SPECS, KINDS } from '../../core/journal/kinds.js';
import { RECORD_STORES } from '../../core/store/schema.js';

// ═══════════════════════════════════════════════════════════════════════════════
// The shapes, exported so the source and the seam import them rather than redeclaring them
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * One entry, field for field as `core/journal/entry.js` writes it.
 *
 * The core is plain ECMAScript typed in documentation comments and is consumed here UNCHANGED, so
 * the shape it needs is stated where it is used. There is no `detail`, no `reason` and no payload:
 * the field set is closed, which is what stops a note's text ever reaching this screen.
 */
export interface JournalEntry {
  readonly entry_id: string;
  readonly seq: number;
  readonly device: string;
  readonly kind: string;
  /** The DEVICE CLOCK, which can be wrong. Order comes from the chain, never from this. */
  readonly at: string;
  /** An opaque identity and a type. Never a name, never content. See the header. */
  readonly subject: { readonly type: string; readonly record_id: string } | null;
  readonly affected_count: number | null;
  readonly previous_hash: string | null;
  readonly hash?: string;
}

/**
 * The seven ways one device's chain can fail to verify, as `core/journal/chain.js` names them.
 *
 * Declared HERE rather than imported, so this words-only module does not drag `chain.js` and its
 * digest machinery into the screen bundle. That leaves two closed sets that must agree, which is
 * exactly the drift this build has been bitten by before — so `journal.test.ts` asserts this list
 * equals the core's `DIVERGENCE` values, in both directions, on every run.
 */
export type DivergenceReason =
  | 'not_an_entry'
  | 'altered'
  | 'broken_link'
  | 'sequence_gap'
  | 'device_mismatch'
  | 'head_not_anchored'
  | 'unknown_kind';

/** Where a chain first diverged, field for field as `verifyChain` reports it. */
export interface Divergence {
  readonly index: number;
  readonly seq: number | null;
  readonly entry_id: string | null;
  /** One of {@link DIVERGENCE_REASONS}. Typed loosely so an unknown reason is worded, not thrown. */
  readonly reason: string;
  /** The core's own explanation. Kept, but never the only thing said. */
  readonly detail: string;
}

/** One device's chain, verified. The shape `verifyChain` returns, per device. */
export interface DeviceVerification {
  readonly device: string;
  readonly checked: number;
  readonly ok: boolean;
  /** Retention discarded the entries before the oldest one held. HOUSEKEEPING, never damage. */
  readonly truncated_head: boolean;
  readonly first_divergence: Divergence | null;
  /**
   * How many entries that device's chain holds, from enumeration. Optional because a caller may not
   * have enumerated; present, it is what makes {@link VerificationWords.checkedWords} a total rather
   * than a number with nothing to compare against.
   */
  readonly entries?: number;
  /** False when the chain was longer than the read ceiling, so `checked` is a FLOOR, not a total. */
  readonly complete?: boolean;
}

/**
 * WHICH HALF of the read failed. A closed set, declared here for the same reason
 * {@link DivergenceReason} is: this module must have a sentence for every member, and the set it
 * words and the set the source tags must be the same one. `journal-source.ts` imports it from here.
 */
export type JournalReadStage = 'entries' | 'check';

/**
 * A read that was attempted and FAILED, in the least the screen can be specific with.
 *
 * There is NO MESSAGE FIELD, and its absence is the design. An exception message is the one string in
 * this application whose contents nobody controls — a store error can quote the key or the row it
 * choked on, and in this log a key is an identity and a row can hold what somebody wrote down. This
 * shape cannot carry either, so nothing that reaches these words can leak one.
 */
export interface JournalReadFailure {
  readonly stage: JournalReadStage;
  /** The CLASS of what was thrown. A class name comes from code, never from a record. */
  readonly errorName: string;
}

/**
 * Everything the screen is handed. The source builds it; this module words it.
 *
 * THE LAST THREE FIELDS ARE REQUIRED, AND THAT IS THE POINT OF THEM. A reading assembled without
 * them once carried the page alone, and this module then said how many entries were on screen with
 * nothing to say how many there were — which is the "this is all there is" claim `journal-source.ts`
 * pays a whole-log walk to make impossible. Optional fields would have let the next caller drop them
 * again, silently, and the screen would have gone on looking right.
 */
export interface JournalReading {
  readonly entries: readonly JournalEntry[];
  readonly verification: readonly DeviceVerification[];
  /** False when the page stopped short of the end, so any count on screen is a floor. */
  readonly done: boolean;
  /** How many entries in the WHOLE log match the filter — never how many this page holds. */
  readonly total: number;
  /** False when more devices exist than the enumeration ceiling listed, so `total` is a floor. */
  readonly complete: boolean;
  /** False when the survey stopped short of the devices, so what was checked is a floor. */
  readonly verificationComplete: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// The standing sentences
// ═══════════════════════════════════════════════════════════════════════════════

/** The screen's own title, one constant, so the link into it and the screen cannot disagree. */
export const JOURNAL_TITLE = 'What this app has done';

/**
 * WHAT THE CHECK CAN AND CANNOT DO, in one sentence a non-technical person reads without help.
 *
 * Exported so the screen must render it, and worded so that a tick beside the word "checked"
 * cannot be read as a promise. The chain lives in a database on a device the coach controls;
 * anyone who can write that database can rewrite the list from any point and recompute it forward,
 * and the check would then say the list is intact — because it would be. What it genuinely catches
 * is an accidental change, a partial or careless edit, and a copy altered somewhere other than the
 * device that wrote it. `core/journal/chain.js` says the same thing to a reader of the code; this
 * says it to the coach.
 */
export const WHAT_THE_CHECK_CAN_AND_CANNOT_DO =
  'This app can tell you when this list has been changed after it was written, but it cannot stop '
  + 'somebody changing it, and anyone who can get into this device can rewrite the whole list '
  + 'without this check knowing.';

/**
 * Why the app cannot say who or what an entry was about. Stated as the protection working.
 *
 * The wording follows `NO_NAME_IS_DELIBERATE` in `removals.ts` deliberately: the same fact is
 * being explained on two screens and the coach should meet one explanation, not two.
 */
export const WHY_THERE_IS_NO_NAME =
  'This list keeps no names, only an opaque reference, so removing somebody leaves no name behind '
  + 'in the record of them being removed.';

/** What a truncated head means, and it means nothing is wrong. */
export const OLDEST_ENTRIES_WERE_DROPPED =
  'The oldest entries were dropped to make room — this app tidying up after itself. Nothing has '
  + 'gone wrong.';

/**
 * WHAT A SHORT READ MEANS, and why these three sentences exist at all.
 *
 * The seam carries three facts that say the numbers on this screen are a FLOOR rather than a total:
 * the device listing stopping at its ceiling, the survey stopping at the same one, and one device's
 * chain being longer than the read. Each of them makes a count smaller than the truth — so a screen
 * that held the fact and said nothing would be reporting the smaller number as the whole, which is
 * the one claim this surface exists to be unable to make. The facts were reaching the screen and
 * being drawn as bare figures with no sentence; these are the sentences.
 */
export const NOT_EVERY_DEVICE_WAS_LISTED =
  'Not all of your devices are listed, so the numbers on this screen are a minimum.';

/** The same ceiling, on the checking rather than on the listing. */
export const NOT_EVERY_DEVICE_WAS_CHECKED =
  'Some devices were not checked; the result below covers only the devices listed.';

/** One device whose chain was longer than the read. What was checked is a floor, not a total. */
export const NOT_EVERY_ENTRY_WAS_CHECKED =
  'Only the newest entries on this device were checked.';

/** What is said about a kind this app has no words for yet. It says what is known and invents nothing. */
export const UNWORDED_KIND =
  'This app has no plain description for this event yet. See the reference below.';

/** What is said about a record type this app has no words for yet. */
export const UNWORDED_RECORD_TYPE = 'one record';

/**
 * THE EXIT FROM THE DEAD END.
 *
 * If this screen tells the coach his list has been interfered with, it must also tell him what to
 * do, and there is no support desk and no document he can act on alone. The only exit that exists
 * in the world is the person who set the application up for him, so that is what is named — the
 * same exit `removals.ts` names, for the same reason.
 */
export const WHO_TO_ASK =
  'Tell whoever set this app up for you, including the device name and position below, and do not '
  + 'delete anything.';

/** What to do when the chain checks out. Nothing, and saying so plainly is the point. */
export const NOTHING_TO_DO = 'Nothing to do here.';

// ═══════════════════════════════════════════════════════════════════════════════
// WHEN THE APP COULD NOT LOOK AT ALL  (s17/r2's F1)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * THE SENTENCE FOR A READ THAT FAILED, AND THE TWO THINGS IT MUST NOT SAY.
 *
 * `screens/journal-source.ts` used to swallow a rejected read and publish nothing, so the seam stayed
 * at its empty value — and the empty value is worded HERE, as {@link JournalReport.intro} saying
 * there is nothing here yet and as a verification headline saying the app has not checked its list
 * yet. Both are FACTS ABOUT THE LOG. Said after a failed read they are the reassuring answer arrived
 * at by never having looked, on the one screen that exists so the coach can check this app's account
 * of itself. So the failed read gets its OWN sentence, and it says the app TRIED AND COULD NOT.
 *
 * IT ALSO DOES NOT SAY THE LIST IS BROKEN. A read that failed is not evidence of tampering — it is
 * this app unable to look — and telling him his records had been interfered with on the strength of
 * a failed read is the same overclaim in the opposite direction. It says it cannot say either way,
 * which is the only thing that is true.
 */
export const COULD_NOT_READ_THE_LIST =
  'This app tried to read its own list on this device and could not.';

/**
 * What is NOT being claimed, said out loud, because the coach will assume the worse of the two.
 *
 * The failure is in the reading, and this app has looked at nothing: it has found no damage and it
 * has found no absence. Saying so is what stops the sentence above reading as bad news about his
 * information rather than as bad news about this screen.
 */
export const A_FAILED_READ_IS_NOT_A_VERDICT =
  'This does not mean anything has been lost or changed.';

/** WHICH HALF failed, one sentence each, from the closed set the source tags a failure with. */
export const READ_STAGE_WORDS: Readonly<Record<string, string>> = Object.freeze({
  entries: 'What went wrong was reading the entries out of this device.',
  check: 'What went wrong was the check on whether the entries join up.',
});

/** What is said when the stage is one this screen has no words for. It invents nothing. */
export const UNWORDED_READ_STAGE =
  'This app could not tell which part of the reading failed. See the reference below.';

/**
 * THE EXIT FROM A FAILED READ, and it is the same person the rest of this screen names.
 *
 * Not {@link WHO_TO_ASK}: that one tells him not to carry on as though nothing happened, which is
 * right when the list does not join up and is an accusation when the app simply could not read it.
 */
export const WHO_TO_ASK_ABOUT_A_FAILED_READ =
  'Try again, then tell whoever set this app up for you and read them the reference below.';

// ═══════════════════════════════════════════════════════════════════════════════
// The vocabulary, worded — the SET from the core, the WORDS from here
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Plain language for each kind. Keyed by the core's own constants; the set is not written down here.
 *
 * THE KEYS ARE `JOURNAL_KINDS` AND NEVER STRING LITERALS. There is exactly one minter of a kind in
 * this repository — `core/journal/kinds.js` — and an interface file that spelled one out would be
 * originating a second copy of it. The gate in `divergence-picker.test.ts` enforces that, and it
 * caught this file writing them out by hand.
 *
 * "What happened, in his words": `record.deleted` is not "record deleted", it is closer to "a
 * record was removed". Every sentence is meant to be readable by somebody with no glossary, and
 * read aloud down a phone without sounding like a fault.
 */
const KIND_PHRASING: Readonly<Record<string, string>> = Object.freeze({
  [JOURNAL_KINDS.UNLOCKED]: 'You unlocked your information on this device.',
  [JOURNAL_KINDS.UNLOCK_REFUSED]:
    'Somebody tried to unlock your information on this device and it did not open.',
  [JOURNAL_KINDS.LOCKED]: 'Your information was locked again on this device.',
  [JOURNAL_KINDS.ACCOUNT_CONNECTED]: 'You gave this app permission to use your Google account.',
  [JOURNAL_KINDS.ACCOUNT_DISCONNECTED]:
    'This app stopped using your Google account, because you signed out or took the permission away.',

  [JOURNAL_KINDS.RECORD_CREATED]: 'Something new was written down.',
  [JOURNAL_KINDS.RECORD_UPDATED]: 'Something already written down was changed.',
  [JOURNAL_KINDS.RECORD_DELETED]:
    'A record was removed, leaving only a marker where it used to be.',
  [JOURNAL_KINDS.RECORD_PURGED]:
    'Everything belonging to a client you removed was taken off this device for good.',
  [JOURNAL_KINDS.RECORD_IMPORTED]:
    'Records arrived from a backup, or from another of your devices, and were added in.',

  [JOURNAL_KINDS.EXPORT_STARTED]:
    'You started taking a copy of some of your information out of this app.',
  [JOURNAL_KINDS.EXPORT_COMPLETED]: 'A copy of some of your information left this app.',
  [JOURNAL_KINDS.EXPORT_REFUSED]:
    'A copy you asked for did not leave this app, either from an error or because you stopped it.',

  [JOURNAL_KINDS.SYNC_STARTED]: 'This app began sending and fetching your changes.',
  [JOURNAL_KINDS.SYNC_COMPLETED]: 'This app finished sending everything it had waiting to go.',
  [JOURNAL_KINDS.SYNC_REFUSED]:
    'This app stopped part way through sending your changes, and what was waiting is still waiting.',
  [JOURNAL_KINDS.SYNC_CONFLICT_RESOLVED]:
    'The same record had been changed on two of your devices, and one of the two was kept.',

  [JOURNAL_KINDS.KEY_ESTABLISHED]: 'This device set up the way your private notes are locked.',
  [JOURNAL_KINDS.KEY_SLOT_ADDED]:
    'A new way into your private notes was added - another device, a passphrase or a recovery sheet.',
  [JOURNAL_KINDS.KEY_SLOT_REMOVED]: 'One of the ways into your private notes was taken away.',
  [JOURNAL_KINDS.RECOVERY_USED]: 'Your recovery sheet was used to get back into your private notes.',
  [JOURNAL_KINDS.RECOVERY_REFUSED]:
    'Somebody tried a recovery sheet and it did not open your private notes.',
  [JOURNAL_KINDS.ESTABLISH_REFUSED]:
    'This device would not set up a new lock for your notes because it could not yet confirm one '
    + 'did not already exist.',
  [JOURNAL_KINDS.DUPLICATE_ENVELOPE_DETECTED]:
    'This device found more than one lock for your notes, so it left them all alone rather than '
    + 'guessing which one is yours.',
  [JOURNAL_KINDS.DUPLICATE_RECOVERY_DETECTED]:
    'This device found more than one recovery sheet, so it left them all alone rather than guessing '
    + 'which one is yours.',

  [JOURNAL_KINDS.RETENTION_PRUNED]:
    'This list reached the number of entries it keeps, so the oldest ones were dropped to make room.',
});

/** A plain heading for each domain, keyed by the core's own constants for the same reason. */
const DOMAIN_PHRASING: Readonly<Record<string, string>> = Object.freeze({
  [DOMAIN.AUTHENTICATION]: 'Getting into this app',
  [DOMAIN.RECORD_CHANGE]: 'Changes to what you have written down',
  [DOMAIN.EXPORT]: 'Copies taken out of this app',
  [DOMAIN.SYNCHRONISATION]: 'Keeping your devices in step',
  [DOMAIN.KEY_AND_RECOVERY]: 'Locks and recovery',
  [DOMAIN.JOURNAL]: 'This list looking after itself',
});

/** A plain heading for a domain this app has no words for yet. */
export const UNWORDED_DOMAIN = 'Other activity';

/**
 * Every kind the core defines, worded. BUILT FROM THE CORE'S SET at load, never from a list here.
 *
 * A kind added to `core/journal/kinds.js` with no phrase above appears here reading
 * {@link UNWORDED_KIND} rather than being absent, so the screen still draws it; `journal.test.ts`
 * iterates {@link KINDS} and fails on any entry that reads that way.
 */
export const KIND_WORDS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(KINDS.map((kind) => [kind, KIND_PHRASING[kind] ?? UNWORDED_KIND])),
);

/** The domains the core actually uses, in the order its kinds declare them. */
export const DOMAINS: readonly string[] = Object.freeze(
  [...new Set(KINDS.map((kind) => KIND_SPECS[kind].domain))],
);

/** Every domain the core uses, worded, built from the core's own set for the same reason. */
export const DOMAIN_WORDS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(DOMAINS.map((domain) => [domain, DOMAIN_PHRASING[domain] ?? UNWORDED_DOMAIN])),
);

/**
 * Plain language for the kind of record an entry names — the TYPE only, never a lookup.
 *
 * Worded as a countable thing ("one client record") because that is all that can honestly be said:
 * the entry holds a type and an opaque identity, and this module deliberately never asks the store
 * whether that identity still exists. See the header.
 */
const RECORD_TYPE_PHRASING: Readonly<Record<string, string>> = Object.freeze({
  client: 'one client',
  session: 'one session',
  'session-note': 'one note from a session',
  'performed-record': 'one set of work recorded in a session',
  reading: 'one measurement',
  routine: 'one routine',
  exercise: 'one exercise',
  'intensity-pattern': 'one intensity pattern',
  'diet-plan': 'one diet plan',
});

/** Every record type the store defines, worded, from the store's own map rather than a copy. */
export const RECORD_TYPE_WORDS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.keys(RECORD_STORES).map(
      (type) => [type, RECORD_TYPE_PHRASING[type] ?? UNWORDED_RECORD_TYPE],
    ),
  ),
);

// ═══════════════════════════════════════════════════════════════════════════════
// One entry, worded
// ═══════════════════════════════════════════════════════════════════════════════

/** One entry as the screen draws it. Words, references and counts — nothing to style and nothing to call. */
export interface EntryWords {
  readonly entryId: string;
  readonly seq: number;
  readonly device: string;
  /** The core's own kind name, kept literal because it is what somebody helping him will search for. */
  readonly kind: string;
  /** The heading this entry belongs under. */
  readonly heading: string;
  /** What happened, in plain words. */
  readonly what: string;
  /** True when the vocabulary defines this kind. False means the entry came from somewhere else. */
  readonly known: boolean;
  /** What KIND of record it was about, worded from the type alone. Null when it was about none. */
  readonly about: string | null;
  /** The opaque reference, for somebody helping him. Null when the entry names no record. */
  readonly reference: string | null;
  /** Why there is no name. Present exactly when there is a subject, because that is when it is asked. */
  readonly whyNoName: string | null;
  /** How many records it covered, said out loud. Null when the entry counted nothing. */
  readonly howMany: string | null;
  /** The device clock, literal. The instant is the evidence, and it is not dressed up as trusted. */
  readonly at: string;
}

/** How many records one entry covered, in words. Null is the honest answer when nothing was counted. */
function howManyWords(count: number | null | undefined): string | null {
  if (typeof count !== 'number' || !Number.isFinite(count)) return null;
  return count === 1 ? 'covering 1 record' : `covering ${count} records`;
}

/**
 * One entry, worded.
 *
 * NOTHING IS LOOKED UP. The subject is worded from its type and the identity is passed through
 * untouched, which is what makes this safe to draw for a record that is live, tombstoned or gone.
 */
export function describeEntry(entry: JournalEntry): EntryWords {
  const spec = Object.hasOwn(KIND_SPECS, entry.kind) ? KIND_SPECS[entry.kind] : undefined;
  const subject = entry.subject ?? null;

  return {
    entryId: entry.entry_id,
    seq: entry.seq,
    device: entry.device,
    kind: entry.kind,
    heading: spec === undefined ? UNWORDED_DOMAIN : (DOMAIN_WORDS[spec.domain] ?? UNWORDED_DOMAIN),
    what: KIND_WORDS[entry.kind] ?? UNWORDED_KIND,
    known: spec !== undefined,
    about: subject === null
      ? null
      : (RECORD_TYPE_WORDS[subject.type] ?? UNWORDED_RECORD_TYPE),
    reference: subject === null ? null : subject.record_id,
    whyNoName: subject === null ? null : WHY_THERE_IS_NO_NAME,
    howMany: howManyWords(entry.affected_count),
    at: entry.at,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// The verification result, in words
// ═══════════════════════════════════════════════════════════════════════════════

/** The seven reasons, as a value, so the wording table and the tests can walk them. */
export const DIVERGENCE_REASONS: readonly DivergenceReason[] = Object.freeze([
  'not_an_entry',
  'altered',
  'broken_link',
  'sequence_gap',
  'device_mismatch',
  'head_not_anchored',
  'unknown_kind',
]);

/**
 * WHAT WENT WRONG, one sentence per reason, in words he could act on or read down a phone.
 *
 * Each reason gets its own sentence rather than a shared "something is wrong", because the core
 * has already worked out WHICH of the seven it was, and throwing that away would waste the one
 * thing that makes the next question answerable.
 */
export const DIVERGENCE_WORDS: Readonly<Record<DivergenceReason, string>> = Object.freeze({
  not_an_entry:
    'Something in this list is not an entry at all — something other than this app wrote into it.',
  altered:
    'One entry no longer matches its own record of itself, so something in it was changed after it '
    + 'was written.',
  broken_link:
    'One entry does not join up to the one before it — something between the two was taken out, '
    + 'swapped, or slipped in.',
  sequence_gap:
    'Some entries are missing from the numbered sequence between these two.',
  device_mismatch:
    'An entry written on a different device has turned up in this device\'s own list.',
  head_not_anchored:
    'The oldest entry here does not join up to what this app recorded before it — something older '
    + 'was removed by something other than this app tidying up.',
  unknown_kind:
    'One entry describes something this app has never had a name for, so it was not written by '
    + 'this app.',
});

/** One device's chain, worded. */
export interface VerificationWords {
  readonly device: string;
  /** True when nothing was found wrong. Truncation does NOT make this false. */
  readonly intact: boolean;
  /** The headline sentence for this device, in both states. */
  readonly headline: string;
  /** How many entries were actually checked, said out loud — against how many there are when known. */
  readonly checkedWords: string;
  /** Why that number is a floor rather than a total. Null when everything this device holds was checked. */
  readonly notEverythingChecked: string | null;
  /** Where it went wrong: the position and the entry. Null when nothing did. */
  readonly whereWords: string | null;
  /** What went wrong, one of the seven. Null when nothing did. */
  readonly whatWentWrong: string | null;
  /** The core's own explanation, kept verbatim beside our words. Null when nothing went wrong. */
  readonly detail: string | null;
  /** The reason code, literal, because it is what somebody helping him will search for. */
  readonly reason: string | null;
  /** The entry's own reference, for the same purpose. Null when there is none to give. */
  readonly entryReference: string | null;
  /** Retention housekeeping, said as housekeeping. Null when the head was not truncated. */
  readonly housekeeping: string | null;
  /** What to do. The named person when it is broken, and plainly nothing when it is not. */
  readonly whatToDo: string;
}

/**
 * How many entries were checked, in words — AGAINST how many the device holds when that is known.
 *
 * "12 entries checked" beside a device holding forty is a true sentence that reads as a total. Where
 * the survey says it stopped short, or the enumeration counted more entries than were checked, the
 * two numbers are said together so the figure cannot be read as the whole chain.
 */
function checkedWords(result: DeviceVerification): string {
  const { checked } = result;
  if (partiallyChecked(result) && typeof result.entries === 'number') {
    return `${checked} of ${result.entries} entries checked.`;
  }
  return checked === 1 ? '1 entry checked.' : `${checked} entries checked.`;
}

/** Was this device's chain checked all the way, or only as far as the read reached? */
function partiallyChecked(result: DeviceVerification): boolean {
  return result.complete === false
    || (typeof result.entries === 'number' && result.entries > result.checked);
}

/**
 * Where the chain first went wrong, in words he can repeat.
 *
 * The POSITION is said as a place in the list rather than as an index, and the sequence number is
 * given as well when there is one, because those are two different handles on the same entry and
 * whoever helps him will want whichever he can find.
 */
function whereWords(divergence: Divergence): string {
  const position = `This is at position ${divergence.index + 1} in the list for this device`;
  const seq = typeof divergence.seq === 'number'
    ? `, which this app numbered ${divergence.seq}`
    : '';
  return `${position}${seq}.`;
}

/**
 * One device's chain, worded.
 *
 * A TRUNCATED HEAD IS NOT A BREAK. `core/journal/retention.js` drops the oldest entries by design
 * and irrecoverably, so the surviving oldest entry joins up to something that is gone. It is
 * reported as its own fact and worded as tidying up; treating it as damage would tell the coach
 * his records had been interfered with when nothing at all had happened.
 */
export function describeVerification(result: DeviceVerification): VerificationWords {
  const divergence = result.first_divergence ?? null;
  const intact = result.ok && divergence === null;
  const housekeeping = result.truncated_head ? OLDEST_ENTRIES_WERE_DROPPED : null;
  // A SHORT READ IS NOT A CLEAN ONE. Said in both states: unchecked entries on a device whose checked
  // ones joined up is exactly where "it all joins up" would be the reassuring answer arrived at by
  // not having looked far enough.
  const notEverythingChecked = partiallyChecked(result) ? NOT_EVERY_ENTRY_WAS_CHECKED : null;

  if (intact) {
    return {
      device: result.device,
      intact: true,
      headline: notEverythingChecked === null
        ? `Everything this app recorded on ${result.device} joins up.`
        : `Everything this app checked on ${result.device} joins up; it did not check the whole list.`,
      checkedWords: checkedWords(result),
      notEverythingChecked,
      whereWords: null,
      whatWentWrong: null,
      detail: null,
      reason: null,
      entryReference: null,
      housekeeping,
      whatToDo: NOTHING_TO_DO,
    };
  }

  const reason = divergence === null ? null : divergence.reason;
  const known = reason !== null
    && Object.hasOwn(DIVERGENCE_WORDS, reason as DivergenceReason);

  return {
    device: result.device,
    intact: false,
    headline:
      `The list this app recorded on ${result.device} does not join up.`,
    checkedWords: checkedWords(result),
    notEverythingChecked,
    whereWords: divergence === null ? null : whereWords(divergence),
    // A missing or unrecognised reason still gets a sentence rather than a blank: the core computed
    // one of seven, and anything else means this screen is older than the core it is reading.
    whatWentWrong: divergence === null
      ? 'This app could not say where the list stops joining up.'
      : (known
        ? DIVERGENCE_WORDS[reason as DivergenceReason]
        : 'This app has no plain words for what went wrong with this entry. See the reference below.'),
    detail: divergence === null ? null : divergence.detail,
    reason,
    entryReference: divergence === null ? null : divergence.entry_id,
    housekeeping,
    whatToDo: WHO_TO_ASK,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// The screen
// ═══════════════════════════════════════════════════════════════════════════════

/** Everything the screen says. */
export interface JournalReport {
  readonly title: string;
  /** The standing sentence about what the check is worth, present in every state, never reworded. */
  readonly whatTheCheckIsWorth: string;
  /** How many entries this page holds. */
  readonly count: number;
  /** How many match across the WHOLE log, which is a different number and the one he is owed. */
  readonly total: number;
  /**
   * The two numbers in one sentence, and it NEVER claims a total it cannot stand behind.
   *
   * `screens/journal-source.ts` walks the whole log to measure {@link total} for this sentence alone:
   * the store carries no index, so a filtered page can be short or empty while hundreds of matching
   * entries sit further down the chains. Where the walk itself was bounded — more devices than the
   * listing reached — the sentence says the figure is a floor rather than dressing it up as a count.
   */
  readonly countWords: string;
  /** True when the page stopped short, so the count above is a floor rather than a total. */
  readonly more: boolean;
  readonly moreWords: string | null;
  /** Why the figures are a floor: devices this app did not reach. Null when it reached them all. */
  readonly everyDeviceListed: string | null;
  /** Why the check is partial: devices it did not check. Null when it checked them all. */
  readonly everyDeviceChecked: string | null;
  readonly intro: string;
  /** True when every device's chain joins up. A truncated head does not make this false. */
  readonly intact: boolean;
  /** Said once, above the devices, in both states. */
  readonly verificationHeadline: string;
  readonly devices: readonly VerificationWords[];
  readonly entries: readonly EntryWords[];
  /** The exit. Present exactly when something is broken, because that is when there is one to take. */
  readonly whatToDo: string | null;
}

/**
 * WHAT IS ON SCREEN AGAINST WHAT THERE IS, and the one sentence that may not overstate.
 *
 * Three states, and the third is why this is a function rather than a template. When the listing was
 * complete the total is a total and is said as one. When it was NOT — more devices than the ceiling
 * reached — the same number is a floor, and "showing 25 of 400" would then be a smaller lie than the
 * bare page but a lie all the same: there are at least 400, and this app does not know how many more.
 */
function countWords(count: number, total: number, complete: boolean): string {
  if (!complete) {
    return `Showing ${count}. There are at least ${total} in the part of the list this app read, and `
      + 'it did not read all of it.';
  }
  if (count >= total) {
    return count === 1 ? 'Showing the only entry there is.' : `Showing all ${total} of them.`;
  }
  return `Showing ${count} of ${total}.`;
}

/** How many devices were found to have a break, in words. */
function brokenWords(broken: number, total: number): string {
  if (broken === 1 && total === 1) {
    return 'This app checked its own list on this device; it does not join up.';
  }
  return broken === 1
    ? 'This app checked its own list on each device; on one of them it does not join up.'
    : `This app checked its own list on each device; on ${broken} of them it does not join up.`;
}

/** Everything the screen says when the read FAILED. A different report, because it is a different state. */
export interface JournalFailureReport {
  readonly title: string;
  /** The standing sentence about what the check is worth, said in this state too and never reworded. */
  readonly whatTheCheckIsWorth: string;
  /** The app tried and could not. The one sentence this state exists to make sayable. */
  readonly headline: string;
  /** Which half of the read it was. */
  readonly whatFailed: string;
  /** What this does NOT mean, because he will assume the worse of the two. */
  readonly notAVerdict: string;
  /** What to do about it: try again, then the person who set this up. */
  readonly whatToDo: string;
  /** The stage tag, literal, because it is what somebody helping him will search for. */
  readonly stage: string;
  /** The class of what was thrown, literal, for the same reader and the same reason. */
  readonly errorName: string;
}

/**
 * A FAILED READ, WORDED.
 *
 * Deliberately NOT a variant of {@link describeJournal}: that function words a log, and after a
 * failed read there is no log to word. Every sentence it produces — the intro, the verification
 * headline, the counts — is a statement about what is in the list, and this app has not been able to
 * look at the list. A report that shared them would be one flag away from saying both things at once.
 */
export function describeFailedJournalRead(failure: JournalReadFailure): JournalFailureReport {
  return {
    title: JOURNAL_TITLE,
    whatTheCheckIsWorth: WHAT_THE_CHECK_CAN_AND_CANNOT_DO,
    headline: COULD_NOT_READ_THE_LIST,
    whatFailed: READ_STAGE_WORDS[failure.stage] ?? UNWORDED_READ_STAGE,
    notAVerdict: A_FAILED_READ_IS_NOT_A_VERDICT,
    whatToDo: WHO_TO_ASK_ABOUT_A_FAILED_READ,
    stage: failure.stage,
    errorName: failure.errorName,
  };
}

/**
 * Everything the screen says, from the reading the source handed over.
 *
 * An empty list is a NORMAL state on a device that has only just been set up, and it is worded like
 * one. A screen that read as a fault when there was nothing to show would teach him to ignore it,
 * which would cost him the one time it was not empty.
 */
export function describeJournal(reading: JournalReading): JournalReport {
  const entries = reading.entries.map(describeEntry);
  const devices = reading.verification.map(describeVerification);
  const broken = devices.filter((device) => !device.intact).length;
  const intact = broken === 0;

  return {
    title: JOURNAL_TITLE,
    whatTheCheckIsWorth: WHAT_THE_CHECK_CAN_AND_CANNOT_DO,
    count: entries.length,
    total: reading.total,
    countWords: countWords(entries.length, reading.total, reading.complete),
    everyDeviceListed: reading.complete ? null : NOT_EVERY_DEVICE_WAS_LISTED,
    everyDeviceChecked: reading.verificationComplete ? null : NOT_EVERY_DEVICE_WAS_CHECKED,
    more: !reading.done,
    moreWords: reading.done
      ? null
      : 'More entries exist, newest shown first.',
    intro: entries.length === 0
      ? 'There is nothing here yet.'
      : 'What this app has done, newest first.',
    intact,
    // AND THE HEADLINE IS QUALIFIED WHEN THE SURVEY WAS SHORT. "Every entry joins up" over a survey
    // that stopped at the device ceiling is a claim about devices nobody looked at.
    verificationHeadline: devices.length === 0
      ? 'This app has not checked its own list yet.'
      : (intact
        ? (reading.verificationComplete
          ? 'This app checked its own list; every entry joins up.'
          : 'On every device checked, the list joins up; not every device was checked.')
        : brokenWords(broken, devices.length)),
    devices,
    entries,
    whatToDo: intact ? null : WHO_TO_ASK,
  };
}
