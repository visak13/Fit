# Three visual directions

This document names three directions for the application, says exactly how each one
differs from the other two, and states which one is recommended. Three later steps each
build exactly one of them, without conferring, so everything a builder needs is here.

The choice being offered is a **look and a shape**, not a colourway. Each direction has its
own palette, its own density, its own navigation shape and its own tonal weight. Sitting in
front of any two of them should feel like sitting in front of two different applications.

Every colour named here has been measured, not chosen by eye. Run `node design/contrast.mjs`
from `C:\Projects\Fit`; it computes every pair a person will actually look at across all
three palettes in both themes, prints the table, writes `design/contrast-report.json`, and
exits non-zero if a single pair is short. At the time of writing it evaluates 444 pairs, of
which 390 carry a threshold, and all 390 pass.

---

## What all three share, and none may change

These are settled. A direction expresses itself inside them, never by relaxing one.

- **Both themes ship together.** Light and dark are the same token names with different
  values, switched by one attribute on the root element. A direction with a dark theme
  added afterwards is a direction whose dark theme nobody measured.
- **Reading text is never below 16px, and line height never below 1.5.** Density is bought
  from spacing and row height. It is never bought from the size of the words, because that
  cost is paid over a three-hour evening and it arrives as mistakes rather than complaints.
- **Anything tapped during a session is at least 44px.** The floor in the standard is 24px;
  this is deliberately well above it, because the coach taps while a client is talking to him.
- **Navigation is two layers that never overlap.** A persistent global surface carries the
  five destinations — Clients, Calendar, Routines, Diet, Admin — in the same order with the
  same labels on both devices. A contextual layer inside the content carries the to-and-fro
  between related things, with a labelled way back on every screen. A destination never
  appears in the contextual layer and a contextual action never appears in the global one.
  The browser back button is never the only way out of anywhere.
- **No emoji, anywhere.** Not in a label, not in a status chip, not in an empty state.
- **Every state carries a word as well as a colour or a shape**, so nothing depends on
  being able to tell green from amber.
- **Status is never a modal.** A modal is for a decision that genuinely cannot proceed
  without an answer. Sync status is not one, however loud it needs to become.
- **Focus is the two-band indicator**, `var(--focus-indicator)`. Never a single-colour
  outline: no one colour is visible against both a pale page and a filled button, and the
  single-colour version looks perfectly correct everywhere except on the primary action.
- **No literal colour, size, radius or duration in a screen.** Only `var(--token)`.

---

## Direction 1 — Ledger  *(recommended)*

**The structural axis: tonal weight.** Ledger is flat. There is no elevation anywhere in it,
including on popovers and the sticky header. Structure is carried entirely by dividers,
spacing and background steps between surfaces. It reads as a good paper form.

| | |
|---|---|
| **Palette** | `house-sepia` — warm paper light (`#FAF4E8` floor, `#FFFCF5` cards), pure-black dark (`#000000` floor). Accent is a burnt sienna `#835529`. |
| **Density** | `comfortable`. 48px rows, 24px gutters, generous section gaps. |
| **Tonal weight** | Lowest of the three. `--elevation-0` everywhere; boundaries are `--line-divider` and the step between `--surface-page` and `--surface-card`. |
| **Navigation, laptop (≥840px)** | Permanently expanded left sidebar, 248px, icon and label together, five destinations, never collapsible. The current destination is filled with `--surface-selected` and carries a 3px accent marker down its leading edge, so the selection is a shape as well as a tint. |
| **Navigation, phone (<600px)** | Bottom bar, five items, icon above label, 56px tall plus the safe-area inset. Same five, same order, same words. |
| **Contextual layer** | A breadcrumb row at the top of the content card, plus an explicit labelled back control reading *Back to Priya's sessions* rather than an unlabelled arrow. |
| **Sync status indicator** | A full-width strip directly under the content header on laptop and directly above the bottom bar on phone. Always present, never dismissible. Reads *Backed up 4 minutes ago* in the calm state and never collapses to an icon alone. Escalation is by fill and by wording: `--fill-success` synced, `--fill-warning` from six hours, `--fill-danger` from twenty-four, each with a distinct shape at the leading edge. It never blocks the application. |
| **Tooltips** | Below the target, `--surface-raised`, 8px radius, no arrow, 200ms delay in, none out. Opens on keyboard focus as well as hover. Never carries anything needed to finish the task. |
| **Icon weight** | 2px stroke on a 24x24 canvas, round caps and joins. The lightest of the three, matched to the flat surfaces. |

**The trade-off in one sentence:** Ledger is the calmest and the least tiring to look at for
hours, and the price is that on a dense screen it separates things a little less sharply
than the other two.

---

## Direction 2 — Console

**The structural axis: density.** Console fits noticeably more on a screen than Ledger does,
without shrinking a single word, and it uses elevation rather than dividers to say which
surface you are working on. It reads as an instrument.

