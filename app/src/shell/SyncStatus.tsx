/**
 * THE PERMANENT SYNCHRONISATION INDICATOR, AND THE SEAM THAT DRIVES IT.
 *
 * The standard this exists to serve is the user's own: the application takes accountability for the
 * data, a real professional will use it, his pay depends on it, and **if a synchronisation does not
 * happen the application must highlight that**. An indicator that can scroll out of sight is an
 * application that quietly stops telling him, so the whole accountability posture rests on this
 * being visible at every moment, on both surfaces, in every state the interface can reach.
 *
 * ## Where it is, and the sentence that matters more than anything about how it looks
 *
 * It renders into `<div className="frame-status">` in `AppFrame.tsx`, which is a **child of `.app`**
 * — a sibling of the rail, of the bar and of the content — placed by the frame's grid into the area
 * named `status`. A grid area only places a DIRECT CHILD, so the placement working at all is the
 * proof of the siblinghood. **It is never moved inside the rail, inside `.content`, inside the
 * sticky header or inside a screen**: every one of those can scroll, collapse or hide, and every one
 * of them passes a computed check while doing it. Two builders made exactly that mistake with every
 * check green. See `app/DESIGN.md`, *Where the synchronisation indicator goes*.
 *
 * ## IT IS NEVER A MODAL, however loud it needs to become
 *
 * A modal is for a decision that genuinely cannot proceed without an answer; synchronisation status
 * is not one. `core/status` makes that a property of the data rather than a rule to remember —
 * `blocks_application` is a frozen `false` and every rung declares `blocks: false` — and this
 * component is the interface half of the same promise: the top of the ladder escalates by being
 * louder, never by gating, covering or demanding an answer. An application that refuses to open
 * loses the very session it was trying to protect.
 *
 * ## THE SEAM: what this consumes today, and exactly what the later step must supply
 *
 * Real synchronisation is a later step. This indicator is therefore driven through an explicit,
 * required seam — never a hard-coded state, and never a state invented inside the component.
 *
 * - The seam is `SyncStatusProvider`, and its `reading` is a {@link SyncStatusReading}: a SUBSET of
 *   the object `accountabilityStatus()` in `core/status/surface.js` already returns, field for field
 *   and name for name. Nothing is converted and nothing is renamed.
 * - **Today** `main.tsx` supplies {@link NO_BACKUP_YET}. That is not a mock: this build has no local
 *   store wired, so nothing has ever been backed up because nothing yet can be, and "never
 *   synchronised, nothing queued" is exactly what the real call returns over a store in that
 *   condition. Its fields are assembled from the core's own frozen constants so it cannot drift away
 *   from what the real call will produce.
 * - **The later step replaces the SOURCE, not this component and not this file.** It must:
 *     1. open the local store and call
 *        `accountabilityStatus(store, { in_progress, last_attempt, credential })`;
 *     2. push each result into `SyncStatusProvider`'s `reading`;
 *     3. re-read it after every synchronisation attempt and on each of the five opportunities
 *        declared in `SYNC_TRIGGERS` (`core/sync/engine.js`) — open, foreground, leave, periodic
 *        while open, and the manual tap — and on a modest interval besides, because the ladder
 *        climbs with the clock even when nothing happens;
 *     4. supply an action for `reason.action` — see *the tap* below, and see
 *        `shell/action-destinations.ts` for WHICH of the five codes it is actually responsible for.
 *
 * **That fourth point used to list all five codes as one undifferentiated job, and naming no step is
 * how two of them came to be waiting on work they never needed.** `review_refused` and
 * `review_unconfirmed` are reads over the LOCAL outbox queue — `needsAttention` in
 * `core/outbox/status.js`, whose refusal reason is already kept verbatim — and they now have a screen
 * and an address. `connect_google`, `reconnect_google` and `sync_now` genuinely need the Google
 * integration and the report wire, and `action-destinations.ts` names the step that owns each one, with
 * a check that fails if a code ever has neither an address nor an owner.
 *
 * **The tap is deliberately absent today, and that is the honest choice.** There is nothing to
 * connect to and nothing to send, so this renders as a status region rather than as a control: a
 * button that cannot do what its words say is worse than no button, and `reasons.js` already says
 * that offering an action which does not help is how an indicator earns the reputation of lying.
 * When the later step supplies the action, this becomes the control Console specifies, in this file,
 * and nothing about its placement or its silhouettes changes.
 *
 * ## What is drawn, and why it is three things rather than one
 *
 * `sync-indicator.ts` explains the model in full and it is worth reading before touching this file.
 * In short: the SILHOUETTE carries the rung and only the rung, and *working offline* and *something
 * is stopped* are marks beside it that can both be present with the rung still fully readable.
 * Colour is the last of four channels — outline, glyph, word, then fill — because the first three
 * are what survive greyscale, sunlight, a colour-blind reader and video-call compression.
 *
 * In the collapsed rail the words fall away and **the filled shape and the number never do**. That
 * was measured rather than chosen: the widest silhouette is 44px, the count needs 20 beside it, and
 * a 76px rail has 60 inside its padding. Both ways of fitting them side by side are defeats —
 * shrinking the shape destroys the one property that survives greyscale, and dropping the number
 * turns the accountability signal into decoration. Stacked, both keep full size.
 */

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import { Glyph } from '../design/Glyph.tsx';
import type { GlyphName } from '../design/glyphs.generated.ts';
import {
  RUNG_GLYPH,
  RUNG_SILHOUETTE,
  isOffline,
  isStopped,
  needsAction,
  rungOf,
  syncWording,
} from './sync-indicator.ts';
import type { SyncStatusReading } from './sync-indicator.ts';

