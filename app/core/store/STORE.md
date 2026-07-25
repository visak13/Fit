# The local durable store

This document is the contract for how the application reads and writes on **this device**. It
covers the durability guarantee and how it is made structural, the database shape and every index,
which operations remain linear and why that is acceptable, how two windows on one laptop are
coordinated, and what happens when a client is removed.

It is the counterpart to `MODEL.md`, which owns the **shape** of a record. This one owns the
**storing** of it. Neither performs cryptography, and neither can read a sealed value.

Code entry point: `core/store/store.js`.

---

## 1. What this layer is, and what it is not

`core/store` is **plain, dependency-free ECMAScript modules**. No framework, no bundler, no build
step, no third-party package. Types are expressed in documentation comments, so nothing here
presumes compilation, and the test gate runs on the runtime's own test runner with nothing
installed. Whatever front-end stack is chosen must be able to adopt this core **unchanged**.

| File | What it holds |
| --- | --- |
| `store.js` | The barrel. Everything below, re-exported. |
| `errors.js` | The error taxonomy: validation, conflict, write failure, lease, capability. |
| `platform.js` | The four browser facilities this layer uses, named and injected. |
| `capabilities.js` | What this device can do — including the laptop-only one. |
| `keys.js` | The platform's key order and comparison, and the paging range helpers. |
| `schema.js` | The object stores and every index, as data, each naming the query it answers. |
| `db.js` | **The durability chokepoint.** The only writable-transaction door. |
| `local-store.js` | The store itself: create, revise, tombstone, import, apply-from-elsewhere. |
| `queries.js` | Every query the application asks. Each indexed, each paged. |
| `coordination.js` | Session leases and cross-window change notification. |
| `purge.js` | Archiving a client, and removing one completely. |
| `testing/` | The in-memory doubles. Not shipped to a browser; used only by the tests. |
| `index.js` | **Test entry point only** — see §9. The API is `store.js`. |

It holds **no policy**. It does not decide when to sync, whether to resume an interrupted session,
or what a progress report says. It makes those decisions possible and cheap, and it refuses the
writes that would corrupt them.

---

## 2. Durability before acknowledgement, made structural

The governing standard is that the coach's livelihood depends on this data, and therefore **every
write lands durably before any interface acknowledgement.** That is a structure here, not a
convention.

### 2.1 The gap this closes

The local database signals a write **twice**, and the two are far apart in meaning:

1. the individual request succeeds — the value is in the transaction, and nothing is on disk;
2. the transaction completes — the write has genuinely committed.

Between the two, the transaction can still abort, and everything in it vanishes. A store that
resolves its save on (1) will tell the coach his session is saved and then lose it — and it will do
so under test as happily as in production, because the test observed (1) too.

### 2.2 The one door

`runWrite` in `db.js` is the **only** function in this package that opens a writable transaction. It
resolves on (2) and nothing else: its callback may read and write and return a value, and that value
is **withheld until the commit lands**. There is no exported seam by which a caller obtains a
writable transaction, so there is no path by which a caller can be told a thing is saved when it is
not.

Three tests hold that claim up, and the third is the one that keeps it true over time:

- **ordering** — the recorded event sequence is `request:success`, then `tx:complete`, then the
  promise resolving;
- **failure** — a commit made to fail leaves the promise rejected and the database unchanged, even
  though every request inside it had succeeded;
- **intent** — no file outside `db.js` contains the read-write mode as a string literal. A second
  door is the way this guarantee would be lost, so its absence is asserted rather than assumed.

### 2.3 Failure is loud

A transaction that does not commit throws `StoreWriteError`. It is never a returned status and never
a resolved promise with a flag, because the one outcome this layer exists to prevent is a caller
carrying on as though the write had landed.

### 2.4 Notification comes after the commit

Other windows are told about a change **after** it commits. A peer told about a write that has not
landed is an acknowledgement by another door, and it would act on data that may still vanish. A
write that fails announces nothing at all.

---

## 3. The database shape

One object store per record kind, keyed on `record_id`. A single store keyed on identity would need
a type index and would put every query behind it, so listing clients would walk sessions.

Every index in `schema.js` names the question it answers, and an index without a query in
`queries.js` should not exist — an index is maintained on every write.

### 3.1 Two derived stores

**`session_participants`** exists because the platform cannot index what is needed. A session carries
a **set** of clients, and there is no compound multi-entry index, so "this client's sessions in time
order" is unanswerable from the sessions store alone at any acceptable cost. The derived store holds
one row per (client, session), keyed `[client_id, sort_at, session_record_id]`, which makes one
client's history a contiguous range: ordered paging and most-recent-session are both bounded reads.

