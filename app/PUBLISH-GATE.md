# PUBLISH-GATE.md — the publish dress rehearsal

> **READ THIS BEFORE THE HEADLINE BELOW IT. The headline is a dated measurement from 2026-08-01
> and it is NO LONGER THE STATE OF THE GATE.** It says `tools/publish-audit.mjs` FAILS on the
> staged tree. That was true when it was written and was repaired the same day by s12/a18; a
> further defect found by the independent review s12/a19 was repaired on 2026-08-02. **As of
> 2026-08-02 the audit exits 0 on the untouched tree AND on a staged tree, with all eight probes
> firing.** The measurements below are kept unedited because rewriting a measurement is not a
> correction — but a reader who stops at the headline would carry away a false present tense, and
> the cheapest thing to do with an instrument you believe is permanently red is to stop running
> it. **The current state is in the two addenda at the end of this file.**

Written by s12/a7 on 2026-08-01. **No commit object was created. No network call was
made to github.com or any remote.** `HEAD` is `95a4913` before this action and
`95a4913` after it; `git rev-list --count HEAD` is 7 before and 7 after. The
repository has no remote (`git remote -v` prints nothing).

Read this top to bottom: the order it was executed in is load-bearing, and one of the
results below is a **RED** that is reported rather than worked around.

---

## THE HEADLINE

**The five-command publish gate is GREEN. The staging manifest is exactly the shape it
was predicted to be, deletions included. But `tools/publish-audit.mjs` FAILS on the
staged tree — and it passes on the identical tree unstaged.** The audit's own
non-vacuity floor ("this tree must carry untracked files") cannot hold once staging is
complete, which is the only state a publish actually runs in. Details in section 7.

---

## 1. PRECONDITION (i) — THE TWO NESTED `.git` DIRECTORIES

### Confirmed empty immediately before deleting, by me, not by the planner's reading

The whole point of this exchange was that nobody should act on an unopened directory, so
the directories were opened again in the same command that deleted them:

```
=== ALL .git entries anywhere in the tree (before delete) ===
./.git
./design/direction-three/assets/.git
./design/direction-two/assets/.git
./spike/.git

=== RE-CONFIRM EMPTY IMMEDIATELY BEFORE DELETE ===
design/direction-two/assets/.git -> 0 entries at any depth
design/direction-three/assets/.git -> 0 entries at any depth

=== DELETING ===
rmdir exit=0 (rmdir refuses a non-empty dir, so success is itself a second emptiness proof)

=== AFTER: .git entries tree-wide ===
./.git
./spike/.git
```

`find <dir> -mindepth 1` at any depth returned **0 entries** for both — no `HEAD`, no
`objects`, no `refs`, no hidden entries. `rmdir` (not `rm -rf`) was used deliberately:
it refuses a non-empty directory, so its exit 0 is an independent second proof of
emptiness rather than a restatement of the first.

Supporting measurements taken before the delete, each showing git did not recognise them:

```
=== gitlinks in index (mode 160000) BEFORE ===
-- count: 0
=== git status --porcelain on the two paths ===
(empty = silent)
=== git add -An dry run on both ===
(empty = stages nothing)
=== rev-parse --show-toplevel from inside each ===
C:/Projects/Fit
C:/Projects/Fit
```

### NO IGNORE RULE WAS ADDED

```
=== precise: any ignore rule targeting .git dirs? ===
grep -n -E '^[^#]*\.git($|/)' .gitignore app/.gitignore
   -> exit 1 (1 = NO such rule; confirms none was added)
```

Ignoring `design/**/.git` would have made CHECK D's green a consequence of the rule
instead of a fact about the tree — a guard suppressing its own subject. The
directories are gone; the rule does not exist.

### CHECK D STILL PASSES, AND FOR THE RIGHT REASON

From the audit run (section 7):

```
  no gitlink in the commit set: no nested repository would publish as an empty submodule pointer
```

```
=== GITLINKS (mode 160000) in the staged index ===
gitlink count: 0
```

**State plainly what that green rests on**, because it rests on two different things:

| Nested repo | Why it contributes no gitlink |
|---|---|
| `design/direction-two/assets/.git` | **physically deleted by this action** — a fact about the tree |
| `design/direction-three/assets/.git` | **physically deleted by this action** — a fact about the tree |
| `spike/.git` | excluded by the root `.gitignore` rule `/spike/`, line 7 |

