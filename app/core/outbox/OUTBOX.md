# The durable outbox

Every write bound for remote storage passes through this queue first. Nothing bypasses it.

Its whole purpose is one sentence: **a failed, expired or absent credential is a DELAY and never a
LOSS.** Everything below is in service of that, or is an honest statement of where it stops.

It is the counterpart to `PORT.md`, which owns the boundary this queue delivers through, and to
`STORE.md`, which owns the local durability every entry rests on. Neither performs cryptography and
neither can read a sealed value; nor can this.

Code entry point: `core/outbox/outbox.js`. Test entry point: `index.js` — see §9.

---

## 1. What this layer is, and what it is not

`core/outbox` is **plain, dependency-free ECMAScript modules**. No framework, no bundler, no build
step, no third-party package. Types are expressed in documentation comments, so nothing here presumes
compilation, and the test gate runs on the runtime's own test runner with nothing installed.

| File | What it holds |
| --- | --- |
| `outbox.js` | The barrel. Everything below, re-exported. **Import from here.** |
| `entry.js` | What one entry is: the vocabulary, the shape, and what makes it replayable. |
| `classify.js` | The three failures, told apart, and the growing delay. |
| `recognition.js` | Telling a replay from a fresh write — the mechanism, and what it rests on. |
| `queue.js` | Enqueueing, reading back in order, and recording an outcome. Every write via the store's one door. |
| `enqueue.js` | The three named ways to put work on the queue. |
| `flush.js` | Delivery, and the one thing this package makes structurally impossible (§6). |
| `status.js` | The figures the accountability surface is built on. |
| `errors.js` | The two failures that are this layer's own business. |
| `testing.js` | The device harness. Not shipped; used only by the tests. |
| `index.js` | **Test entry point only** — see §9. The API is `outbox.js`. |

It holds **no policy**. It does not decide when to flush, what the indicator looks like, when to
escalate, or how long delivered entries are kept. It makes those decisions possible and cheap, and it
refuses the shortcuts that would make them dishonest.

It also does **not** talk to any provider. It delivers through the port in `core/remote`, and
everything below was proved against that port's in-memory double.

> **No live provider call is made anywhere in this directory, and no claim about one is made.** A
> passing test against the double proves OUR LOGIC given the behaviour modelled there. It never
> proves the platform. The cloud step supplies the real implementation of the same port; until it
> runs, every sentence here about the service is inherited from measurements made during the platform
> spike, not from anything this package has seen.

---

## 2. Why there is a queue at all

The constraint the whole application is built under: a static site with no backend of any kind can
obtain no refresh token, so the credential is short-lived, foreground-only, and re-acquired inside a
user gesture. It is therefore **normally absent**. A cold start has no credential; an hour of work
ends without one; a phone that has been in a pocket has none.

An application that called the service at the moment the coach tapped would work perfectly while he
was online and lose data silently when he was not — and the loss would not look like an error. It
would look like a session that was simply never backed up, discovered weeks later when the device is
gone.

So: **every write lands durably in the local store first, enters this queue second, and reaches the
service third.** The credential can be dead for a week without a single record being at risk.

---

## 3. An entry is replayable without the session that created it

An entry may never be a closure, a callback, a reference into a screen's state, or an identifier only
the running session can resolve. Everything a delivery needs is a plain value stored on the entry:
the operation, the space, the name, the target identifier, **the bytes themselves**, and the key that
recognises the delivery if it has already landed.

The payload is text held verbatim. A pointer to a record would be resolved at delivery time against a
store that has since changed, and the delivery would then send something other than what was
acknowledged to the coach. Ciphertext passes through untouched: this layer never encrypts, decrypts,
inspects, parses or logs a payload, and a test asserts that no file here so much as names an
encrypted field.

Replay order is the order of enqueueing. Entries carry a monotonic `seq`, allocated from a counter in
the store's `meta` store **inside the same transaction** that writes the entry, so two windows
enqueueing at once get two numbers rather than two entries claiming one.

### 3.1 The status vocabulary is text, and this is not a style choice

| Status | Meaning |
| --- | --- |
| `pending` | Not delivered, and it will be attempted again. The only non-terminal state. |
| `delivered` | It landed. Kept as evidence — §8. |
| `rejected` | The remote refused it in a way retrying cannot fix. **Stopped, and visible.** |
| `ambiguous` | It may have landed, possibly more than once. **Stopped, and visible.** |

A pending entry also carries a `hold`: `none`, `backoff`, or `credential`.

