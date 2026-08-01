/**
 * THE REPO-WIDE FORBIDDEN-CLAIM GATE — no claim of compliance, certification, end-to-end
 * encryption, or that the coach's data is safe or secure, anywhere the coach or a reader can
 * meet it. No emoji in a user-facing string. No Android claim.
 *
 * ## THE REGEX APPROVAL THIS FILE RUNS UNDER
 *
 * REGEX APPROVED BY THE USER, 2026-07-31, for TEST CASES. He was asked because a standing rule
 * makes a regex under src an escalation, and he answered that regex is fine in test cases. WHAT
 * THIS FILE MATCHES: claims that data is safe, secure, compliant, certified or end-to-end
 * encrypted, in strings the coach can see — and NOT the same words appearing in prose that FORBIDS
 * them. WHY IT IS PERMITTED: it reads the repository's own bytes, in a test, at build time. It
 * never meets a value the coach typed and never runs on his device. THE LINE: a regex facing HIS
 * INPUT still gets character walks — a1's client-id and calendar-id shape checks are written that
 * way for exactly this reason and must stay that way.
 *
 * ## THE SEAM: A CLAIM **MADE** VERSUS A CLAIM **FORBIDDEN**
 *
 * This house documents its prohibitions in prose beside the code they constrain. `core/crypto/
 * CRYPTO.md` says "It contains no compliance claim of any kind". `core/sync/SYNC.md` says
 * "Nothing in this directory is certified, approved or audited against any regime".
 * `core/journal/JOURNAL.md` says "Not HIPAA, not GDPR, not the DPDP Act". Those sentences are the
 * discipline working, and a sweep that matches them either fails for ever or gets narrowed until
 * it matches nothing. Both endings are the same ending: the gate stops meaning anything.
 *
 * So the distinction is a PROPERTY OF THE CHECK, computed on every run, and it is two decisions
 * rather than one list:
 *
 * **1. WHERE the words are decides WHICH RULE APPLIES.** The scan runs over three universes and
 * they are a partition of every byte this gate is responsible for — nothing is "skipped", things
 * are ROUTED:
 *
 *   - **{@link ARTEFACT} — the published bundle.** Every byte of it can reach the coach's screen.
 *     No governance rule, no escape: a forbidden phrase here IS a claim, because he reads the
 *     words and not the grammar of the repository.
 *   - **{@link SHIPPED} — the application's own code, comments stripped.** Same rule, same
 *     reason: these are the strings that become the artefact. A prohibition explained in a
 *     comment is not in this universe; the comment is.
 *   - **{@link PROSE} — the repository's documents, every comment, and every test.** Here the
 *     phrase is being TALKED ABOUT. This is where the discriminator lives.
 *
 * **2. IN PROSE, A PHRASE IS A CLAIM ONLY WHEN IT IS USED, NEVER WHEN IT IS MENTIONED.** A
 * forbidden phrase governed by a negation, a refusal or a report verb appearing BEFORE it in its
 * own sentence is being mentioned — "no compliance claim", "nothing here is certified", "a file
 * that says everything is safe", "tells the coach whether his data is safe". Ungoverned, it is
 * being used, and it fails. See {@link isMentionedNotMade}.
 *
 * ORDER IS LOAD-BEARING and it is what stops the rule collapsing into "any sentence with the word
 * not in it". "The archive is encrypted end-to-end, so it is not readable by Google" carries a
 * negation, and the negation is AFTER the claim, so it does not govern it and the sentence fails —
 * correctly, because that sentence makes the claim.
 *
 * **THE DISCRIMINATOR IS STRICT BY DEFAULT.** Anything it cannot classify is a CLAIM. A false red
 * is a conversation; a false green is a shipped claim.
 *
 * ## THE PATTERNS ARE CLAIM-SHAPED, NOT BARE WORDS — MEASURED, NOT REASONED
 *
 * A `/secure|safe|certified/` sweep is the naive gate, and this tree kills it four different ways:
 *
 *   - the bundle ships a WORD LIST containing `"secure"`, `"seal"`, `"secret"`;
 *   - React's own internals contain `unsafe_componentWillReceiveProps`;
 *   - the stylesheet ships `--safe-area-bottom: env(safe-area-inset-bottom, 0px)`;
 *   - **`certified professional` / `certified coach` occurs at roughly fifteen sites and every one
 *     of them is about THE COACH.** His certification is a fact about a person. It is not, and can
 *     never be, a claim about this software. {@link CLAIMS} carries that as a lookahead rather
 *     than as an exemption, and {@link CERTIFICATION_IS_ABOUT_THE_SOFTWARE} drives both arms of it.
 *
 * ## THE ARTEFACT IS ONE LINE OF ABOUT A MEGABYTE
 *
 * `dist/assets/index-*.js` is 48 lines holding ~968 KB, essentially all of it on one. A
 * line-oriented matcher returns NO MATCH against a file that plainly contains the text, and the
 * result is indistinguishable from a genuine absence — the exact false green this file exists to
 * refuse. **Every artefact read here is a WHOLE-FILE read and every artefact test is a whole-file
 * substring or a regular expression applied to the entire text.** Nothing here splits on newlines.
 * {@link THE_BUNDLE_IS_ONE_ENORMOUS_LINE} asserts the hazard is still real, so the day the bundler
 * starts emitting readable output this file says so instead of quietly becoming lucky.
 *
 * ## NON-VACUITY IS THE POINT OF THIS FILE
 *
 * This is an absence-shaped check, the shape that passes when it is broken. So:
 *
 *   - every universe is paired with a POSITIVE CONTROL that must be found, and for the bundle the
 *     control is a sentence proven present INSIDE the one enormous line;
 *   - every pattern is fired at a claim it MUST catch and a sentence it MUST NOT, so a typo
 *     announces itself instead of reporting the tree clean for ever;
 *   - the discriminator is driven in BOTH directions, on REAL sentences taken from this tree;
 *   - the universes are asserted to be a PARTITION with floors, so a walk that stops finding
 *     files fails rather than passing.
 *
 * ## THE ONE EXEMPTION, AND WHY IT IS A FILE RATHER THAN A LIST
 *
 * A file that defines a prohibition necessarily contains examples of it — every fixture below is
 * a forbidden claim, deliberately. So THIS FILE, and only this file, is outside {@link PROSE}.
 * That is the whole exemption. It is named once in {@link SELF}, it is asserted to be exactly one
 * file, and it is PAID FOR: because this file is unscanned, every fixture in it must be exercised
 * in both directions on every run, which is what {@link EVERY_PATTERN_CAN_FIRE} does.
 *
 * Anything else needing an exemption uses {@link FIXTURE_MARKER} — narrow, written at the site,
 * and itself asserted: a marker must sit on a line that really does carry a forbidden claim, it
 * must carry a reason, and the whole set is pinned, so one cannot be added quietly.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { OUTPUT_DIRECTORY } from '../../tools/build-config.mjs';
import { DISCLAIMERS } from '../screens/setup-honesty';
import { painted, paintEveryScreen } from './painted';
import type { PaintedScreen } from './painted';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPLICATION_ROOT = path.resolve(HERE, '..', '..');
const REPOSITORY_ROOT = path.resolve(APPLICATION_ROOT, '..');

/** The one file outside every scan, because it is the file that defines what is forbidden. */
const SELF = 'src/proof/forbidden-claims.test.ts';

/** The same file as git names it, derived rather than typed so it survives the app being moved. */
const SELF_FROM_REPOSITORY = path
  .relative(REPOSITORY_ROOT, path.join(APPLICATION_ROOT, SELF))
  .split(path.sep)
  .join('/');

/**
 * The prefix git puts in front of everything inside the application, derived rather than typed so
 * that it survives the application being moved or renamed.
 */
const APPLICATION_PREFIX = `${path
  .relative(REPOSITORY_ROOT, APPLICATION_ROOT)
  .split(path.sep)
  .join('/')}/`;

/** The marker that carries a narrow, in-place exemption. Its own text names no forbidden claim. */
const FIXTURE_MARKER = 'forbidden-claim: fixture';

// ═══════════════════════════════════════════════════════════════════════════════
// The claims
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * One forbidden claim: what it is, how to recognise it, and the fixtures that prove the pattern
 * is neither dead nor greedy.
 *
 * `fires` and `quiet` are not documentation. A pattern with a typo matches nothing and reports the
 * whole repository clean for ever, which is the failure this gate is most likely to die of; a
 * pattern that is too greedy gets narrowed by whoever meets the false red, which is the same death
 * from the other side. Both lists are asserted on every run.
 */
type Claim = {
  readonly id: string;
  readonly what: string;
  readonly pattern: RegExp;
  /** Claims this pattern MUST catch. */
  readonly fires: readonly string[];
  /** Sentences from this tree, or near-misses, that it must NOT catch even before governance. */
  readonly quiet: readonly string[];
};

const REGIMES = 'hipaa|gdpr|dpdp|ccpa|pipeda|pci ?dss|iso ?27001|soc ?2';

/**
 * Every forbidden claim, and each one is shaped like the CLAIM rather than like a word that
 * appears in it. See the header for the four measured reasons a bare-word list cannot work here.
 */
