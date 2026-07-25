/**
 * THE NAVIGATION SKELETON — one list, read by both the router and the navigation surface.
 *
 * The application must reach clients, the calendar, routines, diet and admin from anywhere, so
 * these destinations are declared once. A second hand-maintained copy in the navigation markup is
 * how a route ends up reachable by URL but invisible in the interface, or listed in the interface
 * and dead when tapped.
 *
 * ONE LIST, THREE CONSUMERS NOW. `routes.tsx` builds the route table from it, and `AppFrame.tsx`
 * builds BOTH global surfaces — the wide rail and the narrow bar — from the same array in the same
 * order. That is what makes "same five destinations, same order, same words on both devices" a
 * property of the data rather than a thing two pieces of markup have to agree about.
 *
 * The glyph belongs here for exactly that reason. A second table mapping path to glyph beside the
 * surface is how one destination ends up with the wrong mark on one device only, which nothing
 * would report.
 */

import type { GlyphName } from '../design/glyphs.generated.ts';

export interface Destination {
  /** Path fragment under the router's root. */
  readonly path: string;
  /** What the navigation surface calls it. Its accessible name on both surfaces, at 16px. */
  readonly label: string;
  /** One line describing what will live here, so a placeholder screen is not a blank page. */
  readonly summary: string;
  /** The mark it carries on both surfaces. From the family in `design/icons`, never inlined. */
  readonly glyph: GlyphName;
  /**
   * Supplementary help, shown as a tooltip on the wide rail, for a destination whose NAME does not
   * tell a non-technical person what is behind it.
   *
   * Optional, and deliberately rare: a tooltip on every destination is noise that trains the coach
   * to ignore all of them, including the one that mattered. Nothing needed to finish a task lives
   * in one — see `Tooltip.tsx` — so a destination without help is not a destination missing
   * something.
   */
  readonly help?: string;
}

/** The persistent navigation surface, in the order it is presented. */
export const DESTINATIONS: readonly Destination[] = Object.freeze([
  Object.freeze({
    path: 'clients',
    label: 'Clients',
    summary: 'Each client, their notes, their sessions, their diet and their progress.',
    glyph: 'nav-clients',
  }),
  Object.freeze({
    path: 'calendar',
    label: 'Calendar',
    summary: 'Sessions past and upcoming, and the way into running one.',
    glyph: 'nav-calendar',
  }),
  Object.freeze({
    path: 'routines',
    label: 'Routines',
    summary: 'The exercise library and the routines built from it, all of it editable.',
    glyph: 'nav-routines',
  }),
  Object.freeze({
    path: 'diet',
    label: 'Diet',
    summary: 'Weekly food plans by day and hour, with import rather than cell-by-cell typing.',
    glyph: 'nav-diet',
  }),
  Object.freeze({
    path: 'admin',
    label: 'Admin',
    summary: 'Setup, backup and restore, sync status, and this device’s own record.',
    glyph: 'nav-admin',
    // The only one of the five that is not the coach's own vocabulary. Clients, Calendar, Routines
    // and Diet are what he already calls these things; "Admin" is ours, and a coach looking for
    // where to connect his Google account or get his data back has no way to guess it is here.
    // That is the "could genuinely be blocked" test, and it is the only place in the frame that
    // passes it.
    help: 'Setting up your Google account, backing up and restoring your data, and what this device has stored.',
  }),
]);

/** Where an empty path lands. The calendar is the screen a session starts from. */
export const DEFAULT_DESTINATION_PATH = 'calendar';
