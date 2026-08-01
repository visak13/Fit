# The application shell

What this directory is, for whoever maintains it — which may be the operator rather than anyone
who built it. Everything here is deliberately ordinary.

## The two halves, and the line between them

| | `core/` | `src/` |
|---|---|---|
| What | the record model, and the logic the data depends on | the screens |
| Language | plain ECMAScript, types in documentation comments | TypeScript + React |
| Build | **none** | Vite |
| Tests | `npm test` — runs with no build at all | `npm run test:shell` |

**The shell consumes the core unchanged and never converts it.** That is not a stylistic
preference: it means the most safety-critical logic in the application can be verified with
nothing but Node installed, and it means the core survives if the framework is ever replaced.
`tsconfig.json` deliberately does not type-check the core, because type-checking it here would
create pressure to edit it.

## Commands

```
npm install          # once
npm run dev          # develop, with no service worker (see below)
npm run build        # bundle, then stamp and generate the service worker
npm test             # the core gate — needs no build
npm run test:shell   # the interface: design, platform, screens, navigation
npm run test:tools   # the build tooling, including that the stale-build marker moves
npm run typecheck    # tsc, no emit
npm run check:stale  # is dist/ older than the source?
npm run icons        # re-derive the installable icons from public/icons/mark.svg
npm run glyphs       # re-derive the glyph module from design/icons
```

## All three test gates DISCOVER their members, and hold a floor

None of the three reads a list of directories. They walk the tree, find what has tests, and run it —
because a hand-maintained list silently loses entries, and one of them did.

Discovery has the same failure wearing the opposite mask, and it is the one to understand before
trusting a green tick: **a glob that matches nothing exits ZERO.** A renamed directory or a moved
suite produces a clean run of nothing and a passing gate.

So each gate records, per directory, the number of tests that directory has been **measured**
running — `tools/core-coverage.json`, `shell-coverage.json`, `tools-coverage.json` — and fails when a
count DROPS, when a recorded directory is no longer discovered, when a directory runs zero, or when
nothing at all was discovered. A number that falls is a failure even when every test passes. The
mechanism is one file, `tools/test-gate.mjs`, shared by all three; `tools/test-gate.test.mjs` proves
it really does fail in each of those cases, because a protection nobody has seen fail is a protection
nobody should trust.

**Reading the output: the COUNT is the evidence, never the exit code alone.** An absence is invisible
to anything that checks only whether a command succeeded.

When you legitimately add tests, the floors rise with:

```
node tools/run-core-tests.mjs --update-floors
node tools/run-suite-tests.mjs shell --update-floors
node tools/run-suite-tests.mjs tools --update-floors
```

Run it on a green tree, alone, and read the diff. Never wire it into a build step and never run it
from two places at once — that recreates exactly the concurrent read-modify-write that lost a
directory in the first place, on the file whose whole job is to notice.

`test:shell` also loads `.tsx`, through `tools/tsx-test-hook.mjs`. Node erases types but cannot
transform JSX, so without it no test could import a component — which is why the checks here were
historically written against source TEXT. They can now render the real thing; see *No dead ends*
below.

## The built output is NOT committed, and the stale-build failure mode moved rather than vanished

`dist/` is ignored. The site is built by GitHub Actions from source and CI serves its own output,
so a tracked bundle was never what anyone downloaded — see `DEPLOYMENT.md`, Path A.

The failure mode that motivated the stamp below is still real, it just lives somewhere else now.
It used to be: somebody edits source, commits a stale `dist/`, publishes, and the live site
silently serves the **previous** build. On the CI path that cannot happen, because CI rebuilds.
What CAN happen is the mirror image — **somebody fixes the bundle on disk instead of the source,
proves it locally, and publishes nothing**, because CI never reads that file. Nothing errors
there either.

So every build stamps `dist/build-info.json` with a hash of the source it was built from, and
`npm run check:stale` recomputes that hash from the working tree and compares. `FRESH` means the
artefact matches its source; `STALE` and a non-zero exit mean it does not. **It is now a statement
about the `dist/` on your own disk, not about what is served** — CI runs it too, immediately after
its own build, where it is green by construction. A red locally means you changed source and have
not rebuilt; it clears on the next `npm run build`. The stamp is also shown on the admin screen,
so the build actually running on a device can be identified over a video call — and on the CI path
that screen is the ONLY witness to which build reached the device, because there is no committed
artefact left to compare it against.

