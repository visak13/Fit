# What you are being asked to approve, and what we did while you were away

This is the list you are owed before anything is published. It is addressed to you, not
to a reviewer, and it is written in plain language on purpose.

You chose **one complete build**, and you were unreachable for stretches of it. That was a
reasonable choice and it had a cost: decisions were taken in your absence that
**reinterpret what you asked for**. Some of those you would have made the same way. Some
you might not. This document exists so that you meet them *before* the publish rather than
after, and so that you are not asked to have the same conversation twice.

**You can contest any line in this document.** Nothing here is final. Nothing has been
pushed. There is no remote on the real repository and there never has been. If you want an
item reversed, reworded, rebuilt or simply deleted from the plan, say so and it goes back
into the work — that is cheaper right now than it will ever be again.

---

## 1. The pattern, before any of the instances

Almost everything below is one finding wearing many faces. Read the pattern first or the
list will look like twelve unrelated problems instead of one.

> **ABSENCE IS THE ONE CLAIM THIS RECIPE RECORDS WITHOUT VERIFYING.**

A *presence* claim gets checked almost by accident, because using the thing forces you to
touch it. An *absence* claim never does. Nobody opens a directory to confirm it is empty.
Nobody re-runs a scanner to confirm it still finds what it is supposed to find. So "there
is nothing there" is the one sentence in this project that has repeatedly been written
down, made load-bearing, and turned out to be false.

It happened three times before this step, and each time it was found by somebody who
actually read the code rather than the record:

- design patterns recorded as having **no interface reach** — they were on screen;
- a specialist recorded as **uncompiled** — it was serving twenty-eight amendments;
- a curve editor sketched with fields the design **deliberately refuses**.

And then this step found the **mirror**, which is worse:

> **A PRESENCE CLAIM ABOUT A MECHANISM, RECORDED WITHOUT VERIFYING** — and shipped together with the instrument that cannot see it wrong. An absence claim merely fails to check. **This one ACTIVELY INSTRUCTS THE NEXT READER TO MIS-CHECK.**

And there is a **third face**, found while this document was being reviewed and set out in full
in section 11:

> **A DEFAULT VALUE READING AS A MEASUREMENT.** Five of the six outcomes carry `met: false`
> with an empty evidence field — not because anyone measured and failed them, but because
> nobody ever wrote the field at all. **The field is empty, not negative.**

All three have the same root: **a cheap universe answering a question that belongs to an
expensive one.** That is the shape to keep in mind. Everything in sections 2 through 9 is one
of those directions.

---

## 2. The first thing your coach will see, and it is not this app

This is the item you will meet before any other, it was measured rather than reasoned
about, and **it is not fixable from our side.**

> ***ONE FULL DOCUMENT LOAD AFTER THE PUBLISH STILL PAINTS THE SPIKE'S PROBE PAGE.***

Measured locally at one scope, four loads, the browser closed and reopened between each:

| load | title painted | characters | app code loaded |
| --- | --- | --- | --- |
| 1 | **Fit Platform Spike** | 5,455 | **NONE** |
| 2 | Fit | 1,684 | yes |
| 3 | Fit | 1,684 | yes |
| 4 | Fit | 1,684 | yes |

The mechanism: the throwaway spike page you installed months ago left a service worker
registered at that exact address. That old worker **answers the first navigation from its
own cache while the new one installs**. Our bytes do not run at all on that load — they
have not been given a chance to.

**On the coach's phone that is one opening showing a throwaway probe page with no app in
it, with no error anywhere.** No crash, no blank screen, no message. It just looks like
the wrong app, which is exactly what it is.

**What to do: OPEN IT A SECOND TIME.** That is the whole fix, and it works from load 2
onward, permanently.

**Why it cannot be prevented from our side:** the spike's worker is in control of that
first navigation before any of our bytes run. There is no instruction we can put in the
new build that executes earlier than a worker that is already installed. The only
mitigation is telling the person holding the phone, which is why it is here and why it
belongs in the words spoken on the handover call — *"open it, close it, open it again"* as
a step, not as a caveat at the end.

### Its companion: `fit-spike-v1` is never deleted

The old worker's cache survives every load and every reading afterwards.

**As measured**, `app/dist/sw.js:79` deleted only caches matching `fit-shell-` and not equal
to the current one, so a cache from any other naming scheme survived forever. The generator
that writes that line is `app/tools/finish-build.mjs:135`. Directly above it sat this comment:

> "an orphaned cache is exactly how a stale asset survives"

**THE COMMENT DESCRIBES THE CASE THE CODE DOES NOT COVER.** That is the third time in this
step alone that a guard turned out to be narrower than the sentence everyone remembers it
by.

