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
- **Key rotation is not covered.** Nothing here rotates a data key, and nothing in this document
  should be read as settling how one would be rotated.
- **Sign-out is no longer undefined, and it is not proven HERE.** It is built, in the shell, by the
  Google integration step that owns the token flow — `src/platform/google-account.ts`, with its own
  suites. Signing out drops the Google connection only: local data, the outbox, the event log and
  **the device key slot all survive it**, and he can sign back in and carry on. Erasing the device
  is a separate, separately confirmed action that deletes the local database, and **the device key
  slot goes with it**, because a browser holds a non-extractable key by keeping the key object in
  that same database. What is not proven anywhere in THIS document is any of it: these scenarios
  cover the core, and sign-out is not core.

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

**ALSO PROVEN — AND THE REMOTE HALF OF A DELETION NOW REACHES HIM**

- A pass reads this device's own area back and reports, per removal, exactly which record identities
  it **still found** there. That detail no longer stops at the report: it travels to the
  pending-removals screen as a field on the reading that screen already had, and the screen says
  plainly that their records are still in his backup. That is the **strong** claim, and it is made
  only for a removal the report NAMES.
- **An empty `still_present` is never turned into reassurance.** The engine runs the verify step only
  when deletions were carried AND a compaction ran, so on most passes an empty list means nothing
  was looked at. There is deliberately no sentence anywhere for the empty case, asserted with a
  non-vacuity probe.
- **A pass whose only effect was a deletion records a non-zero `affected_count`**, on both sides of
  the device boundary — the device that carried the removal outward and the device that received it.
  Proved with both record figures at zero, so the count can only have come from the removal.

**DELETION IS STILL NOT ABSOLUTE, AND THIS DOCUMENT WILL NOT SAY THAT IT IS**

A durable outbox is a **second full copy** of everything it carries. The purge sweeps the queue in
the same transaction as the record stores, and for our own documents it genuinely removes the
departed client's detail. But an **opaque** payload — a queued export or backup blob that is not one
of our documents, so it cannot be cleaned record by record — which references **both the departing
client and a staying one** is **left entirely alone**. Cleaning it would destroy the staying
client's data, and the code cannot see inside it.

**That conservative choice is correct and is not being asked to change.** What HAS changed is that
the coach is now told. The purge reports the entry in its manifest as `unresolved` with reason
`opaque_payload_shared_with_another_client`, the purge **persists that on the deletion record**, and
`pendingDeletions` was already handing it to a reader — so closing this needed no wire at all, only
somebody reading what was already there. It is worded from the declared CODE (never from any message
text) and drawn on the pending-removals screen, inside the removal it belongs to, saying in plain
words that **this one will not clear on its own** — because everything else on that screen does.

**WHICH SURFACE SAYS IT, AND WHICH DELIBERATELY DOES NOT.** The removals screen says it. The
**accountability surface does not**, and `needs_attention` stays at nought. That is a decision, not
an omission left over from before: `sync-indicator.ts` floors the indicator at **overdue** the moment
a needs-attention entry exists, and this entry is by design uncleanable. Counting it would pin the
coach's indicator at overdue **for ever**, on a condition he can never clear — and a permanent alarm
on the one indicator he is meant to trust is what teaches him to ignore all of them. Surfacing it
where it can be **stated** rather than **escalated** is the whole point of putting it on the screen
instead.

**WHAT IS STILL OPEN, STATED AS A GAP RATHER THAN A LIMITATION**

The screen shows the unresolved entry **only while its deletion manifest is pending**. Once the
removal is confirmed propagated the manifest leaves `pendingDeletions`, and the opaque queued entry —
which is untouched by any of that and survives indefinitely — stops being mentioned anywhere. Closing
that needs a surface for a standing, uncleanable fact; it must NOT be closed by adding a
needs-attention entry, for the reason above.

The assertions in the test suite are unchanged and now mean something different: they no longer wait
to be inverted, they hold the line that the LADDER carries no permanent condition while the screen
that can say it without escalating does say it.

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

**One rule about the shape of this list, because two entries in it went stale the same way.** This
document may say what is **NOT BUILT**. It may **NOT** say what is **NOT DECIDED**. Whether a thing
is built is a fact about this repository, which this file can see and a reader can check. Whether a
question is settled is a fact about the decision record, which lives outside this file and which this
file has no way of learning has changed — so a "nobody has decided this yet" written here stays
written long after somebody did, and it reads as an invitation. State what exists, and point at
decisions rather than restating or characterising them.

- **This is not a multi-user clinical audit trail.** The standard that requires an append-only
  integrity-protected event stream is written for multi-user clinical systems: it answers *who did
  what to whose record*. This application has exactly one user, no second party who can act in it,
  and no clinical detail beyond an encrypted note and a pointer — so the *who* is a device tag, not a
  person, and on a shared device the log cannot say which person acted. **The application does now
  have an append-only, integrity-protected event log** (`core/journal`, per d105, which overturned
  the earlier decision not to build one). It covers authentication, record changes, exports,
  synchronisation, and key and recovery activity as a closed vocabulary; four of those five domains
  have call sites today — authentication acquired its account half from the shell when the Google
  step landed — while exports and the local-unlock half of authentication stay defined and
  deliberately unwritten until the steps that own them are built. Its notes are at `core/journal/JOURNAL.md`, including — with equal weight — the
  section on what it does **not** establish. Two things from the paragraph this replaces survive
  unchanged and are not softened by the log existing: **the accountability surface is a different
  thing from a log** — it reports what synced, what is pending and what failed, which is the present
  state and not the record of what happened, and neither substitutes for the other — and **the
  integrity protection is tamper-EVIDENCE, not tamper-proofing**: anyone who can write the local
  database can rewrite a chain from any point forward, and what it buys is that a single altered or
  removed entry becomes detectable. Do not read "has an audit log" as more than that.
- **No compliance claim of any kind.** Not HIPAA, not GDPR, not the DPDP Act. This is unchanged by
  the event log and the log makes no such claim either: drawing a vocabulary from a standard's list
  of domains is not conforming to that standard. The architecture minimises hard — no clinical text
  stored at all, only a pointer; no client email, phone, address, date of birth or photo ever
  collected — and that posture is defensible without needing a claim attached to it.
- **Sign-out is settled AND BUILT, and this file is not where either happened.** It is **d110**:
  signing out drops the Google connection only and keeps local data, and erasing the device is a
  separate, separately confirmed action. The Google integration step has now built both, in the
  shell — nothing under `core/` knows a provider exists, which is why none of it is here. Two things
  belong in this document because they are facts about the core rather than about the shell. First,
  the **event log now has authentication call sites**: `auth.account_connected` and
  `auth.account_disconnected` are written from `src/platform/google-account.ts`, and
  `journal/unwritten-kinds.test.js` reads both layers so that a kind written from the shell cannot
  go on being claimed as unwritten. Second, the erase deletes the whole local database, so the
  **device key slot goes with it** — `src/platform/erasure-completeness.test.ts` asserts that
  nothing else holds device key material and goes red the day something does.

  One refinement of d110's own wording, made where the code had to answer it: erasing refuses while
  anything can still be sent, but a change Google has **permanently refused** never resolves by
  itself, and neither does a queue on an account the coach has lost. So the refusal carries an exit
  — the work is named, what will be lost is stated, and he may proceed on a separate explicit
  acknowledgement. There is no state he can be stuck in for ever, which was the point of the rule
  rather than a relaxation of it.
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
