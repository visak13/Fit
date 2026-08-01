# The handover — putting this app in the coach's hands

**Who this is for: you, the person handing it over.** It is not a document to send him. It is the
order you do things in, and the checklist you keep open on the video call.

He is not in the room and never will be — you two live far apart. So the handover has exactly three
parts, and they happen in this order: you install it and drive it once yourself, he installs it,
then you walk him through his own Google setup over a video call. Doing the third before the first
is how you end up debugging your own app live, in front of somebody, on his phone.

**The address is `https://visak13.github.io/Fit/`.** Everything below assumes that address.

---

## 1. Install it to your own iPhone home screen

Open `https://visak13.github.io/Fit/` **in Safari** — not Chrome, not an in-app browser inside a
message. Safari is the only browser on iOS that can add a web app to the home screen; the others
draw the same button and it makes a bookmark instead.

Share button → **Add to Home Screen** → Add. Then **close Safari completely** — swipe it away in the
app switcher, do not just go to the home screen. Tap the new icon.

**What you should see:** it opens in its own window, with no address bar and no browser buttons
along the bottom. The destinations read **Clients, Calendar, Routines, Diet, Admin**.

**If you can still see an address bar, it did not install as an app**, and everything after this
point is being tested against a browser tab. Delete the icon and do it again from Safari.

Installing to the home screen is not decoration. iOS deletes a website's stored data after seven
days without a visit; a home-screen web app is exempt from that. A coach who keeps this as a Safari
tab will come back after a fortnight to an app that has forgotten his clients and has to be
re-signed-in and re-pulled from Drive. **Both of you install it properly, or the storage promise is
not one this app can keep.**

## 2. Drive it once yourself, before he ever sees it

Once, end to end, on your own phone and your own Google account. Not a smoke test — a real pass, in
the order he will meet it.

`app/DEVICE-WALK.md` is the full sheet with a result box per item, and it is the thing to actually
run. The short version of what you must not skip:

1. Install to the home screen and launch from the icon (above).
2. Open it once online, then put the phone in **aeroplane mode** and run a whole session offline.
3. Add a client, start a session, and let the app make a real meeting link on a real calendar.
4. Back up to Drive, then read the backup state on a second device.
5. Note the **Build code** from **Admin → This build**, so you can tell his copy from yours on the
   call.

**One correction to carry into that sheet: measure offline behaviour on a plain static host, never
through `npm run preview`.** Preview sends a `Vary: Origin` header that defeats the cached module
lookup, so a cold offline start through it paints a blank screen — twice — while the same build from
an ordinary static host starts fully offline. The blank screen is the instrument, not the app.

**That correction is now IN `DEVICE-WALK.md`, under B1.** An earlier note here said DEVICE-WALK.md's
preamble named preview and was wrong about this; it did not, and the note sent you to the wrong
file. The preamble that DOES still reach for preview is `app/tools/walk-preamble.mjs` — the module
a *walk worker* runs, not the sheet a *person* runs — and it is the one place the correction could
not be applied, because `tools/` is hashed into the build stamp and editing it would report the
committed `dist/` as stale with no rebuild permitted. It already carries the correction as a
section of its own, and its procedure points at that section; what it does not do is lead with it.

**Why you go first:** the first person through will meet whatever is actually broken. That should be
you, on a quiet afternoon, not him on a call with a client waiting.

## 3. His Google setup — the app already contains the guide

**Do not write the Google steps out again, here or in a message to him.** They live inside the app,
at **Setup** (`https://visak13.github.io/Fit/#/setup`), where every step's title is a live link
straight to the exact Google page it is about.

That page is the only copy. It is dated, its links were re-measured on the date it shows, and the
two console traps that cost people an afternoon are written on it with their causes named. A second
copy in a document is a copy that goes stale silently, and he cannot tell which of the two is the
current one.

What you need to know, so that you can say it in your own words on the call:

- **Two Google APIs get switched on: the Drive API and the Calendar API.** Those are the two this
  application actually calls. That is the whole list.
- **The sign-in screen ends up PUBLISHED.** He is not adding himself as a test user, and there is
  nothing for him to add himself to. A project left in testing expires his sign-in after a week, and
  what he would see is the app signing him out for no reason he can point at.
- **There is no client secret.** The page that shows his client id offers one as well. He copies the
  client id only.
