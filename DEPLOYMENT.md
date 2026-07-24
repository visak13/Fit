# Spike deployment record

Status: **LIVE and proven by fetch.** Written 2026-07-25 by the s1:a3 worker shell.

This file records how the throwaway platform-spike probe page was published, and the
transcript proving the published URL actually serves that page. It is not a deployment
guide for the real application — the real app is deployed separately and later.

---

## 1. The two URLs. They are different strings. Do not interchange them.

Confusing these two is a classic cause of an unexplained Google sign-in failure, so both
are written out here in full and labelled.

| What | Value |
| --- | --- |
| **Live page URL** — open this on the phone, install it from here | `https://visak13.github.io/Fit/` |
| **Authorised JavaScript origin** — paste this into the Google OAuth client | `https://visak13.github.io` |

- The **live page URL** carries the `/Fit/` path, because this is a GitHub *project* site
  and the repository name becomes the path segment. Requesting it without the trailing
  slash (`https://visak13.github.io/Fit`) answers `301` to the trailing-slash form; that
  redirect is normal for a directory root and is a success, not a fault.
- The **authorised JavaScript origin** is scheme and host **only**. It has **no path**
  (no `/Fit`) and **no trailing slash**. A browser origin is by definition scheme + host
  + port, so Google will reject or silently mismatch anything with a path appended.
  This is the value that goes in the OAuth client's *Authorised JavaScript origins* field.
- There is no redirect URI to configure: the Google Identity Services token model
  (`initTokenClient`) is used, which does not take a redirect URI.

## 2. What is serving it

