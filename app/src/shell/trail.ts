/**
 * THE CONTEXTUAL LAYER — the second navigation layer, and the rule that keeps it from colliding
 * with the first.
 *
 * The global surface (the rail on a wide window, the bar on a narrow one) carries DESTINATIONS:
 * the five places the application has. This layer carries the TO-AND-FRO between related things
 * inside one of them — a client, then one of his sessions, then one exercise in it. It is a
 * breadcrumb pinned into the sticky content header, with a LABELLED way back at its left.
 *
 * ## The one rule, and why it is enforced here rather than trusted
 *
 * **A DESTINATION NEVER APPEARS IN THE CONTEXTUAL LAYER, AND A CONTEXTUAL ACTION NEVER APPEARS IN
 * THE GLOBAL ONE.** Two layers that overlap disagree about where the coach is, and the active state
 * starts lying: he is looking at a breadcrumb saying Clients while the rail also says Clients, and
 * only one of them is highlighted.
 *
 * Six screens are going to fill this layer in later steps, and a rule six authors each remember
 * separately is a rule that holds five times. So the rule is CODE here: `contextualLine` is handed
 * the destination list and refuses any step that points at a destination itself. That is also why
 * this module is plain logic with no React in it — it is the part that can be tested, and it is
 * tested in `trail.test.ts`.
 *
 * ## What a screen declares
 *
 * A screen calls `useDeclareTrail` (see `ContextualTrail.tsx`) with a `ContextualTrail`, or with
 * `null` if it is a destination's own screen and has no trail. A trail always carries a way BACK,
 * because the standing requirement is that the browser back button is never the only way out of
 * anywhere — so "no way back" is not expressible, rather than merely discouraged.
 *
 * ```ts
 * useDeclareTrail({
 *   back: { label: "Priya's sessions", to: 'clients/priya/sessions' },
 *   steps: [{ label: 'Priya', to: 'clients/priya' }],
 *   here: 'Tuesday, 12 June',
 * });
 * ```
 *
 * Which reads, on screen: **Back to Priya's sessions** | Priya / Tuesday, 12 June.
 */

/** A place the coach can return to. Never a destination — see the rule above. */
export interface TrailStep {
  /**
   * What it is called, in the coach's words. It is composed into "Back to …" for the back control,
   * so it reads as a thing rather than as a screen: `Priya's sessions`, not `Sessions list`.
   */
  readonly label: string;
  /** A route path under the router's root, e.g. `clients/priya`. Leading slashes are tolerated. */
  readonly to: string;
}

/** What a screen declares about where it sits. */
export interface ContextualTrail {
  /**
   * The labelled way back. NOT optional: the browser back button is never the only way out, and a
   * required field is the only version of that rule which cannot be forgotten.
   */
  readonly back: TrailStep;
  /** Ancestors between the destination and here, outermost first. Often empty. */
  readonly steps: readonly TrailStep[];
  /** What the coach is looking at now. The last crumb, and never a link. */
  readonly here: string;
}

/** One rendered crumb. `to` is null for the last one, which is where he already is. */
export interface Crumb {
  readonly label: string;
  readonly to: string | null;
}

/** Something a screen declared that this layer will not render, and why. */
export interface TrailProblem {
  readonly label: string;
  readonly reason: string;
}

/** The contextual layer as the frame draws it. */
export interface ContextualLine {
  /**
   * The back control, already worded. Null when the screen's declared way back was refused — see
   * `problems`, and see the note in `contextualLine` about why that is not a dead end.
   */
  readonly back: { readonly label: string; readonly to: string } | null;
  readonly crumbs: readonly Crumb[];
  /** Empty when the screen declared a well-formed trail. Non-empty is a defect in that screen. */
  readonly problems: readonly TrailProblem[];
}

/**
 * The path a route target names, with the spellings a screen might reasonably write stripped off.
 *
 * `clients/priya`, `/clients/priya` and `#/clients/priya` are the same place, and a rule that only
 * recognised one of them would let the other two past the destination check silently.
 */
function routeSegments(to: string): readonly string[] {
  let path = to.trim();
  if (path.startsWith('#')) path = path.slice(1);
  return path.split('/').filter((segment) => segment.length > 0);
}

