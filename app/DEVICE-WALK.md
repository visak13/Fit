# The real-device walk — the part only you can run

This sheet is for **you**, on **your iPhone**, with the published app in front of you.
Everything on it is something no automated check in this project can do: install to a home
screen, fly a phone genuinely offline, feel whether a screen is fast enough while a client is
standing there, or put a person who has never seen this project in front of the setup page.

Everything else has been checked by machine. **This is what is left, and nothing here has been
run yet.**

> **Every item below is marked `NOT DONE YET` and it stays that way until you have actually run
> it.** Nothing on this sheet is a claim that anything passed. If you stop half way, the sheet
> shows exactly where you stopped.

**About the coach.** He is not reachable while this is being built, and this sheet is not
addressed to him. You run it, then you walk him through the app over a video call.

**About Android — untested, and no claim is made about it.** This app has only ever been tested on
iOS, which is what you and the coach both use. There is no Android item on this sheet and there
should not be one — not even as something to do later. It was never tested and it is not going
to be.

---

## How to record a result

Each item ends with a box like this. **Move the `x` yourself.** Leave it where it is until you
have run the item.

```
RESULT   [ ] PASSED     [ ] FAILED     [x] NOT DONE YET
WHAT I ACTUALLY SAW:
```

Three states, and they are not interchangeable:

- **PASSED** — you did the thing and saw what this sheet says you should see.
- **FAILED** — you did the thing and saw something else. **Write down what you saw**, in your
  own words. A FAILED with a description is worth more than anything else on this sheet.
- **NOT DONE YET** — you have not run it. This is the state everything ships in.

If you are unsure which of the three it is, it is **FAILED**, and say why you were unsure.

---

## Before you start — three things, and the first one is not optional

### B1. The app must be the published one, not a local one

The offline machinery does not exist when the app is run from a development server. If you open
the Admin screen on a dev server it says, in as many words:

> Starts without a network
> **No — not registered in development, by design**

That is correct behaviour and not a fault. **Everything on this sheet must be done against
`https://visak13.github.io/Fit/`**, on your phone, or it proves nothing.

And if you are ever tempted to check an offline item on the laptop first, so that you arrive at
the phone already knowing the answer: **do not use `npm run preview` for it.** MEASURED twice on
2026-08-01, and again while this sheet was being corrected: `vite preview` sends a `Vary: Origin`
header, that header defeats the cached lookup for the module the page loads, and a cold offline
start through it paints **nothing at all** — a blank screen that looks exactly like the app being
fatally broken offline. It is not. The **same build** served by a plain static file server — any
server that just hands back the file, which is the shape of the real one — started fully offline
with every asset answered by the service worker and **1,684 painted characters**, zero failed
requests. **The blank screen is the instrument, not the app.** Preview is fine for looking at the
app online; it cannot measure an offline start, and it is the one tool here that reports a
disaster that does not exist.

### B2. Know which build you are looking at, at all times

Open the app → **Admin** → the card headed **This build**. It shows:

> **Build** `89f08998dce7b5f2`  *(a short code — yours will differ)*

That code is the running app naming itself. The published ground truth is at
**`https://visak13.github.io/Fit/build-info.json`** — open it in Safari and look at
`"sourceStamp"`. **Those two matching is the only proof the phone is running what you
published.** They are the tool you use for items 4 and 5, so find them both once now.

### B3. Items 4 and 5 need a build newer than the one currently committed

Measured on 2026-07-31 against the `dist/` that was committed at the time (it no longer is —
`dist/` is ignored and CI builds the published bundle from source): the sentence *"A newer version of this app
is ready."* and the control *"Update now"* are **not in it**. (The same search does find *"Start
this session"* in that bundle and does not find a nonsense string, so the search itself works —
it is the sentence that is absent, not the search that is broken.) That copy was written in this
step and only reaches a bundle after the closing rebuild.

**So: do not run items 4 or 5 against a build published before this step closed.** If the
sentence never appears, the first thing to check is that what you published actually contains it.

