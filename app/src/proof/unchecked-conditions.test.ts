/**
 * THE THREE CONDITIONS NOBODY MEASURES, AND THE GUARD THAT KEEPS THEM SAYING SO.
 *
 * Three surfaces in this application report a condition that NOTHING IN IT HAS EVER CHECKED:
 * whether the coach's two devices disagree, whether his key material is in order, and whether
 * anything has stopped on the way to his backup. There is no divergence source, no key-material
 * source and no stopped-changes source: each seam is a frozen literal in `App.tsx` with no read
 * behind it anywhere in the tree. Until 2026-07-31 all three were WORDED AS FACTS — "Your devices
 * agree on everything they have both been used for", "One set of encryption details, which is how it
 * should be", "Nothing has stopped. Everything you have done has either gone into your backup or is
 * on its way there" — so they were right or wrong by accident, permanently, with no failure anywhere
 * in the application able to disturb them. The user ruled that the screens stay and the reassurance
 * goes.
 *
 * ## Why this file exists rather than a line in each screen's own suite
 *
 * A CLAIM IS NOT A STRING. Each of those sentences had a second home one screen away — the Admin
 * card that leads to it — and this recipe has already shipped a fix that corrected one occurrence of
 * a forbidden sentence and left others standing. So the check is made HERE, over every one of the
 * surfaces at once and over what they PAINT rather than over what a module exports: a sweep of one
 * module's namespace stays green while a sentence from a different module sits on the screen.
 *
 * ## What it asserts, precisely
 *
 * That while NOTHING IN `src/` COMPUTES ANY OF THE THREE CONDITIONS, none of the four surfaces
 * asserts one. Both halves matter. The reassuring words are not wrong in themselves — they are the
 * right words for a device where the check ran and came back clean, and `divergence-picker.test.ts`
 * drives exactly that state through a real synchronisation pass. What makes them a defect is being
 * shown for a state nobody measured. If a later step wires one of the three reads, the call it adds
 * fails {@link nothingComputesTheseConditions} FIRST, which is the signal to bring that surface's
 * checked wording back deliberately rather than to delete this file.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { aClient } from '../../core/model/fixtures.js';
import { openLocalStore } from '../../core/store/local-store.js';
import { createLaptop } from '../../core/store/testing/platform-double.js';
import { LocalStoreProvider } from '../platform/LocalStore';
import { PlatformStatusProvider } from '../platform/platform-status';
import { AdminScreen } from '../screens/AdminScreen';
import { DivergencePickerScreen } from '../screens/DivergencePickerScreen';
import { KeyMaterialConditionScreen } from '../screens/KeyMaterialConditionScreen';
import { StoppedChangesScreen } from '../screens/StoppedChangesScreen';
import { DivergenceProvider, NOTHING_TO_DECIDE } from '../shell/Divergences';
import { KeyMaterialProvider, NO_KEY_MATERIAL_CONDITION } from '../shell/KeyMaterial';
import { NOTHING_AWAITING_REMOVAL, RemovalsProvider } from '../shell/Removals';
import { NOTHING_STOPPED, StoppedChangesProvider } from '../shell/StoppedChanges';
import { NO_BACKUP_YET, SyncStatusProvider } from '../shell/SyncStatus';
import { DESTINATIONS } from '../shell/navigation';
import type { Destination } from '../shell/navigation';
// THE STRIPPER LIVES IN ONE PLACE. It was written here first; `forbidden-claims.test.ts` needed the
// identical thing for the identical reason, so it was promoted rather than copied.
import { painted } from './painted';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.dirname(here);

const ADMIN: Destination = (() => {
  const found = DESTINATIONS.find((destination) => destination.path === 'admin');
  if (found === undefined) throw new Error('there is no admin destination to render');
  return found;
})();

/**
 * WHAT AN UNMEASURED CONDITION SOUNDS LIKE, one entry per sentence that used to stand.
 *
 * Fragments rather than whole sentences, and short enough to survive a rewording that keeps the
 * claim: what is forbidden is the CLAIM, and a check pinned to a whole sentence is a check that a
 * comma defeats.
 */
