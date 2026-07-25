# Direction three — Roster

One of three competing visual directions for the coaching application, built to be sat in
front of and chosen between. The three only mean anything as a comparable **set**, so this one
was built to the specification in `design/DIRECTIONS.md` rather than to the taste of whoever
typed it. Where I disagreed with the specification I said so upward and built it as written.

## What Roster is

**The structural axis is navigation shape.** Roster is the only direction where the persistent
surface carries a **list** as well as the destinations. On a laptop it is a permanent
list-and-detail application: pick a client on the left, work on them on the right, never lose
the list. On a phone the same relationship becomes a push — the list is the screen, selecting an
item pushes the detail over it, a labelled control returns.

| | |
|---|---|
| Palette | `ink-neutral` — near-achromatic, one accent (deep teal in light, pale teal in dark) |
| Density | Mixed on purpose: compact in the list pane, roomy in the detail |
| Tonal weight | Middle, and **edge**-defined rather than shadow-defined; `--elevation-1` at most |
| Laptop (≥840px) | 76px destination column, 300px list pane, detail to the right |
| Phone (<600px) | Bottom bar, and the list-and-detail relationship becomes a push |

**The trade-off in one sentence:** Roster is the fastest of the three for moving between
clients and back again and never loses your place in the list, and the price is a permanently
narrower working area on the laptop and one more moving part to learn.

It is **not** the recommended direction — Ledger is. Roster is the right answer if moving
between clients turns out to be the dominant motion of a working day.

## How to open it

```
index.html                                  light, every screen, laptop and phone frames
index.html?theme=dark                       the same, dark
index.html?width=phone                      every frame reduced to the phone width
index.html?only=session-runner              one screen and nothing else
index.html?only=diet-week&theme=dark&width=phone
mark-check.html                             the application mark at the sizes it must survive
```

`?only=` takes any of these section identifiers, which are the same words in all three
directions so a comparison page can address them: `session-runner`, `client-list`,
`client-record`, `diet-week`, `navigation-laptop`, `navigation-phone`, `sync-states`,
`tooltips`, `mark`.

No build step, no framework, no third-party dependency, no network request. The only script is
the theme switch, the width switch and the phone push.

## The one thing this direction is judged on

Roster is the only direction where the two navigation layers are **physically adjacent**, so it
is the only one where they can genuinely collide. A reader must be able to tell at a glance
which column moves them **between** parts of the application and which moves them **within**
one. If those two read as one undifferentiated sidebar, Roster has failed at exactly the point
that makes it worth offering. Four devices keep them apart and none of them is decoration:

1. **Surface role.** The destination column sits on `--surface-page`; the list pane sits on
   `--surface-card`, one step off it; the detail returns to the floor. The list pane is the only
   pale object in the frame, so it reads as a thing rather than as furniture.
2. **A measured rule.** Both edges of the list pane are `--border-strong` in `--line-control` —
   the interactive border that clears 3:1 against every surface it sits on, never the decorative
   `--line-divider`. A boundary that carries meaning is never drawn with the token nobody
   measured.
3. **A word.** The column is headed *Go to*; the pane is headed with the destination's own name.
   Tint and shape answer the question quickly; two words answer it certainly, and they survive
   greyscale, sunlight and a compressed video call.
4. **The direction of the selection marker.** A selected destination carries its accent bar on
   its **leading** edge — where you came in. A selected list item carries its accent bar on its
   **trailing** edge — pointing into the detail it just filled. The same idea the application
   mark is built from.

## Nothing in the shared layer was edited

Two sibling directions were being built from `design/tokens` and `design/icons` at the same
time, and an edit there would have silently repainted both. Roster needed no new role: the
`ink-neutral` palette already carries every colour it uses, `--border-strong` already exists as
a width, and `--line-control` is already the correct token for a boundary that means something.
Measured: every file under `design/tokens`, `design/icons`, `design/contrast.mjs` and
`design/DIRECTIONS.md` has a modification time earlier than this direction's first write.

Nothing was written anywhere under `C:\Projects\Fit\app`. That is the park gate expressed
structurally, and it is checkable by looking at which files changed rather than by trusting
anyone's word.

## The six synchronisation states, and why the sixth is not a sixth rung

