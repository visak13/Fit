/**
 * WHAT TO EXPECT, WHAT IS TRUE ABOUT THE ENCRYPTION, AND THE HANDOVER CHECKLIST.
 *
 * Words and decisions only. No React, no screen, no route — `setup.ts` answers "how do I get the
 * two things the app needs", and this file answers the other two questions a setup has to answer:
 * what the coach should expect from the app afterwards, and what this application does NOT claim.
 * A separate file deliberately, because they are separate subjects and were built in parallel.
 *
 * ## THE SENTENCES HERE ARE NOT REASSURANCE, AND THAT IS THE POINT
 *
 * A reader looking for comfort will not find it below. The security wording states the cost of the
 * design — anyone who can sign in to the coach's Google account can read the encrypted notes — and
 * says plainly that nothing here has been audited or certified. That is the intended outcome rather
 * than a failure of the copy: he is deciding whether to put client medical detail into this app,
 * and a decision made on softened words is one he did not really make.
 *
 * Every rule below is stated WITH ITS CONSEQUENCE, in his terms. A rule with no consequence is one
 * he weighs against convenience and loses — "do not delete the icon" is an instruction, "deleting
 * the icon takes your data with it" is a reason.
 *
 * ## THE ALGORITHM NAMES ARE READ OUT OF THE CODE, NOT CHOSEN HERE
 *
 * {@link ALGORITHM_FACTS} names what `core/crypto/primitives.js` ACTUALLY calls. The suite asserts
 * each name against that source rather than against this prose, so a change to the cryptography
 * that is not reflected here goes red instead of leaving the coach holding a sentence about an
 * algorithm the application stopped using. Nothing here may name what merely sounds right.
 *
 * ## WHERE A SENTENCE SENDS HIM SOMEWHERE
 *
 * Exactly one does — {@link WHERE_TO_CHECK_THE_ENCRYPTION_DETAILS} — and it composes the
 * destination's OWN title constant rather than restating it, so the sentence and the card cannot
 * drift apart. It names the CARD rather than a direction on the screen: ordering belongs to the
 * screen, and "further down" rots silently the first time that screen is reordered.
 *
 * The Setup surface itself is deliberately NOT named anywhere here. It is drawn by a parallel
 * action and does not exist while this file is being written; a sentence promising a place that
 * does not render is the defect this build has already paid for once.
 *
 *     npm run test:shell
 */

import { KEY_MATERIAL_TITLE } from './key-material-condition';

// ═══════════════════════════════════════════════════════════════════════════════
// One — what to expect
// ═══════════════════════════════════════════════════════════════════════════════

/** One thing the coach should expect, and what it costs him if he does not. */
export interface Expectation {
  /** Stable identity, so a screen can order or address one without matching on its words. */
  readonly id: string;
  /** What the card is headed. */
  readonly title: string;
  /** The fact, stated plainly and without softening. */
  readonly says: string;
  /**
   * WHAT HAPPENS IF IT IS IGNORED, in something he would notice.
   *
   * Its own field rather than a clause on {@link says}, because it is the half that does the work
   * and a clause is what gets trimmed when a screen is felt to be getting long.
   */
  readonly consequence: string;
}

/**
 * The four, in the order they are said.
 *
 * Ordered from the least alarming to the most, so the two that cost him data arrive after he has
 * already been told the app is not broken when it pauses. The reconnect sentence has to come early:
 * an unexplained pause is the thing he will otherwise report as a fault, and a coach who is told
 * everything unusual is normal stops telling anyone anything.
 */
