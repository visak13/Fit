# The remote storage port, and the double that stands in for the real thing

This directory is the boundary between the application's foundation and the cloud
integration step that comes later. It contains a **narrow, provider-neutral port** for remote
storage and an **in-memory double** of it. The later integration step supplies one real
implementation of this same port and nothing else.

---

## What this proves, and what it does not

> **No live provider call is made anywhere in this directory, and no claim about one is made.
> A passing test against the in-memory double proves that OUR LOGIC is correct given the
> behaviour modelled here. It NEVER proves the platform behaves that way. The double is worth
> exactly its fidelity to the measured quirks and nothing more.**

That paragraph is not framing — it is the constant `PROVES_NOTHING_ABOUT_THE_PLATFORM` in
`port.js`, and a test asserts it, so it cannot quietly become a comment someone deletes while
tidying.

Everything below distinguishes what was **measured** from what was **inferred**, and says
which direction each inference was made in. Collapsing those two is how a double becomes
kinder than reality without anybody noticing.

---

## Why there is a port at all

The foundation — the durable outbox, the sync engine, the key-envelope guard, the
accountability surface — is the most safety-critical logic in this application, and none of it
can wait for the cloud step. The port lets all of it be built and proven now, and lets the
cloud step later be a fill-in rather than a rewrite.

It also keeps the core honest in a way that survives a stack change: everything here is a
plain dependency-free module with no framework, no bundler, no build step and no third-party
package, and its test gate needs no toolchain at all.

---

## The two spaces

Addressed by their **role**, never by a product term.

| Space | Constant | What lives there | What it is for |
|---|---|---|---|
| Visible | `SPACES.VISIBLE` | Backup copies | Artifacts the account holder owns and expects to find and browse. |
| Hidden | `SPACES.HIDDEN` | The key envelope | Application-only state the account holder should not hand-edit. |

**Be exact about what "hidden" buys.** It is a boundary against *other applications and
accidental sharing*. It is **never** a boundary against the account holder, who can still
delete it, and it does not survive the application being removed.

---

## The six operations

| Operation | Signature | Notes |
|---|---|---|
| `list` | `list(space, {namePrefix?, timeoutMs?})` | Metadata only. **May return several entries sharing one name.** |
| `create` | `create(space, {name, content}, {timeoutMs?})` | **Always creates.** Never an upsert, never a replace. |
| `read` | `read(fileId, {timeoutMs?})` | Metadata plus a copy of the bytes. |
| `overwrite` | `overwrite(fileId, content, {timeoutMs?})` | New revision. **No precondition parameter exists.** |
| `remove` | `remove(fileId, {timeoutMs?})` | By identifier only. |
| `stat` | `stat(fileId, {timeoutMs?})` | The metadata a read-compare-write cycle needs, without the payload. |

The list is declared as data in `PORT_OPERATIONS` and a test asserts the class exposes exactly
those six. Narrowness is the design: each operation added is one the cloud step must implement
for real, and one more way for the double to drift.

### The metadata

`{ file_id, space, name, revision, modified_at, size }`

`file_id` is opaque and is the **only** reliable way to address a file — see quirk one.
`revision` moves on every overwrite and is the detector for a lost update. `modified_at` is
the same canonical timestamp form the rest of the application writes.

### Every call carries a deadline

There is no wait-forever path through this port. A call with no deadline is how an application
ends up behind a spinner it can never leave, which the accountability standard forbids
outright: failure must be loud, specific and bounded in time. `RemoteTimeout` states plainly
that the outcome is **unknown** — a write that timed out may well have landed, which is why
every remote write carries its own idempotency key in the outbox.

### Errors answer the two questions a caller actually asks

Every failure is a typed `RemoteError` carrying `retryable` and `needsReauth`, so the outbox
and the sync engine decide what to do without matching on message text. A transient outage
must never send the user to re-authorise; an expired credential must never be retried silently
forever.

---

## The measured quirks — the reason the double is worth anything

### Quirk one — the hidden space does NOT enforce name uniqueness

**MEASURED**, on real devices during the platform spike, 2026-07-25.

Two devices each created a key envelope under the same name, in about fifteen minutes of
ordinary two-device use, by someone doing nothing wrong. The space then listed **both**, with
different identifiers. No error, no de-duplication, no conflict raised.

**The double reproduces this exactly.** `create` performs no name check of any kind. A second
create under an existing name yields a second, distinct file, and both are returned by `list`.

**Why it must not be sanded smooth.** The adopt-before-create guard exists precisely to stop a
second envelope from being written, and a split key family is silent and unrecoverable. If the
double rejected or merged a same-name write, that guard would never be exercised against the
state it exists to prevent, and the most dangerous defect in this design would pass its own
test.

**The guard has three cases, and the third is the one nobody had on their list** until the
spike stumbled into it:

1. the space lists nothing — a device may create;
2. the space lists exactly one — a device **must adopt** it and must not create a second;
3. the space lists **more than one** — proven reachable, and a naive adopt-the-first would
   still split the ciphertext. This must be **surfaced to the user and never resolved by
   guessing**.

