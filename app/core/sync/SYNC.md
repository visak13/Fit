# The synchronisation engine

This directory carries the coach's records between his devices through a consumer cloud storage
service that offers **conflict detection and not locking**. Everything below is either a guarantee
this design actually provides, or an honest statement of where it stops.

Code entry point: `core/sync/sync.js`. Test entry point: `index.js` — see §10.

> **No live provider call is made anywhere in this directory, and no claim about one is made.** Every
> test here runs against the in-memory double in `core/remote`, which is faithful to two MEASURED
> quirks and no further. A passing test proves OUR LOGIC given that behaviour. It never proves the
> platform. The cloud step supplies the real implementation of the same port; until it runs, every
> sentence here about the service is inherited from measurements made during the platform spike.

---

## 1. The three tiers, and why a reader must be able to tell them apart

A reader who cannot tell these apart will either over-trust the snapshot or over-worry about it.

| Tier | Where | What it means |
|---|---|---|
| **STRUCTURAL** | per-device areas (§2) | Cross-device overwrite **cannot occur**. There is no shared writable object, so there is nothing to lose. Not "unlikely" — absent. |
| **DETECTED AND RECOVERABLE** | the derived snapshot (§4) | A lost update **can** occur, is noticed by read-compare-write, and is **repaired** by rebuilding from the areas, which still hold every record. |
| **DETECTED ONLY** | genuine divergence (§5) | Two devices edited one record in ignorance of each other. The data cannot say who is right, so **a person decides**. Both sides are kept and shown; `resolution.js` applies the side he picks, above both, and never picks one itself. |

Everything else in this file is one of those three, or the machinery that makes them true.

---

## 2. STRUCTURAL — per-device partitioning

### The hazard

Two devices sharing one writable object is a concurrent read-modify-write. This service has **no
conditional-match facility**, so the sequence is: both read, both write, the second wins, the first
device's work is silently gone, and nothing anywhere reports an error.

That is not a rare race. It happened to this build's own shared test script while this engine was
being written: several workers each read one file, added their entry and wrote it back, and whoever
read before a sibling wrote destroyed that sibling's entry. Nobody was careless and no write failed.
**The hazard this engine guards against and the bug that was happening to us are the same bug.**

### The answer

**A device writes only into its OWN area, and reads the union of every area.** No object is ever
written by two devices, so there is no read-modify-write to lose and nothing to detect. It is not a
lock, a lease, a retry or a merge — it is the absence of the shared object those would be defending.

An area is a **name prefix**, `fit.<device-tag>.`, because `namePrefix` is the only way this port can
narrow a listing. A device tag is lowercase letters, digits and single hyphens, so it can never
contain a dot and dot-segmentation is unambiguous. `snapshot` is refused as a device tag.

Two kinds of file live in an area:

| Kind | Written | Holds |
|---|---|---|
| `push` | every pass that has something to say | the records changed since this device's last push |
| `state` | on compaction (§6) | this device's whole current state, replacing its earlier files |

**Duplicates across areas are normal and harmless.** A device that pulled a record and later wrote
its state out has a copy of somebody else's record in its own area. The union resolves per record
with the model's single last-write-wins rule, and two copies of the same revision are equal under it.
The redundancy is also what makes recovery work when one area is unreadable.

---

## 3. Reading is the union; writing is partitioned

Reading every area is safe precisely because reading changes nothing. `readUnion` combines the areas,
resolving each record with `supersedes` from the model — the rule is not re-implemented here, because
two devices that resolved one comparison differently would converge on two different records, which
is worse than losing a write.

A file this engine cannot decode is **reported and skipped**, and the sync result carries it. Failing
the whole pass would mean one bad file stopping the coach's phone from backing anything up; ignoring
it silently would mean synchronising a subset of his data while reporting success.

---

## 4. DETECTED AND RECOVERABLE — the derived snapshot

The snapshot is the union assembled once and written to a single shared object, so that an ordinary
open is one read and a replacement device can recover without knowing which devices ever existed.

**It is the one shared object in the design, so it is the one place a lost update is possible at
all.** Three things make that survivable, and they are stated in order of importance:

1. **It is not the authority. The device areas are.** Everything in the snapshot is a copy of a
   record that exists in at least one area. `SNAPSHOT_CARRIES_NO_RECORD_OF_ITS_OWN` is asserted by a
   test that walks the snapshot and finds every record in the union.
