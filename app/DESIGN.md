# Mounting a screen

Read this before you write a screen. It is the contract between the visual foundation and the six
screens that mount on it, and it exists because the alternative is six coherent screens that each
invented their own spacing.

It says which roles you bind, how you get a heading hierarchy, what a dense screen does to stay
legible, and what you must never do. It does not tell you what your screen contains — that is your
own brief.

## The decision that settles every ambiguous call

The user looked at three finished directions and chose **Console**. His words are the bar, not a
restatement of them: it *keeps you engaged*, it is *minimalistic and shows what matters*, a coach can
*actually make sense of it*, and decisively **it looks like a companion rather than a business**.

When a choice is not covered below, resolve it toward **companion, not business** — never toward what
looks more capable, more professional, or more configurable. The other two directions lost. Do not
borrow from them and do not improve Console toward them.

The application is used by one non-technical professional, for hours, with a client in front of him,
on a laptop and on a phone he taps without looking straight at.

## Where the vocabulary comes from

| | |
|---|---|
| `design/tokens/base.css` | type, spacing, density, radius, border, elevation, motion |
| `design/tokens/palettes.css` | every colour role, both themes, all three palettes. **Generated** — never hand-edited |
| `app/src/design/console.css` | Console's own structural roles, and the primitives below |

The first two are **shared and live outside this application**. `design/contrast.mjs` measures them —
444 pairs, 390 gated, 390 passing — and `src/design/design-system.ts` imports them from where they
live so the thing measured and the thing shipped are the same file. **Never copy a token value into
the application.** A copy passes the harness for ever while the interface drifts away from it.

`app/src/design/design-system.ts` is imported once, by `main.tsx`. A screen imports no stylesheet at
all. If you find yourself adding one, stop and read this document again.

Theme is `data-theme` on the root element and it is already handled: the application follows the
device by default and remembers an explicit choice (`src/design/theme.ts`). A screen never reads or
sets it, and never styles "for dark" — both themes are the same token names with different values, so
a screen that binds roles is already correct in both.

## The one rule

**No literal colour, size, radius or duration in a screen. Only `var(--token)`.**

Not a hex, not `rgb()`, not `14px`, not `200ms`. This is what lets the whole application be re-bound
from the root element instead of edited screen by screen, and it is grep-able, which is the point of
it. See *Before you call it done* for the exact greps.

## The frame's two surfaces, and the ONE width where they change

There is **one width boundary in this application, at 840px**. At or above it the global navigation
is the **wide** surface: a 76px icon rail that expands to 248px. Below it, at every width, it is the
**narrow** surface: a bottom bar of five items, icon above label, 56px plus the safe-area inset.
There is no third treatment and there must not be one.

**They are called wide and narrow, not laptop and phone**, and that is not pedantry. The 600–840
band is exactly where you cannot know whether a pointer exists: it is a tablet, or it is a laptop
window that is not maximised, and nothing in the markup can tell you which. When a surface's
correctness depends on a fact you cannot observe, take the surface that does not need it — the bar
works with a pointer and without one, the rail is degraded without one, and its expansion to 248
would eat a third of an 800px window. Naming devices is what hid this: the thing actually being
branched on is available width and pointer certainty.

**The consequence, so nobody reports it as a bug: a coach working in a half-width laptop window gets
the bottom bar, not the rail.** That is the correct trade.

`src/design/viewport.ts` names the widths and `viewport.test.ts` fails on any width query in
`console.css` that is not one of them, because a media query cannot read a token and that number is
the one value in the visual system that can silently drift.

## What the frame gives you, and what you give it

The navigation frame (`src/shell/`) owns everything outside your screen: the destination rail on the
wide surface, the bottom bar on the narrow one, the sticky content header, the contextual breadcrumb
and its labelled back control, and the permanent synchronisation indicator. **Do not build any of
those.**

