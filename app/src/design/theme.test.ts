/**
 * THE THEME, TESTED WITHOUT A BROWSER — and the pre-paint half tested against the real file.
 *
 * Two things are worth proving here and they are different in kind.
 *
 * The first is ordinary: three choices resolve to the right theme, the choice is remembered, and a
 * device that switches to dark in the evening takes the application with it while the choice is
 * `system` and does NOT while it is not.
 *
 * The second is the one that would otherwise rot. The theme has to be on the root element before the
 * first frame is drawn, or a dark-themed phone flashes white every time the application opens — and
 * nothing that loads as a module runs early enough to prevent that. So `index.html` carries a small
 * inline script that repeats the storage key and the attribute name. Repetition that nothing checks
 * is repetition that drifts, and the drift here is silent: the module would write `fit.theme` while
 * the bootstrap read something else, everything would keep working, and the only symptom would be
 * that the remembered choice stopped surviving a reload. So the last tests read the real file and
 * fail if the two ever disagree.
 *
 *     npm run test:shell
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  DARK_PREFERENCE_QUERY,
  DEFAULT_THEME_CHOICE,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  applyTheme,
  readThemeChoice,
  resolveTheme,
  startThemeController,
} from './theme.ts';
import type { DarkPreference, ThemeChoice, ThemeRoot, ThemeStorage } from './theme.ts';

/** A root element that records what was set on it, in order. */
function fakeRoot(): ThemeRoot & { applied: string[] } {
  const applied: string[] = [];
  return {
    applied,
    setAttribute(name: string, value: string) {
      assert.equal(name, THEME_ATTRIBUTE);
      applied.push(value);
    },
  };
}

/** Storage backed by a map, or by a refusal, which is a real state on a locked-down device. */
function fakeStorage(initial?: string, refuse = false): ThemeStorage & { written: string[] } {
  const written: string[] = [];
  let value = initial ?? null;
  return {
    written,
    getItem() {
      if (refuse) throw new Error('storage is unavailable');
      return value;
    },
    setItem(_key: string, next: string) {
      if (refuse) throw new Error('storage is unavailable');
      value = next;
      written.push(next);
    },
  };
}

/** A media query whose answer can be changed, notifying whoever is listening. */
function fakeDarkPreference(matches: boolean): DarkPreference & {
  change(next: boolean): void;
  listenerCount(): number;
} {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  let current = matches;
  return {
    get matches() {
      return current;
    },
    addEventListener(_type: 'change', listener: (event: { matches: boolean }) => void) {
      listeners.add(listener);
    },
    removeEventListener(_type: 'change', listener: (event: { matches: boolean }) => void) {
      listeners.delete(listener);
    },
    change(next: boolean) {
      current = next;
      for (const listener of listeners) listener({ matches: next });
    },
    listenerCount: () => listeners.size,
  };
}

describe('resolving a theme', () => {
  it('follows the device when the choice is the default', () => {
    assert.equal(DEFAULT_THEME_CHOICE, 'system');
    assert.equal(resolveTheme('system', true), 'dark');
    assert.equal(resolveTheme('system', false), 'light');
  });

  it('ignores the device when a theme was chosen explicitly', () => {
    assert.equal(resolveTheme('light', true), 'light');
    assert.equal(resolveTheme('dark', false), 'dark');
  });
});

describe('the remembered choice', () => {
  it('is the default on a device that has never been asked', () => {
    assert.equal(readThemeChoice(fakeStorage()), 'system');
  });

  it('reads back each of the three choices', () => {
    for (const choice of ['light', 'dark', 'system'] satisfies ThemeChoice[]) {
      assert.equal(readThemeChoice(fakeStorage(choice)), choice);
    }
  });

  it('treats an unrecognised value as the default rather than as an error', () => {
    // A device whose storage was written by another build is not a broken screen.
    assert.equal(readThemeChoice(fakeStorage('sepia')), 'system');
  });

  it('falls back to the default when storage refuses to be read', () => {
    assert.equal(readThemeChoice(fakeStorage(undefined, true)), 'system');
  });
});