- **The authorised JavaScript origin is `https://visak13.github.io`** — the site name and nothing
  after it. No folder, no trailing slash. The Setup page renders it as copyable text; he copies it
  rather than typing it.

The two values he ends up pasting into Setup are his **Google client id** and, if he wants one, his
**coaching calendar id**. Leaving the calendar id empty is a working state, not an unfinished one:
sessions land on his main Google calendar instead.

---

## 4. The video-call checklist

Keep this open on the call. Have him share his screen — you cannot diagnose what you cannot see, and
this is the one hour where that matters.

**Before the call**

- [ ] You have completed sections 1 and 2 on your own phone, and you know your **Build code**.
- [ ] You have the Setup page open on your machine, so you are reading the same words he is.
- [ ] He is at a computer, not only on the phone. The Google console is unusable on a phone screen.
- [ ] He is signed in to Google in that browser, in the account he wants the app to use.

**Confirm two-factor authentication on his Google account — do this first, not last**

- [ ] He opens `https://myaccount.google.com/signinoptions/twosv` and confirms 2-Step Verification
      is **On**, with a second step he actually has to hand (phone prompt, passkey, or an
      authenticator app).
- [ ] If it is off, he turns it on **now, before anything else on this call**. Turning it on later
      means re-testing the app's sign-in afterwards.
- [ ] He notes down his recovery options, because he is about to make this account the only place
      his client records exist.

Say the reason plainly rather than as a security slogan. His data is stored in his own Google Drive,
which is why you never hold a copy of it — and the exact consequence of that is that **anyone who
can sign in to his Google account can read what is in there, including his clients' notes.** The
second step on that account is the control that stands between them. That is what 2FA does here; it
is not a claim that the app is safe or private.

**Walk him through the setup, in this order**

- [ ] He installs the app to his own home screen from Safari — same steps as section 1 — and
      launches it from the icon, not from Safari.
- [ ] He opens **Setup** in the app and works down the numbered steps, ticking as he goes. You read
      along; you do not read them out. He clicks each title.
- [ ] Google Cloud project made.
- [ ] Drive API switched on. Calendar API switched on. **Those two, and nothing else.**
- [ ] Sign-in screen configured and **published**.
- [ ] Web client id created, with `https://visak13.github.io` as the authorised JavaScript origin.
- [ ] Client id pasted into Setup and saved. The field tells him whether it has the shape of a
      client id — that is a shape check, not proof it is the right one.
- [ ] **He signs in to Google from the app once, while you are watching.** This is the only thing
      that proves the client id is right. Until it has worked once, everything above is just what he
      typed.
- [ ] If he wants a separate coaching calendar: he makes one, then copies the id from **that
      calendar's own settings** — not the general settings — and pastes it into Setup. See the note
      on that link in section 5; signed out it does not go where its title says.
- [ ] He starts a session with an online client and gets a **real meeting link**. That is the only
      thing that proves the calendar id.
- [ ] He runs one backup to Drive and sees the backed-up time change.

**Before you hang up**

- [ ] He has run one whole session end to end, on his own phone, with his own account.
- [ ] He has read the **Admin** screen once, so the first time he sees it is not the day something
      is wrong.
- [ ] He knows that a sign-in lasts about an hour and is not durable: the app will ask him to tap to
      reconnect, and that is normal operation rather than a fault.
- [ ] He knows backup happens when he opens the app, when he leaves it, and when he asks — and never
      on its own in the background.
- [ ] He has your number for the first week.

---

## 5. Every link in this document and on the Setup page, measured

Measured **1 August 2026**, signed out, with a browser user agent and a cookie container carried,
inspecting the redirect **without following it**. The last column is the only one that matters:
answering is not arriving.