---

## 1. Install it to the home screen, and launch it from there

**WHAT TO DO** — In Safari on your iPhone open `https://visak13.github.io/Fit/`. Share button →
*Add to Home Screen*. Close Safari completely (swipe it away). Tap the new icon on your home
screen.

**WHAT YOU SHOULD SEE** — It opens with no Safari address bar and no browser buttons — its own
window, like an app. The five destinations across the bottom or top read **Clients, Calendar,
Routines, Diet, Admin**. Go to **Admin** → **This build** and write the Build code down; you will
need it for items 4 and 5.

**WHAT IT DECIDES** — **O6**, whose bar is that the app installs to the home screen on a real
phone. If it opens inside Safari with an address bar, it did not install as an app and every
later item is being run against a browser tab instead.

```
RESULT   [ ] PASSED     [ ] FAILED     [x] NOT DONE YET
BUILD CODE ON THE PHONE:
WHAT I ACTUALLY SAW:
```

---

## 2. Launch it with the phone genuinely offline, and run a whole session

**WHAT TO DO** — Open the installed app once while online (this is what lets it store itself).
Then close it completely. **Turn on aeroplane mode** — not Wi-Fi off, not a weak signal:
aeroplane mode, so there is no internet at all. Confirm Safari cannot load any page. Now tap the
Fit icon and, without leaving aeroplane mode:

1. Go to **Clients** and add a person.
2. Go to **Calendar**, choose that person, choose a routine, choose **In person**, press
   **Start this session**.
3. Run several exercises. Jump to a different one out of order. Substitute one. Capture a
   reading. Add a note.
4. Leave the app entirely (home button / swipe away), then come back to it.

**WHAT YOU SHOULD SEE** — The app opens normally with no connection. Nothing anywhere tells you
something is broken because you are offline — working offline is what this app is for, not a
fault. When you return to the app, **the session is exactly where you left it**, with the
exercises you had already done still recorded. At no point does anything about syncing or Google
stop you from starting or continuing the session.

**WHAT IT DECIDES** — **O6** (installs and launches offline), **O2** (a real session can be run
end to end, and an interrupted one resumes where it left off). Anything that blocks you while
offline is a **FAILED** and is a serious one: no state of this app is allowed to stand between
you and running a session.

```
RESULT   [ ] PASSED     [ ] FAILED     [x] NOT DONE YET
WHAT I ACTUALLY SAW:
```

---

## 3. The workout screen, in your hand, with someone waiting

**WHAT TO DO** — Still in a live session on the phone, use the session screen the way you would
with a client in front of you. Move between exercises, start and stop the timer, capture a
reading, type a note. Do it at your normal speed, not carefully.

**WHAT YOU SHOULD SEE** — Every tap does something **immediately**. No pause between your finger
and the screen changing. Nothing that makes you tap twice because you were not sure the first one
landed. Text readable at arm's length without zooming.

**WHAT IT DECIDES** — **O6**, whose bar is that *the workout screen responds to interaction
without perceptible delay on a real phone*. A measurement on a laptop cannot settle this and no
automated check in this project claims to have. This item is the only evidence that will ever
exist for that clause.

Judge it as the coach would with a client waiting, not as a developer. If you find yourself
thinking "that was a bit slow but it is fine" — that is **FAILED**, and say which screen and
which tap.

```
RESULT   [ ] PASSED     [ ] FAILED     [x] NOT DONE YET
WHICH TAP / WHICH SCREEN WAS SLOW (if any):
WHAT I ACTUALLY SAW:
```

---

## 4. Updating a copy that is already installed — from a fresh open

**Read this first, because it is the failure that has already happened on this project.** The app
stores itself on the phone so it can run with no internet. That same machinery means a *correct*
publish can keep showing the *previous* version on an already-installed phone — and it looks
exactly like a publish that failed. Nothing is broken; the old copy simply carries on.

