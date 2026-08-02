/**
 * GENERATED FILE — do not edit. Run `npm run glyphs` instead.
 *
 * Derived from `design/icons/` by `tools/make-glyphs.mjs`, which is where the reasoning lives.
 * `src/design/glyphs.test.ts` re-derives this on every shell test run and fails if a byte differs,
 * so an edit here or a glyph edited without re-running the generator cannot ship silently.
 *
 * Only what makes one glyph DIFFERENT from another is here. Everything the family shares — fill,
 * stroke, stroke width, caps, joins and Console's optical correction — belongs to `.glyph` in
 * `src/design/console.css` and appears nowhere else.
 */

import type { GlyphDefinition } from './glyph-family.ts';

/** Every glyph the family draws, keyed by the name it is asked for by. */
export const GLYPHS = {
  'add': {
    title: 'Add',
    shapes: [
      { kind: 'circle', cx: 12, cy: 12, r: 9.5 },
      { kind: 'path', d: 'M12 7v10M7 12h10' },
    ],
  },
  'backup': {
    title: 'Make backup',
    shapes: [
      { kind: 'path', d: 'M4 9h16l1 4v8H3v-8Z' },
      { kind: 'path', d: 'M12 3v12M8 11l4 4 4-4M3 13h5M16 13h5' },
    ],
  },
  'client-adaptation-flag': {
    title: 'Client programme adaptation flag',
    shapes: [
      { kind: 'path', d: 'M5 21V3' },
      { kind: 'path', d: 'M5 4h12l-2 4 2 4H5' },
      { kind: 'path', d: 'M9 7h4' },
    ],
  },
  'close': {
    title: 'Close',
    shapes: [
      { kind: 'path', d: 'm5 5 14 14M19 5 5 19' },
    ],
  },
  'collapse': {
    title: 'Collapse detail',
    shapes: [
      { kind: 'path', d: 'm5 15 7-7 7 7' },
    ],
  },
  'delete': {
    title: 'Delete',
    shapes: [
      { kind: 'path', d: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15' },
      { kind: 'path', d: 'M10 10v7M14 10v7' },
    ],
  },
  'drag-handle': {
    title: 'Drag handle',
    shapes: [
      { kind: 'circle', cx: 8, cy: 6, r: 1 },
      { kind: 'circle', cx: 16, cy: 6, r: 1 },
      { kind: 'circle', cx: 8, cy: 12, r: 1 },
      { kind: 'circle', cx: 16, cy: 12, r: 1 },
      { kind: 'circle', cx: 8, cy: 18, r: 1 },
      { kind: 'circle', cx: 16, cy: 18, r: 1 },
    ],
  },
  'edit': {
    title: 'Edit',
    shapes: [
      { kind: 'path', d: 'm4 16-1 5 5-1L20 8l-4-4Z' },
      { kind: 'path', d: 'm13.5 6.5 4 4M4 16l4 4' },
    ],
  },
  'expand': {
    title: 'Expand detail',
    shapes: [
      { kind: 'path', d: 'm5 9 7 7 7-7' },
    ],
  },
  'export': {
    title: 'Export file',
    shapes: [
      { kind: 'path', d: 'M12 3v12M8 7l4-4 4 4' },
      { kind: 'path', d: 'M5 12H3v9h18v-9h-2' },
    ],
  },
  'filter': {
    title: 'Filter content',
    shapes: [
      { kind: 'path', d: 'M3 5h18l-7 8v6l-4 2v-8Z' },
    ],
  },
  'help-explain': {
    title: 'Open explanation',
    shapes: [
      { kind: 'path', d: 'M4 3h16v14H9l-5 4Z' },
      { kind: 'path', d: 'M12 10v4M12 7h.01' },
    ],
  },
  'link-back': {
    title: 'Follow link back',
    shapes: [
      { kind: 'path', d: 'M20 8v8M4 12h13M9 7l-5 5 5 5' },
    ],
  },
  'link-external': {
    title: 'Opens in a new tab',
    shapes: [
      { kind: 'path', d: 'M12 5H5v14h14v-7' },
      { kind: 'path', d: 'M14 4h6v6' },
      { kind: 'path', d: 'm20 4-8 8' },
    ],
  },
  'link-forward': {
    title: 'Follow link forward',
    shapes: [
      { kind: 'path', d: 'M4 8v8M20 12H7M15 7l5 5-5 5' },
    ],
  },
  'nav-admin': {
    title: 'Administration',
    shapes: [
      { kind: 'rect', x: 3, y: 4, width: 18, height: 16, rx: 2 },
      { kind: 'path', d: 'M7 9h10M7 15h10' },
      { kind: 'circle', cx: 10, cy: 9, r: 1.5 },
      { kind: 'circle', cx: 15, cy: 15, r: 1.5 },
    ],
  },
  'nav-calendar': {
    title: 'Calendar',
    shapes: [
      { kind: 'rect', x: 3, y: 4, width: 18, height: 17, rx: 2 },
      { kind: 'path', d: 'M7 2v4M17 2v4M3 9h18' },
      { kind: 'path', d: 'M7 13h2M12 13h2M17 13h.01M7 17h2M12 17h2' },
    ],
  },
  'nav-clients': {
    title: 'Clients',
    shapes: [
      { kind: 'circle', cx: 9, cy: 7, r: 3 },
      { kind: 'path', d: 'M3 20v-2a6 6 0 0 1 12 0v2' },
      { kind: 'circle', cx: 17.5, cy: 8.5, r: 2.5 },
      { kind: 'path', d: 'M16 14.2a5 5 0 0 1 5 4.8v1' },
    ],
  },
  'nav-diet': {
    title: 'Diet plans',
    shapes: [
      { kind: 'rect', x: 3, y: 4, width: 7, height: 6, rx: 2 },
      { kind: 'rect', x: 14, y: 4, width: 7, height: 6, rx: 2 },
      { kind: 'rect', x: 3, y: 14, width: 7, height: 6, rx: 2 },
      { kind: 'rect', x: 14, y: 14, width: 7, height: 6, rx: 2 },
    ],
  },
  'nav-routines': {
    title: 'Routines',
    shapes: [
      { kind: 'path', d: 'M3 5h6a3 3 0 0 1 3 3v12a4 4 0 0 0-4-3H3Z' },
      { kind: 'path', d: 'M21 5h-6a3 3 0 0 0-3 3v12a4 4 0 0 1 4-3h5Z' },
    ],
  },
  'note': {
    title: 'Note',
    shapes: [
      { kind: 'path', d: 'M5 3h10l4 4v14H5Z' },
      { kind: 'path', d: 'M15 3v5h4M8 12h8M8 16h6' },
    ],
  },
  'progress-over-time': {
    title: 'Progress over time',
    shapes: [
      { kind: 'path', d: 'M4 3v18h17' },
      { kind: 'path', d: 'm7 16 4-5 3 2 5-7' },
      { kind: 'path', d: 'M16 6h3v3' },
    ],
  },
  'protected-clinical-note': {
    title: 'Protected clinical note',
    shapes: [
      { kind: 'rect', x: 4, y: 10, width: 16, height: 11, rx: 2 },
      { kind: 'path', d: 'M8 10V7a4 4 0 0 1 8 0v3M8 15h8M8 18h5' },
    ],
  },
  'reading-heart-rate': {
    title: 'Heart rate reading',
    shapes: [
      { kind: 'path', d: 'M3 12h4l2-5 4 10 2-5h6' },
    ],
  },
  'reading-held-position': {
    title: 'Held position reading',
    shapes: [
      { kind: 'circle', cx: 5, cy: 7, r: 2.5 },
      { kind: 'path', d: 'M7.5 11h9l3 5H9l-3-5' },
      { kind: 'path', d: 'M4 16h17M7 16v3M19 16v3' },
    ],
  },
  'reading-repetition-count': {
    title: 'Repetition count',
    shapes: [
      { kind: 'path', d: 'm3 9 3-2v10' },
      { kind: 'path', d: 'M10 9a2 2 0 0 1 4 0c0 3-4 4-4 8h4' },
      { kind: 'path', d: 'M18 7h3l-2 4h1a2 2 0 0 1 0 4h-2' },
    ],
  },
  'reading-timer': {
    title: 'Timer reading',
    shapes: [
      { kind: 'circle', cx: 12, cy: 13, r: 8.5 },
      { kind: 'path', d: 'M9 2h6M12 4.5V2M18.5 6.5 20 5' },
      { kind: 'path', d: 'M12 8v5l3 2' },
    ],
  },
  'rest-interval': {
    title: 'Rest interval',
    shapes: [
      { kind: 'path', d: 'M6 3h12M6 21h12M8 3c0 5 2 6 4 9-2 3-4 4-4 9M16 3c0 5-2 6-4 9 2 3 4 4 4 9' },
    ],
  },
  'restore': {
    title: 'Restore backup',
    shapes: [
      { kind: 'path', d: 'M3 7v5h5' },
      { kind: 'path', d: 'M4.5 11a8.5 8.5 0 1 1 2 7' },
      { kind: 'path', d: 'M4 7a8.5 8.5 0 0 1 14-2' },
      { kind: 'path', d: 'M12 7v5l3 2' },
    ],
  },
  'search': {
    title: 'Search',
    shapes: [
      { kind: 'circle', cx: 10.5, cy: 10.5, r: 7 },
      { kind: 'path', d: 'm15.5 15.5 5 5' },
    ],
  },
  'session-finish': {
    title: 'Finish and record session',
    shapes: [
      { kind: 'circle', cx: 12, cy: 12, r: 9.5 },
      { kind: 'path', d: 'm7.5 12 3 3 6-6' },
    ],
  },
  'session-next-exercise': {
    title: 'Next exercise',
    shapes: [
      { kind: 'path', d: 'M4 12h14M13 7l5 5-5 5M21 6v12' },
    ],
  },
  'session-pause': {
    title: 'Pause session',
    shapes: [
      { kind: 'circle', cx: 12, cy: 12, r: 9.5 },
      { kind: 'path', d: 'M9.5 8v8M14.5 8v8' },
    ],
  },
  'session-previous-exercise': {
    title: 'Previous exercise',
    shapes: [
      { kind: 'path', d: 'M20 12H6M11 7l-5 5 5 5M3 6v12' },
    ],
  },
  'session-reorder-exercises': {
    title: 'Reorder exercises',
    shapes: [
      { kind: 'path', d: 'M9 6h11M9 12h11M9 18h11' },
      { kind: 'path', d: 'M4 3v18M2 5l2-2 2 2M2 19l2 2 2-2' },
    ],
  },
  'session-repeat-exercise': {
    title: 'Repeat exercise',
    shapes: [
      { kind: 'path', d: 'M19 8a8 8 0 0 0-13.5-2L3 8.5' },
      { kind: 'path', d: 'M3 4v4.5h4.5' },
      { kind: 'path', d: 'M5 16a8 8 0 0 0 13.5 2l2.5-2.5' },
      { kind: 'path', d: 'M21 20v-4.5h-4.5' },
    ],
  },
  'session-skip-exercise': {
    title: 'Skip exercise',
    shapes: [
      { kind: 'path', d: 'm4 6 8 6-8 6ZM12 6l8 6-8 6ZM21 6v12' },
    ],
  },
  'session-start': {
    title: 'Start session',
    shapes: [
      { kind: 'circle', cx: 12, cy: 12, r: 9.5 },
      { kind: 'path', d: 'M10 8.5 16 12l-6 3.5Z', filled: true },
    ],
  },
  'session-substitute-exercise': {
    title: 'Substitute exercise',
    shapes: [
      { kind: 'path', d: 'M4 8h14M15 5l3 3-3 3' },
      { kind: 'path', d: 'M20 16H6M9 13l-3 3 3 3' },
    ],
  },
  'settings': {
    title: 'Settings',
    shapes: [
      { kind: 'circle', cx: 12, cy: 12, r: 7 },
      { kind: 'circle', cx: 12, cy: 12, r: 3 },
      { kind: 'path', d: 'M12 2v3M12 19v3M2 12h3M19 12h3' },
      { kind: 'path', d: 'm5 5 2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19' },
    ],
  },
  'share': {
    title: 'Share file',
    shapes: [
      { kind: 'circle', cx: 18, cy: 5, r: 3 },
      { kind: 'circle', cx: 6, cy: 12, r: 3 },
      { kind: 'circle', cx: 18, cy: 19, r: 3 },
      { kind: 'path', d: 'm8.7 10.6 6.6-4.2M8.7 13.4l6.6 4.2' },
    ],
  },
  'sign-out': {
    title: 'Sign out',
    shapes: [
      { kind: 'path', d: 'M4 3h9v18H4' },
      { kind: 'path', d: 'M9 12h12M17 8l4 4-4 4' },
    ],
  },
  'sign-out-and-erase-this-device': {
    title: 'Sign out and erase this device',
    shapes: [
      { kind: 'rect', x: 4, y: 3, width: 16, height: 14, rx: 2 },
      { kind: 'path', d: 'M4 17 2 21h20l-2-4' },
      { kind: 'path', d: 'm8 7 8 6M16 7l-8 6' },
    ],
  },
  'sync-backed-up': {
    title: 'Synchronisation backed up',
    shapes: [
      { kind: 'path', d: 'M7 19C4.5 19 3 17.2 3 15c0-2.3 1.6-4.2 3.8-4.5C7.6 7.3 10.1 5 13.3 5c3.1 0 5.7 2.2 6.2 5.3 1.5.7 2.5 2.2 2.5 4.2 0 2.5-2 4.5-5 4.5Z' },
      { kind: 'path', d: 'm9 14 2 2 4-4' },
    ],
  },
  'sync-failed': {
    title: 'Synchronisation failed',
    shapes: [
      { kind: 'path', d: 'M4 6v12M20 6v12M4 8h16v8H4Z' },
      { kind: 'path', d: 'm7 8 4 8M13 8l4 8' },
    ],
  },
  'sync-offline': {
    title: 'Synchronisation offline',
    shapes: [
      { kind: 'path', d: 'M3 8h7v8H3M6 8V5M9 8V5M10 12h3' },
      { kind: 'path', d: 'M15 12h2M17 7v10M20 9v6' },
    ],
  },
  'sync-pending': {
    title: 'Synchronisation pending',
    shapes: [
      { kind: 'path', d: 'M3 7h11M3 12h16M3 17h11' },
      { kind: 'path', d: 'm15 8 4 4-4 4' },
    ],
  },
  'sync-pending-overdue': {
    title: 'Synchronisation pending overdue',
    shapes: [
      { kind: 'path', d: 'M12 3 22 21H2Z' },
      { kind: 'path', d: 'M12 9v5M12 18h.01' },
    ],
  },
  'sync-pending-warning': {
    title: 'Synchronisation pending warning',
    shapes: [
      { kind: 'path', d: 'M5 17h14l-2-3v-4c0-3-2-5-5-5s-5 2-5 5v4Z' },
      { kind: 'path', d: 'M10 20h4' },
    ],
  },
  'theme-dark': {
    title: 'Dark theme',
    shapes: [
      { kind: 'path', d: 'M20.5 13.8A8.5 8.5 0 1 1 10.2 3.5a7 7 0 0 0 10.3 10.3z' },
    ],
  },
  'theme-light': {
    title: 'Light theme',
    shapes: [
      { kind: 'circle', cx: 12, cy: 12, r: 4.5 },
      { kind: 'path', d: 'M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3' },
      { kind: 'path', d: 'm5.3 5.3 2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1' },
    ],
  },
  'theme-system': {
    title: 'Theme follows the device',
    shapes: [
      { kind: 'circle', cx: 12, cy: 12, r: 8.5 },
      { kind: 'path', d: 'M12 3.5v17' },
      { kind: 'path', d: 'M15.2 6.8v10.4M18 10v4' },
    ],
  },
  'what-leaves-this-device': {
    title: 'What leaves this device',
    shapes: [
      { kind: 'rect', x: 2, y: 4, width: 6, height: 16, rx: 2 },
      { kind: 'rect', x: 16, y: 4, width: 6, height: 16, rx: 2 },
      { kind: 'path', d: 'M8 9h2M14 9h2M8 15h2M14 15h2' },
    ],
  },
} as const satisfies Record<string, GlyphDefinition>;

/** The name of a glyph in the family. A name that is not one of these does not type-check. */
export type GlyphName = keyof typeof GLYPHS;