`tools/source-stamp.mjs` says what is hashed and why the list is wider than it looks. It is
importable on its own so the publish step can recompute the stamp without running the build.

## Offline, and the second failure mode

`dist/sw.js` is generated by the build because its precache list has to name the real
content-hashed filenames. It downloads every file this build emitted and serves them from a cache
named after the build, which is what lets the application open with no network.

The nastier failure here is a worker that serves the old build forever, on a phone that is never
reloaded. Three things prevent it and all three are needed: the cache name contains the build
stamp so builds cannot mix; the new worker takes over immediately instead of waiting for tabs to
close; and every cache in this application's own namespace that is not this build's is deleted on
activation. The generated file explains this again at the point where someone would be tempted to
change it — including why the sweep stops at a prefix we own instead of deleting everything that
is not ours: cache storage is per-ORIGIN, and this site shares its origin with every other project
published under the same hosting account.

The worker is **not** registered by `npm run dev`, on purpose — during development it would serve
a stale bundle back at you, which is the same failure arriving much sooner.

## Routing is by URL fragment

`#/clients`, not `/clients`. The site is a project page under a sub-path: a deep link refreshed
under history routing asks the host for a file it does not have and gets a not-found page. A
fragment is never sent to the host, so every address survives a refresh and a cold start from the
home screen.

## No dead ends, and it is checked rather than believed

The standing requirement is that a coach is never stuck. `src/shell/no-dead-ends.test.ts` holds it as
a property of the **graph**: every destination resolves to a screen that renders, the index address
lands somewhere real, an unknown fragment reaches the not-found screen, and every screen — that one
included — offers a labelled way onward that is not the browser back button. On an installed
application there is frequently no visible back button at all, which is what makes that last one a
requirement rather than a nicety.

Nothing in it is typed by hand. The addresses come from `DESTINATIONS`, the routes from
`ROUTE_TABLE`, and the matching is react-router's own — so a destination added in a later step is
covered without anyone remembering, and the suite fails if a route is ever added that it does not
exercise. It renders the screens; it cannot see them. Whether an element is visible or touchable is
`console.css`'s business and no rendered check has ever been able to answer it.

**`routes.tsx` exports the table and the router SEPARATELY, and re-inlining them would break this
quietly.** `createHashRouter` reads `window.history` the moment it is called, so a module that built
the router at import time could only be imported by a browser — and the check would have to fall back
to a hand-written list of paths, which passes forever while the real table drifts away from it. The
split is what keeps there being one table that is also inspectable. `main.tsx` makes the router.

The first thing this check found was a shipped dead end: the not-found screen's way back was a
RELATIVE link, so from `#/typo` it resolved to `#/typo/calendar` — unmatched too, one level deeper on
every press. The label was right, the destination was right, and only the resolution was wrong, which
is why looking at it had never caught it. **A screen reachable at an address the route table does not
own must write its targets absolutely.**

## One place names the published path

`base` in `vite.config.ts` is the only place the sub-path the site is published under is written
down. Everything else derives from it: the page's own links are relative, the manifest's
`start_url`, `scope` and icons are relative to the manifest's own URL, the service worker's base
is recovered from the built page, and the registration uses `import.meta.env.BASE_URL`.

That is deliberate. A path repeated in four files is a path that can silently disagree with
itself, and the symptom is a page that loads perfectly in development and is blank in production.
JSON has no comments, so this note lives here rather than in `public/manifest.webmanifest`.

## Persistent storage: the answer is recorded, not assumed

The application asks the browser to persist its storage and writes down exactly what came back,
including the type of the value, including a refusal, and including a failure. The admin screen
shows the literal answer beside the plain-words one.

**A grant is not immunity.** It stops the browser evicting data on its own. It does not survive
removing the installed icon from the home screen, and it does not survive clearing site data.
Nothing in this application may say otherwise; `PERSISTENCE_IS_NOT_IMMUNITY` is one constant so
there is one sentence to read and no room for a kinder rewording to appear on one screen.