Two independent measurements in this project (`a1` and `a19`, on a real browser with two real
builds) agree: **after a correct publish, the previous build keeps running for one to two full
openings.** One of those runs took a whole opening longer than the other, so treat one-to-two as
a range and not a promise.

What was built in this step is the part that tells you: on a fresh **open** of the app, when a
newer build has arrived, the app now shows a line and a control. That was proven on a desktop
browser across two genuinely different published builds — the control was pressed and the app
came back running the new build. **It has never been run on an iPhone. This item is the first
time.**

**WHAT TO DO**

1. On the phone, open the installed app. Admin → **This build** → write the Build code down.
   Call this **the old code**.
2. On the laptop, publish a **second** build to `github.com/visak13/Fit`. Make one visible change
   so you can recognise it by eye.
3. Wait until `https://visak13.github.io/Fit/build-info.json` shows the **new** `sourceStamp` in
   Safari on the phone. (If it does not, GitHub Pages has not finished publishing and nothing
   below means anything yet.)
4. **Close the installed app completely** — swipe it out of the app switcher, do not just go to
   the home screen. Tap the icon again.

**WHAT YOU SHOULD SEE** — Somewhere on the screen, near the top of the content:

> **A newer version of this app is ready.**   [ **Update now** ]

You will most likely still be on the **old** Build code at this point — that is expected and is
the whole reason the line exists. Press **Update now**. The app reloads, and Admin → **This
build** now shows the **new** code, matching `build-info.json`. The line goes away by itself.

**WHAT IT DECIDES** — This is the one item on the sheet that decides **none** of O1–O6. It is
here because the whole handover depends on it: you give the app to the coach, he tells you what
to fix, you ship the fix. **If a fix cannot reach his phone, that loop is broken and neither of
you is told.** That is worth more than any single outcome clause on this sheet.

```
RESULT   [ ] PASSED     [ ] FAILED     [x] NOT DONE YET
OLD BUILD CODE:                     NEW BUILD CODE PUBLISHED:
BUILD CODE AFTER PRESSING UPDATE:
DID THE LINE APPEAR ON THE FIRST OPEN?   [ ] yes   [ ] no, it took ______ opens   [ ] never
WHAT I ACTUALLY SAW:
```

---

## 5. Updating a copy that is already installed — coming back to it, not reopening it

**This is the coach's actual case and it is the least proven thing in the whole project.**

He does not close the app and open it again. He swipes back to it. A home-screen app that is
resumed rather than reopened does not load a fresh page, and the check that produces the line in
item 4 runs once per page load. So on a resume, the line has no reason to appear.

A check on return was built for exactly this: when the app becomes visible again, it asks the
browser once whether a newer version exists. It is one question per return — not a timer, not
repeated polling. **But it was driven entirely by stand-in code under Node, with no browser
involved at all.** What that proves is that the mechanism exists, is wired to the right place,
asks exactly once, and stays silent when nothing is waiting. What it does **not** prove is that
an iPhone fires that event for a home-screen app you swipe back to, or that the question finds
anything when it does.

**So this item is not a confirmation of something already proven. It is the first time this path
runs on real hardware, and it may simply not work.** If it does not, that is a real finding and
not your phone misbehaving.

**WHAT TO DO**

1. Open the installed app on the phone. Leave it on any screen. **Do not close it** — press the
   home button, or switch to another app, so Fit is still in the app switcher.
2. On the laptop, publish a third build. Wait until `build-info.json` shows its new stamp.
3. **Swipe back to Fit** from the app switcher. Do not tap the home-screen icon, and do not swipe
   the app away first. Look at the screen for about ten seconds.
4. If nothing appears, switch away and swipe back once more, then wait again.

**WHAT YOU SHOULD SEE** — if this works: **A newer version of this app is ready.** with **Update
now**, without you ever having closed the app.

**IF NOTHING APPEARS: that is the expected-uncertain outcome, mark it FAILED and write down how
many times you switched away and back.** It is the answer this project needs, and it is the only
way anyone will ever get it.