const CLAIMS: readonly Claim[] = Object.freeze([
  Object.freeze({
    id: 'regime-compliance',
    what: 'compliance with, or certification against, a named regime',
    pattern: new RegExp(
      `\\b(?:${REGIMES})\\b[^.]{0,40}?\\b(?:compliant|compliance|certified|certification|`
      + `accredited|approved|ready|conformant)\\b`
      + `|\\b(?:compliant|compliance|certified|certification|accredited|conformant|conforms|`
      + `adheres)\\b[^.]{0,40}?\\b(?:with|to|against)\\b[^.]{0,20}?\\b(?:${REGIMES})\\b`,
      'u',
    ),
    fires: [
      // INVENTED HERE. The plant that stood here was 'this export is hipaa compliant', and
      // `screens/reset-to-defaults.test.ts:926` plants that same sentence as ITS break fixture — so
      // the two suites shared one plant, which is the shape THE PLANTS ARE SYNTHETIC below exists to
      // refuse. It survived that suite because the file is UNTRACKED and the sweep reads
      // `git ls-files`. Found by s11/r1 by searching the working tree instead.
      'this archive is pci dss accredited',
      'soc 2 certified',
      'compliant with hipaa',
      'we are gdpr ready',
      'iso 27001 certified storage',
    ],
    quiet: [
      'the coach is the actual certified professional here',
      'this build is offline first and stores nothing on a server',
    ],
  }),
  Object.freeze({
    id: 'bare-compliance',
    what: 'a compliance claim with no regime named at all',
    pattern: /\b(?:compliant|compliance|regulatory approval)\b/u,
    fires: ['the archive is fully compliant', 'built for compliance'],
    quiet: ['the shipped set is a starting point he corrects'],
  }),
  Object.freeze({
    id: 'certification-of-the-software',
    what: 'a claim that this software is certified, accredited, audited, endorsed or approved',
    pattern: new RegExp(
      `\\b(?:is|are|was|were|been|being|has|have|had)\\b[^.]{0,20}?`
      + `\\b(?:certified|accredited|audited|endorsed|approved)\\b`
      + `(?!\\s+(?:professional|professionals|coach|coaches|trainer|trainers|practitioner|`
      + `practitioners|instructor|instructors))`
      + `|\\bendorsed\\s+by\\b`
      + `|\\b(?:certification|accreditation)\\s+of\\s+(?:this|the)\\s+`
      + `(?:app|application|build|export|archive|software)\\b`,
      'u',
    ),
    fires: [
      'this app is certified against the standard',
      'the archive has been audited',
      // INVENTED HERE. `seed/validate_seed.py` plants "Endorsed by NASM" as ITS break fixture, and a
      // plant shared with another suite is a plant that stops being a plant the day that suite moves
      // it. See THE PLANTS ARE SYNTHETIC below, which is what now enforces this rather than care.
      'endorsed by the grimsby institute of barbell science',
      'this application is approved by the standards body',
      'certification of the application is complete',
    ],
    quiet: [
      // The measured reason this pattern is not `/certified/`. See CERTIFICATION_IS_ABOUT_THE_SOFTWARE.
      'that judgement belongs to the certified professional who is also adapting to a history',
      'he is a certified coach and the app is a supporting role',
      // `seed/SCHEMA.md` §R7 writes its forbidden vocabulary out as a bare word list. A pattern that
      // fired on a list of the words it forbids would red on the very discipline it enforces.
      'certified certification certifying certificate',
      'endorsed endorsement endorses endorse approved approval approved by accredited',
      'no field may claim endorsement, certification, accreditation or approval by any body',
    ],
  }),
  Object.freeze({
    id: 'end-to-end-encryption',
    what: 'a claim that anything here is encrypted end to end',
    pattern: new RegExp(
      `\\bend[ -]to[ -]end\\b[^.]{0,20}?\\b(?:encrypt|encrypts|encrypted|encryption)\\b`
      + `|\\bencrypted\\s+end[ -]to[ -]end\\b`
      + `|\\be2ee\\b|\\be2e\\b[^.]{0,10}?\\bencrypt`,
      'u',
    ),
    fires: [
      'your notes are end-to-end encrypted',
      'end to end encryption for every note',
      'the archive is encrypted end to end',
    ],
    quiet: [
      // "end to end" is this build's ordinary word for a whole-path proof and occurs everywhere.
      'this asserts the thread end to end at this layer',
      'the end-to-end proof that a practice survives a round trip',
      'a whole session, end to end, across every strand',
    ],
  }),
  Object.freeze({
    id: 'the-data-is-safe',
    what: "an assurance that the coach's data is safe, secure, private or protected",
    pattern: new RegExp(
      `\\b(?:your|his|her|their|our|the|all|every|any)\\s+`
      + `(?:data|notes?|records?|information|practice|details?|entries)\\s+`
      // A REFLEXIVE OR AN ADVERB BETWEEN THE NOUN AND THE VERB DOES NOT SOFTEN THE CLAIM, and this
      // is measured rather than imagined: "The notes themselves are safe" shipped on the
      // encryption-failure screen and reached the published bundle, four fields away from the
      // sentence d214 corrected, because the noun and the verb were no longer adjacent. Enumerated
      // rather than left as `\w+`, which would swallow "the notes he keeps are safe" — a different
      // sentence — and, worse, "the data protection rules are strict".
      + `(?:(?:themselves|itself|here|there|still|always|then|too|also|now)\\s+){0,2}`
      + `(?:is|are|stays?|remains?|will be|is kept|are kept)\\s+`
      // ...and the same on the far side of the verb: "is still private" is the claim "is private".
      + `(?:(?:still|always|entirely|quite|perfectly|completely|totally|fully)\\s+){0,2}`
      + `(?:safe|secure|private|protected)\\b`
      + `|\\beverything\\s+(?:is|stays|remains|will be)\\s+(?:safe|secure|private|protected)\\b`,
      'u',
    ),
    fires: [
      // INVENTED HERE. The plant that stood here was 'your data is safe', which is written down in
      // `screens/setup-honesty.test.ts:223` and `screens/setup-surface.test.ts:716` as a banned
      // phrase and in `screens/setup.test.ts:540` as a positive control. All three are honest prose
      // rather than live claims, so the sweep was not aimed away from an offender — but a plant three
      // other suites also hold stops being a plant the day any of them edits it. It survived the
      // sweep below because those files are UNTRACKED and it reads `git ls-files`; found by s11/r1
      // searching the working tree instead. This one exercises the identical `is kept` branch.
      'her details are kept private',
      'his notes are secure',
      // INVENTED HERE, and it must stay invented: "everything is safe" itself is written down in
      // `core/status/levels.test.js`, governed, as the dangerous reading of an empty queue.
      'everything stays protected',
      'the records will be protected',
      // THE REFLEXIVE CASE, which is the one that shipped: "The notes themselves are safe" reached
      // the published bundle four fields from the sentence d214 corrected, because the noun and the
      // verb were no longer adjacent. THE PLANT IS NOT THAT SENTENCE. That sentence is written down
      // in `screens/key-material-condition.test.ts`'s account of the fix, and a plant copied out of
      // the tree reads as the strongest possible fixture while proving nothing about where it came
      // from. This one is invented, and it exercises the identical gap.
      'his records themselves are protected',
      'your data here is still private',
    ],
    quiet: [
      // "it is safe to call" — the concurrency sense, which occurs at five sites in this tree.
      'it is safe to call on every start',
      'so it is safe against a session another window is running',
      'we cannot say it is safe',
      // The gap between the noun and the verb is BOUNDED and ENUMERATED for these two: a bare
      // `\w+` there would read a relative clause, or a compound noun, as the claim it is not.
      'the notes he keeps at home are safe',
      'the data protection rules are strict',
    ],
  }),
  Object.freeze({
    id: 'absolute-security',
    what: 'an absolute or superlative security claim',
    pattern: new RegExp(
      `\\b(?:completely|totally|fully|entirely|perfectly|100%)\\s+`
      + `(?:safe|secure|private|encrypted|confidential)\\b`
      + `|\\bbank[ -]?(?:level|grade)\\b|\\bmilitary[ -]?grade\\b`
      + `|\\bunbreakable\\b|\\bhack[ -]?proof\\b|\\bimpenetrable\\b`
      + `|\\bguaranteed\\s+(?:safe|secure|security|privacy|private)\\b`
      + `|\\bnobody\\s+(?:else\\s+)?can\\s+(?:ever\\s+)?read\\s+`
      + `(?:your|his|her|their|them|it|this|these|the\\s+(?:notes?|data|records?|file))\\b`,
      'u',
    ),
    fires: [
      // INVENTED HERE, and for the same reason as the plant in `regime-compliance` above: the
      // phrase that stood here was 'completely secure', which `screens/journal.test.ts:808` carries
      // inside its own plant and `screens/setup-honesty.test.ts:222` lists as a banned phrase.
      // Both files are UNTRACKED, so the tracked-file sweep below could not see either.
      'entirely confidential',
      'bank-level security',
      'military grade encryption',
      'guaranteed private',
      'nobody else can ever read your notes',
    ],
    quiet: [
      'the passphrase is never stored, and if it is lost the notes are gone for good',
      // "nobody can read" is this build's ordinary phrase for ILLEGIBLE, at three sites, and it
      // means the opposite of a security claim every time: a thing so unreadable it is useless.
      'a backup nobody can read is a file he will not trust',
      'a crumb with no words is a control nobody can read',
      'an invisible test input is a test nobody can read',
    ],
  }),
  Object.freeze({
    id: 'android-support',
    what: 'a claim that Android is supported, or is coming',
    pattern: new RegExp(
      `\\b(?:supports?|supported on|available on|works on|running on|coming to|ships on|`
      + `tested on|verified on)\\s+android\\b`
      + `|\\bandroid\\s+(?:support|version|release|is supported|is coming|is planned|`
      + `is scheduled)\\b`
      + `|\\bandroid\\b[^.]{0,30}?\\b(?:soon|planned|scheduled|roadmap|coming)\\b`,
      'u',
    ),
    fires: [
      'works on android',
      'android support is coming',
      'android soon',
      'tested on android and ios',
    ],
    quiet: [
      // Both real. INTEGRATION.md says Android is unknown; session-audio.ts names a real behaviour.
      'android behaviour is untested for all of it',
      'a fresh linux profile and some locked-down android builds are genuinely like this',
    ],
  }),
]);

/**
 * Android in a user-facing string is forbidden OUTRIGHT, with no claim frame required, because the
 * coach reading the word on a screen reads it as a platform this application runs on.
 *
 * **AND SINCE s11/a25 THIS IS THE PROSE RULE TOO.** The frame-shaped {@link CLAIMS} entry above
 * still runs, but it is no longer the whole of it, and the reason is measured rather than
 * reasoned: `design/direction-three/index.html` carried `192 - Android home screen`, the universe
 * was widened until the gate looked straight at that line, AND IT STILL COULD NOT SEE IT — the
 * claim-shaped rule wants a verb (`supports`, `coming to`, `soon`) and a bare platform naming
 * carries none. Fixing that line by hand while leaving the rule claim-shaped corrects today's
 * occurrence and stops nothing tomorrow, with the gate green throughout. d106/d109 say NO ANDROID
 * CLAIM ANYWHERE, NOT EVEN AS PENDING, and THE READER OF A PUBLIC REPOSITORY DOES NOT PARSE FOR
 * CLAIM VERBS: a tracked file naming an Android home screen represents that one exists.
 *
 * What the word may still legitimately do in prose is {@link ANDROID_IS_MENTIONED_NOT_CLAIMED},
 * and that list is held to being alive rather than merely declared.
 */
const ANDROID_ANYWHERE = /\bandroid\b/iu;

/**
 * THE ONLY WORK THE WORD `android` MAY DO IN THIS REPOSITORY'S PROSE.
 *
 * ## The list is the risk, not the rule it qualifies
 *
 * An allow-list is where future exceptions get quietly added, which is a new hole of exactly the
 * species this gate exists to close. So it is TESTED RATHER THAN DECLARED, in both directions and
 * on every run:
 *
 *   - **Every entry carries its reason IN THE ENTRY**, not in a comment somewhere else, so the
 *     reason cannot drift away from the thing it excuses.
 *   - **Every entry must still match a REAL occurrence**, and the gate REDS ON A STALE ENTRY. An
 *     entry that no longer corresponds to anything is a standing permission nobody is watching —
 *     a snapshot-pinned guard, the same defect as a fixed-count drain or a floor equal to its
 *     measurement, one layer up. With this assertion, adding an exception costs something and
 *     KEEPING one costs attention.
 *   - **No entry may reach a bare platform naming.** The fixtures below are fired at every entry
 *     on every run, so an entry widened until it swallows `192 - Android home screen` says so.
 *
 * ## Why these four and no others
 *
 * s11/a13 enumerated every occurrence in the tree and found exactly four families. THE POINT OF
 * WRITING THEM DOWN IS THE DISTINCTION BETWEEN DELIBERATELY ALLOWED AND ACCIDENTALLY INVISIBLE:
 * before this list they were invisible — not one of them had ever been ruled on, they simply sat
 * in a universe or under a pattern that could not reach them.
 *
 * Recognition is by SHAPE and never by file path. A path stops discriminating the moment the
 * sentence moves, and it exempts everything else in that file for ever; the header of this file
 * makes the same argument about the declared denials.
 */
