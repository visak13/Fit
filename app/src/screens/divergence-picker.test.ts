/**
 * THE DIVERGENCE PICKER — and the four ways a surface for this can be wrong while looking right.
 *
 * **One. The clash is FICTIONAL.** A hand-built pair of envelopes that merely looks like a
 * divergence proves the screen can draw an object of that shape and nothing else. So every
 * divergence in this file is INDUCED: two real devices, two real stores, two edits at the same
 * revision, and the core's own classifier producing the verdict. If `divergence.js` ever stops
 * calling this case a divergence, these tests stop having anything to draw rather than going on
 * passing against a fixture nobody re-derived.
 *
 * **Two. The screen shows a SUMMARY.** "There is a conflict on this client" cannot be decided by the
 * person reading it, so it gets dismissed, and a dismissed conflict is a silent lost edit with extra
 * steps. So it is asserted that every field of BOTH envelopes reaches the view, that the two columns
 * line up row for row, and that what is folded is counted rather than dropped.
 *
 * **Three. The answer never reaches the core.** The screen collects a choice; `resolveDivergence` in
 * `core/sync/resolution.js` applies it and is the one call site of `sync.conflict_resolved`. So the
 * function THE BUTTON CARRIES is the function this file invokes — not a reconstruction of it — and
 * the proof is the round trip: the chosen side reaches the other device, the entry says WHICH record
 * moved, and the question stops being asked. A resolution that left the clash in place would put the
 * same question to him on every pass until he stopped reading the surface.
 *
 * **Four. The interface INVENTS a kind.** `core/journal/unwritten-kinds.test.js` asserts a partition
 * over the whole vocabulary — every kind either wired with a named owning file or unwritten with a
 * stated reason — and its scan now walks BOTH layers, so a call site in `src/` is checked where it
 * lives rather than escaping. What is left for this file is not *whether the shell may write to the
 * log* but *whether the shell may SAY WHAT A KIND IS*: the vocabulary keeps exactly one minter and
 * gains as many referencers as it needs. See the last section of this file for the rule and its
 * per-rule known positives.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { JOURNAL_KINDS, JOURNAL_STORES, readChainPage } from '../../core/journal/journal.js';
import { aClient, aSealedValue } from '../../core/model/fixtures.js';
import { RECORD_TYPES } from '../../core/model/vocabularies.js';
import { SYNC_TRIGGERS, syncNow } from '../../core/sync/engine.js';
import { RESOLUTION_VALUES, resolveDivergence } from '../../core/sync/resolution.js';
import { T0, aWorld } from '../../core/sync/testing.js';
import { DivergenceProvider, NOTHING_TO_DECIDE } from '../shell/Divergences.tsx';
import type { DivergenceReading } from '../shell/Divergences.tsx';
import { DivergencePickerScreen } from './DivergencePickerScreen.tsx';
import {
  FIELD,
  PICKER_TITLE,
  describeChoice,
  describeChoices,
  describeQueue,
  fieldRows,
  recordTypeWord,
  titleOf,
} from './divergence-picker.ts';
import type { Choice, Divergence, Resolve } from './divergence-picker.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.dirname(here);

/** A sealed clinical note. Opaque by design: nothing outside the crypto layer may read one. */
const LAPTOP_NOTE = aSealedValue('bGFwdG9wLXNlYWxlZA==');
const PHONE_NOTE = aSealedValue('cGhvbmUtc2VhbGVk');

/**
 * Two real devices, one real client, each having edited revision N without seeing the other.
 *
 * Surfaced on the LAPTOP, so `local` is the laptop's own side and `incoming` is the phone's — which
 * is what "this device" and "your other device" mean on the screen.
 */
async function anInducedDivergence(
  world: ReturnType<typeof aWorld>,
  options: { deleteOnPhone?: boolean } = {},
) {
  const laptop = await world.device('coach-laptop');
  const phone = await world.device('coach-phone');

  const client = await laptop.store.create(
    'client',
    aClient({ name: 'Priya', notes: 'Shoulder work only', clinical_note: LAPTOP_NOTE }),
    { now: T0 },
  );
  await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
  await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });

  world.advance(60_000);
  await laptop.store.update(
    'client',
    client.record_id,
    (c: Record<string, unknown>) => ({ ...c, notes: 'Cleared for overhead press' }),
    { now: world.now() },
  );

  world.advance(60_000);
  if (options.deleteOnPhone === true) {
    await phone.store.tombstone('client', client.record_id, { now: world.now() });
  } else {
    await phone.store.update(
      'client',
      client.record_id,
      (c: Record<string, unknown>) => ({ ...c, notes: 'Still resting the shoulder', clinical_note: PHONE_NOTE }),
      { now: world.now() },
    );
  }

  await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });
  const report = await syncNow(laptop.store, world.remote, {
    trigger: SYNC_TRIGGERS.MANUAL,
    now: world.now(),
  });

  assert.equal(
    report.divergences.length,
    1,
    'the harness really did drive two devices into one clash, and the CORE called it one — this is '
      + 'not a fixture shaped like a divergence',
  );

  return { laptop, phone, client, divergence: report.divergences[0] as Divergence };
}

