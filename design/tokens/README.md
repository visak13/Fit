# The token layer

Four files, one job: give every visual decision in the application a **name** instead of a
value, so that a visual direction can be changed by rebinding names on the root element
rather than by editing screens.

| file | what it is | edit it? |
|---|---|---|
| `palettes.mjs` | The colour roles and the three palettes that bind them. The single source of truth for every colour. | Yes — this is where a colour changes. |
| `render-css.mjs` | Turns `palettes.mjs` into the stylesheet. | Rarely. |
| `palettes.css` | **Generated.** Every palette, both themes. | No. It is overwritten, and `contrast.mjs` fails if it has been hand-edited. |
| `base.css` | Type, spacing, density, radius, border, elevation, motion. Hand-authored. | Yes. |

## Using it

```html
<link rel="stylesheet" href="tokens/base.css">
<link rel="stylesheet" href="tokens/palettes.css">
```

```html
<html>                                                        <!-- house default, light -->
<html data-theme="dark">                                      <!-- house default, dark -->
<html data-palette="slate-blue" data-density="compact">       <!-- another direction -->
<html data-palette="ink-neutral" data-theme="dark" data-density="roomy">
```

Then, everywhere: `color: var(--text-primary)`, `background: var(--surface-card)`,
`padding: var(--card-padding)`, `box-shadow: var(--focus-indicator)`.

Never a literal hex, a literal px size or a literal duration in a screen. A hex outside
this directory is a defect, and it is grep-able, which is the point.

## Changing a colour

```
node design/build-tokens.mjs     # regenerate palettes.css from palettes.mjs
node design/contrast.mjs         # measure every pair; non-zero exit if anything is short
```

Both, in that order, every time. `contrast.mjs` re-renders the stylesheet in memory and
compares it to the committed one, so skipping the build is caught rather than shipped.

**If a colour you want cannot pass, change the colour.** Do not adjust a threshold, do not
move a pair into the reported-without-a-gate list, and do not decide the pair is unlikely
to be rendered. The exit code of `contrast.mjs` is a gate a reviewer re-runs in a fresh
shell, and it only means something because nothing in it is negotiable.

## Two things in here that were found by measuring, not by looking

**The focus indicator is two bands, and it had to be.** The first run of the harness failed
thirty pairs and thirty of them were one fact: no single colour clears 3:1 against both a
pale page and a mid-tone filled button. `--focus-ring` handles surfaces, and
`--focus-ring-contrast` handles fills and is visible against `--focus-ring` itself. Use
`var(--focus-indicator)`, which composes both. A single-colour outline looks correct on
every screen where you would test it, and disappears on the primary action button.

**There are two border tokens per theme and they are not interchangeable.** `--line-divider`
is decorative and is not measured; `--line-control` is the edge of something you can
interact with and clears 3:1 against every surface it sits on, including the inside of a
disabled control and the tint of a selected row. Sharing one mid-grey between them either
makes dividers shout or makes inputs invisible.

## What is measured, and what is only reported

`contrast.mjs` gates the pairs where the standard imposes a threshold: reading text at
4.5:1, and anything whose boundary carries meaning at 3:1. It also prints, without gating,
the handful of pairs the standard exempts entirely — decorative dividers, the body of an
inactive control, and the tonal lift of one surface off another. Those are printed because
a card that lifts 1.01:1 off the page is a design problem even where it is not an
accessibility failure, and because a pair that is shown cannot later be said to have been
overlooked. Nothing that carries meaning on its own is in that category.

Disabled text is the one place this layer is deliberately **stricter** than WCAG, which
exempts it: it is held to 3:1 anyway, because a coach who cannot tell an unavailable
control from an absent one is a coach who has lost the control.