const ANDROID_IS_MENTIONED_NOT_CLAIMED: readonly {
  id: string;
  why: string;
  recognise: RegExp;
}[] = Object.freeze([
  Object.freeze({
    id: 'the-platform-proof-rules-android-out',
    why: 'The sentence exists to say Android is NOT a target: unknown, untested, or explicitly not '
      + 'claimed. This is the discipline working, and a rule that reds on it would be relaxed '
      + 'until it caught nothing — the same argument the declared denials are held under. It also '
      + 'covers a CROSS-REFERENCE into that section ("see *Android* below"), because sentence '
      + 'splitting separates the pointer from the denial it points at and a pointer to a refusal '
      + 'is not a claim. '
      + 'WIDENED IN s12/a14 AFTER IT EDITED THE TRUTH TWICE. The window was eighty characters and '
      + 'could not cross a full stop, and the denial vocabulary was four phrases — so this entry '
      + 'could not reach the two shapes below, both measured on `DISCLOSURE.md` rather than '
      + 'imagined, and that document was reworded to get past the gate instead. A GUARD THAT '
      + 'EDITS THE TRUTH TO STAY GREEN HAS STOPPED BEING A GUARD. '
      + '(1) HEADING, FULL STOP, DENIAL — "**Android.** Never tested" — which is the most natural '
      + 'way anybody writes a disclaimer, and which the old window could not cross. '
      + '(2) A MARKDOWN TABLE CELL, where a denial sitting BESIDE its subject on screen is '
      + 'hundreds of characters from it to a sentence splitter, because a table header and its '
      + 'rows join into one unit and the cell is padded out by unrelated prose. '
      + 'So the window now crosses sentence punctuation and reaches 300 characters — BUT IT MAY '
      + 'NEVER CROSS A `|`, which is what keeps a table-cell denial from reaching over into a '
      + 'neighbouring cell it has nothing to do with. The denial vocabulary is still ENUMERATED '
      + 'and still about non-support: widening the window is not the same as accepting any '
      + 'negation in the vicinity, and the bare-platform-naming fixtures are what hold that line.',
    recognise: new RegExp(
      `\\bandroid\\b[^|]{0,300}?\\b(?:is unknown|unknown|untested|not tested|never tested|`
      + `never run|no claim|not claimed|not a target|not supported|unsupported|denial|denies|`
      + `denied)\\b`
      + `|\\b(?:no|not|nothing|never|neither|unknown|untested)\\b[^|]{0,300}?\\bandroid\\b`
      + `|\\bsee\\s+\\*?android\\*?\\s+(?:below|above)\\b`,
      'u',
    ),
  }),
  Object.freeze({
    id: 'a-build-time-platform-triple',
    why: 'An npm platform identifier in the lockfile — `@esbuild/android-arm64`, '
      + '`@rollup/rollup-android-arm-eabi`, or the bare `"android"` in a package’s `os` field. '
      + 'It names a machine the BUILD could run on, is written by npm rather than by anyone here, '
      + 'and reaches no reader as a sentence. It is recognised by the identifier SHAPE, so a '
      + 'sentence about Android in a lockfile would still be caught.',
    recognise: /android-(?:arm64|arm-eabi|arm|x64|ia32)\b|"android"/u,
  }),
  Object.freeze({
    id: 'a-test-asserting-android-is-absent',
    why: 'A test whose whole SUBJECT is the word itself. It asserts the word does not appear, or '
      + 'it feeds a deliberately claim-shaped string to its own non-vacuity probe so that the '
      + 'absence assertion beside it is not vacuous. It has to name what it is looking for, and '
      + 'it is the instrument that enforces this prohibition rather than a breach of it. '
      + 'Recognised by the ASSERTION CALL sitting with the naming, which is why it does not reach '
      + 'ordinary prose in a test file.',
    recognise: /\bassert\b[^\n]{0,160}?\bandroid\b|\bandroid\b[^\n]{0,160}?\bassert\b|\bclaims nothing about\s+android\b|\/android\/i/u,
  }),
  Object.freeze({
    id: 'a-locked-down-build-with-no-speech-voice',
    why: 'One source comment and its test, explaining a REAL behaviour of the speech-synthesis API '
      + '— a locked-down build ships no voice, so a missing voice is a state and not an error. '
      + 'It describes an environment the code must survive, and claims nothing about this build '
      + 'running there. Recognised by the locked-down-build shape it is written in.',
    recognise: /locked[ -]down\s+android\s+builds?\b/u,
  }),
]);

/**
 * BARE PLATFORM NAMINGS NO ENTRY ABOVE MAY EVER ALLOW.
 *
 * The first is the shape that motivated all of this — `design/direction-three/index.html` carried
 * it and every gate in this repository reported the tree clean. It is written here SYNTHETICALLY,
 * reworded rather than lifted, because a fixture copied out of the tree points the sweep away from
 * the very sentence it came from; three of this project’s thirty-seven plants were taken from
 * the tree and one of those had shipped.
 */
const A_BARE_PLATFORM_NAMING: readonly string[] = Object.freeze([
  'the mark at 192 is the android home screen icon',
  'a second screenshot shows the android layout of the calendar',
  'this size is the one android draws in the launcher',
]);

/**
 * HONEST DENIALS THE GATE MUST NOT RED ON — the two shapes that made it edit the truth.
 *
 * Both were MEASURED on `DISCLOSURE.md` in s12/a9 rather than imagined, and the document was
 * reworded to get past the gate rather than the gate being widened — in the clause table, to
 * naming the platform BY DESCRIPTION INSTEAD OF BY NAME. That is the disclosure being shaped by
 * the guard rather than by the truth, so both the matcher and the wording were repaired in a14.
 *
 * Written SYNTHETICALLY, like every other fixture here: the real sentences are proven by the gate
 * running over the real document, and a fixture lifted out of the tree points the sweep away from
 * the sentence it came from.
 *
 * Each entry declares HOW FAR its denial sits from its naming, and that distance is asserted, so
 * a fixture that drifted into being adjacent — and therefore stopped exercising the widening at
 * all — says so instead of passing for free.
 */
const AN_HONEST_DENIAL: readonly { id: string; text: string; farApart: boolean }[] = Object.freeze([
  Object.freeze({
    id: 'heading-full-stop-denial',
    text: '**Android.** Never tested on a handset here, and no reading was ever taken.',
    // The denial is adjacent; what defeated the old rule was the FULL STOP between them, not the
    // distance, so this one is deliberately close.
    farApart: false,
  }),
  Object.freeze({
    id: 'a-markdown-table-cell',
    text: '| 4 | Reach | Android, which appears in the tested set nowhere at all and could not be '
      + 'added to it without a second handset, a second signed-in account and a second store '
      + 'listing, was never tested |',
    farApart: true,
  }),
]);

/**
 * AND THE OTHER DIRECTION, WHICH IS THE ONE THAT KEEPS THE WIDENING HONEST.
 *
 * A window widened from eighty characters to three hundred is a hole unless a sentence that
 * genuinely CLAIMS the platform still fails, including one wearing the table-cell shape the
 * widening was made for. Written synthetically for the same reason as everything else here.
 */
const AN_ANDROID_SUPPORT_CLAIM: readonly string[] = Object.freeze([
  'android is fully supported from this release onward',
  'every screen here has been verified on android as well as on the tested handset',
  '| 4 | Reach | Android, which appears in the tested set nowhere at all, runs this build just '
  + 'as well as the handset the readings were taken on |',
]);

/**
 * An emoji, in the same family the rest of this suite already uses (`reset-to-defaults.test.ts`,
 * `setup-honesty.test.ts`). Kept beside the claims because it is the same kind of rule about the
 * same kind of text.
 */
const EMOJI = /\p{Extended_Pictographic}/u;

/**
 * THE EMOJI THIS APPLICATION DID NOT WRITE, AND CANNOT REWORD.
 *
 * `react-router-dom` ships a development error boundary whose message carries two emoji, and it
 * lands in the bundle because it is inside a dependency rather than inside anything this build
 * authors. The no-emoji rule is about the words this application chooses, so the honest answer is
 * neither to red on it for ever nor to quietly stop scanning the artefact — it is to NAME the
 * string, so that a SECOND emoji arriving from anywhere still fails.
 *
 * Declared as data and asserted in both directions by {@link THE_VENDORED_EMOJI_IS_REAL}: each
 * entry must still be present in the artefact (an exception outliving its cause is deleted, not
 * inherited) and must really carry an emoji. The application's own strings are held to the rule
 * with no exception at all, in the {@link SHIPPED} universe.
 */
const VENDORED_EMOJI: readonly { text: string; why: string }[] = Object.freeze([
  Object.freeze({
    text: '\u{1F4BF} Hey developer \u{1F44B}',
    why: 'react-router-dom’s default error boundary. Not authored here and not rewordable '
      + 'without forking the router, so it is still in the bundle and this entry still has work to '
      + 'do. MEASURED IN THE PRODUCTION BUNDLE 2026-07-31 (s10/a6, re-measured in s11/a3): the '
      + 'emoji fragment is assigned UNCONDITIONALLY inside the default boundary’s render — the dev '
      + 'guard did not survive as a branch — and the router picks a boundary with '
      + '`route.errorElement || DC`. WHAT HAS CHANGED SINCE s10/a6, and this note is corrected '
      + 'rather than left to expire: every route in `src/shell/routes.tsx` now declares an '
      + 'errorElement, so the second half of the old reasoning no longer holds — an unhandled '
      + 'render or loader error reaches `screens/ErrorScreen.tsx`, and the coach does not meet '
      + 'these two emoji, "Unexpected Application Error!" or a raw stack trace. The bytes remain '
      + 'in the artefact because the library ships them; `src/shell/no-dead-ends.test.ts` is what '
      + 'keeps them unreachable.',
  }),
]);

// ═══════════════════════════════════════════════════════════════════════════════
// The discriminator
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The words that make a following phrase MENTIONED rather than MADE.
 *
 * Three families, and all three were needed against the real tree rather than invented:
 *
 *   - **negation and refusal** — "no compliance claim", "nothing here is certified", "the erase
 *     REFUSES rather than handing him a file that says everything is safe";
 *   - **report and attitude** — "a file that SAYS everything is safe", "tells the coach WHETHER
 *     his data is safe", "the dangerous reading is that an empty queue MEANS everything is safe";
 *   - **assertion** — a suite naming the claim it forbids.
 *
 * The second family is the one a pure negation rule would have missed, and missing it is what
 * would have driven the next person to add an ignore list.
 */
const MENTION = new RegExp(
  '\\b(?:'
  + 'no|not|never|nothing|nobody|none|neither|nor|cannot|can\'t|without|'
  + 'avoid|avoids|refuse|refuses|refused|refusal|forbid|forbids|forbidden|'
  + 'prohibit|prohibits|prohibited|deny|denies|denied|denial|disclaim|disclaims|disclaimer|'
  + 'unaudited|uncertified|untested|unknown|'
  + 'say|says|said|saying|tell|tells|telling|told|claim|claims|claimed|claiming|'
  + 'describe|describes|described|call|calls|called|word|words|wording|sentence|phrase|'
  + 'whether|mean|means|meaning|read|reads|reading|sound|sounds|imply|implies|implied|'
  + 'assert|asserts|asserted|assertion|assume|assumes|assumed|'
  + 'rather|instead|beware|trap|danger|dangerous|wrongly|falsely|misleading|pretend|pretends|'
  + 'question|case|example|fixture|planted|probe'
  + ')\\b',
  'iu',
);

/**
 * Is this occurrence being talked ABOUT rather than said?
 *
 * The governor must appear BEFORE THE CLAIM WORD and inside the same sentence. Order is what stops
 * the rule collapsing into "the sentence contains the word not": a negation that arrives after the
 * claim does not govern it, and a sentence carrying one is usually making the claim and then
 * qualifying it, which is the shape this gate most wants to catch.
 *
 * The window ends at the END of the match rather than at its start, because every pattern here
 * closes on its claim word and several open on an auxiliary verb — "has not been audited" matches
 * from `has`, and the `not` that governs it sits INSIDE the match. Ending the window at the match
 * start would have read this repository's own disclaimer as a claim, which is the first thing it
 * did.
 */