export const EXPECTATIONS: readonly Expectation[] = Object.freeze([
  Object.freeze({
    id: 'sign-in-once',
    title: 'You sign in to Google once',
    says:
      'Signing in happens once, when the app is set up. It is not something you do at the start of '
      + 'each day, and there is nothing to type in front of a client.',
    consequence:
      'So if the app asks you to sign in again out of nowhere, that is worth mentioning to the '
      + 'person who set it up rather than working around.',
  }),
  Object.freeze({
    id: 'brief-reconnect',
    title: 'It reconnects to Google now and then, and that is normal',
    says:
      'While the app is open in front of you it renews its connection to Google roughly once an '
      + 'hour, at the moment it next needs it. You may notice a brief pause. It never does this '
      + 'while you are not using the app.',
    consequence:
      'That pause is deliberate, not a fault. This app keeps nothing on your device that would let '
      + 'it reach your Google account behind your back, and the short reconnection is the price of '
      + 'that choice.',
  }),
  Object.freeze({
    id: 'install-to-the-home-screen',
    title: 'The app must be installed to your home screen',
    says:
      'Add the app to your home screen and open it from that icon every time. A browser tab, a '
      + 'bookmark or a link in a message is not the same thing, even though it looks the same.',
    consequence:
      'A page left in a browser can have everything it saved cleared by the phone without warning, '
      + 'and a week of not opening it is enough. Anything you had typed and not yet backed up goes '
      + 'with it.',
  }),
  Object.freeze({
    id: 'never-delete-the-icon',
    title: 'Never delete the icon',
    says:
      'Do not remove the app from your home screen. Not to tidy up, not to free space, and not to '
      + 'install it again fresh.',
    consequence:
      'Removing the icon takes this device’s data with it, including anything not yet backed '
      + 'up to Google and the key this device uses to open your medical notes. Nothing on the '
      + 'device can bring it back.',
  }),
]);

// ═══════════════════════════════════════════════════════════════════════════════
// Two — the honest security wording
// ═══════════════════════════════════════════════════════════════════════════════

/** One named parameter of the cryptography, as the code itself names it. */
export interface AlgorithmFact {
  /** What it is for, in his terms. */
  readonly purpose: string;
  /**
   * The name as `core/crypto/primitives.js` spells it.
   *
   * Held as its own field rather than only inside a sentence so the suite can assert it against
   * that source. A name that only exists inside prose is a name nothing can check.
   */
  readonly named: string;
}

/**
 * What is ACTUALLY used, read off `core/crypto/primitives.js`.
 *
 * Named standard algorithms and nothing invented: this is the ordinary key-wrap pattern built from
 * the cryptography already in the browser. The parameters are here because a coach handing this to
 * anyone technical should be able to hand over the names too, and because naming them is the only
 * form of "it is encrypted" that means anything.
 */
export const ALGORITHM_FACTS: readonly AlgorithmFact[] = Object.freeze([
  Object.freeze({
    purpose: 'Sealing a medical note on this device',
    named: 'AES-GCM at 256 bits, with a fresh 96-bit initialisation vector every time',
  }),
  Object.freeze({
    purpose: 'Protecting the key that opens them',
    named: 'AES-KW',
  }),
  Object.freeze({
    purpose: 'Turning a passphrase into a key, where one is used',
    named: 'PBKDF2 with SHA-256, at 600,000 iterations',
  }),
  Object.freeze({
    purpose: 'Turning the stored recovery material into a key',
    named: 'HKDF with SHA-256',
  }),
]);

/** Which fields are encrypted, and — the half usually left out — which are not. */
export const WHAT_IS_ENCRYPTED =
  'Three things on a client’s record are encrypted on this device before anything leaves it: '
  + 'the medical note, the link to wherever the real detail is kept, and the words on that link. '
  + 'Everything else — names, sessions, routines, diets and every export — is stored and '
  + 'backed up as ordinary readable text.';

/** The construction, named. See {@link ALGORITHM_FACTS} for the parameters as data. */
export const HOW_IT_IS_ENCRYPTED =
  'The encryption is the browser’s own, and nothing about it was invented here. Notes are '
  + 'sealed with AES-GCM at 256 bits, with a fresh 96-bit initialisation vector for every single '
  + 'one. The key that opens them is itself protected with AES-KW. Where a passphrase is used, its '
  + 'key comes from PBKDF2 with SHA-256 at 600,000 iterations; where the stored recovery material '
  + 'is used, its key comes from HKDF with SHA-256.';

/**
 * THE PASSPHRASE, and it is stated as a loss rather than as a feature.
 *
 * "Never stored" reads as reassurance until it is paired with what that means when it is forgotten,
 * so both halves are in one sentence and cannot be quoted apart.
 */