| Item | Value |
| --- | --- |
| Repository | `https://github.com/visak13/Fit` (**public**, by the user's explicit decision) |
| Branch serving Pages | **`spike`** |
| Pages source folder | `/ (root)` — the page files sit at the **branch root**, not under a `spike/` sub-directory, which is why the served path is `/Fit/` and not `/Fit/spike/` |
| Commit published | `ad3eaf5` — *"Platform spike probe page (throwaway; delete with the spike branch)"* |
| Files published | `index.html`, `sw.js`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `RUNBOOK.md`, `.nojekyll` |
| `main` branch | **untouched**. It contains none of the spike, so the whole `spike` branch can be deleted without disturbing anything the real app will need. |

`.nojekyll` was added so GitHub serves the directory verbatim rather than running the
files through Jekyll.

### Nothing sensitive is in the published source

The repository is public, so before committing, the files were scanned for credentials,
OAuth client ids, client secrets, API keys, e-mail addresses, real client data and real
personal names. **None were found.** The only matches for client-id-shaped patterns were
the UI label `Client id (ends in .apps.googleusercontent.com)` and the `localStorage` key
name `fitspike.clientId` — both are labels, neither is a value. The operator types their
client id into a field on the page at run time and it stays in that browser's
`localStorage`; it is never committed, never pre-filled and appears as a literal nowhere.

## 3. How the publish was performed, and by whom

1. **Agent (this worker shell)** — initialised `C:/Projects/Fit/spike` as a git repository
   directly on a branch named `spike`, added `.nojekyll`, committed all page files, and set
   `origin` to `https://github.com/visak13/Fit.git`.
2. **Agent** — `git push -u origin spike`. **This succeeded with no credential needed from
   the user.** The plan's grounding brief had recorded that this machine has no `gh` CLI,
   no `GITHUB_TOKEN` and no configured credential helper, and therefore anticipated that
   the push would have to be handed to the user. That turned out to be over-pessimistic for
   the push specifically: Git for Windows' bundled Git Credential Manager held a working
   cached credential for the account. Recorded here because the same assumption will
   otherwise be re-made when the real application is deployed.

   For anyone auditing this later, and it matters because the repository is public:
   **no credential, token or password was ever handed to, typed into, or stored by an
   agent shell.** The push was authorised entirely by the operating system's existing
   credential store acting on the user's behalf; the shell never saw the secret, and no
   secret was written to any file in this repository or anywhere else on disk.
3. **User (human gate, unavoidable)** — enabled GitHub Pages in the repository web UI:
   *Settings → Pages → Build and deployment → Source: "Deploy from a branch" → Branch:
   `spike`, folder `/ (root)` → Save.* This step genuinely cannot be done from a shell
   here: it needs either the GitHub web UI or an authenticated GitHub API call, and no API
   token exists on this machine.
4. **Agent** — polled the live URL and verified the result (transcript below).

**Pages was not enabled by default.** Immediately after a clean push, the URL returned
`404` with GitHub's own page titled *"Site not found · GitHub Pages"* containing the text
*"There isn't a GitHub Pages site here"*. That is specifically the response GitHub serves
when Pages has never been configured for a repository — it is not an ambiguous error and
it does not indicate a failed push. Naming that cause precisely is what turned the block
into a single click. First publish then took roughly 7½ minutes from Save to serving.

**No workaround was taken and none was needed.** No server, no serverless function, no
proxy, no alternative host, not even temporarily — consistent with the settled
static-GitHub-Pages-only decision.

## 4. Proof that the URL is live — fetch transcript

Captured 2026-07-25. Verification deliberately does **not** rest on the status code alone,
because a placeholder, a stale cache or a repository listing can all return `200`.

### 4a. The request, following redirects

```
$ curl -sS -L -o fitA.html -w "..." https://visak13.github.io/Fit
final_url=https://visak13.github.io/Fit/
http_code=200
num_redirects=1
size_download=63875
content_type=text/html; charset=utf-8
```

### 4b. The redirect, shown explicitly as the expected 301

```
$ curl -sS -o /dev/null -w "no_follow_code=%{http_code} redirect_to=%{redirect_url}" https://visak13.github.io/Fit
no_follow_code=301 redirect_to=https://visak13.github.io/Fit/
```

### 4c. Response headers on the canonical (trailing-slash) URL

```
$ curl -sSI https://visak13.github.io/Fit/
HTTP/1.1 200 OK
Server: GitHub.com
Content-Type: text/html; charset=utf-8
Content-Length: 63875
Last-Modified: Fri, 24 Jul 2026 23:32:45 GMT
Access-Control-Allow-Origin: *
ETag: "6a63f61d-f983"
Cache-Control: max-age=600
X-GitHub-Request-Id: C370:2AD3BE:649EC:74F23:6A63F627
```

`Server: GitHub.com` confirms GitHub Pages is serving it.

### 4d. It is byte-for-byte the committed page, not merely *a* page

```
served  sha256: d632132658ab7c15234fdb3aaa832eabe0bba332ec658b6a4b959470c337ec67
local   sha256: d632132658ab7c15234fdb3aaa832eabe0bba332ec658b6a4b959470c337ec67
```

Identical hashes over all 63,875 bytes. What is served is exactly what was committed.

### 4e. Content assertions — it is the probe page specifically

`<title>` is `Fit Platform Spike`. Every one of these markers was found in the served body:

```
FOUND: Probe 1
FOUND: Probe 2 — real Meet link (personal Gmail)
FOUND: conferenceDataVersion
FOUND: entryPoints
FOUND: navigator.storage.persist
FOUND: canShare
FOUND: appDataFolder
FOUND: fitspike.clientId
FOUND: manifest.webmanifest
```

Negative checks also pass: the body contains **no** `"There isn't a GitHub Pages site here"`
or `"Site not found"` marker, and is **not** a directory listing.

### 4f. Every sub-asset the installed launch needs also serves, with correct MIME types

```
manifest.webmanifest   code=200 type=application/manifest+json; charset=utf-8 bytes=710
sw.js                  code=200 type=application/javascript; charset=utf-8 bytes=2456
icon-192.png           code=200 type=image/png                bytes=498
icon-512.png           code=200 type=image/png                bytes=2090
.nojekyll              code=200 type=application/octet-stream bytes=0
```

The correct `application/manifest+json` and `application/javascript` types matter: a wrong
MIME type on either would break installability or service-worker registration, and would
have looked like a platform failure rather than a hosting one.

### 4g. Sub-path serving was confirmed sound, not assumed

Serving from a repository sub-path (`/Fit/`) rather than a domain root is exactly where a
PWA install breaks silently. The planner independently checked the page's paths before
deployment and confirmed all of them are **relative**: the manifest's `start_url` is
`./index.html`, its `scope` is `./`, the manifest `<link>` is relative, and the service
worker is registered by a relative name. The live manifest fetched above confirms this.
Had any been rooted at the origin (`/index.html`, `/`), the installed app would have
pointed at the account root and the standalone sign-in fact would have failed for a
packaging reason that would have been misread as a platform limitation.

## 5. What to delete when this step closes

The spike is throwaway. Only its recorded findings survive. On closing step s1, delete
**all** of the following:

1. The **`spike` branch** on GitHub, in its entirety:
   `git push origin --delete spike` (or delete it in the repository's branches UI).
   Because `main` never received any spike file, deleting the branch removes the whole
   spike from the repository with nothing left behind.
2. The **GitHub Pages configuration** pointing at that branch — *Settings → Pages* — since
   the source branch will no longer exist. Re-point it at whatever the real application
   uses, or disable it until then.
3. The local directory **`C:/Projects/Fit/spike`**, including its own nested `.git`. That
   nested repository must not survive into the real application's repository at
   `C:/Projects/Fit`.
4. The installed **home-screen icon** for the spike on any phone it was installed to, plus
   its site data.

Also revisit the Google OAuth client afterwards: the authorised origin
`https://visak13.github.io` stays valid for the real app (it is host-only, so it does not
change when the path changes from `/Fit/` to whatever the app uses under the same
repository), but confirm that rather than assuming it if the repository is ever renamed.
