/**
 * A TOOLTIP — and the requirement comes before the component, because it shapes all of it.
 *
 * Tooltips exist here so a non-technical person can unblock or clarify without getting lost. The
 * rule that follows from that, and the one to read twice:
 *
 * **NOTHING NEEDED TO FINISH A TASK MAY LIVE IN A TOOLTIP.** Anything he actually needs belongs on
 * the screen, permanently. That is not a preference about tidiness — it is the thing that makes a
 * tooltip safe to be UNREACHABLE, and it is unreachable on half the devices this application runs
 * on. The coach taps a phone with a client in front of him; there is no hover there, and a tap that
 * opened a bubble would be a tap that did not press the button he aimed at. So a touch pointer is
 * ignored outright, and the interface has to be complete without a single tooltip ever opening.
 *
 * Use one where someone could genuinely be BLOCKED, and nowhere else. A tooltip on every control is
 * noise that trains him to ignore all of them, including the one that mattered.
 *
 * ## It opens on keyboard focus, and that is half the component
 *
 * The forgotten half, and the half a keyboard user depends on entirely. Tab to the control and the
 * bubble opens; tab away and it closes. Escape closes it without moving the pointer or the focus,
 * which is what a person who has one open over the thing they were reading needs.
 *
 * ## No dependency, and that was a decision rather than an omission
 *
 * The application ships React, React DOM and React Router and nothing else, it is served from a
 * static host, and it must work offline. A tooltip library is weight and risk for behaviour that is
 * a hundred lines — and the hundred lines are the part that has to be right: the placement is proved
 * in `tooltip-placement.ts`, not eyeballed.
 *
 * ```tsx
 * <Tooltip text="Backed up means every change on this device has reached your Google Drive.">
 *   <button className="icon-btn" aria-label="What backed up means">
 *     <Glyph name="help-explain" decorative />
 *   </button>
 * </Tooltip>
 * ```
 */

import type { ReactElement } from 'react';
import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { placeTooltip } from './tooltip-placement.ts';

/**
 * A length written in the token layer, read back off the element that consumes it.
 *
 * Reading it rather than repeating it is what keeps the gap and the screen margin bound to the
 * spacing scale instead of becoming two numbers in a TypeScript file that nobody would think to
 * check against it. A value that cannot be read is treated as zero, which keeps every guarantee the
 * placement makes: the bubble still lands inside the viewport and still clears its target, just
 * without the breathing room.
 */
function tokenLength(styles: CSSStyleDeclaration, name: string): number {
  const value = Number.parseFloat(styles.getPropertyValue(name));
  return Number.isFinite(value) ? value : 0;
}

export interface TooltipProps {
  /**
   * What it says, in the coach's words — what the thing does FOR him, never what it is implemented
   * as. It is supplementary by definition; if the task cannot be finished without it, it is in the
   * wrong place.
   */
  readonly text: string;
  /** The control it describes. Exactly one, and it must be able to take focus. */
  readonly children: ReactElement<{ 'aria-describedby'?: string }>;
}

export function Tooltip({ text, children }: TooltipProps) {
  const bubbleId = useId();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLDivElement>(null);

  const position = useCallback(() => {
    const target = trigger.current;
    const element = bubble.current;
    if (target === null || element === null) return;

    // Measured at its natural size: a cap left over from the last time it opened would otherwise be
    // read back as the size it wants to be, and the bubble would shrink a little on every open.
    element.style.setProperty('--tip-max-height', 'none');

    const styles = getComputedStyle(element);
    const placement = placeTooltip({
      target: target.getBoundingClientRect(),
      bubble: element.getBoundingClientRect(),
      viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
      gap: tokenLength(styles, '--tip-gap'),
      margin: tokenLength(styles, '--tip-viewport-margin'),
    });

    element.style.setProperty('--tip-left', `${placement.left}px`);
    element.style.setProperty('--tip-top', `${placement.top}px`);
    element.style.setProperty('--tip-max-height', `${placement.maxHeight}px`);
    element.dataset.side = placement.side;
  }, []);

  // Placed before the browser paints it, so it is never seen at the position it had last time.
  useLayoutEffect(() => {
    if (!open) return;
    position();
  }, [open, position, text]);

  useEffect(() => {
    if (!open) return;

    // Capture, because the thing that scrolled is usually an ancestor of the trigger rather than
    // the document: a scroll event from a scrolling region does not reach the window by bubbling.
    const reposition = () => position();
    window.addEventListener('scroll', reposition, { capture: true, passive: true });
    window.addEventListener('resize', reposition, { passive: true });

    // AND WHEN AN ANCESTOR FINISHES MOVING. Placement is measured once, at the moment the bubble
    // opens, and that is too early wherever opening the tooltip is also what starts an animation
    // around it. Measured on the navigation rail: focusing a destination expands the rail from 76px
    // to 248px AND opens the bubble, the bubble is placed to the right of a 76px target, and 200ms
    // later the rail has grown underneath it — so the tooltip ends up covering the very control it
    // describes, which is the one thing the placement code exists to prevent. Nothing errors and the
    // measured placement was correct for the layout it was given.
    document.addEventListener('transitionend', reposition, true);

    // Dismissible without moving the pointer, which is the case a pointer user actually hits: the
    // bubble is over the text they were reading and the control is not where their hand is.
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', dismiss);

    return () => {
      window.removeEventListener('scroll', reposition, { capture: true });
      window.removeEventListener('resize', reposition);
      document.removeEventListener('transitionend', reposition, true);
      document.removeEventListener('keydown', dismiss);
    };
  }, [open, position]);

  return (
    <span
      ref={trigger}
      className="tip"
      // A touch pointer is deliberately not a trigger. See the header: on a phone this bubble is
      // unreachable by design, and everything it could say is on the screen already.
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') setOpen(true);
      }}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      {cloneElement(children, {
        'aria-describedby': open
          ? [children.props['aria-describedby'], bubbleId].filter(Boolean).join(' ')
          : children.props['aria-describedby'],
      })}
      <div ref={bubble} id={bubbleId} role="tooltip" className="tip-bubble" data-open={open}>
        {text}
      </div>
    </span>
  );
}
