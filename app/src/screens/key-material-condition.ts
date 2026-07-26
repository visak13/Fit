/**
 * WHAT THE KEY-MATERIAL CONDITION SCREEN SAYS — the whole derivation, and none of the drawing.
 *
 * ## The ruling this file exists to hold
 *
 * The coach's Google account can end up holding TWO of something that may only ever exist once. The
 * core detects it, carries BOTH candidates out of the failure, and refuses to choose
 * (`core/crypto/guard.js`, `MultipleKeyObjectsFound`). This screen SHOWS BOTH CANDIDATES, CHANGES
 * NOTHING, AND TELLS HIM TO GET HELP. That is a user ruling of 2026-07-26 and it is the whole design,
 * not a first cut.
 *
 * There is deliberately NO way to discard a candidate here — no pick, no delete, no cleanup, and
 * nothing disabled behind a flag waiting to be switched on. Discarding the wrong one makes every
 * clinical note encrypted under it PERMANENTLY UNREADABLE, and the person who would be pressing that
 * button is a non-technical coach at the worst moment he will ever have with this application:
 * mid-recovery of a wiped device, with no second device left to check against. Nothing in this file
 * or in `KeyMaterialConditionScreen.tsx` writes, deletes or chooses, and
 * `key-material-condition.test.ts` asserts that rather than trusting it — including by walking the
 * report for anything callable, because the affordance a later helpful hand adds is a button, and a
 * button needs a function to reach.
 *
 * ## The copy is the deliverable, and the human exit is the part that is easy to lose
 *
 * Read-only correctly prevents the data loss. On its own it also leaves the coach with NO EXIT OF HIS
 * OWN: there is no support desk for this application, no vendor, no manual, and nothing he can act on
 * alone. The only help that exists is THE PERSON WHO SET IT UP FOR HIM. So {@link WHO_TO_ASK} names
 * that person as the next step, in those terms, and says plainly that the application cannot sort
 * this out itself.
 *
 * That is why the copy lives in this module rather than in the markup. A sentence buried in a `.tsx`
 * is a sentence only a human reading the file would notice going missing; here every one of the four
 * standing sentences is a constant a test holds, so the human exit cannot be quietly softened into a
 * reassuring-sounding line about the app looking into it.
 *
 * ## Built as a FAMILY, and what that does and does not mean
 *
 * `core/crypto/errors.js` carries SIX conditions of one shape: a stable `code`, a ready-made
 * `userMessage` written for the coach, and whatever facts a screen needs. Two of them are the
 * duplicates built here. The other four — a device that has never connected, a slot addition raced by
 * another device, an unreadable envelope, and no usable slot — fire only on paths that talk to the
 * real remote, so they belong to the Google step. **They are NOT built, NOT imported and NOT stubbed
 * here, and there is no dead branch waiting for them.**
 *
 * What this file leaves them is a DESTINATION: a condition is selected by its `code` (and, where the
 * code covers more than one subject, its `role`), so the Google step extends {@link MEMBERS} with an
 * entry rather than inventing a second, differently-worded surface for the same subject. A code with
 * no member is REFUSED loudly by {@link describeCondition} — see the note there — because the failure
 * that must never happen is a condition reaching the coach worded by nobody.
 *
 * The shape cost close to nothing: one lookup and one refusal. Had it cost real complexity the
 * instruction was to keep the duplicates simple and say so, and that judgement is recorded here
 * rather than left to be inferred.
 *
 * ## Why the core's own `userMessage` is carried but not what he reads — MEASURED, not preferred
 *
 * `MultipleKeyObjectsFound` builds ONE message for BOTH roles, and it opens "more than one set of
 * encryption details". For the RECOVERY KEY that sentence names the wrong object. Rendering the
 * ready-made message here would therefore tell a coach staring at two recovery keys that he has two
 * sets of encryption details — true of the other condition, and confusing at the one moment
 * confusion is most expensive. So each member words its own `whatHappened`, the core's message is
 * carried through the seam unchanged for whoever is helping him, and
 * `key-material-condition.test.ts` proves the mismatch against the real throw so this paragraph
 * cannot quietly become false. Correcting it belongs to the core and is reported upward, not patched
 * from a screen.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// What the core can hand over
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * One candidate's metadata, exactly as `core/remote/port.js` describes a remote file and no more.
 *
 * Mirrors the fields this screen reads, field for field and name for name. The core is plain
 * ECMAScript typed in documentation comments and is consumed here UNCHANGED — see `tsconfig.json` —
 * so the shape it needs is stated where it is used rather than the core being converted to satisfy
 * this file. Nothing is renamed: a screen reading a renamed copy is a screen that drifts from the
 * thing it is showing, and here the thing it is showing is the evidence somebody will read out.
 */
