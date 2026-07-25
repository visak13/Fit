/**
 * LIGHT AND DARK — the same token names with different values, switched by one attribute.
 *
 * ## What is decided here, and what was deliberately not built
 *
 * Both themes ship, always. The application FOLLOWS THE OPERATING SYSTEM by default, because the
 * coach has already told his phone whether he wants a dark screen and being asked again is the
 * application making itself the subject. The override exists because the default is sometimes
 * wrong — a bright gym at four in the afternoon, a phone that never switches — and it is REMEMBERED
 * on the device rather than asked for again.
 *
 * What was NOT built is a settings panel with a theme section in it. The chosen direction looks like
 * a COMPANION RATHER THAN A BUSINESS, and that resolves this call: the mechanism lives here and a
 * quiet control mounts on it wherever the frame puts one. A screen full of preferences is the other
 * kind of application.
 *
 * ## Three states, not two
 *
 * `system` is a real choice and it is the default. It is not "light until told otherwise": while it
 * is in effect the application keeps listening, so a phone that switches to dark in the evening
 * takes the application with it without anyone touching anything. Choosing `light` or `dark`
 * explicitly stops that following; choosing `system` again resumes it. Storing "follow the system"
 * as an absent value would have made those two states indistinguishable from a device that had
 * never been asked.
 *
 * ## Why this module has no imports
 *
 * Every dependency arrives as a parameter — the root element, the media query, the storage. That is
 * what lets the whole of it be tested with Node's own test runner and no browser, the same way the
 * core is. It is also why nothing here reaches for `document` or `window` on its own.
 *
 * The pre-paint half of this lives in `index.html`, which sets the attribute before the first frame
 * is drawn so a dark-themed phone never flashes white on open. It repeats the key and the attribute
 * name because it must run before any module loads; `theme.test.ts` reads that file and fails if
 * the two ever disagree.
 */

/** Where the coach's choice is remembered. Repeated in `index.html`; guarded by the test. */
export const THEME_STORAGE_KEY = 'fit.theme';

/** The attribute the token layer switches on. Repeated in `index.html`; guarded by the test. */
export const THEME_ATTRIBUTE = 'data-theme';

/** The media query the operating system's own preference is read from. */
export const DARK_PREFERENCE_QUERY = '(prefers-color-scheme: dark)';

/** The two themes the token layer defines values for. */
export type Theme = 'light' | 'dark';

/** What the coach chose. `system` is the default and means "keep following the device". */
export type ThemeChoice = Theme | 'system';

/** The default, and the state a device that has never been asked is in. */
export const DEFAULT_THEME_CHOICE: ThemeChoice = 'system';

/** The element the theme attribute is set on — the document root, in a browser. */
export interface ThemeRoot {
  setAttribute(name: string, value: string): void;
}

/** Where the choice is remembered. `window.localStorage` satisfies this. */
export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The operating system's preference. A `MediaQueryList` satisfies this. */
export interface DarkPreference {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void;
  removeEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void;
}

/** What a running controller offers whoever renders a control for it. */
export interface ThemeController {
  /** The theme currently painted. */
  theme(): Theme;
  /** What the coach chose, which is `system` unless he said otherwise. */
  choice(): ThemeChoice;
  /** Record a choice, apply it, and remember it. */
  choose(choice: ThemeChoice): void;
  /** Stop following the device. Called when the application is torn down. */
  stop(): void;
}

/**
 * Reads the remembered choice, treating anything unrecognised as "follow the device".
 *
 * A value this module does not understand is not an error worth stopping for: it is a device whose
 * storage was written by an older or newer build, and the safe answer is the default rather than a
 * broken screen. Storage that refuses to be read at all is the same case for the same reason, and
 * it is logged rather than swallowed, because a device that cannot remember anything is worth
 * knowing about when the admin screen is being read over a video call.
 */
export function readThemeChoice(storage: ThemeStorage): ThemeChoice {
  let stored: string | null = null;
  try {
    stored = storage.getItem(THEME_STORAGE_KEY);
  } catch (error) {
    console.error('[theme] the remembered choice could not be read; following the device', error);
    return DEFAULT_THEME_CHOICE;
  }
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return DEFAULT_THEME_CHOICE;
}

/**
 * Remembers a choice. A refusal to write is logged and not thrown: the theme has already been
 * applied by then, so the session is correct and only the memory of it is lost.
 */
export function writeThemeChoice(storage: ThemeStorage, choice: ThemeChoice): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, choice);
  } catch (error) {
    console.error('[theme] the choice could not be remembered on this device', error);
  }
}

/** What a choice resolves to, given what the device currently prefers. */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): Theme {
  if (choice === 'light' || choice === 'dark') return choice;
  return prefersDark ? 'dark' : 'light';
}

/** Paints a theme. The only place the attribute is written. */
export function applyTheme(root: ThemeRoot, theme: Theme): void {
  root.setAttribute(THEME_ATTRIBUTE, theme);
}

/**
 * Starts following the device and applies the current answer immediately.
 *
 * The listener is kept for the lifetime of the application rather than added and removed as a
 * choice changes: while the choice is `light` or `dark` it simply resolves to the same theme it
 * already did, and a subscription that is torn down and rebuilt is a subscription that can be left
 * off. `stop()` is what removes it, and the caller that opened it is what calls that.
 */
export function startThemeController(dependencies: {
  root: ThemeRoot;
  storage: ThemeStorage;
  darkPreference: DarkPreference;
}): ThemeController {
  const { root, storage, darkPreference } = dependencies;

  let choice = readThemeChoice(storage);
  let theme = resolveTheme(choice, darkPreference.matches);
  applyTheme(root, theme);

  const followDevice = (event: { matches: boolean }): void => {
    const next = resolveTheme(choice, event.matches);
    if (next === theme) return;
    theme = next;
    applyTheme(root, theme);
  };

  darkPreference.addEventListener('change', followDevice);

  return {
    theme: () => theme,
    choice: () => choice,
    choose: (nextChoice: ThemeChoice) => {
      choice = nextChoice;
      theme = resolveTheme(choice, darkPreference.matches);
      applyTheme(root, theme);
      writeThemeChoice(storage, choice);
    },
    stop: () => {
      darkPreference.removeEventListener('change', followDevice);
    },
  };
}
