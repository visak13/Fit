# The event log

The append-only record of what happened to the data on this device: who was let in, what changed,
what left the application, what was synchronised, and what happened to the keys.

- `journal.js` — the module API. Import from here.
- `kinds.js` — the closed vocabulary, and the refusal that keeps it closed.
- `entry.js` — the entry shape, and the three layers that keep a record's content out of it.
- `chain.js` — the per-device hash chain and the verification pass that says WHERE it broke.
- `retention.js` — the policy that bounds the log: what it discards and what that costs.
- `durable.js` — the seam to `core/store`: the append path, the anchor, and the prune.
- `index.js` — the TEST ENTRY POINT, not the API. Adding a suite means adding a line to it.

The first four are **pure logic** — what an entry IS and how entries chain, with no database in
sight. The last two are where the log becomes durable.

## Where the log is written from

There are **two doors and only two**, and which one a call site uses is not a matter of taste.

**`recordChange`** — for a change to a record. The entry commits in the same transaction as the
change, so neither can exist without the other.

**`recordEvent`** — for something that happened and changed no record. It is `recordChange` with no
work to do, so the head re-read, the race retry and the retention bound come along unchanged rather
than being reimplemented.

**The test is whether there is a PAIRED STORE WRITE the entry has to be consistent with**, not
whether the domain feels transactional. Where the thing recorded IS a store change, riding its
transaction is the only correct shape; where there is no second write, there is nothing for the
entry to be inconsistent with and standing alone is the whole of it. Reaching for `recordEvent`
because it takes fewer arguments is how the hole this file argues against comes back.

Three domains write today, and they were wired at their choke points rather than at their callers:

| domain | written from | door |
| --- | --- | --- |
| record changes | `core/store/local-store.js`, `core/store/purge.js` | `recordChange` |
| synchronisation | `core/sync/engine.js` | `recordEvent` |
| keys and recovery | `core/crypto/guard.js` | `recordEvent`, via an injected sink |

`local-store.js` is the application's only way to change a record on this device, so wiring its five
mutating methods is what makes the record-change domain complete; wiring the screens instead would
have made it complete only for the screens somebody remembered. A test asserts that exactly one
direct write transaction remains in that class — `setMeta`, which writes cursors and stamps rather
than records — so a sixth mutating method cannot arrive unwired.

**`core/crypto` does not import this package's durable half.** It is handed a function and calls it,
which keeps that package pure and port-abstract. That function is a **required** argument rather
than an optional one, and the reason belongs here because the next person to find a required
argument inconvenient will make it optional: this build has twice shipped a correct routine nothing
reached, and retention above is enforced by the append itself for exactly that reason. An optional
sink is one a later call site omits and still compiles — and the omission is invisible afterwards,
because an installation with no key history looks precisely like one where nothing ever happened.

### A mutation that changes nothing records nothing

`putRecord` and `importRecords` can discover, inside the transaction, that the local copy already
wins. The entry was hashed before that transaction opened and cannot be withdrawn from inside it, so
the work throws and the transaction aborts, taking the entry with it. Aborting is free there and only
there: on those paths nothing had been written. **An entry asserting an import that did not happen is
the same defect as a missing one, pointing the other way** — and the second is not the smaller of the
two, because a log that overstates cannot be told from one that is right.

### The kinds nothing writes, and why each

Nothing stubs a call site to make the vocabulary look fully exercised. `unwritten-kinds.test.js`
asserts a partition over the whole vocabulary in **both** directions — every wired kind has a call
site in the file that owns it, and every unwritten kind has none — so a kind can neither quietly stop
being written nor quietly acquire a stub.

- **Authentication** (five kinds) — owned by the step that builds the unlock screen. Not built.
- **Exports** (three kinds) — owned by the reports and admin step. Not built.
- **`key.slot_removed`** — nothing withdraws a way into the data key. The one place a slot disappears
  is adoption replacing this device's own dead slot as it adds a live one, which is part of adding.

## Why the vocabulary is defined here, before anything writes to it

The decision this step serves was taken back after being declined once, and its closing words are
the brief: *"It must be designed before the shell hardens, since every later step writes to it.
Ownership: assign to a step, do not let each step invent its own."*

That is why the set of kinds is **closed** and why writing an unknown one **throws**. An audit log
whose vocabulary grows one string at a time, at whichever call site needed one that afternoon,
cannot answer a question: "every authentication event" becomes a search over strings that four
different steps spelled four different ways, and the answer is silently incomplete — which is worse
than no answer, because it looks like one.