It is **not harmful today** — the fetch handler reads only from the current cache by name,
so nothing stale is actually served. But the surviving cache holds the spike's own
`/Fit/index.html`: **the exact bytes that painted load 1**, outliving the worker that made
them. That is precisely the condition the comment exists to forbid.

**Outcome: REPAIRED before the push, and measured in both directions.** It is deliberately
**not** the obvious fix, and the reason is worth your attention because it is the same defect
class shipped as a cure:

> **DO NOT DELETE EVERY CACHE THAT IS NOT CACHE_NAME. CACHE STORAGE IS PER-ORIGIN, NOT PER-PATH.** The origin is `visak13.github.io`, and GitHub Pages serves every project of that account from that same origin. "Delete every cache that is not mine" would silently **destroy a neighbouring project's cache** from inside our code, on your phone and the coach's, with no error and no way to attribute it. **THAT IS THE EXACT SHAPE OF DEFECT THIS WHOLE STEP HAS BEEN HUNTING, and we would be shipping it as the FIX for one.**

So the repair deletes only caches under a prefix we own (`fit-`, which covers both
`fit-shell-<stamp>` and `fit-spike-v1`), and the reasoning is **in the code comment**
so the next reader does not "simplify" it back to the dangerous form. It was made in the
GENERATOR — `app/tools/finish-build.mjs` — and `app/dist/sw.js` was regenerated from it, so
the next build cannot restore the defect.

Both directions were measured on a real browser against a plain static host, not asserted:
a cache named `fit-spike-v1` was present before activation and **gone afterwards**, and a
cache belonging to a notional neighbouring project **was still there afterwards**.

---

## 3. The one measurement that can only ever be taken once

The cutover was exercised on a device already carrying the spike — but **locally
simulated**. The real-phone leg is **UNMEASURED**, and the reason matters more than the
gap.

It is not "no phone was handy."

Exercising the cutover on a device that already carries the spike requires this build to
be served **at the address the spike currently occupies** — and putting it there **is the
publish**. So the observation cannot be taken before the publish, by anyone, at all.

And after the publish it is measurable **exactly once**: on the **first opening after the
push, on a phone that already carries the spike**. After that first opening, the
spike-carrying state no longer exists anywhere in the world. It cannot be recreated.

**So whoever opens it first must look at the FIRST screen and read the cache list before
anything else.** Not after checking that the app works. Not after a quick tap around. The
instinct to confirm it works is exactly what spends the observation. If that happens, no
one can get the evidence back.

---

## 4. Publishing this repository is not the same act as deploying this app

This is a headline item, not a footnote.

**"Publish what we built" and "create the entire public history of this project in one commit" are the same act here.** There is no remote. Nothing has ever been pushed. The
last commit is `95a4913` (from step s8), and the staged set for the first commit was
measured at:

> **310 paths — 163 additions, 145 modifications, 2 deletions.**

That single commit becomes the repository's entire public history. There is no earlier
state for a reader to compare against, and no private prefix that stays private.

You should decide knowing that. **It is the difference between a deployment and a disclosure of everything every step has written since s8.**

### The rule that follows from your ruling, and it changes where every future fix must be made

You ruled: *"No, I dont want to push something built on my machine to live site. It should go via
ci/cd."* That is what happens, and this is the consequence of it that nobody would guess:

> **ANY FIX TO WHAT THE PUBLIC SITE SERVES MUST BE MADE IN THE SOURCE OR IN THE GENERATOR THAT
> WRITES THE BUILD, BECAUSE CI BUILDS FROM SOURCE AND NEVER READS THE COMMITTED `app/dist`.**

Three parts, each measured rather than assumed:

1. **CI builds from source.** `.github/workflows/pages.yml` checks out the repository, runs
   `npm ci` against the lockfile on an ubuntu runner, runs the five-command gate, runs
   `npm run build`, and uploads what **it** just produced as the Pages artifact.
2. **It never reads the committed `app/dist`.** Nothing in that workflow opens the tracked bundle.
   As of 1 August 2026 the bundle is not even in the repository — both `.gitignore` files ignore
   it, and this is the reason. The proof is a hash: the live page executes
   `index-BGG4vweb.js` while the artefact this repository used to track was `index-BDreLcB9.js`.
   Same source, different machine, different bytes, and it is the CI one that reaches the coach.
3. **So a hand-applied change to `dist` passes everything and delivers nothing.** Edit the built
   bundle on disk and it will run correctly in your browser, survive a local walk, satisfy
   `check:stale` after a rebuild, and read as a real fix to a reviewer looking at a real
   file — and the coach will never receive one byte of it. **Nothing anywhere reports this.** It
   is the quietest failure available in this project, and it is available only to somebody trying
   to be helpful quickly.

