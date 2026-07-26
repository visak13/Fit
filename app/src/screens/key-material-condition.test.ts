/**
 * THE KEY-MATERIAL CONDITION SCREEN, PROVEN AGAINST THE REAL FAILURE AND AGAINST ITS OWN SOURCE.
 *
 * ## Nothing here is a fixture
 *
 * Every condition this file asserts on is produced by DRIVING `core/crypto/guard.js` into the state
 * it exists to refuse, against the in-memory double whose fidelity is the reason the state is
 * reachable at all: the double permits two objects of the same name in the hidden space because the
 * real service does, measured during the platform spike, where a silent key split happened in about
 * fifteen minutes of ordinary two-device use. A hand-built `{code, role, found}` object would prove
 * that this module can format a literal, which is not the claim being made. The claim is that when
 * the core really refuses, this screen really shows him both candidates — and the two are joined
 * here by the real throw.
 *
 * ## The read-only ruling is held in FOUR ways, because it will be attacked from four directions
 *
 * The user ruled on 2026-07-26 that this surface shows both candidates, changes nothing, and tells
 * the coach to get help. In a year somebody will helpfully add a cleanup button, and the useful
 * question is which assertion stops them.
 *
 *   1. NOTHING IS CALLABLE. Both the reading and the report are walked to their leaves and nothing
 *      in either may be a function. A button needs a handler, and a handler on this path has to come
 *      through one of the two.
 *   2. NOTHING WAS WRITTEN. The whole hidden space — every file, its content and its revision — is
 *      captured before the report is built and compared after. This is the property itself rather
 *      than a proxy for it.
 *   3. NO CONTROL IN THE MARKUP. The screen's own source is scanned for controls and handlers with
 *      its COMMENTS STRIPPED FIRST, because this file's own explanations name every one of the
 *      things it forbids — a scan that could not tell a call site from an explanation of one would
 *      leave "delete the explanation" as the only way to make it pass.
 *   4. THAT SCAN IS POINTED AT A KNOWN POSITIVE IN THE SAME RUN. A scan whose entire output is an
 *      absence proves nothing until it has been seen to find something. `DivergencePickerScreen.tsx`
 *      has real buttons and real handlers, so the same scan run over it must report them.
 *
 * ## The copy is asserted, not merely present
 *
 * The four standing sentences — nothing was changed, do not delete either, stop rather than continue,
 * and ask the person who set this app up — are asserted by MEANING, phrase by phrase, so that
 * rewording is allowed and losing the requirement is not. The human exit is the one most easily
 * softened into a reassuring line about the app looking into it, and it is the one this application
 * cannot deliver, so it is checked hardest.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { InMemoryDeviceKeyStore } from '../../core/crypto/device-key-store.js';
import { MultipleKeyObjectsFound } from '../../core/crypto/errors.js';
import { RECOVERY_OBJECT_NAME, establishKeyMaterial } from '../../core/crypto/guard.js';
import { InMemoryRemoteStorage, SPACES, manualClock, systemClock } from '../../core/remote/remote.js';

import { NO_KEY_MATERIAL_CONDITION } from '../shell/KeyMaterial.tsx';
import type { KeyMaterialReading } from '../shell/KeyMaterial.tsx';
import {
  DO_NOT_CONTINUE,
  DO_NOT_DELETE,
  DUPLICATE_ROLES,
  KEY_MATERIAL_CODES,
  MEMBER_KEYS,
  NOTHING_WAS_CHANGED,
  STANDING_SENTENCES,
  WHO_TO_ASK,
  describeAdminEntry,
  describeCondition,
  describeSettled,
} from './key-material-condition.ts';
import type { ConditionReport, KeyMaterialCondition } from './key-material-condition.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════════════
// Driving the core into the state it refuses
// ═══════════════════════════════════════════════════════════════════════════════

const AT = '2026-07-26T09:00:00.000Z';

/**
 * The double, by the type of the real thing rather than by a shape written here.
 *
 * The core is plain ECMAScript typed in documentation comments and consumed unchanged, so this reads
 * the type off the class the application would use. A hand-written structural type would be a second
 * description of the port that could drift from it silently.
 */