export const THE_PASSPHRASE_IS_NEVER_STORED =
  'If you use a passphrase, it is never stored: not on this device, not in your Google account, '
  + 'and not anywhere the app could read it back. That also means nobody can recover it for you. '
  + 'Lose it and that particular way in is gone for good.';

/**
 * THE HONEST COST. It must never read as though it were slipped in.
 *
 * The recovery key lives in the Google account beside the encrypted copy, so the account holder can
 * read the notes. That was chosen deliberately in exchange for a recovery story that depends on
 * nothing the coach has to remember or keep — and the exchange is only honest if he is told.
 */
export const WHO_CAN_READ_THE_NOTES =
  'Anyone who can sign in to your Google account can read the encrypted notes, because the key '
  + 'that recovers them is kept in that account beside them. That was chosen on purpose, so that '
  + 'getting your notes back on a new phone is only a matter of signing in.';

/** What the encryption does buy, listed so the honest cost above is not read as "it buys nothing". */
export const WHAT_THE_ENCRYPTION_STILL_BUYS =
  'What it protects against is somebody holding the data WITHOUT the account: a lost or stolen '
  + 'phone or laptop, a computer you borrowed or handed back, a Drive folder shared by accident, '
  + 'or another app with broad access to your files. In all of those the notes stay unreadable.';

/**
 * THE SENTENCE THE WHOLE STEP IS JUDGED ON.
 *
 * No claim of compliance, certification or approval appears anywhere in this application, and none
 * may be added. This says so in his words. It is deliberately unqualified — an "although" after it
 * is the softening this sentence exists to refuse.
 */
export const NOT_AUDITED =
  'This app has not been audited or certified against any standard, by anyone, and it makes no such '
  + 'claim.';

/**
 * THE MITIGATION THAT ACTUALLY ADDRESSES THE COST ABOVE — and the app cannot check it.
 *
 * It guards the ACCOUNT rather than the data, which is why it belongs on the handover checklist as
 * something a person confirms, never in an assumption the code makes.
 */
export const TWO_FACTOR_IS_WHAT_PROTECTS_THEM =
  'Because the account is the way in, two-factor authentication on your Google account is what '
  + 'actually protects these notes. The app has no way of checking whether it is switched on.';

/**
 * The security wording in the order it is said, so a screen cannot reorder it into a different
 * meaning: what is encrypted, how, the passphrase, who can read them, what that still buys, what is
 * not claimed, and what he should therefore do.
 */
export const SECURITY_SENTENCES: readonly string[] = Object.freeze([
  WHAT_IS_ENCRYPTED,
  HOW_IT_IS_ENCRYPTED,
  THE_PASSPHRASE_IS_NEVER_STORED,
  WHO_CAN_READ_THE_NOTES,
  WHAT_THE_ENCRYPTION_STILL_BUYS,
  NOT_AUDITED,
  TWO_FACTOR_IS_WHAT_PROTECTS_THEM,
]);

// ═══════════════════════════════════════════════════════════════════════════════
// Three — the handover checklist
// ═══════════════════════════════════════════════════════════════════════════════

/** When a step happens, relative to the call. */
export type HandoverPhase = 'before' | 'during' | 'after';

/** The three, in order. A screen renders them in this order and does not decide it. */
export const HANDOVER_PHASES: readonly HandoverPhase[] = Object.freeze(['before', 'during', 'after']);

/** What each phase is headed, so the checklist reads as one arc rather than three lists. */
export const PHASE_TITLES: Readonly<Record<HandoverPhase, string>> = Object.freeze({
  before: 'Before the call',
  during: 'On the call',
  after: 'Afterwards, to know it actually worked',
});

/** One step of the handover, as data a test can read rather than as a paragraph. */
export interface HandoverStep {
  readonly id: string;
  readonly phase: HandoverPhase;
  /** The act, addressed to the person running the call. */
  readonly does: string;
  /**
   * WHY IT IS ON THE LIST. Required, never optional.
   *
   * A checklist whose items carry no reason is one that gets shortened under time pressure, and the
   * items that go first are the ones whose cost is invisible — which is every item here.
   */
  readonly why: string;
}