function isMentionedNotMade(sentence: string, matchIndex: number, matchLength: number): boolean {
  return MENTION.test(sentence.slice(0, matchIndex + matchLength));
}

/** One sentence of prose, and where it came from, so a failure names a place a person can open. */
type Sentence = { readonly where: string; readonly line: number; readonly text: string };

/**
 * Prose split into sentences, and the split is different for prose and for code ON PURPOSE.
 *
 * **Prose wraps; code does not.** Wrapped markdown and wrapped JSDoc break a sentence across lines
 * — `CRYPTO.md` ends one line with "Nothing here is" and begins the next with "certified,
 * approved, or audited" — so splitting those on newlines would separate the governor from the
 * phrase it governs and turn every wrapped prohibition in this repository into a false red. So
 * comment and document lines JOIN.
 *
 * A line of CODE is not a wrapped clause, and joining code lines is how governance goes soft: one
 * `assert` or one `no` anywhere in a long block would govern everything after it, so a forbidden
 * word list twenty lines below would be exempted by a sentence that had nothing to do with it.
 * Code lines are therefore their own units.
 *
 * `wraps` is true for markdown, where every line is prose. In source, a line beginning `*` or `//`
 * is comment prose and joins its neighbours; anything else stands alone.
 */
function sentencesOf(where: string, raw: string, wraps: boolean): Sentence[] {
  const lines = raw
    .replace(/\r\n/gu, '\n')
    .replace(/[‘’]/gu, "'")
    .replace(/[“”]/gu, '"')
    .replace(/[–—]/gu, ' - ')
    .split('\n');

  /** A run of lines that belong to one unit of prose, with the line its first line sits on. */
  const units: { line: number; text: string }[] = [];
  let open: { line: number; parts: string[] } | null = null;

  const close = (): void => {
    if (open !== null && open.parts.join(' ').trim() !== '') {
      units.push({ line: open.line, text: open.parts.join(' ') });
    }
    open = null;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const isProse = wraps || /^(?:\*|\/\*|\/\/|>)/u.test(trimmed);
    // A blank line ends a paragraph in prose; in code it ends nothing that was not already ended.
    if (trimmed === '') { close(); return; }
    if (!isProse) {
      close();
      units.push({ line: index + 1, text: trimmed });
      return;
    }
    const stripped = trimmed.replace(/^(?:\/\*+|\*+|\/\/+|>)[ \t]?/u, '');
    if (open === null) open = { line: index + 1, parts: [stripped] };
    else open.parts.push(stripped);
  });
  close();

  const sentences: Sentence[] = [];
  for (const unit of units) {
    const joined = unit.text.replace(/[ \t]+/gu, ' ').trim();
    for (const piece of joined.split(/(?<=[.!?;])\s+/u)) {
      const text = piece.trim();
      if (text !== '') sentences.push({ where, line: unit.line, text });
    }
  }
  return sentences;
}

/**
 * How far below a {@link FIXTURE_MARKER} its exemption reaches.
 *
 * Bounded on purpose. A marker written above a short frozen list of forbidden words covers that
 * list and stops; it cannot be written once at the top of a file and quietly cover everything
 * under it, which is how a visible exemption turns into a blanket.
 */
const MARKER_REACH = 8;

/** The line ranges a file's markers exempt, so a failure and an exemption name the same lines. */
function exemptLinesOf(raw: string): ReadonlySet<number> {
  const exempt = new Set<number>();
  raw.split('\n').forEach((line, index) => {
    if (!line.includes(FIXTURE_MARKER)) return;
    for (let reach = 0; reach <= MARKER_REACH; reach += 1) exempt.add(index + 1 + reach);
  });
  return exempt;
}

/** A forbidden claim that was actually MADE, with enough context to open the file and read it. */
type Finding = { readonly where: string; readonly claim: string; readonly text: string };

/**
 * Every claim this prose MAKES, having set aside the ones it merely mentions and the ones a
 * visible marker exempts.
 */
function claimsMadeInProse(
  sentences: readonly Sentence[],
  exempt: (where: string, line: number) => boolean = () => false,
): Finding[] {
  const found: Finding[] = [];
  for (const { where, line, text } of sentences) {
    if (exempt(where, line)) continue;
    for (const claim of CLAIMS) {
      const match = claim.pattern.exec(text.toLowerCase());
      if (match === null) continue;
      if (isMentionedNotMade(text, match.index, match[0].length)) continue;
      found.push({ where: `${where}:${line}`, claim: claim.id, text: text.slice(0, 200) });
    }
  }
  return found;
}

/**
 * Every claim this text makes, with NO governance rule at all.
 *
 * This is the artefact's and the application's rule, and the asymmetry is the seam. The coach
 * reads the words on a screen; he does not read the sentence they sit in looking for the negation
 * that would have made them acceptable in a design document.
 */