/**
 * The conflict entries on one device's chain, oldest first.
 *
 * The core is plain ECMAScript typed in documentation comments and is consumed here unchanged — see
 * `tsconfig.json`, where `checkJs` is off precisely so nothing in the interface creates pressure to
 * edit it. A store handle therefore has no TypeScript type to name here, and saying so plainly is
 * better than inventing an interface for it that would then be a second copy to keep in step.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function conflictEntriesOn(dev: { store: any; tag: string }) {
  const page = await dev.store.read(JOURNAL_STORES, (scope: never) =>
    readChainPage(scope, dev.tag, { limit: 500 }));
  return page.items.filter(
    (entry: { kind: string }) => entry.kind === JOURNAL_KINDS.SYNC_CONFLICT_RESOLVED,
  );
}

/** The screen, rendered exactly as the router renders it: through the seam and nothing else. */
function render(reading: DivergenceReading): string {
  return renderToStaticMarkup(
    createElement(DivergenceProvider, {
      reading,
      children: createElement(DivergencePickerScreen),
    }),
  );
}

/** A reading with a real source behind it, the way the synchronisation step will supply one. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wiredTo(store: any, pending: readonly Divergence[], now: string): DivergenceReading {
  const resolve: Resolve = async (divergence, side) => {
    await resolveDivergence(store, divergence, { side, now });
  };
  return { pending, resolve };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('divergence-picker — the queue, whose usual state is empty and is not a fault', () => {
  it('words nothing-to-decide as the good state it is, and counts it', () => {
    const queue = describeQueue([]);
    assert.equal(queue.count, 0);
    assert.equal(queue.settled, true);
    assert.equal(queue.title, PICKER_TITLE);
    assert.ok(
      queue.intro.includes('Nothing needs your decision'),
      'this screen is empty almost every time he opens it. An empty state worded as a fault is how '
        + 'a surface teaches the person reading it to stop reading it.',
    );
  });

  it('says how many are waiting, in his words rather than the schema\'s', async () => {
    const world = aWorld();
    after(() => world.close());
    const { divergence } = await anInducedDivergence(world);

    const queue = describeQueue([divergence]);
    assert.equal(queue.count, 1);
    assert.equal(queue.settled, false);
    assert.ok(!queue.intro.includes('conflict'), 'not "a conflict was detected in the sync layer"');
    assert.ok(!queue.intro.includes('divergence'));
    assert.ok(!queue.intro.includes('revision'));
  });
});

describe('divergence-picker — BOTH SIDES IN FULL, which is the whole reason it exists', () => {
  it('carries every field of both envelopes into the view, dropping none', async () => {
    const world = aWorld();
    after(() => world.close());
    const { divergence } = await anInducedDivergence(world);

    const held = new Set([
      ...Object.keys(divergence.local.content ?? {}),
      ...Object.keys(divergence.incoming.content ?? {}),
    ]);
    const drawn = new Set(fieldRows(divergence).map((row) => row.key));

    assert.ok(held.size > 1, 'the fixture has more than one field, or this proves nothing');
    assert.deepEqual(
      [...held].filter((key) => !drawn.has(key)),
      [],
      'a field of one of the two versions never reaches the screen. He is then choosing between two '
        + 'things he has not been shown, which is the summary failure wearing a longer form.',
    );
  });

  it('splits into what DIFFERS, permanently, and what is the SAME, folded and counted', async () => {
    const world = aWorld();
    after(() => world.close());
    const { divergence } = await anInducedDivergence(world);
    const choice = describeChoice(divergence);

    assert.ok(choice.differing.length > 0, 'the two devices genuinely differ somewhere');
    assert.ok(choice.identical.length > 0, 'and genuinely agree somewhere');
    assert.equal(
      choice.differing.length + choice.identical.length,
      fieldRows(divergence).length,
      'the fold and the permanent part together are the WHOLE record. Progressive disclosure moves '
        + 'a field; it never deletes one.',
    );
    for (const row of choice.differing) assert.equal(row.differs, true);
    for (const row of choice.identical) assert.equal(row.differs, false);
  });

  it('puts both sides on every row, so the two columns cannot fall out of step', async () => {
    const world = aWorld();
    after(() => world.close());
    const { divergence } = await anInducedDivergence(world);

    for (const row of fieldRows(divergence)) {
      assert.ok(row.local !== undefined && row.incoming !== undefined, `${row.key} lost a side`);
      assert.equal(typeof row.local.value, 'string');
      assert.equal(typeof row.incoming.value, 'string');
    }
  });

  it('names the record the way he does, not by its identifier', async () => {
    const world = aWorld();
    after(() => world.close());
    const { divergence } = await anInducedDivergence(world);

    assert.equal(titleOf(divergence), 'Priya');
    assert.ok(!describeChoice(divergence).title.includes(divergence.record_id));
  });

  it('has a plain word for every record type the vocabulary has', () => {
    for (const type of RECORD_TYPES) {
      const word = recordTypeWord(type);
      assert.ok(word.length > 0, `${type} has no word`);
      assert.ok(
        !word.includes('-'),
        `"${type}" reaches the coach as its schema name. A record type added to the core and `
          + 'forgotten here is a hyphenated identifier in the middle of a sentence he is being asked '
          + 'to make a decision from.',
      );
    }
  });
});

describe('divergence-picker — a sealed value shows THAT it differs and never WHAT it is', () => {
  it('never renders the ciphertext, and says so in words a coach can act on', async () => {
    const world = aWorld();
    after(() => world.close());
    const { divergence } = await anInducedDivergence(world);

    const note = fieldRows(divergence).find((row) => row.key === 'clinical_note');
    assert.ok(note !== undefined, 'the fixture carries a sealed field, or this proves nothing');
    assert.equal(note.local.kind, FIELD.SEALED);
    assert.equal(note.incoming.kind, FIELD.SEALED);

    for (const side of [note.local, note.incoming]) {
      assert.ok(!side.value.includes(LAPTOP_NOTE.ct), 'ciphertext reached the screen');
      assert.ok(!side.value.includes(PHONE_NOTE.ct), 'ciphertext reached the screen');
      assert.ok(!side.value.includes(LAPTOP_NOTE.iv), 'the initialisation vector reached the screen');
      assert.equal(side.detail, null, 'and there is no fold holding it either');
    }
  });

  it('still reports that the two sealed values are NOT the same', async () => {
    const world = aWorld();
    after(() => world.close());
    const { divergence } = await anInducedDivergence(world);

    const note = fieldRows(divergence).find((row) => row.key === 'clinical_note');
    assert.equal(
      note?.differs,
      true,
      'omitting a field nothing can read would hide a difference he is choosing between; pretending '
        + 'to render it would be a lie. The third option — say it differs, show nothing — is the '
        + 'only honest one, and it is decidable without reading either value.',
    );
  });
});

describe('divergence-picker — the deletion case, which is the one he most needs to see', () => {
  it('marks it, warns in words, and says what is lost rather than naming a category', async () => {
    const world = aWorld();
    after(() => world.close());
    const { divergence } = await anInducedDivergence(world, { deleteOnPhone: true });
    const choice = describeChoice(divergence);

    assert.equal(choice.involvesDeletion, true);
    assert.equal(choice.chipTone, 'warning');
    assert.ok(choice.chipWord.includes('Deleted'), 'the WORD carries it, not only the tone');
    assert.ok(choice.deletionWarning !== null, 'the costliest case is not left to the tone alone');
    assert.ok(
      choice.deletionWarning.includes('cannot be brought') && choice.deletionWarning.includes('deletion'),
      'one device is about to lose a client\'s history to the other\'s tidy-up. The warning has to '
        + 'say what he stands to lose, not that a deletion was detected.',
    );

    const deleting = choice.sides.find((side) => side.deleted);
    assert.ok(deleting !== undefined);
    assert.ok(
      deleting.buttonLabel.includes('deletion'),
      'the button says he is keeping a DELETION, not "this version" — the words on the control are '
        + 'the last thing he reads before the record goes',
    );
  });

  it('does not let the deleted side name a device, because it sits inside one device\'s column', async () => {
    const world = aWorld();
    after(() => world.close());
    const { laptop, phone, divergence } = await anInducedDivergence(world, { deleteOnPhone: true });

    const deletedSide = fieldRows(divergence).map((row) => row.incoming);
    assert.ok(deletedSide.length > 0);
    for (const value of deletedSide) {
      assert.equal(value.kind, FIELD.ABSENT, 'a deletion carries no content at all');
      assert.ok(
        !value.value.includes('this device') && !value.value.includes(laptop.tag) && !value.value.includes(phone.tag),
        `"${value.value}" names a device while being drawn inside the column of one. It shipped `
          + 'once reading "Deleted on this device" in the OTHER device\'s column, contradicting the '
          + 'heading directly above it — found by looking at the rendered screen, which is the only '
          + 'thing that could have found it.',
      );
    }
  });

  it('says nothing about deletion when neither side deleted anything', async () => {
    const world = aWorld();
    after(() => world.close());
    const { divergence } = await anInducedDivergence(world);
    const choice = describeChoice(divergence);

    assert.equal(choice.involvesDeletion, false);
    assert.equal(choice.deletionWarning, null, 'a warning shown every time is a warning he stops reading');
    for (const side of choice.sides) assert.equal(side.deleted, false);
  });
});

describe('divergence-picker — the two answers come from the core, and it supplies neither', () => {
  it('offers exactly the answers core/sync/resolution.js declares', async () => {
    const world = aWorld();
    after(() => world.close());
    const { divergence } = await anInducedDivergence(world);

    const offered = describeChoice(divergence).sides.map((side) => side.side);
    assert.deepEqual(
      offered,
      RESOLUTION_VALUES,
      'the buttons are built from the core\'s list rather than from two spelled strings, so a third '
        + 'answer is a change in one place and this screen follows it',
    );
  });

  it('offers no way to answer at all when no source is wired', async () => {
    const world = aWorld();
    after(() => world.close());
    const { divergence } = await anInducedDivergence(world);

    for (const side of describeChoice(divergence).sides) {
      assert.equal(
        side.press,
        null,
        'a button that cannot do what its words say is worse than no button. Today nothing is wired, '
          + 'so nothing is offered.',
      );
    }
  });
});

describe('divergence-picker — the screen, rendered', () => {
  it('DRAWS BOTH SIDES IN FULL — both devices, and both of their values', async () => {
    const world = aWorld();
    after(() => world.close());
    const { laptop, phone, divergence } = await anInducedDivergence(world);

    const html = render({ pending: [divergence], resolve: null });

    // Both devices are named, so he can tell which version is which.
    assert.ok(html.includes(laptop.tag), 'the local device is never named on screen');
    assert.ok(html.includes(phone.tag), 'the other device is never named on screen');

    // And both of their DIFFERING values are actually drawn. This is the assertion that fails if
    // the screen is ever reduced to one column, or to a summary of the clash.
    assert.ok(
      html.includes('Cleared for overhead press'),
      'this device\'s own version is not on screen',
    );
    assert.ok(
      html.includes('Still resting the shoulder'),
      'THE OTHER DEVICE\'S VERSION IS NOT ON SCREEN. He is being asked to choose between two things '
        + 'while being shown one of them, which is a dismissal waiting to happen — and a dismissed '
        + 'conflict is a silent lost edit with extra steps.',
    );
  });

  it('draws the count, the fold and its number, so nothing folded is unaccounted for', async () => {
    const world = aWorld();
    after(() => world.close());
    const { divergence } = await anInducedDivergence(world);
    const choice = describeChoice(divergence);

    const html = render({ pending: [divergence], resolve: null });
    assert.ok(html.includes('The same on both versions'), 'the identical fields are not folded away');
    assert.ok(
      html.includes(`<span class="count">${choice.identical.length}</span>`),
      'the fold does not carry its count, so what is collapsed is not accounted for',
    );
  });

  it('draws the deletion case distinctly, in words and not only in tone', async () => {
    const world = aWorld();
    after(() => world.close());
    const { divergence } = await anInducedDivergence(world, { deleteOnPhone: true });
    const choice = describeChoice(divergence);

    const html = render({ pending: [divergence], resolve: null });
    assert.ok(html.includes('chip chip-warning'), 'the deletion case is drawn as an ordinary change');
    assert.ok(html.includes('note-warning'), 'the warning is not on the screen at all');
    assert.ok(
      choice.deletionWarning !== null && html.includes(choice.deletionWarning.slice(0, 40)),
      'the warning words the derivation produced are not the words drawn',
    );
  });

  it('renders no ciphertext anywhere in the document', async () => {
    const world = aWorld();
    after(() => world.close());
    const { divergence } = await anInducedDivergence(world);

    const html = render({ pending: [divergence], resolve: null });
    for (const secret of [LAPTOP_NOTE.ct, PHONE_NOTE.ct, LAPTOP_NOTE.iv]) {
      assert.ok(!html.includes(secret), 'a sealed value reached the markup');
    }
  });

  it('offers no buttons with nothing wired, and one per side once something is', async () => {
    const world = aWorld();
    after(() => world.close());
    const { laptop, divergence } = await anInducedDivergence(world);

    const unwired = render({ pending: [divergence], resolve: null });
    assert.ok(!unwired.includes('<button'), 'a control that cannot act was offered anyway');

    const wired = render(wiredTo(laptop.store, [divergence], world.now()));
    for (const side of describeChoice(divergence).sides) {
      assert.ok(wired.includes(side.buttonLabel), `no button says "${side.buttonLabel}"`);
    }
  });

  it('says nothing needs deciding, calmly, when nothing does', () => {
    const html = render(NOTHING_TO_DECIDE);
    assert.ok(html.includes('Nothing needs your decision'));
    assert.ok(!html.includes('<button'), 'nothing to answer, nothing to press');
    assert.ok(html.includes('id="screen-divergences"'), 'the screen still renders itself');
  });

  it('carries no emoji in anything a person can read', async () => {
    const world = aWorld();
    after(() => world.close());
    const { divergence } = await anInducedDivergence(world, { deleteOnPhone: true });

    const html = render({ pending: [divergence], resolve: null });
    for (const character of html) {
      const point = character.codePointAt(0) ?? 0;
      assert.ok(
        point < 0x1f000 || point > 0x1ffff,
        `an emoji (U+${point.toString(16)}) reached a user-facing string. They render differently on `
          + 'every device, carry no accessible name, and cannot be recoloured by a token.',
      );
    }
  });
});

describe('divergence-picker — the answer reaches the core seam, and the question stops', () => {
  it('applies the side he pressed, through the button\'s own function', async () => {
    const world = aWorld();
    after(() => world.close());
    const { laptop, client, divergence } = await anInducedDivergence(world);

    const reading = wiredTo(laptop.store, [divergence], world.now());
    const [choice] = describeChoices(reading.pending, reading.resolve) as readonly Choice[];

    // The very object the button carries. Not a reconstruction of what it would have called: WHICH
    // clash bound to WHICH side is the one thing a picker can get catastrophically wrong.
    const keepTheOtherDevice = choice.sides[1];
    assert.ok(keepTheOtherDevice.press !== null, 'a wired reading offers a press');
    await keepTheOtherDevice.press();

    const held = await laptop.store.get('client', client.record_id);
    assert.equal(held.content.notes, 'Still resting the shoulder', 'his answer was applied');
    assert.ok(
      held.rev > divergence.rev,
      'and it was written ABOVE the revision both sides claimed, or it loses the last-write-wins '
        + 'race minutes later with nothing having errored',
    );
  });

  it('writes ONE entry that says which record moved, not merely that something did', async () => {
    const world = aWorld();
    after(() => world.close());
    const { laptop, client, divergence } = await anInducedDivergence(world);

    assert.deepEqual(await conflictEntriesOn(laptop), [], 'surfacing one records nothing');

    const reading = wiredTo(laptop.store, [divergence], world.now());
    const [choice] = describeChoices(reading.pending, reading.resolve) as readonly Choice[];
    await choice.sides[0].press?.();

    const entries = await conflictEntriesOn(laptop);
    assert.equal(entries.length, 1, 'one answer, one entry');
    assert.deepEqual(entries[0].subject, { type: 'client', record_id: client.record_id });
    assert.equal(
      entries[0].affected_count,
      1,
      'a count of zero for a resolution that moved a record is the s13 defect pointing the other '
        + 'way: fully wired, and asserting something false',
    );
  });

  it('STOPS ASKING once he has answered — on both devices, several passes later', async () => {
    const world = aWorld();
    after(() => world.close());
    const { laptop, phone, divergence } = await anInducedDivergence(world);

    const reading = wiredTo(laptop.store, [divergence], world.now());
    const [choice] = describeChoices(reading.pending, reading.resolve) as readonly Choice[];
    await choice.sides[0].press?.();

    world.advance(60_000);
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });
    const onPhone = await syncNow(phone.store, world.remote, {
      trigger: SYNC_TRIGGERS.MANUAL,
      now: world.now(),
    });
    world.advance(60_000);
    const backOnLaptop = await syncNow(laptop.store, world.remote, {
      trigger: SYNC_TRIGGERS.MANUAL,
      now: world.now(),
    });

    for (const [where, report] of [['the phone', onPhone], ['the laptop', backOnLaptop]] as const) {
      assert.deepEqual(
        report.divergences,
        [],
        `${where} is still asking. Asserting only that the chosen answer ARRIVED passes while the `
          + 'application goes on putting the same already-answered question to him on every pass, '
          + 'which is how a surface teaches the person reading it to stop reading it.',
      );
      assert.equal(describeQueue(report.divergences).settled, true);
    }

    assert.ok(
      render(wiredTo(laptop.store, backOnLaptop.divergences, world.now())).includes(
        'Nothing needs your decision',
      ),
      'and the screen he lands on afterwards says so',
    );
  });

  it('records no resolution for an ordinary pull, so the log does not overstate the clashes', async () => {
    const world = aWorld();
    after(() => world.close());
    const laptop = await world.device('coach-laptop');
    const phone = await world.device('coach-phone');

    const client = await laptop.store.create('client', aClient({ name: 'Sequential' }), { now: T0 });
    await syncNow(laptop.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: T0 });
    world.advance(60_000);
    await phone.store.update(
      'client',
      client.record_id,
      (c: Record<string, unknown>) => ({ ...c, notes: 'phone' }),
      { now: world.now() },
    );
    await syncNow(phone.store, world.remote, { trigger: SYNC_TRIGGERS.MANUAL, now: world.now() });
    const report = await syncNow(laptop.store, world.remote, {
      trigger: SYNC_TRIGGERS.MANUAL,
      now: world.now(),
    });

    assert.deepEqual(report.divergences, [], 'a sequential edit is not a clash');
    assert.deepEqual(
      await conflictEntriesOn(laptop),
      [],
      'the ordinary supersede path must stay unable to say a conflict was resolved. A log in which '
        + 'every pull is a collision cannot be read for collisions.',
    );
  });
});

/**
 * ONE MINTER, MANY REFERENCERS — the rule this section enforces, and why it replaced a list.
 *
 * ## What was here before, and why it could not stay
 *
 * A blanket "nothing under `src` names a journal kind", whose STATED reason was that
 * `core/journal/unwritten-kinds.test.js` scanned `core/` alone — so a shell call site would have
 * left that suite green while its partition quietly became false. That scan now walks both layers,
 * which retired the premise, and the ban was rewritten as a PARTITION with one named exemption:
 * `platform/google-account.ts`, because the core is provider-neutral and cannot know Google exists.
 *
 * That exemption was correct and it was still the wrong shape. The account connection is not the
 * last honest thing the shell will record — the calendar path and synchronisation are being written
 * from here for the same provider-neutrality reason — and under a partition EACH needs a NEW ENTRY,
 * written by the very worker whose code the guard just stopped. An invariant that acquires an
 * exception per honest caller has stopped being an invariant and become a list of names.
 *
 * ## So the rule is about MINTING, not about writing
 *
 * The vocabulary keeps exactly one minter — `core/journal/kinds.js` — and gains as many referencers
 * as the application needs.
 *
 *  - **FORBIDDEN: originating a kind in the shell.** A bare string literal that spells a kind, or a
 *    locally declared kinds map, or reaching around property access into the imported constant. All
 *    of them put the VALUE, or a second name for it, in the shell, where it drifts from the core's
 *    silently.
 *  - **PERMITTED: importing the core's constant and using it**, property access included. That
 *    duplicates nothing, and a rename in `kinds.js` then breaks it LOUDLY at the call site instead
 *    of leaving two vocabularies that disagree.
 *
 * ## THE GUARD READS THE VOCABULARY FROM THE CORE, and that is not a convenience
 *
 * A guard that re-listed the kinds in order to forbid re-listing them would be the second minter it
 * exists to prevent, sitting inside the check written to forbid it — and it would pass, because a
 * guard does not scan itself. So {@link KIND_VALUES} and {@link KIND_NAMES} below are derived from
 * the imported `JOURNAL_KINDS` at scan time. A kind added to the core is covered by this guard the
 * moment it is added, with nothing to remember.
 *
 * ## WHAT THIS RULE CATCHES AND WHAT IT DOES NOT — stated, not left to be discovered
 *
 * It is a TEXTUAL scan, as both guards in this application already are. What follows is therefore a
 * claim about what a text scan can see, which is smaller than a claim about what the code can do.
 *
 * CAUGHT: a bare `'auth.account_connected'` in single or double quotes (rule A); an object entry
 * binding one of the core's own kind NAMES to a string of the shell's own, whether that string
 * matches the core's or has already drifted from it (rule B — the drifted case is exactly what rule
 * A cannot see, because a drifted value is by definition not in the vocabulary); and every way of
 * reaching the imported constant OTHER than dotted property access (rule C): bracket access with a
 * locally built or computed key, a spread, binding the whole vocabulary to a name of its own,
 * renaming it on import or export, re-exporting it — the alias a later reader would treat as
 * authoritative — and re-typing it with a type assertion.
 *
 * That last arm was added because a probe found the hole: `(JOURNAL_KINDS as Record<string,
 * string>)[builtKey]` puts the vocabulary behind parentheses where the bracket arm cannot see it,
 * and the cast is exactly what a shell file must write to make a built key type-check. The arm is
 * broad — it refuses ANY assertion on the constant — and that is deliberate rather than sloppy:
 * the core's constant is already frozen and already has literal types, so there is nothing an
 * honest shell file needs to re-type it for.
 *
 * NOT CAUGHT, each deliberately:
 *
 *  - **A kind spelled in a TEMPLATE LITERAL.** Backticks are not matched, because this codebase's
 *    documentation writes kind values in backtick code spans — `auth.account_connected` in the
 *    header of `src/platform/google-account.ts` is one — so a backtick-matching rule would fail an
 *    honest production file on its own prose. Comment-stripping would fix that, and a wrong
 *    comment-stripper silently weakens the whole scan, which is a worse failure than this gap.
 *  - **A kind assembled by CONCATENATION**, `'auth.' + 'account_connected'`. Neither fragment is a
 *    kind, so no textual rule sees it. Note the narrower half of this shape is not a gap at all:
 *    concatenating onto an imported fragment, `JOURNAL_KINDS.SYNC_STARTED + '.retry'`, produces a
 *    value the vocabulary does not contain, and `assertKind` throws on it at the first call — loud,
 *    not silent, which is the failure mode this rule cares about.
 *  - **A map with drifted values AND renamed keys**, `{ connected: 'auth.acount_connected' }`. Rule
 *    B keys on the core's own names, so this escapes it. It is also no longer a shadow of the
 *    vocabulary: it is an object of wrong strings, and `assertKind` refuses each one.
 *  - **`export const X = JOURNAL_KINDS.ACCOUNT_CONNECTED`** — a single kind re-exported under a new
 *    name. Rule C permits it, and that is a judgement rather than an oversight: it originates no
 *    value, stays coupled to the core, and breaks loudly on a rename. What rule C forbids is
 *    aliasing the VOCABULARY, which is the thing a later reader mistakes for authoritative.
 *
 * ## AND WHAT THE OLD BLANKET BAN COULD CATCH THAT THIS CANNOT
 *
 * One thing, honestly: the old detector fired on ANY import line reaching the journal, so it caught
 * a shell file that had begun to depend on the log at all — before it had written anything. This
 * rule does not, and cannot, because that dependency is now the PERMITTED case. That is a narrowing
 * and it is named as one. Everything else the old ban caught was a `JOURNAL_KINDS.` property access,
 * which this rule deliberately permits. Beyond that the two are differently shaped rather than one
 * being weaker: rule B sees a drifted kinds map and rule C sees a bracket-access or an alias, and
 * the old blanket ban saw neither — it never had to look, because it forbade the import above them.
 *
 * Tests are excluded from the scan by SHAPE — a `.test.ts` names kinds in order to assert about
 * them, and this file is one — rather than by a list of file names, because a list of file names is
 * what this whole section exists to remove.
 */
