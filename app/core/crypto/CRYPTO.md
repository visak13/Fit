# The clinical notes, and what encrypting them actually buys

This directory holds the encryption for one small, deliberately chosen part of this
application. It is written for two readers: whoever maintains this code, and whoever has to
explain it honestly to the coach who depends on it.

It contains no compliance claim of any kind, and none may be added. Nothing here is
certified, approved, or audited against any regime.

---

## The one-paragraph version

Three fields are encrypted. Everything else is stored and backed up in plain text. Anyone who
can sign in to the coach's Google account can read the encrypted notes, because the recovery
key sits in that account beside the encrypted copy. That cost was chosen deliberately, with
its eyes open, and the reason is below. What encryption still buys is protection of the
**remote copy against a different party holding it** — a stolen laptop, a borrowed phone, a
Drive folder shared by accident, another app with broad access to the account's files.

---

## What is encrypted, and what is not

**Encrypted — three fields, all on the client record:**

1. the clinical note,
2. its reference pointer — the link or path to where the real detail lives,
3. **the pointer's display label.**

The third is the one that is easy to miss and matters most. A label such as
`cardiac-history.pdf` is itself health information: it discloses the condition without anyone
opening the file. A pointer whose label is in the clear defeats the point of encrypting what
it points at.

**Not encrypted, permanently and on purpose:** client names and general notes, the
non-clinical adaptation flag, routines, exercises, sessions, performed records, readings,
in-session notes, diet plans, and every export.

### Why so narrow

Because it caps what key loss can cost. Everything except those three fields survives a lost
key completely, so the application stays usable and recoverable without one.

This has to lead any conversation about losing a key, because the fear is otherwise wildly
out of proportion to the facts. **The worst case is one field per client** — and the actual
clinical detail already lives outside this application by design, in the coach's own records.
Losing the key does not lose a client's history, their sessions, their progress or their
diet.

Whole-store encryption would have inverted that: one forgotten credential, everything gone.

---

## The construction

Nothing here is invented. It is the ordinary multi-recipient key-wrap pattern that disk
encryption and password managers have used for years, built from the cryptography already in
every browser. There is no third-party cryptography library, no hand-rolled cipher and no
clever idea anywhere in this directory.

- **One data key**, 256 bits, random, generated **exactly once in the lifetime of the
  installation**. It is never written down anywhere in the clear.
- **Records sealed with AES-GCM-256**, a fresh random 96-bit initialisation vector for every
  single encryption, with the record's type, identifier, field name and scheme version bound
  in as additional authenticated data. That binding means a sealed value opens **only** in the
  exact record and field it was written for — one client's note cannot be lifted onto another
  client's record, and a note cannot be moved into the label field.
- **The data key is persisted only in wrapped form**, inside a versioned envelope in the
  application-only area of the coach's Drive.

### The three slots

The envelope holds the same data key wrapped separately under independent credentials. Any one
of them opens it; none of them is the key; adding or removing a way in never re-encrypts a
single record.

| Slot | Role | What it costs the coach |
| --- | --- | --- |
| **Device** | Primary, automatic | Nothing. A key held per device that cannot be read out — ordinary daily use prompts for nothing at all, so no passphrase is ever typed in front of a client. |
| **Google account** | The recovery authority | Nothing to memorise or print. Recovering on a new or wiped phone is simply signing in. |
| **Passphrase** | **Optional**, offered rather than required | An app-generated six-word phrase, written down once. It serves as both the passphrase and the written recovery code — one artefact, not two. It exists for one case: wanting Google outside the trust boundary. |

The device slot is **never the only slot.** A browser can clear its storage without warning —
a web app not installed to the home screen can lose it after a week of not being opened — and
the application must notice that loudly rather than silently failing to decrypt.

### The sentence that must never be softened

**Security is the WEAKEST slot. Recoverability is the STRONGEST.**

Every slot opens the same data key, so the notes are exactly as protected as the easiest way
in, and exactly as recoverable as the hardest one to lose. Both halves are true at the same
time, and both must be said.

---

## The honest cost, stated plainly

**Anyone who can sign in to the coach's Google account can read the clinical notes.**

The recovery key is stored in that account, beside the encrypted copy. Anyone holding the
account holds both. This was accepted deliberately in exchange for a recovery story that does
not depend on the coach remembering or keeping anything — and it must never read as though it
were slipped in.

**What encryption still buys, and it is real:**

- a lost or stolen laptop or phone,
- a borrowed or handed-over device,
- someone with access to the browser profile,
- a Drive folder shared by accident,
- any other application holding broad access to the account's files.

In all of those, someone holds the remote copy without holding the account, and the notes stay
unreadable.

**What it does not buy:** protection against compromise of the Google account itself.

**The mitigation that actually addresses that** is two-factor authentication on the coach's
Google account — guarding the account, not the data. Whether it is enabled cannot be verified
from here, so it belongs on the handover checklist, not in an assumption.

The application-only Drive area is a boundary against *other applications and accidental
sharing*. It is **never** a boundary against the account holder, who can still delete it, and
it is destroyed if the app's access is removed.

If the decision is ever reversed — if Google must not be able to read the notes — the design
flips to passphrase-primary with a mandatory stored recovery code. The Google slot and that
requirement cannot both hold.

---

## The passphrase slot's numbers

- Six words drawn uniformly from a list of common English words, generated by the application
  rather than chosen by a person. **Uniformly** matters: the draw uses rejection sampling
  rather than a modulo, so the stated entropy figure is true rather than approximately true.