function claimsMadeInShippedText(where: string, text: string): Finding[] {
  const lowered = text.toLowerCase();
  return CLAIMS
    .filter((claim) => claim.pattern.test(lowered))
    .map((claim) => ({
      where,
      claim: claim.id,
      text: (claim.pattern.exec(lowered)?.[0] ?? '').slice(0, 220),
    }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// The three universes
// ═══════════════════════════════════════════════════════════════════════════════

/** A file that was read, named the way a person would type it. */
type Read = { readonly where: string; readonly text: string };

/**
 * A file's CODE, with every comment removed — the same small state machine
 * `src/platform/google-privacy.test.ts` uses, and for the same reason: it tracks string literals
 * so a comment marker inside a string is left where it is.
 */
function splitCodeFromComments(raw: string): { code: string; comments: string } {
  // POSITION-PRESERVING: each half is exactly as long as the source, with the other half blanked
  // out. That is what lets a finding name a real line number, and what makes the partition
  // assertion an equality rather than an estimate. Newlines are kept in both halves.
  const code: string[] = [];
  const comments: string[] = [];
  const emit = (character: string, into: string[], other: string[]): void => {
    into.push(character);
    other.push(character === '\n' ? '\n' : ' ');
  };

  let index = 0;
  let quote = '';

  while (index < raw.length) {
    const here = raw[index] as string;
    const next = raw[index + 1] ?? '';

    if (quote !== '') {
      emit(here, code, comments);
      if (here === '\\') { index += 1; emit(next, code, comments); index += 1; continue; }
      if (here === quote) quote = '';
      index += 1;
      continue;
    }

    if (here === '"' || here === "'" || here === '`') {
      quote = here;
      emit(here, code, comments);
      index += 1;
      continue;
    }

    if (here === '/' && next === '/') {
      while (index < raw.length && raw[index] !== '\n') {
        emit(raw[index] as string, comments, code);
        index += 1;
      }
      continue;
    }
    if (here === '/' && next === '*') {
      while (index < raw.length && !(raw[index] === '*' && raw[index + 1] === '/')) {
        emit(raw[index] as string, comments, code);
        index += 1;
      }
      emit('*', comments, code);
      emit('/', comments, code);
      index += 2;
      continue;
    }

    emit(here, code, comments);
    index += 1;
  }
  return { code: code.join(''), comments: comments.join('') };
}

/** Every file under a directory, at any depth, as paths relative to the application root. */
function walk(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      found.push(...walk(full));
    } else {
      found.push(path.relative(APPLICATION_ROOT, full).split(path.sep).join('/'));
    }
  }
  return found;
}

/**
 * **U1 — THE PUBLISHED ARTEFACT, ENUMERATED FROM THE FILESYSTEM AND READ WHOLE.**
 *
 * From the filesystem and NOT from the tracked file set, and this is measured rather than
 * stylistic: the committed bundle and the bundle on disk are different files — `git ls-files`
 * names `app/dist/assets/index-Dv_hVoTc.js` while the artefact actually sitting there is
 * `index-C3ZM1tyk.js`. Enumerating the artefact through git would hand this scan a path that does
 * not exist, and depending on how that were read it would either error or, far worse, scan zero
 * files and pass. The bundle that IS there is the one whose bytes can reach the coach.
 */
const ARTEFACT: readonly Read[] = (() => {
  const output = path.join(APPLICATION_ROOT, OUTPUT_DIRECTORY);
  // RETURNING [] HERE AND LETTING THE ASSERTIONS BELOW FAIL IS INTENDED, AND MUST NOT BECOME A
  // SKIP. `app/dist` is not committed, so this branch is reachable in exactly one place in the
  // world: a fresh CI checkout, before `npm run build` has run. Every developer machine has a
  // `dist` on disk and is structurally blind to it. Turning this into `it.skip`, an early
  // `return`, or a "no artefact, nothing to check" pass would silently disable the artefact scan
  // in THE ONE ENVIRONMENT THAT PUBLISHES — a green tick over a suite that examined nothing.
  // A red here is the workflow telling you it built too late; fix the ORDER in
  // `.github/workflows/pages.yml`, never this guard.
  if (!existsSync(output)) return [];
  return walk(output)
    .filter((name) => /\.(?:js|css|html|json|webmanifest|svg|txt)$/u.test(name))
    .map((name) => ({
      where: name,
      // WHOLE FILE. Never a line. See the header: this is 48 lines holding about a megabyte.
      text: readFileSync(path.join(APPLICATION_ROOT, name), 'utf8'),
    }));
})();

/** Every source file of the application, split once into what ships and what explains it. */
const SOURCE: readonly { where: string; code: string; comments: string; raw: string }[] = (() => {
  const roots = ['src', 'core', 'tools'].map((name) => path.join(APPLICATION_ROOT, name));
  const files = roots.filter((root) => existsSync(root)).flatMap((root) => walk(root));
  return files
    .filter((name) => /\.(?:ts|tsx|js|mjs)$/u.test(name))
    .filter((name) => name !== SELF)
    .map((name) => {
      const raw = readFileSync(path.join(APPLICATION_ROOT, name), 'utf8');
      const { code, comments } = splitCodeFromComments(raw);
      return { where: name, code, comments, raw };
    });
})();

/**
 * Every source file {@link SHIPPED} and {@link PROSE} already read, named the way GIT names it.
 *
 * The two enumerations use different roots — {@link SOURCE} walks the filesystem from the
 * application and says `src/shell/routes.tsx`, git walks the repository and says
 * `app/src/shell/routes.tsx` — so the same file has two names and a set keyed on one of them
 * cannot see the other. This is the join, and without it every application source file would be
 * read a second time, as raw text, under the LAXER prose rule: the same claim reported twice, and
 * shipped code judged by the rule written for documents.
 */
const READ_AS_SOURCE: ReadonlySet<string> = new Set(
  SOURCE.map((file) => `${APPLICATION_PREFIX}${file.where}`),
);

/**
 * File types whose bytes are not readable words, so that reading them as text produces mojibake
 * rather than prose.
 *
 * THIS IS AN EXCLUSION AND EVERY EXCLUSION IS A HOLE, so it is written as narrowly as the fact
 * supports: a PNG's bytes cannot be read as a sentence. **What it does NOT cover, and this is the
 * hole it leaves: words drawn INSIDE an image.** A screenshot naming Android is invisible to every
 * text scan in this repository and would need an entirely different instrument. The eight tracked
 * `.png` files are the application's own generated icons, which carry no words at all — but that
 * is a fact about today's tree, not a property of this filter.
 *
 * `.svg` is deliberately absent: an SVG is text, it can carry a `<title>` or a `<text>` element a
 * reader meets, and the fifty tracked ones are read.
 */
const NOT_TEXT = /\.(?:png|jpe?g|gif|bmp|webp|ico|icns|woff2?|ttf|otf|eot|zip|gz|pdf|mp[34]|wav)$/u;

/**
 * Is this tracked file part of {@link PROSE}?
 *
 * **THE UNIVERSE IS TRACKED FILES, NOT ONE EXTENSION.** It used to be `.md`, and that was a hole
 * rather than a scope: a tracked `.html` sitting outside the application was in NO universe at
 * all, so no search of this repository could find what it said. `design/direction-three/index.html`
 * named Android on line 2443 and every gate reported the tree clean, because THE REPOSITORY IS
 * PUBLIC and a tracked file is publicly readable prose whatever its extension and whatever
 * directory it was authored in.
 *
 * The four exclusions, and each is stated as a reason rather than a preference:
 *
 *   - **{@link SELF}** — the file that defines the prohibition necessarily writes it down.
 *   - **`_spike-evidence/`** — quotes the coach's REAL Drive and calendar identifiers; the root
 *     `.gitignore` says in terms that it must never be read into a test.
 *   - **{@link NOT_TEXT}** — bytes that are not words. See the hole named there.
 *   - **ALREADY IN A UNIVERSE** — the built artefact under `dist` is {@link ARTEFACT}, read WHOLE
 *     and under a STRICTER rule with no governance escape; the application's own source is
 *     {@link SHIPPED} plus its comments. Neither is skipped. Re-reading either here would judge it
 *     by the laxer prose rule as well, and report anything it found twice.
 */
function isProse(name: string): boolean {
  if (name === SELF_FROM_REPOSITORY) return false;
  if (name.startsWith('_spike-evidence/')) return false;
  if (NOT_TEXT.test(name)) return false;
  if (name.startsWith(`${APPLICATION_PREFIX}${OUTPUT_DIRECTORY}/`)) return false;
  return !READ_AS_SOURCE.has(name);
}

/**
 * Is this file one whose strings can become the artefact?
 *
 * Tests and the proof harness are not: `harness-does-not-ship.test.ts` proves the proof directory
 * reaches no published byte, and a `*.test.*` file is not an input to the bundler. They are not
 * exempt — they are ROUTED to {@link PROSE}, where a sentence about a prohibition is expected.
 */
function isShipped(where: string): boolean {
  return !/\.test\.(?:ts|tsx|js|mjs)$/u.test(where)
    && !where.startsWith('src/proof/')
    && !where.startsWith('tools/');
}

/**
 * THE SENTENCES THIS APPLICATION IS ALLOWED TO SAY THE FORBIDDEN WORDS IN, AND THE ONLY ONES.
 *
 * The app must be able to tell the coach what it does NOT claim — "This app has not been audited
 * or certified against any standard, by anyone, and it makes no such claim" is the most correct
 * sentence in the Setup screen, and a shipped-text rule with no way through would red on it and
 * then be relaxed until it caught nothing.
 *
 * The way through is DECLARED DATA, read here from the module that owns it, and never a file-path
 * allowlist: a path stops discriminating the moment the sentence moves to another file, and it
 * exempts everything else in that file for ever. A denial declared as data moves with the
 * sentence, and it is held to being an actual denial by {@link THE_DECLARED_DENIALS_REALLY_DENY} —
 * which runs each one through the SAME use-versus-mention discriminator the repository's prose
 * goes through. There is one discriminator in this file, not two.
 */
const DECLARED_DENIALS: readonly string[] = Object.freeze([...DISCLAIMERS]);

/**
 * The same text with the declared denials taken out, so what remains is what the application says
 * on its own account. Used by every universe whose rule is the shipped-text rule — the source, the
 * artefact and the painted screens — because a denial is one sentence and it reaches all three.
 */
function asPainted(text: string): string {
  let out = text;
  for (const denial of DECLARED_DENIALS) out = out.split(denial).join(' [declared denial] ');
  return out;
}

/**
 * A source file's code as the words it actually SAYS.
 *
 * Adjacent string literals joined by `+` are one sentence to the coach and two tokens to a
 * scanner, and this application wraps nearly every sentence it ships across two or three of them.
 * Without this, a claim written across a line break evades the whole gate — and it would be the
 * most natural way to write it, not a clever evasion. See the fixture in
 * {@link A_CLAIM_SPLIT_ACROSS_A_CONCATENATION}.
 */
function asSaid(code: string): string {
  return code.replace(/(['"`])\s*\+\s*(['"`])/gu, '');
}

/** **U2 — THE APPLICATION'S OWN CODE.** Comments removed; these are the strings that ship. */
const SHIPPED: readonly Read[] = SOURCE
  .filter((file) => isShipped(file.where))
  .map((file) => {
    let text = asSaid(file.code);
    for (const denial of DECLARED_DENIALS) text = text.split(denial).join(' [declared denial] ');
    return { where: file.where, text };
  });

/**
 * **U4 — THE PAINTED WORDS.** Every screen the shipped route table carries, rendered and stripped
 * to what a person actually reads.
 *
 * NOT A FOURTH COPY OF THE SAME SCAN, AND NOT OPTIONAL. {@link SHIPPED} reads the literals a source
 * file contains; a screen is not a source file. Its copy is composed at render time out of several
 * modules, and this build has already measured what a namespace-shaped guard does with that: a
 * sweep walking ONE module's exports stayed green while a sentence from a second module sat on the
 * screen. A claim assembled from two variables in two files exists in neither of them, and
 * {@link asSaid} — which joins ADJACENT literals — cannot see it either. It exists only here.
 *
 * The rule is the ARTEFACT'S rule with no governance at all, for the artefact's reason: this is
 * text on a screen, and the coach does not read the sentence it sits in looking for the negation
 * that would have made it acceptable in a design document.
 */
let paintedScreens: Promise<readonly PaintedScreen[]> | null = null;
const RENDERED = (): Promise<readonly PaintedScreen[]> => {
  paintedScreens ??= paintEveryScreen();
  return paintedScreens;
};

/**
 * The repository's tracked documents, from git — EVERY TRACKED FILE, not one extension.
 *
 * Git is the right authority for what "the repository" means because it derives the exclusions
 * instead of hand-maintaining them — and two of those exclusions matter. `/spike/` is a discarded
 * throwaway. `/_spike-evidence/` quotes the coach's REAL Drive identifiers, calendar identifiers
 * and signed-in account, and the root `.gitignore` says so in terms: it must never be read into a
 * test, and no failure message may quote a line from it.
 *
 * What is IN is decided by {@link isProse}, which is where the reason for each exclusion is
 * written. A repository this gate cannot enumerate is a BLOCKED state, not a clean one, so the
 * empty answer is caught by the floors below rather than passing.
 */
function trackedDocuments(): string[] {
  try {
    const listing = execFileSync('git', ['-C', REPOSITORY_ROOT, 'ls-files', '-z'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return listing.split('\0').filter((name) => name !== '' && isProse(name));
  } catch {
    return [];
  }
}

/**
 * **U3 — THE REPOSITORY'S PROSE.** Every tracked document, every comment in the application, and
 * every test in full. Together with {@link SHIPPED} this is a PARTITION of every source byte:
 * a shipped file contributes its code to U2 and its comments to U3; anything else contributes all
 * of itself to U3. Nothing is dropped, and {@link THE_UNIVERSES_ARE_A_PARTITION} asserts it.
 */
const PROSE: readonly Sentence[] = (() => {
  const sentences: Sentence[] = [];
  for (const name of trackedDocuments()) {
    const full = path.join(REPOSITORY_ROOT, name);
    // A tracked file can be deleted on disk; reading one would be an error, not a finding.
    if (!existsSync(full) || !statSync(full).isFile()) continue;
    // A document wraps: every line is prose and a sentence runs across the line breaks.
    sentences.push(...sentencesOf(name, readFileSync(full, 'utf8'), true));
  }
  for (const file of SOURCE) {
    const text = isShipped(file.where) ? file.comments : file.raw;
    sentences.push(...sentencesOf(file.where, text, false));
  }
  return sentences;
})();

/** The lines each source file's visible markers exempt, keyed the way a finding names them. */
const EXEMPT_LINES: ReadonlyMap<string, ReadonlySet<number>> = new Map(
  SOURCE.map((file) => [file.where, exemptLinesOf(file.raw)]),
);

/** Every claim this repository's prose makes, with the visible in-place exemptions honoured. */
function claimsInThisRepository(): Finding[] {
  return claimsMadeInProse(
    PROSE,
    (where, line) => EXEMPT_LINES.get(where)?.has(line) ?? false,
  );
}

/** The document count, kept separate so the floor names documents rather than sentences. */
const TRACKED_DOCUMENTS = trackedDocuments();

// ═══════════════════════════════════════════════════════════════════════════════
// The controls — every universe proved reachable before any absence is believed
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A sentence known to be in the shipped bundle, taken from `CALENDAR_NOTICE` in
 * `src/platform/google-meet.ts`. Measured at byte 683877 of `dist/assets/index-C3ZM1tyk.js`.
 */
const IN_THE_BUNDLE = 'then paste its id into setup';

describe('the scan reaches what it says it scans', () => {
  it('THE BUNDLE IS ONE ENORMOUS LINE, which is why nothing here is line-oriented', () => {
    const bundles = ARTEFACT.filter((file) => /^dist\/assets\/.*\.js$/u.test(file.where));
    assert.ok(bundles.length > 0, 'no bundled script is on disk, so the artefact scan reads nothing');
    for (const bundle of bundles) {
      const longest = Math.max(...bundle.text.split('\n').map((line) => line.length));
      assert.ok(
        longest > 100_000,
        `${bundle.where}'s longest line is ${longest} characters. The hazard this file is built `
        + 'around may have gone away — read the header before relaxing anything, because a '
        + 'line-oriented matcher over a one-line megabyte is a silent false green.',
      );
    }
  });

  it('found the artefact, and a sentence PROVEN to be inside that one line', () => {
    assert.ok(ARTEFACT.length > 3, `only ${ARTEFACT.length} artefact files were read`);
    const bytes = ARTEFACT.reduce((total, file) => total + file.text.length, 0);
    assert.ok(bytes > 100_000, `the artefact read as ${bytes} bytes, which is not a published site`);
    const carrying = ARTEFACT.filter((file) => file.text.toLowerCase().includes(IN_THE_BUNDLE));
    assert.ok(
      carrying.length > 0,
      `THE SCANNER DID NOT REACH THE BUNDLE. A sentence this application demonstrably ships — `
      + `"${IN_THE_BUNDLE}" — was not found in any of the ${ARTEFACT.length} artefact files read. `
      + 'This says the scan is broken, NOT that the artefact is clean: every absence asserted '
      + 'against the artefact below is worthless until this passes.',
    );
  });

  it('found the application code, and the same sentence in the source it was built from', () => {
    assert.ok(SHIPPED.length > 100, `only ${SHIPPED.length} shipped source files were read`);
    const carrying = SHIPPED.filter((file) => file.text.toLowerCase().includes(IN_THE_BUNDLE));
    assert.ok(carrying.length > 0, 'the shipped-source scan did not reach google-meet.ts');
  });

  it('found the repository’s documents, from git rather than from a typed list', () => {
    assert.ok(
      TRACKED_DOCUMENTS.length >= 100,
      `git named only ${TRACKED_DOCUMENTS.length} tracked documents. If git is unavailable this `
      + 'is zero, and a prose scan over nothing passes for free — which is why it fails here. The '
      + 'floor is ABOVE the 21 tracked `.md` files on purpose: a floor of fifteen would have been '
      + 'satisfied by the `.md`-only universe this scan used to have, so it could not have told '
      + 'the widening from its own reversal.',
    );
    assert.ok(
      TRACKED_DOCUMENTS.includes('app/core/crypto/CRYPTO.md'),
      'the document that most densely explains this prohibition is not in the scanned set',
    );

    /**
     * NON-VACUITY FOR THE WIDENED UNIVERSE, and it is the whole point of the widening.
     *
     * The universe used to be `git ls-files` FILTERED TO `.md`, plus the application's own source.
     * A tracked `.html` outside the application was therefore in NO universe at all, and
     * `design/direction-three/index.html` named Android for as long as that was true while every
     * gate reported the tree clean. Nobody's search was wrong; the search had nowhere to look.
     *
     * So it is not enough that the count went up: the scan must be shown to hold sentences from a
     * file that is NEITHER `.md` NOR under the application. A control string is read out of one of
     * them, the same way {@link IN_THE_BUNDLE} is read out of the bundle — if that string stops
     * being found, this says the reach was lost rather than that the territory is clean.
     */
    const beyond = TRACKED_DOCUMENTS.filter(
      (name) => !name.endsWith('.md') && !name.startsWith(APPLICATION_PREFIX),
    );
    assert.ok(
      beyond.length >= 40,
      `only ${beyond.length} tracked files outside the application and outside \`.md\` are in the `
      + 'prose universe. This scan exists to see them; a low count here is the hole reopening.',
    );
    const OUTSIDE_THE_APPLICATION = 'design/direction-three/index.html';
    assert.ok(
      beyond.includes(OUTSIDE_THE_APPLICATION),
      `${OUTSIDE_THE_APPLICATION} is tracked and is not in the prose universe. It is the file `
      + 'whose Android reference survived every gate in this repository, and it survived because '
      + 'of WHERE THE SCAN LOOKED.',
    );
    const CONTROL = 'mark-sample__label';
    assert.ok(
      PROSE.some((sentence) => sentence.where === OUTSIDE_THE_APPLICATION
        && sentence.text.includes(CONTROL)),
      `THE SCAN DID NOT REACH ${OUTSIDE_THE_APPLICATION}. "${CONTROL}" is written in it many `
      + 'times over, and no sentence carrying it reached the prose universe — so every absence '
      + 'asserted below about tracked files outside the application means nothing at all.',
    );
    assert.ok(
      TRACKED_DOCUMENTS.every((name) => !name.startsWith('_spike-evidence/')),
      'the preserved spike evidence is in scope. It quotes the coach’s real Drive and calendar '
      + 'identifiers and must never be read into a test.',
    );
    assert.ok(PROSE.length > 5_000, `the prose scan holds only ${PROSE.length} sentences`);
  });

  it('THE UNIVERSES ARE A PARTITION — no source byte is unscanned, and lines still line up', () => {
    for (const file of SOURCE) {
      // Both halves are position-preserving, so this is an equality rather than an estimate — and
      // it is what lets a finding name a line number a person can actually open.
      assert.equal(
        file.code.length,
        file.raw.length,
        `${file.where}: the code half no longer lines up with the source, so every line number `
        + 'this gate reports for it is wrong.',
      );
      assert.equal(file.comments.length, file.raw.length, `${file.where}: the comment half slipped`);
    }
    const shipped = SOURCE.filter((file) => isShipped(file.where)).length;
    const prose = SOURCE.length - shipped;
    assert.ok(shipped > 100 && prose > 50, `routing looks wrong: ${shipped} shipped, ${prose} prose`);
  });

  it('and the ONE exemption is exactly one file, which is present and substantial', () => {
    const exempt = SOURCE.filter((file) => file.where === SELF);
    assert.deepEqual(exempt, [], 'the exempt file is being scanned after all');
    const self = path.join(APPLICATION_ROOT, SELF);
    assert.ok(existsSync(self), 'the exempt file does not exist, so the exemption hides nothing');
    assert.ok(
      readFileSync(self, 'utf8').length > 5_000,
      'the exempt file has been emptied. Its exemption is paid for by the fixtures inside it; '
      + 'without them this gate is unexercised and exempt at the same time.',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Every pattern can fire, and none is greedy
// ═══════════════════════════════════════════════════════════════════════════════

describe('EVERY PATTERN CAN FIRE — a typo would report this repository clean for ever', () => {
  for (const claim of CLAIMS) {
    it(`catches ${claim.what}`, () => {
      assert.ok(claim.fires.length > 0, `${claim.id} carries no fixture, so it proves nothing`);
      for (const planted of claim.fires) {
        assert.match(
          planted,
          claim.pattern,
          `${claim.id} does not match "${planted}", so its silence over the whole repository `
          + 'means nothing at all',
        );
      }
    });

    it(`and does not fire on what this tree legitimately says — ${claim.id}`, () => {
      for (const innocent of claim.quiet) {
        assert.doesNotMatch(
          innocent,
          claim.pattern,
          `${claim.id} fires on "${innocent}", which this repository really says. A pattern that `
          + 'reds on honest prose gets narrowed by whoever meets it until it matches nothing.',
        );
      }
    });
  }

  it('CERTIFICATION IS ABOUT THE SOFTWARE, NEVER ABOUT THE COACH — driven both ways', () => {
    const pattern = CLAIMS.find((claim) => claim.id === 'certification-of-the-software')?.pattern;
    assert.ok(pattern !== undefined);
    // The carve-out is a claim about a PERSON, and it is load-bearing: it occurs across this tree.
    assert.doesNotMatch('he is a certified professional', pattern);
    assert.doesNotMatch('that judgement belongs to the certified coach', pattern);
    // And it does not swallow the claim it exists beside.
    assert.match('this application is certified', pattern);
    assert.match('the export has been audited', pattern);
    const aboutTheCoach = PROSE.filter((sentence) =>
      /certified (?:professional|coach)/iu.test(sentence.text));
    assert.ok(
      aboutTheCoach.length >= 5,
      `only ${aboutTheCoach.length} sentences in this tree say "certified professional" or `
      + '"certified coach". The carve-out was measured against roughly fifteen; if it is now '
      + 'carrying nothing, delete it rather than leaving an unexercised hole in the pattern.',
    );
  });

  it('the emoji check matches an emoji, and not ordinary punctuation', () => {
    assert.match('all set \u{1F44D}', EMOJI);
    assert.match('done \u{1F389}', EMOJI);
    assert.doesNotMatch('a plain sentence, with punctuation - and a dash.', EMOJI);
  });

  it('the Android check matches the word wherever it sits', () => {
    assert.match('also on Android', ANDROID_ANYWHERE);
    assert.doesNotMatch('also on iOS', ANDROID_ANYWHERE);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The discriminator, driven in both directions on REAL sentences from this tree
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The forbidden claims SAID, each of which the discriminator must read as a claim.
 *
 * At module scope rather than inside the suite below, because these are PLANTS and every plant in
 * this file is held to being invented — see {@link PLANTS} and the suite that enforces it.
 */
const CLAIMS_SAID: readonly string[] = Object.freeze([
  'This application is HIPAA compliant.',
  'The archive is certified against the standard.',
  'Your notes are end-to-end encrypted.',
  'Your data is safe.',
  'Everything is completely secure.',
  'Android support is coming.',
  // ORDER IS LOAD-BEARING: a negation arriving AFTER the claim does not govern it.
  'The archive is encrypted end to end, so it is not readable by Google.',
]);

describe('the discriminator tells a claim MADE from a claim FORBIDDEN', () => {
  /** Sentences this repository really carries, every one of which must stay green. */
  const MENTIONED: readonly string[] = Object.freeze([
    'It contains no compliance claim of any kind, and none may be added.',
    'Nothing here is certified, approved, or audited against any regime.',
    'Nothing in this directory is certified, approved or audited against any regime, and no '
    + 'compliance claim may be added to it.',
    'No compliance claim of any kind. Not HIPAA, not GDPR, not the DPDP Act.',
    'Nothing here claims compliance with anything.',
    'No emoji in any user-facing string, and nothing anywhere may claim certification, '
    + 'compliance or endorsement.',
    'an accountability surface that already tells the coach whether his data is safe',
    'The dangerous reading is that an empty queue means everything is safe.',
    'REFUSES AN EMPTY PRACTICE rather than handing him a file that says everything is safe',
    'This app has not been audited or certified against any standard, by anyone, and it makes '
    + 'no such claim.',
    'Nobody has certified it and we cannot source that claim, so we do not make it.',
    'Android behaviour is untested for all of it.',
    'No claim in this document is an Android claim.',
  ]);

  /** The same claims, said. Every one must go red, or the rule above is an ignore list. */
  const MADE = CLAIMS_SAID;

  it('lets every real prohibition in this repository through', () => {
    for (const text of MENTIONED) {
      const found = claimsMadeInProse(sentencesOf('fixture', text, true));
      assert.deepEqual(
        found.map((finding) => finding.claim),
        [],
        `a sentence this repository really carries was read as a CLAIM: ${text}`,
      );
    }
  });

  it('and catches every one of them SAID — including a negation that arrives too late', () => {
    for (const text of MADE) {
      const found = claimsMadeInProse(sentencesOf('fixture', text, true));
      assert.ok(
        found.length > 0,
        `THE DISCRIMINATOR IS AN IGNORE LIST: it read a claim as a mention: ${text}`,
      );
    }
  });

  it('and the governor must PRECEDE the phrase, which is the whole of the ordering rule', () => {
    assert.equal(isMentionedNotMade('nothing here is certified', 0, 'nothing here is '.length), true);
    assert.equal(isMentionedNotMade('this is certified, it is not audited', 5, 'is certified'.length), false);
  });

  it('THE DECLARED DENIALS REALLY DENY — the one way through shipped text, held to the same rule', () => {
    assert.ok(
      DECLARED_DENIALS.length > 0,
      'no denial is declared anywhere, so the way through shipped text exempts nothing and the '
      + 'application has no way to tell the coach what it does NOT claim',
    );
    for (const denial of DECLARED_DENIALS) {
      assert.ok(denial.trim().length > 0, 'a declared denial resolved to nothing, which would strip nothing');
      const named = CLAIMS.filter((claim) => claim.pattern.test(denial.toLowerCase()));
      assert.ok(
        named.length > 0,
        `a declared denial names no forbidden claim, so it denies nothing: ${denial}`,
      );
      for (const claim of named) {
        const match = claim.pattern.exec(denial.toLowerCase());
        assert.ok(match !== null);
        assert.ok(
          isMentionedNotMade(denial, match.index, match[0].length),
          `a DECLARED DENIAL fails the same discriminator this repository’s prose passes, which `
          + `means it MAKES the claim rather than denying it: ${denial}`,
        );
      }
    }
  });

  it('A CLAIM SPLIT ACROSS A CONCATENATION is still read as one sentence', () => {
    // This application wraps nearly every shipped sentence across two or three literals, so this
    // is the natural way to write a claim rather than a clever way to hide one.
    const split = "'Your data is '\n      + 'safe.'";
    const assurance = CLAIMS.find((claim) => claim.id === 'the-data-is-safe')?.pattern;
    assert.ok(assurance !== undefined);
    assert.doesNotMatch(split.toLowerCase(), assurance, 'the fixture is not actually split');
    assert.match(
      asSaid(split).toLowerCase(),
      assurance,
      'a claim written across a line break evades the whole shipped-text scan',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The gate itself
// ═══════════════════════════════════════════════════════════════════════════════

describe('THE PUBLISHED ARTEFACT MAKES NO FORBIDDEN CLAIM', () => {
  /**
   * THE DECLARED DENIALS REACH THE BUNDLE TOO, AND THEY MUST.
   *
   * The moment the Setup screen was mounted, "This app has not been audited or certified against
   * any standard, by anyone, and it makes no such claim" started shipping — which is the whole
   * point of it. The artefact rule is the same as the shipped-code rule for the same reason and
   * through the same declared data: the app may say what it does NOT claim, and nothing else.
   */
  const asPublished = (text: string): string => {
    let out = text;
    for (const denial of DECLARED_DENIALS) out = out.split(denial).join(' [declared denial] ');
    return out;
  };

  it('claims no compliance, certification, end-to-end encryption, or that data is safe', () => {
    const found = ARTEFACT.flatMap((file) => claimsMadeInShippedText(file.where, asPublished(file.text)));
    assert.deepEqual(
      found,
      [],
      'the published bundle carries a claim this application may not make: '
      + found.map((finding) => `${finding.where} [${finding.claim}] ${finding.text}`).join(' | '),
    );
  });

  it('carries no emoji this application authored', () => {
    const found = ARTEFACT
      .map((file) => {
        let text = file.text;
        for (const vendored of VENDORED_EMOJI) text = text.split(vendored.text).join(' ');
        return { where: file.where, text };
      })
      .filter((file) => EMOJI.test(file.text))
      .map((file) => {
        const at = file.text.search(EMOJI);
        return `${file.where}: ${JSON.stringify(file.text.slice(Math.max(0, at - 60), at + 20))}`;
      });
    assert.deepEqual(found, [], `an emoji reached the published artefact, in: ${found.join(' | ')}`);
  });

  it('THE VENDORED EMOJI IS REAL — an exception that outlived its cause is deleted, not kept', () => {
    for (const vendored of VENDORED_EMOJI) {
      assert.match(vendored.text, EMOJI, `a declared vendored string carries no emoji: ${vendored.why}`);
      assert.ok(
        ARTEFACT.some((file) => file.text.includes(vendored.text)),
        `the artefact no longer contains "${vendored.text}". Its exception is now hiding nothing `
        + `and must be deleted rather than carried: ${vendored.why}`,
      );
    }
  });

  it('names Android nowhere at all', () => {
    const found = ARTEFACT.filter((file) => ANDROID_ANYWHERE.test(file.text)).map((f) => f.where);
    assert.deepEqual(
      found,
      [],
      `the published artefact names Android, in: ${found.join(', ')}. iOS is the only target this `
      + 'build has ever tested, and a platform named on screen is a platform claimed.',
    );
  });
});

describe('THE APPLICATION’S OWN USER-FACING STRINGS MAKE NO FORBIDDEN CLAIM', () => {
  it('claim no compliance, certification, end-to-end encryption, or that data is safe', () => {
    const found = SHIPPED.flatMap((file) => claimsMadeInShippedText(file.where, file.text));
    assert.deepEqual(
      found,
      [],
      'shipped code carries a claim this application may not make: '
      + found.map((finding) => `${finding.where} [${finding.claim}] ${finding.text}`).join(' | '),
    );
  });

  it('carry no emoji', () => {
    const found = SHIPPED.filter((file) => EMOJI.test(file.text)).map((file) => file.where);
    assert.deepEqual(found, [], `an emoji is in shipped code, in: ${found.join(', ')}`);
  });

  it('name Android nowhere', () => {
    const found = SHIPPED.filter((file) => ANDROID_ANYWHERE.test(file.text)).map((f) => f.where);
    assert.deepEqual(found, [], `shipped code names Android, in: ${found.join(', ')}`);
  });
});

describe('THE PAINTED SCREENS MAKE NO FORBIDDEN CLAIM — the words, not the modules', () => {
  /** A sentence this application demonstrably paints, so a scan that reads nothing announces itself. */
  const ON_A_SCREEN = 'not checked yet';

  it('THE RENDER REACHES REAL SCREENS — every absence below is worthless without this', async () => {
    const screens = await RENDERED();
    assert.ok(
      screens.length >= 10,
      `only ${screens.length} screens were painted. The addresses are derived from ROUTE_TABLE, so `
      + 'this says the table was not read rather than that the application has ten screens.',
    );
    for (const screen of screens) {
      assert.ok(
        screen.text.length > 200,
        `${screen.where} (${screen.address}) painted ${screen.text.length} characters. A screen `
        + 'that rendered almost nothing satisfies every absence asserted below.',
      );
    }
    const carrying = screens.filter((screen) => screen.text.toLowerCase().includes(ON_A_SCREEN));
    assert.ok(
      carrying.length > 0,
      `THE PAINT SCAN IS BLIND. A sentence this application demonstrably shows — "${ON_A_SCREEN}" — `
      + `is on none of the ${screens.length} screens painted. This says the render or the stripper `
      + 'is broken, NOT that the screens are clean.',
    );
  });

  it('and the SAME pipeline catches a claim when one is really painted', async () => {
    // THE PROBE IS THE WHOLE PIPELINE, not the pattern on its own: markup in, painted words out,
    // claim found. A stripper that ate the sentences with the tags would leave every assertion
    // below passing over an empty string. The fixture is invented here and, like every other plant
    // in this file, is held to being absent from the repository by THE PLANTS ARE SYNTHETIC.
    const planted = '<div class="card"><p>Rest easy: <span>his records themselves are '
      + 'protected</span> on this handset.</p></div>';
    const found = claimsMadeInShippedText('a painted fixture', painted(planted));
    assert.deepEqual(
      found.map((finding) => finding.claim),
      ['the-data-is-safe'],
      'the claim scan cannot find a forbidden claim painted in front of it, spread across tags the '
      + 'way the real screens spread one, so its silence about the real screens means nothing',
    );
    assert.ok(
      !painted('<p data-claim="his records themselves are protected">Not checked yet.</p>')
        .includes('his records themselves are protected'),
      'the stripper reads attributes as words on the screen, so it would red on markup no person '
      + 'can read',
    );
  });

  it('claim no compliance, certification, end-to-end encryption, or that data is safe', async () => {
    const found = (await RENDERED())
      .flatMap((screen) => claimsMadeInShippedText(`${screen.where} (${screen.address})`, asPainted(screen.text)));
    assert.deepEqual(
      found,
      [],
      'a screen this application paints carries a claim it may not make: '
      + found.map((finding) => `${finding.where} [${finding.claim}] ${finding.text}`).join(' | '),
    );
  });

  it('carry no emoji', async () => {
    const found = (await RENDERED())
      .filter((screen) => EMOJI.test(screen.text))
      .map((screen) => {
        const at = screen.text.search(EMOJI);
        return `${screen.where}: ${JSON.stringify(screen.text.slice(Math.max(0, at - 60), at + 20))}`;
      });
    assert.deepEqual(found, [], `an emoji is painted on a screen, in: ${found.join(' | ')}`);
  });

  it('name Android nowhere, not as supported and not as pending', async () => {
    const found = (await RENDERED())
      .filter((screen) => ANDROID_ANYWHERE.test(screen.text))
      .map((screen) => `${screen.where} (${screen.address})`);
    assert.deepEqual(
      found,
      [],
      `a painted screen names Android, in: ${found.join(', ')}. iOS is the only target this build `
      + 'has ever tested, and a platform named on screen is a platform claimed.',
    );
  });
});

describe('THE REPOSITORY’S OWN DOCUMENTS AND COMMENTS MAKE NO FORBIDDEN CLAIM', () => {
  it('every occurrence is a prohibition being stated, never a claim being made', () => {
    const found = claimsInThisRepository();
    assert.deepEqual(
      found,
      [],
      'prose in this repository MAKES a claim rather than forbidding one: '
      + found.map((finding) => `${finding.where} [${finding.claim}] "${finding.text}"`).join(' | '),
    );
  });

  it('and makes no Android claim, not as supported and not as pending', () => {
    const found = PROSE
      .filter((sentence) => !(EXEMPT_LINES.get(sentence.where)?.has(sentence.line) ?? false))
      .flatMap((sentence) => {
        const android = CLAIMS.find((claim) => claim.id === 'android-support');
        assert.ok(android !== undefined);
        const match = android.pattern.exec(sentence.text.toLowerCase());
        if (match === null) return [];
        if (isMentionedNotMade(sentence.text, match.index, match[0].length)) return [];
        return [`${sentence.where}: ${sentence.text.slice(0, 160)}`];
      });
    assert.deepEqual(found, [], `an Android claim is in this repository: ${found.join(' | ')}`);
  });

  /**
   * AND NAMES ANDROID NOWHERE AT ALL, unless one of the four ruled-on families is doing the work.
   *
   * The rule above wants a claim VERB. This one does not, and that difference is the whole of
   * s11/a25's second fix: with the universe widened the gate looked straight at
   * `192 - Android home screen` and still passed, because a bare platform naming carries no verb.
   * A reader of a public repository does not parse for claim verbs.
   *
   * Everything about this test is paired, because an allow-list is a hole with a nice name:
   * the naming must be recognised, the recognisers must still be alive, and they must be proven
   * unable to swallow the shape they were written around.
   */
  it('and names Android nowhere the four ruled-on families are not doing the work', () => {
    // NON-VACUITY, FIRST, so that a recogniser widened until it allows everything says so here
    // rather than by reporting the repository clean.
    for (const naming of A_BARE_PLATFORM_NAMING) {
      const allowed = ANDROID_IS_MENTIONED_NOT_CLAIMED.filter((f) => f.recognise.test(naming));
      assert.deepEqual(
        allowed.map((f) => f.id),
        [],
        `THE ALLOW-LIST HAS GROWN INTO A LOOPHOLE. "${naming}" is a bare platform naming with no `
        + 'claim verb in it — the exact shape this rule exists to catch — and it is allowed by: '
        + `${allowed.map((f) => f.id).join(', ')}. Every absence asserted below is worthless.`,
      );
      assert.ok(ANDROID_ANYWHERE.test(naming), 'the fixture no longer names Android');
    }

    const naming = PROSE
      .filter((sentence) => !(EXEMPT_LINES.get(sentence.where)?.has(sentence.line) ?? false))
      .filter((sentence) => ANDROID_ANYWHERE.test(sentence.text));

    const alive = new Set<string>();
    const unallowed: string[] = [];
    for (const sentence of naming) {
      const lowered = sentence.text.toLowerCase();
      const family = ANDROID_IS_MENTIONED_NOT_CLAIMED.find((f) => f.recognise.test(lowered));
      if (family === undefined) {
        unallowed.push(`${sentence.where}:${sentence.line}: ${sentence.text.slice(0, 160)}`);
        continue;
      }
      alive.add(family.id);
    }

    assert.deepEqual(
      unallowed,
      [],
      'THIS REPOSITORY NAMES ANDROID, and not in any of the four ways that were ruled on. iOS is '
      + 'the only tested target and there is to be no Android reference anywhere, not even as '
      + 'pending — and the repository is PUBLIC, so a tracked file is publicly readable prose '
      + `whatever its extension. Found: ${unallowed.join(' | ')}`,
    );

    // A STALE ENTRY IS A STANDING PERMISSION NOBODY IS WATCHING. An allow-list that outlives what
    // it was written for is a snapshot-pinned guard, and this is what stops that quietly.
    const stale = ANDROID_IS_MENTIONED_NOT_CLAIMED
      .filter((family) => !alive.has(family.id))
      .map((family) => family.id);
    assert.deepEqual(
      stale,
      [],
      `an entry in the Android allow-list matches nothing in this repository any more: `
      + `${stale.join(', ')}. It was written for an occurrence that has since gone, so it is now `
      + 'a permission with nothing to permit and nobody watching it. DELETE IT rather than '
      + 'leaving it — that is what keeps this list from turning into the loophole it qualifies. '
      + `Scanned ${naming.length} sentences naming Android across ${TRACKED_DOCUMENTS.length} `
      + 'tracked files plus the application’s own comments and tests.',
    );
  });

  /**
   * THE WIDENING, DRIVEN IN BOTH DIRECTIONS.
   *
   * A guard that reds on an honest disclaimer makes DELETING THE DISCLOSURE the cheapest move
   * available, and that is not a hypothetical here: this repository's own disclosure document was
   * reworded twice to get past this rule, once as far as naming the platform BY DESCRIPTION
   * INSTEAD OF BY NAME. So the honest shapes must pass — and the moment they do, the only thing
   * standing between a wider window and a hole is the other direction, which is why both halves
   * are in one test and neither can be read without the other.
   */
  it('THE HONEST DISCLAIMER PASSES AND THE REAL CLAIM STILL FAILS — the widening, both ways', () => {
    for (const denial of AN_HONEST_DENIAL) {
      const allowed = ANDROID_IS_MENTIONED_NOT_CLAIMED
        .filter((family) => family.recognise.test(denial.text.toLowerCase()));
      assert.ok(
        allowed.length > 0,
        `THE GATE REDS ON AN HONEST DISCLAIMER (${denial.id}): "${denial.text}". A rule that reds `
        + 'on the plainest way of saying a platform was never tested makes deleting the '
        + 'disclosure the path of least resistance, and the next author meets the red rather than '
        + 'the reasoning.',
      );

      // FIXTURE VALIDITY, and it reads the DISTANCE rather than the verdict: a fixture that
      // drifted into having its denial adjacent would pass the assertion above under the old
      // eighty-character window too, and would therefore prove nothing about the widening.
      const lowered = denial.text.toLowerCase();
      const at = lowered.indexOf('android');
      const gap = Math.min(
        ...['never tested', 'not tested', 'untested', 'no claim']
          .map((word) => lowered.indexOf(word, at))
          .filter((index) => index > at)
          .map((index) => index - at - 'android'.length),
      );
      assert.equal(
        gap > 80,
        denial.farApart,
        `${denial.id} declares farApart=${denial.farApart} but its denial sits ${gap} characters `
        + 'from its naming. The fixture has drifted and no longer exercises what it names.',
      );
    }

    for (const claim of AN_ANDROID_SUPPORT_CLAIM) {
      const allowed = ANDROID_IS_MENTIONED_NOT_CLAIMED
        .filter((family) => family.recognise.test(claim.toLowerCase()));
      assert.deepEqual(
        allowed.map((family) => family.id),
        [],
        `THE WINDOW WAS WIDENED INTO A HOLE. "${claim}" CLAIMS the platform and is allowed by: `
        + `${allowed.map((family) => family.id).join(', ')}. Reaching an honest denial across a `
        + 'sentence boundary and across a table cell must not also reach a sentence that makes '
        + 'the claim — the vocabulary is enumerated for exactly this reason.',
      );
      assert.ok(ANDROID_ANYWHERE.test(claim), 'the fixture no longer names Android');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The exemptions are visible, and they cannot grow quietly
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// The plants are invented, not borrowed
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * EVERY PLANT IN THIS FILE, and a plant is any string asserted to MATCH a pattern.
 *
 * Kept as one derived list rather than maintained beside the fixtures, so a plant added to a
 * `fires` array in six months is covered without anybody remembering this rule exists.
 */
const PLANTS: readonly string[] = Object.freeze([
  ...CLAIMS.flatMap((claim) => claim.fires),
  ...CLAIMS_SAID,
  // The two written inline: the split-concatenation fixture and the painted-markup fixture.
  'Your data is safe.',
  'his records themselves are protected',
]);

describe('THE PLANTS ARE SYNTHETIC — a plant copied out of the tree proves nothing', () => {
  /**
   * The failure this exists to refuse, and it is subtler than a weak fixture.
   *
   * A plant lifted verbatim out of the repository reads as the STRONGEST possible fixture — a real
   * sentence, from the real application, caught red-handed — while quietly proving the opposite of
   * what it looks like: the one place in the suite where the offender appears is now the place that
   * declares it a fault and moves on. The sweep is then aimed AWAY from the thing it came from, and
   * whoever reads the fixture list reads reassurance.
   *
   * MEASURED HERE, 2026-07-31: three plants were not invented. "endorsed by NASM" was
   * `seed/validate_seed.py`'s own break fixture; "everything is safe" is written in
   * `core/status/levels.test.js` as the dangerous reading of an empty queue; and "the notes
   * themselves are safe" was THE SENTENCE THAT SHIPPED, recounted in
   * `screens/key-material-condition.test.ts`'s account of the fix. None was aimed away from a live
   * offender — the shipped sentence is gone and is now held by its meaning — but a rule that
   * depends on nobody making that mistake is not a rule. This is.
   */
  it('is not written down anywhere else in this repository, in source, prose or the artefact', () => {
    /**
     * Every file the repository ACTUALLY HOLDS, tracked or not, read WHOLE — the bundle is one
     * enormous line and this must not miss it.
     *
     * `--cached --others --exclude-standard` rather than plain `ls-files`, and the difference is
     * measured rather than tidy: this repository was ~110 files behind its own on-disk state, and
     * THIS FILE WAS ONE OF THE UNTRACKED ONES. A sweep whose universe is the tracked set was
     * therefore structurally blind to itself, and s11/r1 found it hiding THREE borrowed plants in
     * the one suite whose job is to refuse them. `--exclude-standard` keeps `.gitignore` honoured,
     * so `node_modules` and the like stay out.
     *
     * This does NOT replace s12's re-run of the prose gate after the commit. Tracked-ness is only
     * one of the things a commit changes; two guards at two moments. What the widening buys is
     * that a borrowed plant cannot land between now and that re-run.
     */
    const searched: { where: string; lower: string }[] = [];
    let listing: string[] = [];
    try {
      listing = execFileSync('git', ['-C', REPOSITORY_ROOT, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      }).split('\0').filter((name) => name !== '');
    } catch {
      listing = [];
    }
    for (const name of listing) {
      // `_spike-evidence/` quotes the coach's real Drive and calendar identifiers. It is never read
      // into a test and no failure here may quote a line from it.
      if (name.startsWith('_spike-evidence/') || name === SELF_FROM_REPOSITORY) continue;
      const full = path.join(REPOSITORY_ROOT, name);
      if (!existsSync(full) || !statSync(full).isFile()) continue;
      // Binary files are not prose; a plant is a sentence and cannot be hiding in an icon.
      if (/\.(?:png|jpe?g|gif|ico|woff2?|ttf|zip)$/u.test(name)) continue;
      searched.push({ where: name, lower: readFileSync(full, 'utf8').toLowerCase() });
    }
    // ...and the artefact ON DISK, which is a different file from the committed one.
    for (const file of ARTEFACT) searched.push({ where: file.where, lower: file.text.toLowerCase() });

    // NON-VACUITY. A `git ls-files` that failed, or a walk that read nothing, would report every
    // plant synthetic for free — which is this file's own favourite failure, turned on itself.
    assert.ok(
      searched.length > 300,
      `only ${searched.length} files were read, so "this plant is nowhere" is an answer about an `
      + 'empty search rather than about the repository',
    );
    const control = 'not checked yet';
    assert.ok(
      searched.some((file) => file.lower.includes(control)),
      `the search cannot find "${control}", a sentence this repository demonstrably contains, so `
      + 'its silence about every plant below means nothing at all',
    );

    const borrowed = PLANTS.flatMap((plant) => {
      const hits = searched.filter((file) => file.lower.includes(plant.toLowerCase()));
      return hits.length === 0 ? [] : [`"${plant}" is already in ${hits.map((f) => f.where).slice(0, 4).join(', ')}`];
    });
    assert.deepEqual(
      borrowed,
      [],
      'A PLANT IN THIS FILE WAS COPIED OUT OF THE TREE RATHER THAN INVENTED. Before changing '
      + 'anything, ask why the tree contains it: if that occurrence is a live claim, the plant is '
      + 'pointing the sweep away from the very sentence it was taken from. If it is honest prose, '
      + `invent a different plant — the fixture must be yours. Found: ${borrowed.join('; ')}`,
    );
  });
});

describe('the in-place exemptions are visible and cannot grow', () => {
  /**
   * Every site carrying {@link FIXTURE_MARKER}, pinned.
   *
   * An exemption nobody can see is how this gate dies, so the set is not "whatever is out there".
   * Adding one is a deliberate edit here as well as at the site, which is a reviewer's chance to
   * ask why a forbidden claim is being written down.
   */
  const EXPECTED = Object.freeze([
    'src/screens/setup-honesty.test.ts',
    // The Setup surface's own sweep, which walks the module's NAMESPACE rather than its source and
    // so has to hold the words as data. Added deliberately in s10/a4, and it is the same decision
    // as the entry above it rather than a new kind of one.
    'src/screens/setup-surface.test.ts',
  ]);

  const marked = SOURCE.filter((file) => file.raw.includes(FIXTURE_MARKER)).map((f) => f.where);

  it('is exactly the set recorded here', () => {
    assert.deepEqual(
      [...marked].sort(),
      [...EXPECTED].sort(),
      'the visible-exemption set has changed. Every entry is a place this repository writes a '
      + 'forbidden claim down on purpose; a new one is a decision, not a fix.',
    );
  });

  it('and every marker really exempts a claim, with a reason written beside it', () => {
    for (const where of marked) {
      const raw = readFileSync(path.join(APPLICATION_ROOT, where), 'utf8');
      const lines = raw.split('\n');
      const marks = lines
        .map((line, index) => ({ line, index }))
        .filter((entry) => entry.line.includes(FIXTURE_MARKER));
      assert.ok(marks.length > 0);
      for (const mark of marks) {
        // The marker must sit WITH the thing it exempts, within its own reach. A marker whose
        // reach carries no forbidden claim is stale, and a stale marker is how an exemption set
        // turns into a blanket over whatever later moves underneath it.
        const covered = lines.slice(mark.index, mark.index + MARKER_REACH + 1).join('\n');
        const carries = CLAIMS.some((claim) => claim.pattern.test(asSaid(covered).toLowerCase()));
        assert.ok(
          carries,
          `${where}:${mark.index + 1} carries a marker, but no forbidden claim is written in the `
          + `${MARKER_REACH} lines it reaches: ${mark.line.trim()}`,
        );
        const reason = mark.line.slice(mark.line.indexOf(FIXTURE_MARKER) + FIXTURE_MARKER.length);
        assert.ok(
          reason.replace(/[^a-z]/giu, '').length >= 15,
          `${where}:${mark.index + 1} carries a marker with no reason: ${mark.line.trim()}`,
        );
      }
    }
  });
});