describe('divergence-picker — the interface may REFERENCE a journal kind and may not MINT one', () => {
  /**
   * The vocabulary, READ FROM THE CORE at scan time. Never re-listed here — see the header: a guard
   * that copied the vocabulary in order to forbid copying it would be the defect wearing the cure.
   */
  const KIND_VALUES: ReadonlySet<string> = new Set(Object.values(JOURNAL_KINDS));
  const KIND_NAMES: readonly string[] = Object.keys(JOURNAL_KINDS);

  /** Every shipped interface source file. Tests excluded: they name the kind to assert about it. */
  function interfaceSources(): string[] {
    const found: string[] = [];
    for (const name of readdirSync(SRC, { recursive: true })) {
      const posix = String(name).split('\\').join('/');
      if (!posix.endsWith('.ts') && !posix.endsWith('.tsx')) continue;
      if (posix.endsWith('.test.ts') || posix.endsWith('.test.tsx')) continue;
      found.push(path.join(SRC, String(name)));
    }
    return found;
  }

  /** Single- and double-quoted string literals. Backticks deliberately excluded — see the header. */
  const QUOTED = /'([^'\\\n]*)'|"([^"\\\n]*)"/g;

  /** RULE A — the value itself, spelled in the shell. */
  function mintsAKindValue(text: string): string | null {
    for (const match of text.matchAll(QUOTED)) {
      const literal = match[1] ?? match[2] ?? '';
      if (KIND_VALUES.has(literal)) {
        return `spells the kind '${literal}' as a bare string literal instead of naming it`;
      }
    }
    return null;
  }

  /**
   * RULE B — a second vocabulary, keyed by the core's own names.
   *
   * Built from `KIND_NAMES` rather than from a pattern, so the entry it catches is one that claims
   * to BE a kind of the core's rather than merely to look like one. This is what sees the map whose
   * value has ALREADY drifted, which rule A cannot: a drifted value is not in the vocabulary.
   */
  const KINDS_MAP_ENTRY = new RegExp(String.raw`(?:^|[{,])\s*(${KIND_NAMES.join('|')})\s*:\s*['"]`, 'm');

  function declaresAKindsMap(text: string): string | null {
    const found = KINDS_MAP_ENTRY.exec(text);
    return found === null ? null
      : `declares its own kinds map, binding ${found[1]} to a string of its own. A second `
        + 'vocabulary agrees with the first exactly until it does not, and nothing says when';
  }

  /**
   * RULE C — every way of reaching the imported constant other than dotted property access.
   *
   * Property access is the permitted shape precisely because a rename in the core breaks it at the
   * call site. Each of these loses that: a bracket key is a string the shell built, and an alias or
   * a re-export is a second name for the vocabulary that the next reader treats as authoritative.
   */
  const REACHES_AROUND_PROPERTY_ACCESS: readonly (readonly [RegExp, string])[] = Object.freeze([
    Object.freeze([/\bJOURNAL_KINDS\s*\[/,
      'reaches the vocabulary by BRACKET ACCESS, whose key the shell builds — a rename in the core '
      + 'then yields `undefined` silently rather than failing here'] as const),
    Object.freeze([/\.\.\.\s*JOURNAL_KINDS\b/,
      'SPREADS the vocabulary into an object of its own, which is a copy taken at import time'] as const),
    Object.freeze([/=\s*JOURNAL_KINDS\b(?!\s*\.)/,
      'binds the WHOLE vocabulary to a name of its own'] as const),
    Object.freeze([/[{,]\s*\bJOURNAL_KINDS\s+as\s+\w/,
      'RENAMES the vocabulary in an import or export clause, creating a second name for it'] as const),
    Object.freeze([/export\s*\{[^}]*\bJOURNAL_KINDS\b[^}]*\}/,
      'RE-EXPORTS the vocabulary, so the shell becomes a place it can be imported FROM'] as const),
    // Last, and broad on purpose. A cast is how bracket access is smuggled past the type checker —
    // `(JOURNAL_KINDS as Record<string, string>)[builtKey]` puts the vocabulary behind parentheses
    // where the bracket rule above cannot see it. There is no legitimate reason for the shell to
    // re-type the core's frozen constant, so any assertion on it is refused rather than parsed.
    Object.freeze([/\bJOURNAL_KINDS\s+as\s/,
      'RE-TYPES the vocabulary with a type assertion, which is the shape that smuggles a built key '
      + 'past the type checker'] as const),
  ]);

  function aliasesTheVocabulary(text: string): string | null {
    for (const [pattern, why] of REACHES_AROUND_PROPERTY_ACCESS) {
      if (pattern.test(text)) return why;
    }
    return null;
  }

  /** The three rules together. Null means the file may name kinds all it likes — it originates none. */
  function originatesAKind(text: string): string | null {
    return mintsAKindValue(text) ?? declaresAKindsMap(text) ?? aliasesTheVocabulary(text);
  }

  function offendersUnderSrc(): string[] {
    return interfaceSources()
      .map((file) => ({ file, why: originatesAKind(readFileSync(file, 'utf8')) }))
      .filter((found): found is { file: string; why: string } => found.why !== null)
      .map(({ file, why }) => `${path.relative(SRC, file).split('\\').join('/')} — ${why}`);
  }

  it('lets no interface file ORIGINATE a kind, and this scan really walked src', () => {
    const sources = interfaceSources();
    assert.ok(sources.length > 20, 'the scan walked an empty list and would report clean regardless');

    assert.deepEqual(
      offendersUnderSrc(),
      [],
      'an interface file says what a kind IS. There is one minter — core/journal/kinds.js — and any '
        + 'number of referencers: import JOURNAL_KINDS and name the kind through it. Do NOT add this '
        + 'file to an exception list; there is deliberately no list to add it to, because a rule that '
        + 'acquires an exception per honest caller is a list of names wearing a rule\'s clothes.',
    );
  });

  it('PERMITS the shell file that imports the constant and uses it — proven on the real one', () => {
    // The permit side, in the same run as the forbid side. A rule that is green because nothing
    // exercises it is not a rule; this points at the file that genuinely does reference the
    // vocabulary from the shell, and requires it to reference it AND to pass.
    const referencer = path.join(SRC, 'platform', 'google-account.ts');
    const text = readFileSync(referencer, 'utf8');

    assert.ok(
      text.includes('JOURNAL_KINDS.'),
      'the file chosen to prove the PERMIT side no longer references the vocabulary at all, so its '
        + 'passing says nothing. Point this at whichever shell file does.',
    );
    assert.equal(
      originatesAKind(text),
      null,
      'the guard fails the one shell file that does exactly what the rule permits — imports the '
        + 'core\'s constant and names a kind through it. The guard is wrong, not the file.',
    );
  });

  it('proves EACH of the three rules can fire, against real files rather than a fixture', () => {
    // A guard whose entire output is an absence reports the same thing when it is broken as when
    // the tree is clean. One known positive PER RULE, because a scanner alive in one rule and blind
    // in another is indistinguishable from an honest absence — and two of these rules exist
    // precisely to see what the third cannot.
    const CORE = path.dirname(SRC);
    const minter = readFileSync(path.join(CORE, 'core', 'journal', 'kinds.js'), 'utf8');
    const barrel = readFileSync(path.join(CORE, 'core', 'journal', 'journal.js'), 'utf8');

    assert.ok(KIND_VALUES.size > 10 && KIND_NAMES.length === KIND_VALUES.size,
      'the vocabulary was read from the core as an empty or degenerate set, which would make rules '
      + 'A and B pass for free over the whole of src');

    // Rule A. The one file in the application that is SUPPOSED to spell every kind out.
    assert.ok(mintsAKindValue(minter) !== null,
      'rule A cannot see a bare kind string in the file that is nothing but bare kind strings');
    // Rule B. `JOURNAL_KINDS` in that same file IS a kinds map — the legitimate one.
    assert.ok(declaresAKindsMap(minter) !== null,
      'rule B cannot see a map binding the core\'s own kind names to kind strings, in the file that '
      + 'defines exactly that. It would then be blind to the drifted map, which is the only shape '
      + 'rule A can never catch.');
    // Rule C. The journal barrel re-exports the vocabulary — the alias shape, in real code.
    assert.ok(aliasesTheVocabulary(barrel) !== null,
      'rule C cannot see a re-export of the vocabulary in the barrel that re-exports it');

    // And that none of the three simply says yes to whatever it is handed.
    const innocent = readFileSync(path.join(SRC, 'screens', 'divergence-picker.ts'), 'utf8');
    assert.equal(originatesAKind(innocent), null,
      'a file that mentions no kind at all is reported as originating one, so a clean result from '
      + 'this guard would mean nothing either');
  });
});
