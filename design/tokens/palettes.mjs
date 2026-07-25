/**
 * THE COLOUR ROLES AND THE PALETTES THAT BIND THEM — the single source of truth.
 *
 * Everything colour-shaped in this design layer derives from this one file:
 * `build-tokens.mjs` generates `tokens/palettes.css` from it, and `contrast.mjs`
 * measures the very same values. There is deliberately no second place where a hex
 * value is written down, because the whole point of the contrast harness is that its
 * report is evidence about the tokens that actually ship. If the measured colours and
 * the shipped colours could drift apart, a green table would prove nothing.
 *
 * ROLES, NOT NAMES. A role says what a colour is FOR — the page floor, the primary
 * reading colour, the border of something you can click. It never says what the colour
 * IS. That is what lets a visual direction be expressed by rebinding the same role
 * names to different values, rather than by rewriting every screen that consumes them.
 *
 * BOTH THEMES ALWAYS. Every palette declares a complete light theme and a complete dark
 * theme. A palette with one theme is not a palette, it is half of one, and the half that
 * gets added later is the half nobody measured.
 *
 * WHY THE ROLE LIST INCLUDES THE DULL STATES. Inputs, placeholder text, disabled
 * controls and the focus ring as it crosses a filled button are the pairs that get
 * rendered and never declared, and an undeclared pair passes by being absent rather
 * than by being good. Every state that will actually be drawn has a role here, so the
 * harness can measure it.
 */

/**
 * What each role is for, and what has to be true of it.
 *
 * `gate` records how the role is checked by the contrast harness:
 *   - `surface`     a background; it is the other half of a pair, never the measured one
 *   - `text`        read at body size, so 4.5:1 against every surface it sits on
 *   - `non-text`    a border, a ring or a filled shape whose boundary carries meaning, so 3:1
 *   - `on-fill`     text sitting on one of the filled roles, so 4.5:1 against that fill
 *   - `decorative`  carries no information on its own, so no threshold applies
 */
export const ROLES = Object.freeze([
  { name: 'surface-page', gate: 'surface', purpose: 'The page floor. Nothing is read directly on it if a card is available.' },
  { name: 'surface-card', gate: 'surface', purpose: 'The reading surface, one step off the page floor. Most text lives here.' },
  { name: 'surface-raised', gate: 'surface', purpose: 'A surface above the card: a popover, a sticky header, a summary strip.' },
  { name: 'surface-selected', gate: 'surface', purpose: 'The current destination in the navigation surface, and a selected row.' },
  { name: 'surface-input', gate: 'surface', purpose: 'The inside of a text field, a select or a search box.' },
  { name: 'surface-disabled', gate: 'surface', purpose: 'The inside of a control that cannot be used right now.' },
  { name: 'line-divider', gate: 'decorative', purpose: 'Separates rows and sections. Decorative: removing it loses no information.' },
  { name: 'line-control', gate: 'non-text', purpose: 'The edge of anything interactive — an input, a button outline, a checkbox.' },
  { name: 'text-primary', gate: 'text', purpose: 'Everything read for meaning: names, notes, numbers, labels.' },
  { name: 'text-muted', gate: 'text', purpose: 'Secondary reading text — timestamps, units, helper lines. Still read, so still 4.5:1.' },
  { name: 'text-placeholder', gate: 'text', purpose: 'The hint inside an empty field. It is read, so it is held to the reading threshold.' },
  { name: 'text-disabled', gate: 'non-text', purpose: 'The label of a control that cannot be used. See DISABLED_NOTE — held stricter than the standard.' },
  { name: 'text-accent', gate: 'text', purpose: 'Links and the text of the primary action.' },
  { name: 'text-danger', gate: 'text', purpose: 'Destructive wording, and a rejected change that will never resolve itself.' },
  { name: 'text-success', gate: 'text', purpose: 'A completed sync, a saved record.' },
  { name: 'text-warning', gate: 'text', purpose: 'A delayed sync, a pending queue, anything amber rather than red.' },
  { name: 'focus-ring', gate: 'non-text', purpose: 'The outer band of the keyboard focus indicator. Visible against every surface it can land on.' },
  { name: 'focus-ring-contrast', gate: 'non-text', purpose: 'The inner band of the focus indicator. See FOCUS_INDICATOR_NOTE — it is what makes focus visible on a coloured button.' },
  { name: 'fill-accent', gate: 'non-text', purpose: 'The primary action button.' },
  { name: 'text-on-accent', gate: 'on-fill', on: 'fill-accent', purpose: 'The label inside the primary action button.' },
  { name: 'fill-danger', gate: 'non-text', purpose: 'A destructive action button, and the red escalation state of the status indicator.' },
  { name: 'text-on-danger', gate: 'on-fill', on: 'fill-danger', purpose: 'The label inside a destructive button or the red status chip.' },
  { name: 'fill-success', gate: 'non-text', purpose: 'The synced state of the permanent status indicator.' },
  { name: 'text-on-success', gate: 'on-fill', on: 'fill-success', purpose: 'The label inside the synced status chip.' },
  { name: 'fill-warning', gate: 'non-text', purpose: 'The delayed state of the permanent status indicator.' },
  { name: 'text-on-warning', gate: 'on-fill', on: 'fill-warning', purpose: 'The label inside the delayed status chip.' },
  { name: 'fill-neutral', gate: 'non-text', purpose: 'The offline and never-yet-synced states of the status indicator, and a secondary chip.' },
  { name: 'text-on-neutral', gate: 'on-fill', on: 'fill-neutral', purpose: 'The label inside a neutral chip.' },
  { name: 'shadow-color', gate: 'decorative', purpose: 'The colour elevation is composed from. Decorative by definition.' },
]);