/**
 * THE CHECKLIST, in the order it is worked through.
 *
 * It exists so the user can rescue the coach OVER A CALL rather than doing it for him: every step
 * is something the coach does on his own device while being watched, because a setup performed by
 * somebody else on somebody else's machine is one he cannot repeat, and one whose device never
 * ends up holding what it needs.
 */
export const HANDOVER_CHECKLIST: readonly HandoverStep[] = Object.freeze([
  Object.freeze({
    id: 'two-factor',
    phase: 'before' as const,
    does:
      'Confirm two-factor authentication is switched on for his Google account, and switch it on '
      + 'with him if it is not. Do not start the rest of the setup until it is on.',
    why:
      'The recovery design depends on it. The key that recovers his medical notes is kept in that '
      + 'Google account, so anyone who can sign in to the account can read them — two-factor '
      + 'authentication is what stands between the two. The app cannot check it, which is why a '
      + 'person has to.',
  }),
  Object.freeze({
    id: 'the-right-device',
    phase: 'before' as const,
    does:
      'Agree which device he will actually use with clients, and set that one up. Have it in his '
      + 'hands, charged, before the call starts.',
    why:
      'Everything the app saves lives on the device it was typed into until it reaches Google. A '
      + 'setup done on a device he then puts away leaves his practice on the wrong machine.',
  }),
  Object.freeze({
    id: 'account-details-to-hand',
    phase: 'before' as const,
    does: 'Check he can sign in to that Google account on that device before you begin.',
    why:
      'A forgotten password ends the call, and a password reset in the middle of a setup is where '
      + 'people give up.',
  }),
  Object.freeze({
    id: 'he-signs-in',
    phase: 'during' as const,
    does:
      'Have HIM sign in, on HIS device, while you watch. Do not read the steps out while he does '
      + 'something else.',
    why:
      'He signs in once, and this is the only time he will see it done. If it ever has to be done '
      + 'again, he has watched it happen rather than heard about it.',
  }),
  Object.freeze({
    id: 'he-installs-it',
    phase: 'during' as const,
    does:
      'Watch him add the app to his home screen and open it from that icon. Close the browser tab '
      + 'together, so the icon is the only way he has left in.',
    why:
      'A page left in a browser can have everything it saved cleared by the phone without warning. '
      + 'Leaving the tab open leaves him a second way in that quietly loses his work.',
  }),
  Object.freeze({
    id: 'say-what-deleting-costs',
    phase: 'during' as const,
    does:
      'Say out loud that the icon must never be deleted, and say what it takes with it. Ask him to '
      + 'repeat it back.',
    why:
      'Removing the icon takes the device’s data and the key that opens his medical notes. It '
      + 'is the one ordinary tidying-up action that cannot be undone.',
  }),
  Object.freeze({
    id: 'say-what-is-not-claimed',
    phase: 'during' as const,
    does:
      'Tell him what the app does not claim: that it has not been audited or certified against any '
      + 'standard, and that anyone who can sign in to his Google account can read the encrypted '
      + 'notes. Say it before he types a real client’s detail into it.',
    why:
      'He is deciding whether to keep client medical detail here, and a decision made on softened '
      + 'words is one he did not really make. It is also far cheaper to say now than to discover.',
  }),
  // WHAT THIS STEP REPLACED, AND WHY IT COULD NOT BE REWORDED.
  //
  // It read: "add a medical note to a test client and confirm it saves without refusing", on the
  // ground that a save proves the connection worked. THE PROTECTED CLINICAL FIELD CANNOT SAVE IN ANY
  // STATE OF THIS BUILD — `screens/clients.ts` returns `canAccept: false` from every branch, says so
  // in its own words, and its suite asserts it — so the step nominated as its proof-of-success an
  // event this application is incapable of producing. That is worse than a dead instruction: the
  // helper follows it, the note does not save because it never can, and he concludes THE CONNECTION
  // FAILED when it may have worked perfectly. A false negative about the whole setup.
  //
  // The replacement is chosen so that the APP computes and paints the verdict rather than a helper
  // judging one by eye — which is how this defect regenerates one level down. Both of its outcomes
  // are states this build really reaches.
  Object.freeze({
    id: 'watch-one-backup-finish',
    phase: 'after' as const,
    does:
      'On his device, add one client, then watch the backup indicator on the app frame until it '
      + 'says his work is in his Google Drive.',
    why:
      'Signing in does not prove this device ever reached the shared Google space; a finished backup '
      + 'does, and the app works that sentence out from what the backup itself reported rather than '
      + 'from the sign-in. Adding a client first is what gives it something to carry, so the words '
      + 'have to change for the right reason. If it never gets there, the indicator says what is in '
      + 'the way in its own words — so there is an answer either way, and it is the app’s answer '
      + 'rather than yours.',
  }),
  Object.freeze({
    id: 'check-the-encryption-details',
    phase: 'after' as const,
    // The one sentence in this module that sends him somewhere. It composes the destination's own
    // title constant, and it names the CARD rather than a position on the screen.
    does:
      `On his device, open Admin and find the card headed “${KEY_MATERIAL_TITLE}”. Today it says `
      + 'the app has not checked, and that is what he should see.',
    why:
      'Two devices that each make their own set produce notes neither can open on the other, and '
      + 'nothing warns anyone at the time. This app does not look for that yet, so nobody should '
      + 'read the card as a confirmation that it did — knowing the card is not watching is what '
      + 'stops a helper trusting it.',
  }),
  Object.freeze({
    id: 'a-week-later',
    phase: 'after' as const,
    does:
      'A week later, ask him to open the app from the home-screen icon and confirm his clients are '
      + 'still listed.',
    why:
      'Storage loss arrives as absence rather than as an error, so nothing tells him it happened. '
      + 'A week is long enough for a device that was never properly installed to have cleared it.',
  }),
]);

