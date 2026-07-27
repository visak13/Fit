# The accountability surface

Start here: **`status.js`** is the module API. `index.js` beside it is the test entry point, not the
API.

This package answers one question, at any moment, for a coach whose pay depends on the answer:
**where is my data, and if it is not backed up, why not?**

It is the STATE LAYER. It computes what the interface will show and it draws nothing — no document
access, no elements, no colour, no markup, no timers. The interface renders it however it likes, and
this package is testable without a browser precisely because there is nothing in it to draw.

Plain, dependency-free ECMAScript modules. No framework, no bundler, no build step, no third-party
package; types are expressed in documentation comments.

---

## What it always exposes

Every one of these is present in every state `accountabilityStatus()` can return. A caller cannot get
a partial answer, so a caller cannot render a spinner with nothing behind it.

| Field | What it is |
|---|---|
| `last_synced_at` | When a real backup last completed. `null` means NEVER, and it is never a guess. |
| `last_synced_age_ms` | How long ago that was. |
| `never_synchronised` | Nothing at all is in the backup yet. |
| `pending`, `undelivered`, `needs_attention` | How much is not in the backup. |
| `oldest_pending_age_ms` | How long the oldest thing still being attempted has waited. |
| `oldest_undelivered_age_ms` | How long the oldest thing NOT IN THE BACKUP has waited, stopped entries included. This is what the ladder climbs on. |
| `level`, `level_rank`, `level_persistent`, `summary` | The escalation, plainly named. |
| `reason`, `reasons` | WHY, specifically. Never "something went wrong". |
| `nothing_can_be_sent` | A queue-wide stop, as opposed to some entries being stuck. |
| `blocks_application` | `false`. Always. There is no branch that sets it. |
| `in_progress` | A synchronisation is running. Beside the figures, never instead of them. |
| `statement` | What may honestly be said about backing up. |

---

## The five things this package makes structural rather than remembered

### 1. "Last backed up" is a BRAND, not a field

The best-effort flush that runs when the app is backgrounded **may be killed mid-flight** by the
platform; on iOS that is ordinary, not exceptional. It must be IMPOSSIBLE, rather than merely
forbidden, for that partial outcome to be reported as a completed synchronisation — because "last
backed up: just now" is the one sentence in this application that can lose a professional's work
while looking like reassurance.

A boolean that callers are supposed to check is a rule someone eventually forgets. A distinct type
that cannot be passed where a completion is expected is a rule that cannot be forgotten. The outbox
took that approach for its flush report; `completion.js` takes the SAME approach one layer up, for
the value the interface actually displays.

The only route to a completion is `completionFrom()`, which asks `syncCompletionMarker` in
`core/outbox` — whose own first test is a module-private symbol that only a flush that genuinely ran
in this process can carry. What comes back is stamped with a second module-private symbol belonging
to this package, so a spread, a JSON round trip and a hand-built lookalike all lose it.

Proven in `completion.test.js`, over every route a caller would actually take:

- a best-effort flush that delivered everything — no completion;
- a flush killed part-way — no completion;
- a foreground flush leaving a REJECTED entry, so nothing is pending and the data is still not away —
  no completion;
- a synchronisation report carrying a hand-written `completion` field — not trusted; the flush inside
  it is re-tested, because only the flush can hold the brand;
- a pass with a failed step — withheld, because the queue may have drained before the pull failed and
  "backed up" would then quietly mean "sent mine, never read yours".

**What this does NOT claim,** stated plainly rather than left to be assumed: the brand is an
IN-PROCESS defence. The persisted value is guarded by there being exactly one writer,
`recordCompletedSync`, which cannot be satisfied without an authentic report — not by cryptography.
Anything that can write to the local database directly can write that key, and no check here would
survive that. Claiming a guarantee this does not have would be the same class of defect as the
spinner.

What it does do about that: a persisted row that is present but MALFORMED is not read as an absence.
An absence means "never backed up", which is true and useful; a malformed row means something other
than this module wrote a completion, and that comes back as `unverifiable_sync_claim` — the reason
that outranks every other, because it makes every figure beside it suspect.

### 2. A dead credential is a condition of the WHOLE QUEUE

The outbox's first design modelled this per-entry and corrected it. The correction binds here. If it
is modelled per-entry, this surface reports a handful of individually-stuck items when the truth is
that NOTHING can go anywhere at all, and the coach reads a stopped queue as a small problem rather
than a stopped one.

So the credential reason carries `queue_wide: true`, the sentence says *"nothing can be backed up
until you reconnect"*, and a test asserts the sentence quotes no per-entry count at all. The count
remains available in `waiting_for_credential`; it is not the headline and it is not what the words
describe.

**It floors no level.** It is the one condition with an action attached — a tap — and presenting it
as a fault teaches the coach to ignore the indicator, which is the failure this whole surface exists
to prevent. It is said loudly in the REASON, where it belongs, and the age ladder climbs underneath
it exactly as it would otherwise.

### 3. Sync never blocks

The earlier seventy-two-hour blocking modal was REMOVED and must not come back in any form. An
application that refuses to open loses the very session it was trying to protect, and it contradicts
the standing principle that the app is a supporting role and not the driver.

- A persistent, unmissable warning recurring on every screen is the MAXIMUM escalation.
- Every rung declares `blocks: false`. There is no rung on which it is true.
- `blocks_application` is a frozen constant, not a derivation.
- `levels.test.js` asserts it over EVERY rung; `surface.test.js` drives a matrix of real states —
  never synchronised, healthy, work waiting, a refused entry, a dead credential, then a fortnight of
  all of it at once — and asserts the value never changes.