**Authentication and export kinds are defined here and have no call sites.** The steps that own them
have not been built. Defining them now is not premature; it is the entire reason this step comes
first. Nothing here stubs a fake call site to make a kind look used. See *The kinds nothing writes*
above for the full list, which is asserted rather than described.

The vocabulary is **closed, not frozen**. The wiring step added three kinds to the key-and-recovery
domain — `key.establish_refused` and the two duplicate detections — because that activity is real,
happens in `core/crypto/guard.js` today, and no defined kind covered it. Forcing a refusal to create
key material into `key.recovery_refused`, which means a recovery attempt that failed to open the key,
would have been a lie in the vocabulary that every later reader inherits. That is this file's
extension procedure working: a kind arrives beside every other kind, with its domain and its subject
rule, in a reviewed diff — rather than a call site passing a string that happens to work.

If a later step needs a kind that is not here, it adds one to `kinds.js` — one line in a reviewed
diff, beside every other kind, with the domain it belongs to and whether it names a record. There is
no permissive mode, no warn-instead option, and deliberately no catch-all `other`: a fallback would
be the escape hatch that makes the whole vocabulary advisory.

### The five domains, and the sixth thing

The security standard names five domains that must be recorded, and all five are present:
authentication, record changes, exports, synchronisation, and key and recovery activity.

There is one kind outside the five — `journal.retention_pruned`. See **Retention and the head**
below: a log that discards its own oldest entries and does not say so is a log that cannot tell its
own housekeeping apart from an attack.

### The result is part of the kind

`auth.unlocked` and `auth.unlock_refused` are two kinds, not one kind with an outcome flag. A flag
would be a boolean, **and a boolean is not a valid database key on this platform** — an index on one
silently holds zero entries while every query against it comes back empty and looks reasonable. This
build has been bitten by that twice. "Every refused unlock" is exactly the query an index would have
to answer, so the result is keyable text or it is unqueryable. See the note on `by_status_seq` in
`core/store/schema.js`.

## What an entry may say, and the three layers that hold it there

An entry records **THAT** something happened, of a kind from the vocabulary, **TO WHICH** record
identity, **WHEN**, and on **WHICH DEVICE**. Never what the record contains.

That matters because every guarantee this application makes about clinical data — sealed fields,
deletion that propagates, a per-client purge that removes rows outright so nothing survives in a
backup — is a guarantee about a **known set of places the data is**. An audit entry carrying a copy
of a note would be a place nobody sweeps. This build has already measured exactly that failure once:
after a client purge and three syncs, delivered outbox entries still held the client's name and
notes text while the record stores and the remote copy were clean.

So the rule is structural, not a naming convention:

1. **A closed set of fields.** `createEntry` refuses any key outside `ENTRY_FIELDS`. There is no
   `detail`, `meta`, `payload`, `note` or `reason`. A caller with something extra to say has nowhere
   to put it.
2. **No nested structure.** Values must be text, a whole number or null. The one exception is the
   subject, which holds exactly `type` and `record_id`.
3. **Identifiers must look like identifiers.** `type` and `record_id` are matched against patterns
   admitting no whitespace, with bounded lengths, so prose cannot be parked in an identifier field.

The only field that grows with the work is `affected_count` — **a count, deliberately, because a
count cannot carry a name, a note or a measurement.**

### The device is the store's device tag

`device` is the tag `openLocalStore({ device })` already requires and the instance carries as
`this.device`. There is no second device identity anywhere in this package.

### Who acted — a stated gap, not a solved problem

The standard also asks for the ACTOR. This application has one operator and no server accounts, and
the honest actor identity available today is the device tag. **On a shared device the log cannot say
which person acted.** That is written here rather than papered over. Closing it belongs to the step
that builds authentication, which will have an identity to record; until then the log must not imply
it has one.

### The time is the device clock

`at` comes from the device. A device clock can be wrong, can drift, and can be set by the person the
log is recording; there is no trusted time source in an offline-first application. What the log does
have is **order** — the chain fixes the sequence entries were written in regardless of what their
timestamps claim, so a back-dated entry is still detectably out of position.

## The chain — tamper-EVIDENCE, and not one word more

