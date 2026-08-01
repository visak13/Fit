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

/**
 * THE DIVERGENCE PICKER'S ADDRESS — the first route in this application that is NOT a destination.
 *
 * It lives in this file, beside the list, because this is the module that owns where things are; and
 * it lives OUTSIDE `DESTINATIONS` because it is deliberately not one. The five destinations are the
 * five places the application HAS. A clash between two devices is rare and episodic: a permanent
 * sixth entry would be empty almost every visit, and an entry that is always empty is one the coach
 * learns to stop reading — which would cost him the one time it was not empty.
 *
 * So it has an address, and it is reached from the Admin screen, which already carries
 * synchronisation, backup and this device's own record. The cost of that choice is that its
 * reachability stops being free: a destination is reachable from everywhere by construction, and
 * this is not. `no-dead-ends.test.ts` therefore proves the way in EXISTS, is labelled and resolves —
 * for this route and for every non-destination route added after it.
 *
 * It is named once here and read by both the route table and the screen that links to it. A second
 * spelling in the linking markup is how a link ends up pointing at an address the table does not
 * answer to, which is the not-found-with-a-button shape that shipped once already.
 */
export const DIVERGENCES_PATH = 'decisions';

/**
 * THE KEY-MATERIAL CONDITION SCREEN'S ADDRESS — the second route that is deliberately NOT a
 * destination, and the reasoning is not simply copied from the first.
 *
 * The question was genuinely open, because two things pull against each other here.
 *
 * FOR a sixth destination: this state is not transient. A clash between two devices is answered and
 * gone; a duplicate key sits there until a person sorts it out, and in the meantime the coach may
 * need to come back to it more than once and read it out to whoever is helping him. A surface he can
 * only arrive at by failing is a surface he cannot get back to.
 *
 * AGAINST: the condition is RARE and it arrives from a FAILURE rather than from navigation. Nobody
 * ever goes looking for it the way they go looking for the calendar. A permanent sixth entry would
 * be empty on virtually every visit, and an entry that is always empty is one he learns to stop
 * reading — which is the exact opposite of what is wanted from the one screen whose job is to stop
 * him.
 *
 * AN ADDRESS TAKES BOTH HALVES rather than trading one away. Routing here is by fragment, so a real
 * address survives a refresh, a cold start from the home screen and a stray tap: he can return to it,
 * bookmark it, and read it out. And the navigation surface keeps its five real places. What an
 * address alone does NOT give him is arrival at the moment of failure, so the way in from Admin is
 * PERMANENT and never conditional on there being something to show — the same choice, for the same
 * reason, as the divergence picker's link.
 *
 * Reachability is therefore not free, and it is not assumed: `no-dead-ends.test.ts` proves the way in
 * exists, is labelled, and resolves. That check asks for the PROPERTY — a labelled link from a screen
 * that is itself reachable — rather than for membership of `DESTINATIONS`, so a non-destination is a
 * thing it can hold rather than a thing it forbids.
 *
 * Named once here and read by the route table and by the screen that links to it. A second spelling
 * in the linking markup is how a link ends up pointing at an address the table does not answer to.
 */
export const KEY_MATERIAL_PATH = 'encryption-details';

/**
 * THE STOPPED-CHANGES REVIEW ADDRESS — and this one is not a judgement call, it is a debt being paid.
 *
 * `core/status/reasons.js` gives two of its eight reasons an action code that names a screen:
 * `review_refused` for a change the service refused, and `review_unconfirmed` for one whose outcome
 * cannot be told. `SyncStatus.tsx` lists all five codes as things "the later step" must supply without
 * naming WHICH step — and three of the five genuinely need the Google integration. **These two do
 * not.** `needsAttention` in `core/outbox/status.js` is index reads over the local queue; the reason
 * strings are already written; nothing about telling the coach WHICH change stopped and what the
 * service actually said needs a token or a live service. They had been carried along behind the
 * Google step by PROXIMITY rather than by need.
 *
 * So the address exists now, and `action-destinations.ts` is where each of the five codes is mapped to
 * either an address in this file or the step that owns it — by name, so the unnamed later step this
 * file's neighbours kept referring to stops being unnamed.
 *
 * NOT A DESTINATION, and for the same reason as the two above: a stopped change is episodic. It is
 * reached from Admin, permanently and not conditionally on there being something to show, and
 * `no-dead-ends.test.ts` proves the way in exists, is labelled and resolves.
 */
export const STOPPED_CHANGES_PATH = 'stopped-changes';

/**
 * THE PENDING-REMOVAL ADDRESS — the fourth non-destination, and the one with the longest silence
 * behind it.
 *
 * `core/sync/deletions.js` opens by naming the exact failure it exists to prevent: "A clinical
 * reference living on in a backup forever... and it is invisible: nothing errors, and the coach
 * believes the client is gone." The core does the honest half — a removal is marked propagated only
 * after this device's area has been READ BACK and shown not to contain the removed identities — and
 * until now the belief was never corrected, because no screen anywhere listed a removal still sitting
 * pending.
 *
 * The word is `removals` rather than `deletions` because that is the coach's own word for what he did,
 * and this screen is about the ones NOT yet confirmed gone from the backup.
 *
 * WHAT IS DELIBERATELY NOT HERE: the remote detail naming which record identities are still present.
 * That rides `SyncReport.deletions.still_present` and therefore needs the report-to-surface wire S16
 * is building. This address carries the LOCAL half — the pending manifest, read straight from the
 * local store — which is honest on day one and needs nothing from Google.
 */
export const REMOVALS_PATH = 'removals';