- The wrapping key is derived with **PBKDF2-HMAC-SHA-256 at 600,000 iterations** with a 16-byte
  random salt, both recorded in the slot itself so an envelope written today still opens years
  from now.

**600,000 is not a number off a blog table.** It measured at roughly 95 ms on the coach's
actual phone — the device that decides whether a prompt is usable — and 77 ms on this
development machine. It must not be interpolated downward to make some other device feel
quicker: cost is linear in iterations, so halving it halves an attacker's work too.

**Argon2id is not an option that was declined.** Web Crypto implements exactly four derivation
algorithms — ECDH, HKDF, PBKDF2 and X25519 — and naming Argon2id raises `NotSupportedError`.
The memory-hard alternative is unavailable natively on either of the coach's devices, and
reaching it would mean shipping a compiled cryptography library into a public static site with
no backend to vet it. PBKDF2 is the only native option, which is why the iteration count
carries the whole weight of that slot.

---

## The guard — the most dangerous part of this design

If two devices independently generate their own data key, the result is **two incompatible
families of ciphertext and a silent, unrecoverable split.** Neither device errors. Nothing
looks wrong. It surfaces when a note written on the phone will not open on the laptop, by
which time both families hold real notes and no key reads both.

**This was not theorised. It was reproduced by accident**, in about fifteen minutes of
ordinary two-device use, because the application-only Drive area does **not enforce name
uniqueness** and raised no error on either device. Both envelopes were listed afterwards, with
the same name and different identifiers. Nobody did anything wrong.

### Therefore: list before writing, and act on all three cases

On every device, **before writing any encrypted record**, list that area:

| Listing | What happens |
| --- | --- |
| **Empty** | Create — and only then. |
| **Exactly one** | **Adopt it, always.** Creating a second is forbidden. |
| **More than one** | **Surface it to the coach. Never resolve it by guessing.** |

The third case is the one no earlier version of this design had, and it is not hypothetical —
it is the state that was actually reached. A naive "adopt the first one" would look like a fix
and would still split the ciphertext, because the other device is meanwhile using the one that
was not picked. Nothing in this code has any information that could choose correctly, and
choosing wrong costs notes that cannot be recovered. So it stops, shows both, and asks for a
human.

### The same three cases apply to the recovery key

The non-uniqueness quirk belongs to the **space**, not to the envelope. The recovery key lives
there as its own object and is subject to it identically: two devices that each believe they
must establish recovery produce two recovery objects, silently.

That case is **worse** than the envelope one. A split envelope announces itself the first time
a device cannot read the other's notes — visible, early, annoying. An ambiguous recovery key
announces itself only when somebody actually tries to recover, on a new or wiped device, which
is precisely the moment there is no other copy and no way back. It is silent for exactly as
long as everything is working, and surfaces exactly when it cannot be fixed.

### A device that has never connected refuses

It cannot list, so it cannot know whether a key already exists, so it must not create one.
Being helpful here — generating a key so the coach is not blocked — is precisely how the split
happens, and there is no later moment at which the application could notice and merge them,
because both would be valid.

So such a device **refuses to create a clinical note** and says, in plain words, that it should
be connected once so it can share the same encryption details as the other device. That refusal
covers the clinical note **alone**. Everything else in the application keeps working offline
exactly as before, and nothing already entered is affected.

### Adding a slot is a remote write, with the same discipline

Adding a way in re-reads the envelope's revision immediately before writing and refuses if it
moved. Drive offers **no conditional write** — the revision, checksum and modification time are
all read-only outputs — so this is **detection after the fact, not a lock**, and the window
between the check and the write cannot be closed by any code here.

What is guaranteed is that a detected clash is never resolved silently: the other device's slot
is not destroyed, ours is not quietly dropped, and both sides are named so the interface can
show them. A slot lost without a word is a way back into the notes that the coach believes he
has and does not.

---

## What the tests prove, and what they do not

`node --test core/crypto` exercises all of the above against the in-memory double of the remote
storage port — including a genuine reproduction of the two-device split, both duplicate cases,
the offline refusal, the concurrent slot addition, and a wiped device reading back a note
sealed before the wipe.

**They prove our logic given the behaviour the double models. They prove nothing about the
platform.** No live Google call is made anywhere in this directory. The double is worth exactly
its fidelity to the measured quirks — it permits two same-name objects and offers no conditional
write precisely because the real service does the same — and no more than that.

---

## Files

| File | What it is |
| --- | --- |
| `crypto.js` | The module API. Import from here. |
| `primitives.js` | Thin named wrappers over the browser's own cryptography. The only place an algorithm or parameter appears. |
| `envelope.js` | The envelope document, its slots, and opening it by each of them. |
| `guard.js` | The adopt-never-create guard. The only road to creating a data key. |
| `sealing.js` | Field-level sealing, bound to the record model's own declaration of what is clinical. |
| `passphrase.js`, `wordlist.js` | The optional generated six-word phrase. |
| `device-key-store.js` | Where the device slot's key is held, and its in-memory double. |
| `errors.js` | The typed failures, each carrying wording written for the coach rather than for us. |
| `index.js` | The test entry point. Not the API, and never imported by the application. |

`newEnvelope` — the one function that brings a data key into existence — is deliberately **not**
on the module API. It is reachable only from the guard, only after a listing has proven the
space is empty. That is what makes "create a second key" something a later step is structurally
unable to do, rather than something it is merely told not to do.