All three are reachable against this double, which is what makes testing that guard honest.
The guard itself belongs to a later step; this step's job is to make sure it can face reality.

**One inference, made deliberately in the harsher direction.** The spike measured the *hidden*
space. The double applies the same rule to the *visible* space, which is an inference, not a
measurement, and it is recorded as such in `MEASURED_QUIRKS`. Assuming no uniqueness where
there might be some costs a redundant check; assuming uniqueness where there is none costs a
silent duplicate.

### Quirk two — there is no conditional-match facility

**MEASURED**, against the real service during specialist research, 2026-07-25. The revision,
the content digest and the modification time are all *output-only*: none can be sent back as a
precondition on a write.

**Therefore read-compare-write is DETECTION, never a lock.** The sequence is unavoidably:

```
1. read the current metadata
2. compare it with what we held      ← hasMoved() answers only this
3. write                             ← the other device can land between 2 and 3
```

Nothing on this port can close the window between steps 2 and 3.

**The double reproduces this exactly.** `overwrite` accepts no precondition, because none can
be expressed and none would be honoured. Two readers who both write means the second wins and
the first is simply gone, and nothing anywhere reports an error. `quirks.test.js` performs that
lost update and asserts the loss actually happened — and then performs it again against a
caller who *did* check first, to prove that checking does not close the window.

**This is why the port offers no conditional-write parameter anywhere.** Not as an option, not
as a flag, not as a best-effort hint. Offering one would advertise a lock the platform cannot
honour, and every caller built on that promise would be wrong in a way that only surfaces in
the cloud step, where it is most expensive to diagnose. `PORT_CAPABILITIES.conditional_write`
is `false`, declared as data so that changing it is a visible code change a test catches.

The correct response to a detected clash is to **surface both sides to the user**. Never
silently overwrite, and never silently discard the losing write — an unreported conflict is a
lost edit whichever way it faces.

---

## Deliberate adversity

The double's failures are switchable, because the outbox and the sync engine are built to
survive failure, and a component built to survive failure that has only ever been exercised
through success has been demonstrated, not tested.

Three failures, and they stay three because each demands a **different** response:

| Armed with | Produces | What the code above must do |
|---|---|---|
| `adversity.failNext(n, {operation?, error?})` | `RemoteUnavailable` | Keep the work, retry later. Nothing needs the user. |
| `adversity.expireCredential()` | `RemoteCredentialExpired` | Keep the work and **ask the user to tap**. Retrying alone never helps. |
| `adversity.setLatency(ms)` | `RemoteTimeout` past the deadline | Treat the outcome as **unknown**. The write may have landed. |

Collapsing these into "it failed" is how an application retries forever against a dead
credential behind a spinner that can never resolve.

When more than one is armed they resolve in the order reality would produce them, fixed so
tests stay deterministic: **latency versus the deadline**, then **the credential**, then **a
queued failure**. A timeout consumes no queued failure and reveals nothing about the
credential, because no response ever arrived.

Time enters through an injected clock. `manualClock()` advances virtual time instantly, so a
forty-five-second call against a thirty-second deadline is an ordinary deterministic assertion
rather than a test nobody runs.

---

## Files

| File | What it is |
|---|---|
| `port.js` | The port: spaces, operations, typed errors, boundary validation, `hasMoved`, and the declared capability and quirk records. |
| `memory-remote.js` | The in-memory double, faithful to both measured quirks. |
| `adversity.js` | The switchboard of deliberate failures. |
| `clock.js` | The injected clock: real for the application, virtual for tests. |
| `remote.js` | **The module API. Import from here.** |
| `index.js` | The **test entry point** — not the API. It exists so `node --test core/remote` resolves to something that registers the suites; without it the command would report a pass having executed nothing. |
| `*.test.js` | `port` (shape and neutrality), `double` (ordinary behaviour), `quirks` (the two measured quirks), `adversity` (the three failures). |

Run the gate from the application directory:

```
node --test core/remote
```

---

## Rules for whoever implements this for real

1. **Implement this port and change nothing else.** If you find yourself renaming concepts to
   fit, the port was drawn wrong — say so rather than translating around it.
2. **Do not add a conditional write**, however tempting the service's documentation looks.
   Confirm it against the live service first, and if it genuinely exists, that is a measured
   finding worth recording, not a quiet parameter.
3. **Never address a file by name alone.** Names are not unique. The identifier is the handle.
4. **Never assume a listing holds at most one match.** Handle none, one, and many.
5. **Keep the vocabulary neutral.** A test in `port.test.js` scans this directory for product
   terms and fails on any of them, whole-word — that is deliberate, so the boundary stays a
   boundary.
6. **When reality contradicts anything written here, update this file and say it was measured**,
   with the date and how it was found. A quirk recorded as measured that was actually assumed
   is worse than no record at all.