**One precision point, because the opposite reading is the natural one.** Untracking `app/dist`
does **not** remove it from this repository's history. Commit `30745d8` is already public and
still carries all eleven files, and anyone can retrieve them from the remote forever. That is
fine — they are a build of public source and carry no secret — and your requirement was about
what the **live site serves**, which was already satisfied and remains satisfied. But *"we
stopped committing the bundle"* must not be read as *"the locally-built bundle is no longer
public."* It is. What changed is what future commits carry, not what past ones did.

---

## 5. The four Sol bridge logs — the spine of this document

This is the sentence the disclosure exists to deliver, and it is deliberately unsoftened:

> **THE FOUR SOL BRIDGE RUN LOGS ARE ALREADY IN HEAD AT 95a4913, SO THEY APPEAR IN NEITHER THE ADDED NOR THE MODIFIED COLUMN AND PUBLISH INVISIBLY TO ANY DIFF-SHAPED REVIEW. READING THEM WAS THE ONLY WAY TO SEE THEM AT ALL.**

Made plain, in the neuron's own words:

> *that is the difference between "we checked the changes" and "we checked what will be public", and the user is about to be asked to approve the second thing while everyone's instinct reports on the first.*

Every review reflex in existence — a diff, a pull-request view, a "what changed since
last time" — would have reported these files as **not part of this change**, which is
true, and would therefore never have shown them to you. They publish the moment the
repository publishes at all.

The files are `design/direction-two/assets/.sol-run.jsonl` (2,363 bytes, 9 lines),
`design/direction-two/assets/.sol-last-message.txt` (64 bytes),
`design/direction-three/assets/.sol-run.jsonl` (7,389 bytes, 15 lines) and
`design/direction-three/assets/.sol-last-message.txt` (112 bytes). All four are under an
`assets/` directory inside those two design directions; an earlier draft of this paragraph named
them one level up, at paths that do not exist, which would have sent you looking for the wrong
thing in a section about files nobody can see by diffing. All four confirmed present in the last
commit and absent from both the added and the modified column.

**All four were read in full, not sampled.** Their complete contents, by category — seven
categories, never "they look fine":

1. **Two Sol/codex thread UUIDs** (`019f9907-…`, `019f9908-…`) — session identifiers, not
   credentials, not linked to any account.