**WHAT IT DECIDES** — Again none of O1–O6 directly. It decides whether the coach, who lives in
resumed apps and rarely closes anything, is ever told a fix has arrived — or whether he has to be
told over the phone to close the app fully. **Either answer is usable. Not knowing is not.**

```
RESULT   [ ] PASSED     [ ] FAILED     [x] NOT DONE YET
HOW MANY TIMES I SWITCHED AWAY AND BACK:
WHAT I ACTUALLY SAW:
```

---

## 6. Telling a slow update from a stuck one

**This is the part you cannot work out by looking at the screen, and it is why items 4 and 5 have
a build code box.** A slow update and a broken publish look identical: the app opens, works
perfectly, and shows the old version.

Use the two numbers. **Admin → This build → Build** is what the phone is running.
**`build-info.json` → `sourceStamp`** is what is published.

| What you see | What it is | What to do |
|---|---|---|
| The two codes **match** | Up to date. | Nothing. |
| Codes differ, and `build-info.json` still shows the **old** stamp | **The publish has not landed yet.** Nothing is wrong with the phone. | Wait for GitHub Pages, then start again. |
| Codes differ, `build-info.json` shows the new stamp, and you have fully closed and reopened the app **once or twice** | **Slow — this is normal.** Measured twice on this project: the previous build survives one to two full openings. | Close it fully and open it again. |
| Codes differ, new stamp published, and you have fully closed and reopened **three or more times over ten minutes**, and the *"A newer version"* line has **never** appeared | **Stuck.** Beyond the measured window with no notice at all. | This is a **FAILED** on item 4. Record it. The recovery below exists but the failure is the finding. |

**The recovery, if it is genuinely stuck** — and use it only after recording the failure, because
using it first destroys the evidence: delete the app from the home screen (press and hold →
Remove App), open `https://visak13.github.io/Fit/` in Safari, and add it to the home screen
again. **Your data is stored on the device and survives this** — but if you are about to do this
with real client data on the phone, take a backup first from Admin → *Save a copy you can keep
anywhere*.

**WHAT IT DECIDES** — Nothing on its own; it is the instrument for items 4 and 5. It is on the
sheet because without it a stuck update gets recorded as a passed one.

```
RESULT   [ ] READ AND UNDERSTOOD     [x] NOT READ YET
```

---

## 7. Does the phone offer two sessions at once? (it must not)

**WHAT TO DO** — On the phone, go to **Calendar** and confirm the heading says **Calendar**
before you judge anything (the app is hash-routed and a mistyped address quietly shows you the
Calendar instead of the screen you asked for — so check the heading, always). Choose **two or
more** clients for one session, pick a routine, and read everything on the screen before pressing
start.

**WHAT YOU SHOULD SEE** — This is a decided design point: two sessions at once are a **laptop**
thing and the phone must not offer them. So: **nothing on the phone should mention running a
second session, a second window, or a second copy of the app.**

There is one sentence to watch for by name, because it used to appear here and was switched off
after this sheet was first written:

> Everyone here does the same routine. If two of them need different programmes today, open the
> app in a second window and run that one there.

On an installed home-screen app there is no second window to open, so that sentence is the app
telling the coach to do something his phone cannot do. **It is now withheld below laptop width in
the code that builds the screen, not merely hidden by styling — so on the phone the words should
not be there at all.** (Re-measured on a real browser: absent from the page at 390, 600, 700 and
780 CSS pixels wide with two clients chosen; present from 840 upwards.)

**If you see that sentence on the phone anyway, mark this FAILED and quote it** — it would mean
the switch does not hold on a real iPhone, which is exactly what this sheet exists to find out.
If you see no such sentence, and nothing else offers a second session, that is PASSED.

**WHAT IT DECIDES** — **O6**, whose bar is that two laptop windows run concurrent sessions *and
the phone does not offer that*.

```
RESULT   [ ] PASSED     [ ] FAILED     [x] NOT DONE YET
WHAT I ACTUALLY SAW:
```

---

## 8. The setup page, followed by someone who has never seen this project