const ASSERTS_A_CONDITION: readonly { readonly claim: string; readonly where: string }[] = [
  { claim: 'Your devices agree', where: 'divergence-picker.ts, the empty queue' },
  { claim: 'Nothing needs your decision', where: 'divergence-picker.ts, the empty queue' },
  { claim: 'which is how it should be', where: 'key-material-condition.ts, the settled report' },
  { claim: 'There is nothing to sort out', where: 'key-material-condition.ts, the settled report' },
  { claim: 'One set of encryption details', where: 'key-material-condition.ts, both of its surfaces' },
  { claim: 'Nothing has stopped', where: 'stopped-changes.ts, the screen and the admin card' },
  { claim: 'gone into your backup or is on its way', where: 'stopped-changes.ts, the screen' },
  { claim: 'Everything that was sent was confirmed', where: 'stopped-changes.ts, the unconfirmed group' },
  { claim: 'Google has not refused anything', where: 'stopped-changes.ts, the refused group' },
];

/** The one thing an unmeasured surface is allowed to say. */
const HONEST = 'Not checked yet';

/**
 * WHY ONE OF THE FOUR SURFACES IS NO LONGER ALLOWED TO SAY IT, which is a change of FACT and not of
 * taste.
 *
 * "Not checked yet" is honest only where nothing has looked. For the key material and the stopped
 * changes that is still exactly true: `establishKeyMaterial` and `needsAttention` have no caller,
 * as the walk below re-proves every run.
 *
 * IT STOPPED BEING TRUE OF THE DIVERGENCE PICKER. A synchronisation pass reads the two devices'
 * areas against each other — s11/a10 watched the other device's record arrive in this store on one —
 * and since s11/a27 made reconciliation work, a real two-device clash is reachable in the shipped
 * application. What is missing is not the comparison; it is the SEAM that brings a clash to this
 * screen, and `App.tsx` handing it a frozen `NOTHING_TO_DECIDE`. A screen that draws a blank is
 * honest; a screen that disclaims a capability its own engine exercises is not — the same family as
 * the four "instructs an act it cannot deliver" sites, with the opposite sign.
 *
 * So that surface owes THREE true things instead, and the third is the one that gets dropped in a
 * rewrite: that the devices CAN disagree, that this application does not help him choose (present
 * tense, no promise about a later version), and THAT NOTHING IS LOST WHILE HE WAITS — which is a
 * measured fact rather than a softener, because a27's compaction gate refuses to delete either side
 * of an unanswered clash.
 *
 * NOTE WHAT HAS NOT CHANGED: `resolveDivergence` still has no caller, the picker still asserts no
 * condition, and it still draws no answer button. Only the false disclaimer went.
 */
const SAYS_INSTEAD: readonly string[] = ['can end up disagreeing', 'cannot help you choose', 'Nothing is lost'];

/**
 * The reads that would MAKE one of these conditions a measured fact.
 *
 * Named as call sites rather than as imports: an import that nothing calls still computes nothing,
 * and it is the call that turns a frozen literal into a reading.
 */
const COMPUTES_A_CONDITION: readonly string[] = [
  'resolveDivergence(',
  'establishKeyMaterial(',
  'needsAttention(',
];

/**
 * The CODE of a source file, with its comments taken away.
 *
 * Load-bearing rather than tidy: every one of these three reads is DISCUSSED at length in the very
 * files that do not perform it — `StoppedChanges.tsx` explains what `needsAttention` returns and
 * `App.tsx` names the exact call the later step will add. A matcher run over raw text reds on the
 * prose describing the absence, which is the loudest possible false failure: it reports the defect
 * as fixed-and-returned in the files whose comments are the evidence that it has not.
 *
 * Whole-line `//` only, so a `//` inside a string literal is left alone.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/^[ \t]*\/\/.*$/gmu, ' ');
}

/** Every non-test source file the application ships, walked once. */
function shippedSources(): readonly string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/u.test(entry.name) && !/\.test\.tsx?$/u.test(entry.name)) {
        found.push(full);
      }
    }
  };
  walk(SRC);
  return found;
}

/** One screen, through the seam the application really wires and nothing else. */
function paintScreen(provider: unknown, reading: unknown, screen: unknown): string {
  return painted(
    renderToStaticMarkup(
      createElement(provider as never, {
        reading,
        children: createElement(screen as never),
      } as never),
    ),
  );
}