2. **A clash is detected** by read-compare-write: the metadata the text was composed against is
   compared with the metadata now, and a moved revision means somebody else wrote it — so nothing is
   written over.
3. **And then repaired.** The answer to a detected race is not to retry the same text, which is now
   stale, but to **rebuild from the authority** and publish that. Correctness is restored rather than
   merely reported.

### Be exact about what detection buys, and what it does not

There is **no conditional-match facility**: revision, digest and modification time are all
output-only, so "write only if the revision is still N" cannot be expressed and no amount of care
creates it. The cycle is unavoidably read, compare, write, and **another writer can land between the
compare and the write**. Nothing on this port closes that window.

So a caller that read, checked, and found nothing moved **can still lose its write**. `snapshot.test.js`
performs exactly that sequence and asserts the loss really happened, rather than describing it. What
saves the coach's data is tier 2 above, not the check.

**The listing has three cases here too** — none, exactly one, and MORE THAN ONE — because the space
does not enforce unique names. The third is proven reachable (two devices each created a key envelope
in fifteen minutes of real use) and is **surfaced, never resolved by adopting the first**.

### Why this one write does not go through the outbox

Every write carrying data goes through the durable outbox, so that a failed or expired credential is
a delay and never a loss. The snapshot carries no data of its own: a snapshot write that never lands
costs one rebuild. Queueing it would also leave a permanent needs-attention entry every time a race
was detected — a warning about a file the engine repairs by itself on the next pass — in the surface
the coach relies on for warnings that matter. An indicator that cries wolf is worse than none.

---

## 5. DETECTED ONLY — genuine divergence

**The ordinary case** is sequential: laptop for online sessions, phone for in-person ones. An edit
made on one device has seen the other's history, so its revision is higher and it simply wins.
Per-record last-write-wins is sufficient and is the model's own rule.

**The genuine case** is two devices both writing revision N of one record, each unaware of the other.
Neither has seen more history than the other, and there is no fact that makes one right. The model's
tiebreak would still pick one — it exists so that both devices pick the *same* one — but picking
silently would throw away an edit the coach made and never tell him.

So: the clash is surfaced, **both sides are handed back in full**, and **neither is applied**. A
conflict shown as "there is a conflict on this client" cannot be decided by the person looking at it,
so it gets dismissed, and a dismissed conflict is a lost edit with extra steps.

A delete-against-edit clash at the same revision is marked, because it is the one that costs a
history.

**When you cannot tell, surface.** `NEVER_RESOLVED_BY_GUESSING` is a declared value asserted by a
test, not an absent check — an absence reads as an oversight to the next editor, who helpfully adds
"just take the newer timestamp".

**Once he has answered, `resolution.js` applies it — and nothing else does.** The screen collects the
choice; the core applies it. Three things make that seam worth having rather than a line in a
component. It writes the chosen side at a **strictly higher** revision than either side claims, so
the answer survives the round trip instead of losing the last-write-wins race and returning the
discarded edit minutes later (§0 and `revisions.js` — the same rule the admin reset paid for). It
re-classifies the pair and **refuses anything that is not genuinely a divergence**, so the ordinary
supersede path cannot launder a routine pull through the conflict kind. And it is the **only** call
site of `sync.conflict_resolved` in the application, asserted by a scan of the whole core — a second
writer would relabel every routine pull as a collision and the log could no longer answer how often
his two devices genuinely clashed.

It still chooses nothing: there is no default side and no "prefer newer", and
`NOTHING_HERE_CHOOSES_A_SIDE` is a declared value with its own test, so there is no seam between the
classifier and the applier for a default to be helpfully added to.

**A clash he has already ANSWERED is not asked again.** Area files are history: the two rev-N copies
stay on the remote until compaction removes them, so the union would otherwise re-surface an answered
conflict on every single pass, forever. That protection is real and it is kept.

The test it uses is **provenance, not arithmetic**, and the difference cost a real edit. `readUnion`
used to drop a divergence whenever the winner carried a revision above both sides, reading "something
outranks both" as "he answered it". The resolution seam is not the only thing that can produce such a
revision:

> Two devices write revision N unaware of each other. One of them, **still never having seen the
> other**, edits again in the ordinary way to N+1. Nothing was resolved and nobody was asked — but a
> revision above both sides now exists.

The clash was dropped, the other device's edit was discarded, and nothing said so anywhere. So the
envelope carries `resolved_from`: the revision of the divergence this line of history answered,
written by `resolution.js` **alone** and inherited by later revisions. A divergence is dropped only
when the winner descends from an answer given at or above the revision the two sides claim. An
ordinary edit carries its parent's mark and cannot raise it, so it can no longer speak for a question
the coach was never asked. Nothing is discarded either way; this only decides what he is shown.

