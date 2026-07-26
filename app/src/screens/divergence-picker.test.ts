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
 * **Four. The interface writes the log itself.** `core/journal/unwritten-kinds.test.js` asserts a
 * partition over the whole vocabulary — every kind either wired with a named owning file or unwritten
 * with a stated reason — and its scan walks `core/` ALONE. A call site in `src/` would leave that
 * test green while the partition it asserts had quietly become false. So this file scans `src/`
 * itself, and proves the scan can find what it is looking for before believing it found nothing.
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

describe('divergence-picker — the interface writes no journal entry, and the scan can prove it', () => {
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

  /**
   * Whether a source file could write to the log: it reaches for the vocabulary, or it imports the
   * journal at all.
   *
   * Deliberately NOT a plain search for the kind's name. Half the files here EXPLAIN in prose why
   * the call site belongs in the core, naming `core/journal/unwritten-kinds.test.js` while doing so
   * — and a scan that cannot tell an explanation from a call site is one that has to be defeated by
   * deleting the explanation, which is the wrong thing to lose. So it looks for CODE: a property
   * access on the vocabulary, or an import line reaching the journal.
   */
  function namesAJournalKind(text: string): boolean {
    if (text.includes('JOURNAL_KINDS.')) return true;
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('import ')) continue;
      if (trimmed.includes('journal')) return true;
    }
    return false;
  }

  it('names no journal kind anywhere under src, and this scan really walked src', () => {
    const sources = interfaceSources();
    assert.ok(sources.length > 20, 'the scan walked an empty list and would report clean regardless');

    const writers = sources
      .filter((file) => namesAJournalKind(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file).split('\\').join('/'));

    assert.deepEqual(
      writers,
      [],
      'the interface names a journal kind. `core/journal/unwritten-kinds.test.js` scans core/ ALONE, '
        + 'so a call site here leaves that suite GREEN while the partition it asserts — every kind '
        + 'either wired to a named owning file or unwritten with a stated reason — has quietly '
        + 'become false. The core applies and records; this screen only collects the choice.',
    );
  });

  it('proves the scan CAN find what it is looking for before its silence is believed', () => {
    // THE SWEEP RUN AGAINST A KNOWN POSITIVE. Its entire output is an absence: there is no count to
    // inspect and no artefact to weigh, and a sweep that is broken, misdirected or looking for the
    // wrong shape reports exactly what a clean tree reports. So the SAME function is pointed at the
    // one file in the application that genuinely does write the kind, and must say so.
    const owner = path.join(path.dirname(SRC), 'core', 'sync', 'resolution.js');
    assert.equal(
      namesAJournalKind(readFileSync(owner, 'utf8')),
      true,
      'the detector cannot see the ONE call site everybody agrees exists, so its silence about src '
        + 'is evidence of nothing whatsoever',
    );

    // And that it is not simply saying yes to everything it is handed.
    assert.equal(
      namesAJournalKind(readFileSync(path.join(SRC, 'screens', 'divergence-picker.ts'), 'utf8')),
      false,
    );
  });
});
