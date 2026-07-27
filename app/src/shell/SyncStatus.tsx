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
 * - **The SOURCE is now `shell/SyncFromStore.tsx`**, and it was the seam's whole design that replacing
 *   it changed nothing else. It reads `accountabilityStatus(store, { in_progress, last_attempt,
 *   credential })` over the real local store and pushes each result in here unchanged; it re-reads
 *   after every attempt, on each of the five opportunities `SYNC_TRIGGERS` declares
 *   (`core/sync/engine.js`), and on a modest interval besides, because the ladder climbs with the
 *   clock even when nothing happens. `sync-runner.ts` holds the two periodicities and the reason they
 *   are not one timer.
 * - {@link NO_BACKUP_YET} did not become a mock when that landed; it is still what the seam carries in
 *   the bounded window before the first read arrives, and it is still assembled from the core's own
 *   frozen constants so it cannot drift from what the real call produces.
 *
 * **The obligation used to list all five action codes as one undifferentiated job, and naming no step
 * is how two of them came to be waiting on work they never needed.** `review_refused` and
 * `review_unconfirmed` are reads over the LOCAL outbox queue — `needsAttention` in
 * `core/outbox/status.js`, whose refusal reason is already kept verbatim — and they have a screen and
 * an address. `connect_google`, `reconnect_google` and `sync_now` are not places at all: they are ACTS,
 * and `action-destinations.ts` now records them as such, with the words each control says, and with a
 * check that fails if a code ever has none of the three dispositions.
 *
 * **THE TAP EXISTS NOW, AND ONLY WHERE IT CAN HONOUR ITSELF.** It used to be absent, and that was the
 * honest choice while there was nothing to connect to and nothing to send: a button that cannot do what
 * its words say is worse than no button, and `reasons.js` argues that offering an action which does not
 * help is how an indicator earns the reputation of lying. So the control appears for exactly those
 * reasons whose action code is an ACT this build performs, it carries that act's own words, and for
 * every other state this is still a status region and nothing else. Its placement and its silhouettes
 * are unchanged, as that paragraph promised they would be.
 *
 * **IT IS STILL NOT A MODAL AND STILL NEVER BLOCKS.** A control that runs a backup is the opposite of a
 * gate: he may ignore it for ever and the application opens regardless.
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
import { PERFORMED_ACT, performedFor } from './action-destinations.ts';
import { useSyncActionsIfWired } from './sync-actions.tsx';
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
/**
 * THE ONE CONTROL ON THIS SURFACE, AND IT IS ABSENT UNLESS IT CAN HONOUR ITSELF.
 *
 * The reason the core gave carries an action CODE; `action-destinations.ts` says whether that code is
 * an act this build performs, and what the button says. Anything else — a code that leads to a screen,
 * a reason with no action at all, a reason this build does not know — renders nothing, because a
 * control that cannot do what its words say is worse than no control.
 *
 * IT SAYS WHAT IT WILL DO, never "Retry": the words come from the table, one sentence per act, so the
 * coach reads "Connect Google" or "Back up now" rather than a verb with no object. While a pass is
 * running it is DISABLED and says so — the alternative is a second tap the runner would skip in
 * silence, which teaches him the button does nothing.
 *
 * IT COLLAPSES WITH THE WORDS, in the rail, and for the same measured reason they do: a 76px rail has
 * 60px inside its padding, and a button whose label does not fit is a button with no label. What
 * survives collapse is the filled shape and the number, which is the accountability signal; the way to
 * act returns with the words when the rail expands.
 *
 * AND IT RENDERS NOTHING RATHER THAN THROWING when no acts have been supplied. That is deliberate and
 * it is NOT the rule the five seams follow — `sync-actions.tsx` holds the argument in full. In one
 * line: a missing reading would invent reassuring good news, so it must be loud, whereas a missing
 * control is honestly drawn as no control, and a hook that threw would take THE PERMANENT INDICATOR
 * off the screen — which tells the coach nothing at all, and is worse than any value it could show.
 */
function SyncAct() {
  const status = useSyncStatus();
  const actions = useSyncActionsIfWired();
  const performed = performedFor(status.reason?.action ?? null);

  if (actions === null || performed === null) return null;

  const run = performed.act === PERFORMED_ACT.CONNECT ? actions.connect : () => actions.synchronise();

  return (
    <span className="sync-act">
      <button
        type="button"
        className="btn btn-sm"
        disabled={actions.running}
        onClick={(event) => run(event.nativeEvent)}
      >
        {actions.running ? 'Backing up' : performed.words}
      </button>
      {/* What just happened when he tapped, in this application's own words. It is not part of the
          reading — the core cannot know it — and it is never a provider's error text, which is a leak
          path because a failure is what gets logged, journalled and exported. */}
      {actions.refusal !== null && <small className="sync-refusal read">{actions.refusal}</small>}
    </span>
  );
}

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

      {/* OUTSIDE the aria-hidden spans and after the announced sentence, so assistive technology
          reaches a real, named button rather than a hidden one — and so the live region's own
          announcement is the state, not the control. */}
      <SyncAct />
    </div>
  );
}
