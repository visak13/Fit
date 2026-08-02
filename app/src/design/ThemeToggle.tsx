/**
 * THE QUIET THEME CONTROL — the one `theme.ts` said would mount "wherever the frame puts one".
 *
 * One icon button, cycling system → light → dark → system. `system` is a real position, not an
 * absence: it is the state where the application follows the device again, and skipping it would
 * strand a coach who chose dark once and can never get back to following his phone.
 *
 * The button's accessible name says the state it is IN, and the tooltip carries what pressing it
 * moves to — nothing needed to finish a task lives in either, per `Tooltip.tsx`'s standing rule.
 * There is no settings screen for this and must not be one; see the header of `theme.ts`.
 *
 * The controller arrives through context from whoever started it (`App.tsx`), because there can
 * only be one: a second controller would be a second writer of the same attribute and the same
 * storage key. Rendered with no controller supplied, this renders nothing at all.
 */

import { createContext, useContext, useEffect, useState } from 'react';

import { Glyph } from './Glyph.tsx';
import { Tooltip } from './Tooltip.tsx';
import { DEFAULT_THEME_CHOICE } from './theme.ts';
import type { ThemeChoice, ThemeController } from './theme.ts';
import type { GlyphName } from './glyphs.generated.ts';

/** The one running controller, supplied by the composition root. Null renders no control. */
export const ThemeControllerContext = createContext<ThemeController | null>(null);

/** The cycle. Three states, each reachable, ending back at "follow the device". */
export const NEXT_THEME_CHOICE: Readonly<Record<ThemeChoice, ThemeChoice>> = Object.freeze({
  system: 'light',
  light: 'dark',
  dark: 'system',
});

/** The state the control is in, said as the coach would say it. This is the accessible name. */
export const THEME_CHOICE_LABELS: Readonly<Record<ThemeChoice, string>> = Object.freeze({
  system: 'Theme: following the device',
  light: 'Theme: light',
  dark: 'Theme: dark',
});

const THEME_CHOICE_GLYPHS: Readonly<Record<ThemeChoice, GlyphName>> = Object.freeze({
  system: 'theme-system',
  light: 'theme-light',
  dark: 'theme-dark',
});

export function ThemeToggle() {
  const controller = useContext(ThemeControllerContext);
  // Initialised from the controller when it is already there (a test, a warm mount), and corrected
  // by the effect when it arrives after first paint (the application), so the two never disagree.
  const [choice, setChoice] = useState<ThemeChoice>(
    () => (controller === null ? DEFAULT_THEME_CHOICE : controller.choice()),
  );

  useEffect(() => {
    if (controller !== null) setChoice(controller.choice());
  }, [controller]);

  if (controller === null) return null;

  const press = (): void => {
    const next = NEXT_THEME_CHOICE[controller.choice()];
    controller.choose(next);
    setChoice(next);
  };

  return (
    <Tooltip text={`Press for: ${THEME_CHOICE_LABELS[NEXT_THEME_CHOICE[choice]].replace('Theme: ', '')}`}>
      <button
        type="button"
        className="icon-btn theme-toggle"
        aria-label={THEME_CHOICE_LABELS[choice]}
        data-theme-choice={choice}
        onClick={press}
      >
        <Glyph name={THEME_CHOICE_GLYPHS[choice]} decorative />
      </button>
    </Tooltip>
  );
}