/**
 * DISABLED_NOTE, recorded here rather than in prose that nobody re-reads.
 *
 * WCAG 2.2 SC 1.4.3 exempts the text of a disabled control from the contrast minimum
 * entirely. This layer does NOT take that exemption: `text-disabled` is measured and
 * held to 3:1. That is STRICTER than the standard, not a relaxation of it. The reason
 * is the audience — a coach reading a screen for an hour with a client waiting needs to
 * be able to tell an unavailable control from an absent one, and a legally exempt grey
 * that he cannot read is still a control he cannot find.
 */
export const DISABLED_NOTE =
  'text-disabled is exempt under WCAG 2.2 SC 1.4.3 and is measured here anyway at the 3:1 non-text ' +
  'threshold. Stricter than the standard, never looser.';

/**
 * FOCUS_INDICATOR_NOTE — why focus is TWO colours, and why that was not a preference.
 *
 * The first run of the harness failed thirty pairs, and thirty of them were one fact: a
 * SINGLE-colour focus ring cannot exist. To be visible on a pale page it has to be dark;
 * to be visible on a mid-tone filled button it has to be far lighter or far darker than
 * that button. One colour cannot be both, and the arithmetic does not care how the colour
 * is chosen — every candidate failed somewhere. The measurement is what surfaced it; by
 * inspection it looked perfectly reasonable, because on a page background it IS.
 *
 * So the indicator is two concentric bands, the long-standing solution to exactly this:
 *   - `focus-ring` is the outer band, and clears 3:1 against every SURFACE.
 *   - `focus-ring-contrast` is the inner band, and clears 3:1 against every FILL and
 *     against `focus-ring` itself.
 * Whatever a focused control is sitting on or made of, one of the two bands is visible
 * against it and the two are visible against each other.
 *
 * The alternative — one ring pushed outside the control by an offset, so it only ever
 * touches the surface — was rejected. It relies on every later builder remembering the
 * offset, and a ring that silently becomes invisible when someone removes it is a control
 * the coach cannot find with a client waiting. Two bands cannot be got wrong by omission.
 */
export const FOCUS_INDICATOR_NOTE =
  'Focus is two concentric bands: focus-ring clears 3:1 against every surface, focus-ring-contrast ' +
  'clears 3:1 against every fill and against focus-ring. One colour provably cannot do both.';

/** The backgrounds every reading and interactive role has to survive. */
export const SURFACES = Object.freeze([
  'surface-page',
  'surface-card',
  'surface-raised',
  'surface-selected',
  'surface-input',
]);

/** Roles read at body size, measured against every surface. */
export const TEXT_ON_SURFACE = Object.freeze([
  'text-primary',
  'text-muted',
  'text-accent',
  'text-danger',
  'text-success',
  'text-warning',
]);

/** Roles whose boundary carries meaning, measured against every surface. */
export const NON_TEXT_ON_SURFACE = Object.freeze(['line-control', 'focus-ring']);

/**
 * Filled shapes. Each one needs three things checked, and the third is the one that gets
 * forgotten: the focus ring has to remain visible when it lands ON the filled control,
 * not merely on the surface behind it.
 */