2. **Agent prose about SVG geometry** for the app mark.
3. **Absolute Windows paths — project paths only.** The complete deduplicated set is the
   two `mark.svg` paths, the two `.sol-*` paths, and the system PowerShell executable.
   **No `C:\Users\` path, no home directory, no user name, no machine name.**
4. **Echoed inspection commands** (reading viewBox, width, height, title, fills, a
   directory listing). No environment dump, no clipboard content.
5. **Their output** — 512x512, viewBox `0 0 512 512`, the mark's title, three colour
   values, directory listings.
6. **Token-usage integers** (input / cached / output / reasoning) — billing counters, no
   identity.
7. **One sandbox policy refusal** — a tool-policy rejection line, no payload.

**Both absence scans carried non-vacuity probes that FIRED**: the credential-shape scan was
proven live against planted `client_secret=GOCSPX-…`, `AKIA…` and `ghp_…` values, and the
identity scan was proven live against a planted `C:\Users\` path and a planted email
address. So "nothing found" here is a **result**, not a silence.

**Whether they publish at all is your decision, and nobody has untracked them.** They are
model transcripts, read by nobody, describing how an icon got its geometry. They are
clean. They are also not something anybody deliberately chose to make public, and you are
the only person who gets to make that call.

---

## 6. The pattern's own best example, and it is ours

This one has the neuron's name on it, not only a worker's, and it is here because leaving
it out would make the whole document dishonest.

Inside the action **whose entire subject was verifying things properly**, a worker
inferred **"two nested git repositories"** from the existence of a directory named `.git`
— **without opening it**. The neuron then took that inference and **made it binding on the
push, without opening the box either.**

**Two of us, one unopened directory.** Both were empty.

The neuron's own words when it directed this into the disclosure (message `9bfca80e`):

> **"The list is worth less if it only contains other people's misses."**

For the record: that worker is **not** marked down. It caught a real shape, handed it up
rather than acting on it, and the corresponding check on the publish audit **stays**. When
someone finally opened both directories they were confirmed empty at every depth, then
deleted with a command that *refuses* to delete a non-empty directory — so the exit code
is a second, independent proof of emptiness rather than a restatement of the first. That
is how it should have been done the first time.

**And it happened once more, during the writing of this very document.** The instruction
that produced this file told me to "close with s11's clause table." There is no such
table. It was never recorded, in any step, in any document. The four words it is named by
come from **this** step's own brief — so the instruction attributed to a previous step a
thing this step is being asked to *create*. When asked, the planner read the source itself
rather than answering from memory, and said so plainly:

> "YOUR READING IS CORRECT AND MY INSTRUCTION WAS WRONG. THERE IS NO RECORDED s11 CLAUSE TABLE."

That is a **presence claim about an artefact, recorded without verifying** — the same
finding as the `.git` directories, arriving in the brief for the document about the
finding. Three of us now, on three different unopened boxes. The table in section 11 is
therefore **constructed**, and every row that nothing in the record ever measured is
marked as such.

---

## 7. Instruments that could not see, and the honest limits of what we know

Five separate measuring instruments in this project were found to be blind, and **every
one of them failed toward "nothing found"** while the work's entire output was absence
claims. An instrument that cannot see is indistinguishable from a subject that is clean.

**The calendar link, and why the prescribed check makes it worse.** The record said the
Google calendar settings deep link *"answers 200 signed out and lands on Google's
marketing page."* Measured in three universes, it does not. It answers **302 to
ServiceLogin** with `continue=` preserving the deep path — **identical in shape to every
console link that works perfectly** — and only bails to a marketing page at hop two. The
conclusion in the record was right; the mechanism was wrong; and the wrong half is the
dangerous half. The neuron's superseding decision is recorded under its own headline:

> **SUPERSEDES THE CALENDAR-LINK MECHANISM IN s12's DESCRIPTION — CONCLUSION HOLDS, MECHANISM FALSE, PRESCRIBED METHOD BLIND**

The consequence in plain terms: **the one-hop inspection the record prescribes returns
"well behaved" and invites the next author to delete the one sentence that makes the link
usable** — the sentence telling the coach to sign in before clicking it. That sentence is
shipped, and it must stay.

**A second blind instrument on the same table.** A row in the same link table recorded as
"200, no redirect" answers **302-to-itself-then-200 with a fresh cookie jar**. Neither
reading was wrong; they were readings of different things:

> **A MEASURED STATUS CODE IS A JOINT FACT ABOUT THE LINK AND THE COOKIE CONTAINER.**

**A guard narrower than the sentence people remember it by — and this one had teeth.** The
gate that stops us shipping unsupportable claims **could not recognise the most natural way
a person writes a disclaimer**: a heading naming a platform, a full stop, then the denial —

> `**Android.** Never tested`

Its matching window could not cross a full stop, and "never tested" was not in its
vocabulary. So **an honest disclaimer of that shape turned the gate red**, and **the next
author's cheapest move was to delete the disclosure.** A guard that reds on honesty makes
deleting the honest sentence the path of least resistance, and the next author meets the
red, not the reasoning.

**And this document walked straight into it while being verified — twice.** Staged into a
copy of the index and put through the gate, this file turned it red on two of its own
lines: the illustration above, and a row in the clause table where Android was named inside
a long markdown table row, far enough from its own denial that the matcher's
eighty-character window could not join them. **The two reds are honest disclosures of an
untested platform, which is exactly what the rule is for.**

It was first ruled a **disclosure rather than a fix**, and both lines were reworded to get
past the gate — in the clause table, to naming the platform **by description instead of by
name.** That reversal is why the ruling was overturned:

> **A GUARD THAT EDITS THE TRUTH TO STAY GREEN HAS STOPPED BEING A GUARD.**

The document whose entire job is to say plainly what is true had been shaped by a check
never aimed at it. So **the matcher was widened and the wording was reverted**, in that
order. The rule now recognises a denial across a sentence boundary, recognises bare denials
such as "never tested", and recognises a denial sitting in the SAME MARKDOWN TABLE CELL as
its subject — a cell being where a denial can be beside its subject on screen and hundreds
of characters from it to a sentence splitter. **Nothing was deleted and no exemption was
added**, and the widening is held honest by the three bare-platform-naming fixtures already
in the suite, which are still refused, and by a plant that genuinely claims support, which
still goes red.

**The fact itself is unchanged and is now stated plainly, by name: Android was never
tested, cannot be tested here, and no claim of any kind is made about it.**

**Two method lessons, and the first one is the lesson.**

> **AGREEMENT BETWEEN TWO INSTRUMENTS IS NOT CORROBORATION WHEN BOTH WERE AIMED BY THE SAME HAND.**

A filename sweep and a content-shape sweep agreed exactly on the four Sol logs, which
reads as confirmation. A third sweep was added **because** they agreed — and immediately
found **four directories in nobody's list** that neither of the first two was structurally
capable of seeing. All four were opened and were empty, so they carry nothing; they are
reported anyway, because the reason they are harmless is a measurement and not an
assumption.

And a trap worth recording, hit rather than theorised: the spike page registers its worker
only over HTTPS or on `localhost`. Served on `127.0.0.1` **the spike installs no worker at
all** — giving you

> **a "SPIKE DEVICE" THAT IS A CLEAN DEVICE WEARING THE SPIKE'S NAME,**

on which every cutover clause passes trivially and means nothing. The rehearsal that
silently failed to take the thing it was rehearsing looks exactly like a rehearsal that
went well.

---

## 8. Decisions taken while you were unreachable that reinterpret what you asked for

This is the delta conversation. These are not defects; they are places where your stated
requirement and the built thing are not the same shape, and somebody chose.

**The sync triggers.** You were promised six sync opportunities, including *at the end of
every session* and *on a short idle debounce*. Six triggers exist and are declared by name
in the engine: open, foreground, reconnect, leave, interval, manual. **The two you were
promised and are not getting were NEVER BUILT** — not "built and do not fire", not
"disabled", not "deferred". There is no end-of-session sync call anywhere in the shipped
source, and there is no idle debounce: the word does not appear in the sync runner or the
engine. What exists instead is a *leave* flush and a fixed *interval*. Those are
reasonable substitutes and they were not what you were told you would get.

**The on-demand tap is UNPROVEN RATHER THAN ABSENT.** It is built and wired
(`SyncFromStore.tsx:359` and `:364`). Nothing has driven it end to end in a walk, and one
of its two call sites is a fire-and-forget call whose failure would leave a wrong
indicator rather than a wrong outcome. So: present, plausible, unmeasured. Not the same
sentence as "it works."

**Nothing is encrypted at rest today.** The record seals exactly three fields —
`clinical_note`, `clinical_reference` and `clinical_reference_label` — and refuses, loudly
and by name, to store a clinical note in the clear. Every other field is stored as
written. Since no clinical note has ever been entered, **no sealed value exists anywhere**,
which means the two-device key-split protection you were promised is **DORMANT, NOT
ABSENT, AND UNTESTED**. It is built. It has never run. **The first clinical note ever
written is the first time that path runs**, on a real device, holding real information
about a real person. That is a materially different risk from an untested feature that
holds nothing.

**The backup control on a laptop stays hover-revealed at 840px and wider.** This is **a decision you took on a measurement**, not an open item and not a defect. It was measured
first in a live browser at 1280x900 with the pointer parked away and focus cleared, so
"at rest" was constructed rather than assumed, and you ruled on the measurement. It is
listed here only so you are not surprised to meet it and so nobody re-opens it as a bug.

**The O4 reset bar reads differently now, because you chose full curve authoring.** You
were originally promised that reset restores exactly the shipped set. You then chose that
intensity patterns are **fully authorable** — the coach adds and deletes curves, not just
edits the shipped ones. Reset therefore **reconciles against his authored curves rather
than discarding them**. That reconciliation is the cost full authoring bought; it is paid,
not deferred. But it means "reset restores exactly the shipped set" is no longer the true
sentence, and the O4 bar should be read in its new form.

**The app warns rather than refuses** on a coach-authored exercise ladder that breaks the
more-work-less-rest rule. It does not silently accept it and it does not block him. The
warning is a distinct outcome of the check, never a silent pass, because a dropped finding
reads to him as approval.

**Also decided in your absence, and each one built:** the finish control for ending a
session (you ruled: build the control only); an update check when the app returns to the
foreground (you ruled, in your words, "add the check on return", after being shown that
your real case fails without it); and the two-device merge fix, which was ruled
fix-before-publish rather than disclose. **The divergence seam was REFUSED and stays a
disclosure** — the app never asks the coach to choose between two versions, because
nothing calls that path in the shipped source.

---

## 9. The standing disclosure list

### Recorded before this step

- **The journal verification has no refresh.** It is honest but not live: what it shows was
  true when the screen was opened, and nothing updates it. Built that way deliberately,
  disclosed rather than fixed.
- **Two emoji are in the shipped bytes and unreachable at runtime.** They come from a
  routing library's own fallback error message. Every route declares its own error screen,
  so that fallback is never selected. Your "no emojis" instruction was unqualified, so you
  are told the fact and may overrule it. This is a static measurement of the bundle, not a
  browser walk. Two things would change it: a route added without its own error screen, or
  a second router.
- **The lists are the coach's; the types are not.** He owns exercises, routines, curves and
  clients completely. He **cannot** add a movement pattern, muscle group, equipment item or
  routine focus — those are frozen behind a fixed enumeration with no surface to extend
  them. The wording you were given ("everything is configurable") is wider than the build
  honours.

### The six added by the last step — and three of them are inside the test harness, not the app

Three that reach the coach:

1. **Opening one past session and reading it back in full was never built.** The code says
   so in its own words. Counts and what-was-worked-on are correct; re-reading one specific
   past session is not there.
2. **Two fire-and-forget calls on the sync engine are open escapes.** If one fails, the
   indicator stops being right while the underlying pass simply did not happen. It is **a
   wrong indicator, not a wrong destructive action** — which is why it was disclosed rather
   than chased. The seam whose failure *did* reach a destructive gate was found and closed.
3. **A dormant navigation layer is presented as live in the design document that ships with
   the handover.** The breadcrumb helper renders on none of the thirteen addresses; every
   screen draws its own inline link instead. The app is fine; **the reader is misled by the
   record, not by the app**, which is why it counts.

Three inside the harness rather than the app:

4. **An unexplained intermittent test failure, mechanism still unknown.** The quoted
   failure is `removals.test.ts:789`, `confirmedPresent "0 !== 1"`, on 2026-07-26, in a run
   of 663 tests in 49 seconds where that one test took 1,533ms — a loaded machine. A
   300-iteration probe on a quiet machine found the fixture invariant (one distinct
   signature). **Load-dependence is the live hypothesis and it is NOT proven.** Do not read
   the green runs since as a fix: the output of a re-run is an absence, and absence cannot
   tell "fixed" from "rare". A record correction underneath it: the test runner prints its
   failing-test header at the declaration line, not the assertion, so an earlier "`:762`
   failed" never located anything and the inference drawn from it was **right by luck, not
   by evidence**.
5. **Three fixed-count drain loops survive in test fixtures**, written independently by
   three authors — the signature of a wall nobody measured, papered over three times. All
   three are **fixture-side**: none is on a path the product executes, so the coach's build
   is not implicated. **Suite integrity, not a shipping defect.** The shortest drains two
   turns.
6. **The prose gate's universe is tracked files only.** A file that has been authored but
   not yet committed is **invisible** to it — and the gate's own test file was itself
   untracked when this was found. The app's own source is safe (it is walked from the
   filesystem); everything outside the app directory was not. The consequence was acted on:
   **the prose gate is re-run after the commit**, because running it before proves nothing
   about what publishing exposes.

**This list is a floor, not a ceiling.** Six lists held as complete in the previous step
proved short. Two more that belong in your hands, found in this step:

- **The publish audit's own self-reported hole, carried forward rather than glossed:**
  *"NOT ASSERTED — real client names: no `_spike-evidence/DENIED-NAMES.txt` exists."* The
  audit cannot scan for your coach's real client names because the file listing them does
  not exist in a form it can read. It says so itself rather than passing quietly, which is
  correct behaviour, and it was confirmed by planting a value. **Disclosed, not fixed.**
- **The publish audit could not pass on a staged tree** — the only state a publish actually
  runs in. Same tree, same 698-path universe, same content result, every probe firing in
  both runs: unstaged it exited 0, staged it exited 1. The cause was a non-vacuity floor
  placed on a quantity that **the very act the audit exists to precede empties**. It has
  been repaired: the floor now measures the real quantity (paths not in the last commit),
  which was measured at **163 in both states**, so its value no longer depends on whether
  anyone has staged anything.

---

## 10. Two things being watched, neither of which is retired

**1. `core/sync` is back at zero margin: 178 tests against a floor of 178.** It was retired
as a concern a few hours before this was written and then **recreated by new tests at the
new number**. One removed or renamed test under `core/sync` turns the publish gate red.
State it as **live**, not closed.

**2. `src/screens` moved 1428 → 1436 and was in nobody's list** — not the neuron's briefs,
not the planner's. It was found by **measuring**, not by reading a list. Eight tests were
sitting unprotected by any floor.

> **A FLOOR LIST HANDED DOWN IS A HYPOTHESIS.**

**Measured, not inferred, and true right now:** `https://visak13.github.io/Fit/` answers
200, **63,875 bytes**, titled **"Fit Platform Spike"** — re-measured on 1 August 2026 by two
independent instruments. (An earlier draft said 63,763 bytes. That figure is the CHARACTER
count of the same page; its byte count is 63,875, because 112 of those characters are
multi-byte. A units label is a claim like any other, and this document is the wrong place to
get one wrong.) **The address the handover gives the
coach is serving the wrong application at this moment.** That is expected — it is the
spike — and it is stated here because the handover document hands out that address.