## The visual system, and where it comes from

This directory is no longer unstyled. The interface is **Console**: cool slate-blue, compact rows,
elevation carrying hierarchy — chosen by the user from three built directions, on the grounds that it
looks like a companion rather than a business. When a choice here is ambiguous, that is the sentence
to resolve it toward.

It is bound on the root element as `data-palette="slate-blue" data-density="compact"`, with
`data-theme` following the device's own preference until someone overrides it.

**The token layer lives OUTSIDE this application, at `design/tokens/`, and is CONSUMED from there —
never copied in.** `src/design/design-system.ts` is the one import that pulls it in, and it explains
the choice at length because the alternative is so tempting: copying `base.css` and `palettes.css`
into `src/` removes an unusual import and a line of bundler configuration, and costs the only
property that makes the contrast harness worth running. That harness measures the ORIGINALS. A copy
drifts, and while it drifts every signal stays green and the interface is painted from colours nobody
is checking.

Console's own structural roles — the things the shared layer has no opinion about — are in
`src/design/console.css`, in the `:root` block at the top, each with a comment saying what it is and
why that number.

**`app/DESIGN.md` is the contract for mounting a screen**: which role is page, card, raised and
selected; the heading hierarchy; how a dense screen stays legible; the never-do list. Read it before
writing a screen, and give anything reusable you introduce a row in its tables, so the next author
finds it instead of writing a second one.

## Two navigation surfaces, one breakpoint at 840

At or above 840px the global navigation is the **wide** surface: a 76px icon rail that expands to
248px on hover or keyboard focus and holds open while focus is inside it. Below it, at every width,
it is the **narrow** surface: a bottom bar of five items. There is no third treatment.

**They are called narrow and wide rather than phone and laptop deliberately.** The 600–840 band is
exactly where you cannot know whether a pointer exists — it is a tablet, or it is a laptop window
that is not maximised, and nothing in the markup can tell you which. Naming the surfaces after
devices is what hid that gap; the thing actually being branched on is available width and pointer
certainty. So that band takes the surface that does not depend on a pointer existing. The consequence,
stated so nobody reports it as a bug: a coach working in a half-width laptop window gets the bottom
bar, not the rail. That is the correct trade.

Both surfaces are built by mapping the one destination list in `src/shell/navigation.ts`. A second
copy in the markup is how a route ends up reachable by URL and invisible in the interface.

## The synchronisation indicator is a SIBLING of the frame, not a part of a screen

`.frame-status` is a direct child of `.app` — a sibling of the rail, the bar and the content — and
the grid places that one element at the foot of the rail on the wide surface and immediately above
the bar on the narrow one.

**This is the constraint most likely to be broken by a well-meant refactor, and it has already
shipped wrong twice with every check green.** The indicator must never be moved inside the rail,
inside `.content`, inside the sticky header, or inside a screen: every one of those can scroll,
collapse or hide, and every one of them passes a computed check while doing it. Only `.content`
scrolls, which is what makes "permanently visible" true of the other three rather than merely
intended.

Two elements would be worse than one in the wrong place: two live regions announcing the same state,
with a rule that only one of them counts that nothing could check. `src/shell/frame-structure.test.ts`
holds this.

## The interface does not open the store: every screen consumes a SEAM, and there are three

The core is plain dependency-free modules with a test gate that needs no toolchain, and the shell
mounts on top of it. A screen reaching into the local store would put the most safety-critical logic
in the application behind a build step, so no screen does. Instead `main.tsx` fills in a required
provider and screens read it:

| seam | what it carries | filled with today |
|---|---|---|
| `PlatformStatusProvider` | this device's build, persistence answer, offline start | the real, measured answers |
| `SyncStatusProvider` | the accountability reading from `core/status` | `NO_BACKUP_YET` |
| `DivergenceProvider` | clashes the core surfaced and could not resolve, and the way to answer one | `NOTHING_TO_DECIDE` |

**Two later screens will copy the third, so copy its SHAPE rather than only its mechanics** — the
whole of it is stated in `src/shell/Divergences.tsx`:

