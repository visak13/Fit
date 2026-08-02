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
import {
  CryptoError,
  EnvelopeUnreadable,
  MultipleKeyObjectsFound,
  NoUsableSlot,
  NotConnectedYet,
  SlotAdditionRaced,
} from '../../core/crypto/errors.js';
import { ENVELOPE_OBJECT_NAME, RECOVERY_OBJECT_NAME, establishKeyMaterial } from '../../core/crypto/guard.js';
import { InMemoryRemoteStorage, SPACES, manualClock, systemClock } from '../../core/remote/remote.js';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { KeyMaterialProvider, NO_KEY_MATERIAL_CONDITION } from '../shell/KeyMaterial.tsx';
import type { KeyMaterialReading } from '../shell/KeyMaterial.tsx';
import { KeyMaterialConditionScreen } from './KeyMaterialConditionScreen.tsx';
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
  describeNotChecked,
} from './key-material-condition.ts';
import type { ConditionReport, KeyMaterialCondition, RemoteFileMeta } from './key-material-condition.ts';

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

function establish(remote: Remote, dev: ReturnType<typeof device>, over: Record<string, unknown> = {}) {
  return establishKeyMaterial({
    remote,
    deviceId: dev.deviceId,
    deviceKeys: dev.deviceKeys,
    hasEverSynchronised: true,
    now: () => AT,
    journal: async () => undefined,
    ...over,
  });
}

/**
 * The condition the core threw, or a failure saying it did not throw one.
 *
 * `expected` is the failure CLASS, not the code, so a class renamed or re-coded in the core fails
 * here at the seam rather than falling through to the family's refusal on the coach's device.
 */
