# Platform spike — operator run-book

## What this is, and what it is not

This is a **throwaway probe page**. It is not the fitness app and it contains none of the
app's code. Its only job is to prove — on real hardware, before a single line of the real
application is written — six platform facts that everything else is planned around:

1. The Google sign-in token flow completes **from an installed home-screen launch**, not
   just from a browser tab.
2. A **real Google Meet link** can be minted on a free personal Gmail account.
3. A file can be written to and read back from a **visible Drive folder**.
4. A file can be written to and read back from Drive's **hidden application-data folder**.
5. What the browser actually answers when the app asks for **persistent storage**.
6. Whether a generated **image, CSV and spreadsheet** reach the phone's **share sheet as files**.

Plus a timing measurement: how long **key derivation** takes on the real phone.

**A failure here is a finding, not your problem to solve.** If a probe fails, export the
results blob and hand it back. Do not work around it, do not retry it until it passes, and
do not fix it by loosening anything. The whole point of doing this now is that a "no" is
cheap today and expensive after the app is built on top of a guess. In particular, if
persistent storage is refused or the share sheet rejects a file type, that is a **real
answer we need**, not a bug.

Everything in the page is static: no build step, no npm install, no server, no backend.
You upload five files and open a URL.

---

## The two URLs — they are different strings and it matters

Both come from the same repository, and pasting the wrong one into Google is the single most
common cause of a sign-in failure that looks like nothing else on earth.

| What | Value | Where it goes |
|---|---|---|
| **Page URL** (what you open on the phone) | `https://visak13.github.io/Fit/` | Browser address bar; the QR/link you send yourself |
| **Authorised JavaScript origin** (what Google needs) | `https://visak13.github.io` | Google Cloud → OAuth client → *Authorised JavaScript origins* |

The page URL has the repository name `Fit` as a **path segment**. The authorised origin is
**scheme and host only — no path, no repository name, no trailing slash.** Google's origin
field rejects paths, and if you paste the path-bearing one you will get a sign-in error that
mentions nothing about paths.

You do **not** need to fill in an *Authorised redirect URI*. This page uses the browser token
flow, which uses the origin only. Leave redirect URIs empty.

---

## Step 0 — files and the branch (already mostly done)

The repository already exists: **`github.com/visak13/Fit`**. Gate one is cleared.

The spike is published from a branch named **`spike`**, not from `main`. That is deliberate
containment: when this step closes the whole branch is deleted and the real app's history is
never polluted by throwaway code. **Do not be surprised to find `main` empty of these files —
that is correct.**

Five files go to the root of the `spike` branch — and **only** these five. `RUNBOOK.md` is for
you and does not need to be published.

```
index.html
manifest.webmanifest
sw.js
icon-192.png
icon-512.png
```

> **This machine cannot do it for you.** There is no `gh` CLI installed here, no
> `GITHUB_TOKEN`, and no git credential helper configured. Creating the branch and pushing is
> yours to do (or you supply credentials and someone here does it). Nothing has been faked:
> if you have not pushed, nothing is deployed.

If the repository does **not** already exist, create it first: <https://github.com/new> →
owner **visak13**, repository name **Fit**, visibility **Public**, add no README and no
`.gitignore` → **Create repository**.

Then, in a terminal on this machine, run these in order from `C:\Projects\Fit\spike`:

```
cd C:\Projects\Fit\spike
git init
git checkout -b spike
git add index.html manifest.webmanifest sw.js icon-192.png icon-512.png
git commit -m "platform spike probe page"
git remote add origin https://github.com/visak13/Fit.git
git push -u origin spike
```

If `git init` reports the folder is already a repository, skip that line and carry on. If
`git remote add` says the remote already exists, skip that line too. The push will ask for
your GitHub username and a **personal access token** as the password — a normal account
password will be rejected.

The repository is **public**. Nothing in these five files contains a credential, a client id,
any client data or any real person's name — the client id field is deliberately empty and you
paste your own at run time. Keep it that way: **never commit your client id.**

### Enable Pages

A new repository does **not** serve Pages by default. In the repository:

**Settings → Pages → Build and deployment → Source: "Deploy from a branch" → Branch: `spike`,
folder `/ (root)` → Save.**

Give it a minute or two. Then open `https://visak13.github.io/Fit/` in a laptop browser and
confirm you see the dark page headed **Fit — platform spike** (the browser tab itself reads
**Fit Platform Spike**). You do not need this to be live before creating the client id (next
step) — but you do need it live before running any probe.

---

## Step 1 — Google Cloud: enable the two APIs FIRST