**This one has a rule and the rule is the whole item: do not help them.** The bar is that a
reader who has never seen this project reaches a working Google connection **without asking for
help**. The moment you answer a question, you have destroyed the measurement — and every question
they ask **is** the finding, so the questions are the thing you are collecting.

**WHAT TO DO**

1. Find someone who has not seen this project. Sit them at a computer with
   `https://visak13.github.io/Fit/` open on **Admin → Setup**.
2. Tell them one sentence: *"Follow this page until the app is connected to your Google
   account."* Then say nothing else.
3. **Write down every single question they ask**, word for word, even the ones you think are
   silly. Write down anywhere they stop, backtrack, or look lost, even if they recover.
4. If they get properly stuck and cannot go on, stop the test there and record where. **Do not
   rescue them and then call it a pass.**

**WHAT YOU SHOULD SEE** — The page walks through five ticks under *Getting your Google client
id*:

> Make a Google Cloud project that belongs to you
> Switch on the Google Drive API, so this app can keep your backup in your own Drive
> Switch on the Google Calendar API, so this app can put your sessions on a calendar
> **Set up your sign-in screen and publish it, so your sign-in does not expire**
> Create a web client id and allow this app's address to use it

**Check the fourth one especially.** Confirm they actually ended with the sign-in screen
**published**, and not left in testing. A project left in testing lets the sign-in expire after
about a week — and what that looks like later is the app signing the coach out for no reason
anyone can point at, on the day he has a client waiting. The page warns about it in those words.
**A reader who finishes with it still in testing has not passed this item**, even if the app
connects today.

Only two Google services should be switched on: **Drive** and **Calendar**. Nothing else.

**WHAT IT DECIDES** — **O4**, whose bar is exactly this: *a reader who has never seen the project
follows the setup page and reaches a working Google connection without asking for help.* No
automated check can put a person in front of a page. This item is the only evidence there will
ever be.

```
RESULT   [ ] PASSED     [ ] FAILED     [x] NOT DONE YET
EVERY QUESTION THEY ASKED (this is the finding — keep going onto more lines):
  1.
  2.
  3.
DID THEY FINISH WITH THE SIGN-IN SCREEN PUBLISHED?   [ ] yes   [ ] no   [ ] did not get that far
WHERE THEY GOT STUCK (if anywhere):
```

---

## 9. A real Meet link, and a real Drive sync between the laptop and the phone

**WHAT TO DO — the Meet link.** Sign in with the free personal Gmail account (the same one the
coach will use — not a Workspace account). On **Calendar**, choose a client and a routine, choose
**Online**, and under **The joining link** choose **Make one now**. Its consequence is written on
the screen:

> The app asks Google for a Meet link as the session starts, which puts a real event on your
> calendar. Google may ask you to connect at that moment. If it cannot make one, it says so and
> you can paste a link instead.

Start the session. Then **open the link and confirm a real meeting opens**, and **open Google
Calendar and confirm a real event is there** with the conferencing on it.

That last part matters: on a free personal Gmail, putting a real calendar event on the calendar
is the *only* way this app can obtain a Meet link. There is no other route and there is not meant
to be one. **If a link appears without a calendar event behind it, mark it FAILED and say so** —
that would mean something is happening that this app is not supposed to be doing.

**WHAT TO DO — the Drive sync.** With both devices signed in to the same Google account:

1. On the **laptop**, add a client and record something distinctive against them. Let it sync.
2. On the **phone**, open the app, let it sync, and look for that client and that detail.
3. Then do it the other way round: something on the phone, found on the laptop.

**WHAT YOU SHOULD SEE** — What you wrote on one device shows up on the other, complete, with
nothing lost and nothing overwritten. The sync status never stops you doing anything on either
device.

**WHAT IT DECIDES** — The Meet half is the app's own version of what **O1** proved on iOS. The
Drive half is **O3**, whose bar is *data written on one device appears on a second device after
both have synced, with no loss and no overwrite*. Two real devices and a real Google account are
outside anything this project can automate.