---

## 11. The clause table

**A note on this table's provenance, because it is itself an example of the pattern.** No
prior step ever recorded a clause table; that instruction was wrong and the planner has
said so in writing (section 6). What follows is **constructed** from what is actually
recorded: the recipe's six outcomes and the specific promises inside them, and the
measurements this step actually took. **A row marked UNSOURCED means nothing in the record
ever recorded a verdict against it** — and that is itself a disclosure item, because it
means you were promised something nobody has measured.

**Four rows are UNSOURCED, and I want them named rather than buried in a column:** O2, O3,
O5 and O6 have **no recorded verdict at all**. Only O1 carries recorded evidence. The previous
step ran walks against all of them and their conclusions live in individual findings, but
**no step ever wrote down a per-outcome verdict**, so I will not manufacture one.

**AND THE MOST IMPORTANT SENTENCE IN THIS SECTION, BECAUSE IT CORRECTS SOMETHING THIS DOCUMENT
ITSELF NEARLY GOT WRONG: `met: false` ON O2 THROUGH O6 IS NOT A VERDICT. IT IS AN UNWRITTEN
FIELD.** Five of the six outcomes — O2, O3, **O4**, O5 and O6 — carry `met: false` with an
empty evidence field. (An earlier draft of this section said four and left O4 out; the record
says five, and a count that contradicts the record is a finding rather than a rounding.) That
flag has carried its **initial value from the day the outcomes were authored**. No step ever
recorded a per-outcome judgement, so it has **never once meant "measured and failed"**.