The `spike/` exclusion is **pre-existing and deliberate** — `.gitignore` was last
touched by `e47e706` (2026-07-25, s3), long before this action, and the audit's probe
A1 proves that exclusion is exclusion rather than blindness ("6 forbidden paths are
reachable with ignores off and excluded with them on"). Nothing about `design/` is
suppressed by a rule; the design half of CHECK D's green is a fact about the tree.

---

## 2. PRECONDITION (ii) — THE FOUR SOL BRIDGE RUN LOGS

All four were **read in full, not sampled**:

| File | Bytes | Lines |
|---|---|---|
| `design/direction-two/assets/.sol-run.jsonl` | 2,363 | 9 |
| `design/direction-two/assets/.sol-last-message.txt` | 64 | 0 (no trailing newline) |
| `design/direction-three/assets/.sol-run.jsonl` | 7,389 | 15 |
| `design/direction-three/assets/.sol-last-message.txt` | 112 | 0 (no trailing newline) |

### WHAT THEY CONTAIN, BY CATEGORY

1. **Sol/codex thread identifiers** — two UUIDv7 values, `019f9907-ff05-79e1-aeba-d585fd207fb9`
   and `019f9908-df55-7241-9f57-136801fde77f`. Session ids for a model run; not credentials
   and not account-linked.
2. **Agent prose about SVG geometry** — e.g. *"I'll preserve the successful palette, safe
   area, and peak cap, while replacing the staircase with four fully separated bars"*.
   Design reasoning about the app mark, nothing else.
3. **Absolute Windows paths — project paths only.** The complete deduplicated set is:
   `C:\Projects\Fit\design\direction-two\assets\mark.svg`,
   `C:\Projects\Fit\design\direction-three\assets\mark.svg`,
   `C:\Projects\Fit\design\direction-three\assets\.sol-last-message.txt`,
   `C:\Projects\Fit\design\direction-three\assets\.sol-run.jsonl`,
   `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`.
   **No `C:\Users\...` path, no home directory, no user name, no machine name.**
4. **Echoed PowerShell command text** — two long inspection commands reading the SVG's
   `viewBox`, `width`, `height`, `title`, fill colours and directory listing. No secrets,
   no environment dump, no clipboard content.
5. **Command output** — SVG metadata: `512x512`, `viewBox 0 0 512 512`, title
   *"Fit application mark, Roster direction"*, colours `#00564F`, `#131211`, `#F4F4F2`,
   file listings of the assets directory.
6. **Token usage counters** — `input_tokens`, `cached_input_tokens`, `output_tokens`,
   `reasoning_output_tokens`. Billing-shaped integers, no identity.
7. **One sandbox rejection line** — `2026-07-25T12:10:08.913057Z ERROR codex_core::tools::router:
   ... rejected: blocked by policy`. A tool-policy refusal, no payload.

### VERDICT ON (ii): NOTHING FOUND THAT REQUIRES A STOP

No credential, no personal name, no real client detail, no machine or user name, no
email address, no token, no pasted third-party source, no clipboard leakage. Scans run
with **non-vacuity probes in the same run**:

```
=== A. credential-shaped tokens (secret|password|api_key|access_token|bearer|
       authorization|client_secret|refresh_token|PRIVATE KEY|AKIA…|ghp_…|gho_|sk-…|
       xox[baprs]-|AIza…|ya29.) ===
   -> exit 1 (1 = no match)
=== A-PROBE (same regex, planted needles) ===
2:client_secret=GOCSPX-planted
3:AKIA0123456789ABCDEF
4:ghp_0123456789abcdefghijABCDEFGHIJ
   -> PROBE exit 0 (0 = probe FIRED)

=== B. user/machine identity (C:\Users\|USERPROFILE|HOMEPATH|COMPUTERNAME|
       <email>|aksou|vishal|oulkar|visak13) ===
   -> exit 1 (1 = no match)
=== B-PROBE ===
2:somebody@example.com
   -> PROBE exit 0 (0 = probe FIRED)
```

Each absence claim above is paired with a probe that fired on a planted needle, so
"nothing found" is a result rather than a silence.

**I have not untracked them and I have not decided anything.** Whether four
model-conversation transcripts read by nobody should publish at all is the user's call,
and it belongs in `DISCLOSURE.md` beside everything else he is being asked to release.
`DISCLOSURE.md` **does not exist yet** in this tree (checked at repo root and under
`app/`) — a later action owns writing it, and this entry is handed to it.

### A FACT THAT SHARPENS THE DISCLOSURE

**These four are already committed.** They are in the `HEAD` tree at `95a4913` (s8), not
new additions in this commit set — which is why they appear in neither the `A` nor the
`M` column of the manifest in section 6:

```
=== the four Sol logs: in HEAD tree already? ===
git ls-tree -r --name-only HEAD | grep '\.sol-'
design/direction-three/assets/.sol-last-message.txt
design/direction-three/assets/.sol-run.jsonl
design/direction-two/assets/.sol-last-message.txt
design/direction-two/assets/.sol-run.jsonl
```

So they do not publish as part of *this* change — they publish the moment the repository
publishes at all, silently, because nothing in a diff-shaped review would show them.
That is precisely why they needed reading rather than diffing.

### ARE THESE FOUR THE ONLY ARTEFACTS OF THAT KIND? — SWEPT TWO WAYS

**Sweep 1, by filename**, whole tree, tracked and untracked, `.sol-*`, `*sol-run*`,
`*sol-last*`, `*.jsonl`, `*last-message*`, `*bridge*run*`:

```
./design/direction-three/assets/.sol-last-message.txt
./design/direction-three/assets/.sol-run.jsonl
./design/direction-two/assets/.sol-last-message.txt
./design/direction-two/assets/.sol-run.jsonl
```

**Sweep 2, by content shape** — because a filename sweep only ever finds what somebody
named. Grep for the bridge-run signature itself (`"type":"thread.started"`,
`"type":"turn.completed"`, `"type":"item.completed"`, `codex_core::`,
`reasoning_output_tokens`) across the whole tree, with a non-vacuity probe:

```
./design/direction-three/assets/.sol-run.jsonl
./design/direction-two/assets/.sol-run.jsonl

=== SWEEP PROBE: plant the signature in a new scratch file, re-run the same grep ===
./.sweep-probe.tmp
   -> SWEEP PROBE FIRED (grep sees a newly planted file of this shape)
probe file removed; still present? ls: cannot access '.sweep-probe.tmp': No such file or directory
```

**Sweep 3, every hidden entry tree-wide** (excluding `.git` internals, `spike/`,
`node_modules`) — the widest net, and the one that found something the first two could
not:

```
./.github
./.gitignore
./app/.gitignore
./design/direction-three/assets/.agents
./design/direction-three/assets/.logs
./design/direction-three/assets/.sol-last-message.txt
./design/direction-three/assets/.sol-run.jsonl
./design/direction-two/assets/.agents
./design/direction-two/assets/.logs
./design/direction-two/assets/.sol-last-message.txt
./design/direction-two/assets/.sol-run.jsonl
```

`AN ENUMERATION IS A FLOOR, NEVER A CEILING` — and here it was. **Four `.agents/` and
`.logs/` directories exist beside the four logs and were in nobody's list.** They were
opened: **all four are empty (0 entries at any depth)**, so git will never commit them
and they carry nothing. Reported anyway, because the reason they are harmless is a
measurement and not an assumption.

**Answer: yes, the four named files are the complete set of bridge-run artefacts in this
tree** — established by three independent methods, one of which (content shape) is
structurally capable of finding a file nobody named, and each of which was probed.

### DID a1's SECRETS/PII AUDIT UNIVERSE INCLUDE THESE FOUR FILES? — YES, AND MEASURED

Stated plainly rather than inferred. `tools/publish-audit.mjs` builds its universe from
`git ls-files` plus a `git add -An --force` dry run (line 101-105), and content-scans it
via `scanFiles(stagedPaths, ROOT)` (line 496-516) with **no extension filter and no
dotfile exclusion** — every path in the universe is read whole. All four files are
tracked, therefore all four are in the universe.

That is a reading of the code. It was then **proven by planting**, per the discipline
that a break probe is proven by a RED on the assertion probed, quoting that assertion's
own message. A `Google API key`-shaped value was written into
`design/direction-two/assets/.sol-last-message.txt` **with a file editor, not a shell
string**:

```
=== PLANT APPLIED — confirm the break actually landed ===
104 design/direction-two/assets/.sol-last-message.txt
grep -c -E '\bAIza[0-9A-Za-z_-]{35}\b' -> 1
   -> plant present and matches the audit's OWN 'Google API key' shape

########## AUDIT WITH THE PLANT ##########
  scanned 698 files, 10.32 MiB, whole-file substring
FAIL: CHECK B: 1 account-linked or credential hit(s) in files a commit would carry:
  design/direction-two/assets/.sol-last-message.txt — Google API key (shape)
publish-audit: 1 failure(s). DO NOT PUBLISH.
```

**The probe fired on the assertion it was aimed at (CHECK B), naming the exact file, in
that assertion's own words.** So the audit's clean verdict genuinely covers these four
files — it is not a verdict whose universe quietly excluded them.

Restored byte-exactly afterwards, asserted rather than assumed (`core.autocrlf` is true
in this repo and `git checkout --` is not a byte-exact revert here):

```
=== RESTORE: byte count must be exactly 64 (pre-plant) ===
64 design/direction-two/assets/.sol-last-message.txt
=== and git must see it UNMODIFIED ===
(empty = unmodified)
=== plant gone? ===
grep -c AIza -> 0   (grep exit 1 = gone)
```

---

## 3. ORDER OF EXECUTION, AND THE FLOORS STAMPED FIRST

`check:stale` hashes the tree the floor files live in, so stamping after a build makes
`dist` stale and reds the gate you just passed. Executed order was therefore:

**preconditions → measure suites green → STAMP FLOORS → BUILD → FIVE GATE COMMANDS →
STAGE → AUDIT.**

The floors were stamped on a **green** tree — the three suites were run to completion
first, all green, before `--update-floors` was allowed to write anything.

### FLOORS THAT MOVED, WITH BEFORE/AFTER

| File | Directory | Before | After | Δ |
|---|---|---|---|---|
| `tools/shell-coverage.json` | `src/screens` | 1428 | **1436** | **+8** |
| `tools/shell-coverage.json` | `src/shell` | 273 | **281** | **+8** |
| `tools/shell-coverage.json` | *total* | 2072 | **2088** | **+16** |
| `tools/core-coverage.json` | — | — | — | **no change (byte-identical)** |
| `tools/tools-coverage.json` | — | — | — | **no change (byte-identical)** |

Verbatim diff:

```
--- core-coverage.json ---
  (no change)
--- shell-coverage.json ---
8,9c8,9
<     "src/screens": 1428,
<     "src/shell": 273
---
>     "src/screens": 1436,
>     "src/shell": 281
11c11
<   "total": 2072
---
>   "total": 2088
--- tools-coverage.json ---
  (no change)
```

**a2's eight new `src/shell` tests are now protected** — they sat at 281 against a floor
of 273 and were unprotected because a2 deliberately did not stamp. So were eight in
`src/screens` (1436 against 1428), which was not in the brief and is reported because it
was found. Both are stamped now; a removed or renamed test in either directory reds the
gate instead of passing quietly.

`core` and `tools` were already at their exact measured values and their files came back
byte-identical, so the stamp was a no-op there rather than a silent rewrite.

---

## 4. THE BUILD

Run **after** the stamp, **before** the gate.

```
> fit-app@0.0.0 build
> vite build && node tools/finish-build.mjs

vite v7.3.6 building client environment for production...
transforming...
✓ 319 modules transformed.
rendering chunks...
computing gzip size...
dist/.vite/manifest.json           0.19 kB │ gzip:   0.14 kB
dist/index.html                    5.48 kB │ gzip:   2.49 kB
dist/assets/index-DPOJMHWB.css    30.72 kB │ gzip:   6.27 kB
dist/assets/index-BDq7ZK43.js  1,056.82 kB │ gzip: 306.06 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 2.11s
build stamp 367e496fc238ace8 over 446 source files
output directory dist/ (named once in tools/build-config.mjs)
entry module assets/index-BDq7ZK43.js read from .vite\manifest.json
precaching 11 urls under /Fit/
```

The chunk-size line is vite's standing advisory on a 1 MB bundle, not an error; exit was
0. New entry names are `assets/index-BDq7ZK43.js` and `assets/index-DPOJMHWB.css` —
remember those two, they are the additions in section 6.

---

## 5. THE FIVE GATE COMMANDS — REAL TRANSCRIPTS

All five run from `C:/Projects/Fit/app` after the build. **All five green. Nothing was
worked around and nothing was re-run to get a better colour.**

### GATE 1/5 — `npm run typecheck`

```
> fit-app@0.0.0 typecheck
> tsc -p tsconfig.json

EXIT=0
```

### GATE 2/5 — `npm run test` (core), per-directory counts

```
> fit-app@0.0.0 test
> node tools/run-core-tests.mjs

discovered 17 core directories with tests:
  artefacts, backup, crypto, diet, export, integration, intensity, journal, model,
  outbox, remote, report, seed, session, status, store, sync

  artefacts        78 tests    78 pass   0 fail  floor  78  ok
  backup           43 tests    43 pass   0 fail  floor  43  ok
  crypto           90 tests    90 pass   0 fail  floor  90  ok
  diet             95 tests    95 pass   0 fail  floor  95  ok
  export           74 tests    74 pass   0 fail  floor  74  ok
  integration      17 tests    17 pass   0 fail  floor  17  ok
  intensity        82 tests    82 pass   0 fail  floor  82  ok
  journal         104 tests   104 pass   0 fail  floor 104  ok
  model           116 tests   116 pass   0 fail  floor 116  ok
  outbox           86 tests    86 pass   0 fail  floor  86  ok
  remote           58 tests    58 pass   0 fail  floor  58  ok
  report           83 tests    83 pass   0 fail  floor  83  ok
  seed             35 tests    35 pass   0 fail  floor  35  ok
  session          49 tests    49 pass   0 fail  floor  49  ok
  status           72 tests    72 pass   0 fail  floor  72  ok
  store           107 tests   107 pass   0 fail  floor 107  ok
  sync            178 tests   178 pass   0 fail  floor 178  ok

  TOTAL          1367 tests across 17 directories

every discovered directory ran, every count held its floor.
EXIT=0
```

**`core/sync`, reported explicitly as required: 178 tests against a floor of 178 — ZERO
MARGIN.** One removed or renamed test under `core/sync` reds this gate. The s11-era
figure of 149 was stale; **178 is the measured number**, confirming a2's correction. The
zero-margin warning itself was right; only the number was wrong.

### GATE 3/5 — `npm run test:shell`, per-directory counts

```
> fit-app@0.0.0 test:shell
> node tools/run-suite-tests.mjs shell

discovered 5 shell directories with tests:
  src/design, src/platform, src/proof, src/screens, src/shell

  src/design       67 tests    67 pass   0 fail  floor  67  ok
  src/platform    240 tests   240 pass   0 fail  floor 240  ok
  src/proof        64 tests    64 pass   0 fail  floor  64  ok
  src/screens    1436 tests  1436 pass   0 fail  floor 1436  ok
  src/shell       281 tests   281 pass   0 fail  floor 281  ok

  TOTAL          2088 tests across 5 directories

every discovered directory ran, every count held its floor.
EXIT=0
```

The floors here read 1436 and 281 because this run is **after** the stamp. The pre-stamp
run of the same suite, on the same tree, printed `floor 1428` and `floor 273` — that is
the margin that was unprotected and is now closed.

### GATE 4/5 — `npm run test:tools`

```
> fit-app@0.0.0 test:tools
> node tools/run-suite-tests.mjs tools

discovered 1 tools directories with tests:
  tools

  tools            58 tests    58 pass   0 fail  floor  58  ok

  TOTAL            58 tests across 1 directories

every discovered directory ran, every count held its floor.
EXIT=0
```

### GATE 5/5 — `npm run check:stale`

```
> fit-app@0.0.0 check:stale
> node tools/check-stale.mjs

FRESH: dist/ was built from this source (stamp 367e496fc238ace8, 446 files).
Built at 2026-08-01T12:27:29.193Z.
EXIT=0
```

Stamp `367e496fc238ace8` matches the build in section 4 exactly. Because the floors were
stamped **before** the build, the floor-file writes are inside the hashed source set and
`check:stale` is FRESH rather than stale.

**Per-directory totals across the gate: 1367 core + 2088 shell + 58 tools = 3513 tests,
0 failures, every discovered directory ran, every count held its floor.**

---

## 6. THE STAGING MANIFEST

Produced by `git add -A` at the repository root `C:\Projects\Fit`. `C:\Projects\Fit\spike`
is a **separate repository** with the live remote and was not touched.

### COUNTS BY STATUS

| Status | Count |
|---|---|
| `A` — added | **162** |
| `M` — modified | **145** |
| `D` — **deleted** | **2** |
| **Total staged paths** | **309** |

```
=== STAGED MANIFEST — git diff --cached --name-status HEAD ===
    162 A
      2 D
    145 M
=== TOTAL staged paths ===
    309
```

A note on the arithmetic, because it looks wrong at a glance: pre-stage `git status
--porcelain` reported `120 ??` but 162 additions were staged. Porcelain **collapses an
untracked directory into a single `??` entry**; `git add -A` expands it. The 162 is the
true file count and the 120 is a directory-collapsed view of the same set.

Additions by area:

| Area | Added |
|---|---|
| `app/src` | 90 |
| `app/core` | 62 |
| `app/tools` | 3 |
| `app/dist` | 2 |
| `design/icons` | 1 |
| `app/HANDOVER.md`, `app/DEVICE-WALK.md`, `DEPLOYMENT.md` | 3 |
| `.github/workflows/pages.yml` | 1 |

`.github/workflows/pages.yml` is staged. The s12 grounding says *".github/ DOES NOT
EXIST YET"* — that was true when the grounding was written and **is no longer true**;
a5/a6 created it. Recorded here so the next reader does not re-derive a stale absence.

### THE DELETIONS — THE POINT OF THE WHOLE MANIFEST

**Both removed asset files are staged AS DELETIONS, confirmed by name:**

```
=== ALL DELETIONS, by name (status D) ===
D	app/dist/assets/index-Dv_hVoTc.js
D	app/dist/assets/index-UPxct_at.css
```

Those two are the **only** deletions in the entire 309-path staged set. Adding the new
bundle while leaving the old one behind is precisely how a precaching service worker
goes on serving what no longer exists — the worker's precache list is rebuilt from the
new `dist`, but a stale asset left in the repository stays fetchable at its old URL and
an old `index.html` in a client cache will keep asking for it.

### `app/dist` — 2 DELETIONS / 2 ADDITIONS / 3 MODIFICATIONS, AS PREDICTED

```
=== app/dist staged, by status ===
A	app/dist/assets/index-BDq7ZK43.js
A	app/dist/assets/index-DPOJMHWB.css
D	app/dist/assets/index-Dv_hVoTc.js
D	app/dist/assets/index-UPxct_at.css
M	app/dist/build-info.json
M	app/dist/index.html
M	app/dist/sw.js
```

Exactly the shape the action predicted. The old hashed pair goes, the new hashed pair
arrives, and the three files that name them (`index.html`, `sw.js`, `build-info.json`)
are modified in the same commit set. `app/dist` holds 11 files in the index:

```
app/dist/assets/index-BDq7ZK43.js
app/dist/assets/index-DPOJMHWB.css
app/dist/build-info.json
app/dist/icons/apple-touch-icon-180.png
app/dist/icons/icon-192.png
app/dist/icons/icon-512.png
app/dist/icons/icon-maskable-512.png
app/dist/icons/mark.svg
app/dist/index.html
app/dist/manifest.webmanifest
app/dist/sw.js
```

### EVERY GITLINK (MODE 160000), ENUMERATED BY NAME WITH ITS COUNT

```
=== GITLINKS (mode 160000) in the staged index ===
git ls-files -s | awk '$1=="160000"'
(no output)
gitlink count: 0
```

**Count: 0. The enumeration is empty — there is no gitlink to name.** Stated as a count
and an empty list rather than as "none", because an empty list from a command that ran
is a different claim from a check nobody performed. The command, its filter and its
zero-line output are all above. See section 1 for what that zero rests on.

### WHICH PUBLISH PATH THIS MANIFEST IS A CLAIM ABOUT — CARRYING a5's ASYMMETRY

**This staging manifest is a claim about published bytes ONLY under Path B.**

| | Path A — GitHub Actions | Path B — gh-pages root |
|---|---|---|
| What serves | CI rebuilds from source and serves **its own** output | the committed `app/dist` is served **byte for byte** |
| Is the committed `app/dist` the served bytes? | **NO** | **YES** |
| Does this manifest describe what visitors download? | no — it describes the *input* to a rebuild | **yes, exactly** |
| `base` | `/Fit/` | `/Fit/` |

`base` is `/Fit/` on both, so the two look interchangeable and a reader will treat them
as such. **They are not.** Under Path A the two `app/dist` deletions above are hygiene —
CI rebuilds and never reads them. Under Path B those same two deletions are the
difference between a service worker that stops serving a removed asset and one that
keeps serving it, and a stale committed `dist` paints the wrong application at the real
address.

---

## 7. THE PUBLISH AUDIT — A RED, REPORTED AND NOT WORKED AROUND

`node tools/publish-audit.mjs`, re-run against the staged set.

### THE STAGED RUN

```
publish-audit — what a commit in C:\Projects\Fit would carry
  UNIVERSE WALKED: the 698 paths the resulting commit's tree would contain — 698 already
  tracked, 0 UNTRACKED and never commit-reviewed, 0 tracked-and-modified, less 0
  deletion(s). Enumerated from git, so the root .gitignore's /spike/ and /_spike-evidence/
  rules are honoured — and probe A1 below proves that is exclusion rather than blindness.
  probe A1 FIRED: 6 forbidden paths are reachable with ignores off and excluded with them on
  probe A2 FIRED: the path matcher flags both planted forbidden paths
  build output vs source: 11 paths under app/dist/ are committed DELIBERATELY AS BUILD
  OUTPUT (static host, no build step; both .gitignore files record the decision) and this
  script searches their content the same as source. The other 687 paths are committed as
  source, and none of them is a built artefact or a scratch tree.
  denied values derived from _spike-evidence: 21 across 7 classes (account-linked
  identifier x14; meeting code x2; signed-in account fragment x1; signed-in account local
  part x1; signed-in account local part, base64 phase 0 x1; base64 phase 1 x1; base64
  phase 2 x1); plus 8 credential shapes
  NOT ASSERTED — real client names: no _spike-evidence/DENIED-NAMES.txt exists, and
  nothing in this tree records a real client, so there is no list to search for. This
  class is reported unsourced rather than reported clean: a scan with an empty needle
  list passes for free.
  scanned 698 files, 10.32 MiB, whole-file substring
  ALLOWED — OAuth refresh token in app/src/platform/google-privacy.test.ts: ...
  ALLOWED — OAuth client secret in app/src/screens/setup.test.ts: ...
  no gitlink in the commit set: no nested repository would publish as an empty submodule pointer
  dist in universe: 11 files; largest app/dist/assets/index-BDq7ZK43.js at 1056824 bytes
  probe B1 FIRED: all 15 classes detected when planted in a 1057512-byte copy of the real dist bundle
  probe B2 FIRED: the whole-file reader finds a string known to be in dist
  probe B3 FIRED: a denied value split across two adjacent literals is caught only after joining
  probe C1 FIRED: a denied value planted in a new UNTRACKED file was enumerated and caught
  — the 0-file untracked region is covered by construction, not by assumption
  probe C2 FIRED: the same denied value planted in an ignored file was NOT reported — the
  universe excludes what a commit excludes
  probe cleanup verified: both plants removed and the universe is the size it started at

FAIL: the enumeration reports ZERO untracked files. This tree is known to carry a large
untracked region, and that region is the highest-risk part of a first commit. The audit
cannot prove it covered the untracked set, so it reports that rather than reporting clean.

publish-audit: 1 failure(s). DO NOT PUBLISH.
EXIT=1
```

### THE NON-VACUITY PROBES — ALL FIRED

| Probe | Result | What it proves |
|---|---|---|
| A1 | **FIRED** | 6 forbidden paths reachable with ignores off, excluded with them on — the `/spike/` exclusion is exclusion, not blindness |
| A2 | **FIRED** | the path matcher flags both planted forbidden paths |
| B1 | **FIRED** | all 15 classes detected when planted in a 1,057,512-byte copy of the real `dist` bundle |
| B2 | **FIRED** | the whole-file reader finds a string known to be in `dist` (a line matcher would find nothing in a 1 MB single-line bundle) |
| B3 | **FIRED** | a denied value split across two adjacent literals is caught only after joining |
| C1 | **FIRED** | a denied value planted in a new untracked file was enumerated and caught |
| C2 | **FIRED** | the same value planted in an ignored file was NOT reported — the universe excludes what a commit excludes |
| cleanup | **VERIFIED** | both plants removed, universe back to its starting size |

**Every probe fired.** The audit's content checks are clean: no spike path, no derived
account-linked value, no credential shape outside two documented and policed allows, no
gitlink. The single failure is not about content at all.

### THE FAILURE IS CAUSED BY STAGING, AND THAT IS MEASURED, NOT INFERRED

The index was reset (`git reset`, mixed — index only, worktree untouched, confirmed by
`git status` returning the identical `2 D / 145 M / 120 ??`) and the **same audit was run
against the same bytes**:

```
  UNIVERSE WALKED: the 698 paths the resulting commit's tree would contain — 538 already
  tracked, 162 UNTRACKED and never commit-reviewed, 145 tracked-and-modified, less 2
  deletion(s).
  ...
  scanned 698 files, 10.32 MiB, whole-file substring
  probe C1 FIRED: ... the 162-file untracked region is covered by construction, not by assumption
  ...
publish-audit: clean. No spike path and no derived account-linked value reaches the
commit set, and every absence above was proven by a probe that fired.
EXIT=0
```

| | Unstaged index | Staged index |
|---|---|---|
| Universe size | **698 paths** | **698 paths** |
| Files scanned | **698, 10.32 MiB** | **698, 10.32 MiB** |
| Probes fired | **all** | **all** |
| Content findings | **none** | **none** |
| Verdict | **clean, EXIT 0** | **FAIL, EXIT 1** |

**Identical tree. Identical universe. Identical scan. Opposite verdicts.** The only
variable is whether `git add -A` has run. `git add -A` moves files from
`universe.untracked` into `universe.tracked` without changing the universe by a single
path — and the audit's floor at line 135 fails when `universe.untracked.length === 0`.

### WHY THIS IS A FINDING RATHER THAN A NUISANCE

The floor and probe C1 are two parts of one script that **disagree in this state**. C1
plants a file and measures that the untracked region is enumerated — it fired, so
untracked coverage is *proven*. The floor asserts untracked coverage is *unproven*,
from a count. The measurement and the assumption contradict each other, and the
assumption is the one that decides the exit code.

This is the class a1 named in its own discovery this step: **a non-vacuity floor placed
on a quantity the evidence does not contain is a lock, and it looks exactly like
rigour.** Here the quantity is emptied by the very act the audit exists to precede.
The audit can only report clean on a tree that has **not** been staged — that is, it
cannot describe the state a publish actually runs in. Its own headline is *"what a
commit in C:\Projects\Fit would carry"*, and after `git add -A` that is exactly what the
index holds.

**Not fixed here.** The action's instruction is that any red stops and is reported,
never worked around, and editing the floor to make my own run green is the definition of
working around it. Handed up for the planner and neuron: either the floor needs a
staged-index arm (`untracked === 0` is fine when the index is dirty against `HEAD`), or
the audit must be specified as a pre-staging instrument and the publish sequence ordered
accordingly. **That is a decision about what the gate means, not a patch.**

**Read together with the manifest: the tree is publishable on content and the audit says
so on every content axis. It is the audit's own precondition, not the tree, that is red.**

---

## 8. WHAT THIS ACTION DID NOT DO

- **No commit object was created.** `HEAD` is `95a4913` ("The diet module and the export
  seam (s8)") before and after; `git rev-list --count HEAD` is 7 before and 7 after.
- **No push, no fetch, no `gh` invocation, no network call to github.com** or any other
  remote. The repository has no remote configured — `git remote -v` prints nothing.
- **No ignore rule was added.**
- **No file was untracked**, including the four Sol logs.
- **Nothing under `spike/` or `_spike-evidence/` was touched or staged.**
- **No workaround was applied to the audit failure in section 7.**

### HOUSEKEEPING, CHECKED

```
port 4179: nothing listening
ls: cannot access '/c/fit-a11': No such file or directory
=== no scratch tree inside the repo ===
(empty = none)
```

The orphan `vite preview` on port 4179 and the scratch tree at `C:/fit-a11` named in the
s12 grounding are **both already gone**. Nothing was bound to a port by this action.

---

## 9. WHAT THE NEXT ACTION INHERITS

1. **A staged index of 309 paths** — 162 added, 145 modified, 2 deleted — sitting on
   `95a4913` with no commit made. `git add -A` is idempotent; re-running it changes
   nothing.
2. **One RED to rule on**: the publish audit cannot pass on a staged tree (section 7).
   A commit cannot honestly claim a green audit until that is decided.
3. **A disclosure entry**: four already-committed Sol bridge logs, read in full and
   clean, whose publication is the user's call and which belong in `DISCLOSURE.md` —
   a file that does not yet exist.
4. **Two floors stamped** (`src/screens` +8, `src/shell` +8) which are themselves part of
   the staged set, and a `check:stale` that is FRESH only because they were stamped
   before the build. **Anything that re-stamps after a build will red gate 5.**

---

## 10. ADDENDUM — THIS DOCUMENT IS ITSELF IN THE STAGED SET

Section 6 reports the manifest as measured at the moment it was measured: **162 A / 145 M
/ 2 D = 309 paths**. Writing this file added one more untracked path, and `git add -A` was
re-run so that *"stage everything in `C:\Projects\Fit`"* is true rather than nearly true:

```
    163 A
      2 D
    145 M
total: 310
A	app/PUBLISH-GATE.md

=== nothing left unstaged ===
310   (git status --porcelain reports 310 lines, all staged; no ?? entries)
=== HEAD still unchanged ===
95a491341cdab72ba102a681103e4b4a78b0cb08
7
```

**The final staged set is 310 paths: 163 added, 145 modified, 2 deleted.** The only
difference from section 6 is `app/PUBLISH-GATE.md` itself. The two deletions, the
`app/dist` shape, and the gitlink count of 0 are unchanged — re-measured above and
identical.

Both figures are left standing rather than one being edited to match the other: the 309
is what the publish set was when the audit in section 7 walked it (698 paths, 10.32 MiB),
and the 310 is what the index holds now. A reader comparing the audit's universe to the
index needs the first number, not the second.

---

# ADDENDUM — 2026-08-01, s12/a17: THIS AUDIT EXITS 1 ON A CLEAN TREE, AND HERE IS WHY

> **THE WINDOW, STATED FIRST BECAUSE IT IS THE PART A READER MUST NOT LOSE.**
>
> **The finding below was made on 2026-08-01 (s12/a17, at HEAD `bd859e3`). The gate was disabled
> from that moment until it was repaired on 2026-08-01 by s12/a18 (repair recorded in the second
> addendum, below). During that window `node tools/publish-audit.mjs` exited 1 on an untouched
> tree and three of its eight probes did not run at all, and NOTHING REPORTED THAT — CI does not
> run this script; it is invoked only by hand. Two publishes went out while it was in that state.
> The record of a gate having been disabled is part of the gate, so this diagnosis is kept
> verbatim rather than deleted.**

**Everything above this line is the record as it was measured on 2026-08-01 by s12/a7 and is
unedited.** This addendum is appended rather than folded in, because the sections above are a
dated measurement and rewriting a measurement is not a correction. The same rule applies to this
addendum: it is **historical as of the repair**, and it is left standing.

## Read this before you conclude the gate is broken

*(As written on 2026-08-01, before the repair. Superseded — see the next addendum.)*

`node tools/publish-audit.mjs` **exits 1 on the untouched tree, and three of its eight
probes do not run at all.** If you are the next person to run it, you were going to meet a red
with no explanation, and the cheapest thing to do with an unexplained permanent red is to stop
running the instrument. That is the outcome this addendum exists to prevent.

**A GATE THAT CRIES WOLF ONCE IS AN INSTRUMENT. ONE THAT CRIES WOLF PERMANENTLY IS A DISABLED
INSTRUMENT WITH A FILE STILL IN THE REPOSITORY.**

## What the run does, measured at HEAD `bd859e3` before any edit

Five probes fire and pass. Three never execute.

| Probe | Result |
|---|---|
| A1 | **FIRED** — 6 forbidden paths reachable with ignores off, excluded with them on |
| A2 | **FIRED** — the path matcher flags both planted forbidden paths |
| B1 | **FIRED** — all 15 classes detected when planted in a 1,057,512-byte copy of the real `dist` bundle |
| B2 | **FIRED** — the whole-file reader finds a string known to be in `dist` |
| B3 | **FIRED** — a denied value split across two adjacent literals is caught only after joining |
| C1a | **DID NOT RUN** |
| C1b | **DID NOT APPLY** |
| C2 | **DID NOT RUN** |

The universe line from that run:

```
UNIVERSE WALKED: the 700 paths the resulting commit's tree would contain — 0 of them NOT IN
HEAD and so never commit-reviewed, 700 in the index, 0 still untracked, 0 tracked-and-modified,
less 0 deletion(s).
```

And the two failures, verbatim:

```
FAIL: the enumeration reports ZERO paths outside HEAD. This tree is known to carry a large
region that no commit has ever carried, and that region is the highest-risk part of a first
commit. An enumeration that reaches nothing new is vacuous — its clean verdict would be a fact
about an empty list rather than about the tree — so the audit reports that rather than
reporting clean.

FAIL: PROBE C1b DID NOT APPLY: no existing readable text file in the universe is outside HEAD,
so the arm that proves coverage of the set the floor measures has nowhere to plant. The audit
does not report clean on a set it could not probe.
```

## The cause, in one sentence

**The non-vacuity floor became unsatisfiable when everything reached HEAD.** `notInHead` is the
universe minus `git ls-tree HEAD`, and it is legitimately **zero** — there is genuinely nothing
left in this tree that no commit has ever carried. The floor reads that correct zero as a broken
enumeration. One unsatisfiable precondition at `publish-audit.mjs:716` then skips the single
`else` block that contains C1a, C2, the C1b restore assertion and the cleanup verification, which
is why one cause removes three probes.

## The distinction that decides what you should do about it

> **THE AUDIT IS NOT REPORTING A DEFECT IN THE TREE. IT IS REFUSING TO CERTIFY BECAUSE IT CANNOT
> PROVE ITSELF NON-VACUOUS. A REFUSAL TO CERTIFY AND A DETECTION ARE DIFFERENT EVENTS, AND ONLY
> ONE OF THEM IS ABOUT THE REPOSITORY.**

No probe reported a leak. The five that ran covered both path families and all three content
families, and every one of them came back clean.

## This does NOT mean the published tree went out uncertified

Both of these are true and neither may be quoted without the other:

- **The floor was never an invariant.** It was written for a one-off state and asserted
  permanently.
- **That does not impugn what was published.** When this audit ran before the push, 163 paths sat
  outside HEAD, the floor was satisfiable, and all eight probes had targets. **It certified
  validly, and it was made unsatisfiable by the success it certified.**

## The repair is outstanding and is owed before the next push

*(As written on 2026-08-01. It landed the same day — see below.)*

**Repairing this instrument is a known outstanding action, and it must land BEFORE THE NEXT PUSH
TO THIS REPOSITORY.** Nobody should publish twice through a disabled gate. Two things are wrong
with it and they are separate: the vacuity floor above, and a dependency on `app/dist` being
tracked — `:571` fails and `:582` then dereferences `biggestDist.p` on `undefined`, an uncaught
TypeError, now that `app/dist` is ignored. The repair was deliberately kept out of the commit
that carries this addendum, because redesigning the publish gate inside the very commit that gate
audits is a conflict of interest that no amount of care removes.

**The rule this cost us, written down so it is not paid for twice:** *A non-vacuity floor written
for a one-off state becomes unsatisfiable the moment that state passes, and thereafter fails
closed forever.* This file's own subject already forbids the shape — `publish-audit.mjs:404` says
an allow that covers nothing today is a hole waiting for tomorrow's arrival at that site — and the
lock ended up pointed at the instrument that wrote the rule.

---

# ADDENDUM — 2026-08-01, s12/a18: THE REPAIR. THE AUDIT EXITS 0 WITH ALL EIGHT PROBES FIRING

**The addendum above is now HISTORICAL. It is kept, dated and unedited, because the window it
records — the gate disabled from the 2026-08-01 finding until this repair, across two publishes,
with nothing reporting it — is part of what a reader needs in order to trust this file at all.**

## What normal looks like now

`node tools/publish-audit.mjs` **exits 0 on the untouched tree with all EIGHT probes FIRED.** The
five-that-fire list in the addendum above is superseded: **A1, A2, B1, B2, B3, C1a, C1b and C2
must all report FIRED. Fewer than eight is a genuine finding and stops a push.**

| Probe | What it asserts | What it plants | What makes it go red |
|---|---|---|---|
| **A1** | the `/spike/` and `/_spike-evidence/` exclusions are *exclusion*, not blindness | nothing — it re-enumerates with `git add --force`, manufacturing the forbidden paths | forcing ignores off surfaces no `_spike-evidence/` path or no `spike/` path |
| **A2** | the path matcher itself recognises a forbidden prefix | two synthetic paths, `_spike-evidence/SYNTHETIC.md` and `spike/synthetic.js` | fewer than both planted paths come back flagged |
| **B1** | all 15 needle and credential classes are detected in a real artefact — **COVERAGE REDUCED, see below** | one value per class, appended to a temp copy of the least line-structured file in the universe | any class goes undetected in the planted copy |
| **B2** | the whole-file reader genuinely reads — **COVERAGE REDUCED, see below** | a denied value spliced *into the middle of the longest line* of that same subject, in a temp copy | the spliced value is not found, or the subject already contained it (probe did not apply) |
| **B3** | the literal joiner sees a value this app's `'a' + 'b'` style splits across literals | a denied value cut in half across two adjacent string literals in a temp `.ts` file | the raw text already matches (probe did not apply), or the joined text does not |
| **C1a** | the **enumeration reaches, and correctly classifies as outside HEAD, a path no commit has carried** — this is the non-vacuity floor | a denied value in a new untracked file, `app/.publish-audit-untracked-probe.tmp.mjs` | the file does not enter the universe, is not classified outside HEAD, or its value is not reported |
| **C1b** | the content scan covers an existing real file of this repository, not only files the audit authored — **COVERAGE REDUCED, see below** | a denied value appended to the working copy of a deterministically chosen real file, restored byte-for-byte in the same run | the file is absent from the set the arm claims to cover, its value is not reported, or the byte-exact restore fails |
| **C2** | the universe **excludes** what a commit excludes | the same denied value in `app/node_modules/.publish-audit-ignored-probe.tmp.mjs`, confirmed ignored by `git check-ignore` | the ignored plant is enumerated or reported (fires the other way), or git does not agree the path is ignored |

## THE THREE REPAIRS

### 1. The vacuity floor was pointed at a quantity the audited act empties

`notInHead` is the universe minus `git ls-tree HEAD`. **That is not an invariant. It is a
quantity committing drains by construction — 163 before the publish commit, 0 after.** The floor
`notInHead.length === 0 ⇒ FAIL` was therefore structurally incapable of passing after the first
commit it was written to precede.

**The replacement is not the same shape with a different variable. It is a plant, not a census.**
Probe C1a writes `app/.publish-audit-untracked-probe.tmp.mjs`, a path no commit has ever carried,
and requires the enumeration to reach it, the not-in-HEAD derivation to classify it, and the
content scan to catch the denied value inside it. **The subject is manufactured by the audit
during the run**, so its existence does not depend on the repository's history and no commit can
drain it — the next run makes its own. This is the discipline probe A1 already used: force the
ignore rules off to *manufacture* the forbidden paths CHECK A asserts over, rather than requiring
the tree to happen to contain one.

`notInHead` is still derived and still printed on the universe line. It is now **descriptive**.
Nothing fails because it is zero.

**Demonstrated, not asserted** — the audit was run, a commit was made, and it was run again; both
exit codes are transcribed in the worker's report for this action. The size floor
(`universe < 200 paths ⇒ FAIL`) is the only count left, and "this repository has hundreds of
files" is not a quantity committing touches either.

### 2. One unsatisfiable precondition took three probes off the board

`else if (!c1bTarget) { fail(...) }` at `:716` skipped the **only** block containing C1a, C2, the
C1b restore assertion and the cleanup verification. **Nothing is gated on `c1bTarget` any more.**
A missing C1b target is now a C1b failure and nothing else; every other arm runs regardless.

### 3. `app/dist` is a forbidden prefix now, not a blessed one

The operator untracked it: CI builds from source and uploads its own artefact, nothing on the
publish path opens a committed `dist`, and both `.gitignore` files carry the rule and the reason.
So:

- the `:571` floor asserting *"no `app/dist/` file is in the staged universe — dist is committed
  on purpose"* is **deleted**. It was also the immediate cause of the uncaught `TypeError` at
  `:582`, which is why the audit crashed rather than merely failing.
- **CHECK C reversed.** `app/dist/` no longer skips the built-output rules; it is caught by the
  same `dist/` rule as any other bundle, and the rule's own matcher is checked against a synthetic
  `app/dist/` path so a rule that reversed on paper only is a red.

**This is the gate catching up with the repository, not a workaround for a crash.**

## WHAT NOW COVERS LESS THAN IT DID — SAID PLAINLY

A smaller true claim beats an equal-looking false one. Three probes were narrowed, and each says
so on its own line in the audit's own output on every run:

**B1's subject.** Its real subject was never *a large file* — it was **proving the reader survives
a file with NO USEFUL LINE STRUCTURE**, which is why it planted into the minified one-line bundle
(1,056,824 bytes on one line). **That property no longer has a subject at anything like that
scale.** Measured across all 689 files of the universe: the longest single line left is **2,668
bytes**, in `app/public/icons/icon-512.png` — a binary PNG carrying 97.2% of its bytes in one
line. The property survives *qualitatively* and is gone *in scale*: three orders of magnitude
smaller. `package-lock.json` and `design/contrast-report.json` are large but pretty-printed and
line-broken, and **large was never the property** — reporting either as an equivalent swap would
be exactly the substitution this file exists to refuse. B1 now picks its subject by measurement
(greatest single-line length, ties by size then name, so it is reproducible) and prints the
reduction on every run. **B1 no longer proves the reader survives a megabyte-scale single line,
and nothing committed to this repository can prove that any more.**

**B2's control.** It used to look for `sourceMappingURL` in the dist bundle. It now splices a
denied value **into the middle of the longest line** of B1's subject and requires the whole-file
reader to find it — stronger in kind, because it is a plant rather than a lookup of a string
someone believed was there. But at 2,668 bytes a line-oriented reader would reach the same text,
so **B2 proves the whole-file reader works and no longer distinguishes it from a line-oriented
one.** The old dist bundle made that distinction; nothing committed here can.

**C1b's subject.** It used to require its target to be a file **outside HEAD**. That requirement
was the second half of the lock: on a fully committed tree no such file exists, so the arm
reported DID NOT APPLY forever. It now prefers an outside-HEAD target and **falls back to any
readable text file in the universe, reporting which arm it got**. On a tree carrying new material
it proves exactly what it always did. On a fully committed tree — the state today — it proves
coverage of an existing **tracked** file, which is **less**: it no longer proves coverage of
never-commit-reviewed material, because there is none to cover.

## What you must still treat as a real finding

- **Any A-family or B-family red is a genuine finding and stops a push.**
- **Fewer than EIGHT probes firing is a genuine finding and stops a push.**
- **A C2 that fires the other way** — the audit reporting a value planted in an ignored file — means
  its universe is wider than the commit set and its findings are not statements about what
  publishing exposes.
- Anything else that differs from a clean run is a finding.

## The thing this gate still cannot do for you

**CI does not run `publish-audit.mjs`.** It appears only as prose in this document and in the
script itself. That is precisely why it stayed broken across two publishes without anything
reporting it: **a binding enforced by nothing reports compliance by default.** Running it is a
hand step before a push, and it will stay one until something invokes it.

---

# ADDENDUM — 2026-08-02, s12/a19: THE INDEPENDENT REVIEW. THE REPAIR HOLDS, AND IT WAS HIDING A
# LEAK THE AUDIT REPORTED WHEN UNSTAGED AND MISSED ONCE STAGED

**s12/a18's three repairs hold. Every one of them was re-proved here by planting rather than by
reading, and nothing a18 declared as reduced coverage was found to be understated.** The
plant-and-red measurements are in the s12/a19 action record: all fifteen needle and credential
classes were planted one at a time into a real tracked file of this repository and each produced
`exit 1` with `CHECK B` naming that class at that path, and every one of the eight probes plus the
non-vacuity floor, the C1b restore assertion, the cleanup verification and the evidence
precondition was individually broken and observed to go red on its own message.

## THE DEFECT THIS REVIEW FOUND, AND IT WAS OLDER THAN THE REPAIR

**`enumerate()` read the tracked half of the universe with `git ls-files` in its newline form,
which applies `core.quotepath`.** A tracked path carrying a non-ASCII byte therefore came back as
the literal quoted, escaped string `"app/caf\303\251.md"`. That name entered the universe, was
counted on the universe line, and then failed `existsSync` in the scanner — which skipped it **in
silence**, because an unreadable path was a `continue` and the only floor on reading was "at least
90% of the universe".

**Measured 2026-08-02, both directions, with a denied value inside a file named `café-…`:**

| state | universe | scanned | verdict |
|---|---|---|---|
| the file **UNTRACKED** | 690 | 690 | `exit 1` — CHECK B names it |
| the same file **STAGED** | 690 | **689** | `exit 0` — **"publish-audit: clean"** |

**Staging is the only state a publish actually runs in.** The audit reported the leak in the state
nobody publishes from and reported a clean tree in the state everybody publishes from, and the one
number that recorded the difference was a `scanned` count 1 lower than the universe — 99.85%, well
inside the 90% floor. This is the same shape as the finding a18 repaired, one layer down: an
instrument that cannot see is indistinguishable from a subject that is clean.

`ls-tree` and `diff --cached` in the same file already took `-z` for exactly this reason, with a
comment saying so. **This call was the one that was missed.** `git add -n`'s dry-run output does
*not* quote — that was measured, not assumed — so the untracked half of the enumeration was never
affected, which is precisely why the defect was invisible until the tree was staged.

## THE FIX, IN TWO PARTS

1. **`git ls-files -z`, split on NUL.** The tracked half of the universe now carries real path
   bytes.
2. **An unread path in the universe is now a NAMED FAILURE, not a silent skip.** `scanFiles`
   collects every path it could not open and the audit fails listing them. The 90% floor is kept
   underneath it. This is the part that matters more than the first: it converts the *entire
   class* — any future reason a universe path cannot be read — from a silent hole into a red that
   names the path, rather than fixing one cause of it.

**Both parts proven by breaking, not by reading.** With the `-z` reverted and a `café-…` file
staged, the audit exits 1 with:

```
FAIL: 1 of the 690 paths in the universe were NOT READ, so CHECK B's absence claim does not cover them:
  "app/caf\303\251-a19-probe.md" — not on disk under the name the enumeration reported
```

With the fix in place and the same file staged, the audit exits 1 with `CHECK B:
app/café-a19-probe.md — account-linked identifier (raw)`. On the untouched tree it exits 0,
scanning 689 of 689.

## WHAT THIS REVIEW DID NOT CHANGE

- **No probe was weakened and none was removed.** The fifteen-class plant table was re-run after
  the fix and all fifteen still red.
- **`git ls-files -s`** (CHECK D's gitlink listing) still uses the newline form. It parses only the
  mode field, so a quoted path changes the reported *name* and not the detection — recorded here
  rather than changed, because changing it would alter a check this review did not probe.
- **C1b's chosen target is the SMALLEST eligible text file in the universe** (today a 64-byte
  file). That is deterministic and reproducible, which is what it was chosen for, but it is the
  weakest subject inside the tracked set. Recorded, not changed.
- `npm run check:stale` is red locally and was red at `HEAD` before this review touched anything —
  the artefact stamp is `5d2262bd898dd268` against a working tree that hashed to `0e33f37ec423eb79`
  before the edit. It is the pre-existing structural red s12/a23 recorded, not a consequence of
  this change.