**Detection does not go through the fold.** Comparing each incoming record against the current winner
alone finds only a clash that happens to be standing when its counterpart arrives — so whether the
clash above was even *detected* depended on the order the files were written in. `readUnion`
remembers the first envelope seen at each `record_id@rev` and reports a second one at that revision
from a different device whenever it turns up. `divergence-provenance.test.js` runs the history in
**both** file orderings and asserts the same verdict.

`resolved_from` is **additive and optional in both directions**, and `DOCUMENT_VERSION` does not move
for it. An envelope that lacks the field is valid and means "no answer"; the writer omits the field
when it is null, so a record the coach has never resolved goes out byte-identical to what a build
without the field writes; the reader puts the null back. Both directions are proven against a reader
built from this application's own field list with `resolved_from` removed — which is what the
previous build's list was — in `migration-two-sided.test.js`, as two separate assertions each shown
failing for its own reason.

This matters because an unrecognised envelope key is refused, and a refused file is **skipped per
file**. That used to be the end of the story and it was the most dangerous state this application
could be in: the pass still reported a clean completion, so the older device showed green while
holding none of the newer one's work, with nothing erroring anywhere. **A pass that skipped a file no
longer earns a completion** — see `withheld.js` and section 6a below.

---

## 6. One pass, in order

1. **Push** what changed here into this device's own area, through the outbox. Local first, so a dead
   credential is a delay and never a loss.
2. **Flush** the queue — foreground, unless the opportunity is `leave`, which is best-effort.
3. **Pull** the union of every area.
4. **Apply purge notices** (§7) — before the records they are about, so a departed client's clinical
   reference is not written back onto this device even for a moment.
5. **Apply the records**, refusing any identity this device has purged (§7).
6. **Compact** this device's own area when it has grown past `COMPACTION_THRESHOLD`, or when a
   deletion needs to reach it.
7. **Verify** deletions by reading the area back, then mark them propagated.
8. **Rebuild the snapshot**, repairing a detected race.

Push before pull is deliberate: this device's own work is safely queued before anybody else's is
applied, so an interruption anywhere after step 1 cannot lose it.

### 6a. A pass that passed over a file has not earned a completion

The one value permitted to say "everything is backed up" is withheld by three conditions, and the
question is asked in exactly one place — `withheld.js` — because `core/status/completion.js`
re-derives the same verdict rather than trusting the report's own field, and two derivations that
must agree are two derivations that will not. That is not a hypothetical: `completion.js` carried a
copy of the failures rule under a comment saying it mirrored the engine, and the third condition
below is the clause that would have been added to one of them and not the other.

| Condition | Why it withholds |
|---|---|
| a step could not reach the service | the queue may have drained before the pull failed, so "backed up" would mean *sent mine, never read yours* |
| a file could not be **decoded** | the document is a version this build does not read — a newer install wrote it |
| a file's name could not be **placed** | the name sits in a device area this space can show, and this build does not know its kind |

The last of the three arrives by an **ordinary additive change** rather than a version bump: a build
that adds a third kind of area file writes names this one groups as unrecognised, and until this
existed those were not in the report at all. Both file conditions are the same fact to the coach —
work of his is in the backup and is not on this device — so both count toward one sentence, which
names how many files and says his other device is running a newer version of the app.

**What keeps the second one from becoming the opposite defect.** A permanent false alarm on the one
indicator he is meant to trust is the same danger with a better disguise: technically accurate every
time it fires, and it teaches him to ignore the surface that has to warn him when something is really
wrong. The visible space is a folder he browses, `fit.` is a short prefix, and he is free to use it —
so the namespace alone is suggestive, not conclusive. The conclusive test is the DEVICE: the file's
device segment must name an area holding at least one file this build parsed. A device writing real
area files here is an installation of this application, so a name it wrote that this build cannot
place came from a build that knows a name this one does not. Anything else in the space is reported
as found-and-not-ours and says nothing alarming.

The honest residual: a future build that changed the naming scheme so completely that a device had no
parseable file at all would be under-reported. That device would also be absent from `devices`
entirely — a larger and more visible problem — and under-reporting an exotic case is the right side
to err on when the alternative is a permanent false alarm on an ordinary one.