This is the step people skip, and skipping it produces the most misleading failure in the
whole exercise: **the client id works, sign-in succeeds, the consent screen appears, and then
every single probe fails** with a message about the API not having been used in the project.
Sign-in working makes it feel like configuration is finished. It is not.

1. Go to <https://console.cloud.google.com/>.
2. Create a project — any name, e.g. `fit-spike`.
3. Open **APIs & Services → Library**.
4. Search **Google Drive API** → open it → press **Enable**.
5. Search **Google Calendar API** → open it → press **Enable**.
6. Confirm **both** now show **"API enabled"** before continuing.

## Step 2 — consent screen (the console has moved these controls)

> **Read this before you start looking for things.** The newer Google Cloud console no longer
> keeps everything on one "OAuth consent screen" page. The two controls you need now live in
> their own sections in the left-hand menu:
>
> | What you are looking for | Where it actually is now |
> |---|---|
> | The scopes | a section named **Data access** |
> | The test users | a section named **Audience** |
>
> If you go hunting for these on a consent screen and cannot find them, **you have not broken
> anything** — they have simply been moved. Use the section names above.

### 2a — set publishing status to Testing FIRST

Do this **before** you try to add a test user, because it is what makes the test-user list
exist at all.

1. Open **APIs & Services → OAuth consent screen → Audience**.
2. Look at **Publishing status**.
3. **If it says "In production", press "Back to testing".** New projects frequently default
   straight to Production.
4. Confirm the status now reads **Testing**.

> **Why this order matters.** While the app is **In production there is no test-users list on
> the page at all** — not empty, *absent*. So the next step, "add yourself as a test user",
> reads as impossible to follow. If you cannot find the test-users section, that is the reason,
> and **nothing is broken and you have done nothing wrong**: the app is in Production and needs
> returning to Testing, after which the section appears.

### 2b — fill in the app details

1. Open **APIs & Services → OAuth consent screen** (the **Branding** / overview section).
2. User type: **External**.
3. App name, user support email, developer contact email — anything sensible; this is a
   private tool.
4. Save.

### 2c — add yourself as a test user

1. Open **Audience** (the same section as 2a).
2. Under **Test users**, press **Add users**.
3. Type the **exact Gmail address** you will sign in with on the laptop and the phone.
4. Save, and confirm the address is listed.

> If you skip this, **every probe fails at sign-in** with an access-denied error that has
> nothing to do with the platform and nothing to do with our code. This is the second most
> common cause of a wasted run. (If the section is not there, go back to **2a** — you are in
> Production.)

### 2d — add the scopes

1. Open **Data access**.
2. Press **Add or remove scopes**.
3. Add the three scopes listed under Step 3 below — and only those three.
4. **Update**, then **Save**.

They are all "sensitive" or narrow — none requires a security assessment at this scale, and no
verification process is being pursued.

## Step 3 — the OAuth client

1. Open **APIs & Services → Credentials**.
2. Press **Create credentials → OAuth client ID**.
3. Application type: **Web application**. (This is forced. A GitHub Pages `https://` origin
   can only be registered on a Web application client — there is no "browser app" type that
   avoids it.)
4. Name: anything.
5. Under **Authorised JavaScript origins**, press **Add URI** and enter exactly
   `https://visak13.github.io` — host only, no `/Fit`, no trailing slash. See the table at
   the top.
6. Under **Authorised redirect URIs**, **add nothing**. Leave it empty.
7. Press **Create**, then **copy the client id** that is shown.
8. Keep it somewhere you can paste from on **both** the laptop and the phone — a note to
   yourself, a message to yourself. **Do not put it in a file in the repository and do not
   commit it anywhere.** It is typed into the page's own field at run time and stays on the
   device.

You can do this **now, in parallel** with the deployment — Google only requires the origin to
be a well-formed `https` origin and does not check that anything is actually served there.
What must be live before you **run** a probe is the page itself.

### The scopes, and which probe needs which

| Scope | Needed by |
|---|---|
| `https://www.googleapis.com/auth/calendar.events` | **Probe 2** (Meet link via a Calendar event) |
| `https://www.googleapis.com/auth/drive.file` | **Probe 3** (visible Drive folder + file) |
| `https://www.googleapis.com/auth/drive.appdata` | **Probe 4** (hidden application-data folder) |
| *(none)* | **Probes 5 and 6** and the key-derivation timing — pure browser, no Google |

Exactly **three** scopes, requested together at Probe 1 so there is one consent prompt for
the whole run. There is deliberately **no sign-in identity scope** (`openid`, `email`,
`profile`): this spike *authorises*, it does not *identify*, and no email address is collected
anywhere.

