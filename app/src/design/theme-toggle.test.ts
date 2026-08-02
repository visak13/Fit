/**
 * THE QUIET THEME CONTROL, PROVED — present with a controller, absent without one, honest about
 * the state it is in.
 *
 * The cycle itself is data (`NEXT_THEME_CHOICE`), so it is proved as data: every choice reachable,
 * every choice departed from, and `system` a real position rather than a skipped one. The absence
 * half is paired with a positive control, per this build's standing rule: an absence assertion with
 * no twin passes just as happily when the whole tree failed to render.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  NEXT_THEME_CHOICE, THEME_CHOICE_LABELS, ThemeControllerContext, ThemeToggle,
} from './ThemeToggle.tsx';
import { DEFAULT_THEME_CHOICE } from './theme.ts';
import type { ThemeChoice, ThemeController } from './theme.ts';

/** A controller remembering one choice, counting what is chosen through it. */
function controllerAt(choice: ThemeChoice): { controller: ThemeController; chosen: ThemeChoice[] } {
  const chosen: ThemeChoice[] = [];
  let current = choice;
  const controller: ThemeController = {
    theme: () => (current === 'dark' ? 'dark' : 'light'),
    choice: () => current,
    choose: (next) => {
      current = next;
      chosen.push(next);
    },
    stop: () => {},
  };
  return { controller, chosen };
}

function paint(controller: ThemeController | null): string {
  const toggle = createElement(ThemeToggle);
  return renderToStaticMarkup(
    createElement(ThemeControllerContext.Provider, { value: controller, children: toggle }),
  );
}

describe('the theme control', () => {
  it('renders nothing while no controller has been supplied', () => {
    assert.equal(paint(null), '');
    // POSITIVE CONTROL: the same tree with one thing changed, and the control appears.
    assert.ok(paint(controllerAt('system').controller).includes('theme-toggle'));
  });

  it('says the state it is in, as its accessible name, for each remembered choice', () => {
    for (const choice of ['system', 'light', 'dark'] as const) {
      const markup = paint(controllerAt(choice).controller);
      assert.ok(markup.includes(`aria-label="${THEME_CHOICE_LABELS[choice]}"`),
        `the control does not name its ${choice} state`);
      assert.ok(markup.includes(`data-theme-choice="${choice}"`));
    }
  });

  it('cycles through all three states and returns to following the device', () => {
    const seen = new Set<ThemeChoice>();
    let at: ThemeChoice = DEFAULT_THEME_CHOICE;
    for (let step = 0; step < 3; step += 1) {
      at = NEXT_THEME_CHOICE[at];
      seen.add(at);
    }
    assert.equal(seen.size, 3, 'a state is unreachable from the cycle');
    assert.equal(at, DEFAULT_THEME_CHOICE, 'the cycle does not return to following the device');
  });

  it('has a label for every choice, and no label instructs', () => {
    for (const choice of ['system', 'light', 'dark'] as const) {
      const label = THEME_CHOICE_LABELS[choice];
      assert.ok(label.length > 0);
      assert.ok(!label.toLowerCase().includes('press'), 'the name is the state, not an instruction');
    }
  });
});
