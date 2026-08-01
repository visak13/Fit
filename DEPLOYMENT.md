# Publishing Fit

The published address is **https://visak13.github.io/Fit/** and it does not change. Everything
below either serves that address or is a mistake.

**Nothing in this document has been run against github.com.** It was authored from the local
tree only. The first push to the remote is a separate, deliberate act.

There are two publish paths. **Path A** uses GitHub Actions and is the default. **Path B** is a
local build-and-push that needs no Actions at all, and exists because Actions is exactly the kind
of dependency that is unavailable on the day you need it most.

---

## Before either path: the five-command gate

Run from `app/`, in this order, and do not publish past a red:

```powershell
cd C:\Projects\Fit\app
npm ci
npm run typecheck
npm test
npm run test:shell
npm run test:tools
npm run build
npm run check:stale
```

Two things about this order that have already cost time here:

- **`check:stale` runs AFTER the build**, because it hashes the source tree the build record
  claims to describe. Running it before tells you about the previous build.
- **Test-count floors are stamped before a build, never after.** `check:stale` hashes the tree
  the floor files live in, so a floor stamped after a build makes `dist/` report stale.

`core/sync` sits at zero margin against its floor: one removed or renamed test under `core/sync`
reds the gate.

---

## Path A — GitHub Actions (default)

**File:** `.github/workflows/pages.yml`

On every push to `master` (and on manual dispatch) it checks out the whole project, installs from
the lockfile, runs the five-command gate, builds, and uploads `app/dist` as the Pages artifact,
which a second job deploys.

**One manual setting makes it live:** Settings → Pages → Build and deployment → **Source: GitHub
Actions**. Until that is set, the workflow runs green and publishes nothing.

**What it implies for `base`:** the uploaded artifact's ROOT is what gets served at
`https://visak13.github.io/Fit/`. `app/dist` is uploaded as that root, so `dist/index.html`
becomes `/Fit/index.html` and `dist/assets/...` becomes `/Fit/assets/...`. **`base` stays
`/Fit/`** — unchanged, and `BASE_PATH` in `app/tools/build-config.mjs` is where it is named.

**What it implies for `app/dist`: IT IS NO LONGER IN THE REPOSITORY AT ALL.** As of 1 August 2026
both `.gitignore` files ignore it, and the reason is this path. CI rebuilds from source and
publishes its own output, so a tracked bundle was never the bytes anyone is served — it was
decorative, and a decorative artefact that looks authoritative is worse than an absent one. The
hazard it created was specific: **a fix hand-applied to the committed bundle passes every local
check and every review and still never reaches the coach**, because nothing on this path opens it.

Measured on the live address: the page executes `index-BGG4vweb.js`, while the artefact this
repository used to track was `index-BDreLcB9.js` — same source, different machine, different
bytes. That gap is the whole argument.

`npm run build` still writes `app/dist/` on your machine and `npm run check:stale` still reports
whether that local copy matches local source. Both are now statements about **your machine**, not
about what is published. Nothing is committed as a result of either.

Jekyll does not run on this path — `upload-pages-artifact` serves the artifact as-is — so no
`.nojekyll` file is needed.

---

## Path B — the no-CI fallback: build locally, push `app/dist` to the ROOT of `gh-pages`

This path needs no Actions, no workflow file and no CI service of any kind. Its one requirement
is that this machine can push to the remote unattended, which **d49 already proved live on
2026-07-25**: the bundled Git credential manager holds a working credential, so an unattended
shell can push. Path B is what you use if Actions is unavailable, disabled, or producing a build
you do not trust.

The idea: GitHub Pages can serve a branch's **root**. The application builds to `app/dist`, which
is neither the repository root nor `docs/`. So instead of moving the build, publish the CONTENTS
of `app/dist` as the root of a dedicated `gh-pages` branch. That branch carries the built site
and nothing else — no source, no history entanglement with `master`.

**Run the five-command gate above first.** Then:

```powershell
# 1. A clean, disposable staging directory OUTSIDE the project tree.
#    (C:\fit-a11 is an older scratch tree from a previous step — do not reuse it.)
Remove-Item -Recurse -Force C:\fit-publish -ErrorAction SilentlyContinue
New-Item -ItemType Directory C:\fit-publish | Out-Null

# 2. The CONTENTS of dist become the branch ROOT. Note the \* — dist itself is not copied.
Copy-Item -Recurse C:\Projects\Fit\app\dist\* C:\fit-publish\

# 3. Serving from a BRANCH runs Jekyll unless this file exists. Path A does not need it.
New-Item -ItemType File C:\fit-publish\.nojekyll | Out-Null

# 4. A standalone repository — not a worktree, not a clone. gh-pages carries no shared history
#    with master by design, so it can be force-replaced on every publish without risk to master.
cd C:\fit-publish
git init -b gh-pages
git config core.autocrlf false   # publish the built bytes unmodified; see the caveat below
git add -A
git commit -m "Publish built site"
git remote add origin https://github.com/visak13/Fit.git

# 5. THE ONLY FORCE-PUSH THAT IS EVER CORRECT HERE. It targets gh-pages explicitly.
#    Never force-push master.
git push --force origin gh-pages
```