Each entry carries the digest of its predecessor, and its own digest covers that link along with its
own fields, so altering or removing one entry breaks a digest the next entry already committed to.
The digest is SHA-256 through `core/crypto` — the only place in this application where an algorithm
name appears. Nothing here invents a construction.

**Anyone who can write this database can rewrite the chain from any point forward.** The log lives
on a device the user controls; the digest is unkeyed; there is no secret an attacker with local
write access does not also have. A recomputed chain verifies cleanly, because a recomputed chain
*is* clean. This is stated plainly because the opposite claim is the tempting one.

What the chain therefore actually detects: accidental corruption, a partial or careless edit, a row
deleted by something that did not know to fix up its neighbours, and a copy of the log altered
somewhere other than the device that wrote it. That is a real and useful set. It is not "the log
cannot be forged".

**No claim of compliance is made anywhere in this package**, and none should be added. An
integrity-protected log is one control among many; whether an organisation meets an obligation is a
matter of contracts, operating periods and independent examination, none of which live in a source
file.

### Verification reports WHERE, not whether

`verifyChain` returns the first divergence as an index, a sequence number, an entry identifier and a
reason — `altered`, `broken_link`, `sequence_gap`, `device_mismatch`, `head_not_anchored`,
`unknown_kind`, `not_an_entry`. "Whether" and "where" cost the same to compute and are worth wildly
different amounts: a pass that says only that something is wrong leaves the coach with a warning he
cannot act on and a log he can neither trust nor investigate.

It **stops at the first divergence**. Everything after a break fails to link as a consequence of the
break, and reporting all of it would bury the one that matters under its own fallout.

### One chain per device, and why there is no global one

Two devices append independently, offline, with no coordinator. A single chain across both would
require every append to know the other device's latest entry — the round trip a local-first
application does not have. So **each device keeps its own chain**: `seq` counts from 1 per device,
`previous_hash` links only within a device, and a mixed list is refused rather than silently
reordered. `verifyJournal` verifies each device's chain independently and reports per device, so a
break on the tablet does not condemn the laptop.

The consequences, stated now rather than discovered later:

- **Interleaving between devices is not recoverable and is not claimed.** Two clocks that were never
  synchronised produce a plausible merged order that is evidence of nothing. Within one device the
  chain is the order, whatever the timestamps say.
- **A device's chain is only ever complete on that device.** A copy that arrived by synchronisation
  can be missing the newest entries; that reads as a shorter chain, not a broken one.
- **A missing device is invisible.** Nothing local ever committed to a third device's existence, so
  nothing here can prove its chain was not dropped wholesale.

### Retention and the head

The first entry a device ever writes links to nothing. Once retention discards the oldest entries,
the surviving head links to something that is gone — on its own, indistinguishable from an entry
someone deleted.

So `verifyChain` takes an **anchor**: the digest the surviving head is expected to link to, which
the retention pass records when it discards. With the anchor a pruned chain verifies exactly.
Without one the result is `truncated_head` — checked from the head onwards, honest about what it
could not check — never a silent pass and never a false break. The pass also writes a
`journal.retention_pruned` entry so the gap has an account of itself.

**What retention costs is real: the discarded entries are gone and cannot be verified again, ever.**
The anchor proves the survivors are continuous with *something*; it cannot prove what that something
said. That is the price of bounded growth on a device with no server behind it, and it is a price,
not a detail.

## Where the log lives

`core/store/schema.js` at **version 3**, in a store called `journal`. It is in `SCHEMA` and in
`ALL_STORES` and deliberately **not** in `RECORD_STORES` — the same precedent as the outbox, the
deletions manifest and the small-values store. A journal entry is not a record: no envelope, no
revision, no tombstone, and it never synchronises as one. `schemaCoverage()` asserts a strict
bijection between the model's kinds and the mapped stores, so putting it there would have broken a
test that exists to catch exactly that confusion.

**The key is `[device, seq]` and there is no index beside it.** Every question this store is asked is
a question about one device's chain in sequence order — the latest entry (one reverse cursor step),
the chain from the oldest (a forward page), the oldest entries to discard, how many are held — and a
compound primary key answers all four by itself. The schema's rule is that an index names the
question it answers; the honest consequence here is no index at all.

And there is **no flag anywhere in it**, which is the same lesson as the result-is-in-the-kind rule
above. A boolean is not a valid key on this platform.

Version 3 needed **no migration step**: the store starts empty, nothing already stored changes shape,
and `applySchema` creates it from the `since: 3` entry. `MIGRATIONS` stays empty rather than
acquiring a step that reshapes nothing.

