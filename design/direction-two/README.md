# Direction two — Console

Open `index.html`. Everything is in that one file.

```
design/direction-two/
  index.html    every screen, with the stable ids a comparison page can address
  console.css   the direction: which roles it binds, and the structure
  console.js    the sheet's switches, and nothing else
  mark.svg      the candidate application mark
  assets/       what the asset bridge wrote, and its run log
```

## What Console is

**The structural axis is DENSITY.** Console fits noticeably more on a screen than Ledger does
without shrinking a single word, and it says which surface you are working on with
**elevation** rather than with dividers. It reads as an instrument.

- Palette `slate-blue`: cool light, deep blue-charcoal dark, a deep blue accent in light and a
  pale sky in dark.
- Density `compact`: forty-pixel rows, no gap between them, sixteen-pixel gutters. Controls
  stay at forty-four pixels in every density, because target size is not part of what density
  trades away.
- Tonal weight the highest of the three: cards lift off the page, the sticky header lifts off
  the cards, anything overlaying a live session lifts off everything.
- Navigation on a laptop is a seventy-six pixel icon rail that expands to two hundred and
  forty-eight on hover **or keyboard focus**, holding open while focus is inside it. On a phone
  it is the same bottom bar as the other two directions: the rail is a laptop affordance and
  the phone inherits nothing that depends on where a pointer is.

**The trade-off in one sentence.** Console shows the most in one glance and suits the dense
screens best, and the price is that it feels more like an instrument panel than a notebook,
which is more to take in at the start of a long session.

## Opening it in a particular state

Theme and width are readable from the query string, so another document can open this one
already switched rather than having to press a control here:

```
index.html?theme=dark
index.html?width=phone
index.html?theme=dark&width=laptop&frames=unrolled
```

`theme` is `light` or `dark`; `width` is `both`, `laptop` or `phone`; `frames` is Console's own
and is `device` (each frame scrolls inside its own height, which is how the sticky header and
the always-visible status bar can be seen doing their job) or `unrolled` (the height comes off
and a whole screen can be read in one go).

Every screen carries a stable id: `session-runner`, `client-list`, `client-record`,
`diet-week`, `navigation-laptop`, `navigation-phone`, `sync-states`, `tooltips`, `mark`.

## How the look is expressed, and what was deliberately not touched

The direction is `data-palette="slate-blue" data-density="compact"` on the root element plus
the structure in `index.html`. `console.css` either consumes a shared token or names a new
**structural role** of its own — the rail's two widths, the elevation each surface class
carries, the optical weight of a glyph at rail size.

**No literal colour appears in any file here**, which is grep-able and was checked. The one
exception is `mark.svg`, where the palette's four values are the artwork.

The shared token layer under `design/tokens` and the shared glyph family under `design/icons`
were **read and never written**. Three directions were built against that layer at the same
time, so a value rebound here to suit Console would have silently repainted the other two, and
neither of them had any reason to look. Console needed no role the layer did not already have.

## Two things measured rather than chosen

**The glyph optical weight.** The shared family is drawn on a twenty-four pixel canvas at a
two-pixel stroke. Console draws it slightly tighter inside that canvas so it still reads at
rail size — and because scaling the geometry scales the stroke with it, the authored stroke is
reduced by the same factor so the rendered stroke lands back on two pixels. The glyph is
bigger; the line is not heavier.

**The collapsed status chip stacks.** The widest silhouette in the set is forty-four pixels,
the pending count needs twenty beside it, and a seventy-six pixel rail has sixty inside its
padding. Side by side they do not fit, and both ways of making them fit are defeats: shrinking
the shape destroys the one property that has to survive greyscale, and dropping the number
turns the accountability signal into decoration. Stacked, both keep full size.

## The synchronisation surface: six states, and why the sixth is not a sixth rung

The ladder is about **time** and has five rungs — saved, waiting, waiting long enough to
notice from six hours, waiting long enough to act on from a day, and working from the copy on
this device with no connection. **Refused** sits outside the ladder because it differs in
kind: a delay resolves itself when a connection or a sign-in returns, and a rejection resolves
itself never, so folding it into the ladder would park a permanently lost change at the bottom
step reading perfectly healthy.

Each state is a different **outline** before it is a different fill — rounded square, wide
pill, upright rectangle, hard-cornered square, wide dashed bar, hollow hard square — because
colour is lost to a colour-blind reader, to sunlight on a phone, to a greyscale screenshot and
to video-call compression, which is how this application will actually be introduced. The
sheet shows all six with the colour taken away, for exactly that reason. Working without a
connection is drawn as the calmest badge in the set, not as a fault: local is the primary copy
and the remote is the backup, so a basement gym on a Tuesday is the application working.

## The content is real

The routine is `Pull Deadlift Back and Biceps` as the application ships it, with its nine
exercises' own prescriptions, rest intervals, coaching cues and intensity levels, read from
`app/core/seed/content`, and the shipped intensity patterns. The session runner shows that
routine **reshaped by the Low Medium High Low pattern**, which reorders as well as rescales, so
the positions in the list are not the order the routine declares.

The reshaped session also demonstrates the adapter degrading honestly. Stretched across nine
positions that curve asks for five easy exercises and this routine holds four, so position
nine is filled with Barbell Biceps Curl at its easy setting and **marked in the list**, with a
note naming which level ran short. Nothing was dropped and the session is not shorter than
was asked for.

Only the client names and their readings are invented. They are plainly fictional first names
with no contact detail of any kind, because a client record in this application holds a name,
general notes and an optional non-clinical adaptation flag — and the clinical detail lives
outside the application entirely, behind a pointer whose own label is protected.

## One place the specification collides with itself

Reported upward rather than resolved here, because it is not a builder's call.

`DIRECTIONS.md` specifies Console's rail as seventy-six pixels with **icon above a
micro-label**. The token layer states that fourteen-pixel `--type-meta` is for timestamps,
units and record identifiers only, and is **never a control label**. Both cannot hold at once:
"Calendar" measures fifty-six pixels at fourteen and sixty-four at sixteen, and a seventy-six
pixel rail has sixty inside its padding. Sixteen does not fit.

Console is built as specified — the micro-label is there, at fourteen — and the collision is
narrowed as far as it can be without changing the direction: the micro-label is marked
decorative, and the accessible name every assistive technology reads comes from the full
sixteen-pixel label that is present whether the rail is collapsed or expanded. Everything else
in this direction that had drifted to fourteen pixels was raised to sixteen: chips, row values,
prescriptions, field labels, buttons, table headers and the pending count. Density here is
bought from row height and spacing only, which is what Console claims.

## Verified, and how

- `node design/contrast.mjs` from `C:\Projects\Fit` — exit zero, 444 pairs evaluated, 390
  gated, 390 pass. The gate was also **proven able to fail**: on a throwaway copy of the token
  layer, one slate-blue value was moved to a failing colour and the harness exited non-zero and
  named five pairs. The shared files were never touched to do it.
- Observed in a real browser at 1440 and at 390, in both themes: the rail expands on keyboard
  focus and collapses on blur, the focus indicator is the two-band token, all one hundred and
  seventy-two interactive elements have an accessible name, no visible text is clipped
  anywhere, nothing clips at double text size, and the document does not scroll sideways at
  phone width.
- The mark was rendered at 16, 24, 32, 60, 120 and 180 pixels, under a rounded-square and a
  circular mask, on both backgrounds, before it was accepted.

Nothing under `C:\Projects\Fit\app` was written.