- The reading is a plain value, never a hook that fetches. A screen cannot start work of its own.
- Its fields are the core's own, field for field and name for name. `pending` holds the objects
  `describeDivergence` returned, unconverted. A screen reading a renamed copy drifts from the thing
  it is showing.
- **The way to ACT is nullable, and null means no control is drawn at all.** A button that cannot do
  what its words say is worse than no button — the same argument `core/status/reasons.js` makes about
  offering an action that does not help, and the reason the synchronisation indicator is a status
  region rather than a tap today.
- The provider is REQUIRED and the hook throws outside it. A default would be the layer inventing a
  state, and the state it would invent — "nothing to decide" — is the one that looks like good news
  while a clash sits unanswered.

**The screen COLLECTS; the core APPLIES and RECORDS.** `core/sync/resolution.js` writes the chosen
side at a strictly higher revision and is the one call site of `sync.conflict_resolved`. Nothing under
`src` may write a journal entry: `core/journal/unwritten-kinds.test.js` asserts that every kind is
either wired to a named owning file or unwritten with a stated reason, and **its scan walks `core/`
alone** — a call site here would leave that suite green while the partition it asserts had quietly
become false. `src/screens/divergence-picker.test.ts` scans `src` for exactly that, and proves the
scan can find the known call site before believing its silence.

## Not every route is a destination, and reachability is therefore CHECKED

`#/decisions` — the divergence picker — is the first route the navigation surface does not carry. A
clash between two devices is rare and episodic, and a permanent sixth entry that is empty almost
every visit is an entry the coach learns to stop reading. It is reached from the Admin screen instead,
by a link that is there PERMANENTLY rather than only when it has something to say.

The path is named once, in `src/shell/navigation.ts`, and read by both the route table and the screen
that links to it. `src/shell/no-dead-ends.test.ts` no longer asks whether a route is a destination —
it asks the thing that actually matters: **every route the navigation surface does not carry must be
reached by a LABELLED link that RESOLVES, from a screen that is itself reachable**, proven by
rendering the screens. That is strictly harder to satisfy than membership of a list, and it also
catches a destination linking onward to something that does not exist, which the old form could not
see at all.

## The manifest's two colours are a NAMED exception to the no-literals rule

`public/manifest.webmanifest` carries `theme_color` and `background_color` as literal hex values.
That looks exactly like a violation of the rule that colour comes only from tokens, and the next
reader would be right to want to delete them — so before doing anything, read **“The one place a
token cannot reach: the manifest” in `app/DESIGN.md`**, which is where the exception, the values and
the accepted cost are recorded. JSON has no comments, which is the only reason that note cannot live
beside the values themselves.

Both are `#0B0F14`, a copy of `--surface-page` in the slate-blue dark theme, and the manifest is only
what is shown *before* the application is running — inside it, `src/design/browser-chrome.ts` writes
the live value into the `theme-color` meta tag on every theme change. `src/design/manifest-colour.test.ts`
compares the copies against the token layer, so the two can no longer drift silently.

## What is not here yet

- **Every screen except admin.** The destinations exist, resolve and render; the screens behind them
  are placeholders that state what will live there.
- **The contextual to-and-fro links** between related things — a client to their sessions, a session
  back to the client. The mechanism is built and tested (`src/shell/trail.ts`), and the frame draws
  it; there is nothing yet to link to. The no-dead-ends check covers the routes that exist and will
  cover the ones that do not yet, without being edited.
- **Real synchronisation.** The permanent indicator renders whatever the seam in `main.tsx` gives it,
  and today that is honestly "never synchronised, nothing queued" — there is no local store yet, so
  nothing has ever been backed up because nothing yet can be.
- **A source behind the divergence seam.** The picker at `#/decisions` is built, and its behaviour is
  proven against divergences genuinely induced between two real device stores in its own suite — but
  the running application has no store, so it shows "nothing needs your decision" and offers no
  buttons, which is what is true. The synchronisation step supplies `pending` from each `syncNow`
  pass and `resolve` as a call through to `resolveDivergence`; it changes that one line in `main.tsx`
  and nothing below it.

## Nothing here may carry a credential

The repository is public by a knowing decision. No credential and no OAuth client identifier
belongs anywhere in it — the coach enters his own on the application's setup page at runtime, and
that is what keeps the published source generic.
