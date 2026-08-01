/**
 * WHAT THE SETUP SENTENCES ACTUALLY SAY — asserted against the code they make claims about.
 *
 * ## Three kinds of assertion, and only the first is about wording
 *
 * 1. **What a sentence says.** The rules that cost the coach data are only worth writing if they
 *    carry their consequence, so the consequence is asserted rather than assumed.
 * 2. **What the sentence claims about the CRYPTOGRAPHY.** Every algorithm name is checked against
 *    `core/crypto/primitives.js` itself — the constants are imported and the source is read — never
 *    against the prose in `setup-honesty.ts`. A file that asserts its own words is a tautology, and
 *    the failure it must catch is precisely the day the cryptography changes and the copy does not.
 * 3. **What the sentence claims about a PLACE.** Naming a destination makes three separable claims:
 *    that it EXISTS, that it is LABELLED as the sentence says, and — where a direction is given —
 *    that the direction is right. Each is asserted against the destination's own source. The module
 *    names a CARD rather than a direction on purpose, so the negative assertions below hold that no
 *    direction has crept in, and a duplication control holds that the destination sentence was not
 *    simply copied into a neighbouring string to satisfy the scan.
 *
 * ## Every absence here is paired with a presence
 *
 * A scan whose entire output is "nothing found" produces the same output when it is broken. So each
 * sweep is run once over the real sentences and once over a PLANTED string that must be caught, and
 * each raw-source absence is paired with a string known to be in that same file.
 *
 * The forbidden-claim sweep here is scoped to THIS module only — deliberately local. The repo-wide
 * gate is a separate action's, and a second general-purpose scanner is exactly the drifting copy
 * this build keeps paying for.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  CONTENT_ALGORITHM,
  DATA_KEY_BITS,
  IV_BYTES,
  KDF_HASH,
  PASSPHRASE_KDF,
  PBKDF2_ITERATIONS,
  WRAP_ALGORITHM,
} from '../../core/crypto/primitives.js';
import { DESTINATIONS } from '../shell/navigation';
import { describeClinicalField } from './clients';
import { KEY_MATERIAL_TITLE } from './key-material-condition';
import * as HONESTY from './setup-honesty';
import {
  ALGORITHM_FACTS,
  DISCLAIMERS,
  EXPECTATIONS,
  HANDOVER_CHECKLIST,
  HANDOVER_PHASES,
  HOW_IT_IS_ENCRYPTED,
  NOT_AUDITED,
  PHASE_TITLES,
  SECURITY_SENTENCES,
  THE_PASSPHRASE_IS_NEVER_STORED,
  WHAT_IS_ENCRYPTED,
  WHERE_TO_CHECK_THE_ENCRYPTION_DETAILS,
  WHO_CAN_READ_THE_NOTES,
  everySentence,
  stepsOf,
} from './setup-honesty';
import type { HandoverPhase } from './setup-honesty';

/** Digits grouped the way the copy writes them, so 600000 and "600,000" can be compared. */
function grouped(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
}

/** The step with this id, or a failure naming it rather than an undefined further along. */
function step(id: string) {
  const found = HANDOVER_CHECKLIST.find((held) => held.id === id);
  assert.ok(found, `the checklist has no step called ${id}`);
  return found;
}

// ═══════════════════════════════════════════════════════════════════════════════
// One — what to expect
// ═══════════════════════════════════════════════════════════════════════════════