export interface RemoteFileMeta {
  /** Opaque identifier. The ONLY reliable way to address a file, and the only thing that tells two apart. */
  readonly file_id: string;
  readonly space: string;
  /** The name it was created under. NOT unique — which is the whole reason this screen exists. */
  readonly name: string;
  readonly revision: number;
  readonly modified_at: string;
  readonly size: number;
}

/**
 * A key-material condition as the core threw it: a `CryptoError` from `core/crypto/errors.js`.
 *
 * The fields are the error's own. `code` and `userMessage` are on every one of the six; `role` and
 * `found` are what `MultipleKeyObjectsFound` adds, and `found` is the entire reason a screen can
 * exist — the core deliberately carried both candidates out of the failure so that a person could
 * look at them.
 */
export interface KeyMaterialCondition {
  /** Stable and machine-readable. Never localised or reworded. Selects the member. */
  readonly code: string;
  /** The ready-made message the core wrote for the coach. Carried through unchanged. */
  readonly userMessage: string;
  /** Which object, where the code covers more than one. Absent on codes that cover a single subject. */
  readonly role?: string;
  /** Every candidate the core found. Empty for a condition that has no candidates to show. */
  readonly found: readonly RemoteFileMeta[];
}

/**
 * The `code` of every condition this screen has a member for TODAY.
 *
 * Read off `core/crypto/errors.js`, where it is the stable machine-readable identifier each failure
 * class carries. `key-material-condition.test.ts` drives the real failure and asserts this string is
 * what actually arrives, so a code renamed in the core fails here rather than falling through to the
 * refusal at run time on the coach's device.
 */
export const KEY_MATERIAL_CODES = Object.freeze({
  /** More than one key object of the same role exists and the application will not choose. */
  MULTIPLE_KEY_OBJECTS: 'multiple_key_objects',
});

/**
 * The two subjects `MultipleKeyObjectsFound` distinguishes, spelled exactly as the core throws them.
 *
 * These are prose strings rather than exported constants because the core passes them as literals at
 * the two throw sites. They are declared here ONCE and pinned by a test that reads them off a real
 * throw rather than off this file — which is stronger than trusting a shared constant would be,
 * since a reworded literal in the core fails the assertion instead of silently selecting no member.
 */
export const DUPLICATE_ROLES = Object.freeze({
  ENVELOPE: 'key envelope',
  RECOVERY: 'recovery key',
});

// ═══════════════════════════════════════════════════════════════════════════════
// The four sentences the screen must never stop saying
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * That the application has changed nothing, and will not.
 *
 * First, because it is the sentence that lets him stop panicking and read the rest. It is a promise
 * about behaviour, and the read-only assertions in this module's suite are what make it true rather
 * than merely written.
 */
export const NOTHING_WAS_CHANGED =
  'Nothing has been changed. This app has not deleted anything, has not chosen between them, '
  + 'and will not.';

/**
 * That he must not tidy this up himself.
 *
 * The instinct on seeing two of something is to remove one, and it is the single action that turns a
 * recoverable state into an unrecoverable one. Said as what he stands to lose, not as a rule.
 */
export const DO_NOT_DELETE =
  'Do not delete either of them yourself, and do not ask anyone else to. If the wrong one goes, the '
  + 'client notes it protects can never be opened again, and nothing can undo that.';

