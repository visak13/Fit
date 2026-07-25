# Session durability and state

This document is the contract for what a session IS on this device: how it survives being
interrupted, why resuming is exact rather than approximately right, how the coach moves around it
freely, and what it costs to replay. It is the state and persistence layer for a running session,
not its screen — the session runner mounts on top of what is described here.

It is the counterpart to `MODEL.md`, which owns the **shape** of a record, and to
`core/store/STORE.md`, which owns the **storing** of one. This one owns what those records MEAN
when they are a session.

Code entry point: `core/session/session.js`.

---

## 1. What this layer is, and what it is not

`core/session` is **plain, dependency-free ECMAScript modules**. No framework, no bundler, no build
step, no third-party package. Types are expressed in documentation comments, so nothing here
presumes compilation and the test gate runs on the runtime's own test runner with nothing installed.

| File | What it holds |
| --- | --- |
| `session.js` | The barrel. Everything below, re-exported. |
| `errors.js` | The error taxonomy: state, closed, participant, journal full. |
| `journal.js` | **The append side.** The three facts a session records, and the read that hands the whole journal back. |
| `projection.js` | **Pure.** Every view of a session, derived from its journal. No clock, no store, no memory between calls. |
| `live-session.js` | Opening a session, recording into it, and leaving it. Holds the lease. |
| `glance.js` | The previous session at a glance — and the progression that is deliberately not here. |
| `testing.js` | A furnished device, for the suites. Not shipped to a browser. |
| `index.js` | **Test entry point only** — see §9. The API is `session.js`. |

It adds **no record kind, no object store and no database version**. A session's durability is the
store's durability. It holds no interface state, runs no timer, and decides nothing about what the
coach should do next.

It also does **not** touch the outbox, and that is deliberate rather than an omission. Every fact
recorded here lands durably in the local store, which stamps it into the `by_updated_at` index the
synchronisation engine walks; deciding what to back up, when, and as what payload is that engine's
job, and a session that enqueued its own deliveries would be a second place where that policy lives.
Nothing here makes a remote call or claims anything about one.

---

## 2. The shape: a record of what occurred, not a position in a script

This is the decision everything else falls out of, and it was the user's own emphasis.

A session is **not** a press-play-then-pause timeline. It is MODULAR: the coach jumps to any
exercise, reorders, skips, repeats, substitutes or edits mid-session, captures a reading or a note at
any moment, and leaves and returns **without the application having an opinion about where he should
be**. A linear guided player would make the application the driver of the session, and the standing
principle is that it is a supporting role. It tracks what happened. It never dictates what happens
next.

So the only thing this layer writes is a **fact that already happened**:

| Fact | Record | Written by |
| --- | --- | --- |
| one exercise, one client, as it was actually done | `performed-record` | `appendPerformed` |
| a measurement against one client | `reading` | `appendReading` |
| a note, about a client or about the session | `session-note` | `appendNote` |

Everything the interface shows — what has happened, what has not been recorded yet, what one client
did, the order the session ran in — is **derived** from those facts by `projection.js`.

> **The rule that keeps this true: anything describing where a session has got to is DERIVED, never
> persisted.** There is no stored cursor, no current exercise, no next exercise, no step index — not
> on the session record and not in the view. Two sources of truth about where a session is would
> eventually disagree, and they would disagree in the middle of a real session with a client waiting.
> A test asserts the absence on both the stored record and the derived view, because an absence is
> indistinguishable from an oversight to the next editor.

The record model anticipated this: the session record deliberately has no field for "which exercise
the app thinks he should be on", and a performed record's `position` is *where it fell in the session
as run*, which is not where the routine put it.

---

## 3. Interruption, and why resuming is exact

Real sessions are disturbed by power cuts, illness, phone calls and the browser simply closing.

### 3.1 There is no resume path

`openSession` is the only door, and it does the same thing whether the session is being started for
the first time or picked up forty minutes into a disturbed afternoon: **it reads the journal and
projects it.** A session that never started replays an empty journal. Nothing is restored, because
nothing was ever held anywhere else to restore from.

That is what makes an interruption at any point resume **exactly**: exactness is a property of the
shape, not of a save routine having remembered to run — and a save routine is precisely what a power
cut does not give you the chance to run. The tests take the cut at four different points, compare the
whole projected view before and after, and require it to be identical.

### 3.2 A clean exit is a courtesy, never a precondition

`interrupt()` records that he left, and the status becomes `interrupted`, which is a **first-class
state** rather than an error. A power cut records nothing at all and leaves the session at
`in_progress`. **Both are picked up the same way**, and neither loses a fact, because every fact was
committed as it happened rather than at the end. A resume path that only accepted `interrupted` would
fail in exactly the cases the requirement is about.

### 3.3 A half-finished session is a PARTIAL RECORD

`in_progress`, `interrupted` and `abandoned` all mean: this record holds what happened, without
claiming the session finished. Nothing is discarded, ever. There is no state in which closing the
application throws away what already happened — including an abandoned session, whose work is kept
and shown, and an interrupted one, which still appears as the client's previous session and says
plainly that it did not finish.