describe('what the coach is told to expect', () => {
  it('says all four things, in the order they are said', () => {
    assert.deepEqual(
      EXPECTATIONS.map((held) => held.id),
      ['sign-in-once', 'brief-reconnect', 'install-to-the-home-screen', 'never-delete-the-icon'],
    );
  });

  it('states a consequence for every one of them, never a bare rule', () => {
    for (const held of EXPECTATIONS) {
      assert.ok(held.says.length > 0, `${held.id} says nothing`);
      assert.ok(
        held.consequence.length > 0,
        `${held.id} is a rule with no consequence, which is a rule he weighs against convenience`,
      );
      assert.notEqual(held.consequence, held.says, `${held.id} repeats itself instead of costing`);
    }
  });

  it('promises the sign-in happens once and not each day', () => {
    const said = step('he-signs-in').does;
    const expectation = EXPECTATIONS[0];
    assert.match(expectation.says, /once/u);
    assert.match(expectation.says, /not something you do at the start of\s+each day/u);
    assert.match(said, /sign in/u, 'the call is where he watches it happen');
  });

  it('calls the reconnect normal rather than a fault, and bounds it to the app being open', () => {
    const reconnect = EXPECTATIONS[1];
    assert.match(reconnect.title, /normal/u);
    assert.match(reconnect.says, /roughly once an\s+hour/u);
    assert.match(reconnect.says, /never does this\s+while you are not using the app/u);
    assert.match(reconnect.consequence, /not a fault/u);
  });

  it('requires the home screen and says what a browser tab costs', () => {
    const install = EXPECTATIONS[2];
    assert.match(install.says, /home screen/u);
    assert.match(install.says, /bookmark/u);
    assert.match(install.consequence, /cleared by the phone without warning/u);
  });

  it('says deleting the icon takes the data and the key with it', () => {
    const never = EXPECTATIONS[3];
    assert.match(never.says, /Do not remove the app from your home screen/u);
    assert.match(never.consequence, /takes this device’s data with it/u);
    assert.match(never.consequence, /key this device uses to open your medical notes/u);
    assert.match(never.consequence, /Nothing on the\s+device can bring it back/u);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Two — the encryption, asserted against the cryptography itself
// ═══════════════════════════════════════════════════════════════════════════════

describe('what is said about the encryption', () => {
  it('names the algorithms the crypto source actually uses, not what sounds right', () => {
    assert.match(HOW_IT_IS_ENCRYPTED, new RegExp(CONTENT_ALGORITHM, 'u'));
    assert.match(HOW_IT_IS_ENCRYPTED, new RegExp(`${CONTENT_ALGORITHM} at ${DATA_KEY_BITS} bits`, 'u'));
    assert.match(HOW_IT_IS_ENCRYPTED, new RegExp(`${IV_BYTES * 8}-bit initialisation vector`, 'u'));
    assert.match(HOW_IT_IS_ENCRYPTED, new RegExp(WRAP_ALGORITHM, 'u'));
    assert.match(
      HOW_IT_IS_ENCRYPTED,
      new RegExp(`${PASSPHRASE_KDF} with ${KDF_HASH} at ${grouped(PBKDF2_ITERATIONS)} iterations`, 'u'),
    );
  });

  it('carries the same names as data, so a screen can show them without re-typing them', () => {
    const named = ALGORITHM_FACTS.map((held) => held.named).join(' | ');
    assert.match(named, new RegExp(CONTENT_ALGORITHM, 'u'));
    assert.match(named, new RegExp(WRAP_ALGORITHM, 'u'));
    assert.match(named, new RegExp(PASSPHRASE_KDF, 'u'));
    assert.match(named, new RegExp(KDF_HASH, 'u'));
    assert.match(named, new RegExp(grouped(PBKDF2_ITERATIONS), 'u'));
    for (const held of ALGORITHM_FACTS) {
      assert.ok(held.purpose.length > 0, 'an algorithm named for no stated purpose');
    }
  });

  it('names HKDF because the crypto source derives the recovery slot with it', async () => {
    const source = await readFile(new URL('../../core/crypto/primitives.js', import.meta.url), 'utf8');

    // The positive control first: a scan that reads nothing must announce itself rather than
    // reporting good news about an absence.
    assert.ok(source.includes(CONTENT_ALGORITHM), 'the crypto source was not read');
    assert.ok(source.includes('HKDF'), 'the crypto source no longer derives anything with HKDF');
    assert.ok(
      !source.includes('AES-CBC'),
      'the crypto source names AES-CBC, so this copy is describing a scheme that changed',
    );

    assert.match(HOW_IT_IS_ENCRYPTED, new RegExp(`HKDF with ${KDF_HASH}`, 'u'));
  });

  it('says which fields are encrypted AND which are not', () => {
    assert.match(WHAT_IS_ENCRYPTED, /Three things/u);
    assert.match(WHAT_IS_ENCRYPTED, /medical note/u);
    assert.match(WHAT_IS_ENCRYPTED, /ordinary readable text/u);
    assert.match(WHAT_IS_ENCRYPTED, /before anything leaves it/u);
  });

  it('says the passphrase is never stored, and what that costs when it is lost', () => {
    assert.match(THE_PASSPHRASE_IS_NEVER_STORED, /never stored/u);
    assert.match(THE_PASSPHRASE_IS_NEVER_STORED, /not in your Google account/u);
    assert.match(THE_PASSPHRASE_IS_NEVER_STORED, /gone for good/u);
  });

  it('states the honest cost — the account holder can read the notes', () => {
    assert.match(WHO_CAN_READ_THE_NOTES, /Anyone who can sign in to your Google account can read/u);
    assert.match(WHO_CAN_READ_THE_NOTES, /kept in that account beside them/u);
  });

  it('states plainly that nothing here is audited or certified', () => {
    assert.ok(SECURITY_SENTENCES.includes(NOT_AUDITED), 'the sentence exists but is not said');
    assert.match(NOT_AUDITED, /has not been audited or certified against any standard/u);
    assert.match(NOT_AUDITED, /makes no such\s+claim/u);
  });

  it('says the security sentences in one fixed order', () => {
    assert.equal(SECURITY_SENTENCES.length, 7);
    assert.equal(SECURITY_SENTENCES.indexOf(WHAT_IS_ENCRYPTED), 0);
    assert.ok(
      SECURITY_SENTENCES.indexOf(NOT_AUDITED) > SECURITY_SENTENCES.indexOf(WHO_CAN_READ_THE_NOTES),
      'the cost is stated before the disclaimer, or the disclaimer reads as the whole story',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The sweeps — each proven to fail on something planted
// ═══════════════════════════════════════════════════════════════════════════════

/** Every forbidden claim this text makes. Local to this module by design; the tree has its own gate. */
// forbidden-claim: fixture — this module's local sweep has to write the words down to look for
// them. The tree-wide gate in src/proof/forbidden-claims.test.ts reads this marker and stops
// reporting the list below as a claim; the marker's reach is eight lines, so it covers the list
// and nothing after it.
const FORBIDDEN_CLAIMS = Object.freeze([
  'hipaa', 'soc 2', 'compliant', 'compliance', 'certified', 'certification',
  'end-to-end', 'end to end', 'fully secure', 'completely secure', 'perfectly safe',
  'your data is safe', 'bank-level', 'military-grade', 'guaranteed',
]);

/** What a text claims from the forbidden list, lower-cased so casing cannot hide one. */
function claimsMade(text: string, forbidden: readonly string[] = FORBIDDEN_CLAIMS): string[] {
  const lowered = text.toLowerCase();
  return forbidden.filter((needle) => lowered.includes(needle));
}

/**
 * EVERY STRING THIS MODULE EXPORTS, FOUND BY WALKING ITS NAMESPACE RATHER THAN BY BEING LISTED.
 *
 * `everySentence()` is a hand-assembled list of the three sections, and it was the corpus every
 * sweep below ran over. MEASURED IN REVIEW (s10/a6, 2026-07-31): a NEW EXPORTED CONSTANT carrying
 * both a regime claim and a data-is-safe assurance left every sweep in this file GREEN, while the
 * tree-wide gate caught it — because a hand-written corpus can only see what somebody
 * remembered to add to it, which makes it weakest at exactly the moment it matters, when a later
 * author adds a sentence. That is the defect `setup.test.ts` already records and avoids.
 *
 * So the corpus is now the namespace, walked recursively. `everySentence()` keeps its own
 * assertions below — it is the module's contract with the screen — but no sweep depends on it.
 */
function everyExportedString(): string[] {
  const found: string[] = [];
  const seen = new Set<unknown>();
  const walk = (held: unknown): void => {
    if (typeof held === 'string') { if (held.trim() !== '') found.push(held); return; }
    if (held === null || typeof held !== 'object' || seen.has(held)) return;
    seen.add(held);
    for (const inner of Object.values(held as Record<string, unknown>)) walk(inner);
  };
  walk(HONESTY);
  return found;
}

describe('the sweeps over this module’s own sentences', () => {
  it('the corpus is the namespace, so a sentence added later is swept without anyone widening this', () => {
    const walked = everyExportedString();
    assert.ok(walked.length > everySentence().length, 'the namespace walk reads less than the list');
    for (const sentence of everySentence()) {
      assert.ok(walked.includes(sentence), `the walk misses a sentence the module renders: ${sentence}`);
    }
  });

  it('makes no forbidden claim anywhere outside the disclaimers', () => {
    for (const sentence of everyExportedString()) {
      if (DISCLAIMERS.includes(sentence)) continue;
      assert.deepEqual(claimsMade(sentence), [], `this sentence makes a claim: ${sentence}`);
    }
  });

  // forbidden-claim: fixture — the planted claim this local sweep is proven to catch. A probe
  // that cannot say the claim out loud is a probe that proves nothing.
  it('and that sweep is proven to catch a planted claim', () => {
    assert.deepEqual(
      claimsMade('This app is HIPAA compliant and end-to-end encrypted.'),
      ['hipaa', 'compliant', 'end-to-end'],
      'the sweep reads nothing, so its silence above means nothing',
    );
  });

  it('holds each disclaimer to DENYING the claim rather than making it', () => {
    assert.equal(DISCLAIMERS.length, 2, 'the denial is written once and said once, and both are held here');
    for (const denial of DISCLAIMERS) {
      assert.ok(denial.length > 0, 'a disclaimer resolved to nothing, which passes every sweep free');
      assert.ok(claimsMade(denial).length > 0, 'a disclaimer that names no claim denies nothing');
      assert.match(denial, /\bnot\b/u, `the disclaimer does not deny anything: ${denial}`);
      assert.match(
        denial, /no such claim|does not claim/u,
        `the disclaimer stops short of refusing: ${denial}`,
      );
      assert.ok(
        everySentence().includes(denial),
        'a disclaimer that is not among the sentences exempts a sweep from nothing',
      );
    }
  });

  it('carries no emoji, and the check is proven to catch one', () => {
    const emoji = /\p{Extended_Pictographic}/u;
    for (const sentence of everyExportedString()) {
      assert.ok(!emoji.test(sentence), `an emoji reached a sentence: ${sentence}`);
    }
    assert.ok(emoji.test('all set 👍'), 'the emoji check matches nothing at all');
  });

  it('makes no Android claim anywhere in the module, not even as pending', async () => {
    const source = await readFile(new URL('./setup-honesty.ts', import.meta.url), 'utf8');
    assert.ok(source.includes('Google'), 'the module source was not read');
    assert.ok(!/android/iu.test(source), 'the module mentions Android; iOS is the only tested target');
  });

  it('names no place called Setup, because nothing renders that label yet', () => {
    for (const sentence of everyExportedString()) {
      assert.ok(
        !/\bSetup\b/u.test(sentence),
        `this sentence sends him to a surface that does not exist: ${sentence}`,
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The one sentence that names a place
// ═══════════════════════════════════════════════════════════════════════════════

describe('the destination sentence', () => {
  it('names a destination that EXISTS and is rendered', async () => {
    const admin = DESTINATIONS.find((held) => held.path === 'admin');
    assert.ok(admin, 'there is no Admin destination to send him to');
    assert.equal(admin.label, 'Admin');

    const screen = await readFile(new URL('./AdminScreen.tsx', import.meta.url), 'utf8');
    assert.ok(screen.includes('describeAdminEntry'), 'Admin does not build the encryption card');
    assert.ok(screen.includes('{keyMaterial.title}'), 'Admin does not draw the card’s heading');
  });

  it('LABELS it exactly as the card is headed', () => {
    assert.ok(KEY_MATERIAL_TITLE.length > 0);
    assert.ok(
      WHERE_TO_CHECK_THE_ENCRYPTION_DETAILS.includes(KEY_MATERIAL_TITLE),
      'the sentence names a heading the card does not carry',
    );
    assert.match(WHERE_TO_CHECK_THE_ENCRYPTION_DETAILS, /open Admin/u);
  });

  it('gives no DIRECTION, because ordering belongs to the screen and rots silently', () => {
    const directions = [
      'further down', 'lower down', 'further up', 'below', 'above',
      'at the bottom', 'at the top', 'scroll down', 'first card', 'last card',
    ];
    for (const sentence of everySentence()) {
      for (const direction of directions) {
        assert.ok(
          !sentence.toLowerCase().includes(direction),
          `"${direction}" is a claim about a screen this module cannot see: ${sentence}`,
        );
      }
    }
    // The control: the same matcher over a planted direction must catch it.
    assert.ok('It is further down the page.'.toLowerCase().includes('further down'));
  });

  it('was not duplicated into a neighbouring string to satisfy the scan', () => {
    const carrying = everySentence().filter((held) => held.includes(KEY_MATERIAL_TITLE));
    assert.equal(
      carrying.length, 1,
      `${carrying.length} sentences name that card; a second copy is one that will drift`,
    );
    assert.equal(carrying[0], WHERE_TO_CHECK_THE_ENCRYPTION_DETAILS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Three — the handover checklist
// ═══════════════════════════════════════════════════════════════════════════════

describe('the handover checklist', () => {
  it('covers the whole arc, in order', () => {
    assert.deepEqual(HANDOVER_PHASES, ['before', 'during', 'after']);
    for (const phase of HANDOVER_PHASES) {
      assert.ok(stepsOf(phase).length > 0, `nothing happens ${phase} the call`);
      assert.ok(PHASE_TITLES[phase].length > 0, `${phase} has no heading`);
    }
  });

  it('is ordered data rather than a paragraph, with unique ids and a reason on every step', () => {
    const ids = HANDOVER_CHECKLIST.map((held) => held.id);
    assert.equal(new Set(ids).size, ids.length, 'two steps share an id');
    for (const held of HANDOVER_CHECKLIST) {
      assert.ok(held.does.length > 0, `${held.id} asks for nothing`);
      assert.ok(held.why.length > 0, `${held.id} carries no reason, so it is the one that gets cut`);
      assert.ok(HANDOVER_PHASES.includes(held.phase), `${held.id} happens at no phase`);
    }
  });

  it('keeps each phase in its declared order', () => {
    const rebuilt = HANDOVER_PHASES.flatMap((phase: HandoverPhase) => stepsOf(phase).map((held) => held.id));
    assert.deepEqual(new Set(rebuilt).size, HANDOVER_CHECKLIST.length);
    for (const phase of HANDOVER_PHASES) {
      assert.deepEqual(
        stepsOf(phase).map((held) => held.id),
        HANDOVER_CHECKLIST.filter((held) => held.phase === phase).map((held) => held.id),
      );
    }
  });

  it('confirms two-factor authentication BEFORE the call, and says why', () => {
    const twoFactor = step('two-factor');
    assert.equal(twoFactor.phase, 'before');
    assert.match(twoFactor.does, /two-factor authentication is switched on/u);
    assert.match(twoFactor.why, /recovery design depends on it/u);
    assert.match(twoFactor.why, /anyone who can sign in to the account can read them/u);
    assert.match(twoFactor.why, /app cannot check it/u);
  });

  it('has him do the installing himself, on his own device', () => {
    assert.match(step('he-signs-in').does, /Have HIM sign in, on HIS device/u);
    assert.match(step('he-installs-it').does, /home screen/u);
    assert.match(step('he-installs-it').does, /Close the browser tab/u);
  });

  it('says out loud what deleting the icon costs, and what the app does not claim', () => {
    assert.match(step('say-what-deleting-costs').does, /never be deleted/u);
    assert.match(step('say-what-deleting-costs').why, /cannot be undone/u);

    const said = step('say-what-is-not-claimed');
    assert.match(said.does, /has not been audited or certified/u);
    assert.match(said.does, /anyone who can sign in to his Google account can read/u);
  });

  it('checks afterwards that it actually worked, by consequence rather than by appearance', () => {
    assert.match(step('watch-one-backup-finish').does, /watch the backup indicator/u);
    assert.match(step('watch-one-backup-finish').why, /finished backup/u);
    assert.match(step('a-week-later').does, /A week later/u);
    assert.match(step('a-week-later').why, /absence rather than as an error/u);
  });

  /**
   * NO STEP MAY NOMINATE AN OUTCOME THIS BUILD CANNOT PRODUCE, and this is pinned to the CODE FACT
   * rather than to the wording that replaced it.
   *
   * The step that stood here told a helper to save a medical note and read a successful save as
   * proof the setup worked. `describeClinicalField` returns `canAccept: false` from every branch, so
   * the save can never happen — the helper would have concluded the connection failed when it may
   * have worked perfectly. Re-aiming the assertion above at the new sentence would not have caught
   * that, because it only ever said what the sentence says.
   *
   * SO THIS ASSERTS THE TWO HALVES TOGETHER. The day somebody wires sealing, `canAccept` stops being
   * false and this test says so instead of quietly permitting the old instruction back.
   */
  it('never tells a helper to prove the setup by doing something the build cannot do', () => {
    assert.equal(describeClinicalField('has-backed-up').canAccept, false,
      'the protected clinical field now accepts text, so the rule below needs rewriting rather than '
      + 'relaxing: an instruction to save one is no longer impossible, and the checklist may want it '
      + 'back — deliberately, not by default');

    for (const one of HANDOVER_CHECKLIST) {
      assert.equal(
        /\b(save|add|write|type|enter)\b[^.]*\b(medical|clinical)\b/iu.test(one.does),
        false,
        `${one.id} instructs a helper to put a medical note in, and this build refuses every one of `
        + 'them in every state — so following the step produces a failure that reads as the whole '
        + 'setup having failed',
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The sweep list itself
// ═══════════════════════════════════════════════════════════════════════════════

describe('everySentence', () => {
  it('reaches all three sections, so no section can be swept by nobody', () => {
    const all = everySentence();
    assert.ok(all.includes(EXPECTATIONS[0].says), 'the expectations are not swept');
    assert.ok(all.includes(WHAT_IS_ENCRYPTED), 'the security wording is not swept');
    assert.ok(all.includes(HANDOVER_CHECKLIST[0].does), 'the checklist is not swept');
    assert.ok(all.includes(PHASE_TITLES.before), 'the phase headings are not swept');
    assert.ok(all.includes(ALGORITHM_FACTS[0].named), 'the algorithm names are not swept');
  });

  it('carries no empty string, which would pass every sweep for free', () => {
    for (const sentence of everySentence()) assert.ok(sentence.trim().length > 0);
  });
});