export const FILLS = Object.freeze([
  { fill: 'fill-accent', label: 'text-on-accent' },
  { fill: 'fill-danger', label: 'text-on-danger' },
  { fill: 'fill-success', label: 'text-on-success' },
  { fill: 'fill-warning', label: 'text-on-warning' },
  { fill: 'fill-neutral', label: 'text-on-neutral' },
]);

/**
 * WCAG 2.2 SC 1.4.3 and SC 1.4.11. These numbers are not adjustable.
 *
 * `large-text` exists in the standard (24px, or 18.66px bold) but no role in this layer
 * is used ONLY at large sizes, so nothing is measured against it: every reading role is
 * held to the stricter body threshold and therefore passes at large sizes as well. It is
 * recorded so a later step that genuinely needs it does not invent its own number.
 */
export const THRESHOLDS = Object.freeze({
  text: 4.5,
  'large-text': 3.0,
  'non-text': 3.0,
  /*
   * INFORMATIONAL pairs are reported and never gated, and the list of them is short and
   * argued rather than convenient. A pair belongs here only when the standard imposes no
   * threshold on it AT ALL: decorative dividers (SC 1.4.11 exempts pure decoration), the
   * body of an inactive control (SC 1.4.11 exempts inactive components), and the tonal
   * lift of one surface off another, which is never the only signal for anything — a
   * selected row also carries a marker and an accessible state, per SC 1.4.1.
   *
   * They are printed anyway because a surface lift of 1.02:1 is a design defect even
   * where it is not an accessibility failure, and because a pair that is measured and
   * shown cannot later be claimed to have been overlooked. Nothing that carries meaning
   * on its own is in this category; moving a gated pair here to make the table green
   * would be exactly the defect this harness exists to prevent.
   */
  informational: null,
});

