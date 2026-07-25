# Direction one - Ledger

One of three visual directions. Open `index.html` in a browser; nothing needs to be built,
installed or served.

**Ledger's structural axis is tonal weight: it is flat.** No elevation is drawn anywhere,
including on the header that stays put while you scroll and inside a tooltip. Structure
comes from a rule, a gap, and the single step from the page floor up onto a card. It reads
as a good paper form.

**The trade-off in one sentence.** Ledger is the calmest and the least tiring to look at for
hours, and the price is that on a dense screen it separates things a little less sharply
than the other two.

| | |
|---|---|
| Palette | `house-sepia` - warm paper light, pure black dark, burnt sienna accent |
| Density | `comfortable` - 48px rows, 24px gutters |
| Laptop | A permanently expanded 248px sidebar, never collapsible |
| Phone | A 56px bottom bar, the same five destinations in the same order |
| Contextual layer | A breadcrumb and a way back that says where it goes |
| Glyph weight | 2px stroke on the shared 24x24 canvas, the lightest of the three |

## The files

| file | what it is |
|---|---|
| `index.html` | The entry point. Every screen is in here. |
| `direction.css` | **The direction itself**, expressed only as role bindings. No layout, no component, no colour value. |
| `ledger.css` | The application drawn in Ledger's shape. Every value is a `var(--token)`. |
| `sheet.css` | The furniture *around* the direction - headings, prose, device frames, the two switches. Not part of the application. |
| `demo.js` | Theme, width, the diet day picker and the address-bar parameters. It runs no session and persists nothing. |
| `mark.svg` | The candidate application mark. |

Nothing here writes to `app/`, imports from `app/src`, or needs a build step, a framework or
a third-party dependency.

## Addressing it from another page

The screens carry stable identifiers so a later comparison page can put the same screen from
all three directions beside each other:

```
session-runner   client-list   client-record   diet-week
navigation-laptop   navigation-phone   sync-states   tooltips   mark
```

Theme, width and a single-screen view are all settable from the address bar, so nothing has
to reach in and click a switch:

```
index.html?theme=dark
index.html?width=phone
index.html?only=session-runner&theme=dark
```

`?only=` hides every other section rather than removing it, so the surviving section renders
exactly as it does in the full sheet.

## Two things worth knowing before reviewing it

**The phone frames are clones of the laptop frames, and that is the point.** The layout rules
key off the width of the `.app` element rather than the width of the window, so the narrow
rendering is the genuine layout and not a picture of one. The requirement is the same
information architecture at a narrower width and never a second, different design - so the
two frames are literally the same markup. If they ever disagree it will be because the CSS
disagrees, which is a defect worth seeing; two hand-written copies would have let them drift
apart quietly instead.

**There is no colour value in this direction except two, in `mark.svg`, and the reason is
written beside them.** An installable icon is a standalone file that an operating system
renders on a home screen with no stylesheet loaded, so it cannot read `var(--fill-accent)`
the way every screen here does. The two values are house-sepia's `fill-accent` and
`text-on-accent` copied verbatim - a pair the contrast harness already measures against each
other - rather than anything invented. If the palette changes, that file changes with it.

## The content is real

The routine is `pull-deadlift-back-and-biceps` from `app/core/seed/content/routines.js`, and
its nine exercises, their prescriptions, rest intervals, intensity levels and coaching cues
are the shipped seed content unchanged. The intensity patterns are the shipped patterns. The
reading kinds and their units are the ones the record model pins.

The client names, the diet plan and the readings are invented, because the seed supplies
none of them. They are invented to resemble nobody, and no email address, phone number,
address, date of birth or photograph appears anywhere - the client record refuses to collect
them, so a demonstration that showed them would be showing something the application cannot
do.

## The contrast bar

Ledger uses `house-sepia`, which is already in the shared token layer and already measured.
Run the harness from `C:\Projects\Fit`:

```
node design/contrast.mjs
```

It parses the shipped token files rather than carrying its own copy of the colours, so the
report is evidence about what actually ships. This direction adds no colour to that layer
and rebinds no existing role's value, so it neither widens nor narrows what the harness
measures.