```
RESULT — MEET LINK    [ ] PASSED     [ ] FAILED     [x] NOT DONE YET
DID A REAL CALENDAR EVENT APPEAR?   [ ] yes   [ ] no
RESULT — DRIVE SYNC   [ ] PASSED     [ ] FAILED     [x] NOT DONE YET
WHAT I ACTUALLY SAW:
```

---

## 10. The exports, opened on the phone

**WHAT TO DO** — On the phone, produce all three and **open each one**:

1. **Diet** → a week for a client → **Send this week** → **Send as an image**.
2. Same place → **Send as a spreadsheet**.
3. **Clients** → a client's progress report → **Send this report** → either format.

For each, take the share sheet all the way through to actually opening the file in whatever app
the phone hands it to — Photos, Files, Numbers, Mail, whatever appears.

**WHAT YOU SHOULD SEE** — Each one opens and is readable. The image is a legible week chart, not
a blank or clipped picture. The spreadsheet opens as a real spreadsheet with the days and rows in
it, not as an error or a wall of unreadable characters. The report reads like something you would
send a client — trends and a plain-language summary, **not** a list of rep counts.

Judge the report as a person receiving it, not as its author: does it actually tell someone how
they are progressing?

**WHAT IT DECIDES** — **O5**, whose bar is that the diet exports *open correctly on the coach's
phone*, and that a generated progress report is *read by a person who confirms it communicates
progress without reference to repetition counts*. Whether a file opens on an iPhone is not
something any check here can answer.

One limit, so it is not mistaken for a defect: once a file has left the phone, this app cannot
reach it, change it or take it back. Nothing on this sheet asks it to.

```
RESULT — DIET IMAGE          [ ] PASSED     [ ] FAILED     [x] NOT DONE YET
RESULT — DIET SPREADSHEET    [ ] PASSED     [ ] FAILED     [x] NOT DONE YET
RESULT — PROGRESS REPORT     [ ] PASSED     [ ] FAILED     [x] NOT DONE YET
WHICH APP EACH ONE OPENED IN:
WHAT I ACTUALLY SAW:
```

---

## 11. The sounds, actually heard

**WHAT TO DO** — Phones will not let a page make a sound until you have tapped something, so the
app asks for that tap. In a live session on the phone, find and press:

> **Turn the sounds on**

Then, with the phone's ringer **not** on silent and the volume up, run an exercise with a timer
through to its end. Listen for: **the countdown beeps in the last seconds**, **the chime at the
end**, and **the exercise name spoken aloud**.

Then do it again with the **screen off or the phone locked**, if that is how you will actually
use it — pocket, bench, upside down on a mat.

**WHAT YOU SHOULD SEE (and hear)** — After the tap, the app states which sounds it is giving you.
The full state says:

> Sounds are on: a beep for the last seconds, a chime at the end, and the exercise named.

There is also a partial state, where beeps and chimes work but nothing is spoken because the
browser has no voice installed. **If you get that one, mark it PASSED-with-a-note rather than
guessing** — write down exactly which of the three you heard. That distinction is the finding.

To be clear about what "sounds" means here: the app only ever makes sound. It never listens. You
do not talk to it.

**WHAT IT DECIDES** — **O2**, whose bar includes *audio cues demonstrably fire*. A check running
in a harness can prove the app asked for a sound; only your ears prove one came out of the phone,
and nothing but a real phone can settle the locked-screen case.

```
RESULT   [ ] PASSED     [ ] FAILED     [x] NOT DONE YET
HEARD, SCREEN ON:    [ ] beeps   [ ] end chime   [ ] exercise name spoken
HEARD, SCREEN OFF:   [ ] beeps   [ ] end chime   [ ] exercise name spoken   [ ] did not try
WHAT I ACTUALLY SAW:
```

---

# THE HONEST LEDGER

Two lists. **The first is what the automated checks in this project structurally cannot settle,
whatever their verdicts turn out to be — because a spawned shell has no phone, no second device,
no Google account and no cold reader.** The second is what this sheet closes, **and only if you
actually run it**.