The five destinations, their words, their order and their glyphs live in **one place**,
`src/shell/navigation.ts`, and the router and both surfaces are all built from it. If a destination
ever needs something new — a mark, a badge, help text — **add it to that list**. A second table
beside the surface is how a route ends up reachable by URL and invisible in the interface.

Your screen is what the router renders into. It owns its own content and nothing else.

```tsx
export function ClientsScreen() {
  return (
    <div className="screen">
      <section className="card">…</section>
      <section className="card card-tight">…</section>
    </div>
  );
}
```

`.screen` is a column of sections at the shared `--section-gap`. Use it as your outermost element so
six screens share one vertical rhythm.

Two rules about navigation that are not yours to relax, because breaking either one breaks the frame:

- **A destination never appears inside your screen**, and a contextual action never appears in the
  global navigation. Two layers that overlap disagree about where the coach is, and the active state
  starts lying.
- **The browser back button is never the only way out.** Anything you drill into needs a labelled way
  back — *Back to Priya's sessions*, not an unlabelled arrow.

**The two rules together answer a question they look like they contradict, so it is answered here
rather than re-decided per screen: what is a screen's way out when its way out IS a destination?**
The rail and the bar. They are on every screen at every width, they carry all five destinations, and
`trail.ts` already refuses a `back` that names one — a screen does not repeat the global layer, it
relies on it. A placeholder for a destination that is not built yet says what is coming and lets the
frame be the way onward; it must not offer a link to another destination, because the rail is
simultaneously marking THIS destination as current and the two layers would be telling the coach two
different things about where he is.

**One named exception: the address that does not resolve.** It is not one of the five, nothing in the
rail is current while it is on screen, so nothing can start disagreeing — and it is the one screen a
coach arrives at without meaning to, from a mistyped or a stale address. It carries one labelled link
to the default destination. That is a deliberate exception with a stated reason, in the same spirit
as the manifest below, and it does not generalise: no other screen has grounds to name a destination.

## The contextual layer: how your screen says where it sits

This is the second navigation layer, and it is a **mechanism you use**, not markup you write. The
frame draws it into the sticky content header, so a breadcrumb survives scrolling on a long session
screen. You declare; the frame draws.

```tsx
import { useDeclareTrail } from '../shell/ContextualTrail';

export function SessionScreen() {
  useDeclareTrail({
    back: { label: "Priya's sessions", to: 'clients/priya/sessions' },
    steps: [{ label: 'Priya', to: 'clients/priya' }],
    here: 'Tuesday, 12 June',
  });
  …
}
```

Which reads: **Back to Priya's sessions** | Priya / Tuesday, 12 June.