## The append and the transaction — the resolution, and its price

The outbox reasons that a queue entry must commit in the same transaction discipline as the data it
describes, *"because a separate mechanism would be a second door"*. The same reasoning reaches
further here and lands somewhere stricter.

**A journal entry commits in the SAME TRANSACTION as the change it records** — not merely under the
same discipline. `commitEntryInScope` takes a transaction scope and never a store handle, so it
cannot open a transaction of its own; `recordChange` opens one `runWrite` over the caller's stores
and the journal's, runs the caller's own work inside it, and writes the entry there. Both land in one
commit or neither does.

Why stricter than the outbox, when the outbox's reasoning is sound? Because the two failures are not
equally recoverable. A missing queue entry is a **delay** — the record is still on disk and the next
flush re-derives the delivery. A missing journal entry is a **hole**, and nothing re-derives it: the
event is over. A log that is *usually* complete cannot answer the only question ever asked of an
audit log — *did anything else happen?* — because a silently incomplete answer looks exactly like a
complete one.

### Reconciled with "the log must NEVER block the application"

These are compatible, and being exact about it matters, because the sloppy reading is what would
destroy the guarantee above.

**What it means.** Committing inside a transaction that is already happening adds no round trip to
the interface's critical path: no second transaction behind the first, no second commit to wait on,
no network call, nothing for a screen to await that it was not already awaiting. The append adds one
head read, one digest over a few hundred bytes, one put — and, once every `PRUNE_BATCH` appends, a
bounded prune. That is the **cost** of the log. It is not a **block**. Verification is a separate
read-only pass a diagnostics screen asks for; no save ever waits on it.

**What it does not mean.** It does not license a best-effort append that swallows its own failures.
`try { append } catch { ignore }` looks like the most obliging possible reading of the rule and
produces precisely the state the outbox reasoning forbids — an entry missing for a change that
happened, invisibly, at exactly the moments something was going wrong. **The rule protects the coach
from waiting on the log. It does not protect the log from being false.**

So an append can fail the write, in two ways, and both are correct. A **refusal by the vocabulary or
the shape rules** is a programming error at a call site — kinds are constants, the field set is
closed, there is no user input on this path — and it is raised while the entry is being prepared,
before any transaction opens, so it costs the coach nothing. A **database refusal**, realistically no
room left, fails the change too; that adds no new failure mode, because a transaction short of room
fails whether or not it carried an extra row. What the log does add is a few hundred bytes per
change, which is why retention bounds it.

## THE PLATFORM CONSTRAINT: a digest cannot be taken inside a transaction

Measured on this build, in this step. It is not local to the journal — it constrains the shape of
**any** hash-chained append-only write on this platform, so it is written down here rather than left
to be met again.

### One: the constraint