/** The admin screen with a REAL open store, inside the providers `App.tsx` wires around it. */
async function paintAdmin(): Promise<string> {
  const { platform } = createLaptop();
  const store = await openLocalStore({ platform, device: 'coach-laptop' });
  await store.create('client', aClient({ name: 'Alex Fixture' }));

  const screen: ReactNode = createElement(AdminScreen, { destination: ADMIN });

  return painted(renderToStaticMarkup(
    createElement(LocalStoreProvider, {
      opening: { state: 'open', store },
      children: createElement(PlatformStatusProvider, {
        status: {
          buildStamp: 'test-build',
          persistence: null,
          offlineStart: { registered: true, reason: null },
        },
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
  ));
}

/**
 * The four surfaces, each painted from the reading this build actually ships.
 *
 * `unlooked` says whether "not checked yet" is a TRUE thing for that surface to say. See
 * {@link SAYS_INSTEAD}: it is declared per surface rather than assumed of all of them, because it
 * stopped being true of one and a rule that could not express that would have had to be softened for
 * all four.
 */
async function everySurface(): Promise<readonly {
  readonly name: string; readonly text: string; readonly unlooked: boolean;
}[]> {
  return [
    {
      name: 'the divergence picker',
      text: paintScreen(DivergenceProvider, NOTHING_TO_DECIDE, DivergencePickerScreen),
      // The engine DOES compare the two devices. Only the surface for a clash is missing.
      unlooked: false,
    },
    {
      name: 'the key-material condition screen',
      text: paintScreen(KeyMaterialProvider, NO_KEY_MATERIAL_CONDITION, KeyMaterialConditionScreen),
      unlooked: true,
    },
    {
      name: 'the stopped-changes review',
      text: paintScreen(StoppedChangesProvider, NOTHING_STOPPED, StoppedChangesScreen),
      unlooked: true,
    },
    {
      name: 'the admin screen, where all three have a second surface',
      text: await paintAdmin(),
      unlooked: true,
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('the three unchecked conditions — nothing computes them, so nothing asserts them', () => {
  it('nothingComputesTheseConditions: no shipped source reads any of the three', () => {
    const offenders: string[] = [];
    for (const file of shippedSources()) {
      const source = code(readFileSync(file, 'utf8'));
      for (const call of COMPUTES_A_CONDITION) {
        if (source.includes(call)) offenders.push(`${path.relative(SRC, file)} calls ${call}`);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      'ONE OF THE THREE CONDITIONS IS NOW COMPUTED, and this file has been asserting the surfaces '
        + 'stay silent about a condition that has since become measurable. That is not a failure to '
        + 'suppress: bring back the checked wording for whichever surface gained a read, together '
        + `with the state that selects it. Found: ${offenders.join('; ')}`,
    );
  });

  it('and the file walk that says so can actually find a call that IS there', () => {
    // NON-VACUITY for the scan above. A walk that found no files, or a matcher that matched
    // nothing, would satisfy that assertion perfectly while checking nothing at all.
    const sources = shippedSources();
    assert.ok(sources.length > 40, `the walk found only ${sources.length} shipped source files`);
    assert.ok(
      sources.some((file) => code(readFileSync(file, 'utf8')).includes('openLocalStore(')),
      'the walk cannot find a call this application demonstrably makes, so its silence about the '
        + 'three reads means nothing',
    );

    // AND THE COMMENT STRIPPER CUTS EXACTLY WHAT IT CLAIMS TO. Synthetic, written here: one call in
    // code and the same call in each shape of comment the tree actually uses to describe it.
    const synthetic = [
      '/** The later step calls needsAttention(store) — it has no caller today. */',
      '// resolveDivergence(store, d) is what the answer would reach.',
      '{/* establishKeyMaterial(remote) is not called anywhere in the interface. */}',
      'const opening = openLocalStore({ platform, device });',
    ].join('\n');
    const stripped = code(synthetic);
    assert.ok(stripped.includes('openLocalStore('), 'the stripper ate the code along with the comments');
    for (const call of COMPUTES_A_CONDITION) {
      assert.ok(
        !stripped.includes(call),
        `the stripper leaves "${call}" standing when it appears only in prose, which is how every `
          + 'file that documents the missing read would be reported as performing it',
      );
    }
  });

  it('NONE OF THE FOUR SURFACES ASSERTS A CONDITION, in the words a person reads', async () => {
    for (const surface of await everySurface()) {
      // A render that returned nothing satisfies every absence below. The floor is deliberately low:
      // an unchecked screen is SHORT, which is the point of it.
      assert.ok(
        surface.text.length > 100,
        `${surface.name} painted almost nothing (${surface.text.length} characters), so the `
          + 'absences below are absences of a screen rather than of a claim',
      );
      for (const { claim, where } of ASSERTS_A_CONDITION) {
        assert.ok(
          !surface.text.includes(claim),
          `${surface.name} says "${claim}" (${where}). Nothing in this application computes that `
            + 'condition: there is no source module and no read anywhere in the tree, so the '
            + 'sentence is right or wrong by accident and no failure can ever disturb it.',
        );
      }
    }
  });

  it('and each of them says, instead, the true thing for the state it is really in', async () => {
    const surfaces = await everySurface();
    // BOTH BRANCHES ARE EXERCISED. With every surface on one side of it this rule would be checking
    // one thing while appearing to check two.
    assert.ok(surfaces.some((one) => one.unlooked), 'no surface is an unlooked one any more');
    assert.ok(surfaces.some((one) => !one.unlooked), 'no surface is a looked-at one, so that half never fires');

    for (const surface of surfaces) {
      if (surface.unlooked) {
        assert.ok(
          surface.text.includes(HONEST),
          `${surface.name} does not say it has not checked. Removing the reassurance without saying `
            + 'what is true leaves a blank where a person will supply the reassurance himself.',
        );
      } else {
        // THE OPPOSITE FAILURE, and it needs its own assertion because the one above cannot see it:
        // claiming nothing has looked when the engine has.
        assert.ok(
          !surface.text.includes(HONEST),
          `${surface.name} says "${HONEST}" about a condition this application's engine DOES `
            + 'compute. What it lacks is the surface for the answer, not the comparison — see '
            + 'SAYS_INSTEAD. A screen disclaiming a capability it exercises is not honest silence.',
        );
        for (const owed of SAYS_INSTEAD) {
          assert.ok(
            surface.text.includes(owed),
            `${surface.name} no longer says "${owed}". All three halves are owed together: what can `
              + 'happen, that this app will not help, and that nothing is lost meanwhile. Dropping '
              + 'the last one alarms a non-technical man and leaves him nothing.',
          );
        }
      }
      // The replacement may say ONE thing. These are the ways it comes back in a new costume.
      for (const drift of ['will be checked', 'nothing to worry', 'looks fine', 'so far so']) {
        assert.ok(
          !surface.text.toLowerCase().includes(drift),
          `${surface.name} softens "not checked" into "${drift}", which is a reassurance about a `
            + 'condition nobody measured — the same defect this replaced.',
        );
      }
    }
  });

  it('and the scanner that says so can see these very claims when they ARE on a surface', () => {
    // NON-VACUITY, and it is the load-bearing probe: a `painted()` that returned an empty string,
    // or a stripper that ate the sentences along with the tags, would make every assertion above
    // pass without reading anything. The fixture is synthetic — written here, matching no file in
    // the tree — and every claim goes through the identical strip-and-match pipeline, spread across
    // tags and entities the way the real screens spread them.
    for (const { claim } of ASSERTS_A_CONDITION) {
      const synthetic = `<div class="card"><p class="read">A coach&#x27;s screen said: <span>${claim}`
        + '</span> and nothing had looked.</p></div>';
      assert.ok(
        painted(synthetic).includes(claim),
        `the scanner cannot see "${claim}" even when it is painted in front of it, so its silence `
          + 'about the real surfaces proves nothing',
      );
    }
    assert.ok(
      !painted('<p data-claim="Your devices agree">Not checked yet.</p>').includes('Your devices agree'),
      'the scanner reads attributes as if they were words on the screen, so it would red on markup '
        + 'no person can read',
    );
  });
});