export type { SyncStatusReading } from './sync-indicator.ts';
/** Re-exported so the seam is wired from ONE import at the application's start. Defined, and
 *  asserted, in `sync-indicator.ts`, which needs no browser to test. */
export { NO_BACKUP_YET } from './sync-indicator.ts';

const SyncStatusContext = createContext<SyncStatusReading | null>(null);

/**
 * The seam. `reading` is required and is never null: the indicator has a state for every condition
 * the core can be in, and a seventh "not measured yet" state would be one the coach could learn to
 * read as normal. A source with nothing measured yet supplies {@link NO_BACKUP_YET}, which is what
 * is true at that moment.
 */
export function SyncStatusProvider({
  reading,
  children,
}: {
  reading: SyncStatusReading;
  children: ReactNode;
}) {
  return <SyncStatusContext.Provider value={reading}>{children}</SyncStatusContext.Provider>;
}

/**
 * The current reading.
 *
 * @throws Error when used outside the provider. A missing seam must be loud: an indicator that
 * silently rendered a default would be the component inventing a state, which is the one thing this
 * design does not permit it to do.
 */
export function useSyncStatus(): SyncStatusReading {
  const reading = useContext(SyncStatusContext);
  if (reading === null) {
    throw new Error('useSyncStatus was used outside SyncStatusProvider: the synchronisation seam is not wired');
  }
  return reading;
}

/**
 * One mark beside the silhouette: a condition that is present or absent, never a step on a ladder.
 *
 * IT CARRIES NO VISIBLE WORD, AND THAT WAS MEASURED RATHER THAN CHOSEN. With one, the phone's bar
 * was still slim; with two, "Working offline" and "Needs you" at reading size left the sentence a
 * column narrow enough to wrap into five lines, and the slim bar above the bottom bar became a
 * ninety-pixel block taken out of the session runner. The word did not disappear — it moved to
 * `detail`, where it is a sentence rather than a chip, and it is in the announced statement in full.
 * The mark is the redundant, wordless reading; the words are in the words.
 */
function Mark({ kind, glyph }: { kind: 'offline' | 'stopped'; glyph: GlyphName }) {
  return (
    <span className={`sync-mark sync-mark-${kind}`}>
      <Glyph name={glyph} size="dense" decorative />
    </span>
  );
}

/**
 * THE INDICATOR. One element, both of Console's specified placements, and no second copy anywhere.
 *
 * Everything visible is `aria-hidden` and the whole statement is given once, in full, in a visually
 * hidden span. That is not belt and braces: the visible words FALL AWAY in the collapsed rail, so an
 * announcement assembled from what is on screen would be complete on one surface and a bare number
 * on the other. One sentence, always the same sentence, whatever is painted.
 *
 * The role escalates with the state — `role="alert"` once the ladder has climbed or something is
 * stopped, `role="status"` otherwise — which is DESIGN.md's rule mapped exactly. It is one element
 * and therefore one live region: two would mean two announcements of the same state with a rule that
 * only one counts, which nothing could check. Working offline never raises the role, because an
 * offline-first application working from its own copy is not something the coach must act on.
 */
export function SyncIndicator() {
  const status = useSyncStatus();
  const rung = rungOf(status);
  const words = syncWording(status);

  return (
    <div
      className="sync"
      data-rung={rung}
      data-silhouette={RUNG_SILHOUETTE[rung]}
      data-offline={isOffline(status) ? 'true' : undefined}
      data-stopped={isStopped(status) ? 'true' : undefined}
      role={needsAction(status) ? 'alert' : 'status'}
      aria-atomic="true"
    >
      <span className="sync-shape" aria-hidden="true">
        <Glyph name={RUNG_GLYPH[rung] as GlyphName} size="dense" decorative />
      </span>

      {/* Never a bare dot: the number is what makes the collapsed chip information rather than
          decoration, so it is painted at full size beside the shape at every width. */}
      <span className="sync-count" aria-hidden="true">
        {words.count}
      </span>

      <span className="sync-marks" aria-hidden="true">
        {words.offlineWord !== null && <Mark kind="offline" glyph="sync-offline" />}
        {words.stoppedWord !== null && <Mark kind="stopped" glyph="sync-failed" />}
      </span>

      <span className="sync-words" aria-hidden="true">
        <strong>{words.headline}</strong>
        <small>{words.detail}</small>
      </span>

      <span className="visually-hidden">{words.announced}</span>
    </div>
  );
}