async function conditionFrom(
  run: () => Promise<unknown>,
  expected: new (...args: never[]) => CryptoError = MultipleKeyObjectsFound,
): Promise<KeyMaterialCondition> {
  try {
    await run();
  } catch (thrown) {
    assert.ok(
      thrown instanceof expected,
      `the core threw ${String(thrown)} rather than the ${expected.name} condition this screen surfaces`,
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

// ═══════════════════════════════════════════════════════════════════════════════
// The four that only fire against a real remote, each PROVOKED rather than asserted about
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * WHY THESE ARE PROVOCATIONS AND NOT A TABLE.
 *
 * The claim being made is not "code X selects member Y" — that is a lookup, and a lookup can be
 * right about a condition that nothing can reach. The claim is that when the core really refuses,
 * the words reach the coach. So every one of the four below drives `establishKeyMaterial` into the
 * state that throws, catches the error object the core really built, and hands THAT to the screen.
 *
 * None of them needs a Google credential: `establishKeyMaterial` takes the remote as an argument, so
 * the in-memory double — which is faithful to the measured quirks, including permitting two objects
 * of one name — reaches every one of them deterministically.
 */

/** One installation, established, so there is an envelope and a recovery object in the space. */
async function establishedSpace() {
  const remote = new InMemoryRemoteStorage({ clock: manualClock() });
  await establish(remote, device('laptop'));
  return remote;
}

async function objectsNamed(remote: Remote, name: string) {
  return (await remote.list(SPACES.HIDDEN)).filter((meta: { name: string }) => meta.name === name);
}

/**
 * A DEVICE THAT HAS NEVER REACHED THE SPACE, refusing to make a key of its own.
 *
 * `hasEverSynchronised` is an argument the caller supplies and the guard refuses unless it is exactly
 * `true`. The refusal comes before any listing is attempted, which is the whole point: the device
 * cannot know what exists, so it must not create.
 */
async function notConnectedYetCondition() {
  const remote = new InMemoryRemoteStorage({ clock: manualClock() });
  const condition = await conditionFrom(
    () => establish(remote, device('phone'), { hasEverSynchronised: false }),
    NotConnectedYet,
  );
  return { remote, condition };
}

/**
 * AN ENVELOPE THAT CANNOT BE PARSED, met by a device trying to adopt it.
 *
 * The content is replaced through the port, which is what a damaged file or one written by a newer
 * version presents as: the store hands back bytes and `parseEnvelope` cannot make a document of them.
 */
async function envelopeUnreadableCondition() {
  const remote = await establishedSpace();
  const [envelope] = await objectsNamed(remote, ENVELOPE_OBJECT_NAME);
  await remote.overwrite(envelope.file_id, 'this is not an envelope document');

  const condition = await conditionFrom(() => establish(remote, device('phone')), EnvelopeUnreadable);
  return { remote, condition };
}

/**
 * A DEVICE WITH NO SLOT OF ITS OWN AND NO RECOVERY OBJECT LEFT TO GET BACK IN THROUGH.
 *
 * The envelope survives; the recovery object does not. `core/crypto/guard.js` names this state
 * outright — recovery-object-first is the write order precisely because envelope-first would leave
 * "an envelope nobody can ever recover" — and a device meeting it has tried both slot kinds and
 * neither opened the key.
 */
async function noUsableSlotCondition() {
  const remote = await establishedSpace();
  const [recovery] = await objectsNamed(remote, RECOVERY_OBJECT_NAME);
  await remote.remove(recovery.file_id);

  const condition = await conditionFrom(() => establish(remote, device('phone')), NoUsableSlot);
  return { remote, condition };
}

/**
 * ANOTHER DEVICE'S SLOT LANDING BETWEEN OUR READ AND OUR WRITE — deterministically.
 *
 * Two devices adopting at once reaches this by luck, and a test that waits for luck is a test that
 * goes green on the run where the race did not happen. So the clash is placed exactly where the core
 * says the window is: the wrapper below lets a SECOND device complete its whole adoption during the
 * first device's `stat`, which is the read-compare-write compare. The revision has therefore moved by
 * the time the comparison is made, which is the real condition and not a simulation of one.
 *
 * The wrapper delegates every call to the real double and interleaves ONCE. `interleaved` is returned
 * so the test can prove the break actually landed — an interleave that silently failed to happen
 * would leave the run green and be indistinguishable from a core that detects nothing.
 */
async function slotAdditionRacedCondition() {
  const inner = await establishedSpace();
  const state = { interleaved: false };

  const racing = {
    list: (...args: unknown[]) => (inner.list as (...a: unknown[]) => unknown)(...args),
    read: (...args: unknown[]) => (inner.read as (...a: unknown[]) => unknown)(...args),
    create: (...args: unknown[]) => (inner.create as (...a: unknown[]) => unknown)(...args),
    overwrite: (...args: unknown[]) => (inner.overwrite as (...a: unknown[]) => unknown)(...args),
    remove: (...args: unknown[]) => (inner.remove as (...a: unknown[]) => unknown)(...args),
    async stat(...args: unknown[]) {
      if (!state.interleaved) {
        state.interleaved = true;
        // The other device adopts in full: it reads, opens through the recovery material, and adds
        // its own slot. That write is what moves the revision out from under us.
        await establish(inner, device('tablet'));
      }
      return (inner.stat as (...a: unknown[]) => unknown)(...args);
    },
  };

  const condition = await conditionFrom(
    () => establish(racing as unknown as Remote, device('phone')),
    SlotAdditionRaced,
  );
  return { remote: inner, condition, state };
}

/**
 * The candidates the core carried out of a duplicate failure, ASSERTED to be there.
 *
 * `found` is optional on the condition now, because four of the six conditions genuinely do not carry
 * it — the property is absent, not empty. That makes this an assertion rather than a formality: the
 * whole reason a screen can exist for the duplicates is that `core/crypto/guard.js` deliberately
 * carried both candidates out of the failure instead of throwing a bare error, and a core that
 * stopped doing so would leave this surface with nothing to show and no way to say which is which.
 */
function candidatesCarriedOut(condition: KeyMaterialCondition): readonly RemoteFileMeta[] {
  const found = condition.found;
  assert.ok(found !== undefined,
    'the core no longer carries the candidates out of this failure. Showing the coach "something ' +
      'clashed" with nothing to look at is barely better than saying nothing, and it is why the ' +
      'core builds this array rather than throwing a bare error');
  return found;
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
    assert.equal(candidatesCarriedOut(condition).length, 2);
  });

  it('shows BOTH candidates, each identified by the only thing that tells them apart', async () => {
    const { condition } = await duplicateEnvelopeCondition();
    const report = describeCondition(condition);

    assert.equal(report.count, 2);
    assert.equal(report.candidates.length, 2,
      'the whole reason the core carried the candidates out of the failure is that a person could ' +
        'compare them. A screen that shows one has thrown that away');

    for (const meta of candidatesCarriedOut(condition)) {
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
        const fromCore = candidatesCarriedOut(condition).some((meta) =>
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
    assert.equal(candidatesCarriedOut(condition).length, 2);

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
    for (const meta of candidatesCarriedOut(condition)) {
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
// THE TWO THAT WERE ALREADY HERE, HELD BYTE FOR BYTE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The words the two duplicate members produced BEFORE the family was extended, copied out of the
 * report and pinned here as literals.
 *
 * This is the most valuable assertion in the file and it is worth stating why. Adding four members
 * meant nulling four fields that the duplicates had always filled, and an extension that quietly
 * reworded — or quietly dropped — a sentence on the two conditions this surface was BUILT for would
 * be the most expensive thing that could go wrong here. The duplicated recovery key is the condition
 * that stays silent until somebody is recovering a wiped device: it is read once, at the worst
 * possible moment, and there is no second chance to have got its words right.
 *
 * So this is a literal snapshot rather than a comparison against the constants. Comparing against the
 * constants would pass if a constant and its use were edited together, which is exactly how a
 * sentence gets softened. Reworded copy fails here, and if the rewording is deliberate the change is
 * to this list, in the open.
 */
const DUPLICATES_AS_THEY_WERE = Object.freeze({
  'multiple_key_objects:key envelope': Object.freeze({
    title: 'There are two sets of encryption details',
    count: 2,
    countMeans: '2 were found where there should only ever be one.',
    whatHappened:
      'Your Google account is holding two sets of encryption details for this app, where there '
      + 'should only ever be one.',
    whatItMeans:
      'Each set unlocks a different part of your client medical notes — a note may open on one '
      + 'device and not the other.',
    moreDangerous: false,
    dangerNote: null,
    candidateNoun: 'Set of encryption details',
  }),
  'multiple_key_objects:recovery key': Object.freeze({
    title: 'There are two recovery keys',
    count: 2,
    countMeans: '2 were found where there should only ever be one.',
    whatHappened:
      'Your Google account is holding two recovery keys for this app, where there should only ever '
      + 'be one.',
    whatItMeans:
      'A recovery key gets your client medical notes back when a phone is lost, replaced or wiped '
      + '— with two, it is no longer certain which one would work when you need it.',
    moreDangerous: true,
    dangerNote:
      'This is the more serious of the two and gives no warning — it stays hidden until you set '
      + 'this app up again on a new or wiped phone, the one day there is no other device left to '
      + 'check against.',
    candidateNoun: 'Recovery key',
  }),
});

/** The four sentences the duplicates said before, and must still say, character for character. */
const DUPLICATE_STANDING_SENTENCES = Object.freeze({
  nothingWasChanged:
    'Nothing has been changed. This app has not deleted or chosen between them, and will not.',
  doNotDelete:
    'Do not delete either of them, or ask anyone else to: the wrong one gone means the client notes '
    + 'it protects can never be opened again.',
  doNotContinue:
    'Stop adding or changing client medical notes until this is sorted out — the rest of the app is '
    + 'unaffected.',
  whoToAsk:
    'Ask the person who set this app up for you — there is no help desk, company or manual behind '
    + 'this app, and it cannot sort this out on its own. Show them this screen.',
});

describe('extending the family left the two conditions it was built for untouched', () => {
  it('says exactly what it said before, sentence for sentence, on both duplicate members', async () => {
    for (const report of await bothReports()) {
      const before = DUPLICATES_AS_THEY_WERE[report.memberKey as keyof typeof DUPLICATES_AS_THEY_WERE];
      assert.ok(before !== undefined, `${report.memberKey} is not one of the two members this holds`);

      assert.equal(report.title, before.title, `${report.memberKey}: the heading changed`);
      assert.equal(report.count, before.count, `${report.memberKey}: the figure changed`);
      assert.equal(report.countMeans, before.countMeans,
        `${report.memberKey}: the sentence that gives the figure its scale changed. The four ` +
          'conditions added beside these two have no figure at all, and making room for that must ' +
          'not have altered the one the duplicates are for');
      assert.equal(report.whatHappened, before.whatHappened, `${report.memberKey}: what happened was reworded`);
      assert.equal(report.whatItMeans, before.whatItMeans, `${report.memberKey}: what it means was reworded`);
      assert.equal(report.moreDangerous, before.moreDangerous);
      assert.equal(report.dangerNote, before.dangerNote,
        `${report.memberKey}: the danger note changed. It belongs to the recovery key alone and it ` +
          'is the only warning that condition gives before the day it cannot be fixed');

      for (const [field, said] of Object.entries(DUPLICATE_STANDING_SENTENCES)) {
        assert.equal(
          (report as unknown as Record<string, unknown>)[field],
          said,
          `${report.memberKey}: the standing sentence "${field}" is no longer what it was. Four of ` +
            'the six conditions now word these themselves, and one of them nulls this field ' +
            'entirely — the duplicates must not have been carried along with that',
        );
      }

      assert.equal(report.candidates.length, 2, `${report.memberKey}: both candidates are no longer shown`);
      for (const candidate of report.candidates) {
        assert.ok(candidate.heading.startsWith(before.candidateNoun),
          `${report.memberKey}: a candidate is headed "${candidate.heading}" rather than with the ` +
            `noun "${before.candidateNoun}" it was headed with before`);
      }
    }
  });

  it('leaves the Admin way in worded as it was for the duplicates', async () => {
    const { condition } = await duplicateEnvelopeCondition();
    const entry = describeAdminEntry(condition, true);

    assert.equal(entry.count, 2);
    assert.equal(entry.chip, '2', 'the chip no longer carries the figure for a condition that has one');
    assert.equal(
      entry.intro,
      'More than one found where there should only ever be one. Nothing has been changed.',
    );
    assert.equal(entry.linkLabel, 'See what was found');
    assert.equal(entry.settled, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// THE FOUR REAL-REMOTE CONDITIONS, each driven into existence
// ═══════════════════════════════════════════════════════════════════════════════

describe('the device that has never connected, driven through the core', () => {
  it('reaches the screen as the refusal the core threw', async () => {
    const { condition } = await notConnectedYetCondition();

    assert.equal(condition.code, KEY_MATERIAL_CODES.NOT_CONNECTED_YET);
    assert.equal(condition.role, undefined,
      'this condition covers a single subject, so it must select its member by code alone');
    assert.equal(condition.found, undefined,
      'the core carries no candidates out of this failure — the screen must not be built to expect ' +
        'an empty array where the property is genuinely absent');

    const report = describeCondition(condition);
    assert.equal(report.memberKey, KEY_MATERIAL_CODES.NOT_CONNECTED_YET);
    assert.equal(report.asTheAppPutIt, condition.userMessage,
      'the core\'s own ready-made message is not carried through unchanged');
  });

  it('shows NO figure rather than a figure of nothing', async () => {
    const { condition } = await notConnectedYetCondition();
    const report = describeCondition(condition);

    assert.equal(report.count, null,
      'this condition found nothing, and a count of 0 on this screen reads as "nothing was found ' +
        'where one was expected" — a different and far worse story than the one being told');
    assert.equal(report.countMeans, null, 'a sentence explaining a figure that is not there');
    assert.deepEqual(report.candidates, [], 'candidates were invented for a condition that has none');
  });

  it('says WHY it refused rather than presenting itself as a fault', async () => {
    const { condition } = await notConnectedYetCondition();
    const report = describeCondition(condition);
    const said = `${report.whatHappened}\n${report.whatItMeans}`.toLowerCase();

    assert.ok(said.includes('has never connected') || said.includes('not connected'),
      'the screen does not say that this device has never connected, which is the whole reason');
    assert.ok(said.includes('second set') || said.includes('own'),
      'the screen does not say that the alternative was to make a set of its own. The refusal IS ' +
        'the feature, and a refusal presented without its reason reads as the app being broken');
    assert.ok(
      report.whatItMeans.toLowerCase().includes('everything else in the app'),
      'the screen does not say that the rest of the app still works. Only the clinical note is ' +
        'refused, and a coach who thinks the whole app has stopped will put it down',
    );
  });

  it('gives him a step he can take alone, and does not send him to another person first', async () => {
    const { condition } = await notConnectedYetCondition();
    const report = describeCondition(condition);

    assert.ok(report.whatHeCanDo.length > 0,
      'a device that only needs to be connected once is offered no way to connect it');
    const steps = report.whatHeCanDo.join(' ').toLowerCase();
    assert.ok(steps.includes('sign in') || steps.includes('connect'),
      'the steps never name signing in or connecting, which is the whole of what is needed');
    assert.equal(report.noExitOfHisOwn, null,
      'a condition with steps of its own must not also claim there is nothing he can do');
  });
});

describe('the slot addition raced by another device, driven through the core', () => {
  it('is provoked by a clash that ACTUALLY happened, not by one asserted about', async () => {
    const { condition, state } = await slotAdditionRacedCondition();

    assert.equal(state.interleaved, true,
      'the other device never got in between the read and the write, so whatever this test then ' +
        'asserted was asserted about a run in which the race did not occur');
    assert.equal(condition.code, KEY_MATERIAL_CODES.SLOT_ADDITION_RACED);

    // The detail the core carried out. A revision that did not move means the interleave ran but
    // changed nothing, which would make the detection vacuous even though the flag above is true.
    const detail = condition as unknown as { heldRevision: number; currentRevision: number };
    assert.ok(detail.currentRevision > detail.heldRevision,
      `the envelope was at revision ${detail.heldRevision} and is still at ` +
        `${detail.currentRevision}, so nothing actually moved underneath the write`);
  });

  it('tells him it is ordinary, and does NOT tell him to stop', async () => {
    const { condition } = await slotAdditionRacedCondition();
    const report = describeCondition(condition);

    assert.equal(report.doNotContinue, null,
      'this condition clears itself on the next attempt. Telling him to down tools over it would ' +
        'be the overstatement that teaches him this screen exaggerates — and the day it is ' +
        'reporting the split key is the day that lesson costs him everything');
    assert.equal(report.doNotDelete, null,
      'there are no candidates here, so a warning about deleting one is a warning about nothing');
    assert.equal(report.moreDangerous, false);
  });

  it('offers doing it again, which is the exit the core itself names', async () => {
    const { condition } = await slotAdditionRacedCondition();
    const report = describeCondition(condition);

    assert.ok(report.whatHeCanDo.length > 0, 'the one condition that fixes itself offers no way to fix it');
    assert.ok(report.whatHeCanDo.join(' ').toLowerCase().includes('again'),
      'the steps never say to do it again. The core\'s own message says "please try again in a ' +
        'moment" and this screen must not send him somewhere else instead');
    assert.ok(
      condition.userMessage.toLowerCase().includes('try again'),
      'the core no longer names retrying as the remedy. If that changed, this member\'s steps ' +
        'should be reconsidered rather than this assertion softened',
    );
  });
});

describe('the unreadable envelope, driven through the core', () => {
  it('reaches the screen as the condition the core threw', async () => {
    const { condition } = await envelopeUnreadableCondition();

    assert.equal(condition.code, KEY_MATERIAL_CODES.ENVELOPE_UNREADABLE);
    const report = describeCondition(condition);
    assert.equal(report.memberKey, KEY_MATERIAL_CODES.ENVELOPE_UNREADABLE);
    assert.equal(report.asTheAppPutIt, condition.userMessage);
  });

  it('SAYS PLAINLY that there is nothing he can do, rather than offering something that would not help', async () => {
    const { condition } = await envelopeUnreadableCondition();
    const report = describeCondition(condition);

    assert.deepEqual(report.whatHeCanDo, [],
      'a step was offered for the one condition where every step he could take either does nothing ' +
        'or destroys the only thing that could still open his notes');

    const said = report.noExitOfHisOwn;
    assert.ok(said !== null,
      'there is nothing he can do and the screen does not say so. An empty space where an action ' +
        'would be reads as an app quietly working on it, and nothing behind this screen is');
    assert.ok(said.toLowerCase().includes('nothing you can'),
      'the absence of an action is not stated plainly');
    assert.ok(report.whoToAsk !== null,
      'no step of his own AND nobody named is a dead end with no exit at all');
  });

  it('warns him off the tidying-up that would make it permanent', async () => {
    const { condition } = await envelopeUnreadableCondition();
    const report = describeCondition(condition);

    const said = report.doNotDelete;
    assert.ok(said !== null, 'a condition whose file could be deleted says nothing about not deleting it');
    assert.ok(said.toLowerCase().includes('do not delete'));
    assert.ok(said.toLowerCase().includes('never') || said.toLowerCase().includes('cannot'),
      'says not to delete without saying it is permanent, which is the part he will act on');
  });
});

describe('the device with no usable slot, driven through the core', () => {
  it('reaches the screen having tried both ways in', async () => {
    const { condition } = await noUsableSlotCondition();

    assert.equal(condition.code, KEY_MATERIAL_CODES.NO_USABLE_SLOT);
    const tried = (condition as unknown as { triedKinds: string[] }).triedKinds;
    assert.deepEqual([...tried].sort(), ['device', 'recovery'],
      'the core reports which slot kinds it tried, and a failure that tried only one is a ' +
        'different condition from the one this member words');

    const report = describeCondition(condition);
    assert.equal(report.memberKey, KEY_MATERIAL_CODES.NO_USABLE_SLOT);
    assert.equal(report.asTheAppPutIt, condition.userMessage);
  });

  it('offers signing in AND what to do if that does not work, in that order', async () => {
    const { condition } = await noUsableSlotCondition();
    const report = describeCondition(condition);

    assert.ok(report.whatHeCanDo.length >= 2,
      'only one step is offered. Signing in is the usual way back, but this failure also fires ' +
        'where there is nothing left to sign in AGAINST — a single step stated as certain is a ' +
        'promise this screen cannot keep');
    assert.ok(report.whatHeCanDo[0].toLowerCase().includes('sign in'),
      'the first step is not signing in, which is the way back the core itself names');
    assert.ok(report.whatHeCanDo[1].toLowerCase().includes('still'),
      'the second step does not begin from signing in having failed, so it does not cover the case ' +
        'the first step cannot');
  });

  it('tells him not to set the app up again, which is exactly what he would try', async () => {
    const { condition } = await noUsableSlotCondition();
    const report = describeCondition(condition);

    const said = report.doNotDelete;
    assert.ok(said !== null, 'nothing warns him off reinstalling');
    assert.ok(said.toLowerCase().includes('again') || said.toLowerCase().includes('remove'),
      'the warning does not name setting the app up again, which is the instinctive fix for a ' +
        'device that will not open something and is the one that removes the last way back');
  });

  /**
   * THE REASSURANCE IS HELD BY ITS MEANING, NOT BY THE WORD IT USED TO BE WRITTEN WITH.
   *
   * This asserted that the copy contained the word "safe". It was protecting a string rather than
   * the reassurance: the copy could keep the word and lose the meaning, and it would still pass.
   * Worse, the word was the wrong one. "Safe" on the ENCRYPTION-FAILURE screen reads as a security
   * assurance, which is the claim `src/proof/forbidden-claims.test.ts` forbids across this whole
   * repository and which this application is not entitled to make anywhere. NOT LOST is a fact
   * about storage this screen can stand behind; SAFE is not.
   *
   * So the reassurance is asserted as what it has to achieve — his notes are still there, and they
   * are in his Google account — and the wording is free to change without this going quiet.
   */
  it('says the notes are NOT LOST and are still in his account, or it reads as data loss', async () => {
    const { condition } = await noUsableSlotCondition();
    const report = describeCondition(condition);
    const said = report.whatItMeans.toLowerCase();

    assert.ok(
      /not (?:been )?lost|have not been lost|still (?:there|here)/u.test(said),
      'a screen saying a device can no longer open his client notes, without saying the notes are '
      + `not lost, is a screen that reads as data loss: ${report.whatItMeans}`,
    );
    assert.ok(
      said.includes('still in your google account'),
      'the reassurance does not say WHERE the notes still are, so it is a bare denial he has no '
      + `reason to believe: ${report.whatItMeans}`,
    );
    assert.ok(
      !/\bsafe\b|\bsecure\b/u.test(said),
      'the reassurance reaches for a security word. This screen may say the notes are not lost; it '
      + `may not say they are safe or secure: ${report.whatItMeans}`,
    );
  });

  /**
   * THE SAME REASSURANCE IS SAID TWICE ON THIS MEMBER, AND THE SECOND ONE WAS MISSED.
   *
   * The check above holds `whatItMeans`. This member says the reassurance a SECOND time on its
   * admin line, four fields away, and that copy still read "The notes themselves are safe" after
   * the first was corrected — shipped, and present in the published bundle. A fix applied to one
   * string is not applied to a subject; every field of the member that carries the reassurance is
   * held to the same rule, so the next rewording cannot leave one behind either.
   */
  it('and says it the same way on the admin line, which is the copy the first fix missed', async () => {
    const { condition } = await noUsableSlotCondition();
    const said = describeAdminEntry(condition, true).intro.toLowerCase();

    assert.ok(
      /not (?:been )?lost|still (?:there|here)/u.test(said),
      'the admin line says this device cannot open his notes without saying they are not lost: '
      + `${describeAdminEntry(condition, true).intro}`,
    );
    assert.ok(
      !/\bsafe\b|\bsecure\b/u.test(said),
      'the admin line reaches for a security word on the encryption-failure member. It may say the '
      + `notes are not lost; it may not say they are safe or secure: ${describeAdminEntry(condition, true).intro}`,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The copy, asserted by meaning
// ═══════════════════════════════════════════════════════════════════════════════

/** Everything the screen would put in front of the coach, as one body of text. */
function everythingSaid(report: ConditionReport): string {
  const parts = [
    report.title, report.countMeans ?? '', report.whatHappened, report.whatItMeans,
    report.dangerNote ?? '', report.nothingWasChanged, report.doNotDelete ?? '',
    report.doNotContinue ?? '', report.whoToAsk ?? '',
    ...report.whatHeCanDo, report.noExitOfHisOwn ?? '',
    ...report.candidates.flatMap((candidate) => [candidate.heading, ...candidate.facts.map((f) => f.label)]),
  ];
  return parts.join('\n');
}

async function bothReports(): Promise<ConditionReport[]> {
  const envelope = await duplicateEnvelopeCondition();
  const recovery = await duplicateRecoveryCondition();
  return [describeCondition(envelope.condition), describeCondition(recovery.condition)];
}

/** The condition every member words, each from the real throw. Six members, six provocations. */
async function everyCondition(): Promise<KeyMaterialCondition[]> {
  return [
    (await duplicateEnvelopeCondition()).condition,
    (await duplicateRecoveryCondition()).condition,
    (await notConnectedYetCondition()).condition,
    (await slotAdditionRacedCondition()).condition,
    (await envelopeUnreadableCondition()).condition,
    (await noUsableSlotCondition()).condition,
  ];
}

async function allReports(): Promise<ConditionReport[]> {
  return (await everyCondition()).map(describeCondition);
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
      // Present, and ASSERTED to be present. The field became nullable when four conditions with
      // nothing to delete joined the family, and a duplicate that quietly lost this sentence is the
      // regression that nullability makes possible.
      assert.ok(report.doNotDelete !== null,
        `${report.memberKey} has stopped saying anything about deleting. Two candidates are on the ` +
          'screen and removing one of them is the single action that makes this unrecoverable');
      const said = report.doNotDelete.toLowerCase();
      assert.ok(said.includes('do not delete'), `${report.memberKey} never says not to delete them`);
      assert.ok(said.includes('never') || said.includes('cannot'),
        `${report.memberKey} says not to delete without saying it is permanent. "Do not" is advice; ` +
          '"can never be opened again" is the reason he will follow it');
    }
  });

  it('tells him to stop rather than carry on', async () => {
    for (const report of await bothReports()) {
      assert.ok(report.doNotContinue !== null,
        `${report.memberKey} no longer tells him to stop. The raced-slot condition nulls this field ` +
          'deliberately because it clears itself; a duplicate key does not clear itself');
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
      assert.ok(report.whoToAsk !== null,
        `${report.memberKey} names nobody. The application will not resolve this one, so the named ` +
          'person is the ONLY exit it has — the field is nullable now, and this is the condition ' +
          'where a null would mean a dead end');
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

  /**
   * THE FORBIDDEN PHRASES ARE SCOPED TO THE CONDITIONS THEY ARE TRUE OF, and the scoping is the point.
   *
   * "Try again" is a lie on a duplicate key — nothing behind that screen can deliver it, and offering
   * it is what turns a safe read-only screen into a panic. On a slot addition raced by another device
   * it is the ACTUAL REMEDY, named by `core/crypto/errors.js` in its own message. A blanket ban would
   * force that condition to word its way around the one true thing it has to say, which is how a
   * surface ends up vague at the only moment it could have been useful.
   *
   * So the list below applies to every condition the application CANNOT resolve, and the one it can
   * is named here explicitly rather than falling out of a loop by accident.
   */
  const SELF_RESOLVING = new Set<string>([KEY_MATERIAL_CODES.SLOT_ADDITION_RACED]);

  it('offers no reassuring-sounding action on any condition the app cannot resolve', async () => {
    const forbidden = ['try again', 'we will', 'we are looking', 'automatically', 'repair', 'clean up'];
    for (const report of await allReports()) {
      if (SELF_RESOLVING.has(report.memberKey)) continue;
      const said = everythingSaid(report).toLowerCase();
      for (const phrase of forbidden) {
        assert.ok(!said.includes(phrase),
          `${report.memberKey} says "${phrase}". Nothing behind this screen can deliver that, and a ` +
            'promise the application cannot keep is what turns a safe read-only screen into a panic');
      }
    }
  });

  it('points that same check at a condition that IS allowed to say it, so the skip is not silent', async () => {
    // The exemption above is a hole in a check, and a hole nobody looks through is a hole that grows.
    // This asserts the exempted condition really does use the phrase — if it stops, the exemption is
    // dead and should go rather than sit there quietly excusing a member that no longer needs it.
    const report = describeCondition((await slotAdditionRacedCondition()).condition);
    assert.ok(SELF_RESOLVING.has(report.memberKey), 'the exempted member key is not the one exempted');
    assert.ok(everythingSaid(report).toLowerCase().includes('again'),
      'the one condition exempted from the forbidden phrases no longer needs the exemption. Remove ' +
        'it rather than leaving a check with a hole in it that nothing exercises');
  });

  it('uses no emoji in anything the coach reads', async () => {
    const strings = [
      ...STANDING_SENTENCES,
      ...(await allReports()).map(everythingSaid),
      describeNotChecked().intro,
      describeAdminEntry(null, false).intro,
      ...(await everyCondition()).map((condition) => describeAdminEntry(condition, true).intro),
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
    // `checked` was added on 2026-07-31 and is the ONE field allowed beside the condition. It says
    // whether anything surveyed the hidden space, which is what stopped this screen telling him his
    // devices agreed about keys nobody had ever looked at. It is a fact, not a way back: the
    // read-only ruling is untouched, and the callable walk below is what actually holds it.
    assert.deepEqual(Object.keys(reading), ['checked', 'condition'],
      'the key-material reading has grown a field beyond the condition and the discriminant that ' +
        'says whether anything looked. The divergence seam carries a `resolve` because a divergence ' +
        'is a question the coach answers; this one carries no way back AT ALL, deliberately, and a ' +
        'new field here is the read-only ruling being reopened');
    for (const leaf of leaves(reading)) {
      assert.notEqual(typeof leaf, 'function', 'the reading carries something callable');
    }
  });

  it('leaves the hidden space byte-for-byte as it found it', async () => {
    const { remote, condition } = await duplicateEnvelopeCondition();
    const before = await hiddenSpace(remote);

    describeCondition(condition);
    describeAdminEntry(condition, true);
    describeNotChecked();

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
  it('words every condition the core can reach on a real-remote path, and exercises all of them', async () => {
    assert.deepEqual(
      [...MEMBER_KEYS].sort(),
      [
        `${KEY_MATERIAL_CODES.MULTIPLE_KEY_OBJECTS}:${DUPLICATE_ROLES.ENVELOPE}`,
        `${KEY_MATERIAL_CODES.MULTIPLE_KEY_OBJECTS}:${DUPLICATE_ROLES.RECOVERY}`,
        KEY_MATERIAL_CODES.NOT_CONNECTED_YET,
        KEY_MATERIAL_CODES.SLOT_ADDITION_RACED,
        KEY_MATERIAL_CODES.ENVELOPE_UNREADABLE,
        KEY_MATERIAL_CODES.NO_USABLE_SLOT,
      ].sort(),
      'the family has grown or shrunk. Every member must be wordable by a person and driven from a ' +
        'real failure in this file — a member nobody exercises is copy nobody has read',
    );

    const exercised = (await allReports()).map((report) => report.memberKey);
    assert.deepEqual([...exercised].sort(), [...MEMBER_KEYS].sort(),
      'a member of the family is not provoked in this file. A mapping asserted but never reached is ' +
        'the exact failure this suite exists to rule out');
  });

  /**
   * EVERY CONDITION HAS AN EXIT, and where there is none it says so.
   *
   * The rule this screen already followed for the duplicates, now held across the whole family. It is
   * asserted as a property rather than checked member by member, because the failure it guards is a
   * SEVENTH member added later by somebody who worded what happened and forgot the way out — and a
   * per-member list would not have covered them.
   */
  it('leaves no condition without a way forward', async () => {
    for (const report of await allReports()) {
      const hasStep = report.whatHeCanDo.length > 0;
      const hasPerson = report.whoToAsk !== null;
      assert.ok(hasStep || hasPerson,
        `${report.memberKey} stops the coach with no step of his own and nobody to ask. A dead end ` +
          'is only acceptable when it has an exit that exists');

      if (!hasStep) {
        assert.ok(report.noExitOfHisOwn !== null || hasPerson,
          `${report.memberKey} offers him nothing to do and does not say so`);
      } else {
        assert.equal(report.noExitOfHisOwn, null,
          `${report.memberKey} offers steps AND claims there is nothing he can do. One of the two ` +
            'is wrong and he cannot tell which');
      }
    }
  });

  it('carries the core\'s own ready-made message through unchanged on every member', async () => {
    // The one thing on this screen the core wrote, and the reason it is here: the person helping him
    // will want to see what the app itself reported, in the app's own words.
    for (const condition of await everyCondition()) {
      const report = describeCondition(condition);
      assert.equal(report.asTheAppPutIt, condition.userMessage,
        `${report.memberKey} does not carry the core's message through unchanged. That message is ` +
          'owned by core/crypto/errors.js; a second copy reworded here is a promise written twice, ' +
          'and the copy that drifts is the one that ends up promising');
      assert.ok(condition.userMessage.length > 0, `${report.memberKey} carries an empty message`);
    }
  });

  it('gives every condition a way in from Admin that says something true about it', async () => {
    for (const condition of await everyCondition()) {
      const entry = describeAdminEntry(condition, true);
      assert.equal(entry.settled, false);
      assert.ok(entry.chip.length > 0,
        `${memberKeyOf(condition)} leaves the Admin chip empty. An empty chip reads as a card that ` +
          'failed to load rather than as a card with nothing to report');
      assert.ok(entry.intro.length > 0, `${memberKeyOf(condition)} has no words on the way in`);

      const label = entry.linkLabel.toLowerCase();
      for (const promise of ['fix', 'resolve', 'sort out', 'repair']) {
        assert.ok(!label.includes(promise),
          `the link for ${memberKeyOf(condition)} says "${entry.linkLabel}", promising to ${promise} ` +
            'something the screen behind it does not do');
      }
      if (entry.count === null) {
        assert.ok(!label.includes('found'),
          `the link for ${memberKeyOf(condition)} says "${entry.linkLabel}", but nothing was found`);
      }
    }
  });

  /**
   * The refusal, still loud, now aimed at a code that genuinely has no member.
   *
   * It used to be aimed at `no_usable_slot`, which was unbuilt at the time and is a member now. The
   * assertion is about the FAMILY'S BEHAVIOUR rather than about that particular code, so it moves to
   * one nobody has worded: a screen that improvised for an unknown condition would put words in front
   * of the coach that nobody chose, at the one moment he is least able to judge them.
   */
  it('refuses a condition nobody has worded, rather than improvising something for him to read', () => {
    const unworded: KeyMaterialCondition = {
      code: 'a_condition_added_to_the_core_after_this_screen_was_written',
      userMessage: 'A ready-made message the core wrote, which is not the same as a screen.',
    };

    assert.throws(
      () => describeCondition(unworded),
      (thrown: unknown) => {
        const said = String((thrown as Error).message);
        assert.ok(said.includes(unworded.code), 'the refusal does not name the condition it refused');
        assert.ok(said.includes('MEMBERS'), 'the refusal does not say how to fix it');
        return true;
      },
      'a condition with no member was rendered anyway. Whatever it produced is words the coach ' +
        'reads at his worst moment that nobody chose',
    );
  });

  it('refuses it on the way IN from Admin as well, so the link is never into a crash', () => {
    // The Admin card and the screen behind it make the same lookup. A card that rendered happily for
    // a condition the screen throws on would be a link into a blank page — worse than the refusal,
    // because it happens after he has been told something is wrong.
    const unworded: KeyMaterialCondition = {
      code: 'a_condition_added_to_the_core_after_this_screen_was_written',
      userMessage: 'A ready-made message the core wrote, which is not the same as a screen.',
    };

    assert.throws(() => describeAdminEntry(unworded, true), /MEMBERS/u,
      'the Admin entry worded a condition the screen behind it cannot word');
  });
});

/** The member a condition would select, for a message about a condition that has not been described. */
function memberKeyOf(condition: KeyMaterialCondition): string {
  return condition.role === undefined ? condition.code : `${condition.code}:${condition.role}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WALKED, not asserted about: the screen really rendered, for every condition
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * EVERYTHING ABOVE PROVES THE MODULE DECIDED THE RIGHT WORDS. This proves the screen DREW THEM.
 *
 * The two are not the same claim and the gap between them is where this change could have gone
 * wrong quietly. Making four fields nullable meant the drawing had to learn to skip what is not
 * there, and a skip written slightly too wide drops a sentence the module correctly produced —
 * which no assertion about the report would ever notice. The `asTheAppPutIt` block is the worked
 * example: it used to live inside the "what was found" card, so the moment that card stopped being
 * drawn for a candidate-less condition, the core's own wording would have vanished from four of the
 * six screens while every report-level test stayed green.
 *
 * So this renders the real component through React's own server renderer with the real provider, and
 * reads the words out of the markup.
 */
function rendered(condition: KeyMaterialCondition): string {
  const markup = renderToStaticMarkup(
    createElement(
      KeyMaterialProvider,
      {
        reading: { checked: true, condition },
        children: createElement(KeyMaterialConditionScreen),
      },
    ),
  );
  // The renderer escapes; the sentences carry apostrophes and dashes. Read the text back as text
  // rather than asserting against a hand-escaped copy of each sentence, which would be a second
  // encoding of the copy and would drift from the first.
  return markup
    .replace(/&#x27;|&#39;/gu, "'")
    .replace(/&quot;/gu, '"')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&');
}

describe('the screen itself, rendered, for every condition in the family', () => {
  it('draws every sentence the module decided, dropping none of them', async () => {
    for (const condition of await everyCondition()) {
      const report = describeCondition(condition);
      const markup = rendered(condition);

      const mustAppear: [string, string | null][] = [
        ['title', report.title],
        ['countMeans', report.countMeans],
        ['whatHappened', report.whatHappened],
        ['whatItMeans', report.whatItMeans],
        ['dangerNote', report.dangerNote],
        ['nothingWasChanged', report.nothingWasChanged],
        ['doNotDelete', report.doNotDelete],
        ['doNotContinue', report.doNotContinue],
        ['whoToAsk', report.whoToAsk],
        ['noExitOfHisOwn', report.noExitOfHisOwn],
        ...report.whatHeCanDo.map((step, i): [string, string] => [`whatHeCanDo[${i}]`, step]),
      ];

      for (const [field, said] of mustAppear) {
        if (said === null) continue;
        assert.ok(markup.includes(said),
          `${report.memberKey}: the screen decided "${field}" and then did not draw it. A sentence ` +
            'the module produced and the markup skipped is a requirement lost in the one place no ' +
            'assertion about the report can see');
      }
    }
  });

  it('carries the app\'s OWN words on all six, including the four that show no candidates', async () => {
    // The regression this exists for, named: `asTheAppPutIt` sat inside the candidates card, and a
    // candidate-less condition draws no candidates card.
    for (const condition of await everyCondition()) {
      const report = describeCondition(condition);
      assert.ok(rendered(condition).includes(report.asTheAppPutIt),
        `${report.memberKey}: the core's own ready-made message is not on the rendered screen. It ` +
          'is the one thing here the core itself wrote and it is what the person helping him will ' +
          'ask to see');
    }
  });

  it('draws NO figure and NO "what was found" card for a condition that found nothing', async () => {
    for (const condition of await everyCondition()) {
      const report = describeCondition(condition);
      if (report.count !== null) continue;
      const markup = rendered(condition);

      assert.ok(!markup.includes('value-display'),
        `${report.memberKey}: the screen drew the big figure for a condition that has no figure`);
      assert.ok(!markup.includes('What was found'),
        `${report.memberKey}: the screen drew a "what was found" card for a condition that found ` +
          'nothing. An empty one says a thing was looked for and is missing, which is a different ' +
          'and worse story than the one being told');
      assert.ok(!/>\s*0\s*</u.test(markup),
        `${report.memberKey}: a nought reached the rendered screen`);
    }
  });

  it('points that same check at the duplicates, which really do draw both', async () => {
    // The three assertions above are ABSENCES. An absence proves nothing until the same reading has
    // been seen to find a presence, so the same markup reading is run over the condition that has
    // candidates and must find every one of the things it just reported missing.
    const { condition } = await duplicateEnvelopeCondition();
    const markup = rendered(condition);

    assert.ok(markup.includes('value-display'), 'the reading cannot find the figure where there is one');
    assert.ok(markup.includes('What was found'), 'the reading cannot find the candidates card where there is one');
    for (const meta of candidatesCarriedOut(condition)) {
      assert.ok(markup.includes(meta.file_id),
        `candidate ${meta.file_id} is not in the rendered markup, so the screen is not showing the ` +
          'only field that tells the two apart');
    }
  });

  it('still has no control in the rendered output of any condition', async () => {
    // The source scan elsewhere in this file reads the file. This reads what was actually PRODUCED,
    // for all six, which is what a coach's browser would receive.
    for (const condition of await everyCondition()) {
      const markup = rendered(condition);
      for (const mark of ['<button', '<input', '<form', '<a ']) {
        assert.ok(!markup.includes(mark),
          `${describeCondition(condition).memberKey} rendered "${mark}". This surface is READ-ONLY ` +
            'by user ruling of 2026-07-26 and four new conditions were added to it — a control ' +
            'arriving with one of them is the ruling reopened');
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The state it is in on EVERY visit, because nothing has ever surveyed anything
// ═══════════════════════════════════════════════════════════════════════════════

describe('the unchecked state', () => {
  it('says the app has not checked, and does not reach for a softer reassurance instead', () => {
    const report = describeNotChecked();
    assert.equal(report.checked, false);
    assert.ok(report.intro.includes('Not checked yet'));

    const said = report.intro.toLowerCase();
    // The replacement may say ONE thing: that the app has not checked. These are the ways a
    // reassurance comes back wearing different clothes, and each of them would be this defect again.
    for (const drift of [
      'which is how it should be',
      'nothing to sort out',
      'devices agree',
      'will be checked',
      'nothing to worry',
      'looks fine',
      'all good',
      'so far',
    ]) {
      assert.ok(
        !said.includes(drift),
        `the unchecked state says "${drift}". It is allowed to say that the app has not checked and `
          + 'nothing else: a reassurance nobody measured is the defect, and a gentler one is the '
          + 'same defect in a new costume.',
      );
    }
    assert.ok(
      !('count' in report),
      'the unchecked report carries a figure. The "1" it used to carry was a constant in this file '
        + 'and never a count of anything the application had seen.',
    );
  });

  it('offers the way in from Admin permanently, worded for both states and promising neither a fix', async () => {
    const quiet = describeAdminEntry(null, false);
    assert.equal(quiet.checked, false);
    assert.equal(quiet.settled, false, 'settled is a measured state and nothing measured this one');
    assert.equal(quiet.count, null, 'a figure on the admin card is a claim, and nobody counted');
    assert.ok(quiet.intro.includes('Not checked yet'), 'the admin card still asserts a condition');
    assert.ok(quiet.chip.length > 0, 'an empty chip reads as a card that failed to load');
    assert.ok(quiet.linkLabel.length > 0, 'the way in has no words on it, so nothing says where it goes');
    assert.ok(
      !quiet.linkLabel.toLowerCase().includes('check for yourself'),
      'the card invites him to check for himself, and the screen behind it has not checked either',
    );

    const { condition } = await duplicateEnvelopeCondition();
    const loud = describeAdminEntry(condition, true);
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