| Link | Where it is | Code | Unfollowed redirect target | Arrives at what the title names? |
|---|---|---|---|---|
| `https://visak13.github.io/Fit/` | this doc, section 1 | 200 | — | Yes |
| `https://visak13.github.io/Fit/#/setup` | this doc, section 3 | 200 | — | Yes — a fragment of the address above, so the server answers it identically and the app routes it |
| `https://myaccount.google.com/signinoptions/twosv` | this doc, section 4 | 302 | `accounts.google.com/ServiceLogin?...&continue=https://myaccount.google.com/signinoptions/twosv` | Yes — signs him in and lands on the 2-Step Verification page |
| `https://console.cloud.google.com/projectcreate` | Setup, step 1 | 302 | `accounts.google.com/ServiceLogin?service=cloudconsole&...&continue=<same deep path>` | Yes |
| `https://console.cloud.google.com/apis/library/drive.googleapis.com` | Setup, step 2 | 302 | **itself** — `console.cloud.google.com/apis/library/drive.googleapis.com` | Yes — one self-redirect, then 200, page titled *Google Cloud console* |
| `https://console.cloud.google.com/apis/library/calendar-json.googleapis.com` | Setup, step 3 | 302 | **itself** — `console.cloud.google.com/apis/library/calendar-json.googleapis.com` | Yes — one self-redirect, then 200, titled *Google Cloud console* |
| `https://console.cloud.google.com/apis/credentials/consent` | Setup, step 4 | 302 | `accounts.google.com/ServiceLogin?service=cloudconsole&...&continue=<same deep path>` | Yes |
| `https://console.cloud.google.com/apis/credentials` | Setup, step 5 | 302 | `accounts.google.com/ServiceLogin?service=cloudconsole&...&continue=<same deep path>` | Yes |
| `https://console.cloud.google.com/auth/audience` | Setup, both console traps | 302 | `accounts.google.com/ServiceLogin?service=cloudconsole&...&continue=<same deep path>` | Yes |
| `https://calendar.google.com/calendar/u/0/r/settings` | Setup, calendar step | 302 | `accounts.google.com/ServiceLogin?service=cl&...&continue=<same deep path>` | **No — see below** |

**One caveat on the first two rows, true until the publish happens.** They answer 200, but what
they serve today is the throwaway spike page titled *Fit Platform Spike* — re-measured on 1 August
2026 by two independent instruments at 63,875 bytes. The address is right and the application
behind it is not, until the publish replaces it. Do not run section 1 or 2 against that address
before then.

**The one link that does not survive being signed out, and it does not look like it.**
`calendar.google.com/calendar/u/0/r/settings` answers 302 to Google sign-in with the deep path
preserved in `continue=` — **the same shape as every console link in the table above, which is why a
single-hop check cannot tell them apart.** The difference is at the *second* hop: that ServiceLogin
URL then redirects a signed-out visitor to `workspace.google.com/intl/en-US/products/calendar/`, a
marketing page titled *Shareable Online Calendar and Scheduling — Google Calendar*. He never reaches
his own calendars and nothing tells him why. The Setup page closes this in words rather than
pretending it away: `CALENDAR_SIGN_IN_FIRST` tells him to sign in to Google in that browser first
and open the link again. **On the call, make sure he is signed in before he clicks it.**

**Two things that look like dead links and are not.** BOTH API library pages answer 302 *to
themselves* on a fresh cookie container, which an automated checker reports as a redirect loop; each
resolves to 200 on the next hop. (Re-measured three times with a new jar per run on 1 August 2026 —
a jar that has already been through the self-redirect answers 200 on the first hop instead, so the
code you see depends on your instrument's cookie state, not on the link.) And Google throttles
unauthenticated agents with **429**. Neither is a broken link and neither is a reason to "fix" one of
these hrefs.

**One link deliberately not used.** `myaccount.google.com/security` answers 302 to
`myaccount.google.com/intro/security`, Google's marketing intro page titled *Google Account* — it
does not arrive at his security settings. Section 4 uses the `signinoptions/twosv` deep link
instead, which does.

---

## 6. What to tell him about, unprompted

Say these before he finds them. A limit he was told about is a limit; a limit he discovers is a
fault.

- **Backup runs when he opens the app, when he leaves it, and when he asks — never in the
  background.** iOS gives a web app no way to do it while it is closed. Nothing is lost by waiting;
  it is queued locally and goes out next time.
- **Sign-in lasts about an hour and cannot be renewed silently.** He taps to reconnect. That is the
  platform, not a bug.
- **A group video call with three or more people ends at 60 minutes** on a free personal Google
  account. One-to-one runs longer. Nothing this app can lift.
- **He owns his exercises, routines, curves and clients completely.** He cannot add a new movement
  pattern, muscle group, equipment item or routine focus — those are fixed, and there is no screen
  to extend them.
- **The journal verification screen does not refresh.** What it shows was true when he opened it.
- **Removing the app from his home screen destroys its local data on that device.** The Drive backup
  is what survives, which is the reason to get one working on the call rather than after it.
