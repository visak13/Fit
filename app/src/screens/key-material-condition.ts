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
 * ## Built as a FAMILY, and the family is now COMPLETE
 *
 * `core/crypto/errors.js` carries SIX conditions of one shape: a stable `code`, a ready-made
 * `userMessage` written for the coach, and whatever facts a screen needs. Two of them are the
 * duplicates. The other four — `not_connected_yet`, `slot_addition_raced`, `envelope_unreadable` and
 * `no_usable_slot` — fire only on paths that talk to the real remote, and they were left UNBUILT here
 * with a DESTINATION rather than a dead branch: a condition selects its member by `code` (and, where
 * the code covers more than one subject, by `role`), so the step that reached them extends
 * {@link MEMBERS} with an entry rather than inventing a second, differently-worded surface.
 *
 * **That step is done, and this file is what it produced.** All four are now members. Nothing about
 * the seam, the screen or the selection changed to admit them, which is what the shape was for; what
 * DID have to change is described under "what a candidate-less condition needed" below. The sixth,
 * `invalid_request`, is deliberately NOT a member: `core/crypto/errors.js` says of it "Never a remote
 * condition" — it is the application asking for something it should not have, which is a fault to fix
 * rather than a state to explain to a coach, and giving it a screen would tell him to act on a bug.
 *
 * Every member is driven from a REAL THROW in `key-material-condition.test.ts` — the condition is
 * provoked through `establishKeyMaterial` against the in-memory double and the object the core really
 * threw is what the assertions read. A mapping table asserting that a code produces a message would
 * prove the table, not the reachability, and reachability is the half that has failed before here.
 *
 * A code with no member is still REFUSED loudly by {@link describeCondition} — see the note there —
 * because the failure that must never happen is a condition reaching the coach worded by nobody.
 *
 * ## What a candidate-less condition needed, and why it is not a second screen
 *
 * The first two members are both "more than one of something was found", so the report was shaped
 * around that: a count, a sentence giving the count its scale, a list of candidates, and a warning not
 * to delete either of them. FOUR of the six conditions have no candidates at all. Left alone, the
 * shape would have told a coach whose device simply had not connected yet that "0 were found where
 * there should only ever be one" — a defect report about the wrong thing, at the moment he is already
 * alarmed.
 *
 * So the count, the candidate list, the do-not-delete warning and the stop-here warning are each
 * NULLABLE and each decided by the member, and the screen renders what is present. The two duplicate
 * members word every one of them exactly as they did before — `key-material-condition.test.ts` holds
 * their whole output against a literal snapshot of the wording taken before this change, so an
 * extension that quietly reworded the two conditions this surface was BUILT for would go red.
 *
 * ## EVERY CONDITION OFFERS AN EXIT, and where there is none it says so
 *
 * A dead end with an exit that exists is the rule this screen already followed for the duplicates:
 * {@link WHO_TO_ASK} names the person who set the app up, because read-only means the application
 * will not resolve it. The four new conditions are NOT all like that, and pretending they were would
 * be its own kind of lie:
 *
 * - `not_connected_yet` and `slot_addition_raced` have a real step the coach can take alone —
 *   connect once, or wait and do it again — and `core/crypto/errors.js` names it in its own message.
 *   Sending him to another person for those would waste somebody's afternoon on a five-second fix.
 * - `envelope_unreadable` has NO step of his own, and {@link Member.noExitOfHisOwn} says that plainly
 *   rather than offering one that does not help. Offering an action that cannot work is how a surface
 *   earns the reputation of lying, and this one is read at the worst moment he will ever have.
 * - `no_usable_slot` has one real step — sign in again — AND a plain statement of what to do if it
 *   does not work, because the state it fires in is not always recoverable by signing in.
 *
 * The invariant is asserted rather than intended: every member offers a step of his own or names a
 * human to go to, and a member with neither must say so in {@link Member.noExitOfHisOwn}.
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
  /**
   * Every candidate the core found.
   *
   * OPTIONAL, and read off the real errors rather than assumed: only `MultipleKeyObjectsFound` carries
   * a `found` array. The other four arrive with the property genuinely ABSENT, not empty — so this is
   * declared optional and normalised once, in {@link describeCondition}. Declaring it required and
   * relying on callers to pass `[]` would be this file describing a shape the core does not have.
   */
  readonly found?: readonly RemoteFileMeta[];
}

