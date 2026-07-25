# INTEGRATION — what the whole foundation was proved to do, and what it was not

Every part of this core was built and reviewed in its own strand. Each strand's tests end at its
own boundary, and the boundaries are where the interesting failures live. This document records
the cross-strand run: what was exercised, what it proves, and — with equal weight, because this is
the half that gets left out — **what it does not prove**.

Read the two lists together. A scenario's value is bounded by its second list.

---

## THE ONE THING TO READ IF YOU READ NOTHING ELSE

**Every scenario below runs against the IN-MEMORY DOUBLE of the remote storage port. Not one line
of it makes a live call to Google, and nothing in this document is evidence about the real
platform.**

A passing test here proves OUR LOGIC given the behaviour the double models. The double is faithful
to two quirks that were **measured** on the real service, and to no more than that:

1. The hidden application-only space **does not enforce name uniqueness** — two objects can sit
   there under one name, silently. This is not a hypothetical: it happened on the coach's own two
   devices in about fifteen minutes of ordinary use.
2. **There is no conditional-match facility.** Read-compare-write is detection after the fact,
   never a lock, and a lost update genuinely occurs.

Where the real service behaves in some third way nobody has measured, these tests are silent about
it. A double that is kinder than reality makes every test pass while proving nothing, so both
quirks are reproduced rather than smoothed over — but a double cannot be faithful to what has not
been observed.

The real implementation of the port belongs to the Google integration step. **Nothing here
transfers to it.**

---

## How to run it

```
cd C:/Projects/Fit/app
npm test                     # the whole core, discovered, with per-directory counts
node --test core/integration/index.js    # these scenarios alone
```

`npm test` reports the number of tests actually run per directory and fails when a count drops.
**An exit code is not evidence; the count is.** At the time of writing: **613 tests across 10 core
directories, 0 failing, 0 skipped.**

---

## THE SCENARIOS

### 1. A session, an interruption, and the queue that carries it out

*`core/integration/session-lifecycle.test.js`*

The coach registers a client with an encrypted clinical note, runs a session against a shipped
routine capturing readings and notes, is cut off partway, reopens the application, resumes, carries
on, finishes, and synchronises.

**PROVEN**

- The clinical note, its reference pointer and the pointer's **label** are ciphertext before they
  reach the local store, and they are still ciphertext in the remote copy. The plaintext appears
  nowhere in what was sent.
- The interruption is simulated the only honest way: the store is dropped and reopened on the same
  database, with nothing told about it. The session is offered back as resumable, reopens, and
  reproduces its state exactly — order as run, readings, notes, outcomes.
- Work recorded after resuming is **appended** to what happened before the cut, in the order it was
  run, not written over it.
- Every fact from both halves of the session reaches the remote copy: the session, both readings,
  both performed records, the note.
- **Nothing is duplicated.** A second synchronisation adds nothing, and there is exactly one
  session record rather than one per resumption.
- The note opens again on this installation's key after the round trip.

**NOT PROVEN**

- Nothing about a real power cut. A simulated cut releases the session lease, which a real cut does
  not; the simulation is **kinder than reality in that one respect**, and it is named here rather
  than left implicit. Nothing asserted above depends on the lease.
- Nothing about the browser actually evicting IndexedDB, about iOS suspending the page, or about
  the application being killed mid-write by the operating system.
- Nothing about how any of this behaves on a real device of either kind. See *Android* below.

### 2. An expired credential, throughout

*`core/integration/session-lifecycle.test.js`*

The same flow with the credential dead from before the session starts until after it ends.

**PROVEN**

- The session runs and completes normally. Everything saves locally. **A dead credential is a delay
  on the way out and never a refusal on the way in.**
- No completion is manufactured. `syncNow` returns `completion: null` for a pass that did not
  deliver, and the persisted last-backed-up value is not advanced by it.
- The accountability surface shows a non-zero pending count, says plainly that nothing has ever
  reached the copy, and names **the credential** as the reason — specifically, not as a spinner.
- `blocks_application` is `false`. The ladder tops out at a persistent warning; the application
  always opens.
- When the credential returns, the queue drains completely and **without duplicating**: three
  performed records, not six, despite repeated attempts.

**NOT PROVEN**

- Nothing about Google's actual token lifetime, refresh behaviour, or what its endpoints return on
  an expired token. The double's credential expiry is a switch, not a measurement of the service.
- **A JOIN THAT IS NOT WIRED YET.** The sync engine *returns* a completion; the accountability
  surface reads a *persisted* one and refuses to take a caller's word for it. Something must carry
  the report from one to the other by calling `recordCompletedSync`. In this scenario the test does
  it. **In the application, the interface step must do it** — and if it does not, the surface will
  say "never synchronised" for ever while synchronisation works perfectly.

### 3. Two devices, and the split that would be silent

*`core/integration/two-devices.test.js`*

**PROVEN**

- The first device **creates** the one and only data key. The second device **adopts** it, and
  still exactly one envelope and one recovery object exist afterwards.