**A destination's own screen declares nothing.** It has no trail; it is already the thing the rail
and the bar highlight. Pass `null` (or don't call the hook) and the layer draws nothing rather than
an empty crumb rail on every screen.

Four things to know before you use it:

- **`back` is not optional.** The browser back button is never the only way out of anywhere, and a
  required field is the only version of that rule which cannot be forgotten. Word it as a *thing*,
  not as a screen: `Priya's sessions`, not `Sessions list`. The frame composes the "Back to ".
- **A destination may not appear in it, and this is enforced rather than trusted.** `trail.ts`
  refuses any step whose route names a destination (`clients`), while allowing anything inside one
  (`clients/priya`). A refused step is dropped and logged with the reason — it does not throw,
  because the standing rule is that this application always opens, and a bad breadcrumb is not worth
  the coach's session. `trail.test.ts` is where it fails loudly.
- **A refused `back` is dropped too, and that leaves no dead end**: if your way back points at a
  destination, the rail and the bar already carry that destination on every screen.
- **The trail clears itself** when your screen unmounts. You never clear it.

Keep the labels short. The header wraps rather than clips, so a long trail costs vertical room on
the narrow surface, where the coach has least of it.

## Surfaces: pick by meaning, not by tone

Console says which surface you are working on with **elevation**. That is its structural axis.

| role | what it means | where |
|---|---|---|
| `--surface-page` | the floor | behind everything. Never a card's background |
| `--surface-card` | where reading and working happens, one step off the floor | `.card` |
| `--surface-raised` | something **on** a card rather than in it | headers, chips, tooltips, notes |
| `--surface-selected` | the row or destination the coach is **on** | selection only, nothing else |

Use `.card` for a section. Add `.card-tight` when the card's own children own the padding — a card of
rows, or of a table — and put `.card-header` and `.card-body` inside it.

The elevation ladder is bound as roles so a screen says what a surface *is*:

| role | what it is |
|---|---|
| `--lift-card` | a card on the page |
| `--lift-sticky` | something pinned that content scrolls under |
| `--lift-popover` | a tooltip or a menu |
| `--lift-over-session` | anything overlaying a live session. Use `.over-session`, which also carries a measured border |

Elevation is decoration and is allowed to fail: where `color-mix` is unsupported the shadows resolve
to nothing and the interface renders flat. **Every boundary that carries meaning is a measured border
or a fill, never a shadow.** If your screen becomes ambiguous when you delete the shadows, it was
leaning on decoration to carry meaning.

## Headings

**The element says depth in the outline. The class says size.** They are separate so a card's title
can be an `h3` on one screen and an `h4` on another without changing size, and so the outline a screen
reader navigates stays honest.

| class | size | use |
|---|---|---|
| `.title-screen` | `--type-title`, 22px | the screen's own title |
| `.title-section` | `--type-lead`, 18px | a card or section title |
| `.title-block` | `--type-body`, 16px | a group inside a card |
| `.value-display` | `--type-display`, 28px | the one number a screen exists to show |

```tsx
<h2 className="title-screen">Clients</h2>
<h3 className="title-section">Priya</h3>
```

The frame's `h1` is the application. Your screen title is an `h2`. Never skip a level to get a size —
that is what the classes are for.

Two other elements have had their browser defaults taken away for the same reason, and you should
know why before you are surprised by it:

- **`<small>` no longer shrinks.** The browser draws it at about 13px, which is under the reading
  floor, and it was found doing exactly that on a real screen with every gate green. It keeps its
  meaning and gives up its size. If the text really is a timestamp, a unit or a record identifier,
  ask for that with `.meta`.
- **`<a>` is bound to `--text-accent`, and to a tap floor.** An unstyled link is the browser's own
  blue, and its own purple once visited: two colours that are in no palette, were measured against
  no surface, and do not change with the theme. It is also `inline-block` with
  `min-block-size: var(--target-minimum)`, because an **inline** box's height is the font's content
  area — 21.6px at 16px — and it does not follow `line-height` or the number of lines it wraps over.
  Measured at 390px: the two links in the setup screen's console-traps disclosure rendered
  216.1 × 21.6, under the 24px floor, while every other anchor cleared it only because a class
  (`.nav-item`, `.btn`, `.back-link`) or a flex parent had already given it a box. 24px and not 44px
  is deliberate: a link inside reading matter is not a control tapped during a session. See
  *Controls, and the number that is not negotiable*.
- **`<code>` no longer shrinks either, and it now has a face.** A browser resolving the generic
  family `monospace` applies its own monospace default size instead of the inherited one, so the
  element lands at about 13px with nobody having written a size anywhere. It was found doing exactly
  that to the admin screen's build stamp — the one string in the application the coach is asked to
  read back character by character, drawn smaller than the sentence asking him to. It is bound to
  `--font-code` at the inherited size. Use it for a value that came from the machine verbatim; use
  `.meta` for a timestamp or an identifier the application itself formatted.

### Label and value: `.pairs`

Two pieces of text where one names the other — the storage a device reports, a client's height, what
a session recorded. It is the other half of `.rows`: a **row is a thing you act on** and is a
control; a **pair is a fact you read** and there is nothing to press.

```tsx
<dl className="pairs">
  <dt className="pair-label">What the browser answered</dt>
  <dd className="pair-value"><code>true</code></dd>
</dl>
```

It is a `<dl>` and that is not decoration: without it a screen reader is handed two unrelated runs of
text and the relationship the layout draws exists only for the eye. The label column sizes to its own
content up to `--pair-label-column`, so four short labels do not cost a third of the card's width,
and a label past the cap wraps rather than pushing its value off the side. On the narrow surface it
stacks, with the space moved from between the label and its value to **between the pairs** — even
spacing down a stacked list is what turns eight facts into sixteen unrelated lines.

## Type, and the rule attached to the small one

Five sizes, three weights. Reading text is `--type-body` (16px) and **never goes below it**, with
line height never below `--leading-body` (1.5). Anything read in paragraphs gets `.read`, which caps
the measure at 68 characters and loosens the leading.

`--type-meta` is 14px and it is for **timestamps, units and record identifiers only**. It is never a
control label, never a field label, never a value the coach reads to make a decision, and never body
text. A direction that had drifted to 14px for chips, row values, prescriptions, field labels,
buttons and table headers had every one of them raised back to 16 — density is not bought there.

## Density, and the only two places it comes from

`data-density="compact"` is bound on the root: 40px rows, no gap between them, 16px gutters. Density
comes from `--row-height`, `--row-gap`, `--gutter`, `--section-gap` and `--card-padding`, and from
nowhere else. Never from smaller words, and never from removing something the coach needs.

Every gap you write is one of the eight steps of the shared spacing scale, through a primitive:

| | |
|---|---|
| `.stack` / `.stack-tight` | a column, at `--space-4` / `--space-2` |
| `.inline` / `.inline-tight` | a wrapping row, at `--space-2` / `--space-1` |
| `.spread` | one thing at each end |
| `.rows` + `.row` | the dense list: 40px, hairline-separated, `.row-name` `.row-value` `.row-actions` inside |
| `.pairs` + `.pair-label` `.pair-value` | a `<dl>` of facts you read: label column beside the values, stacked on the narrow surface |
| `.compare` + `.compare-head` `.compare-label` `.compare-value` `.compare-whose` | `.pairs` with a SECOND value column: one field, what each of the two devices holds for it, rows lining up by construction. One column on the narrow surface, where `.compare-whose` carries the device instead of the heading |
| `.week-scroll` + `.week` `.week-day` `.week-time` `.week-corner` `.week-slot` `.week-meal` | a repeating week by day and time of day: a real `<table>` scrolling inside its own container, with the time column PINNED. No width query — the same behaviour at every width, and a laptop simply has room for all seven days at once. `--week-time-column` and `--week-day-column` are floors, so the days spread on a laptop and scroll on a phone rather than compressing |
| `.steps` | an `<ol>` of things to DO, in order, with the numbers KEPT: the order is part of the instruction, so unlike `.rows` this one does not suppress its markers. Reading text, not a dense list — one step per `<li className="read">` |

## A dense screen that stays legible

The session runner and the diet week are the screens this application exists for, and both hold more
than fits. The answer is **hierarchy and progressive disclosure**, in this order:

1. **Say what the screen is for in one place.** One `.value-display` — the load, the count, the time
   remaining. Everything else on the screen is subordinate to it and should look it.
2. **Move the secondary into a `<details className="disclose">`.** Its summary carries a `.count`, so
   what is collapsed is still accounted for. Nothing is deleted; it is one tap away.
3. **Drill in rather than widen.** A row that needs more than `.row-name` plus a `.row-value` and two
   actions is a row that wants its own screen. The labelled back control makes that cheap.
4. **Let a table scroll inside its own container**, pinning the column that identifies the row. The
   diet week stays a grid on a phone: the time column pins and the days scroll sideways. The same
   information architecture at a narrower width — never a second, different design.

If you have done all four and it still does not fit, the screen is holding two screens. Say so
upward. Do not buy the space from the type.

## Controls, and the number that is not negotiable

Anything tapped during a session is **`--target-touch`, 44px**, in every density. The standard's floor
is `--target-minimum`, 24px, and it is not what this application holds itself to: the coach taps while
a client is talking to him.

This has already been a real defect. A rule that bound `--target-minimum` read as considered,
tokenised, magic-number-free code and rendered the in-session Save button at 26px. Both numbers pass a
gate set to 24, so nothing reported it.

| | |
|---|---|
| `.btn` | the default. `.btn-primary` for the one action, `.btn-danger`, `.btn-quiet` |
| `.btn-sm` | narrower, never shorter |
| `.icon-btn` | a square glyph control. **Always with an accessible name** |
| `.field` | a label and its input. **Every input belongs in one** |
| `<Glyph>` | a glyph from the family. See *Glyphs* below — never an inlined `<svg>` |
| `<Tooltip>` | supplementary help on hover and on focus. See *Tooltips* below |
| `useDeclareTrail()` | how a screen says where it sits. See *The contextual layer* above — never write your own breadcrumb |

A heart-rate input that sat outside `.field` inherited none of its sizing and rendered 21px tall — the
one field the coach types into mid-session, the smallest target on the screen. If you write an
`<input>`, it goes in a `.field`.

**Focus is `var(--focus-indicator)` and it is already bound globally.** Never replace it with an
outline, never remove it, and never set `outline: none` without it. It is two bands because no single
colour clears 3:1 against both a pale page and a filled button: the single-colour version looks
correct on every screen you would think to test it on and vanishes on the primary action.

## Glyphs

Forty-nine of them, drawn once in `design/icons/` and turned into one module by `npm run glyphs`.
**Never inline an `<svg>` in a screen.** The family's whole value is that it looks like one family,
and a hand-inlined glyph is how one of them quietly acquires its own stroke or its own colour.

```tsx
import { Glyph } from '../design/Glyph';

<button className="icon-btn" aria-label="Delete Priya">
  <Glyph name="delete" decorative />            {/* the button carries the name */}
</button>

<Glyph name="sync-offline" label="Working offline" />   {/* nothing else says it */}
```

**Naming it is a required decision, not a default.** A glyph beside a visible label is `decorative`
and hidden from assistive technology; a glyph standing alone takes a `label` and is announced as an
image. The props refuse to compile without one of the two, because whichever a default picked, the
other case would be silently wrong and invisible to anyone testing with their eyes.

| size | lands on | use |
|---|---|---|
| `size="dense"` | 16px | inside a row of many, or beside `--type-meta` |
| `size="inline"` | 20px | inside a control, beside its words |
| `size="rail"` | 24px | the default, and what the family was drawn to be read at |
| `size="lead"` | 32px | a glyph that leads a card |

A glyph takes its colour from the surrounding text, always. **Do not set `fill`, `stroke`,
`stroke-width` or a size on one** — those belong to `.glyph` in `console.css`, where Console's
optical correction lives, and setting one here is how a scaled glyph ends up with a heavier line
than the family it belongs to. A size the table does not have is `--glyph-scale` on the element, and
the stroke follows it.

## Tooltips

`<Tooltip text="…">` around one focusable control. It opens on hover **and on keyboard focus**,
right of the target on a laptop and below it on a phone, and it closes on Escape. Placement is
measured, so it can neither open off the edge of a screen nor cover the control it describes.

```tsx
<Tooltip text="Backed up means every change on this device has reached your Google Drive.">
  <button className="icon-btn" aria-label="What backed up means">
    <Glyph name="help-explain" decorative />
  </button>
</Tooltip>
```

**Nothing needed to finish a task may live inside one.** Anything the coach actually needs stays on
the screen, permanently — that is what makes a tooltip safe to be unreachable, and it is unreachable
on half the devices this application runs on. A touch pointer does not open one, deliberately: on a
phone a tap that opened a bubble is a tap that did not press the button he aimed at.

Use one where someone could genuinely be **blocked**, and nowhere else. A tooltip on every control is
noise that trains him to ignore all of them, including the one that mattered. Write it in his words —
what the thing does *for him*, never what it is implemented as.

## Status, state and colour

- **Every state carries a word as well as a colour or a shape.** Nothing depends on telling green from
  amber — not for a colour-blind reader, not in sunlight, not in a greyscale screenshot, and not
  through the compression of the video call this application will actually be introduced over.
- Routine progress is `role="status"`. Something the coach must act on is `role="alert"`. **An alert
  never steals focus and never auto-dismisses.**
- **Status is never a modal.** A modal is for a decision that genuinely cannot proceed without an
  answer. Sync status is not one, however loud it needs to become.
- Chips are `.chip` plus one of `.chip-accent`, `.chip-success`, `.chip-warning`, `.chip-danger`,
  `.chip-neutral`. A statement with a consequence is `.note`, `.note-warning` or `.note-danger`.
- The permanent synchronisation indicator belongs to the frame. **Do not put a second one on a
  screen.** Where it goes is below.

## Where the synchronisation indicator goes

**`<div className="frame-status">` in `AppFrame.tsx`, and nowhere else.** `<SyncIndicator />` from
`src/shell/SyncStatus.tsx` renders into it, once, and there is no second one anywhere. This section
exists so nobody has to choose again, because the choice has already gone wrong twice.

It is a **child of `.app`** — a sibling of the rail, of the bar and of the content — placed by the
frame's grid into the area named `status`. On the wide surface that area is the foot of the rail's
own column, so the chip expands with the rail. On the narrow surface it is a full-width row directly
above the bar. **One element, both of Console's specified placements**, because two elements would
mean two live regions announcing the same state with a rule that only one counts, which nothing
could check.

**What must not happen to it.** It must not be moved inside the rail, inside `.content`, inside the
sticky header, or inside a screen. Every one of those can scroll, collapse or hide, and **every one
of them passes a computed check while doing it**: a bottom bar and an indicator were once put inside
a detail pane that a narrow width hides, and the phone shipped with no way to reach any destination
and no indicator — 16px met, 44px met, contrast met, name present, order correct, and the element
not on screen. Permanently visible is a claim about the viewport; a computed check is a claim about
the element.

Two properties of the slot the next author should not have to rediscover:

- **It clips rather than widening.** On the wide surface the column's width is the rail's; a chip
  that pushed it wider would move the whole content column.
- **An empty slot draws nothing** (`.frame-status:empty`). The indicator is permanent, so the slot
  is never empty in practice; the rule stays as a belt against a later author rendering it
  conditionally and leaving a stray hairline above the bar.

Verify it the way it actually fails: at several scroll positions, in every state the rail has, and
at both widths. Not once, at the top.

### What the indicator draws: THREE FACTS, not one ladder of six

The Console prototype and `design/direction-two/README.md` describe a single ladder of six states,
with *working offline* as its calmest rung and *refused* just outside it. **That model is not what
`core/status` has, and the core wins.** The prototype is frozen, it predates the core, and it is not
wrong about itself — it is simply not the specification for this. What is drawn is three
*independent* things:

| | comes from | drawn as |
|---|---|---|
| **which rung** the escalation ladder is at | `level` — five, all driven by time: up to date, not backed up, overdue (6h), severely overdue (24h), persistent warning (**more than three days**) | the silhouette, one outline per rung |
| **whether it is working offline** | `REASON.NO_NETWORK` | a hollow **dashed** mark beside it |
| **whether something is stopped** | `needs_attention` | a hollow mark with a solid heavy edge |

**Why they stay independent.** A single ranked list can only ever show the worst of the three, which
is how a refusal ends up hidden behind a dropped connection — and the refusal is the one that never
resolves by itself. `reasons.js` deliberately avoided that in the state layer; a six-way switch here
would have put it straight back in the drawing.

**Working offline is a normal operating condition, not a rung and not a fault.** Local is the
primary copy and the remote is the backup, so a basement gym on a Tuesday is the application
working. It never raises the live region from `status` to `alert`, and its words say what the
application is doing rather than what it has lost.

**A rung is a different outline before it is a different fill**, because colour is the first thing
lost to a colour-blind reader, to sunlight on a phone, to a greyscale screenshot and to the video
call this application will actually be introduced over. Four channels, in order: outline, glyph,
word, fill.

**In the collapsed rail the shape and the number never fall away** — never a bare dot. That was
measured: the widest silhouette is 44px, the count needs 20px, and a 76px rail has 60px inside its
padding, so the two stack. Shrinking the shape would destroy the one property that survives
greyscale and dropping the number would turn the accountability signal into decoration.

### The seam that drives it, and what the later step must supply

Real synchronisation is a later step, so the indicator is driven through an explicit seam — never a
hard-coded state, and never a state invented in the component.

- `SyncStatusProvider` in `src/shell/SyncStatus.tsx` takes a `reading`, which is a **subset of the
  object `accountabilityStatus()` already returns**, field for field and name for name. Nothing is
  converted. `src/shell/sync-indicator.ts` is the whole derivation and it is pure, so every
  condition is asserted without a browser.
- `main.tsx` supplies `NO_BACKUP_YET` today. That is a **true** reading, not a mock: with no local
  store wired, nothing has ever been backed up because nothing yet can be.
- **The later step replaces the source, not the component.** It opens the store, calls
  `accountabilityStatus(store, { in_progress, last_attempt, credential })`, pushes each result into
  the provider on every opportunity in `SYNC_TRIGGERS` and on an interval besides (the ladder climbs
  with the clock), and supplies the action behind `reason.action`. Until it does, the indicator is a
  status region rather than a control — a button that cannot do what its words say is worse than no
  button, and `reasons.js` says offering an action that does not help is how an indicator earns the
  reputation of lying.

**Do not modify anything under `app/core`.** If the shape you need is not there, say so upward.
- One sentence about a storage grant not being immunity exists as the constant
  `PERSISTENCE_IS_NOT_IMMUNITY`. Use the constant. Do not reword it on your screen; having one
  sentence is the whole reason it is a constant.

## What a screen must never do

- Write a literal colour, size, radius or duration.
- Copy a token value, or import a stylesheet of its own.
- Introduce a new **colour** role. Console needed none the shared layer did not already have. Wanting
  one is a signal to re-read the layer, not to add to it.
- Edit anything under `design/tokens`. Three directions were built against that layer; a value rebound
  to suit one screen silently repaints work nobody has a reason to re-check. Found a real defect there?
  Say so upward and leave it alone.
- Use `--line-divider` and `--line-control` interchangeably. Divider is decorative. Control is the edge
  of something interactive and clears 3:1 on every surface it sits on.
- Shrink type below 16px or line height below 1.5 to fit more in.
- Put a destination in the content, or a contextual action in the global navigation.
- Write a breadcrumb, a back control or a second navigation surface of your own. Declare a trail with
  `useDeclareTrail` and let the frame draw it, or six screens will each invent the layer separately.
- Ship a modal to report something the coach did not ask about.
- Use an emoji. Not in a label, not in a status chip, not in an empty state, not anywhere a person can
  read it. They render differently on every device, carry no accessible name you control, and cannot
  be recoloured by a token.
- Style a glyph-only control without an accessible name.
- Design a separate phone screen. Same information architecture at a narrower width.

## The one place a token cannot reach: the manifest

`public/manifest.webmanifest` is JSON. It has no comments, it cannot hold a custom property, and it
carries exactly **one** `theme_color` and **one** `background_color` — so neither can follow a theme
change. This is the single exception to the rule above, and it is written down here rather than left
as two anonymous hex values somebody later deletes for violating it.

**Both values are copies of `--surface-page` in the `slate-blue` DARK theme:**

```json
"theme_color": "#0B0F14",
"background_color": "#0B0F14"
```

`background_color` paints the splash screen the installed application shows while it starts.
`theme_color` tints the browser's surround and the application's card in the task switcher. Inside
the running application both of these are handled properly and follow the theme —
`src/design/browser-chrome.ts` writes the live `--surface-page` into the `theme-color` meta tag on
every theme change. The manifest is only what is shown **before the application is running**, which
is why it cannot participate.

**The cost, stated rather than hidden.** One value has to be wrong for one of the two themes. Dark
was chosen because the two failures are not equal in kind: a bright splash in a dimly lit gym in the
evening is a physical jolt at exactly the moment this whole step exists to protect, while a dark
splash in daylight is a momentary mismatch that costs the eye nothing. **The accepted cost is that a
coach whose phone is in light mode sees a dark splash for the fraction of a second the application
takes to open, and a dark card in his task switcher for an application that is pale inside.** That is
a judgement about which discomfort matters more, not a fact, and it is a reasonable one to overrule.

The value it copies was read from `design/tokens/palettes.css`,
`:root[data-palette="slate-blue"][data-theme="dark"]`. **If that token ever changes, these two
literals must be changed with it** — and something does check that now. This paragraph used to end
"nothing checks them, because nothing can", which conflated two different things: the manifest
cannot FOLLOW a theme at runtime, which remains true, but a copy can be compared to its original at
build time, which is all a check needs. `src/design/manifest-colour.test.ts` reads the role from the
token layer's one home and fails if either literal, or either value quoted above, has drifted from
it.

## When the system does not have what you need

**A colour:** it does. Re-read `design/tokens/palettes.css` — there are 29 roles.

**A structural value** — a column width, a chart height, a grid track: name it as a role in
`src/design/console.css`, in the `:root` block at the top, with a comment saying what it is and why
that number. A number written twice is a number that drifts. Do not put it in the shared layer: that
layer is shared with two directions this application does not ship.

**A primitive several screens will want:** add it to `src/design/console.css` and add a row to the
tables above, so the next author finds it instead of writing their own. A primitive only your screen
uses belongs to your screen.

**Where the primitives live:** all of them are under `src/design/`, beside `console.css`, whatever
they are made of — a class, a React component, or the arithmetic behind one. Keeping the whole visual
system under one roof is what makes the tables above findable: a system split between two directories
is a system whose second half gets reinvented by whoever did not know it was there.

## Before you call it done

Run these. They are the same ones the reviewer re-runs in a fresh shell.

```
node design/contrast.mjs        # from C:/Projects/Fit — exit 0, 390 of 390 gated pairs
npm run typecheck               # from app/
npm test                        # the core gate
npm run test:shell
```

Then grep your own work:

```
grep -rn -E "#[0-9a-fA-F]{3,8}" src --include="*.tsx" --include="*.css"
grep -rn -E "[^-a-z(][0-9]+(px|ms|rem)" src --include="*.tsx" --include="*.css"
```

Both should be empty for anything you wrote. Two known exceptions exist and neither is a licence:
`public/manifest.webmanifest` is JSON that cannot hold a custom property, and
`src/design/browser-chrome.test.ts` asserts on colour strings as test data.

And then look at it, in a real browser, at a phone width and a laptop width, in **both** themes. A
green gate is not a substitute for looking: every measured check on one direction passed while its
status indicator sat a thousand pixels below the fold, and another passed while a two-word phrase
broke across lines in the middle of a value. The gates find what they were told to find. Your eyes
find the rest.