---

## 4. Moving around freely, and how each move is recorded

Each of these is asserted to be **recorded** — not merely permitted:

| The coach… | is recorded as | and reads back as |
| --- | --- | --- |
| **jumps** to the third exercise | one fact at position 0 | `order_as_run` follows him; the other two are `not_yet_recorded` |
| **reorders** | facts in the order they were appended | `order_as_run` differs from the routine's own order, and the routine keeps its order |
| **skips** | a fact with status `skipped` | the line has an outcome, so it is not still waiting to happen |
| **repeats** | a SECOND fact at a later position | `attempts` has both, `repeated` is true, and the first is not overwritten |
| **substitutes** | the substitute AND what it replaced | the attempt attaches to the line it replaced, not to a line of its own |
| **edits** | a revision of that fact | the correction lands; nothing else moves |

`not_yet_recorded` is the closest thing here to a suggestion, and it is not one: it is a statement
about the RECORD — these lines have nothing against them yet — presented in the routine's own
declared order, which is *a default, not a script*.

Work outside the routine altogether appears as `beyond_the_routine` rather than being dropped or
being made to stand in for a line the routine did name.

---

## 5. The bound: what grows, what does not, and what it costs

An append-only record grows and the cost of replaying it grows with it, and there is a standing
requirement that local data must not pile up and degrade performance. Session and client volumes are
**unknown and cannot be clarified**, so "it will be small" is not an argument available here. The
numbers below are measured by `bounds.test.js`, not estimated.

### 5.1 Replay is bounded by ONE session

Every index this layer reads through is keyed by session (and by client within it), so replaying a
session reads that session's own records and essentially nothing else. **Measured: a one-hour
three-client session of 27 records replays in 33 rows read. Ten times the history on the same device
costs exactly the same** — the test asserts equality on the store's own row counter, which is the
only honest way to tell a bounded read from a `getAll().filter()` that happens to look right.

Nothing in this layer ever replays more than one session. Walking a client's history across sessions
is the store's paged business, not a replay.

### 5.2 Appending is O(1), and does not re-read the session

Recording a fact does **not** re-derive the view: a session of N facts would otherwise cost N
re-reads of a journal that is itself growing, which is quadratic in the length of a session for no
benefit — the coach's next repaint asks for the view once, however many facts went in. What an append
updates is the append position and the counts, which are the only things the next append needs, and
both are re-seeded from what is stored on every `refresh()`. **Measured: the fiftieth fact of a
session costs exactly as many rows read as the first.**

### 5.3 One session's journal is CAPPED, and the cap is what makes the read safe

`JOURNAL_LIMITS`: **400 performed records per client, 400 readings per client, 400 notes per
session.**

These are not arbitrary. The store reads a session's own detail **whole** — deliberately, since a
session runs about an hour and paging it would cost more in round trips than it saves — and that read
pages at 500 matching rows, returning a page rather than an error when it hits the limit. A journal
allowed past 500 would therefore be **silently truncated on read**, and the session would appear to
have recorded less than it did. That is the failure shape this build has been bitten by three times:
an absence that looks like a pass. The caps sit below the limit, a test fills a journal **to** the cap
and proves every record still comes back, and the 401st append is refused loudly with a message that
says the record is intact and this session is simply full.

Four hundred facts for one person in one hour is not a session that happened; it is a runaway caller.
Refusing at a stated bound is what turns that into something the coach is told about.

### 5.4 Where this would start to be felt, stated plainly

The realistic ceiling is a full session: a large shared session of forty attendees with twenty facts
each is about 800 records, replayed in roughly as many rows — a fraction of a second, once, when the
session is opened. The *theoretical* ceiling the caps allow is about 32,000 records in one session,
which would be perceptible on a phone; it is unreachable in an hour of coaching and is exactly what
the caps exist to make loud rather than slow.

**No snapshot and no compaction are built, deliberately.** A periodic derived snapshot is the
conventional answer to an unbounded log, and this log is not unbounded: it is bounded per session and
capped within it, and the measured replay cost of a real session is a few dozen rows. Building a
snapshot would add a second thing that describes where a session is — the exact hazard §2 exists to
prevent — for no measured gain. If it is ever needed, the rule it must obey is already known: **the
snapshot is a cache of the projection, the log stays authoritative, and a corrupt or absent snapshot
degrades to full replay rather than to wrong state.**

---

## 6. One routine, one to many clients

A session is a ROUTINE plus a SET of attending clients. A single application instance always drives a
**single** routine, however many people are in the call; two people needing different programmes is
handled by running two instances, and nothing here models parallel routines in one session.

Everything else is **per client**, always, even though the session was shared: their own performed
records, their own readings, their own notes, their own loads. The coach may adapt an exercise for one
tired client while the rest continue, and that is a substitution on that person's line — not a fork of
the session. Progress views and exports remain strictly per client. A test drives three clients through
one session and asserts that no client's load, reading or note appears in another's view.