/**
 * That he should stop rather than carry on.
 *
 * Bounded on purpose: the rest of the application is unaffected and telling him to put the whole
 * thing down would be an overstatement he would rightly ignore. What must not continue is adding
 * clinical material he could later be unable to read.
 */
export const DO_NOT_CONTINUE =
  'Stop here for now. Do not add or change any client medical notes until this has been sorted out. '
  + 'The rest of the app — sessions, routines, diets — is unaffected and safe to keep using.';

/**
 * WHO TO ASK, and it is the reason this screen is not a dead end.
 *
 * The read-only ruling means the application will not resolve this, so the screen must hand him a
 * real next step or it has stopped him with nowhere to go. There is no support desk, no company and
 * no manual behind this application; the only help that exists is the person who set it up for him.
 * Naming that person is what makes the read-only choice honest instead of a wall.
 *
 * It also says, plainly, that the app cannot do this itself. An implied "we are looking into it"
 * would be a reassurance nothing behind the screen can deliver.
 */
export const WHO_TO_ASK =
  'Ask the person who set this app up for you. They are who to go to — there is no help desk, no '
  + 'company and no manual behind this app, and the app cannot sort this out on its own. Show them '
  + 'this screen: everything they need is on it.';

/** The four, in the order they are said, so the screen cannot reorder them into a different meaning. */
export const STANDING_SENTENCES: readonly string[] = Object.freeze([
  NOTHING_WAS_CHANGED,
  DO_NOT_DELETE,
  DO_NOT_CONTINUE,
  WHO_TO_ASK,
]);

/** The screen's own title, one constant, so the link into it and the screen itself cannot disagree. */
export const KEY_MATERIAL_TITLE = 'Your encryption details';

// ═══════════════════════════════════════════════════════════════════════════════
// The family
// ═══════════════════════════════════════════════════════════════════════════════

/** One member of the condition family: everything that is true of this condition and no other. */
interface Member {
  /** What the card is headed. */
  readonly title: string;
  /** What happened, in his terms. Worded here rather than taken from the core — see the file note. */
  readonly whatHappened: string;
  /** What it costs him if it is left, worded as the thing he would notice. */
  readonly whatItMeans: string;
  /**
   * True for the condition that gives no warning until it is too late to fix.
   *
   * Carried as data rather than drawn as a colour so that a test can hold it: the severity of the
   * recovery-key case is a claim about the world, and a claim a colour makes is a claim nothing
   * checks.
   */
  readonly moreDangerous: boolean;
  /** Said only by the more dangerous member. Null on the other, rather than an empty string. */
  readonly dangerNote: string | null;
  /** What one candidate is called, singular, for the heading above each one. */
  readonly candidateNoun: string;
}

/**
 * Every condition this screen words today, keyed the way {@link memberKey} composes it.
 *
 * TWO ENTRIES, and that is the honest state of the build: these are the two the core can reach
 * without the Google step. The four in `core/crypto/errors.js` that talk to the real remote get an
 * entry here when that step wires them, and nothing else about this screen has to change.
 */
const MEMBERS: Readonly<Record<string, Member>> = Object.freeze({
  [`${KEY_MATERIAL_CODES.MULTIPLE_KEY_OBJECTS}:${DUPLICATE_ROLES.ENVELOPE}`]: Object.freeze({
    title: 'There are two sets of encryption details',
    whatHappened:
      'Your Google account is holding two sets of encryption details for this app, where there '
      + 'should only ever be one. This usually happens when two devices were set up within moments '
      + 'of each other and neither could see what the other had just done. Nobody did anything '
      + 'wrong, and it is not a sign that anything has been broken into.',
    whatItMeans:
      'Each set unlocks a different part of your client medical notes. You will notice it as a note '
      + 'that opens on one device and refuses to open on the other. Both sets are still here and '
      + 'nothing has been lost.',
    moreDangerous: false,
    dangerNote: null,
    candidateNoun: 'Set of encryption details',
  }),

  [`${KEY_MATERIAL_CODES.MULTIPLE_KEY_OBJECTS}:${DUPLICATE_ROLES.RECOVERY}`]: Object.freeze({
    title: 'There are two recovery keys',
    whatHappened:
      'Your Google account is holding two recovery keys for this app, where there should only ever '
      + 'be one. As with the encryption details, this happens when two devices set themselves up '
      + 'within moments of each other. Nobody did anything wrong.',
    whatItMeans:
      'A recovery key is what gets your client medical notes back when a phone is lost, replaced or '
      + 'wiped. With two of them, it is no longer certain which one would work on the day you need '
      + 'it.',
    // The reason this member exists as its own entry rather than sharing the envelope's words. The
    // two conditions are the same shape and NOT the same danger, and the difference is entirely
    // about WHEN it shows itself.
    moreDangerous: true,
    dangerNote:
      'This is the more serious of the two, and it is the one that gives no warning. Everything '
      + 'will look completely normal for as long as your devices keep working. It only shows itself '
      + 'on the day you set this app up again on a new or wiped phone — the one day there is no '
      + 'other device left to check against, and the day you most need it to work. That is why it '
      + 'is worth sorting out now, while everything is still fine.',
    candidateNoun: 'Recovery key',
  }),
});