Probe 1 reports the scopes Google actually **granted**, not the ones we asked for. If one is
missing there, the probe that needs it will fail for that reason — check this list before
concluding a platform limit.

---

## Step 4 — laptop pre-flight (do this before touching the phone)

Catch misconfiguration somewhere convenient. On the laptop, at
`https://visak13.github.io/Fit/`:

1. The **Environment** card will show an amber **BROWSER TAB** badge. That is expected and
   correct here — this run is a pre-flight, not evidence for fact 1.
2. Paste your client id into the **Client id** field and press **Save client id**. It is
   stored only in this browser on this device.
3. Press **Run Probe 1 — get access token**. Accept the consent screen. You should get a
   green or amber badge and see `grantedScopes` listing your three scopes.
   - Amber **PARTIAL** here is normal: the page correctly refuses to call a browser-tab run
     proof of the standalone fact.
4. Press **Run Probe 2 — mint a Meet link**, **Run Probe 3 — Drive folder + file**, and
   **Run Probe 4 — appDataFolder** in that order. Confirm each turns green.
5. Press **Run Probe 5 — request persistence** and **Run key-derivation timing**.
6. Press **Check capability (all three)** in Probe 6. On a laptop the share sheet often does
   not exist at all — that is fine, Probe 6 is a phone probe.
7. Press **Clear results** when you are done. The phone is what counts, and you do not want
   laptop numbers mixed into the blob you hand back.

**Clean-up from the pre-flight:** Probe 2 creates a **real event** on your Google Calendar
titled *"PLATFORM SPIKE — safe to delete"*, and Probe 3 creates a **real folder** in your
Drive named *"Fit Spike \<timestamp\>"*. Both are harmless and both are yours to delete. The
event id and folder id are in the results blob if you want to find them.

---

## Step 5 — install to the phone home screen

This is the step fact 1 is actually about. A browser tab proves nothing here: the popup and
storage behaviour genuinely differ in an installed launch, which is why we are testing it.

Open `https://visak13.github.io/Fit/` in the phone's browser, then:

**Android (Chrome):** the **⋮** menu → **Add to Home screen** (it may say **Install app**) →
confirm.

**iPhone (Safari — it must be Safari, not Chrome):** the **Share** button in the toolbar → scroll
down → **Add to Home Screen** → **Add**.

Then **close the browser entirely and launch the app from the home-screen icon.**

**Before running any probe, check the Environment card says a green `STANDALONE`.** If it
says amber `BROWSER TAB`, you are still in the browser and the run will not prove fact 1.
Press **Install hint** on that card for the gesture again, and **Re-check environment** after
launching from the icon.

---

## Step 6 — run the probes on the phone, then return the blob

Each probe is independently tappable and records its own verdict, so a failure never blocks
the rest. Run them in this order; every one is safe to re-tap.

1. Paste the client id into **Client id** → **Save client id**. (It does not carry over from
   the laptop — different device, different storage.)
2. **Run Probe 1 — get access token.** Expect green. Watch for whether the consent popup
   behaves itself from the installed app; that is the fact under test.
3. **Run Probe 2 — mint a Meet link.** This takes a few seconds and shows *"inserted — now
   polling"* first. When it finishes, the evidence contains a `pollTranscript` and a `meetUrl`.
   **Open that URL in a browser and confirm it is a real, joinable Meet room.** The URL is read
   from Google's returned video entry point and is never assembled by us — but a human eye on
   the actual link is the last defence against a false pass, so please use it.
4. **Run Probe 3 — Drive folder + file.** Expect `byteForByteMatch: true`.
5. **Run Probe 4 — appDataFolder.** Expect `byteForByteMatch: true` and
   `writtenFileAppearsInListing: true`.
6. **Run Probe 5 — request persistence.** Whatever it says is the answer. If it records
   `FAIL` because the browser returned `false`, **leave it** — that is the finding.
7. **Check capability (all three)** in Probe 6, then share each artefact separately:
   **Share PNG**, **Share CSV**, **Share XLSX**, and optionally **Share all three at once**.
   They are separate buttons on purpose: the platform decides by the file's declared type, not
   its contents, so a phone can accept an image and refuse a spreadsheet. We need each answer
   individually. For each one, actually send it somewhere (Files, Drive, WhatsApp, yourself)
   and **open it** to confirm it arrived intact — the `.xlsx` should open in a spreadsheet app.
   Then type what happened for each into the box labelled **"What did you actually observe?
   (goes into the results blob)"** and press **Save observation**.
   *No API can tell us whether a shared file landed somewhere usable; your sentence is the only
   evidence that exists.* If sharing is unavailable, **Download all three instead** and report
   that.