Nothing here fails a pass, throws or blocks: the push happened, the queue drained, the readable files
were applied and the application still opens. Only the CLAIM is withheld — and because nothing is
persisted without one, last-synced stays where it was rather than advancing over a pass that did not
deserve it.

### The push cursor is an instant PLUS what was already sent at it

The store's changed-since read is inclusive of its lower bound, and it must be: two records can carry
the same `updated_at` to the millisecond, and an exclusive read would drop the second one forever.
Inclusive alone re-sends the boundary record on every pass for the life of the installation. So the
boundary is remembered as identities, and exactly the revisions already sent at that instant are
skipped. Nothing is dropped and nothing is repeated.

---

## 7. Per-client deletion, and how far outward it actually reaches

The store's purge already draws the line that matters: sessions are one routine and one to MANY
clients, so a **shared session is not deleted** — the departed client is taken out of its participant
set as a revision, and the other attendees keep the session, their readings, their performed records
and their notes. A session left with nobody in it is removed entirely.

This engine carries that outward:

- **Immediately and structurally:** the departed client's records leave THIS device's area. They are
  gone from the local store, and a compaction writes the area out from the local store, so they
  cannot be in it. The older files that did contain them are removed by identifier.
- **On its next pass:** every other device applies the purge notice, purges locally, and compacts its
  OWN area — because only it may write there. This is **eventual, not immediate**, and saying
  otherwise would be a promise the architecture cannot keep.
- **The snapshot** stops carrying them in the same pass, because it is rebuilt from the areas.

A manifest is marked propagated **only after the area has been read back** and shown to contain none
of the removed identities. A flag set on the assumption that a write worked is worthless evidence.

**The resurrection guard.** A purge deliberately leaves no tombstone, so nothing local says "gone"
for the next pull to consult — and another device's area still holding a copy would put the client
straight back, silently. Every identity this device has ever purged is therefore refused on the way
in. The manifests are that memory: they are kept rather than pruned, which is what makes "their note
is not in the backup any more" checkable rather than merely intended.

A purge notice carries **identities only** — no name, no note, no ciphertext — because a notice that
named the client would reintroduce exactly what the purge removed, and would then be synced.

---

## 8. The revision rule, which is invisible where it is broken

**A write that replaces an existing record must carry a HIGHER revision than the record it replaces,
or the remote copy undoes it on the next synchronisation.**

The coach presses reset-to-defaults. The shipped library comes back and he watches it work — locally
it is correct. The next time the application syncs, his edited content quietly returns. The cause is
that the restored record was written at or below the revision the remote copy already held, so
last-write-wins correctly chose the older content. Nothing errored.

It is handled as a rule about revisions rather than a special case about reset, because every
restore-from-backup, import and migration meets it for the same reason. `replaceRecords` reads what
is being replaced and lifts above it.

It cannot be caught locally — the local store applies the write happily — so it is proved by a
**round trip**, and proved twice: once that lifting works, and once that **not** lifting is genuinely
undone by the remote copy. A rule whose absence is never demonstrated is a rule nobody can tell is
load-bearing.

---

## 9. Honesty about the platform, and about what leaves the device

### When synchronisation happens

Six opportunities, declared as data: **on opening, on returning to the foreground, on the connection
coming back while the window is on screen, on leaving, at intervals while open, and on demand.**
`reconnect` has its own name rather than borrowing `foreground` because the trigger is persisted with
the completion and read back to the coach in plain words, and he never left the screen.
`leave` is best-effort; the platform may kill it mid-flight,
which the durable queue makes harmless and which the outbox makes structurally impossible to report
as a completed synchronisation.

**There is no background synchronisation and there cannot be.** The weaker mobile platform provides
no background sync and no periodic sync, and even where a platform did, the credential is
foreground-only and obtainable only inside a user gesture, so a background wake-up would have nothing
to authenticate with. `NO_BACKGROUND_SYNC` is declared and asserted. Nothing here may be built toward
it or imply it.

### Sync never blocks, and never lies

A step that cannot reach the service is **reported**, loudly and specifically, with `retryable` and
`needs_reauth` from the port — and the application still opens. A failure that did not come from the
port is a local defect and is rethrown untouched.

The one value permitted to say "everything is backed up" is the outbox's own completion marker, which
refuses a best-effort run, an interrupted run, and any run that left an entry undelivered. This
engine cannot manufacture one, and it **withholds even that** when a step failed: the queue may have
drained before the pull failed, and "synchronised" would then mean "sent mine, never read yours".