type Remote = InstanceType<typeof InMemoryRemoteStorage>;

/** One installation, exactly as `core/crypto/guard.test.js` builds one. */
function device(deviceId: string) {
  return { deviceId, deviceKeys: new InMemoryDeviceKeyStore() };
}

function establish(remote: Remote, dev: ReturnType<typeof device>) {
  return establishKeyMaterial({
    remote,
    deviceId: dev.deviceId,
    deviceKeys: dev.deviceKeys,
    hasEverSynchronised: true,
    now: () => AT,
    journal: async () => undefined,
  });
}

/** The condition the core threw, or a failure saying it did not throw one. */
async function conditionFrom(run: () => Promise<unknown>): Promise<KeyMaterialCondition> {
  try {
    await run();
  } catch (thrown) {
    assert.ok(
      thrown instanceof MultipleKeyObjectsFound,
      `the core threw ${String(thrown)} rather than the duplicate condition this screen surfaces`,
    );
    // The error object AS IT IS. The seam carries it unconverted, so this is the same shape the
    // screen sees in the application and not a translation made for the test.
    return thrown as unknown as KeyMaterialCondition;
  }
  throw new assert.AssertionError({ message: 'the core did not refuse at all, so there is nothing to surface' });
}

/**
 * TWO ENVELOPES AND TWO RECOVERY OBJECTS, produced the way the field produced them.
 *
 * Real latency on every call, so both devices complete their listing before either write lands —
 * the ordinary two-device timing that produced the measured split.
 */
async function duplicateEnvelopeCondition() {
  const remote = new InMemoryRemoteStorage({ clock: systemClock() });
  remote.adversity.setLatency(5);
  await Promise.all([establish(remote, device('laptop')), establish(remote, device('phone'))]);
  const condition = await conditionFrom(() => establish(remote, device('tablet')));
  return { remote, condition };
}

/**
 * EXACTLY ONE envelope and TWO recovery objects, which is the only way to reach the recovery arm.
 *
 * The envelope is checked first in `establishKeyMaterial`, so a listing with two of each surfaces as
 * the envelope condition and the recovery one would never be seen. A second device that had already
 * surveyed an empty space writes its own recovery object; the space accepts it silently, exactly as
 * it accepted the second envelope, because the non-uniqueness quirk belongs to the SPACE.
 */
async function duplicateRecoveryCondition() {
  const remote = new InMemoryRemoteStorage({ clock: manualClock() });
  await establish(remote, device('laptop'));

  const [existing] = (await remote.list(SPACES.HIDDEN)).filter(
    (meta: { name: string }) => meta.name === RECOVERY_OBJECT_NAME,
  );
  const copy = await remote.read(existing.file_id);
  await remote.create(SPACES.HIDDEN, { name: RECOVERY_OBJECT_NAME, content: copy.content });

  const condition = await conditionFrom(() => establish(remote, device('phone')));
  return { remote, condition };
}