describe('the theme controller', () => {
  it('applies the device preference immediately on a device never asked', () => {
    const root = fakeRoot();
    const controller = startThemeController({
      root,
      storage: fakeStorage(),
      darkPreference: fakeDarkPreference(true),
    });
    assert.deepEqual(root.applied, ['dark']);
    assert.equal(controller.theme(), 'dark');
    assert.equal(controller.choice(), 'system');
    controller.stop();
  });

  it('FOLLOWS THE DEVICE while the choice is system, which is the whole point of the default', () => {
    const root = fakeRoot();
    const preference = fakeDarkPreference(false);
    const controller = startThemeController({
      root,
      storage: fakeStorage(),
      darkPreference: preference,
    });

    preference.change(true);

    assert.deepEqual(root.applied, ['light', 'dark']);
    assert.equal(controller.theme(), 'dark');
    controller.stop();
  });

  it('STOPS FOLLOWING once a theme is chosen, and resumes when system is chosen again', () => {
    const root = fakeRoot();
    const preference = fakeDarkPreference(false);
    const storage = fakeStorage();
    const controller = startThemeController({ root, storage, darkPreference: preference });

    controller.choose('light');
    preference.change(true); // the device went dark; the explicit choice holds
    assert.equal(controller.theme(), 'light');

    controller.choose('system'); // following resumes, and the device is currently dark
    assert.equal(controller.theme(), 'dark');
    assert.deepEqual(storage.written, ['light', 'system']);
    controller.stop();
  });

  it('does not repaint when the device changes to the theme already showing', () => {
    const root = fakeRoot();
    const preference = fakeDarkPreference(true);
    const controller = startThemeController({
      root,
      storage: fakeStorage('dark'),
      darkPreference: preference,
    });

    preference.change(false); // the device went light; the choice is an explicit dark

    assert.deepEqual(root.applied, ['dark'], 'the attribute was written again for no reason');
    controller.stop();
  });

  it('applies the theme even when the choice cannot be remembered', () => {
    // The session is still correct on a device that refuses storage; only the memory is lost.
    const root = fakeRoot();
    const controller = startThemeController({
      root,
      storage: fakeStorage(undefined, true),
      darkPreference: fakeDarkPreference(false),
    });
    controller.choose('dark');
    assert.deepEqual(root.applied, ['light', 'dark']);
    controller.stop();
  });

  it('releases its listener when it is stopped', () => {
    const preference = fakeDarkPreference(false);
    const controller = startThemeController({
      root: fakeRoot(),
      storage: fakeStorage(),
      darkPreference: preference,
    });
    assert.equal(preference.listenerCount(), 1);
    controller.stop();
    assert.equal(preference.listenerCount(), 0);
  });
});

describe('applying a theme', () => {
  it('writes the one attribute the token layer switches on', () => {
    const root = fakeRoot();
    applyTheme(root, 'dark');
    assert.deepEqual(root.applied, ['dark']);
  });
});

describe('the pre-paint bootstrap in index.html', () => {
  const indexHtml = async () =>
    readFile(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.html'),
      'utf8',
    );

  it('uses the SAME storage key this module writes', async () => {
    assert.ok(
      (await indexHtml()).includes(`'${THEME_STORAGE_KEY}'`),
      `index.html no longer reads '${THEME_STORAGE_KEY}', so a remembered choice will be ` +
        'silently forgotten on every reload while everything still appears to work.',
    );
  });

  it('sets the SAME attribute this module sets', async () => {
    assert.ok((await indexHtml()).includes(`'${THEME_ATTRIBUTE}'`));
  });

  it('asks the device the SAME question this module asks', async () => {
    assert.ok((await indexHtml()).includes(DARK_PREFERENCE_QUERY));
  });

  it('binds Console: the chosen palette and density are on the root element', async () => {
    const html = await indexHtml();
    // Console is the only direction this application ships. The other palettes stay in the shared
    // layer because it is measured as a whole, but nothing here offers a choice between them.
    assert.match(html, /<html[^>]*data-palette="slate-blue"/);
    assert.match(html, /<html[^>]*data-density="compact"/);
  });
});