> **The invariant that keeps it from being a cache: participant rows are rebuilt in the SAME
> transaction as the session they derive from, always.** There is no code path that writes a session
> without rebuilding them, because both happen in one commit or neither happens. A later maintainer
> optimising the write path is exactly who would break this — the derivation would then be a cache,
> and a cache over one shared database with two windows writing drifts. `storesFor('session')`
> always includes the participants store, so a transaction cannot even be opened without it, and a
> test asserts that.

The sort key resolves to when the session **started**, else when it was **scheduled**, else when the
record was **created**. It is never absent, because a compound key with a missing component produces
no index entry at all — the session would simply vanish from its clients' histories.

**`deletions`** is the manifest a purge leaves behind. See §7.

### 3.2 No index is on a boolean

A boolean is not a valid database key, so an index on one silently contains **no entries** and every
query against it returns nothing while looking perfectly reasonable. That is the trap behind listing
clients by `active`, and the schema avoids it: the roster is indexed by name, and the active filter is
applied while walking. The double reproduces this behaviour so the trap cannot be re-introduced
without a test noticing.

---

## 4. Every read is keyed or paged

Session and client volumes are **unknown and cannot be clarified**. The coach may have a dozen
clients or two hundred, and a month of history or five years. So no query loads a collection in order
to filter or sort it: every list returns `{ items, cursor, done }` and the caller asks for the next
page.

`done` is true only when the range is **definitively** exhausted. A full page is reported as not
done, even if it happened to be the last one — so the next page may be empty, and that is correct
rather than a bug.

The tests prove this **by counting the rows the database actually handed over**, not by reading the
code. A query written as `getAll().filter().sort().slice()` looks reasonable, passes every functional
test, and reads the whole store to answer a question about one client. The row counter is what tells
the difference: a five-session page out of an eighty-session practice reads no more than twelve rows.

### 4.1 What remains linear, and why that is acceptable

Three things. **None of them grows with the practice as a whole**, which is the property that
matters.

1. **The deletion sweep** (§7) visits every row belonging to the client being removed. It has to —
   the point is that nothing of theirs is left. It is linear in *that client's* history and touches
   nobody else's.
2. **A session's own detail** — what one client performed in one session, the readings taken, the
   notes — is read whole. A session runs about an hour and holds a handful of exercises per client;
   there is no page worth turning, and paging it would cost more in round trips than it saves.
3. **Filtering archived clients during the roster walk** — see §3.2. The extra cost is the archived
   clients skipped over, which is a fraction of the roster rather than a multiple of it. A second
   derived store, as sessions need, is not worth its maintenance for a list a person reads.

If the roster ever became large enough for (3) to be felt, the fix is the same pattern as
`session_participants`, and it is a contained change.

### 4.2 The previous session at a glance

A stated requirement: when the coach starts a session, the app shows the previous one — the exercises
performed, the loads, and the readings taken. `previousSessionForClient` answers it in one reverse
step over the participants range plus that session's own detail.

It **shows**; it does not suggest. Nothing here proposes a heavier load, a longer hold or more
repetitions, and nothing derives a progression. That judgement belongs to the coach, who is also
adapting to a client's history. Everything is **per client**, even when the session was shared: each
attendee has their own performed records, readings and notes, and one client's must never appear in
another's view.

---

## 5. Two windows on one laptop

The coach may have **two windows open, each running a live session with a different routine**,
against one local database. That is supported deliberately. Two properties have to hold, and they
are different properties.

### 5.1 Per-session isolation — enforced, not advised

One window per session. `acquireSessionLease` returns `null` rather than waiting when another window
holds it, so the coach is told *"that session is open in your other window"* instead of watching a
spinner.

A record belonging to a session that is **currently live** can only be written by the window holding
that session's lease, and starting a session requires holding it too — a window cannot start a
session it does not hold. The check reads the session's stored status inside the same transaction as
the write, so it cannot be talked out of by a caller.

A session that has **finished** is freely editable. Writing up a note afterwards is ordinary work.
Only the live case can be corrupted, and only the live case is guarded.

The lease is held by an **unresolved promise**, which is the platform's own model and the better one:
a window that crashes, is closed or is discarded by the operating system releases it automatically. A
lease stored in a table would outlive the window holding it and lock the coach out of his own
session, with no way to clear it except knowing to.

### 5.2 No corruption — and this is not the lock's job

Locking makes two windows *deliberate*. The **transaction** is what makes them *safe*:

- every mutation reads and writes inside **one** transaction;
- the platform serialises overlapping read-write transactions;
- the edit function runs on what is *actually stored*, not on what a screen last saw, so two
  simultaneous edits **compose** instead of one overwriting the other;
- `expectRev` makes a write conditional on the revision a screen was showing, and the loser gets
  `StoreConflictError` rather than silently winning.