- **The proof the ciphertext families did not split:** the second device opens a clinical note that
  the first device sealed, out of the synchronised record, under a key it never generated and never
  saw in the clear. The sealed pointer label opens too.
- A device that has never reached the space **refuses** to establish key material and says why,
  rather than helpfully generating a fresh key to keep working.
- The **two-envelope** state — reproduced, not simulated, using the space's real non-uniqueness — is
  **surfaced and never resolved**. Both candidates are carried out of the failure so a screen can
  show the coach two things to look at. Nothing is written, chosen or tidied.
- The **two-recovery-key** state gets the same three-case guard, because the quirk belongs to the
  space rather than to any one file. This is the more dangerous of the two: a duplicated envelope
  announces itself the first time a note will not open, whereas a duplicated recovery key stays
  silent until somebody is recovering a wiped device.
- The **snapshot race is detected and repaired**. The lost update is forced, the record really is
  dropped from the snapshot with nothing erroring, the device areas are shown still to hold it, and
  rebuilding from those areas **restores** it. A third device recovering afterwards gets the whole
  practice. Detection **plus** recovery — detection alone would leave the coach informed and still
  missing a client.
- An ambiguous snapshot (more than one file under the name) is not adopted; the areas, which are
  the authority, are read instead, and the recovery is complete anyway.

**NOT PROVEN**

- Nothing about Google Drive's real behaviour under concurrent writes, its real listing semantics,
  or its real timing. The race is forced here deterministically; in the field it depends on a window
  nobody can measure.
- **Read-compare-write remains detection, not prevention.** The window between the compare and the
  write cannot be closed by any code in this core. A lost update stays reachable in principle; what
  is guaranteed is that it is detected and repairable from the authority.
- Nothing about whether a real device's non-extractable key survives iOS Safari's storage eviction.
  The recorded requirement that a vanished device slot must fail **loudly** rather than silently is
  a design rule here, not a measured platform fact.
- **Key rotation and sign-out are not covered and are not settled.** What signing out destroys, and
  what survives it, is **undefined behaviour** owned by the Google integration step, which owns the
  token flow. Nothing in this document should be read as settling it.

### 4. A client is deleted, and the people they trained with are not

*`core/integration/deletion-and-reset.test.js`*

**PROVEN**

- The deletion is recorded as a manifest of work to propagate, not as a local absence.
- A session the departing client attended **alone** is removed; a session they **shared** is
  *revised* to drop them and keeps the other attendee's history intact.
- The deletion genuinely reaches the remote copies: after compaction the departed client's name
  appears **nowhere** in what the remote copy holds, and the manifest is marked propagated only
  after the area was **read back** and confirmed clear.
- The second device applies the deletion rather than resurrecting the client. This is the failure
  the tombstone rule exists for: a delete written as an absence would have the other device push
  its surviving copy straight back, and the client returns from the dead with no error anywhere.

**NOT PROVEN — AND THIS ONE IS A REAL, KNOWN, OPEN GAP**

> **Deletion is not absolute, and this document will not say that it is.**

A durable outbox is a **second full copy** of everything it carries. The purge sweeps the queue in
the same transaction as the record stores, and for our own documents it genuinely removes the
departed client's detail. But an **opaque** payload — a queued export or backup blob that is not one
of our documents, so it cannot be cleaned record by record — which references **both the departing
client and a staying one** is **left entirely alone**. Cleaning it would destroy the staying
client's data, and the code cannot see inside it.

**That conservative choice is correct and is not being asked to change.** The gap is what happens
next: the purge reports the entry in its manifest as `unresolved` with reason
`opaque_payload_shared_with_another_client`, and **nothing anywhere consumes that report**. The
accountability surface does not carry it. So a departed client's data can persist in that entry
with the coach never told.

This is the same shape as the defect the queue sweep was written to close: **a correct routine whose
output has no caller.** It is asserted in the test suite rather than merely described here — the
test proves the entry survives, proves it is reported, and proves the surface does not mention it.
That last assertion fails the day somebody wires the manifest to the surface, which is exactly when
it should be rewritten.

Also not proven: that any *already generated and delivered* export is reachable at all. Once a file
has left for a client's device, nothing in this application can unsend it.

### 5. Reset restores the shipped library — through the function the coach actually presses

*`core/integration/deletion-and-reset.test.js`*

**PROVEN**

- The backup offer runs **before** anything is written.
- A shipped record the coach edited is reverted to the shipped content, **at a strictly higher
  revision**. This is the whole game: a reset written at the same or a lower revision loses the
  last-write-wins race, and the coach's edits come back minutes later with nothing having errored.
- **It survives the round trip.** The second device is holding the edited copy at a lower revision;
  after synchronising both ways, the reset has carried outward and the edit does not come back one
  sync later, which is how this failure actually presents.