| | |
|---|---|
| **Palette** | `slate-blue` — cool light (`#EFF3F7` floor, pure white cards), deep blue-charcoal dark (`#0B0F14` floor). Accent is a deep blue `#1B5A85` in light, a pale sky `#7FC1E8` in dark. |
| **Density** | `compact`. 40px rows, no row gap, 16px gutters. Controls stay 44px. |
| **Tonal weight** | Highest of the three. `--elevation-1` on cards, `--elevation-2` on the sticky header and popovers, `--elevation-3` on anything overlaying the session. |
| **Navigation, laptop (≥840px)** | Compact icon rail, 76px, icon above a micro-label, expanding to 248px on hover or keyboard focus and holding open while focus is inside it. The rail's narrow resting state is what buys the horizontal room for a genuine two-column layout on the client and session screens. |
| **Navigation, phone (<600px)** | Bottom bar, identical to Ledger's. The rail is a laptop affordance only; the phone must not inherit a hover-dependent one. |
| **Contextual layer** | A single breadcrumb line pinned into the sticky content header, so it survives scrolling on a long session screen, with the labelled back control at its left. |
| **Sync status indicator** | A chip pinned to the foot of the rail on laptop, expanding with the rail to show *Backed up 4 minutes ago* and the pending count; on phone, a slim always-visible bar immediately above the bottom bar. Same escalation ladder, same wording, same never-blocking rule. In the collapsed rail the chip still shows a filled shape and a number, never a bare dot. |
| **Tooltips** | Right of the target on laptop where the rail is the most common trigger, below on phone. Same delay, same focus behaviour, same rule about nothing vital living in one. |
| **Icon weight** | 2px stroke, 24x24, round caps — but drawn slightly tighter inside the canvas so they read at rail size. |

**The trade-off in one sentence:** Console shows the most in one glance and suits the dense
screens best, and the price is that it feels more like an instrument panel than a notebook,
which is more to take in at the start of a long session.

---

## Direction 3 — Roster

**The structural axis: navigation shape.** Roster is the only direction where the persistent
surface carries a **list** as well as the destinations. On a laptop it is a permanent
list-and-detail application: pick a client on the left, work on them on the right, never
lose the list. That is a different way of moving through the application, not a restyling
of the other two.

| | |
|---|---|
| **Palette** | `ink-neutral` — near-achromatic light (`#F4F4F2` floor, pure white cards), near-black dark (`#0A0A0A` floor), carrying one accent: a deep teal `#00564F` in light, `#6FD3C6` in dark. Colour appears only where it means something. |
| **Density** | Mixed, and deliberately so: `compact` in the list pane, `roomy` in the detail pane. The list is for scanning, the detail is for working. |
| **Tonal weight** | Middle, and edge-defined rather than shadow-defined: the highest text contrast of the three, `--elevation-1` at most, and a `--border-strong` rule between the two panes. |
| **Navigation, laptop (≥840px)** | Two columns in the persistent surface: a 76px destination column of five icons with labels beneath, and beside it a 300px list pane showing the current destination's items — clients, upcoming sessions, routines, diet plans. Selecting one fills the detail area to the right. The destination column and the list pane are the two layers kept visually distinct by the `--border-strong` rule and by the list pane using `--surface-card` against the column's `--surface-page`. |
| **Navigation, phone (<600px)** | Bottom bar as in the other two, and the list-and-detail relationship becomes a push: the list is the screen, tapping an item pushes the detail over it, and the labelled back control returns. The same information architecture at a narrower width — never a second, different design. |
| **Contextual layer** | Lighter than in the other two, because the list pane is itself permanent context: a breadcrumb appears only when the detail drills a level deeper, for instance from a client into one of their past sessions. The labelled back control is always present on phone. |
| **Sync status indicator** | Pinned to the foot of the destination column on laptop, at full width above the bottom bar on phone. Same ladder, same words, same rules. |
| **Tooltips** | Right of the target for the destination column, below elsewhere. Same behaviour as the others. |
| **Icon weight** | 2px stroke, 24x24, but the destination glyphs are drawn at a marginally heavier optical weight so a near-achromatic column does not read as grey furniture. |

**The trade-off in one sentence:** Roster is the fastest for moving between clients and back
again and never loses your place in the list, and the price is a permanently narrower
working area on the laptop and one more moving part to learn.

---

## The recommendation

**Ledger.**

The requirement this application is most likely to fail is not that it lacks a feature. It
is that it becomes tiring, and a tired coach with a client waiting starts making errors and
then stops using it. Ledger is the direction built for that risk: warm rather than clinical,
flat rather than busy, comfortable rather than tight, and lowest in glare in both themes.
The dark theme sits on pure black, which on the iPhone the coach actually uses means the
unlit pixels of an evening session are genuinely off.

It is also the direction that asks the least of him. There is no hover-expanded rail, no
second permanent pane, nothing that behaves differently depending on where the pointer is —
which matters because he will be learning this over a video call, and every moving part is
something that has to be explained rather than discovered.

Console is the right answer if, on seeing real content, the density of the session runner
and the diet week grid looks like the binding problem. It genuinely fits more per screen.
Roster is the right answer if moving between clients turns out to be the dominant motion of
a working day; its shape is the best of the three at that one thing and the most costly at
everything else.

The palettes are interchangeable between the directions if the user likes one direction's
shape and another's colours — every one of them is measured and passes, so any pairing is
safe. The structural choices are not interchangeable, because each was drawn to suit the
tonal weight it ships with.