A lock alone would leave the store trusting that every writer remembered to take it. The tests drive
two real stores over one database and assert that neither window's write is ever lost.

### 5.3 Laptop only. Mobile must not offer it

> **Running two live sessions at once is a LAPTOP capability. The mobile build must not offer it —
> not disabled with a message, not degraded, not attempted: absent.**

The phone is used in person, one client at a time; a second live session there would be an
accidentally-opened tab, not an intention. The interface reads
`store.capabilities.concurrentSessions` and hides the feature. It must not sniff the device itself,
and it must not treat the absence as an error to work around.

It **fails closed**: a device that cannot be classified is not a laptop, and a browser missing the
lock manager or the message channel is not offered it either. The cost of a false negative is a
feature the coach does not see; the cost of a false positive is two windows writing over each other
mid-session. Where the facilities are absent, leases still work but say what they are —
`lease.crossContext === false` — and nothing pretends otherwise.

---

## 6. Ciphertext is carried, never inspected

Three fields on the client record are ciphertext. This layer moves them exactly as it moves any other
value: it never encrypts, never decrypts, never inspects and never logs them, and it **does not even
name them**. The field list lives in the model, and a test asserts that no file in this package
mentions any of those names — so if a module here started special-casing the clinical note, it would
have to name it, and the test would fail.

A tombstone drops its content entirely, so a departed client's clinical note cannot live on inside
the revision that records their departure.

Key generation, the multi-slot key envelope, adopting an existing envelope before writing, and the
refusal to create a clinical note on a device that has never synced all belong to a later step. The
model and the store stay equally innocent of it.

---

## 7. Removing a client

Two operations, and they are not variations of each other.

**Archiving** is what happens when a client stops coming: the record stays, marked inactive, out of
the roster but still in the history. Reversible. **The ordinary path.**

**Purging** is the deliberate one-click action: this client's records are removed from this device
outright, and a manifest is left behind so the same removal reaches the remote copy and its backups. A
departed client's clinical note must not live on in a backup forever.

### 7.1 Two things must BOTH hold

A purge is worded as *remove everything*, and a careless reading of that destroys somebody else's
history. Sessions are one routine and one to **many** clients, so:

1. **Nothing of the departed client remains.** Their client record, performed records, readings,
   notes, diet plans and derived index rows — all gone, with no tombstone left holding a payload.
2. **No other client loses anything.** A **shared** session is *not deleted*. The departed client is
   removed from its participant set as a revision, and the other attendees keep the session, their own
   performed records, their own readings and their own notes. That session is **their** history and it
   is not the departing client's to take with them.

A session left with **no** remaining participants is removed, along with anything still pointing at it
— including a note that was about the session as a whole rather than about a person, which would
otherwise be orphaned.

### 7.1a The queue is one more place their detail lives

Sweeping every record store was **not** enough, and that was measured rather than argued: a client
created with a distinctive name and notes, synchronised, purged and synchronised three more times left
the record stores clean and the remote copies clean — while **delivered outbox entries still carried
the name, the general notes and the readings in plain text**. Delivered entries are kept deliberately
and pruned only by a caller who decides to, so they accumulate; and the purge swept every store except
the one they accumulate in.

`purgeClient` therefore holds `OUTBOX_STORE` open in the **same transaction** as the record stores and
calls `scrubClientFromOutbox` (`core/outbox/scrub.js`). There is no window in which the rows are gone
and the queue still holds them, and a failure anywhere leaves everything as it was. The two rules of
§7.1 apply there unchanged: a queued copy of a shared session is **replaced by the revision made
here**, not dropped, so the other attendees keep it. A cleaned entry stays replayable — `seq`,
`idempotency_key`, `name` and `status` are never rewritten. The trade-offs, the single place that
layer parses a payload, and the one case it refuses to decide silently are all in `OUTBOX.md` §8.1.

### 7.2 Why a manifest rather than tombstones

An ordinary deletion is a tombstone, which propagates by itself. A purge deliberately removes the rows
instead, because a tombstone is a record and this operation exists to leave no record. That removes
the thing that would have carried the news outward — so the news is carried explicitly.

**The manifest contains no content.** No name, no note, no ciphertext: record identities, types and
revisions only. A manifest naming the client would reintroduce exactly what the purge removed, and
would then be synced. A test asserts this rather than trusting it.

### 7.3 What the synchronisation engine gets

```js
{
  deletion_id, manifest_version, subject_client_id, requested_at, device,
  status: 'pending' | 'propagated' | 'failed',
  attempts, last_error, propagated_at,
  removed: [{ type, record_id }],        // delete these remotely, and in archived copies
  revised: [{ type, record_id, rev }],   // push these revisions instead — shared sessions
  outbox:  { inspected, rewritten, removed, unresolved: [{ entry_id, why, record_ids }] },
  sweep:   { archived_copies: true, remote_backups: true },
}
```