/**
 * The sentences that DENY a claim rather than making one, named as data.
 *
 * A scan for forbidden words cannot tell a claim MADE from a claim REFUSED, and this build has
 * already measured that trap: the house documents its prohibitions beside the code they constrain,
 * so a naive sweep matches its own explanation. The suite sweeps everything else and holds each of
 * these to naming a claim AND denying it — which is the assertion that a "disclaimer" quietly
 * turned into a reassurance would fail.
 *
 * There are two because the denial is said twice on purpose: once as written copy, and once out
 * loud on the call, before he types a real client's detail in. Neither is a copy of the other made
 * to satisfy a scan; they are addressed to different people at different moments.
 */
export const DISCLAIMERS: readonly string[] = Object.freeze([
  NOT_AUDITED,
  HANDOVER_CHECKLIST.find((step) => step.id === 'say-what-is-not-claimed')?.does ?? '',
]);

/**
 * The one sentence that names a place in this application, exposed on its own so the suite can hold
 * it against the destination and count how many times it appears.
 */
export const WHERE_TO_CHECK_THE_ENCRYPTION_DETAILS =
  HANDOVER_CHECKLIST.find((step) => step.id === 'check-the-encryption-details')?.does ?? '';

/** The steps of one phase, in order. The ordering is this module's, never the screen's. */
export function stepsOf(phase: HandoverPhase): readonly HandoverStep[] {
  return HANDOVER_CHECKLIST.filter((step) => step.phase === phase);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Everything this module would put in front of a reader
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Every user-facing string here, in one list.
 *
 * It exists so the sweeps in the suite cannot go stale: a sentence added to any of the three
 * sections above arrives in this list automatically, and is therefore swept for forbidden claims,
 * emoji and platform claims without anybody remembering to widen a test.
 */
export function everySentence(): readonly string[] {
  return Object.freeze([
    ...EXPECTATIONS.flatMap((held) => [held.title, held.says, held.consequence]),
    ...ALGORITHM_FACTS.flatMap((held) => [held.purpose, held.named]),
    ...SECURITY_SENTENCES,
    ...Object.values(PHASE_TITLES),
    ...HANDOVER_CHECKLIST.flatMap((held) => [held.does, held.why]),
  ]);
}