**An IndexedDB transaction ends the moment control returns to the event loop with no request
pending.** That is the platform's rule, not a quirk of this application: a transaction stays alive
only while requests keep being issued from inside the previous request's callback. `await
crypto.subtle.digest(...)` is precisely a return to the event loop with nothing pending — the digest
is computed off-thread and its promise settles a task later. By the time the hash comes back, the
transaction is gone.

The same rule is why the paged walk in `core/store/db.js` is written as one imperative cursor handler
rather than an awaited loop, and its header says so. This is the same trap wearing different clothes,
and the trap is wider than either: **any** `await` inside a transaction that is not a database
request ends it.

### Two: the workaround this code actually adopted

**The append is split at that seam. Everything cryptographic happens before the write transaction
opens; what happens inside it is database requests only.**

- `prepareEntry(handle, fields)` runs with no write transaction open. It reads the chain head and the
  entry count in a read transaction of its own, applies the retention policy, and hashes the entry —
  and the `journal.retention_pruned` accounting entry too, when the plan prunes.
- `commitEntryInScope(scope, draft)` runs inside the caller's write transaction: one head re-read,
  one put, and the bounded prune. No digest. No await that is not a request.
- `recordChange(store, {stores, fields, work})` is the door that puts the two together, with the
  caller's own work in the same `runWrite`.

**What makes precomputing sound rather than optimistic is the head re-read.** The draft carries the
digest of the entry it expects to follow. If the stored head still carries that digest, nothing has
appended to this device's chain since the draft was made — so the count is still the count the plan
was made against, and the oldest entries are still the ones it chose. If the head has moved,
`JournalRaceError` is thrown rather than a wrong link written, and `recordChange` repeats the whole
unit (draft, transaction and `work` together) up to `MAX_APPEND_ATTEMPTS` times before failing
loudly. **`work` may therefore run more than once** — write it as the store's own methods are
written, reading current state inside the transaction and computing from it, and repeating is free.

That race is real rather than theoretical: two windows of one browser share one database **and one
device tag**, so they append to the same chain and one of them must lose. The retry lives in one
place so that every call site does not invent its own answer, or — far more likely — none of them
handle it at all.

Verification is split the same way and for the same reason: `readChainForVerification` reads the
pages inside a transaction, and the digests are taken afterwards, outside it.

Alternatives considered and rejected: hashing at verification time instead of at write time (there
would then be nothing for the next entry to link to — a hash chain needs the predecessor's digest at
append time); leaving `previous_hash` out of the hashed payload so the entry could be hashed before
the head is known (the chain would then not commit to its own links, and altering one would be
undetectable — the whole point gone); and keeping the transaction alive with filler requests while
the digest runs (a hack that works until someone tidies it, holding a write transaction open across
an off-thread operation for no reason a reader could infer).

### Three: what happens if you write it the obvious way

The obvious way is to do it all inside one transaction: read the head, hash, write the entry. Here is
what that produces, **measured, not predicted**:

```
caller was told           : InvalidStateError: The transaction has already finished.
the CHANGE is on disk     : true
the ENTRY is on disk      : false
```

Read that carefully, because it is the worst of both outcomes:

- **The change COMMITTED.** The transaction did not roll back — it had already completed
  successfully, carrying the record, before the entry could be written. There is no abort to undo:
  `runWrite` calls `tx.abort()` on the way out and it is a no-op on a transaction that has finished.
- **The entry is absent.** Exactly the hole this whole file argues must never exist.
- **The caller is told the write FAILED**, by a message that mentions neither the log nor a digest.
  So the application above is now wrong in the other direction too: it will report a save that
  actually landed as having failed, and a coach who retries produces a second copy.

**Is it loud or quiet? It is loud only by luck, and the luck is easy to lose.** It throws here solely
because the `put` comes *after* the digest. Move the append to the end of the unit, or wrap it in the
best-effort `try/catch` that "the log must never block the application" seems to invite, and the
throw disappears entirely: **the transaction silently commits without the entry, nothing errors, and
the log has a hole nobody will ever see.** On this build, absences that look like passes have been
the recurring defect. This is one of them waiting to happen.

## Retention: bounded growth with a caller that cannot be absent

The full argument is at the top of `retention.js`; the parts that belong in the notes:

**Counted, never dated, and that is a security decision.** The obvious policy is "keep ninety days".
It is wrong here: `at` comes from the device clock, which the person being logged can set. An
age-based policy would hand them a delete button for the audit log — set the clock forward, act, and
honest housekeeping discards the evidence, indistinguishable from housekeeping because it *is* the
housekeeping path. A count cannot be moved by the clock: `seq` is assigned by the chain, and anyone
who wants the oldest entries gone must write `MAX_ENTRIES_PER_DEVICE` real entries to push them out,
which is itself thousands of entries of evidence. A test asserts that `retention.js` does not reach
for the clock at all.

**The caller is the append itself.** This build has twice shipped a correct routine nothing reached —
outbox entries pruned only by a caller who decides to, and a purge manifest carrying a reason nothing
consumes. A scheduled sweep is only a better class of the same bet: it runs if something schedules
it, if the app is open when it fires, if nobody removes the timer in a refactor. So retention is not
a pass that visits the log; **it is enforced by the only code that can add to the log.** The log
grows in exactly one way, and that same call applies the bound in the same transaction. The pruning
function is module-private, so nothing — including a test — can call it directly: "the prune works
when invoked" is not a result this package is able to produce. The only observable retention
behaviour is what appending causes.

**Headroom, and a ceiling.** A prune takes the chain to `max - batch` rather than to `max`, so one
runs every `PRUNE_BATCH` appends instead of on every append — otherwise the accounting entry would be
written every time and the log would eventually be mostly its own housekeeping. `PRUNE_CEILING`
bounds a single pass, which matters if the cap is ever lowered: the log converges over the next few
appends instead of asking one transaction to delete thousands of rows while the coach waits.

### What retention costs, stated as a price and not a detail

- **The discarded entries are gone and can never be verified again.** The anchor proves the survivors
  are continuous with *something*; it cannot prove what that something said.
- **The log answers questions about the last `MAX_ENTRIES_PER_DEVICE` events on a device and nothing
  earlier** — and it says so, rather than returning an empty result that reads like "it never
  happened".
- **The account of the gap is a COUNT, not a list.** `journal.retention_pruned` carries how many were
  discarded and no identities, because an entry naming what it discarded would be a copy of the
  entries it removed.

The anchor lives in the store's small-values store under `journal.anchor.<device>`, written in the
same commit as the deletions. It is per device because chains are per device — one shared anchor
would make each device's prune invalidate the other's verification. Its digest is READ from the row
being discarded, so recording it needs no cryptography either. A **wrong** anchor is not a pass:
`verifyChain` reports `head_not_anchored`, so retention cannot be used as cover for a removal.

## The log and the accountability surface answer different questions

This package exists because that sentence is true, so it is worth more than a definition.

Building this log was declined once. The case for declining was that the application has a single
user, no second party who can act in it, almost no clinical detail, and — the load-bearing part —
**an accountability surface that already tells the coach whether his data is safe.** That case was
overturned by the user on the ground that his pay depends on this data, and a dispute about **what
was recorded** is exactly the case a status surface cannot answer.

The distinction, stated so a later step does not re-run the argument:

- **The accountability surface reports the PRESENT STATE OF SYNCING.** What is pending, what
  failed and why, when the copy last succeeded. It is a live answer about right now, and it is
  correct to overwrite itself — yesterday's pending count is of no interest to anybody.
- **The log answers WHAT WAS RECORDED.** That a record changed, on which device, in which order,
  whether the entry is still the one that was written. It is about the past and it is worth nothing
  if it can be overwritten.

Neither substitutes for the other, in either direction. A perfect surface showing everything synced
says nothing about whether a reading was altered last Tuesday. A perfect log says nothing about
whether the backup is currently working — and a coach reading a healthy log while synchronisation
has been broken for a week is being misled by a true document.

**The practical instruction:** do not wire one to answer for the other. A surface that starts
reading the log to compute a status, or a log written from surface state rather than from the
change itself, collapses two questions into one that answers neither — and the collapse is
invisible, because the merged thing looks like a working version of whichever one you were
expecting.

## Two boundaries this step deliberately did not cross

**The per-client purge does not sweep the log, and that is on purpose.** `core/store/purge.js` names
every store it touches and the journal is not among them. An entry holds identities and never
content — no name, no note, no reading — so a purged client leaves behind record identifiers with no
records behind them, and nothing that could be read back as clinical data. Sweeping them would delete
the evidence that the deletion happened, which is the opposite of what an audit log is for. **The
residual is real and worth stating**: after a purge, the log still shows that records with those
identifiers existed and were removed. If that is ever judged too much, it is a decision to take
explicitly, not a line to quietly add to `PURGE_STORES`.

**How the tension was resolved, stated for whoever has to act on it later.** Two requirements pull
against each other here and both are real: removing a client must leave nothing of them behind, and
an append-only log must not lose the entries that record the removal. The resolution is not a
compromise between them — it is that **the entries stay, and they are already empty of the client.**
Removal is enforced on CONTENT, which the log has never held; history is preserved as IDENTITY, which
is all the log ever held. So the purge takes every place the client's detail lives and does not touch
the log, because there is nothing of theirs in it to take. What survives is a record identifier with
no record behind it and no way to learn whose it was from this package. The rule that falls out, for
anyone adding a field or a store later: **a purge sweeps content, and an audit entry earns its
exemption by holding none** — the moment an entry carries anything a purge would have to remove, the
exemption is void and the entry, not the purge, is the thing that must change.

**The precedent it follows is the purge's own manifest**, and deliberately so rather than by
coincidence. `core/store/purge.js` removes rows instead of leaving tombstones, then has to carry the
news of the removal outward somehow — and the thing it leaves behind to do that is a manifest of
"record identities, types and revisions only", with no name, no note and no ciphertext, asserted by a
test rather than trusted. The log is the same artefact answering a different question: something must
outlive a purge to say the purge happened, and the only shape in which that is safe is identities
without content. Two independent paths reached the same rule, which is the strongest argument either
of them has.

The wiring step did not change this. `core/store/purge.js` now commits its entry inside the purge's
own transaction, and the log is still not among `PURGE_STORES`: a test asserts that after a purge the
entries survive, hold the departed client's identity, and hold no word of their name or notes.

**One note on a gap that is NOT this step's to close.** `core/INTEGRATION.md` records a correct
routine whose output has no caller: a purge reports an opaque queued payload shared with a staying
client as `unresolved`, and nothing consumes that report. This log does make it cheaper to close —
the `unresolved` outcome is exactly the kind of thing an entry can carry as an identity and a
count — but closing it belongs to the reports and admin step, and nothing here should be read as
having started.

**Retention is enforced for the device that appends, and only for it.** A synchronised copy of
another device's chain grows in whatever imports it, and nothing here prunes it — because nothing
here imports it yet. The step that brings foreign entries in must enforce the same bound in the same
transaction it imports them in, or a synchronised log is unbounded by the back door. That is a gap
named now rather than discovered later.

## WHAT THIS PACKAGE DOES NOT ESTABLISH

Everything above says what the log does and why it is shaped that way. This section carries the same
weight, and it is here because a package note about an audit log is exactly the kind of document that
gets read later as a warranty. Each of these is argued in full somewhere above; none of them is a
caveat softening a claim, and none should be summarised away.

- **This is tamper-EVIDENCE. It is not tamper-proofing, and the difference is not a nuance.** The
  log lives in a database on a device the user controls, and the digest is unkeyed. **Anyone who can
  write that database can rewrite a chain from any point forward**, and the rewritten chain then
  verifies cleanly, because it genuinely is consistent. What the chain still buys is worth having and
  is the whole of what it buys: **a single altered or removed entry becomes detectable** — the edit
  has to be carried forward through every later entry or it shows up as a break, and `verifyChain`
  says where. That catches accidental corruption, a careless or partial edit, a row removed by
  something that did not know to repair its neighbours, and a copy altered somewhere other than the
  device that wrote it. It does not catch a determined local rewrite and must never be described as
  if it does.
- **Nothing here is a compliance claim, and this module is not an exception to the build's refusal.**
  Not HIPAA, not GDPR, not the DPDP Act, not "audit-ready", not any standard's name attached to any
  part of this package. An integrity-protected log is one control; whether an obligation is met is a
  matter of contracts, operating periods and independent examination, none of which live in a source
  file. The vocabulary was drawn from a security standard's list of domains — **using a standard's
  list is not conforming to the standard**, and nothing in this package may be cited as evidence of
  conformance.
- **It cannot say WHO acted, only which device.** There is one operator and no server accounts, so
  the honest actor identity available today is the device tag, and on a shared device the log cannot
  distinguish people. See *Who acted*. Closing this belongs to the authentication step.
- **It cannot verify what it has discarded.** Retention is a bound, and the entries past it are gone
  permanently. A reader who later wants to verify a chain whose head has been pruned gets
  `truncated_head` unless the anchor is present, and even with the anchor the result proves only that the
  survivors are continuous with *something* — never what that something said. Nothing recovers it;
  the accounting entry is a count, deliberately, and carries no identities. See *What retention
  costs*.
- **It does not tell you the present state of syncing**, and the accountability surface does not tell
  you what was recorded. See the section above; neither is a degraded form of the other.
- **A purged client leaves a residual, and it is stated rather than denied.** After a purge the log
  still shows that records with those identifiers existed and were removed. It holds nothing else of
  them.
- **Two domains are defined and unwritten, and each has an owner.** Authentication's five kinds
  belong to the step that builds the unlock screen; the three export kinds belong to the reports and
  admin step; and `key.slot_removed` has no path that produces it today. **No call site is stubbed to make the
  vocabulary look exercised**, and a test asserts the partition in both directions. See *The kinds
  nothing writes*. Until those steps land, an empty result for those kinds means **not built** — it
  does not mean it never happened.

## Changing the entry shape is a migration, not an edit

`ENTRY_FIELDS` fixes both the set of fields and the order they are hashed in. The canonical form is
**positional** — an array of values, not an object — because object key order is an implementation
detail of whatever built the object, and a chain that depended on it would verify on the machine
that wrote it and fail on one that reordered the keys.

Adding a field changes every digest. Entries written under the old field list will no longer verify.
Anyone doing it needs a versioned canonical form and a plan for the entries already on disk.