### What leaves the device is a whitelist

Every outbound record is **rebuilt field by field** from the envelope's declared field list, and its
content must pass the content contract's own validator, which refuses unknown keys.

It is a whitelist rather than a blacklist for a measured reason: a provider's response object carries
the account holder's own address **encoded inside identifier segments**, so a plain search of the
outgoing bytes for his address comes back clean while it is sitting right there. A test demonstrates
exactly that, then shows the record being refused by shape anyway. A blacklist can only remove what
somebody thought of.

Ciphertext passes through opaquely. Nothing here decrypts, inspects, parses or logs a sealed value,
and nothing here needs a key.

### What leaves in the clear, stated rather than implied

The whitelist above governs the SHAPE of what leaves, not its confidentiality. Only three fields are
ever ciphertext — the clinical note, its reference pointer and the pointer's display label, all on the
client record. **Everything else this engine uploads leaves the device in plain text:** client names
and general notes, the non-clinical adaptation flag, sessions, performed records, readings, in-session
notes, routines, exercises and diet plans.

That is a deliberate choice, made so that losing a key costs the notes alone and nothing else, and
`core/crypto/CRYPTO.md` is where it is argued and where the cost is stated in full. It is repeated
here because this is the file a maintainer reads when asking what this engine sends, and a whitelist
described only as a defence against foreign objects reads as though the payload were protected.
Anyone holding the account holds the plain text of everything on that list. Nothing in this directory
is certified, approved or audited against any regime, and no compliance claim may be added to it.

### Interruption

**Surviving an interruption is the ABSENCE of a mechanism, not the presence of one.** There is no
in-flight state anywhere in this stack: an entry stays pending for a whole attempt and only a verdict
writes a new state, so a killed pass leaves the queue exactly as it was. What stops the resumed
replay duplicating is recognition — the idempotency key lives inside the remote name, so a replay
lists by that name and finds its own earlier write.

---

## 10. Running the tests

From `C:/Projects/Fit/app`:

```powershell
node --test core/sync      # 71 tests, no install step, nothing to build
```

On this runtime a positional argument to `--test` is resolved as a **module**, not searched as a
directory. A directory only works as a target if something at that path registers tests, which is
what `core/sync/index.js` does and is its only purpose. Removing it would make the command resolve to
a module with no tests and **report a pass having executed nothing** — a gate that passes vacuously,
which is worse than one that fails. **Adding a suite to this directory means adding a line to
`index.js`.**

The suites, in the order `index.js` runs them: `partition` (the naming the areas rest on), `payload`
(the whitelist), `divergence` (ordinary versus genuine), `revisions` (the reset round trip, both
ways), `snapshot` (the three cases, the race, and the repair), `deletions` (the departed client and
the surviving attendee), `purge-outbox` (the same client, in the queue rather than in the stores),
`engine` (two devices, end to end), `durability` (interruption).

`purge-outbox` is the measured scenario that found the gap: the record stores and the remote copies
came back clean while delivered outbox entries still held the departed client's name, notes and
readings in plain text, because the per-client purge swept every store except the one delivered
entries accumulate in. The fix is in `core/store/purge.js` and `core/outbox/scrub.js`; the reasoning,
the trade-offs and the case it refuses to decide silently are in `OUTBOX.md` §8.1.

> The repository's aggregate script names its directories explicitly and does not discover them from
> the filesystem, so `core/sync` is **not** included in it. That file was deliberately not edited —
> concurrent edits to it have already destroyed one worker's entry and hidden a failing directory
> behind a green whole-tree run.

---

## 11. Extending this

- **Do not add a conditional write.** The port refuses to offer one because the service cannot honour
  it. See `PORT.md`.
- **Do not resolve a divergence anywhere but `resolution.js`, and do not let it choose.** No default
  side, no "prefer newer", no option to enable one, and no second writer of
  `sync.conflict_resolved`. See §5.
- **Do not adopt one file from a listing of several.** See §4.
- **Do not add a background trigger.** See §9.
- **Do not write into another device's area**, and do not add a parameter that would allow it. The
  structural guarantee is exactly this absence.
- A new **document field**: bump `DOCUMENT_VERSION` and keep the reader refusing versions it does not
  know. Reading a newer document half-way is how a subset of the coach's data gets synchronised while
  success is reported.
- The **device identity** is this package's own (`assertDeviceTag`, `areaPrefix`), deliberately not
  reached in from another module. A later step needing a device identity should extend it here.