**THE FIELD IS EMPTY, NOT NEGATIVE.** If you read those five as five failures you would be
reading five verdicts that nobody ever reached — and in a document whose entire credibility
rests on being neither optimistic nor pessimistic, a false pessimism is the worse lie of the
two, because it is the one you would believe.

What DOES exist is the clause table below and the walk verdicts behind it. The evidence is
real, it was measured, and it simply **was never carried back into the outcome record**.
**THE GAP IS IN THE BOOKKEEPING, NOT IN THE BUILD.** Nothing has been pre-stamped to make this
document tidier, and no outcome has been marked by me: **the neuron will mark the outcomes
itself after a12, from evidence it can point at, and any outcome it cannot support stays
false with the reason given in plain words.**

This is **the pattern's third face**, and it belongs beside the other two in section 1: an
absence claim recorded without verifying; then a presence claim about a mechanism recorded
without verifying; and now **a default value reading as a measurement**. The root is the same
each time — **a cheap universe answering a question that belongs to an expensive one.**

| # | Clause, as you were promised it | Prior verdict | What this step measured | Standing |
| --- | --- | --- | --- | --- |
| O1 | Platform proof: sign-in, Meet link, Drive round trip, app-data folder, persistent storage, share sheet | **MET**, recorded with evidence | not re-measured | **HOLDS on iOS**, and iOS is the only tested target — Android is not tested and cannot be tested here, which is an absent platform rather than an uncovered one. Two facts ship unproven by name: the conference pending-to-success polling branch never executed, and the sign-in fact rests on consequence rather than capture. |
| O2 | A real session can be run end to end | **UNSOURCED** — no verdict was ever recorded; the `met` flag is unwritten, not negative | not this step's subject | **UNSOURCED.** Walked in the previous step; no per-outcome verdict was ever recorded. |
| O3 | Sync fires on open, foreground, **end of session**, reconnect, **short idle debounce**, on demand | **UNSOURCED** | Measured by me: six triggers declared — open, foreground, reconnect, leave, interval, manual. **No end-of-session call site. No idle debounce anywhere.** On-demand built at two sites, never driven end to end. | **FALLS SHORT.** Two promised triggers **never built** (substituted by leave + interval); on-demand **unproven rather than absent**. Disclosure, section 8. |
| O3 | Two devices sync without collision; a genuine conflict is surfaced rather than silently resolved | Measured in the previous step: cross-device apply was **refused whole**, reported as green | not re-measured | **Repaired** — ruled fix-before-publish and built. **The divergence seam stays REFUSED and disclosed:** the app never asks the coach to choose. Section 8. |
| O3 | Nothing bound for Drive is ever lost; the indicator never lies | **UNSOURCED** | not re-measured | **UNSOURCED**, with two known live gaps: the fire-and-forget indicator escapes (§9.2) and the journal screen's lack of refresh (§9). |
| O4 | The coach sets it up alone from a self-contained page with working links | Partially recorded; the calendar link was recorded **with a false mechanism** | Ten links measured signed-out, unfollowed, plus a followed pass with a fresh jar | **HOLDS with one named exception.** Nine of ten arrive. The calendar settings link **does not arrive**, its shipped mitigation sentence must stay, and **the prescribed way of re-checking it is blind** (§7). |
| O4 | Everything is configurable — patterns, exercise types and lists, workout types, reps/timers | Recorded as **wider than the build honours** | not re-measured | **FALLS SHORT, disclosed.** Lists yes; **types frozen** behind a fixed enumeration (§9). |
| O4 | Reset to defaults restores exactly the shipped set | Superseded by your own ruling | not re-measured | **CHANGED BY YOUR DECISION.** Full curve authoring means reset **reconciles against authored curves** rather than discarding them (§8). |
| O4 | Encryption: random data key, device slot + Google recovery slot, second device decrypts | Built and unit-proven | not re-measured | **DORMANT, NOT ABSENT, AND UNTESTED.** Nothing is encrypted at rest today; the first clinical note is the first live run (§8). |
| O4 | No claim of certification, compliance, security or endorsement anywhere | Gate exists and is proven live | Re-run after staging; the gate's universe hole was found and the gate is re-run **after** the commit | **HOLDS**, with the caveat that the gate **reds on an honest disclaimer** of a common shape and the cheapest response to that red is to delete the disclosure (§7). |
| O5 | Diet, history, import path, meaningful exports | **UNSOURCED** | not this step's subject | **UNSOURCED.** |
| O6 | Installs to a home screen and launches offline | Predicted to be trapped by the service worker | **Measured this step:** cold offline start paints 1,684 characters, **all five assets served by the worker**, zero failures, zero requests reaching the server; proven non-vacuous by deleting the entry from the cache and watching it go to 0 painted characters | **HOLDS.** Measured on a plain static host — **never through the dev preview server**, which sends a header that defeats the cache and paints a blank screen, fabricating a disaster that does not exist. |
| O6 | The published bytes are the bytes we built | — | Executed entry module and executed build stamp both read **off the running page** and matched what the build names | **HOLDS.** |
| O6 | An already-installed device gets the new app, not the old one | Predicted; never exercised | **Measured:** old worker replaced ✔ (provable only by cache names and painted output — both workers register at the same script URL, so the obvious check cannot discriminate); its caches deleted ✘; new shell served ✔ **from load 2** | **FALLS SHORT.** §2. Cache cleanup being repaired before the push; the first-load repaint **cannot** be repaired and is disclosed. |
| O6 | The same, **on a device that already carries the spike in the real world** | — | **Not measurable before the publish, by anyone** | **UNMEASURED, and measurable exactly once** — first opening after the push. §3. |
| O6 | No emoji anywhere | Measured in the bundle | not re-measured | **FALLS SHORT by the letter, unreachable in practice.** Two emoji in the shipped bytes, in a library error message that can never be selected. Your call (§9). |
| — | The repository contains no client data, no real names, no credential | Audit clean; probes fired | Re-run on the staged tree after repair: 699 paths, 10.36 MiB read whole-file, all eight probes fired, exit 0 in **both** staged and unstaged states. Re-run again independently by the reviewer on 1 August 2026: 700 paths, 10.40 MiB, 164 not in the last commit, all eight probes fired, exit 0 — the universe grew by exactly one path because this document itself joined it | **HOLDS, with one self-reported hole**: real client names are **NOT ASSERTED** because the file naming them does not exist (§9). |
| — | What publishes is what we reviewed | — | 310 staged paths on a repository with no prior public history; **four already-committed Sol logs publish invisibly to any diff** | **UNMEETABLE by review alone.** §4 and §5 — this is why they were read rather than diffed. |

---

## 12. What I need from you

Nothing in this document has been published. The repository still has no remote. Every item
above can be changed, reversed or removed while that remains true.

Three decisions are genuinely yours and nobody has taken them:

1. **The four Sol bridge logs** — do they publish, or do we untrack them first? (§5)
2. **The two emoji in the shipped bytes** — you said no emojis, unqualified. They are
   unreachable at runtime. Overrule or leave? (§9)
3. **The first commit is the entire public history of this project.** 310 paths, all at
   once, permanently. Confirm you want that, knowing it is a disclosure and not only a
   deployment. (§4)

And two things you should carry into the handover call rather than the file:

- **"Open it, close it, open it again."** Say it as a step, not as a caveat. (§2)
- **Whoever opens it first reads the first screen and the cache list before touching
  anything.** That observation exists for one opening only. (§3)