/** How a condition selects its member: the code, plus the role where the code covers more than one. */
export function memberKey(condition: KeyMaterialCondition): string {
  const role = condition.role;
  return role === undefined || role === '' ? condition.code : `${condition.code}:${role}`;
}

/** Every member this screen words today. Exported so a test can hold the family to its own list. */
export const MEMBER_KEYS: readonly string[] = Object.freeze(Object.keys(MEMBERS));

// ═══════════════════════════════════════════════════════════════════════════════
// What the screen draws
// ═══════════════════════════════════════════════════════════════════════════════

/** A label and its value. Same primitive the admin screen uses; `literal` is drawn as `<code>`. */
export interface Fact {
  readonly label: string;
  readonly literal: boolean;
  readonly value: string;
}

/** One candidate, as the person helping him would need to read it out. */
export interface CandidateReport {
  /** `Recovery key 1 of 2`. Its position is part of its identity when neither has a name. */
  readonly heading: string;
  /** Only what the core actually handed over. No field here is inferred or invented. */
  readonly facts: readonly Fact[];
}

/** Everything the screen says when a condition is present. */
export interface ConditionReport {
  /** Which member wrote this. Kept so a test asserts the member rather than the words it produced. */
  readonly memberKey: string;
  readonly title: string;
  /** The one figure the screen is for: how many were found where one was expected. */
  readonly count: number;
  /** The sentence that gives that figure its scale. */
  readonly countMeans: string;
  readonly whatHappened: string;
  readonly whatItMeans: string;
  readonly moreDangerous: boolean;
  readonly dangerNote: string | null;
  readonly nothingWasChanged: string;
  readonly doNotDelete: string;
  readonly doNotContinue: string;
  readonly whoToAsk: string;
  readonly candidates: readonly CandidateReport[];
  /**
   * The core's own ready-made message, carried through UNCHANGED for whoever is helping him.
   *
   * Folded rather than permanent, and deliberately not the sentence he reads first — see the note at
   * the top of this file for the measured reason.
   */
  readonly asTheAppPutIt: string;
}

/** What the screen says when there is nothing wrong, which is almost every time it is opened. */
export interface SettledReport {
  readonly title: string;
  readonly count: number;
  readonly countMeans: string;
  readonly intro: string;
  readonly settled: true;
}

/**
 * The normal state, worded as one.
 *
 * This screen is permanently reachable from Admin and will be empty on every visit but the one that
 * matters, so an empty state that read as a fault would teach him to stop opening it — which would
 * cost him exactly the visit it exists for.
 */
export function describeSettled(): SettledReport {
  return {
    title: KEY_MATERIAL_TITLE,
    count: 1,
    countMeans:
      'One set of encryption details, which is how it should be. Your devices agree on how your '
      + 'client medical notes are locked.',
    intro:
      'There is nothing to sort out. If this app ever finds more than one set, it will not choose '
      + 'between them or delete anything — it will show you both here and tell you who to ask.',
    settled: true,
  };
}