**A boolean is not a valid key in the browser's indexed database.** An index on one silently holds
zero entries, and every query against it comes back empty while the code, the schema and the query all
look perfectly reasonable. That was measured on this build, against the obvious design for a different
feature. A queue is exactly where that trap bites — `pending` is the most natural flag anyone would
reach for — so the state is keyable text, the index is `['status', 'seq']`, and the entry validator
refuses a boolean in either field.

---

## 4. Recognition: how a replay is told from a fresh write

This is the part with a real choice in it, so it is stated plainly, including what it rests on.

### 4.1 What it cannot rest on

**There is no conditional-match facility.** Measured against the real service: the revision, the
content digest and the modification time are all output-only, and none can be sent back as a
precondition on a write. `PORT_CAPABILITIES.conditional_write` is `false`, declared as data so that
changing it is a visible code change a test catches. "Write this only if it has not already been
written" cannot be expressed, and no amount of care creates it.

The second measured quirk removes the other obvious answer: **the space does not enforce name
uniqueness.** A create under an existing name yields a second, distinct file, and both are then
listed. That happened on real devices in about fifteen minutes of ordinary two-device use.

### 4.2 What it does rest on

| Operation | How a replay is recognised | Resting on |
| --- | --- | --- |
| `create` | The idempotency key is **inside the remote name**. List by that name; count exact matches. | `list` narrowed by name prefix — the only metadata a listing can be filtered on — plus the naming rule the entry validator enforces at enqueue. |
| `overwrite` | **Read the target back and compare the bytes.** Equal means this exact revision already landed. | `read`, which returns metadata and content together. |
| `remove` | Attempt it; `RemoteFileNotFound` means it is already gone, which is the outcome asked for. | The port's typed not-found error. |

`keyedName('library-backup.json', key)` produces `library-backup.<key>.json` — readable to the account
holder browsing the folder, and exact enough for a replay to find. A create whose name does not carry
its key is **refused at enqueue**, because without it a replay after a lost acknowledgement can only
duplicate or skip, and both are wrong.

There is a **second, local** defence: the idempotency key is unique across the queue, so re-enqueueing
the same key returns the entry that already exists rather than adding one. The two together are why a
retry loop above this layer cannot produce a duplicate either.

### 4.3 The three cases, and the third is the one nobody lists

A listing returns **none**, **exactly one**, or **more than one**. The third is proven reachable, so
it is handled explicitly: the entry stops as `ambiguous`, carrying every identifier found, and a
person decides. `SURFACED_NEVER_GUESSED` is a declared value asserted by a test rather than an absent
check — an absence is indistinguishable from an oversight, and the next editor helpfully adds "just
take the first one", turning a visible problem into a silent wrong answer.

The same applies to an update whose target has **moved** under it, or has been **removed** elsewhere.
Never silently overwrite and never silently discard: an unreported conflict is a lost edit whichever
way it faces. Our payload is kept on the entry, so the edit is still there to re-apply.

### 4.4 Be exact about what this buys

Every mechanism above is **DETECTION**, and detection has a window: another writer can act between
the check and the write, and nothing on this port can close it. What recognition buys is that **the
queue's own retries do not duplicate**, which is the loss it was built to prevent. A clash with
another writer is surfaced to a person.

---

## 5. The three failures are three failures

Collapsing them is the defect, and each pairing is bad in its own way.

| Failure | Response | What collapsing it produces |
| --- | --- | --- |
| Service unreachable (`retryable`) | Keep the work; retry after a growing delay. | Shown as a rejection: the coach is told his backup was refused when the wifi dropped. |
| Credential expired (`needsReauth`) | Keep the work; wait for the next opportunity. **No attempt is burned.** | Treated as transient: an endless retry against a credential that cannot renew itself without a gesture. |
| Refused (neither) | **Stop, and be visible.** | Treated as transient: retried forever in silence — the state this queue exists to prevent. |
| Deadline passed (`RemoteTimeout`) | Retry — with recognition first, because the outcome is **unknown** and it may have landed. | Treated as "it did not happen": a duplicate on the next attempt. |

The classification is read off `retryable` and `needsReauth`, which the port declares for this purpose.
Matching on message text would break the first time a message was reworded, and would break silently.
A failure that did not come from the port at all is `local` — it is thrown, never dressed up as a
refusal by the remote.

**A dead credential is a condition of the whole queue, not of one entry.** When a flush hits one, it
stops and puts every due entry on the credential hold, so the figure the coach sees says everything is
waiting rather than one thing, and no later flush spends another call learning the same fact.
Releasing them is `releaseCredentialHolds`, called when he taps to reconnect; they become due at once
rather than serving out a delay that was never about a service needing time.