`outbox` is **local bookkeeping** — counts and identities, never content — and the outward notice does
not carry it. `manifest_version` is therefore unchanged: it describes what *leaves* the device, and
what leaves the device is exactly what it was. `unresolved` is how the sweep says out loud that an
entry could not be cleaned without destroying another client's data, instead of choosing silently.

`pendingDeletions` is the queue it reads; `markDeletionPropagated` and `markDeletionFailed` are how it
reports back. A failure keeps the manifest **pending**: a deletion that quietly stopped being retried
is a departed client's note living on in a backup with nothing left saying it should not. A propagated
manifest is **kept**, not removed — it is the evidence the removal completed, which is what makes
*"their note is not in the backup any more"* checkable rather than merely intended.

### 7.4 One transaction

The whole purge commits at once or not at all. A half-purged client — rows gone, manifest missing —
would be silently unrecoverable: the local rows are gone and nothing remains to tell the remote copy,
so the departed client's data would live on in the backup with no trace of the intent to remove it.
That is the worst outcome available here, and one transaction is what forecloses it.

---

## 8. Unreferenced content is NORMAL and PROTECTED

`PRUNES_UNREFERENCED_CONTENT` is `false`, as a **declared value asserted by a test** rather than as an
absent check — because an absence is indistinguishable from an oversight, and the next editor "fixes"
it.

No path here deletes a record because nothing references it. The shipped exercise catalogue
deliberately exceeds the shipped week, and **the surplus IS the substitution pool**: it is what the
coach swaps to when a client is tired, and what the intensity adapter draws on beyond a routine's own
list. An import, reset, migration or backup that tidied away unreferenced entries would silently
delete precisely that pool, under the appearance of housekeeping, and it would surface in front of a
client as a substitution with nothing to offer.

Referential checks run in **one direction only**: every exercise a routine names must exist; never the
reverse. Treat any pruning of unreferenced content as a defect, not as tidying.

---

## 9. Running the tests

From `C:/Projects/Fit/app`:

```powershell
node --test core/store      # 75 tests, no install step, nothing to build
```

On Node 25 a positional argument to `--test` is a **file glob, not a directory to search** —
`node --test .` reports `Could not find '.'`. A directory only works as a target if it resolves to a
module that registers tests, which is what `core/store/index.js` does and is its only purpose.
Removing it would make the command resolve to a barrel with no tests and report `pass 1, fail 0`
having executed nothing — a gate that passes vacuously, which is worse than one that fails. **Adding a
suite to this directory means adding a line to `index.js`.**

### 9.1 The doubles, and the one rule they are written to

The runtime has no local database, no lock manager and no cross-window messaging, so `testing/`
supplies all three. **A double kinder than reality makes the tests pass and moves the failure
somewhere more expensive**, so everything that could have been simplified in the store's favour
deliberately was not:

- a request succeeds **before** the transaction completes, always — that gap is the whole of §2.1, and
  collapsing it would make the durability test prove nothing while looking green;
- an abort **undoes** the writes, so "the requests succeeded but the data is gone" is a state the
  tests can actually reach, and `faults.failCommit` reaches it on demand;
- read-write transactions on one database **do not interleave**, which is what turns a lost update
  between two windows into a detected conflict rather than into luck;
- a boolean, and any missing key-path component, produces **no index entry**;
- key order is the platform's, taken from `keys.js` — the same module the store's paging uses, so the
  tests are not checking the double's arithmetic against itself.

`double.test.js` verifies the double first, and `index.js` imports it first. If one of those tests
fails, no other result in the directory means anything.

Where the double knowingly differs: a cursor snapshots its matching records when it opens, where a
browser's is live (no code here mutates a store while walking it — the deletion sweep collects keys
first for exactly that reason); read-only transactions are serialised too, which is *stricter* than a
browser and therefore hides nothing; and storage quota is unlimited unless a fault asks otherwise.

**A passing test against a double proves the logic. It never proves the platform.** Nothing here has
been run against a real browser database, and the first time the application opens one is the first
real evidence.

---

## 10. Extending this

- A new **record kind**: add its store to `RECORD_STORES` and a `SCHEMA` entry with a bumped
  `DB_VERSION`. A test asserts the model's kinds and this file's stores stay in step, so a kind added
  to one and not the other fails immediately rather than at the first write.
- A new **query**: add it to `queries.js`, paged, and add whatever index it needs to `SCHEMA` — with
  the question it answers written beside it.
- A **migration**: `MIGRATIONS` in `schema.js` is empty and deliberately present. Use the seam; a
  migration written ad hoc inside the upgrade handler is how a store loses data.
- Do **not** add a second writable-transaction door. See §2.2.