8. **Run key-derivation timing.** It deliberately takes a few seconds and will feel like the
   page has frozen. Let it finish.
9. Type anything surprising into **Operator notes**.
10. **Copy results JSON**, or **Share results**, or **Download results** — whichever is
    easiest to get off the phone — and send the blob back. That blob is the deliverable of
    this entire exercise.

Repeat step 6 on the second phone if both an iPhone and an Android device are available; the
two platforms differ most on probes 5 and 6, which is exactly where the app's design has to
absorb the difference.

---

## Troubleshooting — the things that actually go wrong

**The live URL returns 404 even though the push worked.**
Pages is not enabled. It is not on by default for a new repository. Go to
**Settings → Pages**, set **Source** to *Deploy from a branch*, choose branch **`spike`** and
folder **`/ (root)`**, and save. Wait a minute and reload. If you see the repository's file
list instead of the page, you are looking at `github.com`, not `visak13.github.io`.

**Every probe fails with something about the API not being used or not enabled in the project.**
The Drive API and/or the Calendar API is not enabled. Sign-in succeeding does **not** mean
configuration is finished — that is exactly why this failure is so convincing. Go back to
**Step 1** and enable both, then re-run Probe 1.

**Sign-in fails with access denied / "app is not verified" blocks you.**
The account you signed in with is not on the **test users** list. Add that exact address
(Step 2c) and try again. This is not a platform limitation.

**You cannot find the test-users list at all.**
The app is in publishing status **In production**, and in that state the list does not exist
on the page. Nothing is broken. Go to **Audience**, press **Back to testing**, and the section
appears (Step 2a).

**You cannot find the scopes or the test users on the "OAuth consent screen".**
The newer console moved them: scopes are under **Data access**, test users are under
**Audience**. See the table at the top of Step 2.

**Sign-in fails mentioning the origin, or "redirect_uri_mismatch", or nothing happens at all.**
Origin mismatch. The authorised JavaScript origin must be exactly `https://visak13.github.io`
— **no** `/Fit`, no trailing slash. Also confirm you are opening the page over `https://` on
the `github.io` host, not a local file. Origin changes can take a few minutes to take effect.

**Probe 1 times out saying the popup was probably blocked.**
The popup was blocked, dismissed, or opened behind the app. Allow popups for the site and
re-tap. On iOS, make sure you installed from **Safari** — a home-screen icon added from Chrome
on iOS behaves differently. If the popup genuinely cannot complete from the installed app,
**that is fact 1 failing and it is a major finding** — export the blob and report it rather
than falling back to the browser tab.

**Probe 2's create request never leaves `pending`.**
The evidence shows a `pollTranscript` with 20 attempts and a final status still `pending`.
This is bounded on purpose and is reported as a `FAIL` rather than retried forever. Check the
Calendar API is enabled and that `allowedConferenceSolutionTypes` in Probe 1's evidence
includes `hangoutsMeet`. If it persists, it is a finding about personal accounts and Meet —
report it. Do **not** try to construct a Meet URL by hand; a hand-made URL looks perfectly
correct and proves nothing, which is the exact false pass this spike exists to prevent.

**A probe says there is no access token.**
Tokens are held in memory only and are never stored, so they do not survive a reload or a
relaunch. Re-tap **Run Probe 1** and then the probe you wanted. This is expected behaviour,
not a defect: the app has no refresh token by design and re-acquires access in the foreground.

**A Drive probe fails with a permissions error.**
Check `grantedScopes` in Probe 1's evidence. If `drive.file` or `drive.appdata` is missing,
the consent screen does not carry it (Step 2) or you declined it at the prompt.

**Results vanished.**
They are kept in the installed app's local storage. Deleting the home-screen icon or clearing
site data destroys them — export the blob before doing either. (That behaviour is itself
relevant to the real app, and it is why Drive backup is load-bearing there.)

---

## One thing worth knowing for later

The spreadsheet artefact in Probe 6 is a **genuine `.xlsx` workbook**, not a CSV wearing a
spreadsheet name. It was expected that producing a real workbook in the browser would need a
third-party library — which the no-build constraint forbids — and that turned out to be false:
a minimal OOXML package is just a store-only ZIP, and the writer is about sixty lines of plain
code inside `index.html`. It was verified by extracting the generated file and reading the
worksheet back out.

That matters beyond the spike: the app's diet charts and progress reports can ship as real
spreadsheets under the absolute no-build, no-backend constraint, instead of degrading to CSV.
Anyone reading this later should not repeat the assumption that a library was required.