The backoff doubles from 5 seconds and is capped at 30 minutes. Deterministic, with no jitter: a
practice with one device has nobody to collide with, and a deterministic delay is one a test can assert.

### 5.1 The rejected entry: stopping is the smaller half

An entry that stopped **silently** is indistinguishable from one that succeeded. So a rejected entry
keeps its reason verbatim, is counted in `needs_attention` and in `undelivered`, survives a restart,
and is never attempted again in silence. `needsAttention` lists rejected and ambiguous entries
**separately**, because they need different words in front of the coach: one says the remote said no,
the other says we cannot tell.

---

## 6. A best-effort flush can NEVER report a completed synchronisation

Flushing what is queued when the application is being backgrounded is worth attempting. On the weaker
mobile platform the operating system may kill it mid-flight, and there is no way to ask it not to.
That must be harmless — which is exactly what this queue buys — **and it must never be reported as a
completed synchronisation.**

Not "we take care not to". The path must not exist, because a path that can do it will eventually run.
Four things make it structural:

1. **A separate entry point.** `flushBestEffort` forces the mode; there is no argument that turns it
   into a foreground flush.
2. **A brand.** A report is stamped with a module-private symbol, non-enumerable, carrying the mode
   the flush actually ran in. It survives no spread, no `JSON` round trip, and no hand-built object.
   Only a flush that genuinely ran can produce one.
3. **One predicate.** `claimsCompletedSync` refuses anything not branded `foreground` **before it
   reads a single counter**, then refuses an interrupted flush, one that stopped on a credential or a
   limit, and one that leaves **any** entry undelivered — including one that stopped as rejected or
   ambiguous, because that is data which is not in the backup.
4. **One producer of the marker.** `syncCompletionMarker` is the only function permitted to yield a
   "last synchronised at" value, and it returns `null` for anything the predicate refuses. A screen
   showing a last-synced time takes it from there or does not have one.

A test enumerates forty state combinations and asserts none of them can claim completion, and another
asserts that a copied or rebuilt report is not evidence.

### 6.1 Why an interruption loses nothing

There is deliberately **no `in_flight` status**. If there were, an application killed mid-attempt would
leave an entry stuck in it, and something would have to decide when a stuck one becomes safe to retry —
a lease, a timeout, a guess. Instead an entry stays `pending` for the whole attempt, and only a verdict
writes a new state.

So a killed flush leaves the queue exactly as it was: still pending, still in order, attempts not
counted, nothing half-settled. **Losing nothing across an interruption is the absence of a mechanism
here, not the presence of one**, and the recognition step is what stops the resumed replay from
duplicating.

---

## 7. The figures the accountability surface is built on

The standard, in the user's own words: the app is supposed to take accountability for the data, a real
professional will use it and his pay depends on it, and if a synchronisation does not happen the app
must highlight that.

`outboxStatus` returns `pending`, `waiting_for_credential`, `rejected`, `ambiguous`,
`needs_attention`, `undelivered`, `delivered`, `oldest_pending_at`, `oldest_pending_age_ms` and
`oldest_pending_label`.

- **`pending` alone would be a lie by omission.** A rejected or ambiguous entry is data that is not in
  the backup and never will be without a person, so `undelivered` counts it.
- **`waiting_for_credential` is separated out** because it is the one figure with an action attached: a
  tap. It is not a fault, and presenting it as one teaches the coach to ignore the indicator.
- **Nothing is `0` when it should be `null`.** An empty queue reports `oldest_pending_age_ms: null`,
  because zero would mean "something just arrived".
- **`oldest_pending_label` exists** so the surface can say *what* is unsynced, not only how much.

All of it is cheap, and that is a requirement rather than a nicety: an indicator shown on every screen
that read the whole queue would be the most expensive thing in the application, and it would stop
being shown. Counts are index-range counts; the oldest entry is one step of a cursor, because `seq`
order is arrival order. A test asserts the whole status costs at most a handful of rows against a
queue of forty, and that finding the oldest costs exactly one row against a queue of thirty.

This layer supplies figures and **not policy**. It does not know the escalation threshold, does not
choose a colour, and does not decide what is alarming.

---

## 8. What is kept, and what is bounded

Delivered entries are **kept**. They are the evidence that a delivery happened — which is what makes
"it is in the backup" checkable rather than merely intended — and they are the local half of the
duplicate defence, since a re-enqueue of a delivered key finds it and does not queue again.

