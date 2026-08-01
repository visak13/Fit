/**
 * THE TWO EXPORT CARDS REACH THE COACH — the mount, proven by RENDERING the real admin screen.
 *
 * `LibraryBackupCard` and `FullExportCard` were built, tested and green, and until this action they
 * were CALLED BY NOTHING: two finished capabilities the coach could not get to. That is the defect
 * this whole step exists to close, and it is invisible to every test either card already has,
 * because a card's own suite renders the card. So nothing here renders a card. It renders
 * `AdminScreen` through the providers `App.tsx` wires around it and reads what came out.
 *
 * The four claims:
 *
 *   ONE — BOTH CARDS ARE ON THE PAINTED SCREEN once the store is open. Asserted FIRST, before any
 *   ordering or word check, so no earlier tally can shadow the one assertion the action is for.
 *
 *   TWO — AND THEY ARE REALLY CONDITIONAL ON THAT, which is what stops claim ONE being true of a
 *   card mounted behind a condition that always holds. The same paint with the store still opening
 *   carries NEITHER card — and that absence is only worth anything if the render itself produced a
 *   screen, so the cards that are permanent on this screen are asserted PRESENT in the same run.
 *   An absence proven against a blank string has proven nothing.
 *
 *   THREE — THE ORDER. The backup is above the export, and both are above the reset. That is not
 *   decoration: the reset is the only path back to the shipped library and it must offer a backup
 *   first, so the control that makes one being BELOW it would be a control he finds afterwards.
 *   Every index is asserted found before any two are compared.
 *
 *   FOUR — THE WORDS THESE TWO CARDS PUT ON THE SCREEN never use "rest" to mean the remainder,
 *   anywhere near an application whose sessions have a field called rest. The scope is DISCOVERED
 *   from the two modules' own string exports at runtime rather than typed out here, asserted
 *   non-empty, and carries a POSITIVE CONTROL in the same run: a scan that cannot catch the misuse
 *   where it demonstrably is has proven nothing about the sentences where it found none.
 *
 *     node --import ./tools/tsx-test-hook.mjs --test src/screens/export-cards-mounted.test.ts
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { seedIfNeeded } from '../../core/seed/import.js';
import { openLocalStore } from '../../core/store/store.js';
import { createLaptop } from '../../core/store/testing/platform-double.js';

import { AdminScreen } from './AdminScreen';
import { LocalStoreProvider } from '../platform/LocalStore';
import { PlatformStatusProvider } from '../platform/platform-status';
import { DivergenceProvider, NOTHING_TO_DECIDE } from '../shell/Divergences';
import { KeyMaterialProvider, NO_KEY_MATERIAL_CONDITION } from '../shell/KeyMaterial';
import { NOTHING_AWAITING_REMOVAL, RemovalsProvider } from '../shell/Removals';
import { NOTHING_STOPPED, StoppedChangesProvider } from '../shell/StoppedChanges';
import { NO_BACKUP_YET, SyncStatusProvider } from '../shell/SyncStatus';
import { DESTINATIONS } from '../shell/navigation';
import type { Destination } from '../shell/navigation';

import * as backupWords from './library-backup-export';
import * as exportWords from './full-export';
import { LIBRARY_BACKUP_HEADING } from './library-backup-export';
import { FULL_EXPORT_HEADING } from './full-export';

/** Stores opened by this file, closed once at the end whatever happened. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const opened: any[] = [];

after(async () => {
  for (const store of opened) {
    // eslint-disable-next-line no-await-in-loop
    await store.close();
  }
});

/** A real store on the core's own in-process database. Nothing here is a stub of one. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aSeededStore(): Promise<any> {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });
  opened.push(store);
  await seedIfNeeded(store);
  return store;
}

const ADMIN: Destination = (() => {
  const found = DESTINATIONS.find((destination) => destination.path === 'admin');
  if (found === undefined) throw new Error('there is no admin destination to render');
  return found;
})();

/** The real admin screen, inside the providers `App.tsx` wires around it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function paint(opening: any): string {
  const screen: ReactNode = createElement(AdminScreen, { destination: ADMIN });
  return renderToStaticMarkup(
    createElement(LocalStoreProvider, {
      opening,
      children: createElement(PlatformStatusProvider, {
        status: { buildStamp: 'test-build', persistence: null, offlineStart: { registered: true, reason: null } },
        children: createElement(SyncStatusProvider, {
          reading: NO_BACKUP_YET,
          children: createElement(DivergenceProvider, {
            reading: NOTHING_TO_DECIDE,
            children: createElement(KeyMaterialProvider, {
              reading: NO_KEY_MATERIAL_CONDITION,
              children: createElement(StoppedChangesProvider, {
                reading: NOTHING_STOPPED,
                children: createElement(RemovalsProvider, {
                  reading: NOTHING_AWAITING_REMOVAL,
                  children: createElement(MemoryRouter, { children: screen }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as never),
  );
}

/** The section landmark each card draws, which is the thing the screen has to have produced. */
const LIBRARY_BACKUP_SECTION = 'admin-library-backup';
const FULL_EXPORT_SECTION = 'admin-full-export';
/** A9's reset card, which these two have to sit above. Not touched here, only located. */
const RESET_SECTION = 'admin-reset';
/** Two cards that are on this screen in EVERY state, so a blank render cannot pass as an absence. */
const ALWAYS_ON_THIS_SCREEN = ['admin-decisions', 'admin-device'];