## What no automated check here can settle

| Outcome | The clause | Why no check here can reach it |
|---|---|---|
| **O2** | *Audio cues demonstrably fire* | A harness can prove the app asked for a sound. It cannot hear one, and it certainly cannot hear one from a locked phone. |
| **O2** | *Reopening the app mid-session resumes exactly where it left off* — **on a phone** | Reachable in a desktop browser. A backgrounded home-screen app on iOS is a different thing and is not reachable from here. |
| **O3** | *Data written on one device appears on a second device after both have synced* | There is no second device and no real Google Drive account in this project. |
| **O4** | *A reader who has never seen the project follows the setup page and reaches a working Google connection without asking for help* | Requires a person, and requires creating a real Google Cloud project and consent screen. |
| **O5** | *Diet exports open correctly on the coach's phone* | Whether a file opens in an iPhone app is a fact about the phone. |
| **O5** | *A progress report is read by a person who confirms it communicates progress* | Requires a person's judgement, explicitly. |
| **O6** | *The app installs to the home screen on a real phone and launches offline* | No home screen here, and no aeroplane mode. |
| **O6** | *The workout screen responds without perceptible delay on a real phone* | A laptop measurement does not settle it, and this project has never claimed it does. |
| **O6** | *The phone does not offer concurrent sessions* | Needs the phone. |
| — | **Whether an update reaches an already-installed iPhone at all** | Proven on desktop for a fresh open. Never run on iOS in any form. The resumed-app case has never touched a browser of any kind. |

## What this sheet closes, if you run it

| Item | Closes |
|---|---|
| 1 | O6 — installs to the home screen |
| 2 | O6 — launches offline; O2 — a full session runs, and an interrupted one resumes |
| 3 | O6 — the workout screen is fast enough in the hand |
| 4 | The update path on a fresh open, on real hardware for the first time |
| 5 | The update path on a **resume** — the coach's real case, never exercised anywhere before |
| 6 | Nothing on its own; it is what stops a stuck update being recorded as a slow one |
| 7 | O6 — the phone does not offer concurrent sessions |
| 8 | O4 — a cold reader reaches a working Google connection unaided |
| 9 | O1's Meet path on this app; O3 — two devices sync with no loss |
| 10 | O5 — the exports open on the phone and the report reads like a report |
| 11 | O2 — the audio cues are actually heard |

## Three things this sheet does not close, and never will

1. **Android — not tested, and cannot be tested here.** It was never run on such a device at any
   point. Not pending — absent. Nothing in this project should be read as owing an Android proof.
2. **O1 is already met, on iOS, which is the actual target device.** That is a recorded fact, not
   a hedge. Items 1, 2 and 9 re-exercise parts of it through the real app rather than through the
   throwaway page that originally proved it; they are not re-opening it.
3. **One branch of the Meet path has still never run**: the case where Google answers "pending"
   and has to be polled through to success. It did not execute during the original proof either.
   It ships unexercised, and item 9 will only exercise it if Google happens to answer that way
   for you.

## Unfinished work the items above walk you straight into, so it does not read as a fault

- **Three surfaces do not yet perform the check they describe** — the encryption-details card,
  the "changes that need your decision" picker, and the stopped-changes card. They now say they
  have **not checked yet** rather than claiming everything is fine, which was the point of the
  change. They are an O3 shortfall and are recorded as one.
- Reading a completed session back in full — what was done, the loads, the progress — is not
  built. The app says so on the Calendar screen in its own words.

---

## When you have finished

Send this sheet back with the boxes moved and the "what I actually saw" lines filled in. **Any
item still reading `NOT DONE YET` is understood as not run** — that is not a problem, it is the
sheet doing its job. What would be a problem is an item marked PASSED that was not actually run,
because everything downstream then rests on it.

The most valuable thing you can send back is a **FAILED with a description**. Every one of those
is something no amount of checking here could have found.