export const PALETTES = Object.freeze([
  Object.freeze({
    id: 'house-sepia',
    name: 'Sepia and pure black',
    summary:
      'A warm paper light theme and a pure-black dark theme. Low glare, warm rather than clinical, ' +
      'and the least tiring of the three over a long continuous session.',
    themes: Object.freeze({
      light: Object.freeze({
        'surface-page': '#FAF4E8',
        'surface-card': '#FFFCF5',
        'surface-raised': '#F2EADA',
        'surface-selected': '#EADFC7',
        'surface-input': '#FFFDF8',
        'surface-disabled': '#EFE8D9',
        'line-divider': '#E8DFCC',
        'line-control': '#7E7462',
        'text-primary': '#2A2620',
        'text-muted': '#635A4D',
        'text-placeholder': '#6E6558',
        'text-disabled': '#847A69',
        'text-accent': '#835529',
        'text-danger': '#9C2C21',
        'text-success': '#3C6631',
        'text-warning': '#835900',
        'focus-ring': '#835900',
        'focus-ring-contrast': '#FFFCF5',
        'fill-accent': '#835529',
        'text-on-accent': '#FFFCF5',
        'fill-danger': '#9C2C21',
        'text-on-danger': '#FFFCF5',
        'fill-success': '#3C6631',
        'text-on-success': '#FFFCF5',
        'fill-warning': '#835900',
        'text-on-warning': '#FFFCF5',
        'fill-neutral': '#635A4D',
        'text-on-neutral': '#FFFCF5',
        'shadow-color': '#3A2F1C',
      }),
      dark: Object.freeze({
        'surface-page': '#000000',
        'surface-card': '#121110',
        'surface-raised': '#1A1815',
        'surface-selected': '#262119',
        'surface-input': '#16140F',
        'surface-disabled': '#201D18',
        'line-divider': '#2E2A24',
        'line-control': '#877D6B',
        'text-primary': '#EDE4CE',
        'text-muted': '#A79C86',
        'text-placeholder': '#A0957F',
        'text-disabled': '#8A806E',
        'text-accent': '#D9A85F',
        'text-danger': '#F0897A',
        'text-success': '#8CC47A',
        'text-warning': '#E3BE55',
        'focus-ring': '#E3BE55',
        'focus-ring-contrast': '#1A1815',
        'fill-accent': '#D9A85F',
        'text-on-accent': '#1A1815',
        'fill-danger': '#F0897A',
        'text-on-danger': '#1A1815',
        'fill-success': '#8CC47A',
        'text-on-success': '#1A1815',
        'fill-warning': '#E3BE55',
        'text-on-warning': '#1A1815',
        'fill-neutral': '#A79C86',
        'text-on-neutral': '#1A1815',
        'shadow-color': '#000000',
      }),
    }),
  }),
  Object.freeze({
    id: 'slate-blue',
    name: 'Cool slate and deep navy',
    summary:
      'A cool, crisp light theme and a deep blue-charcoal dark theme. Reads as an instrument rather ' +
      'than as paper, and holds structure better when a screen is genuinely dense.',
    themes: Object.freeze({
      light: Object.freeze({
        'surface-page': '#EFF3F7',
        'surface-card': '#FFFFFF',
        'surface-raised': '#E4EAF1',
        'surface-selected': '#D8E1EB',
        'surface-input': '#FFFFFF',
        'surface-disabled': '#E7ECF2',
        'line-divider': '#D2DAE3',
        'line-control': '#6C7A88',
        'text-primary': '#151D26',
        'text-muted': '#505C69',
        'text-placeholder': '#5A6672',
        'text-disabled': '#6C7A88',
        'text-accent': '#1B5A85',
        'text-danger': '#9C271F',
        'text-success': '#2C6449',
        'text-warning': '#72520A',
        'focus-ring': '#1B5A85',
        'focus-ring-contrast': '#FFFFFF',
        'fill-accent': '#1B5A85',
        'text-on-accent': '#FFFFFF',
        'fill-danger': '#9C271F',
        'text-on-danger': '#FFFFFF',
        'fill-success': '#2C6449',
        'text-on-success': '#FFFFFF',
        'fill-warning': '#72520A',
        'text-on-warning': '#FFFFFF',
        'fill-neutral': '#505C69',
        'text-on-neutral': '#FFFFFF',
        'shadow-color': '#0E1721',
      }),
      dark: Object.freeze({
        'surface-page': '#0B0F14',
        'surface-card': '#141A21',
        'surface-raised': '#1C242D',
        'surface-selected': '#26313C',
        'surface-input': '#10161C',
        'surface-disabled': '#1E262F',
        'line-divider': '#2A343E',
        'line-control': '#7E8D9B',
        'text-primary': '#E3EAF2',
        'text-muted': '#A3B1BF',
        'text-placeholder': '#9AA8B6',
        'text-disabled': '#828F9C',
        'text-accent': '#7FC1E8',
        'text-danger': '#F19489',
        'text-success': '#86CBA5',
        'text-warning': '#E0BE63',
        'focus-ring': '#7FC1E8',
        'focus-ring-contrast': '#0B0F14',
        'fill-accent': '#7FC1E8',
        'text-on-accent': '#0B0F14',
        'fill-danger': '#F19489',
        'text-on-danger': '#0B0F14',
        'fill-success': '#86CBA5',
        'text-on-success': '#0B0F14',
        'fill-warning': '#E0BE63',
        'text-on-warning': '#0B0F14',
        'fill-neutral': '#A3B1BF',
        'text-on-neutral': '#0B0F14',
        'shadow-color': '#000000',
      }),
    }),
  }),
  Object.freeze({
    id: 'ink-neutral',
    name: 'Neutral ink with one accent',
    summary:
      'Near-achromatic surfaces carrying a single strong accent. The highest tonal contrast of the ' +
      'three, so structure is read from edges and weight rather than from colour.',
    themes: Object.freeze({
      light: Object.freeze({
        'surface-page': '#F4F4F2',
        'surface-card': '#FFFFFF',
        'surface-raised': '#EAEAE7',
        'surface-selected': '#DEDEDA',
        'surface-input': '#FFFFFF',
        'surface-disabled': '#EDEDEA',
        'line-divider': '#D8D8D3',
        'line-control': '#73716C',
        'text-primary': '#131211',
        'text-muted': '#57554F',
        'text-placeholder': '#5F5D57',
        'text-disabled': '#6F6D67',
        'text-accent': '#00564F',
        'text-danger': '#9C2117',
        'text-success': '#2C6432',
        'text-warning': '#725000',
        'focus-ring': '#00564F',
        'focus-ring-contrast': '#FFFFFF',
        'fill-accent': '#00564F',
        'text-on-accent': '#FFFFFF',
        'fill-danger': '#9C2117',
        'text-on-danger': '#FFFFFF',
        'fill-success': '#2C6432',
        'text-on-success': '#FFFFFF',
        'fill-warning': '#725000',
        'text-on-warning': '#FFFFFF',
        'fill-neutral': '#57554F',
        'text-on-neutral': '#FFFFFF',
        'shadow-color': '#1C1B19',
      }),
      dark: Object.freeze({
        'surface-page': '#0A0A0A',
        'surface-card': '#151514',
        'surface-raised': '#1F1F1E',
        'surface-selected': '#2B2B29',
        'surface-input': '#101010',
        'surface-disabled': '#232322',
        'line-divider': '#333331',
        'line-control': '#8E8C87',
        'text-primary': '#F2F1EE',
        'text-muted': '#AEACA7',
        'text-placeholder': '#A5A39E',
        'text-disabled': '#8E8C87',
        'text-accent': '#6FD3C6',
        'text-danger': '#F59185',
        'text-success': '#8CCB84',
        'text-warning': '#E5C15C',
        'focus-ring': '#6FD3C6',
        'focus-ring-contrast': '#0A0A0A',
        'fill-accent': '#6FD3C6',
        'text-on-accent': '#0A0A0A',
        'fill-danger': '#F59185',
        'text-on-danger': '#0A0A0A',
        'fill-success': '#8CCB84',
        'text-on-success': '#0A0A0A',
        'fill-warning': '#E5C15C',
        'text-on-warning': '#0A0A0A',
        'fill-neutral': '#AEACA7',
        'text-on-neutral': '#0A0A0A',
        'shadow-color': '#000000',
      }),
    }),
  }),
]);