describe('THE EXPORT CARDS REACH THE COACH', () => {
  it('DRAWS BOTH CARDS ON THE REAL ADMIN SCREEN, with the store open', async () => {
    const store = await aSeededStore();
    const painted = paint({ state: 'open', store });

    // THE LOAD-BEARING PAIR, FIRST. The caller is proven by RENDERING and not by grepping for an
    // import: an import that is never mounted, and an element mounted behind a condition that never
    // holds, both pass every grep there is.
    assert.ok(
      painted.includes(LIBRARY_BACKUP_SECTION),
      'the admin screen did not draw the library backup card',
    );
    assert.ok(
      painted.includes(FULL_EXPORT_SECTION),
      'the admin screen did not draw the full export card',
    );

    // And the heading each one carries, so the card is identifiable as ITSELF on the screen rather
    // than as a section landmark nobody reads.
    assert.ok(
      painted.includes(LIBRARY_BACKUP_HEADING),
      `the library backup card drew no heading: expected ${LIBRARY_BACKUP_HEADING}`,
    );
    assert.ok(
      painted.includes(FULL_EXPORT_HEADING),
      `the full export card drew no heading: expected ${FULL_EXPORT_HEADING}`,
    );
  });

  it('DRAWS NEITHER BEFORE THE STORE IS OPEN — on a screen that demonstrably still drew', () => {
    const painted = paint({ state: 'opening' });

    // THE CONTROL COMES FIRST. An absence asserted against a render that produced nothing is an
    // absence about the harness, not about these cards.
    for (const landmark of ALWAYS_ON_THIS_SCREEN) {
      assert.ok(
        painted.includes(landmark),
        `the harness rendered no admin screen at all: ${landmark} is missing too`,
      );
    }

    assert.ok(
      !painted.includes(LIBRARY_BACKUP_SECTION),
      'the library backup card drew before there was a store for it to read',
    );
    assert.ok(
      !painted.includes(FULL_EXPORT_SECTION),
      'the full export card drew before there was a store for it to read',
    );
  });

  it('PUTS THE BACKUP ABOVE THE EXPORT, AND BOTH ABOVE THE RESET', async () => {
    const store = await aSeededStore();
    const painted = paint({ state: 'open', store });

    const at = (landmark: string): number => {
      const found = painted.indexOf(landmark);
      assert.notEqual(found, -1, `${landmark} is not on the painted screen, so nothing can be ordered against it`);
      return found;
    };

    const backup = at(LIBRARY_BACKUP_SECTION);
    const everything = at(FULL_EXPORT_SECTION);
    const reset = at(RESET_SECTION);

    assert.ok(backup < everything, 'the full export is drawn above the library backup');
    // The reset is the only path back to the shipped library and it offers a backup first. A
    // control that MAKES one, drawn below it, is one he meets after the decision it belongs to.
    assert.ok(everything < reset, 'the reset is drawn above the two controls that make a copy');
  });

  it('NEVER USES THE WORD REST TO MEAN THE REMAINDER, in anything these two cards say', () => {
    // THE SCOPE IS DISCOVERED, never typed: a hand-written list of sentences is one a new export
    // string is added outside of, and the scan then reports clean about words it never read.
    const sentences: { where: string; text: string }[] = [];
    for (const [where, module] of [['library-backup-export', backupWords], ['full-export', exportWords]] as const) {
      for (const [name, value] of Object.entries(module as Record<string, unknown>)) {
        if (typeof value === 'string') sentences.push({ where: `${where}.${name}`, text: value });
      }
    }
    assert.ok(sentences.length > 0, 'no user-facing sentences were discovered, so this scan read nothing');

    // "the rest of", "and the rest" — the remainder senses. `rest` alone stays legal because a
    // session genuinely has rest in it, and a scan that refused that word outright would be a scan
    // nobody could keep.
    const remainderSense = /\b(?:the\s+rest\b|rest\s+of\s+(?:the|your|his|her|their|it)\b)/i;

    // THE POSITIVE CONTROL, in this same run. Without it a scan that matches nothing anywhere is
    // indistinguishable from a clean set of sentences.
    assert.ok(
      remainderSense.test('Ticked items go in the file and the rest of your records stay here.'),
      'the scan cannot catch the misuse where it demonstrably is, so it proves nothing where it found none',
    );
    // And the loosening direction: the legitimate sense must survive it.
    assert.ok(
      !remainderSense.test('Ninety seconds rest between sets.'),
      'the scan refuses the rest a session actually has, which makes it a scan nobody can keep',
    );

    for (const sentence of sentences) {
      assert.ok(
        !remainderSense.test(sentence.text),
        `${sentence.where} uses "rest" to mean the remainder: ${sentence.text}`,
      );
    }
  });
});