Bringing a gate back would mean deleting those tests, in the open.

### 4. Failure is loud and specific, and a spinner cannot hide it

Five distinguishable causes, kept distinguished: a **missing** credential, an **expired** one, **no
network**, a **refused entry**, and **never having synchronised at all** — plus an unconfirmed
outcome, a local failure, and the unverifiable claim above.

Classification reads the DECLARED fields the port and the engine carry — `retryable`, `needs_reauth`,
`code` — and never message text, which would break silently the first time a message was reworded.

Every applicable reason is returned, worst first, rather than only the worst: the one-line indicator
shows the first and the panel behind it shows the rest. Collapsing to one would hide a refused entry
behind a dropped connection, and the refused entry is the one that never resolves by itself.

**There is no in-progress reason code at all.** That is the structural half of "never expose an
indeterminate in-progress state as the only thing a caller can see": there is no value this module
can return that means "wait and see". `in_progress` is a separate field, and a test asserts every
figure is populated while it is true.

### 5. The escalation follows the DATA, not the retry

Six hours `overdue`, twenty-four `severely_overdue`, seventy-two the `persistent_warning` — the
user's own recorded figures, exported so the notes, the interface and the tests quote one copy.

A stopped entry floors the level at `overdue` immediately, because time does not heal something that
is not waiting for time. **And it goes on ageing.** The ladder climbs on `oldest_undelivered_age_ms`,
which spans everything not in the backup rather than only what is still being attempted — otherwise
a queue holding nothing but a three-day-old refusal reports the freshest possible age, none at all,
and never reaches the persistent warning while the coach has not backed that session up since
Tuesday. That gap was found by the acceptance run for this step, not reasoned about in advance.

An empty queue on a device that has never synchronised is **not** `up_to_date`. It means nothing has
been written yet, and "everything is backed up" would be the most damaging sentence this surface
could produce.

---

## What may honestly be said (`statement.js`)

Promise nothing the platform cannot do:

- **Promises** — saves on this device instantly, with or without a connection; backs up when you open
  the app, when you leave it, and whenever you tap Sync; work that cannot go through waits in a queue,
  so it is a delay and never a loss; the last backup time and the waiting count are always visible.
- **Limits** — it cannot back up in the background; it cannot back up while the app is closed; **do
  not delete the app icon**, because removing it deletes everything stored on the device; Google
  access lasts about an hour of active use, so reconnecting is occasionally needed.

The promises and the limits are separate fields, and `statement.test.js` asserts that no PROMISE
contains "background", "automatic", "while the app is closed" or "continuously" — words that are
perfectly allowed in the LIMITS, where they appear as denials. A single mixed paragraph is one editor
away from losing its second half.

The five backup opportunities are also cross-checked against `SYNC_TRIGGER_VALUES` in `core/sync`
rather than restated here. Two lists that must agree are two lists that will not, and the one that
drifts would be the one making the promise.

---

## Cost

One status pass is the outbox's own status read — index range counts plus a cursor step — plus one
meta row, plus at most two more cursor steps when something is stopped. Nothing here walks the queue
and nothing here walks the record stores. A test asserts the transaction count over a queue of forty.

This matters as much as correctness: a figure that is wrong misleads the coach, and a figure that is
expensive stops being shown. An indicator that is not always visible is not an accountability surface.

---

## Proof, and its limits

`node --test core/status/index.js` — **64 tests, all passing.** The gate names the entry point rather
than the directory, deliberately: on this runtime a positional argument is resolved as a MODULE, so a
directory target with no entry point can report a PASS having executed nothing at all, and on this
build that has happened three times. Naming the file makes a missing entry point a hard resolution
error instead.

**Nothing here makes a live call to any provider, and nothing here proves anything about one.** The
states these tests drive — an expired credential, an unreachable service, a refusal, a flush killed
mid-flight — are produced against the in-memory double in `core/remote`, which is faithful to two
MEASURED quirks and no more. A passing test proves OUR LOGIC given that behaviour. It never proves
the platform.

## The boundary with the interface, and with the sync engine

- The engine calls `recordCompletedSync(store, report)` after a pass. It writes nothing unless a
  completion was genuinely earned, and it never clears an earlier one: advancing it would say the
  coach is safe when he is not, and clearing it would say he has never backed up when he has.
- The interface calls `accountabilityStatus(store, { in_progress, last_attempt, credential })` and
  renders the result. `last_attempt` is read for the reasons a synchronisation did not FULLY happen —
  its failures, and the files it passed over — never for a completion.
- **A pass that passed over a file it could not decode, or whose name it could not place, is not a
  clean pass.** `completionFrom` withholds the seal by asking `core/sync/withheld.js` the same
  question the engine asked, so the report and the stored last-synced time cannot disagree; and
  `backup_partly_unreadable` says so in his own words, naming how many files were skipped and
  stating plainly that his other device is running a newer version of the app. It ranks immediately
  below `never_synchronised` because it is the same kind of fact: the backup does not hold what he
  thinks it holds. Its action is `null` — this application cannot update itself on his tap, and
  there is no screen in it that resolves the condition.
- `reason.action` is a code (`connect_google`, `reconnect_google`, `sync_now`, `review_refused`,
  `review_unconfirmed`) or `null` where there is genuinely nothing the coach can do. Offering an
  action that does not help is how an indicator earns the reputation of lying.