/** Everything in the hidden space, contents included, so "nothing changed" is checked and not assumed. */
async function hiddenSpace(remote: Remote) {
  const metas = await remote.list(SPACES.HIDDEN);
  const snapshot = [];
  for (const meta of metas) {
    // eslint-disable-next-line no-await-in-loop
    const file = await remote.read(meta.file_id);
    snapshot.push({ meta: { ...meta }, content: [...file.content] });
  }
  snapshot.sort((a, b) => (a.meta.file_id < b.meta.file_id ? -1 : 1));
  return snapshot;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Both candidates, from the real failure
// ═══════════════════════════════════════════════════════════════════════════════

describe('the duplicate key envelope, driven through the core', () => {
  it('reaches the screen as the condition the core threw, carrying both candidates', async () => {
    const { condition } = await duplicateEnvelopeCondition();

    assert.equal(condition.code, KEY_MATERIAL_CODES.MULTIPLE_KEY_OBJECTS,
      'the code this module keys the family on is not the code the core actually throws');
    assert.equal(condition.role, DUPLICATE_ROLES.ENVELOPE,
      'the role string this module keys the envelope member on is not what the core throws. It is ' +
        'declared in key-material-condition.ts because the core passes it as a literal — this ' +
        'assertion is what keeps the two spellings the same');
    assert.equal(condition.found.length, 2);
  });

  it('shows BOTH candidates, each identified by the only thing that tells them apart', async () => {
    const { condition } = await duplicateEnvelopeCondition();
    const report = describeCondition(condition);

    assert.equal(report.count, 2);
    assert.equal(report.candidates.length, 2,
      'the whole reason the core carried the candidates out of the failure is that a person could ' +
        'compare them. A screen that shows one has thrown that away');

    for (const meta of condition.found) {
      const shown = report.candidates.filter((candidate) =>
        candidate.facts.some((fact) => fact.value === meta.file_id));
      assert.equal(shown.length, 1,
        `candidate ${meta.file_id} is not on the screen. The identifier is the only field that ` +
          'distinguishes two files with the same name, so a candidate without one is not shown at ' +
          'all — it is a row that looks like the other one');
    }

    assert.equal(
      new Set(report.candidates.map((candidate) => candidate.heading)).size,
      2,
      'the two candidates are headed identically, so nothing on the screen says which is which',
    );
  });

  it('says only what the core handed over, and invents no field about the coach\'s account', async () => {
    const { condition } = await duplicateEnvelopeCondition();
    const report = describeCondition(condition);
    const allowed = new Set(['file_id', 'space', 'name', 'revision', 'modified_at', 'size']);

    for (const candidate of report.candidates) {
      for (const fact of candidate.facts) {
        const fromCore = condition.found.some((meta) =>
          [...allowed].some((key) => String((meta as unknown as Record<string, unknown>)[key]) !== undefined
            && fact.value.includes(String((meta as unknown as Record<string, unknown>)[key]))));
        assert.ok(fromCore,
          `"${fact.label}" shows "${fact.value}", which is not in anything the core handed over. A ` +
            'screen at this moment must be evidence somebody can read out, not a guess dressed as one');
      }
    }
  });

  it('is NOT marked the more dangerous of the two, because it announces itself', async () => {
    const { condition } = await duplicateEnvelopeCondition();
    const report = describeCondition(condition);

    assert.equal(report.moreDangerous, false);
    assert.equal(report.dangerNote, null,
      'the danger note belongs to the recovery key alone. Saying it of both would spend the words ' +
        'that have to work on the one that is silent');
  });
});

describe('the duplicate recovery key, driven through the core', () => {
  it('reaches the screen as its own member rather than as the envelope one', async () => {
    const { condition } = await duplicateRecoveryCondition();

    assert.equal(condition.code, KEY_MATERIAL_CODES.MULTIPLE_KEY_OBJECTS);
    assert.equal(condition.role, DUPLICATE_ROLES.RECOVERY,
      'the role string this module keys the recovery member on is not what the core throws');
    assert.equal(condition.found.length, 2);

    const report = describeCondition(condition);
    assert.equal(
      report.memberKey,
      `${KEY_MATERIAL_CODES.MULTIPLE_KEY_OBJECTS}:${DUPLICATE_ROLES.RECOVERY}`,
      'the recovery key selected the envelope\'s member, so the coach is being told about the wrong ' +
        'object at the one moment being told the wrong thing is most expensive',
    );
  });

  it('shows both recovery keys', async () => {
    const { condition } = await duplicateRecoveryCondition();
    const report = describeCondition(condition);

    assert.equal(report.candidates.length, 2);
    for (const meta of condition.found) {
      assert.ok(
        report.candidates.some((candidate) => candidate.facts.some((fact) => fact.value === meta.file_id)),
        `recovery key ${meta.file_id} is not on the screen`,
      );
    }
  });

  it('IS marked the more dangerous, and says WHY: it is silent until a recovery', async () => {
    const { condition } = await duplicateRecoveryCondition();
    const report = describeCondition(condition);

    assert.equal(report.moreDangerous, true,
      'the recovery key is the more dangerous of the two and the screen must say so. A duplicated ' +
        'envelope announces itself the first time a note will not open; a duplicated recovery key ' +
        'stays silent until somebody is recovering a wiped device');

    const note = report.dangerNote;
    assert.ok(note !== null, 'the more dangerous condition carries no explanation of why it is');
    const said = note.toLowerCase();
    assert.ok(said.includes('no warning') || said.includes('gives no warning'),
      'the danger note does not say that this one gives no warning, which is the whole of what ' +
        'makes it worse than the other');
    assert.ok(said.includes('wiped') || said.includes('new'),
      'the danger note does not name the moment it shows itself — setting the app up again on a ' +
        'new or wiped phone — so a coach cannot tell why it matters now rather than later');
  });

  it('names the recovery key rather than the encryption details, which the core\'s own message does not', async () => {
    const { condition } = await duplicateRecoveryCondition();
    const report = describeCondition(condition);

    assert.ok(report.title.toLowerCase().includes('recovery'),
      'the heading does not name the recovery key');
    assert.ok(report.whatHappened.toLowerCase().includes('recovery key'),
      'the explanation does not name the recovery key');

    // MEASURED, and this assertion is why the core's ready-made message is folded rather than read
    // first. `MultipleKeyObjectsFound` builds ONE message for BOTH roles and opens "more than one
    // set of encryption details" — which names the wrong object when the role is the recovery key.
    // Rendering it as the leading sentence would tell a coach staring at two recovery keys that he
    // has two sets of encryption details. If the core is corrected, THIS TEST GOES RED and the
    // reasoning in key-material-condition.ts should be revisited rather than the assertion softened.
    assert.ok(
      condition.userMessage.includes('encryption details'),
      'the core\'s ready-made message no longer names the wrong object for this role. That was the ' +
        'measured reason this screen words each member itself instead of rendering that message — ' +
        'if the core has been fixed, reconsider the note in key-material-condition.ts',
    );
    assert.ok(
      !condition.userMessage.toLowerCase().includes('recovery key'),
      'the core\'s message now distinguishes the recovery key; see above',
    );
    assert.equal(report.asTheAppPutIt, condition.userMessage,
      'the core\'s own wording must still be carried through unchanged for whoever is helping him');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The copy, asserted by meaning
// ═══════════════════════════════════════════════════════════════════════════════

/** Everything the screen would put in front of the coach, as one body of text. */
function everythingSaid(report: ConditionReport): string {
  const parts = [
    report.title, report.countMeans, report.whatHappened, report.whatItMeans,
    report.dangerNote ?? '', report.nothingWasChanged, report.doNotDelete,
    report.doNotContinue, report.whoToAsk,
    ...report.candidates.flatMap((candidate) => [candidate.heading, ...candidate.facts.map((f) => f.label)]),
  ];
  return parts.join('\n');
}

async function bothReports(): Promise<ConditionReport[]> {
  const envelope = await duplicateEnvelopeCondition();
  const recovery = await duplicateRecoveryCondition();
  return [describeCondition(envelope.condition), describeCondition(recovery.condition)];
}

describe('what the screen tells a non-technical person', () => {
  it('says the application has changed nothing and will not', async () => {
    for (const report of await bothReports()) {
      const said = report.nothingWasChanged.toLowerCase();
      assert.ok(said.includes('nothing has been changed'),
        `${report.memberKey} does not say plainly that nothing has been changed`);
      assert.ok(said.includes('will not'),
        `${report.memberKey} says nothing HAS changed but not that nothing WILL. The coach is being ` +
          'asked to walk away from this screen and leave it alone, which he will not do if he ' +
          'thinks the app might act while he is gone');
    }
  });

  it('says not to delete either candidate, and what it would cost', async () => {
    for (const report of await bothReports()) {
      const said = report.doNotDelete.toLowerCase();
      assert.ok(said.includes('do not delete'), `${report.memberKey} never says not to delete them`);
      assert.ok(said.includes('never') || said.includes('cannot'),
        `${report.memberKey} says not to delete without saying it is permanent. "Do not" is advice; ` +
          '"can never be opened again" is the reason he will follow it');
    }
  });

  it('tells him to stop rather than carry on', async () => {
    for (const report of await bothReports()) {
      const said = report.doNotContinue.toLowerCase();
      assert.ok(said.includes('stop'), `${report.memberKey} never tells him to stop`);
      assert.ok(said.includes('do not add') || said.includes('until this'),
        `${report.memberKey} tells him to stop without saying what to stop doing or until when`);
    }
  });

  /**
   * THE HUMAN EXIT, and it is the assertion this whole file exists to protect.
   *
   * Read-only prevents the data loss and, on its own, leaves the coach with nowhere to go: there is
   * no support desk, no vendor and no manual behind this application. The only help that exists is
   * the person who set it up for him, and if the screen does not NAME that person it has stopped him
   * at a dead end. This cannot be softened later without a test going red.
   */
  it('names the person who set the app up as the next step, and does not pretend the app can fix it', async () => {
    for (const report of await bothReports()) {
      const said = report.whoToAsk.toLowerCase();

      assert.ok(
        said.includes('the person who set this app up'),
        `${report.memberKey} does not name who to ask. The read-only ruling means the app will not ` +
          'resolve this, so a screen that does not name the person who set it up for him has ' +
          'stopped him with no exit of his own',
      );
      assert.ok(
        said.includes('no help desk') || said.includes('no support'),
        `${report.memberKey} does not say that no support desk exists, so "get help" reads as an ` +
          'instruction to find one — and he will spend the worst moment he will ever have with this ' +
          'app looking for something that is not there',
      );
      assert.ok(
        said.includes('cannot sort this out') || said.includes('cannot fix'),
        `${report.memberKey} does not say plainly that the app cannot do this itself. Without that, ` +
          'a screen that shows a problem and offers no button reads as one that is working on it',
      );
    }
  });

  it('offers no reassuring-sounding action anywhere in its words', async () => {
    const forbidden = ['try again', 'we will', 'we are looking', 'automatically', 'repair', 'clean up'];
    for (const report of await bothReports()) {
      const said = everythingSaid(report).toLowerCase();
      for (const phrase of forbidden) {
        assert.ok(!said.includes(phrase),
          `${report.memberKey} says "${phrase}". Nothing behind this screen can deliver that, and a ` +
            'promise the application cannot keep is what turns a safe read-only screen into a panic');
      }
    }
  });

  it('uses no emoji in anything the coach reads', async () => {
    const strings = [
      ...STANDING_SENTENCES,
      ...(await bothReports()).map(everythingSaid),
      describeSettled().intro,
      describeSettled().countMeans,
      describeAdminEntry(null).intro,
    ];
    for (const text of strings) {
      for (const point of [...text]) {
        const code = point.codePointAt(0) ?? 0;
        assert.ok(code < 0x2100,
          `"${point}" (U+${code.toString(16).toUpperCase()}) is outside the plain text this ` +
            'application writes in. No emoji in any user-facing string');
      }
    }
  });

  it('holds the four standing sentences as constants, so losing one is a code change', () => {
    assert.deepEqual(
      STANDING_SENTENCES,
      [NOTHING_WAS_CHANGED, DO_NOT_DELETE, DO_NOT_CONTINUE, WHO_TO_ASK],
      'the standing sentences are the requirement itself. They live as constants precisely so that ' +
        'one going missing is a change to this list rather than a paragraph quietly edited in markup',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// READ-ONLY, four ways
// ═══════════════════════════════════════════════════════════════════════════════

/** Every value reachable from an object, to its leaves. */
function leaves(value: unknown, seen = new Set<unknown>()): unknown[] {
  if (value === null || typeof value !== 'object') return [value];
  if (seen.has(value)) return [];
  seen.add(value);
  return Object.values(value as Record<string, unknown>).flatMap((held) => leaves(held, seen));
}

describe('this path writes nothing, deletes nothing, and chooses nothing', () => {
  it('offers nothing callable on the report, so there is nothing a button could be wired to', async () => {
    for (const report of await bothReports()) {
      for (const leaf of leaves(report)) {
        assert.notEqual(typeof leaf, 'function',
          `${report.memberKey} carries something callable. The user ruled this surface read-only on ` +
            '2026-07-26: both candidates shown, nothing changed, get help. A function on this report ' +
            'is what a discard button would have to hold, and discarding the wrong key makes every ' +
            'note encrypted under it permanently unreadable');
      }
    }
  });

  it('offers nothing callable on the reading either, so a later step cannot supply one quietly', () => {
    const reading: KeyMaterialReading = NO_KEY_MATERIAL_CONDITION;
    assert.deepEqual(Object.keys(reading), ['condition'],
      'the key-material reading has grown a second field. The divergence seam carries a `resolve` ' +
        'because a divergence is a question the coach answers; this one carries no way back AT ALL, ' +
        'deliberately, and a new field here is the read-only ruling being reopened');
    for (const leaf of leaves(reading)) {
      assert.notEqual(typeof leaf, 'function', 'the reading carries something callable');
    }
  });

  it('leaves the hidden space byte-for-byte as it found it', async () => {
    const { remote, condition } = await duplicateEnvelopeCondition();
    const before = await hiddenSpace(remote);

    describeCondition(condition);
    describeAdminEntry(condition);
    describeSettled();

    assert.deepEqual(await hiddenSpace(remote), before,
      'building the screen changed the coach\'s Google account. Nothing on this path may write, ' +
        'delete or adopt: adopting the wrong candidate splits the ciphertext exactly as badly as ' +
        'deleting the right one');
    assert.equal(before.length, 4,
      'the reproduced condition no longer leaves two envelopes and two recovery objects, so the ' +
        'comparison above is being made against a state that is not the one this screen surfaces');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The same scan, pointed at a known positive
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Source with its comments removed.
 *
 * REQUIRED, not tidiness. The files being scanned explain at length what they must never do, and
 * every forbidden word appears in those explanations. A scan that could not tell a call site from an
 * explanation of one would leave exactly one way to make it pass: delete the explanation. Measured
 * on this build in s15/a2, and it is why this strips first and scans second.
 */
function code(source: string): string {
  const withoutBlocks = source.split(/\/\*[\s\S]*?\*\//g).join(' ');
  return withoutBlocks
    .split('\n')
    .map((line) => (line.trimStart().startsWith('//') ? '' : line))
    .join('\n');
}

/** What a control on this screen would look like in the markup. */
const CONTROL_MARKS = ['<button', 'onClick', 'onSubmit', 'onChange'];

async function sourceOf(...relative: string[]): Promise<string> {
  return code(await readFile(path.join(here, ...relative), 'utf8'));
}

describe('the screen has no control in it, and the check that says so has been seen to work', () => {
  it('finds every control mark in the divergence picker, which really has them', async () => {
    const positive = await sourceOf('DivergencePickerScreen.tsx');
    const found = CONTROL_MARKS.filter((mark) => positive.includes(mark));

    assert.deepEqual(found.sort(), ['<button', 'onClick'].sort(),
      'the scan below reports an ABSENCE, and an absence proves nothing until the same scan has ' +
        'been seen to find a presence. The divergence picker offers two buttons with a handler on ' +
        'each; if this no longer finds them, the scan is broken or misdirected and its silence over ' +
        'the key-material screen means nothing at all');
  });

  it('finds none of them in the key-material screen or its module', async () => {
    for (const file of ['KeyMaterialConditionScreen.tsx', 'key-material-condition.ts']) {
      const source = await sourceOf(file);
      for (const mark of CONTROL_MARKS) {
        assert.ok(!source.includes(mark),
          `${file} contains "${mark}". This surface is READ-ONLY by user ruling of 2026-07-26 — ` +
            'both candidates shown, nothing changed, get help. There is no pick, no discard and no ' +
            'cleanup, and none is to be left disabled or behind a flag either');
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The family, and the destination it leaves for the Google step
// ═══════════════════════════════════════════════════════════════════════════════

describe('the condition family', () => {
  it('words exactly the two conditions the core can reach today, and both are exercised here', async () => {
    assert.deepEqual(
      [...MEMBER_KEYS].sort(),
      [
        `${KEY_MATERIAL_CODES.MULTIPLE_KEY_OBJECTS}:${DUPLICATE_ROLES.ENVELOPE}`,
        `${KEY_MATERIAL_CODES.MULTIPLE_KEY_OBJECTS}:${DUPLICATE_ROLES.RECOVERY}`,
      ].sort(),
      'the family has grown or shrunk. Every member must be wordable by a person and driven from a ' +
        'real failure in this file — a member nobody exercises is copy nobody has read',
    );

    const exercised = (await bothReports()).map((report) => report.memberKey);
    assert.deepEqual([...exercised].sort(), [...MEMBER_KEYS].sort());
  });

  /**
   * The destination the four unbuilt conditions get routed to, proven to be a destination.
   *
   * `not_connected_yet`, `slot_addition_raced`, `envelope_unreadable` and `no_usable_slot` all fire
   * only on paths that talk to the real remote, so they belong to the Google step and NONE of them is
   * built, imported or stubbed here. What they have is somewhere to arrive: this screen, this seam
   * and this module, extended by one entry in MEMBERS. Until then a code with no member is refused
   * LOUDLY rather than improvised over, which fails in that step's own suite long before it could
   * reach a device.
   */
  it('refuses a condition nobody has worded, rather than improvising something for him to read', () => {
    const unworded: KeyMaterialCondition = {
      code: 'no_usable_slot',
      userMessage: 'A ready-made message the core wrote, which is not the same as a screen.',
      found: [],
    };

    assert.throws(
      () => describeCondition(unworded),
      (thrown: unknown) => {
        const said = String((thrown as Error).message);
        assert.ok(said.includes('no_usable_slot'), 'the refusal does not name the condition it refused');
        assert.ok(said.includes('MEMBERS'), 'the refusal does not say how to fix it');
        return true;
      },
      'a condition with no member was rendered anyway. Whatever it produced is words the coach ' +
        'reads at his worst moment that nobody chose',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The state it is in on every visit but one
// ═══════════════════════════════════════════════════════════════════════════════

describe('the settled state', () => {
  it('reads as the good news it is rather than as an empty screen', () => {
    const settled = describeSettled();
    assert.equal(settled.settled, true);
    assert.equal(settled.count, 1);
    assert.ok(settled.intro.toLowerCase().includes('nothing to sort out'));
    assert.ok(
      settled.intro.toLowerCase().includes('will not choose'),
      'the settled state is the only moment he reads this screen calmly, so it is where the promise ' +
        'that the app will never choose between them is worth making',
    );
  });

  it('offers the way in from Admin permanently, worded for both states and promising neither a fix', async () => {
    const quiet = describeAdminEntry(null);
    assert.equal(quiet.settled, true);
    assert.equal(quiet.count, 1);
    assert.ok(quiet.linkLabel.length > 0, 'the way in has no words on it, so nothing says where it goes');

    const { condition } = await duplicateEnvelopeCondition();
    const loud = describeAdminEntry(condition);
    assert.equal(loud.settled, false);
    assert.equal(loud.count, 2, 'the chip does not carry how many were found');

    for (const entry of [quiet, loud]) {
      const label = entry.linkLabel.toLowerCase();
      for (const promise of ['fix', 'resolve', 'sort out', 'repair']) {
        assert.ok(!label.includes(promise),
          `the link says "${entry.linkLabel}", promising to ${promise} something. The screen behind ` +
            'it does neither — it shows both candidates and names who to ask');
      }
    }
  });
});