/**
 * The `code` of every condition this screen has a member for.
 *
 * Read off `core/crypto/errors.js`, where it is the stable machine-readable identifier each failure
 * class carries. `key-material-condition.test.ts` drives the real failure and asserts this string is
 * what actually arrives, so a code renamed in the core fails here rather than falling through to the
 * refusal at run time on the coach's device.
 *
 * FIVE of the core's six. `invalid_request` is absent deliberately — see the file note.
 */
export const KEY_MATERIAL_CODES = Object.freeze({
  /** More than one key object of the same role exists and the application will not choose. */
  MULTIPLE_KEY_OBJECTS: 'multiple_key_objects',
  /** A device that has never reached the hidden space, refusing to create a second key. */
  NOT_CONNECTED_YET: 'not_connected_yet',
  /** Another device changed the envelope between our read and our write. */
  SLOT_ADDITION_RACED: 'slot_addition_raced',
  /** The envelope document could not be understood at all. */
  ENVELOPE_UNREADABLE: 'envelope_unreadable',
  /** No slot on the envelope could open the data key on this device. */
  NO_USABLE_SLOT: 'no_usable_slot',
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
   *
   * It stays TRUE OF EXACTLY ONE MEMBER. The four conditions added when the real remote was wired all
   * announce themselves the moment they happen — a device that will not save a note, a sign-in that no
   * longer opens anything — so none of them is the silent one, and marking a second would spend the
   * words that have to work on the one that gives no warning at all.
   */
  readonly moreDangerous: boolean;
  /** Said only by the more dangerous member. Null on the other, rather than an empty string. */
  readonly dangerNote: string | null;
  /**
   * What one candidate is called, singular, for the heading above each one.
   *
   * NULL for a condition that has no candidates, and that null is what turns off the count, the
   * count sentence and the whole "what was found" section. Four of the six conditions carry nothing to
   * show, and a screen that headed them with a figure of zero would be reporting a different defect.
   */
  readonly candidateNoun: string | null;
  /**
   * That the application has changed nothing, IN TERMS TRUE OF THIS CONDITION.
   *
   * Every member says it, because it is true of every one of them — the core refuses before it acts,
   * on all six. It is per-member rather than one constant because {@link NOTHING_WAS_CHANGED} says
   * "has not chosen between them", which names candidates that four of the conditions do not have.
   */
  readonly nothingWasChanged: string;
  /**
   * Not to delete anything, and what it would cost. NULL where there is nothing he would be tempted
   * to delete — a warning about deleting is wasted on a device that has simply not connected yet, and
   * a screen that warns about everything is a screen that is read for nothing.
   */
  readonly doNotDelete: string | null;
  /**
   * To stop rather than carry on, and until when. NULL where nothing needs to stop: a slot addition
   * raced by another device clears itself on the next attempt, and telling him to down tools over it
   * would be an overstatement he would rightly learn to ignore.
   */
  readonly doNotContinue: string | null;
  /**
   * THE EXIT: what he can do himself, in the order he would do it. Empty where nothing he can do alone
   * would help — and then {@link noExitOfHisOwn} must say so plainly.
   */
  readonly whatHeCanDo: readonly string[];
  /**
   * Said when there is no step of his own, so the absence is stated rather than left as silence.
   * Null when {@link whatHeCanDo} is not empty.
   */
  readonly noExitOfHisOwn: string | null;
  /**
   * Who to turn to when the application will not resolve this. NULL only where he genuinely resolves
   * it himself and sending him to another person would waste somebody's afternoon.
   */
  readonly whoToAsk: string | null;
  /** What the Admin screen says on the way in, worded for this condition rather than for a count. */
  readonly adminIntro: string;
  /**
   * The WORD on the Admin chip, for a condition with no figure to put there.
   *
   * NULL on the counted conditions, whose chip carries how many were found — that figure is the whole
   * point of their entry. A candidate-less condition has no number, and a blank chip reads as a
   * surface that failed to load rather than as a state, so it gets a word instead.
   */
  readonly adminChipWord: string | null;
}

/**
 * Every condition this screen words, keyed the way {@link memberKey} composes it.
 *
 * SIX ENTRIES for the five codes `core/crypto/errors.js` can reach on a real-remote path — the
 * duplicate code has two, one per role, because one message for both roles names the wrong object for
 * one of them. Every one of the six is driven from a real throw in `key-material-condition.test.ts`;
 * a member nobody provokes is copy nobody has read.
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
    nothingWasChanged: NOTHING_WAS_CHANGED,
    doNotDelete: DO_NOT_DELETE,
    doNotContinue: DO_NOT_CONTINUE,
    // Nothing he can do alone, by the user ruling of 2026-07-26 — and the exit is the named person
    // rather than a statement of helplessness, so `noExitOfHisOwn` stays null and WHO_TO_ASK carries
    // it. That is the wording this screen was built around and it is not restated here.
    whatHeCanDo: [],
    noExitOfHisOwn: null,
    whoToAsk: WHO_TO_ASK,
    adminIntro:
      'This app has found more than one where there should only ever be one. Nothing has been '
      + 'changed. Read this before adding any more client medical notes.',
    adminChipWord: null,
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
    nothingWasChanged: NOTHING_WAS_CHANGED,
    doNotDelete: DO_NOT_DELETE,
    doNotContinue: DO_NOT_CONTINUE,
    whatHeCanDo: [],
    noExitOfHisOwn: null,
    whoToAsk: WHO_TO_ASK,
    adminIntro:
      'This app has found more than one where there should only ever be one. Nothing has been '
      + 'changed. Read this before adding any more client medical notes.',
    adminChipWord: null,
  }),

  // ───────────────────────────────────────────────────────────────────────────────
  // The four that only fire once the app is really talking to the coach's Google account
  // ───────────────────────────────────────────────────────────────────────────────

  /**
   * THE REFUSAL, and the refusal is the feature.
   *
   * A device that has never reached the hidden space cannot know whether a key already exists, so it
   * will not make one. The helpful alternative — generate a key so he is never blocked — is precisely
   * how the silent split happens, and `core/crypto/guard.js` refuses BEFORE it even lists. So this
   * member's job is to make a refusal read as a deliberate, bounded decision rather than as the app
   * being broken: what is refused is one clinical note until the device connects once, and that is
   * said in the same breath as the refusal itself.
   */
  [KEY_MATERIAL_CODES.NOT_CONNECTED_YET]: Object.freeze({
    title: 'This device has not connected yet',
    whatHappened:
      'This device has never connected to your Google account, so it cannot see how your other '
      + 'devices lock your client medical notes. Rather than making up a second set of encryption '
      + 'details of its own, it has stopped and is telling you. That is deliberate: a second set '
      + 'would leave you with notes on one device that the other could not open.',
    whatItMeans:
      'You cannot add or change client medical notes on this device until it has connected once. '
      + 'Everything else in the app — sessions, routines, diets — works normally, and nothing you '
      + 'have already entered on any device is affected.',
    moreDangerous: false,
    dangerNote: null,
    candidateNoun: null,
    nothingWasChanged:
      'Nothing has been changed. This device has not made a second set of encryption details, and '
      + 'it will not.',
    doNotDelete: null,
    doNotContinue:
      'Until it has connected, do not rely on this device for client medical notes. The rest of the '
      + 'app is unaffected and safe to keep using.',
    whatHeCanDo: [
      'Take this device somewhere with a working internet connection.',
      'Open this app and sign in to your Google account once.',
      'After that, client medical notes work on this device as they do on your other one.',
    ],
    noExitOfHisOwn: null,
    // He resolves this himself in under a minute; sending him to another person for it would spend
    // somebody's afternoon on a sign-in. The named person is the fallback, not the first step.
    whoToAsk:
      'If it still will not connect after signing in, ask the person who set this app up for you.',
    adminIntro:
      'This device has not connected to your Google account yet, so it cannot add client medical '
      + 'notes. Everything else works normally.',
    adminChipWord: 'Not connected',
  }),

  /**
   * A CLASH, and the only one of the six that clears itself.
   *
   * Two devices changed the envelope at the same moment. The store offers no conditional write, so
   * this is detection after the fact — but a detected clash is never resolved silently, and nothing
   * was written. The right words here are the OPPOSITE of the duplicates': this one is ordinary, it
   * costs him nothing, and doing the same thing again in a moment really does fix it. Telling him to
   * stop and find help over it would teach him that this screen overstates, which is exactly what
   * would make him ignore it on the day it does not.
   */
  [KEY_MATERIAL_CODES.SLOT_ADDITION_RACED]: Object.freeze({
    title: 'Two of your devices changed things at the same moment',
    whatHappened:
      'Another of your devices changed your encryption details at the very moment this one was '
      + 'doing the same. Rather than write over the other device and lose what it did, this device '
      + 'stopped without saving anything.',
    whatItMeans:
      'Nothing was saved on this device just now, and nothing was lost on the other one. This is an '
      + 'ordinary clash between two devices in use at once, not a sign that anything is wrong.',
    moreDangerous: false,
    dangerNote: null,
    candidateNoun: null,
    nothingWasChanged:
      'Nothing has been changed. This device saved nothing, and it did not write over the other '
      + 'device.',
    doNotDelete: null,
    // Nothing needs to stop. Saying so would be the overstatement that teaches him to ignore the
    // screen on the day it is reporting the split key.
    doNotContinue: null,
    whatHeCanDo: [
      'Wait a few seconds, then do the same thing again.',
      'If it keeps happening, close this app on your other device and then do it once more here.',
    ],
    noExitOfHisOwn: null,
    whoToAsk:
      'If it happens every single time, ask the person who set this app up for you.',
    adminIntro:
      'Two of your devices changed your encryption details at the same moment, so this device saved '
      + 'nothing. Doing it again usually settles it.',
    adminChipWord: 'Clashed',
  }),

  /**
   * THE ONE WITH NO STEP OF HIS OWN, and the member where saying so is the whole job.
   *
   * The envelope cannot be understood at all. Everything he might reach for — deleting it, setting the
   * app up again, signing in somewhere else — either does nothing or destroys the only thing that
   * could still open his notes. So `whatHeCanDo` is EMPTY and {@link Member.noExitOfHisOwn} states the
   * absence outright. An invented step here would be an action that cannot work, offered at the worst
   * moment he will ever have with this application.
   */
  [KEY_MATERIAL_CODES.ENVELOPE_UNREADABLE]: Object.freeze({
    title: 'Your encryption details cannot be read',
    whatHappened:
      'The encryption details stored in your Google account could not be understood by this app. '
      + 'That can happen if the file was damaged, or if it was written by a newer version of this '
      + 'app than the one on this device.',
    whatItMeans:
      'Your client medical notes have not been changed and have not been lost, but they cannot be '
      + 'opened until this is sorted out. Everything else in the app — sessions, routines, diets — '
      + 'is unaffected.',
    moreDangerous: false,
    dangerNote: null,
    candidateNoun: null,
    nothingWasChanged:
      'Nothing has been changed. This app has not altered the file it could not read, and will not.',
    doNotDelete:
      'Do not delete anything from your Google account, and do not ask anyone else to. If that file '
      + 'goes, the client notes it protects can never be opened again, and nothing can undo that.',
    doNotContinue: DO_NOT_CONTINUE,
    whatHeCanDo: [],
    noExitOfHisOwn:
      'There is nothing you can safely do about this one on your own. Deleting the file, or setting '
      + 'this app up from scratch, would not mend it and would make the notes permanently '
      + 'unreadable. This one needs somebody who can look at the file itself.',
    whoToAsk: WHO_TO_ASK,
    adminIntro:
      'The encryption details in your Google account could not be read. Your client medical notes '
      + 'are not lost, but they cannot be opened until this is sorted out.',
    adminChipWord: 'Unreadable',
  }),

  /**
   * THE VANISHED DEVICE SLOT, and the member that must not over-promise.
   *
   * `core/crypto/errors.js` names signing in as the way back, and that is the right first step — the
   * usual cause is a browser clearing out its storage, and the recovery material in the account
   * really does let this device back in. But the failure also fires where there is no recovery
   * material left to use, and signing in cannot help then. So the step is offered AND what to do if it
   * does not work is offered beside it, in that order. A single step stated as certain would be a
   * promise this screen cannot keep, and the cost of him "fixing" it himself afterwards is every note.
   */
  [KEY_MATERIAL_CODES.NO_USABLE_SLOT]: Object.freeze({
    title: 'This device can no longer open your notes',
    whatHappened:
      'The encryption details this device had saved for itself are gone. That happens if the app was '
      + 'removed from the home screen, or if the browser cleared out its storage on its own after the '
      + 'app had not been opened for a while. Nobody did anything wrong.',
    whatItMeans:
      'This device cannot open your client medical notes by itself any more. The notes are safe and '
      + 'are still in your Google account — it is this device\'s own way in that has gone.',
    moreDangerous: false,
    dangerNote: null,
    candidateNoun: null,
    nothingWasChanged:
      'Nothing has been changed. Your client medical notes are exactly as you left them, and this '
      + 'app has not altered or removed anything.',
    doNotDelete:
      'Do not remove this app and set it up again from scratch, and do not delete anything from your '
      + 'Google account. That would take away the last thing that could get this device back in, and '
      + 'the notes it protects could never be opened again.',
    doNotContinue: DO_NOT_CONTINUE,
    whatHeCanDo: [
      'Sign in to your Google account in this app again. That is how this device is given a new way '
      + 'in to your notes.',
      'If your notes still will not open after signing in, stop there and ask for help rather than '
      + 'setting the app up again.',
    ],
    noExitOfHisOwn: null,
    whoToAsk: WHO_TO_ASK,
    adminIntro:
      'This device has lost the encryption details it had saved for itself, so it cannot open your '
      + 'client medical notes on its own. The notes themselves are safe.',
    adminChipWord: 'No way in',
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
  /**
   * The one figure the screen is for: how many were found where one was expected.
   *
   * NULL for a condition that found nothing — there is no figure to give, and a zero here would head
   * the screen with a defect report about the wrong thing.
   */
  readonly count: number | null;
  /** The sentence that gives that figure its scale. Null exactly when {@link count} is. */
  readonly countMeans: string | null;
  readonly whatHappened: string;
  readonly whatItMeans: string;
  readonly moreDangerous: boolean;
  readonly dangerNote: string | null;
  readonly nothingWasChanged: string;
  /** Null where there is nothing he could be tempted to delete. */
  readonly doNotDelete: string | null;
  /** Null where nothing needs to stop — see the raced-slot member for why that matters. */
  readonly doNotContinue: string | null;
  /** Null only where he genuinely resolves this himself. */
  readonly whoToAsk: string | null;
  /**
   * THE EXIT: the steps he can take alone, in order. Empty when nothing he can do would help, and
   * then {@link noExitOfHisOwn} says so.
   */
  readonly whatHeCanDo: readonly string[];
  /** Said instead of steps, when there are none of his own. Null when {@link whatHeCanDo} has any. */
  readonly noExitOfHisOwn: string | null;
  /** Empty for a condition that carries no candidates. */
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
  /**
   * How many were found where one was expected. NULL for a condition that has no figure — see
   * {@link chip}, which is what the surface actually draws.
   */
  readonly count: number | null;
  /**
   * What the chip carries, always a non-empty string.
   *
   * The count where there is one, a word where there is not. The chip is a state indicator and an
   * empty one reads as a card that failed to load rather than as a card with nothing to report.
   */
  readonly chip: string;
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
      chip: '1',
      intro:
        'One set of encryption details, which is how it should be. If this app ever finds more than '
        + 'one, it will show you both here rather than choosing between them.',
      linkLabel: 'Check for yourself',
      settled: true,
    };
  }

  // The same lookup and the same refusal as the screen's, on purpose: a condition the family cannot
  // word must not slip past as a plausible-looking Admin card while the screen behind it throws.
  const member = requireMember(condition);
  const counted = member.candidateNoun !== null;
  const count = counted ? candidatesOf(condition).length : null;

  return {
    title: KEY_MATERIAL_TITLE,
    count,
    chip: count === null ? (member.adminChipWord ?? '') : String(count),
    intro: member.adminIntro,
    // Deliberately not "Fix this" or "Sort it out": the screen behind this link does neither, and a
    // link whose words promise more than the screen delivers is the reassurance this ruling forbids.
    // "See what was found" is only true where something WAS found, so a condition with no candidates
    // says what it can honestly say instead.
    linkLabel: counted ? 'See what was found' : 'Read what this means',
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
  const member = requireMember(condition);

  // NULL rather than zero when this condition carries no candidates. The count and its sentence are
  // the duplicates' headline — "2 were found where there should only ever be one" — and the same
  // sentence with a zero in it would tell a coach whose device has merely not connected yet that
  // nothing was found where one was expected, which is a different and much worse story.
  const noun = member.candidateNoun;
  const found = noun === null ? [] : candidatesOf(condition);
  const count = noun === null ? null : found.length;

  return {
    memberKey: key,
    title: member.title,
    count,
    countMeans: count === null ? null : `${count} were found where there should only ever be one.`,
    whatHappened: member.whatHappened,
    whatItMeans: member.whatItMeans,
    moreDangerous: member.moreDangerous,
    dangerNote: member.dangerNote,
    nothingWasChanged: member.nothingWasChanged,
    doNotDelete: member.doNotDelete,
    doNotContinue: member.doNotContinue,
    whoToAsk: member.whoToAsk,
    whatHeCanDo: member.whatHeCanDo,
    noExitOfHisOwn: member.noExitOfHisOwn,
    candidates: noun === null
      ? []
      : found.map((meta, index) => describeCandidate(meta, index, found.length, noun)),
    asTheAppPutIt: condition.userMessage,
  };
}

/**
 * The member for this condition, or the loud refusal.
 *
 * One function, used by the screen AND by the Admin entry, so the two cannot disagree about whether a
 * condition is wordable. An Admin card that rendered for a condition the screen would throw on is a
 * link into a crash, which is worse than the refusal it was trying to avoid.
 */
function requireMember(condition: KeyMaterialCondition): Member {
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
  return member;
}

/**
 * The candidates the core carried out of the failure, for a condition that has any.
 *
 * `found` is absent — not empty — on the four conditions that carry none, because only
 * `MultipleKeyObjectsFound` sets it. Normalised in ONE place so no caller has to remember.
 */
function candidatesOf(condition: KeyMaterialCondition): readonly RemoteFileMeta[] {
  return condition.found ?? [];
}