Then set Settings → Pages → Build and deployment → **Source: Deploy from a branch**, branch
`gh-pages`, folder `/ (root)`.

**What it implies for `base`:** a project page maps the branch root to `/Fit/`. `index.html` at
the branch root is served at `/Fit/index.html`; `assets/` at the branch root is served at
`/Fit/assets/`. **`base` stays `/Fit/`** — identical to Path A. Neither path is a reason to
change `BASE_PATH`, and changing it for either would break the other.

**What it implies for `app/dist`:** on this path your LOCAL build **is** the published site, byte
for byte — the copy step at 2 above reads `app/dist` off your disk. Since `app/dist` is no longer
tracked, that local copy is the ONLY copy, and there is no committed bundle to cross-check it
against. So `check:stale` plus the five-command gate, run in this session immediately before step
2, is the whole of what stands between a stale bundle and the coach. **On this path a green
`check:stale` is not hygiene; it is the evidence.**

**Line-ending caveat, measured on this machine.** `core.autocrlf` is TRUE globally here, and it
has already been observed rewriting a checked-out file's line endings while `git status` reported
the tree clean. Step 4 sets `core.autocrlf false` inside the staging repository so the published
`index.html`, `sw.js` and bundle are the exact bytes the build produced.

---

## Re-publishing afterwards

**Path A.** Commit the SOURCE change and push to `master`. There is no `app/dist` to commit — it
is ignored, and the workflow rebuilds it. The workflow runs the gate, rebuilds and deploys. To
re-publish an unchanged `master`, use the workflow's manual dispatch rather than an empty commit.

**Path B.** Re-run the five-command gate, then repeat steps 1–5 — the staging directory is
disposable and the force-push replaces the branch wholesale. Nothing is committed to `master` as
part of publishing on this path either. **What replaces the old cross-check:** there is no longer
a committed bundle to compare the live site against, so the build you copy in step 2 must be the
build the gate just went green on, in the same session. A `gh-pages` push from a stale working
directory has nothing anywhere that would report it.

**Both paths, every time.** The service worker precaches by build stamp, calls `skipWaiting()`
and `clients.claim()`, and deletes every other cache. A browser that has visited before can still
execute a previous build's entry module while the server serves the new one, silently. When
verifying a publish, clear the service worker and its caches first, and confirm the entry module
the page ACTUALLY EXECUTED matches what the deployed `index.html` names. A green `check:stale` is
not evidence about what the browser ran.

Also: measure offline behaviour through a plain static host, never `npm run preview` — preview
sends `Vary: Origin`, which defeats `caches.match` for the crossorigin module request and paints
a blank screen from a build that is actually fine.

---

## The `spike` branch: what happens to it, and what to do about it

**What it is.** `C:\Projects\Fit\spike` is a SEPARATE git repository nested inside this one. Its
remote is `https://github.com/visak13/Fit.git`, its branch is `spike`, and **it is serving
https://visak13.github.io/Fit/ right now** — a page titled "Fit Platform Spike", which is not this
application. The root `.gitignore` excludes `/spike/`, so nothing you push from `master` carries
that tree.

**Does publishing from master leave it inert, or in the way?**

**Inert, on either path — but only because the Pages source setting moves off it.** Pages serves
exactly one source. Path A moves that source to "GitHub Actions"; Path B moves it to branch
`gh-pages`. In both cases the `spike` branch stops being served the moment the setting changes,
and it stops on its own the moment the address serves the real application. It cannot fight the
new deployment; there is no merge, no path collision, no shared branch.

What it is NOT is harmless. Three things remain true after publishing:

1. The branch still exists on a **public** repository, so its contents stay browsable — a
   throwaway spike presented at the same repository the coach is given.
2. The Pages source is **one settings click** away from pointing back at it. That click serves the
   wrong application at the coach's address, with no error anywhere.
3. Its reason for existing is spent. It was kept deliberately so the address would not 404 during
   the weeks of the build. Once the real application is live, that job is done.

**Recommendation: DELETE the remote `spike` branch — but only after the first publish is verified
serving the real application at https://visak13.github.io/Fit/.**

The ordering is the whole of the reason. `spike` is currently the **only** branch on the remote.
Deleting it before a successful publish leaves the address 404 with no fallback; deleting it after
removes a spent placeholder and closes the one-click path back to the wrong application. Deleting
the REMOTE branch does not touch the local repository at `C:\Projects\Fit\spike`, so the findings
it produced are not lost.

**This is a recommendation only. Nothing here has acted on it.**