- An exercise **no routine references survives the reset** on both devices. The shipped catalogue
  deliberately exceeds the shipped week; the surplus **is** the substitution pool, and two features
  depend on it. Unreferenced is a normal state, not a defect to clean up.
- Reset is **library-only**: clients, sessions, readings, performed records and diet plans are
  untouched and reset says so in its own plan.

**NOT PROVEN**

- These assertions go through **`resetToDefaults`**, the entry point the application actually calls.
  There is a separate committed test that proves the same revision rule about the sync engine's
  `replaceRecords()` — **which no caller in this application invokes.** That test is present,
  passing, and pointed at dead code, so it buys false confidence rather than merely being absent.
  It is named here so nobody mistakes it for coverage of the reset button. Neither test replaces the
  other; only this one is about the button.
- Nothing about the confirmation dialogue's wording, which belongs to the interface step. The rule
  it must follow is recorded: say what reset restores and what it leaves alone, and **do not** tell
  the coach he is starting with a fresh slate, because that is false and would frighten him away
  from a safe action.

### 6. The leak sweep the credential scanners structurally cannot do

*`core/integration/leak-sweep.test.js`*

**PROVEN**

- **A plaintext search is clean on a payload that is leaking.** A calendar response's link embeds
  the signed-in Gmail address, base64-encoded inside its identifier segment. Searching for the
  address in the clear returns nothing while the address is sitting right there. This is asserted
  as a fact, because two checks on this build's own artefacts were run that way and reported clean —
  correctly, by luck, with a method that could not have found the leak had it been there.
- The sweep **decodes** candidate encoded segments before searching, and finds it.
- **The sweep is proved to work before its clean result is believed.** A deliberately poisoned
  export — a whole raw provider response object embedded in a queued client report — is caught,
  including the address that exists only in encoded form and the Drive identifier in the clear. A
  sweep that finds nothing because it is broken is indistinguishable from one that finds nothing
  because there is nothing there.
- Run over a real two-device practice — both remote spaces, the snapshot, the key material, both
  devices' outboxes — **nothing** is found: no provider response object, no account address, no
  Drive identifier, and no clinical text in either form.

**NOT PROVEN**

- The sweep looks at what **this core** produces. The Google integration step has not been written
  yet, so no real response object has ever existed to leak. **This proves the discipline holds
  today; it cannot prove it holds after the code that fetches those objects is added.** The binding
  rule stands regardless: whitelist the fields that go out, never blacklist the ones that must not,
  and treat *contains no credential* as not equal to *safe to publish*.
- The export and share formats themselves do not exist yet; there is nothing here about what an
  image, spreadsheet or comma-separated export will contain.

---

## THINGS THIS DOCUMENT DOES NOT CLAIM

Stated explicitly, because an integration write-up is exactly the kind of document that gets read
later as a warranty.

- **There is no audit trail, and that is a decision rather than an omission.** The standard that
  requires an append-only integrity-protected event stream is written for multi-user clinical
  systems: it answers *who did what to whose record*. This application has exactly one user, no
  second party who can act in it, no clinical detail beyond an encrypted note and a pointer, and it
  refuses every compliance claim. The trail that actually protects the coach — what synced, what is
  pending, what failed and why — is the accountability surface, and that is not an audit trail.
  **Nothing anywhere may claim or imply the application has one.**
- **No compliance claim of any kind.** Not HIPAA, not GDPR, not the DPDP Act. The architecture
  minimises hard — no clinical text stored at all, only a pointer; no client email, phone, address,
  date of birth or photo ever collected — and that posture is defensible without needing a claim
  attached to it.
- **Sign-out is undefined behaviour and is not settled here.** It is owned by the Google integration
  step. Nothing above should be read as an answer to what a signed-out device leaves behind.
- **Android is unknown.** The platform proof that gates this build was cleared on **iOS only** —
  install, share delivery, image, comma-separated and spreadsheet export. Android behaviour is
  untested for all of it. No claim in this document is an Android claim.
- **Nothing here is proof about Google.** Said twice on purpose. See the top of this file.

---

## WHAT THE GATES ACTUALLY COVER, AND ONE DIVERGENCE WORTH KNOWING

`npm test` **discovers** the core directories it runs from the filesystem, so nothing has to be
edited to add one. It fails loudly when a directory that previously reported tests stops being
discovered, when a directory's count drops below its recorded floor, when a directory has test
files but no entry point, when an entry point does not import every suite beside it, and when any
directory reports zero tests. The recorded floors live in `tools/core-coverage.json`.

That machinery exists because a hand-maintained list in `package.json` lost an entry to concurrent
edits by parallel workers, and the aggregate went on reporting green while a directory underneath
it was failing.

**The divergence, stated rather than tidied away:** this action's recorded acceptance criterion
names nine directories explicitly and runs **599** tests. The discovering gate finds **ten** — it
also covers `core/integration`, this directory — and runs **613**. The fixed list is not wrong; it
was written before these scenarios existed. It is simply narrower than what the aggregate covers,
and the next step should know that rather than infer it.