/** What the Admin screen says about this condition, and the words on the way in. */
export interface AdminEntry {
  readonly title: string;
  /** The chip: how many were found where one was expected. */
  readonly count: number;
  readonly intro: string;
  /** The words on the link. Never "fix" or "resolve": the link leads to a screen that does neither. */
  readonly linkLabel: string;
  readonly settled: boolean;
}

/**
 * The permanent way in, worded for both states.
 *
 * PERMANENT, not conditional on there being something to show. A link that appears only when it has
 * something to say is a link nobody can find when they go looking, and it would leave the screen it
 * leads to unreachable for the whole of the time it is empty — which is almost always. The count is
 * on the chip, so an empty state is answered without leaving Admin.
 */
export function describeAdminEntry(condition: KeyMaterialCondition | null): AdminEntry {
  if (condition === null) {
    return {
      title: KEY_MATERIAL_TITLE,
      count: 1,
      intro:
        'One set of encryption details, which is how it should be. If this app ever finds more than '
        + 'one, it will show you both here rather than choosing between them.',
      linkLabel: 'Check for yourself',
      settled: true,
    };
  }

  return {
    title: KEY_MATERIAL_TITLE,
    count: condition.found.length,
    intro:
      'This app has found more than one where there should only ever be one. Nothing has been '
      + 'changed. Read this before adding any more client medical notes.',
    // Deliberately not "Fix this" or "Sort it out": the screen behind this link does neither, and a
    // link whose words promise more than the screen delivers is the reassurance this ruling forbids.
    linkLabel: 'See what was found',
    settled: false,
  };
}

/** What one candidate says. Only the facts the core handed over, named in his terms where they have one. */
function describeCandidate(meta: RemoteFileMeta, index: number, total: number, noun: string): CandidateReport {
  return {
    heading: `${noun} ${index + 1} of ${total}`,
    facts: [
      // The identifier first: it is the only thing that actually tells the two apart, and it is what
      // the person helping him will ask for.
      { label: 'Identifier', literal: true, value: meta.file_id },
      { label: 'Last changed', literal: true, value: meta.modified_at },
      { label: 'Times changed', literal: false, value: String(meta.revision) },
      { label: 'Stored as', literal: true, value: meta.name },
      { label: 'Size', literal: false, value: `${meta.size} bytes` },
    ],
  };
}

/**
 * Everything the screen says about one condition.
 *
 * @throws Error when no member words this condition. That is deliberate and it is the point of the
 * family: the four conditions in `core/crypto/errors.js` that the Google step will wire have no
 * member here yet, and a screen that improvised something for them would put words in front of the
 * coach that nobody chose — at the one moment he is least able to judge them. Failing here is loud,
 * happens in that step's own suite long before any device, and is fixed by adding an entry to
 * `MEMBERS` rather than by editing this function.
 */
export function describeCondition(condition: KeyMaterialCondition): ConditionReport {
  const key = memberKey(condition);
  const member = MEMBERS[key];

  if (member === undefined) {
    throw new Error(
      `no member of the key-material condition family words "${key}". The condition reached the `
      + 'screen with a ready-made message on it, but the screen has no title, no explanation of what '
      + 'it means for the coach, and no wording for the candidates — so it would be showing him a '
      + 'condition nobody worded. Add an entry to MEMBERS in key-material-condition.ts.',
    );
  }

  const found = condition.found;
  const count = found.length;

  return {
    memberKey: key,
    title: member.title,
    count,
    countMeans: `${count} were found where there should only ever be one.`,
    whatHappened: member.whatHappened,
    whatItMeans: member.whatItMeans,
    moreDangerous: member.moreDangerous,
    dangerNote: member.dangerNote,
    nothingWasChanged: NOTHING_WAS_CHANGED,
    doNotDelete: DO_NOT_DELETE,
    doNotContinue: DO_NOT_CONTINUE,
    whoToAsk: WHO_TO_ASK,
    candidates: found.map((meta, index) => describeCandidate(meta, index, count, member.candidateNoun)),
    asTheAppPutIt: condition.userMessage,
  };
}