/**
 * Every pair a person will actually look at, for one palette in one theme.
 *
 * Deliberately NOT the cross product of all colours. A cross product measures pairs
 * nobody will ever render, and its failures are noise that teaches you to ignore the
 * table. This enumerates the pairings the roles themselves declare, INCLUDING the states
 * that are easy to leave undeclared: placeholder text inside a field, the label of a
 * disabled control, the edge of a control against its own inside rather than against the
 * page, the label on a coloured button rather than on a surface, and the focus ring both
 * on the surface behind a control and on the filled control itself.
 */
export function enumeratePairs(palette, themeName) {
  const values = palette.themes[themeName];
  if (values === undefined) {
    throw new Error(`palette ${palette.id} has no ${themeName} theme`);
  }
  const pairs = [];

  const add = (foreground, background, kind, context) => {
    pairs.push({
      palette: palette.id,
      theme: themeName,
      foreground,
      background,
      foregroundHex: values[foreground],
      backgroundHex: values[background],
      kind,
      threshold: THRESHOLDS[kind],
      context,
    });
  };

  for (const surface of SURFACES) {
    for (const role of TEXT_ON_SURFACE) {
      add(role, surface, 'text', `${role} read at body size on ${surface}`);
    }
    for (const role of NON_TEXT_ON_SURFACE) {
      add(role, surface, 'non-text', `${role} drawn against ${surface}`);
    }
  }

  // The empty field. Placeholder text is read, so it is held to the reading threshold.
  add('text-placeholder', 'surface-input', 'text', 'the hint inside an empty field');

  // The control that cannot be used. Exempt under the standard; measured here anyway.
  add('text-disabled', 'surface-disabled', 'non-text', 'the label of a disabled control, on its own background');
  add('text-disabled', 'surface-card', 'non-text', 'the label of a disabled control sitting flat on a card');
  add('line-control', 'surface-disabled', 'non-text', 'the edge of a disabled control against its own inside');

  // Reported, never gated. See the note beside THRESHOLDS for why each one is here.
  add('surface-disabled', 'surface-card', 'informational', 'the body of a disabled control against the card behind it');
  add('surface-card', 'surface-page', 'informational', 'how far a card lifts off the page floor');
  add('surface-raised', 'surface-card', 'informational', 'how far a raised surface lifts off a card');
  add('surface-selected', 'surface-page', 'informational', 'the tint of the current destination in the navigation surface');
  for (const surface of SURFACES) {
    add('line-divider', surface, 'informational', `a decorative divider on ${surface}`);
  }

  // The two bands of the focus indicator must be visible against each other.
  add('focus-ring-contrast', 'focus-ring', 'non-text', 'the inner band of the focus indicator against the outer band');

  for (const { fill, label } of FILLS) {
    add(label, fill, 'text', `${label} read inside ${fill}`);
    add(fill, 'surface-page', 'non-text', `the edge of ${fill} against the page floor`);
    add(fill, 'surface-card', 'non-text', `the edge of ${fill} against a card`);
    add('focus-ring-contrast', fill, 'non-text', `the inner band of the focus indicator where it meets ${fill}`);
  }

  return pairs;
}

/** Every pair, across every palette and both themes. */
export function enumerateAllPairs() {
  const pairs = [];
  for (const palette of PALETTES) {
    for (const themeName of Object.keys(palette.themes)) {
      pairs.push(...enumeratePairs(palette, themeName));
    }
  }
  return pairs;
}