The **ladder** is time-based and has five: backed up; waiting; waiting long enough to notice,
from six hours; waiting long enough to act on, from twenty-four, drawn plainly more serious *by
shape* — a filled block rather than an outlined one — rather than by a deeper tint; and
**working without a connection**.

That last one is **normal operation and is not drawn as a fault.** The application is
offline-first: this device holds the primary copy and the Drive is the backup. Training a client
in a basement gym is an ordinary Tuesday, and an indicator that cries wolf there is one he stops
reading.

Separately from the ladder there is **refused**. It is a difference of *kind*, not of degree: a
delay resolves itself when a network or a credential returns, and a rejection resolves itself
never and needs a person to act. Folded into the ladder it would sit at the floor forever and
read as perfectly healthy — a count of what is waiting reads as calm precisely *because* the
broken thing has left the queue. So it gets its own path, its own permanent visibility, and it
names what was refused.

All six are distinguished by **silhouette** as well as by colour, and each carries a word. The
`#sync-states` section shows each silhouette in the page's own ink at the rendered size and
small, which is what a colour-blind reader, a phone in sunlight, a greyscale screenshot and a
compressed video call are left with. Roster is near-achromatic, which makes it the direction
where a state carried by colour alone would disappear first.

## The content is real

Every exercise, set, repetition, rest interval, coaching cue, routine and intensity pattern
comes from the shipped seed under `app/core/seed/content`. The session runner shows *Pull
Deadlift Back and Biceps*, day three of the shipped week, at exercise three of nine.

The clients, their loads and their readings are invented, because the seed supplies no clients —
and the loads are invented as **recorded observations**, never as a suggestion. The shipped
library deliberately carries no weight values at all: prescribing a load is a training judgement
that belongs to the coach, so the current-exercise card shows sets, repetitions and rest and
never a weight, and the load field sits beside *last time on this exercise: 45 kg* with the
sentence *the app never suggests a load*.

The intensity control shows *Build And Hold* applied to a nine-exercise routine that holds only
two high-intensity exercises, so it **degrades honestly** and names which level ran short rather
than silently substituting a different intensity or shortening the session.

## What was verified, how, and what could not be

The four mechanical acceptance criteria all pass, including `node design/contrast.mjs` from
`C:\Projects\Fit`, which exits zero: 444 pairs evaluated, 390 gated, 390 passing.

Beyond those, this direction was **observed in a real browser** at 1440px and at 390px in both
themes, and fourteen invariants were measured from the rendered result rather than read off the
source. The Playwright MCP browser was held for the whole run by a sibling worker — three
direction builders were dispatched onto one shared browser profile — so the observation was done
through an isolated Chromium driven directly from `playwright-core`. Same engine, same rendered
result, separate profile.

**The gate found real defects, which is the only reason to trust it.** It went red first:
bottom-bar labels rendering at 14px from a token that is reserved for timestamps and forbidden
as a control label; a help trigger at 26px, which passes the 24px standard and fails this
application's 44px session floor; two inputs with no accessible name because a button had been
nested inside their `<label>`; muted text on the filled danger fill, a pair that exists in no
token file so the contrast harness could not have seen it; and a list row whose name and meta
line shared one line because both were inline spans.

Then **every guard was poisoned and watched.** Nine detections across eight deliberate breaks —
and one guard **could not go red**: the diet-week check read the element's own `display` while an
ancestor decided the outcome, so it read perfectly and tested nothing. Rewritten to
`checkVisibility()`, re-poisoned, seen red. The emoji sweep was likewise proven against a
poisoned string before its clean result was believed.

**Five things only looking caught, which no measurement minded:** the synchronisation indicator
wrapping to six lines in a 76px column; a jump-list row breaking a three-word exercise name over
three lines; a value splitting from its unit; the weight-bearing screens hiding most of
themselves below the fold in a screenshot; and a tooltip held open covering a different
demonstration. And the application **mark** read as a plus sign at every size below 120px — it
passed every check and was wrong, so it went back to the asset bridge with the render attached
and was rebuilt to carry the division as a tonal step, which now survives 16px and greyscale.

**The one claim left open, honestly:** whether the near-achromatic destination column reads as
*grey furniture* to a human eye at real size on a real display. Measurement says the surfaces are
separated and the glyphs render at 2.25px against the family's 2px. It cannot say the column
feels alive. That is a judgement for a human looking at it, and it is the first thing worth
examining in Roster.