They are also, unavoidably, a **second full copy** of every record they carry, so keeping them is
bounded. **The bound is applied by `recordDelivered`, inside the transaction that makes an entry
delivered, and it is a COUNT.** `retention.js` beside `queue.js` is the decision; the mechanism that
carries it out is module-private and there is no exported prune.

### 8.0 This reverses two positions this file used to hold, and both reversals are the point

**"This package holds no policy" no longer applies to retention.** It used to say that how long
delivery evidence lasts was *"a decision for a caller who knows, not a default that quietly forgets"*,
and that a retention constant sitting in this directory would be exactly the default it refused. Two
callers were tried under that rule. The first was nobody — `pruneDelivered` shipped with no production
caller, and the measured cost was three delivered entries carrying a purged client's name, notes and
readings in plain text, indefinitely, after the coach had been told that client was deleted. The
second was the tail of `syncNow`, which is a place a pass REACHES: it can throw, the tab can be torn
down mid-flight, and the departing `leave` trigger skipped the prune deliberately so housekeeping was
not competing with the flush. After every one of those the bound was not applied and nothing said so.

The compiled security specialist's amendment **L3** names this queue as one of the two failures it
answers, and asks for the bound *"inside the only function that can add to it, in the same
transaction"*, with the pruning function *"module-private as part of the same decision"* so that a
test **cannot** report that "prune works when invoked". A bound inside the only growth path cannot be
held by another package, because the growth path is here. So the policy is here. The older instinct
was right about defaults and wrong about where safety comes from.