/**
 * THE SETUP SURFACE'S ADDRESS — the sixth non-destination, and the only one whose name was already
 * being said out loud before it existed.
 *
 * `platform/google-meet.ts` has shipped `CALENDAR_NOTICE` since the Google step, on screen ahead of
 * every meeting link it makes: "...then paste its id into Setup". A sentence that names a place is a
 * promise about that place, and this application has been making it to a place that did not exist.
 * The word here is therefore not a fresh choice — `screens/setup.ts` holds it as `SETUP_LABEL` and
 * the screen's heading IS that constant, so the promise and the place cannot be renamed apart.
 *
 * NOT A DESTINATION, and the reason is a different one from all five above.
 *
 * Theirs is that they are episodic and would be empty almost every visit. Setup is not episodic and
 * it is never empty — it is ONE-TIME. It is the screen a coach visits on the evening somebody helps
 * him install this, and then perhaps once more in a year when he changes his calendar. A permanent
 * sixth entry in the navigation surface would put a finished job in front of him every single day,
 * beside the five places he actually works; and the five are the five places the application HAS,
 * which is the property the surface exists to carry. An entry he has no reason to press is an entry
 * he learns to read past, and he learns it about the whole surface rather than about that one.
 *
 * REACHED FROM ADMIN, permanently and never conditionally, like the four before it. That is already
 * the claim Admin makes about itself: the `help` tooltip on the Admin destination above says in
 * terms that Admin is where "Setting up your Google account" happens, and until now nothing behind
 * it did. The link is not conditional on the setup being unfinished — a coach coming back to change
 * a calendar id must be able to find it after everything is done, and a way in that disappears once
 * it has been used is a way in he cannot use twice.
 *
 * Reachability is not free and is not assumed: `no-dead-ends.test.ts` proves the way in exists, is
 * labelled, and resolves — and `setup-surface.test.ts` proves the word on the heading is the word
 * the shipped notice tells him to look for, which is the half a resolving link cannot answer.
 *
 * Named once here and read by the route table and by the screen that links to it. A second spelling
 * in the linking markup is how a link ends up pointing at an address the table does not answer to.
 */
export const SETUP_PATH = 'setup';

/**
 * THE ACTIVITY LOG'S ADDRESS — the seventh non-destination, and the only one that is never empty.
 *
 * `core/journal/` has been writing an entry for every unlock, every record change, every export and
 * every synchronisation since it existed, one hash-linked chain per device, and NOTHING HAS EVER READ
 * IT BACK. The application has been keeping an account of itself that the person it is kept for could
 * not see.
 *
 * NOT A DESTINATION, and the reason is not the one the six above it give.
 *
 * Theirs is that they are EPISODIC and would be empty almost every visit. This one is the opposite: it
 * is never empty and it grows every time he touches the application. What makes it not a destination is
 * that it is a place he goes to CHECK rather than a place he WORKS. The five destinations are the five
 * things the application is for — his clients, his calendar, his routines, his diets and the machinery
 * behind them — and none of a coach's work happens in a log. A sixth entry sitting beside the five
 * every day would be the application inviting him to audit it instead of using it, which is both the
 * wrong emphasis and, on the day something IS wrong, a surface he has learned to scroll past.
 *
 * REACHED FROM ADMIN, permanently and never conditionally on there being something to say. Admin is
 * already where this device's own record lives, and the log is the rest of that sentence: the device
 * card says what this device HAS, and this says what it has DONE.
 *
 * AND WHAT IS BEHIND IT MAY NOT OVERCLAIM. The chain is TAMPER-EVIDENCE and not tamper-proofing —
 * anyone who can get into the device can rewrite the list from any point and recompute it forward.
 * `screens/journal.ts` owns that sentence and the screen is required to render it; the word is not
 * softened here or on the way in.
 *
 * Reachability is not free and is not assumed: `no-dead-ends.test.ts` proves the way in exists, is
 * labelled, and resolves.
 *
 * Named once here and read by the route table and by the screen that links to it. A second spelling in
 * the linking markup is how a link ends up pointing at an address the table does not answer to.
 */
export const JOURNAL_PATH = 'journal';

/**
 * THE SESSION RUNNER'S ADDRESS — the fifth non-destination, and the first one the coach reaches by
 * doing his job rather than by something having gone wrong.
 *
 * `screens/circular-navigation.ts` predicted this route before it existed: "its first real case is
 * the session's own screen, which genuinely sits inside a destination rather than being one". A
 * session is reached FROM the calendar and belongs to it; it is not a sixth place in the application.
 *
 * NOT A DESTINATION, and the reason is not the one the four above it give. Theirs is that they are
 * episodic and would be empty almost every visit. This one is different: it is the screen the whole
 * application exists for, and it is still not a destination — because a permanent entry in the
 * navigation surface would be a way to walk INTO a session, and a session is not somewhere you walk
 * into. It is opened by starting one or by picking one up, both of which are on the calendar, and
 * both of which take the store's lease on it. An entry that could not do that would be a fifth door
 * that only ever says "nothing is open".
 *
 * WHICH SESSION IS A QUERY, NOT A PATH SEGMENT, and the argument is `circular-navigation.ts`'s own:
 * a query is the same place with one answer filled in, where a path segment would be a second
 * address for one screen and `no-dead-ends.test.ts` would then be holding two routes where the
 * application has one. The key itself is spelled once, in `screens/runner.ts`, beside the words that
 * go with it. A record IDENTITY and nothing else travels in it — never a name, for the reason that
 * file gives: an address is the part of this application that gets bookmarked and read over
 * somebody's shoulder.
 *
 * The address therefore survives a refresh and a cold start, which matters more here than anywhere
 * else in the application: the coach reopening the app after his laptop slept is the case the whole
 * session layer is shaped around.
 *
 * Reachability is not free and is not assumed: `no-dead-ends.test.ts` proves the way in from the
 * calendar exists, is labelled and resolves.
 */
export const SESSION_PATH = 'session';