A latecomer can be added mid-session. Somebody added by mistake can be removed **until they have
recorded anything** — after that it is refused, because removing an attendee with results would strand
their record outside any session they attended. Removing a person from history is a purge, which is a
different, deliberate operation belonging to the store.

---

## 7. Two windows on one laptop

Supported deliberately, and laptop only. Opening a session takes the store's lease on it, and the
second window is **told** — `{ ok: false, reason: 'held_elsewhere' }` with a sentence to show him —
rather than quietly appending to a session the other window is running. An ordinary situation is
reported as a value; only a genuine failure throws.

Two properties hold and they are different properties: **isolation** is the lease's doing, and **no
corruption** is the transaction's. This layer relies on both and enforces neither by itself — a
session-scoped write with no lease on a live session is refused by the store, inside the same
transaction that would have written it, so going around this layer does not get past it. The tests
drive two real stores over one database: two live sessions at once with different routines, neither
losing a fact, each resume bringing back its own session.

`detach()` releases the lease without saying anything about the session's state — moving to the other
window, or closing this one. The session stays exactly where a power cut would have left it.

---

## 8. The previous session at a glance

A stated requirement: when the coach starts a session, the app shows the previous one — the exercises
performed, any loads recorded and the readings taken — so progress can be monitored across sessions.
`previousSessionAtAGlance` is that panel, per client, and it shows the session BEFORE the one being
started.

> **It shows. It does not suggest.** There is no automatic week-over-week progression anywhere in this
> application, and this is the screen where adding one would feel most helpful. Nothing here proposes
> a heavier load, a longer hold or more repetitions; nothing compares two sessions to derive a
> direction; nothing carries a load forward as a default. A load is a per-client OBSERVATION the coach
> made, shown back to him exactly as he wrote it, so that HE can decide whether anything goes up. That
> judgement belongs to a certified professional who is also adapting to a client's history.

A test asserts that neither the panel nor the module's own source names a suggestion, a
recommendation or a progression — an absent feature and a forgotten one look identical to the next
editor.

An interrupted session is still shown as the previous session, marked as a partial record. Hiding it
would lose the last thing that actually happened.

---

## 9. Running the tests

From `C:/Projects/Fit/app`:

```powershell
node --test core/session      # 42 tests, no install step, nothing to build
```

On Node 25 a positional argument to `--test` is a **file glob, not a directory to search**. A
directory only works as a target if it resolves to a module that registers tests, which is what
`core/session/index.js` does and is its only purpose. Removing it would make the command resolve to a
barrel with no tests and report `pass 1, fail 0` having executed nothing — a gate that passes
vacuously, which is worse than one that fails. **Adding a suite to this directory means adding a line
to `index.js`.**

| Suite | What it holds up |
| --- | --- |
| `projection.test.js` | The pure reducer: same journal, same view; order of arrival is irrelevant. Imported first — if this is wrong, nothing else in here means anything. |
| `durability.test.js` | The cut taken at four points, resuming exactly; the partial record; the abandoned session; both resumable shapes offered back. |
| `modularity.test.js` | Jump, reorder, skip, repeat, substitute, edit — each recorded. And the absence of a cursor. |
| `multi-client.test.js` | Three clients, one routine, per-client everything; the latecomer; the roster guard. |
| `isolation.test.js` | Two windows, two live sessions, one database. Nothing lost, nothing crossed. |
| `glance.test.js` | The previous session, and the progression that is not there. |
| `bounds.test.js` | §5, measured on the store's row counter. |

### 9.1 What the simulated interruption cannot reproduce

A cut is simulated by dropping the store and opening a new one on the same database **without calling
anything on the live session**: no status, no end time, no summary. That is exactly the state a real
cut leaves in the database, and the database is the only thing that survives a cut.

The one thing it cannot reproduce is the lease, which is held by an unresolved promise and released by
the platform when the page dies; closing the store releases it too. **A simulated cut is therefore
kinder than a real one in that single respect**, and it is named here rather than left implicit,
because a double kinder than reality moves the failure somewhere more expensive. Nothing in these
tests depends on the lease surviving a cut.

**A passing test against a double proves the logic. It never proves the platform.** Nothing here has
run against a real browser database, and no Google call is made or claimed anywhere in this layer.

---

## 10. Extending this

- A new **fact a session can record**: add an append to `journal.js`, give it a cap in
  `JOURNAL_LIMITS` below the store's detail-read limit, read it in `readJournal`, and derive it in
  `projection.js`. Do not add a field to the session record to hold it.
- A new **view of a session**: derive it in `projection.js`, from the journal. Not from another view,
  and not from anything stored alongside the record.
- **Do not add a stored cursor, current-exercise field, or progress marker.** See §2. If a screen
  needs to remember where the coach was looking, that is the screen's own transient state and it does
  not belong in the record.
- **Do not carry a load forward.** See §8.
- A **snapshot**, if §5.4 ever stops being true: cache of the projection, log authoritative, absent
  snapshot degrades to full replay.
