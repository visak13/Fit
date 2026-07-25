/**
 * THE NAVIGATION SKELETON — one list, read by both the router and the navigation bar.
 *
 * The application must reach clients, the calendar, routines, diet and admin from anywhere, so
 * these destinations are declared once. A second hand-maintained copy in the navigation markup is
 * how a route ends up reachable by URL but invisible in the interface, or listed in the interface
 * and dead when tapped.
 *
 * The screens behind these are placeholders. The visual system is the next step's work and it
 * mounts into this frame; what is load-bearing here is the SHAPE — the destinations, their paths
 * and the fact that every one of them resolves.
 */

export interface Destination {
  /** Path fragment under the router's root. */
  readonly path: string;
  /** What the navigation surface calls it. */
  readonly label: string;
  /** One line describing what will live here, so a placeholder screen is not a blank page. */
  readonly summary: string;
}

/** The persistent navigation surface, in the order it is presented. */
export const DESTINATIONS: readonly Destination[] = Object.freeze([
  Object.freeze({
    path: 'clients',
    label: 'Clients',
    summary: 'Each client, their notes, their sessions, their diet and their progress.',
  }),
  Object.freeze({
    path: 'calendar',
    label: 'Calendar',
    summary: 'Sessions past and upcoming, and the way into running one.',
  }),
  Object.freeze({
    path: 'routines',
    label: 'Routines',
    summary: 'The exercise library and the routines built from it, all of it editable.',
  }),
  Object.freeze({
    path: 'diet',
    label: 'Diet',
    summary: 'Weekly food plans by day and hour, with import rather than cell-by-cell typing.',
  }),
  Object.freeze({
    path: 'admin',
    label: 'Admin',
    summary: 'Setup, backup and restore, sync status, and this device’s own record.',
  }),
]);

/** Where an empty path lands. The calendar is the screen a session starts from. */
export const DEFAULT_DESTINATION_PATH = 'calendar';