/**
 * Whether a route target IS a destination rather than something inside one.
 *
 * `clients` is the Clients destination and belongs to the rail. `clients/priya` is a client, which
 * is exactly what this layer is for. The test is therefore the segment COUNT as well as the name:
 * one segment that names a destination is the collision; two segments starting with the same word
 * are the intended case.
 *
 * @param to the route target a screen declared
 * @param destinationPaths the paths of every destination on the global surface
 */
export function namesADestination(to: string, destinationPaths: readonly string[]): boolean {
  const segments = routeSegments(to);
  return segments.length === 1 && destinationPaths.includes(segments[0]);
}

/** How a way back reads on screen. Composed once so six screens word it the same way. */
export function backControlLabel(step: TrailStep): string {
  return `Back to ${step.label}`;
}

/**
 * A stable identity for a trail, so the frame can react to a screen declaring a DIFFERENT trail
 * without reacting to the same trail arriving as a fresh object on every render.
 *
 * A screen writes its trail as an object literal inside its own body, so the object is new each
 * time React renders it. Comparing by reference would re-publish the trail on every keystroke of
 * every field on the screen; comparing by this key publishes it when it actually changes.
 */
export function trailKey(trail: ContextualTrail | null): string {
  if (trail === null) return '';
  const parts = [trail.back.label, trail.back.to, trail.here];
  for (const step of trail.steps) parts.push(step.label, step.to);
  // The UNIT SEPARATOR, written as an escape rather than typed: it is the one character no
  // label or path can contain, and joining on a space instead would make {"a b", "c"} and
  // {"a", "b c"} the same key, so a reworded crumb would fail to republish.
  return parts.join('\u001f');
}

/**
 * The contextual layer, resolved and checked, ready for the frame to draw.
 *
 * ## What a refusal does, and why it is not an exception
 *
 * A screen that declares a destination as a crumb has a defect, and the honest response to a defect
 * is to fail loudly. But the loudest failure available here — throwing — would take the coach's
 * session down over a navigation label, and the standing rule for this application is that it
 * always opens and always works. So a bad step is DROPPED, recorded in `problems`, and the frame
 * logs it. `trail.test.ts` is where it fails loudly, which is the place a defect like this is
 * actually found.
 *
 * A refused way BACK is the uncomfortable case and it is deliberate: if a screen's way back points
 * at a destination, the rail and the bar already carry that destination on every screen, so
 * dropping the control leaves no dead end — it removes a duplicate rather than an exit.
 *
 * @param trail what the screen declared, or null if it declared none
 * @param destinationPaths the paths of every destination on the global surface
 */
export function contextualLine(
  trail: ContextualTrail | null,
  destinationPaths: readonly string[],
): ContextualLine | null {
  if (trail === null) return null;

  const problems: TrailProblem[] = [];
  const crumbs: Crumb[] = [];

  for (const step of trail.steps) {
    if (step.label.trim().length === 0) {
      problems.push({ label: step.to, reason: 'a crumb with no words is a control nobody can read' });
      continue;
    }
    if (namesADestination(step.to, destinationPaths)) {
      problems.push({
        label: step.label,
        reason: `"${step.to}" is a destination, and a destination belongs to the global navigation only`,
      });
      continue;
    }
    crumbs.push({ label: step.label, to: step.to });
  }

  if (trail.here.trim().length > 0) {
    crumbs.push({ label: trail.here, to: null });
  } else {
    problems.push({ label: '(here)', reason: 'the current place has no name' });
  }

  let back: ContextualLine['back'] = null;
  if (trail.back.label.trim().length === 0) {
    problems.push({ label: trail.back.to, reason: 'a way back with no words is an unlabelled arrow' });
  } else if (namesADestination(trail.back.to, destinationPaths)) {
    problems.push({
      label: trail.back.label,
      reason: `"${trail.back.to}" is a destination, which the global navigation already carries on every screen`,
    });
  } else {
    back = { label: backControlLabel(trail.back), to: trail.back.to };
  }

  return { back, crumbs, problems };
}