**The bound is counted, not dated — and the authority for that is L3, not L4.** L4 (*"Retention on an
audit log must be counted, NEVER dated"*) is written about the audit log, and its counted alternative
rests on a sequence *"assigned by the chain"*, which is the journal's and not this queue's. It is not
claimed here that L4 reaches this package. The reason the bound counts is L3's own promise — that the
bound *"cannot be exceeded by any ordering, configuration or refactor"* — which a dated bound cannot
keep on this device: the cutoff of an age prune comes from the device clock, and a clock set backwards
means nothing is ever old enough to reach, for ever, **while every prune reports success**. `seq` is
allocated inside the enqueueing transaction and no setting can move it.

### 8.1 What the bound may never reach

Only `delivered`. **Nothing else is ever removed**: a rejected or ambiguous entry is not bounded at
all, because the problem it records does not stop mattering because more work landed. That range is
what spares the entry §8.3 is about, and `retention.test.js` and `status.test.js` both assert the
survivals BEFORE any tally, so a widened range reds on them rather than on a count.

The **newest** delivered entry always survives, by construction: a bound that could discard the entry
whose own delivery triggered it would lose the evidence of the delivery that just happened.

### 8.2 A purged client is taken out of the queue — the one exception to "kept"

Keeping delivered entries had a consequence nobody had joined up, and it was **measured, not
theorised**: a client created with a distinctive name and notes, synchronised, hard-deleted and
synchronised three more times left the record stores clean and the remote copies clean — while three
delivered entries still carried the name, the general notes and the readings **in plain text, for
ever**. The per-client purge swept every store except the one that accumulates by design, and the only
prune in the build was caller-owned with no caller anywhere outside a test. Neither half was wrong on
its own; the gap was between them, which is why no single suite's own tests caught it.

So `purgeClient` now sweeps the queue too, in its own transaction, through
`scrubClientFromOutbox` in `scrub.js`. The rules are the purge's two rules:

- **Nothing of the departed client remains.** Entries are rewritten record by record — their client
  record, their readings, their notes, their performed records come out of the payload.
- **No other client loses anything.** A queued copy of a session they SHARED is **replaced by the
  revision the purge just made** — the same session, minus them — rather than dropped, because that
  session is the other attendees' history and it is not the departing client's to take with them.

**Replay survives.** `entry_id`, `seq`, `idempotency_key`, `operation`, `name`, `target_file_id` and
`status` are never touched; only `payload` and `refs` change. A cleaned entry is therefore **still
replayable and is not removed** — even when the scrub empties its document, because an empty document
is a valid one and delivering it is harmless, whereas removing an undelivered entry would take it out
of the sequence and remove the queued row that stops a re-enqueue of the same key from queueing a
second copy. Risking a duplicate to save a few bytes is the wrong trade in this layer.

**The one place this layer parses a payload, declared.** Everywhere else `payload` is opaque text. The
scrub is the single deliberate exception, and it is bounded: it runs only during a purge, never on a
delivery path; it parses a payload only far enough to see whether it is one of **our own**
synchronisation documents, and anything else is `OPAQUE` and is never read further; and it never
decrypts — a sealed value is copied or dropped whole.

**What it refuses to decide silently.** An opaque payload whose `refs` name the departed client and
nobody else is removed outright — it cannot be cleaned and there is nothing else in it. An opaque
payload naming them **and another client** cannot be cleaned without destroying that other client's
data, so the entry is **left exactly as it is** and reported in the purge's manifest as `unresolved`,
by identity. Nothing in this core queues such a payload today, so that is a declared boundary with a
test on it, not a live path.

**THE BOUND DOES NOT MAKE THIS SCRUB REDUNDANT, AND MUST NEVER BE READ AS DOING SO.** The two answer
different questions and neither substitutes for the other. The bound removes the OLDEST evidence when
NEW deliveries arrive; a departed client's data has to leave when the coach deletes them, not when a
couple of hundred later deliveries happen to push it out. The purge reaches delivered entries directly
and immediately, which is the only timing that means anything to the person who was deleted.

### 8.3 One boundary, stated because it is easy to read the wrong way

The unresolved opaque-shared entry above survives the bound because it is **not delivered**, and so is
outside the only range the bound can walk. **Nothing checks whether an entry is unresolved.** Nothing
in this core can queue an opaque payload today, so a DELIVERED one cannot arise from the application —
but the day something does, the bound WILL be able to reach it and the surface that keeps naming those
entries would go quiet.

Two tests hold that boundary rather than prose, in the two shapes it takes:
`core/outbox/retention.test.js` proves the entry survives untouched, byte for byte, across three times
the cap, while it stays pending; `core/sync/retention.test.js` records the other half — **a
synchronisation pass FLUSHES pending entries, so a pass is exactly what turns such an entry into a
delivered one**, and a delivered one is inside the range. The day a step queues an opaque payload for
real, the sparing needs a guard of its own rather than resting on status, and those tests are what
will say so.

---

## 9. Running the tests

From `C:/Projects/Fit/app`:

```powershell
node --test core/outbox      # 75 tests, no install step, nothing to build
```

On this runtime a positional argument to `--test` is resolved as a **module**, not searched as a
directory. A directory only works as a target if it resolves to something that registers tests, which
is what `core/outbox/index.js` does and is its only purpose. Removing it would make the command
resolve to a module with no tests and report a pass having executed nothing — a gate that passes
vacuously, which is worse than one that fails. **Adding a suite to this directory means adding a line
to `index.js`.**

The suites, in the order `index.js` runs them: `entry` (what an entry must carry), `classify` (the
three failures), `durability` (restart, interruption, credential, order), `idempotency` (recognition),
`scrub` (the boundaries of the purge sweep — §8.1), `flush` (rejection, and the completed-sync claim),
`status` (the figures, and their cost).

The end-to-end proof of §8.1 — that a purged client's name and notes are in no entry at all — lives in
`core/sync/purge-outbox.test.js`, because putting them there needs a synchronisation pass. `scrub`
here proves what the sweep refuses to touch and what it declines to decide silently.

### 9.1 How a lost acknowledgement is reproduced, and one unfaithfulness declared

The dangerous state is: the remote accepted the write, and this device never recorded that it did.

**The double cannot produce that state through its own adversity.** Its failures are raised before the
write is applied, so a timed-out create genuinely did not land — whereas reality's timeout is precisely
the one whose outcome is unknown. That is a way in which the double is kinder than the service, and it
is recorded here and asserted as a value in `idempotency.test.js` rather than left as an absent check.

So the tests produce the state directly and honestly: the delivery is performed against the remote,
and then the local half is thrown away by restarting the application before any verdict is written.
That is the real sequence rather than a simulation of it. The entry is still pending, the file is
already there, and the replay has to work it out for itself.

---

## 10. Extending this

- A new **operation**: add it to `OPERATION`, give it a recognition rule in `recognition.js` **and say
  what that rule rests on**, and add a named helper in `enqueue.js` so callers cannot get the parts
  that must agree wrong. An operation with no recognition rule is a duplicate waiting to happen.
- A new **status**: it must be keyable text, must be classified into `TERMINAL_STATUSES` and
  `UNDELIVERED_STATUSES`, and must appear in `outboxStatus`. A status the figures do not count is data
  that has quietly left the coach's view.
- **Do not add an `in_flight` state.** See §6.1.
- **Do not add a conditional write**, however tempting the service's documentation looks. See `PORT.md`.
- **Do not resolve an ambiguous listing by picking one.** See §4.3.
